// V40.47.1 — consertos de 26/11 (fotos dele):
//   A) CELULAR: sublista de 5 e 10 min numa linha só (antes o nome saía cortado ao meio): .sub-nano/.sub-nano-5, a
//      duração depois do nome ("• 5m") em toda sublista curta (até 20 min), a de 30 min como sempre; aberta, volta ao
//      desenho cheio; com a tarefa na mão, o "Colocar aqui" vai na linha do nome (e tocar coloca dentro);
//      na agenda afastada (3 dias), a sublista pintada de cor escura ganha letra clara;
//   B) CELULAR: o + abre SEM o teclado (nada de foco no "Nome da tarefa"), pelo botão e pelos 2 toques no vazio;
//   C) CELULAR: o Config do + vira só a engrenagem, na linha do Descanso e da Sublista (o X sozinho em cima);
//   D) PC, visão Dia: a sublista de 5 e 10 min também numa linha só (.ag-sub-tiny/.ag-sub-5).
// Uso: TZ='America/Sao_Paulo' node test_v40471.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }
const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {
  // ---------------------------------------------------------------- celular
  const B = await boot(REPO, backup.data), { w, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const D = '2026-11-20'; // sexta, depois do "hoje" dos dados (15/11): os blocos são futuros
  ev(`(() => {
    const cards = (n, done) => Array.from({ length: n }, (_, i) => ({ id: 'cd_v' + n + '_' + i + '_' + done, title: 'Cartão ' + (i + 1), done: i < done, microblocks: [] }));
    const add = (o) => db.push(Object.assign({ type: 'focus', date: '${D}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false }, o));
    add({ id: 'f_s5', title: 'CONSULTA DO DIA', startMin: 840, duration: 5, cards: cards(4, 0) });
    add({ id: 'f_s10', title: 'LIGAÇÕES', startMin: 845, duration: 10, cards: cards(3, 1) });
    add({ id: 'f_s15', title: 'PAPELADA', startMin: 860, duration: 15, cards: cards(2, 0) });
    add({ id: 'f_s20', title: 'MERCADO', startMin: 880, duration: 20, cards: cards(5, 2) });
    add({ id: 'f_s30', title: 'TARDE', startMin: 900, duration: 30, cards: cards(3, 0) });
    add({ id: 'f_sdk', title: 'ESCURA', startMin: 935, duration: 10, cards: cards(1, 0), color: '#1e3a8a' });
    add({ id: 'f_sl', title: 'CLARA', startMin: 950, duration: 10, cards: cards(1, 0), color: '#fde68a' });
    saveDb(); closeAllSheets(); activeDateObj = new Date(2026, 10, 20); renderTimeline();
  })()`);
  await sleep(60);
  const el = (id) => d.querySelector(`.block-item[data-block-id="${id}"]`);
  const has = (id, c) => !!el(id) && el(id).classList.contains(c);
  const micro = (id) => T(el(id) && el(id).querySelector('.micro-time'));
  const timeHidden = (id) => { const t = el(id) && el(id).querySelector('.time-label'); return !!t && t.classList.contains('hidden'); };

  console.log('A) Sublista curta numa linha só (celular):');
  ok(has('f_s5', 'sub-block') && has('f_s5', 'sub-nano') && has('f_s5', 'sub-nano-5'), '5 min: .sub-nano e .sub-nano-5 (uma linha, 11 px por dentro, sem os botões)');
  ok(micro('f_s5') === '• 5m' && T(el('f_s5').querySelector('.sub-count')) === '0/4' && T(el('f_s5').querySelector('.sub-title')) === 'CONSULTA DO DIA' && timeHidden('f_s5'), '5 min: o nome, "• 5m" e "0/4" na mesma linha (a linha do horário fica escondida)');
  ok(has('f_s10', 'sub-nano') && !has('f_s10', 'sub-nano-5') && micro('f_s10') === '• 10m' && el('f_s10').querySelectorAll('.block-btn').length === 2, '10 min: .sub-nano (botões de 24 px), "• 10m"');
  ok(!has('f_s15', 'sub-nano') && micro('f_s15') === '• 15m' && !has('f_s20', 'sub-nano') && micro('f_s20') === '• 20m' && timeHidden('f_s20'), '15 e 20 min: o cabeçalho de sempre, agora com a duração depois do nome ("• 15m", "• 20m")');
  ok(!has('f_s30', 'sub-nano') && !el('f_s30').querySelector('.micro-time') && !timeHidden('f_s30') && /15:00 - 15:30/.test(T(el('f_s30').querySelector('.time-label'))), '30 min: como antes (horário em cima, sem a duração repetida)');
  ok(el('f_s15').querySelector('.micro-time').getAttribute('onclick') && /openTimePicker\('f_s15'/.test(el('f_s15').querySelector('.micro-time').getAttribute('onclick')), 'tocar na duração abre o "Alterar Horário" (como nos blocos curtos)');
  el('f_s15').querySelector('.micro-time').click(); await sleep(40);
  ok(!$('time-picker-modal').classList.contains('hidden') && !ev(`db.find((b) => b.id === 'f_s15').expanded`), '…e abre mesmo, sem abrir a sublista junto');
  ev(`closeAllSheets(); hideModal && hideModal('time-picker-modal')`); await sleep(30);
  el('f_s5').querySelector('.sub-title').closest('.flex').click(); await sleep(60);
  ok(ev(`db.find((b) => b.id === 'f_s5').expanded`) === true && !has('f_s5', 'sub-nano') && !el('f_s5').querySelector('.micro-time') && !!el('f_s5').querySelector('.sub-input'), 'tocar na de 5 min abre a sublista: aberta, volta ao desenho cheio (com o "+ Adicionar cartão")');
  ev(`toggleExpandBlock('f_s5', { stopPropagation() {} })`); await sleep(40);
  ok(has('f_s5', 'sub-nano-5'), 'fechou: volta pra uma linha');

  // tarefa na mão: o "Colocar aqui" na linha do nome
  const t0 = ev(`backlogDb[0].id`), n0 = ev(`db.find((b) => b.id === 'f_s5').cards.length`);
  ev(`scheduleBacklogItem(${JSON.stringify(t0)})`); await sleep(60);
  const mini = (id) => el(id) && el(id).querySelector('.sub-drop-mini');
  ok(['f_s5', 'f_s10', 'f_s15', 'f_s20'].every((id) => T(mini(id)) === 'Colocar aqui' && !el(id).querySelector('.sub-drop') && !el(id).querySelector('.sub-count')), 'tarefa na mão: nas curtas (até 20 min) o "Colocar aqui" vai na linha do nome, no lugar do "0/4"');
  ok(!mini('f_s30') && T(el('f_s30').querySelector('.sub-drop')) === 'Colocar aqui', 'na de 30 min continua a caixa "Colocar aqui" embaixo');
  el('f_s5').click(); await sleep(80);
  ok(ev(`db.find((b) => b.id === 'f_s5').cards.length`) === n0 + 1 && !ev(`backlogDb.some((t) => t.id === ${JSON.stringify(t0)})`) && !ev('pendingIntent'), 'tocar na sublista de 5 min coloca a tarefa dentro dela (sai da Lista)');

  // agenda afastada (3 dias): sublista de cor escura com letra clara
  ev(`setTlDays(3); renderTimeline();`); await sleep(60);
  const mi = (id) => d.querySelector(`.tl-mini[data-mini-id="${id}"]`);
  ok(mi('f_sdk') && mi('f_sdk').classList.contains('sub') && mi('f_sdk').classList.contains('sub-dark'), 'agenda afastada: a sublista pintada de azul-escuro ganha .sub-dark (letra clara)');
  ok(mi('f_sl') && !mi('f_sl').classList.contains('sub-dark') && mi('f_sl').classList.contains('light') && mi('f_s10') && !mi('f_s10').classList.contains('sub-dark'), 'a de cor clara e a amarelinha de sempre ficam com a letra escura');
  ev(`setTlDays(1); renderTimeline();`); await sleep(40);
  const css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');
  ok(/\.tl-mini\.sub\.sub-dark\s*\{\s*color:\s*#fff/.test(css) && /\.sub-block\.sub-nano-5\s*\{[^}]*border-top-width:\s*1px/.test(css) && /\.sub-block\.sub-nano-5 \.block-btn\s*\{\s*display:\s*none/.test(css), 'style.css: letra clara na afastada; na de 5 min, borda de 1 px em cima/embaixo e sem botões');

  console.log('B) O + abre sem o teclado:');
  ev(`closeAllSheets()`); await sleep(30);
  $('fab-btn').click(); await sleep(450);
  ok(!$('bottom-sheet').classList.contains('translate-y-full') && d.activeElement !== $('task-input'), 'tocar no +: abre, e o "Nome da tarefa" NÃO ganha o foco (o teclado não sobe sozinho)');
  ev(`closeAllSheets()`); await sleep(30);
  ev(`openSheetAt(1000, 30, null, true, '${D}')`); await sleep(450);
  ok(!$('bottom-sheet').classList.contains('translate-y-full') && d.activeElement !== $('task-input'), 'pelos 2 toques no vazio (openSheetAt): também sem foco');
  $('task-input').focus();
  ok(d.activeElement === $('task-input'), 'tocar no campo continua focando normal');
  $('task-input').blur();

  console.log('C) O Config do + vira só a engrenagem, na linha do Descanso e da Sublista:');
  const bar = $('bottom-sheet').firstElementChild, row = bar && bar.nextElementSibling;
  ok(bar && bar.querySelector('[data-voltar="fechar"]') && bar.querySelectorAll('button').length === 1, 'a barra de cima só tem o X (como antes)');
  const btns = row ? [...row.querySelectorAll('button')] : [], cfg = btns[2];
  ok(btns.length === 3 && T(btns[0]) === 'Descanso' && T(btns[1]) === 'Sublista' && cfg && cfg.getAttribute('onclick') === 'openConfigSheet()' && T(cfg) === '' && cfg.getAttribute('aria-label') === 'Configurações' && cfg.querySelector('.ph-gear'), 'na linha: Descanso, Sublista e a engrenagem (sem texto, com o nome pra leitor de tela)');
  ok($('bottom-sheet').querySelectorAll('button[onclick="openConfigSheet()"]').length === 1, 'o Config aparece uma vez só no +');
  cfg.click(); await sleep(60);
  ok(!$('config-sheet').classList.contains('translate-y-full'), 'tocar no Config abre as Configurações');
  ev(`closeAllSheets()`);
  ok(B.errors.length === 0, 'celular: nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // ---------------------------------------------------------------- PC
  console.log('D) PC, visão Dia: sublista de 5 e 10 min numa linha só:');
  const CORE = require(path.resolve(REPO, 'sync.js'));
  const UID = '47147147-4714-4714-8714-471471471471', srv = makeServer();
  srv.addUser('pessoa@teste.com', 'senha123', UID);
  const JB = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: JB('tb_backlog_db'), listas: JB('tb_backlog_columns'), tags: JB('tb_tags_db'), blocos: JB('tb_master_db'), rotinas: JB('tb_routines_db') };
  const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of (p0.push[k] || [])) srv.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++srv.clock });
  const DAY = '2026-12-02';
  const mk = (id, st, dur, extra) => srv.insert('blocos', UID, Object.assign({ id, date: DAY, start_min: st, duration: dur, title: 'Bloco', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false }, extra || {}));
  const cs = (n) => Array.from({ length: n }, (_, i) => ({ id: 'cd_p' + n + i, title: 'Cartão ' + i, done: false, microblocks: [] }));
  mk('f_p5', 600, 5, { title: 'CONSULTA DO DIA', cards: cs(4) });
  mk('f_p10', 605, 10, { title: 'LIGAÇÕES', cards: cs(3) });
  mk('f_p15', 620, 15, { title: 'PAPELADA', cards: cs(2) });
  mk('f_p60', 660, 60, { title: 'TARDE', cards: cs(2) });
  srv.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(srv) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.alert = () => errors.push('alert() chamado');
    },
  });
  const pw = dom.window, pd = pw.document, P$ = (id) => pd.getElementById(id);
  const click = (e) => e.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => pd.querySelectorAll('section.col').length >= 3);
  click(P$('tab-agenda')); await sleep(60);
  click(pd.querySelector('.ag-view[data-view="week"]')); click(P$('ag-today')); click(P$('ag-next')); click(P$('ag-next')); await sleep(60);
  click(pd.querySelector(`#ag-cols .ag-day-btn[data-day="${DAY}"]`)); await sleep(80);
  const pb = (id) => [...pd.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id);
  const pc = (id, c) => !!pb(id) && pb(id).classList.contains(c);
  ok(pb('f_p5') && pc('f_p5', 'ag-sub') && pc('f_p5', 'ag-sub-tiny') && pc('f_p5', 'ag-sub-5'), '5 min: .ag-sub-tiny e .ag-sub-5 (sem o respiro de cima/baixo, borda fina)');
  ok(pc('f_p10', 'ag-sub-tiny') && !pc('f_p10', 'ag-sub-5') && !pc('f_p15', 'ag-sub-tiny') && !pc('f_p60', 'ag-sub-tiny'), '10 min: .ag-sub-tiny; 15 min e 1 h como antes');
  const head5 = pb('f_p5') && pb('f_p5').querySelector('.ag-sub-time');
  ok(head5 && head5.classList.contains('leading-none') && /10:00–10:05 · 5m · 4 cartões/.test(T(head5)) && /CONSULTA DO DIA/.test(T(pb('f_p5'))) && !pb('f_p5').querySelector('.ag-sub-cards'), '5 min: uma linha (horário, "4 cartões" e o nome, sem a lista de cartões), com o texto sem entrelinha');
  ok(!pb('f_p60').querySelector('.ag-sub-time').classList.contains('leading-none') && pb('f_p60').querySelectorAll('.ag-sub-card').length === 2, '1 h: o desenho de sempre (com os cartões)');
  const kcss = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  ok(/\.ag-sub\.ag-sub-tiny\s*\{\s*padding-top:\s*0 !important;\s*padding-bottom:\s*0 !important;\s*justify-content:\s*center/.test(kcss) && /\.ag-sub\.ag-sub-5\s*\{\s*border-top-width:\s*1px !important;\s*border-bottom-width:\s*1px !important/.test(kcss), 'kanban.html: as regras da sublista curta');
  ok(errors.length === 0, 'PC: nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { pw.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
