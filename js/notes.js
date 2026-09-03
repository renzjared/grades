// --- RICH NOTES & LOCAL SYNC ENGINE ---
let localNotes = [];
let activeNoteEditor = null;
let isOnline = navigator.onLine;
let currentFormat = 'md'; // md, latex, typst

// Persistent State for Sidebar Tree and Context
let currentNotesContext = JSON.parse(localStorage.getItem('acad_notes_active')) || { type: 'root', id: null };
let expandedNoteFolders = new Set(JSON.parse(localStorage.getItem('acad_notes_expanded') || '[]'));

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

        activeNoteEditor.codemirror.on("change", updateLivePreview);

        document.getElementById('save-note-content-btn').addEventListener('click', saveActiveNote);
        document.getElementById('back-to-notes-btn').addEventListener('click', closeEditor);
        document.getElementById('new-note-btn').addEventListener('click', () => openEditor());
        document.getElementById('delete-note-btn').addEventListener('click', deleteActiveNote);

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

window.toggleNoteFolder = function(folderKey, event) {
    if (event) event.stopPropagation();
    if (expandedNoteFolders.has(folderKey)) {
        expandedNoteFolders.delete(folderKey);
    } else {
        expandedNoteFolders.add(folderKey);
    }
    localStorage.setItem('acad_notes_expanded', JSON.stringify([...expandedNoteFolders]));
    window.updateNotesTree();
};

window.setNotesContext = function(type, id) {
    currentNotesContext = { type, id };
    localStorage.setItem('acad_notes_active', JSON.stringify(currentNotesContext));
    
    // Auto-expand the folder being navigated to
    if (type === 'term') expandedNoteFolders.add(`term_${id}`);
    if (type === 'subject') expandedNoteFolders.add(`sub_${id}`);
    localStorage.setItem('acad_notes_expanded', JSON.stringify([...expandedNoteFolders]));
    
    window.updateNotesTree();
};

window.updateNotesTree = function() {
    if (!window.AcadState) return;
    const tree = document.getElementById('notes-tree');
    if (!tree) return;
    
    const sortAlpha = (arr, key) => [...arr].sort((a, b) => (a[key] || '').localeCompare(b[key] || ''));
    
    let html = `
    <div style="padding-left: 0px; margin-bottom: 2px;">
        <div style="display: flex; align-items: center; padding: 4px; border-radius: 4px; background: ${currentNotesContext.type === 'root' ? 'var(--input-bg)' : 'transparent'}; cursor: pointer;">
            <span style="width: 20px;"></span>
            <span onclick="setNotesContext('root', null)" style="flex: 1; font-weight: ${currentNotesContext.type === 'root' ? '600' : '400'}; color: ${currentNotesContext.type === 'root' ? 'var(--text-main)' : 'var(--text-muted)'};">
                📁 Root
            </span>
        </div>
    </div>`;
    
    const terms = sortAlpha(window.AcadState.terms, 'name');
    terms.forEach(term => {
        const isExpandedTerm = expandedNoteFolders.has(`term_${term.id}`);
        const caretTerm = isExpandedTerm ? '▼' : '▶';
        const isActiveTerm = currentNotesContext.id === term.id;
        
        html += `
        <div style="padding-left: 10px; margin-bottom: 2px;">
            <div style="display: flex; align-items: center; padding: 4px; border-radius: 4px; background: ${isActiveTerm ? 'var(--input-bg)' : 'transparent'}; cursor: pointer;">
                <span onclick="toggleNoteFolder('term_${term.id}', event)" style="width: 20px; text-align: center; color: var(--text-muted); font-size: 0.75rem;">${caretTerm}</span>
                <span onclick="setNotesContext('term', '${term.id}')" style="flex: 1; font-weight: ${isActiveTerm ? '600' : '400'}; color: ${isActiveTerm ? 'var(--text-main)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    📅 ${term.name}
                </span>
            </div>
            <div style="display: ${isExpandedTerm ? 'block' : 'none'};">`;
        
        const subjects = sortAlpha(window.AcadState.subjects.filter(s => s.term_id === term.id), 'code');
        subjects.forEach(sub => {
            const isExpandedSub = expandedNoteFolders.has(`sub_${sub.id}`);
            const caretSub = isExpandedSub ? '▼' : '▶';
            const isActiveSub = currentNotesContext.id === sub.id;
            
            html += `
                <div style="padding-left: 15px; margin-bottom: 2px;">
                    <div style="display: flex; align-items: center; padding: 4px; border-radius: 4px; background: ${isActiveSub ? 'var(--input-bg)' : 'transparent'}; cursor: pointer;">
                        <span onclick="toggleNoteFolder('sub_${sub.id}', event)" style="width: 20px; text-align: center; color: var(--text-muted); font-size: 0.75rem;">${caretSub}</span>
                        <span onclick="setNotesContext('subject', '${sub.id}')" style="flex: 1; font-weight: ${isActiveSub ? '600' : '400'}; color: ${isActiveSub ? 'var(--text-main)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${window.renderSubjectIcon(sub.icon)} ${sub.code}
                        </span>
                    </div>
                    <div style="display: ${isExpandedSub ? 'block' : 'none'};">`;
            
            const tasks = sortAlpha(window.AcadState.assignments.filter(a => a.subject_id === sub.id), 'title');
            tasks.forEach(task => {
                const isActiveTask = currentNotesContext.id === task.id;
                html += `
                        <div style="padding-left: 25px; margin-bottom: 2px;">
                            <div style="display: flex; align-items: center; padding: 4px; border-radius: 4px; background: ${isActiveTask ? 'var(--input-bg)' : 'transparent'}; cursor: pointer;">
                                <span style="width: 20px;"></span>
                                <span onclick="setNotesContext('assignment', '${task.id}')" style="flex: 1; font-size: 0.85rem; font-weight: ${isActiveTask ? '600' : '400'}; color: ${isActiveTask ? 'var(--text-main)' : 'var(--text-muted)'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    📝 ${task.title}
                                </span>
                            </div>
                        </div>`;
            });
            
            html += `</div></div>`;
        });
        
        html += `</div></div>`;
    });
    
    tree.innerHTML = html;
    ensureAndRenderBreadcrumbs();
    renderNotesList();
};

function ensureAndRenderBreadcrumbs() {
    const titleEl = document.getElementById('notes-context-title');
    if (!titleEl) return;
    
    let breadcrumbContainer = document.getElementById('notes-breadcrumbs');
    if (!breadcrumbContainer) {
        breadcrumbContainer = document.createElement('div');
        breadcrumbContainer.id = 'notes-breadcrumbs';
        breadcrumbContainer.style.cssText = 'font-size: 0.8rem; display: flex; align-items: center; flex-wrap: wrap; margin-top: 0.25rem;';
        
        // Wrap title and breadcrumbs dynamically to match the structural intent
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        
        titleEl.parentNode.insertBefore(wrapper, titleEl);
        wrapper.appendChild(titleEl);
        wrapper.appendChild(breadcrumbContainer);
        titleEl.style.margin = '0';
    }

    let path = [{ title: 'Root', type: 'root', id: null }];
    let mainTitle = 'All Notes';

    if (currentNotesContext.type !== 'root') {
        if (currentNotesContext.type === 'term') {
            const t = window.AcadState.terms.find(x => x.id === currentNotesContext.id);
            if (t) {
                path.push({ title: t.name, type: 'term', id: t.id });
                mainTitle = `${t.name} Notes`;
            }
        } else if (currentNotesContext.type === 'subject') {
            const s = window.AcadState.subjects.find(x => x.id === currentNotesContext.id);
            if (s) {
                const t = window.AcadState.terms.find(x => x.id === s.term_id);
                if (t) path.push({ title: t.name, type: 'term', id: t.id });
                path.push({ title: s.code, type: 'subject', id: s.id });
                mainTitle = `${s.code} Notes`;
            }
        } else if (currentNotesContext.type === 'assignment') {
            const a = window.AcadState.assignments.find(x => x.id === currentNotesContext.id);
            if (a) {
                const s = window.AcadState.subjects.find(x => x.id === a.subject_id);
                if (s) {
                    const t = window.AcadState.terms.find(x => x.id === s.term_id);
                    if (t) path.push({ title: t.name, type: 'term', id: t.id });
                    path.push({ title: s.code, type: 'subject', id: s.id });
                }
                path.push({ title: a.title, type: 'assignment', id: a.id });
                mainTitle = `${a.title} Notes`;
            }
        }
    }

    titleEl.innerText = mainTitle;
    breadcrumbContainer.innerHTML = path.map((p, idx) => {
        const isLast = idx === path.length - 1;
        if (isLast) return `<span style="color: var(--text-muted); font-weight: 500;">${p.title}</span>`;
        return `<span style="cursor: pointer; color: var(--up-maroon); font-weight: 600;" onclick="setNotesContext('${p.type}', ${p.id ? `'${p.id}'` : null})">${p.title}</span>`;
    }).join('<span style="margin: 0 6px; color: var(--text-muted); font-size: 0.65rem;">▶</span>');
}

function renderNotesList() {
    const container = document.getElementById('notes-list-container');
    
    // NEW: Safely exit if the DOM element isn't ready
    if (!container) return;
    
    let filtered = localNotes;
    if (currentNotesContext.type === 'term') {
        filtered = localNotes.filter(n => n.term_id === currentNotesContext.id && !n.subject_id && !n.assignment_id);
    } else if (currentNotesContext.type === 'subject') {
        filtered = localNotes.filter(n => n.subject_id === currentNotesContext.id && !n.assignment_id);
    } else if (currentNotesContext.type === 'assignment') {
        filtered = localNotes.filter(n => n.assignment_id === currentNotesContext.id);
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