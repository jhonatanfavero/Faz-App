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
// V10.23 - v40.21.0 (Metas, etapa 1, no celular e no PC: listas Pessoal, Profissional, Financeiro e as que a pessoa criar; metas por dia, semana ou mês contadas em vezes, minutos ou reais; botão + em cada meta; ⭐ estrelas, 🔥 sequência, pontos e níveis (Iniciante → Lenda). As regras ficam no metas.js, novo no cache. Vão pra nuvem nas tabelas metas_listas, metas e metas_dias. O Assistente passa a falar das metas.)
// V10.24 - v40.22.0 (Tela do PC: notas vinculadas no cartão do bloco da Agenda, as mesmas do app — vincular existente com busca, criar já vinculada, abrir, desvincular, ícone no bloco; apagar a nota solta o vínculo. Visão Dia com "Compactar vagos": horários vagos de 30 min ou mais viram uma faixa clicável e o resto continua arrastável. No celular: saiu o chip "Metas (em breve)" do botão + (as Metas ficam na aba 🎯).)
// V10.25 - v40.23.0 (Metas numa tela só, por categoria, no celular e no PC: sem pílulas nem colunas. Celular: título por categoria com ⋯ (renomear/apagar), "+ Meta em ..." na categoria vazia, "Nova categoria"; no formulário, "Categoria" com "+ Nova". PC: cartões em grade como as Rotinas, com título por categoria e "Nova categoria" no topo. "Lista" das metas passa a se chamar "categoria" (os dados são os mesmos).)
// V10.26 - v40.24.0 (Sublista na agenda, no celular e no PC: um bloco amarelinho e tracejado com vários cartões dentro no mesmo horário — o horário é da sublista; o cartão sai da Lista inteiro (tag, cor, checklist) e volta inteiro; marcar todos conclui; "Devolver os não feitos pra Lista". Celular: chip "Sublista" no +, tarefa na mão entra tocando na sublista, cartão abre no mesmo formulário da Lista. PC: "Novo bloco" como sublista, janela com os cartões, "Puxar da Lista". Nuvem: coluna blocos.cards. Celular: botão "Ocultar os vagos" (vago de 30 min ou mais vira uma faixa; tocar nela cria ali). A barra Editar/Duplicar/Arquivar/Apagar do bloco aberto cabe inteira no celular.)
// V10.27 - v40.25.0 (Desfazer e refazer no celular e no PC: toda mudança vira um passo — apagar, arquivar, agendar, mover, concluir, checklist, sublista, lista ou tag apagada com o que tinha dentro, metas, finanças, notas, rotinas, ordem dos cartões. Celular: barrinha "Desfazer" embaixo (some sozinha; com "Refazer" depois de desfazer). PC: Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z (Cmd no Mac), botões ↶ ↷ no topo com o nome do passo e aviso com Desfazer embaixo à esquerda ao apagar, arquivar ou mudar de lista. Desfazer só devolve o que continua como a ação deixou: se o outro aparelho mexeu depois, aquele item fica como está. O que vem da nuvem e o que nasce sozinho não viram passo. Sem mudança no banco.)
// V10.28 - v40.25.1 (Dois toques/cliques no horário vazio criam cartão. Celular: 2 toques no Tempo Livre abrem o + já na hora tocada (de 15 em 15 min; perto do fim do vago o cartão encosta no próximo bloco; a hora tocada vale mesmo antes de "agora"); 1 toque só explica (3 vezes); a faixa do "ocultar vagos" também passou a ser 2 toques. PC: Semana, 2 cliques na parte vazia do dia (ou embaixo de um dia curto) abrem o "Novo bloco" logo depois do bloco de cima; Dia, 2 cliques na hora (1 clique continua); o 2º clique de um clique duplo não fecha mais a janela que o 1º abriu nem marca/desmarca de novo.)
// V10.29 - v40.26.0 (Agenda afastada no celular: 2 ou 3 dias lado a lado, pela pinça (fechar os dedos mostra mais dias, abrir mostra menos, um nível por gesto) ou pelo botão de colunas na linha dos filtros (1 → 2 → 3). Régua de horas única, o nome de cada dia em cima da coluna dele, intervalo no topo ("15–17 nov"), blocos compactos (hora, nome, concluído, descanso, sublista, cor e tag), linha do agora na coluna de hoje. Tocar num bloco abre o dia dele em 1 dia, com o cartão aberto; tocar no nome do dia abre o dia; arrastar um dedo pro lado anda um dia; dois toques num vazio abrem o + naquele dia e hora; tarefa na mão solta em qualquer um dos dias (e na sublista). Filtros e busca continuam em lista; ocultar vagos vale só em 1 dia. Escolha guardada no aparelho (tb__agenda_dias). Linha dos filtros mais justa no celular (em 360/375 px o "Relatórios" fica só com o ícone).)
// V10.30 - v40.27.0 (Botão voltar do celular: volta uma tela (janelinha de cima pelo Cancelar dela, formulário e sub-tela pra tela de trás, Config pro +, fecha a tela, menu do zoom, tarefa na mão, busca, e volta pros dias lado a lado depois de abrir um dia tocando num bloco). Na agenda sem nada aberto avisa "Toque em voltar de novo pra sair"; o 2º voltar em até 3 s fecha o app. Pelo CloseWatcher (Chrome 120+; Esc no computador); sem ele, no Android, por uma entrada a mais no histórico. Os botões de voltar/fechar ganharam data-voltar no index.html. De quebra: tocar no fundo escuro fora de uma janelinha agora fecha ela pelo Cancelar, menos a que tem campo de digitar (antes não fechava nenhuma: o app procurava a janelinha pela classe z-[60], que os botões dos blocos e cartões também têm, e escondia esses botões). Sem mudança de dados.)
// V10.31 - v40.28.0 (Tela do PC, Agenda na Semana: puxar a borda de baixo do bloco muda a duração, como no Dia e no celular (5 min a cada 16 px, mínimo 5 min, até o próximo bloco; Esc desiste; Ctrl+Z desfaz). Arrastar um bloco no próprio dia agora mostra também os espaços livres de antes de agora (hoje), entre os outros cartões; o atalho do topo continua sendo o próximo livre. Sublista na Semana: o cartão sai arrastando pra um espaço tracejado e vira bloco (inteiro: nome, tag, cor, checklist, feito), muda de sublista arrastando, e um bloco arrastado pra cima de uma sublista vira cartão dela (com nota vinculada pergunta antes). Duplicar nos 3 pontinhos do bloco (a cópia entra logo depois dele). Celular sem mudança.)
// V10.32 - v40.29.0 (Tela do PC: botão Relatórios na barra da Agenda, com o "Produtividade" do celular: Hoje, 7 dias e 30 dias (terminando hoje; na visão Dia, no dia aberto), global feito/planejado e cada tag com feito, atrasado e pendente, pelas mesmas contas do renderReports do app. A Semana do PC passa a ser sempre de segunda a domingo (antes eram 7 dias a partir do dia de referência; o "Hoje" começava em hoje); com menos dias por tela, rola até o dia de hoje. Celular sem mudança.)
// V10.33 - v40.30.0 (Celular: cartão da sublista sai arrastando (segurar 400 ms; vira bloco num horário livre, com contorno do lugar, ou muda de sublista) e bloco arrastado pela alça entra na sublista (como o PC desde a V40.28.0). Despesa Recorrente sem fim, até encerrar (celular e PC): "Encerrar depois de <mês>" e "Repetir sem fim de novo"; as antigas de 12 meses viram sem fim na nuvem. Dica de instalar no iPhone fala dos ⋯ do iOS 26.)
// V10.34 - v40.31.0 (Celular, dias lado a lado: segurar um bloco e arrastar pra outro dia e/ou horário. O bloco vai com o dedo encaixado de 5 em 5 min, encosta no vago mais perto, fica vermelho quando não cabe, um balão diz o dia e a hora; em cima de uma sublista entra nela; parado na borda os dias andam. Um passo no Desfazer.)
// V10.35 - v40.32.0 (Tela do PC: botão Configurações (engrenagem) no topo, com a cor do app (as 8 do celular) e o horário do dia (Começa / Termina). Vale aqui e no celular, nos 2 sentidos: ganha a mudança mais nova (faz_prefs_at na conta; tb__prefs_at no celular). O celular confere a conta ao sincronizar (getUser) e avisa "Cor do app mudou no outro aparelho"; aparelho novo pega a cor e o horário da conta em vez do padrão. Abaixo de 1280 px as abas do PC ficam mais justas pra engrenagem caber até 1024 px.)
// V10.36 - v40.32.1 (iPhone instalado: as telas cheias (Listas, Config, +, Relatórios, Tags, Períodos...) respeitam a área segura de cima — o X de fechar ficava atrás da bateria, sem dar pra tocar; Config → Períodos: os campos Início e Fim não vazam mais do cartão no iPhone.)
const CACHE_NAME = 'timeblock-v40-32-1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './faz-config.js',
  './sync.js',
  './assistente.js',
  './metas.js',
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
