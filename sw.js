// V8.9 - v40.5.1 (2 features pro kanban Lista: 1) Botão "Mover pra outra lista" (ícone setas) no card, entre Agendar e Apagar. Só aparece se >1 lista. Abre modal com lista de destinos (exclui atual). 2) Drag vertical MVP: long-press 400ms num card inicia drag, arrasta vertical, solta em outro = reordena. touch-action durante drag evita conflito com swipe horizontal entre colunas. Sem polish (animação suave, scroll auto). 10 armadilhas M1-M4 + D1-D10 mapeadas e mitigadas. Boot test 23/23. 6 cenários de reorder simulados.)
const CACHE_NAME = 'timeblock-v40-5-1';
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