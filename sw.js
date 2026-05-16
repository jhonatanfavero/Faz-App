// V6.2 - v40.3.5-fix2 (FIX CRÍTICO TDZ: expandedBacklogIds e expandedRoutineIds movidas pro topo do arquivo. Eram declaradas DEPOIS de renderBacklog/renderRoutinesList ser chamado no init → ReferenceError fatal que parava o boot → botão Lista, toggleHeader e ocultação do pensamento do dia não funcionavam. Mesma lição do desastre TDZ V40.3.2 com mbDragActive.)
const CACHE_NAME = 'timeblock-v40-3-5-fix2';
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