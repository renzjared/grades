let currentUser = null;
let currentProfile = null;

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        currentUser = user;
        document.getElementById('auth-btn').innerText = "Profile";
        document.getElementById('nav-assignments-btn').classList.remove('hidden');
        await fetchProfile();
    } else {
        currentUser = null;
        currentProfile = null;
        document.getElementById('auth-btn').innerText = "Log In";
        document.getElementById('nav-assignments-btn').classList.add('hidden');
    }
}

async function fetchProfile() {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        currentProfile = data;
    } else {
        // Needs a username
        document.getElementById('username-modal').classList.remove('hidden');
    }
}

document.getElementById('auth-btn').addEventListener('click', async () => {
    if (currentUser) {
        // Logout
        await supabaseClient.auth.signOut();
        window.location.reload();
    } else {
        document.getElementById('auth-modal').classList.remove('hidden');
    }
});

document.getElementById('login-google').addEventListener('click', () => {
    supabaseClient.auth.signInWithOAuth({ provider: 'google' });
});

document.getElementById('login-discord').addEventListener('click', () => {
    supabaseClient.auth.signInWithOAuth({ provider: 'discord' });
});

document.getElementById('save-username-btn').addEventListener('click', async () => {
    const input = document.getElementById('username-input').value.trim();
    if (input.length < 3) return alert('Username must be at least 3 characters.');
    
    const { error } = await supabaseClient.from('profiles').insert([{ id: currentUser.id, username: input }]);
    if (error) {
        alert("Username might be taken, try another.");
    } else {
        document.getElementById('username-modal').classList.add('hidden');
        await fetchProfile();
    }
});

// Run on load
checkUser();