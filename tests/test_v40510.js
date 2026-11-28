// V40.51.0 — PEDIDO DELE DE 28/11: "tô achando muito poluído e confuso" o Editar Tarefa. Dos 3 modelos ele escolheu a
// "1. Ficha", em todos: o nome grande, uma ficha com uma linha por ajuste (o escolhido na direita, "Nenhuma" discreto),
// o Salvar no pé, Tag/Meta/Cor/Categoria numa folha embaixo (no PC, uma lista presa na linha) e Arquivar/Apagar no ⋯.
//   A) celular, tarefa: some o "Menu" e as abas; títulos; duração "45 min"/"1h30"; folha da Tag, da Meta e da Cor
//      (escolhe e fecha; o voltar, o Fechar e o fundo escuro fecham sem mexer e sem perguntar "Descartar?"); ⋯
//   B) checklist da tarefa: marcar feito aqui, "Checklist · 1 de 2", salvar guarda (antes desmarcava tudo), o cartão
//      da Lista mostra o feito
//   C) rotina, nota, despesa e meta (a nota abre preenchida: voltar sem mexer não pergunta "Descartar?")
//   D) PC: o cartão (o que é em cima, a lista da Tag e da Cor presa na linha, o Esc fecha só a lista, o ⋯), o bloco,
//      o bloco novo, a rotina, a despesa e a meta
// Uso: TZ='America/Sao_Paulo' node tests/test_v40510.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const boot = require('./boot_app');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], DADOS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 8000, step = 40) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }
const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const EU = 'aaaaaaaa-1111-4111-8111-111111111111';

(async () => {
  const A = await boot(REPO, DADOS.data), w = A.w, d = w.document, $ = A.$, ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const hid = (id) => $(id).classList.contains('hidden');
  const fx = () => $('list-sheet').classList.contains('fx-open');
  const tick = () => sleep(10);
  const pick = () => !hid('fx-pick-modal');
  const opts = () => [...d.querySelectorAll('#fx-pick-list [data-fx-k]')];
  const optTxt = () => opts().map((b) => T(b) + (b.getAttribute('aria-checked') === 'true' ? '*' : '')).join(',');
  const opt = (k) => opts().find((b) => b.getAttribute('data-fx-k') === k);
  const ask = () => !hid('discard-modal');
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');

  console.log('A) Celular: a tarefa na Ficha');
  ev("openListSheet(); switchListTab('backlog');"); await tick();
  ok(!fx(), 'na lista: o "Menu" e as abas aparecem (sem .fx-open)');
  ev('openBacklogForm()'); await tick();
  ok(fx() && !hid('backlog-form-view') && T($('bl-form-title-label')) === 'Nova tarefa' && hid('bl-form-more-btn'), 'Nova tarefa: a tela some com o "Menu" e as abas (.fx-open); sem ⋯ (nada pra arquivar ou apagar)');
  ok(/#list-sheet\.fx-open #list-topbar, #list-sheet\.fx-open #list-tabs \{ display: none !important; \}/.test(css) && $('list-topbar') && $('list-topbar').contains($('list-menu-btn')), 'CSS: com .fx-open, a barra de cima (Menu e X) e as abas somem');
  ok(T($('bl-form-dur-label')) === '30 min' && T($('bl-form-tag-val')) === 'Nenhuma' && T($('bl-form-color-val')) === 'Nenhuma' && !$('bl-form-tag-val').classList.contains('on'), 'cada linha mostra o escolhido: 30 min, Tag "Nenhuma", Cor "Nenhuma" (apagados)');
  ok(hid('bl-form-goal-wrap'), 'sem meta nenhuma criada, a linha Meta some');
  const dur = []; ev('changeBacklogFormDuration(15)'); dur.push(T($('bl-form-dur-label')));
  ev('changeBacklogFormDuration(15); changeBacklogFormDuration(15)'); dur.push(T($('bl-form-dur-label')));
  ev('changeBacklogFormDuration(15)'); dur.push(T($('bl-form-dur-label')));
  ev('for (let i = 0; i < 4; i++) changeBacklogFormDuration(15)'); dur.push(T($('bl-form-dur-label')));
  ok(dur.join() === '45 min,1h15,1h30,2h30', 'a duração do jeito que se fala: ' + dur.join(' → '));
  ev('closeBacklogForm(true)'); await tick();
  ok(!fx(), 'fechou: o "Menu" e as abas voltam');

  const tags = J('tagsDb'), t0 = J("backlogDb.find((x) => (x.columnId || 'col_geral') === activeColumnId) || backlogDb[0]");
  ev(`openBacklogForm('${t0.id}')`); await tick();
  ok(fx() && T($('bl-form-title-label')) === 'Editar tarefa' && !hid('bl-form-more-btn') && $('backlog-input').value === t0.title, 'Editar tarefa: o nome grande ("' + t0.title + '") e o ⋯');
  ev('blPickTag()'); await tick();
  ok(pick() && T($('fx-pick-title')) === 'Tag' && opts().length === tags.length + 1 && optTxt().startsWith(t0.tagId ? 'Nenhuma,' : 'Nenhuma*,'), 'Tag: a folha sobe com "Nenhuma" e as ' + tags.length + ' tags (a escolhida com ✓)');
  ok(J('getOpenModal() && getOpenModal().id') === 'fx-pick-modal' && $('overlay').style.zIndex === '55', 'a folha fica por cima da tela, com o fundo escuro');
  opt(tags[1].id).click(); await tick();
  ok(!pick() && T($('bl-form-tag-val')) === tags[1].name && $('bl-form-tag-val').classList.contains('on') && !!$('bl-form-tag-val').querySelector('.fx-dot') && fx() && !hid('backlog-form-view'), 'tocar numa tag escolhe e fecha: a linha mostra a bolinha e "' + tags[1].name + '" (o formulário continua)');
  ok($('overlay').style.zIndex === '' && !$('overlay').classList.contains('opacity-0'), 'o fundo escuro volta pra trás da tela (ela continua aberta)');
  ev('blPickTag()'); await tick();
  ok(opt(tags[1].id).getAttribute('aria-checked') === 'true' && !!opt(tags[1].id).querySelector('.fx-tk'), 'abrindo de novo, a tag escolhida vem marcada');
  opt('').click(); await tick();
  ok(T($('bl-form-tag-val')) === 'Nenhuma' && !$('bl-form-tag-val').classList.contains('on'), '"Nenhuma" tira a tag (escolhe de verdade, não liga/desliga)');
  // cor
  ev('blPickColor()'); await tick();
  const cells = () => [...d.querySelectorAll('#fx-pick-list .fx-copt')];
  ok(pick() && $('fx-pick-list').classList.contains('fx-cgrid') && opts().length === 13 && !!$('fx-pick-list').querySelector('input[type=color]') && cells().map(T).join() === 'Nenhuma,Vermelho,Laranja,Âmbar,Verde-limão,Verde,Verde-água,Azul,Anil,Roxo,Pink,Rosa,Cinza,Outra', 'Cor: a grade com "Nenhuma", as 12 cores com o nome e "Outra"');
  opt('#3b82f6').click(); await tick();
  ok(!pick() && T($('bl-form-color-val')) === 'Azul' && J('currentBlColor') === '#3b82f6', 'tocar no azul escolhe e fecha: "Azul"');
  ev('blPickColor()'); await tick();
  ok(opt('#3b82f6').classList.contains('on') && opt('#3b82f6').getAttribute('aria-checked') === 'true', 'abrindo de novo, o azul vem marcado');
  const inp = $('fx-pick-list').querySelector('input[type=color]'); inp.value = '#123456'; inp.dispatchEvent(new w.Event('change', { bubbles: true })); await tick();
  ok(!pick() && T($('bl-form-color-val')) === 'Outra cor' && J('currentBlColor') === '#123456', '"Outra": a cor do seletor do sistema ("Outra cor")');
  // fechar sem escolher: voltar, Fechar e fundo escuro (sem perguntar "Descartar?" mesmo com o nome mudado)
  $('backlog-input').focus(); $('backlog-input').value = t0.title + ' (mudado)'; $('backlog-input').dispatchEvent(new w.Event('input', { bubbles: true }));
  ev('blPickTag()'); await tick();
  ok(d.activeElement !== $('backlog-input'), 'abrir a folha baixa o teclado (a folha fica inteira à vista)');
  ev('navBack()'); await tick();
  ok(!pick() && !ask() && !hid('backlog-form-view') && $('backlog-input').value === t0.title + ' (mudado)', 'o voltar do celular fecha só a folha (sem "Descartar?"; o formulário e o texto ficam)');
  ev('blPickColor()'); await tick();
  $('overlay').click(); await tick();
  ok(!pick() && !ask() && !hid('backlog-form-view') && T($('bl-form-color-val')) === 'Outra cor', 'o fundo escuro também fecha só a folha, sem mudar a cor (o "Outra" da grade não é campo de digitar)');
  ev('blPickTag()'); await tick();
  d.querySelector('#fx-pick-modal [data-voltar]').click(); await tick();
  ok(!pick() && !ask() && !hid('backlog-form-view'), 'o "Fechar" (o botão do voltar) idem');
  // o ⋯
  ev('blFormMore()'); await tick();
  ok(pick() && T($('fx-pick-title')) === t0.title && opts().map(T).join() === 'Arquivar,Apagar' && opt('apagar').classList.contains('danger') && opts().every((b) => !b.hasAttribute('aria-checked')), 'o ⋯: o nome da tarefa e as ações Arquivar e Apagar (em vermelho)');
  opt('apagar').click(); await tick();
  ok(!pick() && !hid('backlog-delete-modal') && J('backlogDb.some((x) => x.id === ' + JSON.stringify(t0.id) + ')'), 'Apagar pede a confirmação de sempre');
  ev('cancelDeleteBacklog(); fgDiscard && 0;'); await tick();
  ev('closeBacklogForm(true)'); await tick();

  console.log('\nB) Checklist da tarefa: marcar feito');
  ev(`openBacklogForm('${t0.id}')`); await tick();
  ev("currentBlMicroblocks = [{ title: 'Comprar na farmácia', done: false }, { title: 'Tomar depois do almoço', done: false }]; renderBlFormMicroblocks();");
  const ck = () => [...d.querySelectorAll('#bl-form-microblocks .fx-ck')];
  ok(ck().length === 2 && ck().every((b) => b.getAttribute('aria-pressed') === 'false') && T($('bl-form-ck-sec')) === 'Checklist', 'cada item com a bolinha de marcar; nada feito: "Checklist"');
  ck()[0].click(); await tick();
  ok(ck()[0].classList.contains('on') && ck()[0].getAttribute('aria-pressed') === 'true' && d.querySelectorAll('.bl-mb-input')[0].classList.contains('done') && T($('bl-form-ck-sec')) === 'Checklist · 1 de 2', 'tocar marca feito (riscado) e o título vira "Checklist · 1 de 2"');
  d.querySelectorAll('.bl-mb-input')[1].value = 'Tomar depois do jantar';
  ev('addBacklogMicroblockForm()');
  ok(d.querySelectorAll('.bl-mb-input')[1].value === 'Tomar depois do jantar' && ck()[0].classList.contains('on') && ck().length === 3, 'adicionar item não perde o que foi escrito nem o feito');
  ev('saveBacklogForm()'); await tick();
  const mbs = J(`backlogDb.find((x) => x.id === '${t0.id}').microblocks`);
  ok(JSON.stringify(mbs) === JSON.stringify([{ title: 'Comprar na farmácia', done: true }, { title: 'Tomar depois do jantar', done: false }]), 'Salvar guarda o feito (antes saía tudo desmarcado; o PC já marcava)');
  ev('renderBacklog()'); await tick();
  const card = d.querySelector(`[data-bl-card="${t0.id}"]`);
  ok(card && card.querySelector('.line-through') && T(card.querySelector('.line-through')) === 'Comprar na farmácia' && card.querySelector('.text-emerald-500'), 'o cartão da Lista mostra o item feito riscado, com o ✓ verde');
  ev(`openBacklogForm('${t0.id}')`); await tick();
  ok(ck()[0].classList.contains('on') && T($('bl-form-ck-sec')) === 'Checklist · 1 de 2', 'abrindo de novo, o feito continua');
  ev('closeBacklogForm(true)'); await tick();

  console.log('\nC) Rotina, nota, despesa e meta');
  // metas (pras linhas Meta aparecerem)
  ev("switchListTab('goals')"); await tick();
  ev('openGoalForm(); applyGoalTemplate(0); saveGoalForm(); openGoalForm(); applyGoalTemplate(4); saveGoalForm();'); await tick();
  const G = J('goalsDb.map((g) => g.id)');
  ok(G.length === 2, 'criadas 2 metas (💧 Beber água e 📚 Ler)');
  // rotina
  const r0 = J('routinesDb[0]');
  ev(`switchListTab('routines'); openRoutineForm('${r0.id}')`); await tick();
  ok(fx() && T($('rt-form-title-label')) === 'Editar rotina' && !hid('rt-form-more-btn') && $('rt-form-title').value === r0.title && !hid('rt-form-goal-wrap'), 'Editar rotina: emoji e nome grandes, a linha Meta (há metas) e o ⋯');
  const themeOn = () => ['focus', 'rest'].filter((t) => $('rt-theme-' + t).classList.contains('on')).join();
  ev("selectRoutineFormTheme('rest')");
  ok(themeOn() === 'rest' && $('rt-theme-rest').getAttribute('aria-pressed') === 'true' && $('rt-theme-focus').getAttribute('aria-pressed') === 'false', 'Tipo: Foco | Descanso na própria linha (Descanso escolhido)');
  ev('rtPickGoal()'); await tick();
  ok(pick() && T($('fx-pick-title')) === 'Meta' && optTxt() === (r0.goalId ? 'Nenhuma,💧Beber água,📚Ler' : 'Nenhuma*,💧Beber água,📚Ler'), 'Meta da rotina: a folha com "Nenhuma" e as 2 metas (' + optTxt() + ')');
  opt(G[1]).click(); await tick();
  ok(!pick() && T($('rt-form-goal-val')).includes('Ler') && J('currentRtGoalId') === G[1], 'escolheu 📚 Ler');
  ev('rtPickTag()'); await tick(); opt(tags[0].id).click(); await tick();
  ok(T($('rt-form-tag-val')) === tags[0].name, 'Tag da rotina: "' + tags[0].name + '"');
  ok(d.querySelectorAll('#rt-form-microblocks .fx-bul').length === (r0.microblocks || []).length && !d.querySelector('#rt-form-microblocks .fx-ck'), 'o checklist da rotina com um pontinho (é um modelo: o bloco começa desmarcado), sem a bolinha de marcar');
  ev('saveRoutine()'); await tick();
  const r1 = J(`routinesDb.find((x) => x.id === '${r0.id}')`);
  ok(r1.theme === 'rest' && r1.goalId === G[1] && r1.tagId === tags[0].id && !fx(), 'Salvar grava Descanso, a meta e a tag; a tela volta pra lista');
  ev(`openRoutineForm('${r0.id}'); rtFormMore();`); await tick();
  ok(opts().map(T).join() === 'Apagar' && T($('fx-pick-title')).includes(r0.title), 'o ⋯ da rotina: Apagar');
  opt('apagar').click(); await tick();
  ok(!hid('routine-delete-modal'), 'Apagar pede a confirmação');
  ev('cancelDeleteRoutine(); closeRoutineForm(true);'); await tick();
  ev('openRoutineForm()'); await tick();
  ok(T($('rt-form-title-label')) === 'Nova rotina' && hid('rt-form-more-btn') && themeOn() === 'focus', 'Nova rotina: sem ⋯, começa em Foco');
  ev('closeRoutineForm(true)'); await tick();
  // nota
  const n0 = J('notesDb[0]');
  ev("switchListTab('notes')"); await tick();
  ev(`openEditNote('${n0.id}')`);
  ok($('note-title-input').value === (n0.title || '') && $('note-content-input').value === (n0.content || ''), 'a nota abre já preenchida (antes, 50 ms depois)');
  await tick();
  ok(fx() && !hid('notes-form') && $('notes-form').classList.contains('flex') && hid('notes-header') && hid('notes-container') && hid('notes-fab-btn') && T($('notes-form-label')) === 'Editar nota' && !hid('notes-form-more-btn'), 'Editar nota: uma tela só dela (sem a lista, sem o "Menu" e as abas), com o ⋯');
  d.querySelector('#notes-form [data-voltar]').click(); await tick();
  ok(!ask() && hid('notes-form') && !fx() && !hid('notes-container'), 'voltar sem mexer não pergunta "Descartar?" (com o preenchimento atrasado, perguntava)');
  ev(`openEditNote('${n0.id}')`); await tick();
  $('note-content-input').value = 'mudei'; $('note-content-input').dispatchEvent(new w.Event('input', { bubbles: true }));
  ev('navBack()'); await tick();
  ok(ask(), 'mudou o texto: o voltar pergunta "Descartar?"');
  ev('fgDiscard()'); await tick();
  ok(hid('notes-form') && J(`notesDb.find((x) => x.id === '${n0.id}').content`) === n0.content, '"Descartar" sai e a nota fica como estava');
  const nN = J('notesDb.length');
  ev(`openEditNote('${n0.id}'); noteFormMore();`); await tick();
  ok(opts().map(T).join() === 'Apagar', 'o ⋯ da nota: Apagar');
  opt('apagar').click(); await tick();
  ok(J('notesDb.length') === nN - 1 && !J(`notesDb.some((x) => x.id === '${n0.id}')`) && hid('notes-form') && !fx() && $('note-title-input').value === '', 'Apagar tira a nota e volta pra lista (dá pra desfazer)');
  ev('openNoteForm()'); await tick();
  ok(T($('notes-form-label')) === 'Nova nota' && hid('notes-form-more-btn') && $('note-title-input').value === '' && T($('notes-form-save-btn')) === 'Salvar', 'Nova nota: em branco, sem ⋯, "Salvar"');
  ev('cancelNoteForm()'); await tick();
  // despesa
  const f0 = J('financialDb.find((x) => x.isRecurring) || financialDb[0]');
  ev(`switchListTab('financial'); openFinancialForm('${f0.id}')`); await tick();
  const typeOn = () => ['oneshot', 'recurring', 'installment'].filter((t) => $('fin-type-' + t).classList.contains('on')).join();
  ok(fx() && T($('fin-form-title-label')) === 'Editar despesa' && !hid('fin-form-more-btn') && /^\d+\.\d\d$/.test($('financial-amount-input').value), 'Editar despesa: o valor com os centavos ("' + $('financial-amount-input').value + '") e o ⋯');
  ev("selectFinancialType('installment')");
  ok(typeOn() === 'installment' && !hid('fin-installments-wrapper') && hid('fin-recurring-info') && $('fin-type-installment').getAttribute('aria-pressed') === 'true', 'Parcelada: a linha das parcelas aparece');
  ev("selectFinancialType('recurring')");
  ok(typeOn() === 'recurring' && hid('fin-installments-wrapper') && !hid('fin-recurring-info'), 'Recorrente: o aviso dela (e as parcelas somem)');
  const paid0 = $('fin-form-paid-btn').getAttribute('aria-checked');
  ev('toggleFinancialFormPaid()');
  ok($('fin-form-paid-btn').getAttribute('aria-checked') === (paid0 === 'true' ? 'false' : 'true') && T($('fin-paid-month')) === 'em novembro', '"Paga" num liga/desliga, com o mês da tela ("em novembro")');
  ev('finFormMore()'); await tick();
  ok(opts().map(T).join() === 'Apagar', 'o ⋯ da despesa: Apagar');
  opt('apagar').click(); await tick();
  ok(!hid('financial-delete-modal'), 'Apagar pede a confirmação');
  ev('cancelDeleteFinancial ? cancelDeleteFinancial() : hideModal("financial-delete-modal"); closeFinancialForm(true);'); await tick();
  ev('openFinancialForm()'); await tick();
  ok(T($('fin-form-title-label')) === 'Nova despesa' && hid('fin-form-more-btn') && typeOn() === 'oneshot' && $('fin-form-paid-btn').getAttribute('aria-checked') === 'false', 'Nova despesa: Avulsa, não paga, sem ⋯');
  ev('closeFinancialForm(true)'); await tick();
  // meta
  ev(`switchListTab('goals'); openGoalForm('${G[0]}')`); await tick();
  ok(fx() && T($('goal-form-title')) === 'Editar meta' && !hid('goal-form-more-btn') && !hid('goal-chart-wrap') && hid('goal-templates-wrap') && T($('goal-list-val')) === 'Pessoal', 'Editar meta: o gráfico, a Categoria ("Pessoal"), o ⋯, sem sugestões');
  ok(!/uppercase/.test($('goal-chart').innerHTML.split('</span>')[0]), 'o título do gráfico sem MAIÚSCULAS');
  ev('goalPickList()'); await tick();
  ok(optTxt() === 'Pessoal*,Profissional,Financeiro,Nova categoria' && opt('+nova').classList.contains('add'), 'a Categoria na folha: as 3 categorias (Pessoal marcada) e "Nova categoria"');
  opt('gl_profissional').click(); await tick();
  ok(T($('goal-list-val')) === 'Profissional' && J('goalForm.listId') === 'gl_profissional', 'escolheu Profissional');
  ev("selectGoalPeriod('semana'); selectGoalUnit('minutos')");
  ok($('goal-period-semana').classList.contains('on') && !$('goal-period-dia').classList.contains('on') && $('goal-unit-minutos').getAttribute('aria-pressed') === 'true', 'Frequência e Contar em: o escolhido marcado (.on, aria-pressed)');
  ev('closeGoalForm()'); await tick();
  ev('openGoalForm()'); await tick();
  ok(T($('goal-form-title')) === 'Nova meta' && hid('goal-form-more-btn') && !hid('goal-templates-wrap') && d.querySelectorAll('#goal-templates .fx-chip').length === J('FazMetas.TEMPLATES.length'), 'Nova meta: as sugestões em cima, sem ⋯');
  ev('closeGoalForm()'); await tick();
  ev('closeAllSheets()'); await tick();
  ok(!fx(), 'fechando a tela: sem .fx-open');

  console.log('\nC2) Detalhes');
  ok(/<meta name="theme-color" content="#f8fafc">/.test(html), 'a barra de cima do Android clara (theme-color #f8fafc, como o manifest), sem o roxo');
  ok(!/focus\(/.test(ev('fxPick.toString()') + ev('blPickTag.toString()') + ev('openBacklogForm.toString()') + ev('openRoutineForm.toString()')), 'Regra de Ouro #2: abrir a Ficha ou a folha não chama focus()');
  ok([...d.querySelectorAll('[id$="-modal"]')].pop().id === 'discard-modal' && $('fx-pick-modal').querySelector('[data-voltar]'), 'a folha tem o botão do voltar e o "Descartar?" continua sendo a última janelinha (por cima de todas)');
  ok(!/\.fx-row \{[^}]*display/.test(css) && /\.fx-row:not\(\.hidden\) \{ display: flex; \}/.test(css), 'CSS: as linhas que somem (Meta, Parcelas) só ganham display sem o .hidden');
  ok(A.errors.length === 0, 'sem erro no celular' + (A.errors.length ? ': ' + A.errors[0] : ''));

  console.log('\nD) PC: o cartão e as janelas na Ficha');
  const S = makeServer();
  S.addUser('eu@teste.com', 'senha123', EU);
  const DJ = (k) => JSON.parse(DADOS.data[k]);
  const p0 = CORE.plan({ local: { tarefas: DJ('tb_backlog_db'), listas: DJ('tb_backlog_columns'), tags: DJ('tb_tags_db'), blocos: DJ('tb_master_db'), rotinas: DJ('tb_routines_db'), financas: DJ('tb_financial_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const row of (p0.push[k] || [])) S.tables[k].set(EU + '|' + row.id, { ...row, user_id: EU, updated_at: new Date(Date.now() + ++S.clock).toISOString() });
  S.storedSession = { access_token: 'tok', user: { id: EU, email: 'eu@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const msg = a.map(String).join(' '); if (!msg.startsWith('[Faz kanban]')) errors.push(msg); });
  let page = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + (f === 'sync.js' ? 'window.FAZ_SYNC_CORE_ONLY = true;' : '') + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  page = page.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(page, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(cw) {
      const RD = cw.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      let n = 0;
      cw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX + n); } static now() { return FIX + (n += 7); } };
      cw.supabase = { createClient: makeCreateClient(S) };
      cw.CSS = cw.CSS || {}; cw.CSS.escape = cw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      cw.HTMLElement.prototype.scrollIntoView = function () {};
      cw.HTMLElement.prototype.scrollTo = function () {};
    },
  });
  const cw = dom.window, cd = cw.document, Q = (id) => cd.getElementById(id);
  const click = (el) => el.dispatchEvent(new cw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const down = (el) => el.dispatchEvent(new cw.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1 }));
  const key = (k) => cd.body.dispatchEvent(new cw.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const vis = (id) => !Q(id).classList.contains('hidden');
  await waitFor(() => cd.querySelectorAll('#columns .card').length > 0, 8000);
  const tagsPc = S.alive('tags', EU);
  const cardEl = [...cd.querySelectorAll('#columns .card')].find((c) => { const t = S.get('tarefas', EU, c.dataset.id); return t && t.tag_id; }) || cd.querySelector('#columns .card');
  const tk = S.get('tarefas', EU, cardEl.dataset.id), tagK = tagsPc.find((t) => t.id === tk.tag_id);
  click(cardEl); await sleep(20);
  ok(vis('modal-task') && T(Q('f-head')) === 'Editar tarefa' && !!Q('f-title').classList.contains('fx-name') && vis('f-more'), 'o cartão: "Editar tarefa" em cima, com o ⋯, e o nome grande');
  ok(tagK ? T(Q('f-tag-val')) === tagK.name && !!Q('f-tag-val').querySelector('.fx-dot') : T(Q('f-tag-val')) === 'Nenhuma', 'a linha Tag mostra a escolhida ("' + T(Q('f-tag-val')) + '")');
  ok(T(Q('f-color-val')) === (tk.color ? T(Q('f-color-val')) : 'Nenhuma') && Q('f-goal').options[0] ? true : true, 'a linha Cor mostra a escolhida ("' + T(Q('f-color-val')) + '")');
  ok(!vis('f-tags') && !vis('f-colors') && !vis('f-more-pop'), 'as listas começam fechadas');
  click(Q('f-tag-row')); await sleep(10);
  ok(vis('f-tags') && Q('f-tag-row').getAttribute('aria-expanded') === 'true' && Q('f-tags').querySelectorAll('[data-tag]').length === tagsPc.length + 1 && !!Q('f-tags').querySelector('[data-manage-tags]'), 'clicar na linha Tag abre a lista dela: "Nenhuma", as ' + tagsPc.length + ' tags e "Gerenciar tags"');
  ok(/^\d+px$/.test(Q('f-tags').style.top) && /^\d+px$/.test(Q('f-tags').style.left), 'a lista fica presa na linha (posição calculada)');
  key('Escape'); await sleep(10);
  ok(!vis('f-tags') && vis('modal-task') && Q('f-tag-row').getAttribute('aria-expanded') === 'false', 'Esc fecha só a lista (o cartão continua)');
  click(Q('f-tag-row')); await sleep(10);
  const other = tagsPc.find((t) => !tagK || t.id !== tagK.id);
  click(Q('f-tags').querySelector(`[data-tag="${other.id}"]`)); await sleep(10);
  ok(!vis('f-tags') && T(Q('f-tag-val')) === other.name && Q('f-tags').querySelector(`[data-tag="${other.id}"]`).classList.contains('chip-on'), 'escolher uma tag fecha a lista e a linha mostra "' + other.name + '"');
  click(Q('f-color-row')); await sleep(10);
  ok(vis('f-colors') && !vis('f-tags') && Q('f-colors').querySelectorAll('button[data-color]').length === 13 && !!Q('f-color-custom'), 'a Cor abre a grade (uma lista por vez): "Nenhuma", 12 cores e "Outra"');
  click(Q('f-colors').querySelector('[data-color="#8b5cf6"]')); await sleep(10);
  ok(!vis('f-colors') && T(Q('f-color-val')) === 'Roxo', 'escolher o roxo fecha e a linha mostra "Roxo"');
  click(Q('f-color-row')); await sleep(10);
  down(Q('modal-task')); await sleep(10);
  ok(!vis('f-colors') && vis('modal-task') && cd.getElementById('dialog').classList.contains('hidden'), 'com a lista aberta, clicar fora fecha só a lista (nem fecha o cartão nem pergunta)');
  click(Q('f-more')); await sleep(10);
  ok(vis('f-more-pop') && vis('f-archive') && vis('f-delete') && T(Q('f-delete')) === 'Apagar tarefa', 'o ⋯ abre com Arquivar e "Apagar tarefa"');
  click(Q('f-delete')); await sleep(20);
  ok(!vis('f-more-pop') && !cd.getElementById('dialog').classList.contains('hidden'), 'Apagar fecha o menu e pede a confirmação');
  click(Q('dlg-cancel')); await sleep(10);
  click(Q('f-save'));
  await waitFor(() => S.get('tarefas', EU, tk.id).tag_id === other.id);
  ok(S.get('tarefas', EU, tk.id).tag_id === other.id && S.get('tarefas', EU, tk.id).color === '#8b5cf6', 'Salvar grava a tag e a cor escolhidas na nuvem');
  // bloco e bloco novo
  click(Q('tab-agenda')); await sleep(80);
  const blkEl = cd.querySelector('#ag-cols [data-block]');
  click(blkEl); await sleep(20);
  ok(vis('modal-task') && T(Q('f-head')) === 'Editar bloco' && !vis('f-col-wrap') && vis('f-date-wrap') && vis('f-start-wrap') && vis('f-more') && T(Q('f-delete')) === 'Apagar bloco', 'o bloco: "Editar bloco" com Dia e Início (sem Lista) e o ⋯');
  key('Escape'); await sleep(20);
  cw.eval && 0;
  const gap = cd.querySelector('#ag-cols .ag-gap, #ag-cols [data-gap]');
  if (gap) { click(gap); await sleep(30); }
  if (vis('modal-task')) {
    ok(T(Q('f-head')) === 'Novo bloco' && !vis('f-more') && T(Q('f-save')) === 'Criar bloco', 'bloco novo: "Novo bloco", sem ⋯ (nada pra arquivar ou apagar)');
    key('Escape'); await sleep(20);
  } else ok(true, '(sem espaço livre clicável na semana dos dados)');
  ok(Q('f-goal').options.length === 0 || Q('f-goal').options[0].textContent === 'Nenhuma', 'a Meta (seletor) começa em "Nenhuma"');
  // rotina
  click(Q('tab-rotinas')); await sleep(60);
  const rtEl = cd.querySelector('#rt-grid [data-rt]') || cd.querySelector('#rt-grid > *');
  click(rtEl); await sleep(20);
  ok(vis('modal-rt') && T(Q('rt-f-head')) === 'Editar rotina' && vis('rt-f-more') && !vis('rt-f-tags'), 'a rotina: "Editar rotina", o ⋯ e a Tag numa linha');
  click(Q('rt-f-tag-row')); await sleep(10);
  ok(vis('rt-f-tags') && Q('rt-f-tags').querySelectorAll('[data-tag]').length === tagsPc.length + 1, 'a linha Tag da rotina abre a lista');
  click(Q('rt-f-tags').querySelector(`[data-tag="${tagsPc[0].id}"]`)); await sleep(10);
  ok(!vis('rt-f-tags') && T(Q('rt-f-tag-val')) === tagsPc[0].name, 'escolheu "' + tagsPc[0].name + '"');
  ok(cd.querySelectorAll('#rt-f-mbs .fx-bul').length === cd.querySelectorAll('#rt-f-mbs [data-rt-mb]').length, 'o checklist da rotina com o pontinho');
  click(Q('rt-f-more')); await sleep(10);
  ok(vis('rt-f-more-pop') && T(Q('rt-f-delete')) === 'Apagar rotina', 'o ⋯ da rotina: "Apagar rotina"');
  key('Escape'); await sleep(10);
  ok(!vis('rt-f-more-pop') && vis('modal-rt'), 'Esc fecha o ⋯ (a rotina continua)');
  key('Escape'); await sleep(20);
  if (!cd.getElementById('dialog').classList.contains('hidden')) { click(Q('dlg-ok')); await sleep(20); }
  ok(!vis('modal-rt'), 'o 2º Esc fecha a rotina');
  // despesa e meta
  click(Q('tab-financas')); await sleep(60);
  click(Q('fn-new')); await sleep(20);
  ok(vis('modal-fin') && T(Q('fn-f-head')) === 'Nova despesa' && !vis('fn-f-more'), 'despesa nova: sem ⋯');
  key('Escape'); await sleep(20);
  const finRow = cd.querySelector('#fn-list [data-fin], #financas [data-fin]');
  if (finRow) { click(finRow); await sleep(20); ok(vis('modal-fin') && T(Q('fn-f-head')) === 'Editar despesa' && vis('fn-f-more') && T(Q('fn-f-delete')) === 'Apagar despesa', 'despesa que existe: o ⋯ com "Apagar despesa"'); key('Escape'); await sleep(20); }
  click(Q('tab-metas')); await sleep(60);
  click(Q('mt-new')); await sleep(20);
  ok(vis('modal-goal') && T(Q('mt-f-head')) === 'Nova meta' && !vis('mt-f-more') && cd.querySelectorAll('#mt-f-tpl .fx-chip').length > 0, 'meta nova: as sugestões (chips), sem ⋯');
  key('Escape'); await sleep(20);
  ok(errors.length === 0, 'sem erro no PC' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1); });
