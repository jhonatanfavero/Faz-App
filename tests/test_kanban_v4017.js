// V40.17.0 — tela do PC (kanban.html): abas Rotinas e Notas, ligadas na nuvem e em tempo real.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4017.js <repo> <backup.json>
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

// nuvem = resultado do 1º sync do celular, agora com rotinas, notas e finanças
const server = makeServer();
server.addUser('pessoa@teste.com', 'senha123', UID);
const J = (k) => JSON.parse(backup.data[k]);
const local = { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db'), rotinas: J('tb_routines_db'), notas: J('tb_notes_db'), financas: J('tb_financial_db') };
const p = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(REPO, 'faz-config.js'), 'utf8');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script><script>' + cfg + '</script>');
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
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const visible = (id) => !$(id).classList.contains('hidden');
  const R = (id) => server.get('rotinas', UID, id), N = (id) => server.get('notas', UID, id);
  const lastLog = (op, t) => server.log.filter((x) => x.op === op && (!t || x.t === t)).pop();
  const confirmDialog = async () => { await waitFor(() => visible('dialog')); click($('dlg-ok')); await sleep(20); };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);

  console.log('U) Abas novas no topo:');
  ok([...d.querySelectorAll('.tab')].map((b) => b.textContent.trim()).join(',').includes('Listas,Agenda,Rotinas,Notas'), 'abas: Listas, Agenda, Rotinas e Notas (+ Finanças na V40.19.0 e Assistente na frente na V40.20.0)');
  click($('tab-rotinas'));
  ok(visible('rotinas') && !visible('board') && !visible('agenda') && !visible('notas') && $('tab-rotinas').classList.contains('on') && w.localStorage.getItem('faz_pc_tab') === 'rotinas', 'Rotinas abre sozinha na tela e fica lembrada');

  console.log('\nV) Rotinas:');
  const RT = local.rotinas.slice().sort((a, b) => b.createdAt - a.createdAt);
  const cards = () => [...d.querySelectorAll('#rt-grid [data-rt]')];
  ok(cards().length === RT.length && cards().map((c) => c.dataset.rt).join() === RT.map((r) => r.id).join() && $('board-summary').textContent === RT.length + ' rotinas', `as ${RT.length} rotinas do celular, das mais novas pras mais antigas (como no app)`);
  const r0 = RT[0], c0 = d.querySelector(`[data-rt="${r0.id}"]`);
  ok(c0.textContent.includes(r0.title) && c0.textContent.includes(r0.emoji) && c0.querySelectorAll('li').length === Math.min(4, r0.microblocks.length) + (r0.microblocks.length > 4 ? 1 : 0), 'cartão mostra emoji, nome e os primeiros itens da checklist (+N itens)');
  // editar
  click(c0);
  ok(visible('modal-rt') && $('rt-f-title').value === r0.title && $('rt-f-emoji').value === r0.emoji && +$('rt-f-dur').value === r0.duration && $('rt-f-mbs').querySelectorAll('input').length === r0.microblocks.length, 'clicar abre a rotina com nome, emoji, duração e checklist');
  typeIn($('rt-f-title'), 'Rotina editada no PC');
  click(d.querySelector('#rt-f-theme [data-theme="rest"]'));
  $('rt-f-mb-new').value = 'Item novo do PC'; key($('rt-f-mb-new'), 'Enter');
  click($('rt-f-save'));
  await waitFor(() => R(r0.id).title === 'Rotina editada no PC');
  const up = lastLog('update', 'rotinas');
  ok(R(r0.id).theme === 'rest' && R(r0.id).microblocks.length === r0.microblocks.length + 1 && R(r0.id).microblocks.slice(-1)[0].title === 'Item novo do PC' && R(r0.id).emoji === r0.emoji, 'salvar grava nome, tipo Descanso e o item novo; emoji continua');
  ok(up && up.fields.sort().join() === 'microblocks,theme,title', 'só os campos que mudaram sobem: ' + (up && up.fields.join(', ')));
  ok(!visible('modal-rt') && d.querySelector(`[data-rt="${r0.id}"]`).textContent.includes('Descanso'), 'janela fecha e o cartão mostra "Descanso"');
  // nova
  click($('rt-new'));
  ok(visible('modal-rt') && $('rt-f-title').value === '' && $('rt-f-emoji').value === '✨' && $('rt-f-dur').value === '60' && !visible('rt-f-delete'), 'Nova rotina abre vazia (✨, 1h), sem "Apagar"');
  click($('rt-f-save'));
  ok(visible('modal-rt') && /precisa de um nome/.test($('toast').textContent), 'sem nome não salva');
  typeIn($('rt-f-title'), 'Fechamento do dia'); $('rt-f-emoji').value = '📦'; $('rt-f-dur').value = '45';
  click(d.querySelector(`#rt-f-tags [data-tag="${local.tags[0].id}"]`));
  $('rt-f-mb-new').value = 'Conferir caixa'; key($('rt-f-mb-new'), 'Enter');
  $('rt-f-mb-new').value = 'Lançar notas'; key($('rt-f-mb-new'), 'Enter');
  click($('rt-f-save'));
  await waitFor(() => server.alive('rotinas', UID).some((r) => r.title === 'Fechamento do dia'));
  const nr = server.alive('rotinas', UID).find((r) => r.title === 'Fechamento do dia');
  ok(nr && /^rt_\d+$/.test(nr.id) && nr.emoji === '📦' && nr.duration === 45 && nr.tag_id === local.tags[0].id && nr.theme === 'focus' && nr.created_ms === w.Date.now() && JSON.stringify(nr.microblocks) === '[{"title":"Conferir caixa"},{"title":"Lançar notas"}]', 'rotina nova na nuvem no formato do app (id rt_, emoji, 45 min, tag, checklist)');
  ok(cards()[0].dataset.rt === nr.id, 'e aparece primeiro');
  // na mão → Agenda
  click(d.querySelector(`[data-rt-hand="${nr.id}"]`));
  ok($('tab-agenda').classList.contains('on') && visible('ag-place') && $('ag-place-title').textContent === '📦 Fechamento do dia' && /45m/.test($('ag-place-meta').textContent), 'a mão leva a rotina pra Agenda ("📦 Fechamento do dia", 45 min)');
  const gaps = () => [...d.querySelectorAll('#ag-cols [data-gap-day]')];
  const g = gaps().find((x) => x.dataset.gapDay === '2026-11-18'), gst = +g.dataset.gapStart;
  const nBlocks = server.alive('blocos', UID).length;
  click(g);
  await waitFor(() => server.alive('blocos', UID).length === nBlocks + 1);
  const nb = server.alive('blocos', UID).find((b) => b.title === '📦 Fechamento do dia');
  ok(nb && nb.date === '2026-11-18' && nb.start_min === gst && nb.duration === 45 && nb.tag_id === local.tags[0].id && nb.theme === 'focus' && nb.microblocks.length === 2 && nb.microblocks.every((m) => m.done === false && /^mb_/.test(m.id)), 'clicar no espaço livre cria o bloco com nome, horário, duração, tag e checklist desmarcada');
  ok(!R(nr.id).deleted && /Rotina na Agenda/.test($('toast').textContent) && !visible('ag-place'), 'a rotina continua existindo (dá pra usar de novo)');
  // na mão, rotina Descanso, e desistir
  click($('tab-rotinas'));
  click(d.querySelector(`[data-rt-hand="${r0.id}"]`));
  key(d.body, 'Escape');
  ok(!visible('ag-place') && $('toast').textContent === 'Nada foi agendado.', 'Esc desiste: "Nada foi agendado."');
  click($('tab-rotinas')); click(d.querySelector(`[data-rt-hand="${r0.id}"]`));
  const g2 = gaps().find((x) => x.dataset.gapDay === '2026-11-20'); click(g2);
  await waitFor(() => server.alive('blocos', UID).some((b) => b.title === r0.emoji + ' Rotina editada no PC'));
  ok(server.alive('blocos', UID).find((b) => b.title === r0.emoji + ' Rotina editada no PC').theme === 'rest', 'rotina de Descanso vira bloco de Descanso');
  // "Colocar na Agenda" de dentro da janela salva antes
  click($('tab-rotinas')); click(d.querySelector(`[data-rt="${nr.id}"]`));
  typeIn($('rt-f-title'), 'Fechamento renomeado'); click($('rt-f-hand'));
  await waitFor(() => R(nr.id).title === 'Fechamento renomeado' && visible('ag-place'));
  ok($('ag-place-title').textContent === '📦 Fechamento renomeado', '"Colocar na Agenda" de dentro da janela salva a rotina e já leva pra Agenda');
  key(d.body, 'Escape');
  // tempo real
  click($('tab-rotinas'));
  server.patch('rotinas', UID, RT[1].id, { title: 'Mudou no celular' });
  server.insert('rotinas', UID, { id: 'rt_cel_1', title: 'Criada no celular', emoji: '📱', duration: 30, theme: 'focus', microblocks: [], created_ms: w.Date.now() + 10 });
  await waitFor(() => d.querySelector('[data-rt="rt_cel_1"]') && d.querySelector(`[data-rt="${RT[1].id}"]`).textContent.includes('Mudou no celular'));
  ok(cards()[0].dataset.rt === 'rt_cel_1', 'mudança e rotina nova do celular aparecem na hora (tempo real)');
  // apagada no celular com a janela aberta
  click(d.querySelector('[data-rt="rt_cel_1"]'));
  server.patch('rotinas', UID, 'rt_cel_1', { deleted: true });
  await waitFor(() => !visible('modal-rt'));
  ok(!visible('modal-rt') && /apagada em outro aparelho/.test($('toast').textContent) && !d.querySelector('[data-rt="rt_cel_1"]'), 'rotina apagada no celular com a janela aberta: fecha e avisa');
  // apagar
  click(d.querySelector(`[data-rt="${RT[2].id}"]`)); click($('rt-f-delete'));
  ok(visible('dialog') && /Apagar a rotina/.test($('dlg-title').textContent), 'apagar pergunta antes');
  await confirmDialog();
  await waitFor(() => R(RT[2].id).deleted === true);
  ok(R(RT[2].id).deleted === true && !d.querySelector(`[data-rt="${RT[2].id}"]`) && lastLog('update', 'rotinas').fields.join() === 'deleted', 'confirmou: some daqui e vira tombstone na nuvem');

  console.log('\nW) Notas:');
  click($('tab-notas'));
  const NT = local.notas.slice().sort((a, b) => b.createdAt - a.createdAt);
  const items = () => [...d.querySelectorAll('#nt-list [data-nt]')];
  ok(visible('notas') && items().length === NT.length && items().map((b) => b.dataset.nt).join() === NT.map((n) => n.id).join() && $('board-summary').textContent === NT.length + ' notas', `as ${NT.length} notas, das mais novas pras mais antigas`);
  ok(visible('nt-none') && !visible('nt-form'), 'sem nota escolhida, mostra o convite pra escolher ou criar');
  const n0 = NT[0];
  click(items()[0]); await sleep(30);
  ok(visible('nt-form') && $('nt-title').value === n0.title && $('nt-content').value === n0.content && items()[0].classList.contains('on') && /Criada/.test($('nt-meta').textContent), 'clicar abre a nota (título, texto, data)');
  typeIn($('nt-content'), n0.content + '\nlinha escrita no PC');
  ok($('nt-status').textContent === 'Não salvo ainda', 'enquanto escreve: "Não salvo ainda"');
  await waitFor(() => N(n0.id).content.endsWith('linha escrita no PC'), 3000);
  const nu = lastLog('update', 'notas');
  ok(N(n0.id).content.endsWith('linha escrita no PC') && nu.fields.sort().join() === 'content,updated_ms' && $('nt-status').textContent === 'Salvo', 'salva sozinho logo depois de parar de escrever (só o texto e a data)');
  typeIn($('nt-title'), 'Reunião ');
  await waitFor(() => N(n0.id).title === 'Reunião', 3000); await sleep(150);
  ok($('nt-title').value === 'Reunião ', 'o espaço no fim do título não some enquanto escreve (grava "Reunião" sem ele)');
  typeIn($('nt-title'), 'Reunião de pauta'); key($('nt-title'), 's');
  $('nt-title').dispatchEvent(new w.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }));
  await waitFor(() => N(n0.id).title === 'Reunião de pauta', 1500);
  ok(N(n0.id).title === 'Reunião de pauta', 'Ctrl+S salva na hora');
  // nova
  click($('nt-new')); await sleep(20);
  ok(visible('nt-form') && $('nt-title').value === '' && $('nt-content').value === '' && /Nota nova/.test($('nt-list').textContent) && !visible('nt-delete'), 'Nova nota abre em branco e aparece como "Nota nova" na lista');
  const nNotas = server.rows('notas', UID).length;
  $('nt-content').dispatchEvent(new w.Event('blur')); await sleep(1100);
  ok(server.rows('notas', UID).length === nNotas, 'nota em branco não é criada');
  typeIn($('nt-content'), 'Ideia nova\nsegunda linha');
  await waitFor(() => server.rows('notas', UID).length === nNotas + 1, 3000);
  const nn = server.alive('notas', UID).find((x) => x.content === 'Ideia nova\nsegunda linha');
  ok(nn && /^note_\d+_[a-z0-9]+$/.test(nn.id) && nn.title === '' && nn.created_ms === w.Date.now() && nn.updated_ms === w.Date.now(), 'ao escrever, a nota nasce na nuvem no formato do app (id note_…, datas)');
  ok(items()[0].dataset.nt === nn.id && items()[0].classList.contains('on') && items()[0].textContent.includes('Ideia nova') && visible('nt-delete'), 'e vira a primeira da lista, com a primeira linha como nome');
  typeIn($('nt-content'), 'Ideia nova\nsegunda linha\nterceira');
  await waitFor(() => N(nn.id).content.endsWith('terceira'), 3000);
  ok(server.rows('notas', UID).length === nNotas + 1, 'continuar escrevendo atualiza a mesma nota (não cria outra)');
  // busca
  typeIn($('nt-search'), 'pauta');
  ok(items().length === 1 && items()[0].dataset.nt === n0.id, 'busca filtra pelo título e pelo texto');
  typeIn($('nt-search'), 'xyz-nada');
  ok(items().length === 0 && /Nenhuma nota com/.test($('nt-list').textContent), 'busca sem resultado avisa');
  typeIn($('nt-search'), '');
  // tempo real: nota aberta muda no celular (sem nada pendente) → atualiza; com texto pendente → mantém o daqui
  server.patch('notas', UID, nn.id, { content: 'mudou no celular' });
  await waitFor(() => $('nt-content').value === 'mudou no celular', 2000);
  ok($('nt-content').value === 'mudou no celular', 'nota aberta mudou no celular: o texto novo aparece');
  typeIn($('nt-content'), 'escrevendo no PC...');
  server.patch('notas', UID, nn.id, { content: 'outra mudança do celular' });
  await sleep(200);
  ok($('nt-content').value === 'escrevendo no PC...', 'mas se tem texto não salvo aqui, ele não é atropelado');
  await waitFor(() => N(nn.id).content === 'escrevendo no PC...', 3000);
  ok(N(nn.id).content === 'escrevendo no PC...', 'e é o que fica salvo');
  // apagada no celular enquanto escrevo aqui → vira nota nova
  typeIn($('nt-content'), 'texto que não pode sumir');
  server.patch('notas', UID, nn.id, { deleted: true });
  await waitFor(() => server.alive('notas', UID).some((x) => x.content === 'texto que não pode sumir'), 4000);
  ok(server.alive('notas', UID).some((x) => x.content === 'texto que não pode sumir' && x.id !== nn.id) && /vira uma nota nova/.test($('toast').textContent), 'nota apagada no celular enquanto escrevia aqui: o texto vira uma nota nova (nada se perde)');
  // trocar de aba salva o pendente
  click(items().find((b) => b.dataset.nt === n0.id)); await sleep(30);
  typeIn($('nt-content'), 'salvo ao trocar de aba');
  click($('tab-listas'));
  await waitFor(() => N(n0.id).content === 'salvo ao trocar de aba', 1500);
  ok(N(n0.id).content === 'salvo ao trocar de aba', 'trocar de aba salva na hora o que estava escrito');
  // apagar
  click($('tab-notas')); click(items().find((b) => b.dataset.nt === n0.id)); await sleep(30);
  click($('nt-delete'));
  ok(visible('dialog') && /Apagar a nota/.test($('dlg-title').textContent), 'apagar pergunta antes');
  await confirmDialog();
  await waitFor(() => N(n0.id).deleted === true);
  ok(N(n0.id).deleted === true && !items().some((b) => b.dataset.nt === n0.id) && visible('nt-none'), 'confirmou: some da lista, fecha o editor e vira tombstone na nuvem');
  // nota com HTML não vira elemento
  server.insert('notas', UID, { id: 'note_html', title: '<img src=x onerror=alert(1)>', content: '<b>oi</b>', created_ms: w.Date.now() + 50 });
  await waitFor(() => items().some((b) => b.dataset.nt === 'note_html'));
  ok(!d.querySelector('#nt-list img') && !d.querySelector('#nt-list b') && items()[0].textContent.includes('<img src=x'), 'título e texto com HTML aparecem como texto');

  console.log('\nY) Agenda: filtro por tag e ocultar concluídos:');
  click($('tab-agenda'));
  const weekDays = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
  const weekBlocks = () => server.alive('blocos', UID).filter((b) => !b.archived && weekDays.includes(b.date));
  const shown = () => [...d.querySelectorAll('#ag-cols [data-block]')].map((x) => x.dataset.block);
  const allIds = weekBlocks().map((b) => b.id);
  ok(shown().length === allIds.length && !$('ag-tag-wrap').classList.contains('ag-filter-on'), `sem filtro: os ${allIds.length} blocos da semana`);
  const tagCount = {}; weekBlocks().forEach((b) => { if (b.tag_id) tagCount[b.tag_id] = (tagCount[b.tag_id] || 0) + 1; });
  const tg = Object.keys(tagCount).sort((a, b) => tagCount[b] - tagCount[a])[0];
  const opts = [...$('ag-tag').options].map((o) => o.textContent);
  ok(opts[0] === 'Todas as tags' && opts[opts.length - 1] === 'Sem tag' && opts.length === server.alive('tags', UID).length + 2, 'o seletor tem "Todas as tags", cada tag e "Sem tag"');
  $('ag-tag').value = tg; $('ag-tag').dispatchEvent(new w.Event('change', { bubbles: true }));
  const want = weekBlocks().filter((b) => b.tag_id === tg).map((b) => b.id).sort().join();
  ok(shown().sort().join() === want && $('ag-tag-wrap').classList.contains('ag-filter-on'), `só a tag escolhida aparece (${tagCount[tg]} blocos) e o filtro fica destacado`);
  ok(/escondido/.test($('board-summary').textContent) && /\d+ de \d+ bloco/.test($('ag-cols').textContent), 'o topo e os dias dizem quantos ficaram escondidos: "' + $('board-summary').textContent + '"');
  ok(w.localStorage.getItem('faz_pc_ag_tag') === tg, 'a escolha fica lembrada neste computador');
  // na mão com filtro: os espaços livres continuam respeitando os blocos escondidos
  click($('tab-rotinas')); click(d.querySelector(`[data-rt-hand="${nr.id}"]`));
  const overlapAll = (day, st, dur) => weekBlocks().some((b) => b.date === day && st < b.start_min + b.duration && b.start_min < st + dur);
  const gs = gaps();
  ok(gs.length > 0 && gs.every((x) => !overlapAll(x.dataset.gapDay, +x.dataset.gapStart, 45)), 'com filtro, os espaços livres ainda contam os blocos escondidos (nada cai em cima deles)');
  key(d.body, 'Escape'); click($('tab-agenda'));
  $('ag-tag').value = '__none__'; $('ag-tag').dispatchEvent(new w.Event('change', { bubbles: true }));
  ok(shown().sort().join() === weekBlocks().filter((b) => !b.tag_id).map((b) => b.id).sort().join(), '"Sem tag" mostra só os blocos sem tag');
  $('ag-tag').value = ''; $('ag-tag').dispatchEvent(new w.Event('change', { bubbles: true }));
  // ocultar concluídos (conclui dois blocos da semana pelo "celular" antes)
  const toDone = weekBlocks().filter((b) => !b.completed).slice(0, 2);
  toDone.forEach((b) => server.patch('blocos', UID, b.id, { completed: true }));
  await waitFor(() => toDone.every((b) => d.querySelector(`#ag-cols [data-block="${b.id}"] .ag-done.on`)));
  const doneIds = weekBlocks().filter((b) => b.completed).map((b) => b.id);
  click($('ag-hide-done'));
  ok(doneIds.length > 0 && shown().length === allIds.length - doneIds.length && !shown().some((id) => doneIds.includes(id)), `"Ocultar concluídos" esconde os ${doneIds.length} concluídos da semana`);
  ok($('ag-hide-done').getAttribute('aria-pressed') === 'true' && /Mostrar concluídos/.test($('ag-hide-done').textContent) && w.localStorage.getItem('faz_pc_ag_hidedone') === '1', 'o botão vira "Mostrar concluídos" e fica lembrado');
  // visão Dia: escondido vira contorno apagado
  const dayWithDone = weekBlocks().find((b) => b.completed).date;
  S_view: {
    click(d.querySelector('.ag-view[data-view="day"]'));
    while (!$('ag-label').textContent.includes(String(+dayWithDone.slice(8)) + ' de ')) { click($('ag-next')); }
    const dayDone = weekBlocks().filter((b) => b.date === dayWithDone && b.completed).length;
    ok(d.querySelectorAll('#ag-timeline .ag-hidden').length === dayDone && d.querySelectorAll('#ag-timeline [data-block]').length === weekBlocks().filter((b) => b.date === dayWithDone && !b.completed).length,
      'na visão Dia o concluído vira um contorno apagado no lugar dele (o horário continua ocupado)');
    click($('ag-hide-done'));
    ok(d.querySelectorAll('#ag-timeline .ag-hidden').length === 0 && !$('ag-hide-done').classList.contains('ag-filter-on'), '"Mostrar concluídos" traz tudo de volta');
    click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today'));
  }
  // tag do filtro apagada em outro aparelho → volta pra "Todas"
  $('ag-tag').value = tg; $('ag-tag').dispatchEvent(new w.Event('change', { bubbles: true }));
  server.patch('tags', UID, tg, { deleted: true });
  await waitFor(() => $('ag-tag').value === '');
  ok($('ag-tag').value === '' && shown().length === weekBlocks().length, 'se a tag do filtro for apagada, o filtro volta pra "Todas as tags"');

  console.log('\nX) Sair limpa tudo:');
  click($('tab-notas')); click(items()[0]); await sleep(20);
  w.localStorage.removeItem('faz_pc_tab');
  click($('btn-logout')); await confirmDialog(); await waitFor(() => visible('view-login'));
  ok(visible('view-login') && !visible('modal-rt') && !visible('nt-form'), 'sair (confirmando) volta pro login e fecha o editor de nota');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
