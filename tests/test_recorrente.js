// V40.30.0 — Recorrente SEM FIM, até encerrar (escolha do Jhonatan em 17/11/2026), no celular e no PC:
// criar (1200 meses = sem fim), editar sem mexer no fim, valor "neste e nos próximos" sem escrever 1200 meses,
// Encerrar depois do mês da tela, Repetir sem fim de novo, encerrar no 1º mês (vira avulsa), as antigas de 12 meses,
// os textos, o Desfazer, a nuvem e a tela do PC (as mesmas regras), nos dois sentidos.
// Uso: TZ='America/Sao_Paulo' node test_recorrente.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const bootPhone = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '11111111-1111-1111-1111-111111111111';

(async () => {
  const B = await bootPhone(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const fin = (id) => J(`financialDb.find((x) => x.id === ${JSON.stringify(id)}) || null`);
  const steps = () => J('undoStack.map((s) => s.label)');
  const lastStep = () => { const s = steps(); return s[s.length - 1] || ''; };
  const inMonth = (id, m) => ev(`isItemInMonth(financialDb.find((x) => x.id === ${JSON.stringify(id)}), '${m}')`);
  const shown = (id) => !$(id).classList.contains('hidden');
  const month = (m) => { ev(`currentFinanceMonth = '${m}'; renderFinancial();`); };
  const card = (title) => [...d.querySelectorAll('#financial-container [onclick^="openFinancialForm"]')].find((c) => c.querySelector('h4').textContent === title);
  const newFin = (title, amount, type, extra) => {
    w.openFinancialForm(null);
    $('financial-input').value = title; $('financial-amount-input').value = String(amount); $('financial-dueday-input').value = (extra && extra.due) || '';
    w.selectFinancialType(type);
  };
  ev('openListSheet && openListSheet();');

  // ======================================================================================================
  console.log('A) Nova recorrente no celular: sem fim');
  month('2026-11');
  newFin('Internet', 99.9, 'recurring', { due: '10' });
  ok(shown('fin-recurring-info') && $('fin-recurring-text').textContent === 'Repete todo mês, sem fim. Quando não precisar mais, abra a despesa e toque em Encerrar.' && !shown('fin-end-btn') && !shown('fin-reopen-btn'), 'o formulário diz "Repete todo mês, sem fim…" (sem os botões: ela ainda não existe)');
  ok(!/12 meses|renovar/i.test(d.getElementById('financial-form-view').textContent), 'não fala mais em "12 meses" nem em "renovar"');
  w.saveFinancialForm();
  const I = ev("financialDb.find((x) => x.title === 'Internet').id");
  let it = fin(I);
  ok(it.isRecurring === true && it.durationMonths === 1200 && it.startMonth === '2026-11' && it.amount === 99.9, 'salvou: recorrente com 1200 meses (= sem fim), começando em novembro');
  ok(inMonth(I, '2026-11') && inMonth(I, '2027-11') && inMonth(I, '2031-01') && inMonth(I, '2126-10') && !inMonth(I, '2126-11') && !inMonth(I, '2026-10'), 'aparece em novembro, no 13º mês, em 2031… (e não antes de começar)');
  month('2027-12');
  ok(!!card('Internet') && card('Internet').querySelector('[title^="Recorrente"]').title === 'Recorrente, sem fim', 'em dezembro de 2027 continua lá (antes sumia depois de 12 meses); a etiqueta R diz "Recorrente, sem fim"');

  // ======================================================================================================
  console.log('\nB) Editar sem mexer no fim:');
  month('2026-11');
  ev(`togglePaidFinancial('${I}', '2026-11')`);
  w.openFinancialForm(I);
  ok($('fin-recurring-text').textContent === 'Repete todo mês, sem fim (desde novembro de 2026).' && shown('fin-end-btn') && $('fin-end-label').textContent === 'Encerrar depois de novembro' && !shown('fin-reopen-btn'), 'aberta: "Repete todo mês, sem fim (desde novembro de 2026)." e o botão "Encerrar depois de novembro"');
  $('financial-input').value = 'Internet fibra';
  w.saveFinancialForm();
  it = fin(I);
  ok(it.title === 'Internet fibra' && it.durationMonths === 1200 && JSON.stringify(it.paidMonths) === '["2026-11"]', 'trocar o nome não mexe no "sem fim" nem no que estava pago');

  // ======================================================================================================
  console.log('\nC) Valor novo "neste e nos próximos" numa sem fim:');
  month('2027-02');
  w.openFinancialForm(I);
  $('financial-amount-input').value = '120';
  w.saveFinancialForm();
  ok(shown('financial-edit-scope-modal'), 'valor novo pergunta em quais meses');
  w.confirmEditScope('future');
  it = fin(I);
  const ov = it.paidMonthsOverrides || {};
  ok(it.amount === 120 && Object.keys(ov).join() === '2026-11,2026-12,2027-01' && Object.values(ov).every((o) => o.amount === 99.9), 'o valor normal vira 120 e os meses de antes (nov a jan) guardam 99,90: 3 valores guardados, não 1200');
  ok(ev(`getAmountInMonth(financialDb.find((x) => x.id === '${I}'), '2026-12')`) === 99.9 && ev(`getAmountInMonth(financialDb.find((x) => x.id === '${I}'), '2027-02')`) === 120 && ev(`getAmountInMonth(financialDb.find((x) => x.id === '${I}'), '2040-06')`) === 120, 'dezembro continua 99,90; fevereiro e 2040 são 120');
  w.openFinancialForm(I); $('financial-amount-input').value = '130'; w.saveFinancialForm(); w.confirmEditScope('this');
  ok(fin(I).paidMonthsOverrides['2027-02'].amount === 130 && fin(I).amount === 120, '"só neste mês" continua igual (só fevereiro)');

  // ======================================================================================================
  console.log('\nD) Encerrar:');
  month('2027-03');
  ev(`(() => { const x = financialDb.find((y) => y.id === '${I}'); x.paidMonths.push('2027-03', '2027-06'); x.paidMonthsOverrides['2027-08'] = { amount: 1 }; saveFinancial(); })()`);
  await sleep(20); // cada toque vira um passo do Desfazer
  w.openFinancialForm(I);
  ok($('fin-end-label').textContent === 'Encerrar depois de março de 2027', 'num mês de outro ano o botão diz o ano: "Encerrar depois de março de 2027"');
  w.endRecurringFromForm();
  const modal = $('goal-confirm-modal');
  ok(!modal.classList.contains('hidden') && $('goal-confirm-title').textContent === 'Encerrar "Internet fibra"?' && $('goal-confirm-text').textContent === 'Ela fica até março de 2027 e sai dos meses seguintes. Os meses que já passaram continuam como estão.' && $('goal-confirm-btn').textContent === 'Encerrar', 'pergunta: "Encerrar …? Ela fica até março de 2027 e sai dos meses seguintes…"');
  ok(modal.classList.contains('ask-neutral') && $('goal-confirm-ico').className === 'ph ph-calendar-x text-2xl', 'janelinha na cor do app, com o calendário (não é apagar)');
  w.cancelGoalAction();
  ok(fin(I).durationMonths === 1200, 'Cancelar: continua sem fim');
  await sleep(20);
  w.endRecurringFromForm(); w.confirmGoalAction();
  await sleep(20);
  it = fin(I);
  ok(it.durationMonths === 5 && JSON.stringify(it.paidMonths) === '["2026-11","2027-03"]' && !('2027-08' in it.paidMonthsOverrides) && it.paidMonthsOverrides['2027-02'].amount === 130, 'encerrou: 5 meses (nov a mar); o pago e o valor de depois de março saem; os de antes ficam');
  ok(inMonth(I, '2027-03') && !inMonth(I, '2027-04'), 'fica em março e some em abril');
  ok(shown('financial-form-view') && $('fin-recurring-text').textContent === 'Repete todo mês até março de 2027.' && !shown('fin-end-btn') && shown('fin-reopen-btn'), 'o formulário continua aberto: "Repete todo mês até março de 2027." e o botão "Repetir sem fim de novo"');
  ok(lastStep() === 'Despesa encerrada', 'Desfazer: "Despesa encerrada"');
  month('2027-04');
  ok(!card('Internet fibra'), 'em abril de 2027 ela não aparece');
  ok(ev('fazUndo()') === true && fin(I).durationMonths === 1200 && fin(I).paidMonths.includes('2027-06'), 'desfazer volta a ser sem fim (com o que tinha)');
  ok(ev('fazRedo()') === true && fin(I).durationMonths === 5, 'refazer encerra de novo');
  // salvar depois de encerrada não reabre
  month('2027-01');
  w.openFinancialForm(I); $('financial-input').value = 'Internet'; w.saveFinancialForm();
  ok(fin(I).durationMonths === 5 && fin(I).title === 'Internet', 'salvar o formulário de uma encerrada não reabre (continua até março)');
  w.openFinancialForm(I);
  ok(shown('fin-end-btn') && $('fin-end-label').textContent === 'Encerrar depois de janeiro de 2027' && shown('fin-reopen-btn'), 'olhando janeiro: dá pra encerrar antes (depois de janeiro) ou voltar a repetir');

  // ======================================================================================================
  console.log('\nE) Repetir sem fim de novo:');
  await sleep(20);
  w.reopenRecurringFromForm();
  await sleep(20);
  ok(fin(I).durationMonths === 1200 && $('fin-recurring-text').textContent === 'Repete todo mês, sem fim (desde novembro de 2026).' && !shown('fin-reopen-btn') && lastStep() === 'Despesa voltou a repetir', 'volta a ser sem fim ("Despesa voltou a repetir")');
  w.closeFinancialForm();

  // ======================================================================================================
  console.log('\nF) Encerrar no 1º mês: fica só nele (vira avulsa):');
  month('2026-12');
  newFin('Curso', 300, 'recurring');
  w.saveFinancialForm();
  const C = ev("financialDb.find((x) => x.title === 'Curso').id");
  w.openFinancialForm(C);
  ok($('fin-end-label').textContent === 'Encerrar depois de dezembro', 'botão "Encerrar depois de dezembro"');
  w.endRecurringFromForm(); w.confirmGoalAction();
  ok(fin(C).durationMonths === 1 && $('fin-type-oneshot').classList.contains('on') && !shown('fin-recurring-info'), 'encerrou no mês em que começou: 1 mês só e o formulário passa pra "Avulsa"');
  w.saveFinancialForm();
  ok(fin(C).durationMonths === 1 && !inMonth(C, '2027-01'), 'salvar mantém (avulsa de dezembro)');

  // ======================================================================================================
  console.log('\nG) As antigas (12 meses) continuam com o fim delas até a nuvem trocar:');
  const OLD = 'fin_1700001707000';
  const old = fin(OLD);
  month(old.startMonth);
  w.openFinancialForm(OLD);
  ok(old.isRecurring && old.durationMonths === 12 && /^Repete todo mês até [a-zç]+ de \d{4}\.$/.test($('fin-recurring-text').textContent) && shown('fin-reopen-btn'), 'uma recorrente antiga (12 meses): "' + $('fin-recurring-text').textContent + '" e o "Repetir sem fim de novo"');
  w.closeFinancialForm();

  // ======================================================================================================
  console.log('\nH) Na nuvem:');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'), 20000);
  w.closeAllSheets(); ev('openListSheet && openListSheet();');
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st, 20000); await sleep(60); };
  const r1 = server.get('financas', UID, I), r2 = server.get('financas', UID, C);
  ok(r1 && r1.duration_months === 1200 && r1.is_recurring === true && r1.amount === 120 && Object.keys(r1.amount_overrides).length === 4, 'a sem fim sobe com duration_months = 1200 (e só 4 valores por mês)');
  ok(r2 && r2.duration_months === 1, 'a encerrada no 1º mês sobe com 1 mês');
  // a "migration" da nuvem: as antigas de 12 meses viram sem fim, e o celular recebe
  server.patch('financas', UID, OLD, { duration_months: 1200 });
  await syncDone();
  ok(fin(OLD).durationMonths === 1200, 'quando a nuvem passa as antigas pra sem fim, o celular recebe');

  // ======================================================================================================
  console.log('\nI) Na tela do PC:');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  server.storedSession = { access_token: 'tok', user: { id: UID, email: 'j@t.com', user_metadata: { faz_hours: [7, 24] } } };
  const { makeCreateClient } = require('./mock_supabase');
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, FIX = new RD(2026, 10, 15, 21, 0, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const pw = dom.window, pd = pw.document, P = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new pw.Event('input', { bubbles: true })); };
  const vis = (id) => !P(id).classList.contains('hidden');
  const prow = (id) => pd.querySelector(`#fn-list [data-fn="${id}"]`);
  const F = (id) => server.get('financas', UID, id);
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  click(P('tab-financas')); await sleep(60);
  ok(!!prow(I) && prow(I).children[2].title === 'Desde nov/2026, sem fim', 'a sem fim aparece em novembro; passando o mouse no tipo: "Desde nov/2026, sem fim"');
  for (let i = 0; i < 14; i++) click(P('fn-next'));
  await sleep(20);
  ok(!!prow(I) && P('fn-label').textContent === 'Janeiro 2028', 'em janeiro de 2028 também (antes sumia em novembro de 2027)');
  click(P('fn-today')); await sleep(20);
  click(prow(I)); await sleep(20);
  ok(vis('modal-fin') && P('fn-f-range').textContent === 'Todo mês, sem fim, a partir de nov/2026.' && vis('fn-f-rec') && vis('fn-f-end') && !vis('fn-f-reopen') && P('fn-f-end-label').textContent === 'Encerrar depois de novembro', 'formulário: "Todo mês, sem fim, a partir de nov/2026." e "Encerrar depois de novembro"');
  // salvar só o nome não mexe no sem fim
  typeIn(P('fn-f-title'), 'Internet casa'); click(P('fn-f-save'));
  await waitFor(() => F(I).title === 'Internet casa');
  ok(F(I).duration_months === 1200, 'salvar o nome no PC mantém o sem fim');
  // nova pelo PC
  click(P('fn-new') || P('fn-empty-new')); await sleep(20);
  typeIn(P('fn-f-title'), 'Academia'); typeIn(P('fn-f-amount'), '89,90');
  click(pd.querySelector('#fn-f-type [data-type="recurring"]')); await sleep(10);
  ok(P('fn-f-range').textContent === 'Todo mês, sem fim, a partir de nov/2026. Pra parar depois, abra a despesa e use Encerrar.' && !vis('fn-f-rec'), 'nova: "Todo mês, sem fim… Pra parar depois, abra a despesa e use Encerrar." (sem botões ainda)');
  click(P('fn-f-save'));
  await waitFor(() => Object.values(Object.fromEntries(server.tables.financas)).some((r) => r.title === 'Academia'));
  const A = [...server.tables.financas.values()].find((r) => r.title === 'Academia');
  ok(A && A.duration_months === 1200 && A.is_recurring === true, 'criada no PC: 1200 meses (sem fim)');
  // encerrar pelo PC
  await sleep(30);
  click(prow(A.id)); await sleep(20);
  click(P('fn-f-end')); await sleep(20);
  ok(vis('dialog') && P('dlg-title').textContent === 'Encerrar "Academia"?' && P('dlg-text').textContent === 'Ela fica até novembro de 2026 e sai dos meses seguintes. Os meses que já passaram continuam como estão.', 'Encerrar pergunta como no celular');
  click(P('dlg-ok'));
  await waitFor(() => F(A.id).duration_months === 1);
  ok(F(A.id).duration_months === 1 && pd.querySelector('#fn-f-type .on').dataset.type === 'oneshot', 'encerrou no 1º mês: 1 mês, e o formulário passa pra "Avulsa"');
  click(P('fn-f-cancel')); await sleep(20);
  // encerrar uma que começou antes
  click(P('fn-next')); click(P('fn-next')); await sleep(20); // janeiro 2027
  click(prow(I)); await sleep(20);
  click(P('fn-f-end')); await sleep(20); click(P('dlg-ok'));
  await waitFor(() => F(I).duration_months === 3);
  ok(F(I).duration_months === 3 && vis('fn-f-reopen') && !vis('fn-f-end') && P('fn-f-range').textContent === 'Todo mês, de nov/2026 até jan/2027.', 'janeiro: encerrou (nov a jan = 3 meses); mostra "de nov/2026 até jan/2027" e o "Repetir sem fim de novo"');
  ok(!Object.keys(F(I).amount_overrides).some((k) => k > '2027-01') && !F(I).paid_months.some((k) => k > '2027-01'), 'os valores e pagos depois de janeiro saem');
  click(P('fn-f-reopen'));
  await waitFor(() => F(I).duration_months === 1200);
  ok(F(I).duration_months === 1200 && !vis('fn-f-reopen') && vis('fn-f-end'), '"Repetir sem fim de novo" no PC');
  // valor "neste e nos próximos" no PC numa sem fim
  typeIn(P('fn-f-amount'), '150'); click(P('fn-f-save'));
  await waitFor(() => vis('fn-scope'));
  click(pd.querySelector('[data-scope="future"]'));
  await waitFor(() => F(I).amount === 150);
  const po = F(I).amount_overrides;
  ok(F(I).amount === 150 && Object.keys(po).every((k) => k < '2027-01') && po['2026-11'].amount === 99.9 && po['2026-12'].amount === 99.9 && Object.keys(po).length <= 3, '"Neste e nos próximos" (janeiro): o normal vira 150; os meses de antes guardam o deles; nada escrito pro futuro');
  // apagar: o texto não fala em fim
  click(prow(I).querySelector('[data-fn-del]')); await sleep(20);
  ok(P('dlg-text').textContent === 'Ela sai de todos os meses (desde nov/2026), aqui e no celular.', 'apagar: "Ela sai de todos os meses (desde nov/2026), aqui e no celular."');
  click(P('dlg-cancel')); await sleep(20);
  // o celular recebe o que o PC fez
  await syncDone();
  ok(fin(I).durationMonths === 1200 && fin(I).amount === 150 && fin(A.id).durationMonths === 1, 'o celular recebe o que o PC fez');
  ok(errors.length === 0, 'PC sem erros de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  ok(B.errors.length === 0, 'celular sem erros de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
