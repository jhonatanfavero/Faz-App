// V8.5 - v40.5.0-fix5 (Eliminado as 'listras brancas' laterais do kanban: backlog-columns-wrapper ganhou -mx-6 pra estourar pra fora do p-6 da sheet. Coluna agora ocupa ~78% da tela inteira (não da sheet com padding), beiradinha das vizinhas ~11% de cada lado mais perceptível. Header, dots e botão Nova Tarefa continuam alinhados dentro do padding da sheet. Outras abas (Rotinas/Notas/Finanças) intactas.)
const CACHE_NAME = 'timeblock-v40-5-0-fix5';
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