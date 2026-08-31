let calCurrentDate = new Date();
let timelineInterval = null;

async function renderCalendarView() {
    if (!currentUser) return;

    if (!window.AcadState || !window.AcadState.activeTerm || window.AcadState.terms.length === 0) {
        if (typeof fetchTerms === 'function') {
            await fetchTerms(); 
        }
    }
    if (!window.AcadState || !window.AcadState.activeTerm) return;

    const savedView = localStorage.getItem('cal_view_pref') || 'month';
    const savedFilter = localStorage.getItem('cal_filter_pref') || 'all';
    
    const viewSelector = document.getElementById('cal-view-selector');
    const filterSelector = document.getElementById('cal-filter-selector');
    
    if (viewSelector.value !== savedView) viewSelector.value = savedView;
    if (filterSelector.value !== savedFilter) filterSelector.value = savedFilter;
    
    const renderArea = document.getElementById('calendar-render-area');
    const header = document.getElementById('cal-date-display');
    
    const y = calCurrentDate.getFullYear();
    const m = calCurrentDate.getMonth();
    const d = calCurrentDate.getDate();

    renderArea.innerHTML = ''; 
    clearInterval(timelineInterval);

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

function getIconForModality(mod) {
    if (mod === 'online') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
    if (mod === 'async') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 2h4"></path><path d="M12 14v-4"></path><path d="M4 13a8 8 0 0 1 8-8 8 8 0 0 1 8 8 8 8 0 0 1-8 8 8 8 0 0 1-8-8z"></path></svg>`;
    if (mod === 'cancelled') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>`;
}

function getEventsForDate(dateStr) {
    let filterPref = document.getElementById('cal-filter-selector').value || 'all';
    let classes = [];
    let tasks = [];

    if (filterPref === 'all' || filterPref === 'classes') {
        classes = window.AcadState.classes.filter(c => c.class_date === dateStr && window.AcadState.visibleSubjects.has(c.subject_id));
    }
    
    if (filterPref === 'all' || filterPref === 'tasks') {
        tasks = window.AcadState.assignments.filter(a => {
            if (!window.AcadState.visibleSubjects.has(a.subject_id)) return false;
            let d = new Date(a.due_date);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === dateStr;
        });
    }
    
    return { classes, tasks };
}

function renderEventPills(dateStr) {
    let { classes, tasks } = getEventsForDate(dateStr);
    let html = '';

    classes.sort((a,b) => a.start_time.localeCompare(b.start_time)).forEach(c => {
        const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
        const isCancelled = c.modality === 'cancelled';
        
        const baseColor = isCancelled ? 'var(--text-muted)' : sub.color;
        const bgColor = isCancelled ? 'var(--input-bg)' : `${sub.color}22`;
        const txtColor = 'var(--text-main)';
        const decor = isCancelled ? 'text-decoration:line-through;' : '';
        
        html += `<div class="cal-event-pill" style="background-color:${bgColor}; color:${txtColor}; border-left: 3px solid ${baseColor}; ${decor}" onclick="openClassModal('${c.id}')" title="${sub.name} (${c.start_time.slice(0,5)})">
            <span style="display:inline-flex; align-items:center; color:${baseColor}; margin-right:2px;">${getIconForModality(c.modality)}</span> 
            ${c.start_time.slice(0,5)} ${sub.code}
        </div>`;
    });

    tasks.forEach(t => {
        const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
        const txtColor = window.getContrastYIQ ? window.getContrastYIQ(sub.color) : '#fff';
        
        html += `<div class="cal-event-pill" style="background-color:${sub.color}; color:${txtColor}; border:none;" onclick="openTaskSidebar('${t.id}')" title="Due: ${t.title}">
            <span style="font-weight:700; margin-right:4px;">${new Date(t.due_date).toTimeString().slice(0,5)}</span> ${t.title}
        </div>`;
    });

    return html;
}

function buildMonthGrid(year, month) {
    let html = '<div class="cal-grid-month">';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => html += `<div class="cal-month-header">${d}</div>`);
    
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let currDate = new Date(year, month, 1);
    currDate.setDate(currDate.getDate() - currDate.getDay());

    for (let i = 0; i < 42; i++) {
        if (i >= 35 && currDate.getMonth() !== month) break;

        let dStr = `${currDate.getFullYear()}-${String(currDate.getMonth()+1).padStart(2,'0')}-${String(currDate.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        let isCurrentMonth = currDate.getMonth() === month;
        
        html += `
        <div class="cal-day-cell ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'inactive' : ''}">
            <div class="cal-date-label">${currDate.getDate()}</div>
            ${renderEventPills(dStr)}
        </div>`;
        
        currDate.setDate(currDate.getDate() + 1);
    }
    
    html += '</div>';
    return html;
}

function buildAbsoluteGrid(startDate, dayCount) {
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    let headersHtml = `<div style="display:flex; margin-left:50px; border-bottom:1px solid var(--border);">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        headersHtml += `<div style="flex:1; text-align:center; padding:0.5rem; font-weight:600; font-size:0.85rem; color:${isToday ? 'var(--up-maroon)' : 'var(--text-muted)'};">${d.toLocaleDateString(undefined, {weekday:'short', day:'numeric'})}</div>`;
    }
    headersHtml += `</div>`;

    let gridHtml = `<div class="time-grid-container" id="time-grid-scroll">`;
    gridHtml += `<div class="current-time-line" id="current-time-line" style="display:none;"></div>`;

    for (let h=0; h<24; h++) {
        let displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        let ampm = h < 12 ? 'AM' : 'PM';
        gridHtml += `<div class="time-label" style="top: ${h*60}px">${displayHour} ${ampm}</div>`;
        gridHtml += `<div class="time-grid-line" style="top: ${h*60}px"></div>`;
    }

    gridHtml += `<div style="position:absolute; left:50px; right:0; top:0; bottom:0; display:flex;">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let { classes, tasks } = getEventsForDate(dStr);
        let isToday = dStr === todayStr;

        gridHtml += `<div class="time-column" style="flex:1; position:relative; ${isToday ? 'background:rgba(123,17,19,0.03);' : ''}">`;

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
            
            gridHtml += `
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

            gridHtml += `
            <div class="time-event" style="top:${topPx}px; height:24px; background:${sub.color}; color:${txtColor}; border:none; display:flex; flex-direction:row; align-items:center; padding:0 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);" onclick="openTaskSidebar('${t.id}')">
                <strong style="color:${txtColor}; margin-right:6px; font-size:0.75rem;">${dTime.toTimeString().slice(0,5)}</strong> 
                <span style="overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:0.75rem; flex:1;">${t.title}</span>
            </div>`;
        });

        gridHtml += `</div>`;
    }
    gridHtml += `</div></div>`;

    return headersHtml + gridHtml;
}

function startTimelineTracker() {
    updateTimeline();
    timelineInterval = setInterval(updateTimeline, 60000); 
    
    setTimeout(() => {
        const scrollBox = document.getElementById('time-grid-scroll');
        if (scrollBox) {
            const now = new Date();
            let targetScroll = (now.getHours() * 60) - 100;
            scrollBox.scrollTop = Math.max(0, targetScroll);
        }
    }, 100);
}

function updateTimeline() {
    const line = document.getElementById('current-time-line');
    if (!line) return;
    
    const now = new Date();
    let v = document.getElementById('cal-view-selector').value;
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('cal-view-selector').addEventListener('change', (e) => {
        localStorage.setItem('cal_view_pref', e.target.value);
        renderCalendarView();
    });
    
    document.getElementById('cal-filter-selector').addEventListener('change', (e) => {
        localStorage.setItem('cal_filter_pref', e.target.value);
        renderCalendarView();
    });
    
    document.getElementById('cal-today-btn').addEventListener('click', () => { calCurrentDate = new Date(); renderCalendarView(); });
    
    document.getElementById('cal-prev-btn').addEventListener('click', () => { 
        let v = document.getElementById('cal-view-selector').value;
        if(v==='month') calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
        else if(v==='week') calCurrentDate.setDate(calCurrentDate.getDate() - 7);
        else calCurrentDate.setDate(calCurrentDate.getDate() - 1);
        renderCalendarView(); 
    });
    
    document.getElementById('cal-next-btn').addEventListener('click', () => { 
        let v = document.getElementById('cal-view-selector').value;
        if(v==='month') calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
        else if(v==='week') calCurrentDate.setDate(calCurrentDate.getDate() + 7);
        else calCurrentDate.setDate(calCurrentDate.getDate() + 1);
        renderCalendarView(); 
    });
});