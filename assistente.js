/* ===========================================================================
 * Faz / TimeBlock — ASSISTENTE (V40.20.0)
 * ---------------------------------------------------------------------------
 * A primeira aba do celular e do PC. Esta é a versão PADRÃO: sem IA paga e sem
 * internet. Ela lê os dados que já estão no aparelho (agenda, listas, rotinas,
 * notas e finanças) e responde perguntas do dia a dia com frases prontas:
 * como está o dia, o que vem agora, amanhã, a semana, o que ficou pra trás,
 * contas, rotinas, notas e listas.
 *
 * O núcleo é puro (não mexe na tela nem no localStorage) e é o mesmo nas duas
 * telas: cada tela monta um "retrato" dos seus dados no formato abaixo e
 * desenha a resposta. Testável em Node: require('./assistente.js').
 *
 * Retrato (snap):
 *   now      Date (hora local)
 *   hours    [início, fim] da janela do dia (ex.: [7, 24])
 *   blocks   [{ id, title, date 'YYYY-MM-DD', start (min), dur (min), done, tag: { name, color } | null }]
 *   tasks    [{ id, title, dur, list (nome da lista), tag }]
 *   routines [{ id, title, emoji, dur }]
 *   notes    [{ id, title, content, ms }]                 (ms = última edição ou criação)
 *   expenses [{ id, title, amount, start 'YYYY-MM', months, recurring, dueDay,
 *               paid ['YYYY-MM'...], overrides { 'YYYY-MM': valor } }]
 *   goals    (V40.21.0) o retrato das metas já calculado pelo metas.js (FazMetas.forAssistant), ou null:
 *            { level, name, points, stars, toNext, todayDone, todayTotal,
 *              items: [{ id, title, emoji, list, period, complete, text, left, streak, streakText, stars }] }
 *
 * Resposta: { intent, text, items: [{ label, sub, tone, ref: { kind, id, month? } }], footer }
 *   tone: 'now' (acontecendo), 'next' (próximo), 'late' (atrasado), 'done' (feito) ou ''.
 *   ref.kind: 'bloco', 'tarefa', 'rotina', 'nota', 'despesa' ou 'meta' (a tela pode abrir o item).
 *
 * Depois: a IA de verdade (com API) entra por cima desta base.
 * ======================================================================== */

(function (root, factory) {
    var core = factory();
    if (typeof module === 'object' && module.exports) module.exports = core; // Node (testes)
    else root.FazAssistente = core;                                          // navegador
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var NAME = 'Assistente'; // provisório: o nome ainda vai ser escolhido
    var WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    var MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    var CHIPS = [
        { id: 'dia', label: 'Como está meu dia?' },
        { id: 'agora', label: 'O que vem agora?' },
        { id: 'amanha', label: 'E amanhã?' },
        { id: 'semana', label: 'Resumo da semana' },
        { id: 'atrasado', label: 'O que ficou pra trás?' },
        { id: 'contas', label: 'Minhas contas' },
        { id: 'rotinas', label: 'Minhas rotinas' },
        { id: 'metas', label: 'Minhas metas' },
        { id: 'notas', label: 'Notas recentes' },
        { id: 'listas', label: 'O que tem nas listas?' }
    ];

    // ---------- utilitários ----------
    function pad(n) { return String(n).padStart(2, '0'); }
    function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function dateOf(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
    function addDays(s, n) { var d = dateOf(s); d.setDate(d.getDate() + n); return ymd(d); }
    function monthOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
    function monthAdd(m, n) { var p = String(m).split('-').map(Number), d = new Date(p[0], p[1] - 1 + n, 1); return monthOf(d); }
    function nowMin(now) { return now.getHours() * 60 + now.getMinutes(); }
    function clock(m) { m = Math.max(0, Math.min(1440, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
    function dur(m) {
        m = Math.max(0, Math.round(Number(m) || 0));
        var h = Math.floor(m / 60), r = m % 60;
        return h > 0 && r > 0 ? h + 'h ' + r + 'm' : (h > 0 ? h + 'h' : r + 'm');
    }
    function inMin(m) { // "daqui a 25 min", "daqui a 1h 10m"
        m = Math.max(0, Math.round(m));
        return m < 1 ? 'agora' : 'daqui a ' + (m < 60 ? m + ' min' : dur(m));
    }
    function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
    function brl(n) {
        var v = Math.round((Number(n) || 0) * 100) / 100, neg = v < 0, s = Math.abs(v).toFixed(2).split('.');
        s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return (neg ? '-' : '') + 'R$ ' + s[0] + ',' + s[1];
    }
    function dayLabel(s, today) { // "hoje", "amanhã", "ontem", "quarta, 18/11"
        if (s === today) return 'hoje';
        if (s === addDays(today, 1)) return 'amanhã';
        if (s === addDays(today, -1)) return 'ontem';
        var d = dateOf(s);
        return WEEKDAYS[d.getDay()] + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
    }
    function title(x) { var t = String((x && x.title) || '').trim(); return t || 'Sem nome'; }
    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function greet(now) { var h = now.getHours(); return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite'; }

    // ---------- agenda ----------
    function dayBlocks(snap, day) {
        return (snap.blocks || []).filter(function (b) { return b.date === day; })
            .sort(function (a, b) { return a.start - b.start || (a.id < b.id ? -1 : 1); });
    }
    function blockItem(b, today, extra) {
        var tagTxt = b.tag && b.tag.name ? ' · ' + b.tag.name : '';
        return {
            label: clock(b.start) + ' ' + title(b),
            sub: (b.date !== today ? dayLabel(b.date, today) + ' · ' : '') + dur(b.dur) + tagTxt + (extra ? ' · ' + extra : ''),
            tone: '', ref: { kind: 'bloco', id: b.id }
        };
    }
    function nowState(snap) { // bloco de agora, próximo e o que ficou pra trás hoje
        var now = snap.now, today = ymd(now), nm = nowMin(now), list = dayBlocks(snap, today);
        var cur = null, next = null, late = [];
        list.forEach(function (b) {
            var end = b.start + b.dur;
            if (b.start <= nm && nm < end && !cur) cur = b;
            else if (b.start > nm && !next) next = b;
            if (end <= nm && !b.done) late.push(b);
        });
        return { today: today, nm: nm, list: list, cur: cur, next: next, late: late };
    }

    // ---------- finanças (mesmas regras do app) ----------
    function expMonths(e) { var n = Math.round(Number(e.months) || 1); return n >= 1 ? n : 1; }
    function expIn(e, m) { if (!/^\d{4}-\d{2}$/.test(String(e.start))) return false; var n = expMonths(e); return n === 1 ? e.start === m : m >= e.start && m <= monthAdd(e.start, n - 1); }
    function expPaid(e, m) { return (e.paid || []).indexOf(m) >= 0; }
    function expAmount(e, m) { var o = e.overrides && e.overrides[m]; var a = Number(o != null && typeof o === 'object' ? o.amount : o); return o != null && Number.isFinite(a) ? a : (Number(e.amount) || 0); }
    function expLate(e, m, now) { if (expPaid(e, m) || !e.dueDay) return false; var cm = monthOf(now); return m < cm || (m === cm && e.dueDay < now.getDate()); }
    function monthExpenses(snap, m) { return (snap.expenses || []).filter(function (e) { return expIn(e, m); }); }
    function expDueDate(e, m) { // dia do vencimento naquele mês (31 em mês de 30 dias vira o último dia)
        var p = m.split('-').map(Number), last = new Date(p[0], p[1], 0).getDate();
        return m + '-' + pad(Math.min(e.dueDay, last));
    }
    function expItem(e, m, today, tone) {
        return {
            label: title(e) + ' · ' + brl(expAmount(e, m)),
            sub: e.dueDay ? (tone === 'late' ? 'venceu ' : 'vence ') + dayLabel(expDueDate(e, m), today) : 'sem vencimento',
            tone: tone || '', ref: { kind: 'despesa', id: e.id, month: m }
        };
    }

    // ---------- respostas ----------
    var R = {};
    R.dia = function (snap) {
        var st = nowState(snap), now = snap.now, today = st.today, list = st.list;
        var pending = list.filter(function (b) { return !b.done && b.start + b.dur > st.nm; });
        var done = list.filter(function (b) { return b.done; }).length;
        var total = list.reduce(function (a, b) { return a + b.dur; }, 0);
        var text = greet(now) + '! Hoje é ' + WEEKDAYS[now.getDay()] + ', ' + now.getDate() + ' de ' + MONTHS[now.getMonth()] + '.';
        if (!list.length) {
            text += ' Sua agenda de hoje está livre.';
            var tm = dayBlocks(snap, addDays(today, 1));
            if (tm.length) text += ' Amanhã começa com ' + title(tm[0]) + ' às ' + clock(tm[0].start) + '.';
            var nt = (snap.tasks || []).length;
            if (nt) text += ' Você tem ' + plural(nt, 'tarefa esperando', 'tarefas esperando') + ' nas Listas.';
            return { text: text, items: [], footer: [dueToday(snap), goalsToday(snap)].filter(Boolean).join(' ') };
        }
        text += ' Você tem ' + plural(list.length, 'bloco', 'blocos') + ' na agenda (' + dur(total) + ')';
        text += done ? ', ' + plural(done, 'já concluído', 'já concluídos') + '.' : '.';
        if (st.cur) text += ' Agora: ' + title(st.cur) + ', até ' + clock(st.cur.start + st.cur.dur) + '.';
        if (st.next) text += ' Próximo: ' + title(st.next) + ' às ' + clock(st.next.start) + ' (' + inMin(st.next.start - st.nm) + ').';
        else if (!st.cur && pending.length === 0) text += ' Não tem mais nada pra hoje.';
        if (st.late.length) text += ' Ficou pra trás: ' + plural(st.late.length, 'bloco que já passou', 'blocos que já passaram') + ' sem concluir.';
        var items = pending.slice(0, 6).map(function (b) {
            var it = blockItem(b, today, b === st.cur ? 'agora' : b === st.next ? inMin(b.start - st.nm) : '');
            it.tone = b === st.cur ? 'now' : b === st.next ? 'next' : '';
            return it;
        });
        var more = pending.length - items.length;
        var foot = [];
        if (more > 0) foot.push('E mais ' + plural(more, 'bloco', 'blocos') + ' depois.');
        var due = dueToday(snap);
        if (due) foot.push(due);
        var gt = goalsToday(snap);
        if (gt) foot.push(gt);
        return { text: text, items: items, footer: foot.join(' ') };
    };
    function goalsToday(snap) { // V40.21.0: as metas diárias no resumo do dia
        var g = snap.goals;
        if (!g || !g.todayTotal) return '';
        return g.todayDone >= g.todayTotal ? 'Metas de hoje: todas cumpridas! ⭐' : 'Metas de hoje: ' + g.todayDone + ' de ' + g.todayTotal + ' cumpridas.';
    }
    function dueToday(snap) {
        var m = monthOf(snap.now), d = snap.now.getDate();
        var due = monthExpenses(snap, m).filter(function (e) { return !expPaid(e, m) && e.dueDay && Number(expDueDate(e, m).slice(8)) === d; });
        if (!due.length) return '';
        return 'Vence hoje: ' + due.map(function (e) { return title(e) + ' (' + brl(expAmount(e, m)) + ')'; }).join(', ') + '.';
    }
    R.agora = function (snap) {
        var st = nowState(snap), today = st.today, items = [], text;
        if (st.cur) {
            text = 'Agora: ' + title(st.cur) + ', até ' + clock(st.cur.start + st.cur.dur) + ' (faltam ' + dur(st.cur.start + st.cur.dur - st.nm) + ').';
            var c = blockItem(st.cur, today, 'agora'); c.tone = 'now'; items.push(c);
        } else text = 'Nada acontecendo agora na agenda.';
        if (st.next) {
            text += ' Depois: ' + title(st.next) + ' às ' + clock(st.next.start) + ' (' + inMin(st.next.start - st.nm) + ').';
            var n = blockItem(st.next, today, inMin(st.next.start - st.nm)); n.tone = 'next'; items.push(n);
            var after = st.list.filter(function (b) { return b.start > st.next.start; }).slice(0, 2);
            after.forEach(function (b) { items.push(blockItem(b, today)); });
        } else {
            var tm = dayBlocks(snap, addDays(today, 1));
            text += st.cur ? ' Depois dele, hoje não tem mais nada.' : ' Hoje não tem mais nada.';
            if (tm.length) { text += ' Amanhã começa com ' + title(tm[0]) + ' às ' + clock(tm[0].start) + '.'; items.push(blockItem(tm[0], today)); }
        }
        return { text: text, items: items, footer: '' };
    };
    R.amanha = function (snap) {
        var today = ymd(snap.now), tm = addDays(today, 1), list = dayBlocks(snap, tm), total = list.reduce(function (a, b) { return a + b.dur; }, 0);
        var d = dateOf(tm), text = 'Amanhã (' + WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '/' + pad(d.getMonth() + 1) + ')';
        text += list.length ? ': ' + plural(list.length, 'bloco', 'blocos') + ' (' + dur(total) + '), começando com ' + title(list[0]) + ' às ' + clock(list[0].start) + '.' : ' a agenda está livre.';
        var m = monthOf(d), due = monthExpenses(snap, m).filter(function (e) { return !expPaid(e, m) && e.dueDay && expDueDate(e, m) === tm; });
        var items = list.slice(0, 8).map(function (b) { return blockItem(b, today); });
        var foot = [];
        if (list.length > items.length) foot.push('E mais ' + plural(list.length - items.length, 'bloco', 'blocos') + '.');
        if (due.length) foot.push('Vence amanhã: ' + due.map(function (e) { return title(e) + ' (' + brl(expAmount(e, m)) + ')'; }).join(', ') + '.');
        return { text: text, items: items, footer: foot.join(' ') };
    };
    R.semana = function (snap) {
        var today = ymd(snap.now), wd = (dateOf(today).getDay() + 6) % 7, mon = addDays(today, -wd), days = [];
        for (var i = 0; i < 7; i++) days.push(addDays(mon, i));
        var all = (snap.blocks || []).filter(function (b) { return b.date >= days[0] && b.date <= days[6]; });
        if (!all.length) return { text: 'Esta semana (' + shortDate(days[0]) + ' a ' + shortDate(days[6]) + ') ainda não tem nada na agenda.', items: [], footer: '' };
        var total = all.reduce(function (a, b) { return a + b.dur; }, 0), done = all.filter(function (b) { return b.done; });
        var nm = nowMin(snap.now), passed = all.filter(function (b) { return b.date < today || (b.date === today && b.start + b.dur <= nm); });
        var passedDone = passed.filter(function (b) { return b.done; }).length;
        var text = 'Esta semana (' + shortDate(days[0]) + ' a ' + shortDate(days[6]) + '): ' + plural(all.length, 'bloco', 'blocos') + ', ' + dur(total) + ' planejados.';
        if (passed.length) text += ' Dos que já passaram, você concluiu ' + passedDone + ' de ' + passed.length + ' (' + Math.round(passedDone / passed.length * 100) + '%).';
        else if (done.length) text += ' ' + plural(done.length, 'já concluído', 'já concluídos') + '.';
        var byTag = {};
        all.forEach(function (b) { var k = b.tag && b.tag.name ? b.tag.name : 'Sem tag'; byTag[k] = (byTag[k] || 0) + b.dur; });
        var tags = Object.keys(byTag).sort(function (a, b) { return byTag[b] - byTag[a]; }).slice(0, 3);
        if (tags.length > 1 || tags[0] !== 'Sem tag') text += ' Onde vai o tempo: ' + tags.map(function (k) { return k + ' ' + dur(byTag[k]); }).join(', ') + '.';
        var items = days.map(function (dd) {
            var l = all.filter(function (b) { return b.date === dd; }), t = l.reduce(function (a, b) { return a + b.dur; }, 0);
            var dn = l.filter(function (b) { return b.done; }).length, d = dateOf(dd);
            return {
                label: WEEKDAYS[d.getDay()].slice(0, 3) + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + (dd === today ? ' (hoje)' : ''),
                sub: l.length ? plural(l.length, 'bloco', 'blocos') + ' · ' + dur(t) + (dn ? ' · ' + dn + ' feito' + (dn === 1 ? '' : 's') : '') : 'livre',
                tone: dd === today ? 'now' : '', ref: null
            };
        });
        var busiest = days.slice().sort(function (a, b) { return dayMins(all, b) - dayMins(all, a); })[0];
        return { text: text, items: items, footer: 'Dia mais cheio: ' + WEEKDAYS[dateOf(busiest).getDay()] + ' (' + dur(dayMins(all, busiest)) + ').' };
    };
    function dayMins(all, d) { return all.filter(function (b) { return b.date === d; }).reduce(function (a, b) { return a + b.dur; }, 0); }
    function shortDate(s) { var d = dateOf(s); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1); }
    R.atrasado = function (snap) {
        var today = ymd(snap.now), nm = nowMin(snap.now), from = addDays(today, -7);
        var late = (snap.blocks || []).filter(function (b) { return !b.done && b.date >= from && (b.date < today || (b.date === today && b.start + b.dur <= nm)); })
            .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.start - a.start; });
        var m = monthOf(snap.now), bills = monthExpenses(snap, m).filter(function (e) { return expLate(e, m, snap.now); })
            .sort(function (a, b) { return a.dueDay - b.dueDay; });
        var pm = monthAdd(m, -1), prev = monthExpenses(snap, pm).filter(function (e) { return !expPaid(e, pm); });
        if (!late.length && !bills.length) return { text: 'Nada ficou pra trás nos últimos 7 dias, e nenhuma conta deste mês está atrasada. Tudo em dia! 🎉', items: [], footer: prev.length ? 'Só lembrando: ' + plural(prev.length, 'despesa de ' + MONTHS[Number(pm.slice(5)) - 1] + ' ficou', 'despesas de ' + MONTHS[Number(pm.slice(5)) - 1] + ' ficaram') + ' sem marcar como paga.' : '' };
        var parts = [];
        if (late.length) parts.push(plural(late.length, 'bloco dos últimos 7 dias passou', 'blocos dos últimos 7 dias passaram') + ' sem concluir');
        if (bills.length) parts.push(plural(bills.length, 'conta deste mês está atrasada', 'contas deste mês estão atrasadas') + ' (' + brl(bills.reduce(function (a, e) { return a + expAmount(e, m); }, 0)) + ')');
        var items = bills.map(function (e) { return expItem(e, m, today, 'late'); })
            .concat(late.slice(0, 8).map(function (b) { var it = blockItem(b, today); it.tone = 'late'; return it; }));
        var foot = [];
        if (late.length > 8) foot.push('E mais ' + plural(late.length - 8, 'bloco', 'blocos') + '.');
        if (prev.length) foot.push(plural(prev.length, 'despesa de ' + MONTHS[Number(pm.slice(5)) - 1] + ' ficou', 'despesas de ' + MONTHS[Number(pm.slice(5)) - 1] + ' ficaram') + ' sem marcar como paga.');
        return { text: 'Ficou pra trás: ' + parts.join(' e ') + '.', items: items, footer: foot.join(' ') };
    };
    R.contas = function (snap) {
        var today = ymd(snap.now), m = monthOf(snap.now), list = monthExpenses(snap, m);
        var mName = MONTHS[Number(m.slice(5)) - 1];
        if (!list.length) return { text: 'Você não tem despesas em ' + mName + '.', items: [], footer: '' };
        var tot = 0, paid = 0;
        list.forEach(function (e) { var a = expAmount(e, m); tot += a; if (expPaid(e, m)) paid += a; });
        var late = list.filter(function (e) { return expLate(e, m, snap.now); }).sort(function (a, b) { return a.dueDay - b.dueDay; });
        var limit = addDays(today, 7);
        var soon = list.filter(function (e) { if (expPaid(e, m) || !e.dueDay || expLate(e, m, snap.now)) return false; var d = expDueDate(e, m); return d >= today && d <= limit; })
            .sort(function (a, b) { return a.dueDay - b.dueDay; });
        var text = 'Em ' + mName + ': ' + plural(list.length, 'despesa', 'despesas') + ', ' + brl(tot) + ' no total. Pago: ' + brl(paid) + '. Em aberto: ' + brl(tot - paid) + '.';
        if (late.length) text += ' ' + plural(late.length, 'está atrasada', 'estão atrasadas') + '.';
        if (soon.length) text += ' ' + plural(soon.length, 'vence', 'vencem') + ' nos próximos 7 dias.';
        if (!late.length && !soon.length) text += tot - paid > 0.004 ? ' Nada vencido nem vencendo nos próximos 7 dias.' : ' Tudo pago! 🎉';
        var items = late.map(function (e) { return expItem(e, m, today, 'late'); }).concat(soon.map(function (e) { return expItem(e, m, today, 'next'); }));
        // fim do mês: lembra do mês que vem
        var nm = monthAdd(m, 1), next = monthExpenses(snap, nm).filter(function (e) { return !expPaid(e, nm); });
        var lastDay = new Date(snap.now.getFullYear(), snap.now.getMonth() + 1, 0).getDate();
        var foot = snap.now.getDate() > lastDay - 7 && next.length ? 'Em ' + MONTHS[Number(nm.slice(5)) - 1] + ' já são ' + plural(next.length, 'despesa', 'despesas') + ' (' + brl(next.reduce(function (a, e) { return a + expAmount(e, nm); }, 0)) + ').' : '';
        return { text: text, items: items, footer: foot };
    };
    R.rotinas = function (snap) {
        var rs = (snap.routines || []).slice();
        if (!rs.length) return { text: 'Você ainda não tem rotinas. Rotina é um bloco que você usa sempre (treino, revisar e-mails...): crie uma na aba Rotinas e coloque na agenda quando quiser.', items: [], footer: '' };
        var today = ymd(snap.now), wd = (dateOf(today).getDay() + 6) % 7, mon = addDays(today, -wd), sun = addDays(mon, 6);
        var week = (snap.blocks || []).filter(function (b) { return b.date >= mon && b.date <= sun; });
        var uses = function (r) {
            var a = norm(title(r)), b = norm(((r.emoji || '') + ' ' + title(r)).trim());
            return week.filter(function (x) { var t = norm(title(x)); return t === a || t === b; }).length;
        };
        var rows = rs.map(function (r) { return { r: r, n: uses(r) }; });
        var unused = rows.filter(function (x) { return !x.n; });
        var text = 'Você tem ' + plural(rs.length, 'rotina', 'rotinas') + '.';
        var used = rows.filter(function (x) { return x.n; });
        if (used.length) text += ' Esta semana: ' + used.map(function (x) { return title(x.r) + ' ' + x.n + 'x'; }).join(', ') + '.';
        if (unused.length && unused.length < rs.length) text += ' Ainda não entrou na agenda desta semana: ' + unused.map(function (x) { return title(x.r); }).slice(0, 3).join(', ') + '.';
        var items = rows.map(function (x) {
            return { label: ((x.r.emoji || '') + ' ' + title(x.r)).trim(), sub: dur(x.r.dur) + ' · ' + (x.n ? 'usada ' + x.n + 'x nesta semana' : 'não usada nesta semana'), tone: x.n ? 'done' : '', ref: { kind: 'rotina', id: x.r.id } };
        });
        return { text: text, items: items, footer: 'Pra colocar uma rotina na agenda: aba Rotinas, botão da mão.' };
    };
    R.notas = function (snap) {
        var ns = (snap.notes || []).slice().sort(function (a, b) { return (b.ms || 0) - (a.ms || 0); });
        if (!ns.length) return { text: 'Você não tem notas.', items: [], footer: '' };
        var today = ymd(snap.now);
        var items = ns.slice(0, 5).map(function (n) {
            var body = String(n.content || '').replace(/\s+/g, ' ').trim(), t = String(n.title || '').trim();
            var label = t || body.slice(0, 50) || 'Nota vazia';
            var when = n.ms ? dayLabel(ymd(new Date(n.ms)), today) : '';
            var sub = (when ? 'editada ' + (when === 'hoje' || when === 'ontem' ? when : 'em ' + when) : '') + (t && body ? (when ? ' · ' : '') + body.slice(0, 60) + (body.length > 60 ? '…' : '') : '');
            return { label: label, sub: sub, tone: '', ref: { kind: 'nota', id: n.id } };
        });
        return { text: 'Você tem ' + plural(ns.length, 'nota', 'notas') + '. As mais recentes:', items: items, footer: '' };
    };
    R.listas = function (snap) {
        var ts = snap.tasks || [];
        if (!ts.length) return { text: 'Suas listas estão vazias.', items: [], footer: '' };
        var by = {}, order = [];
        ts.forEach(function (t) { var k = t.list || 'Geral'; if (!by[k]) { by[k] = { n: 0, m: 0 }; order.push(k); } by[k].n++; by[k].m += Number(t.dur) || 0; });
        var total = ts.reduce(function (a, t) { return a + (Number(t.dur) || 0); }, 0);
        var items = order.map(function (k) { return { label: k, sub: plural(by[k].n, 'tarefa', 'tarefas') + ' · ' + dur(by[k].m), tone: '', ref: null }; });
        return { text: 'Você tem ' + plural(ts.length, 'tarefa', 'tarefas') + ' nas Listas (' + dur(total) + ' de trabalho).', items: items, footer: 'Pra levar uma tarefa pra agenda: botão de agendar ou a mão, no cartão.' };
    };
    // V40.21.0: metas de verdade (o retrato vem pronto do metas.js: progresso, estrelas, sequência e nível)
    R.metas = function (snap) {
        var g = snap.goals, list = (g && g.items) || [];
        if (!list.length) return { text: 'Você ainda não tem metas. Na aba Metas você cria metas pessoais, profissionais e financeiras (beber água, correr, meditar, guardar dinheiro...), toca no + quando fizer e ganha estrelas, pontos e níveis. Eu acompanho o seu progresso por aqui. 🎯', items: [], footer: '' };
        var text = 'Nível ' + g.level + ' · ' + g.name + ': ' + plural(g.points, 'ponto', 'pontos') + ' e ⭐ ' + plural(g.stars, 'estrela', 'estrelas') + '. Faltam ' + g.toNext + ' pro nível ' + (g.level + 1) + '.';
        if (g.todayTotal) text += g.todayDone >= g.todayTotal ? ' Hoje você cumpriu todas as metas do dia! 🎉' : ' Hoje: ' + g.todayDone + ' de ' + plural(g.todayTotal, 'meta diária cumprida', 'metas diárias cumpridas') + '.';
        var order = { dia: 0, semana: 1, mes: 2 };
        var sorted = list.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
            return (a.x.complete - b.x.complete) || ((order[a.x.period] || 0) - (order[b.x.period] || 0)) || (a.i - b.i);
        }).map(function (o) { return o.x; });
        var items = sorted.slice(0, 8).map(function (x) {
            var sub = [x.text, x.complete ? 'cumprida ✓' : 'falta ' + x.left];
            if (x.streakText) sub.push('🔥 ' + x.streakText);
            if (x.list) sub.push(x.list);
            return { label: ((x.emoji || '') + ' ' + title(x)).trim(), sub: sub.join(' · '), tone: x.complete ? 'done' : 'next', ref: { kind: 'meta', id: x.id } };
        });
        var foot = [];
        if (list.length > items.length) foot.push('E mais ' + plural(list.length - items.length, 'meta', 'metas') + '.');
        foot.push('Fez? Toque no + da meta, na aba Metas.');
        return { text: text, items: items, footer: foot.join(' ') };
    };
    R.ajuda = function () {
        return {
            text: 'Por enquanto eu leio a sua agenda, listas, rotinas, notas, finanças e metas e respondo sobre: o seu dia, o que vem agora, amanhã, a semana, o que ficou pra trás, contas, rotinas, metas, notas e listas. Toque numa sugestão ou escreva do seu jeito (ex.: "o que vence esta semana?").',
            items: [], footer: 'Em breve: conversa com IA de verdade e lembretes.'
        };
    };
    R.obrigado = function () { return { text: 'De nada! 😊 Se precisar, é só perguntar.', items: [], footer: '' }; };
    R.naoentendi = function () {
        return { text: 'Ainda não sei responder isso. 😅 Por enquanto eu entendo perguntas sobre: hoje, agora, amanhã, a semana, o que ficou pra trás, contas, rotinas, metas, notas e listas.', items: [], footer: 'A conversa com IA de verdade vem numa próxima versão.' };
    };

    // ---------- entender o que foi escrito ----------
    var RULES = [
        ['obrigado', /\b(obrigad|valeu|vlw|brigad)/],
        ['metas', /\b(meta|nivel|estrela|pontos|pontuacao)/],
        ['ajuda', /\b(ajuda|o que voce (sabe|faz|pode)|como (funciona|te uso|usar))/],
        ['contas', /\b(contas?|pagar|pago|paga|boletos?|faturas?|dinheiro)\b|\b(venc|financ|despes|gast)/],
        ['rotinas', /\brotina/],
        ['notas', /\b(notas?)\b|\banot/],
        ['atrasado', /\b(atras|pendent|ficou pra tras|ficaram|esqueci|deixei)/],
        ['amanha', /\bamanha/],
        ['semana', /\bsemana/],
        ['agora', /\b(agora|proxim|a seguir|em seguida|daqui)/],
        ['listas', /\b(lista|listas|tarefa|tarefas|backlog)/],
        ['dia', /\b(hoje|dia|agenda|compromisso|resumo|oi|ola|bom dia|boa tarde|boa noite|e ai)\b/]
    ];
    function intentOf(text) {
        var t = norm(text).replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t) return null;
        for (var i = 0; i < RULES.length; i++) if (RULES[i][1].test(t)) return RULES[i][0];
        return 'naoentendi';
    }
    function reply(intent, snap) {
        var f = R[intent] || R.naoentendi, a = f(snap) || {};
        return { intent: R[intent] ? intent : 'naoentendi', text: a.text || '', items: a.items || [], footer: a.footer || '' };
    }
    function ask(text, snap) { var i = intentOf(text); return i ? reply(i, snap) : null; }
    function briefing(snap) { return reply('dia', snap); }

    return {
        NAME: NAME, CHIPS: CHIPS,
        reply: reply, ask: ask, briefing: briefing, intentOf: intentOf,
        // úteis pras telas e pros testes
        _: { ymd: ymd, addDays: addDays, clock: clock, dur: dur, brl: brl, expIn: expIn, expAmount: expAmount, expPaid: expPaid, expLate: expLate, monthOf: monthOf }
    };
});
