// V40.42.0 — Avisos dos compromissos: a função do Supabase (supabase/functions/alertas/nucleo.js), rodando no Node com
// um banco e um serviço de push de mentira. Confere:
//   A) a cifra do aviso (RFC 8291): os bytes batem com os do http_ece (a implementação da Mozilla, conferida fora do
//      repositório com estas chaves de teste) e o aparelho decifra; a assinatura VAPID confere; só manda pros serviços
//      de push conhecidos;
//   B) a hora de cada aparelho (fuso) e quais blocos avisam agora (N min antes, atrasado, começou, meia-noite, feito);
//   C) o texto do aviso; D) a porta de entrada: chave pública, token do agendador, a rodada (2 pessoas, 3 aparelhos,
//      fusos diferentes, uma vez só, inscrição que acabou sai, limpeza), o aviso de teste com o login e o erro interno.
// Uso: TZ='America/Sao_Paulo' node test_avisos_servidor.js <repo>
const fs = require('fs'), path = require('path'), nodeCrypto = require('crypto');
const REPO = process.argv[2];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅', m); } else { fail++; console.log('  ❌ FALHOU:', m); } };
const subtle = globalThis.crypto.subtle;
const b64 = (b) => Buffer.from(b).toString('base64url');
const unb64 = (s) => new Uint8Array(Buffer.from(String(s), 'base64url'));

// chaves de teste geradas pro vetor conferido com o http_ece (não são segredo de ninguém)
const KAT = {
  uaPub: 'BJs6VpmtVKBJJQbpNiGjrdrsj3aLT4txka0Gq_oKhhje-SOFx4emyZySrKbJpR32uzwIT3W-mPgcrIET6Qb6dn8',
  uaPriv: 'QqTZDr87-sla1JTdSK__nVgAwVVoAeYHkAxL1eXzC5E',
  auth: 'qYLTZexqG9y-EL3lW9Va9A',
  srvJwk: { kty: 'EC', crv: 'P-256', x: '2VsqVKtlJykq1RBNceNfxam2DUStcqPk29kMJNa3B5Y', y: 'RacRQQX7brzExZcb8CQWPXpcWlhx_wZrbOQ5beap3ic', d: 'wwfXXuBSXDWLoAlLuH0F4Qd5Lzxd2zE-MsqSlvelqys', ext: true },
  srvPub: 'BNlbKlSrZScpKtUQTXHjX8Wptg1ErXKj5NvZDCTWtweWRacRQQX7brzExZcb8CQWPXpcWlhx_wZrbOQ5beap3ic',
  salt: 'B02wa06FU_RtcURpmSUOag',
  texto: '{"t":"Reunião","b":"Daqui a 10 min · 14:00–15:30","tag":"faz-x","u":"app"}',
  esperado: 'B02wa06FU_RtcURpmSUOagAAEABBBNlbKlSrZScpKtUQTXHjX8Wptg1ErXKj5NvZDCTWtweWRacRQQX7brzExZcb8CQWPXpcWlhx_wZrbOQ5beap3ifJrKbG8F54hqKZQosJxO1uM6Y-Gr_Melj5x3V1YjVuzcOpLIE05BsZ3ienVhxPEVf8RW_j5AU-ywOiNfCJWHArHP3EBtOsiHONFJu3n7ZFvg_ofi6rhbB-NmflK7L7cg',
};

// O "aparelho": decifra o que chegou (o caminho inverso do RFC 8291), pra conferir o que a função mandou.
async function hkdf(salt, ikm, info, bits) { const k = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bits)); }
async function decifrar(corpo, aparelho) {
  const salt = corpo.slice(0, 16), idlen = corpo[20], chaveSrv = corpo.slice(21, 21 + idlen), cifra = corpo.slice(21 + idlen);
  const srvKey = await subtle.importKey('raw', chaveSrv, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: srvKey }, aparelho.priv, 256));
  const te = new TextEncoder();
  const ikm = await hkdf(aparelho.auth, ecdh, new Uint8Array([...te.encode('WebPush: info\0'), ...aparelho.pub, ...chaveSrv]), 256);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 128), nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 96);
  const k = await subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const claro = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, cifra));
  if (claro[claro.length - 1] !== 2) throw new Error('sem o 0x02 do último registro');
  return JSON.parse(new TextDecoder().decode(claro.slice(0, -1)));
}
async function novoAparelho() {
  const par = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await subtle.exportKey('raw', par.publicKey)), auth = nodeCrypto.randomBytes(16);
  return { pub, priv: par.privateKey, auth: new Uint8Array(auth), p256dh: b64(pub), authB64: b64(auth) };
}
const idDe = (endpoint) => nodeCrypto.createHash('sha256').update(endpoint).digest('hex');

(async () => {
  const src = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'alertas', 'nucleo.js'), 'utf8');
  const N = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
  const idx = fs.readFileSync(path.join(REPO, 'supabase', 'functions', 'alertas', 'index.ts'), 'utf8');

  console.log('A) A cifra, a assinatura e pra onde pode mandar:');
  {
    const priv = await subtle.importKey('jwk', KAT.srvJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const meu = await N.cifrar(KAT.texto, KAT.uaPub, KAT.auth, { salt: unb64(KAT.salt), local: { publico: unb64(KAT.srvPub), privada: priv } });
    ok(b64(meu) === KAT.esperado, 'com as mesmas chaves e o mesmo salt, os bytes são os do http_ece (a implementação da Mozilla): ' + meu.length + ' bytes');
    const pubUa = unb64(KAT.uaPub);
    const ua = { pub: pubUa, auth: unb64(KAT.auth), priv: await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64(pubUa.slice(1, 33)), y: b64(pubUa.slice(33, 65)), d: KAT.uaPriv, ext: true }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) };
    ok(JSON.stringify(await decifrar(meu, ua)) === KAT.texto, 'o aparelho decifra (o caminho inverso dá o mesmo texto, com acento)');
    const outro = await N.cifrar(KAT.texto, KAT.uaPub, KAT.auth);
    ok(b64(outro) !== KAT.esperado && JSON.stringify(await decifrar(outro, ua)) === KAT.texto, 'sem salt fixo: cada aviso sai diferente (chave e salt novos), e decifra igual');
    let erro = '';
    try { await N.cifrar('x', 'abc', KAT.auth); } catch (e) { erro = e.message; }
    ok(erro === 'chaves do aparelho estragadas', 'chave do aparelho estragada: não manda ("' + erro + '")');
    const v = await N.gerarVapid();
    const jwt = await N.vapidJwt(v.jwk, 'https://fcm.googleapis.com', 'https://jhonatanfavero.github.io/Faz-App/', 1999999999);
    const [h, p, s] = jwt.split('.');
    const keyObj = nodeCrypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: v.jwk.x, y: v.jwk.y }, format: 'jwk' });
    ok(nodeCrypto.verify('sha256', Buffer.from(h + '.' + p), { key: keyObj, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')) && JSON.parse(Buffer.from(p, 'base64url')).aud === 'https://fcm.googleapis.com', 'VAPID: o JWT (ES256) confere com a chave pública, conferido pelo crypto do Node');
    ok(unb64(v.publico).length === 65 && unb64(v.publico)[0] === 4 && typeof v.jwk.d === 'string' && v.jwk.d.length === 43, 'chave nova: a pública com 65 bytes (o formato que o navegador pede) e a privada guardada à parte');
    const sim = ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QH8', 'https://wns2-par02p.notify.windows.com/w/?token=x', 'https://android.googleapis.com/gcm/send/y'];
    const nao = ['http://fcm.googleapis.com/fcm/send/abc', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com/', 'https://localhost/x', 'https://10.0.0.1/x', 'https://zlwocojndrjnuvoowzzu.supabase.co/rest/v1/blocos', 'https://web.push.apple.com.evil/x', null, 'https://fcm.googleapis.com/' + 'x'.repeat(1000)];
    ok(sim.every(N.enderecoOk) && !nao.some(N.enderecoOk), 'só manda pros serviços de push dos navegadores (Google, Mozilla, Apple, Windows); nada de endereço qualquer, nem pro próprio Supabase');
    ok(/verify_jwt = false/.test(idx) && /SUPABASE_SECRET_KEYS/.test(idx) && /SUPABASE_SERVICE_ROLE_KEY/.test(idx) && /Deno\.serve/.test(idx), 'index.ts: liga a função no Deno (chave secreta nova ou a antiga)');
  }

  console.log('\nB) A hora de cada aparelho e quais blocos avisam agora:');
  {
    const t = Date.UTC(2026, 10, 23, 16, 50); // 13:50 em São Paulo
    const sp = N.agoraLocal('America/Sao_Paulo', t), man = N.agoraLocal('America/Manaus', t), lis = N.agoraLocal('Europe/Lisbon', t);
    ok(sp.dia === '2026-11-23' && sp.min === 13 * 60 + 50 && man.min === 12 * 60 + 50 && lis.min === 16 * 60 + 50, 'mesma hora, fusos diferentes: São Paulo 13:50, Manaus 12:50, Lisboa 16:50');
    ok(N.agoraLocal('Lugar/Nenhum', t) === null && N.somaDia('2026-11-30', 1) === '2026-12-01' && N.somaDia('2026-12-31', 1) === '2027-01-01', 'fuso que não existe: nulo (a rodada usa São Paulo); virada de mês e de ano');
    const B = (id, date, st, extra) => Object.assign({ id, date, start_min: st, duration: 90, title: 'Bloco ' + id, cards: null, completed: false, archived: false, deleted: false }, extra || {});
    const blocos = [B('a', '2026-11-23', 840), B('b', '2026-11-23', 845), B('c', '2026-11-23', 830), B('d', '2026-11-23', 840, { completed: true }), B('e', '2026-11-23', 840, { archived: true }), B('f', '2026-11-23', 840, { deleted: true }), B('g', '2026-11-24', 840)];
    const ins = (m) => ({ id: 'x', minutos: m });
    const at = (min, dia) => ({ dia: dia || '2026-11-23', min });
    const ids = (l) => l.map((x) => x.bloco.id + ':' + x.falta).join(',');
    ok(ids(N.devidos(blocos, ins(10), at(819))) === '' && ids(N.devidos(blocos, ins(10), at(820))) === 'c:10', '10 min antes: às 13:39 nada; às 13:40 avisa o das 13:50 (falta 10)');
    ok(ids(N.devidos(blocos, ins(10), at(830))) === 'a:10,c:0', 'às 13:50: o das 14:00 (falta 10) e o das 13:50, que está começando (o das 13:50 ainda conta se o aviso dele não foi; o banco não deixa repetir)');
    ok(ids(N.devidos(blocos, ins(10), at(833))) === 'a:7' && ids(N.devidos(blocos, ins(10), at(835))) === 'a:5,b:10', 'atrasado (o agendador parou) ou bloco criado em cima da hora: avisa com o tempo que falta (13:53: "a" falta 7; 13:55: "a" falta 5, "b" falta 10)');
    ok(ids(N.devidos(blocos, ins(10), at(842))) === 'b:3' && ids(N.devidos(blocos, ins(0), at(841))) === 'a:-1', 'bloco que já começou faz mais de 1 min não avisa; "na hora" avisa no minuto em que começa (e no seguinte)');
    ok(!N.devidos(blocos, ins(10), at(835)).some((x) => /[def]/.test(x.bloco.id)), 'concluído, arquivado e apagado não avisam');
    const meia = [B('m', '2026-11-24', 5)];
    ok(ids(N.devidos(meia, ins(10), at(1435))) === 'm:10', 'bloco às 00:05 de amanhã com 10 min: avisa às 23:55 de hoje');
    ok(N.devidos(blocos, ins(30), at(815)).map((x) => x.chave).join(',') === 'a|2026-11-23|840|30,b|2026-11-23|845|30,c|2026-11-23|830|30', 'a chave de cada aviso: bloco, dia, horário e minutos (mudou o horário = aviso novo)');
    ok(N.devidos(blocos, { id: 'x', minutos: 7 }, at(830)).map((x) => x.falta).join(',') === '10,0', 'minutos fora da lista (0, 5, 10, 15, 30): vale 10');
  }

  console.log('\nC) O texto do aviso:');
  {
    const a = N.textoAviso({ id: 'f_1', title: '  Reunião com o Anderson ', start_min: 840, duration: 90 }, 10, 'celular');
    ok(a.t === 'Reunião com o Anderson' && a.b === 'Daqui a 10 min · 14:00–15:30' && a.tag === 'faz-f_1' && a.u === 'app', 'título, "Daqui a 10 min · 14:00–15:30", a etiqueta (o mesmo bloco troca o aviso) e abre o app');
    const s = N.textoAviso({ id: 'f_2', title: '', start_min: 1410, duration: 60, cards: [{}, {}, {}] }, 0, 'pc');
    ok(s.t === 'Sublista' && s.b === 'Agora · 23:30–00:30 · sublista com 3 cartões' && s.u === 'pc', 'sublista sem nome: "Sublista", "Agora · 23:30–00:30 · sublista com 3 cartões"; no PC abre a tela do PC');
    ok(N.textoAviso({ id: 'x', title: '', start_min: 600, duration: 30 }, 5, 'celular').t === 'Compromisso' && N.textoAviso({ id: 'x', title: 'x'.repeat(300), start_min: 600, duration: 30, cards: [{}] }, 5).t.length === 120 && /1 cartão$/.test(N.textoAviso({ id: 'x', title: 'S', start_min: 600, duration: 30, cards: [{}] }, 5).b), 'sem nome: "Compromisso"; nome comprido cortado em 120; "1 cartão" no singular');
  }

  console.log('\nD) A função: chave, agendador, a rodada e o teste:');
  // ---- o "Supabase" e o "serviço de push" de mentira ----
  const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
  const DB = { faz_segredos: [{ nome: 'cron_token', valor: 'c'.repeat(64) }], push_inscricoes: [], blocos: [], alertas_enviados: [] };
  const pushes = [], pedidos = [], logs = [];
  let pushStatus = () => 201, falhaBanco = false;
  const tokens = { 'tok-u1': U1, 'tok-u2': U2 };
  const filtra = (rows, params) => rows.filter((r) => {
    for (const [k, v] of params) {
      if (k === 'select' || k === 'on_conflict') continue;
      const m = /^(eq|is|in|lt)\.(.*)$/.exec(v);
      if (!m) continue;
      if (m[1] === 'eq' && String(r[k]) !== m[2]) return false;
      if (m[1] === 'is' && String(!!r[k]) !== m[2]) return false;
      if (m[1] === 'in' && !m[2].replace(/^\(|\)$/g, '').split(',').includes(String(r[k]))) return false;
      if (m[1] === 'lt' && !(String(r[k]) < m[2])) return false;
    }
    return true;
  });
  const PK = { faz_segredos: ['nome'], push_inscricoes: ['user_id', 'id'], alertas_enviados: ['user_id', 'inscricao_id', 'chave'] };
  const resp = (status, corpo) => new Response(corpo == null ? null : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }); // 204 não pode ter corpo
  async function fakeFetch(url, init) {
    init = init || {};
    const u = new URL(url), h = init.headers || {};
    pedidos.push({ url: u.pathname + u.search, metodo: init.method || 'GET', h });
    if (u.hostname.endsWith('.googleapis.com') || u.hostname.endsWith('mozilla.com') || u.hostname.endsWith('apple.com')) {
      pushes.push({ url, h, corpo: new Uint8Array(init.body) });
      return new Response('', { status: pushStatus(url) });
    }
    if (u.pathname === '/auth/v1/user') {
      const t = (h.Authorization || '').replace(/^Bearer /, '');
      return tokens[t] && h.apikey === 'sb_publishable_teste' ? resp(200, { id: tokens[t] }) : resp(401, { msg: 'invalid' });
    }
    if (!u.pathname.startsWith('/rest/v1/')) return resp(404, {});
    if (h.apikey !== 'sb_secret_teste' || h.Authorization) return resp(401, { msg: 'chave' });
    if (falhaBanco) return resp(500, { msg: 'caiu' });
    const tabela = u.pathname.slice('/rest/v1/'.length), rows = DB[tabela], params = [...u.searchParams.entries()];
    if (!rows) return resp(404, {});
    const metodo = init.method || 'GET';
    if (metodo === 'GET') return resp(200, filtra(rows, params));
    if (metodo === 'DELETE') { const fora = filtra(rows, params); DB[tabela] = rows.filter((r) => !fora.includes(r)); return resp(204, null); }
    if (metodo === 'POST') {
      const novas = JSON.parse(init.body), inseridas = [], ignora = /ignore-duplicates/.test(h.Prefer || '');
      for (const n of novas) {
        const igual = rows.find((r) => PK[tabela].every((c) => r[c] === n[c]));
        if (igual) { if (ignora) continue; return resp(409, { msg: 'duplicada' }); }
        const linha = Object.assign({ enviado_em: new Date(NOW).toISOString() }, n);
        rows.push(linha); inseridas.push(linha);
      }
      return resp(201, inseridas);
    }
    return resp(405, {});
  }
  let NOW = Date.UTC(2026, 10, 23, 16, 50, 20); // segunda 23/11/2026, 13:50:20 em São Paulo
  const env = { url: 'https://zlwocojndrjnuvoowzzu.supabase.co', secretKey: 'sb_secret_teste', serviceKey: '', publicKey: 'sb_publishable_teste', vapidSub: 'https://jhonatanfavero.github.io/Faz-App/', fetch: fakeFetch, now: () => NOW, log: (...a) => logs.push(a.join(' ')), ttl: 900 };
  const req = (metodo, caminho, h, corpo) => new Request('https://x.supabase.co/functions/v1/alertas' + (caminho || ''), { method: metodo, headers: h || {}, body: corpo == null ? undefined : JSON.stringify(corpo) });
  const json = async (r) => ({ status: r.status, corpo: await r.json().catch(() => null), cors: r.headers.get('access-control-allow-origin') });

  // chave pública
  let r = await N.atender(req('OPTIONS'), env);
  ok(r.status === 204 && r.headers.get('access-control-allow-origin') === '*' && /authorization/.test(r.headers.get('access-control-allow-headers')), 'OPTIONS (o navegador pergunta antes): 204 com CORS');
  let j = await json(await N.atender(req('GET', '?chave=1'), env));
  const vapidSalva = DB.faz_segredos.find((s) => s.nome === 'vapid');
  ok(j.status === 200 && j.cors === '*' && unb64(j.corpo.chave).length === 65 && vapidSalva && JSON.parse(vapidSalva.valor).publico === j.corpo.chave, 'GET ?chave=1: na primeira vez cria a chave VAPID, guarda em faz_segredos e devolve só a pública');
  ok(!JSON.stringify(j.corpo).includes(JSON.parse(vapidSalva.valor).jwk.d), 'a parte privada nunca sai da função');
  N.esquecerCache();
  const n0 = DB.faz_segredos.length;
  j = await json(await N.atender(req('GET', '?chave=1'), env));
  ok(j.corpo.chave === JSON.parse(vapidSalva.valor).publico && DB.faz_segredos.length === n0, 'depois (outra instância da função): a mesma chave, lida do banco, sem criar outra');
  const CHAVE = j.corpo.chave;
  // portas fechadas
  j = await json(await N.atender(req('POST', '', {}, {}), env));
  ok(j.status === 401 && j.corpo.erro === 'login', 'POST sem token e sem login: 401');
  j = await json(await N.atender(req('POST', '', { 'x-cron-token': 'c'.repeat(63) + 'd' }, {}), env));
  ok(j.status === 401 && j.corpo.erro === 'token', 'token do agendador errado: 401');
  j = await json(await N.atender(req('PUT', '', {}, {}), env));
  ok(j.status === 405, 'outro método: 405');

  // inscrições: Jhonatan (celular em SP, 10 min; PC em SP, na hora), sócio (PC em Manaus, 5 min)
  const ap1 = await novoAparelho(), ap2 = await novoAparelho(), ap3 = await novoAparelho();
  const E1 = 'https://fcm.googleapis.com/fcm/send/cel-j', E2 = 'https://updates.push.services.mozilla.com/wpush/v2/pc-j', E3 = 'https://web.push.apple.com/socio';
  DB.push_inscricoes.push(
    { user_id: U1, id: idDe(E1), endpoint: E1, p256dh: ap1.p256dh, auth: ap1.authB64, aparelho: 'celular', fuso: 'America/Sao_Paulo', minutos: 10 },
    { user_id: U1, id: idDe(E2), endpoint: E2, p256dh: ap2.p256dh, auth: ap2.authB64, aparelho: 'pc', fuso: 'America/Sao_Paulo', minutos: 0 },
    { user_id: U2, id: idDe(E3), endpoint: E3, p256dh: ap3.p256dh, auth: ap3.authB64, aparelho: 'pc', fuso: 'America/Manaus', minutos: 5 });
  const bl = (uid, id, date, st, extra) => DB.blocos.push(Object.assign({ user_id: uid, id, date, start_min: st, duration: 90, title: 'Bloco ' + id, cards: null, completed: false, archived: false, deleted: false }, extra || {}));
  bl(U1, 'f_reuniao', '2026-11-23', 840, { title: 'Reunião' });         // 14:00 SP → celular avisa às 13:50
  bl(U1, 'f_agora', '2026-11-23', 830, { title: 'Ligar pro cartório' }); // 13:50 SP → PC (na hora) e celular (começando)
  bl(U1, 'f_feito', '2026-11-23', 840, { completed: true });
  bl(U1, 'f_amanha', '2026-11-24', 840);
  bl(U2, 'f_socio', '2026-11-23', 775, { title: 'Visita', cards: [{ id: 'cd_1' }] }); // 12:55 em Manaus = 13:55 SP → 5 min antes: 12:50 Manaus
  bl(U2, 'f_jhon_nao', '2026-11-23', 840, { title: 'Não é do sócio' });
  const CRON = { 'x-cron-token': 'c'.repeat(64) };
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(j.status === 200 && j.corpo.inscricoes === 3 && j.corpo.avisos === 4 && j.corpo.erros === 0, 'a rodada das 13:50: 3 aparelhos, 4 avisos (' + JSON.stringify(j.corpo) + ')');
  const de = (e) => pushes.filter((p) => p.url === e);
  const cel = await Promise.all(de(E1).map((p) => decifrar(p.corpo, ap1))), pc = await Promise.all(de(E2).map((p) => decifrar(p.corpo, ap2))), so = await Promise.all(de(E3).map((p) => decifrar(p.corpo, ap3)));
  ok(cel.map((a) => a.t + ' | ' + a.b).sort().join(' / ') === 'Ligar pro cartório | Agora · 13:50–15:20 / Reunião | Daqui a 10 min · 14:00–15:30' && cel.every((a) => a.u === 'app'), 'celular (10 min antes): "Reunião · Daqui a 10 min" e "Ligar pro cartório · Agora"; o clique abre o app');
  ok(pc.length === 1 && pc[0].t === 'Ligar pro cartório' && pc[0].b === 'Agora · 13:50–15:20' && pc[0].u === 'pc', 'PC (na hora): só o que começa agora; o clique abre a tela do PC');
  ok(so.length === 1 && so[0].t === 'Visita' && so[0].b === 'Daqui a 5 min · 12:55–14:25 · sublista com 1 cartão', 'o sócio, em Manaus (5 min antes): a sublista dele, no horário dele; nada do Jhonatan');
  const p0 = de(E1)[0];
  const [jh, jp, js] = p0.h.Authorization.replace(/^vapid t=/, '').split(', k=')[0].split('.');
  const kObj = nodeCrypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64(unb64(CHAVE).slice(1, 33)), y: b64(unb64(CHAVE).slice(33, 65)) }, format: 'jwk' });
  const claims = JSON.parse(Buffer.from(jp, 'base64url'));
  ok(p0.h.TTL === '900' && p0.h.Urgency === 'high' && p0.h['Content-Encoding'] === 'aes128gcm' && p0.h.Authorization.endsWith(', k=' + CHAVE), 'cabeçalhos do push: TTL 15 min, urgência alta, aes128gcm e a chave pública');
  ok(nodeCrypto.verify('sha256', Buffer.from(jh + '.' + jp), { key: kObj, dsaEncoding: 'ieee-p1363' }, Buffer.from(js, 'base64url')) && claims.aud === 'https://fcm.googleapis.com' && claims.sub === 'https://jhonatanfavero.github.io/Faz-App/' && claims.exp === Math.floor(NOW / 1000) + 3540, 'JWT do push: assinado com a chave guardada, aud = o serviço, sub = o site, vale 59 min');
  ok(DB.alertas_enviados.length === 4 && DB.alertas_enviados.every((a) => a.chave.split('|').length === 4), 'cada aviso enviado fica registrado (bloco|dia|horário|minutos)');
  const nPush = pushes.length;
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(j.corpo.avisos === 0 && pushes.length === nPush, 'a mesma rodada de novo (o agendador chamou duas vezes): nada repete');
  NOW += 60000; // 13:51
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(j.corpo.avisos === 0 && pushes.length === nPush, '13:51: nada novo (o PC "na hora" já avisou o das 13:50)');
  // bloco mudado de horário: aviso novo
  DB.blocos.find((b) => b.id === 'f_reuniao').start_min = 845; // 14:05
  NOW = Date.UTC(2026, 10, 23, 16, 55, 10); // 13:55
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  const ult = await decifrar(pushes[pushes.length - 1].corpo, ap1);
  ok(j.corpo.avisos === 1 && ult.t === 'Reunião' && ult.b === 'Daqui a 10 min · 14:05–15:35', 'a Reunião foi pras 14:05: às 13:55 avisa de novo, no horário novo');
  // inscrição que acabou
  pushStatus = (url) => (url === E2 ? 410 : 201);
  bl(U1, 'f_pc', '2026-11-23', 840 + 16, { title: 'Café' }); // 14:16
  NOW = Date.UTC(2026, 10, 23, 17, 16, 5); // 14:16
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(j.corpo.removidas === 1 && !DB.push_inscricoes.some((i) => i.endpoint === E2) && DB.push_inscricoes.length === 2, 'o serviço de push disse 410 (desinstalou ou tirou a permissão): a inscrição sai da lista');
  pushStatus = () => 201;
  // endereço fora da lista (o banco não deixa entrar; se entrar, a função não manda)
  DB.push_inscricoes.push({ user_id: U2, id: idDe('https://evil.com/x'), endpoint: 'https://evil.com/x', p256dh: ap3.p256dh, auth: ap3.authB64, aparelho: 'pc', fuso: 'America/Manaus', minutos: 0 });
  bl(U2, 'f_socio2', '2026-11-23', 16 * 60 + 30 - 60, { title: 'Outra' }); // 15:30 em Manaus = 16:30 SP
  NOW = Date.UTC(2026, 10, 23, 19, 30, 0); // 16:30 SP
  const nPedidos = pedidos.length;
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(!pedidos.slice(nPedidos).some((p) => /evil/.test(p.url)) && j.corpo.erros >= 1, 'inscrição com endereço que não é de push: a função não manda nada pra lá');
  DB.push_inscricoes = DB.push_inscricoes.filter((i) => !/evil/.test(i.endpoint));
  // limpeza (uma vez por hora, no minuto 7)
  DB.alertas_enviados.push({ user_id: U1, inscricao_id: 'velho', chave: 'x|2026-11-01|0|10', enviado_em: '2026-11-01T10:00:00.000Z' });
  NOW = Date.UTC(2026, 10, 23, 20, 7, 0);
  await N.atender(req('POST', '', CRON, {}), env);
  ok(!DB.alertas_enviados.some((a) => a.inscricao_id === 'velho') && DB.alertas_enviados.length > 0, 'no minuto 7 de cada hora apaga o registro de mais de 3 dias (o resto fica)');
  ok(pedidos.filter((p) => p.url.startsWith('/rest/v1/')).every((p) => p.h.apikey === 'sb_secret_teste' && !p.h.Authorization), 'no banco usa a chave secreta nova só no apikey (ela não é JWT)');

  // aviso de teste
  const ID1 = idDe(E1);
  j = await json(await N.atender(req('POST', '', { Authorization: 'Bearer tok-u1', 'Content-Type': 'application/json' }, { teste: ID1 }), env));
  const t1 = await decifrar(pushes[pushes.length - 1].corpo, ap1);
  ok(j.status === 200 && j.corpo.ok === true && j.cors === '*' && t1.t === 'Avisos do Faz ligados ✅' && t1.b === 'Este aparelho vai avisar 10 min antes de cada compromisso.' && pushes[pushes.length - 1].url === E1, 'teste com o login: o aviso "Avisos do Faz ligados ✅" chega só nesse aparelho');
  j = await json(await N.atender(req('POST', '', { Authorization: 'Bearer tok-u2' }, { teste: ID1 }), env));
  ok(j.status === 404, 'o sócio pedindo teste no aparelho do Jhonatan: 404 (não acha)');
  j = await json(await N.atender(req('POST', '', { Authorization: 'Bearer tok-falso' }, { teste: ID1 }), env));
  ok(j.status === 401, 'login que não vale: 401');
  j = await json(await N.atender(req('POST', '', { Authorization: 'Bearer tok-u1' }, { teste: 'abc' }), env));
  ok(j.status === 400, 'id de inscrição estragado: 400');
  pushStatus = () => 410;
  j = await json(await N.atender(req('POST', '', { Authorization: 'Bearer tok-u1' }, { teste: ID1 }), env));
  ok(j.status === 410 && !DB.push_inscricoes.some((i) => i.id === ID1), 'teste num aparelho que o serviço não conhece mais: 410 e a inscrição sai');
  pushStatus = () => 201;
  // banco fora do ar
  falhaBanco = true; N.esquecerCache();
  j = await json(await N.atender(req('POST', '', CRON, {}), env));
  ok(j.status === 500 && j.corpo.erro === 'interno' && logs.some((l) => /banco 500/.test(l)), 'banco fora do ar: 500 sem detalhe pra fora (o detalhe vai pro log)');
  falhaBanco = false;
  // a chave antiga (service_role, JWT) também serve
  const env2 = Object.assign({}, env, { secretKey: '', serviceKey: 'eyJ.legado' });
  const nP = pedidos.length;
  await N.atender(req('GET', '?chave=1'), Object.assign({}, env2, { fetch: async (u, i) => { pedidos.push({ url: u, h: (i && i.headers) || {} }); return resp(200, [{ valor: JSON.stringify({ publico: 'x', jwk: { d: 'y' } }) }]); } }));
  ok(pedidos.slice(nP).some((p) => p.h.apikey === 'eyJ.legado' && p.h.Authorization === 'Bearer eyJ.legado'), 'sem a chave secreta nova: usa a antiga (JWT) no apikey e no Authorization');

  console.log(`\n==== RESULTADO: ${pass} passaram, ${fail} falharam ====`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERRO', e); console.log(`\n==== RESULTADO: ${pass} passaram, ${fail + 1} falharam ====`); process.exit(1); });
