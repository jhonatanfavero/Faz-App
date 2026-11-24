// O app abre completo SEM INTERNET? Servidor local igual ao GitHub Pages; o CDN do Tailwind é bloqueado
// de propósito (é a situação de um aparelho sem acesso a ele). Confere bibliotecas locais, cache do
// service worker, abertura offline e a tela do PC.
// Opcional: precisa do Playwright. Uso: node tests/navegador/offline.js   (CHROME=… e FOTOS=… como no outro teste)
const fs = require('fs'), path = require('path');
const { abrir } = require('./apoio');
(async () => {
  const { ctx, base, ok, foto, fim, ROOT } = await abrir();
  await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
  const m = await ctx.newPage(); const errs = [], bad = [], ext = new Set(), local = new Set();
  m.on('pageerror', (e) => errs.push(String(e)));
  m.on('response', (r) => { const u = new URL(r.url()); if (u.hostname === 'localhost') { local.add(u.pathname); if (r.status() >= 400) bad.push(r.status() + ' ' + u.pathname); } });
  m.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && u.protocol.startsWith('http')) ext.add(u.hostname); });
  await m.goto(base + 'index.html'); await m.waitForTimeout(1500);

  console.log('A) Primeira abertura (sem acesso ao CDN do Tailwind):');
  ok(bad.length === 0, 'nenhum arquivo do app deu erro ao carregar' + (bad.length ? ': ' + bad.join(', ') : ''));
  ok([...ext].join() === 'cdn.tailwindcss.com', 'o único site de fora que o app procura é o do Tailwind (' + ([...ext].join(', ') || 'nenhum') + ')');
  ok(errs.length === 0, 'nenhum erro de página, mesmo sem o script do Tailwind' + (errs.length ? ': ' + errs[0].slice(0, 120) : ''));
  const f = await m.evaluate(async () => { await document.fonts.ready; const i = document.querySelector('i.ph, i[class*="ph-"]'); const ic = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e), b = getComputedStyle(e, '::before'); return { fam: cs.fontFamily, content: b.content, w: Math.round(e.getBoundingClientRect().width) }; };
    return { inter: document.fonts.check('600 16px Inter'), ph: document.fonts.check('16px Phosphor'), bold: document.fonts.check('16px "Phosphor-Bold"'), fill: document.fonts.check('16px "Phosphor-Fill"'), body: getComputedStyle(document.body).fontFamily, reg: ic('i.ph'), b: ic('i.ph-bold'), fl: ic('i.ph-fill'), loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '')) }; });
  ok(f.inter && /Inter/.test(f.body) && f.loaded.includes('Inter'), 'fonte Inter carregada da pasta do app');
  ok(f.ph && f.reg && /Phosphor/.test(f.reg.fam) && f.reg.content && f.reg.content !== 'none' && f.reg.w > 4, 'ícones regulares desenhados');
  ok(f.bold && f.b && /Phosphor-Bold/.test(f.b.fam) && f.b.content !== 'none', 'ícones bold desenhados');
  ok(f.fill ? (!f.fl || /Phosphor-Fill/.test(f.fl.fam)) : false, 'ícones fill disponíveis');
  const tw = await m.evaluate(() => { const has = (sel) => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => (r.selectorText || '').split(',').some((x) => x.trim() === sel) || (r.cssRules && [...r.cssRules].some((q) => (q.selectorText || '') === sel))); } catch (e) { return false; } }); const kf = (n) => [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => r.type === 7 && r.name === n); } catch (e) { return false; } });
    const fromStatic = [...document.styleSheets].filter((s) => /libs\/tailwind\.css/.test(s.href || '')).length; const gen = [...document.querySelectorAll('style')].filter((s) => /tailwindcss v/.test(s.textContent)).length;
    return { fromStatic, gen, flex: has('.flex'), focus: has('.bg-app-focus'), hatched: has('.bg-hatched'), pulse: has('.animate-pulse-drop') && kf('pulseDrop'), bubble: has('.animate-float-bubble') && kf('floatBubble'), arb: has('.z-\\[60\\]'), bodyFlex: getComputedStyle(document.body).display, tw: typeof tailwind, cfg: typeof tailwind === 'object' && !!tailwind.config }; });
  ok(tw.fromStatic === 1 && tw.gen === 0, 'visual vindo do libs/tailwind.css (o script do CDN não carregou aqui)');
  ok(tw.flex && tw.focus && tw.hatched && tw.pulse && tw.bubble && tw.arb && tw.bodyFlex === 'flex', 'classes, cores app-*, fundo hachurado e animações do app estão no CSS pronto');
  ok(tw.tw === 'object' && tw.cfg, 'a configuração não quebra sem o script (sem "tailwind is not defined")');
  const missing = await m.evaluate(() => {
    // toda classe usada na tela que "tem cara" de Tailwind precisa ter regra em alguma folha de estilo
    const sels = new Set(); const walk = (rules) => { for (const r of rules) { if (r.selectorText) (r.selectorText.match(/\.(?:\\.|[\w-])+/g) || []).forEach((x) => sels.add(x.slice(1).replace(/\\(.)/g, '$1'))); if (r.cssRules) walk(r.cssRules); } };
    for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) {} }
    openListSheet(); const used = new Set(); document.querySelectorAll('*').forEach((el) => { (el.getAttribute('class') || '').split(/\s+/).forEach((c) => c && used.add(c)); });
    const twLike = /^(?:(?:hover|active|focus|focus-within|disabled|group-hover|sm|md|lg|selection|placeholder|last|first):)*-?(?:flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|inset|top|right|bottom|left|z|w|h|min|max|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space|bg|text|font|leading|tracking|border|rounded|shadow|opacity|overflow|items|justify|self|shrink|grow|transition|duration|ease|scale|translate|rotate|cursor|pointer|select|truncate|uppercase|whitespace|break|snap|ring|outline|animate|line|order|col|row|object|backdrop|blur|divide|place|content|underline|italic|sr|touch|resize|appearance|origin|transform|filter|fill|stroke|list|align|table|visible|invisible|isolate|aspect|basis|size|accent|caret|decoration|indent|tabular|antialiased|capitalize|lowercase|normal|no|pointer)(?:$|[-\[])/;
    return [...used].filter((c) => twLike.test(c) && !sels.has(c)).sort(); });
  ok(missing.length === 0, 'toda classe com cara de Tailwind usada nas telas tem regra no CSS' + (missing.length ? ' — SEM REGRA: ' + missing.slice(0, 25).join(' ') : ''));
  await m.evaluate(() => closeAllSheets()); await m.waitForTimeout(400);
  await foto(m, 'v10_timeline.png');

  console.log('\nB) Cache offline (service worker):');
  const sw = await m.evaluate(async () => { const reg = await navigator.serviceWorker.ready; const keys = await caches.keys(); const c = await caches.open(keys[0]); const reqs = await c.keys(); return { state: reg.active && reg.active.state, keys, n: reqs.length, urls: reqs.map((r) => new URL(r.url).pathname) }; });
  const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const lista = (swSrc.match(/const ASSETS = \[([\s\S]*?)\];/) || [])[1] || ''; // V40.42.0: só a lista (o sw.js tem outros './' agora: o ícone do aviso)
  const assets = (lista.match(/'\.\/[^']*'/g) || []).length, cacheName = (swSrc.match(/CACHE_NAME = '([^']+)'/) || [])[1];
  ok(sw.state === 'activated' && sw.keys.join() === cacheName, 'service worker ativo com o cache ' + sw.keys.join());
  ok(sw.n === assets && assets >= 16, `os ${assets} arquivos da lista do sw.js entraram no cache (${sw.n})`);
  await ctx.setOffline(true);
  const errs2 = []; m.on('pageerror', (e) => errs2.push(String(e)));
  await m.reload(); await m.waitForTimeout(1500);
  const off = await m.evaluate(async () => { await document.fonts.ready; const i = document.querySelector('i.ph'); return { title: document.title, blocks: document.querySelectorAll('[data-block-id]').length, inter: document.fonts.check('600 16px Inter'), ph: document.fonts.check('16px Phosphor') && getComputedStyle(i, '::before').content !== 'none', flex: getComputedStyle(document.body).display, btn: (() => { const e = document.querySelector('.bg-app-focus'); return e ? getComputedStyle(e).backgroundColor : ''; })(), seal: (document.body.innerText.match(/v40\.\d+\.\d+/) || [''])[0], sheets: [...document.styleSheets].filter((s) => { try { return s.cssRules.length > 0; } catch (e) { return false; } }).length }; });
  ok(off.blocks >= 0 && off.flex === 'flex' && off.inter && off.ph && off.sheets >= 6 && errs2.length === 0, `SEM INTERNET o app abre completo: fonte, ícones e layout (${off.sheets} folhas de estilo, selo ${off.seal})`);
  ok(/rgb\(/.test(off.btn) && off.btn !== 'rgba(0, 0, 0, 0)', 'cor do tema aplicada offline (' + off.btn + ')');
  await foto(m, 'v10_offline.png');
  await m.evaluate(() => openListSheet()); await m.waitForTimeout(600); await foto(m, 'v10_offline_lista.png');
  await m.evaluate(() => { closeAllSheets(); openConfigSheet(); }); await m.waitForTimeout(600); await foto(m, 'v10_offline_config.png');
  await ctx.setOffline(false);

  console.log('\nC) Tela do PC (kanban.html):');
  const k = await ctx.newPage(); const kbad = [], kext = new Set(), kerr = [];
  k.on('pageerror', (e) => kerr.push(String(e)));
  k.on('response', (r) => { const u = new URL(r.url()); if (u.hostname === 'localhost' && r.status() >= 400) kbad.push(r.status() + ' ' + u.pathname); });
  k.on('request', (r) => { const u = new URL(r.url()); if (u.hostname !== 'localhost' && u.protocol.startsWith('http')) kext.add(u.hostname); });
  await k.setViewportSize({ width: 1280, height: 800 }); await k.goto(base + 'kanban.html'); await k.waitForTimeout(1500);
  const kk = await k.evaluate(async () => { await document.fonts.ready; return { sb: typeof supabase === 'object' && typeof supabase.createClient, inter: (await document.fonts.load('600 16px Inter')).length > 0, ph: (await document.fonts.load('16px Phosphor')).length > 0 && (await document.fonts.load('16px "Phosphor-Bold"')).length > 0 && (await document.fonts.load('16px "Phosphor-Fill"')).length > 0, icons: document.querySelectorAll('i[class*="ph"]').length }; });
  ok(kbad.length === 0 && kk.sb === 'function', 'Supabase carregado da pasta do app (createClient disponível)' + (kbad.length ? ' ' + kbad.join() : ''));
  ok(kk.inter && kk.ph, 'fonte e ícones locais também no PC');
  const kextList = [...kext].filter((h) => !/supabase\.co$/.test(h));
  ok(kextList.join() === 'cdn.tailwindcss.com', 'de fora, só o Tailwind e o próprio Supabase (' + [...kext].join(', ') + ')');
  ok(kerr.length === 0, 'sem erros de página, mesmo sem o script do Tailwind' + (kerr.length ? ' [' + kerr.map((e) => e.slice(0, 60)).join(' | ') + ']' : ''));
  const kt = await k.evaluate(() => { const st = [...document.styleSheets].filter((x) => /libs\/tailwind-kanban\.css/.test(x.href || '')); const btn = document.querySelector('button'); return { n: st.length, rules: st[0] ? st[0].cssRules.length : 0, btnCursor: btn ? getComputedStyle(btn).cursor : '', boxSizing: getComputedStyle(document.body).boxSizing }; });
  ok(kt.n === 1 && kt.rules > 50 && kt.boxSizing === 'border-box', 'tela do PC com o visual do libs/tailwind-kanban.css (' + kt.rules + ' regras)');
  await foto(k, 'v10_kanban_login.png');
  await fim();
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
