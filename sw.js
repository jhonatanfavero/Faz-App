// V8.3 - v40.5.0-fix3 (3 ajustes: 1) Beiradinha SIMÉTRICA em todas as colunas — w-[88%] + mr-3 trocado por w-[82%] + mx-[1.5%]: agora primeira/meio/última têm a mesma beiradinha visível de cada lado. 2) Preview de checks 3 → 2 nos cards de Lista e Rotinas (cards 1 linha menores). 3) Cards SEM checklist agora NÃO mostram texto 'Sem checklist' nem divisor horizontal (card fica visualmente mais limpo e menor). Notas não tem microblocks, então não afetada.)
const CACHE_NAME = 'timeblock-v40-5-0-fix3';
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