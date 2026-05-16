// V5.8 - v40.3.3 (Carimbar Rotinas Fase 2: botão ✋ no card de rotina → pendingIntent + blocos pulsantes + encaixe + card retraído com microblocks. getMaxGapForDay valida espaço antes.)
const CACHE_NAME = 'timeblock-v40-3-3';
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