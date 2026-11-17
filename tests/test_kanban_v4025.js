// V40.25.0 — tela do PC (kanban.html): DESFAZER (Ctrl+Z) e REFAZER (Ctrl+Y / Ctrl+Shift+Z).
// (A) começo; (B) apagar tarefa: aviso com Desfazer, Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, botões ↶ ↷ do topo;
// (C) arrastar pra outra lista; (D) agendar = um passo só (a tarefa volta antes do bloco sair); (E) concluir bloco
// (sem aviso, mas com Ctrl+Z); (F) apagar lista com as tarefas; (G) apagar tag; (H) metas: o "+" e apagar categoria;
// (I) nota sendo escrita = um passo; (J) o celular mexeu depois: não pisa; (K) Ctrl+Z num campo ou com janela
// aberta não é nosso; (L) sem internet: volta como estava e dá pra tentar de novo; (M) ação nova apaga o Refazer;
// (N) arquivados: apagar de vez agora desfaz; (P) V40.25.1: dois cliques num horário vazio criam bloco (Semana e Dia) e o
// 2º clique de um clique duplo não fecha janela nem age de novo. Texto nunca vira HTML.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4025.js <repo> <backup.json>
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
const C = Object.fromEntries(local.listas.map((c) => [c.name, c.id]));

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
  const press = (el, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const ctrlZ = (el) => press(el || d.body, 'z', { ctrlKey: true });
  const ctrlY = (el) => press(el || d.body, 'y', { ctrlKey: true });
  const change = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const visible = (id) => !$(id).classList.contains('hidden');
  const pill = () => visible('undo-pill');
  const pillTxt = () => $('undo-pill-msg').textContent;
  const row = (t, id) => server.get(t, UID, id);
  const writes = () => server.log.filter((l) => l.op !== 'select');
  const cols = () => [...d.querySelectorAll('section.col')];
  const colByName = (n) => cols().find((s) => s.querySelector('h2').textContent === n);
  const cardsIn = (n) => [...colByName(n).querySelectorAll('.card')].map((c) => c.dataset.id);
  const menu = () => d.querySelector('div.fixed.z-40[role="menu"]');
  const dlgOk = async () => { await waitFor(() => visible('dialog')); click($('dlg-ok')); await sleep(40); };
  const settle = () => sleep(120); // gravações + tempo real
  await waitFor(() => cols().length === 5);

  console.log('A) Começo:');
  ok(visible('btn-undo') && $('btn-undo').disabled && $('btn-redo').disabled && $('btn-undo').title === 'Nada pra desfazer' && $('btn-redo').title === 'Nada pra refazer', 'botões ↶ ↷ no topo, apagados ("Nada pra desfazer")');
  ok(!pill(), 'sem aviso embaixo');
  ok(ctrlZ() === true && $('toast').textContent === 'Nada pra desfazer.' && writes().length === 0, 'Ctrl+Z sem nada: "Nada pra desfazer." e nada é gravado');

  console.log('\nB) Apagar uma tarefa e desfazer:');
  const beta0 = cardsIn('BETA'), T1 = beta0[2];
  click(d.querySelector(`.card[data-id="${T1}"] [data-more]`)); click(menu().querySelector('[data-act="delete"]')); await sleep(20); click($('dlg-ok'));
  await waitFor(() => row('tarefas', T1).deleted === true); await settle();
  ok(row('tarefas', T1).deleted === true && !cardsIn('BETA').includes(T1), 'apagou (aqui e na nuvem)');
  ok(pill() && pillTxt() === 'Tarefa apagada' && visible('undo-pill-undo') && !visible('undo-pill-redo') && $('undo-pill-undo').textContent.includes('Ctrl+Z'), 'aviso embaixo: "Tarefa apagada" + Desfazer (Ctrl+Z)');
  ok(!$('btn-undo').disabled && $('btn-undo').title === 'Desfazer: Tarefa apagada (Ctrl+Z)' && $('btn-redo').disabled, 'botão ↶: "Desfazer: Tarefa apagada (Ctrl+Z)"');
  server.log.length = 0;
  ok(ctrlZ() === true, 'Ctrl+Z é nosso (não deixa o navegador fazer outra coisa)');
  await waitFor(() => row('tarefas', T1).deleted === false); await settle();
  ok(row('tarefas', T1).deleted === false && JSON.stringify(cardsIn('BETA')) === JSON.stringify(beta0), 'Ctrl+Z: a tarefa volta, no mesmo lugar da lista');
  ok(writes().length === 1 && writes()[0].op === 'update' && writes()[0].fields.join() === 'deleted', 'gravou só "deleted" de volta (não pisa no resto)');
  ok(pill() && pillTxt() === 'Desfeito: tarefa apagada' && visible('undo-pill-redo') && $('undo-pill-redo').textContent.includes('Ctrl+Y'), 'aviso: "Desfeito: tarefa apagada" + Refazer (Ctrl+Y)');
  ok($('btn-undo').disabled && !$('btn-redo').disabled && $('btn-redo').title === 'Refazer: Tarefa apagada (Ctrl+Y)', 'botão ↷: "Refazer: Tarefa apagada (Ctrl+Y)"');
  ctrlY(); await waitFor(() => row('tarefas', T1).deleted === true); await settle();
  ok(row('tarefas', T1).deleted === true && pillTxt() === 'Refeito: tarefa apagada', 'Ctrl+Y refaz: apaga de novo ("Refeito: …")');
  click($('btn-undo')); await waitFor(() => row('tarefas', T1).deleted === false); await settle();
  ok(row('tarefas', T1).deleted === false, 'o botão ↶ do topo desfaz');
  press(d.body, 'z', { ctrlKey: true, shiftKey: true }); await waitFor(() => row('tarefas', T1).deleted === true); await settle();
  ok(row('tarefas', T1).deleted === true, 'Ctrl+Shift+Z também refaz');
  click($('undo-pill-undo')); await waitFor(() => row('tarefas', T1).deleted === false); await settle();
  ok(row('tarefas', T1).deleted === false, 'o Desfazer do aviso também');
  press(d.body, 'z', { metaKey: true }); await settle();
  ok(row('tarefas', T1).deleted === false && $('toast').textContent === 'Nada pra desfazer.', 'Cmd+Z (Mac) também funciona');
  click($('undo-pill-x'));
  ok(!pill(), 'o X fecha o aviso');

  console.log('\nC) Arrastar pra outra lista:');
  const dt = { setData() {}, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientY', { value: 10 }); el.dispatchEvent(e); };
  const gama0 = cardsIn('GAMA'), delta0 = cardsIn('DELTA'), M1 = gama0[0], m1 = { ...row('tarefas', M1) };
  dragEv('dragstart', d.querySelector(`.card[data-id="${M1}"]`)); await sleep(30);
  dragEv('dragover', colByName('DELTA').querySelector('.col-list')); dragEv('drop', colByName('DELTA').querySelector('.col-list'));
  await waitFor(() => row('tarefas', M1).column_id === C.DELTA); await settle();
  ok(pill() && pillTxt() === 'Tarefa movida de lista' && $('btn-undo').title === 'Desfazer: Tarefa movida de lista (Ctrl+Z)', 'mudou de lista: aviso "Tarefa movida de lista"');
  ctrlZ(); await waitFor(() => row('tarefas', M1).column_id === C.GAMA); await settle();
  ok(row('tarefas', M1).column_id === m1.column_id && row('tarefas', M1).position === m1.position && JSON.stringify(cardsIn('GAMA')) === JSON.stringify(gama0) && JSON.stringify(cardsIn('DELTA')) === JSON.stringify(delta0), 'Ctrl+Z: volta pra GAMA, na mesma posição');

  console.log('\nD) Agendar = um passo só:');
  const S1 = cardsIn('ALFA')[1], s1 = { ...row('tarefas', S1) }, nB = server.alive('blocos', UID).length;
  click(d.querySelector(`.card[data-id="${S1}"] [data-sched]`));
  change($('f-sched-date'), '2026-11-21'); change($('f-sched-time'), '10:00'); click($('f-sched-ok'));
  await waitFor(() => row('tarefas', S1).deleted === true); await settle();
  const NB = server.alive('blocos', UID).find((b) => b.title === s1.title && b.date === '2026-11-21');
  ok(!!NB && server.alive('blocos', UID).length === nB + 1, 'agendou: bloco novo no sábado e a tarefa saiu da lista');
  ok($('btn-undo').title === 'Desfazer: Tarefa agendada (Ctrl+Z)' && pill() && pillTxt() === 'Tarefa agendada', 'um passo só: "Tarefa agendada"');
  server.log.length = 0;
  ctrlZ(); await waitFor(() => row('blocos', NB.id).deleted === true && row('tarefas', S1).deleted === false); await settle();
  ok(row('tarefas', S1).deleted === false && row('blocos', NB.id).deleted === true && cardsIn('ALFA')[1] === S1, 'Ctrl+Z: a tarefa volta pra lista e o bloco sai da agenda');
  ok(writes().map((l) => l.t + ':' + l.fields.join()).join(' → ') === 'tarefas:deleted → blocos:deleted', 'ordem segura: primeiro a tarefa volta, depois o bloco sai (' + writes().map((l) => l.t).join(' → ') + ')');
  server.log.length = 0;
  ctrlY(); await waitFor(() => row('blocos', NB.id).deleted === false && row('tarefas', S1).deleted === true); await settle();
  ok(row('blocos', NB.id).deleted === false && row('blocos', NB.id).start_min === 600 && row('tarefas', S1).deleted === true, 'Ctrl+Y: agenda de novo, no mesmo horário');
  ok(writes().map((l) => l.t).join(' → ') === 'blocos → tarefas', 'refazendo: primeiro o bloco volta, depois a tarefa sai');
  ctrlZ(); await waitFor(() => row('tarefas', S1).deleted === false); await settle();

  console.log('\nE) Concluir um bloco (sem aviso, com Ctrl+Z):');
  click($('tab-agenda')); await sleep(60);
  const wk = (id) => d.querySelector(`#ag-cols [data-block="${id}"]`);
  const BK = server.alive('blocos', UID).find((b) => b.date === '2026-11-16' && !b.completed && wk(b.id) && wk(b.id).querySelector('[data-done]'));
  click($('undo-pill-x'));
  click(wk(BK.id).querySelector('[data-done]'));
  await waitFor(() => row('blocos', BK.id).completed === true); await settle();
  ok(!pill() && $('btn-undo').title === 'Desfazer: Bloco concluído (Ctrl+Z)', 'concluir: sem aviso embaixo (o toque é simples), mas o ↶ sabe: "Desfazer: Bloco concluído"');
  ctrlZ(); await waitFor(() => row('blocos', BK.id).completed === false); await settle();
  ok(row('blocos', BK.id).completed === false && !wk(BK.id).classList.contains('done'), 'Ctrl+Z: o bloco volta a ficar aberto');
  ok(pill() && pillTxt() === 'Desfeito: bloco concluído', 'e o aviso mostra o que foi desfeito');

  console.log('\nF) Apagar uma lista com as tarefas dela:');
  click($('tab-listas')); await sleep(60);
  const gamaIds = cardsIn('GAMA'), order0 = cols().map((s) => s.dataset.col);
  click(colByName('GAMA').querySelector('.col-menu-btn'));
  await sleep(20);
  click(d.querySelector('div.fixed.z-40 button[data-act="delete"]')); // o menu da lista (não é o dos 3 pontinhos do cartão)
  await waitFor(() => visible('dialog'));
  ok(/As 6 tarefas dela também serão apagadas, aqui e no celular\. Dá pra desfazer com Ctrl\+Z\./.test($('dlg-text').textContent) && !/Não dá pra desfazer/.test($('dlg-text').textContent), 'o aviso diz que dá pra desfazer: "' + $('dlg-text').textContent + '"');
  click($('dlg-ok'));
  await waitFor(() => row('listas', C.GAMA).deleted === true && gamaIds.every((id) => row('tarefas', id).deleted)); await settle();
  ok(!colByName('GAMA') && pill() && pillTxt() === 'Lista apagada', 'apagou: aviso "Lista apagada"');
  server.log.length = 0;
  ctrlZ(); await waitFor(() => row('listas', C.GAMA).deleted === false && gamaIds.every((id) => !row('tarefas', id).deleted)); await settle();
  ok(JSON.stringify(cols().map((s) => s.dataset.col)) === JSON.stringify(order0) && JSON.stringify(cardsIn('GAMA')) === JSON.stringify(gamaIds), 'Ctrl+Z: a lista volta no lugar, com as 6 tarefas na ordem');
  ok(writes().map((l) => l.t + ':' + l.n).join(' → ') === 'listas:1 → tarefas:6', 'primeiro a lista, depois as 6 tarefas de uma vez (' + writes().map((l) => l.t + ':' + l.n).join(' → ') + ')');

  console.log('\nG) Apagar uma tag:');
  const TG = local.tags[1].id, usedT = server.alive('tarefas', UID).filter((t) => t.tag_id === TG).map((t) => t.id), usedB = server.alive('blocos', UID).filter((b) => b.tag_id === TG).map((b) => b.id);
  click($('btn-tags')); await sleep(30);
  click(d.querySelector(`#tg-list [data-tg-del="${TG}"]`));
  await dlgOk();
  await waitFor(() => row('tags', TG).deleted === true && usedT.every((id) => row('tarefas', id).tag_id === null)); await settle();
  ok(row('tags', TG).deleted === true && usedB.every((id) => row('blocos', id).tag_id === null), 'apagou a tag: ' + usedT.length + ' tarefas e ' + usedB.length + ' blocos ficaram sem ela');
  click($('tg-close'));
  await sleep(30);
  ok(!visible('modal-tags'), 'fechou a janela das tags');
  ok($('btn-undo').title === 'Desfazer: Tag apagada (Ctrl+Z)', 'o ↶ sabe: "Tag apagada"');
  server.log.length = 0;
  ctrlZ(); await waitFor(() => row('tags', TG).deleted === false && usedT.every((id) => row('tarefas', id).tag_id === TG) && usedB.every((id) => row('blocos', id).tag_id === TG)); await settle();
  ok(row('tags', TG).deleted === false && usedT.every((id) => row('tarefas', id).tag_id === TG) && usedB.every((id) => row('blocos', id).tag_id === TG), 'Ctrl+Z: a tag volta e todo mundo volta a ter ela');
  ok(writes()[0].t === 'tags', 'a tag volta primeiro (o celular nunca vê tarefa com tag apagada)');

  console.log('\nH) Metas: o "+" e apagar categoria:');
  const top0 = $('btn-undo').title, redo0 = $('btn-redo').title;
  click($('tab-metas'));
  await waitFor(() => server.alive('metas_listas', UID).length === 3); await settle();
  ok($('btn-undo').title === top0 && $('btn-redo').title === redo0, 'as 3 categorias que nascem sozinhas não viram passo (nem apagam o Refazer)');
  click($('mt-new')); click(d.querySelector('#mt-f-tpl [data-mt-tpl="0"]')); click($('mt-f-save'));
  await waitFor(() => server.alive('metas', UID).length === 1); await settle();
  const G1 = server.alive('metas', UID)[0], card = (id) => d.querySelector(`.mt-card[data-goal="${id}"]`), day = G1.id + '_20261116';
  click(card(G1.id).querySelector('[data-mt-plus]')); await waitFor(() => row('metas_dias', day) && row('metas_dias', day).amount === 1);
  click(card(G1.id).querySelector('[data-mt-plus]')); await waitFor(() => row('metas_dias', day).amount === 2); await settle();
  ok(!pill() && $('btn-undo').title === 'Desfazer: Progresso da meta (Ctrl+Z)', 'o "+" não mostra aviso (já tem o "−"), mas o ↶ sabe');
  ctrlZ(); await waitFor(() => row('metas_dias', day).amount === 1); await settle();
  ok(row('metas_dias', day).amount === 1 && card(G1.id).querySelector('.mt-status').textContent.startsWith('1 de'), 'Ctrl+Z tira o último "+"');
  ctrlZ(); await waitFor(() => row('metas_dias', day).deleted === true); await settle();
  ok(row('metas_dias', day).deleted === true && !card(G1.id).querySelector('[data-mt-minus]'), 'Ctrl+Z de novo: o dia volta a zero');
  ctrlY(); await waitFor(() => row('metas_dias', day).deleted === false && row('metas_dias', day).amount === 1); await settle();
  ok(row('metas_dias', day).amount === 1, 'Ctrl+Y: o "+" volta');
  const L1 = G1.list_id;
  click(d.querySelector(`[data-mt-sec="${L1}"] [data-mt-dellist]`)); await dlgOk();
  await waitFor(() => row('metas_listas', L1).deleted === true && row('metas', G1.id).deleted === true && row('metas_dias', day).deleted === true); await settle();
  ok(pill() && pillTxt() === 'Categoria apagada', 'apagou a categoria (com a meta e o dia): aviso "Categoria apagada"');
  ctrlZ(); await waitFor(() => row('metas_listas', L1).deleted === false && row('metas', G1.id).deleted === false && row('metas_dias', day).deleted === false); await settle();
  ok(!!card(G1.id) && card(G1.id).querySelector('.mt-status').textContent.startsWith('1 de'), 'Ctrl+Z: categoria, meta e o que foi marcado hoje voltam');

  console.log('\nI) Nota sendo escrita = um passo só:');
  click($('tab-notas')); await sleep(40);
  const N1 = server.alive('notas', UID)[0], n1 = { ...N1 };
  click(d.querySelector(`#nt-list [data-nt="${N1.id}"]`));
  await waitFor(() => visible('nt-form'));
  for (const t of [' um', ' dois', ' três']) {
    $('nt-content').value += t; $('nt-content').dispatchEvent(new w.Event('input', { bubbles: true }));
    await waitFor(() => (row('notas', N1.id).content || '').endsWith(t), 3000); await sleep(30);
  }
  ok(row('notas', N1.id).content === (n1.content || '') + ' um dois três', 'a nota foi salva sozinha 3 vezes');
  ok(press($('nt-content'), 'z', { ctrlKey: true }) === false, 'Ctrl+Z com o cursor no texto: é o desfazer do próprio texto (não o nosso)');
  $('nt-content').blur(); d.body.focus();
  ok($('btn-undo').title === 'Desfazer: Nota editada (Ctrl+Z)', 'um passo só: "Nota editada"');
  ctrlZ(); await waitFor(() => row('notas', N1.id).content === n1.content); await settle();
  ok(row('notas', N1.id).content === n1.content && $('nt-content').value === n1.content, 'Ctrl+Z (fora do texto): a nota volta como era antes de começar a escrever, e o editor mostra');

  console.log('\nJ) O celular mexeu depois: não pisa:');
  click($('tab-listas')); await sleep(40);
  const T2 = cardsIn('DELTA')[0];
  click(d.querySelector(`.card[data-id="${T2}"] [data-more]`)); click(menu().querySelector('[data-act="archive"]'));
  await waitFor(() => row('tarefas', T2).archived === true); await settle();
  server.patch('tarefas', UID, T2, { archived: false, title: 'O celular desarquivou' }); await settle();
  server.log.length = 0;
  ctrlZ(); await settle();
  ok(writes().length === 0 && row('tarefas', T2).title === 'O celular desarquivou' && /^Não deu pra desfazer: isso já mudou no celular\.$/.test($('toast').textContent), 'nada é gravado: "Não deu pra desfazer: isso já mudou no celular."');

  console.log('\nK) Ctrl+Z que não é nosso:');
  const T3 = cardsIn('DELTA')[1];
  click(d.querySelector(`.card[data-id="${T3}"]`)); await waitFor(() => visible('modal-task'));
  ok(press($('modal-task'), 'z', { ctrlKey: true }) === false, 'com o cartão aberto, Ctrl+Z não mexe por baixo dele');
  ok(press($('f-title'), 'z', { ctrlKey: true }) === false, 'num campo de texto, vale o desfazer do texto');
  press(d.body, 'Escape'); await sleep(30);
  ok(!visible('modal-task'), 'fechou o cartão');

  console.log('\nL) Sem internet na hora de desfazer:');
  click(d.querySelector(`.card[data-id="${T3}"] [data-more]`)); click(menu().querySelector('[data-act="delete"]')); await dlgOk();
  await waitFor(() => row('tarefas', T3).deleted === true); await settle();
  server.failNext = 1;
  ctrlZ(); await sleep(250);
  ok(row('tarefas', T3).deleted === true && !cardsIn('DELTA').includes(T3) && /Não foi possível salvar|Sem internet/.test($('toast').textContent), 'não gravou: a tela volta a mostrar como está na nuvem e avisa');
  ok($('btn-undo').title === 'Desfazer: Tarefa apagada (Ctrl+Z)', 'o passo continua lá');
  ctrlZ(); await waitFor(() => row('tarefas', T3).deleted === false); await settle();
  ok(row('tarefas', T3).deleted === false && cardsIn('DELTA').includes(T3), 'tentou de novo: voltou');

  console.log('\nM) Ação nova apaga o Refazer:');
  ok(!$('btn-redo').disabled, 'tem Refazer');
  const T4 = cardsIn('BETA')[0];
  click(d.querySelector(`.card[data-id="${T4}"] [data-more]`)); click(menu().querySelector('[data-act="archive"]'));
  await waitFor(() => row('tarefas', T4).archived === true); await settle();
  ok($('btn-redo').disabled && $('btn-redo').title === 'Nada pra refazer' && pillTxt() === 'Tarefa arquivada', 'arquivou outra: o Refazer some');

  console.log('\nN) Arquivados: apagar de vez agora desfaz:');
  click($('btn-archive')); await sleep(30);
  click(d.querySelector(`[data-delarch="tarefas|${T4}"]`));
  await waitFor(() => visible('dialog'));
  ok(/Dá pra desfazer com Ctrl\+Z\./.test($('dlg-text').textContent) && !/Não dá pra desfazer/.test($('dlg-text').textContent), 'a pergunta diz que dá pra desfazer');
  click($('dlg-ok'));
  await waitFor(() => row('tarefas', T4).deleted === true); await settle();
  click($('ar-close')); await sleep(30);
  ctrlZ(); await waitFor(() => row('tarefas', T4).deleted === false); await settle();
  ok(row('tarefas', T4).deleted === false && row('tarefas', T4).archived === true, 'Ctrl+Z: volta pros arquivados');

  console.log('\nP) Dois cliques num horário vazio (V40.25.1):');
  {
    const md = (el, detail, y) => el.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail, clientY: y || 0 }));
    const ck = (el, detail, y) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, detail, clientY: y || 0 }));
    const dc = (el, y) => { const e = new w.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, clientY: y || 0 }); el.dispatchEvent(e); return e.defaultPrevented; };
    const dblAt = (el, y) => { md(el, 1, y); ck(el, 1, y); md(el, 2, y); ck(el, 2, y); return dc(el, y); }; // a ordem do navegador num clique duplo
    const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    const list = (day) => d.querySelector(`#ag-cols .ag-list[data-day="${day}"]`);
    const esc = () => press(d.body, 'Escape');
    click($('tab-agenda')); await sleep(60);
    click($('undo-pill-x'));
    // Semana: os cartões do dia 16 ficam um embaixo do outro (60 px cada, no jsdom não tem tela: a gente diz onde estão)
    const D16 = '2026-11-16', cards16 = () => [...list(D16).querySelectorAll('[data-block]')];
    const pos = () => cards16().forEach((c, i) => { c.getBoundingClientRect = () => ({ top: i * 60, bottom: i * 60 + 50, left: 0, right: 100, width: 100, height: 50 }); });
    const b2 = row('blocos', cards16()[2].dataset.block), last = row('blocos', cards16()[cards16().length - 1].dataset.block);
    pos();
    ok(dblAt(list(D16), 175) === true && visible('modal-task') && $('f-date').value === D16 && $('f-start').value === hhmm(b2.start_min + b2.duration), 'Semana: dois cliques entre o 3º e o 4º cartão abrem o "Novo bloco" logo depois do 3º (' + $('f-start').value + ')');
    ok($('f-save').textContent === 'Criar bloco' && $('f-title').value === '' && visible('f-sub-wrap'), 'é o "Novo bloco" de sempre (botão "Criar bloco", nome vazio, com a opção Sublista)');
    esc(); await sleep(30);
    pos();
    dblAt(list(D16), 5000);
    ok(visible('modal-task') && $('f-start').value === hhmm(last.start_min + last.duration), 'dois cliques embaixo de tudo: depois do último bloco do dia (' + $('f-start').value + ')');
    esc(); await sleep(30);
    dblAt(list('2026-11-19'), 10);
    ok(visible('modal-task') && $('f-date').value === '2026-11-19' && $('f-start').value === '07:00', 'dia vazio: no primeiro horário livre (07:00)');
    esc(); await sleep(30);
    // embaixo de uma coluna curta (dia com poucos blocos) o clique cai no fundo da Semana: vale a coluna do clique
    const sec22 = list('2026-11-22').parentNode;
    [...$('ag-cols').children].forEach((sec, i) => { sec.getBoundingClientRect = () => ({ left: i * 200, right: i * 200 + 190, top: 0, bottom: 120, width: 190, height: 120 }); });
    const x22 = [...$('ag-cols').children].indexOf(sec22) * 200 + 90;
    md($('ag-cols'), 1, 400); $('ag-cols').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, clientX: x22, clientY: 400 }));
    ok(!visible('modal-task'), 'um clique embaixo de um dia e o outro embaixo de outro dia: não abre nada');
    $('ag-cols').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 1, clientX: x22, clientY: 400 }));
    $('ag-cols').dispatchEvent(new w.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2, clientX: x22, clientY: 400 }));
    ok(visible('modal-task') && $('f-date').value === '2026-11-22', 'dois cliques no espaço vazio embaixo do domingo (coluna curta) abrem o "Novo bloco" do domingo');
    esc(); await sleep(30);
    // um clique só na parte vazia não faz nada; dois cliques num cartão abrem ele uma vez só (a janela não pisca)
    ck(list(D16), 1, 175);
    ok(!visible('modal-task'), 'um clique na parte vazia do dia não abre nada');
    const c0 = cards16()[0];
    md(c0, 1); ck(c0, 1); md($('modal-task'), 2); ck($('modal-task'), 2); dc($('modal-task'));
    ok(visible('modal-task') && $('f-title').value === row('blocos', c0.dataset.block).title, 'dois cliques num bloco: abre e continua aberto (o 2º clique cai no fundo e não fecha mais)');
    md($('modal-task'), 1);
    ok(!visible('modal-task'), 'um clique no fundo continua fechando');
    // o círculo de concluir não marca e desmarca no clique duplo
    const done = cards16()[1].querySelector('[data-done]'), bid = cards16()[1].dataset.block, was = row('blocos', bid).completed;
    md(done, 1); ck(done, 1); md(done, 2); ck(done, 2); dc(done);
    await waitFor(() => row('blocos', bid).completed === !was); await settle();
    ok(row('blocos', bid).completed === !was && !visible('modal-task'), 'dois cliques no círculo de concluir: muda uma vez só (e não abre nada)');
    ctrlZ(); await waitFor(() => row('blocos', bid).completed === was); await settle();
    // dois cliques no nome do dia abrem o Dia (como um clique), sem criar bloco
    const dayBtn = d.querySelector(`#ag-cols .ag-day-btn[data-day="${D16}"]`);
    md(dayBtn, 1); ck(dayBtn, 1);
    md($('ag-timeline'), 2); ck($('ag-timeline'), 2); dc($('ag-timeline'));
    ok(!visible('modal-task') && w.document.querySelector('.ag-view.on').dataset.view === 'day', 'dois cliques no nome do dia: abre o Dia e não cria bloco por engano');
    // Dia: um clique continua abrindo; o 2º clique do clique duplo não fecha mais a janela (antes ela abria e fechava)
    const tl = $('ag-timeline');
    ck(tl, 1, 0);
    ok(visible('modal-task'), 'Dia: um clique no horário vazio continua abrindo o "Novo bloco"');
    md($('modal-task'), 2); ck($('modal-task'), 2); dc($('modal-task'));
    ok(visible('modal-task'), 'e o clique duplo também (a janela não abre e fecha mais)');
    esc(); await sleep(30);
    tl.getBoundingClientRect = () => ({ top: 0, bottom: 4000, left: 0, right: 800, width: 800, height: 4000 });
    md(tl, 1, 0); dc(tl, 0);
    ok(visible('modal-task') && $('f-date').value === D16, 'Dia: o clique duplo sozinho também abre (na hora clicada)');
    esc(); await sleep(30);
    // tarefa na mão: clique duplo não cria nada (o clique é pra colocar a tarefa)
    click(d.querySelector('.ag-view[data-view="week"]')); await sleep(40);
    click($('tab-listas')); await sleep(40);
    click(d.querySelector('#columns [data-hand]')); await sleep(60);
    ok(visible('ag-place') && !!list('2026-11-19'), 'pegou uma tarefa na mão (a Semana mostra onde dá pra colocar)');
    const l19 = list('2026-11-19');
    md(l19, 1); dc(l19);
    ok(!visible('modal-task'), 'com a tarefa na mão, dois cliques na parte vazia não abrem o "Novo bloco"');
    esc(); await sleep(30);
    // janela de confirmação: o 2º clique do clique duplo também não fecha
    click(cards16()[3].querySelector('[data-more]')); click(menu().querySelector('[data-act="delete"]')); await waitFor(() => visible('dialog'));
    md($('dialog'), 2);
    ok(visible('dialog'), 'confirmação aberta: o 2º clique de um clique duplo no fundo não cancela');
    md($('dialog'), 1); await sleep(30);
    ok(!visible('dialog') && !row('blocos', cards16()[3].dataset.block).deleted, 'um clique no fundo cancela (como antes) e nada é apagado');
  }

  console.log('\nO) Texto vira texto:');
  const X = cardsIn('BETA')[0];
  server.patch('tarefas', UID, X, { title: '<img src=x onerror="window.__xss=1">Nome' }); await settle();
  click(d.querySelector(`.card[data-id="${X}"] [data-more]`)); click(menu().querySelector('[data-act="delete"]')); await dlgOk();
  await waitFor(() => row('tarefas', X).deleted === true); await settle();
  ok(!w.__xss && !$('undo-pill').querySelector('img') && !$('btn-undo').querySelector('img'), 'o aviso e o botão não montam HTML com o nome da tarefa');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  try { w.close(); } catch (e) {}
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
