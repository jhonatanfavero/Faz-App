// V40.27.0 — botão VOLTAR do celular em Chrome de verdade, com o CloseWatcher de verdade.
// O voltar do Android e o Esc do teclado chegam ao CloseWatcher pelo mesmo caminho (são "pedidos de fechar"), então
// aqui o Esc faz o papel do voltar; os toques são de verdade (pelo protocolo do navegador). Conferido:
// (A) agenda: avisa antes de sair, desarma, e volta a perguntar depois de 3 s; (B) + → Config → Aparência por toques e
// quatro voltares seguidos SEM tocar na tela (o Chrome aceita um armado novo a cada voltar); (C) Listas com "Apagar
// tarefa?" por cima: voltar e toque no fundo escuro fecham só a janelinha, e a tela não fica fosca (o que está por
// cima no meio da tela é a tela, não o fundo escuro); (D) tarefa na mão; (E) dias lado a lado: tocar num bloco e
// voltar; (F) Android sem CloseWatcher: pelo histórico (o voltar do navegador).
// Opcional: precisa do Playwright. Uso: node tests/navegador/voltar.js
//   CHROME=/caminho/do/chrome  usa um Chrome já instalado · FOTOS=/pasta  salva imagens das telas
const { abrir, celular } = require('./apoio');
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36';
(async () => {
  const { ctx, browser, base, ok, foto, fim } = await abrir({ userAgent: ANDROID });
  const errs = [];
  const m = await ctx.newPage(); m.on('pageerror', (e) => errs.push(String(e)));
  await m.goto(base + 'index.html'); await m.waitForTimeout(900);
  const voltar = async () => { await m.keyboard.press('Escape'); await m.waitForTimeout(350); };
  const armado = () => m.evaluate(() => !!navW);
  const tap = async (sel) => { await m.tap(sel); await m.waitForTimeout(450); };
  const aberta = (id) => m.evaluate((id) => !document.getElementById(id).classList.contains('translate-y-full'), id);
  const visivel = (id) => m.evaluate((id) => !document.getElementById(id).classList.contains('hidden'), id);
  // o que aparece por cima no meio da tela: a tela aberta (não o fundo escuro), ou a agenda quando nada está aberto
  const meio = () => m.evaluate(() => {
    const e = document.elementFromPoint(innerWidth / 2, innerHeight * 0.6), ov = document.getElementById('overlay'), cs = getComputedStyle(ov);
    const sheet = e && e.closest('[id$="-sheet"]'), modal = e && e.closest('[id$="-modal"]');
    return { em: e === ov ? 'fundo' : modal ? modal.id : sheet ? sheet.id : 'agenda', fundoAtivo: cs.pointerEvents !== 'none' && Number(cs.opacity) > 0.05 };
  });
  const semFosca = async () => { const r = await meio(); return r.em === 'agenda' ? !r.fundoAtivo : r.em !== 'fundo'; };

  console.log('A) Agenda: avisa antes de sair:');
  ok(await m.evaluate(() => typeof CloseWatcher === 'function' && navCW && navAndroid), 'Chrome com CloseWatcher, celular Android');
  ok(await armado(), 'o voltar já está armado quando o app abre');
  await voltar();
  const av = await m.evaluate(() => ({ msg: document.getElementById('toast-msg').textContent, vis: !document.getElementById('toast').classList.contains('opacity-0') }));
  ok(av.vis && av.msg === 'Toque em voltar de novo pra sair' && !(await armado()), 'voltar na agenda: "' + av.msg + '" e desarma (o 2º voltar seria do celular: fecha o app)');
  await foto(m, 'cel-voltar-sair.png');
  await m.waitForTimeout(3200);
  ok(await armado(), 'passados 3 s, volta a perguntar');

  console.log('\nB) + → Config → Aparência, e voltar 4 vezes sem tocar na tela:');
  await tap('#fab-btn');
  await tap('#bottom-sheet [onclick="openConfigSheet()"]');
  await tap('#config-main-menu [onclick="openConfigAppearance()"]');
  ok(await visivel('config-appearance-view') && await aberta('config-sheet'), 'abriu Aparência tocando no + e na Config');
  await voltar();
  ok(!(await visivel('config-appearance-view')) && await visivel('config-main-menu') && await aberta('config-sheet') && await semFosca(), '1º voltar: menu da Config');
  await voltar();
  ok(!(await aberta('config-sheet')) && await aberta('bottom-sheet') && await semFosca(), '2º voltar: o + (de onde a Config abriu)');
  await voltar();
  ok(!(await aberta('bottom-sheet')) && await semFosca() && (await meio()).em === 'agenda', '3º voltar: a agenda, sem fundo escuro preso');
  const t0 = await m.evaluate(() => (document.getElementById('toast-msg').textContent));
  await voltar();
  ok(!(await armado()) && t0 !== null && await m.evaluate(() => !document.getElementById('toast').classList.contains('opacity-0')), '4º voltar: o aviso de sair (cada voltar achou um armado, sem toque no meio)');
  await m.waitForTimeout(3200);

  console.log('\nC) Listas com "Apagar tarefa?" por cima:');
  await tap('#list-btn');
  const lixo = '#backlog-columns-wrapper [onclick*="requestDeleteBacklog"]';
  const n0 = await m.evaluate(() => backlogDb.length);
  await tap(lixo);
  ok(await visivel('backlog-delete-modal') && (await meio()).em === 'backlog-delete-modal', 'tocou na lixeira: "Apagar tarefa?" por cima das Listas');
  await voltar();
  const c1 = await meio();
  ok(!(await visivel('backlog-delete-modal')) && await aberta('list-sheet') && c1.em === 'list-sheet' && await m.evaluate(() => backlogDb.length) === n0, 'voltar: fecha só a janelinha; no meio da tela está a Lista (não o fundo escuro) e a tarefa fica');
  await foto(m, 'cel-voltar-lista.png');
  const z0 = await m.evaluate(() => document.querySelectorAll('.z-\\[60\\].hidden:not([id$="-modal"])').length);
  await tap(lixo);
  await m.touchscreen.tap(30, 110); await m.waitForTimeout(450);
  ok(!(await visivel('backlog-delete-modal')) && await aberta('list-sheet') && (await meio()).em === 'list-sheet', 'tocar no fundo escuro fora da janelinha: também fecha só ela (antes ela ficava aberta)');
  ok(await m.evaluate(() => document.querySelectorAll('.z-\\[60\\].hidden:not([id$="-modal"])').length) === z0, 'e nenhum botão de bloco ou cartão some');
  await voltar();
  ok(!(await aberta('list-sheet')) && await semFosca(), 'voltar: fecha as Listas');

  console.log('\nD) Tarefa na mão:');
  await tap('#list-btn');
  await tap('#backlog-columns-wrapper [onclick*="scheduleBacklogItem"]');
  ok(await m.evaluate(() => !!pendingIntent) && await visivel('floating-task'), 'tocou em agendar: tarefa na mão');
  await voltar();
  ok(await m.evaluate(() => !pendingIntent) && !(await visivel('floating-task')) && await m.evaluate(() => backlogDb.length) === n0 && await semFosca(), 'voltar: solta a tarefa (ela continua na lista)');

  console.log('\nE) Dias lado a lado:');
  await m.evaluate(() => { activeDateObj = new Date(2026, 10, 15); renderTimeline(); document.getElementById('timeline-scroll').scrollTop = 0; });
  await tap('#tl-days-btn'); await tap('#tl-days-btn');
  ok(await m.evaluate(() => tlDays) === 3, 'botão de colunas duas vezes: 3 dias');
  const alvo = await m.evaluate(() => { const e = document.querySelector('#blocks-container .tl-col[data-date="2026-11-16"] .tl-mini'), r = e.getBoundingClientRect(); return { id: e.dataset.miniId, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; });
  await m.touchscreen.tap(alvo.x, alvo.y); await m.waitForTimeout(500);
  ok(await m.evaluate(() => tlDays === 1 && getActiveDateStr() === '2026-11-16'), 'tocou num bloco do dia 16: abriu o dia');
  await voltar();
  ok(await m.evaluate(() => tlDays === 3 && getActiveDateStr() === '2026-11-15' && document.querySelectorAll('#blocks-container .tl-col').length === 3), 'voltar: os 3 dias de novo');
  await voltar();
  ok(!(await armado()), 'voltar de novo: o aviso de sair');
  await m.evaluate(() => setTlDays(1)); await m.waitForTimeout(3200);
  ok(!errs.length, 'sem erro na página' + (errs.length ? ': ' + errs[0] : ''));

  console.log('\nF) Android sem CloseWatcher: pelo histórico:');
  const ctx2 = await celular(browser, { userAgent: ANDROID });
  await ctx2.addInitScript(() => { delete window.CloseWatcher; });
  const h = await ctx2.newPage(); const errs2 = []; h.on('pageerror', (e) => errs2.push(String(e)));
  await h.goto(base + 'index.html'); await h.waitForTimeout(900);
  const hs = () => h.evaluate(() => ({ len: history.length, guarda: !!(history.state && history.state.fazVoltar) }));
  const len0 = (await hs()).len;
  ok(await h.evaluate(() => !navCW && navHist) && !(await hs()).guarda, 'sem CloseWatcher: espera o primeiro toque');
  await h.tap('#list-btn'); await h.waitForTimeout(450);
  let s = await hs();
  ok(s.len === len0 + 1 && s.guarda, 'primeiro toque (abriu as Listas): uma entrada a mais no histórico');
  await h.goBack(); await h.waitForTimeout(350);
  s = await hs();
  ok(await h.evaluate(() => document.getElementById('list-sheet').classList.contains('translate-y-full')) && s.guarda && s.len === len0 + 1, 'voltar do navegador: fecha as Listas e põe a entrada de volta (sem empilhar)');
  await h.goBack(); await h.waitForTimeout(350);
  s = await hs();
  ok(!s.guarda && await h.evaluate(() => document.getElementById('toast-msg').textContent === 'Toque em voltar de novo pra sair'), 'na agenda: avisa e não põe a entrada de volta');
  await h.waitForTimeout(3200);
  ok((await hs()).guarda, 'passados 3 s, põe de novo');
  ok(!errs2.length, 'sem erro na página' + (errs2.length ? ': ' + errs2[0] : ''));
  await fim();
})();
