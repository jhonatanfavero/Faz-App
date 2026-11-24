// V40.43.0 — "Soltar aqui" / "Colocar às" / "Soltar às" PELOS PERÍODOS (escolha dele: "Pelos Períodos").
// Pedido (24/11): com o cartão na mão, o campo de soltar ia tudo pros primeiros horários do espaço livre. Agora cada
// espaço livre se divide nos Períodos da pessoa (Manhã, Meio-dia, Tarde, Noite, os que ela criou), cada parte com a cor
// da parte do dia; tocar/clicar numa parte põe no 1º horário livre DELA. Fora de período: parte cinza ("Livre").
// A) A regra (FazSyncCore.periodSlots e periodBand, a mesma no celular e no PC).
// B) Celular: o campo dividido (1 dia), a parte de agora (hoje), a parte onde não cabe, o toque fora das partes (o de
//    sempre), a faixa do vago oculto, 2 dias lado a lado, sem períodos (o campo de sempre) e nome com HTML.
// C) PC: Semana com a tarefa na mão (um "Colocar às" por período, com a cor; hoje a partir de agora), arrastar um bloco
//    (um "Soltar às" por período) e a visão Dia com os vagos compactados (as partes dentro da faixa).
// Uso: TZ='America/Sao_Paulo' node test_soltar_periodos.js <repo> <dados-ficticios.json>
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
const UID = '78787878-7878-7878-7878-787878787878', EMAIL = 'per2@t.com';
const J = (v) => JSON.stringify(v);
const P = (id, name, start, end) => ({ id, name, start, end });
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const show = (l) => l.map((s) => (s.name || '·') + ' ' + hhmm(s.a) + '-' + hhmm(s.b) + (s.band ? ' ' + s.band : '')).join(' | ');

(async () => {
  // ======================================================================================================
  console.log('A) A regra: o espaço livre dividido pelos períodos:');
  {
    const S = CORE.periodSlots, D = CORE.DEFAULT_PERIODS;
    let r = S(420, 1440, D);
    ok(show(r) === '· 07:00-08:00 | Manhã 08:00-12:00 manha | Meio-dia 12:00-13:00 meiodia | Tarde 13:00-18:00 tarde | Noite 18:00-22:00 noite | · 22:00-24:00',
      'dia livre com os 4 padrão: ' + show(r));
    ok(J(r.map((s) => s.id)) === J(['', 'p1', 'p2', 'p3', 'p4', '']), 'cada parte sabe de qual período é (id); fora de período, sem id');
    r = S(560, 610, D);
    ok(show(r) === 'Manhã 09:20-10:10 manha', 'espaço dentro de um período só: uma parte (' + show(r) + ')');
    r = S(700, 800, D);
    ok(show(r) === 'Manhã 11:40-12:00 manha | Meio-dia 12:00-13:00 meiodia | Tarde 13:00-13:20 tarde', 'espaço que pega 3 períodos: corta nas bordas deles (' + show(r) + ')');
    ok(show(S(600, 700, [])) === '· 10:00-11:40' && show(S(600, 700, null)) === '· 10:00-11:40' && show(S(600, 700, 'x')) === '· 10:00-11:40', 'sem períodos (lista vazia ou estragada): uma parte só, sem nome (o campo de sempre)');
    const plantao = [P('a', 'Plantão', '22:00', '06:00')];
    r = S(0, 1440, plantao);
    ok(show(r) === 'Plantão 00:00-06:00 madrugada | · 06:00-22:00 | Plantão 22:00-24:00 madrugada', 'período que vira a noite (22:00 às 06:00): as duas pontas do dia, cor da madrugada (' + show(r) + ')');
    const foco = [P('c', 'Manhã', '06:00', '12:00'), P('b', 'Foco', '09:00', '11:00')];
    r = S(420, 720, foco);
    ok(show(r) === 'Manhã 07:00-09:00 manha | Foco 09:00-11:00 manha | Manhã 11:00-12:00 manha', 'período dentro de outro: vale o mais curto (Foco no meio da Manhã)');
    r = S(360, 780, [P('c', 'Manhã', '06:00', '12:00'), P('l', 'Longo', '08:00', '20:00')]);
    ok(show(r) === 'Manhã 06:00-12:00 manha | Longo 12:00-13:00 tarde', 'a borda de um período que não ganha não corta a parte: Manhã 06:00-12:00 inteira (' + show(r) + ')');
    r = S(600, 660, [P('x', 'Primeiro', '10:00', '11:00'), P('y', 'Segundo', '10:00', '11:00')]);
    ok(show(r) === 'Primeiro 10:00-11:00 manha', 'dois períodos iguais: vale o primeiro da lista');
    const bands = [['Madrugada', '00:00', '06:00'], ['Cedo', '05:00', '08:00'], ['Almoço', '11:30', '13:30'], ['Tarde', '12:00', '18:00'], ['Noite', '18:00', '23:59'], ['Café', '06:00', '06:30']]
      .map(([n, s, e], i) => S(0, 1440, [P('p' + i, n, s, e)]).filter((x) => x.name)[0].band);
    ok(J(bands) === J(['madrugada', 'manha', 'meiodia', 'tarde', 'noite', 'manha']), 'a cor vai pela hora do meio do período: ' + bands.join(', '));
    const B = CORE.periodBand;
    ok(J([0, 359, 360, 719, 720, 779, 780, 1079, 1080, 1439].map(B)) === J(['madrugada', 'madrugada', 'manha', 'manha', 'meiodia', 'meiodia', 'tarde', 'tarde', 'noite', 'noite']),
      'as faixas: madrugada até 06:00, manhã até 12:00, meio-dia até 13:00, tarde até 18:00, noite depois');
    ok(J(S(600, 500, D)) === '[]' && J(S(-50, 30, [])) === J([{ a: 0, b: 30, id: '', name: '', band: '' }]) && J(S(1400, 9999, [])) === J([{ a: 1400, b: 1440, id: '', name: '', band: '' }]),
      'fim antes do começo: nada; fora do dia: fica dentro de 00:00 a 24:00');
    ok(show(S(420, 1440, [P('a', 'Zero', '10:00', '10:00'), P('b', 'Ruim', '25:00', '26:00'), { id: 'c', name: '', start: '08:00', end: '09:00' }])) === '· 07:00-24:00',
      'período de duração zero, com hora inválida ou sem nome não divide nada');
  }

  // ======================================================================================================
  console.log('\nB) Celular: com a tarefa na mão, o espaço livre dividido pelos períodos:');
  const A = await bootPhone(REPO, backup.data), { w, server, $ } = A;
  const LS = A.L, ev = (x) => w.eval(x), d = w.document;
  const toasts = () => ev('window.__toasts || []');
  const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
  const zones = () => [...d.querySelectorAll('#blocks-container .tl-pz')];
  const zinfo = () => zones().map((z) => z.dataset.perName + ' ' + (z.dataset.perStart ? hhmm(+z.dataset.perStart) : '-') + ' ' + [...z.classList].filter((c) => c !== 'tl-pz').join('.'));
  const day = (ds) => JSON.parse(ev(`JSON.stringify(db.filter((b) => b.date === '${ds}').map((b) => [b.title, b.startMin, b.duration]).sort((a, b) => a[1] - b[1]))`));
  const hand = (date) => { ev(`activeDateObj = new Date(${date}); renderTimeline();`); const id = ev('backlogDb[0].id'), t = ev('backlogDb[0].title'); ev(`scheduleBacklogItem('${id}')`); return { id, t, du: ev('pendingIntent.duration') }; };
  ok(J(JSON.parse(ev('JSON.stringify(periodsDb)')).map((p) => p.name)) === J(['Madrugada', 'Manhã', 'Tarde', 'Noite']) && ev('START_HOUR') === 7 && ev('END_HOUR') === 24,
    'os períodos dos dados de teste (Madrugada, Manhã 06:00-12:00, Tarde 12:00-18:00, Noite 18:00-23:59), dia das 07:00 às 24:00');

  // B1) dia livre
  let T = hand('2026, 10, 25');
  ok(J(zinfo()) === J(['Manhã 07:00 per-manha', 'Tarde 12:00 per-tarde', 'Noite 18:00 per-noite']), 'dia livre (25/11): ' + zinfo().join(' | '));
  const z = zones(), box = z[0].parentElement;
  ok(box.classList.contains('tl-pz-box') && box.classList.contains('block-item') && z.every((x) => x.parentElement === box), 'as partes ficam dentro do campo de sempre (que continua com o toque dele)');
  ok(z[0].style.top === '0px' && z[1].style.top === ev('tlY(720) - tlY(420)') + 'px' && z[2].style.top === ev('tlY(1080) - tlY(420)') + 'px' && z[1].style.height === (ev('tlY(1080) - tlY(720)') - 2) + 'px',
    'cada parte no lugar dela na régua (Tarde começa no 12:00 e vai até o 18:00)');
  ok(z[1].getAttribute('role') === 'button' && z[1].getAttribute('aria-label') === 'Soltar às 12:00 (Tarde)' && z[1].textContent.replace(/\s+/g, ' ').trim() === 'Tarde · 12:00',
    'a parte diz o nome e a hora ("' + z[1].textContent.replace(/\s+/g, ' ').trim() + '"; leitor de tela: "' + z[1].getAttribute('aria-label') + '")');
  z[1].click();
  ok(J(day('2026-11-25')) === J([[T.t, 720, T.du]]) && ev('pendingIntent') === null && !ev(`backlogDb.some((i) => i.id === '${T.id}')`) && !zones().length,
    'tocar na Tarde: a tarefa entra às 12:00 (o 1º horário livre da Tarde), sai da Lista e as partes somem');

  // B2) hoje (15/11 às 21:00): a parte de agora começa agora; a que já passou fica apagadinha
  T = hand('2026, 10, 15');
  const now5 = ev('Math.ceil(currentRealMins / 5) * 5');
  ok(J(zinfo()) === J(['Tarde 17:15 per-tarde.past', 'Noite ' + hhmm(now5) + ' per-noite']), 'hoje: ' + zinfo().join(' | ') + ' (a Tarde já passou: fica apagada, mas vale)');
  zones()[1].click();
  ok(day('2026-11-15').some((b) => b[0] === T.t && b[1] === now5 && b[2] === T.du) && ev('pendingIntent') === null, 'tocar na Noite: entra às ' + hhmm(now5) + ' (agora), não às 18:00');

  // B3) parte onde a tarefa não cabe
  ev(`[[420, 290], [760, 680]].forEach(([s, du], i) => db.push({ id: 'f_per_' + i, type: 'focus', title: 'Ocupado ' + i, startMin: s, duration: du, date: '2026-11-26', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false })); saveDb();`);
  T = hand('2026, 10, 26');
  ev('changeFloatDuration(45)');
  ok(J(zinfo()) === J(['Manhã 11:50 per-manha', 'Tarde - per-tarde.nao']), 'espaço 11:50–12:40 com 45 min na mão: ' + zinfo().join(' | ') + ' (da Tarde em diante não cabe)');
  ok(/não cabe/.test(zones()[1].textContent) && zones()[1].getAttribute('aria-label') === 'Tarde: não cabe', 'a parte onde não cabe avisa ("' + zones()[1].textContent.replace(/\s+/g, ' ').trim() + '")');
  zones()[1].click();
  ok(lastToast() === 'Não cabe nesse período: toque em outro 👇' && ev('pendingIntent && pendingIntent.title') === T.t && day('2026-11-26').length === 2, 'tocar nela: avisa e a tarefa continua na mão ("' + lastToast() + '")');
  ev('tlCompact = true; renderTimeline();');
  const chips = () => [...d.querySelectorAll('#blocks-container .tl-pchip')].map((c) => c.dataset.perName + ' ' + hhmm(+c.dataset.perStart) + ' ' + [...c.classList].filter((x) => /^per-/.test(x)).join());
  ok(J(chips()) === J(['Manhã 11:50 per-manha']), 'com os vagos ocultos, a faixa só mostra a parte onde cabe: ' + chips().join(' | '));
  ev('tlCompact = false; renderTimeline();');
  zones()[0].click();
  ok(J(day('2026-11-26')) === J([['Ocupado 0', 420, 290], [T.t, 710, 45], ['Ocupado 1', 760, 680]]), 'tocar na Manhã: entra às 11:50 com 45 min (cabe antes do bloco das 12:40)');

  // B4) tocar no campo fora das partes: o de sempre (o começo do espaço)
  T = hand('2026, 10, 27');
  zones()[0].parentElement.click();
  ok(J(day('2026-11-27')) === J([[T.t, 420, T.du]]), 'tocar no campo fora das partes (no vãozinho entre elas): o de sempre, no começo do espaço (07:00)');

  // B5) vago oculto: a faixa de 36 px vira uma parte por período
  ev('tlCompact = true;');
  T = hand('2026, 10, 28');
  const strip = d.querySelector('#blocks-container .tl-pz-strip');
  ok(!!strip && J(chips()) === J(['Manhã 07:00 per-manha', 'Tarde 12:00 per-tarde', 'Noite 18:00 per-noite']), 'vagos ocultos: a faixa do dia livre tem as partes lado a lado: ' + chips().join(' | '));
  ok(strip.querySelector('.sr-only').textContent === 'Soltar aqui · 07:00–24:00' && [...strip.querySelectorAll('.tl-pchip')].every((c) => c.tagName === 'BUTTON' && /^Soltar às \d\d:\d\d \(/.test(c.title)),
    'o leitor de tela continua ouvindo "Soltar aqui · 07:00–24:00"; cada parte é um botão ("' + strip.querySelector('.tl-pchip').title + '")');
  strip.querySelectorAll('.tl-pchip')[2].click();
  ok(J(day('2026-11-28')) === J([[T.t, 1080, T.du]]) && ev('pendingIntent') === null, 'tocar na Noite da faixa: entra às 18:00');
  ev('tlCompact = false;');

  // B6) 2 dias lado a lado: partes em cada coluna
  ev('activeDateObj = new Date(2026, 10, 29); setTlDays(2);');
  T = hand('2026, 10, 29');
  const mini = (ds) => [...d.querySelectorAll(`.tl-col[data-date="${ds}"] .tl-pz.mini`)].map((x) => x.dataset.perName + ' ' + hhmm(+x.dataset.perStart));
  ok(ev('tlDays') === 2 && J(mini('2026-11-29')) === J(['Manhã 07:00', 'Tarde 12:00', 'Noite 18:00']) && J(mini('2026-11-30')) === J(mini('2026-11-29')), '2 dias: cada coluna com as suas partes (' + mini('2026-11-30').join(', ') + ')');
  d.querySelector('.tl-col[data-date="2026-11-30"] .tl-pz[data-per-name="Tarde"]').click();
  ok(J(day('2026-11-30')) === J([[T.t, 720, T.du]]) && !day('2026-11-29').length && ev('tlDays') === 2, 'tocar na Tarde do 2º dia: entra no dia 30 às 12:00 (e a agenda continua com 2 dias)');
  ev('setTlDays(1);');

  // B7) sem períodos: o campo de sempre
  ev('window.__per = periodsDb; periodsDb = [];');
  T = hand('2026, 11, 1');
  const gapEl = d.querySelector('#blocks-container .animate-pulse-drop');
  ok(!zones().length && !!gapEl && /Soltar Aqui/i.test(gapEl.textContent), 'sem nenhum período: o campo "Soltar aqui" de sempre, inteiro');
  gapEl.click();
  ok(J(day('2026-12-01')) === J([[T.t, 420, T.du]]), 'e tocar nele põe no começo, como antes');

  // B8) nome com HTML e o "Livre" (fora de período, até num espaço todo fora deles)
  ev(`periodsDb = [{ id: 'px', name: '<img src=x onerror="window.__pwn=1">Foco', start: '09:00', end: '10:00' }];
      db.push({ id: 'f_per_9', type: 'focus', title: 'Café', startMin: 480, duration: 60, date: '2026-12-02', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false }); saveDb();`);
  T = hand('2026, 11, 2');
  ok(J(zinfo()) === J(['Livre 07:00 per-livre', '<img src=x onerror="window.__pwn=1">Foco 09:00 per-manha', 'Livre 10:00 per-livre']),
    'fora de período, parte cinza "Livre" (o espaço 07:00–08:00, todo fora, também: não volta pro campo de antes): ' + zinfo().length + ' partes');
  ok(!d.querySelector('#blocks-container img') && zones()[1].querySelector('b').textContent === '<img src=x onerror="window.__pwn=1">Foco' && !ev('window.__pwn'), 'nome de período com HTML aparece como texto (não vira imagem nem roda nada)');
  ev('cancelPendingTask(); periodsDb = window.__per; renderTimeline();');
  ok(A.errors.length === 0, 'nenhum erro no celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));

  // ======================================================================================================
  console.log('\nC) PC: Semana, arrastar e visão Dia pelos períodos:');
  server.addUser(EMAIL, 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!LS('tb__sync'), 20000);
  await waitFor(() => server.users.get(EMAIL).meta.faz_periods_at, 9000);
  ok(J((server.users.get(EMAIL).meta.faz_periods || []).map((p) => p.name)) === J(['Madrugada', 'Manhã', 'Tarde', 'Noite']), 'o celular levou os períodos pra conta');
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
  const dt = { setData() {}, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el) => { const e = new pw.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientY', { value: 10 }); el.dispatchEvent(e); };
  const cloud = (ds) => server.alive('blocos', UID).filter((b) => b.date === ds && !b.archived).sort((a, b) => a.start_min - b.start_min);
  const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const gapsIn = (ds, sel) => [...pd.querySelectorAll(`#ag-cols .ag-list[data-day="${ds}"] ${sel}`)].map((g) => txt(g) + ' [' + ([...g.classList].filter((c) => /^per-/.test(c)).join() || '-') + ']');
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  await waitFor(() => cloud('2026-11-16').length >= 12, 8000);

  // C1) Semana com a tarefa na mão
  const handBtn = pd.querySelector('[data-hand]'), handId = handBtn.dataset.hand;
  click(handBtn);
  await waitFor(() => pd.querySelector('#ag-cols .ag-gap'), 4000);
  ok(J(gapsIn('2026-11-18', '.ag-gap')) === J(['Colocar às 07:00 Manhã [per-manha]', 'Colocar às 12:00 Tarde [per-tarde]', 'Colocar às 18:00 Noite [per-noite]']),
    'dia livre (18/11): ' + gapsIn('2026-11-18', '.ag-gap').join(' | '));
  ok(J(gapsIn('2026-11-16', '.ag-gap')) === J(['Colocar às 10:20 Manhã (primeiro livre) [per-manha]', 'Colocar às 10:20 Manhã [per-manha]', 'Colocar às 12:00 Tarde [per-tarde]', 'Colocar às 18:00 Noite [per-noite]']),
    'hoje (16/11, 10:20, manhã cheia até 10:00): ' + gapsIn('2026-11-16', '.ag-gap').join(' | '));
  const g18 = [...pd.querySelectorAll('#ag-cols .ag-list[data-day="2026-11-18"] .ag-gap')];
  ok(g18.every((g) => g.classList.contains('per') && g.querySelector('.ag-per') && g.dataset.perName === g.querySelector('.ag-per').textContent) && g18[1].dataset.gapStart === '720',
    'cada botão com a etiqueta do período e o horário dele (data-gap-start)');
  click(g18[1]);
  await waitFor(() => cloud('2026-11-18').length === 1 && /18\/11/.test(Q('toast').textContent), 6000);
  await waitFor(() => !server.alive('tarefas', UID).some((t) => t.id === handId), 6000);
  const placed = cloud('2026-11-18')[0];
  ok(placed && placed.start_min === 720 && !pd.querySelector('#ag-cols .ag-gap') && /18\/11 às 12:00/.test(Q('toast').textContent), 'clicar em "Colocar às 12:00 Tarde": foi pra nuvem às 12:00 ("' + Q('toast').textContent + '")');
  ok(!server.alive('tarefas', UID).some((t) => t.id === handId), 'e a tarefa saiu da lista');

  // C2) arrastar um bloco na Semana: um "Soltar às" por período
  await waitFor(() => pd.querySelector(`#ag-cols [data-block="${placed.id}"]`), 4000);
  dragEv('dragstart', pd.querySelector(`#ag-cols [data-block="${placed.id}"]`)); await sleep(60);
  ok(J(gapsIn('2026-11-19', '.ag-drop')) === J(['Soltar às 07:00 Manhã [per-manha]', 'Soltar às 12:00 Tarde [per-tarde]', 'Soltar às 18:00 Noite [per-noite]']), 'arrastando, outro dia (19/11): ' + gapsIn('2026-11-19', '.ag-drop').join(' | '));
  ok(J(gapsIn('2026-11-18', '.ag-drop')) === J(['Soltar às 07:00 Manhã [per-manha]', 'Soltar às 18:00 Noite [per-noite]']), 'no próprio dia, o lugar onde ele já está (12:00) não vira opção: ' + gapsIn('2026-11-18', '.ag-drop').join(' | '));
  ok(J(gapsIn('2026-11-16', '.ag-drop')) === J(['Soltar às 10:20 Manhã (primeiro livre) [per-manha]', 'Soltar às 10:00 Manhã [per-manha]', 'Soltar às 10:20 Manhã [per-manha]', 'Soltar às 12:00 Tarde [per-tarde]', 'Soltar às 18:00 Noite [per-noite]']),
    'hoje: também a parte de antes de agora (10:00), além de agora (10:20)');
  const noite19 = pd.querySelector('#ag-cols .ag-list[data-day="2026-11-19"] .ag-drop[data-per-name="Noite"]');
  dragEv('dragover', noite19);
  ok(noite19.classList.contains('over') && noite19.classList.contains('per-noite'), 'em cima da Noite, ela acende (na cor dela)');
  dragEv('drop', noite19);
  await waitFor(() => server.get('blocos', UID, placed.id).date === '2026-11-19', 6000);
  const moved = server.get('blocos', UID, placed.id);
  ok(moved.date === '2026-11-19' && moved.start_min === 1080 && !pd.querySelector('#ag-cols .ag-drop'), 'soltou na Noite de 19/11: foi pras 18:00 de lá');

  // C3) visão Dia com os vagos compactados: as partes dentro da faixa
  click(pd.querySelector('[data-hand]'));
  await waitFor(() => pd.querySelector('#ag-cols .ag-gap'), 4000);
  click(pd.querySelector('#ag-cols .ag-day-btn[data-day="2026-11-20"]')); await sleep(60);
  if (Q('ag-compact').getAttribute('aria-pressed') !== 'true') click(Q('ag-compact'));
  await waitFor(() => pd.querySelector('#ag-timeline .ag-cgap'), 3000);
  const pchips = () => [...pd.querySelectorAll('#ag-timeline .ag-pchip')].map((c) => c.dataset.perName + ' ' + hhmm(+c.dataset.cgap) + ' ' + [...c.classList].filter((x) => /^per-/.test(x)).join());
  const band = pd.querySelector('#ag-timeline .ag-cgap');
  ok(J(pchips()) === J(['Manhã 07:00 per-manha', 'Tarde 12:00 per-tarde', 'Noite 18:00 per-noite']) && band.classList.contains('has-per') && band.contains(pd.querySelector('.ag-pchip')),
    'Dia livre compactado (20/11): a faixa tem as partes: ' + pchips().join(' | '));
  click(pd.querySelector('#ag-timeline .ag-pchip[data-per-name="Noite"]'));
  await waitFor(() => cloud('2026-11-20').length === 1, 6000);
  ok(cloud('2026-11-20')[0] && cloud('2026-11-20')[0].start_min === 1080, 'clicar na Noite da faixa: às 18:00');
  click(pd.querySelector('[data-hand]'));
  await waitFor(() => pd.querySelector('#ag-cols .ag-gap'), 4000);
  click(pd.querySelector('#ag-cols .ag-day-btn[data-day="2026-11-21"]')); await sleep(60);
  await waitFor(() => pd.querySelector('#ag-timeline .ag-cgap.has-per'), 3000);
  click(pd.querySelector('#ag-timeline .ag-cgap'));
  await waitFor(() => cloud('2026-11-21').length === 1, 6000);
  ok(cloud('2026-11-21')[0] && cloud('2026-11-21')[0].start_min === 420, 'clicar na faixa fora das partes: o de sempre (o começo, 07:00)');
  ok(!pd.querySelector('#ag-timeline .ag-pchip'), 'sem a tarefa na mão, a faixa volta a ser só o horário livre');
  click(Q('ag-compact'));
  ok(errors.length === 0, 'nenhum erro na tela do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  pw.close();

  ok(A.errors.length === 0, 'nenhum erro no celular (com a sincronização)' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
