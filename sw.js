// V6.6 - v40.3.8 (UX form Lista: Enter no título não salva mais — foca primeiro check (cria se necessário). Enter num check pula pro próximo (cria novo se for o último). Event delegation idempotente. focus({preventScroll:true}) respeita Regra de Ouro #2 do PWA Android.)
const CACHE_NAME = 'timeblock-v40-3-8';
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