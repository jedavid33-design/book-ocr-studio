const CACHE_NAME = "book-ocr-studio-shell-v2-7-12-recovery-sections";
const APP_SHELL = [
  "./styles.css?v=2.7.12-recovery-sections",
  "./epub-polish.js?v=2.7.12-recovery-sections",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  // Never let an old app shell pin index/JS. These are network-first so a new
  // deploy actually runs the new reconstruction code immediately.
  if (url.pathname.endsWith("/") || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/script-loader.js") || url.pathname.endsWith("/script.js")) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).catch(() => caches.match(event.request)));
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response && response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
    return response;
  })));
});
