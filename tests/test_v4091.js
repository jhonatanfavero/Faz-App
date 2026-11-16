// V40.9.1 no app real (jsdom): listas afastadas, arrastar cartão entre listas e o sync desse movimento.
// A geometria de verdade (toque real, rolagem, tamanhos) é conferida no Chrome pelo shots4.js;
// aqui fica a lógica, com uma geometria falsa e previsível.
// Uso: TZ='America/Sao_Paulo' node test_v4091.js <repo> <backup.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(50); } return false; };

// Geometria falsa: área das listas de 340×600 em (0,60); listas de 150px a cada 158px;
// dentro da lista, cada filho visível ocupa 50px a partir de y=100 (o título fica acima).
function fakeGeometry(w) {
  const Z = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  w.Element.prototype.getBoundingClientRect = function () {
    if (this.id === 'backlog-columns-wrapper') return box(0, 60, 340, 600);
    const col = this.closest ? this.closest('#backlog-columns-wrapper > [data-column-id]') : null;
    if (!col) return Z;
    const left = 10 + [...col.parentNode.children].indexOf(col) * 158 - (col.parentNode.scrollLeft || 0);
    if (this === col) return box(left, 60, 150, 600);
    const child = [...col.children].find((ch) => ch === this || ch.contains(this));
    if (!child || child.classList.contains('zoom-col-head')) return box(left, 60, 150, 40);
    let y = 100;
    for (const ch of col.children) {
      if (ch === child) break;
      if (ch.classList.contains('zoom-col-head') || ch.classList.contains('bl-src-gone')) continue;
      y += 50;
    }
    return box(left + 6, y, 138, child.classList.contains('bl-src-gone') ? 0 : 44);
  };
}

(async () => {
  const A = await boot(REPO, backup.data), { w, server, L, $ } = A;
  server.addUser('j@t.com', 'senha123', UID);
  const doc = w.document, W = () => $('backlog-columns-wrapper');
  const cols = w.eval('backlogColumnsDb.map(c => c.id)');
  const names = w.eval('backlogColumnsDb.map(c => c.name)');
  const idsOf = (c) => w.eval(`backlogDb.filter(x => getItemColumn(x) === '${c}').map(x => x.id)`);
  const item = (id) => w.eval(`JSON.parse(JSON.stringify(backlogDb.find(x => x.id === '${id}') || null))`);
  const snapshot = () => w.eval("backlogDb.map(x => x.id + ':' + getItemColumn(x)).join('|')");
  const formOpen = () => !$('backlog-form-view').classList.contains('hidden');
  const card = (id) => doc.querySelector(`[data-bl-card="${id}"]`);
  const colEl = (c) => doc.querySelector(`#backlog-columns-wrapper > [data-column-id="${c}"]`);
  const fire = (target, type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); return e; };
  const X = (ci) => 10 + ci * 158 + 75, Y = (k) => 100 + k * 50; // centro da lista ci; topo do k-ésimo cartão
  fakeGeometry(w);
  w.openListSheet(); await sleep(120);
  if (cols.length < 3 || idsOf(cols[0]).length < 5 || idsOf(cols[1]).length < 4) { console.log('backup de teste precisa de 3 listas, com 5+ e 4+ cartões nas duas primeiras'); process.exit(2); }

  console.log('A) Afastar e aproximar:');
  ok(!W().classList.contains('lists-zoom') && !!$('backlog-zoom-btn') && !!$('backlog-zoom-btn').querySelector('.ph-magnifying-glass-minus'), 'começa no modo normal, com o botão de afastar');
  const normalHtml = W().innerHTML;
  w.toggleBacklogZoom(); await sleep(60);
  const heads = [...W().querySelectorAll('.zoom-col-head')];
  ok(W().classList.contains('lists-zoom') && L('tb__lista_afastada') === '1' && !!$('backlog-zoom-btn').querySelector('.ph-magnifying-glass-plus'), 'botão afasta as listas, guarda a escolha e vira "aproximar"');
  ok(heads.length === cols.length && heads.every((h, i) => h.querySelector('.truncate').textContent === names[i] && h.querySelector('.zoom-col-count').textContent === String(idsOf(cols[i]).length)), 'cada lista ganha um título com o nome e a quantidade de cartões');
  ok(W().innerHTML === normalHtml, 'os cartões são os mesmos do modo normal (só o visual muda)');
  card(idsOf(cols[0])[0]).click();
  ok(formOpen(), 'tocar num cartão continua abrindo ele');
  w.closeBacklogForm();
  heads[1].click();
  ok(w.eval('activeColumnId') === cols[1] && $('backlog-column-title').innerText === names[1] && colEl(cols[1]).classList.contains('zoom-active') && !colEl(cols[0]).classList.contains('zoom-active'), 'tocar no título de uma lista deixa ela ativa');
  w.openBacklogForm(); $('backlog-input').value = 'Tarefa criada afastado'; w.saveBacklogForm(); await sleep(60);
  const created = w.eval("backlogDb.find(x => x.title === 'Tarefa criada afastado')");
  ok(created && created.columnId === cols[1] && W().classList.contains('lists-zoom'), '"+ Nova Tarefa" entra na lista ativa e a tela continua afastada');
  w.setActiveColumnFromZoom('lista_que_nao_existe');
  ok(w.eval('activeColumnId') === cols[1], 'lista inexistente é ignorada');
  ok(!/lista_afastada/.test(JSON.stringify(w.collectFazData())), 'a preferência de tela não entra no backup');

  console.log('\nB) Mover cartão (regra):');
  w.eval(`backlogDb.find(x => x.id === '${idsOf(cols[0])[1]}').color = '#ec4899'; saveBacklog(); renderBacklog();`);
  const mv = idsOf(cols[0])[1], before0 = item(mv), tgt = idsOf(cols[1])[2];
  w.__toasts = [];
  w.moveBacklogCardTo(mv, cols[1], tgt);
  const c1 = idsOf(cols[1]), after0 = item(mv);
  ok(c1.indexOf(mv) === 2 && c1[3] === tgt && !idsOf(cols[0]).includes(mv), 'pra outra lista, antes do cartão escolhido: fica exatamente na frente dele');
  ok(after0.columnId === cols[1] && after0.color === '#ec4899' && after0.title === before0.title && after0.duration === before0.duration && JSON.stringify(after0.microblocks) === JSON.stringify(before0.microblocks) && after0.tagId === before0.tagId, 'só a lista muda: nome, duração, cor, tag e checklist vão junto');
  ok((w.__toasts || []).join() === `Movido pra ${names[1]}!` && JSON.parse(L('tb_backlog_db')).find((x) => x.id === mv).columnId === cols[1], 'avisa "Movido pra …" e grava no aparelho');
  w.moveBacklogCardTo(mv, cols[2], null);
  const c2 = idsOf(cols[2]);
  ok(c2[c2.length - 1] === mv, 'sem cartão de referência: entra no fim da lista');
  w.__toasts = [];
  const same = idsOf(cols[1]);
  w.moveBacklogCardTo(same[0], cols[1], same[3]);
  const same2 = idsOf(cols[1]);
  ok(same2.indexOf(same[0]) === 2 && same2[3] === same[3] && same2.length === same.length && (w.__toasts || []).length === 0, 'na mesma lista: reordena com precisão e não mostra aviso');
  const snap = snapshot();
  w.moveBacklogCardTo('nao_existe', cols[1], null); w.moveBacklogCardTo(mv, 'col_nao_existe', null); w.moveBacklogCardTo(mv, cols[2], mv);
  ok(snapshot() === snap, 'cartão ou lista inexistente (ou "antes dele mesmo") não muda nada');

  console.log('\nC) Arrastar com o dedo, listas afastadas:');
  const a0 = idsOf(cols[0]), b0 = idsOf(cols[1]);
  const src = card(a0[1]).querySelector('h4');
  fire(src, 'touchstart', [[X(0), Y(1) + 20]]); await sleep(460);
  ok(!!doc.querySelector('body > .bl-ghost') && card(a0[1]).classList.contains('bl-src') && !doc.querySelector('.zoom-slot'), 'segurar 0,4s: o cartão "sai" e acompanha o dedo; sem mover ainda não abre espaço');
  const mvEv = fire(src, 'touchmove', [[X(1), Y(2) + 5]]);
  const slot = doc.querySelector('.zoom-slot');
  ok(mvEv.defaultPrevented && !!slot && slot.parentNode === colEl(cols[1]) && slot.nextElementSibling === card(b0[2]) && card(a0[1]).classList.contains('bl-src-gone'), 'levar pra outra lista abre o espaço antes do cartão sob o dedo; o original some da lista de origem');
  ok(doc.querySelector('.bl-ghost').style.left !== '' && !doc.querySelector('.bl-ghost').hasAttribute('data-bl-card') && !doc.querySelector('.bl-ghost').hasAttribute('onclick'), 'o cartão flutuante é só visual (não é clicável nem conta como cartão)');
  fire(src, 'touchmove', [[X(1), Y(40)]]);
  ok(doc.querySelector('.zoom-slot').parentNode === colEl(cols[1]) && colEl(cols[1]).lastElementChild === doc.querySelector('.zoom-slot'), 'abaixo do último cartão: espaço no fim da lista');
  fire(src, 'touchmove', [[X(0), Y(1) + 20]]);
  ok(!doc.querySelector('.zoom-slot') && !card(a0[1]).classList.contains('bl-src-gone'), 'voltar pro lugar de origem fecha o espaço e o cartão reaparece');
  fire(src, 'touchmove', [[X(1), Y(2) + 5]]);
  w.__toasts = [];
  fire(src, 'touchend', []); await sleep(40);
  const b1 = idsOf(cols[1]);
  ok(b1.indexOf(a0[1]) === 2 && b1[3] === b0[2] && !doc.querySelector('.bl-ghost') && !doc.querySelector('.zoom-slot') && w.eval('_dragState === null'), 'soltar: o cartão cai exatamente onde o espaço estava e a tela fica limpa');
  ok((w.__toasts || []).join() === `Movido pra ${names[1]}!`, 'aviso "Movido pra …"');
  card(a0[1]).click();
  ok(!formOpen(), 'o clique que sobra do arrasto não abre o cartão');
  card(a0[1]).click();
  ok(formOpen(), 'o toque seguinte abre normalmente');
  w.closeBacklogForm(); await sleep(40);

  const snapC = snapshot(), a1 = idsOf(cols[0]);
  const src2 = card(a1[0]).querySelector('h4');
  fire(src2, 'touchstart', [[X(0), Y(0) + 20]]); await sleep(460);
  fire(src2, 'touchmove', [[X(1), Y(1) + 5]]);
  const hadSlot = !!doc.querySelector('.zoom-slot');
  fire(src2, 'touchcancel', []); await sleep(40);
  ok(hadSlot && snapshot() === snapC && !doc.querySelector('.bl-ghost') && !doc.querySelector('.zoom-slot') && !doc.querySelector('.bl-src, .bl-src-gone'), 'toque cancelado pelo sistema não move nada e limpa a tela');

  fire(src2, 'touchstart', [[X(0), Y(0) + 20]]); await sleep(460);
  fire(src2, 'touchmove', [[X(1), Y(1) + 5]]);
  w.renderBacklog(); await sleep(80);
  ok(!doc.querySelector('.bl-ghost') && w.eval('_dragState === null') && snapshot() === snapC, 'se a tela for redesenhada no meio do arrasto, ele é encerrado sem mover nada (nada fica "preso")');

  const src3 = card(a1[0]).querySelector('h4');
  fire(src3, 'touchstart', [[X(0), Y(0) + 20]]); await sleep(120);
  fire(src3, 'touchmove', [[X(0) + 30, Y(0) + 20]]); await sleep(420);
  ok(!doc.querySelector('.bl-ghost') && w.eval('_dragState === null'), 'mexer o dedo antes de 0,4s é rolagem comum: não começa arrasto');
  fire(src3, 'touchend', []);

  console.log('\nD) Pinça com dois dedos:');
  fire(W(), 'touchstart', [[100, 300], [200, 300]]);
  fire(W(), 'touchmove', [[60, 300], [240, 300]]); await sleep(40);
  ok(!W().classList.contains('lists-zoom') && L('tb__lista_afastada') === '0', 'abrir os dedos aproxima (uma lista por vez)');
  fire(W(), 'touchmove', [[130, 300], [170, 300]]); await sleep(40);
  ok(!W().classList.contains('lists-zoom'), 'uma troca por gesto: continuar mexendo os dedos não fica alternando');
  fire(W(), 'touchend', []);
  fire(W(), 'touchstart', [[60, 300], [240, 300]]);
  fire(W(), 'touchmove', [[80, 300], [220, 300]]);
  ok(!W().classList.contains('lists-zoom'), 'pinça pequena (menos de 25%) não faz nada');
  fire(W(), 'touchmove', [[120, 300], [180, 300]]); await sleep(40);
  ok(W().classList.contains('lists-zoom') && L('tb__lista_afastada') === '1', 'fechar os dedos afasta (várias listas)');
  fire(W(), 'touchend', []);
  const h4 = card(idsOf(cols[0])[0]).querySelector('h4');
  fire(h4, 'touchstart', [[X(0), Y(0) + 20]]);
  fire(h4, 'touchstart', [[X(0), Y(0) + 20], [X(1), Y(0) + 20]]); await sleep(460);
  ok(!doc.querySelector('.bl-ghost') && w.eval('_dragState === null'), 'segundo dedo na tela cancela o arrasto que ia começar');
  fire(h4, 'touchend', []);

  console.log('\nE) Modo normal continua como era:');
  w.toggleBacklogZoom(); await sleep(60);
  const n0 = idsOf(cols[0]);
  const s4 = card(n0[0]).querySelector('h4');
  fire(s4, 'touchstart', [[X(0), Y(0) + 20]]); await sleep(460);
  fire(s4, 'touchmove', [[X(0), Y(2) + 20]]);
  ok(!doc.querySelector('.bl-ghost') && !doc.querySelector('.zoom-slot') && card(n0[2]).classList.contains('ring-2') && card(n0[0]).classList.contains('opacity-60'), 'arrasto dentro da lista: destaca o cartão alvo, sem cartão flutuante');
  fire(s4, 'touchmove', [[X(1), Y(1) + 20]]);
  ok(card(n0[1]).classList.contains('ring-2') && !card(n0[2]).classList.contains('ring-2'), 'no modo normal o dedo nunca "troca de lista" (só a posição vertical conta)');
  fire(s4, 'touchmove', [[X(0), Y(2) + 20]]);
  fire(s4, 'touchend', []); await sleep(40);
  const n1 = idsOf(cols[0]);
  ok(n1.indexOf(n0[0]) === 2 && n1.length === n0.length && n1.slice(0, 2).join() === n0.slice(1, 3).join(), 'soltar reordena como sempre (1º cartão vai pra 3ª posição)');
  const snapN = snapshot(), s5 = card(n1[0]).querySelector('h4');
  fire(s5, 'touchstart', [[X(0), Y(0) + 20]]); await sleep(460);
  fire(s5, 'touchmove', [[X(0), Y(2) + 20]]);
  fire(s5, 'touchcancel', []); await sleep(40);
  ok(snapshot() === snapN && !doc.querySelector('[data-bl-card].ring-2') && !doc.querySelector('[data-bl-card].opacity-60'), 'toque cancelado também não reordena no modo normal');

  console.log('\nF) Sincronização do movimento:');
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); };
  await syncDone(); await sleep(200);
  w.toggleBacklogZoom(); await sleep(60);
  const m0 = idsOf(cols[0])[3], dest = idsOf(cols[1])[1], rowBefore = { ...server.get('tarefas', UID, m0) };
  server.log.length = 0;
  w.moveBacklogCardTo(m0, cols[1], dest);
  await waitFor(() => server.log.some((l) => l.op === 'upsert' && l.t === 'tarefas'), 9000); await sleep(300);
  const ups = server.log.filter((l) => l.op === 'upsert');
  const rowAfter = server.get('tarefas', UID, m0), rowDest = server.get('tarefas', UID, dest), prevId = idsOf(cols[1])[idsOf(cols[1]).indexOf(m0) - 1];
  ok(ups.length === 1 && ups[0].t === 'tarefas' && ups[0].n === 1 && ups[0].ids[0] === m0, 'mover um cartão sobe 1 linha só pra nuvem (o próprio cartão)');
  ok(rowAfter.column_id === cols[1] && rowAfter.position < rowDest.position && (!prevId || server.get('tarefas', UID, prevId).position < rowAfter.position) && rowAfter.title === rowBefore.title, 'na nuvem: lista nova e posição entre os dois vizinhos');
  server.patch('tarefas', UID, m0, { column_id: cols[0], position: server.get('tarefas', UID, idsOf(cols[0])[0]).position - 1 });
  await syncDone(); // o celular não escuta em tempo real: sincroniza ao abrir, ao mexer e a cada minuto
  ok(idsOf(cols[0])[0] === m0 && W().classList.contains('lists-zoom') && card(m0).closest('[data-column-id]').dataset.columnId === cols[0], 'movimento feito no PC chega no celular (e a tela continua afastada)');
  ok(!/afastada/.test(JSON.stringify([...server.users.values()].map((u) => u.meta))) && !/afastada/.test(L('tb__sync')), 'a preferência de tela não vai pra nuvem');

  console.log('\nG) Abrir o app já afastado:');
  const B = await boot(REPO, { ...backup.data, tb__lista_afastada: '1' });
  B.w.openListSheet(); await sleep(120);
  ok(B.$('backlog-columns-wrapper').classList.contains('lists-zoom') && !!B.$('backlog-zoom-btn').querySelector('.ph-magnifying-glass-plus') && B.$('backlog-columns-wrapper').querySelectorAll('.zoom-col-head').length === cols.length, 'a escolha guardada vale desde o primeiro desenho');
  ok(B.L('tb_backlog_db') === backup.data.tb_backlog_db && B.L('tb_backlog_columns') === backup.data.tb_backlog_columns, 'abrir afastado não mexe nos dados');

  const errs = [...A.errors, ...B.errors];
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====` + (errs.length ? '\nERROS DE PÁGINA: ' + errs.slice(0, 3).join(' | ').slice(0, 600) : ''));
  try { w.close(); B.w.close(); } catch (e) {}
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
