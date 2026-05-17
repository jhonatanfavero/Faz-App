// V7.3 - v40.4.4-fix2 (Notas faltou padronizar completo no fix anterior: view-notes ganhou bg-zinc-50/50 overflow-hidden, header e container ganharam px-4 pt-4, form de nota ganhou mx-4, botão Nova Nota ganhou mx-4 mb-4. Agora as 4 abas (Lista/Rotinas/Notas/Finanças) são visualmente idênticas em altura, fundo e padding.)
const CACHE_NAME = 'timeblock-v40-4-4-fix2';
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