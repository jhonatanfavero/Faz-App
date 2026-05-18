// V9.8 - v40.5.1-fix9 (REVERSÃO COMPLETA das fix7 e fix8 que adicionaram complexidade sem resolver bug. onOverlayClick voltou ao estado MAIS SIMPLES: if closeTopmostModal returns true → return, else closeAllSheets. ScheduleOverlayForceCheck removido. Se o bug persiste após este revert, é causado por outra coisa não relacionada ao handler do overlay. Estado idêntico à versão Navigation Hardening V40.5.0-fix7 ORIGINAL que estava em uso antes dos prints reportados.)
const CACHE_NAME = 'timeblock-v40-5-1-fix9';
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