// Tela do PC com mouse de verdade. Agenda: arrastar o bloco na régua do Dia, puxar a borda de baixo pra mudar
// a duração, rolagem automática, Esc, e os espaços livres que aparecem ao arrastar na Semana. Listas: os 3
// pontinhos do cartão (Arquivar / Apagar) e o campo de arquivar que aparece no topo durante o arraste. V40.18.0: janela de Tags.
// V40.20.0: zoom das Listas e da Semana como colunas por tela (com arrastar e setas). V40.19.0: setas do teclado e aba Finanças.
// V40.21.0: aba Metas. V40.22.0: Dia com os horários vagos compactados (arrastar e esticar continuam certos) e notas no cartão do bloco.
// V40.24.0: sublista (Semana, Dia, arrastar, janela com os cartões, cartão aberto e tarefa na mão).
// V40.25.0: Desfazer (Ctrl+Z e Ctrl+Y de verdade no teclado, botões ↶ ↷, aviso embaixo à esquerda). V40.25.1: clique duplo no vazio.
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

  console.log('\nM) Aba Metas (V40.21.0):');
  await p.locator('#tab-metas').click(); await p.waitForTimeout(400);
  const mg = await p.evaluate(() => {
    const cols = [...document.querySelectorAll('#mt-sections section.mt-sec')], lv = document.getElementById('mt-level').getBoundingClientRect(), t = document.querySelector('.tab[data-tab="metas"]').getBoundingClientRect(), f = document.querySelector('.tab[data-tab="financas"]').getBoundingClientRect();
    return { nomes: cols.map((c) => c.querySelector('h2').textContent).join(','), larg: cols.map((c) => Math.round(c.getBoundingClientRect().width)), ultima: t.left >= f.right, nivel: lv.top > 0 && lv.width <= 450 };
  });
  ok(mg.nomes === 'Pessoal,Profissional,Financeiro' && mg.larg.every((x) => x > 1000) && mg.ultima && mg.nivel, 'a aba Metas (depois de Finanças) abre com o nível em cima e uma página só, com os títulos Pessoal, Profissional e Financeiro na largura toda');
  await p.locator('#mt-new').click(); await p.waitForTimeout(150);
  const mod = await p.evaluate(() => { const r = document.querySelector('#modal-goal > div').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && document.activeElement === document.getElementById('mt-f-title'); });
  await p.locator('#mt-f-tpl [data-mt-tpl="0"]').click();
  await foto(p, 'pc-metas-nova.png');
  await p.locator('#mt-f-save').click(); await p.waitForTimeout(250);
  ok(mod && (await p.evaluate(() => document.querySelectorAll('#mt-sections [data-goal]').length)) === 1, 'Nova meta: a janela cabe na tela, o cursor já está no nome; a sugestão "Beber água" + Salvar cria o cartão');
  for (const tpl of ['1', '5']) { await p.locator('#mt-new').click(); await p.locator(`#mt-f-tpl [data-mt-tpl="${tpl}"]`).click(); await p.keyboard.press('Enter'); await p.waitForTimeout(250); }
  for (let i = 0; i < 8; i++) { await p.locator('#mt-sections [data-goal] [data-mt-plus]').first().click(); await p.waitForTimeout(60); }
  await p.waitForTimeout(350);
  const mg2 = await p.evaluate(() => {
    const c = document.querySelector('#mt-sections [data-goal]'), id = c.dataset.goal, M = window.FazMetas, row = window.__nuvem.get('metas_dias', '11111111-2222-3333-4444-555555555555', M.dayId(id, M.ymd(new Date())));
    return { status: c.querySelector('.mt-status').textContent, pontos: document.getElementById('mt-points').textContent, nuvem: row && row.amount, toast: document.getElementById('toast').textContent, cols: [...document.querySelectorAll('#mt-sections section.mt-sec')].map((s) => s.querySelectorAll('[data-goal]').length).join(','), grade: (() => { const cs = [...document.querySelectorAll('#mt-sections section.mt-sec')[0].querySelectorAll('[data-goal]')].map((e) => e.getBoundingClientRect()); return cs.length === 2 && Math.abs(cs[0].top - cs[1].top) < 2 && cs[1].left > cs[0].right && cs[0].width >= 270; })() };
  });
  ok(mg2.status === '✓ 8 de 8 hoje' && mg2.pontos === '10 pontos' && mg2.nuvem === 8 && mg2.cols === '2,1,0' && mg2.grade, '8 cliques no +1: "✓ 8 de 8 hoje", 10 pontos e a nuvem com 8 (metas nas categorias certas: ' + mg2.cols + '; cartões lado a lado, em grade)');
  await foto(p, 'pc-metas.png');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !document.getElementById('metas').classList.contains('hidden')), 'as setas não tiram da aba Metas');

  console.log('\nN) Dia com os horários vagos compactados e notas no bloco (V40.22.0):');
  await p.evaluate((uid) => {
    const n = window.__nuvem, notas = n.alive('notas', uid).map((x) => x.id);
    const mk = (id, h, m, title, extra) => n.insert('blocos', uid, Object.assign({ id, date: '2026-11-18', start_min: h * 60 + m, duration: 30, title, type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false }, extra || {}));
    mk('f_n1', 12, 0, 'CAR JULIANA', { completed: true, linked_note_ids: [notas[0]] }); mk('f_n2', 12, 30, 'MEMORIAL MARILENE', { completed: true });
    mk('f_n3', 15, 25, 'PAGAR CONTAS PESSOAIS'); mk('f_n4', 16, 35, 'LORENE'); mk('f_n5', 17, 20, 'COMPRAR PÃO');
  }, UID);
  await p.locator('#tab-agenda').click(); await p.locator('.ag-view[data-view="week"]').click(); await p.waitForTimeout(250);
  await p.locator('#ag-cols .ag-day-btn[data-day="2026-11-18"]').click(); await p.waitForTimeout(300);
  const altura = () => p.evaluate(() => Math.round(document.getElementById('ag-timeline').getBoundingClientRect().height));
  const h1 = await altura();
  await p.locator('#ag-compact').click(); await p.waitForTimeout(300);
  const cg = await p.evaluate(() => [...document.querySelectorAll('#ag-timeline .ag-cgap')].map((g) => { const r = g.getBoundingClientRect(); return { t: g.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), cabe: g.scrollWidth <= g.clientWidth + 1 }; }));
  const h2 = await altura();
  ok(cg.length === 4 && cg.every((g) => g.h === 26 && g.cabe) && h1 > 3000 && h2 < 700, `"Compactar vagos": 4 faixas (${cg.map((g) => g.t).join(' | ')}) e o dia de ${h1}px vira ${h2}px`);
  await p.evaluate(() => { document.getElementById('ag-day').scrollTop = 0; }); await p.waitForTimeout(100);
  await foto(p, 'pc-dia-compacto.png');
  let bx = await caixa('f_n3');
  await p.mouse.move(bx.x + 300, bx.y + 12); await p.mouse.down();
  await p.mouse.move(bx.x + 300, bx.y + 12 + 32, { steps: 6 }); await p.mouse.move(bx.x + 300, bx.y + 12 + 32.5, { steps: 1 });
  await solta();
  ok((await nuvem('f_n3')).st === 15 * 60 + 35, 'arrastar 10 min pra baixo com os vagos compactados: 15:25 → 15:35 (a régua continua certa)');
  bx = await caixa('f_n4');
  await p.mouse.move(bx.x + 300, bx.y + bx.h - 2); await p.mouse.down();
  await p.mouse.move(bx.x + 300, bx.y + bx.h - 2 + 16, { steps: 5 }); await p.mouse.move(bx.x + 300, bx.y + bx.h - 2 + 16.5, { steps: 1 });
  await solta();
  ok((await nuvem('f_n4')).dur === 35, 'puxar a borda de baixo 5 min: LORENE fica com 35 min');
  await p.locator('#ag-timeline .ag-cgap[data-cgap="780"]').click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !document.getElementById('modal-task').classList.contains('hidden') && document.getElementById('f-start').value === '13:00'), 'clicar na faixa 13:00–15:25 abre um bloco novo às 13:00');
  await p.locator('#f-cancel').click(); await p.waitForTimeout(150);
  bx = await caixa('f_n1');
  await p.mouse.click(bx.x + 300, bx.y + 10); await p.waitForTimeout(250);
  await p.locator('#f-note-link').click(); await p.waitForTimeout(150);
  const nt = await p.evaluate(() => { const m = document.querySelector('#modal-task > div').getBoundingClientRect(); return { n: document.querySelectorAll('#f-notes [data-note-open]').length, opts: document.querySelectorAll('#f-note-opts [data-note-pick]').length, cabe: m.bottom <= innerHeight && m.top >= 0, foco: document.activeElement.id }; });
  ok(nt.n === 1 && nt.opts >= 1 && nt.cabe && nt.foco === 'f-note-q', 'no cartão do bloco: a nota vinculada, "Vincular nota" com a busca e o cursor nela; o cartão cabe na tela');
  await foto(p, 'pc-bloco-notas.png');
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.locator('#ag-compact').click(); await p.waitForTimeout(150);

  { // V40.24.0 (bloco próprio: os nomes daqui não se misturam com os de cima)
  console.log('\nO) Sublista (V40.24.0):');
  await p.evaluate((uid) => {
    const n = window.__nuvem, tags = n.alive('tags', uid);
    n.insert('blocos', uid, { id: 'f_sub', date: '2026-11-19', start_min: 14 * 60, duration: 60, title: 'Pendências rápidas', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, deleted: false,
      cards: [{ id: 'cd_1', title: 'Pagar boleto da luz', done: true, microblocks: [] }, { id: 'cd_2', title: 'Responder o Anderson sobre o orçamento da obra', done: false, tagId: tags[0].id, microblocks: [{ title: 'a', done: true }, { title: 'b', done: false }] }, { id: 'cd_3', title: 'Ligar pro cartório', done: false, microblocks: [] }] });
  }, UID);
  await p.locator('.ag-view[data-view="week"]').click(); await p.waitForTimeout(300);
  const sw = () => p.evaluate(() => { const el = document.querySelector('#ag-cols [data-block="f_sub"]'); if (!el) return null; const r = el.getBoundingClientRect(); return { sub: el.classList.contains('ag-sub'), n: el.querySelectorAll('.ag-sub-card').length, cabem: [...el.querySelectorAll('.ag-sub-card')].every((c) => { const x = c.getBoundingClientRect(); return x.left >= r.left && x.right <= r.right + 0.5; }), estilo: getComputedStyle(el).borderTopStyle }; });
  let w0 = await sw();
  ok(w0 && w0.sub && w0.n === 3 && w0.cabem && w0.estilo === 'dashed', 'Semana: a sublista aparece tracejada com os 3 cartões cabendo na coluna');
  await p.evaluate(() => { const el = document.querySelector('#ag-cols [data-block="f_sub"]'); el.scrollIntoView({ block: 'center' }); }); await p.waitForTimeout(150);
  await foto(p, 'pc-sublista-semana.png');
  await p.locator('#ag-cols [data-block="f_sub"] [data-sub-ck][data-card="cd_3"]').click(); await p.waitForTimeout(350);
  ok(await p.evaluate((uid) => window.__nuvem.get('blocos', uid, 'f_sub').cards[2].done === true, UID) && !(await cartaoAberto()), 'clicar no círculo de um cartão marca, sem abrir nada');
  await p.locator('#ag-cols .ag-day-btn[data-day="2026-11-19"]').click(); await p.waitForTimeout(300);
  await p.evaluate(() => { document.getElementById('ag-day').scrollTop = (14 * 60 - 7 * 60) * 3.2 - 200; }); await p.waitForTimeout(150);
  const d0 = await p.evaluate(() => { const el = [...document.querySelectorAll('#ag-timeline [data-block]')].find((e) => e.dataset.block === 'f_sub'), r = el.getBoundingClientRect(); return { n: el.querySelectorAll('.ag-sub-card').length, dentro: [...el.querySelectorAll('.ag-sub-card')].every((c) => c.getBoundingClientRect().bottom <= r.bottom + 0.5), h: Math.round(r.height) }; });
  ok(d0.n === 3 && d0.dentro, `Dia: os 3 cartões cabem dentro da sublista de 1h (${d0.h}px)`);
  await foto(p, 'pc-sublista-dia.png');
  // arrastar a sublista no Dia (30 min pra baixo)
  let bx = await caixa('f_sub');
  await p.mouse.move(bx.x + 420, bx.y + 8); await p.mouse.down();
  await p.mouse.move(bx.x + 420, bx.y + 8 + 96, { steps: 8 }); await p.mouse.move(bx.x + 420, bx.y + 8 + 96.5, { steps: 1 });
  await solta();
  ok((await nuvem('f_sub')).st === 14 * 60 + 30, 'arrastar a sublista 30 min pra baixo funciona como bloco (14:30)');
  // janela
  bx = await caixa('f_sub');
  await p.mouse.click(bx.x + 420, bx.y + 10); await p.waitForTimeout(300);
  const j0 = await p.evaluate(() => { const m = document.querySelector('#modal-task > div').getBoundingClientRect(); return { cards: document.querySelectorAll('#f-cards .fc-row').length, check: !document.getElementById('f-mbs-wrap').classList.contains('hidden'), cabe: m.top >= 0 && m.bottom <= innerHeight }; });
  ok(j0.cards === 3 && !j0.check && j0.cabe, 'clicar abre a janela com os cartões no lugar da checklist, inteira na tela');
  await p.locator('#f-card-new').click(); await p.keyboard.type('Comprar toner'); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
  await p.locator('#f-card-pull').click(); await p.waitForTimeout(150);
  await p.keyboard.type('tarefa 2'); await p.keyboard.press('Enter'); await p.waitForTimeout(450);
  const j1 = await p.evaluate((uid) => window.__nuvem.get('blocos', uid, 'f_sub').cards.map((c) => c.title), UID);
  ok(j1.length === 5 && j1[3] === 'Comprar toner' && j1[4] === 'Tarefa 2', 'digitar + Enter cria; "Puxar da Lista" + busca + Enter traz a tarefa (' + j1.slice(3).join(', ') + ')');
  await foto(p, 'pc-sublista-janela.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  await p.locator('#f-cards [data-fc-open="cd_2"]').click(); await p.waitForTimeout(350);
  const j2 = await p.evaluate(() => ({ voltar: !document.getElementById('f-card-back').classList.contains('hidden'), nome: document.getElementById('f-title').value, grade: !document.getElementById('f-grid').classList.contains('hidden') }));
  ok(j2.voltar && j2.nome.startsWith('Responder o Anderson') && !j2.grade, 'abrir um cartão: o mesmo cartão das Listas, com "← Pendências rápidas" pra voltar');
  await foto(p, 'pc-sublista-cartao.png');
  await p.locator('#f-card-back').click(); await p.waitForTimeout(250);
  ok(await p.evaluate(() => !document.getElementById('f-cards-wrap').classList.contains('hidden')), '"←" volta pra janela da sublista');
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // tarefa na mão
  await p.locator('#tab-listas').click(); await p.waitForTimeout(250);
  const tid = await p.evaluate(() => document.querySelector('#columns [data-hand]').dataset.hand);
  await p.locator('#columns [data-hand]').first().click(); await p.waitForTimeout(400);
  await p.evaluate(() => { document.getElementById('ag-day').scrollTop = (14 * 60 - 7 * 60) * 3.2 - 200; }); await p.waitForTimeout(150);
  const drop = await p.evaluate(() => { const b = document.querySelector('#ag-timeline [data-sub-drop="f_sub"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  ok(!!drop, 'com a tarefa na mão, a sublista mostra "Colocar na sublista"');
  await foto(p, 'pc-sublista-mao.png');
  if (drop) { await p.mouse.click(drop.x, drop.y); await p.waitForTimeout(450); }
  ok(await p.evaluate(([uid, tid]) => window.__nuvem.get('tarefas', uid, tid).deleted === true && window.__nuvem.get('blocos', uid, 'f_sub').cards.length === 6, [UID, tid]), 'clicar coloca a tarefa na sublista (e ela sai da Lista)');
  }

  {
  console.log('\nP) Desfazer: Ctrl+Z, Ctrl+Y e os botões ↶ ↷ (V40.25.0):');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(300);
  const topo = () => p.evaluate(() => {
    const h = document.querySelector('header'), hr = h.getBoundingClientRect(), u = document.getElementById('btn-undo').getBoundingClientRect(), r = document.getElementById('btn-redo').getBoundingClientRect(), sair = document.getElementById('btn-logout').getBoundingClientRect();
    return { alt: Math.round(hr.height), cabe: sair.right <= innerWidth && u.width === 36 && r.left >= u.right && u.top >= hr.top && u.bottom <= hr.bottom };
  });
  const t0 = await topo();
  ok(t0.cabe && t0.alt <= 64, `os botões ↶ ↷ cabem no topo (1440 px, topo com ${t0.alt} px)`);
  await p.setViewportSize({ width: 1100, height: 800 }); await p.waitForTimeout(200);
  const t1 = await topo();
  ok(t1.cabe && t1.alt === t0.alt, 'e numa janela de 1100 px também (o topo não quebra em duas linhas)');
  await p.setViewportSize({ width: 1440, height: 900 }); await p.waitForTimeout(200);
  const nuvemT = (id) => p.evaluate(([uid, id]) => window.__nuvem.get('tarefas', uid, id).deleted, [UID, id]);
  const tid = await p.evaluate(() => document.querySelectorAll('#columns section.col .card')[1].dataset.id);
  await p.locator(`.card[data-id="${tid}"]`).hover();
  await p.locator(`.card[data-id="${tid}"] [data-more]`).click(); await p.waitForTimeout(150);
  await p.locator('div.fixed.z-40[role="menu"] [data-act="delete"]').click(); await p.waitForTimeout(150);
  await p.locator('#dlg-ok').click(); await p.waitForTimeout(500);
  const av = await p.evaluate(() => {
    const e = document.getElementById('undo-pill'), r = e.getBoundingClientRect(), t = document.getElementById('toast').getBoundingClientRect(), v = document.getElementById('pc-version').getBoundingClientRect();
    const longe = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    return { vis: !e.classList.contains('hidden') && r.width > 0, txt: document.getElementById('undo-pill-msg').textContent, esq: r.left, baixo: innerHeight - r.bottom, semToast: longe(r, t), semSelo: longe(r, v), titulo: document.getElementById('btn-undo').title };
  });
  ok(av.vis && av.txt === 'Tarefa apagada' && av.esq <= 24 && av.baixo <= 24 && av.semToast && av.semSelo, 'apagou: o aviso com Desfazer aparece embaixo à esquerda, sem cobrir o aviso do meio nem o número da versão');
  ok(av.titulo === 'Desfazer: Tarefa apagada (Ctrl+Z)', 'passando o mouse no ↶: "' + av.titulo + '"');
  await foto(p, 'pc-desfazer.png');
  await p.mouse.click(700, 120); // tira o foco de qualquer campo
  await p.keyboard.press('Control+z'); await p.waitForTimeout(500);
  ok(await nuvemT(tid) === false && await p.evaluate((id) => !!document.querySelector(`.card[data-id="${id}"]`), tid), 'Ctrl+Z de verdade no teclado: a tarefa volta (aqui e na nuvem)');
  ok(await p.evaluate(() => document.getElementById('undo-pill-msg').textContent) === 'Desfeito: tarefa apagada', 'o aviso vira "Desfeito: tarefa apagada" com Refazer');
  await p.keyboard.press('Control+y'); await p.waitForTimeout(500);
  ok(await nuvemT(tid) === true, 'Ctrl+Y refaz');
  await p.keyboard.press('Control+Shift+Z'); await p.waitForTimeout(100);
  await p.locator('#btn-undo').click(); await p.waitForTimeout(500);
  ok(await nuvemT(tid) === false, 'o botão ↶ desfaz');
  // dentro de um campo, o Ctrl+Z é o do texto
  await p.locator('#tab-notas').click(); await p.waitForTimeout(300);
  await p.locator('#nt-list [data-nt]').first().click(); await p.waitForTimeout(300);
  const antes = await p.evaluate(() => document.getElementById('nt-content').value);
  const tit0 = await p.evaluate(() => document.getElementById('btn-undo').title);
  await p.locator('#nt-content').click(); await p.keyboard.press('End'); await p.keyboard.type(' xyz'); await p.waitForTimeout(150);
  const mid = await p.evaluate(() => document.getElementById('nt-content').value), passos0 = await p.evaluate(() => document.getElementById('btn-redo').title);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
  const dep = await p.evaluate(() => document.getElementById('nt-content').value);
  ok(mid === antes + ' xyz' && dep.length < mid.length && mid.startsWith(dep) && dep.startsWith(antes) && await p.evaluate(() => document.getElementById('btn-undo').title) === tit0 && await p.evaluate(() => document.getElementById('btn-redo').title) === passos0,
    'Ctrl+Z escrevendo uma nota desfaz o que foi digitado (o do navegador), sem mexer nos passos do app');
  await p.locator('#tab-listas').click(); await p.waitForTimeout(300);
  }

  {
  console.log('\nQ) Dois cliques num horário vazio (V40.25.1):');
  await p.locator('#tab-agenda').click(); await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.querySelector('.ag-view[data-view="week"]'); if (b) b.click(); document.getElementById('ag-today').click(); }); await p.waitForTimeout(300);
  const aberto = () => p.evaluate(() => !document.getElementById('modal-task').classList.contains('hidden'));
  // domingo 22/11 está livre: a coluna é curta (só o "Adicionar bloco"); o clique duplo no espaço embaixo dela vale pra ela
  const alvo = await p.evaluate(() => {
    const sec = document.querySelector('#ag-cols .ag-list[data-day="2026-11-22"]').parentNode, r = sec.getBoundingClientRect(), w = document.getElementById('ag-week').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: Math.min(r.bottom + 120, w.bottom - 20), fora: r.bottom + 120 < w.bottom - 20 };
  });
  ok(alvo.fora, 'o domingo (livre) é uma coluna curta, com espaço vazio embaixo dela');
  await p.mouse.dblclick(alvo.x, alvo.y); await p.waitForTimeout(600);
  ok(await aberto() && await p.evaluate(() => document.getElementById('f-save').textContent) === 'Criar bloco' && await p.evaluate(() => document.getElementById('f-date').value) === '2026-11-22', 'Semana: clique duplo de verdade no espaço vazio embaixo do domingo abre o "Novo bloco" desse dia (e ele continua aberto)');
  await foto(p, 'pc-dois-cliques-semana.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // clique duplo num bloco: abre e não fecha sozinho
  const bl = await p.evaluate(() => { const c = document.querySelector('#ag-cols [data-block] p'), r = c.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2 }; });
  await p.mouse.dblclick(bl.x, bl.y); await p.waitForTimeout(600);
  ok(await aberto() && await p.evaluate(() => document.getElementById('f-save').textContent) === 'Salvar', 'clique duplo num bloco: o cartão abre e fica aberto');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // Dia: clique duplo num horário vazio (antes a janela abria e fechava na hora)
  await p.locator('#ag-cols .ag-day-btn[data-day="2026-11-19"]').click(); await p.waitForTimeout(400);
  const hr = await p.evaluate(() => { const t = document.getElementById('ag-timeline'), r = t.getBoundingClientRect(); document.getElementById('ag-day').scrollTop = (10 * 60 - 7 * 60) * 3.2 - 100; return true; });
  await p.waitForTimeout(150);
  const y10 = await p.evaluate(() => { const t = document.getElementById('ag-timeline'), r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (10 * 60 - 7 * 60) * 3.2 + 2 }; });
  await p.mouse.dblclick(y10.x, y10.y); await p.waitForTimeout(600);
  ok(hr && await aberto() && await p.evaluate(() => document.getElementById('f-start').value) === '10:00' && await p.evaluate(() => document.getElementById('f-date').value) === '2026-11-19', 'Dia: clique duplo nas 10:00 abre o "Novo bloco" às 10:00 e ele fica aberto');
  await foto(p, 'pc-dois-cliques-dia.png');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await p.evaluate(() => { const b = document.querySelector('.ag-view[data-view="week"]'); if (b) b.click(); }); await p.waitForTimeout(200);
  }

  ok(errs.length === 0, 'nenhum erro de página' + (errs.length ? ': ' + errs[0].slice(0, 160) : ''));
  await fim();
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
