/* ===========================================================================
 * Faz / TimeBlock — V40.7.0 — SINCRONIZAÇÃO OPCIONAL DAS LISTAS (Fase 2 MVP)
 * ---------------------------------------------------------------------------
 * Sincroniza as Listas do app (tb_backlog_db), as colunas (tb_backlog_columns)
 * e as tags (tb_tags_db) com o Supabase, nos 2 sentidos — SÓ pra quem fizer
 * login em Config → Sincronizar com a nuvem. Quem não loga: zero mudança
 * (a biblioteca do Supabase nem é baixada).
 *
 * O localStorage continua sendo a fonte primária: o app funciona 100% offline.
 *
 * MERGE DE 3 VIAS, CAMPO A CAMPO (local × base × nuvem):
 *   base = último estado que este aparelho sabe que está igual à nuvem.
 *   - campo mudou só de um lado → vale esse lado
 *   - mudou dos 2 lados (conflito) → vale o deste aparelho (quem sincroniza agora)
 *   - apagou de um lado e editou do outro → MANTÉM (nunca perde edição)
 *   - 1º sync do aparelho (sem base) → JUNTA tudo; se o mesmo item existir
 *     nos 2 lados, vale a nuvem (só depois de confirmação do usuário)
 * Exclusão = tombstone (deleted = true), pra todos os aparelhos ficarem sabendo.
 * Ordem = "position" (double) ESTÁVEL: só muda a posição de quem foi movido
 *   (maior subsequência crescente), assim reordenar no celular não pisa em
 *   edições feitas no PC ao mesmo tempo.
 * Órfãos: tarefa numa lista apagada vai pra lista padrão; tag apagada vira null.
 *
 * Estado interno em 'tb__sync' (prefixo tb__ = interno: fica FORA do backup e
 * o Restaurar não apaga). Sessão do Supabase fica em 'sb-<ref>-auth-token'.
 *
 * O núcleo (FazSyncCore) é puro e testável em Node: require('./sync.js').
 * ======================================================================== */

(function (root, factory) {
    var core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core; // Node (testes)
    else root.FazSyncCore = core;                                             // navegador
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DEFAULT_COL = 'col_geral';
    var STEP = 1024;
    var KINDS = ['listas', 'tags', 'tarefas'];
    var FIELDS = {
        tarefas: ['column_id', 'title', 'duration', 'tag_id', 'microblocks', 'position'],
        listas: ['name', 'is_default', 'position', 'created_ms'],
        tags: ['name', 'color', 'position']
    };
    // Tags que o app cria sozinho num aparelho novo (app.js, tagsDb vazio).
    var DEFAULT_TAGS = {
        tag_1: ['Trabalho', '#ef4444'],
        tag_2: ['Pessoal', '#10b981'],
        tag_3: ['Estudo', '#f59e0b']
    };

    // ---------- utilitários ----------
    function stable(v) { // JSON com chaves ordenadas (comparação independente da ordem das chaves)
        if (v === undefined) return 'null';
        if (v === null || typeof v !== 'object') return JSON.stringify(v);
        if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
        return '{' + Object.keys(v).sort().filter(function (k) { return v[k] !== undefined; })
            .map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    function same(a, b) { return stable(a) === stable(b); }
    function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
    function num(v, def) { var n = Number(v); return Number.isFinite(n) ? n : def; }
    function clampInt(v, def, lo, hi) { var n = Math.round(num(v, def)); return Math.min(hi, Math.max(lo, n)); }
    function str(v, max) { var s = v == null ? '' : String(v); return max ? s.slice(0, max) : s; }
    function byPos(a, b) {
        return (a.position - b.position) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }

    // ---------- item do app <-> linha da nuvem ----------
    var MAP = {
        tarefas: {
            row: function (it) {
                return {
                    id: String(it.id),
                    column_id: it.columnId ? String(it.columnId) : DEFAULT_COL,
                    title: str(it.title, 2000),
                    duration: clampInt(it.duration, 30, 0, 1440),
                    tag_id: it.tagId ? String(it.tagId) : null,
                    microblocks: Array.isArray(it.microblocks) ? clone(it.microblocks) : []
                };
            },
            item: function (r, prev) {
                var it = prev ? Object.assign({}, prev) : { id: r.id };
                it.title = r.title;
                it.duration = r.duration;
                it.tagId = r.tag_id || null;
                it.microblocks = clone(r.microblocks || []);
                // retrocompat: tarefa que nunca teve columnId e continua na padrão fica sem (zero diff)
                if (prev && !prev.columnId && r.column_id === DEFAULT_COL) delete it.columnId;
                else it.columnId = r.column_id;
                return it;
            }
        },
        listas: {
            row: function (c) {
                var ms = num(c.createdAt, NaN);
                return {
                    id: String(c.id),
                    name: str(c.name, 100),
                    is_default: !!c.isDefault,
                    created_ms: Number.isFinite(ms) ? Math.round(ms) : null
                };
            },
            item: function (r, prev) {
                var c = prev ? Object.assign({}, prev) : { id: r.id };
                c.name = r.name;
                c.isDefault = !!r.is_default;
                c.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || Date.now();
                return c;
            }
        },
        tags: {
            row: function (t) {
                return { id: String(t.id), name: str(t.name, 100), color: str(t.color || '#a1a1aa', 32) };
            },
            item: function (r, prev) {
                var t = prev ? Object.assign({}, prev) : { id: r.id };
                t.name = r.name;
                t.color = r.color;
                return t;
            }
        }
    };

    // Linha "limpa" (só os campos conhecidos) — usada pra nuvem e pra base.
    function cleanRow(kind, r) {
        var o = { id: String(r.id), deleted: !!r.deleted };
        FIELDS[kind].forEach(function (f) { o[f] = clone(r[f] === undefined ? null : r[f]); });
        if (typeof o.position !== 'number' || !Number.isFinite(o.position)) o.position = 0;
        if (kind === 'tarefas' && !Array.isArray(o.microblocks)) o.microblocks = [];
        if (kind === 'tarefas' && !o.column_id) o.column_id = DEFAULT_COL;
        return o;
    }
    function indexRows(kind, rows) {
        var out = {};
        (rows || []).forEach(function (r) { if (r && r.id != null) out[String(r.id)] = cleanRow(kind, r); });
        return out;
    }
    function sameRow(kind, a, b) {
        if (!!a.deleted !== !!b.deleted) return false;
        if (a.deleted && b.deleted) return true; // dois tombstones = mesma coisa
        var F = FIELDS[kind];
        for (var i = 0; i < F.length; i++) if (!same(a[F[i]], b[F[i]])) return false;
        return true;
    }

    // ---------- posições estáveis ----------
    // basePos[i] = posição que o item i tinha na última sincronização (ou undefined).
    // Mantém a posição de quem está na maior subsequência crescente (não se mexeu);
    // só quem foi movido/criado ganha posição nova (entre os vizinhos).
    function assignPositions(basePos) {
        var n = basePos.length, i, out = new Array(n), keep = new Array(n).fill(false);
        var tails = [], tailsIdx = [], prevIdx = new Array(n).fill(-1);
        for (i = 0; i < n; i++) {
            var v = basePos[i];
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            var lo = 0, hi = tails.length;
            while (lo < hi) { var mid = (lo + hi) >> 1; if (tails[mid] < v) lo = mid + 1; else hi = mid; }
            tails[lo] = v; tailsIdx[lo] = i;
            prevIdx[i] = lo > 0 ? tailsIdx[lo - 1] : -1;
        }
        var k = tailsIdx.length ? tailsIdx[tailsIdx.length - 1] : -1;
        while (k >= 0) { keep[k] = true; k = prevIdx[k]; }

        var prev = null;
        i = 0;
        while (i < n) {
            if (keep[i]) { out[i] = basePos[i]; prev = basePos[i]; i++; continue; }
            var j = i;
            while (j < n && !keep[j]) j++;
            var next = j < n ? basePos[j] : null, count = j - i, start, step;
            if (prev === null && next === null) { start = 0; step = STEP; }
            else if (prev === null) { step = STEP; start = next - STEP * (count + 1); }
            else if (next === null) { step = STEP; start = prev; }
            else { step = (next - prev) / (count + 1); start = prev; }
            for (var t = 0; t < count; t++) out[i + t] = start + step * (t + 1);
            prev = out[j - 1];
            i = j;
        }
        // Precisão do double esgotada (vizinhos "colados")? Renumera tudo (raríssimo).
        for (i = 1; i < n; i++) {
            if (!(out[i] - out[i - 1] > 1e-7)) return out.map(function (_, q) { return (q + 1) * STEP; });
        }
        return out;
    }

    // Empate de posição (2 aparelhos escolheram o mesmo lugar): desempata mexendo no
    // mínimo de linhas possível. Sem empate, não muda nada.
    function fixTies(rows) {
        var alive = Object.keys(rows).map(function (id) { return rows[id]; })
            .filter(function (r) { return !r.deleted; }).sort(byPos);
        var fixed = assignPositions(alive.map(function (r) { return r.position; }));
        alive.forEach(function (r, i) { if (fixed[i] !== r.position) r.position = fixed[i]; });
    }

    function buildLocal(kind, items, baseRows) {
        var seen = {}, ordered = [], dups = 0;
        (items || []).forEach(function (it) {
            if (!it || it.id == null) return;
            var id = String(it.id);
            if (seen[id]) { dups++; return; }
            seen[id] = true;
            ordered.push(it);
        });
        var pos = assignPositions(ordered.map(function (it) {
            var b = baseRows[String(it.id)];
            return b && !b.deleted ? b.position : undefined;
        }));
        var rows = {};
        ordered.forEach(function (it, i) {
            var r = MAP[kind].row(it);
            r.position = pos[i];
            r.deleted = false;
            rows[r.id] = r;
        });
        return { rows: rows, dups: dups };
    }

    // ---------- merge ----------
    function merge3(kind, L, B, R) {
        var F = FIELDS[kind], M = {}, lEdit = false, rEdit = false;
        F.forEach(function (f) {
            var lc = !same(L[f], B[f]), rc = !same(R[f], B[f]);
            if (lc) lEdit = true;
            if (rc) rEdit = true;
            M[f] = clone(!lc ? R[f] : L[f]); // só local mudou, ou conflito → vale o local
        });
        var lD = !!L.deleted, rD = !!R.deleted, bD = !!B.deleted;
        if (lD === bD && rD === bD) M.deleted = bD;
        else if (lD !== bD && rD === bD) M.deleted = (lD && rEdit) ? false : lD; // apagou aqui, editaram lá → mantém
        else if (rD !== bD && lD === bD) M.deleted = (rD && lEdit) ? false : rD; // apagaram lá, editei aqui → mantém
        else M.deleted = lD; // os dois mudaram igual
        return M;
    }

    function mergeKind(kind, L, B, R, firstSync) {
        var ids = {}, merged = {};
        [L, B, R].forEach(function (m) { Object.keys(m).forEach(function (id) { ids[id] = true; }); });
        Object.keys(ids).forEach(function (id) {
            var b = B[id], l = L[id], r = R[id], m;
            if (!l && b) l = Object.assign({}, b, { deleted: true }); // sumiu daqui = apagado aqui
            if (!r && b) r = Object.assign({}, b, { deleted: true }); // sumiu da nuvem = apagado lá
            if (!l && !r) return;
            if (!l) m = r;
            else if (!r) m = l;
            else if (firstSync || !b) m = r; // 1º sync: na sobreposição vale a nuvem
            else m = merge3(kind, l, b, r);
            m = cleanRow(kind, Object.assign({}, m, { id: id }));
            merged[id] = m;
        });
        return merged;
    }

    function aliveCount(rows) {
        var n = 0;
        (Array.isArray(rows) ? rows : Object.keys(rows || {}).map(function (k) { return rows[k]; }))
            .forEach(function (r) { if (r && !r.deleted) n++; });
        return n;
    }

    /**
     * Planeja uma rodada de sync (função pura).
     * opts.local      { tarefas:[itens do app], listas:[...], tags:[...] }
     * opts.base       { tarefas:{id:linha}, listas:{...}, tags:{...} } ou null
     * opts.remote     { tarefas:[linhas da nuvem], listas:[...], tags:[...] }
     * opts.firstSync  true no 1º sync do aparelho/conta
     * opts.usedTagIds ids de tag usados em qualquer lugar do app (agenda, rotinas...)
     * Retorna { merged, push, changed, droppedDefaults, repaired, dups }
     */
    function plan(opts) {
        var base = opts.base || { tarefas: {}, listas: {}, tags: {} };
        var firstSync = !!opts.firstSync || !opts.base;
        var local = {
            tarefas: (opts.local && opts.local.tarefas) || [],
            listas: (opts.local && opts.local.listas) || [],
            tags: ((opts.local && opts.local.tags) || []).slice()
        };
        var remote = {};
        KINDS.forEach(function (k) { remote[k] = indexRows(k, (opts.remote || {})[k]); });

        // Aparelho novo: as 3 tags padrão (intactas e sem uso) não sobem pra nuvem.
        var droppedDefaults = [];
        if (firstSync && aliveCount(remote.tags) > 0) {
            var used = {};
            (opts.usedTagIds || []).forEach(function (id) { used[id] = true; });
            local.tags = local.tags.filter(function (t) {
                var d = t && DEFAULT_TAGS[t.id];
                if (d && t.name === d[0] && t.color === d[1] && !used[t.id] && !remote.tags[t.id]) {
                    droppedDefaults.push(t.id);
                    return false;
                }
                return true;
            });
        }

        var L = {}, merged = {}, dups = 0;
        KINDS.forEach(function (k) {
            var b = base[k] || {};
            var built = buildLocal(k, local[k], b);
            L[k] = built.rows;
            dups += built.dups;
            merged[k] = mergeKind(k, L[k], b, remote[k], firstSync);
        });

        // Reparo de órfãos (lista/tag apagada de um lado enquanto o outro usava).
        var aliveCols = {}, aliveTags = {}, repaired = 0;
        aliveCols[DEFAULT_COL] = true; // a lista padrão sempre existe no app
        Object.keys(merged.listas).forEach(function (id) { if (!merged.listas[id].deleted) aliveCols[id] = true; });
        Object.keys(merged.tags).forEach(function (id) { if (!merged.tags[id].deleted) aliveTags[id] = true; });
        Object.keys(merged.tarefas).forEach(function (id) {
            var r = merged.tarefas[id];
            if (r.deleted) return;
            if (!aliveCols[r.column_id]) { r.column_id = DEFAULT_COL; repaired++; }
            if (r.tag_id && !aliveTags[r.tag_id]) { r.tag_id = null; repaired++; }
        });

        // Desempate de posições já nesta rodada (não deixa pra próxima).
        KINDS.forEach(function (k) { fixTies(merged[k]); });

        var push = {}, changed = {};
        KINDS.forEach(function (k) {
            push[k] = [];
            changed[k] = false;
            Object.keys(merged[k]).forEach(function (id) {
                var m = merged[k][id], r = remote[k][id], l = L[k][id];
                if (!r || !sameRow(k, m, r)) push[k].push(m);
                if ((!!l) !== (!m.deleted) || (l && !sameRow(k, m, l))) changed[k] = true;
            });
        });
        if (droppedDefaults.length) changed.tags = true;
        if (dups) KINDS.forEach(function (k) { changed[k] = true; });

        return { merged: merged, push: push, changed: changed, droppedDefaults: droppedDefaults, repaired: repaired, dups: dups };
    }

    // Lista do app, na ordem, a partir das linhas mescladas (preserva campos extras do item).
    function materialize(kind, mergedRows, prevItems) {
        var prevById = {};
        (prevItems || []).forEach(function (it) {
            if (it && it.id != null && !prevById[String(it.id)]) prevById[String(it.id)] = it;
        });
        return Object.keys(mergedRows).map(function (id) { return mergedRows[id]; })
            .filter(function (r) { return !r.deleted; })
            .sort(byPos)
            .map(function (r) { return MAP[kind].item(r, prevById[r.id]); });
    }

    function baseFrom(merged) {
        var b = {};
        KINDS.forEach(function (k) {
            b[k] = {};
            Object.keys(merged[k] || {}).forEach(function (id) { b[k][id] = cleanRow(k, merged[k][id]); });
        });
        return b;
    }

    return {
        DEFAULT_COL: DEFAULT_COL, STEP: STEP, KINDS: KINDS, FIELDS: FIELDS, DEFAULT_TAGS: DEFAULT_TAGS,
        stable: stable, same: same, assignPositions: assignPositions, fixTies: fixTies, buildLocal: buildLocal,
        indexRows: indexRows, cleanRow: cleanRow, merge3: merge3, mergeKind: mergeKind,
        plan: plan, materialize: materialize, baseFrom: baseFrom, aliveCount: aliveCount, MAP: MAP
    };
});


/* ===========================================================================
 * COLA DO NAVEGADOR (só roda dentro do app; em Node é ignorada)
 * ======================================================================== */
(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    'use strict';

    var CORE = window.FazSyncCore;
    var CFG = window.FAZ_SUPABASE || {};
    var STATE_KEY = 'tb__sync';
    var LIB_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    var KINDS = CORE.KINDS;
    var SELECT = {
        tarefas: 'id,column_id,title,duration,tag_id,microblocks,position,deleted',
        listas: 'id,name,is_default,position,created_ms,deleted',
        tags: 'id,name,color,position,deleted'
    };
    var configured = !!(CFG.url && CFG.key && !/COLE_AQUI/i.test(CFG.url + CFG.key));

    var sb = null, session = null, libPromise = null;
    var running = false, again = false, applying = false, manualPending = false;
    var debounceT = null, lastRunAt = 0, busyRetries = 0, lastError = null;

    // ---------- helpers ----------
    function $(id) { return document.getElementById(id); }
    function toast(msg) { try { if (typeof showToast === 'function') showToast(msg); } catch (e) {} }
    function projectRef() { try { return new URL(CFG.url).hostname.split('.')[0]; } catch (e) { return ''; } }
    function hasStoredSession() {
        try { return !!localStorage.getItem('sb-' + projectRef() + '-auth-token'); } catch (e) { return false; }
    }
    function urlHasAuth() {
        return /access_token=|refresh_token=|type=signup|type=recovery/.test(location.hash) || /[?&]code=/.test(location.search);
    }
    function readState() {
        try { var s = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); return s && s.v === 1 ? s : null; }
        catch (e) { return null; }
    }
    function writeState(s) { try { localStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {} }
    function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
    function kanbanUrl() { try { return new URL('kanban.html', appUrl()).href; } catch (e) { return 'kanban.html'; } }

    function errMsg(e) {
        var m = String((e && (e.message || e.error_description || e.msg)) || e || '');
        if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
        if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail primeiro (abra o link que enviamos).';
        if (/already registered|already exists/i.test(m)) return 'Esse e-mail já tem conta. Use Entrar.';
        if (/at least 6|Password should/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
        if (/rate limit|too many/i.test(m)) return 'Muitas tentativas. Espere alguns minutos.';
        if (/offline|Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com a nuvem agora.';
        if (/not_configured/.test(m)) return 'Sincronização ainda não configurada.';
        return 'Não consegui sincronizar 😕';
    }

    // O app está no meio de algo que um re-render atrapalharia? Então espera.
    function appBusy() {
        try {
            if (typeof _dragState !== 'undefined' && _dragState) return true;
            if (typeof mbDragActive !== 'undefined' && mbDragActive) return true;
            if (typeof pendingIntent !== 'undefined' && pendingIntent) return true;
            if (typeof _moveCardPendingId !== 'undefined' && _moveCardPendingId) return true;
            var form = $('backlog-form-view');
            if (form && !form.classList.contains('hidden')) return true;
            if (typeof getOpenModal === 'function' && getOpenModal()) return true;
        } catch (e) {}
        return false;
    }

    function usedTagIds() {
        var s = [];
        try { (backlogDb || []).forEach(function (i) { if (i && i.tagId) s.push(i.tagId); }); } catch (e) {}
        try { (db || []).forEach(function (b) { if (b && b.tagId) s.push(b.tagId); }); } catch (e) {}
        try { (routinesDb || []).forEach(function (r) { if (r && r.tagId) s.push(r.tagId); }); } catch (e) {}
        return s;
    }

    // ---------- cliente Supabase (carregado só quando precisa) ----------
    function ensureClient() {
        if (sb) return Promise.resolve(sb);
        if (!configured) return Promise.reject(new Error('not_configured'));
        if (!libPromise) {
            libPromise = new Promise(function (resolve, reject) {
                if (window.supabase && window.supabase.createClient) return resolve();
                var s = document.createElement('script');
                s.src = LIB_URL;
                s.async = true;
                s.onload = function () { (window.supabase && window.supabase.createClient) ? resolve() : reject(new Error('lib')); };
                s.onerror = function () { libPromise = null; reject(new Error('offline')); };
                document.head.appendChild(s);
            }).then(function () {
                sb = window.supabase.createClient(CFG.url, CFG.key, {
                    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
                });
                sb.auth.onAuthStateChange(function (event, s) {
                    session = s || null;
                    updateUI();
                    // nunca chamar o Supabase direto aqui dentro (pode travar) → agenda
                    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) schedule(1200);
                });
                return sb;
            });
        }
        return libPromise;
    }

    // ---------- rodada de sync ----------
    function schedule(ms) {
        clearTimeout(debounceT);
        debounceT = setTimeout(function () { debounceT = null; sync('auto'); }, ms);
    }

    async function fetchAll(uid) {
        var out = {};
        for (var i = 0; i < KINDS.length; i++) {
            var k = KINDS[i];
            out[k] = [];
            for (var from = 0; ; from += 1000) {
                var res = await sb.from(k).select(SELECT[k]).eq('user_id', uid).order('id').range(from, from + 999);
                if (res.error) throw res.error;
                out[k] = out[k].concat(res.data || []);
                if (!res.data || res.data.length < 1000) break;
            }
        }
        return out;
    }

    async function pushAll(uid, push) {
        for (var i = 0; i < KINDS.length; i++) {
            var k = KINDS[i], rows = push[k] || [];
            for (var j = 0; j < rows.length; j += 500) {
                var chunk = rows.slice(j, j + 500).map(function (r) { return Object.assign({ user_id: uid }, r); });
                var res = await sb.from(k).upsert(chunk, { onConflict: 'user_id,id' });
                if (res.error) throw res.error;
            }
        }
    }

    function firstSyncText(remote) {
        var email = (session && session.user && session.user.email) || '';
        return '☁️ PRIMEIRA SINCRONIZAÇÃO DESTE APARELHO\n\n' +
            'Conta: ' + email + '\n' +
            'Neste aparelho: ' + backlogDb.length + ' tarefas, ' + backlogColumnsDb.length + ' listas, ' + tagsDb.length + ' tags\n' +
            'Na nuvem: ' + CORE.aliveCount(remote.tarefas) + ' tarefas, ' + CORE.aliveCount(remote.listas) + ' listas, ' +
            CORE.aliveCount(remote.tags) + ' tags\n\n' +
            'Vou JUNTAR os dois lados. Se o mesmo item existir nos dois, vale a versão da nuvem.\n' +
            'Dica: se quiser segurança extra, faça um backup antes (Config → Backup).\n\n' +
            'Continuar?';
    }

    function applyLocal(p) {
        applying = true;
        try {
            if (p.changed.tarefas) { backlogDb = CORE.materialize('tarefas', p.merged.tarefas, backlogDb); saveBacklog(); }
            if (p.changed.listas) { backlogColumnsDb = CORE.materialize('listas', p.merged.listas, backlogColumnsDb); saveBacklogColumns(); }
            if (p.changed.tags) { tagsDb = CORE.materialize('tags', p.merged.tags, tagsDb); saveTags(); }
        } finally {
            applying = false;
        }
        try { if (typeof ensureDefaultColumn === 'function') ensureDefaultColumn(); } catch (e) {}
        try {
            if (typeof activeColumnId !== 'undefined' && !backlogColumnsDb.some(function (c) { return c.id === activeColumnId; })) {
                activeColumnId = 'col_geral';
            }
        } catch (e) {}
        try { if (typeof renderBacklog === 'function') renderBacklog(); } catch (e) { console.warn('[FazSync] render', e); }
        if (p.changed.tags) {
            try { if (typeof renderTimeline === 'function') renderTimeline(); } catch (e) {}
            try { if (typeof renderTagsList === 'function') renderTagsList(); } catch (e) {}
        }
    }

    async function sync(reason) {
        if (!configured || !session || !sb) return;
        if (running) { again = true; return; }
        if (appBusy()) { if (busyRetries++ < 40) schedule(3000); return; }
        busyRetries = 0;
        running = true;
        lastRunAt = Date.now();
        var manual = manualPending; manualPending = false;
        try {
            var uid = session.user.id;
            var st = readState();
            var firstSync = !st || st.userId !== uid || !st.base;
            var remote = await fetchAll(uid);

            // Daqui até applyLocal é tudo síncrono: nenhuma ação do usuário entra no meio.
            if (appBusy()) { again = true; return; }
            var p = CORE.plan({
                local: { tarefas: backlogDb, listas: backlogColumnsDb, tags: tagsDb },
                base: firstSync ? null : st.base,
                remote: remote,
                firstSync: firstSync,
                usedTagIds: usedTagIds()
            });
            if (firstSync && !confirm(firstSyncText(remote))) {
                await window.fazSyncLogout(true);
                toast('Sincronização cancelada');
                return;
            }
            if (KINDS.some(function (k) { return p.changed[k]; })) applyLocal(p);

            await pushAll(uid, p.push);
            writeState({ v: 1, userId: uid, email: session.user.email || '', base: CORE.baseFrom(p.merged), lastSyncAt: Date.now() });
            lastError = null;
            if (manual || firstSync) toast('Sincronizado ✅');
            pushTheme();
        } catch (e) {
            lastError = e;
            console.warn('[FazSync]', e);
            if (manual) toast(errMsg(e));
        } finally {
            running = false;
            updateUI();
            if (again) { again = false; schedule(1500); }
        }
    }

    // A cor do tema vai junto na conta (sem tabela): a tela do PC abre com a mesma cor do app.
    function pushTheme() {
        try {
            var c = (typeof themeColor !== 'undefined') ? themeColor : null;
            var meta = (session && session.user && session.user.user_metadata) || {};
            if (!/^#[0-9a-fA-F]{6}$/.test(String(c || '')) || meta.faz_theme === c) return;
            sb.auth.updateUser({ data: { faz_theme: c } }).catch(function () {});
        } catch (e) {}
    }

    // Chamado pelo app.js depois de salvar Listas/colunas/tags.
    window.fazSyncNotify = function () {
        if (applying || !session) return;
        schedule(2500);
    };

    // ---------- tela Config → Sincronizar ----------
    function lastSyncLabel(st) {
        if (!st || !st.lastSyncAt) return 'Ainda não sincronizado';
        var d = new Date(st.lastSyncAt), now = new Date();
        var hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        var sameDay = d.toDateString() === now.toDateString();
        return 'Última sincronização: ' + (sameDay ? 'hoje às ' + hm : d.toLocaleDateString('pt-BR') + ' às ' + hm);
    }

    function updateUI() {
        var logged = !!session, st = readState();
        var menu = $('sync-menu-status');
        if (menu) menu.textContent = !configured ? 'Em breve' : logged ? 'Conectado como ' + ((session.user && session.user.email) || '') : 'Ver suas Listas no computador';
        var out = $('sync-logged-out'), inn = $('sync-logged-in');
        if (out) out.classList.toggle('hidden', logged);
        if (inn) inn.classList.toggle('hidden', !logged);
        if ($('sync-user-email')) $('sync-user-email').textContent = logged ? ((session.user && session.user.email) || '') : '';
        if ($('sync-last')) $('sync-last').textContent = lastError ? '⚠️ Não consegui sincronizar agora (sem internet?)' : lastSyncLabel(st);
        if ($('sync-kanban-url')) $('sync-kanban-url').textContent = kanbanUrl().replace(/^https?:\/\//, '');
        if ($('sync-not-configured')) $('sync-not-configured').classList.toggle('hidden', configured);
    }

    function setButtonsDisabled(dis) {
        ['sync-login-btn', 'sync-signup-btn'].forEach(function (id) { var b = $(id); if (b) { b.disabled = dis; b.classList.toggle('opacity-60', dis); } });
    }
    function readCreds() {
        var e = ($('sync-email') && $('sync-email').value || '').trim();
        var p = ($('sync-password') && $('sync-password').value) || '';
        return { email: e, password: p };
    }

    window.openConfigSync = function () {
        $('config-main-menu').classList.add('hidden');
        $('config-sync-view').classList.remove('hidden');
        $('config-title').innerText = 'Sincronizar';
        $('config-back-btn').setAttribute('onclick', 'closeConfigSync()');
        updateUI();
        if (configured && !sb) {
            ensureClient().then(function () { return sb.auth.getSession(); })
                .then(function (r) { session = (r && r.data && r.data.session) || null; updateUI(); })
                .catch(function () { updateUI(); });
        }
    };

    window.closeConfigSync = function () {
        $('config-sync-view').classList.add('hidden');
        $('config-main-menu').classList.remove('hidden');
        $('config-title').innerText = 'Configurações';
        $('config-back-btn').setAttribute('onclick', 'openSheet()');
    };

    window.fazSyncLogin = async function () {
        var c = readCreds();
        if (!c.email || !c.password) return toast('Preencha e-mail e senha');
        setButtonsDisabled(true);
        try {
            await ensureClient();
            var res = await sb.auth.signInWithPassword({ email: c.email, password: c.password });
            if (res.error) throw res.error;
            session = res.data.session;
            if ($('sync-password')) $('sync-password').value = '';
            updateUI();
            schedule(300); // 1ª sincronização (pede confirmação)
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setButtonsDisabled(false);
        }
    };

    window.fazSyncSignup = async function () {
        var c = readCreds();
        if (!c.email || !c.password) return toast('Preencha e-mail e senha');
        if (c.password.length < 6) return toast('A senha precisa ter pelo menos 6 caracteres.');
        setButtonsDisabled(true);
        try {
            await ensureClient();
            var res = await sb.auth.signUp({ email: c.email, password: c.password, options: { emailRedirectTo: appUrl() } });
            if (res.error) throw res.error;
            if (res.data && res.data.session) {
                session = res.data.session;
                updateUI();
                schedule(300);
                toast('Conta criada! ✅');
            } else {
                alert('Pronto! 📧\n\nSe este e-mail ainda não tinha conta, mandamos um link de confirmação para ' + c.email +
                    '.\n\nAbra o link e depois volte aqui e toque em Entrar.');
            }
        } catch (e) {
            toast(errMsg(e));
        } finally {
            setButtonsDisabled(false);
        }
    };

    window.fazSyncNow = function () {
        if (!session) return;
        if (running) return toast('Já estou sincronizando…');
        manualPending = true;
        clearTimeout(debounceT);
        sync('manual');
    };

    window.fazSyncLogout = async function (silent) {
        if (silent !== true && !confirm('Sair da conta?\n\nSeus dados continuam neste aparelho, só param de sincronizar.')) return;
        clearTimeout(debounceT);
        try { if (sb) await sb.auth.signOut(); } catch (e) {}
        session = null;
        updateUI();
        if (silent !== true) toast('Você saiu da conta');
    };

    window.fazSyncCopyKanbanLink = function () {
        var url = kanbanUrl();
        try {
            navigator.clipboard.writeText(url).then(function () { toast('Link copiado! ✅'); }, function () { toast(url); });
        } catch (e) { toast(url); }
    };

    // ---------- boot ----------
    function boot() {
        updateUI();
        if (!configured) return;
        if (hasStoredSession() || urlHasAuth()) {
            ensureClient().then(function () { return sb.auth.getSession(); })
                .then(function (r) { session = (r && r.data && r.data.session) || null; updateUI(); if (session) schedule(1500); })
                .catch(function () { updateUI(); });
        }
        document.addEventListener('visibilitychange', function () {
            if (!session) return;
            if (document.visibilityState === 'visible') {
                if (Date.now() - lastRunAt > 10000) schedule(400);
            } else if (debounceT) { // saindo do app com mudança pendente → sobe já
                clearTimeout(debounceT);
                debounceT = null;
                sync('hide');
            }
        });
        window.addEventListener('online', function () { if (session) schedule(1000); });
        setInterval(function () {
            if (session && document.visibilityState === 'visible' && !running) sync('tick');
        }, 60000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
