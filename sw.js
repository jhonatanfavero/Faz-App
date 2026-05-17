// V6.8 - v40.4.2 (Finanças: marcar despesa como paga (checkbox no card + no form), 2 seções A Pagar/Pagas, 3 totais destacados Total/Pago/Aberto, navegação entre meses com setas + botão Hoje condicional. Recorrente/Parcelada permanecem desabilitados — V40.4.3.)
const CACHE_NAME = 'timeblock-v40-4-2';
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