// Apoio dos testes de navegador (opcionais): servidor local igual ao GitHub Pages (/Faz-App/),
// Chrome com tela de celular e toque, e os dados fictícios já gravados antes do app abrir.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2' };

function servidor() {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            let p = decodeURIComponent(req.url.split('?')[0]);
            if (!p.startsWith('/Faz-App/')) { res.writeHead(404); return res.end(); }
            p = p.slice('/Faz-App/'.length) || 'index.html';
            const file = path.join(ROOT, p);
            if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
            res.writeHead(200, { 'Content-Type': TIPOS[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
            fs.createReadStream(file).pipe(res);
        }).listen(0, '127.0.0.1', () => resolve({ base: `http://localhost:${srv.address().port}/Faz-App/`, fechar: () => srv.close() }));
    });
}

async function abrir() {
    let chromium;
    try { ({ chromium } = require('playwright')); } catch (e) {
        console.log('Estes testes precisam do Playwright (npm i -D playwright && npx playwright install chromium). Pulando.');
        process.exit(0);
    }
    const srv = await servidor();
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', hasTouch: true, isMobile: true });
    const dados = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados-ficticios.json'), 'utf8')).data;
    await ctx.addInitScript((d) => { try { if (!localStorage.getItem('tb_backlog_db')) for (const k in d) localStorage.setItem(k, d[k]); } catch (e) {} }, dados);
    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
    const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: path.join(process.env.FOTOS, nome) }); };
    const fim = async (extra) => { console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====` + (extra || '')); await browser.close(); srv.fechar(); process.exit(fail ? 1 : 0); };
    return { ctx, base: srv.base, ok, foto, fim, ROOT };
}
module.exports = { abrir };
