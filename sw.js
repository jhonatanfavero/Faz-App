// V10.5 - v40.5.1-fix16 (Cards de Finanças compactos. renderFinancialCard refatorado: layout vira linha única alinhada [check] [título truncate] [pílula R/parcela 28px] [dia numeral 28px] [valor R$ 82px] [lixeira]. Altura ~150px → ~50px (~60% mais cards na tela). Pílula R lilás só em Recorrentes; pílula X/N amarela só em Parceladas; Avulsa sem pílula. Dia numeral muda pra vermelho se vencido. Tag colorida vira borda-esquerda 4px (em vez de colorir ícone $ que foi removido). Preserva opacity-60+line-through ao pagar, borda vermelha ao vencer. ZERO mudança em lógica financeira ou storage. Antes: V10.4 - v40.5.1-fix15 — Modal escopo de edição de valor.)
const CACHE_NAME = 'timeblock-v40-5-1-fix16';
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
