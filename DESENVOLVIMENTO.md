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
2. **Mudou qualquer arquivo do app, mude o `CACHE_NAME` do `sw.js`.** Vale para tudo que está na lista
   `ASSETS` do `sw.js`, para o `kanban.html` e para o próprio `sw.js` (testes e documentação não contam).
   Sem isso os aparelhos continuam na versão antiga. Atualize junto o selo de versão no fim do `index.html` e a `version`
   do backup no `app.js`.
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

## Publicar uma versão

1. Faça a mudança e suba a versão nos três lugares da regra 2.
2. `npm run build:css` (se mexeu em classes) e `npm test`.
3. Envie para a branch `V-5.0`. O GitHub Pages publica em um ou dois minutos.
4. No celular, feche e abra o app (às vezes duas vezes) e confira o selo de versão no canto.

## Antes de vender o app

- O GitHub Pages não permite hospedar serviço comercial: o app precisa mudar de hospedagem. É a hora
  de tirar o script do Tailwind do CDN e ficar só com o CSS pronto.
- No Supabase: endereço do site em Authentication → URL Configuration, SMTP próprio para os e-mails
  e proteção contra senha vazada.
- Política de privacidade e termos de uso.
