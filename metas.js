/* ===========================================================================
 * Faz / TimeBlock — METAS (V40.21.0, etapa 1; V40.34.0, etapa 2: blocos ligados e gráfico)
 * ---------------------------------------------------------------------------
 * As regras das metas num lugar só, iguais no celular, no PC e no Assistente:
 * período (dia, semana ou mês), progresso, estrelas, sequência, pontos e nível.
 * Núcleo puro (não mexe na tela nem no localStorage). Testável em Node.
 *
 * Formato que as telas entregam:
 *   lista { id, name }   (na tela, desde a V40.23.0, se chama "categoria": Pessoal, Profissional, Financeiro...)
 *   meta  { id, listId, title, emoji, period 'dia'|'semana'|'mes', unit 'vezes'|'minutos'|'reais', target, step, countFrom? }
 *         countFrom (V40.34.0) = dia em que a contagem recomeçou (mudou frequência ou medida): bloco de antes não conta
 *   dia   { id, goalId, date 'YYYY-MM-DD', amount, target }
 *         o quanto foi feito naquele dia; id = <meta>_<AAAAMMDD>; target = o alvo da meta quando foi marcado
 *
 * Regras:
 *   - Semana vai de segunda a domingo; mês é o do calendário.
 *   - Estrela: cada período em que o total chegou no alvo. O período de agora usa o alvo de agora; os que já
 *     passaram usam o alvo que valia na época (guardado em cada dia). Assim, subir o alvo não tira estrela antiga.
 *   - Sequência: períodos seguidos cumpridos até o atual (o atual, ainda em andamento, não quebra a sequência).
 *   - Pontos: estrela diária 10, semanal 50, mensal 200.
 *   - Nível n começa em 25·(n−1)·(n+2) pontos: 0, 100, 250, 450, 700, 1000...
 *   - Apagar uma meta tira as estrelas dela da conta (a tela avisa antes).
 *
 * Etapa 2 (V40.34.0): bloco da agenda (e cartão da sublista) ligado a uma meta (goalId) conta quando concluído,
 * no dia dele, como um toque no "+" (em meta de minutos, conta o tempo dele). Não grava nada: autoDays() monta
 * "dias de mentira" a partir dos blocos e as telas somam com os dias de verdade (withAuto). Arquivado continua
 * contando; apagado deixa de contar. Mudou o alvo? targetMarks() guarda o alvo antigo nos períodos que já
 * passaram e só tinham blocos (senão subir o alvo tiraria estrela antiga). history() dá as barras do gráfico.
 * ======================================================================== */

(function (root, factory) {
    var core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core; // Node (testes)
    else root.FazMetas = core;                                               // navegador
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var DEFAULT_LISTS = [
        { id: 'gl_pessoal', name: 'Pessoal' },
        { id: 'gl_profissional', name: 'Profissional' },
        { id: 'gl_financeiro', name: 'Financeiro' }
    ];
    var PERIODS = {
        dia: { label: 'Diária', per: 'por dia', now: 'hoje', points: 10, one: 'dia seguido', many: 'dias seguidos' },
        semana: { label: 'Semanal', per: 'por semana', now: 'nesta semana', points: 50, one: 'semana seguida', many: 'semanas seguidas' },
        mes: { label: 'Mensal', per: 'por mês', now: 'neste mês', points: 200, one: 'mês seguido', many: 'meses seguidos' }
    };
    var UNITS = {
        vezes: { label: 'Vezes', step: 1, target: 1 },
        minutos: { label: 'Minutos', step: 15, target: 30 },
        reais: { label: 'Reais', step: 50, target: 500 }
    };
    var LEVELS = ['Iniciante', 'Aprendiz', 'Constante', 'Focado', 'Disciplinado', 'Determinado', 'Imparável', 'Mestre', 'Lenda'];
    // Sugestões pra começar rápido (só ao criar uma meta nova)
    var TEMPLATES = [
        { emoji: '💧', title: 'Beber água', period: 'dia', unit: 'vezes', target: 8, step: 1, listId: 'gl_pessoal' },
        { emoji: '🏃', title: 'Correr', period: 'semana', unit: 'vezes', target: 3, step: 1, listId: 'gl_pessoal' },
        { emoji: '🧘', title: 'Meditar', period: 'dia', unit: 'minutos', target: 15, step: 5, listId: 'gl_pessoal' },
        { emoji: '🏋️', title: 'Exercício', period: 'semana', unit: 'vezes', target: 4, step: 1, listId: 'gl_pessoal' },
        { emoji: '📚', title: 'Ler', period: 'dia', unit: 'minutos', target: 30, step: 15, listId: 'gl_pessoal' },
        { emoji: '🎯', title: 'Horas de foco', period: 'dia', unit: 'minutos', target: 120, step: 30, listId: 'gl_profissional' },
        { emoji: '💰', title: 'Guardar dinheiro', period: 'mes', unit: 'reais', target: 500, step: 50, listId: 'gl_financeiro' }
    ];
    var MAX = 1e9; // mesmo limite dos CHECKs da nuvem (alvo, passo e valor do dia)
    function own(o, k) { return k != null && Object.prototype.hasOwnProperty.call(o, String(k)); } // 'constructor' & cia não valem
    var EPS = 1e-9;

    // ---------- datas ----------
    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dateOf(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2] || 1); }
    function addDays(s, n) { var d = dateOf(s); d.setDate(d.getDate() + n); return ymd(d); }
    function monday(s) { var d = dateOf(s); return addDays(s, -((d.getDay() + 6) % 7)); }
    function isDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
    function periodKey(period, day) { // dia: '2026-11-16'; semana: a segunda ('2026-11-16'); mês: '2026-11'
        if (period === 'semana') return monday(day);
        if (period === 'mes') return String(day).slice(0, 7);
        return String(day).slice(0, 10);
    }
    function prevKey(period, key) {
        if (period === 'semana') return addDays(key, -7);
        if (period === 'mes') { var p = key.split('-').map(Number), d = new Date(p[0], p[1] - 2, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
        return addDays(key, -1);
    }
    function dayId(goalId, day) { return String(goalId) + '_' + String(day).replace(/-/g, ''); }

    // ---------- números e textos ----------
    function round2(n) { return Math.round(n * 100) / 100; }
    function pos(v, def) { var n = Number(v), r = Number.isFinite(n) ? Math.min(MAX, round2(n)) : 0; return r > 0 ? r : def; }
    function normalize(g) { // meta com valores válidos (o que vier estranho vira o padrão)
        var unit = own(UNITS, g && g.unit) ? g.unit : 'vezes', period = own(PERIODS, g && g.period) ? g.period : 'dia';
        return Object.assign({}, g, { unit: unit, period: period, target: pos(g && g.target, UNITS[unit].target), step: pos(g && g.step, UNITS[unit].step) });
    }
    function brl(n) {
        var v = round2(Number(n) || 0), s = Math.abs(v).toFixed(2).split('.');
        return (v < 0 ? '-' : '') + 'R$ ' + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1];
    }
    function mins(m) { m = Math.round(Number(m) || 0); var h = Math.floor(m / 60), r = m % 60; return h && r ? h + 'h ' + r + 'm' : h ? h + 'h' : r + 'm'; }
    function num(n) { return String(round2(Number(n) || 0)).replace('.', ','); }
    function fmt(unit, n) { // "1 vez", "3 vezes", "1h 30m", "R$ 50,00"
        if (unit === 'minutos') return mins(n);
        if (unit === 'reais') return brl(n);
        var v = num(n);
        return v + (v === '1' ? ' vez' : ' vezes');
    }
    function fmtOf(unit, done, target) { // "6 de 8", "45m de 1h", "R$ 300,00 de R$ 500,00"
        return unit === 'vezes' ? num(done) + ' de ' + num(target) : fmt(unit, done) + ' de ' + fmt(unit, target);
    }
    function addLabel(g) { // o que vai escrito no botão "+"
        g = normalize(g);
        return g.unit === 'minutos' ? '+' + mins(g.step) : g.unit === 'reais' ? '+' + brl(g.step).replace(',00', '') : '+' + num(g.step);
    }
    function goalLabel(g) { // "8 vezes por dia", "30m por dia", "R$ 500,00 por mês"
        g = normalize(g);
        return fmt(g.unit, g.target) + ' ' + PERIODS[g.period].per;
    }
    function streakLabel(period, n) { var p = own(PERIODS, period) ? PERIODS[period] : PERIODS.dia; return n + ' ' + (n === 1 ? p.one : p.many); }
    function firstGrapheme(s) { // o emoji da meta: só o primeiro "caractere" que a pessoa vê (🏋️‍♀️ conta como um)
        s = String(s == null ? '' : s).trim();
        if (!s) return '';
        try {
            if (typeof Intl !== 'undefined' && Intl.Segmenter) {
                var it = new Intl.Segmenter('pt', { granularity: 'grapheme' }).segment(s)[Symbol.iterator]().next();
                if (!it.done) return Array.from(String(it.value.segment)).slice(0, 8).join('');
            }
        } catch (e) {}
        return Array.from(s).slice(0, 1).join('');
    }

    // ---------- progresso ----------
    // { chaveDoPeríodo: { total, target (o guardado no dia mais recente daquele período), last } }
    // V40.34.0: o alvo vem do dia mais recente que guardou um alvo (mesmo com 0 feito: é a marca do targetMarks);
    // dia sem alvo (os dos blocos ligados) só soma.
    function sums(goal, days) {
        var g = normalize(goal), out = {};
        (days || []).forEach(function (d) {
            if (!d || String(d.goalId) !== String(g.id) || !isDay(d.date)) return;
            var a = Number(d.amount) || 0, t = Number(d.target), hasT = Number.isFinite(t) && t > 0;
            if (!(a > 0) && !hasT) return;
            var k = periodKey(g.period, d.date), s = out[k] || (out[k] = { total: 0, target: 0, last: '' });
            if (a > 0) s.total = round2(s.total + a);
            if (hasT && d.date >= s.last) { s.last = d.date; s.target = t; }
        });
        return out;
    }
    function status(goal, days, now) {
        var g = normalize(goal), s = sums(g, days), key = periodKey(g.period, ymd(now || new Date()));
        function met(k) { var x = s[k]; if (!x) return false; var t = k === key || !x.target ? g.target : x.target; return x.total >= t - EPS; }
        var total = s[key] ? s[key].total : 0, complete = met(key);
        var stars = Object.keys(s).filter(function (k) { return k <= key && met(k); }).length;
        var streak = 0, k = complete ? key : prevKey(g.period, key);
        for (var i = 0; i < 5000 && met(k); i++) { streak++; k = prevKey(g.period, k); }
        return {
            goal: g, key: key, total: total, target: g.target, complete: complete,
            pct: Math.max(0, Math.min(1, total / g.target)), remaining: Math.max(0, round2(g.target - total)),
            stars: stars, streak: streak, points: stars * PERIODS[g.period].points,
            text: fmtOf(g.unit, total, g.target) + ' ' + PERIODS[g.period].now
        };
    }
    function levelOf(points) {
        points = Math.max(0, Number(points) || 0);
        var n = 1;
        while (25 * n * (n + 3) <= points) n++; // o nível n+1 começa em 25·n·(n+3)
        var floor = 25 * (n - 1) * (n + 2), next = 25 * n * (n + 3);
        return {
            level: n, name: n <= LEVELS.length ? LEVELS[n - 1] : LEVELS[LEVELS.length - 1] + ' ' + (n - LEVELS.length + 1),
            floor: floor, next: next, toNext: next - points, pct: (points - floor) / (next - floor)
        };
    }
    function summary(goals, days, now) {
        var by = {};
        (days || []).forEach(function (d) { if (d && d.goalId != null) (by[d.goalId] || (by[d.goalId] = [])).push(d); });
        var list = (goals || []).map(function (g) { return status(g, by[g && g.id] || [], now); });
        var stars = 0, points = 0, due = 0, done = 0;
        list.forEach(function (s) { stars += s.stars; points += s.points; if (s.goal.period === 'dia') { due++; if (s.complete) done++; } });
        return Object.assign({ stars: stars, points: points, todayDone: done, todayTotal: due, statuses: list }, levelOf(points));
    }
    // ---------- V40.34.0: blocos e cartões ligados a uma meta ----------
    // Quanto um bloco (ou cartão) concluído vale na meta: um toque no "+"; em minutos, o tempo dele.
    function credit(goal, dur) {
        var g = normalize(goal);
        if (g.unit === 'minutos') { var m = Math.round(Number(dur) || 0); return m > 0 ? Math.min(MAX, m) : g.step; }
        return g.step;
    }
    // Os "dias de mentira" dos blocos: [{ goalId, date, amount, auto: true }], um por meta e dia (sem alvo).
    // blocks no formato do celular ({ date, goalId, completed, duration, cards }) — o PC converte antes.
    function autoDays(goals, blocks) {
        var byId = {}, acc = {}, order = [];
        (goals || []).forEach(function (g) { if (g && g.id != null) byId[String(g.id)] = g; });
        function add(goalId, date, dur) {
            var g = goalId != null && own(byId, goalId) ? byId[String(goalId)] : null;
            if (!g || !isDay(date)) return;
            if (g.countFrom && isDay(g.countFrom) && date < g.countFrom) return; // a contagem recomeçou depois disso
            var k = String(goalId) + '|' + date;
            if (!acc[k]) { acc[k] = { goalId: String(goalId), date: String(date).slice(0, 10), amount: 0, auto: true }; order.push(k); }
            acc[k].amount = Math.min(MAX, round2(acc[k].amount + credit(g, dur)));
        }
        (blocks || []).forEach(function (b) {
            if (!b) return;
            var date = String(b.date || '').slice(0, 10);
            if (b.completed && b.goalId) add(b.goalId, date, b.duration);
            if (Array.isArray(b.cards)) b.cards.forEach(function (c) { if (c && c.done && c.goalId) add(c.goalId, date, c.duration); });
        });
        return order.map(function (k) { return acc[k]; });
    }
    function withAuto(days, goals, blocks) { return (days || []).concat(autoDays(goals, blocks)); }
    // Antes de mudar o alvo de uma meta: os períodos que já passaram e só tinham blocos (nenhum dia guardou alvo)
    // ganham uma marca com o alvo antigo (feito 0), no último dia com bloco. Devolve as linhas pra gravar.
    function targetMarks(goalBefore, days, auto, now) {
        var g = normalize(goalBefore), cur = periodKey(g.period, ymd(now || new Date())), stored = {}, last = {}, rows = {};
        (days || []).forEach(function (d) {
            if (!d || String(d.goalId) !== String(g.id) || !isDay(d.date)) return;
            rows[d.id] = d;
            var t = Number(d.target);
            if (Number.isFinite(t) && t > 0) stored[periodKey(g.period, d.date)] = true;
        });
        (auto || []).forEach(function (d) {
            if (!d || String(d.goalId) !== String(g.id) || !isDay(d.date) || !(Number(d.amount) > 0)) return;
            var k = periodKey(g.period, d.date);
            if (k < cur && !stored[k] && (!last[k] || d.date > last[k])) last[k] = d.date;
        });
        return Object.keys(last).sort().map(function (k) {
            var id = dayId(g.id, last[k]), prev = rows[id];
            return { id: id, goalId: String(g.id), date: last[k], amount: prev ? Number(prev.amount) || 0 : 0, target: g.target };
        });
    }
    // Barras do gráfico: os últimos n períodos (padrão: 7 dias, 8 semanas ou 6 meses), do mais antigo pro de agora.
    var WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    function history(goal, days, now, n) {
        var g = normalize(goal), s = sums(g, days), key = periodKey(g.period, ymd(now || new Date()));
        n = n || (g.period === 'dia' ? 7 : g.period === 'semana' ? 8 : 6);
        var keys = [key];
        while (keys.length < n) keys.unshift(prevKey(g.period, keys[0]));
        return keys.map(function (k) {
            var x = s[k], total = x ? x.total : 0, t = k === key || !x || !x.target ? g.target : x.target, label, sub = '';
            if (g.period === 'dia') { var d = dateOf(k); label = WEEKDAYS[d.getDay()]; sub = String(d.getDate()); }
            else if (g.period === 'semana') { var w = dateOf(k); label = pad(w.getDate()) + '/' + pad(w.getMonth() + 1); }
            else { var p = k.split('-').map(Number); label = MONTHS[p[1] - 1]; sub = p[1] === 1 ? String(p[0]) : ''; }
            return { key: k, label: label, sub: sub, total: total, target: t, met: total >= t - EPS, current: k === key, text: fmtOf(g.unit, total, t) };
        });
    }
    // Melhor sequência de períodos cumpridos (de todos os tempos) e o total feito.
    function records(goal, days, now) {
        var g = normalize(goal), s = sums(g, days), key = periodKey(g.period, ymd(now || new Date()));
        function met(k) { var x = s[k]; if (!x) return false; var t = k === key || !x.target ? g.target : x.target; return x.total >= t - EPS; }
        var keys = Object.keys(s).filter(function (k) { return k <= key && met(k); }).sort(), best = 0, run = 0, prev = null, total = 0;
        keys.forEach(function (k) { run = prev !== null && prevKey(g.period, k) === prev ? run + 1 : 1; if (run > best) best = run; prev = k; });
        Object.keys(s).forEach(function (k) { if (k <= key) total = round2(total + s[k].total); });
        return { best: best, bestText: best ? streakLabel(g.period, best) : '', total: total, totalText: fmt(g.unit, total) };
    }

    // Soma (ou tira) no dia: devolve a lista nova de dias e a linha mexida. O total do dia nunca fica negativo.
    // A linha guarda o alvo de agora (é ele que vale pra esse período quando ele passar).
    function bump(days, goal, day, delta) {
        var g = normalize(goal), id = dayId(g.id, day), out = (days || []).slice(), i = -1;
        for (var j = 0; j < out.length; j++) if (out[j] && out[j].id === id) { i = j; break; }
        var cur = i >= 0 ? Number(out[i].amount) || 0 : 0, next = Math.max(0, Math.min(MAX, round2(cur + (Number(delta) || 0))));
        var row = { id: id, goalId: String(g.id), date: String(day).slice(0, 10), amount: next, target: g.target };
        if (i >= 0) out[i] = Object.assign({}, out[i], row); else out.push(row);
        return { days: out, row: row, changed: next !== cur };
    }
    // O que um "+" acabou de conquistar (pro aviso na tela). before/after = summary() antes e depois.
    function gain(before, after) {
        var up = after.level > before.level;
        return { star: after.stars > before.stars, points: after.points - before.points, level: up ? after.level : 0, levelName: up ? after.name : '' };
    }
    function gainText(gn) { // "🎉 Nível 4: Focado!" / "⭐ Meta cumprida! +10 pontos" / ''
        if (gn.level) return '🎉 Nível ' + gn.level + ': ' + gn.levelName + '!';
        if (gn.star) return '⭐ Meta cumprida! +' + gn.points + ' pontos';
        return '';
    }
    // Lista em que a meta aparece: a dela, ou a primeira (lista apagada em outro aparelho).
    function listOf(goal, lists) {
        var ids = (lists || []).map(function (l) { return l.id; });
        return goal && ids.indexOf(goal.listId) >= 0 ? goal.listId : (ids[0] || null);
    }
    // Retrato das metas pro Assistente (ele não conhece as regras: recebe tudo pronto).
    function forAssistant(lists, goals, days, now) {
        var names = {};
        (lists || []).forEach(function (l) { names[l.id] = l.name; });
        var sum = summary(goals, days, now);
        return {
            level: sum.level, name: sum.name, points: sum.points, stars: sum.stars, next: sum.next, toNext: sum.toNext,
            todayDone: sum.todayDone, todayTotal: sum.todayTotal,
            items: sum.statuses.map(function (s) {
                var g = s.goal;
                return {
                    id: g.id, title: g.title, emoji: g.emoji || '', list: names[listOf(g, lists)] || '', period: g.period,
                    complete: s.complete, text: s.text, left: s.complete ? '' : fmt(g.unit, s.remaining),
                    streak: s.streak, streakText: s.streak ? streakLabel(g.period, s.streak) : '', stars: s.stars
                };
            })
        };
    }

    return {
        DEFAULT_LISTS: DEFAULT_LISTS, PERIODS: PERIODS, UNITS: UNITS, LEVELS: LEVELS, TEMPLATES: TEMPLATES, MAX: MAX,
        normalize: normalize, periodKey: periodKey, prevKey: prevKey, dayId: dayId, ymd: ymd, addDays: addDays,
        sums: sums, status: status, summary: summary, levelOf: levelOf, bump: bump, gain: gain, gainText: gainText,
        listOf: listOf, forAssistant: forAssistant,
        credit: credit, autoDays: autoDays, withAuto: withAuto, targetMarks: targetMarks, history: history, records: records, // V40.34.0
        fmt: fmt, fmtOf: fmtOf, addLabel: addLabel, goalLabel: goalLabel, streakLabel: streakLabel, brl: brl, firstGrapheme: firstGrapheme
    };
});
