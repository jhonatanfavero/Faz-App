// V10.4 - v40.5.1-fix15 (V40.4.5 Fase 2 FINAL — Modal de escopo "Atualizar valor em" + saveFinancialForm refatorado. Quando user edita VALOR de despesa Recorrente/Parcelada, abre modal com 3 opções: Apenas este mês (default, override single), Este mês e futuros (override loop até endMonth), Todos os meses (atualiza item.amount global e limpa overrides). Avulsa salva direto. typeChanged reseta paidMonths + overrides. cleanupOverridesOutsideRange remove lixo se durationMonths reduz (F3/F10). 42 assertions Node passaram com TZ='America/Sao_Paulo'. Novo helper G20 cleanupOverridesOutsideRange. Novo state _pendingFinSave guarda dados durante modal. Novas funções: openEditScopeModal, confirmEditScope, cancelEditScope, applyFinancialItemUpdate. Antes: V10.3 - v40.5.1-fix14 — Helpers de override dormentes.)
const CACHE_NAME = 'timeblock-v40-5-1-fix15';
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
