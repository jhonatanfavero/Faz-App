// V40.31.0 — Dias lado a lado no CELULAR: arrastar bloco de um dia pro outro, no app de verdade em jsdom, com uma
// "tela" de mentira pras posições: mudar de dia e de horário (blkMoveTo), o encaixe no vago mais perto (blkBestStart),
// as regras de passado/adiado, conflito, o Desfazer, o gesto (segurar 400 ms, o bloco vai com o dedo, balão com dia e
// hora, vermelho quando não cabe, sublista, toque cancelado, o clique que sobra), os dias andando na borda, o "pro
// lado anda um dia" e o tocar pra abrir o dia que continuam, a tarefa na mão, a dica e a nuvem.
// Uso: TZ='America/Sao_Paulo' node test_arrastar_dias.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(40); } return false; }
const UID = '11111111-1111-1111-1111-111111111111';

(async () => {
  const B = await boot(REPO, backup.data), { w, server, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const lastToast = () => toasts()[toasts().length - 1] || '';
  const steps = () => J('undoStack.map((s) => s.label)');
  const lastStep = () => { const s = steps(); return s[s.length - 1] || ''; };
  const get = (id) => J(`db.find((b) => b.id === ${JSON.stringify(id)}) || null`);
  const D1 = '2026-11-18', D2 = '2026-11-19', D3 = '2026-11-20', D4 = '2026-11-21'; // qua, qui, sex, sáb (o "hoje" dos testes é dom 15/11, 21:00)
  const blk = (id, date, st, dur, title, extra) => Object.assign({ id, date, startMin: st, duration: dur, title, type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, extra || {});
  const put = (blocks) => { ev(`db = db.filter((b) => ![${[D1, D2, D3, D4, '2026-11-14'].map((x) => `'${x}'`).join(',')}].includes(b.date)).concat(${JSON.stringify(blocks)}); saveDb(); activeDateObj = new Date(2026, 10, 18); renderTimeline();`); };
  const SCENE = () => [
    blk('f_a', D1, 540, 60, 'Reunião'),
    blk('f_c', D2, 420, 60, 'Academia'),
    blk('f_b', D2, 720, 60, 'Almoço', { microblocks: [{ id: 'mb_1', title: 'Reservar', done: false }] }),
    blk('f_s', D3, 600, 60, 'Rápidas', { cards: [] }),
    blk('f_t', D3, 660, 180, 'Trabalho'),
    blk('f_r', D3, 840, 30, 'Descanso', { theme: 'rest' }),
    blk('f_p', '2026-11-14', 600, 30, 'Atrasado', { type: 'past' }),
  ];
  ev('closeAllSheets(); collapseAllBlocks && collapseAllBlocks();');
  ev("localStorage.setItem('tb__dica_arrastar_dias', '0');");
  ev('setTlDays(1);');
  put(SCENE());
  await sleep(30);

  // ======================================================================================================
  console.log('A) Mudar de dia e de horário (blkMoveTo) e o encaixe (blkBestStart):');
  const n0 = steps().length;
  ok(ev(`blkMoveTo('f_a', '${D2}', 600)`) === true, 'mover a Reunião pra quinta às 10:00');
  await sleep(20);
  let a = get('f_a');
  ok(a.date === D2 && a.startMin === 600 && a.type === 'focus' && a.duration === 60, 'mudou o dia e o horário (e continua 1 h)');
  ok(steps().length === n0 + 1 && lastStep() === 'Bloco movido', 'Desfazer: um passo, "' + lastStep() + '"');
  ok(ev('fazUndo()') === true && get('f_a').date === D1 && get('f_a').startMin === 540, 'desfazer volta pra quarta às 09:00');
  ok(ev('fazRedo()') === true && get('f_a').date === D2, 'refazer');
  await sleep(20);
  const n1 = steps().length;
  ok(ev(`blkMoveTo('f_a', '${D2}', 600)`) === false && steps().length === n1, 'soltar onde já está: nada muda (nem vira passo)');
  ok(ev(`blkMoveTo('f_a', '${D2}', 700)`) === false && get('f_a').startMin === 600 && lastToast() === 'Conflito! A tarefa voltou.', 'em cima do Almoço: "Conflito! A tarefa voltou." e não muda');
  ok(ev(`blkMoveTo('f_a', '2026-11-14', 900)`) === true && get('f_a').type === 'past', 'pra um dia que já passou: vira "passado"');
  ok(ev(`blkMoveTo('f_p', '${D1}', 600)`) === true && get('f_p').type === 'focus' && get('f_p').wasDelayed === true, 'o passado que foi pro futuro: volta a "foco" e fica marcado como adiado');
  ev(`db.find((b) => b.id === 'f_c').expanded = true; saveDb();`);
  ok(ev(`blkMoveTo('f_c', '${D1}', 420)`) === true && !get('f_c').expanded, 'o bloco movido chega fechado');
  await sleep(20);
  const movedSub = ev(`blkMoveTo('f_s', '${D1}', 1200)`);
  await sleep(20);
  ok(movedSub === true && get('f_s').date === D1 && Array.isArray(get('f_s').cards) && lastStep() === 'Sublista movida', 'a sublista muda de dia com os cartões ("Sublista movida")');
  put(SCENE());
  await sleep(20);
  ok(ev(`blkBestStart('${D2}', 900, 60, 'f_a')`) === 900, 'num vago: fica onde está');
  ok(ev(`blkBestStart('${D2}', 700, 60, 'f_a')`) === 660, 'batendo no Almoço (12:00): encosta antes dele, às 11:00');
  ok(ev(`blkBestStart('${D2}', 745, 60, 'f_a')`) === 780, 'mais pro fim do Almoço: encosta depois dele, às 13:00');
  ok(ev(`blkBestStart('${D2}', 700, 30, 'f_a')`) === 690, 'bloco de 30 min: 11:30');
  ok(ev(`blkBestStart('${D3}', 720, 60, 'f_a')`) === null, 'no meio de 4 h ocupadas (sublista, Trabalho, Descanso): não tem vago perto');
  ok(ev(`blkBestStart('${D2}', 720, 60, 'f_b')`) === 720, 'o próprio bloco não conta como ocupado');

  // ======================================================================================================
  console.log('\nB) O gesto (tela de mentira: cabeçalho até 150 px, agenda de x 56 a 374):');
  const HEAD = 150, LEFT = 56, WIDTH = 318;
  w.Element.prototype.getBoundingClientRect = function () {
    const R = (top, h, left, width) => ({ top, bottom: top + h, left, right: left + width, width, height: h, x: left, y: top });
    if (this.id === 'timeline-scroll') return R(0, 800, 0, 390);
    if (this.tagName === 'HEADER') return R(0, HEAD, 0, 390);
    if (this.id === 'blocks-container') return R(HEAD, 4000, LEFT, WIDTH);
    if (this.classList && this.classList.contains('tl-col')) {
      const cols = [...this.parentNode.querySelectorAll(':scope > .tl-col')], i = cols.indexOf(this), cw = WIDTH / cols.length;
      return R(HEAD, parseFloat(this.style.height) || 3000, LEFT + i * cw, cw);
    }
    if (this.classList && (this.classList.contains('tl-mini') || this.classList.contains('tl-src'))) {
      const c = this.closest('.tl-col'), cr = c ? c.getBoundingClientRect() : R(HEAD, 0, LEFT, WIDTH);
      return R(cr.top + (parseFloat(this.style.top) || 0), parseFloat(this.style.height) || 0, cr.left + 2, cr.width - 4);
    }
    return R(0, 0, 0, 0);
  };
  const fire = (target, type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); return e; };
  const mini = (id) => d.querySelector(`#blocks-container .tl-mini[data-mini-id="${id}"]`);
  const colX = (i, n = 3) => LEFT + (i + 0.5) * (WIDTH / n);
  const Y = (min) => HEAD + ev(`tlY(${min})`);
  const tip = () => d.querySelector('.tl-drag-tip');
  const days = () => J('tlMultiDays()');
  ev(`setTlDays(3, '${D1}')`);
  await sleep(30);
  ok(JSON.stringify(days()) === JSON.stringify([D1, D2, D3]), '3 dias na tela: qua, qui, sex');
  // segurar a Reunião (qua 09:00) pelo meio (10 px abaixo do topo)
  let el = mini('f_a'), r = el.getBoundingClientRect(), pt = [colX(0), r.top + 10];
  fire(el, 'touchstart', [pt]); await sleep(150); fire(el, 'touchend', []); await sleep(300);
  ok(ev('blkDrag') === null, 'tocar e soltar antes de 400 ms: não arrasta');
  fire(el, 'touchstart', [pt]); fire(el, 'touchmove', [[pt[0], pt[1] + 20]]); await sleep(460);
  ok(ev('blkDrag') === null, 'mexer o dedo antes (rolando): não arrasta');
  fire(el, 'touchend', []); await sleep(250);
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [pt]); await sleep(460);
  ok(ev('!!blkDrag') && el.classList.contains('tl-dragging') && !!tip() && !!d.querySelector('#blocks-container .tl-col .tl-src'), 'segurou: o bloco sobe pra mão, o lugar de onde saiu fica tracejado e aparece o balão');
  ok(tip().textContent === 'Qua 18 · 09:00', 'balão: "' + tip().textContent + '"');
  ev('renderTimeline()');
  ok(el.isConnected && el.classList.contains('tl-dragging'), 'no meio do arrasto a agenda não redesenha por baixo');
  // pra quinta, 10:00 (o topo do bloco acompanha o dedo, 10 px acima dele)
  fire(el, 'touchmove', [[colX(1), Y(600) + 10]]);
  ok(el.parentNode.dataset.date === D2 && el.style.top === (ev('tlY(600)') + 1) + 'px' && tip().textContent === 'Qui 19 · 10:00' && !el.classList.contains('bad'), 'na coluna de quinta às 10:00: o bloco vai pra lá e o balão diz "Qui 19 · 10:00"');
  ok(el.querySelector('.tl-mini-time').textContent === '10:00', 'o horário escrito no bloco acompanha');
  fire(el, 'touchmove', [[colX(1), Y(700) + 10]]);
  ok(tip().textContent === 'Qui 19 · 11:00' && el.style.top === (ev('tlY(660)') + 1) + 'px', 'batendo no Almoço: encosta antes dele ("Qui 19 · 11:00")');
  fire(el, 'touchmove', [[colX(2), Y(720) + 10]]);
  ok(el.classList.contains('bad') && tip().textContent === 'Não cabe aqui' && tip().classList.contains('bad'), 'no meio das 4 h ocupadas de sexta: vermelho, "Não cabe aqui"');
  fire(el, 'touchmove', [[colX(2), Y(615)]]);
  ok(mini('f_s').classList.contains('sub-over') && el.classList.contains('into-sub') && tip().textContent === 'Soltar na sublista', 'em cima da sublista de sexta: ela acende e o balão diz "Soltar na sublista"');
  fire(el, 'touchmove', [[colX(1), Y(600) + 10]]);
  ok(!mini('f_s').classList.contains('sub-over') && !el.classList.contains('into-sub'), 'saiu de cima da sublista: apaga');
  fire(el, 'touchend', []);
  await sleep(30);
  a = get('f_a');
  ok(a.date === D2 && a.startMin === 600 && lastStep() === 'Bloco movido', 'soltou: a Reunião foi pra quinta às 10:00 ("Bloco movido")');
  ok(!tip() && !d.querySelector('.tl-src') && ev('blkDrag') === null && mini('f_a').closest('.tl-col').dataset.date === D2, 'o balão e o tracejado somem e a agenda mostra o bloco na quinta');
  mini('f_a').click();
  ok(ev('tlDays') === 3, 'o clique que sobra ao soltar não abre o dia');
  await sleep(420);
  // conflito: solta no vermelho
  el = mini('f_b'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(1), r.top + 10]]); await sleep(460);
  fire(el, 'touchmove', [[colX(2), Y(720) + 10]]);
  fire(el, 'touchend', []);
  await sleep(30);
  ok(get('f_b').date === D2 && get('f_b').startMin === 720 && lastToast() === 'Conflito! A tarefa voltou.', 'soltar onde não cabe: "Conflito! A tarefa voltou." e o Almoço fica onde estava');
  await sleep(420);
  // em cima da sublista: entra
  el = mini('f_b'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(1), r.top + 10]]); await sleep(460);
  fire(el, 'touchmove', [[colX(2), Y(630)]]);
  fire(el, 'touchend', []);
  await sleep(30);
  ok(!get('f_b') && get('f_s').cards.length === 1 && get('f_s').cards[0].title === 'Almoço' && get('f_s').cards[0].microblocks[0].title === 'Reservar' && lastStep() === 'Bloco entrou na sublista', 'soltar em cima da sublista: o Almoço vira cartão dela (com a checklist)');
  await sleep(420);
  // Descanso não entra na sublista: a sublista não acende
  el = mini('f_r'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(2), r.top + 5]]); await sleep(460);
  fire(el, 'touchmove', [[colX(2), Y(630)]]);
  ok(!mini('f_s').classList.contains('sub-over'), 'Descanso em cima da sublista: ela não acende');
  fire(el, 'touchcancel', []);
  await sleep(30);
  ok(get('f_r').startMin === 840 && get('f_r').date === D3 && ev('blkDrag') === null && !tip(), 'toque cancelado pelo sistema: nada muda');
  await sleep(420);
  // segurar e soltar sem mexer: nada muda e não abre o dia
  el = mini('f_a'); r = el.getBoundingClientRect();
  const n2 = steps().length;
  fire(el, 'touchstart', [[colX(1), r.top + 10]]); await sleep(460); fire(el, 'touchend', []);
  mini('f_a').click();
  ok(get('f_a').startMin === 600 && steps().length === n2 && ev('tlDays') === 3, 'segurar e soltar sem mexer: nada muda e o dia não abre');
  await sleep(420);

  // ======================================================================================================
  console.log('\nC) Parado na borda, os dias andam:');
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(1), r.top + 10]]); await sleep(460);
  fire(el, 'touchmove', [[LEFT + WIDTH - 4, Y(900) + 10]]);
  await sleep(850);
  ok(JSON.stringify(days()) === JSON.stringify([D2, D3, D4]), 'parado na borda da direita: os dias andam um (qui, sex, sáb)');
  ok(el.isConnected && el.classList.contains('tl-dragging') && !!d.querySelector('#blocks-container .tl-col[data-date="' + D2 + '"] .tl-src') && !d.querySelector(`.tl-mini[data-mini-id="f_a"]:not(.tl-dragging)`), 'o bloco continua na mão e o tracejado continua na quinta');
  fire(el, 'touchmove', [[colX(2), Y(900) + 10]]);
  ok(tip().textContent === 'Sáb 21 · 15:00', 'balão: "' + tip().textContent + '"');
  fire(el, 'touchend', []);
  await sleep(30);
  ok(get('f_a').date === D4 && get('f_a').startMin === 900, 'soltou: a Reunião foi pro sábado às 15:00');
  await sleep(420);
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(2), r.top + 10]]); await sleep(460);
  fire(el, 'touchmove', [[LEFT + 4, Y(900) + 10]]);
  await sleep(850);
  ok(JSON.stringify(days()) === JSON.stringify([D1, D2, D3]), 'parado na borda da esquerda: andam pra trás (qua, qui, sex)…');
  await sleep(700);
  ok(JSON.stringify(days()) === JSON.stringify(['2026-11-17', D1, D2]), '…um a cada 0,7 s (ter, qua, qui)');
  fire(el, 'touchmove', [[colX(1), Y(780) + 10]]);
  fire(el, 'touchend', []);
  await sleep(30);
  ok(get('f_a').date === D1 && get('f_a').startMin === 780, 'e solta na quarta às 13:00 (o sábado saiu da tela no meio do caminho)');
  await sleep(420);

  // ======================================================================================================
  console.log('\nD) O que continua igual:');
  ev(`setTlDays(3, '${D1}')`); await sleep(20);
  // deslizar rápido pro lado: anda um dia (não vira arrasto)
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(0), r.top + 10]]);
  fire(el, 'touchmove', [[colX(0) - 120, r.top + 14]]);
  fire(el, 'touchend', []);
  await sleep(60);
  ok(JSON.stringify(days()) === JSON.stringify([D2, D3, D4]) && ev('blkDrag') === null, 'deslizar rápido pro lado em cima de um bloco: anda um dia, sem arrastar');
  ev(`setTlDays(3, '${D1}')`); await sleep(20);
  // soltar um arrasto feito rápido pro lado não anda o dia
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(0), r.top + 10]]); await sleep(460);
  fire(el, 'touchmove', [[colX(1), r.top + 10]]); // bem de lado, como o "pro lado anda um dia"
  fire(el, 'touchend', []);
  await sleep(60);
  ok(JSON.stringify(days()) === JSON.stringify([D1, D2, D3]) && get('f_a').date === D2 && get('f_a').startMin === 780, 'soltar o bloco depois de arrastar pro lado não anda o dia (o bloco foi pra quinta às 13:00)');
  await sleep(420);
  mini('f_a').click();
  ok(ev('tlDays') === 1 && ev('getActiveDateStr()') === D2, 'tocar (sem segurar) num bloco continua abrindo o dia dele');
  ev(`setTlDays(3, '${D1}')`); await sleep(20);
  // tarefa na mão: não arrasta
  ev('scheduleBacklogItem(backlogDb[0].id)');
  el = mini('f_a'); r = el.getBoundingClientRect();
  fire(el, 'touchstart', [[colX(1), r.top + 10]]); await sleep(460);
  ok(ev('blkDrag') === null, 'com uma tarefa na mão os blocos não arrastam');
  fire(el, 'touchend', []);
  ev('cancelPendingTask()'); await sleep(20);
  // 1 dia: os blocos de sempre (alça) — nada novo
  ev('setTlDays(1)');
  ok(!d.querySelector('.tl-mini'), 'com 1 dia não tem bloco resumido (o arrasto é o da alça, como antes)');
  // a dica: 3 vezes, ao ir de 1 dia pra 2 ou 3
  ev("localStorage.setItem('tb__dica_arrastar_dias', '0');");
  const before = toasts().length;
  ev('setTlDays(2)'); ev('setTlDays(1)'); ev('setTlDays(3)'); ev('setTlDays(1)'); ev('setTlDays(2)'); ev('setTlDays(1)'); ev('setTlDays(2)');
  const tips = toasts().slice(before).filter((t) => t === 'Segure um bloco pra arrastar ele pra outro dia').length;
  ok(tips === 3 && L('tb__dica_arrastar_dias') === '3', 'dica "Segure um bloco pra arrastar ele pra outro dia": só 3 vezes');
  ok(!Object.keys(J('collectFazData()')).includes('tb__dica_arrastar_dias'), 'a contagem da dica não entra no backup');
  ev(`setTlDays(3, '${D1}')`);

  // ======================================================================================================
  console.log('\nE) Na nuvem:');
  server.addUser('j@t.com', 'senha123', UID);
  w.openConfigSheet(); w.openConfigSync(); await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = 'j@t.com'; $('sync-password').value = 'senha123'; await w.fazSyncLogin(); await waitFor(() => !!L('tb__sync'), 20000);
  w.closeAllSheets();
  const syncDone = async () => { const st = L('tb__sync'); w.fazSyncNow(); await waitFor(() => L('tb__sync') !== st, 20000); await sleep(60); };
  ok(server.get('blocos', UID, 'f_a').date === D2 && server.get('blocos', UID, 'f_a').start_min === 780, 'subiu com o dia e o horário novos');
  ok(ev(`blkMoveTo('f_a', '${D3}', 1080)`) === true, 'move de novo, com a nuvem ligada');
  await syncDone();
  ok(server.get('blocos', UID, 'f_a').date === D3 && server.get('blocos', UID, 'f_a').start_min === 1080, 'a nuvem recebe (sexta 18:00)');
  server.patch('blocos', UID, 'f_a', { date: D1, start_min: 420 });
  await syncDone();
  ok(get('f_a').date === D1 && get('f_a').startMin === 420 && mini('f_a').closest('.tl-col').dataset.date === D1, 'e o que o PC arrasta entre os dias chega no celular');

  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
