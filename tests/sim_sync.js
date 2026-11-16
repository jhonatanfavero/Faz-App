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
  constructor() { this.t = {}; for (const k of CORE.KINDS) this.t[k] = {}; this.clock = 0; this.upserts = 0; }
  fetch() { const o = {}; for (const k of CORE.KINDS) o[k] = Object.values(this.t[k]).map(clone); return o; }
  upsert(k, rows) { for (const r of rows) { this.t[k][r.id] = { ...clone(r), updated_at: ++this.clock }; this.upserts++; } }
  // o PC (kanban.html) altera só os campos mudados
  patch(k, id, fields) { Object.assign(this.t[k][id], clone(fields), { updated_at: ++this.clock }); }
  insert(k, row) { this.t[k][row.id] = { deleted: false, ...clone(row), updated_at: ++this.clock }; }
  alive(k) { return Object.values(this.t[k]).filter(r => !r.deleted); }
}

// ---------- "celular" falso ----------
class Phone {
  constructor(data) { this.tarefas = clone(data.tarefas); this.listas = clone(data.listas); this.tags = clone(data.tags); this.blocos = clone(data.blocos || []); this.base = null; this.used = data.used || [];
    this.rotinas = clone(data.rotinas || []); this.notas = clone(data.notas || []); this.financas = clone(data.financas || []); // V40.17.0
    this.metas_listas = clone(data.metas_listas || []); this.metas = clone(data.metas || []); this.metas_dias = clone(data.metas_dias || []); } // V40.21.0
  sync(cloud, { firstSync } = {}) {
    const A = this.arch || (this.arch = { tarefas: [], blocos: [] });
    const fl = (k) => this[k].concat(A[k].map((x) => ({ ...x, __archived: true })));
    const p = CORE.plan({ local: { tarefas: fl('tarefas'), listas: this.listas, tags: this.tags, blocos: fl('blocos'), rotinas: this.rotinas, notas: this.notas, financas: this.financas,
      metas_listas: this.metas_listas, metas: this.metas, metas_dias: this.metas_dias },
      base: this.base, remote: cloud.fetch(), firstSync: firstSync ?? !this.base, usedTagIds: this.used });
    for (const k of ['tarefas', 'blocos']) if (p.changed[k]) A[k] = CORE.materializeArchived(k, p.merged[k], A[k].concat(this[k]));
    if (p.changed.tarefas) this.tarefas = CORE.materialize('tarefas', p.merged.tarefas, this.tarefas, p.localOnly.tarefas);
    if (p.changed.listas) this.listas = CORE.materialize('listas', p.merged.listas, this.listas, p.localOnly.listas);
    if (p.changed.tags) this.tags = CORE.materialize('tags', p.merged.tags, this.tags, p.localOnly.tags);
    if (p.changed.blocos) this.blocos = CORE.materialize('blocos', p.merged.blocos, this.blocos, p.localOnly.blocos);
    for (const k of ['rotinas', 'notas', 'financas', 'metas_listas', 'metas', 'metas_dias']) if (p.changed[k]) this[k] = CORE.materialize(k, p.merged[k], this[k], p.localOnly[k]); // V40.17.0 e V40.21.0
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

// ===================== V40.17.0: ROTINAS, NOTAS e FINANÇAS =====================
const RT = JSON.parse(D.tb_routines_db), NT = JSON.parse(D.tb_notes_db), FN = JSON.parse(D.tb_financial_db);
const novos = () => ({ rotinas: clone(RT), notas: clone(NT), financas: clone(FN) });
console.log(`\n26) Rotinas, notas e finanças sobem no 1º sync sem mexer no celular (${RT.length}, ${NT.length} e ${FN.length}):`);
const rc = new Cloud(), rp = new Phone({ ...REAL, used: USED, ...novos() });
const rBefore = JSON.stringify([rp.rotinas, rp.notas, rp.financas]);
p = rp.sync(rc);
ok(rc.alive('rotinas').length === RT.length && rc.alive('notas').length === NT.length && rc.alive('financas').length === FN.length, 'as três foram inteiras pra nuvem');
ok(JSON.stringify([rp.rotinas, rp.notas, rp.financas]) === rBefore && !p.changed.rotinas && !p.changed.notas && !p.changed.financas, 'no celular, BYTE A BYTE iguais');
const r0 = rc.t.rotinas[RT[0].id];
ok(r0.title === RT[0].title && r0.emoji === RT[0].emoji && r0.duration === RT[0].duration && r0.created_ms === RT[0].createdAt && JSON.stringify(r0.microblocks) === JSON.stringify(RT[0].microblocks), 'rotina na nuvem com nome, emoji, duração, data e checklist');
const n0 = rc.t.notas[NT[0].id];
ok(n0.title === NT[0].title && n0.content === NT[0].content && n0.created_ms === NT[0].createdAt && n0.updated_ms === NT[0].updatedAt, 'nota na nuvem com título, texto e datas');
const f0 = rc.t.financas[FN[0].id];
ok(f0.amount === FN[0].amount && f0.start_month === FN[0].startMonth && f0.duration_months === 12 && f0.is_recurring === true && f0.due_day === 1 && JSON.stringify(f0.paid_months) === JSON.stringify(FN[0].paidMonths), 'despesa na nuvem com valor, início, meses, vencimento e meses pagos');
ok(JSON.stringify(f0.amount_overrides) === '{"2026-06":{"amount":30.5},"2026-07":{"amount":47.5}}', 'valor de mês específico gravado no formato que o app lê ({ amount }) mesmo vindo como número solto');
p = rp.sync(rc);
ok(pushes(p) === 0 && !p.changed.rotinas && !p.changed.notas && !p.changed.financas, '2º sync: zero envios, zero mudanças');

console.log('\n27) Quem já sincronizava (base sem os tipos novos) sobe só rotinas, notas e finanças:');
const oc = new Cloud(), op = new Phone({ ...REAL, blocos: BL.slice(0, 30), used: USED });
op.sync(oc);
Object.assign(op, novos());
const upAntes = { ...Object.fromEntries(CORE.KINDS.map((k) => [k, Object.keys(oc.t[k]).length])) };
p = op.sync(oc);
ok(p.push.tarefas.length === 0 && p.push.listas.length === 0 && p.push.tags.length === 0 && p.push.blocos.length === 0, 'listas, tags, tarefas e agenda NÃO são reenviadas');
ok(p.push.rotinas.length === RT.length && p.push.notas.length === NT.length && p.push.financas.length === FN.length && upAntes.rotinas === 0, 'rotinas, notas e finanças sobem inteiras');

console.log('\n28) Notas: o PC cria, edita e apaga; o celular acompanha:');
oc.insert('notas', { id: 'note_pc_1', title: 'Do PC', content: 'linha 1\nlinha 2', created_ms: 4e12, updated_ms: 4e12 });
oc.patch('notas', NT[1].id, { title: 'Título mudado no PC', updated_ms: 4e12 + 5 });
oc.patch('notas', NT[2].id, { deleted: true });
p = op.sync(oc);
ok(op.notas[0].id === 'note_pc_1' && op.notas[0].content === 'linha 1\nlinha 2' && op.notas[0].createdAt === 4e12, 'nota criada no PC aparece EM CIMA (a mais nova primeiro, como no app)');
ok(op.notas.find((n) => n.id === NT[1].id).title === 'Título mudado no PC' && op.notas.find((n) => n.id === NT[1].id).content === NT[1].content, 'título editado no PC chega e o texto fica');
ok(!op.notas.some((n) => n.id === NT[2].id) && pushes(p) === 0, 'nota apagada no PC some do celular; nada reenviado');

console.log('\n29) Notas: celular muda o texto enquanto o PC muda o título da MESMA nota → fica com os dois:');
op.notas.find((n) => n.id === NT[0].id).content = 'texto novo no celular';
oc.patch('notas', NT[0].id, { title: 'título novo no PC' });
p = op.sync(oc);
const nb = op.notas.find((n) => n.id === NT[0].id);
ok(nb.title === 'título novo no PC' && nb.content === 'texto novo no celular' && oc.t.notas[NT[0].id].content === 'texto novo no celular', 'título do PC + texto do celular, nos dois lados');

console.log('\n30) Rotinas: o PC cria (com checklist) e apaga; o celular acompanha:');
oc.insert('rotinas', { id: 'rt_pc_1', title: 'Fechamento', emoji: '📦', duration: 90, theme: 'focus', tag_id: REAL.tags[1].id, microblocks: [{ title: 'Conferir caixa' }, { title: 'Lançar notas' }], created_ms: 4e12 });
oc.patch('rotinas', RT[1].id, { deleted: true });
p = op.sync(oc);
const rpc = op.rotinas.find((r) => r.id === 'rt_pc_1');
ok(op.rotinas[0].id === 'rt_pc_1' && rpc.emoji === '📦' && rpc.duration === 90 && rpc.tagId === REAL.tags[1].id && rpc.microblocks.length === 2 && rpc.createdAt === 4e12, 'rotina do PC chega inteira e fica em cima');
ok(!op.rotinas.some((r) => r.id === RT[1].id), 'rotina apagada no PC some do celular');
op.rotinas.find((r) => r.id === 'rt_pc_1').microblocks.push({ title: 'Imprimir relatório' });
p = op.sync(oc);
ok(oc.t.rotinas.rt_pc_1.microblocks.length === 3 && p.push.rotinas.length === 1, 'item novo na checklist feito no celular sobe (só essa rotina)');

console.log('\n31) Finanças: o PC marca pago, muda o valor de um mês e o vencimento:');
const fA = FN.find((f) => f.durationMonths > 1 && !f.isRecurring) || FN[1];
oc.patch('financas', fA.id, { paid_months: [...oc.t.financas[fA.id].paid_months, '2026-11'], amount_overrides: { '2026-12': { amount: 99.9 } }, due_day: 20 });
p = op.sync(oc);
const fa = op.financas.find((f) => f.id === fA.id);
ok(fa.paidMonths.includes('2026-11') && fa.paidMonthsOverrides['2026-12'].amount === 99.9 && fa.dueDay === 20, 'pago em 11/2026, valor de 12/2026 = 99,90 e vencimento dia 20 no celular');
ok(fa.title === fA.title && fa.amount === fA.amount && fa.startMonth === fA.startMonth && fa.durationMonths === fA.durationMonths, 'o resto da despesa ficou igual');
oc.insert('financas', { id: 'fin_pc_1', title: 'Internet', amount: 129.9, start_month: '2026-11', duration_months: 12, is_recurring: true, due_day: 10, paid_months: [], amount_overrides: {}, created_ms: 4e12 });
p = op.sync(oc);
const fpc = op.financas[op.financas.length - 1];
ok(fpc.id === 'fin_pc_1' && fpc.startMonth === '2026-11' && fpc.isRecurring === true && fpc.dueDay === 10 && Array.isArray(fpc.paidMonths) && !('paidMonthsOverrides' in fpc) && op.financas.length === FN.length + 1, 'despesa criada no PC entra no fim, no formato do app');

console.log('\n32) Finanças: formato antigo (V40.4.1–3, com "month" e "paid") vira o novo sem perder nada:');
const lc = new Cloud(), lp = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 1 }], tags: [],
  financas: [{ id: 'fin_old1', title: 'Luz', amount: '210.40', month: '2026-03', paid: true, dueDay: '15', createdAt: 5 },
    { id: 'fin_old2', title: 'Água', amount: 80, month: '2026-03', paid: false, createdAt: 6 },
    { id: 'fin_ruim', title: 'sem mês', amount: 1, startMonth: 'março', createdAt: 7 }] });
const lBefore = JSON.stringify(lp.financas);
p = lp.sync(lc);
ok(lc.t.financas.fin_old1.start_month === '2026-03' && JSON.stringify(lc.t.financas.fin_old1.paid_months) === '["2026-03"]' && lc.t.financas.fin_old1.amount === 210.4 && lc.t.financas.fin_old1.due_day === 15, 'month → start_month, paid → paid_months, "210.40" → 210,4, "15" → 15');
ok(JSON.stringify(lc.t.financas.fin_old2.paid_months) === '[]' && lc.t.financas.fin_old2.due_day === null, 'não paga → nenhum mês pago; sem vencimento → null');
ok(!lc.t.financas.fin_ruim && p.skipped === 1 && JSON.stringify(lp.financas) === lBefore, 'despesa sem mês válido fica só no aparelho e o aparelho não muda');
lc.patch('financas', 'fin_old2', { title: 'Água e esgoto' });
p = lp.sync(lc);
const lo1 = lp.financas.find((f) => f.id === 'fin_old1'), lo2 = lp.financas.find((f) => f.id === 'fin_old2');
ok(lo2.title === 'Água e esgoto' && lo2.startMonth === '2026-03' && !('month' in lo2) && Array.isArray(lo2.paidMonths) && !('paid' in lo2), 'item editado no PC volta no formato novo (startMonth / paidMonths)');
ok(lo1.startMonth === '2026-03' && JSON.stringify(lo1.paidMonths) === '["2026-03"]' && lo1.amount === 210.4 && lo1.dueDay === 15 && !('paid' in lo1),
  'a outra antiga, reescrita junto, tem o mesmo significado no formato novo (é o que o app faz ao marcar pago)');
ok(lp.financas.some((f) => f.id === 'fin_ruim' && f.startMonth === 'março') && lp.financas[lp.financas.length - 1].id === 'fin_ruim', 'a sem mês válido continua no aparelho, intacta');

console.log('\n33) Celular NOVO: as rotinas de exemplo não duplicam nem ressuscitam:');
const ex = [{ id: 'rt_ex1', title: 'Manhã Produtiva', emoji: '🌞', duration: 120, theme: 'focus', tagId: null, microblocks: [{ title: 'Meditação e Café' }], createdAt: 9e12 },
  { id: 'rt_ex2', title: 'Rotina Noturna', emoji: '🌙', duration: 60, theme: 'rest', tagId: null, microblocks: [], createdAt: 9e12 + 1 }];
const ec = new Cloud(), ep1 = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 1 }], tags: [], rotinas: clone(ex) });
ep1.sync(ec);
ep1.rotinas = ep1.rotinas.filter((r) => r.id !== 'rt_ex2'); ep1.rotinas[0].title = 'Minha manhã'; ep1.sync(ec);
const ep2 = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 1 }], tags: [], rotinas: clone(ex) });
p = ep2.sync(ec);
ok(ep2.rotinas.length === 1 && ep2.rotinas[0].title === 'Minha manhã', 'o aparelho novo fica com a versão da nuvem (sem duplicar) e sem a rotina apagada');
ok(ec.t.rotinas.rt_ex2.deleted === true && ec.t.rotinas.rt_ex1.title === 'Minha manhã', 'a nuvem não foi sobrescrita pelo exemplo');

console.log('\n34) Tag apagada: rotina e despesa ficam sem tag (igual à tarefa):');
oc.patch('tags', REAL.tags[1].id, { deleted: true });
p = op.sync(oc);
ok(op.rotinas.find((r) => r.id === 'rt_pc_1').tagId === null && oc.t.rotinas.rt_pc_1.tag_id === null, 'rotina do PC perdeu a tag apagada, nos dois lados');

console.log('\n35) Linhas estranhas ou maliciosas nas tabelas novas são neutralizadas:');
oc.insert('rotinas', { id: 'rt_evil', title: 'x', emoji: '😀', duration: 99999, theme: 'x"><img>', tag_id: "a'b", microblocks: [{ id: "m');x('", title: 'i' }, 'lixo'], created_ms: 'abc' });
oc.insert('rotinas', { id: "rt');alert(1);('", title: 'id ruim', emoji: '', duration: 10, theme: 'focus', microblocks: [] });
oc.insert('financas', { id: 'fin_evil', title: 'x', amount: 1e20, start_month: '2026-13', duration_months: 0, due_day: 40, paid_months: ['2026-01', 'lixo', '2026-01'], amount_overrides: { '2026-02': { amount: 'abc' }, x: { amount: 1 } }, created_ms: 1 });
oc.insert('financas', { id: 'fin_estranha', title: 'y', amount: 1e20, start_month: '2026-02', duration_months: 0, due_day: 40, paid_months: ['2026-01', 'lixo', '2026-01'], amount_overrides: { '2026-02': { amount: 'abc' }, '2026-03': 12, x: { amount: 1 } }, created_ms: 2 });
oc.insert('notas', { id: 'note_null', title: null, content: null, created_ms: null });
crashed = false; try { p = op.sync(oc); } catch (e) { crashed = e; }
ok(!crashed, 'não quebrou');
const ev = op.rotinas.find((r) => r.id === 'rt_evil');
ok(ev && ev.duration === 1440 && ev.theme === 'focus' && ev.tagId === null && ev.microblocks.length === 1 && ev.microblocks[0].id === 'mb_x0', 'rotina: duração limitada, tema e tag inválidos neutralizados, checklist limpa');
ok(!op.rotinas.some((r) => /alert/.test(r.id)), 'rotina com id malicioso ignorada');
ok(!op.financas.some((f) => f.id === 'fin_evil'), 'despesa com mês inexistente (2026-13) ignorada');
const es = op.financas.find((f) => f.id === 'fin_estranha');
ok(es && es.amount === 0 && es.durationMonths === 1 && es.dueDay === null && JSON.stringify(es.paidMonths) === '["2026-01"]' && JSON.stringify(es.paidMonthsOverrides) === '{"2026-03":{"amount":12}}', 'despesa estranha: valor absurdo → 0, meses → 1, dia 40 → sem vencimento, meses pagos e valores por mês limpos');
const nn = op.notas.find((n) => n.id === 'note_null');
ok(nn && nn.title === '' && nn.content === '', 'nota com título e texto nulos vira texto vazio');

console.log('\n36) Unitários dos formatos de finanças:');
ok(JSON.stringify(CORE.cleanOverrides({ '2026-01': 5, '2026-02': { amount: '7.5' }, '2026-03': null, '2026-04': { amount: true }, '2026-05': [1], bad: 1 })) === '{"2026-01":{"amount":5},"2026-02":{"amount":7.5}}', 'cleanOverrides aceita número ou { amount } e descarta o resto');
ok(JSON.stringify(CORE.cleanMonths(['2026-01', '2026-1', '2026-00', '2026-12', '2026-01', 5])) === '["2026-01","2026-12"]', 'cleanMonths: só YYYY-MM válido, sem repetir');
const longo = 'a'.repeat(199) + '😀';
ok(CORE.MAP.rotinas.row({ id: 'r', title: longo }).title.length === 199, 'corte no limite não parte um emoji ao meio');

console.log('\n37) Metas: sobem do celular, voltam do PC e a ordem fica estável:');
const GL = () => [{ id: 'gl_pessoal', name: 'Pessoal', isDefault: true, createdAt: 1 }, { id: 'gl_profissional', name: 'Profissional', isDefault: true, createdAt: 1 }, { id: 'gl_financeiro', name: 'Financeiro', isDefault: true, createdAt: 1 }];
const G1 = { id: 'meta_1', listId: 'gl_pessoal', title: 'Beber água', emoji: '💧', period: 'dia', unit: 'vezes', target: 8, step: 1, createdAt: 10 };
const G2 = { id: 'meta_2', listId: 'gl_pessoal', title: 'Correr', emoji: '🏃', period: 'semana', unit: 'vezes', target: 3, step: 1, createdAt: 11 };
const G3 = { id: 'meta_3', listId: 'gl_financeiro', title: 'Guardar', emoji: '💰', period: 'mes', unit: 'reais', target: 500, step: 50, createdAt: 12 };
const D1 = { id: 'meta_1_20261116', goalId: 'meta_1', date: '2026-11-16', amount: 6, target: 8 };
const mc = new Cloud(), mp = new Phone({ tarefas: [], listas: [{ id: 'col_geral', name: 'G', isDefault: true, createdAt: 1 }], tags: [],
  metas_listas: GL(), metas: [clone(G1), clone(G2), clone(G3)], metas_dias: [clone(D1)] });
const mBefore = JSON.stringify([mp.metas_listas, mp.metas, mp.metas_dias]);
p = mp.sync(mc);
ok(mc.alive('metas_listas').length === 3 && mc.alive('metas').length === 3 && mc.alive('metas_dias').length === 1, 'nuvem recebeu 3 listas de metas, 3 metas e 1 dia');
ok(mc.t.metas.meta_1.list_id === 'gl_pessoal' && mc.t.metas.meta_3.unit === 'reais' && mc.t.metas.meta_3.target === 500 && mc.t.metas_dias.meta_1_20261116.amount === 6 && mc.t.metas_dias.meta_1_20261116.target === 8, 'formato da nuvem: list_id, unit, target; o dia com amount e o alvo da época');
ok(JSON.stringify([mp.metas_listas, mp.metas, mp.metas_dias]) === mBefore && pushes(mp.sync(mc)) === 0, 'celular continua byte a byte igual e a 2ª rodada não envia nada');
const po = mc.t.metas;
ok(po.meta_1.position < po.meta_2.position && po.meta_2.position < po.meta_3.position && mc.t.metas_listas.gl_pessoal.position < mc.t.metas_listas.gl_financeiro.position, 'ordem das metas e das listas de metas guardada em "position"');
// o PC: renomeia a lista, muda o alvo, soma no dia e cria uma meta
mc.patch('metas_listas', 'gl_profissional', { name: 'Trabalho' });
mc.patch('metas', 'meta_2', { target: 4 });
mc.patch('metas_dias', 'meta_1_20261116', { amount: 7 });
mc.insert('metas', { id: 'meta_pc', list_id: 'gl_profissional', title: 'Ler', emoji: '📚', period: 'dia', unit: 'minutos', target: 30, step: 15, position: po.meta_3.position + 1024, created_ms: 20 });
mc.insert('metas_dias', { id: 'meta_pc_20261116', goal_id: 'meta_pc', date: '2026-11-16', amount: 15, target: 30 });
p = mp.sync(mc);
ok(mp.metas_listas.find((l) => l.id === 'gl_profissional').name === 'Trabalho' && mp.metas.find((g) => g.id === 'meta_2').target === 4, 'lista renomeada e alvo mudado no PC chegaram');
ok(mp.metas_dias.find((d) => d.id === 'meta_1_20261116').amount === 7, '+1 marcado no PC chegou');
const npc = mp.metas[mp.metas.length - 1];
ok(npc.id === 'meta_pc' && npc.listId === 'gl_profissional' && npc.unit === 'minutos' && npc.step === 15 && mp.metas_dias.some((d) => d.id === 'meta_pc_20261116' && d.goalId === 'meta_pc' && d.amount === 15), 'meta criada no PC entra no fim, no formato do app (com o dia dela)');
ok(pushes(p) === 0, 'celular não reenviou nada (só recebeu)');
// os dois somaram no mesmo dia ao mesmo tempo: vale o deste aparelho (regra de sempre)
mc.patch('metas_dias', 'meta_1_20261116', { amount: 8 });
mp.metas_dias.find((d) => d.id === 'meta_1_20261116').amount = 9;
p = mp.sync(mc);
ok(mc.t.metas_dias.meta_1_20261116.amount === 9 && mp.metas_dias.find((d) => d.id === 'meta_1_20261116').amount === 9, 'conflito no mesmo dia: vale o deste aparelho, e os dois lados ficam iguais');

console.log('\n38) Listas de metas padrão: nunca duplicam:');
const dc2 = new Cloud(), d1 = new Phone({ tarefas: [], listas: [], tags: [], metas_listas: GL() }), d2 = new Phone({ tarefas: [], listas: [], tags: [], metas_listas: GL() });
d1.sync(dc2);
p = d2.sync(dc2);
ok(dc2.alive('metas_listas').length === 3 && d2.metas_listas.length === 3, 'dois aparelhos criaram as 3 padrão: continuam 3 (mesmos ids)');
const cc = new Cloud();
cc.insert('metas_listas', { id: 'gl_saude', name: 'Saúde', position: 1024, created_ms: 5 });
const novo = new Phone({ tarefas: [], listas: [], tags: [], metas_listas: GL() });
p = novo.sync(cc);
ok(p.droppedGoalLists === 3 && !cc.t.metas_listas.gl_pessoal && novo.metas_listas.map((l) => l.id).join() === 'gl_saude', 'conta que já tem listas de metas (só "Saúde"): as 3 padrão intactas do aparelho novo não sobem');
const cc2 = new Cloud();
cc2.insert('metas_listas', { id: 'gl_saude', name: 'Saúde', position: 1024, created_ms: 5 });
const comMeta = new Phone({ tarefas: [], listas: [], tags: [], metas_listas: GL(), metas: [clone(G1)] });
p = comMeta.sync(cc2);
ok(p.droppedGoalLists === 2 && cc2.t.metas_listas.gl_pessoal && cc2.t.metas.meta_1.list_id === 'gl_pessoal', 'a padrão que já tem meta sobe junto (só as vazias ficam de fora)');
const ja = new Cloud(), jp = new Phone({ tarefas: [], listas: [], tags: [] });
jp.sync(ja); // já sincronizava antes das metas (base sem metas)
ja.insert('metas_listas', { id: 'gl_pessoal', name: 'Pessoal', is_default: true, position: 1024, created_ms: 3 });
ja.insert('metas_listas', { id: 'gl_profissional', name: 'Profissional', is_default: true, position: 2048, created_ms: 3 });
ja.insert('metas_listas', { id: 'gl_financeiro', name: 'Financeiro', is_default: true, deleted: true, position: 3072, created_ms: 3 });
jp.metas_listas = GL();
p = jp.sync(ja);
ok(jp.metas_listas.map((l) => l.id).join() === 'gl_pessoal,gl_profissional' && ja.t.metas_listas.gl_financeiro.deleted === true, 'quem já sincronizava abre as Metas: a padrão apagada no PC continua apagada (vale a nuvem)');

console.log('\n39) Órfãos: lista apagada num lado, meta do outro; meta apagada leva os dias junto:');
mc.patch('metas_listas', 'gl_financeiro', { deleted: true });
mp.metas.find((g) => g.id === 'meta_3').title = 'Guardar dinheiro'; // o celular mexeu na meta da lista que o PC apagou
p = mp.sync(mc);
ok(mp.metas_listas.every((l) => l.id !== 'gl_financeiro') && mp.metas.find((g) => g.id === 'meta_3').listId === 'gl_pessoal' && mc.t.metas.meta_3.list_id === 'gl_pessoal' && mc.t.metas.meta_3.title === 'Guardar dinheiro', 'a meta foi pra primeira lista (Pessoal), com a edição, nos dois lados');
mc.patch('metas', 'meta_pc', { deleted: true });
mp.metas_dias.find((d) => d.id === 'meta_pc_20261116').amount = 30; // o celular marcou na meta que o PC apagou
p = mp.sync(mc);
ok(!mp.metas.some((g) => g.id === 'meta_pc') && !mp.metas_dias.some((d) => d.goalId === 'meta_pc') && mc.t.metas_dias.meta_pc_20261116.deleted === true, 'meta apagada no PC: some do celular e o dia dela é apagado junto (nos dois lados)');
mp.metas = mp.metas.filter((g) => g.id !== 'meta_1');
mp.metas_dias = mp.metas_dias.filter((d) => d.goalId !== 'meta_1');
p = mp.sync(mc);
ok(mc.t.metas.meta_1.deleted === true && mc.t.metas_dias.meta_1_20261116.deleted === true, 'meta apagada no celular: meta e dias viram "apagados" na nuvem');

console.log('\n40) Linhas estranhas ou maliciosas nas tabelas das metas são neutralizadas:');
mc.insert('metas', { id: 'meta_evil', list_id: "x');alert(1);('", title: null, emoji: '😀😀😀😀😀😀😀😀😀', period: 'ano', unit: 'kg', target: -5, step: 'abc', position: 5e9, created_ms: 'x' });
mc.insert('metas', { id: 'meta_proto', list_id: 'gl_pessoal', title: 'p', period: 'constructor', unit: '__proto__', target: 1, step: 1, position: 5e9 + 1 });
mc.insert('metas', { id: "m');alert(1);('", title: 'id ruim', period: 'dia', unit: 'vezes', target: 1, step: 1, position: 1 });
mc.insert('metas_dias', { id: 'dia_evil', goal_id: 'meta_2', date: '2026-02-30', amount: 1 });
mc.insert('metas_dias', { id: 'dia_evil2', goal_id: "a'b", date: '2026-11-16', amount: 1 });
mc.insert('metas_dias', { id: 'meta_2_20261117', goal_id: 'meta_2', date: '2026-11-17', amount: 5e12, target: 0 });
mc.insert('metas_dias', { id: 'meta_2_20261118', goal_id: 'meta_2', date: '2026-11-18', amount: -3, target: 'x' });
mc.insert('metas_listas', { id: 'gl_null', name: null, position: 9e9, created_ms: null });
crashed = false; try { p = mp.sync(mc); } catch (e) { crashed = e; }
ok(!crashed, 'não quebrou');
const evg = mp.metas.find((g) => g.id === 'meta_evil');
ok(evg && evg.listId === 'gl_pessoal' && evg.title === '' && evg.period === 'dia' && evg.unit === 'vezes' && evg.target === 1 && evg.step === 1, 'meta estranha: lista inválida → primeira lista; período, medida, alvo e passo inválidos → padrão');
ok(!mp.metas.some((g) => /alert/.test(g.id)) && !mp.metas_dias.some((d) => d.id === 'dia_evil' || d.id === 'dia_evil2'), 'meta com id malicioso, dia com data inexistente (30/02) e dia de meta com id ruim: ignorados');
const pr = mp.metas.find((g) => g.id === 'meta_proto');
ok(pr && pr.period === 'dia' && pr.unit === 'vezes' && CORE.MAP.metas.row({ id: 'x', period: 'toString', unit: 'hasOwnProperty' }).period === 'dia', 'período/medida com nome de coisa interna do JavaScript ("constructor", "__proto__") também vira o padrão');
const big = mp.metas_dias.find((d) => d.id === 'meta_2_20261117'), neg = mp.metas_dias.find((d) => d.id === 'meta_2_20261118');
ok(big && big.amount === 1e9 && !('target' in big) && neg && neg.amount === 0 && !('target' in neg), 'valor do dia limitado (0 a 1 bilhão) e alvo inválido descartado');
ok(mp.metas_listas.some((l) => l.id === 'gl_null' && l.name === ''), 'lista de metas com nome nulo vira nome vazio');
ok(CORE.MAP.metas_dias.row({ id: 'x', goalId: 'meta_1', date: '16/11/2026', amount: 1 }) === null && CORE.MAP.metas_dias.row({ id: 'x', goalId: "a b", date: '2026-11-16', amount: 1 }) === null, 'dia com data ou meta fora do formato fica só no aparelho');

console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
process.exit(fail ? 1 : 0);
