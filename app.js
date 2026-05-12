// --- 1. FÍSICA UNIVERSAL ---
const PX_PER_MIN = 2.5; 

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
let headerHidden = false; // V2.0 - Estado do header
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
let db = JSON.parse(localStorage.getItem('tb_master_db'));
let backlogDb = JSON.parse(localStorage.getItem('tb_backlog_db')) || [];
let backlogSelectedDur = 30;

// V40.1: Super Gabinete - Notas livres do dia
let notesDb = JSON.parse(localStorage.getItem('tb_notes_db')) || [];
let activeListTab = 'backlog'; // 'backlog' | 'routines' | 'notes'

let periodsDb = JSON.parse(localStorage.getItem('tb_periods_db'));
if (!periodsDb || periodsDb.length === 0) {
    periodsDb = [
        { id: 'p1', name: 'Manhã', start: '08:00', end: '12:00' },
        { id: 'p2', name: 'Meio-dia', start: '12:00', end: '13:00' },
        { id: 'p3', name: 'Tarde', start: '13:00', end: '18:00' },
        { id: 'p4', name: 'Noite', start: '18:00', end: '22:00' }
    ];
    localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb));
}

let tagsDb = JSON.parse(localStorage.getItem('tb_tags_db'));
if (!tagsDb || tagsDb.length === 0) {
    tagsDb = [
        { id: 'tag_1', name: 'Trabalho', color: '#ef4444' }, // Vermelho
        { id: 'tag_2', name: 'Pessoal', color: '#10b981' },  // Verde
        { id: 'tag_3', name: 'Estudo', color: '#f59e0b' }    // Amarelo
    ];
    localStorage.setItem('tb_tags_db', JSON.stringify(tagsDb));
}

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

function saveDb() { localStorage.setItem('tb_master_db', JSON.stringify(db)); }
function saveBacklog() { localStorage.setItem('tb_backlog_db', JSON.stringify(backlogDb)); }
function savePeriods() { localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb)); }
function saveTags() { localStorage.setItem('tb_tags_db', JSON.stringify(tagsDb)); }

// --- FUNÇÕES DE TAGS ---
window.addTag = function(name, color) {
    if(!name || !color) return;
    tagsDb.push({ id: 'tag_' + Date.now(), name: name.trim(), color: color });
    saveTags();
}

window.deleteTag = function(id) {
    tagsDb = tagsDb.filter(t => t.id !== id);
    saveTags();
    
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
                <span class="font-bold text-sm text-zinc-800">${t.name}</span>
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
                ${t.name}
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
    const matched = db.filter(b => normalizeText(b.title).includes(q)).length;
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
    
    document.getElementById('header-date').innerHTML = 
        (isToday ? `<span class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span> ` : `<i class="ph ph-calendar text-zinc-400 text-lg"></i> `) + 
        `<span class="font-bold text-zinc-800">${dateStr}</span>`;

    const nowLine = document.getElementById('now-line');
    if ((isToday && currentRealMins >= START_HOUR * 60 && currentRealMins <= END_HOUR * 60) && !showOnlyDelayed && !showOnlyCompleted) {
        const topPx = (currentRealMins - (START_HOUR * 60)) * PX_PER_MIN;
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

// --- MICROBLOCOS FUNCTIONS ---
window.toggleBlockCompletion = function(id, e) {
    e.stopPropagation();
    let b = db.find(x => x.id === id);
    if(b) {
        b.completed = !b.completed;
        saveDb();
        renderTimeline();
    }
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

function renderGrid() {
    // V3.0 - Bug 2.5: Modo filtro com altura automática
    const tlContainer = document.getElementById('timeline-container');
    const isSearching = !!(searchQuery && searchQuery.trim());
    if (showOnlyDelayed || showOnlyCompleted || isSearching) {
        tlContainer.style.height = 'auto';
    } else {
        tlContainer.style.height = `${TOTAL_MINS * PX_PER_MIN}px`;
    }
    const yAxis = document.getElementById('y-axis');
    const gridLines = document.getElementById('grid-lines');
    yAxis.innerHTML = '';
    gridLines.innerHTML = '';
    
    for (let i = START_HOUR; i <= END_HOUR; i++) {
        const topPx = (i - START_HOUR) * 60 * PX_PER_MIN;
        yAxis.innerHTML += `<div class="absolute text-[10px] text-zinc-400 font-medium w-10 text-right left-0 -translate-y-1/2" style="top: ${topPx}px">${i.toString().padStart(2, '0')}:00</div>`;
        gridLines.innerHTML += `<div class="absolute w-[calc(100%+40px)] -left-14 border-t border-black/[0.05]" style="top: ${topPx}px"></div>`;
    }
}

function formatClock(m) { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; }
function formatDur(m) { const h = Math.floor(m/60), min = m%60; return h > 0 && min > 0 ? `${h}h ${min}m` : (h > 0 ? `${h}h` : `${min}m`); }
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg; t.classList.remove('opacity-0'); setTimeout(() => t.classList.add('opacity-0'), 2500); }

function renderTimeline() {
    container.innerHTML = ''; 
    
    const timelineContainer = document.getElementById('timeline-container');
    const isSearching = !!(searchQuery && searchQuery.trim());
    
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
        if (isSearching) {
            const q = normalizeText(searchQuery);
            filteredForWindow = filteredForWindow.filter(b => normalizeText(b.title).includes(q));
        }
        
        if (filteredForWindow.length > 0) {
            const minStart = Math.min(...filteredForWindow.map(b => b.startMin));
            const maxEnd = Math.max(...filteredForWindow.map(b => b.startMin + b.duration));
            
            START_HOUR = Math.max(0, Math.floor(minStart / 60) - 1);
            END_HOUR = Math.min(24, Math.ceil(maxEnd / 60) + 1);
            TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
        }
    }

    renderGrid(); 

    let dailyDb = db.filter(b => b.date === getActiveDateStr());
    
    if (showOnlyDelayed) {
        dailyDb = dailyDb.filter(b => b.type === 'past' || b.wasDelayed);
    }

    if (showOnlyCompleted) {
        dailyDb = dailyDb.filter(b => b.completed === true);
    }

    // V40.2.5: filtro de busca por nome (normaliza acentos, case-insensitive)
    if (searchQuery && searchQuery.trim()) {
        const q = normalizeText(searchQuery);
        dailyDb = dailyDb.filter(b => normalizeText(b.title).includes(q));
    }

    dailyDb = dailyDb.filter(b => b.startMin < END_HOUR * 60 && (b.startMin + b.duration) > START_HOUR * 60);
    dailyDb.sort((a, b) => a.startMin - b.startMin);
    
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
    document.getElementById('progress-text').innerText = `Planejado (${pct}%)`;

    renderQueue.forEach(block => drawBlock(block));
}

// V40.2.6: Renderiza resultados de busca de TODOS os dias como lista
function renderSearchResultsAllDays() {
    const q = normalizeText(searchQuery);
    const today = getTodayStr();
    
    // Pega TODOS os blocos do db (qualquer data) que batem com a busca
    let results = db.filter(b => normalizeText(b.title).includes(q));
    
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
    
    closeSearchBar();
    
    activeDateObj = new Date(dateStr + 'T12:00:00');
    runRealTimeEngine();
    renderTimeline();
    
    setTimeout(() => showToast(`Indo pra ${label}`), 100);
}

function drawBlock(block) {
    const topPx = (block.startMin - (START_HOUR * 60)) * PX_PER_MIN;
    const heightPx = (block.duration * PX_PER_MIN) - 2; 

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

    if (block.type === 'empty') {
        el.className += ' bg-hatched border border-dashed items-center justify-center text-center';
        if (pendingIntent) {
            if (block.duration >= pendingIntent.duration) {
                el.classList.add('border-black/20', 'animate-pulse-drop', 'cursor-pointer', 'z-30');
                el.onclick = () => performEncaixeMatematico(block.startMin, block.duration);
                el.innerHTML = `<i class="ph ph-hand-pointing text-2xl text-app-focus drop-shadow-md mb-1"></i> ${!isSmall ? `<span class="text-[10px] font-bold text-app-focus uppercase tracking-widest">Soltar Aqui</span>` : ''}`;
            } else {
                el.classList.add('border-red-500/20', 'opacity-50');
                el.innerHTML = `<span class="text-[9px] text-red-500 font-bold uppercase">Muito Curto</span>`;
            }
        } else {
            el.classList.add('border-black/10', 'opacity-60');
            el.innerHTML = `${!isSmall ? `<span class="text-sm font-semibold tracking-wide mb-1 text-zinc-500">Tempo Livre</span>` : ''}<span class="text-[10px] bg-black/5 text-zinc-600 px-2 py-1 rounded font-medium">${formatDur(block.duration)} livres</span>`;
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
        if (block.expanded) {
            el.className += ` ${bgClass} shadow-2xl border px-3 pt-2 pb-6 group select-none transition-all duration-300`;
            el.style.height = 'auto'; el.style.minHeight = `${heightPx}px`; el.style.zIndex = '35'; 
        } else {
            el.className += ` ${bgClass} border px-3 ${isMicro ? 'pt-1.5 pb-1.5' : 'pt-2 pb-4'} group select-none transition-all duration-300`;
        }
        if (borderStyle) el.style.cssText += borderStyle;

        // V40.2.20: isDarkTheme agora cobre TODOS os fundos escuros do app:
        //   - foco normal (futuro OU atrasado, ambos com bg-app-focus)
        //   - concluído (sempre emerald-500)
        // Só rest não-concluído (emerald-50 / zinc-50) usa tema claro.
        const isDarkTheme = !isRest || block.completed;

        const timeColor = isDarkTheme ? 'text-white/60' : 'text-zinc-500';
        // V40.2.20: título do concluído agora é branco riscado (sobre fundo emerald-500), não mais emerald-900 desbotado.
        const titleClass = `${block.completed ? 'line-through opacity-90 text-white' : (isDarkTheme ? 'text-white' : (isRest ? 'text-emerald-900' : 'text-zinc-800'))}`;
        const iconColor = isDarkTheme ? 'text-white/60 hover:text-white' : 'text-zinc-400 hover:text-zinc-700';
        const checkColor = isDarkTheme ? (block.completed ? 'text-white hover:text-white/80' : 'text-white/60 hover:text-white') : (block.completed ? 'text-emerald-600 hover:text-emerald-700' : 'text-zinc-400 hover:text-emerald-600');
        const btnBg = isDarkTheme ? 'bg-black/20 hover:bg-black/30' : 'bg-black/5 hover:bg-black/10';
        const glowCircle = isDarkTheme ? 'bg-white/10' : 'bg-white/60';

        let microblocksSection = '';
        let microHtml = (block.microblocks || []).map(mb => `
            <div class="flex items-start gap-1.5 mb-1.5 z-20 relative group/mb pointer-events-auto">
                <button onclick="toggleMicroblock('${block.id}', '${mb.id}', event)" class="mt-[3px] shrink-0 w-3.5 h-3.5 rounded-[4px] border ${mb.done ? (isDarkTheme ? 'bg-white border-white' : 'bg-emerald-500 border-emerald-500') : (isDarkTheme ? 'border-white/30' : 'border-black/20')} flex items-center justify-center transition-colors">
                    ${mb.done ? `<i class="ph-bold ph-check text-[10px] ${isDarkTheme ? 'text-app-focus' : 'text-white'}"></i>` : ''}
                </button>
                <span class="text-[11px] font-medium leading-tight flex-1 pt-[1px] ${mb.done ? (isDarkTheme ? 'text-white/40 line-through' : 'text-black/40 line-through') : (isDarkTheme ? 'text-white/90' : 'text-black/80')}">${mb.title}</span>
                <button onclick="deleteMicroblock('${block.id}', '${mb.id}', event)" class="shrink-0 mt-[2px] flex items-center justify-center ${isDarkTheme ? 'text-white/40 hover:text-red-400' : 'text-black/30 hover:text-red-500'} transition-colors">
                   <i class="ph ph-x text-[12px]"></i>
                </button>
            </div>
        `).join('');

        const mbInputClasses = isDarkTheme 
            ? 'bg-black/10 hover:bg-black/20 focus:bg-black/30 focus:border-white/20 text-white placeholder-white/50 border-transparent'
            : 'bg-black/5 hover:bg-black/10 focus:bg-white focus:border-zinc-300 text-zinc-900 placeholder-zinc-500 border-transparent shadow-sm';

        microblocksSection = `
            <div class="flex-1 overflow-y-auto no-scrollbar mt-2 mb-2 z-20 relative pointer-events-auto ${!block.expanded && block.duration <= 25 ? 'hidden' : ''}">
                ${microHtml}
                <div class="mt-1">
                    <input type="text" id="micro-input-${block.id}" placeholder="+ Adicionar Check" class="microblock-input w-full rounded-md px-2 py-1.5 text-[10px] font-medium outline-none transition-colors border ${mbInputClasses}" onkeypress="if(event.key==='Enter') addMicroblock('${block.id}', this, event)">
                </div>
                ${renderLinkedNotesSection(block, isDarkTheme)}
            </div>
        `;

        const showInfoIcon = isPast || block.wasDelayed;
        const pastIconHtml = showInfoIcon ? `<div class="pointer-events-auto w-3.5 h-3.5 rounded-full ${isDarkTheme ? 'bg-black/20 border-black/30 text-white/80' : 'bg-black/10 border-black/10 text-zinc-500'} flex items-center justify-center shrink-0 border mr-1.5" title="Tempo Esgotado / Realocado"><i class="ph-bold ph-info text-[8px]"></i></div>` : '';

        el.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 ${glowCircle} rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div class="flex justify-between items-start z-30 relative">
                <div class="flex flex-1 min-w-0 pr-2 gap-2">
                    <div class="drag-handle w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition pointer-events-auto shrink-0 mt-0.5" title="Arrastar (Mover)">
                        <i class="ph ph-dots-six-vertical"></i>
                    </div>
                    <div class="flex flex-col flex-1 min-w-0 pointer-events-auto">
                        <span ${isSearching ? '' : `onclick="openTimePicker('${block.id}', ${block.startMin}, event)"`} class="time-label ${isMicro ? 'hidden' : 'block'} text-[10px] font-bold tracking-widest ${timeColor} uppercase opacity-90 truncate ${isSearching ? '' : 'cursor-pointer hover:opacity-70 hover:underline'} transition max-w-full" title="${isSearching ? '' : 'Alterar Horário'}">${formatClock(block.startMin)} - ${formatClock(block.startMin + block.duration)} &bull; ${formatDur(block.duration)}</span>
                        <div class="title-wrapper flex items-center ${isMicro ? 'mt-0' : 'mt-0.5'} min-w-0 pointer-events-none">
                            ${pastIconHtml}
                            <h3 class="block-title ${isMicro ? 'text-[13px] mt-0' : 'text-[14px]'} font-bold leading-tight truncate ${titleClass}">${block.title}</h3>
                            <span class="micro-time ${isMicro ? 'block' : 'hidden'} text-[11px] font-bold ${timeColor} ml-1 shrink-0 ${isSearching ? '' : 'cursor-pointer hover:opacity-70 hover:underline'} transition pointer-events-auto" ${isSearching ? '' : `onclick="openTimePicker('${block.id}', ${block.startMin}, event)"`} title="${isSearching ? '' : 'Alterar Horário'}">&bull; <span class="micro-time-val">${formatDur(block.duration)}</span></span>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-1.5 shrink-0 relative z-50 pointer-events-auto select-auto">
                    <button onclick="toggleExpandBlock('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition" title="Expandir/Recolher">
                        <i class="ph ${block.expanded ? 'ph-caret-up' : 'ph-caret-down'}"></i>
                    </button>
                    <button onclick="toggleBlockCompletion('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${checkColor} rounded transition" title="Concluir">
                        <i class="${block.completed ? 'ph-fill ph-check-circle' : 'ph ph-check'}"></i>
                    </button>
                    <button onclick="openEditModal('${block.id}', event)" class="flex w-6 h-6 items-center justify-center ${btnBg} ${iconColor} hover:text-white rounded transition" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button onclick="duplicateTask('${block.id}', event)" class="flex w-6 h-6 items-center justify-center ${btnBg} ${iconColor} hover:text-white rounded transition" title="Duplicar">
                        <i class="ph ph-copy"></i>
                    </button>
                    <button onclick="openDeleteModal('${block.id}', event)" class="flex w-6 h-6 items-center justify-center ${btnBg} hover:bg-red-500/80 ${iconColor} hover:text-white rounded transition" title="Apagar">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
            
            ${microblocksSection}

            <div class="resize-handle absolute bottom-0 left-12 w-12 h-6 flex items-end justify-start pb-1.5 z-40">
                <div class="w-8 h-1 ${isDarkTheme ? 'bg-white/40' : 'bg-black/20'} rounded-full pointer-events-none"></div>
            </div>
        `;
        enablePhysics(el, block);
    }
    container.appendChild(el);
}

// --- 5. ENCAIXE MATEMÁTICO ---
function performEncaixeMatematico(gapStart, gapDuration) {
    let start = gapStart;
    if (getActiveDateStr() === getTodayStr() && currentRealMins >= gapStart && currentRealMins <= gapStart + gapDuration) {
        if (currentRealMins + pendingIntent.duration <= gapStart + gapDuration) {
            start = Math.round(currentRealMins / 5) * 5; 
            start = Math.max(gapStart, Math.min(start, gapStart + gapDuration - pendingIntent.duration));
        }
    }
    start = Math.round(start / 5) * 5;
    
    db.push({ 
        id: 'f_' + Date.now(), 
        type: 'focus', 
        title: pendingIntent.title, 
        startMin: start, 
        duration: pendingIntent.duration,
        date: getActiveDateStr(),
        microblocks: (pendingIntent.microblocks || []).map(mb => ({
            ...mb,
            id: 'mb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            done: false // V40.1.4: clone reseta status (recomeça do zero)
        })),
        completed: false,
        theme: pendingIntent.theme || 'focus',
        tagId: pendingIntent.tagId || null,
        linkedNoteIds: [] // V40.2: notas vinculadas começam vazias (clone não copia notas)
    });
    saveDb();
    cancelPendingTask(); 
}

function addDaysToDateStr(dateStr, days) {
    let d = new Date(dateStr + 'T00:00:00'); 
    d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-CA');
}
function addMonthToDateStr(dateStr, monthsToAdd) {
    let d = new Date(dateStr + 'T00:00:00');
    d.setMonth(d.getMonth() + monthsToAdd);
    return d.toLocaleDateString('en-CA');
}

window.duplicateTask = function(id, e) {
    e.stopPropagation();
    let b = db.find(x => x.id === id);
    if(b) {
        taskToClone = b;
        closeAllSheets();
        document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
        document.getElementById('clone-sheet').classList.remove('translate-y-full');
    }
}

window.cloneManual = function() {
    if(!taskToClone) return;
    pendingIntent = { 
        title: taskToClone.title, 
        duration: taskToClone.duration, 
        theme: taskToClone.theme || 'focus',
        tagId: taskToClone.tagId || null, // V40.1.4: preserva tag
        microblocks: taskToClone.microblocks || [] // V40.1.4: copia microblocks
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

window.promptCloneQtd = function(type) {
    if(!taskToClone) return;
    pendingCloneType = type;
    const modal = document.getElementById('clone-qtd-modal');
    const title = document.getElementById('clone-qtd-title');
    const input = document.getElementById('clone-qtd-input');

    if(type === 'daily') { title.innerText = 'Quantos dias seguidos?'; input.value = '5'; }
    else if(type === 'weekly') { title.innerText = 'Por quantas semanas?'; input.value = '4'; }
    else if(type === 'monthly') { title.innerText = 'Por quantos meses?'; input.value = '2'; }

    document.getElementById('clone-sheet').classList.add('translate-y-full'); 
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

window.confirmCloneQtd = function() {
    const inputVal = document.getElementById('clone-qtd-input').value;
    const num = parseInt(inputVal);
    if(isNaN(num) || num <= 0) return showToast("Número inválido.");

    for(let i=1; i<=num; i++) {
        let nextDate;
        if(pendingCloneType === 'daily') nextDate = addDaysToDateStr(taskToClone.date, i);
        else if(pendingCloneType === 'weekly') nextDate = addDaysToDateStr(taskToClone.date, i * 7);
        else if(pendingCloneType === 'monthly') nextDate = addMonthToDateStr(taskToClone.date, i);

        db.push({...taskToClone, id: 'f_' + Date.now() + '_' + Math.random(), date: nextDate, microblocks: (taskToClone.microblocks || []).map(mb => ({...mb, id: 'mb_' + Date.now() + Math.random(), done: false})), completed: false, expanded: false, linkedNoteIds: []});
    }
    saveDb();
    closeAllSheets();
    renderTimeline(); // V40.2.8: re-render pra atualizar lista de busca se estiver ativa
    showToast(`Clonado com sucesso!`);
}

window.cancelCloneQtd = function() {
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

    function onDragStart(e) {
        e.preventDefault(); e.stopPropagation();
        isPhysicsBusy = true; // V40.1.3: bloquear auto-retrair durante drag
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        initialVal = block.startMin;
        el.classList.add('dragging');
        
        document.addEventListener('touchmove', onDragMove, {passive: false});
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('touchend', onDragEnd);
        document.addEventListener('mouseup', onDragEnd);
    }
    
    function onDragMove(e) {
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaMins = Math.round(((y - startY) / PX_PER_MIN) / 5) * 5; 
        
        let newStart = initialVal + deltaMins;
        newStart = Math.round(newStart / 5) * 5; 
        newStart = Math.max(START_HOUR * 60, Math.min(newStart, (END_HOUR * 60) - block.duration));
        
        el.style.top = `${(newStart - (START_HOUR * 60)) * PX_PER_MIN}px`;
        el.dataset.tempStart = newStart;
    }

    function onDragEnd() {
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
        document.removeEventListener('mouseup', onDragEnd);
        
        if (el.classList.contains('dragging')) {
            el.classList.remove('dragging');
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
        
        document.addEventListener('touchmove', onResizeMove, {passive: false});
        document.addEventListener('mousemove', onResizeMove);
        document.addEventListener('touchend', onResizeEnd);
        document.addEventListener('mouseup', onResizeEnd);
    }
    
    function onResizeMove(e) {
        e.preventDefault();
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        const deltaMins = Math.round(((y - startY) / PX_PER_MIN) / 5) * 5; 
        
        let newDur = initialVal + deltaMins;
        newDur = Math.round(newDur / 5) * 5; 
        newDur = Math.max(15, Math.min(newDur, maxVal));
        
        if (newDur !== block.duration) {
            block.duration = newDur;
            el.style.height = `${(newDur * PX_PER_MIN) - 2}px`;
            el.querySelector('.time-label').innerHTML = `${formatClock(block.startMin)} - ${formatClock(block.startMin + newDur)} &bull; ${formatDur(newDur)}`;
            
            const microVal = el.querySelector('.micro-time-val');
            if(microVal) microVal.innerText = formatDur(newDur);
            
            if (newDur <= 25) el.classList.add('micro-block');
            else el.classList.remove('micro-block');
        }
    }

    function onResizeEnd() {
        document.removeEventListener('touchmove', onResizeMove);
        document.removeEventListener('mousemove', onResizeMove);
        document.removeEventListener('touchend', onResizeEnd);
        document.removeEventListener('mouseup', onResizeEnd);
        block.expanded = false; 
        saveDb();
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
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    document.getElementById('config-sheet').classList.add('translate-y-full');
    document.getElementById('period-select-sheet').classList.add('translate-y-full');
    
    selectedTagId = null;
    renderTagSelector();

    overlay.classList.remove('opacity-0', 'pointer-events-none');
    sheet.classList.remove('translate-y-full');
    
    // V40.1.4: foco automático no input após animação do sheet (350ms)
    setTimeout(() => {
        const taskInput = document.getElementById('task-input');
        if (taskInput) taskInput.focus();
    }, 350);
}

window.openListSheet = () => {
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    switchListTab('backlog'); // V40.1: sempre abrir na aba Banco
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    listSheet.classList.remove('translate-y-full');
}

window.closeAllSheets = () => {
    overlay.classList.add('opacity-0', 'pointer-events-none');
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

    input.blur();
    backlogInput.blur();
    if(!pendingIntent) {
        fab.style.transform = 'scale(1)';
        if(listBtn) listBtn.style.transform = 'scale(1)';
    }
}

window.closeSheet = window.closeAllSheets;

window.commitIntent = () => {
    const title = input.value.trim();
    if (!title) return;
    
    pendingIntent = { title: title, duration: selectedDur, theme: 'focus', tagId: selectedTagId };
    input.value = '';
    closeAllSheets();
    
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    renderTimeline(); 
};

window.commitSpecialIntent = (title, theme) => {
    pendingIntent = { title: title, duration: selectedDur, theme: theme, tagId: selectedTagId };
    input.value = '';
    closeAllSheets();
    
    document.getElementById('floating-title').innerText = title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    renderTimeline(); 
};

// --- LÓGICA DE PERÍODOS E HORÁRIOS GERAIS ---
window.openPeriodSelectSheet = () => {
    sheet.classList.add('translate-y-full'); 
    renderPeriodSelect();
    document.getElementById('period-select-sheet').classList.remove('translate-y-full');
}

window.comingSoonMetas = () => {
    // V40.1.6: Placeholder para futuro recurso de Metas
    showToast("Metas chegando em breve! 🎯");
}

window.openConfigSheet = () => {
    clearFilters(); // V40.2.1: limpa filtros pra não confundir
    sheet.classList.add('translate-y-full'); 
    
    document.getElementById('config-periods-view').classList.add('hidden');
    document.getElementById('config-hours-view').classList.add('hidden');
    document.getElementById('config-appearance-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
    
    document.getElementById('config-sheet').classList.remove('translate-y-full');
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
        linkedNoteIds: [] // V40.2
    });
    saveDb();
    input.value = '';
    closeAllSheets();
    renderTimeline(); 
    showToast(`${period.name} Agendado!`);
};

function renderPeriodSelect() {
    const container = document.getElementById('period-select-container');
    container.innerHTML = periodsDb.map(p => `
        <button onclick="commitPeriodBlock('${p.id}')" class="w-full flex items-center justify-between p-4 mb-2 bg-zinc-50 border border-zinc-200 rounded-xl hover:bg-app-focus hover:text-white transition text-left group">
            <span class="font-bold text-zinc-800 group-hover:text-white">${p.name}</span>
            <span class="text-[11px] font-bold text-zinc-500 bg-white border border-zinc-200 px-2 py-1 rounded group-hover:text-zinc-800">${p.start} às ${p.end}</span>
        </button>
    `).join('');
}

function renderConfigPeriods() {
    const container = document.getElementById('config-periods-list');
    container.innerHTML = periodsDb.map(p => `
        <div class="flex items-center justify-between bg-white border border-zinc-200 p-3 rounded-xl shadow-sm">
            <div class="flex flex-col">
                <span class="text-sm font-bold text-zinc-800">${p.name}</span>
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
    
    periodsDb.push({ id: 'p_' + Date.now(), name, start, end });
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

window.addBacklogItem = () => {
    const title = backlogInput.value.trim();
    if(!title) return;

    backlogDb.push({
        id: 'bl_' + Date.now(),
        title: title,
        duration: backlogSelectedDur
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

    backlogDb = backlogDb.filter(i => i.id !== id);
    saveBacklog();

    pendingIntent = { title: item.title, duration: item.duration, theme: 'focus', tagId: item.tagId || null };
    selectedDur = item.duration;
    syncDurButtons(selectedDur);
    
    document.getElementById('floating-title').innerText = item.title;
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    
    closeAllSheets();
    renderTimeline();
};

function renderBacklog() {
    const container = document.getElementById('backlog-container');
    document.getElementById('backlog-count').innerText = backlogDb.length;
    
    const totalMins = backlogDb.reduce((acc, item) => acc + item.duration, 0);
    const listStats = document.getElementById('list-btn-stats');
    const listCount = document.getElementById('list-btn-count');
    const listTime = document.getElementById('list-btn-time');
    const backlogTotalTime = document.getElementById('backlog-total-time'); // Keep this if exists
    
    if (backlogDb.length > 0) {
        listStats.classList.remove('hidden');
        listStats.classList.add('flex');
        listCount.innerText = backlogDb.length + (backlogDb.length === 1 ? ' item' : ' itens');
        listTime.innerText = formatDur(totalMins);
        if (backlogTotalTime) {
            backlogTotalTime.innerText = formatDur(totalMins);
            backlogTotalTime.classList.remove('hidden');
        }
    } else {
        listStats.classList.add('hidden');
        listStats.classList.remove('flex');
        if (backlogTotalTime) backlogTotalTime.classList.add('hidden');
    }
    
    if (backlogDb.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center opacity-50 py-8">
                <i class="ph ph-inbox text-4xl mb-2"></i>
                <p class="text-sm font-medium">Lista vazia!</p>
            </div>`;
        return;
    }

    container.innerHTML = backlogDb.map(item => {
        const tagColor = item.tagId ? getTagColor(item.tagId) : null;
        const tagHtml = tagColor ? `<div class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${tagColor};"></div>` : '';
        return `
        <div class="flex justify-between items-center bg-white border border-zinc-200 p-3.5 rounded-xl mb-3 shadow-sm hover:shadow transition-shadow group">
            <div class="flex items-start gap-2 min-w-0 pr-3 flex-1">
                ${tagHtml ? `<div class="mt-1">${tagHtml}</div>` : ''}
                <div class="flex flex-col min-w-0">
                    <span class="text-sm font-bold text-zinc-800 truncate mb-0.5">${item.title}</span>
                    <span class="text-[11px] font-bold text-zinc-500 flex items-center gap-1"><i class="ph ph-clock"></i> ${formatDur(item.duration)}</span>
                </div>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="scheduleBacklogItem('${item.id}')" class="w-10 h-10 flex items-center justify-center bg-app-focus-soft border border-app-focus-soft text-app-focus rounded-xl hover:bg-app-focus-soft-strong transition-colors" title="Segurar e Agendar">
                    <i class="ph ph-hand-grabbing text-lg"></i>
                </button>
                <button onclick="deleteBacklogItem('${item.id}')" class="w-10 h-10 flex items-center justify-center bg-red-50 border border-red-100 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors" title="Apagar">
                    <i class="ph ph-trash text-lg"></i>
                </button>
            </div>
        </div>
    `}).join('');
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
        const title = n.title || '<span class="text-zinc-400 italic">Sem título</span>';
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

function saveNotes() { localStorage.setItem('tb_notes_db', JSON.stringify(notesDb)); }

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
    
    // Atualizar pills
    ['backlog', 'routines', 'notes'].forEach(t => {
        const btn = document.getElementById(`btn-list-${t}`);
        if (!btn) return;
        if (t === tabName) {
            btn.className = 'flex-1 py-1.5 rounded-lg bg-white shadow-sm text-zinc-800 text-xs font-bold transition border border-black/5 flex items-center justify-center gap-1';
        } else {
            btn.className = 'flex-1 py-1.5 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50 text-xs font-bold transition border border-transparent flex items-center justify-center gap-1';
        }
    });
    
    // Mostrar view correspondente, esconder outras
    ['backlog', 'routines', 'notes'].forEach(t => {
        const view = document.getElementById(`view-${t}`);
        if (!view) return;
        if (t === tabName) view.classList.remove('hidden');
        else view.classList.add('hidden');
    });
    
    // Render dinâmico ao trocar
    if (tabName === 'notes') {
        notesFormOpen = false; // ao entrar na aba, sempre começa fechado
        editingNoteId = null;  // V40.1.2: garantir que não está em modo edição
        renderNotes();
    } else {
        notesFormOpen = false; // ao sair da aba, garante que form fica fechado da próxima vez
        editingNoteId = null;  // V40.1.2: limpar modo edição ao sair
    }
    if (tabName === 'backlog') renderBacklog();
}

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
    } else if (!hasNotes) {
        // Estado A: Empty. Mostra só o convite central.
        empty.classList.remove('hidden');
        form.classList.add('hidden');
        container.classList.add('hidden');
        header.classList.add('hidden');
    } else {
        // Estado C: Lista. Header com botão + e cards.
        empty.classList.add('hidden');
        form.classList.add('hidden');
        container.classList.remove('hidden');
        header.classList.remove('hidden');
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
backlogInput.addEventListener('keypress', e => { if (e.key === 'Enter') addBacklogItem(); });

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
                        <span class="font-bold text-sm text-zinc-800">${t.name}</span>
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
        targetY = (currentRealMins - (START_HOUR * 60)) * PX_PER_MIN - (scrollEl.clientHeight / 2);
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
window.adjustTimelinePadding = function() {
    const header = document.querySelector('header');
    const timeline = document.getElementById('timeline-scroll');
    if (!header || !timeline) return;
    if (headerHidden) return; // Modo retraído controla próprio padding
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
window.toggleHeader = function() {
    headerHidden = !headerHidden;
    const header = document.querySelector('header');
    const timeline = document.getElementById('timeline-scroll');
    const btn = document.querySelector('[onclick="toggleHeader()"]');
    
    if (headerHidden) {
        header.style.height = '100px'; // V38: 48px de pt-12 + 52px para botões respirarem (box-sizing: border-box)
        header.style.overflow = 'hidden';
        timeline.style.paddingTop = '110px';
        if(btn) btn.innerHTML = '<i class="ph ph-caret-down text-lg sm:text-xl text-zinc-600"></i>';
    } else {
        header.style.height = 'auto';
        header.style.overflow = 'visible';
        if(btn) btn.innerHTML = '<i class="ph ph-caret-up text-lg sm:text-xl text-zinc-600"></i>';
        // V3.0 V37: padding dinâmico baseado na altura real do header
        setTimeout(() => {
            const h = header.offsetHeight;
            timeline.style.paddingTop = (h + 8) + 'px';
        }, 50);
    }
}

// --- V2.0 - COMBO A: Edição ---
let editingTaskId = null;
let editingTagId = null;

window.openEditModal = function(id, e) {
    if(e) e.stopPropagation();
    const b = db.find(x => x.id === id);
    if(!b) return;
    
    closeAllSheets(); 
    
    editingTaskId = id;
    editingTagId = b.tagId;
    
    document.getElementById('edit-task-title').value = b.title;
    renderEditTagSelector();
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('edit-task-modal').classList.remove('hidden');
    document.getElementById('edit-task-modal').classList.add('flex');
}

window.selectEditTag = function(id) {
    editingTagId = editingTagId === id ? null : id;
    renderEditTagSelector();
}

window.renderEditTagSelector = function() {
    const container = document.getElementById('edit-tag-selector-container');
    if(!container) return;
    container.className = 'flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2 w-full';
    let html = `<button onclick="selectEditTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${editingTagId === null ? 'bg-app-focus border-app-focus text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}">Sem</button>`;
    tagsDb.forEach(t => {
        const isActive = editingTagId === t.id;
        const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100';
        html += `<button onclick="selectEditTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>${t.name}</button>`;
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
    
    document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none');
    document.getElementById('delete-task-modal').classList.remove('hidden');
    document.getElementById('delete-task-modal').classList.add('flex');
}

window.moveToBacklog = function() {
    if(!deletingTaskId) return;
    const b = db.find(x => x.id === deletingTaskId);
    if(b) {
        backlogDb.push({ id: 'bl_' + Date.now(), title: b.title, duration: b.duration, tagId: b.tagId || null });
        saveBacklog();
        db = db.filter(x => x.id !== deletingTaskId);
        saveDb();
        renderTimeline();
        renderBacklog();
        showToast("Movido para a lista!");
    }
    closeAllSheets();
    cancelDelete();
}

window.confirmKillTask = function() {
    if(!deletingTaskId) return;
    db = db.filter(b => b.id !== deletingTaskId);
    saveDb();
    renderTimeline();
    closeAllSheets();
    cancelDelete();
    showToast("Tarefa excluída.");
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
    
    document.querySelectorAll('.theme-color-btn').forEach(btn => {
        btn.classList.remove('scale-110', 'shadow-sm', 'border-zinc-900');
        btn.classList.add('border-transparent');
        if(btn.dataset.color === themeColor) {
            btn.classList.remove('border-transparent');
            btn.classList.add('scale-110', 'shadow-sm', 'border-zinc-900');
        }
    });
}

window.closeConfigAppearance = function() {
    document.getElementById('config-appearance-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
}

window.selectThemeColor = function(btn) {
    themeColor = btn.dataset.color;
    localStorage.setItem('tb_theme_color', themeColor);
    
    document.querySelectorAll('.theme-color-btn').forEach(b => {
        b.classList.remove('scale-110', 'shadow-sm', 'border-zinc-900');
        b.classList.add('border-transparent');
    });
    btn.classList.remove('border-transparent');
    btn.classList.add('scale-110', 'shadow-sm', 'border-zinc-900');
    
    applyThemeColor();
    showToast("Cor atualizada!");
}
