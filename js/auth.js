let currentUser = null;

async function updateClassroomLinkStatus() {
    const emailDisplay = document.getElementById('classroom-linked-email');
    const linkBtn = document.getElementById('link-google-btn');
    const unlinkBtn = document.getElementById('unlink-google-btn');
    const manualSyncBtn = document.getElementById('manual-sync-btn');
    
    if (!currentUser) {
        if (emailDisplay) emailDisplay.innerText = 'Not logged in';
        return;
    }

    // Fetch user explicitly to guarantee fresh identities array
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return;
    
    const googleIdentity = user.identities?.find(id => id.provider === 'google');

    if (emailDisplay && linkBtn && unlinkBtn) {
        if (googleIdentity) {
            emailDisplay.innerText = `Linked: ${googleIdentity.identity_data?.email || 'Google Account'}`;
            linkBtn.classList.add('hidden');
            unlinkBtn.classList.remove('hidden');
            unlinkBtn.dataset.identityId = googleIdentity.identity_id;
            if (manualSyncBtn) manualSyncBtn.disabled = false;
        } else {
            emailDisplay.innerText = 'Not linked';
            linkBtn.classList.remove('hidden');
            unlinkBtn.classList.add('hidden');
            if (manualSyncBtn) manualSyncBtn.disabled = true;
        }
    }
}

async function checkUser() {
    const { data: authData } = await supabaseClient.auth.getUser();
    currentUser = authData?.user || null;
    
    if (typeof populateProfileStats === 'function') {
        populateProfileStats();
    }
    
    await updateClassroomLinkStatus();

    // Delay default routing until we securely know the user's authentication status
    if (!new URLSearchParams(window.location.search).get('id')) {
        if (typeof switchView === 'function') switchView('assignments');
    }
}

// Automatically catch OAuth tokens in the URL redirect and establish the session
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        currentUser = session?.user || null;
        document.getElementById('auth-modal')?.classList.add('hidden');
        
        if (typeof populateProfileStats === 'function') populateProfileStats();
        updateClassroomLinkStatus();
        
        // If they just logged in and aren't viewing a specific calculator, send to assignments
        if (!new URLSearchParams(window.location.search).get('id')) {
            if (typeof switchView === 'function') switchView('assignments');
        }

        // Trigger silent background sync if Classroom is linked
        if (window.AcadState?.activeTerm && window.ClassroomSync) {
            window.ClassroomSync.syncAll(false);
        }
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const getRedirectUrl = () => {
        return window.location.origin + window.location.pathname;
    };

    document.getElementById('login-google')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ 
            provider: 'google',
            options: { redirectTo: getRedirectUrl() }
        });
    });

    document.getElementById('login-discord')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ 
            provider: 'discord',
            options: { redirectTo: getRedirectUrl() }
        });
    });

    // Identity Linking: Attach Google Classroom to current session
    document.getElementById('link-google-btn')?.addEventListener('click', async () => {
        const { error } = await supabaseClient.auth.linkIdentity({
            provider: 'google',
            options: {
                redirectTo: getRedirectUrl(),
                scopes: [
                    'https://www.googleapis.com/auth/classroom.courses.readonly',
                    'https://www.googleapis.com/auth/classroom.course-work.readonly',
                    'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
                    'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
                    'https://www.googleapis.com/auth/classroom.coursework.me',
                    'https://www.googleapis.com/auth/classroom.announcements.readonly',
                    'https://www.googleapis.com/auth/classroom.courses.readonly',
                    'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
                    'https://www.googleapis.com/auth/classroom.topics.readonly'
                ].join(' '),
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) alert("Error linking account: " + error.message);
    });

    // Identity Unlinking: Remove Google Classroom from current session
    document.getElementById('unlink-google-btn')?.addEventListener('click', async (e) => {
        const identityId = e.target.dataset.identityId;
        if (!identityId) return;
        
        if (!confirm("Are you sure you want to unlink your Google Classroom account? You will lose syncing capabilities.")) return;

        e.target.innerText = "Unlinking...";
        e.target.disabled = true;

        const { error } = await supabaseClient.auth.unlinkIdentity(identityId);
        
        if (error) {
            if (error.message.includes("requires at least one identity")) {
                alert("You cannot unlink your primary login method. If you signed in directly with Google, it must remain linked.");
            } else {
                alert("Error unlinking account: " + error.message);
            }
            e.target.innerText = "Unlink";
            e.target.disabled = false;
        } else {
            await updateClassroomLinkStatus();
            e.target.innerText = "Unlink";
            e.target.disabled = false;
        }
    });

    document.getElementById('save-username-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('username-input')?.value.trim();
        if (!input || input.length < 3) return alert('Username must be at least 3 characters.');
        
        const { error } = await supabaseClient.from('profiles').insert([{ id: currentUser.id, username: input }]);
        
        if (error) {
            console.error("Supabase Insert Error:", error);
            if (error.code === '23505') {
                alert("This username is already taken. Please try another.");
            } else {
                alert("Database Error: " + error.message);
            }
        } else {
            document.getElementById('username-modal')?.classList.add('hidden');
        }
    });

    // Start the auth lifecycle
    checkUser();
});