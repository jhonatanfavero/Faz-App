// V40.32.2 — iPhone instalado, simulado no Chrome: a barra de status (relógio, bateria) fica POR CIMA do app e o
// risco de início (a barrinha de baixo) também. O Chrome não tem área segura nem as regras só de iOS: o style.css
// é servido com env(safe-area-inset-*) trocado pelos números do iPhone e com o bloco "@supports
// (-webkit-touch-callout: none)" ligado. Percorre as telas e confere, em cada uma:
//   - nada tocável atrás da barra de status nem em cima do risco de início;
//   - nada tocável coberto por outra coisa (o dedo acertaria outra coisa);
//   - nenhum campo vazando do cartão e nada passando da largura da tela.
// Duas telas de iPhone: 13 (390×844, 47 px em cima) e 13 mini (375×812, 50 px). Fotos com a barra de mentira.
// V40.36.1: e um Android (Samsung, barra de 3 botões): desde o Chrome 135, com viewport-fit=cover, a tela do app vai
// até embaixo, ATRÁS da barra de navegação (opaca), e o env(safe-area-inset-bottom) diz quanto ela ocupa. Sem o bloco
// só de iOS. Foto dele de 22/11: os botões "54 itens" e "+" ficavam pela metade atrás da barra.
// Uso: CHROME=/usr/bin/google-chrome FOTOS=<pasta> TZ='America/Sao_Paulo' node tests/navegador/iphone.js
const { abrir, celular } = require('./apoio');

const IPHONES = [
    { nome: 'iPhone 13', w: 390, h: 844, top: 47, bot: 34 },
    { nome: 'iPhone 13 mini', w: 375, h: 812, top: 50, bot: 34 },
    { nome: 'Android (barra de 3 botões)', w: 393, h: 808, top: 0, bot: 49, android: true, foto: 'android-' }
];

(async () => {
    const T = await abrir();
    const { ok, foto, fim, base, browser } = T;
    const errs = [];

    async function abrirIphone(ip) {
        const ctx = await celular(browser, { viewport: { width: ip.w, height: ip.h } });
        await ctx.route('**/style.css', async (route) => {
            const r = await route.fetch();
            let css = await r.text();
            css = css.replace(/env\(\s*safe-area-inset-top[^)]*\)/g, ip.top + 'px')
                .replace(/env\(\s*safe-area-inset-bottom[^)]*\)/g, ip.bot + 'px')
                .replace(/env\(\s*safe-area-inset-(left|right)[^)]*\)/g, '0px');
            if (!ip.android) css = css.replace(/@supports\s*\(-webkit-touch-callout:\s*none\)/g, '@supports (display: block)'); // só no iPhone
            await route.fulfill({ response: r, body: css, headers: Object.assign({}, r.headers(), { 'content-type': 'text/css; charset=utf-8' }) });
        });
        const m = await ctx.newPage();
        m.on('pageerror', (e) => errs.push(String(e)));
        await m.goto(base + 'index.html');
        await m.waitForTimeout(900);
        // V40.34.0: metas de exemplo (as linhas "Meta" só aparecem com meta criada), 2 blocos ligados e concluídos
        // (selo na agenda e barras no gráfico) e uma sublista com um cartão ligado (janelinha do cartão)
        await m.evaluate(() => {
            [4, 1, 0].forEach((i) => { openGoalForm(); applyGoalTemplate(i); saveGoalForm(); });
            const ler = goalsDb.find((g) => g.title === 'Ler'), agua = goalsDb.find((g) => g.title === 'Beber água'), correr = goalsDb.find((g) => g.title === 'Correr');
            db.filter((x) => x.date === '2026-11-16' && !Array.isArray(x.cards)).sort((a, b) => a.startMin - b.startMin).slice(1, 3).forEach((b) => { b.goalId = ler.id; b.completed = true; });
            const col0 = backlogColumnsDb[0] && backlogColumnsDb[0].id, t0 = backlogDb.find((t) => (t.columnId || 'col_geral') === col0) || backlogDb[0];
            if (t0) { t0.goalId = ler.id; saveBacklog(); }
            if (routinesDb[0]) { routinesDb[0].goalId = correr.id; saveRoutinesDb(); }
            db.push({ id: 'f_ip_sub', type: 'focus', title: 'Pendências', startMin: 22 * 60, duration: 60, date: '2026-11-16', microblocks: [], completed: false, theme: 'focus', tagId: null, linkedNoteIds: [], expanded: false,
                cards: [{ id: 'cd_ip1', title: 'Copo de água', done: false, microblocks: [], goalId: agua.id }, { id: 'cd_ip2', title: 'Ligar pro banco', done: true, microblocks: [] }] });
            saveDb(); closeAllSheets(); renderTimeline(); renderBacklog(); renderRoutinesList();
        });
        await m.waitForTimeout(400);
        // o aviso "Meta criada!" e a barrinha do Desfazer do preparo não entram nas fotos
        await m.evaluate(() => { if (typeof undoBarHide === 'function') undoBarHide(); const t = document.getElementById('toast'); if (t) t.classList.add('opacity-0'); });
        await m.waitForTimeout(300);
        // a barra de status e o risco de início de mentira (só pra foto; o dedo passa por eles)
        await m.evaluate((ip) => {
            const top = document.createElement('div');
            top.id = '__ios_status';
            top.style.cssText = `position:fixed;left:0;right:0;top:0;height:${ip.top}px;z-index:2147483647;pointer-events:none;background:rgba(0,0,0,.06);font:600 15px -apple-system,Inter,sans-serif;display:flex;align-items:flex-end;justify-content:space-between;padding:0 28px 12px;box-sizing:border-box;color:#111`;
            top.innerHTML = '<span>11:34</span><span>▮▮▮ ◔ ▭</span>';
            const bot = document.createElement('div');
            bot.id = '__ios_home';
            bot.style.cssText = `position:fixed;left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#111;z-index:2147483647;pointer-events:none`;
            if (ip.android) { // V40.36.1: a barra de navegação do Android é opaca e cobre o pé da tela
                bot.style.cssText = `position:fixed;left:0;right:0;bottom:0;height:${ip.bot}px;z-index:2147483647;pointer-events:none;background:#ef4444;color:#fff;font:600 22px sans-serif;display:flex;align-items:center;justify-content:space-around`;
                bot.innerHTML = '<span>|||</span><span>○</span><span>‹</span>';
                top.style.display = 'none';
            }
            document.body.append(top, bot);
        }, ip);
        return { ctx, m };
    }

    // Confere a tela aberta. raiz: o que está por cima (tela, janelinha) ou nada (a agenda).
    // fim: rola as listas até o fim antes (pra conferir o que fica por último em cima do risco de início).
    async function conferir(m, ip, raiz, opts) {
        return m.evaluate(({ ip, raiz, opts }) => {
            const W = innerWidth, H = innerHeight, out = [];
            const root = raiz ? document.querySelector(raiz) : document.body;
            if (!root) return [{ tipo: 'sem tela', quem: raiz }];
            if (opts && opts.fim) root.querySelectorAll('*').forEach((el) => { if (el.scrollHeight > el.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight; });
            const name = (el) => {
                const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
                return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (t ? ' "' + t + '"' : '');
            };
            const inter = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) });
            const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [onclick], [role="button"]';
            root.querySelectorAll(sel).forEach((el) => {
                if (el.closest('#__ios_status, #__ios_home')) return;
                if (raiz === null && el.closest('[id$="-sheet"], [id$="-modal"], #overlay')) return; // na agenda: só ela
                const cs = getComputedStyle(el);
                if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') return;
                let op = 1;
                for (let p = el; p; p = p.parentElement) { const o = Number(getComputedStyle(p).opacity); op *= o; if (op < 0.05) return; }
                const r0 = el.getBoundingClientRect();
                if (r0.width < 2 || r0.height < 2) return;
                let v = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom }, clip = { l: 0, t: 0, r: W, b: H }, scrollX = false;
                for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
                    const ps = getComputedStyle(p);
                    if (/(auto|scroll|hidden|clip)/.test(ps.overflowX + ' ' + ps.overflowY)) {
                        const pr = p.getBoundingClientRect();
                        clip = inter(clip, { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom });
                        if (/(auto|scroll)/.test(ps.overflowX) && p.scrollWidth > p.clientWidth + 1) scrollX = true;
                    }
                }
                v = inter(v, clip);
                if (v.r - v.l < 2 || v.b - v.t < 2) return; // fora da área visível agora (rolado pra longe)
                const quem = name(el), rect = [Math.round(r0.left), Math.round(r0.top), Math.round(r0.width), Math.round(r0.height)];
                if (v.t < ip.top - 0.5) out.push({ tipo: 'atrás da barra de status', quem, rect });
                if (v.b > H - ip.bot + 0.5) {
                    // numa lista que ainda rola pra cima, dá pra tirar de cima do risco: só conta quando não rola mais
                    let rola = false;
                    for (let p = el.parentElement; p; p = p.parentElement) {
                        const ps = getComputedStyle(p);
                        if (/(auto|scroll)/.test(ps.overflowY) && p.scrollHeight > p.clientHeight + 2 && p.scrollTop < p.scrollHeight - p.clientHeight - 2) { rola = true; break; }
                    }
                    if (!rola) out.push({ tipo: ip.android ? 'atrás da barra de navegação' : 'em cima do risco de início', quem, rect });
                }
                if (!scrollX && (r0.right > W + 1 || r0.left < -1)) out.push({ tipo: 'passa da largura da tela', quem, rect });
                if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && el.parentElement) {
                    const pr = el.parentElement.getBoundingClientRect();
                    if (r0.right > pr.right + 1 || r0.left < pr.left - 1) out.push({ tipo: 'campo vaza do cartão', quem, rect });
                }
                const cx = (v.l + v.r) / 2, cy = (v.t + v.b) / 2;
                const hit = document.elementFromPoint(cx, cy);
                // o bloco aberto da agenda fica por cima dos de baixo de propósito (é assim desde sempre)
                const hb = hit && hit.closest('.block-item'), eb = el.closest('.block-item');
                const porCimaDeProposito = hb && eb && hb !== eb && Number(getComputedStyle(hb).zIndex) > Number(getComputedStyle(eb).zIndex) ||
                    // os botões redondos (+ e Lista) flutuam sobre a agenda, que rola: o bloco sai de baixo deles
                    !!(hit && hit.closest('#fab-btn, #list-btn') && el.closest('#timeline-scroll'));
                // V40.34.0: numa lista que ainda rola pra baixo, o que está embaixo do rodapé fixo (ex.: "Salvar meta", fora da
                // lista) sai de baixo dele rolando: só conta quando a lista não rola mais (as telas com fim: true)
                let sc = null;
                for (let p = el.parentElement; p; p = p.parentElement) { const ps = getComputedStyle(p); if (/(auto|scroll)/.test(ps.overflowY) && p.scrollHeight > p.clientHeight + 2) { sc = p; break; } }
                const debaixoDoRodape = !!(hit && sc && !sc.contains(hit) && sc.scrollTop < sc.scrollHeight - sc.clientHeight - 2 && hit.getBoundingClientRect().top >= sc.getBoundingClientRect().top + sc.clientHeight / 2);
                if (hit && !porCimaDeProposito && !debaixoDoRodape && !(hit === el || el.contains(hit) || hit.contains(el) || hit.closest('label') === el.closest('label') && el.closest('label')))
                    out.push({ tipo: 'coberto por ' + name(hit), quem, rect });
            });
            if (raiz === null) { // o nome do dia no topo da agenda não pode ficar cortado
                const hd = document.getElementById('header-date');
                if (hd && hd.clientWidth && hd.scrollWidth > hd.clientWidth + 1) out.push({ tipo: 'nome do dia cortado', quem: '"' + hd.textContent.trim() + '"', rect: [hd.clientWidth, hd.scrollWidth] });
            }
            return out;
        }, { ip, raiz, opts: opts || null });
    }

    // telas: [nome, como abrir, raiz (o que está por cima), opções]
    const ID = (s) => JSON.stringify(s);
    const TELAS = [
        ['Agenda', 'closeAllSheets(); activeDateObj = new Date(2026, 10, 16); renderTimeline();', null],
        ['Agenda (cabeçalho recolhido)', 'toggleHeader();', null, { depois: 'toggleHeader();' }],
        ['Agenda com busca', 'openSearchBar();', null, { depois: 'closeSearchBar();' }],
        ['Bloco aberto', `(() => { const b = db.find((x) => x.date === '2026-11-16' && !Array.isArray(x.cards)); toggleExpandBlock(b.id, { stopPropagation() {} }); setTimeout(() => { const el = document.querySelector('[data-block-id="' + b.id + '"]'); if (el) el.scrollIntoView({ block: 'center' }); }, 50); })();`, null, { depois: 'db.forEach((b) => { b.expanded = false; }); renderTimeline();' }],
        ['+ (novo bloco)', 'openSheet();', '#bottom-sheet', { fim: true }],
        ['Lista: Assistente', "openListSheet(); switchListTab('assistant');", '#list-sheet'],
        ['Lista: Listas', "switchListTab('backlog');", '#list-sheet'],
        ['Lista: Listas (fim)', '', '#list-sheet', { fim: true }],
        ['Lista: nova tarefa', 'openBacklogForm();', '#list-sheet', { fim: true }],
        ['Lista: Rotinas', "closeAllSheets(); openListSheet(); switchListTab('routines');", '#list-sheet', { fim: true }],
        ['Lista: nova rotina', 'openRoutineForm();', '#list-sheet', { fim: true }],
        ['Lista: Notas', "closeAllSheets(); openListSheet(); switchListTab('notes');", '#list-sheet', { fim: true }],
        ['Lista: nova nota', 'openNoteForm();', '#list-sheet', { fim: true }],
        ['Lista: Finanças', "closeAllSheets(); openListSheet(); switchListTab('financial');", '#list-sheet', { fim: true }],
        ['Lista: nova despesa', 'openFinancialForm();', '#list-sheet', { fim: true }],
        ['Lista: Metas', "closeAllSheets(); openListSheet(); switchListTab('goals');", '#list-sheet', { fim: true }],
        ['Lista: nova meta', 'openGoalForm(null);', '#list-sheet', { fim: true }],
        ['Lista: meta com gráfico', "openGoalForm(goalsDb.find((g) => g.title === 'Ler').id);", '#list-sheet'], // V40.34.0: o gráfico fica no topo
        ['Agenda: selos das metas', `closeAllSheets(); activeDateObj = new Date(2026, 10, 16); renderTimeline(); setTimeout(() => { const el = document.querySelector('.block-item .goal-badge'); if (el) el.closest('.block-item').scrollIntoView({ block: 'center' }); }, 50);`, null], // V40.34.0
        ['Config', 'closeAllSheets(); openConfigSheet();', '#config-sheet', { fim: true }],
        ['Config: Horário', 'openConfigHours();', '#config-sheet', { fim: true }],
        ['Config: Aparência', 'openConfigSheet(); openConfigAppearance();', '#config-sheet', { fim: true }],
        ['Config: Períodos', 'openConfigSheet(); openConfigPeriods();', '#config-sheet', { fim: true }],
        ['Config: Backup', 'openConfigSheet(); openConfigBackup();', '#config-sheet', { fim: true }],
        ['Config: Arquivados', 'openConfigSheet(); openConfigArchive();', '#config-sheet', { fim: true }],
        ['Config: Sincronizar', 'openConfigSheet(); openConfigSync();', '#config-sheet', { fim: true }],
        ['Tags', 'closeAllSheets(); openTagsSheet();', '#tags-sheet', { fim: true }],
        ['Relatórios', 'closeAllSheets(); openReportsSheet();', '#reports-sheet', { fim: true }],
        ['Períodos (agendar)', 'closeAllSheets(); openPeriodSelectSheet();', '#period-select-sheet', { fim: true }],
        ['Duplicar', `closeAllSheets(); duplicateTask(db.find((x) => x.date === '2026-11-16').id, { stopPropagation() {} });`, '#clone-sheet', { fim: true }],
        ['Vincular nota', `closeAllSheets(); openLinkNoteSheet(db.find((x) => x.date === '2026-11-16').id, { stopPropagation() {} });`, '#link-note-sheet', { fim: true }],
        ['Janelinha: menu da lista', "closeAllSheets(); openListSheet(); switchListTab('backlog'); scrollToColumn(backlogColumnsDb[1].id); openColumnMenuFromHeader();", '#column-menu-modal', { depois: 'closeColumnMenu(); closeAllSheets();' }], // V40.33.0: setas Esquerda/Direita
        ['Janelinha: editar bloco', `closeAllSheets(); openEditModal(db.find((x) => x.date === '2026-11-16').id);`, '#edit-task-modal', { depois: 'cancelEdit();' }],
        ['Janelinha: cartão da sublista', "closeAllSheets(); openSublistCard('f_ip_sub', 'cd_ip1', { stopPropagation() {} });", '#sub-card-modal', { depois: 'closeSubCard();' }], // V40.34.0: + linha Meta
        ['Janelinha: apagar bloco', `closeAllSheets(); openDeleteModal(db.find((x) => x.date === '2026-11-16').id);`, '#delete-task-modal', { depois: 'cancelDelete();' }],
        ['Janelinha: horário', `closeAllSheets(); openTimePicker(db.find((x) => x.date === '2026-11-16').id, { stopPropagation() {} });`, '#time-picker-modal', { depois: 'cancelTimePicker();' }],
        ['Janelinha: repetir', `closeAllSheets(); duplicateTask(db.find((x) => x.date === '2026-11-16').id, { stopPropagation() {} }); promptCloneQtd('daily');`, '#clone-qtd-modal', { depois: 'cancelCloneQtd();' }], // V40.36.1: −/+ e o resumo
        ['Tarefa na mão', `closeAllSheets(); scheduleBacklogItem(backlogDb[0].id);`, '#floating-task', { depois: 'cancelPendingTask();' }],
        ['Barrinha do Desfazer', `closeAllSheets(); (() => { const b = db.find((x) => x.date === '2026-11-16'); toggleBlockCompletion(b.id, { stopPropagation() {} }); })();`, '#undo-bar', { espera: 400, depois: '(() => { const b = db.find((x) => x.date === "2026-11-16"); toggleBlockCompletion(b.id, { stopPropagation() {} }); undoBarHide && undoBarHide(); })();' }]
    ];

    for (const ip of IPHONES) {
        console.log(`\n${ip.nome} (${ip.w}×${ip.h}, ` + (ip.android ? `barra de navegação ${ip.bot} px):` : `barra de status ${ip.top} px, risco de início ${ip.bot} px):`));
        const { ctx, m } = await abrirIphone(ip);
        for (const [nome, abre, raiz, opts] of TELAS) {
            try { if (abre) await m.evaluate(abre); } catch (e) { ok(false, `${nome}: não abriu (${String(e.message || e).slice(0, 120)})`); continue; }
            await m.waitForTimeout((opts && opts.espera) || 450);
            const probs = await conferir(m, ip, raiz, opts);
            const lista = probs.map((p) => `${p.tipo}: ${p.quem} [${p.rect}]`);
            ok(!probs.length, `${nome}` + (probs.length ? ':\n        - ' + lista.slice(0, 8).join('\n        - ') + (lista.length > 8 ? `\n        (+${lista.length - 8})` : '') : ''));
            if (ip.w === 390 || ip.android) await foto(m, (ip.foto || 'iphone-') + nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png');
            if (opts && opts.depois) { try { await m.evaluate(opts.depois); } catch (e) {} await m.waitForTimeout(150); }
        }
        await ctx.close();
    }
    ok(errs.length === 0, 'nenhum erro de página' + (errs.length ? ': ' + errs[0].slice(0, 160) : ''));
    await fim();
})().catch((e) => { console.error('ERRO', e); process.exit(2); });
