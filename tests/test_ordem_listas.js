// V40.33.0: mudar a ORDEM DAS LISTAS — no celular (segurando o nome e arrastando, no afastado e no modo normal, e
// pelo menu dos 3 pontinhos) e no PC (arrastando pelo título e pelo menu), com o Desfazer e a nuvem nos 2 sentidos.
// A geometria de verdade (dedo e mouse de verdade) fica no Chrome: toque_listas.js (P) e tela_pc.js (W).
// Aqui fica a lógica, com uma geometria falsa e previsível.
// Uso: TZ='America/Sao_Paulo' node test_ordem_listas.js <repo> <backup.json>
const fs = require('fs'), path = require('path'), boot = require('./boot_app');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), UID = '11111111-2222-3333-4444-555555555555';
const CORE = require(path.resolve(REPO, 'sync.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const waitFor = async (fn, ms = 9000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; };
const box = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
const Z = box(0, 0, 0, 0);

// Celular: quadro de 800×600 em (0,60). Afastado: listas de 150px com vão de 8px a partir de x=10 (o espaço tracejado
// tem a largura que o app der; a lista que "saiu" não ocupa nada). Normal: 340px cada. O nome lá em cima fica em (16,20).
function fakePhone(w) {
  const layout = (wr) => {
    const zoom = wr.classList.contains('lists-zoom'), out = new Map();
    let x = zoom ? 10 : 0;
    for (const ch of wr.children) {
      const gone = ch.classList.contains('bl-col-src-gone');
      const wd = ch.classList.contains('zoom-col-slot') ? (parseFloat(ch.style.width) || 150) : gone ? 0 : zoom ? 150 : 340;
      out.set(ch, { left: x - (wr.scrollLeft || 0), width: wd });
      x += wd + (zoom && !gone ? 8 : 0);
    }
    return out;
  };
  // a rolagem do quadro para no começo, como no navegador (o jsdom deixaria ficar negativa)
  let sl = 0;
  Object.defineProperty(w.document.getElementById('backlog-columns-wrapper'), 'scrollLeft', { get: () => sl, set: (v) => { sl = Math.max(0, Number(v) || 0); }, configurable: true });
  w.Element.prototype.getBoundingClientRect = function () {
    if (this.id === 'backlog-columns-wrapper') return box(0, 60, 800, 600);
    if (this.closest && this.closest('#backlog-column-head')) return box(16, 20, 150, 28);
    const wr = this.closest && this.closest('#backlog-columns-wrapper');
    if (!wr) return Z;
    const top = [...wr.children].find((ch) => ch === this || ch.contains(this));
    if (!top) return Z;
    const L = layout(wr).get(top);
    if (this === top) return box(L.left, 60, L.width, 400);
    if (this.closest('.zoom-col-head')) return box(L.left, 60, L.width, 30);
    return box(L.left + 6, 100, Math.max(0, L.width - 12), 44);
  };
}

(async () => {
  // ======================================================================================================
  // CELULAR
  // ======================================================================================================
  const A = await boot(REPO, backup.data), { w, server, L, $ } = A;
  server.addUser('j@t.com', 'senha123', UID);
  const doc = w.document, W = () => $('backlog-columns-wrapper');
  const order = () => w.eval('backlogColumnsDb.map(c => c.id)');
  const saved = () => JSON.parse(L('tb_backlog_columns')).map((c) => c.id);
  const name = (id) => w.eval(`(backlogColumnsDb.find(c => c.id === '${id}') || {}).name`);
  const head = (id) => doc.querySelector(`#backlog-columns-wrapper > [data-column-id="${id}"] .zoom-col-head`);
  const fire = (target, type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); return e; };
  const X = (i) => 10 + i * 158 + 75; // meio da i-ésima lista no afastado (sem rolar)
  const clean = () => !doc.querySelector('.bl-col-ghost') && !doc.querySelector('.zoom-col-slot') && !doc.querySelector('.bl-col-src, .bl-col-src-gone') && w.eval('colDrag === null');
  const undoLbl = () => $('undo-bar-msg') ? $('undo-bar-msg').textContent : '';
  fakePhone(w);
  w.openListSheet(); await sleep(150);
  const C0 = order();
  ok(C0.length === 5 && C0[0] === 'col_geral', 'começa com as 5 listas dos dados de teste (Geral primeiro)');

  console.log('\nA) Pelo menu dos 3 pontinhos (uma casa por toque):');
  w.scrollToColumn(C0[0]); await sleep(30);
  w.openColumnMenuFromHeader(); await sleep(20);
  const pos = () => $('column-menu-pos').textContent, dis = (id) => $(id).disabled;
  ok(pos() === 'Posição 1 de 5' && dis('column-menu-left') && !dis('column-menu-right') && !$('column-menu-move').classList.contains('hidden'), 'menu da 1ª lista: "Posição 1 de 5", Esquerda apagada e Direita valendo');
  ok(/segure o nome da lista/.test($('column-menu-move').textContent), 'o menu conta que dá pra arrastar segurando o nome');
  w.moveActiveColumn(-1); await sleep(20);
  ok(order().join() === C0.join(), 'Esquerda na 1ª lista não faz nada');
  $('column-menu-right').click(); await sleep(30);
  let o1 = order();
  ok(o1.join() === [C0[1], C0[0], C0[2], C0[3], C0[4]].join() && saved().join() === o1.join(), 'Direita: a lista troca de lugar com a vizinha (e fica gravada)');
  ok(w.eval('activeColumnId') === C0[0] && $('backlog-column-title').innerText === name(C0[0]), 'a lista ativa continua a mesma (o nome lá em cima não muda)');
  ok(!$('column-menu-modal').classList.contains('hidden') && pos() === 'Posição 2 de 5' && !dis('column-menu-left') && !dis('column-menu-right'), 'o menu fica aberto, já com "Posição 2 de 5" e as duas setas valendo');
  ok([...$('backlog-column-dots').children].map((b) => b.getAttribute('aria-label')).join() === o1.map((id) => 'Ir para ' + name(id)).join() && $('backlog-column-dots').children[1].className.includes('bg-app-focus'), 'as bolinhas seguem a ordem nova (a acesa é a 2ª)');
  await sleep(30);
  ok($('undo-bar').classList.contains('hidden'), 'com o menu aberto a barrinha do Desfazer não aparece por cima do fundo escuro');
  for (let i = 0; i < 3; i++) { $('column-menu-right').click(); await sleep(20); }
  ok(order()[4] === C0[0] && pos() === 'Posição 5 de 5' && dis('column-menu-right') && !dis('column-menu-left'), 'Direita até o fim: última posição, Direita apagada');
  $('column-menu-left').click(); await sleep(30);
  ok(order()[3] === C0[0] && pos() === 'Posição 4 de 5', 'Esquerda volta uma casa');
  w.closeColumnMenu(); await sleep(20);
  ok($('column-menu-modal').classList.contains('hidden') && /Fechar/.test($('column-menu-modal').querySelector('[data-voltar]').textContent), 'o botão de baixo agora se chama "Fechar" (as setas já valem na hora)');
  ok(!$('undo-bar').classList.contains('hidden') && undoLbl() === 'Lista mudou de lugar', 'fechou o menu: a barrinha mostra "Lista mudou de lugar"');
  w.fazUndo(); await sleep(60);
  ok(order()[4] === C0[0] && saved()[4] === C0[0], 'Desfazer volta o último toque (a lista volta pra última)');
  w.openColumnMenuFromHeader(); w.closeColumnMenu(); await sleep(20);
  ok(/^Desfeito/.test(undoLbl()), 'abrir e fechar o menu sem mexer não mostra a barrinha de novo');
  // volta à ordem original pros próximos testes
  w.eval(`backlogColumnsDb.sort((a, b) => ${JSON.stringify(C0)}.indexOf(a.id) - ${JSON.stringify(C0)}.indexOf(b.id)); saveBacklogColumns(); renderBacklog();`); await sleep(40);
  ok(order().join() === C0.join(), '(ordem original de volta)');

  console.log('\nB) Afastado: segurar o título de uma lista e arrastar pro lado:');
  w.setBacklogZoom(2); await sleep(60);
  const prefs0 = [L('tb__lista_afastada'), L('tb__lista_zoom')].join();
  const h0 = head(C0[0]);
  fire(h0, 'touchstart', [[X(0), 75]]); await sleep(150);
  ok(w.eval('colDrag === null') && !doc.querySelector('.bl-col-ghost'), 'antes dos 400 ms nada acontece');
  await sleep(320);
  const g = doc.querySelector('.bl-col-ghost');
  ok(!!g && g.classList.contains('lists-zoom') && !!g.querySelector('[data-column-id=""] .zoom-col-head') && W().querySelector(`[data-column-id="${C0[0]}"]`).classList.contains('bl-col-src'), 'segurou: a cópia da lista aparece (com o título) e a de origem fica apagada');
  ok(!doc.querySelector(`.bl-col-ghost [data-bl-card="${w.eval('backlogDb[0].id')}"]`) && !g.querySelector('[onclick]') && !g.querySelector('[id]'), 'a cópia não tem id de lista nem de cartão (quem procura pelo id acha só o do quadro)');
  fire(h0, 'touchmove', [[X(2) + 10, 80]]); await sleep(30);
  const mid = w.eval('({ before: colDrag && colDrag.beforeId, has: colDrag && colDrag.hasTarget })');
  const slot = doc.querySelector('#backlog-columns-wrapper > .zoom-col-slot');
  ok(mid.has && mid.before === C0[3] && !!slot && slot.nextElementSibling.dataset.columnId === C0[3] && W().querySelector(`[data-column-id="${C0[0]}"]`).classList.contains('bl-col-src-gone'), 'arrastou duas listas pra direita: o espaço tracejado abre antes da 4ª e a de origem "sai"');
  ok(parseFloat(g.style.top) === 54 && parseFloat(g.style.left) === 10 + (X(2) + 10 - X(0)), 'a cópia anda só na horizontal, junto com o dedo (e um pouco levantada)');
  const e1 = fire(h0, 'touchmove', [[X(2) + 12, 300]]);
  ok(e1.defaultPrevented, 'durante o arrasto o dedo não rola o quadro nem a lista');
  fire(h0, 'touchend', []); await sleep(40);
  const o2 = order();
  ok(o2.join() === [C0[1], C0[2], C0[0], C0[3], C0[4]].join() && saved().join() === o2.join(), 'soltou: a lista foi pro lugar do espaço (3ª) e ficou gravada');
  ok(clean(), 'soltou: sem cópia, sem espaço, sem lista apagada');
  ok(w.eval('activeColumnId') === C0[0] && W().classList.contains('lists-zoom') && [L('tb__lista_afastada'), L('tb__lista_zoom')].join() === prefs0, 'a lista que mudou fica ativa; o zoom continua o mesmo (e a escolha guardada não muda)');
  ok(W().children[2].dataset.columnId === C0[0] && W().children[2].classList.contains('zoom-active'), 'o quadro já mostra a ordem nova (com a borda na lista movida)');
  await sleep(30);
  ok(undoLbl() === 'Lista mudou de lugar', 'Desfazer: "Lista mudou de lugar"');
  w.fazUndo(); await sleep(60);
  ok(order().join() === C0.join() && saved().join() === C0.join(), 'Desfazer devolve a ordem de antes');
  w.fazRedo(); await sleep(60);
  ok(order().join() === o2.join(), 'Refazer refaz');
  w.fazUndo(); await sleep(60);

  console.log('\nC) Afastado: casos que não mudam nada:');
  const h1 = head(C0[1]), before = order().join();
  fire(h1, 'touchstart', [[X(1), 75]]); await sleep(470);
  fire(h1, 'touchmove', [[X(1) + 30, 80]]); await sleep(20);
  ok(!w.eval('colDrag.hasTarget') && !doc.querySelector('.zoom-col-slot') && W().querySelector(`[data-column-id="${C0[1]}"]`).classList.contains('bl-col-src') && !W().querySelector('.bl-col-src-gone'), 'mexeu pouco (ainda no lugar dela): sem espaço, a lista fica onde está');
  fire(h1, 'touchend', []); await sleep(40);
  ok(order().join() === before && clean(), 'soltou no mesmo lugar: nada muda');
  fire(h1, 'touchstart', [[X(1), 75]]); await sleep(470);
  fire(h1, 'touchmove', [[X(3) + 20, 80]]); await sleep(20);
  fire(h1, 'touchcancel', []); await sleep(40);
  ok(order().join() === before && clean(), 'toque cancelado pelo sistema: não move nada');
  fire(h1, 'touchstart', [[X(1), 75]]); await sleep(100);
  fire(h1, 'touchmove', [[X(1) + 40, 75]]); await sleep(420);
  ok(w.eval('colDrag === null') && !doc.querySelector('.bl-col-ghost'), 'mexeu o dedo antes dos 400 ms (está rolando o quadro): não começa');
  fire(h1, 'touchend', []); await sleep(20);
  fire(h1, 'touchstart', [[X(1), 75]]); await sleep(470);
  fire(h1, 'touchmove', [[X(3) + 20, 80]]); await sleep(20);
  w.renderBacklog(); await sleep(60); // como se a nuvem tivesse trazido uma mudança no meio
  ok(order().join() === before && clean(), 'o quadro redesenhou no meio (veio da nuvem): solta sem mover, sem sobrar nada na tela');
  fire(h1, 'touchend', []); await sleep(30);
  ok(order().join() === before, 'e o dedo saindo depois não move nada');
  fire(h1, 'touchstart', [[X(1), 75]]); await sleep(470);
  w.setBacklogZoom(3); await sleep(60);
  ok(clean() && order().join() === before, 'trocar o zoom no meio solta sem mover');
  fire(doc.body, 'touchend', []); await sleep(20);
  w.setBacklogZoom(2); await sleep(40);
  const h2 = head(C0[2]); let clickedOpen = false;
  fire(h2, 'touchstart', [[X(2), 75]]); await sleep(470);
  fire(h2, 'touchend', []); await sleep(20);
  const ck = new w.MouseEvent('click', { bubbles: true, cancelable: true }); h2.dispatchEvent(ck); clickedOpen = !ck.defaultPrevented;
  ok(!clickedOpen && w.eval('activeColumnId') === C0[2], 'o "clique" que sobra ao soltar é engolido (e a lista segurada já ficou ativa)');

  console.log('\nD) Modo normal: segurar o nome lá em cima (o quadro se afasta só durante o arrasto):');
  w.setBacklogZoom(1); await sleep(60);
  const prefs1 = [L('tb__lista_afastada'), L('tb__lista_zoom')].join();
  w.scrollToColumn(C0[1]); await sleep(40);
  const hd = $('backlog-column-head');
  fire(hd, 'touchstart', [[90, 34]]); await sleep(470); await sleep(40);
  ok(W().classList.contains('lists-zoom') && W().classList.contains('zoom-3') && !!doc.querySelector('.bl-col-ghost.zoom-3') && W().querySelector(`[data-column-id="${C0[1]}"]`).classList.contains('bl-col-src'), 'segurou o nome: o quadro se afasta (3 por tela) e a lista ativa sai');
  ok([L('tb__lista_afastada'), L('tb__lista_zoom')].join() === prefs1, 'sem gravar a escolha do zoom');
  const gl0 = parseFloat(doc.querySelector('.bl-col-ghost').style.left);
  fire(hd, 'touchmove', [[90 + 330, 40]]); await sleep(30);
  const tgt = w.eval('colDrag.beforeId');
  ok(parseFloat(doc.querySelector('.bl-col-ghost').style.left) === gl0 + 330 && w.eval('colDrag.hasTarget'), 'a cópia anda o mesmo tanto que o dedo, a partir de onde a lista estava');
  fire(hd, 'touchend', []); await sleep(60);
  const o3 = order(), exp3 = C0.filter((c) => c !== C0[1]); exp3.splice(tgt ? exp3.indexOf(tgt) : exp3.length, 0, C0[1]);
  ok(o3.join() === exp3.join() && o3.indexOf(C0[1]) > 1, `soltou: a lista foi pra ${o3.indexOf(C0[1]) + 1}ª posição (onde estava o espaço)`);
  ok(!W().classList.contains('lists-zoom') && !W().classList.contains('zoom-3') && clean() && [L('tb__lista_afastada'), L('tb__lista_zoom')].join() === prefs1, 'o quadro volta pro modo normal, sem sobrar nada');
  ok(w.eval('activeColumnId') === C0[1] && $('backlog-column-title').innerText === name(C0[1]) && $('backlog-column-dots').children[o3.indexOf(C0[1])].className.includes('bg-app-focus'), 'continua na mesma lista (nome lá em cima) e a bolinha acesa foi junto pro lugar novo');
  w.fazUndo(); await sleep(60);
  ok(order().join() === C0.join(), 'Desfazer devolve');
  fire(hd, 'touchstart', [[90, 34]]); await sleep(520);
  fire(hd, 'touchmove', [[400, 40]]); await sleep(20);
  fire(hd, 'touchcancel', []); await sleep(60);
  ok(order().join() === C0.join() && !W().classList.contains('lists-zoom') && clean(), 'cancelado no modo normal: nada muda e o quadro volta ao normal');
  fire(hd, 'touchstart', [[90, 34]]); await sleep(520);
  w.renderBacklog(); await sleep(60);
  ok(order().join() === C0.join() && !W().classList.contains('lists-zoom') && clean(), 'redesenho no meio (nuvem) no modo normal: solta sem mover e volta ao normal');
  fire(hd, 'touchend', []); await sleep(20);
  fire(hd, 'touchstart', [[90, 34]]); await sleep(60); fire(hd, 'touchend', []); await sleep(450);
  ok(w.eval('colDrag === null') && !W().classList.contains('lists-zoom'), 'toque rápido no nome não faz nada');

  console.log('\nE) Com o mouse (o app aberto num computador):');
  w.setBacklogZoom(2); await sleep(60);
  const mh = head(C0[4]);
  const sl0 = W().scrollLeft;
  mh.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: X(4), clientY: 75 })); await sleep(470);
  doc.dispatchEvent(new w.MouseEvent('mousemove', { bubbles: true, clientX: 20, clientY: 75 })); await sleep(30);
  const sl1 = W().scrollLeft;
  await sleep(sl0 / 7 * 16 + 300); // perto da borda o quadro rola sozinho (7px a cada 16ms) até o começo
  ok(sl0 > 0 && sl1 < sl0 && W().scrollLeft === 0 && w.eval('colDrag.beforeId') === C0[0], `mouse parado na borda esquerda: o quadro rola sozinho (${sl0} → 0px) e o espaço vai pro começo`);
  doc.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, clientX: 20, clientY: 75 })); await sleep(40);
  ok(order()[0] === C0[4] && clean(), 'soltou: a última lista virou a primeira (segurando o título com o mouse)');
  w.fazUndo(); await sleep(60);
  ok(order().join() === C0.join(), '(desfeito)');

  console.log('\nF) Uma lista só, e o núcleo da troca:');
  ok(w.eval(`moveBacklogColumn('${C0[0]}', '${C0[1]}')`) === false && w.eval(`moveBacklogColumn('${C0[4]}', null)`) === false && w.eval(`moveBacklogColumn('nao_existe', null)`) === false && w.eval(`moveBacklogColumn('${C0[0]}', 'nao_existe')`) === false && order().join() === C0.join(), 'mover pro mesmo lugar, lista que não existe ou destino que não existe: não muda nada');
  const S1 = await boot(REPO, { ...backup.data, tb_backlog_columns: JSON.stringify([JSON.parse(backup.data.tb_backlog_columns)[0]]) });
  fakePhone(S1.w); S1.w.openListSheet(); await sleep(120); S1.w.openColumnMenuFromHeader(); await sleep(20);
  ok(S1.$('column-menu-move').classList.contains('hidden') && S1.$('column-menu-pos').textContent === '', 'uma lista só: o menu não mostra as setas nem a posição');
  const sh = S1.$('backlog-column-head'), sf = (t, type, pts) => { const e = new S1.w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); t.dispatchEvent(e); };
  S1.w.closeColumnMenu(); sf(sh, 'touchstart', [[90, 34]]); await sleep(500);
  ok(S1.w.eval('colDrag === null') && !S1.w.document.querySelector('.bl-col-ghost') && !S1.$('backlog-columns-wrapper').classList.contains('lists-zoom'), 'uma lista só: segurar o nome não faz nada');
  sf(sh, 'touchend', []);
  try { S1.w.close(); } catch (e) {}

  console.log('\nG) Nuvem: a ordem nova sobe só com a lista que mudou, e a do PC chega no celular:');
  w.setBacklogZoom(1); await sleep(40);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'));
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st); await sleep(150); };
  await syncDone(); w.openListSheet(); await sleep(100);
  const posOf = (id) => server.get('listas', UID, id).position;
  const cloudOrder = () => [...server.tables.listas.values()].filter((r) => r.user_id === UID && !r.deleted).sort((a, b) => a.position - b.position).map((r) => r.id);
  ok(cloudOrder().join() === C0.join(), 'nuvem com a mesma ordem do celular');
  const p0 = Object.fromEntries(C0.map((id) => [id, posOf(id)]));
  server.log.length = 0;
  w.scrollToColumn(C0[3]); await sleep(30);
  w.openColumnMenuFromHeader(); $('column-menu-left').click(); $('column-menu-left').click(); w.closeColumnMenu();
  await waitFor(() => server.log.some((l) => l.op === 'upsert' && l.t === 'listas'), 9000); await sleep(300);
  const ups = server.log.filter((l) => l.op === 'upsert');
  ok(ups.length === 1 && ups[0].t === 'listas' && ups[0].n === 1 && ups[0].ids[0] === C0[3], 'mudar a lista de lugar sobe 1 linha só (a própria lista)');
  ok(posOf(C0[3]) > p0[C0[0]] && posOf(C0[3]) < p0[C0[1]] && C0.filter((c) => c !== C0[3]).every((c) => posOf(c) === p0[c]), 'na nuvem: posição nova entre as duas vizinhas; as outras ficam como estavam');
  ok(cloudOrder().join() === order().join(), 'a ordem da nuvem é a do celular');
  // o PC muda a ordem (grava a posição): no próximo sync o celular acompanha
  server.patch('listas', UID, C0[4], { position: posOf(C0[0]) - 1000 });
  await syncDone();
  ok(order()[0] === C0[4] && order().join() === cloudOrder().join(), 'lista movida no PC (pra primeira) chega no celular na ordem certa');
  ok(W().children[0].dataset.columnId === C0[4] && [...$('backlog-column-dots').children].length === 5, 'e o quadro do celular já mostra assim');
  // sync no meio do arrasto de uma lista: espera o dedo soltar (não interrompe o arrasto)
  w.setBacklogZoom(2); await sleep(60); w.eval('document.getElementById("backlog-columns-wrapper").scrollLeft = 0'); w.renderBacklog(); await sleep(40);
  const o5 = order(), hz = head(o5[1]);
  fire(hz, 'touchstart', [[X(1), 75]]); await sleep(470);
  fire(hz, 'touchmove', [[X(3) + 20, 80]]); await sleep(20);
  server.patch('listas', UID, o5[0], { name: 'Nome novo no PC' });
  const stS = L('tb__sync'); w.fazSyncNow(); await sleep(400);
  ok(w.eval('colDrag !== null') && !!doc.querySelector('.bl-col-ghost') && name(o5[0]) !== 'Nome novo no PC' && L('tb__sync') === stS, 'sincronizar no meio do arrasto de uma lista espera: o arrasto continua e nada muda embaixo do dedo');
  fire(hz, 'touchend', []); await sleep(40);
  ok(order().indexOf(o5[1]) > 1, 'soltou: a lista mudou de lugar normalmente');
  await syncDone();
  ok(name(o5[0]) === 'Nome novo no PC' && cloudOrder().join() === order().join(), 'e no sync seguinte chega o que o PC mudou, com a ordem nova do celular na nuvem');

  // ======================================================================================================
  // PC (kanban.html)
  // ======================================================================================================
  const srv = makeServer();
  srv.addUser('pessoa@teste.com', 'senha123', UID);
  const J = (k) => JSON.parse(backup.data[k]);
  const plan = CORE.plan({ local: { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db') }, base: null, remote: {}, firstSync: true });
  for (const k of CORE.KINDS) for (const r of plan.push[k]) srv.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++srv.clock });
  srv.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime();
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      pw.supabase = { createClient: makeCreateClient(srv) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const P = dom.window, d = P.document, $$ = (id) => d.getElementById(id);
  // listas de 296px a cada 312px (vão de 16px) a partir de x=20; quadro de 1400px em (0,100)
  P.Element.prototype.getBoundingClientRect = function () {
    if (this.id === 'board') return box(0, 100, 1400, 700);
    const sec = this.closest && this.closest('#columns > section.col');
    if (!sec) return Z;
    const i = [...d.querySelectorAll('#columns > section.col')].indexOf(sec), left = 20 + i * 312 - ($$('board').scrollLeft || 0);
    return this === sec ? box(left, 120, 296, 500) : box(left, 120, 296, 44);
  };
  const click = (el) => el.dispatchEvent(new P.MouseEvent('click', { bubbles: true }));
  const press = (el, k, o) => { const e = new P.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const dt = { setData() {}, setDragImage(el, x, y) { dt.img = { el, x, y, inBody: d.body.contains(el) }; }, effectAllowed: '', dropEffect: '' };
  const dragEv = (type, el, x = 10, y = 130) => { const e = new P.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(e, 'dataTransfer', { value: dt }); Object.defineProperty(e, 'clientX', { value: x }); Object.defineProperty(e, 'clientY', { value: y }); el.dispatchEvent(e); return e; };
  const pcCols = () => [...d.querySelectorAll('#columns > section.col')];
  const pcNames = () => pcCols().map((s) => s.querySelector('h2').textContent).join(',');
  const headOf = (n) => pcCols().find((s) => s.querySelector('h2').textContent === n).querySelector('header');
  const NM = Object.fromEntries(J('tb_backlog_columns').map((c) => [c.name, c.id]));
  const rowPos = (n) => srv.get('listas', UID, NM[n]).position;
  const lw = () => srv.log.filter((l) => l.op === 'update' && l.t === 'listas');
  const settle = () => sleep(150);
  const CX = (i) => 20 + i * 312 + 148; // meio da i-ésima lista
  await waitFor(() => pcCols().length === 5);

  console.log('\nH) PC: arrastar a lista pelo título:');
  ok(pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'quadro: ALFA, BETA, GAMA, DELTA, OMEGA');
  ok(pcCols().every((s) => { const h = s.querySelector(':scope > header'); return h.getAttribute('draggable') === 'true' && h.dataset.colDrag === s.dataset.col; }), 'o título (cabeçalho) de cada lista é arrastável');
  const pa = { GAMA: rowPos('GAMA'), DELTA: rowPos('DELTA') };
  srv.log.length = 0;
  const ds = dragEv('dragstart', headOf('ALFA'), 60, 135); await sleep(40);
  ok(!ds.defaultPrevented && pcCols()[0].classList.contains('col-dragging') && dt.effectAllowed === 'move', 'começou: a lista de origem fica apagada');
  ok(dt.img && dt.img.inBody && dt.img.el.tagName === 'SECTION' && dt.img.x === 40 && dt.img.y === 15 && !d.body.contains(dt.img.el), 'a "foto" que anda com o mouse é a lista inteira (pega no ponto onde o mouse segurou) e some da página depois');
  ok(!d.querySelector('body > div.fixed.z-40.w-52'), '(nenhum menu aberto)');
  const ov = dragEv('dragover', pcCols()[3].querySelector('.col-list'), 900, 300);
  const line = $$('col-drop');
  ok(ov.defaultPrevented && !!line && line.parentNode === $$('board') && line.style.left === (20 + 3 * 312 - 8 - 2) + 'px' && line.style.top === '20px' && line.style.height === '500px', 'em cima do quadro: linha em pé no vão entre GAMA e DELTA');
  ok(!d.querySelector('.drop-line') && !d.querySelector('.col.drag-over'), 'sem a linha deitada dos cartões');
  dragEv('dragover', $$('board'), CX(4) + 60, 300);
  ok($$('col-drop').style.left === (20 + 4 * 312 + 296 + 8 - 2) + 'px', 'depois do meio da última lista: a linha vai pro fim');
  dragEv('dragover', $$('board'), 900, 300);
  dragEv('drop', $$('board'), 900, 300); dragEv('dragend', headOf('ALFA'));
  await waitFor(() => lw().length === 1); await settle();
  ok(pcNames() === 'BETA,GAMA,ALFA,DELTA,OMEGA', 'soltou: ALFA foi pra entre GAMA e DELTA');
  ok(lw().length === 1 && lw()[0].fields.join() === 'position' && rowPos('ALFA') === (pa.GAMA + pa.DELTA) / 2, 'nuvem: 1 gravação, só a posição de ALFA (no meio das duas)');
  ok(!$$('col-drop') && !d.querySelector('.col-dragging'), 'sem linha e sem lista apagada');
  ok($$('btn-undo').title === 'Desfazer: Lista mudou de lugar (Ctrl+Z)', 'botão ↶: "Desfazer: Lista mudou de lugar"');
  press(d.body, 'z', { ctrlKey: true }); await waitFor(() => rowPos('ALFA') < pa.GAMA); await settle();
  ok(pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'Ctrl+Z: ALFA volta pra primeira');

  console.log('\nI) PC: o que não muda nada:');
  srv.log.length = 0;
  dragEv('dragstart', headOf('BETA'), 400, 135); await sleep(40);
  dragEv('dragover', $$('board'), CX(1) + 20, 300); dragEv('drop', $$('board'), CX(1) + 20, 300); dragEv('dragend', headOf('BETA')); await settle();
  ok(!lw().length && pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'soltar no mesmo lugar não grava nada');
  dragEv('dragstart', headOf('BETA'), 400, 135); await sleep(40);
  dragEv('dragover', $$('board'), CX(4), 300); dragEv('dragend', headOf('BETA')); await settle();
  ok(!lw().length && !$$('col-drop') && !d.querySelector('.col-dragging') && pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'soltou fora (ou Esc): nada muda e a tela fica limpa');
  const tid = J('tb_backlog_db').find((t) => (t.columnId || 'col_geral') === NM.GAMA).id;
  dragEv('dragstart', headOf('DELTA'), 1000, 135); await sleep(40);
  srv.patch('tarefas', UID, tid, { title: 'Mudou no celular no meio' }); await sleep(300);
  ok(!d.querySelector(`.card[data-id="${tid}"]`).textContent.includes('Mudou no celular no meio'), 'mudança do celular no meio do arraste espera (a tela não é redesenhada embaixo do mouse)');
  dragEv('dragend', headOf('DELTA')); await settle();
  ok(d.querySelector(`.card[data-id="${tid}"]`).textContent.includes('Mudou no celular no meio'), 'e aparece assim que solta');
  const cd = d.querySelector(`.card[data-id="${tid}"]`);
  dragEv('dragstart', cd, 30, 300); await sleep(40);
  ok(!d.querySelector('.col-dragging') && !$$('col-drop'), 'arrastar um cartão continua sendo arrastar o cartão (não a lista)');
  dragEv('dragover', $$('board'), 900, 300);
  ok(!$$('col-drop'), '(e o quadro não mostra a linha de lista)');
  dragEv('dragend', cd); await settle();

  console.log('\nJ) PC: pelo menu dos 3 pontinhos:');
  const colMenu = () => d.querySelector('body > div.fixed.z-40.w-52');
  const menuBtn = (act) => colMenu() && colMenu().querySelector(`[data-act="${act}"]`);
  click(pcCols()[1].querySelector('.col-menu-btn')); await sleep(20);
  ok(!!menuBtn('left') && !!menuBtn('right') && !menuBtn('left').disabled && !menuBtn('right').disabled && /Mover pra esquerda/.test(menuBtn('left').textContent) && /Mover pra direita/.test(menuBtn('right').textContent), 'menu de BETA: "Mover pra esquerda" e "Mover pra direita"');
  srv.log.length = 0;
  click(menuBtn('right')); await waitFor(() => lw().length === 1); await settle();
  ok(!colMenu() && pcNames() === 'ALFA,GAMA,BETA,DELTA,OMEGA' && lw()[0].fields.join() === 'position', 'Mover pra direita: BETA pula GAMA (1 gravação, só a posição) e o menu fecha');
  click(pcCols()[0].querySelector('.col-menu-btn')); await sleep(20);
  ok(menuBtn('left').disabled && !menuBtn('right').disabled, 'na primeira lista, "Mover pra esquerda" fica apagado');
  click(menuBtn('left')); await sleep(60);
  ok(pcNames() === 'ALFA,GAMA,BETA,DELTA,OMEGA' && colMenu() && lw().length === 1, '(clicar nele não faz nada)');
  click(d.body); d.body.dispatchEvent(new P.Event('pointerdown', { bubbles: true })); await sleep(20);
  click(pcCols()[4].querySelector('.col-menu-btn')); await sleep(20);
  ok(!menuBtn('left').disabled && menuBtn('right').disabled, 'na última, "Mover pra direita" fica apagado');
  click(menuBtn('left')); await waitFor(() => lw().length === 2); await settle();
  ok(pcNames() === 'ALFA,GAMA,BETA,OMEGA,DELTA', 'Mover pra esquerda: OMEGA passa DELTA');
  press(d.body, 'z', { ctrlKey: true }); await settle(); press(d.body, 'z', { ctrlKey: true }); await settle();
  ok(pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'dois Ctrl+Z: volta tudo, um passo por clique');

  console.log('\nK) PC: vizinhas "coladas" (sem espaço entre as posições): renumera e continua um passo só:');
  srv.patch('listas', UID, NM.DELTA, { position: rowPos('GAMA') + 1e-9 }); await settle();
  srv.log.length = 0;
  dragEv('dragstart', headOf('OMEGA'), 1300, 135); await sleep(40);
  dragEv('dragover', $$('board'), CX(3) - 20, 300); dragEv('drop', $$('board'), CX(3) - 20, 300); dragEv('dragend', headOf('OMEGA'));
  await waitFor(() => pcNames() === 'ALFA,BETA,GAMA,OMEGA,DELTA' && lw().length >= 2); await settle();
  const ps = ['ALFA', 'BETA', 'GAMA', 'OMEGA', 'DELTA'].map(rowPos);
  ok(pcNames() === 'ALFA,BETA,GAMA,OMEGA,DELTA' && ps.every((v, i) => !i || v - ps[i - 1] >= 1), 'OMEGA entra entre GAMA e DELTA: posições renumeradas com folga');
  ok($$('btn-undo').title === 'Desfazer: Lista mudou de lugar (Ctrl+Z)', 'o Desfazer chama de "Lista mudou de lugar" (não de "listas editadas")');
  press(d.body, 'z', { ctrlKey: true }); await settle(); await settle();
  ok(pcNames() === 'ALFA,BETA,GAMA,DELTA,OMEGA', 'um Ctrl+Z desfaz a renumeração inteira');

  console.log('\nL) PC: ordem mudada no celular chega sozinha (tempo real):');
  srv.patch('listas', UID, NM.OMEGA, { position: rowPos('ALFA') - 500 }); await settle();
  ok(pcNames() === 'OMEGA,ALFA,BETA,GAMA,DELTA', 'lista movida no celular (pra primeira) aparece no PC na hora');

  const errs = [...A.errors, ...errors];
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====` + (errs.length ? '\nERROS DE PÁGINA: ' + errs.slice(0, 3).join(' | ').slice(0, 600) : ''));
  try { w.close(); P.close(); } catch (e) {}
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
