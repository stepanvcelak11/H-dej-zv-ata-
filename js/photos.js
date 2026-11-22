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
    const list = (await run('readonly', s => s.getAll())) || [];
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

  function loadFileImage(file) {
    return new Promise((resolve, reject) => {
      const u = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(u) });
      img.onerror = () => { URL.revokeObjectURL(u); reject(new Error('Fotku se nepodařilo načíst')); };
      img.src = u;
    });
  }

  function toBlob(img, max, quality) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const k = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * k); c.height = Math.round(h * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, 'image/jpeg', quality));
  }

  /** Zmenší fotku a uloží ji. Vrací uložený záznam. */
  async function addFile(file) {
    const { img, release } = await loadFileImage(file);
    try {
      const [blob, thumb] = await Promise.all([toBlob(img, MAX_SIDE, 0.86), toBlob(img, THUMB, 0.75)]);
      const p = {
        id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        blob, thumb, caption: '', cx: 0.5, cy: 0.5, added: Date.now(),
      };
      await put(p);
      return p;
    } finally { release(); }
  }

  function url(p) {
    if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
    return urls.get(p.id);
  }
  function thumbUrl(p) {
    if (!thumbUrls.has(p.id)) thumbUrls.set(p.id, URL.createObjectURL(p.thumb || p.blob));
    return thumbUrls.get(p.id);
  }

  /** Požádá prohlížeč, ať data nemaže (hlavně kvůli fotkám). */
  async function persist() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* nic */ }
    return false;
  }

  window.Photos = { all, get, put, remove, count, addFile, url, thumbUrl, persist };
})();
