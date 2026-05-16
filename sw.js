// V6.5 - v40.3.7-fix (Fixes do Gemini na V40.3.7: 6 sheets com header tinham X duplicado ou bloco isolado feio. Headers refeitos pra fundir título+X numa única linha em config/period/tags/clone/reports/link-note. bottom-sheet e list-sheet mantém X em barra própria — não têm título.)
const CACHE_NAME = 'timeblock-v40-3-7-fix';
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