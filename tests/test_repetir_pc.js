// V40.36.0 — PC: REPETIR BLOCO e os 3 PONTINHOS NA VISÃO DIA (o "Repetir Tarefa" do celular: todo dia, toda semana ou
// todo mês, quantas vezes). Confere: o menu dos 3 pontinhos (Semana e Dia; no Dia, segurar os 3 pontinhos não arrasta o
// bloco); a janela (padrões 5/4/2 como no celular, −/+, digitar, máximo, a lista dos dias com o horário ocupado ficando
// de fora, o resumo); o que é criado (igual ao Duplicar: checklist e cartões desmarcados, sem notas, a meta junto, o tipo
// pelo horário); o dia ocupado não é tocado; todo mês no dia 31; um passo só do Desfazer; Esc/Cancelar/fundo/Enter; o que
// chega da nuvem com a janela aberta; bloco apagado em outro aparelho.
// Uso: TZ='America/Sao_Paulo' node test_repetir_pc.js <repo> <dados-ficticios.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 4000, step = 30) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

const server = makeServer();
server.addUser('pessoa@teste.com', 'senha123', UID);
const J = (k) => JSON.parse(backup.data[k]);
const local = { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db'), rotinas: J('tb_routines_db'), notas: J('tb_notes_db'), financas: J('tb_financial_db') };
const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p0.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
const ins = (t, r) => server.tables[t].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
const B = (o) => Object.assign({ type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, cards: null, deleted: false, goal_id: null }, o);
const tag0 = local.tags[0].id, note0 = local.notas[0].id;
ins('metas_listas', { id: 'gl_pessoal', name: 'Pessoal', position: 1000, deleted: false });
ins('metas', { id: 'meta_ler', list_id: 'gl_pessoal', title: 'Ler', emoji: '📚', period: 'dia', unit: 'minutos', target: 30, step: 15, position: 1000, deleted: false, count_from: null });
// Dias livres no fim de novembro (os dados fictícios vão até 17/11): ninguém ocupa 18 a 30/11, a não ser os daqui
ins('blocos', B({ id: 'f_r1', date: '2026-11-17', start_min: 480, duration: 30, title: 'Ler 30 min', tag_id: tag0, color: '#3b82f6', goal_id: 'meta_ler', completed: true,
  microblocks: [{ id: 'mb_1', title: 'Capítulo 3', done: true }, { id: 'mb_2', title: 'Resumo', done: false }], linked_note_ids: [note0], was_delayed: true }));
ins('blocos', B({ id: 'f_ocupa', date: '2026-11-19', start_min: 490, duration: 10, title: 'Já tem coisa aqui' }));
ins('blocos', B({ id: 'f_r2', date: '2026-11-18', start_min: 600, duration: 60, title: 'Pendências', theme: 'focus',
  cards: [{ id: 'cd_a', title: 'Pagar boleto', done: true, microblocks: [{ title: 'conferir valor', done: true }] }, { id: 'cd_b', title: 'Ligar pro banco', done: false, microblocks: [] }] }));
ins('blocos', B({ id: 'f_r3', date: '2026-12-31', start_min: 420, duration: 15, title: 'Fechar o mês' }));
ins('blocos', B({ id: 'f_r4', date: '2026-11-10', start_min: 1320, duration: 30, title: 'Bloco do passado', type: 'past' }));
ins('blocos', B({ id: 'f_r5', date: '2026-11-25', start_min: 700, duration: 20, title: 'Sem lugar' }));
for (let i = 1; i <= 5; i++) ins('blocos', B({ id: 'f_cheio' + i, date: '2026-11-' + (25 + i), start_min: 700, duration: 20, title: 'Ocupando ' + i }));
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime(); // segunda 16/11/2026, 10:20
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      w.alert = () => errors.push('alert() chamado');
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const mouse = (el, type, o) => el.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0 }, o || {})));
  const press = (el, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const open = () => !$('modal-rpt').classList.contains('hidden');
  const days = () => [...$('rpt-days').querySelectorAll('li')].map((li) => (li.dataset.busy ? '✗' : '✓') + li.dataset.rptDay);
  const rows = () => [...server.tables.blocos.values()].filter((r) => r.user_id === UID);
  const copiesOf = (title) => rows().filter((r) => r.title === title && !/^f_r\d$/.test(r.id) && !r.deleted);
  const menuItems = () => [...d.querySelectorAll('body > div[role="menu"] button')].map((b) => T(b));
  const goWeek = async (day) => {
    click(d.querySelector('.ag-view[data-view="week"]')); await sleep(30);
    for (let i = 0; i < 20 && !d.querySelector('#ag-cols .ag-list[data-day="' + day + '"]'); i++) { // vai pra trás ou pra frente a partir da semana na tela
      const first = d.querySelector('#ag-cols .ag-list[data-day]').dataset.day;
      click($(day < first ? 'ag-prev' : 'ag-next')); await sleep(30);
    }
  };
  const openRpt = async (id, day) => {
    await goWeek(day);
    click(d.querySelector('#ag-cols [data-block="' + id + '"] [data-more]')); await sleep(30);
    click(d.querySelector('body > div[role="menu"] [data-act="rpt"]')); await sleep(30);
  };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda')); await sleep(80);

  // ======================================================================================================
  console.log('A) Os 3 pontinhos:');
  await goWeek('2026-11-17');
  click(d.querySelector('#ag-cols [data-block="f_r1"] [data-more]')); await sleep(30);
  ok(menuItems().join('|') === 'Duplicar|Repetir…|Arquivar|Apagar', 'Semana: Duplicar, Repetir…, Arquivar, Apagar (' + menuItems().join(', ') + ')');
  ok(d.querySelector('#ag-cols [data-block="f_r1"] [data-more]').title === 'Duplicar, repetir, arquivar ou apagar', 'o título dos 3 pontinhos fala do Repetir');
  press(d.body, 'Escape'); await sleep(20);
  // visão Dia (terça 17/11)
  click(d.querySelector('.ag-day-btn[data-day="2026-11-17"]')); await sleep(40);
  const dayDots = d.querySelectorAll('#ag-timeline [data-block] [data-more]').length, dayBlocks = d.querySelectorAll('#ag-timeline [data-block]').length;
  ok(dayBlocks > 3 && dayDots === dayBlocks, 'visão Dia: todo bloco (e sublista) tem os 3 pontinhos (' + dayDots + ' de ' + dayBlocks + ')');
  const dd = d.querySelector('#ag-timeline [data-block="f_r1"] [data-more]');
  mouse(dd, 'mousedown', { clientY: 100 }); mouse(d, 'mousemove', { clientY: 160 }); await sleep(20); mouse(d, 'mouseup', { clientY: 160 }); await sleep(20);
  ok(!d.querySelector('#ag-timeline .ag-moving') && server.get('blocos', UID, 'f_r1').start_min === 480, 'segurar e mexer nos 3 pontinhos do Dia não arrasta o bloco');
  click(dd); await sleep(30);
  ok(menuItems().join('|') === 'Duplicar|Repetir…|Arquivar|Apagar', 'visão Dia: o mesmo menu');
  click(d.querySelector('body > div[role="menu"] [data-act="rpt"]')); await sleep(30);
  ok(open() && T($('rpt-title')) === 'Repetir bloco', 'Repetir… abre a janela "Repetir bloco" (pela visão Dia)');
  click($('rpt-cancel')); await sleep(20);
  ok(!open(), 'Cancelar fecha');
  click(d.querySelector('.ag-view[data-view="week"]')); await sleep(30);

  console.log('\nB) A janela:');
  await openRpt('f_r1', '2026-11-17');
  ok(T($('rpt-sub')) === 'Ler 30 min · Ter 17/11 · 08:00–08:30', 'o bloco: "' + T($('rpt-sub')) + '"');
  ok(d.querySelector('#rpt-every [data-rpt="day"]').getAttribute('aria-checked') === 'true' && $('rpt-n').value === '5' && T($('rpt-unit')) === 'dias seguidos', 'começa em "Todo dia", 5 vezes (como o celular)');
  ok(days().join(' ') === '✓2026-11-18 ✗2026-11-19 ✓2026-11-20 ✓2026-11-21 ✓2026-11-22', 'os 5 dias seguintes; 19/11 tem bloco no horário: fica de fora (' + days().join(' ') + ')');
  const busyLi = $('rpt-days').querySelector('li[data-busy]');
  ok(/horário ocupado: fica de fora/.test(T(busyLi)) && busyLi.querySelector('.line-through'), 'o dia ocupado aparece riscado, "horário ocupado: fica de fora"');
  ok(T($('rpt-sum')) === 'Às 08:00, de Qua 18/11 a Dom 22/11. O checklist vai junto, desmarcado.' && T($('rpt-ok')) === 'Criar 4 cópias' && !$('rpt-ok').disabled, 'resumo e botão: "Criar 4 cópias"');
  click($('rpt-plus')); await sleep(10);
  ok($('rpt-n').value === '6' && days().length === 6 && T($('rpt-ok')) === 'Criar 5 cópias', '+ põe mais um dia');
  $('rpt-n').value = '12'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  ok(days().length === 12 && days()[11] === '✓2026-11-29' && $('rpt-n').value === '12', 'digitar 12: 12 dias (até 29/11)');
  $('rpt-n').value = '99'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  ok(days().length === 60 && $('rpt-plus').disabled, 'todo dia vai até 60 vezes (o + apaga)');
  $('rpt-n').dispatchEvent(new w.FocusEvent('blur')); await sleep(10);
  ok($('rpt-n').value === '60', 'saindo do campo ele mostra o número de verdade (60)');
  $('rpt-n').value = '1'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  ok($('rpt-minus').disabled && T($('rpt-unit')) === 'dia seguinte' && days().join() === '✓2026-11-18', '1 vez: só o dia seguinte; o − apaga');
  press($('rpt-n'), 'ArrowUp'); press($('rpt-n'), 'ArrowUp'); await sleep(10);
  ok($('rpt-n').value === '3', 'seta pra cima no campo também soma');
  click(d.querySelector('#rpt-every [data-rpt="week"]')); await sleep(10);
  ok($('rpt-n').value === '4' && days().join(' ') === '✓2026-11-24 ✓2026-12-01 ✓2026-12-08 ✓2026-12-15' && T($('rpt-unit')) === 'semanas', 'Toda semana: 4 vezes, toda terça');
  click(d.querySelector('#rpt-every [data-rpt="month"]')); await sleep(10);
  ok($('rpt-n').value === '2' && days().join(' ') === '✓2026-12-17 ✓2027-01-17' && /Dom 17\/01\/2027/.test(T($('rpt-days'))), 'Todo mês: 2 vezes (o ano aparece quando é outro)');
  $('rpt-n').value = '30'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  ok(days().length === 24, 'todo mês vai até 24 vezes');
  click(d.querySelector('#rpt-every [data-rpt="day"]')); await sleep(10);
  ok($('rpt-n').value === '5' && days().length === 5, 'voltando pra Todo dia: 5 de novo');

  console.log('\nC) Criar:');
  const before = rows().length;
  click($('rpt-ok'));
  ok(await waitFor(() => copiesOf('Ler 30 min').length === 4), 'criou 4 cópias na nuvem');
  ok(!open(), 'a janela fecha');
  const cs = copiesOf('Ler 30 min').sort((a, b) => (a.date < b.date ? -1 : 1));
  ok(cs.map((r) => r.date.slice(0, 10)).join(' ') === '2026-11-18 2026-11-20 2026-11-21 2026-11-22' && rows().length === before + 4, 'nos dias 18, 20, 21 e 22 (o 19 ficou de fora)');
  ok(cs.every((r) => r.start_min === 480 && r.duration === 30 && r.tag_id === tag0 && r.color === '#3b82f6' && r.theme === 'focus' && r.goal_id === 'meta_ler'), 'mesmo horário, duração, tag, cor e a meta');
  ok(cs.every((r) => r.completed === false && r.was_delayed === false && r.archived === false && r.type === 'focus' && JSON.stringify(r.linked_note_ids) === '[]'), 'não concluídas, sem notas vinculadas, "focus" (horário que ainda vem)');
  ok(cs.every((r) => JSON.stringify(r.microblocks.map((m) => [m.title, m.done])) === '[["Capítulo 3",false],["Resumo",false]]'), 'checklist junto, desmarcado');
  ok(new Set(cs.map((r) => r.id)).size === 4 && cs.every((r) => /^f_\d+$/.test(r.id)), 'cada cópia com o seu id (f_…)');
  ok(server.get('blocos', UID, 'f_ocupa').title === 'Já tem coisa aqui' && !server.get('blocos', UID, 'f_ocupa').deleted && server.get('blocos', UID, 'f_r1').completed === true, 'o bloco que ocupava o dia 19 e o original ficam como estavam');
  ok(T($('undo-pill-msg')) === 'Repetido 4 vezes, até Dom 22/11 · 1 dia ficou de fora' && !$('undo-pill').classList.contains('hidden') && !(T($('toast')) === T($('undo-pill-msg')) && !$('toast').classList.contains('opacity-0')), 'aviso com Desfazer (sem repetir a mensagem num segundo aviso): "' + T($('undo-pill-msg')) + '"');
  ok(!!d.querySelector('#ag-cols [data-block="' + cs[0].id + '"]'), 'as cópias aparecem na Semana');

  console.log('\nD) Desfazer e refazer (um passo só):');
  press(d.body, 'z', { ctrlKey: true });
  ok(await waitFor(() => copiesOf('Ler 30 min').length === 0), 'Ctrl+Z tira as 4 de uma vez');
  press(d.body, 'y', { ctrlKey: true });
  ok(await waitFor(() => copiesOf('Ler 30 min').length === 4), 'Ctrl+Y traz as 4 de volta');

  console.log('\nE) Sublista, todo mês no dia 31, passado, nada livre:');
  await openRpt('f_r2', '2026-11-18');
  ok(T($('rpt-title')) === 'Repetir sublista' && /Os cartões vão junto, desmarcados\./.test(T($('rpt-sum'))), 'sublista: "Repetir sublista", "Os cartões vão junto, desmarcados."');
  click(d.querySelector('#rpt-every [data-rpt="week"]')); await sleep(10);
  $('rpt-n').value = '2'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  press($('rpt-n'), 'Enter');
  ok(await waitFor(() => copiesOf('Pendências').length === 2), 'Enter no campo cria (2 semanas)');
  const sc = copiesOf('Pendências');
  ok(sc.every((r) => Array.isArray(r.cards) && r.cards.length === 2 && r.cards.every((c) => c.done === false && /^cd_/.test(c.id) && c.id !== 'cd_a' && c.id !== 'cd_b') && r.cards[0].microblocks[0].done === false && r.goal_id === null), 'cartões junto, desmarcados, com ids novos (e o checklist deles desmarcado)');
  ok(sc.map((r) => r.date.slice(0, 10)).sort().join(' ') === '2026-11-25 2026-12-02', 'nas quartas 25/11 e 02/12');
  // todo mês no dia 31
  await openRpt('f_r3', '2026-12-31');
  click(d.querySelector('#rpt-every [data-rpt="month"]')); await sleep(10);
  $('rpt-n').value = '3'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  ok(days().join(' ') === '✓2027-01-31 ✓2027-02-28 ✓2027-03-31', 'todo mês no dia 31: fevereiro vai pro dia 28 (' + days().join(' ') + ')');
  click($('rpt-ok'));
  ok(await waitFor(() => copiesOf('Fechar o mês').length === 3), 'criou os 3 meses');
  // passado
  await openRpt('f_r4', '2026-11-10');
  $('rpt-n').value = '2'; $('rpt-n').dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(10);
  click($('rpt-ok'));
  ok(await waitFor(() => copiesOf('Bloco do passado').length === 2) && copiesOf('Bloco do passado').every((r) => r.type === 'past'), 'repetir um bloco do passado: as cópias que caem no passado ficam como passado');
  // nada livre
  await openRpt('f_r5', '2026-11-25');
  ok(days().every((x) => x.startsWith('✗')) && $('rpt-ok').disabled && T($('rpt-ok')) === 'Nada pra criar' && T($('rpt-sum')) === 'O horário está ocupado em todos esses dias.', 'horário ocupado em todos os dias: nada pra criar');
  press($('rpt-n'), 'Enter'); await sleep(40);
  ok(copiesOf('Sem lugar').length === 0 && open(), 'Enter com nada livre não faz nada');
  press(d.body, 'Escape'); await sleep(20);
  ok(!open(), 'Esc fecha');

  console.log('\nF) Com a janela aberta:');
  await openRpt('f_r1', '2026-11-17');
  click(d.querySelector('#rpt-every [data-rpt="week"]')); await sleep(10);
  ok(days().join(' ') === '✓2026-11-24 ✓2026-12-01 ✓2026-12-08 ✓2026-12-15', '(semanas livres)');
  server.insert('blocos', UID, B({ id: 'f_novo', date: '2026-12-01', start_min: 470, duration: 20, title: 'Chegou do celular' }));
  ok(await waitFor(() => days().join(' ') === '✓2026-11-24 ✗2026-12-01 ✓2026-12-08 ✓2026-12-15' && T($('rpt-ok')) === 'Criar 3 cópias'), 'bloco que chega do celular no horário: aquele dia passa a ficar de fora, na hora');
  mouse($('modal-rpt'), 'mousedown'); await sleep(20);
  ok(!open(), 'clicar no fundo fecha');
  await openRpt('f_r4', '2026-11-10');
  server.patch('blocos', UID, 'f_r4', { deleted: true });
  ok(await waitFor(() => !open() && /Esse bloco não está mais na agenda/.test(T($('toast')))), 'o bloco apagado em outro aparelho: a janela fecha e avisa');

  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
