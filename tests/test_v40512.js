// V40.51.2 — O EDITAR DA AGENDA E O CARTÃO DA SUBLISTA NA FICHA (ele disse "Sim, logo depois" em 28/11, depois do +).
// Eram janelinhas no meio da tela, com as fileiras de tag e meta que cortavam na direita a 384 px. Agora sobem de baixo
// (.fx-modal) no desenho da Ficha:
//   A) Editar na agenda: X / "Editar tarefa" (ou "Editar sublista", sem a Meta), o nome grande, Tag, Meta e Cor do
//      cartão pela folha de baixo (por cima da janela, com o fundo escuro entre as duas), Salvar; o X fecha sem salvar;
//      o voltar fecha só a folha; com o nome mudado, o voltar pergunta "Descartar?"
//   B) Cartão da sublista: "Sublista: X", o nome, Tag/Meta/Cor pela folha, o checklist com a bolinha ("Checklist · 1 de
//      2"), adicionar com Enter, Salvar; "Voltar pra lista" e "Apagar cartão" no ⋯
//   C) nada que rola pro lado nas duas; o CSS
// Uso: TZ='America/Sao_Paulo' node tests/test_v40512.js <repo> <dados-ficticios.json>
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
  const tick = () => sleep(12);
  const pick = () => !hid('fx-pick-modal');
  const opts = () => [...d.querySelectorAll('#fx-pick-list [data-fx-k]')];
  const opt = (k) => opts().find((b) => b.getAttribute('data-fx-k') === k);
  const toasts = () => w.__toasts || [];
  const ov = () => $('overlay');
  const css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8'), html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const tags = J('tagsDb');
  const DAY = '2026-12-23';
  ev(`activeDateObj = new Date(2026, 11, 23); db = db.filter((b) => b.date !== '${DAY}');
      db.push({ id: 'f_e1', type: 'focus', title: 'Revisar a planta', startMin: 600, duration: 60, date: '${DAY}', microblocks: [], completed: false, theme: 'focus', tagId: '${tags[0].id}', linkedNoteIds: [] });
      db.push({ id: 'f_s1', type: 'focus', title: 'Pendências', startMin: 720, duration: 60, date: '${DAY}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false,
        cards: [{ id: 'cd_a', title: 'Pagar o boleto', done: false, tagId: '${tags[1].id}', microblocks: [{ title: 'Conferir o valor', done: true }, { title: 'Agendar', done: false }] }, { id: 'cd_b', title: 'Ligar pro cartório', done: false, microblocks: [] }] });
      saveDb(); renderTimeline();`);
  // duas metas, pra linha Meta aparecer
  ev("openListSheet(); switchListTab('goals');"); await sleep(30);
  const G = [];
  for (const i of [0, 5]) { ev(`openGoalForm(); applyGoalTemplate(${i}); saveGoalForm();`); await sleep(8); G.push(J('goalsDb[goalsDb.length - 1]')); }
  ev('closeAllSheets()'); await tick();

  console.log('A) Editar na agenda:');
  const em = $('edit-task-modal');
  ev("openEditModal('f_e1')"); await tick();
  const head = em.querySelector('.fx-head'), hb = head ? [...head.querySelectorAll('button')] : [];
  ok(!hid('edit-task-modal') && em.classList.contains('fx-modal') && em.classList.contains('bottom-0') && !em.classList.contains('top-1/2') && !!em.querySelector('.fx-grab'), 'abre de baixo (.fx-modal, com a alcinha), não mais no meio da tela');
  ok(hb.length === 1 && hb[0].getAttribute('data-voltar') === '' && hb[0].getAttribute('onclick') === 'cancelEdit()' && !!hb[0].querySelector('.ph-x') && T($('edit-task-heading')) === 'Editar tarefa', 'em cima: o X (o voltar toca nele) e "Editar tarefa"');
  ok($('edit-task-title').classList.contains('fx-name') && $('edit-task-title').value === 'Revisar a planta' && T($('edit-tag-val')) === tags[0].name && $('edit-tag-val').classList.contains('on') && !hid('edit-goal-wrap') && T($('edit-goal-val')) === 'Nenhuma' && T($('edit-color-val')) === 'Nenhuma', 'o nome grande e a ficha: Tag "' + tags[0].name + '", Meta "Nenhuma", Cor "Nenhuma"');
  ok(!em.querySelector('.overflow-x-auto') && !$('edit-tag-selector-container') && !$('edit-color-picker') && !$('edit-goal-pick'), 'nenhuma fileira que rola pro lado (as que cortavam)');
  ev('editPickTag()'); await tick();
  ok(pick() && T($('fx-pick-title')) === 'Tag' && opts().length === tags.length + 1 && opt(tags[0].id).getAttribute('aria-checked') === 'true', 'Tag: a folha sobe (a escolhida marcada)');
  ok($('fx-pick-modal').style.zIndex === '70' && ov().style.zIndex === '65' && !ov().classList.contains('opacity-0'), 'a folha fica por cima da janela, com o fundo escuro entre as duas (65/70)');
  opt(tags[2].id).click(); await tick();
  ok(!pick() && !hid('edit-task-modal') && T($('edit-tag-val')) === tags[2].name && $('fx-pick-modal').style.zIndex === '' && ov().style.zIndex === '' && !ov().classList.contains('opacity-0'), 'escolher fecha a folha: a janela continua, com o fundo escuro atrás dela de novo');
  ev('editPickGoal()'); await tick();
  ok(pick() && opts().length === 3, 'Meta: "Nenhuma" e as 2 metas');
  opt(G[1].id).click(); await tick();
  ok(T($('edit-goal-val')).includes(G[1].title), 'escolheu "' + G[1].title + '"');
  ev('editPickColor()'); await tick();
  ok(pick() && $('fx-pick-list').classList.contains('fx-cgrid') && opts().length === 13, 'Cor do cartão: a grade com os nomes');
  opt('#3b82f6').click(); await tick();
  ok(T($('edit-color-val')) === 'Azul', 'escolheu o azul: "Azul"');
  ev('editPickTag()'); await tick(); ev('navBack()'); await tick();
  ok(!pick() && !hid('edit-task-modal'), 'o voltar do celular com a folha aberta fecha só a folha');
  ev('editPickTag()'); await tick(); ev('onOverlayClick()'); await tick();
  ok(!pick() && !hid('edit-task-modal'), 'o toque no fundo escuro também fecha só a folha');
  $('edit-task-title').value = 'Revisar a planta do lote';
  ev('saveEditTask()'); await tick();
  const e1 = J("db.find((b) => b.id === 'f_e1')");
  ok(hid('edit-task-modal') && e1.title === 'Revisar a planta do lote' && e1.tagId === tags[2].id && e1.goalId === G[1].id && e1.color === '#3b82f6' && ov().classList.contains('opacity-0'), 'Salvar grava o nome, a tag, a meta e a cor (e fecha)');
  ev("openEditModal('f_e1')"); await tick();
  $('edit-task-title').value = 'Outro nome';
  hb[0].click(); await tick();
  ok(hid('edit-task-modal') && hid('discard-modal') && J("db.find((b) => b.id === 'f_e1').title") === 'Revisar a planta do lote', 'o X fecha sem salvar e sem perguntar (como o Cancelar de antes)');
  ev("openEditModal('f_e1')"); await tick();
  $('edit-task-title').focus(); await tick(); $('edit-task-title').value = 'Mudei'; await tick();
  ev('navBack()'); await tick();
  ok(!hid('discard-modal') && !hid('edit-task-modal'), 'com o nome mudado, o voltar pergunta "Descartar?"');
  ev('fgDiscard()'); await tick();
  ok(hid('discard-modal') && hid('edit-task-modal') && J("db.find((b) => b.id === 'f_e1').title") === 'Revisar a planta do lote', '"Descartar" fecha sem salvar');
  ev("openEditModal('f_s1')"); await tick();
  ok(T($('edit-task-heading')) === 'Editar sublista' && hid('edit-goal-wrap') && T($('edit-tag-val')) === 'Nenhuma', 'sublista: "Editar sublista", sem a Meta (quem liga é cada cartão)');
  ev('cancelEdit()'); await tick();

  console.log('\nB) Cartão da sublista:');
  const sm = $('sub-card-modal');
  ev("openSublistCard('f_s1', 'cd_a', { stopPropagation() {} })"); await tick();
  ok(!hid('sub-card-modal') && sm.classList.contains('fx-modal') && T($('sub-card-heading')) === 'Cartão da sublista' && T($('sub-card-from')) === 'Sublista: Pendências' && $('sub-card-title').classList.contains('fx-name') && $('sub-card-title').value === 'Pagar o boleto', 'abre de baixo: "Cartão da sublista", "Sublista: Pendências" e o nome grande');
  ok(T($('sub-card-tag-val')) === tags[1].name && !hid('sub-card-goal-wrap') && T($('sub-card-goal-val')) === 'Nenhuma' && T($('sub-card-color-val')) === 'Nenhuma', 'a ficha: Tag "' + tags[1].name + '", Meta e Cor "Nenhuma"');
  const ck = () => [...$('sub-card-mbs').querySelectorAll('.fx-ckrow')];
  ok(ck().length === 2 && ck()[0].querySelector('.fx-ck.on') && ck()[0].querySelector('.fx-cktx.done') && !ck()[1].querySelector('.fx-ck.on') && T($('sub-card-ck-sec')) === 'Checklist · 1 de 2', 'o checklist com a bolinha de feito: "Checklist · 1 de 2"');
  ok(!sm.querySelector('.overflow-x-auto') && !$('sub-card-tags') && !$('sub-card-colors') && !$('sub-card-del') && ![...sm.querySelectorAll('button')].some((b) => /Cancelar|Voltar pra lista|Apagar cart/.test(T(b))), 'nada que rola pro lado; Cancelar, Voltar pra lista e Apagar saíram da janela');
  ck()[1].querySelector('.fx-ck').click(); await tick();
  ok(T($('sub-card-ck-sec')) === 'Checklist · 2 de 2' && !!ck()[1].querySelector('.fx-ck.on'), 'tocar na bolinha marca o item ("2 de 2")');
  $('sub-card-mb-new').value = 'Guardar o comprovante';
  $('sub-card-mb-new').dispatchEvent(new w.KeyboardEvent('keypress', { key: 'Enter', bubbles: true })); await tick();
  ok(ck().length === 3 && T(ck()[2]) === 'Guardar o comprovante' && $('sub-card-mb-new').value === '', 'Enter no "Adicionar item" põe o item no fim');
  ck()[0].querySelector('.fx-x').click(); await tick();
  ok(ck().length === 2 && T(ck()[0]) === 'Agendar', 'o x tira o item');
  ev('subCardPickTag()'); await tick();
  ok(pick() && $('fx-pick-modal').style.zIndex === '70' && opt(tags[1].id).getAttribute('aria-checked') === 'true', 'Tag: a folha por cima da janela, a tag dele marcada');
  opt('').click(); await tick();
  ok(T($('sub-card-tag-val')) === 'Nenhuma' && !hid('sub-card-modal'), '"Nenhuma" tira a tag');
  ev('subCardPickGoal()'); await tick(); opt(G[0].id).click(); await tick();
  ok(T($('sub-card-goal-val')).includes(G[0].title) && $('sub-card-title').placeholder === G[0].title, 'Meta: "' + G[0].title + '" (o nome dela clarinho no campo, V40.36.1)');
  ev('subCardPickColor()'); await tick(); opt('#ef4444').click(); await tick();
  ok(T($('sub-card-color-val')) === 'Vermelho', 'Cor: "Vermelho"');
  ev('saveSubCard()'); await tick();
  const ca = J("db.find((b) => b.id === 'f_s1').cards.find((c) => c.id === 'cd_a')");
  ok(hid('sub-card-modal') && !ca.tagId && ca.goalId === G[0].id && ca.color === '#ef4444' && JSON.stringify(ca.microblocks.map((m) => [m.title, m.done])) === JSON.stringify([['Agendar', true], ['Guardar o comprovante', false]]) && toasts().slice(-1)[0] === 'Cartão salvo!', 'Salvar grava a tag, a meta, a cor e o checklist');
  ev("openSublistCard('f_s1', 'cd_b', { stopPropagation() {} })"); await tick();
  ok(ck().length === 0 && T($('sub-card-ck-sec')) === 'Checklist', 'cartão sem checklist: só o "Adicionar item"');
  ev('subCardMore()'); await tick();
  ok(pick() && opts().map(T).join() === 'Voltar pra lista,Apagar cartão' && opt('apagar').classList.contains('danger') && $('fx-pick-modal').style.zIndex === '70', 'o ⋯: "Voltar pra lista" e "Apagar cartão" (vermelho)');
  opt('apagar').click(); await tick();
  ok(hid('sub-card-modal') && !pick() && J("db.find((b) => b.id === 'f_s1').cards.map((c) => c.id)").join() === 'cd_a' && toasts().slice(-1)[0] === 'Cartão apagado.' && ov().classList.contains('opacity-0') && ov().style.zIndex === '', '"Apagar cartão" apaga (o ⋯ e a escolha são os 2 toques), fecha tudo e o fundo some');
  ev("openSublistCard('f_s1', 'cd_a', { stopPropagation() {} })"); await tick();
  ev('subCardMore()'); await tick();
  const nB = J('backlogDb.length');
  opt('lista').click(); await sleep(30);
  ok(hid('sub-card-modal') && J("db.find((b) => b.id === 'f_s1').cards.length") === 0 && J('backlogDb.length') === nB + 1 && J('backlogDb[backlogDb.length - 1].title') === 'Pagar o boleto', '"Voltar pra lista": o cartão sai da sublista e vai pra Lista');
  ev("db.find((b) => b.id === 'f_s1').cards.push({ id: 'cd_c', title: 'Outro', done: false, microblocks: [] }); saveDb(); openSublistCard('f_s1', 'cd_c', { stopPropagation() {} })"); await tick();
  ev('subCardMore()'); await tick(); ev('navBack()'); await tick();
  ok(!pick() && !hid('sub-card-modal'), 'o voltar com o ⋯ aberto fecha só o ⋯');
  ev('navBack()'); await tick();
  ok(hid('sub-card-modal'), 'o voltar de novo fecha o cartão');

  console.log('\nC) O resto:');
  ok(/\.fx-modal \{ max-height: 92%; border-radius: 22px 22px 0 0; background: #f8fafc;/.test(css) && /V40\.51\.2 — O EDITAR DA AGENDA E O CARTÃO DA SUBLISTA NA FICHA/.test(css) && /V40\.51\.2: EDITAR NA AGENDA na FICHA/.test(html), 'o CSS (.fx-modal) e os comentários da V40.51.2');
  ok(A.errors.length === 0, 'sem erro no celular' + (A.errors.length ? ': ' + A.errors[0] : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1); });
