let currentUser = null;

async function checkUser() {
    const { data: authData } = await supabaseClient.auth.getUser();
    currentUser = authData?.user || null;
    
    if (typeof populateProfileStats === 'function') {
        populateProfileStats();
    }

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
        
        // If they just logged in and aren't viewing a specific calculator, send to assignments
        if (!new URLSearchParams(window.location.search).get('id')) {
            if (typeof switchView === 'function') switchView('assignments');
        }
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const getRedirectUrl = () => {
        return window.location.origin + window.location.pathname;
    };

    // Safely bind OAuth buttons using Optional Chaining (?.) so missing IDs never crash the app
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