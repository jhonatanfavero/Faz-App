// V40.41.0 — PC: Salvar backup (escolha dele: "Só salvar"; restaurar continua no celular).
// O arquivo tem que ser o mesmo do celular: o celular sincroniza tudo pra nuvem, o PC salva o backup e um celular
// novo abre com esse arquivo igualzinho (tarefas, listas, tags, agenda, rotinas, notas, finanças, metas, arquivados,
// períodos, cor e horário). Confere também: o sync.js no PC só empresta as regras (não sincroniza nada), o nome do
// arquivo, o resumo, sem internet e o backup que o próprio celular aceita (fazBackupLooksSafe).
// Uso: TZ='America/Sao_Paulo' node test_backup_pc.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const bootPhone = require('./boot_app');
const { makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '56565656-5656-5656-5656-565656565656', EMAIL = 'bk@t.com';
const J = (v) => JSON.stringify(v);
const LISTS = ['tb_backlog_db', 'tb_backlog_columns', 'tb_tags_db', 'tb_master_db', 'tb_routines_db', 'tb_notes_db', 'tb_financial_db', 'tb_goal_lists', 'tb_goals_db', 'tb_goal_days', 'tb_periods_db'];

(async () => {
  console.log('A) O celular sobe tudo pra nuvem:');
  const A = await bootPhone(REPO, backup.data), { w, server, $ } = A;
  const LS = A.L, ev = (x) => w.eval(x);
  server.addUser(EMAIL, 'senha123', UID);
  // metas (os dados de teste não têm): uma categoria, uma meta e um dia feito
  ev(`goalListsDb.push({ id: 'gl_teste', name: 'Saúde', isDefault: false, createdAt: 1 }); saveGoalLists();
      goalsDb.push({ id: 'meta_1', listId: 'gl_teste', title: 'Beber água', emoji: '💧', period: 'dia', unit: 'vezes', target: 8, step: 1, createdAt: 2 }); saveGoals();
      goalDaysDb.push({ id: 'meta_1_20261115', goalId: 'meta_1', date: '2026-11-15', amount: 3, target: 8 }); saveGoalDays();`);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!LS('tb__sync'), 20000);
  await waitFor(() => server.users.get(EMAIL).meta.faz_periods_at, 9000);
  // um cartão arquivado no celular (vai pros arquivados do backup, não pra Lista)
  const arch = ev('backlogDb[0].id');
  w.fazArchiveTask(arch);
  const syncDone = async () => { const st = LS('tb__sync'); w.fazSyncNow(); await waitFor(() => LS('tb__sync') !== st, 20000); await sleep(80); };
  await syncDone();
  const archived = [...server.tables.tarefas.values()].some((r) => r.id === arch && r.archived);
  ok(archived, 'um cartão arquivado no celular (' + arch + ') está arquivado na nuvem');
  const phone = {}; LISTS.concat(['tb_archive_db']).forEach((k) => { phone[k] = JSON.parse(LS(k) || '[]'); });
  ok(phone.tb_backlog_db.length > 5 && phone.tb_master_db.length > 5 && phone.tb_routines_db.length > 0 && phone.tb_notes_db.length > 0 && phone.tb_financial_db.length > 0, 'o celular tem ' + phone.tb_backlog_db.length + ' tarefas, ' + phone.tb_master_db.length + ' blocos, ' + phone.tb_routines_db.length + ' rotinas, ' + phone.tb_notes_db.length + ' notas, ' + phone.tb_financial_db.length + ' despesas');

  console.log('\nB) PC: Configurações → Salvar backup:');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  ok(/<script>window\.FAZ_SYNC_CORE_ONLY = true;<\/script>\s*<script src="sync\.js"><\/script>/.test(html), 'a página do PC carrega o sync.js só com as regras (FAZ_SYNC_CORE_ONLY antes dele)');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<script>window.FAZ_SYNC_CORE_ONLY = true;</script>', '')
    .replace('<head>', '<head><script>window.tailwind = {}; window.FAZ_SYNC_CORE_ONLY = true;</script>' + inline);
  server.storedSession = { access_token: 'tok', user: { id: UID, email: EMAIL, user_metadata: JSON.parse(J(server.users.get(EMAIL).meta)) } };
  const blobs = [], clicks = [];
  const nCli = server.createClientCalls;
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, base = new RD(2026, 10, 23, 18, 30, 0).getTime(), t0 = RD.now(), now = () => base + (RD.now() - t0);
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      pw.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:faz/' + blobs.length; };
      pw.URL.revokeObjectURL = () => {};
      pw.HTMLAnchorElement.prototype.click = function () { clicks.push({ href: this.href, download: this.download, inPage: this.isConnected }); };
    },
  });
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  const click = (el) => el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true }));
  const readBlob = (b) => new Promise((res, rej) => { const fr = new pw.FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsText(b); });
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  ok(typeof pw.FazSyncCore === 'object' && typeof pw.FazSyncCore.materialize === 'function', 'as regras do sync.js estão no PC (FazSyncCore)');
  ok(server.createClientCalls === nCli + 1 && typeof pw.fazSyncNow === 'undefined' && typeof pw.fazSyncNotify === 'undefined', 'e a sincronização do celular não roda no PC (um cliente só, o do PC; sem fazSyncNow)');
  click(Q('btn-cfg')); await sleep(40);
  ok(!!Q('cfg-backup') && /Salvar backup/.test(Q('cfg-backup').textContent) && /restaurar lá, em Configurações → Backup e Restauração/.test(Q('modal-cfg').textContent), 'botão "Salvar backup" com a explicação (restaurar é no celular)');
  const nLog = server.log.length;
  click(Q('cfg-backup'));
  await waitFor(() => clicks.length === 1 && blobs.length === 1, 6000); await sleep(40);
  ok(clicks.length === 1 && clicks[0].download === 'faz-backup-2026-11-23-1830.json' && clicks[0].href === 'blob:faz/1' && clicks[0].inPage, 'baixou "' + (clicks[0] || {}).download + '"');
  ok(!server.log.slice(nLog).some((x) => x.op !== 'select' && x.op !== 'getUser'), 'salvar o backup só lê da nuvem (não grava nada)');
  const file = JSON.parse(await readBlob(blobs[0]));
  ok(file.signature === 'faz-timeblock-backup' && file.app === 'Faz / TimeBlock' && file.version === Q('pc-version').textContent.trim() && /^2026-11-23T/.test(file.exportedAt), 'cabeçalho igual ao do celular: assinatura, app, versão (' + file.version + ') e a hora');
  const d = file.data, P = (k) => JSON.parse(d[k] || 'null');
  ok(LISTS.concat(['tb_archive_db', 'tb_theme_color', 'tb_start_hour', 'tb_end_hour']).every((k) => typeof d[k] === 'string'), 'as chaves do celular, como texto (' + Object.keys(d).length + ')');
  const ids = (l) => (l || []).map((x) => String(x.id)).sort().join(',');
  for (const k of LISTS) {
    const ph = phone[k], pc = P(k);
    ok(Array.isArray(pc) && ids(pc) === ids(ph) && pc.length === ph.length, k + ': os mesmos ' + ph.length + ' itens do celular');
  }
  const byId = (l) => Object.fromEntries((l || []).map((x) => [x.id, x]));
  const t0 = phone.tb_backlog_db.find((x) => (x.microblocks || []).length && x.tagId), tb = byId(P('tb_backlog_db'))[t0.id];
  ok(tb && tb.title === t0.title && tb.tagId === t0.tagId && J(tb.microblocks) === J(t0.microblocks) && (tb.columnId || 'col_geral') === (t0.columnId || 'col_geral'), 'tarefa "' + t0.title + '": nome, tag, lista e checklist iguais');
  const b0 = phone.tb_master_db.find((x) => (x.microblocks || []).length), bb = byId(P('tb_master_db'))[b0.id];
  ok(bb && bb.date === b0.date && bb.startMin === b0.startMin && bb.duration === b0.duration && bb.title === b0.title && !!bb.completed === !!b0.completed && J(bb.microblocks) === J(b0.microblocks) && bb.expanded === false, 'bloco "' + b0.title + '": dia, horário, duração, concluído e checklist iguais');
  const f0 = phone.tb_financial_db[0], fb = byId(P('tb_financial_db'))[f0.id];
  ok(fb && fb.amount === f0.amount && fb.startMonth === (f0.startMonth || f0.month) && J(fb.paidMonths || []) === J(f0.paidMonths || []), 'despesa "' + f0.title + '": valor, mês e pagos iguais');
  const n0 = phone.tb_notes_db[0], nb = byId(P('tb_notes_db'))[n0.id];
  ok(nb && nb.title === n0.title && nb.content === n0.content, 'nota "' + n0.title + '": título e texto iguais');
  ok(J(P('tb_backlog_columns').map((c) => c.id)) === J(phone.tb_backlog_columns.map((c) => c.id)) && J(P('tb_tags_db').map((c) => c.id)) === J(phone.tb_tags_db.map((c) => c.id)), 'listas e tags na mesma ordem do celular');
  ok(J(P('tb_periods_db')) === J(phone.tb_periods_db), 'os períodos (V40.41.0) também');
  const g0 = byId(P('tb_goals_db')).meta_1, gd = byId(P('tb_goal_days')).meta_1_20261115;
  ok(P('tb_goal_lists').some((c) => c.id === 'gl_teste' && c.name === 'Saúde') && g0 && g0.title === 'Beber água' && g0.listId === 'gl_teste' && g0.target === 8 && gd && gd.amount === 3 && gd.goalId === 'meta_1', 'metas: a categoria, a meta e o dia feito');
  const ar = P('tb_archive_db');
  ok(ar.length === 1 && ar[0].kind === 'tarefa' && ar[0].item.id === arch && !P('tb_backlog_db').some((x) => x.id === arch), 'o cartão arquivado vai pros arquivados (e não pra Lista)');
  ok(d.tb_theme_color === LS('tb_theme_color') && d.tb_start_hour === LS('tb_start_hour') && d.tb_end_hour === LS('tb_end_hour'), 'cor do app e horário do dia: ' + d.tb_theme_color + ', ' + d.tb_start_hour + 'h às ' + d.tb_end_hour + 'h');
  const s = file.summary;
  ok(s.tarefas === phone.tb_backlog_db.length && s.blocos === phone.tb_master_db.length && s.rotinas === phone.tb_routines_db.length && s.notas === phone.tb_notes_db.length && s.despesas === phone.tb_financial_db.length && s.tags === phone.tb_tags_db.length && s.metas === phone.tb_goals_db.length, 'o resumo conta igual ao do celular');
  ok(Q('cfg-backup-msg').textContent === 'Salvo: faz-backup-2026-11-23-1830.json · ' + s.tarefas + ' tarefas, ' + s.blocos + ' blocos, ' + s.rotinas + ' rotinas, ' + s.notas + ' notas, ' + s.despesas + ' despesas, 1 meta.' && /Backup salvo/.test(Q('toast').textContent), 'aviso: "' + Q('cfg-backup-msg').textContent + '"');
  ok(ev('fazBackupLooksSafe(' + J(d) + ')') === true, 'o celular aceita o arquivo (a conferência do Restaurar passa)');

  console.log('\nC) Um celular novo abre com esse arquivo igualzinho:');
  {
    const N = await bootPhone(REPO, d);
    const ne = (x) => N.w.eval(x);
    ok(ne('backlogDb.length') === phone.tb_backlog_db.length && ne('db.length') === phone.tb_master_db.length && ne('routinesDb.length') === phone.tb_routines_db.length && ne('notesDb.length') === phone.tb_notes_db.length && ne('financialDb.length') === phone.tb_financial_db.length, 'tarefas, blocos, rotinas, notas e despesas: as mesmas quantidades');
    ok(ne('archiveDb.length') === 1 && ne('themeColor') === LS('tb_theme_color') && ne('START_HOUR') === Number(LS('tb_start_hour')), 'o arquivado, a cor e o horário também');
    ok(N.errors.length === 0, 'o celular abre sem erro' + (N.errors.length ? ': ' + N.errors[0].slice(0, 160) : ''));
    N.w.close();
  }

  console.log('\nD) Sem internet: avisa e não baixa nada:');
  server.failNext = 1;
  click(Q('cfg-backup'));
  await waitFor(() => /internet|Não foi possível/.test(Q('toast').textContent), 4000); await sleep(40);
  ok(clicks.length === 1 && /internet|Não foi possível/.test(Q('toast').textContent) && Q('cfg-backup-msg').textContent === '' && !Q('cfg-backup').disabled, 'aviso: "' + Q('toast').textContent + '" (o botão volta a funcionar)');
  click(Q('cfg-backup'));
  await waitFor(() => clicks.length === 2, 6000);
  ok(clicks.length === 2, 'tentou de novo com internet: baixou');

  ok(errors.length === 0, 'nenhum erro na tela do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));
  ok(A.errors.length === 0, 'nenhum erro no celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
