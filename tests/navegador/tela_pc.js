// Tela do PC com mouse de verdade. Agenda: arrastar o bloco na régua do Dia, puxar a borda de baixo pra mudar
// a duração, rolagem automática, Esc, e os espaços livres que aparecem ao arrastar na Semana. Listas: os 3
// pontinhos do cartão (Arquivar / Apagar) e o campo de arquivar que aparece no topo durante o arraste. V40.18.0: janela de Tags.
// V40.20.0: zoom das Listas e da Semana como colunas por tela (com arrastar e setas). V40.19.0: setas do teclado e aba Finanças.
// O jsdom não mede tela nem rola; aqui é um Chrome de verdade, com a "nuvem" de mentira do apoio.js.
// Opcional: precisa do Playwright. Uso: node tests/navegador/tela_pc.js   (CHROME=… e FOTOS=… como nos outros)
const { abrirPc } = require('./apoio');
const PXM = 3.2; // pixels por minuto da régua (igual ao kanban.html)
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
(async () => {
  const { ctx, base, ok, foto, fim, UID } = await abrirPc();
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto(base + 'kanban.html'); await p.waitForSelector('section.col'); await p.waitForTimeout(500);
  const blocos = (dia) => p.evaluate(([uid, dia]) => window.__nuvem.alive('blocos', uid).filter((b) => b.date === dia && !b.archived).sort((a, c) => a.start_min - c.start_min).map((b) => ({ id: b.id, st: b.start_min, dur: b.duration })), [UID, dia]);
  const nuvem = (id) => p.evaluate(([uid, id]) => { const b = window.__nuvem.get('blocos', uid, id); return { st: b.start_min, dur: b.duration, date: b.date }; }, [UID, id]);
  const aviso = () => p.evaluate(() => document.getElementById('toast').textContent);
  const cartaoAberto = () => p.evaluate(() => !document.getElementById('modal-task').classList.contains('hidden'));
  const caixa = (id) => p.evaluate((id) => { const el = [...document.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cls: el.className, texto: el.innerText.replace(/\s+/g, ' ').trim() }; }, id);
  const rolagem = () => p.evaluate(() => document.getElementById('ag-day').scrollTop);
  const rolarPara = async (min) => { await p.evaluate((y) => { document.getElementById('ag-day').scrollTop = y; }, (min - 7 * 60) * PXM - 250); await p.waitForTimeout(120); };
  const solta = async () => { await p.mouse.up(); await p.waitForTimeout(350); };

  await p.locator('#tab-agenda').click(); await p.waitForTimeout(300);
  console.log('A) Lembrete na barra:');
  const dica = () => p.evaluate(() => { const t = document.getElementById('ag-tip'), r = t.getBoundingClientRect(); return { texto: t.textContent, cabe: t.scrollWidth <= Math.round(r.width) + 1, visivel: getComputedStyle(t).display !== 'none' }; });
  let dk = await dica();
  ok(dk.visivel && dk.cabe && /espaço livre/.test(dk.texto), 'Semana: "' + dk.texto + '" aparece inteiro');
  await p.locator('#ag-cols .ag-day-btn[data-day="2026-11-16"]').click(); await p.waitForTimeout(300);
  dk = await dica();
  ok(dk.cabe && /Puxe a borda de baixo/.test(dk.texto), 'Dia: "' + dk.texto + '"');

  console.log('\nB) Visão Dia — arrastar pra um horário livre:');
  let dia = await blocos('2026-11-16');
  const ult = dia[dia.length - 1]; // último bloco da manhã cheia dos dados fictícios
  await rolarPara(ult.st);
  let cx = await caixa(ult.id);
  const cur = await p.evaluate((id) => { const el = [...document.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id), rz = el.querySelector('.ag-rz'); return { bloco: getComputedStyle(el).cursor, alca: getComputedStyle(rz).cursor, alt: rz.getBoundingClientRect().height, esq: rz.getBoundingClientRect().left - el.getBoundingClientRect().left }; }, ult.id);
  ok(cur.bloco === 'pointer' && cur.alca === 'ns-resize' && cur.alt === 7 && cur.esq >= 30, 'a borda de baixo tem a alça de esticar (7px) e ela não cobre o círculo de concluir');
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2 - 2); await p.mouse.down();
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2 + 100, { steps: 5 });
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2 - 2 + 120 * PXM, { steps: 8 }); await p.waitForTimeout(80);
  let meio = await caixa(ult.id);
  const origem = await p.evaluate(() => { const o = document.querySelector('.ag-origin'); return o ? o.getBoundingClientRect().y : null; });
  const cursorCorpo = await p.evaluate(() => getComputedStyle(document.body).cursor);
  ok(/ag-moving/.test(meio.cls) && Math.abs(meio.y - (cx.y + 120 * PXM)) < 1.5 && meio.texto.includes(hhmm(ult.st + 120)), 'o bloco acompanha o mouse e mostra o horário novo (' + hhmm(ult.st + 120) + ')');
  ok(origem !== null && Math.abs(origem - cx.y) < 1.5 && cursorCorpo === 'grabbing', 'o lugar de origem fica tracejado e o cursor vira "mão fechada"');
  await foto(p, 'pc-dia-arrastando.png');
  await solta();
  let g = await nuvem(ult.id);
  ok(g.st === ult.st + 120 && g.dur === ult.dur && !(await cartaoAberto()), 'soltou: gravou ' + hhmm(g.st) + ' e nenhum cartão abriu | "' + (await aviso()) + '"');

  console.log('\nC) Em cima de outro bloco:');
  dia = await blocos('2026-11-16');
  const meioDaManha = dia[dia.length - 2];
  cx = await caixa(meioDaManha.id);
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2); await p.mouse.down();
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2 - 60, { steps: 4 });
  await p.mouse.move(cx.x + 300, cx.y + cx.h / 2 - 30 * PXM, { steps: 6 }); await p.waitForTimeout(80);
  meio = await caixa(meioDaManha.id);
  const borda = await p.evaluate((id) => getComputedStyle([...document.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id)).borderTopColor, meioDaManha.id);
  ok(/ag-clash/.test(meio.cls) && /horário ocupado/.test(meio.texto) && borda === 'rgb(220, 38, 38)', 'fica vermelho e escreve "horário ocupado"');
  await foto(p, 'pc-dia-conflito.png');
  await solta();
  g = await nuvem(meioDaManha.id);
  let volta = await caixa(meioDaManha.id);
  ok(g.st === meioDaManha.st && /^Conflito!/.test(await aviso()) && Math.abs(volta.y - cx.y) < 1 && !(await cartaoAberto()), 'soltou: nada mudou e o bloco voltou | "' + (await aviso()) + '"');

  console.log('\nD) Duração pela borda de baixo:');
  const travado = dia[dia.length - 3]; // tem outro bloco encostado logo abaixo
  cx = await caixa(travado.id);
  await p.mouse.move(cx.x + 300, cx.y + cx.h - 3); await p.waitForTimeout(60);
  const alca = await p.evaluate((id) => getComputedStyle([...document.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === id).querySelector('.ag-rz'), '::after').opacity, travado.id);
  ok(Number(alca) > 0.3, 'com o mouse em cima aparece o tracinho da alça');
  await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + cx.h - 3 + 20, { steps: 3 }); await p.mouse.move(cx.x + 300, cx.y + cx.h - 3 + 64, { steps: 4 }); await p.waitForTimeout(80);
  meio = await caixa(travado.id);
  ok(/ag-sizing/.test(meio.cls) && /ag-limit/.test(meio.cls) && Math.abs(meio.h - cx.h) < 1 && /o próximo começa às/.test(meio.texto), 'bloco encostado no de baixo não cresce e explica: "' + meio.texto + '"');
  await foto(p, 'pc-dia-limite.png');
  await solta();
  g = await nuvem(travado.id);
  ok(g.dur === travado.dur && /^O próximo bloco começa às/.test(await aviso()) && !(await cartaoAberto()), 'soltou: duração igual | "' + (await aviso()) + '"');
  cx = await caixa(travado.id);
  await p.mouse.move(cx.x + 300, cx.y + cx.h - 3); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + cx.h - 13, { steps: 3 }); await p.mouse.move(cx.x + 300, cx.y + cx.h - 3 - 10 * PXM, { steps: 4 }); await p.waitForTimeout(60);
  await solta();
  g = await nuvem(travado.id);
  ok(g.dur === travado.dur - 10 && /^Duração ajustada/.test(await aviso()), 'puxar pra cima diminui: ' + travado.dur + 'm → ' + g.dur + 'm | "' + (await aviso()) + '"');
  await rolarPara(ult.st + 120);
  cx = await caixa(ult.id);
  await p.mouse.move(cx.x + 300, cx.y + cx.h - 3); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + cx.h + 27, { steps: 3 }); await p.mouse.move(cx.x + 300, cx.y + cx.h - 3 + 45 * PXM, { steps: 5 }); await p.waitForTimeout(80);
  meio = await caixa(ult.id);
  await foto(p, 'pc-dia-esticando.png');
  await solta();
  g = await nuvem(ult.id);
  ok(g.dur === ult.dur + 45 && Math.abs(meio.h - ((ult.dur + 45) * PXM - 2)) < 1 && !(await cartaoAberto()), 'bloco com espaço embaixo cresce junto com o mouse: ' + ult.dur + 'm → ' + g.dur + 'm');

  console.log('\nE) Rolagem no meio do arraste:');
  cx = await caixa(ult.id);
  const r0 = await rolagem(), tela = await p.evaluate(() => document.getElementById('ag-day').getBoundingClientRect().bottom);
  await p.mouse.move(cx.x + 300, cx.y + 10); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + 40, { steps: 3 }); await p.mouse.move(cx.x + 300, tela - 8, { steps: 6 });
  await p.waitForTimeout(900);
  const r1 = await rolagem();
  await solta();
  g = await nuvem(ult.id);
  ok(r1 > r0 + 200 && g.st > ult.st + 180 && g.st % 5 === 0, 'levar o bloco até a beirada de baixo rola a régua sozinha (' + Math.round(r0) + ' → ' + Math.round(r1) + 'px); ficou às ' + hhmm(g.st));
  cx = await caixa(ult.id);
  const r2 = await rolagem();
  await p.mouse.move(cx.x + 300, cx.y + 6); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y - 30, { steps: 4 }); await p.waitForTimeout(400);
  const r3 = await rolagem();
  await p.keyboard.press('Escape'); await p.mouse.up(); await p.waitForTimeout(200);
  ok(Math.abs(r3 - r2) < 1, 'pegar um bloco que já está na beirada e puxar pro meio não dispara a rolagem');
  await rolarPara(g.st);
  cx = await caixa(ult.id);
  await p.mouse.move(cx.x + 300, cx.y + 10); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + 30, { steps: 3 });
  const antes = await caixa(ult.id);
  await p.mouse.wheel(0, -320); await p.waitForTimeout(200);
  const depois = await caixa(ult.id);
  await solta();
  const g2 = await nuvem(ult.id);
  ok(Math.abs(depois.y - antes.y) < 6 && g2.st < g.st - 60, 'girar a roda do mouse no meio do arraste: o bloco continua debaixo do mouse e o horário acompanha (' + hhmm(g.st) + ' → ' + hhmm(g2.st) + ')');

  console.log('\nF) Esc, e os cliques de sempre:');
  await rolarPara(g2.st);
  cx = await caixa(ult.id);
  await p.mouse.move(cx.x + 300, cx.y + 10); await p.mouse.down(); await p.mouse.move(cx.x + 300, cx.y + 150, { steps: 5 });
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  volta = await caixa(ult.id);
  await solta();
  ok((await nuvem(ult.id)).st === g2.st && Math.abs(volta.y - cx.y) < 1 && !(await cartaoAberto()), 'Esc no meio do arraste: o bloco volta, nada grava e soltar o botão não abre cartão');
  cx = await caixa(ult.id);
  await p.mouse.click(cx.x + 300, cx.y + 10); await p.waitForTimeout(250);
  ok(await cartaoAberto(), 'clique simples no bloco continua abrindo o cartão');
  await p.locator('#f-cancel').click(); await p.waitForTimeout(150);
  await p.mouse.click(cx.x + 300, cx.y + cx.h - 3); await p.waitForTimeout(250);
  ok(await cartaoAberto(), 'clique simples na borda de baixo (sem puxar) também só abre o cartão');
  await p.locator('#f-cancel').click(); await p.waitForTimeout(150);
  await p.mouse.click(cx.x + 300, cx.y + cx.h + 200); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !document.getElementById('modal-task').classList.contains('hidden') && document.getElementById('f-save').textContent === 'Criar bloco'), 'clique num horário vazio continua criando bloco novo');
  await p.locator('#f-cancel').click(); await p.waitForTimeout(150);

  console.log('\nG) Semana — ao arrastar, os espaços livres viram lugar de soltar:');
  await p.locator('.ag-view[data-view="week"]').click(); await p.waitForTimeout(300);
  dia = await blocos('2026-11-16');
  const a = dia[3];
  let c = await p.locator(`#ag-cols [data-block="${a.id}"]`).first().boundingBox();
  await p.mouse.move(c.x + 60, c.y + 15); await p.mouse.down(); await p.mouse.move(c.x + 80, c.y + 40, { steps: 4 }); await p.waitForTimeout(250);
  const zonas = await p.evaluate(() => [...document.querySelectorAll('#ag-cols .ag-drop')].map((z) => { const r = z.getBoundingClientRect(); return { dia: z.dataset.dropDay, st: +z.dataset.dropStart, texto: z.textContent.trim(), topo: z.classList.contains('first'), naTela: r.height > 0 && r.top < innerHeight && r.bottom > 0 }; }));
  ok(zonas.length >= 7 && zonas.every((z) => /^Soltar às \d\d:\d\d/.test(z.texto)) && zonas.some((z) => z.dia === '2026-11-16' && z.topo && z.naTela), zonas.length + ' espaços tracejados; no dia cheio, o primeiro livre fica à vista no topo (' + (zonas.find((z) => z.dia === '2026-11-16' && z.topo) || {}).texto + ')');
  await foto(p, 'pc-semana-arrastando.png');
  const alvo = zonas.find((z) => z.dia === '2026-11-18' && !z.topo);
  const zc = await p.evaluate((t) => { const r = [...document.querySelectorAll('#ag-cols .ag-drop')].find((e) => e.dataset.dropDay === t.dia && +e.dataset.dropStart === t.st && !e.classList.contains('first')).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, alvo);
  // (o Playwright só manda o "dragover" no movimento seguinte: por isso os dois passinhos a mais)
  await p.mouse.move(zc.x, zc.y, { steps: 10 }); await p.mouse.move(zc.x + 2, zc.y + 1); await p.mouse.move(zc.x + 3, zc.y + 2); await p.waitForTimeout(150);
  const aceso = await p.evaluate(() => ({ zona: document.querySelectorAll('#ag-cols .ag-drop.over').length, dia: document.querySelectorAll('#ag-cols .ag-over').length }));
  ok(aceso.zona === 1 && aceso.dia === 0, 'em cima de um espaço, só ele acende');
  await foto(p, 'pc-semana-sobre.png');
  await solta();
  g = await nuvem(a.id);
  ok(g.date === alvo.dia && g.st === alvo.st && (await p.evaluate(() => document.querySelectorAll('#ag-cols .ag-drop').length)) === 0, 'soltou no espaço: foi pra ' + g.date + ' às ' + hhmm(g.st) + ' e os tracejados sumiram | "' + (await aviso()) + '"');
  dia = await blocos('2026-11-16');
  const b2 = dia[2];
  c = await p.locator(`#ag-cols [data-block="${b2.id}"]`).first().boundingBox();
  await p.mouse.move(c.x + 60, c.y + 15); await p.mouse.down(); await p.mouse.move(c.x + 70, c.y + 40, { steps: 4 }); await p.waitForTimeout(200);
  const viz = await p.locator(`#ag-cols [data-block="${dia[5].id}"]`).first().boundingBox();
  await p.mouse.move(viz.x + 60, viz.y + 20, { steps: 8 }); await p.waitForTimeout(100); await solta();
  g = await nuvem(b2.id);
  ok(g.st === b2.st && g.date === '2026-11-16' && /solte num espaço tracejado/.test(await aviso()), 'soltar entre os cartões do próprio dia não muda nada e ensina o caminho');
  c = await p.locator(`#ag-cols [data-block="${b2.id}"]`).first().boundingBox();
  const sexta = await p.locator('#ag-cols section').nth(4).boundingBox();
  await p.mouse.move(c.x + 60, c.y + 15); await p.mouse.down(); await p.mouse.move(c.x + 70, c.y + 40, { steps: 4 }); await p.waitForTimeout(200);
  await p.mouse.move(sexta.x + sexta.width / 2, sexta.y + 22, { steps: 10 }); await p.mouse.move(sexta.x + sexta.width / 2 + 2, sexta.y + 23); await p.mouse.move(sexta.x + sexta.width / 2 + 3, sexta.y + 24); await p.waitForTimeout(120);
  const diaAceso = await p.evaluate(() => document.querySelectorAll('#ag-cols section.ag-over').length);
  await solta();
  g = await nuvem(b2.id);
  ok(diaAceso === 1 && g.date === '2026-11-20' && g.st === b2.st, 'soltar no nome de outro dia leva pro mesmo horário, como já era (' + g.date + ' ' + hhmm(g.st) + ')');

  console.log('\nH) Listas — 3 pontinhos e campo de arquivar:');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(300);
  const tarefa = (id) => p.evaluate(([uid, id]) => { const t = window.__nuvem.get('tarefas', uid, id); return { arq: t.archived, apagada: t.deleted, lista: t.column_id }; }, [UID, id]);
  const ids = await p.evaluate(() => [...document.querySelectorAll('section.col')[0].querySelectorAll('.card')].map((c) => c.dataset.id));
  const cartao = (id) => p.locator(`.card[data-id="${id}"]`);
  let cb = await cartao(ids[0]).boundingBox();
  await p.mouse.move(cb.x + 40, cb.y + 12); await p.waitForTimeout(150);
  const bot = await p.evaluate((id) => { const c = document.querySelector(`.card[data-id="${id}"]`), cr = c.getBoundingClientRect(), t = c.querySelector('p').getBoundingClientRect();
    return [...c.querySelectorAll('[data-sched], [data-hand], [data-more]')].map((b) => { const r = b.getBoundingClientRect(); return { op: getComputedStyle(b).opacity, dentro: r.left >= t.right - 0.5 && r.right <= cr.right + 0.5, w: r.width }; }); }, ids[0]);
  ok(bot.length === 3 && bot.every((b) => b.op === '1' && b.dentro && b.w === 24), 'com o mouse em cima aparecem os três botões (agendar, mão, 3 pontinhos), ao lado do nome e dentro do cartão');
  await foto(p, 'pc-listas-cartao.png');
  await cartao(ids[0]).locator('[data-more]').click(); await p.waitForTimeout(150);
  let mn = await p.evaluate(() => { const m = document.querySelector('div.fixed.z-40[role="menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { itens: [...m.querySelectorAll('button')].map((b) => b.innerText.trim()), dentro: r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth, y: r.top }; });
  ok(!!mn && mn.itens.join('|') === 'Arquivar|Apagar' && mn.dentro && mn.y > cb.y && !(await cartaoAberto()), 'os 3 pontinhos abrem o menu logo abaixo do botão, sem abrir o cartão');
  await foto(p, 'pc-listas-menu.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  // cartão lá no fim da tela: o menu abre pra cima
  const ultimo = await p.evaluate(() => { const l = document.querySelectorAll('section.col')[0].querySelector('.col-list'); l.scrollTop = l.scrollHeight; const cs = l.querySelectorAll('.card'); return cs[cs.length - 1].dataset.id; });
  await p.waitForTimeout(150);
  cb = await cartao(ultimo).boundingBox();
  await p.mouse.move(cb.x + 40, cb.y + 12); await cartao(ultimo).locator('[data-more]').click(); await p.waitForTimeout(150);
  mn = await p.evaluate(() => { const m = document.querySelector('div.fixed.z-40[role="menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { dentro: r.top >= 0 && r.bottom <= innerHeight, y: r.top, h: r.height }; });
  ok(!!mn && mn.dentro, 'num cartão no fim da tela o menu continua inteiro na tela');
  await p.locator('div.fixed.z-40[role="menu"] [data-act="archive"]').click(); await p.waitForTimeout(350);
  ok((await tarefa(ultimo)).arq === true && (await cartao(ultimo).count()) === 0 && /^Tarefa arquivada$/.test(await aviso()), 'Arquivar pelo menu tira o cartão do quadro | "' + (await aviso()) + '"');
  await p.evaluate(() => { document.querySelectorAll('section.col')[0].querySelector('.col-list').scrollTop = 0; }); await p.waitForTimeout(150);
  // arrastar pro campo de arquivar
  cb = await cartao(ids[1]).boundingBox();
  await p.mouse.move(cb.x + 60, cb.y + 20); await p.mouse.down(); await p.mouse.move(cb.x + 90, cb.y + 60, { steps: 4 }); await p.waitForTimeout(250);
  const campo = await p.evaluate(() => { const z = document.getElementById('drop-archive'), r = z.getBoundingClientRect(), h = document.querySelector('#view-board header').getBoundingClientRect(); return { visivel: getComputedStyle(z).display !== 'none', x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, noTopo: r.bottom <= h.bottom + 1, texto: z.innerText.trim() }; });
  ok(campo.visivel && campo.noTopo && campo.w >= 400 && campo.h >= 44 && campo.texto === 'Solte aqui pra arquivar', 'ao arrastar um cartão, o campo "' + campo.texto + '" aparece no topo (' + Math.round(campo.w) + '×' + Math.round(campo.h) + 'px), fora da área das listas');
  await foto(p, 'pc-listas-arrastando.png');
  await p.mouse.move(campo.x, campo.y, { steps: 12 }); await p.mouse.move(campo.x + 2, campo.y + 1); await p.mouse.move(campo.x + 3, campo.y + 2); await p.waitForTimeout(150);
  const sobre = await p.evaluate(() => ({ aceso: document.getElementById('drop-archive').classList.contains('over'), linha: document.querySelectorAll('.drop-line').length, cor: getComputedStyle(document.getElementById('drop-archive')).backgroundColor }));
  ok(sobre.aceso && sobre.linha === 0 && sobre.cor === 'rgb(16, 185, 129)', 'em cima do campo ele acende na cor do app e a linha da lista some');
  await foto(p, 'pc-listas-sobre-o-campo.png');
  await solta();
  ok((await tarefa(ids[1])).arq === true && (await cartao(ids[1]).count()) === 0 && (await p.evaluate(() => getComputedStyle(document.getElementById('drop-archive')).display)) === 'none', 'soltou: tarefa arquivada, cartão fora do quadro e o campo sumiu | "' + (await aviso()) + '"');
  // arrastar pra outra lista continua igual (e não arquiva)
  cb = await cartao(ids[2]).boundingBox();
  // (solta em cima do nome da outra lista: a linha azul que marca o lugar entra na lista e, se entrar bem debaixo do mouse,
  //  a automação do Playwright se perde e não manda o "drop"; com mouse de verdade isso não acontece)
  const outra = await p.locator('section.col').nth(1).locator('header').boundingBox(), outraId = await p.locator('section.col').nth(1).getAttribute('data-col');
  await p.mouse.move(cb.x + 60, cb.y + 20); await p.mouse.down(); await p.mouse.move(cb.x + 90, cb.y + 60, { steps: 4 }); await p.waitForTimeout(200);
  await p.mouse.move(outra.x + outra.width / 2, outra.y + outra.height / 2, { steps: 10 }); await p.mouse.move(outra.x + outra.width / 2 + 2, outra.y + outra.height / 2 + 1); await p.mouse.move(outra.x + outra.width / 2 + 3, outra.y + outra.height / 2 + 2); await p.waitForTimeout(120);
  await solta();
  const t2 = await tarefa(ids[2]);
  ok(t2.lista === outraId && t2.arq === false, 'arrastar de uma lista pra outra continua funcionando e não arquiva');
  // bloco da Semana no campo
  await p.locator('#tab-agenda').click(); await p.waitForTimeout(300);
  const bl = (await blocos('2026-11-17'))[1];
  c = await p.locator(`#ag-cols [data-block="${bl.id}"]`).first().boundingBox();
  await p.mouse.move(c.x + 60, c.y + 30); await p.waitForTimeout(120);
  const maisBloco = await p.evaluate((id) => { const b = document.querySelector(`#ag-cols [data-block="${id}"] [data-more]`); return b ? getComputedStyle(b).opacity : null; }, bl.id);
  ok(maisBloco === '1', 'os blocos da Semana também mostram os 3 pontinhos com o mouse em cima');
  await p.mouse.down(); await p.mouse.move(c.x + 80, c.y + 60, { steps: 4 }); await p.waitForTimeout(250);
  const campo2 = await p.evaluate(() => { const r = document.getElementById('drop-archive').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, visivel: r.height > 0 }; });
  await p.mouse.move(campo2.x, campo2.y, { steps: 12 }); await p.mouse.move(campo2.x + 2, campo2.y + 1); await p.waitForTimeout(120);
  await solta();
  const arqB = await p.evaluate(([uid, id]) => { const b = window.__nuvem.get('blocos', uid, id); return { arq: b.archived, st: b.start_min, date: b.date }; }, [UID, bl.id]);
  ok(campo2.visivel && arqB.arq === true && arqB.st === bl.st && arqB.date === '2026-11-17' && /^Bloco arquivado$/.test(await aviso()), 'arrastar um bloco da Semana pro campo arquiva o bloco, sem mexer no horário | "' + (await aviso()) + '"');

  console.log('\nI) Zoom das Listas e da Semana (V40.20.0: colunas por tela):');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(250);
  const medeListas = () => p.evaluate(() => {
    const b = document.getElementById('board').getBoundingClientRect(), cols = [...document.querySelectorAll('section.col')];
    const rs = cols.map((c) => c.getBoundingClientRect());
    const pe = [...document.querySelectorAll('section.col footer')].map((f) => f.getBoundingClientRect().bottom);
    const tit = [...document.querySelectorAll('section.col .card p')];
    const lh = tit.length ? parseFloat(getComputedStyle(tit[0]).lineHeight) * (parseFloat(document.getElementById('columns').style.zoom) || 1) : 1;
    const proxima = rs.find((r) => r.right > b.right + 1);
    return { inteiras: rs.filter((r) => r.left >= b.left - 1 && r.right <= b.right + 1).length, w: Math.round(rs[0].width), beirada: proxima ? Math.round(b.right - proxima.left) : 0,
      fundo: Math.round(b.bottom - Math.max(...rs.map((r) => r.bottom))), rodapes: pe.every((y) => y <= b.bottom + 1), z: document.getElementById('zoom-reset').textContent,
      quebrados: tit.filter((t) => t.getBoundingClientRect().height > lh * 1.5).length, linha: Math.round(lh * 10) / 10 };
  });
  const L4 = await medeListas();
  ok(L4.z === '4 listas' && L4.inteiras === 4 && L4.beirada >= 15 && L4.beirada <= 60, `normal em 1440 px: "4 listas" inteiras (${L4.w} px cada) e uma beiradinha da próxima (${L4.beirada} px)`);
  await p.locator('#zoom-in').click(); await p.waitForTimeout(150);
  const L3 = await medeListas();
  ok(L3.z === '3 listas' && L3.inteiras === 3 && L3.w > 420 && L3.linha > L4.linha && L3.quebrados <= L4.quebrados, `+: "3 listas" de ${L3.w} px, letra um pouco maior; nomes quebrados: ${L3.quebrados} (eram ${L4.quebrados})`);
  ok(L3.fundo >= 0 && L3.fundo <= 24 && L3.rodapes, 'a lista mais cheia continua indo até o pé da tela, com o "Adicionar tarefa" à vista (sobra ' + L3.fundo + 'px)');
  await foto(p, 'pc-listas-3-por-tela.png');
  // arrastar com as colunas largas: a conta do lugar de soltar usa o tamanho que aparece na tela
  const idsZ = await p.evaluate(() => [...document.querySelectorAll('section.col')[0].querySelectorAll('.card')].map((c) => c.dataset.id));
  cb = await cartao(idsZ[0]).boundingBox();
  const terceira = await p.locator('section.col').nth(2).locator('header').boundingBox(), terceiraId = await p.locator('section.col').nth(2).getAttribute('data-col');
  await p.mouse.move(cb.x + 40, cb.y + 14); await p.mouse.down(); await p.mouse.move(cb.x + 60, cb.y + 40, { steps: 4 }); await p.waitForTimeout(200);
  await p.mouse.move(terceira.x + terceira.width / 2, terceira.y + terceira.height / 2, { steps: 10 }); await p.mouse.move(terceira.x + terceira.width / 2 + 2, terceira.y + terceira.height / 2 + 1); await p.mouse.move(terceira.x + terceira.width / 2 + 3, terceira.y + terceira.height / 2 + 2); await p.waitForTimeout(120);
  await solta();
  ok((await tarefa(idsZ[0])).lista === terceiraId, 'com 3 por tela, arrastar um cartão pra outra lista continua caindo na lista certa');
  const cz = await cartao(idsZ[1]).boundingBox();
  await p.mouse.move(cz.x + 30, cz.y + 10); await p.waitForTimeout(120);
  await cartao(idsZ[1]).locator('[data-more]').click(); await p.waitForTimeout(150);
  const mz = await p.evaluate((id) => { const b = document.querySelector(`.card[data-id="${id}"] [data-more]`).getBoundingClientRect(), m = document.querySelector('[role="menu"]'); if (!m) return null; const r = m.getBoundingClientRect(); return { dy: r.top - b.bottom, dx: Math.min(Math.abs(r.right - b.right), Math.abs(r.left - b.left)) }; }, idsZ[1]);
  ok(!!mz && mz.dy >= 0 && mz.dy <= 10 && mz.dx <= 12, 'o menu dos 3 pontinhos abre logo abaixo do botão (' + (mz ? Math.round(mz.dy) + 'px' : 'não abriu') + ')');
  await p.keyboard.press('Escape');
  const bb = await p.locator('#board').boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.keyboard.down('Control'); await p.mouse.wheel(0, 100); await p.keyboard.up('Control'); await p.waitForTimeout(200);
  ok((await medeListas()).z === '4 listas' && (await p.evaluate(() => window.visualViewport.scale)) === 1, 'Ctrl + rodinha mostra mais listas, sem dar zoom na página');
  await p.locator('#zoom-out').click(); await p.locator('#zoom-out').click(); await p.waitForTimeout(150);
  const L6 = await medeListas();
  const nListas = await p.evaluate(() => document.querySelectorAll('section.col').length);
  ok(L6.z === '6 listas' && L6.inteiras === Math.min(6, nListas) && L6.w >= 190 && (await p.evaluate(() => document.getElementById('zoom-out').disabled)), `−: até "6 listas" (${L6.w} px), o máximo que cabe sem ficar estreita demais`);
  await foto(p, 'pc-listas-6-por-tela.png');
  await p.locator('#zoom-reset').click(); await p.locator('#zoom-in').click(); // fica em 3 pra conferir depois de recarregar
  await p.locator('#tab-agenda').click(); await p.waitForTimeout(250);
  const medeSemana = () => p.evaluate(() => {
    const s = [...document.querySelectorAll('#ag-cols section')], wk = document.getElementById('ag-week'), w = wk.getBoundingClientRect();
    return { inteiros: s.filter((x) => { const r = x.getBoundingClientRect(); return r.left >= w.left - 1 && r.right <= w.right + 1; }).length, w: Math.round(s[0].getBoundingClientRect().width), z: document.getElementById('zoom-reset').textContent, rol: Math.round(wk.scrollLeft), max: wk.scrollWidth - wk.clientWidth, rotulo: document.getElementById('ag-label').textContent, zoomed: document.getElementById('ag-cols').classList.contains('zoomed') };
  });
  const S7 = await medeSemana();
  ok(S7.z === '7 dias' && S7.inteiros === 7 && !S7.zoomed, 'Semana: o normal são os 7 dias na tela, do jeito de sempre');
  for (let i = 0; i < 3; i++) await p.locator('#zoom-in').click();
  await p.waitForTimeout(150);
  const S4 = await medeSemana();
  ok(S4.z === '4 dias' && S4.inteiros === 4 && S4.w > 300, `+ 3 vezes: "4 dias" de ${S4.w} px por tela`);
  await foto(p, 'pc-semana-4-dias.png');
  await p.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(500);
  const sr1 = await medeSemana();
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700); // 7 dias, 4 na tela: 3 passos até o fim
  const sr3 = await medeSemana();
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400);
  const sr4 = await medeSemana();
  ok(sr1.rol > 250 && sr1.rotulo === S4.rotulo && sr3.rol >= sr3.max - 2 && sr3.rotulo === S4.rotulo && sr4.rotulo !== S4.rotulo && sr4.rol <= 2, `→ anda um dia por vez (${sr1.rol} px); no fim da tela passa pra semana seguinte (${sr4.rotulo}) e volta pro começo`);
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(400);
  const sl = await medeSemana();
  ok(sl.rotulo === S4.rotulo && sl.rol >= sl.max - 2, '← no começo volta pra semana anterior, já no fim dela');
  await p.locator('#ag-today').click(); await p.waitForTimeout(150);
  await p.evaluate(() => { document.getElementById('ag-week').scrollLeft = 0; });
  dia = await blocos('2026-11-17');
  const bz = dia[0];
  c = await p.locator(`#ag-cols [data-block="${bz.id}"]`).first().boundingBox();
  const quinta = await p.locator('#ag-cols section').nth(3).boundingBox();
  await p.mouse.move(c.x + 40, c.y + 12); await p.mouse.down(); await p.mouse.move(c.x + 55, c.y + 35, { steps: 4 }); await p.waitForTimeout(200);
  await p.mouse.move(quinta.x + quinta.width / 2, quinta.y + 18, { steps: 10 }); await p.mouse.move(quinta.x + quinta.width / 2 + 2, quinta.y + 19); await p.mouse.move(quinta.x + quinta.width / 2 + 3, quinta.y + 20); await p.waitForTimeout(120);
  await solta();
  g = await nuvem(bz.id);
  ok(g.date === '2026-11-19' && g.st === bz.st, 'com 4 dias por tela, arrastar um bloco pro nome de outro dia continua funcionando (' + g.date + ' ' + hhmm(g.st) + ')');
  await p.locator('.ag-view[data-view="day"]').click(); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.getElementById('zoom-ctl').classList.contains('hidden')), 'na visão Dia o zoom some');
  await p.locator('.ag-view[data-view="week"]').click();
  await p.reload(); await p.waitForSelector('#ag-cols section'); await p.waitForTimeout(400);
  const semRec = await medeSemana();
  await p.locator('#tab-listas').click(); await p.waitForTimeout(200);
  ok(semRec.z === '4 dias' && (await medeListas()).z === '3 listas', 'recarregou a página: Semana em 4 dias e Listas em 3 listas, cada uma como estava');
  await p.locator('#zoom-reset').click();
  await p.locator('#tab-agenda').click(); await p.locator('#zoom-reset').click();
  await p.setViewportSize({ width: 1100, height: 900 }); await p.waitForTimeout(300);
  const SE = await medeSemana();
  ok(SE.z === '6 dias' && SE.inteiros === 6, `tela estreita (1100 px): mostra os ${SE.inteiros} dias que cabem inteiros (o resto, rolando pro lado)`);
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(300);
  ok((await medeSemana()).z === '7 dias', 'janela larga de novo: volta aos 7 dias');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(200);

  console.log('\nJ) Janela de Tags com mouse e teclado (V40.18.0):');
  const tagNuvem = (id) => p.evaluate(([uid, id]) => { const t = window.__nuvem.get('tags', uid, id); return { nome: t.name, cor: t.color, apagada: t.deleted }; }, [UID, id]);
  await p.locator('#btn-tags').click(); await p.waitForTimeout(150);
  const tids = await p.evaluate(() => [...document.querySelectorAll('#tg-list [data-tg]')].map((r) => r.dataset.tg));
  const jan = await p.evaluate(() => { const r = document.querySelector('#modal-tags > div').getBoundingClientRect(); return { w: r.width, h: r.height, dentro: r.top >= 0 && r.bottom <= innerHeight }; });
  ok(tids.length === 6 && jan.dentro && jan.w <= 448, 'a janela abre inteira na tela com as 6 tags');
  await foto(p, 'pc-tags.png');
  // digita um nome e clica direto na bolinha de outra tag (sem Enter): grava o nome E abre a paleta
  await p.locator(`[data-tg-name="${tids[0]}"]`).click();
  await p.keyboard.press('Control+A'); await p.keyboard.type('Projetos');
  await p.locator(`[data-tg-pick="${tids[1]}"]`).click(); await p.waitForTimeout(250);
  const pal = await p.evaluate((id) => document.querySelector(`[data-tg="${id}"]`).querySelectorAll('[data-tg-set]').length, tids[1]);
  ok((await tagNuvem(tids[0])).nome === 'Projetos' && pal === 8, 'digitar o nome e clicar direto na cor de outra tag: o nome grava e a paleta abre (o clique não se perde)');
  await foto(p, 'pc-tags-paleta.png');
  await p.locator(`[data-tg="${tids[1]}"] [data-tg-set][data-color="#ec4899"]`).click(); await p.waitForTimeout(250);
  ok((await tagNuvem(tids[1])).cor === '#ec4899', 'escolheu a cor na paleta: grava');
  await p.locator('#tg-new-name').click(); await p.keyboard.type('Reuniões'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
  const nova = await p.evaluate((uid) => window.__nuvem.alive('tags', uid).find((t) => t.name === 'Reuniões'), UID);
  ok(!!nova && (await p.evaluate(() => document.activeElement.id)) === 'tg-new-name', 'Enter no nome cria a tag e o cursor fica pronto pra próxima');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.getElementById('modal-tags').classList.contains('hidden')), 'Esc fecha');
  // cartão: Gerenciar tags por cima
  await p.locator('section.col .card').first().click(); await p.waitForTimeout(150);
  await p.locator('#f-tags [data-manage-tags]').click(); await p.waitForTimeout(150);
  const empilhadas = await p.evaluate(() => { const t = document.getElementById('modal-tags'), c = document.getElementById('modal-task'); const r = t.querySelector('#tg-new-name').getBoundingClientRect(); return !t.classList.contains('hidden') && !c.classList.contains('hidden') && document.elementFromPoint(r.x + 5, r.y + 5) === t.querySelector('#tg-new-name'); });
  ok(empilhadas, '"Gerenciar tags" abre a janela por cima do cartão, e ela recebe o clique');
  await foto(p, 'pc-tags-sobre-cartao.png');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);

  console.log('\nK) Setas do teclado e aba Finanças (V40.19.0):');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(200);
  await p.evaluate(() => { document.getElementById('board').scrollLeft = 0; if (document.activeElement) document.activeElement.blur(); });
  const passo = await p.evaluate(() => { const c = document.querySelectorAll('section.col'), b = document.getElementById('board'); return { pitch: c[1].getBoundingClientRect().left - c[0].getBoundingClientRect().left, max: b.scrollWidth - b.clientWidth }; });
  const rolagemListas = () => p.evaluate(() => document.getElementById('board').scrollLeft);
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600);
  const ls1 = await rolagemListas();
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(600);
  const ls0 = await rolagemListas();
  ok(passo.max > 0 && Math.abs(ls1 - Math.min(passo.pitch, passo.max)) <= 2 && ls0 <= 1, `Listas: → rola exatamente uma lista (${Math.round(ls1)}px) e ← volta`);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(700);
  ok(Math.abs((await rolagemListas()) - Math.min(2 * passo.pitch, passo.max)) <= 2, 'apertar duas vezes seguidas anda duas listas (ou até o fim)');
  await p.evaluate(() => { document.getElementById('board').scrollLeft = 0; });
  await p.locator('#tab-financas').click(); await p.waitForTimeout(300);
  const fin = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#fn-list [data-fn]')];
    const vals = rows.map((r) => r.children[4].getBoundingClientRect().right), cab = document.querySelector('#fn-list .fn-grid span.text-right').getBoundingClientRect().right;
    return { n: rows.length, transborda: rows.some((r) => r.scrollWidth > r.clientWidth + 1), alinhado: vals.every((x) => Math.abs(x - cab) < 1.5), cartoes: [...document.querySelectorAll('#financas .grid-cols-3 > div')].map((c) => Math.round(c.getBoundingClientRect().width)) };
  });
  ok(fin.n > 10 && !fin.transborda && fin.alinhado && fin.cartoes.length === 3 && fin.cartoes.every((w) => w > 200), `Finanças: ${fin.n} despesas, colunas alinhadas com o cabeçalho, nada saindo da linha, 3 totais lado a lado`);
  await foto(p, 'pc-financas.png');
  await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(150);
  ok((await p.evaluate(() => document.getElementById('fn-label').textContent)) === 'Outubro 2026', 'Finanças: ← vai pro mês anterior');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
  await p.locator('#fn-list [data-fn="fin_1700001703000"]').click(); await p.waitForTimeout(150);
  await foto(p, 'pc-financas-editar.png');
  await p.locator('#fn-f-amount').fill('200'); await p.locator('#fn-f-save').click(); await p.waitForTimeout(200);
  const escopo = await p.evaluate(() => { const b = document.querySelector('#fn-scope > div').getBoundingClientRect(); return { aberto: !document.getElementById('fn-scope').classList.contains('hidden'), dentro: b.top >= 0 && b.bottom <= innerHeight, foco: document.activeElement.dataset.scope }; });
  ok(escopo.aberto && escopo.dentro && escopo.foco === 'this', 'valor novo numa recorrente: a pergunta "Em quais meses?" abre por cima, inteira, com "Só neste mês" escolhido');
  await foto(p, 'pc-financas-escopo.png');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => document.getElementById('modal-fin').classList.contains('hidden') && document.getElementById('fn-scope').classList.contains('hidden')), 'Esc, Esc: fecha a pergunta e depois a despesa, sem gravar');

  console.log('\nL) Aba Assistente (V40.20.0):');
  await p.locator('#tab-assistente').click(); await p.waitForTimeout(300);
  const asg = await p.evaluate(() => {
    const f = document.getElementById('as-feed').getBoundingClientRect(), i = document.getElementById('as-input').getBoundingClientRect(), t = document.querySelector('.tab[data-tab="assistente"]').getBoundingClientRect(), l = document.querySelector('.tab[data-tab="listas"]').getBoundingClientRect();
    return { primeiro: t.right <= l.left, input: i.bottom <= innerHeight - 4 && i.top > f.bottom, msgs: document.querySelectorAll('#as-feed > div').length, txt: document.getElementById('as-feed').textContent.slice(0, 32) };
  });
  ok(asg.primeiro && asg.input && asg.msgs === 1 && /^Bom dia! Hoje é segunda, 16/.test(asg.txt), 'a aba Assistente vem antes das Listas, abre com o resumo e o campo de perguntar fica embaixo, à vista');
  for (const id of ['dia', 'atrasado', 'contas']) { await p.locator(`[data-as-chip="${id}"]`).click(); await p.waitForTimeout(150); }
  const conv = await p.evaluate(() => { const f = document.getElementById('as-feed'); return { n: f.querySelectorAll(':scope > div').length, fim: f.scrollHeight - f.scrollTop - f.clientHeight < 4, rola: f.scrollHeight > f.clientHeight }; });
  ok(conv.n === 7 && conv.rola && conv.fim, 'três perguntas seguidas: a conversa cresce, rola sozinha até a última resposta e a página não se mexe');
  await foto(p, 'pc-assistente.png');
  await p.locator('#as-input').fill('o que vence essa semana?'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok((await p.evaluate(() => document.querySelectorAll('#as-feed > div').length)) === 9 && (await p.evaluate(() => document.getElementById('as-input').value)) === '', 'Enter no campo envia a pergunta');
  await p.locator('#as-feed > div:last-child [data-as-kind="despesa"]').first().click(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => !document.getElementById('modal-fin').classList.contains('hidden') && !document.getElementById('financas').classList.contains('hidden')), 'clicar numa conta da resposta abre a despesa');
  await p.keyboard.press('Escape');

  ok(errs.length === 0, 'nenhum erro de página' + (errs.length ? ': ' + errs[0].slice(0, 160) : ''));
  await fim();
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
