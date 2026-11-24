// V40.42.0 — AVISOS DOS COMPROMISSOS: a parte que roda no Supabase (Edge Function "alertas").
// Roda a cada minuto (pg_cron + pg_net) e manda um aviso (Web Push) pra cada aparelho ligado, N minutos antes de
// cada bloco da agenda. Sem biblioteca de fora: só fetch e crypto.subtle (funciona no Deno da Edge Function e no
// Node dos testes). O que chega aqui:
//   GET  ?chave=1                       → { chave }: a chave pública VAPID (o aparelho precisa dela pra se inscrever)
//   POST com o cabeçalho x-cron-token   → a rodada do minuto (o token foi criado dentro do banco: faz_segredos)
//   POST { teste: <id da inscrição> } com o login (Authorization: Bearer <token do usuário>) → aviso de teste
// A chave VAPID é criada aqui na primeira vez e guardada em faz_segredos (RLS sem política: só a chave secreta
// do projeto lê). Ninguém de fora vê a parte privada.
// O conteúdo do aviso vai cifrado (RFC 8291, aes128gcm): o serviço de push (Google, Apple, Mozilla) não lê.

export const MINUTOS = [0, 5, 10, 15, 30];
export const MAX_INSCRICOES = 20;

// ---------- bytes ----------
const enc = new TextEncoder();
export function b64u(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64u(str) {
    const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function junta(...partes) {
    let n = 0;
    partes.forEach((p) => { n += p.length; });
    const out = new Uint8Array(n);
    let o = 0;
    partes.forEach((p) => { out.set(p, o); o += p.length; });
    return out;
}

// ---------- VAPID (RFC 8292): quem manda o aviso se identifica com uma chave P-256 ----------
export async function gerarVapid() {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)); // 65 bytes: 0x04 + x + y
    return { publico: b64u(raw), jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d } };
}
export async function vapidJwt(jwk, aud, sub, exp) {
    const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const corpo = b64u(enc.encode(JSON.stringify({ aud, exp, sub })));
    const assin = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(cab + '.' + corpo)); // r||s (64 bytes), o formato do JWT
    return cab + '.' + corpo + '.' + b64u(assin);
}

// ---------- cifrar o aviso (RFC 8291 + RFC 8188, aes128gcm, um registro só) ----------
async function hkdf(salt, ikm, info, bits) {
    const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bits));
}
// p256dh e auth: as chaves que o aparelho deu ao se inscrever. opts (só nos testes): { salt, local: { publico (65 bytes), privada (CryptoKey ECDH) } }
export async function cifrar(texto, p256dh, auth, opts) {
    const uaPublico = unb64u(p256dh), segredo = unb64u(auth);
    if (uaPublico.length !== 65 || uaPublico[0] !== 4 || segredo.length !== 16) throw new Error('chaves do aparelho estragadas');
    let local = opts && opts.local;
    if (!local) {
        const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        local = { publico: new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey)), privada: par.privateKey };
    }
    const salt = (opts && opts.salt) || crypto.getRandomValues(new Uint8Array(16));
    const uaKey = await crypto.subtle.importKey('raw', uaPublico, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privada, 256));
    const ikm = await hkdf(segredo, ecdh, junta(enc.encode('WebPush: info\0'), uaPublico, local.publico), 256);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 128);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 96);
    const dados = junta(typeof texto === 'string' ? enc.encode(texto) : texto, new Uint8Array([2])); // 0x02 = último registro, sem enchimento
    const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const cifra = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, dados));
    const rs = new Uint8Array([0, 0, 16, 0]); // 4096
    return junta(salt, rs, new Uint8Array([65]), local.publico, cifra);
}

// ---------- pra onde pode mandar ----------
// Só os serviços de push dos navegadores (Chrome/Android, Firefox, Safari/iPhone, Edge): o endereço vem do aparelho,
// e a função não pode virar um jeito de mandar requisição pra qualquer lugar.
const SERVICOS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
export function enderecoOk(endpoint) { return typeof endpoint === 'string' && endpoint.length <= 1000 && SERVICOS.test(endpoint); }

export async function enviar(env, insc, aviso, vapid) {
    if (!enderecoOk(insc.endpoint)) return 400;
    const u = new URL(insc.endpoint);
    const agora = Math.floor(env.now() / 1000);
    const jwt = await vapidJwt(vapid.jwk, u.origin, env.vapidSub, agora + 3540); // vale 59 min (a Apple não aceita mais que 1 hora)
    const corpo = await cifrar(JSON.stringify(aviso), insc.p256dh, insc.auth);
    const r = await env.fetch(insc.endpoint, {
        method: 'POST',
        headers: { TTL: String(env.ttl || 900), Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', Authorization: 'vapid t=' + jwt + ', k=' + vapid.publico },
        body: corpo
    });
    return r.status;
}

// ---------- hora de cada aparelho ----------
export function agoraLocal(fuso, ms) {
    let partes;
    try {
        partes = new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    } catch (e) { return null; } // fuso que não existe
    const p = {};
    partes.forEach((x) => { p[x.type] = x.value; });
    return { dia: p.year + '-' + p.month + '-' + p.day, min: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}
export function diaNum(ymd) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '')); return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : NaN; }
export function somaDia(ymd, n) { const d = new Date((diaNum(ymd) + n) * 864e5); return d.toISOString().slice(0, 10); }
function hhmm(min) { const m = ((min % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }

// Os blocos que devem avisar AGORA nesta inscrição: o horário do aviso (início − minutos) já chegou e o bloco ainda
// não começou (ou começou neste minuto). Bloco criado ou mudado pra daqui a pouco (já dentro dos N minutos) avisa na
// hora, com o tempo que falta; o agendador atrasado também. O banco não deixa o mesmo aviso ir duas vezes
// (alertas_enviados). Bloco concluído, arquivado ou apagado não avisa.
export function devidos(blocos, insc, agora) {
    const nowW = diaNum(agora.dia) * 1440 + agora.min, antes = MINUTOS.indexOf(Number(insc.minutos)) >= 0 ? Number(insc.minutos) : 10, out = [];
    (blocos || []).forEach((b) => {
        if (!b || b.deleted || b.archived || b.completed) return;
        const ini = Number(b.start_min), dia = diaNum(b.date);
        if (!Number.isFinite(ini) || !Number.isFinite(dia)) return;
        const iniW = dia * 1440 + ini, avisoW = iniW - antes;
        if (avisoW > nowW || iniW < nowW - 1) return;
        out.push({ bloco: b, chave: b.id + '|' + b.date + '|' + ini + '|' + antes, falta: iniW - nowW });
    });
    return out;
}
// O texto do aviso (o celular e o PC mostram igual). u: 'pc' abre a tela do PC; 'app', o app.
export function textoAviso(b, falta, aparelho) {
    const sub = Array.isArray(b.cards), n = sub ? b.cards.length : 0;
    const titulo = (String(b.title || '').trim() || (sub ? 'Sublista' : 'Compromisso')).slice(0, 120);
    const quando = hhmm(b.start_min) + '–' + hhmm(Number(b.start_min) + Number(b.duration || 0));
    let corpo = (falta > 0 ? 'Daqui a ' + falta + ' min · ' : 'Agora · ') + quando;
    if (sub) corpo += ' · sublista com ' + n + (n === 1 ? ' cartão' : ' cartões');
    return { t: titulo, b: corpo, tag: 'faz-' + b.id, u: aparelho === 'pc' ? 'pc' : 'app' };
}

// ---------- o banco (PostgREST com a chave secreta do projeto) ----------
function banco(env) {
    const h = env.secretKey ? { apikey: env.secretKey } : { apikey: env.serviceKey, Authorization: 'Bearer ' + env.serviceKey }; // a chave nova não é JWT: só no apikey
    const url = env.url.replace(/\/$/, '') + '/rest/v1/';
    async function pede(caminho, init) {
        const r = await env.fetch(url + caminho, Object.assign({}, init, { headers: Object.assign({}, h, (init && init.headers) || {}) }));
        if (!r.ok) throw new Error('banco ' + r.status + ' em ' + caminho.split('?')[0] + ': ' + (await r.text()).slice(0, 200));
        const t = await r.text();
        return t ? JSON.parse(t) : null;
    }
    return {
        ler: (caminho) => pede(caminho),
        inserir: (tabela, linhas, ignorarRepetidas) => pede(tabela, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: (ignorarRepetidas ? 'resolution=ignore-duplicates,' : '') + 'return=representation' }, body: JSON.stringify(linhas) }),
        apagar: (caminho) => pede(caminho, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
    };
}
const q = encodeURIComponent;

let cache = { vapid: null, token: null, tokenAt: 0 };
export function esquecerCache() { cache = { vapid: null, token: null, tokenAt: 0 }; }
async function segredo(db, nome) {
    const r = await db.ler('faz_segredos?select=valor&nome=eq.' + q(nome));
    return r && r[0] ? r[0].valor : null;
}
export async function vapidDe(env) {
    if (cache.vapid) return cache.vapid;
    const db = banco(env);
    let v = await segredo(db, 'vapid');
    if (!v) { // primeira vez: cria e guarda (se duas rodadas criarem juntas, vale a que gravou primeiro)
        const nova = await gerarVapid();
        await db.inserir('faz_segredos', [{ nome: 'vapid', valor: JSON.stringify(nova) }], true);
        v = await segredo(db, 'vapid');
    }
    const p = JSON.parse(v);
    if (!p || !p.publico || !p.jwk || !p.jwk.d) throw new Error('chave VAPID estragada');
    cache.vapid = p;
    return p;
}
async function tokenDoCron(env) {
    if (cache.token && env.now() - cache.tokenAt < 600000) return cache.token;
    cache.token = await segredo(banco(env), 'cron_token');
    cache.tokenAt = env.now();
    return cache.token;
}
function igual(a, b) { // compara sem pressa diferente pra cada letra
    a = String(a || ''); b = String(b || '');
    let d = a.length ^ b.length;
    for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return d === 0 && a.length > 0;
}

// ---------- a rodada do minuto ----------
export async function rodada(env) {
    const db = banco(env), resumo = { inscricoes: 0, avisos: 0, erros: 0, removidas: 0 };
    const inscs = (await db.ler('push_inscricoes?select=user_id,id,endpoint,p256dh,auth,aparelho,fuso,minutos')) || [];
    resumo.inscricoes = inscs.length;
    if (!inscs.length) return resumo;
    const vapid = await vapidDe(env), porPessoa = new Map();
    inscs.forEach((i) => { if (!porPessoa.has(i.user_id)) porPessoa.set(i.user_id, []); porPessoa.get(i.user_id).push(i); });
    for (const [uid, lista] of porPessoa) {
        const agoras = new Map(), dias = new Set();
        lista.forEach((i) => { const a = agoraLocal(i.fuso, env.now()) || agoraLocal('America/Sao_Paulo', env.now()); agoras.set(i.id, a); dias.add(a.dia); dias.add(somaDia(a.dia, 1)); });
        let blocos;
        try {
            blocos = await db.ler('blocos?select=id,date,start_min,duration,title,cards,completed,archived,deleted&user_id=eq.' + q(uid) + '&deleted=is.false&archived=is.false&completed=is.false&date=in.(' + [...dias].map(q).join(',') + ')');
        } catch (e) { resumo.erros++; env.log('[alertas] blocos', String(e)); continue; }
        for (const insc of lista) {
            const due = devidos(blocos, insc, agoras.get(insc.id));
            if (!due.length) continue;
            let novos; // o banco garante uma vez só (chave primária): quem já foi não volta
            try {
                novos = await db.inserir('alertas_enviados', due.map((d) => ({ user_id: uid, inscricao_id: insc.id, chave: d.chave })), true) || [];
            } catch (e) { resumo.erros++; env.log('[alertas] registro', String(e)); continue; }
            const vai = new Set(novos.map((n) => n.chave));
            for (const d of due) {
                if (!vai.has(d.chave)) continue;
                let st = 0;
                try { st = await enviar(env, insc, textoAviso(d.bloco, d.falta, insc.aparelho), vapid); } catch (e) { env.log('[alertas] envio', String(e)); }
                if (st >= 200 && st < 300) resumo.avisos++;
                else if (st === 404 || st === 410) { // a inscrição acabou (desinstalou, tirou a permissão): sai da lista
                    try { await db.apagar('push_inscricoes?user_id=eq.' + q(uid) + '&id=eq.' + q(insc.id)); resumo.removidas++; } catch (e) { resumo.erros++; }
                    break;
                } else { resumo.erros++; env.log('[alertas] push respondeu', st); }
            }
        }
    }
    if (new Date(env.now()).getUTCMinutes() === 7) { // uma vez por hora: o registro do que já foi enviado só precisa dos últimos dias
        try { await db.apagar('alertas_enviados?enviado_em=lt.' + q(new Date(env.now() - 3 * 864e5).toISOString())); } catch (e) { env.log('[alertas] limpeza', String(e)); }
    }
    return resumo;
}

// ---------- aviso de teste (o botão "Mandar um aviso de teste") ----------
async function quemE(env, token) {
    const r = await env.fetch(env.url.replace(/\/$/, '') + '/auth/v1/user', { headers: { apikey: env.publicKey, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && typeof u.id === 'string' ? u.id : null;
}
export async function teste(env, token, id) {
    const uid = await quemE(env, token);
    if (!uid) return { status: 401, corpo: { erro: 'login' } };
    if (typeof id !== 'string' || !/^[0-9a-f]{64}$/.test(id)) return { status: 400, corpo: { erro: 'inscricao' } };
    const db = banco(env);
    const r = await db.ler('push_inscricoes?select=user_id,id,endpoint,p256dh,auth,aparelho,fuso,minutos&user_id=eq.' + q(uid) + '&id=eq.' + q(id));
    const insc = r && r[0];
    if (!insc) return { status: 404, corpo: { erro: 'inscricao' } };
    const m = Number(insc.minutos);
    const aviso = { t: 'Avisos do Faz ligados ✅', b: m ? 'Este aparelho vai avisar ' + m + ' min antes de cada compromisso.' : 'Este aparelho vai avisar na hora de cada compromisso.', tag: 'faz-teste', u: insc.aparelho === 'pc' ? 'pc' : 'app' };
    const st = await enviar(env, insc, aviso, await vapidDe(env));
    if (st === 404 || st === 410) { await db.apagar('push_inscricoes?user_id=eq.' + q(uid) + '&id=eq.' + q(id)); return { status: 410, corpo: { erro: 'expirou' } }; }
    return { status: st >= 200 && st < 300 ? 200 : 502, corpo: st >= 200 && st < 300 ? { ok: true } : { erro: 'push', status: st } };
}

// ---------- a porta de entrada ----------
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
function resposta(status, corpo) { return new Response(JSON.stringify(corpo), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) }); }
export async function atender(req, env) {
    try {
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
        const url = new URL(req.url);
        if (req.method === 'GET' && url.searchParams.get('chave')) return resposta(200, { chave: (await vapidDe(env)).publico });
        if (req.method !== 'POST') return resposta(405, { erro: 'metodo' });
        const tok = req.headers.get('x-cron-token');
        if (tok) {
            if (!igual(tok, await tokenDoCron(env))) return resposta(401, { erro: 'token' });
            return resposta(200, await rodada(env));
        }
        const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') || '');
        if (!m) return resposta(401, { erro: 'login' });
        let corpo = {};
        try { corpo = await req.json(); } catch (e) {}
        const r = await teste(env, m[1], corpo && corpo.teste);
        return resposta(r.status, r.corpo);
    } catch (e) {
        env.log('[alertas] erro', String(e && e.stack || e));
        return resposta(500, { erro: 'interno' });
    }
}
