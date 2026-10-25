/*
 * Keeps the game's own files in the browser so later visits start at once and the game still opens without a connection.
 *
 * - Files with a hash in their name (/assets/...) never change, so they are saved once and always read from the browser.
 * - The page itself and other files are read from the browser at once and refreshed from the network in the background,
 *   so an update arrives on the next visit.
 * Only this site's own files are kept. Nothing else is touched.
 */
const CACHE = 'zgame-files-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith('zgame-files-') && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const immutable = url.pathname.includes('/assets/');
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit && immutable) return hit;
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(refresh);
        return hit;
      }
      const res = await refresh;
      if (res) return res;
      // Offline and never saved: fall back to the saved page for navigations
      if (req.mode === 'navigate') {
        const page = await cache.match(self.registration.scope);
        if (page) return page;
      }
      return Response.error();
    })(),
  );
});
