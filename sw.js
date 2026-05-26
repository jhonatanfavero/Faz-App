// V10.6 - v40.5.1-fix17 (Header de Finanças reformulado. Mês + Total inline central (Total text-lg destaque), botão Hoje vira link discreto (era card botão). Pago + Em aberto viram 2 colunas inline (label esquerda + valor direita, text-base, py-2 px-2.5). Header de coluna acima dos cards (Despesa | Tipo | Dia | Valor) com text-[9px] zinc-400. Tudo em renderFinancial + index.html. ZERO mudança em renderFinancialCard ou lógica financeira. Antes: V10.5 - v40.5.1-fix16 — Cards compactos.)
const CACHE_NAME = 'timeblock-v40-5-1-fix17';
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
