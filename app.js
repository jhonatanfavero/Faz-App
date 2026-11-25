// --- 1. FÍSICA UNIVERSAL ---
// V40.2.22 — Micro-ajuste de conforto (decisão Jules):
//   ANTES: 2.5px/min → 1h ocupava 150px, cards de 15min apertados (37.5px)
//   AGORA: 3.0px/min → 1h ocupa 180px, cards de 15min com 45px (ideal pros botões w-7 h-7 = 28px)
//   POR QUE NÃO IR MAIS ALTO: Jules vetou escalas 4.0/5.0 — destruiriam a "Bird's-Eye View"
//   (visão panorâmica do dia inteiro). Card de 5min só vai ser viável quando tivermos
//   movimento de pinça/zoom (planejado pra V41).
const PX_PER_MIN = 3.0; 

// VARIÁVEIS DE HORÁRIO AGORA SÃO DINÂMICAS E SALVAS NO LOCALSTORAGE
let storedStart = localStorage.getItem('tb_start_hour');
let storedEnd = localStorage.getItem('tb_end_hour');

let START_HOUR = storedStart !== null ? parseInt(storedStart) : 0;  // Padrão 00:00
let END_HOUR = storedEnd !== null ? parseInt(storedEnd) : 24;       // Padrão 24:00
let TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

let currentRealMins = 0;
let pendingIntent = null; 
let selectedDur = 30;
let showOnlyDelayed = false;
// V2.0 - BLOCO 2
let showOnlyCompleted = false;
let taskToClone = null;
let pendingCloneType = '';
let selectedTagId = null;
let selectedGoalId = null; // V40.34.0: meta escolhida no + (vai pro bloco)
// V40.3.2 FIX: declarado no topo do arquivo pra evitar ReferenceError (TDZ)
//   quando renderTimeline() é chamado no init (linha ~2589) ANTES do bloco V40.3.2
//   ser executado (linha ~3211). typeof em variável let em TDZ LANÇA erro, não retorna 'undefined'.
let mbDragActive = false;
// V40.3.5-fix2 FIX (mesma lição do TDZ): renderBacklog é chamado no init e usa
//   expandedBacklogIds.has(). expandedRoutineIds idem (chamada via renderRoutinesList em
//   eventos posteriores, mas movida junto pra coerência). Declaradas aqui no topo pra
//   evitar ReferenceError fatal que parava o init e deixava botão Lista + toggleHeader
//   + updateThoughtBtnVisibility sem funcionar.
let expandedBacklogIds = new Set();
let expandedRoutineIds = new Set();
// V40.4.1: estado financeiro no topo (lição TDZ V40.3.2 — declarar antes do init).
// V40.8.0: leitura protegida do localStorage. Se um dado salvo estiver corrompido, o app ABRE
// mesmo assim: guarda o valor cru em tb__corrompido_<chave> (interno, fora do backup), usa o
// padrão e apaga o histórico do sync (tb__sync) pra próxima sincronização JUNTAR em vez de
// interpretar a lista vazia como "apagou tudo".
function fazLoadList(key, fallback) {
    let raw = null;
    try {
        raw = localStorage.getItem(key);
        if (raw === null || raw === '') return fallback;
        const v = JSON.parse(raw);
        if (Array.isArray(v)) return v;
        if (v === null) return fallback;
        throw new Error('formato inesperado');
    } catch (e) {
        (window.fazCorruptKeys = window.fazCorruptKeys || []).push(key);
        try { if (raw != null) localStorage.setItem('tb__corrompido_' + key, raw); } catch (e2) {}
        try { localStorage.removeItem('tb__sync'); } catch (e3) {}
        console.error('[Faz] dado corrompido em', key, e);
        return fallback;
    }
}
let financialDb = fazLoadList('tb_financial_db', []);
// V40.4.3-fix (Gemini): fuso horário — toISOString() retorna UTC, então no fim do mês
// às 21h+ no Brasil (UTC-3) já mostrava o mês seguinte e marcava tudo como atrasado.
// Usar getFullYear() + getMonth() do Date local resolve.
function getLocalMonthStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
let currentFinanceMonth = getLocalMonthStr(); // 'YYYY-MM' do mês atual (local, não UTC)
function saveFinancial() { localStorage.setItem('tb_financial_db', JSON.stringify(financialDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('financas'); } // V40.17.0: finanças vão pra nuvem (V40.25.0: + desfazer)

// ===== V40.4.4: HELPERS RECORRENTE + PARCELADA =====
// Declarados no TOPO pra evitar TDZ (lição V40.3.2 e V40.3.5-fix2).

// G1: retrocompat — itens antigos (V40.4.1-3) têm 'month', novos têm 'startMonth'.
function getItemStartMonth(item) {
    return item.startMonth || item.month;
}

// G4 + G15: soma N meses ao startMonth, retorna endMonth no fuso local.
// Ex: addMonths('2026-05', 9) = '2027-02' (parcelada 10x = de Maio a Fevereiro, 10 meses inclusive)
function addMonths(monthStr, n) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1); // local (não UTC)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// G11: decide se item aparece num mês específico.
// Avulsa (durationMonths=1 OU sem durationMonths): só no startMonth.
// Recorrente/Parcelada (durationMonths>1): de startMonth até startMonth+durationMonths-1 (inclusive).
function isItemInMonth(item, monthStr) {
    const start = getItemStartMonth(item);
    if (!start) return false;
    
    const duration = item.durationMonths || 1;
    if (duration === 1) {
        return start === monthStr;
    }
    
    const endMonth = addMonths(start, duration - 1);
    return monthStr >= start && monthStr <= endMonth;
}

// G2: retrocompat de paid. Item antigo (V40.4.1-3) tem paid:bool aplicado a item.month.
// Item novo (V40.4.4+) tem paidMonths:[]. isPaidInMonth aceita ambos.
function isPaidInMonth(item, monthStr) {
    if (Array.isArray(item.paidMonths)) {
        return item.paidMonths.includes(monthStr);
    }
    // Retrocompat: paid:true antigo só vale pro startMonth do item
    return item.paid === true && getItemStartMonth(item) === monthStr;
}

// G7: calcula "parcela X/N" pra parceladas. Retorna null se não-parcelada ou fora do range.
function getInstallmentLabel(item, monthStr) {
    const duration = item.durationMonths || 1;
    if (duration <= 1 || item.isRecurring) return null; // não é parcelada
    if (!isItemInMonth(item, monthStr)) return null;
    
    const start = getItemStartMonth(item);
    const [sy, sm] = start.split('-').map(Number);
    const [my, mm] = monthStr.split('-').map(Number);
    const idx = (my - sy) * 12 + (mm - sm) + 1; // 1-indexed
    return `${idx}/${duration}`;
}

// G2: marca/desmarca paga em um mês específico (cria paidMonths se não existir).
function setPaidInMonth(item, monthStr, paid) {
    if (!Array.isArray(item.paidMonths)) {
        // Migra retrocompat: se item antigo tinha paid:true no startMonth, mantém
        item.paidMonths = (item.paid === true) ? [getItemStartMonth(item)] : [];
        delete item.paid; // remove campo antigo pra não confundir
    }
    if (paid) {
        if (!item.paidMonths.includes(monthStr)) item.paidMonths.push(monthStr);
    } else {
        item.paidMonths = item.paidMonths.filter(m => m !== monthStr);
    }
}

// ===== V40.4.5 (fix14): HELPERS DE OVERRIDE DE VALOR POR MÊS =====
// Schema: item.paidMonthsOverrides = { 'YYYY-MM': { amount: number } }
// Retrocompat: itens antigos sem paidMonthsOverrides → getAmountInMonth retorna item.amount (fallback natural).
// fix14 entrega apenas os helpers; modal + saveFinancialForm refatorado vêm na fix15.

// G16: retorna valor do item num mês específico. Se houver override, usa ele; senão, item.amount.
function getAmountInMonth(item, monthStr) {
    if (item.paidMonthsOverrides && item.paidMonthsOverrides[monthStr]) {
        return item.paidMonthsOverrides[monthStr].amount;
    }
    return item.amount;
}

// G17: aplica override em UM mês específico (cria paidMonthsOverrides se não existir).
function setOverrideForMonth(item, monthStr, amount) {
    if (!item.paidMonthsOverrides) item.paidMonthsOverrides = {};
    item.paidMonthsOverrides[monthStr] = { amount: amount };
}

// G18: aplica override em ESTE mês e todos os futuros (até endMonth do item, respeitando durationMonths).
// PRESERVA overrides de meses ANTERIORES a fromMonthStr (lição T8 da simulação).
function setOverrideThisAndFuture(item, fromMonthStr, amount) {
    if (!item.paidMonthsOverrides) item.paidMonthsOverrides = {};
    const start = getItemStartMonth(item);
    const duration = item.durationMonths || 1;
    const endMonth = addMonths(start, duration - 1);
    let cursor = fromMonthStr;
    let guard = 0; // proteção contra loop infinito (F9)
    while (cursor <= endMonth && guard < 120) {
        item.paidMonthsOverrides[cursor] = { amount: amount };
        cursor = addMonths(cursor, 1);
        guard++;
    }
}

// G19: limpa TODOS overrides e altera item.amount global ("Todos os meses").
function setAmountAllMonths(item, amount) {
    item.amount = amount;
    delete item.paidMonthsOverrides;
}

// G20 (fix15): remove overrides FORA do range [startMonth, endMonth] do item.
// Útil ao reduzir durationMonths (parcelada 10→5) ou trocar tipo. Evita lixo no localStorage.
function cleanupOverridesOutsideRange(item) {
    if (!item.paidMonthsOverrides) return;
    const start = getItemStartMonth(item);
    const duration = item.durationMonths || 1;
    const endMonth = addMonths(start, duration - 1);
    const validKeys = Object.keys(item.paidMonthsOverrides).filter(k => k >= start && k <= endMonth);
    if (validKeys.length === 0) {
        delete item.paidMonthsOverrides;
        return;
    }
    const newOverrides = {};
    validKeys.forEach(k => { newOverrides[k] = item.paidMonthsOverrides[k]; });
    item.paidMonthsOverrides = newOverrides;
}

// ===== V40.30.0: RECORRENTE SEM FIM (escolha do Jhonatan em 17/11: "sem fim, até encerrar") =====
// Antes a recorrente valia 12 meses e sumia (o "renovar" prometido no formulário nunca existiu). Agora ela repete todo
// mês até a pessoa tocar em "Encerrar". "Sem fim" = durationMonths 1200 (100 anos: o máximo que a nuvem aceita; uma
// versão antiga do app entende como "por muito tempo"). Encerrar = durationMonths até o último mês. As recorrentes que
// já existiam (12 meses) viraram sem fim pela migration faz_v40_30_0_recorrente_sem_fim. O PC usa as mesmas regras.
const REC_OPEN = 1200;
function isOpenRecurring(item) { return !!item && item.isRecurring === true && (item.durationMonths || 1) >= REC_OPEN; }
function getItemEndMonth(item) { return addMonths(getItemStartMonth(item), (item.durationMonths || 1) - 1); }
function monthsBetween(a, b) { const [ay, am] = a.split('-').map(Number), [by, bm] = b.split('-').map(Number); return (by - ay) * 12 + (bm - am); }
const FIN_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function finMonthLong(m) { const [y, mm] = m.split('-'); return FIN_MONTHS[Number(mm) - 1] + ' de ' + y; }        // "novembro de 2026"
function finMonthShort(m) { return m.slice(0, 4) === getLocalMonthStr().slice(0, 4) ? FIN_MONTHS[Number(m.slice(5)) - 1] : finMonthLong(m); } // do ano de hoje: só o nome
// "Neste e nos próximos" numa recorrente: o valor normal passa a ser o novo e os meses de antes guardam o valor que
// tinham (sem escrever um valor pra cada mês do futuro, que na sem fim seriam 1200).
function setAmountFromMonthOn(item, fromMonthStr, amount) {
    const start = getItemStartMonth(item), old = Number(item.amount) || 0, ov = Object.assign({}, item.paidMonthsOverrides || {});
    for (let c = start, g = 0; c < fromMonthStr && g < REC_OPEN; c = addMonths(c, 1), g++) if (!ov[c]) ov[c] = { amount: old };
    Object.keys(ov).forEach(k => { if (k >= fromMonthStr) delete ov[k]; });
    item.amount = amount;
    if (Object.keys(ov).length) item.paidMonthsOverrides = ov; else delete item.paidMonthsOverrides;
}
// V2.0 - Estado do header
// V40.2.28: persistido em localStorage. Default false (1ª vez = expandido pra Descoberta).
//   Depois que o usuário escolhe (toggleHeader), a escolha vira a nova default.
let headerHidden = localStorage.getItem('tb_header_collapsed') === 'true';
let themeColor = localStorage.getItem('tb_theme_color') || '#4f46e5';
let searchQuery = ''; // V40.2.5: termo de busca por título do cartão

// POPULA OS DROPDOWNS DO NOVO MENU DE JANELA DE HORÁRIOS
const startSelect = document.getElementById('config-hour-start');
const endSelect = document.getElementById('config-hour-end');
for(let i=0; i<24; i++) {
    startSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')}:00</option>`;
}
for(let i=1; i<=24; i++) {
    endSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')}:00</option>`;
}

// --- GESTÃO DE DIAS ---
let activeDateObj = new Date();
function getActiveDateStr() { return activeDateObj.toLocaleDateString('en-CA'); } // YYYY-MM-DD
function getTodayStr() { return new Date().toLocaleDateString('en-CA'); }

// --- 2. O BANCO DE DADOS ---
let db = fazLoadList('tb_master_db', null);
let backlogDb = fazLoadList('tb_backlog_db', []);
let backlogSelectedDur = 30;

// ===== V40.5.0: KANBAN — colunas no backlog =====
// Schema: { id, name, isDefault, createdAt }
// Coluna "Geral" (id: 'col_geral') é criada automaticamente. Não pode ser apagada.
let backlogColumnsDb = fazLoadList('tb_backlog_columns', []);
let activeColumnId = 'col_geral'; // coluna que está sendo visualizada (pra criar nova tarefa nela)

function saveBacklogColumns() {
    localStorage.setItem('tb_backlog_columns', JSON.stringify(backlogColumnsDb));
    if (window.fazSyncNotify) window.fazSyncNotify(); // V40.7.0: avisa o sync (só age se logado)
    undoTouch('listas'); // V40.25.0
}

// K3: garante que coluna padrão Geral sempre existe (executa no init e antes de operações).
function ensureDefaultColumn() {
    const hasDefault = backlogColumnsDb.some(c => c.id === 'col_geral');
    if (!hasDefault) {
        backlogColumnsDb.unshift({
            id: 'col_geral',
            name: 'Geral',
            isDefault: true,
            createdAt: Date.now()
        });
        undoQuiet(saveBacklogColumns); // V40.25.0: a Geral que nasce sozinha não vira passo do Desfazer
    }
}

// K2: retrocompat — tarefas sem columnId vão pra Geral
function getItemColumn(item) {
    return item.columnId || 'col_geral';
}

// Chama uma vez no carregamento.
ensureDefaultColumn();

// V40.1: Super Gabinete - Notas livres do dia
let notesDb = fazLoadList('tb_notes_db', []);
let activeListTab = 'backlog'; // 'backlog' | 'routines' | 'notes'

// V40.3 — MOTOR DE ROTINAS (Fase 1: CRUD).
// Default: 3 rotinas de exemplo viciantes pra Discoverability (mesmo princípio do header em V40.2.28).
let routinesDb = fazLoadList('tb_routines_db', null);
// V40.17.0: os exemplos só nascem num aparelho novo (sem tb_routines_db). Antes voltavam sempre que a
// lista ficava vazia; com as rotinas na nuvem, apagar todas no PC faria os exemplos reaparecerem.
if (!routinesDb) {
    routinesDb = [
        {
            id: 'rt_ex1', title: 'Manhã Produtiva', emoji: '🌞', duration: 120, theme: 'focus', tagId: null,
            microblocks: [{title: 'Meditação e Café'}, {title: 'Revisar métricas de ontem'}, {title: 'Planejar o dia (Top 3)'}, {title: 'Email/Mensagens'}, {title: 'Leitura técnica'}],
            createdAt: Date.now() - 2000
        },
        {
            id: 'rt_ex2', title: 'Rotina Noturna', emoji: '🌙', duration: 60, theme: 'rest', tagId: null,
            microblocks: [{title: 'Higiene pessoal'}, {title: 'Organizar amanhã'}, {title: 'Ler 10 minutos'}, {title: 'Meditação curta'}],
            createdAt: Date.now() - 1000
        },
        {
            id: 'rt_ex3', title: 'Treino', emoji: '💪', duration: 45, theme: 'focus', tagId: null,
            microblocks: [{title: 'Aquecimento'}, {title: 'Cardio'}, {title: 'Força - Superiores'}, {title: 'Força - Core'}, {title: 'Alongamento'}],
            createdAt: Date.now()
        }
    ];
    localStorage.setItem('tb_routines_db', JSON.stringify(routinesDb));
}
function saveRoutinesDb() { localStorage.setItem('tb_routines_db', JSON.stringify(routinesDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('rotinas'); } // V40.17.0: rotinas vão pra nuvem

let periodsDb = fazLoadList('tb_periods_db', null);
if (!periodsDb) { // V40.41.0: só quando não tem nada guardado (apagou todos de propósito = continua sem nenhum; antes os padrão voltavam)
    periodsDb = [
        { id: 'p1', name: 'Manhã', start: '08:00', end: '12:00' },
        { id: 'p2', name: 'Meio-dia', start: '12:00', end: '13:00' },
        { id: 'p3', name: 'Tarde', start: '13:00', end: '18:00' },
        { id: 'p4', name: 'Noite', start: '18:00', end: '22:00' }
    ];
    localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb));
}

let tagsDb = fazLoadList('tb_tags_db', null);
if (!tagsDb || tagsDb.length === 0) {
    tagsDb = [
        { id: 'tag_1', name: 'Trabalho', color: '#ef4444' }, // Vermelho
        { id: 'tag_2', name: 'Pessoal', color: '#10b981' },  // Verde
        { id: 'tag_3', name: 'Estudo', color: '#f59e0b' }    // Amarelo
    ];
    localStorage.setItem('tb_tags_db', JSON.stringify(tagsDb));
}

// V40.8.0: cor de tag só em #hex (ela vai dentro de atributo style).
tagsDb.forEach(t => { if (t && !/^#[0-9a-fA-F]{3,8}$/.test(String(t.color || ''))) t.color = '#a1a1aa'; });

if (!db || db.length === 0) {
    const nowH = new Date().getHours();
    const startH = Math.max(START_HOUR, Math.min(nowH + 2, END_HOUR - 1));
    db = [ { 
        id: 'seed_1', 
        title: 'Reunião de Alinhamento', 
        startMin: startH * 60, 
        duration: 60, 
        type: 'focus', 
        date: getTodayStr(),
        tagId: null,
        microblocks: [{ id: 'm_1', title: 'Apresentar slides', done: false }]
    } ];
    saveDb();
} else {
    // Migração
    let modified = false;
    db.forEach(b => { 
        if(!b.date) { b.date = getTodayStr(); modified = true; }
        if(!b.microblocks) { b.microblocks = []; modified = true; }
        if(b.tagId === undefined) { b.tagId = null; modified = true; } // NOVA MIGRAÇÃO DE TAG
        if(!b.linkedNoteIds) { b.linkedNoteIds = []; modified = true; } // V40.2: notas vinculadas
    });
    if(modified) saveDb();
}

// V40.25.0: cada save avisa o Desfazer (undoTouch, lá no fim do arquivo), que guarda o que mudou.
function saveDb() { localStorage.setItem('tb_master_db', JSON.stringify(db)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('blocos'); } // V40.8.0: agenda vai pra nuvem (só ida)
function saveBacklog() { localStorage.setItem('tb_backlog_db', JSON.stringify(backlogDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('tarefas'); } // V40.7.0: + aviso ao sync
function savePeriods() { localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb)); undoTouch('periodos'); fazPeriodsTouch(); } // V40.41.0: vão pro PC (na conta)
function saveTags() { localStorage.setItem('tb_tags_db', JSON.stringify(tagsDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('tags'); } // V40.7.0: + aviso ao sync

// --- FUNÇÕES DE TAGS ---
window.addTag = function(name, color) {
    if(!name || !color) return;
    tagsDb.push({ id: 'tag_' + Date.now(), name: name.trim(), color: color });
    saveTags();
}

window.deleteTag = function(id) {
    tagsDb = tagsDb.filter(t => t.id !== id);
    saveTags();
    if (agTagFilter === id) { agTagFilter = ''; agFilterSave(); renderTimeline(); } // V40.45.0: era a tag do filtro da agenda
    
    // Remove a tag deletada das tarefas que a usavam para não quebrar a UI
    let modified = false;
    db.forEach(b => {
        if(b.tagId === id) { b.tagId = null; modified = true; }
    });
    if(modified) { saveDb(); renderTimeline(); }
    
    // V40.2.9: atualiza a lista visual de tags na sheet (bug: antes ficava com tag fantasma)
    renderTagsList();
    showToast("Tag excluída!");
}

window.getTagColor = function(tagId) {
    if(!tagId) return null;
    const tag = tagsDb.find(t => t.id === tagId);
    return tag ? tag.color : null;
}

let selectedNewTagColor = '#ef4444'; // Vermelho padrão

window.openTagsSheet = () => {
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    closeAllSheets();
    renderTagsList();
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('tags-sheet').classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7
}

window.selectTagColor = (btn) => {
    document.querySelectorAll('.tag-color-btn').forEach(b => {
        b.classList.remove('scale-110', 'shadow-sm', 'border-zinc-900');
        b.classList.add('border-transparent');
    });
    btn.classList.remove('border-transparent');
    btn.classList.add('scale-110', 'shadow-sm', 'border-zinc-900');
    selectedNewTagColor = btn.dataset.color;
}

window.commitNewTag = () => {
    const input = document.getElementById('new-tag-name');
    const name = input.value.trim();
    if(!name) return showToast("Digite um nome para a Tag.");
    
    addTag(name, selectedNewTagColor);
    input.value = '';
    renderTagsList();
    showToast("Tag Criada!");
}

function renderTagsList() {
    const container = document.getElementById('tags-list-container');
    if(tagsDb.length === 0) {
        container.innerHTML = `<p class="text-center text-zinc-400 text-sm mt-4">Nenhuma tag criada.</p>`;
        return;
    }
    
    container.innerHTML = tagsDb.map(t => `
        <div class="flex items-center justify-between p-3 bg-white border border-zinc-200 rounded-xl">
            <div class="flex items-center gap-3">
                <div class="w-4 h-4 rounded-full" style="background-color: ${t.color};"></div>
                <span class="font-bold text-sm text-zinc-800">${escapeHtml(t.name)}</span>
            </div>
            <button onclick="deleteTag('${t.id}')" class="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Excluir">
                <i class="ph ph-trash text-lg"></i>
            </button>
        </div>
    `).join('');
}

window.selectTag = function(id) {
    selectedTagId = selectedTagId === id ? null : id;
    renderTagSelector();
}
window.selectNewGoal = function(id) { selectedGoalId = goalKeep(id || null); goalPickFill('goal-pick-new-wrap', 'goal-pick-new', selectedGoalId, 'selectNewGoal'); goalNamePlaceholder('task-input', selectedGoalId, 'Nome da tarefa'); }; // V40.34.0
// V40.36.1: escolheu uma meta: o campo do nome mostra o nome dela (clarinho). Deixar vazio = fica com o nome da meta.
function goalNamePlaceholder(inputId, goalId, normal) {
    const el = document.getElementById(inputId), g = goalById(goalKeep(goalId));
    if (el) el.placeholder = g && g.title ? String(g.title) : normal;
}
function renderTagSelector() {
    const container = document.getElementById('tag-selector-container');
    if(!container) return;
    container.className = 'flex gap-2 overflow-x-auto no-scrollbar pb-2 w-full';
    let html = `<button onclick="selectTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${selectedTagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}">Sem Tag</button>`;
    tagsDb.forEach(t => {
        const isActive = selectedTagId === t.id;
        const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100';
        html += `
            <button onclick="selectTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}">
                <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>
                ${escapeHtml(t.name)}
            </button>
        `;
    });
    container.innerHTML = html;
}

// --- 3. AUTOMAÇÃO: O TEMPO E DIAS ---
window.debugPreviousDay = function() {
    if (searchQuery) closeSearchBar(); // V40.2.5: limpa busca ao trocar dia
    activeDateObj.setDate(activeDateObj.getDate() - 1);
    runRealTimeEngine();
    renderTimeline();
}

window.goToToday = function() {
    if (searchQuery) closeSearchBar(); // V40.2.5: limpa busca ao trocar dia
    activeDateObj = new Date();
    runRealTimeEngine();
    renderTimeline();
}

window.debugAdvanceDay = function() {
    if (searchQuery) closeSearchBar(); // V40.2.5: limpa busca ao trocar dia
    activeDateObj.setDate(activeDateObj.getDate() + 1);
    runRealTimeEngine();
    renderTimeline();
}

window.toggleFilterDelayed = function() {
    showOnlyDelayed = !showOnlyDelayed;
    showOnlyCompleted = false; 
    
    // V40.2.12: visual MUITO mais óbvio — quando ativo, vira CTA cheio (bg-app-focus + texto branco)
    // antes só mudava 8% → 15% de opacidade, era imperceptível
    updateFilterButtonsVisual();
    renderTimeline();
}

window.toggleFilterCompleted = function() {
    showOnlyCompleted = !showOnlyCompleted;
    showOnlyDelayed = false; 
    
    updateFilterButtonsVisual();
    renderTimeline();
}

// V40.2.12: atualiza visual dos botões de filtro de forma centralizada
function updateFilterButtonsVisual() {
    const btnDelayed = document.getElementById('filter-delayed-btn');
    const btnCompleted = document.getElementById('filter-completed-btn');
    
    if (btnDelayed) {
        if (showOnlyDelayed) {
            // ATIVO: fundo sólido da cor do tema + ícone branco + ring pra reforçar
            btnDelayed.className = 'bg-app-focus border-2 border-app-focus p-2 rounded-xl shadow-md ring-2 ring-app-focus-soft transition flex items-center justify-center shrink-0';
            const icon = btnDelayed.querySelector('i');
            if (icon) icon.className = 'ph-fill ph-info text-lg text-white';
        } else {
            // INATIVO: soft + ícone colorido
            btnDelayed.className = 'bg-app-focus-soft border border-app-focus-soft p-2 rounded-xl hover:bg-app-focus-soft-strong transition flex items-center justify-center shrink-0';
            const icon = btnDelayed.querySelector('i');
            if (icon) icon.className = 'ph-bold ph-info text-lg text-app-focus';
        }
    }
    
    if (btnCompleted) {
        if (showOnlyCompleted) {
            // ATIVO: fundo verde sólido + ícone branco + ring
            btnCompleted.className = 'bg-emerald-500 border-2 border-emerald-500 p-2 rounded-xl shadow-md ring-2 ring-emerald-100 transition flex items-center justify-center shrink-0';
            const icon = btnCompleted.querySelector('i');
            if (icon) icon.className = 'ph-fill ph-check-circle text-lg text-white';
        } else {
            // INATIVO: verde claro + ícone verde
            btnCompleted.className = 'bg-emerald-50 border border-emerald-200 p-2 rounded-xl hover:bg-emerald-100 transition flex items-center justify-center shrink-0';
            const icon = btnCompleted.querySelector('i');
            if (icon) icon.className = 'ph-bold ph-check-circle text-lg text-emerald-500';
        }
    }
}

// V40.2.1: Limpa ambos os filtros e atualiza visual dos botões
// V40.2.5: também limpa busca por nome
// V40.2.12: usa updateFilterButtonsVisual em vez de replace manual
window.clearFilters = function() {
    const hadFilters = showOnlyDelayed || showOnlyCompleted;
    const hadSearch = !!searchQuery;
    if (!hadFilters && !hadSearch) return false; // nada a fazer
    
    showOnlyDelayed = false;
    showOnlyCompleted = false;
    
    updateFilterButtonsVisual();
    
    // V40.2.5: limpa busca também
    if (hadSearch) closeSearchBar();
    
    renderTimeline();
    return true;
}

// V40.2.5: Normaliza texto pra busca (remove acentos + lowercase)
function normalizeText(str) {
    if (!str) return '';
    return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// V40.2.24: Helper centralizado de match de busca em cards.
//   Busca em 3 campos (Opção B aprovada por Jules + Jhonatan; V40.35.0: + cartões da sublista e o checklist deles):
//   1. Título do cartão (b.title)
//   2. Microblocos (b.microblocks[].title)
//   3. Nome da tag (tagsDb.find(t => t.id === b.tagId).name)
//
//   Notas vinculadas (linkedNoteIds) foram propositalmente EXCLUÍDAS do escopo —
//   adicionariam custo de O(n × m) (cards × notas) por keystroke, e notas têm sua
//   própria sheet pra navegar.
//
//   Argumento `normalizedQuery` recebe a string já passada por normalizeText()
//   pra não chamar normalizeText 4 vezes por bloco. Performance.
function cardMatchesSearch(block, normalizedQuery) {
    if (!normalizedQuery || !block) return false;
    // V40.35.0: cada palavra digitada tem que aparecer em algum lugar (nome, checklist, cartões da sublista e o
    // checklist deles, tag): "geo qualite" acha "GEO ADAO" da tag QUALITÊ. As mesmas regras da busca do PC.
    // Uma palavra só (ou o mesmo trecho seguido) acha tudo o que já achava antes.
    const words = normalizedQuery.split(/\s+/).filter(Boolean);
    if (!words.length) return false;
    const parts = [block.title]; // 1. Título do cartão
    // 2. Microblocos (checklist interna)
    if (Array.isArray(block.microblocks)) block.microblocks.forEach(mb => { if (mb) parts.push(mb.title); });
    // 2b. V40.24.0: cartões da sublista (V40.35.0: e o checklist de cada cartão)
    if (isSublist(block)) block.cards.forEach(c => {
        if (!c) return;
        parts.push(c.title);
        if (Array.isArray(c.microblocks)) c.microblocks.forEach(mb => { if (mb) parts.push(mb.title); });
    });
    // 3. Nome da tag (se tiver tag vinculada)
    if (block.tagId) {
        const tag = tagsDb.find(t => t.id === block.tagId);
        if (tag) parts.push(tag.name);
    }
    const hay = normalizeText(parts.filter(Boolean).join('\n'));
    return words.every(w => hay.includes(w));
}

// V40.2.5: Abre a barra de busca
window.openSearchBar = function() {
    // Limpa outros filtros pra evitar combinações confusas
    if (showOnlyDelayed || showOnlyCompleted) {
        showOnlyDelayed = false;
        showOnlyCompleted = false;
        updateFilterButtonsVisual(); // V40.2.12: usa função centralizada
    }
    
    const row = document.getElementById('search-bar-row');
    const cluster = document.getElementById('header-btns-cluster');
    if (row) { row.classList.remove('hidden'); row.classList.add('flex'); }
    if (cluster) cluster.classList.add('hidden');
    
    // V40.2.28: ao abrir search, header cresce (search-bar aparece). Recalcula paddingTop
    // da timeline pra cards não ficarem atrás do header crescido.
    setTimeout(adjustTimelinePadding, 50);
    
    setTimeout(() => {
        const input = document.getElementById('search-input');
        if (input) input.focus();
    }, 100);
}

// V40.2.11: handler de clique fora REMOVIDO.
// Motivo: causava bugs (fechava ao tocar em áreas vazias do header que tinham pointer-events-none
// e vazavam pra trás). A busca tem botão X bem visível e fecha automaticamente quando o usuário
// muda de contexto (trocar dia, abrir FAB+, abrir menus). Não precisa do listener global.
// Mantemos a função vazia pra retrocompatibilidade caso algo ainda a chame.
function handleClickOutsideSearch(e) {
    // Removido em V40.2.11 — busca só fecha via X explícito ou ações de troca de contexto
    return;
}

window.closeSearchBar = function() {
    searchQuery = '';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    
    const row = document.getElementById('search-bar-row');
    const cluster = document.getElementById('header-btns-cluster');
    if (row) { row.classList.add('hidden'); row.classList.remove('flex'); }
    if (cluster) cluster.classList.remove('hidden');
    
    const counter = document.getElementById('search-counter');
    if (counter) { counter.classList.add('hidden'); counter.innerText = ''; }
    
    // V40.2.11: listener de clique fora foi removido — não há mais nada pra limpar aqui
    // V40.2.28: header voltou ao tamanho original (sem search-bar), recalcula paddingTop.
    setTimeout(adjustTimelinePadding, 50);
    
    renderTimeline();
}

window.onSearchInput = function(value) {
    searchQuery = value || '';
    renderTimeline();
    // Atualizar contador após render
    setTimeout(updateSearchCounter, 10);
}

// V40.2.5: Atualiza contador "X resultados de Y"
// V40.2.6: agora conta em todos os dias do db
function updateSearchCounter() {
    const counter = document.getElementById('search-counter');
    if (!counter) return;
    if (!searchQuery.trim()) {
        counter.classList.add('hidden');
        counter.innerText = '';
        return;
    }
    const q = normalizeText(searchQuery);
    // V40.2.24: usa cardMatchesSearch (título + microblocos + tag)
    const matched = db.filter(b => cardMatchesSearch(b, q)).length;
    counter.innerText = `${matched} ${matched === 1 ? 'resultado' : 'resultados'} de "${searchQuery}"`;
    counter.classList.remove('hidden');
}

function runRealTimeEngine() {
    const now = new Date();
    currentRealMins = (now.getHours() * 60) + now.getMinutes();
    
    const isToday = getActiveDateStr() === getTodayStr();
    const diffDays = Math.round((activeDateObj - now) / (1000 * 60 * 60 * 24));
    
    const headerTitle = document.getElementById('header-title');
    if (headerTitle) {
        headerTitle.innerText = diffDays === 0 ? "Hoje" : (diffDays === 1 ? "Amanhã" : "Agenda");
    }
    
    // V40.2.4: data com weekday completo sem "-feira" (Domingo, 10 mai)
    const currentYear = new Date().getFullYear();
    const activeYear = activeDateObj.getFullYear();
    const opts = { weekday: 'long', day: 'numeric', month: 'short' };
    if (activeYear !== currentYear) opts.year = '2-digit';
    let dateStr = activeDateObj.toLocaleDateString('pt-BR', opts);
    // Limpa "-feira" e pontos: "segunda-feira, 15 de mai." → "Segunda, 15 mai"
    dateStr = dateStr.replace(/-feira/g, '').replace(/\./g, '').replace(/ de /g, ' ');
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    const mDays = tlMultiDays(); // V40.26.0: agenda afastada mostra o intervalo ("16 – 18 nov")
    if (mDays.length) dateStr = tlRangeLabel(mDays);
    const hasToday = isToday || mDays.includes(getTodayStr());
    
    const hd = document.getElementById('header-date');
    const putDate = (t) => {
        hd.innerHTML = (hasToday ? `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span> ` : `<i class="ph ph-calendar text-zinc-400 text-lg"></i> `) +
            `<span class="font-bold text-zinc-800">${t}</span>`;
    };
    putDate(dateStr);
    // V40.32.2: em tela estreita (iPhone 13/mini, 375–390 px, com os 6 botões do lado) o nome do dia ficava cortado
    // ("Quarta, 18 r"). Não coube? Vai encurtando: "Qua, 18 nov" → "Qua, 18" → "18".
    if (!mDays.length && hd.scrollWidth > hd.clientWidth + 1) {
        const wk = activeDateObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace(/\./g, '');
        const Wk = wk.charAt(0).toUpperCase() + wk.slice(1), d = activeDateObj.getDate();
        const mo = activeDateObj.toLocaleDateString('pt-BR', { month: 'short' }).replace(/\./g, '');
        for (const t of [`${Wk}, ${d} ${mo}`, `${Wk}, ${d}`, String(d)]) {
            putDate(t);
            if (hd.scrollWidth <= hd.clientWidth + 1) break;
        }
    }
    // V40.43.0: com 2 ou 3 dias no iPhone mini (375 px), "16–18 nov" também ficava cortado: aí sai o mês ("16–18")
    if (mDays.length && hd.scrollWidth > hd.clientWidth + 1) {
        const a = tlDateObj(mDays[0]), z = tlDateObj(mDays[mDays.length - 1]);
        putDate(`${a.getDate()}–${z.getDate()}`);
    }

    const nowLine = document.getElementById('now-line');
    const nowMini = document.querySelector('#blocks-container .tl-now-mini');
    if (nowMini) nowMini.style.top = `${tlY(currentRealMins)}px`;
    if (mDays.length) {
        nowLine.style.display = 'none'; // V40.26.0: com vários dias, a linha do agora fica só na coluna de hoje
    } else if ((isToday && currentRealMins >= START_HOUR * 60 && currentRealMins <= END_HOUR * 60) && !showOnlyDelayed && !showOnlyCompleted) {
        const topPx = tlY(currentRealMins); // V40.24.0
        nowLine.style.top = `${topPx}px`;
        nowLine.style.display = 'flex';
        document.getElementById('now-badge').innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    } else {
        nowLine.style.display = 'none';
    }

    let modified = false;
    db.forEach(b => {
        if (b.type === 'focus') {
            const isPastDay = b.date < getTodayStr();
            const isPastTimeToday = b.date === getTodayStr() && (b.startMin + b.duration) <= currentRealMins;
            if (isPastDay || isPastTimeToday) {
                b.type = 'past'; modified = true;
            }
        }
    });

    if (modified) { saveDb(); renderTimeline(); }
}

setInterval(runRealTimeEngine, 60000);
// V40.35.0: a fonte do app (Inter) pode terminar de carregar DEPOIS da 1ª conta do nome do dia (o encurtar da V40.32.2
// mede com a fonte reserva, mais estreita). Quando ela chega, mede de novo: senão "Sex, 20 nov" ficava cortado no
// iPhone 13 mini. Também ao girar a tela / mudar o tamanho da janela.
try { if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { try { runRealTimeEngine(); } catch (e) {} }); } catch (e) {}
window.addEventListener('resize', () => { clearTimeout(window.__fazHdT); window.__fazHdT = setTimeout(() => { try { runRealTimeEngine(); } catch (e) {} }, 150); });

// --- MICROBLOCOS FUNCTIONS ---
window.toggleBlockCompletion = function(id, e) {
    e.stopPropagation();
    let b = db.find(x => x.id === id);
    if(b) goalWatch(() => { // V40.34.0: bloco ligado a uma meta que cumpriu ela: ⭐ e pontos
        if (isSublist(b) && b.cards.length) { // V40.24.0: sublista com cartões → marca (ou desmarca) todos
            const all = subCount(b).open === 0;
            b.cards.forEach(c => { c.done = !all; });
            subSyncDone(b);
        } else b.completed = !b.completed;
        saveDb();
        renderTimeline();
    });
}

window.addMicroblock = function(blockId, input, e) {
    if (!input.value.trim()) return;
    let b = db.find(x => x.id === blockId);
    if(b) {
        b.microblocks.push({ id: 'mb_' + Date.now(), title: input.value.trim(), done: false });
        saveDb();
        renderTimeline();
        setTimeout(() => {
            const newInput = document.getElementById(`micro-input-${blockId}`);
            if (newInput) newInput.focus();
        }, 50);
    }
}

window.toggleMicroblock = function(blockId, mbId, e) {
    let b = db.find(x => x.id === blockId);
    if(b && b.microblocks) {
        let mb = b.microblocks.find(x => x.id === mbId);
        if(mb) mb.done = !mb.done;
        saveDb();
        renderTimeline();
    }
}

window.deleteMicroblock = function(blockId, mbId, e) {
    let b = db.find(x => x.id === blockId);
    if(b && b.microblocks) {
        b.microblocks = b.microblocks.filter(x => x.id !== mbId);
        saveDb();
        renderTimeline();
    }
}

// --- 4. O MOTOR MATEMÁTICO ---
const container = document.getElementById('blocks-container');

// =====================================================
// V40.24.0 — OCULTAR VAGOS na agenda do celular (o "Compactar vagos" do PC)
// =====================================================
// Botão na linha dos filtros liga/desliga; fica guardado neste aparelho (tb__vagos_compactos, fora do backup).
// Ligado, cada vago de 30 min ou mais vira uma faixa de 36 px ("13:00–15:25 · livre 2h 25m"); o resto da régua
// continua na escala de sempre (3 px por minuto). tlY/tlMin convertem minuto ↔ pixel por trechos, como o
// agY/agMin do PC: fora das faixas a conta é exatamente a de antes (arrastar, esticar e a linha do agora seguem
// certos). Só na agenda normal: nos filtros e na busca (modo lista) não há régua.
const TL_GAP_MIN = 30, TL_GAP_PX = 36;
let tlCompact = false;
try { tlCompact = localStorage.getItem('tb__vagos_compactos') === '1'; } catch (e) {}
let tlSegs = null; // trechos da régua do dia na tela; null = escala normal
// V40.26.0: agenda afastada — 1, 2 ou 3 dias lado a lado (pinça ou o botão de colunas). Preferência do aparelho
// (tb__agenda_dias, fora do backup). O primeiro dia da tela é o activeDateObj.
var tlDays = 1;
try { const n = Number(localStorage.getItem('tb__agenda_dias')); if (n === 2 || n === 3) tlDays = n; } catch (e) {}
// V40.27.0: dia aberto tocando num bloco ou no nome do dia com 2 ou 3 dias na tela → o voltar do celular volta pra
// eles. { n, first, top }: quantos dias, o primeiro e a rolagem. Só na memória; sai ao voltar pra 2 ou 3 dias.
var tlBack = null;
function tlBuildSegs(list, lo, hi) {
    const segs = [];
    const add = (a, b, gap) => {
        if (b <= a) return;
        const last = segs[segs.length - 1];
        if (!gap && last && !last.gap) { last.b = b; last.px += (b - a) * PX_PER_MIN; return; } // trechos normais seguidos viram um só
        segs.push({ a: a, b: b, px: gap ? TL_GAP_PX : (b - a) * PX_PER_MIN, gap: gap });
    };
    let cur = lo;
    list.forEach(b => {
        const a = Math.max(lo, b.startMin), z = Math.min(hi, b.startMin + b.duration);
        if (z <= cur) return;
        if (a > cur) add(cur, a, a - cur >= TL_GAP_MIN);
        add(Math.max(a, cur), z, false);
        cur = z;
    });
    if (cur < hi) add(cur, hi, hi - cur >= TL_GAP_MIN);
    return segs.some(x => x.gap) ? segs : null; // sem vago grande: escala normal
}
function tlY(min) {
    if (!tlSegs) return (min - START_HOUR * 60) * PX_PER_MIN;
    let y = 0;
    if (min < tlSegs[0].a) return (min - tlSegs[0].a) * PX_PER_MIN;
    for (const sg of tlSegs) {
        if (min <= sg.b) return y + (sg.gap ? (min - sg.a) / (sg.b - sg.a) * sg.px : (min - sg.a) * PX_PER_MIN);
        y += sg.px;
    }
    return y + (min - tlSegs[tlSegs.length - 1].b) * PX_PER_MIN;
}
function tlMin(y) {
    if (!tlSegs) return START_HOUR * 60 + y / PX_PER_MIN;
    let acc = 0;
    if (y < 0) return tlSegs[0].a + y / PX_PER_MIN;
    for (const sg of tlSegs) {
        if (y <= acc + sg.px) return sg.a + (sg.gap ? (y - acc) / sg.px * (sg.b - sg.a) : (y - acc) / PX_PER_MIN);
        acc += sg.px;
    }
    return tlSegs[tlSegs.length - 1].b + (y - acc) / PX_PER_MIN;
}
function tlInGap(min) { return !!tlSegs && tlSegs.some(sg => sg.gap && min > sg.a && min < sg.b); }
function tlGapAt(min) { return tlSegs ? tlSegs.find(sg => sg.gap && sg.a === min) || null : null; }
function updateTlCompactBtn() {
    const b = document.getElementById('tl-compact-btn');
    if (!b) return;
    b.classList.toggle('tl-compact-on', tlCompact);
    b.setAttribute('aria-pressed', tlCompact ? 'true' : 'false');
    b.title = tlCompact ? 'Mostrar os vagos' : 'Ocultar os vagos';
}
window.toggleTlCompact = function() {
    tlCompact = !tlCompact;
    try { localStorage.setItem('tb__vagos_compactos', tlCompact ? '1' : '0'); } catch (e) {}
    updateTlCompactBtn();
    renderTimeline(); // V40.36.1: vale também com 2 ou 3 dias (some o horário livre em TODOS os dias da tela)
};
// =====================================================
// V40.45.0 — FILTRO DA AGENDA NO CELULAR (o "Todas as tags" e o "Ocultar concluídos" do PC)
// =====================================================
// O botão TAGs da linha dos filtros abre "Filtrar a agenda": uma tag (ou "Sem tag", que vale também pra tag que não
// existe mais, como no PC) e "Ocultar concluídos". Fica guardado neste aparelho (tb__filtro_tag e
// tb__ocultar_concluidos, fora do backup), como o "Ocultar vagos". Só esconde da tela, igual ao PC: o bloco escondido
// vira um contorno tracejado no horário dele (o espaço livre, o conflito, o "↓" e o Planejado contam todos os blocos).
// Na busca não vale (ela acha tudo); nos filtros de atrasados e concluídos, quem ele esconde sai da lista (o "Ocultar
// concluídos" não vale no "só concluídos"). "Gerenciar tags" (a tela de antes do botão) fica no pé da janelinha.
var agTagFilter = '', agHideDone = false; // "var": o renderTimeline pode rodar antes desta linha (como o subDrag)
try { agTagFilter = localStorage.getItem('tb__filtro_tag') || ''; agHideDone = localStorage.getItem('tb__ocultar_concluidos') === '1'; } catch (e) {}
function agFilterSave() {
    try { localStorage.setItem('tb__filtro_tag', agTagFilter); localStorage.setItem('tb__ocultar_concluidos', agHideDone ? '1' : '0'); } catch (e) {}
}
function agTagFind(id) { return id ? tagsDb.find(t => t && t.id === id) || null : null; }
function agTagOk() { // a tag escolhida foi apagada (aqui ou no PC): volta pra "Todas as tags"
    if (agTagFilter && agTagFilter !== '__none__' && !agTagFind(agTagFilter)) { agTagFilter = ''; agFilterSave(); }
}
function agFiltering() { agTagOk(); return !!agTagFilter || (agHideDone && !showOnlyCompleted); }
function agVisible(b) {
    if (!b) return false;
    if (agHideDone && b.completed && !showOnlyCompleted) return false;
    if (!agTagFilter) return true;
    return agTagFilter === '__none__' ? !agTagFind(b.tagId) : b.tagId === agTagFilter;
}
function agHiddenTxt(n) { return n ? ` · ${n} ${n === 1 ? 'escondido' : 'escondidos'}` : ''; }
function agSafeHex(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '#a1a1aa'; }
// O bloco escondido pelo filtro: só o contorno no horário dele. Tocar abre o filtro (com a tarefa na mão, nada: é horário ocupado).
function tlHiddenEl(b, mini) {
    const top = tlY(b.startMin), h = Math.max(tlY(b.startMin + b.duration) - top - 2, mini ? 4 : 6);
    const el = document.createElement('div');
    el.className = 'tl-hidden' + (mini ? ' mini' : '');
    el.style.top = (top + 1) + 'px';
    el.style.height = h + 'px';
    el.dataset.hiddenId = b.id;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${formatClock(b.startMin)}–${formatClock(b.startMin + b.duration)}: escondido pelo filtro (toque pra mudar o filtro)`);
    if (h >= 22) el.innerHTML = '<i class="ph ph-eye-slash"></i>';
    el.onclick = (e) => { e.stopPropagation(); if (!pendingIntent) openAgFilter(); };
    return el;
}
// O botão TAGs mostra o filtro ligado: cheio na cor do app, com a bolinha e o nome da tag (e o olho riscado).
function renderAgFilterBtn() {
    const btn = document.getElementById('ag-filter-btn');
    if (!btn) return;
    agTagOk();
    const tag = agTagFilter === '__none__' ? null : agTagFind(agTagFilter), on = !!agTagFilter || agHideDone;
    const key = [agTagFilter, agHideDone ? 1 : 0, tag ? tag.name + '|' + tag.color : ''].join('|');
    if (btn.dataset.agf === key) return;
    btn.dataset.agf = key;
    btn.classList.toggle('agf-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const name = tag ? (tag.name || 'Sem nome') : agTagFilter === '__none__' ? 'Sem tag' : 'TAGs';
    btn.innerHTML = (agHideDone ? '<i class="ph-bold ph-eye-slash text-sm text-app-focus"></i>' : '') +
        (tag ? `<span class="agf-dot" style="background:${agSafeHex(tag.color)}"></span>` : agHideDone ? '' : '<i class="ph ph-tag text-sm text-app-focus"></i>') +
        ` <span class="agf-txt">${escapeHtml(name)}</span>`;
    const what = [tag ? 'só ' + name : agTagFilter === '__none__' ? 'só os sem tag' : '', agHideDone ? 'sem os concluídos' : ''].filter(Boolean).join(', ');
    btn.setAttribute('aria-label', 'Filtrar a agenda' + (what ? ' (agora: ' + what + ')' : ''));
}
function renderAgFilterList() {
    const box = document.getElementById('ag-filter-list');
    if (!box) return;
    const rows = [{ id: '', name: 'Todas as tags' }]
        .concat(tagsDb.filter(t => t && t.id).map(t => ({ id: t.id, name: t.name || 'Sem nome', color: t.color })))
        .concat([{ id: '__none__', name: 'Sem tag' }]);
    box.innerHTML = rows.map(r => {
        const on = agTagFilter === r.id;
        return `<button type="button" role="radio" aria-checked="${on ? 'true' : 'false'}" class="agf-row${on ? ' on' : ''}" data-agf-tag="${escapeHtml(r.id)}">` +
            '<span class="agf-radio" aria-hidden="true"></span>' +
            (r.color ? `<span class="agf-dot" style="background:${agSafeHex(r.color)}"></span>` : '') +
            `<span class="flex-1 min-w-0 truncate">${escapeHtml(r.name)}</span></button>`;
    }).join('');
    box.querySelectorAll('[data-agf-tag]').forEach(b => { b.onclick = () => setAgTagFilter(b.dataset.agfTag); });
    const sw = document.getElementById('ag-filter-done');
    if (sw) sw.setAttribute('aria-checked', agHideDone ? 'true' : 'false');
}
window.openAgFilter = function() {
    agTagOk();
    renderAgFilterList();
    showModal('ag-filter-modal');
    const on = document.querySelector('#ag-filter-list .agf-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' }); // muitas tags: a escolhida fica à vista
};
window.closeAgFilter = function() { hideModal('ag-filter-modal'); };
// Escolher a tag fecha a janelinha (é o que se quer ver); o "Ocultar concluídos" liga e desliga com ela aberta.
function setAgTagFilter(id) {
    agTagFilter = id === '__none__' || agTagFind(id) ? id : '';
    agFilterSave();
    closeAgFilter();
    renderTimeline();
}
window.toggleAgHideDone = function() {
    agHideDone = !agHideDone;
    agFilterSave();
    renderAgFilterList();
    renderTimeline();
};
window.agFilterManageTags = function() { closeAgFilter(); openTagsSheet(); };

// Tocar 2 vezes numa faixa ou no Tempo Livre (sem tarefa na mão) abre o + já mirando ali: o que for criado entra direto lá (V40.25.1: eram 1 toque, só na faixa).
let sheetSlot = null; // { date, start, dur }
function tlSlotLabel() {
    const btn = document.getElementById('commit-intent-btn');
    if (btn) btn.innerHTML = `<i class="ph ph-calendar-plus text-base"></i> ${sheetSlot ? 'Inserir às ' + formatClock(sheetSlot.start) : 'Inserir na Agenda'}`;
}
// V40.25.1: gap = o vago inteiro { a, b } (pra encostar no fim quando a hora tocada não dá); exact = hora escolhida
// pelo toque (não muda pra "agora" mesmo se o vago tiver o agora).
window.openSheetAt = function(start, dur, gap, exact, date) { // V40.26.0: date = coluna tocada na agenda afastada
    openSheet();
    sheetSlot = { date: date || getActiveDateStr(), start: start, dur: dur, gap: gap || null, exact: !!exact };
    tlSlotLabel();
};
// V40.25.1: 2 toques num horário vazio (Tempo Livre ou faixa do "ocultar vagos") abrem o + já mirando ali.
// Tempo Livre: a hora tocada, de 15 em 15 min (dentro do vago). Faixa: o começo do vago. Um toque só não abre nada
// (evita abrir sem querer rolando a agenda) e, nas 3 primeiras vezes, explica o gesto.
var tlTapPrev = null, tlTapHintT = null;
function tlEmptyTap(e, block, date) {
    if (db.some(x => x.expanded)) return; // com um cartão aberto, o toque só fecha ele
    const now = Date.now(), p = tlTapPrev, x = e.clientX || 0, y = e.clientY || 0, ds = date || getActiveDateStr();
    clearTimeout(tlTapHintT);
    if (p && p.start === block.startMin && p.date === ds && now - p.t < 450 && Math.abs(x - p.x) < 40 && Math.abs(y - p.y) < 40) {
        tlTapPrev = null;
        const end = block.startMin + block.duration, gap = { a: block.startMin, b: end };
        if (tlGapAt(block.startMin)) return openSheetAt(block.startMin, block.duration, gap, false, ds);
        const r = e.currentTarget && e.currentTarget.getBoundingClientRect ? e.currentTarget.getBoundingClientRect() : null;
        const min = r ? tlMin(tlY(block.startMin) + (y - r.top)) : block.startMin;
        let at = Math.round(min / 15) * 15;
        if (at >= end) at = Math.floor(min / 15) * 15; // perto do fim: o quarto de hora de antes (não sobra um vago de 5 min)
        at = Math.max(block.startMin, Math.min(at, end - 5));
        return openSheetAt(at, end - at, gap, true, ds);
    }
    tlTapPrev = { start: block.startMin, date: ds, t: now, x: x, y: y };
    tlTapHintT = setTimeout(() => { tlTapPrev = null; tlTapHint(); }, 460);
}
function tlTapHint() {
    let n = 0;
    try { n = Number(localStorage.getItem('tb__dica_dois_toques')) || 0; } catch (e) {}
    if (n >= 3) return;
    try { localStorage.setItem('tb__dica_dois_toques', String(n + 1)); } catch (e) {}
    showToast('Toque 2 vezes no Tempo Livre pra pôr um cartão ali');
}

// =====================================================
// V40.26.0: AGENDA AFASTADA — 2 ou 3 dias lado a lado, como as Listas afastadas.
// Pinça (fechar os dedos mostra mais dias, abrir mostra menos; um nível por gesto) ou o botão de colunas na linha
// dos filtros (1 → 2 → 3 → 1). A régua de horas é uma só; o nome de cada dia fica no topo, em cima da coluna dele.
// Arrastar pro lado com um dedo anda um dia. Tocar num bloco (ou no nome do dia) abre aquele dia em 1 dia, já com o
// cartão aberto. Dois toques num vazio abrem o + naquele dia e hora. Tarefa na mão: tocar num vazio onde ela cabe
// solta ali (em qualquer um dos dias). Filtros e busca continuam em lista; "ocultar vagos" vale só em 1 dia.
// Arrastar bloco de um dia pro outro: V40.31.0 (segurar o bloco e arrastar; seção "DIAS LADO A LADO: ARRASTAR BLOCO").
// =====================================================
const TL_WD = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const TL_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function tlMulti() { return tlDays > 1 && !showOnlyDelayed && !showOnlyCompleted && !(searchQuery && searchQuery.trim()); }
function tlMultiDays() {
    if (!tlMulti()) return [];
    const out = [], first = getActiveDateStr();
    for (let i = 0; i < tlDays; i++) out.push(addDaysToDateStr(first, i));
    return out;
}
function tlDateObj(ds) { const p = String(ds).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function tlRangeLabel(days) {
    const a = tlDateObj(days[0]), z = tlDateObj(days[days.length - 1]);
    return a.getMonth() === z.getMonth() ? `${a.getDate()}–${z.getDate()} ${TL_MES[z.getMonth()]}` : `${a.getDate()} ${TL_MES[a.getMonth()]}–${z.getDate()} ${TL_MES[z.getMonth()]}`;
}
// O topo (cabeçalho) muda de altura quando os nomes dos dias aparecem/somem: a agenda acompanha.
function tlFixTop() {
    setTimeout(() => {
        const header = document.querySelector('header'), tl = document.getElementById('timeline-scroll');
        if (header && tl) tl.style.paddingTop = (header.offsetHeight + 8) + 'px';
    }, 50);
}
function updateTlDaysBtn() {
    const b = document.getElementById('tl-days-btn');
    if (!b) return;
    const on = tlDays > 1;
    b.classList.toggle('tl-days-on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.title = on ? `${tlDays} dias na tela (toque pra ${tlDays >= 3 ? '1 dia' : (tlDays + 1) + ' dias'}; ou use a pinça)` : 'Ver 2 dias lado a lado (ou feche os dedos na agenda)';
    const badge = document.getElementById('tl-days-badge');
    if (badge) { badge.textContent = on ? String(tlDays) : ''; badge.classList.toggle('hidden', !on); }
}
window.setTlDays = function(n, firstDate) {
    n = Number(n);
    if ([1, 2, 3].indexOf(n) < 0) return;
    if (firstDate) activeDateObj = tlDateObj(firstDate);
    if (n === tlDays && !firstDate) return;
    if (n > 1) { collapseAllBlocks(); tlBack = null; }
    const from = tlDays;
    tlDays = n;
    try { localStorage.setItem('tb__agenda_dias', String(n)); } catch (e) {}
    tlTapPrev = null;
    updateTlDaysBtn();
    applyHeaderState();
    runRealTimeEngine();
    renderTimeline();
    if (n > 1 && from === 1 && !firstDate) blkDragTipOnce(); // V40.31.0: ensina o arrasto entre os dias (3 vezes)
};
window.cycleTlDays = function() { setTlDays(tlDays >= 3 ? 1 : tlDays + 1); };

// Abre um dia em 1 dia (tocou no nome do dia ou num bloco). Com bloco: rola até ele e abre o cartão.
window.tlOpenDay = function(ds, id) {
    const sc = document.getElementById('timeline-scroll');
    const back = tlDays > 1 ? { n: tlDays, first: getActiveDateStr(), top: sc ? sc.scrollTop : 0 } : null; // V40.27.0
    setTlDays(1, ds);
    tlBack = back;
    const b = id ? db.find(x => x.id === id) : null;
    if (!b) return;
    if (!pendingIntent && !b.expanded) toggleExpandBlock(id, { stopPropagation() {} });
    if (sc) sc.scrollTop = Math.max(0, tlY(b.startMin) - 140);
};
// V40.27.0: o voltar do celular depois de abrir um dia pelos dias lado a lado: volta pra eles, na mesma rolagem.
function tlBackToDays() {
    const t = tlBack;
    tlBack = null;
    if (!t) return;
    setTlDays(t.n, t.first);
    const sc = document.getElementById('timeline-scroll');
    if (sc) sc.scrollTop = t.top;
}
function tlMiniTap(e, id, ds) {
    if (e && e.stopPropagation) e.stopPropagation();
    const b = db.find(x => x.id === id);
    if (!b) return;
    if (pendingIntent && isSublist(b) && subCanDrop()) return dropIntoSublist(id); // tarefa na mão → entra na sublista
    tlOpenDay(ds, id);
}
function tlMiniBlock(b, ds) {
    const top = tlY(b.startMin), h = Math.max(tlY(b.startMin + b.duration) - top - 2, 8);
    const el = document.createElement('div');
    const sub = isSublist(b), rest = b.theme === 'rest', card = b.completed ? null : fazCardColor(b.color);
    el.className = 'tl-mini' + (b.completed ? ' done' : '') + (b.type === 'past' ? ' past' : '') + (rest && !b.completed ? ' rest' : '') + (sub && !b.completed ? ' sub' : '') +
        (card && !fazIsDark(card) ? ' light' : '') + (h < 26 ? ' tiny' : '');
    el.style.top = (top + 1) + 'px';
    el.style.height = h + 'px';
    if (card) el.style.backgroundColor = card;
    const tag = getTagColor(b.tagId);
    if (tag) el.style.borderLeft = '4px solid ' + tag;
    el.dataset.miniId = b.id;
    el.setAttribute('role', 'button');
    const c = sub ? subCount(b) : null;
    el.innerHTML = (h >= 26 ? `<span class="tl-mini-time">${formatClock(b.startMin)}</span>` : '') +
        `<span class="tl-mini-title">${b.completed ? '<i class="ph-bold ph-check"></i> ' : ''}${escapeHtml(b.title || (sub ? 'Sublista' : 'Sem nome'))}</span>` +
        (sub && c.total && h >= 40 ? `<span class="tl-mini-sub">${c.done}/${c.total}</span>` : '');
    el.onclick = (e) => tlMiniTap(e, b.id, ds);
    return el;
}
function tlMiniGap(ds, start, dur) {
    const el = document.createElement('div'), top = tlY(start);
    el.className = 'tl-mini-gap';
    el.style.top = (top + 1) + 'px';
    el.style.height = Math.max(tlY(start + dur) - top - 2, 4) + 'px';
    el.dataset.gapDate = ds;
    el.dataset.gapStart = String(start);
    if (pendingIntent) {
        if (dur >= pendingIntent.duration) {
            el.classList.add('drop', 'animate-pulse-drop');
            if (dur >= 25) el.innerHTML = '<i class="ph ph-hand-pointing"></i>';
            el.onclick = (e) => { e.stopPropagation(); performEncaixeMatematico(start, dur, false, ds); };
            perZonesInto(el, start, start + dur, ds, true); // V40.43.0: uma parte por período, com a cor dele
        } else if (dur >= 10 && (perZonesInto(el, start, start + dur, ds, true) || pushFieldInto(el, start, start + dur, ds, true))) {
            el.classList.add('drop'); // V40.44.0: cabe descendo os de baixo
        } else el.classList.add('short');
    } else {
        el.onclick = (e) => tlEmptyTap(e, { startMin: start, duration: dur }, ds);
    }
    return el;
}
function tlDayhead(days) {
    const row = document.getElementById('tl-dayhead');
    if (!row) return;
    const show = !!(days && days.length), was = !row.classList.contains('hidden');
    row.classList.toggle('hidden', !show);
    const pr = document.getElementById('header-progress-row'); // os nomes dos dias ficam no lugar da barra de "planejado"
    if (pr && !headerHidden) pr.classList.toggle('hidden', show);
    if (show) {
        const today = getTodayStr();
        row.style.gridTemplateColumns = `repeat(${days.length}, minmax(0, 1fr))`;
        row.innerHTML = days.map(ds => {
            const d = tlDateObj(ds);
            return `<button type="button" class="tl-dh${ds === today ? ' today' : ''}" onclick="tlOpenDay('${ds}')" aria-label="Abrir ${TL_WD[d.getDay()]} ${d.getDate()}">${TL_WD[d.getDay()]} ${d.getDate()}</button>`;
        }).join('');
    }
    if (show !== was) tlFixTop();
}
function tlRenderMulti() {
    const days = tlMultiDays(), n = days.length, lo = START_HOUR * 60, hi = END_HOUR * 60, today = getTodayStr();
    container.classList.add('tl-multi');
    const nowLine = document.getElementById('now-line');
    if (nowLine) nowLine.style.display = 'none';
    let occupied = 0, hidden = 0;
    days.forEach((ds, i) => {
        const col = document.createElement('div');
        col.className = 'tl-col' + (ds === today ? ' tl-col-today' : '') + (i ? ' tl-col-next' : '');
        col.style.left = `calc(${i} * 100% / ${n})`;
        col.style.width = `calc(100% / ${n})`;
        col.style.height = `${tlY(hi)}px`;
        col.dataset.date = ds;
        const list = db.filter(b => b.date === ds && b.startMin < hi && b.startMin + b.duration > lo).sort((a, b) => a.startMin - b.startMin);
        let cur = lo;
        list.forEach(b => {
            if (b.startMin > cur) col.appendChild(tlMiniGap(ds, cur, b.startMin - cur));
            if (agVisible(b)) col.appendChild(tlMiniBlock(b, ds)); else { hidden++; col.appendChild(tlHiddenEl(b, true)); } // V40.45.0
            cur = Math.max(cur, b.startMin + b.duration);
            if (b.type !== 'past') occupied += b.duration;
        });
        if (cur < hi) col.appendChild(tlMiniGap(ds, cur, hi - cur));
        pushPillsInto(col, list, ds, true); // V40.44.0: entre blocos colados, o "↓" que encaixa descendo os de baixo
        if (ds === today && currentRealMins >= lo && currentRealMins <= hi) {
            const nl = document.createElement('div');
            nl.className = 'tl-now-mini';
            nl.style.top = `${tlY(currentRealMins)}px`;
            col.appendChild(nl);
        }
        container.appendChild(col);
    });
    // V40.36.1: vagos ocultos com vários dias: uma faixa por cima das colunas mostra o horário que encolheu (o toque
    // passa pra coluna de baixo: 2 toques criam ali, e a tarefa na mão cai no dia tocado)
    (tlSegs || []).forEach(sg => {
        if (!sg.gap) return;
        const band = document.createElement('div');
        band.className = 'tl-multi-band';
        band.style.top = `${tlY(sg.a) + 1}px`;
        band.style.height = `${Math.max(sg.px - 2, 4)}px`;
        band.innerHTML = `<span><i class="ph ph-arrows-out-line-vertical"></i>${formatClock(sg.a)}–${formatClock(sg.b)} · livre ${formatDur(sg.b - sg.a)}</span>`;
        container.appendChild(band);
    });
    const pct = Math.round((occupied / (TOTAL_MINS * n)) * 100) || 0;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-text').textContent = `Planejado (${pct}%)` + agHiddenTxt(hidden); // V40.45.0
    tlDayhead(days);
    const hint = document.getElementById('floating-hint');
    if (hint) hint.textContent = pendingIntent && container.querySelector('.tl-push') ? 'Toque num espaço livre (ou num ↓) de um dos dias' : 'Toque num espaço livre de um dos dias'; // V40.44.0
    blkDragSetup(); // V40.31.0: segurar um bloco e arrastar pra outro dia
}

// Pinça e arrastar pro lado na agenda. Dois dedos: um nível por gesto (só vale se os DOIS dedos se mexeram). Um dedo
// pro lado (bem mais pro lado do que pra cima/baixo, rapidinho): anda um dia, só com vários dias na tela.
(function () {
    const sc = document.getElementById('timeline-scroll');
    if (!sc) return;
    let pinch = null, swipe = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    sc.addEventListener('touchstart', (e) => {
        const t = e.touches || [];
        if (t.length === 2) {
            swipe = null;
            const mx = (t[0].clientX + t[1].clientX) / 2;
            let under = null; // o dia debaixo dos dedos (aproximar abre ele)
            document.querySelectorAll('#blocks-container .tl-col').forEach(c => { const r = c.getBoundingClientRect(); if (mx >= r.left && mx <= r.right) under = c.dataset.date; });
            pinch = { d0: dist(t), pts: [0, 1].map(i => [t[0 + i].clientX, t[0 + i].clientY]), done: false, under: under };
            return;
        }
        pinch = null;
        swipe = t.length === 1 && tlMulti() ? { x: t[0].clientX, y: t[0].clientY, lx: t[0].clientX, ly: t[0].clientY, t: Date.now() } : null; // com a tarefa na mão também (pra achar o dia)
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
        const t = e.touches || [];
        if (swipe && t.length === 1) { swipe.lx = t[0].clientX; swipe.ly = t[0].clientY; }
        const p = pinch;
        if (!p || t.length !== 2 || p.done || p.d0 < 30 || mbDragActive || isPhysicsBusy) return;
        const moved = (i) => Math.hypot(t[i].clientX - p.pts[i][0], t[i].clientY - p.pts[i][1]) >= 12;
        if (!moved(0) || !moved(1)) return;
        const ratio = dist(t) / p.d0;
        if (ratio < 0.75 && tlDays < 3) { p.done = true; setTlDays(tlDays + 1); }
        else if (ratio > 1.33 && tlDays > 1) { p.done = true; setTlDays(tlDays - 1, tlDays - 1 === 1 ? p.under : null); }
    }, { passive: true });
    sc.addEventListener('touchend', (e) => {
        const s = swipe;
        if ((e.touches || []).length === 0) { pinch = null; swipe = null; }
        if (!s || !tlMulti() || blkDrag || isPhysicsBusy) return; // V40.31.0: soltar um bloco arrastado não anda o dia
        const dx = s.lx - s.x, dy = s.ly - s.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - s.t > 700) return;
        if (dx < 0) debugAdvanceDay(); else debugPreviousDay();
    }, { passive: true });
})();
function tlTakeSlot() { const sl = sheetSlot; sheetSlot = null; tlSlotLabel(); return sl; }
function tlPlaceAt(sl) {
    if (!sl || !pendingIntent || (sl.date !== getActiveDateStr() && !tlMultiDays().includes(sl.date))) return;
    let start = sl.start, room = sl.dur;
    const d = pendingIntent.duration;
    if (d > room && sl.gap && sl.gap.b - sl.gap.a >= d) { start = sl.gap.b - d; room = d; } // V40.25.1: tocou perto do fim do vago: encosta no próximo bloco
    if (d > room) { showToast('Não cabe nesse vago: toque onde quer colocar 👇'); return; }
    performEncaixeMatematico(start, room, sl.exact, sl.date);
}

function renderGrid() {
    // V3.0 - Bug 2.5: Modo filtro com altura automática
    const tlContainer = document.getElementById('timeline-container');
    const isSearching = !!(searchQuery && searchQuery.trim());
    if (showOnlyDelayed || showOnlyCompleted || isSearching) {
        tlContainer.style.height = 'auto';
    } else {
        tlContainer.style.height = `${tlY(END_HOUR * 60)}px`; // V40.24.0: com vagos ocultos a régua encolhe
    }
    const yAxis = document.getElementById('y-axis');
    const gridLines = document.getElementById('grid-lines');
    yAxis.innerHTML = '';
    gridLines.innerHTML = '';
    
    for (let i = START_HOUR; i <= END_HOUR; i++) {
        if (tlInGap(i * 60)) continue; // V40.24.0: dentro de um vago oculto (a faixa mostra o horário)
        const topPx = tlY(i * 60);
        yAxis.innerHTML += `<div class="absolute text-[10px] text-zinc-400 font-medium w-10 text-right left-0 -translate-y-1/2" style="top: ${topPx}px">${i.toString().padStart(2, '0')}:00</div>`;
        gridLines.innerHTML += `<div class="absolute w-[calc(100%+40px)] -left-14 border-t border-black/[0.05]" style="top: ${topPx}px"></div>`;
    }
}

function formatClock(m) { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; }
function formatDur(m) { const h = Math.floor(m/60), min = m%60; return h > 0 && min > 0 ? `${h}h ${min}m` : (h > 0 ? `${h}h` : `${min}m`); }
function showToast(msg, kind) {
    const t = document.getElementById('toast'), win = kind === 'win'; // V40.21.0: 'win' = conquista (estrela, nível): amarelo, sem o ícone de aviso
    document.getElementById('toast-msg').innerText = msg;
    t.classList.toggle('toast-win', win);
    const ico = t.querySelector('i');
    if (ico) ico.classList.toggle('hidden', win);
    t.classList.remove('opacity-0');
    setTimeout(() => t.classList.add('opacity-0'), 2500);
}

function renderTimeline() {
    // V40.3.2: bloqueia re-render durante drag de microbloc pra não invalidar mbDragRects/mbDragSourceEl.
    // O drag chamará renderTimeline() no final (onMbDragEnd) — não precisa renderizar enquanto rola.
    // Variável declarada no topo do arquivo pra evitar TDZ.
    // V40.30.0: arrastando um cartão da sublista também não (subDrag é "var": existe antes da linha dele rodar).
    // V40.31.0: nem arrastando um bloco entre os dias, a não ser quando os dias andam (blkDrag.paging).
    if (mbDragActive || subDrag || (blkDrag && !blkDrag.paging)) return;
    container.innerHTML = ''; 
    container.classList.remove('tl-multi'); // V40.26.0: volta a ser um dia só até saber se a agenda está afastada
    renderAgFilterBtn(); // V40.45.0: o botão TAGs mostra o filtro ligado (e a tag apagada volta pra "Todas")
    
    const timelineContainer = document.getElementById('timeline-container');
    const isSearching = !!(searchQuery && searchQuery.trim());
    const multi = tlMulti(); // V40.26.0: 2 ou 3 dias lado a lado
    if (!multi) tlDayhead(null);
    
    tlSegs = null; // V40.24.0: escala normal até saber se a agenda do dia mostra vagos ocultos
    // V40.2.6: busca pesquisa em TODOS os dias e renderiza lista especial
    if (isSearching) {
        timelineContainer.classList.add('filter-list-mode');
        timelineContainer.classList.add('search-mode'); // V40.2.10: padding menor pra busca
        renderSearchResultsAllDays();
        renderGrid();
        updateSearchCounter();
        return;
    }
    
    // V40.2.10: garante que search-mode é removido fora de busca
    timelineContainer.classList.remove('search-mode');
    
    if (showOnlyDelayed || showOnlyCompleted) {
        timelineContainer.classList.add('filter-list-mode');
    } else {
        timelineContainer.classList.remove('filter-list-mode');
    }

    let storedStart = localStorage.getItem('tb_start_hour');
    let storedEnd = localStorage.getItem('tb_end_hour');
    START_HOUR = storedStart !== null ? parseInt(storedStart) : 0;
    END_HOUR = storedEnd !== null ? parseInt(storedEnd) : 24;
    TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

    if (showOnlyDelayed || showOnlyCompleted || isSearching) {
        let filteredForWindow = db.filter(b => b.date === getActiveDateStr());
        
        if (showOnlyDelayed) {
            filteredForWindow = filteredForWindow.filter(b => b.type === 'past' || b.wasDelayed);
        }
        if (showOnlyCompleted) {
            filteredForWindow = filteredForWindow.filter(b => b.completed === true);
        }
        if (!isSearching) filteredForWindow = filteredForWindow.filter(agVisible); // V40.45.0: o filtro da agenda tira da lista
        if (isSearching) {
            const q = normalizeText(searchQuery);
            // V40.2.24: filtro expandido pra título + microblocos + tag
            filteredForWindow = filteredForWindow.filter(b => cardMatchesSearch(b, q));
        }
        
        if (filteredForWindow.length > 0) {
            const minStart = Math.min(...filteredForWindow.map(b => b.startMin));
            const maxEnd = Math.max(...filteredForWindow.map(b => b.startMin + b.duration));
            
            START_HOUR = Math.max(0, Math.floor(minStart / 60) - 1);
            END_HOUR = Math.min(24, Math.ceil(maxEnd / 60) + 1);
            TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
        }
    }

    // V40.24.0: vagos ocultos (na agenda normal; nos filtros é lista). V40.36.1: com 2 ou 3 dias lado a lado a régua é
    // uma só, então some o horário que está livre em TODOS os dias da tela (pedido dele de 22/11: antes só avisava
    // "Ocultar vagos vale quando a agenda mostra 1 dia"). O tlBuildSegs recebe os blocos dos dias juntos, por início.
    if (tlCompact && !showOnlyDelayed && !showOnlyCompleted) {
        const lo = START_HOUR * 60, hi = END_HOUR * 60, days = multi ? tlMultiDays() : [getActiveDateStr()];
        tlSegs = tlBuildSegs(db.filter(b => days.includes(b.date) && b.startMin < hi && b.startMin + b.duration > lo).sort((a, b) => a.startMin - b.startMin), lo, hi);
    }
    renderGrid(); 
    // V40.24.0: a régua pode ter mudado (vagos ocultos ou blocos novos): a linha do agora acompanha já
    const nowLineEl = document.getElementById('now-line');
    if (nowLineEl && nowLineEl.style.display !== 'none') nowLineEl.style.top = `${tlY(currentRealMins)}px`;
    if (multi) { tlRenderMulti(); return; } // V40.26.0

    let dailyDb = db.filter(b => b.date === getActiveDateStr());
    
    if (showOnlyDelayed) {
        dailyDb = dailyDb.filter(b => b.type === 'past' || b.wasDelayed);
    }

    if (showOnlyCompleted) {
        dailyDb = dailyDb.filter(b => b.completed === true);
    }

    // V40.45.0: filtro da agenda (tag / ocultar concluídos). Nos filtros (lista) quem ele esconde sai; na agenda normal
    // fica no lugar como contorno (lá embaixo), e o espaço livre continua contando com ele.
    let agHidden = 0;
    if (showOnlyDelayed || showOnlyCompleted) { const n0 = dailyDb.length; dailyDb = dailyDb.filter(agVisible); agHidden = n0 - dailyDb.length; }

    // V40.2.5: filtro de busca por nome (normaliza acentos, case-insensitive)
    // V40.2.24: expandido pra incluir microblocos e tag via cardMatchesSearch
    if (searchQuery && searchQuery.trim()) {
        const q = normalizeText(searchQuery);
        dailyDb = dailyDb.filter(b => cardMatchesSearch(b, q));
    }

    dailyDb = dailyDb.filter(b => b.startMin < END_HOUR * 60 && (b.startMin + b.duration) > START_HOUR * 60);
    dailyDb.sort((a, b) => a.startMin - b.startMin);
    if (!showOnlyDelayed && !showOnlyCompleted) agHidden = dailyDb.filter(b => !agVisible(b)).length; // V40.45.0
    
    let cursorMin = START_HOUR * 60;
    let occupied = 0;
    let renderQueue = [];
    
    dailyDb.forEach(fb => {
        if (fb.startMin > cursorMin && !showOnlyDelayed && !showOnlyCompleted) {
            renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: fb.startMin - cursorMin });
        }
        renderQueue.push(fb);
        cursorMin = Math.max(cursorMin, fb.startMin + fb.duration);
        if(fb.type !== 'empty' && fb.type !== 'past') occupied += fb.duration; 
    });
    
    const endOfDay = END_HOUR * 60;
    if (cursorMin < endOfDay && !showOnlyDelayed && !showOnlyCompleted) {
        renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: endOfDay - cursorMin });
    }
    
    const pct = Math.round((occupied / TOTAL_MINS) * 100) || 0;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-text').textContent = `Planejado (${pct}%)` + agHiddenTxt(agHidden); // V40.45.0: "· 2 escondidos" (textContent: o jsdom não tem innerText)

    // V40.45.0: o bloco escondido pelo filtro vira só o contorno no horário dele
    renderQueue.forEach(block => { if (block.type !== 'empty' && !showOnlyDelayed && !showOnlyCompleted && !agVisible(block)) container.appendChild(tlHiddenEl(block, false)); else drawBlock(block); });
    if (pendingIntent && !showOnlyDelayed && !showOnlyCompleted) pushPillsInto(container, dailyDb, getActiveDateStr(), false); // V40.44.0
    // V40.24.0: com tarefa na mão e sublista no dia, a dica lembra que dá pra soltar nela também
    const hint = document.getElementById('floating-hint');
    // V40.44.0: com "↓" entre blocos colados, a dica lembra que ele encaixa descendo os de baixo
    const pills = pendingIntent && !!container.querySelector('.tl-push');
    if (hint) hint.textContent = pendingIntent && subCanDrop() && dailyDb.some(b => isSublist(b) && agVisible(b)) ? (pills ? 'Toque num espaço livre, numa sublista ou num ↓' : 'Toque num espaço livre ou numa sublista') :
        pills ? 'Toque num espaço livre ou num ↓ entre os blocos' : 'Toque num espaço livre';
}

// V40.2.6: Renderiza resultados de busca de TODOS os dias como lista
function renderSearchResultsAllDays() {
    const q = normalizeText(searchQuery);
    const today = getTodayStr();
    
    // Pega TODOS os blocos do db (qualquer data) que batem com a busca
    // V40.2.24: agora busca em título + microblocos + nome da tag
    let results = db.filter(b => cardMatchesSearch(b, q));
    
    // Ordena por data (crescente) e depois por hora
    results.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startMin - b.startMin;
    });
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 px-4">
                <div class="w-16 h-16 rounded-2xl bg-app-focus-soft text-app-focus flex items-center justify-center mx-auto mb-4">
                    <i class="ph ph-magnifying-glass text-3xl"></i>
                </div>
                <p class="text-sm font-medium text-zinc-600">Nenhum cartão encontrado</p>
                <p class="text-xs text-zinc-400 mt-1">Tente outro termo de busca</p>
            </div>
        `;
        document.getElementById('progress-bar').style.width = '0%';
        document.getElementById('progress-text').innerText = 'Busca';
        return;
    }
    
    // V40.2.7: agrupa por data e renderiza selo + drawBlock pra cada
    // (drawBlock dá ao card TODAS as funcionalidades: expandir, marcar concluído, microblocks, notas, etc.)
    // V40.2.13: selo agora é CLICÁVEL — toca pra ir direto pro dia (e sem cursor de texto piscando)
    let lastDate = null;
    results.forEach(b => {
        // Selo de data antes do primeiro card de cada dia
        if (b.date !== lastDate) {
            const dateLabel = formatSearchDate(b.date, today);
            const seal = document.createElement('div');
            seal.className = 'search-date-seal';
            // V40.2.13: span clicável + select-none pra não mostrar cursor de texto
            seal.innerHTML = `<span onclick="goToDateFromSearch('${b.date}')" class="text-[11px] font-bold text-app-focus uppercase tracking-wider px-3 py-1 rounded-full bg-app-focus-soft border border-app-focus-soft inline-flex items-center gap-1.5 cursor-pointer hover:bg-app-focus-soft-strong active:scale-95 transition select-none" style="-webkit-touch-callout: none; -webkit-user-select: none; user-select: none;" title="Ir para ${dateLabel}"><i class="ph ph-arrow-right text-[10px]"></i>${dateLabel}</span>`;
            container.appendChild(seal);
            lastDate = b.date;
        }
        
        // V40.2.7: drawBlock dá card completo com todas as ações
        drawBlock(b);
    });
    
    // Limpar progress
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-text').innerText = `${results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`;
}

// V40.2.6: Formata data pra exibição na lista de busca (Hoje / Ontem / data completa)
function formatSearchDate(dateStr, todayStr) {
    if (dateStr === todayStr) return 'Hoje';
    
    // Calcular diferença em dias usando UTC midday pra evitar problemas de fuso
    const d = new Date(dateStr + 'T12:00:00');
    const t = new Date(todayStr + 'T12:00:00');
    const diffDays = Math.round((d - t) / (1000 * 60 * 60 * 24));
    
    if (diffDays === -1) return 'Ontem';
    if (diffDays === 1) return 'Amanhã';
    
    // Outro dia: formato "Seg, 12 mai"
    const opts = { weekday: 'short', day: 'numeric', month: 'short' };
    let s = d.toLocaleDateString('pt-BR', opts);
    s = s.replace(/\./g, '').replace(/ de /g, ' ');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// V40.2.6: Clica num resultado de busca → vai pro dia daquele card
window.goToBlockFromSearch = function(blockId) {
    const block = db.find(b => b.id === blockId);
    if (!block) return;
    
    // Fecha busca e zera query
    closeSearchBar();
    
    // Pula pro dia do bloco
    activeDateObj = new Date(block.date + 'T12:00:00');
    runRealTimeEngine();
    renderTimeline();
    
    // Pequeno toast pra feedback
    setTimeout(() => showToast(`Indo pra ${formatSearchDate(block.date, getTodayStr())}`), 100);
}

// V40.2.13: Clica no selo de data → vai pro dia daquele grupo
window.goToDateFromSearch = function(dateStr) {
    if (!dateStr) return;
    const today = getTodayStr();
    const label = formatSearchDate(dateStr, today);
    // V40.45.0: o que a busca achou nesse dia está escondido pelo filtro da agenda? Desliga o que esconde (como o PC).
    let off = false;
    if (agFiltering() && searchQuery && searchQuery.trim()) {
        const q = normalizeText(searchQuery), hits = db.filter(b => b.date === dateStr && cardMatchesSearch(b, q));
        if (agHideDone && hits.some(b => b.completed)) { agHideDone = false; off = true; }
        if (hits.some(b => !agVisible(b))) { agTagFilter = ''; off = true; }
        if (off) agFilterSave();
    }
    
    closeSearchBar();
    
    activeDateObj = new Date(dateStr + 'T12:00:00');
    runRealTimeEngine();
    renderTimeline();
    
    setTimeout(() => showToast(`Indo pra ${label}` + (off ? ' · filtro desligado' : '')), 100);
}

function drawBlock(block) {
    const topPx = tlY(block.startMin); // V40.24.0: escala por trechos (vagos ocultos)
    const heightPx = tlY(block.startMin + block.duration) - topPx - 2; 

    // V40.2.9: detecta modo busca pra neutralizar o atalho de horário (que estava capturando toques na área do card)
    const isSearching = !!(searchQuery && searchQuery.trim());

    const el = document.createElement('div');
    el.className = 'absolute left-1 right-1 rounded-2xl overflow-hidden transition-all duration-300 z-10 flex flex-col';
    el.classList.add('block-item'); 
    el.dataset.blockId = block.id; // V40.1.3: identificação para click-out auto-retrair

    if (!showOnlyDelayed && !showOnlyCompleted) {
        el.style.top = `${topPx + 1}px`;
        el.style.height = `${heightPx}px`;
    }

    const isSmall = block.duration <= 30;

    // V40.24.0: sublista (bloco com vários cartões dentro) tem desenho próprio
    if ((block.type === 'focus' || block.type === 'past') && isSublist(block)) {
        drawSublist(el, block, heightPx, isSearching);
        container.appendChild(el);
        try { subDragSetup(el, block); subDragTip(el, block); } catch (err) { console.warn('[drawBlock] arrasto da sublista:', err); } // V40.30.0
        return;
    }

    if (block.type === 'empty' && tlGapAt(block.startMin)) {
        // V40.24.0: vago oculto = faixa fininha com o horário; tocar cria ali (ou solta a tarefa da mão)
        el.className += ' bg-hatched border border-dashed items-center justify-center text-center tl-gap';
        const range = `${formatClock(block.startMin)}–${formatClock(block.startMin + block.duration)}`;
        if (pendingIntent) {
            if (block.duration >= pendingIntent.duration) {
                el.classList.add('border-black/20', 'animate-pulse-drop', 'cursor-pointer', 'z-30');
                el.onclick = () => performEncaixeMatematico(block.startMin, block.duration);
                el.innerHTML = `<span class="tl-gap-txt text-app-focus"><i class="ph ph-hand-pointing"></i>Soltar aqui · ${range}</span>`;
                perChipsInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr()); // V40.43.0: uma parte por período
            } else if (perChipsInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr()) ||
                pushFieldInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr())) { // V40.44.0: cabe descendo os de baixo
                el.classList.add('border-black/20', 'cursor-pointer', 'z-30');
            } else {
                el.classList.add('border-red-500/20', 'opacity-60');
                el.innerHTML = `<span class="tl-gap-txt text-red-500">${range} · muito curto</span>`;
            }
        } else {
            el.classList.add('border-black/10', 'cursor-pointer');
            el.onclick = (e) => tlEmptyTap(e, block); // V40.25.1: 2 toques abrem o + mirando o vago (1 toque só mostra a dica)
            el.innerHTML = `<span class="tl-gap-txt"><i class="ph ph-arrows-out-line-vertical"></i>${range} · livre ${formatDur(block.duration)}</span>`;
        }
    }
    else if (block.type === 'empty') {
        el.className += ' bg-hatched border border-dashed items-center justify-center text-center';
        if (pendingIntent) {
            if (block.duration >= pendingIntent.duration) {
                el.classList.add('border-black/20', 'animate-pulse-drop', 'cursor-pointer', 'z-30');
                el.onclick = () => performEncaixeMatematico(block.startMin, block.duration);
                el.innerHTML = `<i class="ph ph-hand-pointing ${block.duration < 15 ? 'text-xs' : 'text-2xl mb-1'} text-app-focus drop-shadow-md"></i> ${!isSmall ? `<span class="text-[10px] font-bold text-app-focus uppercase tracking-widest">Soltar Aqui</span>` : ''}`;
                perZonesInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr()); // V40.43.0: uma parte por período, com a cor dele
            } else if (block.duration >= 10 && (perZonesInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr()) ||
                pushFieldInto(el, block.startMin, block.startMin + block.duration, getActiveDateStr()))) { // V40.44.0: cabe descendo os de baixo
                el.classList.add('cursor-pointer', 'z-30');
            } else {
                el.classList.add('border-red-500/20', 'opacity-50');
                el.innerHTML = `<span class="text-[9px] text-red-500 font-bold uppercase">Muito Curto</span>`;
            }
        } else {
            el.classList.add('border-black/10', 'opacity-60', 'cursor-pointer');
            el.onclick = (e) => tlEmptyTap(e, block); // V40.25.1: 2 toques no Tempo Livre abrem o + mirando a hora tocada
            el.innerHTML = block.duration < 15 ? '' : `${!isSmall ? `<span class="text-sm font-semibold tracking-wide mb-1 text-zinc-500">Tempo Livre</span>` : ''}<span class="text-[10px] bg-black/5 text-zinc-600 px-2 py-1 rounded font-medium">${formatDur(block.duration)} livres</span>`;
        }
    }
    else if (block.type === 'focus' || block.type === 'past') {
        const isPast = block.type === 'past';
        const isRest = block.theme === 'rest';

        // V40.2.20 — Sem mais "fantasma" no final do dia.
        //   ANTES: atrasado não-concluído ganhava bg-app-focus-soft + opacity-80 saturate-50,
        //          virando uma cor desbotada/transparente que tirava a vida da agenda.
        //          Concluídos eram emerald-100/50 (verde claro lavadinho) com saturate-50 quando atrasados.
        //   AGORA:
        //   - Atrasado não-concluído mantém cor SÓLIDA do tema (bg-app-focus), idêntica ao futuro.
        //     O único indicador de atraso é o ícone "i" (pastIconHtml) que JÁ aparece quando isPast.
        //   - Concluído (no prazo ou atrasado, rest ou normal) vira emerald-500 sólido e vivo —
        //     injeção de dopamina de missão cumprida (chancela Jules).
        //   - Rest atrasado mantém zinc claro mas SEM desbotamento (coerência com a lei "sem opacity").
        let bgClass;
        if (block.completed) {
            // Qualquer concluído (futuro ou passado, rest ou normal) = verde vivo sólido
            bgClass = 'bg-emerald-500 border-emerald-600 shadow-md';
        } else if (isRest) {
            // Descanso não-concluído: esquema claro (zinc se atrasado, emerald-50 se futuro), sem desbotamento
            bgClass = isPast ? 'bg-zinc-50 border-zinc-200' : 'bg-emerald-50 border-emerald-300';
        } else {
            // Foco normal (futuro OU atrasado) = cor sólida do tema
            bgClass = 'bg-app-focus border-transparent shadow-md';
        }
        const tagColor = getTagColor(block.tagId);
        // V40.9.0: cor livre do cartão (concluído continua verde)
        const cardColor = block.completed ? null : fazCardColor(block.color);
        if (cardColor) bgClass = 'border-transparent shadow-md';
        // V40.2.14: tag agora tem destaque claro mesmo quando bate com cor do card.
        //   - borda lateral colorida com 5px (era 4px)
        //   - inset shadow projeta linha branca de 1px logo após a borda colorida,
        //     separando visualmente a faixa da tag do conteúdo. Funciona em qualquer combinação:
        //     se card é roxo + tag roxa → linha branca cria contraste; se card é branco + tag clara
        //     → linha branca quase invisível, mas a borda colorida já se vê no fundo claro.
        let borderStyle = tagColor 
            ? `border-left-width: 5px; border-left-color: ${tagColor}; box-shadow: inset 6px 0 0 -5px rgba(255,255,255,0.7);`
            : '';

        const isMicro = !block.expanded && block.duration <= 25;
        // V40.8.0: blocos de 5 e 10 min (13px e 28px de altura). Só na timeline, não no modo lista.
        const isNano = isMicro && block.duration <= 10 && !document.querySelector('.filter-list-mode');
        // V40.36.1: o cartão recolhido só mostra a área do checklist quando cabe pelo menos uma linha inteira. Medido no
        // Chrome: horário + nome ocupam 35 px e os respiros 41 px (76 px); a caixa "+ Adicionar Check" pede 33 px e um
        // item do checklist, 17 px. Com menos aparecia só uma fatia da caixa e o cartão parecia cortado (foto dele de
        // 22/11, bloco de 30 min). Sem a área, o nome usa até 2 linhas e o horário conta o checklist ("☑ 1/3").
        // No modo lista (filtros) o cartão cresce com o conteúdo: lá nada muda.
        const mbs = block.microblocks || [], listMode = !!document.querySelector('.filter-list-mode');
        const checksOff = !block.expanded && (isMicro || (!listMode && heightPx - 76 < (mbs.length ? 17 : 33)));
        const title2 = checksOff && !isMicro && !listMode;
        if (block.expanded) {
            // V40.2.21: pb-12 (era pb-6) pra dar espaço pra action bar (Editar/Duplicar/Apagar)
            // que agora ocupa o rodapé via absolute. A barra usa bottom-1, height ~32px.
            // V40.2.23: px-3 → pr-3 (drag-handle absolute agora ocupa os 40px da esquerda).
            el.className += ` ${bgClass} shadow-2xl border pr-3 pt-2 pb-12 group select-none transition-all duration-300`;
            el.style.height = 'auto'; el.style.minHeight = `${heightPx}px`; el.style.zIndex = '35'; 
        } else {
            // V40.2.23: px-3 → pr-3 (drag-handle absolute ocupa a esquerda).
            el.className += ` ${bgClass} border pr-3 ${isMicro ? 'pt-1.5 pb-1.5' : 'pt-2 pb-4'} group select-none transition-all duration-300${isNano ? ' nano-block' + (block.duration < 10 ? ' nano-5' : '') : ''}`;
            // V40.8.0: no bloco de 5 min não cabem os botões → tocar no bloco expande.
            if (isNano && block.duration < 10) el.onclick = (e) => { if (!pendingIntent && !e.target.closest('.drag-handle, .resize-handle')) toggleExpandBlock(block.id, e); };
        }
        if (borderStyle) el.style.cssText += borderStyle;
        if (cardColor) el.style.backgroundColor = cardColor;

        // V40.2.20: isDarkTheme agora cobre TODOS os fundos escuros do app:
        //   - foco normal (futuro OU atrasado, ambos com bg-app-focus)
        //   - concluído (sempre emerald-500)
        // Só rest não-concluído (emerald-50 / zinc-50) usa tema claro.
        const isDarkTheme = cardColor ? fazIsDark(cardColor) : (!isRest || block.completed);

        const timeColor = isDarkTheme ? 'text-white/60' : 'text-zinc-500';
        // V40.2.20: título do concluído agora é branco riscado (sobre fundo emerald-500), não mais emerald-900 desbotado.
        const titleClass = `${block.completed ? 'line-through opacity-90 text-white' : (isDarkTheme ? 'text-white' : (isRest ? 'text-emerald-900' : 'text-zinc-800'))}`;
        const iconColor = isDarkTheme ? 'text-white/60 hover:text-white' : 'text-zinc-400 hover:text-zinc-700';
        const checkColor = isDarkTheme ? (block.completed ? 'text-white hover:text-white/80' : 'text-white/60 hover:text-white') : (block.completed ? 'text-emerald-600 hover:text-emerald-700' : 'text-zinc-400 hover:text-emerald-600');
        const btnBg = isDarkTheme ? 'bg-black/20 hover:bg-black/30' : 'bg-black/5 hover:bg-black/10';
        const glowCircle = isDarkTheme ? 'bg-white/10' : 'bg-white/60';

        let microblocksSection = '';
        let microHtml = (block.microblocks || []).map(mb => `
            <div class="mb-item flex items-start gap-1.5 mb-1.5 z-20 relative group/mb pointer-events-auto" data-mb-id="${mb.id}">
                <button onclick="toggleMicroblock('${block.id}', '${mb.id}', event)" class="mt-[3px] shrink-0 w-3.5 h-3.5 rounded-[4px] border ${mb.done ? (isDarkTheme ? 'bg-white border-white' : 'bg-emerald-500 border-emerald-500') : (isDarkTheme ? 'border-white/30' : 'border-black/20')} flex items-center justify-center transition-colors">
                    ${mb.done ? `<i class="ph-bold ph-check text-[10px] ${isDarkTheme ? 'text-app-focus' : 'text-white'}"></i>` : ''}
                </button>
                <span class="text-[11px] font-medium leading-tight flex-1 pt-[1px] ${mb.done ? (isDarkTheme ? 'text-white/40 line-through' : 'text-black/40 line-through') : (isDarkTheme ? 'text-white/90' : 'text-black/80')}">${escapeHtml(mb.title)}</span>
                <button onclick="deleteMicroblock('${block.id}', '${mb.id}', event)" class="shrink-0 mt-[2px] flex items-center justify-center ${isDarkTheme ? 'text-white/40 hover:text-red-400' : 'text-black/30 hover:text-red-500'} transition-colors">
                   <i class="ph ph-x text-[12px]"></i>
                </button>
            </div>
        `).join('');

        const mbInputClasses = isDarkTheme 
            ? 'bg-black/10 hover:bg-black/20 focus:bg-black/30 focus:border-white/20 text-white placeholder-white/50 border-transparent'
            : 'bg-black/5 hover:bg-black/10 focus:bg-white focus:border-zinc-300 text-zinc-900 placeholder-zinc-500 border-transparent shadow-sm';

        microblocksSection = `
            <div class="flex-1 overflow-y-auto no-scrollbar mt-2 mb-2 ml-10 z-20 relative pointer-events-auto ${checksOff ? 'hidden' : ''}">
                ${microHtml}
                <div class="mt-1">
                    <input type="text" id="micro-input-${block.id}" placeholder="+ Adicionar Check" class="microblock-input w-full rounded-md px-2 py-1.5 text-[10px] font-medium outline-none transition-colors border ${mbInputClasses}" onkeypress="if(event.key==='Enter') addMicroblock('${block.id}', this, event)">
                </div>
                ${renderLinkedNotesSection(block, isDarkTheme)}
            </div>
        `;

        const showInfoIcon = isPast || block.wasDelayed;
        const pastIconHtml = showInfoIcon ? `<div class="pointer-events-auto w-3.5 h-3.5 rounded-full ${isDarkTheme ? 'bg-black/20 border-black/30 text-white/80' : 'bg-black/10 border-black/10 text-zinc-500'} flex items-center justify-center shrink-0 border mr-1.5" title="Tempo Esgotado / Realocado"><i class="ph-bold ph-info text-[8px]"></i></div>` : '';

        // V40.2.21 — Divulgação Progressiva (Progressive Disclosure):
        //   ANTES: 5 botões amontoados no topo direito do card (expandir, concluir, editar,
        //          duplicar, apagar) → comprimia o título a ~50% da largura, com truncate.
        //   AGORA:
        //   - Topo retraído: só 2 botões essenciais (▼ expandir, ✓ concluir), tamanho w-7 h-7
        //     pra melhor área de toque no mobile (Touch Target accessibility). Título ganha
        //     ~3 botões de largura extra.
        //   - Rodapé do expandido: barra horizontal com Editar / Duplicar / Apagar com ícone
        //     + texto. Aparece SÓ quando o card está expandido (chancela Jules + Jhonatan).
        //   - Resize handle continua no canto inferior esquerdo absoluto (z-40), a action bar
        //     usa right-0 com inset (left-3 right-3 bottom-1), não colidem em posição.

        // Botões internos do rodapé do expandido (só renderizados quando block.expanded === true)
        const actionBarBtnClass = isDarkTheme
            ? 'bg-black/20 hover:bg-black/30 text-white/85 active:scale-95'
            : 'bg-black/5 hover:bg-black/10 text-zinc-700 active:scale-95';
        const actionBarDeleteClass = isDarkTheme
            ? 'bg-black/20 hover:bg-red-500/70 text-white/85 hover:text-white active:scale-95'
            : 'bg-black/5 hover:bg-red-500/80 text-zinc-700 hover:text-white active:scale-95';
        const actionBarHtml = block.expanded ? `
            <div class="blk-bar absolute left-12 right-3 bottom-1 flex gap-1.5 z-30 pointer-events-auto">
                <button onclick="openEditModal('${block.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${actionBarBtnClass} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Editar">
                    <i class="ph ph-pencil-simple text-[12px] bar-ico"></i>Editar
                </button>
                <button onclick="duplicateTask('${block.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${actionBarBtnClass} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Duplicar">
                    <i class="ph ph-copy text-[12px] bar-ico"></i>Duplicar
                </button>
                <button onclick="fazArchiveBlock('${block.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${actionBarBtnClass} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Arquivar">
                    <i class="ph ph-archive text-[12px] bar-ico"></i>Arquivar
                </button>
                <button onclick="openDeleteModal('${block.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${actionBarDeleteClass} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Apagar">
                    <i class="ph ph-trash text-[12px] bar-ico"></i>Apagar
                </button>
            </div>
        ` : '';

        el.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 ${glowCircle} rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

            <!-- V40.2.23 — DRAG ZONE EXPANDIDA (faixa esquerda inteira)
                 ANTES: drag-handle era um quadradinho w-6 h-6 (24px²) no canto superior esquerdo.
                        Usuário tinha que MIRAR no alvo pequeno pra arrastar — gargalo de UX.
                 AGORA: a faixa esquerda inteira do card (w-10 = 40px, altura total) vira zona de drag.
                        Inclui a área da border-left colorida (tag) e o halo branco — visualmente
                        nada muda, mas a área de toque cresceu 8x.

                 V40.2.25 — Ícone ⋮⋮ ANCORADO NO TOPO:
                 - items-start + pt condicional + mt-0.5 = ícone alinhado com 1ª linha de texto
                 - opacity-100 = ícone visível em fundos escuros (emerald-500)

                 V40.2.26 — FIX DO BLOQUEIO FANTASMA (diagnóstico Jules):
                 ANTES: drag-handle tinha z-20. flex container conteúdo tinha z-30. Mesmo com
                        ml-10 deslocando o flex pra x=40, podia haver bloqueio sutil em alguns
                        navegadores ou em estados específicos do card. Drag parava de funcionar.
                 AGORA: drag-handle ganhou Z-50 (era z-20). Agora é o ELEMENTO MAIS ALTO da
                        cadeia de hit-testing dentro do card. Nenhuma outra camada (z-10, 20, 30,
                        40) pode interceptar toques na faixa esquerda. Belt-and-suspenders. -->
            <div class="drag-handle absolute left-0 top-0 bottom-0 w-10 flex items-start justify-center ${isMicro ? 'pt-1.5' : 'pt-2'} pointer-events-auto z-50" title="Arrastar (Mover)">
                <i class="ph ph-dots-six-vertical ${iconColor} text-base mt-0.5"></i>
            </div>

            <!-- V40.2.26 FIX CRÍTICO: pl-10 → ml-10
                 ANTES (V40.2.23-25): pl-10 (padding-left 40px) criava uma área de 40px à esquerda
                                       do flex container. Como o flex tem z-30 e o drag-handle tem
                                       z-20, esses 40px de padding INTERCEPTAVAM os toques que
                                       deveriam ir pro drag-handle. Resultado: drag NÃO funcionava.
                 AGORA: ml-10 (margin-left 40px) desloca o flex container pra x=40, deixando os
                        primeiros 40px do card LIVRES pra receber toques do drag-handle (z-20).
                 Foi um bug invisível: visualmente idêntico, mas a área de toque era diferente. -->
            <div class="flex justify-between items-start z-30 relative ml-10">
                <div class="flex flex-1 min-w-0 pr-2">
                    <div class="flex flex-col flex-1 min-w-0 pointer-events-auto">
                        <span ${isSearching ? '' : `onclick="openTimePicker('${block.id}', ${block.startMin}, event)"`} class="time-label ${isMicro ? 'hidden' : 'block'} text-[10px] font-bold tracking-widest ${timeColor} uppercase opacity-90 truncate ${isSearching ? '' : 'cursor-pointer hover:opacity-70 hover:underline'} transition max-w-full" title="${isSearching ? '' : 'Alterar Horário'}">${formatClock(block.startMin)} - ${formatClock(block.startMin + block.duration)} &bull; ${formatDur(block.duration)}${title2 && mbs.length ? ` &bull; <i class="ph-bold ph-check-square"></i> ${mbs.filter(m => m && m.done).length}/${mbs.length}` : ''}</span>
                        <div class="title-wrapper flex ${title2 || block.expanded ? 'items-start' : 'items-center'} ${isMicro ? 'mt-0' : 'mt-0.5'} min-w-0 pointer-events-none">
                            ${title2 || block.expanded ? pastIconHtml.replace('class="pointer-events-auto', 'class="mt-[2px] pointer-events-auto') : pastIconHtml}
                            <h3 class="block-title ${isMicro ? 'text-[13px] mt-0' : 'text-[14px]'} font-bold leading-tight ${block.expanded ? 'min-w-0 break-words' : title2 ? 'min-w-0 line-clamp-2 break-words' : 'truncate'} ${titleClass}">${goalBadge(block.goalId)}${escapeHtml(block.title)}</h3>
                            <span class="micro-time ${isMicro ? 'block' : 'hidden'} text-[11px] font-bold ${timeColor} ml-1 shrink-0 ${isSearching ? '' : 'cursor-pointer hover:opacity-70 hover:underline'} transition pointer-events-auto" ${isSearching ? '' : `onclick="openTimePicker('${block.id}', ${block.startMin}, event)"`} title="${isSearching ? '' : 'Alterar Horário'}">&bull; <span class="micro-time-val">${formatDur(block.duration)}</span></span>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-1.5 shrink-0 relative z-[60] pointer-events-auto select-auto">
                    <button onclick="toggleExpandBlock('${block.id}', event)" class="block-btn w-7 h-7 flex items-center justify-center ${btnBg} ${iconColor} rounded transition" title="Expandir/Recolher">
                        <i class="ph ${block.expanded ? 'ph-caret-up' : 'ph-caret-down'}"></i>
                    </button>
                    <button onclick="toggleBlockCompletion('${block.id}', event)" class="block-btn w-7 h-7 flex items-center justify-center ${btnBg} ${checkColor} rounded transition" title="Concluir">
                        <i class="${block.completed ? 'ph-fill ph-check-circle' : 'ph ph-check'}"></i>
                    </button>
                </div>
            </div>
            
            ${microblocksSection}

            ${actionBarHtml}

            <div class="resize-handle absolute bottom-0 left-12 w-12 h-6 flex items-end justify-start pb-1.5 z-40 ${block.expanded ? 'hidden' : ''}">
                <div class="w-8 h-1 ${isDarkTheme ? 'bg-white/40' : 'bg-black/20'} rounded-full pointer-events-none"></div>
            </div>
        `;
        enablePhysics(el, block);
    }
    container.appendChild(el);
    
    // V40.3.2: setup do drag de microblocks + tooltip de discovery (após appendChild pra
    // garantir que getBoundingClientRect funciona corretamente).
    // V40.3.2-fix4 DIAGNÓSTICO: try/catch defensivo pra impedir que erro aqui quebre o init.
    try {
        if (block.type !== 'empty' && block.expanded) {
            if (typeof setupMicroblockDrag === 'function') setupMicroblockDrag(el, block);
            if (typeof maybeShowMbDragTooltip === 'function') maybeShowMbDragTooltip(el, block);
        }
    } catch (err) {
        console.warn('[drawBlock] erro em setupMicroblockDrag/Tooltip:', err);
    }
}

// =====================================================
// V40.24.0 — SUBLISTA (bloco-grupo na agenda)
// =====================================================
// Ideia do Jhonatan: "várias coisas pequenas pra fazer no mesmo horário". A sublista é um bloco da agenda
// (horário fixo; arrasta, estica, duplica e arquiva como qualquer bloco) com vários cartões dentro.
// Combinado com ele (16/11/2026):
//   - o horário é da sublista; os cartões dentro não têm horário próprio;
//   - cartão completo: sai da Lista com tag, cor e checklist e volta inteiro ("Voltar pra lista");
//   - quando o horário passa, os não feitos ficam lá (atrasados) e um botão devolve todos pra Lista.
// Dado: o bloco ganha `cards` (lista, mesmo vazia). Sem `cards` = bloco normal. Cada cartão:
//   { id 'cd_…', title, done, tagId?, color?, microblocks [{ title, done }], duration?, columnId? }
// (duration e columnId guardam o tempo e a lista de origem pra quando ele voltar.) Na nuvem vai em
// blocos.cards (o sync.js valida). As mesmas regras e textos estão no kanban.html (PC).
const SUB_MAX = 100;
function isSublist(b) { return !!b && Array.isArray(b.cards); }
function subCount(b) {
    const a = isSublist(b) ? b.cards : [];
    const done = a.filter(c => c && c.done).length;
    return { done: done, total: a.length, open: a.length - done };
}
function subNewId() { return 'cd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
// Todos os cartões marcados = sublista concluída (desmarcar um reabre). Sublista vazia fica como está.
function subSyncDone(b) { const c = subCount(b); if (c.total) b.completed = c.done === c.total; }
// V40.38.0: pra qual lista volta um bloco ou cartão ("Voltar pra lista", "Devolver os não feitos", apagar a sublista
// devolvendo): a lista de onde ele veio; se ela não existe mais (ou o bloco nasceu na agenda), a primeira lista (a da
// esquerda). Pedido dele (23/11); antes o bloco ia sempre pra Geral. O mesmo do PC (backToListId).
function backToListColumn(columnId) {
    return (columnId && backlogColumnsDb.find(c => c.id === columnId)) || backlogColumnsDb[0] || { id: 'col_geral', name: 'Geral' };
}
// Cópia (duplicar, repetir): ids novos e tudo desmarcado, como a checklist dos blocos.
function subCloneCards(cards) {
    return (Array.isArray(cards) ? cards : []).filter(c => c && typeof c === 'object' && !Array.isArray(c)).map(c => {
        const o = JSON.parse(JSON.stringify(c));
        o.id = subNewId();
        o.done = false;
        o.microblocks = (Array.isArray(c.microblocks) ? c.microblocks : []).map(m => ({ title: String((m && m.title) || ''), done: false }));
        return o;
    });
}
// Com uma tarefa na mão, a sublista vira lugar de soltar (menos se a mão leva outra sublista ou um Descanso).
function subCanDrop() { return !!pendingIntent && !Array.isArray(pendingIntent.cards) && pendingIntent.theme !== 'rest'; }
function subCardFrom(p) {
    const card = {
        id: subNewId(), title: String(p.title || '').trim() || 'Sem nome', done: false,
        microblocks: (Array.isArray(p.microblocks) ? p.microblocks : []).filter(m => m && String(m.title || '').trim()).map(m => ({ title: String(m.title).trim(), done: false }))
    };
    if (p.tagId) card.tagId = p.tagId;
    const col = fazCardColor(p.color);
    if (col) card.color = col;
    if (Number(p.duration) > 0) card.duration = Math.round(Number(p.duration));
    if (p.columnId) card.columnId = p.columnId;
    if (goalKeep(p.goalId)) card.goalId = p.goalId; // V40.34.0
    return card;
}
// O cartão volta pra Lista (pra lista de onde veio, se ela ainda existir). Devolve o nome da lista.
function subCardToList(b, card) {
    const col = backToListColumn(card.columnId); // V40.38.0: a de origem; senão a primeira (antes: Geral)
    backlogDb.push({
        id: 'bl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        title: card.title || 'Sem nome',
        duration: Number(card.duration) > 0 ? Number(card.duration) : 30,
        tagId: card.tagId || null,
        microblocks: (card.microblocks || []).map(m => ({ title: m.title, done: false })),
        ...(fazCardColor(card.color) ? { color: fazCardColor(card.color) } : {}),
        ...(goalKeep(card.goalId) ? { goalId: card.goalId } : {}), // V40.34.0
        columnId: col.id
    });
    b.cards = b.cards.filter(c => c.id !== card.id);
    subSyncDone(b);
    return col.name || 'Sem nome';
}
function subCardRowHtml(b, card) {
    const tagColor = card.tagId ? getTagColor(card.tagId) : null;
    const col = fazCardColor(card.color);
    const mbs = Array.isArray(card.microblocks) ? card.microblocks : [];
    const mbDone = mbs.filter(m => m && m.done).length;
    const style = (tagColor ? `border-left-color:${tagColor};` : '') + (col ? `background-color:${col};` : '');
    return `<div class="sub-card${card.done ? ' is-done' : ''}${col && fazIsDark(col) ? ' is-dark' : ''}" data-card-id="${card.id}"${style ? ` style="${style}"` : ''}>
            <button onclick="toggleSublistCard('${b.id}', '${card.id}', event)" class="sub-ck" aria-label="${card.done ? 'Desmarcar' : 'Marcar como feito'}"><i class="ph-bold ph-check"></i></button>
            <span onclick="openSublistCard('${b.id}', '${card.id}', event)" class="sub-card-title">${goalBadge(card.goalId)}${escapeHtml(card.title || 'Sem nome')}</span>
            ${mbs.length ? `<span class="sub-card-mb"><i class="ph ph-check-square"></i>${mbDone}/${mbs.length}</span>` : ''}
        </div>`;
}
// O bloco da sublista na timeline: amarelinho com borda tracejada (ou a cor escolhida), cabeçalho com o
// horário, o nome e "feitos/total", e os cartões que couberem na altura ("+N" abre o resto).
function drawSublist(el, b, heightPx, isSearching) {
    const listMode = !!document.querySelector('.filter-list-mode');
    const c = subCount(b);
    const isPast = b.type === 'past';
    const custom = b.completed ? null : fazCardColor(b.color);
    const dark = !!b.completed || (custom ? fazIsDark(custom) : false);
    const tagColor = getTagColor(b.tagId);
    const placing = subCanDrop();
    const compact = !b.expanded && !listMode && b.duration <= 20; // até 20 min (58 px) só cabe o cabeçalho
    const pb = b.expanded ? 'pb-12' : (compact ? 'pb-1' : 'pb-3');
    el.className += ` sub-block ${b.completed ? 'sub-done' : (custom ? 'sub-custom' : 'sub-amber')}${dark ? ' sub-dark' : ''} pr-2 ${compact ? 'pt-1' : 'pt-2'} ${pb} group select-none`;
    if (custom) el.style.backgroundColor = custom;
    if (tagColor) el.style.cssText += `border-left: 5px solid ${tagColor};`;
    if (b.expanded) {
        el.classList.add('shadow-2xl');
        el.style.height = 'auto'; el.style.minHeight = `${heightPx}px`; el.style.zIndex = '35';
    }
    if (placing) {
        // Tarefa na mão: tocar em qualquer lugar da sublista coloca a tarefa dentro dela
        el.classList.add('sub-target');
        el.onclick = (e) => { if (!e.target.closest('.drag-handle, .resize-handle')) dropIntoSublist(b.id, e); };
    } else if (!b.expanded && !listMode && b.duration < 15) {
        // 5 e 10 min: não cabem os botões → tocar na sublista abre
        el.onclick = (e) => { if (!e.target.closest('.drag-handle, .resize-handle, .block-btn')) toggleExpandBlock(b.id, e); };
    }
    const btnBg = dark ? 'bg-black/20 hover:bg-black/30' : 'bg-black/5 hover:bg-black/10';
    const btnIco = dark ? 'text-white/70 hover:text-white' : 'text-amber-800/70 hover:text-amber-950';
    const pastIcon = (isPast || b.wasDelayed) ? `<div class="pointer-events-auto w-3.5 h-3.5 rounded-full ${dark ? 'bg-black/20 border-black/30 text-white/80' : 'bg-black/10 border-black/10 text-zinc-500'} flex items-center justify-center shrink-0 border mr-1" title="Tempo Esgotado / Realocado"><i class="ph-bold ph-info text-[8px]"></i></div>` : '';
    const timeClick = isSearching || placing ? '' : `onclick="openTimePicker('${b.id}', ${b.startMin}, event)"`;

    let body = '';
    if (placing) {
        body = `<div class="sub-drop ml-10 mr-1 ${compact ? 'mt-0.5' : 'mt-1.5'}"><i class="ph ph-hand-pointing text-sm"></i>Colocar aqui</div>`;
    } else if (!compact) {
        let shown = b.cards, more = 0;
        if (!b.expanded && !listMode) {
            const fit = Math.max(0, Math.floor((heightPx - 46) / 28)); // 28 px por cartão
            if (b.cards.length > fit) { shown = b.cards.slice(0, Math.max(0, fit - 1)); more = b.cards.length - shown.length; }
        }
        const rows = shown.map(card => subCardRowHtml(b, card)).join('');
        const moreHtml = more ? `<button onclick="toggleExpandBlock('${b.id}', event)" class="sub-more">+${more} ${more === 1 ? 'cartão' : 'cartões'}</button>` : '';
        const empty = !b.cards.length && !b.expanded ? `<p class="sub-empty">Vazia · arraste um bloco pra cá ou toque em <i class="ph ph-caret-down"></i></p>` : '';
        const extra = b.expanded ? `
                <input type="text" id="sub-input-${b.id}" maxlength="200" placeholder="+ Adicionar cartão" class="sub-input microblock-input w-full rounded-md px-2 py-1.5 mt-1.5 text-[11px] font-medium outline-none border border-transparent" onkeypress="if(event.key==='Enter') addSublistCard('${b.id}', this, event)">
                ${!b.cards.length ? `<p class="sub-empty">Ou arraste um bloco pra cá, ou agende um cartão da Lista e toque nesta sublista.</p>` : ''}
                ${c.open && b.cards.length ? `<button onclick="sublistReturnOpen('${b.id}', event)" class="sub-return"><i class="ph ph-arrow-u-up-left"></i>${c.open === 1 ? 'Devolver o não feito pra Lista' : `Devolver os ${c.open} não feitos pra Lista`}</button>` : ''}
                ${renderLinkedNotesSection(b, dark)}` : '';
        body = `<div class="sub-cards ml-10 mr-1 relative z-20 pointer-events-auto">${rows}${moreHtml}${empty}${extra}</div>`;
    }

    const barBtn = dark ? 'bg-black/20 hover:bg-black/30 text-white/85 active:scale-95' : 'bg-black/5 hover:bg-black/10 text-zinc-700 active:scale-95';
    const barDel = dark ? 'bg-black/20 hover:bg-red-500/70 text-white/85 hover:text-white active:scale-95' : 'bg-black/5 hover:bg-red-500/80 text-zinc-700 hover:text-white active:scale-95';
    const actionBar = b.expanded && !placing ? `
            <div class="blk-bar absolute left-12 right-3 bottom-1 flex gap-1.5 z-30 pointer-events-auto">
                <button onclick="openEditModal('${b.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${barBtn} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Editar"><i class="ph ph-pencil-simple text-[12px] bar-ico"></i>Editar</button>
                <button onclick="duplicateTask('${b.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${barBtn} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Duplicar"><i class="ph ph-copy text-[12px] bar-ico"></i>Duplicar</button>
                <button onclick="fazArchiveBlock('${b.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${barBtn} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Arquivar"><i class="ph ph-archive text-[12px] bar-ico"></i>Arquivar</button>
                <button onclick="openDeleteModal('${b.id}', event)" class="flex-1 flex items-center justify-center gap-1 ${barDel} rounded-md px-2 py-1.5 text-[10px] font-semibold transition" title="Apagar"><i class="ph ph-trash text-[12px] bar-ico"></i>Apagar</button>
            </div>` : '';

    el.innerHTML = `
        <div class="drag-handle absolute left-0 top-0 bottom-0 w-10 flex items-start justify-center ${compact ? 'pt-1' : 'pt-2'} pointer-events-auto z-50" title="Arrastar (Mover)">
            <i class="ph ph-dots-six-vertical sub-ico text-base mt-0.5"></i>
        </div>
        <div class="flex justify-between items-start z-30 relative ml-10">
            <div class="flex flex-col flex-1 min-w-0 pr-2 pointer-events-auto">
                <span ${timeClick} class="time-label ${compact ? 'hidden' : 'block'} sub-time text-[10px] font-bold tracking-widest uppercase truncate ${timeClick ? 'cursor-pointer' : ''}">${formatClock(b.startMin)} - ${formatClock(b.startMin + b.duration)} &bull; ${formatDur(b.duration)}</span>
                <div class="title-wrapper flex items-center ${compact ? '' : 'mt-0.5'} min-w-0 pointer-events-none">
                    ${pastIcon}<i class="ph-bold ph-list-checks sub-ico text-[13px] shrink-0 mr-1"></i>
                    <h3 class="block-title sub-title text-[14px] font-bold leading-tight truncate${b.completed ? ' line-through' : ''}">${escapeHtml(b.title)}</h3>
                    <span class="sub-count shrink-0 ml-1.5">${c.total ? `${c.done}/${c.total}` : '0'}</span>
                </div>
            </div>
            ${placing ? '' : `<div class="flex gap-1.5 shrink-0 relative z-[60] pointer-events-auto select-auto">
                <button onclick="toggleExpandBlock('${b.id}', event)" class="block-btn w-7 h-7 flex items-center justify-center ${btnBg} ${btnIco} rounded transition" title="Expandir/Recolher"><i class="ph ${b.expanded ? 'ph-caret-up' : 'ph-caret-down'}"></i></button>
                <button onclick="toggleBlockCompletion('${b.id}', event)" class="block-btn w-7 h-7 flex items-center justify-center ${btnBg} ${btnIco} rounded transition" title="${c.total ? 'Marcar todos' : 'Concluir'}"><i class="${b.completed ? 'ph-fill ph-check-circle' : 'ph ph-check'}"></i></button>
            </div>`}
        </div>
        ${body}
        ${actionBar}
        <div class="resize-handle absolute bottom-0 left-12 w-12 h-6 flex items-end justify-start pb-1.5 z-40 ${b.expanded ? 'hidden' : ''}">
            <div class="w-8 h-1 ${dark ? 'bg-white/40' : 'bg-amber-900/25'} rounded-full pointer-events-none"></div>
        </div>`;
    enablePhysics(el, b);
}

window.dropIntoSublist = function(bid, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const b = db.find(x => x.id === bid);
    if (!isSublist(b) || !subCanDrop()) return;
    if (b.cards.length >= SUB_MAX) return showToast(`Uma sublista cabe até ${SUB_MAX} cartões.`);
    const p = pendingIntent;
    b.cards.push(subCardFrom(p));
    subSyncDone(b); // entrou cartão por fazer: a sublista deixa de estar concluída
    saveDb();
    if (p.fromBacklogId) { // veio da Lista: sai de lá (igual a agendar)
        backlogDb = backlogDb.filter(i => i.id !== p.fromBacklogId);
        saveBacklog();
        renderBacklog();
    }
    cancelPendingTask();
    showToast(`Entrou na sublista ${b.title || ''}`.trim());
};

window.addSublistCard = function(bid, inputEl, e) {
    const t = String((inputEl && inputEl.value) || '').trim();
    if (!t) return;
    const b = db.find(x => x.id === bid);
    if (!isSublist(b)) return;
    if (b.cards.length >= SUB_MAX) return showToast(`Uma sublista cabe até ${SUB_MAX} cartões.`);
    b.cards.push({ id: subNewId(), title: t.slice(0, 200), done: false, microblocks: [] });
    subSyncDone(b);
    saveDb();
    renderTimeline();
    setTimeout(() => { const n = document.getElementById(`sub-input-${bid}`); if (n) n.focus({ preventScroll: true }); }, 50);
};

window.toggleSublistCard = function(bid, cid, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (subCanDrop()) return dropIntoSublist(bid, e);
    const f = subFindCard(bid, cid);
    if (!f) return;
    const was = !!f.b.completed;
    goalWatch(() => { // V40.34.0: o aviso da meta (se vier) fica por cima do da sublista
        f.card.done = !f.card.done;
        subSyncDone(f.b);
        saveDb();
        renderTimeline();
        if (!was && f.b.completed) showToast('Sublista concluída! 🎉', 'win');
    });
};

window.sublistReturnOpen = function(bid, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const b = db.find(x => x.id === bid);
    if (!isSublist(b)) return;
    const open = b.cards.filter(c => !c.done);
    if (!open.length) return showToast('Todos os cartões já estão feitos.');
    open.forEach(c => subCardToList(b, c));
    saveDb(); saveBacklog();
    renderTimeline(); renderBacklog();
    showToast(open.length === 1 ? '1 cartão voltou pra Lista' : `${open.length} cartões voltaram pra Lista`);
};

// ---------- cartão aberto: o mesmo formulário da Lista (nome, etiqueta, cor e checklist) ----------
let subCardEdit = null; // { bid, cid, tagId, color, mbs, delArmed }
function subFindCard(bid, cid) {
    const b = db.find(x => x.id === bid);
    const card = isSublist(b) ? b.cards.find(c => c && c.id === cid) : null;
    return card ? { b: b, card: card } : null;
}
window.openSublistCard = function(bid, cid, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    if (subCanDrop()) return dropIntoSublist(bid, e);
    const f = subFindCard(bid, cid);
    if (!f) return;
    closeAllSheets();
    subCardEdit = {
        bid: bid, cid: cid, delArmed: false,
        tagId: f.card.tagId && tagsDb.some(t => t.id === f.card.tagId) ? f.card.tagId : null,
        color: fazCardColor(f.card.color),
        goalId: goalKeep(f.card.goalId), // V40.34.0
        mbs: (f.card.microblocks || []).filter(m => m && typeof m === 'object').map(m => ({ ...m, title: String(m.title || ''), done: !!m.done }))
    };
    document.getElementById('sub-card-from').textContent = 'Sublista: ' + (f.b.title || 'Sem nome');
    document.getElementById('sub-card-title').value = f.card.title || '';
    document.getElementById('sub-card-mb-new').value = '';
    renderSubCardForm();
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    const m = document.getElementById('sub-card-modal');
    m.classList.remove('hidden');
    m.classList.add('flex');
    pushNavState();
};
function renderSubCardForm() {
    const ed = subCardEdit;
    if (!ed) return;
    let html = `<button onclick="selectSubCardTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${ed.tagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}">Sem</button>`;
    tagsDb.forEach(t => {
        const on = ed.tagId === t.id;
        html += `<button onclick="selectSubCardTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${on ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>${escapeHtml(t.name)}</button>`;
    });
    document.getElementById('sub-card-tags').innerHTML = html;
    goalPickFill('sub-card-goal-wrap', 'sub-card-goals', ed.goalId, 'selectSubCardGoal'); // V40.34.0
    goalNamePlaceholder('sub-card-title', ed.goalId, ''); // V40.36.1
    fazRenderColorPicker('sub-card-colors', ed.color, 'fazPickSubCardColor');
    renderSubCardMbs();
    const del = document.getElementById('sub-card-del');
    del.innerHTML = ed.delArmed ? '<i class="ph ph-warning text-base"></i>Toque de novo pra apagar' : '<i class="ph ph-trash text-base"></i>Apagar cartão';
    del.classList.toggle('sub-armed', !!ed.delArmed);
}
function renderSubCardMbs() {
    const ed = subCardEdit;
    if (!ed) return;
    document.getElementById('sub-card-mbs').innerHTML = ed.mbs.length ? ed.mbs.map((m, i) => `
        <div class="flex items-center gap-2 px-1 py-0.5">
            <button type="button" onclick="toggleSubCardMb(${i})" class="shrink-0 w-4 h-4 rounded-[4px] border flex items-center justify-center ${m.done ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-300 bg-white'}" aria-label="${m.done ? 'Desmarcar' : 'Marcar'}">${m.done ? '<i class="ph-bold ph-check text-[10px] text-white"></i>' : ''}</button>
            <span class="flex-1 min-w-0 text-[12px] break-words ${m.done ? 'line-through text-zinc-400' : 'text-zinc-700'}">${escapeHtml(m.title)}</span>
            <button type="button" onclick="removeSubCardMb(${i})" class="shrink-0 w-6 h-6 flex items-center justify-center text-zinc-400 hover:text-red-500" aria-label="Remover item"><i class="ph ph-x text-[12px]"></i></button>
        </div>`).join('') : '<p class="text-[11px] text-zinc-400 px-1">Sem checklist.</p>';
}
window.selectSubCardTag = function(id) { if (!subCardEdit) return; subCardEdit.tagId = subCardEdit.tagId === id ? null : id; renderSubCardForm(); };
window.selectSubCardGoal = function(id) { if (!subCardEdit) return; subCardEdit.goalId = goalKeep(id || null); goalPickFill('sub-card-goal-wrap', 'sub-card-goals', subCardEdit.goalId, 'selectSubCardGoal'); goalNamePlaceholder('sub-card-title', subCardEdit.goalId, ''); }; // V40.34.0; V40.36.1: nome da meta clarinho
window.fazPickSubCardColor = function(c) { if (!subCardEdit) return; subCardEdit.color = fazCardColor(c); fazRenderColorPicker('sub-card-colors', subCardEdit.color, 'fazPickSubCardColor'); };
window.toggleSubCardMb = function(i) { const m = subCardEdit && subCardEdit.mbs[i]; if (m) { m.done = !m.done; renderSubCardMbs(); } };
window.removeSubCardMb = function(i) { if (!subCardEdit) return; subCardEdit.mbs.splice(i, 1); renderSubCardMbs(); };
window.addSubCardMb = function() {
    const inp = document.getElementById('sub-card-mb-new');
    const t = String(inp.value || '').trim();
    if (!subCardEdit || !t) return;
    subCardEdit.mbs.push({ title: t.slice(0, 200), done: false });
    inp.value = '';
    renderSubCardMbs();
    inp.focus({ preventScroll: true });
};
window.saveSubCard = function() {
    const ed = subCardEdit;
    if (!ed) return;
    const f = subFindCard(ed.bid, ed.cid);
    if (!f) { closeSubCard(); return showToast('Esse cartão não está mais na sublista.'); }
    const sg = goalById(goalKeep(ed.goalId));
    const title = document.getElementById('sub-card-title').value.trim() || (sg ? String(sg.title || '').trim() : ''); // V40.36.1: vazio com meta = nome da meta
    if (!title) { document.getElementById('sub-card-title').focus({ preventScroll: true }); return showToast('Dê um nome pro cartão.'); }
    const pending = document.getElementById('sub-card-mb-new').value.trim(); // escreveu um item e não deu Enter: vale também
    if (pending) ed.mbs.push({ title: pending.slice(0, 200), done: false });
    f.card.title = title.slice(0, 200);
    if (ed.tagId) f.card.tagId = ed.tagId; else delete f.card.tagId;
    if (ed.color) f.card.color = ed.color; else delete f.card.color;
    if (goalKeep(ed.goalId)) f.card.goalId = ed.goalId; else delete f.card.goalId; // V40.34.0
    f.card.microblocks = ed.mbs.filter(m => String(m.title || '').trim()).map(m => ({ ...m, title: String(m.title).trim(), done: !!m.done }));
    saveDb();
    closeSubCard();
    renderTimeline();
    showToast('Cartão salvo!');
};
window.subCardToListFromModal = function() {
    const ed = subCardEdit;
    if (!ed) return;
    const f = subFindCard(ed.bid, ed.cid);
    if (!f) { closeSubCard(); return showToast('Esse cartão não está mais na sublista.'); }
    const name = subCardToList(f.b, f.card);
    saveDb(); saveBacklog();
    const a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName)) a.blur(); // campo com foco numa janelinha fechada esconderia a barrinha
    closeSubCard();
    renderTimeline(); renderBacklog();
    undoNameStep('Voltou pra lista ' + name); // V40.38.0: na barrinha do Desfazer (aviso vermelho fica pra problema)
};
window.deleteSubCardFromModal = function() {
    const ed = subCardEdit;
    if (!ed) return;
    if (!ed.delArmed) { ed.delArmed = true; renderSubCardForm(); return; } // 2 toques: não apaga sem querer
    const f = subFindCard(ed.bid, ed.cid);
    if (f) {
        f.b.cards = f.b.cards.filter(c => c.id !== ed.cid);
        subSyncDone(f.b);
        saveDb();
    }
    closeSubCard();
    renderTimeline();
    showToast('Cartão apagado.');
};
window.closeSubCard = function(keepOverlay) {
    subCardEdit = null;
    const m = document.getElementById('sub-card-modal');
    if (!m || m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
    if (!keepOverlay) document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
};

// =====================================================
// V40.30.0 — SUBLISTA ARRASTANDO NO CELULAR (o PC faz igual desde a V40.28.0)
// =====================================================
// Pedido do Jhonatan: os cartões da sublista funcionam como os de fora. Segurar um cartão e arrastar:
//   - pra um horário livre do dia: vira bloco ali, inteiro (nome, tag, cor, checklist, feito e o tempo dele);
//   - pra outra sublista: muda de sublista.
// E o contrário: arrastar um bloco pela alça e soltar em cima de uma sublista: ele vira cartão dela.
// Regras e avisos iguais aos do PC (kanban.html: subCardOut, subCardMove, blockIntoSub); quando dá certo, quem avisa é
// a barrinha do Desfazer ("Cartão saiu da sublista", "Cartão mudou de sublista", "Bloco entrou na sublista"). Só na agenda de 1 dia
// (com 2 ou 3 dias os blocos aparecem resumidos; nos filtros e na busca a agenda vira lista).
// Gesto: segurar 400 ms num cartão (fora do círculo) e ele sai acompanhando o dedo. Um contorno tracejado mostra
// onde ele vira bloco: começa onde está o dedo e encosta no próximo bloco se precisar; vermelho = não cabe ali.
// Perto do topo ou do fim da tela a agenda rola sozinha. Cada arrasto vira um passo só no Desfazer.
var subDrag = null;        // arrasto de cartão em andamento: a agenda não redesenha e o sync espera
var subDragClickUntil = 0; // o "clique" que sobra ao soltar não abre nem marca o cartão
var subTipShown = {};      // dica "segure um cartão" já mostrada nesta sublista (só na memória)
const SUB_DRAG_MS = 400, SUB_DRAG_SLOP = 8;

function subCardDur(c) { return Number(c && c.duration) > 0 ? Math.round(Number(c.duration)) : 30; }
function subHits(ds, st, dur) { return db.some(x => x && x.date === ds && st < x.startMin + x.duration && x.startMin < st + dur); }
// O vago do dia em volta de `min` ({ a, b }, dentro do horário do dia); null se `min` cai em cima de um bloco.
function subFreeAround(ds, min) {
    const lo = START_HOUR * 60, hi = END_HOUR * 60;
    if (!(min >= lo && min < hi)) return null;
    let a = lo, b = hi;
    for (const x of db) {
        if (!x || x.date !== ds) continue;
        const s = x.startMin, e = x.startMin + x.duration;
        if (min >= s && min < e) return null;
        if (e <= min && e > a) a = e;
        if (s > min && s < b) b = s;
    }
    return { a: a, b: b };
}

// Cartão → bloco no dia `ds` às `st` (o mesmo bloco que o PC cria). Devolve true se saiu da sublista.
function subCardOut(bid, cid, ds, st) {
    const f = subFindCard(bid, cid);
    if (!f) { showToast('Esse cartão não está mais na sublista.'); return false; }
    const dur = subCardDur(f.card);
    st = Math.round(Number(st) / 5) * 5;
    if (!(st >= 0 && st + dur <= 1440) || subHits(ds, st, dur)) { showToast('Conflito! O cartão ficou na sublista.'); return false; }
    const today = getTodayStr(), n = Date.now(), col = fazCardColor(f.card.color);
    db.push({
        id: 'f_' + n + '_' + Math.random().toString(36).slice(2, 7),
        type: ds < today || (ds === today && st + dur <= currentRealMins) ? 'past' : 'focus',
        title: String(f.card.title || '').trim() || 'Sem nome',
        ...(col ? { color: col } : {}),
        startMin: st,
        duration: dur,
        date: ds,
        microblocks: (Array.isArray(f.card.microblocks) ? f.card.microblocks : []).filter(m => m && String(m.title || '').trim())
            .map((m, i) => ({ id: 'mb_' + n + '_' + i + Math.random().toString(36).slice(2, 5), title: String(m.title).trim(), done: !!m.done })),
        completed: !!f.card.done,
        theme: 'focus',
        tagId: f.card.tagId && tagsDb.some(t => t.id === f.card.tagId) ? f.card.tagId : null,
        ...(goalKeep(f.card.goalId) ? { goalId: f.card.goalId } : {}), // V40.34.0
        ...(f.card.columnId ? { columnId: String(f.card.columnId) } : {}), // V40.38.0: o cartão lembra de qual lista veio; o bloco também
        linkedNoteIds: []
    });
    f.b.cards = f.b.cards.filter(c => c.id !== cid);
    subSyncDone(f.b);
    saveDb(); // a barrinha do Desfazer avisa: "Cartão saiu da sublista" (aviso só quando não dá)
    renderTimeline();
    return true;
}
// Cartão inteiro (o mesmo id) de uma sublista pra outra.
function subCardMoveTo(bid, cid, toId) {
    const f = subFindCard(bid, cid), to = db.find(x => x.id === toId);
    if (!f) { showToast('Esse cartão não está mais na sublista.'); return false; }
    if (!isSublist(to) || toId === bid) return false;
    if (to.cards.length >= SUB_MAX) { showToast(`Uma sublista cabe até ${SUB_MAX} cartões.`); return false; }
    to.cards.push(JSON.parse(JSON.stringify(f.card)));
    f.b.cards = f.b.cards.filter(c => c.id !== cid);
    subSyncDone(to);
    subSyncDone(f.b);
    saveDb(); // barrinha do Desfazer: "Cartão mudou de sublista"
    renderTimeline();
    return true;
}
// Bloco → cartão da sublista (o mesmo cartão que o PC cria). Com nota vinculada, pergunta antes (como no PC).
function blockIntoSublist(id, subId, sure) {
    const b = db.find(x => x.id === id), s = db.find(x => x.id === subId);
    if (!b || !isSublist(s) || id === subId) return false;
    if (isSublist(b)) { showToast('Uma sublista não entra em outra.'); return false; }
    if (b.theme === 'rest') { showToast('Descanso não entra numa sublista.'); return false; }
    if (s.cards.length >= SUB_MAX) { showToast(`Uma sublista cabe até ${SUB_MAX} cartões.`); return false; }
    const nn = (Array.isArray(b.linkedNoteIds) ? b.linkedNoteIds : []).filter(nid => notesDb.some(x => x.id === nid)).length;
    if (nn && !sure) {
        askGoalConfirm('Colocar na sublista?', nn === 1
            ? 'Este bloco tem 1 nota vinculada. No cartão da sublista ela não fica vinculada (continua nas Notas).'
            : `Este bloco tem ${nn} notas vinculadas. No cartão da sublista elas não ficam vinculadas (continuam nas Notas).`,
            'Colocar na sublista', () => blockIntoSublist(id, subId, true), 'neutral');
        return false;
    }
    const card = {
        id: subNewId(), title: String(b.title || '').trim() || 'Sem nome', done: !!b.completed,
        microblocks: (Array.isArray(b.microblocks) ? b.microblocks : []).filter(m => m && String(m.title || '').trim()).map(m => ({ title: String(m.title).trim(), done: !!m.done })),
        duration: Number(b.duration) > 0 ? Math.round(Number(b.duration)) : 30
    };
    if (b.tagId && tagsDb.some(t => t.id === b.tagId)) card.tagId = b.tagId;
    const col = fazCardColor(b.color);
    if (col) card.color = col;
    if (goalKeep(b.goalId)) card.goalId = b.goalId; // V40.34.0
    if (b.columnId) card.columnId = String(b.columnId); // V40.38.0
    s.cards.push(card);
    subSyncDone(s);
    db = db.filter(x => x.id !== id);
    saveDb(); // barrinha do Desfazer: "Bloco entrou na sublista"
    renderTimeline();
    return true;
}

// ---------- o gesto: segurar o cartão e arrastar ----------
function subDragOff() { // com 2 ou 3 dias, nos filtros, na busca e com uma tarefa na mão não tem arrasto de cartão
    return tlMulti() || showOnlyDelayed || showOnlyCompleted || !!(searchQuery && searchQuery.trim()) || !!pendingIntent;
}
function subDragSetup(el, b) {
    if (!isSublist(b) || subDragOff()) return;
    el.querySelectorAll('.sub-card[data-card-id]').forEach(row => {
        const press = (e) => subDragPress(e, b.id, row);
        row.addEventListener('touchstart', press, { passive: false }); // não-passivo: depois de segurar, o arrasto consegue parar a rolagem
        row.addEventListener('mousedown', press);
    });
}
function subDragTip(el, b) { // 3 vezes no aparelho, uma por sublista aberta
    if (!isSublist(b) || !b.expanded || !b.cards.length || subDragOff() || subTipShown[b.id]) return;
    let n = 0;
    try { n = Number(localStorage.getItem('tb__dica_sub_arrastar')) || 0; } catch (e) {}
    if (n >= 3) return;
    subTipShown[b.id] = true;
    try { localStorage.setItem('tb__dica_sub_arrastar', String(n + 1)); } catch (e) {}
    const tip = document.createElement('div');
    tip.className = 'sub-tip absolute top-12 left-12 right-3 z-[55] px-3 py-1.5 bg-zinc-900/90 text-white text-[10px] font-medium rounded-lg shadow-lg pointer-events-none flex items-center gap-1.5 transition-opacity duration-500';
    tip.innerHTML = '<i class="ph ph-hand-tap text-xs"></i> Segure um cartão pra arrastar ele pra fora';
    el.appendChild(tip);
    setTimeout(() => { tip.style.opacity = '0'; setTimeout(() => tip.remove(), 500); }, 3500);
}
// Segurar parado 400 ms (mexer até 8 px) e chama begin(x, y) com onde o dedo está. Mexeu antes = está rolando: não chama.
// V40.31.0: separado do arrasto do cartão pra servir também ao bloco dos dias lado a lado.
function fazLongPress(e, begin) {
    const p = e.touches ? e.touches[0] : e;
    const pre = { x0: p.clientX, y0: p.clientY, x: p.clientX, y: p.clientY, timer: null };
    const stop = () => {
        clearTimeout(pre.timer);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', stop);
        document.removeEventListener('touchcancel', stop);
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', stop);
    };
    const move = (ev) => {
        const q = ev.touches ? ev.touches[0] : ev;
        if (!q) return;
        pre.x = q.clientX; pre.y = q.clientY;
        if (Math.abs(pre.x - pre.x0) > SUB_DRAG_SLOP || Math.abs(pre.y - pre.y0) > SUB_DRAG_SLOP) stop(); // está rolando a agenda
    };
    pre.timer = setTimeout(() => { stop(); begin(pre.x, pre.y); }, SUB_DRAG_MS);
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', stop);
    document.addEventListener('touchcancel', stop);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', stop);
}
function subDragPress(e, bid, row) {
    if (subDrag || blkDrag || isPhysicsBusy) return;
    if (e.touches ? e.touches.length !== 1 : e.button !== 0) return;
    if (e.target.closest('.sub-ck')) return; // o círculo continua só marcando
    fazLongPress(e, (x, y) => subDragBegin(bid, row, x, y));
}
function subDragBegin(bid, row, x, y) {
    const cid = row.dataset.cardId;
    if (subDrag || !row.isConnected || !subFindCard(bid, cid) || subDragOff()) return;
    const r = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.removeAttribute('data-card-id');
    ghost.querySelectorAll('[onclick]').forEach(n => n.removeAttribute('onclick'));
    ghost.classList.add('sub-ghost');
    ghost.style.width = r.width + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = r.top + 'px';
    document.body.appendChild(ghost);
    const land = document.createElement('div');
    land.className = 'sub-land';
    land.style.display = 'none';
    container.appendChild(land);
    row.classList.add('sub-src');
    isPhysicsBusy = true; // o cartão aberto não fecha rolando e a pinça não troca os dias no meio
    if (navigator.vibrate) navigator.vibrate(20);
    subDrag = { bid: bid, cid: cid, row: row, ghost: ghost, land: land, offX: x - r.left, offY: y - r.top, x: x, y: y, edge: 0, target: null };
    subDrag.timer = setInterval(subDragTick, 16);
    document.addEventListener('touchmove', subDragMove, { passive: false });
    document.addEventListener('touchend', subDragEnd);
    document.addEventListener('touchcancel', subDragEnd);
    document.addEventListener('mousemove', subDragMove);
    document.addEventListener('mouseup', subDragEnd);
    subDragTarget();
}
function subDragArea() { // o pedaço da agenda que aparece (abaixo do cabeçalho)
    const sc = document.getElementById('timeline-scroll').getBoundingClientRect();
    const hd = document.querySelector('header');
    return { top: Math.max(sc.top, hd ? hd.getBoundingClientRect().bottom : sc.top), bottom: sc.bottom };
}
function subDragMove(e) {
    const st = subDrag;
    if (!st) return;
    const p = e.touches ? e.touches[0] : e;
    if (!p) return;
    if (e.cancelable) e.preventDefault(); // a agenda não rola junto com o cartão
    st.x = p.clientX; st.y = p.clientY;
    st.ghost.style.left = (st.x - st.offX) + 'px';
    st.ghost.style.top = (st.y - st.offY) + 'px';
    const a = subDragArea(), up = a.top + 56 - st.y, down = st.y - (a.bottom - 72);
    st.edge = up > 0 ? -Math.min(10, 2 + up / 6) : down > 0 ? Math.min(10, 2 + down / 6) : 0; // perto da borda: rola, mais rápido quanto mais perto
    subDragTarget();
}
function subDragTick() {
    const st = subDrag;
    if (!st) return;
    if (!st.row.isConnected) { subDragStop(); renderTimeline(); return; } // a agenda foi redesenhada no meio
    if (!st.edge) return;
    const sc = document.getElementById('timeline-scroll'), before = sc.scrollTop;
    sc.scrollTop += st.edge;
    if (sc.scrollTop !== before) subDragTarget(); // o dedo está parado, mas o que está embaixo dele mudou
}
// Decide o que acontece se o dedo soltar agora e mostra na tela.
function subDragTarget() {
    const st = subDrag;
    if (!st) return;
    const x = st.x, y = st.y;
    let t = null, over = null;
    container.querySelectorAll('.block-item.sub-block').forEach(el => {
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = el;
    });
    container.querySelectorAll('.sub-over').forEach(el => { if (el !== over || el.dataset.blockId === st.bid) el.classList.remove('sub-over'); });
    if (over) {
        if (over.dataset.blockId === st.bid) t = { kind: 'self' };
        else { t = { kind: 'sub', id: over.dataset.blockId }; over.classList.add('sub-over'); }
    } else {
        const a = subDragArea(), cr = container.getBoundingClientRect();
        if (y >= a.top && y <= a.bottom) {
            const f = subFindCard(st.bid, st.cid), dur = f ? subCardDur(f.card) : 30, lo = START_HOUR * 60, hi = END_HOUR * 60;
            const min = Math.max(lo, Math.min(hi - 5, Math.round(tlMin(y - cr.top) / 5) * 5));
            const gap = subFreeAround(getActiveDateStr(), min);
            t = gap && gap.b - gap.a >= dur
                ? { kind: 'free', ok: true, st: Math.max(gap.a, Math.min(min, gap.b - dur)), dur: dur }
                : { kind: 'free', ok: false, st: min, dur: dur };
        }
    }
    st.target = t;
    const L = st.land;
    if (t && t.kind === 'free') {
        const y0 = tlY(t.st), y1 = tlY(Math.min(t.st + t.dur, END_HOUR * 60));
        L.style.display = '';
        L.style.top = (y0 + 1) + 'px';
        L.style.height = Math.max(20, y1 - y0 - 2) + 'px';
        L.classList.toggle('bad', !t.ok);
        L.textContent = t.ok ? `${formatClock(t.st)} - ${formatClock(t.st + t.dur)}` : 'Não cabe aqui';
    } else {
        L.style.display = 'none';
    }
}
function subDragStop() {
    const st = subDrag;
    if (!st) return null;
    subDrag = null;
    clearInterval(st.timer);
    document.removeEventListener('touchmove', subDragMove);
    document.removeEventListener('touchend', subDragEnd);
    document.removeEventListener('touchcancel', subDragEnd);
    document.removeEventListener('mousemove', subDragMove);
    document.removeEventListener('mouseup', subDragEnd);
    st.ghost.remove();
    st.land.remove();
    st.row.classList.remove('sub-src');
    container.querySelectorAll('.sub-over').forEach(el => el.classList.remove('sub-over'));
    subDragClickUntil = Date.now() + 400;
    setTimeout(() => { isPhysicsBusy = false; }, 200);
    return st;
}
function subDragEnd(e) {
    if (!subDrag) return;
    if (e && e.touches && e.touches.length) return; // ainda tem dedo na tela
    const st = subDragStop(), t = st.target;
    if (e && e.type === 'touchcancel') { renderTimeline(); return; } // o sistema cancelou o toque: nada muda
    let moved = false;
    if (t && t.kind === 'sub') moved = subCardMoveTo(st.bid, st.cid, t.id);
    else if (t && t.kind === 'free' && t.ok) moved = subCardOut(st.bid, st.cid, getActiveDateStr(), t.st);
    else if (t && t.kind === 'free') showToast('Conflito! O cartão ficou na sublista.');
    if (!moved) renderTimeline();
}
document.addEventListener('click', (e) => {
    if (Date.now() >= subDragClickUntil) return;
    subDragClickUntil = 0;
    e.stopPropagation();
    e.preventDefault();
}, true);

// Bloco arrastado pela alça em cima de uma sublista (onde está o dedo): marca a sublista e deixa o bloco meio
// transparente pra ela aparecer por baixo. Guarda o id dela no bloco (data-over-sub) pra hora de soltar.
function subDropMark(el, block, x, y) {
    let over = null;
    container.querySelectorAll('.block-item.sub-block').forEach(s => {
        if (s === el || s.dataset.blockId === block.id) return;
        const r = s.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) over = s;
    });
    const fits = !!over && !isSublist(block) && block.theme !== 'rest';
    container.querySelectorAll('.sub-over').forEach(s => { if (s !== over || !fits) s.classList.remove('sub-over'); });
    if (fits) over.classList.add('sub-over');
    el.classList.toggle('into-sub', fits);
    el.dataset.overSub = over ? over.dataset.blockId : '';
}
function subDropClear(el) {
    el.classList.remove('into-sub');
    delete el.dataset.overSub;
    container.querySelectorAll('.sub-over').forEach(s => s.classList.remove('sub-over'));
}

// =====================================================
// V40.31.0 — DIAS LADO A LADO: ARRASTAR BLOCO DE UM DIA PRO OUTRO (celular)
// =====================================================
// Fila do Jhonatan (escolha dele na V40.26.0: "arrastar entre os dias numa próxima versão"; "pode fazer" em 18/11).
// Com 2 ou 3 dias na tela: segurar um bloco 400 ms e arrastar. O próprio bloco vai com o dedo, encaixado de 5 em 5 min
// na coluna do dia que está embaixo do dedo; se bater em outro bloco, procura o vago mais perto (até 30 min, ou o tempo
// do bloco se ele for maior) e encosta nele; sem vago perto fica vermelho ("Não cabe aqui"). Um balão em cima do dedo
// diz o dia e a hora ("Qui 19 · 14:30").
// O lugar de onde ele saiu fica tracejado. Soltar muda o dia e/ou o horário, com as regras do arrasto de 1 dia (horário
// que já passou vira "passado"; o passado que foi pro futuro fica marcado como adiado). Em cima de uma sublista: entra
// nela (como no dia sozinho). Perto da borda de cima/baixo a agenda rola; parado na borda da esquerda/direita, os dias
// andam (um a cada 0,7 s). Um passo só no Desfazer ("Bloco movido"). Tocar sem segurar continua abrindo o dia; com
// tarefa na mão não arrasta. O PC já arrasta entre os dias na Semana desde a V40.9.0.
var blkDrag = null; // arrasto em andamento: a agenda só redesenha quando os dias andam (blkDrag.paging) e o sync espera
const BLK_PAGE_MS = 700, BLK_SNAP_MAX = 30;

function blkDragSetup() { // chamado no fim do tlRenderMulti
    if (!tlMulti() || pendingIntent) return;
    container.querySelectorAll('.tl-mini[data-mini-id]').forEach(el => {
        const press = (e) => blkDragPress(e, el);
        el.addEventListener('touchstart', press, { passive: false }); // não-passivo: depois de segurar, o arrasto consegue parar a rolagem
        el.addEventListener('mousedown', press);
    });
}
function blkDragTipOnce() { // 3 vezes no aparelho, ao pôr 2 ou 3 dias na tela
    let n = 0;
    try { n = Number(localStorage.getItem('tb__dica_arrastar_dias')) || 0; } catch (e) {}
    if (n >= 3) return;
    try { localStorage.setItem('tb__dica_arrastar_dias', String(n + 1)); } catch (e) {}
    showToast('Segure um bloco pra arrastar ele pra outro dia');
}
// O horário mais perto de st0 (até BLK_SNAP_MAX min, ou o tempo do bloco) onde ele cabe nesse dia, sem contar ele mesmo; null se não tem.
function blkBestStart(ds, st0, dur, id) {
    const lo = START_HOUR * 60, hi = END_HOUR * 60;
    const others = db.filter(v => v && v.date === ds && v.id !== id && v.startMin < hi && v.startMin + v.duration > lo).sort((p, q) => p.startMin - q.startMin);
    let cur = lo, best = null;
    const tryGap = (a, b) => {
        if (b - a < dur) return;
        const s = Math.max(a, Math.min(st0, b - dur));
        if (best === null || Math.abs(s - st0) < Math.abs(best - st0)) best = s;
    };
    others.forEach(v => { tryGap(cur, v.startMin); cur = Math.max(cur, v.startMin + v.duration); });
    tryGap(cur, hi);
    return best !== null && Math.abs(best - st0) <= Math.max(BLK_SNAP_MAX, dur) ? best : null; // bloco comprido pode encostar mais longe
}
// Muda o dia e/ou o horário do bloco. Devolve true se mudou.
function blkMoveTo(id, ds, st) {
    const b = db.find(v => v.id === id);
    if (!b) return false;
    st = Math.round(Number(st) / 5) * 5;
    if (b.date === ds && b.startMin === st) return false; // soltou onde estava
    if (!(st >= 0 && st + b.duration <= 1440) || db.some(v => v && v.id !== id && v.date === ds && st < v.startMin + v.duration && v.startMin < st + b.duration)) {
        showToast('Conflito! A tarefa voltou.');
        return false;
    }
    const today = getTodayStr(), past = ds < today || (ds === today && st + b.duration <= currentRealMins);
    if (!past) { if (b.type === 'past') b.wasDelayed = true; b.type = 'focus'; } // igual ao arrasto de 1 dia (e ao retimeFields do PC)
    else if (b.type === 'focus') b.type = 'past';
    b.date = ds;
    b.startMin = st;
    b.expanded = false;
    saveDb(); // barrinha do Desfazer: "Bloco movido"
    renderTimeline();
    return true;
}

function blkDragPress(e, el) {
    if (blkDrag || subDrag || isPhysicsBusy || pendingIntent) return;
    if (e.touches ? e.touches.length !== 1 : e.button !== 0) return;
    fazLongPress(e, (x, y) => blkDragBegin(el, x, y));
}
function blkDragBegin(el, x, y) {
    const id = el.dataset.miniId, b = db.find(v => v.id === id);
    if (blkDrag || subDrag || !b || !el.isConnected || !tlMulti() || pendingIntent) return;
    const r = el.getBoundingClientRect(), tip = document.createElement('div');
    tip.className = 'tl-drag-tip';
    document.body.appendChild(tip);
    el.classList.add('tl-dragging');
    isPhysicsBusy = true; // a pinça e o "pro lado anda um dia" ficam quietos
    if (navigator.vibrate) navigator.vibrate(20);
    blkDrag = { id: id, el: el, ph: null, tip: tip, offY: Math.max(0, Math.min(y - r.top, r.height)), x: x, y: y, edge: 0, side: 0, sideAt: 0, target: null, paging: false };
    blkDragMarkFrom(el);
    blkDrag.timer = setInterval(blkDragTick, 16);
    document.addEventListener('touchmove', blkDragMove, { passive: false });
    document.addEventListener('touchend', blkDragEnd);
    document.addEventListener('touchcancel', blkDragEnd);
    document.addEventListener('mousemove', blkDragMove);
    document.addEventListener('mouseup', blkDragEnd);
    blkDragTarget();
}
function blkDragMarkFrom(el) { // tracejado no lugar de onde o bloco saiu
    const st = blkDrag;
    if (!st || !el || !el.parentNode) return;
    if (st.ph) st.ph.remove();
    const ph = document.createElement('div');
    ph.className = 'tl-src';
    ph.style.top = el.style.top;
    ph.style.height = el.style.height;
    el.parentNode.appendChild(ph);
    st.ph = ph;
}
function blkDragMove(e) {
    const st = blkDrag;
    if (!st) return;
    const p = e.touches ? e.touches[0] : e;
    if (!p) return;
    if (e.cancelable) e.preventDefault(); // a agenda não rola junto com o bloco
    st.x = p.clientX; st.y = p.clientY;
    const a = subDragArea(), up = a.top + 56 - st.y, down = st.y - (a.bottom - 72);
    st.edge = up > 0 ? -Math.min(10, 2 + up / 6) : down > 0 ? Math.min(10, 2 + down / 6) : 0;
    const cr = container.getBoundingClientRect(), side = st.x < cr.left + 14 ? -1 : st.x > cr.right - 14 ? 1 : 0;
    if (side !== st.side) { st.side = side; st.sideAt = Date.now(); }
    blkDragTarget();
}
function blkDragTick() {
    const st = blkDrag;
    if (!st) return;
    if (st.edge) {
        const sc = document.getElementById('timeline-scroll'), before = sc.scrollTop;
        sc.scrollTop += st.edge;
        if (sc.scrollTop !== before) blkDragTarget();
    }
    if (st.side && Date.now() - st.sideAt >= BLK_PAGE_MS) { st.sideAt = Date.now(); blkDragPage(st.side); }
}
// Parado na borda: os dias andam um (a agenda redesenha só agora; o bloco arrastado continua na mão).
function blkDragPage(dir) {
    const st = blkDrag;
    if (!st) return;
    activeDateObj = tlDateObj(addDaysToDateStr(getActiveDateStr(), dir));
    st.paging = true;
    try { runRealTimeEngine(); renderTimeline(); } finally { st.paging = false; }
    const fresh = container.querySelector(`.tl-mini[data-mini-id="${st.id}"]:not(.tl-dragging)`);
    st.ph = null;
    if (fresh) { blkDragMarkFrom(fresh); fresh.remove(); } // o dia de onde ele saiu ainda aparece: tracejado lá
    if (navigator.vibrate) navigator.vibrate(10);
    blkDragTarget();
}
// Decide onde o bloco cai se o dedo soltar agora e mostra (o bloco na coluna, o balão).
function blkDragTarget() {
    const st = blkDrag;
    if (!st) return;
    const b = db.find(v => v.id === st.id);
    if (!b) return;
    const cols = [...container.querySelectorAll('.tl-col')];
    if (!cols.length) return;
    let col = cols.find(c => { const r = c.getBoundingClientRect(); return st.x >= r.left && st.x < r.right; });
    if (!col) col = st.x < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1]; // na régua das horas ou na beirada
    const ds = col.dataset.date, cr = col.getBoundingClientRect(), lo = START_HOUR * 60, hi = END_HOUR * 60, dur = b.duration;
    const st0 = Math.max(lo, Math.min(hi - dur, Math.round(tlMin(st.y - st.offY - cr.top) / 5) * 5));
    const best = blkBestStart(ds, st0, dur, b.id), ok = best !== null, start = ok ? best : st0;
    if (st.el.parentNode !== col) col.appendChild(st.el);
    st.el.style.top = (tlY(start) + 1) + 'px';
    const tm = st.el.querySelector('.tl-mini-time');
    if (tm) tm.textContent = formatClock(start);
    // em cima de uma sublista (bloco normal entra nela, como no dia sozinho)?
    let sub = null;
    if (!isSublist(b) && b.theme !== 'rest') {
        container.querySelectorAll('.tl-mini[data-mini-id]').forEach(m => {
            if (m === st.el || !isSublist(db.find(v => v.id === m.dataset.miniId))) return;
            const r = m.getBoundingClientRect();
            if (st.x >= r.left && st.x <= r.right && st.y >= r.top && st.y <= r.bottom) sub = m;
        });
    }
    container.querySelectorAll('.tl-mini.sub-over').forEach(m => { if (m !== sub) m.classList.remove('sub-over'); });
    if (sub) sub.classList.add('sub-over');
    st.el.classList.toggle('into-sub', !!sub);
    st.el.classList.toggle('bad', !sub && !ok);
    const d = tlDateObj(ds);
    st.target = sub ? { kind: 'sub', id: sub.dataset.miniId } : ok ? { kind: 'move', ds: ds, st: start } : { kind: 'bad' };
    st.tip.textContent = sub ? 'Soltar na sublista' : ok ? `${TL_WD[d.getDay()]} ${d.getDate()} · ${formatClock(start)}` : 'Não cabe aqui';
    st.tip.classList.toggle('bad', !sub && !ok);
    st.tip.style.left = Math.max(60, Math.min(window.innerWidth - 60, st.x)) + 'px';
    st.tip.style.top = Math.max(8, st.y - 44) + 'px';
}
function blkDragStop() {
    const st = blkDrag;
    if (!st) return null;
    blkDrag = null;
    clearInterval(st.timer);
    document.removeEventListener('touchmove', blkDragMove);
    document.removeEventListener('touchend', blkDragEnd);
    document.removeEventListener('touchcancel', blkDragEnd);
    document.removeEventListener('mousemove', blkDragMove);
    document.removeEventListener('mouseup', blkDragEnd);
    st.tip.remove();
    if (st.ph) st.ph.remove();
    st.el.classList.remove('tl-dragging', 'bad', 'into-sub');
    container.querySelectorAll('.sub-over').forEach(m => m.classList.remove('sub-over'));
    subDragClickUntil = Date.now() + 400; // o "clique" que sobra ao soltar não abre o dia
    setTimeout(() => { isPhysicsBusy = false; }, 200);
    return st;
}
function blkDragEnd(e) {
    if (!blkDrag) return;
    if (e && e.touches && e.touches.length) return; // ainda tem dedo na tela
    const st = blkDragStop(), t = st.target;
    if (e && e.type === 'touchcancel') { renderTimeline(); return; } // o sistema cancelou o toque: nada muda
    let done = false;
    if (t && t.kind === 'sub') done = blockIntoSublist(st.id, t.id);
    else if (t && t.kind === 'move') done = blkMoveTo(st.id, t.ds, t.st);
    else if (t && t.kind === 'bad') showToast('Conflito! A tarefa voltou.');
    if (!done) renderTimeline();
}

// --- 5. ENCAIXE MATEMÁTICO ---
// ---------- V40.43.0: "SOLTAR AQUI" PELOS PERÍODOS ----------
// Com a tarefa na mão, cada espaço livre se divide nos Períodos da pessoa (Manhã, Meio-dia, Tarde, Noite...), cada um
// com a sua cor: tocar numa parte põe a tarefa no primeiro horário livre dela (hoje, na parte de agora: a partir de
// agora). Fora de período, parte cinza ("Livre"), mesmo num espaço todo fora deles. Sem nenhum período criado: o campo
// inteiro de sempre. A regra é a mesma do PC (FazSyncCore.periodSlots, no sync.js). Tocar no espaço fora das partes
// (o vãozinho entre elas) faz o de sempre (o começo do espaço).
function perActive() { const C = window.FazSyncCore; return !!(C && typeof C.periodSlots === 'function' && (C.cleanPeriods(periodsDb) || []).length); }
function perSlots(a, b) {
    return perActive() ? window.FazSyncCore.periodSlots(a, b, periodsDb).filter(s => s.b - s.a >= 5) : []; // pedacinho de menos de 5 min não vira campo
}
function perAt(slot, ds) { // onde a tarefa começaria nesta parte (hoje, na parte de agora: a partir de agora), de 5 em 5
    let st = slot.a;
    if (ds === getTodayStr() && currentRealMins > slot.a && currentRealMins < slot.b) st = currentRealMins;
    return Math.ceil(st / 5) * 5;
}
function perStart(slot, gapEnd, ds) { // onde a tarefa entra nesta parte; null = não cabe
    const st = perAt(slot, ds);
    return pendingIntent && st + pendingIntent.duration <= gapEnd ? st : null;
}
// V40.44.0: cada parte num de 3 jeitos: cabe ("ok"), cabe descendo os blocos de baixo ("push", com o plano) ou não cabe.
function perState(slot, gapEnd, ds) {
    const at = perAt(slot, ds);
    if (!pendingIntent) return { at, kind: 'nao', plan: null };
    if (at + pendingIntent.duration <= gapEnd) return { at, kind: 'ok', plan: null };
    const plan = pushAllowed(ds, at) ? pushPlanAt(ds, at) : null;
    return plan && plan.moves.length ? { at, kind: 'push', plan } : { at, kind: 'nao', plan: null };
}
function perTap(slot, gapEnd, ds) { // o toque numa parte, com a hora de agora (a agenda pode estar aberta há uns minutos)
    const now = perState(slot, gapEnd, ds);
    if (now.kind === 'ok') performEncaixeMatematico(now.at, gapEnd - now.at, true, ds);
    else if (now.kind === 'push') pushPlace(now.at, ds);
    else showToast('Não cabe nesse período: toque em outro 👇');
}
function pushN(n) { return n === 1 ? 'empurra 1' : 'empurra ' + n; }
// Põe as partes dentro do campo do espaço livre (el, já posicionado na régua). mini: os dias lado a lado.
// O nome da parte acompanha a rolagem (fica logo abaixo do cabeçalho enquanto a parte aparece: o style.css).
// V40.44.0: parte onde a tarefa não cabe mas cabe descendo os de baixo: "↓ … · empurra N". Nada pra fazer em
// nenhuma parte (vago curto no fim do dia): false, e fica o campo de sempre.
function perZonesInto(el, a, b, ds, mini) {
    const slots = perSlots(a, b);
    if (!slots.length) return false; // nenhum período criado: fica o campo de sempre
    const states = slots.map(s => perState(s, b, ds));
    if (!states.some(x => x.kind !== 'nao')) return false;
    const y0 = tlY(a), today = ds === getTodayStr();
    el.innerHTML = '';
    el.classList.add('tl-pz-box');
    slots.forEach((s, i) => {
        const S2 = states[i], top = tlY(s.a) - y0, h = tlY(s.b) - tlY(s.a), z = document.createElement('div');
        const nm = s.name || 'Livre', name = escapeHtml(nm), at = formatClock(S2.at), push = S2.kind === 'push', no = S2.kind === 'nao';
        z.className = (mini ? 'tl-pz mini' : 'tl-pz') + ' per-' + (s.band || 'livre') + (no ? ' nao' : '') + (push ? ' push' : '') +
            (today && s.b <= currentRealMins ? ' past' : '') + (h < 24 ? ' tiny' : '') + (h < 14 ? ' micro' : '');
        z.style.top = top + 'px';
        z.style.height = Math.max(h - 2, 2) + 'px';
        z.dataset.perStart = no ? '' : String(S2.at);
        z.dataset.perName = nm;
        if (push) z.dataset.push = String(S2.plan.moves.length);
        z.setAttribute('role', 'button');
        z.setAttribute('aria-label', no ? `${nm}: não cabe` : push ? `Encaixar às ${at} (${nm}), descendo ${S2.plan.moves.length === 1 ? '1 bloco' : S2.plan.moves.length + ' blocos'}` : `Soltar às ${at} (${nm})`);
        z.innerHTML = mini ? `<span class="tl-pz-txt"><b>${name}</b><span>${at}${push ? ' ↓' : ''}</span></span>` :
            `<span class="tl-pz-txt"><i class="ph ${push ? 'ph-arrow-line-down' : 'ph-hand-pointing'}"></i><b>${name}</b> <span>· ${at}${no ? ' · não cabe' : push ? ' · ' + pushN(S2.plan.moves.length) : ''}</span></span>`;
        z.onclick = (e) => { e.stopPropagation(); perTap(s, b, ds); };
        el.appendChild(z);
    });
    return true;
}
// A faixa de um vago oculto (36 px): as partes lado a lado, com o nome em cima e a hora embaixo (V40.44.0: "↓" nas que
// entram descendo os de baixo).
function perChipsInto(el, a, b, ds) {
    const slots = perSlots(a, b), states = slots.map(s => perState(s, b, ds));
    if (!states.some(x => x.kind !== 'nao')) return false;
    const range = `${formatClock(a)}–${formatClock(b)}`;
    el.innerHTML = `<span class="sr-only">Soltar aqui · ${range}</span>`; // o que o leitor de tela fala (e o texto de antes)
    el.classList.add('tl-pz-strip');
    const row = document.createElement('div');
    row.className = 'tl-pchips';
    slots.forEach((s, i) => {
        const S2 = states[i];
        if (S2.kind === 'nao') return;
        const push = S2.kind === 'push', c = document.createElement('button'), at = formatClock(S2.at);
        c.type = 'button';
        c.className = 'tl-pchip per-' + (s.band || 'livre') + (push ? ' push' : '');
        c.dataset.perStart = String(S2.at);
        c.dataset.perName = s.name || 'Livre';
        if (push) c.dataset.push = String(S2.plan.moves.length);
        c.innerHTML = `<b>${escapeHtml(s.name || 'Livre')}</b><span>${at}${push ? ' ↓' : ''}</span>`;
        c.title = push ? `Encaixar às ${at} (${s.name || 'Livre'}): ${pushN(S2.plan.moves.length)}` : `Soltar às ${at} (${s.name || 'Livre'})`;
        c.onclick = (e) => { e.stopPropagation(); perTap(s, b, ds); };
        row.appendChild(c);
    });
    el.appendChild(row);
    return true;
}

// ---------- V40.44.0: BLOCOS DE BAIXO ABREM ESPAÇO SOZINHOS ----------
// Escolhas dele em 24/11: "Soltar e esticar" (a tarefa na mão entre blocos colados, num vago curto ou numa parte que não
// comporta; e esticar a duração de um bloco) e "Só o necessário" (desce só a fila de blocos encostados; um vago que
// caiba segura o empurrão). Arrastar um bloco pra cima de outro continua dando "Conflito". A regra é a do PC
// (FazSyncCore.pushPlan/pushRoom, no sync.js); o fim é o fim do dia da agenda (END_HOUR). Hoje, só daqui pra frente.
function pushDayRows(ds, exceptId) { return db.filter(b => b.date === ds && b.id !== exceptId).map(b => ({ id: b.id, start: b.startMin, dur: b.duration })); }
function pushPlanAt(ds, st, dur, exceptId) {
    const C = window.FazSyncCore, d = dur == null ? (pendingIntent ? pendingIntent.duration : 0) : dur;
    return C && typeof C.pushPlan === 'function' && d > 0 ? C.pushPlan(pushDayRows(ds, exceptId), st, st + d, END_HOUR * 60) : null;
}
function pushAllowed(ds, st) { return ds !== getTodayStr() || st >= currentRealMins; }
function pushRetime(b) { // a regra do arrastar: horário que ainda não passou volta a ser foco (e, se estava atrasado, fica marcado)
    const isPastDay = b.date < getTodayStr(), isPastTimeToday = b.date === getTodayStr() && b.startMin + b.duration <= currentRealMins;
    if (!isPastDay && !isPastTimeToday) { if (b.type === 'past') b.wasDelayed = true; b.type = 'focus'; }
}
function pushApply(ds, plan) { // desce os blocos do plano (quem chamou grava, num passo só do Desfazer)
    let n = 0;
    (plan ? plan.moves : []).forEach(m => { const b = db.find(x => x.id === m.id && x.date === ds); if (b) { b.startMin = m.to; pushRetime(b); n++; } });
    return n;
}
function pushWord(n) { return n === 1 ? '1 bloco desceu' : n + ' blocos desceram'; }
// A tarefa da mão às "st", descendo os de baixo só o necessário.
function pushPlace(st, ds) {
    if (!pendingIntent) return;
    st = Math.ceil(st / 5) * 5;
    const plan = pushAllowed(ds, st) ? pushPlanAt(ds, st) : null;
    if (!plan) { showToast('Não cabe: os de baixo passariam do fim do dia 👇'); return; }
    const n = pushApply(ds, plan);
    performEncaixeMatematico(st, pendingIntent.duration, true, ds);
    if (n) undoNameStep('Encaixada · ' + pushWord(n)); // na barrinha do Desfazer (o passo é um só)
}
// Entre dois blocos colados (ou com menos de 10 min entre eles) não há campo pra tocar: um "↓ Encaixar" na emenda.
// list: os blocos do dia, em ordem. parent: o #blocks-container (1 dia) ou a coluna do dia (mini).
function pushPillsInto(parent, list, ds, mini) {
    if (!pendingIntent) return;
    let prev = START_HOUR * 60;
    list.forEach(b => {
        const gap = b.startMin - prev, at = Math.ceil(prev / 5) * 5;
        if (gap >= 0 && gap < 10 && at <= b.startMin && pushAllowed(ds, at)) {
            const plan = pushPlanAt(ds, at);
            if (plan && plan.moves.length) {
                const y = tlY(b.startMin), p = document.createElement('button'), n = plan.moves.length;
                p.type = 'button';
                p.className = 'tl-push' + (mini ? ' mini' : '');
                p.style.top = (y - 12) + 'px'; // bem na emenda (no começo do dia, metade fica no respiro de cima: dentro do bloco cobriria o horário dele)
                p.dataset.pushStart = String(at);
                p.dataset.push = String(n);
                p.innerHTML = `<i class="ph ph-arrow-line-down"></i>${formatClock(at)}`; // curtinho: num dia cheio são vários (a dica da mão explica)
                p.setAttribute('aria-label', `Encaixar às ${formatClock(at)}, descendo ${n === 1 ? '1 bloco' : n + ' blocos'}`);
                p.onclick = (e) => { e.stopPropagation(); pushPlace(at, ds); };
                parent.appendChild(p);
            }
        }
        prev = Math.max(prev, b.startMin + b.duration);
    });
}
// Vago curto demais sem períodos (ou com, mas sem parte nenhuma que dê): o campo vira "↓ Encaixar aqui" se der descendo.
function pushFieldInto(el, a, b, ds, mini) {
    if (!pendingIntent) return false;
    const at = perAt({ a, b }, ds), plan = pushAllowed(ds, at) ? pushPlanAt(ds, at) : null;
    if (!plan || !plan.moves.length) return false;
    const n = plan.moves.length;
    el.classList.add('tl-push-box');
    el.dataset.push = String(n);
    el.innerHTML = mini ? '<i class="ph ph-arrow-line-down"></i>' : `<span class="tl-push-txt"><i class="ph ph-arrow-line-down"></i>Encaixar · ${formatClock(at)} · ${pushN(n)}</span>`;
    el.setAttribute('aria-label', `Encaixar às ${formatClock(at)}, descendo ${n === 1 ? '1 bloco' : n + ' blocos'}`);
    el.onclick = (e) => { e.stopPropagation(); pushPlace(perAt({ a, b }, ds), ds); };
    return true;
}

function performEncaixeMatematico(gapStart, gapDuration, exact, date) { // V40.25.1: exact = hora escolhida pelo toque (não puxa pra "agora")
    const ds = date || getActiveDateStr(); // V40.26.0: na agenda afastada, o dia da coluna tocada
    let start = gapStart;
    if (!exact && ds === getTodayStr() && currentRealMins >= gapStart && currentRealMins <= gapStart + gapDuration) {
        if (currentRealMins + pendingIntent.duration <= gapStart + gapDuration) {
            start = Math.round(currentRealMins / 5) * 5; 
            start = Math.max(gapStart, Math.min(start, gapStart + gapDuration - pendingIntent.duration));
        }
    }
    start = Math.round(start / 5) * 5;
    
    db.push({ 
        id: 'f_' + Date.now(), 
        type: 'focus', 
        title: pendingIntent.title, ...(fazCardColor(pendingIntent.color) ? { color: fazCardColor(pendingIntent.color) } : {}), 
        startMin: start, 
        duration: pendingIntent.duration,
        date: ds,
        microblocks: (pendingIntent.microblocks || []).map(mb => ({
            ...mb,
            id: 'mb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            done: false // V40.1.4: clone reseta status (recomeça do zero)
        })),
        completed: false,
        theme: pendingIntent.theme || 'focus',
        tagId: pendingIntent.tagId || null,
        linkedNoteIds: [], // V40.2: notas vinculadas começam vazias (clone não copia notas)
        ...(Array.isArray(pendingIntent.cards) ? { cards: subCloneCards(pendingIntent.cards) } : {}), // V40.24.0: sublista
        ...(!Array.isArray(pendingIntent.cards) && goalKeep(pendingIntent.goalId) ? { goalId: pendingIntent.goalId } : {}), // V40.34.0: meta ligada
        ...(!Array.isArray(pendingIntent.cards) && pendingIntent.columnId ? { columnId: String(pendingIntent.columnId) } : {}) // V40.38.0: a lista de onde veio ("Voltar pra lista" volta pra ela)
    });
    saveDb();
    
    // V40.5.0-fix8: se veio do backlog (scheduleBacklogItem), só remove de lá AGORA (após confirmar)
    if (pendingIntent.fromBacklogId) {
        backlogDb = backlogDb.filter(i => i.id !== pendingIntent.fromBacklogId);
        saveBacklog();
    }
    
    cancelPendingTask(); 
}

function addDaysToDateStr(dateStr, days) {
    let d = new Date(dateStr + 'T00:00:00'); 
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
}
function addMonthToDateStr(dateStr, monthsToAdd) {
    // V40.36.1: dia 29 a 31 num mês menor vai pro último dia do mês e volta no seguinte (31/01 → 28/02 → 31/03),
    // como no PC. Antes o setMonth escorregava pro mês seguinte (31/01 + 1 mês = 03/03).
    const d = new Date(dateStr + 'T12:00:00'), y = d.getFullYear(), m = d.getMonth() + monthsToAdd;
    return new Date(y, m, Math.min(d.getDate(), new Date(y, m + 1, 0).getDate()), 12).toLocaleDateString('en-CA');
}

window.duplicateTask = function(id, e) {
    e.stopPropagation();
    let b = db.find(x => x.id === id);
    if(b) {
        taskToClone = b;
        closeAllSheets();
        document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('clone-sheet').classList.remove('translate-y-full');
        pushNavState(); // V40.5.0-fix7
    }
}

window.cloneManual = function() {
    if(!taskToClone) return;
    pendingIntent = { 
        title: taskToClone.title, 
        duration: taskToClone.duration, 
        theme: taskToClone.theme || 'focus',
        tagId: taskToClone.tagId || null, // V40.1.4: preserva tag
        ...(fazCardColor(taskToClone.color) ? { color: taskToClone.color } : {}), // V40.36.1: a cor do cartão vai junto (como no Duplicar do PC)
        ...(taskToClone.columnId ? { columnId: taskToClone.columnId } : {}), // V40.38.0: e a lista de onde ele veio
        ...(goalKeep(taskToClone.goalId) ? { goalId: taskToClone.goalId } : {}), // V40.34.0
        microblocks: taskToClone.microblocks || [], // V40.1.4: copia microblocks
        ...(isSublist(taskToClone) ? { cards: subCloneCards(taskToClone.cards) } : {}) // V40.24.0: sublista leva os cartões (desmarcados)
    };
    selectedDur = taskToClone.duration;
    document.getElementById('floating-title').innerText = taskToClone.title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    closeAllSheets();
    // V40.2.8: se estava na busca, fecha pra mostrar a agenda (Cópia única precisa colar em espaço livre)
    if (searchQuery) closeSearchBar();
    renderTimeline();
    showToast("Pronto para colar! Navegue até o dia e toque num espaço livre.");
}

// V40.36.1 — REPETIR (Diariamente / Semanalmente / Mensalmente), igual ao Repetir do PC (V40.36.0):
// - o dia em que o horário já está ocupado fica de fora (antes a cópia ficava por cima do outro bloco), e a janelinha
//   mostra isso antes de confirmar;
// - "Mensalmente" no dia 31 vai pro último dia do mês (addMonthToDateStr);
// - a cópia segue o horário: o que já passou nasce "passado" e o que vem pela frente, "focus" (antes copiava o tipo e o
//   atraso do original: repetir um bloco que já tinha passado criava cópias futuras "passadas"); não concluída, sem
//   atraso e sem notas; checklist e cartões da sublista desmarcados, com ids novos; tag e meta só se ainda existem;
// - no máximo 60 dias, 52 semanas ou 24 meses (começa em 5, 4 e 2, como sempre);
// - um passo só do Desfazer, com o texto "Repetido 4 vezes · 1 dia de fora" (no lugar do aviso vermelho "Clonado com
//   sucesso!": aviso vermelho fica pra problema).
const CLONE_MAX = { daily: 60, weekly: 52, monthly: 24 };
const CLONE_DEF = { daily: 5, weekly: 4, monthly: 2 };
function cloneSource() { return taskToClone ? db.find((x) => x && x.id === taskToClone.id) || null : null; } // o bloco de agora (a sincronização troca os objetos)
function cloneDayTxt(ds) { // "Qua 18/11" (com o ano quando não é este)
    const d = new Date(ds + 'T12:00:00'), p = (n) => String(n).padStart(2, '0');
    return TL_WD[d.getDay()] + ' ' + p(d.getDate()) + '/' + p(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? '/' + d.getFullYear() : '');
}
function cloneDur(b) { return Number(b.duration) > 0 ? Number(b.duration) : 15; }
function cloneBusy(ds, st, dur) { return db.some((x) => x && x.date === ds && st < x.startMin + (Number(x.duration) || 0) && x.startMin < st + dur); }
function clonePlan(b, type, n) { // os dias das cópias: livres (vão ser criadas) e ocupados (ficam de fora)
    const st = b.startMin, dur = cloneDur(b), free = [], busy = [];
    for (let i = 1; i <= n; i++) {
        const ds = type === 'daily' ? addDaysToDateStr(b.date, i) : type === 'weekly' ? addDaysToDateStr(b.date, i * 7) : addMonthToDateStr(b.date, i);
        (cloneBusy(ds, st, dur) ? busy : free).push(ds);
    }
    return { free, busy };
}
function clonePastAt(ds, st, dur) { const t = getTodayStr(), now = new Date(); return ds < t || (ds === t && st + dur <= now.getHours() * 60 + now.getMinutes()); }
function cloneCopy(b, ds, k) {
    const base = Date.now() + '_' + k;
    const nb = {
        ...b, id: 'f_' + base + '_' + Math.random().toString(36).slice(2, 6), date: ds,
        type: clonePastAt(ds, b.startMin, cloneDur(b)) ? 'past' : 'focus',
        microblocks: (b.microblocks || []).map((mb, i) => ({ ...mb, id: 'mb_' + base + '_' + i, done: false })),
        completed: false, expanded: false, linkedNoteIds: []
    };
    delete nb.wasDelayed;
    if (isSublist(b)) { nb.cards = subCloneCards(b.cards); delete nb.goalId; } // a sublista não tem meta (os cartões têm)
    else if (!goalKeep(b.goalId)) delete nb.goalId;
    if (nb.tagId && !(tagsDb || []).some((t) => t && t.id === nb.tagId)) nb.tagId = null;
    return nb;
}
function cloneQtdN() { const v = parseInt(document.getElementById('clone-qtd-input').value, 10); return isNaN(v) ? 0 : v; }
function cloneQtdBlur() { const i = document.getElementById('clone-qtd-input'); if (i && document.activeElement === i) i.blur(); } // campo com foco numa janelinha fechada seguraria o sync
function cloneQtdRender() {
    const b = cloneSource(), max = CLONE_MAX[pendingCloneType] || 60, n = cloneQtdN();
    const sum = document.getElementById('clone-qtd-sum'), busyEl = document.getElementById('clone-qtd-busy'), ok = document.getElementById('clone-qtd-ok');
    document.getElementById('clone-qtd-minus').disabled = n <= 1;
    document.getElementById('clone-qtd-plus').disabled = n >= max;
    busyEl.classList.add('hidden');
    if (!b) { sum.textContent = 'Esse bloco não está mais na agenda.'; ok.disabled = true; ok.textContent = 'Nada pra criar'; return null; }
    if (n < 1) { sum.textContent = 'Escolha de 1 a ' + max + '.'; ok.disabled = true; ok.textContent = 'Criar'; return null; }
    const p = clonePlan(b, pendingCloneType, n), f = p.free;
    sum.textContent = f.length
        ? 'Às ' + formatClock(b.startMin) + ', ' + (f.length === 1 ? 'em ' + cloneDayTxt(f[0]) : 'de ' + cloneDayTxt(f[0]) + ' a ' + cloneDayTxt(f[f.length - 1])) + '. ' +
          (isSublist(b) ? 'Os cartões vão junto, desmarcados.' : (b.microblocks || []).length ? 'O checklist vai junto, desmarcado.' : 'Cada cópia começa não concluída.')
        : 'O horário está ocupado em todos esses dias.';
    if (f.length && p.busy.length) {
        const list = p.busy.slice(0, 3).map(cloneDayTxt).join(', ') + (p.busy.length > 3 ? ' e mais ' + (p.busy.length - 3) : '');
        busyEl.textContent = p.busy.length === 1 ? list + ' fica de fora: o horário já está ocupado.' : p.busy.length + ' dias ficam de fora (horário ocupado): ' + list + '.';
        busyEl.classList.remove('hidden');
    }
    ok.disabled = !f.length;
    ok.textContent = f.length ? 'Criar ' + f.length + (f.length === 1 ? ' cópia' : ' cópias') : 'Nada pra criar';
    return p;
}

window.promptCloneQtd = function(type) {
    if(!taskToClone) return;
    pendingCloneType = type;
    const modal = document.getElementById('clone-qtd-modal'), b = cloneSource();
    document.getElementById('clone-qtd-title').textContent = type === 'daily' ? 'Quantos dias seguidos?' : type === 'weekly' ? 'Por quantas semanas?' : 'Por quantos meses?';
    document.getElementById('clone-qtd-sub').textContent = b ? (b.title || 'Sem nome') + ' · ' + cloneDayTxt(b.date) + ' · ' + formatClock(b.startMin) + '–' + formatClock(b.startMin + cloneDur(b)) : '';
    const input = document.getElementById('clone-qtd-input');
    input.max = String(CLONE_MAX[type] || 60);
    input.value = String(CLONE_DEF[type] || 1);
    document.getElementById('clone-sheet').classList.add('translate-y-full');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    cloneQtdRender();
}
window.cloneQtdInput = function() { // só números, até o máximo
    const inp = document.getElementById('clone-qtd-input'), max = CLONE_MAX[pendingCloneType] || 60;
    const n = parseInt(String(inp.value).replace(/\D/g, ''), 10);
    if (!isNaN(n) && String(Math.min(n, max)) !== inp.value) inp.value = String(Math.min(n, max));
    cloneQtdRender();
}
window.cloneQtdStep = function(d) {
    const max = CLONE_MAX[pendingCloneType] || 60;
    document.getElementById('clone-qtd-input').value = String(Math.max(1, Math.min(max, cloneQtdN() + d)));
    cloneQtdRender();
}
window.cloneQtdKey = function(e) { // Enter (o "Ir" do teclado) confirma
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!document.getElementById('clone-qtd-ok').disabled) confirmCloneQtd();
}

window.confirmCloneQtd = function() {
    const b = cloneSource();
    if (!b) { cloneQtdBlur(); closeAllSheets(); return showToast('Esse bloco não está mais na agenda.'); }
    const n = Math.min(cloneQtdN(), CLONE_MAX[pendingCloneType] || 60);
    if (n < 1) return showToast("Número inválido.");
    const p = clonePlan(b, pendingCloneType, n);
    if (!p.free.length) return showToast('O horário está ocupado em todos esses dias.');
    p.free.forEach((ds, k) => db.push(cloneCopy(b, ds, k)));
    saveDb();
    undoNameStep('Repetido ' + (p.free.length === 1 ? '1 vez' : p.free.length + ' vezes') + (p.busy.length ? ' · ' + p.busy.length + (p.busy.length === 1 ? ' dia' : ' dias') + ' de fora' : ''));
    cloneQtdBlur();
    closeAllSheets();
    renderTimeline(); // V40.2.8: re-render pra atualizar lista de busca se estiver ativa
}

window.cancelCloneQtd = function() {
    cloneQtdBlur();
    closeAllSheets();
}

window.killTask = function(id, e) {
    e.stopPropagation();
    db = db.filter(b => b.id !== id);
    saveDb();
    renderTimeline(); 
}

window.toggleExpandBlock = function(id, e) {
    e.stopPropagation();
    let b = db.find(x => x.id === id);
    if(!b) return;
    
    const willExpand = !b.expanded;
    
    if (willExpand) {
        // V40.1.3: regra "1 por vez" — retrai todos os outros antes
        db.forEach(x => { if (x.id !== id) x.expanded = false; });
    }
    
    b.expanded = willExpand;
    renderTimeline();
}

// V40.1.3: Auto-retrair cards expandidos
// Helper: retrai todos os cards e re-renderiza apenas se algo mudou
function collapseAllBlocks() {
    let changed = false;
    db.forEach(b => { if (b.expanded) { b.expanded = false; changed = true; } });
    if (changed) renderTimeline();
}

// Flag para evitar retração durante drag/resize (a física já gerencia o expanded)
let isPhysicsBusy = false;

// 3a) V40.2.19 — Click-out por NEUTRALIDADE (não mais por "está expandido")
//
//   PROBLEMA RESOLVIDO:
//   No celular, ao expandir um card pra ler, o usuário rola a tela apoiando o dedo
//   em OUTROS cards retraídos (porque a timeline é densa, raramente há área vazia
//   acessível). O navegador interpreta esse toque inicial (a "gordura do dedo")
//   como CLIQUE no card retraído. A regra antiga ("clicou fora do expandido →
//   fecha") matava o expandido injustamente.
//
//   NOVA REGRA (Opção A aprovada por Jhonatan + Jules):
//   - Tocar em QUALQUER card REAL (type='focus' ou 'past'), expandido ou retraído
//     → IGNORA (cards não se fecham uns aos outros).
//   - Tocar em "Tempo Livre" (type='empty', bg-hatched) → FECHA. Área neutra.
//   - Tocar em qualquer área fora de cards (y-axis, padding, fundo) → FECHA.
//   - Botões internos dos cards (concluir, editar, lápis, etc) já chamam
//     stopPropagation no próprio onclick — nunca chegam aqui.
//
//   ROTAS PRA FECHAR O EXPANDIDO:
//   1. Botão ▲ do próprio card (toggleExpandBlock)
//   2. Rolar até o card sumir do viewport + 20px (handler 3b, V40.2.18)
//   3. Tocar em "Tempo Livre" ou área neutra (este handler)
(function setupClickOutCollapse() {
    const timeline = document.getElementById('timeline-scroll');
    if (!timeline) return;
    timeline.addEventListener('click', (e) => {
        if (isPhysicsBusy) return;

        const blockEl = e.target.closest('.block-item');
        if (blockEl) {
            // Tocou em algum card. Descobre se é real (focus/past) ou vazio (empty).
            const id = blockEl.dataset.blockId;
            const b = id ? db.find(x => x.id === id) : null;

            // Card real (focus/past) → ignora, deixa o usuário interagir/rolar livre.
            // Vale tanto pro expandido (preserva leitura) quanto pra retraído (evita
            // o "clique fantasma" quando o dedo só esbarra pra rolar).
            if (b && b.type !== 'empty') return;

            // Tempo Livre (type='empty'): cai pro fechamento padrão (área neutra).
            // Se b não foi encontrado no db (caso raro de dataset corrompido),
            // também cai pro padrão — comportamento seguro.
        }

        // Toque em área neutra (fora de cards) ou em Tempo Livre → fecha expandido.
        collapseAllBlocks();
    });
})();

// 3b) V40.2.18 — Scroll collapse por VISIBILIDADE (não mais por distância de scroll)
//
//   PROBLEMA RESOLVIDO:
//   Versão antiga (V40.1.3) fechava o card expandido após apenas 30px de scroll.
//   Isso quebrava o uso real: o usuário expandia o card pra ler microblocos / notas
//   vinculadas, deslizava o dedo só pra ajustar a posição na tela, e o card já fechava.
//
//   NOVA LÓGICA (Opção A aprovada por Jhonatan + Jules):
//   Em vez de medir "quanto rolou", medimos "o card expandido ainda está visível?".
//   Usamos getBoundingClientRect() do card e do container #timeline-scroll.
//   O card só é fechado quando sai COMPLETAMENTE do viewport visível do scroller,
//   com TOLERÂNCIA de 20px de amortecimento (evita "piscadas" quando o card está
//   bem na borda — fecharia/abriria/fecharia em micro-scrolls).
//
//   CRITÉRIOS DE FECHAMENTO (basta UM ser verdadeiro):
//   - cardRect.bottom < timelineRect.top - TOLERANCE  → saiu pra cima
//   - cardRect.top    > timelineRect.bottom + TOLERANCE → saiu pra baixo
//
//   GUARDS PRESERVADOS:
//   - isPhysicsBusy: drag/resize não dispara collapse (mantido da V40.1.3)
//   - Debounce 120ms: continua suavizando reação ao scroll
//   - Click-out (handler 3a, linhas 1003–1021): intocado, continua fechando em tap
//
//   COMPATIBILIDADE:
//   - Modo lista (filter-list-mode + search-mode): cards usam position:relative,
//     mas getBoundingClientRect() funciona igual — retorna posição real na tela.
//   - Múltiplos cards expandidos: impossível pela regra "1 por vez" da
//     toggleExpandBlock (linha 985), então o break no primeiro encontrado basta.
(function setupScrollCollapse() {
    const timeline = document.getElementById('timeline-scroll');
    if (!timeline) return;
    let scrollDebounce = null;
    const TOLERANCE = 20; // px de margem antes de considerar o card "fora da tela"

    timeline.addEventListener('scroll', () => {
        if (isPhysicsBusy) return;
        clearTimeout(scrollDebounce);
        scrollDebounce = setTimeout(() => {
            // Existe algum card expandido no db? Se não, nada a fazer.
            const expandedBlock = db.find(b => b.expanded);
            if (!expandedBlock) return;

            // Localiza o elemento DOM do card expandido
            const cardEl = timeline.querySelector(
                `.block-item[data-block-id="${expandedBlock.id}"]`
            );
            if (!cardEl) return; // card não está renderizado (ex: mudou de dia) — nada a fazer

            const cardRect = cardEl.getBoundingClientRect();
            const timelineRect = timeline.getBoundingClientRect();

            const saiuPraCima  = cardRect.bottom < timelineRect.top    - TOLERANCE;
            const saiuPraBaixo = cardRect.top    > timelineRect.bottom + TOLERANCE;

            if (saiuPraCima || saiuPraBaixo) {
                collapseAllBlocks();
            }
        }, 120);
    }, { passive: true });
})();

// --- 6. A FÍSICA MALEÁVEL ---
function enablePhysics(el, block) {
    const dragger = el.querySelector('.drag-handle');
    const resizer = el.querySelector('.resize-handle');
    
    let startY = 0, initialVal = 0, maxVal = 0;
    let pushRows = null, pushFrom = 0, pushMoved = 0; // V40.44.0: esticar desce os blocos de baixo só o necessário

    function onDragStart(e) {
        e.preventDefault(); e.stopPropagation();
        isPhysicsBusy = true; // V40.1.3: bloquear auto-retrair durante drag
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        initialVal = block.startMin;
        el.classList.add('dragging');
        
        document.addEventListener('touchmove', onDragMove, {passive: false});
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('touchcancel', onDragEnd); // V40.30.0: toque cancelado pelo sistema = nada muda
        document.addEventListener('mouseup', onDragEnd);
    }

    function onDragMove(e) {
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        // V40.24.0: com vagos ocultos a régua é por trechos (tlMin/tlY); sem eles, a conta de sempre
        let newStart = tlSegs ? tlMin(tlY(initialVal) + (y - startY)) : initialVal + Math.round(((y - startY) / PX_PER_MIN) / 5) * 5;
        newStart = Math.round(newStart / 5) * 5;
        newStart = Math.max(START_HOUR * 60, Math.min(newStart, (END_HOUR * 60) - block.duration));

        el.style.top = `${tlY(newStart)}px`;
        el.dataset.tempStart = newStart;
        subDropMark(el, block, e.touches ? e.touches[0].clientX : e.clientX, y); // V40.30.0: em cima de uma sublista?
    }

    function onDragEnd(e) {
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('touchcancel', onDragEnd);
        document.removeEventListener('mouseup', onDragEnd);

        if (el.classList.contains('dragging')) {
            el.classList.remove('dragging');
            // V40.30.0: soltou em cima de uma sublista → o bloco vira cartão dela (sublista e Descanso não entram)
            const overSub = el.dataset.overSub || null;
            subDropClear(el);
            if (e && e.type === 'touchcancel') {
                renderTimeline();
                setTimeout(() => { isPhysicsBusy = false; }, 200);
                return;
            }
            if (overSub) {
                if (!blockIntoSublist(block.id, overSub)) renderTimeline();
                setTimeout(() => { isPhysicsBusy = false; }, 200);
                return;
            }
            const newStart = parseInt(el.dataset.tempStart || block.startMin);
            
            const dailyDb = db.filter(b => b.date === getActiveDateStr());
            const hasCollision = dailyDb.some(fb => {
                if (fb.id === block.id) return false;
                return (newStart < fb.startMin + fb.duration && newStart + block.duration > fb.startMin);
            });

            if (hasCollision) {
                showToast("Conflito! A tarefa voltou.");
            } else {
                block.startMin = newStart;
                
                const isPastDay = block.date < getTodayStr();
                const isPastTimeToday = block.date === getTodayStr() && (block.startMin + block.duration) <= currentRealMins;
                if (!isPastDay && !isPastTimeToday) {
                    if (block.type === 'past') block.wasDelayed = true;
                    block.type = 'focus';
                }
            }
            saveDb();
            renderTimeline();
        }
        // V40.1.3: liberar auto-retrair após pequeno delay (ignora scroll/click residuais do dragend)
        setTimeout(() => { isPhysicsBusy = false; }, 200);
    }

    function onResizeStart(e) {
        e.preventDefault(); e.stopPropagation();
        isPhysicsBusy = true; // V40.1.3: bloquear auto-retrair durante resize
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        initialVal = block.duration;
        
        const dailyDb = db.filter(b => b.date === getActiveDateStr()).sort((a, b) => a.startMin - b.startMin);
        const nextBlock = dailyDb.find(b => b.startMin >= block.startMin + block.duration && b.id !== block.id);
        maxVal = nextBlock ? (nextBlock.startMin - block.startMin) : ((END_HOUR * 60) - block.startMin);
        maxVal = Math.floor(maxVal / 5) * 5; 
        // V40.44.0: dá pra passar do próximo bloco: os de baixo descem (até todos encostarem no fim do dia)
        const C = window.FazSyncCore;
        pushFrom = block.startMin + block.duration; pushMoved = 0;
        pushRows = C && typeof C.pushRoom === 'function' ? pushDayRows(block.date || getActiveDateStr(), block.id) : null;
        const room = pushRows ? C.pushRoom(pushRows, pushFrom, END_HOUR * 60) : null;
        if (room !== null) maxVal = Math.max(maxVal, Math.floor((room - block.startMin) / 5) * 5);
        else pushRows = null;
        
        document.addEventListener('touchmove', onResizeMove, {passive: false});
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('touchend', onResizeEnd);
        document.addEventListener('mouseup', onResizeEnd);
    }
    
    function onResizeMove(e) {
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        // V40.24.0: com vagos ocultos o fim acompanha o dedo pela régua por trechos
        let newDur = tlSegs ? tlMin(tlY(block.startMin + initialVal) + (y - startY)) - block.startMin : initialVal + Math.round(((y - startY) / PX_PER_MIN) / 5) * 5;
        newDur = Math.round(newDur / 5) * 5; 
        newDur = Math.max(5, Math.min(newDur, maxVal)); // V40.8.0: mínimo 5 min (era 15)
        
        if (newDur !== block.duration) {
            block.duration = newDur;
            el.style.height = `${tlY(block.startMin + newDur) - tlY(block.startMin) - 2}px`;
            el.querySelector('.time-label').innerHTML = `${formatClock(block.startMin)} - ${formatClock(block.startMin + newDur)} &bull; ${formatDur(newDur)}`;
            
            const microVal = el.querySelector('.micro-time-val');
            if(microVal) microVal.innerText = formatDur(newDur);
            
            if (newDur <= 25) el.classList.add('micro-block');
            else el.classList.remove('micro-block');
            el.classList.toggle('nano-block', newDur <= 10); el.classList.toggle('nano-5', newDur < 10); // V40.8.0
            pushPreview(newDur);
        }
    }
    // V40.44.0: enquanto estica, os blocos que vão descer já aparecem no lugar novo (e voltam se encolher de novo)
    function pushPreview(dur) {
        const C = window.FazSyncCore;
        const plan = pushRows && block.startMin + dur > pushFrom ? C.pushPlan(pushRows, pushFrom, block.startMin + dur, END_HOUR * 60) : null;
        const to = new Map((plan ? plan.moves : []).map(m => [m.id, m.to]));
        container.querySelectorAll('.block-item[data-block-id]').forEach(bel => {
            const id = bel.dataset.blockId;
            if (id === block.id) return;
            const b = db.find(x => x.id === id && x.date === block.date);
            if (!b) return;
            const st = to.has(id) ? to.get(id) : b.startMin;
            bel.style.top = `${tlY(st) + 1}px`;
            bel.classList.toggle('tl-pushed', to.has(id));
            const tl = bel.querySelector('.time-label'); // o horário novo (o de antes volta se encolher)
            if (tl) {
                if (tl.dataset.orig == null) tl.dataset.orig = tl.innerHTML;
                tl.innerHTML = to.has(id) ? `${formatClock(st)} - ${formatClock(st + b.duration)} &bull; ${formatDur(b.duration)}` : tl.dataset.orig;
            }
        });
        pushMoved = to.size;
        const lbl = el.querySelector('.time-label'), mv = el.querySelector('.micro-time-val');
        if (lbl) lbl.innerHTML = `${formatClock(block.startMin)} - ${formatClock(block.startMin + dur)} &bull; ${formatDur(dur)}${pushMoved ? ` <span class="tl-push-n">· ${pushN(pushMoved)}</span>` : ''}`;
        if (mv) mv.textContent = formatDur(dur) + (pushMoved ? ' · ' + pushN(pushMoved) : ''); // bloco pequeno: a duração fica ao lado do nome
    }

    function onResizeEnd() {
        document.removeEventListener('touchmove', onResizeMove);
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('touchend', onResizeEnd);
        document.removeEventListener('mouseup', onResizeEnd);
        block.expanded = false; 
        // V40.44.0: os de baixo descem só o necessário (o plano de novo, com a duração final)
        let moved = 0;
        if (pushRows && block.startMin + block.duration > pushFrom) {
            const plan = window.FazSyncCore.pushPlan(pushRows, pushFrom, block.startMin + block.duration, END_HOUR * 60);
            if (plan) moved = pushApply(block.date || getActiveDateStr(), plan);
            else { block.duration = initialVal; showToast('Não cabe: os de baixo passariam do fim do dia.'); }
        }
        pushRows = null;
        saveDb();
        if (moved) undoNameStep('Duração ' + formatDur(block.duration) + ' · ' + pushWord(moved));
        renderTimeline(); 
        // V40.1.3: liberar auto-retrair após pequeno delay
        setTimeout(() => { isPhysicsBusy = false; }, 200);
    }

    dragger.addEventListener('touchstart', onDragStart, {passive: false});
    dragger.addEventListener('mousedown', onDragStart);
    resizer.addEventListener('touchstart', onResizeStart, {passive: false});
    resizer.addEventListener('mousedown', onResizeStart);
}

// --- 7. CAPTURA E BANCO DE TAREFAS ---
const fab = document.getElementById('fab-btn'), 
      sheet = document.getElementById('bottom-sheet'), 
      listSheet = document.getElementById('list-sheet'), 
      overlay = document.getElementById('overlay'), 
      input = document.getElementById('task-input'),
      backlogInput = document.getElementById('backlog-input'),
      listBtn = document.getElementById('list-btn');

function syncDurButtons(mins) {
    document.querySelectorAll('.sheet-dur-btn').forEach(b => {
        b.className = 'sheet-dur-btn px-4 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm whitespace-nowrap hover:bg-zinc-50 transition';
        if(parseInt(b.dataset.time) === mins) b.className = 'sheet-dur-btn px-4 py-2 rounded-full bg-app-focus border border-transparent text-white text-sm font-medium whitespace-nowrap shadow-[0_0_15px_rgba(0,0,0,0.15)] transition';
    });
    document.querySelectorAll('.float-dur-btn').forEach(b => {
        b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-xs font-bold transition';
        if(parseInt(b.dataset.time) === mins) b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-app-focus text-white text-xs font-bold shadow-[0_0_10px_rgba(0,0,0,0.2)] transition';
    });
}

function syncBacklogDurButtons(mins) {
    document.querySelectorAll('.backlog-dur-btn').forEach(b => {
        b.className = 'backlog-dur-btn px-4 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm whitespace-nowrap hover:bg-zinc-100 transition';
        if(parseInt(b.dataset.time) === mins) b.className = 'backlog-dur-btn px-4 py-2 rounded-full bg-app-focus border border-app-focus text-white text-sm font-medium whitespace-nowrap shadow-md transition';
    });
}

document.querySelectorAll('.sheet-dur-btn').forEach(btn => btn.onclick = (e) => {
    selectedDur = parseInt(e.target.dataset.time);
    syncDurButtons(selectedDur);
});

document.querySelectorAll('.backlog-dur-btn').forEach(btn => btn.onclick = (e) => {
    backlogSelectedDur = parseInt(e.target.dataset.time);
    syncBacklogDurButtons(backlogSelectedDur);
});

window.changeFloatDuration = function(mins) {
    if (pendingIntent) {
        pendingIntent.duration = mins;
        selectedDur = mins;
        syncDurButtons(mins);
        renderTimeline(); 
    }
}

window.openSheet = () => {
    if (sheetSlot) { sheetSlot = null; tlSlotLabel(); } // V40.24.0: o + aberto pelo botão não mira vago nenhum (openSheetAt marca depois)
    clearFilters();
    document.getElementById('config-sheet').classList.add('translate-y-full');
    document.getElementById('period-select-sheet').classList.add('translate-y-full');
    
    selectedTagId = null;
    renderTagSelector();
    selectedGoalId = null; // V40.34.0
    goalPickFill('goal-pick-new-wrap', 'goal-pick-new', null, 'selectNewGoal');
    goalNamePlaceholder('task-input', null, 'Nome da tarefa'); // V40.36.1

    overlay.classList.remove('opacity-0', 'pointer-events-none');
    sheet.classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7: captura botão voltar
    
    // V40.1.4: foco automático no input após animação do sheet (350ms)
    setTimeout(() => {
        if (sheet.classList.contains('translate-y-full')) return; // V40.34.0: fechou antes dos 350 ms: não foca o campo escondido (segurava a sincronização)
        const taskInput = document.getElementById('task-input');
        if (taskInput) taskInput.focus();
    }, 350);
}

window.openListSheet = () => {
    clearFilters();
    switchListTab('backlog');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    listSheet.classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7: captura botão voltar
}

// =====================================================
// V40.27.0 — BOTÃO VOLTAR DO CELULAR
// =====================================================
// Pedido do Jhonatan (17/11/2026): "quando aperta em voltar no app ele está fechando; vamos colocar pra voltar a
// tela e, se tiver na inicial, pedir se quer fechar". Ele escolheu o aviso "Toque em voltar de novo pra sair".
// O voltar volta UMA tela: fecha a janelinha de cima; sai do formulário ou da sub-tela pra tela de trás; fecha a
// tela; fecha o menu do zoom das Listas; solta a tarefa na mão; fecha a busca; e, se o dia foi aberto tocando num
// bloco (ou no nome do dia) com 2 ou 3 dias na tela, volta pros dias lado a lado. Na tela inicial (a agenda sem nada
// aberto) mostra "Toque em voltar de novo pra sair": o 2º voltar em até 3 s fecha o app; passado esse tempo, ou
// tocando na tela, o voltar volta a perguntar.
//
// Qual é a tela de cima sai do próprio HTML, na hora (não há lista de telas pra manter em dia):
//   1. janelinhas abertas: [id$="-modal"] sem .hidden (a última no HTML fica por cima);
//   2. telas abertas: [id$="-sheet"] sem .translate-y-full (idem); dentro dela, o menu do zoom aberto;
//   3. a faixa da tarefa na mão (#floating-task) e a busca (#search-bar-row);
//   4. a volta pros dias lado a lado (tlBack, V40.26.0).
// E o voltar TOCA no botão de voltar/fechar que essa tela mostra, marcado com data-voltar no index.html (a seta de
// sub-tela ganha do X da tela, que é data-voltar="fechar"). Assim ele faz exatamente o que o toque faz, com a mesma
// limpeza. A versão da V40.5.0-fix7 fechava as coisas por conta própria e não conhecia as sub-telas da Config (a tela
// ficava fosca, e a fix11 desligou); também achava "janelinha aberta" pela classe z-[60], que hoje os botões dos
// blocos e dos cartões também têm.
// REGRA pra tela ou janelinha nova: o botão de voltar/fechar dela leva data-voltar (o X da tela, data-voltar="fechar").
// O tests/test_voltar.js reprova janelinha ou tela sem ele.
//
// Como o app fica sabendo do voltar: pelo CloseWatcher (Chrome 120+; no Android é o voltar, no computador é o Esc).
// Fica um só armado; cada voltar consome o que está armado e o app arma outro. Sem CloseWatcher (outro navegador
// no Android): uma entrada a mais no histórico, que o voltar consome (popstate) e o app põe de novo.
// (var, não let/const: pushNavState() pode ser chamada antes desta linha rodar, e aí só não faz nada)
var NAV_SAIR_MS = 3000;
var navAndroid = /Android/i.test(navigator.userAgent || '');
var navCW = typeof window.CloseWatcher === 'function';
var navHist = !navCW && navAndroid && !!(window.history && history.pushState);
var navW = null;   // o CloseWatcher armado
var navSairT = 0;  // esperando o 2º voltar na tela inicial: nada armado (o próximo voltar é do celular e fecha o app)

// O elemento aparece? (sobe até 'stop' procurando .hidden ou display:none; funciona sem layout, como no jsdom)
function navShown(el, stop) {
    for (let n = el; n && n !== stop; n = n.parentElement) {
        if (n.classList.contains('hidden') || n.style.display === 'none') return false;
    }
    return true;
}
function navOpenModals() { return [...document.querySelectorAll('[id$="-modal"]')].filter(m => !m.classList.contains('hidden')); }
function navOpenSheets() { return [...document.querySelectorAll('[id$="-sheet"]')].filter(s => !s.classList.contains('translate-y-full')); }
// O botão que o voltar toca: o de sub-tela (seta ←, Cancelar) antes do X da tela.
function navButton(layer) {
    const bs = [...layer.querySelectorAll('[data-voltar]')].filter(b => navShown(b, layer));
    return bs.find(b => b.dataset.voltar !== 'fechar') || bs[0] || null;
}
// A tela de cima (o que o voltar fecha). null = tela inicial.
function navTop() {
    const m = navOpenModals();
    if (m.length) return { kind: 'modal', el: m[m.length - 1] };
    const s = navOpenSheets();
    if (s.length) {
        const top = s[s.length - 1], menu = top.querySelector('.zoom-menu:not(.hidden)');
        return menu ? { kind: 'menu', el: menu } : { kind: 'sheet', el: top };
    }
    const ft = document.getElementById('floating-task');
    if (pendingIntent || (ft && !ft.classList.contains('hidden'))) return { kind: 'hand', el: ft };
    const sr = document.getElementById('search-bar-row');
    if (sr && !sr.classList.contains('hidden')) return { kind: 'search', el: sr };
    if (tlBack && tlDays === 1) return { kind: 'days' };
    return null;
}
// Volta uma tela. false = já estava na tela inicial.
function navBack() {
    const top = navTop();
    if (!top) return false;
    if (top.kind === 'days') { tlBackToDays(); return true; }
    if (top.kind === 'menu') { closeBacklogZoomMenu(); return true; }
    const b = navButton(top.el);
    if (b) b.click();
    else if (top.kind === 'modal') closeTopmostModal();
    else if (top.kind === 'sheet') closeAllSheets();
    else if (top.kind === 'hand') cancelPendingTask();
    else closeSearchBar();
    return true;
}

// Janelinha de cima (ou null). V40.27.0: pelo id (-modal); a classe z-[60] também está nos botões dos blocos e dos
// cartões, e a versão antiga "fechava" esses botões em vez da janelinha.
function getOpenModal() { const m = navOpenModals(); return m.length ? m[m.length - 1] : null; }
// Esconde a janelinha de cima sem passar pelo botão dela (só pra janelinha sem botão data-voltar).
function closeTopmostModal() {
    const modal = getOpenModal();
    if (!modal) return false;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    const ov = document.getElementById('overlay'), sheetOpen = navOpenSheets().length > 0;
    if (ov) {
        if (getOpenModal()) ov.style.zIndex = sheetOpen ? '55' : '';
        else if (sheetOpen) ov.style.zIndex = ''; // V40.27.0: o fundo escuro volta pra trás da tela (com '55' a tela ficava fosca)
        else { ov.classList.add('opacity-0', 'pointer-events-none'); ov.style.zIndex = ''; }
    }
    return true;
}
// Toque no fundo escuro. Sem janelinha: fecha as telas. Com janelinha (V40.27.0): o mesmo que o Cancelar dela; mas a
// janelinha com campo de digitar fica (tocar fora às vezes é só pra baixar o teclado, e o que foi digitado se perderia;
// ela fecha pelo Cancelar ou pelo voltar). Antes da V40.27.0 o toque não fechava janelinha nenhuma: procurava pela
// classe z-[60] e escondia os botões de um bloco ou cartão.
window.onOverlayClick = function() {
    const m = getOpenModal();
    if (m) {
        if (m.querySelector('input:not([type="hidden"]), textarea')) return;
        const b = navButton(m);
        if (b) b.click(); else closeTopmostModal();
        return;
    }
    closeAllSheets();
};

function navArm() {
    if (navSairT) return;
    if (navCW) {
        if (navW) return;
        try { navW = new CloseWatcher(); navW.onclose = navOnBack; } catch (e) { navW = null; }
    } else if (navHist) {
        try { if (!(history.state && history.state.fazVoltar)) history.pushState({ fazVoltar: 1 }, ''); } catch (e) {}
    }
}
// Apertou o voltar (ou o Esc no computador).
function navOnBack() {
    navW = null;
    if (navBack()) { setTimeout(navArm, 0); return; }
    if (!navAndroid) { setTimeout(navArm, 0); return; } // computador: na agenda o Esc não tem o que fechar
    showToast('Toque em voltar de novo pra sair');
    navSairT = setTimeout(() => { navSairT = 0; navArm(); }, NAV_SAIR_MS);
}
// Desiste de esperar o 2º voltar (o voltar volta a perguntar) e garante o voltar armado.
function navWake() {
    if (navSairT) { clearTimeout(navSairT); navSairT = 0; }
    navArm();
}
// Toque de verdade na tela (o .click() do próprio voltar não conta).
function navTouch(e) { if (!e || e.isTrusted !== false) navWake(); }
document.addEventListener('pointerup', navTouch, true);
document.addEventListener('click', navTouch, true);
window.addEventListener('popstate', (e) => {
    if (!navHist || (e.state && e.state.fazVoltar)) return;
    navOnBack();
});
// As chamadas da V40.5.0-fix7 ao abrir uma tela agora só garantem o voltar armado.
function pushNavState() { navWake(); }
// Com CloseWatcher, o primeiro fica armado desde a abertura. Pelo histórico, só depois do 1º toque (entrada posta
// sem toque o Chrome pula no voltar).
if (navCW) navArm();

window.closeAllSheets = () => {
    overlay.classList.add('opacity-0', 'pointer-events-none');
    // V40.3.5-fix: reseta zIndex inline (caso requestDeleteBacklog/Routine tenha setado pra '55')
    // pra não vazar pro próximo uso do overlay com outras sheets.
    overlay.style.zIndex = '';
    sheet.classList.add('translate-y-full');
    listSheet.classList.add('translate-y-full');
    document.getElementById('config-sheet').classList.add('translate-y-full');
    document.getElementById('period-select-sheet').classList.add('translate-y-full');
    document.getElementById('clone-sheet').classList.add('translate-y-full');
    document.getElementById('clone-qtd-modal').classList.add('hidden');
    document.getElementById('clone-qtd-modal').classList.remove('flex');
    document.getElementById('tags-sheet').classList.add('translate-y-full');
    document.getElementById('reports-sheet').classList.add('translate-y-full');
    // V40.2: fechar sheets de vincular notas
    const linkSheet = document.getElementById('link-note-sheet');
    if (linkSheet) linkSheet.classList.add('translate-y-full');
    const linkedView = document.getElementById('linked-note-view-modal');
    if (linkedView) { linkedView.classList.add('hidden'); linkedView.classList.remove('flex'); }
    activeLinkBlockId = null;
    viewingLinkedNoteId = null;
    viewingLinkedFromBlockId = null;
    pendingLinkBlockId = null; // V40.2.1
    
    // V40.2.2: fechar modal de pensamento do dia
    const thoughtModal = document.getElementById('thought-modal');
    if (thoughtModal) { thoughtModal.classList.add('hidden'); thoughtModal.classList.remove('flex'); }
    
    cancelEdit();
    cancelDelete();
    cancelTimePicker();
    // V40.3.5-fix: defesa em profundidade — fecha modais novos de delete se ainda estiverem abertos.
    if (typeof cancelDeleteRoutine === 'function') cancelDeleteRoutine();
    if (typeof cancelDeleteBacklog === 'function') cancelDeleteBacklog();
    if (typeof cancelDeleteFinancial === 'function') cancelDeleteFinancial();
    // V40.5.0: fecha modais do kanban também
    if (typeof cancelDeleteColumn === 'function') cancelDeleteColumn();
    if (typeof cancelColumnName === 'function') cancelColumnName();
    if (typeof closeColumnMenu === 'function') closeColumnMenu();
    // V40.5.1: fecha modal de mover card
    if (typeof cancelMoveCard === 'function') cancelMoveCard();
    // V40.24.0: cartão da sublista; o + mirando um vago oculto esquece o vago
    if (typeof closeSubCard === 'function') closeSubCard(true);
    if (sheetSlot) { sheetSlot = null; tlSlotLabel(); }

    input.blur();
    backlogInput.blur();
    if(!pendingIntent) {
        fab.style.transform = 'scale(1)';
        if(listBtn) listBtn.style.transform = 'scale(1)';
    }
}

window.closeSheet = window.closeAllSheets;

window.commitIntent = () => {
    const g = goalById(goalKeep(selectedGoalId));
    const title = input.value.trim() || (g ? String(g.title || '').trim() : ''); // V40.36.1: com meta escolhida, o nome pode ficar vazio (vale o da meta)
    if (!title) return;
    const slot = tlTakeSlot(); // V40.24.0: veio de uma faixa de vago oculto
    
    pendingIntent = { title: title, duration: selectedDur, theme: 'focus', tagId: selectedTagId, ...(goalKeep(selectedGoalId) ? { goalId: selectedGoalId } : {}) }; // V40.34.0: + meta
    input.value = '';
    closeAllSheets();
    
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    renderTimeline(); 
    tlPlaceAt(slot);
};

// V40.24.0: chip "Sublista" do botão +: a sublista vai pra mão (nome digitado ou "Sublista") e entra num Tempo Livre.
window.commitSublistIntent = () => {
    const slot = tlTakeSlot();
    const title = input.value.trim() || 'Sublista';
    pendingIntent = { title: title, duration: selectedDur, theme: 'focus', tagId: selectedTagId, cards: [] };
    input.value = '';
    closeAllSheets();
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    renderTimeline();
    if (slot) tlPlaceAt(slot);
    else showToast('Toque num Tempo Livre pra colocar a sublista 👇');
};

window.commitSpecialIntent = (title, theme) => {
    const slot = tlTakeSlot(); // V40.24.0
    pendingIntent = { title: title, duration: selectedDur, theme: theme, tagId: selectedTagId };
    input.value = '';
    closeAllSheets();
    
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    renderTimeline(); 
    tlPlaceAt(slot);
};

// --- LÓGICA DE PERÍODOS E HORÁRIOS GERAIS ---
window.openPeriodSelectSheet = () => {
    sheet.classList.add('translate-y-full'); 
    renderPeriodSelect();
    document.getElementById('period-select-sheet').classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7
}

window.openConfigSheet = () => {
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    sheet.classList.add('translate-y-full'); 
    
    document.getElementById('config-periods-view').classList.add('hidden');
    document.getElementById('config-hours-view').classList.add('hidden');
    document.getElementById('config-appearance-view').classList.add('hidden');
    document.getElementById('config-backup-view').classList.add('hidden'); // V40.6.0: nova sub-view Backup
    document.getElementById('config-sync-view').classList.add('hidden'); // V40.7.0: nova sub-view Sincronizar
    document.getElementById('config-archive-view').classList.add('hidden'); // V40.9.0: nova sub-view Arquivados
    document.getElementById('config-avisos-view').classList.add('hidden'); // V40.42.0: nova sub-view Avisos
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
    avisosMenuStatus(); // V40.42.0

    document.getElementById('config-sheet').classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7
}

window.openConfigHours = () => {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-hours-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Janela de Horário';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigHours()');
    
    document.getElementById('config-hour-start').value = START_HOUR;
    document.getElementById('config-hour-end').value = END_HOUR;
}

window.closeConfigHours = () => {
    document.getElementById('config-hours-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
}

window.saveConfigHours = () => {
    const start = parseInt(document.getElementById('config-hour-start').value);
    const end = parseInt(document.getElementById('config-hour-end').value);
    
    if (start >= end) {
        showToast("Erro: Início deve ser antes do fim!");
        return;
    }

    if (start !== START_HOUR || end !== END_HOUR) fazPrefsTouch(); // V40.32.0: vai pro PC
    START_HOUR = start;
    END_HOUR = end;
    TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
    
    localStorage.setItem('tb_start_hour', START_HOUR);
    localStorage.setItem('tb_end_hour', END_HOUR);
    
    renderGrid();
    renderTimeline();
    closeConfigHours();
    showToast("Horários Atualizados!");
}

window.openConfigPeriods = () => {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-periods-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Períodos';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigPeriods()');
    renderConfigPeriods();
}

window.closeConfigPeriods = () => {
    document.getElementById('config-periods-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
}

// ============================================================================
// V40.6.0 — BACKUP & RESTAURAÇÃO (Fase 1 do roadmap: Export/Import)
// ----------------------------------------------------------------------------
// Exporta TODAS as chaves de dados (tb_*, exceto internas tb__*) num arquivo JSON.
//   Mobile: Web Share API → manda o arquivo pro Drive / email / WhatsApp / etc.
//   Fallback (desktop ou sem suporte): download normal do arquivo.
// Importa: valida assinatura → confirma → salva ROLLBACK do estado atual →
//   substitui os dados → recarrega a página (garante que todas as variáveis em
//   memória releiam do localStorage). "Desfazer" reverte 1 nível.
// DADOS SÃO SAGRADOS: nunca sobrescreve sem confirmação + cópia de segurança.
// Round-trip usa strings CRUAS (100% fiel, zero risco de corromper tipos).
// ============================================================================

const FAZ_BACKUP_SIGNATURE = 'faz-timeblock-backup';
const FAZ_ROLLBACK_KEY = 'tb__rollback'; // interna: dupla underline (tb__) → nunca exportada nem limpa

// Só chaves de dados reais (tb_algo). Ignora internas (tb__algo) e não-tb.
function isFazDataKey(k) {
    return typeof k === 'string' && k.indexOf('tb_') === 0 && k.indexOf('tb__') !== 0;
}

// Coleta { chave: valorStringCru } de todas as chaves de dados.
function collectFazData() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (isFazDataKey(k)) out[k] = localStorage.getItem(k);
    }
    return out;
}

// Contagem leve pra dar confiança ao usuário (quantos itens tem em cada coisa).
function fazDataSummary(dataObj) {
    const countArr = (key) => {
        try { const v = JSON.parse(dataObj[key] || '[]'); return Array.isArray(v) ? v.length : 0; }
        catch (e) { return 0; }
    };
    return {
        tarefas: countArr('tb_backlog_db'),
        blocos: countArr('tb_master_db'),
        rotinas: countArr('tb_routines_db'),
        notas: countArr('tb_notes_db'),
        despesas: countArr('tb_financial_db'),
        tags: countArr('tb_tags_db'),
        metas: countArr('tb_goals_db'), // V40.21.0
    };
}

function fazTimestampLabel() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Atualiza o textinho de resumo dentro da tela de Backup.
window.renderBackupSummary = function() {
    const el = document.getElementById('backup-summary');
    if (!el) return;
    const s = fazDataSummary(collectFazData());
    el.innerHTML =
        `<b>${s.tarefas}</b> tarefas · <b>${s.despesas}</b> despesas · ` +
        `<b>${s.rotinas}</b> rotinas · <b>${s.notas}</b> notas · ` +
        `<b>${s.blocos}</b> blocos · <b>${s.tags}</b> tags · <b>${s.metas}</b> metas`;
};

window.openConfigBackup = function() {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-backup-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Backup e Restauração';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigBackup()');
    renderBackupSummary();
};

window.closeConfigBackup = function() {
    document.getElementById('config-backup-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
};

// ----- EXPORTAR (salvar backup) -----
window.exportFazBackup = async function() {
    let payload;
    try {
        const data = collectFazData();
        payload = JSON.stringify({
            signature: FAZ_BACKUP_SIGNATURE,
            app: 'Faz / TimeBlock',
            version: 'v40.45.0',
            exportedAt: new Date().toISOString(),
            summary: fazDataSummary(data),
            data: data
        }, null, 2);
    } catch (e) {
        showToast('Erro ao gerar o backup 😕');
        return;
    }

    const filename = `faz-backup-${fazTimestampLabel()}.json`;
    const blob = new Blob([payload], { type: 'application/json' });

    // Mobile: tenta compartilhar o ARQUIVO (Drive, email, WhatsApp Salvo...).
    try {
        if (navigator.canShare) {
            const file = new File([blob], filename, { type: 'application/json' });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Backup do Faz',
                    text: 'Guarde este arquivo em local seguro (Google Drive, email...).'
                });
                showToast('Backup enviado! ✅');
                return;
            }
        }
    } catch (e) {
        if (e && e.name === 'AbortError') return; // usuário cancelou o compartilhamento de propósito
        // qualquer outro erro no share → cai no download abaixo
    }

    // Fallback universal: download do arquivo.
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
        showToast('Backup baixado! ✅');
    } catch (e) {
        showToast('Não consegui salvar o arquivo 😕');
    }
};

// ----- IMPORTAR (restaurar backup) -----
// Botão "Restaurar" → abre o seletor de arquivo (input escondido).
window.triggerFazImport = function() {
    const input = document.getElementById('backup-import-input');
    if (input) { input.value = ''; input.click(); } // zera value pra permitir reimportar o mesmo arquivo
};

// onchange do input de arquivo.
window.handleFazImportFile = function(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        let parsed;
        try { parsed = JSON.parse(ev.target.result); }
        catch (e) { showToast('Arquivo inválido (não é um backup) 😕'); return; }
        applyFazImport(parsed);
    };
    reader.onerror = function() { showToast('Erro ao ler o arquivo 😕'); };
    reader.readAsText(file);
};

// V40.8.0: campos estruturais (ids, cores, datas, horários, números) entram em atributos e
// handlers do HTML. Um backup só é aceito se todos estiverem no formato esperado.
function fazBackupLooksSafe(incoming) {
    const ID = /^[\w.\-]{1,64}$/, HEX = /^#[0-9a-fA-F]{3,8}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, MONTH = /^\d{4}-\d{2}$/, TIME = /^\d{1,2}:\d{2}$/, NUMSTR = /^-?\d+(\.\d+)?$/;
    const NUM = { startMin: 1, duration: 1, amount: 1, dueDay: 1, durationMonths: 1, createdAt: 1, target: 1, step: 1 }; // V40.21.0: + alvo e passo das metas
    const isNum = (v) => (typeof v === 'number' && isFinite(v)) || (typeof v === 'string' && NUMSTR.test(v));
    const okVal = (k, v) => {
        if (v === null || v === undefined) return true;
        if (k === 'id' || /Id$/.test(k)) return typeof v === 'string' && ID.test(v);
        if (/Ids$/.test(k) || k === 'paidMonths') return Array.isArray(v) && v.every(x => typeof x === 'string' && ID.test(x));
        if (k === 'color') return typeof v === 'string' && HEX.test(v);
        if (k === 'date') return typeof v === 'string' && DATE.test(v);
        if (k === 'startMonth') return typeof v === 'string' && MONTH.test(v);
        if (k === 'start' || k === 'end') return isNum(v) || (typeof v === 'string' && TIME.test(v));
        if (NUM[k]) return isNum(v);
        return true;
    };
    const walk = (v, depth) => {
        if (depth > 6) return true;
        if (Array.isArray(v)) return v.every(x => walk(x, depth + 1));
        if (v && typeof v === 'object') return Object.keys(v).every(k => okVal(k, v[k]) && walk(v[k], depth + 1));
        return true;
    };
    const LISTS = ['tb_master_db', 'tb_backlog_db', 'tb_backlog_columns', 'tb_tags_db', 'tb_periods_db', 'tb_notes_db', 'tb_routines_db', 'tb_financial_db', 'tb_archive_db', 'tb_goal_lists', 'tb_goals_db', 'tb_goal_days'];
    for (const key of LISTS) {
        if (!(key in incoming)) continue;
        let v;
        try { v = JSON.parse(incoming[key]); } catch (e) { return false; }
        if (v !== null && !Array.isArray(v)) return false;
        if (v && !walk(v, 0)) return false;
    }
    return true;
}

function applyFazImport(parsed) {
    // Valida assinatura + estrutura.
    if (!parsed || parsed.signature !== FAZ_BACKUP_SIGNATURE || typeof parsed.data !== 'object' || parsed.data === null) {
        showToast('Isso não parece um backup do Faz 😕');
        return;
    }

    // Aceita só chaves de dados válidas (strings).
    const incoming = {};
    let count = 0;
    for (const k in parsed.data) {
        if (isFazDataKey(k) && typeof parsed.data[k] === 'string') { incoming[k] = parsed.data[k]; count++; }
    }
    if (count === 0) { showToast('Backup vazio ou sem dados reconhecidos 🤔'); return; }
    if (!fazBackupLooksSafe(incoming)) { showToast('Backup com dados inválidos. Nada foi alterado 😕'); return; }

    const s = parsed.summary || fazDataSummary(incoming);
    const quando = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('pt-BR') : 'data desconhecida';
    const ok = confirm(
        '⚠️ RESTAURAR BACKUP\n\n' +
        'Backup de: ' + quando + '\n' +
        'Contém: ' + (s.tarefas || 0) + ' tarefas, ' + (s.despesas || 0) + ' despesas, ' +
        (s.rotinas || 0) + ' rotinas, ' + (s.notas || 0) + ' notas' + (s.metas ? ', ' + s.metas + ' metas' : '') + '.\n\n' +
        'Isso vai SUBSTITUIR todos os dados atuais deste aparelho pelos do backup.\n' +
        'Os dados atuais serão guardados pra você poder desfazer (1 nível).\n\n' +
        'Continuar?'
    );
    if (!ok) return;

    // 1) Snapshot de ROLLBACK do estado atual (dados são sagrados).
    try {
        localStorage.setItem(FAZ_ROLLBACK_KEY, JSON.stringify({
            signature: FAZ_BACKUP_SIGNATURE,
            savedAt: new Date().toISOString(),
            data: collectFazData()
        }));
    } catch (e) {
        const proceed = confirm('Não consegui salvar a cópia de segurança do estado atual (memória cheia?).\n\nQuer continuar a restauração MESMO ASSIM? (não haverá opção de desfazer)');
        if (!proceed) return;
    }

    // 2) Limpa chaves de dados atuais (tb_ mas não tb__) e grava as do backup.
    try {
        const prefsBefore = fazPrefsKeys(), periodsBefore = fazPeriodsRaw();
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (isFazDataKey(k)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        for (const k in incoming) { localStorage.setItem(k, incoming[k]); }
        fazPrefsStampIfChanged(prefsBefore); // V40.32.0: a cor e o horário do backup valem também no PC
        fazPeriodsStampIfChanged(periodsBefore); // V40.41.0: e os períodos
    } catch (e) {
        showToast('Erro ao gravar 😕 Revertendo...');
        try {
            const rb = JSON.parse(localStorage.getItem(FAZ_ROLLBACK_KEY) || 'null');
            if (rb && rb.data) { for (const k in rb.data) localStorage.setItem(k, rb.data[k]); }
        } catch (e2) {}
        return;
    }

    // 3) Reload — garante que TODAS as variáveis em memória releiam do localStorage.
    showToast('Backup restaurado! Recarregando... ✅');
    setTimeout(() => location.reload(), 900);
}

// ----- DESFAZER última restauração (rollback 1 nível) -----
window.undoFazImport = function() {
    let rb;
    try { rb = JSON.parse(localStorage.getItem(FAZ_ROLLBACK_KEY) || 'null'); }
    catch (e) { rb = null; }

    if (!rb || !rb.data) { showToast('Não há restauração pra desfazer 🤔'); return; }

    const quando = rb.savedAt ? new Date(rb.savedAt).toLocaleString('pt-BR') : '';
    if (!confirm('Desfazer a última restauração e voltar ao estado de ' + quando + '?')) return;

    try {
        const prefsBefore = fazPrefsKeys(), periodsBefore = fazPeriodsRaw();
        const toRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (isFazDataKey(k)) toRemove.push(k);
        }
        toRemove.forEach(k => localStorage.removeItem(k));
        for (const k in rb.data) { localStorage.setItem(k, rb.data[k]); }
        fazPrefsStampIfChanged(prefsBefore); // V40.32.0
        fazPeriodsStampIfChanged(periodsBefore); // V40.41.0
        localStorage.removeItem(FAZ_ROLLBACK_KEY);
        showToast('Estado anterior restaurado! Recarregando... ✅');
        setTimeout(() => location.reload(), 900);
    } catch (e) {
        showToast('Erro ao desfazer 😕');
    }
};

function timeToMins(timeStr) {
    if(!timeStr) return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

window.commitPeriodBlock = (periodId) => {
    const period = periodsDb.find(p => p.id === periodId);
    if(!period) return;
    
    const startMins = timeToMins(period.start);
    let endMins = timeToMins(period.end);
    if (endMins <= startMins) endMins += 24 * 60; 
    
    const title = input.value.trim() || period.name;
    
    const hasCollision = db.some(fb => fb.date === getActiveDateStr() && (startMins < fb.startMin + fb.duration && endMins > fb.startMin));
    if (hasCollision) {
        showToast("Conflito! O período se sobrepõe a outra tarefa.");
        return;
    }
    
    db.push({ 
        id: 'f_' + Date.now(), 
        type: 'focus', 
        title: title, 
        startMin: startMins, 
        duration: endMins - startMins,
        date: getActiveDateStr(),
        microblocks: [],
        completed: false,
        theme: 'focus',
        linkedNoteIds: [], // V40.2
        ...(goalKeep(selectedGoalId) ? { goalId: selectedGoalId } : {}) // V40.34.0: a meta escolhida no + vale também pro período
    });
    saveDb();
    input.value = '';
    closeAllSheets();
    renderTimeline(); 
    showToast(`${period.name} Agendado!`);
};

function renderPeriodSelect() {
    const container = document.getElementById('period-select-container');
    if (!periodsDb.length) { container.innerHTML = '<p class="text-sm text-zinc-400 text-center mt-8 px-4">Nenhum período. Crie em Configurações → Períodos de Tempo.</p>'; return; } // V40.41.0
    container.innerHTML = periodsDb.map(p => `
        <button onclick="commitPeriodBlock('${p.id}')" class="w-full flex items-center justify-between p-4 mb-2 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-app-focus hover:text-white transition text-left group">
            <span class="font-bold text-zinc-800 group-hover:text-white">${escapeHtml(p.name)}</span>
            <span class="text-[11px] font-bold text-zinc-500 bg-white border border-zinc-200 px-2 py-1 rounded group-hover:text-zinc-800">${p.start} às ${p.end}</span>
        </button>
    `).join('');
}

function renderConfigPeriods() {
    const container = document.getElementById('config-periods-list');
    if (!periodsDb.length) { container.innerHTML = '<p class="text-[13px] text-zinc-400 text-center py-2">Nenhum período. Crie um aqui em cima.</p>'; return; } // V40.41.0
    container.innerHTML = periodsDb.map(p => `
        <div class="flex items-center justify-between bg-white border border-zinc-200 p-3 rounded-xl shadow-sm">
            <div class="flex flex-col">
                <span class="text-sm font-bold text-zinc-800">${escapeHtml(p.name)}</span>
                <span class="text-[11px] font-bold text-zinc-500 flex items-center gap-1"><i class="ph ph-clock"></i> ${p.start} - ${p.end}</span>
            </div>
            <button onclick="deleteConfigPeriod('${p.id}')" class="w-8 h-8 flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition" title="Excluir">
                <i class="ph ph-trash text-lg"></i>
            </button>
        </div>
    `).join('');
}

window.addConfigPeriod = () => {
    const name = document.getElementById('config-period-name').value.trim();
    const start = document.getElementById('config-period-start').value;
    const end = document.getElementById('config-period-end').value;
    
    if(!name || !start || !end) {
        showToast("Preencha o nome e os horários!");
        return;
    }
    if (periodsDb.length >= 30) { showToast('Até 30 períodos.'); return; } // V40.41.0: o mesmo limite da nuvem (vão na conta)

    periodsDb.push({ id: 'p_' + Date.now(), name: name.slice(0, 60), start, end });
    savePeriods();
    
    document.getElementById('config-period-name').value = '';
    document.getElementById('config-period-start').value = '';
    document.getElementById('config-period-end').value = '';
    
    renderConfigPeriods();
    showToast("Período Salvo!");
}

window.deleteConfigPeriod = (id) => {
    periodsDb = periodsDb.filter(p => p.id !== id);
    savePeriods();
    renderConfigPeriods();
}

// V40.3.4: addBacklogItem agora é deprecated — só mantido pra compatibilidade do listener de Enter.
// O fluxo real de criação passa pela função saveBacklogForm() que vem do form.
window.addBacklogItem = () => {
    // V40.3.4: o Enter no input agora dispara saveBacklogForm (form completo) em vez do antigo "salvar inline".
    if (typeof window.saveBacklogForm === 'function') {
        window.saveBacklogForm();
        return;
    }
    // Fallback caso saveBacklogForm não exista (não deve acontecer)
    const title = backlogInput.value.trim();
    if(!title) return;
    backlogDb.push({
        id: 'bl_' + Date.now(),
        title: title,
        duration: backlogSelectedDur,
        columnId: activeColumnId || 'col_geral'  // V40.5.0
    });
    saveBacklog();
    backlogInput.value = '';
    renderBacklog();
};

window.deleteBacklogItem = (id) => {
    backlogDb = backlogDb.filter(i => i.id !== id);
    saveBacklog();
    renderBacklog();
};

window.scheduleBacklogItem = (id) => {
    const item = backlogDb.find(i => i.id === id);
    if(!item) return;
    
    // V40.5.0-fix8: ANTES — backlogDb.filter() apagava IMEDIATAMENTE. Se user cancelasse
    // o agendamento (fechasse picker sem confirmar), a tarefa sumia pra sempre.
    // AGORA — guarda o id em pendingIntent.fromBacklogId. Só apaga em confirmIntent/commitIntent.

    pendingIntent = { 
        title: item.title, 
        duration: item.duration, 
        theme: 'focus', 
        tagId: item.tagId || null,
        microblocks: item.microblocks || [],
        color: item.color || null, // V40.9.0
        columnId: getItemColumn(item), // V40.24.0: se entrar numa sublista e voltar, volta pra esta lista
        ...(goalKeep(item.goalId) ? { goalId: item.goalId } : {}), // V40.34.0: a meta vai junto pro bloco
        fromBacklogId: id  // V40.5.0-fix8: marker pra cleanup só se confirmar
    };
    selectedDur = item.duration;
    syncDurButtons(selectedDur);
    
    document.getElementById('floating-title').innerText = item.title;
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    closeAllSheets();
    renderTimeline();
};

// =====================================================
// V40.39.0 — BUSCA NAS LISTAS
// Pedido dele (23/11): "precisamos pesquisar também na aba listas". Escolheu "Filtrar as listas": cada lista mostra só
// os cartões que batem e o resto some até limpar. Procura no nome, no checklist e no nome da tag, sem ligar pra acento
// nem maiúscula, cada palavra em qualquer lugar: o mesmo cardMatchesSearch da busca da agenda (e as regras do PC). As
// bolinhas viram o número de achados de cada lista; se a lista na tela não tem nada e outra tem, vai pra ela. O que for
// criado ou editado durante a busca continua na tela (blSearchKeep), senão sumiria ao salvar; a palavra nova zera isso.
// (var, não let: renderBacklog pode rodar antes destas linhas)
// =====================================================
var blSearchQ = '';            // a busca já normalizada (sem acento, minúscula); '' = sem busca
var blSearchKeep = new Set();  // ids criados/editados durante esta busca
var blSearchT = null;
var blSearchJump = false;      // no próximo desenho: lista na tela sem achado e outra com → vai pra ela
function blSearchWords() { return blSearchQ ? blSearchQ.split(' ').filter(Boolean) : []; }
function blSearchShown(item) { return !blSearchQ || blSearchKeep.has(item.id) || cardMatchesSearch(item, blSearchQ); }
function blSearchHit(s, words) { const n = normalizeText(s); return words.some(w => n.includes(w)); }
// Texto com as palavras achadas marcadas: compara letra a letra sem acento, mas marca o texto original (o agsHl do PC).
function blSearchHl(s, words) {
    s = String(s == null ? '' : s);
    let flat = '';
    const at = [];
    for (let i = 0; i < s.length; i++) { const n = normalizeText(s[i]); for (let k = 0; k < n.length; k++) { flat += n[k]; at.push(i); } }
    const marks = [];
    words.forEach(w => { for (let p = flat.indexOf(w); p >= 0 && w; p = flat.indexOf(w, p + 1)) marks.push([at[p], at[p + w.length - 1] + 1]); });
    if (!marks.length) return escapeHtml(s);
    marks.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let html = '', cur = 0, m0 = marks[0][0], m1 = marks[0][1];
    const flush = () => { html += escapeHtml(s.slice(cur, m0)) + '<mark class="bl-hl">' + escapeHtml(s.slice(m0, m1)) + '</mark>'; cur = m1; };
    for (let i = 1; i < marks.length; i++) {
        if (marks[i][0] <= m1) { m1 = Math.max(m1, marks[i][1]); continue; }
        flush(); m0 = marks[i][0]; m1 = marks[i][1];
    }
    flush();
    return html + escapeHtml(s.slice(cur));
}
window.openBacklogSearch = function() {
    const row = document.getElementById('bl-search-row'), inp = document.getElementById('bl-search-input');
    if (!row || !inp) return;
    row.classList.remove('hidden');
    setTimeout(() => { // foco atrasado: só se a busca e a tela ainda estiverem abertas
        const sheet = document.getElementById('list-sheet');
        if (!row.classList.contains('hidden') && sheet && !sheet.classList.contains('translate-y-full')) inp.focus();
    }, 60);
};
window.closeBacklogSearch = function() {
    const row = document.getElementById('bl-search-row'), inp = document.getElementById('bl-search-input');
    clearTimeout(blSearchT);
    if (inp) { inp.value = ''; if (document.activeElement === inp) inp.blur(); }
    if (row) row.classList.add('hidden');
    const had = !!blSearchQ;
    blSearchQ = '';
    blSearchKeep = new Set();
    if (had) renderBacklog(); else backlogSearchInfo(0, 0);
};
window.backlogSearchInput = function() { clearTimeout(blSearchT); blSearchT = setTimeout(backlogSearchApply, 150); };
window.backlogSearchKey = function(e) { // o "Ir"/"Buscar" do teclado: aplica na hora e baixa o teclado
    if (e.key !== 'Enter') return;
    e.preventDefault();
    backlogSearchApply();
    if (e.target && e.target.blur) e.target.blur();
};
function backlogSearchApply() {
    clearTimeout(blSearchT);
    const inp = document.getElementById('bl-search-input');
    const q = normalizeText(String(inp ? inp.value : '').trim()).split(/\s+/).filter(Boolean).join(' ');
    if (q === blSearchQ) return;
    blSearchQ = q;
    blSearchKeep = new Set();
    blSearchJump = !!q;
    renderBacklog();
}
function backlogSearchInfo(n, lists) {
    const el = document.getElementById('bl-search-info');
    if (!el) return;
    el.textContent = !blSearchQ ? '' : !n ? 'Nada' : n + ' em ' + lists + (lists === 1 ? ' lista' : ' listas');
}
// As bolinhas embaixo do nome da lista. Com a busca, cada uma vira o número de achados daquela lista (sem achado: bolinha apagada).
function backlogDotsHtml(hits) {
    return backlogColumnsDb.map(col => {
        const isActive = col.id === activeColumnId, name = escapeHtml(col.name);
        if (blSearchQ) {
            const n = (hits && hits[col.id]) || 0;
            return n
                ? `<button onclick="scrollToColumn('${col.id}')" class="bl-dot-n${isActive ? ' on' : ''} transition active:scale-90" aria-label="Ir para ${name}: ${n} com essa busca">${n}</button>`
                : `<button onclick="scrollToColumn('${col.id}')" class="bl-dot-0${isActive ? ' on' : ''} transition active:scale-90" aria-label="Ir para ${name}: nada com essa busca"></button>`;
        }
        const dotClass = isActive ? 'bg-app-focus' : 'bg-zinc-300';
        return `<button onclick="scrollToColumn('${col.id}')" class="w-2 h-2 rounded-full ${dotClass} shrink-0 transition active:scale-90" aria-label="Ir para ${name}"></button>`;
    }).join('');
}
function backlogSearchHits() { // { id da lista: quantos cartões aparecem }
    const hits = {};
    backlogDb.forEach(it => { if (blSearchShown(it)) { const c = getItemColumn(it); hits[c] = (hits[c] || 0) + 1; } });
    return hits;
}

// V40.5.0: helper extraído — gera HTML do card de uma tarefa (sem mudar nada por dentro).
function renderBacklogCard(item) {
    const tagColor = item.tagId ? getTagColor(item.tagId) : null;
    const mbs = item.microblocks || [];
    const isExpanded = expandedBacklogIds.has(item.id);
    // V40.39.0: com a busca, os itens do checklist onde achou vêm primeiro, e as palavras achadas ficam marcadas
    const W = blSearchWords();
    const mbsView = W.length ? mbs.filter(m => blSearchHit(m.title, W)).concat(mbs.filter(m => !blSearchHit(m.title, W))) : mbs;
    const txt = (v) => W.length ? blSearchHl(v, W) : escapeHtml(v);
    // V40.5.0-fix3: preview reduzido de 3 → 2 checks pra cards menores
    const PREVIEW_COUNT = 2;
    const visibleMbs = isExpanded ? mbsView : mbsView.slice(0, PREVIEW_COUNT);
    const extraCount = mbs.length - PREVIEW_COUNT;
    
    let mbHtml = visibleMbs.map(mb => `
        <div class="flex items-center gap-1.5 mt-1">
            <i class="ph-bold ph-check text-[10px] text-zinc-300 shrink-0"></i>
            <span class="text-[11px] text-zinc-500 truncate">${txt(mb.title)}</span>
        </div>
    `).join('');
    
    if (extraCount > 0 && !isExpanded) {
        mbHtml += `<button onclick="event.stopPropagation(); toggleExpandBacklog('${item.id}')" class="text-[10px] text-app-focus font-bold mt-1.5 ml-4 hover:underline text-left active:scale-95 transition">+ ${extraCount} mais</button>`;
    } else if (isExpanded && mbs.length > PREVIEW_COUNT) {
        mbHtml += `<button onclick="event.stopPropagation(); toggleExpandBacklog('${item.id}')" class="text-[10px] text-app-focus font-bold mt-1.5 ml-4 hover:underline text-left active:scale-95 transition">↑ Mostrar menos</button>`;
    }
    // V40.5.0-fix3: SEM checklist = SEM texto "Sem checklist" (card fica menor)
    
    // V40.5.1-fix1: removido ícone clipboard (ganha espaço pro título). 
    // Indicador de tag preservado via BORDA ESQUERDA colorida (4px), sem ocupar largura horizontal do conteúdo.
    const cardBorderStyle = tagColor 
        ? `border-left-color: ${tagColor}; border-left-width: 4px;` 
        : '';
    // V40.39.0: achou pelo nome da tag (o cartão só mostra a cor dela): o nome aparece, marcado
    const tagObj = W.length && item.tagId ? tagsDb.find(t => t.id === item.tagId) : null;
    const tagHit = tagObj && tagObj.name && blSearchHit(tagObj.name, W) ? ` · ${blSearchHl(tagObj.name, W)}` : '';
    
    // V40.5.0-fix3: divisor + seção de checks SÓ se tem mbHtml (item com checklist)
    const hasChecks = mbs.length > 0;
    const checksSection = hasChecks ? `
        <div class="w-full h-px bg-zinc-100 my-2.5"></div>
        <div class="flex flex-col">
            ${mbHtml}
        </div>` : '';
    
    // V40.5.1: botão Mover só aparece se tem >1 lista (M4)
    // V40.9.0: cor livre (pinta o cartão inteiro; a faixa da tag continua)
    const paint = fazCardColor(item.color);
    const cardPaintStyle = paint ? `background-color: ${paint}; border-color: ${paint}; ` : '';
    const cardPaintClass = paint ? (fazIsDark(paint) ? 'card-painted card-dark ' : 'card-painted card-light ') : '';

    const moveBtn = backlogColumnsDb.length > 1 ? `
                <button onclick="event.stopPropagation(); openMoveCardModal('${item.id}')" class="w-8 h-8 flex items-center justify-center bg-zinc-100 text-zinc-600 rounded-lg hover:bg-zinc-200 active:scale-95 transition" title="Mover pra outra lista">
                    <i class="ph ph-arrows-left-right text-sm"></i>
                </button>` : '';
    
    return `
    <div onclick="openBacklogForm('${item.id}')" data-bl-card="${item.id}" class="${cardPaintClass}bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm relative mb-2 cursor-pointer hover:shadow active:scale-[0.99] transition" style="${cardPaintStyle}${cardBorderStyle}">
        <div class="flex justify-between items-start mb-2">
            <div class="min-w-0 flex-1 pr-2">
                <h4 class="font-bold text-sm text-zinc-800 leading-tight truncate">${goalBadge(item.goalId)}${txt(item.title)}</h4>
                <p class="text-[11px] text-zinc-400 font-bold mt-0.5"><i class="ph-bold ph-clock mr-1"></i>${formatDur(item.duration)}${mbs.length > 0 ? ` · ${mbs.length} ${mbs.length === 1 ? 'item' : 'itens'}` : ''}${tagHit}</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button onclick="event.stopPropagation(); scheduleBacklogItem('${item.id}')" class="w-8 h-8 flex items-center justify-center bg-app-focus-soft text-app-focus rounded-lg hover:bg-app-focus-soft-strong active:scale-95 transition" title="Agendar">
                    <i class="ph-fill ph-hand-tap text-sm"></i>
                </button>
                ${moveBtn}
                <button onclick="event.stopPropagation(); requestDeleteBacklog('${item.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 active:scale-95 transition" title="Apagar">
                    <i class="ph ph-trash text-sm"></i>
                </button>
            </div>
        </div>
        ${checksSection}
    </div>`;
}

function renderBacklog() {
    // V40.5.0: KANBAN — colunas horizontais com scroll-snap
    ensureDefaultColumn(); // K3: garante que Geral sempre existe
    
    const wrapper = document.getElementById('backlog-columns-wrapper');
    const dotsContainer = document.getElementById('backlog-column-dots');
    if (!wrapper) return;
    
    // Stats globais do header inferior (botão Lista) — soma de TODAS as colunas
    const totalMins = backlogDb.reduce((acc, item) => acc + item.duration, 0);
    const listStats = document.getElementById('list-btn-stats');
    const listCount = document.getElementById('list-btn-count');
    const listTime = document.getElementById('list-btn-time');
    
    if (backlogDb.length > 0) {
        listStats.classList.remove('hidden');
        listStats.classList.add('flex');
        listCount.innerText = backlogDb.length + (backlogDb.length === 1 ? ' item' : ' itens');
        listTime.innerText = formatDur(totalMins);
    } else {
        listStats.classList.add('hidden');
        listStats.classList.remove('flex');
    }
    
    // Atualiza header da coluna ATIVA (título + contador)
    updateActiveColumnHeader();
    
    // Renderiza cada coluna como uma "página" no scroll horizontal
    // V40.9.1: modo afastado (várias listas lado a lado). No modo normal nada muda.
    const zoomKeepLeft = wrapper.scrollLeft;
    // Onde cada lista estava rolada: redesenhar com a Lista aberta (mover, editar, apagar) não pode
    // jogar a lista pro topo. Ao ABRIR a Lista continua começando do topo, como sempre.
    const keepTop = {};
    const sheetEl = document.getElementById('list-sheet');
    if (sheetEl && !sheetEl.classList.contains('translate-y-full')) {
        Array.from(wrapper.children).forEach(el => { if (el.scrollTop) keepTop[el.dataset.columnId] = el.scrollTop; });
    }
    wrapper.classList.toggle('lists-zoom', !!backlogZoomOut);
    wrapper.classList.toggle('zoom-15', backlogZoomLevel() === 1.5); // V40.16.0: nível do afastado (o 2 não tem classe)
    wrapper.classList.toggle('zoom-3', backlogZoomLevel() === 3);
    backlogZoomUi();
    // V40.39.0: com a busca, cada lista só com os cartões que batem
    const searchHits = blSearchQ ? backlogSearchHits() : {};
    const searchN = backlogColumnsDb.reduce((a, c) => a + (searchHits[c.id] || 0), 0);
    wrapper.innerHTML = backlogColumnsDb.map((col, idx) => {
        const allItems = backlogDb.filter(item => getItemColumn(item) === col.id);
        const colItems = blSearchQ ? allItems.filter(blSearchShown) : allItems;
        let cardsHtml;
        if (blSearchQ && !colItems.length) {
            cardsHtml = `
                <div class="flex flex-col items-center justify-center text-center opacity-60 py-10 px-6">
                    <i class="ph ph-magnifying-glass text-3xl mb-2 text-zinc-400"></i>
                    <p class="text-sm font-medium text-zinc-500">${searchN ? 'Nada nesta lista com essa busca' : 'Nenhum cartão com essa busca'}</p>
                    <p class="text-[11px] text-zinc-400 mt-1">${searchN ? 'Os números embaixo do nome mostram onde achou' : 'Os arquivados não entram na busca'}</p>
                </div>`;
        } else if (colItems.length === 0) {
            cardsHtml = `
                <div class="flex flex-col items-center justify-center text-center opacity-50 py-12 px-6">
                    <i class="ph ph-inbox text-4xl mb-2 text-zinc-400"></i>
                    <p class="text-sm font-medium text-zinc-500">Lista vazia!</p>
                    <p class="text-[11px] text-zinc-400 mt-1">Toque em + Nova Tarefa pra começar</p>
                </div>`;
        } else {
            cardsHtml = colItems.map(renderBacklogCard).join('');
        }
        // V40.5.1-fix1: w-full (era w-[78%]) — cards iguais aos das outras abas.
        // Sem beiradinha — descoberta do swipe fica nos DOTS embaixo do header.
        return `
            <div class="snap-center snap-always shrink-0 w-full h-full overflow-y-auto no-scrollbar px-4 pb-4${col.id === activeColumnId ? ' zoom-active' : ''}" data-column-id="${col.id}">
                <div class="zoom-col-head" onclick="setActiveColumnFromZoom('${col.id}')"><span class="truncate">${escapeHtml(col.name)}</span><span class="zoom-col-count">${blSearchQ ? colItems.length + '/' + allItems.length : colItems.length}</span></div>
                ${cardsHtml}
            </div>`;
    }).join('');
    Array.from(wrapper.children).forEach(el => { if (keepTop[el.dataset.columnId]) el.scrollTop = keepTop[el.dataset.columnId]; });
    
    // Dots de navegação (V40.39.0: com a busca, o número de achados de cada lista)
    if (dotsContainer) dotsContainer.innerHTML = backlogDotsHtml(searchHits);
    backlogSearchInfo(searchN, backlogColumnsDb.filter(c => searchHits[c.id]).length);
    
    // Após render, garante que o scroll está na coluna ativa (sem animação)
    requestAnimationFrame(() => {
        const activeIdx = backlogColumnsDb.findIndex(c => c.id === activeColumnId);
        if (backlogZoomOut) {
            // afastado: o quadro fica onde estava. Só encosta a lista ativa na esquerda ao entrar no modo
            // ou quando a lista ativa mudou por fora (lista criada/apagada) e não está aparecendo.
            const actEl = wrapper.children[activeIdx];
            wrapper.scrollLeft = zoomKeepLeft;
            if (actEl && (_zoomAlignActive || (_zoomLastActive !== activeColumnId && !backlogColVisible(wrapper, actEl)))) {
                wrapper.scrollLeft = Math.max(0, backlogColLeft(wrapper, actEl) - 10);
            } else if (actEl && _zoomReveal) {
                backlogColReveal(wrapper, actEl); // V40.33.0: a lista que mudou de lugar continua inteira na tela
            } else {
                backlogZoomSyncActive();
            }
            _zoomAlignActive = false;
            _zoomReveal = false;
            _zoomLastActive = activeColumnId;
        } else if (activeIdx >= 0) {
            const cols = wrapper.children;
            if (cols[activeIdx]) {
                // V40.5.0-fix: centraliza (compatível com snap-center + w-[88%])
                wrapper.scrollLeft = cols[activeIdx].offsetLeft + (cols[activeIdx].offsetWidth / 2) - (wrapper.clientWidth / 2);
            }
        }
        // V40.39.0: a busca acabou de mudar e a lista na tela não tem nada: vai pra primeira que tem
        if (blSearchJump) {
            blSearchJump = false;
            if (blSearchQ && !searchHits[activeColumnId]) {
                const to = backlogColumnsDb.find(c => searchHits[c.id]);
                if (to) scrollToColumn(to.id);
            }
        }
        // Liga listener de scroll (idempotente)
        if (!wrapper.dataset.scrollListenerAttached) {
            wrapper.addEventListener('scroll', onBacklogColumnsScroll, { passive: true });
            wrapper.dataset.scrollListenerAttached = 'true';
        }
        // V40.5.1: liga listeners de drag (idempotente)
        attachBacklogDragListeners();
    });
}

// V40.5.0: detecta qual coluna está visível após scroll-snap e atualiza activeColumnId
// V40.5.0-fix: usa CENTRO do viewport pra ser compatível com snap-center + w-[88%]
let _scrollDebounceTimer = null;
function onBacklogColumnsScroll() {
    if (_scrollDebounceTimer) clearTimeout(_scrollDebounceTimer);
    _scrollDebounceTimer = setTimeout(() => {
        const wrapper = document.getElementById('backlog-columns-wrapper');
        if (!wrapper || colDrag) return; // V40.33.0: lista sendo arrastada: o quadro rola sozinho, a lista ativa fica
        if (backlogZoomOut) { backlogZoomSyncActive(); return; } // V40.9.1
        // Centro visível do wrapper
        const viewportCenter = wrapper.scrollLeft + (wrapper.clientWidth / 2);
        const cols = wrapper.children;
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < cols.length; i++) {
            const colCenter = cols[i].offsetLeft + (cols[i].offsetWidth / 2);
            const dist = Math.abs(colCenter - viewportCenter);
            if (dist < bestDist) { bestDist = dist; bestIdx = i; }
        }
        const newCol = backlogColumnsDb[bestIdx];
        if (newCol && newCol.id !== activeColumnId) {
            activeColumnId = newCol.id;
            updateActiveColumnHeader();
            updateColumnDots();
        }
    }, 100);
}

function updateActiveColumnHeader() {
    document.querySelectorAll('#backlog-columns-wrapper > [data-column-id]').forEach(el => el.classList.toggle('zoom-active', el.dataset.columnId === activeColumnId)); // V40.9.1
    const col = backlogColumnsDb.find(c => c.id === activeColumnId) || backlogColumnsDb[0];
    if (!col) return;
    const titleEl = document.getElementById('backlog-column-title');
    const countEl = document.getElementById('backlog-count');
    if (titleEl) titleEl.textContent = col.name; // V40.39.0: textContent (o innerText não existe no jsdom dos testes)
    if (countEl) {
        const colItems = backlogDb.filter(item => getItemColumn(item) === col.id);
        countEl.textContent = blSearchQ ? colItems.filter(blSearchShown).length + ' de ' + colItems.length : colItems.length; // V40.39.0: com a busca, "1 de 8"
    }
}

function updateColumnDots() {
    const dotsContainer = document.getElementById('backlog-column-dots');
    if (!dotsContainer) return;
    if (blSearchQ) { dotsContainer.innerHTML = backlogDotsHtml(backlogSearchHits()); return; } // V40.39.0: os números
    Array.from(dotsContainer.children).forEach((dot, idx) => {
        const col = backlogColumnsDb[idx];
        if (!col) return;
        if (col.id === activeColumnId) {
            dot.className = 'w-2 h-2 rounded-full bg-app-focus shrink-0 transition active:scale-90';
        } else {
            dot.className = 'w-2 h-2 rounded-full bg-zinc-300 shrink-0 transition active:scale-90';
        }
    });
}

// =====================================================
// V40.5.1 — DRAG VERTICAL DE CARDS (MVP)
// Long-press 400ms → arrasta vertical na MESMA coluna → solta = reordena.
// Sem polish (animação suave, scroll auto). Touch-action garante que swipe horizontal
// entre colunas NÃO é disparado durante drag vertical (D2).
// =====================================================
const DRAG_LONGPRESS_MS = 400;
const DRAG_MOVE_THRESHOLD = 8; // pixels antes de cancelar long-press

let _dragState = null; // { itemId, columnEl, cardEl, startY, longPressTimer, dragging }

function backlogDragOnTouchStart(e) {
    if (colDrag) return; // V40.33.0: uma lista está sendo arrastada (o 2º dedo não vira pinça nem arrasto de cartão)
    if (_dragState) backlogDragAbort(); // sobra de um toque que não terminou
    // V40.9.1: dois dedos = pinça (afastar/aproximar), nunca arrasto
    _pinchState = e.touches.length === 2
        ? { d0: backlogPinchDist(e.touches), pts: [0, 1].map(i => [e.touches[i].clientX, e.touches[i].clientY]), done: false }
        : null;
    if (e.touches.length !== 1) return;

    if (e.target.closest('.zoom-col-head')) { colDragPress(e); return; } // V40.33.0: segurar o título muda a lista de lugar
    const card = e.target.closest('[data-bl-card]');
    if (!card) return;
    
    // Ignora se toque foi em botão (Agendar/Mover/Apagar) dentro do card
    if (e.target.closest('button')) return;
    
    const itemId = card.dataset.blCard;
    const columnEl = card.closest('[data-column-id]');
    if (!columnEl) return;
    
    const touch = e.touches[0];
    _dragState = {
        itemId,
        columnEl,
        cardEl: card,
        startY: touch.clientY,
        startX: touch.clientX,
        dragging: false,
        longPressTimer: null
    };
    
    // D1: long-press 400ms = inicia drag
    const st = _dragState;
    _dragState.longPressTimer = setTimeout(() => {
        if (_dragState !== st) return;
        _dragState.dragging = true;
        // D4: feedback visual
        card.classList.add('opacity-60', 'scale-105', 'shadow-lg', 'z-10');
        // D2: durante drag, navegador só permite scroll vertical (sem swipe horizontal)
        card.style.touchAction = 'none';
        // Haptic feedback se disponível
        if (navigator.vibrate) navigator.vibrate(30);
        backlogDragBegin(card); // V40.9.1: no modo afastado o cartão acompanha o dedo
    }, DRAG_LONGPRESS_MS);
}

// =====================================================
// V40.9.1 — LISTAS AFASTADAS: várias listas lado a lado, pra arrastar o cartão de uma pra outra.
// V40.16.0 — três níveis de afastado: 1½, 2 ou 3 listas por tela (o 2 é o afastado de antes).
// A pinça muda um nível por gesto; a lupa abre o menu com os quatro (1 = modo normal).
// A escolha fica em tb__lista_afastada ('1' = afastado) e tb__lista_zoom (o nível): preferências do
// aparelho, fora do backup e da nuvem. Quem vem de antes com '1' e sem nível abre no 2, como era.
// =====================================================
var backlogZoomOut = false;   // var (não let): renderBacklog pode rodar antes desta linha
var backlogZoomCols = 2;      // nível do afastado: 1.5, 2 ou 3 listas por tela
var _zoomAlignActive = false; // true = no próximo desenho, encosta a lista ativa na esquerda
var _zoomLastActive = null;   // lista ativa no último desenho afastado
var _zoomReveal = false;      // V40.33.0: true = no próximo desenho afastado, rola o mínimo pra lista ativa aparecer inteira
var _pinchState = null;       // { d0, pts, done } enquanto dois dedos estão na tela
var _blClickBlockUntil = 0;   // depois de um arrasto, o "clique" que sobra não abre o cartão
try {
    backlogZoomOut = localStorage.getItem('tb__lista_afastada') === '1';
    const z = Number(localStorage.getItem('tb__lista_zoom'));
    if (z === 1.5 || z === 2 || z === 3) backlogZoomCols = z;
} catch (e) {}

// Listas por tela agora: 1 (normal), 1.5, 2 ou 3. Funciona mesmo antes das linhas de cima rodarem.
function backlogZoomLevel() { return backlogZoomOut ? (backlogZoomCols || 2) : 1; }
function backlogZoomLabel(n) { return n === 1.5 ? '1½' : String(n); }

window.setBacklogZoom = function(n) {
    colDragCancel(); // V40.33.0: trocar o zoom no meio do arrasto de uma lista = solta sem mover
    n = Number(n);
    if ([1, 1.5, 2, 3].indexOf(n) < 0 || n === backlogZoomLevel()) return;
    backlogDragAbort();
    backlogZoomOut = n > 1;
    if (backlogZoomOut) backlogZoomCols = n;
    _zoomAlignActive = backlogZoomOut; // entrar no afastado ou trocar de nível: encosta a lista ativa na esquerda
    try {
        localStorage.setItem('tb__lista_afastada', backlogZoomOut ? '1' : '0');
        if (backlogZoomOut) localStorage.setItem('tb__lista_zoom', String(n));
    } catch (e) {}
    renderBacklog();
};
// Liga/desliga o afastado voltando pro último nível usado (a tela usa o menu; fica pros testes e atalhos).
window.toggleBacklogZoom = function() { setBacklogZoom(backlogZoomOut ? 1 : (backlogZoomCols || 2)); };

// Lupa: mostra o nível quando afastado; o menu marca o nível atual.
function backlogZoomUi() {
    const zl = backlogZoomLevel();
    const btn = document.getElementById('backlog-zoom-btn');
    if (btn) {
        btn.innerHTML = `<i class="ph ${zl > 1 ? 'ph-magnifying-glass-plus' : 'ph-magnifying-glass-minus'} text-lg"></i>` + (zl > 1 ? `<span class="zoom-badge">${backlogZoomLabel(zl)}</span>` : '');
        btn.title = zl > 1 ? `Zoom das listas (${backlogZoomLabel(zl)} por tela)` : 'Zoom das listas (uma por tela)';
    }
    document.querySelectorAll('#backlog-zoom-menu [data-zoom]').forEach(b => {
        const on = Number(b.dataset.zoom) === zl;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
}
window.toggleBacklogZoomMenu = function() {
    const menu = document.getElementById('backlog-zoom-menu');
    if (!menu) return;
    const open = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !open);
    const btn = document.getElementById('backlog-zoom-btn');
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) backlogZoomUi();
};
function closeBacklogZoomMenu() {
    const menu = document.getElementById('backlog-zoom-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    const btn = document.getElementById('backlog-zoom-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
}
window.chooseBacklogZoom = function(n) { closeBacklogZoomMenu(); setBacklogZoom(n); };
// Menu aberto: tocar fora só fecha o menu (o toque não abre cartão nem aperta outro botão).
document.addEventListener('click', function(e) {
    const menu = document.getElementById('backlog-zoom-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (e.target && e.target.closest && e.target.closest('#backlog-zoom-menu, #backlog-zoom-btn')) return;
    e.stopPropagation();
    e.preventDefault();
    closeBacklogZoomMenu();
}, true);
window.setActiveColumnFromZoom = function(colId) {
    if (!backlogColumnsDb.some(c => c.id === colId)) return;
    activeColumnId = colId;
    _zoomLastActive = colId;
    updateActiveColumnHeader();
    updateColumnDots();
};

// Posição da lista dentro da área que rola (offsetLeft não serve aqui: ele conta a partir da sheet).
function backlogColLeft(wrapper, col) {
    return col.getBoundingClientRect().left - wrapper.getBoundingClientRect().left + wrapper.scrollLeft;
}
function backlogColVisible(wrapper, col) { // pelo menos metade da lista está aparecendo
    const wr = wrapper.getBoundingClientRect(), r = col.getBoundingClientRect();
    return Math.min(r.right, wr.right) - Math.max(r.left, wr.left) >= r.width / 2;
}
// V40.33.0: rola o quadro o mínimo pra lista aparecer inteira (com 10px de folga na borda).
function backlogColReveal(wrapper, col) {
    const wr = wrapper.getBoundingClientRect(), r = col.getBoundingClientRect();
    if (r.left < wr.left + 10) wrapper.scrollLeft -= (wr.left + 10 - r.left);
    else if (r.right > wr.right - 10) wrapper.scrollLeft += Math.min(r.right - (wr.right - 10), r.left - (wr.left + 10));
}
// Afastado: a lista ativa só troca sozinha quando some da tela (senão o título ficaria pulando).
function backlogZoomSyncActive() {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    if (!wrapper || !backlogZoomOut) return;
    const cols = Array.from(wrapper.children);
    const cur = cols.find(el => el.dataset.columnId === activeColumnId);
    if (cur && backlogColVisible(wrapper, cur)) return;
    const first = cols.find(el => backlogColVisible(wrapper, el));
    if (first) setActiveColumnFromZoom(first.dataset.columnId);
}

// Pinça com dois dedos: fechar os dedos afasta, abrir aproxima. V40.16.0: um nível por gesto
// (1 → 1½ → 2 → 3 e de volta), sem dar a volta: no 3 fechar não faz nada, no 1 abrir não faz nada.
function backlogPinchDist(touches) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}
function backlogPinchOnTouchMove(e) {
    const p = _pinchState;
    if (!p || e.touches.length !== 2) return false;
    if (p.done || p.d0 < 30) return true;
    // Só vale se os DOIS dedos se mexeram (um dedo parado + outro rolando a lista não é pinça).
    const moved = (i) => Math.hypot(e.touches[i].clientX - p.pts[i][0], e.touches[i].clientY - p.pts[i][1]) >= 12;
    if (!moved(0) || !moved(1)) return true;
    const ratio = backlogPinchDist(e.touches) / p.d0;
    const steps = [1, 1.5, 2, 3], i = steps.indexOf(backlogZoomLevel());
    const next = ratio < 0.75 ? i + 1 : ratio > 1.33 ? i - 1 : -1;
    if (i >= 0 && next >= 0 && next < steps.length) {
        p.done = true; // uma troca por gesto
        closeBacklogZoomMenu();
        setBacklogZoom(steps[next]);
    }
    return true;
}

// No modo afastado o cartão "sai" e acompanha o dedo, e o lugar onde ele vai cair abre um espaço
// tracejado. Chegar na borda do quadro rola o quadro; no topo ou no fim da lista, rola a lista.
function backlogDragBegin(card) {
    const st = _dragState;
    if (!backlogZoomOut || !st) return;
    const r = card.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight; // tamanho sem o "levantado" (scale)
    const left = r.left + (r.width - w) / 2, top = r.top + (r.height - h) / 2;
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('data-bl-card');
    ghost.removeAttribute('onclick');
    ghost.classList.remove('opacity-60', 'scale-105', 'z-10', 'relative'); // 'relative' do Tailwind ganharia do position: fixed
    ghost.classList.add('bl-ghost');
    if (backlogZoomLevel() === 1.5) ghost.classList.add('zoom-15'); // V40.16.0: mesmo tamanho de letra do nível
    else if (backlogZoomLevel() === 3) ghost.classList.add('zoom-3');
    ghost.style.width = w + 'px';
    ghost.style.left = left + 'px';
    ghost.style.top = top + 'px';
    document.body.appendChild(ghost);
    const slot = document.createElement('div');
    slot.className = 'zoom-slot';
    slot.style.height = h + 'px';
    card.classList.add('bl-src');
    st.ghost = ghost;
    st.slot = slot;
    st.offX = st.startX - left;
    st.offY = st.startY - top;
    st.lastX = st.startX;
    st.lastY = st.startY;
    st.edgeX = 0;
    st.edgeY = 0;
    const wrapper = document.getElementById('backlog-columns-wrapper');
    const timer = setInterval(() => {
        if (_dragState !== st) { clearInterval(timer); return; }
        if (!st.cardEl.isConnected) { backlogDragAbort(); return; } // a tela foi redesenhada no meio do arrasto
        if (!st.edgeX && !st.edgeY) return;
        if (st.edgeX) wrapper.scrollLeft += st.edgeX * 6;
        if (st.edgeY && st.overColEl) st.overColEl.scrollTop += st.edgeY * 6;
        backlogDragUpdateTarget(st.lastX, st.lastY); // o dedo está parado, mas o que está embaixo dele mudou
    }, 16);
    st.edgeTimer = timer;
}

// Encerra o arrasto sem mover nada: tira o cartão flutuante, o espaço, os timers e os destaques.
function backlogDragAbort() {
    const st = _dragState;
    if (!st) return;
    _dragState = null;
    clearTimeout(st.longPressTimer);
    if (st.edgeTimer) clearInterval(st.edgeTimer);
    if (st.ghost) st.ghost.remove();
    if (st.slot) st.slot.remove();
    st.cardEl.classList.remove('opacity-60', 'scale-105', 'shadow-lg', 'z-10', 'bl-src', 'bl-src-gone');
    st.cardEl.style.touchAction = '';
    backlogDragClearMarks();
}

function backlogDragClearMarks() {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    if (!wrapper) return;
    wrapper.querySelectorAll('[data-bl-card].ring-2').forEach(c => c.classList.remove('ring-2', 'ring-app-focus'));
}

// Lista mais perto do dedo na horizontal (o vão entre duas listas conta pra mais próxima).
function backlogColumnAtX(x) {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    const wr = wrapper.getBoundingClientRect();
    const cx = Math.min(Math.max(x, wr.left + 1), wr.right - 1);
    let best = null, bestDist = Infinity;
    for (const col of wrapper.children) {
        const r = col.getBoundingClientRect();
        const dist = cx < r.left ? r.left - cx : (cx > r.right ? cx - r.right : 0);
        if (dist < bestDist) { bestDist = dist; best = col; }
    }
    return best;
}

// Decide onde o cartão cairia se o dedo soltasse em (x, y) e mostra isso na tela.
function backlogDragUpdateTarget(x, y) {
    const st = _dragState;
    if (!st || !st.dragging) return;
    if (!st.slot) {
        // Modo normal (V40.5.1): só dentro da própria lista; destaca o cartão alvo.
        backlogDragClearMarks();
        st.overCardEl = null;
        for (const c of st.columnEl.querySelectorAll('[data-bl-card]')) {
            if (c === st.cardEl) continue;
            const rect = c.getBoundingClientRect();
            if (y >= rect.top && y <= rect.bottom) {
                c.classList.add('ring-2', 'ring-app-focus');
                st.overCardEl = c;
                break;
            }
        }
        return;
    }
    // Modo afastado: a lista vem da posição horizontal do dedo; o lugar na lista, da vertical
    // (entra antes do primeiro cartão cujo meio está abaixo do dedo; se não houver, no fim).
    const col = backlogColumnAtX(x);
    if (!col) return;
    const cards = Array.from(col.querySelectorAll('[data-bl-card]'));
    let ref = null;
    for (const c of cards) {
        if (c === st.cardEl) continue;
        const r = c.getBoundingClientRect();
        if (y < r.top + r.height / 2) { ref = c; break; }
    }
    // Soltar onde o cartão já está não é mover: não abre espaço e o cartão de origem continua no lugar.
    // Fora isso, o cartão de origem "sai" da lista (fica com altura zero) e o espaço mostra o destino.
    const samePlace = col === st.columnEl && ref === (cards[cards.indexOf(st.cardEl) + 1] || null);
    st.overColEl = col;
    st.beforeId = ref ? ref.dataset.blCard : null;
    st.hasTarget = !samePlace;
    st.cardEl.classList.toggle('bl-src-gone', !samePlace);
    if (samePlace) { st.slot.remove(); return; }
    if (ref) {
        if (st.slot.parentNode !== col || st.slot.nextElementSibling !== ref) col.insertBefore(st.slot, ref);
    } else if (st.slot.parentNode !== col || col.lastElementChild !== st.slot) {
        col.appendChild(st.slot);
    }
}

function backlogDragOnTouchMove(e) {
    if (backlogPinchOnTouchMove(e)) return; // V40.9.1: pinça
    if (!_dragState) return;
    
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - _dragState.startX);
    const dy = Math.abs(touch.clientY - _dragState.startY);
    
    // Se moveu muito ANTES do long-press completar → cancela drag (era scroll comum)
    if (!_dragState.dragging) {
        if (dx > DRAG_MOVE_THRESHOLD || dy > DRAG_MOVE_THRESHOLD) {
            clearTimeout(_dragState.longPressTimer);
            _dragState = null;
        }
        return;
    }
    
    // Já está em modo drag — previne scroll
    e.preventDefault();
    
    const st = _dragState;
    if (st.ghost) {
        st.lastX = touch.clientX;
        st.lastY = touch.clientY;
        st.ghost.style.left = (touch.clientX - st.offX) + 'px';
        st.ghost.style.top = (touch.clientY - st.offY) + 'px';
        const wr = document.getElementById('backlog-columns-wrapper').getBoundingClientRect();
        st.edgeX = touch.clientX < wr.left + 36 ? -1 : (touch.clientX > wr.right - 36 ? 1 : 0);
        st.edgeY = touch.clientY < wr.top + 56 ? -1 : (touch.clientY > wr.bottom - 36 ? 1 : 0);
    }
    backlogDragUpdateTarget(touch.clientX, touch.clientY);
}

function backlogDragOnTouchEnd(e) {
    if (e.touches && e.touches.length < 2) _pinchState = null;
    const st = _dragState;
    if (!st) return;
    
    if (!st.dragging) {
        clearTimeout(st.longPressTimer);
        _dragState = null;
        return;
    }
    
    // Rolagem da lista de destino ANTES de tirar o espaço tracejado (tirar o espaço encolhe a lista e o
    // navegador "puxa" a rolagem; sem isto, soltar no fim de uma lista comprida escondia o cartão recém-solto).
    const dropTop = st.overColEl ? st.overColEl.scrollTop : 0;
    backlogDragAbort(); // limpa o visual do arrasto (cartão, espaço, timers, destaques)
    _blClickBlockUntil = Date.now() + 350;
    if (e.type === 'touchcancel') return; // toque cancelado pelo sistema: não move nada
    
    if (st.slot) {
        // V40.9.1 (afastado): outra lista ou outro lugar na mesma lista, exatamente onde o espaço abriu
        if (st.hasTarget && st.overColEl) {
            const destId = st.overColEl.dataset.columnId;
            moveBacklogCardTo(st.itemId, destId, st.beforeId);
            const destEl = Array.from(document.getElementById('backlog-columns-wrapper').children).find(el => el.dataset.columnId === destId);
            if (destEl && dropTop) destEl.scrollTop = dropTop;
        }
    } else if (st.overCardEl && st.overCardEl !== st.cardEl) {
        reorderBacklog(st.itemId, st.overCardEl.dataset.blCard);
    }
}

// Coloca o cartão na lista `destColId`, antes de `beforeId` (ou no fim da lista).
function moveBacklogCardTo(fromId, destColId, beforeId) {
    const item = backlogDb.find(i => i.id === fromId);
    const destCol = backlogColumnsDb.find(c => c.id === destColId);
    if (!item || !destCol || fromId === beforeId) return;
    const changedList = getItemColumn(item) !== destColId;
    backlogDb.splice(backlogDb.indexOf(item), 1);
    if (changedList) item.columnId = destColId;
    const toIdx = beforeId ? backlogDb.findIndex(i => i.id === beforeId) : -1;
    if (toIdx >= 0) backlogDb.splice(toIdx, 0, item); else backlogDb.push(item);
    saveBacklog();
    renderBacklog();
    if (changedList) showToast(`Movido pra ${destCol.name}!`);
}

// D3: reordena backlogDb (array plano) movendo `fromId` pra posição de `toId`
function reorderBacklog(fromId, toId) {
    const fromIdx = backlogDb.findIndex(i => i.id === fromId);
    const toIdx = backlogDb.findIndex(i => i.id === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    
    const [item] = backlogDb.splice(fromIdx, 1);
    backlogDb.splice(toIdx, 0, item); // simplificado — sempre pra toIdx no array já encurtado
    saveBacklog();
    renderBacklog();
}

// Ativa os listeners de drag no wrapper (idempotente, chamado uma vez)
function attachBacklogDragListeners() {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    if (!wrapper || wrapper.dataset.dragListenersAttached) return;
    wrapper.addEventListener('touchstart', backlogDragOnTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', backlogDragOnTouchMove, { passive: false });
    wrapper.addEventListener('touchend', backlogDragOnTouchEnd, { passive: true });
    wrapper.addEventListener('touchcancel', backlogDragOnTouchEnd, { passive: true });
    // V40.33.0: mudar a lista de lugar. Com o dedo, o título de cada lista (afastado) entra pelo touchstart de cima;
    // com o mouse, por aqui. O nome lá em cima vale nos dois modos (não-passivo: depois de segurar, o arrasto para a rolagem).
    wrapper.addEventListener('mousedown', (e) => { if (e.target.closest('.zoom-col-head')) colDragPress(e); });
    const head = document.getElementById('backlog-column-head');
    if (head) {
        head.addEventListener('touchstart', colDragPress, { passive: false });
        head.addEventListener('mousedown', colDragPress);
    }
    // V40.9.1: o "clique" que o navegador gera ao soltar um arrasto não pode abrir o cartão
    wrapper.addEventListener('click', (e) => {
        if (Date.now() >= _blClickBlockUntil) return;
        _blClickBlockUntil = 0; // só o primeiro clique depois do arrasto
        e.stopPropagation();
        e.preventDefault();
    }, true);
    wrapper.dataset.dragListenersAttached = 'true';
}

// =====================================================
// V40.33.0 — MUDAR A LISTA DE LUGAR
// Arrastando: segurar o nome da lista 400 ms (como o cartão) e arrastar pro lado. No zoom afastado vale o título de
// cada lista; o nome lá em cima vale sempre (é a lista ativa). No modo normal o quadro se afasta sozinho (3 listas por
// tela) só enquanto o dedo arrasta e volta ao soltar, sem mudar o zoom escolhido. A lista "sai" e anda com o dedo na
// horizontal; o espaço tracejado mostra onde ela vai cair; perto da borda o quadro rola. Toque cancelado pelo sistema,
// troca de zoom ou o quadro redesenhado no meio (veio da nuvem) = solta sem mover nada.
// Pelo menu (3 pontinhos): Esquerda / Direita, uma casa por toque, com o menu aberto.
// A ordem é a do backlogColumnsDb; a nuvem vira "position" sozinha (só a da lista que mudou) e o Desfazer pega.
// =====================================================
var colDrag = null; // { colId, press, temp, prevCols, x0, x, colEl, ghost, slot, left0, w, edge, beforeId, hasTarget, timer }
var _colMenuMoves = 0; // trocas de lugar feitas com o menu da lista aberto (ao fechar, a barrinha do Desfazer aparece)

// Põe a lista `colId` logo antes da lista `beforeId` (null = no fim). Devolve true se a ordem mudou.
function moveBacklogColumn(colId, beforeId) {
    beforeId = beforeId || null;
    const from = backlogColumnsDb.findIndex(c => c.id === colId);
    if (from < 0 || colId === beforeId) return false;
    if (beforeId && !backlogColumnsDb.some(c => c.id === beforeId)) return false;
    const next = backlogColumnsDb[from + 1];
    if ((next ? next.id : null) === beforeId) return false; // já está aí
    const [col] = backlogColumnsDb.splice(from, 1);
    const to = beforeId ? backlogColumnsDb.findIndex(c => c.id === beforeId) : backlogColumnsDb.length;
    backlogColumnsDb.splice(to, 0, col);
    saveBacklogColumns();
    return true;
}

// Menu da lista: "Posição 2 de 5" e as setas (apagadas nas pontas; com uma lista só, some tudo).
function columnMenuPosUi() {
    const n = backlogColumnsDb.length, i = backlogColumnsDb.findIndex(c => c.id === activeColumnId);
    const pos = document.getElementById('column-menu-pos'), row = document.getElementById('column-menu-move');
    const left = document.getElementById('column-menu-left'), right = document.getElementById('column-menu-right');
    if (pos) pos.textContent = n > 1 && i >= 0 ? `Posição ${i + 1} de ${n}` : '';
    if (row) row.classList.toggle('hidden', n < 2);
    if (left) left.disabled = i <= 0;
    if (right) right.disabled = i < 0 || i >= n - 1;
}
window.moveActiveColumn = function(dir) {
    const i = backlogColumnsDb.findIndex(c => c.id === activeColumnId), to = i + (dir < 0 ? -1 : 1);
    if (i < 0 || to < 0 || to >= backlogColumnsDb.length) return;
    const beforeId = dir < 0 ? backlogColumnsDb[to].id : (backlogColumnsDb[to + 1] ? backlogColumnsDb[to + 1].id : null);
    if (!moveBacklogColumn(activeColumnId, beforeId)) return;
    _colMenuMoves++;
    _zoomReveal = true;
    _zoomLastActive = activeColumnId;
    renderBacklog();
    columnMenuPosUi();
};

// Toque (ou mouse) no nome da lista: segurando parado, começa o arrasto.
function colDragPress(e) {
    if (colDrag || _dragState) return;
    if (e.touches ? e.touches.length !== 1 : e.button !== 0) return;
    if (backlogColumnsDb.length < 2) return; // uma lista só: não tem pra onde ir
    const t = e.target && e.target.closest ? e.target : null;
    const press = t && (t.closest('.zoom-col-head') || t.closest('#backlog-column-head'));
    if (!press) return;
    const colEl = press.classList.contains('zoom-col-head') ? press.closest('[data-column-id]') : null;
    if (press.classList.contains('zoom-col-head') && (!colEl || !backlogZoomOut)) return;
    fazLongPress(e, (x, y) => colDragBegin(colEl ? colEl.dataset.columnId : activeColumnId, press, x, y));
}

function colDragBegin(colId, press, x, y) {
    const sheet = document.getElementById('list-sheet'), wrapper = document.getElementById('backlog-columns-wrapper');
    if (colDrag || _dragState || !press.isConnected || !wrapper || backlogColumnsDb.length < 2) return;
    if (!backlogColumnsDb.some(c => c.id === colId)) return;
    if (!sheet || sheet.classList.contains('translate-y-full') || activeListTab !== 'backlog') return; // a Lista fechou no meio
    closeBacklogZoomMenu();
    const st = colDrag = { colId, press, temp: !backlogZoomOut, prevCols: backlogZoomCols, x0: x, x: x, edge: 0, beforeId: null, hasTarget: false };
    activeColumnId = colId; // a lista que o dedo segurou vira a ativa (nome lá em cima e borda)
    _zoomLastActive = colId;
    document.addEventListener('touchmove', colDragMove, { passive: false });
    document.addEventListener('touchend', colDragEnd);
    document.addEventListener('touchcancel', colDragEnd);
    document.addEventListener('mousemove', colDragMove);
    document.addEventListener('mouseup', colDragEnd);
    if (navigator.vibrate) navigator.vibrate(30);
    if (st.temp) {
        // modo normal: afasta pra 3 por tela só durante o arrasto (não grava a escolha do zoom)
        backlogZoomOut = true;
        backlogZoomCols = 3;
        _zoomAlignActive = true;
        renderBacklog();
        requestAnimationFrame(() => { // depois do desenho (que acerta a rolagem): a lista no meio da tela e ela "sai"
            if (colDrag !== st) return;
            const el = Array.from(wrapper.children).find(c => c.dataset.columnId === colId);
            if (el) wrapper.scrollLeft = Math.max(0, backlogColLeft(wrapper, el) + el.offsetWidth / 2 - wrapper.clientWidth / 2);
            colDragLift(st);
        });
    } else {
        updateActiveColumnHeader();
        updateColumnDots();
        colDragLift(st);
    }
}

// A lista sai do quadro: a cópia que anda com o dedo, o espaço tracejado e o "fantasma" no lugar de origem.
function colDragLift(st) {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    const el = wrapper && Array.from(wrapper.children).find(c => c.dataset.columnId === st.colId);
    if (!el) { colDragCancel(); return; }
    const r = el.getBoundingClientRect(), lvl = backlogZoomLevel();
    const ghost = document.createElement('div');
    ghost.className = 'bl-col-ghost lists-zoom' + (lvl === 1.5 ? ' zoom-15' : lvl === 3 ? ' zoom-3' : '');
    const copy = el.cloneNode(true);
    // a cópia fica com os atributos (o visual do afastado depende deles), mas sem o id de verdade: quem procura
    // a lista ou o cartão pelo id continua achando só o do quadro
    copy.setAttribute('data-column-id', '');
    copy.classList.remove('zoom-active', 'bl-col-src', 'bl-col-src-gone');
    copy.querySelectorAll('[onclick]').forEach(n => n.removeAttribute('onclick'));
    copy.querySelectorAll('[data-bl-card]').forEach(n => n.setAttribute('data-bl-card', ''));
    copy.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    copy.style.setProperty('height', r.height + 'px', 'important');
    ghost.appendChild(copy);
    ghost.style.width = r.width + 'px';
    ghost.style.left = r.left + 'px';
    ghost.style.top = (r.top - 6) + 'px';
    document.body.appendChild(ghost);
    const slot = document.createElement('div');
    slot.className = 'zoom-col-slot';
    slot.style.width = r.width + 'px';
    slot.style.height = r.height + 'px';
    el.classList.add('bl-col-src');
    Object.assign(st, { colEl: el, ghost, slot, left0: r.left, w: r.width });
    st.timer = setInterval(colDragTick, 16);
    colDragPlace();
}

// Onde a cópia está agora (só anda na horizontal, sem sair mais que metade da tela).
function colDragPlace() {
    const st = colDrag;
    if (!st || !st.ghost) return;
    const wr = document.getElementById('backlog-columns-wrapper').getBoundingClientRect();
    const left = Math.max(wr.left - st.w / 2, Math.min(wr.right - st.w / 2, st.left0 + st.x - st.x0));
    st.ghost.style.left = left + 'px';
    st.gx = left + st.w / 2; // meio da cópia: é ele que decide o lugar
    const lo = Math.min(st.x, st.gx), hi = Math.max(st.x, st.gx);
    st.edge = lo < wr.left + 36 ? -1 : (hi > wr.right - 36 ? 1 : 0);
    colDragTarget();
}

// Decide onde a lista cairia agora (antes da primeira outra lista cujo meio está à direita do meio da cópia) e
// mostra o espaço lá. Soltar onde ela já está não é mover: sem espaço e a lista de origem continua no lugar.
function colDragTarget() {
    const st = colDrag;
    if (!st || !st.ghost) return;
    const wrapper = document.getElementById('backlog-columns-wrapper');
    const order = Array.from(wrapper.children).filter(el => el.dataset.columnId);
    const others = order.filter(el => el !== st.colEl);
    let ref = null;
    for (const el of others) {
        const r = el.getBoundingClientRect();
        if (st.gx < r.left + r.width / 2) { ref = el; break; }
    }
    const same = ref === (order[order.indexOf(st.colEl) + 1] || null);
    st.beforeId = ref ? ref.dataset.columnId : null;
    st.hasTarget = !same;
    st.colEl.classList.toggle('bl-col-src-gone', !same);
    if (same) { st.slot.remove(); return; }
    if (ref) {
        if (st.slot.parentNode !== wrapper || st.slot.nextElementSibling !== ref) wrapper.insertBefore(st.slot, ref);
    } else if (st.slot.parentNode !== wrapper || wrapper.lastElementChild !== st.slot) {
        wrapper.appendChild(st.slot);
    }
}

function colDragMove(e) {
    const st = colDrag;
    if (!st) return;
    const p = e.touches ? e.touches[0] : e;
    if (!p) return;
    if (e.cancelable) e.preventDefault(); // nem o quadro nem a lista rolam junto com o dedo
    st.x = p.clientX;
    colDragPlace();
}

function colDragTick() {
    const st = colDrag;
    if (!st) return;
    if (!st.press.isConnected || (st.colEl && !st.colEl.isConnected)) { colDragCancel(); return; } // redesenhou no meio
    if (!st.edge || !st.ghost) return;
    const wrapper = document.getElementById('backlog-columns-wrapper'), before = wrapper.scrollLeft;
    wrapper.scrollLeft += st.edge * 7;
    if (wrapper.scrollLeft !== before) colDragTarget(); // o dedo está parado, mas o que está embaixo dele mudou
}

// Tira o visual do arrasto, os ouvintes e o relógio. Não mexe na ordem nem no zoom.
function colDragStop() {
    const st = colDrag;
    if (!st) return null;
    colDrag = null;
    clearInterval(st.timer);
    document.removeEventListener('touchmove', colDragMove);
    document.removeEventListener('touchend', colDragEnd);
    document.removeEventListener('touchcancel', colDragEnd);
    document.removeEventListener('mousemove', colDragMove);
    document.removeEventListener('mouseup', colDragEnd);
    if (st.ghost) st.ghost.remove();
    if (st.slot) st.slot.remove();
    if (st.colEl) st.colEl.classList.remove('bl-col-src', 'bl-col-src-gone');
    _blClickBlockUntil = Date.now() + 350; // o "clique" que sobra ao soltar não abre nada
    return st;
}

// Solta sem mover (e volta pro modo normal, se foi o arrasto que afastou o quadro).
function colDragCancel() {
    const st = colDragStop();
    if (!st || !st.temp) return;
    backlogZoomOut = false;
    backlogZoomCols = st.prevCols;
    renderBacklog();
}

function colDragEnd(e) {
    const st = colDrag;
    if (!st) return;
    if (e && e.type === 'touchcancel') { colDragCancel(); return; } // toque cancelado pelo sistema: não move nada
    if (st.ghost) colDragTarget(); // o último lugar (o quadro pode ter rolado depois do último movimento)
    colDragStop();
    if (st.temp) { backlogZoomOut = false; backlogZoomCols = st.prevCols; }
    const moved = st.hasTarget && moveBacklogColumn(st.colId, st.beforeId);
    activeColumnId = st.colId;
    _zoomLastActive = st.colId;
    if (!st.temp && moved) _zoomReveal = true;
    if (moved || st.temp) renderBacklog();
}

// V40.5.0: ir programaticamente pra uma coluna (toque no dot)
// V40.5.0-fix: centraliza a coluna no viewport (compatível com snap-center + w-[88%])
window.scrollToColumn = function(columnId) {
    const wrapper = document.getElementById('backlog-columns-wrapper');
    if (!wrapper) return;
    const idx = backlogColumnsDb.findIndex(c => c.id === columnId);
    if (idx < 0) return;
    const col = wrapper.children[idx];
    if (!col) return;
    // Posiciona o centro da coluna no centro do viewport
    const targetScroll = backlogZoomOut
        ? Math.max(0, backlogColLeft(wrapper, col) - 10) // V40.9.1: afastado → encosta a lista na esquerda
        : col.offsetLeft + (col.offsetWidth / 2) - (wrapper.clientWidth / 2);
    wrapper.scrollTo({ left: targetScroll, behavior: 'smooth' });
    activeColumnId = columnId;
    updateActiveColumnHeader();
    updateColumnDots();
};

// V40.3.5 Ajuste 4 (I): toggle expansão de checklist de um item da Lista.
window.toggleExpandBacklog = function(itemId) {
    if (expandedBacklogIds.has(itemId)) {
        expandedBacklogIds.delete(itemId);
    } else {
        expandedBacklogIds.add(itemId);
    }
    renderBacklog();
}

// =====================================================
// V40.2.2 - PENSAMENTO DO DIA (50 frases motivacionais curtas)
// =====================================================

const THOUGHTS_OF_DAY = [
    "Comece pelo passo mais fácil. O resto vem.",
    "Você não precisa estar pronto. Só precisa começar.",
    "Pequeno avanço hoje > inércia perfeita.",
    "Respira. Está tudo no seu tempo.",
    "O que você faz agora vira o você de amanhã.",
    "Disciplina é amor próprio em movimento.",
    "Não desista no dia ruim. Ele é só um dia.",
    "Foco é dizer não pra coisas boas em nome do essencial.",
    "Sua atenção é o presente mais raro que você tem.",
    "Acabar é melhor que perfeito.",
    "Confia no processo, mesmo quando não vê o resultado.",
    "Hoje é o melhor dia pra recomeçar.",
    "Você tá fazendo o suficiente. De verdade.",
    "O cansaço passa. O orgulho de ter feito fica.",
    "Faça uma coisa por vez. Faça bem feito.",
    "Não compare seu capítulo 3 com o capítulo 20 dos outros.",
    "Persistência vence talento sem disciplina.",
    "Tudo que importa exige presença, não pressa.",
    "Você é maior do que o pior dia da sua semana.",
    "Aja. A motivação chega depois.",
    "A versão de você que termina é diferente da que começa.",
    "Você não está atrasado. Está no seu próprio tempo.",
    "O importante não é o tamanho do passo, é a direção.",
    "Cuide do agora. O futuro se cuida sozinho.",
    "Coragem é fazer com medo.",
    "Quem se compara, se afasta de si mesmo.",
    "Resultado é consequência. Cuide do hábito.",
    "Você não precisa ser perfeito hoje. Só precisa aparecer.",
    "Diga não às distrações. Diga sim aos seus sonhos.",
    "Cada bloco concluído é um voto pra quem você quer ser.",
    "A vida acontece nos pequenos momentos de foco.",
    "Sua rotina constrói seu futuro mais que sua ambição.",
    "Não negocie com a procrastinação. Comece.",
    "Você merece o esforço que dedica aos outros.",
    "O dia não precisa ser perfeito pra ser produtivo.",
    "Faça hoje o que seu eu de amanhã vai agradecer.",
    "Calma. Foco. Coragem. Repete.",
    "Nem todo dia rende. E tudo bem.",
    "A pressa é inimiga da intenção.",
    "Pequenos passos diários movem montanhas.",
    "Você é o que repete. Repita o que importa.",
    "Aceitar o ritmo é mais sábio que lutar contra ele.",
    "Não é sobre tempo. É sobre prioridade.",
    "Faça por amor, não por culpa.",
    "Você está mais perto do que pensa.",
    "Cada minuto bem gasto é uma vitória silenciosa.",
    "O foco é o novo luxo.",
    "Não trabalhe duro. Trabalhe com intenção.",
    "Hoje é um bom dia pra ser gentil consigo.",
    "Você não precisa fazer tudo. Só o que importa."
];

// V40.2.5: Verifica se o pensamento de hoje já foi lido e esconde o botão
function updateThoughtBtnVisibility() {
    const btn = document.getElementById('thought-btn-wrap');
    if (!btn) return;
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const lastRead = localStorage.getItem('tb_thought_read_date');
    if (lastRead === today) {
        btn.style.display = 'none';
    } else {
        btn.style.display = '';
    }
}

// Mostra o modal com a "frase do dia" (mesma frase por 24h, baseada na data)
window.showThoughtOfDay = function() {
    // Índice baseado na data atual (mesma frase o dia todo)
    const today = new Date();
    const daysSinceEpoch = Math.floor(today.getTime() / (1000 * 60 * 60 * 24));
    const idx = daysSinceEpoch % THOUGHTS_OF_DAY.length;
    
    const textEl = document.getElementById('thought-text');
    if (textEl) textEl.innerText = THOUGHTS_OF_DAY[idx];
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    const modal = document.getElementById('thought-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.closeThoughtModal = function() {
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
    const modal = document.getElementById('thought-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    
    // V40.2.5: Nuvem Passageira - marca como lida e esconde o botão até amanhã
    const todayStr = new Date().toLocaleDateString('en-CA');
    localStorage.setItem('tb_thought_read_date', todayStr);
    updateThoughtBtnVisibility();
}

// =====================================================
// V40.2 - VINCULAR NOTAS A CARDS
// =====================================================

// Estado: qual card está abrindo a sheet de "Adicionar nota" / qual nota está aberta no modal
let activeLinkBlockId = null;
let viewingLinkedNoteId = null;
let viewingLinkedFromBlockId = null;

// Renderiza a seção de notas vinculadas dentro de um card expandido
function renderLinkedNotesSection(block, isDarkTheme) {
    const linkedIds = block.linkedNoteIds || [];
    const validNotes = linkedIds
        .map(id => notesDb.find(n => n.id === id))
        .filter(n => n); // remove ids órfãos (nota apagada)
    
    const linkedHtml = validNotes.map(n => {
        const label = n.title || n.content.slice(0, 30) + (n.content.length > 30 ? '…' : '');
        const labelClass = isDarkTheme ? 'text-white/85' : 'text-black/75';
        const iconClass = isDarkTheme ? 'text-white/60' : 'text-black/50';
        const bgClass = isDarkTheme ? 'bg-black/15 hover:bg-black/25' : 'bg-black/[0.04] hover:bg-black/[0.08]';
        return `
            <div onclick="viewLinkedNote('${block.id}', '${n.id}', event)" class="flex items-center gap-1.5 ${bgClass} rounded-md px-2 py-1.5 cursor-pointer transition-colors mt-1">
                <i class="ph ph-note-pencil text-[12px] ${iconClass} shrink-0"></i>
                <span class="text-[11px] font-medium leading-tight flex-1 ${labelClass} truncate">${escapeHtml(label)}</span>
            </div>
        `;
    }).join('');
    
    const btnClass = isDarkTheme
        ? 'bg-black/15 hover:bg-black/25 text-white/80 border-white/10'
        : 'bg-black/[0.04] hover:bg-black/[0.08] text-black/60 border-black/[0.08]';
    
    return `
        <div class="mt-3 pt-2 border-t ${isDarkTheme ? 'border-white/10' : 'border-black/[0.06]'}">
            ${linkedHtml}
            <button onclick="openLinkNoteSheet('${block.id}', event)" class="mt-1 w-full flex items-center justify-center gap-1.5 ${btnClass} rounded-md px-2 py-1.5 text-[10px] font-medium border transition-colors">
                <i class="ph ph-plus text-[11px]"></i> Adicionar nota
            </button>
        </div>
    `;
}

// Abre a sheet de escolha (Criar nova / Vincular existente)
window.openLinkNoteSheet = function(blockId, e) {
    if (e) e.stopPropagation();
    activeLinkBlockId = blockId;
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('link-note-sheet').classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7
    // Reset visual: mostrar opções, esconder lista
    document.getElementById('link-note-options').classList.remove('hidden');
    document.getElementById('link-note-existing-view').classList.add('hidden');
}

window.closeLinkNoteSheet = function() {
    activeLinkBlockId = null;
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('link-note-sheet').classList.add('translate-y-full');
}

// V40.2.1: ID do bloco aguardando vincular nota recém-criada (após save no form)
let pendingLinkBlockId = null;

// Opção "Criar nova": abre form em modo "criação ligada ao bloco"
window.chooseCreateNewNote = function() {
    if (!activeLinkBlockId) return;
    const blockIdToLink = activeLinkBlockId; // V40.2.14: salva ANTES de closeAllSheets zerar tudo
    
    // V40.2.14: closeAllSheets em vez de só closeLinkNoteSheet — evita sheets sobrepostas
    closeAllSheets();
    
    pendingLinkBlockId = blockIdToLink; // V40.2.14: re-seta DEPOIS do closeAllSheets pra addNote vincular
    
    // Abre form de criar nota direto na aba Notas
    setTimeout(() => {
        document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('list-sheet').classList.remove('translate-y-full');
        switchListTab('notes');
        openNoteForm(); // abre form em modo criação
    }, 320);
}

// Opção "Vincular existente": mostra lista de notas (com busca se > 10)
window.chooseLinkExistingNote = function() {
    document.getElementById('link-note-options').classList.add('hidden');
    document.getElementById('link-note-existing-view').classList.remove('hidden');
    renderExistingNotesList('');
    // Foco na busca após reflow
    setTimeout(() => {
        const searchInput = document.getElementById('link-note-search');
        if (searchInput && notesDb.length > 10) searchInput.focus();
    }, 50);
}

// Volta da lista de existentes pra opções iniciais
window.backToLinkOptions = function() {
    document.getElementById('link-note-existing-view').classList.add('hidden');
    document.getElementById('link-note-options').classList.remove('hidden');
    const searchInput = document.getElementById('link-note-search');
    if (searchInput) searchInput.value = '';
}

// Renderiza lista de notas existentes (com filtro opcional)
window.renderExistingNotesList = function(filter) {
    const container = document.getElementById('link-note-existing-list');
    const searchWrapper = document.getElementById('link-note-search-wrapper');
    if (!container) return;
    
    // Esconder busca se ≤ 10 notas (Opção Híbrida Jules)
    if (notesDb.length <= 10) {
        searchWrapper.classList.add('hidden');
    } else {
        searchWrapper.classList.remove('hidden');
    }
    
    // Excluir notas já vinculadas ao bloco atual
    const block = db.find(b => b.id === activeLinkBlockId);
    const alreadyLinked = (block && block.linkedNoteIds) ? block.linkedNoteIds : [];
    
    // Filtro por título OU conteúdo (case insensitive)
    const f = (filter || '').toLowerCase().trim();
    const filtered = notesDb.filter(n => {
        if (alreadyLinked.includes(n.id)) return false;
        if (!f) return true;
        return (n.title || '').toLowerCase().includes(f) || (n.content || '').toLowerCase().includes(f);
    });
    
    if (filtered.length === 0) {
        const msg = notesDb.length === 0
            ? 'Você ainda não tem notas. Use "Criar nova" para começar.'
            : (alreadyLinked.length === notesDb.length
                ? 'Todas as suas notas já estão vinculadas a este card.'
                : 'Nenhuma nota encontrada com esse termo.');
        container.innerHTML = `<p class="text-xs text-zinc-400 text-center py-6 px-4">${msg}</p>`;
        return;
    }
    
    container.innerHTML = filtered.map(n => {
        const title = n.title ? escapeHtml(n.title) : '<span class="text-zinc-400 italic">Sem título</span>';
        const preview = (n.content || '').slice(0, 60) + ((n.content || '').length > 60 ? '…' : '');
        return `
            <button onclick="linkExistingNoteToBlock('${n.id}')" class="w-full text-left p-3 rounded-xl bg-zinc-50 border border-zinc-200 hover:bg-zinc-100 active:scale-[0.99] transition mb-1.5">
                <p class="text-sm font-bold text-zinc-800 truncate">${title}</p>
                ${preview ? `<p class="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">${escapeHtml(preview)}</p>` : ''}
            </button>
        `;
    }).join('');
}

// Vincula nota existente ao bloco
window.linkExistingNoteToBlock = function(noteId) {
    if (!activeLinkBlockId) return;
    const block = db.find(b => b.id === activeLinkBlockId);
    if (!block) return;
    if (!block.linkedNoteIds) block.linkedNoteIds = [];
    if (!block.linkedNoteIds.includes(noteId)) {
        block.linkedNoteIds.push(noteId);
        saveDb();
    }
    closeLinkNoteSheet();
    showToast('Nota vinculada!');
    renderTimeline();
}

// Abre modal de leitura ao tocar uma nota vinculada no card
window.viewLinkedNote = function(blockId, noteId, e) {
    if (e) e.stopPropagation();
    const note = notesDb.find(n => n.id === noteId);
    if (!note) return;
    
    viewingLinkedNoteId = noteId;
    viewingLinkedFromBlockId = blockId;
    
    document.getElementById('linked-note-view-title').innerText = note.title || 'Sem título';
    
    const contentEl = document.getElementById('linked-note-view-content');
    if (note.content) {
        contentEl.innerHTML = `<p class="text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap break-words">${escapeHtml(note.content)}</p>`;
    } else {
        contentEl.innerHTML = `<p class="text-xs text-zinc-400 italic">Esta nota está vazia.</p>`;
    }
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('linked-note-view-modal').classList.remove('hidden');
    document.getElementById('linked-note-view-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

window.closeLinkedNoteView = function() {
    viewingLinkedNoteId = null;
    viewingLinkedFromBlockId = null;
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
    document.getElementById('linked-note-view-modal').classList.add('hidden');
    document.getElementById('linked-note-view-modal').classList.remove('flex');
}

// Editar a nota vinculada inline (abre sheet de Notas com a nota em modo edição)
window.editLinkedNoteInline = function(noteId) {
    // V40.2.10: salva o noteId ANTES de fechar a view (closeLinkedNoteView zera viewingLinkedNoteId)
    // V40.2.11: alinhado ao pattern de chooseCreateNewNote — switchListTab + openEditNote ambos
    //          DENTRO do setTimeout (senão switchListTab zerava notesFormOpen e renderizava lista
    //          antes do openEditNote rodar). Tempo aumentado pra 320ms (igual chooseCreateNewNote)
    //          pra dar tempo da animação do modal fechar de verdade.
    // V40.2.14: chama closeAllSheets() pra garantir que NENHUMA outra sheet (reports/tags/config)
    //          fique aberta junto. Antes podia ficar reports-sheet + list-sheet sobrepostas.
    const targetNoteId = noteId || viewingLinkedNoteId;
    
    closeLinkedNoteView();
    closeAllSheets(); // V40.2.14: fecha TUDO antes de reabrir lista (evita 2 sheets visíveis)
    
    // Abre Lista → aba Notas → modo edição (tudo após animação)
    setTimeout(() => {
        document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('list-sheet').classList.remove('translate-y-full');
        switchListTab('notes');     // zera notesFormOpen e renderiza lista...
        openEditNote(targetNoteId); // ...mas openEditNote seta notesFormOpen=true e re-renderiza form
    }, 320);
}

// Desvincula nota do card (não apaga a nota, só remove o link)
window.unlinkNoteFromBlock = function() {
    if (!viewingLinkedNoteId || !viewingLinkedFromBlockId) return;
    const block = db.find(b => b.id === viewingLinkedFromBlockId);
    if (!block || !block.linkedNoteIds) return;
    block.linkedNoteIds = block.linkedNoteIds.filter(id => id !== viewingLinkedNoteId);
    saveDb();
    closeLinkedNoteView();
    showToast('Nota desvinculada (continua na aba Notas).');
    renderTimeline();
}

// =====================================================
// =====================================================
// V40.1.1 - SUPER GABINETE (abas Lista / Rotinas / Notas)
// Notas com 3 estados: empty / form / list
// =====================================================

function saveNotes() { localStorage.setItem('tb_notes_db', JSON.stringify(notesDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('notas'); } // V40.17.0: notas vão pra nuvem

// Helper: escapa HTML para evitar quebra de layout / XSS no innerHTML
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// V40.1.1: estado interno do form de nota (true = aberto)
let notesFormOpen = false;
// V40.1.2: ID da nota sendo editada (null = criando nova)
let editingNoteId = null;

window.switchListTab = function(tabName) {
    activeListTab = tabName;
    
    // V40.4.1: tabs agora inclui 'financial'. V40.20.0: + 'assistant' na frente (pílula só com o ícone, mais estreita).
    // V40.21.0: + 'goals' (Metas) no fim, também só com o ícone.
    const TABS = ['assistant', 'backlog', 'routines', 'notes', 'financial', 'goals'];
    
    // Atualizar pills
    TABS.forEach(t => {
        const btn = document.getElementById(`btn-list-${t}`);
        if (!btn) return;
        const size = t === 'assistant' || t === 'goals' ? 'flex-none w-9' : 'flex-1';
        if (t === tabName) {
            btn.className = size + ' py-1.5 rounded-lg bg-white shadow-sm text-zinc-800 text-xs font-bold transition border border-black/5 flex items-center justify-center gap-1';
        } else {
            btn.className = size + ' py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 text-xs font-bold transition border border-transparent flex items-center justify-center gap-1';
        }
    });
    
    // Mostrar view correspondente, esconder outras
    TABS.forEach(t => {
        const view = document.getElementById(`view-${t}`);
        if (!view) return;
        if (t === tabName) view.classList.remove('hidden');
        else view.classList.add('hidden');
    });
    
    // Render dinâmico ao trocar
    if (tabName === 'assistant') {
        notesFormOpen = false;
        editingNoteId = null;
        renderAssistant();
    } else if (tabName === 'notes') {
        notesFormOpen = false; // ao entrar na aba, sempre começa fechado
        editingNoteId = null;  // V40.1.2: garantir que não está em modo edição
        renderNotes();
    } else if (tabName === 'routines') {
        // V40.3 Fase 1: garante volta pra view-lista (não form) ao trocar de aba
        if (typeof closeRoutineForm === 'function') closeRoutineForm(true);
        if (typeof renderRoutinesList === 'function') renderRoutinesList();
        notesFormOpen = false;
        editingNoteId = null;
    } else if (tabName === 'backlog') {
        // V40.3.4: garante volta pra view-lista (não form) ao trocar de aba
        if (typeof closeBacklogForm === 'function') closeBacklogForm(true);
        notesFormOpen = false;
        editingNoteId = null;
    } else if (tabName === 'financial') {
        // V40.4.1: garante volta pra view-lista do financeiro
        if (typeof closeFinancialForm === 'function') closeFinancialForm(true);
        if (typeof renderFinancial === 'function') renderFinancial();
        notesFormOpen = false;
        editingNoteId = null;
    } else if (tabName === 'goals') {
        // V40.21.0: sempre começa na lista de metas (não no formulário)
        closeGoalForm(true);
        notesFormOpen = false;
        editingNoteId = null;
    } else {
        notesFormOpen = false; // ao sair da aba, garante que form fica fechado da próxima vez
        editingNoteId = null;  // V40.1.2: limpar modo edição ao sair
    }
    if (tabName === 'backlog') renderBacklog();
}

// =====================================================
// V40.20.0 — ASSISTENTE (primeira aba). O "cérebro" fica no assistente.js (o mesmo do PC): aqui só se monta o
// retrato dos dados do aparelho e se desenha a conversa. Versão padrão: frases prontas, sem IA paga e sem internet.
// A conversa fica só na memória (some ao fechar o app); "Recomeçar" volta pro resumo de agora.
// =====================================================
let assistantMsgs = [];
let assistantAuto = true; // só tem o resumo automático: ele se refaz com os dados de agora sempre que a aba abre
function assistantSnap() {
    const tagInfo = (id) => { const t = (tagsDb || []).find(x => x.id === id); return t ? { name: t.name, color: t.color } : null; };
    const cols = (backlogColumnsDb || []), colName = {};
    cols.forEach(c => { colName[c.id] = c.name; });
    const tasks = [];
    cols.forEach(c => (backlogDb || []).filter(it => getItemColumn(it) === c.id).forEach(it => tasks.push({ id: it.id, title: it.title, dur: Number(it.duration) || 0, list: c.name || 'Geral', tag: tagInfo(it.tagId) })));
    (backlogDb || []).filter(it => !colName[getItemColumn(it)]).forEach(it => tasks.push({ id: it.id, title: it.title, dur: Number(it.duration) || 0, list: 'Geral', tag: tagInfo(it.tagId) }));
    return {
        now: new Date(), hours: [START_HOUR, END_HOUR],
        blocks: (db || []).filter(b => b && b.date).map(b => ({ id: b.id, title: b.title, date: String(b.date).slice(0, 10), start: Number(b.startMin) || 0, dur: Number(b.duration) || 0, done: !!b.completed, tag: tagInfo(b.tagId), cards: isSublist(b) ? subCount(b) : null })),
        tasks: tasks,
        routines: (routinesDb || []).map(r => ({ id: r.id, title: r.title, emoji: r.emoji, dur: Number(r.duration) || 0 })),
        notes: (notesDb || []).map(n => ({ id: n.id, title: n.title, content: n.content, ms: Number(n.updatedAt || n.createdAt) || 0 })),
        expenses: (financialDb || []).map(f => {
            const ov = {};
            Object.keys(f.paidMonthsOverrides || {}).forEach(m => { const v = f.paidMonthsOverrides[m]; ov[m] = v && typeof v === 'object' ? v.amount : v; });
            return { id: f.id, title: f.title, amount: Number(f.amount) || 0, start: getItemStartMonth(f), months: f.durationMonths || 1, recurring: !!f.isRecurring, dueDay: f.dueDay || null,
                paid: Array.isArray(f.paidMonths) ? f.paidMonths : (f.paid === true ? [getItemStartMonth(f)] : []), overrides: ov };
        }),
        // V40.21.0: as metas já chegam prontas (progresso, estrelas, nível), calculadas pelo metas.js
        goals: window.FazMetas ? window.FazMetas.forAssistant(goalListsDb, goalsDb, goalAllDays(), new Date()) : null
    };
}
function assistantMsgHtml(m) {
    if (m.who === 'me') return `<div class="flex justify-end"><p class="max-w-[85%] bg-app-focus text-white text-sm leading-relaxed px-3.5 py-2 rounded-2xl rounded-br-md break-words">${escapeHtml(m.text)}</p></div>`;
    const a = m.a;
    const items = a.items.length ? `<div class="mt-2 -mx-1 border border-zinc-100 rounded-xl overflow-hidden divide-y divide-zinc-100">${a.items.map(it => {
        const dot = it.tone === 'now' ? 'bg-emerald-500' : it.tone === 'next' ? 'bg-app-focus' : it.tone === 'late' ? 'bg-red-500' : it.tone === 'done' ? 'bg-emerald-500' : 'bg-zinc-300';
        return `<div class="flex items-start gap-2.5 px-2.5 py-2"><span class="w-2 h-2 rounded-full mt-1.5 shrink-0 ${dot}"></span><span class="min-w-0"><span class="block text-[13px] font-bold ${it.tone === 'late' ? 'text-red-700' : 'text-zinc-800'} break-words">${escapeHtml(it.label)}</span>${it.sub ? `<span class="block text-[11px] text-zinc-500">${escapeHtml(it.sub)}</span>` : ''}</span></div>`;
    }).join('')}</div>` : '';
    return `<div class="flex items-start gap-2"><div class="w-7 h-7 rounded-full bg-app-focus text-white flex items-center justify-center shrink-0 mt-0.5"><i class="ph-fill ph-sparkle text-sm"></i></div>` +
        `<div class="min-w-0 flex-1 bg-white border border-zinc-200 rounded-2xl rounded-tl-md px-3.5 py-2.5 shadow-sm"><p class="text-sm leading-relaxed text-zinc-800">${escapeHtml(a.text)}</p>${items}` +
        `${a.footer ? `<p class="mt-2 text-[11.5px] text-zinc-500 leading-relaxed">${escapeHtml(a.footer)}</p>` : ''}</div></div>`;
}
window.renderAssistant = function() {
    const feed = document.getElementById('assistant-feed');
    if (!feed) return;
    const A = window.FazAssistente;
    if (!A) { feed.innerHTML = '<p class="text-sm text-zinc-500">Não consegui abrir o assistente. Feche e abra o app de novo.</p>'; return; }
    document.getElementById('assistant-name').innerText = A.NAME;
    const chips = document.getElementById('assistant-chips');
    if (!chips.firstChild) chips.innerHTML = A.CHIPS.map(c => `<button type="button" onclick="assistantChip('${c.id}')" class="shrink-0 whitespace-nowrap bg-white border border-zinc-200 text-zinc-700 text-xs font-bold px-3 py-1.5 rounded-full active:scale-95 transition">${escapeHtml(c.label)}</button>`).join('');
    if (assistantAuto || !assistantMsgs.length) { assistantMsgs = [{ who: 'as', a: A.briefing(assistantSnap()) }]; assistantAuto = true; }
    feed.innerHTML = assistantMsgs.map(assistantMsgHtml).join('');
    feed.scrollTop = feed.scrollHeight;
};
function assistantAsk(text, intent) {
    const A = window.FazAssistente;
    if (!A) return;
    const snap = assistantSnap(), a = intent ? A.reply(intent, snap) : A.ask(text, snap);
    if (!a) return;
    assistantAuto = false;
    assistantMsgs.push({ who: 'me', text: text }, { who: 'as', a: a });
    if (assistantMsgs.length > 60) assistantMsgs = assistantMsgs.slice(-60);
    renderAssistant();
}
window.assistantChip = function(id) {
    const c = window.FazAssistente && window.FazAssistente.CHIPS.find(x => x.id === id);
    if (c) assistantAsk(c.label, c.id);
};
window.assistantSend = function(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('assistant-input');
    const v = input.value.trim();
    if (!v) return;
    input.value = '';
    assistantAsk(v);
};
window.assistantRestart = function() {
    assistantMsgs = [];
    assistantAuto = true;
    renderAssistant();
};

// =====================================================
// V40.21.0 — METAS (etapa 1). As regras ficam no metas.js (as mesmas do PC e do Assistente): listas (Pessoal,
// Profissional, Financeiro e as que a pessoa criar), metas por dia, semana ou mês contadas em vezes, minutos ou
// reais, o botão "+" de cada meta, ⭐ estrelas, 🔥 sequência, pontos e níveis.
//   tb_goal_lists [{ id, name, isDefault, createdAt }]
//   tb_goals_db   [{ id, listId, title, emoji, period, unit, target, step, createdAt }]
//   tb_goal_days  [{ id: <meta>_<AAAAMMDD>, goalId, date, amount, target }]   (o quanto foi feito em cada dia)
// Etapa 2 (depois): cartões da agenda e das Listas ligados a uma meta, e gráficos.
// =====================================================
let goalListsDb = fazLoadList('tb_goal_lists', []);
let goalsDb = fazLoadList('tb_goals_db', []);
let goalDaysDb = fazLoadList('tb_goal_days', []);
let activeGoalListId = null; // V40.23.0: última categoria usada (a meta nova já vem nela)
let goalListMenuId = null;   // categoria com o menu (Renomear / Apagar) aberto
let goalListNameFromForm = false; // "+ Nova" dentro do formulário da meta: a categoria criada já fica escolhida
let goalEditId = null;       // meta aberta no formulário (null = nova)
let goalForm = null;         // { listId, period, unit, stepTouched, targetTouched }
let goalListNameMode = null; // 'create' | 'rename'
let _goalConfirmAction = null;
function saveGoalLists() { localStorage.setItem('tb_goal_lists', JSON.stringify(goalListsDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('metas_listas'); }
function saveGoals() { localStorage.setItem('tb_goals_db', JSON.stringify(goalsDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('metas'); goalBadgesSoon(); }
// V40.34.0: meta criada, renomeada, com emoji novo ou apagada (aqui, pela nuvem ou pelo desfazer): os selos da agenda, da
// Lista e das rotinas acompanham (um redesenho só, logo depois)
var goalBadgesT = null;
function goalBadgesSoon() {
    clearTimeout(goalBadgesT);
    goalBadgesT = setTimeout(() => {
        try { if (typeof renderTimeline === 'function') renderTimeline(); } catch (e) {}
        try { if (typeof renderBacklog === 'function') renderBacklog(); } catch (e) {}
        try { if (typeof window.renderRoutinesList === 'function') window.renderRoutinesList(); } catch (e) {}
    }, 0);
}
function saveGoalDays() { localStorage.setItem('tb_goal_days', JSON.stringify(goalDaysDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('metas_dias'); }
const GOAL_SAFE_ID = /^[\w.\-]{1,64}$/;
function goalJsId(id) { return GOAL_SAFE_ID.test(String(id)) ? String(id) : ''; } // id que entra num onclick
// Sem nenhuma lista (primeira vez): cria Pessoal, Profissional e Financeiro (os mesmos ids do PC: nunca duplicam).
function ensureGoalLists() {
    const M = window.FazMetas;
    if (!M || goalListsDb.length) return false;
    const now = Date.now();
    goalListsDb = M.DEFAULT_LISTS.map(l => ({ id: l.id, name: l.name, isDefault: true, createdAt: now }));
    undoQuiet(saveGoalLists); // V40.25.0: as categorias que nascem sozinhas não viram passo do Desfazer
    return true;
}
function newGoalId(prefix, list) { let n = Date.now(); while (list.some(x => x.id === prefix + n)) n++; return prefix + n; }
function parseGoalNumber(v) { // "1,5", "1.5", "R$ 1.234,56" → número com 2 casas (ou NaN)
    let t = String(v == null ? '' : v).replace(/R\$|\s/g, '');
    if (!t) return NaN;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
    return Math.round(Number(t) * 100) / 100;
}
function goalNumField(n) { return String(Math.round((Number(n) || 0) * 100) / 100).replace('.', ','); }
function goalTodayAmount(goalId) {
    const M = window.FazMetas, d = goalDaysDb.find(x => x.id === M.dayId(goalId, M.ymd(new Date())));
    return d ? Number(d.amount) || 0 : 0;
}

function goalCardHtml(g, x, M) {
    const done = x.complete, id = goalJsId(g.id), badges = [];
    if (x.streak) badges.push('🔥 ' + x.streak);
    if (x.stars) badges.push('⭐ ' + x.stars);
    const minus = goalTodayAmount(g.id) > 0
        ? `<button type="button" onclick="goalBump('${id}', -1)" aria-label="Desfazer o último +" class="w-8 h-9 rounded-xl text-zinc-400 hover:bg-zinc-100 flex items-center justify-center active:scale-90 transition"><i class="ph-bold ph-minus text-sm"></i></button>` : '';
    return `<div class="bg-white border ${done ? 'border-emerald-200' : 'border-zinc-200'} rounded-2xl p-3 mb-2.5 shadow-sm flex items-center gap-2" data-goal="${escapeHtml(g.id)}">` +
        `<button type="button" onclick="openGoalForm('${id}')" class="flex-1 min-w-0 flex items-center gap-3 text-left">` +
        `<span class="w-10 h-10 rounded-xl ${done ? 'bg-emerald-50' : 'bg-zinc-100'} flex items-center justify-center text-xl shrink-0">${escapeHtml(g.emoji || '🎯')}</span>` +
        `<span class="min-w-0 flex-1"><span class="block text-sm font-bold text-zinc-800 truncate">${escapeHtml(g.title || 'Sem nome')}</span>` +
        `<span class="goal-status block text-[11px] ${done ? 'text-emerald-600 font-bold' : 'text-zinc-500'} truncate">${done ? '✓ ' : ''}${escapeHtml(x.text)}${badges.length ? ' · ' + badges.join(' · ') : ''}</span>` +
        `<span class="block mt-1.5 h-1.5 rounded-full bg-zinc-100 overflow-hidden"><span class="block h-full rounded-full ${done ? 'bg-emerald-500' : 'bg-app-focus'}" style="width:${Math.round(x.pct * 100)}%"></span></span></span></button>` +
        `<div class="flex items-center gap-0.5 shrink-0">${minus}<button type="button" onclick="goalBump('${id}', 1)" class="goal-plus h-9 min-w-[44px] px-2.5 rounded-xl ${done ? 'bg-emerald-500' : 'bg-app-focus'} text-white text-xs font-bold active:scale-95 transition">${escapeHtml(M.addLabel(g))}</button></div></div>`;
}
// V40.23.0: uma lista só, com um título por categoria (como as Rotinas: nada de pílulas nem colunas)
window.renderGoals = function() {
    const wrap = document.getElementById('goals-container');
    if (!wrap) return;
    const M = window.FazMetas;
    if (!M) { wrap.innerHTML = '<p class="text-sm text-zinc-500 py-6 text-center">Não consegui abrir as metas. Feche e abra o app de novo.</p>'; return; }
    ensureGoalLists();
    const now = new Date(), sum = M.summary(goalsDb, goalAllDays(), now), st = {};
    sum.statuses.forEach(x => { st[x.goal.id] = x; });

    // nível
    document.getElementById('goals-level-n').textContent = sum.level;
    document.getElementById('goals-level-name').textContent = sum.name;
    document.getElementById('goals-points').textContent = sum.points + (sum.points === 1 ? ' ponto' : ' pontos');
    document.getElementById('goals-level-bar').style.width = Math.round(sum.pct * 100) + '%';
    const sub = ['⭐ ' + sum.stars];
    if (sum.todayTotal) sub.push('hoje ' + sum.todayDone + ' de ' + sum.todayTotal);
    sub.push('faltam ' + sum.toNext + ' pro nível ' + (sum.level + 1));
    document.getElementById('goals-level-sub').textContent = sub.join(' · ');

    // as metas de cada categoria, na ordem das categorias
    const by = {};
    goalListsDb.forEach(l => { by[l.id] = []; });
    goalsDb.forEach(g => { const l = M.listOf(g, goalListsDb); if (l) by[l].push(g); });
    let html = goalsDb.length ? '' : `<p class="text-xs text-zinc-500 leading-relaxed px-1 pb-1">Crie sua primeira meta: beber água, correr, meditar, ler, guardar dinheiro... Toque no <b>+</b> dela quando fizer e ganhe ⭐ estrelas e pontos.</p>`;
    goalListsDb.forEach(l => {
        const goals = by[l.id], id = goalJsId(l.id), name = escapeHtml(l.name || 'Sem nome');
        html += `<section class="goal-section" data-goal-list="${escapeHtml(l.id)}">` +
            `<div class="flex items-center gap-2 px-1 pt-3 pb-2"><h3 class="min-w-0 truncate text-[11px] font-bold uppercase tracking-wider text-zinc-500">${name}</h3>` +
            `<span class="text-[11px] font-bold text-zinc-400">${goals.length}</span>` +
            `<button type="button" onclick="openGoalListMenu('${id}')" aria-label="Opções da categoria ${name}" class="goal-section-menu ml-auto w-8 h-8 -mr-1 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded-lg active:scale-90 transition"><i class="ph-bold ph-dots-three text-base"></i></button></div>` +
            goals.map(g => goalCardHtml(g, st[g.id], M)).join('') +
            // V40.36.1: o atalho fica em toda categoria, não só na vazia (sem ele parecia que só cabia uma meta por categoria)
            `<button type="button" onclick="openGoalForm(null, '${id}')" class="goal-section-add w-full mb-2.5 ${goals.length ? 'py-2.5' : 'py-3'} rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-400 text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"><i class="ph ph-plus"></i> Meta em ${name}</button>` +
            `</section>`;
    });
    html += `<button type="button" onclick="openCreateGoalList()" class="goal-new-cat mt-1 mb-2 mx-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-100 active:scale-95 transition"><i class="ph ph-folder-plus text-sm"></i> Nova categoria</button>`;
    wrap.innerHTML = html;
};
// "+" (ou "−") na meta: soma no dia de hoje. Cumpriu? Estrela e pontos (e às vezes um nível novo).
window.goalBump = function(id, dir) {
    const M = window.FazMetas, g = goalsDb.find(x => x.id === id);
    if (!M || !g) return;
    const now = new Date(), before = M.summary(goalsDb, goalAllDays(), now);
    const r = M.bump(goalDaysDb, g, M.ymd(now), (dir < 0 ? -1 : 1) * M.normalize(g).step);
    if (!r.changed) return;
    goalDaysDb = r.days;
    saveGoalDays();
    const msg = dir > 0 ? M.gainText(M.gain(before, M.summary(goalsDb, goalAllDays(), now))) : '';
    renderGoals();
    if (msg) {
        showToast(msg, 'win');
        try { if (navigator.vibrate) navigator.vibrate([25, 40, 25]); } catch (e) {}
    }
};

// =====================================================
// V40.34.0 — METAS ETAPA 2: bloco, tarefa, rotina e cartão da sublista ligados a uma meta (goalId).
// Concluir um bloco (ou cartão) ligado conta na meta, no dia dele, como um toque no "+" (em minutos, o tempo dele).
// Nada é gravado nos dias da meta por isso: as contas somam os "dias de mentira" dos blocos (metas.js: autoDays).
// Arquivado continua contando; apagado deixa de contar. A tarefa e a rotina só levam a meta pro bloco que virarem.
// =====================================================
function goalBlocks() { // blocos do celular + os arquivados
    let arch = [];
    try { arch = archiveDb.filter(a => a && a.kind === 'bloco' && a.item).map(a => a.item); } catch (e) {}
    return db.concat(arch);
}
function goalAllDays() { const M = window.FazMetas; return M ? M.withAuto(goalDaysDb, goalsDb, goalBlocks()) : goalDaysDb; }
function goalById(id) { return id ? goalsDb.find(g => g.id === id) || null : null; }
function goalKeep(id) { return goalById(id) ? id : null; } // meta apagada (aqui ou no PC) vale como "sem meta"
function goalBadge(id) {
    const g = goalById(id);
    return g ? `<span class="goal-badge" title="Meta: ${escapeHtml(g.title || 'Sem nome')}" aria-label="Meta: ${escapeHtml(g.title || 'Sem nome')}">${escapeHtml(g.emoji || '🎯')}</span>` : '';
}
// Chips pra escolher a meta (como os das tags): "Sem meta" + as metas, na ordem das categorias.
function goalPickHtml(sel, fn) {
    const M = window.FazMetas;
    sel = goalKeep(sel);
    const on = 'bg-app-focus border-app-focus text-white shadow-md', off = 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100';
    let html = `<button type="button" onclick="${fn}('')" data-goal-pick="" class="shrink-0 px-3.5 py-2 rounded-full border text-xs font-bold transition whitespace-nowrap ${!sel ? on : off}">Sem meta</button>`;
    const order = M ? goalListsDb.map(l => l.id) : [];
    const goals = goalsDb.slice().sort((a, b) => (order.indexOf(M ? M.listOf(a, goalListsDb) : '') - order.indexOf(M ? M.listOf(b, goalListsDb) : '')));
    goals.forEach(g => {
        const id = goalJsId(g.id);
        if (!id) return;
        html += `<button type="button" onclick="${fn}('${id}')" data-goal-pick="${escapeHtml(g.id)}" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full border text-xs font-bold transition whitespace-nowrap ${sel === g.id ? on : off}"><span class="text-sm leading-none">${escapeHtml(g.emoji || '🎯')}</span>${escapeHtml(g.title || 'Sem nome')}</button>`;
    });
    return html;
}
// Linha "Meta" de um formulário: some quando não existe meta nenhuma.
function goalPickFill(wrapId, boxId, sel, fn) {
    const wrap = document.getElementById(wrapId), box = document.getElementById(boxId);
    if (!wrap || !box) return;
    const show = goalsDb.length > 0;
    wrap.classList.toggle('hidden', !show);
    box.innerHTML = show ? goalPickHtml(sel, fn) : '';
}
// Concluiu um bloco/cartão ligado e a meta foi cumprida: o mesmo aviso do "+".
function goalWatch(fn) {
    const M = window.FazMetas;
    if (!M || !goalsDb.length) return fn();
    const now = new Date(), before = M.summary(goalsDb, goalAllDays(), now);
    const r = fn();
    const msg = M.gainText(M.gain(before, M.summary(goalsDb, goalAllDays(), now)));
    if (msg) {
        showToast(msg, 'win');
        try { if (navigator.vibrate) navigator.vibrate([25, 40, 25]); } catch (e) {}
    }
    return r;
}
// Gráfico da meta (no formulário dela): barras dos últimos 7 dias, 8 semanas ou 6 meses, com o alvo de cada um.
function goalChartHtml(g) {
    const M = window.FazMetas, now = new Date(), days = goalAllDays();
    const hist = M.history(g, days, now), rec = M.records(g, days, now), x = M.status(g, days, now);
    const top = Math.max(1, ...hist.map(h => Math.max(h.total, h.target)));
    const per = g.period === 'semana' ? 'Últimas 8 semanas' : g.period === 'mes' ? 'Últimos 6 meses' : 'Últimos 7 dias';
    const bars = hist.map(h => {
        const hp = Math.round(Math.min(1, h.total / top) * 100), tp = Math.round(Math.min(1, h.target / top) * 100);
        const cls = h.met ? 'bg-emerald-500' : h.current ? 'bg-app-focus' : 'bg-zinc-300';
        return `<div class="goal-bar-col flex-1 min-w-0 flex flex-col items-center gap-1" data-goal-bar="${h.key}" title="${escapeHtml(h.label + (h.sub ? ' ' + h.sub : '') + ': ' + h.text)}" aria-label="${escapeHtml(h.label + (h.sub ? ' ' + h.sub : '') + ': ' + h.text)}">` +
            `<div class="relative w-full h-24 flex items-end justify-center"><div class="goal-bar w-[62%] max-w-[26px] rounded-t-md ${cls}" style="height:${h.total > 0 ? Math.max(4, hp) : 0}%"></div>` +
            `<div class="goal-bar-target absolute left-[12%] right-[12%] border-t-2 border-dashed border-zinc-400/70" style="bottom:${tp}%"></div></div>` +
            `<span class="text-[10px] leading-none font-bold ${h.current ? 'text-zinc-800' : 'text-zinc-400'}">${escapeHtml(h.label)}</span>` +
            (h.sub ? `<span class="text-[10px] leading-none ${h.current ? 'text-zinc-700 font-bold' : 'text-zinc-400'}">${escapeHtml(h.sub)}</span>` : '') + `</div>`;
    }).join('');
    const stats = [];
    if (rec.best) stats.push('🏆 Melhor: ' + rec.bestText);
    if (x.streak) stats.push('🔥 ' + M.streakLabel(g.period, x.streak));
    stats.push('⭐ ' + x.stars);
    stats.push('Total: ' + rec.totalText);
    return `<div class="flex items-center justify-between mb-2"><span class="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">${per}</span>` +
        `<span class="goal-chart-now text-[11px] font-bold ${x.complete ? 'text-emerald-600' : 'text-zinc-600'}">${escapeHtml(x.text)}</span></div>` +
        `<div class="goal-bars flex items-end gap-1.5">${bars}</div>` +
        `<p class="goal-chart-stats mt-2.5 text-[11px] text-zinc-500 leading-relaxed">${escapeHtml(stats.join(' · '))}</p>` +
        `<p class="mt-1 text-[10.5px] text-zinc-400 leading-relaxed">A linha tracejada é a meta. Blocos ligados a ela contam sozinhos quando você conclui.</p>`;
}

// ---------- formulário (criar / editar meta) ----------
function goalFormUi() {
    const M = window.FazMetas, f = goalForm;
    ['dia', 'semana', 'mes'].forEach(p => {
        const b = document.getElementById('goal-period-' + p), on = f.period === p;
        b.className = 'flex-1 py-2.5 rounded-lg border text-xs font-bold transition active:scale-95 ' + (on ? 'bg-app-focus text-white border-app-focus' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100');
    });
    ['vezes', 'minutos', 'reais'].forEach(u => {
        const b = document.getElementById('goal-unit-' + u), on = f.unit === u;
        b.className = 'flex-1 py-2.5 rounded-lg border text-xs font-bold transition active:scale-95 ' + (on ? 'bg-app-focus text-white border-app-focus' : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100');
    });
    document.getElementById('goal-list-options').innerHTML = goalListsDb.map(l => {
        const on = l.id === f.listId;
        return `<button type="button" onclick="selectGoalFormList('${goalJsId(l.id)}')" class="px-3 py-2 rounded-lg border text-xs font-bold transition active:scale-95 ${on ? 'bg-app-focus text-white border-app-focus' : 'bg-zinc-50 text-zinc-600 border-zinc-200'}">${escapeHtml(l.name || 'Sem nome')}</button>`;
    }).join('') + `<button type="button" onclick="openCreateGoalList(true)" class="px-3 py-2 rounded-lg border border-dashed border-zinc-300 text-xs font-bold text-zinc-500 transition active:scale-95"><i class="ph ph-plus"></i> Nova</button>`;
    const per = M.PERIODS[f.period].per, unit = f.unit;
    document.getElementById('goal-target-suffix').textContent = (unit === 'vezes' ? 'vezes ' : unit === 'minutos' ? 'minutos ' : 'reais ') + per;
    document.getElementById('goal-step-suffix').textContent = unit === 'vezes' ? 'vez(es) por toque' : unit === 'minutos' ? 'minutos por toque' : 'reais por toque';
    const pts = M.PERIODS[f.period].points;
    document.getElementById('goal-points-info').innerHTML = `<i class="ph-fill ph-star text-amber-400"></i> Cada ${f.period === 'dia' ? 'dia' : f.period === 'semana' ? 'semana' : 'mês'} cumprido vale uma estrela e <b>${pts} pontos</b>.`;
}
window.openGoalForm = function(id, listId) {
    const M = window.FazMetas;
    if (!M) return;
    ensureGoalLists();
    const g = id ? goalsDb.find(x => x.id === id) : null;
    if (id && !g) return;
    goalEditId = g ? g.id : null;
    const n = g ? M.normalize(g) : null;
    goalForm = {
        listId: g ? M.listOf(g, goalListsDb) : [listId, activeGoalListId].find(x => goalListsDb.some(l => l.id === x)) || goalListsDb[0].id, // V40.23.0: a categoria tocada, ou a última usada
        period: n ? n.period : 'dia', unit: n ? n.unit : 'vezes', stepTouched: !!g, targetTouched: !!g
    }; // "touched": alvo/passo que a pessoa já escolheu (editando, sugestão ou digitando) não mudam ao trocar a medida
    document.getElementById('goal-form-title').textContent = g ? 'Editar meta' : 'Nova meta';
    document.getElementById('goal-title-input').value = g ? (g.title || '') : '';
    document.getElementById('goal-emoji-input').value = g ? (g.emoji || '') : '';
    document.getElementById('goal-target-input').value = goalNumField(n ? n.target : M.UNITS.vezes.target);
    document.getElementById('goal-step-input').value = goalNumField(n ? n.step : M.UNITS.vezes.step);
    const del = document.getElementById('goal-form-delete-btn');
    del.classList.toggle('hidden', !g);
    del.classList.toggle('flex', !!g);
    document.getElementById('goal-templates-wrap').classList.toggle('hidden', !!g);
    const chart = document.getElementById('goal-chart-wrap'); // V40.34.0: o gráfico da meta
    chart.classList.toggle('hidden', !g);
    document.getElementById('goal-chart').innerHTML = g ? goalChartHtml(g) : '';
    if (!g) document.getElementById('goal-templates').innerHTML = M.TEMPLATES.map((t, i) =>
        `<button type="button" onclick="applyGoalTemplate(${i})" class="shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-bold text-zinc-700 active:scale-95 transition"><span class="text-base leading-none">${t.emoji}</span>${escapeHtml(t.title)}</button>`).join('');
    goalFormUi();
    document.getElementById('goals-list-view').classList.add('hidden');
    const form = document.getElementById('goals-form-view');
    form.classList.remove('hidden');
    form.classList.add('flex');
    const scroller = form.querySelector('.overflow-y-auto'); // V40.34.0: abre sempre do topo (o gráfico fica lá em cima)
    if (scroller) scroller.scrollTop = 0;
    // Regra de Ouro: sem .focus() programático (o teclado do Android empurra a tela)
};
window.closeGoalForm = function(silent) {
    const form = document.getElementById('goals-form-view');
    if (form) { form.classList.add('hidden'); form.classList.remove('flex'); }
    const list = document.getElementById('goals-list-view');
    if (list) list.classList.remove('hidden');
    goalEditId = null;
    goalForm = null;
    renderGoals();
};
window.selectGoalFormList = function(id) { if (!goalForm) return; goalForm.listId = id; goalFormUi(); };
window.goalFieldTouched = function() { if (goalForm) goalForm.targetTouched = goalForm.stepTouched = true; }; // digitou: trocar a medida não apaga
window.selectGoalPeriod = function(p) { if (!goalForm || !Object.prototype.hasOwnProperty.call(window.FazMetas.PERIODS, p)) return; goalForm.period = p; goalFormUi(); };
window.selectGoalUnit = function(u) {
    const M = window.FazMetas;
    if (!goalForm || !Object.prototype.hasOwnProperty.call(M.UNITS, u) || goalForm.unit === u) return;
    goalForm.unit = u;
    // trocou a medida: alvo e passo que a pessoa não mexeu vão pro padrão da medida nova (ex.: 30 minutos, +15)
    if (!goalForm.targetTouched) document.getElementById('goal-target-input').value = goalNumField(M.UNITS[u].target);
    if (!goalForm.stepTouched) document.getElementById('goal-step-input').value = goalNumField(M.UNITS[u].step);
    goalFormUi();
};
window.applyGoalTemplate = function(i) {
    const M = window.FazMetas, t = M && M.TEMPLATES[i];
    if (!t || !goalForm) return;
    document.getElementById('goal-title-input').value = t.title;
    document.getElementById('goal-emoji-input').value = t.emoji;
    document.getElementById('goal-target-input').value = goalNumField(t.target);
    document.getElementById('goal-step-input').value = goalNumField(t.step);
    goalForm.period = t.period;
    goalForm.unit = t.unit;
    goalForm.targetTouched = goalForm.stepTouched = true;
    if (goalListsDb.some(l => l.id === t.listId)) goalForm.listId = t.listId;
    goalFormUi();
};
window.saveGoalForm = function() {
    const M = window.FazMetas;
    if (!M || !goalForm) return;
    const title = document.getElementById('goal-title-input').value.trim();
    if (!title) return showToast('Dê um nome pra meta.');
    const target = parseGoalNumber(document.getElementById('goal-target-input').value);
    if (!(target > 0) || target > M.MAX) return showToast('Informe a meta: um número maior que zero.');
    const step = parseGoalNumber(document.getElementById('goal-step-input').value);
    if (!(step > 0) || step > M.MAX) return showToast('Informe quanto cada + soma: um número maior que zero.');
    const data = { listId: goalListsDb.some(l => l.id === goalForm.listId) ? goalForm.listId : goalListsDb[0].id, title: title.slice(0, 60),
        emoji: M.firstGrapheme(document.getElementById('goal-emoji-input').value), period: goalForm.period, unit: goalForm.unit, target: target, step: step };
    if (!goalEditId) {
        goalsDb.push(Object.assign({ id: newGoalId('meta_', goalsDb) }, data, { createdAt: Date.now() }));
        saveGoals();
        activeGoalListId = data.listId;
        closeGoalForm(true);
        return showToast('Meta criada! 🎯');
    }
    const g = goalsDb.find(x => x.id === goalEditId);
    if (!g) { closeGoalForm(true); return showToast('Essa meta foi apagada em outro aparelho.'); }
    const n = M.normalize(g), restart = n.period !== data.period || n.unit !== data.unit;
    const apply = () => {
        const cur = goalsDb.find(x => x.id === g.id);
        if (!cur) return;
        if (cur.listId !== data.listId) goalsDb = goalsDb.filter(x => x !== cur).concat([cur]); // mudou de lista: vai pro fim dela (igual ao PC)
        // V40.34.0: subiu ou baixou o alvo (sem recomeçar): os períodos que já passaram e só tinham blocos ligados
        // guardam o alvo antigo (senão a estrela deles mudaria junto)
        const marks = !restart && M.normalize(cur).target !== data.target ? M.targetMarks(cur, goalDaysDb, M.autoDays([cur], goalBlocks()), new Date()) : [];
        Object.assign(cur, data);
        if (restart) cur.countFrom = M.ymd(new Date()); // V40.34.0: blocos concluídos antes de hoje param de contar
        saveGoals();
        if (restart) { goalDaysDb = goalDaysDb.filter(d => d.goalId !== cur.id); saveGoalDays(); }
        else if (marks.length) { marks.forEach(row => { const i = goalDaysDb.findIndex(d => d.id === row.id); if (i >= 0) goalDaysDb[i] = Object.assign({}, goalDaysDb[i], row); else goalDaysDb.push(row); }); saveGoalDays(); }
        activeGoalListId = data.listId;
        closeGoalForm(true);
        showToast(restart ? 'Meta salva. A contagem recomeçou.' : 'Meta salva!');
    };
    if (!restart || !goalAllDays().some(d => d.goalId === g.id && Number(d.amount) > 0)) return apply();
    askGoalConfirm('Mudar a frequência ou a medida?', 'A contagem desta meta recomeça do zero: o que já foi marcado e as estrelas dela saem da pontuação.', 'Mudar e recomeçar', apply);
};
window.deleteGoalFromForm = function() {
    const M = window.FazMetas, g = goalEditId && goalsDb.find(x => x.id === goalEditId);
    if (!M || !g) return;
    const x = M.status(g, goalAllDays(), new Date());
    askGoalConfirm('Apagar a meta "' + (g.title || 'Sem nome') + '"?',
        x.stars ? 'Ela tem ⭐ ' + x.stars + (x.stars === 1 ? ' estrela' : ' estrelas') + ' (' + x.points + ' pontos), que saem da sua pontuação. Some aqui e no computador.' : 'Ela some aqui e no computador.',
        'Apagar meta', () => {
            goalsDb = goalsDb.filter(m => m.id !== g.id);
            goalDaysDb = goalDaysDb.filter(d => d.goalId !== g.id);
            saveGoals();
            saveGoalDays();
            closeGoalForm(true);
            showToast('Meta apagada');
        });
};

// ---------- categorias das metas (V40.23.0: o que era "lista"; os dados continuam os mesmos) ----------
window.openGoalListMenu = function(id) {
    const l = goalListsDb.find(x => x.id === id);
    if (!l) return;
    goalListMenuId = l.id;
    document.getElementById('goal-list-menu-title').textContent = l.name || 'Categoria';
    // V40.37.0: "Pôr na agenda" diz o que vai na sublista (ou que ainda não tem meta)
    const goals = goalListGoals(l.id), btn = document.getElementById('goal-list-agenda-btn');
    btn.disabled = !goals.length;
    document.getElementById('goal-list-agenda-sub').textContent = goals.length
        ? 'Uma sublista com ' + (goals.length === 1 ? '1 cartão' : goals.length + ' cartões') + ': ' + goals.slice(0, 3).map(g => g.title || 'Meta').join(', ') + (goals.length > 3 ? '…' : '')
        : 'Crie uma meta aqui primeiro';
    showModal('goal-list-menu-modal');
};
// V40.37.0 — SUBLISTA DE METAS. Ideia dele (22/11): pôr as metas de uma categoria juntas num horário só ("um copo de
// água não leva 5 minutos"). "Pôr na agenda" no menu da categoria: uma sublista com o nome da categoria e um cartão por
// meta (nome da meta, ligado a ela: marcar o cartão conta 1 vez, ou o passo, como todo cartão ligado). Vai pra mão como
// o Copiar (30 min, dá pra mudar na faixa) e entra no Tempo Livre que for tocado. Com o Repetir, vai pros outros dias.
// O mesmo do PC (mtToAgenda).
function goalListGoals(listId) {
    const M = window.FazMetas;
    return M ? goalsDb.filter(g => M.listOf(g, goalListsDb) === listId).slice(0, SUB_MAX) : [];
}
window.goalListToAgenda = function() {
    const l = goalListsDb.find(x => x.id === goalListMenuId), goals = l ? goalListGoals(l.id) : [];
    if (!l) return hideModal('goal-list-menu-modal');
    if (!goals.length) return showToast('Essa categoria ainda não tem metas.');
    hideModal('goal-list-menu-modal');
    closeAllSheets();
    if (searchQuery) closeSearchBar();
    const title = String(l.name || '').trim().slice(0, 60) || 'Metas';
    pendingIntent = { title: title, duration: 30, theme: 'focus', tagId: null,
        cards: goals.map(g => ({ id: subNewId(), title: String(g.title || 'Meta').slice(0, 200), done: false, microblocks: [], goalId: g.id })) };
    selectedDur = 30;
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    renderTimeline();
    showToast('Toque num Tempo Livre pra colocar a sublista 👇');
};
window.openCreateGoalList = function(fromForm) {
    goalListNameMode = 'create';
    goalListNameFromForm = fromForm === true;
    document.getElementById('goal-list-name-title').textContent = 'Nova categoria';
    document.getElementById('goal-list-name-input').value = '';
    showModal('goal-list-name-modal');
};
window.openRenameGoalList = function() {
    const l = goalListsDb.find(x => x.id === goalListMenuId);
    hideModal('goal-list-menu-modal');
    if (!l) return;
    goalListNameMode = 'rename';
    goalListNameFromForm = false;
    document.getElementById('goal-list-name-title').textContent = 'Renomear categoria';
    document.getElementById('goal-list-name-input').value = l.name || '';
    showModal('goal-list-name-modal');
};
window.confirmGoalListName = function() {
    const name = document.getElementById('goal-list-name-input').value.trim();
    if (!name) return showToast('Dê um nome pra categoria.');
    if (name.length > 30) return showToast('Nome muito longo (máx 30).');
    if (goalListNameMode === 'create') {
        const l = { id: newGoalId('gl_', goalListsDb), name: name, isDefault: false, createdAt: Date.now() };
        goalListsDb.push(l);
        activeGoalListId = l.id;
        if (goalListNameFromForm && goalForm) { goalForm.listId = l.id; goalFormUi(); } // criada de dentro da meta: já fica escolhida
        showToast('Categoria criada!');
    } else {
        const l = goalListsDb.find(x => x.id === goalListMenuId);
        if (l) l.name = name;
        showToast('Categoria renomeada!');
    }
    goalListNameFromForm = false;
    saveGoalLists();
    hideModal('goal-list-name-modal');
    renderGoals();
};
window.openDeleteGoalList = function() {
    const M = window.FazMetas, l = goalListsDb.find(x => x.id === goalListMenuId);
    hideModal('goal-list-menu-modal');
    if (!M || !l) return;
    if (goalListsDb.length <= 1) return showToast('Precisa ter pelo menos uma categoria.');
    const goals = goalsDb.filter(g => M.listOf(g, goalListsDb) === l.id);
    const stars = goals.reduce((a, g) => a + M.status(g, goalAllDays(), new Date()).stars, 0);
    askGoalConfirm('Apagar a categoria "' + (l.name || 'Sem nome') + '"?',
        !goals.length ? 'Ela está vazia. Some aqui e no computador.'
            : (goals.length === 1 ? 'A meta dela também será apagada' : 'As ' + goals.length + ' metas dela também serão apagadas') + (stars ? ' (e as ⭐ ' + stars + ' saem da pontuação)' : '') + ', aqui e no computador.',
        'Apagar categoria', () => {
            const ids = {};
            goals.forEach(g => { ids[g.id] = true; });
            goalsDb = goalsDb.filter(g => !ids[g.id]);
            goalDaysDb = goalDaysDb.filter(d => !ids[d.goalId]);
            goalListsDb = goalListsDb.filter(x => x.id !== l.id);
            saveGoals();
            saveGoalDays();
            saveGoalLists();
            if (activeGoalListId === l.id) activeGoalListId = null;
            renderGoals();
            showToast('Categoria apagada');
        });
};

// ---------- confirmação ----------
// V40.30.0: tone 'neutral' = pergunta que não apaga nada (ícone e botão na cor do app em vez de vermelho); icon = ícone dela.
function askGoalConfirm(title, text, okLabel, action, tone, icon) {
    _goalConfirmAction = action;
    const neutral = tone === 'neutral';
    document.getElementById('goal-confirm-modal').classList.toggle('ask-neutral', neutral);
    const ico = document.getElementById('goal-confirm-ico');
    if (ico) ico.className = 'ph ' + (neutral ? (icon || 'ph-list-checks') : 'ph-warning') + ' text-2xl';
    document.getElementById('goal-confirm-title').textContent = title;
    document.getElementById('goal-confirm-text').textContent = text;
    document.getElementById('goal-confirm-btn').textContent = okLabel;
    showModal('goal-confirm-modal');
}
window.confirmGoalAction = function() {
    const a = _goalConfirmAction;
    _goalConfirmAction = null;
    hideModal('goal-confirm-modal');
    if (a) a();
};
window.cancelGoalAction = function() {
    _goalConfirmAction = null;
    hideModal('goal-confirm-modal');
};

// V40.1.1: abre o form (Estado B) — modo criar
window.openNoteForm = function() {
    notesFormOpen = true;
    editingNoteId = null; // V40.1.2: garantir que NÃO está em modo edição
    renderNotes();
    // V40.2.17 (Regra de Ouro PWA - Jules): REMOVIDO .focus() programático.
    // Forçar teclado via JS em PWA com 100dvh fazia Chrome Android empurrar body inteiro pra cima,
    // descolando a sheet do fundo e criando "buraco branco" embaixo. Usuário toca no campo manualmente.
    setTimeout(() => {
        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';
    }, 50);
}

// V40.1.2: abre o form em modo edição (Estado B com pré-preenchimento)
window.openEditNote = function(id) {
    const note = notesDb.find(n => n.id === id);
    if (!note) return;
    
    notesFormOpen = true;
    editingNoteId = id;
    renderNotes();
    
    // V40.2.17 (Regra de Ouro PWA - Jules): REMOVIDO .focus() programático.
    // Mesmo motivo do openNoteForm. setTimeout preservado só pra preencher os campos após reflow.
    setTimeout(() => {
        const titleInput = document.getElementById('note-title-input');
        const contentInput = document.getElementById('note-content-input');
        if (titleInput) titleInput.value = note.title || '';
        if (contentInput) contentInput.value = note.content || '';
    }, 50);
}

// V40.1.1: cancela o form (volta pra Estado A ou C)
window.cancelNoteForm = function() {
    notesFormOpen = false;
    editingNoteId = null; // V40.1.2: limpar modo edição
    pendingLinkBlockId = null; // V40.2.1: limpa flag de vincular
    // limpa inputs caso o usuário tenha digitado algo
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');
    if (titleInput) titleInput.value = '';
    if (contentInput) contentInput.value = '';
    renderNotes();
}

window.addNote = function() {
    const titleInput = document.getElementById('note-title-input');
    const contentInput = document.getElementById('note-content-input');
    const title = (titleInput.value || '').trim();
    const content = (contentInput.value || '').trim();
    
    if (!title && !content) {
        showToast('Escreva algo antes de salvar.');
        return;
    }
    
    if (editingNoteId) {
        // V40.1.2: modo edição — atualiza nota existente preservando id e createdAt
        const note = notesDb.find(n => n.id === editingNoteId);
        if (note) {
            note.title = title;
            note.content = content;
            note.updatedAt = Date.now(); // útil pra futuro (não exibido)
        }
        showToast('Nota atualizada!');
    } else {
        // Modo criação (comportamento original)
        const newNote = {
            id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9),
            title: title,
            content: content,
            createdAt: Date.now()
        };
        notesDb.unshift(newNote);
        
        // V40.2.1: se veio do fluxo "Criar nova" no card, vincula ao bloco
        if (pendingLinkBlockId) {
            const block = db.find(b => b.id === pendingLinkBlockId);
            if (block) {
                if (!block.linkedNoteIds) block.linkedNoteIds = [];
                block.linkedNoteIds.push(newNote.id);
                saveDb();
            }
            pendingLinkBlockId = null; // limpa flag
            showToast('Nota vinculada ao card!');
        } else {
            showToast('Nota salva!');
        }
    }
    
    saveNotes();
    titleInput.value = '';
    contentInput.value = '';
    notesFormOpen = false; // V40.1.1: fecha o form após salvar
    
    // V40.2.1: se nota está vinculada a algum card, re-renderiza timeline pra atualizar texto na hora
    const editedId = editingNoteId;
    const newId = !editingNoteId && notesDb[0] ? notesDb[0].id : null;
    const idToCheck = editedId || newId;
    if (idToCheck) {
        const isLinked = db.some(b => b.linkedNoteIds && b.linkedNoteIds.includes(idToCheck));
        if (isLinked) renderTimeline();
    }
    
    editingNoteId = null;  // V40.1.2: limpar modo edição
    renderNotes();
}

window.deleteNote = function(id) {
    notesDb = notesDb.filter(n => n.id !== id);
    saveNotes();
    
    // V40.2: limpar IDs órfãos em todos os blocos que vinculavam essa nota
    let blocksAffected = 0;
    db.forEach(b => {
        if (b.linkedNoteIds && b.linkedNoteIds.includes(id)) {
            b.linkedNoteIds = b.linkedNoteIds.filter(nid => nid !== id);
            blocksAffected++;
        }
    });
    if (blocksAffected > 0) {
        saveDb();
        renderTimeline();
    }
    
    renderNotes();
    showToast('Nota apagada.');
}

window.renderNotes = function() {
    // V40.1.1: 3 estados controlados via classes hidden
    const header = document.getElementById('notes-header');
    const empty = document.getElementById('notes-empty');
    const form = document.getElementById('notes-form');
    const container = document.getElementById('notes-container');
    const counter = document.getElementById('notes-count');
    // V40.4.4-fix: novo botão tracejado no rodapé (padronização)
    const fabBtn = document.getElementById('notes-fab-btn');
    
    if (!container || !empty || !form || !header) return;
    
    if (counter) counter.innerText = notesDb.length;
    
    const hasNotes = notesDb.length > 0;
    
    if (notesFormOpen) {
        // Estado B: Form aberto. Esconde empty, esconde lista, mostra form.
        // Header só fica visível se já existem notas (pra não poluir tela vazia)
        empty.classList.add('hidden');
        container.classList.add('hidden');
        form.classList.remove('hidden');
        if (hasNotes) header.classList.remove('hidden');
        else header.classList.add('hidden');
        if (fabBtn) fabBtn.classList.add('hidden'); // V40.4.4-fix: esconde botão durante form
    } else if (!hasNotes) {
        // Estado A: Empty. Mostra só o convite central.
        empty.classList.remove('hidden');
        form.classList.add('hidden');
        container.classList.add('hidden');
        header.classList.add('hidden');
        if (fabBtn) fabBtn.classList.add('hidden'); // V40.4.4-fix: empty já tem botão central
    } else {
        // Estado C: Lista. Header (sem +) + cards + botão tracejado embaixo.
        empty.classList.add('hidden');
        form.classList.add('hidden');
        container.classList.remove('hidden');
        header.classList.remove('hidden');
        if (fabBtn) fabBtn.classList.remove('hidden'); // V40.4.4-fix: mostra botão tracejado
    }
    
    // V40.1.2: atualizar labels do form conforme modo (criar vs editar)
    const formLabel = document.getElementById('notes-form-label');
    const formSaveBtn = document.getElementById('notes-form-save-btn');
    if (formLabel && formSaveBtn) {
        if (editingNoteId) {
            formLabel.innerText = 'Editar nota';
            formSaveBtn.innerText = 'Atualizar Nota';
        } else {
            formLabel.innerText = 'Nova nota';
            formSaveBtn.innerText = 'Salvar Nota';
        }
    }
    
    // Sempre re-renderizar a lista (idempotente)
    container.innerHTML = notesDb.map(n => {
        const dateStr = new Date(n.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
        const timeStr = new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const titleHtml = n.title ? `<h4 class="font-bold text-sm text-zinc-800 mb-1 break-words">${escapeHtml(n.title)}</h4>` : '';
        const contentHtml = n.content ? `<p class="text-[13px] text-zinc-600 leading-snug whitespace-pre-wrap break-words">${escapeHtml(n.content)}</p>` : '';
        return `
            <div class="bg-white border border-zinc-200 p-3 rounded-xl shadow-sm">
                <div class="flex items-start justify-between gap-2 mb-1.5">
                    <div class="flex-1 min-w-0">
                        ${titleHtml}
                    </div>
                    <div class="flex gap-1.5 shrink-0">
                        <button onclick="openEditNote('${n.id}')" class="w-7 h-7 flex items-center justify-center bg-zinc-50 border border-zinc-200 text-zinc-500 rounded-lg hover:bg-zinc-100 hover:text-zinc-700 transition" title="Editar">
                            <i class="ph ph-pencil-simple text-sm"></i>
                        </button>
                        <button onclick="deleteNote('${n.id}')" class="w-7 h-7 flex items-center justify-center bg-red-50 border border-red-100 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition" title="Apagar">
                            <i class="ph ph-trash text-sm"></i>
                        </button>
                    </div>
                </div>
                ${contentHtml}
                <p class="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mt-2">${dateStr} · ${timeStr}</p>
            </div>
        `;
    }).join('');
}

window.cancelPendingTask = () => {
    pendingIntent = null;
    document.getElementById('floating-task').classList.add('hidden');
    document.getElementById('floating-task').classList.remove('flex');
    fab.style.transform = 'scale(1)';
    if(listBtn) listBtn.style.transform = 'scale(1)';
    renderTimeline();
}

input.addEventListener('keypress', e => { if (e.key === 'Enter') commitIntent(); });
// V40.3.8: Enter no título da Lista NÃO salva mais — pula pro primeiro check (ou cria um).
// Regra de Ouro #2: usar preventScroll pra evitar buraco branco no PWA Android.
backlogInput.addEventListener('keypress', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const title = backlogInput.value.trim();
    if (!title) return; // sem título, ignora silenciosamente
    
    // Se não tem nenhum check ainda, cria um vazio e foca nele.
    if (currentBlMicroblocks.length === 0) {
        addBacklogMicroblockForm();
    }
    
    // Foca o primeiro input de checklist (ou o último adicionado).
    setTimeout(() => {
        const firstMb = document.querySelector('.bl-mb-input');
        if (firstMb) firstMb.focus({ preventScroll: true });
    }, 50);
});

// V2.0 - Função de tema (declarada antes da inicialização)
window.applyThemeColor = function() {
    document.documentElement.style.setProperty('--theme-color', themeColor);
    
    // V40.1.8: converter hex pra rgb pra usar com opacidade (botões "tinted")
    function hexToRgb(hex) {
        const h = hex.replace('#', '');
        const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const r = parseInt(full.substring(0, 2), 16);
        const g = parseInt(full.substring(2, 4), 16);
        const b = parseInt(full.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }
    const rgb = hexToRgb(themeColor);
    
    // V3.0 - Bug 2.7: Injetar CSS dinâmico pra sobrescrever app-focus
    let styleEl = document.getElementById('dynamic-theme-style');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'dynamic-theme-style';
        document.head.appendChild(styleEl);
    }
    styleEl.innerHTML = `
        .bg-app-focus { background-color: ${themeColor} !important; }
        .text-app-focus { color: ${themeColor} !important; }
        .border-app-focus { border-color: ${themeColor} !important; }
        .focus\\:border-app-focus:focus { border-color: ${themeColor} !important; }
        .selection\\:bg-app-focus::selection { background-color: ${themeColor} !important; }
        /* V40.1.8: variações suaves para CTAs internos (Notas/Lista/Rotinas) */
        .bg-app-focus-soft { background-color: rgba(${rgb}, 0.08) !important; }
        .border-app-focus-soft { border-color: rgba(${rgb}, 0.25) !important; }
        .bg-app-focus-soft-strong { background-color: rgba(${rgb}, 0.15) !important; }
        .hover\\:bg-app-focus-soft-strong:hover { background-color: rgba(${rgb}, 0.15) !important; }
    `;
}

// ==========================================
// --- V3.0 - COMBO E: Relatórios ---
// ==========================================

window.openReportsSheet = function() {
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    closeAllSheets();
    renderReports('today');
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('reports-sheet').classList.remove('translate-y-full');
    pushNavState(); // V40.5.0-fix7
}

window.renderReports = function(period) {
    // 1. Atualizar UI das Abas
    ['today', 'week', 'month'].forEach(p => {
        const btn = document.getElementById(`btn-rep-${p}`);
        if (p === period) {
            btn.className = 'flex-1 py-1.5 rounded-lg bg-white shadow-sm text-zinc-800 text-xs font-bold transition border border-black/5';
        } else {
            btn.className = 'flex-1 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 text-xs font-bold transition border border-transparent';
        }
    });

    // 2. Calcular Janela de Data
    // V3.0 - Bug 3.3/3.7 + Fuso UTC: usar getActiveDateStr() como base (string fixa)
    let endStr = getActiveDateStr();
    let startStr = getActiveDateStr();
    
    if (period === 'week' || period === 'month') {
        const d = new Date(endStr + 'T12:00:00'); // T12:00:00 blinda contra fuso horário
        if (period === 'week') d.setDate(d.getDate() - 6);
        if (period === 'month') d.setDate(d.getDate() - 29);
        startStr = d.toLocaleDateString('en-CA');
    }

    // 3. Filtrar Banco
    let filteredDb = db.filter(b => b.date >= startStr && b.date <= endStr && b.type !== 'empty');

    const container = document.getElementById('reports-container');
    if (filteredDb.length === 0) {
        container.innerHTML = `<div class="text-center text-zinc-400 mt-10"><i class="ph ph-chart-line-down text-4xl mb-2"></i><p class="text-sm font-medium">Sem registros no período.</p></div>`;
        return;
    }

    // 4. Agregar Dados
    let totalMins = 0;
    let tagStats = {};

    tagsDb.forEach(t => {
        tagStats[t.id] = { name: t.name, color: t.color, planned: 0, completed: 0, delayed: 0 };
    });
    tagStats['null'] = { name: 'Sem Etiqueta', color: '#9ca3af', planned: 0, completed: 0, delayed: 0 };

    filteredDb.forEach(b => {
        const dur = b.duration;
        totalMins += dur;
        const tId = b.tagId || 'null';
        
        if (!tagStats[tId]) {
           tagStats[tId] = { name: 'Excluída', color: '#9ca3af', planned: 0, completed: 0, delayed: 0 };
        }

        tagStats[tId].planned += dur;
        if (b.completed) {
            tagStats[tId].completed += dur;
        } else if (b.type === 'past' || b.wasDelayed) {
            tagStats[tId].delayed += dur;
        }
    });

    // 5. Renderizar
    let globalCompleted = Object.values(tagStats).reduce((acc, curr) => acc + curr.completed, 0);
    let globalPct = totalMins > 0 ? Math.round((globalCompleted / totalMins) * 100) : 0;

    let html = `
        <div class="bg-app-focus text-white p-4 rounded-xl flex items-center justify-between shadow-md mb-2">
            <div>
                <p class="text-[10px] uppercase tracking-widest text-white/60 font-bold mb-1">Global</p>
                <p class="text-3xl font-black">${globalPct}%</p>
            </div>
            <div class="text-right flex flex-col gap-1">
                <p class="text-xs text-white/90 font-bold bg-white/10 px-2 py-0.5 rounded"><span class="text-emerald-300 mr-1">●</span> ${formatDur(globalCompleted)} concluídos</p>
                <p class="text-xs text-white/70 font-bold bg-white/5 px-2 py-0.5 rounded"><span class="text-white/50 mr-1">●</span> ${formatDur(totalMins)} totais</p>
            </div>
        </div>
    `;

    const sortedTags = Object.values(tagStats)
        .filter(t => t.planned > 0)
        .sort((a, b) => b.planned - a.planned);

    sortedTags.forEach(t => {
        const compPct = Math.round((t.completed / t.planned) * 100) || 0;
        const delPct = Math.round((t.delayed / t.planned) * 100) || 0;
        const pendPct = 100 - compPct - delPct;

        html += `
            <div class="bg-white border border-zinc-200 p-4 rounded-xl shadow-sm">
                <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                        <div class="w-3 h-3 rounded-full" style="background-color: ${t.color}"></div>
                        <span class="font-bold text-sm text-zinc-800">${escapeHtml(t.name)}</span>
                    </div>
                    <span class="text-[11px] bg-zinc-100 px-2 py-1 rounded font-bold text-zinc-500">${formatDur(t.planned)}</span>
                </div>
                
                <div class="w-full h-3 bg-zinc-100 rounded-full flex overflow-hidden mb-2">
                    <div class="h-full transition-all duration-700" style="width: ${compPct}%; background-color: ${t.color}"></div>
                    <div class="h-full bg-red-400 transition-all duration-700" style="width: ${delPct}%"></div>
                    <div class="h-full bg-zinc-200 transition-all duration-700" style="width: ${pendPct}%"></div>
                </div>

                <div class="flex justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span style="color: ${t.color}">${compPct}% Feito</span>
                    ${t.delayed > 0 ? `<span class="text-red-500">${delPct}% Atr.</span>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}


// --- INICIALIZAÇÃO ---
renderGrid(); 
runRealTimeEngine();
renderTimeline();
updateTlCompactBtn(); // V40.24.0
updateTlDaysBtn(); // V40.26.0
renderBacklog();
renderTagSelector();
applyThemeColor(); // V2.0 - Aplicar tema salvo
updateThoughtBtnVisibility(); // V40.2.5 - Nuvem Passageira (esconde se já leu hoje)

setTimeout(() => {
    const scrollEl = document.getElementById('timeline-scroll');
    let targetY;
    
    if (showOnlyDelayed || showOnlyCompleted) {
        targetY = 0; 
    } else {
        targetY = tlY(currentRealMins) - (scrollEl.clientHeight / 2); // V40.24.0: escala por trechos
    }
    
    scrollEl.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
}, 300);

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installBanner = document.createElement('div');
  installBanner.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-3 animate-float-bubble';
  installBanner.innerHTML = `
    <i class="ph ph-download-simple text-xl"></i>
    <span class="text-sm font-bold">Instalar App</span>
    <button id="install-btn" class="bg-white text-zinc-900 px-4 py-1.5 rounded-full text-xs font-bold ml-2">Instalar</button>
  `;
  document.body.appendChild(installBanner);
  
  document.getElementById('install-btn').addEventListener('click', async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      installBanner.remove();
    }
    deferredPrompt = null;
  });
  
  setTimeout(() => installBanner.remove(), 10000);
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(registration => {
        console.log('Service Worker registrado com sucesso:', registration.scope);
      })
      .catch(error => {
        console.log('Falha ao registrar o Service Worker:', error);
      });
  });
}

// V3.0 - V37: Ajustar paddingTop da timeline conforme altura real do header
// V40.2.27: removido o "if (headerHidden) return" — agora calcula dinâmicamente em
//           ambos os estados, porque o header encolhe naturalmente via display:none
//           nos blocos internos (não mais via altura fixa).
window.adjustTimelinePadding = function() {
    const header = document.querySelector('header');
    const timeline = document.getElementById('timeline-scroll');
    if (!header || !timeline) return;
    const h = header.offsetHeight;
    timeline.style.paddingTop = (h + 8) + 'px';
}
setTimeout(adjustTimelinePadding, 100);
window.addEventListener('resize', adjustTimelinePadding);

// V40.2.12: Atalhos de teclado pra navegação por dia no desktop
// ← seta esquerda = dia anterior, → seta direita = dia seguinte, espaço = HOJE
// Ignora se o foco está num input/textarea/contenteditable pra não atrapalhar digitação
document.addEventListener('keydown', (e) => {
    // Ignora se o usuário está digitando em algum input
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    
    // Ignora também se algum modal/sheet está aberto (overlay visível)
    const overlay = document.getElementById('overlay');
    const overlayOpen = overlay && !overlay.classList.contains('pointer-events-none');
    if (overlayOpen) return;
    
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        debugPreviousDay();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        debugAdvanceDay();
    } else if (e.key === 'Home') {
        e.preventDefault();
        goToToday();
    }
});

// V2.0 - BLOCO 7: Toggle Header
// V40.2.27 — Refatoração picaprofunda (diagnóstico Jules):
//   ANTES: usava header.style.height='100px' + overflow:hidden + paddingTop='110px' fixos.
//   AGORA: esconde com .classList.toggle('hidden') os 2 blocos (filtros + barra Planejado).
//          O header naturalmente encolhe via flexbox. adjustTimelinePadding cuida do espaço.
//          Comportamento ELÁSTICO — adapta-se ao tamanho real do conteúdo.
//
// V40.2.28 — Memória do usuário + paddings compactos no retraído:
//   - Estado persistido em localStorage 'tb_header_collapsed'.
//   - Default false (1ª vez = expandido — princípio de Discoverability).
//   - applyHeaderState() centraliza aplicação do estado (init + toggle usam a mesma).
//   - Classe CSS .header-collapsed reduz pt-12→16px (V40.5.1-fix3), pb-4→4px, mb-4→0px (ganho ~52px).

function applyHeaderState() {
    const header = document.querySelector('header');
    const filtersRow = document.getElementById('header-filters-row');
    const progressRow = document.getElementById('header-progress-row');
    const btn = document.querySelector('[onclick="toggleHeader()"]');
    if (!header || !filtersRow || !progressRow) return;

    if (headerHidden) {
        filtersRow.classList.add('hidden');
        progressRow.classList.add('hidden');
        header.classList.add('header-collapsed');
        // V40.3.6: botão tem fundo bg-app-focus, ícone tem que ser branco pra contrastar.
        if (btn) btn.innerHTML = '<i class="ph ph-caret-down text-base text-white"></i>';
    } else {
        filtersRow.classList.remove('hidden');
        progressRow.classList.toggle('hidden', tlMulti()); // V40.26.0: com vários dias, os nomes dos dias ficam no lugar
        header.classList.remove('header-collapsed');
        // V40.3.6: idem
        if (btn) btn.innerHTML = '<i class="ph ph-caret-up text-base text-white"></i>';
    }

    // Recalcula paddingTop da timeline AGORA que a altura real do header mudou.
    // setTimeout 50ms dá tempo do browser aplicar o display:none e recalcular offsetHeight.
    setTimeout(() => {
        const h = header.offsetHeight;
        const timeline = document.getElementById('timeline-scroll');
        if (timeline) timeline.style.paddingTop = (h + 8) + 'px';
    }, 50);
}

window.toggleHeader = function() {
    headerHidden = !headerHidden;
    localStorage.setItem('tb_header_collapsed', headerHidden ? 'true' : 'false');
    applyHeaderState();
}

// V40.2.28: aplica estado inicial logo no carregamento da página.
// setTimeout 100ms garante que o DOM já está pronto pra querySelectors.
setTimeout(applyHeaderState, 100);

// --- V2.0 - COMBO A: Edição ---
let editingTaskId = null;
let editingTagId = null;
let editingColor = null; // V40.9.0
let editingGoalId = null; // V40.34.0
window.fazPickEditColor = function(c) { editingColor = fazCardColor(c); fazRenderColorPicker('edit-color-picker', editingColor, 'fazPickEditColor'); };

window.openEditModal = function(id, e) {
    if(e) e.stopPropagation();
    const b = db.find(x => x.id === id);
    if(!b) return;
    
    closeAllSheets(); 
    
    editingTaskId = id;
    editingTagId = b.tagId;
    editingColor = fazCardColor(b.color);
    fazRenderColorPicker('edit-color-picker', editingColor, 'fazPickEditColor');
    
    document.getElementById('edit-task-title').value = b.title;
    document.getElementById('edit-task-heading').textContent = isSublist(b) ? 'Editar sublista' : 'Editar Tarefa'; // V40.24.0
    renderEditTagSelector();
    editingGoalId = goalKeep(b.goalId); // V40.34.0: a sublista não liga (cada cartão dela liga)
    if (isSublist(b)) document.getElementById('edit-goal-wrap').classList.add('hidden');
    else goalPickFill('edit-goal-wrap', 'edit-goal-pick', editingGoalId, 'selectEditGoal');
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('edit-task-modal').classList.remove('hidden');
    document.getElementById('edit-task-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

window.selectEditTag = function(id) {
    editingTagId = editingTagId === id ? null : id;
    renderEditTagSelector();
}
window.selectEditGoal = function(id) { editingGoalId = goalKeep(id || null); goalPickFill('edit-goal-wrap', 'edit-goal-pick', editingGoalId, 'selectEditGoal'); }; // V40.34.0

window.renderEditTagSelector = function() {
    const container = document.getElementById('edit-tag-selector-container');
    if(!container) return;
    container.className = 'flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2 w-full';
    let html = `<button onclick="selectEditTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${editingTagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}">Sem</button>`;
    tagsDb.forEach(t => {
        const isActive = editingTagId === t.id;
        const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100';
        html += `<button onclick="selectEditTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>${escapeHtml(t.name)}</button>`;
    });
    container.innerHTML = html;
}

window.saveEditTask = function() {
    if(!editingTaskId) return;
    const b = db.find(x => x.id === editingTaskId);
    const newTitle = document.getElementById('edit-task-title').value.trim();
    if(b && newTitle) {
        b.title = newTitle;
        b.tagId = editingTagId;
        if (editingColor) b.color = editingColor; else delete b.color; // V40.9.0
        if (!isSublist(b)) { if (goalKeep(editingGoalId)) b.goalId = editingGoalId; else delete b.goalId; } // V40.34.0
        saveDb();
        renderTimeline();
    }
    cancelEdit();
}

window.cancelEdit = function() {
    editingTaskId = null;
    document.getElementById('edit-task-modal').classList.add('hidden');
    document.getElementById('edit-task-modal').classList.remove('flex');
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
}

// --- V2.0 - COMBO A: Exclusão ---
let deletingTaskId = null;

window.openDeleteModal = function(id, e) {
    if(e) e.stopPropagation();
    
    closeAllSheets(); 
    deletingTaskId = id;
    // V40.24.0: sublista — "Mover pra Lista" devolve os cartões não feitos e apaga a sublista
    const delB = db.find(x => x.id === id), isSub = isSublist(delB), open = isSub ? subCount(delB).open : 0;
    document.getElementById('delete-task-heading').textContent = isSub ? 'O que fazer com esta sublista?' : 'O que fazer com esta tarefa?';
    document.getElementById('delete-task-move').classList.toggle('hidden', isSub && !open);
    document.getElementById('delete-task-move-label').textContent = !isSub ? 'Mover pra Lista' : (open === 1 ? 'Devolver o não feito e apagar' : `Devolver os ${open} não feitos e apagar`);
    document.getElementById('delete-task-kill-label').textContent = !isSub ? 'Excluir Definitivo' : (delB.cards.length ? 'Apagar a sublista e os cartões' : 'Apagar a sublista');
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('delete-task-modal').classList.remove('hidden');
    document.getElementById('delete-task-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

window.moveToBacklog = function() {
    if(!deletingTaskId) return;
    const b = db.find(x => x.id === deletingTaskId);
    if (isSublist(b)) { // V40.24.0: os não feitos voltam pra Lista; os feitos saem junto com a sublista
        const open = b.cards.filter(c => !c.done);
        open.forEach(c => subCardToList(b, c));
        db = db.filter(x => x.id !== deletingTaskId);
        saveBacklog(); saveDb();
        renderTimeline(); renderBacklog();
        showToast(!open.length ? 'Sublista apagada.' : open.length === 1 ? 'Sublista apagada; 1 cartão voltou pra Lista' : `Sublista apagada; ${open.length} cartões voltaram pra Lista`);
        closeAllSheets();
        cancelDelete();
        return;
    }
    if(b) {
        // V40.3.2-fix5: agora preserva os microblocks (checks) ao mover pra Lista.
        // ANTES: só salvava id+title+duration+tagId — perdia toda a checklist.
        // AGORA: clone profundo dos microblocks, com done resetado pra false 
        //        (faz sentido: ao reagendar, recomeça do zero, igual ao duplicate).
        const clonedMbs = (b.microblocks || []).map(mb => ({ title: mb.title, done: false }));
        const col = backToListColumn(b.columnId); // V40.38.0: a lista de onde veio; senão a primeira (antes: sempre Geral)
        backlogDb.push({ 
            id: 'bl_' + Date.now(), 
            title: b.title, 
            duration: b.duration, 
            tagId: b.tagId || null,
            microblocks: clonedMbs,
            ...(fazCardColor(b.color) ? { color: fazCardColor(b.color) } : {}), // V40.9.0
            ...(goalKeep(b.goalId) ? { goalId: b.goalId } : {}), // V40.34.0
            columnId: col.id
        });
        saveBacklog();
        db = db.filter(x => x.id !== deletingTaskId);
        saveDb();
        renderTimeline();
        renderBacklog();
        undoNameStep('Voltou pra lista ' + (col.name || 'Sem nome')); // V40.38.0: a barrinha do Desfazer diz pra qual lista foi (antes: aviso vermelho "Movido para a lista!")
    }
    closeAllSheets();
    cancelDelete();
}

window.confirmKillTask = function() {
    if(!deletingTaskId) return;
    const wasSub = isSublist(db.find(b => b.id === deletingTaskId)); // V40.24.0
    db = db.filter(b => b.id !== deletingTaskId);
    saveDb();
    renderTimeline();
    closeAllSheets();
    cancelDelete();
    showToast(wasSub ? 'Sublista apagada.' : "Tarefa excluída.");
}

window.cancelDelete = function() {
    deletingTaskId = null;
    document.getElementById('delete-task-modal').classList.add('hidden');
    document.getElementById('delete-task-modal').classList.remove('flex');
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
}

// --- V2.0 - COMBO B: Time Picker ---
let timePickerBlockId = null;

window.openTimePicker = function(blockId, currentMin, e) {
    if(e) e.stopPropagation();
    
    closeAllSheets();
    timePickerBlockId = blockId;
    
    const h = Math.floor(currentMin / 60).toString().padStart(2, '0');
    const m = (currentMin % 60).toString().padStart(2, '0');
    
    document.getElementById('edit-time-input').value = `${h}:${m}`;
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('time-picker-modal').classList.remove('hidden');
    document.getElementById('time-picker-modal').classList.add('flex');
}

window.confirmTimePicker = function() {
    if(!timePickerBlockId) return;
    const timeVal = document.getElementById('edit-time-input').value;
    if(!timeVal) return;
    
    const [h, m] = timeVal.split(':').map(Number);
    let newStart = (h * 60) + m;
    newStart = Math.round(newStart / 5) * 5; 
    
    const block = db.find(b => b.id === timePickerBlockId);
    if(!block) return;
    
    newStart = Math.max(START_HOUR * 60, Math.min(newStart, (END_HOUR * 60) - block.duration));
    
    const dailyDb = db.filter(b => b.date === block.date && b.id !== timePickerBlockId);
    const hasCollision = dailyDb.some(fb => {
        return (newStart < fb.startMin + fb.duration && newStart + block.duration > fb.startMin);
    });

    if (hasCollision) {
        showToast("Conflito! Horário ocupado.");
        return;
    }
    
    block.startMin = newStart;
    
    const isPastDay = block.date < getTodayStr();
    const isPastTimeToday = block.date === getTodayStr() && (block.startMin + block.duration) <= currentRealMins;
    if (!isPastDay && !isPastTimeToday) {
        if (block.type === 'past') block.wasDelayed = true;
        block.type = 'focus';
    }
    
    saveDb();
    renderTimeline();
    cancelTimePicker();
    showToast("Horário atualizado!");
}

window.cancelTimePicker = function() {
    timePickerBlockId = null;
    document.getElementById('time-picker-modal').classList.add('hidden');
    document.getElementById('time-picker-modal').classList.remove('flex');
    document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none');
}

// --- V2.0 - COMBO C: Aparência ---

window.openConfigAppearance = function() {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-appearance-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Aparência';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigAppearance()');

    paintThemePicker();
}

window.closeConfigAppearance = function() {
    document.getElementById('config-appearance-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
}

window.selectThemeColor = function(btn) {
    const changed = btn.dataset.color !== themeColor;
    themeColor = btn.dataset.color;
    localStorage.setItem('tb_theme_color', themeColor);

    paintThemePicker();

    applyThemeColor();
    if (changed) fazPrefsTouch(); // V40.32.0: vai pro PC (e ganha de uma mudança mais antiga feita lá)
    showToast("Cor atualizada!");
}

// Marca a bolinha da cor atual em Config → Aparência.
function paintThemePicker() {
    document.querySelectorAll('.theme-color-btn').forEach(b => {
        const on = b.dataset.color === themeColor;
        b.classList.toggle('border-transparent', !on);
        b.classList.toggle('scale-110', on);
        b.classList.toggle('shadow-sm', on);
        b.classList.toggle('border-zinc-900', on);
    });
}

// ===== V40.32.0: cor do app e horário do dia também mudam pelo PC =====
// Vão na conta (o sync.js cuida). Ganha a mudança mais nova: tb__prefs_at (deste aparelho, fora do backup)
// guarda quando a cor ou o horário mudaram por último aqui (ou quando chegou a mudança mais nova da conta).
// A hora é sempre maior que a última que este aparelho conhece (a da conta inclusive): relógio do PC adiantado
// não faz uma mudança feita aqui depois perder pra uma de lá feita antes.
function fazPrefsStamp() {
    try {
        const cur = Number(localStorage.getItem('tb__prefs_at')) || 0;
        localStorage.setItem('tb__prefs_at', String(Math.max(Date.now(), cur + 1)));
    } catch (e) {}
}
function fazPrefsTouch() {
    fazPrefsStamp();
    if (window.fazSyncNotify) window.fazSyncNotify();
}
// Restaurar backup (ou desfazer a restauração) que troca a cor ou o horário: isso vira a mudança mais nova.
function fazPrefsKeys() {
    try { return ['tb_theme_color', 'tb_start_hour', 'tb_end_hour'].map(k => localStorage.getItem(k)).join('|'); } catch (e) { return ''; }
}
function fazPrefsStampIfChanged(before) {
    if (fazPrefsKeys() !== before) fazPrefsStamp();
}
function fazHoursLabel(a, b) { return String(a).padStart(2, '0') + ':00 às ' + String(b).padStart(2, '0') + ':00'; }
window.fazPrefs = function () {
    let at = 0;
    try { at = Number(localStorage.getItem('tb__prefs_at')) || 0; } catch (e) {}
    return { theme: themeColor, hours: [START_HOUR, END_HOUR], at: at };
};
window.fazSetPrefsAt = function (t) { try { localStorage.setItem('tb__prefs_at', String(t)); } catch (e) {} };
// O que veio da conta (sync.js). Volta o que mudou: { theme: true/false, hours: '07:00 às 24:00' ou '' }.
window.fazApplyPrefs = function (p) {
    const did = { theme: false, hours: '' };
    if (p && p.theme && p.theme !== themeColor) {
        themeColor = p.theme;
        try { localStorage.setItem('tb_theme_color', themeColor); } catch (e) {}
        applyThemeColor();
        paintThemePicker();
        did.theme = true;
    }
    if (p && Array.isArray(p.hours) && (p.hours[0] !== START_HOUR || p.hours[1] !== END_HOUR)) {
        START_HOUR = p.hours[0];
        END_HOUR = p.hours[1];
        TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
        try { localStorage.setItem('tb_start_hour', START_HOUR); localStorage.setItem('tb_end_hour', END_HOUR); } catch (e) {}
        try { renderGrid(); renderTimeline(); } catch (e) { console.warn('[Faz] horário do dia', e); }
        did.hours = fazHoursLabel(START_HOUR, END_HOUR);
    }
    return did;
};

// ===== V40.41.0: os períodos (Manhã, Tarde...) também vão pro PC =====
// Vão na conta, como a cor do app (o sync.js cuida: CORE.periodsPlan), com a hora deles: tb__periods_at (deste
// aparelho, fora do backup) guarda quando a lista mudou por último aqui (ou quando chegou a mudança mais nova da conta).
function fazPeriodsTouch() {
    try {
        const cur = Number(localStorage.getItem('tb__periods_at')) || 0;
        localStorage.setItem('tb__periods_at', String(Math.max(Date.now(), cur + 1)));
    } catch (e) {}
    if (window.fazSyncNotify) window.fazSyncNotify();
}
// Restaurar backup (ou desfazer a restauração) que troca os períodos: isso vira a mudança mais nova.
function fazPeriodsRaw() { try { return localStorage.getItem('tb_periods_db'); } catch (e) { return null; } }
function fazPeriodsStampIfChanged(before) {
    if (fazPeriodsRaw() === before) return;
    try {
        const cur = Number(localStorage.getItem('tb__periods_at')) || 0;
        localStorage.setItem('tb__periods_at', String(Math.max(Date.now(), cur + 1)));
    } catch (e) {}
}
window.fazPeriods = function () {
    let at = 0;
    try { at = Number(localStorage.getItem('tb__periods_at')) || 0; } catch (e) {}
    return { list: periodsDb, at: at };
};
window.fazSetPeriodsAt = function (t) { try { localStorage.setItem('tb__periods_at', String(t)); } catch (e) {} };
// O que veio da conta (sync.js), já conferido. Não vira passo do Desfazer. Volta true se a lista mudou.
window.fazApplyPeriods = function (list) {
    if (!Array.isArray(list)) return false;
    const next = list.map((p) => ({ id: String(p.id), name: String(p.name), start: String(p.start), end: String(p.end) }));
    if (JSON.stringify(next) === JSON.stringify(periodsDb)) return false;
    undoQuiet(() => {
        periodsDb = next;
        try { localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb)); } catch (e) {}
        undoTouch('periodos');
    });
    try { if (!document.getElementById('config-periods-view').classList.contains('hidden')) renderConfigPeriods(); } catch (e) {}
    try { if (!document.getElementById('period-select-sheet').classList.contains('translate-y-full')) renderPeriodSelect(); } catch (e) {}
    return true;
};

// =====================================================
// V40.3 — MOTOR DE ROTINAS (Fase 1 — CRUD)
// =====================================================
let currentRtId = null;
let currentRtDur = 120;
let currentRtTheme = 'focus';
let currentRtTagId = null;
let currentRtGoalId = null; // V40.34.0
let currentRtMicroblocks = [];

// V40.3.5-fix2: expandedRoutineIds movida pro topo do arquivo (linha ~32) pra evitar TDZ.
// Declaração aqui REMOVIDA (era `let expandedRoutineIds = new Set();`).

window.renderRoutinesList = function() {
    const container = document.getElementById('routines-container');
    if (!container) return;

    if (routinesDb.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 opacity-60">
                <i class="ph ph-stamp text-4xl mb-2 text-zinc-400"></i>
                <p class="text-sm font-medium text-zinc-500">Nenhuma rotina criada.</p>
            </div>`;
        return;
    }

    container.innerHTML = routinesDb.sort((a,b) => b.createdAt - a.createdAt).map(r => {
        const mbs = r.microblocks || [];
        const isExpanded = expandedRoutineIds.has(r.id);
        // V40.5.0-fix3: preview reduzido de 3 → 2 pra cards menores
        const PREVIEW_COUNT = 2;
        const visibleMbs = isExpanded ? mbs : mbs.slice(0, PREVIEW_COUNT);
        const extraCount = mbs.length - PREVIEW_COUNT;
        
        let mbHtml = visibleMbs.map(mb => `
            <div class="flex items-center gap-1.5 mt-1">
                <i class="ph-bold ph-check text-[10px] text-zinc-300 shrink-0"></i>
                <span class="text-[11px] text-zinc-500 truncate">${escapeHtml(mb.title)}</span>
            </div>
        `).join('');
        
        // V40.3.5 Ajuste 4 (I): "+ X mais" → expande; "↑ Mostrar menos" → retrai. event.stopPropagation pra não disparar o openRoutineForm do card.
        if (extraCount > 0 && !isExpanded) {
            mbHtml += `<button onclick="event.stopPropagation(); toggleExpandRoutine('${r.id}')" class="text-[10px] text-app-focus font-bold mt-1.5 ml-4 hover:underline text-left active:scale-95 transition">+ ${extraCount} mais</button>`;
        } else if (isExpanded && mbs.length > PREVIEW_COUNT) {
            mbHtml += `<button onclick="event.stopPropagation(); toggleExpandRoutine('${r.id}')" class="text-[10px] text-app-focus font-bold mt-1.5 ml-4 hover:underline text-left active:scale-95 transition">↑ Mostrar menos</button>`;
        }
        // V40.5.0-fix3: SEM checklist = SEM texto "Sem checklist" (card fica menor)
        
        // V40.5.0-fix3: divisor + seção de checks SÓ se tem checklist (card menor quando vazio)
        const hasChecks = mbs.length > 0;
        const checksSection = hasChecks ? `
            <div class="w-full h-px bg-zinc-100 my-2.5"></div>
            <div class="flex flex-col">
                ${mbHtml}
            </div>` : '';

        // V40.3.5 Ajuste 3b: toque no card abre edit (igual Lista). Botão ✏️ REMOVIDO (botão ✋ Carimbar continua com stopPropagation).
        return `
        <div onclick="openRoutineForm('${r.id}')" class="bg-white border border-zinc-200 rounded-xl p-3.5 shadow-sm relative mb-1 cursor-pointer hover:shadow active:scale-[0.99] transition">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-3 min-w-0 flex-1 pr-2">
                    <div class="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center text-xl shrink-0 shadow-inner">
                        ${escapeHtml(r.emoji || '✨')}
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-bold text-sm text-zinc-800 leading-tight truncate">${goalBadge(r.goalId)}${escapeHtml(r.title)}</h4>
                        <p class="text-[11px] text-zinc-400 font-bold mt-0.5"><i class="ph-bold ph-clock mr-1"></i>${formatDur(r.duration)} · ${mbs.length} itens</p>
                    </div>
                </div>
                <!-- V40.3.5-fix: ✋ Carimbar + 🗑️ Apagar (igual padrão da Lista). ✏️ removido (toque no card edita). -->
                <div class="flex items-center gap-1.5 shrink-0">
                    <button onclick="event.stopPropagation(); stampRoutine('${r.id}')" class="w-8 h-8 flex items-center justify-center bg-app-focus-soft text-app-focus rounded-lg hover:bg-app-focus-soft-strong transition active:scale-95 shrink-0" title="Carimbar no dia">
                        <i class="ph-fill ph-hand-tap text-sm"></i>
                    </button>
                    <button onclick="event.stopPropagation(); requestDeleteRoutine('${r.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-100 active:scale-95 transition shrink-0" title="Apagar">
                        <i class="ph ph-trash text-sm"></i>
                    </button>
                </div>
            </div>
            ${checksSection}
        </div>`;
    }).join('');
}

// V40.3.5 Ajuste 4 (I): toggle expansão de checklist de uma rotina.
window.toggleExpandRoutine = function(routineId) {
    if (expandedRoutineIds.has(routineId)) {
        expandedRoutineIds.delete(routineId);
    } else {
        expandedRoutineIds.add(routineId);
    }
    renderRoutinesList();
}

window.openRoutineForm = function(id = null) {
    document.getElementById('routines-list-view').classList.add('hidden');
    document.getElementById('routines-form-view').classList.remove('hidden');
    document.getElementById('routines-form-view').classList.add('flex');
    
    currentRtId = id;
    
    if (id) {
        const r = routinesDb.find(x => x.id === id);
        if (!r) return;
        document.getElementById('rt-form-title-label').innerText = 'Editar Rotina';
        document.getElementById('rt-form-emoji').value = r.emoji || '';
        document.getElementById('rt-form-title').value = r.title;
        currentRtDur = r.duration;
        currentRtTheme = r.theme;
        currentRtTagId = r.tagId;
        currentRtGoalId = goalKeep(r.goalId); // V40.34.0
        currentRtMicroblocks = JSON.parse(JSON.stringify(r.microblocks || []));
        document.getElementById('rt-form-delete-btn').classList.remove('hidden');
        document.getElementById('rt-form-delete-btn').classList.add('flex');
    } else {
        document.getElementById('rt-form-title-label').innerText = 'Nova Rotina';
        document.getElementById('rt-form-emoji').value = '';
        document.getElementById('rt-form-title').value = '';
        currentRtDur = 120;
        currentRtTheme = 'focus';
        currentRtTagId = null;
        currentRtGoalId = null; // V40.34.0
        currentRtMicroblocks = [{title: ''}];
        document.getElementById('rt-form-delete-btn').classList.add('hidden');
        document.getElementById('rt-form-delete-btn').classList.remove('flex');
    }
    
    updateRtFormVisuals();
    renderRtFormMicroblocks();
}

window.closeRoutineForm = function(force = false) {
    const formView = document.getElementById('routines-form-view');
    const listView = document.getElementById('routines-list-view');
    if (!formView || !listView) return;
    formView.classList.add('hidden');
    formView.classList.remove('flex');
    listView.classList.remove('hidden');
    if (!force) renderRoutinesList();
}

// ============================================================================
// V40.9.0 — COR LIVRE DO CARTÃO (independente da tag) e ARQUIVO
// ----------------------------------------------------------------------------
// Cor: campo opcional `color` (#rrggbb) em tarefas da Lista e blocos da agenda.
//   Pinta o cartão inteiro; a faixa lateral da tag continua. Concluído segue verde.
// Arquivo: o item SAI de backlogDb/db e vai pra archiveDb (tb_archive_db). Assim a
//   timeline e as listas não precisam saber de "arquivado". Desarquivar devolve.
// ============================================================================
const FAZ_CARD_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f472b6', '#64748b'];
function fazCardColor(c) { return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c.toLowerCase() : null; }
function fazIsDark(hex) { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 165; }
function fazRenderColorPicker(containerId, current, fn) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const cur = fazCardColor(current), custom = cur && !FAZ_CARD_COLORS.includes(cur);
    const ring = (on) => on ? 'border-zinc-900 scale-110 shadow' : 'border-white shadow-sm';
    el.innerHTML =
        `<button type="button" onclick="${fn}(null)" class="h-8 px-3 rounded-full border text-[11px] font-bold transition ${!cur ? 'bg-zinc-900 border-zinc-900 text-white' : 'bg-white border-zinc-200 text-zinc-600'}">Sem cor</button>` +
        FAZ_CARD_COLORS.map(c => `<button type="button" onclick="${fn}('${c}')" aria-label="Cor ${c}" class="w-8 h-8 rounded-full border-2 transition ${ring(cur === c)}" style="background-color:${c}"></button>`).join('') +
        `<label class="relative w-8 h-8 rounded-full border-2 overflow-hidden cursor-pointer ${ring(custom)}" style="background:${custom ? cur : 'conic-gradient(#ef4444,#f59e0b,#10b981,#3b82f6,#8b5cf6,#ec4899,#ef4444)'}" title="Outra cor">` +
        `<input type="color" value="${cur || '#ec4899'}" onchange="${fn}(this.value)" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" aria-label="Escolher outra cor"></label>`;
}

let archiveDb = fazLoadList('tb_archive_db', []);
function saveArchive() { localStorage.setItem('tb_archive_db', JSON.stringify(archiveDb)); if (window.fazSyncNotify) window.fazSyncNotify(); undoTouch('arquivo'); }

// Primeiro horário livre do dia pra um bloco: o próprio horário, depois o fim de cada bloco.
function fazFreeSlot(dateStr, startMin, duration) {
    const day = db.filter(b => b.date === dateStr);
    const fits = (st) => st >= 0 && st + duration <= 1440 && !day.some(b => st < b.startMin + b.duration && b.startMin < st + duration);
    if (fits(startMin)) return startMin;
    const ends = day.map(b => b.startMin + b.duration).sort((a, b) => a - b);
    for (const st of ends.filter(x => x >= startMin).concat(ends)) if (fits(st)) return st;
    return null;
}

window.fazArchiveTask = function(id) {
    const i = backlogDb.findIndex(x => x.id === id);
    if (i < 0) return;
    archiveDb.unshift({ kind: 'tarefa', archivedAt: Date.now(), item: backlogDb.splice(i, 1)[0] });
    saveBacklog(); saveArchive();
    closeBacklogForm(true);
    renderBacklog();
    showToast('Arquivado! Está em Config → Arquivados');
};

window.fazArchiveBlock = function(id, e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const i = db.findIndex(x => x.id === id);
    if (i < 0) return;
    const item = db.splice(i, 1)[0];
    item.expanded = false;
    archiveDb.unshift({ kind: 'bloco', archivedAt: Date.now(), item: item });
    saveDb(); saveArchive();
    renderTimeline();
    showToast('Arquivado! Está em Config → Arquivados');
};

window.fazUnarchive = function(id) {
    const i = archiveDb.findIndex(a => a && a.item && a.item.id === id);
    if (i < 0) return;
    const a = archiveDb[i];
    if (a.kind === 'bloco') {
        const slot = fazFreeSlot(a.item.date, a.item.startMin, a.item.duration);
        if (slot === null) return showToast('Esse dia está sem espaço livre pra esse bloco.');
        a.item.startMin = slot;
        a.item.expanded = false;
        db.push(a.item);
        saveDb();
    } else {
        if (!backlogColumnsDb.some(c => c.id === getItemColumn(a.item))) a.item.columnId = backToListColumn(null).id; // lista apagada → a primeira lista (V40.38.0; antes: a padrão)
        backlogDb.push(a.item);
        saveBacklog();
    }
    archiveDb.splice(i, 1);
    saveArchive();
    renderArchive(); renderTimeline(); renderBacklog();
    showToast('Desarquivado!');
};

window.fazDeleteArchived = function(id) {
    const a = archiveDb.find(x => x && x.item && x.item.id === id);
    if (!a || !confirm('Apagar "' + (a.item.title || 'sem nome') + '" de vez?')) return; // V40.25.0: dá pra desfazer logo depois (barrinha)
    archiveDb = archiveDb.filter(x => x !== a);
    saveArchive();
    renderArchive();
    showToast('Apagado.');
};

function renderArchive() {
    const el = document.getElementById('config-archive-list');
    if (!el) return;
    if (archiveDb.length === 0) {
        el.innerHTML = `<div class="text-center py-12 px-6"><i class="ph ph-archive text-4xl text-zinc-300"></i><p class="text-sm font-medium text-zinc-500 mt-2">Nada arquivado.</p><p class="text-[11px] text-zinc-400 mt-1">Arquive uma tarefa pelo formulário dela, ou um bloco pelo botão Arquivar.</p></div>`;
        return;
    }
    el.innerHTML = archiveDb.map(a => {
        const it = a.item || {}, isBlock = a.kind === 'bloco';
        const col = backlogColumnsDb.find(c => c.id === (it.columnId || 'col_geral'));
        const d = isBlock && /^\d{4}-\d{2}-\d{2}$/.test(it.date || '') ? it.date.slice(8, 10) + '/' + it.date.slice(5, 7) : '';
        const where = isBlock ? `Agenda · ${d} às ${formatClock(it.startMin || 0)}` : `Lista · ${escapeHtml(col ? col.name : 'padrão')}`;
        const paint = fazCardColor(it.color);
        return `
        <div class="flex items-center gap-3 p-3 mb-2 bg-zinc-50 border border-zinc-200 rounded-xl" style="${paint ? `border-left: 5px solid ${paint};` : ''}">
            <div class="min-w-0 flex-1">
                <p class="font-bold text-sm text-zinc-800 truncate">${escapeHtml(it.title || 'Sem nome')}</p>
                <p class="text-[11px] text-zinc-500 font-medium truncate">${where} · ${formatDur(it.duration || 0)}</p>
            </div>
            <button onclick="fazUnarchive('${it.id}')" class="shrink-0 px-3 py-2 rounded-lg bg-white border border-app-focus text-app-focus text-[11px] font-bold active:scale-95 transition">Desarquivar</button>
            <button onclick="fazDeleteArchived('${it.id}')" class="shrink-0 w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg active:scale-95 transition" title="Apagar de vez"><i class="ph ph-trash text-sm"></i></button>
        </div>`;
    }).join('');
}

window.openConfigArchive = function() {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-archive-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Arquivados';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigArchive()');
    renderArchive();
};

window.closeConfigArchive = function() {
    document.getElementById('config-archive-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
};

// ---------- V40.42.0: AVISOS DOS COMPROMISSOS (a tela; a lógica fica no avisos.js, igual no PC) ----------
// Config → "Avisos dos compromissos": ligar/desligar NESTE aparelho, quanto tempo antes (na hora, 5, 10, 15 ou 30 min)
// e "Mandar um aviso de teste". Precisa da conta (quem avisa é a nuvem, olhando a agenda da conta). No iPhone, só com
// o app instalado na tela de início. O estado fica só neste aparelho (tb__avisos, fora do backup).
let avisosConta = null, avisosBusy = false; // avisosConta: null = conferindo; true/false
function avisosMenuStatus() {
    const el = document.getElementById('avisos-menu-status');
    if (!el) return;
    const r = window.FazAvisos ? window.FazAvisos.resumo() : '';
    el.textContent = r || 'Aviso antes de cada compromisso';
    el.classList.toggle('text-app-focus', !!r);
    el.classList.toggle('text-zinc-500', !r);
}
function avisosMsg(t, ruim) {
    const p = document.getElementById('avisos-msg');
    if (!p) return;
    p.textContent = t || '';
    p.classList.toggle('text-red-600', !!ruim);
    p.classList.toggle('font-semibold', !!ruim);
    p.classList.toggle('text-zinc-500', !ruim);
}
function renderAvisos() {
    const view = document.getElementById('config-avisos-view');
    if (!view || view.classList.contains('hidden')) return;
    const A = window.FazAvisos, st = A ? A.estado() : { suporte: 'suporte', permissao: 'default', on: false, minutos: 10 };
    const prontoPraLigar = !!A && st.suporte === 'ok' && avisosConta === true;
    let titulo, texto, botao = '', acao = '', ligado = false;
    if (!A || st.suporte === 'suporte') { titulo = 'Este navegador não mostra avisos'; texto = 'Os avisos funcionam no Chrome e no Edge (Android e computador), no Firefox, no Safari do Mac e no iPhone com o Faz instalado na tela de início.'; }
    else if (st.suporte === 'iphone') { titulo = 'Instale o Faz na tela de início'; texto = 'No iPhone os avisos só funcionam com o app instalado: toque em Compartilhar (no iOS 26 ele fica nos ⋯ da barra de endereço) e depois em Adicionar à Tela de Início. Abra o Faz por lá e volte aqui.'; }
    else if (st.suporte === 'ios-velho') { titulo = 'Precisa de um iOS mais novo'; texto = 'No iPhone os avisos precisam do iOS 16.4 ou mais novo. Atualize o iPhone em Ajustes → Geral → Atualização de Software.'; }
    else if (avisosConta === null) { titulo = 'Conferindo a conta…'; texto = 'Um instante.'; }
    else if (avisosConta === false) { titulo = 'Entre na sua conta primeiro'; texto = 'Quem avisa é a nuvem, olhando a agenda da sua conta. Entre em Sincronizar com a nuvem e depois volte aqui.'; botao = 'Entrar na conta'; acao = 'conta'; }
    else if (st.on) { titulo = 'Avisos ligados neste aparelho'; texto = 'Avisa ' + (st.minutos ? st.minutos + ' min antes de' : 'na hora de') + ' cada compromisso da agenda, mesmo com o app fechado.'; botao = 'Desligar os avisos'; acao = 'desligar'; ligado = true; }
    else if (st.permissao === 'denied') { titulo = 'As notificações estão bloqueadas'; texto = 'Libere as notificações do Faz nas configurações do celular (no computador, no cadeado da barra de endereço) e toque em Ligar de novo.'; botao = 'Ligar os avisos'; acao = 'ligar'; }
    else { titulo = 'Avisos desligados neste aparelho'; texto = 'Ligue pra receber um aviso antes de cada compromisso da agenda, mesmo com o app fechado.'; botao = 'Ligar os avisos'; acao = 'ligar'; }
    document.getElementById('avisos-titulo').textContent = titulo;
    document.getElementById('avisos-texto').textContent = texto;
    const ic = document.getElementById('avisos-icone');
    ic.className = 'w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ' + (ligado ? 'bg-rose-50 text-rose-600' : 'bg-zinc-100 text-zinc-500');
    ic.innerHTML = '<i class="ph ' + (ligado ? 'ph-bell-ringing' : 'ph-bell-slash') + ' text-xl"></i>';
    const b = document.getElementById('avisos-ligar');
    b.className = 'w-full rounded-xl px-3 py-3 text-sm font-bold hover:opacity-90 transition flex items-center justify-center gap-2 mb-3 disabled:opacity-60 ' +
        (ligado ? 'bg-white text-zinc-700 border border-zinc-200' : 'bg-app-focus text-white shadow-md') + (botao ? '' : ' hidden');
    b.dataset.acao = acao;
    b.disabled = avisosBusy;
    b.querySelector('span').textContent = botao;
    b.querySelector('i').className = 'ph ' + (acao === 'conta' ? 'ph-sign-in' : ligado ? 'ph-bell-slash' : 'ph-bell-ringing') + ' text-lg';
    const chips = document.getElementById('avisos-minutos');
    chips.innerHTML = (A ? A.MINUTOS : [0, 5, 10, 15, 30]).map((m) => {
        const on = m === st.minutos;
        return `<button type="button" role="radio" aria-checked="${on}" data-avisos-min="${m}" ${!prontoPraLigar || avisosBusy ? 'disabled' : ''} onclick="fazAvisosMinutos(${m})" class="py-2 rounded-lg border text-[12px] font-bold transition active:scale-95 disabled:opacity-40 ${on ? 'bg-app-focus border-app-focus text-white' : 'bg-white border-zinc-200 text-zinc-700'}">${A ? A.rotulo(m) : m}</button>`;
    }).join('');
    const t = document.getElementById('avisos-teste');
    t.disabled = !(prontoPraLigar && st.on) || avisosBusy;
    avisosMenuStatus();
}
window.openConfigAvisos = function() {
    document.getElementById('config-main-menu').classList.add('hidden');
    document.getElementById('config-avisos-view').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Avisos';
    document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigAvisos()');
    avisosMsg('');
    avisosConta = null;
    renderAvisos();
    const A = window.FazAvisos;
    const conferir = typeof window.fazSyncConta === 'function' ? window.fazSyncConta() : Promise.resolve(null);
    conferir.then((c) => {
        avisosConta = !!c;
        renderAvisos();
        if (c && A && A.estado().suporte === 'ok') A.revalidar().then(() => { A.preparar(); renderAvisos(); }); // deixa a inscrição na mão: no iPhone ela sai direto do toque
    }, () => { avisosConta = false; renderAvisos(); });
};
window.closeConfigAvisos = function() {
    document.getElementById('config-avisos-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
    avisosMenuStatus();
};
// Ligar / Desligar / Entrar na conta. Ligar chama o FazAvisos.ligar() direto do toque, sem esperar nada antes.
window.fazAvisosBotao = function() {
    const A = window.FazAvisos, acao = document.getElementById('avisos-ligar').dataset.acao;
    if (acao === 'conta') { closeConfigAvisos(); openConfigSync(); return; }
    if (!A || avisosBusy || (acao !== 'ligar' && acao !== 'desligar')) return;
    const p = acao === 'ligar' ? A.ligar(A.estado().minutos) : A.desligar();
    avisosBusy = true;
    avisosMsg(acao === 'ligar' ? 'Ligando…' : 'Desligando…');
    renderAvisos();
    p.then((r) => {
        avisosBusy = false;
        if (r && r.ok) avisosMsg(acao === 'ligar' ? 'Pronto! Toque em "Mandar um aviso de teste" pra ver como chega.' : 'Avisos desligados neste aparelho.');
        else avisosMsg(A.texto(r && r.erro), true);
        renderAvisos();
    }, () => { avisosBusy = false; avisosMsg(A.texto('rede'), true); renderAvisos(); });
};
window.fazAvisosMinutos = function(m) {
    const A = window.FazAvisos;
    if (!A || avisosBusy || m === A.estado().minutos) return;
    avisosBusy = true;
    avisosMsg('');
    renderAvisos();
    A.mudarMinutos(m).then((r) => {
        avisosBusy = false;
        if (r && r.ok) avisosMsg(A.estado().on ? 'Agora avisa ' + (m ? m + ' min antes.' : 'na hora.') : '');
        else avisosMsg(A.texto(r && r.erro), true);
        renderAvisos();
    }, () => { avisosBusy = false; avisosMsg(A.texto('rede'), true); renderAvisos(); });
};
window.fazAvisosTestar = function() {
    const A = window.FazAvisos;
    if (!A || avisosBusy) return;
    avisosBusy = true;
    avisosMsg('Mandando…');
    renderAvisos();
    A.testar().then((r) => {
        avisosBusy = false;
        if (r && r.ok) avisosMsg('Enviado! O aviso chega em alguns segundos.');
        else avisosMsg(A.texto(r && r.erro), true);
        renderAvisos();
    }, () => { avisosBusy = false; avisosMsg(A.texto('rede'), true); renderAvisos(); });
};
window.fazAvisosMudou = () => { renderAvisos(); avisosMenuStatus(); }; // o avisos.js chama quando o estado muda (ex.: tiraram a permissão)

// V40.8.0: duração mínima de 5 min. Abaixo de 15 anda de 5 em 5 (15 → 10 → 5);
// acima de 15 mantém o passo do botão e sempre para no 15.
function fazStepDuration(cur, delta) {
    const next = delta < 0 ? (cur <= 15 ? cur - 5 : Math.max(15, cur + delta)) : (cur < 15 ? cur + 5 : cur + delta);
    return Math.min(480, Math.max(5, next));
}

window.changeRoutineFormDuration = function(delta) {
    currentRtDur = fazStepDuration(currentRtDur, delta);
    updateRtFormVisuals();
}

window.selectRoutineFormTheme = function(theme) {
    currentRtTheme = theme;
    updateRtFormVisuals();
}

window.selectRoutineFormTag = function(tagId) {
    currentRtTagId = currentRtTagId === tagId ? null : tagId;
    updateRtFormVisuals();
}
window.selectRoutineFormGoal = function(id) { currentRtGoalId = goalKeep(id || null); updateRtFormVisuals(); }; // V40.34.0

function updateRtFormVisuals() {
    document.getElementById('rt-form-dur-label').innerText = formatDur(currentRtDur);
    
    const btnFocus = document.getElementById('rt-theme-focus');
    const btnRest = document.getElementById('rt-theme-rest');
    if (currentRtTheme === 'focus') {
        btnFocus.className = 'flex-1 py-2.5 rounded-xl font-bold text-sm transition border bg-app-focus text-white border-transparent shadow-sm';
        btnRest.className = 'flex-1 py-2.5 rounded-xl font-bold text-sm transition border bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50';
    } else {
        btnRest.className = 'flex-1 py-2.5 rounded-xl font-bold text-sm transition border bg-zinc-700 text-white border-transparent shadow-sm';
        btnFocus.className = 'flex-1 py-2.5 rounded-xl font-bold text-sm transition border bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50';
    }

    const tagContainer = document.getElementById('rt-form-tag-container');
    if (tagContainer) {
        let html = `<button onclick="selectRoutineFormTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-xs font-bold transition whitespace-nowrap ${currentRtTagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'}">Sem Tag</button>`;
        tagsDb.forEach(t => {
            const isActive = currentRtTagId === t.id;
            const bgColor = isActive ? t.color : t.color + '15';
            const textColor = isActive ? '#fff' : t.color;
            const borderColor = isActive ? t.color : t.color + '40';
            const dotColor = isActive ? '#fff' : t.color;
            const extraClass = isActive ? 'shadow-md' : 'opacity-80 hover:opacity-100';
            html += `<button onclick="selectRoutineFormTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${extraClass}" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${dotColor};"></div>${escapeHtml(t.name)}</button>`;
        });
        tagContainer.innerHTML = html;
    }
    goalPickFill('rt-form-goal-wrap', 'rt-form-goal-container', currentRtGoalId, 'selectRoutineFormGoal'); // V40.34.0
}

function syncRtMicroblocksFromDOM() {
    currentRtMicroblocks = Array.from(document.querySelectorAll('.rt-mb-input')).map(input => ({ title: input.value }));
}

window.addRoutineMicroblockForm = function() {
    syncRtMicroblocksFromDOM();
    currentRtMicroblocks.push({title: ''});
    renderRtFormMicroblocks();
}

window.removeRoutineMicroblockForm = function(index) {
    syncRtMicroblocksFromDOM();
    currentRtMicroblocks.splice(index, 1);
    renderRtFormMicroblocks();
}

function renderRtFormMicroblocks() {
    const container = document.getElementById('rt-form-microblocks');
    if (!container) return;
    container.innerHTML = currentRtMicroblocks.map((mb, i) => `
        <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-md border border-zinc-300 shrink-0 bg-zinc-50 flex items-center justify-center"><i class="ph ph-check text-[10px] text-zinc-300"></i></div>
            <input type="text" class="rt-mb-input flex-1 h-10 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-app-focus focus:bg-white transition" placeholder="Ex: Ler 10 páginas" value="${escapeHtml(mb.title)}">
            <button onclick="removeRoutineMicroblockForm(${i})" class="w-8 h-10 flex items-center justify-center text-zinc-400 hover:text-red-500 transition shrink-0"><i class="ph ph-x"></i></button>
        </div>
    `).join('');
}

window.saveRoutine = function() {
    const emoji = document.getElementById('rt-form-emoji').value.trim() || '✨';
    const title = document.getElementById('rt-form-title').value.trim();
    
    if (!title) return showToast('A rotina precisa de um nome.');

    syncRtMicroblocksFromDOM();
    const validMbs = currentRtMicroblocks.filter(mb => mb.title.trim() !== '').map(mb => ({ title: mb.title.trim() }));

    if (currentRtId) {
        const r = routinesDb.find(x => x.id === currentRtId);
        if (r) {
            r.emoji = emoji;
            r.title = title;
            r.duration = currentRtDur;
            r.theme = currentRtTheme;
            r.tagId = currentRtTagId;
            if (goalKeep(currentRtGoalId)) r.goalId = currentRtGoalId; else delete r.goalId; // V40.34.0
            r.microblocks = validMbs;
        }
        showToast('Rotina atualizada!');
    } else {
        routinesDb.push({
            id: 'rt_' + Date.now(),
            title: title, emoji: emoji,
            duration: currentRtDur, theme: currentRtTheme, tagId: currentRtTagId,
            ...(goalKeep(currentRtGoalId) ? { goalId: currentRtGoalId } : {}), // V40.34.0
            microblocks: validMbs, createdAt: Date.now()
        });
        showToast('Rotina criada!');
    }
    
    saveRoutinesDb();
    closeRoutineForm();
}

let pendingRoutineDeleteId = null;

// V40.3.5-fix: nova função pra apagar rotina direto da lista (sem precisar abrir form).
// Issue 1 do Gemini: lixeira no card precisava existir.
window.requestDeleteRoutine = function(id) {
    pendingRoutineDeleteId = id;
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    // Issue 2 do Gemini: sheet tem z-50, overlay padrão é z-40. Sobe overlay pra z-55 (>sheet, <modal z-60)
    // pra bloquear cliques na sheet enquanto o modal está aberto.
    overlay.style.zIndex = '55';
    document.getElementById('routine-delete-modal').classList.remove('hidden');
    document.getElementById('routine-delete-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

// V40.3.5-fix: deleteRoutineFromForm agora delega pra requestDeleteRoutine (DRY).
window.deleteRoutineFromForm = function() {
    if (!currentRtId) return;
    requestDeleteRoutine(currentRtId);
}

window.confirmDeleteRoutine = function() {
    if (!pendingRoutineDeleteId) return;
    // Issue 3 do Gemini: limpa ID do Set de expansão pra não vazar memória.
    expandedRoutineIds.delete(pendingRoutineDeleteId);
    routinesDb = routinesDb.filter(x => x.id !== pendingRoutineDeleteId);
    saveRoutinesDb();
    pendingRoutineDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = ''; // Issue 2: devolve z-index ao normal (z-40 do CSS)
    document.getElementById('routine-delete-modal').classList.add('hidden');
    document.getElementById('routine-delete-modal').classList.remove('flex');
    // Se o form estiver aberto editando essa rotina, fecha
    if (typeof closeRoutineForm === 'function') closeRoutineForm();
    renderRoutinesList();
    showToast('Rotina apagada.');
}

window.cancelDeleteRoutine = function() {
    pendingRoutineDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = ''; // Issue 2: devolve z-index ao normal
    document.getElementById('routine-delete-modal').classList.add('hidden');
    document.getElementById('routine-delete-modal').classList.remove('flex');
}

// =====================================================
// V40.3.4 — REDESIGN DA LISTA (Backlog com form + editar + checklist)
// =====================================================
// Refatora a aba Lista pra ter o mesmo padrão de Rotinas:
// - 2 sub-views: lista de tarefas + formulário (criar/editar)
// - Botão "+ Nova Tarefa" abre form vazio
// - Toque no card abre form preenchido (editar)
// - Cards com ✋ + 🗑️ no INÍCIO (decisão visual do usuário)
// - Suporta checklist (microblocks) — preserva compat com moveToBacklog fix5
//
// Armadilhas tratadas (C1-C15):
//   C1, C12: input 'backlog-input' mantido com mesmo ID (refs antigas continuam funcionando)
//   C3, C4: scheduleBacklogItem e deleteBacklogItem NÃO TOCADAS
//   C5: openBacklogForm(id) cria/edita igual openRoutineForm
//   C7: ícone do botão Nova Tarefa = ph-plus (mesmo do FAB+ grande)
//   C9: botões ✋ e 🗑️ no INÍCIO do card (flex order)
//   C10: checklist preview com 3 primeiros + "mais X"
//   C11: event.stopPropagation() nos botões (toque no card abre edit)
//   C13: stepper -15/+15 (igual rotinas) em vez de quick buttons

let currentBlId = null;
let currentBlColor = null; // V40.9.0: cor livre do cartão
window.fazPickBlColor = function(c) { currentBlColor = fazCardColor(c); fazRenderColorPicker('bl-form-colors', currentBlColor, 'fazPickBlColor'); };
let currentBlDur = 30;
let currentBlTagId = null;
let currentBlGoalId = null; // V40.34.0
let currentBlMicroblocks = [];

// V40.3.5-fix2: expandedBacklogIds movida pro topo do arquivo (linha ~36) pra evitar TDZ.
// Declaração aqui REMOVIDA (era `let expandedBacklogIds = new Set();`).

window.openBacklogForm = function(id = null) {
    document.getElementById('backlog-list-view').classList.add('hidden');
    document.getElementById('backlog-form-view').classList.remove('hidden');
    document.getElementById('backlog-form-view').classList.add('flex');
    
    currentBlId = id;
    
    if (id) {
        const item = backlogDb.find(x => x.id === id);
        if (!item) return;
        document.getElementById('bl-form-title-label').innerText = 'Editar Tarefa';
        document.getElementById('backlog-input').value = item.title;
        currentBlDur = item.duration;
        currentBlTagId = item.tagId || null;
        currentBlGoalId = goalKeep(item.goalId); // V40.34.0
        currentBlColor = fazCardColor(item.color);
        currentBlMicroblocks = JSON.parse(JSON.stringify(item.microblocks || []));
        document.getElementById('bl-form-delete-btn').classList.remove('hidden');
        document.getElementById('bl-form-delete-btn').classList.add('flex');
        document.getElementById('bl-form-archive-btn').classList.remove('hidden');
        document.getElementById('bl-form-archive-btn').classList.add('flex');
    } else {
        document.getElementById('bl-form-title-label').innerText = 'Nova Tarefa';
        document.getElementById('backlog-input').value = '';
        currentBlDur = 30;
        currentBlTagId = null;
        currentBlGoalId = null; // V40.34.0
        currentBlColor = null;
        currentBlMicroblocks = []; // C14: começa vazio
        document.getElementById('bl-form-delete-btn').classList.add('hidden');
        document.getElementById('bl-form-delete-btn').classList.remove('flex');
        document.getElementById('bl-form-archive-btn').classList.add('hidden');
        document.getElementById('bl-form-archive-btn').classList.remove('flex');
    }
    
    updateBacklogFormVisuals();
    renderBlFormMicroblocks();
    fazRenderColorPicker('bl-form-colors', currentBlColor, 'fazPickBlColor'); // V40.9.0
}

window.closeBacklogForm = function(force = false) {
    const formView = document.getElementById('backlog-form-view');
    const listView = document.getElementById('backlog-list-view');
    if (!formView || !listView) return;
    formView.classList.add('hidden');
    formView.classList.remove('flex');
    listView.classList.remove('hidden');
    if (!force) renderBacklog();
}

window.changeBacklogFormDuration = function(delta) {
    currentBlDur = fazStepDuration(currentBlDur, delta);
    updateBacklogFormVisuals();
}

window.selectBacklogFormTag = function(tagId) {
    currentBlTagId = currentBlTagId === tagId ? null : tagId;
    updateBacklogFormVisuals();
}
window.selectBacklogFormGoal = function(id) { currentBlGoalId = goalKeep(id || null); updateBacklogFormVisuals(); }; // V40.34.0

function updateBacklogFormVisuals() {
    const durLabel = document.getElementById('bl-form-dur-label');
    if (durLabel) durLabel.innerText = formatDur(currentBlDur);
    
    const tagContainer = document.getElementById('bl-form-tag-container');
    if (tagContainer) {
        let html = `<button onclick="selectBacklogFormTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-xs font-bold transition whitespace-nowrap ${currentBlTagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100'}">Sem Tag</button>`;
        tagsDb.forEach(t => {
            const isActive = currentBlTagId === t.id;
            const bgColor = isActive ? t.color : t.color + '15';
            const textColor = isActive ? '#fff' : t.color;
            const borderColor = isActive ? t.color : t.color + '40';
            const dotColor = isActive ? '#fff' : t.color;
            const extraClass = isActive ? 'shadow-md' : 'opacity-80 hover:opacity-100';
            html += `<button onclick="selectBacklogFormTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition whitespace-nowrap ${extraClass}" style="background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${dotColor};"></div>${escapeHtml(t.name)}</button>`;
        });
        tagContainer.innerHTML = html;
    }
    goalPickFill('bl-form-goal-wrap', 'bl-form-goal-container', currentBlGoalId, 'selectBacklogFormGoal'); // V40.34.0
    goalNamePlaceholder('backlog-input', currentBlGoalId, 'Nome da tarefa'); // V40.36.1
}

function syncBlMicroblocksFromDOM() {
    currentBlMicroblocks = Array.from(document.querySelectorAll('.bl-mb-input')).map(input => ({ title: input.value }));
}

window.addBacklogMicroblockForm = function() {
    syncBlMicroblocksFromDOM();
    currentBlMicroblocks.push({title: ''});
    renderBlFormMicroblocks();
}

window.removeBacklogMicroblockForm = function(index) {
    syncBlMicroblocksFromDOM();
    currentBlMicroblocks.splice(index, 1);
    renderBlFormMicroblocks();
}

function renderBlFormMicroblocks() {
    const container = document.getElementById('bl-form-microblocks');
    if (!container) return;
    // V40.3.5 Ajuste 1: removido texto "Sem checklist (opcional)" — vazio fica vazio mesmo.
    // User adiciona via botão "+ Adicionar item" embaixo.
    container.innerHTML = currentBlMicroblocks.map((mb, i) => `
        <div class="flex items-center gap-2">
            <div class="w-5 h-5 rounded-md border border-zinc-300 shrink-0 bg-zinc-50 flex items-center justify-center"><i class="ph ph-check text-[10px] text-zinc-300"></i></div>
            <input type="text" data-mb-idx="${i}" class="bl-mb-input flex-1 h-10 bg-zinc-50 border border-zinc-200 rounded-lg px-3 text-sm text-zinc-800 placeholder-zinc-400 outline-none focus:border-app-focus focus:bg-white transition" placeholder="Ex: Comprar leite" value="${escapeHtml(mb.title)}">
            <button onclick="removeBacklogMicroblockForm(${i})" class="w-8 h-10 flex items-center justify-center text-zinc-400 hover:text-red-500 transition shrink-0"><i class="ph ph-x"></i></button>
        </div>
    `).join('');
    
    // V40.3.8: setup do listener de Enter uma vez (idempotente — flag impede attach duplicado).
    if (!container.dataset.enterListenerAttached) {
        container.addEventListener('keypress', (e) => {
            if (e.key !== 'Enter') return;
            if (!e.target.classList.contains('bl-mb-input')) return;
            e.preventDefault();
            
            const idx = parseInt(e.target.dataset.mbIdx, 10);
            const inputs = container.querySelectorAll('.bl-mb-input');
            const isLast = idx === inputs.length - 1;
            
            // Sincroniza o valor atual antes de qualquer ação (senão pode perder o que o user digitou).
            syncBlMicroblocksFromDOM();
            
            if (isLast) {
                // Último check → cria um novo vazio e foca nele.
                addBacklogMicroblockForm();
                setTimeout(() => {
                    const newInputs = container.querySelectorAll('.bl-mb-input');
                    const newLast = newInputs[newInputs.length - 1];
                    if (newLast) {
                        newLast.focus({ preventScroll: true });
                        // V40.4.4-fix4: rola o CONTAINER interno (não a página) pro novo check ficar
                        // visível acima do teclado. preventScroll evita o buraco branco da Regra de Ouro #2.
                        scrollNewCheckIntoView(newLast);
                    }
                }, 50);
            } else {
                // Foca o próximo input.
                const next = inputs[idx + 1];
                if (next) {
                    next.focus({ preventScroll: true });
                    scrollNewCheckIntoView(next);
                }
            }
        });
        container.dataset.enterListenerAttached = 'true';
    }
}

// V40.4.4-fix4: rola APENAS o scroller interno do form pra trazer o check à vista.
// NÃO usa scrollIntoView (que rola a página/body — causa "buraco branco" no PWA Android).
function scrollNewCheckIntoView(inputEl) {
    if (!inputEl) return;
    // Procura o ancestral scrollável (o div com overflow-y-auto dentro do bl-form-view)
    let scroller = inputEl.parentElement;
    while (scroller && scroller !== document.body) {
        const style = window.getComputedStyle(scroller);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
        scroller = scroller.parentElement;
    }
    if (!scroller || scroller === document.body) return;
    
    // Calcula offset relativo: posição do input dentro do scroller
    const inputRect = inputEl.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    const relTop = inputRect.top - scrollerRect.top + scroller.scrollTop;
    
    // Rola pra colocar o input ~no meio da área visível do scroller (não no final perto do teclado)
    const target = relTop - (scrollerRect.height / 3);
    scroller.scrollTo({ top: target, behavior: 'smooth' });
}

window.saveBacklogForm = function() {
    const bg = goalById(goalKeep(currentBlGoalId));
    const title = document.getElementById('backlog-input').value.trim() || (bg ? String(bg.title || '').trim() : ''); // V40.36.1: vazio com meta = nome da meta
    if (!title) return showToast('A tarefa precisa de um nome.');

    syncBlMicroblocksFromDOM();
    const validMbs = currentBlMicroblocks.filter(mb => mb.title.trim() !== '').map(mb => ({ title: mb.title.trim(), done: false }));

    if (currentBlId) {
        const item = backlogDb.find(x => x.id === currentBlId);
        if (item && blSearchQ) blSearchKeep.add(item.id); // V40.39.0: editado durante a busca continua na tela
        if (item) {
            item.title = title;
            item.duration = currentBlDur;
            item.tagId = currentBlTagId;
            if (goalKeep(currentBlGoalId)) item.goalId = currentBlGoalId; else delete item.goalId; // V40.34.0
            item.microblocks = validMbs;
            if (currentBlColor) item.color = currentBlColor; else delete item.color; // V40.9.0
        }
        showToast('Tarefa atualizada!');
    } else {
        const newId = 'bl_' + Date.now();
        if (blSearchQ) blSearchKeep.add(newId); // V40.39.0: criado durante a busca aparece mesmo sem bater com ela
        backlogDb.push({
            id: newId,
            title: title,
            duration: currentBlDur,
            tagId: currentBlTagId,
            microblocks: validMbs,
            ...(currentBlColor ? { color: currentBlColor } : {}), // V40.9.0
            ...(goalKeep(currentBlGoalId) ? { goalId: currentBlGoalId } : {}), // V40.34.0
            columnId: activeColumnId || 'col_geral'  // V40.5.0: nova tarefa nasce na coluna ativa
        });
        showToast('Tarefa adicionada!');
    }
    
    saveBacklog();
    closeBacklogForm();
}

// V40.3.5: deletar tarefa com modal de confirmação (igual Rotinas).
// Caminhos: requestDeleteBacklog(id) abre modal → confirmDeleteBacklog() apaga / cancelDeleteBacklog() fecha.
let pendingBacklogDeleteId = null;

window.requestDeleteBacklog = function(id) {
    pendingBacklogDeleteId = id;
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    // Issue 2 do Gemini: sheet (z-50) ficaria clicável atrás do modal (z-60). 
    // Sobe overlay pra z-55 (entre sheet e modal) pra bloquear cliques na sheet.
    overlay.style.zIndex = '55';
    document.getElementById('backlog-delete-modal').classList.remove('hidden');
    document.getElementById('backlog-delete-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

window.confirmDeleteBacklog = function() {
    if (!pendingBacklogDeleteId) return;
    // Issue 3 do Gemini: limpa ID do Set de expansão pra não vazar memória.
    expandedBacklogIds.delete(pendingBacklogDeleteId);
    backlogDb = backlogDb.filter(x => x.id !== pendingBacklogDeleteId);
    saveBacklog();
    pendingBacklogDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = ''; // Issue 2: devolve z-index ao normal (z-40 do CSS)
    document.getElementById('backlog-delete-modal').classList.add('hidden');
    document.getElementById('backlog-delete-modal').classList.remove('flex');
    // Se o form estiver aberto editando esse item, fecha
    if (typeof closeBacklogForm === 'function') closeBacklogForm();
    renderBacklog();
    showToast('Tarefa apagada.');
}

window.cancelDeleteBacklog = function() {
    pendingBacklogDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = ''; // Issue 2: devolve z-index ao normal
    document.getElementById('backlog-delete-modal').classList.add('hidden');
    document.getElementById('backlog-delete-modal').classList.remove('flex');
}

window.deleteBacklogFromForm = function() {
    if (!currentBlId) return;
    // V40.3.5: agora com confirmação via modal (igual delete de Rotina)
    requestDeleteBacklog(currentBlId);
}


// =====================================================
// V40.5.0 — KANBAN: gerenciamento de colunas (listas)
// =====================================================
// Schema: { id, name, isDefault, createdAt }
// Coluna padrão: id='col_geral', isDefault: true, não pode ser apagada.

// Estado do modal de nome (criar vs renomear)
let columnNameMode = null; // 'create' | 'rename'
let columnNameTargetId = null; // id da coluna sendo renomeada (se mode='rename')

window.promptCreateColumn = function() {
    columnNameMode = 'create';
    columnNameTargetId = null;
    document.getElementById('column-name-title').innerText = 'Nova Lista';
    const input = document.getElementById('column-name-input');
    input.value = '';
    
    showColumnNameModal();
};

window.openColumnMenuFromHeader = function() {
    // Abre o menu da coluna ATIVA atual
    const col = backlogColumnsDb.find(c => c.id === activeColumnId);
    if (!col) return;
    
    document.getElementById('column-menu-title').innerText = col.name;
    columnMenuPosUi(); // V40.33.0
    _colMenuMoves = 0;
    
    // K8: coluna padrão NÃO mostra botão Apagar
    const deleteBtn = document.getElementById('column-menu-delete-btn');
    if (col.isDefault) {
        deleteBtn.classList.add('hidden');
    } else {
        deleteBtn.classList.remove('hidden');
    }
    
    showColumnMenuModal();
};

window.closeColumnMenu = function() {
    hideModal('column-menu-modal');
    // V40.33.0: com a janelinha aberta a barrinha do Desfazer não aparece; ao fechar, ela mostra a última troca de lugar
    if (_colMenuMoves) {
        _colMenuMoves = 0;
        undoClose();
        const top = undoStack[undoStack.length - 1];
        if (top && top.keys && top.keys.listas) undoBarShow(top.label, 'did', 5000);
    }
};

window.openRenameColumn = function() {
    const col = backlogColumnsDb.find(c => c.id === activeColumnId);
    if (!col) return;
    
    hideModal('column-menu-modal');
    
    columnNameMode = 'rename';
    columnNameTargetId = col.id;
    document.getElementById('column-name-title').innerText = 'Renomear Lista';
    document.getElementById('column-name-input').value = col.name;
    
    showColumnNameModal();
};

window.confirmColumnName = function() {
    const input = document.getElementById('column-name-input');
    const name = input.value.trim();
    if (!name) return showToast('Dê um nome pra lista.');
    if (name.length > 30) return showToast('Nome muito longo (máx 30).');
    
    if (columnNameMode === 'create') {
        const newCol = {
            id: 'col_' + Date.now(),
            name: name,
            isDefault: false,
            createdAt: Date.now()
        };
        backlogColumnsDb.push(newCol);
        saveBacklogColumns();
        hideModal('column-name-modal');
        // Vai pra coluna recém-criada
        activeColumnId = newCol.id;
        renderBacklog();
        // Após render, scroll pra coluna nova
        setTimeout(() => scrollToColumn(newCol.id), 100);
        showToast('Lista criada!');
    } else if (columnNameMode === 'rename') {
        const col = backlogColumnsDb.find(c => c.id === columnNameTargetId);
        if (col) {
            col.name = name;
            saveBacklogColumns();
        }
        hideModal('column-name-modal');
        renderBacklog();
        showToast('Lista renomeada!');
    }
};

window.cancelColumnName = function() {
    hideModal('column-name-modal');
};

window.openDeleteColumn = function() {
    const col = backlogColumnsDb.find(c => c.id === activeColumnId);
    if (!col) return;
    if (col.isDefault) return showToast('A lista padrão não pode ser apagada.');
    
    hideModal('column-menu-modal');
    
    const colItems = backlogDb.filter(item => getItemColumn(item) === col.id);
    document.getElementById('column-delete-title').innerText = `Apagar "${col.name}"?`;
    
    let subtitle;
    if (colItems.length === 0) {
        subtitle = 'Esta lista está vazia.';
    } else {
        subtitle = `${colItems.length} ${colItems.length === 1 ? 'tarefa será apagada' : 'tarefas serão apagadas'} junto. Se mudar de ideia, toque em Desfazer logo depois.`; // V40.25.0
    }
    document.getElementById('column-delete-subtitle').innerText = subtitle;
    
    showModal('column-delete-modal');
};

window.confirmDeleteColumn = function() {
    const colId = activeColumnId;
    const col = backlogColumnsDb.find(c => c.id === colId);
    if (!col || col.isDefault) {
        hideModal('column-delete-modal');
        return;
    }
    
    // Apaga TODOS os cards dessa coluna
    backlogDb = backlogDb.filter(item => getItemColumn(item) !== colId);
    
    // Apaga a coluna
    backlogColumnsDb = backlogColumnsDb.filter(c => c.id !== colId);
    
    saveBacklog();
    saveBacklogColumns();
    
    // Volta pra coluna Geral
    activeColumnId = 'col_geral';
    
    hideModal('column-delete-modal');
    renderBacklog();
    showToast('Lista apagada!');
};

window.cancelDeleteColumn = function() {
    hideModal('column-delete-modal');
};

// =====================================================
// V40.5.1 — MOVER CARD PRA OUTRA LISTA
// =====================================================
let _moveCardPendingId = null;

window.openMoveCardModal = function(cardId) {
    const card = backlogDb.find(c => c.id === cardId);
    if (!card) return;
    
    _moveCardPendingId = cardId;
    const currentColId = getItemColumn(card);
    
    // M2: opções = todas colunas EXCETO a atual
    const others = backlogColumnsDb.filter(c => c.id !== currentColId);
    if (others.length === 0) {
        showToast('Não há outras listas pra mover.');
        return;
    }
    
    document.getElementById('column-move-subtitle').innerText = `"${card.title}" pra qual lista?`;
    
    const optionsEl = document.getElementById('column-move-options');
    optionsEl.innerHTML = others.map(col => `
        <button onclick="confirmMoveCard('${col.id}')" class="w-full flex items-center gap-3 py-3 px-4 rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-800 font-bold text-sm hover:bg-zinc-100 active:scale-[0.98] transition">
            <i class="ph-fill ph-list-dashes text-lg text-app-focus"></i>
            <span class="truncate">${escapeHtml(col.name)}</span>
        </button>
    `).join('');
    
    showModal('column-move-modal');
};

window.confirmMoveCard = function(destColId) {
    if (!_moveCardPendingId) return;
    const card = backlogDb.find(c => c.id === _moveCardPendingId);
    if (card) {
        card.columnId = destColId;
        saveBacklog();
        const destCol = backlogColumnsDb.find(c => c.id === destColId);
        showToast(`Movido pra ${destCol ? destCol.name : 'lista'}!`);
    }
    _moveCardPendingId = null;
    hideModal('column-move-modal');
    renderBacklog();
};

window.cancelMoveCard = function() {
    _moveCardPendingId = null;
    hideModal('column-move-modal');
};

// Helpers de modal (centraliza show/hide com overlay)
function showColumnNameModal() {
    showModal('column-name-modal');
    // Foco diferido pra evitar buraco branco (Regra de Ouro #2)
    setTimeout(() => {
        const input = document.getElementById('column-name-input');
        if (input) input.focus({ preventScroll: true });
    }, 100);
}

function showColumnMenuModal() {
    showModal('column-menu-modal');
}

function showModal(id) {
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '55';
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    pushNavState(); // V40.5.0-fix7
}

function hideModal(id) {
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '';
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}


// =====================================================
// V40.4.1 — ABA FINANCEIRO (MVP — despesa avulsa + mês atual)
// =====================================================
// Schema do financialDb (no topo, linha ~37):
//   { id, title, amount, month: 'YYYY-MM', type: 'oneshot', tagId: null, createdAt }
// V40.4.2 adicionará: durationMonths, isRecurring, startMonth, currentInstallment
// V40.4.3 adicionará: navegação entre meses (currentFinanceMonth já existe)
//
// Helpers de formatação:
function formatBRL(amount) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount || 0);
}

function formatMonthLabel(monthStr) {
    // 'YYYY-MM' → 'Maio 2026'
    const [y, m] = monthStr.split('-');
    const names = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    return `${names[parseInt(m) - 1]} ${y}`;
}

// Estado do form
let currentFinId = null;
let currentFinType = 'oneshot'; // V40.4.2 vai adicionar 'recurring' e 'parceled'

// V40.4.3: detecta se despesa está atrasada (3 casos da armadilha mapeada)
// - Mês selecionado < mês atual: SEMPRE atrasada (se não paga)
// - Mês selecionado === mês atual + dueDay < dia atual: atrasada (se não paga)
// - Mês selecionado > mês atual: nunca atrasada (futuro)
// V40.4.3-fix (Gemini): usar horário LOCAL, não UTC.
// V40.4.4 (G12): recebe monthStr — pra recorrentes/parceladas que ocupam vários meses.
function isFinancialOverdue(item, monthStr) {
    if (isPaidInMonth(item, monthStr)) return false;
    if (!item.dueDay) return false; // sem vencimento, nunca marca atrasada
    
    const today = new Date();
    const todayMonth = getLocalMonthStr();
    const todayDay = today.getDate();
    
    if (monthStr < todayMonth) return true;
    if (monthStr > todayMonth) return false;
    return item.dueDay < todayDay;
}

// V40.4.2: helper de card de despesa (reusado pelas 2 seções A Pagar / Pagas)
// V40.4.3: mostra vencimento + destaque visual se atrasada.
// V40.4.4 (decisão 5α): subtítulo diferente por tipo (Avulsa / Recorrente / Parcela X/N).
function renderFinancialCard(item, monthStr) {
    const isPaid = isPaidInMonth(item, monthStr);
    const isOverdue = isFinancialOverdue(item, monthStr);
    const tagColor = item.tagId ? getTagColor(item.tagId) : null;
    
    // Decisão 2(I): valor riscado + opacidade 60% quando pago
    const opacityClass = isPaid ? 'opacity-60' : '';
    const valueClass = isPaid ? 'line-through text-zinc-500' : (isOverdue ? 'text-red-600' : 'text-zinc-800');
    const titleClass = isPaid ? 'text-zinc-500' : 'text-zinc-800';
    
    // V40.4.3: borda vermelha sutil quando vencida
    const cardBorderClass = isOverdue ? 'border-red-300 bg-red-50/30' : 'border-zinc-200';
    
    // V40.5.1-fix16: tag colorida vira borda esquerda (substitui o ícone $ colorido)
    const tagBorderStyle = tagColor ? `border-left: 4px solid ${tagColor};` : '';
    
    // Decisão 1(B): checkbox redondo à esquerda
    const checkboxBg = isPaid ? 'bg-app-focus border-app-focus' : 'bg-white border-zinc-300';
    const checkIconClass = isPaid ? '' : 'hidden';
    
    // V40.5.1-fix16: pílula de tipo (R = Recorrente, X/N = Parcela, vazio = Avulsa)
    let typePillHtml = '';
    const duration = item.durationMonths || 1;
    if (duration > 1) {
        if (item.isRecurring) {
            const recTitle = isOpenRecurring(item) ? 'Recorrente, sem fim' : 'Recorrente até ' + finMonthLong(getItemEndMonth(item)); // V40.30.0
            typePillHtml = `<span class="inline-flex items-center justify-center w-5 h-[18px] rounded bg-app-focus-soft text-app-focus text-[10px] font-extrabold leading-none" title="${recTitle}">R</span>`;
        } else {
            const label = getInstallmentLabel(item, monthStr); // ex "3/10"
            if (label) {
                typePillHtml = `<span class="inline-flex items-center justify-center h-[18px] px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-extrabold leading-none whitespace-nowrap" title="Parcela ${label}">${label}</span>`;
            }
        }
    }
    
    // V40.5.1-fix16: coluna do dia (só numeral). Vermelho se vencido.
    const dayBgClass = isOverdue ? 'bg-red-100 text-red-700' : 'bg-zinc-100 text-zinc-600';
    const dayCellHtml = item.dueDay 
        ? `<span class="inline-block w-7 text-center text-xs font-bold py-1 rounded ${dayBgClass}">${item.dueDay}</span>`
        : `<span class="inline-block w-7 text-center text-[10px] text-zinc-300">—</span>`;
    
    return `
    <div onclick="openFinancialForm('${item.id}')" style="${tagBorderStyle}" class="bg-white border rounded-lg p-2 shadow-sm mb-1.5 cursor-pointer hover:shadow active:scale-[0.99] transition ${opacityClass} ${cardBorderClass}">
        <div class="flex justify-between items-center gap-1.5">
            <!-- V40.4.4 (G6): togglePaidFinancial agora recebe id + mês -->
            <button onclick="event.stopPropagation(); togglePaidFinancial('${item.id}', '${monthStr}')" aria-label="Marcar como paga" class="w-5 h-5 rounded-full border-2 ${checkboxBg} flex items-center justify-center shrink-0 transition active:scale-90">
                <i class="ph-bold ph-check text-[10px] text-white ${checkIconClass}"></i>
            </button>
            <h4 class="font-bold text-sm leading-tight truncate min-w-0 flex-1 ${titleClass}">${escapeHtml(item.title)}</h4>
            <div class="w-7 flex justify-center shrink-0">${typePillHtml}</div>
            ${dayCellHtml}
            <span class="text-sm font-bold min-w-[82px] text-right shrink-0 ${valueClass}">${formatBRL(getAmountInMonth(item, monthStr))}</span>
            <button onclick="event.stopPropagation(); requestDeleteFinancial('${item.id}')" class="w-6 h-6 flex items-center justify-center bg-red-50 text-red-500 rounded hover:bg-red-100 active:scale-95 transition shrink-0" title="Apagar">
                <i class="ph ph-trash text-xs"></i>
            </button>
        </div>
    </div>`;
}

window.renderFinancial = function() {
    const container = document.getElementById('financial-container');
    const monthLabel = document.getElementById('financial-month-label');
    const totalEl = document.getElementById('financial-total');
    const paidEl = document.getElementById('financial-paid');
    const openEl = document.getElementById('financial-open');
    const todayBtn = document.getElementById('financial-today-btn');
    if (!container) return;
    
    if (monthLabel) monthLabel.innerText = formatMonthLabel(currentFinanceMonth);
    
    // V40.4.2: botão "Hoje" só aparece se NÃO está no mês atual (decisão δ)
    // V40.4.3-fix (Gemini): horário local em vez de UTC.
    if (todayBtn) {
        const currentRealMonth = getLocalMonthStr();
        if (currentFinanceMonth === currentRealMonth) {
            todayBtn.classList.add('hidden');
            todayBtn.classList.remove('flex');
        } else {
            todayBtn.classList.remove('hidden');
            todayBtn.classList.add('flex');
        }
    }
    
    // V40.4.4 (G11): em vez de filtrar por item.month === current, usa isItemInMonth
    // que conta avulsa, recorrente e parcelada.
    const monthItems = financialDb.filter(item => isItemInMonth(item, currentFinanceMonth));
    
    // V40.4.4 (G13): 3 totais usando isPaidInMonth pra retrocompat + paidMonths
    // V40.4.5 (fix14): usa getAmountInMonth pra respeitar overrides de valor por mês
    const totals = monthItems.reduce((acc, item) => {
        const amt = getAmountInMonth(item, currentFinanceMonth);
        acc.total += amt;
        if (isPaidInMonth(item, currentFinanceMonth)) acc.paid += amt;
        else acc.open += amt;
        return acc;
    }, { total: 0, paid: 0, open: 0 });
    
    if (totalEl) totalEl.innerText = formatBRL(totals.total);
    if (paidEl) paidEl.innerText = formatBRL(totals.paid);
    if (openEl) openEl.innerText = formatBRL(totals.open);
    
    if (monthItems.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center text-center opacity-50 py-12">
                <i class="ph ph-receipt text-4xl mb-2 text-zinc-400"></i>
                <p class="text-sm font-medium text-zinc-500">Nenhuma despesa em ${formatMonthLabel(currentFinanceMonth)}.</p>
                <p class="text-[11px] text-zinc-400 mt-1">Toque em + Nova Despesa pra começar</p>
            </div>`;
        return;
    }

    // V40.4.2: separar em 2 seções (decisão X) — A Pagar e Pagas
    // V40.4.3: ordenação por dia de vencimento crescente. Sem dueDay vai pro fim (ordenado por createdAt DESC).
    function sortByDueDay(a, b) {
        const aHas = !!a.dueDay;
        const bHas = !!b.dueDay;
        if (aHas && bHas) return a.dueDay - b.dueDay;
        if (aHas) return -1;
        if (bHas) return 1;
        return b.createdAt - a.createdAt;
    }
    const sorted = monthItems.slice().sort(sortByDueDay);
    // V40.4.4: agora usa isPaidInMonth, não item.paid direto
    const unpaid = sorted.filter(i => !isPaidInMonth(i, currentFinanceMonth));
    const paid = sorted.filter(i => isPaidInMonth(i, currentFinanceMonth));
    
    let html = '';
    
    // V40.5.1-fix17: header de coluna pra orientar visualmente (Despesa | Tipo | Dia | Valor)
    const columnHeaderHtml = `<div class="flex items-center gap-1.5 px-2 mb-1.5 text-[9px] font-bold uppercase tracking-wider text-zinc-400">
        <div class="w-5 flex-shrink-0"></div>
        <div class="flex-1">Despesa</div>
        <div class="w-7 text-center flex-shrink-0">Tipo</div>
        <div class="w-7 text-center flex-shrink-0">Dia</div>
        <div class="min-w-[82px] text-right flex-shrink-0">Valor</div>
        <div class="w-6 flex-shrink-0"></div>
    </div>`;
    
    if (unpaid.length > 0) {
        html += `<div class="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-2 mt-1 px-1">A Pagar (${unpaid.length})</div>`;
        html += columnHeaderHtml;
        html += unpaid.map(item => renderFinancialCard(item, currentFinanceMonth)).join('');
    }
    
    if (paid.length > 0) {
        html += `<div class="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2 mt-4 px-1">Pagas (${paid.length})</div>`;
        html += columnHeaderHtml;
        html += paid.map(item => renderFinancialCard(item, currentFinanceMonth)).join('');
    }
    
    container.innerHTML = html;
}

// V40.4.2: toggle paid (decisão 1B)
// V40.4.4 (G6): agora recebe id + mês — pra recorrentes/parceladas, marca paga só naquele mês.
window.togglePaidFinancial = function(id, monthStr) {
    const item = financialDb.find(x => x.id === id);
    if (!item) return;
    const month = monthStr || currentFinanceMonth; // fallback
    const wasPaid = isPaidInMonth(item, month);
    setPaidInMonth(item, month, !wasPaid);
    saveFinancial();
    renderFinancial();
}

// V40.4.2: navegação entre meses (decisão α)
window.changeFinanceMonth = function(delta) {
    const [y, m] = currentFinanceMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const newY = d.getFullYear();
    const newM = String(d.getMonth() + 1).padStart(2, '0');
    currentFinanceMonth = `${newY}-${newM}`;
    renderFinancial();
}

// V40.4.2: voltar pro mês atual (decisão δ)
// V40.4.3-fix (Gemini): horário local.
window.goToFinanceToday = function() {
    currentFinanceMonth = getLocalMonthStr();
    renderFinancial();
}

// V40.4.2: toggle pago no form (estado in-memory antes de salvar)
let currentFinPaid = false;

window.toggleFinancialFormPaid = function() {
    currentFinPaid = !currentFinPaid;
    updateFinancialFormPaidUI();
}

function updateFinancialFormPaidUI() {
    const checkBox = document.getElementById('fin-form-paid-check');
    const icon = document.getElementById('fin-form-paid-icon');
    if (!checkBox || !icon) return;
    if (currentFinPaid) {
        checkBox.className = 'w-6 h-6 rounded-full border-2 border-app-focus bg-app-focus flex items-center justify-center shrink-0 transition';
        icon.classList.remove('hidden');
    } else {
        checkBox.className = 'w-6 h-6 rounded-full border-2 border-zinc-300 bg-white flex items-center justify-center shrink-0 transition';
        icon.classList.add('hidden');
    }
}

window.openFinancialForm = function(id = null) {
    document.getElementById('financial-list-view').classList.add('hidden');
    document.getElementById('financial-form-view').classList.remove('hidden');
    document.getElementById('financial-form-view').classList.add('flex');
    
    currentFinId = id;
    currentFinType = 'oneshot';
    
    if (id) {
        const item = financialDb.find(x => x.id === id);
        if (!item) return;
        document.getElementById('fin-form-title-label').innerText = 'Editar Despesa';
        document.getElementById('financial-input').value = item.title;
        // V40.4.5 (fix14): mostra o valor do mês atual (com override se houver) em vez do item.amount global
        document.getElementById('financial-amount-input').value = getAmountInMonth(item, currentFinanceMonth) || '';
        document.getElementById('financial-dueday-input').value = item.dueDay || '';
        // V40.4.4: deduz tipo a partir do schema (retrocompat com itens antigos)
        const duration = item.durationMonths || 1;
        if (duration === 1) {
            currentFinType = 'oneshot';
        } else if (item.isRecurring) {
            currentFinType = 'recurring';
        } else {
            currentFinType = 'installment';
            document.getElementById('financial-installments-input').value = duration;
        }
        // V40.4.4: paid usa isPaidInMonth com retrocompat (item.paid bool antigo)
        currentFinPaid = isPaidInMonth(item, currentFinanceMonth);
        document.getElementById('fin-form-delete-btn').classList.remove('hidden');
        document.getElementById('fin-form-delete-btn').classList.add('flex');
    } else {
        document.getElementById('fin-form-title-label').innerText = 'Nova Despesa';
        document.getElementById('financial-input').value = '';
        document.getElementById('financial-amount-input').value = '';
        document.getElementById('financial-dueday-input').value = '';
        document.getElementById('financial-installments-input').value = '2';
        currentFinPaid = false;
        document.getElementById('fin-form-delete-btn').classList.add('hidden');
        document.getElementById('fin-form-delete-btn').classList.remove('flex');
    }
    
    updateFinancialFormPaidUI();
    updateFinancialTypeButtonsUI(); // V40.4.4: sincroniza visual dos 3 botões de tipo
}

window.closeFinancialForm = function(force = false) {
    const formView = document.getElementById('financial-form-view');
    const listView = document.getElementById('financial-list-view');
    if (!formView || !listView) return;
    formView.classList.add('hidden');
    formView.classList.remove('flex');
    listView.classList.remove('hidden');
    if (!force) renderFinancial();
}

// V40.4.4: atualiza visual dos 3 botões + mostra/esconde inputs auxiliares.
function updateFinancialTypeButtonsUI() {
    const types = ['oneshot', 'recurring', 'installment'];
    types.forEach(t => {
        const btn = document.getElementById(`fin-type-${t}`);
        if (!btn) return;
        if (t === currentFinType) {
            btn.className = 'flex-1 py-2.5 rounded-lg bg-app-focus text-white border border-app-focus text-xs font-bold transition active:scale-95';
        } else {
            btn.className = 'flex-1 py-2.5 rounded-lg bg-zinc-50 text-zinc-600 border border-zinc-200 text-xs font-bold transition active:scale-95 hover:bg-zinc-100';
        }
    });
    
    // Input "Quantas parcelas?" só aparece em Parcelada
    const wrapInst = document.getElementById('fin-installments-wrapper');
    if (wrapInst) wrapInst.classList.toggle('hidden', currentFinType !== 'installment');
    
    // Aviso pra Recorrente. V40.30.0: sem fim, com "Encerrar depois de <mês>" e "Repetir sem fim de novo"
    const infoRec = document.getElementById('fin-recurring-info');
    if (infoRec) infoRec.classList.toggle('hidden', currentFinType !== 'recurring');
    if (currentFinType === 'recurring') updateFinancialRecurringUI();
}
function updateFinancialRecurringUI() {
    const txt = document.getElementById('fin-recurring-text');
    if (!txt) return;
    const item = currentFinId ? financialDb.find(x => x.id === currentFinId) : null;
    const rec = item && item.isRecurring === true && (item.durationMonths || 1) > 1 ? item : null; // já é recorrente (senão vira agora, sem fim)
    const open = !rec || isOpenRecurring(rec), end = rec && !open ? getItemEndMonth(rec) : null;
    txt.textContent = !rec ? 'Repete todo mês, sem fim. Quando não precisar mais, abra a despesa e toque em Encerrar.'
        : open ? `Repete todo mês, sem fim (desde ${finMonthLong(getItemStartMonth(rec))}).`
        : `Repete todo mês até ${finMonthLong(end)}.`;
    const canEnd = !!rec && (open || end > currentFinanceMonth);
    const show = (id, on) => { const b = document.getElementById(id); if (b) { b.classList.toggle('hidden', !on); b.classList.toggle('inline-flex', on); } };
    show('fin-end-btn', canEnd);
    show('fin-reopen-btn', !!rec && !open);
    const lbl = document.getElementById('fin-end-label');
    if (lbl) lbl.textContent = 'Encerrar depois de ' + finMonthShort(currentFinanceMonth);
}
// Encerrar: a despesa fica até o mês da tela e sai dos seguintes (os meses que passaram ficam como estão).
window.endRecurringFromForm = function() {
    const item = currentFinId ? financialDb.find(x => x.id === currentFinId) : null;
    if (!item || item.isRecurring !== true) return;
    const last = currentFinanceMonth, start = getItemStartMonth(item);
    if (!start || last < start) return;
    askGoalConfirm(`Encerrar "${item.title}"?`,
        `Ela fica até ${finMonthLong(last)} e sai dos meses seguintes. Os meses que já passaram continuam como estão.`,
        'Encerrar', () => {
            const it = financialDb.find(x => x.id === item.id);
            if (!it) return;
            it.durationMonths = monthsBetween(start, last) + 1;
            it.paidMonths = (Array.isArray(it.paidMonths) ? it.paidMonths : []).filter(m => m <= last);
            cleanupOverridesOutsideRange(it);
            saveFinancial(); // barrinha do Desfazer: "Despesa encerrada"
            if (it.durationMonths === 1 && currentFinId === it.id) currentFinType = 'oneshot'; // encerrou no 1º mês: ficou só nele
            updateFinancialTypeButtonsUI();
        }, 'neutral', 'ph-calendar-x');
};
window.reopenRecurringFromForm = function() {
    const item = currentFinId ? financialDb.find(x => x.id === currentFinId) : null;
    if (!item || item.isRecurring !== true || isOpenRecurring(item)) return;
    item.durationMonths = REC_OPEN;
    saveFinancial(); // "Despesa voltou a repetir"
    updateFinancialTypeButtonsUI();
};

window.selectFinancialType = function(type) {
    currentFinType = type;
    updateFinancialTypeButtonsUI();
}

// V40.4.5 (fix15): estado temporário do save pausado pelo modal de escopo.
// Quando user edita valor de Recorrente/Parcelada, o save é pausado aqui e retomado em confirmEditScope.
let _pendingFinSave = null;

window.saveFinancialForm = function() {
    const title = document.getElementById('financial-input').value.trim();
    if (!title) return showToast('A despesa precisa de um nome.');
    
    const amountRaw = document.getElementById('financial-amount-input').value;
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) return showToast('Informe um valor maior que zero.');

    // V40.4.3: parse do dia do vencimento (opcional, 1-31)
    const dueDayRaw = document.getElementById('financial-dueday-input').value.trim();
    let dueDay = null;
    if (dueDayRaw) {
        const parsed = parseInt(dueDayRaw, 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 31) {
            return showToast('Dia do vencimento deve ser entre 1 e 31.');
        }
        dueDay = parsed;
    }

    // V40.4.4 (decisões 2I, 3α): calcula durationMonths e isRecurring a partir do tipo selecionado
    let durationMonths = 1;
    let isRecurring = false;
    if (currentFinType === 'recurring') {
        // V40.30.0: sem fim (até encerrar). A que já era recorrente guarda o fim que tiver (salvar não reabre nem encerra).
        const prev = currentFinId ? financialDb.find(x => x.id === currentFinId) : null;
        durationMonths = prev && prev.isRecurring === true && (prev.durationMonths || 1) > 1 ? prev.durationMonths : REC_OPEN;
        isRecurring = true;
    } else if (currentFinType === 'installment') {
        const instRaw = document.getElementById('financial-installments-input').value.trim();
        const inst = parseInt(instRaw, 10);
        // G9: validação 2-60
        if (isNaN(inst) || inst < 2 || inst > 60) {
            return showToast('Parcelas devem ser entre 2 e 60.');
        }
        durationMonths = inst;
        isRecurring = false;
    }

    if (currentFinId) {
        const item = financialDb.find(x => x.id === currentFinId);
        if (!item) return;
        
        // V40.4.5 (fix15): detecta mudança de valor em multi-mês ANTES de aplicar
        const prevDuration = item.durationMonths || 1;
        const prevRecurring = item.isRecurring === true;
        const typeChanged = (prevDuration !== durationMonths) || (prevRecurring !== isRecurring);
        const isMultiMonthAfter = durationMonths > 1;
        const oldAmount = getAmountInMonth(item, currentFinanceMonth);
        const valueChanged = oldAmount !== amount;
        // Modal só faz sentido se: continuar multi-mês + valor mudou + tipo NÃO mudou
        // (se trocou tipo, paidMonthsOverrides será deletado de qualquer forma)
        const shouldOpenScopeModal = isMultiMonthAfter && valueChanged && !typeChanged;
        
        if (shouldOpenScopeModal) {
            // V40.4.5 (fix15): pausa o save, guarda estado e abre modal de escopo
            _pendingFinSave = {
                itemId: item.id,
                newAmount: amount,
                otherFields: { title, dueDay, durationMonths, isRecurring, currentFinPaid }
            };
            openEditScopeModal(item.title);
            return; // ESPERA escolha do user em confirmEditScope
        }
        
        // Caminho normal: avulsa, valor não mudou, ou tipo mudou
        // V40.19.0: valor igual → 'keep'. Antes ia 'all', que gravava o valor DESTE mês como o de todos e apagava os
        // valores por mês (editar só o nome de uma recorrente num mês com valor diferente estragava os outros meses).
        applyFinancialItemUpdate(item, {
            title, amount, dueDay, durationMonths, isRecurring,
            typeChanged, scopeForAmount: valueChanged ? 'all' : 'keep',
            paidNow: currentFinPaid
        });
        showToast('Despesa atualizada!');
    } else {
        // V40.4.4: schema novo (criação)
        const newItem = {
            id: 'fin_' + Date.now(),
            title: title,
            amount: amount,
            startMonth: currentFinanceMonth,
            durationMonths: durationMonths,
            isRecurring: isRecurring,
            dueDay: dueDay,
            tagId: null,
            paidMonths: [],
            createdAt: Date.now()
        };
        if (currentFinPaid) {
            newItem.paidMonths.push(currentFinanceMonth);
        }
        financialDb.push(newItem);
        showToast('Despesa adicionada!');
    }
    
    saveFinancial();
    closeFinancialForm();
}

// V40.4.5 (fix15): aplica atualização no item financeiro, respeitando escopo de valor.
// scopeForAmount: 'this' | 'future' | 'all' — controla como item.amount/paidMonthsOverrides são atualizados.
function applyFinancialItemUpdate(item, payload) {
    const { title, amount, dueDay, durationMonths, isRecurring, typeChanged, scopeForAmount, paidNow } = payload;
    
    item.title = title;
    item.dueDay = dueDay;
    item.durationMonths = durationMonths;
    item.isRecurring = isRecurring;
    
    // V40.4.4: migra/normaliza paidMonths
    if (!Array.isArray(item.paidMonths)) item.paidMonths = [];
    
    if (typeChanged) {
        // F2: ao trocar tipo, resetar paidMonths E overrides + setar item.amount global
        item.paidMonths = [];
        delete item.paidMonthsOverrides;
        item.amount = amount;
    } else {
        // V40.4.5: aplica valor conforme escopo
        if (scopeForAmount === 'this') {
            setOverrideForMonth(item, currentFinanceMonth, amount);
        } else if (scopeForAmount === 'future') {
            if (item.isRecurring) setAmountFromMonthOn(item, currentFinanceMonth, amount); // V40.30.0: recorrente pode ser sem fim
            else setOverrideThisAndFuture(item, currentFinanceMonth, amount);
        } else if (scopeForAmount === 'all') {
            setAmountAllMonths(item, amount);
        } // 'keep' (V40.19.0): o valor não mudou, os valores ficam como estão
    }
    
    // F3/F10: limpa overrides fora do range (se durationMonths reduziu)
    cleanupOverridesOutsideRange(item);
    
    // Aplica o toggle "Marcar como paga" do form ao mês atual
    setPaidInMonth(item, currentFinanceMonth, paidNow);
    
    // Garante startMonth (retrocompat com item.month antigo)
    if (!item.startMonth) {
        item.startMonth = item.month || currentFinanceMonth;
    }
}

// V40.4.5 (fix15): abre modal de escopo (3 opções). Default: "Apenas este mês".
window.openEditScopeModal = function(itemTitle) {
    const subtitle = document.getElementById('fin-scope-subtitle');
    if (subtitle) subtitle.innerText = `Atualizar valor de "${itemTitle}" em:`;
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '55';
    const modal = document.getElementById('financial-edit-scope-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// V40.4.5 (fix15): user escolheu escopo → aplica + salva + fecha modal e form.
window.confirmEditScope = function(scope) {
    if (!_pendingFinSave) {
        closeEditScopeModal();
        return;
    }
    const { itemId, newAmount, otherFields } = _pendingFinSave;
    const item = financialDb.find(x => x.id === itemId);
    if (!item) {
        _pendingFinSave = null;
        closeEditScopeModal();
        return;
    }
    
    applyFinancialItemUpdate(item, {
        title: otherFields.title,
        amount: newAmount,
        dueDay: otherFields.dueDay,
        durationMonths: otherFields.durationMonths,
        isRecurring: otherFields.isRecurring,
        typeChanged: false, // se chegou no modal, tipo NÃO mudou (validado em saveFinancialForm)
        scopeForAmount: scope,
        paidNow: otherFields.currentFinPaid
    });
    
    saveFinancial();
    _pendingFinSave = null;
    closeEditScopeModal();
    closeFinancialForm();
    showToast('Despesa atualizada!');
}

// V40.4.5 (fix15): user cancelou modal → mantém form aberto, nada salvo.
window.cancelEditScope = function() {
    _pendingFinSave = null;
    closeEditScopeModal();
}

function closeEditScopeModal() {
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '';
    const modal = document.getElementById('financial-edit-scope-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// V40.4.1: delete com modal de confirmação (padrão V40.3.5)
let pendingFinancialDeleteId = null;

window.requestDeleteFinancial = function(id) {
    pendingFinancialDeleteId = id;
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '55'; // sobre a sheet (z-50), abaixo do modal (z-60)
    document.getElementById('financial-delete-modal').classList.remove('hidden');
    document.getElementById('financial-delete-modal').classList.add('flex');
    pushNavState(); // V40.5.0-fix7
}

window.confirmDeleteFinancial = function() {
    if (!pendingFinancialDeleteId) return;
    financialDb = financialDb.filter(x => x.id !== pendingFinancialDeleteId);
    saveFinancial();
    pendingFinancialDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '';
    document.getElementById('financial-delete-modal').classList.add('hidden');
    document.getElementById('financial-delete-modal').classList.remove('flex');
    if (typeof closeFinancialForm === 'function') closeFinancialForm();
    renderFinancial();
    showToast('Despesa apagada.');
}

window.cancelDeleteFinancial = function() {
    pendingFinancialDeleteId = null;
    const overlay = document.getElementById('overlay');
    overlay.classList.add('opacity-0', 'pointer-events-none');
    overlay.style.zIndex = '';
    document.getElementById('financial-delete-modal').classList.add('hidden');
    document.getElementById('financial-delete-modal').classList.remove('flex');
}

window.deleteFinancialFromForm = function() {
    if (!currentFinId) return;
    requestDeleteFinancial(currentFinId);
}


// =====================================================
// V40.3.3 — CARIMBAR ROTINA (Fase 2)
// =====================================================
// Quando user toca em ✋ no card de rotina:
// 1. Calcula maior gap disponível no dia ativo (replica lógica do renderTimeline)
// 2. Se duração da rotina > maior gap → toast "Sem espaço suficiente" + return
// 3. Senão: clona rotina pra pendingIntent (com microblocks)
// 4. Fecha sheets, mostra floating-task, renderTimeline (blocos pulsantes ativam)
// 5. Card carimbado vira block normal (retraído por default — decisão 3b do usuário)
//
// Armadilhas tratadas (B1-B15):
//   B1: sobrescreve pendingIntent silenciosamente (igual scheduleBacklogItem)
//   B2: microblocks sempre array (|| [])
//   B3: getMaxGapForDay calcula, toast se não couber
//   B4: theme propagado corretamente via pendingIntent
//   B5: tagId pode apontar pra tag deletada — getTagColor lida
//   B6: closeAllSheets antes de setar pendingIntent
//   B8: stampRoutine não chama renderTimeline diretamente (renderFloatingTask faz)
//   B13: emoji prefixado no title (visual igual aos outros cartões)
//   B14: container flex com gap-1.5, botões w-8 h-8

function getMaxGapForDay() {
    // Replica a lógica de gap-detection do renderTimeline (linhas 656-674).
    // Retorna a maior duração de gap (em minutos) no dia ativo.
    const activeDate = getActiveDateStr();
    let dailyDb = db.filter(b => b.date === activeDate || (!b.date && activeDate === getTodayStr()));
    dailyDb = dailyDb.filter(b => b.startMin < END_HOUR * 60 && (b.startMin + b.duration) > START_HOUR * 60);
    dailyDb.sort((a, b) => a.startMin - b.startMin);
    
    let cursorMin = START_HOUR * 60;
    let maxGap = 0;
    
    dailyDb.forEach(fb => {
        if (fb.startMin > cursorMin) {
            maxGap = Math.max(maxGap, fb.startMin - cursorMin);
        }
        cursorMin = Math.max(cursorMin, fb.startMin + fb.duration);
    });
    
    const endOfDay = END_HOUR * 60;
    if (cursorMin < endOfDay) {
        maxGap = Math.max(maxGap, endOfDay - cursorMin);
    }
    
    return maxGap;
}

window.stampRoutine = function(routineId) {
    const r = routinesDb.find(x => x.id === routineId);
    if (!r) return;
    
    // B3: verifica se cabe no dia
    const maxGap = getMaxGapForDay();
    if (r.duration > maxGap) {
        showToast(`Sem espaço suficiente hoje (livre: ${formatDur(maxGap)})`);
        return;
    }
    
    // B13: emoji prefixado no title pra visual consistente nos cartões existentes
    const cardTitle = r.emoji ? `${r.emoji} ${r.title}` : r.title;
    
    // B1, B2: sobrescreve pendingIntent silenciosamente, microblocks sempre array
    pendingIntent = {
        title: cardTitle,
        duration: r.duration,
        theme: r.theme || 'focus',
        tagId: r.tagId || null,
        ...(goalKeep(r.goalId) ? { goalId: r.goalId } : {}), // V40.34.0: cada bloco da rotina conta na meta dela
        microblocks: (r.microblocks || []).map(mb => ({ title: mb.title, done: false }))
    };
    selectedDur = r.duration;
    syncDurButtons(selectedDur);
    
    document.getElementById('floating-title').innerText = cardTitle;
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    closeAllSheets(); // B6
    renderTimeline(); // ativa blocos pulsantes via performEncaixe
    showToast('Toque num Tempo Livre pra encaixar 👇');
}

// =====================================================
// V40.3.2 — DRAG DE MICROBLOCKS (reorder dentro do card expandido)
// =====================================================
// Gesto: long-press 400ms em qualquer parte do microbloc → escala 1.05 → arrastar pra reorder
// Discovery: tooltip "Segure pra reordenar" nas primeiras 3 vezes que user expande card com >=2 microblocks
//
// Armadilhas tratadas (do dossiê A1-A20):
//   A1: tocar em x<40 cai no drag-handle do card. Mitigação: microblocks ficam em ml-10 (x>=40)
//   A2/A3/A7: touchmove com preventDefault impede scroll vazar (browser respeita após gesto consolidado)
//   A4/A5: tap rápido (<400ms) → click padrão (toggle/delete); long-press → drag (cancela click)
//   A6: setamos isPhysicsBusy=true durante drag de microbloc também (impede auto-retrair)
//   A8: limitamos Y do dedo ao container microblocksSection (clamp)
//   A9: getBoundingClientRect calculado UMA vez no longpress fire (cache pra performance)
//   A11/A12: durante drag ativo, mbDragActive=true bloqueia renderTimeline reentrante
//   A18: CSS touch-callout:none + user-select:none nos microblocks
//   A19: só processa e.touches[0]
//   A20: touchend sempre é capturado, mesmo fora do elemento
// NOTA: mbDragActive declarado no TOPO do arquivo (linha ~30) pra evitar TDZ.
let mbDragLongPressTimer = null;
let mbDragInitialY = 0;
let mbDragInitialX = 0;
let mbDragBlockId = null;
let mbDragFromIndex = -1;
let mbDragToIndex = -1;
let mbDragRects = [];
let mbDragSourceEl = null;
let mbDragDropLineEl = null;
let mbDragClickSuppress = false;

const MB_DRAG_LONGPRESS_MS = 400;
const MB_DRAG_MOVE_CANCEL_PX = 8; // se mover >8px antes do timer, cancela longpress (= scroll)

// Discovery tooltip (V40.3.2)
function maybeShowMbDragTooltip(blockEl, block) {
    if (!block.expanded) return;
    if (!block.microblocks || block.microblocks.length < 2) return;
    
    const shownCount = parseInt(localStorage.getItem('tb_mb_drag_tooltip_count') || '0', 10);
    if (shownCount >= 3) return;
    
    // Verifica se já tem tooltip nesse card (evita duplicar)
    if (blockEl.querySelector('.mb-drag-tooltip')) return;
    
    const tooltip = document.createElement('div');
    tooltip.className = 'mb-drag-tooltip absolute top-12 left-12 right-3 z-[55] px-3 py-1.5 bg-zinc-900/90 backdrop-blur-sm text-white text-[10px] font-medium rounded-lg shadow-lg pointer-events-none flex items-center gap-1.5 transition-opacity duration-500';
    tooltip.innerHTML = '<i class="ph ph-hand-tap text-xs"></i> Segure num check pra reordenar';
    blockEl.appendChild(tooltip);
    
    localStorage.setItem('tb_mb_drag_tooltip_count', String(shownCount + 1));
    
    setTimeout(() => {
        tooltip.style.opacity = '0';
        setTimeout(() => tooltip.remove(), 500);
    }, 3000);
}

// Setup do drag em cada microbloc — chamado de drawBlock (ao final, junto com enablePhysics)
function setupMicroblockDrag(cardEl, block) {
    if (!block.expanded) return;
    if (!block.microblocks || block.microblocks.length < 2) return; // 1 item só não tem o que reordenar
    
    const mbItems = cardEl.querySelectorAll('.mb-item');
    mbItems.forEach((mbEl, idx) => {
        mbEl.addEventListener('touchstart', (e) => onMbDragTouchStart(e, block, idx, mbEl), {passive: false});
        mbEl.addEventListener('mousedown', (e) => onMbDragTouchStart(e, block, idx, mbEl));
    });
}

function onMbDragTouchStart(e, block, idx, mbEl) {
    // Multi-touch: só processa o primeiro dedo
    if (e.touches && e.touches.length > 1) return;
    
    const point = e.touches ? e.touches[0] : e;
    mbDragInitialY = point.clientY;
    mbDragInitialX = point.clientX;
    mbDragBlockId = block.id;
    mbDragFromIndex = idx;
    mbDragSourceEl = mbEl;
    mbDragClickSuppress = false;
    
    // Inicia timer de long-press
    mbDragLongPressTimer = setTimeout(() => {
        activateMbDrag(block, idx, mbEl);
    }, MB_DRAG_LONGPRESS_MS);
    
    // Listener de movimento — se mover >8px ANTES do timer disparar, cancela longpress (= scroll)
    const onTouchMovePre = (ev) => {
        const p = ev.touches ? ev.touches[0] : ev;
        const dy = Math.abs(p.clientY - mbDragInitialY);
        const dx = Math.abs(p.clientX - mbDragInitialX);
        if ((dy > MB_DRAG_MOVE_CANCEL_PX || dx > MB_DRAG_MOVE_CANCEL_PX) && !mbDragActive) {
            // cancela longpress — usuário tava tentando scroll/swipe normal
            cancelMbDragLongPress();
        }
    };
    
    const onTouchEndPre = () => {
        cancelMbDragLongPress();
        document.removeEventListener('touchmove', onTouchMovePre);
        document.removeEventListener('touchend', onTouchEndPre);
        document.removeEventListener('mousemove', onTouchMovePre);
        document.removeEventListener('mouseup', onTouchEndPre);
    };
    
    document.addEventListener('touchmove', onTouchMovePre, {passive: true});
    document.addEventListener('touchend', onTouchEndPre);
    document.addEventListener('mousemove', onTouchMovePre);
    document.addEventListener('mouseup', onTouchEndPre);
}

function cancelMbDragLongPress() {
    if (mbDragLongPressTimer) {
        clearTimeout(mbDragLongPressTimer);
        mbDragLongPressTimer = null;
    }
}

function activateMbDrag(block, idx, mbEl) {
    mbDragLongPressTimer = null;
    mbDragActive = true;
    mbDragClickSuppress = true;
    isPhysicsBusy = true; // A6/A11: impede card auto-retrair durante drag
    
    // Feedback visual no microbloc arrastado
    mbEl.classList.add('mb-dragging');
    
    // Cache dos rects dos outros microblocks (A9/A17 — uma vez só)
    const cardEl = document.querySelector(`[data-block-id="${block.id}"]`);
    if (!cardEl) return;
    const allMbs = cardEl.querySelectorAll('.mb-item');
    mbDragRects = Array.from(allMbs).map((el, i) => ({
        el: el,
        idx: i,
        rect: el.getBoundingClientRect()
    }));
    
    // Cria linha de drop visual (drop indicator)
    mbDragDropLineEl = document.createElement('div');
    mbDragDropLineEl.className = 'mb-drop-line';
    
    // Vibração leve no Android pra confirmar pegou (se suportado)
    if (navigator.vibrate) navigator.vibrate(20);
    
    // Agora registra os handlers de move/end (substitui os pre-handlers)
    document.addEventListener('touchmove', onMbDragMove, {passive: false});
    document.addEventListener('touchend', onMbDragEnd);
    document.addEventListener('touchcancel', onMbDragEnd);
    document.addEventListener('mousemove', onMbDragMove);
    document.addEventListener('mouseup', onMbDragEnd);
}

function onMbDragMove(e) {
    if (!mbDragActive) return;
    e.preventDefault(); // A2/A3/A7: impede scroll vazar
    
    const point = e.touches ? e.touches[0] : e;
    const y = point.clientY;
    
    // Calcula sobre qual microbloc o dedo está
    let newIdx = mbDragFromIndex;
    for (let i = 0; i < mbDragRects.length; i++) {
        const r = mbDragRects[i].rect;
        const midY = r.top + r.height / 2;
        if (i === mbDragFromIndex) continue; // pula o próprio item arrastado
        if (i < mbDragFromIndex && y < midY) {
            newIdx = i;
            break;
        }
        if (i > mbDragFromIndex && y > midY) {
            newIdx = i;
        }
    }
    
    if (newIdx !== mbDragToIndex) {
        mbDragToIndex = newIdx;
        // Posiciona drop-line antes do mbDragRects[newIdx]
        positionDropLine(newIdx);
    }
}

function positionDropLine(targetIdx) {
    if (!mbDragDropLineEl || !mbDragRects[targetIdx]) return;
    const targetEl = mbDragRects[targetIdx].el;
    
    // Se newIdx > fromIndex, drop-line vai DEPOIS do target. Se <, vai ANTES.
    if (targetIdx > mbDragFromIndex) {
        targetEl.parentNode.insertBefore(mbDragDropLineEl, targetEl.nextSibling);
    } else {
        targetEl.parentNode.insertBefore(mbDragDropLineEl, targetEl);
    }
}

function onMbDragEnd(e) {
    document.removeEventListener('touchmove', onMbDragMove);
    document.removeEventListener('touchend', onMbDragEnd);
    document.removeEventListener('touchcancel', onMbDragEnd);
    document.removeEventListener('mousemove', onMbDragMove);
    document.removeEventListener('mouseup', onMbDragEnd);
    
    if (!mbDragActive) return;
    mbDragActive = false;
    
    // Aplica reorder se mudou de posição
    if (mbDragToIndex !== -1 && mbDragToIndex !== mbDragFromIndex && mbDragBlockId) {
        const block = db.find(b => b.id === mbDragBlockId);
        if (block && block.microblocks) {
            const [moved] = block.microblocks.splice(mbDragFromIndex, 1);
            block.microblocks.splice(mbDragToIndex, 0, moved);
            saveDb();
        }
    }
    
    // Cleanup visual
    if (mbDragSourceEl) mbDragSourceEl.classList.remove('mb-dragging');
    if (mbDragDropLineEl) mbDragDropLineEl.remove();
    
    // Reset estado
    mbDragSourceEl = null;
    mbDragDropLineEl = null;
    mbDragFromIndex = -1;
    mbDragToIndex = -1;
    mbDragRects = [];
    mbDragBlockId = null;
    
    // Libera card pra retrair de novo, mas dá uma folga
    setTimeout(() => { isPhysicsBusy = false; }, 200);
    
    // Re-render pra refletir nova ordem
    renderTimeline();
    
    // Suprime o "click" sintético que vem após touchend (evita disparar toggle/delete)
    setTimeout(() => { mbDragClickSuppress = false; }, 100);
}

// Interceptador de clicks: se mbDragClickSuppress true, cancela o click pra não disparar
// toggleMicroblock/deleteMicroblock após um drag.
document.addEventListener('click', (e) => {
    if (mbDragClickSuppress) {
        e.stopPropagation();
        e.preventDefault();
    }
}, true);

// =====================================================
// V40.25.0: DESFAZER (e REFAZER)
// Toda mudança nos seus dados vira um passo que dá pra desfazer pela barrinha "Desfazer" que aparece embaixo.
// Como funciona: cada save*() chama undoTouch(<chave>), que compara a lista com a cópia guardada (item por
// item, pelo id) e junta o que mudou no mesmo toque num passo só (ex.: agendar = sai da Lista + entra na agenda).
// Desfazer devolve o "antes" só dos itens que continuam como a ação deixou: se outro aparelho mexeu no mesmo
// item depois, esse fica como está (o resto volta). Refazer faz o caminho contrário.
// Não viram passo: o que chega da nuvem (sync), a lista Geral e as categorias de metas que nascem sozinhas, o
// "já passou" que a agenda marca sozinha e abrir/fechar um cartão. Tudo fica só na memória (fechou o app, zerou).
// Tudo com "var" e função declarada: os saves rodam antes desta parte do arquivo (sem TDZ; undoReady ainda falso).
// =====================================================
var UNDO_MAX = 40;
var undoStack = [], redoStack = [], undoSnap = null, undoGroup = null, undoMute = 0, undoReady = false, undoK = null, undoBarT = null;

function undoKeys() {
    if (undoK) return undoK;
    const L = (get, set, save, extra) => Object.assign({ get, set, save }, extra || {});
    undoK = {
        // bloco: "expanded" (aberto na tela) não conta; "type" (focus/past) a agenda muda sozinha, mas volta junto
        blocos: L(() => db, (v) => { db = v; }, saveDb, { skip: ['expanded', 'type'], keep: ['type'] }),
        tarefas: L(() => backlogDb, (v) => { backlogDb = v; }, saveBacklog, { ordered: true }),
        listas: L(() => backlogColumnsDb, (v) => { backlogColumnsDb = v; }, saveBacklogColumns, { ordered: true }),
        tags: L(() => tagsDb, (v) => { tagsDb = v; }, saveTags, { ordered: true }),
        periodos: L(() => periodsDb, (v) => { periodsDb = v; }, savePeriods),
        rotinas: L(() => routinesDb, (v) => { routinesDb = v; }, saveRoutinesDb),
        notas: L(() => notesDb, (v) => { notesDb = v; }, saveNotes),
        financas: L(() => financialDb, (v) => { financialDb = v; }, saveFinancial),
        metas_listas: L(() => goalListsDb, (v) => { goalListsDb = v; }, saveGoalLists, { ordered: true }),
        metas: L(() => goalsDb, (v) => { goalsDb = v; }, saveGoals, { ordered: true }),
        metas_dias: L(() => goalDaysDb, (v) => { goalDaysDb = v; }, saveGoalDays),
        arquivo: L(() => archiveDb, (v) => { archiveDb = v; }, saveArchive, { id: (a) => (a && a.item && a.item.id != null ? a.kind + '|' + a.item.id : null) }),
    };
    return undoK;
}
function undoIdOf(x) { return x && x.id != null ? String(x.id) : null; }
// Um item vira texto pra comparar (sem os campos que não contam; os que "voltam junto" ficam guardados à parte).
function undoSer(K, x) {
    if (!K.skip) return { s: JSON.stringify(x) };
    const o = Object.assign({}, x), k = {};
    K.skip.forEach((f) => { if (K.keep && K.keep.indexOf(f) >= 0 && f in o) k[f] = o[f]; delete o[f]; });
    return { s: JSON.stringify(o), k };
}
function undoTake(key) {
    const K = undoKeys()[key], arr = K.get(), ids = [], m = new Map(), idOf = K.id || undoIdOf;
    (Array.isArray(arr) ? arr : []).forEach((x) => {
        const id = idOf(x);
        if (id == null || m.has(id)) return;
        ids.push(id);
        m.set(id, undoSer(K, x));
    });
    return { ids, m };
}
function undoInit() {
    undoSnap = {};
    Object.keys(undoKeys()).forEach((k) => { try { undoSnap[k] = undoTake(k); } catch (e) { console.warn('[Faz] desfazer', k, e); } });
    undoReady = true;
}
// Salva sem virar passo (o próprio desfazer e o que nasce sozinho): só atualiza a cópia.
function undoQuiet(fn) {
    if (!undoReady) return fn();
    undoMute++;
    try { return fn(); } finally { undoMute--; }
}

function undoTouch(key) {
    if (!undoReady || !undoSnap) return;
    let now;
    try { now = undoTake(key); } catch (e) { return; }
    const old = undoSnap[key];
    undoSnap[key] = now;
    if (!old || undoMute > 0 || (typeof window.fazSyncApplying === 'function' && window.fazSyncApplying())) return; // veio da nuvem
    const K = undoKeys()[key], ch = [];
    old.m.forEach((v, id) => {
        const n = now.m.get(id);
        if (!n) ch.push({ id, b: v, a: null, pb: old.ids[old.ids.indexOf(id) - 1] || null }); // pb: quem estava em cima (pra voltar no lugar)
        else if (n.s !== v.s) ch.push({ id, b: v, a: n });
    });
    now.m.forEach((v, id) => { if (!old.m.has(id)) ch.push({ id, b: null, a: v, pa: now.ids[now.ids.indexOf(id) - 1] || null }); });
    let reord = false;
    if (K.ordered) { // só onde a ordem é sua (cartões da Lista, listas, tags, metas): arrastar pra cima/baixo também desfaz
        const o = old.ids.filter((id) => now.m.has(id)), n = now.ids.filter((id) => old.m.has(id));
        reord = o.some((id, i) => id !== n[i]);
    }
    if (ch.length || reord) undoAdd(key, ch, reord ? old.ids : null, reord ? now.ids : null);
}
// V40.36.1: dá um texto próprio ao passo que está sendo juntado agora (chamar logo depois do save*()). Sem passo
// aberto (desfazer desligado, ou nada mudou) não faz nada: o texto não sobra pra outro passo.
function undoNameStep(label) { if (undoGroup && label) undoGroup.label = label; }
function undoAdd(key, ch, ob, oa) {
    if (!undoGroup) { undoGroup = { keys: {}, at: Date.now() }; setTimeout(undoClose, 0); } // tudo do mesmo toque = um passo
    const G = undoGroup.keys[key] || (undoGroup.keys[key] = { ch: new Map(), ob: null, oa: null });
    ch.forEach((c) => {
        const p = G.ch.get(c.id);
        if (!p) { G.ch.set(c.id, c); return; }
        p.a = c.a; // mexido de novo no mesmo toque: vale o primeiro "antes" e o último "depois"
        if (c.pa !== undefined) p.pa = c.pa;
        if (!p.b && !p.a) G.ch.delete(c.id); // nasceu e sumiu no mesmo toque
    });
    if (ob) { if (!G.ob) G.ob = ob; G.oa = oa; }
}
function undoClose() {
    const g = undoGroup;
    undoGroup = null;
    if (!g) return;
    const keys = {};
    Object.keys(g.keys).forEach((k) => {
        const G = g.keys[k], ch = [];
        G.ch.forEach((c) => { if ((c.b || c.a) && !(c.b && c.a && c.b.s === c.a.s)) ch.push(c); });
        let ob = G.ob, oa = G.oa;
        if (ob && oa) { // voltou pra mesma ordem no fim: não conta
            const inA = new Set(oa), inB = new Set(ob), o = ob.filter((id) => inA.has(id)), n = oa.filter((id) => inB.has(id));
            if (!o.some((id, i) => id !== n[i])) ob = oa = null;
        }
        if (ch.length || ob) keys[k] = { ch, ob, oa };
    });
    const ks = Object.keys(keys);
    if (!ks.length) return;
    const step = { keys, at: g.at, label: g.label || undoLabel(keys) }; // V40.36.1: g.label = texto próprio (undoNameStep)
    step.quiet = ks.every((k) => k === 'metas_dias'); // o "+" das metas já tem o "−" do lado: não precisa da barrinha
    step.heavy = !!keys.arquivo || ks.some((k) => keys[k].ch.some((c) => !c.a)); // apagou ou arquivou: a barrinha fica mais tempo
    undoStack.push(step);
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    redoStack = [];
    if (step.quiet) undoBarHide(); else undoBarShow(step.label, 'did', step.heavy ? 7000 : 5000);
}

// ---- o texto do passo ("Tarefa agendada", "Bloco movido", "3 tarefas apagadas"...) ----
var UNDO_NOUN = {
    blocos: ['bloco', 'blocos', 'o'], sublista: ['sublista', 'sublistas', 'a'], tarefas: ['tarefa', 'tarefas', 'a'],
    listas: ['lista', 'listas', 'a'], tags: ['tag', 'tags', 'a'], periodos: ['período', 'períodos', 'o'],
    rotinas: ['rotina', 'rotinas', 'a'], notas: ['nota', 'notas', 'a'], financas: ['despesa', 'despesas', 'a'],
    metas_listas: ['categoria', 'categorias', 'a'], metas: ['meta', 'metas', 'a'], arquivo: ['item', 'itens', 'o'],
};
function undoCap(t) { return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }
function undoWord(key, n, verb) { // ("tarefas", 1, "apagad") → "Tarefa apagada"; (…, 3, …) → "3 tarefas apagadas"
    const w = UNDO_NOUN[key] || UNDO_NOUN.arquivo, g = w[2];
    return n === 1 ? undoCap(w[0]) + ' ' + verb + g : n + ' ' + w[1] + ' ' + verb + g + 's';
}
function undoIsSub(c) { return /"cards":\[/.test((c.a && c.a.s) || (c.b && c.b.s) || ''); }
function undoMbLabel(b, a) {
    b = Array.isArray(b) ? b : []; a = Array.isArray(a) ? a : [];
    if (a.length > b.length) return 'Item da checklist adicionado';
    if (a.length < b.length) return 'Item da checklist apagado';
    const done = (l) => l.filter((x) => x && x.done).length, t = (l) => l.map((x) => (x && x.title) || '').sort().join('\n');
    if (done(a) !== done(b)) return done(a) > done(b) ? 'Item marcado' : 'Item desmarcado';
    return t(a) === t(b) ? 'Ordem da checklist' : 'Item da checklist editado';
}
function undoCardsLabel(b, a) {
    b = Array.isArray(b) ? b : []; a = Array.isArray(a) ? a : [];
    const n = Math.abs(a.length - b.length), done = (l) => l.filter((x) => x && x.done).length;
    if (a.length > b.length) return n === 1 ? 'Cartão na sublista' : n + ' cartões na sublista';
    if (a.length < b.length) return n === 1 ? 'Cartão saiu da sublista' : n + ' cartões saíram da sublista';
    if (done(a) !== done(b)) return done(a) > done(b) ? 'Cartão marcado' : 'Cartão desmarcado';
    return 'Cartão editado';
}
function undoModLabel(k, c) {
    let b, a;
    try { b = JSON.parse(c.b.s); a = JSON.parse(c.a.s); } catch (e) { return undoWord(k, 1, 'editad'); }
    const ch = (f) => JSON.stringify(b[f]) !== JSON.stringify(a[f]), only = (...fs) => Object.keys(Object.assign({}, b, a)).every((f) => fs.indexOf(f) >= 0 || !ch(f));
    if (k === 'blocos') {
        const nk = undoIsSub(c) ? 'sublista' : 'blocos';
        if (ch('date') || ch('startMin')) return undoWord(nk, 1, 'movid');
        if (ch('duration') && only('duration')) return 'Duração mudada';
        if (ch('cards') && only('cards', 'completed')) return undoCardsLabel(b.cards, a.cards);
        if (ch('completed') && only('completed', 'cards')) return undoWord(nk, 1, a.completed ? 'concluíd' : 'reabert');
        if (ch('microblocks') && only('microblocks')) return undoMbLabel(b.microblocks, a.microblocks);
        if (ch('linkedNoteIds') && only('linkedNoteIds')) return (a.linkedNoteIds || []).length > (b.linkedNoteIds || []).length ? 'Nota ligada ao bloco' : 'Nota tirada do bloco';
        return undoWord(nk, 1, 'editad');
    }
    if ((k === 'tarefas' || k === 'rotinas') && ch('microblocks') && only('microblocks')) return undoMbLabel(b.microblocks, a.microblocks);
    if (k === 'tarefas' && ch('columnId')) return 'Tarefa movida de lista';
    if (k === 'financas' && ch('paidMonths') && only('paidMonths')) return (a.paidMonths || []).length > (b.paidMonths || []).length ? 'Despesa paga' : 'Pagamento desmarcado';
    if (k === 'financas' && ch('durationMonths') && only('durationMonths', 'paidMonths', 'paidMonthsOverrides') && b.isRecurring === true) return (a.durationMonths || 1) < (b.durationMonths || 1) ? 'Despesa encerrada' : 'Despesa voltou a repetir'; // V40.30.0
    if ((k === 'listas' || k === 'metas_listas' || k === 'tags') && ch('name') && only('name')) return undoWord(k, 1, 'renomead');
    return undoWord(k, 1, 'editad');
}
function undoLabel(keys) {
    const st = {};
    Object.keys(keys).forEach((k) => {
        const s = st[k] = { n: [], d: [], m: [], o: !!keys[k].ob };
        keys[k].ch.forEach((c) => { if (!c.b) s.n.push(c); else if (!c.a) s.d.push(c); else s.m.push(c); });
    });
    const n = (k) => (st[k] ? st[k].n.length : 0), d = (k) => (st[k] ? st[k].d.length : 0), m = (k) => (st[k] ? st[k].m.length : 0);
    const arqKind = (list) => { const ks = new Set(list.map((c) => c.id.split('|')[0])); return ks.size === 1 ? (ks.has('bloco') ? 'blocos' : 'tarefas') : null; };
    // 1) apagar lista, tag ou categoria leva junto (ou solta) o que tinha dentro
    if (d('listas')) return undoWord('listas', d('listas'), 'apagad');
    if (d('tags')) return undoWord('tags', d('tags'), 'apagad');
    if (d('metas_listas')) return undoWord('metas_listas', d('metas_listas'), 'apagad');
    // 2) arquivados
    if (n('arquivo')) { const k = arqKind(st.arquivo.n); return k ? undoWord(k, n('arquivo'), 'arquivad') : n('arquivo') + ' itens arquivados'; }
    if (d('arquivo')) {
        const k = arqKind(st.arquivo.d);
        if (n('tarefas') || n('blocos')) return k ? undoWord(k, d('arquivo'), 'desarquivad') : d('arquivo') + ' itens desarquivados';
        return d('arquivo') === 1 ? 'Apagado dos arquivados' : d('arquivo') + ' itens apagados dos arquivados';
    }
    // 3) da Lista pra agenda (e de volta)
    if (d('tarefas') && n('blocos')) return d('tarefas') === 1 ? 'Tarefa agendada' : d('tarefas') + ' tarefas agendadas';
    if (d('tarefas') && m('blocos')) return d('tarefas') === 1 ? 'Tarefa entrou na sublista' : d('tarefas') + ' tarefas entraram na sublista';
    if (d('blocos') && n('tarefas')) {
        if (st.blocos.d.every(undoIsSub)) return undoWord('sublista', d('blocos'), 'apagad'); // os cartões não feitos voltaram pra Lista
        return d('blocos') === 1 ? 'Bloco voltou pra lista' : d('blocos') + ' blocos voltaram pra lista';
    }
    if (n('tarefas') && m('blocos')) return n('tarefas') === 1 ? 'Cartão voltou pra lista' : n('tarefas') + ' cartões voltaram pra lista';
    if (d('metas') && st.metas_dias) return undoWord('metas', d('metas'), 'apagad');
    // V40.30.0: cartão arrastado pra fora, pra dentro ou entre sublistas
    if (st.blocos && !st.tarefas) {
        const B = st.blocos, subs = B.m.filter(undoIsSub);
        const nCards = (c, side) => { try { return (JSON.parse(c[side].s).cards || []).length; } catch (e) { return 0; } };
        const diff = (c) => nCards(c, 'a') - nCards(c, 'b');
        if (B.n.length === 1 && !B.d.length && B.m.length === 1 && subs.length === 1 && !undoIsSub(B.n[0]) && diff(B.m[0]) < 0) return 'Cartão saiu da sublista';
        if (B.d.length === 1 && !B.n.length && B.m.length === 1 && subs.length === 1 && !undoIsSub(B.d[0]) && diff(B.m[0]) > 0) return 'Bloco entrou na sublista';
        if (!B.n.length && !B.d.length && B.m.length === 2 && subs.length === 2 && diff(B.m[0]) + diff(B.m[1]) === 0 && diff(B.m[0]) !== 0) return 'Cartão mudou de sublista';
    }
    // 4) uma coisa só
    const k = ['blocos', 'tarefas', 'notas', 'rotinas', 'financas', 'metas', 'listas', 'tags', 'metas_listas', 'periodos', 'metas_dias'].find((x) => st[x]);
    if (!k) return 'Alteração';
    if (k === 'metas_dias') return 'Progresso da meta';
    const s = st[k], nk = (list) => (k === 'blocos' && list.every(undoIsSub) ? 'sublista' : k);
    if (s.n.length && !s.d.length && !s.m.length) return undoWord(nk(s.n), s.n.length, 'criad');
    if (s.d.length && !s.n.length && !s.m.length) return undoWord(nk(s.d), s.d.length, 'apagad');
    if (s.m.length === 1 && !s.n.length && !s.d.length) return undoModLabel(k, s.m[0]);
    if (s.m.length > 1 && !s.n.length && !s.d.length) {
        if (k === 'blocos' && s.m.every((c) => undoModLabel(k, c) === undoModLabel(k, s.m[0]) && /movid/.test(undoModLabel(k, c)))) return s.m.length + ' blocos movidos';
        return undoWord(k, s.m.length, 'editad');
    }
    if (!s.n.length && !s.d.length && !s.m.length && s.o) return k === 'tarefas' ? 'Cartão mudou de lugar' : k === 'listas' ? 'Lista mudou de lugar' : 'Ordem mudada';
    return 'Alteração';
}

// ---- desfazer / refazer ----
function undoOrder(arr, target, idOf) { // põe os itens conhecidos na ordem "target"; os que surgiram depois ficam onde estão
    const pos = new Map(target.map((id, i) => [id, i]));
    const known = arr.filter((x) => pos.has(idOf(x))).sort((a, b) => pos.get(idOf(a)) - pos.get(idOf(b)));
    let j = 0;
    return arr.map((x) => (pos.has(idOf(x)) ? known[j++] : x));
}
function undoApply(step, dir) { // dir 'b' = desfazer (volta pro antes) · 'a' = refazer
    const other = dir === 'b' ? 'a' : 'b', res = { done: 0, skipped: 0, keys: {} };
    undoMute++;
    try {
        Object.keys(step.keys).forEach((key) => {
            const K = undoKeys()[key], R = step.keys[key], idOf = K.id || undoIdOf;
            let arr = (Array.isArray(K.get()) ? K.get() : []).slice(), touched = false;
            const byId = new Map();
            arr.forEach((x) => { const id = idOf(x); if (id != null && !byId.has(id)) byId.set(id, x); });
            R.ch.forEach((c) => {
                const x = byId.get(c.id), was = c[other], want = c[dir];
                if (!(was ? !!x && undoSer(K, x).s === was.s : !x)) { res.skipped++; return; } // mudou depois (outro aparelho): fica como está
                res.done++; touched = true;
                if (!want) { arr = arr.filter((y) => idOf(y) !== c.id); byId.delete(c.id); return; }
                const o = JSON.parse(want.s);
                if (want.k) Object.assign(o, want.k);
                if (x) arr[arr.indexOf(x)] = o;
                else { // volta pro lugar: logo depois de quem estava em cima (ou no começo)
                    const anchor = dir === 'b' ? c.pb : c.pa, ai = anchor ? arr.findIndex((y) => idOf(y) === anchor) : -1;
                    arr.splice(ai + 1, 0, o);
                }
                byId.set(c.id, o);
            });
            if (R.ob && R.oa) {
                const was = arr.map(idOf).join('\n');
                arr = undoOrder(arr, dir === 'b' ? R.ob : R.oa, idOf);
                touched = true;
                if (arr.map(idOf).join('\n') !== was) res.done++; // V40.33.0: só a ordem (lista ou cartão que trocou de lugar) também é desfazer de verdade
            }
            if (touched) { K.set(arr); K.save(); res.keys[key] = true; }
        });
    } finally { undoMute--; }
    return res;
}
function undoRefresh(keys) {
    const run = (f) => { try { f(); } catch (e) { console.warn('[Faz] desfazer', e); } };
    const has = (...ks) => ks.some((k) => keys[k]);
    if (has('blocos', 'tags', 'notas', 'arquivo')) run(() => { runRealTimeEngine(); renderTimeline(); });
    if (has('tarefas', 'listas', 'tags', 'arquivo', 'blocos')) {
        run(() => { if (!backlogColumnsDb.some((c) => c.id === activeColumnId)) activeColumnId = 'col_geral'; renderBacklog(); });
    }
    if (has('arquivo')) run(renderArchive);
    if (has('tags')) run(() => { renderTagsList(); renderTagSelector(); });
    if (has('rotinas') && typeof window.renderRoutinesList === 'function') run(window.renderRoutinesList);
    if (has('notas') && typeof window.renderNotes === 'function') run(window.renderNotes);
    if (has('financas') && typeof window.renderFinancial === 'function') run(window.renderFinancial);
    if (has('metas_listas', 'metas', 'metas_dias', 'blocos') && typeof window.renderGoals === 'function') run(window.renderGoals); // V40.34.0: blocos ligados contam nas metas
    if (has('periodos')) run(() => { renderConfigPeriods(); renderPeriodSelect(); });
}
function undoLow(t) { return /^[A-ZÀ-Ú][a-zà-ú]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
window.fazUndo = function () {
    undoClose(); // fecha um passo que ainda estivesse sendo montado
    const step = undoStack.pop();
    if (!step) { undoBarShow('Nada pra desfazer', 'info', 2500); return false; }
    const r = undoApply(step, 'b');
    undoRefresh(r.keys);
    if (!r.done) { undoBarShow('Não deu pra desfazer: isso já mudou em outro aparelho', 'warn', 5000); return false; }
    redoStack.push(step);
    undoBarShow('Desfeito: ' + undoLow(step.label) + (r.skipped ? ' (em parte: o resto mudou em outro aparelho)' : ''), 'undone', 6000);
    return true;
};
window.fazRedo = function () {
    undoClose();
    const step = redoStack.pop();
    if (!step) { undoBarHide(); return false; }
    const r = undoApply(step, 'a');
    undoRefresh(r.keys);
    if (!r.done) { undoBarShow('Não deu pra refazer: isso já mudou em outro aparelho', 'warn', 5000); return false; }
    undoStack.push(step);
    undoBarShow('Refeito: ' + undoLow(step.label), 'redone', 6000);
    return true;
};

// ---- a barrinha (embaixo, por cima das telas e abaixo das janelinhas de confirmação) ----
function undoModalOpen() { // alguma janelinha de confirmação (as "-modal") aberta?
    return [...document.querySelectorAll('[id$="-modal"]')].some((m) => !m.classList.contains('hidden') &&
        (m.classList.contains('flex') || (getComputedStyle(m).display !== 'none' && m.offsetParent !== null)));
}
function undoBarShow(text, mode, ms) {
    const bar = document.getElementById('undo-bar');
    if (!bar) return;
    const a = document.activeElement;
    if (mode === 'did' && a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { undoBarHide(); return; } // digitando: não cobre o campo
    if (mode === 'did' && undoModalOpen()) { undoBarHide(); return; } // com janelinha aberta a barrinha ficaria solta por cima do fundo escuro
    document.getElementById('undo-bar-msg').textContent = text;
    document.getElementById('undo-bar-undo').classList.toggle('hidden', !undoStack.length || mode === 'info');
    document.getElementById('undo-bar-redo').classList.toggle('hidden', !redoStack.length || (mode !== 'undone' && mode !== 'redone'));
    bar.classList.toggle('undo-warn', mode === 'warn');
    bar.classList.remove('hidden');
    // com a tarefa na mão, fica acima da faixa dela (que pode ser mais alta com letra grande)
    const ft = document.getElementById('floating-task'), host = bar.offsetParent;
    bar.style.bottom = '';
    if (ft && host && !ft.classList.contains('hidden') && ft.offsetParent === host) {
        const need = host.clientHeight - ft.offsetTop + 10;
        if (need > 160) bar.style.bottom = need + 'px';
    }
    clearTimeout(undoBarT);
    undoBarT = setTimeout(undoBarHide, ms || 5000);
}
function undoBarHide() {
    clearTimeout(undoBarT);
    const bar = document.getElementById('undo-bar');
    if (bar) bar.classList.add('hidden');
}
document.addEventListener('focusin', (e) => { // começou a digitar: a barrinha sai da frente
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) undoBarHide();
});
if (typeof MutationObserver === 'function') { // abriu uma janelinha (apagar, mover, renomear...): a barrinha sai
    const mo = new MutationObserver(() => { if (undoModalOpen()) undoBarHide(); });
    document.querySelectorAll('[id$="-modal"]').forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['class'] }));
}
undoInit();

// V40.8.0 — avisa (uma vez por abertura) se algum dado salvo estava ilegível.
if (window.fazCorruptKeys && window.fazCorruptKeys.length) {
    const nomes = { tb_master_db: 'agenda', tb_backlog_db: 'listas', tb_backlog_columns: 'listas', tb_tags_db: 'tags', tb_notes_db: 'notas', tb_routines_db: 'rotinas', tb_periods_db: 'períodos', tb_financial_db: 'finanças', tb_goal_lists: 'metas', tb_goals_db: 'metas', tb_goal_days: 'metas' };
    const quais = Array.from(new Set(window.fazCorruptKeys.map(k => nomes[k] || k))).join(', ');
    setTimeout(() => alert('⚠️ Parte dos dados deste aparelho estava ilegível (' + quais + ') e voltou ao padrão.\n\nGuardei uma cópia do que havia. Se você tem um backup, restaure em Config → Backup e Restauração.'), 800);
}

// V40.8.0 — iOS (iPhone/iPad): ajustes que só rodam lá. Android e desktop não entram aqui.
(function () {
    const ua = navigator.userAgent || '';
    const isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS) return;
    document.documentElement.classList.add('is-ios');
    // 1) O feedback de toque (:active) dos botões só funciona no iOS se existir um listener de toque.
    document.addEventListener('touchstart', function () {}, { passive: true });
    // 2) Depois que o teclado fecha, o iOS às vezes deixa a página deslocada. Volta pro lugar.
    document.addEventListener('focusout', function () {
        setTimeout(function () {
            const a = document.activeElement;
            if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) window.scrollTo(0, 0);
        }, 80);
    });
    // 3) O iOS não oferece "Instalar app" sozinho. Mostra a dica uma vez, fora do modo instalado.
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    let seen = false;
    try { seen = localStorage.getItem('tb__ios_dica_instalar') === '1'; } catch (e) {}
    if (standalone || seen) return;
    window.addEventListener('load', function () {
        const hint = document.createElement('div');
        hint.className = 'fixed left-3 right-3 bg-zinc-900 text-white px-4 py-3 rounded-2xl shadow-2xl z-[80] flex items-start gap-3';
        hint.style.bottom = 'calc(env(safe-area-inset-bottom) + 12px)';
        hint.innerHTML = '<i class="ph ph-export text-xl shrink-0 mt-0.5"></i>' +
            '<p class="text-[13px] leading-snug flex-1"><b>Instale o app no iPhone:</b> toque em <b>Compartilhar</b> (no iOS 26 ele fica nos <b>⋯</b> da barra de endereço) e depois em <b>Adicionar à Tela de Início</b>. Instalado, ele abre em tela cheia e guarda seus dados com segurança.</p>' +
            '<button aria-label="Fechar" class="shrink-0 w-8 h-8 -mr-1 flex items-center justify-center rounded-full bg-white/10"><i class="ph-bold ph-x"></i></button>';
        hint.querySelector('button').addEventListener('click', function () {
            try { localStorage.setItem('tb__ios_dica_instalar', '1'); } catch (e) {}
            hint.remove();
        });
        document.body.appendChild(hint);
    });
})();
