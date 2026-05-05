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
let taskToClone = null;
let pendingCloneType = '';
let selectedTagId = null;

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
}

window.getTagColor = function(tagId) {
    if(!tagId) return null;
    const tag = tagsDb.find(t => t.id === tagId);
    return tag ? tag.color : null;
}

let selectedNewTagColor = '#ef4444'; // Vermelho padrão

window.openTagsSheet = () => {
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
    let html = `<button onclick="selectTag(null)" class="px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${selectedTagId === null ? 'bg-zinc-900 border-zinc-900 text-white shadow-md' : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50'}">Sem Tag</button>`;
    tagsDb.forEach(t => {
        const isActive = selectedTagId === t.id;
        const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100';
        // Usamos hex color e adicionamos opacidade (15 no final do hex) pro fundo
        html += `
            <button onclick="selectTag('${t.id}')" class="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}">
                <div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>
                ${t.name}
            </button>
        `;
    });
    container.innerHTML = html;
}

// --- 3. AUTOMAÇÃO: O TEMPO E DIAS ---
window.debugPreviousDay = function() {
    activeDateObj.setDate(activeDateObj.getDate() - 1);
    runRealTimeEngine();
    renderTimeline();
}

window.goToToday = function() {
    activeDateObj = new Date();
    runRealTimeEngine();
    renderTimeline();
}

window.debugAdvanceDay = function() {
    activeDateObj.setDate(activeDateObj.getDate() + 1);
    runRealTimeEngine();
    renderTimeline();
}

window.toggleFilterDelayed = function() {
    showOnlyDelayed = !showOnlyDelayed;
    const btn = document.getElementById('filter-delayed-btn');
    if (showOnlyDelayed) {
        btn.classList.replace('bg-indigo-50', 'bg-indigo-100');
    } else {
        btn.classList.replace('bg-indigo-100', 'bg-indigo-50');
    }
    renderTimeline();
}

function runRealTimeEngine() {
    const now = new Date();
    currentRealMins = (now.getHours() * 60) + now.getMinutes();
    
    const isToday = getActiveDateStr() === getTodayStr();
    const diffDays = Math.round((activeDateObj - now) / (1000 * 60 * 60 * 24));
    
    // Atualiza Textos do Cabeçalho
    document.getElementById('header-title').innerText = diffDays === 0 ? "Hoje" : (diffDays === 1 ? "Amanhã" : "Agenda");
    
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    document.getElementById('header-date').innerHTML = 
        (isToday ? `<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ` : `<i class="ph ph-calendar text-zinc-400"></i> `) + 
        activeDateObj.toLocaleDateString('pt-BR', options);

    const nowLine = document.getElementById('now-line');
    if (isToday && currentRealMins >= START_HOUR * 60 && currentRealMins <= END_HOUR * 60) {
        const topPx = (currentRealMins - (START_HOUR * 60)) * PX_PER_MIN;
        nowLine.style.top = `${topPx}px`;
        nowLine.style.display = 'flex';
        document.getElementById('now-badge').innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    } else {
        nowLine.style.display = 'none';
    }

    // Automagicamente marca como concluído quem ficou pra trás
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

setInterval(runRealTimeEngine, 60000); // 1 tick por minuto

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
        // Foco contínuo para digitação rápida tipo "metralhadora"
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

// Pinta e repinta a grade baseado nas configurações do usuário
function renderGrid() {
    document.getElementById('timeline-container').style.height = `${TOTAL_MINS * PX_PER_MIN}px`;
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
    
    // Filtra os blocos referentes ao dia que estamos visualizando
    let dailyDb = db.filter(b => b.date === getActiveDateStr());
    
    if (showOnlyDelayed) {
        dailyDb = dailyDb.filter(b => b.type === 'past' || b.wasDelayed);
    }

    // Remove tarefas que estejam totalmente fora da janela de visualização do usuário
    dailyDb = dailyDb.filter(b => b.startMin < END_HOUR * 60 && (b.startMin + b.duration) > START_HOUR * 60);
    
    dailyDb.sort((a, b) => a.startMin - b.startMin);
    
    let cursorMin = START_HOUR * 60;
    let occupied = 0;
    let renderQueue = [];
    
    dailyDb.forEach(fb => {
        if (fb.startMin > cursorMin) {
            renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: fb.startMin - cursorMin });
        }
        renderQueue.push(fb);
        cursorMin = Math.max(cursorMin, fb.startMin + fb.duration);
        if(fb.type !== 'empty' && fb.type !== 'past') occupied += fb.duration; 
    });
    
    const endOfDay = END_HOUR * 60;
    if (cursorMin < endOfDay) {
        renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: endOfDay - cursorMin });
    }
    
    const pct = Math.round((occupied / TOTAL_MINS) * 100) || 0;
    document.getElementById('progress-bar').style.width = `${pct}%`;
    document.getElementById('progress-text').innerText = `Planejado (${pct}%)`;

    renderQueue.forEach(block => drawBlock(block));
}

function drawBlock(block) {
    const topPx = (block.startMin - (START_HOUR * 60)) * PX_PER_MIN;
    const heightPx = (block.duration * PX_PER_MIN) - 2; 

    const el = document.createElement('div');
    el.className = 'absolute left-1 right-1 rounded-2xl overflow-hidden transition-all duration-300 z-10 flex flex-col';
    el.style.top = `${topPx + 1}px`;
    el.style.height = `${heightPx}px`;

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

        // 1. Definição do Fundo e Cores da Tag
        let bgClass = block.completed ? 'bg-emerald-100 border-emerald-200' : (isRest ? 'bg-emerald-50 border-emerald-300' : 'bg-app-focus border-indigo-400 shadow-md');
        if (isPast && !block.completed) {
            bgClass = isRest ? 'bg-zinc-50 border-zinc-200 opacity-80 saturate-50' : 'bg-indigo-50 border-indigo-200 opacity-80 saturate-50';
        } else if (isPast && block.completed) {
            bgClass = 'bg-emerald-50 border-emerald-200 opacity-80 saturate-50';
        }
        const tagColor = getTagColor(block.tagId);
        let borderStyle = tagColor && !block.completed ? `border-left-width: 4px; border-left-color: ${tagColor};` : '';

        // 2. Mágica da Sanfona e Microblocos
        const isMicro = !block.expanded && block.duration <= 25;
        if (block.expanded) {
            el.className += ` ${bgClass} shadow-2xl border px-3 pt-2 pb-6 group select-none transition-all duration-300`;
            el.style.height = 'auto'; el.style.minHeight = `${heightPx}px`; el.style.zIndex = '35'; 
        } else {
            el.className += ` ${bgClass} border px-3 ${isMicro ? 'pt-1.5 pb-1.5' : 'pt-2 pb-4'} group select-none transition-all duration-300`;
        }
        if (borderStyle) el.style.cssText += borderStyle;

        // 3. Tema de Cores (Escuro para Foco, Claro para o resto)
        const isDarkTheme = !isPast && !block.completed && !isRest;

        const timeColor = isDarkTheme ? 'text-indigo-200' : 'text-zinc-500';
        const titleClass = `${block.completed ? 'line-through opacity-60 text-emerald-900' : (isDarkTheme ? 'text-white' : (isRest ? 'text-emerald-900' : 'text-zinc-800'))}`;
        const iconColor = isDarkTheme ? 'text-indigo-200 hover:text-white' : 'text-zinc-400 hover:text-zinc-700';
        const checkColor = isDarkTheme ? 'text-indigo-200 hover:text-white' : (block.completed ? 'text-emerald-600 hover:text-emerald-700' : 'text-zinc-400 hover:text-emerald-600');
        const btnBg = isDarkTheme ? 'bg-black/20 hover:bg-black/30' : 'bg-black/5 hover:bg-black/10';
        const glowCircle = isDarkTheme ? 'bg-white/10' : 'bg-white/60';

        // 4. MICROBLOCOS RENDER
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
                    <input type="text" id="micro-input-${block.id}" placeholder="+ adicionar microbloco" class="microblock-input w-full rounded-md px-2 py-1.5 text-[10px] font-medium outline-none transition-colors border ${mbInputClasses}" onkeypress="if(event.key==='Enter') addMicroblock('${block.id}', this, event)">
                </div>
            </div>
        `;

        const showInfoIcon = isPast || block.wasDelayed;
        const pastIconHtml = showInfoIcon ? `<div class="pointer-events-auto w-3.5 h-3.5 rounded-full ${isDarkTheme ? 'bg-indigo-500/20 border-indigo-400/30 text-indigo-300' : 'bg-black/10 border-black/10 text-zinc-500'} flex items-center justify-center shrink-0 border mr-1.5" title="Tempo Esgotado / Realocado"><i class="ph-bold ph-info text-[8px]"></i></div>` : '';

        el.innerHTML = `
            <div class="absolute top-0 right-0 w-32 h-32 ${glowCircle} rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div class="flex justify-between items-start z-30 relative pointer-events-none">
                <div class="flex flex-1 min-w-0 pr-2 gap-2">
                    <div class="drag-handle w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition pointer-events-auto shrink-0 mt-0.5" title="Arrastar (Mover)">
                        <i class="ph ph-dots-six-vertical"></i>
                    </div>
                    <div class="flex flex-col flex-1 min-w-0">
                        <span class="time-label ${isMicro ? 'hidden' : 'block'} text-[10px] font-bold tracking-widest ${timeColor} uppercase opacity-90 truncate">${formatClock(block.startMin)} - ${formatClock(block.startMin + block.duration)} &bull; ${formatDur(block.duration)}</span>
                        <div class="title-wrapper flex items-center ${isMicro ? 'mt-0' : 'mt-0.5'} min-w-0 pointer-events-none">
                            ${pastIconHtml}
                            <h3 class="block-title ${isMicro ? 'text-[13px] mt-0' : 'text-[14px]'} font-bold leading-tight truncate ${titleClass}">${block.title}</h3>
                            <span class="micro-time ${isMicro ? 'block' : 'hidden'} text-[11px] font-bold ${timeColor} ml-1 shrink-0">&bull; <span class="micro-time-val">${formatDur(block.duration)}</span></span>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-1.5 shrink-0 relative z-30 pointer-events-auto">
                    <!-- BOTÃO DE EXPANDIR -->
                    <button onclick="toggleExpandBlock('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition" title="Expandir/Recolher">
                        <i class="ph ${block.expanded ? 'ph-caret-up' : 'ph-caret-down'}"></i>
                    </button>
                    <button onclick="toggleBlockCompletion('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${checkColor} rounded transition" title="Concluir">
                        <i class="${block.completed ? 'ph-fill ph-check-circle' : 'ph ph-check'}"></i>
                    </button>
                    <!-- BOTÃO DE DUPLICAR (SOME NO MICRO) -->
                    <button onclick="duplicateTask('${block.id}', event)" class="${isMicro ? 'hidden' : 'flex'} w-6 h-6 items-center justify-center ${btnBg} ${iconColor} hover:text-white rounded transition" title="Duplicar">
                        <i class="ph ph-copy"></i>
                    </button>
                    <!-- BOTÃO DE APAGAR (SOME NO MICRO) -->
                    <button onclick="killTask('${block.id}', event)" class="${isMicro ? 'hidden' : 'flex'} w-6 h-6 items-center justify-center ${btnBg} hover:bg-red-500/80 ${iconColor} hover:text-white rounded transition" title="Apagar">
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
    // Snap to Now no dia atual
    if (getActiveDateStr() === getTodayStr() && currentRealMins >= gapStart && currentRealMins <= gapStart + gapDuration) {
        if (currentRealMins + pendingIntent.duration <= gapStart + gapDuration) {
            start = Math.round(currentRealMins / 5) * 5; 
            start = Math.max(gapStart, Math.min(start, gapStart + gapDuration - pendingIntent.duration));
        }
    }
    
    // Garante que o início sempre seja múltiplo de 5 (hora cheia ou +5)
    start = Math.round(start / 5) * 5;
    
    db.push({ 
        id: 'f_' + Date.now(), 
        type: 'focus', 
        title: pendingIntent.title, 
        startMin: start, 
        duration: pendingIntent.duration,
        date: getActiveDateStr(),
        microblocks: [],
        completed: false,
        theme: pendingIntent.theme || 'focus',
        tagId: pendingIntent.tagId || null
    });
    saveDb();
    cancelPendingTask(); 
}

// --- FUNÇÕES AUXILIARES DE DATA ---
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

// --- NOVA LÓGICA DE CLONAGEM ---
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
    pendingIntent = { title: taskToClone.title, duration: taskToClone.duration, theme: taskToClone.theme || 'focus' };
    selectedDur = taskToClone.duration;
    document.getElementById('floating-title').innerText = taskToClone.title;
    syncDurButtons(selectedDur);
    document.getElementById('floating-task').classList.remove('hidden');
    document.getElementById('floating-task').classList.add('flex');
    closeAllSheets();
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

    document.getElementById('clone-sheet').classList.add('translate-y-full'); // Esconde a aba de baixo
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => { input.focus(); input.select(); }, 100);
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

        db.push({...taskToClone, id: 'f_' + Date.now() + '_' + Math.random(), date: nextDate, microblocks: (taskToClone.microblocks || []).map(mb => ({...mb, id: 'mb_' + Date.now() + Math.random(), done: false})), completed: false, expanded: false});
    }
    saveDb();
    closeAllSheets();
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
    if(b) {
        b.expanded = !b.expanded;
        renderTimeline();
    }
}

// --- 6. A FÍSICA MALEÁVEL ---
function enablePhysics(el, block) {
    const dragger = el.querySelector('.drag-handle');
    const resizer = el.querySelector('.resize-handle');
    
    let startY = 0, initialVal = 0, maxVal = 0;

    function onDragStart(e) {
        e.preventDefault(); e.stopPropagation();
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
        newStart = Math.round(newStart / 5) * 5; // Força múltiplo de 5
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
            
            // Checa colisão apenas no dia ativo
            const dailyDb = db.filter(b => b.date === getActiveDateStr());
            const hasCollision = dailyDb.some(fb => {
                if (fb.id === block.id) return false;
                return (newStart < fb.startMin + fb.duration && newStart + block.duration > fb.startMin);
            });

            if (hasCollision) {
                showToast("Conflito! A tarefa voltou.");
            } else {
                block.startMin = newStart;
                
                // Se moveu para o futuro, tira o status de past mas marca como delayed
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
    }

    function onResizeStart(e) {
        e.preventDefault(); e.stopPropagation();
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        initialVal = block.duration;
        
        const dailyDb = db.filter(b => b.date === getActiveDateStr()).sort((a, b) => a.startMin - b.startMin);
        const nextBlock = dailyDb.find(b => b.startMin >= block.startMin + block.duration && b.id !== block.id);
        maxVal = nextBlock ? (nextBlock.startMin - block.startMin) : ((END_HOUR * 60) - block.startMin);
        maxVal = Math.floor(maxVal / 5) * 5; // Garante que o limite máximo também obedeça os 5 minutos
        
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
        newDur = Math.round(newDur / 5) * 5; // Força múltiplo de 5
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
        block.expanded = false; // Garante recolhimento ao soltar
        saveDb();
        renderTimeline(); 
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
        if(parseInt(b.dataset.time) === mins) b.className = 'sheet-dur-btn px-4 py-2 rounded-full bg-app-focus border border-app-focus text-white text-sm font-medium whitespace-nowrap shadow-[0_0_15px_rgba(79,70,229,0.3)] transition';
    });
    document.querySelectorAll('.float-dur-btn').forEach(b => {
        b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-zinc-100 text-zinc-500 hover:bg-zinc-200 text-xs font-bold transition';
        if(parseInt(b.dataset.time) === mins) b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-app-focus text-white text-xs font-bold shadow-[0_0_10px_rgba(79,70,229,0.4)] transition';
    });
}

function syncBacklogDurButtons(mins) {
    document.querySelectorAll('.backlog-dur-btn').forEach(b => {
        b.className = 'backlog-dur-btn px-4 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm whitespace-nowrap hover:bg-zinc-100 transition';
        if(parseInt(b.dataset.time) === mins) b.className = 'backlog-dur-btn px-4 py-2 rounded-full bg-zinc-900 border border-zinc-900 text-white text-sm font-medium whitespace-nowrap shadow-md transition';
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
    // Fecha as outras abas, caso estejam abertas
    document.getElementById('config-sheet').classList.add('translate-y-full');
    document.getElementById('period-select-sheet').classList.add('translate-y-full');
    
    selectedTagId = null;
    renderTagSelector();

    overlay.classList.remove('opacity-0', 'pointer-events-none');
    sheet.classList.remove('translate-y-full');
    fab.style.transform = 'scale(0)';
    if(listBtn) listBtn.style.transform = 'scale(0)';
    setTimeout(() => input.focus(), 300);
}

window.openListSheet = () => {
    renderBacklog();
    overlay.classList.remove('opacity-0', 'pointer-events-none');
    listSheet.classList.remove('translate-y-full');
    fab.style.transform = 'scale(0)';
    if(listBtn) listBtn.style.transform = 'scale(0)';
    setTimeout(() => backlogInput.focus(), 300);
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
    input.blur();
    backlogInput.blur();
    if(!pendingIntent) {
        fab.style.transform = 'scale(1)';
        if(listBtn) listBtn.style.transform = 'scale(1)';
    }
}

// Mantido para compatibilidade com partes antigas caso existam
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

window.openConfigSheet = () => {
    sheet.classList.add('translate-y-full'); 
    
    // Reseta para o menu principal de configurações
    document.getElementById('config-periods-view').classList.add('hidden');
    document.getElementById('config-hours-view').classList.add('hidden');
    document.getElementById('config-main-menu').classList.remove('hidden');
    document.getElementById('config-title').innerText = 'Configurações';
    document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()');
    
    document.getElementById('config-sheet').classList.remove('translate-y-full');
}

// JANELA DE HORÁRIO GERAL
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

// GERENCIAR PERÍODOS DE TEMPO (Manhã, Tarde, etc.)
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
    if (endMins <= startMins) endMins += 24 * 60; // Vira o dia
    
    const title = input.value.trim() || period.name;
    
    // Verifica colisão antes de empurrar pro banco
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
        theme: 'focus'
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

    // Remove da lista para ir pro calendário
    backlogDb = backlogDb.filter(i => i.id !== id);
    saveBacklog();

    pendingIntent = { title: item.title, duration: item.duration, theme: 'focus' };
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
    
    // Atualiza o Botão Flutuante e Cabeçalho da Lista
    const totalMins = backlogDb.reduce((acc, item) => acc + item.duration, 0);
    const listStats = document.getElementById('list-btn-stats');
    const listCount = document.getElementById('list-btn-count');
    const listTime = document.getElementById('list-btn-time');
    const backlogTotalTime = document.getElementById('backlog-total-time');
    
    if (backlogDb.length > 0) {
        listStats.classList.remove('hidden');
        listStats.classList.add('flex');
        listCount.innerText = backlogDb.length + (backlogDb.length === 1 ? ' item' : ' itens');
        listTime.innerText = formatDur(totalMins);
        
        backlogTotalTime.innerText = formatDur(totalMins);
        backlogTotalTime.classList.remove('hidden');
    } else {
        listStats.classList.add('hidden');
        listStats.classList.remove('flex');
        
        backlogTotalTime.classList.add('hidden');
    }
    
    if (backlogDb.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center opacity-50 py-8">
                <i class="ph ph-inbox text-4xl mb-2"></i>
                <p class="text-sm font-medium">Lista vazia!</p>
                <p class="text-xs">Programe suas tarefas aqui.</p>
            </div>`;
        return;
    }

    container.innerHTML = backlogDb.map(item => `
        <div class="flex justify-between items-center bg-white border border-zinc-200 p-3.5 rounded-xl mb-3 shadow-sm hover:shadow transition-shadow group">
            <div class="flex flex-col min-w-0 pr-3 flex-1">
                <span class="text-sm font-bold text-zinc-800 truncate mb-0.5">${item.title}</span>
                <span class="text-[11px] font-bold text-zinc-500 flex items-center gap-1"><i class="ph ph-clock"></i> ${formatDur(item.duration)}</span>
            </div>
            <div class="flex gap-2 shrink-0">
                <button onclick="scheduleBacklogItem('${item.id}')" class="w-10 h-10 flex items-center justify-center bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-500 hover:text-white transition-colors" title="Segurar e Agendar">
                    <i class="ph ph-hand-grabbing text-lg"></i>
                </button>
                <button onclick="deleteBacklogItem('${item.id}')" class="w-10 h-10 flex items-center justify-center bg-red-50 border border-red-100 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-colors" title="Apagar">
                    <i class="ph ph-trash text-lg"></i>
                </button>
            </div>
        </div>
    `).join('');
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

// --- INICIALIZAÇÃO ---
renderGrid(); // Renderiza o visual da linha do tempo baseado nas configurações
runRealTimeEngine();
renderTimeline();
renderBacklog();
renderTagSelector();

// Pula pro momento atual
setTimeout(() => {
    const scrollEl = document.getElementById('timeline-scroll');
    const targetY = (currentRealMins - (START_HOUR * 60)) * PX_PER_MIN - (scrollEl.clientHeight / 2);
    scrollEl.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
}, 300);

// Detecta instalação e mostra prompt
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  // Cria banner de instalação (opcional)
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
  
  // Remove banner após 10 segundos se não clicar
  setTimeout(() => installBanner.remove(), 10000);
});

// --- REGISTRO DO SERVICE WORKER (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('Service Worker registrado com sucesso:', registration.scope);
      })
      .catch(error => {
        console.log('Falha ao registrar o Service Worker:', error);
      });
  });
}