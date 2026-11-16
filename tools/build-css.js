#!/usr/bin/env node
// Gera libs/tailwind.css e libs/tailwind-kanban.css: o CSS do Tailwind já pronto, só com as classes usadas.
//
// Por que existe: o index.html ainda carrega o Tailwind pelo script do CDN (ele gera o CSS no
// aparelho, e por isso classe nova funciona sem build). Só que sem internet esse script não
// carrega. O libs/tailwind.css é a garantia: com ele o app abre com o visual completo offline
// e sem "piscar" enquanto o script baixa.
//
// A configuração (cores app-*, animações) é lida do próprio HTML de cada página, pra existir num
// lugar só. A tela do PC (kanban.html) tem o CSS dela: libs/tailwind-kanban.css.
//
//   npm run build:css                 gera os dois arquivos
//   node tools/build-css.js --check   confere se estão em dia (usado no npm test)
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Cada página tem a sua configuração do Tailwind (lida do próprio HTML) e o seu CSS pronto.
const TARGETS = [
    { page: 'index.html', content: ['index.html', 'app.js', 'sync.js'], out: 'libs/tailwind.css' },
    { page: 'kanban.html', content: ['kanban.html'], out: 'libs/tailwind-kanban.css' },
];

function readConfig(target) {
    const html = fs.readFileSync(path.join(ROOT, target.page), 'utf8');
    const m = html.match(/tailwind\.config\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
    if (!m) throw new Error('Não achei o "tailwind.config = {...}" em ' + target.page);
    const config = new Function('return (' + m[1] + ');')();
    config.content = target.content.map((f) => path.join(ROOT, f));
    return config;
}

function build(target, outFile) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'faz-css-'));
    try {
        const cfg = path.join(tmp, 'tailwind.config.js'), input = path.join(tmp, 'in.css');
        fs.writeFileSync(cfg, 'module.exports = ' + JSON.stringify(readConfig(target), null, 2) + ';\n');
        fs.writeFileSync(input, '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');
        const cli = require.resolve('tailwindcss/lib/cli.js');
        execFileSync(process.execPath, [cli, '-c', cfg, '-i', input, '-o', outFile, '--minify'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

const check = process.argv.includes('--check');
let stale = 0;
for (const target of TARGETS) {
    const out = path.join(ROOT, target.out);
    if (!check) {
        build(target, out);
        console.log(target.out + ' gerado: ' + Math.round(fs.statSync(out).size / 1024) + ' KB');
        continue;
    }
    const tmpOut = path.join(os.tmpdir(), 'faz-tailwind-check-' + process.pid + '.css');
    build(target, tmpOut);
    const fresh = fs.readFileSync(tmpOut, 'utf8');
    fs.rmSync(tmpOut, { force: true });
    const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (fresh === current) console.log('✅ ' + target.out + ' em dia (' + Math.round(current.length / 1024) + ' KB)');
    else { stale++; console.error('❌ ' + target.out + ' está desatualizado (alguma classe foi adicionada ou removida em ' + target.content.join(', ') + ').'); }
}
if (stale) { console.error('   Rode: npm run build:css   e publique os arquivos gerados junto.'); process.exit(1); }
