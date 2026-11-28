// V40.34.0 — Metas, etapa 2: bloco, tarefa, rotina e cartão da sublista ligados a uma meta (concluir conta sozinho) e o
// gráfico em cada meta.
// Parte A: as regras (metas.js: credit, autoDays, withAuto, targetMarks, history, records), com data fixa.
// Parte B: o celular de verdade (index.html + app.js + sync.js): ligar pelo +, pela edição do bloco, pela Lista, pela
//          rotina e pelo cartão da sublista; concluir conta (e avisa a estrela); selos; gráfico; mudar o alvo sem mudar
//          estrela antiga; recomeçar; meta apagada; desfazer; nuvem nos 2 sentidos; backup.
// Parte C: o PC de verdade (kanban.html): seletor "Meta" no cartão, na rotina e no cartão da sublista; a meta indo junto
//          (agendar, na mão, voltar pra lista, rotina, sublista, duplicar); a aba Metas contando os blocos; aviso de
//          estrela; gráfico; mudar o alvo; recomeçar; selos; meta apagada.
// Uso: TZ='America/Sao_Paulo' node test_metas_etapa2.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const M = require(path.resolve(REPO, 'metas.js'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const UID = '11111111-2222-3333-4444-555555555555';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; };

(async () => {
  // ======================================================================================================
  console.log('A) As regras (metas.js):');
  const NOW = new Date(2026, 10, 16, 10, 20); // segunda 16/11/2026
  const ler = { id: 'meta_5', listId: 'gl_pessoal', title: 'Ler', emoji: '📚', period: 'dia', unit: 'vezes', target: 2, step: 1 };
  const meditar = { id: 'meta_4', listId: 'gl_pessoal', title: 'Meditar', emoji: '🧘', period: 'dia', unit: 'minutos', target: 30, step: 15 };
  const guardar = { id: 'meta_3', listId: 'gl_financeiro', title: 'Guardar', emoji: '💰', period: 'mes', unit: 'reais', target: 500, step: 50 };
  const correr = { id: 'meta_2', listId: 'gl_pessoal', title: 'Correr', emoji: '🏃', period: 'semana', unit: 'vezes', target: 3, step: 1 };
  ok(M.credit(meditar, 45) === 45 && M.credit(meditar, 0) === 15 && M.credit(ler, 90) === 1 && M.credit(guardar, 30) === 50 && M.credit(meditar, 5e12) === 1e9, 'quanto um bloco vale: em minutos, o tempo dele (sem tempo, o passo); em vezes e reais, um "+"');
  const blocks = [
    { date: '2026-11-16', goalId: 'meta_5', completed: true, duration: 30 },
    { date: '2026-11-16', goalId: 'meta_5', completed: false, duration: 30 },
    { date: '2026-11-16', goalId: 'meta_4', completed: true, duration: 20 },
    { date: '2026-11-15', goalId: 'meta_4', completed: true, duration: 0 },
    { date: '2026-11-16', cards: [{ id: 'c1', done: true, goalId: 'meta_5' }, { id: 'c2', done: false, goalId: 'meta_5' }, { id: 'c3', done: true, goalId: 'meta_x' }] },
    { date: '2026-11-16', goalId: 'meta_apagada', completed: true, duration: 30 },
    { date: 'lixo', goalId: 'meta_5', completed: true },
    null,
  ];
  const auto = M.autoDays([ler, meditar], blocks);
  const autoTxt = auto.map((d) => d.goalId + '@' + d.date + '=' + d.amount + (d.auto ? '' : '!') + (d.target == null ? '' : 'T')).sort().join();
  ok(autoTxt === 'meta_4@2026-11-15=15,meta_4@2026-11-16=20,meta_5@2026-11-16=2', 'autoDays: concluído conta (bloco + cartão feito somam), aberto não, meta que não existe não, data estranha não: ' + autoTxt);
  let st = M.status(ler, M.withAuto([], [ler, meditar], blocks), NOW);
  ok(st.complete && st.total === 2 && st.stars === 1 && st.text === '2 de 2 hoje', 'withAuto: os blocos ligados cumprem "Ler 2 vezes por dia" (⭐ 1)');
  st = M.status(meditar, M.withAuto([], [ler, meditar], blocks), NOW);
  ok(st.total === 20 && !st.complete && st.text === '20m de 30m hoje', 'minutos: o bloco de 20 min conta 20 ("20m de 30m hoje")');
  const meditarCF = Object.assign({}, meditar, { countFrom: '2026-11-16' });
  ok(M.autoDays([meditarCF], blocks).map((d) => d.date).join() === '2026-11-16', 'countFrom: bloco de antes do recomeço não conta');
  const real = [{ id: 'meta_5_20261116', goalId: 'meta_5', date: '2026-11-16', amount: 1, target: 2 }];
  st = M.status(ler, M.withAuto(real, [ler], blocks), NOW);
  ok(st.total === 3 && st.complete, 'o "+" e os blocos somam no mesmo dia (1 + 2 = 3)');
  // mudar o alvo: o dia 14 só tinha blocos (2 de 2) — a marca guarda o alvo antigo
  const past = [{ date: '2026-11-14', goalId: 'meta_5', completed: true, duration: 30 }, { date: '2026-11-14', goalId: 'meta_5', completed: true, duration: 30 }, { date: '2026-11-16', goalId: 'meta_5', completed: true, duration: 30 }];
  const autoP = M.autoDays([ler], past), realP = [{ id: 'meta_5_20261113', goalId: 'meta_5', date: '2026-11-13', amount: 2, target: 2 }];
  const marks = M.targetMarks(ler, realP, autoP, NOW);
  ok(marks.length === 1 && marks[0].id === 'meta_5_20261114' && marks[0].date === '2026-11-14' && marks[0].amount === 0 && marks[0].target === 2, 'targetMarks: o período passado que só tinha blocos ganha a marca com o alvo antigo (o de hoje e o que já tinha alvo, não)');
  const ler5 = Object.assign({}, ler, { target: 5 });
  ok(M.status(ler5, M.withAuto(realP, [ler5], past), NOW).stars === 1 && M.status(ler5, M.withAuto(realP.concat(marks), [ler5], past), NOW).stars === 2, 'sem a marca, subir o alvo pra 5 apagaria a estrela do dia 14 (só blocos); com ela, continuam as 2');
  ok(M.status(ler5, M.withAuto(realP.concat(marks), [ler5], past), NOW).text === '1 de 5 hoje', 'e hoje já vale o alvo novo ("1 de 5 hoje")');
  const hist = M.history(ler, M.withAuto(realP.concat(marks), [ler], past), NOW);
  ok(hist.length === 7 && hist.map((h) => h.label + h.sub).join() === 'ter10,qua11,qui12,sex13,sáb14,dom15,seg16' && hist[6].current && !hist[5].current, 'history (diária): 7 barras, de ter 10 a seg 16 (a de hoje marcada)');
  ok(hist[3].total === 2 && hist[3].met && hist[4].total === 2 && hist[4].met && hist[5].total === 0 && !hist[5].met && hist[6].total === 1 && !hist[6].met && hist[6].text === '1 de 2', 'cada barra: o feito, se cumpriu e o texto ("1 de 2")');
  const histT = M.history(ler5, M.withAuto(realP.concat(marks), [ler5], past), NOW);
  ok(histT[4].target === 2 && histT[6].target === 5, 'a linha da meta de cada barra: a da época (2 no dia 14) e a de agora (5 hoje)');
  const hw = M.history(correr, [], NOW), hm = M.history(guardar, [], NOW), hm2 = M.history(guardar, [], new Date(2027, 1, 10));
  ok(hw.length === 8 && hw.map((h) => h.label).join() === '28/09,05/10,12/10,19/10,26/10,02/11,09/11,16/11' && hm.length === 6 && hm.map((h) => h.label).join() === 'jun,jul,ago,set,out,nov' && hm2.map((h) => h.label + h.sub).join() === 'set,out,nov,dez,jan2027,fev', 'semanal: 8 semanas (segunda de cada uma); mensal: 6 meses (janeiro mostra o ano)');
  const rec = M.records(ler, M.withAuto(realP.concat(marks), [ler], past), NOW);
  ok(rec.best === 2 && rec.bestText === '2 dias seguidos' && rec.total === 5 && rec.totalText === '5 vezes', 'records: melhor sequência (2 dias seguidos) e o total feito (5 vezes)');
  ok(M.records(ler, [], NOW).best === 0 && M.records(ler, [], NOW).bestText === '' && M.history(ler, [], NOW).every((h) => h.total === 0 && !h.met), 'meta sem nada: sem recorde, barras vazias');

  // ======================================================================================================
  console.log('\nB) No celular:');
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  server.addUser('j@t.com', 'senha123', UID);
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const lastToast = () => toasts()[toasts().length - 1] || '';
  const TODAY = '2026-11-15';
  const stop = { stopPropagation() {} };
  const blk = (id) => J(`db.find((b) => b.id === ${JSON.stringify(id)}) || null`);
  const blockEl = (id) => d.querySelector(`#blocks-container .block-item[data-block-id="${id}"]`);
  const emptyEl = () => [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.classList.contains('bg-hatched'));
  const chips = (box) => [...$(box).querySelectorAll('[data-goal-pick]')].map((b) => b.dataset.goalPick + (b.className.includes('bg-app-focus') ? '*' : ''));
  // V40.51.1: o + na Ficha: a meta se escolhe na folha de baixo (as mesmas opções, "Nenhuma" = sem meta)
  const plusGoals = () => { w.plusPickGoal(); const r = [...d.querySelectorAll('#fx-pick-list [data-fx-k]')].map((b) => b.getAttribute('data-fx-k') + (b.getAttribute('aria-checked') === 'true' ? '*' : '')); w.fxPickClose(); return r; };
  const status = (id) => J(`FazMetas.status(goalsDb.find((g) => g.id === ${JSON.stringify(id)}), goalAllDays(), new Date())`);
  ev('renderTimeline()');

  const b0 = J(`db.find((b) => b.date === '${TODAY}' && !Array.isArray(b.cards) && !b.completed && b.theme !== 'rest')`);
  w.openSheet();
  ok($('goal-pick-new-wrap').classList.contains('hidden'), 'sem nenhuma meta: o + não mostra a linha "Meta"');
  w.closeAllSheets();
  w.openEditModal(b0.id, stop);
  ok($('edit-goal-wrap').classList.contains('hidden'), '... nem a edição do bloco');
  w.cancelEdit();
  w.openBacklogForm();
  ok($('bl-form-goal-wrap').classList.contains('hidden'), '... nem a tarefa da Lista');
  w.closeBacklogForm(true);

  // três metas: Ler (30 min por dia), Correr (3 vezes por semana) e Beber água (8 por dia)
  w.openListSheet(); w.switchListTab('goals'); await sleep(30);
  const mkGoal = async (tpl) => { w.openGoalForm(); w.applyGoalTemplate(tpl); w.saveGoalForm(); await sleep(8); return ev('goalsDb[goalsDb.length - 1].id'); };
  const G_LER = await mkGoal(4), G_CORRER = await mkGoal(1), G_AGUA = await mkGoal(0);
  ok(new Set([G_LER, G_CORRER, G_AGUA]).size === 3 && ev('goalsDb.length') === 3, 'criadas 3 metas: 📚 Ler (30 min/dia), 🏃 Correr (3x/semana), 💧 Beber água (8x/dia)');
  w.closeAllSheets();

  console.log('\nB1) Pelo +:');
  w.openSheet();
  ok(!$('goal-pick-new-wrap').classList.contains('hidden') && plusGoals().join() === ['*', G_LER, G_CORRER, G_AGUA].join(), 'o + mostra "Nenhuma" (marcada) e as 3 metas (na folha da linha Meta)');
  w.selectNewGoal(G_LER);
  ok(plusGoals().join() === ['', G_LER + '*', G_CORRER, G_AGUA].join() && $('goal-pick-new').textContent.includes('📚'), 'tocar em "📚 Ler" marca ela (a linha mostra o 📚)');
  $('task-input').value = 'Leitura do livro';
  d.querySelector('.sheet-dur-btn[data-time="30"]').click();
  w.commitIntent();
  ok(J('pendingIntent').goalId === G_LER, 'a meta vai pra mão junto com o bloco');
  emptyEl().click(); await sleep(20);
  const B1 = J(`db.find((b) => b.title === 'Leitura do livro')`);
  ok(B1 && B1.goalId === G_LER && B1.duration === 30 && !B1.completed, 'soltou: o bloco nasce ligado à meta');
  ok(blockEl(B1.id).querySelector('.block-title .goal-badge') && blockEl(B1.id).querySelector('.block-title .goal-badge').textContent === '📚', 'o bloco mostra o 📚 antes do nome');
  w.openSheet();
  ok(plusGoals()[0] === '*', 'abrir o + de novo começa em "Nenhuma"');
  w.closeAllSheets();

  console.log('\nB2) Concluir conta:');
  let n0 = toasts().length;
  ok(status(G_LER).total === 0, 'antes: Ler 0 de 30m');
  w.toggleBlockCompletion(B1.id, stop); await sleep(20);
  let s2 = status(G_LER);
  ok(s2.total === 30 && s2.complete && s2.stars === 1, 'concluir o bloco de 30 min cumpre "Ler 30m por dia" (⭐ 1)');
  ok(toasts().slice(n0).includes('⭐ Meta cumprida! +10 pontos'), 'e avisa como o "+": "⭐ Meta cumprida! +10 pontos"');
  ok(J(`goalDaysDb.filter((x) => x.goalId === ${JSON.stringify(G_LER)})`).length === 0, 'nada é gravado nos dias da meta (a conta vem do bloco)');
  w.switchListTab && (w.openListSheet(), w.switchListTab('goals')); await sleep(20);
  ok(d.querySelector(`#goals-container [data-goal="${G_LER}"]`).textContent.includes('30m de 30m hoje'), 'a aba Metas mostra "30m de 30m hoje"');
  w.closeAllSheets();
  n0 = toasts().length;
  w.toggleBlockCompletion(B1.id, stop); await sleep(20);
  ok(status(G_LER).total === 0 && !toasts().slice(n0).some((t) => /⭐/.test(t)), 'desmarcar tira da conta (e não avisa nada)');
  w.toggleBlockCompletion(B1.id, stop); await sleep(20);
  w.fazUndo(); await sleep(30);
  ok(status(G_LER).total === 0 && !blk(B1.id).completed, 'Desfazer o concluir tira da meta também');
  w.fazRedo(); await sleep(30);
  ok(status(G_LER).total === 30, 'Refazer volta');

  console.log('\nB3) Pela edição do bloco:');
  w.openEditModal(b0.id, stop);
  ok(!$('edit-goal-wrap').classList.contains('hidden') && chips('edit-goal-pick')[0] === '*', 'a edição do bloco mostra a linha "Meta" (em "Sem meta")');
  w.selectEditGoal(G_CORRER);
  w.saveEditTask(); await sleep(20);
  ok(blk(b0.id).goalId === G_CORRER && blockEl(b0.id).querySelector('.goal-badge').textContent === '🏃', 'salvou: o bloco fica ligado a 🏃 Correr (com o selo)');
  w.toggleBlockCompletion(b0.id, stop); await sleep(20);
  ok(status(G_CORRER).total === 1 && status(G_CORRER).text === '1 de 3 nesta semana', 'concluir conta 1 corrida na semana ("1 de 3 nesta semana")');
  w.openEditModal(b0.id, stop); w.selectEditGoal(''); w.saveEditTask(); await sleep(20);
  ok(!('goalId' in blk(b0.id)) && !blockEl(b0.id).querySelector('.goal-badge') && status(G_CORRER).total === 0, '"Sem meta": desliga (sai o selo e a corrida da conta)');
  w.openEditModal(b0.id, stop); w.selectEditGoal(G_CORRER); w.saveEditTask(); await sleep(20);

  console.log('\nB4) Pela Lista (tarefa) e pela rotina:');
  const T1 = J(`backlogDb.find((x) => (x.columnId || 'col_geral') === 'col_geral')`);
  w.openBacklogForm(T1.id);
  ok(!$('bl-form-goal-wrap').classList.contains('hidden') && $('bl-form-goal-val').textContent === 'Nenhuma', 'a tarefa mostra a linha "Meta" (em "Nenhuma")');
  // V40.51.0 (Ficha): a linha abre a folha de baixo; "Nenhuma" marcada e as 3 metas
  w.blPickGoal();
  const fxOpts = () => [...$('fx-pick-list').querySelectorAll('[data-fx-k]')];
  ok(fxOpts().map((b) => b.getAttribute('data-fx-k') + (b.getAttribute('aria-checked') === 'true' ? '*' : '')).join() === ['*', G_LER, G_CORRER, G_AGUA].join() && fxOpts()[3].textContent.includes('💧'), 'a folha mostra "Nenhuma" (marcada) e as 3 metas');
  fxOpts().find((b) => b.getAttribute('data-fx-k') === G_AGUA).click();
  ok($('fx-pick-modal').classList.contains('hidden') && $('bl-form-goal-val').textContent.includes('Beber água'), 'tocar em "💧 Beber água" escolhe e fecha');
  w.saveBacklogForm(); await sleep(20);
  ok(J(`backlogDb.find((x) => x.id === ${JSON.stringify(T1.id)})`).goalId === G_AGUA, 'salvou: a tarefa fica ligada a 💧 Beber água');
  w.renderBacklog();
  const cardEl = d.querySelector(`[data-bl-card="${T1.id}"] h4`);
  ok(cardEl && cardEl.querySelector('.goal-badge') && cardEl.querySelector('.goal-badge').textContent === '💧', 'o cartão da Lista mostra o 💧');
  w.scheduleBacklogItem(T1.id);
  ok(J('pendingIntent').goalId === G_AGUA, 'agendar: a meta vai pra mão');
  emptyEl().click(); await sleep(20);
  const B2 = J(`db.find((b) => b.title === ${JSON.stringify(T1.title)} && b.date === '${TODAY}' && b.goalId)`);
  ok(B2 && B2.goalId === G_AGUA && !ev(`backlogDb.some((x) => x.id === ${JSON.stringify(T1.id)})`), 'soltou: o bloco nasce com a meta da tarefa');
  w.toggleBlockCompletion(B2.id, stop); await sleep(20);
  ok(status(G_AGUA).total === 1 && status(G_AGUA).text === '1 de 8 hoje', 'concluir conta um copo ("1 de 8 hoje")');
  // voltar pra lista leva a meta
  ev(`deletingTaskId = ${JSON.stringify(B2.id)}`); w.moveToBacklog(); await sleep(20);
  const T1b = J(`backlogDb.find((x) => x.title === ${JSON.stringify(T1.title)})`);
  ok(T1b && T1b.goalId === G_AGUA && status(G_AGUA).total === 0, 'o bloco voltou pra Lista com a meta (e saiu da conta)');
  // rotina
  const R1 = J('routinesDb[0]');
  w.openListSheet(); w.switchListTab('routines'); w.openRoutineForm(R1.id);
  ok(!$('rt-form-goal-wrap').classList.contains('hidden'), 'a rotina mostra a linha "Meta"');
  w.selectRoutineFormGoal(G_LER); w.saveRoutine(); await sleep(20);
  ok(J(`routinesDb.find((x) => x.id === ${JSON.stringify(R1.id)})`).goalId === G_LER && d.querySelector('#routines-list-container .goal-badge, #view-routines .goal-badge') && d.querySelector('#view-routines .goal-badge').textContent === '📚', 'salvou: a rotina fica ligada a 📚 Ler (com o selo)');
  w.stampRoutine(R1.id);
  ok(J('pendingIntent').goalId === G_LER, 'colocar a rotina na agenda leva a meta pro bloco');
  w.cancelPendingTask();
  w.closeAllSheets();

  console.log('\nB5) Cartão da sublista:');
  ev(`db.push({ id: 'f_sub_meta', date: '${TODAY}', startMin: 1380, duration: 30, title: 'Água do dia', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [], cards: [{ id: 'cd_a1', title: 'Copo 1', done: false }, { id: 'cd_a2', title: 'Copo 2', done: false }] }); saveDb(); renderTimeline();`);
  w.openEditModal('f_sub_meta', stop);
  ok($('edit-goal-wrap').classList.contains('hidden'), 'a sublista em si não liga (quem liga é cada cartão)');
  w.cancelEdit();
  w.openSublistCard('f_sub_meta', 'cd_a1', stop);
  ok(!$('sub-card-goal-wrap').classList.contains('hidden') && chips('sub-card-goals')[0] === '*', 'o cartão da sublista mostra a linha "Meta"');
  w.selectSubCardGoal(G_AGUA); w.saveSubCard(); await sleep(20);
  ok(J(`db.find((b) => b.id === 'f_sub_meta').cards[0]`).goalId === G_AGUA, 'salvou: o cartão fica ligado');
  ev(`db.find((b) => b.id === 'f_sub_meta').expanded = true; renderTimeline();`);
  const subTitle = d.querySelector('[data-card-id="cd_a1"] .sub-card-title');
  ok(subTitle && subTitle.querySelector('.goal-badge') && subTitle.querySelector('.goal-badge').textContent === '💧', 'o cartão mostra o 💧 na sublista');
  w.toggleSublistCard('f_sub_meta', 'cd_a1', stop); await sleep(20);
  ok(status(G_AGUA).total === 1, 'marcar o cartão feito conta um copo');
  // bloco ligado entrando na sublista vira cartão com a meta
  ev(`db.push({ id: 'f_copo3', date: '${TODAY}', startMin: 1410, duration: 15, title: 'Copo 3', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: true, linkedNoteIds: [], goalId: ${JSON.stringify(G_AGUA)} }); saveDb(); renderTimeline();`);
  ok(status(G_AGUA).total === 2, '(um bloco "Copo 3" concluído e ligado: 2 copos)');
  ev(`blockIntoSublist('f_copo3', 'f_sub_meta', true)`); await sleep(20);
  const c3 = J(`db.find((b) => b.id === 'f_sub_meta').cards.find((c) => c.title === 'Copo 3')`);
  ok(c3 && c3.goalId === G_AGUA && c3.done && status(G_AGUA).total === 2, 'o bloco entrou na sublista e virou cartão com a meta (e continua contando)');

  console.log('\nB6) O gráfico da meta:');
  ev(`db.push({ id: 'f_ler_ontem', date: '2026-11-14', startMin: 600, duration: 30, title: 'Leitura', type: 'past', theme: 'focus', tagId: null, microblocks: [], completed: true, linkedNoteIds: [], goalId: ${JSON.stringify(G_LER)} }); saveDb();`);
  w.openListSheet(); w.switchListTab('goals'); w.openGoalForm(G_LER);
  const bars = [...$('goal-chart').querySelectorAll('[data-goal-bar]')];
  ok(!$('goal-chart-wrap').classList.contains('hidden') && bars.length === 7 && bars[6].dataset.goalBar === TODAY && bars[5].dataset.goalBar === '2026-11-14', 'abrir a meta mostra o gráfico com 7 barras (até hoje)');
  ok(bars[6].querySelector('.goal-bar').className.includes('bg-emerald-500') && bars[5].querySelector('.goal-bar').className.includes('bg-emerald-500') && bars[4].querySelector('.goal-bar').style.height === '0%', 'cumpridos (hoje e ontem) ficam verdes; dia sem nada, sem barra');
  ok(/Últimos 7 dias/.test($('goal-chart').textContent) && /🏆 Melhor: 2 dias seguidos/.test($('goal-chart').textContent) && /Total: 1h/.test($('goal-chart').textContent), 'título, recorde ("2 dias seguidos") e total ("1h")');
  ok(bars[6].getAttribute('aria-label') === 'dom 15: 30m de 30m', 'cada barra diz o que foi feito ("dom 15: 30m de 30m")');
  // subir o alvo pra 1h: o dia 14 (só blocos) guarda o alvo de 30 min
  ev(`document.getElementById('goal-target-input').value = '60'`); w.saveGoalForm(); await sleep(20);
  const mk = J(`goalDaysDb.find((x) => x.goalId === ${JSON.stringify(G_LER)} && x.date === '2026-11-14')`);
  ok(mk && mk.amount === 0 && mk.target === 30, 'subiu o alvo pra 1h: o dia 14 ganha a marca do alvo antigo (30 min, feito 0)');
  const s6 = status(G_LER);
  ok(s6.stars === 1 && !s6.complete && s6.text === '30m de 1h hoje', 'o dia 14 continua com estrela; hoje precisa de 1h ("30m de 1h hoje")');
  w.openGoalForm(G_LER);
  ok(J('goalDaysDb').filter((x) => x.goalId === G_LER).length === 1, '(salvar de novo sem mudar o alvo não grava mais nada)');
  w.closeGoalForm();
  // recomeçar (mudou a frequência)
  w.openGoalForm(G_CORRER); w.selectGoalPeriod('dia'); w.saveGoalForm(); await sleep(10);
  ok(!$('goal-confirm-modal').classList.contains('hidden') && /recomeça do zero/.test($('goal-confirm-text').textContent), 'mudar a frequência com corrida contando: pergunta antes ("recomeça do zero")');
  w.confirmGoalAction(); await sleep(20);
  const gc = J(`goalsDb.find((g) => g.id === ${JSON.stringify(G_CORRER)})`);
  ok(gc.period === 'dia' && gc.countFrom === TODAY && status(G_CORRER).total === 1, 'recomeçou: a meta guarda o dia (countFrom) e o bloco de hoje continua contando');
  ev(`db.push({ id: 'f_corrida_antiga', date: '2026-11-13', startMin: 600, duration: 30, title: 'Corrida', type: 'past', theme: 'focus', tagId: null, microblocks: [], completed: true, linkedNoteIds: [], goalId: ${JSON.stringify(G_CORRER)} }); saveDb();`);
  ok(status(G_CORRER).stars === 0 && status(G_CORRER).total === 1 && J(`FazMetas.autoDays(goalsDb, db).filter((x) => x.goalId === ${JSON.stringify(G_CORRER)}).map((x) => x.date)`).join() === TODAY, 'bloco concluído antes do recomeço não conta mais (nem estrela)');

  console.log('\nB7) Meta apagada:');
  w.openGoalForm(G_AGUA); w.deleteGoalFromForm(); w.confirmGoalAction(); await sleep(30);
  ev('renderTimeline(); renderBacklog();');
  ok(!ev(`goalsDb.some((g) => g.id === ${JSON.stringify(G_AGUA)})`) && !d.querySelector('[data-card-id="cd_a1"] .goal-badge') && !d.querySelector(`[data-bl-card="${T1b.id}"] .goal-badge`), 'apagou 💧 Beber água: os selos somem (cartão da sublista e tarefa)');
  w.openSublistCard('f_sub_meta', 'cd_a1', stop);
  ok(chips('sub-card-goals')[0] === '*', 'o cartão abre em "Sem meta"');
  w.closeSubCard && w.closeSubCard();
  w.fazUndo(); await sleep(40);
  ok(ev(`goalsDb.some((g) => g.id === ${JSON.stringify(G_AGUA)})`) && !!d.querySelector(`[data-bl-card="${T1b.id}"] .goal-badge`), 'Desfazer: a meta volta e os selos também');

  console.log('\nB8) Nuvem e backup:');
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const s0 = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== s0); await sleep(150); };
  await syncDone();
  ok(server.get('blocos', UID, B1.id).goal_id === G_LER && server.get('tarefas', UID, T1b.id).goal_id === G_AGUA && server.get('rotinas', UID, R1.id).goal_id === G_LER, 'subiu: goal_id no bloco, na tarefa e na rotina');
  ok(server.get('metas', UID, G_CORRER).count_from === TODAY && server.get('blocos', UID, 'f_sub_meta').cards.find((c) => c.id === 'cd_a1').goalId === G_AGUA, 'e o count_from da meta e o goalId do cartão (dentro de cards)');
  ok(server.get('blocos', UID, b0.id).goal_id === G_CORRER && (!server.get('blocos', UID, 'f_copo3') || server.get('blocos', UID, 'f_copo3').deleted), '(o bloco que entrou na sublista não ficou na nuvem)');
  const T2 = J(`backlogDb.find((x) => !x.goalId)`);
  server.patch('tarefas', UID, T2.id, { goal_id: G_LER });
  server.patch('blocos', UID, B1.id, { goal_id: null });
  await syncDone();
  ok(J(`backlogDb.find((x) => x.id === ${JSON.stringify(T2.id)})`).goalId === G_LER && !('goalId' in blk(B1.id)) && status(G_LER).total === 0, 'do PC: tarefa ligada chega com a meta; bloco desligado sai da conta');
  w.renderBacklog();
  ok(d.querySelector(`[data-bl-card="${T2.id}"] .goal-badge`).textContent === '📚', 'e o selo aparece na Lista');
  server.patch('blocos', UID, b0.id, { goal_id: 'meta_que_nao_existe' });
  await syncDone();
  ok(blk(b0.id).goalId === 'meta_que_nao_existe' && !blockEl(b0.id).querySelector('.goal-badge') && status(G_CORRER).total === 0, 'meta que não existe aqui: guarda o id, mas sem selo e sem contar');
  const bk = JSON.parse(J('collectFazData()').tb_master_db);
  ok(bk.find((b) => b.id === b0.id).goalId === 'meta_que_nao_existe' && bk.find((b) => b.id === 'f_ler_ontem').goalId === G_LER, 'o backup leva o goalId dos blocos');
  const before = server.log.length;
  await syncDone();
  ok(!server.log.slice(before).some((l) => l.op === 'upsert'), 'sincronizar de novo sem mudança não sobe nada');
  ok(JSON.parse(L('tb__sync')).goalIds === 1, 'o estado do sync marca que a agenda já foi lida com as metas (goalIds)');
  // o PC ligou a meta enquanto o celular ainda estava na versão antiga: ele leu o bloco sem o goal_id e o cursor já
  // passou daquela mudança. Na versão nova, lê a agenda inteira uma vez (não sobe nada) e não apaga a meta depois.
  const BV = J(`db.find((b) => !b.goalId && !Array.isArray(b.cards) && !b.completed && b.date === ${JSON.stringify(TODAY)}) || db.find((b) => !b.goalId && !Array.isArray(b.cards) && !b.completed)`);
  server.patch('blocos', UID, BV.id, { goal_id: G_LER });
  const stOld = JSON.parse(L('tb__sync')); delete stOld.goalIds; stOld.cursorBlocos = Date.now() + 120000;
  w.localStorage.setItem('tb__sync', JSON.stringify(stOld));
  const before2 = server.log.length;
  await syncDone();
  ok(blk(BV.id).goalId === G_LER && JSON.parse(L('tb__sync')).goalIds === 1 && !server.log.slice(before2).some((l) => l.op === 'upsert'), 'vindo da versão antiga: lê a agenda inteira uma vez, a meta que o PC ligou chega e nada sobe');
  w.toggleBlockCompletion(BV.id, { stopPropagation() {} });
  ok(await waitFor(() => server.get('blocos', UID, BV.id).completed === true), 'concluir esse bloco no celular sobe');
  ok(server.get('blocos', UID, BV.id).goal_id === G_LER, '...sem apagar a meta ligada no PC');

  // ======================================================================================================
  console.log('\nC) No PC:');
  const srv = makeServer();
  srv.addUser('pessoa@teste.com', 'senha123', UID);
  const DATA = (k) => JSON.parse(backup.data[k]);
  const plan = CORE.plan({ local: { tarefas: DATA('tb_backlog_db'), listas: DATA('tb_backlog_columns'), tags: DATA('tb_tags_db'), blocos: DATA('tb_master_db'), rotinas: DATA('tb_routines_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of (plan.push[k] || [])) srv.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++srv.clock });
  const now0 = Date.now();
  const goalRow = (id, list, title, emoji, period, unit, target, step, pos) => ({ id, list_id: list, title, emoji, period, unit, target, step, position: pos, created_ms: now0, deleted: false, count_from: null });
  [['gl_pessoal', 'Pessoal', 1024], ['gl_profissional', 'Profissional', 2048], ['gl_financeiro', 'Financeiro', 3072]].forEach(([id, name, position]) => srv.insert('metas_listas', UID, { id, name, is_default: true, position, created_ms: now0, deleted: false }));
  srv.insert('metas', UID, goalRow('meta_ler', 'gl_pessoal', 'Ler', '📚', 'dia', 'minutos', 15, 5, 1024)); // os blocos de hoje nos dados de teste têm 15 min
  srv.insert('metas', UID, goalRow('meta_foco', 'gl_profissional', 'Horas de foco', '🎯', 'dia', 'minutos', 60, 30, 2048));
  srv.insert('metas', UID, goalRow('meta_correr', 'gl_pessoal', 'Correr', '🏃', 'semana', 'vezes', 3, 1, 3072));
  srv.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };
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
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime(); // segunda 16/11/2026, 07:20
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(srv) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const P = dom.window, pd = P.document, $$ = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new P.MouseEvent('click', { bubbles: true }));
  const change = (el, v) => { el.value = v; el.dispatchEvent(new P.Event('change', { bubbles: true })); };
  const row = (t, id) => srv.get(t, UID, id);
  const upd = (t) => srv.log.filter((l) => l.op === 'update' && (!t || l.t === t));
  const settle = () => sleep(150);
  const ptoast = () => $$('toast').textContent;
  const PTODAY = '2026-11-16';
  const opts = (sel) => [...$$(sel).querySelectorAll('option')].map((o) => o.value + (o.selected ? '*' : ''));
  const groups = (sel) => [...$$(sel).querySelectorAll('optgroup')].map((g) => g.label + ':' + g.querySelectorAll('option').length);
  await waitFor(() => pd.querySelectorAll('section.col').length === 5);
  const tab = (name) => { click($$('tab-' + name)); };
  const mtCard = (id) => pd.querySelector(`.mt-card[data-goal="${id}"]`);
  const agBlock = (id) => pd.querySelector(`#ag-cols [data-block="${id}"]`);

  console.log('\nC1) Ligar pelo cartão do bloco:');
  tab('agenda'); await settle();
  const pb = Object.values(Object.fromEntries([...srv.tables.blocos.values()].filter((r) => r.user_id === UID && !r.deleted && r.date === PTODAY && !Array.isArray(r.cards) && !r.completed && r.theme !== 'rest').map((r) => [r.id, r])))[0];
  click(agBlock(pb.id)); await sleep(30);
  ok(!$$('modal-task').classList.contains('hidden') && !$$('f-goal-wrap').classList.contains('hidden'), 'o cartão do bloco tem a linha "Meta"');
  ok(opts('f-goal').join() === '*,meta_ler,meta_correr,meta_foco' && groups('f-goal').join() === 'Pessoal:2,Profissional:1', 'o seletor: "Sem meta" e as metas agrupadas por categoria');
  change($$('f-goal'), 'meta_ler');
  srv.log.length = 0;
  click($$('f-save')); await waitFor(() => upd('blocos').length === 1); await settle();
  ok(row('blocos', pb.id).goal_id === 'meta_ler' && upd('blocos')[0].fields.join() === 'goal_id', 'salvou: grava só o goal_id do bloco');
  ok(agBlock(pb.id).querySelector('.goal-badge') && agBlock(pb.id).querySelector('.goal-badge').textContent === '📚', 'a Semana mostra o 📚 no bloco');
  click(agBlock(pb.id)); await sleep(30);
  ok(opts('f-goal')[1] === 'meta_ler*', 'abrir de novo: vem marcado "📚 Ler"');
  srv.log.length = 0;
  $$('f-title').value = pb.title + ' (editado)';
  click($$('f-save')); await waitFor(() => upd('blocos').length === 1); await settle();
  ok(upd('blocos')[0].fields.join() === 'title', 'salvar sem mexer na meta não manda o goal_id');

  console.log('\nC2) Concluir conta (e avisa a estrela):');
  tab('metas'); await settle();
  ok(/0m? de 15m hoje/.test(mtCard('meta_ler').textContent), 'Metas: Ler começa em 0 de 15m');
  tab('agenda'); await settle();
  const doneBtn = agBlock(pb.id).querySelector('.ag-done, [data-done]');
  click(doneBtn); await waitFor(() => row('blocos', pb.id).completed === true); await settle();
  ok(/Meta cumprida/.test(ptoast()), 'concluir o bloco ligado de ' + pb.duration + ' min: "' + ptoast() + '"');
  tab('metas'); await settle();
  ok(/✓ 15m de 15m hoje/.test(mtCard('meta_ler').textContent) && /⭐ 1/.test(mtCard('meta_ler').textContent), 'a aba Metas conta o bloco: "✓ 15m de 15m hoje", ⭐ 1');
  ok(/⭐ 1 estrela/.test($$('mt-level-sub').textContent) && $$('mt-points').textContent === '10 pontos', 'o nível no topo também (10 pontos)');
  ok(!upd('metas_dias').length && ![...srv.tables.metas_dias.values()].some((r) => r.user_id === UID), 'nada é gravado nos dias da meta');
  tab('agenda'); await settle();
  click(agBlock(pb.id).querySelector('.ag-done, [data-done]')); await waitFor(() => row('blocos', pb.id).completed === false); await settle();
  tab('metas'); await settle();
  ok(/0m? de 15m hoje/.test(mtCard('meta_ler').textContent) && !/⭐ 1/.test(mtCard('meta_ler').textContent), 'reabrir o bloco tira da conta');
  // o celular conclui um bloco ligado: chega sozinho
  srv.patch('blocos', UID, pb.id, { completed: true }); await settle();
  ok(/✓|⭐ 1/.test(mtCard('meta_ler').textContent), 'o celular concluiu: a aba Metas atualiza sozinha (tempo real)');

  console.log('\nC3) Tarefa, rotina e a meta indo junto:');
  tab('listas'); await settle();
  const ptask = [...srv.tables.tarefas.values()].find((r) => r.user_id === UID && !r.deleted && r.column_id === 'col_geral');
  click(pd.querySelector(`.card[data-id="${ptask.id}"]`)); await sleep(30);
  ok(!$$('f-goal-wrap').classList.contains('hidden'), 'o cartão da tarefa tem a linha "Meta"');
  change($$('f-goal'), 'meta_foco');
  click($$('f-save')); await waitFor(() => row('tarefas', ptask.id).goal_id === 'meta_foco'); await settle();
  ok(row('tarefas', ptask.id).goal_id === 'meta_foco' && pd.querySelector(`.card[data-id="${ptask.id}"] .goal-badge`).textContent === '🎯', 'a tarefa ligada mostra o 🎯 no quadro');
  // agendar pelo cartão
  click(pd.querySelector(`.card[data-id="${ptask.id}"]`)); await sleep(30);
  click($$('f-schedule')); await sleep(20);
  P.eval && 0;
  click($$('f-sched-ok') || pd.querySelector('#f-sched [data-sched-ok], #f-sched button.bg-focus')); await waitFor(() => row('tarefas', ptask.id).deleted === true); await settle();
  const nb = [...srv.tables.blocos.values()].find((r) => r.user_id === UID && !r.deleted && r.title === ptask.title && r.goal_id);
  ok(nb && nb.goal_id === 'meta_foco', 'Agendar: o bloco nasce com a meta da tarefa');
  // voltar pra lista
  tab('agenda'); await settle();
  click(agBlock(nb.id)); await sleep(30);
  click($$('f-tolist')); await waitFor(() => row('blocos', nb.id).deleted === true); await settle();
  const back = [...srv.tables.tarefas.values()].find((r) => r.user_id === UID && !r.deleted && r.title === ptask.title);
  ok(back && back.goal_id === 'meta_foco', 'Voltar pra lista: a tarefa volta com a meta');
  // rotina
  const prt = [...srv.tables.rotinas.values()].find((r) => r.user_id === UID && !r.deleted);
  tab('rotinas'); await settle();
  click(pd.querySelector(`[data-rt="${prt.id}"]`)); await sleep(30);
  ok(!$$('rt-f-goal-wrap').classList.contains('hidden') && opts('rt-f-goal')[0] === '*', 'a rotina tem a linha "Meta"');
  change($$('rt-f-goal'), 'meta_ler');
  srv.log.length = 0;
  click($$('rt-f-save')); await waitFor(() => row('rotinas', prt.id).goal_id === 'meta_ler'); await settle();
  ok(upd('rotinas')[0].fields.join() === 'goal_id' && pd.querySelector(`[data-rt="${prt.id}"] .goal-badge`).textContent === '📚', 'salvou só o goal_id; o cartão da rotina mostra o 📚');
  click(pd.querySelector(`[data-rt-hand="${prt.id}"]`)); await sleep(30);
  const firstFree = pd.querySelector('#ag-cols [data-gap-day]');
  ok(!!firstFree, '(rotina na mão: a Semana mostra onde soltar)');
  click(firstFree); await waitFor(() => [...srv.tables.blocos.values()].some((r) => r.user_id === UID && !r.deleted && r.goal_id === 'meta_ler' && r.title.indexOf(prt.title) >= 0)); await settle();
  const rb = [...srv.tables.blocos.values()].find((r) => r.user_id === UID && !r.deleted && r.goal_id === 'meta_ler' && r.title.indexOf(prt.title) >= 0);
  ok(rb && rb.goal_id === 'meta_ler', 'colocar a rotina na Agenda: o bloco nasce com a meta dela');

  console.log('\nC4) Sublista no PC:');
  const subRow = { user_id: UID, id: 'f_sub_pc', date: PTODAY, start_min: 1380, duration: 30, title: 'Sublista PC', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false, cards: [{ id: 'cd_p1', title: 'Foco 1', done: false, duration: 30 }], goal_id: null };
  srv.insert('blocos', UID, subRow); await settle();
  tab('agenda'); await settle();
  click(agBlock('f_sub_pc')); await sleep(40);
  ok($$('f-goal-wrap').classList.contains('hidden'), 'a sublista em si não tem "Meta"');
  click(pd.querySelector('[data-fc-open="cd_p1"]')); await sleep(30);
  ok(!$$('f-goal-wrap').classList.contains('hidden'), 'o cartão da sublista tem "Meta"');
  change($$('f-goal'), 'meta_foco');
  click($$('f-save')); await waitFor(() => (row('blocos', 'f_sub_pc').cards[0] || {}).goalId === 'meta_foco'); await settle();
  ok(row('blocos', 'f_sub_pc').cards[0].goalId === 'meta_foco', 'salvou: o cartão guarda a meta (goalId, como no celular)');
  click($$('f-cancel')); await sleep(20);
  const subCk = pd.querySelector('#ag-cols [data-sub-ck="f_sub_pc"][data-card="cd_p1"]');
  ok(subCk && pd.querySelector('#ag-cols [data-sub-open="f_sub_pc"][data-card="cd_p1"] .goal-badge').textContent === '🎯', 'o cartão na Semana mostra o 🎯');
  click(subCk); await waitFor(() => row('blocos', 'f_sub_pc').cards[0].done === true); await settle();
  tab('metas'); await settle();
  ok(/30m de 1h hoje/.test(mtCard('meta_foco').textContent), 'marcar o cartão feito conta 30 min em "Horas de foco"');
  tab('agenda'); await settle();

  console.log('\nC5) Gráfico, mudar o alvo e recomeçar:');
  srv.insert('blocos', UID, { id: 'f_ler_sab', date: '2026-11-14', start_min: 600, duration: 30, title: 'Leitura', type: 'past', theme: 'focus', tag_id: null, microblocks: [], completed: true, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false, cards: null, goal_id: 'meta_ler' });
  await settle();
  tab('metas'); await settle();
  click(mtCard('meta_ler')); await sleep(30);
  const pbars = [...$$('mt-f-chart').querySelectorAll('[data-goal-bar]')];
  ok(!$$('mt-f-chart-wrap').classList.contains('hidden') && pbars.length === 7 && pbars[6].dataset.goalBar === PTODAY && pbars[4].dataset.goalBar === '2026-11-14', 'a janela da meta mostra o gráfico (7 dias até hoje)');
  ok(/Últimos 7 dias/.test($$('mt-f-chart').textContent) && /Melhor: /.test($$('mt-f-chart').textContent) && /Total: /.test($$('mt-f-chart').textContent), 'com recorde e total');
  $$('mt-f-target').value = '60';
  srv.log.length = 0;
  click($$('mt-f-save')); await waitFor(() => Number(row('metas', 'meta_ler').target) === 60); await settle();
  const pmk = row('metas_dias', 'meta_ler_20261114');
  ok(pmk && Number(pmk.amount) === 0 && Number(pmk.target) === 15 && !pmk.deleted, 'subiu o alvo pra 1h: o sábado (só blocos) ganha a marca do alvo antigo (15 min)');
  ok(/⭐/.test(mtCard('meta_ler').textContent), 'a estrela do sábado continua');
  click(mtCard('meta_correr')); await sleep(30);
  click(pd.querySelector('#mt-f-period [data-period="dia"]'));
  click($$('mt-f-save')); await sleep(40);
  if (!$$('dialog').classList.contains('hidden')) { click($$('dlg-ok')); }
  await waitFor(() => row('metas', 'meta_correr').period === 'dia'); await settle();
  ok(row('metas', 'meta_correr').count_from === PTODAY, 'recomeçar (mudou a frequência): grava o count_from de hoje');

  console.log('\nC6) Duplicar e meta apagada:');
  tab('agenda'); await settle();
  const dupSrc = row('blocos', pb.id);
  click(agBlock(pb.id).querySelector('[data-more]')); await sleep(20);
  const dupBtn = [...pd.querySelectorAll('div.fixed.z-40 button')].find((b) => /Duplicar/.test(b.textContent));
  click(dupBtn); await waitFor(() => [...srv.tables.blocos.values()].filter((r) => r.user_id === UID && !r.deleted && r.title === dupSrc.title).length === 2); await settle();
  const dup = [...srv.tables.blocos.values()].find((r) => r.user_id === UID && !r.deleted && r.title === dupSrc.title && r.id !== pb.id);
  ok(dup && dup.goal_id === 'meta_ler' && !dup.completed, 'Duplicar: a cópia vai com a meta (e desmarcada)');
  srv.patch('metas', UID, 'meta_ler', { deleted: true }); await settle();
  ok(!agBlock(pb.id).querySelector('.goal-badge'), 'meta apagada no celular: o selo some do bloco');
  click(agBlock(pb.id)); await sleep(30);
  ok(opts('f-goal')[0] === '*' && !opts('f-goal').some((o) => o.startsWith('meta_ler')), 'e o seletor abre em "Sem meta" (a meta apagada não aparece)');
  click($$('f-cancel')); await sleep(10);

  const errs = [...B.errors, ...errors];
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====` + (errs.length ? '\nERROS DE PÁGINA: ' + errs.slice(0, 3).join(' | ').slice(0, 900) : ''));
  try { w.close(); P.close(); } catch (e) {}
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
