// V40.50.1 — FOTO DELE DE 26/11, 18h28: "no iphone ta ficando embaçado em cima".
//   No app instalado no iPhone (black-translucent + viewport-fit=cover), o iOS 26+ desenha o "Liquid Glass" (o efeito de
//   borda da rolagem) por cima da página: um embaçado que desce uns 38–40 pt abaixo da barra de status. Nenhum CSS ou
//   meta desliga isso; o conteúdo do topo tem que começar depois da faixa. A folga (--faz-top-clear) só existe no
//   iPhone/iPad instalado (o bloco @supports só de iOS + display-mode: standalone) e com a barra de status à mostra
//   (deitado o iPhone esconde a barra: a área segura vira 0 e a folga também). Aqui: as regras do style.css e do
//   index.html. Quem confere a tela de verdade é o tests/navegador/iphone.js ("na faixa que o iOS 26 embaça").
// Uso: node tests/test_v40501.js <repo>
const fs = require('fs'), path = require('path');
const REPO = process.argv[2] || '.';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const sem = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ''); // sem os comentários
const c = sem(css);

console.log('A) A folga da faixa embaçada do iOS 26+');
ok(/:root \{[^}]*--faz-top-clear: 0px;/.test(c), 'a variável nasce 0 (Android, navegador e PC não mudam)');
const ios = c.indexOf('@supports (-webkit-touch-callout: none) {');
const blocoIos = ios >= 0 ? c.slice(ios, ios + 600) : '';
ok(ios > c.indexOf('--faz-top-clear: 0px') && /@media \(display-mode: standalone\) \{\s*:root \{ --faz-top-clear: min\(40px, calc\(env\(safe-area-inset-top, 0px\) \* 4\)\); \}/.test(blocoIos), 'só no iOS instalado ela vira até 40 px (e 0 quando a área segura é 0, com o iPhone deitado), depois da linha que nasce 0');
ok((c.match(/var\(--faz-top-clear, 0px\)/g) || []).length >= 5, 'quem usa a folga sempre tem o 0 de reserva');

console.log('\nB) Quem desce');
ok(/\.compact-header-padding:not\(\.header-collapsed\) \{\s*padding-top: max\(calc\(env\(safe-area-inset-top\) \+ var\(--faz-top-clear, 0px\)\), 20px\);/.test(c), 'o topo da agenda (inteiro)');
ok(/\.compact-header-padding\.header-collapsed \{\s*padding-top: max\(calc\(env\(safe-area-inset-top\) \+ var\(--faz-top-clear, 0px\)\), 12px\) !important;/.test(c), 'o topo recolhido ("Esconder o topo")');
ok(/header\.ag-slim \{[^}]*padding-top: max\(calc\(env\(safe-area-inset-top\) \+ var\(--faz-top-clear, 0px\)\), 12px\) !important;/.test(c), 'o topo encolhido (rolando a agenda)');
ok(/\[id\$="-sheet"\] \{ padding-top: max\(1\.5rem, calc\(var\(--faz-safe-top\) \+ max\(0\.75rem, calc\(var\(--faz-top-clear, 0px\) \+ 0\.5rem\)\)\)\) !important; \}/.test(c), 'as telas cheias (com + 0.5rem pelo -mt-2 da barra de cima delas; sem a folga continua o 0.75rem de antes)');
ok(/#ag-cal-modal, #ag-more-modal \{ top: calc\(max\(calc\(env\(safe-area-inset-top\) \+ var\(--faz-top-clear, 0px\)\), 20px\) \+ 46px\); \}/.test(c), 'o ⋯ e o calendário abrem abaixo da linha da data');
const more = (html.match(/<div id="ag-more-modal"[^>]*>/) || [''])[0];
ok(more && !/style=/.test(more), 'o ⋯ não tem mais o top no style do HTML (lá o teste do iPhone não troca o env(), e a folga não entrava)');
ok(/<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">/.test(html) && /viewport-fit=cover/.test(html), 'continua o app por baixo da barra de status (black-translucent + viewport-fit=cover): é isso que pede a folga');

console.log('\nC) O teste do iPhone confere a faixa');
const ip = fs.readFileSync(path.join(REPO, 'tests/navegador/iphone.js'), 'utf8');
ok(/\.replace\(\/\\\(display-mode:\\s\*standalone\\\)\/g, '\(min-width: 0px\)'\)/.test(ip), 'o iPhone de mentira se comporta como app instalado (a folga entra)');
ok(/v\.t < ip\.top \+ 38/.test(ip) && /na faixa que o iOS 26 embaça/.test(ip), 'e reprova botão que comece na faixa (até 38 px abaixo da barra de status)');

console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
process.exit(fail ? 1 : 0);
