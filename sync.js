/* ===========================================================================
 * Faz / TimeBlock — SINCRONIZAÇÃO OPCIONAL (Listas desde a V40.7.0, Agenda desde a V40.8.0)
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
 * V40.8.0 — AGENDA (tb_master_db) entra no mesmo merge de 3 vias, nos 2 sentidos.
 *   Como ela é grande, a nuvem é lida de forma INCREMENTAL: só as linhas que mudaram
 *   desde a última rodada (updated_at do servidor, com 30s de folga); o resto da nuvem
 *   é, por definição, igual à base guardada neste aparelho. 'expanded' não sincroniza.
 *   Tarefas e blocos têm 'color' (cor livre) e 'archived' (arquivado: some das listas
 *   do app, mas continua existindo — nunca é tratado como apagado).
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
    var KINDS = ['listas', 'tags', 'tarefas', 'blocos'];
    // listas/tags/tarefas têm ordem própria (position); blocos se ordenam por dia e horário.
    var ORDERED = { listas: true, tags: true, tarefas: true, blocos: false };
    var FIELDS = {
        tarefas: ['column_id', 'title', 'duration', 'tag_id', 'microblocks', 'position', 'color', 'archived'],
        listas: ['name', 'is_default', 'position', 'created_ms'],
        tags: ['name', 'color', 'position'],
        blocos: ['date', 'start_min', 'duration', 'title', 'type', 'theme', 'tag_id', 'microblocks', 'completed', 'was_delayed', 'linked_note_ids', 'color', 'archived']
    };
    var FIELD_DEFAULTS = { archived: false, completed: false, was_delayed: false, is_default: false, microblocks: [], linked_note_ids: [] };
    // Campos estruturais entram em atributos/handlers do HTML do app: só passam nestes formatos.
    var SAFE_ID = /^[\w.\-]{1,64}$/, HEX = /^#[0-9a-fA-F]{3,8}$/, HEX6 = /^#[0-9a-fA-F]{6}$/, WORD = /^[a-z_]{1,32}$/;
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
    function hex6(c) { return HEX6.test(String(c || '')) ? String(c) : null; }
    function byPos(a, b) {
        return (a.position - b.position) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    function byDay(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_min - b.start_min) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    function validDate(s) { // data de calendário real (2026-02-30 não passa)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
        var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
        if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1) return false;
        return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
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
                    microblocks: Array.isArray(it.microblocks) ? clone(it.microblocks) : [],
                    color: hex6(it.color),
                    archived: false
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
                if (r.color) it.color = r.color; else delete it.color;
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
        },
        // V40.8.0: blocos da agenda (tb_master_db). 'expanded' é estado de tela e não sincroniza.
        blocos: {
            row: function (b) {
                var date = String(b.date || '');
                if (!validDate(date)) return null; // sem data válida não sincroniza (fica só no aparelho)
                return {
                    id: String(b.id),
                    date: date,
                    start_min: clampInt(b.startMin, 0, 0, 1440),
                    duration: clampInt(b.duration, 15, 0, 1440),
                    title: str(b.title, 2000),
                    type: str(b.type || 'focus', 32),
                    theme: str(b.theme || 'focus', 32),
                    tag_id: b.tagId ? String(b.tagId) : null,
                    microblocks: Array.isArray(b.microblocks) ? clone(b.microblocks) : [],
                    completed: !!b.completed,
                    was_delayed: !!b.wasDelayed,
                    linked_note_ids: Array.isArray(b.linkedNoteIds) ? clone(b.linkedNoteIds) : [],
                    color: hex6(b.color),
                    archived: false
                };
            },
            item: function (r, prev) {
                var b = prev ? Object.assign({}, prev) : { id: r.id, expanded: false };
                b.date = r.date;
                b.startMin = r.start_min;
                b.duration = r.duration;
                b.title = r.title;
                b.type = r.type;
                b.theme = r.theme;
                b.tagId = r.tag_id || null;
                b.microblocks = clone(r.microblocks || []);
                b.completed = !!r.completed;
                if (r.was_delayed) b.wasDelayed = true; else delete b.wasDelayed;
                b.linkedNoteIds = clone(r.linked_note_ids || []);
                if (r.color) b.color = r.color; else delete b.color;
                return b;
            }
        }
    };

    // Linha "limpa" (só os campos conhecidos, com padrões) — usada pra local, nuvem e base.
    function cleanRow(kind, r) {
        var o = { id: String(r.id), deleted: !!r.deleted };
        FIELDS[kind].forEach(function (f) {
            var v = r[f];
            if (v === undefined || v === null) v = (f in FIELD_DEFAULTS) ? FIELD_DEFAULTS[f] : null;
            o[f] = clone(v);
        });
        if (ORDERED[kind] && (typeof o.position !== 'number' || !Number.isFinite(o.position))) o.position = 0;
        if (kind === 'tarefas' && !o.column_id) o.column_id = DEFAULT_COL;
        return o;
    }
    function safeMbs(a) {
        return (Array.isArray(a) ? a : []).filter(function (m) { return m && typeof m === 'object' && !Array.isArray(m); })
            .map(function (m, i) {
                var o = clone(m);
                if (o.id != null && !SAFE_ID.test(String(o.id))) o.id = 'mb_x' + i;
                return o;
            });
    }
    // Linhas que chegam da nuvem: campos estruturais fora do formato são neutralizados.
    function indexRows(kind, rows) {
        var out = {};
        (rows || []).forEach(function (r) {
            if (!r || r.id == null || !SAFE_ID.test(String(r.id))) return;
            var c = cleanRow(kind, r);
            if ('tag_id' in c && c.tag_id && !SAFE_ID.test(String(c.tag_id))) c.tag_id = null;
            if ('microblocks' in c) c.microblocks = safeMbs(c.microblocks);
            if (kind === 'tags') { if (!HEX.test(String(c.color || ''))) c.color = '#a1a1aa'; }
            else if ('color' in c) c.color = hex6(c.color);
            if (kind === 'tarefas' && !SAFE_ID.test(String(c.column_id))) c.column_id = DEFAULT_COL;
            if (kind === 'blocos') {
                c.date = String(c.date || '').slice(0, 10);
                if (!validDate(c.date)) return;
                c.start_min = clampInt(c.start_min, 0, 0, 1440);
                c.duration = clampInt(c.duration, 15, 0, 1440);
                if (!WORD.test(String(c.type))) c.type = 'focus';
                if (!WORD.test(String(c.theme))) c.theme = 'focus';
                c.linked_note_ids = (Array.isArray(c.linked_note_ids) ? c.linked_note_ids : []).filter(function (x) { return typeof x === 'string' && SAFE_ID.test(x); });
            }
            out[c.id] = c;
        });
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
        var seen = {}, ordered = [], rows = {}, dups = 0, localOnly = {};
        (items || []).forEach(function (it) {
            if (!it || it.id == null) return;
            var id = String(it.id);
            if (seen[id]) { dups++; return; }
            var r = SAFE_ID.test(id) ? MAP[kind].row(it) : null;
            if (!r) { localOnly[id] = true; return; } // id/data fora do formato: fica só neste aparelho
            seen[id] = true;
            ordered.push(r);
        });
        var pos = ORDERED[kind] ? assignPositions(ordered.map(function (r) {
            var b = baseRows[r.id];
            return b && !b.deleted ? b.position : undefined;
        })) : null;
        ordered.forEach(function (r, i) {
            if (pos) r.position = pos[i];
            r.deleted = false;
            rows[r.id] = cleanRow(kind, r);
        });
        return { rows: rows, dups: dups, localOnly: localOnly };
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
            // Sumiu daqui: se estava arquivado (não aparece no app) segue igual; senão foi apagado aqui.
            if (!l && b) l = b.archived ? b : Object.assign({}, b, { deleted: true });
            if (!r && b) r = Object.assign({}, b, { deleted: true }); // sumiu da nuvem = apagado lá
            if (!l && !r) return;
            if (!l) m = r;
            else if (!r) m = l;
            else if (firstSync || !b) m = r; // 1º sync: na sobreposição vale a nuvem
            else m = merge3(kind, l, b, r);
            merged[id] = cleanRow(kind, Object.assign({}, m, { id: id }));
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
     * opts.local      { tarefas:[itens do app], listas:[...], tags:[...], blocos:[...] }
     * opts.base       { tarefas:{id:linha}, listas:{...}, tags:{...}, blocos:{...} } ou null
     * opts.remote     { tarefas:[linhas da nuvem], ... }
     * opts.firstSync  true no 1º sync do aparelho/conta
     * opts.usedTagIds ids de tag usados em qualquer lugar do app (agenda, rotinas...)
     * Retorna { merged, push, changed, droppedDefaults, droppedSeeds, repaired, dups, skipped, localOnly }
     */
    function plan(opts) {
        var firstSync = !!opts.firstSync || !opts.base;
        var firstBlocks = firstSync || !(opts.base && opts.base.blocos); // agenda entrou na V40.8.0
        var base = {}, local = {}, remote = {};
        KINDS.forEach(function (k) {
            base[k] = {};
            var src = (!firstSync && opts.base && opts.base[k]) || {};
            Object.keys(src).forEach(function (id) { base[k][id] = cleanRow(k, Object.assign({}, src[id], { id: id })); });
            local[k] = ((opts.local && opts.local[k]) || []).slice();
            remote[k] = indexRows(k, (opts.remote || {})[k]);
        });

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
        // Idem pro bloco de demonstração do app novo, quando a nuvem já tem agenda.
        var droppedSeeds = 0;
        if (firstBlocks && aliveCount(remote.blocos) > 0) {
            local.blocos = local.blocos.filter(function (b) {
                if (b && /^seed_/.test(String(b.id)) && !remote.blocos[String(b.id)]) { droppedSeeds++; return false; }
                return true;
            });
        }

        var L = {}, merged = {}, dups = {}, totalDups = 0, skipped = 0, localOnly = {};
        KINDS.forEach(function (k) {
            var built = buildLocal(k, local[k], base[k]);
            L[k] = built.rows;
            dups[k] = built.dups;
            totalDups += built.dups;
            localOnly[k] = built.localOnly;
            skipped += Object.keys(built.localOnly).length;
            merged[k] = mergeKind(k, L[k], base[k], remote[k], firstSync);
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
        KINDS.forEach(function (k) { if (ORDERED[k]) fixTies(merged[k]); });

        var push = {}, changed = {};
        KINDS.forEach(function (k) {
            push[k] = [];
            changed[k] = !!dups[k];
            Object.keys(merged[k]).forEach(function (id) {
                var m = merged[k][id], r = remote[k][id], l = L[k][id];
                if (!r || !sameRow(k, m, r)) push[k].push(m);
                var shown = !m.deleted && !m.archived; // arquivado não aparece nas listas do app
                if ((!!l) !== shown || (l && !sameRow(k, m, l))) changed[k] = true;
            });
        });
        if (droppedDefaults.length) changed.tags = true;
        if (droppedSeeds) changed.blocos = true;

        return { merged: merged, push: push, changed: changed, droppedDefaults: droppedDefaults, droppedSeeds: droppedSeeds, repaired: repaired, dups: totalDups, skipped: skipped, localOnly: localOnly };
    }

    // Lista do app a partir das linhas mescladas (preserva campos extras de cada item).
    // localOnly = ids locais que não sincronizam (id/data fora do formato): ficam como estão, no fim.
    function materialize(kind, mergedRows, prevItems, localOnly) {
        var prevById = {}, extras = [], out = [], done = {};
        (prevItems || []).forEach(function (it) {
            if (!it || it.id == null) return;
            var id = String(it.id);
            if (!mergedRows[id]) { if (localOnly && localOnly[id]) extras.push(it); return; }
            if (!prevById[id]) prevById[id] = it;
        });
        var alive = Object.keys(mergedRows).map(function (id) { return mergedRows[id]; })
            .filter(function (r) { return !r.deleted && !r.archived; });
        if (ORDERED[kind]) {
            out = alive.sort(byPos).map(function (r) { return MAP[kind].item(r, prevById[r.id]); });
        } else {
            // mantém a ordem que o app já tinha; o que é novo entra no fim, por dia e horário
            (prevItems || []).forEach(function (it) {
                var id = it && it.id != null ? String(it.id) : null, r = id && mergedRows[id];
                if (r && !r.deleted && !r.archived && !done[id]) { done[id] = true; out.push(MAP[kind].item(r, prevById[id])); }
            });
            alive.filter(function (r) { return !done[r.id]; }).sort(byDay)
                .forEach(function (r) { out.push(MAP[kind].item(r, null)); });
        }
        return out.concat(extras);
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
        DEFAULT_COL: DEFAULT_COL, STEP: STEP, KINDS: KINDS, ORDERED: ORDERED, FIELDS: FIELDS, DEFAULT_TAGS: DEFAULT_TAGS,
        stable: stable, same: same, validDate: validDate, assignPositions: assignPositions, fixTies: fixTies,
        buildLocal: buildLocal, indexRows: indexRows, cleanRow: cleanRow, merge3: merge3, mergeKind: mergeKind,
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
        tarefas: 'id,column_id,title,duration,tag_id,microblocks,position,color,archived,deleted',
        listas: 'id,name,is_default,position,created_ms,deleted',
        tags: 'id,name,color,position,deleted',
        blocos: 'id,date,start_min,duration,title,type,theme,tag_id,microblocks,completed,was_delayed,linked_note_ids,color,archived,deleted,updated_at'
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
            // V40.8.0: NÃO usar getOpenModal() do app aqui. Ele procura qualquer elemento com a classe
            // z-[60], e os botões de cada bloco da timeline também têm essa classe: com um bloco
            // na tela ele sempre respondia "tem modal aberto" e o sync nunca rodava (bug da V40.7.0).
            var modals = document.querySelectorAll('[id$="-modal"]');
            for (var i = 0; i < modals.length; i++) {
                var m = modals[i];
                if (!m.classList.contains('hidden') && (m.classList.contains('flex') || (window.getComputedStyle && getComputedStyle(m).display !== 'none' && m.offsetParent !== null))) return true;
            }
            // V40.8.0: digitando em algum campo do app (ex.: item de checklist)? Não redesenha por baixo.
            var a = document.activeElement;
            if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !(a.closest && a.closest('#config-sheet'))) return true;
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

    async function fetchRows(kind, uid, sinceMs) {
        var out = [];
        for (var from = 0; ; from += 1000) {
            var q = sb.from(kind).select(SELECT[kind]).eq('user_id', uid);
            if (sinceMs) q = q.gt('updated_at', new Date(sinceMs).toISOString());
            var res = await q.order('id').range(from, from + 999);
            if (res.error) throw res.error;
            out = out.concat(res.data || []);
            if (!res.data || res.data.length < 1000) break;
        }
        return out;
    }

    // Listas, tags e tarefas: lê tudo (são pequenas). Agenda: só o que mudou desde a última
    // rodada (30s de folga); o restante da nuvem é igual à base guardada neste aparelho.
    async function fetchAll(uid, st) {
        var out = {}, cursor = (st && st.cursorBlocos) || 0;
        for (var i = 0; i < KINDS.length; i++) if (KINDS[i] !== 'blocos') out[KINDS[i]] = await fetchRows(KINDS[i], uid, 0);
        var incremental = !!(st && st.base && st.base.blocos && cursor);
        var rows = await fetchRows('blocos', uid, incremental ? cursor - 30000 : 0);
        rows.forEach(function (r) { var t = Date.parse(r.updated_at); if (t > cursor) cursor = t; });
        if (incremental) {
            var byId = {};
            Object.keys(st.base.blocos).forEach(function (id) { byId[id] = Object.assign({}, st.base.blocos[id], { id: id }); });
            rows.forEach(function (r) { byId[r.id] = r; });
            rows = Object.keys(byId).map(function (id) { return byId[id]; });
        }
        out.blocos = rows;
        return { remote: out, cursor: cursor };
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

    function localBlocks() {
        try { return (typeof db !== 'undefined' && Array.isArray(db)) ? db : []; } catch (e) { return []; }
    }

    function firstSyncText(remote) {
        var email = (session && session.user && session.user.email) || '';
        return '☁️ PRIMEIRA SINCRONIZAÇÃO DESTE APARELHO\n\n' +
            'Conta: ' + email + '\n' +
            'Neste aparelho: ' + backlogDb.length + ' tarefas, ' + backlogColumnsDb.length + ' listas, ' + tagsDb.length + ' tags\n' +
            'Na nuvem: ' + CORE.aliveCount(remote.tarefas) + ' tarefas, ' + CORE.aliveCount(remote.listas) + ' listas, ' +
            CORE.aliveCount(remote.tags) + ' tags\n\n' +
            'Vou JUNTAR os dois lados. Se o mesmo item existir nos dois, vale a versão da nuvem.\n' +
            'Agenda: ' + localBlocks().length + ' blocos neste aparelho, ' + CORE.aliveCount(remote.blocos) + ' na nuvem.\n' +
            'Dica: se quiser segurança extra, faça um backup antes (Config → Backup).\n\n' +
            'Continuar?';
    }

    function applyLocal(p) {
        applying = true;
        try {
            if (p.changed.tarefas) { backlogDb = CORE.materialize('tarefas', p.merged.tarefas, backlogDb, p.localOnly.tarefas); saveBacklog(); }
            if (p.changed.listas) { backlogColumnsDb = CORE.materialize('listas', p.merged.listas, backlogColumnsDb, p.localOnly.listas); saveBacklogColumns(); }
            if (p.changed.tags) { tagsDb = CORE.materialize('tags', p.merged.tags, tagsDb, p.localOnly.tags); saveTags(); }
            if (p.changed.blocos) { db = CORE.materialize('blocos', p.merged.blocos, db, p.localOnly.blocos); saveDb(); }
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
        if (p.changed.tags || p.changed.blocos) {
            try { if (typeof renderTimeline === 'function') renderTimeline(); } catch (e) { console.warn('[FazSync] timeline', e); }
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
            var fetched = await fetchAll(uid, firstSync ? null : st);
            var remote = fetched.remote;

            // Daqui até applyLocal é tudo síncrono: nenhuma ação do usuário entra no meio.
            if (appBusy()) { again = true; return; }
            var p = CORE.plan({
                local: { tarefas: backlogDb, listas: backlogColumnsDb, tags: tagsDb, blocos: localBlocks() },
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
            writeState({ v: 1, userId: uid, email: session.user.email || '', base: CORE.baseFrom(p.merged), cursorBlocos: fetched.cursor, lastSyncAt: Date.now() });
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
            if (!/^#[0-9a-fA-F]{6}$/.test(String(c || ''))) return;
            // janela do dia (ex.: 7 → 24) também vai, pro PC desenhar a agenda no mesmo intervalo
            var hours = (typeof START_HOUR !== 'undefined' && typeof END_HOUR !== 'undefined') ? [Number(START_HOUR), Number(END_HOUR)] : null;
            if (meta.faz_theme === c && CORE.same(meta.faz_hours || null, hours)) return;
            sb.auth.updateUser({ data: { faz_theme: c, faz_hours: hours } }).catch(function () {});
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
        if (menu) menu.textContent = !configured ? 'Em breve' : logged ? 'Conectado como ' + ((session.user && session.user.email) || '') : 'Listas e Agenda no computador';
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
            try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e2) {}
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

    // V40.8.0: esqueci a senha. O link do e-mail abre a página do computador (kanban.html), que pede a senha nova.
    window.fazSyncForgot = async function () {
        var email = ($('sync-email') && $('sync-email').value || '').trim();
        if (!email) return toast('Digite seu e-mail no campo acima');
        try {
            await ensureClient();
            var res = await sb.auth.resetPasswordForEmail(email, { redirectTo: kanbanUrl() });
            if (res.error) throw res.error;
            alert('Pronto! 📧\n\nSe existe uma conta com ' + email + ', enviamos um link pra criar uma senha nova.\n\nAbra o link, defina a senha e depois volte aqui pra entrar.');
        } catch (e) {
            toast(errMsg(e));
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
