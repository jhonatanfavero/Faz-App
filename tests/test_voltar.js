// V40.27.0 — BOTÃO VOLTAR do celular, no app de verdade (index.html + app.js + sync.js em jsdom).
// O CloseWatcher do Chrome não existe no jsdom: aqui entra um de mentira que faz o mesmo (o voltar fecha o último
// armado; sem nenhum armado, o celular volta no histórico e o app fecha).
// (A) toda janelinha e toda tela têm o botão que o voltar toca (data-voltar); (B) tela inicial: aviso, o 2º voltar
// sai, e depois de 3 s (ou de um toque na tela) o voltar volta a perguntar; (C) Listas, Rotinas, Notas, Finanças e
// Metas: formulário → voltar volta pra lista → voltar fecha; (D) + → Config → cada sub-tela, Período, notas do bloco,
// Tags, Relatórios, Clonar; (E) cada janelinha fecha pelo próprio Cancelar, a de cima primeiro; por cima de uma tela,
// a tela fica sem fundo fosco por cima; tocar no fundo escuro faz o mesmo que o voltar; (F) tarefa na mão, busca e
// menu do zoom; (G) dias lado a lado; (H) computador: o Esc na agenda não avisa nada; (I) Android sem CloseWatcher:
// pelo histórico.
// Uso: TZ='America/Sao_Paulo' node test_voltar.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
// CloseWatcher de mentira: guarda todos; o voltar fecha o último ainda armado.
function fakeCW(w) {
  const all = [];
  w.CloseWatcher = class {
    constructor() { this.on = true; this.onclose = null; all.push(this); }
    destroy() { this.on = false; }
    close() { if (!this.on) return; this.on = false; if (this.onclose) this.onclose(new w.Event('close')); }
    requestClose() { this.close(); }
  };
  w.__cw = all;
}

(async () => {
  const B = await boot(REPO, backup.data, { userAgent: ANDROID, beforeParse: fakeCW }), { w, $, errors } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const armados = () => w.__cw.filter((x) => x.on).length;
  // apertar o voltar do celular: o último CloseWatcher armado recebe; sem nenhum, o app fecha
  const voltar = async () => { const a = w.__cw.filter((x) => x.on); if (!a.length) return 'saiu'; a[a.length - 1].close(); await sleep(5); return 'ok'; };
  const tocar = () => ev('navTouch({ isTrusted: true })'); // um toque de verdade na tela
  const aberta = (id) => !$(id).classList.contains('translate-y-full');
  const visivel = (id) => !$(id).classList.contains('hidden');
  const telas = () => J('navOpenSheets().map((s) => s.id)');
  const janelas = () => J('navOpenModals().map((m) => m.id)');
  // tela fosca: fundo escuro sem nada aberto (prende o toque) ou por cima da tela sem janelinha
  const fosca = () => {
    const o = $('overlay'), on = !o.classList.contains('opacity-0'), s = telas().length, m = janelas().length;
    if (on && !s && !m) return 'fundo escuro sem nada aberto';
    if (on && o.style.zIndex === '55' && !m) return 'fundo escuro por cima da tela';
    return '';
  };
  const inicial = () => !telas().length && !janelas().length && !ev('pendingIntent') && !visivel('search-bar-row') && !fosca();
  const limpar = async () => { ev('closeAllSheets(); if (pendingIntent) cancelPendingTask(); closeSearchBar(); tlBack = null;'); await sleep(5); };

  ok(!errors.length, 'o app abre sem erro' + (errors.length ? ': ' + errors[0] : ''));
  ok(armados() === 1, 'com CloseWatcher, o voltar já fica armado desde a abertura (um só)');

  // ======================================================================================================
  console.log('\nA) Todo lugar que o voltar fecha tem o botão dele:');
  const modais = [...d.querySelectorAll('[id$="-modal"]')], sheets = [...d.querySelectorAll('[id$="-sheet"]')];
  const semBotao = modais.filter((m) => !m.querySelector('[data-voltar]:not([data-voltar="fechar"])')).map((m) => m.id);
  ok(modais.length >= 18 && !semBotao.length, `as ${modais.length} janelinhas têm o Cancelar/fechar marcado com data-voltar` + (semBotao.length ? ' — faltam: ' + semBotao.join(', ') : ''));
  const semX = sheets.filter((s) => !s.querySelector('[data-voltar="fechar"]')).map((s) => s.id);
  ok(sheets.length === 8 && !semX.length, `as ${sheets.length} telas têm o X marcado com data-voltar="fechar"` + (semX.length ? ' — faltam: ' + semX.join(', ') : ''));
  const setas = [...d.querySelectorAll('button')].filter((b) => b.querySelector('.ph-arrow-left'));
  ok(setas.length >= 7 && setas.every((b) => b.hasAttribute('data-voltar') && b.dataset.voltar !== 'fechar'), `toda seta de voltar (${setas.length}) é o que o voltar toca`);
  const xs = [...d.querySelectorAll('button[onclick^="closeAllSheets"]')];
  ok(xs.length && xs.every((b) => b.dataset.voltar === 'fechar'), 'todo X que fecha as telas é data-voltar="fechar"');
  ok(d.querySelector('#floating-task [data-voltar]') && d.querySelector('#search-bar-row [data-voltar]'), 'a faixa da tarefa na mão e a busca também têm');
  ok(!d.querySelector('#fab-btn[data-voltar]'), 'o botão + da agenda (que também chama openSheet) não é botão de voltar');

  // ======================================================================================================
  console.log('\nB) Tela inicial: pergunta antes de sair:');
  ok(inicial() && ev('navTop()') === null, 'agenda sem nada aberto = tela inicial');
  let n0 = toasts().length;
  ok(await voltar() === 'ok' && toasts().length === n0 + 1 && toasts()[n0] === 'Toque em voltar de novo pra sair', 'voltar na agenda: avisa "' + toasts()[n0] + '" e não fecha');
  ok(armados() === 0, 'e desarma: o 2º voltar é do celular');
  ok(await voltar() === 'saiu', 'o 2º voltar logo em seguida fecha o app');
  await sleep(3100);
  ok(armados() === 1, 'passados 3 s sem o 2º voltar, o voltar volta a perguntar (armado de novo)');
  n0 = toasts().length;
  await voltar();
  ok(toasts().length === n0 + 1 && armados() === 0, 'voltar de novo: avisa de novo');
  tocar();
  ok(armados() === 1, 'tocou na tela no meio: desiste de sair e o voltar volta a perguntar');
  ev('openListSheet()'); await sleep(5);
  ok(armados() === 1, 'abrir uma tela não arma um segundo (fica um só)');
  await limpar();

  // ======================================================================================================
  console.log('\nC) Listas, Rotinas, Notas, Finanças e Metas:');
  ev('openListSheet()');
  ok(aberta('list-sheet') && !fosca(), 'abriu as Listas');
  await voltar();
  ok(!aberta('list-sheet') && inicial(), 'voltar: fecha as Listas e volta pra agenda, sem fundo fosco');
  const abas = [
    ['backlog', 'openBacklogForm()', 'backlog-form-view', 'backlog-list-view', 'Listas'],
    ['routines', 'openRoutineForm()', 'routines-form-view', 'routines-list-view', 'Rotinas'],
    ['financial', 'openFinancialForm()', 'financial-form-view', 'financial-list-view', 'Finanças'],
    ['goals', 'openGoalForm()', 'goals-form-view', 'goals-list-view', 'Metas'],
  ];
  for (const [aba, abrir, form, lista, nome] of abas) {
    ev(`openListSheet(); switchListTab('${aba}'); ${abrir};`); await sleep(5);
    const antes = visivel(form) && !visivel(lista);
    await voltar();
    ok(antes && !visivel(form) && visivel(lista) && aberta('list-sheet') && !fosca(), `${nome}: no formulário, voltar volta pra lista (a tela continua aberta)`);
    await voltar();
    ok(inicial(), `${nome}: voltar de novo fecha a tela`);
  }
  ev("openListSheet(); switchListTab('notes'); openNoteForm();"); await sleep(5);
  ev("document.getElementById('note-content-input').value = 'rascunho'");
  const notaAntes = visivel('notes-form');
  await voltar();
  // V40.46.0: com a nota sendo escrita, o voltar pergunta antes ("Descartar?"); descartando, sai do formulário
  ok(notaAntes && visivel('discard-modal') && visivel('notes-form'), 'Notas: com a nota sendo escrita, o voltar pergunta "Descartar?" (o formulário fica)');
  ev('fgDiscard()'); await sleep(5);
  ok(!visivel('discard-modal') && !visivel('notes-form') && aberta('list-sheet') && J('notesDb.length') === 3, 'Notas: "Descartar" sai do formulário (igual ao X dele; nada é gravado)');
  await voltar();
  ok(inicial(), 'Notas: voltar de novo fecha a tela');
  // formulário aberto numa aba que ficou pra trás: o voltar não mexe nele, fecha a tela
  ev("openListSheet(); switchListTab('routines'); openRoutineForm(); switchListTab('notes');"); await sleep(5);
  await voltar();
  ok(inicial(), 'formulário de Rotinas aberto mas a aba é Notas: voltar fecha a tela (não procura formulário escondido)');
  ev("closeRoutineForm(true)");
  // menu do zoom das Listas
  ev("openListSheet(); toggleBacklogZoomMenu();"); await sleep(5);
  const zoomAntes = visivel('backlog-zoom-menu');
  await voltar();
  ok(zoomAntes && !visivel('backlog-zoom-menu') && aberta('list-sheet'), 'menu do zoom aberto: voltar fecha só o menu');
  await voltar();
  ok(inicial(), 'e depois a tela');

  // ======================================================================================================
  console.log('\nD) + → Config e as outras telas:');
  const subs = [['openConfigHours()', 'config-hours-view', 'Janela de Horário'], ['openConfigPeriods()', 'config-periods-view', 'Períodos'], ['openConfigAppearance()', 'config-appearance-view', 'Aparência'], ['openConfigBackup()', 'config-backup-view', 'Backup'], ['openConfigSync()', 'config-sync-view', 'Sincronizar'], ['openConfigArchive()', 'config-archive-view', 'Arquivados'], ['openConfigAvisos()', 'config-avisos-view', 'Avisos']]; // V40.42.0: + Avisos
  for (const [abrir, view, nome] of subs) {
    ev(`openSheet(); openConfigSheet(); ${abrir};`); await sleep(5);
    const antes = visivel(view) && !visivel('config-main-menu');
    await voltar();
    ok(antes && !visivel(view) && visivel('config-main-menu') && aberta('config-sheet') && !fosca(), `Config → ${nome}: voltar volta pro menu da Config`);
    await voltar();
    ok(!aberta('config-sheet') && aberta('bottom-sheet') && !fosca(), `Config → ${nome}: voltar de novo volta pro + (de onde a Config abre)`);
    await voltar();
    ok(inicial(), `Config → ${nome}: e voltar mais uma vez fecha o +`);
  }
  ev('openSheet(); openPeriodSelectSheet();'); await sleep(5);
  await voltar();
  ok(!aberta('period-select-sheet') && aberta('bottom-sheet'), 'Selecionar Período: voltar volta pro +');
  await limpar();
  const bloco = J("db.find((b) => b.date === '2026-11-15' && b.type !== 'empty' && b.title)");
  ev(`openLinkNoteSheet('${bloco.id}')`); await sleep(5);
  await voltar();
  ok(!aberta('link-note-sheet') && inicial(), 'notas do bloco: voltar fecha a tela');
  ev(`openLinkNoteSheet('${bloco.id}'); chooseLinkExistingNote();`); await sleep(5);
  const existAntes = visivel('link-note-existing-view');
  await voltar();
  ok(existAntes && !visivel('link-note-existing-view') && visivel('link-note-options') && aberta('link-note-sheet'), 'notas do bloco → "vincular existente": voltar volta pras opções');
  await voltar();
  ok(inicial(), 'e voltar de novo fecha');
  for (const [abrir, id, nome] of [['openTagsSheet()', 'tags-sheet', 'TAGs'], ['openReportsSheet()', 'reports-sheet', 'Relatórios'], [`duplicateTask('${bloco.id}', { stopPropagation() {} })`, 'clone-sheet', 'Duplicar']]) {
    if (!ev(`typeof ${abrir.split('(')[0]} === 'function'`)) { ok(false, nome + ': função de abrir não existe'); continue; }
    ev(abrir); await sleep(5);
    const antes = aberta(id);
    await voltar();
    ok(antes && inicial(), `${nome}: voltar fecha a tela`);
  }

  // ======================================================================================================
  console.log('\nE) Janelinhas:');
  // cada janelinha, aberta do jeito mais simples, fecha pelo próprio Cancelar/fechar
  for (const m of modais) {
    await limpar();
    ev(`(() => { const o = document.getElementById('overlay'); o.classList.remove('opacity-0', 'pointer-events-none'); const m = document.getElementById('${m.id}'); m.classList.remove('hidden'); m.classList.add('flex'); })()`);
    const btn = J(`(navButton(document.getElementById('${m.id}')) || {}).outerHTML || ''`);
    await voltar();
    ok(!visivel(m.id) && inicial(), `${m.id}: voltar toca no "${(btn.match(/onclick="([^"(]+)/) || [])[1]}" dela e fecha, sem fundo fosco`);
  }
  await limpar();
  // por cima de uma tela: fecha a janelinha, a tela fica, o fundo escuro volta pra trás dela
  const tarefa = J("backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral')[0]");
  ev(`openListSheet(); requestDeleteBacklog('${tarefa.id}');`); await sleep(5);
  const delAntes = visivel('backlog-delete-modal') && $('overlay').style.zIndex === '55';
  await voltar();
  ok(delAntes && !visivel('backlog-delete-modal') && aberta('list-sheet') && !fosca() && J(`backlogDb.some((x) => x.id === '${tarefa.id}')`), '"Apagar tarefa?" por cima das Listas: voltar = Cancelar (a tarefa fica; a tela fica, sem fundo fosco por cima)');
  // duas janelinhas: o menu da lista e, por cima, renomear
  ev('openColumnMenuFromHeader()'); await sleep(5);
  const menuAntes = visivel('column-menu-modal');
  await voltar();
  ok(menuAntes && !visivel('column-menu-modal') && aberta('list-sheet') && !fosca(), 'menu da lista (3 pontinhos): voltar fecha o menu e fica nas Listas');
  ev('openColumnMenuFromHeader(); openRenameColumn();'); await sleep(5);
  const pilha = janelas();
  await voltar();
  ok(!visivel('column-name-modal') && aberta('list-sheet') && !fosca(), `renomear lista (aberto pelo menu: ${pilha.join(' + ')}): voltar = Cancelar, fica nas Listas`);
  if (janelas().length) { await voltar(); }
  await voltar();
  ok(inicial(), 'e voltar fecha as Listas');
  // tocar no fundo escuro com janelinha aberta: o mesmo que o voltar (antes procurava a janelinha pela classe z-[60] e errava)
  const z60 = () => d.querySelectorAll('.z-\\[60\\].hidden:not([id$="-modal"])').length;
  const z0 = z60();
  ev(`openListSheet(); requestDeleteBacklog('${tarefa.id}');`); await sleep(5);
  ev('onOverlayClick()');
  ok(!visivel('backlog-delete-modal') && aberta('list-sheet') && !fosca() && z60() === z0, 'tocar no fundo escuro fora do "Apagar tarefa?": fecha só a janelinha (e não esconde botão de bloco nem de cartão)');
  ev('onOverlayClick()');
  ok(inicial(), 'tocar no fundo escuro de novo: fecha as Listas');
  ev("openListSheet(); openColumnMenuFromHeader(); openRenameColumn();"); await sleep(5);
  ev("document.querySelector('#column-name-modal input').value = 'Nome novo';"); // digitado depois de abrir (V40.46.0: o ponto de partida é o da abertura)
  ev('onOverlayClick()');
  ok(visivel('column-name-modal') && ev("document.querySelector('#column-name-modal input').value") === 'Nome novo' && aberta('list-sheet'), 'janelinha com campo de digitar (renomear lista): tocar no fundo escuro não fecha (às vezes é só pra baixar o teclado; o digitado não se perde)');
  await voltar();
  // V40.46.0: com o nome mudado, o voltar pergunta antes ("Descartar?"); o voltar de novo é o "Continuar escrevendo"
  ok(visivel('discard-modal') && visivel('column-name-modal') && ev("document.querySelector('#column-name-modal input').value") === 'Nome novo', 'com o nome mudado, o voltar pergunta "Descartar?" (a janelinha e o texto ficam)');
  await voltar();
  ok(!visivel('discard-modal') && visivel('column-name-modal') && ev("document.querySelector('#column-name-modal input').value") === 'Nome novo' && aberta('list-sheet'), 'o voltar de novo é o "Continuar escrevendo": a pergunta fecha e o texto fica');
  await voltar();
  ev('fgDiscard()'); await sleep(5);
  ok(!visivel('discard-modal') && !visivel('column-name-modal') && aberta('list-sheet') && !fosca() && !J('backlogColumnsDb').some((c) => c.name === 'Nome novo'), '"Descartar": fecha ela pelo Cancelar (o nome não muda)');
  await voltar();
  ok(inicial(), 'e o voltar seguinte fecha as Listas');
  // janelinhas da agenda
  ev(`openEditModal('${bloco.id}')`); await sleep(5);
  const edAntes = visivel('edit-task-modal');
  await voltar();
  ok(edAntes && inicial(), 'Editar bloco (na agenda): voltar = Cancelar');
  ev(`openDeleteModal('${bloco.id}')`); await sleep(5);
  const dlAntes = visivel('delete-task-modal');
  await voltar();
  ok(dlAntes && inicial() && J(`db.some((b) => b.id === '${bloco.id}')`), 'Apagar bloco (na agenda): voltar = Cancelar, o bloco fica');
  ev(`openTimePicker('${bloco.id}', ${bloco.startMin})`); await sleep(5);
  const tpAntes = visivel('time-picker-modal');
  await voltar();
  ok(tpAntes && inicial() && J(`db.find((b) => b.id === '${bloco.id}').startMin`) === bloco.startMin, 'trocar horário: voltar = Cancelar, o horário fica');
  ev('showThoughtOfDay()'); await sleep(5);
  const thAntes = visivel('thought-modal');
  await voltar();
  ok(thAntes && inicial(), 'Pensamento do dia: voltar fecha');

  // ======================================================================================================
  console.log('\nF) Tarefa na mão e busca:');
  const t2 = J('backlogDb[0]');
  ev(`openListSheet(); scheduleBacklogItem('${t2.id}');`); await sleep(5);
  const maoAntes = !!ev('pendingIntent') && visivel('floating-task') && !telas().length;
  await voltar();
  ok(maoAntes && !ev('pendingIntent') && !visivel('floating-task') && J(`backlogDb.some((x) => x.id === '${t2.id}')`) && inicial(), 'tarefa na mão: voltar solta a tarefa (ela continua na lista)');
  ev('openSearchBar()'); await sleep(5);
  ev("onSearchInput('Bloco')");
  const buscaAntes = visivel('search-bar-row');
  await voltar();
  ok(buscaAntes && !visivel('search-bar-row') && !ev('searchQuery') && inicial(), 'busca aberta: voltar fecha a busca');

  // ======================================================================================================
  console.log('\nG) Agenda com 2 ou 3 dias lado a lado:');
  ev("setTlDays(3, '2026-11-15'); document.getElementById('timeline-scroll').scrollTop = 120;");
  const b16 = J("db.find((b) => b.date === '2026-11-16' && b.type !== 'empty' && b.title)");
  ev(`tlOpenDay('2026-11-16', '${b16.id}')`); await sleep(5);
  const abriu = J(`[tlDays, getActiveDateStr(), !!db.find((b) => b.id === '${b16.id}').expanded]`);
  ok(abriu[0] === 1 && abriu[1] === '2026-11-16' && abriu[2], 'tocou num bloco do dia 16: abriu o dia 16 com o cartão aberto');
  ok(J('navTop()').kind === 'days', 'o voltar agora volta pros dias lado a lado');
  await voltar();
  const voltou = J(`[tlDays, getActiveDateStr(), !!db.find((b) => b.id === '${b16.id}').expanded, document.getElementById('timeline-scroll').scrollTop]`);
  ok(voltou[0] === 3 && voltou[1] === '2026-11-15' && !voltou[2], 'voltar: os 3 dias de novo, a partir do 15, com o cartão fechado');
  n0 = toasts().length;
  await voltar();
  ok(toasts().length === n0 + 1 && armados() === 0, 'voltar de novo: agora é a tela inicial (avisa antes de sair)');
  tocar();
  ev(`tlOpenDay('2026-11-17')`); await sleep(5);
  ev('openListSheet()'); await sleep(5);
  await voltar();
  ok(!aberta('list-sheet') && ev('tlDays') === 1, 'abriu o dia 17 e depois as Listas: o 1º voltar fecha as Listas');
  await voltar();
  ok(ev('tlDays') === 3 && ev('getActiveDateStr()') === '2026-11-15', 'o 2º volta pros 3 dias');
  ev(`tlOpenDay('2026-11-17')`); ev('setTlDays(2)'); await sleep(5);
  ok(ev('tlBack') === null && J('navTop()') === null, 'trocou pra 2 dias pela pinça ou pelo botão: o voltar não volta mais pros 3 (é a tela inicial)');
  ev('setTlDays(2)'); ev("tlOpenDay('2026-11-16')"); ev('setTlDays(1)'); await sleep(5);
  ok(J('navTop()').kind === 'days', 'aproximou pra 1 dia pela pinça depois de abrir um dia: o voltar ainda volta pros dias (abrir o dia foi o último passo)');
  ev('tlBack = null; setTlDays(1)'); await sleep(5);

  ok(!errors.length, 'nenhum erro no caminho' + (errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''));

  // ======================================================================================================
  console.log('\nH) Computador (Esc):');
  const P = await boot(REPO, backup.data, { beforeParse: fakeCW }), wp = P.w;
  const escP = async () => { const a = wp.__cw.filter((x) => x.on); if (a.length) a[a.length - 1].close(); await sleep(5); };
  wp.eval('openListSheet()');
  await escP();
  ok(P.$('list-sheet').classList.contains('translate-y-full'), 'Esc fecha a tela de cima (o mesmo CloseWatcher)');
  const t0 = (wp.__toasts || []).length;
  await escP();
  ok((wp.__toasts || []).length === t0 && wp.__cw.filter((x) => x.on).length === 1, 'Esc na agenda: não avisa nada e continua armado');

  // ======================================================================================================
  console.log('\nI) Android sem CloseWatcher: pelo histórico:');
  const H = await boot(REPO, backup.data, { userAgent: ANDROID }), wh = H.w;
  const st = () => wh.history.state;
  ok(!wh.CloseWatcher && !(st() && st().fazVoltar), 'sem CloseWatcher: não põe nada no histórico antes do primeiro toque');
  wh.eval('navTouch({ isTrusted: true })');
  ok(st() && st().fazVoltar === 1 && wh.history.length === 2, 'primeiro toque: uma entrada a mais no histórico (a que o voltar consome)');
  wh.eval('navTouch({ isTrusted: true })');
  ok(wh.history.length === 2, 'outros toques não empilham mais');
  wh.eval('openListSheet(); openBacklogForm();');
  wh.history.back(); await sleep(120);
  ok(H.$('backlog-form-view').classList.contains('hidden') && !H.$('list-sheet').classList.contains('translate-y-full') && st() && st().fazVoltar === 1, 'voltar: sai do formulário, fica nas Listas, e põe a entrada de volta');
  wh.history.back(); await sleep(120);
  ok(H.$('list-sheet').classList.contains('translate-y-full') && st() && st().fazVoltar === 1, 'voltar: fecha as Listas');
  const th0 = (wh.__toasts || []).length;
  wh.history.back(); await sleep(120);
  ok((wh.__toasts || []).length === th0 + 1 && !(st() && st().fazVoltar), 'na agenda: avisa e NÃO põe a entrada de volta (o próximo voltar sai do app)');
  await sleep(3100);
  ok(st() && st().fazVoltar === 1, 'passados 3 s, põe de novo (o voltar volta a perguntar)');
  ok(!H.errors.length && !P.errors.length, 'sem erros nos outros dois aparelhos' + ([...H.errors, ...P.errors].length ? ': ' + [...H.errors, ...P.errors][0] : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
