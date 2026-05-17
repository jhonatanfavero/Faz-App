// V8.4 - v40.5.0-fix4 (Ajuste visual: largura das colunas 82%→78% + margens 1.5%→1% pra beiradinha da próxima coluna ficar mais PERCEPTÍVEL (~10% de cada lado visível). Conteúdo dos cards ainda confortável de ler dentro do 78%. Outros 3 ajustes da fix3 mantidos: 2 checks no preview, sem 'Sem checklist' nem divisor quando card vazio.)
const CACHE_NAME = 'timeblock-v40-5-0-fix4';
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