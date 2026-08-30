let calCurrentDate = new Date();
let timelineInterval = null;

function renderCalendarView() {
    if (!window.AcadState || !window.AcadState.activeTerm) return;
    
    const v = document.getElementById('cal-view-selector').value;
    const renderArea = document.getElementById('calendar-render-area');
    const header = document.getElementById('cal-date-display');
    
    const y = calCurrentDate.getFullYear();
    const m = calCurrentDate.getMonth();
    const d = calCurrentDate.getDate();

    renderArea.innerHTML = ''; 
    clearInterval(timelineInterval);

    if (v === 'month') {
        header.innerText = calCurrentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        renderArea.innerHTML = buildMonthGrid(y, m);
    } else if (v === 'week') {
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
    if (mod === 'online') return '🌐';
    if (mod === 'async') return '⏳';
    if (mod === 'cancelled') return '❌';
    return '🏫'; 
}

function getEventsForDate(dateStr) {
    let classes = window.AcadState.classes.filter(c => c.class_date === dateStr && window.AcadState.visibleSubjects.has(c.subject_id));
    let tasks = window.AcadState.assignments.filter(a => {
        if (!window.AcadState.visibleSubjects.has(a.subject_id)) return false;
        let d = new Date(a.due_date);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === dateStr;
    });
    return { classes, tasks };
}

// Simple layout for Month View
function buildMonthGrid(year, month) {
    let html = '<div class="cal-grid-month">';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => html += `<div class="cal-month-header">${d}</div>`);
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day-cell inactive"></div>`;
    
    for (let i = 1; i <= daysInMonth; i++) {
        let dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        
        let { classes, tasks } = getEventsForDate(dStr);
        let pillsHtml = '';
        classes.forEach(c => {
            const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
            pillsHtml += `<div class="cal-event-pill" style="background:${sub.color};" onclick="openClassModal('${c.id}')">${getIconForModality(c.modality)} ${sub.code}</div>`;
        });
        tasks.forEach(t => {
            const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
            pillsHtml += `<div class="cal-event-pill cal-event-task" style="color:${sub.color}; border-color:${sub.color};" onclick="openTaskSidebar('${t.id}')">Task: ${t.title}</div>`;
        });

        html += `
        <div class="cal-day-cell ${isToday ? 'today' : ''}">
            <div class="cal-date-label">${i}</div>
            ${pillsHtml}
        </div>`;
    }
    html += '</div>';
    return html;
}

// 24-Hour Absolute Layout (Used for Week & Day View)
function buildAbsoluteGrid(startDate, dayCount) {
    let now = new Date();
    let todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    
    // Top headers mapping
    let headersHtml = `<div style="display:flex; margin-left:50px; border-bottom:1px solid var(--border);">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let isToday = dStr === todayStr;
        headersHtml += `<div style="flex:1; text-align:center; padding:0.5rem; font-weight:600; font-size:0.85rem; color:${isToday ? 'var(--up-maroon)' : 'var(--text-muted)'};">${d.toLocaleDateString(undefined, {weekday:'short', day:'numeric'})}</div>`;
    }
    headersHtml += `</div>`;

    // 1440px grid container (1px = 1 minute)
    let gridHtml = `<div class="time-grid-container" id="time-grid-scroll">`;
    gridHtml += `<div class="current-time-line" id="current-time-line" style="display:none;"></div>`;

    for (let h=0; h<24; h++) {
        let displayHour = h === 0 ? 12 : (h > 12 ? h - 12 : h);
        let ampm = h < 12 ? 'AM' : 'PM';
        gridHtml += `<div class="time-label" style="top: ${h*60}px">${displayHour} ${ampm}</div>`;
        gridHtml += `<div class="time-grid-line" style="top: ${h*60}px"></div>`;
    }

    // Event Columns
    gridHtml += `<div style="position:absolute; left:50px; right:0; top:0; bottom:0; display:flex;">`;
    for(let i=0; i<dayCount; i++) {
        let d = new Date(startDate);
        d.setDate(d.getDate() + i);
        let dStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        let { classes, tasks } = getEventsForDate(dStr);
        let isToday = dStr === todayStr;

        gridHtml += `<div class="time-column" style="flex:1; position:relative; ${isToday ? 'background:rgba(123,17,19,0.03);' : ''}">`;

        // Render Classes
        classes.forEach(c => {
            const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
            const [sh, sm] = c.start_time.split(':').map(Number);
            const [eh, em] = c.end_time.split(':').map(Number);
            const topPx = (sh * 60) + sm;
            const hPx = ((eh * 60) + em) - topPx;
            const isCancelled = c.modality === 'cancelled';
            
            gridHtml += `
            <div class="time-event" style="top:${topPx}px; height:${hPx}px; border-color:${sub.color}; opacity:${isCancelled?0.5:1};" onclick="openClassModal('${c.id}')">
                <strong style="color:${sub.color}; ${isCancelled?'text-decoration:line-through;':''}">${getIconForModality(c.modality)} ${sub.code}</strong>
                <span>${sub.name}</span>
                <span style="opacity:0.7">${c.venue||''}</span>
            </div>`;
        });

        // Render Tasks (Placed precisely at Due Time, 30px height)
        tasks.forEach(t => {
            const sub = window.AcadState.subjects.find(s => s.id === t.subject_id);
            let dTime = new Date(t.due_date);
            let topPx = (dTime.getHours() * 60) + dTime.getMinutes() - 30; // block ends at deadline
            if (topPx < 0) topPx = 0;

            gridHtml += `
            <div class="time-event" style="top:${topPx}px; height:30px; border-color:${sub.color}; background:${sub.color}1a; color:var(--text-main);" onclick="openTaskSidebar('${t.id}')">
                <strong>🚨 ${dTime.toTimeString().slice(0,5)}</strong> ${t.title}
            </div>`;
        });

        gridHtml += `</div>`;
    }
    gridHtml += `</div></div>`;

    return headersHtml + gridHtml;
}

function startTimelineTracker() {
    updateTimeline();
    timelineInterval = setInterval(updateTimeline, 60000); // Check every minute
    
    // Auto-scroll to current time on load
    setTimeout(() => {
        const scrollBox = document.getElementById('time-grid-scroll');
        if (scrollBox) {
            const now = new Date();
            let targetScroll = (now.getHours() * 60) - 100; // Offset slightly
            scrollBox.scrollTop = Math.max(0, targetScroll);
        }
    }, 100);
}

function updateTimeline() {
    const line = document.getElementById('current-time-line');
    if (!line) return;
    
    const now = new Date();
    // Check if the current date is visible on the grid
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
    document.getElementById('cal-view-selector').addEventListener('change', renderCalendarView);
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

    // Modals
    document.getElementById('save-inst-btn').addEventListener('click', async () => {
        const id = document.getElementById('inst-id').value;
        const payload = {
            class_date: document.getElementById('inst-date').value,
            modality: document.getElementById('inst-modality').value,
            start_time: document.getElementById('inst-start').value,
            end_time: document.getElementById('inst-end').value,
            venue: document.getElementById('inst-venue').value
        };
        await supabaseClient.from('class_instances').update(payload).eq('id', id);
        document.getElementById('class-instance-modal').classList.add('hidden');
        if (window.AcadState.activeTerm) fetchTermData(window.AcadState.activeTerm.id);
    });

    document.getElementById('delete-inst-btn').addEventListener('click', async () => {
        const id = document.getElementById('inst-id').value;
        if(!confirm("Remove this specific class block from your calendar?")) return;
        await supabaseClient.from('class_instances').delete().eq('id', id);
        document.getElementById('class-instance-modal').classList.add('hidden');
        if (window.AcadState.activeTerm) fetchTermData(window.AcadState.activeTerm.id);
    });
});

window.openClassModal = (instId) => {
    const c = window.AcadState.classes.find(x => x.id === instId);
    if(!c) return;
    const sub = window.AcadState.subjects.find(s => s.id === c.subject_id);
    
    document.getElementById('class-inst-course').innerText = `${sub.code} - ${sub.name}`;
    document.getElementById('inst-id').value = c.id;
    document.getElementById('inst-date').value = c.class_date;
    document.getElementById('inst-modality').value = c.modality;
    document.getElementById('inst-start').value = c.start_time.slice(0,5);
    document.getElementById('inst-end').value = c.end_time.slice(0,5);
    document.getElementById('inst-venue').value = c.venue || sub.venue || '';
    
    document.getElementById('class-instance-modal').classList.remove('hidden');
};