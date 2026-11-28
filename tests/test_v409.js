// V40.9.0 no app real: cor livre do cartão e arquivar/desarquivar (com sync).
const fs = require('fs'), boot = require('./boot_app'), { makeServer } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };
const ev = { stopPropagation() {}, preventDefault() {} };

(async () => {
  const A = await boot(REPO, backup.data), { w, server, L, $ } = A;
  server.addUser('j@t.com', 'senha123', UID);
  const d = new w.Date(), p2 = (n) => String(n).padStart(2, '0'), today = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  w.__ev = ev;
  w.eval(`db.push({ id: 'f_c1', type: 'focus', title: 'Bloco A', startMin: 20*60, duration: 30, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false },
                  { id: 'f_c2', type: 'focus', title: 'Bloco B', startMin: 21*60, duration: 30, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false }); saveDb(); renderTimeline();`);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); };

  console.log('A) Cor livre na Lista:');
  const tId = w.eval('backlogDb[0].id'), tTag = w.eval('backlogDb[0].tagId');
  w.openBacklogForm(tId);
  // V40.51.0 (Ficha): a linha "Cor do cartão" abre a folha de baixo com as cores
  ok($('bl-form-color-val').textContent === 'Nenhuma', 'a linha "Cor do cartão" começa em "Nenhuma"');
  w.blPickColor();
  const cores = $('fx-pick-list');
  ok(!$('fx-pick-modal').classList.contains('hidden') && cores.querySelectorAll('[data-fx-k]').length === 13 && !!cores.querySelector('input[type=color]'), 'a folha mostra "Nenhuma", 12 cores e o seletor de outra cor');
  cores.querySelector('[data-fx-k="#ec4899"]').click();
  ok($('fx-pick-modal').classList.contains('hidden') && $('bl-form-color-val').textContent === 'Pink', 'tocar no rosa escolhe e fecha (a linha mostra "Pink")');
  w.fazPickBlColor('#EC4899'); w.saveBacklogForm();
  ok(w.eval(`backlogDb.find(x => x.id === '${tId}').color`) === '#ec4899' && w.eval(`backlogDb.find(x => x.id === '${tId}').tagId`) === tTag, 'cor salva na tarefa; a tag não mudou');
  const card = w.document.querySelector(`[data-bl-card="${tId}"]`);
  ok(card.classList.contains('card-painted') && card.classList.contains('card-dark') && card.style.backgroundColor === 'rgb(236, 72, 153)', 'cartão inteiro pintado de rosa, com texto claro');
  w.openBacklogForm(tId); w.fazPickBlColor('#fde047'); w.saveBacklogForm();
  const card2 = w.document.querySelector(`[data-bl-card="${tId}"]`);
  ok(card2.classList.contains('card-light') && !card2.classList.contains('card-dark'), 'cor clara (amarelo) mantém o texto escuro');
  w.openBacklogForm(tId); w.fazPickBlColor(null); w.saveBacklogForm();
  ok(!('color' in JSON.parse(L('tb_backlog_db')).find((x) => x.id === tId)) && !w.document.querySelector(`[data-bl-card="${tId}"]`).classList.contains('card-painted'), '"Sem cor" remove a cor');
  w.openBacklogForm(); $('backlog-input').value = 'Nova rosa'; w.fazPickBlColor('#ec4899'); w.saveBacklogForm();
  const newT = w.eval("backlogDb.find(x => x.title === 'Nova rosa')");
  ok(newT && newT.color === '#ec4899', 'tarefa nova já nasce com a cor escolhida');

  console.log('\nB) Cor livre na agenda:');
  w.eval("openEditModal('f_c1', __ev)");
  ok($('edit-color-picker').querySelectorAll('button').length === 13, 'editar bloco mostra as cores');
  w.fazPickEditColor('#3b82f6'); w.saveEditTask();
  const el = w.document.querySelector('[data-block-id="f_c1"]');
  ok(w.eval("db.find(x => x.id === 'f_c1').color") === '#3b82f6' && el.style.backgroundColor === 'rgb(59, 130, 246)' && !el.classList.contains('bg-app-focus'), 'bloco pintado de azul (no lugar da cor do tema)');
  w.eval("toggleBlockCompletion('f_c1', __ev)");
  const elDone = w.document.querySelector('[data-block-id="f_c1"]');
  ok(elDone.classList.contains('bg-emerald-500') && !elDone.style.backgroundColor, 'concluído continua verde');
  w.eval("toggleBlockCompletion('f_c1', __ev)");
  w.eval(`scheduleBacklogItem('${newT.id}')`);
  ok(w.eval('pendingIntent && pendingIntent.color') === '#ec4899', 'agendar tarefa da Lista leva a cor junto');
  w.eval('typeof cancelIntent === "function" ? cancelIntent() : (pendingIntent = null)');
  await syncDone();
  ok(server.get('blocos', UID, 'f_c1').color === '#3b82f6' && server.get('tarefas', UID, newT.id).color === '#ec4899', 'cores na nuvem (bloco e tarefa)');

  console.log('\nC) Arquivar e desarquivar:');
  const n0 = w.eval('backlogDb.length');
  w.openBacklogForm(tId);
  ok(!$('bl-form-more-btn').classList.contains('hidden'), 'formulário de edição tem o ⋯ (V40.51.0: Arquivar e Apagar foram pra ele)');
  w.blFormMore();
  ok([...$('fx-pick-list').querySelectorAll('[data-fx-k]')].map((b) => b.textContent.trim()).join() === 'Arquivar,Apagar', 'o ⋯ mostra Arquivar e Apagar');
  $('fx-pick-list').querySelector('[data-fx-k="arquivar"]').click();
  ok(w.eval('backlogDb.length') === n0 - 1 && w.eval('archiveDb.length') === 1 && $('backlog-form-view').classList.contains('hidden'), 'tarefa saiu da Lista e foi pro arquivo');
  ok(!w.document.querySelector(`[data-bl-card="${tId}"]`), 'cartão sumiu da tela');
  w.eval("db.find(x => x.id === 'f_c2').expanded = true; renderTimeline();");
  ok(/Arquivar/.test(w.document.querySelector('[data-block-id="f_c2"]').textContent), 'bloco expandido tem o botão Arquivar');
  w.eval("fazArchiveBlock('f_c2', __ev)");
  ok(!w.eval("db.some(x => x.id === 'f_c2')") && !w.document.querySelector('[data-block-id="f_c2"]') && w.eval('archiveDb.length') === 2, 'bloco saiu da agenda e foi pro arquivo');
  await syncDone();
  ok(server.get('tarefas', UID, tId).archived === true && !server.get('tarefas', UID, tId).deleted && server.get('blocos', UID, 'f_c2').archived === true, 'nuvem: arquivados, não apagados');
  w.closeConfigSync(); w.openConfigArchive();
  const rows = $('config-archive-list').querySelectorAll('button[onclick^="fazUnarchive"]');
  ok(!$('config-archive-view').classList.contains('hidden') && rows.length === 2 && /Agenda ·/.test($('config-archive-list').textContent) && /Lista ·/.test($('config-archive-list').textContent), 'Config → Arquivados lista os 2 cartões (um da Lista, um da agenda)');
  ok(JSON.parse(w.eval('JSON.stringify(collectFazData())')).tb_archive_db !== undefined, 'arquivados entram no backup');
  // horário original ocupado → vai pro próximo espaço livre
  w.eval(`db.push({ id: 'f_c3', type: 'focus', title: 'Ocupou o lugar', startMin: 21*60, duration: 30, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false }); saveDb();`);
  w.fazUnarchive('f_c2');
  ok(w.eval("db.find(x => x.id === 'f_c2').startMin") === 21 * 60 + 30, 'desarquivar bloco com o horário ocupado → entra no próximo espaço livre (21:30)');
  w.fazUnarchive(tId);
  ok(w.eval(`backlogDb.some(x => x.id === '${tId}')`) && w.eval('archiveDb.length') === 0 && /Nada arquivado/.test($('config-archive-list').textContent), 'desarquivar tarefa → volta pra Lista; arquivo vazio');
  await syncDone();
  ok(server.get('tarefas', UID, tId).archived === false && server.get('blocos', UID, 'f_c2').archived === false && server.get('blocos', UID, 'f_c2').start_min === 21 * 60 + 30, 'nuvem: desarquivados');

  console.log('\nD) Arquivar no PC chega no celular; apagar arquivado de vez:');
  const t2 = w.eval('backlogDb[2].id');
  server.patch('tarefas', UID, t2, { archived: true }); await syncDone();
  ok(!w.eval(`backlogDb.some(x => x.id === '${t2}')`) && w.eval(`archiveDb.some(a => a.kind === 'tarefa' && a.item.id === '${t2}')`), 'arquivada no PC → some da Lista e aparece em Arquivados no celular');
  server.patch('tarefas', UID, t2, { archived: false }); await syncDone();
  ok(w.eval(`backlogDb.some(x => x.id === '${t2}')`) && w.eval('archiveDb.length') === 0, 'desarquivada no PC → volta pra Lista');
  w.fazArchiveTask(t2); w.fazDeleteArchived(t2); await syncDone();
  ok(server.get('tarefas', UID, t2).deleted === true && w.eval('archiveDb.length') === 0, 'apagar de vez (com confirmação) → apagada na nuvem');
  ok(A.errors.length === 0, 'nenhum erro de JavaScript' + (A.errors.length ? ' → ' + A.errors[0].slice(0, 300) : ''));
  const stV8 = JSON.parse(L('tb__sync')); w.close();

  console.log('\nE) Quem vem da V40.8.0 com arquivado só na base do sync não perde o cartão:');
  const srv = makeServer(); srv.addUser('j@t.com', 'senha123', UID);
  for (const k of ['listas', 'tags', 'tarefas', 'blocos']) for (const id in stV8.base[k]) srv.tables[k].set(UID + '|' + id, { ...stV8.base[k][id], user_id: UID, updated_at: srv.stamp() });
  const t3 = Object.keys(stV8.base.tarefas).find((id) => !stV8.base.tarefas[id].deleted && !stV8.base.tarefas[id].archived);
  stV8.base.tarefas[t3].archived = true; srv.get('tarefas', UID, t3).archived = true; delete stV8.arch; // estado da V40.8.0: arquivado em outro aparelho
  srv.storedSession = { access_token: 't', user: { id: UID, email: 'j@t.com', user_metadata: {} } };
  const store = { ...backup.data, tb__sync: JSON.stringify(stV8), 'sb-zlwocojndrjnuvoowzzu-auth-token': '{}' };
  store.tb_backlog_db = JSON.stringify(Object.values(stV8.base.tarefas).filter((r) => !r.deleted && !r.archived).sort((a, b) => a.position - b.position).map((r) => ({ id: r.id, title: r.title, duration: r.duration, tagId: r.tag_id, microblocks: r.microblocks, columnId: r.column_id, ...(r.color ? { color: r.color } : {}) })));
  store.tb_master_db = JSON.stringify(Object.values(stV8.base.blocos).filter((r) => !r.deleted && !r.archived).map((r) => ({ id: r.id, type: r.type, title: r.title, startMin: r.start_min, duration: r.duration, date: r.date, microblocks: r.microblocks, completed: r.completed, theme: r.theme, tagId: r.tag_id, linkedNoteIds: r.linked_note_ids, ...(r.color ? { color: r.color } : {}), ...(r.was_delayed ? { wasDelayed: true } : {}) })));
  const B = await boot(REPO, store, { server: srv });
  await waitFor(() => { try { return JSON.parse(B.L('tb__sync')).arch === 1; } catch (e) { return false; } }, 12000);
  ok(JSON.parse(B.L('tb__sync') || '{}').arch === 1, 'sincronizou sozinho ao abrir');
  ok(B.w.eval(`archiveDb.some(a => a.kind === 'tarefa' && a.item.id === '${t3}')`), 'o arquivado apareceu em Arquivados no celular');
  ok(srv.get('tarefas', UID, t3).deleted === false && srv.get('tarefas', UID, t3).archived === true, 'e NÃO foi apagado na nuvem');
  ok(B.errors.length === 0, 'sem erros' + (B.errors.length ? ' → ' + B.errors[0].slice(0, 300) : ''));
  B.w.close();
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
