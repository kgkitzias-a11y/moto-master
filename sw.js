/* Moto Master service worker — versioned precache, cache-first, skipWaiting + clients.claim. */
const VERSION = '1.6.0';
const CACHE = `moto-master-${VERSION}`;
const PRECACHE = ["./","./index.html","./manifest.webmanifest","./src/app.js","./src/engine/chance.js","./src/engine/constants.js","./src/engine/events.js","./src/engine/planner.js","./src/engine/reducer.js","./src/engine/selection.js","./src/engine/session.js","./src/engine/shuffle.js","./src/engine/time.js","./src/store/db.js","./src/store/progress.js","./src/sync/gist.js","./src/sync/preferences.js","./src/ui/cards.js","./src/ui/certification.js","./src/ui/dom.js","./src/ui/final.js","./src/ui/fx.js","./src/ui/home.js","./src/ui/modes.js","./src/ui/planner.js","./src/ui/review.js","./src/ui/session.js","./src/ui/settings.js","./src/ui/setup.js","./src/ui/sheet.js","./src/ui/stats.js","./src/ui/styles.css","./src/vendor/jsQR.js","./src/vendor/qrcode.js","./src/version.js","./data/photos_manifest.json","./data/questions.json","./icons/apple-touch-icon-180.png","./icons/favicon-32.png","./icons/icon-192.png","./icons/icon-512-maskable.png","./icons/icon-512.png"];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Precache in chunks so one failing asset does not abort the whole install.
    for (const url of PRECACHE) {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { console.warn('precache miss', url); }
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // GitHub API etc. go straight to the network
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && (url.pathname.endsWith('/') || /\.(html|js|css|json|png|webmanifest|svg)$/.test(url.pathname))) cache.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') { const shell = await cache.match('./index.html') || await cache.match('./'); if (shell) return shell; }
      return new Response('offline', { status: 503, statusText: 'offline' });
    }
  })());
});
