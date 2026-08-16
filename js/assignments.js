let currentTerm = null;
let currentMonth = new Date();

async function renderAssignmentsView() {
    if (!currentUser) {
        document.getElementById('term-selector').innerHTML = `<option>Please Log In</option>`;
        document.getElementById('assignments-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">You must log in to view or manage assignments.</td></tr>';
        document.getElementById('assignment-alerts').innerHTML = `<h3 style="color: var(--text-muted);">Please log in</h3>`;
        return;
    }
    
    const { data: terms } = await supabaseClient
        .from('terms')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
    
    const selector = document.getElementById('term-selector');
    if (terms && terms.length > 0) {
        currentTerm = terms[0];
        selector.innerHTML = terms.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
        loadAssignmentsForTerm(currentTerm.id);
    } else {
        selector.innerHTML = `<option>No terms yet</option>`;
        document.getElementById('assignments-body').innerHTML = '<tr><td colspan="4" style="text-align:center;">Create a new term to start tracking assignments.</td></tr>';
    }
    
    renderCalendar();
}

async function loadAssignmentsForTerm(termId) {
    const { data: subjects } = await supabaseClient.from('subjects').select('*').eq('term_id', termId);
    if (!subjects || subjects.length === 0) return;
    
    const subIds = subjects.map(s => s.id);
    
    const { data: assignments } = await supabaseClient.from('assignments')
        .select('*')
        .in('subject_id', subIds)
        .order('due_date', { ascending: true });
        
    const tbody = document.getElementById('assignments-body');
    let html = '';
    
    const now = new Date();
    let urgentCount = 0;

    if (assignments) {
        assignments.forEach(a => {
            const sub = subjects.find(s => s.id === a.subject_id);
            const due = new Date(a.due_date);
            
            const diffHours = (due - now) / (1000 * 60 * 60);
            
            let rowClass = '';
            if (!a.is_completed) {
                if (diffHours < 0) {
                    rowClass = 'overdue';
                } else if (diffHours <= 24) { 
                    rowClass = 'due-tomorrow'; 
                    urgentCount++; 
                } else if (diffHours <= 48) { 
                    rowClass = 'due-soon'; 
                    urgentCount++; 
                }
            }
            
            html += `
            <tr class="${rowClass}">
                <td><input type="checkbox" ${a.is_completed ? 'checked' : ''} onchange="toggleAssignmentStatus('${a.id}', this.checked)"></td>
                <td><span style="color:${sub.color}">${sub.icon} ${sub.code}</span></td>
                <td>${a.title}</td>
                <td>${due.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
            </tr>`;
        });
    }
    
    tbody.innerHTML = html || '<tr><td colspan="4" style="text-align:center;">No assignments logged.</td></tr>';
    
    document.getElementById('assignment-alerts').innerHTML = `
        <h3 style="color: var(--up-maroon);">You have ${urgentCount} urgent task${urgentCount === 1 ? '' : 's'} due within 48 hours.</h3>
        <p>Keep up the momentum!</p>
    `;
}

async function toggleAssignmentStatus(assignmentId, isCompleted) {
    await supabaseClient.from('assignments').update({ is_completed: isCompleted }).eq('id', assignmentId);
    if (currentTerm) loadAssignmentsForTerm(currentTerm.id);
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthDisplay = document.getElementById('cal-month-display');
    
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    
    monthDisplay.innerText = new Date(year, month).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    
    let html = '';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach(d => html += `<div class="calendar-header">${d}</div>`);
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="calendar-day" style="opacity: 0.3;"></div>`;
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        html += `
        <div class="calendar-day">
            <span class="calendar-date">${i}</span>
        </div>`;
    }
    
    grid.innerHTML = html;
}

document.getElementById('cal-prev').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); });