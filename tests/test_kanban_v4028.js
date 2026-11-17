// V40.28.0 — tela do PC (kanban.html), Agenda na Semana: (A) mudar a duração puxando a borda de baixo do bloco
// (diminuir, aumentar até o próximo, mínimo de 5 min, Esc desiste, o clique depois de soltar não abre o cartão, Ctrl+Z
// desfaz, não vira arraste pra outro dia, com tarefa na mão não tem alça, sublista também); (B) arrastar no próprio dia
// pra um espaço livre de antes de agora (o caso do Jhonatan: "não consigo mover no mesmo dia entre os outros cartões"),
// sem perder o "a partir de agora" e o atalho do topo; a tarefa na mão continua só de agora em diante. (C) Duplicar
// nos 3 pontinhos; (D) cartão sai da sublista arrastando e vira bloco; (E) cartão muda de sublista; (F) bloco entra na
// sublista arrastando e vira cartão (com nota vinculada pergunta; sublista e Descanso não entram).
// Relógio: terça 17/11/2026, 14:56 (o "hoje" da tela). Uso: TZ='America/Sao_Paulo' node test_kanban_v4028.js <repo> <backup.json>
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
const p = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };
const DAY = '2026-11-17';
// blocos da terça nos dados fictícios: Bloco 544 (07:00) ... Bloco 554 (09:30), 15 min cada
const ID = (n) => 'f_' + String(1700001691000 + (n - 544) * 1000);

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
      const RD = w.Date, FIX = new RD(2026, 10, 17, 14, 56, 0).getTime(); // terça 17/11/2026, 14:56
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el, init) => el.dispatchEvent(new w.MouseEvent('click', Object.assign({ bubbles: true, cancelable: true }, init || {})));
  const press = (el, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const mouse = (type, el, y) => { const e = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 300, clientY: y }); el.dispatchEvent(e); return e; };
  const dt = { setData() {}, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientY', { value: 10 }); el.dispatchEvent(e); return e; };
  const B = (id) => server.get('blocos', UID, id);
  const writes = () => server.log.filter((l) => l.op !== 'select');
  const settle = () => sleep(150);
  const card = (id) => d.querySelector(`#ag-cols [data-block="${id}"]`);
  const tm = (id) => card(id).querySelector('.ag-tm').textContent.replace(/\s+/g, ' ').trim();
  const col = (day) => d.querySelector(`#ag-cols .ag-list[data-day="${day}"]`);
  const zones = (day) => [...col(day).querySelectorAll('.ag-drop')];
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const modalOpen = () => !$('modal-task').classList.contains('hidden');
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda')); await sleep(60);
  click(d.querySelector('.ag-view[data-view="week"]')); await sleep(60);
  // o dia do Jhonatan, em miniatura: manhã cheia, um espaço às 08:15, outro a partir das 09:15, e um bloco de 5 min às 15:10
  server.patch('blocos', UID, ID(549), { deleted: true });
  server.patch('blocos', UID, ID(553), { deleted: true });
  server.patch('blocos', UID, ID(554), { start_min: 910, duration: 5, title: 'NF PLUMA' });
  await waitFor(() => card(ID(554)) && /15:10–15:15/.test(tm(ID(554))));
  ok(!errors.length, 'a tela abre sem erro' + (errors.length ? ': ' + errors[0] : ''));
  ok(/Puxe a borda de baixo/.test($('ag-tip').textContent) && /espaço livre/.test($('ag-tip').textContent), 'Semana: o lembrete agora fala da borda de baixo: "' + $('ag-tip').textContent + '"');

  // ======================================================================================================
  console.log('\nA) Duração pela borda de baixo, na Semana:');
  const cards = [...d.querySelectorAll('#ag-cols [data-block]')];
  ok(cards.length >= 9 && cards.every((c) => c.querySelector(':scope > .ag-rz')), `todos os ${cards.length} blocos da semana têm a alça de baixo (a mesma do Dia)`);
  const c552 = ID(552), rz = () => card(c552).querySelector('.ag-rz');
  server.log.length = 0;
  mouse('mousedown', rz(), 500);
  const ds = dragEv('dragstart', card(c552));
  ok(ds.defaultPrevented && !zones(DAY).length, 'segurando a alça, o navegador não começa o arraste pra outro dia (sem tracejados)');
  mouse('mousemove', d, 498);
  ok(!card(c552).classList.contains('ag-sizing') && tm(c552) === '09:00–09:15 · 15m', 'mexeu menos de 4 px: nada muda ainda (pode ser só um clique)');
  mouse('mousemove', d, 484);
  ok(card(c552).classList.contains('ag-sizing') && d.body.classList.contains('ag-resizing') && tm(c552) === '09:00–09:10 · 10m', 'subiu 16 px: o horário escrito no bloco vira "' + tm(c552) + '" enquanto puxa');
  mouse('mousemove', d, 300);
  ok(tm(c552) === '09:00–09:05 · 5m', 'subiu muito: para no mínimo de 5 min ("' + tm(c552) + '")');
  mouse('mousemove', d, 484);
  mouse('mouseup', d, 484);
  click(card(c552)); // o navegador manda um clique logo depois de soltar o botão
  ok(!modalOpen(), 'o clique que o navegador manda logo depois de soltar não abre o cartão');
  await waitFor(() => B(c552).duration === 10); await settle();
  ok(B(c552).duration === 10 && B(c552).start_min === 540 && writes().length === 1 && writes()[0].fields.slice().sort().join() === 'duration,type' && B(c552).type === 'past', 'soltou: grava a duração (10 min) na nuvem (e, como já passou, o bloco fica "passado", a regra de sempre)');
  ok(/^Duração ajustada: 10m \(09:00–09:10\)/.test($('toast').textContent) && tm(c552) === '09:00–09:10 · 10m' && !d.body.classList.contains('ag-resizing'), 'aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');
  click(card(c552));
  ok(modalOpen(), 'o clique seguinte abre normalmente');
  click($('close-modal') || d.querySelector('#modal-task [data-close]') || $('f-close') || d.body);
  press(d.body, 'Escape'); await sleep(40);
  // Ctrl+Z desfaz
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => B(c552).duration === 15); await settle();
  ok(B(c552).duration === 15 && tm(c552) === '09:00–09:15 · 15m', 'Ctrl+Z desfaz (volta a 15 min)');
  // aumentar: só até o próximo bloco
  const c550 = ID(550); // 08:30–08:45, o próximo (551) começa às 08:45
  server.log.length = 0;
  mouse('mousedown', card(c550).querySelector('.ag-rz'), 500); mouse('mousemove', d, 532);
  ok(tm(c550).startsWith('08:30–08:45 · 15m') && /o próximo começa às 08:45/.test(tm(c550)) && card(c550).classList.contains('ag-limit'), 'aumentar com o próximo colado: fica em 15 min e avisa "o próximo começa às 08:45"');
  mouse('mouseup', d, 532); await settle();
  ok(writes().length === 0 && B(c550).duration === 15 && /O próximo bloco começa às 08:45/.test($('toast').textContent) && !/próximo/.test(tm(c550)), 'soltou: nada muda e explica; o aviso some do bloco');
  const c548 = ID(548); // 08:00–08:15, o espaço vai até 08:30
  mouse('mousedown', card(c548).querySelector('.ag-rz'), 500); mouse('mousemove', d, 516);
  ok(tm(c548) === '08:00–08:20 · 20m', 'com espaço livre depois: desce 16 px = +5 min ("' + tm(c548) + '")');
  mouse('mousemove', d, 600);
  ok(tm(c548).startsWith('08:00–08:30 · 30m') && /o próximo começa às 08:30/.test(tm(c548)), 'e para no começo do próximo (08:30)');
  mouse('mouseup', d, 600);
  await waitFor(() => B(c548).duration === 30); await settle();
  ok(B(c548).duration === 30 && /Duração ajustada: 30m \(08:00–08:30\)/.test($('toast').textContent), 'grava 30 min');
  // Esc desiste
  server.log.length = 0;
  mouse('mousedown', card(c548).querySelector('.ag-rz'), 500); mouse('mousemove', d, 452);
  ok(tm(c548) === '08:00–08:15 · 15m', 'puxando de novo (15 min)…');
  press(d.body, 'Escape'); await settle();
  ok(writes().length === 0 && B(c548).duration === 30 && tm(c548) === '08:00–08:30 · 30m' && !d.body.classList.contains('ag-resizing'), 'Esc no meio: desiste, nada gravado, o bloco volta a mostrar 30 min');
  mouse('mouseup', d, 452); click(card(c548));
  ok(!modalOpen(), 'e o clique de quando solta o botão também não abre o cartão');
  await settle();
  // só um clique na alça (sem puxar): abre o cartão como antes
  mouse('mousedown', card(c548).querySelector('.ag-rz'), 500); mouse('mouseup', d, 500); click(card(c548).querySelector('.ag-rz'));
  ok(modalOpen() && writes().length === 0, 'só clicar na alça (sem puxar) abre o cartão, como clicar no bloco');
  press(d.body, 'Escape'); await sleep(60);
  // sublista também
  server.patch('blocos', UID, ID(547), { cards: [{ id: 'sc_1', title: 'Cartão A', done: false }] }); await settle();
  const sub = card(ID(547));
  ok(sub && sub.classList.contains('ag-sub') && sub.querySelector(':scope > .ag-rz') && sub.querySelector('.ag-tm'), 'a sublista também tem a alça');
  mouse('mousedown', sub.querySelector('.ag-rz'), 500); mouse('mousemove', d, 484); mouse('mouseup', d, 484);
  await waitFor(() => B(ID(547)).duration === 10); await settle();
  ok(B(ID(547)).duration === 10 && Array.isArray(B(ID(547)).cards) && B(ID(547)).cards.length === 1, 'sublista: 15 → 10 min, com os cartões dentro');

  // ======================================================================================================
  console.log('\nB) Arrastar no próprio dia, pra antes de agora:');
  const nf = ID(554);
  dragEv('dragstart', card(nf)); await sleep(40);
  const z = zones(DAY).map((x) => hhmm(+x.dataset.dropStart) + (x.classList.contains('first') ? '*' : ''));
  // depois do (A): sublista 07:45–07:55, 08:00–08:30, 08:30–08:45, 08:45–09:00, 09:00–09:15 e NF PLUMA às 15:10
  ok(z.join() === '15:00*,07:55,09:15,15:00', 'NF PLUMA (15:10, hoje às 14:56): espaços às 07:55 e 09:15 (já passaram) e às 15:00 (de agora em diante); o atalho do topo é o de agora (' + z.join(', ') + ')');
  const order = [...col(DAY).children].map((n) => n.classList.contains('ag-drop') ? 'livre ' + hhmm(+n.dataset.dropStart) : n.dataset.block ? (B(n.dataset.block).title || '').replace('Bloco ', '') : '').filter(Boolean);
  ok(order.indexOf('livre 07:55') === order.indexOf('547') + 1 && order.indexOf('548') === order.indexOf('livre 07:55') + 1, 'o 07:55 aparece entre os cartões das 07:45 e das 08:00: dá pra soltar "entre os outros cartões" (' + order.slice(0, 5).join(' | ') + ')');
  server.log.length = 0;
  dragEv('dragover', zones(DAY).find((x) => +x.dataset.dropStart === 475 && !x.classList.contains('first')));
  dragEv('drop', zones(DAY).find((x) => +x.dataset.dropStart === 475 && !x.classList.contains('first')));
  await waitFor(() => B(nf).start_min === 475); await settle();
  ok(B(nf).start_min === 475 && B(nf).type === 'past' && /Bloco movido para hoje às 07:55/.test($('toast').textContent), 'soltou no 07:55: o bloco vai pra lá e fica como "passado" (já é 14:56); aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => B(nf).start_min === 910); await settle();
  ok(B(nf).start_min === 910 && B(nf).type === 'focus', 'Ctrl+Z: volta pras 15:10');
  dragEv('dragstart', card(nf)); await sleep(40);
  dragEv('drop', zones(DAY).find((x) => x.classList.contains('first')));
  await waitFor(() => B(nf).start_min === 900); await settle();
  ok(B(nf).start_min === 900, 'o atalho do topo (de agora em diante) continua levando pro próximo livre: 15:00');
  // outro dia que já passou: como antes
  dragEv('dragstart', card(nf)); await sleep(40);
  ok(zones('2026-11-18').length > 0 && zones('2026-11-19').length > 0, 'os outros dias continuam mostrando os espaços deles');
  dragEv('dragend', card(nf)); await sleep(20);
  ok(!d.querySelectorAll('#ag-cols .ag-drop').length, 'desistir limpa os tracejados');
  // tarefa na mão: continua de agora em diante, e os blocos ficam sem alça
  click($('tab-listas')); await sleep(40);
  click(d.querySelector(`.card[data-id="${server.alive('tarefas', UID).filter((t) => !t.archived)[0].id}"] [data-hand]`)); await sleep(60);
  const put = [...col(DAY).querySelectorAll('[data-gap-day]')].map((x) => +x.dataset.gapStart);
  ok(put.length && put.every((st) => st >= 900), 'com tarefa na mão, hoje os espaços começam de agora (' + put.map(hhmm).join(', ') + ')');
  ok(!d.querySelector('#ag-cols .ag-rz'), 'e os blocos da Semana ficam sem alça');
  click($('ag-place-cancel')); await sleep(40);

  // ======================================================================================================
  console.log('\nC) Duplicar nos 3 pontinhos:');
  const menu = () => d.querySelector('div.fixed.z-40[role="menu"]');
  const alive17 = () => server.alive('blocos', UID).filter((b) => b.date === DAY && !b.archived);
  const c552b = card(c552);
  ok(c552b.querySelector('[data-more]').title === 'Duplicar, arquivar ou apagar', 'os 3 pontinhos agora dizem "Duplicar, arquivar ou apagar"');
  const n17 = alive17().length;
  click(c552b.querySelector('[data-more]'));
  ok(menu() && [...menu().querySelectorAll('button')].map((b) => b.textContent.trim()).join('|') === 'Duplicar|Arquivar|Apagar', 'menu do bloco: Duplicar, Arquivar, Apagar');
  server.log.length = 0;
  click(menu().querySelector('[data-act="dup"]'));
  await waitFor(() => alive17().length === n17 + 1); await settle();
  let copia = alive17().find((b) => b.title === 'Bloco 552' && b.id !== c552);
  ok(copia && copia.start_min === 555 && copia.duration === 15 && copia.completed === false && copia.date === DAY && writes().length === 1 && writes()[0].op === 'upsert', 'Duplicar: a cópia entra logo depois do bloco (09:15–09:30), no mesmo dia');
  ok(/^Bloco duplicado: 09:15–09:30/.test($('toast').textContent) && !!card(copia.id), 'aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '" e a cópia já aparece na Semana');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => B(copia.id).deleted === true); await settle();
  ok(B(copia.id).deleted === true && alive17().length === n17, 'Ctrl+Z desfaz a cópia');
  // sublista: os cartões vão junto, desmarcados e com ids novos
  server.patch('blocos', UID, ID(547), { cards: [{ id: 'sc_1', title: 'Cartão A', done: true, tagId: null, microblocks: [{ title: 'passo', done: true }] }, { id: 'sc_2', title: 'Cartão B', done: false }] }); await settle();
  click(card(ID(547)).querySelector('[data-more]')); click(menu().querySelector('[data-act="dup"]'));
  await waitFor(() => alive17().length === n17 + 1); await settle();
  copia = alive17().find((b) => Array.isArray(b.cards) && b.id !== ID(547));
  ok(copia && copia.duration === 10 && copia.cards.length === 2 && copia.cards.every((c) => !c.done && !['sc_1', 'sc_2'].includes(c.id)) && copia.cards[0].microblocks[0].done === false && copia.cards[0].title === 'Cartão A', 'sublista duplicada leva os cartões (desmarcados, com ids novos)');
  ok(/^Sublista duplicada: /.test($('toast').textContent), 'aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');
  server.patch('blocos', UID, copia.id, { deleted: true }); await settle();

  // ======================================================================================================
  console.log('\nD) Cartão sai da sublista arrastando (vira bloco):');
  const row = (bid, cid) => d.querySelector(`#ag-cols [data-sub-drag="${bid}"][data-card="${cid}"]`);
  ok(row(ID(547), 'sc_1') && row(ID(547), 'sc_1').getAttribute('draggable') === 'true', 'na Semana, cada cartão da sublista é arrastável');
  dragEv('dragstart', row(ID(547), 'sc_2')); await sleep(40);
  const zs = zones(DAY).filter((x) => !x.classList.contains('first')).map((x) => +x.dataset.dropStart);
  ok(row(ID(547), 'sc_2').classList.contains('dragging') && zs.length >= 2 && zs.includes(555), 'arrastando o cartão: os espaços tracejados de 30 min (o tempo de um cartão sem tempo guardado) aparecem, também os de antes de agora (' + zs.map(hhmm).join(', ') + ')');
  dragEv('dragover', card(ID(547)));
  ok(!card(ID(547)).classList.contains('ag-sub-over'), 'a própria sublista não acende');
  server.log.length = 0;
  dragEv('drop', zones(DAY).find((x) => +x.dataset.dropStart === 555 && !x.classList.contains('first')));
  await waitFor(() => (B(ID(547)).cards || []).length === 1); await settle();
  let saiu = alive17().find((b) => b.title === 'Cartão B');
  ok(saiu && saiu.start_min === 555 && saiu.duration === 30 && saiu.completed === false && !Array.isArray(saiu.cards), 'soltou às 09:15: virou um bloco de 30 min (09:15–09:45) com o nome do cartão');
  ok(B(ID(547)).cards.length === 1 && B(ID(547)).cards[0].id === 'sc_1' && /^Saiu da sublista: hoje às 09:15/.test($('toast').textContent), 'e saiu da sublista; aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');
  ok(writes().map((w2) => w2.op).join() === 'upsert,update', 'primeiro entra o bloco, depois o cartão sai (se a 2ª gravação falhar, nada se perde)');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => B(saiu.id).deleted === true && (B(ID(547)).cards || []).length === 2); await settle();
  ok(B(saiu.id).deleted === true && B(ID(547)).cards.length === 2, 'um Ctrl+Z só desfaz os dois (o cartão volta pra sublista e o bloco some)');
  // cartão feito sai feito, com a checklist
  dragEv('dragstart', row(ID(547), 'sc_1')); await sleep(40);
  dragEv('drop', zones(DAY).find((x) => +x.dataset.dropStart === 555 && !x.classList.contains('first')));
  await waitFor(() => (B(ID(547)).cards || []).length === 1); await settle();
  saiu = alive17().find((b) => b.title === 'Cartão A');
  ok(saiu && saiu.completed === true && saiu.microblocks.length === 1 && saiu.microblocks[0].done === true && /^mb_/.test(saiu.microblocks[0].id), 'cartão feito sai como bloco feito, com a checklist como estava');
  // soltar em outro lugar: explica e nada muda
  server.log.length = 0;
  dragEv('dragstart', row(ID(547), 'sc_2')); await sleep(40);
  dragEv('drop', card(c552)); await sleep(80);
  ok(writes().length === 0 && /solte o cartão num espaço tracejado/.test($('toast').textContent) && !d.querySelectorAll('#ag-cols .ag-drop').length, 'soltar o cartão em cima de um bloco comum: nada muda e ensina o caminho');

  // ======================================================================================================
  console.log('\nE) Cartão de uma sublista pra outra:');
  server.patch('blocos', UID, ID(545), { cards: [] }); await settle();
  dragEv('dragstart', row(ID(547), 'sc_2')); await sleep(40);
  dragEv('dragover', card(ID(545)));
  ok(card(ID(545)).classList.contains('ag-sub-over'), 'em cima de outra sublista, ela acende');
  server.log.length = 0;
  dragEv('drop', card(ID(545)));
  await waitFor(() => (B(ID(545)).cards || []).length === 1); await settle();
  ok(B(ID(545)).cards[0].id === 'sc_2' && B(ID(545)).cards[0].title === 'Cartão B' && B(ID(547)).cards.length === 0 && /^Cartão foi pra sublista Bloco 545/.test($('toast').textContent), 'soltou: o mesmo cartão muda de sublista; aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');

  // ======================================================================================================
  console.log('\nF) Bloco entra na sublista arrastando (vira cartão):');
  const c551 = ID(551);
  dragEv('dragstart', card(c551)); await sleep(40);
  dragEv('dragover', card(ID(545)));
  ok(card(ID(545)).classList.contains('ag-sub-over'), 'arrastando um bloco por cima de uma sublista, ela acende');
  server.log.length = 0;
  dragEv('drop', card(ID(545)));
  await waitFor(() => B(c551).deleted === true); await settle();
  const novo = B(ID(545)).cards.find((c) => c.title === 'Bloco 551');
  ok(novo && novo.duration === 15 && novo.done === false && /^cd_/.test(novo.id) && writes().map((w2) => w2.op).join() === 'update,update', 'soltou: o bloco virou cartão da sublista (com o tempo dele guardado) e saiu da agenda');
  ok(/^Entrou na sublista Bloco 545/.test($('toast').textContent) && !card(c551), 'aviso: "' + $('toast').textContent.split('Desfazer')[0].trim() + '"');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => B(c551).deleted === false); await settle();
  ok(B(c551).deleted === false && !B(ID(545)).cards.some((c) => c.title === 'Bloco 551'), 'Ctrl+Z desfaz os dois');
  // com nota vinculada: pergunta antes
  const nota = server.alive('notas', UID)[0];
  server.patch('blocos', UID, c551, { linked_note_ids: [nota.id] }); await settle();
  dragEv('dragstart', card(c551)); await sleep(40); dragEv('drop', card(ID(545)));
  await waitFor(() => !$('dialog').classList.contains('hidden'));
  ok(/1 nota vinculada/.test($('dialog').textContent), 'bloco com nota vinculada: pergunta antes ("' + $('dlg-text').textContent + '")');
  click($('dlg-cancel')); await settle();
  ok(B(c551).deleted === false, 'cancelou: nada muda');
  dragEv('dragstart', card(c551)); await sleep(40); dragEv('drop', card(ID(545)));
  await waitFor(() => !$('dialog').classList.contains('hidden')); click($('dlg-ok'));
  await waitFor(() => B(c551).deleted === true); await settle();
  ok(B(c551).deleted === true && B(ID(545)).cards.some((c) => c.title === 'Bloco 551') && !server.get('notas', UID, nota.id).deleted, 'confirmou: entrou (a nota continua nas Notas)');
  // o que não entra
  server.log.length = 0;
  dragEv('dragstart', card(ID(547))); await sleep(40); dragEv('drop', card(ID(545))); await sleep(80);
  ok(writes().length === 0 && /Uma sublista não entra em outra/.test($('toast').textContent), 'sublista em cima de sublista: "' + $('toast').textContent + '"');
  server.patch('blocos', UID, c552, { theme: 'rest' }); await settle();
  dragEv('dragstart', card(c552)); await sleep(40); dragEv('drop', card(ID(545))); await sleep(80);
  ok(writes().length === 0 && /Descanso não entra numa sublista/.test($('toast').textContent), 'Descanso: "' + $('toast').textContent + '"');

  ok(!errors.length, 'nenhum erro na página' + (errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
