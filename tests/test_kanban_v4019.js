// V40.19.0 — tela do PC (kanban.html): aba Finanças (as mesmas despesas do celular, com as regras do app) e as setas
// ← → do teclado (Agenda: semana ou dia; Listas: uma lista pro lado; Finanças: mês).
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4019.js <repo> <backup.json>
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
// uma despesa com tag, pra conferir a cor e o nome da tag na linha
server.patch('financas', UID, 'fin_1700001703000', { tag_id: local.tags[2].id });

// as regras do app, escritas de novo aqui (independentes do kanban.html) pra conferir a tela
const NOW = '2026-11', DAY = 16;
const addM = (m, n) => { const [y, mo] = m.split('-').map(Number), d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const inM = (r, m) => (r.duration_months === 1 ? r.start_month === m : m >= r.start_month && m <= addM(r.start_month, r.duration_months - 1));
const amt = (r, m) => (r.amount_overrides && r.amount_overrides[m] ? r.amount_overrides[m].amount : r.amount);
const paidIn = (r, m) => r.paid_months.includes(m);
const lateIn = (r, m) => !paidIn(r, m) && !!r.due_day && (m < NOW || (m === NOW && r.due_day < DAY));
const BRL = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const sortApp = (a, b) => (a.due_day && b.due_day ? a.due_day - b.due_day || a.created_ms - b.created_ms : a.due_day ? -1 : b.due_day ? 1 : b.created_ms - a.created_ms);

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
  const key = (el, k, extra) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const typeIn = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const visible = (id) => !$(id).classList.contains('hidden');
  const F = (id, uid) => server.get('financas', uid || UID, id);
  const lastLog = (op, t) => server.log.filter((x) => x.op === op && (!t || x.t === t)).pop();
  const confirmDialog = async () => { await waitFor(() => visible('dialog')); click($('dlg-ok')); await sleep(20); };
  const toast = () => $('toast').textContent;
  const rowIds = () => [...d.querySelectorAll('#fn-list [data-fn]')].map((r) => r.dataset.fn);
  const row = (id) => d.querySelector(`#fn-list [data-fn="${id}"]`);
  const cells = (id) => [...row(id).children].map((c) => c.textContent.replace(/\s+/g, ' ').trim());
  const alive = () => server.alive('financas', UID);
  const expectMonth = (m) => {
    const list = alive().filter((r) => inM(r, m)).sort(sortApp);
    return { unpaid: list.filter((r) => !paidIn(r, m)).map((r) => r.id), paid: list.filter((r) => paidIn(r, m)).map((r) => r.id), list };
  };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);

  console.log('F) Aba Finanças — o mês de hoje:');
  ok([...d.querySelectorAll('.tab')].map((b) => b.textContent.trim()).join(',').includes('Listas,Agenda,Rotinas,Notas,Finanças'), 'abas: Listas, Agenda, Rotinas, Notas e Finanças (o Assistente vem na frente desde a V40.20.0 e as Metas no fim desde a V40.21.0)');
  click($('tab-financas'));
  ok(visible('financas') && !visible('board') && $('tab-financas').classList.contains('on') && w.localStorage.getItem('faz_pc_tab') === 'financas', 'Finanças abre e fica lembrada');
  ok($('fn-label').textContent === 'Novembro 2026' && !visible('zoom-ctl'), 'abre no mês de hoje (Novembro 2026), sem zoom');
  let ex = expectMonth(NOW);
  ok(rowIds().join() === ex.unpaid.concat(ex.paid).join(), `as ${ex.list.length} despesas de novembro, "a pagar" primeiro e cada grupo pelo dia do vencimento (como no app)`);
  const heads = [...d.querySelectorAll('#fn-list section h3')].map((h) => h.textContent);
  ok(heads.join('|') === `A pagar (${ex.unpaid.length})|Pagas (${ex.paid.length})`, 'títulos dos grupos com a contagem: ' + heads.join(' e '));
  const sum = (ids, f) => ids.reduce((a, id) => a + f(F(id)), 0);
  const tot = sum(ex.unpaid.concat(ex.paid), (r) => amt(r, NOW)), pd = sum(ex.paid, (r) => amt(r, NOW)), op = sum(ex.unpaid, (r) => amt(r, NOW));
  const late = ex.unpaid.filter((id) => lateIn(F(id), NOW));
  ok($('fn-total').textContent === BRL(tot) && $('fn-paid').textContent === BRL(pd) && $('fn-open').textContent === BRL(op), `totais iguais aos do app: total ${BRL(tot)}, pago ${BRL(pd)}, em aberto ${BRL(op)}`);
  ok(late.length > 0 && $('fn-late').textContent === `${late.length} ${late.length === 1 ? 'atrasada' : 'atrasadas'}: ${BRL(sum(late, (r) => amt(r, NOW)))}` && late.every((id) => row(id).classList.contains('late') && /^Venceu dia \d+$/.test(cells(id)[3])), `${late.length} atrasada(s) em destaque ("Venceu dia N" em vermelho) e somadas embaixo do "Em aberto"`);
  ok($('board-summary').textContent === `${ex.list.length} despesas em novembro · ${late.length} ${late.length === 1 ? 'atrasada' : 'atrasadas'}`, 'resumo no topo: "' + $('board-summary').textContent + '"');
  // tipo, valor do mês e tag
  ok(cells('fin_1700001704000')[2] === 'Parcela 4/8' && cells('fin_1700001703000')[2] === 'Recorrente' && row('fin_1700001704000').children[2].title === 'De ago/2026 a mar/2027', 'tipo: "Parcela 4/8", "Recorrente" (e o período no título)');
  const sp = (t) => t.replace(/\s+/g, ' '); // cells() troca o espaço fino do "R$" por espaço comum
  ok(cells('fin_1700001707000')[4] === sp(BRL(295.5)) + 'valor deste mês' && cells('fin_1700001718000')[4] === sp(BRL(432.9)), 'valor com o "valor deste mês" quando o mês tem valor próprio (R$ 295,50 em vez de R$ 725,90)');
  const tagRow = row('fin_1700001703000');
  ok(tagRow.textContent.includes(local.tags[2].name) && /--fn-tag:#10b981/.test(tagRow.getAttribute('style')), 'despesa com tag mostra a tag e a faixa da cor dela');
  ok(row('fin_1700001707000').querySelector('[data-fn-pay]').getAttribute('aria-pressed') === 'true' && row('fin_1700001707000').querySelector('.line-through'), 'paga: bolinha marcada e valor riscado');

  console.log('\nG) Trocar de mês (botões e setas do teclado):');
  click($('fn-prev'));
  ex = expectMonth('2026-10');
  ok($('fn-label').textContent === 'Outubro 2026' && rowIds().join() === ex.unpaid.concat(ex.paid).join(), 'mês anterior: Outubro 2026, com as despesas de lá');
  ok(ex.unpaid.filter((id) => !!F(id).due_day).every((id) => row(id).classList.contains('late')), 'no mês que já passou, tudo que não foi pago aparece atrasado');
  ok($('fn-today').classList.contains('ag-filter-on'), '"Este mês" fica destacado quando a tela está em outro mês');
  click($('fn-today'));
  ok($('fn-label').textContent === 'Novembro 2026' && !$('fn-today').classList.contains('ag-filter-on'), '"Este mês" volta pra novembro');
  ok(key(d.body, 'ArrowRight') && $('fn-label').textContent === 'Dezembro 2026', '→ vai pro mês seguinte');
  ok(key(d.body, 'ArrowLeft') && $('fn-label').textContent === 'Novembro 2026', '← volta');
  ok(!key(d.body, 'ArrowLeft', { altKey: true }) && $('fn-label').textContent === 'Novembro 2026', 'Alt+← (voltar do navegador) não mexe');
  for (let i = 0; i < 22; i++) click($('fn-prev'));
  ok(rowIds().length === 0 && visible('fn-empty') && $('fn-empty-text').textContent === 'Nenhuma despesa em janeiro de 2025.' && !visible('fn-empty-hint'), 'mês sem nada: "Nenhuma despesa em janeiro de 2025." (sem o aviso do celular, porque já tem despesas)');
  click($('fn-today'));

  console.log('\nH) Pagar e desmarcar:');
  const toPay = expectMonth(NOW).unpaid[0];
  click(row(toPay).querySelector('[data-fn-pay]'));
  await waitFor(() => F(toPay).paid_months.includes(NOW));
  ok(F(toPay).paid_months.includes(NOW) && lastLog('update', 'financas').fields.join() === 'paid_months' && toast() === 'Paga em novembro de 2026', 'a bolinha marca paga em novembro (só o campo paid_months sobe)');
  ok(expectMonth(NOW).paid.includes(toPay) && rowIds().join() === expectMonth(NOW).unpaid.concat(expectMonth(NOW).paid).join(), 'a despesa passa pro grupo "Pagas" e os totais acompanham');
  click(row(toPay).querySelector('[data-fn-pay]'));
  await waitFor(() => !F(toPay).paid_months.includes(NOW));
  ok(!F(toPay).paid_months.includes(NOW) && toast() === 'Voltou pra "a pagar"', 'clicar de novo desmarca');
  const prevMonths = F('fin_1700001703000').paid_months.slice();
  click(row('fin_1700001703000').querySelector('[data-fn-pay]'));
  await waitFor(() => !F('fin_1700001703000').paid_months.includes(NOW));
  ok(JSON.stringify(F('fin_1700001703000').paid_months) === JSON.stringify(prevMonths.filter((m) => m !== NOW)), 'desmarcar novembro não mexe nos outros meses pagos');
  click(row('fin_1700001703000').querySelector('[data-fn-pay]')); await waitFor(() => F('fin_1700001703000').paid_months.includes(NOW));

  console.log('\nI) Nova despesa:');
  click($('fn-new'));
  ok(visible('modal-fin') && $('fn-f-head').textContent === 'Nova despesa' && $('fn-f-sub').textContent === 'Começa em novembro de 2026.' && !visible('fn-f-delete') && d.activeElement === $('fn-f-title'), 'abre vazia, começando no mês da tela, sem "Apagar"');
  ok(d.querySelector('#fn-f-type .on').dataset.type === 'oneshot' && $('fn-f-range').textContent === 'Só em novembro de 2026.' && $('fn-f-paid-label').textContent === 'Marcar como paga em novembro de 2026', 'Avulsa por padrão: "Só em novembro de 2026."');
  const n0 = server.rows('financas', UID).length;
  click($('fn-f-save')); await sleep(20);
  ok(visible('modal-fin') && toast() === 'Dê um nome pra despesa.', 'sem nome não salva');
  typeIn($('fn-f-title'), 'Internet');
  typeIn($('fn-f-amount'), 'abc'); click($('fn-f-save')); await sleep(20);
  ok(toast() === 'Informe um valor maior que zero.' && d.activeElement === $('fn-f-amount'), 'valor inválido não salva');
  typeIn($('fn-f-amount'), '1.234,56'); typeIn($('fn-f-due'), '40'); click($('fn-f-save')); await sleep(20);
  ok(toast() === 'O vencimento é um dia de 1 a 31.', 'vencimento fora de 1–31 não salva');
  typeIn($('fn-f-due'), '10');
  click(d.querySelector('#fn-f-type [data-type="installment"]'));
  ok(visible('fn-f-inst-wrap') && d.activeElement === $('fn-f-inst') && $('fn-f-range').textContent === '2 parcelas: de nov/2026 a dez/2026.', 'Parcelada mostra o campo de parcelas (cursor já nele) e o período');
  typeIn($('fn-f-inst'), '1');
  ok($('fn-f-range').textContent === 'As parcelas vão de 2 a 60.', 'parcela fora de 2–60 avisa na hora');
  click($('fn-f-save')); await sleep(20);
  ok(server.rows('financas', UID).length === n0 && toast() === 'As parcelas vão de 2 a 60.', '...e não salva');
  typeIn($('fn-f-inst'), '3');
  ok($('fn-f-range').textContent === '3 parcelas: de nov/2026 a jan/2027.', '3 parcelas: "de nov/2026 a jan/2027."');
  click($('fn-f-paid'));
  ok($('fn-f-paid').getAttribute('aria-pressed') === 'true' && $('fn-f-paid-label').textContent === 'Paga em novembro de 2026', '"Paga em novembro de 2026" marcado');
  click($('fn-f-save'));
  await waitFor(() => server.alive('financas', UID).some((r) => r.title === 'Internet'));
  const net = server.alive('financas', UID).find((r) => r.title === 'Internet');
  ok(net && /^fin_\d+$/.test(net.id) && net.amount === 1234.56 && net.start_month === NOW && net.duration_months === 3 && net.is_recurring === false && net.due_day === 10 && JSON.stringify(net.paid_months) === '["2026-11"]' && JSON.stringify(net.amount_overrides) === '{}' && net.created_ms === w.Date.now() && net.tag_id === null,
    'grava no formato do app: id fin_<hora>, R$ 1.234,56, de 2026-11, 3 parcelas, dia 10, paga em novembro');
  ok(!visible('modal-fin') && toast() === 'Despesa adicionada' && expectMonth(NOW).paid.includes(net.id) && cells(net.id)[2] === 'Parcela 1/3', 'aparece em "Pagas" como "Parcela 1/3"');
  click($('fn-next')); click($('fn-next'));
  ok(cells(net.id)[2] === 'Parcela 3/3' && row(net.id).querySelector('[data-fn-pay]').getAttribute('aria-pressed') === 'false', 'em janeiro: "Parcela 3/3", ainda não paga');
  click($('fn-next'));
  ok(!row(net.id), 'em fevereiro ela já não aparece');
  click($('fn-today'));

  console.log('\nJ) Editar (com as regras do app):');
  // só o nome, num mês em que a recorrente tem valor próprio: os valores ficam como estão (o app estragava isso)
  const d6 = 'fin_1700001707000', ov6 = JSON.stringify(F(d6).amount_overrides);
  click(row(d6));
  ok(visible('modal-fin') && $('fn-f-head').textContent === 'Editar despesa' && $('fn-f-title').value === F(d6).title && $('fn-f-amount').value === '295,50' && $('fn-f-due').value === '16' && d.querySelector('#fn-f-type .on').dataset.type === 'recurring' && visible('fn-f-delete'), 'abre com nome, valor DESTE mês (295,50), dia e tipo');
  ok(visible('fn-f-note') && $('fn-f-note').textContent === 'Neste mês o valor é diferente do normal (' + BRL(725.9) + ').' && $('fn-f-sub').textContent === 'O valor e o "paga" daqui são de novembro de 2026.', 'avisa que o mês tem valor próprio e de que mês são o valor e o "paga"');
  ok($('fn-f-range').textContent === 'Todo mês, de nov/2026 até out/2027.', 'mostra o período da recorrente (V40.30.0: esta, dos dados antigos, tem fim)');
  typeIn($('fn-f-title'), 'Aluguel'); key($('fn-f-title'), 'Enter');
  await waitFor(() => F(d6).title === 'Aluguel');
  ok(F(d6).title === 'Aluguel' && F(d6).amount === 725.9 && JSON.stringify(F(d6).amount_overrides) === ov6 && lastLog('update', 'financas').fields.join() === 'title', 'trocar só o nome grava só o nome: o valor normal e os valores por mês continuam iguais');
  // valor novo numa recorrente: pergunta em quais meses
  const d2 = 'fin_1700001703000';
  click(row(d2)); typeIn($('fn-f-amount'), '200'); click($('fn-f-save'));
  await waitFor(() => visible('fn-scope'));
  ok(visible('fn-scope') && visible('modal-fin') && $('fn-scope-text').textContent === `"${F(d2).title}": de ${BRL(177.9)} para ${BRL(200)}. Em quais meses?` && d.activeElement === d.querySelector('[data-scope="this"]'), 'valor novo numa recorrente pergunta em quais meses (como o app), com "Só neste mês" já escolhido');
  key(d.activeElement, 'Escape'); await sleep(20);
  ok(!visible('fn-scope') && visible('modal-fin') && d.activeElement === $('fn-f-amount') && F(d2).amount === 177.9, 'Esc desiste: nada grava e a janela continua aberta');
  click($('fn-f-save')); await waitFor(() => visible('fn-scope'));
  click(d.querySelector('[data-scope="this"]'));
  await waitFor(() => F(d2).amount_overrides[NOW]);
  ok(JSON.stringify(F(d2).amount_overrides) === '{"2026-11":{"amount":200}}' && F(d2).amount === 177.9 && lastLog('update', 'financas').fields.join() === 'amount_overrides', '"Só neste mês": valor próprio só em novembro');
  click(row(d2)); typeIn($('fn-f-amount'), '210'); click($('fn-f-save')); await waitFor(() => visible('fn-scope'));
  click(d.querySelector('[data-scope="future"]'));
  await waitFor(() => F(d2).amount === 210);
  const ov2 = F(d2).amount_overrides, ks = Object.keys(ov2);
  ok(F(d2).amount === 210 && ks.join() === '2026-07,2026-08,2026-09,2026-10' && ks.every((k) => ov2[k].amount === 177.9), '"Neste mês e nos próximos" (V40.30.0, recorrente): o valor normal vira 210 e os meses de antes (jul a out) guardam 177,90; o "só neste mês" de novembro sai');
  click(row(d2)); typeIn($('fn-f-amount'), '250,00'); click($('fn-f-save')); await waitFor(() => visible('fn-scope'));
  click(d.querySelector('[data-scope="all"]'));
  await waitFor(() => F(d2).amount === 250);
  ok(F(d2).amount === 250 && JSON.stringify(F(d2).amount_overrides) === '{}', '"Em todos os meses": troca o valor normal e apaga os valores por mês');
  // avulsa: troca o valor sem perguntar
  click($('fn-prev'));
  const one = expectMonth('2026-10').list.find((r) => r.duration_months === 1).id;
  click(row(one)); typeIn($('fn-f-amount'), '99,90'); click($('fn-f-save'));
  await waitFor(() => F(one).amount === 99.9);
  ok(F(one).amount === 99.9 && !visible('fn-scope'), 'avulsa troca o valor direto, sem perguntar');
  click($('fn-today'));
  // trocar o tipo: recomeça pagos e valores (igual ao app) e avisa quando sai do mês da tela
  const d3 = 'fin_1700001704000';
  click(row(d3)); click(d.querySelector('#fn-f-type [data-type="oneshot"]'));
  ok($('fn-f-range').textContent === 'Só em agosto de 2026.', 'virar Avulsa mostra o mês dela (o de início: agosto)');
  click($('fn-f-save'));
  await waitFor(() => F(d3).duration_months === 1);
  ok(F(d3).duration_months === 1 && F(d3).is_recurring === false && JSON.stringify(F(d3).paid_months) === '[]' && JSON.stringify(F(d3).amount_overrides) === '{}' && F(d3).amount === 314.9, 'trocou o tipo: 1 mês, pagos e valores por mês recomeçam (como no app)');
  ok(!row(d3) && toast() === 'Despesa salva. Agora ela fica só em agosto de 2026.', 'some de novembro e o aviso diz onde ela foi parar');
  // abriu e salvou sem mudar nada: nada sobe
  const nUpd = server.log.filter((x) => x.op === 'update').length;
  click(row(d6)); click($('fn-f-save')); await sleep(40);
  ok(server.log.filter((x) => x.op === 'update').length === nUpd && !visible('modal-fin'), 'salvar sem mudar nada não grava nada');
  // marcar paga pelo formulário
  const d18 = 'fin_1700001719000';
  click(row(d18)); const was18 = paidIn(F(d18), NOW); click($('fn-f-paid')); click($('fn-f-save'));
  await waitFor(() => paidIn(F(d18), NOW) !== was18);
  ok(paidIn(F(d18), NOW) !== was18 && lastLog('update', 'financas').fields.join() === 'paid_months', 'o "paga" do formulário vale pro mês da tela');

  console.log('\nK) Apagar e tempo real:');
  const toDel = expectMonth(NOW).unpaid[0];
  click(row(toDel).querySelector('[data-fn-del]'));
  await waitFor(() => visible('dialog'));
  const tDel = F(toDel);
  ok($('dlg-title').textContent === `Apagar a despesa "${tDel.title}"?` && (tDel.duration_months > 1 ? /^Ela sai de todos os meses \(de [a-zç]{3}\/\d{4} a [a-zç]{3}\/\d{4}\), aqui e no celular\.$/ : /^Ela sai aqui e no celular\.$/).test($('dlg-text').textContent), 'apagar pergunta antes: "' + $('dlg-text').textContent + '"');
  click($('dlg-cancel')); await sleep(20);
  ok(!F(toDel).deleted && !!row(toDel), 'Cancelar não apaga');
  click(row(toDel).querySelector('[data-fn-del]')); await confirmDialog();
  await waitFor(() => F(toDel).deleted === true);
  ok(F(toDel).deleted === true && !row(toDel) && toast() === 'Despesa apagada', 'confirmou: vira tombstone na nuvem e sai da tela');
  server.patch('financas', UID, d6, { title: 'Mudou no celular', paid_months: [] });
  await waitFor(() => row(d6) && cells(d6)[1] === 'Mudou no celular');
  ok(cells(d6)[1] === 'Mudou no celular' && expectMonth(NOW).unpaid.includes(d6) && rowIds().join() === expectMonth(NOW).unpaid.concat(expectMonth(NOW).paid).join(), 'mudança feita no celular aparece na hora (nome e pago)');
  server.insert('financas', UID, { id: 'fin_cel_1', title: 'Criada no celular', amount: 42, start_month: NOW, duration_months: 1, due_day: 1, created_ms: 5 });
  await waitFor(() => !!row('fin_cel_1'));
  ok(!!row('fin_cel_1') && row('fin_cel_1').classList.contains('late'), 'despesa nova do celular aparece (dia 1 de novembro já venceu)');
  click(row('fin_cel_1'));
  server.patch('financas', UID, 'fin_cel_1', { deleted: true });
  await waitFor(() => !visible('modal-fin'));
  ok(!visible('modal-fin') && toast() === 'Essa despesa foi apagada em outro aparelho.', 'apagada no celular com a janela aberta: fecha e avisa');
  const xss = '<img src=x onerror=alert(1)>';
  server.insert('financas', UID, { id: 'fin_xss', title: xss, amount: 1, start_month: NOW, duration_months: 1, created_ms: 6 });
  await waitFor(() => !!row('fin_xss'));
  ok(!d.querySelector('#fn-list img') && cells('fin_xss')[1] === xss, 'nome com HTML aparece como texto');

  console.log('\nL) Setas na Agenda e nas Listas:');
  click($('tab-agenda'));
  const week0 = $('ag-label').textContent;
  ok(key(d.body, 'ArrowRight') && $('ag-label').textContent !== week0 && key(d.body, 'ArrowLeft') && $('ag-label').textContent === week0, 'Semana: → passa pra próxima semana e ← volta (' + week0 + ')');
  click(d.querySelector('.ag-view[data-view="day"]'));
  const day0 = $('ag-label').textContent;
  key(d.body, 'ArrowLeft');
  const day1 = $('ag-label').textContent;
  key(d.body, 'ArrowRight');
  ok(day1 !== day0 && $('ag-label').textContent === day0, 'Dia: ← vai pro dia anterior (' + day1 + ') e → volta');
  click(d.querySelector('.ag-view[data-view="week"]'));
  $('ag-tag').focus();
  ok(!key($('ag-tag'), 'ArrowRight') && $('ag-label').textContent === week0, 'com o cursor no filtro de tag, as setas são do filtro (a semana não muda)');
  $('ag-tag').blur();
  click($('ag-new'));
  ok(visible('modal-task') && !key(d.body, 'ArrowRight') && $('ag-label').textContent === week0, 'com uma janela aberta, as setas não mudam a semana');
  key(d.body, 'Escape');
  click($('tab-listas'));
  ok(key(d.body, 'ArrowRight') && errors.length === 0, 'Listas: a seta é usada pra rolar pro lado (a rolagem de verdade é conferida no teste de navegador)');

  console.log('\nM) Quem só usa o computador:');
  click($('btn-logout')); await confirmDialog(); await waitFor(() => visible('view-login'));
  w.localStorage.setItem('faz_pc_tab', 'financas');
  server.addUser('socio@teste.com', 'senha456', UID2);
  $('login-email').value = 'socio@teste.com'; $('login-pass').value = 'senha456';
  $('login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => visible('view-board') && visible('fn-empty'));
  ok(visible('financas') && visible('fn-empty') && visible('fn-empty-hint') && $('fn-total').textContent === BRL(0), 'conta sem despesas: aba vazia com o convite e o aviso de quem usa o celular');
  click($('fn-empty-new')); typeIn($('fn-f-title'), 'Contador'); typeIn($('fn-f-amount'), '350'); click(d.querySelector('#fn-f-type [data-type="recurring"]')); typeIn($('fn-f-due'), '5'); click($('fn-f-save'));
  await waitFor(() => server.alive('financas', UID2).length === 1);
  const c = server.alive('financas', UID2)[0];
  ok(c.title === 'Contador' && c.amount === 350 && c.duration_months === 1200 && c.is_recurring === true && c.due_day === 5 && c.start_month === NOW, 'cria uma recorrente sem fim pelo computador (V40.30.0: 1200 meses)');
  ok(!visible('fn-empty') && !!row(c.id) && row(c.id).classList.contains('late') && cells(c.id)[2] === 'Recorrente', 'aparece na hora (dia 5 já passou: atrasada)');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
