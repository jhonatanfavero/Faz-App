// V5.9 - v40.3.4 (Redesign Lista: 2 sub-views (list + form), botão "+ Nova Tarefa" estilo FAB+, cards com ✋+🗑️ no início, checklist no item, edição via tap, stepper duração)
const CACHE_NAME = 'timeblock-v40-3-4';
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