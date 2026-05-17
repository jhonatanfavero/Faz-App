// V8.8 - v40.5.0-fix8 (2 fixes críticos: 1) Extremidades do kanban NÃO cortam mais: removido px-[11%] do wrapper, primeira coluna ganha ml-[11%] e última ganha mr-[11%] direto no render — centralização perfeita sem corte. 2) Bug crítico do agendar: scheduleBacklogItem APAGAVA a tarefa do backlog imediatamente; se user cancelasse o picker de horário, sumia pra sempre. Agora guarda fromBacklogId no pendingIntent e SÓ apaga em performEncaixeMatematico (= confirmar). Cancelar mantém tarefa intacta.)
const CACHE_NAME = 'timeblock-v40-5-0-fix8';
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