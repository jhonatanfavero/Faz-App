// Listas afastadas e arrastar cartão entre listas, em Chrome de verdade com TOQUE de verdade
// (eventos de toque injetados pelo protocolo do navegador: o gesto passa pelo mesmo caminho de um dedo).
// Opcional: precisa do Playwright. Uso: node tests/navegador/toque_listas.js
//   CHROME=/caminho/do/chrome  usa um Chrome já instalado · FOTOS=/pasta  salva imagens das telas
const { abrir } = require('./apoio');
(async () => {
  const { ctx, base, ok, foto, fim } = await abrir();
  const errs = [];
  const m = await ctx.newPage(); m.on('pageerror', (e) => errs.push(String(e)));
  await m.goto(base + 'index.html'); await m.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(m);
  const pts = (arr) => arr.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i + 1 }));
  const touch = (type, ...p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: (type === 'touchEnd' || type === 'touchCancel') ? [] : pts(p) });
  const glide = async (from, to, steps = 8) => { for (let i = 1; i <= steps; i++) { await touch('touchMove', { x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }); await m.waitForTimeout(25); } };
  const press = async (p) => { await touch('touchStart', p); await m.waitForTimeout(520); };
  const drop = async (type = 'touchEnd') => { await touch(type); await m.waitForTimeout(350); };
  const drag = async (from, to, hold = 0) => { await press(from); await glide(from, to); if (hold) await m.waitForTimeout(hold); await drop(); };
  const rect = (sel) => m.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height }; }, sel);
  const colIdsOf = (c) => m.evaluate((c) => backlogDb.filter((x) => (x.columnId || 'col_geral') === c).map((x) => x.id), c);
  const formOpen = () => m.evaluate(() => !document.getElementById('backlog-form-view').classList.contains('hidden'));
  const W = '#backlog-columns-wrapper';

  await m.evaluate(() => { backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral')[1].color = '#ec4899'; saveBacklog(); openListSheet(); });
  await m.waitForTimeout(700);
  const cols = await m.evaluate(() => backlogColumnsDb.map((c) => c.id));
  const painted = await m.evaluate(() => backlogDb.find((x) => x.color === '#ec4899').id);

  console.log('A) Modo normal continua igual:');
  const a0 = await colIdsOf(cols[0]);
  await drag(await rect(`[data-bl-card="${a0[0]}"] h4`), await rect(`[data-bl-card="${a0[2]}"] h4`));
  const a1 = await colIdsOf(cols[0]);
  ok(a1.indexOf(a0[0]) === 2 && a1.length === a0.length, 'segurar e arrastar reordena dentro da lista (1º cartão foi pra 3ª posição, como antes)');
  ok(await m.evaluate(() => !document.querySelector('.bl-ghost') && !document.querySelector('.zoom-slot') && !document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom')), 'sem cartão flutuante, sem espaço tracejado, sem modo afastado');
  ok(!(await formOpen()), 'soltar o arrasto não abre o cartão');
  const p0 = await rect(`[data-bl-card="${a1[1]}"] h4`);
  await press(p0); await drop();
  ok(!(await formOpen()) && await m.evaluate(() => !document.querySelector('[data-bl-card].opacity-60')), 'segurar e soltar sem mover: nada muda e o cartão não fica "levantado"');
  await m.evaluate((c) => { document.querySelector(`[data-column-id="${c}"]`).scrollTop = 600; }, cols[0]); await m.waitForTimeout(150);
  await m.evaluate(() => renderBacklog()); await m.waitForTimeout(200);
  const st1 = await m.evaluate((c) => document.querySelector(`[data-column-id="${c}"]`).scrollTop, cols[0]);
  ok(st1 === 600, `redesenhar não joga a lista pro topo (rolagem ${st1}px mantida)`);
  await m.evaluate((c) => { document.querySelector(`[data-column-id="${c}"]`).scrollTop = 600; }, cols[0]); await m.waitForTimeout(100);
  await m.evaluate(() => closeAllSheets()); await m.waitForTimeout(500);
  await m.evaluate(() => openListSheet()); await m.waitForTimeout(600);
  ok(await m.evaluate((c) => document.querySelector(`[data-column-id="${c}"]`).scrollTop, cols[0]) === 0, 'fechar e abrir a Lista continua começando do topo');
  await m.tap(`[data-bl-card="${a1[1]}"] h4`); await m.waitForTimeout(350);
  ok(await formOpen(), 'toque simples continua abrindo o cartão');
  await m.evaluate(() => closeBacklogForm()); await m.waitForTimeout(300);

  console.log('\nB) Afastar pelo botão (V40.16.0: a lupa abre o menu com 1, 1½, 2 e 3 listas por tela):');
  // geometria do quadro: listas inteiras na tela, quanto aparece da primeira lista cortada e o tamanho da letra
  const geo = () => m.evaluate(() => {
    const w = document.getElementById('backlog-columns-wrapper'), wr = w.getBoundingClientRect(), cs = [...w.children];
    const cut = cs.find((c) => c.getBoundingClientRect().right > wr.right + 1), cr = cut && cut.getBoundingClientRect();
    const h4 = w.querySelector('[data-bl-card] h4'), p = w.querySelector('[data-bl-card] p');
    const badge = document.querySelector('#backlog-zoom-btn .zoom-badge');
    return { zoom: w.classList.contains('lists-zoom'), sl: w.scrollLeft, larg: Math.round(cs[0].getBoundingClientRect().width), wl: Math.round(wr.width),
      inteiras: cs.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= wr.left - 1 && r.right <= wr.right + 1; }).length,
      peek: cr ? Math.round(wr.right - cr.left) : 0, meia: cr ? (wr.right - cr.left) / cr.width : 0,
      letra: parseFloat(getComputedStyle(h4).fontSize), detalhe: getComputedStyle(p).display, badge: badge ? badge.textContent : '', ativa: activeColumnId };
  });
  const escolher = async (n) => { await m.tap('#backlog-zoom-btn'); await m.waitForTimeout(250); await m.tap(`#backlog-zoom-menu [data-zoom="${n}"]`); await m.waitForTimeout(400); };
  await m.tap('#backlog-zoom-btn'); await m.waitForTimeout(300);
  const mb = await m.evaluate(() => { const mn = document.getElementById('backlog-zoom-menu'), r = mn.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { vis: !mn.classList.contains('hidden') && r.width > 150 && r.height > 60, topo: !!el && mn.contains(el), dentro: r.left >= 0 && r.right <= innerWidth, zoom: document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom') }; });
  ok(mb.vis && mb.topo && mb.dentro && !mb.zoom, 'a lupa abre o menu inteiro na tela, por cima das listas (ainda sem mudar o zoom)');
  await foto(m, 'z_menu.png');
  await m.tap('#backlog-zoom-menu [data-zoom="1.5"]'); await m.waitForTimeout(400);
  const g15 = await geo();
  ok(g15.zoom && g15.inteiras === 1 && g15.meia > 0.4 && g15.meia < 0.75 && g15.sl === 0 && g15.badge === '1½', `1½: uma lista inteira (${g15.larg}px) e ${Math.round(g15.meia * 100)}% da próxima; a lupa mostra "1½"`);
  ok(g15.letra === 14 && g15.detalhe !== 'none' && g15.ativa === cols[0], `no 1½ o nome do cartão fica com ${g15.letra}px (como no modo normal) e a lista ativa não muda`);
  await foto(m, 'z_zoom15.png');
  await escolher(3);
  const g3 = await geo();
  ok(g3.zoom && g3.inteiras === 3 && g3.peek > 8 && g3.sl === 0 && g3.badge === '3', `3: três listas inteiras (${g3.larg}px cada) e a ponta da 4ª aparecendo (${g3.peek}px)`);
  ok(g3.letra === 11 && g3.detalhe === 'none', 'no 3 o cartão mostra só o nome (11px)');
  await foto(m, 'z_zoom3.png');
  await escolher(2);
  const info = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); const cs = [...w.children]; const wr = w.getBoundingClientRect(); return { zoom: w.classList.contains('lists-zoom'), sl: w.scrollLeft, visiveis: cs.filter((c) => { const r = c.getBoundingClientRect(); return r.left >= wr.left - 1 && r.right <= wr.right + 1; }).length, peek: Math.round(wr.right - cs[2].getBoundingClientRect().left), larg: Math.round(cs[0].getBoundingClientRect().width), wl: Math.round(wr.width), heads: cs.map((c) => c.querySelector('.zoom-col-head').textContent.trim().replace(/\s+/g, ' ')).join(' | '), botoes: getComputedStyle(cs[0].querySelector('[data-bl-card] .shrink-0')).display, ativa: activeColumnId, titulo: document.getElementById('backlog-column-title').innerText }; });
  ok(info.zoom && info.visiveis === 2 && info.sl === 0, `2 listas inteiras na tela (${info.larg}px cada, área de ${info.wl}px) e a ponta da 3ª aparecendo (${info.peek}px)`);
  ok(info.botoes === 'none', 'cartões compactos (sem os botões): ' + info.heads);
  ok(info.ativa === cols[0], `a lista ativa continua a mesma (${info.titulo})`);
  await foto(m, 'z_zoom.png');

  console.log('\nC) Arrastar de uma lista pra outra:');
  const c1 = await colIdsOf(cols[1]);
  const from = await rect(`[data-bl-card="${painted}"]`), tgtR = await rect(`[data-bl-card="${c1[1]}"]`);
  await press(from); await glide(from, { x: tgtR.x, y: tgtR.top + 6 });
  const mid = await m.evaluate((a) => { const g = document.querySelector('.bl-ghost'), s = document.querySelector('.zoom-slot'); return { ghost: !!g, gop: g ? getComputedStyle(g).opacity : '', slotCol: s && s.parentNode.dataset.columnId, slotNext: s && s.nextElementSibling && s.nextElementSibling.dataset.blCard, src: document.querySelector(`[data-bl-card="${a}"]`).classList.contains('bl-src'), srcH: Math.round(document.querySelector(`[data-bl-card="${a}"]`).getBoundingClientRect().height), slotH: s ? Math.round(s.getBoundingClientRect().height) : 0 }; }, painted);
  ok(mid.ghost && mid.gop === '1' && mid.src && mid.srcH === 0, 'o cartão acompanha o dedo e sai da lista de origem');
  ok(mid.slotCol === cols[1] && mid.slotNext === c1[1] && mid.slotH > 30, `abre um espaço tracejado (${mid.slotH}px) na outra lista, antes do 2º cartão`);
  await foto(m, 'z_drag.png');
  await drop();
  const c1b = await colIdsOf(cols[1]);
  const aft = await m.evaluate((id) => ({ ghost: !!document.querySelector('.bl-ghost'), slot: !!document.querySelector('.zoom-slot'), toast: document.getElementById('toast-msg').innerText, cor: backlogDb.find((x) => x.id === id).color }), painted);
  ok(c1b.indexOf(painted) === 1 && c1b[2] === c1[1] && !aft.ghost && !aft.slot, `caiu exatamente no espaço: 2ª posição da outra lista (aviso: "${aft.toast}")`);
  ok(aft.cor === '#ec4899', 'a cor foi junto');
  ok(!(await formOpen()), 'soltar não abre o cartão');

  // mesmo lugar: mexe um pouco e solta → nada muda
  const before = JSON.stringify(await m.evaluate(() => backlogDb.map((x) => x.id + ':' + (x.columnId || 'col_geral'))));
  const sp = await rect(`[data-bl-card="${c1b[2]}"]`);
  await press(sp); await glide(sp, { x: sp.x + 6, y: sp.y + 5 }, 3);
  const noSlot = await m.evaluate(() => !document.querySelector('.zoom-slot'));
  await drop();
  ok(noSlot && before === JSON.stringify(await m.evaluate(() => backlogDb.map((x) => x.id + ':' + (x.columnId || 'col_geral')))), 'soltar no mesmo lugar não muda nada (nem abre espaço)');

  // reordenar com precisão dentro da mesma lista (afastado)
  const r0 = await rect(`[data-bl-card="${c1b[0]}"]`), r3 = await rect(`[data-bl-card="${c1b[3]}"]`);
  await drag(r0, { x: r3.x, y: r3.top + 5 });
  const c1c = await colIdsOf(cols[1]);
  ok(c1c.indexOf(c1b[0]) === 2 && c1c[3] === c1b[3] && c1c.length === c1b.length, 'na mesma lista: o 1º cartão foi parar exatamente antes do 4º');

  // soltar abaixo do último cartão de uma lista curta → fim da lista
  const wr = await rect(W);
  const lastC1 = await rect(`[data-column-id="${cols[1]}"] [data-bl-card]:last-of-type`);
  const g0 = await colIdsOf(cols[0]);
  const gp = await rect(`[data-bl-card="${g0[0]}"]`);
  await press(gp); await glide(gp, { x: tgtR.x, y: wr.bottom - 10 }); await m.waitForTimeout(1300);
  const endInfo = await m.evaluate((c) => { const s = document.querySelector('.zoom-slot'); const col = document.querySelector(`[data-column-id="${c}"]`); return { last: !!s && s.parentNode === col && col.lastElementChild === s, st: col.scrollTop, max: col.scrollHeight - col.clientHeight }; }, cols[1]);
  await drop();
  const c1d = await colIdsOf(cols[1]);
  ok(endInfo.last && c1d[c1d.length - 1] === g0[0], `segurar no fim da lista rola a lista (${Math.round(endInfo.st)}px) e o cartão entra por último`);
  const vis = await m.evaluate((a) => { const col = document.querySelector(`[data-column-id="${a.c}"]`).getBoundingClientRect(), card = document.querySelector(`[data-bl-card="${a.id}"]`).getBoundingClientRect(); return card.top >= col.top && card.bottom <= col.bottom + 1; }, { c: cols[1], id: g0[0] });
  ok(vis, 'depois de soltar, o cartão recém-solto continua inteiro na tela (a lista não "pula")');

  // toque cancelado pelo sistema → nada muda
  const snap = JSON.stringify(await m.evaluate(() => backlogDb.map((x) => x.id + ':' + (x.columnId || 'col_geral'))));
  const g1 = await colIdsOf(cols[0]);
  const cp = await rect(`[data-bl-card="${g1[0]}"]`);
  await press(cp); await glide(cp, { x: tgtR.x, y: tgtR.top + 6 });
  const hadSlot = await m.evaluate(() => !!document.querySelector('.zoom-slot'));
  await drop('touchCancel');
  ok(hadSlot && snap === JSON.stringify(await m.evaluate(() => backlogDb.map((x) => x.id + ':' + (x.columnId || 'col_geral')))) && await m.evaluate(() => !document.querySelector('.bl-ghost') && !document.querySelector('.zoom-slot') && !document.querySelector('.bl-src')), 'toque cancelado pelo sistema (ligação, gesto) não move nada e limpa a tela');

  // borda direita rola o quadro e solta numa lista que estava fora da tela
  const sl0 = await m.evaluate(() => document.getElementById('backlog-columns-wrapper').scrollLeft);
  const g2 = await colIdsOf(cols[0]);
  const ep = await rect(`[data-bl-card="${g2[0]}"]`);
  await press(ep); await glide(ep, { x: wr.right - 12, y: ep.y + 40 }); await m.waitForTimeout(1400);
  const edge = await m.evaluate((x) => ({ sl: document.getElementById('backlog-columns-wrapper').scrollLeft, col: backlogColumnAtX(x).dataset.columnId, slotCol: document.querySelector('.zoom-slot') && document.querySelector('.zoom-slot').parentNode.dataset.columnId }), wr.right - 12);
  await drop();
  const landed = await m.evaluate((id) => backlogDb.find((x) => x.id === id).columnId || 'col_geral', g2[0]);
  ok(edge.sl > sl0 + 150, `segurar na borda direita rola o quadro sozinho (${Math.round(sl0)} → ${Math.round(edge.sl)}px)`);
  ok(landed === edge.col && edge.slotCol === edge.col && cols.indexOf(landed) >= 2, `e o cartão cai na lista que chegou embaixo do dedo (${cols.indexOf(landed) + 1}ª lista, que estava fora da tela)`);
  const keep = await m.evaluate(() => ({ sl: document.getElementById('backlog-columns-wrapper').scrollLeft, ativa: activeColumnId, vis: backlogColVisible(document.getElementById('backlog-columns-wrapper'), document.querySelector(`[data-column-id="${activeColumnId}"]`)) }));
  ok(Math.abs(keep.sl - edge.sl) < 3 && keep.vis, 'depois de soltar o quadro fica onde estava (não pula de volta) e a lista ativa é uma que está na tela');

  console.log('\nD) Lista ativa no modo afastado:');
  const headSel = (c) => `[data-column-id="${c}"] .zoom-col-head`;
  const visCol = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); return [...w.children].filter((c) => backlogColVisible(w, c)).map((c) => c.dataset.columnId); });
  const pick = visCol[visCol.length - 1];
  await m.tap(headSel(pick)); await m.waitForTimeout(250);
  ok(await m.evaluate((c) => activeColumnId === c && document.querySelector(`[data-column-id="${c}"]`).classList.contains('zoom-active') && document.getElementById('backlog-column-title').innerText === backlogColumnsDb.find((x) => x.id === c).name, pick), 'tocar no título de uma lista deixa ela ativa (borda e nome lá em cima)');
  await m.evaluate(() => { document.getElementById('backlog-columns-wrapper').scrollLeft = 0; }); await m.waitForTimeout(350);
  const act2 = await m.evaluate(() => activeColumnId);
  ok(cols.indexOf(pick) >= 2 ? act2 === cols[0] : act2 === pick, 'rolar o quadro só troca a lista ativa quando ela some da tela');
  await m.tap('#backlog-column-dots button:nth-child(4)'); await m.waitForTimeout(900);
  const dot = await m.evaluate((c) => { const w = document.getElementById('backlog-columns-wrapper'); const el = document.querySelector(`[data-column-id="${c}"]`); return { ativa: activeColumnId === c, vis: backlogColVisible(w, el), left: Math.round(el.getBoundingClientRect().left - w.getBoundingClientRect().left) }; }, cols[3]);
  ok(dot.ativa && dot.vis, `tocar na bolinha leva até a lista (4ª lista ativa e na tela, a ${dot.left}px da borda)`);
  await m.evaluate(() => { promptCreateColumn(); document.getElementById('column-name-input').value = 'TESTE ZOOM'; confirmColumnName(); }); await m.waitForTimeout(1100);
  const created = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); const c = backlogColumnsDb[backlogColumnsDb.length - 1]; const el = document.querySelector(`[data-column-id="${c.id}"]`); return { nome: c.name, ativa: activeColumnId === c.id, vis: backlogColVisible(w, el), vazia: !!el.querySelector('.opacity-50') }; });
  ok(created.nome === 'TESTE ZOOM' && created.ativa && created.vis && created.vazia, 'lista nova aparece na tela, já ativa');
  // soltar um cartão numa lista vazia
  const nc = await m.evaluate(() => backlogColumnsDb[backlogColumnsDb.length - 1].id);
  const prevCol = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); return [...w.children].filter((c) => backlogColVisible(w, c) && c.querySelector('[data-bl-card]')).map((c) => c.dataset.columnId)[0]; });
  const pc = await colIdsOf(prevCol);
  const fp = await rect(`[data-bl-card="${pc[0]}"]`), np = await rect(`[data-column-id="${nc}"]`);
  await press(fp); await glide(fp, { x: np.x, y: np.top + 70 });
  const emptyMid = await m.evaluate((c) => { const el = document.querySelector(`[data-column-id="${c}"]`); return { slot: !!el.querySelector('.zoom-slot'), msg: getComputedStyle(el.querySelector('.opacity-50')).display }; }, nc);
  await drop();
  ok(emptyMid.slot && emptyMid.msg === 'none' && (await colIdsOf(nc)).join() === pc[0], 'dá pra soltar numa lista vazia (o aviso "Lista vazia" dá lugar ao espaço)');

  console.log('\nE) Pinça com dois dedos:');
  const c = { x: wr.x, y: wr.y };
  const pinch = async (d0, d1) => { await touch('touchStart', { x: c.x - d0, y: c.y }, { x: c.x + d0, y: c.y }); await m.waitForTimeout(60); for (let i = 1; i <= 6; i++) { const d = d0 + (d1 - d0) * i / 6; await touch('touchMove', { x: c.x - d, y: c.y }, { x: c.x + d, y: c.y }); await m.waitForTimeout(25); } await touch('touchEnd'); await m.waitForTimeout(450); };
  await touch('touchStart', { x: c.x - 120, y: c.y + 150 }, { x: c.x + 60, y: c.y - 150 }); await m.waitForTimeout(60);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', { x: c.x - 120, y: c.y + 150 }, { x: c.x + 60, y: c.y - 150 + i * 35 }); await m.waitForTimeout(25); }
  await touch('touchEnd'); await m.waitForTimeout(300);
  ok(await m.evaluate(() => document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom')), 'um dedo parado e outro rolando a lista não conta como pinça');
  const nivel = () => m.evaluate(() => backlogZoomLevel());
  await pinch(50, 120);
  ok(await nivel() === 1.5 && (await geo()).inteiras === 1, 'abrir os dedos aproxima um nível (2 → 1½)');
  await pinch(50, 120);
  ok(await m.evaluate(() => !document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom') && localStorage.getItem('tb__lista_afastada') === '0'), 'abrir de novo: 1½ → uma lista por tela');
  ok(await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); return Math.round(w.children[0].getBoundingClientRect().width) === Math.round(w.getBoundingClientRect().width) && getComputedStyle(w.querySelector('.zoom-col-head')).display === 'none' && !!w.querySelector('[data-bl-card] .shrink-0') && getComputedStyle(w.querySelector('[data-bl-card] .shrink-0')).display !== 'none'; }), 'modo normal de volta: lista na largura toda, botões dos cartões e sem títulos extras');
  ok(!(await formOpen()) && await m.evaluate(() => !_dragState), 'a pinça não abre cartão nem começa arrasto');
  await pinch(50, 120);
  ok(await nivel() === 1, 'no normal, abrir os dedos não faz nada (não dá a volta)');
  await pinch(120, 50);
  ok(await m.evaluate(() => document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom') && localStorage.getItem('tb__lista_afastada') === '1') && await nivel() === 1.5, 'fechar os dedos afasta um nível (normal → 1½)');
  await pinch(120, 50);
  const p2 = await geo();
  ok(await nivel() === 2 && p2.inteiras === 2, 'fechar de novo: 1½ → 2');
  await pinch(120, 50);
  const p3 = await geo();
  ok(await nivel() === 3 && p3.inteiras === 3 && p3.badge === '3', 'e de novo: 2 → 3');
  await pinch(120, 50);
  ok(await nivel() === 3, 'no 3, fechar os dedos não faz nada');
  ok(!(await formOpen()) && await m.evaluate(() => !_dragState && document.getElementById('backlog-zoom-menu').classList.contains('hidden')), 'nenhuma pinça abriu cartão, começou arrasto ou abriu o menu');

  console.log('\nF) A escolha fica guardada no aparelho:');
  await m.reload(); await m.waitForTimeout(900);
  await m.evaluate(() => openListSheet()); await m.waitForTimeout(600);
  ok(await m.evaluate(() => document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom') && !!document.querySelector('#backlog-zoom-btn .ph-magnifying-glass-plus')), 'ao abrir o app de novo as listas já vêm afastadas, com o botão de aproximar');
  ok(await nivel() === 3 && (await geo()).inteiras === 3, 'e no mesmo nível em que estavam (3)');
  ok(await m.evaluate(() => !Object.keys(collectFazData ? (collectFazData().data || collectFazData()) : {}).some((k) => /lista_afastada|lista_zoom/.test(k))), 'a preferência não entra no backup');
  await m.tap('#backlog-zoom-btn'); await m.waitForTimeout(250);
  const fora = await rect(`[data-column-id="${cols[0]}"] [data-bl-card]`);
  await m.touchscreen.tap(fora.x, fora.y); await m.waitForTimeout(350);
  ok(await m.evaluate(() => document.getElementById('backlog-zoom-menu').classList.contains('hidden')) && !(await formOpen()), 'menu aberto + toque num cartão: só fecha o menu, não abre o cartão');
  await escolher(1);
  ok(await m.evaluate(() => !document.getElementById('backlog-columns-wrapper').classList.contains('lists-zoom') && !document.querySelector('#backlog-zoom-btn .zoom-badge')), 'escolher 1 no menu aproxima de volta (e a lupa fica sem número)');
  await m.evaluate(() => { backlogColumnsDb.splice(1); backlogZoomOut = true; activeColumnId = backlogColumnsDb[0].id; renderBacklog(); }); await m.waitForTimeout(300);
  const one = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'); return { col: Math.round(w.children[0].getBoundingClientRect().width), area: Math.round(w.getBoundingClientRect().width), n: w.children.length }; });
  ok(one.n === 1 && one.col === one.area - 20, `quem tem uma lista só vê ela compacta na largura toda (${one.col}px de ${one.area}px)`);
  await foto(m, 'z_one.png');
  console.log('\nG) Aba Assistente (V40.20.0):');
  const abas = () => m.evaluate(() => {
    const box = document.getElementById('btn-list-assistant').parentElement.getBoundingClientRect();
    return [...document.querySelectorAll('[id^="btn-list-"]')].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, dentro: r.left >= box.left - 0.5 && r.right <= box.right + 0.5, cabe: b.scrollWidth <= b.clientWidth + 1, alto: Math.round(r.height) }; });
  });
  for (const largura of [390, 360]) {
    await m.setViewportSize({ width: largura, height: 844 }); await m.waitForTimeout(250);
    const ab = await abas();
    ok(ab.length === 6 && ab[0].id === 'btn-list-assistant' && ab[5].id === 'btn-list-goals' && ab.every((a) => a.dentro && a.cabe && a.alto === ab[1].alto), `tela de ${largura} px: as 6 abas cabem, sem cortar o texto (Assistente primeiro e Metas no fim, só os ícones)`);
  }
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(200);
  await m.tap('#btn-list-assistant'); await m.waitForTimeout(300);
  const as = await m.evaluate(() => {
    const f = document.getElementById('assistant-feed').getBoundingClientRect(), i = document.getElementById('assistant-input').getBoundingClientRect(), c = document.getElementById('assistant-chips');
    return { msgs: document.querySelectorAll('#assistant-feed > div').length, txt: document.getElementById('assistant-feed').textContent.slice(0, 40), inputNaTela: i.bottom <= innerHeight && i.top > f.top, chipsRolam: c.scrollWidth > c.clientWidth, feedH: Math.round(f.height) };
  });
  ok(as.msgs === 1 && /^(Bom dia|Boa tarde|Boa noite)! Hoje é /.test(as.txt) && as.inputNaTela && as.chipsRolam && as.feedH > 250, `abre com o resumo ("${as.txt}…"), sugestões rolando pro lado e o campo de perguntar à vista`);
  await foto(m, 'cel-assistente.png');
  const chip = await m.evaluate(() => { const c = document.getElementById('assistant-chips'), b = [...c.querySelectorAll('button')].find((x) => x.textContent === 'Minhas contas'); c.scrollLeft = b.offsetLeft - 20; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await m.touchscreen.tap(chip.x, chip.y); await m.waitForTimeout(300);
  const depois = await m.evaluate(() => { const f = document.getElementById('assistant-feed'); return { n: f.querySelectorAll(':scope > div').length, fim: f.scrollHeight - f.scrollTop - f.clientHeight < 4 }; });
  ok(depois.n === 3 && depois.fim, 'tocar em "Minhas contas": pergunta e resposta aparecem e a conversa rola até o fim');
  await foto(m, 'cel-assistente-contas.png');

  console.log('\nH) Aba Metas (V40.21.0):');
  await m.tap('#btn-list-goals'); await m.waitForTimeout(350);
  const mt0 = await m.evaluate(() => {
    const v = document.getElementById('view-goals'), lv = document.getElementById('goals-level').getBoundingClientRect(), nb = [...v.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Nova meta').getBoundingClientRect();
    return { aberta: !v.classList.contains('hidden'), listas: [...document.querySelectorAll('#goals-container .goal-section h3')].map((b) => b.textContent.trim()), nivel: document.getElementById('goals-level-name').textContent, nivelNaTela: lv.top >= 0 && lv.bottom < innerHeight, botao: nb.bottom <= innerHeight && nb.top > lv.bottom };
  });
  ok(mt0.aberta && mt0.listas.join('|') === 'Pessoal|Profissional|Financeiro' && mt0.nivel === 'Iniciante' && mt0.nivelNaTela && mt0.botao, 'abre com o nível em cima, uma tela só com as categorias Pessoal, Profissional e Financeiro e o "Nova meta" embaixo, à vista');
  await m.tap('#goals-list-view > button'); await m.waitForTimeout(300);
  await m.tap('#goal-templates button:has-text("Beber água")'); await m.waitForTimeout(150);
  const form = await m.evaluate(() => { const b = document.querySelector('#goals-form-view .fx-save').getBoundingClientRect(); return { nome: document.getElementById('goal-title-input').value, salvarNaTela: b.bottom <= innerHeight && b.top > 0, sugestoesRolam: document.getElementById('goal-templates').scrollWidth > document.getElementById('goal-templates').clientWidth }; });
  ok(form.nome === 'Beber água' && form.salvarNaTela && form.sugestoesRolam, 'Nova meta: as sugestões rolam pro lado, tocar em "Beber água" preenche, e o Salvar fica à vista');
  await foto(m, 'cel-metas-form.png');
  await m.tap('#goals-form-view .fx-save'); await m.waitForTimeout(300);
  await m.tap('#goals-list-view > button'); await m.waitForTimeout(250);
  await m.tap('#goal-templates button:has-text("Correr")'); await m.waitForTimeout(100);
  await m.tap('#goals-form-view .fx-save'); await m.waitForTimeout(300);
  const plus = () => m.evaluate(() => { const b = document.querySelector('#goals-container .goal-plus').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  for (let i = 0; i < 8; i++) { const pt = await plus(); await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(90); }
  const mt1 = await m.evaluate(() => {
    const c = document.querySelector('#goals-container [data-goal]'), r = c.getBoundingClientRect(), pb = c.querySelector('.goal-plus').getBoundingClientRect();
    return { status: c.querySelector('.goal-status').textContent, toast: document.getElementById('toast-msg').textContent, pontos: document.getElementById('goals-points').textContent, cabe: r.left >= 0 && r.right <= innerWidth && pb.right <= r.right, n: document.querySelectorAll('#goals-container [data-goal]').length };
  });
  ok(mt1.n === 2 && mt1.status.startsWith('✓ 8 de 8 hoje') && mt1.toast === '⭐ Meta cumprida! +10 pontos' && mt1.pontos === '10 pontos' && mt1.cabe, '8 toques no +1: "✓ 8 de 8 hoje", aviso "⭐ Meta cumprida! +10 pontos" e 10 pontos; o cartão cabe na tela');
  await m.waitForTimeout(200);
  await foto(m, 'cel-metas.png');
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(250);
  const mt2 = await m.evaluate(() => [...document.querySelectorAll('#goals-container [data-goal]')].every((c) => { const r = c.getBoundingClientRect(), pb = c.querySelector('.goal-plus').getBoundingClientRect(), t = c.querySelector('.truncate').getBoundingClientRect(); return r.right <= innerWidth && pb.right <= r.right && t.right <= pb.left; }));
  ok(mt2, 'tela de 360 px: nome, progresso e botões cabem no cartão');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(150);

  { // V40.24.0 (bloco próprio: os nomes daqui não se misturam com os de cima)
  console.log('\nI) Sublista e vagos ocultos na agenda (V40.24.0):');
  // um dia que nunca é hoje nem passado (com 18/11/2026 o teste quebrava conforme a hora do dia): o 1º livre é às 07:00
  await m.evaluate(() => { closeAllSheets(); activeDateObj = new Date(2030, 6, 12); renderTimeline(); document.getElementById('timeline-scroll').scrollTop = 0; });
  await m.waitForTimeout(300);
  await m.tap('#fab-btn'); await m.waitForTimeout(450);
  await m.fill('#task-input', 'Pendências rápidas');
  await m.tap('.sheet-dur-btn[data-time="60"]');
  await m.tap('#bottom-sheet [data-plus-kind="sub"]'); await m.tap('#commit-intent-btn'); await m.waitForTimeout(450); // V40.51.1: Tipo → Sublista, depois o botão do pé
  await m.tap('#blocks-container .block-item.bg-hatched'); await m.waitForTimeout(350);
  const S1 = await m.evaluate(() => (db.find((b) => b.date === '2030-07-12' && Array.isArray(b.cards)) || {}).id);
  ok(!!S1 && await m.evaluate(() => pendingIntent === null), 'pelo + → "Sublista" → tocar no Tempo Livre: a sublista nasce no dia (com toques de verdade)');
  const subSel = `#blocks-container .block-item[data-block-id="${S1}"]`;
  await m.tap(`${subSel} .block-btn[title="Expandir/Recolher"]`); await m.waitForTimeout(250);
  for (const t of ['Pagar boleto', 'Responder o Anderson', 'Ligar pro cartório']) { await m.tap(`#sub-input-${S1}`); await m.keyboard.type(t); await m.keyboard.press('Enter'); await m.waitForTimeout(160); }
  ok(await m.evaluate((id) => db.find((b) => b.id === id).cards.length, S1) === 3, 'aberta: 3 cartões digitados com Enter (o campo continua focado)');
  await foto(m, 'cel-sublista-aberta.png');
  const barra = async () => m.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return [...e.querySelectorAll('.blk-bar > button')].every((b) => { const x = b.getBoundingClientRect(); return x.left >= r.left && x.right <= r.right - 2 && b.scrollWidth <= b.clientWidth + 1; }); }, subSel);
  ok(await barra(), 'aberta: Editar, Duplicar, Arquivar e Apagar cabem inteiros (390 px)');
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(200);
  ok(await barra(), 'e numa tela de 360 px também');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(150);
  await m.evaluate(() => collapseAllBlocks()); await m.waitForTimeout(200);
  // tarefa da Lista na mão → tocar na sublista
  const t1 = await m.evaluate(() => backlogDb[0].id);
  await m.evaluate((id) => scheduleBacklogItem(id), t1); await m.waitForTimeout(350);
  const tgt = await m.evaluate((s) => { const e = document.querySelector(s); return { alvo: e.classList.contains('sub-target'), txt: e.textContent.includes('Colocar aqui') }; }, subSel);
  // V40.44.0: a sublista começa às 07:00 (colada no começo do dia), então tem um "↓ 07:00" e a dica fala dele também
  const dica = await m.evaluate(() => [document.getElementById('floating-hint').textContent, !!document.querySelector('#blocks-container .tl-push')]);
  ok(tgt.alvo && tgt.txt && dica[0] === (dica[1] ? 'Toque num espaço livre, numa sublista ou num ↓' : 'Toque num espaço livre ou numa sublista'), 'com a tarefa na mão, a sublista mostra "Colocar aqui" e a dica fala dela');
  await foto(m, 'cel-sublista-mao.png');
  await m.tap(`${subSel} .sub-drop`); await m.waitForTimeout(350);
  ok(await m.evaluate(([id, t]) => db.find((b) => b.id === id).cards.length === 4 && !backlogDb.some((x) => x.id === t) && pendingIntent === null, [S1, t1]), 'tocar em "Colocar aqui": a tarefa entra na sublista e sai da Lista');
  // marcar com o dedo
  await m.tap(`${subSel} .sub-card:nth-child(1) .sub-ck`); await m.waitForTimeout(200);
  ok(await m.evaluate((id) => db.find((b) => b.id === id).cards[0].done, S1), 'tocar no círculo do cartão marca');
  const lay = await m.evaluate((s) => {
    const e = document.querySelector(s), r = e.getBoundingClientRect();
    const rows = [...e.querySelectorAll('.sub-card')].map((c) => { const cr = c.getBoundingClientRect(), ck = c.querySelector('.sub-ck').getBoundingClientRect(); return cr.left >= r.left && cr.right <= r.right + 0.5 && cr.bottom <= r.bottom + 0.5 && ck.width >= 22; });
    return { n: rows.length, cabem: rows.every(Boolean), more: (e.querySelector('.sub-more') || {}).textContent || '' };
  }, subSel);
  ok(lay.n === 4 && lay.cabem && lay.more === '', `1h: os ${lay.n} cartões cabem dentro da sublista (círculo de 22 px), sem "+N"`);
  await foto(m, 'cel-sublista.png');
  // abrir o cartão
  await m.tap(`${subSel} .sub-card:nth-child(2) .sub-card-title`); await m.waitForTimeout(350);
  const md = await m.evaluate(() => { const e = document.getElementById('sub-card-modal'), r = e.getBoundingClientRect(); return { aberto: !e.classList.contains('hidden'), cabe: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, nome: document.getElementById('sub-card-title').value }; });
  ok(md.aberto && md.cabe && md.nome === 'Responder o Anderson', 'tocar no nome abre o cartão, inteiro na tela');
  await foto(m, 'cel-sublista-cartao.png');
  await m.tap('#sub-card-modal button:has-text("Cancelar")'); await m.waitForTimeout(250);
  // arrastar a sublista com o dedo (meia hora pra baixo = 90 px)
  const st0 = await m.evaluate((id) => db.find((b) => b.id === id).startMin, S1);
  const h = await rect(`${subSel} .drag-handle`);
  await touch('touchStart', { x: h.x, y: h.top + 12 }); await m.waitForTimeout(60);
  await glide({ x: h.x, y: h.top + 12 }, { x: h.x, y: h.top + 12 + 90 }); await drop();
  ok(await m.evaluate((id) => db.find((b) => b.id === id).startMin, S1) === st0 + 30, 'arrastar a sublista pela alça leva os cartões junto (+30 min)');
  // vagos ocultos
  await m.evaluate(() => { db.push({ id: 'f_vb1', date: '2030-07-12', startMin: 780, duration: 60, title: 'Almoço', type: 'focus', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline(); });
  await m.waitForTimeout(200);
  const altura0 = await m.evaluate(() => parseFloat(document.getElementById('timeline-container').style.height));
  await m.tap('#ag-more-btn'); await m.waitForTimeout(200); // V40.49.0: o "Compactar os vagos" fica no ⋯
  await m.tap('#tl-compact-btn'); await m.waitForTimeout(150);
  await m.evaluate(() => closeAgMore()); await m.waitForTimeout(250);
  const vg = await m.evaluate(() => {
    const g = [...document.querySelectorAll('#blocks-container .tl-gap')];
    return { n: g.length, alt: parseFloat(document.getElementById('timeline-container').style.height), textos: g.map((x) => x.textContent.trim()), cabem: g.every((x) => { const t = x.querySelector('.tl-gap-txt'); return t.scrollWidth <= t.clientWidth + 1; }), botao: document.getElementById('tl-compact-btn').classList.contains('tl-compact-on') };
  });
  ok(vg.botao && vg.n === 3 && vg.alt < altura0 / 3 && vg.cabem, `ocultar vagos: ${vg.n} faixas (${vg.textos.join(' | ')}), a agenda do dia cai de ${altura0} px pra ${vg.alt} px e o texto cabe`);
  await m.evaluate(() => { document.getElementById('timeline-scroll').scrollTop = 0; }); await m.waitForTimeout(150);
  await foto(m, 'cel-vagos.png');
  const gapPick = await m.evaluate(() => document.querySelectorAll('#blocks-container .tl-gap').length);
  const gp = await rect('#blocks-container .tl-gap');
  await m.touchscreen.tap(gp.x, gp.y); await m.waitForTimeout(120); await m.touchscreen.tap(gp.x, gp.y); await m.waitForTimeout(450); // V40.25.1: dois toques
  const sheet = await m.evaluate(() => ({ aberto: !document.getElementById('bottom-sheet').classList.contains('translate-y-full'), botao: document.getElementById('commit-intent-btn').textContent.trim() }));
  ok(gapPick === 3 && sheet.aberto && /^Inserir às \d\d:\d\d$/.test(sheet.botao), 'dois toques numa faixa abrem o + com "' + sheet.botao + '"');
  await m.evaluate(() => closeAllSheets()); await m.waitForTimeout(300);
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(250);
  const n360 = await m.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return [...e.querySelectorAll('.sub-card')].every((c) => { const cr = c.getBoundingClientRect(); return cr.right <= r.right + 0.5; }) && [...document.querySelectorAll('.tl-gap-txt')].every((t) => t.scrollWidth <= t.clientWidth + 1); }, subSel);
  ok(n360, 'tela de 360 px: os cartões cabem na sublista e o texto das faixas também');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(150);
  await m.tap('#ag-more-btn'); await m.waitForTimeout(200);
  await m.tap('#tl-compact-btn'); await m.waitForTimeout(150);
  await m.evaluate(() => closeAgMore()); await m.waitForTimeout(200);
  ok(await m.evaluate(() => !document.querySelector('.tl-gap') && localStorage.getItem('tb__vagos_compactos') === '0'), 'tocar de novo mostra os vagos');
  }

  {
  console.log('\nJ) Desfazer (V40.25.0):');
  await m.setViewportSize({ width: 390, height: 844 });
  await m.evaluate(() => { closeAllSheets(); undoStack = []; redoStack = []; undoBarHide(); activeColumnId = 'col_geral'; openListSheet(); });
  await m.waitForTimeout(600);
  const geo = () => m.evaluate(() => {
    const b = document.getElementById('undo-bar'), r = b.getBoundingClientRect(), fab = document.getElementById('fab-btn').getBoundingClientRect(), lst = document.getElementById('list-btn').getBoundingClientRect();
    const msg = document.getElementById('undo-bar-msg'), hit = document.elementFromPoint(r.left + r.width - 30, r.top + r.height / 2);
    return { vis: !b.classList.contains('hidden') && r.height > 0, meio: Math.abs((r.left + r.right) / 2 - innerWidth / 2), acimaDosBotoes: r.bottom <= Math.min(fab.top, lst.top) - 4, cabe: r.left >= 8 && r.right <= innerWidth - 8,
      cortaTexto: msg.scrollWidth > msg.clientWidth + 1, temReticencias: getComputedStyle(msg).textOverflow === 'ellipsis', naFrente: !!hit && b.contains(hit), alt: r.height, bottom: innerHeight - r.bottom, texto: msg.textContent };
  });
  const g0 = await m.evaluate(() => backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral').map((x) => x.id));
  await m.evaluate((id) => requestDeleteBacklog(id), g0[1]); await m.waitForTimeout(250);
  await m.tap('#backlog-delete-modal [onclick="confirmDeleteBacklog()"]'); await m.waitForTimeout(350);
  let gb = await geo();
  ok(gb.vis && gb.texto === 'Tarefa apagada' && gb.meio < 2 && gb.acimaDosBotoes && gb.cabe && gb.naFrente, `apagou com o dedo: a barrinha aparece no meio, ${Math.round(gb.bottom)} px acima do fundo, acima do + e da Lista, por cima da tela da Lista`);
  await foto(m, 'cel-desfazer.png');
  await m.tap('#undo-bar-undo'); await m.waitForTimeout(300);
  ok(JSON.stringify(await m.evaluate(() => backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral').map((x) => x.id))) === JSON.stringify(g0) && await m.evaluate((id) => !!document.querySelector(`[data-bl-card="${id}"]`), g0[1]), 'tocar em Desfazer: a tarefa volta no mesmo lugar, na tela');
  gb = await geo();
  ok(gb.vis && gb.texto === 'Desfeito: tarefa apagada' && await m.evaluate(() => !document.getElementById('undo-bar-redo').classList.contains('hidden')), 'a barrinha mostra "Desfeito: tarefa apagada" + Refazer');
  // dois botões numa tela estreita
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(150);
  await m.evaluate(() => { const l = backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral'); requestDeleteBacklog(l[2].id); confirmDeleteBacklog(); });
  await m.waitForTimeout(80);
  await m.evaluate(() => { const l = backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral'); requestDeleteBacklog(l[3].id); confirmDeleteBacklog(); });
  await m.waitForTimeout(80);
  await m.tap('#undo-bar-undo'); await m.waitForTimeout(250);
  gb = await geo();
  const dois = await m.evaluate(() => ['undo-bar-redo', 'undo-bar-undo'].every((id) => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return !e.classList.contains('hidden') && r.width >= 60 && r.height >= 32 && e.scrollWidth <= e.clientWidth + 1; }));
  ok(gb.vis && gb.cabe && dois && (!gb.cortaTexto || gb.temReticencias), `360 px com Refazer e Desfazer: tudo cabe (botões de ${Math.round(gb.alt)} px de altura), o texto encurta com "…"`);
  await foto(m, 'cel-desfazer-360.png');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(150);
  // janelinha aberta: a barrinha sai
  await m.evaluate(() => { const l = backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral'); requestDeleteBacklog(l[0].id); confirmDeleteBacklog(); });
  await m.waitForTimeout(150);
  ok((await geo()).vis, 'outra ação: a barrinha aparece');
  await m.evaluate(() => { const l = backlogDb.filter((x) => (x.columnId || 'col_geral') === 'col_geral'); requestDeleteBacklog(l[0].id); }); await m.waitForTimeout(250);
  ok(!(await geo()).vis, 'abriu a janelinha de confirmar: a barrinha sai da frente');
  await m.tap('#backlog-delete-modal [onclick="cancelDeleteBacklog()"]'); await m.waitForTimeout(250);
  // tarefa na mão: a barrinha fica acima da faixa
  await m.evaluate(() => { closeAllSheets(); activeDateObj = new Date(2026, 10, 18); renderTimeline(); scheduleBacklogItem(backlogDb[0].id); });
  await m.waitForTimeout(400);
  await m.evaluate(() => { const b = db.find((x) => x.date === '2026-11-17'); toggleBlockCompletion(b.id, { stopPropagation() {} }); });
  await m.waitForTimeout(150);
  const ft = await m.evaluate(() => { const f = document.getElementById('floating-task').getBoundingClientRect(), r = document.getElementById('undo-bar').getBoundingClientRect(); return { vis: !document.getElementById('undo-bar').classList.contains('hidden'), acima: r.bottom <= f.top - 4 }; });
  ok(ft.vis && ft.acima, 'com a tarefa na mão, a barrinha aparece acima da faixa (não cobre os botões de tempo)');
  await foto(m, 'cel-desfazer-mao.png');
  await m.evaluate(() => cancelPendingTask()); await m.waitForTimeout(150);
  await m.tap('#undo-bar-undo'); await m.waitForTimeout(250);
  ok(await m.evaluate(() => !db.find((x) => x.date === '2026-11-17').completed), 'tocar em Desfazer desfaz a conclusão');
  // digitando: a barrinha não cobre o campo
  await m.evaluate(() => { closeAllSheets(); openSearchBar(); }); await m.waitForTimeout(300);
  await m.tap('#search-input'); await m.waitForTimeout(150);
  await m.evaluate(() => { const b = db.find((x) => x.date === '2026-11-17'); toggleBlockCompletion(b.id, { stopPropagation() {} }); });
  await m.waitForTimeout(150);
  ok(!(await geo()).vis, 'com o teclado aberto num campo, a barrinha não aparece por cima');
  await m.evaluate(() => { closeSearchBar(); closeAllSheets(); fazUndo(); undoBarHide(); });
  }

  {
  console.log('\nK) Dois toques no horário vazio (V40.25.1):');
  await m.setViewportSize({ width: 390, height: 844 });
  await m.evaluate(() => { closeAllSheets(); if (pendingIntent) cancelPendingTask(); activeDateObj = new Date(2026, 10, 25); renderTimeline(); localStorage.removeItem('tb__dica_dois_toques'); });
  await m.waitForTimeout(300);
  // rola até as 09:30 ficarem no meio da tela e acha o ponto da tela que é 09:30
  const ponto = (min) => m.evaluate((min) => {
    const sc = document.getElementById('timeline-scroll'), el = document.querySelector('#blocks-container .block-item.bg-hatched');
    sc.scrollTop = Math.max(0, tlY(min) - sc.clientHeight / 2);
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + (tlY(min) - tlY(Number(el.dataset.start || 420))) + 1 };
  }, min);
  await m.evaluate(() => { const el = document.querySelector('#blocks-container .block-item.bg-hatched'); el.dataset.start = String(START_HOUR * 60); });
  let pt = await ponto(570);
  await m.waitForTimeout(150);
  await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(650);
  const um = await m.evaluate(() => ({ aberto: !document.getElementById('bottom-sheet').classList.contains('translate-y-full'), dica: document.getElementById('toast-msg').textContent, visivel: !document.getElementById('toast').classList.contains('opacity-0') }));
  ok(!um.aberto && um.visivel && um.dica === 'Toque 2 vezes no Tempo Livre pra pôr um cartão ali', 'um toque de verdade no Tempo Livre não abre nada e explica: "' + um.dica + '"');
  await m.waitForTimeout(2600);
  pt = await ponto(570);
  await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(120); await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(500);
  const dois = await m.evaluate(() => ({ aberto: !document.getElementById('bottom-sheet').classList.contains('translate-y-full'), botao: document.getElementById('commit-intent-btn').textContent.trim(), zoom: window.visualViewport ? window.visualViewport.scale : 1 }));
  ok(dois.aberto && dois.botao === 'Inserir às 09:30' && dois.zoom === 1, 'dois toques de verdade nas 09:30: abre o + com "' + dois.botao + '" (e a tela não dá zoom)');
  await foto(m, 'cel-dois-toques.png');
  await m.fill('#task-input', 'Dois toques');
  await m.tap('#commit-intent-btn'); await m.waitForTimeout(400);
  ok(await m.evaluate(() => db.some((b) => b.date === '2026-11-25' && b.title === 'Dois toques' && b.startMin === 570)), 'tocou em "Inserir às 09:30": o cartão entra às 09:30');
  // perto de um bloco (o de cima termina 10:00 agora): dois toques nas 10:50 → 10:45
  pt = await ponto(650);
  await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(120); await m.touchscreen.tap(pt.x, pt.y); await m.waitForTimeout(500);
  ok(/^Inserir às 1[01]:\d\d$/.test(await m.evaluate(() => document.getElementById('commit-intent-btn').textContent.trim())), 'no vago de baixo também: "' + await m.evaluate(() => document.getElementById('commit-intent-btn').textContent.trim()) + '"');
  await m.evaluate(() => { closeAllSheets(); db = db.filter((b) => b.date !== '2026-11-25'); saveDb(); renderTimeline(); });
  }

  {
  console.log('\nL) Agenda afastada: pinça de verdade, 2 e 3 dias (V40.26.0):');
  await m.setViewportSize({ width: 390, height: 844 });
  await m.evaluate(() => { closeAllSheets(); if (pendingIntent) cancelPendingTask(); setTlDays(1, '2026-11-15'); document.getElementById('timeline-scroll').scrollTop = 0; });
  await m.waitForTimeout(300);
  const pinca = async (de, para) => { // dois dedos na agenda, de 'de' px até 'para' px de distância
    const cx = 210, y = 520;
    await touch('touchStart', { x: cx - de / 2, y }, { x: cx + de / 2, y }); await m.waitForTimeout(40);
    for (let i = 1; i <= 6; i++) { const dd = de + (para - de) * i / 6; await touch('touchMove', { x: cx - dd / 2, y: y + i }, { x: cx + dd / 2, y: y + i }); await m.waitForTimeout(30); }
    await touch('touchEnd'); await m.waitForTimeout(450);
  };
  await pinca(220, 90);
  const ver = () => m.evaluate(() => {
    const cols = [...document.querySelectorAll('#blocks-container .tl-col')], heads = [...document.querySelectorAll('#tl-dayhead .tl-dh')];
    const r = cols.map((c) => c.getBoundingClientRect());
    return {
      dias: tlDays, n: cols.length, datas: cols.map((c) => c.dataset.date),
      iguais: r.every((x) => Math.abs(x.width - r[0].width) < 1), juntas: r.every((x, i) => !i || Math.abs(x.left - r[i - 1].right) < 1),
      alinhados: heads.length === cols.length && heads.every((h, i) => { const hr = h.getBoundingClientRect(), mid = (hr.left + hr.right) / 2; return mid > r[i].left && mid < r[i].right; }),
      nomesCabem: heads.every((h) => h.scrollWidth <= h.clientWidth + 1),
      textoCabe: [...document.querySelectorAll('.tl-mini .tl-mini-title')].every((t) => t.scrollWidth <= t.clientWidth + 1),
      dentroDaTela: r.every((x) => x.left >= 0 && x.right <= innerWidth),
      reguaLivre: !r.length || r[0].left >= document.getElementById('y-axis').getBoundingClientRect().right - 1,
      topoLivre: cols.length ? document.querySelector('#blocks-container .tl-mini').getBoundingClientRect().top >= document.querySelector('header').getBoundingClientRect().bottom - 1 : true,
    };
  });
  let v = await ver();
  ok(v.dias === 2 && v.n === 2 && v.datas.join() === '2026-11-15,2026-11-16', 'fechar dois dedos de verdade na agenda: 2 dias (15 e 16)');
  ok(v.iguais && v.juntas && v.alinhados && v.nomesCabem && v.dentroDaTela && v.reguaLivre, 'colunas iguais, lado a lado, com o nome de cada dia em cima da coluna dele e a régua de horas livre');
  ok(v.textoCabe && v.topoLivre, 'o nome dos blocos quebra dentro da coluna e nada fica escondido embaixo do topo');
  await pinca(220, 90);
  v = await ver();
  ok(v.dias === 3 && v.n === 3 && v.iguais && v.alinhados && v.nomesCabem && v.textoCabe, 'de novo: 3 dias, tudo no lugar');
  await foto(m, 'cel-agenda-3dias.png');
  // arrastar um dedo pra esquerda: anda um dia
  await touch('touchStart', { x: 320, y: 600 }); await m.waitForTimeout(30);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', { x: 320 - i * 25, y: 600 + i }); await m.waitForTimeout(20); }
  await touch('touchEnd'); await m.waitForTimeout(400);
  ok((await ver()).datas.join() === '2026-11-16,2026-11-17,2026-11-18', 'arrastar um dedo pra esquerda: anda um dia (16, 17 e 18)');
  // 360 px
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(300);
  v = await ver();
  ok(v.n === 3 && v.iguais && v.alinhados && v.nomesCabem && v.textoCabe && v.dentroDaTela, 'numa tela de 360 px os 3 dias também cabem');
  await foto(m, 'cel-agenda-3dias-360.png');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(300);
  // tocar num bloco: abre o dia dele, com o cartão aberto
  const alvo = await m.evaluate(() => { const e = document.querySelector('#blocks-container .tl-col[data-date="2026-11-17"] .tl-mini'), r = e.getBoundingClientRect(); return { id: e.dataset.miniId, x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 20) }; });
  await m.touchscreen.tap(alvo.x, alvo.y); await m.waitForTimeout(500);
  const ab = await m.evaluate((id) => ({ dias: tlDays, dia: getActiveDateStr(), aberto: !!(db.find((b) => b.id === id) || {}).expanded, naTela: (() => { const e = document.querySelector(`#blocks-container .block-item[data-block-id="${id}"]`); if (!e) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; })() }), alvo.id);
  ok(ab.dias === 1 && ab.dia === '2026-11-17' && ab.aberto && ab.naTela, 'tocar num bloco do dia 17: abre o dia 17 com o cartão dele aberto, na tela');
  await foto(m, 'cel-agenda-abriu-dia.png');
  // abrir os dedos volta (pinça ao contrário a partir de 2 dias)
  await m.evaluate(() => { collapseAllBlocks(); setTlDays(2); }); await m.waitForTimeout(300);
  await pinca(90, 240);
  ok((await ver()).dias === 1, 'abrir os dedos em 2 dias: volta pra 1 dia');
  await m.evaluate(() => setTlDays(1)); await m.waitForTimeout(200);
  }

  {
  console.log('\nM) Sublista arrastando no celular, com o dedo de verdade (V40.30.0):');
  await m.setViewportSize({ width: 390, height: 844 });
  const DIA = '2030-07-10';
  await m.evaluate((DIA) => {
    closeAllSheets(); if (pendingIntent) cancelPendingTask(); setTlDays(1); if (tlCompact) toggleTlCompact();
    const b = (id, st, dur, title, extra) => Object.assign({ id, date: DIA, startMin: st, duration: dur, title, type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, extra || {});
    db = db.filter((x) => x.date !== DIA).concat([
      b('f_m_s1', 480, 45, 'Rápidas', { cards: [
        { id: 'cd_m1', title: 'Pagar boleto', done: false, microblocks: [], duration: 25 },
        { id: 'cd_m2', title: 'Ligar pro cartório', done: false, microblocks: [] },
        { id: 'cd_m3', title: 'Responder o Anderson', done: false, microblocks: [] }] }),
      b('f_m_n', 570, 30, 'Reunião'),
      b('f_m_s2', 600, 30, 'Casa', { cards: [] }),
      b('f_m_x', 630, 30, 'Comprar pão', { microblocks: [{ id: 'mb_m1', title: 'Padaria', done: false }] }),
    ]);
    saveDb(); activeDateObj = new Date(2030, 6, 10); renderTimeline();
    const sc = document.getElementById('timeline-scroll'), cr = document.getElementById('blocks-container').getBoundingClientRect();
    sc.scrollTop += cr.top + tlY(450) - 184; // 07:30 logo abaixo do topo
  }, DIA);
  await m.waitForTimeout(350);
  const yDe = (min) => m.evaluate((min) => document.getElementById('blocks-container').getBoundingClientRect().top + tlY(min) + 2, min);
  const rowPt = (bid, i) => m.evaluate(([bid, i]) => { const r = document.querySelectorAll(`#blocks-container .block-item[data-block-id="${bid}"] .sub-card`)[i].querySelector('.sub-card-title').getBoundingClientRect(); return { x: r.left + Math.min(60, r.width / 2), y: r.top + r.height / 2 }; }, [bid, i]);
  const sel = (id) => `#blocks-container .block-item[data-block-id="${id}"]`;
  const getB = (id) => m.evaluate((id) => db.find((b) => b.id === id) || null, id);
  const scrollTop = () => m.evaluate(() => document.getElementById('timeline-scroll').scrollTop);
  // 1) cartão → horário livre
  let p0 = await rowPt('f_m_s1', 0);
  const sc0 = await scrollTop();
  await press(p0);
  await glide(p0, { x: p0.x, y: await yDe(545) }, 10); await m.waitForTimeout(120);
  const durante = await m.evaluate(() => { const l = document.querySelector('#blocks-container .sub-land'), g = document.querySelector('.sub-ghost'); return { land: l ? l.textContent : null, vis: !!l && l.style.display !== 'none', ghost: !!g, src: !!document.querySelector('.sub-card.sub-src') }; });
  ok(durante.ghost && durante.src && durante.vis && durante.land === '09:05 - 09:30', `segurar o cartão e arrastar: ele sai acompanhando o dedo e o contorno mostra "${durante.land}"`);
  ok(Math.abs((await scrollTop()) - sc0) < 2, 'a agenda não rola junto com o dedo');
  await foto(m, 'cel-sublista-arrastando.png');
  await drop();
  const nb = await m.evaluate((DIA) => db.find((b) => b.date === DIA && b.title === 'Pagar boleto') || null, DIA);
  ok(nb && nb.startMin === 545 && nb.duration === 25 && (await getB('f_m_s1')).cards.length === 2, 'soltou: virou bloco às 09:05 (25 min) e saiu da sublista');
  ok(await m.evaluate(() => !document.querySelector('.sub-ghost') && !document.querySelector('.sub-land') && subDrag === null && document.getElementById('sub-card-modal').classList.contains('hidden')), 'a cópia e o contorno somem, e soltar não abre o cartão');
  await m.waitForTimeout(450);
  // 2) cartão → outra sublista
  p0 = await rowPt('f_m_s1', 0);
  await press(p0);
  const casa = await rect(sel('f_m_s2'));
  await glide(p0, { x: p0.x, y: casa.y }, 10); await m.waitForTimeout(100);
  ok(await m.evaluate(() => document.querySelector('#blocks-container .block-item[data-block-id="f_m_s2"]').classList.contains('sub-over')), 'em cima da sublista Casa ela fica marcada ("Soltar aqui")');
  await foto(m, 'cel-sublista-soltar-aqui.png');
  await drop();
  ok(JSON.stringify((await getB('f_m_s2')).cards.map((c) => c.id)) === '["cd_m2"]' && (await getB('f_m_s1')).cards.length === 1, 'soltou: o cartão mudou pra sublista Casa');
  await m.waitForTimeout(450);
  // 3) bloco pela alça → sublista
  await m.evaluate(() => undoBarHide()); await m.waitForTimeout(250); // a barrinha do Desfazer fica por cima do bloco de baixo
  const hx = await rect(`${sel('f_m_x')} .drag-handle`);
  const de = { x: hx.x, y: hx.top + 12 };
  await touch('touchStart', de); await m.waitForTimeout(60);
  await glide(de, { x: de.x, y: casa.y }, 8); await m.waitForTimeout(100);
  const marca = await m.evaluate(() => ({ sub: document.querySelector('#blocks-container .block-item[data-block-id="f_m_s2"]').classList.contains('sub-over'), bloco: document.querySelector('#blocks-container .block-item[data-block-id="f_m_x"]').classList.contains('into-sub') }));
  ok(marca.sub && marca.bloco, 'bloco arrastado pela alça em cima da sublista: ela fica marcada e o bloco meio transparente');
  await foto(m, 'cel-bloco-pra-sublista.png');
  await drop();
  const casa2 = await getB('f_m_s2');
  ok(!(await getB('f_m_x')) && casa2.cards.length === 2 && casa2.cards[1].title === 'Comprar pão' && casa2.cards[1].duration === 30 && casa2.cards[1].microblocks[0].title === 'Padaria', 'soltou: o bloco virou cartão da Casa (com o tempo e a checklist)');
  await m.waitForTimeout(450);
  // 4) segurar e soltar sem mexer: nada muda; 5) toque simples abre
  p0 = await rowPt('f_m_s1', 0);
  await press(p0); await drop();
  ok((await getB('f_m_s1')).cards.length === 1 && await m.evaluate(() => document.getElementById('sub-card-modal').classList.contains('hidden') && !document.querySelector('.sub-ghost')), 'segurar e soltar sem mexer: nada muda e o cartão não abre');
  await m.waitForTimeout(450);
  await m.touchscreen.tap(p0.x, p0.y); await m.waitForTimeout(350);
  ok(await m.evaluate(() => !document.getElementById('sub-card-modal').classList.contains('hidden')), 'toque simples no nome continua abrindo o cartão');
  await m.evaluate(() => closeSubCard()); await m.waitForTimeout(250);
  // 6) arrastar rápido em cima do cartão = rolar a agenda
  const s1 = await scrollTop();
  await touch('touchStart', p0);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', { x: p0.x, y: p0.y - i * 30 }); await m.waitForTimeout(16); }
  await touch('touchEnd'); await m.waitForTimeout(500);
  ok((await scrollTop()) > s1 + 40 && await m.evaluate(() => subDrag === null && !document.querySelector('.sub-ghost')), `deslizar o dedo rápido em cima de um cartão rola a agenda (${Math.round(s1)} → ${Math.round(await scrollTop())} px), sem arrastar`);
  await m.evaluate(() => { const sc = document.getElementById('timeline-scroll'), cr = document.getElementById('blocks-container').getBoundingClientRect(); sc.scrollTop += cr.top + tlY(450) - 184; });
  await m.waitForTimeout(300);
  // 7) perto do fim da tela a agenda rola sozinha; toque cancelado não muda nada
  p0 = await rowPt('f_m_s1', 0);
  const s2 = await scrollTop();
  await press(p0);
  await glide(p0, { x: p0.x, y: 830 }, 10); await m.waitForTimeout(700);
  const rolou = (await scrollTop()) - s2;
  ok(rolou > 60, `cartão perto do fim da tela: a agenda rola sozinha (${Math.round(rolou)} px)`);
  await drop('touchCancel');
  ok((await getB('f_m_s1')).cards.length === 1 && await m.evaluate(() => subDrag === null && !document.querySelector('.sub-ghost')), 'toque cancelado pelo sistema: nada muda');
  await m.evaluate((DIA) => { db = db.filter((b) => b.date !== DIA); saveDb(); activeDateObj = new Date(); renderTimeline(); }, DIA);
  }

  {
  console.log('\nN) Dias lado a lado: arrastar bloco de um dia pro outro com o dedo (V40.31.0):');
  await m.setViewportSize({ width: 390, height: 844 });
  const DS = ['2030-07-10', '2030-07-11', '2030-07-12', '2030-07-13']; // qua, qui, sex, sáb
  await m.evaluate((DS) => {
    closeAllSheets(); if (pendingIntent) cancelPendingTask(); undoBarHide();
    const b = (id, date, st, dur, title, extra) => Object.assign({ id, date, startMin: st, duration: dur, title, type: 'focus', theme: 'focus', tagId: null, microblocks: [], completed: false, linkedNoteIds: [] }, extra || {});
    db = db.filter((x) => !DS.includes(x.date)).concat([
      b('f_n_a', DS[0], 480, 60, 'Reunião'),
      b('f_n_b', DS[1], 540, 60, 'Almoço'),
      b('f_n_s', DS[2], 480, 60, 'Rápidas', { cards: [] }),
    ]);
    saveDb(); localStorage.setItem('tb__dica_arrastar_dias', '3');
    setTlDays(3, DS[0]);
    const sc = document.getElementById('timeline-scroll'), cr = document.getElementById('blocks-container').getBoundingClientRect();
    sc.scrollTop += cr.top + tlY(450) - 200; // 07:30 logo abaixo do topo
  }, DS);
  await m.waitForTimeout(350);
  const miniSel = (id) => `#blocks-container .tl-mini[data-mini-id="${id}"]`;
  const colMid = (i) => m.evaluate((i) => { const r = document.querySelectorAll('#blocks-container .tl-col')[i].getBoundingClientRect(); return r.left + r.width / 2; }, i);
  const yDe = (min) => m.evaluate((min) => document.getElementById('blocks-container').getBoundingClientRect().top + tlY(min), min);
  const dias = () => m.evaluate(() => tlMultiDays().join());
  const getB = (id) => m.evaluate((id) => db.find((b) => b.id === id) || null, id);
  const scTop = () => m.evaluate(() => document.getElementById('timeline-scroll').scrollTop);
  // 1) quarta 08:00 → quinta 10:00
  let ra = await rect(miniSel('f_n_a'));
  const de = { x: ra.x, y: ra.top + 12 }, s0 = await scTop();
  await press(de);
  const para = { x: await colMid(1), y: (await yDe(600)) + 12 };
  await glide(de, para, 10); await m.waitForTimeout(120);
  const durante = await m.evaluate(() => { const t = document.querySelector('.tl-drag-tip'), el = document.querySelector('.tl-mini.tl-dragging'); return { tip: t ? t.textContent : null, col: el ? el.closest('.tl-col').dataset.date : null, src: !!document.querySelector('#blocks-container .tl-src') }; });
  ok(durante.tip === 'Qui 11 · 10:00' && durante.col === DS[1] && durante.src, `segurar o bloco de verdade e levar pra coluna de quinta: ele vai junto, o balão diz "${durante.tip}" e o lugar de onde saiu fica tracejado`);
  ok(Math.abs((await scTop()) - s0) < 2, 'a agenda não rola junto com o dedo');
  await foto(m, 'cel-dias-arrastando.png');
  await drop();
  let a = await getB('f_n_a');
  ok(a.date === DS[1] && a.startMin === 600 && await m.evaluate(() => !document.querySelector('.tl-drag-tip') && blkDrag === null && tlDays === 3), 'soltou: a Reunião foi pra quinta às 10:00 (e o dia não abriu)');
  await m.waitForTimeout(450);
  // 2) batendo no Almoço: encosta
  ra = await rect(miniSel('f_n_a'));
  await press({ x: ra.x, y: ra.top + 12 });
  await glide({ x: ra.x, y: ra.top + 12 }, { x: ra.x, y: (await yDe(560)) + 12 }, 6); await m.waitForTimeout(100);
  ok(await m.evaluate(() => document.querySelector('.tl-drag-tip').textContent) === 'Qui 11 · 10:00', 'em cima do Almoço (09:00–10:00) ele encosta logo depois: "Qui 11 · 10:00"');
  await drop();
  ok((await getB('f_n_a')).startMin === 600, 'soltou ali: continua às 10:00 (não mudou nada)');
  await m.waitForTimeout(450);
  // 3) parado na borda da direita: os dias andam
  ra = await rect(miniSel('f_n_a'));
  await press({ x: ra.x, y: ra.top + 12 });
  const borda = await m.evaluate(() => document.getElementById('blocks-container').getBoundingClientRect().right - 4);
  await glide({ x: ra.x, y: ra.top + 12 }, { x: borda, y: (await yDe(600)) + 12 }, 10);
  await m.waitForTimeout(900);
  ok((await dias()) === DS.slice(1).join(), 'parado na borda da direita: os dias andam (qui, sex, sáb)');
  await glide({ x: borda, y: (await yDe(600)) + 12 }, { x: await colMid(2), y: (await yDe(600)) + 12 }, 4); await m.waitForTimeout(80);
  ok(await m.evaluate(() => document.querySelector('.tl-drag-tip').textContent) === 'Sáb 13 · 10:00', 'balão: "Sáb 13 · 10:00"');
  await drop();
  a = await getB('f_n_a');
  ok(a.date === DS[3] && a.startMin === 600, 'soltou: foi pro sábado às 10:00');
  await m.waitForTimeout(450);
  // 4) em cima da sublista: entra
  await m.evaluate((d0) => setTlDays(3, d0), DS[1]); await m.waitForTimeout(250);
  ra = await rect(miniSel('f_n_a'));
  const rs = await rect(miniSel('f_n_s'));
  await press({ x: ra.x, y: ra.top + 12 });
  await glide({ x: ra.x, y: ra.top + 12 }, { x: rs.x, y: rs.y }, 10); await m.waitForTimeout(100);
  ok(await m.evaluate(() => document.querySelector('#blocks-container .tl-mini[data-mini-id="f_n_s"]').classList.contains('sub-over') && document.querySelector('.tl-drag-tip').textContent === 'Soltar na sublista'), 'em cima da sublista de sexta: ela acende e o balão diz "Soltar na sublista"');
  await foto(m, 'cel-dias-sublista.png');
  await drop();
  ok(!(await getB('f_n_a')) && (await getB('f_n_s')).cards.length === 1, 'soltou: a Reunião virou cartão da sublista');
  await m.waitForTimeout(450);
  // 5) deslizar rápido pro lado em cima de um bloco: anda um dia (não arrasta)
  await m.evaluate((d0) => setTlDays(3, d0), DS[0]); await m.waitForTimeout(250);
  const rb = await rect(miniSel('f_n_b'));
  await touch('touchStart', { x: rb.x, y: rb.y }); await m.waitForTimeout(30);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', { x: rb.x - i * 25, y: rb.y + i }); await m.waitForTimeout(20); }
  await touch('touchEnd'); await m.waitForTimeout(400);
  ok((await dias()) === DS.slice(1).join() && (await getB('f_n_b')).date === DS[1] && await m.evaluate(() => blkDrag === null), 'deslizar rápido pro lado em cima de um bloco: anda um dia, sem arrastar');
  // 6) tocar sem segurar abre o dia
  const rb2 = await rect(miniSel('f_n_b'));
  await m.touchscreen.tap(rb2.x, rb2.y); await m.waitForTimeout(400);
  ok(await m.evaluate((d) => tlDays === 1 && getActiveDateStr() === d, DS[1]), 'tocar (sem segurar) num bloco continua abrindo o dia dele');
  await m.evaluate((DS) => { db = db.filter((b) => !DS.includes(b.date)); saveDb(); setTlDays(1); activeDateObj = new Date(); renderTimeline(); }, DS);
  }

  {
  console.log('\nO) iPhone instalado: o topo das telas fica abaixo da barra de status (V40.32.1):');
  // o Chrome não tem área segura: simula a do iPhone 13 (47 px) pela variável que o style.css usa
  const topo = (sel) => m.evaluate((sel) => {
    const out = [];
    document.querySelectorAll(sel).forEach((b) => {
      const r = b.getBoundingClientRect();
      if (!r.width) return;
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      out.push({ top: Math.round(r.top), livre: !!hit && (hit === b || b.contains(hit)) });
    });
    return out;
  }, sel);
  const telas = [
    ['list-sheet', 'openListSheet()'], ['config-sheet', 'openConfigSheet()'], ['bottom-sheet', 'openSheet()'],
    ['reports-sheet', 'openReportsSheet()'], ['tags-sheet', 'openTagsSheet()'], ['period-select-sheet', 'openPeriodSelectSheet()']
  ];
  const semIphone = {};
  for (const [id, abre] of telas) {
    await m.evaluate((abre) => { closeAllSheets(); eval(abre); }, abre); await m.waitForTimeout(400);
    semIphone[id] = await m.evaluate((id) => getComputedStyle(document.getElementById(id)).paddingTop, id);
  }
  ok(Object.values(semIphone).every((p) => p === '24px'), 'sem área segura (Android, PC): o topo das telas continua 24 px (' + [...new Set(Object.values(semIphone))].join(', ') + ')');
  await m.evaluate(() => { closeAllSheets(); document.documentElement.style.setProperty('--faz-safe-top', '47px'); });
  for (const [id, abre] of telas) {
    await m.evaluate((abre) => { closeAllSheets(); eval(abre); }, abre); await m.waitForTimeout(400);
    const bs = await topo(`#${id} [data-voltar]`);
    ok(bs.length > 0 && bs.every((b) => b.top >= 47 && b.livre), `${id}: botões de fechar/voltar começam abaixo da barra de status (${bs.map((b) => b.top + ' px').join(', ')}) e dá pra tocar`);
    if (id === 'list-sheet') await foto(m, 'cel-iphone-topo-listas.png');
  }
  // Config → Períodos: o formulário com Início e Fim
  await m.evaluate(() => { closeAllSheets(); openConfigSheet(); openConfigPeriods(); }); await m.waitForTimeout(400);
  const per = await m.evaluate(() => {
    const box = document.getElementById('config-period-name').parentElement.getBoundingClientRect();
    const a = document.getElementById('config-period-start').getBoundingClientRect(), b = document.getElementById('config-period-end').getBoundingClientRect();
    return { dentro: a.left >= box.left && b.right <= box.right + 0.5 && a.right <= b.left, a: Math.round(a.width), b: Math.round(b.width), box: Math.round(box.width) };
  });
  ok(per.dentro, `Períodos: Início (${per.a} px) e Fim (${per.b} px) lado a lado, dentro do cartão (${per.box} px)`);
  await foto(m, 'cel-iphone-periodos.png');
  await m.evaluate(() => { closeAllSheets(); document.documentElement.style.removeProperty('--faz-safe-top'); });
  }
  { // V40.33.0 (bloco próprio)
  console.log('\nP) Mudar a lista de lugar com o dedo (V40.33.0):');
  await m.evaluate(() => { localStorage.clear(); }); await m.reload(); await m.waitForTimeout(900);
  await m.evaluate(() => { openListSheet(); switchListTab('backlog'); setBacklogZoom(2); }); await m.waitForTimeout(700);
  const C = await m.evaluate(() => backlogColumnsDb.map((c) => c.id));
  const ord = () => m.evaluate(() => backlogColumnsDb.map((c) => c.id));
  const dom = () => m.evaluate(() => [...document.getElementById('backlog-columns-wrapper').children].map((c) => c.dataset.columnId).filter(Boolean));
  const volta = () => m.evaluate((C) => { backlogColumnsDb.sort((a, b) => C.indexOf(a.id) - C.indexOf(b.id)); saveBacklogColumns(); undoBarHide(); document.getElementById('backlog-columns-wrapper').scrollLeft = 0; renderBacklog(); }, C);
  const hsel = (c) => `#backlog-columns-wrapper > [data-column-id="${c}"] .zoom-col-head`;
  const meio = () => m.evaluate(() => {
    const w = document.getElementById('backlog-columns-wrapper'), g = document.querySelector('.bl-col-ghost'), s = document.querySelector('#backlog-columns-wrapper > .zoom-col-slot'), src = document.querySelector('.bl-col-src');
    const gr = g && g.getBoundingClientRect(), sr = s && s.getBoundingClientRect(), wr = w.getBoundingClientRect();
    return { ghost: !!g, gw: g ? g.offsetWidth : 0, gl: gr ? Math.round(gr.left) : 0, gt: gr ? Math.round(gr.top) : 0, gOn: !!gr && gr.right > 0 && gr.left < innerWidth,
      slot: !!s, sw: sr ? Math.round(sr.width) : 0, next: s && s.nextElementSibling ? s.nextElementSibling.dataset.columnId : null,
      srcW: src ? Math.round(src.getBoundingClientRect().width) : -1, gone: !!src && src.classList.contains('bl-col-src-gone'), zoom3: w.classList.contains('zoom-3'), afast: w.classList.contains('lists-zoom'),
      sl: w.scrollLeft, before: colDrag && colDrag.beforeId, wl: Math.round(wr.left), wr: Math.round(wr.right) };
  });
  ok(await m.evaluate(() => getComputedStyle(document.querySelector('.zoom-col-head')).userSelect === 'none' && getComputedStyle(document.getElementById('backlog-column-head')).userSelect === 'none'), 'o nome da lista não seleciona texto ao segurar (nem o título de cada lista, nem o lá de cima)');

  // P1: afastado, segurar o título da 1ª e arrastar até passar o meio da 2ª
  const h0 = await rect(hsel(C[0])), h1 = await rect(hsel(C[1]));
  const col0w = await m.evaluate((c) => Math.round(document.querySelector(`#backlog-columns-wrapper > [data-column-id="${c}"]`).getBoundingClientRect().width), C[0]);
  await press(h0);
  const p0 = await meio();
  ok(p0.ghost && p0.gw === col0w && !p0.slot && p0.srcW === col0w && !p0.gone, `segurou o título: a cópia da lista (${p0.gw}px) aparece e a de origem fica no lugar, apagada`);
  await glide(h0, { x: h1.x + 40, y: h0.y + 6 });
  const p1 = await meio();
  ok(p1.slot && p1.next === C[2] && p1.gone && p1.srcW === 0 && Math.abs(p1.sw - col0w) <= 1, `arrastou pra direita: a lista de origem "sai" e o espaço tracejado (${p1.sw}px) abre depois da 2ª`);
  ok(Math.abs(p1.gl - (p0.gl + (h1.x + 40 - h0.x))) <= 2 && p1.gt === p0.gt, 'a cópia anda com o dedo só na horizontal');
  await foto(m, 'cel-lista-arrastando.png');
  await drop();
  ok((await ord()).join() === [C[1], C[0], C[2], C[3], C[4]].join() && (await dom()).join() === (await ord()).join(), 'soltou: a 1ª lista virou a 2ª (na tela e gravado)');
  ok(await m.evaluate((c) => activeColumnId === c && !document.querySelector('.bl-col-ghost, .zoom-col-slot, .bl-col-src') && !_dragState && colDrag === null && document.getElementById('backlog-form-view').classList.contains('hidden'), C[0]), 'a lista movida fica ativa; não sobra nada na tela e nenhum cartão abriu');
  await m.waitForTimeout(200);
  ok(await m.evaluate(() => !document.getElementById('undo-bar').classList.contains('hidden') && document.getElementById('undo-bar-msg').textContent === 'Lista mudou de lugar'), 'barrinha: "Lista mudou de lugar"');
  await m.tap('#undo-bar-undo'); await m.waitForTimeout(400);
  ok((await ord()).join() === C.join() && (await dom()).join() === C.join(), 'Desfazer (com o dedo): a ordem volta');

  // P2: segurar na borda: o quadro rola sozinho
  await volta(); await m.waitForTimeout(300);
  const wrR = await rect('#backlog-columns-wrapper'), hh = await rect(hsel(C[0]));
  await press(hh); await glide(hh, { x: wrR.right - 8, y: hh.y + 4 }, 10); await m.waitForTimeout(1500);
  const p2 = await meio();
  await drop();
  const o2 = await ord();
  ok(p2.sl > 150 && o2.indexOf(C[0]) >= 3 && o2.length === 5, `segurando na borda direita o quadro rola sozinho (${Math.round(p2.sl)}px) e a lista cai lá na frente (${o2.indexOf(C[0]) + 1}ª)`);
  ok(o2.join() === C.filter((c) => c !== C[0]).flatMap((c) => (c === p2.before ? [C[0], c] : [c])).concat(p2.before ? [] : [C[0]]).join(), 'cai exatamente onde o espaço tracejado estava');

  // P3: rolar o quadro passando o dedo no título (sem segurar) continua rolando
  await volta(); await m.waitForTimeout(300);
  const hs = await rect(hsel(C[1]));
  await touch('touchStart', hs); await m.waitForTimeout(30);
  await glide(hs, { x: hs.x - 150, y: hs.y }, 6); await touch('touchEnd'); await m.waitForTimeout(600);
  const p3 = await m.evaluate(() => ({ sl: document.getElementById('backlog-columns-wrapper').scrollLeft, d: colDrag }));
  ok(p3.sl > 40 && p3.d === null && (await ord()).join() === C.join(), `passar o dedo no título sem segurar rola o quadro (${Math.round(p3.sl)}px), sem arrastar a lista`);

  // P4: modo normal: segurar o nome lá em cima
  await volta(); await m.evaluate(() => setBacklogZoom(1)); await m.waitForTimeout(400);
  await m.evaluate((c) => scrollToColumn(c), C[1]); await m.waitForTimeout(900);
  const prefs = await m.evaluate(() => [localStorage.getItem('tb__lista_afastada'), localStorage.getItem('tb__lista_zoom')].join());
  const tt = await rect('#backlog-column-title');
  await press(tt); await m.waitForTimeout(80);
  const q0 = await meio();
  ok(q0.afast && q0.zoom3 && q0.ghost && q0.gOn && q0.srcW > 50, 'modo normal: segurou o nome e o quadro se afastou (3 por tela) com a lista "levantada" no meio da tela');
  await foto(m, 'cel-lista-normal-arrastando.png');
  await glide(tt, { x: tt.x + 200, y: tt.y + 10 });
  const q1 = await meio();
  await drop(); await m.waitForTimeout(300);
  const o4 = await ord(), exp4 = C.filter((c) => c !== C[1]);
  exp4.splice(q1.before ? exp4.indexOf(q1.before) : exp4.length, 0, C[1]);
  ok(q1.slot && o4.join() === exp4.join() && o4.indexOf(C[1]) >= 2, `arrastou pra direita e soltou: a 2ª lista foi pra ${o4.indexOf(C[1]) + 1}ª`);
  const q2 = await m.evaluate(() => { const w = document.getElementById('backlog-columns-wrapper'), wr = w.getBoundingClientRect(); const vis = [...w.children].find((c) => { const r = c.getBoundingClientRect(); return Math.abs(r.left + r.width / 2 - (wr.left + wr.width / 2)) < 20; }); return { afast: w.classList.contains('lists-zoom'), vis: vis && vis.dataset.columnId, ativa: activeColumnId, titulo: document.getElementById('backlog-column-title').innerText, nome: (backlogColumnsDb.find((c) => c.id === activeColumnId) || {}).name, prefs: [localStorage.getItem('tb__lista_afastada'), localStorage.getItem('tb__lista_zoom')].join() }; });
  ok(!q2.afast && q2.vis === C[1] && q2.ativa === C[1] && q2.titulo === q2.nome && q2.prefs === prefs, 'o quadro volta ao normal mostrando a mesma lista (no lugar novo) e o zoom escolhido não mudou');
  await foto(m, 'cel-lista-normal-depois.png');

  // P5: pelo menu dos 3 pontinhos
  await volta(); await m.evaluate((c) => scrollToColumn(c), C[0]); await m.waitForTimeout(800);
  await m.tap('#backlog-column-menu-btn'); await m.waitForTimeout(350);
  const mm = await m.evaluate(() => { const md = document.getElementById('column-menu-modal'), r = md.getBoundingClientRect(); const l = document.getElementById('column-menu-left'), rr = document.getElementById('column-menu-right'); return { vis: !md.classList.contains('hidden'), dentro: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, pos: document.getElementById('column-menu-pos').textContent, l: l.disabled, r: rr.disabled, lr: l.getBoundingClientRect().right <= rr.getBoundingClientRect().left }; });
  ok(mm.vis && mm.dentro && mm.pos === 'Posição 1 de 5' && mm.l && !mm.r && mm.lr, 'menu da lista: inteiro na tela, "Posição 1 de 5", Esquerda apagada e Direita do lado');
  await m.tap('#column-menu-right'); await m.waitForTimeout(250); await m.tap('#column-menu-right'); await m.waitForTimeout(250);
  ok((await ord()).indexOf(C[0]) === 2 && await m.evaluate(() => document.getElementById('column-menu-pos').textContent === 'Posição 3 de 5' && !document.getElementById('column-menu-modal').classList.contains('hidden')), 'dois toques em Direita: a lista vai pra 3ª e o menu continua aberto ("Posição 3 de 5")');
  await foto(m, 'cel-lista-menu.png');
  await m.tap('#column-menu-modal [data-voltar]'); await m.waitForTimeout(350);
  ok(await m.evaluate(() => document.getElementById('column-menu-modal').classList.contains('hidden') && !document.getElementById('undo-bar').classList.contains('hidden') && document.getElementById('undo-bar-msg').textContent === 'Lista mudou de lugar'), 'Fechar: a barrinha do Desfazer aparece');
  ok((await dom()).join() === (await ord()).join() && await m.evaluate((c) => { const w = document.getElementById('backlog-columns-wrapper'), el = document.querySelector(`#backlog-columns-wrapper > [data-column-id="${c}"]`), wr = w.getBoundingClientRect(), r = el.getBoundingClientRect(); return activeColumnId === c && Math.abs(r.left - wr.left) < 2; }, C[0]), 'no modo normal a tela já está na lista movida (lugar novo)');
  await volta(); await m.waitForTimeout(200);
  }
  await fim(errs.length ? '\nERROS DE PÁGINA: ' + errs.slice(0, 3).join(' | ') : '');
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
