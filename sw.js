// V8.7 - v40.5.0-fix7 (NAVIGATION HARDENING — 2 bugs UX críticos antes da V40.5.1: 1) Overlay inteligente: clique no fundo escuro com modal aberto agora fecha SÓ o modal (não fecha sheet inteira indo pra agenda). Helper getOpenModal() detecta z-[60] aberto, closeTopmostModal() fecha só ele. 2) History API: botão voltar do Android agora intercepta — fecha modal > form > sheet > toast 'toque voltar de novo' (2s) > fecha app. pushNavState() idempotente em 19 lugares: 8 sheets + 6 modais + 5 helpers. 15 armadilhas N1-N15 mapeadas e mitigadas. Simulação lógica 4/4 cenários OK. Boot test 23/23.)
const CACHE_NAME = 'timeblock-v40-5-0-fix7';
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