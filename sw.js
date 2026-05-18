// V10.0 - v40.5.1-fix11 (Opção A: DESLIGADA a Navigation Hardening (popstate handler do V40.5.0-fix7) que estava causando bug de 'tela fosca presa' ao apertar botão voltar do Android em sub-views (Aparência, Períodos, Kanban Lista). Causa raiz: closeTopmostLayer não detectava sub-views de config-sheet (config-appearance-view, config-periods-view, config-hours-view) — só conhecia backlog/routines/financial forms. + condição quebrada com closeTopmostModal === null que sempre era false. + ID 'sheet' não existia (deveria ser 'bottom-sheet'). Solução pragmática: comentar listener inteiro + transformar pushNavState em no-op. Botão voltar Android volta ao comportamento padrão do PWA (fecha app). User usa X das sheets pra fechar.)
const CACHE_NAME = 'timeblock-v40-5-1-fix11';
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