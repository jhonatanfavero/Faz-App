// V40.39.0 — BUSCA NAS LISTAS, no celular e no PC. Pedido dele (23/11, com foto do quadro do PC): "precisamos pesquisar
// também na aba listas". Escolheu "Filtrar as listas": cada lista mostra só os cartões que batem (nome, checklist e nome
// da tag, sem acento, cada palavra em qualquer lugar: as mesmas regras da busca da agenda) e o resto some até limpar.
//   A) celular: a lupa abre a busca; o filtro; "1 de 8" no nome da lista; as bolinhas viram números; a lista na tela sem
//      achado → vai pra primeira com achado; palavras marcadas (nome, checklist primeiro, tag); nada achado; o que for
//      criado/editado durante a busca continua na tela; o X e o voltar limpam; texto digitado não vira HTML;
//   B) PC: a barra só nas Listas; o filtro ("1 de 8", lista sem achado apagada com "Nada aqui"); "N cartões em M listas"
//      com as listas (clicar leva até ela); marcas; checklist onde achou; tarefa adicionada durante a busca fica; arrastar
//      com a busca põe o cartão logo depois do vizinho que aparece; Esc e o X limpam; "/" leva pro campo; outra aba.
// Uso: TZ='America/Sao_Paulo' node test_busca_listas.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

// Os dados de teste com nomes parecidos com os dele (foto de 23/11)
const C = { ALFA: 'col_geral', BETA: 'col_1700000007000', GAMA: 'col_1700000008000', DELTA: 'col_1700000009000', OMEGA: 'col_1700000010000' };
function prepare(d) { // d: { tags, tasks } (arrays do celular), muda no lugar
  d.tags.find((t) => t.id === 'tag_1700000004000').name = 'QUALITÊ'; // (roda também dentro do app: sem nada de fora)
  const byTitle = (s) => d.tasks.find((t) => t.title === s);
  byTitle('Tarefa 1').title = 'GEO TONIAL';                 // GAMA (1º da lista), tag QUALITÊ
  const t48 = byTitle('Tarefa 48');                         // GAMA (5º da lista), outra tag
  t48.title = 'GEO VALDIR BELUSSO';
  t48.tagId = 'tag_1700000005000';
  byTitle('Tarefa 8').title = 'Geo Fogaça';                 // BETA
  const t11 = byTitle('Tarefa 11');                         // ALFA: acha pelo checklist
  t11.title = 'DOCUMENTOS LUCIMAR';
  t11.microblocks = [{ title: 'Imprimir planta', done: true }, { title: 'Ligar pro cartório', done: false }];
  byTitle('Tarefa 12').title = '<img src=x onerror=alert(1)> geo injeção'; // ALFA: texto que não pode virar HTML
}

(async () => {
  // ======================================================================================================
  console.log('A) Celular:');
  const B = await boot(REPO, backup.data), { w, $ } = B, d = w.document;
  const ev = (x) => w.eval(x), J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const tick = () => sleep(30);
  ev(`(function(){ const d = { tags: tagsDb, tasks: backlogDb }; (${prepare.toString()})(d); saveTags && saveTags(); saveBacklog(); })()`);
  w.openListSheet(); w.switchListTab('backlog'); await tick();
  ok(ev('activeColumnId') === C.ALFA && !$('backlog-search-btn').classList.contains('hidden') && $('bl-search-row').classList.contains('hidden'), '(Listas aberta na ALFA; a lupa da busca no topo, a busca fechada)');
  w.openBacklogSearch(); await sleep(90);
  ok(!$('bl-search-row').classList.contains('hidden') && d.activeElement === $('bl-search-input'), 'a lupa abre o campo "Buscar nas listas" com o cursor nele');
  const type = async (q) => { $('bl-search-input').value = q; $('bl-search-input').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(220); };
  const colEl = (id) => d.querySelector(`#backlog-columns-wrapper > [data-column-id="${id}"]`);
  const cardIds = (id) => [...colEl(id).querySelectorAll('[data-bl-card]')].map((c) => c.dataset.blCard);
  const titleOf = (id) => J(`backlogDb.find((t) => t.id === ${JSON.stringify(id)}).title`);
  const dots = () => [...$('backlog-column-dots').children].map((b) => b.textContent.trim() || '·');
  await type('geo');
  const idFog = J(`backlogDb.find((t) => t.title === 'Geo Fogaça').id`), idTon = J(`backlogDb.find((t) => t.title === 'GEO TONIAL').id`), idVal = J(`backlogDb.find((t) => t.title === 'GEO VALDIR BELUSSO').id`);
  ok(cardIds(C.BETA).join() === idFog && cardIds(C.GAMA).join() === [idTon, idVal].join() && cardIds(C.DELTA).length === 0 && cardIds(C.ALFA).length === 1, '"geo": cada lista só com os cartões que batem (BETA 1, GAMA 2, ALFA 1, DELTA 0)');
  ok(dots().join(' ') === '1 1 2 · ·', 'as bolinhas viram o número de achados de cada lista (' + dots().join(' ') + ')');
  ok($('bl-search-info').textContent === '4 em 3 listas', 'o campo diz: "' + $('bl-search-info').textContent + '"');
  ok($('backlog-count').textContent === '1 de 27' && $('backlog-column-title').textContent === 'ALFA', 'o nome da lista na tela diz "1 de 27"');
  const fogH4 = d.querySelector(`[data-bl-card="${idFog}"] h4`);
  ok(fogH4.querySelector('mark.bl-hl') && fogH4.querySelector('mark.bl-hl').textContent === 'Geo' && fogH4.textContent === 'Geo Fogaça', 'a palavra achada fica marcada no nome ("Geo" Fogaça)');
  const inj = d.querySelector(`#backlog-columns-wrapper [data-column-id="${C.ALFA}"] [data-bl-card] h4`);
  ok(inj && !inj.querySelector('img') && inj.textContent.indexOf('<img src=x') === 0 && inj.querySelector('mark.bl-hl').textContent === 'geo', 'texto digitado no nome não vira HTML (só a marca entra)');
  // sem achado na lista da tela → vai pra primeira que tem
  await type('fogaca');
  ok(dots().join(' ') === '· 1 · · ·' && ev('activeColumnId') === C.BETA && $('backlog-column-title').textContent === 'BETA' && $('backlog-count').textContent === '1 de 8', 'sem acento ("fogaca"): a ALFA não tem nada, então vai sozinho pra BETA ("1 de 8")');
  ok(d.querySelector(`[data-bl-card="${idFog}"] mark.bl-hl`).textContent === 'Fogaça', '...e marca "Fogaça", com o ç');
  ok(/Nada nesta lista com essa busca/.test(colEl(C.ALFA).textContent) && /Os números embaixo do nome mostram onde achou/.test(colEl(C.ALFA).textContent), 'a lista sem achado explica: "Nada nesta lista com essa busca"');
  // várias palavras: nome + tag
  await type('geo qualite');
  ok(cardIds(C.GAMA).join() === idTon && cardIds(C.BETA).length === 0 && ev('activeColumnId') === C.GAMA, '"geo qualite": só o GEO TONIAL (tag QUALITÊ, sem acento) e vai pra GAMA');
  const tonP = d.querySelector(`[data-bl-card="${idTon}"] p`);
  ok(/· QUALITÊ$/.test(tonP.textContent) && tonP.querySelector('mark.bl-hl').textContent === 'QUALITÊ', 'achou pela tag: o nome dela aparece marcado ("· QUALITÊ")');
  // checklist
  await type('cartorio');
  const idDoc = J(`backlogDb.find((t) => t.title === 'DOCUMENTOS LUCIMAR').id`);
  const docItems = [...d.querySelectorAll(`[data-bl-card="${idDoc}"] .flex.flex-col span.truncate`)].map((s) => s.textContent);
  ok(ev('activeColumnId') === C.ALFA && cardIds(C.ALFA).join() === idDoc && docItems[0] === 'Ligar pro cartório' && d.querySelector(`[data-bl-card="${idDoc}"] .flex.flex-col mark.bl-hl`).textContent === 'cartório', 'pelo checklist: o item onde achou vem primeiro, marcado ("cartório")');
  // nada
  await type('xyz123');
  ok($('bl-search-info').textContent === 'Nada' && /Nenhum cartão com essa busca/.test(colEl(ev('activeColumnId')).textContent) && dots().every((x) => x === '·'), 'nada achado: "Nada" no campo e "Nenhum cartão com essa busca" na lista');
  // o que é criado ou editado durante a busca continua na tela
  await type('geo');
  w.scrollToColumn(C.BETA); await tick();
  w.openBacklogForm(); $('backlog-input').value = 'Comprar pão'; w.saveBacklogForm(); await tick();
  const idPao = J(`backlogDb.find((t) => t.title === 'Comprar pão').id`);
  ok(cardIds(C.BETA).join() === [idFog, idPao].join() && $('backlog-count').textContent === '2 de 9', 'tarefa nova durante a busca aparece na lista mesmo sem bater ("2 de 9")');
  w.openBacklogForm(idFog); $('backlog-input').value = 'Fogaça (sem a palavra)'; w.saveBacklogForm(); await tick();
  ok(cardIds(C.BETA).includes(idFog) && titleOf(idFog) === 'Fogaça (sem a palavra)', 'editada durante a busca (sem a palavra): continua na tela');
  await type('geo ');
  ok(cardIds(C.BETA).length === 2, '(mesma busca com espaço a mais: nada muda)');
  await type('geo t');
  ok(!cardIds(C.BETA).includes(idPao) && !cardIds(C.BETA).includes(idFog), 'palavra nova: as que não batem saem');
  // o X fecha e limpa
  w.closeBacklogSearch(); await tick();
  ok($('bl-search-row').classList.contains('hidden') && $('bl-search-input').value === '' && cardIds(C.BETA).length === 9 && /^\d+$/.test($('backlog-count').textContent) && dots().every((x) => x === '·') && !d.querySelector('#backlog-columns-wrapper mark'), 'o X fecha a busca: todas as tarefas de volta, sem marcas, bolinhas normais');
  // o voltar do celular fecha a busca (não a tela)
  w.openBacklogSearch(); await sleep(90); await type('geo');
  ok(ev('navBack()') === true && $('bl-search-row').classList.contains('hidden') && ev('blSearchQ') === '' && !$('list-sheet').classList.contains('translate-y-full'), 'o voltar fecha a busca primeiro (a Lista continua aberta)');
  ok(B.errors.length === 0, 'celular: nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // ======================================================================================================
  console.log('\nB) PC:');
  const PU = '77777777-7777-7777-7777-777777777777', ps = makeServer();
  ps.addUser('pessoa@teste.com', 'senha123', PU);
  const JB = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: JB('tb_backlog_db'), listas: JB('tb_backlog_columns'), tags: JB('tb_tags_db'), blocos: JB('tb_master_db'), rotinas: JB('tb_routines_db') };
  prepare({ tags: local.tags, tasks: local.tarefas });
  const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of (p0.push[k] || [])) ps.tables[k].set(PU + '|' + r.id, { ...r, user_id: PU, updated_at: ++ps.clock });
  ps.storedSession = { access_token: 'tok', user: { id: PU, email: 'pessoa@teste.com', user_metadata: {} } };
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
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(ps) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.alert = () => errors.push('alert() chamado');
      pw.HTMLElement.prototype.scrollTo = function (o) { this.scrollLeft = o && o.left != null ? o.left : this.scrollLeft; };
    },
  });
  const pw = dom.window, pd = pw.document, P = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const key = (el, k) => { const e = new pw.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const visible = (id) => !P(id).classList.contains('hidden');
  const rows = (t) => ps.alive(t, PU);
  await waitFor(() => pd.querySelectorAll('section.col').length === 5);
  const sec = (id) => pd.querySelector(`section.col[data-col="${id}"]`);
  const ids = (id) => [...sec(id).querySelectorAll('.card')].map((c) => c.dataset.id);
  const badge = (id) => T(sec(id).querySelector('header > span'));
  const search = async (q) => { const i = P('ls-search'); i.value = q; i.dispatchEvent(new pw.Event('input', { bubbles: true })); await sleep(200); };
  ok(visible('ls-bar') && P('ls-search').placeholder === 'Buscar nas listas' && T(P('ls-info')) === '', 'nas Listas, a barra com "Buscar nas listas" (sem busca, nada embaixo)');
  const pid = (title) => rows('tarefas').find((t) => t.title === title).id;
  await search('geo');
  ok(ids(C.BETA).join() === pid('Geo Fogaça') && ids(C.GAMA).join() === [pid('GEO TONIAL'), pid('GEO VALDIR BELUSSO')].join() && ids(C.DELTA).length === 0, '"geo": cada lista só com os cartões que batem');
  ok(badge(C.BETA) === '1 de 8' && badge(C.GAMA) === '2 de 6' && badge(C.DELTA) === '0 de 10', 'o número no topo da lista vira "1 de 8"');
  ok(sec(C.DELTA).classList.contains('ls-miss') && T(sec(C.DELTA).querySelector('.ls-none')) === 'Nada aqui com essa busca' && !sec(C.GAMA).classList.contains('ls-miss'), 'lista sem achado: apagada, com "Nada aqui com essa busca"');
  const chips = () => [...P('ls-info').querySelectorAll('[data-ls-go]')].map((b) => T(b.querySelector('span')) + ' ' + T(b.querySelector('b')));
  ok(/^4 cartões em 3 listas/.test(T(P('ls-info'))) && chips().join(' | ') === 'ALFA 1 | BETA 1 | GAMA 2', 'embaixo do campo: "4 cartões em 3 listas" e as listas com quantos (' + chips().join(', ') + ')');
  const fogP = pd.querySelector(`.card[data-id="${pid('Geo Fogaça')}"] p`);
  ok(fogP.querySelector('mark.ag-hl') && fogP.querySelector('mark.ag-hl').textContent === 'Geo', 'a palavra achada fica marcada no cartão');
  const injP = pd.querySelector(`.card[data-id="${pid('<img src=x onerror=alert(1)> geo injeção')}"] p`);
  ok(injP && !injP.querySelector('img') && /^<img src=x/.test(T(injP)), 'texto digitado no nome não vira HTML');
  click(P('ls-info').querySelector(`[data-ls-go="${C.GAMA}"]`));
  ok(sec(C.GAMA).classList.contains('ag-found'), 'clicar na lista leva o quadro até ela (e ela pisca)');
  await search('geo qualite');
  const tonTag = pd.querySelector(`.card[data-id="${pid('GEO TONIAL')}"] .mt-1\\.5 mark.ag-hl`);
  ok(ids(C.GAMA).join() === pid('GEO TONIAL') && ids(C.BETA).length === 0 && tonTag && tonTag.textContent === 'QUALITÊ', '"geo qualite": só o GEO TONIAL, com a tag marcada');
  await search('cartorio');
  const hit = pd.querySelector(`.card[data-id="${pid('DOCUMENTOS LUCIMAR')}"] .ls-hits`);
  ok(ids(C.ALFA).join() === pid('DOCUMENTOS LUCIMAR') && hit && T(hit) === 'Ligar pro cartório' && hit.querySelector('mark.ag-hl').textContent === 'cartório', 'pelo checklist: o cartão mostra o item onde achou, marcado');
  await search('xyz123');
  ok(/^Nenhum cartão com “xyz123”\./.test(T(P('ls-info'))) && pd.querySelectorAll('section.col.ls-miss').length === 5, 'nada achado: "Nenhum cartão com “xyz123”." e todas as listas apagadas');
  // tarefa adicionada durante a busca continua na tela
  await search('geo');
  click(sec(C.DELTA).querySelector('.add-btn')); await sleep(30);
  const ta = sec(C.DELTA).querySelector('textarea.composer-input');
  ta.value = 'Comprar pão'; ta.dispatchEvent(new pw.Event('input', { bubbles: true })); key(ta, 'Enter');
  await waitFor(() => rows('tarefas').some((t) => t.title === 'Comprar pão')); await sleep(80);
  ok(ids(C.DELTA).join() === pid('Comprar pão') && badge(C.DELTA) === '1 de 11', 'tarefa adicionada durante a busca aparece na lista mesmo sem bater ("1 de 11")');
  key(pd.querySelector('textarea.composer-input') || pd.body, 'Escape'); await sleep(30);
  // arrastar com a busca: entra logo depois do vizinho que aparece (não no meio dos escondidos)
  const dt = { setData() {}, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el) => { const e = new pw.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientY', { value: 10 }); el.dispatchEvent(e); };
  const fogId = pid('Geo Fogaça');
  dragEv('dragstart', pd.querySelector(`.card[data-id="${fogId}"]`)); await sleep(30);
  dragEv('dragover', sec(C.GAMA).querySelector('.col-list'));
  dragEv('drop', sec(C.GAMA).querySelector('.col-list'));
  await waitFor(() => ps.get('tarefas', PU, fogId).column_id === C.GAMA); await sleep(60);
  const gamaOrder = rows('tarefas').filter((t) => t.column_id === C.GAMA && !t.archived).sort((a, b) => a.position - b.position).map((t) => t.title);
  ok(gamaOrder.indexOf('Geo Fogaça') === gamaOrder.indexOf('GEO VALDIR BELUSSO') + 1 && gamaOrder[gamaOrder.length - 1] !== 'Geo Fogaça', 'arrastar pro fim da GAMA com a busca: entra logo depois do GEO VALDIR (o último que aparece), não no fim da lista (' + gamaOrder.join(', ') + ')');
  ok(ids(C.GAMA).join() === [pid('GEO TONIAL'), pid('GEO VALDIR BELUSSO'), fogId].join(), '...e na tela aparece logo depois dele');
  // Esc no campo limpa; de novo, sai do campo
  P('ls-search').focus();
  key(P('ls-search'), 'Escape'); await sleep(30);
  ok(P('ls-search').value === '' && pd.querySelectorAll('section.col.ls-miss').length === 0 && badge(C.DELTA) === '11' && !pd.querySelector('#columns mark') && T(P('ls-info')) === '', 'Esc no campo limpa: todas as tarefas de volta, sem marcas');
  key(P('ls-search'), 'Escape');
  ok(pd.activeElement !== P('ls-search'), 'Esc de novo (campo vazio): sai do campo');
  // "/" leva pro campo
  const slash = key(pd.body, '/');
  ok(slash.defaultPrevented && pd.activeElement === P('ls-search'), '"/" fora de campo leva o cursor pra busca das Listas');
  await search('geo');
  click(P('ls-search-x')); await sleep(30);
  ok(P('ls-search').value === '' && !pd.querySelector('section.col.ls-miss') && P('ls-search-x').classList.contains('hidden'), 'o × limpa a busca');
  // só nas Listas
  await search('geo');
  click(P('tab-agenda')); await sleep(40);
  ok(!visible('ls-bar'), 'na Agenda a barra some');
  click(P('tab-listas')); await sleep(40);
  ok(visible('ls-bar') && P('ls-search').value === 'geo' && badge(C.BETA) === '0 de 7', 'voltando pras Listas, a busca continua como estava');
  ok(errors.length === 0, 'PC: nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { pw.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
