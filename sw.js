// V7.4 - v40.4.4-fix3 (UX: list-sheet com ALTURA FIXA h-[92%] em vez de max-h — as 4 abas (Lista/Rotinas/Notas/Finanças) agora têm sempre a mesma altura independente do conteúdo. Botões '+ Nova X' reduzidos de py-3.5 pra py-2.5 + ícone text-lg pra text-base + adicionado text-sm na fonte = mais elegantes, ocupam menos espaço.)
const CACHE_NAME = 'timeblock-v40-4-4-fix3';
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