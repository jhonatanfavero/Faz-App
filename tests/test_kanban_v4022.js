// V40.22.0 — tela do PC (kanban.html): (A) notas vinculadas ao bloco da Agenda, as mesmas do app (linked_note_ids):
// ver, vincular existente, criar já vinculada, desvincular, abrir, ícone no bloco, apagar a nota solta o vínculo.
// (B) visão Dia com os horários vagos compactados ("Compactar vagos"): faixas clicáveis, escala por trechos.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4022.js <repo> <backup.json>
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
const NOTES = J('tb_notes_db').map((n) => n.id); // 3 notas: "Nota 1", "Nota 2", "Nota 3"
// quarta 18/11: o dia do print dele (bastante horário vago entre os blocos)
const DAY = '2026-11-18';
const mk = (id, h, m, dur, title, extra) => server.tables.blocos.set(UID + '|' + id, { user_id: UID, id, date: DAY, start_min: h * 60 + m, duration: dur, title, type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false, updated_at: ++server.clock, ...extra });
mk('f_car', 12, 0, 30, 'CAR JULIANA', { completed: true, linked_note_ids: [NOTES[0], 'note_que_nao_existe'] });
mk('f_memo', 12, 30, 30, 'MEMORIAL MARILENE', { completed: true });
mk('f_contas', 15, 25, 30, 'PAGAR CONTAS PESSOAIS');
mk('f_lorene', 16, 35, 30, 'LORENE');
mk('f_pao', 17, 20, 30, 'COMPRAR PÃO');
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
  const dlgOk = async (value) => { await waitFor(() => visible('dialog')); if (value != null) $('dlg-input').value = value; click($('dlg-ok')); await sleep(30); };
  const row = (t, id) => server.get(t, UID, id);
  const block = (id) => d.querySelector('#ag-timeline [data-block="' + id + '"]');
  await waitFor(() => d.querySelectorAll('section.col').length === 5);

  // ir pra quarta 18/11, visão Dia
  click($('tab-agenda'));
  click(d.querySelector('.ag-view[data-view="day"]'));
  click($('ag-next')); click($('ag-next'));
  await waitFor(() => !!block('f_car'));

  console.log('A) Notas vinculadas ao bloco (igual ao app):');
  ok(server.log.some((l) => l.op === 'select' && l.t === 'blocos'), 'a agenda carrega com o vínculo das notas');
  ok(block('f_car').querySelector('.ag-notes') && block('f_car').querySelector('.ag-notes').textContent.trim().endsWith('1') && !block('f_memo').querySelector('.ag-notes'), 'o bloco com nota mostra o ícone com 1 (a nota que não existe mais não conta)');
  click(block('f_car'));
  ok(visible('modal-task') && visible('f-notes-wrap') && d.querySelectorAll('#f-notes [data-note-open]').length === 1 && $('f-notes').textContent.includes('Nota 1'), 'o cartão do bloco tem a seção Notas, com a "Nota 1" vinculada');
  const before = JSON.stringify(Object.assign({}, row('blocos', 'f_car'), { updated_at: 0, linked_note_ids: 0 }));
  click($('f-note-link'));
  ok(visible('f-note-pick') && d.querySelectorAll('#f-note-opts [data-note-pick]').length === 2 && !d.querySelector('#f-note-opts [data-note-pick="' + NOTES[0] + '"]') && d.activeElement === $('f-note-q'), '"Vincular nota" abre a busca com as outras notas (a já vinculada não aparece)');
  $('f-note-q').value = 'nota 3'; $('f-note-q').dispatchEvent(new w.Event('input', { bubbles: true }));
  ok(d.querySelectorAll('#f-note-opts [data-note-pick]').length === 1, 'a busca filtra ("nota 3")');
  key($('f-note-q'), 'Enter');
  await waitFor(() => row('blocos', 'f_car').linked_note_ids.length === 3);
  ok(JSON.stringify(row('blocos', 'f_car').linked_note_ids) === JSON.stringify([NOTES[0], 'note_que_nao_existe', NOTES[2]]) && toastTxt() === 'Nota vinculada' && !visible('f-note-pick'), 'Enter vincula a primeira: a nuvem ganha a nota no fim da lista do bloco');
  ok(JSON.stringify(Object.assign({}, row('blocos', 'f_car'), { updated_at: 0, linked_note_ids: 0 })) === before, 'só o vínculo foi gravado (o resto do bloco não foi tocado)');
  ok(d.querySelectorAll('#f-notes [data-note-open]').length === 2 && visible('modal-task'), 'o cartão continua aberto, com as 2 notas');
  click(d.querySelector('#f-notes [data-note-unlink="' + NOTES[0] + '"]'));
  ok(await waitFor(() => JSON.stringify(row('blocos', 'f_car').linked_note_ids) === JSON.stringify(['note_que_nao_existe', NOTES[2]])) && !row('notas', NOTES[0]).deleted && toastTxt().startsWith('Nota desvinculada'), 'desvincular tira só o vínculo (a nota continua na aba Notas)');
  click($('f-note-new'));
  await dlgOk('Ideia do bloco <b>');
  await waitFor(() => row('blocos', 'f_car').linked_note_ids.length === 3);
  const nid = row('blocos', 'f_car').linked_note_ids[2], nn = row('notas', nid);
  ok(nn && nn.title === 'Ideia do bloco <b>' && nn.content === '' && /^note_\d+_\w+$/.test(nid) && nn.created_ms === nn.updated_ms && toastTxt().startsWith('Nota criada e vinculada'), '"Nova nota": cria a nota (formato do app) e já vincula ao bloco');
  ok(!d.querySelector('#f-notes b') && $('f-notes').textContent.includes('Ideia do bloco <b>'), 'título com HTML aparece como texto');
  // o celular vincula outra nota: o cartão aberto acompanha
  server.patch('blocos', UID, 'f_car', { linked_note_ids: ['note_que_nao_existe', NOTES[2], nid, NOTES[1]] });
  ok(await waitFor(() => d.querySelectorAll('#f-notes [data-note-open]').length === 3 && $('f-notes').textContent.includes('Nota 2')), 'nota vinculada no celular aparece no cartão aberto');
  click($('f-note-link'));
  key($('f-note-q'), 'Escape');
  ok(!visible('f-note-pick') && visible('modal-task'), 'Esc na busca fecha só a busca');
  // abrir a nota: o que mudou no cartão é salvo antes de ir pra aba Notas
  $('f-title').value = 'CAR JULIANA (ok)';
  click(d.querySelector('#f-notes [data-note-open="' + NOTES[2] + '"]'));
  await waitFor(() => visible('notas') && $('nt-title').value === 'Nota 3');
  ok(!visible('modal-task') && visible('notas') && $('nt-title').value === 'Nota 3', 'clicar na nota abre ela na aba Notas');
  ok(await waitFor(() => row('blocos', 'f_car').title === 'CAR JULIANA (ok)'), 'e o nome que tinha sido mudado no cartão foi salvo antes');
  // apagar a nota na aba Notas solta o vínculo dos blocos (igual ao app)
  click($('nt-delete'));
  await dlgOk();
  ok(await waitFor(() => row('notas', NOTES[2]).deleted === true && !row('blocos', 'f_car').linked_note_ids.includes(NOTES[2])), 'apagar a nota tira ela dos blocos que vinculavam');
  click($('tab-agenda'));
  await waitFor(() => !!block('f_car'));
  ok(block('f_car').querySelector('.ag-notes').textContent.trim().endsWith('2'), 'o ícone do bloco acompanha (2 notas)');
  click($('ag-new'));
  ok(visible('modal-task') && !visible('f-notes-wrap'), 'bloco novo ainda não tem a seção Notas (aparece depois de criado)');
  key(d.body, 'Escape');
  click(d.querySelector('.ag-view[data-view="week"]'));
  const wcard = d.querySelector('#ag-cols [data-block="f_car"]');
  ok(wcard && wcard.querySelector('.ag-notes') && wcard.querySelector('.ag-notes').textContent.trim() === '2', 'na Semana o bloco também mostra o ícone das notas');

  console.log('\nB) Dia com os horários vagos compactados:');
  ok(!visible('ag-compact'), 'na Semana não tem o botão');
  click(d.querySelector('.ag-view[data-view="day"]'));
  await waitFor(() => !!block('f_car'));
  ok(visible('ag-compact') && $('ag-compact').textContent.trim() === 'Compactar vagos' && $('ag-compact').getAttribute('aria-pressed') === 'false', 'no Dia aparece "Compactar vagos"');
  const fullH = parseFloat($('ag-timeline').style.height);
  ok(fullH === 17 * 60 * 3.2 + 12 && !d.querySelector('.ag-cgap'), 'normal: o dia inteiro, 07:00 às 24:00, na escala de sempre');
  click($('ag-compact'));
  const strips = [...d.querySelectorAll('#ag-timeline .ag-cgap')];
  ok(strips.map((s) => s.textContent.replace(/\s+/g, ' ').trim()).join(' | ') === '07:00–12:00· livre 5h | 13:00–15:25· livre 2h 25m | 15:55–16:35· livre 40m | 17:50–24:00· livre 6h 10m', 'vagos de 30 min ou mais viram faixas: 07:00–12:00, 13:00–15:25, 15:55–16:35 e 17:50–24:00 (o de 15 min fica)');
  const top = (id) => parseFloat(block(id).style.top);
  ok(top('f_car') === 31 && top('f_memo') === 31 + 96 && top('f_contas') === 253 && top('f_lorene') === 379 && top('f_pao') === 379 + 45 * 3.2, 'os blocos ficam colados nas faixas, na escala de sempre entre eles (o vago de 15 min continua do tamanho real)');
  ok(parseFloat($('ag-timeline').style.height) === 660 && fullH / 660 > 4.9, 'o dia fica quase 5 vezes mais curto (3276 px → 660 px)');
  const hours = [...d.querySelectorAll('#ag-timeline span.tabular-nums')].map((x) => x.textContent).filter((t) => /^\d\d:00$/.test(t));
  ok(hours.join() === '17:00', 'só aparecem as horas que não estão dentro de uma faixa (17:00)');
  ok($('ag-compact').textContent.trim() === 'Mostrar vagos' && $('ag-compact').getAttribute('aria-pressed') === 'true' && $('ag-compact').classList.contains('ag-filter-on') && w.localStorage.getItem('faz_pc_ag_compact') === '1', 'o botão vira "Mostrar vagos" e a escolha fica guardada no computador');
  click(strips[1]);
  ok(visible('modal-task') && $('f-start').value === '13:00' && $('f-date').value === DAY, 'clicar na faixa 13:00–15:25 abre um bloco novo às 13:00');
  $('f-title').value = 'Almoço com cliente'; click($('f-save'));
  await waitFor(() => server.alive('blocos', UID).some((b) => b.title === 'Almoço com cliente'));
  const novo = server.alive('blocos', UID).find((b) => b.title === 'Almoço com cliente');
  ok(novo.date === DAY && novo.start_min === 780 && novo.duration === 30, 'criado às 13:00 de quarta (30 min)');
  await waitFor(() => [...d.querySelectorAll('#ag-timeline .ag-cgap')].length === 4 && d.querySelectorAll('#ag-timeline .ag-cgap')[1].textContent.includes('13:30–15:25'));
  ok(d.querySelectorAll('#ag-timeline .ag-cgap')[1].textContent.includes('13:30–15:25· livre 1h 55m'), 'a faixa encolhe pro que sobrou (13:30–15:25)');
  // tarefa na mão: a faixa coloca a tarefa no começo do vago
  click($('tab-listas'));
  const t0 = d.querySelector('#columns [data-hand]');
  const taskId = t0.dataset.hand, dur = server.get('tarefas', UID, taskId).duration;
  click(t0);
  await waitFor(() => visible('agenda') && visible('ag-place'));
  const handStrip = [...d.querySelectorAll('#ag-timeline .ag-cgap')].find((s) => s.dataset.cgap === '810');
  ok(visible('ag-place') && handStrip && handStrip.title === 'Colocar a tarefa às 13:30', 'com a tarefa na mão, a faixa diz "Colocar a tarefa às 13:30"');
  click(handStrip);
  ok(await waitFor(() => server.alive('blocos', UID).some((b) => b.date === DAY && b.start_min === 810 && b.duration === dur)), 'clicar coloca a tarefa às 13:30');
  click($('ag-compact'));
  ok(!d.querySelector('.ag-cgap') && parseFloat($('ag-timeline').style.height) === fullH && w.localStorage.getItem('faz_pc_ag_compact') === '0', '"Mostrar vagos" volta o dia inteiro');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
