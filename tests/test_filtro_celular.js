// V40.45.0 — FILTRO DA AGENDA NO CELULAR (o "Todas as tags" e o "Ocultar concluídos" do PC), no app de verdade
// (index.html + app.js + sync.js em jsdom). O botão TAGs abre "Filtrar a agenda"; o bloco escondido vira só o contorno
// no horário dele (o espaço livre continua contando com ele); a escolha fica no aparelho (fora do backup).
// (A) botão e janelinha; (B) uma tag; (C) "Sem tag" (também a tag que não existe mais); (D) "Ocultar concluídos";
// (E) tag + concluídos; (F) os filtros de lista (atrasados/concluídos); (G) 2 dias lado a lado; (H) tarefa na mão;
// (I) busca; (J) tag apagada; (K) guardado no aparelho, fora do backup e do Desfazer; (L) fechar.
// Uso: TZ='America/Sao_Paulo' node test_filtro_celular.js <repo> <dados-ficticios.json>
const fs = require('fs'), boot = require('./boot_app');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DS = '2026-12-08', DS2 = '2026-12-09';

(async () => {
  const B = await boot(REPO, backup.data), { w, $ } = B, d = w.document;
  const ev = (x) => w.eval(x);
  const J = (x) => JSON.parse(ev('JSON.stringify(' + x + ')'));
  const toasts = () => w.__toasts || [];
  const T = J('tagsDb.map((t) => ({ id: t.id, name: t.name, color: t.color }))');
  const t1 = T[0], t2 = T[1], t3 = T[2];
  // A 08:00 Tag1 · B 09:00 Tag2 · C 09:30 sem tag · D 10:00 Tag1 concluído · E 11:00 tag que não existe · F 13:00 sublista Tag2
  // e no dia seguinte: G 08:00 Tag1 · H 09:00 Tag2
  ev(`(() => {
    const mk = (id, date, st, dur, tagId, extra) => Object.assign({ id, date, startMin: st, duration: dur, title: 'Filtro ' + id, type: 'focus', theme: 'focus', tagId, microblocks: [], completed: false, linkedNoteIds: [] }, extra || {});
    db.push(mk('fA', '${DS}', 480, 60, ${JSON.stringify(t1.id)}), mk('fB', '${DS}', 540, 30, ${JSON.stringify(t2.id)}), mk('fC', '${DS}', 570, 30, null),
      mk('fD', '${DS}', 600, 60, ${JSON.stringify(t1.id)}, { completed: true }), mk('fE', '${DS}', 660, 30, 'tag_que_nao_existe'),
      mk('fF', '${DS}', 780, 60, ${JSON.stringify(t2.id)}, { title: 'Sublista filtro', cards: [{ id: 'cd_f1', title: 'Cartão 1', done: false }] }),
      mk('fG', '${DS2}', 480, 60, ${JSON.stringify(t1.id)}), mk('fH', '${DS2}', 540, 30, ${JSON.stringify(t2.id)}));
    saveDb(); closeAllSheets(); activeDateObj = new Date(2026, 11, 8); renderTimeline();
  })()`);
  await sleep(30);
  const shown = () => [...d.querySelectorAll('#blocks-container .block-item[data-block-id^="f"]')].map((e) => e.dataset.blockId).sort();
  const hidden = () => [...d.querySelectorAll('#blocks-container .tl-hidden')].map((e) => e.dataset.hiddenId).sort();
  const empties = () => [...d.querySelectorAll('#blocks-container .block-item[data-block-id^="e_"]')].map((e) => Number(e.dataset.blockId.slice(2)));
  const modalOpen = () => !$('ag-filter-modal').classList.contains('hidden');
  const btn = () => $('ag-filter-btn'); // V40.49.0: a linha "Filtrar por tag" do ⋯ (abre a janelinha)
  const val = () => $('ag-filter-now').textContent.trim(); // o que ela diz: "Todas", o nome da tag ou "Sem tag"
  const more = () => $('ag-more-btn').classList.contains('on'); // o ⋯ aceso (algum filtro ligado)
  const rows = () => [...d.querySelectorAll('#ag-filter-list .agf-row')];
  const pick = (name) => rows().find((r) => r.textContent.trim() === name).click();
  const prog = () => $('progress-text').textContent;
  const fil = () => J('[agTagFilter, agHideDone]');
  const L = (k) => w.localStorage.getItem(k);
  const errs0 = B.errors.length;

  // ======================================================================================================
  console.log('A) Botão e janelinha:');
  ok(btn() && val() === 'Todas' && btn().getAttribute('aria-pressed') === 'false' && !btn().classList.contains('agf-on') && !more(), 'sem filtro: a linha do ⋯ diz "Todas" e o ⋯ fica apagado');
  ok(JSON.stringify(shown()) === JSON.stringify(['fA', 'fB', 'fC', 'fD', 'fE', 'fF']) && !hidden().length, 'sem filtro: todos os blocos do dia aparecem, nenhum contorno');
  ok(prog() === 'Planejado (' + ev('Math.round(270 / TOTAL_MINS * 100)') + '%)', 'e o "Planejado" de sempre: "' + prog() + '"');
  btn().click();
  ok(modalOpen() && !$('overlay').classList.contains('pointer-events-none'), 'tocar em "Filtrar por tag" abre a janelinha (com o fundo escuro)');
  const names = rows().map((r) => r.textContent.trim());
  ok(JSON.stringify(names) === JSON.stringify(['Todas as tags'].concat(T.map((t) => t.name), ['Sem tag'])), 'a lista: "Todas as tags", cada tag e "Sem tag" (' + names.length + ' linhas)');
  ok(rows()[0].getAttribute('aria-checked') === 'true' && rows().slice(1).every((r) => r.getAttribute('aria-checked') === 'false'), '"Todas as tags" marcada');
  ok(rows()[1].querySelector('.agf-dot') && rows()[1].querySelector('.agf-dot').style.background !== '', 'cada tag com a bolinha na cor dela');
  ok(!$('ag-filter-done') && $('ag-done-btn').getAttribute('role') === 'switch' && $('ag-done-btn').getAttribute('aria-checked') === 'false', '"Ocultar concluídos" (V40.49.0: no ⋯, fora da janelinha da tag) desligado');
  ok(d.querySelector('#ag-filter-modal [data-voltar]') && d.querySelector('#ag-filter-modal [data-voltar]').textContent.trim() === 'Fechar', 'o Fechar é o que o voltar do celular toca (data-voltar)');
  d.querySelector('#ag-filter-modal button[onclick="agFilterManageTags()"]').click();
  ok(!modalOpen() && !$('tags-sheet').classList.contains('translate-y-full'), '"Gerenciar tags" fecha a janelinha e abre a tela das tags de antes');
  ev('closeAllSheets()');

  // ======================================================================================================
  console.log('\nB) Uma tag:');
  btn().click();
  pick(t1.name);
  await sleep(10);
  ok(!modalOpen() && JSON.stringify(fil()) === JSON.stringify([t1.id, false]), 'tocar na tag escolhe e fecha a janelinha');
  ok(L('tb__filtro_tag') === t1.id && L('tb__ocultar_concluidos') === '0', 'guardado no aparelho: tb__filtro_tag e tb__ocultar_concluidos');
  ok(btn().classList.contains('agf-on') && btn().getAttribute('aria-pressed') === 'true' && val() === t1.name && more(), `a linha mostra "${val()}" e o ⋯ acende`);
  ok(btn().querySelector('.agf-dot') && /rgb|#/.test(btn().querySelector('.agf-dot').style.background) && /só /.test(btn().getAttribute('aria-label')), 'com a bolinha da tag e o leitor de tela ouvindo "' + btn().getAttribute('aria-label') + '"');
  ok(JSON.stringify(shown()) === JSON.stringify(['fA', 'fD']), 'aparecem só os blocos da tag (o concluído também): ' + shown().join(', '));
  ok(JSON.stringify(hidden()) === JSON.stringify(['fB', 'fC', 'fE', 'fF']), 'os outros viram contorno no horário deles: ' + hidden().join(', '));
  const hb = d.querySelector('.tl-hidden[data-hidden-id="fB"]');
  ok(hb.style.top === (ev('tlY(540)') + 1) + 'px' && hb.style.height === (ev('tlY(570) - tlY(540)') - 2) + 'px', 'o contorno ocupa o lugar do bloco (topo e altura iguais aos dele)');
  ok(/escondido pelo filtro/.test(hb.getAttribute('aria-label')) && hb.getAttribute('role') === 'button', 'o leitor de tela ouve "' + hb.getAttribute('aria-label') + '"');
  const busy = [[480, 540], [540, 570], [570, 600], [600, 660], [660, 690], [780, 840]];
  ok(empties().every((e) => !busy.some(([a, b]) => e >= a && e < b)) && empties().includes(690) && !empties().includes(540) && !empties().includes(570), 'o Tempo Livre não aparece onde tem bloco escondido (o horário continua ocupado): ' + empties().map((m) => ev(`formatClock(${m})`)).join(', '));
  ok(/^Planejado \(\d+%\) · 4 escondidos$/.test(prog()) && prog().startsWith('Planejado (' + ev('Math.round(270 / TOTAL_MINS * 100)') + '%)'), 'o "Planejado" conta todos e avisa quantos estão escondidos: "' + prog() + '"');
  hb.click();
  ok(modalOpen() && rows()[1].getAttribute('aria-checked') === 'true', 'tocar num contorno abre o filtro (com a tag marcada)');
  ev('closeAgFilter()');
  ok(!modalOpen() && $('overlay').classList.contains('pointer-events-none'), 'Fechar fecha (sem o fundo escuro)');

  // ======================================================================================================
  console.log('\nC) "Sem tag":');
  btn().click(); pick('Sem tag'); await sleep(10);
  ok(JSON.stringify(shown()) === JSON.stringify(['fC', 'fE']), '"Sem tag": o sem tag e o de tag que não existe mais (como o PC): ' + shown().join(', '));
  ok(val() === 'Sem tag' && btn().classList.contains('agf-on'), 'a linha mostra "Sem tag"');
  ok(prog().endsWith('· 4 escondidos'), '"' + prog() + '"');

  // ======================================================================================================
  console.log('\nD) Ocultar concluídos:');
  btn().click(); pick('Todas as tags'); await sleep(10);
  ok(!btn().classList.contains('agf-on') && val() === 'Todas' && !more() && JSON.stringify(fil()) === JSON.stringify(['', false]), '"Todas as tags" desliga o filtro de tag (a linha volta a "Todas"; o ⋯ apaga)');
  ev('openAgMore()');
  $('ag-done-btn').click();
  await sleep(10);
  ok(!$('ag-more-modal').classList.contains('hidden') && $('ag-done-btn').getAttribute('aria-checked') === 'true', 'no ⋯, a chave "Ocultar concluídos" liga (o ⋯ continua aberto)');
  ok(L('tb__ocultar_concluidos') === '1' && JSON.stringify(hidden()) === JSON.stringify(['fD']) && !shown().includes('fD'), 'o concluído vira contorno; o resto aparece');
  ev('closeAgMore()');
  ok(more() && !btn().classList.contains('agf-on') && val() === 'Todas', 'o ⋯ fica aceso (a linha da tag continua "Todas")');
  ok(prog().endsWith('· 1 escondido'), 'no singular: "' + prog() + '"');

  // ======================================================================================================
  console.log('\nE) Tag + concluídos:');
  btn().click(); pick(t1.name); await sleep(10);
  ok(JSON.stringify(shown()) === JSON.stringify(['fA']) && JSON.stringify(hidden()) === JSON.stringify(['fB', 'fC', 'fD', 'fE', 'fF']), 'Tag 1 sem os concluídos: só o A');
  ok(btn().querySelector('.agf-dot') && val() === t1.name && $('ag-done-btn').getAttribute('aria-checked') === 'true' && more(), 'a linha mostra a bolinha e o nome; a chave dos concluídos continua ligada');

  // ======================================================================================================
  console.log('\nF) Nos filtros de lista (atrasados e concluídos):');
  ev('toggleFilterCompleted()');
  const lista = () => [...d.querySelectorAll('#blocks-container .block-item[data-block-id^="f"]')].map((e) => e.dataset.blockId);
  ok(JSON.stringify(lista()) === JSON.stringify(['fD']) && !d.querySelector('#blocks-container .tl-hidden'), '"Só concluídos" com Tag 1: o D aparece (o "Ocultar concluídos" não vale aí) e não tem contorno (é lista)');
  btn().click(); pick(t2.name); await sleep(10);
  ok(!lista().length && prog().endsWith('· 1 escondido'), '"Só concluídos" com Tag 2: nada na lista, e o aviso do escondido: "' + prog() + '"');
  ev('toggleFilterCompleted()');
  ok(JSON.stringify(shown()) === JSON.stringify(['fB', 'fF']), 'desligando o "só concluídos", a agenda volta com a Tag 2: ' + shown().join(', '));

  // ======================================================================================================
  console.log('\nG) Dois dias lado a lado:');
  ev('setTlDays(2)');
  await sleep(10);
  const minis = () => [...d.querySelectorAll('#blocks-container .tl-mini[data-mini-id^="f"]')].map((e) => e.dataset.miniId).sort();
  const minisH = () => [...d.querySelectorAll('#blocks-container .tl-col .tl-hidden.mini')].map((e) => e.dataset.hiddenId).sort();
  ok(JSON.stringify(minis()) === JSON.stringify(['fB', 'fF', 'fH']), 'em cada coluna, só os da Tag 2 (sem os concluídos): ' + minis().join(', '));
  ok(JSON.stringify(minisH()) === JSON.stringify(['fA', 'fC', 'fD', 'fE', 'fG']), 'os outros viram contorno pequeno na coluna deles: ' + minisH().join(', '));
  ok(prog().endsWith('· 5 escondidos'), 'o aviso soma os dias: "' + prog() + '"');
  ok(!d.querySelector('.tl-hidden[data-mini-id]') && !d.querySelector('.tl-hidden.block-item'), 'o contorno não é bloco (não se arrasta pra outro dia nem abre o cartão)');
  ev('setTlDays(1)');
  await sleep(10);

  // ======================================================================================================
  console.log('\nH) Tarefa na mão:');
  const pillsSem = (() => { ev("agTagFilter = ''; agHideDone = false;"); return null; })();
  ev(`backlogDb.push({ id: 'bl_filtro', title: 'Tarefa do filtro', duration: 30, microblocks: [], columnId: backlogColumnsDb[0].id, tagId: null }); saveBacklog(); scheduleBacklogItem('bl_filtro');`);
  await sleep(10);
  const pills0 = [...d.querySelectorAll('#blocks-container .tl-push')].map((p) => p.dataset.pushStart).join(',');
  ev(`agTagFilter = ${JSON.stringify(t2.id)}; agHideDone = true; agFilterSave(); renderTimeline();`);
  await sleep(10);
  const pills1 = [...d.querySelectorAll('#blocks-container .tl-push')].map((p) => p.dataset.pushStart).join(',');
  ok(pills0 === pills1 && pills1.length > 0, 'os "↓" entre blocos colados são os mesmos com e sem filtro (contam os escondidos): ' + pills1);
  ok(empties().every((e) => !busy.some(([a, b]) => e >= a && e < b)), 'os lugares de soltar não passam por cima de bloco escondido');
  d.querySelector('.tl-hidden[data-hidden-id="fA"]').click();
  ok(!modalOpen() && ev('!!pendingIntent'), 'com a tarefa na mão, tocar num contorno não abre o filtro (é horário ocupado)');
  ev("cancelPendingTask(); backlogDb = backlogDb.filter((x) => x.id !== 'bl_filtro'); saveBacklog(); renderTimeline();");
  void pillsSem;

  // ======================================================================================================
  console.log('\nI) Busca:');
  ev(`agTagFilter = ${JSON.stringify(t1.id)}; agHideDone = true; agFilterSave(); renderTimeline();`);
  ev("openSearchBar(); searchQuery = 'Filtro fB'; renderTimeline();");
  await sleep(10);
  ok(d.querySelector('#blocks-container .block-item[data-block-id="fB"]') && !d.querySelector('#blocks-container .tl-hidden'), 'a busca acha o bloco que o filtro esconde (ela acha tudo, como no PC)');
  const nT = toasts().length;
  ev(`goToDateFromSearch('${DS}')`);
  await sleep(150);
  ok(JSON.stringify(fil()) === JSON.stringify(['', true]) && L('tb__filtro_tag') === '', 'ir pro dia do achado: o filtro de tag que escondia ele desliga (o de concluídos fica: o B não é concluído)');
  ok(toasts().length === nT + 1 && / · filtro desligado$/.test(toasts()[nT]), 'e avisa: "' + toasts()[nT] + '"');
  ok(shown().includes('fB'), 'o bloco achado aparece no dia');
  ev("openSearchBar(); searchQuery = 'Filtro fD'; renderTimeline();");
  ev(`goToDateFromSearch('${DS}')`);
  await sleep(150);
  ok(JSON.stringify(fil()) === JSON.stringify(['', false]) && shown().includes('fD'), 'achou um concluído: o "Ocultar concluídos" desliga');
  ev("openSearchBar(); searchQuery = 'Filtro fC'; renderTimeline();");
  const nT2 = toasts().length;
  ev(`goToDateFromSearch('${DS}')`);
  await sleep(150);
  ok(toasts()[nT2] && !/filtro/.test(toasts()[nT2]), 'sem filtro escondendo nada: só o "' + toasts()[nT2] + '" de sempre');

  // ======================================================================================================
  console.log('\nJ) Tag apagada:');
  btn().click(); pick(t3.name); await sleep(10);
  ok(val() === t3.name, 'filtro na ' + t3.name);
  ev(`deleteTag(${JSON.stringify(t3.id)})`);
  await sleep(10);
  ok(JSON.stringify(fil()) === JSON.stringify(['', false]) && val() === 'Todas' && !hidden().length, 'apagar a tag do filtro volta pra "Todas as tags" (nada escondido)');
  ev(`tagsDb.push(${JSON.stringify(t3)}); saveTags();`);
  // a tag sumiu por outro caminho (veio do PC): o próximo desenho conserta
  ev("agTagFilter = 'tag_sumiu'; renderTimeline();");
  ok(J('agTagFilter') === '' && val() === 'Todas' && !hidden().length, 'tag do filtro que não existe mais (apagada no PC): volta pra "Todas" no próximo desenho');

  // ======================================================================================================
  console.log('\nK) Guardado no aparelho, fora do backup e do Desfazer:');
  await sleep(30); // o passo do Desfazer do saveTags de cima fecha depois de um instante
  const und0 = J('undoStack.length');
  btn().click(); pick(t2.name); await sleep(10);
  ev('openAgMore()'); $('ag-done-btn').click(); ev('closeAgMore()'); await sleep(30);
  ok(J('undoStack.length') === und0, 'mexer no filtro não vira passo do Desfazer');
  ok(!ev("isFazDataKey('tb__filtro_tag')") && !ev("isFazDataKey('tb__ocultar_concluidos')"), 'as duas chaves ficam fora do backup (tb__)');
  const store = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); store[k] = w.localStorage.getItem(k); }
  const B2 = await boot(REPO, store), w2 = B2.w;
  w2.eval('activeDateObj = new Date(2026, 11, 8); renderTimeline();');
  const b2 = w2.document.getElementById('ag-filter-btn');
  ok(JSON.stringify(JSON.parse(w2.eval('JSON.stringify([agTagFilter, agHideDone])'))) === JSON.stringify([t2.id, true]) && w2.document.getElementById('ag-filter-now').textContent.trim() === t2.name && b2.classList.contains('agf-on'), 'abrindo o app de novo, o filtro continua (o botão já mostra "' + b2.textContent.trim() + '")');
  ok([...w2.document.querySelectorAll('#blocks-container .block-item[data-block-id^="f"]')].map((e) => e.dataset.blockId).sort().join(',') === 'fB,fF', 'e a agenda já abre filtrada');
  const B3 = await boot(REPO, Object.assign({}, store, { tb__filtro_tag: 'tag_lixo', tb__ocultar_concluidos: '0' })), w3 = B3.w;
  w3.eval('activeDateObj = new Date(2026, 11, 8); renderTimeline();');
  ok(w3.eval('agTagFilter') === '' && w3.document.querySelectorAll('#blocks-container .tl-hidden').length === 0 && w3.eval("localStorage.getItem('tb__filtro_tag')") === '', 'valor estranho guardado (tag que não existe): abre sem filtro de tag e conserta o guardado');
  ok(!B2.errors.length && !B3.errors.length, 'as aberturas sem erro');

  // ======================================================================================================
  console.log('\nL) Fechar:');
  btn().click();
  ok(modalOpen(), 'aberta');
  ev('onOverlayClick()');
  ok(!modalOpen() && $('overlay').classList.contains('pointer-events-none'), 'tocar no fundo escuro fecha (pelo Fechar)');
  btn().click();
  d.querySelector('#ag-filter-modal [data-voltar]').click();
  ok(!modalOpen(), 'o Fechar fecha');
  ok(B.errors.length === errs0, 'sem erro no app' + (B.errors.length > errs0 ? ': ' + B.errors[errs0] : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
