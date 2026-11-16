// V10.6 - v40.5.1-fix17 (Header de Finanças reformulado. Mês + Total inline central (Total text-lg destaque), botão Hoje vira link discreto (era card botão). Pago + Em aberto viram 2 colunas inline (label esquerda + valor direita, text-base, py-2 px-2.5). Header de coluna acima dos cards (Despesa | Tipo | Dia | Valor) com text-[9px] zinc-400. Tudo em renderFinancial + index.html. ZERO mudança em renderFinancialCard ou lógica financeira. Antes: V10.5 - v40.5.1-fix16 — Cards compactos.)
// V10.7 - v40.6.0 (Backup e Restauração — Fase 1 Export/Import. Nova sub-view em Config: exporta TODAS as chaves tb_* num JSON via Web Share (Drive/email/WhatsApp) com fallback download; importa validando assinatura + rollback 1 nível + reload. Zero mudança em lógica existente. Ver app.js bloco V40.6.0.)
// V10.8 - v40.7.0 (Sincronização opcional das Listas — Fase 2 MVP. Novos arquivos sync.js + faz-config.js (no cache offline) e kanban.html (tela do PC, fora do cache). Fetch: só intercepta GET — gravações (POST/PATCH do Supabase) vão direto pra rede. localStorage continua intocado pelo SW.)
// V10.9 - v40.8.0 (Agenda na nuvem nos 2 sentidos + aba Agenda no PC; mínimo de 5 min; texto do usuário sempre escapado; leitura protegida do localStorage; esqueci a senha; ajustes só-iOS.)
// V10.10 - v40.9.0 (Cor livre do cartão na Lista e na agenda; Arquivados (arquivar/desarquivar) no app e no PC; PC arrasta bloco de um dia pro outro.)
// V10.11 - v40.9.1 (Listas afastadas no celular: botão da lupa ou pinça mostram várias listas lado a lado; segurar e arrastar leva o cartão de uma lista pra outra, com rolagem automática nas bordas. Redesenhar com a Lista aberta não joga mais a lista pro topo.)
// V10.12 - v40.10.0 (Fonte, ícones e Supabase passam a vir da pasta libs/ do próprio app, com versão travada, e entram no cache offline junto com um Tailwind já pronto (libs/tailwind.css): o app abre com o visual completo sem internet. O script do Tailwind pelo CDN continua, pra classe nova funcionar sem build.)
// V10.13 - v40.11.0 (Tela do PC: o bloco da Agenda abre no cartão completo, com editar e concluir; botão "Agendar" leva a tarefa das Listas pra Agenda; "Voltar pra lista" faz o caminho contrário. No celular nada muda além do número da versão, que agora é o mesmo nas duas telas.)
// V10.14 - v40.12.0 (Tela do PC: calendário e hora próprios, sempre em português e em 24h; botão da "mão" leva a tarefa pra aba Agenda pra clicar no dia e horário livre onde quer colocar, como no app. No celular só muda o número da versão.)
// V10.15 - v40.13.0 (Tela do PC: criar bloco novo direto na Agenda — botão "Novo bloco", "Adicionar bloco" em cada dia da semana e clique num horário vazio na visão Dia. No celular só muda o número da versão.)
// V10.16 - v40.14.0 (Tela do PC, aba Agenda: na visão Dia dá pra arrastar o bloco pra outro horário e puxar a borda de baixo pra mudar a duração, com as regras do app (de 5 em 5 min, sem sobrepor); na Semana, ao arrastar, os espaços livres de cada dia viram lugar de soltar. No celular só muda o número da versão.)
// V10.17 - v40.15.0 (Tela do PC: 3 pontinhos no cartão das Listas e no bloco da Semana, com Arquivar e Apagar sem abrir o cartão; ao arrastar um cartão ou bloco aparece no topo o campo "Solte aqui pra arquivar". No celular só muda o número da versão.)
// V10.18 - v40.16.0 (Celular, Listas: o zoom ganhou níveis — 1, 1½, 2 ou 3 listas por tela. A lupa abre o menu com os quatro; a pinça muda um nível por gesto. O nível fica guardado no aparelho (tb__lista_zoom), fora do backup e da nuvem. Na tela do PC só muda o número da versão.)
// V10.19 - v40.17.0 (Rotinas, Notas e Finanças vão pra nuvem nos dois sentidos (tabelas rotinas, notas e financas). Tela do PC ganha as abas Rotinas e Notas (criar, editar, apagar; rotina vai pra Agenda pela mão; nota salva sozinha) e, na Agenda, filtro por tag e "Ocultar concluídos". No celular, as rotinas de exemplo só nascem em aparelho novo.)
// V10.20 - v40.18.0 (Tela do PC: janela de Tags — criar, renomear, trocar a cor e apagar (quem usava a tag fica sem tag), também pelo "Gerenciar tags" de dentro do cartão e da rotina; quem começa pelo computador ganha as tags Trabalho, Pessoal e Estudo, com os mesmos ids do app. Zoom das Listas e da Semana (−, 100%, + e Ctrl + rodinha), cada um guardado no computador. No celular só muda o número da versão.)
// V10.21 - v40.19.0 (Tela do PC: aba Finanças — mês a mês, total, pago, em aberto e atrasadas; pagar, criar, editar com "só neste mês / neste e nos próximos / em todos", trocar o tipo e apagar, com as regras do app. Setas ← → do teclado: Agenda passa a semana ou o dia, Listas rolam uma lista, Finanças trocam o mês. Celular: editar uma despesa de vários meses sem mudar o valor não apaga mais os valores por mês.)
// V10.22 - v40.20.0 (Assistente, a primeira aba no celular e no PC: versão padrão, sem IA paga e sem internet — lê agenda, listas, rotinas, notas e finanças e responde sobre o dia, agora, amanhã, a semana, o que ficou pra trás, contas, rotinas, notas e listas; o "cérebro" é o assistente.js, novo no cache. PC: zoom vira "listas por tela" / "dias por tela" (colunas mais largas em vez de tudo maior) e, na Semana com menos dias, as setas andam um dia por vez.)
const CACHE_NAME = 'timeblock-v40-20-0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './faz-config.js',
  './sync.js',
  './assistente.js',
  './libs/tailwind.css',
  './libs/inter/inter.css',
  './libs/inter/inter-latin-wght-normal.woff2',
  './libs/phosphor/regular/style.css',
  './libs/phosphor/regular/Phosphor.woff2',
  './libs/phosphor/bold/style.css',
  './libs/phosphor/bold/Phosphor-Bold.woff2',
  './libs/phosphor/fill/style.css',
  './libs/phosphor/fill/Phosphor-Fill.woff2',
  './libs/supabase-js/supabase.js'
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
