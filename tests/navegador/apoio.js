// Apoio dos testes de navegador (opcionais): servidor local igual ao GitHub Pages (/Faz-App/),
// Chrome com tela de celular e toque, e os dados fictícios já gravados antes do app abrir.
// abrirPc(): a tela do PC (kanban.html) em tela larga, com relógio fixo e um Supabase falso no lugar do de verdade.
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

function playwright() {
    try { return require('playwright').chromium; } catch (e) {
        console.log('Estes testes precisam do Playwright (npm i -D playwright && npx playwright install chromium). Pulando.');
        process.exit(0);
    }
}
function placar(browser, srv) {
    let pass = 0, fail = 0;
    const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
    const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: path.join(process.env.FOTOS, nome) }); };
    const fim = async (extra) => { console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====` + (extra || '')); await browser.close(); srv.fechar(); process.exit(fail ? 1 : 0); };
    return { ok, foto, fim };
}

// Celular: tela de 390 px, toque, dados fictícios. celular(browser, extra) abre outro igual (extra: opções do Playwright,
// como userAgent), pra quem precisa de dois aparelhos no mesmo teste.
async function celular(browser, extra) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR', hasTouch: true, isMobile: true }, extra || {}));
    const dados = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados-ficticios.json'), 'utf8')).data;
    await ctx.addInitScript((d) => { try { if (!localStorage.getItem('tb_backlog_db')) for (const k in d) localStorage.setItem(k, d[k]); } catch (e) {} }, dados);
    return ctx;
}
async function abrir(extra) {
    const chromium = playwright();
    const srv = await servidor();
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
    const ctx = await celular(browser, extra);
    return Object.assign({ ctx, browser, base: srv.base, ROOT }, placar(browser, srv));
}

// Tela do PC. A "nuvem" é o mock_supabase.js dos outros testes, rodando dentro da própria página e já com os dados
// fictícios (como ficam depois do primeiro sync do celular). Fica em window.__nuvem pra o teste conferir o que foi gravado.
// O relógio da página começa na segunda 16/11/2026 às 10:20 (o dia seguinte ao "hoje" dos dados) e segue andando.
const UID = '11111111-2222-3333-4444-555555555555';
async function abrirPc() {
    const chromium = playwright();
    const srv = await servidor();
    const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
    await ctx.addInitScript(() => {
        const RD = Date, base = new RD(2026, 10, 16, 10, 20, 0).getTime(), t0 = RD.now(), agora = () => base + (RD.now() - t0);
        window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(agora()); } static now() { return agora(); } };
    });
    const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dados-ficticios.json'), 'utf8')).data;
    const plano = require(path.join(ROOT, 'sync.js')).plan({ local: { blocos: JSON.parse(d.tb_master_db), listas: JSON.parse(d.tb_backlog_columns), tags: JSON.parse(d.tb_tags_db), tarefas: JSON.parse(d.tb_backlog_db), rotinas: JSON.parse(d.tb_routines_db), notas: JSON.parse(d.tb_notes_db), financas: JSON.parse(d.tb_financial_db) }, remote: {}, firstSync: true });
    const nuvem = 'var __mock = (function () { var module = { exports: {} };\n' + fs.readFileSync(path.join(__dirname, '..', 'mock_supabase.js'), 'utf8') + '\nreturn module.exports; })();\n' +
        '(function () { var UID = ' + JSON.stringify(UID) + ', SEED = ' + JSON.stringify(plano.push) + ', s = __mock.makeServer(), u = s.addUser("pessoa@teste.com", "senha123", UID);\n' +
        'u.meta = { faz_theme: "#10b981", faz_hours: [7, 24] };\n' +
        '["listas", "tags", "tarefas", "blocos", "rotinas", "notas", "financas"].forEach(function (k) { (SEED[k] || []).forEach(function (r) { s.insert(k, UID, r); }); });\n' +
        's.storedSession = { access_token: "t", user: { id: UID, email: "pessoa@teste.com", user_metadata: u.meta } };\n' +
        'window.__nuvem = s; window.supabase = { createClient: __mock.makeCreateClient(s) }; })();';
    await ctx.route('**/libs/supabase-js/supabase.js', (r) => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: nuvem }));
    return Object.assign({ ctx, base: srv.base, ROOT, UID }, placar(browser, srv));
}
module.exports = { abrir, abrirPc, celular };
