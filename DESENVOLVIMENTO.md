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
   sem reenviar tudo para a nuvem. `tests/test_atualizacao.js` é o modelo.
8. **`npm test` verde antes de publicar.** Mexeu em arrasto, rolagem, `sw.js` ou `libs/`? Rode também
   os testes de navegador.
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
11. **Arrasto no celular não deixa a agenda redesenhar no meio (V40.30.0).** Enquanto `mbDragActive`
    ou `subDrag` estão ligados, o `renderTimeline()` não roda e o sync espera (`appBusy()` no `sync.js`);
    no fim do arrasto, redesenhe. Arrasto novo: segurar 400 ms, `touchstart` não-passivo no elemento
    (sem isso o navegador não deixa parar a rolagem depois), trate o `touchcancel` e engula o clique
    que sobra ao soltar.
12. **Despesa recorrente é sem fim (V40.30.0).** "Sem fim" = `durationMonths` / `duration_months` 1200
    (`REC_OPEN`, o máximo que a nuvem aceita); encerrar = os meses até o último. Nunca escreva um valor
    por mês pro futuro de uma recorrente (seriam 1200): "neste e nos próximos" troca o valor normal e
    guarda o valor antigo nos meses de antes (`setAmountFromMonthOn` no app, o mesmo no PC). Salvar o
    formulário de uma recorrente mantém o fim que ela tiver.

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
