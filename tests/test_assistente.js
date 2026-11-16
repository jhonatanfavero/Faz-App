// V40.20.0 — Assistente (a primeira aba). Parte A: o "cérebro" (assistente.js) com um retrato de dados montado aqui,
// hora fixa. Parte B: a aba no app do celular de verdade (index.html + app.js), com os dados fictícios.
// Uso: TZ='America/Sao_Paulo' node test_assistente.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const A = require(path.resolve(REPO, 'assistente.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// segunda 16/11/2026, 10:20
const NOW = new Date(2026, 10, 16, 10, 20);
const base = () => ({
  now: new Date(NOW), hours: [7, 24],
  blocks: [
    { id: 'b1', title: 'Reunião', date: '2026-11-16', start: 540, dur: 60, done: true, tag: { name: 'Trabalho', color: '#ef4444' } },
    { id: 'b2', title: 'Projeto X', date: '2026-11-16', start: 600, dur: 90, done: false, tag: null },
    { id: 'b3', title: 'Almoço', date: '2026-11-16', start: 720, dur: 60, done: false, tag: { name: 'Pessoal', color: '#10b981' } },
    { id: 'b4', title: 'Café', date: '2026-11-16', start: 480, dur: 30, done: false, tag: null },
    { id: 'b5', title: '🏋️ Treino', date: '2026-11-17', start: 420, dur: 60, done: false, tag: null },
    { id: 'b6', title: 'Revisão', date: '2026-11-13', start: 900, dur: 30, done: false, tag: null },
    { id: 'b7', title: 'Antigo', date: '2026-11-01', start: 900, dur: 30, done: false, tag: null },
  ],
  tasks: [{ id: 't1', title: 'A', dur: 30, list: 'Projetos' }, { id: 't2', title: 'B', dur: 15, list: 'Projetos' }, { id: 't3', title: 'C', dur: 60, list: 'Pessoal' }],
  routines: [{ id: 'r1', title: 'Treino', emoji: '🏋️', dur: 60 }, { id: 'r2', title: 'Leitura', emoji: '📚', dur: 30 }],
  notes: [{ id: 'n1', title: 'Ideias', content: 'Fazer app de metas com estrelas', ms: NOW.getTime() - 3600e3 }, { id: 'n2', title: '', content: 'Comprar pão', ms: NOW.getTime() - 3 * 86400e3 }],
  expenses: [
    { id: 'e1', title: 'Luz', amount: 150, start: '2026-11', months: 1, recurring: false, dueDay: 10, paid: [], overrides: {} },
    { id: 'e2', title: 'Aluguel', amount: 1000, start: '2026-09', months: 12, recurring: true, dueDay: 20, paid: ['2026-09'], overrides: { '2026-11': { amount: 1100 } } },
    { id: 'e3', title: 'Net', amount: 99.9, start: '2026-11', months: 1, recurring: false, dueDay: 16, paid: [], overrides: {} },
    { id: 'e4', title: 'Seguro', amount: 80, start: '2026-11', months: 3, recurring: false, dueDay: 5, paid: ['2026-11'], overrides: {} },
  ],
});

(async () => {
  console.log('A) O cérebro (assistente.js):');
  let s = base(), r;
  ok(A.NAME === 'Assistente' && A.CHIPS.length === 10, 'nome provisório "Assistente" e 10 sugestões (V40.21.0: + "Minhas metas")');
  r = A.briefing(s);
  ok(r.intent === 'dia' && r.text === 'Bom dia! Hoje é segunda, 16 de novembro. Você tem 4 blocos na agenda (4h), 1 já concluído. Agora: Projeto X, até 11:30. Próximo: Almoço às 12:00 (daqui a 1h 40m). Ficou pra trás: 1 bloco que já passou sem concluir.', 'resumo do dia: "' + r.text + '"');
  ok(r.items.map((i) => i.label + '|' + i.tone).join() === '10:00 Projeto X|now,12:00 Almoço|next' && r.items[0].ref.kind === 'bloco' && r.items[0].ref.id === 'b2', 'lista o que falta hoje: o de agora (verde) e o próximo, com o bloco ligado');
  ok(r.footer === 'Vence hoje: Net (R$ 99,90).', 'lembra a conta que vence hoje');
  s.now = new Date(2026, 10, 16, 19, 30);
  r = A.briefing(s);
  ok(/^Boa noite!/.test(r.text) && /Não tem mais nada pra hoje\./.test(r.text) && /Ficou pra trás: 3 blocos que já passaram sem concluir\./.test(r.text), 'à noite: "Boa noite", nada mais hoje e o que ficou pra trás');
  s = base(); s.blocks = s.blocks.filter((b) => b.date !== '2026-11-16');
  r = A.briefing(s);
  ok(/Sua agenda de hoje está livre\. Amanhã começa com 🏋️ Treino às 07:00\. Você tem 3 tarefas esperando nas Listas\./.test(r.text), 'dia livre: sugere amanhã e lembra das Listas');
  s = base();
  r = A.reply('agora', s);
  ok(r.text === 'Agora: Projeto X, até 11:30 (faltam 1h 10m). Depois: Almoço às 12:00 (daqui a 1h 40m).' && r.items.length === 2, '"O que vem agora?": ' + r.text);
  s.now = new Date(2026, 10, 16, 22, 0);
  r = A.reply('agora', s);
  ok(r.text === 'Nada acontecendo agora na agenda. Hoje não tem mais nada. Amanhã começa com 🏋️ Treino às 07:00.', 'fim do dia: aponta o primeiro de amanhã');
  s = base();
  r = A.reply('amanha', s);
  ok(r.text === 'Amanhã (terça, 17/11): 1 bloco (1h), começando com 🏋️ Treino às 07:00.' && r.items[0].sub === 'amanhã · 1h', '"E amanhã?": ' + r.text);
  r = A.reply('semana', s);
  ok(/^Esta semana \(16\/11 a 22\/11\): 5 blocos, 5h planejados\. Dos que já passaram, você concluiu 1 de 2 \(50%\)\./.test(r.text) && r.items.length === 7 && r.items[0].label === 'seg 16/11 (hoje)' && r.items[2].sub === 'livre', 'semana de segunda a domingo, com cada dia');
  r = A.reply('atrasado', s);
  ok(r.text === 'Ficou pra trás: 2 blocos dos últimos 7 dias passaram sem concluir e 1 conta deste mês está atrasada (R$ 150,00).', '"O que ficou pra trás?": ' + r.text);
  ok(r.items[0].label === 'Luz · R$ 150,00' && r.items[0].tone === 'late' && r.items[0].sub === 'venceu terça, 10/11' && r.items.some((i) => i.label === '15:00 Revisão' && i.sub.startsWith('sexta, 13/11')) && !r.items.some((i) => /Antigo/.test(i.label)), 'mostra a conta atrasada e os blocos dos últimos 7 dias (o de 01/11 fica de fora)');
  ok(r.footer === '1 despesa de outubro ficou sem marcar como paga.', 'avisa o que ficou sem pagar no mês passado');
  r = A.reply('contas', s);
  ok(r.text === 'Em novembro: 4 despesas, R$ 1.429,90 no total. Pago: R$ 80,00. Em aberto: R$ 1.349,90. 1 está atrasada. 2 vencem nos próximos 7 dias.', '"Minhas contas" (com o valor deste mês da recorrente): ' + r.text);
  ok(r.items.map((i) => i.label + '|' + i.sub + '|' + i.tone).join(';') === 'Luz · R$ 150,00|venceu terça, 10/11|late;Net · R$ 99,90|vence hoje|next;Aluguel · R$ 1.100,00|vence sexta, 20/11|next' && r.items[2].ref.month === '2026-11', 'atrasada primeiro, depois as que vencem logo, com o mês pra abrir a despesa');
  s.expenses.forEach((e) => { if (!e.paid.includes('2026-11')) e.paid.push('2026-11'); });
  r = A.reply('contas', s);
  ok(/Tudo pago! 🎉$/.test(r.text), 'tudo pago: comemora');
  s = base(); s.now = new Date(2026, 10, 27, 9, 0);
  r = A.reply('contas', s);
  ok(r.footer === 'Em dezembro já são 2 despesas (R$ 1.080,00).', 'no fim do mês, avisa o que vem no mês seguinte');
  s = base(); s.expenses = [{ id: 'f', title: 'Fev', amount: 10, start: '2027-02', months: 1, dueDay: 31, paid: [], overrides: {} }]; s.now = new Date(2027, 1, 25, 9, 0);
  r = A.reply('contas', s);
  ok(r.items[0].sub === 'vence domingo, 28/02', 'vencimento dia 31 em fevereiro vira o último dia (28/02)');
  s = base();
  r = A.reply('rotinas', s);
  ok(r.text === 'Você tem 2 rotinas. Esta semana: Treino 1x. Ainda não entrou na agenda desta semana: Leitura.' && r.items[0].sub === '1h · usada 1x nesta semana' && r.items[0].ref.kind === 'rotina', '"Minhas rotinas": reconhece a rotina na agenda pelo nome com emoji');
  r = A.reply('notas', s);
  ok(r.text === 'Você tem 2 notas. As mais recentes:' && r.items[0].label === 'Ideias' && r.items[0].sub === 'editada hoje · Fazer app de metas com estrelas' && r.items[1].label === 'Comprar pão' && r.items[1].sub === 'editada em sexta, 13/11', '"Notas recentes": título (ou o começo do texto) e quando foi editada');
  r = A.reply('listas', s);
  ok(r.text === 'Você tem 3 tarefas nas Listas (1h 45m de trabalho).' && r.items.map((i) => i.label + ' ' + i.sub).join('|') === 'Projetos 2 tarefas · 45m|Pessoal 1 tarefa · 1h', '"O que tem nas listas?": por lista, na ordem delas');
  const vazio = { now: new Date(NOW), hours: [7, 24], blocks: [], tasks: [], routines: [], notes: [], expenses: [] };
  ok(['dia', 'agora', 'amanha', 'semana', 'atrasado', 'contas', 'rotinas', 'notas', 'listas', 'metas', 'ajuda'].every((i) => { const x = A.reply(i, vazio); return x.text && Array.isArray(x.items); }), 'sem nenhum dado, toda pergunta tem resposta (nada quebra)');
  ok(A.reply('rotinas', vazio).text.startsWith('Você ainda não tem rotinas.') && A.reply('contas', vazio).text === 'Você não tem despesas em novembro.', '...e as respostas explicam o que fazer');
  const q = { 'oi': 'dia', 'bom dia!': 'dia', 'o que tenho hoje?': 'dia', 'o que vem agora': 'agora', 'qual o próximo compromisso': 'agora', 'tenho algo amanhã?': 'amanha', 'como foi minha semana': 'semana', 'o que ficou pra trás': 'atrasado', 'o que vence essa semana?': 'contas', 'tenho conta pra pagar?': 'contas', 'quanto gastei': 'contas', 'e as rotinas?': 'rotinas', 'minhas anotações': 'notas', 'quais tarefas tenho?': 'listas', 'e as metas?': 'metas', 'o que você sabe fazer?': 'ajuda', 'valeu!': 'obrigado', 'qual meu contato': 'naoentendi', 'xyz': 'naoentendi' };
  const bad = Object.keys(q).filter((k) => A.intentOf(k) !== q[k]);
  ok(bad.length === 0, 'entende o que foi escrito do jeito de cada um (' + Object.keys(q).length + ' frases)' + (bad.length ? ': erro em ' + bad.map((k) => `"${k}" → ${A.intentOf(k)}`).join(', ') : ''));
  ok(A.ask('   ', base()) === null && A.ask('blablabla', base()).intent === 'naoentendi' && /Ainda não sei responder isso/.test(A.ask('blablabla', base()).text), 'em branco não responde; o que não entende, explica o que sabe');

  console.log('\nB) A aba no app do celular:');
  const data = Object.assign({}, backup.data);
  const blocks = JSON.parse(data.tb_master_db);
  blocks.push({ id: 'f_html', date: '2026-11-15', startMin: 23 * 60, duration: 30, title: '<img src=x onerror=alert(1)>', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false });
  data.tb_master_db = JSON.stringify(blocks);
  const B = await boot(REPO, data), { w, $ } = B, d = w.document;
  w.openListSheet();
  const pills = [...d.querySelectorAll('[id^="btn-list-"]')].map((b) => b.id.replace('btn-list-', ''));
  ok(pills.join() === 'assistant,backlog,routines,notes,financial,goals' && $('btn-list-assistant').getAttribute('aria-label') === 'Assistente' && $('btn-list-assistant').className.includes('w-9'), 'a primeira pílula é a do Assistente (só o ícone, estreita); V40.21.0: Metas na última, também só o ícone');
  ok(!$('view-backlog').classList.contains('hidden') && $('view-assistant').classList.contains('hidden'), 'o botão das listas continua abrindo nas Listas');
  w.switchListTab('assistant');
  const feedTxt = () => $('assistant-feed').textContent;
  const today = blocks.filter((b) => b.date === '2026-11-15');
  ok(!$('view-assistant').classList.contains('hidden') && $('view-backlog').classList.contains('hidden') && $('btn-list-assistant').className.includes('bg-white'), 'tocar na pílula abre o Assistente');
  ok(feedTxt().startsWith('Boa noite! Hoje é domingo, 15 de novembro. Você tem ' + today.length + ' blocos na agenda'), 'abre com o resumo do dia, com os dados do aparelho (' + today.length + ' blocos hoje)');
  ok(!d.querySelector('#assistant-feed img') && feedTxt().includes('<img src=x onerror=alert(1)>'), 'nome com HTML aparece como texto');
  ok(d.querySelectorAll('#assistant-chips button').length === 10, 'as 10 sugestões aparecem embaixo');
  [...d.querySelectorAll('#assistant-chips button')].find((b) => b.textContent === 'Minhas contas').click();
  const fin = JSON.parse(data.tb_financial_db);
  ok(d.querySelectorAll('#assistant-feed > div').length === 3 && /^Em novembro: \d+ despesas/.test(d.querySelectorAll('#assistant-feed > div')[2].textContent), 'tocar numa sugestão: a pergunta aparece e a resposta vem embaixo');
  $('assistant-input').value = 'o que tenho amanhã?';
  w.assistantSend({ preventDefault() {} });
  const last = [...d.querySelectorAll('#assistant-feed > div')].pop().textContent;
  ok($('assistant-input').value === '' && /^Amanhã \(segunda, 16\/11\)/.test(last), 'escrever e enviar: "' + last.slice(0, 60) + '…"');
  w.assistantRestart();
  ok(d.querySelectorAll('#assistant-feed > div').length === 1 && feedTxt().startsWith('Boa noite!'), '"Recomeçar" volta pro resumo de agora');
  w.switchListTab('financial');
  ok(!$('view-financial').classList.contains('hidden') && $('btn-list-assistant').className.includes('w-9') && !$('btn-list-assistant').className.includes('bg-white'), 'as outras abas continuam iguais');
  ok(fin.length > 0 && B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 200) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
