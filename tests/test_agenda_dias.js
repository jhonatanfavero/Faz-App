// V40.26.0 — AGENDA AFASTADA no app do celular de verdade (index.html + app.js + sync.js em jsdom): 2 ou 3 dias
// lado a lado. (A) o botão de colunas (1 → 2 → 3 → 1), o que aparece (colunas, nomes dos dias, intervalo no topo,
// sem a barra de planejado) e a escolha guardada no aparelho; (B) os blocos compactos (hora, nome, concluído,
// descanso, sublista, cor, tag; texto vira texto); (C) tocar num bloco ou no nome do dia abre o dia em 1 dia, com o
// cartão aberto; (D) dois toques num vazio de outra coluna abrem o + naquele dia e hora; (E) tarefa na mão: solta em
// qualquer dia (e na sublista); (F) pinça (um nível por gesto, os dois dedos têm que mexer; aproximar abre o dia de
// baixo dos dedos) e arrastar pro lado anda um dia; (G) filtros e busca continuam em lista, ocultar vagos só em 1
// dia; linha do agora só na coluna de hoje; desfazer funciona.
// Uso: TZ='America/Sao_Paulo' node test_agenda_dias.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const B = await boot(REPO, backup.data), { w, L, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const cols = () => [...d.querySelectorAll('#blocks-container .tl-col')];
  const minis = (ds) => [...d.querySelectorAll(`#blocks-container .tl-col[data-date="${ds}"] .tl-mini`)];
  const gaps = (ds) => [...d.querySelectorAll(`#blocks-container .tl-col[data-date="${ds}"] .tl-mini-gap`)];
  const sheetOpen = () => !$('bottom-sheet').classList.contains('translate-y-full');
  const toasts = () => w.__toasts || [];
  const go = (y, m, dd) => ev(`activeDateObj = new Date(${y}, ${m}, ${dd}); runRealTimeEngine(); renderTimeline();`);
  const tap = (el, y, x) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true, clientX: x == null ? 30 : x, clientY: y || 0 }));
  const fire = (target, type, pts) => { const e = new w.Event(type, { bubbles: true, cancelable: true }); e.touches = pts.map(([clientX, clientY]) => ({ clientX, clientY })); target.dispatchEvent(e); };
  const sc = $('timeline-scroll');

  // ======================================================================================================
  console.log('A) O botão de colunas e o que aparece:');
  go(2026, 10, 15);
  ok(cols().length === 0 && !d.querySelector('#tl-days-btn').classList.contains('tl-days-on') && $('tl-days-badge').classList.contains('hidden'), 'começa com 1 dia (como sempre)');
  $('tl-days-btn').click();
  ok(cols().length === 2 && ev('tlDays') === 2 && L('tb__agenda_dias') === '2', 'o botão mostra 2 dias lado a lado e guarda no aparelho (tb__agenda_dias)');
  ok($('tl-days-btn').classList.contains('tl-days-on') && $('tl-days-badge').textContent === '2' && $('tl-days-btn').getAttribute('aria-pressed') === 'true', 'o botão fica aceso com o "2"');
  $('tl-days-btn').click();
  ok(cols().length === 3 && cols().map((c) => c.dataset.date).join() === '2026-11-15,2026-11-16,2026-11-17', '3 dias: 15, 16 e 17 (o primeiro é o dia que estava na tela)');
  ok(cols().every((c) => c.style.width && c.style.width === cols()[0].style.width) && new Set(cols().map((c) => c.style.left)).size === 3, 'colunas iguais, uma do lado da outra (' + cols()[0].style.width + ')');
  ok(!$('tl-dayhead').classList.contains('hidden') && [...$('tl-dayhead').children].map((b) => b.textContent).join('|') === 'Dom 15|Seg 16|Ter 17', 'nomes dos dias no topo: Dom 15 | Seg 16 | Ter 17');
  ok($('tl-dayhead').children[0].classList.contains('today'), 'hoje (15/11 nos dados de teste) fica destacado');
  ok(/15–17 nov/.test($('header-date').textContent), 'o topo mostra o intervalo: "' + $('header-date').textContent.trim() + '"');
  ok($('header-progress-row').classList.contains('hidden'), 'a barra de "planejado" sai (os nomes dos dias ficam no lugar)');
  ok($('now-line').style.display === 'none' && cols()[0].querySelector('.tl-now-mini') && !cols()[1].querySelector('.tl-now-mini'), 'a linha do agora fica só na coluna de hoje');
  $('tl-days-btn').click();
  ok(cols().length === 0 && ev('tlDays') === 1 && $('tl-dayhead').classList.contains('hidden') && !$('header-progress-row').classList.contains('hidden') && L('tb__agenda_dias') === '1', 'o 4º toque volta pra 1 dia (nomes somem, barra volta)');
  ok(d.querySelectorAll('#blocks-container .block-item').length > 10, 'e a agenda de 1 dia é a de sempre');

  // ======================================================================================================
  console.log('\nB) Os blocos compactos:');
  ev("setTlDays(3)");
  const day15 = J("db.filter((b) => b.date === '2026-11-15').sort((a, b) => a.startMin - b.startMin)");
  ok(minis('2026-11-15').length === day15.length, 'cada bloco do dia vira um compacto na coluna dele (' + day15.length + ')');
  const m0 = minis('2026-11-15')[0], b0 = day15[0];
  ok(m0.style.top === (ev(`tlY(${b0.startMin})`) + 1) + 'px' && m0.querySelector('.tl-mini-time').textContent === '07:00' && m0.querySelector('.tl-mini-title').textContent.includes(b0.title), 'no lugar certo da régua, com a hora e o nome');
  ev(`(function(){ const b = db.find((x) => x.id === '${day15[1].id}'); b.completed = true; b.title = '<img src=x onerror="window.__xss=1">Feito'; db.push({ id: 'f_md_r', date: '2026-11-16', startMin: 23 * 60, duration: 30, title: 'Descanso', type: 'focus', theme: 'rest', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, { id: 'f_md_s', date: '2026-11-17', startMin: 22 * 60, duration: 60, title: 'Pendências', type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [], cards: [{ id: 'cd_1', title: 'A', done: true, microblocks: [] }, { id: 'cd_2', title: 'B', done: false, microblocks: [] }] }, { id: 'f_md_c', date: '2026-11-17', startMin: 23 * 60, duration: 60, title: 'Pintado', type: 'focus', theme: 'focus', tagId: tagsDb[0].id, color: '#fde68a', microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline(); })()`);
  await sleep(5); // cada ação do usuário é um passo do Desfazer (fecha no próximo "tique")
  const mDone = minis('2026-11-15')[1];
  ok(mDone.classList.contains('done') && mDone.querySelector('.ph-check') && !w.__xss && !mDone.querySelector('img') && mDone.textContent.includes('<img src=x'), 'concluído fica verde com ✓; nome com HTML aparece como texto');
  const mRest = d.querySelector('[data-mini-id="f_md_r"]'), mSub = d.querySelector('[data-mini-id="f_md_s"]'), mCor = d.querySelector('[data-mini-id="f_md_c"]');
  ok(mRest.classList.contains('rest') && mSub.classList.contains('sub') && mSub.querySelector('.tl-mini-sub').textContent === '1/2', 'descanso com o verde claro; sublista amarelinha com "1/2"');
  ok(mCor.style.backgroundColor !== '' && mCor.classList.contains('light') && /solid/.test(mCor.style.borderLeft), 'cor do cartão (clara → letra escura) e a faixa da tag');
  ok(gaps('2026-11-18').length === 0 && gaps('2026-11-17').length >= 1, 'os vazios ficam invisíveis (mas existem pra tocar)');

  // ======================================================================================================
  console.log('\nC) Tocar abre o dia:');
  tap(minis('2026-11-16')[2]);
  const b16 = J("db.filter((b) => b.date === '2026-11-16').sort((a, b) => a.startMin - b.startMin)[2]");
  ok(ev('tlDays') === 1 && ev('getActiveDateStr()') === '2026-11-16' && cols().length === 0, 'tocar num bloco do dia 16: volta pra 1 dia, no dia 16');
  ok(ev(`db.find((b) => b.id === '${b16.id}').expanded`) === true && !!d.querySelector(`#blocks-container .block-item[data-block-id="${b16.id}"]`), 'e o cartão daquele bloco já vem aberto');
  ok(L('tb__agenda_dias') === '1', 'a agenda fica em 1 dia (pra afastar de novo: pinça ou o botão)');
  ev('collapseAllBlocks(); setTlDays(3)');
  $('tl-dayhead').children[1].click(); // a tela estava em 16, 17 e 18
  ok(ev('tlDays') === 1 && ev('getActiveDateStr()') === '2026-11-17', 'tocar no nome do dia ("Ter 17") abre ele em 1 dia');

  // ======================================================================================================
  console.log('\nD) Dois toques num vazio de outra coluna:');
  go(2026, 10, 17); ev('setTlDays(2)'); // 17 e 18 (18 está livre)
  const g18 = gaps('2026-11-18')[0];
  tap(g18, 450); tap(g18, 450); // 07:00 + 150 min = 09:30
  ok(sheetOpen() && $('commit-intent-btn').textContent.trim() === 'Inserir às 09:30' && J('sheetSlot').date === '2026-11-18', 'abre o + com "Inserir às 09:30" no dia 18 (a coluna tocada)');
  $('task-input').value = 'Na coluna 2'; d.querySelector('.sheet-dur-btn[data-time="30"]').click(); w.commitIntent(); await sleep(5);
  ok(J("db.filter((b) => b.title === 'Na coluna 2').map((b) => [b.date, b.startMin])").join() === '2026-11-18,570' && ev('tlDays') === 2, 'o cartão entra no dia 18 às 09:30 e a agenda continua com 2 dias');
  ok(!!d.querySelector('#blocks-container .tl-col[data-date="2026-11-18"] .tl-mini'), 'e aparece na coluna do 18');
  w.fazUndo();
  ok(!J("db.filter((b) => b.title === 'Na coluna 2')").length && !d.querySelector('#blocks-container .tl-col[data-date="2026-11-18"] .tl-mini'), 'Desfazer tira ele (a agenda afastada se redesenha)');

  // ======================================================================================================
  console.log('\nE) Tarefa na mão:');
  const T1 = ev("backlogDb[0].id"), t1 = J('backlogDb[0]');
  w.scheduleBacklogItem(T1);
  ok(ev('tlDays') === 2 && gaps('2026-11-18').some((g) => g.classList.contains('drop')), 'com a tarefa na mão, os vazios onde ela cabe piscam em todas as colunas');
  ok($('floating-hint').textContent === 'Toque num espaço livre de um dos dias', 'a dica fala dos dias');
  tap(gaps('2026-11-18')[0]); await sleep(5);
  ok(J(`db.filter((b) => b.title === ${JSON.stringify(t1.title)} && b.date === '2026-11-18').length`) === 1 && !ev(`backlogDb.some((x) => x.id === '${T1}')`) && !ev('pendingIntent'), 'um toque no vazio do dia 18 solta ela lá (e ela sai da Lista)');
  w.fazUndo();
  ok(ev(`backlogDb.some((x) => x.id === '${T1}')`), 'Desfazer devolve pra Lista');
  go(2026, 10, 17);
  w.scheduleBacklogItem(T1);
  tap(d.querySelector('[data-mini-id="f_md_s"]')); await sleep(5);
  ok(J("db.find((b) => b.id === 'f_md_s').cards").length === 3 && !ev('pendingIntent') && ev('tlDays') === 2, 'tocar na sublista com a tarefa na mão: ela entra na sublista (e a agenda continua afastada)');
  w.fazUndo();

  // ======================================================================================================
  console.log('\nF) Pinça e arrastar pro lado:');
  ev('setTlDays(1)'); go(2026, 10, 16);
  fire(sc, 'touchstart', [[100, 300], [300, 300]]);
  fire(sc, 'touchmove', [[100, 300], [210, 300]]); // um dedo parado: não é pinça
  ok(ev('tlDays') === 1, 'um dedo parado e o outro mexendo: nada muda');
  fire(sc, 'touchmove', [[150, 300], [250, 300]]); // os dois fecharam: 200 → 100 px
  ok(ev('tlDays') === 2, 'fechar os dois dedos: 2 dias');
  fire(sc, 'touchmove', [[180, 300], [220, 300]]);
  ok(ev('tlDays') === 2, 'um nível por gesto (continuar fechando no mesmo gesto não pula pro 3)');
  fire(sc, 'touchend', []);
  fire(sc, 'touchstart', [[100, 300], [300, 300]]); fire(sc, 'touchmove', [[150, 300], [250, 300]]); fire(sc, 'touchend', []);
  ok(ev('tlDays') === 3, 'outro gesto: 3 dias');
  fire(sc, 'touchstart', [[100, 300], [300, 300]]); fire(sc, 'touchmove', [[150, 300], [250, 300]]); fire(sc, 'touchend', []);
  ok(ev('tlDays') === 3, 'no 3, fechar mais não faz nada');
  // abrir os dedos em cima da coluna do meio (17): aproxima; no 2 → 1, abre o dia de baixo dos dedos
  cols().forEach((c, i) => { c.getBoundingClientRect = () => ({ left: 56 + i * 100, right: 56 + i * 100 + 100, top: 0, bottom: 3000, width: 100, height: 3000 }); });
  fire(sc, 'touchstart', [[150, 300], [250, 300]]); fire(sc, 'touchmove', [[100, 300], [300, 300]]); fire(sc, 'touchend', []);
  ok(ev('tlDays') === 2 && ev('getActiveDateStr()') === '2026-11-16', 'abrir os dedos: 2 dias');
  cols().forEach((c, i) => { c.getBoundingClientRect = () => ({ left: 56 + i * 150, right: 56 + i * 150 + 150, top: 0, bottom: 3000, width: 150, height: 3000 }); });
  fire(sc, 'touchstart', [[230, 300], [310, 300]]); fire(sc, 'touchmove', [[170, 300], [370, 300]]); fire(sc, 'touchend', []);
  ok(ev('tlDays') === 1 && ev('getActiveDateStr()') === '2026-11-17', 'abrir de novo em cima da 2ª coluna (17): 1 dia, já no dia 17');
  // arrastar pro lado
  ev('setTlDays(3)'); go(2026, 10, 16);
  fire(sc, 'touchstart', [[300, 400]]); fire(sc, 'touchmove', [[200, 410]]); fire(sc, 'touchend', []);
  ok(ev('getActiveDateStr()') === '2026-11-17' && cols()[0].dataset.date === '2026-11-17', 'arrastar um dedo pra esquerda: anda um dia (17, 18, 19)');
  fire(sc, 'touchstart', [[100, 400]]); fire(sc, 'touchmove', [[220, 405]]); fire(sc, 'touchend', []);
  ok(ev('getActiveDateStr()') === '2026-11-16', 'pra direita: volta um dia');
  fire(sc, 'touchstart', [[100, 400]]); fire(sc, 'touchmove', [[160, 600]]); fire(sc, 'touchend', []);
  ok(ev('getActiveDateStr()') === '2026-11-16', 'rolar pra baixo (mais vertical que horizontal) não troca o dia');
  ev('setTlDays(1)');
  fire(sc, 'touchstart', [[300, 400]]); fire(sc, 'touchmove', [[150, 400]]); fire(sc, 'touchend', []);
  ok(ev('getActiveDateStr()') === '2026-11-16', 'com 1 dia, arrastar pro lado não troca o dia (como sempre)');

  // ======================================================================================================
  console.log('\nG) Filtros, busca, ocultar vagos e a escolha guardada:');
  ev('setTlDays(3)');
  w.toggleFilterCompleted();
  ok(cols().length === 0 && $('tl-dayhead').classList.contains('hidden') && !$('header-progress-row').classList.contains('hidden'), 'filtro de concluídos: continua a lista de sempre (sem colunas, com a barra de planejado)');
  w.toggleFilterCompleted();
  ok(cols().length === 3, 'tirou o filtro: volta pros 3 dias');
  ev("searchQuery = 'Bloco'; renderTimeline();");
  ok(cols().length === 0, 'busca: lista de sempre');
  ev("searchQuery = ''; renderTimeline();");
  $('tl-compact-btn').click();
  ok(cols().length === 3 && !d.querySelector('#blocks-container .tl-gap') && ev('tlSegs') === null, 'ocultar vagos ligado: com vários dias a régua continua inteira (vale só em 1 dia)');
  ok(toasts()[toasts().length - 1] === 'Ocultar vagos vale quando a agenda mostra 1 dia', 'e avisa: "' + toasts()[toasts().length - 1] + '"');
  ev('setTlDays(1)');
  ok(!!d.querySelector('#blocks-container .tl-gap'), 'em 1 dia os vagos ficam ocultos de novo');
  $('tl-compact-btn').click();
  ev('setTlDays(2)');
  ok(B.errors.length === 0, 'nenhum erro de página' + (B.errors.length ? ': ' + B.errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // abrir o app de novo com a escolha guardada
  const B2 = await boot(REPO, Object.assign({}, backup.data, { tb__agenda_dias: '3' }));
  const d2 = B2.w.document;
  ok(d2.querySelectorAll('#blocks-container .tl-col').length === 3 && d2.getElementById('tl-days-badge').textContent === '3', 'abrindo o app de novo: volta com os 3 dias');
  ok(B2.errors.length === 0, 'sem erro ao abrir');
  try { B2.w.close(); } catch (e) {}

  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\nRESULTADO: ${pass} passaram, ${fail + 1} falharam`); process.exit(1); });
