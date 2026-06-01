// Service Worker — cache static assets for offline use
const CACHE = 'anime-wall-v1';
const ASSETS = [
  './',
  'style.css',
  'script.js',
  'assets/emoji.js',
  'assets/fallback-cover.svg',
  'manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Stale-while-revalidate for covers + data
  if(e.request.url.includes('/covers/') || e.request.url.includes('/data/')){
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(e.request).then(cached =>
          cached || fetch(e.request).then(resp => {
            if(resp.ok) cache.put(e.request, resp.clone());
            return resp;
          })
        )
      )
    );
    return;
  }
  // Cache-first for static assets
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
