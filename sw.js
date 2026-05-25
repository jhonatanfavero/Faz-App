// V10.3 - v40.5.1-fix14 (V40.4.5 Fase 1 — Helpers de override de valor por mês para despesas Recorrente/Parcelada. Schema novo: item.paidMonthsOverrides = {'YYYY-MM': {amount}}. 4 helpers adicionados ao app.js: getAmountInMonth (lê valor com fallback ao item.amount), setOverrideForMonth (1 mês), setOverrideThisAndFuture (este+futuros respeitando endMonth), setAmountAllMonths (limpa overrides). 39 assertions Node passaram com TZ='America/Sao_Paulo'. Read paths atualizados: renderFinancialCard, totais do renderFinancial, openFinancialForm. ZERO mudança visual/funcional pro user — helpers dormentes esperando fix15 (modal + saveFinancialForm refatorado). Retrocompat total com despesas antigas sem paidMonthsOverrides. Antes: V10.2 - v40.5.1-fix13 — POC backlog-form-view flex shrink-0.)
const CACHE_NAME = 'timeblock-v40-5-1-fix14';
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
