// V9.5 - v40.5.1-fix6 (Padding-top do EXPANDIDO 12px → 20px (+8px) — visualmente igual ao retraído sem mexer no retraído. User reportou que no expandido o texto 'Segunda' parecia encostado na linha vermelha (provavelmente devido ao conteúdo abaixo TAGs/Progress 'puxar' visualmente). Solução: 2 regras CSS com :not(.header-collapsed) e .header-collapsed pra aplicar valor diferente conforme presença da classe. RETRAÍDO 12px INTOCADO. !important garante prioridade absoluta no retraído. max(env(), 20px) respeita notch automaticamente.)
const CACHE_NAME = 'timeblock-v40-5-1-fix6';
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