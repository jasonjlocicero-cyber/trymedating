/* TryMeDating – tiny offline-first service worker */
const CACHE = "tmd-cache-v1";
const ASSETS = [
  "/",                 // SPA entry
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/logo-mark.png"
];

// Install: pre-cache shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate: cleanup old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

// Fetch: network-first for navigations, cache-first for same-origin static
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET
  if (req.method !== "GET") return;

  const isNavigation =
    req.mode === "navigate" ||
    (req.destination === "" && req.headers.get("accept")?.includes("text/html"));

  if (isNavigation) {
    // Network-first for SPA routes, fallback to offline.html
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Update cache copy of index.html implicitly via ASSETS if needed
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return cache.match("/offline.html");
        })
    );
    return;
  }

  // For same-origin static GETs: cache-first
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          // Optionally cache new static responses
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        }).catch(() => cached) // fallback to cache if fetch fails
      )
    );
  }
});
