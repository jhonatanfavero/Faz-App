# Testes do Faz

```
npm install     # só na primeira vez (baixa o jsdom e o Tailwind)
npm test        # confere o CSS pronto e roda as 37 suítes (cerca de 5 minutos)
```

O `npm test` termina com `✅ TOTAL: N verificações passaram, 0 falharam`. Qualquer `❌` significa que
alguma coisa que funcionava deixou de funcionar: não publique antes de entender o motivo.
`node tests/run.js --tudo` mostra cada verificação, uma por linha.

## O que cada suíte cobre

| Arquivo | O que roda | O que confere |
|---|---|---|
| `sim_sync.js` | só o motor do `sync.js` | mesclagem celular × nuvem: conflitos, apagados, ordem, lista órfã, primeiro sync, duplicados, metas (listas padrão, órfãs, dias de meta apagada, linhas estranhas), sublista (cartões nos dois sentidos, cartões estranhos ou maliciosos), desfazer depois do sync (o apagado volta nos dois sentidos) |
| `test_app.js` | `index.html` + `app.js` + `sync.js` de verdade | app sem login, login, ida e volta com a nuvem, backup e restauração |
| `test_v408.js` | idem | agenda na nuvem, blocos de 5 e 10 min, dado corrompido, iOS, esqueci a senha |
| `test_v409.js` | idem | cor livre do cartão, arquivar e desarquivar |
| `test_v4091.js` | idem | listas afastadas e seus níveis (1, 1½, 2, 3), menu da lupa, arrastar entre listas, pinça, sync do movimento |
| `test_v4017.js` | `index.html` + `app.js` + `sync.js` de verdade | rotinas, notas e finanças nos dois sentidos, formulário aberto segura o sync, exemplos só em aparelho novo |
| `test_atualizacao.js` | idem, partindo do estado gravado pela V40.7.0 | quem já sincronizava numa versão antiga abre a atual: nada se perde, nada é reenviado à toa, nenhuma pergunta aparece |
| `test_kanban.js` | `kanban.html` de verdade | tela do PC: listas, agenda (semana e dia), arrastar, arquivados, tempo real |
| `test_kanban_v4017.js` | `kanban.html` de verdade | abas Rotinas e Notas: criar, editar, apagar, rotina na Agenda, nota que salva sozinha, tempo real |
| `test_kanban_v4018.js` | `kanban.html` de verdade | janela de Tags (criar, renomear, trocar cor, apagar e limpar quem usava), "Gerenciar tags" no cartão e na rotina, tags padrão de quem começa pelo PC, zoom das Listas e da Semana |
| `test_kanban_v4019.js` | `kanban.html` de verdade | aba Finanças (mês a mês, totais, atrasadas, pagar, criar, editar com "só neste mês / próximos / todos", trocar tipo, apagar, tempo real) e setas ← → do teclado |
| `test_v4019.js` | `index.html` + `app.js` de verdade | finanças do celular: editar só o nome de uma recorrente num mês com valor próprio não estraga os valores dos outros meses |
| `test_assistente.js` | `assistente.js` sozinho + `index.html` + `app.js` de verdade | o "cérebro" do Assistente (cada pergunta, frases escritas do jeito de cada um, sem dados) e a aba dele no celular |
| `test_kanban_v4020.js` | `kanban.html` de verdade | aba Assistente no PC: resumo do dia com os dados da nuvem, sugestões, perguntar, abrir o item da resposta, tempo real |
| `test_metas.js` | `metas.js` sozinho + `index.html` + `app.js` + `sync.js` de verdade | as regras das metas (período, estrelas, sequência, pontos, níveis, alvo da época), a aba Metas no celular (criar, +/−, editar, apagar, listas), a ida e volta pela nuvem e o Assistente falando das metas |
| `test_kanban_v4022.js` | `kanban.html` de verdade | notas vinculadas no cartão do bloco (ver, buscar e vincular, criar já vinculada, desvincular, abrir salvando o cartão, apagar a nota solta o vínculo, tempo real) e o Dia com "Compactar vagos" (faixas, escala por trechos, clicar na faixa cria o bloco ou coloca a tarefa na mão) |
| `test_kanban_v4021.js` | `kanban.html` de verdade | aba Metas no PC (V40.23.0: uma página só, por categoria, cartões em grade): categorias padrão, meta nova com sugestões, +/− (cliques seguidos = um envio), editar, recomeçar a contagem, apagar, listas de metas, tempo real e o Assistente abrindo a meta |
| `test_sublista.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.24.0: sublista no celular (criar pelo +, cartão novo, tarefa da Lista na mão, marcar, cartão aberto, voltar pra lista, devolver os não feitos, duplicar e repetir, apagar, busca, backup, Assistente, ida e volta com a nuvem) e "ocultar vagos" (faixas, régua encolhida, arrastar e esticar, tocar na faixa); V40.34.0: abrir e fechar o + depressa não deixa o foco preso no campo escondido (nem segura o sync) |
| `test_kanban_v4024.js` | `kanban.html` de verdade | V40.24.0: sublista no PC (Semana e Dia, janela com os cartões, puxar da Lista, cartão aberto, Novo bloco como sublista, tarefa na mão, apagar devolvendo os não feitos, tempo real) |
| `test_desfazer.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.25.0: Desfazer e Refazer no celular (a barrinha, apagar e voltar no mesmo lugar, agendar = um passo, concluir, checklist, mover, sublista, lista apagada com as tarefas, arquivados, metas, finanças, notas, tags, rotinas, ordem dos cartões, o que não vira passo, vários passos, a nuvem: o que vem do PC não vira passo, desfazer sobe pra nuvem, conflito com o PC, agenda grande) |
| `test_kanban_v4025.js` | `kanban.html` de verdade | V40.25.0: Desfazer no PC (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Cmd+Z, botões ↶ ↷, aviso com Desfazer, agendar = um passo na ordem segura, lista e tag apagadas, metas, nota sendo escrita = um passo, o celular mexeu depois, Ctrl+Z num campo ou com janela aberta, sem internet). V40.25.1: dois cliques num horário vazio (Semana: depois do cartão de cima; Dia: na hora clicada), o 2º clique de um clique duplo não fecha janela nem marca/desmarca de novo |
| `test_dois_toques.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.25.1: dois toques no Tempo Livre abrem o + na hora tocada (de 15 em 15 min), um toque só explica (3 vezes), hoje vale a hora tocada, perto do fim encosta no próximo bloco, não cabe fica na mão, a faixa do "ocultar vagos" também é com dois toques, o que não é toque duplo |
| `test_agenda_dias.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.26.0: agenda afastada no celular (2 ou 3 dias lado a lado): botão de colunas, nomes dos dias, intervalo no topo, blocos compactos, tocar abre o dia com o cartão aberto, dois toques em outra coluna, tarefa na mão em qualquer dia e na sublista, pinça, arrastar pro lado, filtros/busca em lista, ocultar vagos só em 1 dia, escolha guardada |
| `test_voltar.js` | `index.html` + `app.js` + `sync.js` de verdade, com um CloseWatcher de mentira | V40.27.0: botão voltar do celular: toda janelinha e tela têm o botão que ele toca (`data-voltar`), aviso antes de sair na agenda (o 2º voltar sai; depois de 3 s ou de um toque volta a perguntar), formulários e sub-telas voltam pra tela de trás, Config volta pro +, janelinhas pelo próprio Cancelar (a de cima primeiro), sem fundo fosco, toque no fundo escuro, tarefa na mão, busca, menu do zoom, volta pros dias lado a lado, Esc no computador, Android sem CloseWatcher pelo histórico |
| `test_kanban_v4028.js` | `kanban.html` de verdade, relógio na terça 17/11 às 14:56 | V40.28.0: na Semana, puxar a borda de baixo muda a duração (diminuir, aumentar até o próximo, mínimo 5 min, Esc, o clique depois de soltar, Ctrl+Z, não vira arraste pra outro dia, sublista, sem alça com tarefa na mão) e arrastar no próprio dia mostra também os espaços de antes de agora, entre os cartões; Duplicar nos 3 pontinhos; cartão sai da sublista arrastando (vira bloco), muda de sublista, e bloco entra nela (vira cartão) |
| `test_kanban_v4029.js` | `kanban.html` e o app do celular de verdade, mesmo relógio (domingo 15/11, 21:00) | V40.29.0: Relatórios no PC (Hoje, 7 e 30 dias) com os mesmos números do "Produtividade" do celular, visão Dia usa o dia aberto, arquivado não conta, tag apagada vira "Excluída", filtros não mudam, atualiza com a nuvem, Esc/Fechar/fundo, texto escapado; Semana sempre de segunda a domingo |
| `test_sublista_arrastar.js` | `index.html` + `app.js` + `sync.js` de verdade, com uma "tela" de mentira pras posições | V40.30.0: no celular o cartão da sublista vira bloco num horário livre (tempo, tag, cor, checklist, feito; conflito; passado), muda de sublista, e o bloco entra na sublista (com a pergunta das notas vinculadas; Descanso e sublista não entram); um passo do Desfazer cada; o gesto (segurar 400 ms, rolar não arrasta, contorno do lugar, "Não cabe aqui", toque cancelado, o clique que sobra); a nuvem nos dois sentidos |
| `test_recorrente.js` | o app do celular e `kanban.html` de verdade, a mesma nuvem | V40.30.0: Recorrente sem fim (1200 meses): criar, editar sem mexer no fim, "neste e nos próximos" sem escrever 1200 meses, Encerrar depois do mês da tela, Repetir sem fim de novo, encerrar no 1º mês (vira avulsa), as antigas de 12 meses, Desfazer, a nuvem e o PC com as mesmas regras |
| `test_arrastar_dias.js` | `index.html` + `app.js` + `sync.js` de verdade, com uma "tela" de mentira pras posições | V40.31.0: com 2 ou 3 dias, segurar um bloco e levar pra outro dia e/ou horário (encaixe no vago mais perto, vermelho quando não cabe, balão com dia e hora, sublista, passado/adiado, Desfazer), os dias andando na borda, toque cancelado, o clique que sobra, o "pro lado anda um dia" e o tocar pra abrir que continuam, tarefa na mão, a dica e a nuvem |
| `test_preferencias.js` | o app do celular (dois aparelhos) e `kanban.html` de verdade, a mesma nuvem | V40.32.0: cor do app e horário do dia nos 2 sentidos: as regras de quem ganha (a mudança mais nova; conta de antes desta versão; conta com dado estragado), o celular sobe e recebe (avisos, régua, Config → Aparência), não volta pra trás com mudança mais velha, espera o arraste terminar, restaurar backup, aparelho novo pega o da conta; no PC a janela Configurações (8 cores, Começa/Termina, começo depois do fim, sem internet volta como estava, Esc, fundo), a Agenda no horário novo, o que o celular mudou aparece ao abrir, sair da conta fecha |
| `test_ordem_listas.js` | o app do celular e `kanban.html` de verdade, com uma "tela" de mentira pras posições | V40.33.0: mudar a ordem das listas. Celular: menu (Esquerda/Direita, "Posição 2 de 5", o menu fica aberto, a barrinha do Desfazer ao fechar), segurar o título no afastado (cópia, espaço tracejado, lista que "sai", soltar, Desfazer/Refazer), o que não move (mesmo lugar, toque cancelado, rolar, redesenho no meio, trocar o zoom), modo normal (o quadro se afasta só durante o arrasto, sem gravar o zoom), mouse com a borda rolando, uma lista só; nuvem nos 2 sentidos (sobe só a lista movida) e o sync esperando o arrasto. PC: arrastar pelo título (linha em pé, mesmo lugar, soltar fora, tempo real esperando, cartão continua sendo cartão), menu Mover pra esquerda/direita, vizinhas coladas (renumera num passo só), Ctrl+Z e a ordem vinda do celular |
| `test_metas_etapa2.js` | `metas.js` sozinho + o app do celular e `kanban.html` de verdade, a mesma nuvem | V40.34.0: meta ligada. As regras (quanto um bloco vale, os dias que os blocos e cartões concluídos contam sem gravar nada, o recomeço, a marca do alvo antigo, o histórico do gráfico e os recordes). Celular: ligar pelo +, pela edição do bloco, pela tarefa, pela rotina e pelo cartão da sublista; a meta indo junto (agendar, rotina, voltar pra lista, duplicar, repetir); concluir conta e avisa a estrela; selos; gráfico; mudar o alvo sem mexer em estrela antiga; recomeçar; meta apagada e Desfazer; nuvem e backup (quem vem da versão antiga relê a agenda uma vez e não apaga a meta ligada no PC). PC: o campo Meta no cartão, na rotina e no cartão da sublista, a meta indo junto, a aba Metas contando os blocos, aviso de estrela, gráfico, alvo, recomeço, selos e meta apagada |
| `test_busca_agenda.js` | `kanban.html` de verdade (com blocos parecidos com os dele) e o app do celular | V40.35.0: busca na agenda do PC. O campo na barra; acha no nome, no checklist, nos cartões da sublista (e no checklist deles) e na tag, sem acento e sem maiúscula, cada palavra em qualquer lugar; arquivado e apagado não entram; a ordem (de hoje em diante, depois os de antes); o que achou marcado; nada encontrado; HTML vira texto; 100 no máximo; teclado (setas, Enter, Esc), clique, "Ver o dia", o ×, clicar fora; abrir leva a Agenda até o bloco (outra semana, visão Dia, tirando o filtro que escondia); o painel acompanha o que chega da nuvem; tarefa na mão; trocar de aba. Celular: as mesmas regras no `cardMatchesSearch` |
| `test_repetir_pc.js` | `kanban.html` de verdade | V40.36.0: Repetir bloco no PC. Os 3 pontinhos com "Repetir…" na Semana e na visão Dia (no Dia, segurar os 3 pontinhos não arrasta); a janela (Todo dia / Toda semana / Todo mês, começando em 5, 4 e 2 como no celular; −/+, digitar, máximos 60/52/24; o dia com o horário ocupado fica de fora; o resumo); o que é criado (horário, tag, cor, meta, checklist e cartões desmarcados, sem notas, o tipo pelo horário); todo mês no dia 31; sublista; passado; nada livre; um passo só do Desfazer; Esc, Cancelar, fundo, Enter; bloco que chega da nuvem e bloco apagado com a janela aberta. V40.36.1: com uma meta escolhida o bloco novo pode ficar sem nome (vale o da meta) |
| `test_v40361.js` | app de verdade | V40.36.1 no celular: o "Repetir Tarefa" igual ao do PC (janelinha com −/+, máximos, resumo e o dia ocupado ficando de fora; cópias com o tipo pelo horário, sem atraso, sem notas, checklist e cartões desmarcados; dia 31; tudo ocupado; bloco que sumiu; um passo do Desfazer "Repetido 4 vezes · 1 dia de fora"); Copiar com a cor; cartão recolhido sem a fatia do checklist (nome em 2 linhas, contador no horário); "+ Meta em …" em toda categoria; nome pela meta (+, tarefa, cartão da sublista); ocultar vagos com 2 dias; nuvem e o foco numa janelinha fechada |
| `test_sublista_metas.js` | app de verdade e `kanban.html` de verdade | V40.37.0: sublista de metas. Celular: o "Pôr na agenda" no menu da categoria (o que vai; apagado sem meta), a sublista na mão (nome da categoria, 30 min, um cartão por meta, ligado a ela), entrar no Tempo Livre, um passo do Desfazer, marcar conta na meta, o Repetir leva as metas, não entra em outra sublista. PC: o calendário no título da categoria, a barra na mão, cancelar, colocar num espaço livre e o que vai pra nuvem |
| `test_injecao.js` | `app.js` de verdade | nome ou título com HTML dentro aparece como texto, nunca vira elemento |

O app roda dentro do [jsdom](https://github.com/jsdom/jsdom) (um navegador de mentira dentro do Node)
e o Supabase é substituído por `mock_supabase.js`, que imita as tabelas, as regras de acesso por
usuário e as validações do banco de verdade. Nenhum teste encosta na internet.

## Dados de teste

`dados-ficticios.json` tem o formato exato de um backup do app (5 listas, 51 tarefas, 554 blocos,
despesas, notas, rotinas), mas **todo o conteúdo é inventado**: nomes, valores, datas, horários e ids.
Não coloque backup de verdade nesta pasta: o repositório é público.

`estado-sync-v40-7-0.json` é o que a V40.7.0 gravava em `tb__sync` depois de sincronizar esses mesmos
dados fictícios. Ao mudar o formato desse estado no futuro, guarde aqui um exemplo da versão anterior
e teste a passagem, como o `test_atualizacao.js` faz.

O "hoje" desses dados é **15/11/2026**. Os testes travam o relógio do app nesse dia (função
`travarRelogio` em `boot_app.js`), então o resultado é o mesmo em qualquer dia em que rodarem.

## Testes de navegador (opcionais)

Algumas coisas o jsdom não sabe fazer: medir tamanho na tela, rolar, toque de verdade, service worker.
Para isso existem quatro testes que abrem um Chrome de verdade:

```
npm i -D playwright && npx playwright install chromium    # uma vez
node tests/navegador/toque_listas.js    # celular: listas afastadas e arrastar com o dedo; sublista e vagos ocultos; desfazer; dois toques; agenda afastada com pinça de verdade; cartão da sublista e bloco arrastando com o dedo; bloco de um dia pro outro com os dias lado a lado; o topo das telas e os Períodos no iPhone (área segura simulada); mudar a lista de lugar com o dedo (afastado, na borda, modo normal, menu)
node tests/navegador/offline.js         # o app abre completo sem internet?
node tests/navegador/iphone.js          # iPhone 13 e 13 mini simulados (barra de status e risco de início) e um Android com a barra de navegação por cima (Chrome 135+, V40.36.1): percorre as telas e acha botão escondido, coberto ou vazando (com metas de exemplo: as linhas Meta, os selos e o gráfico da meta)
node tests/navegador/tela_pc.js         # tela do PC com mouse: arrastar e esticar blocos (Dia e Semana), 3 pontinhos, campo de arquivar, zoom, tags, sublista; Configurações (cor e horário) e o topo de 1024 a 1440 px; mudar a lista de lugar arrastando pelo título e pelo menu; o campo Meta no cartão e o gráfico da meta; a busca na agenda (cabe na barra de 1024 a 1440 px, teclado e mouse de verdade); Repetir bloco e os 3 pontinhos na visão Dia
node tests/navegador/voltar.js          # celular: botão voltar (CloseWatcher de verdade; o Esc faz o papel do voltar) e, sem CloseWatcher, pelo histórico
```

Com `CHROME=/caminho/do/chrome` eles usam um Chrome já instalado; com `FOTOS=/alguma/pasta` salvam
imagens das telas. Eles não entram no `npm test` porque o Playwright é pesado. Vale rodar quando
mexer em arrasto, rolagem, botão voltar, telas e janelinhas, `sw.js` ou na pasta `libs/`. O da tela do PC usa uma "nuvem" de mentira
(o mesmo `mock_supabase.js`, rodando dentro da página) e um relógio fixo: veja `abrirPc()` no `apoio.js`.

O que nenhum teste daqui cobre: **Safari do iPhone**. Mudança de toque ou de layout precisa de uma
conferida num iPhone de verdade.
