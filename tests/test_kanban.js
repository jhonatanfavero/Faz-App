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
  ok(!$('modal-block').classList.contains('hidden') && $('b-title').textContent === bdata.title && /Segunda, 16 de novembro/.test($('b-when').textContent), 'detalhe do bloco: ' + $('b-when').textContent);
  click($('b-close'));
  ok($('modal-block').classList.contains('hidden'), 'detalhe fecha');
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
  ok(mvd.date === '2026-11-19' && mvd.start_min === st0 && mvd.type === 'focus' && lastLog('update', 'blocos').fields.sort().join() === 'date,start_min,type', 'bloco de terça foi pra quinta 19/11 no mesmo horário');
  ok(!!agCols()[3].querySelector(`[data-block="${bid}"]`) && /Bloco movido para Qui 19\/11/.test($('toast').textContent), 'aviso: "' + $('toast').textContent + '"');
  const oid2 = agCols()[1].querySelector('[data-block]').dataset.block;
  server.patch('blocos', UID, oid2, { start_min: st0, duration: 15 }); await sleep(150);
  dragEv('dragstart', agCols()[1].querySelector(`[data-block="${oid2}"]`)); await sleep(30); dragEv('drop', agCols()[3]);
  await waitFor(() => server.get('blocos', UID, oid2).date === '2026-11-19');
  ok(server.get('blocos', UID, oid2).start_min === st0 + du0, 'horário já ocupado no destino → entra logo depois, sem sobrepor');
  click(agCols()[3].querySelector(`[data-block="${bid}"]`)); click($('b-archive'));
  await waitFor(() => server.get('blocos', UID, bid).archived === true);
  ok(!d.querySelector(`#ag-cols [data-block="${bid}"]`) && !server.get('blocos', UID, bid).deleted, 'Arquivar bloco: some da agenda, não é apagado');
  click($('btn-archive')); click($('ar-list').querySelector(`[data-unarchive="blocos|${bid}"]`));
  await waitFor(() => server.get('blocos', UID, bid).archived === false);
  ok(server.get('blocos', UID, bid).archived === false && server.get('blocos', UID, bid).start_min === st0, 'Desarquivar bloco: volta pro mesmo horário');
  click($('ar-close')); click($('tab-listas'));

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
