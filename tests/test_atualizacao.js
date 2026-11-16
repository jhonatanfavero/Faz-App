// Quem já usava o app com a sincronização ligada numa versão ANTIGA abre a versão atual: nada pode se
// perder, nada pode ser reenviado à toa e ninguém deve ver pergunta nenhuma.
// O estado antigo (tests/estado-sync-v40-7-0.json) foi gerado rodando o código da V40.7.0 de verdade
// sobre os dados fictícios: é o que fica gravado em tb__sync num celular que sincronizou as Listas
// naquela versão (sem agenda, sem cor, sem arquivados).
// Uso: TZ='America/Sao_Paulo' node test_atualizacao.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app'), { makeServer } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), UID = '11111111-2222-3333-4444-555555555555';
const antigo = JSON.parse(fs.readFileSync(path.join(__dirname, 'estado-sync-v40-7-0.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };

(async () => {
  const st7 = JSON.parse(antigo.tb__sync);
  // a nuvem como a V40.7.0 deixou: as mesmas linhas da "base" guardada no aparelho
  const server = makeServer(); server.addUser(st7.email, 'senha123', UID);
  for (const kind of Object.keys(st7.base)) for (const row of Object.values(st7.base[kind])) server.insert(kind, UID, row);
  const nuvemAntes = JSON.stringify(['listas', 'tags', 'tarefas'].map((t) => server.rows(t, UID).map((r) => ({ ...r, updated_at: 0 })).sort((a, b) => (a.id < b.id ? -1 : 1))));
  const n = (t) => server.alive(t, UID).length;
  ok(st7.userId === UID && !('cursorBlocos' in st7) && !('arch' in st7) && !st7.base.blocos && n('tarefas') === JSON.parse(backup.data.tb_backlog_db).length && n('blocos') === 0,
    `ponto de partida: estado da V40.7.0 (${Object.keys(st7).join(',')}) e nuvem com ${n('listas')} listas, ${n('tags')} tags, ${n('tarefas')} tarefas, 0 blocos`);

  console.log('\nO app abre na versão atual, já logado:');
  server.storedSession = { access_token: 'tok', user: { id: UID, email: st7.email, user_metadata: {} } };
  server.log.length = 0;
  const A = await boot(REPO, { ...backup.data, tb__sync: antigo.tb__sync, 'sb-zlwocojndrjnuvoowzzu-auth-token': '{"access_token":"tok"}' }, { server });
  const { w, L } = A, nb = JSON.parse(backup.data.tb_master_db).length;
  const subiu = await waitFor(() => n('blocos') > 0 && /cursorBlocos/.test(L('tb__sync') || '')); await sleep(1500);
  ok(subiu && n('blocos') === nb, `a agenda sobe sozinha no primeiro sync: ${n('blocos')} de ${nb} blocos na nuvem`);
  const NOVOS = ['rotinas', 'notas', 'financas']; // V40.17.0: tipos novos sobem uma vez, inteiros
  const outros = server.log.filter((l) => ['upsert', 'insert', 'update'].includes(l.op) && l.t !== 'blocos' && !NOVOS.includes(l.t));
  ok(outros.length === 0, 'nenhuma lista, tag ou tarefa é reenviada' + (outros.length ? ': ' + JSON.stringify(outros.map((l) => [l.op, l.t, l.n])) : ''));
  const qtd = (k) => JSON.parse(backup.data[k] || '[]').length;
  ok(n('rotinas') === qtd('tb_routines_db') && n('notas') === qtd('tb_notes_db') && n('financas') === qtd('tb_financial_db'),
    `rotinas, notas e finanças sobem inteiras: ${n('rotinas')}, ${n('notas')} e ${n('financas')}`);
  ok(NOVOS.every((k) => server.log.filter((l) => l.t === k && l.op === 'upsert').length === 1), 'cada uma sobe numa leva só');
  ok((w.__toasts || []).some((t) => /Rotinas, notas e finanças/.test(t)), 'aparece um aviso de que rotinas, notas e finanças agora vão pro computador');
  ok(JSON.stringify(['listas', 'tags', 'tarefas'].map((t) => server.rows(t, UID).map((r) => ({ ...r, updated_at: 0 })).sort((a, b) => (a.id < b.id ? -1 : 1)))) === nuvemAntes, 'listas, tags e tarefas da nuvem idênticas às de antes');
  ok(server.users.get(st7.email).meta.faz_theme === backup.data.tb_theme_color, 'a cor do tema vai pra conta (a tela do PC abre na mesma cor)');
  const igual = (k) => L(k) === backup.data[k];
  ok(igual('tb_master_db'), 'agenda do aparelho BYTE A BYTE igual');
  ok(igual('tb_backlog_db') && igual('tb_backlog_columns') && igual('tb_tags_db'), 'listas, tarefas e tags do aparelho BYTE A BYTE iguais');
  ok(['tb_notes_db', 'tb_routines_db', 'tb_financial_db', 'tb_periods_db'].every((k) => !(k in backup.data) || igual(k)), 'notas, rotinas, finanças e períodos intocados');
  const stN = JSON.parse(L('tb__sync') || '{}');
  ok('cursorBlocos' in stN && stN.arch === 1 && stN.userId === UID && Object.keys((stN.base || {}).blocos || {}).length === nb, 'estado do sync passou pro formato novo (agenda e marcador de arquivados)');
  ok(L('tb_archive_db') === null || L('tb_archive_db') === '[]', 'nada foi arquivado sozinho');
  ok(A.confirms.length === 0 && A.alerts.length === 0, 'nenhuma pergunta nem alerta aparece' + (A.confirms.length + A.alerts.length ? ': ' + JSON.stringify([...A.confirms, ...A.alerts]).slice(0, 200) : ''));
  const antes = server.log.length; { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st, 8000); await sleep(300); }
  ok(server.log.slice(antes).filter((l) => l.op !== 'select').length === 0, 'sincronizar de novo não envia mais nada');
  ok(!!JSON.parse(L('tb__sync')).cursorBlocos, 'da segunda rodada em diante a agenda é lida de forma incremental');
  ok(A.errors.length === 0, 'nenhum erro de página' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
