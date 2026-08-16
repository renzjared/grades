document.getElementById('share-btn').addEventListener('click', async () => {
    if (!currentUser) return document.getElementById('auth-modal').classList.remove('hidden');
    
    const btn = document.getElementById('share-btn');
    btn.innerText = "Saving...";

    // 1. Prepare save state
    const shareState = JSON.parse(JSON.stringify(appState));
    shareState.isEditMode = false;
    shareState.showBreakdown = false;
    shareState.targetGradePercent = null; 
    shareState.ignoreBlanks = false;
    shareState.categories.forEach(cat => cat.components.forEach(comp => { comp.score = null; comp.extraPoints = null; }));

    // 2. Save or Update DB Template
    let templateId = currentCalculatorId;
    
    // If not saved yet, save it
    if (!templateId || hasTemplateChanged()) {
        const { data, error } = await supabaseClient.from('calculators')
            .insert([{ 
                title: shareState.subject, 
                config: shareState, 
                owner_id: currentUser.id,
                link_sharing_mode: 'restricted'
            }]).select();
            
        if (error) return alert("Error saving.");
        templateId = data[0].id;
        window.history.replaceState(null, null, '?id=' + templateId);
        currentCalculatorId = templateId;
        originalTemplateState = JSON.parse(JSON.stringify(shareState)); 
    }

    // 3. Open Modal
    document.getElementById('sharing-modal').classList.remove('hidden');
    document.getElementById('modal-share-url').value = window.location.origin + window.location.pathname + '?id=' + templateId;
    loadPermissions(templateId);
    
    btn.innerText = "Share / Permissions";
});

async function loadPermissions(calcId) {
    const list = document.getElementById('people-list');
    list.innerHTML = 'Loading...';
    
    // Get Calc Info
    const { data: calc } = await supabaseClient.from('calculators').select('owner_id, link_sharing_mode').eq('id', calcId).single();
    if (!calc) return;
    
    document.getElementById('link-sharing-mode').value = calc.link_sharing_mode || 'restricted';

    // Get specific user permissions
    const { data: perms } = await supabaseClient.from('calculator_permissions')
        .select('role, profiles(username)').eq('calculator_id', calcId);
        
    let html = '';
    if (perms) {
        perms.forEach(p => {
            html += `<div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.9rem;">
                <span>@${p.profiles.username}</span>
                <span style="color:var(--text-muted); text-transform:capitalize;">${p.role}</span>
            </div>`;
        });
    }
    list.innerHTML = html || '<span style="font-size:0.85rem; color:var(--text-muted);">No specific users added.</span>';
}

document.getElementById('share-add-btn').addEventListener('click', async () => {
    const un = document.getElementById('share-add-username').value.trim();
    const role = document.getElementById('share-add-role').value;
    if(!un) return;

    // Find User
    const { data: user } = await supabaseClient.from('profiles').select('id').eq('username', un).single();
    if (!user) return alert("User not found.");

    // Add Perm
    await supabaseClient.from('calculator_permissions').upsert({
        calculator_id: currentCalculatorId,
        user_id: user.id,
        role: role
    });
    
    document.getElementById('share-add-username').value = '';
    loadPermissions(currentCalculatorId);
});

document.getElementById('link-sharing-mode').addEventListener('change', async (e) => {
    await supabaseClient.from('calculators').update({ link_sharing_mode: e.target.value }).eq('id', currentCalculatorId);
});

document.getElementById('modal-copy-btn').addEventListener('click', () => {
    const urlInput = document.getElementById('modal-share-url');
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    document.getElementById('modal-copy-btn').innerText = "Copied!";
    setTimeout(() => document.getElementById('modal-copy-btn').innerText = "Copy Link", 2000);
});