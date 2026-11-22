/* Online zdroje: iNaturalist (zvířata s českými názvy) a Wikipedie (místa, zajímavosti). */
(function () {
  'use strict';

  const INAT = 'https://api.inaturalist.org/v1';
  const OK_LIC = new Set(['cc0', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'cc-by-nc-sa']);

  // skupiny iNaturalistu → naše skupiny; váha = jak často vybírat; pages = kolik stránek populárních druhů
  const CLASSES = [
    { id: 40151, group: 'savec', weight: 5, pages: 6 },
    { id: 3, group: 'pták', weight: 4, pages: 8 },
    { id: 26036, group: 'plaz', weight: 2, pages: 3 },
    { id: 20978, group: 'obojživelník', weight: 1, pages: 2 },
    { id: 47178, group: 'ryba', weight: 2, pages: 3 },
    { id: 47158, group: 'hmyz', weight: 2, pages: 3 },
    { id: 47119, group: 'pavoukovec', weight: 1, pages: 1 },
    { id: 47115, group: 'měkkýš', weight: 1, pages: 1 },
  ];
  const ICONIC = {
    Mammalia: 'savec', Aves: 'pták', Reptilia: 'plaz', Amphibia: 'obojživelník', Actinopterygii: 'ryba',
    Insecta: 'hmyz', Arachnida: 'pavoukovec', Mollusca: 'měkkýš',
  };

  const LS_POOL = 'hz.onlinePool.v1';
  const LS_DETAIL = 'hz.onlineDetail.v1';

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* plné úložiště */ } }

  async function getJSON(url, ms = 9000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  const stripHtml = s => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const firstSentences = (s, n = 2) => {
    const parts = stripHtml(s).match(/[^.!?]+[.!?]+/g) || [stripHtml(s)];
    return parts.slice(0, n).join(' ').trim();
  };

  function pickClass(groups) {
    const list = CLASSES.filter(c => !groups || groups.includes(c.group) ||
      (groups.includes('ostatní') && ['pavoukovec', 'měkkýš'].includes(c.group)));
    if (!list.length) return null;
    const total = list.reduce((a, c) => a + c.weight, 0);
    let r = Math.random() * total;
    for (const c of list) { if ((r -= c.weight) <= 0) return c; }
    return list[0];
  }

  function toItem(t, group) {
    const p = t.default_photo;
    const name = t.preferred_common_name.trim();
    const alts = [];
    return {
      id: 'inat-' + t.id,
      theme: 'animals',
      online: true,
      name: name.charAt(0).toLowerCase() + name.slice(1),
      alts,
      sci: t.name,
      en: t.english_common_name || '',
      group: ICONIC[t.iconic_taxon_name] || group,
      img: p.medium_url.replace(/\/medium\./, '/large.'),
      thumb: p.medium_url,
      credit: p.attribution,
      license: p.license_code,
      source: 'https://www.inaturalist.org/taxa/' + t.id,
      inat: t.id,
    };
  }

  /** Načte (a uloží) stránku populárních druhů se jménem v češtině */
  async function loadPage(cls, page, place) {
    const pool = lsGet(LS_POOL, {});
    const key = cls.id + ':' + page + (place ? '@' + place : '');
    if (pool[key] && Date.now() - pool[key].at < 14 * 864e5) return pool[key].items;
    const url = `${INAT}/taxa?rank=species&locale=cs&per_page=200&order_by=observations_count&order=desc` +
      `&taxon_id=${cls.id}&photos=true&is_active=true&page=${page}` + (place ? `&place_id=${place}` : '');
    const d = await getJSON(url, 12000);
    const items = d.results
      .filter(t => t.preferred_common_name && t.default_photo && OK_LIC.has(t.default_photo.license_code) && !t.extinct)
      .map(t => toItem(t, cls.group));
    pool[key] = { at: Date.now(), items };
    // drží jen pár stránek, ať nezabírá moc místa
    const keys = Object.keys(pool);
    if (keys.length > 14) keys.sort((a, b) => pool[a].at - pool[b].at).slice(0, keys.length - 14).forEach(k => delete pool[k]);
    lsSet(LS_POOL, pool);
    return items;
  }

  /**
   * Náhodné zvíře z internetu, které není v offline balíčku.
   * @param {string[]} groups povolené skupiny
   * @param {Set<string>} exclude vědecké názvy a id, které nechceme
   */
  async function randomAnimal(groups, exclude, place) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cls = pickClass(groups);
      if (!cls) return null;
      // první stránky (nejznámější druhy) mají větší šanci
      const pages = place ? Math.max(1, Math.ceil(cls.pages / 2)) : cls.pages;
      const page = 1 + Math.floor(Math.pow(Math.random(), 1.6) * pages);
      const items = await loadPage(cls, page, place);
      const ok = items.filter(i => !exclude.has(i.sci.toLowerCase()) && !exclude.has(i.id));
      if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
    }
    return null;
  }

  /** Doplňující info pro nápovědy a zajímavost (řád, čeleď, wikipedie) */
  async function animalDetail(inatId) {
    const cache = lsGet(LS_DETAIL, {});
    if (cache[inatId]) return cache[inatId];
    const d = await getJSON(`${INAT}/taxa/${inatId}?locale=cs`);
    const t = d.results[0];
    const anc = {};
    (t.ancestors || []).forEach(a => { if (a.preferred_common_name) anc[a.rank] = a.preferred_common_name.toLowerCase(); });
    const info = {
      class: anc.class || null,
      order: anc.order || null,
      family: anc.family || null,
      fact: t.wikipedia_url && /cs\.wikipedia/.test(t.wikipedia_url) ? firstSentences(t.wikipedia_summary, 3) : '',
      wiki: t.wikipedia_url || '',
    };
    cache[inatId] = info;
    const keys = Object.keys(cache);
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => delete cache[k]);
    lsSet(LS_DETAIL, cache);
    return info;
  }

  /** Obrázek a odkaz na českou Wikipedii pro místo */
  async function landmarkImage(item) {
    const key = 'hz.wiki.' + item.id;
    const c = lsGet(key, null);
    if (c) return c;
    const url = 'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1' +
      '&prop=pageimages|langlinks&piprop=thumbnail|name&pithumbsize=960&lllang=cs&titles=' + encodeURIComponent(item.wiki);
    const d = await getJSON(url);
    const page = Object.values(d.query.pages)[0];
    if (!page || !page.thumbnail) return null;
    const res = {
      img: page.thumbnail.source,
      file: page.pageimage,
      cs: page.langlinks && page.langlinks[0] ? page.langlinks[0]['*'] : null,
    };
    lsSet(key, res);
    return res;
  }

  /** Krátká zajímavost z české Wikipedie */
  async function wikiFact(csTitle) {
    if (!csTitle) return '';
    const key = 'hz.fact.' + csTitle;
    const c = lsGet(key, null);
    if (c !== null) return c;
    const d = await getJSON('https://cs.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(csTitle.replace(/ /g, '_')));
    const fact = firstSentences(d.extract, 3);
    lsSet(key, fact);
    return fact;
  }

  function isOnline() { return navigator.onLine !== false; }

  /** Adresy mapových dlaždic iNaturalistu (zoom 1 = 4 dlaždice) s místy pozorování druhu */
  function mapTiles(taxonId) {
    const out = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      out.push({ x, y, src: `${INAT}/grid/1/${x}/${y}.png?taxon_id=${taxonId}&color=%23e8590c&opacity=0.85` });
    }
    return out;
  }

  window.Online = { randomAnimal, animalDetail, landmarkImage, wikiFact, isOnline, mapTiles };
})();
