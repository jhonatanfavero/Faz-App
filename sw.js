// V9.7 - v40.5.1-fix8 (REVERTI fix7 ultra-defensiva que não resolveu + nova abordagem com SALVAGUARDA REAL: scheduleOverlayForceCheck() agendado em onOverlayClick E closeAllSheets. 350ms depois (> transition 300ms), verifica se há algo legitimamente aberto; se não, FORÇA limpeza completa do overlay (opacity-0 + pointer-events-none + reseta zIndex/opacity/pointerEvents inline). Bug reportado: clicar fora de Config/Aparência travava tela toda fosca + deslocava botões inferiores. Causa raiz incerta mas agora IMPOSSÍVEL travar: máximo 350ms e overlay é forçado. Idempotente via clearTimeout. 5/5 cenários cobertos.)
const CACHE_NAME = 'timeblock-v40-5-1-fix8';
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