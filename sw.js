/* Service worker – aplikace funguje i bez internetu. */
const VERSION = 'v1.4.0';
const SHELL_CACHE = 'hz-shell-' + VERSION;
const IMG_CACHE = 'hz-img-v1';        // offline fotky (plní je stránka, viz app.js)
const ONLINE_CACHE = 'hz-online-v2';  // fotky z internetu, posledních pár desítek
const ONLINE_MAX = 80;

const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/packs.js',
  'js/photos.js',
  'js/distort.js',
  'js/match.js',
  'js/online.js',
  'js/app.js',
  'data/animals.js',
  'data/landmarks.js',
  'data/masks.js',
  'js/subject.js',
  'manifest.webmanifest',
  'img/world.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'fonts/nunito-latin-wght-normal.woff2',
  'fonts/nunito-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // staré cache (včetně hz-online-v1, kde mohly zůstat uložené chybové odpovědi)
    await Promise.all(keys.filter(k => (k.startsWith('hz-shell-') && k !== SHELL_CACHE) || k === 'hz-online-v1').map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // vlastní soubory: nejdřív z cache, jinak ze sítě
  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname.includes('/img/')) {
          const c = await caches.open(IMG_CACHE);
          c.put(req, res.clone());
        }
        // model a knihovna pro hledání zvířete na fotce – uloží se při prvním použití
        if (res.ok && /\/(vendor|models)\//.test(url.pathname)) {
          const c = await caches.open('hz-ml-v1');
          c.put(req, res.clone());
        }
        return res;
      } catch (err) {
        if (req.mode === 'navigate') return caches.match('index.html');
        throw err;
      }
    })());
    return;
  }

  // fotky z internetu (iNaturalist, Wikimedia): z cache, jinak stáhnout a uložit
  if (req.destination === 'image') {
    e.respondWith((async () => {
      // fotky míst uložené při prvním spuštění (hz-img-v1) nebo dříve hrané online fotky
      const hit = await caches.match(req.url);
      if (hit && (hit.ok || hit.type === 'opaque' && req.mode === 'no-cors')) return hit;
      // přes CORS, aby šlo poznat chybu (např. 429 – příliš mnoho požadavků) a neuložit ji
      const res = await fetch(new Request(req.url, { mode: 'cors', credentials: 'omit' }));
      if (res.ok) {
        const c = await caches.open(ONLINE_CACHE);
        c.put(req.url, res.clone()).then(() => trim(ONLINE_CACHE, ONLINE_MAX));
      }
      return res;
    })());
  }
  // API dotazy jdou rovnou na síť
});
