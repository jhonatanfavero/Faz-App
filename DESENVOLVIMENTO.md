# Faz / TimeBlock — guia de quem mexe no código

O app é HTML + JavaScript puro, sem etapa de build: o que está nesta pasta é o que o GitHub Pages
publica (branch `V-5.0`, em `jhonatanfavero.github.io/Faz-App`).

## Mapa dos arquivos

| Arquivo | Papel |
|---|---|
| `index.html`, `app.js`, `style.css` | o app do celular (PWA) |
| `sync.js`, `faz-config.js` | sincronização opcional com o Supabase (endereço e chave pública do projeto) |
| `avisos.js` | avisos dos compromissos no aparelho (Web Push): ligar, desligar, minutos, teste; o mesmo no celular e no PC |
| `supabase/functions/alertas/` | a função do Supabase que manda os avisos (roda a cada minuto); `supabase/migrations/` tem a cópia do SQL aplicado |
| `kanban.html` | tela do PC (Listas e Agenda), só funciona com login |
| `sw.js` | service worker: guarda o app no aparelho para abrir offline |
| `libs/` | fonte, ícones, Supabase e o CSS pronto do Tailwind (ver `libs/README.md`) |
| `tools/build-css.js` | gera `libs/tailwind.css` e `libs/tailwind-kanban.css` |
| `tests/` | testes automáticos (ver `tests/README.md`) |

Os dados do usuário ficam no `localStorage` do aparelho. Chaves `tb_*` são dados (entram no backup);
chaves `tb__*` são internas do aparelho (estado do sync, preferências de tela) e não entram.

## Regras que não se quebram

1. **Dado do usuário é sagrado.** Nada sobrescreve dados sem confirmação e sem cópia de segurança.
   O service worker nunca apaga o `localStorage`. Dado ilegível é copiado para `tb__corrompido_*`
   antes de qualquer coisa.
2. **Uma versão só, em cinco lugares.** Mudou o app (celular ou tela do PC)? Suba o número no
   `CACHE_NAME` do `sw.js` (sem isso os aparelhos continuam na versão antiga), no selo do `index.html`,
   no selo do `kanban.html`, na `version` do backup no `app.js` e no `package.json`. O `npm test`
   reclama se algum ficar diferente. Mudança só em testes ou documentação não precisa de versão nova.
3. **Texto digitado pelo usuário passa por `escapeHtml` antes de entrar em `innerHTML`.** Ids, cores e
   datas que vêm de backup ou da nuvem são validados na entrada (`sync.js` e importação).
4. **Datas são sempre locais.** Nunca usar `toISOString()` para descobrir o dia: de noite, no Brasil,
   ele devolve o dia seguinte. Os testes rodam em `America/Sao_Paulo`.
5. **Mudança cirúrgica.** Altere só o necessário e não reescreva o que está funcionando.
6. **Mexeu em classe do Tailwind, rode `npm run build:css`** e publique os arquivos gerados. Online o
   script do CDN cobre a classe nova; offline quem vale é o CSS pronto.
7. **Quem já usa o app não pode perceber a atualização nos dados.** Mudou o formato de algo gravado no
   aparelho (`tb_*` ou `tb__sync`)? A versão nova tem que abrir o formato antigo sem perguntar nada e
   sem reenviar tudo para a nuvem. `tests/test_atualizacao.js` é o modelo. Campo novo nos blocos (a agenda é
   lida de forma incremental): quem vem de antes precisa reler a agenda inteira uma vez, senão o que o PC gravou
   nesse campo enquanto o celular estava na versão antiga nunca chega, e mexer no bloco apaga por cima. Veja o
   `goalIds` (V40.34.0) e o `colIds` (V40.38.0) no `fetchAll` do `sync.js`. E o campo novo entra em três lugares
   de cada lado: no `FIELDS` e no `SELECT` do `sync.js` e no `SELECT` do `kanban.html` (fora do `SELECT`, a
   leitura chega sem ele e o celular apaga o campo no próprio aparelho).
8. **`npm test` verde antes de publicar.** Mexeu em arrasto, rolagem, `sw.js` ou `libs/`? Rode também
   os testes de navegador. Tela, janelinha ou botão novo no celular: rode o `tests/navegador/iphone.js`
   (V40.32.2: iPhone simulado, com a barra de status e o risco de início por cima do app).
9. **Toda gravação passa pelo caminho que o Desfazer enxerga (V40.25.0).** No celular, grave dado só
   pelos `save*()` da chave (`saveDb`, `saveBacklog`...), nunca com `localStorage.setItem('tb_...')`
   direto: cada save chama `undoTouch()`, que guarda o que mudou. O que o app cria sozinho, sem o
   usuário pedir, vai dentro de `undoQuiet(...)`; campo que é só de tela num item salvo (como o
   `expanded` do bloco) entra no `skip` da chave em `undoKeys()`. No PC, grave por `insertRow` /
   `patchRow`; gravação em lote direto no Supabase precisa de `undoRec(g, undoBulk(...))` depois do
   sucesso, com o gesto (`var g = S.gesture`) guardado antes do primeiro `await`. Arrasto no PC que grava
   duas coisas (cartão sai da sublista, bloco entra nela): o clique que o navegador solta depois de soltar o
   botão não é gesto novo enquanto `S.agNoClick` estiver ligado (V40.40.0), senão viram dois passos.
10. **Tela ou janelinha nova tem o botão do voltar (V40.27.0).** O voltar do Android (e o Esc no
    computador) toca no botão de voltar/fechar da tela de cima: em cada janelinha (`id` terminado em
    `-modal`), o Cancelar/fechar leva `data-voltar`; em cada tela (`id` terminado em `-sheet`), o X leva
    `data-voltar="fechar"`; sub-tela ou formulário dentro dela, a seta ← leva `data-voltar`. Janelinha
    abre tirando `.hidden`; tela abre tirando `.translate-y-full`. O `tests/test_voltar.js` reprova quem
    ficar sem.
11. **Arrasto no celular não deixa a agenda redesenhar no meio (V40.30.0).** Enquanto `mbDragActive`,
    `subDrag` ou `blkDrag` (V40.31.0) estão ligados, o `renderTimeline()` não roda (só quando o próprio
    arrasto pede, como os dias andando: `blkDrag.paging`) e o sync espera (`appBusy()` no `sync.js`);
    no fim do arrasto, redesenhe. Nas Listas, o arrasto de cartão (`_dragState`) e o de lista (`colDrag`,
    V40.33.0) também seguram o sync; se o quadro for redesenhado mesmo assim, o arrasto solta sem mover. O "segurar 400 ms" é o `fazLongPress`. Arrasto novo: segurar 400 ms, `touchstart` não-passivo no elemento
    (sem isso o navegador não deixa parar a rolagem depois), trate o `touchcancel` e engula o clique
    que sobra ao soltar.
12. **Despesa recorrente é sem fim (V40.30.0).** "Sem fim" = `durationMonths` / `duration_months` 1200
    (`REC_OPEN`, o máximo que a nuvem aceita); encerrar = os meses até o último. Nunca escreva um valor
    por mês pro futuro de uma recorrente (seriam 1200): "neste e nos próximos" troca o valor normal e
    guarda o valor antigo nos meses de antes (`setAmountFromMonthOn` no app, o mesmo no PC). Salvar o
    formulário de uma recorrente mantém o fim que ela tiver.
13. **Cor do app e horário do dia: ganha a mudança mais nova (V40.32.0).** Não têm tabela: vão na conta
    (`user_metadata`) como `faz_theme`, `faz_hours` e `faz_prefs_at` (hora da mudança, em ms). No celular a
    hora da última mudança que ele conhece fica em `tb__prefs_at` (fora do backup); o `CORE.prefsPlan`
    decide quem ganha e o sync lê a conta de novo com `getUser()` (a sessão guardada pode estar velha).
    Mudou a cor ou o horário no celular? Chame `fazPrefsTouch()` (só quando o valor mudou de fato). No PC,
    grave pelo `savePrefs()`. A hora é sempre maior que a última vista (`Math.max(agora, última + 1)`):
    relógio adiantado em outro aparelho não faz uma mudança nova perder. **Períodos** (V40.41.0) vão do mesmo
    jeito, com a hora deles: `faz_periods` e `faz_periods_at` na conta, `tb__periods_at` no celular
    (`CORE.periodsPlan`; o `savePeriods()` marca sozinho). Na primeira vez de um aparelho com a conta já tendo
    períodos, junta (pelo nome e horário) em vez de trocar. No PC, leia a conta (`perFresh`) antes de gravar a
    lista e grave pelo `savePeriodsPc()`.
14. **Meta ligada conta sozinha, sem gravar nada (V40.34.0).** Bloco, tarefa, rotina e cartão de sublista
    podem ter `goalId` (`goal_id` na nuvem; a sublista em si não tem meta, só os cartões dela). Bloco concluído
    ou cartão marcado com meta entra na conta pelos "dias de mentira" do `FazMetas.autoDays()`/`withAuto()`:
    nada é gravado em `metas_dias`, e desmarcar desconta sozinho. Para somar uma meta use `goalAllDays()` no
    celular e `mtAllDays(id)` no PC, nunca só os dias gravados. Mudou o alvo? Os períodos passados que só
    tinham blocos ganham uma marca com o alvo antigo (`FazMetas.targetMarks`), senão a estrela antiga mudaria.
    Recomeçar grava `countFrom` (`count_from`): bloco de antes não conta mais. Tarefa e rotina passam a meta
    para o bloco que viram (agendar, na mão, rotina na agenda, voltar pra lista, duplicar, repetir).
15. **O pé da tela tem barra por cima em todo celular (V40.36.1).** No iPhone é o risco de início; no Android
    (Chrome 135+, com o `viewport-fit=cover` do `index.html`) a tela do app vai até embaixo, ATRÁS da barra de
    navegação. Elemento fixo no pé usa `env(safe-area-inset-bottom)` sempre, fora do bloco só de iOS (como o
    `#fab-btn`, o `#floating-task` e a `#undo-bar` no `style.css`); dentro das telas cheias (`[id$="-sheet"]`)
    quem cuida é o `padding-bottom` delas: não some a barra de novo. O `tests/navegador/iphone.js` confere os
    dois (iPhone e Android).
16. **Voltar pra lista: a de onde veio, senão a primeira (V40.38.0).** O bloco e o cartão da sublista guardam a
    lista de onde a tarefa saiu (`columnId`; `column_id` no bloco da nuvem; o cartão leva dentro de `cards`). Tudo
    que devolve pra Lista passa por `backToListColumn()` no celular e `backToListId()` no PC: a lista de origem se
    ela ainda existe; senão (apagada, ou o bloco nasceu na agenda) a primeira lista, a da esquerda. Desarquivar
    segue a mesma regra. Caminho novo que transforma tarefa em bloco ou cartão (ou copia um bloco) leva a lista
    junto, como a meta (regra 14).
17. **A tela do PC carrega o `sync.js` só pelas regras (V40.41.0).** O `window.FAZ_SYNC_CORE_ONLY = true` vem
    antes do `<script src="sync.js">` no `kanban.html`: sem ele, a sincronização do celular rodaria no PC (com o
    localStorage vazio). O backup do PC usa `FazSyncCore.indexRows`/`materialize`, as mesmas regras com que o
    celular monta os dados da nuvem: campo novo no `MAP` já sai certo no backup do PC.

18. **Avisos dos compromissos: o banco, a função e o app falam a mesma língua (V40.42.0).** A lista dos serviços
    de push (o `SERVICOS` do `avisos.js` e do `nucleo.js`, a regra `push_inscricoes_endpoint_check` do banco), os
    minutos (0, 5, 10, 15, 30) e o limite de 20 aparelhos estão nos três: mudou um, mude os três (o
    `test_avisos.js` confere). O "Ligar" chama `FazAvisos.ligar()` direto do toque, sem nenhum `await` antes:
    no iPhone a inscrição só vale saindo do toque (a tela chama `FazAvisos.preparar()` ao abrir pra ter tudo na
    mão). Sair da conta chama `FazAvisos.esquecer()` ANTES do `signOut` (depois o RLS não deixa apagar a
    inscrição). A chave privada VAPID nasce dentro da função e fica só no banco (`faz_segredos`); o token do
    agendador nasce no banco. Nenhuma das duas vai pro repositório nem passa pelo chat. Mudou a função? Publique
    `supabase/functions/alertas` (index.ts + nucleo.js) com `verify_jwt = false`: ela confere sozinha quem chama.
    O estado do aparelho é `tb__avisos` (fora do backup: cada aparelho liga o seu).

19. **"Soltar aqui" pelos Períodos: uma regra só, no `sync.js` (V40.43.0).** Com a tarefa na mão (e, no PC, arrastando
    um bloco na Semana), o espaço livre se divide pelo `FazSyncCore.periodSlots(a, b, períodos)`, nos dois lados:
    celular (`perZonesInto`/`perChipsInto` no `app.js`) e PC (`gapSlotsOf`/`cgapChips` no `kanban.html`). Mudou a
    regra (quem ganha, a cor), mude lá e os dois acompanham. A paleta `.per-*` (madrugada, manha, meiodia, tarde,
    noite, livre) está no `style.css` e no `<style>` do `kanban.html`: mude as duas. As partes ficam DENTRO do campo
    de sempre (o toque fora delas faz o de antes) e, no celular, com z-index 29: abaixo do cabeçalho (z 30), senão
    roubam o toque dos botões dele ao rolar. Sem nenhum período criado, volta o campo de sempre. No PC, os nomes
    `perOn` (o período escolhido no Novo bloco) e `perActive` (há períodos?) são coisas diferentes.

20. **Blocos de baixo abrem espaço: uma regra só, no `sync.js` (V40.44.0).** `FazSyncCore.pushPlan(blocos, de, até,
    fimDoDia)` diz quem desce e pra onde (só o necessário: a fila encostada; um vago segura; null se passaria do fim
    do dia ou se um bloco atravessa o ponto) e `pushRoom` diz até onde dá pra esticar. Celular: `pushPlace`,
    `pushPillsInto`, `pushFieldInto` e o `pushPreview` do `enablePhysics` (`app.js`). PC: `pushPlanPc`, `pushApply`,
    `placeSlotsOf`, `dayPushPills`, `sizeCommit` (`kanban.html`). O fim é o fim do dia das Configurações (`END_HOUR` /
    `S.hours[1]`). Com a tarefa na mão, hoje só daqui pra frente (`pushAllowed`). Tudo num passo só do Desfazer: no
    celular, mexa nos blocos e grave com um `saveDb()` só no mesmo toque; no PC, os `patchRow` saem todos no mesmo
    gesto (sem `await` entre o clique e eles, a não ser o do `placeHere`, que espera os de baixo descerem antes de
    criar o bloco novo). Arrastar um bloco pra cima de outro continua dando "Conflito" (escolha dele).
21. **Filtro da agenda: só esconde da tela (V40.45.0).** Celular: `agVisible(b)` (`app.js`, com `agTagFilter` e
    `agHideDone`, guardados em `tb__filtro_tag` e `tb__ocultar_concluidos`, fora do backup); PC: `agVisible(b)`
    (`kanban.html`, `faz_pc_ag_tag` e `faz_pc_ag_hidedone`). As mesmas regras nos dois: "Sem tag" (`__none__`) vale
    também pra tag que não existe mais; tag do filtro apagada volta pra "Todas as tags". O bloco escondido vira o
    contorno no horário dele (`tlHiddenEl` no celular, `.ag-hidden` no Dia do PC): espaço livre, conflito, os "↓" e o
    Planejado continuam contando todos os blocos; código novo que desenha a agenda passa por `agVisible` só na hora de
    desenhar o bloco, nunca na lista que calcula os vagos. A busca acha tudo; ir pro dia de um achado escondido
    desliga o filtro que esconde ele. Mexeu na regra de um lado, mexa na do outro.
22. **"Descartar?" ao fechar com texto não salvo (V40.46.0).** Formulário que começa do zero (ou do item) ao abrir
    de novo ganha `data-form` (celular: `index.html`; PC: `kanban.html`). O ponto de partida é o texto dele quando
    abre (um `MutationObserver` olha o `hidden`/`translate-y-full` dele e de quem está por fora); fechou, some. No
    celular, um `click` em fase de captura segura o `[data-voltar]` e o `#overlay` (e o `navBack` marca `fgVia =
    'voltar'`): pergunta no X, no ←, no voltar e no fundo escuro; o Cancelar escrito de janelinha não pergunta. No PC,
    `fgClose(raiz, fn)` vai no Esc, no clique fora e no Fechar/X (nunca no Cancelar nem no Salvar). Formulário que
    guarda rascunho (o + do celular, a nova tag, o novo período do celular) fica sem `data-form`: não há o que
    descartar. Campo de busca dentro de formulário: `data-fg-skip`. Teste em jsdom que abre e digita no mesmo passo
    precisa esperar uns 10 ms entre os dois (o ponto de partida é marcado logo depois de abrir).
23. **Quadros e listas compartilhadas (V40.47.0).** As tarefas de uma lista compartilhada continuam na conta do DONO
    da lista (`user_id`); quem está no quadro lê e grava nelas pelas regras de `faz_v40_47_0_quadros.sql`
    (`tarefas_quadro`, `listas_select_quadro`). Neste aparelho a lista de outra pessoa é um apelido
    (`FazSyncCore.sharedAlias(dono, lista)` = `sh_` + 8 letras da conta + `_` + id; o mesmo no celular e no PC) e a
    tarefa que veio de lá tem o prefixo da conta no id (`sharedLocalId`). Nada com coluna `sh_…` entra na sincronização
    pessoal: o celular tem a rodada própria (`shFetchPhase` → `shApplyPhase` → `shPushPhase`, com `planShared`), e o PC
    reescreve na hora de gravar (`shCloud`, `shFields`, `shWhere`). Regras que não se quebram: (a) o que saiu da vista
    (lista que deixou de ser compartilhada) some daqui e NUNCA vira "apagado" na nuvem; (b) sem base confiável
    (estado perdido, a lista apelido refeita por fora: o `gen` dela mudou) a rodada é a primeira: junta, vale a nuvem;
    (c) tarefa que muda de conta (sua ↔ compartilhada, ou entre donos) ganha id novo lá e a de cá é apagada; (d) as
    listas dos outros não vão no backup, e restaurar um backup (ou desfazer) não mexe nelas; (e) quadros e pessoas não
    vão no "ao vivo" (o aviso de apagado não passa pelas regras): releitura a cada rodada/minuto. A lista Geral não se
    compartilha. Estado em `tb__compartilhadas` (base por dono) e `tb__quadros` (o que a tela mostra).
24. **Bloco curto tem que caber na altura dele (V40.47.1).** Na agenda do celular o bloco de 5 min tem 13 px e o de
    10 min, 28 px (no Dia do PC, 14 e 30 px). Desenho novo de bloco (ou de sublista) precisa da versão de uma linha
    pra esses tamanhos, como `.nano-block`/`.nano-5` e `.sub-nano`/`.sub-nano-5` (`style.css`) e `.ag-sub-tiny`/
    `.ag-sub-5` (`kanban.html`); a sublista de 5 min chegou a mostrar o nome cortado ao meio. O `iphone.js` confere
    em toda tela da agenda que nada do bloco recolhido passa da altura dele ("cortado no bloco"), e o `tela_pc.js`
    (seção AF) confere a sublista curta no Dia. Ao abrir uma tela, nada de `.focus()` sozinho no celular: o teclado do
    Android sobe por cima e às vezes deixa um buraco branco (o + fazia isso até a V40.47.1).
25. **Quadros com abas: a tela só anda nas listas do quadro aberto (V40.48.0).** O quadro de uma lista é o
    `quadroId` dela (ou `shared.quadro`, se é apelido de lista de outra pessoa); no PC, `quadro_id` / `__sh.quadro`.
    "Pessoal" = sem quadro (a Geral fica sempre lá). No celular, tudo que percorre as listas na tela (bolinhas,
    cabeçalho, deslizar, zoom, mover pra esquerda/direita, arrastar lista) usa `blCols()` (`app.js`), nunca o
    `backlogColumnsDb` inteiro; no PC, o `render()` filtra por `qbBoardOf(c) === qbCur()` (`kanban.html`). Quando a
    lista aberta muda pra uma de outro quadro (busca, "Ver na lista", desfazer), o quadro vai junto (`blSyncBoard`).
    Quadro que sumiu só cai pro Pessoal quando a lista de quadros é certa (logado e carregada); antes disso vale o
    lembrado (`tb__quadro_aberto`, fora do backup; no PC, `faz_pc_quadro`). Mudar lista de quadro é o mesmo
    `quadro_id` da V40.47.0: nada novo no banco. O voltar só leva pro menu grande se a tela veio dele (`hubVia`);
    aberta de dentro do app (agendar, "Ver na lista"), fecha como antes.
26. **Topo da agenda do celular: Semana em tira (V40.49.0).** Os 7 dias (segunda a domingo) são desenhados pelo
    `renderAgWeek()` dentro do `#header-filters-row` (o `applyHeaderState` esconde junto com o Planejado). O que eram os
    botões da 2ª linha virou o ⋯ (`#ag-more-modal`), com os mesmos ids (`ag-done-btn`, `tl-compact-btn`, `ag-filter-btn`):
    quem acende cada um continua sendo o `renderAgDoneBtn`, o `updateTlCompactBtn` e o `renderAgFilterBtn`, e o
    `renderAgMore()` acende o ⋯. Arrastar a agenda pro lado troca o dia com 1, 2 ou 3 dias (`agSwipeOk`: não na busca nem
    nas listas de filtro; não a partir da beirada, que é o voltar do Android). Rolando com o dedo, o topo vira uma linha
    (`header.ag-slim`, `agSlimSet`); o app rolando sozinho até agora não encolhe. Janelinha que precisa da sincronização
    aberta (a do quadro) leva `data-sync-livre` (o `sync.js` não espera ela fechar). No Android instalado, o
    `--faz-safe-bottom` soma o `--faz-nav-gap` (`fazNavGap`): a barra de navegação que o Chrome pinta por cima sem avisar.
27. **Calendário: segunda a domingo em todo lugar (V40.50.0).** A data do topo da agenda do celular é um botão
    (`#header-date`, com o ⌄) que abre o `#ag-cal-modal` (`openAgCal`/`renderAgCal`; escolher passa pelo `agGoDate`, que
    já cuida dos 2–3 dias na tela). Ele abre logo abaixo da data (`agCalPlace` mede; sem medida vale o `top` do CSS) e
    sempre com 6 linhas. No PC, o nome da semana/dia (`#ag-label`, dentro do `#ag-cal-btn`) abre o mesmo `#cal-pop` dos
    campos de data, no modo Agenda (`CAL.ag`; `agPickDay`). Os dois começam na segunda, como a tira e a Semana: não voltar
    pro domingo só num deles. A data do topo não pode mudar a altura da linha (o ícone em `leading-none` e o padding de
    5 + 3 px cabem nos 36 px dos botões do lado, em hoje e nos outros dias).
28. **iPhone instalado: nada no topo dentro da faixa que o iOS 26+ embaça (V40.50.1).** Com `black-translucent` +
    `viewport-fit=cover`, o iOS 26+ desenha o "Liquid Glass" (efeito de borda da rolagem) uns 38–40 pt abaixo da barra
    de status, por cima da página, e nenhum CSS ou meta desliga. Tudo que fica no topo soma `var(--faz-top-clear, 0px)`
    à área segura de cima (o topo da agenda inteiro, recolhido e encolhido, as telas cheias, o ⋯ e o calendário). A
    variável só vale no iOS instalado (o `@supports (-webkit-touch-callout: none)` + `display-mode: standalone` do
    `style.css`) e vira 0 com a área segura 0 (iPhone deitado). Elemento novo preso ao topo usa a mesma soma; o
    `tests/navegador/iphone.js` reprova botão que comece na faixa ("na faixa que o iOS 26 embaça").
29. **Formulário novo das Listas usa a Ficha (V40.51.0).** Tarefa, rotina, nota, despesa e meta (celular) e o cartão e
    as janelas de rotina, despesa e meta (PC) seguem o mesmo desenho, escolhido por ele: o que é em cima com o ⋯
    (Arquivar/Apagar), o nome grande (`.fx-name`), a ficha (`.fx-card` com uma `.fx-row` por ajuste, o escolhido na
    direita em `.fx-val`, "Nenhuma" apagado) e o Salvar no pé. Escolher numa lista: no celular, `fxPick({ title, items |
    colors, onPick })` abre a folha `#fx-pick-modal` (o voltar e o fundo escuro fecham sem mexer); no PC, a linha com
    `data-fx-pop="<id>"` abre a `.fx-pop` presa nela (`fxPopOpen`/`fxPopClose`; o Esc e o clique fora fecham só ela).
    Formulário aberto no celular = `#list-sheet.fx-open` (`fxSync`): somem o "Menu", o X e as abas; formulário novo entra
    na lista do `fxSync` e o voltar dele é o ← com `data-voltar`. Linha que some (Meta sem metas, Parcelas) liga e
    desliga só com `.hidden` (o CSS dá `display` em `:not(.hidden)`). Texto de rótulo muda com `textContent`, não com
    `innerText` (o jsdom dos testes não tem `innerText`). O `tests/test_v40510.js` confere tudo isso.
    Tela cheia inteira na Ficha (o + da agenda e o Período inteiro, V40.51.1): a tela ganha `.fx-sheet` (o fundo e sem o
    respiro dos lados) e tem `.fx-head` (o X com `data-voltar="fechar"` ou o ← com `data-voltar`), `.fx-body` e `.fx-foot`
    dentro dela. Nada de fileira que rola pro lado (`overflow-x-auto`) num formulário: a 384 px ela cortava os botões
    (foto dele de 28/11); poucas opções viram `.fx-seg.full` numa `.fx-row.stack`, muitas viram linha que abre a folha.
    O `tests/test_v40511.js` confere o +. Janelinha com formulário na Ficha (o Editar da agenda e o Cartão da sublista,
    V40.51.2): sobe de baixo com `.fx-modal` (X com `data-voltar` + título, `.fx-body`, `.fx-foot`); a folha do `fxPick`
    por cima dela vai pra z 70 com o fundo escuro em 65 e, ao fechar, o fundo volta pra onde estava (`test_v40512.js`).

## Publicar uma versão

1. Faça a mudança e suba a versão nos cinco lugares da regra 2.
2. `npm run build:css` (se mexeu em classes) e `npm test`.
3. Envie para a branch `V-5.0`. O GitHub Pages publica em um ou dois minutos.
4. No celular, feche e abra o app (às vezes duas vezes) e confira o selo de versão no canto. No PC,
   atualize a página: o selo fica no canto de baixo, à direita.

## Antes de vender o app

- O GitHub Pages não permite hospedar serviço comercial: o app precisa mudar de hospedagem. É a hora
  de tirar o script do Tailwind do CDN e ficar só com o CSS pronto.
- No Supabase: endereço do site em Authentication → URL Configuration, SMTP próprio para os e-mails
  e proteção contra senha vazada.
- Política de privacidade e termos de uso.
