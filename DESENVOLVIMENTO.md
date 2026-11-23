# Faz / TimeBlock — guia de quem mexe no código

O app é HTML + JavaScript puro, sem etapa de build: o que está nesta pasta é o que o GitHub Pages
publica (branch `V-5.0`, em `jhonatanfavero.github.io/Faz-App`).

## Mapa dos arquivos

| Arquivo | Papel |
|---|---|
| `index.html`, `app.js`, `style.css` | o app do celular (PWA) |
| `sync.js`, `faz-config.js` | sincronização opcional com o Supabase (endereço e chave pública do projeto) |
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
   sucesso, com o gesto (`var g = S.gesture`) guardado antes do primeiro `await`.
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
    relógio adiantado em outro aparelho não faz uma mudança nova perder.
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
