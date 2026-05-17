// V8.2 - v40.5.0-fix2 (BUG REAL: swipe rápido pulava 2+ listas porque scroll-snap-type: mandatory deixa o browser usar inércia. Fix: adicionado snap-always (scroll-snap-stop: always) em cada coluna — força o browser a parar em CADA coluna mesmo com swipe rápido. CSS nativo, respeita diretriz 2 do Gemini, zero JS. Outras diretrizes 1, 3, 4 já OK.)
const CACHE_NAME = 'timeblock-v40-5-0-fix2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => 
      Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});