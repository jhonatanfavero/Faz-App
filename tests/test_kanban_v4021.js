// V40.21.0 — tela do PC (kanban.html): aba Metas, as mesmas do celular. V40.23.0: uma página só, com um título por
// categoria e os cartões em grade, como as Rotinas (Pessoal, Profissional e Financeiro nascem sozinhas). Meta nova
// (com sugestões), "+" e "−", estrelas, pontos e nível, editar (trocar a frequência recomeça a contagem), apagar,
// categorias, e o Assistente abrindo a meta.
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4021.js <repo> <backup.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const M = require(path.resolve(REPO, 'metas.js'));
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
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };

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
  const key = (el, k) => { const e = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
  const visible = (id) => !$(id).classList.contains('hidden');
  const cols = () => [...d.querySelectorAll('#mt-sections section.mt-sec')];
  const colOf = (id) => d.querySelector('#mt-sections section[data-mt-sec="' + id + '"]');
  const card = (id) => d.querySelector('#mt-sections [data-goal="' + id + '"]');
  const toastTxt = () => $('toast').textContent;
  const dlgOk = async (value) => { await waitFor(() => visible('dialog')); if (value != null) $('dlg-input').value = value; click($('dlg-ok')); await sleep(30); };
  const alive = (t) => server.alive(t, UID);
  const row = (t, id) => server.get(t, UID, id);
  await waitFor(() => d.querySelectorAll('section.col').length === 5);

  console.log('A) Primeira vez na aba Metas:');
  ok([...d.querySelectorAll('.tab')].map((b) => b.textContent.trim()).join(',') === 'Assistente,Quadros,Agenda,Rotinas,Notas,Finanças,Metas', 'aba Metas no fim: Assistente, Quadros (eram as Listas até a V40.47.1), Agenda, Rotinas, Notas, Finanças, Metas');
  ok(server.log.some((l) => l.op === 'select' && l.t === 'metas_listas') && server.log.some((l) => l.op === 'select' && l.t === 'metas_dias'), 'a tela já carrega as metas da nuvem junto com o resto');
  ok(alive('metas_listas').length === 0, 'só abrir o PC não cria nada');
  click($('tab-metas'));
  ok(visible('metas') && !visible('board') && $('tab-metas').classList.contains('on') && w.localStorage.getItem('faz_pc_tab') === 'metas' && !visible('zoom-ctl'), 'abre, fica lembrada e não tem zoom');
  await waitFor(() => alive('metas_listas').length === 3);
  ok(alive('metas_listas').map((r) => r.id + ':' + r.name + ':' + r.is_default).sort().join() === 'gl_financeiro:Financeiro:true,gl_pessoal:Pessoal:true,gl_profissional:Profissional:true', 'nascem Pessoal, Profissional e Financeiro na nuvem (os mesmos ids do celular)');
  ok(cols().map((c) => c.dataset.mtSec).join() === 'gl_pessoal,gl_profissional,gl_financeiro' && !d.querySelector('.mt-col') && visible('mt-new-cat'), 'uma página só, um título por categoria, na ordem (nada de colunas); "Nova categoria" no topo');
  ok($('mt-level-n').textContent === '1' && $('mt-level-name').textContent === 'Iniciante' && $('mt-points').textContent === '0 pontos' && $('mt-level-sub').textContent === '⭐ 0 estrelas · faltam 100 pro nível 2', 'nível 1 · Iniciante · 0 pontos · faltam 100 pro nível 2');
  ok(colOf('gl_pessoal').querySelector('.mt-sec-add').textContent === 'Meta em Pessoal' && /Crie sua primeira meta/.test($('mt-sections').textContent) && $('board-summary').textContent === 'Nenhuma meta ainda', 'categoria vazia tem o atalho "+ Meta em Pessoal" e a página explica o que fazer');
  await sleep(100);
  ok(alive('metas_listas').length === 3 && server.log.filter((l) => l.op === 'upsert' && l.t === 'metas_listas').length <= 1, 'redesenhar não cria as listas de novo');

  console.log('\nB) Meta nova:');
  click($('mt-new'));
  ok(visible('modal-goal') && $('mt-f-head').textContent === 'Nova meta' && d.querySelectorAll('#mt-f-tpl [data-mt-tpl]').length === M.TEMPLATES.length && !visible('mt-f-delete') && d.activeElement === $('mt-f-title'), 'abre a janela "Nova meta" com as sugestões e o cursor no nome');
  ok($('mt-f-target').value === '1' && $('mt-f-step').value === '1' && d.querySelector('#mt-f-period [data-period="dia"]').classList.contains('on') && d.querySelector('#mt-f-unit [data-unit="vezes"]').classList.contains('on') && $('mt-f-target-suf').textContent === 'vezes por dia' && $('mt-f-list').value === 'gl_pessoal', 'começa com Diária, Vezes, meta 1, na primeira lista');
  click(d.querySelector('#mt-f-unit [data-unit="minutos"]'));
  ok($('mt-f-target').value === '30' && $('mt-f-step').value === '15' && $('mt-f-target-suf').textContent === 'minutos por dia' && $('mt-f-info').textContent === '⭐ Cada dia cumprido vale uma estrela e 10 pontos.', 'trocar pra Minutos sugere 30 min, +15');
  $('mt-f-target').value = '45'; $('mt-f-target').dispatchEvent(new w.Event('input', { bubbles: true }));
  click(d.querySelector('#mt-f-unit [data-unit="reais"]'));
  ok($('mt-f-target').value === '45' && $('mt-f-target-suf').textContent === 'reais por dia', 'depois de digitar o alvo, trocar a medida não apaga o que foi digitado');
  click(d.querySelector('#mt-f-tpl [data-mt-tpl="0"]'));
  ok($('mt-f-title').value === 'Beber água' && $('mt-f-emoji').value === '💧' && $('mt-f-target').value === '8' && $('mt-f-step').value === '1' && d.querySelector('#mt-f-unit [data-unit="vezes"]').classList.contains('on') && $('mt-f-list').value === 'gl_pessoal', 'a sugestão "💧 Beber água" preenche tudo (8 vezes por dia, Pessoal)');
  click($('mt-f-save'));
  await waitFor(() => alive('metas').length === 1);
  const agua = alive('metas')[0];
  ok(!visible('modal-goal') && /^meta_\d+$/.test(agua.id) && agua.list_id === 'gl_pessoal' && agua.title === 'Beber água' && agua.emoji === '💧' && agua.period === 'dia' && agua.unit === 'vezes' && agua.target === 8 && agua.step === 1 && agua.position > 0 && toastTxt() === 'Meta criada 🎯', 'salvou na nuvem no formato do app (meta_..., Pessoal, 8 vezes por dia)');
  ok(card(agua.id) && colOf('gl_pessoal').contains(card(agua.id)) && card(agua.id).querySelector('.mt-status').textContent === '0 de 8 hoje' && card(agua.id).querySelector('[data-mt-plus]').textContent === '+1' && !card(agua.id).querySelector('[data-mt-minus]') && card(agua.id).textContent.includes('8 vezes por dia'), 'cartão embaixo do título Pessoal: "0 de 8 hoje", botão +1 (sem − ainda)');
  click(colOf('gl_financeiro').querySelector('.mt-sec-add'));
  ok(visible('modal-goal') && $('mt-f-list').value === 'gl_financeiro', '"+ Meta em Financeiro" já vem com a categoria dela');
  $('mt-f-title').value = 'Reserva'; $('mt-f-emoji').value = '🏦🏦'; click(d.querySelector('#mt-f-period [data-period="mes"]')); click(d.querySelector('#mt-f-unit [data-unit="reais"]'));
  $('mt-f-target').value = '1.500,50'; $('mt-f-step').value = '100';
  key($('mt-f-step'), 'Enter');
  await waitFor(() => alive('metas').length === 2);
  const reserva = alive('metas').find((r) => r.title === 'Reserva');
  ok(reserva && reserva.list_id === 'gl_financeiro' && reserva.period === 'mes' && reserva.unit === 'reais' && reserva.target === 1500.5 && reserva.step === 100 && reserva.emoji === '🏦' && reserva.position > agua.position, 'Enter salva; "1.500,50" vira 1500,5; emoji fica só um; mensal em reais, no fim');
  ok(card(reserva.id).querySelector('.mt-status').textContent === 'R$ 0,00 de R$ 1.500,50 neste mês' && card(reserva.id).querySelector('[data-mt-plus]').textContent === '+R$ 100', 'cartão: "R$ 0,00 de R$ 1.500,50 neste mês", botão "+R$ 100"');
  click($('mt-new')); $('mt-f-title').value = ''; click($('mt-f-save'));
  ok(visible('modal-goal') && toastTxt() === 'Dê um nome pra meta.', 'sem nome não salva');
  $('mt-f-title').value = 'X'; $('mt-f-target').value = '0'; click($('mt-f-save'));
  ok(visible('modal-goal') && toastTxt() === 'Informe a meta: um número maior que zero.', 'meta zero não salva');
  key(d.body, 'Escape');
  ok(!visible('modal-goal') && alive('metas').length === 2, 'Esc fecha sem salvar');

  console.log('\nC) "+" e "−", estrelas e pontos:');
  const upsBefore = server.log.filter((l) => l.op === 'upsert' && l.t === 'metas_dias').length;
  for (let i = 0; i < 7; i++) click(card(agua.id).querySelector('[data-mt-plus]'));
  ok(card(agua.id).querySelector('.mt-status').textContent === '7 de 8 hoje' && !!card(agua.id).querySelector('[data-mt-minus]'), 'sete cliques: "7 de 8 hoje" na hora, e aparece o −');
  const did = agua.id + '_20261116';
  await waitFor(() => row('metas_dias', did) && row('metas_dias', did).amount === 7);
  await sleep(60);
  ok(row('metas_dias', did).amount === 7 && row('metas_dias', did).goal_id === agua.id && row('metas_dias', did).date === '2026-11-16' && row('metas_dias', did).target === 8, 'na nuvem: uma linha pro dia (meta_..._20261116) com 7 e o alvo da época');
  ok(server.log.filter((l) => l.op === 'upsert' && l.t === 'metas_dias').length - upsBefore === 1, 'cliques seguidos viram um envio só, com o valor final');
  click(card(agua.id).querySelector('[data-mt-plus]'));
  ok(toastTxt() === '⭐ Meta cumprida! +10 pontos' && card(agua.id).querySelector('.mt-status').textContent === '✓ 8 de 8 hoje' && card(agua.id).className.includes('border-emerald-200') && $('mt-points').textContent === '10 pontos' && $('mt-level-sub').textContent.startsWith('⭐ 1 estrela · hoje 1 de 1 meta diária'), 'o 8º: "⭐ Meta cumprida! +10 pontos", cartão verde com ✓ e 10 pontos');
  ok(card(agua.id).textContent.includes('🔥 1') && card(agua.id).textContent.includes('⭐ 1'), 'o cartão mostra a sequência (🔥 1) e as estrelas da meta (⭐ 1)');
  await waitFor(() => row('metas_dias', did).amount === 8);
  click(card(agua.id).querySelector('[data-mt-minus]'));
  ok(card(agua.id).querySelector('.mt-status').textContent === '7 de 8 hoje' && $('mt-points').textContent === '0 pontos', 'o − desfaz (a estrela sai)');
  ok(await waitFor(() => row('metas_dias', did).amount === 7), 'e a nuvem acompanha');
  click(card(agua.id).querySelector('[data-mt-plus]'));
  await waitFor(() => row('metas_dias', did).amount === 8);

  console.log('\nD) O celular mexe; o PC atualiza sozinho:');
  server.insert('metas_dias', UID, { id: reserva.id + '_20261110', goal_id: reserva.id, date: '2026-11-10', amount: 900, target: 1500.5 });
  ok(await waitFor(() => card(reserva.id).querySelector('.mt-status').textContent === 'R$ 900,00 de R$ 1.500,50 neste mês'), 'R$ 900 guardados no celular aparecem aqui');
  server.insert('metas', UID, { id: 'meta_cel', list_id: 'gl_profissional', title: 'Inglês <b>', emoji: '🇺🇸', period: 'semana', unit: 'minutos', target: 120, step: 30, position: 99999, created_ms: 1 });
  ok(await waitFor(() => !!card('meta_cel')) && colOf('gl_profissional').contains(card('meta_cel')) && !d.querySelector('#mt-sections b') && card('meta_cel').textContent.includes('Inglês <b>') && card('meta_cel').querySelector('.mt-status').textContent === '0m de 2h nesta semana', 'meta criada no celular aparece na categoria dela (texto com HTML aparece como texto)');

  console.log('\nE) Editar:');
  click(card(agua.id));
  ok(visible('modal-goal') && $('mt-f-head').textContent === 'Editar meta' && $('mt-f-title').value === 'Beber água' && $('mt-f-target').value === '8' && visible('mt-f-delete') && !visible('mt-f-tpl-wrap'), 'clicar no cartão abre "Editar meta" (com apagar, sem sugestões)');
  const before = JSON.stringify(row('metas', agua.id));
  $('mt-f-target').value = '10';
  click($('mt-f-save'));
  await waitFor(() => row('metas', agua.id).target === 10);
  const after = row('metas', agua.id);
  ok(after.target === 10 && after.title === 'Beber água' && after.period === 'dia' && JSON.parse(before).position === after.position && card(agua.id).querySelector('.mt-status').textContent === '8 de 10 hoje' && toastTxt() === 'Meta salva', 'mudar só o alvo grava só o alvo, e mantém o que foi feito: "8 de 10 hoje"');
  click(card(agua.id)); click(d.querySelector('#mt-f-period [data-period="semana"]')); click($('mt-f-save'));
  await waitFor(() => visible('dialog'));
  ok(visible('dialog') && $('dlg-title').textContent === 'Mudar a frequência ou a medida?' && row('metas', agua.id).period === 'dia', 'trocar a frequência pergunta antes (a contagem recomeça)');
  await dlgOk();
  await waitFor(() => row('metas', agua.id).period === 'semana');
  ok(row('metas', agua.id).period === 'semana' && row('metas_dias', did).deleted === true && card(agua.id).querySelector('.mt-status').textContent === '0 de 10 nesta semana' && toastTxt() === 'Meta salva. A contagem recomeçou.', 'confirmou: semanal, o que foi marcado sai (na nuvem também) e recomeça');
  click(card(agua.id)); $('mt-f-list').value = 'gl_profissional'; click($('mt-f-save'));
  await waitFor(() => row('metas', agua.id).list_id === 'gl_profissional');
  ok(colOf('gl_profissional').contains(card(agua.id)) && row('metas', agua.id).position > row('metas', 'meta_cel').position, 'mudar de categoria leva a meta pro fim da outra');

  console.log('\nF) Apagar meta e listas de metas:');
  click(card(reserva.id)); click($('mt-f-delete'));
  await waitFor(() => visible('dialog'));
  ok($('dlg-title').textContent === 'Apagar a meta "Reserva"?' && $('dlg-text').textContent === 'Ela sai daqui e do celular.', 'apagar a meta pergunta antes');
  await dlgOk();
  ok(await waitFor(() => row('metas', reserva.id).deleted === true && row('metas_dias', reserva.id + '_20261110').deleted === true) && !card(reserva.id) && !visible('modal-goal'), 'meta apagada na nuvem, com o que foi marcado nela');
  click($('mt-new-cat'));
  await dlgOk('Saúde');
  await waitFor(() => alive('metas_listas').length === 4);
  const saude = alive('metas_listas').find((r) => r.name === 'Saúde');
  ok(saude && /^gl_\d+$/.test(saude.id) && saude.position > row('metas_listas', 'gl_financeiro').position && saude.is_default === false && cols().length === 4 && toastTxt() === 'Categoria criada' && cols()[3].dataset.mtSec === saude.id, 'categoria "Saúde" criada, no fim da página');
  click(colOf(saude.id).querySelector('[data-mt-rename]'));
  await dlgOk('Saúde e corpo');
  ok(await waitFor(() => row('metas_listas', saude.id).name === 'Saúde e corpo') && colOf(saude.id).querySelector('h2').textContent === 'Saúde e corpo', 'renomear a categoria');
  click(colOf(saude.id).querySelector('header [data-mt-add]')); click(d.querySelector('#mt-f-tpl [data-mt-tpl="2"]')); $('mt-f-list').value = saude.id; click($('mt-f-save'));
  await waitFor(() => alive('metas').some((r) => r.title === 'Meditar'));
  const medit = alive('metas').find((r) => r.title === 'Meditar');
  click(card(medit.id).querySelector('[data-mt-plus]'));
  await waitFor(() => row('metas_dias', medit.id + '_20261116'));
  click(colOf(saude.id).querySelector('[data-mt-dellist]'));
  await waitFor(() => visible('dialog'));
  ok($('dlg-title').textContent === 'Apagar a categoria "Saúde e corpo"?' && $('dlg-text').textContent === 'A meta dela também será apagada, aqui e no celular.', 'apagar a categoria avisa que a meta dela vai junto');
  await dlgOk();
  ok(await waitFor(() => row('metas_listas', saude.id).deleted === true && row('metas', medit.id).deleted === true && row('metas_dias', medit.id + '_20261116').deleted === true) && !colOf(saude.id) && toastTxt() === 'Categoria apagada', 'categoria, meta e o que foi marcado: apagados na nuvem');

  console.log('\nG) O Assistente fala das metas e abre a meta:');
  click($('tab-assistente'));
  click(d.querySelector('#as-chips [data-as-chip="metas"]'));
  const last = [...d.querySelectorAll('#as-feed > div')].pop();
  ok(/^Nível 1 · Iniciante: 0 pontos e ⭐ 0 estrelas\. Faltam 100 pro nível 2\./.test(last.textContent) && last.querySelectorAll('[data-as-kind="meta"]').length === 2, '"Minhas metas": nível, pontos e as 2 metas (' + last.textContent.slice(0, 60) + '…)');
  click(last.querySelector('[data-as-kind="meta"][data-as-id="' + agua.id + '"]'));
  ok(visible('metas') && visible('modal-goal') && $('mt-f-title').value === 'Beber água', 'clicar na meta da resposta abre a meta na aba Metas');
  key(d.body, 'Escape');

  console.log('\nH) Teclado e cuidados:');
  ok(key(d.body, 'ArrowRight') === false && visible('metas'), 'setas ← → não fazem nada nas Metas (não tem mais colunas pra rolar)');
  server.patch('metas_listas', UID, 'gl_profissional', { deleted: true });
  server.patch('metas_listas', UID, 'gl_financeiro', { deleted: true });
  await waitFor(() => cols().length === 1);
  ok(cols().length === 1 && colOf('gl_pessoal').contains(card(agua.id)) && colOf('gl_pessoal').contains(card('meta_cel')), 'categoria apagada no celular: as metas dela aparecem na primeira categoria (nada some)');
  click(colOf('gl_pessoal').querySelector('[data-mt-dellist]'));
  ok(!visible('dialog') && toastTxt() === 'Precisa ter pelo menos uma categoria.', 'a última categoria não pode ser apagada');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
