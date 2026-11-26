// V40.25.0 — DESFAZER e REFAZER no app do celular de verdade (index.html + app.js + sync.js em jsdom).
// (A) apagar tarefa e desfazer (volta no mesmo lugar), refazer; (B) agendar = um passo só; (C) agenda: concluir,
// checklist, mover, voltar pra lista, apagar; (D) lista apagada com as tarefas; (E) arquivar / desarquivar /
// apagar dos arquivados; (F) metas (o "+" desfaz sem barrinha), finanças, notas, tags, rotinas, ordem dos
// cartões; (G) o que NÃO vira passo (abrir cartão, "já passou", Geral e categorias que nascem sozinhas);
// (H) a barrinha (some ao digitar, textos dos avisos); (I) vários passos, refazer some depois de uma ação nova;
// (J) na nuvem: o que chega do PC não vira passo, desfazer vai pra nuvem (até apagado volta), conflito com o PC;
// (K) agenda grande continua rápida.
// Uso: TZ='America/Sao_Paulo' node test_desfazer.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '11111111-1111-1111-1111-111111111111';

(async () => {
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const tick = () => sleep(15); // o passo fecha no próximo "tique"
  const bar = () => !$('undo-bar').classList.contains('hidden');
  const barTxt = () => $('undo-bar-msg').textContent;
  const btnUndo = () => !$('undo-bar-undo').classList.contains('hidden');
  const btnRedo = () => !$('undo-bar-redo').classList.contains('hidden');
  const steps = () => J('undoStack.map((s) => s.label)');
  const blk = (id) => J(`db.find((b) => b.id === ${JSON.stringify(id)}) || null`);
  const task = (id) => J(`backlogDb.find((t) => t.id === ${JSON.stringify(id)}) || null`);
  const ids = (expr) => J(`${expr}.map((x) => x.id)`);
  const colIds = (col) => J(`backlogDb.filter((t) => (t.columnId || 'col_geral') === ${JSON.stringify(col)}).map((t) => t.id)`);
  const fresh = () => ev('undoStack = []; redoStack = []; undoBarHide();');

  // ======================================================================================================
  console.log('A) Apagar uma tarefa da Lista e desfazer:');
  ok(ev('undoReady') === true && steps().length === 0 && !bar(), 'o app abre sem nenhum passo e sem a barrinha');
  w.openListSheet();
  const BETA = 'col_1700000007000', beta0 = colIds(BETA), all0 = ids('backlogDb');
  const T1 = beta0[3];
  ev(`requestDeleteBacklog(${JSON.stringify(T1)})`); w.confirmDeleteBacklog(); await tick();
  ok(!task(T1) && steps().join() === 'Tarefa apagada', 'apagou: virou o passo "Tarefa apagada"');
  ok(bar() && barTxt() === 'Tarefa apagada' && btnUndo() && !btnRedo(), 'a barrinha aparece: "Tarefa apagada" + Desfazer');
  ok(d.querySelector('#undo-bar').getAttribute('role') === 'status' && $('undo-bar-undo').textContent === 'Desfazer', 'a barrinha é anunciada pro leitor de tela');
  $('undo-bar-undo').click();
  ok(JSON.stringify(ids('backlogDb')) === JSON.stringify(all0) && JSON.stringify(colIds(BETA)) === JSON.stringify(beta0), 'Desfazer: a tarefa volta no MESMO lugar (mesma lista, mesma posição)');
  ok(JSON.parse(L('tb_backlog_db')).some((t) => t.id === T1), 'e fica salva no aparelho');
  ok(!!d.querySelector(`[data-bl-card="${T1}"]`), 'e aparece de novo na Lista aberta');
  ok(bar() && barTxt() === 'Desfeito: tarefa apagada' && btnRedo() && !btnUndo(), 'a barrinha vira "Desfeito: tarefa apagada" + Refazer');
  $('undo-bar-redo').click();
  ok(!task(T1) && barTxt() === 'Refeito: tarefa apagada' && btnUndo() && steps().join() === 'Tarefa apagada', 'Refazer apaga de novo ("Refeito: …") e o Desfazer volta');
  w.fazUndo(); await tick();
  ok(!!task(T1) && steps().length === 0, 'desfazendo de novo, a tarefa volta');
  ok(w.fazUndo() === false && /Nada pra desfazer/.test(barTxt()) && !btnUndo(), 'sem passos: "Nada pra desfazer"');
  w.closeAllSheets(); fresh();

  // ======================================================================================================
  console.log('\nB) Agendar uma tarefa = um passo só:');
  const DAY = '2026-11-18';
  ev("activeDateObj = new Date(2026, 10, 18); renderTimeline();");
  const T2 = colIds('col_geral')[2], g0 = colIds('col_geral'), nDb = ev('db.length');
  w.scheduleBacklogItem(T2);
  ok(steps().length === 0, 'pegar a tarefa na mão ainda não é passo');
  const emptyEl = () => [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.classList.contains('bg-hatched'));
  emptyEl().click(); await tick();
  const nb = J(`db.filter((b) => b.date === '${DAY}')`);
  ok(!task(T2) && nb.length === 1 && ev('db.length') === nDb + 1, 'colocou na agenda: a tarefa saiu da Lista e o bloco nasceu');
  ok(steps().join() === 'Tarefa agendada' && barTxt() === 'Tarefa agendada', 'um passo só: "Tarefa agendada"');
  w.fazUndo(); await tick();
  ok(JSON.stringify(colIds('col_geral')) === JSON.stringify(g0) && J(`db.filter((b) => b.date === '${DAY}')`).length === 0 && ev('db.length') === nDb, 'Desfazer: o bloco sai da agenda e a tarefa volta pra Lista, no mesmo lugar');
  ok(!d.querySelector(`#blocks-container .block-item[data-block-id="${nb[0].id}"]`), 'a agenda na tela já mostra sem o bloco');
  w.fazRedo(); await tick();
  ok(!task(T2) && !!blk(nb[0].id) && blk(nb[0].id).startMin === nb[0].startMin, 'Refazer: agenda de novo, no mesmo horário');
  fresh();

  // ======================================================================================================
  console.log('\nC) Na agenda: concluir, checklist, mover, esticar, voltar pra lista, apagar:');
  ev("activeDateObj = new Date(2026, 10, 16); renderTimeline();");
  const day16 = J("db.filter((b) => b.date === '2026-11-16').sort((a, b) => a.startMin - b.startMin)");
  const K1 = day16[1].id;
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(blk(K1).completed === true && steps().join() === 'Bloco concluído' && barTxt() === 'Bloco concluído', 'concluir: "Bloco concluído"');
  w.fazUndo(); await tick();
  ok(blk(K1).completed === false && barTxt() === 'Desfeito: bloco concluído', 'Desfazer: o bloco volta a ficar aberto');
  // checklist
  ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); b.microblocks = [{ id: 'm_a', title: 'Primeiro', done: false }, { id: 'm_b', title: 'Segundo', done: false }]; saveDb(); })()`); await tick();
  fresh();
  w.toggleMicroblock(K1, 'm_b', { stopPropagation() {} }); await tick();
  ok(blk(K1).microblocks[1].done === true && steps().join() === 'Item marcado', 'marcar um item da checklist: "Item marcado"');
  w.deleteMicroblock(K1, 'm_a', { stopPropagation() {} }); await tick();
  ok(blk(K1).microblocks.length === 1 && steps().join() === 'Item marcado,Item da checklist apagado', 'apagar um item: "Item da checklist apagado"');
  w.fazUndo(); await tick(); w.fazUndo(); await tick();
  ok(JSON.stringify(blk(K1).microblocks) === JSON.stringify([{ id: 'm_a', title: 'Primeiro', done: false }, { id: 'm_b', title: 'Segundo', done: false }]), 'dois Desfazer: o item volta e fica desmarcado, na ordem certa');
  fresh();
  // mover (o que o arrastar faz no fim) e esticar
  const before = blk(K1), K1start = before.startMin;
  ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); b.startMin = 20 * 60; b.type = 'focus'; saveDb(); renderTimeline(); })()`); await tick();
  ok(steps().join() === 'Bloco movido', 'mudar o horário: "Bloco movido"');
  ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); b.duration = 90; b.expanded = false; saveDb(); renderTimeline(); })()`); await tick();
  ok(steps().join() === 'Bloco movido,Duração mudada', 'esticar: "Duração mudada"');
  w.fazUndo(); await tick();
  ok(blk(K1).duration === before.duration && blk(K1).startMin === 20 * 60, 'Desfazer a duração não mexe no horário');
  w.fazUndo(); await tick();
  ok(blk(K1).startMin === K1start && JSON.stringify(Object.assign({}, blk(K1), { expanded: undefined })) === JSON.stringify(Object.assign({}, before, { expanded: undefined })), 'Desfazer o movimento: o bloco volta igualzinho (horário, tipo, tudo)');
  // voltar pra lista (Mover pra Lista) e apagar de vez
  fresh();
  const K2 = day16[2].id, nBl = ev('backlogDb.length');
  w.openDeleteModal(K2); w.moveToBacklog(); await tick();
  ok(!blk(K2) && ev('backlogDb.length') === nBl + 1 && steps().join() === 'Voltou pra lista ' + ev('backlogColumnsDb[0].name') && barTxt() === steps().join(), 'Mover pra Lista: "' + barTxt() + '" (V40.38.0: diz pra qual lista; o bloco nasceu na agenda, então a primeira)');
  w.fazUndo(); await tick();
  ok(!!blk(K2) && ev('backlogDb.length') === nBl, 'Desfazer: o bloco volta pra agenda e a tarefa criada sai da Lista');
  w.openDeleteModal(K2); w.confirmKillTask(); await tick();
  ok(!blk(K2) && steps().pop() === 'Bloco apagado' && barTxt() === 'Bloco apagado', 'Excluir definitivo: "Bloco apagado"');
  w.fazUndo(); await tick();
  ok(!!blk(K2) && !!d.querySelector(`#blocks-container .block-item[data-block-id="${K2}"]`), 'Desfazer: volta e aparece na agenda');
  ok(blk(K2).type === day16[2].type, 'volta com o mesmo tipo (já passou / foco)');
  fresh();

  // ======================================================================================================
  console.log('\nC2) Sublista:');
  ev(`db.push({ id: 'sub_t', date: '2026-11-19', startMin: 14 * 60, duration: 60, title: 'Rápidas', type: 'focus', theme: 'focus', tagId: null, microblocks: [], linkedNoteIds: [], completed: false, cards: [{ id: 'cd_a', title: 'A', done: false, microblocks: [] }, { id: 'cd_b', title: 'B', done: false, microblocks: [] }] }); undoQuiet(saveDb);`);
  ev("activeDateObj = new Date(2026, 10, 19); renderTimeline();");
  w.toggleSublistCard('sub_t', 'cd_a', {}); await tick();
  ok(blk('sub_t').cards[0].done === true && steps().join() === 'Cartão marcado', 'marcar um cartão da sublista: "Cartão marcado"');
  w.toggleSublistCard('sub_t', 'cd_b', {}); await tick();
  ok(blk('sub_t').completed === true && steps().pop() === 'Cartão marcado', 'marcar o último conclui a sublista (um passo só)');
  w.fazUndo(); await tick();
  ok(blk('sub_t').cards[1].done === false && blk('sub_t').completed === false, 'Desfazer: o cartão desmarca e a sublista deixa de estar concluída');
  fresh();
  const T5 = colIds('col_geral')[1];
  w.scheduleBacklogItem(T5); w.dropIntoSublist('sub_t', {}); await tick();
  ok(!task(T5) && blk('sub_t').cards.length === 3 && steps().join() === 'Tarefa entrou na sublista', 'tarefa da Lista entrando na sublista: "Tarefa entrou na sublista"');
  w.fazUndo(); await tick();
  ok(!!task(T5) && blk('sub_t').cards.length === 2, 'Desfazer: a tarefa volta pra Lista e sai da sublista');
  const nb5 = ev('backlogDb.length');
  w.openDeleteModal('sub_t'); w.moveToBacklog(); await tick();
  ok(!blk('sub_t') && ev('backlogDb.length') === nb5 + 1 && steps().pop() === 'Sublista apagada', 'apagar devolvendo o não feito: "Sublista apagada" (1 cartão foi pra Lista)');
  w.fazUndo(); await tick();
  ok(!!blk('sub_t') && blk('sub_t').cards.length === 2 && ev('backlogDb.length') === nb5, 'Desfazer: a sublista volta com os 2 cartões e o cartão devolvido sai da Lista');
  ev("db = db.filter((b) => b.id !== 'sub_t'); undoQuiet(saveDb);");
  fresh();

  // ======================================================================================================
  console.log('\nD) Apagar uma lista com as tarefas dela:');
  w.openListSheet();
  const GAMA = 'col_1700000008000', gama0 = colIds(GAMA), cols0 = ids('backlogColumnsDb'), all1 = ids('backlogDb');
  ev(`activeColumnId = '${GAMA}'`); w.openDeleteColumn();
  const sub = $('column-delete-subtitle').innerText || $('column-delete-subtitle').textContent; // (o app usa innerText; no jsdom ele não vira textContent)
  ok(/6 tarefas serão apagadas junto\. Se mudar de ideia, toque em Desfazer logo depois\./.test(sub) && !/não pode ser desfeita/.test(sub + d.body.innerHTML), 'o aviso de apagar lista agora diz que dá pra desfazer: "' + sub + '"');
  w.confirmDeleteColumn(); await tick();
  ok(!J('backlogColumnsDb').some((c) => c.id === GAMA) && colIds(GAMA).length === 0 && steps().join() === 'Lista apagada', 'apagou a lista e as 6 tarefas: "Lista apagada"');
  w.fazUndo(); await tick();
  ok(JSON.stringify(ids('backlogColumnsDb')) === JSON.stringify(cols0) && JSON.stringify(colIds(GAMA)) === JSON.stringify(gama0) && JSON.stringify(ids('backlogDb')) === JSON.stringify(all1), 'Desfazer: a lista volta no lugar dela, com as 6 tarefas na ordem');
  ok(!!d.querySelector(`[data-column-id="${GAMA}"]`) || $('backlog-columns-wrapper').textContent.includes('GAMA'), 'e aparece de novo nas Listas');
  ev(`activeColumnId = '${GAMA}'`); w.openDeleteColumn(); w.confirmDeleteColumn(); await tick();
  ok(ev('activeColumnId') === 'col_geral', 'apagou de novo (a tela foi pra Geral)');
  w.fazRedo(); await tick();
  ok(J('backlogColumnsDb').some((c) => c.id === GAMA) === false, 'Refazer depois de uma ação nova não existe (o passo novo apagou o "refazer")');
  w.fazUndo(); await tick();
  ok(J('backlogColumnsDb').some((c) => c.id === GAMA) && colIds(GAMA).length === 6, 'e o Desfazer traz de volta');
  w.closeAllSheets(); fresh();

  // ======================================================================================================
  console.log('\nE) Arquivar, desarquivar, apagar dos arquivados:');
  const K3 = day16[3].id;
  w.fazArchiveBlock(K3); await tick();
  ok(!blk(K3) && J('archiveDb').length === 1 && steps().join() === 'Bloco arquivado' && barTxt() === 'Bloco arquivado', 'arquivar um bloco: "Bloco arquivado"');
  w.fazUndo(); await tick();
  ok(!!blk(K3) && J('archiveDb').length === 0, 'Desfazer: volta pra agenda e sai dos arquivados');
  const T3 = colIds('col_geral')[0];
  w.fazArchiveTask(T3); await tick();
  ok(!task(T3) && steps().pop() === 'Tarefa arquivada', 'arquivar uma tarefa: "Tarefa arquivada"');
  w.fazUnarchive(T3); await tick();
  ok(!!task(T3) && steps().pop() === 'Tarefa desarquivada', 'desarquivar: "Tarefa desarquivada"');
  w.fazUndo(); await tick();
  ok(!task(T3) && J('archiveDb').length === 1, 'Desfazer o desarquivar: volta pros arquivados');
  B.confirms.length = 0;
  w.fazDeleteArchived(T3); await tick();
  ok(J('archiveDb').length === 0 && steps().pop() === 'Apagado dos arquivados', 'apagar de vez: "Apagado dos arquivados"');
  ok(B.confirms.length === 1 && !/não pode ser desfeita/.test(B.confirms[0]), 'a pergunta não diz mais que "não pode ser desfeita"');
  w.fazUndo(); await tick();
  ok(J('archiveDb').length === 1 && J('archiveDb')[0].item.id === T3, 'Desfazer: volta pros arquivados');
  w.fazUndo(); await tick();
  ok(!!task(T3) && J('archiveDb').length === 0 && JSON.stringify(colIds('col_geral').slice(0, 1)) === JSON.stringify([T3]), 'Desfazer o arquivar: a tarefa volta pro topo da Geral, onde estava');
  fresh();

  // ======================================================================================================
  console.log('\nF) Metas, finanças, notas, tags, rotinas e a ordem dos cartões:');
  ev('ensureGoalLists()'); await tick();
  ok(steps().length === 0 && J('goalListsDb').length === 3, 'as 3 categorias que nascem sozinhas não viram passo');
  ev(`goalsDb.push({ id: 'meta_t1', listId: goalListsDb[0].id, title: 'Água', emoji: '💧', period: 'dia', unit: 'vezes', target: 3, step: 1, position: 1, createdAt: 1 }); saveGoals();`); await tick();
  ok(steps().join() === 'Meta criada', 'criar meta: "Meta criada"');
  fresh();
  w.goalBump('meta_t1', 1); await tick(); w.goalBump('meta_t1', 1); await tick();
  ok(J('goalDaysDb')[0].amount === 2 && steps().join() === 'Progresso da meta,Progresso da meta' && !bar(), 'o "+" vira passo, mas sem barrinha (ele já tem o "−")');
  w.fazUndo(); await tick();
  ok(J('goalDaysDb')[0].amount === 1, 'Desfazer tira só o último "+"');
  fresh();
  // finanças: marcar como paga
  const F1 = J('financialDb[0]');
  const mon = ev('currentFinanceMonth');
  w.togglePaidFinancial(F1.id, mon); await tick();
  const paid = J('financialDb[0]').paidMonths || [];
  ok(steps().length === 1 && steps()[0] === (paid.includes(mon) ? 'Despesa paga' : 'Pagamento desmarcado'), 'marcar despesa: "' + steps()[0] + '"');
  w.fazUndo(); await tick();
  ok(JSON.stringify(J('financialDb[0]').paidMonths || []) === JSON.stringify(F1.paidMonths || []), 'Desfazer devolve o pago como estava');
  // notas
  fresh();
  w.openNoteForm(); await sleep(70);
  $('note-title-input').value = 'Lembrete'; $('note-content-input').value = 'Comprar pão';
  w.addNote(); await tick();
  const N1 = J('notesDb').find((n) => n.title === 'Lembrete');
  ok(!!N1 && steps().join() === 'Nota criada', 'nota nova: "Nota criada"');
  w.fazUndo(); await tick();
  ok(!J('notesDb').some((n) => n.id === N1.id), 'Desfazer apaga a nota criada');
  // tags: apagar a tag tira ela dos blocos; desfazer devolve as duas coisas
  fresh();
  const TG = J('tagsDb[0]'), withTag = J(`db.filter((b) => b.tagId === '${TG.id}').map((b) => b.id)`);
  w.deleteTag(TG.id); await tick();
  ok(!J('tagsDb').some((t) => t.id === TG.id) && J(`db.filter((b) => b.tagId === '${TG.id}')`).length === 0 && steps().join() === 'Tag apagada', 'apagar tag: "Tag apagada" (e ' + withTag.length + ' blocos ficam sem ela)');
  w.fazUndo(); await tick();
  ok(J('tagsDb')[0].id === TG.id && JSON.stringify(J(`db.filter((b) => b.tagId === '${TG.id}').map((b) => b.id)`)) === JSON.stringify(withTag), 'Desfazer: a tag volta (primeira da lista) e os blocos voltam a ter a tag');
  // rotinas (a lista é reordenada ao desenhar: não pode virar passo)
  fresh();
  w.renderRoutinesList(); ev('saveRoutinesDb()'); await tick();
  ok(steps().length === 0, 'redesenhar as rotinas (que reordena a lista) não vira passo');
  const R1 = J('routinesDb[0]');
  ev(`pendingRoutineDeleteId = ${JSON.stringify(R1.id)}`); w.confirmDeleteRoutine(); await tick();
  ok(!J('routinesDb').some((r) => r.id === R1.id) && steps().join() === 'Rotina apagada', 'apagar rotina: "Rotina apagada"');
  w.fazUndo(); await tick();
  ok(J('routinesDb').some((r) => r.id === R1.id && r.title === R1.title), 'Desfazer: a rotina volta');
  // ordem dos cartões (arrastar pra cima)
  fresh();
  const D0 = colIds('col_1700000009000');
  ev(`reorderBacklog(${JSON.stringify(D0[4])}, ${JSON.stringify(D0[1])}); saveBacklog();`); await tick();
  ok(colIds('col_1700000009000')[1] === D0[4] && steps().join() === 'Cartão mudou de lugar', 'arrastar o cartão pra cima: "Cartão mudou de lugar"');
  w.fazUndo(); await tick();
  ok(JSON.stringify(colIds('col_1700000009000')) === JSON.stringify(D0), 'Desfazer: a ordem volta');
  // mover de lista
  fresh();
  const mv = D0[0];
  ev(`_moveCardPendingId = ${JSON.stringify(mv)}`); w.confirmMoveCard(BETA); await tick();
  ok(task(mv).columnId === BETA && steps().join() === 'Tarefa movida de lista', 'mover pra outra lista: "Tarefa movida de lista"');
  w.fazUndo(); await tick();
  ok((task(mv).columnId || 'col_geral') === 'col_1700000009000' && JSON.stringify(colIds('col_1700000009000')) === JSON.stringify(D0), 'Desfazer: volta pra lista DELTA, no mesmo lugar');
  fresh();

  // ======================================================================================================
  console.log('\nG) O que NÃO vira passo:');
  w.toggleExpandBlock(K1, { stopPropagation() {} }); await tick();
  ok(blk(K1).expanded === true && steps().length === 0, 'abrir um cartão da agenda');
  w.toggleExpandBlock(K1, { stopPropagation() {} }); await tick();
  ok(steps().length === 0, 'fechar o cartão');
  const H1 = J("db.filter((b) => b.date === '2026-11-15')")[0].id; // hoje, às 7h: já passou
  ev(`db.find((b) => b.id === '${H1}').type = 'focus'; saveDb();`); await tick();
  ev('runRealTimeEngine()'); await tick();
  ok(blk(H1).type === 'past' && steps().length === 0, 'a agenda marcar sozinha "já passou"');
  ev("backlogColumnsDb = backlogColumnsDb.filter((c) => c.id !== 'col_geral'); renderBacklog();"); await tick();
  ok(J('backlogColumnsDb').some((c) => c.id === 'col_geral') && steps().length === 0, 'a lista Geral que nasce sozinha');
  ev('saveDb(); saveBacklog(); saveNotes();'); await tick();
  ok(steps().length === 0, 'salvar sem mudar nada');
  fresh();

  // ======================================================================================================
  console.log('\nH) A barrinha:');
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(bar(), 'apareceu');
  $('search-input').dispatchEvent(new w.FocusEvent('focusin', { bubbles: true }));
  ok(!bar(), 'começou a digitar num campo: a barrinha sai da frente');
  $('search-input').focus();
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(!bar() && steps().length === 2, 'mudança feita com um campo em foco: guarda o passo, mas não cobre o campo');
  $('search-input').blur();
  const css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');
  ok(/#undo-bar\.hidden \{ display: none; \}/.test(css) && /#undo-bar \{[^}]*z-index: 55;/.test(css) && /#floating-task:not\(\.hidden\) ~ #undo-bar \{ bottom: 160px; bottom: calc\(max\(1\.5rem, calc\(var\(--faz-safe-bottom\) \+ 0\.5rem\)\) \+ 136px\); \}/.test(css) && /#undo-bar \{[^}]*bottom: calc\(max\(2rem, calc\(var\(--faz-safe-bottom\) \+ 0\.75rem\)\) \+ 68px\);/.test(css) && /--faz-safe-bottom: max\(env\(safe-area-inset-bottom, 0px\), var\(--faz-nav-gap, 0px\)\)/.test(css), 'CSS: some de verdade quando escondida, fica acima das telas (55) e sobe com a tarefa na mão (e com a barra de baixo do celular, V40.36.1; V40.49.0: --faz-safe-bottom, que soma a barra do Android que o Chrome não avisa)');
  const sibs = [...$('undo-bar').parentElement.children];
  ok(sibs.indexOf($('floating-task')) >= 0 && sibs.indexOf($('floating-task')) < sibs.indexOf($('undo-bar')), 'a barrinha vem depois da faixa da tarefa na mão (o CSS "~" depende disso)');
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(bar(), 'mostrou de novo');
  w.openDeleteModal(K1); await tick();
  ok(!bar(), 'abriu uma janelinha (apagar): a barrinha sai da frente');
  const nS = steps().length;
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(!bar() && steps().length === nS + 1, 'mudança com a janelinha aberta: guarda o passo sem mostrar a barrinha');
  w.cancelDelete(); await tick();
  w.toggleBlockCompletion(K1, { stopPropagation() {} }); await tick();
  ok(bar(), 'fechou a janelinha: a próxima mudança mostra de novo');
  await sleep(5200);
  ok(!bar(), 'some sozinha depois de uns segundos');
  fresh();

  // ======================================================================================================
  console.log('\nI) Vários passos:');
  const s0 = blk(K1);
  for (const m of [600, 660, 720]) { ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); b.startMin = ${m}; saveDb(); })()`); await tick(); }
  ok(steps().length === 3, '3 movimentos = 3 passos');
  w.fazUndo(); await tick();
  ok(blk(K1).startMin === 660 && btnUndo() && btnRedo(), 'Desfazer: volta um; a barrinha oferece Refazer e mais um Desfazer');
  $('undo-bar-undo').click(); await tick();
  ok(blk(K1).startMin === 600, 'Desfazer de novo: volta mais um');
  w.fazRedo(); await tick();
  ok(blk(K1).startMin === 660, 'Refazer: avança um');
  ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); b.title = 'Outro nome'; saveDb(); })()`); await tick();
  ok(J('redoStack').length === 0 && steps().pop() === 'Bloco editado', 'ação nova: o Refazer some ("Bloco editado")');
  ev('for (let i = 0; i < 60; i++) { db.find((x) => x.id === ' + JSON.stringify(K1) + ').duration = 20 + i; saveDb(); undoClose(); }');
  ok(steps().length === 40, 'guarda no máximo 40 passos');
  ev(`(function(){ const b = db.find((x) => x.id === '${K1}'); Object.assign(b, ${JSON.stringify(s0)}); saveDb(); })()`); await tick();
  fresh();

  // ======================================================================================================
  console.log('\nJ) Na nuvem (celular <-> PC):');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  w.closeAllSheets();
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(60); };
  fresh();
  ok(typeof w.fazSyncApplying === 'function' && w.fazSyncApplying() === false, 'o sync diz quando está aplicando o que veio da nuvem');
  // o PC muda: não vira passo do celular
  const T4 = colIds(BETA)[0];
  server.patch('tarefas', UID, T4, { title: 'Mudou no PC' });
  await syncDone();
  ok(task(T4).title === 'Mudou no PC' && steps().length === 0, 'o que chega do PC não vira passo aqui');
  // apagar, sincronizar, desfazer: a nuvem traz de volta
  ev(`requestDeleteBacklog(${JSON.stringify(T4)})`); w.confirmDeleteBacklog(); await tick();
  await syncDone();
  ok(server.get('tarefas', UID, T4).deleted === true, 'apagou e a nuvem soube (deleted)');
  w.fazUndo(); await tick();
  await syncDone();
  ok(!!task(T4) && server.get('tarefas', UID, T4).deleted === false && server.get('tarefas', UID, T4).title === 'Mudou no PC', 'Desfazer depois do sync: a tarefa volta aqui E na nuvem (deleted = false)');
  // conflito: o PC mexe no mesmo item depois da ação
  fresh();
  const K4 = day16[4].id;
  w.toggleBlockCompletion(K4, { stopPropagation() {} }); await tick();
  await syncDone();
  server.patch('blocos', UID, K4, { title: 'Renomeado no PC' });
  await syncDone();
  ok(blk(K4).title === 'Renomeado no PC' && blk(K4).completed === true, 'o PC renomeou o bloco que o celular concluiu');
  ok(w.fazUndo() === false && /já mudou em outro aparelho/.test(barTxt()) && blk(K4).completed === true && blk(K4).title === 'Renomeado no PC', 'Desfazer não pisa no que o PC fez: "Não deu pra desfazer: isso já mudou em outro aparelho"');
  // em parte: dois itens, só um mudou lá
  fresh();
  const [P1, P2] = colIds(BETA).slice(1, 3);
  ev(`backlogDb = backlogDb.filter((t) => t.id !== ${JSON.stringify(P1)} && t.id !== ${JSON.stringify(P2)}); saveBacklog();`); await tick();
  ok(steps().join() === '2 tarefas apagadas', 'apagar duas de uma vez: "2 tarefas apagadas"');
  ev(`backlogDb.push({ id: ${JSON.stringify(P1)}, title: 'Recriada', duration: 15, microblocks: [] }); undoQuiet(saveBacklog);`);
  w.fazUndo(); await tick();
  ok(/em parte/.test(barTxt()) && task(P1).title === 'Recriada' && !!task(P2), 'só uma mudou depois: desfaz a outra e avisa "em parte"');
  await syncDone();
  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));

  // ======================================================================================================
  console.log('\nK) Agenda grande:');
  ev(`(function(){ const base = db[0]; for (let i = 0; i < 5000; i++) db.push(Object.assign({}, base, { id: 'big_' + i, date: '2025-0' + (1 + (i % 9)) + '-1' + (i % 9), microblocks: [{ id: 'mb', title: 'x', done: false }] })); undoQuiet(saveDb); })()`);
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) ev(`db.find((b) => b.id === 'big_${i}').completed = true; saveDb();`);
  const ms = (Date.now() - t0) / 10;
  ok(ms < 150, 'com ' + ev('db.length') + ' blocos, salvar + guardar o passo leva ' + ms.toFixed(1) + ' ms');
  await tick();
  ok(steps().length >= 1, 'e os passos continuam sendo guardados');

  try { w.close(); } catch (e) {}
  end();
})().catch((e) => { console.error('ERRO', e); fail++; end(); });

function end() {
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}
