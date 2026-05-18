// V9.2 - v40.5.1-fix3 (Reversão da fix2 + abordagem correta: REVERTIDO pt-12 do header HTML (expandido estava CORRETO, não devia ter mexido). Mudança real: style.css .header-collapsed padding-top 32px → 16px. Resultado: estado RETRAÍDO ganha 16px (Sábado fica colado na linha vermelha), estado EXPANDIDO mantém pt-12 original. adjustTimelinePadding já recalcula timeline padding via header.offsetHeight dinamicamente em ambos os estados.)
const CACHE_NAME = 'timeblock-v40-5-1-fix3';
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