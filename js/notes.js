// --- RICH NOTES & LOCAL SYNC ENGINE ---
let localNotes = [];
let activeNoteEditor = null;
let currentNotesContext = { type: 'root', id: null }; // root | term | subject | assignment
let isOnline = navigator.onLine;

window.addEventListener('online', () => {
    isOnline = true;
    document.getElementById('notes-sync-status').innerText = 'Syncing...';
    syncNotesWithServer();
});
window.addEventListener('offline', () => {
    isOnline = false;
    document.getElementById('notes-sync-status').innerText = 'Offline (Local mode)';
});

// Initialize on App Load
async function initNotes() {
    if (!currentUser) return;
    
    // Load local cache
    const cached = localStorage.getItem(`notes_cache_${currentUser.id}`);
    if (cached) localNotes = JSON.parse(cached);
    
    // Initialize the Markdown Engine
    if (!activeNoteEditor) {
        activeNoteEditor = new EasyMDE({
            element: document.getElementById('note-mde-editor'),
            spellChecker: false,
            autosave: {
                enabled: true,
                uniqueId: "note-temp-autosave",
                delay: 5000,
            },
            previewRender: function(plainText, preview) {
                // Async KaTeX rendering pipeline
                setTimeout(() => {
                    preview.innerHTML = marked.parse(plainText);
                    renderMathInElement(preview, {
                        delimiters: [
                            {left: "$$", right: "$$", display: true},
                            {left: "$", right: "$", display: false}
                        ]
                    });
                }, 0);
                return "Rendering preview...";
            }
        });

        // Event Listeners for Editor
        document.getElementById('save-note-content-btn').addEventListener('click', saveActiveNote);
        document.getElementById('back-to-notes-btn').addEventListener('click', closeEditor);
        document.getElementById('new-note-btn').addEventListener('click', () => openEditor());
        document.getElementById('delete-note-btn').addEventListener('click', deleteActiveNote);
    }
    
    if (isOnline) await syncNotesWithServer();
    window.updateNotesTree();
}

window.updateNotesTree = function() {
    if (!window.AcadState) return;
    const tree = document.getElementById('notes-tree');
    if (!tree) return;
    
    let html = `<div class="tree-node ${currentNotesContext.type==='root'?'active':''}" onclick="setNotesContext('root', null)">📁 All Notes</div>`;
    
    window.AcadState.terms.forEach(term => {
        html += `<div class="tree-node ${currentNotesContext.id===term.id?'active':''}" onclick="setNotesContext('term', '${term.id}')" style="margin-left:5px;">↳ 📅 ${term.name}</div>`;
        
        window.AcadState.subjects.filter(s => s.term_id === term.id).forEach(sub => {
            html += `<div class="tree-node ${currentNotesContext.id===sub.id?'active':''}" onclick="setNotesContext('subject', '${sub.id}')" style="margin-left:20px;">↳ ${window.renderSubjectIcon(sub.icon)} ${sub.code}</div>`;
            
            window.AcadState.assignments.filter(a => a.subject_id === sub.id).forEach(task => {
                html += `<div class="tree-node ${currentNotesContext.id===task.id?'active':''}" onclick="setNotesContext('assignment', '${task.id}')" style="margin-left:40px; font-size:0.75rem;">↳ 📝 ${task.title}</div>`;
            });
        });
    });
    
    tree.innerHTML = html;
    renderNotesList();
};

window.setNotesContext = function(type, id) {
    currentNotesContext = { type, id };
    window.updateNotesTree();
};

function renderNotesList() {
    const container = document.getElementById('notes-list-container');
    const title = document.getElementById('notes-context-title');
    
    let filtered = localNotes;
    if (currentNotesContext.type === 'term') {
        title.innerText = window.AcadState.terms.find(t=>t.id===currentNotesContext.id)?.name + " Notes";
        filtered = localNotes.filter(n => n.term_id === currentNotesContext.id && !n.subject_id && !n.assignment_id);
    } else if (currentNotesContext.type === 'subject') {
        title.innerText = window.AcadState.subjects.find(s=>s.id===currentNotesContext.id)?.code + " Notes";
        filtered = localNotes.filter(n => n.subject_id === currentNotesContext.id && !n.assignment_id);
    } else if (currentNotesContext.type === 'assignment') {
        title.innerText = window.AcadState.assignments.find(a=>a.id===currentNotesContext.id)?.title + " Notes";
        filtered = localNotes.filter(n => n.assignment_id === currentNotesContext.id);
    } else {
        title.innerText = "All Notes";
    }

    filtered.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));

    if (filtered.length === 0) {
        container.innerHTML = '<p class="text-muted" style="grid-column:1/-1;">No notes in this folder. Click + New Note to create one.</p>';
        return;
    }

    container.innerHTML = filtered.map(n => `
        <div class="note-card" onclick="openEditor('${n.id}')">
            <h4 style="margin-bottom:0.25rem;">${n.title || 'Untitled Note'}</h4>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">${new Date(n.updated_at).toLocaleDateString()}</div>
            <p style="font-size:0.8rem; color:var(--text-muted); overflow:hidden; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical;">
                ${n.content ? n.content.replace(/[#_*\[\]]/g, '').slice(0, 100) : 'Empty note...'}
            </p>
        </div>
    `).join('');
}

let activeNoteId = null;

function openEditor(noteId = null) {
    document.getElementById('notes-list-pane').classList.add('hidden');
    document.getElementById('note-editor-pane').classList.remove('hidden');
    
    if (noteId) {
        const note = localNotes.find(n => n.id === noteId);
        activeNoteId = note.id;
        document.getElementById('note-title-input').value = note.title;
        activeNoteEditor.value(note.content || '');
        document.getElementById('delete-note-btn').classList.remove('hidden');
    } else {
        activeNoteId = null;
        document.getElementById('note-title-input').value = '';
        activeNoteEditor.value('');
        document.getElementById('delete-note-btn').classList.add('hidden');
    }
}

function closeEditor() {
    document.getElementById('note-editor-pane').classList.add('hidden');
    document.getElementById('notes-list-pane').classList.remove('hidden');
    renderNotesList();
}

async function saveActiveNote() {
    const title = document.getElementById('note-title-input').value.trim() || 'Untitled Note';
    const content = activeNoteEditor.value();
    
    let note = null;
    if (activeNoteId) {
        note = localNotes.find(n => n.id === activeNoteId);
        note.title = title;
        note.content = content;
        note.updated_at = new Date().toISOString();
        note._isDirty = true;
    } else {
        note = {
            id: generateId(),
            user_id: currentUser.id,
            title: title,
            content: content,
            term_id: currentNotesContext.type === 'term' ? currentNotesContext.id : (currentNotesContext.type !== 'root' ? window.AcadState.activeTerm.id : null),
            subject_id: currentNotesContext.type === 'subject' ? currentNotesContext.id : (currentNotesContext.type === 'assignment' ? window.AcadState.assignments.find(a=>a.id===currentNotesContext.id).subject_id : null),
            assignment_id: currentNotesContext.type === 'assignment' ? currentNotesContext.id : null,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            _isDirty: true
        };
        localNotes.push(note);
        activeNoteId = note.id;
        document.getElementById('delete-note-btn').classList.remove('hidden');
    }
    
    localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes));
    
    if (isOnline) {
        await syncNotesWithServer();
    } else {
        document.getElementById('notes-sync-status').innerText = 'Saved Locally (Offline)';
    }
}

async function deleteActiveNote() {
    if(!activeNoteId || !confirm("Delete this note?")) return;
    
    localNotes = localNotes.filter(n => n.id !== activeNoteId);
    localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes));
    
    if (isOnline && !activeNoteId.startsWith('temp_')) {
        await supabaseClient.from('notes').delete().eq('id', activeNoteId);
    }
    
    closeEditor();
}

async function syncNotesWithServer() {
    if (!isOnline) return;
    
    // 1. Push dirty local notes to cloud
    const dirtyNotes = localNotes.filter(n => n._isDirty);
    if (dirtyNotes.length > 0) {
        const uploadPayload = dirtyNotes.map(n => {
            let clean = {...n};
            delete clean._isDirty;
            // Ensure IDs are valid UUIDs for Supabase if generating locally. 
            // Note: Since generateId() returns short strings, in a true production environment 
            // you should use uuidv4. Supabase will handle this on insert if we omit ID.
            if (clean.id.length < 15) delete clean.id; 
            return clean;
        });
        
        await supabaseClient.from('notes').upsert(uploadPayload);
    }
    
    // 2. Pull fresh data from cloud
    const { data: remoteNotes, error } = await supabaseClient.from('notes').select('*').eq('user_id', currentUser.id);
    if (!error && remoteNotes) {
        localNotes = remoteNotes.map(n => ({...n, _isDirty: false}));
        localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes));
    }
    
    document.getElementById('notes-sync-status').innerText = 'Synced';
    renderNotesList();
}