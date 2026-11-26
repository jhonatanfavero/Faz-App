// V40.47.0 — QUADROS E LISTAS COMPARTILHADAS na tela do PC (kanban.html): quem está no quadro (a esposa, o sócio que só
// usa o computador) vê a lista do outro no fim do quadro e faz tudo nas tarefas dela, gravando na conta de quem é dono;
// o dono compartilha pelo menu da lista e cuida do quadro em Configurações. Ao vivo, Desfazer, tag e conta certa.
// Uso: TZ='America/Sao_Paulo' node tests/test_quadros_pc.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const CORE = require(path.resolve(REPO, 'sync.js'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
async function waitFor(fn, ms = 5000, step = 30) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(step); } return false; }

const DONO = 'aaaaaaaa-1111-4111-8111-111111111111', MEMBRO = 'bbbbbbbb-2222-4222-8222-222222222222';
const BETA = 'col_1700000007000', GAMA = 'col_1700000008000', TAG = 'tag_1700000004000';
const CASA = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const server = makeServer();
server.addUser('dono@teste.com', 'senha123', DONO); server.addUser('membro@teste.com', 'senha123', MEMBRO);
// a conta do dono (os dados fictícios inteiros) e a da pessoa (duas listas, uma tarefa e a mesma tag de id igual)
const J = (k) => JSON.parse(backup.data[k]);
const local = { tarefas: J('tb_backlog_db'), listas: J('tb_backlog_columns'), tags: J('tb_tags_db'), blocos: J('tb_master_db') };
const p0 = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p0.push[k]) server.tables[k].set(DONO + '|' + r.id, { ...r, user_id: DONO, updated_at: new Date(Date.now() + ++server.clock).toISOString() });
server.tables.quadros.set(CASA, { id: CASA, dono: DONO, nome: 'Casa', created_at: 'x', updated_at: 'x' });
server.tables.quadros_membros.set(CASA + '|' + DONO, { quadro: CASA, membro: DONO, email: 'dono@teste.com', papel: 'dono' });
server.tables.quadros_membros.set(CASA + '|' + MEMBRO, { quadro: CASA, membro: MEMBRO, email: 'membro@teste.com', papel: 'membro' });
server.get('listas', DONO, BETA).quadro_id = CASA;
const betaIds = [...server.tables.tarefas.values()].filter((t) => t.user_id === DONO && t.column_id === BETA && !t.deleted).map((t) => t.id);
server.get('tarefas', DONO, betaIds[0]).tag_id = TAG; // tarefa da BETA com uma tag do dono
server.insert('listas', MEMBRO, { id: 'col_geral', name: 'Geral', is_default: true, position: 1024 });
server.insert('listas', MEMBRO, { id: 'col_m', name: 'MINHA', position: 2048 });
server.insert('tarefas', MEMBRO, { id: 'bl_m1', column_id: 'col_m', title: 'Minha tarefa', position: 1024 });
server.insert('tags', MEMBRO, { id: TAG, name: 'Mesmo id', color: '#3b82f6', position: 1024 });

async function pc(uid, email) {
  server.storedSession = { access_token: 'tok', user: { id: uid, email, user_metadata: { faz_hours: [7, 24] } } };
  const errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js'].map((f) => '<script>' + (f === 'sync.js' ? 'window.FAZ_SYNC_CORE_ONLY = true;' : '') + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>' + inline);
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date, FIX = new RD(2026, 10, 16, 10, 20, 0).getTime();
      let n = 0;
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX + n); } static now() { return FIX + (n += 7); } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      w.HTMLElement.prototype.scrollIntoView = function () {};
      w.HTMLElement.prototype.scrollTo = function () {};
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  await waitFor(() => d.querySelectorAll('section.col').length > 0, 8000);
  return { w, d, $, errors, uid };
}

(async () => {
  const B = await pc(MEMBRO, 'membro@teste.com');
  const { w, d, $ } = B;
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const press = (el, k, o) => el.dispatchEvent(new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, o || {})));
  const T = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const AL = CORE.sharedAlias(DONO, BETA);
  const sec = (id) => d.querySelector(`section.col[data-col="${id}"]`);
  const cards = (id) => [...(sec(id) ? sec(id).querySelectorAll('.card') : [])].map((c) => c.dataset.id);
  const cardBy = (id, title) => [...sec(id).querySelectorAll('.card')].find((c) => T(c).includes(title));
  const dono = (id) => server.get('tarefas', DONO, id);

  console.log('A) No PC de quem está no quadro, a lista do outro aparece no fim, com as tarefas:');
  await waitFor(() => sec(AL) && cards(AL).length === betaIds.length, 6000);
  const order = [...d.querySelectorAll('section.col')].map((s) => s.dataset.col);
  ok(sec(AL) && order[order.length - 1] === AL && order.indexOf('col_m') < order.indexOf(AL), 'a BETA (do dono) apareceu no fim, depois das listas dela');
  ok(cards(AL).length === betaIds.length && cards(AL).every((id) => id.startsWith('sh_aaaaaaaa_')), 'com as ' + betaIds.length + ' tarefas (cada uma com o prefixo da conta do dono)');
  ok(/de dono@teste\.com · Casa/.test(T(sec(AL).querySelector('header'))) && sec(AL).classList.contains('col-shared') && !!sec(AL).querySelector('header .ph-users-three') && !sec(AL).querySelector('header').hasAttribute('draggable'), 'cabeçalho: de quem é e o quadro, com o ícone (e não arrasta pro lado)');
  ok(!cards(GAMA).length && !d.querySelector(`section.col[data-col="${CORE.sharedAlias(DONO, GAMA)}"]`), 'as outras listas do dono continuam invisíveis');

  console.log('\nB) Faz tudo na lista do outro, gravando na conta dele:');
  const first = cards(AL)[0], rid0 = first.replace(/^sh_aaaaaaaa_/, '');
  click(d.querySelector(`.card[data-id="${first}"]`));
  await waitFor(() => !$('modal-task').classList.contains('hidden'));
  ok([...$('f-col').options].some((o) => o.value === AL && /\(de dono@teste\.com\)/.test(o.textContent)), 'no cartão, a lista dele aparece "(de dono@teste.com)"');
  $('f-title').value = 'Editada no PC dela';
  click($('f-save'));
  await waitFor(() => dono(rid0).title === 'Editada no PC dela');
  ok(dono(rid0).title === 'Editada no PC dela', 'editou: mudou na conta do dono');
  const taggedRid = betaIds[0], taggedLocal = CORE.sharedLocalId(DONO, taggedRid);
  click(d.querySelector(`.card[data-id="${taggedLocal}"]`));
  await waitFor(() => !$('modal-task').classList.contains('hidden'));
  $('f-title').value = 'Com a tag dele';
  click($('f-save'));
  await waitFor(() => dono(taggedRid).title === 'Com a tag dele');
  ok(dono(taggedRid).tag_id === TAG, 'a tag que o dono pôs continua (editar não tira)');
  click(sec(AL).querySelector('.add-btn'));
  const ta = sec(AL).querySelector('.composer-input');
  ta.value = 'Criada no PC dela'; ta.dispatchEvent(new w.Event('input', { bubbles: true }));
  press(ta, 'Enter');
  await waitFor(() => [...server.tables.tarefas.values()].some((t) => t.user_id === DONO && t.title === 'Criada no PC dela'));
  const nova = [...server.tables.tarefas.values()].find((t) => t.user_id === DONO && t.title === 'Criada no PC dela');
  ok(nova && nova.column_id === BETA && !nova.id.startsWith('sh_') && !server.rows('tarefas', MEMBRO).some((t) => t.title === 'Criada no PC dela'), 'criou: nasceu na BETA, na conta do dono (nada na conta dela)');
  // apagar pelo menu do cartão
  const del = cards(AL).find((id) => id !== first && id !== taggedLocal && id.startsWith('sh_')), ridDel = del.replace(/^sh_aaaaaaaa_/, '');
  click(d.querySelector(`[data-more="${del}"]`));
  click(d.querySelector('[data-act="delete"]'));
  await waitFor(() => !$('dialog').classList.contains('hidden'));
  click($('dlg-ok'));
  await waitFor(() => dono(ridDel).deleted === true);
  ok(dono(ridDel).deleted === true && !cards(AL).includes(del), 'apagou pelo menu do cartão: apagada na conta do dono');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => dono(ridDel).deleted === false);
  ok(dono(ridDel).deleted === false && cards(AL).includes(del), 'Ctrl+Z: voltou (na conta do dono)');

  console.log('\nC) Mudar de conta: da lista do outro pra lista dela (e Desfazer):');
  const mv = cards(AL).find((id) => id.startsWith('sh_') && id !== first && id !== taggedLocal && id !== del), ridMv = mv.replace(/^sh_aaaaaaaa_/, '');
  const mvTitle = dono(ridMv).title;
  click(d.querySelector(`.card[data-id="${mv}"]`));
  await waitFor(() => !$('modal-task').classList.contains('hidden'));
  $('f-col').value = 'col_m';
  click($('f-save'));
  await waitFor(() => dono(ridMv).deleted === true && server.rows('tarefas', MEMBRO).some((t) => t.title === mvTitle && !t.deleted));
  const copia = server.rows('tarefas', MEMBRO).find((t) => t.title === mvTitle && !t.deleted);
  ok(dono(ridMv).deleted === true && copia && copia.column_id === 'col_m' && copia.id !== ridMv, 'levou pra lista dela: saiu da conta do dono e nasceu na dela (id novo)');
  ok(cards('col_m').includes(copia.id) && !cards(AL).includes(mv), 'na tela: está na MINHA');
  press(d.body, 'z', { ctrlKey: true });
  await waitFor(() => dono(ridMv).deleted === false && server.get('tarefas', MEMBRO, copia.id).deleted === true);
  ok(dono(ridMv).deleted === false && server.get('tarefas', MEMBRO, copia.id).deleted === true && cards(AL).includes(mv), 'Ctrl+Z: voltou pra BETA do dono (e a cópia dela some)');
  // da lista dela pra do outro, pelo cartão
  click(d.querySelector('.card[data-id="bl_m1"]'));
  await waitFor(() => !$('modal-task').classList.contains('hidden'));
  $('f-col').value = AL;
  click($('f-save'));
  await waitFor(() => server.get('tarefas', MEMBRO, 'bl_m1').deleted === true && [...server.tables.tarefas.values()].some((t) => t.user_id === DONO && t.title === 'Minha tarefa' && !t.deleted));
  ok([...server.tables.tarefas.values()].some((t) => t.user_id === DONO && t.title === 'Minha tarefa' && t.column_id === BETA && t.id !== 'bl_m1'), 'trouxe uma dela pra BETA: nasceu na conta do dono com id novo');

  console.log('\nD) Ao vivo: o que o dono muda aparece sozinho:');
  server.patch('tarefas', DONO, rid0, { title: 'O dono mudou' });
  await waitFor(() => T(sec(AL)).includes('O dono mudou'));
  ok(T(sec(AL)).includes('O dono mudou'), 'o dono editou uma tarefa: mudou na tela dela sem recarregar');
  server.insert('tarefas', DONO, { id: 'bl_vivo', column_id: BETA, title: 'Nova do dono', position: 9e9 });
  server.insert('tarefas', DONO, { id: 'bl_privada', column_id: GAMA, title: 'Privada do dono', position: 9e9 });
  await waitFor(() => T(sec(AL)).includes('Nova do dono'));
  ok(T(sec(AL)).includes('Nova do dono') && !T(d.body).includes('Privada do dono'), 'tarefa nova na BETA chegou; a da GAMA (não compartilhada) não');
  server.patch('listas', DONO, BETA, { name: 'COMPRAS' });
  await waitFor(() => /COMPRAS/.test(T(sec(AL).querySelector('h2'))));
  ok(/COMPRAS/.test(T(sec(AL).querySelector('h2'))), 'o dono renomeou a lista: mudou aqui');
  ok(!T(d.body).includes('Privada do dono'), '(nada de fora do quadro)');

  console.log('\nE) Tag dela com o mesmo id da do dono: apagar a dela não mexe na tarefa dele:');
  click($('btn-tags'));
  await waitFor(() => !$('modal-tags').classList.contains('hidden'));
  const delTag = d.querySelector(`[data-tg-del="${TAG}"]`);
  if (delTag) { click(delTag); await waitFor(() => !$('dialog').classList.contains('hidden')); click($('dlg-ok')); await waitFor(() => server.get('tags', MEMBRO, TAG).deleted === true); }
  ok(!!delTag && server.get('tags', MEMBRO, TAG).deleted === true && dono(taggedRid).tag_id === TAG, 'apagou a tag dela: a tarefa do dono continua com a tag dele');
  if (!$('modal-tags').classList.contains('hidden')) click($('tg-close'));

  console.log('\nF) Configurações → Quadros (o da pessoa) e o menu da lista do outro:');
  click(sec(AL).querySelector('.col-menu-btn'));
  const menuTxt = T(d.querySelector('[role="menu"]'));
  ok(/Lista de dono@teste\.com · quadro Casa/.test(menuTxt) && !/Renomear|Apagar lista/.test(menuTxt) && /Ver o quadro/.test(menuTxt), 'menu da lista do outro: de quem é, sem Renomear nem Apagar, com "Ver o quadro"');
  click([...d.querySelectorAll('[role="menu"] button')].find((b) => /Ver o quadro/.test(b.textContent)));
  await waitFor(() => !$('modal-cfg').classList.contains('hidden') && /Casa/.test(T($('cfg-qd'))));
  ok(/Casa/.test(T($('cfg-qd'))) && /de dono@teste\.com/.test(T($('cfg-qd'))) && !!$('cfg-qd').querySelector('[data-qd-leave]') && !$('cfg-qd').querySelector('[data-qd-add]'), 'Configurações → Quadros: o quadro Casa (de quem criou), com "Sair" e sem "Pôr pessoa" (ela não criou)');
  click($('cfg-close'));

  console.log('\nG) O PC do dono: compartilha pelo menu da lista e cuida do quadro:');
  const A = await pc(DONO, 'dono@teste.com');
  const a$ = A.$, ad = A.d, aclick = (el) => el.dispatchEvent(new A.w.MouseEvent('click', { bubbles: true, cancelable: true }));
  const asec = (id) => ad.querySelector(`section.col[data-col="${id}"]`);
  await waitFor(() => asec(BETA) && /quadro Casa/.test(asec(BETA).querySelector('h2').getAttribute('title') || ''));
  ok(!!asec(BETA).querySelector('header .ph-users-three') && /Compartilhada com o quadro Casa/.test(asec(BETA).querySelector('h2').getAttribute('title')), 'a BETA dele mostra que está compartilhada com a Casa');
  ok(T(asec(BETA)).includes('Criada no PC dela') && T(asec(BETA)).includes('Minha tarefa'), 'e já tem o que ela criou e trouxe (é a conta dele)');
  aclick(asec(GAMA).querySelector('.col-menu-btn'));
  aclick([...ad.querySelectorAll('[role="menu"] button, body > div.fixed button')].find((b) => /Compartilhar com um quadro/.test(b.textContent)));
  await waitFor(() => [...ad.querySelectorAll('[data-share]')].length >= 2);
  ok(/Só minha/.test(T(ad.querySelector('[role="menu"]'))) && [...ad.querySelectorAll('[data-share]')].some((b) => b.dataset.share === CASA), 'Compartilhar: "Só minha" e os quadros dele');
  aclick([...ad.querySelectorAll('[data-share]')].find((b) => b.dataset.share === CASA));
  await waitFor(() => server.get('listas', DONO, GAMA).quadro_id === CASA);
  ok(server.get('listas', DONO, GAMA).quadro_id === CASA, 'escolheu "Casa": a GAMA foi pro quadro');
  const AG = CORE.sharedAlias(DONO, GAMA);
  await waitFor(() => sec(AG) && cards(AG).length >= 6, 6000);
  ok(sec(AG) && cards(AG).length >= 6 && T(sec(AG)).includes('Privada do dono'), 'no PC dela a GAMA apareceu sozinha (ao vivo), com as tarefas');
  // Configurações do dono: pôr alguém que não tem conta, depois tirar a pessoa
  aclick(a$('btn-cfg'));
  await waitFor(() => /Casa/.test(T(a$('cfg-qd'))) && a$('cfg-qd').querySelector('[data-qd-add]'));
  const em = a$('cfg-qd').querySelector('input[data-qd-email]');
  em.value = 'ninguem@teste.com';
  aclick(a$('cfg-qd').querySelector('[data-qd-add]'));
  await waitFor(() => /criar a conta/.test(T(a$('cfg-qd'))));
  ok(/criar a conta/.test(T(a$('cfg-qd'))) && a$('cfg-qd').querySelector('input[data-qd-email]').value === 'ninguem@teste.com', 'pôr um e-mail sem conta: avisa (e o e-mail continua no campo)');
  aclick(a$('cfg-qd').querySelector(`[data-qd-rm="${CASA}|${MEMBRO}"]`));
  await waitFor(() => !a$('dialog').classList.contains('hidden'));
  aclick(a$('dlg-ok'));
  await waitFor(() => !server.tables.quadros_membros.has(CASA + '|' + MEMBRO));
  ok(!server.tables.quadros_membros.has(CASA + '|' + MEMBRO), 'tirou a pessoa do quadro');
  click($('btn-refresh')); // (sozinho a cada minuto; aqui pelo "Atualizar")
  await waitFor(() => !sec(AL) && !sec(AG), 6000);
  ok(!sec(AL) && !sec(AG), 'no PC dela as listas dele saíram (na próxima releitura: a cada minuto ou no Atualizar)');
  ok(server.alive('tarefas', DONO).filter((t) => t.column_id === BETA).length >= betaIds.length, '(e nada foi apagado na conta dele)');
  aclick(a$('cfg-qd-create'));
  ok(/Dê um nome/.test(T(a$('cfg-qd'))), 'criar quadro sem nome: pede o nome');
  a$('cfg-qd-new').value = 'Empresa';
  aclick(a$('cfg-qd-create'));
  await waitFor(() => [...server.tables.quadros.values()].some((q) => q.nome === 'Empresa'));
  await waitFor(() => /Empresa/.test(T(a$('cfg-qd'))));
  ok(/Empresa/.test(T(a$('cfg-qd'))) && /Quadro "Empresa" criado/.test(T(a$('cfg-qd'))), 'criou o quadro "Empresa" pela tela');
  a$('cfg-qd-new').value = '<img src=x onerror="window.__xss=1">';
  aclick(a$('cfg-qd-create'));
  await waitFor(() => /img src=x/.test(T(a$('cfg-qd'))));
  ok(/img src=x/.test(T(a$('cfg-qd'))) && !a$('cfg-qd').querySelector('img') && !A.w.__xss, 'nome de quadro com HTML aparece como texto (não vira HTML)');

  const errs = B.errors.concat(A.errors);
  ok(errs.length === 0, 'nenhum erro de página nos dois PCs' + (errs.length ? ': ' + errs[0].slice(0, 300) : ''));
  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
