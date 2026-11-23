// V40.37.0 — SUBLISTA DE METAS, no celular e no PC. Ideia dele (22/11): as metas de uma categoria juntas num horário só
// ("um copo de água não leva 5 minutos"). Confere:
//   A) celular: o menu da categoria mostra "Pôr na agenda" com o que vai na sublista (e apagado na categoria sem meta);
//   B) celular: vai pra mão (nome da categoria, 30 min, um cartão por meta, ligado a ela) e entra no Tempo Livre tocado;
//      um passo do Desfazer; marcar um cartão conta na meta; o Repetir leva as metas junto; não entra em outra sublista;
//   C) PC: o ícone de calendário no título da categoria (só com meta), a barra "na mão", colocar num espaço livre,
//      cancelar, e o que chega na nuvem.
// Uso: TZ='America/Sao_Paulo' node test_sublista_metas.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

(async () => {
  // ======================================================================================================
  const B = await boot(REPO, backup.data), { w, $ } = B, d = w.document;
  const ev = (x) => w.eval(x), J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [], lastToast = () => toasts()[toasts().length - 1] || '';
  const shown = (id) => !$(id).classList.contains('hidden');
  const tick = () => sleep(30);
  ev(`[4, 1, 0].forEach((i) => { openGoalForm(); applyGoalTemplate(i); saveGoalForm(); }); closeAllSheets();`);
  const goals = J(`goalsDb.map((g) => ({ id: g.id, title: g.title, list: FazMetas.listOf(g, goalListsDb) }))`);
  const pess = goals.filter((g) => g.list === 'gl_pessoal');
  await tick(); ev('undoStack = []; redoStack = []; undoBarHide();'); // (o passo das metas fecha no setTimeout)

  console.log('A) Celular: o menu da categoria:');
  ev(`openListSheet(); switchListTab('goals');`);
  w.openGoalListMenu('gl_pessoal');
  ok(shown('goal-list-menu-modal') && !$('goal-list-agenda-btn').disabled && /Pôr na agenda/.test($('goal-list-agenda-btn').textContent), 'o menu da categoria tem "Pôr na agenda"');
  ok(pess.length === 3 && $('goal-list-agenda-sub').textContent === 'Uma sublista com 3 cartões: ' + pess.map((g) => g.title).join(', '), 'e diz o que vai: "' + $('goal-list-agenda-sub').textContent + '"');
  ev(`hideModal('goal-list-menu-modal')`);
  w.openGoalListMenu('gl_profissional');
  ok($('goal-list-agenda-btn').disabled && $('goal-list-agenda-sub').textContent === 'Crie uma meta aqui primeiro', 'categoria sem meta: o botão fica apagado ("Crie uma meta aqui primeiro")');
  w.goalListToAgenda();
  ok(lastToast() === 'Essa categoria ainda não tem metas.' && J('pendingIntent') === null, '(e chamado assim mesmo, só avisa)');
  ev(`hideModal('goal-list-menu-modal')`);

  console.log('\nB) Celular: na mão e na agenda:');
  w.openGoalListMenu('gl_pessoal');
  $('goal-list-agenda-btn').click();
  const pi = J('pendingIntent');
  ok(!shown('goal-list-menu-modal') && $('list-sheet').classList.contains('translate-y-full') && shown('floating-task'), 'o menu e a tela fecham; a sublista fica na mão');
  ok(pi && pi.title === 'Pessoal' && pi.duration === 30 && pi.cards.length === 3 && pi.cards.every((c, i) => c.goalId === pess[i].id && c.title === pess[i].title && c.done === false) && !('goalId' in pi), 'nome da categoria, 30 min, um cartão por meta (com o nome e ligado a ela)');
  ok(lastToast() === 'Toque num Tempo Livre pra colocar a sublista 👇', 'avisa: "' + lastToast() + '"');
  ev(`activeDateObj = new Date(2026, 10, 18); renderTimeline();`);
  await tick();
  const gap = [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.classList.contains('bg-hatched'));
  gap.click(); await tick();
  const sb = J(`db.find((b) => b.date === '2026-11-18' && Array.isArray(b.cards) && b.title === 'Pessoal') || null`);
  ok(sb && sb.duration === 30 && sb.cards.length === 3 && sb.cards.every((c, i) => c.goalId === pess[i].id && !c.done && /^cd_/.test(c.id)) && J('pendingIntent') === null, 'tocou no Tempo Livre: a sublista "Pessoal" entra com os 3 cartões ligados às metas');
  ok(J('undoStack.length') === 1 && J('undoStack[0].label') === 'Sublista criada', 'um passo do Desfazer: "Sublista criada" (' + J('undoStack.map((s) => s.label).join(" | ")') + ')');
  const agua = pess.find((g) => g.title === 'Beber água'), cdAgua = sb.cards.find((c) => c.goalId === agua.id);
  const conta = () => J(`goalAllDays().filter((x) => x.goalId === ${JSON.stringify(agua.id)} && x.date === '2026-11-18').reduce((s, x) => s + Number(x.amount || 0), 0)`);
  ok(conta() === 0, 'antes de marcar, a meta "Beber água" não tem nada no dia 18');
  w.toggleSublistCard(sb.id, cdAgua.id, {}); await tick();
  ok(conta() === 1, 'marcou o cartão "Beber água": conta 1 na meta');
  // repetir no dia seguinte: as metas vão junto
  w.duplicateTask(sb.id, { stopPropagation() {} }); w.promptCloneQtd('daily');
  $('clone-qtd-input').value = '1'; $('clone-qtd-input').dispatchEvent(new w.Event('input', { bubbles: true }));
  $('clone-qtd-ok').click(); await tick();
  const rep = J(`db.find((b) => b.date === '2026-11-19' && b.title === 'Pessoal') || null`);
  ok(rep && rep.cards.length === 3 && rep.cards.every((c, i) => c.goalId === pess[i].id && !c.done), 'Repetir: a cópia do dia 19 vem com as 3 metas, desmarcadas');
  // na mão, outra sublista não vira lugar de soltar
  w.openGoalListMenu('gl_pessoal'); $('goal-list-agenda-btn').click();
  ok(J('subCanDrop()') === false, 'com a sublista de metas na mão, as outras sublistas não recebem (sublista não entra em sublista)');
  w.cancelPendingTask();
  ok(J('pendingIntent') === null && !shown('floating-task'), 'cancelar solta a mão sem criar nada');
  ok(B.errors.length === 0, 'celular: nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // ======================================================================================================
  console.log('\nC) PC:');
  const UID = '44444444-4444-4444-4444-444444444444', server = makeServer();
  server.addUser('pessoa@teste.com', 'senha123', UID);
  const JB = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: JB('tb_backlog_db'), listas: JB('tb_backlog_columns'), tags: JB('tb_tags_db'), blocos: JB('tb_master_db'), rotinas: JB('tb_routines_db'), notas: JB('tb_notes_db'), financas: JB('tb_financial_db') };
  const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of p0.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
  const ins = (t, r) => server.tables[t].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
  ins('metas_listas', { id: 'gl_pessoal', name: 'Pessoal', position: 1000, deleted: false });
  ins('metas_listas', { id: 'gl_profissional', name: 'Profissional', position: 2000, deleted: false });
  ins('metas', { id: 'meta_agua', list_id: 'gl_pessoal', title: 'Beber água', emoji: '💧', period: 'dia', unit: 'vezes', target: 8, step: 1, position: 1000, deleted: false, count_from: null });
  ins('metas', { id: 'meta_ler', list_id: 'gl_pessoal', title: 'Ler', emoji: '📚', period: 'dia', unit: 'minutos', target: 30, step: 10, position: 2000, deleted: false, count_from: null });
  server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime(); // segunda 16/11/2026, 10:20
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.alert = () => errors.push('alert() chamado');
    },
  });
  const pw = dom.window, pd = pw.document, P = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const visible = (id) => !P(id).classList.contains('hidden');
  await waitFor(() => pd.querySelectorAll('section.col').length === 5);
  click(P('tab-metas')); await sleep(80);
  const btn = (id) => pd.querySelector('[data-mt-sec="' + id + '"] [data-mt-agenda]');
  ok(!!btn('gl_pessoal') && !btn('gl_profissional') && /Pôr na agenda/.test(btn('gl_pessoal').title), 'o título da categoria com metas tem o calendário "Pôr na agenda" (a vazia não)');
  click(btn('gl_pessoal')); await sleep(60);
  ok(visible('agenda') && visible('ag-place') && T(P('ag-place-title')) === 'Pessoal' && T(P('ag-place-meta')) === '· 30m · sublista com 2 metas', 'vai pra Agenda com a sublista na mão: "' + T(P('ag-place-title')) + ' ' + T(P('ag-place-meta')) + '"');
  ok(!pd.querySelector('#ag-cols [data-sub-drop]'), 'as sublistas da agenda não viram lugar de soltar');
  click(P('ag-place-cancel')); await sleep(30);
  ok(!visible('ag-place') && /Nada foi agendado\.$/.test(T(P('toast'))), 'cancelar: "' + T(P('toast')) + '"');
  click(P('tab-metas')); await sleep(60);
  click(btn('gl_pessoal')); await sleep(60);
  const g = pd.querySelector('#ag-cols [data-gap-day="2026-11-18"]') || pd.querySelector('#ag-cols [data-gap-day]');
  const gDay = g.dataset.gapDay, gSt = +g.dataset.gapStart;
  click(g);
  const rowsB = () => [...server.tables.blocos.values()].filter((r) => r.user_id === UID && !r.deleted && r.title === 'Pessoal');
  ok(await waitFor(() => rowsB().length === 1), 'clicou num espaço livre: a sublista foi pra nuvem');
  const r = rowsB()[0];
  ok(r && r.date === gDay && r.start_min === gSt && r.duration === 30 && Array.isArray(r.cards) && r.cards.length === 2 && r.cards.map((c) => c.goalId).join(',') === 'meta_agua,meta_ler' && r.cards.every((c) => !c.done && /^cd_/.test(c.id)) && r.goal_id === null && r.tag_id === null, 'no dia e hora do espaço, 30 min, um cartão por meta (ligado a ela), sem tag e sem meta na sublista');
  ok(!visible('ag-place') && /^Sublista de metas: /.test(T(P('toast')) + T(P('undo-pill'))), 'a mão fica vazia e avisa "Sublista de metas: …"');
  ok(errors.length === 0, 'PC: nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { pw.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
