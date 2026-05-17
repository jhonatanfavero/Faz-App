// V9.0 - v40.5.1-fix1 (5 ajustes visuais: 1) Sheet das 4 abas h-[92%] → h-full (ocupa tela inteira). 2) Cards do Kanban Lista w-full (mesma largura das Rotinas/Notas/Finanças) — perde beiradinha lateral, mas DOTS embaixo do header indicam múltiplas listas. Wrapper sem -mx-6. 3) Reduzido gap entre título da coluna e dots/cards: header pb-0 (era pb-2), dots py-1 (era py-2) = 16px ganhos. 4) Label da aba "Lista" → "Listas" (plural condizente com kanban). 5) REMOVIDO ícone clipboard dos cards de Lista — ganha ~50px pro título caber inteiro. Indicador de TAG preservado via BORDA ESQUERDA colorida (4px) — sem ocupar largura horizontal. Outras abas (Rotinas/Notas/Finanças) intactas.)
const CACHE_NAME = 'timeblock-v40-5-1-fix1';
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