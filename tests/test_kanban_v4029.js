// V40.29.0 — tela do PC (kanban.html): RELATÓRIOS (o "Produtividade" do celular) na barra da Agenda.
// (A) o botão e a janela; (B) as MESMAS contas do celular: o app do celular (index.html + app.js em jsdom) e a tela do PC,
// com os mesmos dados e o mesmo relógio (domingo 15/11/2026, 21:00), mostram os mesmos números em Hoje, 7 e 30 dias;
// (C) visão Dia usa o dia aberto; dia sem nada; (D) arquivado não conta, tag apagada vira "Excluída", os filtros da
// Agenda não mudam nada, o que chega da nuvem atualiza a janela aberta; (E) Esc, Fechar e fundo; nome com HTML fica texto;
// (F) a Semana é sempre de segunda a domingo ("Hoje", setas, "Novo bloco", voltando do Dia).
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4029.js <repo> <backup.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const bootPhone = require('./boot_app');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
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
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };

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
      const RD = w.Date, FIX = new RD(2026, 10, 15, 21, 0, 0).getTime(); // domingo 15/11/2026, 21:00 (o mesmo "agora" do celular nos testes)
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const press = (el, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const open = () => !$('modal-rep').classList.contains('hidden');
  const tab = (p2) => click($('rep-tabs').querySelector(`[data-rep="${p2}"]`));
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  // o que a janela do PC mostra
  const pc = () => {
    const b = $('rep-body');
    if (!b.querySelector('.rep-global')) return { vazio: /Sem registros no período/.test(b.textContent) };
    return {
      pct: T(b.querySelector('.rep-pct')), feito: T(b.querySelector('.rep-done')).replace(/^●\s*/, ''), total: T(b.querySelector('.rep-total')).replace(/^●\s*/, ''),
      tags: [...b.querySelectorAll('.rep-tag')].map((t) => [T(t.querySelector('.rep-name')), T(t.querySelector('.rep-planned')), parseInt(T(t.querySelector('.rep-feito')), 10), t.querySelector('.rep-atr') ? parseInt(T(t.querySelector('.rep-atr')), 10) : 0].join('|')),
    };
  };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda')); await sleep(60);

  // ======================================================================================================
  console.log('A) Botão e janela:');
  ok(!!$('ag-rep') && /Relatórios/.test($('ag-rep').textContent) && $('ag-rep').closest('#agenda'), 'botão "Relatórios" na barra da Agenda');
  click($('ag-rep')); await sleep(20);
  ok(open() && T($('rep-title')) === 'Produtividade' && $('rep-tabs').querySelector('[data-rep="today"]').getAttribute('aria-selected') === 'true', 'abre a janela "Produtividade" em "Hoje"');
  ok(T($('rep-range')) === 'hoje, Dom 15/11', 'período: "' + T($('rep-range')) + '"');

  // ======================================================================================================
  console.log('\nB) As mesmas contas do celular:');
  const P = await bootPhone(REPO, backup.data);
  const phone = (period) => {
    P.w.eval(`activeDateObj = new Date(2026, 10, 15); renderReports('${period}')`);
    const c = P.$('reports-container');
    if (!c.querySelector('.text-3xl')) return { vazio: /Sem registros no período/.test(c.textContent) };
    const ps = [...c.querySelectorAll('p.text-xs')].map((x) => T(x).replace(/^●\s*/, ''));
    return {
      pct: T(c.querySelector('.text-3xl')), feito: ps[0], total: ps[1],
      tags: [...c.querySelectorAll('.bg-white.border')].map((t) => { const s = T(t); return [T(t.querySelector('span.font-bold.text-sm')), T(t.querySelector('span.rounded.font-bold')), parseInt((s.match(/(\d+)% Feito/) || [])[1], 10), parseInt((s.match(/(\d+)% Atr\./) || [0, 0])[1], 10)].join('|'); }),
    };
  };
  for (const [period, nome] of [['today', 'Hoje'], ['week', '7 dias'], ['month', '30 dias']]) {
    tab(period); await sleep(10);
    const a = pc(), b = phone(period);
    ok(JSON.stringify(a) === JSON.stringify(b) && !a.vazio && a.tags.length >= 2, `${nome}: o PC mostra o mesmo que o celular (${a.pct}, ${a.feito}, ${a.total}; ${a.tags.length} tags)` + (JSON.stringify(a) === JSON.stringify(b) ? '' : '\n      PC:      ' + JSON.stringify(a) + '\n      celular: ' + JSON.stringify(b)));
  }
  ok(T($('rep-range')) === 'Sáb 17/10 a Dom 15/11', '30 dias: "' + T($('rep-range')) + '"');
  tab('week'); await sleep(10);
  ok(T($('rep-range')) === 'Seg 09/11 a Dom 15/11', '7 dias: "' + T($('rep-range')) + '" (com hoje)');
  const ordem = pc().tags.map((t) => t.split('|')[0]);
  ok(ordem.length >= 2, 'as tags vêm da que tem mais tempo pra que tem menos (' + ordem.join(', ') + ')');

  // ======================================================================================================
  console.log('\nC) Visão Dia e dia sem nada:');
  press(d.body, 'Escape'); await sleep(20);
  // a Semana de hoje (domingo 15/11) vai de segunda 09/11 a domingo 15/11: o dia 13 está nela
  click(d.querySelector(`#ag-cols .ag-day-btn[data-day="2026-11-13"]`)); await sleep(60);
  ok(T($('ag-label')) === 'Sexta, 13 de novembro', 'visão Dia no dia 13 (' + T($('ag-label')) + ')');
  click($('ag-rep')); tab('today'); await sleep(10);
  P.w.eval(`activeDateObj = new Date(2026, 10, 13); renderReports('today')`);
  ok(T($('rep-range')) === 'Sex 13/11', 'na visão Dia o "Hoje" é o dia aberto: "' + T($('rep-range')) + '"');
  const dia13 = pc();
  P.w.eval(`activeDateObj = new Date(2026, 10, 13);`);
  const cel13 = (() => { P.w.eval(`renderReports('today')`); const c = P.$('reports-container'); return T(c.querySelector('.text-3xl')); })();
  ok(dia13.pct === cel13, 'e o número bate com o celular no dia 13 (' + dia13.pct + ')');
  press(d.body, 'Escape'); await sleep(20);
  for (let i = 0; i < 60 && T($('ag-label')) !== 'Sexta, 25 de dezembro'; i++) { click($('ag-next')); await sleep(15); }
  click($('ag-rep')); tab('today'); await sleep(10);
  ok(T($('ag-label')) === 'Sexta, 25 de dezembro' && pc().vazio === true, 'dia sem blocos: "Sem registros no período."');
  press(d.body, 'Escape'); await sleep(20);
  click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); await sleep(60);

  // ======================================================================================================
  console.log('\nD) O que conta e o que não conta:');
  click($('ag-rep')); tab('today'); await sleep(10);
  const antes = pc();
  const b15 = server.alive('blocos', UID).filter((b) => b.date === '2026-11-15' && !b.archived).sort((a, c) => c.duration - a.duration)[0];
  server.patch('blocos', UID, b15.id, { archived: true });
  await waitFor(() => pc().total !== antes.total);
  const fmt = (m) => { const h = Math.floor(m / 60), mi = m % 60; return h > 0 && mi > 0 ? `${h}h ${mi}m` : (h > 0 ? `${h}h` : `${mi}m`); };
  const tot = (s) => { const m = s.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/); return (+(m[1] || 0)) * 60 + (+(m[2] || 0)); };
  ok(tot(pc().total) === tot(antes.total) - b15.duration, 'arquivou um bloco (vindo da nuvem, com a janela aberta): sai da conta na hora (' + antes.total + ' → ' + pc().total + ')');
  server.patch('blocos', UID, b15.id, { archived: false }); await waitFor(() => pc().total === antes.total);
  // tag apagada: os blocos que ainda apontam pra ela viram "Excluída"
  const tagUsada = server.alive('tags', UID).find((t) => server.alive('blocos', UID).some((b) => b.date === '2026-11-15' && b.tag_id === t.id && !b.archived));
  server.patch('tags', UID, tagUsada.id, { deleted: true });
  await waitFor(() => pc().tags.some((t) => t.startsWith('Excluída|')));
  ok(pc().tags.some((t) => t.startsWith('Excluída|')) && !pc().tags.some((t) => t.startsWith(tagUsada.name + '|')), 'tag apagada: o tempo dela aparece como "Excluída" (igual ao celular)');
  server.patch('tags', UID, tagUsada.id, { deleted: false }); await waitFor(() => !pc().tags.some((t) => t.startsWith('Excluída|')));
  press(d.body, 'Escape'); await sleep(20);
  // filtros da Agenda não mudam o relatório
  const sel = $('ag-tag'); sel.value = tagUsada.id; sel.dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(30);
  click($('ag-hide-done')); await sleep(30);
  click($('ag-rep')); tab('today'); await sleep(10);
  ok(JSON.stringify(pc()) === JSON.stringify(antes), 'filtro por tag e "Ocultar concluídos" ligados: o relatório continua o mesmo');
  press(d.body, 'Escape'); await sleep(20);
  sel.value = ''; sel.dispatchEvent(new w.Event('change', { bubbles: true })); click($('ag-hide-done')); await sleep(30);

  // ======================================================================================================
  console.log('\nE) Fechar e texto:');
  click($('ag-rep')); await sleep(10);
  press(d.body, 'Escape'); await sleep(10);
  ok(!open(), 'Esc fecha');
  click($('ag-rep')); click($('rep-close')); await sleep(10);
  ok(!open(), '"Fechar" fecha');
  click($('ag-rep')); await sleep(10);
  $('modal-rep').dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, detail: 1 })); await sleep(10);
  ok(!open(), 'clicar fora (no fundo) fecha');
  click($('ag-rep')); await sleep(10);
  const label0 = T($('ag-label'));
  press(d.body, 'ArrowRight'); await sleep(20);
  ok(open() && T($('ag-label')) === label0, 'com a janela aberta, as setas do teclado não mexem na Agenda de trás');
  press(d.body, 'Escape');
  server.patch('tags', UID, tagUsada.id, { name: '<img src=x onerror=alert(1)><b>Tag</b>' }); await sleep(150);
  click($('ag-rep')); tab('today'); await sleep(10);
  ok(!$('rep-body').querySelector('img, b') && pc().tags.some((t) => t.startsWith('<img src=x onerror=alert(1)><b>Tag</b>|')), 'nome de tag com HTML aparece como texto');
  press(d.body, 'Escape');

  // ======================================================================================================
  console.log('\nF) A Semana é sempre de segunda a domingo:');
  const dias = () => [...d.querySelectorAll('#ag-cols .ag-list')].map((l) => l.dataset.day);
  click(d.querySelector('.ag-view[data-view="week"]')); click($('ag-today')); await sleep(60);
  ok(T($('ag-label')) === '9 a 15 de nov' && dias().join() === '2026-11-09,2026-11-10,2026-11-11,2026-11-12,2026-11-13,2026-11-14,2026-11-15', 'domingo 15/11, "Hoje": de segunda 09 a domingo 15 ("' + T($('ag-label')) + '"), não de hoje até o domingo seguinte');
  ok(/Hoje/.test(T(d.querySelector('#ag-cols section:last-child .ag-day-btn'))) && /^Dom/.test(T(d.querySelector('#ag-cols section:last-child .ag-day-btn'))), 'hoje (domingo) é a última coluna, com o selo "Hoje"');
  click($('ag-new')); await sleep(30);
  ok($('f-date').value === '2026-11-15', '"Novo bloco" na semana de hoje: já vem em hoje');
  press(d.body, 'Escape'); await sleep(30);
  click($('ag-next')); await sleep(40);
  ok(T($('ag-label')) === '16 a 22 de nov' && dias()[0] === '2026-11-16' && dias()[6] === '2026-11-22', 'seta pra frente: segunda 16 a domingo 22');
  click($('ag-new')); await sleep(30);
  ok($('f-date').value === '2026-11-16', '"Novo bloco" numa semana sem hoje: vem na segunda');
  press(d.body, 'Escape'); await sleep(30);
  click(d.querySelector('#ag-cols .ag-day-btn[data-day="2026-11-19"]')); await sleep(40);
  ok(T($('ag-label')) === 'Quinta, 19 de novembro', 'clicou no nome da quinta: abre o Dia');
  click($('ag-next')); click($('ag-next')); click($('ag-next')); click($('ag-next')); await sleep(40);
  ok(T($('ag-label')) === 'Segunda, 23 de novembro', 'andou 4 dias no Dia (segunda 23)');
  click(d.querySelector('.ag-view[data-view="week"]')); await sleep(40);
  ok(dias()[0] === '2026-11-23' && T($('ag-label')) === '23 a 29 de nov', 'voltou pra Semana: a semana desse dia, de segunda a domingo');

  ok(!errors.length && !P.errors.length, 'nenhum erro nas duas telas' + ([...errors, ...P.errors].length ? ': ' + [...errors, ...P.errors].slice(0, 2).join(' | ') : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
