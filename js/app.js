function setFullTheme(themeName) {
    localStorage.setItem('app_full_theme', themeName);
    document.body.setAttribute('data-theme', themeName);
    
    if (typeof chartInstance !== 'undefined' && chartInstance) {
        const primaryColor = getComputedStyle(document.body).getPropertyValue('--up-maroon').trim();
        chartInstance.data.datasets[0].backgroundColor = primaryColor + 'b3'; 
        chartInstance.data.datasets[0].borderColor = primaryColor;
        chartInstance.update();
    }
}

setFullTheme(localStorage.getItem('app_full_theme') || 'light');

async function switchView(viewName) {
    // Hide all main wrappers
    document.getElementById('calculator-view').classList.add('hidden');
    document.getElementById('explore-view').classList.add('hidden');
    document.getElementById('assignments-view').classList.add('hidden');
    document.getElementById('calendar-view').classList.add('hidden');
    document.getElementById('notes-view').classList.add('hidden');
    document.getElementById('profile-view').classList.add('hidden');
    
    // Close mobile sidebars implicitly upon navigation
    document.querySelectorAll('.sidebar').forEach(s => s.classList.remove('mobile-open'));
    document.getElementById('mobile-sidebar-backdrop')?.classList.remove('mobile-open');
    
    // Manage Hamburger Menu Visibility
    const hamburger = document.getElementById('mobile-sidebar-toggle');
    if (hamburger) {
        // Explore and Profile views do not have customization sidebars
        if (viewName === 'explore' || viewName === 'profile') {
            hamburger.style.visibility = 'hidden';
        } else {
            hamburger.style.visibility = 'visible';
        }
    }
    
    document.querySelectorAll('.sidebar-item, .nav-icon').forEach(el => el.classList.remove('active-nav'));

    // Route logic
    if (viewName === 'calc') {
        document.getElementById('calculator-view').classList.remove('hidden');
        document.querySelectorAll('.route-calc').forEach(el => el.classList.add('active-nav'));
    } else if (viewName === 'explore') {
        document.getElementById('explore-view').classList.remove('hidden');
        document.querySelectorAll('.route-calc').forEach(el => el.classList.add('active-nav'));
        if (typeof fetchAndRenderCalculators === 'function') fetchAndRenderCalculators();
    } else if (viewName === 'assignments') {
        document.getElementById('assignments-view').classList.remove('hidden');
        document.querySelectorAll('.route-assignments').forEach(el => el.classList.add('active-nav'));
        if (typeof renderAssignmentsView === 'function') renderAssignmentsView();
    } else if (viewName === 'calendar') {
        document.getElementById('calendar-view').classList.remove('hidden');
        document.querySelectorAll('.route-calendar').forEach(el => el.classList.add('active-nav'));
        if (typeof renderCalendarView === 'function') await renderCalendarView();
    } else if (viewName === 'notes') {
        document.getElementById('notes-view').classList.remove('hidden');
        document.querySelectorAll('.route-notes').forEach(el => el.classList.add('active-nav'));
        if (typeof initNotes === 'function') initNotes();
    } else if (viewName === 'profile') {
        document.getElementById('profile-view').classList.remove('hidden');
        document.querySelectorAll('.route-profile').forEach(el => el.classList.add('active-nav'));
        if (typeof populateProfileStats === 'function') populateProfileStats();
    }
}

function toggleMobileSidebar() {
    const activeSidebar = document.querySelector('.layout:not(.hidden) .sidebar');
    const backdrop = document.getElementById('mobile-sidebar-backdrop');
    if (activeSidebar) {
        activeSidebar.classList.toggle('mobile-open');
        backdrop?.classList.toggle('mobile-open');
    }
}

async function populateProfileStats() {
    const logoutBtn = document.getElementById('logout-btn-profile');
    const loginBtn = document.getElementById('login-btn-profile');
    
    if (currentUser) {
        logoutBtn?.classList.remove('hidden');
        loginBtn?.classList.add('hidden');
        
        const nameStr = currentUser.user_metadata?.full_name || currentUser.user_metadata?.custom_claims?.global_name || currentUser.email.split('@')[0];
        document.getElementById('profile-name').innerText = nameStr;
        
        const avatarUrl = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
        const avatarContainer = document.getElementById('profile-avatar');
        
        if (avatarUrl) {
            const avatarHtml = `<img src="${avatarUrl}" style="width:100%; height:100%; object-fit:cover;">`;
            avatarContainer.innerHTML = avatarHtml;
            document.getElementById('sidebar-avatar-wrapper').innerHTML = avatarHtml;
            document.getElementById('mobile-avatar-wrapper').innerHTML = avatarHtml;
        } else {
            avatarContainer.innerHTML = nameStr.substring(0, 2).toUpperCase();
        }
    } else {
        logoutBtn?.classList.add('hidden');
        loginBtn?.classList.remove('hidden');
        document.getElementById('profile-name').innerText = "Guest User";
        document.getElementById('profile-avatar').innerHTML = "--";
    }

    if (window.AcadState && window.AcadState.assignments) {
        document.getElementById('prof-stat-tasks-active').innerText = window.AcadState.assignments.filter(a => a.status === 'in_progress' || a.status === 'not_started').length;
        document.getElementById('prof-stat-tasks-total').innerText = window.AcadState.assignments.length;
    }
    
    let activeNotes = [];
    if (typeof localNotes !== 'undefined') {
        activeNotes = localNotes;
    } else {
        try {
            activeNotes = JSON.parse(localStorage.getItem('rz_notes_data')) || []; 
        } catch(e) {}
    }
    
    document.getElementById('prof-stat-notes').innerText = activeNotes.length;
    const notesGrid = document.getElementById('profile-notes-grid');
    
    if (activeNotes.length > 0) {
        let recentNotes = [...activeNotes].sort((a,b) => b.lastModified - a.lastModified).slice(0, 6);
        notesGrid.innerHTML = recentNotes.map(n => `
            <div class="calc-card" onclick="switchView('notes');" style="min-width: 200px;">
                <h3 style="color: var(--text-main); font-size: 1.1rem;">${n.title || 'Untitled Note'}</h3>
                <div class="meta" style="margin-bottom: 0;">Modified: ${new Date(n.lastModified).toLocaleDateString()}</div>
            </div>
        `).join('');
    } else {
        notesGrid.innerHTML = '<p class="text-muted">No notes found.</p>';
    }

    const calcsGrid = document.getElementById('profile-calcs-grid');
    if (currentUser) {
        const { data } = await supabaseClient.from('calculators').select('id, title, created_at').eq('owner_id', currentUser.id).order('created_at', { ascending: false }).limit(6);
        document.getElementById('prof-stat-calcs').innerText = data ? data.length : 0;
        
        if (data && data.length > 0) {
            calcsGrid.innerHTML = data.map(calc => `
                <div class="calc-card" onclick="window.location.href='?id=${calc.id}'" style="min-width: 250px;">
                    <h3>${calc.title}</h3>
                    <div class="meta">Added: ${new Date(calc.created_at).toLocaleDateString()}</div>
                    <button class="btn secondary" style="width: 100%;">Open</button>
                </div>
            `).join('');
        } else {
            calcsGrid.innerHTML = '<p class="text-muted">No calculators found.</p>';
        }
    } else {
        calcsGrid.innerHTML = '<p class="text-muted">Log in to view your templates.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.route-calc').forEach(el => el.addEventListener('click', () => switchView('explore')));
    document.querySelectorAll('.route-assignments').forEach(el => el.addEventListener('click', () => switchView('assignments')));
    document.querySelectorAll('.route-calendar').forEach(el => el.addEventListener('click', () => switchView('calendar')));
    document.querySelectorAll('.route-notes').forEach(el => el.addEventListener('click', () => switchView('notes')));
    document.querySelectorAll('.route-profile').forEach(el => el.addEventListener('click', () => switchView('profile')));
    
    document.querySelectorAll('.trigger-theme-modal').forEach(el => el.addEventListener('click', () => {
        document.getElementById('theme-modal').classList.remove('hidden');
    }));
    
    // Bind Mobile Hamburger Sidebar Triggers
    document.getElementById('mobile-sidebar-toggle')?.addEventListener('click', toggleMobileSidebar);
    document.getElementById('mobile-sidebar-backdrop')?.addEventListener('click', toggleMobileSidebar);

    document.getElementById('logout-btn-profile')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    if (!new URLSearchParams(window.location.search).get('id')) {
        switchView('assignments');
    }
});