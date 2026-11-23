// V40.36.1 — CELULAR (app de verdade em jsdom, relógio em 15/11/2026 às 21:00):
//   A–F) o "Repetir Tarefa" igual ao Repetir do PC: a janelinha (qual bloco, −/+, padrões 5/4/2, máximo 60/52/24, o
//        resumo e o dia com o horário ocupado ficando de fora), o que é criado (horário igual; checklist e cartões
//        desmarcados com ids novos; sem notas, não concluída, sem atraso; tipo pelo horário; tag e meta só se existem),
//        "Mensalmente" no dia 31, tudo ocupado, bloco que sumiu, um passo só do Desfazer com o texto próprio (sem o
//        aviso vermelho "Clonado com sucesso!");
//   G) o Copiar leva a cor do cartão;
//   H) cartão recolhido sem a "fatia" do checklist (foto dele de 22/11): a área só aparece quando cabe uma linha
//      inteira; sem ela o nome usa até 2 linhas e o horário conta o checklist; aberto, o nome aparece inteiro;
//   I) "+ Meta em …" em toda categoria das Metas;
//   J) escolheu uma meta e deixou o nome vazio: vale o nome da meta (+, nova tarefa e cartão da sublista);
//   K) ocultar vagos com 2 dias lado a lado (só o que está livre nos dois);
//   L) na nuvem: as cópias sobem certas, e campo com foco numa janelinha fechada não segura a sincronização.
// Uso: TZ='America/Sao_Paulo' node test_v40361.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '33333333-3333-3333-3333-333333333333';

(async () => {
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x), J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [], lastToast = () => toasts()[toasts().length - 1] || '';
  const get = (id) => J(`db.find((b) => b.id === ${JSON.stringify(id)}) || null`);
  const titled = (t) => J(`db.filter((b) => b.title === ${JSON.stringify(t)})`);
  const shown = (id) => !$(id).classList.contains('hidden');
  const modalOpen = () => shown('clone-qtd-modal') && $('clone-qtd-modal').classList.contains('flex');
  const inp = $('clone-qtd-input');
  const type = (v) => { inp.value = v; inp.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const tick = () => sleep(30);
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

  // metas de exemplo (como no iphone.js) e os blocos do teste (os dados fictícios vão até 17/11)
  ev(`[4, 1, 0].forEach((i) => { openGoalForm(); applyGoalTemplate(i); saveGoalForm(); }); closeAllSheets();`);
  const LER = ev(`goalsDb.find((g) => g.title === 'Ler').id`), AGUA = ev(`goalsDb.find((g) => g.title === 'Beber água').id`);
  ev(`db.push(
    { id: 'f_r1', type: 'focus', title: 'Ler', startMin: 480, duration: 30, date: '2026-11-18', theme: 'focus', tagId: 'tag_1700000001000', color: '#3b82f6', goalId: ${JSON.stringify(LER)}, completed: true, wasDelayed: true, linkedNoteIds: ['note_x'], microblocks: [{ id: 'mb_a', title: 'cap 1', done: true }, { id: 'mb_b', title: 'cap 2', done: false }] },
    { id: 'f_o1', type: 'focus', title: 'Ocupa', startMin: 490, duration: 20, date: '2026-11-20', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    { id: 'f_r2', type: 'focus', title: 'Pendências', startMin: 600, duration: 45, date: '2026-11-19', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [], cards: [{ id: 'cd_1', title: 'A', done: true, microblocks: [{ title: 'x', done: true }] }, { id: 'cd_2', title: 'B', done: false, microblocks: [] }] },
    { id: 'f_r3', type: 'focus', title: 'Aluguel', startMin: 420, duration: 30, date: '2027-01-31', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    { id: 'f_r4', type: 'past', title: 'Correr', startMin: 1200, duration: 30, date: '2026-11-13', theme: 'focus', tagId: 'tag_que_nao_existe', goalId: 'meta_apagada', microblocks: [], completed: false, wasDelayed: true, linkedNoteIds: [] },
    { id: 'f_r5', type: 'focus', title: 'Cheio', startMin: 700, duration: 20, date: '2026-11-25', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    ...[26, 27, 28, 29, 30].map((n) => ({ id: 'f_c' + n, type: 'focus', title: 'Bloqueio', startMin: 690, duration: 60, date: '2026-11-' + n, theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }))
  ); saveDb(); undoStack = []; redoStack = []; undoBarHide();`);
  await tick();
  ev('undoStack = []; redoStack = []; undoBarHide();');

  // ======================================================================================================
  console.log('A) Repetir: a janelinha (Diariamente):');
  w.duplicateTask('f_r1', { stopPropagation() {} });
  ok(!$('clone-sheet').classList.contains('translate-y-full'), 'Duplicar abre o "Repetir Tarefa"');
  w.promptCloneQtd('daily');
  ok(modalOpen() && $('clone-sheet').classList.contains('translate-y-full'), 'Diariamente abre a janelinha (a lista de opções sai)');
  ok($('clone-qtd-title').textContent === 'Quantos dias seguidos?' && $('clone-qtd-sub').textContent === 'Ler · Qua 18/11 · 08:00–08:30', 'título e qual bloco: "' + $('clone-qtd-sub').textContent + '"');
  ok(inp.value === '5' && inp.max === '60' && !$('clone-qtd-minus').disabled && !$('clone-qtd-plus').disabled, 'começa em 5 (máximo 60)');
  ok($('clone-qtd-sum').textContent === 'Às 08:00, de Qui 19/11 a Seg 23/11. O checklist vai junto, desmarcado.', 'resumo: "' + $('clone-qtd-sum').textContent + '"');
  ok(shown('clone-qtd-busy') && $('clone-qtd-busy').textContent === 'Sex 20/11 fica de fora: o horário já está ocupado.', 'o dia ocupado fica de fora: "' + $('clone-qtd-busy').textContent + '"');
  ok($('clone-qtd-ok').textContent === 'Criar 4 cópias' && !$('clone-qtd-ok').disabled, 'botão "Criar 4 cópias"');
  for (let i = 0; i < 4; i++) $('clone-qtd-minus').click();
  ok(inp.value === '1' && $('clone-qtd-minus').disabled && $('clone-qtd-sum').textContent.startsWith('Às 08:00, em Qui 19/11.') && $('clone-qtd-ok').textContent === 'Criar 1 cópia' && !shown('clone-qtd-busy'), '− até 1: "Criar 1 cópia" (só Qui 19/11) e o − apaga');
  $('clone-qtd-minus').click();
  ok(inp.value === '1', 'não desce de 1');
  type('99');
  ok(inp.value === '60' && $('clone-qtd-plus').disabled && $('clone-qtd-ok').textContent === 'Criar 59 cópias' && /a Dom 17\/01\/2027\./.test($('clone-qtd-sum').textContent), 'digitou 99: fica 60, o máximo (o + apaga); com o ano quando é outro: "' + $('clone-qtd-sum').textContent.slice(0, 48) + '…"');
  type('');
  ok($('clone-qtd-sum').textContent === 'Escolha de 1 a 60.' && $('clone-qtd-ok').disabled, 'vazio: pede um número e o botão apaga');
  type('0');
  ok($('clone-qtd-ok').disabled, '0 também não cria');
  $('clone-qtd-plus').click();
  ok(inp.value === '1', 'do 0, o + vai pra 1');
  type('5');

  // ======================================================================================================
  console.log('\nB) Repetir: o que é criado, e um passo só do Desfazer:');
  const antes = J('db.length');
  inp.focus();
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await tick();
  const copies = J(`db.filter((b) => b.title === 'Ler' && b.id !== 'f_r1').sort((a, b) => a.date < b.date ? -1 : 1)`);
  ok(J('db.length') === antes + 4 && copies.map((b) => b.date).join(',') === '2026-11-19,2026-11-21,2026-11-22,2026-11-23', 'Enter cria 4 cópias: 19, 21, 22 e 23/11 (o 20 fica de fora)');
  ok(copies.every((b) => b.startMin === 480 && b.duration === 30), 'no mesmo horário (08:00, 30 min)');
  ok(copies.every((b) => b.type === 'focus' && b.completed === false && !('wasDelayed' in b) && JSON.stringify(b.linkedNoteIds) === '[]' && b.expanded === false), 'cada cópia: não concluída, sem atraso, sem notas');
  ok(copies.every((b) => b.tagId === 'tag_1700000001000' && b.color === '#3b82f6' && b.goalId === LER && b.theme === 'focus'), 'tag, cor e meta vão junto');
  const mbIds = copies.flatMap((b) => b.microblocks.map((m) => m.id));
  ok(copies.every((b) => b.microblocks.length === 2 && b.microblocks.every((m) => m.done === false) && b.microblocks[0].title === 'cap 1') && new Set(mbIds.concat(['mb_a', 'mb_b'])).size === mbIds.length + 2, 'checklist desmarcado, com ids novos (nenhum repetido)');
  ok(new Set(copies.map((b) => b.id)).size === 4 && copies.every((b) => /^f_[\w.\-]{1,62}$/.test(b.id)), 'ids novos e diferentes (f_…), no formato que a nuvem aceita');
  ok(get('f_r1').completed === true && get('f_r1').microblocks[0].done === true && get('f_o1').startMin === 490 && J(`db.filter((b) => b.date === '2026-11-20').length`) === 1, 'o original e o bloco do dia 20 não mudaram (nada por cima dele)');
  ok(!modalOpen() && d.activeElement !== inp, 'a janelinha fecha e o campo perde o foco');
  ok(!toasts().some((t) => /Clonado/.test(t)), 'sem o aviso vermelho "Clonado com sucesso!"');
  ok(J('undoStack.length') === 1 && J('undoStack[0].label') === 'Repetido 4 vezes · 1 dia de fora' && shown('undo-bar') && $('undo-bar-msg').textContent === 'Repetido 4 vezes · 1 dia de fora', 'a barrinha do Desfazer: "' + $('undo-bar-msg').textContent + '"');
  w.fazUndo(); await tick();
  ok(titled('Ler').length === 1 && $('undo-bar-msg').textContent === 'Desfeito: repetido 4 vezes · 1 dia de fora', 'Desfazer tira as 4 de uma vez: "' + $('undo-bar-msg').textContent + '"');
  w.fazRedo(); await tick();
  ok(titled('Ler').length === 5, 'Refazer põe as 4 de volta');

  // ======================================================================================================
  console.log('\nC) Sublista, toda semana:');
  w.duplicateTask('f_r2', { stopPropagation() {} }); w.promptCloneQtd('weekly');
  ok($('clone-qtd-title').textContent === 'Por quantas semanas?' && inp.value === '4' && inp.max === '52', 'Semanalmente: "Por quantas semanas?", começa em 4 (máximo 52)');
  ok($('clone-qtd-sum').textContent === 'Às 10:00, de Qui 26/11 a Qui 17/12. Os cartões vão junto, desmarcados.', 'resumo da sublista: "' + $('clone-qtd-sum').textContent + '"');
  type('2');
  $('clone-qtd-ok').click(); await tick();
  const subs = J(`db.filter((b) => b.title === 'Pendências' && b.id !== 'f_r2').sort((a, b) => a.date < b.date ? -1 : 1)`), orig = get('f_r2');
  ok(subs.map((b) => b.date).join(',') === '2026-11-26,2026-12-03' && subs.every((b) => b.startMin === 600 && b.duration === 45), 'duas cópias: 26/11 e 03/12, às 10:00');
  ok(subs.every((b) => Array.isArray(b.cards) && b.cards.length === 2 && b.cards.every((c) => c.done === false) && b.cards[0].microblocks[0].done === false && b.cards.every((c, i) => c.id !== orig.cards[i].id && c.title === orig.cards[i].title) && !('goalId' in b)), 'os cartões vão junto, desmarcados e com ids novos; a sublista não tem meta');
  ok(J('undoStack[undoStack.length - 1].label') === 'Repetido 2 vezes', 'Desfazer: "Repetido 2 vezes"');

  // ======================================================================================================
  console.log('\nD) Todo mês no dia 31:');
  const casos = ['2027-01-31|1|2027-02-28', '2028-01-31|1|2028-02-29', '2026-12-31|2|2027-02-28', '2027-01-31|2|2027-03-31', '2026-11-30|3|2027-02-28', '2026-01-15|13|2027-02-15', '2026-08-31|1|2026-09-30'];
  const errados = casos.filter((c) => { const [a, n, r] = c.split('|'); return ev(`addMonthToDateStr('${a}', ${n})`) !== r; });
  ok(!errados.length, 'o dia 31 cai no último dia do mês, sem escorregar nem acumular (31/01 → 28/02 → 31/03)' + (errados.length ? ': ' + errados.join(' ') : ''));
  w.duplicateTask('f_r3', { stopPropagation() {} }); w.promptCloneQtd('monthly');
  ok($('clone-qtd-title').textContent === 'Por quantos meses?' && inp.value === '2' && inp.max === '24' && $('clone-qtd-sub').textContent === 'Aluguel · Dom 31/01/2027 · 07:00–07:30', 'Mensalmente: "Por quantos meses?", começa em 2 (máximo 24); o ano aparece por ser outro');
  $('clone-qtd-plus').click();
  ok($('clone-qtd-sum').textContent.startsWith('Às 07:00, de Dom 28/02/2027 a Sex 30/04/2027.'), '"' + $('clone-qtd-sum').textContent.slice(0, 46) + '"');
  $('clone-qtd-ok').click(); await tick();
  ok(titled('Aluguel').map((b) => b.date).sort().join(',') === '2027-01-31,2027-02-28,2027-03-31,2027-04-30', 'cópias em 28/02, 31/03 e 30/04');

  // ======================================================================================================
  console.log('\nE) Bloco que já passou:');
  w.duplicateTask('f_r4', { stopPropagation() {} }); w.promptCloneQtd('daily');
  type('3');
  $('clone-qtd-ok').click(); await tick();
  const runs = J(`db.filter((b) => b.title === 'Correr' && b.id !== 'f_r4').sort((a, b) => a.date < b.date ? -1 : 1)`);
  ok(runs.map((b) => b.date + ':' + b.type).join(',') === '2026-11-14:past,2026-11-15:past,2026-11-16:focus', 'o tipo segue o horário: 14 e 15/11 (já passaram) "passado", 16/11 "focus" (' + runs.map((b) => b.date.slice(8) + ':' + b.type).join(' ') + ')');
  ok(runs.every((b) => !('wasDelayed' in b) && b.tagId === null && !('goalId' in b)), 'sem o atraso do original; tag e meta que não existem mais ficam de fora');

  // ======================================================================================================
  console.log('\nF) Tudo ocupado, e o bloco que sumiu:');
  w.duplicateTask('f_r5', { stopPropagation() {} }); w.promptCloneQtd('daily');
  ok($('clone-qtd-sum').textContent === 'O horário está ocupado em todos esses dias.' && !shown('clone-qtd-busy') && $('clone-qtd-ok').disabled && $('clone-qtd-ok').textContent === 'Nada pra criar', 'os 5 dias ocupados: "O horário está ocupado em todos esses dias." e "Nada pra criar" apagado');
  const n0 = J('db.length');
  inp.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  w.confirmCloneQtd();
  ok(J('db.length') === n0 && modalOpen() && lastToast() === 'O horário está ocupado em todos esses dias.', 'Enter e Confirmar não criam nada (e a janelinha fica)');
  $('clone-qtd-modal').querySelector('[data-voltar]').click();
  ok(!modalOpen(), 'Cancelar fecha');
  const r1 = get('f_r1');
  w.duplicateTask('f_r1', { stopPropagation() {} }); w.promptCloneQtd('daily');
  ev(`db = db.filter((b) => b.id !== 'f_r1'); cloneQtdRender();`);
  ok($('clone-qtd-sum').textContent === 'Esse bloco não está mais na agenda.' && $('clone-qtd-ok').disabled, 'o bloco sumiu (outro aparelho): a janelinha avisa e não cria');
  w.confirmCloneQtd();
  ok(!modalOpen() && lastToast() === 'Esse bloco não está mais na agenda.', 'confirmar só fecha e avisa');
  ev(`db.push(${JSON.stringify(r1)}); saveDb();`);

  // ======================================================================================================
  console.log('\nG) Copiar:');
  w.duplicateTask('f_r1', { stopPropagation() {} }); w.cloneManual();
  ok(J('pendingIntent.color') === '#3b82f6' && J('pendingIntent.title') === 'Ler', 'a cópia na mão leva a cor do cartão');
  w.cancelPendingTask();

  // ======================================================================================================
  console.log('\nH) Cartão recolhido sem a "fatia" do checklist:');
  ev(`db.push(
    { id: 'f_h30', type: 'focus', title: 'CARTAO MERCADO PAGO com um nome bem comprido pra quebrar', startMin: 420, duration: 30, date: '2026-11-17', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    { id: 'f_h30c', type: 'focus', title: 'Com checklist', startMin: 455, duration: 30, date: '2026-11-17', theme: 'focus', microblocks: [{ id: 'mb_h1', title: 'um', done: true }, { id: 'mb_h2', title: 'dois', done: false }], completed: false, linkedNoteIds: [] },
    { id: 'f_h33c', type: 'focus', title: 'Checklist 33', startMin: 490, duration: 33, date: '2026-11-17', theme: 'focus', microblocks: [{ id: 'mb_h3', title: 'um', done: false }], completed: false, linkedNoteIds: [] },
    { id: 'f_h33', type: 'focus', title: 'Sem checklist 33', startMin: 530, duration: 33, date: '2026-11-17', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    { id: 'f_h37', type: 'focus', title: 'Sem checklist 37', startMin: 570, duration: 37, date: '2026-11-17', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] },
    { id: 'f_h20', type: 'focus', title: 'Curtinho', startMin: 615, duration: 20, date: '2026-11-17', theme: 'focus', microblocks: [{ id: 'mb_h4', title: 'um', done: false }], completed: false, linkedNoteIds: [] }
  ); saveDb(); activeDateObj = new Date(2026, 10, 17); renderTimeline();`);
  await tick();
  const card = (id) => d.querySelector('#blocks-container .block-item[data-block-id="' + id + '"]');
  const checks = (id) => card(id).querySelector('.microblock-input').closest('.overflow-y-auto');
  const h3 = (id) => card(id).querySelector('.block-title');
  ok(checks('f_h30').classList.contains('hidden') && h3('f_h30').classList.contains('line-clamp-2') && !h3('f_h30').classList.contains('truncate'), '30 min sem checklist: sem a área do checklist e o nome em até 2 linhas');
  ok(!/check-square/.test(card('f_h30').querySelector('.time-label').innerHTML), '...e sem contador (não tem checklist)');
  ok(checks('f_h30c').classList.contains('hidden') && /07:35 - 08:05 • 30m • 1\/2/i.test(T(card('f_h30c').querySelector('.time-label'))), '30 min com checklist: a área some e o horário conta: "' + T(card('f_h30c').querySelector('.time-label')) + '"');
  ok(!checks('f_h33c').classList.contains('hidden') && h3('f_h33c').classList.contains('truncate'), '33 min com checklist: cabe um item inteiro, a área aparece (nome numa linha)');
  ok(checks('f_h33').classList.contains('hidden'), '33 min sem checklist: a caixa "+ Adicionar Check" não caberia inteira: some');
  ok(!checks('f_h37').classList.contains('hidden'), '37 min: a caixa cabe, aparece');
  ok(checks('f_h20').classList.contains('hidden') && h3('f_h20').classList.contains('truncate'), 'até 25 min continua como era (uma linha, sem checklist)');
  w.toggleExpandBlock('f_h30', { stopPropagation() {} });
  ok(!checks('f_h30').classList.contains('hidden') && h3('f_h30').classList.contains('break-words') && !h3('f_h30').classList.contains('truncate') && !h3('f_h30').classList.contains('line-clamp-2'), 'aberto: o checklist aparece e o nome vem inteiro');
  ev('collapseAllBlocks()');
  ev(`(() => { const b = db.find((x) => x.id === 'f_h30c'); b.type = 'past'; })(); toggleFilterDelayed();`);
  await tick();
  ok(!!card('f_h30c') && !checks('f_h30c').classList.contains('hidden'), 'no filtro (lista, o cartão cresce) o checklist continua aparecendo');
  w.toggleFilterDelayed();
  ev(`db = db.filter((b) => !/^f_h/.test(b.id)); saveDb(); renderTimeline();`);

  // ======================================================================================================
  console.log('\nI) Metas: "+ Meta em …" em toda categoria:');
  ev(`openListSheet(); switchListTab('goals');`);
  await tick();
  const secs = [...d.querySelectorAll('#goals-container .goal-section')];
  const pess = secs.find((s) => s.dataset.goalList === 'gl_pessoal');
  ok(secs.length >= 3 && secs.every((s) => s.querySelector('.goal-section-add')) && pess && pess.querySelectorAll('[data-goal]').length >= 1, 'todas as categorias têm o atalho, também a Pessoal, que já tem metas');
  ok(pess && /Meta em Pessoal/.test(T(pess.querySelector('.goal-section-add'))) && pess.lastElementChild === pess.querySelector('.goal-section-add'), 'o atalho fica depois das metas da categoria');
  pess.querySelector('.goal-section-add').click();
  ok(J('goalForm && goalForm.listId') === 'gl_pessoal', '"+ Meta em Pessoal" abre a meta nova já em Pessoal');
  ev('closeAllSheets()');

  // ======================================================================================================
  console.log('\nJ) Nome pela meta:');
  w.openSheet();
  ok($('task-input').placeholder === 'Nome da tarefa', '+: o campo começa com o texto de sempre');
  w.selectNewGoal(LER);
  ok($('task-input').placeholder === 'Ler', 'escolheu a meta "Ler": o nome dela aparece clarinho');
  $('task-input').value = '';
  w.commitIntent();
  ok(J('pendingIntent && pendingIntent.title') === 'Ler' && J('pendingIntent.goalId') === LER, 'sem nome: o bloco vai pra mão como "Ler", ligado à meta');
  w.cancelPendingTask();
  w.openSheet();
  ok($('task-input').placeholder === 'Nome da tarefa' && J('selectedGoalId') === null, 'abrir o + de novo volta o texto de sempre (sem meta)');
  $('task-input').value = ''; w.commitIntent();
  ok(J('pendingIntent') === null, 'sem nome e sem meta, não faz nada (como antes)');
  ev('closeAllSheets()');
  ev(`openListSheet(); switchListTab('backlog'); openBacklogForm();`);
  ok($('backlog-input').placeholder === 'Nome da tarefa', 'nova tarefa: texto de sempre');
  w.selectBacklogFormGoal(AGUA);
  ok($('backlog-input').placeholder === 'Beber água', 'com a meta "Beber água" o campo mostra o nome dela');
  const nT = J('backlogDb.length');
  $('backlog-input').value = ''; w.saveBacklogForm();
  ok(J('backlogDb.length') === nT + 1 && J('backlogDb[backlogDb.length - 1].title') === 'Beber água' && J('backlogDb[backlogDb.length - 1].goalId') === AGUA, 'salvou sem nome: a tarefa se chama "Beber água" e fica ligada à meta');
  ev('closeAllSheets()');
  w.openSublistCard('f_r2', 'cd_2', { stopPropagation() {} });
  ok(shown('sub-card-modal') && $('sub-card-title').placeholder === '', 'cartão da sublista aberto (sem meta)');
  w.selectSubCardGoal(AGUA);
  ok($('sub-card-title').placeholder === 'Beber água', 'escolheu a meta: o nome dela aparece clarinho');
  $('sub-card-title').value = ''; w.saveSubCard(); await tick();
  const cd2 = get('f_r2').cards.find((c) => c.id === 'cd_2');
  ok(cd2 && cd2.title === 'Beber água' && cd2.goalId === AGUA, 'salvou sem nome: o cartão se chama "Beber água"');

  // ======================================================================================================
  console.log('\nK) Ocultar vagos com 2 dias lado a lado:');
  ev(`activeDateObj = new Date(2026, 10, 18); setTlDays(2);`);
  await tick();
  const nToast = toasts().length;
  w.toggleTlCompact(); await tick();
  const bands = [...d.querySelectorAll('#blocks-container .tl-multi-band')].map((b) => T(b));
  ok(toasts().length === nToast, 'sem o aviso "Ocultar vagos vale quando a agenda mostra 1 dia"');
  ok(bands.join(' | ') === '07:00–08:00 · livre 1h | 08:30–10:00 · livre 1h 30m | 10:45–24:00 · livre 13h 15m', 'some só o que está livre nos dois dias (18 e 19/11): ' + bands.join(' | '));
  ok(J('tlSegs.filter((s) => s.gap).length') === 3 && ev('tlY(24 * 60)') < 400, 'a régua encolhe (' + Math.round(ev('tlY(24 * 60)')) + ' px no lugar de ' + 17 * 60 * 3 + ')');
  const labels = [...d.querySelectorAll('#y-axis div')].map((x) => x.textContent);
  ok(!labels.includes('12:00') && labels.includes('08:00') && labels.includes('10:00'), 'as horas dentro dos vagos ocultos saem da régua (' + labels.join(' ') + ')');
  const top8 = ev(`tlY(8 * 60)`), b1 = d.querySelector('#blocks-container .tl-col[data-date="2026-11-18"] .tl-mini[data-mini-id="f_r1"]');
  ok(b1 && Math.abs(parseFloat(b1.style.top) - (top8 + 1)) < 0.5, 'os blocos ficam no lugar certo na régua encolhida');
  w.toggleTlCompact(); await tick();
  ok(!d.querySelector('#blocks-container .tl-multi-band') && J('tlSegs') === null, 'desligou: as faixas somem e a escala volta');
  ev('setTlDays(1); activeDateObj = new Date(2026, 10, 18); renderTimeline();');

  // ======================================================================================================
  console.log('\nL) Na nuvem:');
  server.addUser('t@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 't@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  w.closeAllSheets();
  const c0 = copies[0];
  const row = server.get('blocos', UID, c0.id);
  ok(row && row.date === '2026-11-19' && row.start_min === 480 && row.type === 'focus' && row.completed === false && row.was_delayed === false && JSON.stringify(row.linked_note_ids) === '[]' && row.goal_id === LER && row.tag_id === 'tag_1700000001000' && row.color === '#3b82f6', 'as cópias subiram com os campos certos');
  ok(server.alive('blocos', UID).filter((r) => r.title === 'Ler').length === 5, 'as 4 cópias e o original estão na nuvem');
  // campo com foco numa janelinha FECHADA (sem passar pelo Cancelar) não segura a sincronização
  w.duplicateTask(c0.id, { stopPropagation() {} }); w.promptCloneQtd('daily');
  inp.focus(); ev('closeAllSheets()');
  const preso = d.activeElement === inp && $('clone-qtd-modal').classList.contains('hidden');
  server.patch('blocos', UID, copies[1].id, { title: 'Ler (PC)' });
  w.fazSyncNow();
  ok(await waitFor(() => (get(copies[1].id) || {}).title === 'Ler (PC)', 10000), 'a mudança do PC entra mesmo com o foco preso no campo da janelinha fechada');
  ok(preso, '...(o foco estava mesmo no campo da janelinha fechada)');
  inp.blur();
  // repetir depois de entrar: sobe sozinho
  w.duplicateTask('f_r5', { stopPropagation() {} }); w.promptCloneQtd('weekly'); type('1');
  ok($('clone-qtd-sum').textContent.startsWith('Às 11:40, em Qua 02/12.'), 'Cheio, toda semana, 1 vez: Qua 02/12');
  $('clone-qtd-ok').click();
  ok(await waitFor(() => server.alive('blocos', UID).some((r) => r.title === 'Cheio' && r.date === '2026-12-02')), 'a cópia sobe sozinha pra nuvem');

  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
