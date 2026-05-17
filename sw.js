// V7.1 - v40.4.4 (Finanças: Recorrente (12m) e Parcelada (N meses) ATIVADAS. Schema novo: durationMonths, isRecurring, paidMonths[], startMonth. Retrocompat total com despesas V40.4.1-3 (month, paid:bool). Subtítulos diferenciados (Avulsa/Recorrente/Parcela X/N). togglePaid agora marca paga só num mês específico. 15 armadilhas mapeadas e cobertas. Boot test em TZ='America/Sao_Paulo'. Próxima fase V40.4.5: renovação no último mês + modal 'atualizar essa/futuras/todas'.)
const CACHE_NAME = 'timeblock-v40-4-4';
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