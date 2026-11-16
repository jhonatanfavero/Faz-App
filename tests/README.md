# Testes do Faz

```
npm install     # só na primeira vez (baixa o jsdom e o Tailwind)
npm test        # confere o CSS pronto e roda as 8 suítes (cerca de 1 minuto)
```

O `npm test` termina com `✅ TOTAL: N verificações passaram, 0 falharam`. Qualquer `❌` significa que
alguma coisa que funcionava deixou de funcionar: não publique antes de entender o motivo.
`node tests/run.js --tudo` mostra cada verificação, uma por linha.

## O que cada suíte cobre

| Arquivo | O que roda | O que confere |
|---|---|---|
| `sim_sync.js` | só o motor do `sync.js` | mesclagem celular × nuvem: conflitos, apagados, ordem, lista órfã, primeiro sync, duplicados |
| `test_app.js` | `index.html` + `app.js` + `sync.js` de verdade | app sem login, login, ida e volta com a nuvem, backup e restauração |
| `test_v408.js` | idem | agenda na nuvem, blocos de 5 e 10 min, dado corrompido, iOS, esqueci a senha |
| `test_v409.js` | idem | cor livre do cartão, arquivar e desarquivar |
| `test_v4091.js` | idem | listas afastadas, arrastar entre listas, pinça, sync do movimento |
| `test_atualizacao.js` | idem, partindo do estado gravado pela V40.7.0 | quem já sincronizava numa versão antiga abre a atual: nada se perde, nada é reenviado à toa, nenhuma pergunta aparece |
| `test_kanban.js` | `kanban.html` de verdade | tela do PC: listas, agenda (semana e dia), arrastar, arquivados, tempo real |
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
Para isso existem dois testes que abrem um Chrome de verdade:

```
npm i -D playwright && npx playwright install chromium    # uma vez
node tests/navegador/toque_listas.js    # listas afastadas e arrastar com o dedo
node tests/navegador/offline.js         # o app abre completo sem internet?
```

Com `CHROME=/caminho/do/chrome` eles usam um Chrome já instalado; com `FOTOS=/alguma/pasta` salvam
imagens das telas. Eles não entram no `npm test` porque o Playwright é pesado. Vale rodar quando
mexer em arrasto, rolagem, `sw.js` ou na pasta `libs/`.

O que nenhum teste daqui cobre: **Safari do iPhone**. Mudança de toque ou de layout precisa de uma
conferida num iPhone de verdade.
