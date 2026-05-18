// V9.3 - v40.5.1-fix4 (Espaço header reduzido em AMBOS os estados, com proteção pra notch/câmera: EXPANDIDO pt-12 (48px) → 16px (ganho 32px). RETRAÍDO 16px (fix3) → 12px (ganho 4px extra). Usa max(env(safe-area-inset-top), 16/12px) — em telas SEM notch fica compacto (16/12), em telas COM notch (iPhone 14 Pro Dynamic Island, Samsung S22 com câmera, Moto G) respeita automaticamente o tamanho real do notch. viewport-fit=cover já estava setado no meta. adjustTimelinePadding (50ms setTimeout) recalcula timeline padding dinamicamente em ambos estados via header.offsetHeight. 7/7 riscos mitigados.)
const CACHE_NAME = 'timeblock-v40-5-1-fix4';
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