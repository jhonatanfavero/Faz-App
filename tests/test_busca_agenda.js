// V40.35.0 — BUSCA NA AGENDA.
// Parte A: a tela do PC (kanban.html em jsdom): o campo "Buscar na agenda" na barra; procura em todos os dias no nome,
//          no checklist, nos cartões da sublista (e no checklist deles) e na tag, sem acento e sem maiúscula, cada palavra
//          em qualquer lugar; arquivado e apagado não entram; a ordem (de hoje em diante, depois os de antes); o que achou
//          aparece marcado; nada encontrado; texto com HTML; clicar abre o bloco e leva a Agenda até ele (outra semana,
//          visão Dia, filtro que escondia o bloco); "Ver o dia"; teclado (setas, Enter, Esc); o × de limpar; o painel
//          acompanhando o que chega da nuvem; muitos resultados; tarefa na mão; trocar de aba.
// Parte B: o celular (index.html + app.js): as mesmas regras na busca da agenda (cardMatchesSearch).
// Uso: TZ='America/Sao_Paulo' node test_busca_agenda.js <repo> <dados-ficticios.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const bootPhone = require('./boot_app');

const REPO = process.argv[2];
const backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const UID = '11111111-2222-3333-4444-555555555555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 4000, step = 30) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

const server = makeServer();
server.addUser('pessoa@teste.com', 'senha123', UID);
const J = (k) => JSON.parse(backup.data[k]);
const local = { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db'), rotinas: J('tb_routines_db'), notas: J('tb_notes_db'), financas: J('tb_financial_db') };
const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p0.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
// Blocos parecidos com os dele (print de 20/11): sublista com nomes, checklist, tag com acento, arquivado, apagado...
const ins = (t, r) => server.tables[t].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
const B = (o) => Object.assign({ type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, was_delayed: false, linked_note_ids: [], color: null, archived: false, cards: null, deleted: false, goal_id: null }, o);
ins('tags', { id: 'tag_q', name: 'QUALITÊ', color: '#10b981', position: 9000, deleted: false });
ins('blocos', B({ id: 'f_sx1', date: '2026-11-21', start_min: 480, duration: 5, title: 'CONSULTA PROTOCOLOS', tag_id: 'tag_q',
  cards: [{ id: 'cd_a', title: 'ASSUNTA', done: false, microblocks: [] }, { id: 'cd_l', title: 'LUCAS ESPERANÇA', done: false, microblocks: [{ title: 'ligar no cartório', done: false }] },
    { id: 'cd_d', title: 'DESM LUCAS', done: true, microblocks: [] }, { id: 'cd_t', title: 'DALTON', done: false, microblocks: [] }] }));
ins('blocos', B({ id: 'f_sx2', date: '2026-11-21', start_min: 490, duration: 30, title: 'GEO ADAO', tag_id: 'tag_q', microblocks: [{ title: 'Conferir matrícula do Lucas', done: false }, { title: 'Memorial', done: true }] }));
ins('blocos', B({ id: 'f_sx3', date: '2026-11-10', start_min: 600, duration: 60, title: 'Reunião com Lucas', type: 'past', completed: true }));
ins('blocos', B({ id: 'f_sx4', date: '2026-11-18', start_min: 600, duration: 30, title: 'Lucas arquivado', archived: true }));
ins('blocos', B({ id: 'f_sx5', date: '2026-11-18', start_min: 660, duration: 30, title: 'Lucas apagado', deleted: true }));
ins('blocos', B({ id: 'f_sx6', date: '2026-11-16', start_min: 900, duration: 15, title: 'Ligar pro Lucas' }));
ins('blocos', B({ id: 'f_sx7', date: '2027-01-05', start_min: 540, duration: 45, title: 'Lucas ano que vem' }));
ins('blocos', B({ id: 'f_sx8', date: '2026-11-19', start_min: 700, duration: 20, title: '<b>Lucas</b> & cia <img src=x onerror=alert(1)>' }));
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: { faz_hours: [7, 24] } } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime(); // segunda 16/11/2026, 10:20
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      w.alert = () => errors.push('alert() chamado');
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const mdown = (el) => el.dispatchEvent(new w.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  const press = (el, k, o) => { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})); el.dispatchEvent(e); return e.defaultPrevented; };
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const inp = () => $('ag-search');
  const type = async (txt) => { inp().focus(); inp().value = txt; inp().dispatchEvent(new w.Event('input', { bubbles: true })); await sleep(140); };
  const panel = () => !$('ag-sres').classList.contains('hidden');
  const rows = () => [...$('ag-sres').querySelectorAll('.ag-sres-row')];
  const titles = () => rows().map((r) => T(r.querySelector('.ag-sres-title')));
  const head = () => T($('ag-sres').querySelector('.ag-sres-head span'));
  const modalOpen = () => !$('modal-task').classList.contains('hidden');
  const toastTxt = () => T($('toast'));
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  click($('tab-agenda')); await sleep(80);

  // ======================================================================================================
  console.log('A) Tela do PC:');
  console.log('A1) O campo na barra:');
  ok(!!inp() && inp().closest('#agenda') && inp().placeholder === 'Buscar na agenda' && inp().getAttribute('role') === 'combobox' && inp().getAttribute('aria-expanded') === 'false', 'campo "Buscar na agenda" na barra da Agenda (fechado)');
  const bar = $('ag-prev').parentNode, kids = [...bar.children];
  ok(kids.indexOf($('ag-search-wrap')) === kids.indexOf(d.querySelector('.ag-view').parentNode) - 1 && $('ag-search-wrap').classList.contains('ml-auto'), 'fica do lado direito, logo antes de Semana/Dia');
  ok(/Ocultar concluídos/.test($('ag-hide-done').textContent) && $('ag-hide-done').querySelector('span.ag-txt') && $('ag-rep').querySelector('span.ag-txt') && $('ag-rep').getAttribute('aria-label') === 'Relatórios' && $('ag-hide-done').getAttribute('aria-label') === 'Ocultar concluídos', '"Ocultar concluídos" e "Relatórios": o texto pode sumir quando não cabe (fica o ícone, com o nome pra leitor de tela), pra busca caber');

  console.log('\nA2) O que ela acha:');
  await type('lucas');
  ok(panel() && inp().getAttribute('aria-expanded') === 'true', 'digitou "lucas": abre o painel');
  ok(head() === '6 blocos', 'acha 6 blocos (' + head() + '): nome, cartão da sublista e checklist; arquivado e apagado não entram');
  ok(JSON.stringify(titles()) === JSON.stringify(['Ligar pro Lucas', '<b>Lucas</b> & cia <img src=x onerror=alert(1)>', 'CONSULTA PROTOCOLOS', 'GEO ADAO', 'Lucas ano que vem', 'Reunião com Lucas']), 'ordem: hoje, depois os próximos dias (e o horário), depois os de antes: ' + titles().join(' | '));
  const secs = [...$('ag-sres').querySelectorAll('.ag-sres-sec')].map(T), days = [...$('ag-sres').querySelectorAll('.ag-sres-day')].map((x) => x.firstChild.textContent + (x.querySelector('.rel') ? ' ' + T(x.querySelector('.rel')) : ''));
  ok(secs.join('|') === 'De hoje em diante 5|Antes de hoje 1', 'seções: ' + secs.join(' | '));
  ok(days.join('|') === 'Seg, 16 de novembro Hoje|Qui, 19 de novembro|Sáb, 21 de novembro|Ter, 5 de janeiro de 2027|Ter, 10 de novembro', 'dias: ' + days.join(' | '));
  const sub = rows()[2], hits = [...sub.querySelectorAll('.ag-sres-hit')].map(T);
  ok(hits.join('|') === 'LUCAS ESPERANÇA|DESM LUCAS' && [...sub.querySelectorAll('mark')].map(T).join(',') === 'LUCAS,LUCAS' && sub.querySelector('.ag-sres-hit.done'), 'sublista: mostra os cartões onde achou, com "lucas" marcado (o feito, riscado)');
  ok(T(sub).includes('1/4') && T(sub).includes('QUALITÊ'), 'e o resumo dela: 1/4 cartões feitos e a tag');
  ok(T(rows()[3].querySelector('.ag-sres-hit')) === 'Conferir matrícula do Lucas' && rows()[3].querySelectorAll('.ag-sres-hit').length === 1, 'bloco normal: mostra o item do checklist onde achou (só ele)');
  ok(T(rows()[5]).includes('Concluído') && rows()[5].querySelector('.ag-sres-title.done'), 'concluído aparece riscado, com "Concluído"');
  ok(!$('ag-sres').querySelector('b, img') && T(rows()[1].querySelector('.ag-sres-title')) === '<b>Lucas</b> & cia <img src=x onerror=alert(1)>', 'nome com HTML aparece como texto');
  ok(rows()[0].classList.contains('on') && inp().getAttribute('aria-activedescendant') === 'ags-o0', 'o primeiro já vem escolhido (Enter abre ele)');

  await type('esperanca');
  ok(head() === '1 bloco' && titles()[0] === 'CONSULTA PROTOCOLOS' && T(rows()[0].querySelector('mark')) === 'ESPERANÇA', 'sem acento: "esperanca" acha "LUCAS ESPERANÇA" e marca "ESPERANÇA" inteiro');
  await type('CARTORIO');
  ok(head() === '1 bloco' && T(rows()[0].querySelector('.ag-sres-hit')) === 'LUCAS ESPERANÇA › ligar no cartório' && T(rows()[0].querySelector('mark')) === 'cartório', 'maiúscula e acento não importam, e acha no checklist do cartão da sublista: "LUCAS ESPERANÇA › ligar no cartório"');
  await type('geo qualitê');
  ok(head() === '1 bloco' && titles()[0] === 'GEO ADAO' && [...rows()[0].querySelectorAll('mark')].map(T).join(',') === 'GEO,QUALITÊ', 'cada palavra em qualquer lugar: "geo qualitê" acha GEO ADAO (nome + tag), e a sublista da mesma tag não');
  await type('  memorial   adao ');
  ok(head() === '1 bloco' && titles()[0] === 'GEO ADAO' && rows()[0].querySelector('.ag-sres-hit.done'), 'espaços sobrando não atrapalham; item feito do checklist aparece riscado');
  await type('zzzz');
  ok(head() === 'Nada encontrado' && /Nenhum bloco com “zzzz”/.test(T($('ag-sres'))) && !rows().length && !inp().hasAttribute('aria-activedescendant'), 'nada encontrado: "Nenhum bloco com “zzzz”"');
  await type('bloco');
  const nb = Object.keys(JSON.parse(backup.data.tb_master_db)).length;
  ok(rows().length === 100 && head() === nb + ' blocos' && /Mais \d+ que não couberam aqui/.test(T($('ag-sres'))), 'muitos resultados (' + head() + '): mostra 100 e pede pra afinar a busca');
  await type('');
  ok(!panel() && inp().getAttribute('aria-expanded') === 'false' && $('ag-search-x').classList.contains('hidden'), 'apagou o texto: o painel fecha (e o × some)');

  console.log('\nA3) Teclado e clique:');
  await type('lucas');
  ok(!$('ag-search-x').classList.contains('hidden'), 'com texto aparece o × de limpar');
  press(inp(), 'ArrowDown'); press(inp(), 'ArrowDown');
  ok(rows()[2].classList.contains('on') && !rows()[0].classList.contains('on') && inp().getAttribute('aria-activedescendant') === 'ags-o2', 'setas pra baixo mudam o escolhido');
  press(inp(), 'ArrowUp');
  ok(rows()[1].classList.contains('on'), 'seta pra cima volta um');
  press(inp(), 'ArrowDown');
  press(inp(), 'Enter'); await sleep(60);
  ok(modalOpen() && $('f-title').value === 'CONSULTA PROTOCOLOS' && T($('ag-label')) === '16 a 22 de nov', 'Enter abre o bloco escolhido (a sublista), na semana dele');
  ok(panel(), 'o painel continua lá atrás');
  press(d.body, 'Escape'); await sleep(30);
  ok(!modalOpen() && panel(), 'Esc fecha o bloco; a busca continua aberta');
  press(d.body, 'Escape'); await sleep(30);
  ok(!panel() && inp().value === 'lucas', 'Esc de novo fecha a busca (o texto fica)');
  inp().blur(); inp().dispatchEvent(new w.FocusEvent('focus')); await sleep(30);
  ok(panel() && rows().length === 6, 'voltou pro campo: o painel reabre com os mesmos resultados');
  // outra semana
  click(rows()[4]); await sleep(60);
  ok(modalOpen() && $('f-title').value === 'Lucas ano que vem' && T($('ag-label')) === '4 a 10 de jan de 2027' && !!d.querySelector('#ag-cols [data-block="f_sx7"]'), 'clicar num resultado de outra semana: a Agenda vai até ela e o bloco abre');
  press(d.body, 'Escape'); await sleep(30);
  // visão Dia
  click(d.querySelector('.ag-view[data-view="day"]')); await sleep(40);
  await type('reuniao');
  click(rows()[0]); await sleep(60);
  ok(modalOpen() && T($('ag-label')).startsWith('Terça, 10 de novembro') && !!d.querySelector('#ag-timeline [data-block="f_sx3"]'), 'na visão Dia: vai pro dia do bloco (' + T($('ag-label')) + ')');
  press(d.body, 'Escape'); await sleep(30);
  click(d.querySelector('.ag-view[data-view="week"]')); await sleep(40);
  // "Ver o dia"
  await type('lucas');
  const dh = [...$('ag-sres').querySelectorAll('.ag-sres-day')].find((x) => x.dataset.sday === '2026-11-21');
  click(dh); await sleep(60);
  ok(!panel() && d.querySelector('.ag-view[data-view="day"]').classList.contains('on') && T($('ag-label')) === 'Sábado, 21 de novembro' && !modalOpen(), '"Ver o dia" (o título do dia): abre aquele dia na visão Dia e fecha a busca');
  click(d.querySelector('.ag-view[data-view="week"]')); await sleep(40);
  // Esc no campo e o ×
  inp().focus(); inp().dispatchEvent(new w.FocusEvent('focus')); await sleep(20);
  ok(panel(), '(reabriu)');
  ok(press(inp(), 'Escape') && !panel() && inp().value === '', 'Esc dentro do campo com texto: limpa e fecha');
  ok(press(inp(), 'Escape') && d.activeElement !== inp(), 'Esc de novo (campo vazio): sai do campo');
  await type('lucas');
  click($('ag-search-x')); await sleep(20);
  ok(!panel() && inp().value === '' && d.activeElement === inp(), 'o × limpa, fecha e deixa o cursor no campo');
  // clicar fora
  await type('lucas');
  mdown(d.querySelector('#ag-cols')); await sleep(20);
  ok(!panel() && inp().value === 'lucas', 'clicar fora fecha o painel (o texto fica)');
  inp().dispatchEvent(new w.FocusEvent('focus')); await sleep(20);
  mdown(rows()[0]); await sleep(20);
  ok(panel(), 'clicar dentro do painel não fecha');

  console.log('\nA4) Filtro que escondia o bloco:');
  inp().blur(); mdown(d.body); await sleep(20);
  click($('ag-hide-done')); await sleep(40);
  $('ag-tag').value = 'tag_q'; $('ag-tag').dispatchEvent(new w.Event('change', { bubbles: true })); await sleep(40);
  ok(T($('board-summary')).length > 0 && $('ag-hide-done').classList.contains('ag-filter-on') && $('ag-hide-done').title === 'Mostrar de novo os blocos concluídos', '(ligou "Ocultar concluídos" e a tag QUALITÊ)');
  await type('reuniao com');
  click(rows()[0]); await sleep(80);
  ok(modalOpen() && $('f-title').value === 'Reunião com Lucas' && !$('ag-hide-done').classList.contains('ag-filter-on') && $('ag-tag').value === '' && !!d.querySelector('#ag-cols [data-block="f_sx3"]'), 'abrir um concluído de outra tag: tira os dois filtros e o bloco aparece na Semana');
  ok(/Tirei “Ocultar concluídos” e o filtro de tag pra mostrar o bloco/.test(toastTxt()), 'e avisa: "' + toastTxt() + '"');
  press(d.body, 'Escape'); await sleep(30); press(d.body, 'Escape'); await sleep(30);

  console.log('\nA5) O que chega da nuvem:');
  await type('lucas');
  const n0 = rows().length;
  server.insert('blocos', UID, B({ id: 'f_sx9', date: '2026-11-17', start_min: 480, duration: 30, title: 'Café com o Lucas' }));
  ok(await waitFor(() => rows().length === n0 + 1 && titles()[1] === 'Café com o Lucas'), 'bloco novo vindo do celular entra na busca aberta, no lugar certo (amanhã)');
  server.patch('blocos', UID, 'f_sx6', { title: 'Ligar pro banco' });
  ok(await waitFor(() => !titles().includes('Ligar pro Lucas') && rows().length === n0), 'bloco renomeado no celular sai da busca');
  server.patch('blocos', UID, 'f_sx9', { archived: true });
  ok(await waitFor(() => rows().length === n0 - 1), 'arquivado em outro aparelho sai da busca');
  press(d.body, 'Escape'); await sleep(20);

  console.log('\nA6) Tarefa na mão e trocar de aba:');
  click($('tab-listas')); await sleep(60);
  const hand = d.querySelector('#columns [data-hand]');
  click(hand); await sleep(80);
  ok(!$('ag-place').classList.contains('hidden'), '(tarefa na mão, na Agenda)');
  await type('geo adao');
  click(rows()[0]); await sleep(60);
  ok(!modalOpen() && !$('ag-place').classList.contains('hidden') && /Fui até o dia do bloco/.test(toastTxt()), 'com tarefa na mão, clicar num resultado só leva até o dia (não abre o bloco, a tarefa continua na mão)');
  click($('ag-place-cancel')); await sleep(40);
  await type('lucas');
  click($('tab-listas')); await sleep(40);
  ok(!panel(), 'trocar de aba fecha o painel');
  click($('tab-agenda')); await sleep(60);
  ok(!panel() && inp().value === 'lucas', 'voltando pra Agenda: fechado, com o texto');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));
  try { w.close(); } catch (e) {}

  // ======================================================================================================
  console.log('\nB) Celular, as mesmas regras:');
  const P = await bootPhone(REPO, backup.data);
  const ev = (x) => P.w.eval(x);
  ev(`tagsDb.push({ id: 'tag_q', name: 'QUALITÊ', color: '#10b981' });
      db.push({ id: 'f_sx1', date: '2026-11-21', startMin: 480, duration: 5, title: 'CONSULTA PROTOCOLOS', type: 'focus', theme: 'focus', tagId: 'tag_q', microblocks: [], completed: false, linkedNoteIds: [],
        cards: [{ id: 'cd_a', title: 'ASSUNTA', done: false, microblocks: [] }, { id: 'cd_l', title: 'LUCAS ESPERANÇA', done: false, microblocks: [{ title: 'ligar no cartório', done: false }] }] },
        { id: 'f_sx2', date: '2026-11-21', startMin: 490, duration: 30, title: 'GEO ADAO', type: 'focus', theme: 'focus', tagId: 'tag_q', microblocks: [{ title: 'Conferir matrícula do Lucas', done: false }], completed: false, linkedNoteIds: [] });`);
  const m = (id, q) => ev(`cardMatchesSearch(db.find((b) => b.id === '${id}'), normalizeText(${JSON.stringify(q)}))`);
  ok(m('f_sx1', 'cartorio') === true, 'acha no checklist do cartão da sublista ("cartorio")');
  ok(m('f_sx2', 'geo qualite') === true && m('f_sx1', 'geo qualite') === false, 'cada palavra em qualquer lugar: "geo qualite" acha GEO ADAO (nome + tag), não a sublista');
  ok(m('f_sx1', 'lucas esperanca') === true && m('f_sx1', 'esperanca') === true && m('f_sx1', 'assunta') === true && m('f_sx2', 'matricula') === true && m('f_sx2', 'qualite') === true, 'continua achando o que já achava (nome do cartão, checklist, tag, trecho seguido)');
  ok(m('f_sx1', 'xyz') === false && m('f_sx2', 'geo xyz') === false && m('f_sx2', '   ') === false, 'palavra que não está em lugar nenhum: não acha');
  ev("activeDateObj = new Date(2026, 10, 21); onSearchInput('cartorio')"); await sleep(40);
  // (o contador usa innerText, que o jsdom não desenha: lê a propriedade)
  ok(/1 resultado de "cartorio"/.test(P.$('search-counter').innerText) && P.w.document.querySelector('[data-block-id="f_sx1"]') && !P.w.document.querySelector('[data-block-id="f_sx2"]'), 'na tela de busca do celular: "1 resultado de "cartorio"" e só a sublista aparece');
  ev("closeSearchBar()");
  ok(P.errors.length === 0, 'nenhum erro de página no celular' + (P.errors.length ? ': ' + P.errors[0].slice(0, 200) : ''));
  try { P.w.close(); } catch (e) {}
  end();
})().catch((e) => { console.error('ERRO', e); fail++; end(); });

function end() {
  console.log(`\nRESULTADO: ${pass} passaram, ${fail} falharam`);
  process.exit(fail ? 1 : 0);
}
