/* Moto Master service worker — versioned precache, cache-first, skipWaiting + clients.claim. */
const VERSION = '__VERSION__';
const CACHE = `moto-master-${VERSION}`;
const PRECACHE = self.__PRECACHE__ || [];

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
