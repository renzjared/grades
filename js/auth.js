let currentUser = null;

async function checkUser() {
    const { data: authData } = await supabaseClient.auth.getUser();
    currentUser = authData?.user;
    
    // Safely update the old auth modal button text if it exists
    const authBtn = document.getElementById('auth-btn');
    if (authBtn) {
        if (currentUser) {
            const nameStr = currentUser.user_metadata?.full_name || currentUser.user_metadata?.custom_claims?.global_name || currentUser.email.split('@')[0];
            authBtn.innerText = nameStr;
            authBtn.classList.remove('secondary');
            authBtn.classList.add('text-btn');
        } else {
            authBtn.innerText = "Log In";
            authBtn.classList.add('secondary');
            authBtn.classList.remove('text-btn');
        }
    }

    // Securely trigger the Profile Data pull in app.js
    if (typeof populateProfileStats === 'function') {
        populateProfileStats();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Top Right Nav Auth Button
    document.getElementById('auth-btn')?.addEventListener('click', () => {
        if (currentUser) {
            if (typeof switchView === 'function') switchView('profile');
        } else {
            document.getElementById('auth-modal')?.classList.remove('hidden');
        }
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    // OAuth Providers
    document.getElementById('login-google')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'google' });
    });
    
    document.getElementById('login-discord')?.addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ provider: 'discord' });
    });

    checkUser();
});