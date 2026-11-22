/* Porovnání odpovědi – toleruje diakritiku, velká písmena a drobné překlepy. */
(function () {
  'use strict';

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function tolerance(len) {
    if (len <= 3) return 0;
    if (len <= 6) return 1;
    if (len <= 11) return 2;
    return 3;
  }

  const firstWord = s => norm(s).split(' ')[0];

  /**
   * strict = musí se uhodnout i druh (např. "sojka obecná").
   * V přísném režimu se vyřadí synonyma, která jsou jen obecným slovem z názvu (např. "orel" u "orel skalní").
   */
  function candidates(item, strict) {
    let alts = item.alts || [];
    if (strict) {
      const multi = [item.name, ...alts].filter(a => norm(a).includes(' '));
      const generic = new Set(multi.map(firstWord));
      alts = alts.filter(a => norm(a).includes(' ') || !generic.has(norm(a)));
    }
    const list = [item.name, ...alts];
    if (item.sci) list.push(item.sci);
    if (item.en) list.push(item.en);
    return [...new Set(list.map(norm).filter(Boolean))];
  }

  /**
   * Vrátí 'correct' | 'close' | 'wrong'
   * close = uhodl jen obecné slovo (např. "orel" místo "orel skalní")
   */
  function check(guess, item, opts = {}) {
    const g = norm(guess);
    if (!g) return 'wrong';
    const gc = g.replace(/ /g, '');
    const strict = !!opts.strict;
    const cands = candidates(item, strict);
    // volný režim: stačí obecný název zvířete (první slovo, např. "sojka" pro "sojka obecná")
    if (!strict && item.theme === 'animals') {
      cands.filter(c => c.includes(' ')).forEach(c => {
        const w = c.split(' ')[0];
        if (w.length >= 3 && !cands.includes(w)) cands.push(w);
      });
    }
    for (const c of cands) {
      const cc = c.replace(/ /g, '');
      if (gc === cc) return 'correct';
      if (lev(gc, cc) <= tolerance(cc.length)) return 'correct';
    }
    // částečná shoda – jedno ze slov názvu (alespoň 4 znaky)
    const words = new Set();
    cands.forEach(c => c.split(' ').forEach(w => { if (w.length >= 4) words.add(w); }));
    const gw = g.split(' ');
    for (const w of words) {
      for (const x of gw) {
        if (x.length >= 4 && lev(x, w) <= tolerance(w.length) - 1 + (w.length > 6 ? 1 : 0)) return 'close';
      }
    }
    return 'wrong';
  }

  /** Najde položku z databáze, kterou hráč asi myslel (pro zpětnou vazbu) */
  function findItem(guess, items) {
    const g = norm(guess).replace(/ /g, '');
    if (g.length < 3) return null;
    for (const it of items) {
      for (const c of candidates(it)) {
        if (c.replace(/ /g, '') === g) return it;
      }
    }
    return null;
  }

  window.Match = { norm, lev, check, findItem };
})();
