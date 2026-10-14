/* Service worker: network first, so a deploy shows up on the next load
   instead of mixing new HTML with cached old CSS/JS (GitHub Pages lets
   browsers reuse files for 10 minutes). Falls back to the saved copy offline. */

const CACHE = 'tuner-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    try {
      // 'no-cache' = always ask the server (a cheap 304 when nothing changed)
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
