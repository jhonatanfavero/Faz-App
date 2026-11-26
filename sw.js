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
// V10.37 - v40.32.2 (Revisão do iPhone: percorri todas as telas com a barra de status e o risco de início do iPhone 13 e do 13 mini simulados. Agenda: o nome do dia não fica mais cortado ("Quarta, 18 r") — encurta pra "Qua, 18" quando não cabe; Assistente: o campo de perguntar sobe acima do risco de início. Teste novo tests/navegador/iphone.js.)
// V10.38 - v40.33.0 (Mudar a ordem das listas arrastando, no celular e no PC. Celular: segurar o nome da lista 400 ms e arrastar pro lado — no zoom afastado vale o título de cada lista; no modo normal o nome lá em cima, e o quadro se afasta sozinho (3 por tela) só durante o arrasto; a lista anda com o dedo, o espaço tracejado mostra onde ela cai e perto da borda o quadro rola. Menu da lista (3 pontinhos): Esquerda / Direita, uma casa por toque, com "Posição 2 de 5"; o Cancelar virou Fechar. PC: arrastar a lista pelo título (linha em pé no vão onde ela cai) e Mover pra esquerda/direita no menu. Só a posição da lista movida vai pra nuvem; o Desfazer chama de "Lista mudou de lugar". Conserto: desfazer só a ordem (cartão ou lista que trocou de lugar) dizia "Não deu pra desfazer" e perdia o Refazer.)
// V10.39 - v40.34.0 (Metas, etapa 2: bloco, tarefa, rotina e cartão da sublista ligados a uma meta, no celular e no PC. Escolhe a meta no + (ou na edição do bloco, na tarefa, na rotina, no cartão da sublista); a meta vai junto quando a tarefa ou a rotina vira bloco, quando o bloco volta pra lista, entra ou sai de uma sublista e ao duplicar. Bloco (ou cartão) concluído conta sozinho na meta, no dia dele, como um toque no + (em minutos, o tempo dele), com o mesmo aviso de estrela; nada é gravado nos dias da meta. Selo com o emoji da meta antes do nome. Gráfico em cada meta: últimos 7 dias, 8 semanas ou 6 meses, com a linha da meta, recorde e total. Mudar o alvo guarda o alvo antigo nos períodos que só tinham blocos; recomeçar a contagem guarda o dia (count_from). Nuvem: goal_id em tarefas, blocos e rotinas; count_from nas metas.)
// V10.40 - v40.35.0 (Busca na agenda do PC: um campo "Buscar na agenda" na barra procura em todos os dias no nome, no checklist, nos cartões da sublista e na tag, sem ligar pra acento; clicar abre o bloco e leva a agenda até o dia. Abaixo de 1280 px (Semana) ou 1536 px (Dia) os botões Ocultar concluídos, Compactar vagos e Relatórios ficam só com o ícone, pra barra caber numa linha. No celular a busca passa a olhar também o checklist dos cartões da sublista e aceita palavras soltas, e o nome do dia no topo é medido de novo quando a fonte termina de carregar ("Sex, 20 nov" ficava cortado no iPhone mini).)
// V10.41 - v40.36.0 (PC: Repetir bloco, o "Repetir Tarefa" do celular: nos 3 pontinhos, "Repetir…" abre a janela com Todo dia / Toda semana / Todo mês e quantas vezes (5, 4 e 2 pra começar); cópias no mesmo horário, com checklist e cartões desmarcados; o dia em que o horário já está ocupado fica de fora (a lista mostra antes). Os 3 pontinhos (Duplicar, Repetir, Arquivar, Apagar) agora também na visão Dia.)
// V10.42 - v40.36.1 (Celular: o "Repetir Tarefa" igual ao do PC: o dia em que o horário já está ocupado fica de fora (a janelinha mostra antes, com −/+ e o resumo), "Mensalmente" no dia 31 vai pro último dia do mês, a cópia segue o horário (sem o atraso do original), no máximo 60/52/24 e um passo só do Desfazer. Copiar leva a cor. Cartão de 26 a 36 min sem a fatia do checklist (nome em 2 linhas). Botões do pé acima da barra de navegação do Android. "+ Meta em …" em toda categoria. Meta escolhida sem nome = nome da meta (celular e PC). Ocultar vagos com 2 ou 3 dias.)
// V10.43 - v40.37.0 (Sublista de metas: no menu de cada categoria das Metas (no PC, o calendário no título dela), "Pôr na agenda" põe na mão uma sublista com o nome da categoria e um cartão por meta, ligado a ela (marcar conta na meta); toca/clica num horário livre e ela entra. Com o Repetir vai pros outros dias.)
// V10.44 - v40.38.0 (Voltar pra lista: o bloco (e o cartão da sublista) volta pra lista de onde veio; se ela não existe mais, ou o bloco nasceu na agenda, vai pra primeira lista (a da esquerda). Antes ia sempre pra Geral. O mesmo no PC; a lista de origem vai pra nuvem.)
// V10.45 - v40.39.0 (Busca nas Listas, no celular e no PC: filtra as próprias listas pelo nome, checklist e tag (sem acento, cada palavra em qualquer lugar); "1 de 8" no nome da lista; no celular as bolinhas viram o número de achados de cada lista, no PC a barra diz em quais listas achou.)
// V10.46 - v40.40.0 (PC, visão Dia: o cartão sai da sublista arrastando (vira bloco onde o tracejado mostra, com o horário, ou muda de sublista) e o bloco entra numa sublista arrastando por cima dela. Esc desiste; um passo só do Desfazer. Era o que a Semana do PC e o celular já faziam.)
// V10.47 - v40.41.0 (Períodos no PC, igual ao celular e nos 2 sentidos: vão na conta, como a cor do app; em Configurações do PC dá pra criar e apagar, e no Novo bloco clicar num período preenche o horário e a duração. Salvar backup no PC: o mesmo arquivo do celular, que dá pra restaurar lá.)
// V10.48 - v40.42.0 (Avisos dos compromissos, no celular e no PC: em Configurações, liga NESTE aparelho e a nuvem avisa antes de cada bloco da agenda, com o app fechado — Na hora, 5, 10, 15 ou 30 min (10 pra começar) e "Mandar um aviso de teste". Web Push: o aparelho se inscreve no serviço de push do navegador (avisos.js) e a função "alertas" do Supabase, a cada minuto, manda o aviso cifrado. Aqui: o push vira aviso na tela e o clique volta pro app (ou pra tela do PC). Precisa da conta; no iPhone, com o app instalado na tela de início. Sair da conta desliga.)
// V10.49 - v40.43.0 ("Soltar aqui" pelos Períodos, no celular e no PC: com a tarefa na mão (ou arrastando um bloco na Semana do PC), cada espaço livre da agenda se divide nos Períodos da pessoa — Manhã, Meio-dia, Tarde, Noite, os que ela criou —, cada parte com a cor da parte do dia (fora de período, cinza "Livre"); tocar/clicar numa parte põe no 1º horário livre DELA (antes ia tudo pro começo do espaço). Hoje, a parte de agora começa agora. Também na faixa dos vagos ocultos, com 2 ou 3 dias e na faixa do Dia compactado do PC. Sem nenhum período, o campo de sempre.)
// V10.50 - v40.44.0 (Blocos de baixo abrem espaço sozinhos, no celular e no PC: com a tarefa na mão, entre blocos colados (o "↓" de cada emenda), num vago curto ou numa parte que não comporta, ela entra e os blocos de baixo descem só o necessário (a fila encostada desce; um vago que caiba segura o resto). Esticar a duração de um bloco também desce os de baixo, com a prévia enquanto puxa. Arrastar um bloco pra cima de outro continua dando "Conflito". Nada passa do fim do dia; hoje, só daqui pra frente; um passo só do Desfazer.)
// V10.51 - v40.45.0 (Filtro da agenda no celular, o "Todas as tags" e o "Ocultar concluídos" do PC: o botão TAGs abre "Filtrar a agenda" (uma tag, "Sem tag" e "Ocultar concluídos"; "Gerenciar tags" no pé) e, ligado, mostra a tag escolhida. Só esconde da tela: o bloco escondido vira um contorno no horário dele e o espaço livre continua contando com ele. Guardado no aparelho, fora do backup.)
// V10.52 - v40.46.0 ("Descartar?" ao fechar um formulário com texto não salvo, no celular e no PC: com o texto mudado, o X, o ← do formulário, o voltar do celular, o toque no fundo escuro, o Esc e o clique fora perguntam antes de apagar o que foi escrito ("Descartar" ou "Continuar escrevendo"). O Cancelar escrito fecha sem perguntar. Formulários que guardam o rascunho (o +, o novo período e a nova tag do celular) ficam de fora.)
// V10.53 - v40.47.0 (Quadros e listas compartilhadas, no celular e no PC: um quadro (Casa, Empresa) junta pessoas pelo e-mail da conta; qualquer um do quadro põe uma lista sua nele e todo mundo vê e mexe nas tarefas dela (agendar tira da lista); só quem criou o quadro põe e tira gente, só o dono da lista renomeia ou apaga. As tarefas ficam na conta de quem é dono (regras novas no banco: faz_v40_47_0_quadros). Config → Quadros no celular; Configurações → Quadros e o menu da lista no PC.)
// V10.54 - v40.47.1 (Consertos das fotos dele de 26/11: a sublista de 5 e 10 min aparece numa linha só, como os blocos curtos, sem o nome cortado ao meio (celular e visão Dia do PC), e toda sublista curta mostra a duração depois do nome; com a tarefa na mão, o "Colocar aqui" vai na linha do nome; o + abre sem subir o teclado; o Config do + virou só a engrenagem, na mesma linha do Descanso e da Sublista; na agenda afastada, a sublista pintada de cor escura ganha letra clara.)
// V10.55 - v40.48.0 (Menu grande e Quadros com abas, no celular e no PC: o botão dos itens abre um menu em grade (Quadros, Rotinas, Notas, Finanças, Metas e Assistente, cada um com um número; a Config no pé); a aba Listas virou Quadros, com uma aba por quadro (Pessoal = as listas sem quadro; quadro só seu pra organizar, ou com gente = compartilhado) e cada aba só com as listas dela; lista nova entra no quadro aberto; "Mudar de quadro" no menu da lista; quadro vazio com "Nova lista" e "Trazer uma lista". Nada mudou no banco.)
const CACHE_NAME = 'timeblock-v40-48-0';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './faz-config.js',
  './sync.js',
  './assistente.js',
  './metas.js',
  './avisos.js',
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

// V40.42.0: avisos dos compromissos (Web Push). A nuvem (função "alertas") manda { t: título, b: texto, tag, u },
// cifrado: só este aparelho lê. Todo push vira um aviso na tela (o iPhone e o Chrome exigem). O mesmo bloco troca
// o aviso dele (tag) em vez de empilhar. u: 'pc' abre a tela do PC; senão, o app.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = {}; }
  if (!d || typeof d !== 'object') d = {};
  e.waitUntil(self.registration.showNotification(String(d.t || 'Faz').slice(0, 120), {
    body: String(d.b || '').slice(0, 240),
    tag: String(d.tag || 'faz').slice(0, 80),
    renotify: true,
    icon: './icon-192.png',
    data: { u: d.u === 'pc' ? 'pc' : 'app' }
  }));
});

// Tocar no aviso: volta pra janela do Faz que já está aberta (a do PC ou a do app) ou abre uma.
self.addEventListener('notificationclick', (e) => {
  const pc = !!(e.notification.data && e.notification.data.u === 'pc');
  e.notification.close();
  const escopo = self.registration.scope, alvo = new URL(pc ? 'kanban.html' : './', escopo).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
    for (const j of janelas) {
      if (j.url.indexOf(escopo) !== 0) continue;
      const ehPc = /\/kanban\.html$/.test(new URL(j.url).pathname);
      if (ehPc === pc && 'focus' in j) return j.focus();
    }
    return self.clients.openWindow ? self.clients.openWindow(alvo) : null;
  }));
});
