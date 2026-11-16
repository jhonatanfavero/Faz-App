# libs/ — bibliotecas que vão junto com o app

Até a V40.9.1 a fonte, os ícones e o Supabase eram baixados de outros sites (Google Fonts, unpkg,
jsDelivr) toda vez que o app abria, sempre na "última versão". A partir da V40.10.0 eles ficam aqui:
versão travada, funcionam offline (o service worker guarda no cache) e nenhum dado de quem usa o app
vai para terceiros só por abrir a tela.

| Pasta / arquivo | O que é | Versão | Licença | Origem (pacote npm) |
|---|---|---|---|---|
| `inter/` | Fonte Inter (variável, pesos 100 a 900; subconjuntos latin e latin-ext) | 5.3.0 | SIL OFL 1.1 (`inter/LICENSE`) | `@fontsource-variable/inter` |
| `phosphor/` | Ícones Phosphor nos pesos regular, bold e fill | 2.1.2 | MIT (`phosphor/LICENSE`) | `@phosphor-icons/web` |
| `supabase-js/supabase.js` | Cliente do Supabase (login e sincronização) | 2.119.0 | MIT (`supabase-js/LICENSE`) | `@supabase/supabase-js` (`dist/umd/supabase.js`) |
| `tailwind.css` e `tailwind-kanban.css` | CSS do Tailwind já pronto, só com as classes usadas (app e tela do PC) | Tailwind 3.4.19 | MIT (aviso dentro do arquivo) | gerados por `npm run build:css` |

Alterações feitas nas cópias:

- **Phosphor:** o `@font-face` de cada `style.css` aponta só para o `.woff2` (os formatos antigos não vieram).
- **Inter:** `inter.css` foi montado com os dois subconjuntos e a família se chama `Inter`, como o app já usava.
- **supabase-js:** arquivo idêntico ao do pacote.

## Tailwind: por que existem o script do CDN **e** o `tailwind.css`

O `index.html` (e o `kanban.html`) continua carregando `https://cdn.tailwindcss.com`. Esse script gera o CSS no aparelho,
então uma classe nova colocada no HTML ou no `app.js` funciona na hora, sem build nenhum.

O problema é que sem internet o script não carrega e o app abriria sem visual. O `libs/tailwind.css`
resolve isso: é o mesmo CSS, gerado antes, que entra no cache offline. Ele vem depois do `style.css`,
na mesma ordem em que o script aplica as regras.

**Regra:** mexeu em classe do Tailwind no `index.html`, `app.js`, `sync.js` ou `kanban.html`? Rode
`npm run build:css` e publique os arquivos gerados junto. Se esquecer, online continua tudo certo (o script cobre); só
offline a classe nova fica sem estilo. O `npm test` avisa quando o arquivo está desatualizado.

O passo seguinte, quando o app for para uma hospedagem com build automático, é tirar o script do CDN e
ficar só com o `tailwind.css`.

## Como atualizar uma biblioteca

1. Baixe a versão nova do pacote npm indicado na tabela.
2. Substitua os arquivos desta pasta (repetindo as alterações listadas acima).
3. Atualize a versão na tabela, o `CACHE_NAME` do `sw.js` e rode `npm test`.
