# Hádej zvířata 🦓🔍

Mobilní hra (PWA): hádej zvířata a slavná místa z přiblížených, rozmazaných, rozpixelovaných nebo zakrytých fotek.

## Co umí

- **Režimy obrázku:** přiblížení, rozmazání, pixely, okénka (část políček je černá), odkrývání (políčka se odkrývají v čase), puzzle (přeházené dílky), mix, náhodně
- **4 obtížnosti**, které mění sílu zkreslení a násobí body
- **3 pokusy** a po každé chybě se obrázek může trochu zlehčit
- **Nápovědy po kouscích:** savec / není savec, skupina a potrava, kde žije, popis a nakonec počáteční písmeno s počtem písmen
- Tolerance diakritiky a překlepů
- **Přesnost odpovědi:** „Stačí zvíře“ (stačí *sojka*), nebo „I s druhem“ (musí být *sojka obecná*; za samotné „sojka“ přijde hláška „Skoro!“ a body jsou ×1,25)
- **Dva hráči** na jednom telefonu se střídají
- **Denní výzva:** 5 zvířat, stejných pro všechny, s výsledkem ke sdílení
- **Sbírka** uhodnutých zvířat a míst a **statistiky**
- Volitelný **časový limit** 60 s
- **Offline:** 204 zvířat je přímo v aplikaci a fotky 129 míst se při prvním spuštění stáhnou z Wikimedia Commons do telefonu
- **Online:** když je internet, přidá tisíce dalších zvířat s českými názvy z iNaturalist.org

## Instalace na mobil

Otevři adresu hry v prohlížeči:

- **iPhone (Safari):** Sdílet → *Přidat na plochu*
- **Android (Chrome):** ⋮ → *Přidat na plochu* / *Nainstalovat aplikaci*

Při prvním otevření s internetem se fotky stáhnou do telefonu (asi 25 MB). Pak hra funguje i bez připojení.

## Zveřejnění (GitHub Pages)

Settings → Pages → *Build and deployment* → Source: **Deploy from a branch** → vyber větev a složku `/ (root)` → Save.
Hra pak poběží na `https://<uživatel>.github.io/<repozitář>/`.

## Vývoj

Bez build kroku, čisté HTML/CSS/JS. Lokálně stačí `python3 -m http.server` a otevřít `http://localhost:8000`.

- `tools/animals.txt`, `tools/landmarks.txt`: seznam zvířat a míst (jména, synonyma, nápovědy)
- `tools/landmark_overrides.txt`: náhradní fotky míst, kde hlavní obrázek článku na Wikipedii není vhodný
- `tools/build_data.py`: stáhne fotky (iNaturalist / Wikimedia Commons, jen licence CC) a vygeneruje `data/*.js`
- `tools/make_icons.py`: vygeneruje ikonu aplikace
- `tools/build_icons.py`: vloží do `index.html` sadu ikon [Lucide](https://lucide.dev) (ISC)
- `fonts/`: písmo Nunito (OFL), licence jsou ve složce `licenses/`
- Po změně souborů aplikace zvyš `VERSION` v `sw.js`, aby se telefonům stáhla nová verze

Fotky: autoři a licence jsou uvedeny v aplikaci (Jak hrát → Autoři fotek) a v `data/*.js`.
