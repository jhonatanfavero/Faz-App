// Integração da tela do PC (kanban.html) com os dados de teste (como ficam na nuvem depois do 1º sync do celular).
// Uso: TZ='America/Sao_Paulo' node test_kanban.js <repo> <backup.json>
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

// nuvem = resultado do 1º sync do teu celular
const server = makeServer();
const user = server.addUser('pessoa@teste.com', 'senha123', UID);
user.meta.faz_theme = '#10b981';
const local = { tarefas: JSON.parse(backup.data.tb_backlog_db), listas: JSON.parse(backup.data.tb_backlog_columns), tags: JSON.parse(backup.data.tb_tags_db), blocos: JSON.parse(backup.data.tb_master_db) };
const p = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_theme: '#10b981' } } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  // console.error com '[Faz kanban]' é o registro proposital das falhas simuladas (cenário I); o resto conta como erro.
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(REPO, 'faz-config.js'), 'utf8');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script><script>' + cfg + '</script>');
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      // relógio fixo: segunda 16/11/2026, 07:20 (hora local)
      const RD = w.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime();
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const cols = () => [...d.querySelectorAll('section.col')];
  const colByName = (n) => cols().find((s) => s.querySelector('h2').textContent === n);
  const cardsIn = (n) => [...colByName(n).querySelectorAll('.card')];
  const lastLog = (op, t) => server.log.filter((x) => x.op === op && (!t || x.t === t)).pop();
  const C = Object.fromEntries(local.listas.map((c) => [c.name, c.id]));

  await waitFor(() => cols().length === 5);

  console.log('A) Abre direto no quadro (já logado), com os teus dados:');
  ok(!$('view-board').classList.contains('hidden') && $('view-login').classList.contains('hidden'), 'mostra o quadro, não o login');
  ok($('board-summary').textContent === '51 tarefas em 5 listas', 'cabeçalho: "' + $('board-summary').textContent + '"');
  ok(cols().map((s) => s.querySelector('h2').textContent).join(',') === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'listas na mesma ordem do celular: ' + cols().map((s) => s.querySelector('h2').textContent).join(', '));
  const counts = cols().map((s) => s.querySelectorAll('.card').length).join(',');
  ok(counts === '27,8,6,10,0', 'tarefas por lista: ' + counts + ' (as 19 sem columnId estão em ALFA)');
  const projMins = local.tarefas.filter((t) => !t.columnId || t.columnId === 'col_geral').reduce((a, t) => a + t.duration, 0);
  const fmt = (m) => { const h = Math.floor(m / 60), r = m % 60; return h > 0 && r > 0 ? `${h}h ${r}m` : h > 0 ? `${h}h` : `${r}m`; };
  ok(colByName('ALFA').querySelector('header p').textContent.trim() === fmt(projMins) + ' planejados', 'total de tempo da lista ALFA: "' + colByName('ALFA').querySelector('header p').textContent.trim() + '"');
  ok(colByName('OMEGA').querySelector('header p').textContent.trim() === 'Vazia', 'lista vazia mostra "Vazia"');
  const tagged = local.tarefas.find((t) => t.tagId && t.microblocks.length);
  const tag = local.tags.find((t) => t.id === tagged.tagId);
  const card = d.querySelector(`.card[data-id="${tagged.id}"]`);
  const toRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  ok(card.style.borderLeftColor === toRgb(tag.color), 'card com borda esquerda na cor da tag (' + tag.name + ' ' + tag.color + ')');
  const done = tagged.microblocks.filter((m) => m.done).length;
  ok(card.textContent.includes(tag.name) && card.textContent.includes(`${done}/${tagged.microblocks.length}`), `card mostra tag e checklist ${done}/${tagged.microblocks.length}`);
  ok(w.getComputedStyle(d.documentElement).getPropertyValue('--focus').trim() === '#10b981', 'tela abriu com a TUA cor (#10b981)');
  await waitFor(() => $('sync-label').textContent === 'Ao vivo');
  ok($('sync-label').textContent === 'Ao vivo', 'indicador "Ao vivo" ligado');

  console.log('\nB) Adicionar tarefa direto na lista:');
  click(colByName('OMEGA').querySelector('.add-btn'));
  const ta = colByName('OMEGA').querySelector('.composer-input');
  ok(!!ta, 'abriu o campo de nova tarefa');
  typeIn(ta, 'Ligar pro cartório');
  key(ta, 'Enter');
  await waitFor(() => cardsIn('OMEGA').length === 1 && lastLog('upsert', 'tarefas'));
  const ins = [...server.tables.tarefas.values()].find((r) => r.title === 'Ligar pro cartório');
  ok(ins && ins.column_id === C.OMEGA && ins.duration === 30 && /^bl_\d+$/.test(ins.id) && !ins.deleted, 'gravou na nuvem: lista OMEGA, 30m, id no formato do app (' + (ins && ins.id) + ')');
  ok(cardsIn('OMEGA')[0].textContent.includes('Ligar pro cartório'), 'card apareceu na coluna');
  const ta2 = colByName('OMEGA').querySelector('.composer-input');
  ok(ta2 && ta2.value === '', 'campo continua aberto e limpo pra próxima');
  key(ta2, 'Escape');
  ok(!colByName('OMEGA').querySelector('.composer-input'), 'Esc fecha o campo');

  console.log('\nC) Editar tarefa (grava só o que mudou):');
  click(d.querySelector(`.card[data-id="${tagged.id}"]`)); // busca de novo: o quadro foi redesenhado no passo B
  ok(!$('modal-task').classList.contains('hidden'), 'abriu a janela da tarefa');
  ok($('f-title').value === tagged.title && $('f-col').value === (tagged.columnId || 'col_geral') && $('f-dur').value === String(tagged.duration), 'veio preenchida (nome, lista, duração)');
  ok($('f-mbs').querySelectorAll('input[type=checkbox]').length === tagged.microblocks.length, 'checklist com ' + tagged.microblocks.length + ' itens');
  $('f-title').value = 'Título novo pelo PC';
  const otherTag = local.tags.find((t) => t.id !== tagged.tagId);
  click($('f-tags').querySelector(`button[data-tag="${otherTag.id}"]`));
  const cb = $('f-mbs').querySelector('input[type=checkbox]');
  cb.checked = !cb.checked; cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  click($('f-save'));
  await waitFor(() => lastLog('update', 'tarefas'));
  const up = lastLog('update', 'tarefas');
  ok(up && up.fields.sort().join(',') === 'microblocks,tag_id,title', 'update mandou SÓ: ' + (up && up.fields.join(', ')) + ' (não pisa em lista/duração/posição)');
  const row = server.get('tarefas', UID, tagged.id);
  ok(row.title === 'Título novo pelo PC' && row.tag_id === otherTag.id && row.microblocks[0].done === !tagged.microblocks[0].done, 'nuvem atualizada');
  ok($('modal-task').classList.contains('hidden'), 'janela fechou');

  console.log('\nD) Arrastar card de uma lista pra outra:');
  const src = cardsIn('GAMA')[0], movedId = src.dataset.id;
  const dt = { setData() {}, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientY', { value: 10 }); el.dispatchEvent(e); };
  dragEv('dragstart', src);
  await sleep(30);
  dragEv('dragover', colByName('DELTA').querySelector('.col-list'));
  ok(!!colByName('DELTA').querySelector('.drop-line'), 'mostra a linha de onde vai cair');
  dragEv('drop', colByName('DELTA').querySelector('.col-list'));
  await waitFor(() => server.get('tarefas', UID, movedId).column_id === C.DELTA);
  const mv = server.get('tarefas', UID, movedId);
  ok(mv.column_id === C.DELTA, 'nuvem: tarefa foi pra DELTA');
  ok(cardsIn('DELTA').some((c) => c.dataset.id === movedId) && !cardsIn('GAMA').some((c) => c.dataset.id === movedId), 'tela: card saiu de GAMA e entrou em DELTA');
  const upd = lastLog('update', 'tarefas');
  ok(upd.fields.sort().join(',') === 'column_id,position', 'gravou só lista + posição');

  console.log('\nE) Mudança feita no celular aparece sozinha (tempo real):');
  const rtId = cardsIn('BETA')[0].dataset.id;
  server.patch('tarefas', UID, rtId, { title: 'Mudou no celular agora' });
  const rt = await waitFor(() => d.querySelector(`.card[data-id="${rtId}"]`).textContent.includes('Mudou no celular agora'), 1500);
  ok(rt, 'card atualizou sem recarregar a página');
  server.patch('tarefas', UID, rtId, { deleted: true });
  ok(await waitFor(() => !d.querySelector(`.card[data-id="${rtId}"]`), 1500), 'tarefa apagada no celular sumiu do quadro');

  console.log('\nF) Listas: renomear, padrão protegida, apagar com tarefas:');
  click(colByName('BETA').querySelector('.col-menu-btn'));
  const menu = d.querySelector('div.fixed.z-40');
  ok(!!menu && menu.textContent.includes('Apagar lista'), 'menu da lista com Renomear e Apagar');
  click(menu.querySelector('button[data-act="rename"]'));
  await sleep(20);
  ok(!$('dialog').classList.contains('hidden') && $('dlg-input').value === 'BETA', 'pergunta o nome novo (já preenchido)');
  $('dlg-input').value = 'BETA NOVA';
  click($('dlg-ok'));
  await waitFor(() => server.get('listas', UID, C.BETA).name === 'BETA NOVA');
  ok(server.get('listas', UID, C.BETA).name === 'BETA NOVA' && !!colByName('BETA NOVA'), 'renomeada na nuvem e na tela');
  click(colByName('ALFA').querySelector('.col-menu-btn'));
  const menuDef = d.querySelector('div.fixed.z-40');
  ok(menuDef && menuDef.textContent.includes('A lista padrão não pode ser apagada.') && !menuDef.querySelector('[data-act="delete"]'), 'lista padrão (ALFA) não tem "Apagar"');
  d.body.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true }));
  const deltaIds = cardsIn('DELTA').map((c) => c.dataset.id);
  click(colByName('DELTA').querySelector('.col-menu-btn'));
  const menuG = d.querySelector('div.fixed.z-40');
  click(menuG.querySelector('button[data-act="delete"]'));
  await sleep(20);
  ok($('dlg-title').textContent === 'Apagar a lista DELTA?' && $('dlg-text').textContent.includes('As ' + deltaIds.length + ' tarefas dela também serão apagadas'), 'confirmação clara: "' + $('dlg-text').textContent + '"');
  click($('dlg-ok'));
  await waitFor(() => server.get('listas', UID, C.DELTA).deleted === true);
  ok(server.get('listas', UID, C.DELTA).deleted && deltaIds.every((id) => server.get('tarefas', UID, id).deleted), 'lista e as ' + deltaIds.length + ' tarefas viraram tombstone (o celular vai apagar também)');
  ok(!colByName('DELTA') && cols().length === 4, 'coluna sumiu da tela');

  console.log('\nG) Apagar tarefa pela janela:');
  const delCard = cardsIn('ALFA')[0], delId = delCard.dataset.id;
  click(delCard);
  click($('f-delete'));
  await sleep(20);
  ok($('dlg-title').textContent === 'Apagar esta tarefa?', 'pede confirmação');
  click($('dlg-ok'));
  await waitFor(() => server.get('tarefas', UID, delId).deleted === true);
  ok(server.get('tarefas', UID, delId).deleted === true && !d.querySelector(`.card[data-id="${delId}"]`), 'apagada (tombstone) e some da tela');

  console.log('\nH) Segurança: título malicioso vira texto, não código:');
  server.insert('tarefas', UID, { id: 'bl_3000000000000', column_id: 'col_geral', title: '<img src=x onerror="window.__xss=1">', position: 9e12 });
  await waitFor(() => d.querySelector('.card[data-id="bl_3000000000000"]'));
  const xc = d.querySelector('.card[data-id="bl_3000000000000"]');
  ok(xc && !xc.querySelector('img') && xc.textContent.includes('<img') && !w.__xss, 'renderizou como texto puro');

  console.log('\nI) Falha de rede ao salvar: desfaz na tela e avisa:');
  const fCard = cardsIn('ALFA')[1], fId = fCard.dataset.id, fTitle = server.get('tarefas', UID, fId).title;
  click(fCard);
  $('f-title').value = 'não vai salvar';
  server.failNext = 1;
  click($('f-save'));
  await sleep(150);
  ok(server.get('tarefas', UID, fId).title === fTitle && d.querySelector(`.card[data-id="${fId}"]`).textContent.includes(fTitle), 'tela voltou ao título original');
  ok(/Não foi possível salvar/.test($('toast').textContent), 'aviso: "' + $('toast').textContent + '"');


  console.log('\nL) Aba Agenda — Semana:');
  const BLK = JSON.parse(backup.data.tb_master_db), cnt = (day) => BLK.filter((b) => b.date === day).length;
  const agCols = () => [...d.querySelectorAll('#ag-cols section')];
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  click($('tab-agenda'));
  ok(!$('agenda').classList.contains('hidden') && $('board').classList.contains('hidden') && $('tab-agenda').classList.contains('on'), 'aba Agenda abriu no lugar das Listas');
  ok(agCols().length === 7 && $('ag-label').textContent === '16 a 22 de nov', '7 dias a partir de hoje: "' + $('ag-label').textContent + '"');
  ok(agCols()[0].querySelectorAll('[data-block]').length === cnt('2026-11-16') && agCols()[1].querySelectorAll('[data-block]').length === cnt('2026-11-17'), `seg 16/11: ${cnt('2026-11-16')} blocos · ter 17/11: ${cnt('2026-11-17')} blocos`);
  ok(agCols()[0].textContent.includes('Hoje') && agCols()[3].textContent.includes('Livre'), 'coluna de hoje marcada; dia vazio mostra "Livre"');
  const times = [...agCols()[0].querySelectorAll('[data-block]')].map((e) => e.querySelector('p').textContent.slice(0, 5));
  ok(JSON.stringify(times) === JSON.stringify([...times].sort()), `blocos em ordem de horário (${times[0]} … ${times[times.length - 1]})`);
  ok(d.querySelectorAll('#ag-cols .ag-now').length === 1, 'bloco do horário atual (07:20) destacado: ' + (d.querySelector('#ag-cols .ag-now p') || {}).textContent);
  ok($('board-summary').textContent.startsWith((cnt('2026-11-16') + cnt('2026-11-17')) + ' blocos em 7 dias'), 'resumo: "' + $('board-summary').textContent + '"');
  click($('ag-next'));
  ok($('ag-label').textContent === '23 a 29 de nov', 'próxima semana: "' + $('ag-label').textContent + '"');
  click($('ag-prev')); click($('ag-prev'));
  ok($('ag-label').textContent === '9 a 15 de nov', 'semana anterior: "' + $('ag-label').textContent + '"');
  click($('ag-today'));
  const mvId = agCols()[0].querySelector('[data-block]').dataset.block;
  server.patch('blocos', UID, mvId, { date: '2026-11-18' });
  ok(await waitFor(() => agCols()[2].querySelector(`[data-block="${mvId}"]`), 1500), 'bloco mudou de dia no celular → mudou de coluna aqui, ao vivo');
  server.patch('blocos', UID, mvId, { archived: true });
  ok(await waitFor(() => !d.querySelector(`#ag-cols [data-block="${mvId}"]`), 1500), 'bloco arquivado some da agenda');

  console.log('\nM) Aba Agenda — Dia:');
  click(agCols()[0].querySelector('.ag-day-btn'));
  ok(!$('ag-day').classList.contains('hidden') && $('ag-week').classList.contains('hidden') && $('ag-label').textContent === 'Segunda, 16 de novembro (hoje)', 'clicar no dia abre a visão Dia: "' + $('ag-label').textContent + '"');
  ok(d.querySelectorAll('#ag-timeline [data-block]').length === cnt('2026-11-16') - 1 && !!d.querySelector('#ag-timeline .now-line'), `linha do tempo com ${cnt('2026-11-16') - 1} blocos e a linha do "agora"`);
  const blk = d.querySelector('#ag-timeline [data-block]'), bdata = server.get('blocos', UID, blk.dataset.block);
  ok(Math.abs(parseFloat(blk.style.height) - Math.max(bdata.duration * 3.2 - 2, 14)) < 0.01, `altura proporcional à duração (${bdata.duration} min → ${blk.style.height})`);
  ok(d.querySelector('#ag-timeline span').textContent === '07:00', 'começa na janela do dia configurada no celular (07:00)');
  click(blk);
  ok(!$('modal-task').classList.contains('hidden') && $('f-title').value === bdata.title && $('f-date').value === '2026-11-16' && $('f-start').value === hhmm(bdata.start_min), 'clicar no bloco abre o cartão completo: ' + $('f-date').value + ' ' + $('f-start').value);
  click($('f-cancel'));
  ok($('modal-task').classList.contains('hidden'), 'cartão fecha');
  click($('ag-next'));
  ok($('ag-label').textContent === 'Terça, 17 de novembro', 'na visão Dia a seta anda 1 dia: "' + $('ag-label').textContent + '"');
  ok(!server.log.some((x) => x.t === 'blocos' && x.op !== 'select'), 'agenda no PC é só leitura: nenhuma gravação em blocos');
  click($('tab-listas'));
  ok(!$('board').classList.contains('hidden') && /tarefas em \d+ listas/.test($('board-summary').textContent), 'volta pras Listas: "' + $('board-summary').textContent + '"');

  console.log('\nO) V40.9.0 — cor, arquivar e arrastar entre dias (PC):');
  const oc = cardsIn('ALFA')[2], oid = oc.dataset.id; click(oc);
  ok($('f-colors').querySelectorAll('button[data-color]').length === 13 && !!$('f-color-custom'), 'janela da tarefa mostra "Sem cor", 12 cores e outra cor');
  click($('f-colors').querySelector('button[data-color="#ec4899"]')); click($('f-save'));
  await waitFor(() => server.get('tarefas', UID, oid).color === '#ec4899');
  ok(server.get('tarefas', UID, oid).color === '#ec4899' && lastLog('update', 'tarefas').fields.join() === 'color', 'cor gravada (só o campo color)');
  const pc = d.querySelector(`.card[data-id="${oid}"]`);
  ok(pc.classList.contains('painted') && pc.classList.contains('dark') && pc.style.backgroundColor === 'rgb(236, 72, 153)', 'cartão inteiro pintado no quadro');
  click(pc); click($('f-archive'));
  await waitFor(() => server.get('tarefas', UID, oid).archived === true);
  ok(!d.querySelector(`.card[data-id="${oid}"]`) && server.get('tarefas', UID, oid).deleted === false, 'Arquivar: some do quadro e não é apagada');
  click($('btn-archive'));
  ok(!$('modal-archive').classList.contains('hidden') && !!$('ar-list').querySelector(`[data-unarchive="tarefas|${oid}"]`), 'Arquivados mostra o cartão (' + $('ar-count').textContent + ')');
  click($('ar-list').querySelector(`[data-unarchive="tarefas|${oid}"]`));
  await waitFor(() => server.get('tarefas', UID, oid).archived === false);
  ok(!!d.querySelector(`.card[data-id="${oid}"]`), 'Desarquivar: volta pro quadro');
  click($('ar-close'));
  click($('tab-agenda')); click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today'));
  const src2 = agCols()[1].querySelector('[data-block]'), bid = src2.dataset.block, st0 = server.get('blocos', UID, bid).start_min, du0 = server.get('blocos', UID, bid).duration;
  ok(src2.getAttribute('draggable') === 'true', 'cartões da agenda são arrastáveis');
  dragEv('dragstart', src2); await sleep(30); dragEv('dragover', agCols()[3]);
  ok(agCols()[3].classList.contains('ag-over'), 'dia de destino fica destacado');
  dragEv('drop', agCols()[3]);
  await waitFor(() => server.get('blocos', UID, bid).date === '2026-11-19');
  const mvd = server.get('blocos', UID, bid);
  ok(mvd.date === '2026-11-19' && mvd.start_min === st0 && mvd.type === 'focus' && lastLog('update', 'blocos').fields.sort().join() === 'date', 'bloco de terça foi pra quinta 19/11 no mesmo horário (só o dia sobe: horário e tipo não mudaram)');
  ok(!!agCols()[3].querySelector(`[data-block="${bid}"]`) && /Bloco movido para Qui 19\/11/.test($('toast').textContent), 'aviso: "' + $('toast').textContent + '"');
  const oid2 = agCols()[1].querySelector('[data-block]').dataset.block;
  server.patch('blocos', UID, oid2, { start_min: st0, duration: 15 }); await sleep(150);
  dragEv('dragstart', agCols()[1].querySelector(`[data-block="${oid2}"]`)); await sleep(30); dragEv('drop', agCols()[3]);
  await waitFor(() => server.get('blocos', UID, oid2).date === '2026-11-19');
  ok(server.get('blocos', UID, oid2).start_min === st0 + du0, 'horário já ocupado no destino → entra logo depois, sem sobrepor');
  click(agCols()[3].querySelector(`[data-block="${bid}"]`)); click($('f-archive'));
  await waitFor(() => server.get('blocos', UID, bid).archived === true);
  ok(!d.querySelector(`#ag-cols [data-block="${bid}"]`) && !server.get('blocos', UID, bid).deleted, 'Arquivar bloco: some da agenda, não é apagado');
  click($('btn-archive')); click($('ar-list').querySelector(`[data-unarchive="blocos|${bid}"]`));
  await waitFor(() => server.get('blocos', UID, bid).archived === false);
  ok(server.get('blocos', UID, bid).archived === false && server.get('blocos', UID, bid).start_min === st0, 'Desarquivar bloco: volta pro mesmo horário');
  click($('ar-close')); click($('tab-listas'));

  console.log('\nP) V40.11.0 — cartão do bloco aberto, concluir, agendar e voltar pra lista (PC):');
  { // bloco próprio: os nomes daqui não brigam com os das outras seções
  const B = (id) => server.get('blocos', UID, id), T = (id) => server.get('tarefas', UID, id);
  const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const visible = (id) => !$(id).classList.contains('hidden');
  const dayBlocks = (day) => server.alive('blocos', UID).filter((b) => b.date === day && !b.archived).sort((a, b) => a.start_min - b.start_min);
  const overlaps = (day, st, dur, skip) => dayBlocks(day).some((b) => b.id !== skip && st < b.start_min + b.duration && b.start_min < st + dur);
  click($('tab-agenda')); click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); await sleep(80);
  // 1) abrir e editar um bloco (o último de terça, pra duração nova caber sem empurrar ninguém)
  const tue = dayBlocks('2026-11-17'), e1 = tue[tue.length - 1], e1mbs = JSON.parse(JSON.stringify(e1.microblocks || []));
  server.patch('blocos', UID, e1.id, { microblocks: [{ id: 'mb_antigo', title: 'Item que já existia', done: true, extra: 7 }] }); await sleep(150);
  click(agCols()[1].querySelector(`[data-block="${e1.id}"]`));
  ok(visible('modal-task') && $('f-title').value === e1.title && $('f-date').value === '2026-11-17' && $('f-start').value === hhmm(e1.start_min) && $('f-dur').value === String(e1.duration), 'bloco abre no mesmo cartão das Listas, com nome, dia, início e duração');
  ok(!visible('f-col-wrap') && visible('f-date-wrap') && visible('f-start-wrap') && visible('f-done') && !visible('f-schedule') && visible('f-tolist') && $('f-delete').textContent === 'Apagar bloco', 'campos de bloco no lugar dos de tarefa (sem "Lista"; com concluir e "Voltar pra lista")');
  const otherTag = server.alive('tags', UID).find((t) => t.id !== e1.tag_id);
  typeIn($('f-title'), 'Bloco editado no PC'); change($('f-dur'), '30');
  click($('f-tags').querySelector(`button[data-tag="${otherTag.id}"]`));
  click($('f-colors').querySelector('button[data-color="#3b82f6"]'));
  $('f-mb-new').value = 'Item novo do PC'; key($('f-mb-new'), 'Enter');
  server.log.length = 0; click($('f-save'));
  await waitFor(() => B(e1.id).title === 'Bloco editado no PC');
  const e1n = B(e1.id), up1 = lastLog('update', 'blocos');
  ok(e1n.duration === 30 && e1n.tag_id === otherTag.id && e1n.color === '#3b82f6' && e1n.start_min === e1.start_min && e1n.date === '2026-11-17', 'salvar grava nome, duração, tag e cor; dia e horário ficam como estavam');
  ok(e1n.microblocks.length === 2 && JSON.stringify(e1n.microblocks[0]) === JSON.stringify({ id: 'mb_antigo', title: 'Item que já existia', done: true, extra: 7 }) && /^mb_\d+$/.test(e1n.microblocks[1].id) && e1n.microblocks[1].title === 'Item novo do PC' && e1n.microblocks[1].done === false, 'checklist: item antigo intacto (id e marcação), item novo ganha id como no app');
  ok(up1.fields.slice().sort().join() === 'color,duration,microblocks,tag_id,title' && /Bloco salvo/.test($('toast').textContent), 'só os campos alterados vão pra nuvem (' + up1.fields.join(', ') + ')');
  // 2) concluir pelo círculo do cartão, sem abrir
  const c1 = tue[0].id;
  click(agCols()[1].querySelector(`[data-block="${c1}"] [data-done]`));
  await waitFor(() => B(c1).completed === true);
  ok(!visible('modal-task') && /Concluído/.test(agCols()[1].querySelector(`[data-block="${c1}"]`).textContent) && agCols()[1].querySelector(`[data-block="${c1}"] [data-done]`).getAttribute('aria-pressed') === 'true' && lastLog('update', 'blocos').fields.join() === 'completed', 'círculo do cartão conclui na hora, sem abrir o cartão (só o campo "completed" sobe)');
  click(agCols()[1].querySelector(`[data-block="${c1}"] [data-done]`));
  await waitFor(() => B(c1).completed === false);
  ok(B(c1).completed === false && /Bloco reaberto/.test($('toast').textContent), 'clicar de novo reabre o bloco');
  // 3) concluir por dentro do cartão
  click(agCols()[1].querySelector(`[data-block="${c1}"]`)); click($('f-done'));
  await waitFor(() => B(c1).completed === true);
  ok(visible('modal-task') && $('f-done').getAttribute('aria-pressed') === 'true' && $('f-status').textContent === 'Concluído' && $('f-title').classList.contains('line-through'), 'dentro do cartão: concluir vale na hora e o cartão continua aberto');
  server.patch('blocos', UID, c1, { completed: false }); await sleep(200);
  ok($('f-done').getAttribute('aria-pressed') === 'false' && !visible('f-status'), 'se o celular reabrir o bloco, o cartão aberto no PC acompanha');
  click($('f-cancel'));
  // 4) mudar dia e horário pelo cartão
  click(agCols()[1].querySelector(`[data-block="${c1}"]`));
  change($('f-date'), '2026-11-20'); change($('f-start'), '14:30'); click($('f-save'));
  await waitFor(() => B(c1).date === '2026-11-20');
  ok(B(c1).start_min === 870 && B(c1).type === 'focus' && !!agCols()[4].querySelector(`[data-block="${c1}"]`) && /^Bloco salvo$/.test($('toast').textContent), 'dia e horário novos: sexta 20/11 às 14:30');
  const c2 = tue[1].id;
  click(agCols()[1].querySelector(`[data-block="${c2}"]`));
  change($('f-date'), '2026-11-20'); change($('f-start'), '14:30'); click($('f-save'));
  await waitFor(() => B(c2).date === '2026-11-20');
  ok(B(c2).start_min === 870 + B(c1).duration && /ficou às/.test($('toast').textContent), 'horário ocupado → entra logo depois, e o aviso diz onde ficou: "' + $('toast').textContent + '"');
  click(agCols()[4].querySelector(`[data-block="${c2}"]`));
  change($('f-start'), ''); click($('f-save'));
  ok(visible('modal-task') && /Confira o dia e o horário/.test($('toast').textContent), 'horário em branco não salva e o cartão continua aberto');
  change($('f-date'), '2026-08-03'); change($('f-start'), '09:00'); click($('f-save')); // dia antigo e sem blocos nos dados de teste
  await waitFor(() => B(c2).date === '2026-08-03');
  ok(B(c2).type === 'past' && B(c2).start_min === 540, 'mandar pra um dia que já passou marca o bloco como passado (igual ao app)');
  // 5) visão Dia: o círculo também conclui
  click(agCols()[4].querySelector('.ag-day-btn')); await sleep(60);
  click(d.querySelector(`#ag-timeline [data-block="${c1}"] [data-done]`));
  await waitFor(() => B(c1).completed === true);
  ok(!visible('modal-task') && /bg-emerald-50/.test(d.querySelector(`#ag-timeline [data-block="${c1}"]`).className), 'na visão Dia o círculo conclui e o bloco fica verde');
  click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); await sleep(60);
  // 6) voltar pra lista
  const nTar = server.alive('tarefas', UID).length;
  click(agCols()[1].querySelector(`[data-block="${e1.id}"]`)); click($('f-tolist'));
  await waitFor(() => B(e1.id).deleted === true);
  const back = server.alive('tarefas', UID).find((t) => t.title === 'Bloco editado no PC');
  ok(!!back && /^bl_\d+$/.test(back.id) && back.column_id === 'col_geral' && back.duration === 30 && back.tag_id === otherTag.id && back.color === '#3b82f6' && server.alive('tarefas', UID).length === nTar + 1, '"Voltar pra lista": vira tarefa na lista padrão com nome, duração, tag e cor');
  ok(JSON.stringify(back.microblocks) === JSON.stringify([{ title: 'Item que já existia', done: false }, { title: 'Item novo do PC', done: false }]) && !agCols()[1].querySelector(`[data-block="${e1.id}"]`) && /Voltou pra lista ALFA/.test($('toast').textContent), 'checklist vai junto, desmarcada (como no app), e o bloco sai da agenda');
  // 7) apagar bloco
  const del = tue[2] ? tue[2].id : dayBlocks('2026-11-16')[5].id, delDay = B(del).date;
  click(d.querySelector(`#ag-cols [data-block="${del}"]`)); click($('f-delete'));
  ok(/Apagar este bloco\?/.test($('dlg-title').textContent), 'apagar bloco pede confirmação');
  click($('dlg-ok')); await waitFor(() => B(del).deleted === true);
  ok(B(del).deleted === true && !d.querySelector(`#ag-cols [data-block="${del}"]`) && delDay === B(del).date, 'bloco apagado some da agenda');
  // 8) Listas → Agenda
  click($('tab-listas')); await sleep(60);
  ok(!!d.querySelector(`.card[data-id="${back.id}"]`), 'a tarefa que voltou aparece no quadro');
  const s1 = server.alive('tarefas', UID).find((t) => t.id !== back.id && !t.archived && t.tag_id && (t.microblocks || []).length > 0);
  server.patch('tarefas', UID, s1.id, { color: '#ec4899', microblocks: s1.microblocks.map((m, i) => ({ title: m.title, done: i === 0 })) }); await sleep(150);
  const s1row = { ...T(s1.id) }, nBl = server.alive('blocos', UID).length;
  click(d.querySelector(`.card[data-id="${s1.id}"] [data-sched]`));
  const sug = $('f-sched-time').value, sugMin = +sug.slice(0, 2) * 60 + +sug.slice(3);
  ok(visible('modal-task') && visible('f-sched') && $('f-sched-date').value === '2026-11-16' && sugMin >= 440 && !overlaps('2026-11-16', sugMin, s1row.duration), `botão de agendar do cartão abre já sugerindo hoje, no primeiro horário livre a partir de agora (${sug})`);
  ok(/Vai ficar hoje, das /.test($('f-sched-info').textContent) && /A tarefa sai da lista/.test($('f-sched-info').textContent), 'explica o que vai acontecer: "' + $('f-sched-info').textContent + '"');
  change($('f-sched-date'), '2026-11-21');
  ok($('f-sched-time').value === '07:00' && /Sáb 21\/11, das 07:00/.test($('f-sched-info').textContent), 'outro dia: sugere o começo do dia (07:00)');
  change($('f-sched-time'), '10:00'); server.log.length = 0; click($('f-sched-ok'));
  await waitFor(() => T(s1.id).deleted === true);
  const nb1 = server.alive('blocos', UID).find((b) => b.title === s1row.title && b.date === '2026-11-21');
  ok(!!nb1 && /^f_\d+$/.test(nb1.id) && nb1.start_min === 600 && nb1.duration === s1row.duration && nb1.tag_id === s1row.tag_id && nb1.color === '#ec4899' && nb1.type === 'focus' && nb1.theme === 'focus' && nb1.completed === false && Array.isArray(nb1.linked_note_ids) && nb1.linked_note_ids.length === 0, 'Agendar cria o bloco no dia e horário escolhidos, com nome, duração, tag e cor');
  ok(nb1.microblocks.length === s1row.microblocks.length && nb1.microblocks.every((m, i) => /^mb_\d+$/.test(m.id) && m.title === s1row.microblocks[i].title && m.done === false) && new Set(nb1.microblocks.map((m) => m.id)).size === nb1.microblocks.length, 'checklist vai junto: cada item com id próprio e desmarcado (como no app)');
  ok(T(s1.id).deleted === true && !d.querySelector(`.card[data-id="${s1.id}"]`) && server.alive('blocos', UID).length === nBl + 1 && /Agendado para Sáb 21\/11 às 10:00$/.test($('toast').textContent), 'a tarefa sai da lista e o aviso confirma: "' + $('toast').textContent + '"');
  const ops = server.log.filter((l) => l.op !== 'select').map((l) => l.op + ':' + l.t);
  ok(ops.join() === 'upsert:blocos,update:tarefas', 'ordem segura: primeiro cria o bloco, depois tira a tarefa (' + ops.join(' → ') + ')');
  const s2 = server.alive('tarefas', UID).find((t) => t.id !== back.id && !t.archived);
  click(d.querySelector(`.card[data-id="${s2.id}"]`));
  ok(visible('modal-task') && !visible('f-sched') && visible('f-schedule') && visible('f-col-wrap') && !visible('f-date-wrap') && !visible('f-done') && $('f-delete').textContent === 'Apagar tarefa', 'tarefa aberta pelo clique normal: campos de tarefa e botão "Agendar" no rodapé');
  click($('f-schedule'));
  typeIn($('f-title'), 'Nome trocado antes de agendar'); change($('f-sched-date'), '2026-11-21'); change($('f-sched-time'), '10:00');
  ok(/Às 10:00 já tem bloco/.test($('f-sched-info').textContent), 'avisa antes quando o horário já está ocupado: "' + $('f-sched-info').textContent + '"');
  click($('f-sched-ok')); await waitFor(() => T(s2.id).deleted === true);
  const nb2 = server.alive('blocos', UID).find((b) => b.title === 'Nome trocado antes de agendar');
  ok(!!nb2 && nb2.start_min === 600 + nb1.duration && /já tinha bloco/.test($('toast').textContent), 'horário ocupado → entra logo depois; o que foi editado no cartão vai junto');
  const s3 = server.alive('tarefas', UID).find((t) => t.id !== back.id && !t.archived);
  click(d.querySelector(`.card[data-id="${s3.id}"] [data-sched]`)); change($('f-sched-date'), '2026-11-22'); change($('f-sched-time'), '08:00');
  server.failNext = 1; click($('f-sched-ok')); await sleep(250);
  ok(T(s3.id).deleted === false && !!d.querySelector(`.card[data-id="${s3.id}"]`) && !server.alive('blocos', UID).some((b) => b.date === '2026-11-22') && /Não foi possível salvar/.test($('toast').textContent), 'sem internet na hora de agendar: nada muda, a tarefa continua na lista');
  click($('tab-agenda')); click($('ag-today')); await sleep(60);
  ok(!!agCols()[5].querySelector(`[data-block="${nb1.id}"]`) && !!agCols()[5].querySelector(`[data-block="${nb2.id}"]`), 'os dois agendados aparecem no sábado da aba Agenda');
  click($('tab-listas'));
  }

  console.log('\nQ) V40.12.0 — calendário em português, hora em 24h e tarefa "na mão" (PC):');
  {
    const visible = (id) => !$(id).classList.contains('hidden');
    const T = (id) => server.get('tarefas', UID, id);
    const sel = (id, cls) => d.querySelector(`[data-time-for="${id}"] .${cls}`);
    const pickSel = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const lbl = (id) => d.querySelector(`[data-date-for="${id}"] .date-label`).textContent;
    const liveTasks = () => server.alive('tarefas', UID).filter((t) => !t.archived);
    const overlap = (day, st, dur) => server.alive('blocos', UID).some((b) => b.date === day && !b.archived && st < b.start_min + b.duration && b.start_min < st + dur);
    const gaps = () => [...d.querySelectorAll('#ag-cols [data-gap-day]')];
    ok(d.querySelectorAll('input[type="date"], input[type="time"]').length === 0, 'a tela não usa mais o calendário nem o relógio do navegador (que saíam no idioma do Chrome)');
    const q1 = liveTasks()[0];
    click(d.querySelector(`.card[data-id="${q1.id}"] [data-sched]`));
    ok(lbl('f-sched-date') === 'Seg, 16/11/2026 (hoje)' && sel('f-sched-time', 'time-h').options.length === 24 && sel('f-sched-time', 'time-m').options.length >= 12 && sel('f-sched-time', 'time-h').value !== '', 'o dia aparece como "Seg, 16/11/2026 (hoje)" e a hora em dois seletores (00 a 23; de 5 em 5 min)');
    click(d.querySelector('[data-date-for="f-sched-date"]'));
    const pop = $('cal-pop'), grids = () => pop.querySelectorAll('.grid');
    ok(visible('cal-pop') && $('cal-title').textContent === 'Novembro de 2026' && [...grids()[0].children].map((x) => x.textContent).join('') === 'DSTQQSS' && grids()[1].querySelectorAll('[data-cal-day]').length === 30 && /Hoje/.test(pop.textContent) && /Fechar/.test(pop.textContent), 'calendário próprio em português: "Novembro de 2026", D S T Q Q S S, Hoje e Fechar');
    ok(pop.querySelector('[aria-current="date"]').textContent === '16' && grids()[1].querySelectorAll('span').length === 0, 'dia escolhido destacado; novembro de 2026 começa num domingo');
    click(pop.querySelector('[data-cal-nav="1"]'));
    ok($('cal-title').textContent === 'Dezembro de 2026' && grids()[1].querySelectorAll('span').length === 2 && grids()[1].querySelectorAll('[data-cal-day]').length === 31, 'seta vai pro mês seguinte (dezembro: 31 dias, começa numa terça)');
    click(pop.querySelector('[data-cal-nav="1"]'));
    ok($('cal-title').textContent === 'Janeiro de 2027', 'e vira o ano: Janeiro de 2027');
    click(pop.querySelector('[data-cal-nav="-1"]')); click(pop.querySelector('[data-cal-nav="-1"]'));
    click(pop.querySelector('[data-cal-day="2026-11-21"]'));
    ok(!visible('cal-pop') && $('f-sched-date').value === '2026-11-21' && lbl('f-sched-date') === 'Sáb, 21/11/2026' && $('f-sched-time').value === '07:00' && sel('f-sched-time', 'time-h').value === '7' && sel('f-sched-time', 'time-m').value === '0', 'clicar no dia escolhe, fecha o calendário e sugere o horário');
    pickSel(sel('f-sched-time', 'time-h'), '15'); pickSel(sel('f-sched-time', 'time-m'), '35');
    ok($('f-sched-time').value === '15:35' && /das 15:35 às/.test($('f-sched-info').textContent), 'hora e minuto em 24h: "' + $('f-sched-info').textContent + '"');
    click(d.querySelector('[data-date-for="f-sched-date"]')); key(d.body, 'Escape');
    ok(!visible('cal-pop') && visible('modal-task'), 'Esc fecha só o calendário; o cartão continua aberto');
    // a mão, pelo painel de agendar
    click($('f-sched-hand'));
    ok(!visible('modal-task') && $('tab-agenda').classList.contains('on') && visible('ag-place') && $('ag-place-title').textContent === q1.title && /espaço tracejado/.test($('ag-place-hint').textContent), 'a mão fecha o cartão, abre a aba Agenda e mostra a tarefa "na mão"');
    const g16 = gaps().filter((g) => g.dataset.gapDay === '2026-11-16').map((g) => +g.dataset.gapStart);
    ok(new Set(gaps().map((g) => g.dataset.gapDay)).size === 7 && g16.length >= 1 && g16.every((st) => st >= 440 && !overlap('2026-11-16', st, q1.duration)), `os 7 dias mostram os espaços livres onde a tarefa cabe; hoje só a partir de agora (${g16.map(hhmm).join(', ')})`);
    click(d.querySelector('#ag-cols [data-block]'));
    ok(!visible('modal-task') && /espaço livre/.test($('toast').textContent), 'com a tarefa na mão, clicar num bloco não abre o cartão');
    const gq = gaps().find((g) => g.dataset.gapDay === '2026-11-19'), gst = +gq.dataset.gapStart;
    click(gq); await waitFor(() => T(q1.id).deleted === true);
    const nbq = server.alive('blocos', UID).find((b) => b.title === q1.title && b.date === '2026-11-19');
    ok(!!nbq && nbq.start_min === gst && nbq.duration === q1.duration && /^f_\d+$/.test(nbq.id) && !visible('ag-place') && gaps().length === 0 && /Agendado para Qui 19\/11 às/.test($('toast').textContent), `clicar em "${gq.textContent.trim()}" coloca o bloco ali, tira a tarefa da lista e solta a mão`);
    // a mão direto no cartão + visão Dia
    click($('tab-listas')); await sleep(40);
    const q2 = liveTasks()[0];
    click(d.querySelector(`.card[data-id="${q2.id}"] [data-hand]`));
    ok(!visible('modal-task') && visible('ag-place') && $('ag-place-title').textContent === q2.title, 'mão do cartão das Listas: um clique e a tarefa já está na mão, na aba Agenda');
    click(d.querySelector('#ag-cols .ag-day-btn[data-day="2026-11-22"]')); await sleep(40);
    ok(visible('ag-place') && /Clique no horário/.test($('ag-place-hint').textContent) && $('ag-timeline').classList.contains('placing'), 'clicar no nome do dia abre a visão Dia, ainda com a tarefa na mão');
    $('ag-timeline').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientY: 3.2 * 150 })); // 150 min abaixo do começo da régua (07:00)
    await waitFor(() => T(q2.id).deleted === true);
    const nb2 = server.alive('blocos', UID).find((b) => b.title === q2.title && b.date === '2026-11-22');
    ok(!!nb2 && nb2.start_min === 570 && !visible('ag-place') && !$('ag-timeline').classList.contains('placing'), 'na visão Dia, clicar na régua coloca no horário clicado (09:30)');
    // cancelar, Esc, trocar de aba, falha de rede
    click(d.querySelector('.ag-view[data-view="week"]')); click($('tab-listas')); await sleep(40);
    const q3 = liveTasks()[0];
    click(d.querySelector(`.card[data-id="${q3.id}"]`)); click($('f-hand'));
    ok(visible('ag-place') && $('ag-place-title').textContent === q3.title, 'mão no rodapé do cartão aberto');
    click($('ag-place-cancel'));
    ok(!visible('ag-place') && gaps().length === 0 && T(q3.id).deleted === false && /continua na lista/.test($('toast').textContent), 'Cancelar: nada é agendado e a tarefa continua na lista');
    click($('tab-listas')); click(d.querySelector(`.card[data-id="${q3.id}"] [data-hand]`)); key(d.body, 'Escape');
    ok(!visible('ag-place') && T(q3.id).deleted === false, 'Esc também solta a tarefa');
    click($('tab-listas')); click(d.querySelector(`.card[data-id="${q3.id}"] [data-hand]`)); click($('tab-listas'));
    ok(!visible('ag-place') && !!d.querySelector(`.card[data-id="${q3.id}"]`), 'voltar pra aba Listas com a tarefa na mão: ela continua lá');
    click(d.querySelector(`.card[data-id="${q3.id}"] [data-hand]`));
    const nBl = server.alive('blocos', UID).length;
    server.failNext = 1; click(gaps()[0]); await sleep(250);
    ok(T(q3.id).deleted === false && server.alive('blocos', UID).length === nBl && visible('ag-place') && /Não foi possível salvar/.test($('toast').textContent), 'sem internet ao colocar: nada muda e a tarefa volta pra mão');
    click($('ag-place-cancel'));
    click(d.querySelector('#ag-cols [data-block]'));
    ok(visible('modal-task') && /^.{3}, \d{2}\/\d{2}\/\d{4}/.test(lbl('f-date')) && sel('f-start', 'time-h').value !== '' && sel('f-start', 'time-m').value !== '', 'o cartão do bloco usa os mesmos controles de dia e hora: ' + lbl('f-date') + ' ' + $('f-start').value);
    click($('f-cancel')); click($('tab-listas'));
  }

  console.log('\nR) V40.13.0 — criar bloco novo direto na Agenda (PC):');
  {
    const visible = (id) => !$(id).classList.contains('hidden');
    const sel = (id, cls) => d.querySelector(`[data-time-for="${id}"] .${cls}`);
    const pickSel = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
    const overlap = (day, st, dur) => server.alive('blocos', UID).some((b) => b.date === day && !b.archived && st < b.start_min + b.duration && b.start_min < st + dur);
    const toMin = (v) => +v.slice(0, 2) * 60 + +v.slice(3);
    click($('tab-agenda')); click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); await sleep(60);
    ok(d.querySelectorAll('#ag-cols .ag-add[data-add-day]').length === 7 && d.querySelectorAll('#ag-cols .ag-add-top[data-add-day]').length === 7 && /Novo bloco/.test($('ag-new').textContent), 'a Agenda tem "Novo bloco" em cima e, em cada um dos 7 dias, um "+" no topo e "Adicionar bloco" no fim');
    click(d.querySelector('#ag-cols .ag-add-top[data-add-day="2026-11-19"]'));
    ok(visible('modal-task') && $('f-date').value === '2026-11-19' && $('f-save').textContent === 'Criar bloco', 'o "+" do topo do dia abre o cartão novo naquele dia');
    click($('f-cancel'));
    click(d.querySelector('#ag-cols [data-add-day="2026-11-20"]'));
    const st20 = toMin($('f-start').value);
    ok(visible('modal-task') && $('f-title').value === '' && $('f-title').placeholder === 'Nome do compromisso' && $('f-date').value === '2026-11-20' && st20 >= 420 && !overlap('2026-11-20', st20, 30) && $('f-dur').value === '30', `"Adicionar bloco" abre o cartão novo no dia clicado, no primeiro horário livre (${$('f-start').value}), com 30m`);
    ok(!visible('f-done') && !visible('f-delete') && !visible('f-archive') && !visible('f-tolist') && !visible('f-schedule') && !visible('f-hand') && $('f-save').textContent === 'Criar bloco', 'o cartão novo só tem Cancelar e "Criar bloco"');
    click($('f-save'));
    ok(visible('modal-task') && /Dê um nome pro bloco/.test($('toast').textContent), 'sem nome não cria');
    const n0 = server.alive('blocos', UID).length, tagR = server.alive('tags', UID)[0];
    typeIn($('f-title'), 'Reunião criada no PC'); change($('f-dur'), '45');
    click($('f-tags').querySelector(`button[data-tag="${tagR.id}"]`)); click($('f-colors').querySelector('button[data-color="#8b5cf6"]'));
    $('f-mb-new').value = 'Levar contrato'; key($('f-mb-new'), 'Enter');
    pickSel(sel('f-start', 'time-h'), '16'); pickSel(sel('f-start', 'time-m'), '30');
    server.log.length = 0; click($('f-save'));
    await waitFor(() => server.alive('blocos', UID).length === n0 + 1);
    const nbR = server.alive('blocos', UID).find((b) => b.title === 'Reunião criada no PC');
    ok(!!nbR && /^f_\d+$/.test(nbR.id) && nbR.date === '2026-11-20' && nbR.start_min === 990 && nbR.duration === 45 && nbR.tag_id === tagR.id && nbR.color === '#8b5cf6' && nbR.type === 'focus' && nbR.theme === 'focus' && nbR.completed === false, '"Criar bloco" grava dia, horário (16:30), duração, tag e cor');
    ok(nbR.microblocks.length === 1 && /^mb_\d+$/.test(nbR.microblocks[0].id) && nbR.microblocks[0].title === 'Levar contrato' && nbR.microblocks[0].done === false && Array.isArray(nbR.linked_note_ids), 'checklist do bloco novo com id em cada item (como no app)');
    ok(!visible('modal-task') && !!agCols()[4].querySelector(`[data-block="${nbR.id}"]`) && /Bloco criado para Sex 20\/11 às 16:30$/.test($('toast').textContent) && server.log.filter((l) => l.op !== 'select').map((l) => l.op + ':' + l.t).join() === 'upsert:blocos', 'aparece na sexta e avisa: "' + $('toast').textContent + '"');
    click(d.querySelector('#ag-cols [data-add-day="2026-11-20"]'));
    typeIn($('f-title'), 'Outro no mesmo horário'); pickSel(sel('f-start', 'time-h'), '16'); pickSel(sel('f-start', 'time-m'), '30'); click($('f-save'));
    await waitFor(() => server.alive('blocos', UID).some((b) => b.title === 'Outro no mesmo horário'));
    ok(server.alive('blocos', UID).find((b) => b.title === 'Outro no mesmo horário').start_min === 990 + 45 && /já tinha bloco/.test($('toast').textContent), 'horário ocupado → entra logo depois e avisa');
    click($('ag-new'));
    const stHoje = toMin($('f-start').value);
    ok($('f-date').value === '2026-11-16' && stHoje >= 440 && !overlap('2026-11-16', stHoje, 30), `"Novo bloco" na Semana sugere hoje, a partir de agora (${$('f-start').value})`);
    change($('f-date'), '2026-11-21');
    const st21 = toMin($('f-start').value);
    ok(st21 >= 420 && !overlap('2026-11-21', st21, 30) && st21 < stHoje, 'trocar o dia sugere o horário livre do dia novo (' + $('f-start').value + ')');
    pickSel(sel('f-start', 'time-h'), '18'); change($('f-date'), '2026-11-22');
    ok($('f-start').value.slice(0, 2) === '18', 'depois que a pessoa escolhe a hora, trocar o dia não mexe mais nela');
    click($('f-cancel'));
    ok(server.alive('blocos', UID).length === n0 + 2, 'Cancelar não cria nada');
    click(d.querySelector('#ag-cols .ag-day-btn[data-day="2026-11-21"]')); await sleep(40);
    click($('ag-new'));
    ok($('f-date').value === '2026-11-21', 'na visão Dia, "Novo bloco" usa o dia que está aberto');
    click($('f-cancel'));
    const first21 = server.alive('blocos', UID).filter((b) => b.date === '2026-11-21' && !b.archived).sort((a, b) => a.start_min - b.start_min)[0];
    const base = Math.min(7, first21 ? Math.floor(first21.start_min / 60) : 24) * 60;
    $('ag-timeline').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientY: 3.2 * 243 })); // 243 min abaixo do começo da régua
    ok(visible('modal-task') && $('f-date').value === '2026-11-21' && toMin($('f-start').value) === base + 240 && $('f-title').value === '' && $('f-save').textContent === 'Criar bloco', `clicar num horário vazio da régua abre o cartão novo naquele horário, de 5 em 5 min (${$('f-start').value})`);
    change($('f-date'), '2026-11-22');
    ok(toMin($('f-start').value) === base + 240, 'o horário clicado na régua não é trocado ao mudar o dia');
    typeIn($('f-title'), 'Sem internet'); server.failNext = 1; click($('f-save')); await sleep(250);
    ok(!server.alive('blocos', UID).some((b) => b.title === 'Sem internet') && /Não foi possível salvar/.test($('toast').textContent), 'sem internet: o bloco não é criado e a tela avisa');
    click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); click($('tab-listas')); await sleep(40);
    click(d.querySelector(`.card[data-id="${server.alive('tarefas', UID).filter((t) => !t.archived)[0].id}"] [data-hand]`));
    ok(d.querySelectorAll('#ag-cols [data-add-day]').length === 0 && d.querySelectorAll('#ag-cols [data-gap-day]').length > 0, 'com tarefa na mão, os dias mostram os espaços livres no lugar do "Adicionar bloco"');
    click($('ag-place-cancel')); click($('tab-listas'));
    click($('tab-agenda')); click(d.querySelector('#ag-cols [data-block]'));
    ok(visible('f-delete') && visible('f-archive') && visible('f-tolist') && visible('f-done') && $('f-save').textContent === 'Salvar', 'abrir um bloco que já existe continua com todos os botões');
    click($('f-cancel')); click($('tab-listas'));
  }

  console.log('\nS) V40.14.0 — mover o bloco no horário e ajustar a duração arrastando (PC):');
  {
    const B = (id) => server.get('blocos', UID, id);
    const visible = (id) => !$(id).classList.contains('hidden');
    const DAY = '2026-12-02', PX = 3.2; // quarta, numa semana sem nada nos dados de teste; a régua começa às 07:00
    const mk = (id, st, dur, extra) => server.insert('blocos', UID, Object.assign({ id, date: DAY, start_min: st, duration: dur, title: 'Bloco ' + id.slice(-1).toUpperCase(), type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false }, extra || {}));
    const A = 'f_s_a', Bk = 'f_s_b', C = 'f_s_c';
    mk(A, 540, 30); mk(Bk, 570, 30); mk(C, 660, 15); // A 09:00–09:30, B 09:30–10:00 (encostado no A), C 11:00–11:15
    click($('tab-agenda')); click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); click($('ag-next')); click($('ag-next'));
    await waitFor(() => d.querySelector(`#ag-cols [data-block="${C}"]`));
    ok($('ag-label').textContent === '30 de nov a 6 de dez' && /espaço livre/.test($('ag-tip').textContent), 'Semana mostra o lembrete: "' + $('ag-tip').textContent + '"');
    click(d.querySelector(`#ag-cols .ag-day-btn[data-day="${DAY}"]`)); await sleep(40);
    const el = (id) => [...d.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id);
    const topOf = (min) => ((min - 420) * PX + 1) + 'px', hOf = (dur) => Math.max(dur * PX - 2, 14) + 'px';
    const ev = (type, target, y, init) => target.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 300, clientY: y }, init || {})));
    // aperta o botão no bloco (ou na alça de baixo) e devolve o y do mouse; "move" anda a partir dali, em minutos
    const grab = (id, handle) => { const b = B(id), y = (handle ? b.start_min + b.duration - 420 : b.start_min - 420) * PX + (handle ? -3 : 5); ev('mousedown', handle ? el(id).querySelector('.ag-rz') : el(id), y); return y; };
    const move = (y, mins) => { ev('mousemove', d, y + 10 * Math.sign(mins || 1)); ev('mousemove', d, y + mins * PX); };
    const release = (id) => { ev('mouseup', d, 0); const e = id && el(id); if (e) click(e); }; // soltar + o clique que o navegador dispara em seguida
    const updates = () => server.log.filter((x) => x.op === 'update' && x.t === 'blocos');
    ok($('ag-label').textContent === 'Quarta, 2 de dezembro' && d.querySelectorAll('#ag-timeline [data-block]').length === 3 && d.querySelectorAll('#ag-timeline [data-block] .ag-rz').length === 3 && /Puxe a borda de baixo/.test($('ag-tip').textContent),
      'visão Dia: cada bloco tem a alça de baixo e a barra lembra como usar ("' + $('ag-tip').textContent + '")');

    // 1) clique simples continua abrindo o cartão (apertar e soltar sem andar, ou andando menos de 4px)
    let y = grab(C); ev('mouseup', d, y); click(el(C));
    ok(visible('modal-task') && $('f-title').value === 'Bloco C', 'apertar e soltar sem arrastar abre o cartão, como antes');
    click($('f-cancel'));
    y = grab(C); ev('mousemove', d, y + 3); ev('mouseup', d, y + 3); click(el(C));
    ok(visible('modal-task') && B(C).start_min === 660, 'tremidinha de 3px ainda é clique (não mexe no horário)');
    click($('f-cancel'));

    // 2) arrastar pra um horário livre: 11:00 → 12:00
    y = grab(C); move(y, 60);
    const mid = el(C), org = d.querySelector('#ag-timeline .ag-origin');
    ok(mid.classList.contains('ag-moving') && mid.style.top === topOf(720) && /12:00/.test(mid.textContent) && d.body.classList.contains('ag-grabbing'), 'no meio do arraste o bloco acompanha o mouse e mostra o horário novo (12:00)');
    ok(!!org && org.style.top === topOf(660) && B(C).start_min === 660, 'o lugar de origem fica marcado e nada é gravado antes de soltar');
    server.patch('blocos', UID, A, { title: 'A mudou no celular' }); await sleep(150);
    ok(el(C) === mid && mid.classList.contains('ag-moving') && !/A mudou/.test(el(A).textContent), 'mudança que chega do celular no meio do arraste não redesenha a tela (o bloco não escapa da mão)');
    server.log.length = 0; release(C);
    await waitFor(() => B(C).start_min === 720);
    ok(B(C).start_min === 720 && updates().length === 1 && updates()[0].fields.join() === 'start_min', 'soltou: grava só o horário novo (12:00)');
    ok(!visible('modal-task') && /^Bloco movido: 12:00–12:15$/.test($('toast').textContent) && !d.querySelector('.ag-origin') && !d.body.classList.contains('ag-grabbing') && el(C).style.top === topOf(720), 'o clique que sobra ao soltar não abre o cartão; aviso: "' + $('toast').textContent + '"');
    ok(/A mudou no celular/.test(el(A).textContent), 'e a mudança do celular que ficou esperando aparece logo depois');
    await sleep(80); click(el(C));
    ok(visible('modal-task'), 'um clique de verdade, depois, abre o cartão normalmente');
    click($('f-cancel'));

    // 3) de 5 em 5 minutos
    y = grab(C); move(y, 7); release(C);
    await waitFor(() => B(C).start_min === 725);
    ok(B(C).start_min === 725, 'anda de 5 em 5 min: 7 min de mouse viram 5 (12:05)');

    // 4) em cima de outro bloco: fica vermelho, e ao soltar volta (igual ao app)
    server.log.length = 0;
    y = grab(C); move(y, 575 - 725); // em cima do B (09:30–10:00)
    ok(el(C).classList.contains('ag-clash') && /horário ocupado/.test(el(C).textContent) && el(C).style.top === topOf(575), 'em cima de outro bloco fica marcado como "horário ocupado"');
    release(C); await sleep(120);
    ok(B(C).start_min === 725 && updates().length === 0 && /^Conflito! O bloco voltou pro lugar\.$/.test($('toast').textContent) && el(C).style.top === topOf(725) && !el(C).classList.contains('ag-clash'), 'soltou em cima: nada muda e avisa "' + $('toast').textContent + '"');

    // 5) não sai da régua
    y = grab(C); move(y, -3000); release(C);
    await waitFor(() => B(C).start_min === 420);
    ok(B(C).start_min === 420, 'puxar pra cima além do começo para no começo da régua (07:00)');
    y = grab(C); move(y, 5000); release(C);
    await waitFor(() => B(C).start_min === 1425);
    ok(B(C).start_min === 1425 && B(C).type === 'focus', 'puxar pra baixo além do fim para no último horário que cabe (23:45)');

    // 6) Esc desiste; botão solto fora da janela desiste
    server.log.length = 0;
    y = grab(C); move(y, -200);
    key(d.body, 'Escape');
    ok(!el(C).classList.contains('ag-moving') && el(C).style.top === topOf(1425) && !d.body.classList.contains('ag-grabbing'), 'Esc no meio do arraste devolve o bloco');
    release(C); await sleep(120);
    ok(!visible('modal-task') && updates().length === 0 && B(C).start_min === 1425, 'e soltar o botão depois do Esc não grava nem abre o cartão');
    y = grab(C); move(y, -200);
    ev('mousemove', d, y - 300, { buttons: 0 }); // o navegador avisa que o botão já não está apertado
    ok(!el(C).classList.contains('ag-moving') && updates().length === 0 && B(C).start_min === 1425, 'botão solto fora da janela: o arraste é cancelado, nada muda');
    click(el(C));
    ok(visible('modal-task'), 'e o próximo clique funciona normalmente');
    click($('f-cancel'));

    // 7) duração pela alça de baixo
    server.log.length = 0;
    y = grab(A, true); move(y, 12); // A está encostado no B
    ok(el(A).classList.contains('ag-sizing') && el(A).classList.contains('ag-limit') && el(A).style.height === hOf(30) && /o próximo começa às 09:30/.test(el(A).textContent) && d.body.classList.contains('ag-resizing'), 'bloco encostado no de baixo não cresce e explica por quê');
    release(A); await sleep(120);
    ok(B(A).duration === 30 && updates().length === 0 && /^O próximo bloco começa às 09:30\. Abra espaço antes de aumentar\.$/.test($('toast').textContent) && !visible('modal-task'), 'soltou: duração igual; aviso: "' + $('toast').textContent + '"');
    y = grab(A, true); move(y, -15);
    ok(el(A).style.height === hOf(15) && /15m/.test(el(A).textContent) && el(A).style.top === topOf(540), 'puxar pra cima diminui na hora (o começo não sai do lugar)');
    release(A);
    await waitFor(() => B(A).duration === 15);
    ok(B(A).duration === 15 && B(A).start_min === 540 && updates().length === 1 && updates()[0].fields.join() === 'duration' && /^Duração ajustada: 15m \(09:00–09:15\)$/.test($('toast').textContent), 'grava só a duração; aviso: "' + $('toast').textContent + '"');
    y = grab(A, true); move(y, 11); release(A);
    await waitFor(() => B(A).duration === 25);
    ok(B(A).duration === 25, 'cresce de 5 em 5 dentro do espaço que abriu (15m → 25m)');
    y = grab(A, true); move(y, 300); release(A);
    await waitFor(() => B(A).duration === 30);
    ok(B(A).duration === 30, 'puxar demais para no começo do próximo bloco (30m, até 09:30)');
    y = grab(A, true); move(y, -500); release(A);
    await waitFor(() => B(A).duration === 5);
    ok(B(A).duration === 5 && el(A).style.height === hOf(5) && el(A).querySelector('.ag-rz').classList.contains('s'), 'mínimo de 5 min (igual ao app)');
    server.log.length = 0;
    y = grab(C, true); move(y, 60); release(C); await sleep(120);
    ok(B(C).duration === 15 && updates().length === 0 && /^A régua do dia termina às 24:00\.$/.test($('toast').textContent), 'último bloco do dia não passa da meia-noite: "' + $('toast').textContent + '"');
    ev('mousedown', el(A).querySelector('[data-done]'), 0); ev('mousemove', d, 80); ev('mousemove', d, 200); ev('mouseup', d, 200);
    ok(B(A).start_min === 540 && !el(A).classList.contains('ag-moving'), 'apertar no círculo de concluir não arrasta o bloco');

    // 8) o que chega de outro aparelho no meio do gesto
    server.patch('blocos', UID, C, { start_min: 720 }); await sleep(150); // C às 12:00
    server.log.length = 0;
    y = grab(C); move(y, 60); // rumo às 13:00, que está livre
    mk('f_s_d', 780, 30); await sleep(150); // o celular coloca um bloco às 13:00 enquanto o mouse está apertado
    release(C); await sleep(150);
    ok(B(C).start_min === 720 && updates().length === 0 && /^Conflito!/.test($('toast').textContent) && !!el('f_s_d'), 'horário ocupado pelo celular no meio do arraste: o PC confere de novo ao soltar e não sobrepõe');
    y = grab(C); move(y, -60);
    server.patch('blocos', UID, C, { start_min: 900 }); await sleep(150);
    release(C); await sleep(150);
    ok(B(C).start_min === 900 && updates().length === 0 && /mudou em outro aparelho/.test($('toast').textContent) && el(C).style.top === topOf(900), 'bloco mexido no celular no meio do arraste: vale o do celular e o PC avisa');
    y = grab('f_s_d'); move(y, 120);
    server.patch('blocos', UID, 'f_s_d', { deleted: true }); await sleep(150);
    release(null); await sleep(150);
    ok(!el('f_s_d') && updates().length === 0, 'bloco apagado no celular no meio do arraste: some, e o PC não grava nada');

    // 9) "atrasou": mesma regra do app ao tirar do passado um bloco que ficou pra trás
    server.patch('blocos', UID, C, { type: 'past', start_min: 720 }); await sleep(150);
    server.log.length = 0;
    y = grab(C); move(y, 30); release(C);
    await waitFor(() => B(C).start_min === 750);
    ok(B(C).type === 'focus' && B(C).was_delayed === true && updates()[0].fields.slice().sort().join() === 'start_min,type,was_delayed', 'bloco "passado" levado pra um horário que ainda vem volta a valer e fica marcado como atrasado (como no app)');
    server.log.length = 0;
    y = grab(C); move(y, 30); release(C);
    await waitFor(() => B(C).start_min === 780);
    ok(updates()[0].fields.join() === 'start_min', 'mexer de novo no mesmo bloco sobe só o horário');
    server.patch('blocos', UID, A, { type: 'past' }); await sleep(150);
    server.log.length = 0;
    y = grab(A, true); move(y, 10); release(A);
    await waitFor(() => B(A).duration === 15);
    ok(B(A).type === 'focus' && B(A).was_delayed === true && updates()[0].fields.slice().sort().join() === 'duration,type,was_delayed', 'esticar segue a mesma regra');

    // 10) falha de rede: desfaz na tela e avisa
    server.failNext = 1; server.log.length = 0;
    y = grab(C); move(y, 60); release(C); await sleep(250);
    ok(B(C).start_min === 780 && el(C).style.top === topOf(780) && /Não foi possível salvar/.test($('toast').textContent), 'sem internet ao soltar: o bloco volta pro horário gravado e a tela avisa');

    // 11) dia que já passou: o bloco arrastado continua (ou vira) "passado"
    click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today'));
    for (let i = 0; i < 15; i++) click($('ag-prev')); // semana de 3 a 9 de agosto
    server.insert('blocos', UID, { id: 'f_s_p', date: '2026-08-05', start_min: 540, duration: 30, title: 'Bloco P', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false });
    await waitFor(() => d.querySelector('#ag-cols [data-block="f_s_p"]'));
    click(d.querySelector('#ag-cols .ag-day-btn[data-day="2026-08-05"]')); await sleep(40);
    server.log.length = 0;
    y = grab('f_s_p'); move(y, 60); release('f_s_p');
    await waitFor(() => B('f_s_p').start_min === 600);
    ok(B('f_s_p').type === 'past' && B('f_s_p').was_delayed === false && updates()[0].fields.slice().sort().join() === 'start_min,type', 'arrastar dentro de um dia que já passou deixa o bloco como "passado", sem marcar atraso');
    server.patch('blocos', UID, 'f_s_p', { deleted: true });

    // 12) com tarefa na mão, os blocos não se mexem
    click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); click($('ag-next')); click($('ag-next')); click($('tab-listas')); await sleep(40);
    click(d.querySelector(`.card[data-id="${server.alive('tarefas', UID).filter((t) => !t.archived)[0].id}"] [data-hand]`));
    click(d.querySelector(`#ag-cols .ag-day-btn[data-day="${DAY}"]`)); await sleep(40);
    server.log.length = 0;
    y = grab(C); move(y, 60);
    ok(!el(C).classList.contains('ag-moving') && $('ag-tip').textContent === '', 'com uma tarefa na mão, arrastar um bloco não faz nada (e o lembrete sai da barra)');
    ev('mouseup', d, 0);
    ok(updates().length === 0 && B(C).start_min === 780, 'nada gravado');
    click($('ag-place-cancel')); click($('tab-listas')); click($('tab-agenda'));

    // 13) Semana: enquanto arrasta, os espaços livres viram lugar de soltar
    click(d.querySelector('.ag-view[data-view="week"]')); await sleep(40);
    server.patch('blocos', UID, A, { start_min: 540, duration: 30 }); server.patch('blocos', UID, Bk, { start_min: 570, duration: 30 }); server.patch('blocos', UID, C, { start_min: 660, duration: 15 }); await sleep(150);
    const wk = (id) => d.querySelector(`#ag-cols [data-block="${id}"]`), colOf = (day) => d.querySelector(`#ag-cols .ag-list[data-day="${day}"]`);
    const zones = (day) => [...(day ? colOf(day) : $('ag-cols')).querySelectorAll('.ag-drop')];
    const zone = (day, st) => zones(day).find((z) => +z.dataset.dropStart === st && !z.classList.contains('first'));
    ok(zones().length === 0, 'parado, a Semana não mostra espaços tracejados');
    dragEv('dragstart', wk(C)); await sleep(40);
    const order = [...colOf(DAY).children].map((n) => n.classList.contains('ag-drop') ? 'livre ' + hhmm(+n.dataset.dropStart) : n.dataset.block ? n.dataset.block.slice(-1) : 'add').join(' | ');
    ok(order === 'livre 07:00 | a | b | livre 10:00 | c | add' && zones().length === 8 && zones().every((z) => /^Soltar às \d\d:\d\d/.test(z.textContent)), 'ao arrastar, cada dia mostra onde o bloco cabe (' + order + '; os outros 6 dias, às 07:00)');
    dragEv('dragover', zone(DAY, 600));
    ok(zone(DAY, 600).classList.contains('over') && d.querySelectorAll('#ag-cols .ag-over').length === 0, 'em cima de um espaço, só ele acende');
    dragEv('dragover', wk(A));
    ok(d.querySelectorAll('#ag-cols .ag-over, #ag-cols .ag-drop.over').length === 0, 'no próprio dia, fora dos espaços, nada acende');
    dragEv('dragover', colOf('2026-12-04'));
    ok(colOf('2026-12-04').closest('section').classList.contains('ag-over'), 'em outro dia, fora dos espaços, o dia inteiro acende (mesmo horário, como já era)');
    server.log.length = 0; dragEv('drop', zone(DAY, 600));
    await waitFor(() => B(C).start_min === 600);
    ok(B(C).start_min === 600 && B(C).date === DAY && updates()[0].fields.join() === 'start_min' && /^Bloco movido para Qua 02\/12 às 10:00$/.test($('toast').textContent) && zones().length === 0, 'soltar no espaço muda o horário (10:00) e os tracejados somem; aviso: "' + $('toast').textContent + '"');
    dragEv('dragstart', wk(C)); await sleep(40);
    ok(zones(DAY).length === 1 && +zones(DAY)[0].dataset.dropStart === 420, 'o lugar onde o bloco já está não vira opção');
    server.log.length = 0; dragEv('drop', wk(Bk));
    await sleep(120);
    ok(updates().length === 0 && B(C).start_min === 600 && /solte num espaço tracejado/.test($('toast').textContent) && zones().length === 0, 'soltar entre os cartões do próprio dia não muda nada e ensina: "' + $('toast').textContent + '"');
    $('toast').textContent = '-';
    dragEv('dragstart', wk(C)); await sleep(40); dragEv('drop', wk(C)); await sleep(60);
    ok($('toast').textContent === '-' && updates().length === 0, 'soltar o bloco em cima dele mesmo (desistir) não mostra aviso');
    dragEv('dragstart', wk(C)); await sleep(40); dragEv('drop', zone('2026-12-03', 420));
    await waitFor(() => B(C).date === '2026-12-03');
    ok(B(C).start_min === 420 && updates()[0].fields.slice().sort().join() === 'date,start_min' && /Qui 03\/12 às 07:00/.test($('toast').textContent), 'espaço de outro dia: muda dia e horário de uma vez');
    server.log.length = 0;
    dragEv('dragstart', wk(C)); await sleep(40); dragEv('drop', colOf('2026-12-04').closest('section').querySelector('.ag-day-btn'));
    await waitFor(() => B(C).date === '2026-12-04');
    ok(B(C).start_min === 420 && updates()[0].fields.join() === 'date', 'soltar em outro dia fora dos espaços continua levando pro mesmo horário');
    dragEv('dragstart', wk(Bk)); await sleep(40);
    const fri = zones('2026-12-04');
    ok(fri.length === 2 && fri[0].classList.contains('first') && fri[0] === colOf('2026-12-04').firstElementChild && fri.every((z) => +z.dataset.dropStart === 435), 'dia que começa ocupado: o primeiro espaço livre também fica fixo no topo');
    dragEv('dragend', wk(Bk));
    ok(zones().length === 0 && !wk(Bk).classList.contains('dragging'), 'desistir do arraste limpa os tracejados');
    server.patch('blocos', UID, A, { type: 'past', was_delayed: false }); await sleep(150);
    server.log.length = 0;
    dragEv('dragstart', wk(A)); await sleep(40); dragEv('drop', zone('2026-12-05', 420));
    await waitFor(() => B(A).date === '2026-12-05');
    ok(B(A).type === 'focus' && B(A).was_delayed === true && updates()[0].fields.slice().sort().join() === 'date,start_min,type,was_delayed', 'bloco que ficou pra trás, levado pra frente, fica marcado como atrasado também pela Semana');
    click($('tab-listas')); await sleep(40);
    click(d.querySelector(`.card[data-id="${server.alive('tarefas', UID).filter((t) => !t.archived)[0].id}"] [data-hand]`));
    dragEv('dragstart', wk(Bk)); await sleep(40);
    ok(zones().length === 0 && d.querySelectorAll('#ag-cols [data-gap-day]').length > 0, 'com tarefa na mão, arrastar um bloco não soma tracejados aos que já estão na tela');
    dragEv('dragend', wk(Bk)); click($('ag-place-cancel')); click($('tab-listas')); click($('tab-agenda'));

    // 14) pelo cartão: tirar do passado também marca "atrasou"
    server.patch('blocos', UID, Bk, { type: 'past', was_delayed: false }); await sleep(150);
    click(wk(Bk));
    const pick = (el2, v) => { el2.value = v; el2.dispatchEvent(new w.Event('input', { bubbles: true })); el2.dispatchEvent(new w.Event('change', { bubbles: true })); };
    pick($('f-start'), '15:00'); server.log.length = 0; click($('f-save'));
    await waitFor(() => B(Bk).start_min === 900);
    ok(B(Bk).type === 'focus' && B(Bk).was_delayed === true && updates()[0].fields.slice().sort().join() === 'start_min,type,was_delayed', 'trocar o horário pelo cartão segue a mesma regra de quem arrasta');
    click(wk(Bk));
    ok($('f-status').textContent === 'Atrasou' && visible('f-status'), 'e o cartão mostra "Atrasou"');
    click($('f-cancel'));
    for (const id of [A, Bk, C]) server.patch('blocos', UID, id, { deleted: true });
    await sleep(150);
    click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); click($('tab-listas'));
  }

  console.log('\nJ) Sair e entrar:');
  click($('btn-logout'));
  await sleep(20);
  click($('dlg-ok'));
  await waitFor(() => !$('view-login').classList.contains('hidden'));
  ok(!$('view-login').classList.contains('hidden') && $('view-board').classList.contains('hidden'), 'saiu → tela de entrar');
  click($('forgot-btn')); await sleep(30);
  ok(/Digite seu e-mail/.test($('login-msg').textContent), 'esqueci a senha sem e-mail → pede o e-mail');
  $('login-email').value = 'pessoa@teste.com'; click($('forgot-btn'));
  await waitFor(() => server.log.some((x) => x.op === 'reset')); await sleep(40);
  const rs = server.log.filter((x) => x.op === 'reset').pop();
  ok(rs && rs.redirectTo === 'https://jhonatanfavero.github.io/Faz-App/kanban.html' && /enviamos um link/.test($('login-msg').textContent), 'esqueci a senha → pedido enviado, mensagem neutra');
  $('login-email').value = 'pessoa@teste.com'; $('login-pass').value = 'errada';
  $('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !$('login-msg').classList.contains('hidden'));
  ok($('login-msg').textContent === 'E-mail ou senha incorretos.', 'senha errada → mensagem clara');
  $('login-pass').value = 'senha123';
  $('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !$('view-board').classList.contains('hidden') && cols().length === 4);
  ok(!$('view-board').classList.contains('hidden') && cols().length === 4, 'entrou de novo e o quadro voltou');

  console.log('\nN) Link de recuperação de senha:');
  server.emitters.forEach((e) => e('PASSWORD_RECOVERY'));
  await waitFor(() => !$('view-recovery').classList.contains('hidden'));
  ok(!$('view-recovery').classList.contains('hidden') && $('view-board').classList.contains('hidden'), 'mostra "Criar uma senha nova" em vez do quadro');
  $('recovery-pass').value = '123'; $('recovery-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await sleep(30);
  ok($('recovery-msg').textContent === 'A senha precisa ter pelo menos 6 caracteres.', 'senha curta → aviso');
  $('recovery-pass').value = 'novaSenha9'; $('recovery-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !$('view-board').classList.contains('hidden'));
  ok(server.users.get('pessoa@teste.com').password === 'novaSenha9' && !$('view-board').classList.contains('hidden'), 'senha trocada e o quadro abre');

  console.log('\nK) Conta nova, nuvem vazia:');
  server.addUser('nova@teste.com', 'senha123', '99999999-9999-9999-9999-999999999999');
  click($('btn-logout')); await sleep(20); click($('dlg-ok'));
  await waitFor(() => !$('view-login').classList.contains('hidden'));
  $('login-email').value = 'nova@teste.com'; $('login-pass').value = 'senha123';
  $('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => !$('board-empty').classList.contains('hidden'));
  ok(!$('board-empty').classList.contains('hidden') && $('empty-email').textContent === 'nova@teste.com', 'mostra como conectar o celular, com o e-mail da conta');
  ok(cols().length === 0, 'não mostra nada da outra conta (RLS)');

  ok(errors.length === 0, 'nenhum erro de JavaScript' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ').slice(0, 400) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  w.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
