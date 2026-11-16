// V40.20.0 — tela do PC (kanban.html): aba Assistente, a primeira. Lê os dados da nuvem (agenda, listas, rotinas,
// notas e finanças) e responde pelo assistente.js, o mesmo do celular. Itens da resposta abrem o bloco, a despesa...
// Uso: TZ='America/Sao_Paulo' node test_kanban_v4020.js <repo> <backup.json>
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');

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
const p = CORE.plan({ local, base: null, remote: {}, firstSync: true });
for (const k of CORE.KINDS) for (const r of p.push[k]) server.tables[k].set(UID + '|' + r.id, { ...r, user_id: UID, updated_at: ++server.clock });
server.storedSession = { access_token: 'tok', user: { id: UID, email: 'pessoa@teste.com', user_metadata: {} } };

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  const cfg = fs.readFileSync(path.join(REPO, 'faz-config.js'), 'utf8'), brain = fs.readFileSync(path.join(REPO, 'assistente.js'), 'utf8');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '');
  html = html.replace('<head>', '<head><script>window.tailwind = {};</script><script>' + cfg + '</script><script>' + brain + '</script>');
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      const RD = w.Date, FIX = new RD(2026, 10, 16, 7, 20, 0).getTime(); // segunda 16/11/2026, 07:20
      w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(FIX); } static now() { return FIX; } };
      w.supabase = { createClient: makeCreateClient(server) };
      w.CSS = w.CSS || {}; w.CSS.escape = w.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
    },
  });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const click = (el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const key = (el, k) => { const e = new w.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
  const visible = (id) => !$(id).classList.contains('hidden');
  const msgs = () => [...d.querySelectorAll('#as-feed > div')];
  const lastMsg = () => msgs().slice(-1)[0];
  const send = (txt) => { $('as-input').value = txt; $('as-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
  await waitFor(() => d.querySelectorAll('section.col').length === 5);
  const today = server.alive('blocos', UID).filter((b) => b.date === '2026-11-16' && !b.archived);

  console.log('A) A aba Assistente:');
  ok([...d.querySelectorAll('.tab')].map((b) => b.textContent.trim()).join(',') === 'Assistente,Listas,Agenda,Rotinas,Notas,Finanças,Metas', 'é a primeira aba: Assistente, Listas, Agenda, Rotinas, Notas, Finanças (e Metas, desde a V40.21.0)');
  ok(visible('board') && !visible('assistente'), 'quem já usava continua abrindo onde estava (aqui, nas Listas)');
  click($('tab-assistente'));
  ok(visible('assistente') && !visible('board') && $('tab-assistente').classList.contains('on') && w.localStorage.getItem('faz_pc_tab') === 'assistente' && !visible('zoom-ctl'), 'abre, fica lembrada e não tem zoom');
  ok(msgs().length === 1 && lastMsg().textContent.startsWith('Bom dia! Hoje é segunda, 16 de novembro. Você tem ' + today.length + ' blocos na agenda'), 'começa com o resumo do dia, com os dados da nuvem (' + today.length + ' blocos hoje)');
  ok(d.querySelectorAll('#as-chips [data-as-chip]').length === 10 && $('as-name').textContent === 'Assistente', 'as 10 sugestões e o nome (provisório) aparecem');
  // o resumo acompanha os dados enquanto ninguém perguntou nada
  server.insert('blocos', UID, { id: 'f_novo_hoje', date: '2026-11-16', start_min: 23 * 60, duration: 30, title: 'Bloco criado no celular', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, archived: false });
  await waitFor(() => lastMsg().textContent.includes('Você tem ' + (today.length + 1) + ' blocos'));
  ok(msgs().length === 1 && lastMsg().textContent.includes('Você tem ' + (today.length + 1) + ' blocos'), 'bloco novo do celular: o resumo se atualiza sozinho');

  console.log('\nB) Perguntar:');
  click([...d.querySelectorAll('#as-chips [data-as-chip]')].find((b) => b.dataset.asChip === 'contas'));
  ok(msgs().length === 3 && msgs()[1].textContent === 'Minhas contas' && /^Em novembro: 18 despesas, R\$ 7\.588,00 no total\. Pago: R\$ 3\.681,60\. Em aberto: R\$ 3\.906,40\. 5 estão atrasadas\./.test(lastMsg().textContent), 'sugestão "Minhas contas": mesmos números da aba Finanças');
  const late = lastMsg().querySelector('[data-as-kind="despesa"]');
  click(late);
  ok(visible('financas') && visible('modal-fin') && $('fn-label').textContent === 'Novembro 2026' && $('fn-f-head').textContent === 'Editar despesa', 'clicar numa conta da resposta abre a despesa na aba Finanças');
  key(d.body, 'Escape');
  click($('tab-assistente'));
  ok(msgs().length === 3, 'voltando pra aba, a conversa continua ali');
  send('o que tenho amanhã?');
  ok($('as-input').value === '' && msgs()[3].textContent === 'o que tenho amanhã?' && /^Amanhã \(terça, 17\/11\): \d+ blocos/.test(lastMsg().textContent), 'escrever e enviar: "' + lastMsg().textContent.slice(0, 50) + '…"');
  const blk = lastMsg().querySelector('[data-as-kind="bloco"]');
  click(blk);
  ok(visible('modal-task') && $('f-title').value === server.get('blocos', UID, blk.dataset.asId).title, 'clicar num bloco da resposta abre o cartão do bloco');
  key(d.body, 'Escape');
  server.insert('blocos', UID, { id: 'f_outro', date: '2026-11-16', start_min: 22 * 60, duration: 30, title: 'Mais um', type: 'focus', theme: 'focus', tag_id: null, microblocks: [], completed: false, archived: false });
  await sleep(200);
  ok(msgs().length === 5, 'depois de uma pergunta, chegar dado novo não apaga a conversa');
  server.insert('notas', UID, { id: 'note_html', title: '<img src=x onerror=alert(1)>', content: '<b>oi</b>', created_ms: w.Date.now() + 50 });
  await sleep(150);
  send('minhas anotações');
  ok(!d.querySelector('#as-feed img') && !d.querySelector('#as-feed b') && lastMsg().textContent.includes('<img src=x onerror=alert(1)>'), 'nota com HTML aparece como texto');
  click(lastMsg().querySelector('[data-as-kind="nota"]'));
  await waitFor(() => visible('notas') && $('nt-title').value === '<img src=x onerror=alert(1)>');
  ok(visible('notas') && $('nt-title').value === '<img src=x onerror=alert(1)>', 'clicar na nota da resposta abre a nota');
  click($('tab-assistente'));
  send('qual meu contato');
  ok(/^Ainda não sei responder isso/.test(lastMsg().textContent), 'pergunta que ele não sabe: explica o que sabe');
  ok(!key(d.body, 'ArrowRight') && visible('assistente'), 'as setas ← → não fazem nada aqui');
  click($('as-restart'));
  ok(msgs().length === 1 && lastMsg().textContent.startsWith('Bom dia!') && d.activeElement === $('as-input'), '"Recomeçar" volta pro resumo de agora, com o cursor pronto pra perguntar');
  ok(errors.length === 0, 'nenhum erro de página' + (errors.length ? ': ' + errors[0].slice(0, 300) : ''));

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  try { w.close(); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(2); });
