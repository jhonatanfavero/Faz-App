// V6.7 - v40.4.1 (MVP Aba Financeiro: 4ª pill 'Finanças', cadastrar despesa avulsa + listar + somar mês atual + delete com modal. Em breve: V40.4.2 recorrente/parcelada, V40.4.3 navegação por mês, V40.4.4 edição inteligente, V40.4.5 renovação, V40.4.6 relatório+tags.)
const CACHE_NAME = 'timeblock-v40-4-1';
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