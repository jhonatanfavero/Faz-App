// V10.2 - v40.5.1-fix13 (POC: refatora backlog-form-view de absolute bottom-0 + pb-24 pra layout flex shrink-0 honesto. Resolve teclado cobrindo input ativo dentro da Editar Tarefa após meta tag da fix12 fazer viewport encolher. Mudanças no index.html: 1) remove relative do container pai (não tem mais absolute filho); 2) pb-24 → pb-4 no scroll middle; 3) absolute bottom-0 left-0 right-0 → shrink-0 no footer Salvar. Mantém pb-6 (safe-area). Se POC funcionar, replicar em routines-form-view, financial-form-view e notes-form na fix14. Antes: V10.1 - v40.5.1-fix12 — meta tag interactive-widget=resizes-content.)
const CACHE_NAME = 'timeblock-v40-5-1-fix13';
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