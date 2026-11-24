// V40.42.0 — AVISOS DOS COMPROMISSOS: o lado do aparelho. O celular (index.html) e o PC (kanban.html) usam este
// mesmo arquivo; o PC diz quem é com FazAvisos.config({ conta, aparelho: 'pc' }) (o celular usa a conta do sync.js).
//
// Ligar: pede a permissão de notificação (ainda dentro do toque: o iPhone e o Firefox só perguntam assim), inscreve
// este navegador no serviço de push dele (Google, Apple, Mozilla ou Microsoft) com a chave pública da função
// "alertas" do Supabase e guarda a inscrição na conta (tabela push_inscricoes: o RLS só deixa cada um ver e mexer
// nas suas). Daí em diante quem avisa é a nuvem: a cada minuto a função olha a agenda da conta e manda o aviso N
// minutos antes de cada bloco, com o app fechado também. O aviso vai cifrado: o serviço de push não lê.
//
// Cada aparelho liga o seu. O estado fica só aqui, fora do backup e da nuvem: tb__avisos =
// { on, minutos, id (SHA-256 do endereço da inscrição; o banco confere), uid, chave (a pública da função), fuso, em }.
// Sair da conta desliga (FazAvisos.esquecer, antes do signOut: depois o RLS não deixa apagar).
(function () {
    'use strict';
    var LOCAL = 'tb__avisos';
    var MINUTOS = [0, 5, 10, 15, 30];
    var DIA = 864e5;
    // Só os serviços de push dos navegadores (a mesma lista da função e do banco)
    var SERVICOS = /^https:\/\/(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
    var cfg = {
        aparelho: 'celular',
        conta: function () { return typeof window.fazSyncConta === 'function' ? window.fazSyncConta() : Promise.resolve(null); } // { sb, uid, token } | null
    };
    var chaveMem = null, fila = Promise.resolve(), ouvintes = [], ultimaRev = 0;
    // O que o "Ligar" precisa ter na mão na hora do toque: { reg, chave, sub }. A tela chama FazAvisos.preparar() ao
    // abrir: no iPhone (e no Safari/Firefox) a inscrição tem que sair direto do toque, sem nenhuma espera antes.
    var pronto = null;
    function nada() {}

    // ---------- o estado deste aparelho ----------
    function ler() {
        try { var o = JSON.parse(localStorage.getItem(LOCAL) || 'null'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
    }
    function gravar(o) {
        try { localStorage.setItem(LOCAL, JSON.stringify(o)); } catch (e) {}
        ouvintes.forEach(function (f) { try { f(); } catch (e) {} });
        try { if (typeof window.fazAvisosMudou === 'function') window.fazAvisosMudou(); } catch (e) {} // a tela do celular (app.js)
    }
    function minutosOk(m) { m = Number(m); return MINUTOS.indexOf(m) >= 0 ? m : 10; }

    // ---------- o que este navegador consegue ----------
    function ehIos() { var ua = navigator.userAgent || ''; return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
    function instalado() { return window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches); }
    // 'ok' | 'iphone' (abriu pelo Safari: precisa instalar na tela de início) | 'ios-velho' (instalado, iOS antes do 16.4) | 'suporte'
    function suporte() {
        if (navigator.serviceWorker && window.PushManager && typeof window.Notification === 'function') return 'ok';
        if (ehIos()) return instalado() ? 'ios-velho' : 'iphone';
        return 'suporte';
    }
    function permissao() { try { return (window.Notification && window.Notification.permission) || 'default'; } catch (e) { return 'default'; } }
    function pedirPermissao() {
        try {
            if (permissao() === 'granted') return Promise.resolve('granted');
            var r = window.Notification.requestPermission();
            return r && typeof r.then === 'function' ? r.then(function (x) { return x || permissao(); }, function () { return permissao(); }) : Promise.resolve(permissao());
        } catch (e) { return Promise.resolve(permissao()); }
    }

    // ---------- ajudantes ----------
    function prazo(p, ms, nome) {
        return new Promise(function (res, rej) {
            var t = setTimeout(function () { rej(new Error('demorou: ' + nome)); }, ms);
            Promise.resolve(p).then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
        });
    }
    function b64u(buf) { var b = new Uint8Array(buf), s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    function unb64u(str) {
        var s = String(str).replace(/-/g, '+').replace(/_/g, '/'), bin = atob(s + '==='.slice((s.length + 3) % 4)), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    async function sha256hex(txt) {
        var d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt))), s = '';
        for (var i = 0; i < d.length; i++) s += (d[i] < 16 ? '0' : '') + d[i].toString(16);
        return s;
    }
    function fuso() { try { var f = Intl.DateTimeFormat().resolvedOptions().timeZone; if (typeof f === 'string' && f.length >= 1 && f.length <= 64) return f; } catch (e) {} return 'America/Sao_Paulo'; }
    function enderecoOk(e) { return typeof e === 'string' && e.length <= 1000 && SERVICOS.test(e); }
    function funcao() { var c = window.FAZ_SUPABASE || {}; return String(c.url || '').replace(/\/$/, '') + '/functions/v1/alertas'; }
    function falha(cod) { var e = new Error(cod); e.faz = cod; return e; }
    function erroDe(e) {
        if (e && e.faz) return e.faz;
        var m = String((e && (e.message || e.code)) || '');
        if (/faz_limite_aparelhos/.test(m)) return 'limite';
        if (/push_inscricoes_endpoint_check/.test(m)) return 'servico';
        return 'rede';
    }

    // ---------- a conta, a chave da função, o service worker e a inscrição ----------
    async function conta() {
        try { var c = await prazo(cfg.conta(), 8000, 'conta'); return c && c.sb && c.uid && c.token ? c : null; } catch (e) { return null; }
    }
    async function chavePublica(fresca) {
        if (chaveMem && !fresca) return chaveMem;
        var r = await prazo(fetch(funcao() + '?chave=1', { method: 'GET', cache: 'no-store' }), 12000, 'chave');
        if (!r.ok) throw new Error('chave ' + r.status);
        var j = await r.json();
        if (!j || typeof j.chave !== 'string' || unb64u(j.chave).length !== 65) throw new Error('chave');
        chaveMem = j.chave;
        return chaveMem;
    }
    async function registro() {
        var sw = navigator.serviceWorker, reg = await prazo(sw.getRegistration('./'), 8000, 'sw');
        if (!reg) reg = await prazo(sw.register('./sw.js'), 15000, 'sw'); // o PC só registra quando liga os avisos
        if (!reg.active) reg = await prazo(sw.ready, 15000, 'sw'); // o push precisa do service worker já ativo
        return reg;
    }
    function mesmaChave(sub, chave) {
        try { var k = sub.options && sub.options.applicationServerKey; return !k || b64u(k) === chave; } catch (e) { return true; }
    }
    async function semInscricao() { // apaga a inscrição deste navegador (o endereço morre: a nuvem tira da lista no próximo aviso)
        var reg = navigator.serviceWorker && await prazo(navigator.serviceWorker.getRegistration('./'), 8000, 'sw');
        var sub = reg && reg.pushManager && await prazo(reg.pushManager.getSubscription(), 8000, 'push');
        var ok = sub ? !!(await prazo(sub.unsubscribe(), 8000, 'push')) : true;
        if (ok && pronto) pronto.sub = null;
        return ok;
    }
    // A inscrição deste navegador; troca se foi feita com outra chave; cria se não tem (criar).
    async function inscricao(reg, chave, criar) {
        var pm = reg.pushManager, sub = await prazo(pm.getSubscription(), 8000, 'push');
        if (sub && !mesmaChave(sub, chave)) { try { await prazo(sub.unsubscribe(), 8000, 'push'); } catch (e) {} sub = null; }
        pronto = { reg: reg, chave: chave, sub: sub || null };
        if (!sub && criar) {
            try { sub = await prazo(pm.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(chave) }), 20000, 'push'); } catch (e) {
                // o Safari só inscreve direto do toque: agora está tudo na mão (pronto) e o próximo toque inscreve na hora
                if (e && e.name === 'NotAllowedError' && permissao() === 'granted') throw falha('de-novo');
                throw e;
            }
            pronto.sub = sub;
        }
        return sub;
    }
    async function linha(sub, uid, minutos) {
        var j = (sub && sub.toJSON && sub.toJSON()) || {}, k = j.keys || {};
        if (!enderecoOk(j.endpoint)) throw falha('servico');
        return { user_id: uid, id: await sha256hex(j.endpoint), endpoint: j.endpoint, p256dh: String(k.p256dh || ''), auth: String(k.auth || ''), aparelho: cfg.aparelho, fuso: fuso(), minutos: minutosOk(minutos) };
    }
    async function salvar(c, row) {
        var r = await prazo(c.sb.from('push_inscricoes').upsert(row, { onConflict: 'user_id,id' }), 12000, 'nuvem');
        if (r && r.error) throw r.error;
    }
    async function apagar(c, id) {
        var r = await prazo(c.sb.from('push_inscricoes').delete().eq('user_id', c.uid).eq('id', id), 12000, 'nuvem');
        if (r && r.error) throw r.error;
    }
    // Inscreve (se precisar) e grava na conta; a inscrição velha deste aparelho, se o endereço mudou, sai da conta.
    async function gravarNaConta(c, st, minutos, chave) {
        var reg = await registro();
        chave = chave || st.chave || await chavePublica();
        var sub = await inscricao(reg, chave, true), row = await linha(sub, c.uid, minutos);
        if (st.id && st.id !== row.id && st.uid === c.uid) { try { await apagar(c, st.id); } catch (e) {} }
        await salvar(c, row);
        var novo = { on: true, minutos: row.minutos, id: row.id, uid: c.uid, chave: chave, fuso: row.fuso, em: Date.now() };
        gravar(novo);
        return novo;
    }
    // Uma coisa de cada vez (dois toques seguidos, ou a conferência do abrir no meio de um ligar)
    function emFila(fn) { var p = fila.then(fn, fn); fila = p.then(nada, nada); return p; }

    // ---------- o que as telas chamam ----------
    // Ao abrir a tela dos avisos: deixa o service worker, a chave da função e a inscrição atual na mão (pronto).
    // semRegistrar (o PC): só se este navegador já tem o service worker (o PC registra ao ligar, não ao abrir a tela).
    function preparar(opts) {
        if (suporte() !== 'ok') return Promise.resolve(false);
        var semRegistrar = !!(opts && opts.semRegistrar);
        return emFila(async function () {
            try {
                var reg = semRegistrar ? await prazo(navigator.serviceWorker.getRegistration('./'), 8000, 'sw') : await registro();
                if (!reg) return false;
                if (!reg.active) reg = await prazo(navigator.serviceWorker.ready, 15000, 'sw');
                await inscricao(reg, await chavePublica(), false);
                return true;
            } catch (e) { return false; }
        });
    }
    // Ligar: chame direto do toque/clique, sem nenhuma espera antes. Com a tela preparada, a inscrição sai na hora
    // (ela mesma pede a permissão: o jeito que o iPhone, o Safari e o Firefox aceitam); senão pede a permissão primeiro.
    function ligar(minutos) {
        var s = suporte();
        if (s !== 'ok') return Promise.resolve({ ok: false, erro: s });
        var p0 = pronto, pedido;
        if (p0 && p0.reg && p0.chave && !p0.sub) {
            try { pedido = Promise.resolve(p0.reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64u(p0.chave) })); } catch (e) { pedido = Promise.reject(e); }
            pedido = pedido.then(function () { return 'granted'; }, function () { return permissao() === 'granted' ? 'de-novo' : permissao(); });
        } else pedido = pedirPermissao();
        return emFila(async function () {
            var p = await pedido;
            if (p !== 'granted' && p !== 'de-novo') return { ok: false, erro: p === 'denied' ? 'bloqueado' : 'permissao' };
            var c = await conta();
            if (!c) return { ok: false, erro: 'conta' };
            var st = ler();
            try {
                await gravarNaConta(c, st, minutos != null ? minutos : st.minutos, p0 && p0.chave ? p0.chave : await chavePublica(true));
                return { ok: true };
            } catch (e) {
                var erro = erroDe(e);
                if (erro === 'servico') { try { await semInscricao(); } catch (e2) {} }
                return { ok: false, erro: erro };
            }
        });
    }
    function desligar() {
        return emFila(async function () {
            var st = ler(), c = await conta(), nuvem = false, local = false;
            if (c && st.id && (!st.uid || st.uid === c.uid)) { try { await apagar(c, st.id); nuvem = true; } catch (e) {} }
            try { local = await semInscricao(); } catch (e) {}
            if (!nuvem && !local) return { ok: false, erro: 'rede' }; // nada mudou: continua ligado
            gravar({ on: false, minutos: minutosOk(st.minutos) });
            return { ok: true };
        });
    }
    function mudarMinutos(minutos) {
        var m = minutosOk(minutos);
        return emFila(async function () {
            var st = ler();
            if (!st.on) { st.minutos = m; gravar(st); return { ok: true }; } // desligado: só fica escolhido
            var c = await conta();
            if (!c) return { ok: false, erro: 'conta' };
            try { await gravarNaConta(c, st, m); return { ok: true }; } catch (e) { return { ok: false, erro: erroDe(e) }; }
        });
    }
    // Aviso de teste, só pra este aparelho. Se a nuvem não tem (mais) a inscrição, grava de novo e tenta outra vez.
    function testar() {
        return emFila(async function () {
            if (!ler().on || !ler().id) return { ok: false, erro: 'desligado' };
            var c = await conta();
            if (!c) return { ok: false, erro: 'conta' };
            for (var vez = 0; vez < 2; vez++) {
                var r;
                try {
                    r = await prazo(fetch(funcao(), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.token }, body: JSON.stringify({ teste: ler().id }) }), 20000, 'teste');
                } catch (e) { return { ok: false, erro: 'rede' }; }
                if (r.ok) return { ok: true };
                if (r.status === 401) return { ok: false, erro: 'conta' };
                if ((r.status === 404 || r.status === 410) && vez === 0) {
                    try {
                        if (r.status === 410) await semInscricao(); // o serviço de push esqueceu este endereço: inscreve de novo
                        await gravarNaConta(c, ler(), ler().minutos);
                        continue;
                    } catch (e) { return { ok: false, erro: erroDe(e) }; }
                }
                return { ok: false, erro: 'falhou' };
            }
            return { ok: false, erro: 'falhou' };
        });
    }
    // Ao abrir (e ao voltar pro app): confere se o que está na conta ainda é este aparelho. Sem rede: só olha aqui;
    // na conta grava quando algo mudou (endereço, fuso, conta) e uma vez por dia (aí confere também a chave da função).
    function revalidar() {
        if (!ler().on) return Promise.resolve({ ok: true, on: false });
        return emFila(async function () {
            var st = ler();
            if (!st.on) return { ok: true, on: false };
            if (suporte() !== 'ok' || permissao() !== 'granted') { // tiraram a permissão: desliga aqui e na conta
                var c0 = await conta();
                if (c0 && st.id && st.uid === c0.uid) { try { await apagar(c0, st.id); } catch (e) {} }
                gravar({ on: false, minutos: minutosOk(st.minutos) });
                return { ok: true, on: false };
            }
            var c = await conta();
            if (!c) return { ok: true, on: true }; // sem conta agora (sem internet): fica como está
            if (st.uid && st.uid !== c.uid) { // outra conta neste aparelho: a inscrição era da outra
                try { await semInscricao(); } catch (e) {}
                gravar({ on: false, minutos: minutosOk(st.minutos) });
                return { ok: true, on: false };
            }
            try {
                var velho = !st.em || Date.now() - st.em > DIA, chave = velho ? await chavePublica(true) : (st.chave || await chavePublica());
                var reg = await registro(), sub = await inscricao(reg, chave, false);
                var id = sub && enderecoOk(sub.endpoint) ? await sha256hex(sub.endpoint) : null;
                if (!velho && id && id === st.id && st.fuso === fuso() && st.chave === chave) return { ok: true, on: true };
                await gravarNaConta(c, st, st.minutos, chave);
                return { ok: true, on: true };
            } catch (e) {
                var erro = erroDe(e);
                if (erro === 'de-novo' || erro === 'servico') { // ficou sem inscrição e só dá pra refazer com um toque: mostra desligado
                    try { if (st.id) await apagar(c, st.id); } catch (e2) {}
                    gravar({ on: false, minutos: minutosOk(st.minutos) });
                    return { ok: false, on: false, erro: erro };
                }
                return { ok: false, on: true, erro: erro };
            }
        });
    }
    // Sair da conta: desliga antes do signOut (depois o RLS não deixa apagar a inscrição).
    function esquecer() {
        if (!ler().on && !ler().id) return Promise.resolve({ ok: true });
        return prazo(desligar(), 9000, 'esquecer').catch(function () { return { ok: false, erro: 'rede' }; });
    }

    function estado() { var st = ler(); return { suporte: suporte(), permissao: permissao(), on: !!st.on, minutos: minutosOk(st.minutos) }; }
    function rotulo(m) { return m ? m + ' min' : 'Na hora'; }
    function resumo() { var s = estado(); return s.on ? 'Ligados · ' + (s.minutos ? s.minutos + ' min antes' : 'na hora') : ''; }
    var TEXTOS = {
        conta: 'Entre na sua conta primeiro: o aviso sai da nuvem.',
        iphone: 'No iPhone, os avisos só funcionam com o Faz instalado na tela de início.',
        'ios-velho': 'No iPhone, os avisos precisam do iOS 16.4 ou mais novo.',
        suporte: 'Este navegador não mostra avisos.',
        bloqueado: 'As notificações estão bloqueadas pro Faz neste navegador. Libere nas configurações e tente de novo.',
        permissao: 'Pra avisar, o Faz precisa da permissão de notificação.',
        rede: 'Sem conexão com a nuvem agora. Tente de novo.',
        servico: 'Este navegador usa um serviço de aviso que o Faz não conhece.',
        limite: 'Esta conta já tem 20 aparelhos com aviso. Desligue em algum que não usa mais.',
        desligado: 'Ligue os avisos primeiro.',
        'de-novo': 'Quase lá: toque (ou clique) em Ligar mais uma vez pra terminar.',
        falhou: 'Não deu pra mandar o aviso de teste. Tente de novo daqui a pouco.'
    };
    function texto(erro) { return TEXTOS[erro] || TEXTOS.rede; }

    // Confere ao abrir e ao voltar pro app (no máximo 1 vez por minuto)
    function revalidarDepois() { if (Date.now() - ultimaRev < 60000) return; ultimaRev = Date.now(); revalidar().catch(nada); }
    window.addEventListener('load', function () { setTimeout(revalidarDepois, 5000); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(revalidarDepois, 1500); });

    window.FazAvisos = {
        MINUTOS: MINUTOS.slice(),
        config: function (o) {
            if (o && typeof o.conta === 'function') cfg.conta = o.conta;
            if (o && o.aparelho) cfg.aparelho = o.aparelho === 'pc' ? 'pc' : 'celular';
        },
        estado: estado, resumo: resumo, rotulo: rotulo, texto: texto,
        preparar: preparar, ligar: ligar, desligar: desligar, mudarMinutos: mudarMinutos, testar: testar, revalidar: revalidar, esquecer: esquecer,
        aoMudar: function (f) { if (typeof f === 'function') ouvintes.push(f); },
        enderecoOk: enderecoOk
    };
})();
