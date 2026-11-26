// V40.50.0 — PEDIDO DELE DE 26/11: "se clicar em cima do dia quero que apareça o calendário pra selecionar o dia no celular"
//   A) celular: a data do topo da agenda é um botão (com o ⌄) que abre o calendário do mês do dia aberto: segunda a
//      domingo como a tira, 6 linhas sempre (os dias dos meses vizinhos apagados, tocáveis), o dia aberto cheio (ou os
//      2–3 dias da tela), hoje com contorno, a bolinha nos dias com bloco; ‹ › e arrastar pro lado trocam o mês (e o
//      ano); tocar num dia vai pra ele e fecha; "Hoje"; o voltar e o fundo escuro fecham; também no topo encolhido.
//   B) PC (tudo que tem no app tem que ter no PC): o nome da semana (ou do dia) na Agenda abre o mesmo calendário: na
//      Semana, os 7 dias na tela viram uma faixa; no Dia, o dia aberto fica cheio; a bolinha nos dias com bloco;
//      escolher leva a Agenda até lá; Esc, clicar fora e clicar no nome de novo fecham; começa na segunda.
// Uso: TZ='America/Sao_Paulo' node tests/test_v40500.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const boot = require('./boot_app');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], DADOS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 8000, step = 40) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }
const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const EU = 'aaaaaaaa-1111-4111-8111-111111111111';

(async () => {
  console.log('A) Celular: tocar na data abre o calendário');
  const A = await boot(REPO, DADOS.data), w = A.w, d = w.document, $ = A.$, ev = (x) => w.eval(x);
  const hidden = (id) => $(id).classList.contains('hidden');
  const cells = () => [...d.querySelectorAll('#ag-cal-grid [data-agc]')];
  const cell = (ds) => d.querySelector('#ag-cal-grid [data-agc="' + ds + '"]');
  const ids = (f) => cells().filter(f).map((c) => c.dataset.agc);
  const title = () => T($('ag-cal-title'));
  const hoje = ev('getTodayStr()'); // 15/11/2026 (o relógio dos testes)
  ev('activeDateObj = new Date(2026, 10, 18); runRealTimeEngine(); renderTimeline();');
  const hd = $('header-date');
  ok(hd.tagName === 'BUTTON' && hd.getAttribute('aria-haspopup') === 'dialog' && /calendário/.test(hd.title) && !!hd.querySelector('.hd-caret') && /Quarta, 18 nov/.test(T(hd)), 'a data do topo é um botão com o ⌄ ("' + T(hd) + '")');
  ok(hidden('ag-cal-modal'), 'o calendário começa fechado');
  hd.click(); await sleep(10);
  ok(!hidden('ag-cal-modal') && !$('overlay').classList.contains('pointer-events-none'), 'tocar na data abre o calendário (com o fundo escuro)');
  ok(title() === 'Novembro de 2026' && [...d.querySelectorAll('#ag-cal-modal .agc-wk span')].map(T).join('') === 'STQQSSD', 'o mês do dia aberto ("' + title() + '"), de segunda a domingo como a tira');
  ok(cells().length === 42 && cells()[0].dataset.agc === '2026-10-26' && cells()[41].dataset.agc === '2026-12-06', '6 linhas sempre: da segunda 26/10 ao domingo 06/12');
  ok(ids((c) => c.classList.contains('on')).join() === '2026-11-18' && cell('2026-11-18').getAttribute('aria-pressed') === 'true', 'o dia aberto (18) cheio');
  ok(ids((c) => c.classList.contains('hj')).join() === hoje && /\(hoje\)/.test(cell(hoje).getAttribute('aria-label')), 'hoje (' + hoje + ') com contorno e "(hoje)" no nome');
  const fora = ids((c) => c.classList.contains('fora'));
  ok(fora.length === 12 && fora.every((x) => !x.startsWith('2026-11')), 'os 12 dias de outubro e dezembro apagados (fora do mês)');
  const comBloco = new Set(JSON.parse(ev("JSON.stringify([...new Set(db.filter(b => b && b.date && b.type !== 'empty').map(b => b.date))])")));
  ok(comBloco.size > 0 && cells().every((c) => c.querySelector('.agc-b').classList.contains('tem') === comBloco.has(c.dataset.agc)), 'a bolinha só nos dias que têm bloco (' + ids((c) => c.querySelector('.agc-b.tem')).length + ' dias)');
  ok(/quarta-feira, 18 de novembro de 2026/.test(cell('2026-11-18').getAttribute('aria-label')), 'cada dia diz o nome inteiro ("' + cell('2026-11-18').getAttribute('aria-label') + '")');
  // trocar o mês
  d.querySelector('#ag-cal-modal [aria-label="Mês anterior"]').click();
  ok(title() === 'Outubro de 2026' && !hidden('ag-cal-modal'), '‹ vai pro mês anterior (continua aberto)');
  const nx = d.querySelector('#ag-cal-modal [aria-label="Mês seguinte"]');
  nx.click(); nx.click();
  ok(title() === 'Dezembro de 2026' && cells()[0].dataset.agc === '2026-11-30' && ids((c) => c.classList.contains('on')).join() === '', '› dezembro (começa na segunda 30/11; o 18 de novembro não aparece)');
  nx.click();
  ok(title() === 'Janeiro de 2027', 'e vira o ano: Janeiro de 2027');
  const m = $('ag-cal-modal');
  const fire = (target, type, pts, changed) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); e.changedTouches = (changed || pts).map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); };
  fire(cell('2027-01-13'), 'touchstart', [[120, 300]]); fire(cell('2027-01-13'), 'touchend', [], [[280, 306]]);
  ok(title() === 'Dezembro de 2026', 'arrastar pra direita: o mês anterior');
  cell('2026-12-09').click(); await sleep(10);
  ok(!hidden('ag-cal-modal') && ev('getActiveDateStr()') === '2026-11-18', 'o "clique" que vem logo depois do arrasto não escolhe o dia');
  await sleep(420);
  fire(m, 'touchstart', [[60, 200]]); fire(m, 'touchend', [], [[70, 330]]);
  ok(title() === 'Dezembro de 2026', 'arrastar pra baixo não troca o mês');
  fire(m, 'touchstart', [[300, 300]]); fire(m, 'touchend', [], [[150, 304]]);
  ok(title() === 'Janeiro de 2027', 'arrastar pra esquerda: o mês seguinte');
  ev('agCalMonth(-1)'); await sleep(420);
  // escolher
  cell('2026-12-03').click(); await sleep(10);
  ok(hidden('ag-cal-modal') && $('overlay').classList.contains('pointer-events-none') && ev('getActiveDateStr()') === '2026-12-03', 'tocar no 3 de dezembro: fecha e a agenda vai pra ele');
  ok(/3 dez/.test(T(hd)) && d.querySelector('#header-filters-row [data-agw]').dataset.agw === '2026-11-30' && d.querySelector('#header-filters-row .agw-d.on').dataset.agw === '2026-12-03', 'o topo e a tira acompanham ("' + T(hd) + '", a semana de 30/11)');
  hd.click(); await sleep(10);
  ok(title() === 'Dezembro de 2026' && ids((c) => c.classList.contains('on')).join() === '2026-12-03', 'abre de novo no mês do dia aberto (dezembro, o 3 cheio)');
  cell('2027-01-02').click(); await sleep(10);
  ok(ev('getActiveDateStr()') === '2027-01-02' && hidden('ag-cal-modal'), 'tocar num dia apagado (2 de janeiro, do mês seguinte) também vai pra ele');
  hd.click(); await sleep(10);
  ok(title() === 'Janeiro de 2027', 'e o calendário abre em janeiro');
  $('ag-cal-today').click(); await sleep(10);
  ok(ev('getActiveDateStr()') === hoje && hidden('ag-cal-modal') && $('ag-today-chip').disabled, '"Hoje": vai pra hoje e fecha');
  // 3 dias na tela
  ev('setTlDays(3)'); await sleep(10);
  hd.click(); await sleep(10);
  const on3 = ids((c) => c.classList.contains('on'));
  ok(on3.length === 3 && on3[0] === hoje, 'com 3 dias na tela, os 3 ficam cheios (' + on3.join(', ') + ')');
  cell('2026-11-20').click(); await sleep(10);
  ok(ev('tlDays') === 3 && ev('tlMultiDays()[0]') === '2026-11-20' && hidden('ag-cal-modal'), 'escolher um dia: ele passa a ser o primeiro dos 3');
  ev('setTlDays(1)'); await sleep(10);
  // fechar pelo voltar e pelo fundo escuro
  hd.click(); await sleep(10);
  ok(ev('navBack()') === true && hidden('ag-cal-modal') && $('overlay').classList.contains('pointer-events-none'), 'o voltar do celular fecha o calendário');
  hd.click(); await sleep(10);
  ev('onOverlayClick()'); await sleep(10);
  ok(hidden('ag-cal-modal') && ev('getActiveDateStr()') === '2026-11-20', 'tocar no fundo escuro fecha (sem mudar o dia)');
  // no topo encolhido
  ev('agSlimSet(true)');
  ok(d.querySelector('header').classList.contains('ag-slim') && !$('ag-slim-bar').contains(hd), 'o topo encolhido continua com a data (fora da barrinha do Planejado)');
  hd.click(); await sleep(10);
  ok(!hidden('ag-cal-modal'), 'tocar na data com o topo encolhido também abre o calendário');
  ev('closeAgCal(); agSlimSet(false);');
  // regras
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');
  ok(!/<input[^>]+type="date"/.test(html), 'nenhum <input type="date"> no celular: o calendário é o nosso (em português, segunda a domingo)');
  ok(!/focus\(/.test(ev('openAgCal.toString()') + ev('renderAgCal.toString()') + ev('agCalPick.toString()')), 'Regra de Ouro #2: abrir o calendário não chama focus()');
  ok($('ag-cal-modal').querySelector('[data-voltar]') && /Fechar/.test(T($('ag-cal-modal').querySelector('[data-voltar]'))), 'o Fechar é o botão do voltar (data-voltar)');
  ok(/\.agc-d\.on \{ background: var\(--theme-color, #4f46e5\)/.test(css) && /\.hd-date \{ padding-top: 5px; padding-bottom: 3px;/.test(css), 'CSS: o dia aberto na cor do app; a data com a área de toque maior');
  ok(A.errors.length === 0, 'sem erro no celular' + (A.errors.length ? ': ' + A.errors[0] : ''));

  console.log('\nB) PC: o nome da semana (ou do dia) abre o calendário');
  const S = makeServer();
  S.addUser('eu@teste.com', 'senha123', EU);
  const J = (k) => JSON.parse(DADOS.data[k]);
  const p0 = CORE.plan({ local: { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const row of p0.push[k]) S.tables[k].set(EU + '|' + row.id, { ...row, user_id: EU, updated_at: new Date(Date.now() + ++S.clock).toISOString() });
  S.storedSession = { access_token: 'tok', user: { id: EU, email: 'eu@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const msg = a.map(String).join(' '); if (!msg.startsWith('[Faz kanban]')) errors.push(msg); });
  let page = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + (f === 'sync.js' ? 'window.FAZ_SYNC_CORE_ONLY = true;' : '') + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  page = page.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(page, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(cw) {
      const RD = cw.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      let n = 0;
      cw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX + n); } static now() { return FIX + (n += 7); } };
      cw.supabase = { createClient: makeCreateClient(S) };
      cw.CSS = cw.CSS || {}; cw.CSS.escape = cw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      cw.HTMLElement.prototype.scrollIntoView = function () {};
      cw.HTMLElement.prototype.scrollTo = function () {};
    },
  });
  const cw = dom.window, cd = cw.document, $c = (id) => cd.getElementById(id);
  const click = (el) => el.dispatchEvent(new cw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (k) => cd.dispatchEvent(new cw.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  await waitFor(() => cd.querySelectorAll('section.col').length > 0, 8000);
  click($c('tab-agenda')); await sleep(80);
  const btn = $c('ag-cal-btn'), pop = $c('cal-pop'), lbl = () => T($c('ag-label'));
  const pc = (ds) => pop.querySelector('[data-cal-day="' + ds + '"]');
  const band = () => [...pop.querySelectorAll('.cal-band')].map((b) => b.dataset.calDay.slice(8) + (b.classList.contains('cal-b0') ? '<' : '') + (b.classList.contains('cal-b6') ? '>' : '')).join(' ');
  const shown = () => !pop.classList.contains('hidden');
  ok(btn.contains($c('ag-label')) && btn.getAttribute('aria-haspopup') === 'dialog' && btn.getAttribute('aria-expanded') === 'false' && lbl() === '16 a 22 de nov', 'o nome da semana ("' + lbl() + '") virou um botão com o ⌄');
  click(btn); await sleep(10);
  const grids = () => pop.querySelectorAll('.grid');
  ok(shown() && btn.getAttribute('aria-expanded') === 'true' && T($c('cal-title')) === 'Novembro de 2026' && [...grids()[0].children].map(T).join('') === 'STQQSSD', 'clicar abre o calendário de novembro, de segunda a domingo');
  ok(grids()[1].querySelectorAll(':scope > span').length === 6 && grids()[1].querySelectorAll('[data-cal-day]').length === 30, 'novembro de 2026 começa num domingo: 6 vazios antes');
  ok(band() === '16< 17 18 19 20 21 22>' && !pop.querySelector('[aria-current="date"]'), 'na Semana, os 7 dias na tela viram uma faixa (' + band() + ')');
  ok(/text-focus/.test(pc('2026-11-16').className) && /ring-1/.test(pc('2026-11-16').className), 'hoje (16) com o número na cor e o contorno');
  const blk = new Set(J('tb_master_db').filter((b) => b && b.date && b.type !== 'empty' && !b.deleted && !b.archived).map((b) => String(b.date).slice(0, 10)));
  const nov = [...grids()[1].querySelectorAll('[data-cal-day]')]; // (o "Hoje" do pé também tem data-cal-day)
  ok(nov.some((b) => b.querySelector('.cal-dot')) && nov.every((b) => !!b.querySelector('.cal-dot') === blk.has(b.dataset.calDay)), 'a bolinha só nos dias que têm bloco (' + nov.filter((b) => b.querySelector('.cal-dot')).length + ' dias em novembro)');
  key('ArrowRight'); await sleep(10);
  ok(lbl() === '16 a 22 de nov' && shown(), 'com o calendário aberto, a seta do teclado não anda a Agenda');
  click(pop.querySelector('[data-cal-nav="1"]'));
  ok(T($c('cal-title')) === 'Dezembro de 2026' && band() === '' && shown(), '› dezembro (a semana na tela não está nele: sem faixa)');
  click(pc('2026-12-03')); await sleep(20);
  ok(!shown() && btn.getAttribute('aria-expanded') === 'false' && lbl() === '30 de nov a 6 de dez' && cd.activeElement === btn, 'escolher o 3 de dezembro: fecha e a Agenda mostra a semana dele ("' + lbl() + '")');
  click(btn); await sleep(10);
  ok(T($c('cal-title')) === 'Dezembro de 2026' && band() === '01< 02 03 04 05 06>', 'abre de novo no mês da semana (o da quinta: dezembro), a faixa de 1 a 6');
  click([...pop.querySelectorAll('[data-cal-day]')].find((b) => T(b) === 'Hoje')); await sleep(20);
  ok(!shown() && lbl() === '16 a 22 de nov', '"Hoje" volta pra semana de hoje');
  click(cd.querySelector('.ag-view[data-view="day"]')); await sleep(30);
  ok(lbl() === 'Segunda, 16 de novembro (hoje)', 'visão Dia: "' + lbl() + '"');
  click(btn); await sleep(10);
  ok(shown() && pop.querySelector('[aria-current="date"]').dataset.calDay === '2026-11-16' && band() === '', 'no Dia, o dia aberto fica cheio (sem faixa)');
  click(pc('2026-11-26')); await sleep(20);
  ok(!shown() && lbl() === 'Quinta, 26 de novembro', 'escolher o 26: a Agenda vai pro dia ("' + lbl() + '")');
  click(btn); await sleep(10);
  key('Escape'); await sleep(10);
  ok(!shown() && btn.getAttribute('aria-expanded') === 'false', 'Esc fecha');
  click(btn); await sleep(10); click(btn); await sleep(10);
  ok(!shown(), 'clicar no nome de novo fecha');
  click(btn); await sleep(10); click(cd.body); await sleep(10);
  ok(!shown() && lbl() === 'Quinta, 26 de novembro', 'clicar fora fecha (sem mudar o dia)');
  ok(cd.querySelectorAll('input[type="date"], input[type="time"]').length === 0, 'sem o calendário do navegador');
  ok(errors.length === 0, 'sem erro no PC' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
