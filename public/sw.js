/* Minimal PWA SW for TryMeDating
   - Fast install (skipWaiting/clientsClaim)
   - Navigation fallback to index.html for offline routing
   Upgrade path: Workbox/vite-plugin-pwa for precaching & runtime strategies.
*/
const CACHE = 'tmd-appshell-v1';
const APP_SHELL = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Keep it simple: for navigation requests, try network, fall back to cached index.
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
  }
});
