// V40.24.0 — tela do PC (kanban.html): SUBLISTA (bloco com vários cartões no mesmo horário), igual ao celular.
// (A) Semana e Dia; (B) a janela da sublista: marcar, criar, puxar da Lista, voltar pra lista, apagar cartão,
// devolver os não feitos, abrir o cartão (nome, tag, cor e checklist); (C) criar pelo "Novo bloco";
// (D) tarefa na mão → sublista; (E) apagar a sublista; (F) o celular mexendo (tempo real); texto nunca vira HTML.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4024.js <repo> <backup.json>
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
const TAGS = J('tb_tags_db'), T1 = TAGS[0].id, T2 = TAGS[1].id;
const DAY = '2026-11-18'; // quarta: livre nos dados de teste
const mk = (id, h, m, dur, title, extra) => server.tables.blocos.set(UID + '|' + id, { user_id: UID, id, date: DAY, start_min: h * 60 + m, duration: dur, title, type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, cards: null, deleted: false, updated_at: ++server.clock, ...extra });
mk('f_sub', 14, 0, 60, 'Pendências rápidas', { tag_id: T1, cards: [
  { id: 'cd_1', title: 'Pagar boleto', done: true, tagId: T2, microblocks: [], duration: 15, columnId: 'col_geral' },
  { id: 'cd_2', title: 'Ligar pro cartório', done: false, microblocks: [{ title: 'Pegar o número', done: true }, { title: 'Ligar', done: false }] },
  { id: 'cd_3', title: '<img src=x onerror="window.__xss=1">Imprimir', done: false, color: '#1e293b', microblocks: [] },
] });
mk('f_norm', 16, 0, 30, 'Reunião');
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
      const RD = w.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime(); // segunda 16/11/2026, 07:20
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const key = (el, k) => { const e = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
  const visible = (id) => !$(id).classList.contains('hidden');
  const toastTxt = () => $('toast').textContent;
  const row = (t, id) => server.get(t, UID, id);
  const cards = () => row('blocos', 'f_sub').cards;
  const wk = (id) => d.querySelector('#ag-cols [data-block="' + id + '"]');
  const dayEl = (id) => d.querySelector('#ag-timeline [data-block="' + id + '"]');
  const updates = () => server.log.filter((l) => l.op === 'update' && l.t === 'blocos');
  const dlg = async (which) => { await waitFor(() => visible('dialog')); click($(which || 'dlg-ok')); await sleep(40); };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda'));
  await waitFor(() => !!wk('f_norm'));

  console.log('A) A sublista na Semana e no Dia:');
  let el = wk('f_sub');
  ok(el && el.classList.contains('ag-sub') && !wk('f_norm').classList.contains('ag-sub'), 'a sublista tem o cartão amarelinho tracejado; o bloco normal continua igual');
  ok(/14:00–15:00/.test(el.textContent) && el.querySelector('.ag-sub-badge').textContent === '1/3' && el.querySelector('.ag-sub-title').textContent.includes('Pendências rápidas'), 'mostra horário, o nome e "1/3" (cartões feitos)');
  ok(el.querySelectorAll('.ag-sub-card').length === 3 && el.querySelectorAll('.ag-sub-card.done').length === 1 && el.querySelectorAll('.ag-sub-card')[0].querySelector('.ag-sub-mb') === null && el.querySelectorAll('.ag-sub-card')[1].querySelector('.ag-sub-mb').textContent.trim() === '1/2', 'os 3 cartões, o feito riscado e a checklist (1/2)');
  ok(!w.__xss && !el.querySelector('img') && el.textContent.includes('<img src=x'), 'nome com HTML aparece como texto');
  ok(el.querySelectorAll('.ag-sub-card')[2].classList.contains('dark') && el.querySelectorAll('.ag-sub-card')[0].style.borderLeftColor !== '', 'cartão pintado (cor escura) e faixa da tag do cartão');
  // marcar pela Semana
  click(el.querySelector('[data-sub-ck][data-card="cd_2"]'));
  await waitFor(() => cards()[1].done === true);
  ok(cards()[1].done === true && row('blocos', 'f_sub').completed === false && updates().pop().fields.join() === 'cards', 'marcar um cartão grava só os cartões');
  click(wk('f_sub').querySelector('[data-sub-ck][data-card="cd_3"]'));
  await waitFor(() => row('blocos', 'f_sub').completed === true);
  ok(row('blocos', 'f_sub').completed === true && cards().every((c) => c.done) && toastTxt() === 'Sublista concluída! 🎉' && updates().pop().fields.sort().join() === 'cards,completed', 'marcou o último: a sublista fica concluída e avisa');
  ok(await waitFor(() => wk('f_sub').classList.contains('done')), 'e fica verde na Semana');
  click(wk('f_sub').querySelector('[data-done]'));
  await waitFor(() => row('blocos', 'f_sub').completed === false);
  ok(cards().every((c) => !c.done) && toastTxt() === 'Cartões desmarcados', 'o círculo da sublista, com tudo marcado, desmarca todos');
  click(wk('f_sub').querySelector('[data-done]'));
  await waitFor(() => row('blocos', 'f_sub').completed === true);
  ok(cards().every((c) => c.done) && toastTxt() === 'Todos os cartões feitos', 'e marca todos de novo');
  // Dia
  click(wk('f_sub').closest('section').querySelector('.ag-day-btn'));
  await waitFor(() => !!dayEl('f_sub'));
  el = dayEl('f_sub');
  ok(el.classList.contains('ag-sub') && el.querySelectorAll('.ag-sub-card').length === 3 && !!el.querySelector('.ag-rz') && /14:00–15:00 · 1h · 3\/3 feitos/.test(el.textContent), 'no Dia: amarelinha, com os cartões que cabem (1h cabe 5) e a alça de esticar');
  click(el.querySelector('[data-sub-ck][data-card="cd_1"]'));
  await waitFor(() => cards()[0].done === false);
  ok(cards()[0].done === false && row('blocos', 'f_sub').completed === false && !visible('modal-task'), 'marcar no Dia não abre o cartão do bloco');

  console.log('\nB) A janela da sublista:');
  click(dayEl('f_sub'));
  ok(visible('modal-task') && visible('f-cards-wrap') && !visible('f-mbs-wrap') && !visible('f-tolist') && $('f-delete').textContent === 'Apagar sublista' && $('f-cards-count').textContent === '2 de 3 feitos', 'abre com "Cartões da sublista" no lugar da checklist (2 de 3 feitos), sem "Voltar pra lista" do bloco');
  ok(d.querySelectorAll('#f-cards .fc-row').length === 3 && visible('f-cards-return') && $('f-cards-return').textContent.trim() === 'Devolver o não feito pra Lista', 'lista os 3 cartões e o botão "Devolver o não feito pra Lista"');
  click(d.querySelector('#f-cards [data-fc-ck="cd_1"]'));
  await waitFor(() => cards()[0].done === true);
  ok(await waitFor(() => d.querySelector('#f-cards .fc-row.done [data-fc-ck="cd_1"]') && !visible('f-cards-return')), 'marcar na janela vale na hora e a lista acompanha');
  // novo cartão
  $('f-card-new').value = 'Comprar toner';
  key($('f-card-new'), 'Enter');
  await waitFor(() => cards().length === 4);
  const c4 = cards()[3];
  ok(c4.title === 'Comprar toner' && /^cd_[a-z0-9]+_[a-z0-9]+$/.test(c4.id) && c4.done === false && row('blocos', 'f_sub').completed === false && $('f-card-new').value === '', 'Enter cria o cartão (e a sublista reabre)');
  // puxar da Lista
  const TASK = server.alive('tarefas', UID).find((t) => t.title === 'Tarefa 1');
  click($('f-card-pull'));
  ok(visible('f-card-pick') && d.activeElement === $('f-card-q') && d.querySelectorAll('#f-card-opts [data-fc-pick]').length > 5, '"Puxar da Lista" abre a busca nas tarefas');
  $('f-card-q').value = 'tarefa 1'; $('f-card-q').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(d.querySelector('#f-card-opts [data-fc-pick]').dataset.fcPick === TASK.id && /GAMA/.test(d.querySelector('#f-card-opts [data-fc-pick]').textContent), 'a busca filtra e mostra a lista de cada tarefa');
  key($('f-card-q'), 'Enter');
  await waitFor(() => cards().length === 5 && row('tarefas', TASK.id).deleted === true);
  const c5 = cards()[4];
  ok(c5.title === 'Tarefa 1' && c5.tagId === TASK.tag_id && c5.columnId === TASK.column_id && c5.duration === TASK.duration && c5.microblocks.length === 3 && row('tarefas', TASK.id).deleted === true && /^Entrou na sublista/.test(toastTxt()), 'Enter traz a primeira: entra na sublista inteira e sai da Lista');
  key($('f-card-q'), 'Escape');
  ok(!visible('f-card-pick') && visible('modal-task'), 'Esc fecha só a busca');
  // voltar pra lista
  click(d.querySelector('#f-cards [data-fc-list="' + c5.id + '"]'));
  await waitFor(() => cards().length === 4);
  const back = server.alive('tarefas', UID).find((t) => t.title === 'Tarefa 1');
  ok(back && back.column_id === TASK.column_id && back.duration === TASK.duration && back.tag_id === TASK.tag_id && back.microblocks.length === 3 && back.microblocks.every((m) => m.done === false) && /^Voltou pra lista GAMA/.test(toastTxt()), 'voltou pra lista de onde veio (GAMA), inteira');
  // apagar cartão
  click(d.querySelector('#f-cards [data-fc-del="' + c4.id + '"]'));
  await dlg();
  await waitFor(() => cards().length === 3);
  ok(cards().length === 3 && !cards().some((c) => c.id === c4.id) && toastTxt() === 'Cartão apagado', 'apagar o cartão pergunta antes e tira da sublista');
  // devolver os não feitos
  w.document.querySelectorAll('#f-cards [data-fc-ck]');
  click(d.querySelector('#f-cards [data-fc-ck="cd_2"]'));
  await waitFor(() => cards()[1].done === false);
  const nT = server.alive('tarefas', UID).length;
  await waitFor(() => visible('f-cards-return'));
  click($('f-cards-return'));
  await waitFor(() => cards().length === 2);
  ok(cards().map((c) => c.id).join() === 'cd_1,cd_3' && server.alive('tarefas', UID).length === nT + 1 && server.alive('tarefas', UID).some((t) => t.title === 'Ligar pro cartório' && t.column_id === 'col_geral' && t.microblocks.length === 2) && toastTxt() === '1 cartão voltou pra Lista' && row('blocos', 'f_sub').completed === true, 'devolveu o não feito (pra lista padrão, com a checklist) e a sublista ficou concluída');
  // abrir o cartão: salva antes o que mudou na sublista
  $('f-title').value = 'Pendências (tarde)';
  click(d.querySelector('#f-cards [data-fc-open="cd_3"]'));
  await waitFor(() => visible('f-card-back'));
  ok(await waitFor(() => row('blocos', 'f_sub').title === 'Pendências (tarde)'), 'abrir um cartão salva antes o nome novo da sublista');
  ok(visible('modal-task') && visible('f-card-back') && $('f-card-back').textContent.includes('Pendências (tarde)') && !visible('f-grid') && visible('f-mbs-wrap') && !visible('f-cards-wrap') && visible('f-tolist') && $('f-delete').textContent === 'Apagar cartão' && !visible('f-done') && !visible('f-notes-wrap') && $('f-title').value.startsWith('<img'), 'o cartão abre no mesmo cartão das Listas (nome, tag, cor, checklist), com "← Pendências (tarde)"');
  $('f-title').value = 'Imprimir planta';
  click(d.querySelector('#f-tags [data-tag="' + T1 + '"]'));
  $('f-mb-new').value = 'A3 colorida'; key($('f-mb-new'), 'Enter');
  click(d.querySelector('#f-colors [data-color=""]'));
  const nUp = updates().length;
  click($('f-save'));
  await waitFor(() => cards()[1].title === 'Imprimir planta');
  const c3 = cards()[1];
  ok(c3.title === 'Imprimir planta' && c3.tagId === T1 && !('color' in c3) && c3.microblocks.length === 1 && c3.microblocks[0].title === 'A3 colorida' && toastTxt() === 'Cartão salvo' && updates().slice(nUp).every((u) => u.fields.join() === 'cards'), 'salvou nome, tag, cor e checklist do cartão (gravando só os cartões)');
  ok(await waitFor(() => visible('modal-task') && visible('f-cards-wrap') && !visible('f-card-back')), 'e voltou pra janela da sublista');
  click(d.querySelector('#f-cards [data-fc-open="cd_1"]'));
  await waitFor(() => visible('f-card-back'));
  click($('f-cancel'));
  ok(visible('modal-task') && visible('f-cards-wrap') && !visible('f-card-back'), 'Cancelar no cartão volta pra sublista');
  click(d.querySelector('#f-cards [data-fc-open="cd_1"]'));
  await waitFor(() => visible('f-card-back'));
  key(d.body, 'Escape');
  ok(visible('modal-task') && visible('f-cards-wrap'), 'Esc também volta pra sublista');
  click(d.querySelector('#f-cards [data-fc-open="cd_1"]'));
  await waitFor(() => visible('f-card-back'));
  click($('f-tolist'));
  await waitFor(() => cards().length === 1);
  ok(server.alive('tarefas', UID).some((t) => t.title === 'Pagar boleto' && t.column_id === 'col_geral' && t.duration === 15 && t.tag_id === T2) && visible('f-cards-wrap'), '"Voltar pra lista" no cartão aberto devolve ele e volta pra sublista');
  click(d.querySelector('#f-cards [data-fc-open="cd_3"]'));
  await waitFor(() => visible('f-card-back'));
  click($('f-delete'));
  await dlg();
  await waitFor(() => cards().length === 0);
  ok(cards().length === 0 && visible('f-cards-wrap') && $('f-cards-count').textContent === 'nenhum ainda' && row('blocos', 'f_sub').completed === true, '"Apagar cartão" no cartão aberto também (sublista vazia continua concluída)');
  key(d.body, 'Escape');

  console.log('\nC) Criar pelo "Novo bloco":');
  click($('ag-new'));
  ok(visible('modal-task') && visible('f-sub-wrap') && !$('f-sub').checked && visible('f-mbs-wrap'), 'bloco novo tem a opção "Sublista"');
  $('f-sub').checked = true; $('f-sub').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(!visible('f-mbs-wrap'), 'marcar "Sublista" esconde a checklist');
  $('f-title').value = '';
  click($('f-save'));
  await waitFor(() => server.alive('blocos', UID).some((b) => b.title === 'Sublista' && Array.isArray(b.cards)));
  const ns = server.alive('blocos', UID).find((b) => b.title === 'Sublista' && Array.isArray(b.cards));
  ok(ns && ns.cards.length === 0 && ns.date === DAY && /^Sublista criada para/.test(toastTxt()), 'sem nome vira "Sublista", nasce vazia no dia aberto');
  click($('ag-new'));
  ok(!$('f-sub').checked && visible('f-mbs-wrap'), 'o próximo bloco novo volta a ser bloco normal');
  key(d.body, 'Escape');
  click(dayEl(ns.id));
  ok(visible('f-cards-wrap') && !visible('f-sub-wrap') && $('f-cards-count').textContent === 'nenhum ainda', 'a sublista nova abre com os cartões (vazia)');
  key(d.body, 'Escape');

  console.log('\nD) Tarefa na mão → sublista:');
  click($('tab-listas'));
  const hand = d.querySelector('#columns [data-hand]'), hid = hand.dataset.hand, ht = row('tarefas', hid);
  click(hand);
  await waitFor(() => visible('agenda') && visible('ag-place'));
  await waitFor(() => !!dayEl(ns.id));
  ok(!!dayEl(ns.id).querySelector('[data-sub-drop]') && !dayEl('f_norm').querySelector('[data-sub-drop]'), 'no Dia, a sublista mostra "Colocar na sublista"');
  click(dayEl(ns.id).querySelector('[data-sub-drop]'));
  await waitFor(() => row('tarefas', hid).deleted === true);
  const got = row('blocos', ns.id).cards[0];
  ok(got && got.title === ht.title && got.columnId === ht.column_id && got.duration === ht.duration && !visible('ag-place') && /^Entrou na sublista Sublista/.test(toastTxt()), 'a tarefa entrou na sublista (com a lista de origem) e saiu da Lista');
  // na Semana, clicando no cartão da sublista
  click($('tab-listas'));
  const hand2 = d.querySelector('#columns [data-hand]'), hid2 = hand2.dataset.hand;
  click(hand2);
  await waitFor(() => visible('ag-place'));
  click(d.querySelector('.ag-view[data-view="week"]'));
  await waitFor(() => !!wk(ns.id) && !!wk(ns.id).querySelector('[data-sub-drop]'));
  click(wk(ns.id).querySelector('.ag-sub-title'));
  ok(await waitFor(() => row('tarefas', hid2).deleted === true && row('blocos', ns.id).cards.length === 2), 'na Semana, clicar na sublista com a tarefa na mão também coloca');
  // Descanso na mão: não entra
  click($('tab-rotinas'));
  const rest = server.alive('rotinas', UID).find((r) => r.theme === 'rest');
  if (rest) {
    click(d.querySelector('[data-rt-hand="' + rest.id + '"]'));
    await waitFor(() => visible('ag-place'));
    await waitFor(() => !!wk(ns.id));
    ok(!wk(ns.id).querySelector('[data-sub-drop]'), 'rotina de Descanso na mão: a sublista não vira lugar de soltar');
    click(wk(ns.id));
    ok(row('blocos', ns.id).cards.length === 2 && /Descanso não entra numa sublista/.test(toastTxt()), 'e clicar nela avisa: "' + toastTxt() + '"');
    click($('ag-place-cancel'));
  } else ok(true, '(sem rotina de Descanso nos dados de teste)');

  console.log('\nE) Apagar a sublista:');
  const nT2 = server.alive('tarefas', UID).length;
  click(wk(ns.id).querySelector('[data-more]'));
  click(d.querySelector('div.fixed.z-40 [data-act="delete"]'));
  await waitFor(() => visible('dialog'));
  ok($('dlg-title').textContent === 'Apagar esta sublista?' && visible('dlg-alt') && $('dlg-alt').textContent === 'Devolver os 2 pra Lista e apagar' && $('dlg-ok').textContent === 'Apagar tudo', 'pelos 3 pontinhos: pergunta se os 2 não feitos voltam pra Lista');
  click($('dlg-alt'));
  await waitFor(() => row('blocos', ns.id).deleted === true);
  ok(row('blocos', ns.id).deleted === true && server.alive('tarefas', UID).length === nT2 + 2 && toastTxt() === 'Sublista apagada; 2 cartões voltaram pra Lista', 'devolveu os 2 e apagou');
  click(wk('f_sub'));
  click($('f-delete'));
  await waitFor(() => visible('dialog'));
  ok(!visible('dlg-alt') && $('dlg-ok').textContent === 'Apagar sublista', 'sublista sem cartão por fazer: só "Apagar sublista"');
  click($('dlg-cancel'));
  await sleep(40);
  ok(row('blocos', 'f_sub').deleted === false, 'cancelar não apaga');
  key(d.body, 'Escape');

  console.log('\nF) O celular mexe nos cartões (tempo real):');
  click(wk('f_sub'));
  server.patch('blocos', UID, 'f_sub', { cards: [{ id: 'cd_cel', title: 'Feito no celular', done: false, microblocks: [] }], completed: false });
  ok(await waitFor(() => wk('f_sub').textContent.includes('Feito no celular') && d.querySelectorAll('#f-cards .fc-row').length === 1 && $('f-cards').textContent.includes('Feito no celular')), 'o cartão novo do celular aparece na Semana e na janela aberta');
  key(d.body, 'Escape');
  server.patch('blocos', UID, 'f_sub', { cards: null });
  ok(await waitFor(() => !wk('f_sub').classList.contains('ag-sub')), 'se virar bloco normal, volta a aparecer como bloco');
  ok(!w.__xss, 'nenhum HTML de nome de cartão foi executado');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
