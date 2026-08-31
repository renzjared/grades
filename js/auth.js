let currentUser = null;

async function checkUser() {
    const { data: authData } = await supabaseClient.auth.getUser();
    currentUser = authData?.user || null;
    
    // Safely update the Profile UI if the user is logged in
    if (typeof populateProfileStats === 'function') {
        populateProfileStats();
    }
}

// Automatically catch OAuth tokens in the URL redirect and establish the session
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        currentUser = session?.user || null;
        
        // Hide the modal instantly upon successful redirect
        document.getElementById('auth-modal')?.classList.add('hidden');
        
        // Refresh the profile stats and avatar
        if (typeof populateProfileStats === 'function') populateProfileStats();
    } else if (event === 'SIGNED_OUT') {
        currentUser = null;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const getRedirectUrl = () => {
        // Ensures Supabase redirects exactly to where you currently are (e.g. localhost:5500)
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

    // Optional Username setup logic
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

    // Run initial auth check
    checkUser();
});
