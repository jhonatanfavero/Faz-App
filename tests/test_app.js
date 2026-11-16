// Integração: index.html + app.js REAIS + sync.js, com os dados de teste e Supabase falso.
// Uso: TZ='America/Sao_Paulo' node test_app.js <repo> <backup.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient, clone } = require('./mock_supabase');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 9000, step = 50) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));

  let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');            // CDNs e scripts locais: injetamos à mão
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script>');
  const dom = new JSDOM(html, { url: 'https://jhonatanfavero.github.io/Faz-App/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc, beforeParse(w) { require('./boot_app').travarRelogio(w); } });
  const w = dom.window;
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r));

  // dados de teste, como se fossem os do celular
  for (const [k, v] of Object.entries(backup.data)) w.localStorage.setItem(k, v);

  // stubs do navegador
  const confirms = [], toasts = [];
  w.confirm = (msg) => { confirms.push(msg); return true; };
  w.alert = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLElement.prototype.scrollTo = function () {};
  w.scrollTo = () => {};
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));

  const server = makeServer();
  server.addUser('pessoa@teste.com', 'senha123', UID);
  w.supabase = { createClient: makeCreateClient(server) }; // a "biblioteca" (em produção vem do CDN só quando precisa)

  const inject = (f) => { const s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s); };
  inject('app.js'); inject('faz-config.js'); inject('sync.js');
  const toastEl = w.document.getElementById('toast-msg');
  const origShowToast = w.eval('showToast');
  w.eval('showToast = function(m){ window.__toasts = (window.__toasts||[]).concat([m]); }');
  void origShowToast; void toastEl;
  await sleep(300);

  const L = (k) => w.localStorage.getItem(k);
  const ORIG = { t: backup.data.tb_backlog_db, l: backup.data.tb_backlog_columns, g: backup.data.tb_tags_db };
  const $ = (id) => w.document.getElementById(id);

  // =========================================================
  console.log('A) App abre normal, SEM login (como pra tua esposa e testers):');
  ok(errors.length === 0, 'app.js + sync.js carregaram sem nenhum erro' + (errors.length ? ' → ' + errors[0].slice(0, 300) : ''));
  ok(w.eval('backlogDb.length') === 51 && w.eval('backlogColumnsDb.length') === 5, 'teus dados carregados (51 tarefas, 5 listas)');
  ok(server.createClientCalls === 0, 'biblioteca do Supabase NEM foi usada (zero impacto sem login)');
  ok(typeof w.fazSyncNotify === 'function' && typeof w.openConfigSync === 'function', 'funções do sync expostas');
  w.eval('saveBacklog(); saveTags(); saveBacklogColumns();');
  await sleep(100);
  ok(server.log.length === 0, 'salvar sem login não manda nada pra lugar nenhum');
  ok($('sync-menu-status').textContent === 'Listas e Agenda no computador', 'menu Config mostra "Listas e Agenda no computador"');

  console.log('\nB) Config → Sincronizar → Entrar (1ª sincronização):');
  w.openConfigSheet();
  w.openConfigSync();
  ok(!$('config-sync-view').classList.contains('hidden') && $('config-main-menu').classList.contains('hidden'), 'tela Sincronizar abriu no lugar do menu');
  ok($('config-title').innerText === 'Sincronizar' && $('config-back-btn').getAttribute('onclick') === 'closeConfigSync()', 'título e botão voltar certos');
  await waitFor(() => server.createClientCalls === 1);
  ok(!$('sync-logged-out').classList.contains('hidden') && $('sync-logged-in').classList.contains('hidden'), 'mostra o formulário de entrar');
  $('sync-email').value = 'pessoa@teste.com';
  $('sync-password').value = 'senha-errada';
  await w.fazSyncLogin();
  ok((w.__toasts || []).includes('E-mail ou senha incorretos.'), 'senha errada → "E-mail ou senha incorretos."');
  $('sync-password').value = 'senha123';
  await w.fazSyncLogin();
  ok($('sync-password').value === '', 'campo de senha limpo depois de entrar');
  const synced = await waitFor(() => !!L('tb__sync'));
  ok(synced, '1ª sincronização terminou');
  ok(confirms.length === 1 && /PRIMEIRA SINCRONIZAÇÃO/.test(confirms[0]) && /Neste aparelho: 51 tarefas, 5 listas, 6 tags/.test(confirms[0]) && /Na nuvem: 0 tarefas/.test(confirms[0]), 'pediu confirmação mostrando 51/5/6 aqui e 0 na nuvem');
  ok(server.alive('tarefas', UID).length === 51 && server.alive('listas', UID).length === 5 && server.alive('tags', UID).length === 6, 'nuvem recebeu 51 tarefas, 5 listas, 6 tags (aceitas pelas regras do banco)');
  ok(L('tb_backlog_db') === ORIG.t && L('tb_backlog_columns') === ORIG.l && L('tb_tags_db') === ORIG.g, 'localStorage do celular BYTE A BYTE igual ao backup');
  await waitFor(() => server.users.get('pessoa@teste.com').meta.faz_theme);
  ok(server.users.get('pessoa@teste.com').meta.faz_theme === '#10b981', 'cor do tema (#10b981) foi junto pra conta → PC abre verde');
  ok(!$('sync-logged-in').classList.contains('hidden') && $('sync-user-email').textContent === 'pessoa@teste.com', 'tela mostra "Conectado" com teu e-mail');
  ok(/^Última sincronização: hoje às \d{2}:\d{2}$/.test($('sync-last').textContent), 'mostra "' + $('sync-last').textContent + '"');
  ok(/^jhonatanfavero\.github\.io\/Faz-App\/kanban\.html$/.test($('sync-kanban-url').textContent), 'mostra o endereço do PC: ' + $('sync-kanban-url').textContent);
  ok($('sync-menu-status').textContent === 'Conectado como pessoa@teste.com', 'menu Config: "Conectado como pessoa@teste.com"');
  const exported = JSON.parse(w.eval('JSON.stringify(collectFazData())'));
  ok(!('tb__sync' in exported) && !Object.keys(exported).some((k) => k.startsWith('sb-')), 'backup (V40.6.0) continua sem estado interno nem sessão de login');

  console.log('\nC) Edição feita no PC chega no celular:');
  const tasks = JSON.parse(ORIG.t), cols = JSON.parse(ORIG.l);
  const colId = (name) => cols.find((c) => c.name === name).id;
  const t1 = tasks.find((t) => t.columnId === colId('DELTA')).id;
  const t2 = tasks.find((t) => t.columnId === colId('GAMA')).id;
  server.patch('tarefas', UID, t1, { title: 'Editada no PC ✏️' });
  server.patch('tarefas', UID, t2, { column_id: colId('OMEGA'), position: 9e9 });
  server.insert('tarefas', UID, { id: 'bl_1999999999999', column_id: colId('BETA'), title: 'Criada no PC', duration: 45, tag_id: null, microblocks: [{ title: 'passo 1', done: false }], position: 9e9 }); // EMPATE proposital com t2 (pior caso)
  server.patch('listas', UID, colId('BETA'), { name: 'BETA NOVA' });
  const before = L('tb__sync');
  w.fazSyncNow();
  await waitFor(() => L('tb__sync') !== before);
  const bdb = JSON.parse(L('tb_backlog_db'));
  ok(bdb.find((t) => t.id === t1).title === 'Editada no PC ✏️', 'título editado no PC chegou (e foi salvo no localStorage)');
  ok(bdb.find((t) => t.id === t2).columnId === colId('OMEGA'), 'tarefa movida no PC mudou de lista');
  ok(bdb.some((t) => t.id === 'bl_1999999999999' && t.duration === 45 && t.microblocks.length === 1), 'tarefa criada no PC apareceu com duração e checklist');
  ok(JSON.parse(L('tb_backlog_columns')).find((c) => c.id === colId('BETA')).name === 'BETA NOVA', 'lista renomeada no PC chegou');
  const wrapper = $('backlog-columns-wrapper');
  ok(wrapper && wrapper.textContent.includes('Editada no PC') && wrapper.textContent.includes('Criada no PC'), 'tela Lista do celular já redesenhada com as novidades');
  ok((w.__toasts || []).includes('Sincronizado ✅'), 'toast "Sincronizado ✅" no sincronizar manual');
  ok(server.get('tarefas', UID, t2).position !== server.get('tarefas', UID, 'bl_1999999999999').position, 'empate de posição criado no PC foi desfeito na MESMA rodada');

  console.log('\nD) Mudança feita no celular sobe sozinha (2,5s depois de salvar):');
  w.eval("backlogDb.push({ id: 'bl_2000000000001', title: 'Do celular', duration: 15, tagId: null, microblocks: [], columnId: 'col_geral' }); saveBacklog();");
  w.deleteBacklogItem(t1);
  const up = await waitFor(() => server.get('tarefas', UID, 'bl_2000000000001') && server.get('tarefas', UID, t1).deleted === true, 7000);
  ok(up, 'tarefa nova subiu e a apagada virou tombstone na nuvem');
  const lastUpsert = server.log.filter((x) => x.op === 'upsert' && x.t === 'tarefas').pop();
  console.log('     [debug] upserts de tarefas desde C:', JSON.stringify(server.log.filter((x) => x.op === 'upsert' && x.t === 'tarefas').slice(1)));
  ok(lastUpsert && lastUpsert.n === 2, 'só 2 linhas enviadas (as outras 49 não foram reenviadas)');

  console.log('\nE) Não mexe na tela enquanto você está editando uma tarefa:');
  w.openBacklogForm(bdb.find((t) => t.id === t2).id);
  const formOpen = !$('backlog-form-view').classList.contains('hidden');
  server.patch('tarefas', UID, t2, { title: 'Mudou no PC com o form aberto' });
  w.fazSyncNow();
  await sleep(600);
  ok(formOpen && JSON.parse(L('tb_backlog_db')).find((t) => t.id === t2).title !== 'Mudou no PC com o form aberto', 'com o formulário aberto, a sincronização ESPERA');
  w.closeBacklogForm(true);
  const applied = await waitFor(() => JSON.parse(L('tb_backlog_db')).find((t) => t.id === t2).title === 'Mudou no PC com o form aberto', 8000);
  ok(applied, 'fechou o formulário → aplicou sozinha logo depois');

  console.log('\nF) Sem internet no meio: nada se perde, tenta de novo depois:');
  const base1 = L('tb__sync');
  server.failNext = 1;
  w.eval("backlogDb.find(t => t.id === 'bl_2000000000001').title = 'Editada offline'; saveBacklog();");
  await sleep(3200);
  ok(L('tb__sync') === base1, 'falha de rede não estragou o estado salvo');
  ok(/Não consegui sincronizar agora/.test($('sync-last').textContent), 'tela avisa: "' + $('sync-last').textContent + '"');
  w.fazSyncNow();
  const retried = await waitFor(() => server.get('tarefas', UID, 'bl_2000000000001').title === 'Editada offline');
  ok(retried, 'na próxima tentativa a edição subiu');

  console.log('\nG) Sair da conta:');
  await w.fazSyncLogout(true);
  ok(!$('sync-logged-out').classList.contains('hidden'), 'voltou pro formulário de entrar');
  const nLog = server.log.length;
  w.eval('saveBacklog();');
  await sleep(3000);
  ok(server.log.length === nLog, 'depois de sair, salvar não sincroniza mais');
  ok(JSON.parse(L('tb_backlog_db')).length === w.eval('backlogDb.length') && w.eval('backlogDb.length') > 0, 'dados continuam no aparelho');
  w.closeConfigSync();
  ok(!$('config-main-menu').classList.contains('hidden') && $('config-title').innerText === 'Configurações', 'voltar → menu de Configurações');

  ok(errors.length === 0, 'nenhum erro de JavaScript durante todo o teste' + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ').slice(0, 400) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  w.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
