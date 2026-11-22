#!/usr/bin/env python3
"""Stáhne fotky pro offline balíček a vygeneruje data/animals.js a data/landmarks.js.

Zvířata: iNaturalist (jen fotky s licencí Creative Commons, bez ND).
Památky: Wikipedie / Wikimedia Commons.

Použití:  python3 tools/build_data.py [animals|landmarks|all]
Už stažené fotky se přeskočí (smaž soubor v img/ pro nové stažení).
"""
import io, json, os, re, sys, time, unicodedata, urllib.parse, urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "ZoomGuessGame/1.0 (hobby educational game; python urllib)"
OK_LICENSES = {"cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"}
MAX_SIDE = 900
QUALITY = 74
CACHE_FILE = os.path.join(ROOT, "tools", ".cache.json")


def load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


CACHE = load_cache()


def save_cache():
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(CACHE, f, ensure_ascii=False, indent=0)


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def get(url, binary=False, tries=8):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:  # noqa
            wait = 15 * (i + 1)
            print(f"   ! {e} ({url[:90]}) – zkusím znovu za {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("nepodařilo se stáhnout " + url)


def save_image(data, path):
    im = Image.open(io.BytesIO(data))
    im = im.convert("RGB")
    im.thumbnail((MAX_SIDE, MAX_SIDE), Image.LANCZOS)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return im.size


def parse(path, ncols):
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            parts += [""] * (ncols - len(parts))
            rows.append(parts)
    return rows


# ---------------------------------------------------------------- zvířata
def inat_taxon(sci):
    key = "inat:" + sci
    if key in CACHE:
        return CACHE[key]
    q = urllib.parse.quote(sci)
    res = get(f"https://api.inaturalist.org/v1/taxa?q={q}&locale=cs&per_page=30"
              "&rank=species,subspecies,variety,form")["results"]
    time.sleep(1.0)
    hit = next((r for r in res if r["name"].lower() == sci.lower()), None)
    if not hit:
        res2 = get(f"https://api.inaturalist.org/v1/taxa/autocomplete?q={q}&locale=cs&per_page=10")["results"]
        time.sleep(1.0)
        hit = next((r for r in res2 if r["name"].lower() == sci.lower()), None)
    if not hit:
        hit = res[0] if res else None
        print(f"   ? přesná shoda pro {sci} nenalezena, beru {hit and hit['name']}")
    if not hit:
        return None
    detail = get(f"https://api.inaturalist.org/v1/taxa/{hit['id']}?locale=cs")["results"][0]
    time.sleep(1.0)
    photos = []
    for tp in detail.get("taxon_photos", []):
        p = tp["photo"]
        photos.append({
            "id": p["id"],
            "license": p.get("license_code"),
            "attribution": p.get("attribution"),
            "url": p.get("medium_url") or p.get("url"),
        })
    info = {
        "id": hit["id"],
        "name": hit["name"],
        "cs": detail.get("preferred_common_name"),
        "iconic": detail.get("iconic_taxon_name"),
        "photos": photos,
    }
    CACHE[key] = info
    save_cache()
    return info


def build_animals():
    rows = parse(os.path.join(ROOT, "tools", "animals.txt"), 7)
    out, seen = [], set()
    for n, (name, alts, sci, group, region, diet, hint) in enumerate(rows, 1):
        sid = slug(name)
        assert sid not in seen, "duplicitní zvíře " + name
        seen.add(sid)
        print(f"[{n}/{len(rows)}] {name} ({sci})", flush=True)
        info = inat_taxon(sci)
        if not info:
            print("   ✗ taxon nenalezen – přeskakuji")
            continue
        override = CACHE.get("photo:" + sid)  # ruční výběr jiné fotky
        photos = info["photos"]
        if override is not None:
            photos = [p for p in photos if p["id"] == override] + photos
        photo = next((p for p in photos if p["license"] in OK_LICENSES), None)
        if not photo:
            print("   ✗ žádná fotka s vhodnou licencí – přeskakuji")
            continue
        rel = f"img/a/{sid}.jpg"
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path) or CACHE.get("done:" + sid) != photo["id"]:
            url = re.sub(r"/(square|small|medium|thumb|original)\.", "/large.", photo["url"])
            size = save_image(get(url, binary=True), path)
            CACHE["done:" + sid] = photo["id"]
            save_cache()
            print(f"   ✓ {size[0]}×{size[1]}  {photo['license']}")
        out.append({
            "id": sid,
            "name": name,
            "alts": [a for a in alts.split(";") if a],
            "sci": sci,
            "group": group,
            "region": region,
            "diet": diet,
            "hint": hint,
            "img": rel,
            "credit": photo["attribution"],
            "license": photo["license"],
            "source": f"https://www.inaturalist.org/photos/{photo['id']}",
            "inat": info["id"],
        })
    write_js("animals", out)


# ---------------------------------------------------------------- památky
def wiki_image(title):
    key = "wiki:" + title
    if key in CACHE:
        return CACHE[key]
    t = urllib.parse.quote(title)
    d = get("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
            f"&prop=pageimages&piprop=thumbnail|name&pithumbsize=960&titles={t}")
    time.sleep(3)
    page = next(iter(d["query"]["pages"].values()))
    if "thumbnail" not in page:
        CACHE[key] = None
        return None
    fname = page["pageimage"]
    m = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
            "&iiprop=extmetadata&titles=" + urllib.parse.quote("File:" + fname))
    time.sleep(3)
    meta = {}
    for p in m.get("query", {}).get("pages", {}).values():
        meta = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})

    def mv(k):
        v = meta.get(k, {}).get("value", "")
        return re.sub(r"<[^>]+>", "", v).strip()

    info = {
        "thumb": page["thumbnail"]["source"],
        "file": fname,
        "artist": mv("Artist") or "neznámý autor",
        "license": mv("LicenseShortName") or "viz zdroj",
    }
    CACHE[key] = info
    save_cache()
    return info


def build_landmarks():
    rows = parse(os.path.join(ROOT, "tools", "landmarks.txt"), 8)
    out, seen = [], set()
    for n, (name, alts, wiki, country, cont, kind, hint, online) in enumerate(rows, 1):
        sid = slug(name)
        assert sid not in seen, "duplicitní místo " + name
        seen.add(sid)
        item = {
            "id": sid, "name": name, "alts": [a for a in alts.split(";") if a],
            "wiki": wiki, "country": country, "continent": cont, "kind": kind, "hint": hint,
        }
        if online == "1":
            item["online"] = True
            out.append(item)
            continue
        print(f"[{n}/{len(rows)}] {name} ({wiki})", flush=True)
        info = wiki_image(wiki)
        if not info:
            print("   ✗ bez obrázku – bude jen online")
            item["online"] = True
            out.append(item)
            continue
        rel = f"img/l/{sid}.jpg"
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            url = info["thumb"].split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/")
            url = re.sub(r"/\d+px-", "/960px-", url)
            size = save_image(get(url, binary=True, tries=6), path)
            time.sleep(2)
            print(f"   ✓ {size[0]}×{size[1]}  {info['license']}")
        item.update({
            "img": rel,
            "credit": info["artist"],
            "license": info["license"],
            "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(info["file"]),
        })
        out.append(item)
    write_js("landmarks", out)


def write_js(kind, items):
    path = os.path.join(ROOT, "data", kind + ".js")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    var = {"animals": "DATA_ANIMALS", "landmarks": "DATA_LANDMARKS"}[kind]
    with open(path, "w", encoding="utf-8") as f:
        f.write("// Vygenerováno skriptem tools/build_data.py – needitovat ručně.\n")
        f.write(f"window.{var} = ")
        json.dump(items, f, ensure_ascii=False, indent=0)
        f.write(";\n")
    print(f"→ {path}: {len(items)} položek")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("animals", "all"):
        build_animals()
    if what in ("landmarks", "all"):
        build_landmarks()
