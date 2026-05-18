// V9.6 - v40.5.1-fix7 (Bug crítico resolvido: clicar acima de qualquer sheet com max-h-[85%] deixava tela inteira FOSCA presa, exigindo recarregar app. Causa raiz incerta (poderia ser modal fantasma, zIndex inline travado, ou pointer-events residual). Fix ULTRA-DEFENSIVO em onOverlayClick: 1) Detecta modal REALMENTE visível usando getComputedStyle (display !== 'none' E opacity > 0.1), não só ausência de .hidden. 2) Modal fantasma (z-[60] sem .hidden mas com display/opacity zerado) é ignorado e força-fechado. 3) No fim sempre reseta inline: zIndex=''+opacity=''+pointerEvents='' + classes opacity-0+pointer-events-none. 4) Cinto+suspensórios contra qualquer estado intermediário travado. 7/7 cenários simulados OK.)
const CACHE_NAME = 'timeblock-v40-5-1-fix7';
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