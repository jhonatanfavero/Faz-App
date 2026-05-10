// --- 1. CONFIGURAÇÕES & FÍSICA ---
const PX_PER_MIN = 2.5; 
let START_HOUR = parseInt(localStorage.getItem('tb_start_hour') || '0'); 
let END_HOUR = parseInt(localStorage.getItem('tb_end_hour') || '24');      
let TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

let currentRealMins = 0;
let pendingIntent = null; 
let selectedDur = 30;
let showOnlyDelayed = false; let showOnlyCompleted = false; let showOnlyTag = null; let hidePastTime = false;
let taskToClone = null; let pendingCloneType = ''; let selectedTagId = null; let headerHidden = false;

// Roda Tema
function loadAppTheme() {
    const neon = localStorage.getItem('tb_neon_color') || '#00d2ff';
    document.documentElement.style.setProperty('--app-neon', neon);
    const isDark = localStorage.getItem('tb_dark_mode') === 'true';
    if(isDark) document.body.classList.add('dark-mode-body');
    else document.body.classList.remove('dark-mode-body');
}
loadAppTheme();

// Popula Options
const startSelect = document.getElementById('config-hour-start'); const endSelect = document.getElementById('config-hour-end');
for(let i=0; i<24; i++) startSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')}:00</option>`;
for(let i=1; i<=24; i++) endSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')}:00</option>`;

let activeDateObj = new Date();
function getActiveDateStr() { return activeDateObj.toLocaleDateString('en-CA'); } 
function getTodayStr() { return new Date().toLocaleDateString('en-CA'); }

// --- 2. BANCO DE DADOS & LOGS ---
let db = JSON.parse(localStorage.getItem('tb_master_db')) || [];
let backlogDb = JSON.parse(localStorage.getItem('tb_backlog_db')) || [];
let routinesDb = JSON.parse(localStorage.getItem('tb_routines_db')) || [];
let backlogSelectedDur = 30;
let actionsLog = JSON.parse(localStorage.getItem('tb_actions_log')) || [];

function logAction(action, taskName) {
    actionsLog.unshift({ time: new Date().toISOString(), action, taskName });
    if(actionsLog.length > 50) actionsLog.pop();
    localStorage.setItem('tb_actions_log', JSON.stringify(actionsLog));
}

let periodsDb = JSON.parse(localStorage.getItem('tb_periods_db')) || [{ id: 'p1', name: 'Manhã', start: '08:00', end: '12:00' }, { id: 'p2', name: 'Tarde', start: '13:00', end: '18:00' }];
let tagsDb = JSON.parse(localStorage.getItem('tb_tags_db')) || [{ id: 'tag_1', name: 'Trabalho', color: '#ef4444' }, { id: 'tag_2', name: 'Pessoal', color: '#10b981' }];

function saveDb() { localStorage.setItem('tb_master_db', JSON.stringify(db)); }
function saveBacklog() { localStorage.setItem('tb_backlog_db', JSON.stringify(backlogDb)); }
function saveRoutines() { localStorage.setItem('tb_routines_db', JSON.stringify(routinesDb)); }
function savePeriods() { localStorage.setItem('tb_periods_db', JSON.stringify(periodsDb)); }
function saveTags() { localStorage.setItem('tb_tags_db', JSON.stringify(tagsDb)); }

// --- 3. TAGS & FILTROS ---
window.addTag = function(name, color) { tagsDb.push({ id: 'tag_' + Date.now(), name: name.trim(), color: color }); saveTags(); }
window.deleteTag = function(id) { tagsDb = tagsDb.filter(t => t.id !== id); saveTags(); db.forEach(b => { if(b.tagId === id) b.tagId = null; }); saveDb(); renderTimeline(); renderTagsList(); }
window.getTagColor = function(tagId) { const tag = tagsDb.find(t => t.id === tagId); return tag ? tag.color : null; }
let selectedNewTagColor = '#ef4444'; 

window.openTagsSheet = () => { closeAllSheets(); renderTagsList(); document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('tags-sheet').classList.remove('translate-y-full'); }
window.selectTagColor = (btn) => { document.querySelectorAll('.tag-color-btn').forEach(b => { b.classList.remove('scale-110', 'shadow-sm', 'border-zinc-900'); b.classList.add('border-transparent'); }); btn.classList.remove('border-transparent'); btn.classList.add('scale-110', 'shadow-sm', 'border-zinc-900'); selectedNewTagColor = btn.dataset.color; }
window.commitNewTag = () => { const input = document.getElementById('new-tag-name'); const name = input.value.trim(); if(!name) return showToast("Digite um nome para a Tag."); addTag(name, selectedNewTagColor); input.value = ''; renderTagsList(); document.getElementById('new-tag-form').style.display='none'; document.getElementById('btn-show-add-tag').style.display='flex'; showToast("Tag Criada!"); }

function renderTagsList() {
    const container = document.getElementById('tags-list-container');
    if(tagsDb.length === 0) { container.innerHTML = `<p class="text-center text-zinc-400 text-sm mt-4">Nenhuma tag criada.</p>`; return; }
    container.innerHTML = tagsDb.map(t => `
        <div class="flex items-center justify-between p-3 bg-zinc-50 border ${showOnlyTag === t.id ? 'border-app-focus ring-2 ring-app-focus' : 'border-zinc-200'} rounded-xl cursor-pointer hover:opacity-80 transition" onclick="filterByTag('${t.id}')">
            <div class="flex items-center gap-3"><div class="w-4 h-4 rounded-full" style="background-color: ${t.color};"></div><span class="font-bold text-sm text-zinc-800">${t.name}</span></div>
            <button onclick="event.stopPropagation(); deleteTag('${t.id}')" class="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-red-500 rounded-lg transition"><i class="ph ph-trash text-lg"></i></button>
        </div>`).join('');
}
window.selectTag = function(id) { selectedTagId = selectedTagId === id ? null : id; renderTagSelector(); }
function renderTagSelector() {
    const container = document.getElementById('tag-selector-container'); if(!container) return;
    let html = `<button onclick="selectTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${selectedTagId === null ? 'bg-zinc-900 text-white shadow-md border-transparent' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}">Sem Tag</button>`;
    tagsDb.forEach(t => {
        const isActive = selectedTagId === t.id; const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100';
        html += `<button onclick="selectTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40; outline-color: ${t.color}"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>${t.name}</button>`;
    }); container.innerHTML = html;
}
window.filterByTag = function(tagId) { if (showOnlyTag === tagId) showOnlyTag = null; else { showOnlyTag = tagId; showOnlyDelayed = false; showOnlyCompleted = false; } closeAllSheets(); renderTimeline(); showToast(showOnlyTag ? "Agenda Filtrada!" : "Filtro Removido"); }

// --- 4. MOTOR DA AGENDA ---
window.debugPreviousDay = function() { activeDateObj.setDate(activeDateObj.getDate() - 1); runRealTimeEngine(); renderTimeline(); }
window.goToToday = function() { activeDateObj = new Date(); runRealTimeEngine(); renderTimeline(); }
window.debugAdvanceDay = function() { activeDateObj.setDate(activeDateObj.getDate() + 1); runRealTimeEngine(); renderTimeline(); }
window.toggleHidePast = function() { hidePastTime = !hidePastTime; const btn = document.getElementById('hide-past-btn'); if(hidePastTime){ btn.classList.replace('bg-zinc-50','bg-app-focus/10'); btn.classList.replace('border-zinc-200','border-app-focus/30'); btn.querySelector('i').classList.replace('text-zinc-500','text-app-focus'); } else { btn.classList.replace('bg-app-focus/10','bg-zinc-50'); btn.classList.replace('border-app-focus/30','border-zinc-200'); btn.querySelector('i').classList.replace('text-app-focus','text-zinc-500'); } renderTimeline(); showToast(hidePastTime ? "Passado ocultado" : "Dia completo"); }
window.toggleFilterDelayed = function() { showOnlyDelayed = !showOnlyDelayed; showOnlyCompleted = false; showOnlyTag = null; const btn = document.getElementById('filter-delayed-btn'), btnC = document.getElementById('filter-completed-btn'); if(showOnlyDelayed) { btn.classList.replace('bg-indigo-50','bg-indigo-100'); btnC.classList.replace('bg-emerald-100','bg-emerald-50'); } else btn.classList.replace('bg-indigo-100','bg-indigo-50'); renderTimeline(); }
window.toggleFilterCompleted = function() { showOnlyCompleted = !showOnlyCompleted; showOnlyDelayed = false; showOnlyTag = null; const btnC = document.getElementById('filter-completed-btn'), btn = document.getElementById('filter-delayed-btn'); if(showOnlyCompleted) { btnC.classList.replace('bg-emerald-50','bg-emerald-100'); btn.classList.replace('bg-indigo-100','bg-indigo-50'); } else btnC.classList.replace('bg-emerald-100','bg-emerald-50'); renderTimeline(); }

function runRealTimeEngine() {
    const now = new Date(); currentRealMins = (now.getHours() * 60) + now.getMinutes(); const isToday = getActiveDateStr() === getTodayStr();
    let dateStr = activeDateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    document.getElementById('header-date').innerHTML = (isToday ? `<span class="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-pulse shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span> ` : `<i class="ph ph-calendar text-zinc-400 text-xl"></i> `) + `<span class="font-black">${dateStr}</span>`;

    const nowLine = document.getElementById('now-line');
    if ((isToday && currentRealMins >= START_HOUR * 60 && currentRealMins <= END_HOUR * 60) && !showOnlyDelayed && !showOnlyCompleted && !showOnlyTag) {
        nowLine.style.top = `${(currentRealMins - (START_HOUR * 60)) * PX_PER_MIN}px`; nowLine.style.display = 'flex';
        document.getElementById('now-badge').innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    } else nowLine.style.display = 'none';

    let mod = false;
    db.forEach(b => { if (b.type === 'focus') { const isPastDay = b.date < getTodayStr(); const isPastTimeToday = b.date === getTodayStr() && (b.startMin + b.duration) <= currentRealMins; if (isPastDay || isPastTimeToday) { b.type = 'past'; mod = true; } } });
    if (mod) { saveDb(); renderTimeline(); }
}
setInterval(runRealTimeEngine, 60000); 

window.toggleBlockCompletion = function(id, e) { e.stopPropagation(); let b = db.find(x => x.id === id); if(b) { b.completed = !b.completed; logAction(b.completed ? 'Concluiu' : 'Desmarcou', b.title); saveDb(); renderTimeline(); } }
window.toggleMicroblock = function(blockId, mbId, e) { let b = db.find(x => x.id === blockId); if(b && b.microblocks) { let mb = b.microblocks.find(x => x.id === mbId); if(mb) mb.done = !mb.done; saveDb(); renderTimeline(); } }

function renderGrid() {
    document.getElementById('timeline-container').style.height = `${TOTAL_MINS * PX_PER_MIN}px`;
    const yAxis = document.getElementById('y-axis'), gridLines = document.getElementById('grid-lines'); yAxis.innerHTML = ''; gridLines.innerHTML = '';
    for (let i = START_HOUR; i <= END_HOUR; i++) {
        const topPx = (i - START_HOUR) * 60 * PX_PER_MIN;
        yAxis.innerHTML += `<div class="absolute text-[10px] text-zinc-400 font-medium w-10 text-right left-0 -translate-y-1/2" style="top: ${topPx}px">${i.toString().padStart(2, '0')}:00</div>`;
        gridLines.innerHTML += `<div class="absolute w-[calc(100%+40px)] -left-14 border-t border-black/[0.05] dark:border-white/[0.05]" style="top: ${topPx}px"></div>`;
    }
}
function formatClock(m) { return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`; }
function formatDur(m) { const h = Math.floor(m/60), min = m%60; return h > 0 && min > 0 ? `${h}h ${min}m` : (h > 0 ? `${h}h` : `${min}m`); }
function showToast(msg) { const t = document.getElementById('toast'); document.getElementById('toast-msg').innerText = msg; t.classList.remove('opacity-0'); setTimeout(() => t.classList.add('opacity-0'), 2500); }

// Combo G: Fechar cartões ao clicar no fundo
const retractHandler = (e) => {
    if(!e.target.closest('.block-item') && !e.target.closest('[id$="-sheet"]') && !e.target.closest('[id$="-modal"]') && !e.target.closest('header')) {
        let changed = false; db.forEach(b => { if(b.expanded) { b.expanded = false; changed = true; } });
        if(changed) { saveDb(); renderTimeline(); }
    }
};
document.addEventListener('mousedown', retractHandler);
document.addEventListener('touchstart', retractHandler, {passive: true});

function renderTimeline() {
    const container = document.getElementById('blocks-container'); container.innerHTML = ''; 
    const isListMode = showOnlyDelayed || showOnlyCompleted || showOnlyTag;
    const tlContainer = document.getElementById('timeline-container');
    if (isListMode) tlContainer.classList.add('filter-list-mode'); else tlContainer.classList.remove('filter-list-mode');

    START_HOUR = parseInt(localStorage.getItem('tb_start_hour') || '0'); END_HOUR = parseInt(localStorage.getItem('tb_end_hour') || '24');
    
    if (hidePastTime && getActiveDateStr() === getTodayStr() && !isListMode) { START_HOUR = Math.max(START_HOUR, Math.floor(currentRealMins / 60) - 1); }
    TOTAL_MINS = (END_HOUR - START_HOUR) * 60;

    let dailyDb = db.filter(b => b.date === getActiveDateStr());
    if (showOnlyDelayed) dailyDb = dailyDb.filter(b => b.type === 'past' || b.wasDelayed);
    if (showOnlyCompleted) dailyDb = dailyDb.filter(b => b.completed === true);
    if (showOnlyTag) dailyDb = dailyDb.filter(b => b.tagId === showOnlyTag);

    if (isListMode && dailyDb.length > 0) {
        const minStart = Math.min(...dailyDb.map(b => b.startMin)); const maxEnd = Math.max(...dailyDb.map(b => b.startMin + b.duration));
        START_HOUR = Math.max(0, Math.floor(minStart / 60) - 1); END_HOUR = Math.min(24, Math.ceil(maxEnd / 60) + 1); TOTAL_MINS = (END_HOUR - START_HOUR) * 60;
    }

    renderGrid(); 
    dailyDb = dailyDb.filter(b => b.startMin < END_HOUR * 60 && (b.startMin + b.duration) > START_HOUR * 60).sort((a, b) => a.startMin - b.startMin);
    
    let cursorMin = START_HOUR * 60; let occupied = 0; let renderQueue = [];
    dailyDb.forEach(fb => {
        if (fb.startMin > cursorMin && !isListMode) renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: fb.startMin - cursorMin });
        renderQueue.push(fb); cursorMin = Math.max(cursorMin, fb.startMin + fb.duration);
        if(fb.type !== 'empty' && fb.type !== 'past') occupied += fb.duration; 
    });
    if (cursorMin < END_HOUR * 60 && !isListMode) renderQueue.push({ id: `e_${cursorMin}`, type: 'empty', startMin: cursorMin, duration: END_HOUR * 60 - cursorMin });
    
    const pct = Math.round((occupied / TOTAL_MINS) * 100) || 0;
    document.getElementById('progress-bar').style.width = `${pct}%`; document.getElementById('progress-text').innerText = `Planejado (${pct}%)`;

    renderQueue.forEach(block => drawBlock(block));
}

function drawBlock(block) {
    const topPx = (block.startMin - (START_HOUR * 60)) * PX_PER_MIN; const heightPx = (block.duration * PX_PER_MIN) - 2; 
    const el = document.createElement('div'); el.className = 'absolute left-1 right-1 rounded-2xl overflow-hidden transition-all duration-300 z-10 flex flex-col block-item';
    if (!showOnlyDelayed && !showOnlyCompleted && !showOnlyTag) { el.style.top = `${topPx + 1}px`; el.style.height = `${heightPx}px`; }

    const isSmall = block.duration <= 30;
    if (block.type === 'empty') {
        el.className += ' bg-hatched border border-dashed items-center justify-center text-center';
        if (pendingIntent) {
            if (block.duration >= pendingIntent.duration) {
                el.classList.add('border-black/20', 'animate-pulse-drop', 'cursor-pointer', 'z-30');
                el.onclick = () => performEncaixeMatematico(block.startMin, block.duration);
                el.innerHTML = `<i class="ph ph-hand-pointing text-2xl text-app-focus drop-shadow-md mb-1"></i> ${!isSmall ? `<span class="text-[10px] font-bold text-app-focus uppercase tracking-widest">Soltar Aqui</span>` : ''}`;
            } else {
                el.classList.add('border-red-500/20', 'opacity-50'); el.innerHTML = `<span class="text-[9px] text-red-500 font-bold uppercase">Muito Curto</span>`;
            }
        } else {
            el.classList.add('border-black/10', 'dark:border-white/10', 'opacity-60');
            el.innerHTML = `${!isSmall ? `<span class="text-sm font-semibold tracking-wide mb-1 text-zinc-500">Tempo Livre</span>` : ''}<span class="text-[10px] bg-black/5 dark:bg-white/5 text-zinc-600 px-2 py-1 rounded font-medium">${formatDur(block.duration)} livres</span>`;
            el.onclick = () => { if(!pendingIntent){ selectedDur = 30; syncDurButtons(30); openSheet(); } };
        }
    }
    else {
        const isPast = block.type === 'past'; const isRest = block.theme === 'rest';
        let bgClass = block.completed ? 'bg-emerald-100 border-emerald-200' : (isRest ? 'bg-emerald-50 border-emerald-300' : 'bg-[var(--app-card)] border-indigo-400 shadow-md');
        if (isPast && !block.completed) bgClass = isRest ? 'bg-zinc-100 dark:bg-white/5 border-zinc-200 opacity-80 saturate-50' : 'bg-indigo-50 border-indigo-200 opacity-80 saturate-50';
        else if (isPast && block.completed) bgClass = 'bg-emerald-50 border-emerald-200 opacity-80 saturate-50';
        
        const tagColor = getTagColor(block.tagId); let borderStyle = tagColor && !block.completed ? `border-left-width: 4px; border-left-color: ${tagColor};` : '';
        const isMicro = !block.expanded && block.duration <= 25;
        if (block.expanded) { el.className += ` ${bgClass} shadow-2xl border px-3 pt-2 pb-6 group select-none transition-all duration-300`; el.style.height = 'auto'; el.style.minHeight = `${heightPx}px`; el.style.zIndex = '35'; } 
        else { el.className += ` ${bgClass} border px-3 ${isMicro ? 'pt-1.5 pb-1.5' : 'pt-2 pb-4'} group select-none transition-all duration-300`; }
        if (borderStyle) el.style.cssText += borderStyle;

        const timeColor = 'text-zinc-500';
        const titleClass = `${block.completed ? 'line-through opacity-60 text-emerald-900' : 'font-bold'}`;
        const iconColor = 'text-zinc-400 hover:text-zinc-700';
        const checkColor = block.completed ? 'text-emerald-600 hover:text-emerald-700' : 'text-zinc-400 hover:text-emerald-600';
        const btnBg = 'bg-black/5 hover:bg-black/10';

        let microHtml = (block.microblocks || []).map(mb => `
            <div class="flex items-start gap-1.5 mb-1.5 z-20 relative group/mb pointer-events-auto">
                <button onclick="toggleMicroblock('${block.id}', '${mb.id}', event)" class="mt-[3px] shrink-0 w-3.5 h-3.5 rounded-[4px] border ${mb.done ? 'bg-emerald-500 border-emerald-500' : 'border-black/20 dark:border-white/30'} flex items-center justify-center transition-colors">${mb.done ? `<i class="ph-bold ph-check text-[10px] text-white"></i>` : ''}</button>
                <span class="text-[11px] font-medium leading-tight flex-1 pt-[1px] ${mb.done ? 'opacity-50 line-through' : ''}">${mb.title}</span>
            </div>`).join('');

        let microblocksSection = `<div class="flex-1 overflow-y-auto no-scrollbar mt-2 mb-2 z-20 relative pointer-events-auto ${!block.expanded && block.duration <= 25 ? 'hidden' : ''}">${microHtml}</div>`;
        const pastIconHtml = (isPast || block.wasDelayed) ? `<div class="pointer-events-auto w-3.5 h-3.5 rounded-full bg-black/10 text-zinc-500 flex items-center justify-center shrink-0 border mr-1.5" title="Tempo Esgotado/Realocado"><i class="ph-bold ph-info text-[8px]"></i></div>` : '';

        el.innerHTML = `
            <div class="flex justify-between items-start z-30 relative pointer-events-none">
                <div class="flex flex-1 min-w-0 pr-2 gap-2">
                    <div class="drag-handle w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition pointer-events-auto shrink-0 mt-0.5"><i class="ph ph-dots-six-vertical"></i></div>
                    <div class="flex flex-col flex-1 min-w-0">
                        <span class="time-label ${isMicro ? 'hidden' : 'block'} text-[10px] font-bold tracking-widest ${timeColor} uppercase opacity-90 truncate pointer-events-auto cursor-pointer hover:underline w-max" onclick="openTimePicker('${block.id}', event)" title="Editar Horário">${formatClock(block.startMin)} - ${formatClock(block.startMin + block.duration)} &bull; ${formatDur(block.duration)}</span>
                        <div class="title-wrapper flex items-center ${isMicro ? 'mt-0' : 'mt-0.5'} min-w-0 pointer-events-none">
                            ${pastIconHtml}
                            <h3 class="block-title ${isMicro ? 'text-[13px] mt-0' : 'text-[14px]'} leading-tight truncate ${titleClass} pointer-events-auto">${block.title}</h3>
                            <span class="micro-time ${isMicro ? 'block' : 'hidden'} text-[11px] font-bold ${timeColor} ml-1 shrink-0 pointer-events-auto cursor-pointer hover:underline" onclick="openTimePicker('${block.id}', event)">&bull; <span class="micro-time-val">${formatDur(block.duration)}</span></span>
                        </div>
                    </div>
                </div>
                <div class="flex gap-1.5 shrink-0 relative z-30 pointer-events-auto">
                    <button onclick="toggleExpandBlock('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${iconColor} rounded transition"><i class="ph ${block.expanded ? 'ph-caret-up' : 'ph-caret-down'}"></i></button>
                    <button onclick="toggleBlockCompletion('${block.id}', event)" class="w-6 h-6 flex items-center justify-center ${btnBg} ${checkColor} rounded transition"><i class="${block.completed ? 'ph-fill ph-check-circle' : 'ph ph-check'}"></i></button>
                    <button onclick="openEditModal('${block.id}', event, 'task')" class="${isMicro ? 'hidden' : 'flex'} w-6 h-6 items-center justify-center ${btnBg} ${iconColor} rounded transition"><i class="ph ph-pencil-simple"></i></button>
                    <button onclick="duplicateTask('${block.id}', event)" class="${isMicro ? 'hidden' : 'flex'} w-6 h-6 items-center justify-center ${btnBg} ${iconColor} rounded transition"><i class="ph ph-copy"></i></button>
                    <button onclick="openDeleteModal('${block.id}', event)" class="${isMicro ? 'hidden' : 'flex'} w-6 h-6 items-center justify-center ${btnBg} hover:bg-red-500/80 hover:text-white rounded transition"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            ${microblocksSection}
            <div class="resize-handle absolute bottom-0 left-12 w-12 h-6 flex items-end justify-start pb-1.5 z-40 pointer-events-auto"><div class="w-8 h-1 bg-black/20 dark:bg-white/40 rounded-full pointer-events-none"></div></div>
        `;
        if(!showOnlyDelayed && !showOnlyCompleted && !showOnlyTag) enablePhysics(el, block);
    }
    document.getElementById('blocks-container').appendChild(el);
}

// --- COMBO F: FÍSICA E AUTO-SCROLL ---
function enablePhysics(el, block) {
    const dragger = el.querySelector('.drag-handle'), resizer = el.querySelector('.resize-handle');
    let startY = 0, initialVal = 0, maxVal = 0, dragScrollInterval = null, lastDragY = 0;
    const scrollEl = document.getElementById('timeline-scroll');

    function startAutoScroll() {
        if (!dragScrollInterval) dragScrollInterval = setInterval(() => { const rect = scrollEl.getBoundingClientRect(); if (lastDragY < rect.top + 80) scrollEl.scrollBy(0, -20); else if (lastDragY > rect.bottom - 80) scrollEl.scrollBy(0, 20); }, 50);
    }
    function stopAutoScroll() { if (dragScrollInterval) { clearInterval(dragScrollInterval); dragScrollInterval = null; } }

    function onDragStart(e) { e.preventDefault(); e.stopPropagation(); const clientY = e.touches ? e.touches[0].clientY : e.clientY; startY = clientY + scrollEl.scrollTop; initialVal = block.startMin; el.classList.add('dragging'); document.addEventListener('touchmove', onDragMove, {passive: false}); document.addEventListener('mousemove', onDragMove); document.addEventListener('touchend', onDragEnd); document.addEventListener('mouseup', onDragEnd); }
    function onDragMove(e) {
        e.preventDefault(); const clientY = e.touches ? e.touches[0].clientY : e.clientY; lastDragY = clientY; startAutoScroll();
        const y = clientY + scrollEl.scrollTop; const deltaMins = Math.round(((y - startY) / PX_PER_MIN) / 5) * 5; 
        let newStart = initialVal + deltaMins; newStart = Math.max(START_HOUR * 60, Math.min(newStart, (END_HOUR * 60) - block.duration));
        el.style.top = `${(newStart - (START_HOUR * 60)) * PX_PER_MIN}px`; el.dataset.tempStart = newStart;
    }
    function onDragEnd() {
        stopAutoScroll(); document.removeEventListener('touchmove', onDragMove); document.removeEventListener('mousemove', onDragMove); document.removeEventListener('touchend', onDragEnd); document.removeEventListener('mouseup', onDragEnd);
        if (el.classList.contains('dragging')) {
            el.classList.remove('dragging'); let newStart = parseInt(el.dataset.tempStart || block.startMin);
            const dailyDb = db.filter(b => b.date === getActiveDateStr());
            let hasCollision = false;
            const overlapping = dailyDb.filter(fb => fb.id !== block.id && (newStart < fb.startMin + fb.duration && newStart + block.duration > fb.startMin));

            if (overlapping.length > 0) {
                const fb = overlapping[0]; const encostaAntes = fb.startMin - block.duration; const encostaDepois = fb.startMin + fb.duration;
                const livreAntes = !dailyDb.some(ob => ob.id !== block.id && (encostaAntes < ob.startMin + ob.duration && encostaAntes + block.duration > ob.startMin));
                const livreDepois = !dailyDb.some(ob => ob.id !== block.id && (encostaDepois < ob.startMin + ob.duration && encostaDepois + block.duration > ob.startMin));
                if (livreAntes && encostaAntes >= START_HOUR * 60 && Math.abs(encostaAntes - newStart) <= 30) { newStart = encostaAntes; } 
                else if (livreDepois && encostaDepois + block.duration <= END_HOUR * 60 && Math.abs(encostaDepois - newStart) <= 30) { newStart = encostaDepois; } 
                else { hasCollision = true; }
            }

            if (hasCollision) showToast("Conflito! A tarefa voltou.");
            else {
                block.startMin = newStart; logAction('Moveu', block.title);
                const isPastDay = block.date < getTodayStr(); const isPastTimeToday = block.date === getTodayStr() && (block.startMin + block.duration) <= currentRealMins;
                if (!isPastDay && !isPastTimeToday) { if (block.type === 'past') block.wasDelayed = true; block.type = 'focus'; }
            }
            saveDb(); renderTimeline();
        }
    }

    function onResizeStart(e) { e.preventDefault(); e.stopPropagation(); const clientY = e.touches ? e.touches[0].clientY : e.clientY; startY = clientY + scrollEl.scrollTop; initialVal = block.duration; const dailyDb = db.filter(b => b.date === getActiveDateStr()).sort((a, b) => a.startMin - b.startMin); const nextBlock = dailyDb.find(b => b.startMin >= block.startMin + block.duration && b.id !== block.id); maxVal = nextBlock ? (nextBlock.startMin - block.startMin) : ((END_HOUR * 60) - block.startMin); maxVal = Math.floor(maxVal / 5) * 5; document.addEventListener('touchmove', onResizeMove, {passive: false}); document.addEventListener('mousemove', onResizeMove); document.addEventListener('touchend', onResizeEnd); document.addEventListener('mouseup', onResizeEnd); }
    function onResizeMove(e) {
        e.preventDefault(); const clientY = e.touches ? e.touches[0].clientY : e.clientY; lastDragY = clientY; startAutoScroll();
        const y = clientY + scrollEl.scrollTop; const deltaMins = Math.round(((y - startY) / PX_PER_MIN) / 5) * 5; 
        let newDur = initialVal + deltaMins; newDur = Math.max(15, Math.min(newDur, maxVal));
        if (newDur !== block.duration) {
            block.duration = newDur; el.style.height = `${(newDur * PX_PER_MIN) - 2}px`; el.querySelector('.time-label').innerHTML = `${formatClock(block.startMin)} - ${formatClock(block.startMin + newDur)} &bull; ${formatDur(newDur)}`;
            const microVal = el.querySelector('.micro-time-val'); if(microVal) microVal.innerText = formatDur(newDur);
        }
    }
    function onResizeEnd() { stopAutoScroll(); document.removeEventListener('touchmove', onResizeMove); document.removeEventListener('mousemove', onResizeMove); document.removeEventListener('touchend', onResizeEnd); document.removeEventListener('mouseup', onResizeEnd); block.expanded = false; logAction('Redimensionou', block.title); saveDb(); renderTimeline(); }
    dragger.addEventListener('touchstart', onDragStart, {passive: false}); dragger.addEventListener('mousedown', onDragStart); resizer.addEventListener('touchstart', onResizeStart, {passive: false}); resizer.addEventListener('mousedown', onResizeStart);
}

// --- COMBO B: TIME PICKER VERTICAL ---
let pickingTimeTaskId = null;
window.openTimePicker = function(id, e) {
    if(e) e.stopPropagation(); const b = db.find(x => x.id === id); if(!b || b.type === 'empty') return;
    pickingTimeTaskId = id;
    const hContainer = document.getElementById('tp-hours'), mContainer = document.getElementById('tp-mins');
    hContainer.innerHTML = `<div class="h-12 shrink-0"></div><div class="h-12 shrink-0"></div>` + Array.from({length: 24}, (_, i) => `<div class="h-12 shrink-0 flex items-center justify-center text-xl font-bold snap-center text-zinc-400 transition-all" data-val="${i}">${i.toString().padStart(2, '0')}</div>`).join('') + `<div class="h-12 shrink-0"></div><div class="h-12 shrink-0"></div>`;
    mContainer.innerHTML = `<div class="h-12 shrink-0"></div><div class="h-12 shrink-0"></div>` + Array.from({length: 12}, (_, i) => `<div class="h-12 shrink-0 flex items-center justify-center text-xl font-bold snap-center text-zinc-400 transition-all" data-val="${i*5}">${(i*5).toString().padStart(2, '0')}</div>`).join('') + `<div class="h-12 shrink-0"></div><div class="h-12 shrink-0"></div>`;
    
    closeAllSheets(); document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('time-picker-modal').classList.remove('hidden'); document.getElementById('time-picker-modal').classList.add('flex');
    
    setTimeout(() => {
        const hChild = hContainer.children[Math.floor(b.startMin / 60) + 2]; const mChild = mContainer.children[Math.floor((b.startMin % 60)/5) + 2];
        if(hChild) hContainer.scrollTop = hChild.offsetTop - hContainer.offsetTop - hContainer.clientHeight/2 + hChild.clientHeight/2;
        if(mChild) mContainer.scrollTop = mChild.offsetTop - mContainer.offsetTop - mContainer.clientHeight/2 + mChild.clientHeight/2;
        updatePickerStyles(hContainer); updatePickerStyles(mContainer);
    }, 50);
    hContainer.onscroll = () => updatePickerStyles(hContainer); mContainer.onscroll = () => updatePickerStyles(mContainer);
}
function updatePickerStyles(container) {
    const center = container.getBoundingClientRect().top + container.getBoundingClientRect().height / 2;
    Array.from(container.children).forEach(child => {
        if(!child.dataset.val) return;
        const rect = child.getBoundingClientRect(); const dist = Math.abs((rect.top + rect.height/2) - center);
        if (dist < 24) { child.classList.remove('text-zinc-400'); child.classList.add('text-app-focus', 'scale-125'); } 
        else { child.classList.add('text-zinc-400'); child.classList.remove('text-app-focus', 'scale-125'); }
    });
}
function getSelectedValue(container) {
    const center = container.getBoundingClientRect().top + container.getBoundingClientRect().height / 2;
    let closest = null; let minD = Infinity;
    Array.from(container.children).forEach(child => {
        if(!child.dataset.val) return;
        const rect = child.getBoundingClientRect(); const dist = Math.abs((rect.top + rect.height/2) - center);
        if (dist < minD) { minD = dist; closest = child; }
    }); return closest ? parseInt(closest.dataset.val) : 0;
}
window.cancelTimePicker = function() { pickingTimeTaskId = null; document.getElementById('time-picker-modal').classList.add('hidden'); document.getElementById('time-picker-modal').classList.remove('flex'); document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none'); }
window.saveTimePicker = function() {
    if(!pickingTimeTaskId) return; const b = db.find(x => x.id === pickingTimeTaskId);
    const newStart = getSelectedValue(document.getElementById('tp-hours')) * 60 + getSelectedValue(document.getElementById('tp-mins'));
    const hasCollision = db.filter(x => x.date === b.date).some(fb => fb.id !== b.id && (newStart < fb.startMin + fb.duration && newStart + b.duration > fb.startMin));
    if (hasCollision) return showToast("Conflito! Horário ocupado.");
    b.startMin = newStart; logAction('Alterou horário', b.title); saveDb(); renderTimeline(); cancelTimePicker(); showToast("Horário alterado.");
}

// --- COMBO A e I: EDITOR SUPREMO (COM MICROBLOCOS NA LISTA E ROTINAS) ---
let editingTaskId = null; let editingTagId = null; let editingTaskType = 'task'; let editingMicroblocks = [];

window.openEditModal = function(id, e, type = 'task') {
    if(e) e.stopPropagation(); 
    let b; if(type === 'backlog') b = backlogDb.find(x => x.id === id); else if(type === 'routine') b = routinesDb.find(x => x.id === id); else b = db.find(x => x.id === id);
    if(!b) return;
    editingTaskId = id; editingTagId = b.tagId; editingTaskType = type;
    editingMicroblocks = JSON.parse(JSON.stringify(b.microblocks || []));
    document.getElementById('edit-task-title').value = b.title || b.name; 
    renderEditTagSelector(); renderEditMicroblocks();
    closeAllSheets(); document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('edit-task-modal').classList.remove('hidden'); document.getElementById('edit-task-modal').classList.add('flex');
}
window.selectEditTag = function(id) { editingTagId = editingTagId === id ? null : id; renderEditTagSelector(); }
window.renderEditTagSelector = function() {
    const container = document.getElementById('edit-tag-selector-container'); if(!container) return;
    let html = `<button onclick="selectEditTag(null)" class="shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition whitespace-nowrap ${editingTagId === null ? 'bg-zinc-900 border-zinc-900 text-white shadow-md' : 'bg-zinc-50 border-zinc-200 text-zinc-600'}">Sem</button>`;
    tagsDb.forEach(t => { const isActive = editingTagId === t.id; const activeClass = isActive ? 'shadow-md ring-2 ring-offset-1' : 'opacity-70 hover:opacity-100'; html += `<button onclick="selectEditTag('${t.id}')" class="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-bold transition whitespace-nowrap ${activeClass}" style="background-color: ${t.color}15; color: ${t.color}; border: 1px solid ${t.color}40;"><div class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.color};"></div>${t.name}</button>`; }); container.innerHTML = html;
}
function renderEditMicroblocks() {
    document.getElementById('edit-mb-list').innerHTML = editingMicroblocks.map((mb, i) => `<div class="flex justify-between items-center bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/10 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300"><span>${mb.title}</span><button onclick="removeMbFromEdit(${i})" class="text-red-500 hover:text-red-600"><i class="ph ph-x"></i></button></div>`).join('');
}
window.addMbToEdit = function(inp) { if(!inp.value.trim()) return; editingMicroblocks.push({ id: 'mb_' + Date.now(), title: inp.value.trim(), done: false }); inp.value = ''; renderEditMicroblocks(); }
window.removeMbFromEdit = function(idx) { editingMicroblocks.splice(idx, 1); renderEditMicroblocks(); }
window.saveEditTask = function() {
    if(!editingTaskId) return; const newTitle = document.getElementById('edit-task-title').value.trim(); if(!newTitle) return;
    if(editingTaskType === 'backlog') { const b = backlogDb.find(x => x.id === editingTaskId); if(b) { b.title = newTitle; b.tagId = editingTagId; b.microblocks = editingMicroblocks; saveBacklog(); renderBacklog(); openListSheet(); } }
    else if(editingTaskType === 'routine') { const b = routinesDb.find(x => x.id === editingTaskId); if(b) { b.name = newTitle; b.microblocks = editingMicroblocks; saveRoutines(); renderRoutines(); openListSheet(); } }
    else { const b = db.find(x => x.id === editingTaskId); if(b) { b.title = newTitle; b.tagId = editingTagId; b.microblocks = editingMicroblocks; saveDb(); renderTimeline(); } }
    cancelEdit(); showToast("Salvo!");
}
window.cancelEdit = function() { editingTaskId = null; document.getElementById('edit-task-modal').classList.add('hidden'); document.getElementById('edit-task-modal').classList.remove('flex'); document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none'); }

let deletingTaskId = null; let deletingBacklogId = null;
window.openDeleteModal = function(id, e) { if(e) e.stopPropagation(); deletingTaskId = id; closeAllSheets(); document.getElementById('overlay').classList.remove('opacity-0', 'pointer-events-none'); document.getElementById('delete-task-modal').classList.remove('hidden'); document.getElementById('delete-task-modal').classList.add('flex'); }
window.moveToBacklog = function() { if(!deletingTaskId) return; const b = db.find(x => x.id === deletingTaskId); if(b) { backlogDb.push({ id: 'bl_' + Date.now(), title: b.title, duration: b.duration, tagId: b.tagId || null, microblocks: b.microblocks || [] }); saveBacklog(); db = db.filter(x => x.id !== deletingTaskId); saveDb(); renderTimeline(); renderBacklog(); logAction('Moveu para Lista', b.title); showToast("Movido para a lista!"); } cancelDelete(); }
window.confirmKillTask = function() { if(!deletingTaskId) return; const b = db.find(x => x.id === deletingTaskId); if(b) logAction('Excluiu', b.title); db = db.filter(b => b.id !== deletingTaskId); saveDb(); renderTimeline(); cancelDelete(); showToast("Tarefa excluída."); }
window.cancelDelete = function() { deletingTaskId = null; document.getElementById('delete-task-modal').classList.add('hidden'); document.getElementById('delete-task-modal').classList.remove('flex'); document.getElementById('overlay').classList.add('opacity-0', 'pointer-events-none'); }
window.openDeleteBacklogModal = function(id) { deletingBacklogId = id; document.getElementById('delete-backlog-modal').classList.remove('hidden'); document.getElementById('delete-backlog-modal').classList.add('flex'); }
window.cancelDeleteBacklog = function() { deletingBacklogId = null; document.getElementById('delete-backlog-modal').classList.add('hidden'); document.getElementById('delete-backlog-modal').classList.remove('flex'); }
window.confirmDeleteBacklog = function() { if(!deletingBacklogId) return; backlogDb = backlogDb.filter(i => i.id !== deletingBacklogId); saveBacklog(); renderBacklog(); cancelDeleteBacklog(); showToast("Excluído da lista!"); }


// --- INTENT E SHEETS ---
const fab = document.getElementById('fab-btn'), sheet = document.getElementById('bottom-sheet'), listSheet = document.getElementById('list-sheet'), overlay = document.getElementById('overlay'), input = document.getElementById('task-input'), backlogInput = document.getElementById('backlog-input'), listBtn = document.getElementById('list-btn');

function syncDurButtons(mins) {
    document.querySelectorAll('.sheet-dur-btn').forEach(b => { b.className = 'sheet-dur-btn px-4 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm whitespace-nowrap hover:opacity-80 transition'; if(parseInt(b.dataset.time) === mins) b.className = 'sheet-dur-btn px-4 py-2 rounded-full bg-app-focus border-transparent text-white text-sm font-medium whitespace-nowrap shadow-[0_0_15px_rgba(79,70,229,0.3)] transition'; });
    document.querySelectorAll('.float-dur-btn').forEach(b => { b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-zinc-100 text-zinc-500 hover:opacity-80 text-xs font-bold transition'; if(parseInt(b.dataset.time) === mins) b.className = 'float-dur-btn flex-1 py-1.5 rounded bg-app-focus text-white text-xs font-bold shadow-[0_0_10px_rgba(79,70,229,0.4)] transition'; });
}
document.querySelectorAll('.sheet-dur-btn').forEach(btn => btn.onclick = (e) => { selectedDur = parseInt(e.target.dataset.time); syncDurButtons(selectedDur); });
window.changeFloatDuration = function(mins) { if (pendingIntent) { pendingIntent.duration = mins; selectedDur = mins; syncDurButtons(mins); renderTimeline(); } }

window.openSheet = () => { document.getElementById('config-sheet').classList.add('translate-y-full'); document.getElementById('period-select-sheet').classList.add('translate-y-full'); selectedTagId = null; renderTagSelector(); overlay.classList.remove('opacity-0', 'pointer-events-none'); sheet.classList.remove('translate-y-full'); fab.style.transform = 'scale(0)'; if(listBtn) listBtn.style.transform = 'scale(0)'; }
window.openListSheet = () => { renderBacklog(); renderRoutines(); loadNotes(); overlay.classList.remove('opacity-0', 'pointer-events-none'); listSheet.classList.remove('translate-y-full'); fab.style.transform = 'scale(0)'; if(listBtn) listBtn.style.transform = 'scale(0)'; }
window.closeAllSheets = () => {
    overlay.classList.add('opacity-0', 'pointer-events-none'); 
    ['bottom-sheet', 'list-sheet', 'config-sheet', 'period-select-sheet', 'tags-sheet', 'reports-sheet', 'history-sheet', 'clone-sheet'].forEach(id => document.getElementById(id).classList.add('translate-y-full'));
    ['clone-qtd-modal', 'edit-task-modal', 'delete-task-modal', 'delete-backlog-modal', 'time-picker-modal'].forEach(id => { const m = document.getElementById(id); if(m) { m.classList.add('hidden'); m.classList.remove('flex'); } });
    input.blur(); backlogInput.blur(); if(!pendingIntent) { fab.style.transform = 'scale(1)'; if(listBtn) listBtn.style.transform = 'scale(1)'; }
}

window.commitIntent = () => { const title = input.value.trim(); if (!title) return; pendingIntent = { title: title, duration: selectedDur, theme: 'focus', tagId: selectedTagId, microblocks: [] }; input.value = ''; closeAllSheets(); document.getElementById('floating-title').innerText = title; syncDurButtons(selectedDur); document.getElementById('floating-task').classList.remove('hidden'); document.getElementById('floating-task').classList.add('flex'); renderTimeline(); };
window.commitSpecialIntent = (title, theme) => { pendingIntent = { title: title, duration: selectedDur, theme: theme, tagId: selectedTagId, microblocks: [] }; input.value = ''; closeAllSheets(); document.getElementById('floating-title').innerText = title; syncDurButtons(selectedDur); document.getElementById('floating-task').classList.remove('hidden'); document.getElementById('floating-task').classList.add('flex'); renderTimeline(); };
window.cancelPendingTask = () => { pendingIntent = null; document.getElementById('floating-task').classList.add('hidden'); document.getElementById('floating-task').classList.remove('flex'); fab.style.transform = 'scale(1)'; if(listBtn) listBtn.style.transform = 'scale(1)'; renderTimeline(); }
input.addEventListener('keypress', e => { if (e.key === 'Enter') commitIntent(); }); backlogInput.addEventListener('keypress', e => { if (e.key === 'Enter') addBacklogItem(); });

function performEncaixeMatematico(gapStart, gapDuration) {
    let start = gapStart;
    if (getActiveDateStr() === getTodayStr() && currentRealMins >= gapStart && currentRealMins <= gapStart + gapDuration) { if (currentRealMins + pendingIntent.duration <= gapStart + gapDuration) { start = Math.round(currentRealMins / 5) * 5; start = Math.max(gapStart, Math.min(start, gapStart + gapDuration - pendingIntent.duration)); } }
    start = Math.round(start / 5) * 5;
    db.push({ id: 'f_' + Date.now(), type: 'focus', title: pendingIntent.title, startMin: start, duration: pendingIntent.duration, date: getActiveDateStr(), microblocks: pendingIntent.microblocks || [], completed: false, theme: pendingIntent.theme || 'focus', tagId: pendingIntent.tagId || null });
    logAction('Adicionou', pendingIntent.title); saveDb(); cancelPendingTask(); 
}

// --- COMBO I e H: LISTA, ROTINAS, NOTAS ---
window.switchListTab = (tab) => {
    ['backlog', 'notas', 'rotinas'].forEach(t => { document.getElementById(`tab-${t}`).className = 'pb-2 text-sm font-bold border-b-2 border-transparent text-zinc-400'; document.getElementById(`content-${t}`).classList.add('hidden'); document.getElementById(`content-${t}`).classList.remove('flex'); });
    document.getElementById(`tab-${tab}`).className = 'pb-2 text-sm font-bold border-b-2 border-zinc-900 dark:border-white text-zinc-900 dark:text-white'; document.getElementById(`content-${tab}`).classList.remove('hidden'); document.getElementById(`content-${tab}`).classList.add('flex');
}
document.getElementById('notes-area').addEventListener('input', (e) => { localStorage.setItem(`tb_notes_${getActiveDateStr()}`, e.target.value); });
function loadNotes() { const saved = localStorage.getItem(`tb_notes_${getActiveDateStr()}`); document.getElementById('notes-area').value = saved || ''; }

document.querySelectorAll('.backlog-dur-btn').forEach(btn => btn.onclick = (e) => { backlogSelectedDur = parseInt(e.target.dataset.time); document.querySelectorAll('.backlog-dur-btn').forEach(b => b.className = 'backlog-dur-btn px-4 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm whitespace-nowrap hover:opacity-80 transition'); e.target.className = 'backlog-dur-btn px-4 py-2 rounded-full bg-zinc-900 text-white text-sm font-medium whitespace-nowrap shadow-md transition'; });

window.addBacklogItem = () => { const title = backlogInput.value.trim(); if(!title) return; backlogDb.push({ id: 'bl_' + Date.now(), title: title, duration: backlogSelectedDur, microblocks: [] }); saveBacklog(); backlogInput.value = ''; renderBacklog(); };
window.scheduleBacklogItem = (id) => { const item = backlogDb.find(i => i.id === id); if(!item) return; backlogDb = backlogDb.filter(i => i.id !== id); saveBacklog(); pendingIntent = { title: item.title, duration: item.duration, theme: 'focus', tagId: item.tagId || null, microblocks: item.microblocks || [] }; selectedDur = item.duration; syncDurButtons(selectedDur); document.getElementById('floating-title').innerText = item.title; document.getElementById('floating-task').classList.remove('hidden'); document.getElementById('floating-task').classList.add('flex'); closeAllSheets(); renderTimeline(); };

function renderBacklog() {
    const container = document.getElementById('backlog-container'); document.getElementById('list-btn-count').innerText = backlogDb.length;
    const totalMins = backlogDb.reduce((acc, item) => acc + item.duration, 0); document.getElementById('list-btn-time').innerText = formatDur(totalMins);
    if (backlogDb.length > 0) document.getElementById('list-btn-stats').classList.replace('hidden','flex'); else document.getElementById('list-btn-stats').classList.replace('flex','hidden');
    
    if (backlogDb.length === 0) { container.innerHTML = `<div class="flex flex-col items-center justify-center h-full opacity-50 py-8"><i class="ph ph-inbox text-4xl mb-2"></i><p class="text-sm font-medium">Lista vazia!</p></div>`; return; }
    container.innerHTML = backlogDb.map(item => { const tagHtml = item.tagId ? `<div class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${getTagColor(item.tagId)};"></div>` : ''; return `
        <div class="flex justify-between items-center bg-zinc-50 border border-zinc-200 p-3 rounded-xl mb-3 shadow-sm hover:opacity-80 transition group">
            <div class="flex flex-col min-w-0 pr-2 flex-1"><div class="flex items-center gap-1.5 mb-1">${tagHtml}<span class="text-sm font-bold text-zinc-800 truncate">${item.title}</span></div><span class="text-[11px] font-bold text-zinc-500 flex items-center gap-1"><i class="ph ph-clock"></i> ${formatDur(item.duration)} &bull; ${item.microblocks.length} micro</span></div>
            <div class="flex gap-1.5 shrink-0"><button onclick="openEditModal('${item.id}', event, 'backlog')" class="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 text-zinc-600 rounded-lg hover:opacity-80"><i class="ph ph-pencil-simple"></i></button><button onclick="scheduleBacklogItem('${item.id}')" class="w-8 h-8 flex items-center justify-center bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg hover:opacity-80"><i class="ph ph-hand-grabbing"></i></button><button onclick="openDeleteBacklogModal('${item.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 border border-red-100 text-red-500 rounded-lg hover:opacity-80"><i class="ph ph-trash"></i></button></div>
        </div>`}).join('');
}

window.addRoutine = function() { const name = prompt("Nome da Rotina:"); if(name) { routinesDb.push({ id: 'rt_' + Date.now(), name, microblocks: [] }); saveRoutines(); renderRoutines(); } }
window.deleteRoutine = function(id) { if(confirm("Apagar rotina?")) { routinesDb = routinesDb.filter(r => r.id !== id); saveRoutines(); renderRoutines(); } }
window.scheduleRoutine = function(id) { const r = routinesDb.find(x => x.id === id); if(r) { pendingIntent = { title: r.name, duration: 60, theme: 'focus', tagId: null, microblocks: JSON.parse(JSON.stringify(r.microblocks || [])) }; selectedDur = 60; syncDurButtons(60); document.getElementById('floating-title').innerText = r.name; document.getElementById('floating-task').classList.remove('hidden'); document.getElementById('floating-task').classList.add('flex'); closeAllSheets(); renderTimeline(); } }
function renderRoutines() {
    const cont = document.getElementById('routines-container'); if(routinesDb.length===0){ cont.innerHTML = `<p class="text-sm opacity-50 text-center py-4">Nenhuma rotina.</p>`; return; }
    cont.innerHTML = routinesDb.map(r => `<div class="flex items-center justify-between p-3 bg-zinc-50 border border-zinc-200 rounded-xl mb-2"><div><span class="font-bold text-sm text-zinc-800">${r.name}</span><p class="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">${r.microblocks.length} microblocos</p></div><div class="flex gap-1.5"><button onclick="openEditModal('${r.id}', event, 'routine')" class="w-8 h-8 flex items-center justify-center bg-white border border-zinc-200 text-zinc-600 rounded-lg hover:opacity-80"><i class="ph ph-pencil-simple"></i></button><button onclick="scheduleRoutine('${r.id}')" class="w-8 h-8 flex items-center justify-center bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-lg hover:opacity-80"><i class="ph ph-hand-grabbing"></i></button><button onclick="deleteRoutine('${r.id}')" class="w-8 h-8 flex items-center justify-center bg-red-50 border border-red-100 text-red-500 rounded-lg hover:opacity-80"><i class="ph ph-trash"></i></button></div></div>`).join('');
}

// --- CONFIGURAÇÕES E APARÊNCIA ---
window.openConfigSheet = () => { document.getElementById('bottom-sheet').classList.add('translate-y-full'); document.getElementById('config-periods-view').classList.add('hidden'); document.getElementById('config-hours-view').classList.add('hidden'); document.getElementById('config-appearance-view').classList.add('hidden'); document.getElementById('config-main-menu').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Configurações'; document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()'); document.getElementById('config-sheet').classList.remove('translate-y-full'); }
window.openConfigHours = () => { document.getElementById('config-main-menu').classList.add('hidden'); document.getElementById('config-hours-view').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Janela de Horário'; document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigHours()'); document.getElementById('config-hour-start').value = START_HOUR; document.getElementById('config-hour-end').value = END_HOUR; }
window.closeConfigHours = () => { document.getElementById('config-hours-view').classList.add('hidden'); document.getElementById('config-main-menu').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Configurações'; document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()'); }
window.saveConfigHours = () => { START_HOUR = parseInt(document.getElementById('config-hour-start').value); END_HOUR = parseInt(document.getElementById('config-hour-end').value); TOTAL_MINS = (END_HOUR - START_HOUR) * 60; localStorage.setItem('tb_start_hour', START_HOUR); localStorage.setItem('tb_end_hour', END_HOUR); renderGrid(); renderTimeline(); closeConfigHours(); showToast("Salvo!"); }

window.openConfigAppearance = () => { document.getElementById('config-main-menu').classList.add('hidden'); document.getElementById('config-appearance-view').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Aparência'; document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigAppearance()'); }
window.closeConfigAppearance = () => { document.getElementById('config-appearance-view').classList.add('hidden'); document.getElementById('config-main-menu').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Configurações'; document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()'); }
window.setNeonColor = (color) => { localStorage.setItem('tb_neon_color', color); document.documentElement.style.setProperty('--app-neon', color); showToast("Cor alterada!"); }
window.toggleAppDarkMode = () => { const isDark = !document.body.classList.contains('dark-mode-body'); localStorage.setItem('tb_dark_mode', isDark); loadAppTheme(); showToast(isDark ? "Modo Black ativado" : "Modo Claro ativado"); }

window.openConfigPeriods = () => { document.getElementById('config-main-menu').classList.add('hidden'); document.getElementById('config-periods-view').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Períodos'; document.getElementById('config-back-btn').setAttribute('onclick', 'closeConfigPeriods()'); renderConfigPeriods(); }
window.closeConfigPeriods = () => { document.getElementById('config-periods-view').classList.add('hidden'); document.getElementById('config-main-menu').classList.remove('hidden'); document.getElementById('config-title').innerText = 'Configurações'; document.getElementById('config-back-btn').setAttribute('onclick', 'openSheet()'); }
function renderConfigPeriods() { document.getElementById('config-periods-list').innerHTML = periodsDb.map(p => `<div class="flex items-center justify-between bg-zinc-50 border border-zinc-200 p-3 rounded-xl"><div class="flex flex-col"><span class="font-bold text-sm text-zinc-800">${p.name}</span><span class="text-[11px] font-bold text-zinc-500">${p.start} - ${p.end}</span></div><button onclick="deleteConfigPeriod('${p.id}')" class="text-red-400 hover:text-red-600"><i class="ph ph-trash text-lg"></i></button></div>`).join(''); }
window.addConfigPeriod = () => { const name = document.getElementById('config-period-name').value.trim(); const start = document.getElementById('config-period-start').value; const end = document.getElementById('config-period-end').value; if(name && start && end) { periodsDb.push({ id: 'p_' + Date.now(), name, start, end }); savePeriods(); renderConfigPeriods(); } }
window.deleteConfigPeriod = (id) => { periodsDb = periodsDb.filter(p => p.id !== id); savePeriods(); renderConfigPeriods(); }

window.openPeriodSelectSheet = () => { sheet.classList.add('translate-y-full'); renderPeriodSelect(); document.getElementById('period-select-sheet').classList.remove('translate-y-full'); }

// --- INIT ---
renderGrid(); runRealTimeEngine(); renderTimeline(); renderBacklog(); renderTagSelector();

setTimeout(() => {
    const scrollEl = document.getElementById('timeline-scroll');
    if(!showOnlyDelayed && !showOnlyCompleted && !showOnlyTag) {
        scrollEl.scrollTo({ top: Math.max(0, (currentRealMins - (START_HOUR * 60)) * PX_PER_MIN - (scrollEl.clientHeight / 2)), behavior: 'smooth' });
    }
}, 300);

input.addEventListener('keypress', e => { if (e.key === 'Enter') commitIntent(); }); backlogInput.addEventListener('keypress', e => { if (e.key === 'Enter') addBacklogItem(); });
if ('serviceWorker' in navigator) { window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(err => console.log(err)); }); }
