let calCurrentDate = new Date();
let timelineInterval = null;

// Ensure initial state loads from LocalStorage
let calShowClasses = localStorage.getItem('cal_show_classes') !== 'false';
let calShowTasks = localStorage.getItem('cal_show_tasks') !== 'false';

async function renderCalendarView() {
    if (!currentUser) return;

    if (!window.AcadState || !window.AcadState.activeTerm || window.AcadState.terms.length === 0) {
        if (typeof fetchTerms === 'function') await fetchTerms(); 
    }
    if (!window.AcadState || !window.AcadState.activeTerm) return;

    const savedView = localStorage.getItem('cal_view_pref') || 'month';
    const viewSelector = document.getElementById('cal-view-selector');
    
    // Safely check if view selector exists before updating
    if (viewSelector && viewSelector.value !== savedView) {
        viewSelector.value = savedView;
    }
    
    // Bind Sidebar Filter Toggles safely
    const clsToggle = document.getElementById('cal-toggle-classes');
    const tskToggle = document.getElementById('cal-toggle-tasks');
    if (clsToggle) clsToggle.checked = calShowClasses;
    if (tskToggle) tskToggle.checked = calShowTasks;

    const renderArea = document.getElementById('calendar-render-area');
    const header = document.getElementById('cal-date-display');
    
    if (!renderArea || !header) return;

    // Lock the render area to absolute height limits to kill bleeding scrollbars
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
    if (mod === 'online') return `<svg class="cal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`;
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
    return { classes, tasks };
}

function renderEventPillsArray(dateStr) {
    let { classes, tasks } = getEventsForDate(dateStr);
    let pills = [];

    classes.sort((a,b) => a.start_time.localeCompare(b.start_time)).forEach(c => {
        const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
        const isCancelled = c.modality === 'cancelled';
        const baseColor = isCancelled ? 'var(--text-muted)' : sub.color;
        const bgColor = isCancelled ? 'var(--input-bg)' : `${sub.color}22`;
        const txtColor = 'var(--text-main)';
        const decor = isCancelled ? 'text-decoration:line-through;' : '';
        pills.push(`<div class="cal-event-pill" style="background-color:${bgColor}; color:${txtColor}; border-left: 3px solid ${baseColor}; ${decor}" onclick="openClassModal('${c.id}')" title="${sub.name} (${c.start_time.slice(0,5)})"><span style="display:inline-flex; align-items:center; color:${baseColor}; margin-right:2px;">${getIconForModality(c.modality)}</span> ${c.start_time.slice(0,5)} ${sub.code}</div>`);
    });

    tasks.forEach(t => {
        const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
        const txtColor = window.getContrastYIQ ? window.getContrastYIQ(sub.color) : '#fff';
        pills.push(`<div class="cal-event-pill" style="background-color:${sub.color}; color:${txtColor}; border:none;" onclick="openTaskSidebar('${t.id}')" title="Due: ${t.title}"><span style="font-weight:700; margin-right:4px;">${new Date(t.due_date).toTimeString().slice(0,5)}</span> ${t.title}</div>`);
    });

    return pills;
}

function buildMonthGrid(year, month) {
    let html = '<div style="display:flex; flex-direction:column; height:100%; width:100%;">';
    html += '<div class="cal-month-header-row" style="display:grid; grid-template-columns:repeat(7,1fr); border-top:1px solid var(--border); border-left:1px solid var(--border); background:var(--card-bg); flex-shrink:0;">';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => html += `<div style="text-align:center; font-weight:600; padding:0.5rem 0; color:var(--text-muted); font-size:0.85rem; border-right:1px solid var(--border); border-bottom:1px solid var(--border);">${d}</div>`);
    html += '</div>';
    
    html += '<div class="cal-grid-month" style="display:grid; grid-template-columns:repeat(7,1fr); grid-auto-rows:1fr; flex:1; min-height:0; overflow:hidden; border-left:1px solid var(--border);">';
    
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
            pillsHtml = pills.slice(0, 2).join('') + `<div class="cal-more-pill" onclick="calCurrentDate=new Date('${dStr}'); document.getElementById('cal-view-selector').value='day'; renderCalendarView();" style="font-size:0.7rem; font-weight:600; color:var(--text-main); padding:2px 4px; cursor:pointer;">+ ${pills.length - 2} more</div>`;
        } else {
            pillsHtml = pills.join('');
        }
        
        let cellStyle = `border-right:1px solid var(--border); border-bottom:1px solid var(--border); padding:4px; overflow:hidden; display:flex; flex-direction:column; gap:2px; min-height:0; background:var(--bg-color);`;
        if (!isCurrentMonth) cellStyle += ` opacity:0.4; background:var(--input-bg);`;
        
        let labelStyle = `font-size:0.75rem; font-weight:600; color:var(--text-muted); margin-bottom:2px; text-align:right; line-height:1;`;
        let spanStyle = ``;
        if (isToday) spanStyle = `background:var(--up-maroon); color:white; border-radius:50%; width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; float:right;`;
        
        html += `
        <div class="cal-day-cell ${isToday ? 'today' : ''} ${!isCurrentMonth ? 'inactive' : ''}" style="${cellStyle}">
            <div class="cal-date-label" style="${labelStyle}"><span style="${spanStyle}">${currDate.getDate()}</span></div>
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
    
    let html = `<div style="display:flex; flex-direction:column; height:100%; width:100%;">`;
    
    html += `<div style="display:flex; margin-left:50px; border-bottom:1px solid var(--border); flex-shrink:0;">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        html += `<div style="flex:1; text-align:center; padding:0.5rem; font-weight:600; font-size:0.85rem; color:${isToday ? 'var(--up-maroon)' : 'var(--text-muted)'};">${d.toLocaleDateString(undefined, {weekday:'short', day:'numeric'})}</div>`;
    }
    html += `</div>`;

    html += `<div class="time-grid-container" id="time-grid-scroll" style="flex:1; overflow-y:auto; position:relative; border:1px solid var(--border); background:var(--card-bg); border-radius:var(--radius);">`;
    html += `<div style="position:relative; height:1440px;">`;
    html += `<div class="current-time-line" id="current-time-line" style="display:none;"></div>`;

    for (let h=0; h<24; h++) {
        let displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        let ampm = h < 12 ? 'AM' : 'PM';
        html += `<div class="time-label" style="top: ${h*60}px">${displayHour} ${ampm}</div>`;
        html += `<div class="time-grid-line" style="top: ${h*60}px"></div>`;
    }

    html += `<div style="position:absolute; left:50px; right:0; top:0; bottom:0; display:flex;">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let { classes, tasks } = getEventsForDate(dStr);
        let isToday = dStr === todayStr;

        html += `<div class="time-column" style="flex:1; position:relative; ${isToday ? 'background:rgba(123,17,19,0.03);' : ''}">`;

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

document.addEventListener('DOMContentLoaded', () => {
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