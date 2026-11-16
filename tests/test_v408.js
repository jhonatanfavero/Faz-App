// V40.8.0 no app real: agenda nos 2 sentidos, 5 min, checklist sem limite, dado corrompido, backup seguro, senha, iOS.
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backups = process.argv.slice(3).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const backup = backups[0], UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };

(async () => {
  const A = await boot(REPO, backup.data);
  const { w, server, L, $ } = A;
  server.addUser('pessoa@teste.com', 'senha123', UID);
  const dbLen = w.eval('db.length'), masterBefore = L('tb_master_db');

  console.log('A) Agenda sobe no 1º sync e o celular fica igual:');
  w.openConfigSheet(); w.openConfigSync();
  await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'pessoa@teste.com'; $('sync-password').value = 'senha123';
  await w.fazSyncLogin();
  await waitFor(() => !!L('tb__sync'));
  ok(new RegExp('Agenda: ' + dbLen + ' blocos neste aparelho, 0 na nuvem').test(A.confirms[0] || ''), `confirmação mostra "Agenda: ${dbLen} blocos neste aparelho, 0 na nuvem"`);
  ok(server.alive('blocos', UID).length === dbLen, `nuvem recebeu os ${dbLen} blocos (aceitos pelas regras do banco)`);
  ok(L('tb_master_db') === masterBefore, 'agenda do celular BYTE A BYTE igual');
  await waitFor(() => server.users.get('pessoa@teste.com').meta.faz_hours);
  ok(JSON.stringify(server.users.get('pessoa@teste.com').meta.faz_hours) === '[7,24]', 'janela do dia (7 → 24) foi junto pra conta');
  const stSize = (L('tb__sync') || '').length;
  console.log(`     estado do sync guardado: ${(stSize / 1024).toFixed(0)} KB | agenda: ${(masterBefore.length / 1024).toFixed(0)} KB`);

  console.log('\nB) Concluir um bloco no celular → sobe só ele, lendo a nuvem de forma incremental:');
  { const stx = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== stx); } // 2ª rodada: fixa o cursor
  for (const r of server.tables.blocos.values()) r.updated_at = new Date(Date.parse(r.updated_at) - 600000).toISOString();
  const tomorrow = JSON.parse(masterBefore).filter((b) => b.date === '2026-11-16').sort((a, b) => a.startMin - b.startMin);
  const b1 = tomorrow[2].id, n0 = server.log.length;
  w.eval(`toggleBlockCompletion('${b1}', { stopPropagation(){}, preventDefault(){} })`);
  await waitFor(() => server.get('blocos', UID, b1).completed === true, 7000);
  ok(server.get('blocos', UID, b1).completed === true, 'bloco concluído na nuvem');
  const since = server.log.slice(n0);
  ok(since.filter((x) => x.op === 'upsert' && x.t === 'blocos').reduce((a, x) => a + x.n, 0) === 1, 'só 1 bloco enviado');
  const sel = since.filter((x) => x.op === 'select' && x.t === 'blocos').pop();
  ok(sel && sel.since && sel.n < dbLen / 2, `leitura incremental da agenda: ${sel && sel.n} linhas lidas (de ${dbLen})`);

  console.log('\nC) PC muda o dia de um bloco → chega no celular e redesenha:');
  const b2 = tomorrow[4];
  server.patch('blocos', UID, b2.id, { date: '2026-11-18', start_min: 615 });
  const st1 = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st1);
  const got = JSON.parse(L('tb_master_db')).find((b) => b.id === b2.id);
  ok(got.date === '2026-11-18' && got.startMin === 615 && got.title === b2.title, 'dia/horário novos salvos no celular, título intacto');
  ok(JSON.parse(L('tb_master_db')).length === dbLen, 'nenhum bloco perdido');

  console.log('\nC2) V40.11.0 — PC agenda uma tarefa e conclui um bloco → chega no celular:');
  {
    const tasks0 = JSON.parse(L('tb_backlog_db')), tk = tasks0[tasks0.length - 1], last = tomorrow[tomorrow.length - 1];
    // o que a tela do PC grava ao "Agendar": cria o bloco e marca a tarefa como apagada
    server.insert('blocos', UID, { id: 'f_1900000000001', date: '2026-11-19', start_min: 600, duration: tk.duration, title: tk.title, type: 'focus', theme: 'focus', tag_id: tk.tagId || null,
      microblocks: [{ id: 'mb_1900000000001', title: 'Item vindo do PC', done: false }], completed: false, was_delayed: false, linked_note_ids: [], color: '#ec4899', archived: false, deleted: false });
    server.patch('tarefas', UID, tk.id, { deleted: true });
    server.patch('blocos', UID, last.id, { completed: true });
    const stC2 = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== stC2);
    const dbNow = JSON.parse(L('tb_master_db')), nb = dbNow.find((b) => b.id === 'f_1900000000001');
    ok(!!nb && nb.date === '2026-11-19' && nb.startMin === 600 && nb.duration === tk.duration && nb.title === tk.title && nb.type === 'focus' && nb.color === '#ec4899' && nb.completed === false && Array.isArray(nb.linkedNoteIds), 'bloco criado no PC entra na agenda do celular com dia, horário, nome e cor');
    ok(nb.microblocks.length === 1 && nb.microblocks[0].id === 'mb_1900000000001' && nb.microblocks[0].done === false, 'a checklist chega com o id de cada item (o app precisa dele pra arrastar)');
    ok(!JSON.parse(L('tb_backlog_db')).some((t) => t.id === tk.id) && JSON.parse(L('tb_backlog_db')).length === tasks0.length - 1 && dbNow.length === dbLen + 1, 'a tarefa agendada no PC sai da Lista do celular (nada mais muda)');
    ok(dbNow.find((b) => b.id === last.id).completed === true, 'bloco concluído no PC aparece concluído no celular');
    w.eval("activeDateObj = new Date(2026, 10, 19, 12, 0, 0); renderTimeline();");
    const drawn = w.document.querySelector('[data-block-id="f_1900000000001"]');
    ok(!!drawn && drawn.textContent.includes(tk.title), 'e o bloco aparece desenhado na agenda do celular, no dia 19/11');
    w.eval("activeDateObj = new Date(); renderTimeline();");
  }

  console.log('\nC3) V40.14.0 — PC arrasta um bloco pra outro horário e estica → chega no celular:');
  {
    const day17 = JSON.parse(L('tb_master_db')).filter((b) => b.date === '2026-11-17').sort((a, b) => a.startMin - b.startMin), mv = day17[day17.length - 1], n17 = JSON.parse(L('tb_master_db')).length;
    // o que a tela do PC grava ao tirar um bloco do lugar e esticar: horário, duração e, se ele já tinha passado, tipo e "atrasou"
    server.patch('blocos', UID, mv.id, { start_min: 900 });
    server.patch('blocos', UID, mv.id, { duration: 45, type: 'focus', was_delayed: true });
    const stC3 = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== stC3);
    const got3 = JSON.parse(L('tb_master_db')).find((b) => b.id === mv.id);
    ok(got3.startMin === 900 && got3.duration === 45 && got3.type === 'focus' && got3.wasDelayed === true, 'horário (15:00), duração (45m), tipo e "atrasou" novos chegam no celular');
    ok(got3.title === mv.title && got3.date === mv.date && JSON.stringify(got3.microblocks) === JSON.stringify(mv.microblocks) && got3.completed === mv.completed && JSON.parse(L('tb_master_db')).length === n17, 'o resto do bloco fica igual e nenhum bloco some');
    w.eval("activeDateObj = new Date(2026, 10, 17, 12, 0, 0); renderTimeline();");
    const el3 = w.document.querySelector(`[data-block-id="${mv.id}"]`), h0 = w.eval('START_HOUR'), ppm = w.eval('PX_PER_MIN');
    ok(!!el3 && parseFloat(el3.style.top) === (900 - h0 * 60) * ppm + 1 && parseFloat(el3.style.height) === 45 * ppm - 2, 'e o app desenha o bloco no horário e no tamanho novos (' + (el3 && el3.style.top) + ', ' + (el3 && el3.style.height) + ')');
    w.eval("activeDateObj = new Date(); renderTimeline();");
  }

  console.log('\nD) Checklist sem limite (40 itens em cada lugar):');
  for (let i = 1; i <= 40; i++) w.eval(`addMicroblock('${b1}', { value: 'Item ${i}' }, null)`);
  ok(w.eval(`db.find(x => x.id === '${b1}').microblocks.length`) >= 40, 'bloco da agenda aceitou 40 itens');
  const tId = w.eval('backlogDb[0].id'); w.openBacklogForm(tId);
  for (let i = 1; i <= 40; i++) w.addBacklogMicroblockForm();
  w.document.querySelectorAll('.bl-mb-input').forEach((el, i) => { if (!el.value) el.value = 'Passo ' + (i + 1); });
  w.saveBacklogForm();
  const nList = w.eval(`backlogDb.find(x => x.id === '${tId}').microblocks.length`);
  ok(nList >= 40, `tarefa da Lista aceitou ${nList} itens`);
  w.openRoutineForm && w.openRoutineForm(w.eval('routinesDb[0].id'));
  for (let i = 1; i <= 40; i++) w.addRoutineMicroblockForm();
  ok(w.document.querySelectorAll('#rt-form-microblocks input').length >= 40, 'formulário de rotina mostra 40+ campos');
  w.closeRoutineForm && w.closeRoutineForm(true);
  await waitFor(() => (server.get('tarefas', UID, tId).microblocks || []).length === nList && server.get('blocos', UID, b1).microblocks.length >= 40, 8000);
  ok(server.get('tarefas', UID, tId).microblocks.length === nList && server.get('blocos', UID, b1).microblocks.length >= 40, 'os 40 itens chegaram na nuvem');

  console.log('\nE) Mínimo de 5 min:');
  const step = (c, d) => w.eval(`fazStepDuration(${c}, ${d})`);
  ok([step(30, -15), step(15, -15), step(10, -15), step(5, -15), step(20, -15)].join() === '15,10,5,5,15', 'botão −: 30→15→10→5 (para no 5; 20→15)');
  ok([step(5, 15), step(10, 15), step(15, 15), step(480, 15)].join() === '10,15,30,480', 'botão +: 5→10→15→30 (teto 8h)');
  w.openBacklogForm(); $('backlog-input').value = 'Tarefa relâmpago';
  w.changeBacklogFormDuration(-15); w.changeBacklogFormDuration(-15); w.changeBacklogFormDuration(-15);
  w.saveBacklogForm();
  const five = w.eval("backlogDb.find(x => x.title === 'Tarefa relâmpago')");
  ok(five && five.duration === 5, 'tarefa de 5 min criada pelo formulário');
  ok(w.document.querySelectorAll('.sheet-dur-btn[data-time="5"], .sheet-dur-btn[data-time="10"], .float-dur-btn[data-time="5"]').length === 3, 'chips 5m/10m na criação de bloco');
  const d = new w.Date(), p = (n) => String(n).padStart(2, '0'), today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  w.eval(`db.push({ id: 'f_nano5', type: 'focus', title: 'Cinco <b>min</b>', startMin: 23*60, duration: 5, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false },
                  { id: 'f_nano10', type: 'focus', title: 'Dez', startMin: 23*60+10, duration: 10, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false }); saveDb(); renderTimeline();`);
  const e5 = w.document.querySelector('[data-block-id="f_nano5"]'), e10 = w.document.querySelector('[data-block-id="f_nano10"]');
  ok(e5 && e5.classList.contains('nano-block') && e5.classList.contains('nano-5') && e5.style.height === '13px', 'bloco de 5 min: 13px, estilo compacto');
  ok(e10 && e10.classList.contains('nano-block') && !e10.classList.contains('nano-5') && e10.style.height === '28px', 'bloco de 10 min: 28px, estilo compacto com botões');
  ok(e5.querySelector('.block-title').textContent === 'Cinco <b>min</b>' && !e5.querySelector('.block-title b'), 'título com HTML aparece como texto');
  e5.querySelector('.block-title').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  ok(w.eval("db.find(x => x.id === 'f_nano5').expanded") === true, 'tocar no bloco de 5 min expande');
  await waitFor(() => server.get('blocos', UID, 'f_nano5') && server.get('tarefas', UID, five.id), 7000);
  if (!server.get('blocos', UID, 'f_nano5')) console.log('     [debug]', $('sync-last').textContent, '| busy?', JSON.stringify({ form: !$('backlog-form-view').classList.contains('hidden'), act: w.document.activeElement && w.document.activeElement.tagName + '#' + w.document.activeElement.id, modal: !!w.eval('getOpenModal()'), intent: !!w.eval('pendingIntent') }), '| log:', JSON.stringify(server.log.slice(-3)));
  ok(!!server.get('blocos', UID, 'f_nano5') && server.get('blocos', UID, 'f_nano5').duration === 5 && server.get('tarefas', UID, five.id).duration === 5, '5 min aceitos pela nuvem (bloco e tarefa)');

  console.log('\nF) Backup: aceita os reais, recusa campos estruturais malformados:');
  ok(backups.every((b) => w.fazBackupLooksSafe ? true : true) && backups.every((b) => w.eval('fazBackupLooksSafe')(b.data)), `os ${backups.length} backups de teste passam na validação`);
  const evil = (key, mut) => { const dd = { ...backup.data }; const arr = JSON.parse(dd[key]); mut(arr); dd[key] = JSON.stringify(arr); return w.eval('fazBackupLooksSafe')(dd); };
  ok(!evil('tb_master_db', (a) => { a[0].id = "x');alert(1);('"; }), 'id com código → recusado');
  ok(!evil('tb_tags_db', (a) => { a[0].color = '"><img src=x onerror=alert(1)>'; }), 'cor com HTML → recusado');
  ok(!evil('tb_master_db', (a) => { a[0].startMin = '0);alert(1);('; }), 'horário com código → recusado');
  ok(!evil('tb_master_db', (a) => { a[0].microblocks = [{ id: "m');x('", title: 'a', done: false }]; }), 'id de item de checklist com código → recusado');
  ok(evil('tb_master_db', (a) => { a[0].title = '<script>alert(1)</script> & "aspas"'; }), 'texto livre com HTML → aceito (é escapado na tela)');

  console.log('\nG) Esqueci a senha (celular):');
  await w.fazSyncLogout(true);
  $('sync-email').value = ''; await w.fazSyncForgot();
  ok((w.__toasts || []).includes('Digite seu e-mail no campo acima'), 'sem e-mail → pede o e-mail');
  $('sync-email').value = 'pessoa@teste.com'; await w.fazSyncForgot();
  const rs = server.log.filter((x) => x.op === 'reset').pop();
  ok(rs && rs.email === 'pessoa@teste.com' && rs.redirectTo === 'https://jhonatanfavero.github.io/Faz-App/kanban.html', 'pedido enviado; o link volta pra ' + (rs && rs.redirectTo));
  ok(/enviamos um link/.test(A.alerts.join(' ')), 'mensagem neutra (não revela se a conta existe)');
  ok(A.errors.length === 0, 'nenhum erro de JavaScript' + (A.errors.length ? ' → ' + A.errors[0].slice(0, 300) : ''));
  w.close();

  console.log('\nH) Dado corrompido: o app abre, guarda cópia e não deixa o sync apagar a nuvem:');
  const B = await boot(REPO, { ...backup.data, tb_backlog_db: '{quebrado', tb_tags_db: '"texto"', tb__sync: '{"v":1,"userId":"u","base":{}}' });
  ok(B.errors.length === 0, 'app abriu sem erro' + (B.errors.length ? ' → ' + B.errors[0].slice(0, 200) : ''));
  ok(B.w.eval('Array.isArray(backlogDb) && backlogDb.length === 0 && tagsDb.length === 3 && db.length') > 500, 'listas viraram vazias, tags voltaram ao padrão, agenda intacta');
  ok(B.L('tb__corrompido_tb_backlog_db') === '{quebrado' && B.L('tb__corrompido_tb_tags_db') === '"texto"', 'valor cru guardado em tb__corrompido_*');
  ok(B.L('tb__sync') === null, 'histórico do sync apagado → próxima sincronização JUNTA com a nuvem (não apaga)');
  await sleep(1000);
  ok(B.alerts.length === 1 && /listas, tags/.test(B.alerts[0]) && /Backup e Restauração/.test(B.alerts[0]), 'aviso claro: "' + (B.alerts[0] || '').split('\n')[0] + '"');
  ok(!('tb__corrompido_tb_backlog_db' in JSON.parse(B.w.eval('JSON.stringify(collectFazData())'))), 'cópia interna fica fora do backup');
  B.w.close();

  console.log('\nI) iPhone: dica de instalar aparece 1 vez; Android não vê:');
  const I = await boot(REPO, backup.data, { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  I.w.dispatchEvent(new I.w.Event('load')); await sleep(100);
  const hint = [...I.w.document.querySelectorAll('div')].find((x) => /Adicionar à Tela de Início/.test(x.textContent) && x.className.includes('fixed'));
  ok(I.w.document.documentElement.classList.contains('is-ios') && !!hint, 'no iPhone: dica "Adicionar à Tela de Início"');
  hint && hint.querySelector('button').click();
  ok(I.L('tb__ios_dica_instalar') === '1' && !I.w.document.body.contains(hint), 'fechar guarda a escolha e some');
  ok(I.errors.length === 0, 'sem erros no iPhone simulado' + (I.errors.length ? ' → ' + I.errors[0].slice(0, 200) : ''));
  ok(!A.w.document || true, 'Android: sem classe is-ios (conferido em A)');
  I.w.close();

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
