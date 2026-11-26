// V40.48.0 — MENU GRANDE e QUADROS COM ABAS (pedido dele em 26/11, com fotos):
//   A) celular sem conta: o botão dos itens abre o menu grande (Quadros, Rotinas, Notas, Finanças, Metas, Assistente, com
//      os números; Config no pé); tocar num botão abre a parte; o "Menu" lá em cima e o voltar do celular voltam pro menu;
//      quem abre a tela por dentro do app vai direto pra lista; as abas: só "Pessoal" e o "+ Quadro" (pede a conta);
//   B) celular com conta (nuvem de mentira com as regras do banco): quadro só seu pelas abas (abre vazio: "Nova lista" e
//      "Trazer uma lista"); lista nova entra no quadro aberto (e vai pra nuvem com o quadro); trazer uma lista; cada aba
//      só com as listas dela (bolinhas, título); "Mudar de quadro" no menu da lista (você fica no quadro aberto); abrir
//      uma lista de outro quadro leva o quadro junto; o quadro aberto fica guardado; com gente no quadro, o ícone de
//      pessoas; o quadro apagado volta pro Pessoal; o "Mover" da tarefa separado por quadro;
//   C) PC: as abas em cima das listas, cada uma só com as dela; quadro novo; lista nova no quadro aberto; "Mudar de
//      quadro…"; trazer uma lista; o quadro aberto guardado; a lista de outra pessoa só no quadro dela.
// Uso: TZ='America/Sao_Paulo' node tests/test_quadros_abas.js <repo> <dados-ficticios.json>
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
const EU = 'aaaaaaaa-1111-4111-8111-111111111111', ELA = 'bbbbbbbb-2222-4222-8222-222222222222';
const BETA = 'col_1700000007000', GAMA = 'col_1700000008000', DELTA = 'col_1700000009000';
const AUTH = 'sb-zlwocojndrjnuvoowzzu-auth-token';

(async () => {
  // =====================================================================================================
  console.log('A) Menu grande (celular, sem conta):');
  const A = await boot(REPO, DADOS.data), w = A.w, d = w.document, $ = A.$, ev = (x) => w.eval(x);
  const shown = (id) => !$(id).classList.contains('hidden');
  const sheetOpen = () => !$('list-sheet').classList.contains('translate-y-full');
  ok($('list-btn').getAttribute('onclick') === 'openHub()' && T($('btn-list-backlog')) === 'Quadros', 'o botão dos itens abre o menu grande; a aba "Listas" agora se chama "Quadros"');
  $('list-btn').click(); await sleep(60);
  const tiles = [...d.querySelectorAll('#hub-grid .hub-tile')];
  ok(sheetOpen() && shown('view-hub') && !shown('list-tabs') && !shown('view-backlog') && !shown('list-menu-btn') && shown('hub-title'), 'tocou: a tela abre no menu grande (sem as abas de cima, com o título "Menu")');
  const nT = ev('backlogDb.length'), nR = ev('routinesDb.length'), nN = ev('notesDb.length');
  ok(tiles.map((b) => b.dataset.hub).join() === 'backlog,routines,notes,financial,goals,assistant,reports,tags,config' && tiles.map((b) => T(b.querySelector('.hub-name'))).join() === 'Quadros,Rotinas,Notas,Finanças,Metas,Assistente,Relatórios,Tags,Config' && $('hub-grid').classList.contains('grid-cols-3'), 'a grade (V40.49.0: 3 por linha): Quadros, Rotinas, Notas, Finanças, Metas, Assistente, Relatórios, Tags e Config');
  ok(T(tiles[0].querySelector('.hub-sub')) === nT + ' tarefas' && T(tiles[1].querySelector('.hub-sub')) === nR + ' rotinas' && T(tiles[2].querySelector('.hub-sub')) === nN + (nN === 1 ? ' nota' : ' notas') && /a pagar|Tudo pago|Nada neste mês/.test(T(tiles[3].querySelector('.hub-sub'))), `cada um com o número (${T(tiles[0].querySelector('.hub-sub'))}, ${T(tiles[3].querySelector('.hub-sub'))}…)`);
  ok(!d.querySelector('#view-hub .hub-cfg') && tiles[8].getAttribute('onclick') === "hubOpen('config')" && tiles[6].getAttribute('onclick') === "hubOpen('reports')" && tiles[7].getAttribute('onclick') === "hubOpen('tags')", 'Relatórios, Tags e Config são botões iguais aos outros (a Config saiu do pé)');
  tiles[0].click(); await sleep(60);
  ok(shown('view-backlog') && !shown('view-hub') && shown('list-tabs') && shown('list-menu-btn') && !shown('hub-title') && ev('activeListTab') === 'backlog', 'tocou em Quadros: abre as listas (com as abas de cima e o "Menu")');
  const tabs = () => [...d.querySelectorAll('#qb-tabs .qb-tab-wrap')].map((x) => (x.classList.contains('on') ? '*' : '') + T(x));
  ok(tabs().join('|') === '*Pessoal' && !!d.querySelector('#qb-tabs .qb-new'), 'sem conta: só a aba "Pessoal" (aberta) e o "+ Quadro"');
  d.querySelector('#qb-tabs .qb-new').click(); await sleep(30);
  ok((w.__toasts || []).some((m) => /Entre na sua conta/.test(m)) && !shown('quadro-name-modal'), '"+ Quadro" sem conta: pede pra entrar na conta');
  ok(ev('navButton(document.getElementById("list-sheet")).id') === 'list-menu-btn', 'o voltar do celular toca no "Menu" (antes do X)');
  ev('navBack()'); await sleep(40);
  ok(sheetOpen() && shown('view-hub'), 'voltar: volta pro menu grande');
  ev('navBack()'); await sleep(40);
  ok(!sheetOpen(), 'voltar de novo: fecha');
  ev('openListSheet()'); await sleep(40);
  ok(sheetOpen() && shown('view-backlog') && !shown('view-hub'), 'quem abre por dentro do app (openListSheet) vai direto pras listas');
  ok(ev('navButton(document.getElementById("list-sheet")).dataset.voltar') === 'fechar', 'e aí o voltar fecha (não passa pelo menu: volta pra onde veio)');
  ev('openBacklogForm()'); await sleep(30);
  ok(ev('navButton(document.getElementById("list-sheet")).closest("#backlog-form-view") !== null'), 'com um formulário aberto, o voltar fecha o formulário (a seta dele vem antes do "Menu")');
  ev('closeBacklogForm(true); closeAllSheets()');
  $('list-btn').click(); await sleep(40);
  d.querySelector('#hub-grid [data-hub="tags"]').click(); await sleep(40);
  const vis = (sel) => { const e = d.querySelector(sel); return !!e && !e.classList.contains('hidden'); };
  ok(!$('tags-sheet').classList.contains('translate-y-full') && !sheetOpen() && vis('#tags-sheet [data-hub-back]'), 'Tags pelo menu: abre a tela das tags, com o "Menu" no topo');
  ok(ev('navButton(document.getElementById("tags-sheet")).dataset.voltar') === 'menu', 'o voltar do celular toca no "Menu"');
  ev('navBack()'); await sleep(40);
  ok($('tags-sheet').classList.contains('translate-y-full') && sheetOpen() && shown('view-hub'), 'voltar: volta pro menu grande');
  d.querySelector('#hub-grid [data-hub="reports"]').click(); await sleep(40);
  ok(!$('reports-sheet').classList.contains('translate-y-full') && vis('#reports-sheet [data-hub-back]'), 'Relatórios pelo menu: com o "Menu" no topo');
  ev('hubBack()'); await sleep(40);
  d.querySelector('#hub-grid [data-hub="config"]').click(); await sleep(40);
  ok(!$('config-sheet').classList.contains('translate-y-full') && $('config-back-btn').getAttribute('onclick') === 'hubBack()', 'Config pelo menu: a seta de voltar leva pro menu');
  ev('openConfigHours()'); await sleep(20); $('config-back-btn').click(); await sleep(20); // a seta da parte volta pro menu da Config
  ok($('config-back-btn').getAttribute('onclick') === 'hubBack()', 'saindo de uma parte da Config, a seta continua indo pro menu');
  $('config-back-btn').click(); await sleep(40);
  ok($('config-sheet').classList.contains('translate-y-full') && sheetOpen() && shown('view-hub'), 'e a seta volta pro menu grande');
  ev('closeAllSheets(); openTagsSheet()'); await sleep(30);
  ok(!vis('#tags-sheet [data-hub-back]'), 'Tags aberta por fora do menu: sem o "Menu"');
  ev('closeAllSheets(); openConfigSheet()'); await sleep(30);
  ok($('config-back-btn').getAttribute('onclick') === 'openSheet()', 'Config aberta pelo + (engrenagem): a seta volta pro + como antes');
  ev('closeAllSheets()');
  $('list-btn').click(); await sleep(40);
  d.querySelector('#hub-grid [data-hub="notes"]').click(); await sleep(40);
  ok(shown('view-notes') && ev('activeListTab') === 'notes', 'tocar em Notas abre as Notas');
  ev('closeAllSheets()');
  ok(A.errors.length === 0, 'sem erro de página' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  try { w.close(); } catch (e) {}

  // =====================================================================================================
  console.log('\nB) Quadros com abas (celular com conta):');
  const server = makeServer();
  server.addUser('eu@teste.com', 'senha123', EU); server.addUser('ela@teste.com', 'senha123', ELA);
  server.storedSession = { access_token: 'tok', user: { id: EU, email: 'eu@teste.com', user_metadata: {} } };
  const P = await boot(REPO, { ...DADOS.data, [AUTH]: '{"access_token":"tok"}' }, { server });
  await waitFor(() => P.L('tb__sync'), 12000);
  const pw = P.w, pd = pw.document, $p = P.$, E = (x) => pw.eval(x), QA = pw.fazQuadros;
  const ptabs = () => [...pd.querySelectorAll('#qb-tabs .qb-tab-wrap')].map((x) => (x.classList.contains('on') ? '*' : '') + T(x));
  const cols = () => [...pd.querySelectorAll('#backlog-columns-wrapper > [data-column-id]')].map((x) => x.dataset.columnId);
  const col = (id) => JSON.parse(P.L('tb_backlog_columns')).find((c) => c.id === id);
  const nPessoal = E('backlogColumnsDb.length');
  E('openListSheet()'); await sleep(60);
  ok(ptabs().join('|') === '*Pessoal' && cols().length === nPessoal && pd.querySelectorAll('#backlog-column-dots > *').length === nPessoal, `com conta e sem quadro: tudo no "Pessoal" (${nPessoal} listas)`);
  // quadro só seu, pelas abas
  pd.querySelector('#qb-tabs .qb-new').click(); await sleep(40);
  ok(!$p('quadro-name-modal').classList.contains('hidden'), '"+ Quadro": pede o nome');
  $p('quadro-name-input').value = 'Qualitê';
  E('confirmQuadroName()');
  await waitFor(() => ptabs().some((t) => /Qualitê/.test(t)));
  const QUAL = QA.estado().quadros.find((q) => q.nome === 'Qualitê').id;
  ok(ptabs().join('|') === 'Pessoal|*Qualitê' && cols().length === 0 && /Nenhuma lista no quadro Qualitê/.test(T($p('backlog-columns-wrapper'))), 'criou o quadro "Qualitê" (só seu) e ele abre vazio');
  ok(T($p('backlog-column-title')) === 'Qualitê' && $p('backlog-column-menu-btn').classList.contains('hidden') && $p('backlog-new-task-btn').classList.contains('hidden') && $p('backlog-search-btn').classList.contains('hidden') && !!pd.querySelector('#backlog-columns-wrapper [onclick="promptCreateColumn()"]') && !!pd.querySelector('#backlog-columns-wrapper [onclick="blBringList()"]'), 'vazio: o nome do quadro em cima, sem os botões de lista; "Nova lista" e "Trazer uma lista"');
  ok(P.L('tb__quadro_aberto') === QUAL, 'o quadro aberto fica guardado neste aparelho');
  ok(!(pw.__toasts || []).some((m) => /Quadro criado/.test(m)), 'sem o aviso vermelho de "Quadro criado!" (o quadro aberto já mostra)');
  // lista nova no quadro aberto
  E('promptCreateColumn()'); await sleep(30);
  $p('column-name-input').value = 'PROJETOS'; E('confirmColumnName()'); await sleep(60);
  const proj = JSON.parse(P.L('tb_backlog_columns')).find((c) => c.name === 'PROJETOS');
  ok(proj && proj.quadroId === QUAL && cols().join() === proj.id && T($p('backlog-column-title')) === 'PROJETOS', 'lista nova entra no quadro aberto');
  E('fazSyncNow()');
  await waitFor(() => server.get('listas', EU, proj.id) && server.get('listas', EU, proj.id).quadro_id === QUAL);
  ok(server.get('listas', EU, proj.id).quadro_id === QUAL, 'e vai pra nuvem já no quadro');
  // trazer uma lista
  E('blBringList()'); await sleep(30);
  const opts = T($p('share-list-options'));
  const optIds = [...pd.querySelectorAll('#share-list-options .agf-row')].map((x) => (x.getAttribute('onclick').match(/'([^']+)'/) || [])[1]);
  ok(!$p('share-list-modal').classList.contains('hidden') && /Trazer uma lista pro quadro Qualitê/.test(T($p('share-list-title'))) && opts.includes('BETA') && optIds.includes(BETA) && !optIds.includes(proj.id) && !optIds.includes('col_geral') && /agora em: Pessoal/.test(opts) && $p('share-list-new').classList.contains('hidden'), 'trazer: as suas de outros quadros (sem a Geral e sem as daqui), sem o "Novo quadro"');
  E(`shareListBring('${BETA}')`); await sleep(60);
  ok(col(BETA).quadroId === QUAL && cols().length === 2 && cols().includes(BETA) && cols().includes(proj.id) && E('activeColumnId') === BETA, 'a BETA veio pro Qualitê (e é a lista aberta)');
  ok(!E(`sharedColIcon(backlogColumnsDb.find(c => c.id === '${BETA}'))`) && $p('backlog-column-shared').classList.contains('hidden'), 'quadro só seu: sem o ícone de pessoas');
  E('openColumnMenuFromHeader()');
  ok(/No quadro Qualitê, só seu/.test(T($p('column-menu-shared-txt'))) && T($p('column-menu-share-txt')) === 'Mudar de quadro', 'menu da lista: "No quadro Qualitê, só seu" e "Mudar de quadro"');
  E('closeColumnMenu()');
  // aba Pessoal
  pd.querySelector('#qb-tabs [data-board=""] .qb-tab').click(); await sleep(60);
  ok(ptabs().join('|') === '*Pessoal|Qualitê' && !cols().includes(BETA) && !cols().includes(proj.id) && cols().includes('col_geral') && P.L('tb__quadro_aberto') === '', 'aba Pessoal: sem a BETA e a PROJETOS (com a Geral)');
  ok(pd.querySelectorAll('#backlog-column-dots > *').length === cols().length, 'as bolinhas contam só as listas da aba');
  // mudar de quadro pelo menu da lista (fica no Pessoal)
  E(`activeColumnId = '${GAMA}'; renderBacklog(); openColumnMenuFromHeader(); openShareColumn();`); await sleep(30);
  ok(/Mudar "GAMA" de quadro/.test(T($p('share-list-title'))) && pd.querySelector('#share-list-options .agf-row.on') && /Pessoal/.test(T(pd.querySelector('#share-list-options .agf-row.on'))) && /Qualitêsóvocê/.test(T($p('share-list-options')).replace(/\s/g, '')), 'janelinha "Mudar de quadro": Pessoal (marcado) e Qualitê ("só você")');
  E(`shareListPick('${QUAL}')`); await sleep(60);
  ok(col(GAMA).quadroId === QUAL && ptabs()[0] === '*Pessoal' && !cols().includes(GAMA) && E('activeColumnId') !== GAMA && cols().includes(E('activeColumnId')), 'escolheu Qualitê: a GAMA foi, e você fica no Pessoal (na lista vizinha)');
  await sleep(60);
  ok(/"GAMA" foi pro quadro Qualitê/.test(T($p('undo-bar'))) || /"GAMA" foi pro quadro Qualitê/.test(E('(undoStack[undoStack.length - 1] || {}).label || ""')), 'a barrinha do Desfazer diz pra onde ela foi: ' + (T($p('undo-bar')) || E('(undoStack[undoStack.length - 1] || {}).label || ""')));
  // abrir uma lista de outro quadro leva o quadro junto (voltar pra lista, busca...)
  E(`scrollToColumn('${GAMA}')`); await sleep(60);
  ok(ptabs().join('|') === 'Pessoal|*Qualitê' && E('activeColumnId') === GAMA, 'mandou abrir a GAMA (de outro quadro): o quadro dela abre junto');
  // o quadro aberto fica guardado (outra vez que abre o app)
  ok(P.L('tb__quadro_aberto') === QUAL, 'e fica guardado');
  // com gente no quadro: ícone de pessoas
  let r = await QA.adicionar(QUAL, 'ela@teste.com');
  await sleep(60);
  ok(r.ok && pd.querySelector('#qb-tabs .qb-tab-wrap.on .ph-users-three') && E(`sharedColIcon(backlogColumnsDb.find(c => c.id === '${GAMA}'))`), 'pôs uma pessoa no Qualitê: a aba e as listas ganham o ícone de pessoas');
  // o "Mover" da tarefa separado por quadro
  const tid = E(`backlogDb.find(t => getItemColumn(t) === '${GAMA}').id`);
  E(`openMoveCardModal('${tid}')`); await sleep(30);
  const mv = [...pd.querySelectorAll('#column-move-options p')].map(T);
  ok(mv[0] === 'Neste quadro' && mv.includes('Pessoal') && !mv.includes('Quadro Qualitê'), 'mover uma tarefa: as listas separadas por quadro ("Neste quadro", "Pessoal")');
  E('cancelMoveCard()');
  // quadro apagado: volta pro Pessoal
  r = await QA.apagar(QUAL);
  await waitFor(() => !QA.estado().quadros.length);
  E('renderBacklog()'); await sleep(40);
  ok(r.ok && ptabs().join('|') === '*Pessoal' && P.L('tb__quadro_aberto') === '', 'apagou o quadro: volta pro Pessoal (e esquece o quadro aberto)');
  await QA.atualizar();
  E('renderBacklog()'); await sleep(40);
  ok(cols().includes(BETA) && cols().includes(GAMA) && cols().includes(proj.id), 'e as listas dele voltam pro Pessoal');
  E('closeAllSheets()');
  const errsB = P.errors.filter((e) => !/Not implemented: navigation/.test(e));
  ok(errsB.length === 0, 'sem erro de página' + (errsB.length ? ': ' + errsB[0].slice(0, 200) : ''));
  try { pw.close(); } catch (e) {}

  // =====================================================================================================
  console.log('\nC) PC: as abas dos quadros em cima das listas:');
  const S = makeServer();
  S.addUser('eu@teste.com', 'senha123', EU); S.addUser('ela@teste.com', 'senha123', ELA);
  const J = (k) => JSON.parse(DADOS.data[k]);
  const p0 = CORE.plan({ local: { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const row of p0.push[k]) S.tables[k].set(EU + '|' + row.id, { ...row, user_id: EU, updated_at: new Date(Date.now() + ++S.clock).toISOString() });
  const CASA = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  S.tables.quadros.set(CASA, { id: CASA, dono: ELA, nome: 'Casa', created_at: 'x', updated_at: 'x' });
  S.tables.quadros_membros.set(CASA + '|' + ELA, { quadro: CASA, membro: ELA, email: 'ela@teste.com', papel: 'dono' });
  S.tables.quadros_membros.set(CASA + '|' + EU, { quadro: CASA, membro: EU, email: 'eu@teste.com', papel: 'membro' });
  S.insert('listas', ELA, { id: 'col_geral', name: 'Geral', is_default: true, position: 1024 });
  S.insert('listas', ELA, { id: 'col_feira', name: 'FEIRA', position: 2048, quadro_id: CASA });
  S.insert('tarefas', ELA, { id: 'bl_f1', column_id: 'col_feira', title: 'Banana', position: 1024 });
  S.storedSession = { access_token: 'tok', user: { id: EU, email: 'eu@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + (f === 'sync.js' ? 'window.FAZ_SYNC_CORE_ONLY = true;' : '') + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
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
  const cw = dom.window, cd = cw.document, $c = (id) => cd.getElementById(id);
  const click = (el) => el.dispatchEvent(new cw.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(() => cd.querySelectorAll('section.col').length > 0, 8000);
  const FEIRA = CORE.sharedAlias(ELA, 'col_feira');
  await waitFor(() => cd.querySelector('#qb-bar [data-board="' + CASA + '"]'), 6000);
  const ctabs = () => [...cd.querySelectorAll('#qb-bar .qb-tab-wrap')].map((x) => (x.classList.contains('on') ? '*' : '') + T(x));
  const ccols = () => [...cd.querySelectorAll('#columns section.col')].map((s) => s.dataset.col);
  ok(T($c('tab-listas')) === 'Quadros' && !$c('qb-bar').classList.contains('hidden') && ctabs().join('|') === '*Pessoal|Casa' && !!cd.querySelector('#qb-bar [data-qb-new]'), 'a aba "Quadros", com as abas: Pessoal (aberta), Casa e "+ Novo quadro"');
  ok(!ccols().includes(FEIRA) && ccols().includes('col_geral') && cd.querySelector('#qb-bar [data-board="' + CASA + '"] .ph-users-three'), 'no Pessoal, só as suas (a FEIRA da Ela fica no quadro Casa, que tem o ícone de pessoas)');
  click(cd.querySelector('#qb-bar [data-board="' + CASA + '"]')); await sleep(60);
  ok(ctabs().join('|') === 'Pessoal|*Casa' && ccols().join() === FEIRA && cw.localStorage.getItem('faz_pc_quadro') === CASA && /quadro Casa/.test(T($c('board-summary'))), 'clicou em Casa: só a FEIRA (e o quadro fica guardado)');
  // lista nova no quadro aberto
  const dlgOk = async (val) => { await waitFor(() => !$c('dialog').classList.contains('hidden')); if (val != null) $c('dlg-input').value = val; click($c('dlg-ok')); await sleep(80); };
  click(cd.querySelector('#btn-new-list')); await dlgOk('ORÇAMENTO');
  await waitFor(() => S.alive('listas', EU).some((l) => l.name === 'ORÇAMENTO'));
  const orc = S.alive('listas', EU).find((l) => l.name === 'ORÇAMENTO');
  ok(orc && orc.quadro_id === CASA && ccols().includes(orc.id), 'lista nova no quadro aberto (vai pra nuvem com o quadro)');
  // mudar de quadro pelo menu da lista: volta pro Pessoal
  click(cd.querySelector('section.col[data-col="' + orc.id + '"] .col-menu-btn')); await sleep(30);
  const it = [...cd.querySelectorAll('body > div.fixed button')].map(T);
  ok(it.includes('Mudar de quadro…') && !it.includes('Compartilhar com um quadro…'), 'menu da lista: "Mudar de quadro…"');
  click([...cd.querySelectorAll('body > div.fixed button')].find((b) => T(b) === 'Mudar de quadro…')); await sleep(30);
  const opt = [...cd.querySelectorAll('body > div.fixed [data-share]')];
  ok(/^Pessoal\s*sem quadro/.test(opt.map((b) => T(b)).join('|')) && opt.some((b) => /Casa2pessoas/.test(T(b).replace(/\s/g, ''))), 'as opções: Pessoal e Casa (2 pessoas): ' + opt.map((b) => T(b)).join(' | '));
  click(opt.find((b) => b.dataset.share === '')); await dlgOk();
  await waitFor(() => S.get('listas', EU, orc.id).quadro_id === null);
  ok(S.get('listas', EU, orc.id).quadro_id === null && !ccols().includes(orc.id) && ctabs()[1] === '*Casa', 'tirou do Casa (perguntou antes, o quadro tem gente): a lista voltou pro Pessoal e você fica na Casa');
  // quadro novo (só seu) e trazer uma lista
  click(cd.querySelector('#qb-bar [data-qb-new]')); await dlgOk('Qualitê');
  await waitFor(() => ctabs().some((x) => /Qualitê/.test(x)), 6000);
  ok(ctabs().join('|') === 'Pessoal|Casa|*Qualitê' && !!cd.querySelector('#columns .qb-empty') && /Nenhuma lista no quadro Qualitê/.test(T($c('columns'))), 'novo quadro "Qualitê": abre vazio (com a "Nova lista" e o "Trazer uma lista")');
  click($c('qb-bring')); await sleep(30);
  const tr = [...cd.querySelectorAll('body > div.fixed [data-bring]')];
  ok(tr.length && tr.every((b) => b.dataset.bring !== 'col_geral' && !CORE.isShared(b.dataset.bring)), 'trazer: só as suas (sem a Geral e sem as dos outros)');
  click(tr.find((b) => b.dataset.bring === BETA)); await sleep(60);
  await waitFor(() => S.get('listas', EU, BETA).quadro_id);
  ok(S.get('listas', EU, BETA).quadro_id && ccols().join() === BETA, 'trouxe a BETA pro Qualitê');
  click(cd.querySelector('#qb-bar [data-board=""]')); await sleep(60);
  ok(!ccols().includes(BETA) && ccols().includes(orc.id) && cw.localStorage.getItem('faz_pc_quadro') === '', 'no Pessoal: a BETA não está mais (e a ORÇAMENTO voltou)');
  // o cartão: a lista separada por quadro
  const tb = S.alive('tarefas', EU).find((x) => x.column_id === GAMA);
  click(cd.querySelector('.card[data-id="' + tb.id + '"]')); await sleep(60);
  const groups = [...cd.querySelectorAll('#f-col optgroup')].map((g) => g.label);
  ok(groups.join('|') === 'Pessoal|Quadro Casa|Quadro Qualitê', 'no cartão, o campo "Lista" separado por quadro');
  ok(errors.length === 0, 'sem erro de página no PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  try { cw.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
