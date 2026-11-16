// Simulação do motor de sync (FazSyncCore) com os dados de teste (tests/dados-ficticios.json).
// Uso: TZ='America/Sao_Paulo' node sim_sync.js <sync.js> <backup.json>
const path = require('path');
const CORE = require(path.resolve(process.argv[2]));
const backup = require(path.resolve(process.argv[3]));
const D = backup.data;
const clone = (v) => JSON.parse(JSON.stringify(v));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };

// ---------- "nuvem" falsa (como o Supabase com RLS: um usuário) ----------
class Cloud {
  constructor() { this.t = { tarefas: {}, listas: {}, tags: {}, blocos: {} }; this.clock = 0; this.upserts = 0; }
  fetch() { const o = {}; for (const k of CORE.KINDS) o[k] = Object.values(this.t[k]).map(clone); return o; }
  upsert(k, rows) { for (const r of rows) { this.t[k][r.id] = { ...clone(r), updated_at: ++this.clock }; this.upserts++; } }
  // o PC (kanban.html) altera só os campos mudados
  patch(k, id, fields) { Object.assign(this.t[k][id], clone(fields), { updated_at: ++this.clock }); }
  insert(k, row) { this.t[k][row.id] = { deleted: false, ...clone(row), updated_at: ++this.clock }; }
  alive(k) { return Object.values(this.t[k]).filter(r => !r.deleted); }
}

// ---------- "celular" falso ----------
class Phone {
  constructor(data) { this.tarefas = clone(data.tarefas); this.listas = clone(data.listas); this.tags = clone(data.tags); this.blocos = clone(data.blocos || []); this.base = null; this.used = data.used || []; }
  sync(cloud, { firstSync } = {}) {
    const A = this.arch || (this.arch = { tarefas: [], blocos: [] });
    const fl = (k) => this[k].concat(A[k].map((x) => ({ ...x, __archived: true })));
    const p = CORE.plan({ local: { tarefas: fl('tarefas'), listas: this.listas, tags: this.tags, blocos: fl('blocos') },
      base: this.base, remote: cloud.fetch(), firstSync: firstSync ?? !this.base, usedTagIds: this.used });
    for (const k of ['tarefas', 'blocos']) if (p.changed[k]) A[k] = CORE.materializeArchived(k, p.merged[k], A[k].concat(this[k]));
    if (p.changed.tarefas) this.tarefas = CORE.materialize('tarefas', p.merged.tarefas, this.tarefas, p.localOnly.tarefas);
    if (p.changed.listas) this.listas = CORE.materialize('listas', p.merged.listas, this.listas, p.localOnly.listas);
    if (p.changed.tags) this.tags = CORE.materialize('tags', p.merged.tags, this.tags, p.localOnly.tags);
    if (p.changed.blocos) this.blocos = CORE.materialize('blocos', p.merged.blocos, this.blocos, p.localOnly.blocos);
    for (const k of CORE.KINDS) cloud.upsert(k, p.push[k]);
    this.base = CORE.baseFrom(p.merged);
    return p;
  }
  colOrder(colId) { return this.tarefas.filter(t => (t.columnId || 'col_geral') === colId).map(t => t.id); }
}
const pushes = (p) => CORE.KINDS.reduce((a, k) => a + p.push[k].length, 0);

const REAL = { tarefas: JSON.parse(D.tb_backlog_db), listas: JSON.parse(D.tb_backlog_columns), tags: JSON.parse(D.tb_tags_db) };
const blocks = JSON.parse(D.tb_master_db), routines = JSON.parse(D.tb_routines_db);
const USED = [...REAL.tarefas, ...blocks, ...routines].map(x => x && x.tagId).filter(Boolean);
console.log('TZ =', process.env.TZ, '| dados de teste:', REAL.tarefas.length, 'tarefas,', REAL.listas.length, 'listas,', REAL.tags.length, 'tags\n');

// =====================================================================
console.log('1) Primeiro sync do teu celular (nuvem vazia):');
let cloud = new Cloud(), phone = new Phone({ ...REAL, used: USED });
const before = JSON.stringify({ t: phone.tarefas, l: phone.listas, g: phone.tags });
let p = phone.sync(cloud);
ok(cloud.alive('tarefas').length === 51 && cloud.alive('listas').length === 5 && cloud.alive('tags').length === 6, 'nuvem recebeu 51 tarefas, 5 listas, 6 tags');
ok(JSON.stringify({ t: phone.tarefas, l: phone.listas, g: phone.tags }) === before, 'dados do celular ficaram BYTE A BYTE iguais (nada alterado localmente)');
ok(p.droppedDefaults.length === 0 && p.repaired === 0, 'nenhuma tag descartada, nenhum reparo');
ok(cloud.alive('tarefas').filter(r => r.column_id === 'col_geral').length === 27, '19 sem columnId + 8 com col_geral = 27 na lista padrão (ALFA)');
const withMb = cloud.alive('tarefas').filter(r => r.microblocks.length);
ok(withMb.length === 10 && withMb.reduce((a, r) => a + r.microblocks.length, 0) === 48, 'checklists completas na nuvem (10 tarefas, 48 itens)');

console.log('\n2) Sincronizar de novo sem mudar nada (idempotência):');
const up0 = cloud.upserts; p = phone.sync(cloud);
ok(pushes(p) === 0 && cloud.upserts === up0, 'zero envios');
ok(!p.changed.tarefas && !p.changed.listas && !p.changed.tags, 'zero mudanças locais');
ok(JSON.stringify({ t: phone.tarefas, l: phone.listas, g: phone.tags }) === before, 'continua byte a byte igual');

console.log('\n3) Edições feitas no PC chegam no celular:');
const cols = Object.fromEntries(REAL.listas.map(c => [c.name, c.id]));
const delta = phone.colOrder(cols.DELTA), gama = phone.colOrder(cols.GAMA);
const tA = delta[0], tB = delta[1], tC = delta[2];
const tgtNeighbors = cloud.alive('tarefas').filter(r => r.column_id === cols.GAMA).sort((a, b) => a.position - b.position);
cloud.patch('tarefas', tA, { title: 'EDITADA NO PC' });
cloud.patch('tarefas', tB, { column_id: cols.GAMA, position: (tgtNeighbors[0].position + tgtNeighbors[1].position) / 2 }); // entre 1º e 2º
cloud.patch('tarefas', tC, { deleted: true });
cloud.insert('tarefas', { id: 'bl_9999999999999', column_id: cols.OMEGA, title: 'Nova do PC', duration: 30, tag_id: REAL.tags[0].id, microblocks: [], position: 1e9 });
cloud.patch('listas', cols.BETA, { name: 'BETA NOVA' });
p = phone.sync(cloud);
ok(phone.tarefas.find(t => t.id === tA).title === 'EDITADA NO PC', 'título editado no PC chegou');
ok(phone.tarefas.find(t => t.id === tB).columnId === cols.GAMA, 'tarefa movida no PC mudou de lista no celular');
ok(phone.colOrder(cols.GAMA)[1] === tB, 'e caiu exatamente na 2ª posição da lista GAMA');
ok(!phone.tarefas.some(t => t.id === tC), 'tarefa apagada no PC sumiu do celular');
ok(phone.colOrder(cols.OMEGA)[0] === 'bl_9999999999999', 'tarefa criada no PC apareceu na lista OMEGA');
ok(phone.listas.find(c => c.id === cols.BETA).name === 'BETA NOVA', 'lista renomeada no PC chegou');
ok(pushes(p) === 0, 'celular não reenviou nada (só recebeu)');
ok(phone.tarefas.length === 51, 'total: 51 - 1 apagada + 1 nova = 51');

console.log('\n4) Conflito campo a campo: celular edita título, PC move a MESMA tarefa:');
const tD = phone.colOrder(cols.DELTA)[1];
phone.tarefas.find(t => t.id === tD).title = 'Título novo no celular';
cloud.patch('tarefas', tD, { column_id: cols.OMEGA, position: 2e9 });
p = phone.sync(cloud);
const d = phone.tarefas.find(t => t.id === tD), dc = cloud.t.tarefas[tD];
ok(d.title === 'Título novo no celular' && d.columnId === cols.OMEGA, 'celular ficou com título novo E na lista nova (nada perdido)');
ok(dc.title === 'Título novo no celular' && dc.column_id === cols.OMEGA, 'nuvem ficou igual');

console.log('\n5) Celular APAGA enquanto PC EDITA a mesma tarefa → mantém (não perde edição):');
const tE = phone.colOrder(cols.GAMA)[0];
phone.tarefas = phone.tarefas.filter(t => t.id !== tE);
cloud.patch('tarefas', tE, { title: 'editada no PC enquanto apagavam' });
p = phone.sync(cloud);
ok(phone.tarefas.some(t => t.id === tE && t.title === 'editada no PC enquanto apagavam'), 'tarefa voltou no celular com a edição do PC');
ok(cloud.t.tarefas[tE].deleted === false, 'continua viva na nuvem');

console.log('\n6) PC APAGA enquanto celular EDITA → mantém com a edição do celular:');
const tF = phone.colOrder(cols.BETA)[0];
phone.tarefas.find(t => t.id === tF).duration = 75;
cloud.patch('tarefas', tF, { deleted: true });
p = phone.sync(cloud);
ok(phone.tarefas.find(t => t.id === tF)?.duration === 75, 'celular manteve a tarefa com a duração nova');
ok(cloud.t.tarefas[tF].deleted === false && cloud.t.tarefas[tF].duration === 75, 'nuvem ressuscitou com a edição');

console.log('\n7) Reordenar no celular NÃO pisa em edição do PC (posições estáveis):');
const proj = phone.colOrder('col_geral');
const moving = proj[proj.length - 1], other = proj[3];
const idxMoving = phone.tarefas.findIndex(t => t.id === moving), item = phone.tarefas.splice(idxMoving, 1)[0];
const idxTarget = phone.tarefas.findIndex(t => t.id === proj[0]); phone.tarefas.splice(idxTarget, 0, item); // última → topo
cloud.patch('tarefas', other, { title: 'título mudado no PC durante o drag' });
p = phone.sync(cloud);
ok(p.push.tarefas.length === 1 && p.push.tarefas[0].id === moving, 'só 1 linha enviada (a tarefa arrastada) — as outras 50 mantiveram posição');
ok(phone.colOrder('col_geral')[0] === moving, 'tarefa arrastada ficou no topo');
ok(phone.tarefas.find(t => t.id === other).title === 'título mudado no PC durante o drag', 'edição do PC preservada');
const cloudOrder = cloud.alive('tarefas').filter(r => r.column_id === 'col_geral').sort((a, b) => a.position - b.position).map(r => r.id);
ok(JSON.stringify(cloudOrder) === JSON.stringify(phone.colOrder('col_geral')), 'ordem da nuvem = ordem do celular');

console.log('\n8) Celular apaga uma lista (o app apaga as tarefas junto):');
const deltaTasks = phone.colOrder(cols.DELTA).length;
phone.tarefas = phone.tarefas.filter(t => (t.columnId || 'col_geral') !== cols.DELTA);
phone.listas = phone.listas.filter(c => c.id !== cols.DELTA);
p = phone.sync(cloud);
ok(cloud.t.listas[cols.DELTA].deleted === true, 'lista DELTA virou tombstone na nuvem');
ok(cloud.alive('tarefas').filter(r => r.column_id === cols.DELTA).length === 0 && deltaTasks > 0, `as ${deltaTasks} tarefas dela também`);

console.log('\n9) PC apaga lista enquanto celular cria tarefa nela → tarefa vai pra lista padrão:');
phone.tarefas.push({ id: 'bl_8888888888888', title: 'criada offline', duration: 15, tagId: null, microblocks: [], columnId: cols.OMEGA });
cloud.patch('listas', cols.OMEGA, { deleted: true });
for (const r of cloud.alive('tarefas').filter(r => r.column_id === cols.OMEGA)) cloud.patch('tarefas', r.id, { deleted: true });
p = phone.sync(cloud);
const orphan = phone.tarefas.find(t => t.id === 'bl_8888888888888');
ok(orphan && (orphan.columnId || 'col_geral') === 'col_geral', 'tarefa nova não sumiu: foi pra ALFA');
ok(!phone.listas.some(c => c.id === cols.OMEGA), 'lista OMEGA sumiu do celular');
ok(cloud.t.tarefas['bl_8888888888888'].column_id === 'col_geral', 'nuvem com a correção');

console.log('\n10) Conflito puro: os dois editam o MESMO título → vale quem sincroniza (celular):');
const tG = phone.colOrder('col_geral')[2];
phone.tarefas.find(t => t.id === tG).title = 'versão do celular';
cloud.patch('tarefas', tG, { title: 'versão do PC' });
phone.sync(cloud);
ok(phone.tarefas.find(t => t.id === tG).title === 'versão do celular' && cloud.t.tarefas[tG].title === 'versão do celular', 'celular venceu nos dois lados (regra documentada)');

console.log('\n11) Celular NOVO (perdeu o antigo): instala, faz login e recebe tudo:');
const snapshotCloud = cloud.fetch();
const fresh = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'Geral', isDefault: true, createdAt: 1 }],
  tags: [{ id: 'tag_1', name: 'Trabalho', color: '#ef4444' }, { id: 'tag_2', name: 'Pessoal', color: '#10b981' }, { id: 'tag_3', name: 'Estudo', color: '#f59e0b' }] });
p = fresh.sync(cloud);
ok(p.droppedDefaults.join() === 'tag_1,tag_2,tag_3', 'as 3 tags padrão do app novo NÃO subiram pra nuvem');
ok(fresh.listas.find(c => c.id === 'col_geral').name === 'ALFA', 'lista padrão virou ALFA (vale a nuvem)');
ok(fresh.tarefas.length === cloud.alive('tarefas').length && fresh.tags.length === cloud.alive('tags').length, `recebeu ${fresh.tarefas.length} tarefas e ${fresh.tags.length} tags`);
ok(JSON.stringify(fresh.colOrder('col_geral')) === JSON.stringify(phone.colOrder('col_geral')), 'mesma ordem do celular antigo');
ok(pushes(p) === 0 && JSON.stringify(cloud.fetch()) === JSON.stringify(snapshotCloud), 'nuvem intacta (nada sobrescrito)');

console.log('\n12) Tarefas antigas sem columnId continuam sem columnId (zero lixo):');
const noCol = REAL.tarefas.filter(t => !t.columnId).map(t => t.id);
const stillNoCol = phone.tarefas.filter(t => noCol.includes(t.id) && !('columnId' in t)).length;
ok(stillNoCol >= noCol.length - 2, `${stillNoCol} de ${noCol.length} seguem sem o campo (as que mudaram de lista ganharam columnId, correto)`);

console.log('\n13) Robustez com dado estranho:');
const weird = new Phone({ tarefas: [{ id: 'bl_1', title: null, duration: '45', microblocks: null }, { id: 'bl_1', title: 'dup' }, { id: 'bl_2', title: 'x', duration: 99999 }, null, { title: 'sem id' }],
  listas: [{ id: 'col_geral', name: 'Geral', isDefault: true }], tags: [] });
const c2 = new Cloud();
let crashed = false; try { p = weird.sync(c2); } catch (e) { crashed = e; }
ok(!crashed, 'não quebrou');
ok(c2.t.tarefas.bl_1.duration === 45 && c2.t.tarefas.bl_1.title === '' && Array.isArray(c2.t.tarefas.bl_1.microblocks), 'normalizou duração "45"→45, título nulo→"", checklist nula→[]');
ok(c2.t.tarefas.bl_2.duration === 1440, 'duração absurda limitada a 1440 (24h) — respeita a regra do banco');
ok(weird.tarefas.filter(t => t.id === 'bl_1').length === 1, 'id duplicado removido localmente');

console.log('\n14) Ordem das chaves no checklist não conta como mudança:');
const k1 = new Phone({ tarefas: [{ id: 'bl_k', title: 'k', duration: 15, tagId: null, columnId: 'col_geral', microblocks: [{ title: 'a', done: false }] }], listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 5 }], tags: [] });
const c3 = new Cloud(); k1.sync(c3);
c3.t.tarefas.bl_k.microblocks = [{ done: false, title: 'a' }];
p = k1.sync(c3);
ok(pushes(p) === 0 && !p.changed.tarefas, 'nenhum envio nem mudança');

console.log('\n15) Posições estáveis (unitário):');
const A = CORE.assignPositions;
ok(JSON.stringify(A([1024, 2048, 3072])) === '[1024,2048,3072]', 'sem mudança → iguais');
ok(JSON.stringify(A([undefined, undefined, undefined])) === '[1024,2048,3072]', 'tudo novo → 1024, 2048, 3072');
const mv = A([3072, 1024, 2048]);
ok(mv[1] === 1024 && mv[2] === 2048 && mv[0] < 1024, 'mover o último pro topo → só ele muda');
const mid = A([1024, undefined, undefined, 2048]);
ok(mid[1] > 1024 && mid[2] > mid[1] && mid[2] < 2048, '2 novos no meio → entre os vizinhos, em ordem');
let arr = [0, 1]; for (let i = 0; i < 80; i++) { arr = A([arr[0], undefined, arr[1]]); arr = [arr[0], arr[1]]; }
const renorm = A([arr[0], undefined, arr[1]]);
ok(renorm[0] < renorm[1] && renorm[1] < renorm[2], 'após 80 inserções no mesmo ponto continua estritamente crescente (renumera se precisar)');

console.log('\n16) Empate de posição (2 aparelhos escolheram o mesmo lugar) se resolve 1 vez e estabiliza:');
const tieCloud = new Cloud();
const tiePhone = new Phone({ tarefas: [{ id: 'bl_a', title: 'a', duration: 15, tagId: null, microblocks: [], columnId: 'col_geral' }],
  listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 1 }], tags: [] });
tiePhone.sync(tieCloud);
tieCloud.insert('tarefas', { id: 'bl_b', column_id: 'col_geral', title: 'b', duration: 15, tag_id: null, microblocks: [], position: 5000 });
tieCloud.insert('tarefas', { id: 'bl_c', column_id: 'col_geral', title: 'c', duration: 15, tag_id: null, microblocks: [], position: 5000 }); // mesma posição!
let pt = tiePhone.sync(tieCloud);
ok(pt.push.tarefas.length === 1, 'na 1ª rodada só UMA das empatadas ganhou posição nova');
const posB = tieCloud.t.tarefas.bl_b.position, posC = tieCloud.t.tarefas.bl_c.position;
ok(posB !== posC, 'empate desfeito na nuvem');
pt = tiePhone.sync(tieCloud);
ok(pushes(pt) === 0, 'na 2ª rodada: zero envios (estável)');

// ===================== V40.8.0: AGENDA nos dois sentidos =====================
const BL = JSON.parse(D.tb_master_db);
console.log('\n17) Agenda: 1º sync sobe tudo e não mexe no celular:');
const ac = new Cloud(), ap = new Phone({ ...REAL, blocos: BL, used: USED });
const blBefore = JSON.stringify(ap.blocos);
p = ap.sync(ac);
ok(ac.alive('blocos').length === BL.length, `nuvem recebeu os ${BL.length} blocos`);
ok(JSON.stringify(ap.blocos) === blBefore, 'agenda do celular BYTE A BYTE igual');
ok(!('expanded' in ac.t.blocos[BL[0].id]) && ac.t.blocos[BL[0].id].archived === false && ac.t.blocos[BL[0].id].color === null, "'expanded' não sobe; archived=false e color=null");
p = ap.sync(ac);
ok(pushes(p) === 0 && !p.changed.blocos && JSON.stringify(ap.blocos) === blBefore, '2º sync: zero envios, zero mudanças');

console.log('\n18) PC muda o dia de um bloco (arrastar) → chega no celular sem perder nada:');
const fut = BL.filter(b => b.date === '2026-11-16'); const mvB = fut[3];
ap.blocos.find(b => b.id === mvB.id).expanded = true; // estado de tela local
ac.patch('blocos', mvB.id, { date: '2026-11-18', start_min: 600 });
p = ap.sync(ac);
const got = ap.blocos.find(b => b.id === mvB.id);
ok(got.date === '2026-11-18' && got.startMin === 600, 'dia e horário novos aplicados');
ok(got.expanded === true && got.title === mvB.title && JSON.stringify(got.microblocks) === JSON.stringify(mvB.microblocks), "título, checklist e 'expanded' preservados");
ok(pushes(p) === 0, 'celular não reenviou nada');
ok(ap.blocos.length === BL.length && ap.blocos.findIndex(b => b.id === mvB.id) === BL.findIndex(b => b.id === mvB.id), 'ordem interna da agenda preservada');

console.log('\n19) Celular conclui um bloco enquanto o PC muda o dia do MESMO bloco:');
const cB = fut[5];
ap.blocos.find(b => b.id === cB.id).completed = true;
ac.patch('blocos', cB.id, { date: '2026-11-19' });
p = ap.sync(ac);
ok(ap.blocos.find(b => b.id === cB.id).completed === true && ap.blocos.find(b => b.id === cB.id).date === '2026-11-19', 'celular: concluído E no dia novo');
ok(ac.t.blocos[cB.id].completed === true && ac.t.blocos[cB.id].date === '2026-11-19', 'nuvem igual');
ok(p.push.blocos.length === 1, 'só 1 bloco enviado');

console.log('\n20) Arquivar no PC: some do celular, NÃO é apagado, e o celular não desfaz:');
const arB = fut[7];
ac.patch('blocos', arB.id, { archived: true });
p = ap.sync(ac);
ok(!ap.blocos.some(b => b.id === arB.id), 'bloco saiu da agenda do celular');
p = ap.sync(ac);
ok(pushes(p) === 0 && ac.t.blocos[arB.id].archived === true && ac.t.blocos[arB.id].deleted === false, 'rodada seguinte: nada enviado; segue arquivado e NÃO apagado na nuvem');
ac.patch('blocos', arB.id, { archived: false });
p = ap.sync(ac);
ok(ap.blocos.some(b => b.id === arB.id && b.title === arB.title), 'desarquivar no PC → bloco volta pro celular');
const arT = ap.tarefas[0].id;
ac.patch('tarefas', arT, { archived: true }); ap.sync(ac);
ok(!ap.tarefas.some(t => t.id === arT), 'tarefa arquivada no PC some da Lista');
p = ap.sync(ac);
ok(pushes(p) === 0 && ac.t.tarefas[arT].deleted === false, 'e não vira apagada');

console.log('\n21) Celular apaga bloco; edita outro; cria um de 5 min com cor:');
const delB = fut[9].id;
ap.blocos = ap.blocos.filter(b => b.id !== delB);
ap.blocos.push({ id: 'f_9990000000001', type: 'focus', title: 'Rápido', startMin: 1200, duration: 5, date: '2026-11-16', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false, color: '#ec4899' });
p = ap.sync(ac);
ok(ac.t.blocos[delB].deleted === true, 'apagado virou tombstone');
ok(ac.t.blocos['f_9990000000001'].duration === 5 && ac.t.blocos['f_9990000000001'].color === '#ec4899', 'bloco de 5 min com cor #ec4899 na nuvem');
ok(p.push.blocos.length === 2, 'só 2 blocos enviados');

console.log('\n22) Celular NOVO: recebe a agenda inteira; o bloco de demonstração não sobe:');
const np = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'Geral', isDefault: true, createdAt: 1 }], tags: [],
  blocos: [{ id: 'seed_1', type: 'focus', title: 'Reunião de Alinhamento', startMin: 600, duration: 60, date: '2026-11-15', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [] }] });
const snap = JSON.stringify(ac.fetch());
p = np.sync(ac);
ok(p.droppedSeeds === 1 && !np.blocos.some(b => b.id === 'seed_1'), 'bloco de demonstração descartado');
ok(np.blocos.length === ac.alive('blocos').filter(r => !r.archived).length, `recebeu ${np.blocos.length} blocos`);
ok(JSON.stringify(ac.fetch()) === snap, 'nuvem intacta');
const sample = np.blocos.find(b => b.id === BL[10].id);
ok(sample.title === BL[10].title && sample.startMin === BL[10].startMin && sample.date === BL[10].date && sample.tagId === BL[10].tagId && sample.completed === BL[10].completed, 'bloco restaurado com os mesmos dados');

console.log('\n23) Bloco com data inválida fica só no aparelho e não some:');
ap.blocos.push({ id: 'f_ruim', title: 'sem data', date: 'ontem', startMin: 0, duration: 15, microblocks: [] });
ac.patch('blocos', fut[1].id, { title: 'força um materialize' });
p = ap.sync(ac);
ok(p.skipped === 1 && ap.blocos.some(b => b.id === 'f_ruim') && !ac.t.blocos['f_ruim'], 'continua local, não foi pra nuvem');

console.log('\n24) Linhas maliciosas vindas da nuvem são neutralizadas:');
ac.insert('tarefas', { id: "x');alert(1);('", column_id: 'col_geral', title: 't', duration: 15, microblocks: [], position: 5e9 });
ac.insert('tarefas', { id: 'bl_ok1', column_id: '"><img src=x>', title: '<b>x</b>', duration: 15, tag_id: "a'b", microblocks: [{ id: "m');x('", title: 'i', done: false }, 'lixo'], position: 6e9, color: 'red"onload=' });
ac.insert('tags', { id: 'tag_evil', name: 'n', color: '"><img src=x onerror=1>', position: 9e9 });
p = ap.sync(ac);
ok(!ap.tarefas.some(t => /alert/.test(t.id)), 'tarefa com id malicioso foi ignorada');
const okT = ap.tarefas.find(t => t.id === 'bl_ok1');
ok(okT && (okT.columnId || 'col_geral') === 'col_geral' && okT.tagId === null && !okT.color && okT.microblocks.length === 1 && okT.microblocks[0].id === 'mb_x0', 'lista/tag/cor/ids de checklist fora do formato viraram valores seguros');
ok(ap.tags.find(t => t.id === 'tag_evil').color === '#a1a1aa', 'cor de tag inválida virou cinza padrão');

console.log('\n25) V40.9.0 — arquivar/desarquivar/apagar arquivado NO CELULAR:');
const zc = new Cloud(), zp = new Phone({ ...REAL, blocos: BL.slice(0, 40), used: USED }); zp.sync(zc);
const zt = zp.tarefas[5], zb = zp.blocos[7];
zp.arch.tarefas.unshift(zp.tarefas.splice(5, 1)[0]); zp.arch.blocos.unshift(zp.blocos.splice(7, 1)[0]);
p = zp.sync(zc);
ok(zc.t.tarefas[zt.id].archived === true && zc.t.tarefas[zt.id].deleted === false && zc.t.blocos[zb.id].archived === true, 'arquivar no celular → nuvem: archived = true, não apagado');
ok(p.push.tarefas.length === 1 && p.push.blocos.length === 1, 'só 1 tarefa e 1 bloco enviados');
p = zp.sync(zc);
ok(pushes(p) === 0 && !p.changed.tarefas && !p.changed.blocos && zp.arch.tarefas.length === 1, 'rodada seguinte: nada muda, arquivo local intacto');
zc.patch('tarefas', zt.id, { title: 'editada no PC arquivada' }); zp.sync(zc);
ok(zp.arch.tarefas[0].title === 'editada no PC arquivada' && !zp.tarefas.some((t) => t.id === zt.id), 'edição do PC chega no item arquivado, que continua arquivado');
zp.tarefas.push(zp.arch.tarefas.shift()); p = zp.sync(zc);
ok(zc.t.tarefas[zt.id].archived === false && p.push.tarefas.length === 1, 'desarquivar no celular → nuvem: archived = false');
zp.arch.blocos.shift(); p = zp.sync(zc);
ok(zc.t.blocos[zb.id].deleted === true, 'apagar de vez um arquivado → tombstone na nuvem');
zc.patch('blocos', zp.blocos[3].id, { archived: true }); const zid = zp.blocos[3].id; zp.sync(zc);
ok(!zp.blocos.some((b) => b.id === zid) && zp.arch.blocos.some((b) => b.id === zid && !('__archived' in b)), 'arquivado no PC → sai da agenda e entra no arquivo do celular (sem marca interna)');
zc.insert('tarefas', { id: 'bl_cor1', column_id: 'col_geral', title: 'pintada no PC', duration: 15, microblocks: [], position: 7e9, color: '#ec4899' }); zp.sync(zc);
ok(zp.tarefas.find((t) => t.id === 'bl_cor1').color === '#ec4899', 'cor escolhida no PC chega no celular');
zp.tarefas.find((t) => t.id === 'bl_cor1').color = '#10b981'; zp.sync(zc);
ok(zc.t.tarefas.bl_cor1.color === '#10b981', 'cor trocada no celular chega na nuvem');

console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
process.exit(fail ? 1 : 0);
