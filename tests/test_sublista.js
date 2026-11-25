// V40.24.0 — Sublista (bloco-grupo) e vagos ocultos no app do celular de verdade (index.html + app.js + sync.js em
// jsdom): criar pelo botão +, colocar cartões (da Lista e novos), marcar, abrir o cartão, voltar pra lista, devolver os
// não feitos, duplicar e repetir, apagar, busca, backup, Assistente, ocultar os vagos (faixas, régua encolhida,
// arrastar e esticar) e a ida e volta pela nuvem (o PC mexendo nos cartões).
// Uso: TZ='America/Sao_Paulo' node test_sublista.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const A = require(path.resolve(REPO, 'assistente.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '11111111-1111-1111-1111-111111111111';

(async () => {
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const toasts = () => w.__toasts || [];
  const lastToast = () => toasts()[toasts().length - 1] || '';
  const DAY = '2026-11-18'; // quarta: dia sem nada na agenda dos dados de teste
  ev("activeDateObj = new Date(2026, 10, 18); renderTimeline();");
  const subs = () => [...d.querySelectorAll('#blocks-container .sub-block')];
  const subEl = (id) => d.querySelector(`#blocks-container .block-item[data-block-id="${id}"]`);
  const blk = (id) => ev(`JSON.stringify(db.find((b) => b.id === ${JSON.stringify(id)}) || null)`);
  const get = (id) => JSON.parse(blk(id));
  const emptyEl = () => [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.classList.contains('bg-hatched'));

  // ======================================================================================================
  console.log('A) Criar a sublista pelo botão + (chip "Sublista", do lado do Descanso):');
  w.openSheet();
  const chip = [...d.querySelectorAll('#bottom-sheet button')].find((b) => /Sublista/.test(b.textContent));
  ok(!!chip && /Descanso/.test(chip.previousElementSibling.textContent), 'o chip "Sublista" está no + logo depois do "Descanso"');
  $('task-input').value = 'Pendências rápidas';
  d.querySelector('.sheet-dur-btn[data-time="60"]').click();
  chip.click();
  ok(ev('JSON.stringify(pendingIntent)') === JSON.stringify({ title: 'Pendências rápidas', duration: 60, theme: 'focus', tagId: null, cards: [] }) && !$('floating-task').classList.contains('hidden'), 'a sublista vai pra mão com o nome digitado e 1h');
  ok(subs().length === 0 && /colocar a sublista/.test(lastToast()), 'aviso: "' + lastToast() + '"');
  emptyEl().click();
  const S1 = ev("(db.find((b) => b.date === '" + DAY + "' && Array.isArray(b.cards)) || {}).id");
  let s1 = get(S1);
  ok(s1 && s1.startMin === 420 && s1.duration === 60 && s1.title === 'Pendências rápidas' && JSON.stringify(s1.cards) === '[]' && s1.type === 'focus' && !s1.completed, 'soltou no Tempo Livre: sublista vazia das 07:00 às 08:00');
  ok(ev('pendingIntent') === null && subs().length === 1, 'a mão ficou vazia e a sublista aparece na agenda');
  let el = subEl(S1);
  ok(el.classList.contains('sub-amber') && /07:00 - 08:00/.test(el.querySelector('.time-label').textContent) && el.querySelector('.sub-count').textContent === '0' && /Vazia/.test(el.textContent), 'amarelinha, com horário, contagem 0 e "Vazia"');
  ok(!!el.querySelector('.drag-handle') && !!el.querySelector('.resize-handle'), 'tem as alças de arrastar e esticar, como um bloco');
  // sem nome: vira "Sublista"
  w.openSheet(); $('task-input').value = '   '; chip.click();
  ok(ev('pendingIntent.title') === 'Sublista', 'sem nome digitado, o nome é "Sublista"');
  w.cancelPendingTask();

  // ======================================================================================================
  console.log('\nB) Cartões: criar dentro, colocar da Lista, marcar:');
  w.toggleExpandBlock(S1, { stopPropagation() {} });
  el = subEl(S1);
  const inp = $('sub-input-' + S1);
  ok(!!inp && /Adicionar cartão/.test(inp.placeholder) && !!el.querySelector('[onclick^="openEditModal"]'), 'aberta: campo "+ Adicionar cartão" e a barra Editar/Duplicar/Arquivar/Apagar');
  inp.value = '  Imprimir a planta  ';
  w.addSublistCard(S1, inp, {});
  s1 = get(S1);
  ok(s1.cards.length === 1 && s1.cards[0].title === 'Imprimir a planta' && /^cd_[a-z0-9]+_[a-z0-9]+$/.test(s1.cards[0].id) && s1.cards[0].done === false && JSON.stringify(s1.cards[0].microblocks) === '[]', 'cartão novo criado lá dentro (id cd_…, sem horário próprio)');
  // tarefa da Lista: agendar → tocar na sublista
  const T1 = JSON.parse(ev("JSON.stringify(backlogDb.find((i) => i.id === 'bl_1700000011000'))"));
  w.scheduleBacklogItem(T1.id);
  el = subEl(S1);
  ok(el.classList.contains('sub-target') && /Colocar aqui/.test(el.textContent) && !el.querySelector('.block-btn'), 'com a tarefa na mão, a sublista vira lugar de soltar ("Colocar aqui")');
  ok(ev('pendingIntent.columnId') === 'col_1700000008000', 'a mão guarda a lista de origem da tarefa');
  el.click();
  s1 = get(S1);
  const c1 = s1.cards[1];
  ok(s1.cards.length === 2 && c1.title === 'Tarefa 1' && c1.tagId === T1.tagId && c1.duration === 15 && c1.columnId === 'col_1700000008000' && c1.microblocks.length === 3 && c1.microblocks.every((m) => m.done === false), 'a tarefa entrou inteira: nome, tag, tempo, lista de origem e checklist');
  ok(!ev("backlogDb.some((i) => i.id === 'bl_1700000011000')") && ev('pendingIntent') === null && lastToast() === 'Entrou na sublista Pendências rápidas', 'saiu da Lista (igual a agendar) e avisou: "' + lastToast() + '"');
  el = subEl(S1);
  ok(el.querySelectorAll('.sub-card').length === 2 && el.querySelector('.sub-count').textContent === '0/2' && el.querySelectorAll('.sub-card')[1].querySelector('.sub-card-mb').textContent.trim() === '0/3', 'a sublista mostra os 2 cartões, "0/2" e a checklist do cartão (0/3)');
  ok(el.querySelectorAll('.sub-card')[1].style.borderLeftColor !== '', 'o cartão com tag tem a faixa da cor da tag');
  // marcar
  el.querySelectorAll('.sub-card .sub-ck')[0].click();
  s1 = get(S1);
  ok(s1.cards[0].done === true && !s1.completed && subEl(S1).querySelector('.sub-count').textContent === '1/2', 'marcou um: 1/2, a sublista ainda não está concluída');
  toasts().length = 0;
  subEl(S1).querySelectorAll('.sub-card .sub-ck')[1].click();
  s1 = get(S1);
  ok(s1.completed === true && subEl(S1).classList.contains('sub-done') && lastToast() === 'Sublista concluída! 🎉', 'marcou o último: a sublista fica concluída (verde) e avisa');
  w.toggleSublistCard(S1, s1.cards[0].id, {});
  ok(get(S1).completed === false, 'desmarcou um: reabre');
  w.toggleBlockCompletion(S1, { stopPropagation() {} });
  s1 = get(S1);
  ok(s1.completed === true && s1.cards.every((c) => c.done), 'o ✓ da sublista marca todos');
  w.toggleBlockCompletion(S1, { stopPropagation() {} });
  s1 = get(S1);
  ok(s1.completed === false && s1.cards.every((c) => !c.done), 'e com todos marcados, desmarca todos');
  // a mão com Descanso ou com outra sublista não solta dentro dela
  w.openSheet(); w.commitSpecialIntent('Descanso', 'rest');
  ok(!subEl(S1).classList.contains('sub-target'), 'Descanso na mão: a sublista não vira lugar de soltar');
  w.cancelPendingTask(); w.openSheet(); $('task-input').value = 'Outra'; chip.click();
  ok(!subEl(S1).classList.contains('sub-target'), 'outra sublista na mão: também não (sublista não entra em sublista)');
  w.cancelPendingTask();

  // ======================================================================================================
  console.log('\nC) O cartão aberto (nome, etiqueta, cor e checklist), voltar pra lista e apagar:');
  w.toggleExpandBlock(S1, { stopPropagation() {} });
  subEl(S1).querySelectorAll('.sub-card .sub-card-title')[1].click();
  const modal = $('sub-card-modal');
  ok(!modal.classList.contains('hidden') && $('sub-card-title').value === 'Tarefa 1' && $('sub-card-from').textContent === 'Sublista: Pendências rápidas', 'tocar no nome abre o cartão');
  ok($('sub-card-tags').querySelectorAll('button').length === 1 + JSON.parse(L('tb_tags_db')).length && $('sub-card-mbs').querySelectorAll('button[onclick^="toggleSubCardMb"]').length === 3, 'mostra as etiquetas e a checklist (3 itens)');
  w.toggleSubCardMb(0);
  $('sub-card-mb-new').value = 'Conferir a data'; w.addSubCardMb();
  w.fazPickSubCardColor('#3b82f6');
  const TAG2 = JSON.parse(L('tb_tags_db'))[1].id;
  w.selectSubCardTag(TAG2);
  $('sub-card-title').value = 'Tarefa 1 (revisada)';
  w.saveSubCard();
  let cc = get(S1).cards[1];
  ok(modal.classList.contains('hidden') && cc.title === 'Tarefa 1 (revisada)' && cc.tagId === TAG2 && cc.color === '#3b82f6' && cc.microblocks.length === 4 && cc.microblocks[0].done === true && cc.microblocks[3].title === 'Conferir a data' && lastToast() === 'Cartão salvo!', 'salvou nome, etiqueta, cor e checklist');
  ok(subEl(S1).querySelectorAll('.sub-card')[1].style.backgroundColor !== '', 'o cartão pintado aparece com a cor dentro da sublista');
  // escreveu um item e não deu Enter: entra ao salvar; nome vazio não salva
  w.openSublistCard(S1, cc.id, {});
  $('sub-card-mb-new').value = 'Ligar antes';
  $('sub-card-title').value = '   ';
  w.saveSubCard();
  ok(!modal.classList.contains('hidden') && lastToast() === 'Dê um nome pro cartão.' && get(S1).cards[1].title === 'Tarefa 1 (revisada)', 'nome vazio: não salva e pede o nome');
  $('sub-card-title').value = 'Tarefa 1 (revisada)';
  w.saveSubCard();
  ok(get(S1).cards[1].microblocks.length === 5 && get(S1).cards[1].microblocks[4].title === 'Ligar antes', 'o item escrito sem Enter entra ao salvar');
  // voltar pra lista: a lista de origem, com tudo
  w.openSublistCard(S1, cc.id, {});
  w.subCardToListFromModal();
  const back = JSON.parse(ev("JSON.stringify(backlogDb[backlogDb.length - 1])"));
  ok(back.title === 'Tarefa 1 (revisada)' && back.columnId === 'col_1700000008000' && back.duration === 15 && back.tagId === TAG2 && back.color === '#3b82f6' && back.microblocks.length === 5 && back.microblocks.every((m) => m.done === false) && /^bl_\d+_[a-z0-9]+$/.test(back.id), 'voltou pra lista de onde veio (GAMA), com tempo, etiqueta, cor e checklist');
  await sleep(20);
  ok(get(S1).cards.length === 1 && $('undo-bar-msg').textContent === 'Voltou pra lista GAMA' && !$('undo-bar').classList.contains('hidden') && modal.classList.contains('hidden'), 'saiu da sublista e avisou na barrinha do Desfazer: "' + $('undo-bar-msg').textContent + '"'); // V40.38.0: antes, aviso vermelho
  // apagar: 2 toques
  const c0 = get(S1).cards[0];
  w.openSublistCard(S1, c0.id, {});
  w.deleteSubCardFromModal();
  ok(get(S1).cards.length === 1 && /Toque de novo/.test($('sub-card-del').textContent) && !modal.classList.contains('hidden'), '1º toque em "Apagar cartão" só pede confirmação');
  w.deleteSubCardFromModal();
  ok(get(S1).cards.length === 0 && lastToast() === 'Cartão apagado.' && modal.classList.contains('hidden'), '2º toque apaga');
  w.openSublistCard(S1, 'cd_nao_existe', {});
  ok(modal.classList.contains('hidden'), 'cartão que não existe não abre nada');

  // ======================================================================================================
  console.log('\nD) Devolver os não feitos, duplicar, repetir, editar e apagar a sublista:');
  ['Pagar boleto', 'Responder o Anderson', 'Ligar pro cartório'].forEach((t) => { const i = $('sub-input-' + S1) || { value: '' }; i.value = t; w.addSublistCard(S1, i, {}); });
  s1 = get(S1);
  ok(s1.cards.length === 3, 'três cartões criados');
  w.toggleSublistCard(S1, s1.cards[0].id, {});
  const nBl = ev('backlogDb.length');
  w.toggleExpandBlock(S1, { stopPropagation() {} }); if (!get(S1).expanded) w.toggleExpandBlock(S1, { stopPropagation() {} });
  const retBtn = subEl(S1).querySelector('.sub-return');
  ok(!!retBtn && retBtn.textContent.trim() === 'Devolver os 2 não feitos pra Lista', 'botão "' + (retBtn && retBtn.textContent.trim()) + '"');
  retBtn.click();
  s1 = get(S1);
  ok(ev('backlogDb.length') === nBl + 2 && s1.cards.length === 1 && s1.cards[0].done && s1.completed === true && lastToast() === '2 cartões voltaram pra Lista', 'os 2 não feitos voltaram pra Lista (lista padrão); sobrou o feito e a sublista ficou concluída');
  ok(ev("backlogDb.slice(-2).every((i) => i.columnId === 'col_geral' && i.duration === 30)"), 'cartão criado na sublista volta pra lista padrão com 30 min');
  // duplicar (cópia única): cartões copiados e desmarcados, ids novos
  ['Cartão X', 'Cartão Y'].forEach((t) => { const i = $('sub-input-' + S1) || { value: '' }; i.value = t; w.addSublistCard(S1, i, {}); });
  w.duplicateTask(S1, { stopPropagation() {} });
  w.cloneManual();
  ok(Array.isArray(ev('pendingIntent.cards')) && ev('pendingIntent.cards.length') === 3 && ev('pendingIntent.cards.every((c) => !c.done)'), 'cópia única: a sublista vai pra mão com os 3 cartões desmarcados');
  emptyEl().click();
  const S2 = ev("(db.find((b) => b.date === '" + DAY + "' && Array.isArray(b.cards) && b.id !== '" + S1 + "') || {}).id");
  const s2 = get(S2); s1 = get(S1);
  ok(s2 && s2.startMin === 480 && s2.cards.length === 3 && s2.cards.every((c) => !c.done) && s2.cards.every((c, i) => c.id !== s1.cards[i].id && c.title === s1.cards[i].title) && !s2.completed, 'colou às 08:00: mesmos cartões, desmarcados, com ids novos');
  ok(s1.cards[0].done === true, 'a original não mudou');
  // repetir 2 dias
  w.duplicateTask(S1, { stopPropagation() {} });
  w.promptCloneQtd('daily'); $('clone-qtd-input').value = '2'; w.confirmCloneQtd();
  const reps = JSON.parse(ev("JSON.stringify(db.filter((b) => (b.date === '2026-11-19' || b.date === '2026-11-20') && Array.isArray(b.cards)))"));
  ok(reps.length === 2 && reps.every((r) => r.cards.length === 3 && r.cards.every((c) => !c.done) && !r.completed) && new Set(reps.flatMap((r) => r.cards.map((c) => c.id)).concat(s1.cards.map((c) => c.id))).size === 9, 'repetir 2 dias: cada cópia com os cartões desmarcados e ids próprios');
  // editar: título do modal
  w.openEditModal(S1, { stopPropagation() {} });
  ok($('edit-task-heading').textContent === 'Editar sublista', 'Editar mostra "Editar sublista"');
  w.cancelEdit();
  w.openEditModal(ev("db.find((b) => !Array.isArray(b.cards)).id"), { stopPropagation() {} });
  ok($('edit-task-heading').textContent === 'Editar Tarefa', 'bloco normal continua "Editar Tarefa"');
  w.cancelEdit();
  // apagar com cartões não feitos: devolve e apaga
  w.openDeleteModal(S2, { stopPropagation() {} });
  ok($('delete-task-heading').textContent === 'O que fazer com esta sublista?' && !$('delete-task-move').classList.contains('hidden') && $('delete-task-move-label').textContent === 'Devolver os 3 não feitos e apagar' && $('delete-task-kill-label').textContent === 'Apagar a sublista e os cartões', 'apagar pergunta: devolver os 3 não feitos e apagar, ou apagar tudo');
  const nBl2 = ev('backlogDb.length');
  w.moveToBacklog();
  ok(!get(S2) && ev('backlogDb.length') === nBl2 + 3 && lastToast() === 'Sublista apagada; 3 cartões voltaram pra Lista', 'devolveu os 3 e apagou: "' + lastToast() + '"');
  w.openDeleteModal(ev("db.find((b) => !Array.isArray(b.cards)).id"), { stopPropagation() {} });
  ok($('delete-task-heading').textContent === 'O que fazer com esta tarefa?' && $('delete-task-move-label').textContent === 'Mover pra Lista' && $('delete-task-kill-label').textContent === 'Excluir Definitivo' && !$('delete-task-move').classList.contains('hidden'), 'bloco normal: o modal de sempre');
  w.cancelDelete();
  // sublista só com feitos: nada pra devolver
  const R1 = reps[0].id;
  ev(`(() => { const b = db.find((x) => x.id === '${R1}'); b.cards.forEach((c) => { c.done = true; }); subSyncDone(b); saveDb(); })()`);
  w.openDeleteModal(R1, { stopPropagation() {} });
  ok($('delete-task-move').classList.contains('hidden'), 'sublista com tudo feito: o botão de devolver some');
  w.confirmKillTask();
  ok(!get(R1) && lastToast() === 'Sublista apagada.', 'apagou: "' + lastToast() + '"');

  // ======================================================================================================
  console.log('\nE) Tamanho na agenda, atraso, busca, backup e Assistente:');
  // cartões que não cabem: "+N cartões"
  ['Um', 'Dois', 'Três', 'Quatro', 'Cinco', 'Seis', 'Sete'].forEach((t) => { const i = $('sub-input-' + S1) || { value: '' }; i.value = t; w.addSublistCard(S1, i, {}); });
  w.collapseAllBlocks ? ev('collapseAllBlocks()') : 0;
  el = subEl(S1);
  const total = get(S1).cards.length, shown = el.querySelectorAll('.sub-card').length, more = el.querySelector('.sub-more');
  ok(total === 10 && shown === 3 && more && more.textContent === '+7 cartões', `1h (178 px): ${shown} cartões e "${more && more.textContent}" (que abre o resto)`);
  w.toggleExpandBlock(S1, { stopPropagation() {} });
  ok(subEl(S1).querySelectorAll('.sub-card').length === 10 && !subEl(S1).querySelector('.sub-more'), 'aberta, mostra os 10');
  ev('collapseAllBlocks()');
  // 15 min: só o cabeçalho; 10 min: tocar abre
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.duration = 15; saveDb(); renderTimeline(); })()`);
  el = subEl(S1);
  ok(el.querySelectorAll('.sub-card').length === 0 && el.querySelector('.time-label').classList.contains('hidden') && el.querySelector('.sub-count').textContent === '1/10' && el.querySelectorAll('.block-btn').length === 2, '15 min: só o cabeçalho (nome, 1/10 e os botões)');
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.duration = 10; saveDb(); renderTimeline(); })()`);
  subEl(S1).click();
  ok(get(S1).expanded === true, '10 min: tocar na sublista abre');
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.duration = 60; b.expanded = false; saveDb(); renderTimeline(); })()`);
  // dia que já passou: ícone de atraso, os não feitos continuam lá
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.type = 'past'; saveDb(); renderTimeline(); })()`);
  ok(!!subEl(S1).querySelector('[title="Tempo Esgotado / Realocado"]') && get(S1).cards.length === 10, 'horário passou: aparece o "i" de atrasado e os cartões continuam lá');
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.type = 'focus'; saveDb(); renderTimeline(); })()`);
  // cor escolhida e escura: texto branco
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.color = '#1e293b'; saveDb(); renderTimeline(); })()`);
  el = subEl(S1);
  ok(el.classList.contains('sub-custom') && el.classList.contains('sub-dark') && !el.classList.contains('sub-amber') && el.style.backgroundColor === 'rgb(30, 41, 59)', 'com cor escura escolhida: pinta e o texto fica claro');
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); delete b.color; saveDb(); renderTimeline(); })()`);
  // nome com HTML vira texto
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.cards.push({ id: 'cd_html', title: '<img src=x onerror="window.__xss=1">Oi', done: false, microblocks: [{ title: '<b>x</b>', done: false }] }); saveDb(); b.expanded = true; renderTimeline(); })()`);
  ok(!w.__xss && !subEl(S1).querySelector('img') && subEl(S1).textContent.includes('<img src=x'), 'nome de cartão com HTML aparece como texto');
  w.openSublistCard(S1, 'cd_html', {});
  ok(!$('sub-card-mbs').querySelector('b') && $('sub-card-mbs').textContent.includes('<b>x</b>') && $('sub-card-title').value.startsWith('<img'), 'no cartão aberto também (checklist com HTML vira texto)');
  w.closeSubCard();
  ev(`(() => { const b = db.find((x) => x.id === '${S1}'); b.cards = b.cards.filter((c) => c.id !== 'cd_html'); b.expanded = false; saveDb(); renderTimeline(); })()`);
  // busca acha pelo nome do cartão
  ok(ev(`cardMatchesSearch(db.find((b) => b.id === '${S1}'), normalizeText('cinco'))`) === true && ev(`cardMatchesSearch(db.find((b) => b.id === '${S1}'), normalizeText('xyzw'))`) === false, 'a busca acha a sublista pelo nome de um cartão');
  // backup: entra e é validado
  ok(JSON.parse(ev('collectFazData()').tb_master_db).find((b) => b.id === S1).cards.length === 10, 'a sublista entra no backup com os cartões');
  ok(ev(`fazBackupLooksSafe({ tb_master_db: JSON.stringify([{ id: 'f_1', date: '2026-11-18', startMin: 60, duration: 30, cards: [{ id: "x');alert(1);('", title: 'a' }] }]) })`) === false &&
     ev(`fazBackupLooksSafe({ tb_master_db: JSON.stringify([{ id: 'f_1', date: '2026-11-18', startMin: 60, duration: 30, cards: [{ id: 'cd_1', title: 'a', tagId: "t'1" }] }]) })`) === false &&
     ev(`fazBackupLooksSafe({ tb_master_db: JSON.stringify([{ id: 'f_1', date: '2026-11-18', startMin: 60, duration: 30, cards: [{ id: 'cd_1', title: 'a', color: 'red' }] }]) })`) === false &&
     ev(`fazBackupLooksSafe({ tb_master_db: JSON.stringify([{ id: 'f_1', date: '2026-11-18', startMin: 60, duration: 30, cards: [{ id: 'cd_1', title: 'a', tagId: 'tag_1', columnId: 'col_geral', color: '#3b82f6', duration: 15, microblocks: [{ title: 'x', done: true }] }] }]) })`) === true,
     'backup com id, tag ou cor de cartão fora do formato é recusado; o certo passa');
  // Assistente
  const snap = ev('JSON.stringify(assistantSnap().blocks.find((b) => b.id === "' + S1 + '"))');
  ok(JSON.parse(snap).cards.done === 1 && JSON.parse(snap).cards.total === 10, 'o retrato do Assistente leva quantos cartões estão feitos');
  const bi = A.reply('amanha', { now: new Date(2026, 10, 17, 9, 0), hours: [7, 24], tasks: [], routines: [], notes: [], expenses: [],
    blocks: [{ id: 'f_s', title: 'Pendências', date: '2026-11-18', start: 840, dur: 60, done: false, tag: null, cards: { done: 2, total: 4, open: 2 } }, { id: 'f_n', title: 'Reunião', date: '2026-11-18', start: 900, dur: 30, done: false, tag: null, cards: null }] });
  ok(bi.items[0].sub === 'amanhã · 1h · 2 de 4 cartões feitos' && bi.items[1].sub === 'amanhã · 30m', 'o Assistente mostra "2 de 4 cartões feitos" na sublista (' + bi.items.map((i) => i.sub).join(' | ') + ')');

  // ======================================================================================================
  console.log('\nG) Ocultar os vagos (a faixa no lugar do Tempo Livre grande):');
  ev("activeDateObj = new Date(2026, 10, 23); db.push({ id: 'f_va', date: '2026-11-23', startMin: 480, duration: 60, title: 'A', type: 'focus', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }, { id: 'f_vb', date: '2026-11-23', startMin: 550, duration: 30, title: 'B', type: 'focus', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }, { id: 'f_vc', date: '2026-11-23', startMin: 780, duration: 60, title: 'C', type: 'focus', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline();");
  const top = (id) => subEl(id).style.top, gaps = () => [...d.querySelectorAll('#blocks-container .tl-gap')];
  const labels = () => [...d.querySelectorAll('#y-axis > div')].map((x) => x.textContent);
  ok($('tl-compact-btn').getAttribute('aria-pressed') === 'false' && gaps().length === 0 && top('f_va') === '181px' && labels().length === 18, 'desligado: tudo como antes (A às 08:00 em 181 px, 18 horas na régua)');
  $('tl-compact-btn').click();
  ok(L('tb__vagos_compactos') === '1' && $('tl-compact-btn').classList.contains('tl-compact-on') && $('tl-compact-btn').getAttribute('aria-pressed') === 'true', 'o botão liga e fica guardado neste aparelho (tb__vagos_compactos)');
  ok(gaps().map((g) => g.textContent.trim()).join(' | ') === '07:00–08:00 · livre 1h | 09:40–13:00 · livre 3h 20m | 14:00–24:00 · livre 10h', 'vagos de 30 min ou mais viram faixas: ' + gaps().map((g) => g.textContent.trim()).join(' | '));
  ok(gaps().every((g) => g.style.height === '34px') && [...d.querySelectorAll('#blocks-container .bg-hatched')].length === 4, 'cada faixa tem 36 px (34 + a folga); o vago de 10 min continua normal');
  ok(top('f_va') === '37px' && top('f_vb') === '247px' && top('f_vc') === '373px' && subEl('f_vc').style.height === '178px', 'blocos no lugar certo da régua encolhida (08:00 em 37 px, 09:10 em 247, 13:00 em 373) e com a altura de sempre');
  ok($('timeline-container').style.height === '588px' && labels().join(',') === '07:00,08:00,09:00,13:00,14:00,24:00', 'régua com 588 px e só as horas fora dos vagos: ' + labels().join(','));
  // dois toques na faixa (V40.25.1; era um): o + mira o vago e o bloco novo entra direto lá
  const two = (el) => { el.click(); el.click(); };
  two(gaps()[1]);
  ok(!$('bottom-sheet').classList.contains('translate-y-full') && /Inserir às 09:40/.test($('commit-intent-btn').textContent), 'dois toques na faixa abrem o + com "Inserir às 09:40"');
  $('task-input').value = 'Na faixa'; d.querySelector('.sheet-dur-btn[data-time="30"]').click(); w.commitIntent();
  ok(ev("JSON.stringify(db.filter((b) => b.date === '2026-11-23' && b.title === 'Na faixa').map((b) => [b.startMin, b.duration]))") === '[[580,30]]' && ev('pendingIntent') === null && /Inserir na Agenda/.test($('commit-intent-btn').textContent), 'o bloco entrou direto às 09:40 (sem passar pela mão) e o botão volta ao normal');
  two(gaps()[0]); w.closeAllSheets();
  ok(/Inserir na Agenda/.test($('commit-intent-btn').textContent) && ev('sheetSlot') === null, 'fechar o + esquece o vago');
  two(gaps()[0]); ev("sheet.classList.add('translate-y-full')"); w.openSheet();
  ok(/Inserir na Agenda/.test($('commit-intent-btn').textContent) && ev('sheetSlot') === null, 'abrir o + pelo botão depois (sem passar pelo fechar) também esquece o vago');
  w.closeAllSheets();
  two(gaps()[0]); $('task-input').value = 'Grande demais'; d.querySelector('.sheet-dur-btn[data-time="60"]').click(); w.changeFloatDuration && 0;
  ev('selectedDur = 120'); w.commitIntent();
  ok(ev('pendingIntent && pendingIntent.title') === 'Grande demais' && lastToast() === 'Não cabe nesse vago: toque onde quer colocar 👇', 'não cabe no vago: fica na mão e avisa');
  // V40.44.0: a faixa pequena (07:00–08:00, menor que as 2h da mão) deixou de ser "muito curto": encaixa descendo os de baixo
  ok(!!gaps()[0].querySelector('.tl-pchip.push[data-per-start="420"]') && /Soltar aqui · 14:00–24:00/.test(gaps()[gaps().length - 1].textContent), 'com tarefa na mão: a faixa pequena encaixa descendo os de baixo ("↓"); a grande, "Soltar aqui"');
  gaps()[gaps().length - 1].click();
  ok(ev("JSON.stringify(db.filter((b) => b.date === '2026-11-23' && b.title === 'Grande demais').map((b) => [b.startMin, b.duration]))") === '[[840,120]]' && ev('pendingIntent') === null, 'soltou na faixa: 14:00 às 16:00');
  // arrastar e esticar pela régua encolhida
  ev("db = db.filter((b) => !(b.date === '2026-11-23' && (b.title === 'Na faixa' || b.title === 'Grande demais'))); saveDb(); renderTimeline();");
  const drag = (id, sel, dy) => {
    const h = subEl(id).querySelector(sel);
    h.dispatchEvent(new w.MouseEvent('mousedown', { clientY: 500, bubbles: true, cancelable: true }));
    d.dispatchEvent(new w.MouseEvent('mousemove', { clientY: 500 + dy, bubbles: true, cancelable: true }));
    d.dispatchEvent(new w.MouseEvent('mouseup', { clientY: 500 + dy, bubbles: true }));
  };
  drag('f_vc', '.drag-handle', -36);
  ok(get('f_vc').startMin === 580 && top('f_vc') === '337px', 'arrastar C 36 px pra cima atravessa a faixa inteira: vai pras 09:40');
  drag('f_vc', '.drag-handle', 180 + 18);
  ok(get('f_vc').startMin === 1040, 'C (agora 09:40–10:40, com a faixa 10:40–24:00 logo abaixo) arrastado até o meio da faixa: 17:20 (' + get('f_vc').startMin + ')');
  drag('f_va', '.resize-handle', 30);
  ok(get('f_va').duration === 70, 'esticar A 30 px: chega no vago de 10 min e para no B (1h10)');
  // hoje: a linha do agora pela régua encolhida
  ev("activeDateObj = new Date(); runRealTimeEngine(); renderTimeline();");
  ok($('now-line').style.display === 'flex' && ev('!!tlSegs') && Math.abs(parseFloat($('now-line').style.top) - ev('tlY(currentRealMins)')) < 0.5 && Math.abs(ev('tlMin(tlY(currentRealMins))') - ev('currentRealMins')) < 0.01, 'a linha do agora fica no lugar certo da régua encolhida (' + $('now-line').style.top + ')');
  // nos filtros é lista: sem faixas
  w.toggleFilterCompleted();
  ok(ev('tlSegs') === null && gaps().length === 0, 'no filtro de concluídos (lista) não tem faixa');
  w.toggleFilterCompleted();
  $('tl-compact-btn').click();
  ev("activeDateObj = new Date(2026, 10, 23); renderTimeline();");
  ok(L('tb__vagos_compactos') === '0' && gaps().length === 0 && top('f_va') === '181px' && ev('tlSegs') === null, 'desligou: volta tudo ao normal');
  ok(!Object.keys(JSON.parse(JSON.stringify(ev('collectFazData()')))).includes('tb__vagos_compactos'), 'a preferência não entra no backup');
  // V40.34.0: abriu e fechou o + antes dos 350 ms: o foco atrasado não pode cair no campo escondido (segurava o sync)
  w.openSheet(); w.closeAllSheets(); await sleep(420);
  ok(d.activeElement !== $('task-input'), 'abrir e fechar o + rápido não deixa o foco no campo escondido');

  // ======================================================================================================
  console.log('\nF) Na nuvem (celular <-> PC):');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  w.closeAllSheets();
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(60); };
  let row = server.get('blocos', UID, S1);
  ok(row && Array.isArray(row.cards) && row.cards.length === 10 && row.cards[0].done === true, 'a sublista subiu com os 10 cartões');
  ok(server.alive('blocos', UID).filter((r) => r.cards === null).length === server.alive('blocos', UID).length - ev('db.filter((b) => Array.isArray(b.cards)).length'), 'os blocos normais sobem com cards = null');
  // o PC marca um cartão e cria outro
  const pcCards = row.cards.map((c, i) => i === 1 ? Object.assign({}, c, { done: true }) : c).concat([{ id: 'cd_pc1', title: 'Criado no PC', done: false, microblocks: [] }]);
  ev("activeDateObj = new Date(2026, 10, 18); renderTimeline();");
  server.patch('blocos', UID, S1, { cards: pcCards });
  await syncDone();
  ok(get(S1).cards.length === 11 && get(S1).cards[1].done === true && get(S1).cards[10].title === 'Criado no PC' && /Criado no PC/.test(subEl(S1) ? (w.toggleExpandBlock(S1, { stopPropagation() {} }), subEl(S1).textContent) : ''), 'o que o PC fez nos cartões chegou no celular e aparece na agenda');
  ev('collapseAllBlocks()');
  // o celular marca: sobe sozinho
  $('task-input').focus(); // V40.34.0: campo de uma tela FECHADA com o foco não segura a sincronização
  const focoPreso = d.activeElement === $('task-input') && $('bottom-sheet').classList.contains('translate-y-full');
  w.toggleSublistCard(S1, 'cd_pc1', {});
  ok(await waitFor(() => (server.get('blocos', UID, S1).cards.find((c) => c.id === 'cd_pc1') || {}).done === true), 'marcar no celular sobe sozinho pra nuvem');
  ok(focoPreso, '...mesmo com o foco preso no campo do + fechado');
  $('task-input').blur();
  // o PC transforma em bloco normal? (cards null) → o celular acompanha
  // cartão aberto segura o redesenho
  w.openSublistCard(S1, 'cd_pc1', {});
  server.patch('blocos', UID, S1, { title: 'Pendências (PC)' });
  w.fazSyncNow(); await sleep(900);
  ok(get(S1).title === 'Pendências rápidas' && !$('sub-card-modal').classList.contains('hidden'), 'com o cartão aberto, o sync espera');
  w.closeSubCard();
  ok(await waitFor(() => get(S1).title === 'Pendências (PC)', 15000), 'fechou o cartão: a mudança do PC entra');
  await syncDone(); const antes = server.log.length; await syncDone();
  ok(server.log.slice(antes).filter((l) => l.op !== 'select' && l.op !== 'getUser').length === 0, 'sincronizar de novo não envia nada'); // V40.32.0: getUser só lê (a cor e o horário da conta)
  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}
  end();
})().catch((e) => { console.error('ERRO', e); fail++; end(); });

function end() {
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}
