// V40.38.0 — VOLTAR PRA LISTA DE ONDE VEIO, no celular e no PC. Pedido dele (23/11): "quando retornar pra lista, volta
// pra lista que estava antes; caso já não tenha mais a lista, volta pra primeira". Confere:
//   A) celular: a tarefa agendada (na mão) vira bloco que lembra a lista; "Mover pra Lista" volta pra ela, com o aviso
//      "Voltou pra lista …"; a lista apagada → a primeira (mesmo com as listas em outra ordem); bloco que nasceu na
//      agenda → a primeira; Copiar e Repetir levam a lista; cartão ↔ bloco da sublista leva a lista junto; desarquivar;
//   B) celular ↔ nuvem: column_id sobe e desce; vindo da versão antiga, relê a agenda uma vez (colIds) e não sobe nada;
//   C) PC: agendar pela mão e pelo Agendar do cartão (vale a lista escolhida no cartão) grava column_id; "Voltar pra
//      lista" volta pra ela (ou pra primeira, mesmo com as listas em outra ordem); Duplicar leva; o cartão da sublista
//      volta pra de origem ou pra primeira; desarquivar segue a mesma regra (nos 2).
// Uso: TZ='America/Sao_Paulo' node test_volta_lista.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

(async () => {
  // ======================================================================================================
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x), J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const bar = () => (!$('undo-bar').classList.contains('hidden') && $('undo-bar-msg').textContent) || '';
  const tick = () => sleep(30);
  const cols = J('backlogColumnsDb.map((c) => ({ id: c.id, name: c.name }))');
  ok(cols.length >= 3 && cols[0].id === 'col_geral', '(dados de teste: ' + cols.length + ' listas, a primeira é a Geral)');
  const X = cols[2]; // uma lista que não é a primeira
  const taskIn = (colId) => J(`backlogDb.find((t) => getItemColumn(t) === ${JSON.stringify(colId)}) || null`);
  const blockOf = (title, ds) => J(`db.find((b) => b.title === ${JSON.stringify(title)} && b.date === ${JSON.stringify(ds)}) || null`);
  const gapClick = () => { const g = [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.classList.contains('bg-hatched')); g.click(); };
  const backToList = (id) => { ev(`deletingTaskId = ${JSON.stringify(id)}`); w.moveToBacklog(); };
  const lastTask = () => J('backlogDb[backlogDb.length - 1]');

  console.log('A) Celular:');
  ev(`activeDateObj = new Date(2026, 10, 18); renderTimeline();`); // 18/11: dia livre nos dados de teste
  const t1 = taskIn(X.id);
  ok(!!t1, '(tarefa da lista "' + X.name + '": "' + (t1 && t1.title) + '")');
  w.scheduleBacklogItem(t1.id); await tick(); gapClick(); await tick();
  const b1 = blockOf(t1.title, '2026-11-18');
  ok(b1 && b1.columnId === X.id && !J(`backlogDb.some((t) => t.id === ${JSON.stringify(t1.id)})`), 'agendou pela mão: o bloco lembra de qual lista veio (' + X.name + ')');
  backToList(b1.id); await tick();
  const back1 = lastTask();
  ok(back1.title === t1.title && back1.columnId === X.id && !J(`db.some((b) => b.id === ${JSON.stringify(b1.id)})`), '"Mover pra Lista": voltou pra "' + X.name + '" (antes ia pra Geral)');
  ok(bar() === 'Voltou pra lista ' + X.name && J('undoStack[undoStack.length - 1].label') === bar(), 'avisa na barrinha do Desfazer: "' + bar() + '" (antes: aviso vermelho "Movido para a lista!")');
  w.fazUndo(); await tick();
  ok(!!J(`db.find((b) => b.id === ${JSON.stringify(b1.id)}) || null`) && !J(`backlogDb.some((t) => t.title === ${JSON.stringify(t1.title)})`), 'Desfazer: o bloco volta pra agenda e sai da lista');
  w.fazRedo(); await tick();
  const back1b = lastTask();
  ok(back1b.title === t1.title && back1b.columnId === X.id && !J(`db.some((b) => b.id === ${JSON.stringify(b1.id)})`), 'Refazer: volta pra "' + X.name + '" de novo');
  // a lista não existe mais: vai pra primeira — e a primeira não precisa ser a Geral
  w.scheduleBacklogItem(lastTask().id); await tick(); gapClick(); await tick();
  const b2 = blockOf(t1.title, '2026-11-18');
  ev(`backlogColumnsDb = backlogColumnsDb.filter((c) => c.id !== ${JSON.stringify(X.id)}); backlogColumnsDb.unshift(backlogColumnsDb.splice(1, 1)[0]); saveBacklogColumns(); renderBacklog();`);
  const first = J('backlogColumnsDb[0]');
  ok(first.id !== 'col_geral' && first.id !== X.id, '(apagou a lista "' + X.name + '" e pôs "' + first.name + '" em primeiro)');
  backToList(b2.id); await tick();
  ok(lastTask().columnId === first.id && bar() === 'Voltou pra lista ' + first.name, 'a lista de origem não existe mais: voltou pra primeira ("' + first.name + '")');
  // bloco que nasceu na agenda (sem lista): a primeira
  ev(`db.push({ id: 'f_sem_lista', type: 'focus', title: 'Nasceu na agenda', startMin: 900, duration: 30, date: '2026-11-18', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }); saveDb();`);
  backToList('f_sem_lista'); await tick();
  ok(lastTask().title === 'Nasceu na agenda' && lastTask().columnId === first.id, 'bloco que nasceu na agenda: vai pra primeira lista');
  // Copiar e Repetir levam a lista
  const Y = J('backlogColumnsDb[2]'), t3 = taskIn(Y.id);
  w.scheduleBacklogItem(t3.id); await tick(); gapClick(); await tick();
  const b3 = blockOf(t3.title, '2026-11-18');
  ok(b3 && b3.columnId === Y.id, '(agendou "' + t3.title + '" da lista "' + Y.name + '")');
  w.duplicateTask(b3.id, { stopPropagation() {} }); w.promptCloneQtd('daily');
  $('clone-qtd-input').value = '1'; $('clone-qtd-input').dispatchEvent(new w.Event('input', { bubbles: true })); $('clone-qtd-ok').click(); await tick();
  ok((blockOf(t3.title, '2026-11-19') || {}).columnId === Y.id, 'Repetir: a cópia lembra da lista');
  w.duplicateTask(b3.id, { stopPropagation() {} }); w.cloneManual();
  ok(J('pendingIntent.columnId') === Y.id, 'Copiar: a cópia na mão leva a lista');
  w.cancelPendingTask();
  // bloco ↔ cartão da sublista
  ev(`db.push({ id: 'f_sub', type: 'focus', title: 'Pendências', startMin: 1200, duration: 60, date: '2026-11-18', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [], cards: [] }); saveDb();`);
  ok(ev(`blockIntoSublist(${JSON.stringify(b3.id)}, 'f_sub')`) === true && J(`db.find((b) => b.id === 'f_sub').cards[0].columnId`) === Y.id, 'bloco entra na sublista: o cartão guarda a lista');
  const cd = J(`db.find((b) => b.id === 'f_sub').cards[0]`);
  ok(ev(`subCardOut('f_sub', ${JSON.stringify(cd.id)}, '2026-11-20', 600)`) === true && (blockOf(t3.title, '2026-11-20') || {}).columnId === Y.id, 'o cartão sai da sublista: o bloco continua lembrando a lista');
  ev(`db.find((b) => b.id === 'f_sub').cards.push({ id: 'cd_orfao', title: 'Cartão de lista apagada', done: false, microblocks: [], columnId: 'col_que_nao_existe' }); saveDb();`);
  ev(`subCardToList(db.find((b) => b.id === 'f_sub'), db.find((b) => b.id === 'f_sub').cards.find((c) => c.id === 'cd_orfao')); saveDb(); saveBacklog();`);
  ok(lastTask().title === 'Cartão de lista apagada' && lastTask().columnId === first.id, 'cartão da sublista de lista apagada: vai pra primeira (antes ia pra Geral)');
  // desarquivar: a mesma regra (lista que não existe mais → a primeira; a Geral de quem não tem lista continua a Geral)
  ev(`archiveDb.unshift({ kind: 'tarefa', archivedAt: Date.now(), item: { id: 'bl_arq1', title: 'Arquivada de lista apagada', duration: 15, tagId: null, microblocks: [], columnId: ${JSON.stringify(X.id)} } });
      archiveDb.unshift({ kind: 'tarefa', archivedAt: Date.now(), item: { id: 'bl_arq2', title: 'Arquivada da Geral', duration: 15, tagId: null, microblocks: [] } });
      archiveDb.unshift({ kind: 'tarefa', archivedAt: Date.now(), item: { id: 'bl_arq3', title: 'Arquivada da DELTA', duration: 15, tagId: null, microblocks: [], columnId: ${JSON.stringify(Y.id)} } }); saveArchive();`);
  w.fazUnarchive('bl_arq1'); w.fazUnarchive('bl_arq2'); w.fazUnarchive('bl_arq3');
  const arq = (id) => J(`(() => { const t = backlogDb.find((x) => x.id === ${JSON.stringify(id)}); return t ? getItemColumn(t) : null; })()`);
  ok(arq('bl_arq1') === first.id && arq('bl_arq2') === 'col_geral' && arq('bl_arq3') === Y.id, 'Desarquivar: a lista apagada → a primeira; a Geral e as que existem ficam onde estavam');

  // ======================================================================================================
  console.log('\nB) Celular e nuvem:');
  const UID = '55555555-5555-5555-5555-555555555555';
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  w.closeAllSheets();
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(60); };
  const bc = blockOf(t3.title, '2026-11-19');
  ok(server.get('blocos', UID, bc.id).column_id === Y.id, 'o bloco sobe com a lista de origem (column_id)');
  ok(server.alive('blocos', UID).filter((r) => r.column_id).length === J('db.filter((b) => b.columnId).length'), 'só os blocos que vieram de uma lista têm column_id');
  ok(JSON.parse(L('tb__sync')).colIds === 1, 'o estado do sync marca que a agenda já foi lida com as listas (colIds)');
  // o PC agendou (column_id) enquanto o celular estava na versão antiga: o celular leu o bloco sem o column_id e o cursor
  // já passou daquela mudança (mexe direto na nuvem, sem aviso em tempo real). Na versão nova, relê a agenda uma vez.
  const BV = J(`db.find((b) => !b.columnId && !Array.isArray(b.cards))`);
  Object.assign(server.get('blocos', UID, BV.id), { column_id: 'col_geral', updated_at: server.stamp() });
  const stOld = JSON.parse(L('tb__sync')); delete stOld.colIds; stOld.cursorBlocos = Date.now() + 120000;
  w.localStorage.setItem('tb__sync', JSON.stringify(stOld));
  const before = server.log.length;
  await syncDone();
  ok(J(`db.find((b) => b.id === ${JSON.stringify(BV.id)}).columnId || null`) === 'col_geral' && JSON.parse(L('tb__sync')).colIds === 1 && !server.log.slice(before).some((l) => l.op === 'upsert'), 'vindo da versão antiga: lê a agenda inteira uma vez, a lista que o PC gravou chega e nada sobe');
  ok(J(`db.find((b) => b.id === ${JSON.stringify(bc.id)}).columnId || null`) === Y.id, 'e quem já tinha a lista continua com ela depois de ler tudo da nuvem');
  const before2 = server.log.length;
  await syncDone();
  ok(!server.log.slice(before2).some((l) => l.op === 'upsert' && l.t === 'blocos'), 'sincronizar de novo: nenhum bloco sobe de novo (a lista de origem não fica "mudando")'); // (as categorias padrão das metas nascem quando a aba Metas desenha: sobem uma vez)
  ok(B.errors.length === 0, 'celular: nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // ======================================================================================================
  console.log('\nC) PC:');
  const PU = '66666666-6666-6666-6666-666666666666', ps = makeServer();
  ps.addUser('pessoa@teste.com', 'senha123', PU);
  const JB = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: JB('tb_backlog_db'), listas: JB('tb_backlog_columns'), tags: JB('tb_tags_db'), blocos: JB('tb_master_db'), rotinas: JB('tb_routines_db') };
  const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of (p0.push[k] || [])) ps.tables[k].set(PU + '|' + r.id, { ...r, user_id: PU, updated_at: ++ps.clock });
  const OMEGA = JB('tb_backlog_columns')[4];
  ps.insert('blocos', PU, { id: 'f_do_celular', date: '2026-11-17', start_min: 600, duration: 30, title: 'Agendado no celular', type: 'focus', theme: 'focus', microblocks: [], completed: false, linked_note_ids: [], column_id: OMEGA.id });
  ps.storedSession = { access_token: 'tok', user: { id: PU, email: 'pessoa@teste.com', user_metadata: {} } };
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
      pw.supabase = { createClient: makeCreateClient(ps) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.alert = () => errors.push('alert() chamado');
    },
  });
  const pw = dom.window, pd = pw.document, P = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.value = v; el.dispatchEvent(new pw.Event('input', { bubbles: true })); el.dispatchEvent(new pw.Event('change', { bubbles: true })); };
  const visible = (id) => !P(id).classList.contains('hidden');
  const settle = () => sleep(150);
  const rows = (t) => ps.alive(t, PU);
  const agBlock = (id) => pd.querySelector('#ag-cols [data-block="' + id + '"]');
  const ptoast = () => P('toast').textContent;
  await waitFor(() => pd.querySelectorAll('section.col').length === 5);
  const lists = rows('listas').sort((a, b) => a.position - b.position);
  const PX = lists[2], ptask = rows('tarefas').find((t) => t.column_id === PX.id && !t.archived);
  ok(!!ptask && lists[0].id === 'col_geral', '(PC: tarefa "' + (ptask && ptask.title) + '" da lista "' + PX.name + '")');
  // o bloco que o celular agendou (já estava na nuvem quando o PC abriu)
  click(P('tab-agenda')); await settle();
  click(agBlock('f_do_celular')); await sleep(30);
  click(P('f-tolist'));
  await waitFor(() => !rows('blocos').some((b) => b.id === 'f_do_celular')); await settle();
  ok(rows('tarefas').some((t) => t.title === 'Agendado no celular' && t.column_id === OMEGA.id), 'bloco que o celular agendou: "Voltar pra lista" no PC volta pra "' + OMEGA.name + '" (o PC lê a lista de origem da nuvem)');
  click(P('tab-listas')); await sleep(40);
  // pela mão
  click(pd.querySelector('.card[data-id="' + ptask.id + '"] [data-hand]'));
  ok(visible('ag-place'), '(a tarefa está na mão)');
  click(pd.querySelector('#ag-cols [data-gap-day="2026-11-18"]'));
  await waitFor(() => rows('blocos').some((b) => b.title === ptask.title && b.date === '2026-11-18')); await settle();
  const pb = rows('blocos').find((b) => b.title === ptask.title && b.date === '2026-11-18');
  ok(pb && pb.column_id === PX.id, 'agendou pela mão: o bloco grava a lista de origem (column_id)');
  // voltar pra lista
  click(agBlock(pb.id)); await sleep(30);
  ok(visible('modal-task') && visible('f-tolist'), '(abriu o bloco: tem "Voltar pra lista")');
  click(P('f-tolist'));
  await waitFor(() => !rows('blocos').some((b) => b.id === pb.id)); await settle();
  const pback = rows('tarefas').find((t) => t.title === ptask.title);
  ok(pback && pback.column_id === PX.id, '"Voltar pra lista": voltou pra "' + PX.name + '" (antes ia pra Geral)');
  ok(ptoast() === 'Voltou pra lista ' + PX.name, 'avisa: "' + ptoast() + '"');
  // pelo Agendar do cartão, trocando a lista no cartão antes (sem salvar): vale a escolhida
  const PZ = lists[3];
  click(P('tab-listas')); await sleep(40);
  click(pd.querySelector('.card[data-id="' + pback.id + '"]')); await sleep(30);
  change(P('f-col'), PZ.id);
  click(P('f-schedule')); await sleep(20);
  change(P('f-sched-date'), '2026-11-19'); change(P('f-sched-time'), '09:00');
  click(P('f-sched-ok'));
  await waitFor(() => rows('blocos').some((b) => b.title === ptask.title && b.date === '2026-11-19')); await settle();
  const pb2 = rows('blocos').find((b) => b.title === ptask.title && b.date === '2026-11-19');
  ok(pb2 && pb2.column_id === PZ.id && pb2.start_min === 540, 'Agendar pelo cartão: grava a lista escolhida no cartão ("' + PZ.name + '")');
  // Duplicar leva
  click(P('tab-agenda')); await settle();
  click(pd.querySelector('#ag-cols [data-block="' + pb2.id + '"] [data-more]')); await sleep(30);
  click(pd.querySelector('body > div[role="menu"] [data-act="dup"]'));
  await waitFor(() => rows('blocos').filter((b) => b.title === ptask.title).length === 2); await settle();
  const pdup = rows('blocos').find((b) => b.title === ptask.title && b.id !== pb2.id);
  ok(pdup && pdup.column_id === PZ.id, 'Duplicar: a cópia leva a lista');
  // a lista sumiu (apagada no celular): a primeira
  ps.patch('listas', PU, PZ.id, { deleted: true });
  await waitFor(() => !pd.querySelector('section.col[data-col="' + PZ.id + '"]')); await settle();
  ps.patch('listas', PU, lists[1].id, { position: lists[0].position - 1024 }); // e "BETA" foi pra primeira
  await settle();
  click(agBlock(pdup.id)); await sleep(30);
  click(P('f-tolist'));
  await waitFor(() => !rows('blocos').some((b) => b.id === pdup.id)); await settle();
  const pback2 = rows('tarefas').find((t) => t.title === ptask.title);
  ok(pback2 && pback2.column_id === lists[1].id && ptoast() === 'Voltou pra lista ' + lists[1].name, 'a lista de origem foi apagada: voltou pra primeira ("' + lists[1].name + '")');
  // cartão da sublista
  ps.insert('blocos', PU, { id: 'f_sub_pc', date: '2026-11-20', start_min: 600, duration: 60, title: 'Pendências PC', type: 'focus', theme: 'focus', microblocks: [], completed: false, linked_note_ids: [],
    cards: [{ id: 'cd_p1', title: 'Cartão da outra lista', done: false, microblocks: [], columnId: lists[4].id }, { id: 'cd_p2', title: 'Cartão de lista apagada', done: false, microblocks: [], columnId: PZ.id }] });
  await waitFor(() => !!agBlock('f_sub_pc')); await settle();
  const subCards = () => (ps.get('blocos', PU, 'f_sub_pc').cards || []);
  click(agBlock('f_sub_pc')); await sleep(30);
  click(pd.querySelector('#f-cards [data-fc-open="cd_p1"]')); await waitFor(() => visible('f-card-back'));
  click(P('f-tolist'));
  await waitFor(() => subCards().length === 1); await settle();
  ok(rows('tarefas').some((t) => t.title === 'Cartão da outra lista' && t.column_id === lists[4].id), 'cartão da sublista: volta pra lista de onde veio ("' + lists[4].name + '")');
  click(pd.querySelector('#f-cards [data-fc-open="cd_p2"]')); await waitFor(() => visible('f-card-back'));
  click(P('f-tolist'));
  await waitFor(() => subCards().length === 0); await settle();
  ok(rows('tarefas').some((t) => t.title === 'Cartão de lista apagada' && t.column_id === lists[1].id), 'cartão de lista apagada: vai pra primeira (antes ia pra Geral)');
  // desarquivar: a mesma regra
  ps.insert('tarefas', PU, { id: 'bl_arq_pc', column_id: PZ.id, title: 'Arquivada de lista apagada', duration: 15, tag_id: null, microblocks: [], position: 99999, color: null, archived: true, deleted: false });
  await settle();
  click(P('btn-archive')); await sleep(30);
  click(P('ar-list').querySelector('[data-unarchive="tarefas|bl_arq_pc"]'));
  await waitFor(() => ps.get('tarefas', PU, 'bl_arq_pc').archived === false); await settle();
  ok(ps.get('tarefas', PU, 'bl_arq_pc').column_id === lists[1].id, 'Desarquivar no PC: a lista apagada → a primeira ("' + lists[1].name + '")');
  click(P('ar-close'));
  ok(errors.length === 0, 'PC: nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { pw.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
