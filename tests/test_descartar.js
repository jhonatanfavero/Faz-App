// V40.46.0 — "DESCARTAR?" AO FECHAR UM FORMULÁRIO COM TEXTO NÃO SALVO, no celular (index.html + app.js + sync.js) e no
// PC (kanban.html), em jsdom. Pergunta só com o texto mudado e só no fechar que pode ter sido sem querer: no celular,
// o X da tela, o ← (ou o X) do formulário, o voltar do celular e o fundo escuro; no PC, o Esc, o clique fora, o
// Fechar/X e a seta de volta pra sublista. O "Cancelar" escrito fecha sem perguntar. O que guarda rascunho fica de fora.
// Celular: (A) tarefa nova; (B) tarefa existente; (C) fundo escuro; (D) rotina, nota, despesa e meta; (E) janelinhas;
// (F) rascunhos de fora; (G) a pergunta. PC: (H) o cartão; (I) despesa, meta e rotina; (J) Configurações e Tags;
// (K) nova tarefa no pé da lista; (L) os outros diálogos continuam com "Cancelar".
// Uso: TZ='America/Sao_Paulo' node test_descartar.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000, step = 30) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

(async () => {
  // ======================================================================================================
  // CELULAR
  // ======================================================================================================
  const B = await boot(REPO, backup.data), { w, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const vis = (id) => !$(id).classList.contains('hidden');
  const sheetOpen = (id) => !$(id).classList.contains('translate-y-full');
  const ask = () => vis('discard-modal');
  const type = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const back = async () => { ev('navBack()'); await sleep(10); };
  const tick = () => sleep(10); // o ponto de partida é marcado logo depois de abrir
  const keep = async () => { d.querySelector('#discard-modal [data-voltar]').click(); await tick(); };
  const drop = async () => { $('discard-yes').click(); await tick(); };
  const errs0 = B.errors.length;

  console.log('A) Tarefa nova (Listas):');
  ev("openListSheet(); switchListTab('backlog'); openBacklogForm();"); await tick();
  const bl = $('backlog-input'), blBack = d.querySelector('#backlog-form-view [data-voltar]');
  type(bl, 'Comprar pão');
  blBack.click(); await tick();
  ok(ask() && vis('backlog-form-view') && bl.value === 'Comprar pão', 'escreveu e tocou no ←: pergunta "Descartar?" (o formulário e o texto ficam)');
  ok($('discard-title').textContent === 'Descartar o que você escreveu?' && $('discard-yes').textContent.trim() === 'Descartar' && d.querySelector('#discard-modal [data-voltar]').textContent.trim() === 'Continuar escrevendo', 'a pergunta: "Descartar o que você escreveu?", com "Descartar" e "Continuar escrevendo"');
  ok(d.activeElement !== bl, 'o campo perde o foco (o teclado baixa pra pergunta aparecer inteira)');
  await keep();
  ok(!ask() && vis('backlog-form-view') && sheetOpen('list-sheet') && bl.value === 'Comprar pão', '"Continuar escrevendo": a pergunta fecha e o texto fica');
  d.querySelector('#list-sheet [data-voltar="fechar"]').click(); await tick();
  ok(ask() && sheetOpen('list-sheet'), 'o X da tela também pergunta');
  const nBl = J('backlogDb.length');
  await drop();
  ok(!ask() && !sheetOpen('list-sheet') && J('backlogDb.length') === nBl && !J("backlogDb.some((t) => t.title === 'Comprar pão')"), '"Descartar": a tela fecha e nada é gravado');
  ev("openListSheet(); switchListTab('backlog'); openBacklogForm();"); await tick();
  ok(bl.value === '', 'abrindo de novo, o formulário vem limpo (por isso a pergunta: fechar perdia o texto)');
  blBack.click(); await tick();
  ok(!ask() && !vis('backlog-form-view'), 'sem escrever nada: o ← fecha direto');
  ev('openBacklogForm()'); await tick();
  type(bl, 'abc'); type(bl, '');
  blBack.click(); await tick();
  ok(!ask() && !vis('backlog-form-view'), 'escreveu e apagou tudo: fecha direto');
  ev('openBacklogForm()'); await tick();
  type(bl, '   ');
  blBack.click(); await tick();
  ok(!ask() && !vis('backlog-form-view'), 'só espaço não conta como texto');
  ev('openBacklogForm()'); await tick();
  type(bl, 'Ligar pro banco');
  ev('saveBacklogForm()'); await tick();
  const saved = J("backlogDb.some((t) => t.title === 'Ligar pro banco')");
  ok(saved && !ask() && !vis('backlog-form-view'), 'Salvar grava e fecha sem perguntar');
  d.querySelector('#list-sheet [data-voltar="fechar"]').click(); await tick();
  ok(!ask() && !sheetOpen('list-sheet'), 'e o X da tela depois disso fecha direto');

  console.log('\nB) Tarefa que já existe:');
  const t0 = J('backlogDb[0]');
  ev(`openListSheet(); switchListTab('backlog'); openBacklogForm('${t0.id}');`); await tick();
  ok(bl.value === t0.title, 'o formulário abre com o nome dela ("' + t0.title + '")');
  await back();
  ok(!ask() && !vis('backlog-form-view'), 'sem mudar nada: o voltar do celular sai direto');
  ev(`openBacklogForm('${t0.id}')`); await tick();
  type(bl, t0.title + ' (mudado)');
  await back();
  ok(ask() && vis('backlog-form-view'), 'mudou o nome: o voltar do celular pergunta');
  await back();
  ok(!ask() && vis('backlog-form-view') && bl.value === t0.title + ' (mudado)', 'o voltar com a pergunta aberta é o "Continuar escrevendo"');
  await back(); await drop();
  ok(!vis('backlog-form-view') && sheetOpen('list-sheet') && J(`backlogDb.find((t) => t.id === '${t0.id}').title`) === t0.title, '"Descartar": sai do formulário e o nome continua o de antes');
  ev('closeAllSheets()');

  console.log('\nC) Fundo escuro:');
  ev("openListSheet(); switchListTab('backlog'); openBacklogForm();"); await tick();
  type(bl, 'Pelo fundo');
  $('overlay').click(); await tick();
  ok(ask() && sheetOpen('list-sheet'), 'tocar no fundo escuro com texto: pergunta');
  await drop();
  ok(!sheetOpen('list-sheet') && $('overlay').classList.contains('pointer-events-none'), '"Descartar": fecha a tela e o fundo escuro some');

  console.log('\nD) Rotina, nota, despesa e meta:');
  const forms = [
    ['routines', 'openRoutineForm()', 'routines-form-view', 'rt-form-title'],
    ['notes', 'openNoteForm()', 'notes-form', 'note-content-input'],
    ['financial', 'openFinancialForm()', 'financial-form-view', 'financial-input'],
    ['goals', 'openGoalForm()', 'goals-form-view', 'goal-title-input'],
  ];
  for (const [aba, abrir, form, campo] of forms) {
    ev(`openListSheet(); switchListTab('${aba}'); ${abrir};`); await tick();
    type($(campo), 'Texto de ' + aba);
    d.querySelector(`#${form} [data-voltar]`).click(); await tick();
    const perguntou = ask() && vis(form);
    await drop();
    ok(perguntou && !vis(form) && sheetOpen('list-sheet'), `${form}: escreveu e tocou no ${aba === 'notes' ? 'X' : '←'} → pergunta; "Descartar" sai do formulário`);
    ev('closeAllSheets()'); await tick();
  }

  console.log('\nE) Janelinhas (o Cancelar escrito não pergunta; o voltar pergunta):');
  ev(`(() => { const ds = '2026-12-14'; db.push({ id: 'f_desc_sub', date: ds, startMin: 600, duration: 60, title: 'Sublista desc', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [], cards: [{ id: 'cd_desc1', title: 'Cartão original', done: false }] }); saveDb(); activeDateObj = new Date(2026, 11, 14); renderTimeline(); })()`);
  await tick();
  const openCard = async () => { ev("openSublistCard('f_desc_sub', 'cd_desc1', { stopPropagation() {} })"); await tick(); };
  await openCard();
  type($('sub-card-title'), 'Cartão mudado');
  d.querySelector('#sub-card-modal [data-voltar]').click(); await tick();
  ok(!ask() && !vis('sub-card-modal') && J("db.find((b) => b.id === 'f_desc_sub').cards[0].title") === 'Cartão original', 'cartão da sublista: o "Cancelar" escrito fecha sem perguntar (escolha clara) e nada muda');
  await openCard();
  type($('sub-card-title'), 'Cartão mudado');
  await back();
  ok(ask() && vis('sub-card-modal'), 'o voltar do celular, com o texto mudado, pergunta');
  ok($('overlay').style.zIndex === '65', 'por cima de outra janelinha, o fundo escuro cobre as duas (z 65)');
  await keep();
  ok(!ask() && vis('sub-card-modal') && $('sub-card-title').value === 'Cartão mudado' && $('overlay').style.zIndex !== '65', '"Continuar escrevendo": a janelinha do cartão fica, com o texto (e o fundo volta pra trás dela)');
  await back(); await drop();
  ok(!vis('sub-card-modal') && J("db.find((b) => b.id === 'f_desc_sub').cards[0].title") === 'Cartão original', '"Descartar": fecha pelo Cancelar dela (nada muda)');
  ev("openEditModal('f_desc_sub')"); await tick();
  type($('edit-task-title'), 'Outro nome');
  await back();
  const edAsk = ask();
  await drop();
  ok(edAsk && !vis('edit-task-modal') && J("db.find((b) => b.id === 'f_desc_sub').title") === 'Sublista desc', 'renomear bloco: o voltar pergunta; "Descartar" fecha e o nome fica');
  ev("openListSheet(); openColumnMenuFromHeader(); openRenameColumn();"); await tick();
  $('column-name-input').value = 'Lista X';
  $('overlay').click(); await tick();
  ok(!ask() && vis('column-name-modal'), 'renomear lista: o fundo escuro continua não fechando janelinha de digitar (e não pergunta)');
  ev('cancelColumnName(); closeAllSheets();'); await tick();

  console.log('\nF) O que guarda rascunho fica de fora:');
  ev('openSheet()'); await tick();
  type($('task-input'), 'Rascunho do +');
  d.querySelector('#bottom-sheet [data-voltar="fechar"]').click(); await tick();
  ok(!ask() && !sheetOpen('bottom-sheet'), 'o +: o X fecha sem perguntar…');
  ev('openSheet()'); await tick();
  ok($('task-input').value === 'Rascunho do +', '…porque o texto continua lá ao abrir de novo');
  $('task-input').value = ''; ev('closeAllSheets()');
  ev('openTagsSheet()'); await tick();
  type($('new-tag-name'), 'Tag rascunho');
  d.querySelector('#tags-sheet [data-voltar="fechar"]').click(); await tick();
  ev('openTagsSheet()'); await tick();
  ok(!ask() && $('new-tag-name').value === 'Tag rascunho', 'a nova tag também guarda o rascunho (fecha sem perguntar)');
  $('new-tag-name').value = ''; ev('closeAllSheets()'); await tick();

  console.log('\nG) A pergunta:');
  ok(d.querySelector('#discard-modal [data-voltar]') && !d.querySelector('#discard-modal [data-voltar="fechar"]'), 'tem o botão que o voltar toca ("Continuar escrevendo")');
  ok([...d.querySelectorAll('[id$="-modal"]')].pop().id === 'discard-modal', 'é a última janelinha do HTML (fica por cima de todas)');
  ok(B.errors.length === errs0, 'sem erro no celular' + (B.errors.length > errs0 ? ': ' + B.errors[errs0] : ''));

  // ======================================================================================================
  // PC
  // ======================================================================================================
  const UID = '11111111-2222-3333-4444-555555555555';
  const CORE = require(path.resolve(REPO, 'sync.js'));
  const server = makeServer();
  server.addUser('pessoa@teste.com', 'senha123', UID);
  const BJ = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: BJ('tb_backlog_db'), listas: BJ('tb_backlog_columns'), tags: BJ('tb_tags_db'), blocos: BJ('tb_master_db'), rotinas: BJ('tb_routines_db'), notas: BJ('tb_notes_db'), financas: BJ('tb_financial_db') };
  const plan = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of plan.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
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
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const down = (el) => el.dispatchEvent(new pw.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
  const key = (el, k) => el.dispatchEvent(new pw.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const ptype = (el, v) => { el.focus(); el.value = v; el.dispatchEvent(new pw.Event('input', { bubbles: true })); };
  const pvis = (id) => !Q(id).classList.contains('hidden');
  const dlg = () => pvis('dialog');
  const ptick = () => sleep(15);
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  const firstCard = pd.querySelector('#columns .card'), taskId = firstCard.dataset.id, taskTitle = server.get('tarefas', UID, taskId).title;

  console.log('\nH) PC, o cartão:');
  click(firstCard); await ptick();
  ok(pvis('modal-task') && Q('f-title').value === taskTitle, 'abriu o cartão "' + taskTitle + '"');
  key(pd.body, 'Escape'); await ptick();
  ok(!pvis('modal-task') && !dlg(), 'sem mudar nada: o Esc fecha direto');
  click(firstCard); await ptick();
  ptype(Q('f-title'), taskTitle + ' (mudado)');
  key(pd.body, 'Escape'); await ptick();
  ok(dlg() && pvis('modal-task') && Q('dlg-title').textContent === 'Descartar o que você escreveu?' && Q('dlg-ok').textContent === 'Descartar' && Q('dlg-cancel').textContent === 'Continuar editando', 'mudou o nome e apertou Esc: "Descartar o que você escreveu?" (Descartar / Continuar editando); o cartão fica');
  ok(/bg-red-600/.test(Q('dlg-ok').className) && pd.activeElement === Q('dlg-cancel'), 'o "Descartar" em vermelho, e o foco no "Continuar editando" (um Enter sem querer não apaga nada)');
  key(Q('dlg-cancel'), 'Enter'); click(Q('dlg-cancel')); await ptick(); // o Enter no botão vira clique nele
  ok(!dlg() && pvis('modal-task'), 'Enter (no "Continuar editando"): fica no cartão');
  key(pd.body, 'Escape'); await ptick();
  click(Q('dlg-cancel')); await ptick();
  ok(!dlg() && pvis('modal-task') && Q('f-title').value === taskTitle + ' (mudado)' && pd.activeElement === Q('f-title'), '"Continuar editando": volta pro cartão com o texto, no mesmo campo');
  down(Q('modal-task')); await ptick();
  ok(dlg() && pvis('modal-task'), 'o clique fora também pergunta');
  click(Q('dlg-ok')); await ptick();
  ok(!dlg() && !pvis('modal-task') && server.get('tarefas', UID, taskId).title === taskTitle, '"Descartar": o cartão fecha e o nome na nuvem é o de antes');
  click(firstCard); await ptick();
  ptype(Q('f-title'), 'Pelo Cancelar');
  click(Q('f-cancel')); await ptick();
  ok(!dlg() && !pvis('modal-task') && server.get('tarefas', UID, taskId).title === taskTitle, 'o "Cancelar" escrito fecha sem perguntar (escolha clara)');
  click(firstCard); await ptick();
  ptype(Q('f-mb-new'), 'Item novo'); key(Q('f-mb-new'), 'Enter'); await ptick();
  ok(Q('f-mb-new').value === '' && !!pd.querySelector('#f-mbs [data-mb-title]'), 'um item novo no checklist (Enter)');
  key(pd.body, 'Escape'); await ptick();
  ok(dlg(), 'o checklist mudou: o Esc pergunta');
  click(Q('dlg-ok')); await ptick();
  ok(!pvis('modal-task'), 'Descartar fecha');
  click(firstCard); await ptick();
  ptype(Q('f-title'), taskTitle + ' salvo');
  click(Q('f-save'));
  await waitFor(() => server.get('tarefas', UID, taskId).title === taskTitle + ' salvo');
  ok(!dlg() && !pvis('modal-task') && server.get('tarefas', UID, taskId).title === taskTitle + ' salvo', 'Salvar grava e fecha sem perguntar');
  click(firstCard); await ptick();
  ptype(Q('f-card-q'), 'busca');
  key(pd.body, 'Escape'); await ptick();
  ok(!dlg() && !pvis('modal-task'), 'o que se escreve numa busca de dentro do cartão não conta');

  console.log('\nI) PC, despesa, meta e rotina:');
  for (const [aba, novo, modal, campo] of [['financas', 'fn-new', 'modal-fin', 'fn-f-title'], ['metas', 'mt-new', 'modal-goal', 'mt-f-title'], ['rotinas', 'rt-new', 'modal-rt', 'rt-f-title']]) {
    click(Q('tab-' + aba)); await ptick();
    click(Q(novo)); await ptick();
    ptype(Q(campo), 'Teste ' + aba);
    key(pd.body, 'Escape'); await ptick();
    const pergunta = dlg() && pvis(modal);
    click(Q('dlg-ok')); await ptick();
    ok(pergunta && !pvis(modal), `${modal}: escreveu e apertou Esc → pergunta; "Descartar" fecha`);
  }

  console.log('\nJ) PC, Configurações e Tags:');
  click(Q('btn-cfg')); await ptick();
  ptype(Q('cfg-per-name'), 'Madrugada');
  click(Q('cfg-close')); await ptick();
  ok(dlg() && pvis('modal-cfg'), 'Configurações: o nome de um período novo escrito e "Fechar" → pergunta');
  click(Q('dlg-cancel')); await ptick();
  ok(!dlg() && pvis('modal-cfg') && Q('cfg-per-name').value === 'Madrugada', '"Continuar editando": fica, com o nome');
  ptype(Q('cfg-per-name'), '');
  click(Q('cfg-close')); await ptick();
  ok(!dlg() && !pvis('modal-cfg'), 'apagou o nome: "Fechar" fecha direto');
  click(Q('btn-tags')); await ptick();
  ptype(Q('tg-new-name'), 'Urgente');
  key(pd.body, 'Escape'); await ptick();
  const tgAsk = dlg() && pvis('modal-tags');
  click(Q('dlg-ok')); await ptick();
  ok(tgAsk && !pvis('modal-tags') && !server.alive('tags', UID).some((t) => t.name === 'Urgente'), 'Tags: o nome de uma tag nova escrito e Esc → pergunta; "Descartar" fecha (nada é criado)');

  console.log('\nK) PC, nova tarefa no pé da lista:');
  click(Q('tab-listas')); await ptick();
  click(pd.querySelector('footer[data-composer] .add-btn')); await ptick();
  const ta = pd.querySelector('footer[data-composer] textarea');
  ptype(ta, 'Tarefa a meio caminho');
  key(ta, 'Escape'); await ptick();
  ok(dlg() && !!pd.querySelector('footer[data-composer] textarea'), 'escreveu e apertou Esc: pergunta (o campo continua aberto)');
  click(Q('dlg-cancel')); await ptick();
  ok(!dlg() && pd.querySelector('footer[data-composer] textarea').value === 'Tarefa a meio caminho', '"Continuar editando": o texto fica');
  key(pd.querySelector('footer[data-composer] textarea'), 'Escape'); await ptick();
  click(Q('dlg-ok')); await ptick();
  ok(!pd.querySelector('footer[data-composer] textarea') && !server.alive('tarefas', UID).some((t) => t.title === 'Tarefa a meio caminho'), '"Descartar": o campo fecha e nada é criado');
  click(pd.querySelector('footer[data-composer] .add-btn')); await ptick();
  key(pd.querySelector('footer[data-composer] textarea'), 'Escape'); await ptick();
  ok(!dlg() && !pd.querySelector('footer[data-composer] textarea'), 'vazio: o Esc fecha direto');

  console.log('\nL) PC, os outros diálogos:');
  click(pd.querySelector('#columns .card')); await ptick();
  click(Q('f-delete')); await ptick();
  ok(dlg() && Q('dlg-cancel').textContent === 'Cancelar', 'o "Apagar?" continua com "Cancelar"');
  click(Q('dlg-cancel')); await ptick();
  key(pd.body, 'Escape'); await ptick();
  ok(errors.length === 0, 'sem erro no PC' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
