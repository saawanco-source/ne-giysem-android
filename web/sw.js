// Ne Giysem? service worker: keeps the app shell and fonts available offline.
// Weather and location requests always go to the network; the page keeps the last result itself.
const SHELL_CACHE = "negiysem-shell-v13";
const FONT_CACHE = "negiysem-fonts-v1";
const SHELL = [
  "./",
  "./index.html",
  "./forecast-lib.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  const keep = [SHELL_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app's own server (weather, place search): always fresh from the network, never cached here.
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return;

  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") {
      // Fresh page when online, cached page when offline.
      event.respondWith(
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(SHELL_CACHE).then((c) => c.put("./index.html", copy));
            }
            return res;
          })
          .catch(() => caches.match("./index.html"))
      );
      return;
    }
    event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(req, FONT_CACHE));
  }
  // Everything else (Open-Meteo, BigDataCloud) goes straight to the network.
});
