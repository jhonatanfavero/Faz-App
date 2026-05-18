// V9.1 - v40.5.1-fix2 (Ajuste visual: header pt-12 → pt-4 reduz ~32px de espaço vazio no topo da tela. 'Sábado, 16 mai' fica colado na linha do app (status bar do Android reserva seu espaço fora do viewport). Timeline padding-top é recalculado automaticamente pelo JS adjustTimelinePadding via offsetHeight do header. Resultado: +32px de área útil pra ver mais blocos da agenda.)
const CACHE_NAME = 'timeblock-v40-5-1-fix2';
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