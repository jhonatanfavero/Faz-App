// V40.51.1 — FOTO DELE DE 28/11 (12h58): "esqueceu de atualizar pra ficha quando entra pelo + na agenda" e os botões
// cortados (a 384 px, o 1h e o Período ficavam fora da tela, à direita, e as tags e as metas pela metade). O + virou
// uma Ficha como as das Listas (V40.51.0):
//   A) o jeito: X / "Novo bloco" / engrenagem em cima, o nome grande, a ficha (Tipo, Duração, Tag, Meta, Período
//      inteiro) e o Inserir no pé; nada de fileira que rola pro lado
//   B) Duração: 5m a 1h na própria linha (.on); o + lembra a última (rascunho); vinda de fora (90 min), volta pra 30
//   C) Tag e Meta pela folha de baixo (escolhe e fecha; o voltar fecha só a folha); a meta dá o nome (V40.36.1);
//      abrir de novo começa em "Nenhuma"; tag apagada volta pra "Nenhuma"; nome com HTML aparece como texto
//   D) Tipo: Descanso (o nome pronto "Descanso" ou o escrito; sem Meta e sem Período) e Sublista (cards: []);
//      Tarefa sem nome avisa; abrir de novo volta pra Tarefa; o Enter faz o mesmo que o botão
//   E) 2 toques num vago: "Inserir às 09:30" / "Descanso às 09:30" / "Sublista às 09:30", e entra ali
//   F) Período inteiro: a linha diz quais existem; a tela (Ficha, ← e X) cria o bloco no dia aberto; o ← volta pro +
//      com o que estava escolhido (e o ← da Config também); sem período nenhum, o aviso e "Criar um período"
// Uso: TZ='America/Sao_Paulo' node tests/test_v40511.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const boot = require('./boot_app');
const REPO = process.argv[2], DADOS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

(async () => {
  const A = await boot(REPO, DADOS.data), w = A.w, d = w.document, $ = A.$, ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const hid = (id) => $(id).classList.contains('hidden');
  const tick = () => sleep(10);
  const open = (id) => !$(id).classList.contains('translate-y-full');
  const pick = () => !hid('fx-pick-modal');
  const opts = () => [...d.querySelectorAll('#fx-pick-list [data-fx-k]')];
  const optTxt = () => opts().map((b) => T(b) + (b.getAttribute('aria-checked') === 'true' ? '*' : '')).join(',');
  const opt = (k) => opts().find((b) => b.getAttribute('data-fx-k') === k);
  const toasts = () => w.__toasts || [];
  const kinds = () => [...d.querySelectorAll('#bottom-sheet [data-plus-kind]')];
  const kindOn = () => kinds().filter((b) => b.classList.contains('on')).map((b) => b.getAttribute('data-plus-kind')).join();
  const durs = () => [...d.querySelectorAll('#bottom-sheet .sheet-dur-btn')];
  const durOn = () => durs().filter((b) => b.classList.contains('on')).map((b) => b.dataset.time).join();
  const btn = () => T($('commit-intent-btn'));
  const sh = $('bottom-sheet');
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');

  console.log('A) O + na Ficha:');
  ev('openSheet()'); await tick();
  const head = sh.querySelector('.fx-head'), hb = head ? [...head.querySelectorAll('button')] : [];
  ok(open('bottom-sheet') && sh.classList.contains('fx-sheet') && !sh.classList.contains('bg-white') && /\[id\$="-sheet"\]\.fx-sheet \{ background-color: #f8fafc; padding-left: 0 !important; padding-right: 0 !important; \}/.test(css), 'a tela do + é uma Ficha (.fx-sheet: o fundo clarinho e sem o respiro dos lados)');
  ok(hb.length === 2 && hb[0].getAttribute('data-voltar') === 'fechar' && hb[0].getAttribute('onclick') === 'closeAllSheets()' && !!hb[0].querySelector('.ph-x') && T($('plus-title')) === 'Novo bloco', 'em cima: o X (o voltar toca nele) e "Novo bloco"');
  ok(hb[1].getAttribute('onclick') === 'openConfigSheet()' && T(hb[1]) === '' && hb[1].getAttribute('aria-label') === 'Configurações' && !!hb[1].querySelector('.ph-gear') && sh.querySelectorAll('button[onclick="openConfigSheet()"]').length === 1, '... e a engrenagem (sem texto, com o nome pra leitor de tela), uma vez só');
  ok($('task-input').classList.contains('fx-name') && $('task-input').placeholder === 'Nome da tarefa' && d.activeElement !== $('task-input'), 'o nome grande ("Nome da tarefa"), sem foco ao abrir (o teclado não sobe sozinho, V40.47.1)');
  ok(kinds().map(T).join() === 'Tarefa,Descanso,Sublista' && kindOn() === 'task' && durs().map(T).join() === '5m,10m,15m,30m,45m,1h' && durOn() === '30', 'Tipo: Tarefa | Descanso | Sublista (Tarefa marcada); Duração: 5m 10m 15m 30m 45m 1h (30 marcada)');
  ok(T($('plus-tag-val')) === 'Nenhuma' && !$('plus-tag-val').classList.contains('on') && !hid('plus-per-row') && T($('plus-per-sub')) === 'Madrugada, Manhã, Tarde, Noite', 'Tag "Nenhuma" (apagado) e o Período inteiro com os nomes: "' + T($('plus-per-sub')) + '"');
  ok(hid('goal-pick-new-wrap'), 'sem meta nenhuma criada, a linha Meta some (como antes)');
  ok(btn() === 'Inserir na Agenda' && $('commit-intent-btn').classList.contains('fx-save') && !!$('commit-intent-btn').closest('.fx-foot'), 'no pé: "Inserir na Agenda"');
  ok(!sh.querySelector('.overflow-x-auto') && !$('tag-selector-container') && !sh.querySelector('[data-goal-pick]'), 'nenhuma fileira que rola pro lado (era o que cortava os botões)');
  const card = sh.querySelector('.fx-card'), rows = card ? [...card.children] : [];
  ok(rows.length === 5 && rows.every((r) => r.classList.contains('fx-row')) && rows.slice(2).every((r) => r.tagName === 'BUTTON' && r.getAttribute('type') === 'button'), 'a ficha: 5 linhas (Tipo, Duração, Tag, Meta, Período), as 3 de baixo tocáveis');
  ok(/V40\.51\.1 — O \+ NA FICHA/.test(html) && /V40\.51\.1 — O \+ NA FICHA/.test(css), 'os comentários da V40.51.1 no index.html e no style.css');

  console.log('\nB) Duração:');
  d.querySelector('.sheet-dur-btn[data-time="45"]').click(); await tick();
  ok(durOn() === '45' && J('selectedDur') === 45 && d.querySelector('.sheet-dur-btn[data-time="45"]').getAttribute('aria-pressed') === 'true' && d.querySelector('.sheet-dur-btn[data-time="30"]').getAttribute('aria-pressed') === 'false', 'tocar em 45m marca ele (e desmarca o 30)');
  ev('closeAllSheets()'); await tick(); ev('openSheet()'); await tick();
  ok(durOn() === '45' && J('selectedDur') === 45, 'fechar e abrir: continua 45m (o + guarda o rascunho)');
  ev('closeAllSheets(); selectedDur = 90; openSheet();'); await tick();
  ok(durOn() === '30' && J('selectedDur') === 30, 'vindo de outro lugar com 90 min (tarefa da Lista, rotina): o + mostra e usa 30m, não um valor escondido');
  ev('closeAllSheets()'); await tick();

  console.log('\nC) Tag e Meta pela folha:');
  const tags = J('tagsDb');
  ev('openSheet()'); await tick();
  ev('plusPickTag()'); await tick();
  ok(pick() && T($('fx-pick-title')) === 'Tag' && opts().length === tags.length + 1 && optTxt().startsWith('Nenhuma*,'), 'Tag: a folha sobe com "Nenhuma" (marcada) e as ' + tags.length + ' tags');
  opt(tags[2].id).click(); await tick();
  ok(!pick() && J('selectedTagId') === tags[2].id && T($('plus-tag-val')) === tags[2].name && $('plus-tag-val').classList.contains('on') && !!$('plus-tag-val').querySelector('.fx-dot') && open('bottom-sheet'), 'tocar numa tag escolhe e fecha: "' + tags[2].name + '" com a bolinha (o + continua)');
  ev('plusPickTag()'); await tick();
  ok(opt(tags[2].id).getAttribute('aria-checked') === 'true', 'abrindo de novo, a escolhida vem marcada');
  ev('navBack()'); await tick();
  ok(!pick() && open('bottom-sheet') && J('selectedTagId') === tags[2].id, 'o voltar do celular fecha só a folha (o + e a tag ficam)');
  ev('plusPickTag()'); await tick(); ev('onOverlayClick()'); await tick();
  ok(!pick() && open('bottom-sheet') && J('selectedTagId') === tags[2].id, 'tocar no fundo escuro também fecha só a folha');
  ev(`tagsDb = tagsDb.filter((t) => t.id !== '${tags[2].id}'); renderTagSelector();`); await tick();
  ok(J('selectedTagId') === null && T($('plus-tag-val')) === 'Nenhuma', 'a tag escolhida foi apagada (aqui, no PC ou no Desfazer): volta pra "Nenhuma"');
  ev(`tagsDb.push({ id: 'tg_x', name: '<img src=x onerror="window.__xss=1">', color: '#ef4444' }); selectTag('tg_x');`); await tick();
  ok(T($('plus-tag-val')) === '<img src=x onerror="window.__xss=1">' && !$('plus-tag-val').querySelector('img') && !w.__xss, 'nome de tag com HTML aparece como texto (não vira código)');
  ev(`tagsDb = tagsDb.filter((t) => t.id !== 'tg_x'); selectedTagId = '${tags[0].id}'; renderTagSelector();`);
  ev('closeAllSheets()'); await tick(); ev('openSheet()'); await tick();
  ok(J('selectedTagId') === null && T($('plus-tag-val')) === 'Nenhuma', 'abrir o + de novo começa sem tag (como antes)');
  // metas
  ev('closeAllSheets()');
  ev("openListSheet(); switchListTab('goals');"); await sleep(30);
  const G = [];
  for (const i of [4, 1]) { ev(`openGoalForm(); applyGoalTemplate(${i}); saveGoalForm();`); await sleep(8); G.push(J('goalsDb[goalsDb.length - 1]')); }
  ev('closeAllSheets()'); await tick();
  ev('openSheet()'); await tick();
  ok(!hid('goal-pick-new-wrap') && T($('goal-pick-new')) === 'Nenhuma', 'com metas: a linha Meta aparece ("Nenhuma")');
  ev('plusPickGoal()'); await tick();
  ok(pick() && T($('fx-pick-title')) === 'Meta' && opts().length === 3 && optTxt().startsWith('Nenhuma*,') && opts().slice(1).every((b) => !!b.querySelector('.fx-oe')), 'Meta: a folha com "Nenhuma" e as 2 metas (com o emoji)');
  opt(G[0].id).click(); await tick();
  ok(!pick() && J('selectedGoalId') === G[0].id && T($('goal-pick-new')).includes(G[0].title) && T($('goal-pick-new')).includes(G[0].emoji) && $('task-input').placeholder === G[0].title, 'escolheu "' + G[0].emoji + ' ' + G[0].title + '": a linha mostra, e o nome dela aparece clarinho no campo (V40.36.1)');
  $('task-input').value = '';
  ev('commitPlus()'); await tick();
  ok(J('pendingIntent && pendingIntent.title') === G[0].title && J('pendingIntent.goalId') === G[0].id && !open('bottom-sheet'), 'sem nome: vai pra mão como "' + G[0].title + '", ligado à meta');
  ev('cancelPendingTask()'); await tick();
  ev('openSheet()'); await tick();
  ok(J('selectedGoalId') === null && T($('goal-pick-new')) === 'Nenhuma' && $('task-input').placeholder === 'Nome da tarefa', 'abrir o + de novo começa sem meta');
  ev(`selectNewGoal('${G[1].id}')`); await tick();
  ok(T($('goal-pick-new')).includes(G[1].title), 'selectNewGoal (de fora) também mostra na linha');
  ev('closeAllSheets()'); await tick();

  console.log('\nD) Tipo: Descanso e Sublista:');
  ev(`activeDateObj = new Date(2026, 11, 20); renderTimeline();`); await tick();
  ev('openSheet()'); await tick();
  $('task-input').value = '';
  d.querySelector('#bottom-sheet [data-plus-kind="rest"]').click(); await tick();
  ok(kindOn() === 'rest' && kinds()[1].getAttribute('aria-pressed') === 'true' && $('task-input').placeholder === 'Descanso' && hid('goal-pick-new-wrap') && hid('plus-per-row') && btn() === 'Inserir descanso', 'Descanso: o nome pronto "Descanso", sem Meta e sem Período, o botão "Inserir descanso"');
  ev(`plusPickTag()`); await tick(); opt(J('tagsDb[1].id')).click(); await tick();
  d.querySelector('.sheet-dur-btn[data-time="15"]').click(); await tick();
  $('commit-intent-btn').click(); await tick();
  const pi1 = J('pendingIntent');
  ok(pi1 && pi1.title === 'Descanso' && pi1.theme === 'rest' && pi1.duration === 15 && pi1.tagId === J('tagsDb[1].id') && !pi1.goalId && !open('bottom-sheet') && !hid('floating-task'), 'tocar no botão: um descanso de 15 min, com a tag, vai pra mão (como o botão Descanso de antes)');
  ev('cancelPendingTask()'); await tick();
  ev('openSheet()'); await tick();
  ok(kindOn() === 'task' && btn() === 'Inserir na Agenda' && !hid('plus-per-row') && !hid('goal-pick-new-wrap') && $('task-input').placeholder === 'Nome da tarefa', 'abrir o + de novo volta pra Tarefa (o Período e a Meta voltam)');
  ev("plusKindSet('rest')"); $('task-input').value = 'Almoço';
  ev('commitPlus()'); await tick();
  ok(J('pendingIntent && pendingIntent.title') === 'Almoço' && J('pendingIntent.theme') === 'rest' && $('task-input').value === '', 'Descanso com nome escrito: vale o nome ("Almoço"), e o campo limpa');
  ev('cancelPendingTask()'); await tick();
  ev('openSheet()'); await tick();
  ev("plusKindSet('sub')"); await tick();
  ok(kindOn() === 'sub' && $('task-input').placeholder === 'Sublista' && hid('goal-pick-new-wrap') && hid('plus-per-row') && btn() === 'Inserir sublista', 'Sublista: o nome pronto "Sublista", sem Meta e sem Período, o botão "Inserir sublista"');
  $('task-input').value = 'Pendências';
  ev('commitPlus()'); await tick();
  const pi2 = J('pendingIntent');
  ok(pi2 && pi2.title === 'Pendências' && Array.isArray(pi2.cards) && pi2.cards.length === 0 && pi2.theme === 'focus' && toasts().slice(-1)[0] === 'Toque num Tempo Livre pra colocar a sublista 👇', 'tocar no botão: a sublista "Pendências" vai pra mão (cards: []) e a dica de antes');
  ev('cancelPendingTask()'); await tick();
  ev('openSheet()'); await tick();
  $('task-input').value = '   ';
  const nT = toasts().length;
  ev('commitPlus()'); await tick();
  ok(J('pendingIntent') === null && open('bottom-sheet') && toasts().length === nT + 1 && toasts().slice(-1)[0] === 'Escreva o nome da tarefa ✏️', 'Tarefa sem nome (e sem meta): não vai pra mão e avisa "Escreva o nome da tarefa ✏️" (antes não fazia nada)');
  $('task-input').value = 'Pelo Enter';
  $('task-input').dispatchEvent(new w.KeyboardEvent('keypress', { key: 'Enter', bubbles: true })); await tick();
  ok(J('pendingIntent && pendingIntent.title') === 'Pelo Enter' && J('pendingIntent.theme') === 'focus', 'o Enter no nome faz o mesmo que o botão');
  ev('cancelPendingTask()'); await tick();
  ev('openSheet()'); ev("plusKindSet('rest')"); $('task-input').value = '';
  $('task-input').dispatchEvent(new w.KeyboardEvent('keypress', { key: 'Enter', bubbles: true })); await tick();
  ok(J('pendingIntent && pendingIntent.theme') === 'rest', '... também com o Descanso escolhido');
  ev('cancelPendingTask()'); await tick();

  console.log('\nE) Dois toques num vago:');
  const DAY = '2026-12-21';
  ev(`activeDateObj = new Date(2026, 11, 21); db = db.filter((b) => b.date !== '${DAY}'); renderTimeline();`); await tick();
  ev(`openSheetAt(570, 60, { a: 570, b: 630 }, true, '${DAY}')`); await tick();
  ok(open('bottom-sheet') && btn() === 'Inserir às 09:30' && kindOn() === 'task', 'abre o + com "Inserir às 09:30"');
  ev("plusKindSet('rest')"); await tick();
  const b1 = btn();
  ev("plusKindSet('sub')"); await tick();
  const b2 = btn();
  ok(b1 === 'Descanso às 09:30' && b2 === 'Sublista às 09:30', 'trocando o tipo: "' + b1 + '" / "' + b2 + '"');
  ev("plusKindSet('rest')"); $('task-input').value = '';
  d.querySelector('.sheet-dur-btn[data-time="30"]').click();
  $('commit-intent-btn').click(); await sleep(30);
  const r = J(`db.filter((b) => b.date === '${DAY}').map((b) => [b.title, b.theme, b.startMin, b.duration])`);
  ok(JSON.stringify(r) === JSON.stringify([['Descanso', 'rest', 570, 30]]) && J('pendingIntent') === null && J('sheetSlot') === null, 'tocar em "Descanso às 09:30": o descanso entra às 09:30 (30 min)');
  ev('openSheet()'); await tick();
  ok(btn() === 'Inserir na Agenda', 'abrir o + pelo botão depois: "Inserir na Agenda" de novo');
  ev('closeAllSheets()'); await tick();

  console.log('\nF) Período inteiro:');
  const PDAY = '2026-12-22';
  ev(`activeDateObj = new Date(2026, 11, 22); db = db.filter((b) => b.date !== '${PDAY}'); renderTimeline();`); await tick();
  ev('openSheet()'); await tick();
  ev(`plusPickTag()`); await tick(); opt(J('tagsDb[0].id')).click(); await tick();
  ev(`selectNewGoal('${G[0].id}')`); await tick();
  $('plus-per-row').click(); await tick();
  const ps = $('period-select-sheet'), pRows = [...ps.querySelectorAll('#period-select-container [data-per]')];
  ok(open('period-select-sheet') && !open('bottom-sheet') && ps.classList.contains('fx-sheet') && T(ps.querySelector('.fx-title')) === 'Período inteiro', 'tocar em "Período inteiro" abre a tela dele (na Ficha)');
  ok(pRows.length === 4 && pRows.every((b) => b.classList.contains('fx-row') && b.tagName === 'BUTTON' && !b.hasAttribute('onclick')) && T(pRows[1]) === 'Manhã 06:00 às 12:00' && !!ps.querySelector('.fx-back[data-voltar]:not([data-voltar="fechar"])') && !!ps.querySelector('[data-voltar="fechar"]'), 'uma linha por período ("Manhã 06:00 às 12:00"; o id num data-, não no onclick), o ← e o X');
  ev('navBack()'); await tick();
  ok(!open('period-select-sheet') && open('bottom-sheet') && J('selectedTagId') === J('tagsDb[0].id') && J('selectedGoalId') === G[0].id, 'o voltar (o ←) volta pro + com a tag e a meta que já estavam escolhidas');
  $('task-input').value = 'Manhã de obra';
  $('plus-per-row').click(); await tick();
  ps.querySelectorAll('#period-select-container [data-per]')[1].click(); await sleep(30); // (desenhada de novo ao abrir)
  const pb = J(`db.find((b) => b.date === '${PDAY}' && b.title === 'Manhã de obra')`);
  ok(pb && pb.startMin === 360 && pb.duration === 360 && pb.goalId === G[0].id && !open('period-select-sheet') && toasts().slice(-1)[0] === 'Manhã Agendado!', 'tocar na Manhã: o bloco "Manhã de obra" de 06:00 às 12:00 no dia aberto, com a meta (como antes)');
  ev(`periodsDb.push({ id: 'p_x', name: '<b>Lua</b>', start: '20:00', end: '<i>22:00</i>' }); renderPeriodSelect();`); await tick();
  ok(!$('period-select-container').querySelector('b, i:not([class])') && T($('period-select-container')).includes('<b>Lua</b>') && T($('plus-per-sub')).endsWith('<b>Lua</b>'), 'nome e horário de período com HTML aparecem como texto');
  ev(`periodsDb = []; renderPeriodSelect();`); await tick();
  ok(/Nenhum período/.test(T($('period-select-container'))) && !!$('period-select-container').querySelector('button[onclick*="openConfigPeriods"]') && T($('plus-per-sub')) === 'Nenhum criado ainda', 'sem período nenhum: o aviso, o "Criar um período" e "Nenhum criado ainda" no +');
  ev('closeAllSheets()'); await tick();

  console.log('\nG) Config pela engrenagem:');
  ev('openSheet()'); await tick();
  ev("plusKindSet('sub')"); ev(`plusPickTag()`); await tick(); opt(J('tagsDb[1].id')).click(); await tick();
  sh.querySelector('button[onclick="openConfigSheet()"]').click(); await tick();
  ok(open('config-sheet') && $('config-back-btn').getAttribute('onclick') === 'openSheet(true)', 'a engrenagem abre as Configurações; o ← delas é openSheet(true)');
  ev('navBack()'); await tick();
  ok(open('bottom-sheet') && !open('config-sheet') && kindOn() === 'sub' && J('selectedTagId') === J('tagsDb[1].id'), 'o voltar das Configurações volta pro + com o Tipo e a tag escolhidos');
  ev('closeAllSheets()'); await tick();
  ev('openSheet()'); await tick();
  ok(kindOn() === 'task' && J('selectedTagId') === null, 'aberto de novo pelo +: começa do zero (Tarefa, sem tag)');
  ev('closeAllSheets()'); await tick();

  ok(A.errors.length === 0, 'sem erro no celular' + (A.errors.length ? ': ' + A.errors[0] : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1); });
