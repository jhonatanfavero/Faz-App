// V10.1 - v40.5.1-fix12 (Resolve teclado cobrindo input via meta tag viewport interactive-widget=resizes-content. Side-effect da fix10 (sheets h-full) era que viewport não tinha pra onde empurrar a view ao abrir teclado, então input ficava coberto. Solução cirúrgica de 1 palavra na meta tag — Chrome 108+ resize Layout Viewport quando teclado abre. Zero JS, preserva viewport-fit=cover (fix6), preserva bala de prata V40.2.17, zero impacto em drag de microblocks. Antes: V10.0 - v40.5.1-fix11 — desligado popstate handler que causava 'tela fosca presa' ao apertar voltar Android em sub-views.)
const CACHE_NAME = 'timeblock-v40-5-1-fix12';
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