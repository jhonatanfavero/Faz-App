// V40.25.1 — DOIS TOQUES no horário vazio, no app do celular de verdade (index.html + app.js + sync.js em jsdom).
// (A) um toque não abre nada e explica o gesto (só nas 3 primeiras vezes); (B) dois toques no Tempo Livre abrem o +
// na hora tocada (de 15 em 15 min) e o cartão entra ali; (C) hoje, a hora tocada vale mesmo antes de "agora";
// (D) perto do fim do vago, o cartão encosta no próximo bloco; (E) não cabe no vago: fica na mão; (F) a faixa do
// "ocultar vagos" também é com dois toques (e mira o começo do vago); (G) o que NÃO é toque duplo: vagos diferentes,
// toques lentos, cartão aberto; com tarefa na mão um toque continua soltando.
// Uso: TZ='America/Sao_Paulo' node test_dois_toques.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const B = await boot(REPO, backup.data), { w, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const sheetOpen = () => !$('bottom-sheet').classList.contains('translate-y-full');
  const btnTxt = () => $('commit-intent-btn').textContent.trim();
  const free = () => [...d.querySelectorAll('#blocks-container .block-item.bg-hatched')];
  // no jsdom não existe tela: o topo de cada vago é 0, então clientY = distância (em px) do topo do vago (3 px por minuto)
  const tap = (el, y, x) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: x == null ? 60 : x, clientY: y || 0 }));
  const dbl = (el, y) => { tap(el, y); tap(el, y); };
  const go = (y, m, dd) => ev(`activeDateObj = new Date(${y}, ${m}, ${dd}); renderTimeline();`);
  const reset = () => ev('closeAllSheets(); if (pendingIntent) cancelPendingTask(); tlTapPrev = null; clearTimeout(tlTapHintT);');
  const day = (ds) => J(`db.filter((b) => b.date === '${ds}').map((b) => [b.title, b.startMin, b.duration]).sort((a, c) => a[1] - c[1])`);
  const create = (title, dur) => { $('task-input').value = title; d.querySelector(`.sheet-dur-btn[data-time="${dur}"]`).click(); w.commitIntent(); };

  // ======================================================================================================
  console.log('A) Um toque só:');
  go(2026, 10, 18);
  ok(free().length === 1 && free()[0].classList.contains('cursor-pointer'), 'dia livre: um Tempo Livre só, com cara de tocável');
  w.localStorage.removeItem('tb__dica_dois_toques');
  const n0 = toasts().length;
  tap(free()[0], 150);
  ok(!sheetOpen(), 'um toque no Tempo Livre não abre nada (não abre sem querer rolando a agenda)');
  await sleep(520);
  ok(toasts().length === n0 + 1 && toasts()[toasts().length - 1] === 'Toque 2 vezes no Tempo Livre pra pôr um cartão ali', 'depois de um instante explica: "' + toasts()[toasts().length - 1] + '"');
  for (let i = 0; i < 4; i++) { tap(free()[0], 150); await sleep(520); }
  ok(toasts().length === n0 + 3 && L('tb__dica_dois_toques') === '3', 'a explicação aparece só nas 3 primeiras vezes (guardado em tb__dica_dois_toques, fora do backup)');

  // ======================================================================================================
  console.log('\nB) Dois toques no Tempo Livre:');
  dbl(free()[0], 460); // 07:00 + 153 min = 09:33 → 09:30 (de 15 em 15)
  ok(sheetOpen() && btnTxt() === 'Inserir às 09:30', 'abre o + com "Inserir às 09:30": a hora tocada (09:33), de 15 em 15 min');
  ok(toasts().length === n0 + 3, 'e não mostra a explicação');
  reset();
  dbl(free()[0], 478); // 07:00 + 159 min = 09:39 → 09:45
  ok(btnTxt() === 'Inserir às 09:45', 'arredonda pro quarto de hora mais perto (09:39 → 09:45)');
  reset();
  dbl(free()[0], 450); // 450 px abaixo do topo (07:00) = 150 min = 09:30
  create('Tocado duas vezes', 30);
  ok(JSON.stringify(day('2026-11-18')) === JSON.stringify([['Tocado duas vezes', 570, 30]]) && !ev('pendingIntent'), 'o cartão entra às 09:30 (30 min)');
  reset();
  dbl(free()[1], 25); // segundo vago (10:00 em diante): 25 px = 8 min → 10:15? não: 10:00 + 8 = 10:08 → 10:15
  ok(btnTxt() === 'Inserir às 10:15', 'no vago depois do cartão: "' + btnTxt() + '"');
  reset();
  dbl(free()[0], 3);
  ok(btnTxt() === 'Inserir às 07:00', 'tocando no começo do vago: 07:00');
  reset();

  // ======================================================================================================
  console.log('\nC) Hoje, a hora tocada vale (mesmo antes de "agora"):');
  go(2026, 10, 15); // hoje (21:00); o último bloco termina 17:15
  const last = free()[free().length - 1];
  dbl(last, 135); // 17:15 + 45 min = 18:00
  ok(btnTxt() === 'Inserir às 18:00', 'vago das 17:15 em diante, tocado nas 18:00');
  create('Às seis', 30);
  ok(day('2026-11-15').some((b) => b[0] === 'Às seis' && b[1] === 1080), 'entra às 18:00 (antes o + do vago jogava pra "agora", 21:00)');
  reset();

  // ======================================================================================================
  console.log('\nD) Perto do fim do vago, o cartão encosta no próximo bloco:');
  go(2026, 10, 19);
  ev("db.push({ id: 'f_dt1', date: '2026-11-19', startMin: 600, duration: 60, title: 'Reunião', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline();");
  dbl(free()[0], 520); // 07:00 + 173 min = 09:53 → 09:45
  ok(btnTxt() === 'Inserir às 09:45', 'tocou 09:53 (o próximo bloco é às 10:00): "Inserir às 09:45"');
  create('Encosta', 30);
  ok(day('2026-11-19').some((b) => b[0] === 'Encosta' && b[1] === 570 && b[2] === 30), '30 min não cabem das 09:45 às 10:00: o cartão fica das 09:30 às 10:00');
  reset();

  // ======================================================================================================
  console.log('\nE) Não cabe no vago: fica na mão:');
  ev("db.push({ id: 'f_dt2', date: '2026-11-19', startMin: 690, duration: 30, title: 'Curto 1', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, { id: 'f_dt3', date: '2026-11-19', startMin: 735, duration: 30, title: 'Curto 2', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline();");
  const v15 = free().find((e) => parseFloat(e.style.height) < 50); // o vago de 15 min (11:00–11:15 não: 11:00–11:30 = 30 → o de 12:00–12:15)
  dbl(v15, 1);
  ok(sheetOpen() && /^Inserir às 12:00$/.test(btnTxt()), 'vago de 15 min (12:00–12:15): "' + btnTxt() + '"');
  create('Grande', 60);
  ok(ev('pendingIntent && pendingIntent.title') === 'Grande' && toasts()[toasts().length - 1] === 'Não cabe nesse vago: toque onde quer colocar 👇', 'uma hora não cabe: fica na mão e avisa');
  // com tarefa na mão, UM toque num vago continua soltando
  const big = free().find((e) => parseFloat(e.style.height) > 1000);
  tap(big, 10);
  ok(!ev('pendingIntent') && day('2026-11-19').some((b) => b[0] === 'Grande' && b[2] === 60), 'com a tarefa na mão, um toque num Tempo Livre solta ela (como antes)');
  reset();

  // ======================================================================================================
  console.log('\nF) Faixa do "ocultar vagos":');
  go(2026, 10, 20);
  ev("db.push({ id: 'f_dt4', date: '2026-11-20', startMin: 600, duration: 60, title: 'Meio', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }); saveDb();");
  $('tl-compact-btn').click();
  const strips = () => [...d.querySelectorAll('#blocks-container .tl-gap')];
  ok(strips().length === 2, 'duas faixas (07:00–10:00 e 11:00–24:00)');
  tap(strips()[1], 5);
  ok(!sheetOpen(), 'um toque na faixa não abre mais (era assim na V40.24.0): agora é igual ao Tempo Livre');
  await sleep(520);
  dbl(strips()[1], 5);
  ok(sheetOpen() && btnTxt() === 'Inserir às 11:00', 'dois toques na faixa: "Inserir às 11:00" (o começo do vago)');
  reset();
  $('tl-compact-btn').click();

  // ======================================================================================================
  console.log('\nG) O que NÃO é toque duplo:');
  go(2026, 10, 19);
  const [fa, fb] = free();
  tap(fa, 30); tap(fb, 30);
  ok(!sheetOpen(), 'um toque em cada vago');
  await sleep(520);
  tap(fa, 30); await sleep(480); tap(fa, 30);
  ok(!sheetOpen(), 'dois toques devagar (mais de meio segundo entre eles)');
  await sleep(520);
  tap(fa, 30); tap(fa, 30, 200);
  ok(!sheetOpen(), 'dois toques longe um do outro (dois dedos diferentes)');
  await sleep(520);
  w.toggleExpandBlock('f_dt1', { stopPropagation() {} });
  dbl(free()[0], 30);
  ok(!sheetOpen(), 'com um cartão aberto, os toques só fecham ele');
  ev('collapseAllBlocks()');
  dbl(free()[0], 30);
  ok(sheetOpen(), 'fechou o cartão: dois toques abrem');
  reset();
  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));

  try { w.close(); } catch (e) {}
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
