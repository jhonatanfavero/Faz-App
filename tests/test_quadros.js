// V40.47.0 — QUADROS E LISTAS COMPARTILHADAS: as regras (núcleo), a "nuvem" (as mesmas regras do banco) e dois celulares
// de verdade (index.html + app.js + sync.js): o dono de uma lista e quem está no quadro com ele.
// Uso: TZ='America/Sao_Paulo' node tests/test_quadros.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const REPO = process.argv[2], DADOS = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const boot = require('./boot_app');
const { makeServer, clone } = require('./mock_supabase');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 9000, step = 40) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

const DONO = 'aaaaaaaa-1111-4111-8111-111111111111', MEMBRO = 'bbbbbbbb-2222-4222-8222-222222222222', OUTRO = 'cccccccc-3333-4333-8333-333333333333';
const BETA = 'col_1700000007000', GAMA = 'col_1700000008000', DELTA = 'col_1700000009000';
const AUTH = 'sb-zlwocojndrjnuvoowzzu-auth-token';

(async () => {
  // =====================================================================================================
  console.log('A) As regras (núcleo do sync.js):');
  ok(CORE.isShared('sh_aaaaaaaa_col_1') && !CORE.isShared('col_geral') && !CORE.isShared('sh_xyz_col') && !CORE.isShared('sh_aaaaaaaa_') && !CORE.isShared(null), 'lista compartilhada = "sh_" + 8 letras da conta do dono + "_" + id (o resto não é)');
  ok(CORE.sharedAlias(DONO, BETA) === 'sh_aaaaaaaa_' + BETA && CORE.sharedAlias(DONO.toUpperCase(), BETA) === 'sh_aaaaaaaa_' + BETA, 'o apelido é o mesmo em qualquer aparelho (e não liga pra maiúscula)');
  const longo = 'x'.repeat(60), ap = CORE.sharedAlias(DONO, longo);
  ok(ap.length <= 64 && ap === CORE.sharedAlias(DONO, longo) && ap !== CORE.sharedAlias(DONO, 'y'.repeat(60)) && /^[\w.\-]{1,64}$/.test(ap), 'id comprido demais vira um apelido curto (sempre igual, e cabe na nuvem)');
  ok(CORE.sharedLocalId(DONO, 'bl_1') === 'sh_aaaaaaaa_bl_1' && CORE.uuidRef(DONO.toUpperCase()) === DONO && CORE.uuidRef('x') === null, 'tarefa que veio de outra conta ganha o prefixo dela aqui');
  // listas.quadro_id vai e volta; a Geral nunca
  const rowL = CORE.MAP.listas.row({ id: BETA, name: 'BETA', quadroId: '11111111-AAAA-4aaa-8aaa-aaaaaaaaaaaa' });
  ok(rowL.quadro_id === '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && CORE.MAP.listas.row({ id: 'col_geral', name: 'G', isDefault: true, quadroId: rowL.quadro_id }).quadro_id === null && CORE.MAP.listas.row({ id: BETA, quadroId: 'lixo' }).quadro_id === null, 'a lista leva o quadro pra nuvem (só id de verdade; a Geral nunca)');
  const itL = CORE.MAP.listas.item({ id: BETA, name: 'B', quadro_id: rowL.quadro_id }, { id: BETA, name: 'B', quadroId: 'x' });
  ok(itL.quadroId === rowL.quadro_id && !('quadroId' in CORE.MAP.listas.item({ id: BETA, name: 'B', quadro_id: null }, itL)), 'e traz de volta (sem quadro: some o campo)');
  // planShared
  const lists = { L1: true, L2: true };
  const r = (id, f) => Object.assign({ id, column_id: 'L1', title: id, duration: 30, tag_id: null, microblocks: [], position: 1024, color: null, archived: false, goal_id: null, deleted: false }, f || {});
  const it = (id, f) => Object.assign({ id, columnId: 'L1', title: id, duration: 30, tagId: null, microblocks: [] }, f || {});
  let p = CORE.planShared({ local: [], base: null, remote: [r('a'), r('b', { position: 2048 })], lists });
  ok(Object.keys(p.merged).length === 2 && !p.push.length && p.changed, '1ª vez: as tarefas da nuvem chegam, nada sobe');
  const base1 = {}; Object.keys(p.merged).forEach((k) => (base1[k] = clone(p.merged[k])));
  p = CORE.planShared({ local: [it('a', { title: 'A2' }), it('b'), it('nova', { columnId: 'L2' })], base: base1, remote: [r('a'), r('b', { position: 2048 })], lists });
  ok(p.push.length === 2 && p.push.some((x) => x.id === 'a' && x.title === 'A2') && p.push.some((x) => x.id === 'nova' && x.column_id === 'L2'), 'editou e criou aqui: só isso sobe');
  p = CORE.planShared({ local: [it('a')], base: base1, remote: [r('a'), r('b', { position: 2048 })], lists });
  ok(p.push.length === 1 && p.push[0].id === 'b' && p.push[0].deleted === true, 'apagou aqui: vira "apagada" na conta do dono');
  p = CORE.planShared({ local: [it('a', { title: 'Mexi' }), it('b')], base: base1, remote: [r('b', { position: 2048 })], lists });
  ok(!p.push.length && p.gone.a && !p.merged.a, 'a que saiu da vista (foi pra uma lista que não está compartilhada comigo) some daqui e NADA sobe, nem com edição');
  p = CORE.planShared({ local: [it('a'), it('b', { columnId: 'L9' }), it('c9', { columnId: 'L9' })], base: base1, remote: [r('a'), r('b', { position: 2048 })], lists });
  ok(p.merged.b.column_id === 'L1' && !p.push.some((x) => x.id === 'b') && p.orphans.length === 1 && p.orphans[0] === 'c9', 'movida aqui pra uma lista que deixou de ser compartilhada: fica onde está lá; criada nela: órfã (não sobe)');
  p = CORE.planShared({ local: [it('a'), it('b')], base: null, remote: [r('a', { deleted: true }), r('b', { title: 'Nuvem' })], lists });
  ok(!p.push.length && p.merged.a.deleted && p.merged.b.title === 'Nuvem', 'sem base (estado perdido, backup...): vale a nuvem, nunca apaga nada de ninguém');
  p = CORE.planShared({ local: [it('a', { title: 'Aqui' })], base: base1, remote: [r('a', { title: 'Lá', duration: 60 }), r('b', { position: 2048 })], lists });
  ok(p.merged.a.title === 'Aqui' && p.merged.a.duration === 60 && p.merged.b.deleted, 'os dois mexeram: cada campo fica com quem mudou (conflito no mesmo campo: o daqui)');
  p = CORE.planShared({ local: [it('a'), it('x', { __archived: true })], base: base1, remote: [r('a'), r('b', { position: 2048 }), r('x', { archived: true })], lists });
  ok(!p.push.some((y) => y.id === 'x') && p.merged.x.archived, 'arquivada também é uma linha normal');
  ok(CORE.quadroMsg('sem_conta').includes('criar a conta') && CORE.quadroMsg('ok').startsWith('Pronto') && /Tente de novo/.test(CORE.quadroMsg('???')), 'as mensagens do "pôr pessoa" (iguais no celular e no PC)');

  // =====================================================================================================
  console.log('\nB) A "nuvem": as mesmas regras do banco (faz_v40_47_0_quadros.sql):');
  const sql = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', 'faz_v40_47_0_quadros.sql'), 'utf8');
  ok(/create policy tarefas_quadro on public\.tarefas for all to authenticated/.test(sql) && /faz_lista_do_quadro\(user_id, column_id\)/.test(sql) && /listas_select_quadro/.test(sql) && /security definer set search_path = ''/.test(sql), 'a migration tem as regras: tarefa de lista compartilhada (ler e gravar), lista compartilhada (só ler), funções seguras');
  ok(/faz_listas_quadro_ok/.test(sql) && /faz_quadros_membros_saiu/.test(sql) && /papel <> 'dono'/.test(sql) && /revoke all on function public\.faz_quadro_adicionar\(uuid, text\) from public, anon/.test(sql), 'e os gatilhos (lista só em quadro do dono dela; quem sai leva as listas) e só quem está logado chama as funções');
  ok(!/add table public\.quadros/.test(sql.replace(/^--.*$/gm, '')), 'quadros e pessoas NÃO vão no "ao vivo" (o aviso de apagado não passa pelas regras)');
  const S = makeServer();
  S.addUser('dono@teste.com', 'senha123', DONO); S.addUser('membro@teste.com', 'senha123', MEMBRO); S.addUser('outro@teste.com', 'senha123', OUTRO);
  const as = (uid) => ({ access_token: 'tok', user: { id: uid, email: [...S.users.values()].find((u) => u.id === uid).email, user_metadata: {} } });
  const cli = (uid) => { S.storedSession = as(uid); return require('./mock_supabase').makeCreateClient(S)(); };
  const cA = cli(DONO), cB = cli(MEMBRO), cC = cli(OUTRO);
  S.insert('listas', DONO, { id: BETA, name: 'BETA' }); S.insert('listas', DONO, { id: GAMA, name: 'GAMA' });
  S.insert('tarefas', DONO, { id: 't1', column_id: BETA, title: 'Leite' }); S.insert('tarefas', DONO, { id: 't2', column_id: GAMA, title: 'Segredo' });
  const q1 = (await cA.rpc('faz_quadro_criar', { p_nome: 'Casa' })).data;
  ok(/^[0-9a-f-]{36}$/.test(q1) && S.tables.quadros_membros.get(q1 + '|' + DONO).papel === 'dono', 'criar quadro: quem cria é o dono e já está nele');
  ok((await cB.rpc('faz_quadro_adicionar', { p_quadro: q1, p_email: 'outro@teste.com' })).data === 'sem_permissao', 'só o dono põe pessoas');
  const codes = [];
  for (const e of ['nada', 'ninguem@teste.com', 'dono@teste.com', ' MEMBRO@teste.com ', 'membro@teste.com']) codes.push((await cA.rpc('faz_quadro_adicionar', { p_quadro: q1, p_email: e })).data);
  ok(codes.join(',') === 'email_invalido,sem_conta,voce_mesmo,ok,ja_esta', 'pôr pelo e-mail: inválido, sem conta, você mesmo, entrou (sem ligar pra maiúscula/espaço), já está');
  ok((await cB.from('tarefas').select('id').eq('user_id', DONO)).data.length === 0 && (await cB.from('listas').select('id').eq('user_id', DONO)).data.length === 0, 'antes de compartilhar: quem é do quadro não vê nada do dono');
  await cB.from('listas').upsert({ user_id: MEMBRO, id: 'col_m', name: 'DELA', quadro_id: q1 });
  ok(S.get('listas', MEMBRO, 'col_m').quadro_id === q1, 'qualquer um do quadro põe uma lista DELE no quadro');
  await cC.from('listas').upsert({ user_id: OUTRO, id: 'col_o', name: 'INTRUSO', quadro_id: q1 });
  ok(S.get('listas', OUTRO, 'col_o').quadro_id === null, 'quem não é do quadro não consegue pôr lista nele (fica só dele, sem erro)');
  await cA.from('listas').update({ quadro_id: q1 }).eq('user_id', DONO).eq('id', BETA);
  const vB = (await cB.from('tarefas').select('id,title,column_id').eq('user_id', DONO)).data;
  ok(vB.length === 1 && vB[0].id === 't1', 'lista compartilhada: quem é do quadro vê as tarefas DELA e só dela (a GAMA continua invisível)');
  ok((await cC.from('tarefas').select('id').eq('user_id', DONO)).data.length === 0, 'quem não é do quadro continua sem ver nada');
  let w1 = await cB.from('tarefas').upsert({ user_id: DONO, id: 'tb', column_id: BETA, title: 'Pão' }, { onConflict: 'user_id,id' });
  let w2 = await cB.from('tarefas').upsert({ user_id: DONO, id: 'tz', column_id: GAMA, title: 'Hack' }, { onConflict: 'user_id,id' });
  let w3 = await cB.from('tarefas').upsert({ user_id: DONO, id: 't2', column_id: BETA, title: 'Roubei' }, { onConflict: 'user_id,id' });
  ok(!w1.error && S.get('tarefas', DONO, 'tb').title === 'Pão' && w2.error && w3.error && S.get('tarefas', DONO, 't2').title === 'Segredo', 'grava na lista compartilhada; noutra lista do dono não (nem criando, nem por cima de uma que já existe)');
  let w4 = await cB.from('tarefas').update({ column_id: GAMA }).eq('user_id', DONO).eq('id', 't1');
  ok(w4.error && S.get('tarefas', DONO, 't1').column_id === BETA, 'não consegue tirar uma tarefa da lista compartilhada pra outra lista do dono');
  ok((await cB.from('listas').select('id').eq('user_id', DONO)).data.map((x) => x.id).join() === BETA && (await cB.from('listas').update({ name: 'X' }).eq('user_id', DONO).eq('id', BETA)) && S.get('listas', DONO, BETA).name === 'BETA', 'a lista ela vê, mas não renomeia (só o dono)');
  await cB.from('quadros').update({ nome: 'Meu' }).eq('id', q1); await cB.from('quadros').delete().eq('id', q1);
  ok(S.tables.quadros.get(q1).nome === 'Casa', 'quem não criou o quadro não renomeia nem apaga');
  await cB.from('quadros_membros').delete().eq('quadro', q1).eq('membro', DONO);
  ok(S.tables.quadros_membros.has(q1 + '|' + DONO), 'e não tira o dono');
  await cA.from('quadros_membros').delete().eq('quadro', q1).eq('membro', MEMBRO);
  ok(!S.tables.quadros_membros.has(q1 + '|' + MEMBRO) && S.get('listas', MEMBRO, 'col_m').quadro_id === null && (await cB.from('tarefas').select('id').eq('user_id', DONO)).data.length === 0, 'o dono tira alguém: a pessoa para de ver, e a lista que ela tinha posto volta a ser só dela');

  // =====================================================================================================
  console.log('\nC) Dois celulares: você cria o quadro "Casa", põe a pessoa e compartilha a lista BETA:');
  const server = makeServer();
  server.addUser('dono@teste.com', 'senha123', DONO); server.addUser('membro@teste.com', 'senha123', MEMBRO); server.addUser('outro@teste.com', 'senha123', OUTRO);
  const phone = async (uid, data) => {
    server.storedSession = { access_token: 'tok', user: { id: uid, email: [...server.users.values()].find((u) => u.id === uid).email, user_metadata: {} } };
    const P = await boot(REPO, { ...(data || {}), [AUTH]: '{"access_token":"tok"}' }, { server });
    await waitFor(() => P.L('tb__sync'), 12000);
    return P;
  };
  const A = await phone(DONO, DADOS.data), B = await phone(MEMBRO, null);
  const EA = (x) => A.w.eval(x), EB = (x) => B.w.eval(x);
  ok(!!A.L('tb__sync') && !!B.L('tb__sync') && server.alive('tarefas', DONO).length === 51, 'os dois aparelhos entraram (cada um na sua conta)');
  const QA = A.w.fazQuadros, QB = B.w.fazQuadros;
  let res = await QA.criar('   ');
  ok(!res.ok && res.msg === 'Dê um nome pro quadro.', 'quadro sem nome: pede o nome');
  res = await QA.criar('Casa');
  const CASA = res.id;
  ok(res.ok && /^[0-9a-f-]{36}$/.test(CASA) && QA.estado().quadros.length === 1 && QA.estado().quadros[0].souDono, 'criou o quadro "Casa" (e a tela já sabe)');
  res = await QA.adicionar(CASA, 'ninguem@teste.com');
  ok(!res.ok && /criar a conta/.test(res.msg), 'e-mail sem conta no Faz: avisa que a pessoa precisa criar a conta');
  res = await QA.adicionar(CASA, 'membro@teste.com');
  ok(res.ok && QA.estado().quadros[0].membros.length === 2, 'pôs a pessoa pelo e-mail (entra direto)');
  res = await QA.compartilhar('col_geral', CASA);
  ok(!res.ok && /Geral/.test(res.msg), 'a lista Geral não se compartilha');
  res = await QA.compartilhar(BETA, CASA);
  ok(res.ok && EA(`backlogColumnsDb.find(c => c.id === '${BETA}').quadroId`) === CASA && server.get('listas', DONO, BETA).quadro_id === CASA, 'a BETA foi pro quadro (no aparelho e na nuvem)');
  ok(!server.rows('listas', DONO).some((l) => l.id !== BETA && l.quadro_id), 'só ela');

  console.log('\nD) No celular da pessoa a BETA aparece, com tudo:');
  await QB.atualizar();
  const AL = CORE.sharedAlias(DONO, BETA);
  const colB = () => JSON.parse(B.L('tb_backlog_columns')).find((c) => c.id === AL);
  const tasksB = () => JSON.parse(B.L('tb_backlog_db')).filter((t) => t.columnId === AL);
  ok(colB() && colB().name === 'BETA' && colB().shared.dono === DONO && colB().shared.quadroNome === 'Casa' && colB().shared.de === 'dono@teste.com', 'a lista BETA chegou (de dono@teste.com, quadro Casa)');
  ok(tasksB().length === 8 && tasksB().every((t) => t.id.startsWith('sh_aaaaaaaa_')), 'com as 8 tarefas dela (cada uma com o prefixo da conta do dono)');
  const ordA = JSON.parse(A.L('tb_backlog_db')).filter((t) => t.columnId === BETA).map((t) => t.title).join('|');
  ok(tasksB().map((t) => t.title).join('|') === ordA, 'na mesma ordem do seu celular');
  ok(QB.estado().quadros.length === 1 && QB.estado().quadros[0].nome === 'Casa' && !QB.estado().quadros[0].souDono && QB.estado().quadros[0].listas[0].de === 'dono@teste.com', 'a tela de Quadros dela mostra o quadro Casa (de você) e a lista');
  ok(!server.rows('tarefas', MEMBRO).some((t) => CORE.isShared(t.column_id)) && !server.rows('listas', MEMBRO).some((l) => CORE.isShared(l.id)), 'nada da BETA foi parar na conta dela');
  ok(!B.L('tb__sync').includes(AL) && !!B.L('tb__compartilhadas') && B.L('tb__compartilhadas').includes(DONO), 'a sincronização pessoal dela nem vê a BETA (tem a rodada própria)');

  EB(`backlogDb.push({ id: 'bl_dela_1', title: 'Dela 1', duration: 20, tagId: null, microblocks: [], columnId: 'col_geral' }); saveBacklog();`);
  await QB.atualizar();
  console.log('\nE) A pessoa faz tudo na BETA (editar, criar, apagar, mover pras listas dela e de volta):');
  const t0 = tasksB()[0], t1 = tasksB()[1], t2 = tasksB()[2], t3 = tasksB()[3];
  const rid = (id) => id.replace(/^sh_aaaaaaaa_/, '');
  EB(`openBacklogForm('${t0.id}')`);
  B.$('backlog-input').value = 'Editada por ela';
  EB('saveBacklogForm()');
  EB(`activeColumnId = '${AL}'; openBacklogForm(); document.getElementById('backlog-input').value = 'Criada por ela'; saveBacklogForm();`);
  EB(`requestDeleteBacklog('${t1.id}'); confirmDeleteBacklog();`);
  EB(`_moveCardPendingId = '${t2.id}'; confirmMoveCard('col_geral');`);
  const minha = EB(`backlogDb.find(t => t.id === 'bl_dela_1')`), minhaId = minha && minha.id;
  ok(!!minha && !!server.get('tarefas', MEMBRO, minhaId), '(ela tem uma tarefa na lista dela, já na nuvem dela)');
  EB(`moveBacklogCardTo('${minhaId}', '${AL}', null)`);
  await QB.atualizar();
  const novaB = tasksB().find((t) => t.title === 'Criada por ela');
  const movidaPraCa = tasksB().find((t) => t.title === minha.title);
  ok(server.get('tarefas', DONO, rid(t0.id)).title === 'Editada por ela', 'editou: mudou na conta do dono');
  ok(novaB && server.get('tarefas', DONO, novaB.id) && server.get('tarefas', DONO, novaB.id).column_id === BETA && !server.get('tarefas', DONO, novaB.id).deleted, 'criou: a tarefa nasceu na BETA, na conta do dono');
  ok(server.get('tarefas', DONO, rid(t1.id)).deleted === true, 'apagou: virou "apagada" na conta do dono');
  const levada = JSON.parse(B.L('tb_backlog_db')).find((t) => t.title === t2.title && t.columnId === 'col_geral');
  ok(server.get('tarefas', DONO, rid(t2.id)).deleted === true && levada && !levada.id.startsWith('sh_') && server.get('tarefas', MEMBRO, levada.id) && !server.get('tarefas', MEMBRO, levada.id).deleted, 'levou uma pra lista dela: saiu da BETA e virou tarefa DELA (com id novo)');
  ok(movidaPraCa && movidaPraCa.id !== minhaId && server.get('tarefas', DONO, movidaPraCa.id) && server.get('tarefas', MEMBRO, minhaId).deleted === true, 'trouxe uma dela pra BETA: saiu da conta dela e nasceu na do dono (id novo)');
  ok(server.rows('tarefas', DONO).every((t) => !t.id.startsWith('sh_')), 'o prefixo daqui nunca vai pra nuvem');

  console.log('\nF) Seu celular recebe tudo (pela sincronização de sempre) e você continua mexendo:');
  await QA.atualizar();
  const betaA = () => JSON.parse(A.L('tb_backlog_db')).filter((t) => t.columnId === BETA);
  ok(betaA().some((t) => t.title === 'Editada por ela') && betaA().some((t) => t.title === 'Criada por ela') && betaA().some((t) => t.title === minha.title) && !betaA().some((t) => t.id === rid(t1.id)) && !betaA().some((t) => t.id === rid(t2.id)), 'a BETA do seu celular ficou igual à dela');
  EA(`backlogDb.find(t => t.id === '${rid(t3.id)}').title = 'Mudei aqui'; saveBacklog(); backlogColumnsDb.find(c => c.id === '${BETA}').name = 'COMPRAS'; saveBacklogColumns();`);
  await QA.atualizar();
  await QB.atualizar();
  ok(colB().name === 'COMPRAS' && tasksB().some((t) => t.id === t3.id && t.title === 'Mudei aqui'), 'você renomeou a lista e editou uma tarefa: chegou nela');
  // conflito em campos diferentes
  EA(`backlogDb.find(t => t.id === '${rid(t3.id)}').duration = 90; saveBacklog();`);
  EB(`backlogDb.find(t => t.id === '${t3.id}').title = 'Ela renomeou'; saveBacklog();`);
  await QA.atualizar(); await QB.atualizar(); await QA.atualizar();
  const t3A = JSON.parse(A.L('tb_backlog_db')).find((t) => t.id === rid(t3.id)), t3B = tasksB().find((t) => t.id === t3.id);
  ok(t3A.title === 'Ela renomeou' && t3A.duration === 90 && t3B.title === 'Ela renomeou' && t3B.duration === 90, 'os dois mexeram na mesma tarefa (campos diferentes): nada se perde');

  console.log('\nG) Agendar uma tarefa da BETA (sai da lista) e "Voltar pra lista":');
  const t4 = tasksB().find((t) => t.id.startsWith('sh_') && t.id !== t3.id);
  EB(`scheduleBacklogItem('${t4.id}')`);
  EB(`performEncaixeMatematico(600, 120, true, getTodayStr())`);
  const blk = EB(`db.find(b => b.title === ${JSON.stringify(t4.title)})`);
  ok(blk && blk.columnId === AL && !tasksB().some((t) => t.id === t4.id), 'agendou: virou bloco na agenda DELA (lembrando de onde veio) e saiu da BETA');
  await QB.atualizar();
  ok(server.get('tarefas', DONO, rid(t4.id)).deleted === true && server.get('blocos', MEMBRO, blk.id) && server.get('blocos', MEMBRO, blk.id).column_id === AL, 'na nuvem: saiu da lista do dono; o bloco é dela');
  EB(`deletingTaskId = '${blk.id}'; moveToBacklog();`);
  const voltou = tasksB().find((t) => t.title === t4.title);
  ok(voltou && voltou.columnId === AL, '"Voltar pra lista": voltou pra BETA');
  await QB.atualizar();
  ok(server.rows('tarefas', DONO).some((t) => t.id === voltou.id && !t.deleted && t.column_id === BETA), 'e pra conta do dono');

  console.log('\nH) Backup, restaurar, sair da conta, estado perdido: a lista dos outros nunca se estraga:');
  const exp = B.w.eval('JSON.stringify(fazBackupStripShared(collectFazData()))');
  ok(!exp.includes(AL) && !exp.includes('sh_aaaaaaaa_'), 'o backup dela não leva a BETA (não é dela)');
  const nAntes = tasksB().length;
  EB(`localStorage.removeItem('tb__compartilhadas')`); // estado perdido
  EB(`backlogDb = backlogDb.filter(t => t.id !== '${t3.id}'); saveBacklog();`); // "apagou" sem estado
  await QB.atualizar();
  ok(server.get('tarefas', DONO, rid(t3.id)).deleted === false && tasksB().some((t) => t.id === t3.id || rid(t.id) === rid(t3.id)) && tasksB().length === nAntes, 'sem o estado (apagado por fora): junta de novo com a nuvem, sem apagar nada de ninguém');
  // a lista "voltou" por fora (backup antigo, gen diferente): também não apaga
  EB(`(function(){ const c = backlogColumnsDb.find(x => x.id === '${AL}'); c.shared = Object.assign({}, c.shared, { gen: 'velho' }); saveBacklogColumns(); })()`);
  const outra = tasksB().find((t) => t.id.startsWith('sh_'));
  EB(`backlogDb = backlogDb.filter(t => t.id !== '${outra.id}'); saveBacklog();`);
  await QB.atualizar();
  ok(server.get('tarefas', DONO, rid(outra.id)).deleted === false && tasksB().some((t) => rid(t.id) === rid(outra.id)), 'a lista "voltou" de um jeito diferente (backup, outro aparelho): também só junta');
  // restaurar um backup dela: a BETA fica
  const meu = JSON.parse(B.L('tb_backlog_columns')).filter((c) => !c.id.startsWith('sh_'));
  const pack = { signature: 'faz-timeblock-backup', exportedAt: new Date().toISOString(), data: { tb_backlog_columns: JSON.stringify(meu), tb_backlog_db: '[]' } };
  B.w.location.reload = () => {};
  EB(`applyFazImport(${JSON.stringify(pack)})`);
  const depois = JSON.parse(B.L('tb_backlog_columns')), depoisT = JSON.parse(B.L('tb_backlog_db'));
  ok(depois.some((c) => c.id === AL) && depoisT.filter((t) => t.columnId === AL).length === tasksB().length && !depoisT.some((t) => !CORE.isShared(t.columnId)), 'restaurou um backup dela: as listas dela voltaram ao do backup e a BETA ficou como estava');
  EB(`undoFazImport()`);
  ok(JSON.parse(B.L('tb_backlog_columns')).filter((c) => c.id === AL).length === 1, 'desfazer a restauração também não duplica nem mexe na BETA');

  console.log('\nI) A pessoa também compartilha uma lista DELA; você vê e mexe:');
  EB(`backlogColumnsDb.push({ id: 'col_dela', name: 'MERCADO', isDefault: false, createdAt: Date.now() }); backlogDb.push({ id: 'bl_m1', title: 'Arroz', duration: 15, tagId: null, microblocks: [], columnId: 'col_dela' }); saveBacklogColumns(); saveBacklog();`);
  res = await QB.compartilhar('col_dela', CASA);
  await QA.atualizar();
  const AL2 = CORE.sharedAlias(MEMBRO, 'col_dela');
  ok(res.ok && JSON.parse(A.L('tb_backlog_columns')).some((c) => c.id === AL2 && c.name === 'MERCADO') && JSON.parse(A.L('tb_backlog_db')).some((t) => t.columnId === AL2 && t.title === 'Arroz'), 'a lista MERCADO dela apareceu no seu celular (qualquer um do quadro compartilha)');
  EA(`(function(){ const t = backlogDb.find(x => x.columnId === '${AL2}'); t.title = 'Arroz 5kg'; saveBacklog(); })()`);
  await QA.atualizar();
  ok(server.get('tarefas', MEMBRO, 'bl_m1').title === 'Arroz 5kg', 'você editou: mudou na conta dela');

  console.log('\nJ) Parar de compartilhar, tirar a pessoa, apagar o quadro:');
  EB(`activeColumnId = '${AL}'; openBacklogForm(); document.getElementById('backlog-input').value = 'Sem internet ainda'; saveBacklogForm();`); // criada e ainda não subiu
  res = await QA.compartilhar(BETA, null);
  ok(res.ok && server.get('listas', DONO, BETA).quadro_id === null, 'você parou de compartilhar a BETA');
  await QB.atualizar();
  ok(!colB() && !JSON.parse(B.L('tb_backlog_db')).some((t) => t.columnId === AL), 'a BETA saiu do celular dela');
  const resg = JSON.parse(B.L('tb_backlog_db')).find((t) => t.title === 'Sem internet ainda');
  ok(resg && !CORE.isShared(resg.columnId) && (B.w.__toasts || []).some((m) => /deixou de ser compartilhada/.test(m)), 'o que ela tinha criado ali e não tinha subido foi pra uma lista dela (com aviso), não se perdeu');
  ok(!server.rows('tarefas', DONO).some((t) => t.title === 'Sem internet ainda'), 'e não foi parar na sua conta');
  res = await QA.tirar(CASA, MEMBRO);
  await QA.atualizar(); await QB.atualizar();
  ok(res.ok && server.get('listas', MEMBRO, 'col_dela').quadro_id === null && !JSON.parse(A.L('tb_backlog_columns')).some((c) => c.id === AL2) && !QB.estado().quadros.length, 'você tirou a pessoa: a MERCADO dela saiu daqui e ela não vê mais o quadro');
  ok(!JSON.parse(B.L('tb_backlog_columns')).find((c) => c.id === 'col_dela').quadroId, 'e no celular dela a MERCADO voltou a ser só dela');
  res = await QA.adicionar(CASA, 'membro@teste.com'); await QA.compartilhar(BETA, CASA); await QB.atualizar();
  ok(res.ok && !!colB(), '(pôs de novo e compartilhou de novo: voltou)');
  res = await QB.sair(CASA);
  ok(res.ok && !colB() && !QB.estado().quadros.length, 'ela saiu do quadro sozinha: a BETA saiu do celular dela');
  res = await QA.apagar(CASA);
  await QA.atualizar();
  ok(res.ok && !server.tables.quadros.size && server.get('listas', DONO, BETA).quadro_id === null && !EA(`backlogColumnsDb.find(c => c.id === '${BETA}').quadroId`), 'você apagou o quadro: a BETA voltou a ser só sua (nenhuma tarefa apagada)');
  ok(betaA().length > 0 && server.alive('tarefas', DONO).filter((t) => t.column_id === BETA).length === betaA().length, '(as tarefas da BETA continuam todas aí)');

  console.log('\nK) Telas do celular (Config → Quadros, menu da lista, compartilhar):');
  res = await QA.criar('Empresa'); const EMP = res.id; await QA.adicionar(EMP, 'membro@teste.com'); await QA.compartilhar(DELTA, EMP); await QB.atualizar();
  const AL3 = CORE.sharedAlias(DONO, DELTA);
  ok(JSON.parse(B.L('tb_backlog_columns')).some((c) => c.id === AL3), '(quadro Empresa com a DELTA)');
  A.w.openConfigSheet(); A.w.openConfigQuadros();
  await sleep(150);
  ok(!A.$('config-quadros-view').classList.contains('hidden') && A.$('config-title').innerText === 'Quadros' && A.$('qd-list').textContent.includes('Empresa') && A.$('qd-list').textContent.includes('você criou'), 'Config → Quadros mostra seus quadros');
  A.w.qdOpen(EMP);
  ok(!A.$('qd-detail').classList.contains('hidden') && A.$('qd-d-name').textContent === 'Empresa' && A.$('qd-d-members').textContent.includes('membro@teste.com') && !A.$('qd-d-add').classList.contains('hidden') && A.$('qd-d-lists').textContent.includes('DELTA'), 'o quadro: pessoas, "pôr alguém" (você criou) e as listas');
  ok(A.$('config-back-btn').getAttribute('onclick') === 'qdBack()', 'o voltar volta pra lista de quadros');
  A.$('qd-email').value = 'outro@teste.com';
  A.w.qdAdd();
  await waitFor(() => !A.$('qd-add-msg').classList.contains('hidden'));
  ok(/Pronto/.test(A.$('qd-add-msg').textContent) && A.$('qd-email').value === '' && A.$('qd-d-members').textContent.includes('outro@teste.com'), 'pôs mais uma pessoa pela tela');
  // nome de quadro com HTML: aparece como texto (nunca vira HTML)
  res = await QA.criar('<img src=x onerror="window.__xss=1">');
  A.w.qdBack(); await sleep(50);
  ok(res.ok && !A.$('qd-list').querySelector('img') && A.$('qd-list').textContent.includes('<img src=x') && !A.w.__xss, 'nome de quadro com HTML aparece como texto (não vira HTML)');
  await QA.apagar(res.id);
  A.w.closeAllSheets();
  EA(`activeColumnId = '${DELTA}'; renderBacklog(); openColumnMenuFromHeader();`);
  ok(!A.$('column-menu-shared').classList.contains('hidden') && /Compartilhada com o quadro Empresa/.test(A.$('column-menu-shared-txt').textContent) && !A.$('column-menu-share-btn').classList.contains('hidden') && !A.$('column-menu-board-btn').classList.contains('hidden'), 'menu da sua lista compartilhada: diz com quem e deixa mudar');
  ok(!A.$('backlog-column-shared').classList.contains('hidden'), 'e a lista tem o ícone de compartilhada');
  EA(`closeColumnMenu()`);
  // no celular dela: a lista de outra pessoa não se renomeia nem se apaga; diz de quem é
  EB(`activeColumnId = '${AL3}'; renderBacklog(); openColumnMenuFromHeader();`);
  ok(B.$('column-menu-rename-btn').classList.contains('hidden') && B.$('column-menu-delete-btn').classList.contains('hidden') && B.$('column-menu-share-btn').classList.contains('hidden') && /Lista de dono@teste\.com, no quadro Empresa/.test(B.$('column-menu-shared-txt').textContent), 'no celular dela: a DELTA diz de quem é e não tem Renomear nem Apagar');
  EB(`closeColumnMenu()`);
  EB(`openDeleteColumn(); openRenameColumn();`);
  ok(B.$('column-delete-modal').classList.contains('hidden') && B.$('column-name-modal').classList.contains('hidden') && (B.w.__toasts || []).some((m) => /Só quem é dono da lista pode/.test(m)), 'nem pelo atalho: só quem é dono');
  ok(B.$('backlog-column-title').textContent === 'DELTA' && !B.$('backlog-column-shared').classList.contains('hidden') && /dono@teste\.com/.test(B.$('backlog-column-shared').title), 'cabeçalho: nome + ícone de compartilhada (de quem é)');
  // compartilhar uma lista dela pela janelinha
  EB(`backlogColumnsDb.push({ id: 'col_dela2', name: 'FEIRA', isDefault: false, createdAt: Date.now() }); saveBacklogColumns(); activeColumnId = 'col_dela2'; renderBacklog(); openColumnMenuFromHeader();`);
  ok(!B.$('column-menu-share-btn').classList.contains('hidden') && B.$('column-menu-shared').classList.contains('hidden'), 'lista dela, ainda não compartilhada: botão "Compartilhar com um quadro"');
  EB(`openShareColumn()`);
  ok(!B.$('share-list-modal').classList.contains('hidden') && B.$('share-list-options').textContent.includes('Empresa') && B.$('share-list-options').textContent.includes('Só minha') && B.$('share-list-options').querySelector('.agf-row.on').textContent.includes('Só minha'), 'a janelinha mostra os quadros dela ("Só minha" marcado)');
  EB(`shareListPick('${EMP}')`);
  await waitFor(() => server.get('listas', MEMBRO, 'col_dela2') && server.get('listas', MEMBRO, 'col_dela2').quadro_id === EMP);
  ok(server.get('listas', MEMBRO, 'col_dela2').quadro_id === EMP && B.$('share-list-modal').classList.contains('hidden'), 'escolheu "Empresa": a FEIRA foi pro quadro');
  await QA.atualizar();
  ok(JSON.parse(A.L('tb_backlog_columns')).some((c) => c.id === CORE.sharedAlias(MEMBRO, 'col_dela2') && c.name === 'FEIRA'), 'e apareceu no seu celular');
  console.log('\nL) Trocar de conta / sair da conta:');
  // trocou de conta sem passar pelo "Sair" (o estado guardado é de outra conta): as listas daqui saem sem ir pra lugar nenhum
  EB(`activeColumnId = '${AL3}'; openBacklogForm(); document.getElementById('backlog-input').value = 'De outra conta'; saveBacklogForm();`);
  EB(`(function(){ const s = JSON.parse(localStorage.getItem('tb__compartilhadas')); s.userId = '${OUTRO}'; localStorage.setItem('tb__compartilhadas', JSON.stringify(s)); })()`);
  await QB.atualizar();
  ok(JSON.parse(B.L('tb_backlog_columns')).some((c) => c.id === AL3) && !JSON.parse(B.L('tb_backlog_db')).some((t) => t.title === 'De outra conta') && ![DONO, MEMBRO, OUTRO].some((u) => server.rows('tarefas', u).some((t) => t.title === 'De outra conta')), 'estado de outra conta: as listas daqui saem sem levar nada (e voltam as desta conta)');
  await B.w.fazSyncLogout(true);
  ok(!JSON.parse(B.L('tb_backlog_columns')).some((c) => CORE.isShared(c.id)) && !JSON.parse(B.L('tb_backlog_db')).some((t) => CORE.isShared(t.columnId)) && !B.L('tb__compartilhadas') && !B.L('tb__quadros'), 'saiu da conta: as listas dos outros saíram do aparelho');
  ok(server.alive('tarefas', DONO).filter((t) => t.column_id === DELTA).length === 10, 'e nada foi apagado na nuvem');

  const errs = A.errors.concat(B.errors).filter((e) => !/Not implemented: navigation/.test(e)); // o "recarregar" depois de restaurar (o jsdom não recarrega)
  ok(errs.length === 0, 'nenhum erro de página nos dois celulares' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
