// V40.42.0 — Avisos dos compromissos: o lado do aparelho (avisos.js), a tela do celular (Config → Avisos dos
// compromissos), a do PC (Configurações → Avisos, neste computador), o service worker (sw.js: o aviso e o clique
// nele) e as regras do banco (a migration) iguais às do app e da função.
// O navegador é de mentira (Notification, PushManager e service worker falsos) e a função "alertas" também (no
// fetch): o envio de verdade está no test_avisos_servidor.js.
// Uso: TZ='America/Sao_Paulo' node test_avisos.js <repo> <dados-ficticios.json>
const fs = require('fs'), path = require('path'), vm = require('vm'), nodeCrypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');
const bootPhone = require('./boot_app');
const { makeCreateClient } = require('./mock_supabase');
const REPO = process.argv[2], backup = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 9000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch (e) {} await sleep(30); } return false; }
const sha = (t) => nodeCrypto.createHash('sha256').update(String(t)).digest('hex');
const b64u = (b) => Buffer.from(b).toString('base64url');
const chaveNova = () => b64u(Buffer.concat([Buffer.from([4]), nodeCrypto.randomBytes(64)])); // 65 bytes, como a VAPID pública
const CHAVE1 = chaveNova(), CHAVE2 = chaveNova(), P256 = chaveNova(), AUTH = b64u(nodeCrypto.randomBytes(16));
const UID = '42424242-4242-4242-4242-424242424242', EMAIL = 'avisos@t.com';
const FUNCAO = 'https://zlwocojndrjnuvoowzzu.supabase.co/functions/v1/alertas';

// ---------- o navegador de mentira ----------
// perm: a permissão de notificação agora; resposta: o que a pessoa escolhe quando o navegador pergunta.
// exigeToque: true = como o iPhone/Safari (perguntar a permissão só direto do toque; com ela dada, inscreve sempre);
// 'sempre' = o caso mais rígido (inscrever só direto do toque). O teste marca noToque durante o clique.
function navegadorFalso(w, o) {
  const N = { perm: o.perm || 'default', resposta: o.resposta || 'granted', pedidos: 0, subscribes: [], unsubscribes: 0, registers: [], sub: null, n: 0,
    endpointBase: 'https://fcm.googleapis.com/fcm/send/', exigeToque: o.exigeToque || false, noToque: false, reg: null };
  const pergunta = () => { N.pedidos++; N.perm = N.resposta; };
  w.Notification = function Notification() {};
  Object.defineProperty(w.Notification, 'permission', { get: () => N.perm });
  w.Notification.requestPermission = () => { if (N.perm === 'default' && (!N.exigeToque || N.noToque)) pergunta(); return Promise.resolve(N.perm); };
  w.PushManager = function PushManager() {};
  const fazSub = (key) => {
    const endpoint = N.endpointBase + 'aparelho-' + (++N.n), opts = { applicationServerKey: new Uint8Array(key).buffer };
    const sub = { endpoint, options: opts, toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: P256, auth: AUTH } }),
      unsubscribe: async () => { N.unsubscribes++; if (N.sub === sub) N.sub = null; return true; } };
    return sub;
  };
  const pushManager = {
    getSubscription: async () => N.sub,
    subscribe(op) { // a parte síncrona roda já na chamada (como no navegador: o pedido de permissão sai na hora)
      N.subscribes.push({ userVisibleOnly: op.userVisibleOnly, key: Buffer.from(op.applicationServerKey), noToque: N.noToque });
      const precisaToque = N.exigeToque === 'sempre' || (N.exigeToque && N.perm !== 'granted');
      if (precisaToque && !N.noToque) { const e = new Error('Push notification prompting can only be done from a user gesture.'); e.name = 'NotAllowedError'; return Promise.reject(e); }
      if (N.perm === 'default') pergunta();
      if (N.perm !== 'granted') { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; return Promise.reject(e); }
      if (N.sub) { const e = new Error('already subscribed with another key'); e.name = 'InvalidStateError'; return Promise.reject(e); }
      N.sub = fazSub(op.applicationServerKey);
      return Promise.resolve(N.sub);
    },
  };
  const reg = { scope: 'https://jhonatanfavero.github.io/Faz-App/', active: { state: 'activated' }, pushManager };
  if (o.registrado) N.reg = reg;
  let pronto; const ready = new Promise((r) => { pronto = r; }); if (N.reg) pronto(reg);
  Object.defineProperty(w.navigator, 'serviceWorker', { configurable: true, value: {
    getRegistration: async () => N.reg,
    register: async (url) => { N.registers.push(url); N.reg = reg; pronto(reg); return reg; },
    get ready() { return ready; },
  } });
  N.trocarEndereco = () => { N.sub = fazSub(N.sub.options.applicationServerKey); }; // o navegador renovou a inscrição sozinho
  N.revogar = () => { N.perm = 'denied'; N.sub = null; }; // a pessoa bloqueou nas configurações: o navegador desfaz a inscrição
  return N;
}
// A função "alertas" de mentira: GET ?chave=1 e o POST do aviso de teste.
function funcaoFalsa(w, server) {
  const F = { chave: CHAVE1, gets: 0, posts: [], respostas: [], fora: false };
  w.fetch = async (url, init) => {
    init = init || {};
    if (F.fora) throw new TypeError('Failed to fetch');
    const resp = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
    if (url === FUNCAO + '?chave=1' && (init.method || 'GET') === 'GET') { F.gets++; return resp(200, { chave: F.chave }); }
    if (url === FUNCAO && init.method === 'POST') {
      const corpo = JSON.parse(init.body), st = F.respostas.length ? F.respostas.shift() : 200;
      F.posts.push({ auth: init.headers.Authorization, corpo, st });
      if (st === 410) for (const [k, r] of [...server.tables.push_inscricoes.entries()]) if (r.id === corpo.teste) server.tables.push_inscricoes.delete(k); // a função tira da lista
      return resp(st, st === 200 ? { ok: true } : { erro: 'x' });
    }
    return resp(404, {});
  };
  return F;
}
function webcrypto(w) {
  Object.defineProperty(w, 'crypto', { value: nodeCrypto.webcrypto, configurable: true, writable: true });
  w.TextEncoder = require('util').TextEncoder;
}
const linhas = (server, uid) => [...server.tables.push_inscricoes.values()].filter((r) => r.user_id === (uid || UID));

(async () => {
  // =====================================================================
  console.log('A) Celular, sem conta:');
  let NAV, F;
  const A = await bootPhone(REPO, backup.data, { beforeParse(w) { webcrypto(w); NAV = navegadorFalso(w, { registrado: true }); } });
  const { w, server, $ } = A, LS = A.L;
  F = funcaoFalsa(w, server);
  const click = (el) => { NAV.noToque = true; try { el.click(); } finally { NAV.noToque = false; } }; // o toque de verdade
  const chips = () => [...$('avisos-minutos').querySelectorAll('[data-avisos-min]')];
  const chipOn = () => (chips().find((b) => b.getAttribute('aria-checked') === 'true') || {}).textContent;
  const estado = () => JSON.parse(LS('tb__avisos') || '{}');
  ok(A.errors.length === 0 && typeof w.FazAvisos === 'object' && typeof w.FazAvisos.ligar === 'function', 'o app abre sem erro com o avisos.js (FazAvisos)');
  w.openConfigSheet();
  ok(/Avisos dos compromissos/.test($('config-main-menu').textContent) && $('avisos-menu-status').textContent === 'Aviso antes de cada compromisso', 'Configurações tem "Avisos dos compromissos" ("Aviso antes de cada compromisso")');
  w.openConfigAvisos();
  ok($('config-title').innerText === 'Avisos' && !$('config-avisos-view').classList.contains('hidden') && $('config-main-menu').classList.contains('hidden') && $('config-back-btn').getAttribute('onclick') === 'closeConfigAvisos()', 'abre a tela "Avisos" (o voltar do topo fecha ela)');
  await waitFor(() => $('avisos-titulo').textContent === 'Entre na sua conta primeiro');
  ok($('avisos-titulo').textContent === 'Entre na sua conta primeiro' && $('avisos-ligar').textContent.trim() === 'Entrar na conta' && $('avisos-teste').disabled && chips().length === 5 && chips().every((b) => b.disabled), 'sem conta: "Entre na sua conta primeiro", o botão "Entrar na conta"; teste e minutos apagados');
  ok(chips().map((b) => b.textContent).join(',') === 'Na hora,5 min,10 min,15 min,30 min' && chipOn() === '10 min', 'as escolhas: Na hora, 5, 10, 15 e 30 min (10 marcado)');
  click($('avisos-ligar'));
  ok(!$('config-sync-view').classList.contains('hidden') && $('config-avisos-view').classList.contains('hidden') && NAV.pedidos === 0 && NAV.subscribes.length === 0, '"Entrar na conta" leva pro Sincronizar, sem pedir permissão de nada');

  console.log('\nB) Ligar no celular:');
  server.addUser(EMAIL, 'senha123', UID);
  await waitFor(() => server.createClientCalls === 1);
  $('sync-email').value = EMAIL; $('sync-password').value = 'senha123'; await w.fazSyncLogin();
  await waitFor(() => !!LS('tb__sync'), 20000);
  w.closeConfigSync(); w.openConfigAvisos();
  await waitFor(() => $('avisos-titulo').textContent === 'Avisos desligados neste aparelho' && F.gets === 1);
  ok($('avisos-ligar').textContent.trim() === 'Ligar os avisos' && !$('avisos-ligar').disabled && $('avisos-teste').disabled && chips().every((b) => !b.disabled), 'com a conta: "Avisos desligados neste aparelho" e "Ligar os avisos"; o teste só depois de ligar');
  ok(F.gets === 1 && NAV.registers.length === 0 && NAV.pedidos === 0, 'ao abrir já deixou na mão a chave pública da função (1 pedido) e o service worker do app, sem perguntar nada');
  NAV.exigeToque = true; // como o iPhone: a inscrição só vale direto do toque
  click($('avisos-ligar'));
  ok(NAV.subscribes.length === 1 && NAV.subscribes[0].noToque && NAV.pedidos === 1, 'o toque em Ligar já inscreve na hora, ainda dentro do toque (o jeito que o iPhone aceita), e a inscrição pede a permissão');
  await waitFor(() => linhas(server).length === 1 && w.FazAvisos.estado().on);
  let row = linhas(server)[0];
  ok(row && row.id === sha(row.endpoint) && row.endpoint === NAV.sub.endpoint && row.p256dh === P256 && row.auth === AUTH && row.aparelho === 'celular' && row.fuso === 'America/Sao_Paulo' && row.minutos === 10, 'na conta (push_inscricoes): id = SHA-256 do endereço, as chaves do aparelho, "celular", o fuso e 10 min');
  ok(NAV.subscribes[0].userVisibleOnly === true && NAV.subscribes[0].key.equals(Buffer.from(CHAVE1, 'base64url')), 'inscreveu com a chave pública da função e "sempre mostra o aviso"');
  let st = estado();
  ok(st.on === true && st.minutos === 10 && st.id === row.id && st.uid === UID && st.chave === CHAVE1 && st.fuso === 'America/Sao_Paulo', 'neste aparelho (tb__avisos): ligado, 10 min, a inscrição, a conta e a chave');
  ok(!('tb__avisos' in w.collectFazData()), 'tb__avisos fica fora do backup (cada aparelho liga o seu)');
  await waitFor(() => /Pronto!/.test($('avisos-msg').textContent));
  ok($('avisos-titulo').textContent === 'Avisos ligados neste aparelho' && /Avisa 10 min antes de cada compromisso/.test($('avisos-texto').textContent) && $('avisos-ligar').textContent.trim() === 'Desligar os avisos' && !$('avisos-teste').disabled, 'tela: "Avisos ligados neste aparelho", "Avisa 10 min antes…", "Desligar os avisos" e o teste liberado');
  ok(/Mandar um aviso de teste/.test($('avisos-msg').textContent) && $('avisos-icone').className.includes('text-rose-600'), 'mensagem: "Pronto! Toque em Mandar um aviso de teste…" e o sininho colorido');

  console.log('\nC) Quanto tempo antes e o aviso de teste:');
  click(chips().find((b) => b.textContent === '5 min'));
  await waitFor(() => linhas(server)[0].minutos === 5 && /5 min antes/.test($('avisos-msg').textContent));
  ok(linhas(server)[0].minutos === 5 && estado().minutos === 5 && chipOn() === '5 min' && $('avisos-msg').textContent === 'Agora avisa 5 min antes.', '5 min: vai pra conta na hora ("Agora avisa 5 min antes.")');
  click(chips().find((b) => b.textContent === 'Na hora'));
  await waitFor(() => linhas(server)[0].minutos === 0 && /na hora/.test($('avisos-msg').textContent));
  ok(linhas(server).length === 1 && linhas(server)[0].minutos === 0 && /Avisa na hora de cada compromisso/.test($('avisos-texto').textContent), '"Na hora": minutos 0 e "Avisa na hora de cada compromisso" (a mesma inscrição, sem duplicar)');
  w.closeConfigAvisos();
  ok($('avisos-menu-status').textContent === 'Ligados · na hora', 'no menu de Configurações: "Ligados · na hora"');
  w.openConfigAvisos(); await waitFor(() => $('avisos-titulo').textContent === 'Avisos ligados neste aparelho');
  click(chips().find((b) => b.textContent === '10 min')); await waitFor(() => linhas(server)[0].minutos === 10);
  F.respostas = [200];
  click($('avisos-teste'));
  await waitFor(() => /Enviado!/.test($('avisos-msg').textContent));
  ok(F.posts.length === 1 && F.posts[0].auth === 'Bearer tok' && F.posts[0].corpo.teste === row.id, '"Mandar um aviso de teste": chama a função com o login e o id deste aparelho');
  ok($('avisos-msg').textContent === 'Enviado! O aviso chega em alguns segundos.', 'mensagem: "Enviado! O aviso chega em alguns segundos."');
  server.tables.push_inscricoes.clear(); F.respostas = [404, 200]; // a conta perdeu a inscrição (ex.: apagou em outro lugar)
  click($('avisos-teste'));
  await waitFor(() => F.posts.length === 3 && /Enviado!/.test($('avisos-msg').textContent));
  ok(linhas(server).length === 1 && linhas(server)[0].id === row.id && F.posts[2].st === 200, 'a função não achou este aparelho (404): grava de novo na conta e manda o teste outra vez');
  const velho = row.id, nUns = NAV.unsubscribes; F.respostas = [410, 200]; // o serviço de push esqueceu o endereço
  click($('avisos-teste'));
  await waitFor(() => F.posts.length === 5 && /Enviado!/.test($('avisos-msg').textContent));
  row = linhas(server)[0];
  ok(NAV.unsubscribes === nUns + 1 && linhas(server).length === 1 && row.id !== velho && row.id === sha(NAV.sub.endpoint) && estado().id === row.id && F.posts[4].corpo.teste === row.id, 'o endereço morreu (410): inscreve de novo, troca na conta e o teste vai pro endereço novo');
  F.respostas = [401];
  click($('avisos-teste'));
  await waitFor(() => /Entre na sua conta/.test($('avisos-msg').textContent));
  ok($('avisos-msg').classList.contains('text-red-600'), 'login que venceu (401): "Entre na sua conta primeiro…", em vermelho');
  F.fora = true;
  click($('avisos-teste'));
  await waitFor(() => /Sem conexão/.test($('avisos-msg').textContent));
  ok(estado().on && linhas(server).length === 1, 'sem internet: "Sem conexão com a nuvem agora", e continua ligado');
  F.fora = false;

  console.log('\nD) Ao abrir o app de novo (conferência):');
  let nLog = server.log.length, g0 = F.gets;
  await w.FazAvisos.revalidar();
  ok(!server.log.slice(nLog).some((x) => x.t === 'push_inscricoes') && F.gets === g0, 'tudo igual: não grava nada na conta nem chama a função');
  const antes = row.id; NAV.trocarEndereco();
  await w.FazAvisos.revalidar();
  ok(linhas(server).length === 1 && linhas(server)[0].id === sha(NAV.sub.endpoint) && linhas(server)[0].id !== antes && estado().id === linhas(server)[0].id, 'o navegador renovou o endereço: grava o novo e tira o velho da conta');
  let s2 = estado(); s2.em = w.Date.now() - 2 * 864e5; w.localStorage.setItem('tb__avisos', JSON.stringify(s2)); nLog = server.log.length; g0 = F.gets; // w.Date: o relógio do app
  await w.FazAvisos.revalidar();
  ok(F.gets === g0 + 1 && server.log.slice(nLog).some((x) => x.t === 'push_inscricoes' && x.op === 'upsert') && estado().em > w.Date.now() - 60000, 'um dia depois: confere a chave da função e grava de novo (a conta sabe que o aparelho continua vivo)');
  s2 = estado(); s2.em = w.Date.now() - 2 * 864e5; w.localStorage.setItem('tb__avisos', JSON.stringify(s2)); F.chave = CHAVE2; const nSubs = NAV.subscribes.length;
  await w.FazAvisos.revalidar();
  ok(NAV.subscribes.length === nSubs + 1 && NAV.subscribes[nSubs].key.equals(Buffer.from(CHAVE2, 'base64url')) && estado().chave === CHAVE2 && linhas(server).length === 1 && linhas(server)[0].endpoint === NAV.sub.endpoint, 'a chave da função mudou: inscreve de novo com a chave nova (o aviso velho não chegaria)');
  NAV.revogar();
  await w.FazAvisos.revalidar();
  ok(!estado().on && linhas(server).length === 0, 'tiraram a permissão nas configurações do celular: desliga aqui e sai da conta');
  w.closeConfigAvisos();
  ok($('avisos-menu-status').textContent === 'Aviso antes de cada compromisso', 'e o menu volta pro texto de desligado');

  console.log('\nE) Permissão, serviço desconhecido, limite e desligar:');
  w.openConfigAvisos(); await waitFor(() => $('avisos-titulo').textContent === 'As notificações estão bloqueadas');
  ok(/Libere as notificações do Faz/.test($('avisos-texto').textContent) && $('avisos-ligar').textContent.trim() === 'Ligar os avisos', 'bloqueadas: "As notificações estão bloqueadas" e como liberar');
  click($('avisos-ligar'));
  await waitFor(() => /bloqueadas pro Faz/.test($('avisos-msg').textContent));
  ok(!estado().on && linhas(server).length === 0, 'Ligar com as notificações bloqueadas: avisa, e nada vai pra conta');
  NAV.perm = 'default'; NAV.resposta = 'default'; // a pessoa fechou a pergunta sem escolher
  click($('avisos-ligar'));
  await waitFor(() => /precisa da permissão/.test($('avisos-msg').textContent));
  ok(!estado().on && linhas(server).length === 0, 'fechou a pergunta sem escolher: "Pra avisar, o Faz precisa da permissão de notificação."');
  NAV.resposta = 'granted'; NAV.endpointBase = 'https://push.exemplo.com/w/';
  click($('avisos-ligar'));
  await waitFor(() => /serviço de aviso que o Faz não conhece/.test($('avisos-msg').textContent));
  ok(!estado().on && linhas(server).length === 0 && NAV.sub === null, 'navegador com um serviço de push fora da lista: avisa, não grava e desfaz a inscrição');
  NAV.endpointBase = 'https://fcm.googleapis.com/fcm/send/';
  for (let i = 0; i < 20; i++) { const e = 'https://fcm.googleapis.com/fcm/send/outro-' + i; server.insert('push_inscricoes', UID, { id: sha(e), endpoint: e, p256dh: P256, auth: AUTH, aparelho: 'pc', fuso: 'America/Sao_Paulo', minutos: 10 }); }
  click($('avisos-ligar'));
  await waitFor(() => /20 aparelhos/.test($('avisos-msg').textContent));
  ok(!estado().on && linhas(server).length === 20, 'conta com 20 aparelhos: "Esta conta já tem 20 aparelhos com aviso…" (o limite do banco)');
  server.tables.push_inscricoes.clear();
  click($('avisos-ligar'));
  await waitFor(() => estado().on && linhas(server).length === 1 && /Pronto!/.test($('avisos-msg').textContent));
  ok(estado().on && linhas(server).length === 1, 'liberou: liga normal');
  click($('avisos-ligar')); // Desligar
  await waitFor(() => !estado().on && /desligados neste aparelho/.test($('avisos-msg').textContent));
  ok(linhas(server).length === 0 && NAV.sub === null && $('avisos-titulo').textContent === 'Avisos desligados neste aparelho' && $('avisos-teste').disabled, 'Desligar: sai da conta, desfaz a inscrição e a tela volta pra "desligados"');
  click(chips().find((b) => b.textContent === '15 min'));
  await waitFor(() => estado().minutos === 15);
  ok(estado().minutos === 15 && !estado().on && linhas(server).length === 0, 'desligado, escolher 15 min só guarda a escolha (pro próximo Ligar)');
  click($('avisos-ligar'));
  await waitFor(() => linhas(server).length === 1 && estado().on);
  ok(linhas(server)[0].minutos === 15, 'ligar de novo já vai com 15 min');

  console.log('\nF) Sair da conta desliga os avisos:');
  const nAntes = NAV.unsubscribes;
  await w.fazSyncLogout();
  ok(linhas(server).length === 0 && NAV.unsubscribes === nAntes + 1 && !estado().on && !server.storedSession, '"Sair desta conta": tira o aparelho da conta antes de sair (depois o RLS não deixaria) e desfaz a inscrição');
  w.openConfigSheet(); w.openConfigAvisos();
  await waitFor(() => $('avisos-titulo').textContent === 'Entre na sua conta primeiro');
  ok($('avisos-titulo').textContent === 'Entre na sua conta primeiro', 'e a tela volta a pedir a conta');
  ok(A.errors.length === 0, 'nenhum erro no console do celular' + (A.errors.length ? ': ' + A.errors[0].slice(0, 200) : ''));

  // =====================================================================
  console.log('\nG) iPhone:');
  const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
  const B = await bootPhone(REPO, backup.data, { userAgent: IOS, beforeParse(bw) { webcrypto(bw); } }); // no Safari, fora da tela de início: sem push
  B.w.openConfigSheet(); B.w.openConfigAvisos();
  await waitFor(() => B.$('avisos-titulo').textContent === 'Instale o Faz na tela de início');
  ok(/Adicionar à Tela de Início/.test(B.$('avisos-texto').textContent) && /⋯/.test(B.$('avisos-texto').textContent) && B.$('avisos-ligar').classList.contains('hidden'), 'Safari do iPhone: "Instale o Faz na tela de início", com o caminho (Compartilhar, ⋯ no iOS 26); sem botão de ligar');
  const C = await bootPhone(REPO, backup.data, { userAgent: IOS, beforeParse(cw) { webcrypto(cw); Object.defineProperty(cw.navigator, 'standalone', { value: true }); } });
  C.w.openConfigSheet(); C.w.openConfigAvisos();
  await waitFor(() => C.$('avisos-titulo').textContent === 'Precisa de um iOS mais novo');
  ok(/16\.4/.test(C.$('avisos-texto').textContent), 'instalado num iOS antigo (sem push): "Precisa de um iOS mais novo" (16.4)');
  let NAV3;
  const D = await bootPhone(REPO, backup.data, { userAgent: IOS, beforeParse(dw) { webcrypto(dw); Object.defineProperty(dw.navigator, 'standalone', { value: true }); NAV3 = navegadorFalso(dw, { registrado: true, exigeToque: true }); } });
  funcaoFalsa(D.w, D.server);
  D.server.addUser(EMAIL, 'senha123', UID);
  D.w.openConfigSheet(); D.w.openConfigSync(); await waitFor(() => D.server.createClientCalls === 1);
  D.$('sync-email').value = EMAIL; D.$('sync-password').value = 'senha123'; await D.w.fazSyncLogin(); await waitFor(() => !!D.L('tb__sync'), 20000);
  D.w.closeConfigSync(); D.w.openConfigAvisos();
  await waitFor(() => D.$('avisos-titulo').textContent === 'Avisos desligados neste aparelho');
  await sleep(150);
  NAV3.noToque = true; D.$('avisos-ligar').click(); NAV3.noToque = false;
  await waitFor(() => linhas(D.server).length === 1);
  ok(linhas(D.server).length === 1 && NAV3.subscribes.length === 1 && NAV3.subscribes[0].noToque && linhas(D.server)[0].aparelho === 'celular', 'iPhone instalado (iOS 16.4+): liga num toque só, a inscrição sai direto do toque');

  // =====================================================================
  console.log('\nH) PC: Configurações → Avisos dos compromissos (neste computador):');
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => { const m = a.map(String).join(' '); if (!m.startsWith('[Faz kanban]')) errors.push(m); });
  let html = fs.readFileSync(path.join(REPO, 'kanban.html'), 'utf8');
  ok(/<script src="libs\/supabase-js\/supabase\.js"><\/script>\s*<script src="avisos\.js"><\/script>\s*<script>/.test(html), 'a página do PC carrega o avisos.js (o mesmo do celular) antes do código dela');
  const inline = ['faz-config.js', 'metas.js', 'assistente.js', 'sync.js', 'avisos.js'].map((f) => '<script>' + fs.readFileSync(path.join(REPO, f), 'utf8') + '</script>').join('');
  html = html.replace(/<script src="[^"]*"><\/script>/g, '').replace('<script>window.FAZ_SYNC_CORE_ONLY = true;</script>', '')
    .replace('<head>', '<head><script>window.tailwind = {}; window.FAZ_SYNC_CORE_ONLY = true;</script>' + inline);
  // a mesma "nuvem" do celular (server)
  server.storedSession = { access_token: 'tok', user: { id: UID, email: EMAIL, user_metadata: JSON.parse(JSON.stringify(server.users.get(EMAIL).meta)) } };
  let NP, FP;
  const dom = new JSDOM(html, {
    url: 'https://jhonatanfavero.github.io/Faz-App/kanban.html', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(pw) {
      const RD = pw.Date, base = new RD(2026, 10, 23, 18, 30, 0).getTime(), t0 = RD.now(), now = () => base + (RD.now() - t0);
      pw.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } };
      pw.supabase = { createClient: makeCreateClient(server) };
      pw.CSS = pw.CSS || {}; pw.CSS.escape = pw.CSS.escape || ((s) => String(s).replace(/["\\]/g, '\\$&'));
      webcrypto(pw);
      NP = navegadorFalso(pw, { registrado: false, exigeToque: 'sempre' }); // o navegador mais rígido: só inscreve direto do clique
    },
  });
  const pw = dom.window, pd = pw.document, Q = (id) => pd.getElementById(id);
  FP = funcaoFalsa(pw, server);
  const pclick = (el) => { NP.noToque = true; try { el.dispatchEvent(new pw.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 })); } finally { NP.noToque = false; } };
  const pchips = () => [...Q('cfg-av-min').querySelectorAll('[data-av-min]')];
  const pst = () => JSON.parse(pw.localStorage.getItem('tb__avisos') || '{}');
  await waitFor(() => pd.querySelectorAll('section.col').length >= 1, 8000);
  pclick(Q('btn-cfg')); await sleep(200);
  ok(/Avisos dos compromissos/.test(Q('modal-cfg').textContent) && /neste computador/.test(Q('modal-cfg').textContent), 'Configurações do PC tem "Avisos dos compromissos · neste computador"');
  ok(Q('cfg-av-tit').textContent === 'Desligados neste computador' && Q('cfg-av-btn').textContent === 'Ligar' && !Q('cfg-av-btn').classList.contains('hidden') && Q('cfg-av-teste').disabled, '"Desligados neste computador", botão "Ligar"; teste só depois');
  ok(pchips().map((b) => b.textContent).join(',') === 'Na hora,5 min,10 min,15 min,30 min' && pchips().find((b) => b.getAttribute('aria-checked') === 'true').textContent === '10 min', 'as mesmas escolhas do celular (10 min marcado)');
  ok(NP.registers.length === 0 && FP.gets === 0, 'abrir Configurações não registra o service worker no PC (só ao ligar)');
  pclick(Q('cfg-av-btn'));
  ok(NP.pedidos === 1, 'Ligar: a permissão é pedida direto do clique');
  await waitFor(() => /Quase lá/.test(Q('cfg-av-msg').textContent) || linhas(server).length === 1);
  ok(/Quase lá: toque \(ou clique\) em Ligar mais uma vez/.test(Q('cfg-av-msg').textContent) && NP.registers.join() === './sw.js' && linhas(server).length === 0, 'navegador que só inscreve direto do clique: registra o service worker e pede "Ligar mais uma vez"');
  pclick(Q('cfg-av-btn'));
  await waitFor(() => linhas(server).length === 1 && pst().on);
  const prow = linhas(server)[0];
  ok(prow && prow.aparelho === 'pc' && prow.id === sha(NP.sub.endpoint) && prow.minutos === 10 && NP.subscribes[NP.subscribes.length - 1].noToque, 'no 2º clique inscreve na hora: na conta como "pc", 10 min');
  await waitFor(() => /Pronto!/.test(Q('cfg-av-msg').textContent));
  ok(Q('cfg-av-tit').textContent === 'Ligados neste computador' && /mesmo com a aba fechada/.test(Q('cfg-av-txt').textContent) && Q('cfg-av-btn').textContent === 'Desligar' && !Q('cfg-av-teste').disabled, '"Ligados neste computador", "mesmo com a aba fechada", botão "Desligar" e o teste liberado');
  pclick(pchips().find((b) => b.textContent === '30 min'));
  await waitFor(() => linhas(server)[0].minutos === 30);
  ok(linhas(server)[0].minutos === 30 && /Agora avisa 30 min antes/.test(Q('cfg-av-msg').textContent), '30 min: vai pra conta ("Agora avisa 30 min antes.")');
  FP.respostas = [200];
  pclick(Q('cfg-av-teste'));
  await waitFor(() => /Enviado!/.test(Q('cfg-av-msg').textContent));
  ok(FP.posts.length === 1 && FP.posts[0].corpo.teste === prow.id && FP.posts[0].auth === 'Bearer tok', '"Mandar um teste": a função recebe o id deste computador, com o login');
  ok(linhas(server).length === 1, 'o PC e o celular são aparelhos diferentes (o celular saiu; o PC ficou com o dele)');
  let ps = pst(); ps.em = pw.Date.now() - 2 * 864e5; pw.localStorage.setItem('tb__avisos', JSON.stringify(ps)); FP.chave = CHAVE2; // a chave da função mudou
  const rv = await pw.FazAvisos.revalidar();
  await waitFor(() => Q('cfg-av-tit').textContent === 'Desligados neste computador');
  ok(rv.on === false && !pst().on && linhas(server).length === 0 && Q('cfg-av-btn').textContent === 'Ligar', 'chave da função nova num navegador que só inscreve direto do clique: em vez de ficar "ligado" sem inscrição, mostra desligado');
  pclick(Q('cfg-av-btn'));
  await waitFor(() => linhas(server).length === 1 && pst().on);
  ok(pst().chave === CHAVE2 && linhas(server)[0].endpoint === NP.sub.endpoint && NP.subscribes[NP.subscribes.length - 1].key.equals(Buffer.from(CHAVE2, 'base64url')), 'um clique em Ligar e volta, com a chave nova');
  pclick(Q('btn-logout')); await sleep(30); pclick(Q('dlg-ok'));
  await waitFor(() => !pst().on && linhas(server).length === 0 && Q('view-login') && !Q('view-login').classList.contains('hidden'));
  ok(linhas(server).length === 0 && !pst().on && NP.sub === null, 'Sair no PC: tira o computador da conta e desfaz a inscrição antes de sair');
  ok(errors.length === 0, 'nenhum erro no console do PC' + (errors.length ? ': ' + errors[0].slice(0, 200) : ''));

  // =====================================================================
  console.log('\nI) O service worker (sw.js): o aviso e o clique nele:');
  const swSrc = fs.readFileSync(path.join(REPO, 'sw.js'), 'utf8');
  ok(/'\.\/avisos\.js',/.test(swSrc), 'avisos.js entra no cache offline do app');
  const H = {}, shown = [], opened = [], focused = [], janelas = [];
  const self = {
    addEventListener: (t, f) => { H[t] = f; }, skipWaiting() {},
    registration: { scope: 'https://jhonatanfavero.github.io/Faz-App/', showNotification: async (t, o) => { shown.push({ t, o }); } },
    clients: { matchAll: async (o) => { self.matchOpts = o; return janelas; }, openWindow: async (u) => { opened.push(u); }, claim: async () => {} },
  };
  vm.runInNewContext(swSrc, { self, caches: { open: async () => ({ addAll: async () => {} }), keys: async () => [], match: async () => null }, fetch: async () => ({}), URL, console });
  const evento = (data) => { const ps = []; return { e: { data, waitUntil: (p) => ps.push(p) }, fim: () => Promise.all(ps) }; };
  let ev = evento({ json: () => ({ t: 'Reunião com o Anderson', b: 'Daqui a 10 min · 14:00–15:30', tag: 'faz-f_1', u: 'pc' }) });
  H.push(ev.e); await ev.fim();
  ok(shown.length === 1 && shown[0].t === 'Reunião com o Anderson' && shown[0].o.body === 'Daqui a 10 min · 14:00–15:30' && shown[0].o.tag === 'faz-f_1' && shown[0].o.renotify === true && shown[0].o.icon === './icon-192.png' && shown[0].o.data.u === 'pc', 'push: mostra o aviso com o título, "Daqui a 10 min · 14:00–15:30", a etiqueta do bloco (troca em vez de empilhar) e o ícone');
  ev = evento({ json: () => { throw new SyntaxError('x'); } }); H.push(ev.e); await ev.fim();
  ev = evento(null); H.push(ev.e); await ev.fim();
  ok(shown.length === 3 && shown[1].t === 'Faz' && shown[2].t === 'Faz' && shown[2].o.data.u === 'app', 'push estragado ou vazio: mostra "Faz" mesmo assim (o iPhone e o Chrome exigem um aviso por push)');
  const jan = (url) => { const j = { url, focus: async () => { focused.push(url); return j; } }; return j; };
  const clique = async (u) => { const ps = []; let fechou = false; H.notificationclick({ notification: { data: { u }, close: () => { fechou = true; } }, waitUntil: (p) => ps.push(p) }); await Promise.all(ps); return fechou; };
  janelas.push(jan('https://jhonatanfavero.github.io/Faz-App/'), jan('https://jhonatanfavero.github.io/Faz-App/kanban.html?x=1'), jan('https://outro.site/Faz-App/kanban.html'));
  ok(await clique('pc') && focused.join() === 'https://jhonatanfavero.github.io/Faz-App/kanban.html?x=1' && opened.length === 0 && self.matchOpts.includeUncontrolled === true, 'clicar no aviso do PC: fecha o aviso e volta pra aba do PC que já está aberta');
  await clique('app');
  ok(focused[1] === 'https://jhonatanfavero.github.io/Faz-App/' && opened.length === 0, 'clicar no aviso do celular: volta pro app aberto');
  janelas.splice(0, janelas.length, jan('https://outro.site/Faz-App/'));
  await clique('pc'); await clique('app');
  ok(opened.join(' | ') === 'https://jhonatanfavero.github.io/Faz-App/kanban.html | https://jhonatanfavero.github.io/Faz-App/', 'sem janela do Faz aberta: abre a tela do PC ou o app (nunca outro site)');

  // =====================================================================
  console.log('\nJ) As regras batem: app, função e banco:');
  const sql = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', 'faz_v40_42_0_avisos.sql'), 'utf8');
  const cron = fs.readFileSync(path.join(REPO, 'supabase', 'migrations', 'faz_v40_42_0_avisos_cron.sql'), 'utf8');
  const nucleo = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'alertas', 'nucleo.js'), 'utf8');
  const avisos = fs.readFileSync(path.join(REPO, 'avisos.js'), 'utf8');
  const reJs = (src) => (/SERVICOS = \/(.+)\/;/.exec(src) || [])[1].replace(/\\\//g, '/');
  const reSql = (/endpoint ~ '([^']+)'/.exec(sql) || [])[1];
  ok(reSql && reJs(avisos) === reSql && reJs(nucleo) === reSql, 'a lista dos serviços de push é a mesma no app, na função e no banco');
  const minSql = (/minutos in \(([^)]+)\)/.exec(sql) || [])[1], minJs = (src) => (/MINUTOS = \[([^\]]+)\]/.exec(src) || [])[1];
  ok(minSql === '0, 5, 10, 15, 30' && minJs(avisos) === minSql && minJs(nucleo) === minSql, 'os minutos (0, 5, 10, 15, 30) são os mesmos nos três');
  ok(/>= 20 then/.test(sql) && /raise exception 'faz_limite_aparelhos'/.test(sql) && /MAX_INSCRICOES = 20/.test(nucleo) && /faz_limite_aparelhos/.test(avisos), 'o limite de 20 aparelhos: o banco barra com "faz_limite_aparelhos", que o app reconhece');
  ok(/push_inscricoes_endpoint_check/.test(sql) && /push_inscricoes_endpoint_check/.test(avisos) && /id = encode\(extensions\.digest\(endpoint, 'sha256'\), 'hex'\)/.test(sql), 'o banco confere o id (SHA-256 do endereço) e o nome da regra do endereço é o que o app reconhece');
  ok(/enable row level security/.test(sql) && (sql.match(/create policy push_inscricoes_\w+_own/g) || []).length === 4 && /revoke all on public\.alertas_enviados from anon, authenticated/.test(sql) && /revoke all on public\.faz_segredos from anon, authenticated/.test(sql), 'RLS: cada um só as suas inscrições; alertas_enviados e faz_segredos fechadas pra quem não é a função');
  ok(/gen_random_bytes\(32\)/.test(sql) && !/BEGIN PRIVATE|"d":/.test(sql + cron + nucleo + avisos), 'o token do agendador nasce dentro do banco; nenhuma chave privada no código');
  const cfgUrl = /url: '([^']+)'/.exec(fs.readFileSync(path.join(REPO, 'faz-config.js'), 'utf8'))[1];
  ok(cron.includes("url := '" + cfgUrl + "/functions/v1/alertas'") && /'x-cron-token', \(select valor from public\.faz_segredos where nome = 'cron_token'\)/.test(cron) && /req\.headers\.get\('x-cron-token'\)/.test(nucleo) && /'\* \* \* \* \*'/.test(cron), 'o agendador chama a função certa a cada minuto, com o token lido na hora');

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
