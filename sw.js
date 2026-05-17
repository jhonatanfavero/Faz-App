// V7.5 - v40.4.4-fix4 (UX: ao dar Enter num check da Lista/Rotina, ele rolava com preventScroll (Regra de Ouro #2) e ficava escondido atrás do teclado Android. Agora função scrollNewCheckIntoView rola APENAS o container interno do form pra trazer o novo check à vista — não rola a página (evita 'buraco branco'). Posiciona em ~1/3 do scroller pra ficar bem acima do teclado.)
const CACHE_NAME = 'timeblock-v40-4-4-fix4';
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