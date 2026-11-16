// O app trata título/nome digitado pelo usuário como HTML? Semeia <img> em todos os campos de texto e
// confere que nenhum vira elemento de verdade na tela (app.js real em jsdom). Uso: node test_injecao.js <repo>
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const { JSDOM, VirtualConsole } = require('jsdom');
const REPO = process.argv[2];
const show = (f) => fs.readFileSync(path.join(REPO, f), "utf8");
(async () => {
  let html = show('index.html').replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind={};</script>');
  const dom = new JSDOM(html, { url: 'https://jhonatanfavero.github.io/Faz-App/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window;
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r));
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const today = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, month = today.slice(0, 7);
  const x = (id) => `<img src="x" id="inj-${id}">`;
  const seed = {
    tb_start_hour: '0', tb_end_hour: '24',
    tb_master_db: [{ id: 'f_x1', type: 'focus', title: x('agenda-titulo'), startMin: 23 * 60, duration: 30, date: today, microblocks: [{ title: x('agenda-checklist'), done: false }], completed: false, theme: 'focus', tagId: 'tag_x', linkedNoteIds: [], expanded: true }],
    tb_backlog_db: [{ id: 'bl_x', title: x('lista-titulo'), duration: 15, tagId: 'tag_x', microblocks: [{ title: x('lista-checklist'), done: false }], columnId: 'col_geral' }],
    tb_backlog_columns: [{ id: 'col_geral', name: x('lista-nome'), isDefault: true, createdAt: 1 }],
    tb_tags_db: [{ id: 'tag_x', name: x('tag-nome'), color: '#ef4444' }],
    tb_routines_db: [{ id: 'rt_x', title: x('rotina-titulo'), emoji: '☀️', duration: 30, theme: 'focus', tagId: null, microblocks: [{ title: x('rotina-checklist'), done: false }] }],
    tb_notes_db: [{ id: 'n_x', title: x('nota-titulo'), content: x('nota-conteudo'), linkedBlockIds: [], createdAt: Date.now() }],
    tb_financial_db: [{ id: 'fin_x', title: x('financa-titulo'), amount: 10, startMonth: month, durationMonths: 1, isRecurring: false, dueDay: 10, paidMonths: [] }],
  };
  for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  w.confirm = () => true; w.alert = () => {}; w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.HTMLElement.prototype.scrollTo = function () {};
  const s = w.document.createElement('script'); s.textContent = show('app.js'); w.document.body.appendChild(s);
  await new Promise((r) => setTimeout(r, 300));
  const tryRun = (code) => { try { w.eval(code); } catch (e) {} };
  ['renderTimeline()', 'renderBacklog()', 'renderRoutinesList()', 'renderNotes()', 'renderFinancial()', 'renderTagsList()', 'renderTagSelector()', "expandedBacklogIds.add && expandedBacklogIds.add('bl_x'); renderBacklog()", "expandedRoutineIds.add && expandedRoutineIds.add('rt_x'); renderRoutinesList()", "openMoveCardModal('bl_x')", 'renderReports("today")'].forEach(tryRun);
  const found = [...w.document.querySelectorAll('img[id^="inj-"]')].map((e) => e.id.slice(4));
  const all = ['agenda-titulo', 'agenda-checklist', 'lista-titulo', 'lista-checklist', 'lista-nome', 'tag-nome', 'rotina-titulo', 'rotina-checklist', 'nota-titulo', 'nota-conteudo', 'financa-titulo'];
  const shownAsText = all.filter((k) => !found.includes(k) && w.document.body.textContent.includes(`id="inj-${k}"`));
  const inj = [...new Set(found)], fora = all.filter((k) => !found.includes(k) && !shownAsText.includes(k));
  console.log('VIRA HTML (injeção):', inj);
  console.log('aparece como texto (seguro):', shownAsText);
  console.log('não apareceu na tela neste teste:', fora);
  console.log(`\n==== RESULTADO: ${shownAsText.length} passaram, ${inj.length + fora.length} falharam ====`);
  w.close(); process.exit(inj.length + fora.length ? 1 : 0);
})().catch((e) => { console.error('ERRO', e.message); process.exit(2); });
