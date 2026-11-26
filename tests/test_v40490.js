// V40.49.0 — PEDIDOS DELE DE 26/11, À TARDE (com fotos):
//   A) celular, topo da agenda "Semana em tira": a data com o "Hoje" (selo hoje, botão nos outros dias), os 7 dias de
//      segunda a domingo (o aberto aceso, a bolinha nos dias com bloco), tocar vai pro dia, arrastar a tira troca a semana;
//      o ⋯ com Ocultar concluídos, Compactar os vagos, Dias na tela, Filtrar por tag, Pensamento do dia e Esconder o topo
//      (aceso quando algo está ligado); sem as setas, o ⓘ dos atrasados, o TAGs e o Relatórios;
//   B) celular: rolando a agenda pra baixo (o dedo, não o app rolando sozinho), o topo vira uma linha só (a data e o
//      Planejado); no alto da agenda, ou tocando, volta;
//   C) celular: a janelinha do quadro (o botão de compartilhar ao lado do nome, nas abas), por cima das listas; a
//      Config sem os Quadros; o + do Android: a cor da barra de baixo (manifest) e o pé que sobe quando a barra fica por
//      cima sem avisar (fazNavGap);
//   D) PC: as Configurações por tópicos (um aberto por vez, cada um diz como está); o período novo só no "Adicionar
//      período"; a busca na mesma linha das abas dos quadros; a janelinha do quadro pelo botão de compartilhar.
// Uso: TZ='America/Sao_Paulo' node tests/test_v40490.js <repo> <dados-ficticios.json>
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

(async () => {
  console.log('A) Topo da agenda: Semana em tira e o ⋯');
  const A = await boot(REPO, DADOS.data), w = A.w, d = w.document, $ = A.$, ev = (x) => w.eval(x);
  const hidden = (id) => $(id).classList.contains('hidden');
  const days = () => [...d.querySelectorAll('#header-filters-row [data-agw]')];
  ev('activeDateObj = new Date(2026, 10, 18); runRealTimeEngine(); renderTimeline();');
  ok(days().length === 7 && days().map((b) => T(b.querySelector('.agw-l'))).join('') === 'STQQSSD' && days()[0].dataset.agw === '2026-11-16' && days()[6].dataset.agw === '2026-11-22', 'a tira: os 7 dias da semana do dia aberto, de segunda (16) a domingo (22)');
  ok(days().filter((b) => b.classList.contains('on')).map((b) => b.dataset.agw).join() === '2026-11-18', 'o dia aberto (18) aceso');
  const comBloco = ev("JSON.stringify([...new Set(db.filter(b => b.type !== 'empty').map(b => b.date))])");
  ok(days().every((b) => b.querySelector('.agw-b').classList.contains('tem') === JSON.parse(comBloco).includes(b.dataset.agw)), 'a bolinha só nos dias que têm bloco');
  ok(!$('header-btns-cluster').querySelector('[onclick="debugPreviousDay()"], [onclick="debugAdvanceDay()"], [onclick="toggleHeader()"]') && !$('filter-delayed-btn') && !$('filter-completed-btn') && !d.querySelector('#header-filters-row button[onclick="openReportsSheet()"]'), 'saíram as setas, o Hoje, o ⌃, o ⓘ dos atrasados, o ✓ e o Relatórios do topo');
  const chip = $('ag-today-chip'), hoje = ev('getTodayStr()');
  ok(!chip.disabled && /Hoje/.test(T(chip)) && !chip.classList.contains('is-today') && chip.getAttribute('aria-label') === 'Voltar pra hoje', 'fora de hoje: o "Hoje" é um botão (volta pra hoje)');
  chip.click(); await sleep(20);
  ok(ev('getActiveDateStr()') === hoje && chip.disabled && chip.classList.contains('is-today'), 'tocou: foi pra hoje e o "Hoje" virou selo');
  ok(days().find((b) => b.dataset.agw === hoje).classList.contains('hj'), 'hoje com o número na cor do app');
  days()[2].click(); await sleep(20);
  ok(ev('getActiveDateStr()') === days()[2].dataset.agw && days()[2].classList.contains('on'), 'tocar num dia da tira vai pra ele');
  const strip = $('header-filters-row'), sd = ev('getActiveDateStr()');
  const fire = (target, type, pts, changed) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); e.changedTouches = (changed || pts).map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); };
  fire(strip, 'touchstart', [[300, 60]]); fire(strip, 'touchend', [], [[150, 64]]);
  const next = new Date(sd + 'T12:00:00'); next.setDate(next.getDate() + 7);
  ok(ev('getActiveDateStr()') === next.toISOString().slice(0, 10), 'arrastar a tira pra esquerda: a semana seguinte (o mesmo dia da semana)');
  fire(strip, 'touchstart', [[100, 60]]); fire(strip, 'touchend', [], [[260, 60]]);
  ok(ev('getActiveDateStr()') === sd, 'pra direita: volta a semana');
  // o ⋯
  ok(!$('ag-more-btn').classList.contains('on') && hidden('ag-more-modal'), 'o ⋯ apagado (nada ligado), fechado');
  $('ag-more-btn').click(); await sleep(10);
  ok(!hidden('ag-more-modal') && !$('overlay').classList.contains('pointer-events-none'), 'tocou: abre as opções (com o fundo escuro)');
  ok(['ag-done-btn', 'tl-compact-btn', 'ag-filter-btn', 'ag-head-btn'].every((id) => $('ag-more-modal').contains($(id))) && d.querySelectorAll('#ag-days-seg [data-ag-days]').length === 3, 'Ocultar concluídos, Compactar os vagos, Dias na tela (1, 2, 3), Filtrar por tag, Pensamento do dia e Esconder o topo');
  $('ag-done-btn').click(); await sleep(10);
  ok(ev('agHideDone') === true && $('ag-done-btn').getAttribute('aria-checked') === 'true' && $('ag-more-btn').classList.contains('on') && !hidden('ag-more-modal'), 'a chave liga (o ⋯ continua aberto e fica aceso)');
  $('ag-done-btn').click(); $('tl-compact-btn').click(); await sleep(10);
  ok(ev('agHideDone') === false && ev('tlCompact') === true && $('tl-compact-btn').getAttribute('aria-checked') === 'true' && $('ag-more-btn').classList.contains('on'), 'Compactar os vagos liga pela chave dele');
  $('tl-compact-btn').click(); await sleep(10);
  ok(!$('ag-more-btn').classList.contains('on'), 'tudo desligado: o ⋯ apaga');
  ok(ev('navButton(document.getElementById("ag-more-modal")).textContent').trim() === 'Fechar', 'o voltar do celular fecha o ⋯');
  $('ag-filter-btn').click(); await sleep(10);
  ok(hidden('ag-more-modal') && !hidden('ag-filter-modal') && T($('ag-filter-title')) === 'Filtrar por tag', '"Filtrar por tag" fecha o ⋯ e abre a janelinha da tag');
  ev('closeAgFilter()');
  ev('openAgMore()'); d.querySelector('#ag-head-btn').click(); await sleep(80);
  ok(ev('headerHidden') === true && hidden('header-filters-row') && hidden('header-progress-row'), '"Esconder o topo": a tira e o Planejado somem');
  ev('openAgMore()'); await sleep(10);
  ok(T($('ag-head-txt')) === 'Mostrar o topo', 'e no ⋯ vira "Mostrar o topo"');
  $('ag-head-btn').click(); await sleep(80);
  ok(ev('headerHidden') === false && !hidden('header-filters-row'), 'mostrou de novo');
  ev("localStorage.setItem('tb_thought_read_date', '0000-00-00'); updateThoughtBtnVisibility();");
  ok($('thought-btn-wrap').style.display !== 'none' && $('header-btns-cluster').contains($('thought-btn-wrap')), 'o pensamento do dia ainda não lido aparece do lado da busca');

  console.log('\nB) Rolando a agenda: o topo vira uma linha só');
  const sc = $('timeline-scroll'), H = d.querySelector('header');
  ok(!H.classList.contains('ag-slim'), 'parado: o topo inteiro');
  sc.scrollTop = 500; sc.dispatchEvent(new w.Event('scroll')); await sleep(10);
  ok(!H.classList.contains('ag-slim'), 'o app rolando sozinho (sem dedo): não encolhe');
  sc.dispatchEvent(new w.Event('touchstart')); sc.scrollTop = 700; sc.dispatchEvent(new w.Event('scroll')); await sleep(10);
  ok(H.classList.contains('ag-slim'), 'rolando com o dedo pra baixo: encolhe');
  const pct = (/\((\d+)%\)/.exec($('progress-text').textContent) || [])[1];
  ok(T($('ag-slim-pct')) === pct + '%' && $('ag-slim-fill').style.width === pct + '%', 'a linha mostra o Planejado (' + pct + '%)');
  $('ag-slim-bar').click(); await sleep(10);
  ok(!H.classList.contains('ag-slim'), 'tocar na linha abre o topo de novo');
  sc.dispatchEvent(new w.Event('touchstart')); sc.scrollTop = 900; sc.dispatchEvent(new w.Event('scroll')); await sleep(10);
  sc.scrollTop = 10; sc.dispatchEvent(new w.Event('scroll')); await sleep(10);
  ok(!H.classList.contains('ag-slim'), 'voltando pro alto da agenda: o topo inteiro');
  ev('toggleHeader()'); sc.dispatchEvent(new w.Event('touchstart')); sc.scrollTop = 600; sc.dispatchEvent(new w.Event('scroll')); await sleep(10);
  ok(!H.classList.contains('ag-slim'), 'com o topo já escondido (Esconder o topo), não muda');
  ev('toggleHeader()');
  const css = fs.readFileSync(path.join(REPO, 'style.css'), 'utf8');
  ok(/header\.ag-slim #header-filters-row[^{]*\{ display: none !important; \}/.test(css) && /header\.ag-slim \.ag-slim-bar \{ display: flex; \}/.test(css), 'CSS: encolhido, a tira, o Planejado e os botões somem; a linha aparece');

  console.log('\nC) Celular: a janelinha do quadro, a Config e o Android');
  const QD = { id: '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa', nome: 'Casa', dono: EU, souDono: true, membros: [{ membro: EU, email: 'voce@email.com', papel: 'dono', eu: true }, { membro: ELA, email: 'ela@email.com', papel: 'membro', eu: false }], listas: [] };
  ev(`window.__qdReal = window.fazQuadros; window.fazQuadros = Object.assign({}, window.__qdReal, { estado: () => ({ configurado: true, logado: true, off: false, uid: '${EU}', email: 'voce@email.com', quadros: [${JSON.stringify(QD)}], carregado: true }), atualizar: () => Promise.resolve({ ok: true }) });`);
  ev(`closeAllSheets(); openListSheet(); switchListTab('backlog'); blSetBoard('${QD.id}');`); await sleep(30);
  const share = d.querySelector('#qb-tabs .qb-opt');
  ok(!!share && !!share.querySelector('.ph-share-network') && /Compartilhar/.test(share.getAttribute('title')) && /Compartilhar o quadro Casa/.test(share.getAttribute('aria-label')), 'a aba aberta tem o botão de compartilhar (era o ⋯)');
  share.click(); await sleep(30);
  ok(!hidden('board-modal') && !$('list-sheet').classList.contains('translate-y-full') && $('config-sheet').classList.contains('translate-y-full'), 'abre a janelinha do quadro ali mesmo, por cima das listas (não vai pra Config)');
  ok(T($('qd-d-name')) === 'Casa' && /2 pessoas · 0 listas · você criou/.test(T($('qd-d-sub'))) && !hidden('qd-d-rename') && !hidden('qd-d-add') && !hidden('qd-d-delete') && hidden('qd-d-leave'), 'o nome com o lápis, as pessoas, o "Pôr" e o Apagar (você criou)');
  ok($('board-modal').hasAttribute('data-sync-livre'), 'com ela aberta, a sincronização continua (data-sync-livre)');
  ev('qdRename()'); await sleep(20);
  ok(!hidden('quadro-name-modal') && $('quadro-name-title').innerText === 'Renomear o quadro' && $('quadro-name-input').value === 'Casa', 'o lápis abre o nome por cima');
  ev('cancelQuadroName()'); await sleep(10);
  ok(!hidden('board-modal') && !$('overlay').classList.contains('pointer-events-none'), 'cancelou: a janelinha do quadro continua, com o fundo escuro');
  ok(ev('navButton(document.getElementById("board-modal")).textContent').trim() === 'Fechar', 'o voltar do celular fecha a janelinha');
  ev('closeBoardModal()'); await sleep(10);
  ok(hidden('board-modal'), 'fechou');
  ev(`window.fazQuadros = window.__qdReal; blSetBoard(''); closeAllSheets(); openConfigSheet();`);
  ok(!$('config-sheet').textContent.includes('Quadros') && !$('config-quadros-view'), 'a Config não tem mais os Quadros');
  ev('closeAllSheets()');
  const man = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
  ok(man.theme_color === '#f8fafc' && man.background_color === '#f8fafc', 'a barra de baixo do Android: a cor do app (#f8fafc, era o vermelho #ef4444 do manifest)');
  // o pé sobe quando a barra de navegação fica por cima sem avisar
  const gap = (ua, standalone, screenH, innerH) => {
    Object.defineProperty(w.navigator, 'userAgent', { value: ua, configurable: true });
    w.matchMedia = (q) => ({ matches: standalone && /standalone/.test(q), addListener() {}, removeListener() {} });
    Object.defineProperty(w.screen, 'height', { value: screenH, configurable: true });
    Object.defineProperty(w, 'innerHeight', { value: innerH, configurable: true });
    return ev('fazNavGap()') + '|' + d.documentElement.style.getPropertyValue('--faz-nav-gap');
  };
  const AND = 'Mozilla/5.0 (Linux; Android 15; SM-A546E) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36';
  ok(gap(AND, true, 842, 808) === '48|48px', 'Android, app instalado, a tela do app até o fim da tela (só a barra de cima de fora): o pé sobe 48 px');
  ok(gap(AND, true, 842, 760) === '0|0px', 'a barra de baixo fora da tela do app: 0');
  ok(gap(AND, false, 842, 808) === '0|0px', 'no navegador (não instalado): 0');
  ok(gap('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', true, 844, 844) === '0|0px', 'iPhone: 0');
  ok(/--faz-safe-bottom: max\(env\(safe-area-inset-bottom, 0px\), var\(--faz-nav-gap, 0px\)\)/.test(css) && /#fab-btn, #list-btn \{ bottom: max\(2rem, calc\(var\(--faz-safe-bottom\) \+ 0\.75rem\)\) !important; \}/.test(css), 'CSS: o + e o "60 itens" (e o pé das telas) usam o --faz-safe-bottom');
  ok(A.errors.length === 0, 'sem erro no celular' + (A.errors.length ? ': ' + A.errors[0] : ''));

  console.log('\nD) PC: Configurações por tópicos, períodos, busca na linha das abas e a janelinha do quadro');
  const S = makeServer();
  S.addUser('eu@teste.com', 'senha123', EU); S.addUser('ela@teste.com', 'senha123', ELA);
  const J = (k) => JSON.parse(DADOS.data[k]);
  const p0 = CORE.plan({ local: { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const row of p0.push[k]) S.tables[k].set(EU + '|' + row.id, { ...row, user_id: EU, updated_at: new Date(Date.now() + ++S.clock).toISOString() });
  const CASA = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  S.tables.quadros.set(CASA, { id: CASA, dono: EU, nome: 'Casa', created_at: 'x', updated_at: 'x' });
  S.tables.quadros_membros.set(CASA + '|' + EU, { quadro: CASA, membro: EU, email: 'eu@teste.com', papel: 'dono' });
  S.tables.quadros_membros.set(CASA + '|' + ELA, { quadro: CASA, membro: ELA, email: 'ela.com.um.email.bem.comprido.pra.quebrar@teste.com', papel: 'membro' });
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
  await waitFor(() => cd.querySelector('#qb-bar [data-board="' + CASA + '"]'), 6000);
  ok($c('lq-row').contains($c('qb-bar')) && $c('lq-row').contains($c('ls-bar')) && !$c('ls-bar').contains($c('ls-info')), 'as abas dos quadros e a busca na mesma linha; o "achou em" numa linha própria, embaixo');
  ok(!$c('ls-bar').classList.contains('hidden') && !$c('qb-bar').classList.contains('hidden'), 'as duas aparecem na aba Quadros');
  // Configurações por tópicos
  click($c('btn-cfg')); await sleep(30);
  const secs = [...cd.querySelectorAll('#cfg-secs .cfg-sec')];
  ok(secs.map((s) => s.dataset.cfgSec).join() === 'cor,horario,periodos,avisos,backup' && secs.every((s) => !s.classList.contains('open') && s.querySelector('.cfg-sec-b').classList.contains('hidden')), 'Configurações: 5 tópicos (Cor, Horário, Períodos, Avisos, Backup), todos fechados');
  const nPer = () => { const s = T($c('cfg-s-periodos')); return s === 'Nenhum' ? 0 : parseInt(s, 10); }, n0 = nPer();
  ok(/07:00 às 24:00/.test(T($c('cfg-s-horario'))) && /^(Nenhum|\d+ períodos?)$/.test(T($c('cfg-s-periodos'))) && /Índigo|Verde|Cor própria|Vermelho|Azul|Âmbar|Roxo|Rosa|Turquesa/.test(T($c('cfg-s-cor'))) && T($c('cfg-s-avisos')) !== '', 'cada tópico fechado diz como está ("' + T($c('cfg-s-horario')) + '", "' + T($c('cfg-s-periodos')) + '"…)');
  ok(!cd.querySelector('#modal-cfg #cfg-qd') && !/Quadros/.test(T($c('modal-cfg'))), 'sem os Quadros (foram pro botão de compartilhar, nas abas)');
  click(cd.querySelector('[data-cfg-open="periodos"]'));
  const open = () => secs.filter((s) => s.classList.contains('open')).map((s) => s.dataset.cfgSec).join();
  ok(open() === 'periodos' && cd.querySelector('[data-cfg-open="periodos"]').getAttribute('aria-expanded') === 'true' && !$c('cfg-sec-periodos').classList.contains('hidden') && $c('cfg-sec-cor').classList.contains('hidden'), 'abrir Períodos: aparece a lista (só ele aberto)');
  ok($c('cfg-per-box').classList.contains('hidden') && !$c('cfg-per-new').classList.contains('hidden'), 'os campos do período novo escondidos; o "Adicionar período" à mostra');
  click($c('cfg-per-new'));
  ok(!$c('cfg-per-box').classList.contains('hidden') && $c('cfg-per-new').classList.contains('hidden'), '"Adicionar período": aparecem os campos');
  $c('cfg-per-name').value = 'Madrugada';
  click($c('cfg-per-cancel'));
  ok($c('cfg-per-box').classList.contains('hidden') && $c('cfg-per-name').value === '', 'Cancelar esconde e limpa');
  click($c('cfg-per-new'));
  $c('cfg-per-name').value = 'Plantão extra';
  const change = (el, v) => { el.value = v; el.dispatchEvent(new cw.Event('change', { bubbles: true })); };
  const setTime = (id, h, m) => { const box = cd.querySelector('[data-time-for="' + id + '"]'); change(box.querySelector('.time-h'), String(h)); change(box.querySelector('.time-m'), String(m)); };
  setTime('cfg-per-st', 18, 0); setTime('cfg-per-en', 22, 0);
  click($c('cfg-per-add'));
  await waitFor(() => /Plantão extra/.test(T($c('cfg-pers'))) && $c('cfg-per-box').classList.contains('hidden'));
  ok(/Plantão extra/.test(T($c('cfg-pers'))) && $c('cfg-per-box').classList.contains('hidden') && !$c('cfg-per-new').classList.contains('hidden') && nPer() === n0 + 1, 'criou: os campos fecham e o tópico conta mais um ("' + T($c('cfg-s-periodos')) + '")');
  click(cd.querySelector('[data-cfg-open="horario"]'));
  ok(open() === 'horario', 'abrir outro tópico fecha o anterior (um por vez)');
  click(cd.querySelector('[data-cfg-open="horario"]'));
  ok(open() === '', 'tocar de novo fecha');
  click($c('cfg-close')); await sleep(20);
  // a janelinha do quadro
  click(cd.querySelector('#qb-bar [data-board="' + CASA + '"]')); await sleep(30);
  const sh = cd.querySelector('#qb-bar [data-qb-opt]');
  ok(!!sh && !!sh.querySelector('.ph-share-network'), 'a aba Casa aberta: o botão de compartilhar');
  click(sh); await waitFor(() => /Casa/.test(T($c('qb-box'))));
  ok(!$c('modal-qb').classList.contains('hidden') && /2 pessoas · 0 listas · você criou/.test(T($c('qb-box'))) && /Nenhuma lista ainda: no quadro, "Trazer uma lista"/.test(T($c('qb-box'))), 'abre a janelinha do quadro (o resumo e a dica nova)');
  ok(cd.querySelector('#qb-box p[style*="overflow-wrap"]') !== null, 'o resumo quebra e-mail comprido (não vaza da janelinha)');
  cd.dispatchEvent(new cw.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok($c('modal-qb').classList.contains('hidden'), 'Esc fecha');
  ok(errors.length === 0, 'sem erro no PC' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
