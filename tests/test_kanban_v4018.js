// V40.18.0 — tela do PC (kanban.html): janela de Tags (criar, renomear, trocar cor, apagar), "Gerenciar tags" de dentro
// do cartão e da rotina, tags padrão pra quem começa pelo computador, e zoom das Listas e da Semana.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4018.js <repo> <backup.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const UID = '11111111-2222-3333-4444-555555555555', UID2 = '99999999-8888-7777-6666-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 4000, step = 30) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

// nuvem = resultado do 1º sync do celular
const server = makeServer();
server.addUser('pessoa@teste.com', 'senha123', UID);
const J = (k) => JSON.parse(backup.data[k]);
const local = { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db'), rotinas: J('tb_routines_db'), notas: J('tb_notes_db'), financas: J('tb_financial_db') };
const p = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };
// uma despesa com a Tag 4, pra conferir que apagar a tag limpa também as finanças
server.insert('financas', UID, { id: 'fin_tag4', title: 'Despesa com tag', amount: 50, start_month: '2026-11', duration_months: 1, due_day: 10, tag_id: local.tags[3].id, created_ms: 1 });

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
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const visible = (id) => !$(id).classList.contains('hidden');
  const T = (id, uid) => server.get('tags', uid || UID, id);
  const lastLog = (op, t) => server.log.filter((x) => x.op === op && (!t || x.t === t)).pop();
  const confirmDialog = async () => { await waitFor(() => visible('dialog')); click($('dlg-ok')); await sleep(20); };
  const rows = () => [...d.querySelectorAll('#tg-list [data-tg]')];
  const row = (id) => d.querySelector(`#tg-list [data-tg="${id}"]`);
  const nameOf = (id) => row(id).querySelector('[data-tg-name]');
  const toast = () => $('toast').textContent;
  const KINDS4 = ['tarefas', 'blocos', 'rotinas', 'financas'];
  const usesOf = (id) => KINDS4.map((k) => server.rows(k, UID).filter((r) => !r.deleted && r.tag_id === id).length);
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  const [t1, t2, t3, t4, t5, t6] = local.tags.map((t) => t.id);

  console.log('T) Janela de Tags:');
  ok(!!$('btn-tags') && $('btn-tags').getAttribute('aria-label') === 'Tags', 'o topo tem o botão de Tags');
  click($('btn-tags'));
  ok(visible('modal-tags') && rows().map((r) => r.dataset.tg).join() === local.tags.map((t) => t.id).join() && rows().map((r) => r.querySelector('[data-tg-name]').value).join() === local.tags.map((t) => t.name).join(), 'abre com as 6 tags do celular, na mesma ordem, cada nome num campo');
  ok($('tg-count').textContent === '6 tags' && d.activeElement === $('tg-new-name'), '"6 tags" no título e o cursor já no nome da tag nova');
  const u4 = usesOf(t4), n4 = u4.reduce((a, n) => a + n, 0), span4 = row(t4).querySelector('span');
  ok(span4.textContent === n4 + ' usos' && span4.title === `${u4[0]} tarefas, ${u4[1]} blocos da agenda, ${u4[2]} rotinas e 1 despesa`, `cada tag diz quanto é usada: "${span4.textContent}" (${span4.title})`);
  // criar
  typeIn($('tg-new-name'), 'Clientes');
  click(d.querySelector('#tg-new-colors [data-tg-new-color="#14b8a6"]'));
  ok(d.querySelector('#tg-new-colors .on').dataset.tgNewColor === '#14b8a6' && d.querySelector('#tg-new-colors [aria-checked="true"]').dataset.tgNewColor === '#14b8a6', 'escolher a cor da tag nova marca a bolinha');
  const maxPos0 = Math.max(...server.rows('tags', UID).map((t) => t.position));
  click($('tg-new-add'));
  await waitFor(() => server.alive('tags', UID).some((t) => t.name === 'Clientes'));
  const cli = server.alive('tags', UID).find((t) => t.name === 'Clientes');
  ok(cli && /^tag_\d+$/.test(cli.id) && cli.color === '#14b8a6' && cli.position > maxPos0 && cli.deleted === false, 'Criar grava na nuvem no formato do app (id tag_<hora>, cor escolhida, no fim da lista)');
  ok(rows().slice(-1)[0].dataset.tg === cli.id && nameOf(cli.id).value === 'Clientes' && $('tg-new-name').value === '' && toast() === 'Tag "Clientes" criada' && $('tg-count').textContent === '7 tags', 'aparece no fim da janela, o campo limpa e avisa');
  const nTags = server.rows('tags', UID).length;
  typeIn($('tg-new-name'), '  clientes '); key($('tg-new-name'), 'Enter'); await sleep(30);
  ok(server.rows('tags', UID).length === nTags && /^Já existe uma tag "clientes"/.test(toast()), 'nome repetido (maiúscula/minúscula não importa) não cria: "' + toast() + '"');
  typeIn($('tg-new-name'), '   '); click($('tg-new-add')); await sleep(30);
  ok(server.rows('tags', UID).length === nTags && toast() === 'Dê um nome pra tag.', 'sem nome não cria');
  // renomear
  let inp = nameOf(t2);
  inp.focus(); typeIn(inp, 'Financeiro'); key(inp, 'Enter');
  await waitFor(() => T(t2).name === 'Financeiro');
  ok(T(t2).name === 'Financeiro' && lastLog('update', 'tags').fields.join() === 'name' && toast() === 'Tag renomeada' && d.activeElement !== inp, 'renomear: digita e Enter grava só o nome na nuvem');
  ok([...d.querySelectorAll('#columns .card')].some((c) => c.textContent.includes('Financeiro')) && ![...d.querySelectorAll('#columns .card')].some((c) => c.textContent.includes('Tag 2')), 'os cartões das Listas já mostram o nome novo');
  inp = nameOf(t2); inp.focus(); typeIn(inp, '   '); inp.blur(); await sleep(30);
  ok(T(t2).name === 'Financeiro' && nameOf(t2).value === 'Financeiro' && toast() === 'A tag precisa de um nome.', 'apagar o nome todo não grava: volta o nome de antes');
  inp = nameOf(t2); inp.focus(); typeIn(inp, 'tag 3'); inp.blur(); await sleep(30);
  ok(T(t2).name === 'Financeiro' && nameOf(t2).value === 'Financeiro' && /^Já existe uma tag "tag 3"/.test(toast()), 'nome de outra tag não grava');
  const nUpd = server.log.filter((x) => x.op === 'update').length;
  inp = nameOf(t2); inp.focus(); typeIn(inp, 'Desisti'); key(inp, 'Escape'); await sleep(30);
  ok(visible('modal-tags') && nameOf(t2).value === 'Financeiro' && server.log.filter((x) => x.op === 'update').length === nUpd, 'Esc no nome desiste do nome novo (e não fecha a janela)');
  // trocar a cor
  click(row(t3).querySelector('[data-tg-pick]'));
  ok(row(t3).querySelectorAll('[data-tg-set]').length === 8 && row(t3).querySelector('[data-tg-pick]').getAttribute('aria-expanded') === 'true' && row(t3).querySelector('[data-tg-set].on').dataset.color === '#10b981', 'clicar na bolinha abre as 8 cores do app, com a atual marcada');
  click(row(t3).querySelector('[data-tg-set][data-color="#8b5cf6"]'));
  await waitFor(() => T(t3).color === '#8b5cf6');
  ok(T(t3).color === '#8b5cf6' && lastLog('update', 'tags').fields.join() === 'color' && !row(t3).querySelector('[data-tg-set]') && /#8b5cf6/.test(row(t3).querySelector('[data-tg-pick]').getAttribute('style')), 'escolher a cor grava só a cor e fecha a paleta');
  click(row(t5).querySelector('[data-tg-pick]')); click(row(t5).querySelector('[data-tg-pick]'));
  ok(!row(t5).querySelector('[data-tg-set]'), 'clicar de novo na bolinha fecha a paleta');
  // celular mexendo enquanto alguém digita
  inp = nameOf(t5); inp.focus(); typeIn(inp, 'Texto pela metade'); inp.setSelectionRange(5, 5);
  server.patch('tags', UID, t6, { name: 'Mudou no celular' });
  server.patch('tags', UID, t5, { color: '#f97316' }); // a própria linha que está sendo editada muda
  await waitFor(() => nameOf(t6).value === 'Mudou no celular' && /#f97316/.test(row(t5).querySelector('[data-tg-pick]').getAttribute('style')));
  ok(nameOf(t6).value === 'Mudou no celular' && nameOf(t5).value === 'Texto pela metade' && d.activeElement === nameOf(t5) && nameOf(t5).selectionStart === 5, 'mudança do celular chega na janela sem apagar o que está sendo digitado (nem tirar o cursor do lugar)');
  ok(T(t5).name === 'Tag 5', '...e nada foi gravado no meio da digitação');
  key(nameOf(t5), 'Escape'); await sleep(20);
  // apagar
  click(row(t4).querySelector('[data-tg-del]'));
  await waitFor(() => visible('dialog'));
  ok($('dlg-title').textContent === 'Apagar a tag "Tag 4"?' && $('dlg-text').textContent === `Fica sem tag: ${u4[0]} tarefas, ${u4[1]} blocos da agenda, ${u4[2]} rotinas e 1 despesa. Vale aqui e no celular.`, 'apagar pergunta antes e diz o que fica sem tag: "' + $('dlg-text').textContent + '"');
  click($('dlg-cancel')); await sleep(30);
  ok(!T(t4).deleted && !!row(t4) && visible('modal-tags'), 'Cancelar não apaga');
  click(row(t4).querySelector('[data-tg-del]')); await confirmDialog();
  await waitFor(() => T(t4).deleted === true && KINDS4.every((k) => !server.rows(k, UID).some((r) => r.tag_id === t4)));
  ok(T(t4).deleted === true && KINDS4.every((k) => !server.rows(k, UID).some((r) => r.tag_id === t4)), 'confirmou: a tag vira tombstone e tarefas, blocos, rotinas e despesas com ela ficam sem tag (inclusive arquivados)');
  const upd = server.log.filter((x) => x.op === 'update' && x.fields.join() === 'tag_id').map((x) => x.t).join();
  ok(upd === 'tarefas,blocos,rotinas,financas', 'uma gravação por tipo, só o campo tag_id: ' + upd);
  ok(!row(t4) && $('tg-count').textContent === '6 tags' && toast() === 'Tag apagada' && ![...d.querySelectorAll('#columns .card')].some((c) => c.textContent.includes('Tag 4')), 'some da janela e dos cartões');
  key(d.body, 'Escape');
  ok(!visible('modal-tags') && d.activeElement === $('btn-tags'), 'Esc fecha a janela e o foco volta pro botão de Tags');

  console.log('\nU) Tags de dentro do cartão e da rotina:');
  const firstCard = d.querySelector('#columns .card'), taskId = firstCard.dataset.id;
  click(firstCard);
  const mg = () => $('f-tags').querySelector('[data-manage-tags]');
  ok(visible('modal-task') && !!mg() && mg().textContent === 'Gerenciar tags', 'o cartão tem "Gerenciar tags" junto das tags');
  click(mg());
  ok(visible('modal-tags') && visible('modal-task'), 'abre a janela de Tags por cima do cartão (o cartão continua aberto)');
  typeIn($('tg-new-name'), 'Urgente'); key($('tg-new-name'), 'Enter');
  await waitFor(() => server.alive('tags', UID).some((t) => t.name === 'Urgente'));
  const urg = server.alive('tags', UID).find((t) => t.name === 'Urgente').id;
  ok(!!$('f-tags').querySelector(`[data-tag="${urg}"]`), 'a tag criada já aparece nas opções do cartão');
  key(d.body, 'Escape');
  ok(!visible('modal-tags') && visible('modal-task') && d.activeElement === mg(), 'Esc fecha só a janela de Tags e volta pro cartão');
  click($('f-tags').querySelector(`[data-tag="${urg}"]`)); click($('f-save'));
  await waitFor(() => server.get('tarefas', UID, taskId).tag_id === urg);
  ok(server.get('tarefas', UID, taskId).tag_id === urg, 'escolher a tag nova e salvar grava no cartão');
  click(d.querySelector(`#columns .card[data-id="${taskId}"]`));
  click(mg()); click(row(urg).querySelector('[data-tg-del]')); await confirmDialog();
  await waitFor(() => T(urg).deleted === true);
  ok($('f-tags').querySelector('[data-tag=""]').classList.contains('chip-on') && !$('f-tags').querySelector(`[data-tag="${urg}"]`), 'apagar a tag que o cartão aberto usava: o cartão passa pra "Sem tag"');
  key(d.body, 'Escape'); click($('f-save')); await sleep(40);
  ok(server.get('tarefas', UID, taskId).tag_id === null && !visible('modal-task'), 'e salvar deixa o cartão sem tag');
  click($('tab-rotinas'));
  click(d.querySelector('#rt-grid [data-rt]'));
  const rmg = $('rt-f-tags').querySelector('[data-manage-tags]');
  ok(visible('modal-rt') && !!rmg, 'a rotina também tem "Gerenciar tags"');
  click(rmg); key(d.body, 'Escape');
  ok(!visible('modal-tags') && visible('modal-rt'), 'abre e fecha por cima da rotina');
  key(d.body, 'Escape');
  ok(!visible('modal-rt'), 'Esc de novo fecha a rotina');
  click($('tab-listas'));

  console.log('\nW) Sem nenhuma tag (quem só usa o computador):');
  click($('btn-tags'));
  for (const r of rows()) { click(r.querySelector('[data-tg-del]')); await confirmDialog(); await waitFor(() => T(r.dataset.tg).deleted === true && !row(r.dataset.tg)); }
  ok(server.alive('tags', UID).length === 0 && rows().length === 0 && /Você ainda não tem tags/.test($('tg-list').textContent) && !!$('tg-defaults') && $('tg-count').textContent === '', 'apagou todas: a janela explica e oferece as tags padrão');
  key(d.body, 'Escape');
  click(d.querySelector('#columns .card'));
  ok(mg().textContent === 'Criar tag' && $('f-tags').querySelectorAll('[data-tag]').length === 1, 'no cartão o botão vira "Criar tag"');
  click(mg()); click($('tg-defaults'));
  await waitFor(() => server.alive('tags', UID).length === 3);
  const def = ['tag_1', 'tag_2', 'tag_3'].map((id) => T(id));
  ok(def.every((t) => t && !t.deleted) && def.map((t) => t.name + ' ' + t.color).join() === 'Trabalho #ef4444,Pessoal #10b981,Estudo #f59e0b', 'cria Trabalho, Pessoal e Estudo com os mesmos ids e cores que o app cria (tag_1, tag_2, tag_3)');
  ok(rows().length === 3 && !$('tg-defaults') && toast() === 'Tags criadas: Trabalho, Pessoal e Estudo' && $('f-tags').querySelectorAll('[data-tag]').length === 4 && mg().textContent === 'Gerenciar tags', 'aparecem na janela e no cartão aberto');
  key(d.body, 'Escape'); key(d.body, 'Escape');
  ok(!visible('modal-tags') && !visible('modal-task'), 'Esc, Esc: fecha as duas janelas');

  console.log('\nZ) Zoom das Listas e da Semana:');
  const zl = () => $('columns').style.zoom || '', za = () => $('ag-cols').style.zoom || '', lbl = () => $('zoom-reset').textContent;
  ok(visible('zoom-ctl') && lbl() === '100%' && zl() === '', 'nas Listas aparece o zoom, em 100%');
  click($('zoom-out'));
  ok(zl() === '0.9' && lbl() === '90%' && w.localStorage.getItem('faz_pc_zoom_listas') === '0.9', '− diminui pra 90% e fica lembrado neste computador');
  for (let i = 0; i < 6; i++) click($('zoom-out'));
  ok(zl() === '0.5' && lbl() === '50%' && $('zoom-out').disabled && !$('zoom-in').disabled, 'vai até 50% (aí o − desliga)');
  click($('zoom-reset'));
  ok(zl() === '' && lbl() === '100%', 'clicar no número volta pra 100%');
  for (let i = 0; i < 4; i++) click($('zoom-in'));
  ok(zl() === '1.5' && lbl() === '150%' && $('zoom-in').disabled, '+ vai até 150% (aí o + desliga)');
  click($('zoom-reset'));
  const wheel = (el, dy, ctrl) => { const e = new w.WheelEvent('wheel', { deltaY: dy, ctrlKey: !!ctrl, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
  ok(!wheel($('board'), 100, false) && zl() === '', 'rodinha sem Ctrl continua só rolando');
  ok(wheel($('board'), 100, true) && zl() === '0.9', 'Ctrl + rodinha pra baixo diminui (e a página não dá zoom)');
  ok(wheel($('board'), -100, true) && zl() === '', 'Ctrl + rodinha pra cima aumenta');
  [15, 15, 15].forEach((dy) => wheel($('board'), dy, true));
  const pinchMid = zl();
  wheel($('board'), 15, true);
  ok(pinchMid === '' && zl() === '0.9', 'pinça do touchpad (passinhos pequenos) também: junta os passinhos antes de mudar');
  click($('zoom-reset'));
  click($('tab-agenda'));
  ok(visible('zoom-ctl') && lbl() === '100%', 'na Semana o zoom é separado (100%)');
  click($('zoom-out')); click($('zoom-out'));
  ok(za() === '0.8' && zl() === '' && w.localStorage.getItem('faz_pc_zoom_agenda') === '0.8', 'diminuir na Semana não mexe nas Listas');
  ok(wheel($('ag-week'), 100, true) && za() === '0.7', 'Ctrl + rodinha também na Semana');
  click(d.querySelector('.ag-view[data-view="day"]'));
  ok(!visible('zoom-ctl') && !wheel($('ag-day'), 100, true), 'na visão Dia não tem zoom (a régua das horas usa o tamanho real)');
  click(d.querySelector('.ag-view[data-view="week"]'));
  ok(visible('zoom-ctl') && lbl() === '70%', 'voltando pra Semana, continua em 70%');
  click($('tab-rotinas')); const zr = visible('zoom-ctl');
  click($('tab-notas')); const zn = visible('zoom-ctl');
  ok(!zr && !zn, 'Rotinas e Notas não têm zoom');
  click($('tab-listas'));
  ok(visible('zoom-ctl') && lbl() === '100%', 'de volta nas Listas: 100%, como estava');

  console.log('\nS) Sócio que só usa o computador: começar do zero:');
  click($('btn-logout')); await confirmDialog(); await waitFor(() => visible('view-login'));
  w.localStorage.setItem('faz_pc_zoom_listas', '0.7'); w.localStorage.setItem('faz_pc_zoom_agenda', '0.33'); w.localStorage.setItem('faz_pc_tab', 'listas');
  server.addUser('socio@teste.com', 'senha456', UID2);
  $('login-email').value = 'socio@teste.com'; $('login-pass').value = 'senha456';
  $('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => visible('view-board') && visible('board-empty'));
  ok(visible('board-empty') && d.querySelectorAll('section.col').length === 0, 'conta nova: quadro vazio com o convite');
  ok(zl() === '0.7' && lbl() === '70%', 'o zoom lembrado neste computador volta ao entrar (70%)');
  click($('btn-start-empty'));
  await waitFor(() => server.alive('tags', UID2).length === 3);
  const tg2 = server.alive('tags', UID2).sort((a, b) => a.position - b.position);
  ok(server.alive('listas', UID2).length === 1 && server.alive('listas', UID2)[0].id === 'col_geral' && tg2.map((t) => t.id + ' ' + t.name + ' ' + t.color).join() === 'tag_1 Trabalho #ef4444,tag_2 Pessoal #10b981,tag_3 Estudo #f59e0b', '"Começar do zero" cria a lista Geral e as 3 tags que o app cria (mesmos ids: nada duplica quando ele instalar o celular)');
  await waitFor(() => /^Pronto/.test(toast()));
  ok(toast() === 'Pronto: lista Geral e as tags Trabalho, Pessoal e Estudo' && d.querySelectorAll('section.col').length === 1, 'avisa: "' + toast() + '"');
  click($('tab-agenda'));
  ok(lbl() === '100%' && za() === '', 'zoom guardado com valor estranho (0.33) vira 100%');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
