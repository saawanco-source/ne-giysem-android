// Ne Giysem? service worker: keeps the app shell and its fonts available offline.
// Weather and location requests always go to the network; the page keeps the last result itself. Nothing outside the
// site is touched here (the page itself may talk only to its own server and a few weather and map services).
const SHELL_CACHE = "negiysem-shell-v15";
// The app itself is kept as "./" (the site answers /index.html with a redirect to /).
const SHELL = [
  "./",
  "./forecast-lib.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.svg",
  "./fonts/instrument-serif-latin-regular.woff2",
  "./fonts/instrument-serif-latin-ext-regular.woff2",
  "./fonts/instrument-serif-latin-italic.woff2",
  "./fonts/instrument-serif-latin-ext-italic.woff2",
  "./fonts/figtree-latin-wght.woff2",
  "./fonts/figtree-latin-ext-wght.woff2"
];

// A page reached through a redirect (e.g. gizlilik.html -> /gizlilik) can't answer a later page load as it is, so it is
// kept as a plain copy.
function plain(res) {
  return res.redirected ? res.blob().then((b) => new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers })) : Promise.resolve(res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE)
    .then((c) => Promise.all(SHELL.map((u) => fetch(u, { cache: "reload" }).then((r) => {
      if (!r.ok) throw new Error("precache " + u + ": " + r.status);
      return plain(r).then((p) => c.put(u, p));
    }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  // Older shells and the old Google Fonts cache go.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(request, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) cache.put(request, res.clone());
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
  if (url.origin !== self.location.origin) return; // straight to the network

  // The app's own server (weather, place search): always fresh from the network, never cached here.
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // The app itself: fresh when online, the saved copy when offline. Other pages (the privacy policy): fresh, or
    // their own saved copy, never stored as the app.
    const app = url.pathname === "/" || url.pathname.endsWith("/index.html");
    // The privacy pages are kept under their name without ".html" (the address the site redirects them to).
    const key = app ? "./" : url.pathname.replace(/\.html$/, "");
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => plain(copy).then((p) => c.put(key, p)));
          }
          return res;
        })
        .catch(() => caches.match(key).then((r) => r || caches.match("./")))
    );
    return;
  }
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});
