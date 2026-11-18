// V40.32.0 — Configurações no PC: cor do app e horário do dia, nos 2 sentidos (celular ↔ PC).
// Vão na conta (user_metadata): faz_theme, faz_hours e faz_prefs_at (quando mudou). Ganha a mudança mais nova.
// Parte 1: as regras (CORE.prefsPlan). Parte 2: o celular (sobe, recebe, não volta pra trás, aparelho novo).
// Parte 3: a tela do PC (janela Configurações, grava na conta, sem internet volta, recebe do celular).
// Uso: TZ='America/Sao_Paulo' node test_preferencias.js <repo> <dados-ficticios.json>
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
const UID = '11111111-1111-1111-1111-111111111111', EMAIL = 'j@t.com';
const J = (v) => JSON.stringify(v);

(async () => {
  // ======================================================================================================
  console.log('A) As regras (quem ganha):');
  {
    const P = CORE.prefsPlan, L = (theme, hours, at) => ({ theme, hours, at });
    let p = P(L('#10b981', [7, 24], 0), { faz_theme: '#10b981', faz_hours: [7, 24] }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 1000 }) && p.at === 1000, 'iguais, conta de antes desta versão (sem a hora): carimba a hora na conta');
    p = P(L('#10b981', [7, 24], 0), { faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 500 }, 1000);
    ok(!p.apply && !p.push && p.at === 500, 'iguais, conta com hora: só guarda a hora no aparelho');
    p = P(L('#10b981', [7, 24], 500), { faz_theme: '#10B981', faz_hours: [7, 24], faz_prefs_at: 500 }, 1000);
    ok(!p.apply && !p.push && p.at === 0, 'iguais (maiúscula ou minúscula tanto faz) e a mesma hora: nada a fazer');
    p = P(L('#10b981', [7, 24], 500), { faz_theme: '#ef4444', faz_hours: [6, 22], faz_prefs_at: 900 }, 1000);
    ok(J(p.apply) === J({ theme: '#ef4444', hours: [6, 22] }) && !p.push && p.at === 900, 'mudou depois na conta (no PC): a cor e o horário vêm pro aparelho');
    p = P(L('#10b981', [7, 24], 900), { faz_theme: '#ef4444', faz_hours: [7, 24], faz_prefs_at: 500 }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 900 }) && p.at === 900, 'mudou aqui por último: vai pra conta com a hora da mudança');
    p = P(L('#10b981', [7, 24], 0), { faz_theme: '#ef4444', faz_hours: [7, 24] }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 1000 }), 'conta e aparelho de antes desta versão: vale o aparelho (como sempre foi)');
    p = P(L('#10b981', [7, 24], 500), { faz_theme: '#ef4444', faz_hours: [7, 24], faz_prefs_at: 500 }, 100);
    ok(J(p.push) === J({ faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 501 }) && p.at === 501, 'mudou aqui sem marcar a hora e o relógio daqui está atrasado: vai pra conta com uma hora ainda mais nova que a de lá');
    p = P(L('#10b981', [7, 24], 0), { faz_theme: '#ef4444', faz_hours: [5, 23], faz_prefs_at: 300 }, 1000);
    ok(J(p.apply) === J({ theme: '#ef4444', hours: [5, 23] }) && !p.push, 'aparelho novo (nunca mudou nada) e conta com hora: pega o da conta');
    p = P(L('#10b981', [7, 24], 500), { faz_theme: '#ef4444', faz_prefs_at: 900 }, 1000);
    ok(J(p.apply) === J({ theme: '#ef4444' }) && J(p.push) === J({ faz_theme: '#ef4444', faz_hours: [7, 24], faz_prefs_at: 900 }), 'conta sem o horário: vem a cor e o horário daqui completa a conta');
    p = P(L('#10b981', [7, 24], 500), { faz_theme: 'azul', faz_hours: [30, 2], faz_prefs_at: 900 }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_theme: '#10b981', faz_hours: [7, 24], faz_prefs_at: 900 }), 'conta com cor e horário estragados: nada estragado entra no aparelho (o daqui conserta a conta)');
    ok(J(CORE.prefHours([6.5, 22.2])) === '[6,23]' && CORE.prefHours([8, 8]) === null && CORE.prefHours([-1, 5]) === null && CORE.prefHours('7-24') === null, 'horário: arredonda pra hora cheia e recusa começo depois do fim');
    p = P(L('vermelho', [7, 24], 0), { faz_theme: '#ef4444', faz_hours: [7, 24], faz_prefs_at: 9 }, 1000);
    ok(!p.apply && !p.push && !p.at, 'aparelho sem cor válida: não mexe em nada');
  }

  // ======================================================================================================
  console.log('\nB) Celular: a 1ª sincronização leva a cor e o horário pra conta, com a hora:');
  const A = await bootPhone(REPO, backup.data), { w, server, L, $ } = A;
  const ev = (x) => w.eval(x);
  const meta = () => server.users.get(EMAIL).meta;
  const toasts = () => ev('window.__toasts || []');
  const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
  const theme = () => ev('themeColor'), hours = () => J(ev('[START_HOUR, END_HOUR]'));
  const prefsAt = () => Number(L('tb__prefs_at')) || 0;
  const cssTheme = () => w.document.documentElement.style.getPropertyValue('--theme-color').trim();
  const firstLabel = () => { const el = $('y-axis').firstElementChild; return el ? el.textContent : ''; };
  const pickerOn = () => { const b = [...w.document.querySelectorAll('.theme-color-btn')].find((x) => x.classList.contains('scale-110')); return b ? b.dataset.color : ''; };
  server.addUser(EMAIL, 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!L('tb__sync'), 20000);
  await waitFor(() => meta().faz_prefs_at, 9000);
  ok(meta().faz_theme === '#10b981' && J(meta().faz_hours) === '[7,24]' && meta().faz_prefs_at > 0, 'conta: cor ' + meta().faz_theme + ', horário ' + J(meta().faz_hours) + ' e a hora da mudança');
  ok(prefsAt() === meta().faz_prefs_at, 'o celular guarda a mesma hora (tb__prefs_at, fora do backup)');
  ok(ev("isFazDataKey('tb__prefs_at')") === false, 'tb__prefs_at não vai no backup');
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st, 20000); await sleep(80); };
  let n0 = server.log.length;
  await syncDone();
  ok(!server.log.slice(n0).some((x) => x.op === 'updateUser') && server.log.slice(n0).some((x) => x.op === 'getUser'), 'sincronizar de novo: confere a conta (getUser) e não regrava nada');

  // ======================================================================================================
  console.log('\nC) Mudou no PC (mais novo) → chega no celular:');
  const at1 = meta().faz_prefs_at;
  Object.assign(meta(), { faz_theme: '#ef4444', faz_hours: [6, 22], faz_prefs_at: at1 + 5000 });
  n0 = server.log.length;
  await syncDone();
  await waitFor(() => theme() === '#ef4444');
  ok(theme() === '#ef4444' && L('tb_theme_color') === '#ef4444' && cssTheme() === '#ef4444', 'cor do app virou vermelho (tela e memória do celular)');
  ok(hours() === '[6,22]' && L('tb_start_hour') === '6' && L('tb_end_hour') === '22' && firstLabel() === '06:00', 'horário do dia virou 06:00 às 22:00 (a régua da agenda começa em ' + firstLabel() + ')');
  ok(prefsAt() === at1 + 5000, 'guardou a hora da mudança que veio');
  ok(lastToast() === 'Cor e horário do dia mudaram no outro aparelho', 'aviso: "' + lastToast() + '"');
  ok(!server.log.slice(n0).some((x) => x.op === 'updateUser'), 'e não manda nada de volta pra conta');
  ev('openConfigSheet(); openConfigAppearance();');
  ok(pickerOn() === '#ef4444', 'Config → Aparência marca a bolinha vermelha');
  ev('closeConfigAppearance(); closeAllSheets && closeAllSheets();');
  // só a cor
  Object.assign(meta(), { faz_theme: '#3b82f6', faz_prefs_at: at1 + 6000 });
  await syncDone(); await waitFor(() => theme() === '#3b82f6');
  ok(theme() === '#3b82f6' && hours() === '[6,22]' && lastToast() === 'Cor do app mudou no outro aparelho 🎨', 'só a cor: "' + lastToast() + '"');
  Object.assign(meta(), { faz_hours: [7, 23], faz_prefs_at: at1 + 7000 });
  await syncDone(); await waitFor(() => hours() === '[7,23]');
  ok(hours() === '[7,23]' && theme() === '#3b82f6' && lastToast() === 'Horário do dia mudou no outro aparelho: 07:00 às 23:00', 'só o horário: "' + lastToast() + '"');

  // ======================================================================================================
  console.log('\nD) Mudou no celular → vai pra conta:');
  const atC = prefsAt();
  ev('openConfigSheet(); openConfigAppearance();');
  w.selectThemeColor(w.document.querySelector('.theme-color-btn[data-color="#8b5cf6"]'));
  ok(prefsAt() > atC, 'escolher a cor marca a hora da mudança');
  await waitFor(() => meta().faz_theme === '#8b5cf6', 12000);
  ok(meta().faz_theme === '#8b5cf6' && meta().faz_prefs_at === prefsAt() && J(meta().faz_hours) === '[7,23]', 'roxo na conta, com a hora da mudança (sem precisar tocar em Sincronizar)');
  const atD = prefsAt();
  w.selectThemeColor(w.document.querySelector('.theme-color-btn[data-color="#8b5cf6"]'));
  ok(prefsAt() === atD, 'tocar na mesma cor não conta como mudança');
  ev('closeConfigAppearance(); openConfigHours();');
  $('config-hour-start').value = '5'; $('config-hour-end').value = '23';
  w.saveConfigHours();
  ok(prefsAt() > atD && firstLabel() === '05:00', 'salvar a janela marca a hora da mudança (a régua começa em 05:00)');
  await waitFor(() => J(meta().faz_hours) === '[5,23]', 12000);
  ok(J(meta().faz_hours) === '[5,23]' && meta().faz_prefs_at === prefsAt(), 'horário 05:00 às 23:00 na conta');
  const atD2 = prefsAt();
  ev('openConfigHours();'); w.saveConfigHours();
  ok(prefsAt() === atD2, 'salvar a mesma janela não conta como mudança');
  ev('closeAllSheets && closeAllSheets();');

  // ======================================================================================================
  console.log('\nE) Mudança mais velha na conta não ganha da mais nova do celular:');
  Object.assign(meta(), { faz_theme: '#10b981', faz_prefs_at: prefsAt() - 60000 });
  await syncDone();
  await waitFor(() => meta().faz_theme === '#8b5cf6');
  ok(theme() === '#8b5cf6' && meta().faz_theme === '#8b5cf6' && meta().faz_prefs_at === prefsAt(), 'o celular fica roxo e devolve o roxo pra conta');

  // ======================================================================================================
  console.log('\nF) No meio de um arraste a cor não troca (fica pra depois):');
  Object.assign(meta(), { faz_theme: '#ec4899', faz_prefs_at: prefsAt() + 1000 });
  ev('mbDragActive = true;');
  w.fazSyncNow(); await sleep(700);
  ok(theme() === '#8b5cf6', 'arrastando: continua roxo');
  ev('mbDragActive = false;');
  await waitFor(() => theme() === '#ec4899', 12000);
  ok(theme() === '#ec4899', 'soltou: virou rosa na rodada seguinte');

  // ======================================================================================================
  console.log('\nG) Restaurar um backup que troca a cor ou o horário: vira a mudança mais nova:');
  {
    const at0 = prefsAt();
    const r1 = ev(`(() => { const b = fazPrefsKeys(); localStorage.setItem('tb_theme_color', localStorage.getItem('tb_theme_color')); fazPrefsStampIfChanged(b); return Number(localStorage.getItem('tb__prefs_at')); })()`);
    ok(r1 === at0, 'backup com a mesma cor e horário: não mexe na hora');
    await sleep(5);
    const r2 = ev(`(() => { const b = fazPrefsKeys(); localStorage.setItem('tb_start_hour', '8'); fazPrefsStampIfChanged(b); return Number(localStorage.getItem('tb__prefs_at')); })()`);
    ok(r2 > at0, 'backup com outro horário: marca a hora (o horário do backup vai pro PC)');
    ev(`localStorage.setItem('tb_start_hour', '5'); localStorage.setItem('tb__prefs_at', '${at0}');`);
  }

  // ======================================================================================================
  console.log('\nH) Celular novo (nunca escolheu cor): pega a cor e o horário da conta:');
  {
    const B = await bootPhone(REPO, {}, { server });
    const w2 = B.w;
    w2.openConfigSheet(); w2.openConfigSync(); await waitFor(() => server.createClientCalls === 2);
    B.$('sync-email').value = EMAIL; B.$('sync-password').value = 'senha123'; await w2.fazSyncLogin();
    await waitFor(() => !!B.L('tb__sync'), 20000);
    await waitFor(() => w2.eval('themeColor') === '#ec4899', 9000);
    ok(w2.eval('themeColor') === '#ec4899' && J(w2.eval('[START_HOUR, END_HOUR]')) === '[5,23]', 'aparelho novo: rosa, 05:00 às 23:00 (o da conta), em vez do padrão índigo, 00:00 às 24:00');
    ok(meta().faz_theme === '#ec4899' && J(meta().faz_hours) === '[5,23]', 'e não estragou a conta com o padrão');
    ok(B.errors.length === 0, 'nenhum erro no 2º celular' + (B.errors.length ? ': ' + B.errors[0].slice(0, 160) : ''));
    w2.close();
  }

  // ======================================================================================================
  console.log('\nI) Tela do PC: Configurações:');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  // a sessão guardada no PC é de dias atrás: cor e horário velhos
  server.storedSession = { access_token: 'tok', user: { id: UID, email: EMAIL, user_metadata: { faz_theme: '#10b981', faz_hours: [7, 24] } } };
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, FIX = new RD(2026, 10, 15, 21, 0, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.value = v; el.dispatchEvent(new pw.Event('change', { bubbles: true })); };
  const vis = (id) => !Q(id).classList.contains('hidden');
  const focusColor = () => pd.documentElement.style.getPropertyValue('--focus').trim();
  const pcToast = () => Q('toast').textContent;
  const dots = () => [...pd.querySelectorAll('#cfg-colors [data-cfg-color]')];
  const dotOn = () => (dots().find((b) => b.classList.contains('on')) || {}).dataset;
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  await waitFor(() => focusColor() === '#ec4899', 4000);
  ok(focusColor() === '#ec4899', 'abriu com a cor da conta (rosa), não com a da sessão velha guardada no PC (verde)');
  ok(!!Q('btn-cfg') && Q('btn-cfg').getAttribute('aria-label') === 'Configurações' && !!Q('btn-cfg').querySelector('.ph-gear-six'), 'botão de engrenagem "Configurações" no topo');
  click(Q('btn-cfg')); await sleep(30);
  ok(vis('modal-cfg') && Q('cfg-title').textContent === 'Configurações', 'abre a janela Configurações');
  ok(dots().length === 8 && dots().map((b) => b.dataset.cfgColor).join(',') === '#4f46e5,#ef4444,#3b82f6,#10b981,#f59e0b,#8b5cf6,#ec4899,#14b8a6', 'as 8 cores do celular, na mesma ordem');
  ok(dotOn() && dotOn().cfgColor === '#ec4899' && dots().find((b) => b.dataset.cfgColor === '#ec4899').getAttribute('aria-checked') === 'true', 'a cor atual (rosa) está marcada');
  ok(Q('cfg-h0').value === '5' && Q('cfg-h1').value === '23' && Q('cfg-h0').options.length === 24 && Q('cfg-h1').options.length === 24 && Q('cfg-h0').options[0].text === '00:00' && Q('cfg-h1').options[23].text === '24:00', 'horário do dia: Começa 05:00, Termina 23:00 (listas de 00:00 a 23:00 e de 01:00 a 24:00)');
  ok(!pd.querySelector('#modal-cfg input[type="time"], #modal-cfg input[type="date"]'), 'sem campo de hora do navegador (só as listas)');
  // trocar a cor
  const atPc0 = meta().faz_prefs_at;
  click(dots().find((b) => b.dataset.cfgColor === '#f59e0b'));
  ok(focusColor() === '#f59e0b' && dotOn().cfgColor === '#f59e0b', 'clicou no âmbar: a tela muda na hora');
  await waitFor(() => meta().faz_theme === '#f59e0b'); await sleep(30);
  ok(meta().faz_theme === '#f59e0b' && meta().faz_prefs_at > atPc0 && J(meta().faz_hours) === '[5,23]', 'gravou na conta, mais nova que a última (e o horário continua 05:00 às 23:00)');
  ok(pcToast() === 'Cor do app atualizada. No celular muda na próxima sincronização.', 'aviso: "' + pcToast() + '"');
  ok(pd.querySelector('meta[name="theme-color"]').getAttribute('content') === '#f59e0b', 'a barra do navegador acompanha a cor');
  // horário
  change(Q('cfg-h0'), '8');
  await waitFor(() => J(meta().faz_hours) === '[8,23]'); await sleep(30);
  ok(J(meta().faz_hours) === '[8,23]' && meta().faz_theme === '#f59e0b', 'Começa 08:00: gravou 08:00 às 23:00');
  ok(pcToast() === 'Horário do dia: 08:00 às 23:00. No celular muda na próxima sincronização.', 'aviso: "' + pcToast() + '"');
  const before = J(meta());
  change(Q('cfg-h0'), '23'); change(Q('cfg-h1'), '20'); await sleep(60);
  ok(Q('cfg-h-msg').textContent === 'O começo precisa ser antes do fim.' && Q('cfg-h-msg').classList.contains('text-red-600') && J(meta()) === before, 'começo depois do fim: avisa em vermelho e não grava');
  change(Q('cfg-h1'), '23'); await sleep(30);
  ok(Q('cfg-h-msg').textContent === 'O começo precisa ser antes do fim.' && J(meta()) === before, 'Termina 23:00 com Começa 23:00: ainda não dá, continua sem gravar');
  change(Q('cfg-h0'), '8'); await sleep(60);
  ok(Q('cfg-h-msg').textContent.startsWith('A Agenda mostra esse intervalo') && J(meta()) === before, 'voltou pro que estava: o aviso some e nada é regravado');
  // sem internet: volta como estava
  server.failAuth = 1;
  click(dots().find((b) => b.dataset.cfgColor === '#14b8a6'));
  await waitFor(() => focusColor() === '#f59e0b' && /não foi salva|Não foi possível salvar/.test(pcToast()), 3000);
  ok(focusColor() === '#f59e0b' && dotOn().cfgColor === '#f59e0b' && meta().faz_theme === '#f59e0b', 'sem internet: a cor volta pro âmbar e a conta não muda');
  ok(/não foi salva|Não foi possível salvar/.test(pcToast()), 'aviso: "' + pcToast() + '"');
  pd.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(20);
  ok(!vis('modal-cfg'), 'Esc fecha');
  click(Q('btn-cfg')); await sleep(20);
  Q('modal-cfg').dispatchEvent(new pw.MouseEvent('mousedown', { bubbles: true, detail: 1 })); await sleep(20);
  ok(!vis('modal-cfg'), 'clicar fora fecha');
  // a Agenda usa o horário novo: um dia vazio começa às 08:00
  click(Q('tab-agenda')); await sleep(40);
  click(pd.querySelector('.ag-view[data-view="day"]')); await sleep(40);
  click(Q('ag-today')); await sleep(20);
  for (let i = 0; i < 5; i++) { click(Q('ag-next')); await sleep(15); }
  const rul = [...pd.querySelectorAll('#ag-timeline span')].map((s) => s.textContent).filter((t) => /^\d\d:00$/.test(t));
  ok(rul[0] === '08:00' && rul[rul.length - 1] === '23:00', 'na Agenda (Dia, num dia vazio) a régua vai de ' + rul[0] + ' a ' + rul[rul.length - 1]);

  // ======================================================================================================
  console.log('\nJ) O celular recebe o que mudou no PC:');
  await syncDone();
  await waitFor(() => theme() === '#f59e0b' && hours() === '[8,23]');
  ok(theme() === '#f59e0b' && hours() === '[8,23]' && firstLabel() === '08:00', 'celular: âmbar, 08:00 às 23:00');
  ok(lastToast() === 'Cor e horário do dia mudaram no outro aparelho', 'aviso no celular: "' + lastToast() + '"');

  // ======================================================================================================
  console.log('\nK) O PC recebe o que mudou no celular:');
  ev('openConfigSheet(); openConfigAppearance();');
  w.selectThemeColor(w.document.querySelector('.theme-color-btn[data-color="#14b8a6"]'));
  await waitFor(() => meta().faz_theme === '#14b8a6', 12000);
  ok(meta().faz_theme === '#14b8a6', 'celular mudou pra turquesa (na conta)');
  click(Q('tab-listas')); await sleep(20);
  click(Q('btn-cfg')); await sleep(20);
  await waitFor(() => focusColor() === '#14b8a6', 3000);
  ok(focusColor() === '#14b8a6' && dotOn().cfgColor === '#14b8a6', 'abriu Configurações no PC: já está turquesa (e a bolinha marcada)');
  // dado da conta mais velho que a última mudança feita no PC não volta a tela pra trás
  click(dots().find((b) => b.dataset.cfgColor === '#3b82f6'));
  await waitFor(() => meta().faz_theme === '#3b82f6');
  const atPc = meta().faz_prefs_at;
  Object.assign(meta(), { faz_theme: '#ef4444', faz_prefs_at: atPc - 1 }); // como uma resposta atrasada
  click(Q('cfg-close')); click(Q('btn-cfg')); await sleep(40);
  ok(focusColor() === '#3b82f6', 'resposta mais velha que a última mudança feita no PC: a tela continua azul');
  Object.assign(meta(), { faz_theme: '#3b82f6', faz_prefs_at: atPc });
  click(Q('cfg-close'));
  // a sessão guardada no PC chega de novo ao voltar pra aba (SIGNED_IN, com os dados de quando foi salva)
  const pcEmit = server.emitters[server.emitters.length - 1];
  const sess = (theme, at) => ({ access_token: 'tok', user: { id: UID, email: EMAIL, user_metadata: { faz_theme: theme, faz_hours: [8, 23], faz_prefs_at: at } } });
  pcEmit('SIGNED_IN', sess('#ef4444', atPc)); await sleep(40);
  ok(focusColor() === '#3b82f6', 'sessão guardada no PC chegando de novo (mesma hora, outra cor): não passa por cima do que veio da nuvem');
  pcEmit('SIGNED_IN', sess('#ef4444', atPc + 10)); await sleep(40);
  ok(focusColor() === '#ef4444', 'mas se for mais nova (salva por outra aba), vale');
  pcEmit('TOKEN_REFRESHED', sess('#14b8a6', atPc + 10)); await sleep(40);
  ok(focusColor() === '#14b8a6', 'o que vem da nuvem na renovação do login (TOKEN_REFRESHED) vale, mesmo com a mesma hora');

  // ======================================================================================================
  console.log('\nL) Sair da conta fecha a janela:');
  click(Q('btn-cfg')); await sleep(20);
  await pw.eval('Promise.resolve()');
  ok(vis('modal-cfg'), 'janela aberta');
  click(Q('btn-logout')); await sleep(60);
  const dlg = Q('dlg-ok'); if (dlg && !Q('dialog').classList.contains('hidden')) { click(dlg); await sleep(60); }
  await waitFor(() => vis('view-login'), 3000);
  ok(vis('view-login') && !vis('modal-cfg'), 'saiu: tela de login, sem a janela por cima');

  ok(errors.length === 0, 'nenhum erro na tela do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  ok(A.errors.length === 0, 'nenhum erro no celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
