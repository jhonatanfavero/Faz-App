# Testes do Faz

```
npm install     # só na primeira vez (baixa o jsdom e o Tailwind)
npm test        # confere o CSS pronto e roda as 26 suítes (cerca de 2 minutos)
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
| `test_sublista.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.24.0: sublista no celular (criar pelo +, cartão novo, tarefa da Lista na mão, marcar, cartão aberto, voltar pra lista, devolver os não feitos, duplicar e repetir, apagar, busca, backup, Assistente, ida e volta com a nuvem) e "ocultar vagos" (faixas, régua encolhida, arrastar e esticar, tocar na faixa) |
| `test_kanban_v4024.js` | `kanban.html` de verdade | V40.24.0: sublista no PC (Semana e Dia, janela com os cartões, puxar da Lista, cartão aberto, Novo bloco como sublista, tarefa na mão, apagar devolvendo os não feitos, tempo real) |
| `test_desfazer.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.25.0: Desfazer e Refazer no celular (a barrinha, apagar e voltar no mesmo lugar, agendar = um passo, concluir, checklist, mover, sublista, lista apagada com as tarefas, arquivados, metas, finanças, notas, tags, rotinas, ordem dos cartões, o que não vira passo, vários passos, a nuvem: o que vem do PC não vira passo, desfazer sobe pra nuvem, conflito com o PC, agenda grande) |
| `test_kanban_v4025.js` | `kanban.html` de verdade | V40.25.0: Desfazer no PC (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Cmd+Z, botões ↶ ↷, aviso com Desfazer, agendar = um passo na ordem segura, lista e tag apagadas, metas, nota sendo escrita = um passo, o celular mexeu depois, Ctrl+Z num campo ou com janela aberta, sem internet). V40.25.1: dois cliques num horário vazio (Semana: depois do cartão de cima; Dia: na hora clicada), o 2º clique de um clique duplo não fecha janela nem marca/desmarca de novo |
| `test_dois_toques.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.25.1: dois toques no Tempo Livre abrem o + na hora tocada (de 15 em 15 min), um toque só explica (3 vezes), hoje vale a hora tocada, perto do fim encosta no próximo bloco, não cabe fica na mão, a faixa do "ocultar vagos" também é com dois toques, o que não é toque duplo |
| `test_agenda_dias.js` | `index.html` + `app.js` + `sync.js` de verdade | V40.26.0: agenda afastada no celular (2 ou 3 dias lado a lado): botão de colunas, nomes dos dias, intervalo no topo, blocos compactos, tocar abre o dia com o cartão aberto, dois toques em outra coluna, tarefa na mão em qualquer dia e na sublista, pinça, arrastar pro lado, filtros/busca em lista, ocultar vagos só em 1 dia, escolha guardada |
| `test_voltar.js` | `index.html` + `app.js` + `sync.js` de verdade, com um CloseWatcher de mentira | V40.27.0: botão voltar do celular: toda janelinha e tela têm o botão que ele toca (`data-voltar`), aviso antes de sair na agenda (o 2º voltar sai; depois de 3 s ou de um toque volta a perguntar), formulários e sub-telas voltam pra tela de trás, Config volta pro +, janelinhas pelo próprio Cancelar (a de cima primeiro), sem fundo fosco, toque no fundo escuro, tarefa na mão, busca, menu do zoom, volta pros dias lado a lado, Esc no computador, Android sem CloseWatcher pelo histórico |
| `test_kanban_v4028.js` | `kanban.html` de verdade, relógio na terça 17/11 às 14:56 | V40.28.0: na Semana, puxar a borda de baixo muda a duração (diminuir, aumentar até o próximo, mínimo 5 min, Esc, o clique depois de soltar, Ctrl+Z, não vira arraste pra outro dia, sublista, sem alça com tarefa na mão) e arrastar no próprio dia mostra também os espaços de antes de agora, entre os cartões; Duplicar nos 3 pontinhos; cartão sai da sublista arrastando (vira bloco), muda de sublista, e bloco entra nela (vira cartão) |
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
node tests/navegador/toque_listas.js    # celular: listas afastadas e arrastar com o dedo; sublista e vagos ocultos; desfazer; dois toques; agenda afastada com pinça de verdade
node tests/navegador/offline.js         # o app abre completo sem internet?
node tests/navegador/tela_pc.js         # tela do PC com mouse: arrastar e esticar blocos (Dia e Semana), 3 pontinhos, campo de arquivar, zoom, tags, sublista
node tests/navegador/voltar.js          # celular: botão voltar (CloseWatcher de verdade; o Esc faz o papel do voltar) e, sem CloseWatcher, pelo histórico
```

Com `CHROME=/caminho/do/chrome` eles usam um Chrome já instalado; com `FOTOS=/alguma/pasta` salvam
imagens das telas. Eles não entram no `npm test` porque o Playwright é pesado. Vale rodar quando
mexer em arrasto, rolagem, botão voltar, telas e janelinhas, `sw.js` ou na pasta `libs/`. O da tela do PC usa uma "nuvem" de mentira
(o mesmo `mock_supabase.js`, rodando dentro da página) e um relógio fixo: veja `abrirPc()` no `apoio.js`.

O que nenhum teste daqui cobre: **Safari do iPhone**. Mudança de toque ou de layout precisa de uma
conferida num iPhone de verdade.
