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
 *   Tarefas e blocos têm 'color' (cor livre) e 'archived'. V40.9.0: arquivado sai de
 *   backlogDb/db e fica em tb_archive_db; no sync é uma linha normal com archived = true.
 *
 * V40.17.0 — ROTINAS (tb_routines_db), NOTAS (tb_notes_db) e FINANÇAS (tb_financial_db) entram
 *   no mesmo merge, nos 2 sentidos. Não têm "position": rotinas e notas ficam das mais novas pras
 *   mais antigas (como o app mostra); finanças mantêm a ordem do aparelho (o app ordena por
 *   vencimento). Quem já sincronizava sobe essas três na primeira rodada, sem reenviar o resto.
 *
 * V40.21.0 — METAS: listas de metas (tb_goal_lists), metas (tb_goals_db) e o que foi feito em cada dia
 *   (tb_goal_days, uma linha por meta por dia) entram no mesmo merge. Listas e metas têm "position" (ordem
 *   própria, como as Listas). Os dias são lidos de forma incremental, igual à agenda (cursorMetasDias).
 *   Meta numa lista apagada vai pra primeira lista; dia de meta apagada é apagado junto.
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
    var KINDS = ['listas', 'tags', 'tarefas', 'blocos', 'rotinas', 'notas', 'financas', 'metas_listas', 'metas', 'metas_dias'];
    // listas/tags/tarefas têm ordem própria (position); blocos se ordenam por dia e horário.
    // V40.17.0: rotinas e notas, das mais novas pras mais antigas; finanças, na ordem do aparelho.
    // V40.21.0: listas de metas e metas têm ordem própria; os dias das metas, por data.
    var ORDERED = { listas: true, tags: true, tarefas: true, blocos: false, rotinas: false, notas: false, financas: false, metas_listas: true, metas: true, metas_dias: false };
    var NEWEST_FIRST = { rotinas: true, notas: true };
    var FIELDS = {
        tarefas: ['column_id', 'title', 'duration', 'tag_id', 'microblocks', 'position', 'color', 'archived', 'goal_id'], // V40.34.0: + goal_id (meta ligada)
        listas: ['name', 'is_default', 'position', 'created_ms'],
        tags: ['name', 'color', 'position'],
        blocos: ['date', 'start_min', 'duration', 'title', 'type', 'theme', 'tag_id', 'microblocks', 'completed', 'was_delayed', 'linked_note_ids', 'color', 'archived', 'cards', 'goal_id', 'column_id'],
        rotinas: ['title', 'emoji', 'duration', 'theme', 'tag_id', 'microblocks', 'created_ms', 'goal_id'],
        notas: ['title', 'content', 'created_ms', 'updated_ms'],
        financas: ['title', 'amount', 'start_month', 'duration_months', 'is_recurring', 'due_day', 'tag_id', 'paid_months', 'amount_overrides', 'created_ms'],
        metas_listas: ['name', 'is_default', 'position', 'created_ms'],
        metas: ['list_id', 'title', 'emoji', 'period', 'unit', 'target', 'step', 'position', 'created_ms', 'count_from'], // V40.34.0: + count_from
        metas_dias: ['goal_id', 'date', 'amount', 'target']
    };
    var FIELD_DEFAULTS = { archived: false, completed: false, was_delayed: false, is_default: false, microblocks: [], linked_note_ids: [], is_recurring: false, paid_months: [], amount_overrides: {} };
    // Campos estruturais entram em atributos/handlers do HTML do app: só passam nestes formatos.
    var SAFE_ID = /^[\w.\-]{1,64}$/, HEX = /^#[0-9a-fA-F]{3,8}$/, HEX6 = /^#[0-9a-fA-F]{6}$/, WORD = /^[a-z_]{1,32}$/;
    var MONTH = /^\d{4}-(0[1-9]|1[0-2])$/; // 'YYYY-MM' (mês das finanças)
    var MAX_AMOUNT = 1e12;                 // mesmo limite do CHECK de financas.amount
    // Tags que o app cria sozinho num aparelho novo (app.js, tagsDb vazio).
    var DEFAULT_TAGS = {
        tag_1: ['Trabalho', '#ef4444'],
        tag_2: ['Pessoal', '#10b981'],
        tag_3: ['Estudo', '#f59e0b']
    };
    // V40.21.0: listas de metas que o app e o PC criam sozinhos (mesmos ids dos dois lados) e as regras das metas
    // (as mesmas do metas.js e dos CHECKs da nuvem).
    var DEFAULT_GOAL_LISTS = { gl_pessoal: 'Pessoal', gl_profissional: 'Profissional', gl_financeiro: 'Financeiro' };
    var GOAL_PERIODS = { dia: true, semana: true, mes: true };
    var GOAL_UNITS = { vezes: [1, 1], minutos: [15, 30], reais: [50, 500] }; // [passo, alvo] padrão
    var GOAL_MAX = 1e9;
    function has(o, k) { return k != null && Object.prototype.hasOwnProperty.call(o, String(k)); } // 'constructor' & cia não passam

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
    function str(v, max) { // V40.17.0: não corta um emoji (par de surrogates) ao meio
        var s = v == null ? '' : String(v);
        if (!max || s.length <= max) return s;
        var c = s.charCodeAt(max - 1);
        return s.slice(0, c >= 0xD800 && c <= 0xDBFF ? max - 1 : max);
    }
    function msOrNull(v) { var n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? Math.round(n) : null; }
    function money(v) { var n = num(v, 0); return Math.abs(n) <= MAX_AMOUNT ? n : 0; }
    function dueDay(v) { var n = Number(v); return v != null && v !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null; }
    function cleanMonths(a) { // meses pagos: só 'YYYY-MM', sem repetir, na ordem em que estão
        var seen = {};
        return (Array.isArray(a) ? a : []).map(String).filter(function (m) {
            if (!MONTH.test(m) || seen[m]) return false;
            seen[m] = true;
            return true;
        });
    }
    // Valor de um mês específico: { 'YYYY-MM': { amount: n } }. Aceita também { 'YYYY-MM': n } (formato
    // visto em dados antigos) e grava sempre no formato que o app lê (getAmountInMonth usa .amount).
    function cleanOverrides(o) {
        var out = {};
        if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
        Object.keys(o).sort().forEach(function (m) {
            var v = o[m];
            if (!MONTH.test(m) || v == null) return;
            var a = typeof v === 'object' ? v.amount : v;
            if ((typeof a !== 'number' && typeof a !== 'string') || a === '') return;
            a = Number(a);
            if (Number.isFinite(a) && Math.abs(a) <= MAX_AMOUNT) out[m] = { amount: a };
        });
        return out;
    }
    function hex6(c) { return HEX6.test(String(c || '')) ? String(c) : null; }
    // V40.24.0: SUBLISTA. Bloco com 'cards' (lista, mesmo vazia) é uma sublista; sem 'cards' (null) é bloco normal.
    // Cada cartão: { id, title, done, tagId?, color?, microblocks, duration?, columnId? } (o mesmo JSON no app,
    // na nuvem e no PC). id, tag, lista e cor entram em atributos do HTML: só passam no formato certo.
    var MAX_CARDS = 100;
    function safeCards(a) {
        if (!Array.isArray(a)) return null;
        var seen = {};
        return a.filter(function (c) { return c && typeof c === 'object' && !Array.isArray(c); }).slice(0, MAX_CARDS).map(function (c, i) {
            var id = c.id != null && SAFE_ID.test(String(c.id)) && !seen[String(c.id)] ? String(c.id) : 'cd_x' + i;
            seen[id] = true;
            var o = { id: id, title: str(c.title, 2000), done: !!c.done, microblocks: safeMbs(c.microblocks) };
            if (c.tagId != null && SAFE_ID.test(String(c.tagId))) o.tagId = String(c.tagId);
            if (hex6(c.color)) o.color = String(c.color);
            if (c.duration != null && c.duration !== '' && Number.isFinite(Number(c.duration))) o.duration = clampInt(c.duration, 30, 5, 1440);
            if (c.columnId != null && SAFE_ID.test(String(c.columnId))) o.columnId = String(c.columnId);
            if (goalRef(c.goalId)) o.goalId = goalRef(c.goalId); // V40.34.0
            return o;
        });
    }
    function goalRef(v) { return v != null && v !== '' && SAFE_ID.test(String(v)) ? String(v) : null; } // V40.34.0: meta ligada
    function goalNum(v, def) { // alvo/passo de meta: > 0, até 1 bilhão, com 2 casas
        var n = Number(v), r = v != null && v !== '' && Number.isFinite(n) ? Math.min(GOAL_MAX, Math.round(n * 100) / 100) : 0;
        return r > 0 ? r : def;
    }
    function dayAmount(v) { var n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(GOAL_MAX, Math.round(n * 100) / 100)) : 0; }
    function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); }
    function byPos(a, b) {
        return (a.position - b.position) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    function byDay(a, b) {
        return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.start_min - b.start_min) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    function byNewest(a, b) {
        return ((Number(b.created_ms) || 0) - (Number(a.created_ms) || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    }
    function byCreated(a, b) {
        return ((Number(a.created_ms) || 0) - (Number(b.created_ms) || 0)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
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
                    archived: !!it.__archived,
                    goal_id: goalRef(it.goalId) // V40.34.0
                };
            },
            item: function (r, prev) {
                var it = prev ? Object.assign({}, prev) : { id: r.id };
                if (goalRef(r.goal_id)) it.goalId = goalRef(r.goal_id); else delete it.goalId; // V40.34.0
                it.title = r.title;
                it.duration = r.duration;
                it.tagId = r.tag_id || null;
                it.microblocks = clone(r.microblocks || []);
                // retrocompat: tarefa que nunca teve columnId e continua na padrão fica sem (zero diff)
                if (prev && !prev.columnId && r.column_id === DEFAULT_COL) delete it.columnId;
                else it.columnId = r.column_id;
                if (r.color) it.color = r.color; else delete it.color;
                delete it.__archived;
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
                    archived: !!b.__archived,
                    cards: Array.isArray(b.cards) ? safeCards(b.cards) : null, // V40.24.0: sublista
                    goal_id: goalRef(b.goalId), // V40.34.0: meta ligada
                    column_id: goalRef(b.columnId) // V40.38.0: a lista de onde o bloco veio (o mesmo formato de id)
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
                if (Array.isArray(r.cards)) b.cards = clone(r.cards); else delete b.cards; // V40.24.0: sublista
                if (goalRef(r.goal_id)) b.goalId = goalRef(r.goal_id); else delete b.goalId; // V40.34.0
                if (goalRef(r.column_id)) b.columnId = goalRef(r.column_id); else delete b.columnId; // V40.38.0
                delete b.__archived;
                return b;
            }
        },
        // V40.17.0: rotinas (tb_routines_db). microblocks = itens da checklist ({ title }).
        rotinas: {
            row: function (x) {
                var theme = String(x.theme || 'focus');
                return {
                    id: String(x.id),
                    title: str(x.title, 200),
                    emoji: str(x.emoji, 16),
                    duration: clampInt(x.duration, 60, 0, 1440),
                    theme: WORD.test(theme) ? theme : 'focus',
                    tag_id: x.tagId ? String(x.tagId) : null,
                    microblocks: Array.isArray(x.microblocks) ? clone(x.microblocks) : [],
                    created_ms: msOrNull(x.createdAt),
                    goal_id: goalRef(x.goalId) // V40.34.0
                };
            },
            item: function (r, prev) {
                var x = prev ? Object.assign({}, prev) : { id: r.id };
                x.title = r.title;
                x.emoji = r.emoji;
                x.duration = r.duration;
                x.theme = r.theme;
                x.tagId = r.tag_id || null;
                x.microblocks = clone(r.microblocks || []);
                x.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || 0;
                if (goalRef(r.goal_id)) x.goalId = goalRef(r.goal_id); else delete x.goalId; // V40.34.0
                return x;
            }
        },
        // V40.17.0: notas (tb_notes_db). O vínculo com a agenda mora no bloco (linked_note_ids).
        notas: {
            row: function (n) {
                return {
                    id: String(n.id),
                    title: str(n.title, 500),
                    content: str(n.content, 100000),
                    created_ms: msOrNull(n.createdAt),
                    updated_ms: msOrNull(n.updatedAt)
                };
            },
            item: function (r, prev) {
                var n = prev ? Object.assign({}, prev) : { id: r.id };
                n.title = r.title;
                n.content = r.content;
                n.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || 0;
                if (r.updated_ms != null) n.updatedAt = Number(r.updated_ms); else delete n.updatedAt;
                return n;
            }
        },
        // V40.17.0: despesas (tb_financial_db). Item antigo (V40.4.1–3) tem 'month' e 'paid': viram
        // startMonth e paidMonths, que é o que o app lê primeiro (getItemStartMonth / isPaidInMonth).
        financas: {
            row: function (f) {
                var start = String(f.startMonth || f.month || '');
                if (!MONTH.test(start)) return null; // sem mês de início válido não sincroniza (fica só no aparelho)
                return {
                    id: String(f.id),
                    title: str(f.title, 200),
                    amount: money(f.amount),
                    start_month: start,
                    duration_months: clampInt(f.durationMonths, 1, 1, 1200),
                    is_recurring: !!f.isRecurring,
                    due_day: dueDay(f.dueDay),
                    tag_id: f.tagId ? String(f.tagId) : null,
                    paid_months: cleanMonths(Array.isArray(f.paidMonths) ? f.paidMonths : (f.paid === true ? [start] : [])),
                    amount_overrides: cleanOverrides(f.paidMonthsOverrides),
                    created_ms: msOrNull(f.createdAt)
                };
            },
            item: function (r, prev) {
                var f = prev ? Object.assign({}, prev) : { id: r.id };
                f.title = r.title;
                f.amount = r.amount;
                f.startMonth = r.start_month;
                delete f.month;
                f.durationMonths = r.duration_months;
                f.isRecurring = !!r.is_recurring;
                f.dueDay = r.due_day != null ? r.due_day : null;
                f.tagId = r.tag_id || null;
                f.paidMonths = clone(r.paid_months || []);
                delete f.paid;
                if (r.amount_overrides && Object.keys(r.amount_overrides).length) f.paidMonthsOverrides = clone(r.amount_overrides);
                else delete f.paidMonthsOverrides;
                f.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || 0;
                return f;
            }
        },
        // V40.21.0: listas de metas (tb_goal_lists)
        metas_listas: {
            row: function (c) {
                return { id: String(c.id), name: str(c.name, 100), is_default: !!c.isDefault, created_ms: msOrNull(c.createdAt) };
            },
            item: function (r, prev) {
                var c = prev ? Object.assign({}, prev) : { id: r.id };
                c.name = r.name;
                c.isDefault = !!r.is_default;
                c.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || 0;
                return c;
            }
        },
        // V40.21.0: metas (tb_goals_db)
        metas: {
            row: function (g) {
                var unit = has(GOAL_UNITS, g.unit) ? String(g.unit) : 'vezes';
                return {
                    id: String(g.id),
                    list_id: g.listId != null && SAFE_ID.test(String(g.listId)) ? String(g.listId) : null,
                    title: str(g.title, 200),
                    emoji: str(g.emoji, 16),
                    period: has(GOAL_PERIODS, g.period) ? String(g.period) : 'dia',
                    unit: unit,
                    target: goalNum(g.target, GOAL_UNITS[unit][1]),
                    step: goalNum(g.step, GOAL_UNITS[unit][0]),
                    created_ms: msOrNull(g.createdAt),
                    count_from: validDate(String(g.countFrom || '')) ? String(g.countFrom) : null // V40.34.0: recomeçou a contagem (os blocos de antes não contam)
                };
            },
            item: function (r, prev) {
                var g = prev ? Object.assign({}, prev) : { id: r.id };
                g.listId = r.list_id || null;
                g.title = r.title;
                g.emoji = r.emoji;
                g.period = r.period;
                g.unit = r.unit;
                g.target = r.target;
                g.step = r.step;
                g.createdAt = r.created_ms != null ? Number(r.created_ms) : (prev && prev.createdAt) || 0;
                if (r.count_from && validDate(String(r.count_from))) g.countFrom = String(r.count_from); else delete g.countFrom; // V40.34.0
                return g;
            }
        },
        // V40.21.0: o que foi feito em cada dia (tb_goal_days). target = alvo da meta quando foi marcado.
        metas_dias: {
            row: function (d) {
                var date = String(d.date || '').slice(0, 10);
                if (!validDate(date) || d.goalId == null || !SAFE_ID.test(String(d.goalId))) return null; // fica só no aparelho
                return { id: String(d.id), goal_id: String(d.goalId), date: date, amount: dayAmount(d.amount), target: goalNum(d.target, null) };
            },
            item: function (r, prev) {
                var d = prev ? Object.assign({}, prev) : { id: r.id };
                d.goalId = r.goal_id;
                d.date = r.date;
                d.amount = r.amount;
                if (r.target != null) d.target = r.target; else delete d.target;
                return d;
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
                c.cards = safeCards(c.cards); // V40.24.0
            }
            if (kind === 'rotinas') {
                c.title = str(c.title, 200);
                c.emoji = str(c.emoji, 16);
                c.duration = clampInt(c.duration, 60, 0, 1440);
                if (!WORD.test(String(c.theme))) c.theme = 'focus';
                c.created_ms = msOrNull(c.created_ms);
            }
            if (kind === 'notas') {
                c.title = str(c.title, 500);
                c.content = str(c.content, 100000);
                c.created_ms = msOrNull(c.created_ms);
                c.updated_ms = msOrNull(c.updated_ms);
            }
            if (kind === 'financas') {
                if (!MONTH.test(String(c.start_month))) return;
                c.title = str(c.title, 200);
                c.amount = money(c.amount);
                c.duration_months = clampInt(c.duration_months, 1, 1, 1200);
                c.is_recurring = !!c.is_recurring;
                c.due_day = dueDay(c.due_day);
                c.paid_months = cleanMonths(c.paid_months);
                c.amount_overrides = cleanOverrides(c.amount_overrides);
                c.created_ms = msOrNull(c.created_ms);
            }
            if (kind === 'metas_listas') {
                c.name = str(c.name, 100);
                c.created_ms = msOrNull(c.created_ms);
            }
            if (kind === 'metas') {
                c.list_id = c.list_id != null && SAFE_ID.test(String(c.list_id)) ? String(c.list_id) : null;
                c.title = str(c.title, 200);
                c.emoji = str(c.emoji, 16);
                if (!has(GOAL_PERIODS, c.period)) c.period = 'dia';
                if (!has(GOAL_UNITS, c.unit)) c.unit = 'vezes';
                c.target = goalNum(c.target, GOAL_UNITS[c.unit][1]);
                c.step = goalNum(c.step, GOAL_UNITS[c.unit][0]);
                c.created_ms = msOrNull(c.created_ms);
            }
            if (kind === 'metas_dias') {
                c.date = String(c.date || '').slice(0, 10);
                if (!validDate(c.date) || c.goal_id == null || !SAFE_ID.test(String(c.goal_id))) return;
                c.goal_id = String(c.goal_id);
                c.amount = dayAmount(c.amount);
                c.target = goalNum(c.target, null);
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
        if (ORDERED[kind]) {
            // Arquivado não aparece nas listas: não entra na ordenação e mantém a posição que tinha.
            var live = ordered.filter(function (r) { return !r.archived; });
            var pos = assignPositions(live.map(function (r) {
                var b = baseRows[r.id];
                return b && !b.deleted ? b.position : undefined;
            }));
            var maxPos = 0;
            live.forEach(function (r, i) { r.position = pos[i]; if (pos[i] > maxPos) maxPos = pos[i]; });
            ordered.forEach(function (r) {
                if (!r.archived) return;
                var b = baseRows[r.id];
                r.position = (b && Number.isFinite(b.position)) ? b.position : (maxPos += STEP);
            });
        }
        ordered.forEach(function (r) {
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
            // Sumiu daqui = apagado aqui. (Desde a V40.9.0 os arquivados são itens locais de verdade,
            // guardados em tb_archive_db; quem vinha da V40.8.0 é migrado antes de planejar.)
            if (!l && b) l = Object.assign({}, b, { deleted: true });
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

        // V40.21.0: idem pras listas de metas padrão (intactas e sem meta), quando a nuvem já tem listas de metas.
        var droppedGoalLists = 0;
        if ((firstSync || !(opts.base && opts.base.metas_listas)) && aliveCount(remote.metas_listas) > 0) {
            var usedLists = {};
            local.metas.forEach(function (g) { if (g && g.listId != null) usedLists[String(g.listId)] = true; });
            local.metas_listas = local.metas_listas.filter(function (c) {
                var name = c && has(DEFAULT_GOAL_LISTS, c.id) && DEFAULT_GOAL_LISTS[c.id];
                if (name && c.name === name && !usedLists[c.id] && !remote.metas_listas[c.id]) { droppedGoalLists++; return false; }
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
        // V40.17.0: rotina ou despesa com tag apagada fica sem tag (igual à tarefa)
        ['rotinas', 'financas'].forEach(function (k) {
            Object.keys(merged[k]).forEach(function (id) {
                var r = merged[k][id];
                if (!r.deleted && r.tag_id && !aliveTags[r.tag_id]) { r.tag_id = null; repaired++; }
            });
        });

        // V40.21.0: meta numa lista de metas apagada vai pra primeira lista; o dia de uma meta apagada é apagado junto.
        var goalLists = Object.keys(merged.metas_listas).map(function (id) { return merged.metas_listas[id]; })
            .filter(function (r) { return !r.deleted; }).sort(byPos);
        if (goalLists.length) {
            var aliveGL = {};
            goalLists.forEach(function (r) { aliveGL[r.id] = true; });
            Object.keys(merged.metas).forEach(function (id) {
                var r = merged.metas[id];
                if (!r.deleted && !aliveGL[r.list_id]) { r.list_id = goalLists[0].id; repaired++; }
            });
        }
        Object.keys(merged.metas_dias).forEach(function (id) {
            var r = merged.metas_dias[id], g = merged.metas[r.goal_id];
            if (!r.deleted && g && g.deleted) r.deleted = true;
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
                if ((!!l) !== (!m.deleted) || (l && !sameRow(k, m, l))) changed[k] = true; // 'archived' conta como campo
            });
        });
        if (droppedDefaults.length) changed.tags = true;
        if (droppedSeeds) changed.blocos = true;
        if (droppedGoalLists) changed.metas_listas = true;

        return { merged: merged, push: push, changed: changed, droppedDefaults: droppedDefaults, droppedSeeds: droppedSeeds, droppedGoalLists: droppedGoalLists, repaired: repaired, dups: totalDups, skipped: skipped, localOnly: localOnly };
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
        } else if (NEWEST_FIRST[kind]) {
            // V40.17.0: rotinas e notas, das mais novas pras mais antigas (é como o app cria e mostra)
            out = alive.sort(byNewest).map(function (r) { return MAP[kind].item(r, prevById[r.id]); });
        } else {
            // mantém a ordem que o app já tinha; o que é novo entra no fim (agenda: por dia e horário)
            (prevItems || []).forEach(function (it) {
                var id = it && it.id != null ? String(it.id) : null, r = id && mergedRows[id];
                if (r && !r.deleted && !r.archived && !done[id]) { done[id] = true; out.push(MAP[kind].item(r, prevById[id])); }
            });
            alive.filter(function (r) { return !done[r.id]; }).sort(kind === 'blocos' ? byDay : kind === 'metas_dias' ? byDate : byCreated)
                .forEach(function (r) { out.push(MAP[kind].item(r, null)); });
        }
        return out.concat(extras);
    }

    // Itens ARQUIVADOS (pra tb_archive_db) a partir das linhas mescladas.
    function materializeArchived(kind, mergedRows, prevItems) {
        var prevById = {};
        (prevItems || []).forEach(function (it) { if (it && it.id != null && !prevById[String(it.id)]) prevById[String(it.id)] = it; });
        return Object.keys(mergedRows).map(function (id) { return mergedRows[id]; })
            .filter(function (r) { return r.archived && !r.deleted; })
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

    // V40.32.0 — COR DO APP E HORÁRIO DO DIA, nos 2 sentidos (celular e PC). Não têm tabela: vão na conta
    // (user_metadata) como faz_theme, faz_hours ([início, fim]) e faz_prefs_at (quando mudou, em ms).
    // Ganha a mudança MAIS NOVA. O aparelho guarda em local.at a hora da última mudança que ele conhece.
    //   local = { theme, hours, at }   meta = user_metadata da conta   now = Date.now()
    // Volta { apply: {theme?, hours?} | null (o que vem da conta pro aparelho), push: dados pra conta | null,
    //         at: hora pra guardar no aparelho | 0 (não mexe) }.
    function prefTheme(c) { c = String(c || '').toLowerCase(); return /^#[0-9a-f]{6}$/.test(c) ? c : null; }
    function prefHours(h) {
        if (!Array.isArray(h) || h.length < 2) return null;
        var a = Number(h[0]), b = Number(h[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        a = Math.floor(a); b = Math.ceil(b);
        return a >= 0 && b <= 24 && a < b ? [a, b] : null;
    }
    function prefsPlan(local, meta, now) {
        meta = meta || {};
        var lt = num(local && local.at, 0) || 0, rt = num(meta.faz_prefs_at, 0) || 0;
        var lTheme = prefTheme(local && local.theme), lHours = prefHours(local && local.hours);
        var rTheme = prefTheme(meta.faz_theme), rHours = prefHours(meta.faz_hours);
        if (!lTheme || !lHours) return { apply: null, push: null, at: 0 }; // o aparelho ainda não tem o que mandar
        if (rTheme === lTheme && same(rHours, lHours)) { // iguais: só acerta as horas
            if (!rt) { var t0 = lt || now; return { apply: null, push: { faz_theme: lTheme, faz_hours: lHours, faz_prefs_at: t0 }, at: t0 }; } // conta antiga, sem a hora: carimba
            return { apply: null, push: null, at: rt !== lt ? rt : 0 };
        }
        if (rt > lt) { // mudou depois na conta (no PC ou em outro aparelho): vem pra cá
            var ap = {};
            if (rTheme && rTheme !== lTheme) ap.theme = rTheme;
            if (rHours && !same(rHours, lHours)) ap.hours = rHours;
            var whole = !!(rTheme && rHours); // conta sem cor ou sem horário: depois de aplicar, completa com o daqui
            return { apply: (ap.theme || ap.hours) ? ap : null, push: whole ? null : { faz_theme: rTheme || lTheme, faz_hours: rHours || lHours, faz_prefs_at: rt }, at: rt };
        }
        var t = lt > rt ? lt : Math.max(now, rt + 1); // mudou aqui por último (ou a conta é de antes desta versão): vai pra conta, sempre mais nova
        return { apply: null, push: { faz_theme: lTheme, faz_hours: lHours, faz_prefs_at: t }, at: t };
    }

    // V40.41.0 — PERÍODOS (Manhã, Tarde...) nos 2 sentidos (celular e PC). Também vão na conta, como a cor do app:
    // faz_periods (a lista: { id, name, start 'HH:MM', end 'HH:MM' }) e faz_periods_at (quando mudou, em ms), com a
    // hora deles (mudar a cor num aparelho não desfaz o período criado no outro). Ganha a mudança MAIS NOVA, menos na
    // primeira vez deste aparelho (sem hora) com a conta já tendo períodos (criados no PC): aí junta os dois, pra os
    // períodos que a pessoa fez aqui não sumirem (se aqui só tem os padrão, vale a conta).
    //   local = { list, at }   meta = user_metadata da conta   now = Date.now()
    // Volta { apply: lista | null (vem da conta pro aparelho), push: dados pra conta | null, at: hora pra guardar | 0 }.
    var PERIODS_MAX = 30;
    var DEFAULT_PERIODS = [
        { id: 'p1', name: 'Manhã', start: '08:00', end: '12:00' }, { id: 'p2', name: 'Meio-dia', start: '12:00', end: '13:00' },
        { id: 'p3', name: 'Tarde', start: '13:00', end: '18:00' }, { id: 'p4', name: 'Noite', start: '18:00', end: '22:00' }
    ];
    function periodClock(v) {
        var m = /^(\d{1,2}):(\d{2})$/.exec(String(v == null ? '' : v).trim());
        if (!m || +m[1] > 23 || +m[2] > 59) return null;
        return (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2];
    }
    // Só o que é período de verdade: id e nome (texto), início e fim "HH:MM"; sem id repetido; no máximo 30. null = não é lista.
    function cleanPeriods(list) {
        if (!Array.isArray(list)) return null;
        var out = [], seen = {};
        list.forEach(function (p) {
            if (!p || typeof p !== 'object' || Array.isArray(p) || out.length >= PERIODS_MAX) return;
            var id = typeof p.id === 'string' || typeof p.id === 'number' ? String(p.id).replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64) : ''; // vai num onclick no celular: só letra, número, _ . -
            var name = typeof p.name === 'string' ? p.name.trim().slice(0, 60) : '';
            var st = periodClock(p.start), en = periodClock(p.end);
            if (!id || has(seen, id) || !name || st === null || en === null) return;
            seen[id] = 1;
            out.push({ id: id, name: name, start: st, end: en });
        });
        return out;
    }
    function periodsPlan(local, meta, now) {
        meta = meta || {};
        var lt = num(local && local.at, 0) || 0, rt = num(meta.faz_periods_at, 0) || 0;
        var l = cleanPeriods(local && local.list), r = cleanPeriods(meta.faz_periods);
        if (!l) return { apply: null, push: null, at: 0 }; // o aparelho ainda não tem o que mandar
        if (r && same(l, r)) { // iguais: só acerta as horas
            if (!rt) { var t0 = lt || now; return { apply: null, push: { faz_periods: l, faz_periods_at: t0 }, at: t0 }; }
            return { apply: null, push: null, at: rt !== lt ? rt : 0 };
        }
        if (!r || !rt) { // a conta ainda não tem períodos (ou tem sem a hora): vão os daqui
            var t1 = lt > rt ? lt : Math.max(now, rt + 1);
            return { apply: null, push: { faz_periods: l, faz_periods_at: t1 }, at: t1 };
        }
        if (!lt) { // primeira vez deste aparelho e a conta já tem períodos: os da conta + os daqui que não estão lá
            if (same(l, DEFAULT_PERIODS)) return { apply: r, push: null, at: rt }; // aqui só tem os padrão: vale a conta
            // "Não está lá" = nome e horário (versões antigas do app tinham outros padrão com os mesmos ids p1..p4)
            var key = function (p) { return p.name + '|' + p.start + '|' + p.end; }, keys = {}, ids = {}, extra = [];
            r.forEach(function (p) { keys[key(p)] = 1; ids[p.id] = 1; });
            l.forEach(function (p) {
                if (has(keys, key(p))) return;
                var id = p.id, n = 1;
                while (has(ids, id)) id = p.id.slice(0, 56) + '_' + (++n); // id repetido com outro conteúdo: ganha um id novo
                keys[key(p)] = 1; ids[id] = 1;
                extra.push({ id: id, name: p.name, start: p.start, end: p.end });
            });
            if (!extra.length) return { apply: r, push: null, at: rt };
            var both = r.concat(extra).slice(0, PERIODS_MAX), t2 = Math.max(now, rt + 1);
            return { apply: both, push: { faz_periods: both, faz_periods_at: t2 }, at: t2 };
        }
        if (rt > lt) return { apply: r, push: null, at: rt }; // mudou depois na conta (no PC): vem pra cá
        var t = lt > rt ? lt : Math.max(now, rt + 1); // mudou aqui por último: vai pra conta, sempre mais nova
        return { apply: null, push: { faz_periods: l, faz_periods_at: t }, at: t };
    }

    // V40.43.0 — "SOLTAR AQUI" PELOS PERÍODOS (celular e PC). Divide um espaço livre [a, b) do dia (minutos, 0–1440)
    // nos períodos da pessoa: [{ a, b, id, name, band }]. Fora de período: id e name '' e band '' (campo neutro).
    // Período que passa da meia-noite (fim antes do início) vale do início até 24:00 e de 00:00 até o fim. Períodos que
    // se cruzam: vale o mais curto (o mais específico); empate, o primeiro da lista. O mesmo período seguido vira um
    // pedaço só. band = a cor, pela hora do dia: madrugada (antes das 6), manha (6 às 12),
    // meiodia (12 às 13), tarde (13 às 18), noite (18 em diante) — pelo MEIO do período ("Tarde" de 12:00 às 18:00 é
    // tarde; "Almoço" de 11:30 às 13:30 é meio-dia).
    function periodMin(v) { var c = periodClock(v); return c === null ? null : (+c.slice(0, 2)) * 60 + (+c.slice(3)); }
    function periodBand(min) { return min < 360 ? 'madrugada' : min < 720 ? 'manha' : min < 780 ? 'meiodia' : min < 1080 ? 'tarde' : 'noite'; }
    function periodSlots(a, b, periods) {
        a = Math.max(0, Math.min(1440, Math.round(Number(a) || 0)));
        b = Math.max(a, Math.min(1440, Math.round(Number(b) || 0)));
        var ranges = [];
        (cleanPeriods(periods) || []).forEach(function (p, i) {
            var s = periodMin(p.start), e = periodMin(p.end);
            if (s === e) return;
            var len = e > s ? e - s : 1440 - s + e, base = { p: p, len: len, i: i, band: periodBand(Math.floor(s + len / 2) % 1440) };
            if (e > s) ranges.push(Object.assign({ a: s, b: e }, base));
            else { ranges.push(Object.assign({ a: s, b: 1440 }, base)); if (e > 0) ranges.push(Object.assign({ a: 0, b: e }, base)); }
        });
        var cuts = [a, b];
        ranges.forEach(function (r) { [r.a, r.b].forEach(function (x) { if (x > a && x < b) cuts.push(x); }); });
        cuts.sort(function (x, y) { return x - y; });
        var out = [];
        for (var k = 0; k + 1 < cuts.length; k++) {
            var s = cuts[k], e = cuts[k + 1], best = null;
            if (e <= s) continue;
            ranges.forEach(function (r) { if (r.a <= s && r.b >= e && (!best || r.len < best.len || (r.len === best.len && r.i < best.i))) best = r; });
            var id = best ? best.p.id : '', last = out[out.length - 1];
            if (last && last.id === id && last.b === s) { last.b = e; continue; }
            out.push({ a: s, b: e, id: id, name: best ? best.p.name : '', band: best ? best.band : '' });
        }
        return out;
    }

    // V40.44.0 — "BLOCOS DE BAIXO ABREM ESPAÇO SOZINHOS" (escolhas dele em 24/11: "Soltar e esticar" e "Só o necessário").
    // A regra, a mesma no celular e no PC. Põe [from, to) no dia (a tarefa que entra, ou o pedaço a mais do bloco que
    // estica) e desce só o necessário: os blocos que começam em "from" ou depois e esbarram descem até encostar no de
    // cima; um vago que caiba segura o empurrão (dali pra baixo nada mexe). blocks: [{ id, start, dur }] do dia, SEM o
    // bloco que entra ou estica. Devolve { moves: [{ id, from, to }], end } (end = onde termina o último que desceu; sem
    // ninguém pra descer, moves vazio) ou null: um bloco atravessa "from" (não dá pra empurrar ele pra cima) ou alguém
    // passaria de dayEnd (o fim do dia).
    function pushNum(v) { var n = Math.round(Number(v)); return isFinite(n) ? n : NaN; }
    function pushList(blocks, from) {
        var list = [];
        (Array.isArray(blocks) ? blocks : []).forEach(function (b) {
            var s = pushNum(b && b.start), d = pushNum(b && b.dur);
            if (!(s >= 0) || !(d > 0) || s + d <= from) return; // acaba antes (ou encostado em cima): não mexe
            list.push({ id: b.id, s: s, d: d });
        });
        return list.sort(function (x, y) { return x.s - y.s || x.d - y.d; });
    }
    function pushPlan(blocks, from, to, dayEnd) {
        from = pushNum(from); to = pushNum(to); dayEnd = dayEnd == null ? 1440 : pushNum(dayEnd);
        if (!(from >= 0) || !(to > from) || !(to <= dayEnd)) return null;
        var list = pushList(blocks, from), cur = to, moves = [];
        for (var i = 0; i < list.length; i++) {
            var b = list[i];
            if (b.s < from) return null; // atravessa o ponto onde entra
            if (b.s >= cur) break; // vago que segura o resto
            moves.push({ id: b.id, from: b.s, to: cur });
            cur += b.d;
            if (cur > dayEnd) return null; // passaria do fim do dia
        }
        return { moves: moves, end: cur };
    }
    // Até onde dá pra esticar (ou o maior "to" que cabe) a partir de "from": o fim do dia menos os blocos que começam em
    // "from" ou depois (todos encostados no fim). null se um bloco atravessa "from".
    function pushRoom(blocks, from, dayEnd) {
        from = pushNum(from); dayEnd = dayEnd == null ? 1440 : pushNum(dayEnd);
        if (!(from >= 0)) return null;
        var list = pushList(blocks, from), sum = 0;
        for (var i = 0; i < list.length; i++) { if (list[i].s < from) return null; sum += list[i].d; }
        return dayEnd - sum;
    }

    return {
        periodSlots: periodSlots, periodBand: periodBand, // V40.43.0
        pushPlan: pushPlan, pushRoom: pushRoom, // V40.44.0
        DEFAULT_COL: DEFAULT_COL, STEP: STEP, KINDS: KINDS, ORDERED: ORDERED, FIELDS: FIELDS, DEFAULT_TAGS: DEFAULT_TAGS, MONTH: MONTH, DEFAULT_GOAL_LISTS: DEFAULT_GOAL_LISTS,
        cleanOverrides: cleanOverrides, cleanMonths: cleanMonths, safeCards: safeCards, MAX_CARDS: MAX_CARDS, // V40.24.0
        stable: stable, same: same, validDate: validDate, assignPositions: assignPositions, fixTies: fixTies,
        buildLocal: buildLocal, indexRows: indexRows, cleanRow: cleanRow, merge3: merge3, mergeKind: mergeKind,
        plan: plan, materialize: materialize, materializeArchived: materializeArchived, baseFrom: baseFrom, aliveCount: aliveCount, MAP: MAP,
        prefsPlan: prefsPlan, prefTheme: prefTheme, prefHours: prefHours, // V40.32.0
        periodsPlan: periodsPlan, cleanPeriods: cleanPeriods, DEFAULT_PERIODS: DEFAULT_PERIODS, PERIODS_MAX: PERIODS_MAX // V40.41.0
    };
});


/* ===========================================================================
 * COLA DO NAVEGADOR (só roda dentro do app; em Node é ignorada)
 * ======================================================================== */
(function () {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.FAZ_SYNC_CORE_ONLY) return; // V40.41.0: a tela do PC carrega só as regras (pro backup), nunca a sincronização do celular
    'use strict';

    var CORE = window.FazSyncCore;
    var CFG = window.FAZ_SUPABASE || {};
    var STATE_KEY = 'tb__sync';
    var LIB_URL = 'libs/supabase-js/supabase.js'; // V40.10.0: cópia local, versão travada (ver libs/README.md)
    var KINDS = CORE.KINDS;
    var SELECT = {
        tarefas: 'id,column_id,title,duration,tag_id,microblocks,position,color,archived,goal_id,deleted', // V40.34.0: + goal_id
        listas: 'id,name,is_default,position,created_ms,deleted',
        tags: 'id,name,color,position,deleted',
        blocos: 'id,date,start_min,duration,title,type,theme,tag_id,microblocks,completed,was_delayed,linked_note_ids,color,archived,cards,goal_id,column_id,deleted,updated_at', // V40.24.0: + cards (sublista); V40.34.0: + goal_id; V40.38.0: + column_id
        rotinas: 'id,title,emoji,duration,theme,tag_id,microblocks,created_ms,goal_id,deleted',
        notas: 'id,title,content,created_ms,updated_ms,deleted',
        financas: 'id,title,amount,start_month,duration_months,is_recurring,due_day,tag_id,paid_months,amount_overrides,created_ms,deleted',
        // V40.21.0: metas
        metas_listas: 'id,name,is_default,position,created_ms,deleted',
        metas: 'id,list_id,title,emoji,period,unit,target,step,position,created_ms,count_from,deleted', // V40.34.0: + count_from
        metas_dias: 'id,goal_id,date,amount,target,deleted,updated_at'
    };
    var GOAL_KINDS = ['metas_listas', 'metas', 'metas_dias'];
    // Lidos de forma incremental (só o que mudou desde a última rodada): o nome do cursor guardado em tb__sync.
    var INCREMENTAL = { blocos: 'cursorBlocos', metas_dias: 'cursorMetasDias' };
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

    function shownEl(el) { // nem ele nem nenhum pai escondido com a classe 'hidden'
        if (!el) return false;
        for (; el && el !== document.body; el = el.parentElement) if (el.classList && el.classList.contains('hidden')) return false;
        return true;
    }
    // O app está no meio de algo que um re-render atrapalharia? Então espera.
    function appBusy() {
        try {
            if (typeof _dragState !== 'undefined' && _dragState) return true;
            if (typeof mbDragActive !== 'undefined' && mbDragActive) return true;
            if (typeof subDrag !== 'undefined' && subDrag) return true; // V40.30.0: arrastando um cartão da sublista
            if (typeof blkDrag !== 'undefined' && blkDrag) return true; // V40.31.0: arrastando um bloco entre os dias
            if (typeof colDrag !== 'undefined' && colDrag) return true; // V40.33.0: arrastando uma lista pro lado
            if (typeof pendingIntent !== 'undefined' && pendingIntent) return true;
            if (typeof _moveCardPendingId !== 'undefined' && _moveCardPendingId) return true;
            var form = $('backlog-form-view');
            if (form && !form.classList.contains('hidden')) return true;
            // V40.17.0: formulário de rotina, nota ou despesa À VISTA (tela da Lista aberta, na aba dele) segura o
            // redesenho. Trocar de aba ou fechar a tela esconde a aba inteira sem fechar o formulário: aí não pode
            // travar, senão o celular pararia de sincronizar até alguém voltar naquela aba.
            var sheet = $('list-sheet');
            if (sheet && !sheet.classList.contains('translate-y-full')) {
                var forms = ['routines-form-view', 'financial-form-view', 'notes-form', 'goals-form-view']; // V40.21.0: + metas
                for (var f = 0; f < forms.length; f++) if (shownEl($(forms[f]))) return true;
            }
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
            // V40.34.0: campo de uma tela já fechada (translate-y-full) não conta: ninguém está digitando nele.
            // V40.36.1: nem campo de janelinha (ou parte da tela) escondida com .hidden.
            if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && !(a.closest && (a.closest('#config-sheet') || a.closest('.translate-y-full') || a.closest('.hidden')))) return true;
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

    // Listas, tags, tarefas, rotinas...: lê tudo (são pequenas). Agenda e dias das metas (V40.21.0): só o que mudou
    // desde a última rodada (30s de folga); o restante da nuvem é igual à base guardada neste aparelho.
    async function fetchAll(uid, st) {
        var out = {}, cursors = {};
        for (var i = 0; i < KINDS.length; i++) if (!INCREMENTAL[KINDS[i]]) out[KINDS[i]] = await fetchRows(KINDS[i], uid, 0);
        for (var k in INCREMENTAL) {
            var cursor = (st && st[INCREMENTAL[k]]) || 0;
            // V40.34.0: quem vem de antes guardou os blocos sem o goal_id (a versão antiga nem lia). Lê a agenda
            // inteira uma vez só: senão a meta que o PC ligou enquanto o celular estava na versão antiga não chega,
            // e mexer naquele bloco aqui mandaria goal_id vazio por cima dela.
            var incremental = !!(st && st.base && st.base[k] && cursor) && !(k === 'blocos' && !(st.goalIds && st.colIds)); // V40.38.0: + colIds (campo novo nos blocos: relê a agenda uma vez)
            var rows = await fetchRows(k, uid, incremental ? cursor - 30000 : 0);
            rows.forEach(function (r) { var t = Date.parse(r.updated_at); if (t > cursor) cursor = t; });
            if (incremental) {
                var byId = {}, base = st.base[k];
                Object.keys(base).forEach(function (id) { byId[id] = Object.assign({}, base[id], { id: id }); });
                rows.forEach(function (r) { byId[r.id] = r; });
                rows = Object.keys(byId).map(function (id) { return byId[id]; });
            }
            out[k] = rows;
            cursors[k] = cursor;
        }
        return { remote: out, cursors: cursors };
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
    // V40.17.0: rotinas, notas e finanças do aparelho (o app guarda em routinesDb, notesDb e financialDb)
    function localList(kind) {
        try {
            var a = kind === 'rotinas' ? routinesDb : kind === 'notas' ? notesDb : kind === 'financas' ? financialDb
                : kind === 'metas_listas' ? goalListsDb : kind === 'metas' ? goalsDb : kind === 'metas_dias' ? goalDaysDb : null;
            return Array.isArray(a) ? a : [];
        } catch (e) { return []; }
    }
    // V40.21.0: este app.js tem metas? (sempre tem: o cache troca os arquivos juntos). Se não tivesse, as metas da
    // nuvem não podem parecer "apagadas aqui": o aparelho fica com a base, sem subir nem aplicar nada delas.
    function hasGoals() {
        try { return Array.isArray(goalListsDb) && Array.isArray(goalsDb) && Array.isArray(goalDaysDb); } catch (e) { return false; }
    }
    // V40.9.0: arquivados (tb_archive_db) entram no sync como linhas com archived = true.
    function archList() {
        try { return (typeof archiveDb !== 'undefined' && Array.isArray(archiveDb)) ? archiveDb.filter(function (a) { return a && a.item && a.item.id != null; }) : []; } catch (e) { return []; }
    }
    function archItems(kind) {
        return archList().filter(function (a) { return a.kind === kind; }).map(function (a) { return Object.assign({}, a.item, { __archived: true }); });
    }
    // Quem vem da V40.8.0 pode ter arquivados só na base do sync (arquivados em outro aparelho).
    // Traz pra tb_archive_db uma única vez, antes de planejar, pra não parecerem "apagados aqui".
    function migrateArchived(st) {
        if (!st || !st.base || st.arch || typeof archiveDb === 'undefined') return;
        var have = {};
        archList().forEach(function (a) { have[a.kind + '|' + a.item.id] = true; });
        [['tarefa', 'tarefas', backlogDb], ['bloco', 'blocos', localBlocks()]].forEach(function (x) {
            var rows = st.base[x[1]] || {}, live = {};
            x[2].forEach(function (it) { if (it && it.id != null) live[String(it.id)] = true; });
            Object.keys(rows).forEach(function (id) {
                var r = rows[id];
                if (r && r.archived && !r.deleted && !live[id] && !have[x[0] + '|' + id]) {
                    archiveDb.push({ kind: x[0], archivedAt: Date.now(), item: CORE.MAP[x[1]].item(CORE.cleanRow(x[1], Object.assign({}, r, { id: id })), null) });
                }
            });
        });
        applying = true;
        try { saveArchive(); } finally { applying = false; }
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
            'Rotinas, notas e finanças também vão juntas (' + localList('rotinas').length + ', ' + localList('notas').length + ' e ' +
            localList('financas').length + ' neste aparelho).\n' +
            (localList('metas').length ? 'Metas também (' + localList('metas').length + ' neste aparelho).\n' : '') +
            'Dica: se quiser segurança extra, faça um backup antes (Config → Backup).\n\n' +
            'Continuar?';
    }

    function applyLocal(p) {
        applying = true;
        try {
            // V40.9.0: refaz o arquivo local quando tarefas/blocos mudaram (arquivar/desarquivar em outro aparelho)
            if ((p.changed.tarefas || p.changed.blocos) && typeof archiveDb !== 'undefined') {
                var prevArch = {}, next = [];
                archList().forEach(function (a) { prevArch[a.kind + '|' + a.item.id] = a; });
                [['tarefa', 'tarefas', backlogDb], ['bloco', 'blocos', localBlocks()]].forEach(function (x) {
                    var prevItems = archList().filter(function (a) { return a.kind === x[0]; }).map(function (a) { return a.item; }).concat(x[2]);
                    CORE.materializeArchived(x[1], p.merged[x[1]], prevItems).forEach(function (it) {
                        var old = prevArch[x[0] + '|' + it.id];
                        if (x[0] === 'bloco') it.expanded = false;
                        next.push({ kind: x[0], archivedAt: old ? old.archivedAt : Date.now(), item: it });
                    });
                });
                next.sort(function (a, b) { return b.archivedAt - a.archivedAt; });
                archiveDb = next;
                saveArchive();
            }
            if (p.changed.tarefas) { backlogDb = CORE.materialize('tarefas', p.merged.tarefas, backlogDb, p.localOnly.tarefas); saveBacklog(); }
            if (p.changed.listas) { backlogColumnsDb = CORE.materialize('listas', p.merged.listas, backlogColumnsDb, p.localOnly.listas); saveBacklogColumns(); }
            if (p.changed.tags) { tagsDb = CORE.materialize('tags', p.merged.tags, tagsDb, p.localOnly.tags); saveTags(); }
            if (p.changed.blocos) { db = CORE.materialize('blocos', p.merged.blocos, db, p.localOnly.blocos); saveDb(); }
            // V40.17.0: rotinas, notas e finanças
            if (p.changed.rotinas) { routinesDb = CORE.materialize('rotinas', p.merged.rotinas, localList('rotinas'), p.localOnly.rotinas); saveRoutinesDb(); }
            if (p.changed.notas) { notesDb = CORE.materialize('notas', p.merged.notas, localList('notas'), p.localOnly.notas); saveNotes(); }
            if (p.changed.financas) { financialDb = CORE.materialize('financas', p.merged.financas, localList('financas'), p.localOnly.financas); saveFinancial(); }
            // V40.21.0: metas
            if (!p.noGoals) {
                if (p.changed.metas_listas) { goalListsDb = CORE.materialize('metas_listas', p.merged.metas_listas, localList('metas_listas'), p.localOnly.metas_listas); saveGoalLists(); }
                if (p.changed.metas) { goalsDb = CORE.materialize('metas', p.merged.metas, localList('metas'), p.localOnly.metas); saveGoals(); }
                if (p.changed.metas_dias) { goalDaysDb = CORE.materialize('metas_dias', p.merged.metas_dias, localList('metas_dias'), p.localOnly.metas_dias); saveGoalDays(); }
            }
        } finally {
            applying = false;
        }
        if (p.changed.rotinas) { try { if (typeof renderRoutinesList === 'function') renderRoutinesList(); } catch (e) { console.warn('[FazSync] rotinas', e); } }
        if (p.changed.notas) { try { if (typeof renderNotes === 'function') renderNotes(); } catch (e) { console.warn('[FazSync] notas', e); } }
        if (p.changed.financas) { try { if (typeof renderFinancial === 'function') renderFinancial(); } catch (e) { console.warn('[FazSync] finanças', e); } }
        if (!p.noGoals && (p.changed.metas_listas || p.changed.metas || p.changed.metas_dias || p.changed.blocos)) { try { if (typeof renderGoals === 'function') renderGoals(); } catch (e) { console.warn('[FazSync] metas', e); } } // V40.34.0: bloco ligado concluído conta na meta
        try { if (typeof ensureDefaultColumn === 'function') ensureDefaultColumn(); } catch (e) {}
        try {
            if (typeof activeColumnId !== 'undefined' && !backlogColumnsDb.some(function (c) { return c.id === activeColumnId; })) {
                activeColumnId = 'col_geral';
            }
        } catch (e) {}
        try { if (typeof renderBacklog === 'function') renderBacklog(); } catch (e) { console.warn('[FazSync] render', e); }
        try { if (typeof renderArchive === 'function') renderArchive(); } catch (e) {}
        if (p.changed.tags || p.changed.blocos || p.changed.notas) { // nota mudou: o título dela aparece nos cartões da agenda
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
            if (!firstSync) migrateArchived(st);
            var fetched = await fetchAll(uid, firstSync ? null : st);
            var remote = fetched.remote;

            // Daqui até applyLocal é tudo síncrono: nenhuma ação do usuário entra no meio.
            if (appBusy()) { again = true; return; }
            var novosTipos = !firstSync && !st.base.rotinas; // V40.17.0: 1ª rodada com rotinas, notas e finanças
            var local = {
                tarefas: backlogDb.concat(archItems('tarefa')), listas: backlogColumnsDb, tags: tagsDb, blocos: localBlocks().concat(archItems('bloco')),
                rotinas: localList('rotinas'), notas: localList('notas'), financas: localList('financas')
            };
            var noGoals = !hasGoals();
            GOAL_KINDS.forEach(function (k) { // V40.21.0
                local[k] = !noGoals ? localList(k) : CORE.materialize(k, (!firstSync && st.base[k]) || {}, [], {});
            });
            var p = CORE.plan({
                local: local,
                base: firstSync ? null : st.base,
                remote: remote,
                firstSync: firstSync,
                usedTagIds: usedTagIds()
            });
            p.noGoals = noGoals;
            if (firstSync && !confirm(firstSyncText(remote))) {
                await window.fazSyncLogout(true);
                toast('Sincronização cancelada');
                return;
            }
            if (KINDS.some(function (k) { return p.changed[k]; })) applyLocal(p);

            await pushAll(uid, p.push);
            writeState({ v: 1, userId: uid, email: session.user.email || '', base: CORE.baseFrom(p.merged), cursorBlocos: fetched.cursors.blocos, cursorMetasDias: fetched.cursors.metas_dias, arch: 1, goalIds: 1, colIds: 1, lastSyncAt: Date.now() }); // goalIds: V40.34.0; colIds: V40.38.0
            lastError = null;
            if (manual || firstSync) toast('Sincronizado ✅');
            else if (novosTipos) toast('☁️ Rotinas, notas e finanças agora também vão pro computador');
            await syncPrefs(manual); // V40.32.0: cor e horário do dia (nos 2 sentidos)
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

    // A cor do tema e a janela do dia (ex.: 7 → 24) vão na conta (sem tabela): o PC abre com a mesma cor e o
    // mesmo horário. V40.32.0: nos 2 sentidos — o PC também muda. Ganha a mudança mais nova (CORE.prefsPlan).
    // A sessão guardada no aparelho pode ter os dados da conta velhos: de vez em quando (e ao voltar pro app,
    // ou no Sincronizar agora) lê de novo da nuvem com getUser().
    var PREFS_CHECK_MS = 120000, prefsChecked = { uid: null, at: 0 }, prefsFresh = true;
    async function syncPrefs(manual) {
        try {
            if (typeof window.fazPrefs !== 'function' || !session || !sb) return;
            var uid = session.user.id;
            var meta = (session.user && session.user.user_metadata) || {};
            if (manual || prefsFresh || prefsChecked.uid !== uid || Date.now() - prefsChecked.at >= PREFS_CHECK_MS) {
                var r = await sb.auth.getUser();
                var u = r && r.data && r.data.user;
                if (!session || session.user.id !== uid) return; // saiu da conta no meio
                if (u && u.id === uid) {
                    meta = u.user_metadata || {};
                    session.user.user_metadata = meta;
                    prefsChecked = { uid: uid, at: Date.now() };
                    prefsFresh = false;
                }
            }
            if (appBusy()) return; // arrastando ou com formulário aberto: fica pra próxima rodada
            var p = CORE.prefsPlan(window.fazPrefs(), meta, Date.now()), msg = '';
            if (p.apply && typeof window.fazApplyPrefs === 'function') {
                var did = window.fazApplyPrefs(p.apply);
                if (did.theme && did.hours) msg = 'Cor e horário do dia mudaram no outro aparelho';
                else if (did.theme) msg = 'Cor do app mudou no outro aparelho 🎨';
                else if (did.hours) msg = 'Horário do dia mudou no outro aparelho: ' + did.hours;
            }
            if (p.at && typeof window.fazSetPrefsAt === 'function') window.fazSetPrefsAt(p.at);
            // V40.41.0: os períodos (Manhã, Tarde...), com a hora deles (CORE.periodsPlan)
            var q = typeof window.fazPeriods === 'function' ? CORE.periodsPlan(window.fazPeriods(), meta, Date.now()) : { apply: null, push: null, at: 0 };
            if (q.apply && typeof window.fazApplyPeriods === 'function' && window.fazApplyPeriods(q.apply)) {
                msg = msg ? 'Cor, horário ou períodos mudaram no outro aparelho' : 'Períodos mudaram no outro aparelho';
            }
            if (q.at && typeof window.fazSetPeriodsAt === 'function') window.fazSetPeriodsAt(q.at);
            if (msg) toast(msg);
            var push = p.push || q.push ? Object.assign({}, p.push || {}, q.push || {}) : null; // uma gravação só na conta
            if (push) {
                var res = await sb.auth.updateUser({ data: push });
                if (res && res.error) throw res.error;
                if (session && session.user && session.user.id === uid) session.user.user_metadata = Object.assign({}, meta, push);
            }
        } catch (e) { console.warn('[FazSync] cor/horário', e); }
    }

    // Chamado pelo app.js depois de salvar Listas/colunas/tags.
    window.fazSyncNotify = function () {
        if (applying || !session) return;
        schedule(2500);
    };
    // V40.25.0: o Desfazer do app pergunta isto pra não transformar o que veio da nuvem num passo seu.
    window.fazSyncApplying = function () { return applying; };

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
        if (menu) menu.textContent = !configured ? 'Em breve' : logged ? 'Conectado como ' + ((session.user && session.user.email) || '') : 'Listas, Agenda, Rotinas, Notas e Finanças no computador';
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

    // V40.42.0: a conta pros avisos dos compromissos (avisos.js): { sb, uid, token } ou null (sem conta / sem nuvem)
    window.fazSyncConta = function () {
        if (!configured) return Promise.resolve(null);
        return ensureClient().then(function (c) { return c.auth.getSession(); }).then(function (r) {
            var s = r && r.data && r.data.session;
            return s && s.user && s.access_token ? { sb: sb, uid: s.user.id, token: s.access_token } : null;
        }).catch(function () { return null; });
    };

    window.fazSyncLogout = async function (silent) {
        if (silent !== true && !confirm('Sair da conta?\n\nSeus dados continuam neste aparelho, só param de sincronizar.')) return;
        clearTimeout(debounceT);
        try { if (window.FazAvisos) await window.FazAvisos.esquecer(); } catch (e) {} // V40.42.0: os avisos deste aparelho eram da conta que está saindo
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
                prefsFresh = true; // V40.32.0: voltou pro app: confere se a cor ou o horário mudaram no PC
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
