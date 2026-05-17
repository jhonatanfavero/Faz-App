// V8.0 - v40.5.0 (KANBAN na aba Lista: colunas horizontais com swipe nativo (scroll-snap), coluna "Geral" padrão sempre presente, criar/renomear/apagar listas, apagar lista apaga tarefas com confirmação robusta, "+ Nova Tarefa" adiciona na coluna ativa, retrocompat total com tarefas V40.4.x sem columnId. SEM drag entre colunas. 15 armadilhas mapeadas e mitigadas. Boot test 23/23 + 8 cenários simulados OK. Outras abas (Rotinas/Notas/Finanças) intactas.)
const CACHE_NAME = 'timeblock-v40-5-0';
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