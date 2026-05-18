// V9.4 - v40.5.1-fix5 (UNIFICAÇÃO do padding-top: expandido e retraído agora têm padding-top IDÊNTICO (12px). Antes era 16px expandido / 12px retraído — diferença visualmente perceptível. Agora 'Segunda, 18 mai' fica na MESMA distância da linha vermelha em ambos os estados, respeitando notch automaticamente via max(env(safe-area-inset-top), 12px). A única diferença visual entre expandido/retraído continua sendo: mb-4 do div interno (que cria o espaço pra mostrar TAGs/Relatórios/PLANEJADO), e padding-bottom (16px expandido vs 4px retraído).)
const CACHE_NAME = 'timeblock-v40-5-1-fix5';
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