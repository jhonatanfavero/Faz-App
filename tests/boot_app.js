// Sobe o app REAL (index.html + app.js + sync.js) em jsdom com Supabase falso.
const fs = require('fs'), path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');
const { makeServer, makeCreateClient } = require('./mock_supabase');
// Relógio dos testes: o "agora" do app é sempre 15/11/2026 às 21:00 (hora local) e segue andando a
// partir daí. É o "hoje" dos dados fictícios; assim o resultado não muda com o dia em que o teste roda.
function travarRelogio(w) {
  const RD = w.Date, base = new RD(2026, 10, 15, 21, 0, 0).getTime(), t0 = RD.now();
  const agora = () => base + (RD.now() - t0);
  w.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(agora()); } static now() { return agora(); } };
}
module.exports = async function boot(REPO, storage, opts = {}) {
  const errors = [], confirms = [], alerts = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!/^\[Faz\] dado corrompido/.test(m)) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8').replace(/<script src="[^"]*"><\/script>/g, '').replace('<head>', '<head><script>window.tailwind = {};</script>');
  const dom = new JSDOM(html, { url: 'https://jhonatanfavero.github.io/Faz-App/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) { travarRelogio(w); if (opts.userAgent) Object.defineProperty(w.navigator, 'userAgent', { value: opts.userAgent }); if (opts.beforeParse) opts.beforeParse(w); } });
  const w = dom.window;
  if (w.document.readyState !== 'complete') await new Promise((r) => w.addEventListener('load', r));
  for (const [k, v] of Object.entries(storage || {})) w.localStorage.setItem(k, v);
  w.confirm = (m) => { confirms.push(m); return true; };
  w.alert = (m) => { alerts.push(m); };
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {}; w.HTMLElement.prototype.scrollTo = function () {};
  const server = opts.server || makeServer();
  w.supabase = { createClient: makeCreateClient(server) };
  for (const f of ['app.js', 'faz-config.js', 'metas.js', 'assistente.js', 'sync.js', 'avisos.js']) { const s = w.document.createElement('script'); s.textContent = fs.readFileSync(path.join(REPO, f), 'utf8'); w.document.body.appendChild(s); }
  w.eval('showToast = function(m){ window.__toasts = (window.__toasts||[]).concat([m]); }');
  await new Promise((r) => setTimeout(r, 300));
  return { w, server, errors, confirms, alerts, L: (k) => w.localStorage.getItem(k), $: (id) => w.document.getElementById(id) };
};
module.exports.travarRelogio = travarRelogio;
