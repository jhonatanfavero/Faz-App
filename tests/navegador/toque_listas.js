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
  const form = await m.evaluate(() => { const b = document.querySelector('#goals-form-view .ios-safe-bottom button').getBoundingClientRect(); return { nome: document.getElementById('goal-title-input').value, salvarNaTela: b.bottom <= innerHeight && b.top > 0, sugestoesRolam: document.getElementById('goal-templates').scrollWidth > document.getElementById('goal-templates').clientWidth }; });
  ok(form.nome === 'Beber água' && form.salvarNaTela && form.sugestoesRolam, 'Nova meta: as sugestões rolam pro lado, tocar em "Beber água" preenche, e o Salvar fica à vista');
  await foto(m, 'cel-metas-form.png');
  await m.tap('#goals-form-view .ios-safe-bottom button'); await m.waitForTimeout(300);
  await m.tap('#goals-list-view > button'); await m.waitForTimeout(250);
  await m.tap('#goal-templates button:has-text("Correr")'); await m.waitForTimeout(100);
  await m.tap('#goals-form-view .ios-safe-bottom button'); await m.waitForTimeout(300);
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
  await m.evaluate(() => { closeAllSheets(); activeDateObj = new Date(2026, 10, 18); renderTimeline(); document.getElementById('timeline-scroll').scrollTop = 0; });
  await m.waitForTimeout(300);
  await m.tap('#fab-btn'); await m.waitForTimeout(450);
  await m.fill('#task-input', 'Pendências rápidas');
  await m.tap('.sheet-dur-btn[data-time="60"]');
  await m.tap('#bottom-sheet button:has-text("Sublista")'); await m.waitForTimeout(450);
  await m.tap('#blocks-container .block-item.bg-hatched'); await m.waitForTimeout(350);
  const S1 = await m.evaluate(() => (db.find((b) => b.date === '2026-11-18' && Array.isArray(b.cards)) || {}).id);
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
  ok(tgt.alvo && tgt.txt && await m.evaluate(() => document.getElementById('floating-hint').textContent) === 'Toque num espaço livre ou numa sublista', 'com a tarefa na mão, a sublista mostra "Colocar aqui" e a dica fala dela');
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
  await m.evaluate(() => { db.push({ id: 'f_vb1', date: '2026-11-18', startMin: 780, duration: 60, title: 'Almoço', type: 'focus', theme: 'focus', microblocks: [], completed: false, linkedNoteIds: [] }); saveDb(); renderTimeline(); });
  await m.waitForTimeout(200);
  const altura0 = await m.evaluate(() => parseFloat(document.getElementById('timeline-container').style.height));
  await m.tap('#tl-compact-btn'); await m.waitForTimeout(300);
  const vg = await m.evaluate(() => {
    const g = [...document.querySelectorAll('#blocks-container .tl-gap')];
    return { n: g.length, alt: parseFloat(document.getElementById('timeline-container').style.height), textos: g.map((x) => x.textContent.trim()), cabem: g.every((x) => { const t = x.querySelector('.tl-gap-txt'); return t.scrollWidth <= t.clientWidth + 1; }), botao: document.getElementById('tl-compact-btn').classList.contains('tl-compact-on') };
  });
  ok(vg.botao && vg.n === 3 && vg.alt < altura0 / 3 && vg.cabem, `ocultar vagos: ${vg.n} faixas (${vg.textos.join(' | ')}), a agenda do dia cai de ${altura0} px pra ${vg.alt} px e o texto cabe`);
  await m.evaluate(() => { document.getElementById('timeline-scroll').scrollTop = 0; }); await m.waitForTimeout(150);
  await foto(m, 'cel-vagos.png');
  const gapPick = await m.evaluate(() => document.querySelectorAll('#blocks-container .tl-gap').length);
  const gp = await rect('#blocks-container .tl-gap');
  await m.touchscreen.tap(gp.x, gp.y); await m.waitForTimeout(450);
  const sheet = await m.evaluate(() => ({ aberto: !document.getElementById('bottom-sheet').classList.contains('translate-y-full'), botao: document.getElementById('commit-intent-btn').textContent.trim() }));
  ok(gapPick === 3 && sheet.aberto && /^Inserir às \d\d:\d\d$/.test(sheet.botao), 'tocar numa faixa abre o + com "' + sheet.botao + '"');
  await m.evaluate(() => closeAllSheets()); await m.waitForTimeout(300);
  await m.setViewportSize({ width: 360, height: 740 }); await m.waitForTimeout(250);
  const n360 = await m.evaluate((s) => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return [...e.querySelectorAll('.sub-card')].every((c) => { const cr = c.getBoundingClientRect(); return cr.right <= r.right + 0.5; }) && [...document.querySelectorAll('.tl-gap-txt')].every((t) => t.scrollWidth <= t.clientWidth + 1); }, subSel);
  ok(n360, 'tela de 360 px: os cartões cabem na sublista e o texto das faixas também');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(150);
  await m.tap('#tl-compact-btn'); await m.waitForTimeout(200);
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
  await fim(errs.length ? '\nERROS DE PÁGINA: ' + errs.slice(0, 3).join(' | ') : '');
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
