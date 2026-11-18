// V40.21.0 — Metas (etapa 1). Parte A: as regras (metas.js) com dados montados aqui, data fixa.
// Parte B: a aba Metas no app do celular de verdade (index.html + app.js). Parte C: o Assistente falando das metas.
// Uso: TZ='America/Sao_Paulo' node test_metas.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const M = require(path.resolve(REPO, 'metas.js'));
const A = require(path.resolve(REPO, 'assistente.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// segunda 16/11/2026, 10:20
const NOW = new Date(2026, 10, 16, 10, 20);
const agua = { id: 'meta_1', listId: 'gl_pessoal', title: 'Beber água', emoji: '💧', period: 'dia', unit: 'vezes', target: 8, step: 1 };
const correr = { id: 'meta_2', listId: 'gl_pessoal', title: 'Correr', emoji: '🏃', period: 'semana', unit: 'vezes', target: 3, step: 1 };
const guardar = { id: 'meta_3', listId: 'gl_financeiro', title: 'Guardar dinheiro', emoji: '💰', period: 'mes', unit: 'reais', target: 500, step: 50 };
const meditar = { id: 'meta_4', listId: 'gl_pessoal', title: 'Meditar', emoji: '🧘', period: 'dia', unit: 'minutos', target: 30, step: 15 };
const dia = (goalId, date, amount, target) => ({ id: M.dayId(goalId, date), goalId, date, amount, target });

(async () => {
  console.log('A) As regras (metas.js):');
  ok(M.DEFAULT_LISTS.map((l) => l.id + ':' + l.name).join() === 'gl_pessoal:Pessoal,gl_profissional:Profissional,gl_financeiro:Financeiro', 'listas padrão: Pessoal, Profissional e Financeiro (mesmos ids no celular e no PC)');
  ok(M.periodKey('dia', '2026-11-16') === '2026-11-16' && M.periodKey('semana', '2026-11-22') === '2026-11-16' && M.periodKey('semana', '2026-11-16') === '2026-11-16' && M.periodKey('mes', '2026-11-30') === '2026-11', 'período: o dia, a semana (começa na segunda) e o mês');
  ok(M.periodKey('semana', '2027-01-01') === '2026-12-28' && M.prevKey('mes', '2026-01') === '2025-12' && M.prevKey('semana', '2026-11-16') === '2026-11-09' && M.prevKey('dia', '2026-03-01') === '2026-02-28', 'virada de ano, de mês e semana anterior');
  ok(M.dayId('meta_1', '2026-11-16') === 'meta_1_20261116', 'cada meta tem uma linha por dia (id meta_AAAAMMDD)');

  // água: 9 no dia 14, 8 no dia 15, 6 hoje (16); dia 13 só 3
  let days = [dia('meta_1', '2026-11-13', 3, 8), dia('meta_1', '2026-11-14', 9, 8), dia('meta_1', '2026-11-15', 8, 8), dia('meta_1', '2026-11-16', 6, 8), dia('meta_x', '2026-11-16', 99, 1), { id: 'ruim', goalId: 'meta_1', date: '16/11/2026', amount: 50 }];
  let s = M.status(agua, days, NOW);
  ok(s.total === 6 && !s.complete && s.pct === 0.75 && s.remaining === 2 && s.text === '6 de 8 hoje', 'hoje: "6 de 8 hoje", 75%, faltam 2 (linha de outra meta e data errada não contam)');
  ok(s.stars === 2 && s.streak === 2 && s.points === 20, 'estrelas dos dias cumpridos (14 e 15) e sequência de 2 (hoje ainda em andamento não quebra)');
  let b = M.bump(days, agua, '2026-11-16', 2);
  ok(b.changed && b.row.amount === 8 && b.row.id === 'meta_1_20261116' && b.row.target === 8 && b.days.length === days.length, '+2: a linha de hoje vira 8 (a mesma linha, com o alvo de agora guardado)');
  s = M.status(agua, b.days, NOW);
  ok(s.complete && s.stars === 3 && s.streak === 3 && s.points === 30 && s.text === '8 de 8 hoje', 'cumpriu hoje: ⭐ 3 e 🔥 3 dias seguidos');
  b = M.bump(b.days, agua, '2026-11-16', -20);
  ok(b.row.amount === 0 && M.status(agua, b.days, NOW).total === 0, 'o "−" nunca deixa o dia negativo');
  b = M.bump([], agua, '2026-11-17', 1);
  ok(b.days.length === 1 && b.row.goalId === 'meta_1' && b.row.date === '2026-11-17', 'primeiro "+" do dia cria a linha');
  ok(M.status(agua, [dia('meta_1', '2026-11-20', 8, 8)], NOW).stars === 0, 'dia no futuro não vale estrela');

  // alvo mudou: subir de 8 pra 10 não apaga estrela antiga (vale o alvo da época); hoje passa a valer o novo
  const agua10 = Object.assign({}, agua, { target: 10 });
  s = M.status(agua10, [dia('meta_1', '2026-11-14', 9, 8), dia('meta_1', '2026-11-15', 8, 8), dia('meta_1', '2026-11-16', 8, 8)], NOW);
  ok(s.stars === 2 && !s.complete && s.text === '8 de 10 hoje' && s.streak === 2, 'subiu o alvo pra 10: as estrelas dos dias 14 e 15 continuam; hoje precisa de 10');
  s = M.status(agua10, [dia('meta_1', '2026-11-15', 8)], NOW);
  ok(s.stars === 0, 'dia antigo sem o alvo guardado usa o alvo de agora');

  // correr 3x por semana: semana passada (9 a 15) 3 corridas, esta semana 1
  days = [dia('meta_2', '2026-11-10', 1, 3), dia('meta_2', '2026-11-12', 1, 3), dia('meta_2', '2026-11-15', 1, 3), dia('meta_2', '2026-11-16', 1, 3), dia('meta_2', '2026-11-03', 1, 3)];
  s = M.status(correr, days, NOW);
  ok(s.text === '1 de 3 nesta semana' && s.stars === 1 && s.streak === 1 && s.points === 50, 'semanal: "1 de 3 nesta semana", ⭐ 1 da semana passada = 50 pontos');

  // guardar R$ 500 por mês: outubro 300 + 250, novembro 100
  days = [dia('meta_3', '2026-10-05', 300, 500), dia('meta_3', '2026-10-20', 250, 500), dia('meta_3', '2026-11-02', 100, 500)];
  s = M.status(guardar, days, NOW);
  ok(s.text === 'R$ 100,00 de R$ 500,00 neste mês' && s.stars === 1 && s.points === 200 && s.streak === 1, 'mensal em reais: "R$ 100,00 de R$ 500,00 neste mês", ⭐ de outubro = 200 pontos');
  ok(M.status(meditar, [dia('meta_4', '2026-11-16', 15, 30)], NOW).text === '15m de 30m hoje' && M.addLabel(meditar) === '+15m' && M.addLabel(guardar) === '+R$ 50' && M.addLabel(agua) === '+1', 'minutos: "15m de 30m hoje"; botões "+15m", "+R$ 50" e "+1"');
  ok(M.goalLabel(agua) === '8 vezes por dia' && M.goalLabel(guardar) === 'R$ 500,00 por mês' && M.goalLabel(Object.assign({}, meditar, { target: 90 })) === '1h 30m por dia', 'texto da meta: "8 vezes por dia", "R$ 500,00 por mês", "1h 30m por dia"');
  ok(M.fmt('vezes', 1) === '1 vez' && M.fmt('vezes', 2.5) === '2,5 vezes' && M.fmt('minutos', 60) === '1h' && M.fmt('reais', 1234.5) === 'R$ 1.234,50', 'números: "1 vez", "2,5 vezes", "1h", "R$ 1.234,50"');
  ok(M.streakLabel('dia', 1) === '1 dia seguido' && M.streakLabel('semana', 3) === '3 semanas seguidas' && M.streakLabel('mes', 2) === '2 meses seguidos', 'sequência: "1 dia seguido", "3 semanas seguidas", "2 meses seguidos"');

  const n = M.normalize({ id: 'x', unit: 'kg', period: 'ano', target: '0', step: -3 });
  ok(M.normalize({ unit: 'constructor', period: '__proto__' }).unit === 'vezes' && M.normalize({ period: 'toString' }).period === 'dia' && M.streakLabel('constructor', 2) === '2 dias seguidos', 'nomes internos do JavaScript ("constructor", "__proto__") não passam por período ou medida');
  ok(n.unit === 'vezes' && n.period === 'dia' && n.target === 1 && n.step === 1 && M.normalize({ unit: 'reais', target: 5e12 }).target === 1e9 && M.normalize({ unit: 'minutos', target: 0.001 }).target === 30, 'valor estranho vira o padrão (e nada passa de 1 bilhão)');
  ok(M.firstGrapheme('  🏋️‍♀️ treino') === '🏋️‍♀️' && M.firstGrapheme('💧💧') === '💧' && M.firstGrapheme('') === '' && M.firstGrapheme('abc') === 'a', 'emoji: fica só o primeiro (🏋️‍♀️ conta como um)');

  // níveis: 0, 100, 250, 450, 700, 1000 ... depois de Lenda vem Lenda 2
  const lv = (p) => { const l = M.levelOf(p); return l.level + ':' + l.name; };
  ok(lv(0) === '1:Iniciante' && lv(99) === '1:Iniciante' && lv(100) === '2:Aprendiz' && lv(250) === '3:Constante' && lv(449) === '3:Constante' && lv(450) === '4:Focado' && lv(1000) === '6:Determinado', 'níveis: 0 Iniciante, 100 Aprendiz, 250 Constante, 450 Focado... 1000 Determinado');
  ok(lv(2200) === '9:Lenda' && lv(2700) === '10:Lenda 2' && M.levelOf(320).toNext === 130 && M.levelOf(320).next === 450 && Math.abs(M.levelOf(320).pct - 70 / 200) < 1e-9, 'depois de Lenda vem "Lenda 2"; com 320 pontos faltam 130 pro nível 4');

  // resumo geral e o que um "+" conquista
  days = [dia('meta_1', '2026-11-14', 9, 8), dia('meta_1', '2026-11-15', 8, 8), dia('meta_1', '2026-11-16', 7, 8), dia('meta_2', '2026-11-10', 3, 3), dia('meta_4', '2026-11-16', 30, 30)];
  const goals = [agua, correr, guardar, meditar];
  let sum = M.summary(goals, days, NOW);
  ok(sum.stars === 4 && sum.points === 2 * 10 + 50 + 10 && sum.level === 1 && sum.todayDone === 1 && sum.todayTotal === 2, 'resumo: ⭐ 4, 80 pontos, nível 1; hoje 1 de 2 metas diárias');
  b = M.bump(days, agua, '2026-11-16', 1);
  let after = M.summary(goals, b.days, NOW), g = M.gain(sum, after);
  ok(g.star && g.points === 10 && !g.level && M.gainText(g) === '⭐ Meta cumprida! +10 pontos', '+1 que cumpre a meta: "⭐ Meta cumprida! +10 pontos"');
  const many = []; for (let i = 1; i <= 9; i++) many.push(dia('meta_1', M.addDays('2026-11-16', -i), 8, 8));
  sum = M.summary([agua], many.concat([dia('meta_1', '2026-11-16', 7, 8)]), NOW);
  after = M.summary([agua], M.bump(many.concat([dia('meta_1', '2026-11-16', 7, 8)]), agua, '2026-11-16', 1).days, NOW);
  g = M.gain(sum, after);
  ok(sum.points === 90 && after.points === 100 && g.level === 2 && M.gainText(g) === '🎉 Nível 2: Aprendiz!', 'a estrela que passa de 100 pontos sobe de nível: "🎉 Nível 2: Aprendiz!"');
  ok(M.gainText(M.gain(after, sum)) === '', 'desfazer (−) não mostra aviso');

  ok(M.listOf({ listId: 'gl_x' }, [{ id: 'gl_a' }, { id: 'gl_b' }]) === 'gl_a' && M.listOf({ listId: 'gl_b' }, [{ id: 'gl_a' }, { id: 'gl_b' }]) === 'gl_b' && M.listOf({ listId: 'gl_b' }, []) === null, 'meta de lista que não existe mais aparece na primeira lista');
  ok(M.TEMPLATES.length >= 6 && M.TEMPLATES.every((t) => M.PERIODS[t.period] && M.UNITS[t.unit] && t.target > 0 && t.step > 0 && M.DEFAULT_LISTS.some((l) => l.id === t.listId)), 'sugestões prontas (beber água, correr, meditar...) válidas e cada uma na sua lista padrão');

  if (process.argv.includes('--so-regras')) return end();

  // ======================================================================================================
  console.log('\nB) A aba Metas no app do celular (domingo 15/11/2026, 21:00):');
  const UID = '11111111-2222-3333-4444-555555555555';
  const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const toasts = () => w.__toasts || [];
  const lastToast = () => toasts()[toasts().length - 1];
  const ev = (x) => w.eval(x);
  ok(L('tb_goal_lists') === null && ev('goalListsDb.length') === 0, 'aparelho que nunca abriu as Metas não ganha nada (nenhuma lista criada só por atualizar)');
  ok(![...d.querySelectorAll('#bottom-sheet button')].some((b) => /Metas/.test(b.textContent)) && typeof w.comingSoonMetas === 'undefined', 'o botão + não tem mais o chip "Metas (em breve)" (V40.22.0)');
  w.openListSheet();
  w.switchListTab('goals');
  ok(!$('view-goals').classList.contains('hidden') && $('view-backlog').classList.contains('hidden') && $('btn-list-goals').className.includes('bg-white') && $('btn-list-goals').className.includes('w-9'), 'a pílula do alvo (última, só o ícone) abre as Metas');
  // V40.23.0: uma lista só, com um título por categoria (sem pílulas nem colunas)
  const secs = () => [...d.querySelectorAll('#goals-container .goal-section')].map((s) => s.querySelector('h3').textContent + s.querySelector('h3 + span').textContent);
  const secOf = (id) => d.querySelector('#goals-container .goal-section[data-goal-list="' + id + '"]');
  ok(!$('goals-lists') && secs().join('|') === 'Pessoal0|Profissional0|Financeiro0' && ev('goalListsDb.map((l) => l.id).join()') === 'gl_pessoal,gl_profissional,gl_financeiro' && !!d.querySelector('#goals-container .goal-new-cat'), 'primeira vez: uma tela só com as categorias Pessoal, Profissional e Financeiro (e "Nova categoria" no fim)');
  ok($('goals-level-n').textContent === '1' && $('goals-level-name').textContent === 'Iniciante' && $('goals-points').textContent === '0 pontos' && $('goals-level-sub').textContent === '⭐ 0 · faltam 100 pro nível 2', 'nível 1 · Iniciante, 0 pontos, faltam 100 pro nível 2');
  ok(/Crie sua primeira meta/.test($('goals-container').textContent) && d.querySelectorAll('#goals-container .goal-section-add').length === 3 && secOf('gl_financeiro').textContent.includes('Meta em Financeiro'), 'sem metas: explica o que fazer e cada categoria tem o atalho "+ Meta em ..."');

  // criar pela sugestão "Beber água"
  w.openGoalForm();
  ok(!$('goals-form-view').classList.contains('hidden') && $('goals-list-view').classList.contains('hidden') && d.querySelectorAll('#goal-templates button').length === M.TEMPLATES.length && $('goal-form-delete-btn').classList.contains('hidden'), 'Nova meta: formulário com as sugestões (sem o botão de apagar)');
  ok($('goal-target-input').value === '1' && $('goal-step-input').value === '1' && $('goal-period-dia').className.includes('bg-app-focus') && $('goal-unit-vezes').className.includes('bg-app-focus') && $('goal-target-suffix').textContent === 'vezes por dia', 'começa com Diária, Vezes, meta 1 ("vezes por dia")');
  w.selectGoalUnit('minutos');
  ok($('goal-target-input').value === '30' && $('goal-step-input').value === '15' && $('goal-target-suffix').textContent === 'minutos por dia', 'trocar pra Minutos sugere 30 min, +15');
  $('goal-target-input').value = '45'; $('goal-target-input').dispatchEvent(new w.Event('input', { bubbles: true }));
  w.selectGoalUnit('reais');
  ok($('goal-target-input').value === '45' && $('goal-target-suffix').textContent === 'reais por dia', 'depois de digitar o alvo, trocar a medida não apaga o que foi digitado');
  w.applyGoalTemplate(0);
  ok($('goal-title-input').value === 'Beber água' && $('goal-emoji-input').value === '💧' && $('goal-target-input').value === '8' && $('goal-unit-vezes').className.includes('bg-app-focus'), 'a sugestão "💧 Beber água" preenche nome, emoji, 8 vezes por dia');
  w.saveGoalForm();
  const g1 = ev('goalsDb[0]');
  ok(ev('goalsDb.length') === 1 && /^meta_\d+$/.test(g1.id) && g1.listId === 'gl_pessoal' && g1.target === 8 && g1.step === 1 && g1.period === 'dia' && g1.unit === 'vezes' && lastToast() === 'Meta criada! 🎯', 'Salvar: meta criada (id meta_..., lista Pessoal, 8 vezes por dia)');
  ok(!$('goals-list-view').classList.contains('hidden') && /Beber água/.test($('goals-container').textContent) && /0 de 8 hoje/.test($('goals-container').textContent) && d.querySelector('#goals-container .goal-plus').textContent === '+1', 'volta pra lista: cartão "💧 Beber água · 0 de 8 hoje" com o botão +1');
  ok(secs()[0] === 'Pessoal1' && secOf('gl_pessoal').querySelector('[data-goal="' + g1.id + '"]') && !secOf('gl_pessoal').querySelector('.goal-section-add') && !/Crie sua primeira meta/.test($('goals-container').textContent), 'a meta aparece embaixo do título Pessoal (que conta 1)');

  for (let i = 0; i < 7; i++) w.goalBump(g1.id, 1);
  ok(/7 de 8 hoje/.test($('goals-container').textContent) && [...d.querySelectorAll('#goals-container button')].some((b) => b.getAttribute('aria-label') === 'Desfazer o último +') && !toasts().some((t) => /Meta cumprida/.test(t)), '+1 sete vezes: "7 de 8 hoje", aparece o − e nada de estrela ainda');
  const day = ev(`goalDaysDb.find((x) => x.goalId === '${g1.id}')`);
  ok(day && day.id === g1.id + '_20261115' && day.date === '2026-11-15' && day.amount === 7 && day.target === 8 && JSON.parse(L('tb_goal_days')).length === 1, 'fica uma linha só pro dia (id meta_..._20261115), com o alvo da época, salva no aparelho');
  w.goalBump(g1.id, 1);
  ok(lastToast() === '⭐ Meta cumprida! +10 pontos' && /✓ 8 de 8 hoje/.test($('goals-container').textContent) && $('goals-points').textContent === '10 pontos' && $('goals-level-sub').textContent.startsWith('⭐ 1 · hoje 1 de 1'), 'o 8º: "⭐ Meta cumprida! +10 pontos", cartão verde com ✓, 10 pontos');
  w.goalBump(g1.id, -1);
  ok(/7 de 8 hoje/.test($('goals-container').textContent) && $('goals-points').textContent === '0 pontos' && lastToast() === '⭐ Meta cumprida! +10 pontos', 'o − desfaz (a estrela sai, sem aviso)');
  w.goalBump(g1.id, 1);

  // HTML no nome vira texto
  w.openGoalForm();
  $('goal-title-input').value = '<img src=x onerror=alert(1)>'; $('goal-emoji-input').value = '<b>';
  w.saveGoalForm();
  ok(!d.querySelector('#goals-container img') && !d.querySelector('#goals-container b') && $('goals-container').textContent.includes('<img src=x onerror=alert(1)>'), 'nome e emoji com HTML aparecem como texto');
  const gx = ev('goalsDb[1].id');

  // nova categoria (pelo fim da tela)
  w.openCreateGoalList();
  ok(!$('goal-list-name-modal').classList.contains('hidden') && $('goal-list-name-title').textContent === 'Nova categoria', '"Nova categoria" abre o nome da categoria nova');
  $('goal-list-name-input').value = 'Saúde'; w.confirmGoalListName();
  ok(ev('goalListsDb.length') === 4 && ev('goalListsDb[3].name') === 'Saúde' && /^gl_\d+$/.test(ev('goalListsDb[3].id')) && secs()[3] === 'Saúde0' && lastToast() === 'Categoria criada!', 'categoria "Saúde" criada, no fim da tela');
  // "+ Meta em Saúde" já abre a meta nova nessa categoria
  w.openGoalForm(null, ev('goalListsDb[3].id'));
  ok([...d.querySelectorAll('#goal-list-options button')].find((b) => b.textContent === 'Saúde').className.includes('bg-app-focus'), '"+ Meta em Saúde" abre a meta nova já na categoria Saúde');
  w.applyGoalTemplate(2); // 🧘 Meditar, 15 min por dia, +5 (a sugestão é da Pessoal)
  w.selectGoalFormList(ev('goalListsDb[3].id'));
  $('goal-target-input').value = '25'; w.saveGoalForm();
  const med = ev("goalsDb.find((g) => g.title === 'Meditar')");
  ok(med && med.listId === ev('goalListsDb[3].id') && med.unit === 'minutos' && med.target === 25 && med.step === 5 && secOf(med.listId).textContent.includes('0m de 25m hoje') && secOf(med.listId).querySelector('.goal-plus').textContent === '+5m', 'meta em minutos na categoria nova, com o botão "+5m"');
  // "+ Nova" dentro do formulário cria a categoria e já deixa escolhida
  w.openGoalForm();
  w.openCreateGoalList(true); $('goal-list-name-input').value = 'Casa'; w.confirmGoalListName();
  ok(!$('goals-form-view').classList.contains('hidden') && [...d.querySelectorAll('#goal-list-options button')].find((b) => b.textContent === 'Casa').className.includes('bg-app-focus'), '"+ Nova" dentro da meta cria a categoria "Casa" e ela já fica escolhida (o formulário continua aberto)');
  w.closeGoalForm();
  w.openGoalListMenu(ev("goalListsDb.find((l) => l.name === 'Casa').id")); w.openDeleteGoalList();
  ok(/Ela está vazia/.test($('goal-confirm-text').textContent), 'apagar categoria vazia: "Ela está vazia..."');
  w.confirmGoalAction();
  ok(!ev("goalListsDb.some((l) => l.name === 'Casa')") && lastToast() === 'Categoria apagada', 'categoria apagada');
  ok(ev("parseGoalNumber('20,5')") === 20.5 && ev("parseGoalNumber('R$ 1.234,56')") === 1234.56 && ev("parseGoalNumber('1.5')") === 1.5 && Number.isNaN(ev("parseGoalNumber('abc')")) && Number.isNaN(ev("parseGoalNumber('')")), 'números: aceita "20,5", "R$ 1.234,56" e "1.5"; recusa texto');
  // o "⋯" do título abre o menu da categoria; renomear
  secOf(ev('goalListsDb[3].id')).querySelector('.goal-section-menu').click();
  ok(!$('goal-list-menu-modal').classList.contains('hidden') && $('goal-list-menu-title').textContent === 'Saúde', 'o "⋯" do título abre o menu da categoria (Renomear / Apagar)');
  w.openRenameGoalList(); $('goal-list-name-input').value = 'Saúde e corpo'; w.confirmGoalListName();
  ok(ev('goalListsDb[3].name') === 'Saúde e corpo' && $('goal-list-menu-modal').classList.contains('hidden') && secs()[3] === 'Saúde e corpo1', 'renomear a categoria');

  // mudar de categoria: a meta vai pro fim da outra
  w.openGoalForm(gx); w.selectGoalFormList(ev('goalListsDb[3].id')); w.saveGoalForm();
  ok(ev(`goalsDb[goalsDb.length - 1].id`) === gx && ev(`goalsDb.find((g) => g.id === '${gx}').listId`) === ev('goalListsDb[3].id') && secOf(ev('goalListsDb[3].id')).textContent.indexOf('Meditar') < secOf(ev('goalListsDb[3].id')).textContent.indexOf('<img'), 'mudar de categoria leva a meta pro fim da outra');
  // editar: trocar a frequência recomeça a contagem (com confirmação)
  w.openGoalForm(g1.id);
  ok($('goal-form-title').textContent === 'Editar meta' && $('goal-title-input').value === 'Beber água' && !$('goal-form-delete-btn').classList.contains('hidden') && $('goal-templates-wrap').classList.contains('hidden'), 'tocar no cartão abre "Editar meta" (com apagar, sem sugestões)');
  $('goal-target-input').value = '10'; w.saveGoalForm();
  ok(ev(`goalsDb.find((g) => g.id === '${g1.id}').target`) === 10 && ev(`goalDaysDb.filter((x) => x.goalId === '${g1.id}').length`) === 1 && /8 de 10 hoje/.test($('goals-container').textContent) && lastToast() === 'Meta salva!', 'mudar só o alvo (8 → 10) mantém o que foi feito: "8 de 10 hoje"');
  w.openGoalForm(g1.id); w.selectGoalPeriod('semana'); w.saveGoalForm();
  ok(!$('goal-confirm-modal').classList.contains('hidden') && /recomeça do zero/.test($('goal-confirm-text').textContent) && ev(`goalsDb.find((g) => g.id === '${g1.id}').period`) === 'dia', 'mudar a frequência pede confirmação antes (a contagem recomeça)');
  w.confirmGoalAction();
  ok(ev(`goalsDb.find((g) => g.id === '${g1.id}').period`) === 'semana' && ev(`goalDaysDb.filter((x) => x.goalId === '${g1.id}').length`) === 0 && /0 de 10 nesta semana/.test($('goals-container').textContent) && lastToast() === 'Meta salva. A contagem recomeçou.', 'confirmou: vira semanal e recomeça ("0 de 10 nesta semana")');

  // apagar meta
  w.goalBump(gx, 1);
  w.openGoalForm(gx); w.deleteGoalFromForm();
  ok(!$('goal-confirm-modal').classList.contains('hidden') && /Apagar a meta/.test($('goal-confirm-title').textContent), 'apagar a meta pede confirmação');
  w.confirmGoalAction();
  ok(!ev(`goalsDb.some((g) => g.id === '${gx}')`) && !ev(`goalDaysDb.some((x) => x.goalId === '${gx}')`) && lastToast() === 'Meta apagada', 'meta apagada leva junto o que foi marcado nela');

  // backup
  ok(ev('fazDataSummary(collectFazData()).metas') === 2 && L('tb_goals_db') && L('tb_goal_lists') && L('tb_goal_days'), 'as metas entram no backup (tb_goal_lists, tb_goals_db e tb_goal_days)');
  ok(ev(`fazBackupLooksSafe({ tb_goals_db: JSON.stringify([{ id: 'meta_1', listId: "x');alert(1);('", title: 'a', target: 1, step: 1 }]) })`) === false && ev(`fazBackupLooksSafe({ tb_goal_days: JSON.stringify([{ id: 'meta_1_20261115', goalId: 'meta_1', date: '15/11', amount: 1 }]) })`) === false && ev(`fazBackupLooksSafe({ tb_goals_db: L_goals = ${JSON.stringify(L('tb_goals_db'))} })`) === true, 'backup com id malicioso ou data fora do formato nas metas é recusado; o de verdade passa');

  w.goalBump(med.id, 1); // 5 min de meditação hoje
  // ======================================================================================================
  console.log('\nC) Metas na nuvem (celular <-> PC):');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(60); };
  const nn = (t) => server.alive(t, UID).length;
  ok(nn('metas_listas') === 4 && nn('metas') === 2 && nn('metas_dias') === ev('goalDaysDb.length'), `1ª sincronização: listas de metas, metas e dias foram pra nuvem (${nn('metas_listas')}, ${nn('metas')} e ${nn('metas_dias')})`);
  ok(B.confirms.length === 1 && /Metas também \(2 neste aparelho\)/.test(B.confirms[0]), 'a pergunta da 1ª sincronização avisa que as metas vão junto');
  const cm = server.get('metas', UID, med.id);
  ok(cm.list_id === med.listId && cm.unit === 'minutos' && cm.target === 25 && cm.step === 5 && cm.position > server.get('metas', UID, g1.id).position, 'formato da nuvem certo, com a ordem');
  // o PC: +1 numa meta, cria uma meta e renomeia uma lista
  server.insert('metas', UID, { id: 'meta_pc', list_id: 'gl_profissional', title: 'Ler 📚', emoji: '📚', period: 'dia', unit: 'vezes', target: 2, step: 1, position: 1e6, created_ms: Date.now() });
  server.insert('metas_dias', UID, { id: 'meta_pc_20261115', goal_id: 'meta_pc', date: '2026-11-15', amount: 2, target: 2 });
  server.patch('metas_listas', UID, 'gl_financeiro', { name: 'Dinheiro' });
  w.openListSheet(); w.switchListTab('goals');
  await syncDone();
  ok(ev("goalsDb.some((g) => g.id === 'meta_pc' && g.listId === 'gl_profissional')") && /Ler 📚/.test($('goals-container').textContent) && /✓ 2 de 2 hoje/.test($('goals-container').textContent), 'meta criada e cumprida no PC chegou e já aparece (✓ 2 de 2 hoje)');
  ok(ev("goalListsDb.find((l) => l.id === 'gl_financeiro').name") === 'Dinheiro' && secs().some((x) => x.startsWith('Dinheiro')), 'categoria renomeada no PC chegou');
  ok(JSON.parse(L('tb__sync')).cursorMetasDias > 0, 'o aparelho guarda até onde já leu os dias das metas (cursorMetasDias)');
  // o celular: +1 sobe sozinho
  w.goalBump('meta_pc', 1);
  ok(await waitFor(() => server.get('metas_dias', UID, 'meta_pc_20261115').amount === 3), '+1 no celular sobe sozinho pra nuvem (sem apertar sincronizar)');
  // formulário aberto segura o redesenho
  w.openGoalForm('meta_pc');
  server.patch('metas', UID, 'meta_pc', { title: 'Ler (PC)' });
  w.fazSyncNow(); await sleep(900);
  ok(ev("goalsDb.find((g) => g.id === 'meta_pc').title") === 'Ler 📚' && !$('goals-form-view').classList.contains('hidden'), 'com o formulário da meta aberto, o sync espera');
  w.closeGoalForm();
  ok(await waitFor(() => ev("goalsDb.find((g) => g.id === 'meta_pc').title") === 'Ler (PC)', 15000), 'fechou o formulário: a mudança do PC entra');
  // o PC apaga a lista Profissional (e a meta dela)
  server.patch('metas', UID, 'meta_pc', { deleted: true });
  server.patch('metas_listas', UID, 'gl_profissional', { deleted: true });
  await syncDone();
  ok(!ev("goalListsDb.some((l) => l.id === 'gl_profissional')") && !ev("goalsDb.some((g) => g.id === 'meta_pc')") && !ev("goalDaysDb.some((x) => x.goalId === 'meta_pc')") && !secs().some((x) => x.startsWith('Profissional')), 'categoria apagada no PC: some do celular com a meta e os dias dela');
  ok(await waitFor(() => server.get('metas_dias', UID, 'meta_pc_20261115').deleted === true), 'e o dia daquela meta também fica apagado na nuvem');
  await syncDone(); const antes = server.log.length; await syncDone();
  ok(server.log.slice(antes).filter((l) => l.op !== 'select' && l.op !== 'getUser').length === 0, 'sincronizar de novo não envia nada'); // V40.32.0: getUser só lê (a cor e o horário da conta)
  const selDias = server.log.slice(antes).filter((l) => l.op === 'select' && l.t === 'metas_dias');
  ok(selDias.length >= 1 && selDias.every((l) => l.since !== null) && selDias.every((l) => l.n <= 2), 'e os dias das metas são lidos de forma incremental (só o que mudou nos últimos segundos, não tudo)');

  // ======================================================================================================
  console.log('\nD) O Assistente fala das metas:');
  w.switchListTab('assistant');
  [...d.querySelectorAll('#assistant-chips button')].find((b) => b.textContent === 'Minhas metas').click();
  const ans = [...d.querySelectorAll('#assistant-feed > div')].pop().textContent;
  ok(/^Nível 1 · Iniciante: 0 pontos e ⭐ 0 estrelas\. Faltam 100 pro nível 2\./.test(ans) && /Meditar/.test(ans) && /Beber água/.test(ans) && /5m de 25m hoje · falta 20m/.test(ans), '"Minhas metas": nível, pontos, estrelas e cada meta com o que falta ("' + ans.slice(0, 70) + '…")');
  w.assistantRestart();
  ok(/Metas de hoje: 0 de 1 cumpridas\./.test($('assistant-feed').textContent), 'o resumo do dia lembra das metas de hoje');
  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 200) : ''));
  try { w.close(); } catch (e) {}

  // ======================================================================================================
  console.log('\nE) O cérebro do Assistente com metas (retrato montado aqui, segunda 16/11 10:20):');
  const base = { now: new Date(NOW), hours: [7, 24], blocks: [], tasks: [], routines: [], notes: [], expenses: [] };
  const daysE = [dia('meta_1', '2026-11-14', 8, 8), dia('meta_1', '2026-11-15', 8, 8), dia('meta_1', '2026-11-16', 3, 8), dia('meta_4', '2026-11-16', 30, 30), dia('meta_3', '2026-10-01', 600, 500)];
  const snapG = M.forAssistant([{ id: 'gl_pessoal', name: 'Pessoal' }, { id: 'gl_financeiro', name: 'Financeiro' }], [agua, correr, guardar, meditar], daysE, NOW);
  ok(snapG.level === 2 && snapG.points === 230 && snapG.stars === 4 && snapG.todayDone === 1 && snapG.todayTotal === 2 && snapG.items[0].streakText === '2 dias seguidos' && snapG.items[0].left === '5 vezes', 'retrato pronto: nível 2, 230 pontos (2 dias de água, 1 de meditação e outubro guardado), ⭐ 4, hoje 1 de 2; água com 2 dias seguidos e faltam 5 vezes');
  let r = A.reply('metas', Object.assign({}, base, { goals: snapG }));
  ok(r.text === 'Nível 2 · Aprendiz: 230 pontos e ⭐ 4 estrelas. Faltam 20 pro nível 3. Hoje: 1 de 2 metas diárias cumpridas.', 'resposta: "' + r.text + '"');
  ok(r.items.map((i) => i.label + '|' + i.tone).join() === '💧 Beber água|next,🏃 Correr|next,💰 Guardar dinheiro|next,🧘 Meditar|done', 'o que falta vem primeiro (diárias, semanais, mensais) e as cumpridas no fim');
  ok(r.items[0].sub === '3 de 8 hoje · falta 5 vezes · 🔥 2 dias seguidos · Pessoal' && r.items[0].ref.kind === 'meta' && r.items[0].ref.id === 'meta_1' && r.items[3].sub === '30m de 30m hoje · cumprida ✓ · 🔥 1 dia seguido · Pessoal', 'cada meta: progresso, o que falta, a sequência e a lista (e abre a meta)');
  ok(r.footer === 'Fez? Toque no + da meta, na aba Metas.', 'rodapé ensina o +');
  ok(A.reply('metas', base).text.startsWith('Você ainda não tem metas.') && A.reply('metas', Object.assign({}, base, { goals: null })).items.length === 0, 'sem metas: explica como criar');
  ok(A.intentOf('qual o meu nível?') === 'metas' && A.intentOf('quantas estrelas eu tenho') === 'metas' && A.intentOf('quantos pontos?') === 'metas', 'entende "nível", "estrelas" e "pontos"');
  const allDone = Object.assign({}, snapG, { todayDone: 2 });
  ok(A.briefing(Object.assign({}, base, { goals: allDone })).footer === 'Metas de hoje: todas cumpridas! ⭐' && A.reply('metas', Object.assign({}, base, { goals: allDone })).text.endsWith('Hoje você cumpriu todas as metas do dia! 🎉'), 'cumpriu todas as diárias: o resumo do dia e a resposta comemoram');
  ok(A.briefing(base).footer === '', 'sem metas, o resumo do dia fica como antes');

  end();
})().catch((e) => { console.error('ERRO', e); fail++; end(); });

function end() {
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}
