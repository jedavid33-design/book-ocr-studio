const CACHE_NAME = "book-ocr-studio-shell-v94";
const APP_SHELL = [
  "./styles.css?v=71",
  "./epub-polish.js?v=58",
  "./crop-preflight.js?v=254",
  "./message-bubbles.js?v=256",
  "./scene-ornaments.js?v=257",
  "./chapter-opening-audit.js?v=258",
  "./word-boundary-audit.js?v=259",
  "./unified-book-audit.js?v=260",
  "./ocr-first-pass.js?v=261",
  "./epub-visual-preview.js?v=262",
  "./prioritized-qa-queue.js?v=263",
  "./qa-review-inspection.js?v=267",
  "./qa-bakeoff-core.js?v=264",
  "./qa-bakeoff-ui.js?v=266",
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
    if (response && response.ok) {
      const cacheCopy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cacheCopy)).catch(() => {});
    }
    return response;
  })));
});
