/* on-camp, offline service worker */
const CACHE = 'scout-v208';
const CORE = [
  './',
  './index.html',
  './assets/ios.css',
  './assets/icons.svg',
  './assets/fonts/lato-400.woff2',
  './assets/fonts/lato-700.woff2',
  './assets/fonts/noto-400.woff2',
  './assets/fonts/noto-400i.woff2',
  './assets/fonts/noto-700.woff2',
  './share.js',
  './app.js',
  './data/parks.js',
  './data/park-pins.js',
  './data/ecosystem.js',
  './map.js',
  './manifest.json',
  './parks-data.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Cache-first with background refresh; runtime-caches fonts; offline navigation fallback. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined));
      return cached || network;
    })
  );
});
