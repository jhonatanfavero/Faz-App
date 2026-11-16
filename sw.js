// V10.6 - v40.5.1-fix17 (Header de Finanças reformulado. Mês + Total inline central (Total text-lg destaque), botão Hoje vira link discreto (era card botão). Pago + Em aberto viram 2 colunas inline (label esquerda + valor direita, text-base, py-2 px-2.5). Header de coluna acima dos cards (Despesa | Tipo | Dia | Valor) com text-[9px] zinc-400. Tudo em renderFinancial + index.html. ZERO mudança em renderFinancialCard ou lógica financeira. Antes: V10.5 - v40.5.1-fix16 — Cards compactos.)
// V10.7 - v40.6.0 (Backup e Restauração — Fase 1 Export/Import. Nova sub-view em Config: exporta TODAS as chaves tb_* num JSON via Web Share (Drive/email/WhatsApp) com fallback download; importa validando assinatura + rollback 1 nível + reload. Zero mudança em lógica existente. Ver app.js bloco V40.6.0.)
// V10.8 - v40.7.0 (Sincronização opcional das Listas — Fase 2 MVP. Novos arquivos sync.js + faz-config.js (no cache offline) e kanban.html (tela do PC, fora do cache). Fetch: só intercepta GET — gravações (POST/PATCH do Supabase) vão direto pra rede. localStorage continua intocado pelo SW.)
// V10.9 - v40.8.0 (Agenda na nuvem nos 2 sentidos + aba Agenda no PC; mínimo de 5 min; texto do usuário sempre escapado; leitura protegida do localStorage; esqueci a senha; ajustes só-iOS.)
// V10.10 - v40.9.0 (Cor livre do cartão na Lista e na agenda; Arquivados (arquivar/desarquivar) no app e no PC; PC arrasta bloco de um dia pro outro.)
// V10.11 - v40.9.1 (Listas afastadas no celular: botão da lupa ou pinça mostram várias listas lado a lado; segurar e arrastar leva o cartão de uma lista pra outra, com rolagem automática nas bordas. Redesenhar com a Lista aberta não joga mais a lista pro topo.)
const CACHE_NAME = 'timeblock-v40-9-1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './faz-config.js',
  './sync.js'
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
  if (e.request.method !== 'GET') return; // V40.7.0: gravações seguem direto pro navegador/rede
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
