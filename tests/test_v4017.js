// V40.17.0 no app real: Rotinas, Notas e Finanças sincronizam nos dois sentidos (celular <-> nuvem).
// Uso: TZ='America/Sao_Paulo' node test_v4017.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };
const qtd = (k) => JSON.parse(backup.data[k] || '[]').length;

(async () => {
  const A = await boot(REPO, backup.data), { w, server, L, $ } = A;
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(50); };
  const n = (t) => server.alive(t, UID).length;

  console.log('A) Primeira sincronização do aparelho:');
  ok(n('rotinas') === qtd('tb_routines_db') && n('notas') === qtd('tb_notes_db') && n('financas') === qtd('tb_financial_db'),
    `rotinas, notas e finanças foram pra nuvem (${n('rotinas')}, ${n('notas')} e ${n('financas')})`);
  ok(A.confirms.length === 1 && /Rotinas, notas e finanças também vão juntas \(5, 3 e 23 neste aparelho\)/.test(A.confirms[0]), 'a pergunta da 1ª sincronização avisa que rotinas, notas e finanças vão junto');
  ok(L('tb_routines_db') === backup.data.tb_routines_db && L('tb_notes_db') === backup.data.tb_notes_db && L('tb_financial_db') === backup.data.tb_financial_db, 'no celular, as três ficaram BYTE A BYTE iguais');
  ok(/Rotinas, Notas e Finanças/.test($('sync-logged-out').textContent) || /Rotinas, Notas e Finanças/.test(w.document.body.innerHTML), 'a tela de sincronizar diz que rotinas, notas e finanças sincronizam');

  console.log('\nB) O PC mexe; o celular recebe e redesenha:');
  const FN = JSON.parse(backup.data.tb_financial_db), fin0 = FN[0];
  server.insert('notas', UID, { id: 'note_pc', title: 'Ideia do PC', content: 'abc', created_ms: Date.now() + 5000, updated_ms: null });
  server.insert('rotinas', UID, { id: 'rt_pc', title: 'Rotina do PC', emoji: '🧪', duration: 25, theme: 'rest', tag_id: null, microblocks: [{ title: 'passo 1' }], created_ms: Date.now() + 5000 });
  server.patch('financas', UID, fin0.id, { paid_months: [...server.get('financas', UID, fin0.id).paid_months, '2026-11'] });
  w.openListSheet(); w.switchListTab('notes');
  await syncDone();
  ok(w.eval('notesDb[0].id') === 'note_pc' && $('notes-container').textContent.includes('Ideia do PC'), 'nota do PC chegou, em cima, e já aparece na aba Notas');
  ok(w.eval("routinesDb.some((r) => r.id === 'rt_pc' && r.theme === 'rest' && r.emoji === '🧪' && r.microblocks.length === 1)"), 'rotina do PC chegou inteira');
  w.switchListTab('routines');
  ok($('routines-container').textContent.includes('Rotina do PC'), 'e aparece na aba Rotinas');
  ok(w.eval(`isPaidInMonth(financialDb.find((f) => f.id === '${fin0.id}'), '2026-11')`) === true, 'despesa marcada como paga em 11/2026 no PC aparece paga no celular');
  w.switchListTab('financial');
  ok(A.errors.length === 0, 'redesenhar as três abas com dados vindos da nuvem não dá erro');

  console.log('\nC) O celular mexe; a nuvem recebe sozinha (sem apertar sincronizar):');
  w.switchListTab('notes'); w.openNoteForm(); await sleep(80);
  $('note-title-input').value = 'Nota do celular'; $('note-content-input').value = 'escrita no celular'; w.addNote();
  ok(await waitFor(() => server.alive('notas', UID).some((r) => r.title === 'Nota do celular' && r.content === 'escrita no celular')), 'nota nova sobe');
  w.togglePaidFinancial(fin0.id, '2026-12');
  ok(await waitFor(() => JSON.stringify(server.get('financas', UID, fin0.id).paid_months).includes('2026-12')), 'marcar paga em 12/2026 no celular sobe');
  ok(server.get('financas', UID, fin0.id).paid_months.includes('2026-11'), 'e o "pago" de 11/2026 feito no PC continua lá');
  w.requestDeleteRoutine('rt_pc'); w.confirmDeleteRoutine();
  ok(await waitFor(() => server.get('rotinas', UID, 'rt_pc').deleted === true), 'apagar a rotina do PC no celular vira tombstone na nuvem');
  const d = new w.Date(), p2 = (x) => String(x).padStart(2, '0'), today = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  w.eval(`db.push({ id: 'f_nota1', type: 'focus', title: 'Com nota', startMin: 22*60, duration: 15, date: '${today}', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: ['note_pc'], expanded: false }); saveDb();`);
  ok(await waitFor(() => (server.get('blocos', UID, 'f_nota1') || {}).linked_note_ids && server.get('blocos', UID, 'f_nota1').linked_note_ids[0] === 'note_pc'), 'bloco vinculado à nota do PC sobe com o vínculo');
  w.deleteNote('note_pc');
  ok(await waitFor(() => server.get('notas', UID, 'note_pc').deleted === true && server.get('blocos', UID, 'f_nota1').linked_note_ids.length === 0), 'apagar a nota no celular apaga na nuvem e solta o vínculo do bloco');

  console.log('\nD) Formulário aberto segura o redesenho:');
  const rid = w.eval('routinesDb[0].id');
  w.switchListTab('routines'); w.openRoutineForm(rid); // como na vida real: pela aba Rotinas, com a tela da Lista aberta
  server.patch('rotinas', UID, rid, { title: 'Mudou no PC' });
  w.fazSyncNow(); await sleep(900);
  ok(w.eval(`routinesDb.find((r) => r.id === '${rid}').title`) !== 'Mudou no PC' && !$('routines-form-view').classList.contains('hidden'), 'com o formulário de rotina aberto, o sync espera');
  w.closeRoutineForm();
  ok(await waitFor(() => w.eval(`routinesDb.find((r) => r.id === '${rid}').title`) === 'Mudou no PC', 15000), 'fechou o formulário: a mudança do PC entra');
  // formulário "aberto" mas fora da tela (trocou de aba, ou fechou a tela da Lista): o sync NÃO pode travar
  w.switchListTab('routines'); w.openRoutineForm(rid); w.switchListTab('backlog');
  ok(!$('routines-form-view').classList.contains('hidden'), '(o app troca de aba sem fechar o formulário da rotina)');
  server.patch('rotinas', UID, rid, { title: 'Mudou de novo' });
  await syncDone();
  ok(w.eval(`routinesDb.find((r) => r.id === '${rid}').title`) === 'Mudou de novo', 'formulário esquecido em outra aba não trava o sync');
  w.switchListTab('notes'); w.openNoteForm(); await sleep(80);
  w.eval('closeAllSheets()'); await sleep(50);
  ok(!$('notes-form').classList.contains('hidden') && $('list-sheet').classList.contains('translate-y-full'), '(fechar a tela da Lista deixa o formulário de nota marcado como aberto)');
  server.patch('rotinas', UID, rid, { title: 'Terceira mudança' });
  await syncDone();
  ok(w.eval(`routinesDb.find((r) => r.id === '${rid}').title`) === 'Terceira mudança', 'com a tela da Lista fechada, o sync segue normal');
  w.openListSheet(); await sleep(50);

  console.log('\nE) Nada fica sendo reenviado:');
  await syncDone(); const antes = server.log.length; await syncDone();
  ok(server.log.slice(antes).filter((l) => l.op !== 'select' && l.op !== 'getUser').length === 0, 'sincronizar de novo não envia nada'); // V40.32.0: getUser só lê (a cor e o horário da conta)
  ok(A.errors.length === 0, 'nenhum erro de página' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  try { w.close(); } catch (e) {}

  console.log('\nF) Rotinas de exemplo só num aparelho novo:');
  const B = await boot(REPO, { ...backup.data, tb_routines_db: '[]' });
  ok(B.L('tb_routines_db') === '[]' && B.w.eval('routinesDb.length') === 0, 'quem apagou todas as rotinas continua sem nenhuma (os exemplos não voltam)');
  try { B.w.close(); } catch (e) {}
  const C = await boot(REPO, { tb_theme_color: '#4f46e5' });
  ok(C.w.eval('routinesDb.length') === 3 && C.w.eval("routinesDb.map((r) => r.id).sort().join()") === 'rt_ex1,rt_ex2,rt_ex3', 'aparelho novo ganha as 3 rotinas de exemplo, como antes');
  ok(B.errors.length === 0 && C.errors.length === 0, 'sem erro de página');
  try { C.w.close(); } catch (e) {}

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
