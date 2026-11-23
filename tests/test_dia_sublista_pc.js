// V40.40.0 — PC, visão Dia: o cartão sai da sublista arrastando, muda de sublista, e o bloco entra numa sublista (o que a
// Semana do PC faz desde a V40.28.0 e o celular desde a V40.30.0). Confere:
//   A) o cartão arrastado: a cópia anda com o mouse, o tracejado mostra onde vira bloco ("10:30–11:00"); nada grava antes
//      de soltar e o que chega da nuvem no meio não redesenha; soltar cria o bloco inteiro e tira o cartão da sublista; o
//      clique que sobra não abre o cartão; um passo só do Desfazer (e o Refazer);
//   B) encostando no próximo bloco; "Não cabe aqui" (vago pequeno, em cima de um bloco); outra sublista (acende, muda o
//      cartão inteiro); a própria sublista (nada); Esc desiste; clique simples e o círculo continuam iguais;
//   C) o bloco arrastado em cima de uma sublista entra nela (um passo do Desfazer); Descanso e sublista não entram.
// Uso: TZ='America/Sao_Paulo' node test_dia_sublista_pc.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }

(async () => {
  const UID = '88888888-8888-8888-8888-888888888888', srv = makeServer();
  srv.addUser('pessoa@teste.com', 'senha123', UID);
  const JB = (k) => JSON.parse(backup.data[k]);
  const local = { tarefas: JB('tb_backlog_db'), listas: JB('tb_backlog_columns'), tags: JB('tb_tags_db'), blocos: JB('tb_master_db'), rotinas: JB('tb_routines_db') };
  const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of (p0.push[k] || [])) srv.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++srv.clock });
  const DAY = '2026-12-02', TAG = local.tags[0].id; // quarta, numa semana sem nada nos dados de teste; a régua começa às 07:00
  const mk = (id, st, dur, extra) => srv.insert('blocos', UID, Object.assign({ id, date: DAY, start_min: st, duration: dur, title: 'Bloco', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false }, extra || {}));
  mk('f_sub1', 540, 60, { title: 'Pendências', cards: [
    { id: 'cd_1', title: 'Ligar pro cartório', done: false, microblocks: [{ title: 'Pegar o número', done: true }], duration: 30, tagId: TAG, color: '#ec4899', columnId: 'col_1700000008000' },
    { id: 'cd_2', title: 'Pagar boleto', done: false, microblocks: [] },
    { id: 'cd_3', title: 'Imprimir planta A1', done: false, microblocks: [], duration: 45 },
    { id: 'cd_4', title: 'Assinar contrato', done: true, microblocks: [] }] });
  mk('f_sub2', 840, 60, { title: 'Tarde', cards: [{ id: 'cd_9', title: 'Revisar orçamento', done: false, microblocks: [] }] });
  mk('f_a', 660, 30, { title: 'Bloco A' });
  mk('f_b', 720, 15, { title: 'Bloco B', tag_id: TAG });
  mk('f_r', 960, 30, { title: 'Almoço', theme: 'rest' });
  srv.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(srv) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      w.alert = () => errors.push('alert() chamado');
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const visible = (id) => !$(id).classList.contains('hidden');
  const B = (id) => srv.get('blocos', UID, id);
  const cards = (id) => (B(id).cards || []).map((c) => c.id);
  const alive = () => srv.alive('blocos', UID).filter((b) => b.date === DAY);
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda')); await sleep(60);
  click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); click($('ag-next')); click($('ag-next')); await sleep(60);
  click(d.querySelector(`#ag-cols .ag-day-btn[data-day="${DAY}"]`)); await sleep(60);
  const tl = $('ag-timeline');
  tl.getBoundingClientRect = () => ({ top: 0, bottom: 4000, left: 0, right: 800, width: 800, height: 4000, x: 0, y: 0 }); // jsdom não tem layout: a régua começa no y 0
  const PX = 3.2, Y = (min) => (min - 420) * PX + 1;
  const ev = (type, target, y, init) => target.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 300, clientY: y }, init || {})));
  const key = (k, init) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, init || {})); d.body.dispatchEvent(e); return e; };
  const row = (bid, cid) => [...tl.querySelectorAll('.ag-sub-card')].find((r) => { const c = r.querySelector('[data-sub-ck]'); return c && c.dataset.subCk === bid && c.dataset.card === cid; });
  const blockEl = (id) => [...tl.querySelectorAll('[data-block]')].find((e) => e.dataset.block === id);
  const land = () => tl.querySelector('.ag-land');
  const grabCard = (bid, cid, min) => { const r = row(bid, cid); ev('mousedown', r.querySelector('[data-sub-open]'), Y(min)); return r; };
  const to = (min) => { ev('mousemove', d, Y(min) - 20); ev('mousemove', d, Y(min)); };
  const drop = (min) => { ev('mouseup', d, Y(min)); click(tl); }; // soltar + o clique que o navegador dispara depois
  const pill = () => T($('undo-pill')) + ' ' + T($('toast'));
  ok($('ag-label').textContent === 'Quarta, 2 de dezembro' && row('f_sub1', 'cd_1') && row('f_sub2', 'cd_9') && /Cartão da sublista sai arrastando/.test($('ag-tip').textContent), '(visão Dia com as duas sublistas; a barra lembra: "' + $('ag-tip').textContent + '")');

  console.log('A) O cartão sai da sublista arrastando:');
  const r1 = grabCard('f_sub1', 'cd_1', 550);
  to(630);
  const gh = d.querySelector('body > .ag-sub-ghost');
  ok(gh && /Ligar pro cartório/.test(gh.textContent) && !gh.querySelector('[data-sub-ck], [data-sub-open]') && r1.classList.contains('dragging') && d.body.classList.contains('ag-grabbing'), 'a cópia do cartão anda com o mouse (sem os botões de verdade) e o original fica apagado');
  ok(land() && land().style.display !== 'none' && T(land()) === '10:30–11:00' && !land().classList.contains('bad') && land().style.top === (Y(630)) + 'px', 'o tracejado mostra onde ele vira bloco: "10:30–11:00" (o tempo do cartão)');
  ok(cards('f_sub1').length === 4 && alive().length === 5, 'nada é gravado antes de soltar');
  srv.patch('blocos', UID, 'f_a', { title: 'A mudou no celular' }); await sleep(150);
  ok(tl.querySelector('.ag-land') && d.querySelector('.ag-sub-ghost') && !/A mudou/.test(T(blockEl('f_a'))), 'o que chega do celular no meio do arraste não redesenha (o cartão não escapa da mão)');
  drop(630);
  ok(await waitFor(() => !cards('f_sub1').includes('cd_1') && alive().some((b) => b.title === 'Ligar pro cartório')), 'soltou: o cartão saiu da sublista e virou bloco');
  await sleep(120);
  const nb = alive().find((b) => b.title === 'Ligar pro cartório');
  ok(nb.start_min === 630 && nb.duration === 30 && nb.tag_id === TAG && nb.color === '#ec4899' && nb.microblocks.length === 1 && nb.microblocks[0].done === true && nb.completed === false && nb.column_id === 'col_1700000008000' && Array.isArray(nb.linked_note_ids), 'o bloco nasce inteiro: 10:30, 30 min, tag, cor, checklist como estava, a lista de origem');
  ok(!visible('modal-task') && !d.querySelector('.ag-sub-ghost') && !tl.querySelector('.ag-land') && !d.body.classList.contains('ag-grabbing'), 'o clique que sobra ao soltar não abre nada; a tela fica limpa');
  ok(/A mudou no celular/.test(T(blockEl('f_a'))), 'e o que tinha chegado da nuvem aparece');
  ok(/Saiu da sublista/.test(pill()), 'avisa: "Saiu da sublista: …"');
  key('z', { ctrlKey: true }); await waitFor(() => cards('f_sub1').includes('cd_1')); await sleep(120);
  ok(cards('f_sub1').includes('cd_1') && !alive().some((b) => b.title === 'Ligar pro cartório' && !b.deleted), 'Ctrl+Z desfaz os dois de uma vez: o bloco some e o cartão volta pra sublista');
  key('y', { ctrlKey: true }); await waitFor(() => !cards('f_sub1').includes('cd_1')); await sleep(120);
  ok(!cards('f_sub1').includes('cd_1') && alive().some((b) => b.title === 'Ligar pro cartório'), 'Ctrl+Y refaz');

  console.log('\nB) Onde ele cai, outra sublista, Esc:');
  grabCard('f_sub1', 'cd_2', 560); to(825);
  ok(T(land()) === '13:30–14:00' && !land().classList.contains('bad'), 'perto do próximo bloco, encosta nele: mouse às 13:45, cartão sem tempo (30 min) cai às 13:30–14:00');
  drop(825);
  ok(await waitFor(() => alive().some((b) => b.title === 'Pagar boleto' && b.start_min === 810 && b.duration === 30)), 'soltou: bloco "Pagar boleto" às 13:30, 30 min');
  await sleep(100);
  grabCard('f_sub1', 'cd_3', 560); to(700);
  ok(land().classList.contains('bad') && T(land()) === 'Não cabe aqui', 'vago menor que o cartão (30 min pra 45): "Não cabe aqui" em vermelho');
  to(670);
  ok(land().classList.contains('bad'), 'em cima de um bloco também');
  const before = JSON.stringify(cards('f_sub1')), nAlive = alive().length;
  drop(670); await sleep(150);
  ok(JSON.stringify(cards('f_sub1')) === before && alive().length === nAlive && /Não cabe aqui: o cartão ficou na sublista/.test(T($('toast'))), 'soltou ali: nada muda e avisa "Não cabe aqui: o cartão ficou na sublista."');
  grabCard('f_sub1', 'cd_3', 560); to(870);
  ok(blockEl('f_sub2').classList.contains('ag-sub-over') && land().style.display === 'none', 'em cima de outra sublista: ela acende (e o tracejado some)');
  drop(870);
  ok(await waitFor(() => cards('f_sub2').includes('cd_3') && !cards('f_sub1').includes('cd_3')), 'soltou: o cartão mudou de sublista');
  await sleep(100);
  ok(B('f_sub2').cards.find((c) => c.id === 'cd_3').duration === 45 && /Cartão foi pra sublista Tarde/.test(pill()), '...inteiro (o mesmo id, o tempo) e avisa "Cartão foi pra sublista Tarde"');
  grabCard('f_sub1', 'cd_4', 560); to(575);
  ok(!blockEl('f_sub1').classList.contains('ag-sub-over') && land().style.display === 'none', 'em cima da própria sublista: nada acende');
  const s1 = JSON.stringify(B('f_sub1').cards);
  drop(575); await sleep(120);
  ok(JSON.stringify(B('f_sub1').cards) === s1, 'soltou na própria sublista: nada muda');
  grabCard('f_sub1', 'cd_4', 560); to(780);
  ok(T(land()) === '13:00–13:30', '(arrastando de novo: "' + T(land()) + '")');
  key('Escape');
  ok(!d.querySelector('.ag-sub-ghost') && !tl.querySelector('.ag-land') && JSON.stringify(B('f_sub1').cards) === s1, 'Esc desiste: a cópia some e nada muda');
  ev('mouseup', d, Y(780)); click(tl);
  ok(!visible('modal-task'), '(o soltar depois do Esc não abre nada)');
  // clique simples continua abrindo; o círculo continua marcando
  const r4 = row('f_sub1', 'cd_4');
  ev('mousedown', r4.querySelector('[data-sub-open]'), Y(560)); ev('mouseup', r4.querySelector('[data-sub-open]'), Y(560)); click(r4.querySelector('[data-sub-open]'));
  ok(visible('modal-task') && visible('f-card-back') && $('f-title').value === 'Assinar contrato', 'clique simples no cartão continua abrindo ele');
  click($('f-cancel')); await sleep(30); click($('f-cancel')); await sleep(30);
  const ck = row('f_sub1', 'cd_4').querySelector('[data-sub-ck]');
  ev('mousedown', ck, Y(560)); ev('mouseup', ck, Y(560)); click(ck);
  ok(await waitFor(() => B('f_sub1').cards.find((c) => c.id === 'cd_4').done === false), 'o círculo continua só marcando (desmarcou o "Assinar contrato")');

  console.log('\nC) O bloco entra na sublista arrastando:');
  await sleep(100);
  ev('mousedown', blockEl('f_b'), Y(722)); ev('mousemove', d, Y(730)); ev('mousemove', d, Y(860));
  ok(blockEl('f_sub2').classList.contains('ag-sub-over') && blockEl('f_b').classList.contains('ag-into-sub') && /entra na sublista/.test(T(blockEl('f_b'))) && !blockEl('f_b').classList.contains('ag-clash'), 'bloco em cima da sublista: ela acende, ele fica meio transparente e diz "entra na sublista"');
  ev('mousemove', d, Y(750));
  ok(!blockEl('f_sub2').classList.contains('ag-sub-over') && !blockEl('f_b').classList.contains('ag-into-sub'), 'saiu de cima: volta ao normal');
  ev('mousemove', d, Y(860));
  ev('mouseup', d, Y(860)); click(tl);
  ok(await waitFor(() => B('f_b').deleted === true && B('f_sub2').cards.some((c) => c.title === 'Bloco B')), 'soltou: o bloco virou cartão da sublista');
  await sleep(120);
  const cb = B('f_sub2').cards.find((c) => c.title === 'Bloco B');
  ok(cb.duration === 15 && cb.tagId === TAG && !visible('modal-task') && /Entrou na sublista Tarde/.test(pill()), '...com o tempo dele (15 min) e a tag; avisa "Entrou na sublista Tarde"');
  key('z', { ctrlKey: true }); await waitFor(() => B('f_b').deleted === false); await sleep(120);
  ok(B('f_b').deleted === false && !B('f_sub2').cards.some((c) => c.title === 'Bloco B'), 'Ctrl+Z desfaz os dois de uma vez: o bloco volta e o cartão sai');
  ev('mousedown', blockEl('f_r'), Y(962)); ev('mousemove', d, Y(970)); ev('mousemove', d, Y(860));
  ok(/descanso não entra/.test(T(blockEl('f_r'))), 'Descanso em cima da sublista avisa "descanso não entra"');
  ev('mouseup', d, Y(860)); click(tl); await sleep(150);
  ok(B('f_r').start_min === 960 && !B('f_r').deleted && /Descanso não entra numa sublista/.test(T($('toast'))) && blockEl('f_r').style.top === Y(960) + 'px', 'soltou: nada muda ("Descanso não entra numa sublista.") e ele volta pro lugar');
  ev('mousedown', blockEl('f_sub1').querySelector('.ag-sub-time') || blockEl('f_sub1'), Y(542)); ev('mousemove', d, Y(550)); ev('mousemove', d, Y(860));
  ev('mouseup', d, Y(860)); click(tl); await sleep(150);
  ok(B('f_sub1').start_min === 540 && !B('f_sub1').deleted && /Uma sublista não entra em outra/.test(T($('toast'))), 'sublista em cima de outra: "Uma sublista não entra em outra."');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
