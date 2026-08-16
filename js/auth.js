let currentUser = null;
let currentProfile = null;

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-btn').innerText = "Profile";
        await fetchProfile();
    } else {
        currentUser = null;
        currentProfile = null;
        document.getElementById('auth-btn').innerText = "Log In";
    }
}

async function fetchProfile() {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        currentProfile = data;
        const profileDisplay = document.getElementById('profile-username-display');
        if (profileDisplay) profileDisplay.innerText = '@' + data.username;
    } else {
        document.getElementById('username-modal').classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    
    // Auth Button - either open Log In or open Profile
    document.getElementById('auth-btn').addEventListener('click', async () => {
        if (currentUser) {
            document.getElementById('profile-modal').classList.remove('hidden');
        } else {
            document.getElementById('auth-modal').classList.remove('hidden');
        }
    });

    // Actual Logout Button inside the Profile Modal
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        window.location.reload();
    });

    const getRedirectUrl = () => {
        return window.location.origin + window.location.pathname;
    };

    document.getElementById('login-google').addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ 
            provider: 'google',
            options: { redirectTo: getRedirectUrl() }
        });
    });

    document.getElementById('login-discord').addEventListener('click', () => {
        supabaseClient.auth.signInWithOAuth({ 
            provider: 'discord',
            options: { redirectTo: getRedirectUrl() }
        });
    });

    document.getElementById('save-username-btn').addEventListener('click', async () => {
        const input = document.getElementById('username-input').value.trim();
        if (input.length < 3) return alert('Username must be at least 3 characters.');
        
        const { error } = await supabaseClient.from('profiles').insert([{ id: currentUser.id, username: input }]);
        
        if (error) {
            console.error("Supabase Insert Error:", error);
            if (error.code === '23505') {
                alert("This username is already taken. Please try another.");
            } else {
                alert("Database Error: " + error.message);
            }
        } else {
            document.getElementById('username-modal').classList.add('hidden');
            await fetchProfile();
        }
    });
});

checkUser();