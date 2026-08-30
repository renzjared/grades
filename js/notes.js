// --- RICH NOTES & LOCAL SYNC ENGINE ---
let localNotes = [];
let activeNoteEditor = null;
let currentNotesContext = { type: 'root', id: null }; 
let isOnline = navigator.onLine;
let currentFormat = 'md'; // md, latex, typst

// Typst WASM State
let typstRenderer = null;
let isTypstLoading = false;

window.addEventListener('online', () => {
    isOnline = true;
    document.getElementById('notes-sync-status').innerText = 'Syncing...';
    syncNotesWithServer();
});
window.addEventListener('offline', () => {
    isOnline = false;
    document.getElementById('notes-sync-status').innerText = 'Offline (Local mode)';
});

async function initNotes() {
    if (!currentUser) return;
    
    const cached = localStorage.getItem(`notes_cache_${currentUser.id}`);
    if (cached) localNotes = JSON.parse(cached);
    
    if (!activeNoteEditor) {
        activeNoteEditor = new EasyMDE({
            element: document.getElementById('note-mde-editor'),
            spellChecker: false,
            status: false,
            autosave: { enabled: true, uniqueId: "note-temp-autosave", delay: 5000 },
        });

        // Custom Live Side-By-Side Preview Rendering
        activeNoteEditor.codemirror.on("change", updateLivePreview);

        document.getElementById('save-note-content-btn').addEventListener('click', saveActiveNote);
        document.getElementById('back-to-notes-btn').addEventListener('click', closeEditor);
        document.getElementById('new-note-btn').addEventListener('click', () => openEditor());
        document.getElementById('delete-note-btn').addEventListener('click', deleteActiveNote);

        // Format Toggles
        document.getElementById('fmt-md').addEventListener('click', () => setFormat('md'));
        document.getElementById('fmt-latex').addEventListener('click', () => setFormat('latex'));
        document.getElementById('fmt-typst').addEventListener('click', () => setFormat('typst'));
    }
    
    if (isOnline) await syncNotesWithServer();
    window.updateNotesTree();
}

function setFormat(fmt) {
    currentFormat = fmt;
    document.querySelectorAll('.format-toggles button').forEach(b => b.classList.remove('active-format'));
    document.getElementById(`fmt-${fmt}`).classList.add('active-format');
    updateLivePreview();
}

function updateLivePreview() {
    const raw = activeNoteEditor.value();
    const pane = document.getElementById('custom-preview-pane');
    
    if (!raw.trim()) {
        pane.innerHTML = `<div class="text-muted" style="text-align: center; margin-top: 2rem;">Start typing to see preview...</div>`;
        return;
    }

    if (currentFormat === 'md') {
        pane.innerHTML = marked.parse(raw);
        renderMathInElement(pane, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "$", right: "$", display: false}
            ],
            throwOnError: false
        });
    } else if (currentFormat === 'latex') {
        try {
            // The LaTeX tab treats the entire box as a math environment.
            // We automatically strip leading/trailing $ signs so KaTeX doesn't throw a red syntax error!
            let mathString = raw.trim().replace(/(^\$\$?)|(\$\$?$)/g, '');
            pane.innerHTML = katex.renderToString(mathString, { displayMode: true, throwOnError: false });
        } catch (e) {
            pane.innerHTML = `<span style="color:red; font-family: monospace;">LaTeX Error: ${e.message}</span>`;
        }
    } else if (currentFormat === 'typst') {
        renderTypstPreview(raw, pane);
    }
}

async function renderTypstPreview(raw, pane) {
    if (!typstRenderer && !isTypstLoading) {
        isTypstLoading = true;
        pane.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:2rem;">Downloading Typst Compiler (WASM)...</div>';
        try {
            const module = await import('https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts/dist/esm/main.js');
            typstRenderer = module.$typst;
            await typstRenderer.setCompilerInitOptions({
                getModule: () => 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts/dist/wasm/typst_ts_web_compiler_bg.wasm'
            });
            await typstRenderer.setRendererInitOptions({
                getModule: () => 'https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts/dist/wasm/typst_ts_renderer_bg.wasm'
            });
            isTypstLoading = false;
        } catch (e) {
            pane.innerHTML = `<span style="color:red; font-family: monospace;">Typst Init Error: ${e.message || e}</span>`;
            isTypstLoading = false;
            return;
        }
    } else if (isTypstLoading) {
        pane.innerHTML = '<div style="color:var(--text-muted); text-align:center; margin-top:2rem;">Compiling Typst...</div>';
        return;
    }

    try {
        const svg = await typstRenderer.svg({ mainContent: raw });
        pane.innerHTML = svg;
    } catch (e) {
        pane.innerHTML = `<div style="color:#e53e3e; font-family: monospace; padding: 1rem; background: rgba(229,62,62,0.1); border-radius: 4px;">Typst Compile Error:<br>${e}</div>`;
    }
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
    updateLivePreview();
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
            id: Math.random().toString(36).substr(2, 9),
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
    
    if (isOnline && activeNoteId.length > 15) { 
        await supabaseClient.from('notes').delete().eq('id', activeNoteId);
    }
    
    closeEditor();
}

async function syncNotesWithServer() {
    if (!isOnline) return;
    
    const dirtyNotes = localNotes.filter(n => n._isDirty);
    if (dirtyNotes.length > 0) {
        const uploadPayload = dirtyNotes.map(n => {
            let clean = {...n};
            delete clean._isDirty;
            if (clean.id.length < 15) delete clean.id; 
            return clean;
        });
        
        await supabaseClient.from('notes').upsert(uploadPayload);
    }
    
    const { data: remoteNotes, error } = await supabaseClient.from('notes').select('*').eq('user_id', currentUser.id);
    if (!error && remoteNotes) {
        localNotes = remoteNotes.map(n => ({...n, _isDirty: false}));
        localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes));
    }
    
    document.getElementById('notes-sync-status').innerText = 'Synced';
    renderNotesList();
}