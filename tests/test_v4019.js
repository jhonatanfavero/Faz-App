// V40.19.0 no app real: editar uma despesa de vários meses sem mudar o valor não pode mexer nos valores.
// Antes, salvar (por exemplo, só o nome) num mês com valor próprio gravava aquele valor como o de todos os meses e
// apagava os valores por mês. O resto do formulário continua igual.
// Uso: TZ='America/Sao_Paulo' node test_v4019.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };

(async () => {
  // dados de teste com valores por mês no formato que o app grava ({ amount })
  const fin = [
    { id: 'fin_rec', title: 'Aluguel', amount: 1000, startMonth: '2026-09', durationMonths: 12, isRecurring: true, dueDay: 10, tagId: null, paidMonths: ['2026-09', '2026-10'], paidMonthsOverrides: { '2026-10': { amount: 950 }, '2026-11': { amount: 1100 }, '2027-01': { amount: 1200 } }, createdAt: 1 },
    { id: 'fin_one', title: 'Conserto', amount: 300, startMonth: '2026-11', durationMonths: 1, isRecurring: false, dueDay: 20, tagId: null, paidMonths: [], createdAt: 2 },
  ];
  const data = Object.assign({}, backup.data, { tb_financial_db: JSON.stringify(fin) });
  const A = await boot(REPO, data), { w, $ } = A;
  const item = (id) => w.eval(`JSON.parse(JSON.stringify(financialDb.find((f) => f.id === '${id}')))`);
  const scopeOpen = () => !$('financial-edit-scope-modal').classList.contains('hidden');
  w.openListSheet(); w.switchListTab('financial');
  ok(w.eval('currentFinanceMonth') === '2026-11', 'o celular está em novembro de 2026');

  console.log('A) Só o nome, num mês com valor próprio:');
  w.openFinancialForm('fin_rec');
  ok($('financial-amount-input').value === '1100.00', 'o formulário mostra o valor de novembro (1100.00: V40.51.0, com os centavos)');
  $('financial-input').value = 'Aluguel do escritório';
  w.saveFinancialForm();
  let f = item('fin_rec');
  ok(!scopeOpen() && f.title === 'Aluguel do escritório', 'salvou o nome sem perguntar escopo (o valor não mudou)');
  ok(f.amount === 1000 && JSON.stringify(f.paidMonthsOverrides) === JSON.stringify({ '2026-10': { amount: 950 }, '2026-11': { amount: 1100 }, '2027-01': { amount: 1200 } }), 'o valor normal (1000) e os valores de outubro, novembro e janeiro continuam iguais');
  ok(JSON.stringify(f.paidMonths) === '["2026-09","2026-10"]', 'os meses pagos continuam iguais');

  console.log('\nB) O resto continua como antes:');
  w.openFinancialForm('fin_rec');
  $('financial-amount-input').value = '1150';
  w.saveFinancialForm();
  ok(scopeOpen(), 'valor novo numa recorrente ainda pergunta em quais meses');
  w.confirmEditScope('this');
  f = item('fin_rec');
  ok(f.paidMonthsOverrides['2026-11'].amount === 1150 && f.amount === 1000 && f.paidMonthsOverrides['2027-01'].amount === 1200, '"Apenas este mês" muda só novembro');
  w.openFinancialForm('fin_rec');
  $('financial-amount-input').value = '1300';
  w.saveFinancialForm(); w.confirmEditScope('all');
  f = item('fin_rec');
  ok(f.amount === 1300 && !f.paidMonthsOverrides, '"Todos os meses" troca o valor normal e limpa os valores por mês');
  w.openFinancialForm('fin_one');
  $('financial-amount-input').value = '320';
  w.saveFinancialForm();
  f = item('fin_one');
  ok(!scopeOpen() && f.amount === 320, 'avulsa troca o valor direto');
  w.openFinancialForm('fin_rec');
  $('financial-amount-input').value = '1300';
  w.selectFinancialType('installment'); $('financial-installments-input').value = '6';
  w.saveFinancialForm();
  f = item('fin_rec');
  ok(f.durationMonths === 6 && f.isRecurring === false && f.amount === 1300 && JSON.stringify(f.paidMonths) === '[]', 'trocar o tipo continua recomeçando os pagos (como antes)');
  ok(A.errors.length === 0, 'nenhum erro de página' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
