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
            wait = 30 * (i + 1)
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
def wiki_batch(titles):
    """Zjistí obrázky a licence pro všechna místa hromadně (po 50), ať nás Wikimedia neblokuje."""
    missing = [t for t in titles if "wiki:" + t not in CACHE]
    for i in range(0, len(missing), 50):
        chunk = missing[i:i + 50]
        d = get("https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&pilimit=50"
                "&prop=pageimages&piprop=thumbnail|name&pithumbsize=960&titles="
                + urllib.parse.quote("|".join(chunk)))
        time.sleep(3)
        q = d["query"]
        back = {}
        for m in q.get("normalized", []) + q.get("redirects", []):
            back[m["to"]] = back.get(m["from"], m["from"])
        pages = {}
        for p in q["pages"].values():
            orig = p.get("title")
            while orig in back:
                orig = back[orig]
            pages[orig] = p
        files = {}
        for t in chunk:
            p = pages.get(t)
            if p and "thumbnail" in p:
                files[t] = p
            else:
                CACHE["wiki:" + t] = None
                print("   ✗ bez obrázku:", t)
        names = ["File:" + p["pageimage"] for p in files.values()]
        meta = {}
        for j in range(0, len(names), 50):
            m = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo"
                    "&iiprop=extmetadata&titles=" + urllib.parse.quote("|".join(names[j:j + 50])))
            time.sleep(3)
            norm = {x["to"]: x["from"] for x in m["query"].get("normalized", [])}
            for p in m["query"]["pages"].values():
                meta[norm.get(p["title"], p["title"])] = (p.get("imageinfo") or [{}])[0].get("extmetadata", {})

        def mv(md, k):
            v = md.get(k, {}).get("value", "")
            return re.sub(r"<[^>]+>", "", v).strip()

        for t, p in files.items():
            md = meta.get("File:" + p["pageimage"], {})
            url = p["thumbnail"]["source"].split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/")
            url = re.sub(r"/\d+px-", "/960px-", url)
            CACHE["wiki:" + t] = {
                "thumb": url,
                "file": p["pageimage"],
                "artist": mv(md, "Artist") or "neznámý autor",
                "license": mv(md, "LicenseShortName") or "viz zdroj",
            }
        save_cache()


def commons_search(query):
    """Najde fotku na Wikimedia Commons podle hledaného výrazu (náhrada za nevhodný obrázek článku)."""
    key = "commons:" + query
    if key in CACHE:
        return CACHE[key]
    d = get("https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search"
            "&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=960&gsrsearch="
            + urllib.parse.quote(query + " filetype:bitmap"))
    time.sleep(3)
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
    for p in pages:
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") != "image/jpeg" or not ii.get("thumburl"):
            continue
        md = ii.get("extmetadata", {})
        mv = lambda k: re.sub(r"<[^>]+>", "", md.get(k, {}).get("value", "")).strip()
        info = {
            "thumb": ii["thumburl"].split("?")[0],
            "file": p["title"].split(":", 1)[1],
            "artist": mv("Artist") or "neznámý autor",
            "license": mv("LicenseShortName") or "viz zdroj",
        }
        CACHE[key] = info
        save_cache()
        return info
    return None


def build_landmarks():
    rows = parse(os.path.join(ROOT, "tools", "landmarks.txt"), 8)
    wiki_batch([r[2] for r in rows])
    for wiki, query in parse(os.path.join(ROOT, "tools", "landmark_overrides.txt"), 2):
        info = commons_search(query)
        print(f"   ↻ {wiki}: {info and info['file']}")
        if info:
            CACHE["wiki:" + wiki] = info
            sid = next((slug(r[0]) for r in rows if r[2] == wiki), None)
            if sid and os.path.exists(os.path.join(ROOT, f"img/l/{sid}.jpg")):
                os.remove(os.path.join(ROOT, f"img/l/{sid}.jpg"))
    save_cache()
    out, seen = [], set()
    local_ok = remote = 0
    for n, (name, alts, wiki, country, cont, kind, hint, online) in enumerate(rows, 1):
        sid = slug(name)
        assert sid not in seen, "duplicitní místo " + name
        seen.add(sid)
        info = CACHE.get("wiki:" + wiki)
        if not info:
            continue
        rel = f"img/l/{sid}.jpg"
        path = os.path.join(ROOT, rel)
        # pokusí se fotku uložit přímo do aplikace; když Wikimedia nedovolí,
        # aplikace si ji stáhne sama při prvním spuštění na telefonu
        if not os.path.exists(path) and online != "1" and "--download" in sys.argv:
            try:
                save_image(get(info["thumb"], binary=True, tries=1), path)
                time.sleep(2)
            except Exception:
                pass
        info["thumb"] = info["thumb"].split("?")[0].replace("//thumb.wikimedia.org/", "//upload.wikimedia.org/")
        if os.path.exists(path):
            img = rel
            local_ok += 1
        else:
            img = info["thumb"]
            remote += 1
        out.append({
            "id": sid, "name": name, "alts": [a for a in alts.split(";") if a],
            "wiki": wiki, "country": country, "continent": cont, "kind": kind, "hint": hint,
            "img": img,
            "credit": info["artist"],
            "license": info["license"],
            "source": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(info["file"]),
        })
    print(f"místa: {local_ok} fotek v aplikaci, {remote} se stáhne do telefonu při prvním spuštění")
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
