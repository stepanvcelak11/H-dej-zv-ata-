/* Naše fotky – vlastní fotky uložené jen v tomto zařízení (IndexedDB). */
(function () {
  'use strict';

  const DB = 'hz-photos', STORE = 'photos';
  const MAX_SIDE = 1400, THUMB = 360;
  let dbPromise = null;
  const urls = new Map(); // id → objectURL (velká fotka)
  const thumbUrls = new Map();

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  async function all() {
    const list = ((await run('readonly', s => s.getAll())) || []).filter(p => p && p.blob); // poškozené záznamy přeskočit
    return list.sort((a, b) => b.added - a.added);
  }
  const get = id => run('readonly', s => s.get(id));
  const put = p => run('readwrite', s => s.put(p));
  async function remove(id) {
    await run('readwrite', s => s.delete(id));
    if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
    if (thumbUrls.has(id)) { URL.revokeObjectURL(thumbUrls.get(id)); thumbUrls.delete(id); }
  }
  async function count() { return (await run('readonly', s => s.count())) || 0; }

  /** Načte fotku ze souboru. Vrací {src, w, h, close}. Preferuje ImageBitmap (šetří paměť). */
  async function decodeFile(file) {
    if ('createImageBitmap' in window) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close && bmp.close() };
      } catch (e) { /* zkusí to přes <img> */ }
    }
    return new Promise((resolve, reject) => {
      const u = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ src: img, w: img.naturalWidth, h: img.naturalHeight, close: () => { URL.revokeObjectURL(u); img.src = ''; } });
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('format')); };
      img.src = u;
    });
  }

  /** Nakreslí zdroj do canvasu dané max. velikosti */
  function drawScaled(src, w, h, max) {
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return c;
  }

  function canvasBlob(c, quality) {
    return new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('memory'))), 'image/jpeg', quality));
  }
  // uvolnit paměť canvasu hned (iPhone má na canvasy přísný limit)
  const freeCanvas = c => { c.width = 0; c.height = 0; };

  /**
   * Zmenší fotku a uloží ji. Vrací uložený záznam.
   * Chyby: 'format' (neznámý formát, např. HEIC v prohlížeči, který ho neumí), 'memory', 'storage'.
   */
  async function addFile(file) {
    const d = await decodeFile(file);
    let big, small;
    try {
      big = drawScaled(d.src, d.w, d.h, MAX_SIDE);
      d.close();
      small = drawScaled(big, big.width, big.height, THUMB); // náhled z už zmenšené fotky
      const blob = await canvasBlob(big, 0.85);
      const thumb = await canvasBlob(small, 0.75);
      const p = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        blob, thumb, caption: '', cx: 0.5, cy: 0.5, added: Date.now(),
      };
      try { await put(p); } catch (e) { throw new Error('storage'); }
      return p;
    } finally {
      d.close();
      if (big) freeCanvas(big);
      if (small) freeCanvas(small);
    }
  }

  function url(p) {
    if (!urls.has(p.id)) urls.set(p.id, p.blob ? URL.createObjectURL(p.blob) : '');
    return urls.get(p.id);
  }
  function thumbUrl(p) {
    if (!thumbUrls.has(p.id)) thumbUrls.set(p.id, (p.thumb || p.blob) ? URL.createObjectURL(p.thumb || p.blob) : '');
    return thumbUrls.get(p.id);
  }

  /** Požádá prohlížeč, ať data nemaže (hlavně kvůli fotkám). */
  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* nic */ }
    return false;
  }

  window.Photos = { all, get, put, remove, count, addFile, url, thumbUrl, persist };
})();
