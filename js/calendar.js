let calCurrentDate = new Date();
let timelineInterval = null;

let calShowClasses = localStorage.getItem('cal_show_classes') !== 'false';
let calShowTasks = localStorage.getItem('cal_show_tasks') !== 'false';
let calCustomEvents = JSON.parse(localStorage.getItem('cal_custom_events') || '[]');
let calEditingEventId = null;
let calEventsLoadedUserId = null;
let calEventsSyncing = false;

async function renderCalendarView() {
    if (!currentUser) return;

    if (calEventsLoadedUserId !== currentUser.id) {
        const cached = localStorage.getItem(`cal_custom_events_${currentUser.id}`);
        if (cached) {
            try { calCustomEvents = JSON.parse(cached); } catch (error) { calCustomEvents = []; }
        }
        await syncCalendarEvents(true);
    }

    if (!window.AcadState || !window.AcadState.activeTerm || window.AcadState.terms.length === 0) {
        if (typeof fetchTerms === 'function') await fetchTerms(); 
    }
    if (!window.AcadState || !window.AcadState.activeTerm) return;

    const savedView = localStorage.getItem('cal_view_pref') || 'month';
    const viewSelector = document.getElementById('cal-view-selector');
    
    if (viewSelector && viewSelector.value !== savedView) {
        viewSelector.value = savedView;
    }
    
    const clsToggle = document.getElementById('cal-toggle-classes');
    const tskToggle = document.getElementById('cal-toggle-tasks');
    if (clsToggle) clsToggle.checked = calShowClasses;
    if (tskToggle) tskToggle.checked = calShowTasks;

    const renderArea = document.getElementById('calendar-render-area');
    const header = document.getElementById('cal-date-display');
    
    if (!renderArea || !header) return;

    renderArea.style.display = 'flex';
    renderArea.style.flexDirection = 'column';
    renderArea.style.height = '100%';
    renderArea.style.overflow = 'hidden';
    renderArea.style.boxSizing = 'border-box';
    
    const y = calCurrentDate.getFullYear();
    const m = calCurrentDate.getMonth();
    const d = calCurrentDate.getDate();

    renderArea.innerHTML = ''; 
    clearInterval(timelineInterval);
    
    renderCalendarSidebar();

    if (savedView === 'month') {
        header.innerText = calCurrentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        renderArea.innerHTML = buildMonthGrid(y, m);
    } else if (savedView === 'week') {
        let sun = new Date(calCurrentDate);
        sun.setDate(d - sun.getDay());
        let sat = new Date(sun);
        sat.setDate(sun.getDate() + 6);
        
        let m1 = sun.toLocaleString(undefined, {month:'short'});
        let m2 = sat.toLocaleString(undefined, {month:'short'});
        header.innerText = m1 === m2 ? `${m1} ${sun.getFullYear()}` : `${m1} - ${m2} ${sun.getFullYear()}`;
        
        renderArea.innerHTML = buildAbsoluteGrid(sun, 7);
        startTimelineTracker();
    } else {
        header.innerText = calCurrentDate.toLocaleDateString(undefined, { weekday:'long', month: 'long', day:'numeric', year: 'numeric' });
        renderArea.innerHTML = buildAbsoluteGrid(calCurrentDate, 1);
        startTimelineTracker();
    }
}

function renderCalendarSidebar() {
    const miniCal = document.getElementById('cal-mini-calendar');
    if (!miniCal) return;
    
    let mHtml = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <span style="font-weight:600; font-size:0.9rem;">${calCurrentDate.toLocaleDateString(undefined, {month:'short', year:'numeric'})}</span>
                 </div>`;
    mHtml += `<div style="display:grid; grid-template-columns:repeat(7,1fr); text-align:center; font-size:0.7rem; gap:2px; color:var(--text-muted); font-weight:600;"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>`;
    
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    let viewDateStr = `${calCurrentDate.getFullYear()}-${calCurrentDate.getMonth()}-${calCurrentDate.getDate()}`;
    
    let startD = new Date(calCurrentDate.getFullYear(), calCurrentDate.getMonth(), 1);
    startD.setDate(startD.getDate() - startD.getDay());
    
    mHtml += `<div style="display:grid; grid-template-columns:repeat(7,1fr); text-align:center; font-size:0.75rem; gap:2px; margin-top:0.25rem;">`;
    for(let i=0; i<42; i++) {
        let isToday = `${startD.getFullYear()}-${startD.getMonth()}-${startD.getDate()}` === todayStr;
        let isViewed = `${startD.getFullYear()}-${startD.getMonth()}-${startD.getDate()}` === viewDateStr;
        let isCurrentMonth = startD.getMonth() === calCurrentDate.getMonth();
        
        let st = `width:24px; height:24px; line-height:24px; margin:auto; border-radius:50%; cursor:pointer; opacity:${isCurrentMonth?1:0.3};`;
        if (isToday) st += `background:var(--up-maroon); color:white; font-weight:bold;`;
        else if (isViewed) st += `background:var(--up-maroon-light); color:var(--up-maroon); font-weight:bold;`;
        
        mHtml += `<div style="${st}" onclick="calCurrentDate=new Date(${startD.getFullYear()},${startD.getMonth()},${startD.getDate()}); renderCalendarView();">${startD.getDate()}</div>`;
        startD.setDate(startD.getDate() + 1);
    }
    mHtml += `</div>`;
    miniCal.innerHTML = mHtml;

    const termSel = document.getElementById('cal-sidebar-term-selector');
    if (termSel && window.AcadState.terms) {
        termSel.innerHTML = window.AcadState.terms.map(t => `<option value="${t.id}" ${window.AcadState.activeTerm.id === t.id ? 'selected' : ''}>${t.name}</option>`).join('');
    }
    
    const subList = document.getElementById('cal-sidebar-subjects-list');
    if (subList && window.AcadState.subjects) {
        subList.innerHTML = window.AcadState.subjects.map(s => `
            <label style="display:flex; align-items:center; gap:0.5rem; cursor:pointer; font-size:0.85rem;">
                <input type="checkbox" value="${s.id}" ${window.AcadState.visibleSubjects.has(s.id) ? 'checked' : ''} onchange="toggleSubjectVisibleCal('${s.id}', this.checked)">
                <span style="color:${s.color}; font-weight:600;">${window.renderSubjectIcon ? window.renderSubjectIcon(s.icon) : ''} ${s.code}</span>
            </label>
        `).join('');
    }
}

window.toggleSubjectVisibleCal = (subId, isVisible) => {
    if (isVisible) window.AcadState.visibleSubjects.add(subId);
    else window.AcadState.visibleSubjects.delete(subId);
    localStorage.setItem(`acad_visible_subjects_${window.AcadState.activeTerm.id}`, JSON.stringify([...window.AcadState.visibleSubjects]));
    renderCalendarView();
};

function getIconForModality(mod) {
    if (mod === 'online') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    if (mod === 'async') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2h4"></path><path d="M12 14v-4"></path><path d="M4 13a8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8 8 8 0 0 1-8-8z"></path></svg>`;
    if (mod === 'cancelled') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
}

function getEventsForDate(dateStr) {
    let classes = [];
    let tasks = [];

    if (calShowClasses) {
        classes = window.AcadState.classes.filter(c => c.class_date === dateStr && window.AcadState.visibleSubjects.has(c.subject_id));
    }
    
    if (calShowTasks) {
        tasks = window.AcadState.assignments.filter(a => {
            if (!window.AcadState.visibleSubjects.has(a.subject_id)) return false;
            let d = new Date(a.due_date);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === dateStr;
        });
    }
    const custom = calCustomEvents.filter(event => event.date === dateStr);
    return { classes, tasks, custom };
}

function renderEventPillsArray(dateStr) {
    let { classes, tasks, custom } = getEventsForDate(dateStr);
    let pills = [];
    let sequence = 0;
    const addPill = (time, html) => pills.push({ time: time || '23:59', sequence: sequence++, html });

    classes.forEach(c => {
        const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
        const isCancelled = c.modality === 'cancelled';
        const baseColor = isCancelled ? 'var(--text-muted)' : sub.color;
        const bgColor = isCancelled ? 'var(--input-bg)' : `${sub.color}22`;
        const txtColor = 'var(--text-main)';
        const decor = isCancelled ? 'text-decoration:line-through;' : '';
        addPill(c.start_time, `<div class="cal-event-pill" style="background-color:${bgColor}; color:${txtColor}; border-left: 3px solid ${baseColor}; ${decor}" onclick="openClassModal('${c.id}')" title="${sub.name} (${c.start_time.slice(0,5)})"><span style="display:inline-flex; align-items:center; color:${baseColor}; margin-right:2px;">${getIconForModality(c.modality)}</span> ${c.start_time.slice(0,5)} ${sub.code}</div>`);
    });

    tasks.forEach(t => {
        const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
        const txtColor = window.getContrastYIQ ? window.getContrastYIQ(sub.color) : '#fff';
        const dueTime = new Date(t.due_date).toTimeString().slice(0, 5);
        addPill(dueTime, `<div class="cal-event-pill" style="background-color:${sub.color}; color:${txtColor}; border:none;" onclick="openTaskSidebar('${t.id}')" title="Due: ${t.title}"><span style="font-weight:700; margin-right:4px;">${dueTime}</span> ${t.title}</div>`);
    });

    custom.forEach(event => {
        const color = event.color || '#2563eb';
        const start = calendarTimeValue(event.start);
        addPill(start, `<div class="cal-event-pill" style="background-color:${color}; color:${window.getContrastYIQ ? window.getContrastYIQ(color) : '#fff'}; border:none;" onclick="openCalendarEventModal('${event.id}')" title="${escapeHtml(event.title)}"><span style="font-weight:700; margin-right:4px;">${escapeHtml(start)}</span> ${escapeHtml(event.title)}</div>`);
    });

    return pills.sort((a, b) => a.time.localeCompare(b.time) || a.sequence - b.sequence).map(pill => pill.html);
}

function buildMonthGrid(year, month) {
    let html = '<div style="display:flex; flex-direction:column; height:100%; width:100%;">';
    html += '<div class="cal-month-header-row">';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => html += `<div>${d}</div>`);
    html += '</div>';
    
    html += '<div class="cal-grid-month">';
    
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let currDate = new Date(year, month, 1);
    currDate.setDate(currDate.getDate() - currDate.getDay());

    for (let i = 0; i < 42; i++) {
        if (i >= 35 && currDate.getMonth() !== month) break;

        let dStr = `${currDate.getFullYear()}-${String(currDate.getMonth()+1).padStart(2,'0')}-${String(currDate.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        let isCurrentMonth = currDate.getMonth() === month;
        
        let pills = renderEventPillsArray(dStr);
        let pillsHtml = '';
        if (pills.length > 3) {
            pillsHtml = pills.slice(0, 2).join('') + `<div class="cal-more-pill" onclick="calCurrentDate=new Date('${dStr}'); document.getElementById('cal-view-selector').value='day'; renderCalendarView();">+ ${pills.length - 2} more</div>`;
        } else {
            pillsHtml = pills.join('');
        }
        
        let cellClass = `cal-day-cell ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'inactive' : ''}`;
        
        html += `
        <div class="${cellClass}">
            <div class="cal-date-label"><span>${currDate.getDate()}</span></div>
            ${pillsHtml}
        </div>`;
        
        currDate.setDate(currDate.getDate() + 1);
    }
    html += '</div></div>';
    return html;
}

function buildAbsoluteGrid(startDate, dayCount) {
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    let html = `<div class="cal-absolute-grid" style="--calendar-day-count:${dayCount};">`;
    
    html += `<div class="cal-absolute-header">`;
    html += '<div class="cal-time-gutter" aria-hidden="true"></div>';
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        const weekdayInitial = d.toLocaleDateString(undefined, { weekday: 'narrow' });
        html += `<div class="cal-absolute-day-label${isToday ? ' today' : ''}"><span class="cal-weekday-initial">${weekdayInitial}</span><span class="cal-date-number">${d.getDate()}</span></div>`;
    }
    html += `</div>`;

    html += `<div class="time-grid-container" id="time-grid-scroll">`;
    html += `<div style="position:relative; height:1440px;">`;
    html += `<div class="current-time-line" id="current-time-line" style="display:none;"></div>`;

    for (let h=0; h<24; h++) {
        let displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        let ampm = h < 12 ? 'AM' : 'PM';
        html += `<div class="time-label" style="top: ${h*60}px">${displayHour} ${ampm}</div>`;
        html += `<div class="time-grid-line" style="top: ${h*60}px"></div>`;
    }

    html += `<div class="time-columns">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let { classes, tasks, custom } = getEventsForDate(dStr);
        let isToday = dStr === todayStr;

        html += `<div class="time-column${isToday ? ' today' : ''}">`;

        classes.forEach(c => {
            const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
            const [sh, sm] = c.start_time.split(':').map(Number);
            const [eh, em] = c.end_time.split(':').map(Number);
            const topPx = (sh * 60) + sm;
            const hPx = ((eh * 60) + em) - topPx;
            const isCancelled = c.modality === 'cancelled';
            
            const baseColor = isCancelled ? 'var(--text-muted)' : sub.color;
            const bgColor = isCancelled ? 'var(--input-bg)' : `${sub.color}22`;
            const txtColor = 'var(--text-main)';
            
            html += `
            <div class="time-event" style="top:${topPx}px; height:${hPx}px; background:${bgColor}; border-left: 4px solid ${baseColor}; color:${txtColor}; flex-direction:column;" onclick="openClassModal('${c.id}')">
                <strong style="color:${baseColor}; ${isCancelled?'text-decoration:line-through;':''} margin-bottom:2px; display:flex; align-items:center; flex-shrink:0;">
                    ${getIconForModality(c.modality)} <span style="margin-left:4px; font-size: 0.75rem;">${sub.code}</span>
                </strong>
                <span style="font-size:0.7rem; opacity:0.9; width:100%; line-height:1.2; overflow:hidden; display:-webkit-box; -webkit-box-orient:vertical;">${c.start_time.slice(0,5)}–${c.end_time.slice(0,5)} • ${c.venue||''}</span>
            </div>`;
        });

        tasks.forEach(t => {
            const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
            let dTime = new Date(t.due_date);
            let topPx = (dTime.getHours() * 60) + dTime.getMinutes() - 24; 
            if (topPx < 0) topPx = 0;

            const txtColor = window.getContrastYIQ ? window.getContrastYIQ(sub.color) : '#fff';

            html += `
            <div class="time-event" style="top:${topPx}px; height:24px; background:${sub.color}; color:${txtColor}; border:none; display:flex; flex-direction:row; align-items:center; padding:0 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);" onclick="openTaskSidebar('${t.id}')">
                <strong style="color:${txtColor}; margin-right:6px; font-size:0.75rem;">${dTime.toTimeString().slice(0,5)}</strong> 
                <span style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:0.75rem; flex:1;">${t.title}</span>
            </div>`;
        });

        custom.forEach(event => {
            const color = event.color || '#2563eb';
            const start = calendarTimeValue(event.start) || '00:00';
            const end = calendarTimeValue(event.end) || start;
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            const topPx = (sh * 60) + sm;
            const heightPx = Math.max(24, ((eh * 60) + em) - topPx);
            html += `<div class="time-event" style="top:${topPx}px; height:${heightPx}px; background:${color}; color:${window.getContrastYIQ ? window.getContrastYIQ(color) : '#fff'}; border:none;" onclick="openCalendarEventModal('${event.id}')"><strong>${escapeHtml(event.title)}</strong><span>${escapeHtml(start)}${end ? `–${escapeHtml(end)}` : ''}${event.location ? ` • ${escapeHtml(event.location)}` : ''}</span></div>`;
        });

        html += `</div>`;
    }
    html += `</div></div></div></div>`;

    return html;
}

function startTimelineTracker() {
    updateTimeline();
    clearInterval(timelineInterval);
    timelineInterval = setInterval(updateTimeline, 60000); 
    
    setTimeout(() => {
        const scrollBox = document.getElementById('time-grid-scroll');
        if (scrollBox) {
            let targetScroll = 8 * 60; // Default fallback to 8:00 AM
            const events = scrollBox.querySelectorAll('.time-event');
            
            if (events.length > 0) {
                let minTop = Infinity;
                events.forEach(ev => {
                    let top = parseInt(ev.style.top, 10);
                    if (!isNaN(top) && top < minTop) minTop = top;
                });
                if (minTop < Infinity) {
                    targetScroll = Math.max(0, minTop - 30);
                }
            } else {
                const now = new Date();
                targetScroll = Math.max(0, (now.getHours() * 60) - 100);
            }
            
            scrollBox.scrollTop = targetScroll;
        }
    }, 100);
}

function updateTimeline() {
    const line = document.getElementById('current-time-line');
    if (!line) return;
    
    const now = new Date();
    const viewSelector = document.getElementById('cal-view-selector');
    if (!viewSelector) return;
    let v = viewSelector.value;
    let isVisible = false;
    
    let nowStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    let selStr = `${calCurrentDate.getFullYear()}-${String(calCurrentDate.getMonth()+1).padStart(2,'0')}-${String(calCurrentDate.getDate()).padStart(2,'0')}`;

    if (v === 'day' && nowStr === selStr) isVisible = true;
    if (v === 'week') {
        let sun = new Date(calCurrentDate);
        sun.setDate(calCurrentDate.getDate() - sun.getDay());
        let sat = new Date(sun);
        sat.setDate(sun.getDate() + 6);
        if (now >= sun && now <= new Date(sat.setHours(23,59,59))) isVisible = true;
    }

    if (isVisible) {
        let topPx = (now.getHours() * 60) + now.getMinutes();
        line.style.top = `${topPx}px`;
        line.style.display = 'block';
    } else {
        line.style.display = 'none';
    }
}

function calendarDateValue(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function calendarTimeValue(value) { return String(value || '').slice(0, 5); }
function calendarEventColor(type) { return { class: '#16803c', exam: '#c62828', meeting: '#2563eb', other: '#7c3aed' }[type] || '#2563eb'; }
function calendarEventId() { return window.crypto?.randomUUID?.() || `cal-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
async function syncCalendarEvents(pull = false) {
    if (!currentUser || !navigator.onLine || calEventsSyncing) return false;
    calEventsSyncing = true;
    try {
        if (pull) {
            const { data, error } = await supabaseClient.from('calendar_events').select('*').eq('user_id', currentUser.id).order('date', { ascending: true }).order('start', { ascending: true });
            if (error) throw error;
            const localPending = calCustomEvents.filter(event => event._isDirty || !event.user_id);
            const serverIds = new Set((data || []).map(event => event.id));
            calCustomEvents = [...(data || []).map(event => ({ ...event, _isDirty: false })), ...localPending.filter(event => !serverIds.has(event.id))];
            calEventsLoadedUserId = currentUser.id;
        }
        const pending = calCustomEvents.filter(event => event._isDirty || !event.user_id);
        if (pending.length) {
            const payload = pending.map(event => ({ id: event.id, user_id: currentUser.id, title: event.title, type: event.type, date: event.date, start: event.start, end: event.end, location: event.location || '', details: event.details || '', color: event.color || calendarEventColor(event.type) }));
            const { error } = await supabaseClient.from('calendar_events').upsert(payload, { onConflict: 'id' });
            if (error) throw error;
            const syncedIds = new Set(pending.map(event => event.id));
            calCustomEvents = calCustomEvents.map(event => syncedIds.has(event.id) ? { ...event, user_id: currentUser.id, _isDirty: false } : event);
        }
        localStorage.setItem(`cal_custom_events_${currentUser.id}`, JSON.stringify(calCustomEvents));
        localStorage.setItem('cal_custom_events', JSON.stringify(calCustomEvents));
        return true;
    } catch (error) {
        console.warn('Calendar event sync unavailable; using local events.', error.message || error);
        return false;
    } finally {
        calEventsSyncing = false;
    }
}
function closeCalendarEventModal() { document.getElementById('calendar-event-modal')?.classList.add('hidden'); calEditingEventId = null; }
function openCalendarEventModal(eventId = null) {
    const modal = document.getElementById('calendar-event-modal');
    if (!modal) return;
    const event = eventId ? calCustomEvents.find(item => item.id === eventId) : null;
    calEditingEventId = event?.id || null;
    document.getElementById('calendar-event-modal-title').textContent = event ? 'Edit event' : 'Add event';
    document.getElementById('cal-event-title').value = event?.title || '';
    document.getElementById('cal-event-type').value = event?.type || 'meeting';
    document.getElementById('cal-event-date').value = event?.date || calendarDateValue(calCurrentDate);
    document.getElementById('cal-event-start').value = calendarTimeValue(event?.start) || '09:00';
    document.getElementById('cal-event-end').value = calendarTimeValue(event?.end) || '10:00';
    document.getElementById('cal-event-location').value = event?.location || '';
    document.getElementById('cal-event-details').value = event?.details || '';
    modal.classList.remove('hidden');
    document.getElementById('cal-event-title').focus();
}
function saveCalendarEvent() {
    const title = document.getElementById('cal-event-title').value.trim();
    const date = document.getElementById('cal-event-date').value;
    const start = document.getElementById('cal-event-start').value;
    const end = document.getElementById('cal-event-end').value;
    if (!title || !date || !start) return;
    const type = document.getElementById('cal-event-type').value;
    const event = { id: calEditingEventId || calendarEventId(), title, type, date, start, end: end || start, location: document.getElementById('cal-event-location').value.trim(), details: document.getElementById('cal-event-details').value.trim(), color: calendarEventColor(type), user_id: currentUser?.id || null, _isDirty: true };
    const index = calCustomEvents.findIndex(item => item.id === event.id);
    if (index >= 0) calCustomEvents[index] = event;
    else calCustomEvents.push(event);
    localStorage.setItem(`cal_custom_events_${currentUser?.id || 'local'}`, JSON.stringify(calCustomEvents));
    localStorage.setItem('cal_custom_events', JSON.stringify(calCustomEvents));
    syncCalendarEvents(false);
    closeCalendarEventModal();
    renderCalendarView();
}

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('online', () => syncCalendarEvents(false));
    document.getElementById('cal-add-event-btn')?.addEventListener('click', () => openCalendarEventModal());
    document.getElementById('cal-mobile-add-event-btn')?.addEventListener('click', () => openCalendarEventModal());
    document.getElementById('cal-event-cancel')?.addEventListener('click', closeCalendarEventModal);
    document.getElementById('cal-event-save')?.addEventListener('click', saveCalendarEvent);
    document.getElementById('calendar-event-modal')?.addEventListener('click', event => { if (event.target.id === 'calendar-event-modal') closeCalendarEventModal(); });
    document.getElementById('cal-view-selector')?.addEventListener('change', (e) => {
        localStorage.setItem('cal_view_pref', e.target.value);
        renderCalendarView();
    });
    
    document.getElementById('cal-toggle-classes')?.addEventListener('change', (e) => {
        calShowClasses = e.target.checked;
        localStorage.setItem('cal_show_classes', calShowClasses);
        renderCalendarView();
    });

    document.getElementById('cal-toggle-tasks')?.addEventListener('change', (e) => {
        calShowTasks = e.target.checked;
        localStorage.setItem('cal_show_tasks', calShowTasks);
        renderCalendarView();
    });

    document.getElementById('cal-sidebar-term-selector')?.addEventListener('change', (e) => {
        const t = window.AcadState.terms.find(x => x.id === e.target.value);
        if (t) { 
            window.AcadState.activeTerm = t; 
            localStorage.setItem('acad_active_term', t.id);
            if (typeof fetchTermData === 'function') fetchTermData(t.id); 
            else renderCalendarView();
        }
    });
    
    document.getElementById('cal-today-btn')?.addEventListener('click', () => { calCurrentDate = new Date(); renderCalendarView(); });
    
    document.getElementById('cal-prev-btn')?.addEventListener('click', () => { 
        let viewSelector = document.getElementById('cal-view-selector');
        if(!viewSelector) return;
        let v = viewSelector.value;
        if(v==='month') calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
        else if(v==='week') calCurrentDate.setDate(calCurrentDate.getDate() - 7);
        else calCurrentDate.setDate(calCurrentDate.getDate() - 1);
        renderCalendarView(); 
    });
    
    document.getElementById('cal-next-btn')?.addEventListener('click', () => { 
        let viewSelector = document.getElementById('cal-view-selector');
        if(!viewSelector) return;
        let v = viewSelector.value;
        if(v==='month') calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
        else if(v==='week') calCurrentDate.setDate(calCurrentDate.getDate() + 7);
        else calCurrentDate.setDate(calCurrentDate.getDate() + 1);
        renderCalendarView(); 
    });
});