// V40.44.0 — "BLOCOS DE BAIXO ABREM ESPAÇO SOZINHOS". Escolhas dele em 24/11: "Soltar e esticar" (a tarefa na mão
// entre blocos colados, num vago curto ou numa parte que não comporta; e esticar a duração de um bloco) e "Só o
// necessário" (desce só a fila de blocos encostados; um vago que caiba segura o empurrão). Arrastar um bloco pra cima
// de outro continua dando "Conflito".
// A) A regra (FazSyncCore.pushPlan e pushRoom, a mesma no celular e no PC).
// B) Celular: o "↓" nas emendas, a parte que encaixa descendo, o toque, um passo do Desfazer, o fim do dia, hoje só
//    daqui pra frente, a faixa do vago oculto, 2 dias lado a lado e esticar (com a prévia e o máximo).
// C) PC: "Encaixar às" na Semana, o "↓" e o clique num vago curto na visão Dia, esticar no Dia e na Semana, Ctrl+Z.
// Uso: TZ='America/Sao_Paulo' node test_empurrar.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const bootPhone = require('./boot_app');
const { makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '79797979-7979-7979-7979-797979797979', EMAIL = 'empurra@t.com';
const J = (v) => JSON.stringify(v);
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const R = (id, start, dur) => ({ id, start, dur });

(async () => {
  // ======================================================================================================
  console.log('A) A regra: descer só o necessário:');
  {
    const P = CORE.pushPlan, room = CORE.pushRoom;
    const day = [R('a', 480, 60), R('b', 540, 30), R('c', 570, 30), R('d', 620, 40), R('e', 690, 30)];
    ok(J(P(day, 570, 600, 1440)) === J({ moves: [{ id: 'c', from: 570, to: 600 }, { id: 'd', from: 620, to: 630 }], end: 670 }),
      'encaixar 30 min às 09:30 (entre B e C, colados): C desce 30, D desce só 10 (o vago de 20 min ajuda) e E não mexe (o vago de 11:10 a 11:30 segura)');
    ok(J(P(day, 540, 570, 1440).moves.map((m) => m.id + '→' + hhmm(m.to))) === J(['b→09:30', 'c→10:00', 'd→10:30']), 'às 09:00: B, C e D descem; E fica');
    ok(J(P(day, 600, 630, 1440)) === J({ moves: [{ id: 'd', from: 620, to: 630 }], end: 670 }), 'no vago curto (10:00, 20 min pra 30): só D desce 10 min');
    ok(J(P(day, 660, 690, 1440)) === J({ moves: [], end: 690 }), 'onde já cabe: ninguém desce');
    ok(P(day, 585, 615, 1440) === null, 'no meio de um bloco (C vai de 09:30 a 10:00): não dá pra empurrar ele pra cima → null');
    ok(P(day, 540, 570, 660) === null && J(P(day, 540, 570, 720)) === J(P(day, 540, 570, 1440)), 'D passaria do fim do dia (11:00 nesse caso: ele iria até 11:10): null; com o fim às 12:00, cabe');
    ok(J(P([], 600, 660, 1440)) === J({ moves: [], end: 660 }) && P([], 1400, 1450, 1440) === null && P(day, 600, 600, 1440) === null && P(day, 'x', 600, 1440) === null,
      'dia vazio: cabe; a própria tarefa passando do fim, tamanho zero ou hora inválida: null');
    ok(J(P([R('z', 600, 30), { id: 'lixo' }, R('y', 540, 0), null], 600, 620, 1440).moves) === J([{ id: 'z', from: 600, to: 620 }]), 'linha estragada (sem horário ou com 0 min) é ignorada');
    ok(room(day, 600, 1440) === 1440 - 70 && room(day, 570, 1440) === 1440 - 100 && room(day, 585, 1440) === null && room([], 600, 1440) === 1440,
      'o máximo pra esticar: o fim do dia menos os blocos de baixo (todos encostados no fim); bloco atravessando: null');
    const full = P(day, 570, room(day, 570, 1440), 1440);
    ok(full && full.end === 1440 && full.moves.length === 3 && P(day, 570, room(day, 570, 1440) + 5, 1440) === null, 'esticar até o máximo deixa os de baixo encostados no fim (24:00); 5 min a mais não cabe');
  }

  // ======================================================================================================
  console.log('\nB) Celular:');
  const A = await bootPhone(REPO, backup.data), { w, server, $ } = A;
  const LS = A.L, ev = (x) => w.eval(x), d = w.document;
  const D1 = '2026-12-10', D2 = '2026-12-11', D3 = '2026-12-12', TODAY = '2026-11-15';
  const mk = (ds, list) => ev(`${J(list)}.forEach(([id, s, du]) => db.push({ id, type: 'focus', title: id.toUpperCase().replace('F_', ''), startMin: s, duration: du, date: '${ds}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false })); saveDb();`);
  mk(D1, [['f_a', 480, 60], ['f_b', 540, 30], ['f_c', 570, 30], ['f_d', 620, 40], ['f_e', 690, 30]]);
  const day = (ds) => JSON.parse(ev(`JSON.stringify(db.filter((b) => b.date === '${ds}').sort((a, b) => a.startMin - b.startMin).map((b) => b.title + ' ' + b.startMin + '+' + b.duration))`));
  const undoMsg = () => $('undo-bar-msg').textContent;
  const hand = async (date, dur) => {
    ev(`activeDateObj = new Date(${date}); renderTimeline();`);
    const id = ev('backlogDb[0].id'), t = ev('backlogDb[0].title');
    ev(`scheduleBacklogItem('${id}')`);
    if (dur) ev(`changeFloatDuration(${dur})`);
    await sleep(20);
    return { id, t };
  };
  const pills = (root) => [...(root || d).querySelectorAll('#blocks-container .tl-push')].map((p) => p.textContent.trim() + ' n=' + p.dataset.push);
  const zinfo = () => [...d.querySelectorAll('#blocks-container .tl-pz')].map((z) => z.dataset.perName + ' ' + (z.dataset.perStart ? hhmm(+z.dataset.perStart) : '-') + (z.classList.contains('push') ? ' push n=' + z.dataset.push : z.classList.contains('nao') ? ' nao' : ''));
  const orig = J(day(D1));

  // B1) as emendas e a parte que encaixa descendo
  let T = await hand('2026, 11, 10', 30);
  ok(J(pills()) === J(['09:00 n=3', '09:30 n=2']), 'tarefa de 30 min na mão: "↓" nas emendas de B e C (os colados): ' + pills().join(' | '));
  ok(J(zinfo()) === J(['Manhã 07:00', 'Manhã 10:00 push n=1', 'Manhã 11:00', 'Tarde 12:00', 'Noite 18:00']), 'o vago curto (10:00–10:20) vira parte que encaixa descendo 1; os outros, como antes: ' + zinfo().join(' | '));
  const p1 = d.querySelector('#blocks-container .tl-push[data-push-start="570"]');
  ok(p1.tagName === 'BUTTON' && p1.getAttribute('aria-label') === 'Encaixar às 09:30, descendo 2 blocos' && p1.style.top === (ev('tlY(570)') - 12) + 'px', 'o "↓ 09:30" fica na emenda (no 09:30 da régua) e diz o que faz: "' + p1.getAttribute('aria-label') + '"');
  ok($('floating-hint').textContent === 'Toque num espaço livre ou num ↓ entre os blocos', 'a dica da mão explica o "↓": "' + $('floating-hint').textContent + '"');
  p1.click(); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+30', T.t + ' 570+30', 'C 600+30', 'D 630+40', 'E 690+30']) && ev('pendingIntent') === null && !ev(`backlogDb.some((i) => i.id === '${T.id}')`),
    'tocou no "↓ 09:30": a tarefa entra às 09:30, C desce pras 10:00, D pras 10:30 e E fica (o vago segura)');
  ok(undoMsg() === 'Encaixada · 2 blocos desceram', 'a barrinha do Desfazer: "' + undoMsg() + '"');
  ev('fazUndo()'); await sleep(30);
  ok(J(day(D1)) === orig && ev(`backlogDb.some((i) => i.id === '${T.id}')`), 'Desfazer: um passo só volta tudo (os blocos e a tarefa pra Lista)');

  T = await hand('2026, 11, 10', 30);
  d.querySelector('#blocks-container .tl-pz.push').click(); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+30', 'C 570+30', T.t + ' 600+30', 'D 630+40', 'E 690+30']) && undoMsg() === 'Encaixada · 1 bloco desceu', 'tocou na parte que encaixa (10:00): só D desce 10 min ("' + undoMsg() + '")');
  ev('fazUndo()'); await sleep(30);
  T = await hand('2026, 11, 10', 30);
  [...d.querySelectorAll('#blocks-container .tl-pz')].find((z) => z.dataset.perStart === '660').click(); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+30', 'C 570+30', 'D 620+40', T.t + ' 660+30', 'E 690+30']), 'onde cabe (11:00), ninguém mexe, como sempre');
  ev('fazUndo()'); await sleep(30);
  ok(J(day(D1)) === orig, 'e o Desfazer volta');

  // B2) o fim do dia: não empurra pra fora
  mk(D2, [['f_x', 1260, 45], ['f_y', 1320, 60], ['f_z', 1380, 60]]);
  T = await hand('2026, 11, 11', 30);
  const shortGap = [...d.querySelectorAll('#blocks-container .block-item')].find((e) => e.dataset.blockId === 'e_1305');
  ok(!pills().length && !d.querySelector('#blocks-container .tl-push-box') && shortGap && /Muito Curto/i.test(shortGap.textContent) && !shortGap.querySelector('.tl-pz'),
    'dia que termina cheio (até 24:00): nem "↓" nas emendas nem o vago de 15 min (21:45–22:00) encaixam: passariam do fim do dia');
  ev('cancelPendingTask()');

  // B3) hoje: só daqui pra frente (15/11 às 21:00)
  mk(TODAY, [['f_h1', 1200, 30], ['f_h2', 1230, 60], ['f_h3', 1290, 30]]);
  T = await hand('2026, 10, 15', 30);
  ok(J(pills()) === J(['21:30 n=1']), 'hoje (21:00): a emenda das 20:30 já passou (sem "↓"); a das 21:30, sim: ' + pills().join(' | '));
  ev('cancelPendingTask()');

  // B4) a faixa do vago oculto que não comporta
  mk(D3, [['f_p', 480, 60], ['f_q', 580, 50]]);
  ev('tlCompact = true;');
  T = await hand('2026, 11, 12', 60);
  const chip = d.querySelector('#blocks-container .tl-pz-strip .tl-pchip.push');
  ok(!!chip && chip.dataset.perStart === '540' && chip.dataset.push === '1' && /09:00 ↓/.test(chip.textContent), 'vagos ocultos, 1h na mão e um vago de 40 min: a faixa tem "Manhã 09:00 ↓" (encaixa descendo 1)');
  chip.click(); await sleep(30);
  ok(J(day(D3)) === J(['P 480+60', T.t + ' 540+60', 'Q 600+50']) && undoMsg() === 'Encaixada · 1 bloco desceu', 'tocou: entra às 09:00 e Q desce pras 10:00');
  ev('fazUndo()'); await sleep(30);
  ev('tlCompact = false;');

  // B5) 2 dias lado a lado
  ev(`activeDateObj = new Date(2026, 11, 10); setTlDays(2);`);
  T = await hand('2026, 11, 10', 30);
  const mini = [...d.querySelectorAll(`.tl-col[data-date="${D1}"] .tl-push.mini`)];
  ok(ev('tlDays') === 2 && J(mini.map((p) => p.textContent.trim())) === J(['09:00', '09:30']) && !d.querySelector(`.tl-col[data-date="${D2}"] .tl-push`), '2 dias lado a lado: o "↓" nas emendas da coluna do dia 10 (o 11 termina cheio: nenhum)');
  mini[1].click(); await sleep(30);
  ok(day(D1).includes(T.t + ' 570+30') && day(D1).includes('C 600+30') && ev('tlDays') === 2, 'tocar no "↓ 09:30" da coluna: encaixa no dia 10 e a agenda continua com 2 dias');
  ev('fazUndo()'); await sleep(30);
  ev('setTlDays(1);');

  // B6) esticar
  ev(`activeDateObj = new Date(2026, 11, 10); renderTimeline();`);
  const blk = (id) => d.querySelector(`.block-item[data-block-id="${id}"]`);
  const stretch = (id, dy, end) => {
    const h = blk(id).querySelector('.resize-handle');
    h.dispatchEvent(new w.MouseEvent('mousedown', { clientY: 500, bubbles: true, cancelable: true }));
    d.dispatchEvent(new w.MouseEvent('mousemove', { clientY: 500 + dy, bubbles: true, cancelable: true }));
    if (end) d.dispatchEvent(new w.MouseEvent('mouseup', { clientY: 500 + dy, bubbles: true }));
  };
  stretch('f_b', 90, false);
  ok([...d.querySelectorAll('.block-item.tl-pushed')].map((e) => e.dataset.blockId).sort().join() === 'f_c,f_d' && blk('f_c').style.top === (ev('tlY(600)') + 1) + 'px' && /empurra 2/.test(blk('f_b').textContent),
    'esticando B 30 min: C e D já aparecem embaixo (com contorno) e B diz "empurra 2"');
  ok(/10:00 - 10:30/.test(blk('f_c').querySelector('.time-label').textContent), 'e o horário de C já é o novo (10:00 - 10:30)');
  d.dispatchEvent(new w.MouseEvent('mouseup', { clientY: 590, bubbles: true })); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+60', 'C 600+30', 'D 630+40', 'E 690+30']) && undoMsg() === 'Duração 1h · 2 blocos desceram', 'soltou: B com 1h, C às 10:00, D às 10:30, E não mexe ("' + undoMsg() + '")');
  ev('fazUndo()'); await sleep(30);
  ok(J(day(D1)) === orig, 'Desfazer: um passo só volta B, C e D');
  stretch('f_b', 9000, true); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+800', 'C 1340+30', 'D 1370+40', 'E 1410+30']), 'esticar até não dar mais: B vai até 22:20 e C, D e E ficam encostados no fim do dia (24:00), sem passar');
  ev('fazUndo()'); await sleep(30);
  stretch('f_b', -60, true); await sleep(30);
  ok(J(day(D1)) === J(['A 480+60', 'B 540+10', 'C 570+30', 'D 620+40', 'E 690+30']), 'encolher continua como sempre (ninguém sobe)');
  ev('fazUndo()'); await sleep(30);
  ok(J(day(D1)) === orig && A.errors.length === 0, 'nenhum erro no celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));

  // ======================================================================================================
  console.log('\nC) PC:');
  server.addUser(EMAIL, 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!LS('tb__sync'), 20000);
  await waitFor(() => server.alive('blocos', UID).filter((b) => b.date === D1).length === 5, 9000);
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<script>window.FAZ_SYNC_CORE_ONLY = true;</script>', '')
    .replace('<head>', '<head><script>window.tailwind = {}; window.FAZ_SYNC_CORE_ONLY = true;</script>' + inline);
  server.storedSession = { access_token: 'tok', user: { id: UID, email: EMAIL, user_metadata: JSON.parse(J(server.users.get(EMAIL).meta)) } };
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, base = new RD(2026, 10, 16, 10, 20, 0).getTime(), t0 = RD.now(), now = () => base + (RD.now() - t0);
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.HTMLElement.prototype.scrollIntoView = function () {};
    },
  });
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const mouse = (type, el, y) => el.dispatchEvent(new pw.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: 300, clientY: y }));
  const press = (k, o) => pd.body.dispatchEvent(new pw.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})));
  const cloud = (ds) => server.alive('blocos', UID).filter((b) => b.date === ds && !b.archived).sort((a, b) => a.start_min - b.start_min).map((b) => b.title + ' ' + b.start_min + '+' + b.duration);
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  const T30 = server.alive('tarefas', UID).filter((t) => t.duration === 30).map((t) => t.id)[0], T30b = server.alive('tarefas', UID).filter((t) => t.duration === 30).map((t) => t.id)[1];
  const corig = J(cloud(D1));
  ok(corig === J(['A 480+60', 'B 540+30', 'C 570+30', 'D 620+40', 'E 690+30']), 'o dia 10/12 chegou na nuvem como no celular');

  // C1) Semana com a tarefa na mão
  click(pd.querySelector(`[data-hand="${T30}"]`));
  await waitFor(() => pd.querySelector('#ag-cols .ag-gap'), 4000);
  for (let i = 0; i < 3; i++) { click(Q('ag-next')); await sleep(30); }
  const col = () => [...pd.querySelectorAll(`#ag-cols .ag-list[data-day="${D1}"] .ag-gap`)].map((g) => txt(g) + (g.dataset.push ? ' [' + g.dataset.push + ']' : ''));
  ok(J(col()) === J(['Colocar às 07:00 Manhã', 'Encaixar às 09:00 [3]', 'Encaixar às 09:30 [2]', 'Encaixar às 10:00 Manhã [1]', 'Colocar às 11:00 Manhã', 'Colocar às 12:00 Tarde', 'Colocar às 18:00 Noite']),
    'Semana, 30 min na mão: "Encaixar às" nas emendas e no vago curto (com quantos descem), "Colocar às" onde cabe: ' + col().join(' | '));
  const enc = pd.querySelector(`#ag-cols .ag-list[data-day="${D1}"] .ag-push[data-gap-start="570"]`);
  ok(enc.title === 'Encaixar a tarefa às 09:30: 2 blocos descem' && /arrow-line-down/.test(enc.innerHTML), 'o botão diz quantos descem (no title): "' + enc.title + '"');
  click(enc);
  await waitFor(() => cloud(D1).length === 6 && /desceram/.test(Q('toast').textContent), 6000);
  const tname = server.get('tarefas', UID, T30).title;
  ok(J(cloud(D1)) === J(['A 480+60', 'B 540+30', tname + ' 570+30', 'C 600+30', 'D 630+40', 'E 690+30']), 'clicou: a tarefa entra às 09:30 e C e D descem na nuvem (E fica)');
  ok(/09:30 · 2 blocos desceram/.test(Q('toast').textContent) || /Tarefa encaixada · 2 blocos desceram/.test(pd.body.textContent), 'o aviso diz quantos desceram ("' + txt(Q('toast')) + '")');
  press('z', { ctrlKey: true });
  await waitFor(() => J(cloud(D1)) === corig, 6000);
  ok(J(cloud(D1)) === corig && server.alive('tarefas', UID).some((t) => t.id === T30), 'Ctrl+Z: um passo só volta tudo (os blocos e a tarefa pra lista)');

  // C2) visão Dia: o "↓" e o clique num vago curto
  click(Q('tab-listas')); await sleep(40);
  click(pd.querySelector(`[data-hand="${T30b}"]`));
  await waitFor(() => pd.querySelector('#ag-cols .ag-gap'), 4000);
  if (!pd.querySelector(`#ag-cols .ag-day-btn[data-day="${D1}"]`)) { click(Q('ag-today')); await sleep(30); for (let i = 0; i < 3; i++) { click(Q('ag-next')); await sleep(30); } }
  click(pd.querySelector(`#ag-cols .ag-day-btn[data-day="${D1}"]`)); await sleep(60);
  const pp = [...pd.querySelectorAll('#ag-timeline .ag-push-pill')].map((x) => x.dataset.gapStart + ' [' + x.dataset.push + ']');
  ok(J(pp) === J(['540 [3]', '570 [2]']) && /os blocos de baixo descem/.test(Q('ag-place-hint').textContent), 'visão Dia: "↓ Encaixar às" nas duas emendas; a barra explica: "' + Q('ag-place-hint').textContent + '"');
  const PXM = 3.2, yAt = (min) => (min - 420) * PXM;
  const tl = Q('ag-timeline');
  tl.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true, clientX: 300, clientY: yAt(605) }));
  const tname2 = server.get('tarefas', UID, T30b).title;
  await waitFor(() => cloud(D1).length === 6, 6000);
  ok(J(cloud(D1)) === J(['A 480+60', 'B 540+30', 'C 570+30', tname2 + ' 605+30', 'D 635+40', 'E 690+30']), 'clicou às 10:05 no vago curto: a tarefa entra ali e só D desce (pras 10:35)');
  press('z', { ctrlKey: true });
  await waitFor(() => J(cloud(D1)) === corig, 6000);
  ok(J(cloud(D1)) === corig, 'Ctrl+Z volta');

  // C3) esticar na visão Dia
  if (Q('ag-place') && !Q('ag-place').classList.contains('hidden')) click(Q('ag-place-cancel'));
  click(pd.querySelector('.ag-view[data-view="day"]') || Q('ag-today')); await sleep(30);
  const B = server.alive('blocos', UID).find((b) => b.date === D1 && b.title === 'B');
  let el = [...pd.querySelectorAll('#ag-timeline [data-block]')].find((c) => c.dataset.block === B.id);
  ok(!!el && !!el.querySelector('.ag-rz'), 'visão Dia do 10/12 aberta, com a alça de baixo');
  let y = yAt(570) - 3;
  mouse('mousedown', el.querySelector('.ag-rz'), y); mouse('mousemove', pd, y + 10); mouse('mousemove', pd, y + 30 * PXM);
  el = [...pd.querySelectorAll('#ag-timeline [data-block]')].find((c) => c.dataset.block === B.id);
  const pushedIds = [...pd.querySelectorAll('#ag-timeline .ag-pushed')].map((c) => server.get('blocos', UID, c.dataset.block).title).sort().join();
  ok(pushedIds === 'C,D' && /empurra 2/.test(el.textContent) && el.classList.contains('ag-pushing'), 'esticando B 30 min: C e D com contorno, "empurra 2" no B');
  mouse('mouseup', pd, 0);
  await waitFor(() => J(cloud(D1)) === J(['A 480+60', 'B 540+60', 'C 600+30', 'D 630+40', 'E 690+30']), 6000);
  ok(J(cloud(D1)) === J(['A 480+60', 'B 540+60', 'C 600+30', 'D 630+40', 'E 690+30']) && /2 blocos desceram/.test(Q('toast').textContent), 'soltou: B com 1h e C e D descem na nuvem ("' + txt(Q('toast')) + '")');
  press('z', { ctrlKey: true });
  await waitFor(() => J(cloud(D1)) === corig, 6000);
  ok(J(cloud(D1)) === corig, 'Ctrl+Z: um passo só volta os três');

  // C4) esticar na Semana
  click(pd.querySelector('.ag-view[data-view="week"]')); await sleep(40);
  const C = server.alive('blocos', UID).find((b) => b.date === D1 && b.title === 'C');
  let wc = [...pd.querySelectorAll(`#ag-cols .ag-list[data-day="${D1}"] [data-block]`)].find((c) => c.dataset.block === C.id);
  mouse('mousedown', wc.querySelector('.ag-rz'), 500); mouse('mousemove', pd, 500 + 30 * PXM);
  wc = [...pd.querySelectorAll(`#ag-cols .ag-list[data-day="${D1}"] [data-block]`)].find((c) => c.dataset.block === C.id);
  const D = server.alive('blocos', UID).find((b) => b.date === D1 && b.title === 'D');
  const dc = [...pd.querySelectorAll(`#ag-cols .ag-list[data-day="${D1}"] [data-block]`)].find((c) => c.dataset.block === D.id);
  ok(/empurra 1/.test(txt(wc.querySelector('.ag-tm'))) && dc.classList.contains('ag-pushed') && /^10:30–11:10/.test(txt(dc.querySelector('.ag-tm'))), 'Semana, esticando C 30 min (até 10:30, passando do começo de D): D fica com contorno e o horário novo (10:30–11:10); C diz "empurra 1"');
  mouse('mouseup', pd, 0);
  await waitFor(() => J(cloud(D1)) === J(['A 480+60', 'B 540+30', 'C 570+60', 'D 630+40', 'E 690+30']), 6000);
  ok(J(cloud(D1)) === J(['A 480+60', 'B 540+30', 'C 570+60', 'D 630+40', 'E 690+30']), 'soltou: C com 1h e D desce só 10 (pras 10:30)');
  press('z', { ctrlKey: true });
  await waitFor(() => J(cloud(D1)) === corig, 6000);
  ok(J(cloud(D1)) === corig, 'Ctrl+Z volta');
  ok(errors.length === 0, 'nenhum erro na tela do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  pw.close();

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
