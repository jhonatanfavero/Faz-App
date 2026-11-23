// V40.41.0 — Períodos (Manhã, Tarde...) nos 2 sentidos: celular ↔ conta ↔ PC (escolha dele: "Igual ao celular").
// Vão na conta (user_metadata), como a cor do app: faz_periods (a lista) e faz_periods_at (quando mudou).
// A) As regras (CORE.periodsPlan e cleanPeriods). B) O celular: sobe, recebe, não volta pra trás, Desfazer, backup,
// lista vazia, aparelho novo e o que tinha períodos próprios antes desta versão (junta, nada some).
// C) A tela do PC: Configurações (lista, criar, apagar, sem internet, lê a conta antes de gravar), os períodos no
// Novo bloco (preenche horário e duração, nome, conflito, desmarca), conta sem períodos (os 4 padrão).
// D) Os dois lados juntos: o que o PC cria chega no celular e vice-versa.
// Uso: TZ='America/Sao_Paulo' node test_periodos.js <repo> <dados-ficticios.json>
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
const UID = '12121212-1212-1212-1212-121212121212', EMAIL = 'per@t.com';
const UID2 = '34343434-3434-3434-3434-343434343434', EMAIL2 = 'socio@t.com';
const J = (v) => JSON.stringify(v);
const P = (id, name, start, end) => ({ id, name, start, end });
const names = (l) => (l || []).map((p) => p.name).join(',');

(async () => {
  // ======================================================================================================
  console.log('A) As regras (quem ganha, o que é período de verdade):');
  {
    const plan = CORE.periodsPlan, L = (list, at) => ({ list, at });
    const mine = [P('p1', 'Madrugada', '00:00', '06:00'), P('p2', 'Manhã', '06:00', '12:00')];
    const pc = [P('p1', 'Madrugada', '00:00', '06:00'), P('p_9', 'Almoço', '12:00', '13:30')];
    let p = plan(L(mine, 0), {}, 1000);
    ok(!p.apply && J(p.push) === J({ faz_periods: mine, faz_periods_at: 1000 }) && p.at === 1000, 'conta sem períodos: vão os daqui, com a hora');
    p = plan(L(mine, 0), { faz_periods: mine }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_periods: mine, faz_periods_at: 1000 }) && p.at === 1000, 'iguais, conta sem a hora: carimba a hora');
    p = plan(L(mine, 500), { faz_periods: mine, faz_periods_at: 500 }, 1000);
    ok(!p.apply && !p.push && p.at === 0, 'iguais e a mesma hora: nada a fazer');
    p = plan(L(mine, 0), { faz_periods: mine, faz_periods_at: 500 }, 1000);
    ok(!p.apply && !p.push && p.at === 500, 'iguais, conta com hora: só guarda a hora no aparelho');
    p = plan(L(mine, 500), { faz_periods: pc, faz_periods_at: 900 }, 1000);
    ok(J(p.apply) === J(pc) && !p.push && p.at === 900, 'mudou depois no PC: vem a lista de lá');
    p = plan(L(mine, 900), { faz_periods: pc, faz_periods_at: 500 }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_periods: mine, faz_periods_at: 900 }) && p.at === 900, 'mudou aqui por último: vai pra conta com a hora da mudança');
    p = plan(L(mine, 500), { faz_periods: pc, faz_periods_at: 500 }, 100);
    ok(!p.apply && J(p.push) === J({ faz_periods: mine, faz_periods_at: 501 }) && p.at === 501, 'mesma hora com listas diferentes e o relógio daqui atrasado: vai daqui, com hora mais nova que a de lá');
    p = plan(L(CORE.DEFAULT_PERIODS, 0), { faz_periods: pc, faz_periods_at: 900 }, 1000);
    ok(J(p.apply) === J(pc) && !p.push && p.at === 900, 'aparelho novo, só com os 4 padrão: pega os da conta (os padrão apagados no PC não voltam)');
    p = plan(L(mine, 0), { faz_periods: pc, faz_periods_at: 900 }, 1000);
    ok(J(p.apply) === J(pc.concat([P('p2', 'Manhã', '06:00', '12:00')])) && J(p.push && p.push.faz_periods) === J(p.apply) && p.push.faz_periods_at === 1000 && p.at === 1000,
      'primeira vez deste aparelho com a conta já tendo períodos (do PC): junta os de lá + os daqui que faltam (' + names(p.apply) + ')');
    const old = [P('p1', 'Madrugada', '00:00', '06:00'), P('p2', 'Manhã', '06:00', '12:00'), P('p3', 'Tarde', '12:00', '18:00'), P('p4', 'Noite', '18:00', '23:59')];
    const pcDef = CORE.DEFAULT_PERIODS.concat([P('p_5', 'Almoço', '12:00', '13:30')]);
    p = plan(L(old, 0), { faz_periods: pcDef, faz_periods_at: 900 }, 1000);
    ok(p.apply && p.apply.length === 9 && J(p.apply.slice(5).map((x) => x.id)) === J(['p1_2', 'p2_2', 'p3_2', 'p4_2']) && p.apply[5].name === 'Madrugada',
      'mesmo id com outro horário (os padrão de uma versão antiga do app): entram com id novo, nada some');
    p = plan(L(pc, 0), { faz_periods: pc.slice().reverse(), faz_periods_at: 900 }, 1000);
    ok(J(p.apply) === J(pc.slice().reverse()) && !p.push, 'primeira vez, os mesmos períodos em outra ordem: vale a ordem da conta, sem regravar');
    p = plan(L(mine, 500), { faz_periods: 'Manhã', faz_periods_at: 900 }, 1000);
    ok(!p.apply && J(p.push) === J({ faz_periods: mine, faz_periods_at: 1000 }), 'conta com a lista estragada: nada entra no aparelho e o daqui conserta a conta');
    p = plan(L(null, 500), { faz_periods: pc, faz_periods_at: 900 }, 1000);
    ok(!p.apply && !p.push && !p.at, 'aparelho sem lista: não mexe em nada');
    p = plan(L([], 900), { faz_periods: pc, faz_periods_at: 500 }, 1000);
    ok(J(p.push) === J({ faz_periods: [], faz_periods_at: 900 }), 'apagou todos aqui por último: a conta fica sem nenhum (lista vazia vale)');
    const dirty = [P('a', '  Cedo  ', '7:00', '8:00'), P('b', 'Ruim', '25:00', '26:00'), P('a', 'Repetido', '01:00', '02:00'), { id: 'c', name: '', start: '01:00', end: '02:00' },
      null, [1, 2], 'x', P("d'><img>", 'Aspas', '09:00', '10:00'), { id: 5, name: 'x'.repeat(80), start: '10:00', end: '11:00' }, { id: 'e', name: 'Sem fim', start: '10:00' }];
    ok(J(CORE.cleanPeriods(dirty)) === J([P('a', 'Cedo', '07:00', '08:00'), P('d___img_', 'Aspas', '09:00', '10:00'), P('5', 'x'.repeat(60), '10:00', '11:00')]),
      'só entra período de verdade: nome sem espaço sobrando (até 60 letras), "7:00" vira "07:00", hora inválida, sem nome, sem fim e id repetido ficam de fora, id só com letra/número/_ . -');
    ok(CORE.cleanPeriods(Array.from({ length: 40 }, (_, i) => P('x' + i, 'N' + i, '01:00', '02:00'))).length === 30 && CORE.cleanPeriods('x') === null, 'no máximo 30; o que não é lista não é lista');
  }

  // ======================================================================================================
  console.log('\nB) Celular: a 1ª sincronização leva os períodos pra conta (com a cor, numa gravação só):');
  const A = await bootPhone(REPO, backup.data), { w, server, $ } = A;
  const LS = A.L, ev = (x) => w.eval(x);
  const meta = () => server.users.get(EMAIL).meta;
  const toasts = () => ev('window.__toasts || []');
  const lastToast = () => { const t = toasts(); return t[t.length - 1] || ''; };
  const perAt = () => Number(LS('tb__periods_at')) || 0;
  const pers = () => JSON.parse(ev('JSON.stringify(periodsDb)'));
  const DATA = JSON.parse(backup.data.tb_periods_db);
  server.addUser(EMAIL, 'senha123', UID);
  let c0 = server.createClientCalls;
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === c0 + 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!LS('tb__sync'), 20000);
  await waitFor(() => meta().faz_periods_at, 9000);
  ok(J(meta().faz_periods) === J(DATA) && meta().faz_periods_at > 0, 'conta: os 4 períodos do celular (' + names(meta().faz_periods) + ') e a hora');
  ok(perAt() === meta().faz_periods_at, 'o celular guarda a mesma hora (tb__periods_at)');
  const ups = server.log.filter((x) => x.op === 'updateUser');
  ok(ups.length === 1 && 'faz_theme' in ups[0].data && 'faz_periods' in ups[0].data, 'uma gravação só na conta (cor, horário e períodos juntos)');
  ok(ev("isFazDataKey('tb__periods_at')") === false, 'tb__periods_at fica fora do backup');
  const syncDone = async () => { const st = LS('tb__sync'); w.fazSyncNow(); await waitFor(() => LS('tb__sync') !== st, 20000); await sleep(80); };
  let n0 = server.log.length;
  await syncDone();
  ok(!server.log.slice(n0).some((x) => x.op === 'updateUser'), 'sincronizar de novo: não regrava nada');

  console.log('\n   Criar e apagar no celular vai pra conta sozinho:');
  let at0 = perAt();
  ev('openConfigSheet(); openConfigPeriods();');
  $('config-period-name').value = 'Almoço'; $('config-period-start').value = '12:00'; $('config-period-end').value = '13:30';
  w.addConfigPeriod();
  ok(perAt() > at0 && pers().length === 5, 'criar "Almoço" marca a hora da mudança');
  await waitFor(() => names(meta().faz_periods).includes('Almoço'), 12000);
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Tarde,Noite,Almoço' && meta().faz_periods_at === perAt(), 'Almoço na conta, com a hora (sem tocar em Sincronizar)');
  const almoco = pers()[4].id;
  w.deleteConfigPeriod(almoco);
  await waitFor(() => !names(meta().faz_periods).includes('Almoço'), 12000);
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Tarde,Noite', 'apagou: sai da conta também');
  await sleep(30);
  ok(!$('undo-bar').classList.contains('hidden') && /Período/.test($('undo-bar-msg').textContent), 'a barrinha do Desfazer: "' + $('undo-bar-msg').textContent + '"');
  w.fazUndo();
  await waitFor(() => names(meta().faz_periods).includes('Almoço'), 12000);
  ok(names(pers()) === 'Madrugada,Manhã,Tarde,Noite,Almoço' && names(meta().faz_periods).includes('Almoço') && meta().faz_periods_at === perAt(), 'Desfazer traz o Almoço de volta (no celular e na conta)');
  ev('closeConfigPeriods();');
  $('config-period-name').value = ''; $('config-period-start').value = ''; $('config-period-end').value = '';

  console.log('\n   Mudou no PC (mais novo) → chega no celular:');
  const fromPc = [P('p1', 'Madrugada', '00:00', '06:00'), P('p2', 'Manhã', '06:00', '12:00'), P('p_77', 'Reunião', '14:00', '15:30')];
  const undoLen = ev('undoStack.length');
  ev('openConfigPeriods();');
  Object.assign(meta(), { faz_periods: fromPc, faz_periods_at: perAt() + 5000 });
  n0 = server.log.length;
  await syncDone();
  await waitFor(() => names(pers()) === 'Madrugada,Manhã,Reunião');
  ok(J(pers()) === J(fromPc) && perAt() === meta().faz_periods_at, 'a lista do celular virou a do PC (' + names(pers()) + ') e guardou a hora de lá');
  ok(lastToast() === 'Períodos mudaram no outro aparelho', 'aviso: "' + lastToast() + '"');
  ok(/Reunião/.test($('config-periods-list').textContent) && !/Tarde/.test($('config-periods-list').textContent), 'Config → Períodos aberto: a lista na tela já é a nova');
  ok(ev('undoStack.length') === undoLen, 'o que veio do PC não vira passo do Desfazer');
  ok(!server.log.slice(n0).some((x) => x.op === 'updateUser'), 'e não manda nada de volta');
  ev('closeConfigPeriods(); closeAllSheets && closeAllSheets();');

  console.log('\n   Mudança mais velha na conta não ganha da mais nova do celular:');
  Object.assign(meta(), { faz_periods: [P('p9', 'Velho', '01:00', '02:00')], faz_periods_at: perAt() - 60000 });
  await syncDone();
  await waitFor(() => names(meta().faz_periods) === 'Madrugada,Manhã,Reunião');
  ok(names(pers()) === 'Madrugada,Manhã,Reunião' && names(meta().faz_periods) === 'Madrugada,Manhã,Reunião' && meta().faz_periods_at === perAt(), 'o celular continua com os dele e devolve pra conta');

  console.log('\n   Restaurar um backup que troca os períodos: vira a mudança mais nova:');
  {
    const a0 = perAt();
    const r1 = ev(`(() => { const b = fazPeriodsRaw(); localStorage.setItem('tb_periods_db', localStorage.getItem('tb_periods_db')); fazPeriodsStampIfChanged(b); return Number(localStorage.getItem('tb__periods_at')); })()`);
    ok(r1 === a0, 'backup com os mesmos períodos: não mexe na hora');
    await sleep(5);
    const keep = LS('tb_periods_db');
    const r2 = ev(`(() => { const b = fazPeriodsRaw(); localStorage.setItem('tb_periods_db', '[]'); fazPeriodsStampIfChanged(b); return Number(localStorage.getItem('tb__periods_at')); })()`);
    ok(r2 > a0, 'backup com outros períodos: marca a hora (os do backup vão pro PC)');
    ev(`localStorage.setItem('tb_periods_db', ${J(keep)}); localStorage.setItem('tb__periods_at', '${a0}');`);
  }

  console.log('\n   Lista vazia continua vazia (antes os 4 padrão voltavam sozinhos):');
  {
    const E = await bootPhone(REPO, { tb_periods_db: '[]' });
    ok(E.w.eval('periodsDb.length') === 0, 'apagou todos: abrir o app de novo continua sem nenhum');
    E.w.eval('openSheet(); openPeriodSelectSheet();');
    ok(/Nenhum período/.test(E.$('period-select-container').textContent), 'o "Período" do + avisa: "' + E.$('period-select-container').textContent.trim() + '"');
    ok(E.errors.length === 0, 'sem erro' + (E.errors.length ? ': ' + E.errors[0].slice(0, 120) : ''));
    E.w.close();
    const N = await bootPhone(REPO, {});
    ok(names(JSON.parse(N.w.eval('JSON.stringify(periodsDb)'))) === 'Manhã,Meio-dia,Tarde,Noite' && N.L('tb__periods_at') === null, 'sem nada guardado: os 4 padrão (sem marcar hora: não conta como mudança)');
    N.w.close();
  }

  console.log('\n   Celular novo (só os padrão) pega os da conta, sem regravar:');
  {
    const B = await bootPhone(REPO, {}, { server });
    c0 = server.createClientCalls;
    B.w.openConfigSheet(); B.w.openConfigSync(); await waitFor(() => server.createClientCalls === c0 + 1);
    B.$('sync-email').value = EMAIL; B.$('sync-password').value = 'senha123';
    n0 = server.log.length;
    await B.w.fazSyncLogin();
    await waitFor(() => !!B.L('tb__sync'), 20000);
    await waitFor(() => names(JSON.parse(B.w.eval('JSON.stringify(periodsDb)'))) === 'Madrugada,Manhã,Reunião', 9000);
    ok(names(JSON.parse(B.w.eval('JSON.stringify(periodsDb)'))) === 'Madrugada,Manhã,Reunião' && Number(B.L('tb__periods_at')) === meta().faz_periods_at, 'aparelho novo: os períodos da conta, no lugar dos 4 padrão');
    ok(!server.log.slice(n0).some((x) => x.op === 'updateUser' && x.data && 'faz_periods' in x.data) && names(meta().faz_periods) === 'Madrugada,Manhã,Reunião', 'e não estragou a conta com os padrão');
    ok(B.errors.length === 0, 'nenhum erro no 2º celular' + (B.errors.length ? ': ' + B.errors[0].slice(0, 160) : ''));
    B.w.close();
  }

  console.log('\n   Celular com períodos próprios de antes desta versão: junta com os da conta (nada some):');
  {
    const C = await bootPhone(REPO, { tb_periods_db: J([P('p1', 'Madrugada', '00:00', '06:00'), P('px', 'Plantão', '19:00', '07:00')]) }, { server });
    c0 = server.createClientCalls;
    C.w.openConfigSheet(); C.w.openConfigSync(); await waitFor(() => server.createClientCalls === c0 + 1);
    C.$('sync-email').value = EMAIL; C.$('sync-password').value = 'senha123';
    await C.w.fazSyncLogin();
    await waitFor(() => !!C.L('tb__sync'), 20000);
    await waitFor(() => names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão', 9000);
    ok(names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão' && names(JSON.parse(C.w.eval('JSON.stringify(periodsDb)'))) === 'Madrugada,Manhã,Reunião,Plantão', 'conta e celular: os da conta + o Plantão daqui (a Madrugada igual não duplica)');
    ok(Number(C.L('tb__periods_at')) === meta().faz_periods_at, 'com a mesma hora nos dois');
    ok(C.errors.length === 0, 'nenhum erro no 3º celular' + (C.errors.length ? ': ' + C.errors[0].slice(0, 160) : ''));
    C.w.close();
  }
  await syncDone(); // o 1º celular pega o Plantão
  await waitFor(() => names(pers()) === 'Madrugada,Manhã,Reunião,Plantão');
  ok(names(pers()) === 'Madrugada,Manhã,Reunião,Plantão', 'o 1º celular recebe o Plantão na sincronização seguinte');

  // ======================================================================================================
  console.log('\nC) Tela do PC: Configurações → Períodos:');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const bootPc = (uid, email, metaNow) => {
    server.storedSession = { access_token: 'tok', user: { id: uid, email, user_metadata: JSON.parse(J(metaNow)) } };
    return new JSDOM(html, {
      url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
      beforeParse(pw) {
        const RD = pw.Date, base = new RD(2026, 10, 15, 21, 0, 0).getTime(), t0 = RD.now(), now = () => base + (RD.now() - t0);
        pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
        pw.supabase = { createClient: makeCreateClient(server) };
        pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
        pw.HTMLElement.prototype.scrollIntoView = function () {};
      },
    });
  };
  const dom = bootPc(UID, EMAIL, meta());
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const change = (el, v) => { el.value = v; el.dispatchEvent(new pw.Event('change', { bubbles: true })); };
  const vis = (id) => !Q(id).classList.contains('hidden');
  const pcToast = () => Q('toast').textContent;
  const rows = () => [...pd.querySelectorAll('#cfg-pers > div')].map((d) => [...d.querySelectorAll('span')].map((x) => x.textContent.trim()).join(' '));
  const setTime = (id, h, m) => { const box = pd.querySelector('[data-time-for="' + id + '"]'); change(box.querySelector('.time-h'), String(h)); if (m != null) change(box.querySelector('.time-m'), String(m)); };
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  click(Q('btn-cfg')); await sleep(60);
  ok(vis('modal-cfg') && /Períodos/.test(Q('modal-cfg').textContent), 'a janela Configurações tem a parte "Períodos"');
  await waitFor(() => rows().length === 4, 3000);
  ok(J(rows()) === J(['Madrugada 00:00 às 06:00', 'Manhã 06:00 às 12:00', 'Reunião 14:00 às 15:30', 'Plantão 19:00 às 07:00 (dia seguinte)']), 'os períodos da conta, na ordem: ' + rows().join(' · '));
  ok(!pd.querySelector('#modal-cfg input[type="time"], #modal-cfg input[type="date"]'), 'sem campo de hora do navegador (só as listas de hora e minuto)');
  ok(Q('cfg-per-msg').textContent === 'Fim antes do início = termina no dia seguinte.', 'dica: "' + Q('cfg-per-msg').textContent + '"');
  // validações
  click(Q('cfg-per-add')); await sleep(20);
  ok(Q('cfg-per-msg').textContent === 'Dê um nome pro período.' && Q('cfg-per-msg').classList.contains('text-red-600'), 'sem nome: "Dê um nome pro período." em vermelho');
  Q('cfg-per-name').value = 'Foco';
  click(Q('cfg-per-add')); await sleep(20);
  ok(Q('cfg-per-msg').textContent === 'Escolha o início e o fim.', 'sem horário: "Escolha o início e o fim."');
  setTime('cfg-per-st', 9); setTime('cfg-per-en', 9);
  ok(Q('cfg-per-st').value === '09:00' && Q('cfg-per-en').value === '09:00', 'escolher só a hora já põe os minutos em 00');
  click(Q('cfg-per-add')); await sleep(20);
  ok(Q('cfg-per-msg').textContent === 'O início e o fim não podem ser iguais.', 'início igual ao fim: "O início e o fim não podem ser iguais."');
  ok(J(meta().faz_periods.map((p) => p.name)) === J(['Madrugada', 'Manhã', 'Reunião', 'Plantão']), 'nada foi gravado');
  // criar
  setTime('cfg-per-en', 10, 30);
  let atPc = meta().faz_periods_at;
  click(Q('cfg-per-add'));
  await waitFor(() => names(meta().faz_periods).includes('Foco')); await sleep(40);
  const foco = meta().faz_periods[4];
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão,Foco' && foco.start === '09:00' && foco.end === '10:30' && /^p_\d+$/.test(foco.id) && meta().faz_periods_at > atPc, 'Adicionar: "Foco" 09:00 às 10:30 vai pra conta (no fim da lista), com hora mais nova');
  ok(pcToast() === 'Período Foco criado (09:00 às 10:30). No celular muda na próxima sincronização.', 'aviso: "' + pcToast() + '"');
  ok(rows()[4] === 'Foco 09:00 às 10:30' && Q('cfg-per-name').value === '' && Q('cfg-per-st').value === '' && pd.querySelector('[data-time-for="cfg-per-st"] .time-h').value === '', 'a lista mostra o Foco e o formulário fica limpo');
  // Enter no nome cria
  Q('cfg-per-name').value = 'Treino'; setTime('cfg-per-st', 6); setTime('cfg-per-en', 7);
  Q('cfg-per-name').dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  await waitFor(() => names(meta().faz_periods).includes('Treino')); await sleep(30);
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão,Foco,Treino', 'Enter no nome também adiciona (Treino 06:00 às 07:00)');
  // lê a conta antes de gravar: o que o celular mudou agora há pouco não se perde
  Object.assign(meta(), { faz_periods: meta().faz_periods.concat([P('p_cel', 'Café', '07:30', '08:00')]), faz_periods_at: meta().faz_periods_at + 10 });
  Q('cfg-per-name').value = 'Leitura'; setTime('cfg-per-st', 22); setTime('cfg-per-en', 23);
  click(Q('cfg-per-add'));
  await waitFor(() => names(meta().faz_periods).includes('Leitura')); await sleep(30);
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão,Foco,Treino,Café,Leitura', 'o celular criou "Café" agora há pouco: o PC lê a conta antes de gravar e o Café fica (' + names(meta().faz_periods) + ')');
  // apagar
  const delBtn = (name) => pd.querySelector('#cfg-pers [data-per-del][aria-label="Apagar o período ' + name + '"]');
  click(delBtn('Treino')); await sleep(30);
  ok(vis('dialog') && Q('dlg-title').textContent === 'Apagar o período?' && /"Treino" \(06:00 às 07:00\) some daqui e do celular/.test(Q('dlg-text').textContent), 'a lixeira pergunta: "' + Q('dlg-text').textContent + '"');
  click(Q('dlg-cancel')); await sleep(40);
  ok(names(meta().faz_periods).includes('Treino') && !vis('dialog'), 'Cancelar: continua');
  click(delBtn('Treino')); await sleep(30); click(Q('dlg-ok'));
  await waitFor(() => !names(meta().faz_periods).includes('Treino')); await sleep(30);
  ok(names(meta().faz_periods) === 'Madrugada,Manhã,Reunião,Plantão,Foco,Café,Leitura' && !rows().some((r) => r.startsWith('Treino')), 'Apagar: sai da conta e da lista');
  ok(pcToast() === 'Período Treino apagado. No celular muda na próxima sincronização.', 'aviso: "' + pcToast() + '"');
  // sem internet: volta como estava
  server.failAuth = 1;
  Q('cfg-per-name').value = 'Falha'; setTime('cfg-per-st', 5); setTime('cfg-per-en', 6);
  click(Q('cfg-per-add'));
  await waitFor(() => /não foi salva|Não foi possível salvar/.test(pcToast()), 3000); await sleep(30);
  ok(!names(meta().faz_periods).includes('Falha') && !rows().some((r) => r.startsWith('Falha')), 'sem internet: não grava e a lista volta como estava');
  ok(Q('cfg-per-name').value === 'Falha' && Q('cfg-per-st').value === '05:00' && Q('cfg-per-en').value === '06:00', 'o que foi digitado volta pro formulário (dá pra tentar de novo)');
  ok(/não foi salva|Não foi possível salvar/.test(pcToast()), 'aviso: "' + pcToast() + '"');
  Q('cfg-per-name').value = ''; setTime('cfg-per-st', ''); setTime('cfg-per-en', '');
  pd.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(20);
  ok(!vis('modal-cfg'), 'Esc fecha');

  // ======================================================================================================
  console.log('\nC2) Tela do PC: os períodos no Novo bloco:');
  const chips = () => [...pd.querySelectorAll('#f-pers [data-per]')];
  const chip = (name) => chips().find((b) => b.textContent.startsWith(name));
  const pressed = () => chips().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  const DAY = '2026-12-14', DAY2 = '2026-12-15';
  const newBlock = async (day) => {
    click(Q('ag-new')); await sleep(40);
    change(Q('f-date'), day); await sleep(20);
  };
  click(Q('tab-agenda')); await sleep(40);
  await newBlock(DAY);
  ok(vis('modal-task') && vis('f-per-wrap') && chips().length === 7, 'Novo bloco: a linha "Período" com os 7 períodos');
  ok(J(chips().map((b) => b.textContent.replace(/\s+/g, ' ').trim())) === J(['Madrugada 00:00–06:00', 'Manhã 06:00–12:00', 'Reunião 14:00–15:30', 'Plantão 19:00–07:00', 'Foco 09:00–10:30', 'Café 07:30–08:00', 'Leitura 22:00–23:00']) && pressed().length === 0, 'cada um com o horário, nenhum marcado');
  const st0 = Q('f-start').value;
  chip('Reunião').dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true, detail: 2 })); await sleep(10);
  ok(pressed().length === 0 && Q('f-start').value === st0, 'o 2º clique de um clique duplo na agenda (que abriu a janela) não escolhe período');
  click(chip('Reunião')); await sleep(20);
  ok(Q('f-start').value === '14:00' && Q('f-dur').value === '90' && J(pressed()) === J(['Reunião 14:00–15:30']), 'clicou em Reunião: início 14:00, duração 1h30, o botão fica marcado');
  ok(Q('f-title').placeholder === 'Reunião' && Q('f-title').value === '', 'o nome vazio mostra "Reunião" (é o nome que o bloco vai ter)');
  click(chip('Madrugada')); await sleep(20);
  ok(Q('f-start').value === '00:00' && Q('f-dur').value === '360' && [...Q('f-dur').options].some((o) => o.value === '360' && o.text === '6h') && J(pressed()) === J(['Madrugada 00:00–06:00']), 'Madrugada: 00:00 e 6h (a duração entra na lista)');
  click(chip('Plantão')); await sleep(20);
  ok(Q('f-start').value === '19:00' && Q('f-dur').value === '720', 'Plantão (19:00 às 07:00, termina no dia seguinte): 19:00 e 12h, como no celular');
  click(chip('Reunião')); await sleep(20);
  change(Q('f-date'), DAY2); await sleep(20);
  ok(Q('f-start').value === '14:00' && J(pressed()) === J(['Reunião 14:00–15:30']), 'trocar o dia não mexe no horário do período');
  change(Q('f-date'), DAY); await sleep(20);
  click(Q('f-save'));
  await waitFor(() => [...server.tables.blocos.values()].some((b) => b.user_id === UID && b.date === DAY && b.title === 'Reunião'));
  const reu = [...server.tables.blocos.values()].find((b) => b.user_id === UID && b.date === DAY && b.title === 'Reunião');
  ok(reu && reu.start_min === 840 && reu.duration === 90 && !vis('modal-task'), 'Criar bloco: "Reunião" em 14/12 das 14:00 às 15:30');
  // conflito: não empurra pra outro horário (como no celular)
  await newBlock(DAY);
  click(chip('Foco')); await sleep(10);
  Q('f-title').value = 'Estudar'; // nome digitado vale
  click(chip('Reunião')); await sleep(10);
  const nB = [...server.tables.blocos.values()].filter((b) => b.user_id === UID && b.date === DAY && !b.deleted).length;
  click(Q('f-save')); await sleep(80);
  ok(pcToast() === 'Conflito! O período se sobrepõe a outro bloco.' && vis('modal-task') && [...server.tables.blocos.values()].filter((b) => b.user_id === UID && b.date === DAY && !b.deleted).length === nB, 'Reunião de novo no mesmo dia: "Conflito! O período se sobrepõe a outro bloco." e nada é criado (a janela continua aberta)');
  click(chip('Foco')); await sleep(10);
  click(Q('f-save'));
  await waitFor(() => [...server.tables.blocos.values()].some((b) => b.user_id === UID && b.date === DAY && b.title === 'Estudar'));
  const est = [...server.tables.blocos.values()].find((b) => b.user_id === UID && b.date === DAY && b.title === 'Estudar');
  ok(est && est.start_min === 540 && est.duration === 90, 'Foco com o nome digitado: "Estudar" das 09:00 às 10:30 (o nome digitado vale)');
  // mexer no horário desmarca
  await newBlock(DAY);
  click(chip('Manhã')); await sleep(10);
  change(pd.querySelector('[data-time-for="f-start"] .time-m'), '30'); await sleep(20);
  ok(pressed().length === 0 && Q('f-title').placeholder !== 'Manhã', 'mexeu nos minutos: o período desmarca e o nome volta a ser "' + Q('f-title').placeholder + '"');
  change(pd.querySelector('[data-time-for="f-start"] .time-m'), '0'); await sleep(20);
  ok(J(pressed()) === J(['Manhã 06:00–12:00']), 'voltou pro horário do período: marca de novo');
  change(Q('f-dur'), '60'); await sleep(20);
  ok(pressed().length === 0, 'mudou a duração: desmarca');
  click(Q('f-cancel')); await sleep(30);
  ok(!vis('modal-task'), '(Cancelar fecha)');
  // bloco que já existe: sem a linha dos períodos
  click(pd.querySelector('.ag-view[data-view="week"]')); click(Q('ag-today')); await sleep(20);
  for (let i = 0; i < 5; i++) { click(Q('ag-next')); await sleep(15); }
  const blockEl = pd.querySelector('#ag-cols [data-block="' + reu.id + '"]');
  if (blockEl) { click(blockEl); await sleep(40); }
  ok(!!blockEl && vis('modal-task') && !vis('f-per-wrap') && Q('f-title').value === 'Reunião', 'bloco que já existe aberto (Reunião, na semana de 14/12): sem a linha "Período"');
  click(Q('f-cancel')); await sleep(30);

  // ======================================================================================================
  console.log('\nD) Os dois lados juntos:');
  await syncDone();
  await waitFor(() => names(pers()) === 'Madrugada,Manhã,Reunião,Plantão,Foco,Café,Leitura');
  ok(names(pers()) === 'Madrugada,Manhã,Reunião,Plantão,Foco,Café,Leitura' && perAt() === meta().faz_periods_at, 'o celular recebe o que o PC criou e apagou (' + names(pers()) + ')');
  ev('openSheet(); openPeriodSelectSheet();');
  ok(/Leitura/.test($('period-select-container').textContent) && /22:00 às 23:00/.test($('period-select-container').textContent), 'o "Período" do + no celular já mostra o Leitura (22:00 às 23:00)');
  ev('closeAllSheets && closeAllSheets();');
  // celular cria → o PC vê ao abrir Configurações
  ev('openConfigSheet(); openConfigPeriods();');
  $('config-period-name').value = 'Yoga'; $('config-period-start').value = '06:30'; $('config-period-end').value = '07:15';
  w.addConfigPeriod();
  await waitFor(() => names(meta().faz_periods).includes('Yoga'), 12000);
  ev('closeConfigPeriods(); closeAllSheets && closeAllSheets();');
  click(Q('btn-cfg')); await sleep(30);
  await waitFor(() => rows().some((r) => r.startsWith('Yoga')), 3000);
  ok(rows()[rows().length - 1] === 'Yoga 06:30 às 07:15', 'o celular criou "Yoga": abrir Configurações no PC já mostra');
  pd.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(20);
  await newBlock(DAY2);
  ok(chips().some((b) => b.textContent.startsWith('Yoga')), 'e o Novo bloco também');
  pd.dispatchEvent(new pw.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(30);
  ok(errors.length === 0, 'nenhum erro na tela do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  pw.close();

  // ======================================================================================================
  console.log('\nE) Conta só do PC (sem celular): os 4 padrão do celular, e criar grava todos:');
  {
    server.addUser(EMAIL2, 'senha123', UID2);
    const meta2 = () => server.users.get(EMAIL2).meta;
    const d2 = bootPc(UID2, EMAIL2, {});
    const w2 = d2.window, D = w2.document, Q2 = (id) => D.getElementById(id);
    const click2 = (el) => el.dispatchEvent(new w2.MouseEvent('click', { bubbles: true, cancelable: true }));
    const change2 = (el, v) => { el.value = v; el.dispatchEvent(new w2.Event('change', { bubbles: true })); };
    const rows2 = () => [...D.querySelectorAll('#cfg-pers > div')].map((d) => [...d.querySelectorAll('span')].map((x) => x.textContent.trim()).join(' '));
    await waitFor(() => D.querySelectorAll('section.col').length >= 1, 8000);
    click2(Q2('btn-cfg')); await sleep(60);
    ok(J(rows2()) === J(['Manhã 08:00 às 12:00', 'Meio-dia 12:00 às 13:00', 'Tarde 13:00 às 18:00', 'Noite 18:00 às 22:00']), 'conta sem períodos: os 4 padrão do celular (' + rows2().map((r) => r.split(' ')[0]).join(', ') + ')');
    ok(!('faz_periods' in meta2()), 'só mostrar não grava nada na conta');
    Q2('cfg-per-name').value = 'Madrugada';
    const box = (id) => D.querySelector('[data-time-for="' + id + '"]');
    change2(box('cfg-per-st').querySelector('.time-h'), '0'); change2(box('cfg-per-en').querySelector('.time-h'), '6');
    click2(Q2('cfg-per-add'));
    await waitFor(() => meta2().faz_periods); await sleep(30);
    ok(names(meta2().faz_periods) === 'Manhã,Meio-dia,Tarde,Noite,Madrugada' && meta2().faz_periods_at > 0, 'criou "Madrugada": a conta fica com os 4 padrão + ela');
    ok(server.users.get(EMAIL).meta.faz_periods.length === 8, 'a conta do outro (Jhonatan) não muda');
    w2.close();
  }

  ok(A.errors.length === 0, 'nenhum erro no celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
