let currentUser = null;

// INTERCEPTOR: Snatch the refresh token directly from the URL before Supabase clears it
const rawHashParams = new URLSearchParams(window.location.hash.substring(1));
const capturedRefreshToken = rawHashParams.get('provider_refresh_token');

if (capturedRefreshToken) {
    console.log("Interceptor successfully caught the Google refresh token!");
}

async function updateClassroomLinkStatus() {
    const emailDisplay = document.getElementById('classroom-linked-email');
    const linkBtn = document.getElementById('link-google-btn');
    const unlinkBtn = document.getElementById('unlink-google-btn');
    const manualSyncBtn = document.getElementById('manual-sync-btn');
    
    if (!currentUser) {
        if (emailDisplay) emailDisplay.innerText = 'Not logged in';
        return;
    }

    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error || !user) return;
    
    const googleIdentity = user.identities?.find(id => id.provider === 'google');

    if (emailDisplay && linkBtn && unlinkBtn) {
        if (googleIdentity) {
            emailDisplay.innerText = `Linked: ${googleIdentity.identity_data?.email || 'Google Account'}`;
            linkBtn.classList.add('hidden');
            unlinkBtn.classList.remove('hidden');
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

    if (!new URLSearchParams(window.location.search).get('id')) {
        if (typeof switchView === 'function') switchView('assignments');
    }
}

// Automatically catch OAuth tokens in the URL redirect and establish the session
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        currentUser = session?.user || null;
        document.getElementById('auth-modal')?.classList.add('hidden');
        
        // USE THE INTERCEPTED TOKEN INSTEAD OF RELYING ON SUPABASE
        const tokenToSave = capturedRefreshToken || session?.provider_refresh_token;

        if (tokenToSave) {
            console.log("Sending token to secure vault...");
            const googleIdentity = session.user?.identities?.find(id => id.provider === 'google');
            
            await supabaseClient.functions.invoke('classroom-sync', {
                body: { 
                    action: 'save_token', 
                    refresh_token: tokenToSave,
                    email: googleIdentity?.identity_data?.email || null
                }
            }).catch(err => console.error("Vault save error:", err));
        }

        if (typeof populateProfileStats === 'function') populateProfileStats();
        updateClassroomLinkStatus();
        
        if (!new URLSearchParams(window.location.search).get('id')) {
            if (typeof switchView === 'function') switchView('assignments');
        }

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
                    'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
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
        if (!confirm("Are you sure you want to unlink your Google Classroom account? You will lose syncing capabilities.")) return;

        const btn = e.target;
        btn.innerText = "Unlinking...";
        btn.disabled = true;

        // Correctly extract the 'identities' array out of the 'data' object
        const { data, error: idError } = await supabaseClient.auth.getUserIdentities();
        
        if (idError || !data || !data.identities) {
            alert("Error fetching account identities.");
            btn.innerText = "Unlink";
            btn.disabled = false;
            return;
        }
        
        // Find the full Google identity object
        const googleIdentity = data.identities.find(id => id.provider === 'google');
        
        if (!googleIdentity) {
            alert("No Google identity found.");
            btn.innerText = "Unlink";
            btn.disabled = false;
            return;
        }

        // Pass the entire identity object to Supabase
        const { error } = await supabaseClient.auth.unlinkIdentity(googleIdentity);
        
        if (error) {
            if (error.message.includes("requires at least one identity")) {
                alert("You cannot unlink your primary login method. If you signed in directly with Google, it must remain linked.");
            } else {
                alert("Error unlinking account: " + error.message);
            }
        } else {
            // Wipe stored tokens on successful unlink
            localStorage.removeItem('gc_access_token');
            localStorage.removeItem('gc_refresh_token');
            
            await updateClassroomLinkStatus();
        }
        btn.innerText = "Unlink";
        btn.disabled = false;
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