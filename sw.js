// V7.0 - v40.4.3-fix (FIX CRÍTICO Fuso Horário pego pelo Gemini: toISOString() retorna UTC, então 21h+ no fim do mês no Brasil (UTC-3) já era "dia seguinte mês seguinte" → todas despesas viravam atrasadas prematuramente. Substituído por getLocalMonthStr() em 4 lugares.)
const CACHE_NAME = 'timeblock-v40-4-3-fix';
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