// V7.2 - v40.4.4-fix (3 ajustes UX: 1) Toast z-50 → z-[70] pra aparecer acima das sheets e modais — validações invisíveis agora aparecem. 2) list-sheet max-h 85% → 92% aproveita mais tela. 3) Botão de adicionar nota padronizado: removido '+' pequeno do header, adicionado botão tracejado '+ Nova Nota' no rodapé igual Lista/Rotinas/Finanças.)
const CACHE_NAME = 'timeblock-v40-4-4-fix';
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