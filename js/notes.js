let localNotes = [];
let activeNoteId = null;
let currentFormat = 'visual';
let isOnline = navigator.onLine;
let typstRenderer = null;
let typstLoading = null;
let typstImportersReady = null;
let notesModalConfirm = null;
let selectedTable = null;
let wholeTableSelected = false;
let autosaveTimer = null;
let tableResizeState = null;
let savedVisualRange = null;
let notePaneResizeState = null;
let selectedEquation = null;
let emojiDatasetPromise = null;
const EMOJI_CATEGORY_ICONS = { 'Smileys & Emotion': 'face', 'People & Body': 'person', 'Animals & Nature': 'leaf', 'Food & Drink': 'food', 'Travel & Places': 'travel', Activities: 'activity', Objects: 'object', Symbols: 'symbol', Flags: 'flag', Other: 'other' };
const EMOJI_CATEGORY_ORDER = ['Smileys & Emotion', 'People & Body', 'Animals & Nature', 'Food & Drink', 'Travel & Places', 'Activities', 'Objects', 'Symbols', 'Flags', 'Other'];
const SPECIAL_CHARACTER_FOLDERS = {
    Math: ['+', '−', '±', '×', '÷', '=', '≠', '<', '>', '≤', '≥', '≈', '≡', '∼', '∞', '√', '∑', '∏', '∫', '∂', '∇', '∆', '∝', '∴', '∵', '∈', '∉', '⊂', '⊆', '⊃', '⊇', '∪', '∩', '∅', '∀', '∃', '¬', '∧', '∨', '⊕', '⊗', 'ℝ', 'ℤ', 'ℚ', 'ℕ', 'ℂ'],
    Greek: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'Α', 'Β', 'Γ', 'Δ', 'Ε', 'Ζ', 'Η', 'Θ', 'Ι', 'Κ', 'Λ', 'Μ', 'Ν', 'Ξ', 'Ο', 'Π', 'Ρ', 'Σ', 'Τ', 'Υ', 'Φ', 'Χ', 'Ψ', 'Ω'],
    Arrows: ['←', '→', '↑', '↓', '↔', '↕', '↗', '↘', '↙', '↖', '⇐', '⇒', '⇑', '⇓', '⇔', '⟵', '⟶', '⟷', '➜', '➝', '➞', '➤'],
    Sets: ['∅', '∈', '∉', '∋', '⊂', '⊃', '⊆', '⊇', '∪', '∩', '\u2206', 'ℝ', 'ℤ', 'ℚ', 'ℕ', 'ℂ', '𝒫', '𝔽'],
    Punctuation: ['©', '®', '™', '§', '¶', '†', '‡', '•', '…', '′', '″', '‰', '‱', '※', '⁂', '¡', '¿', '«', '»', '‹', '›', '—', '–', '·'],
    Currency: ['$','€','£','¥','₱','₩','₹','₽','₺','₴','₦','₫','₲','₡','₵','₸','₼','₾']
};
const EQUATION_TEMPLATES = {
    fraction: { label: 'Fraction', source: String.raw`\frac{a}{b}`, html: '<span class="equation-fraction"><span class="equation-slot">a</span><span class="equation-slot">b</span></span>' },
    mixed: { label: 'Mixed fraction', source: String.raw`2\frac{a}{b}`, html: '<span class="equation-mixed-whole equation-slot">2</span><span class="equation-fraction"><span class="equation-slot">a</span><span class="equation-slot">b</span></span>' },
    root: { label: 'Square root', source: String.raw`\sqrt{x}`, html: '<span class="equation-root"><span class="equation-slot">x</span></span>' },
    integral: { label: 'Integral', source: String.raw`\int_a^b f(x)\,dx`, html: '<span class="equation-integral"><span class="equation-slot equation-lower">a</span><span class="equation-slot equation-upper">b</span><span class="equation-slot equation-wide">f(x) dx</span></span>' },
    derivative: { label: 'Derivative', source: String.raw`\left[\frac{d}{dx}f(x)\right]`, html: '<span class="equation-bracket">[</span><span class="equation-derivative"><span class="equation-slot">d</span><span class="equation-slot">dx</span></span><span class="equation-slot equation-wide">f(x)</span><span class="equation-bracket">]</span>' },
    exponent: { label: 'Exponent', source: String.raw`x^{n}`, html: '<span class="equation-slot">x</span><sup class="equation-slot">n</sup>' },
    bar: { label: 'Bar', source: String.raw`\overline{x}`, html: '<span class="equation-bar equation-slot">x</span>' },
    underline: { label: 'Underline', source: String.raw`\underline{x}`, html: '<span class="equation-underline equation-slot">x</span>' },
    real: { label: 'Real numbers', source: String.raw`x\in\mathbb{R}`, html: '<span class="equation-slot">x</span> ∈ ℝ' },
    integers: { label: 'Integers', source: String.raw`z\in\mathbb{Z}`, html: '<span class="equation-slot">z</span> ∈ ℤ' },
    set: { label: 'Set notation', source: String.raw`\{x\mid x\in\mathbb{R}\}`, html: '{ <span class="equation-slot">x</span> | <span class="equation-slot equation-wide">x ∈ ℝ</span> }' }
};
let currentNotesContext = JSON.parse(localStorage.getItem('acad_notes_active') || '{"type":"root","id":null}');
let expandedNoteFolders = new Set(JSON.parse(localStorage.getItem('acad_notes_expanded') || '[]'));

const NOTE_FORMATS = {
    visual: { label: 'Visual', description: 'A rich document with inline formatting, tables, code, and equations.' },
    md: { label: 'Markdown', description: 'Markdown source with a rendered preview.' },
    latex: { label: 'LaTeX', description: 'LaTeX math and text rendered with KaTeX.' },
    typst: { label: 'Typst', description: 'Typst source compiled to SVG in the browser.' }
};

const NOTE_TEMPLATES = {
        latex: String.raw`\documentclass[12pt]{article}
\usepackage{amsmath}
\usepackage[margin=2.5cm]{geometry}

${'\\'}title{Untitled Note}
\author{}
\date{\today}

\begin{document}
\maketitle

\section{Introduction}
Start writing your LaTeX note here.

Here is an example equation:
\begin{equation}
        E = mc^2
\end{equation}

\end{document}`,
        typst: String.raw`#set page(
    paper: "a4",
    margin: 2.5cm,
)

#set text(
    font: "Libertinus Serif",
    size: 11pt,
)

= Untitled Note

Start writing your Typst note here.

Here is an example equation:

$ E = m c^2 $`
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function normalizeNote(note) { if (!note.format || (note.format === 'visual' && !note.visual_content && note.content)) note.format = note.visual_content ? 'visual' : 'md'; return note; }
const activeNote = () => localNotes.find(note => note.id === activeNoteId);
const editor = () => document.getElementById('note-source-editor');
const visualEditor = () => document.getElementById('visual-note-editor');
const sourceValue = () => currentFormat === 'visual' ? visualEditor().innerHTML : editor().value;

window.addEventListener('online', () => { isOnline = true; setSyncStatus('Syncing...'); syncNotesWithServer(); });
window.addEventListener('offline', () => { isOnline = false; setSyncStatus('Offline (Local mode)'); });
function setSyncStatus(text) { const element = document.getElementById('notes-sync-status'); if (element) element.textContent = text; }
function setSaveState(text) { const element = document.getElementById('notes-save-state'); if (element) element.textContent = text; }
function formatLabel(format) { return NOTE_FORMATS[format]?.label || NOTE_FORMATS.visual.label; }
function noteLocationItems() {
    const items = [{ label: 'Root', type: 'root', id: null }];
    if (!window.AcadState) return items;
    if (currentNotesContext.type === 'term') {
        const term = window.AcadState.terms?.find(item => item.id === currentNotesContext.id);
        if (term) items.push({ label: term.name, type: 'term', id: term.id });
    }
    if (currentNotesContext.type === 'subject') {
        const subject = window.AcadState.subjects?.find(item => item.id === currentNotesContext.id);
        const term = window.AcadState.terms?.find(item => item.id === subject?.term_id);
        if (term) items.push({ label: term.name, type: 'term', id: term.id });
        if (subject) items.push({ label: subject.code, type: 'subject', id: subject.id });
    }
    if (currentNotesContext.type === 'assignment') {
        const assignment = window.AcadState.assignments?.find(item => item.id === currentNotesContext.id);
        const subject = window.AcadState.subjects?.find(item => item.id === assignment?.subject_id);
        const term = window.AcadState.terms?.find(item => item.id === subject?.term_id);
        if (term) items.push({ label: term.name, type: 'term', id: term.id });
        if (subject) items.push({ label: subject.code, type: 'subject', id: subject.id });
        if (assignment) items.push({ label: assignment.title, type: 'assignment', id: assignment.id });
    }
    return items;
}
function renderNoteLocationPath() {
    const path = document.getElementById('note-location-path');
    if (!path) return;
    const items = noteLocationItems();
    path.innerHTML = items.map((item, index) => `<button type="button" class="note-location-segment" onclick="setNotesContext('${item.type}', ${item.id === null ? 'null' : `'${escapeHtml(item.id)}'`})">${escapeHtml(item.label)}</button>${index < items.length - 1 ? '<span class="note-location-separator">/</span>' : ''}`).join('');
}

async function initNotes() {
    if (!currentUser) return;
    const cached = localStorage.getItem(`notes_cache_${currentUser.id}`);
    if (cached) localNotes = JSON.parse(cached).map(normalizeNote);
    bindNotesControls();
    if (isOnline) await syncNotesWithServer();
    window.updateNotesTree();
}

let notesControlsBound = false;
function bindNotesControls() {
    if (notesControlsBound) return;
    notesControlsBound = true;
    document.getElementById('new-note-btn').addEventListener('click', () => createNewNote('visual'));
    document.getElementById('new-note-type-toggle').addEventListener('click', toggleNewNoteMenu);
    document.querySelectorAll('[data-new-format]').forEach(button => button.addEventListener('click', () => { createNewNote(button.dataset.newFormat); closeNewNoteMenu(); }));
    document.getElementById('note-title-input').addEventListener('input', () => setSaveState('Unsaved changes'));
    editor().addEventListener('input', () => { setSaveState('Unsaved changes'); updateLivePreview(); });
    visualEditor().addEventListener('input', () => { setSaveState('Unsaved changes'); updateLivePreview(); });
    visualEditor().addEventListener('keydown', handleVisualKeydown);
    visualEditor().addEventListener('keyup', saveVisualSelection);
    visualEditor().addEventListener('mouseup', saveVisualSelection);
    visualEditor().addEventListener('focus', saveVisualSelection);
    document.getElementById('note-editor-only').addEventListener('change', event => { document.querySelector('.note-preview').classList.toggle('hidden', event.target.checked); document.getElementById('note-editor-pane').classList.toggle('editor-only-mode', event.target.checked); document.getElementById('note-pane-divider').classList.toggle('hidden', event.target.checked); });
    document.getElementById('note-pane-divider').addEventListener('pointerdown', startNotePaneResize);
    document.addEventListener('pointermove', resizeNotePanes);
    document.addEventListener('pointerup', stopNotePaneResize);
    document.querySelectorAll('[data-command]').forEach(control => control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'click', () => runVisualCommand(control.dataset.command, control.dataset.value || control.value)));
    document.querySelectorAll('.notes-menu-button').forEach(button => button.addEventListener('click', () => toggleMenu(button.dataset.menu)));
    document.querySelectorAll('.notes-dropdown [data-action]').forEach(button => button.addEventListener('click', () => { runFileAction(button.dataset.action); closeMenus(); }));
    document.querySelectorAll('#insert-menu [data-insert-action]').forEach(button => button.addEventListener('click', () => { runInsertAction(button.dataset.insertAction); closeMenus(); }));
    document.addEventListener('click', event => { if (!event.target.closest('.notes-menu-group')) closeMenus(); if (!event.target.closest('.notes-new-group')) closeNewNoteMenu(); });
    document.addEventListener('keydown', handleNotesShortcut);
    document.addEventListener('mousedown', event => { if (!event.target.closest('.note-equation.is-editing, .note-equation.is-raw-editing')) finalizeEditingEquations(); });
    document.getElementById('notes-modal-close').addEventListener('click', closeNotesModal);
    document.getElementById('notes-modal').addEventListener('click', event => { if (event.target.id === 'notes-modal') closeNotesModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('notes-modal').classList.contains('hidden')) closeNotesModal(); });
    document.querySelectorAll('[data-table-action]').forEach(control => control.addEventListener('click', () => runTableAction(control.dataset.tableAction, control.dataset.borderStyle || control.value)));
    document.querySelectorAll('.color-tool').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.colorTarget)?.click()));
    document.querySelectorAll('.color-picker-input').forEach(input => input.addEventListener('input', () => { if (input.id === 'font-color-picker') runVisualCommand('foreColor', input.value); else runTableAction(input.id === 'cell-color-picker' ? 'cell-color' : 'border-color', input.value); }));
    document.querySelectorAll('[data-equation-action]').forEach(control => control.addEventListener('click', () => control.dataset.equationAction === 'color' ? document.getElementById(control.dataset.colorTarget)?.click() : runEquationAction(control.dataset.equationAction, control.dataset.equation)));
    document.getElementById('equation-color-picker').addEventListener('input', event => runEquationAction('color', event.target.value));
    visualEditor().addEventListener('contextmenu', openTableContextMenu);
    visualEditor().addEventListener('click', selectTableAtEvent);
    visualEditor().addEventListener('click', selectEquationAtEvent);
    visualEditor().addEventListener('mouseup', selectTableAtEvent);
    visualEditor().addEventListener('dragstart', handleTableDragStart);
    visualEditor().addEventListener('dragover', handleTableDragOver);
    visualEditor().addEventListener('drop', handleTableDrop);
    visualEditor().addEventListener('mousemove', handleTableResizeMove);
    visualEditor().addEventListener('mousedown', handleTableResizeStart);
    document.addEventListener('mousemove', handleTableResizeDrag);
    document.addEventListener('mouseup', handleTableResizeEnd);
    document.addEventListener('click', event => { if (!event.target.closest('#table-context-menu')) closeTableContextMenu(); });
}

function handleNotesShortcut(event) {
    if (document.getElementById('note-editor-pane').classList.contains('hidden')) return;
    if (currentFormat === 'visual' && event.altKey && (event.key === '=' || event.code === 'Equal')) { event.preventDefault(); runVisualCommand('insertEquation', null, true); return; }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'b') { event.preventDefault(); if (currentFormat === 'visual') runVisualCommand('bold'); else document.execCommand('bold'); }
    if (key === 's') { event.preventDefault(); saveActiveNote(); }
}

function setFormat(format, shouldConvert = false) {
    if (!NOTE_FORMATS[format]) return;
    if (shouldConvert && currentFormat !== format) convertCurrentNote(format);
    currentFormat = format;
    document.getElementById('note-format-label').textContent = formatLabel(format);
    document.getElementById('visual-toolbar').classList.toggle('hidden', format !== 'visual');
    document.getElementById('note-editor-pane').classList.toggle('visual-mode', format === 'visual');
    document.getElementById('note-format-description').textContent = NOTE_FORMATS[format].description;
    document.getElementById('note-editor-pane').classList.toggle('computer-modern-mode', format === 'latex');
    const isVisual = format === 'visual';
    document.getElementById('note-preview-toggle-label').classList.toggle('hidden', isVisual);
    document.getElementById('note-editor-only').checked = isVisual;
    document.querySelector('.note-preview').classList.toggle('hidden', isVisual);
    document.getElementById('note-editor-pane').classList.toggle('editor-only-mode', isVisual);
    document.getElementById('note-pane-divider').classList.toggle('hidden', isVisual);
    editor().classList.toggle('hidden', format === 'visual');
    visualEditor().classList.toggle('hidden', format !== 'visual');
    updateLivePreview();
}

function startNotePaneResize(event) {
    if (currentFormat === 'visual') return;
    event.preventDefault();
    notePaneResizeState = { startX: event.clientX, editorWidth: document.querySelector('.note-editor-column').getBoundingClientRect().width, totalWidth: document.querySelector('.note-split-view').getBoundingClientRect().width };
    document.body.classList.add('resizing-note-panes');
}
function resizeNotePanes(event) {
    if (!notePaneResizeState) return;
    const split = document.querySelector('.note-split-view');
    const dividerWidth = document.getElementById('note-pane-divider').getBoundingClientRect().width;
    const nextWidth = Math.max(180, Math.min(notePaneResizeState.totalWidth - dividerWidth - 180, notePaneResizeState.editorWidth + event.clientX - notePaneResizeState.startX));
    split.style.setProperty('--note-editor-width', `${nextWidth}px`);
}
function stopNotePaneResize() { if (!notePaneResizeState) return; notePaneResizeState = null; document.body.classList.remove('resizing-note-panes'); }

function createNewNote(format = 'visual') { guardNoteNavigation(() => openEditor(null, 'Untitled Note', NOTE_FORMATS[format] ? format : 'visual')); }
function toggleNewNoteMenu() { const menu = document.getElementById('new-note-type-menu'); const toggle = document.getElementById('new-note-type-toggle'); const open = menu.classList.toggle('open'); toggle.setAttribute('aria-expanded', String(open)); }
function closeNewNoteMenu() { const menu = document.getElementById('new-note-type-menu'); const toggle = document.getElementById('new-note-type-toggle'); if (!menu) return; menu.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); }

function openEditor(noteId = null, newTitle = '', newFormat = 'visual') {
    document.getElementById('notes-list-pane').classList.add('hidden');
    document.getElementById('note-editor-pane').classList.remove('hidden');
    const note = noteId ? localNotes.find(item => item.id === noteId) : null;
    activeNoteId = note?.id || null;
    document.getElementById('note-title-input').value = note?.title || newTitle;
    currentFormat = note ? normalizeNote(note).format : newFormat;
    visualEditor().innerHTML = note?.visual_content || (currentFormat === 'visual' ? note?.content || '' : '');
    editor().value = note?.content || (!note && NOTE_TEMPLATES[currentFormat] ? NOTE_TEMPLATES[currentFormat] : '');
    setFormat(currentFormat);
    makeTablesInteractive();
    renderNoteLocationPath();
    setSaveState(note ? 'Saved' : 'New note');
    clearInterval(autosaveTimer);
    autosaveTimer = setInterval(() => { if (hasUnsavedChanges()) saveActiveNote(); }, 300000);
}

function closeEditor() { clearInterval(autosaveTimer); autosaveTimer = null; activeNoteId = null; setSaveState('Saved'); document.getElementById('note-editor-pane').classList.add('hidden'); document.getElementById('notes-list-pane').classList.remove('hidden'); renderNotesList(); }
function openNotesModal(title, body, confirmLabel = '', onConfirm = null, tone = 'primary', alternateLabel = '', onAlternate = null) {
    const modal = document.getElementById('notes-modal');
    document.getElementById('notes-modal-title').textContent = title;
    document.getElementById('notes-modal-body').innerHTML = body;
    const footer = document.getElementById('notes-modal-footer');
    footer.innerHTML = '<button class="btn secondary" data-modal-cancel>Cancel</button>';
    notesModalConfirm = onConfirm;
    if (alternateLabel) footer.insertAdjacentHTML('beforeend', `<button class="btn secondary" data-modal-alternate>${alternateLabel}</button>`);
    if (confirmLabel) footer.insertAdjacentHTML('beforeend', `<button class="btn ${tone === 'danger' ? 'danger-solid' : 'primary'}" data-modal-confirm>${confirmLabel}</button>`);
    footer.querySelector('[data-modal-cancel]').addEventListener('click', closeNotesModal);
    footer.querySelector('[data-modal-alternate]')?.addEventListener('click', () => { const action = onAlternate; closeNotesModal(); action?.(); });
    footer.querySelector('[data-modal-confirm]')?.addEventListener('click', () => { const action = notesModalConfirm; closeNotesModal(); action?.(); });
    modal.classList.remove('hidden');
    setTimeout(() => footer.querySelector('[data-modal-confirm]')?.focus(), 0);
}
function closeNotesModal() { document.getElementById('notes-modal').classList.add('hidden'); notesModalConfirm = null; }
function runVisualCommand(command, value, editEquation = false) {
    restoreVisualSelection();
    visualEditor().focus();
    if (command === 'insertTable') { document.execCommand('insertHTML', false, '<table class="note-table" draggable="true" data-border-style="solid"><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>'); makeTablesInteractive(); }
    else if (command === 'insertCode') document.execCommand('insertHTML', false, '<pre class="note-code-block"><code>code</code></pre><p></p>');
    else if (command === 'insertEquation') insertEquation(editEquation ? '' : EQUATION_TEMPLATES.exponent.source, editEquation);
    else if (command === 'indent' || command === 'outdent') runListIndentCommand(command);
    else if (command === 'insertUnorderedList' || command === 'insertOrderedList') { document.execCommand(command, false, null); indentCurrentListItem(); }
    else document.execCommand(command, false, value || null);
    saveVisualSelection();
    updateLivePreview();
}

function runInsertAction(action) {
    if (action === 'image') return openNotesModal('Insert image', '<label class="notes-modal-label" for="insert-image-url">Image URL</label><input id="insert-image-url" class="notes-modal-select" type="url" placeholder="https://example.com/image.png"><label class="notes-modal-label" for="insert-image-alt">Alt text</label><input id="insert-image-alt" class="notes-modal-select" type="text" placeholder="Describe the image">', 'Insert image', () => insertImage(document.getElementById('insert-image-url')?.value, document.getElementById('insert-image-alt')?.value));
    if (action === 'table') return runVisualCommand('insertTable');
    if (action === 'link') return openNotesModal('Insert link', '<label class="notes-modal-label" for="insert-link-url">URL</label><input id="insert-link-url" class="notes-modal-select" type="url" placeholder="https://example.com"><label class="notes-modal-label" for="insert-link-text">Link text</label><input id="insert-link-text" class="notes-modal-select" type="text" placeholder="Optional text">', 'Insert link', () => insertLink(document.getElementById('insert-link-url')?.value, document.getElementById('insert-link-text')?.value));
    if (action === 'emoji') return openCharacterSelector('Choose emoji', 'emoji');
    if (action === 'special') return openCharacterSelector('Special characters', 'special');
    if (action === 'equation') return runVisualCommand('insertEquation');
}
function insertSourceText(value) { const source = editor(); const start = source.selectionStart; const end = source.selectionEnd; source.setRangeText(value, start, end, 'end'); source.focus(); }
function insertImage(url, alt = '') { if (!url) return; if (currentFormat === 'visual') { restoreVisualSelection(); visualEditor().focus(); document.execCommand('insertHTML', false, `<img class="note-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" draggable="false">&nbsp;`); } else if (currentFormat === 'md') insertSourceText(`![${alt || 'Image'}](${url})`); else if (currentFormat === 'latex') insertSourceText(`\\includegraphics[width=\\linewidth]{${url}}`); else insertSourceText(`#image("${url}", width: 100%)`); setSaveState('Unsaved changes'); updateLivePreview(); }
function insertLink(url, text = '') { if (!url) return; if (currentFormat === 'visual') { restoreVisualSelection(); visualEditor().focus(); if (text) document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`); else document.execCommand('createLink', false, url); } else if (currentFormat === 'md') insertSourceText(`[${text || url}](${url})`); else if (currentFormat === 'latex') insertSourceText(`\\href{${url}}{${text || url}}`); else insertSourceText(`#link("${url}")[${text || url}]`); setSaveState('Unsaved changes'); updateLivePreview(); }
function unicodeEmoji(value) { if (!value) return ''; const normalized = (Array.isArray(value) ? value.join(' ') : String(value)).replace(/U\+/gi, '').trim(); const codes = normalized.split(/[\s_-]+/).filter(Boolean); if (codes.length && codes.every(code => /^[0-9A-F]+$/i.test(code))) return String.fromCodePoint(...codes.map(code => parseInt(code, 16))); return value; }
function fallbackEmojiFolders() { return { 'Smileys & Emotion': '😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😋 😛 😜 🤪 🤨 🧐 🤓 😎 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫡 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃'.split(' '), 'People & Body': '👋 🤚 🖐️ ✋ 🖖 👌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✍️ 👏 🙌 👐 🤝 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 💕 💞 💓 💗 💖 💘 💝 💟'.split(' '), 'Animals & Nature': '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐙 🦋 🐝 🐞 🐢 🐍 🦎 🐳 🐬 🐟 🦈 🐊 🦓 🦒 🐘 🦏 🦛 🐪 🐫 🌸 🌹 🌻 🌞 🌝 🌈 ⭐ 🌟 ⚡ 🔥 ❄️'.split(' '), 'Food & Drink': '🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥕 🌽 🌶️ 🍔 🍕 🌭 🌮 🍿 🍜 🍣 🍪 🎂 🍰 🍫 🍭 ☕ 🧃 🍺 🍻 🍷'.split(' '), Activities: '⚽ 🏀 🏈 ⚾ 🎾 🏐 🏉 🎱 🪀 🏆 🥇 🎮 🎲 🎭 🎨 🎼 🎸 🚗 🚕 🚌 🚓 🚑 ✈️ 🚀 🚲 🏠 🏫 🏥 🗺️ 🌍 🏖️ 🏔️'.split(' '), Objects: '⌚ 📱 💻 ⌨️ 🖨️ 📷 🔋 💡 📚 📖 ✏️ 📝 📌 📎 🔒 🔑 🔨 🔬 🔭 💰 🎁 🎈 🎉 ✅ ❌ ❗ ❓ ⚠️ 💯 🔗'.split(' ') }; }
function emojiCategoryIcon(category) { const paths = { face: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="10" r=".7" fill="currentColor"/><circle cx="15" cy="10" r=".7" fill="currentColor"/><path d="M8.5 14.2c1 1.7 6 1.7 7 0"/>', person: '<circle cx="12" cy="6.5" r="3"/><path d="M6.5 21c.4-4.4 2.2-7 5.5-7s5.1 2.6 5.5 7M4 12h4m12 0h-4"/>', leaf: '<path d="M20 4C10 4 5 8 5 15c0 2.8 2 5 5 5 7 0 10-6 10-16Z"/><path d="M4 21c3-5 7-8 13-11"/>', food: '<path d="M6 3v7M9 3v7M6 7h3M7.5 10v11M17 3v18M17 3c3 2 3 6 0 8"/>', travel: '<path d="M3 17h18M5 17l1.5-6h11L20 17M8 11V8h8v3M7 20h2m6 0h2"/>', activity: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7 1.5 3h3l-2.4 1.8.9 3.2-3-1.8-3 1.8.9-3.2L7.5 10h3z"/>', object: '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8M8 12h5M8 16h8"/>', symbol: '<circle cx="12" cy="12" r="8.5"/><path d="M8 12h8M12 8v8"/>', flag: '<path d="M6 21V4m0 0c4-3 6 3 12 0v9c-6 3-8-3-12 0"/>', other: '<circle cx="12" cy="12" r="8.5"/><circle cx="8.5" cy="12" r=".7" fill="currentColor"/><circle cx="12" cy="12" r=".7" fill="currentColor"/><circle cx="15.5" cy="12" r=".7" fill="currentColor"/>' }; return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[EMOJI_CATEGORY_ICONS[category]] || paths.other}</svg>`; }
function characterEntry(value) { return typeof value === 'string' ? { character: value, name: '' } : value; }
function characterSelectorMarkup(folders, emojiMode = false) { const entries = Object.entries(folders); if (emojiMode) return `<div class="character-folders emoji-selector"><input id="emoji-search" class="emoji-search" type="search" placeholder="Search emoji" aria-label="Search emoji"><div class="emoji-category-bar">${entries.map(([folder], index) => `<button type="button" class="emoji-category-button" data-folder-jump="emoji-category-${index}" title="${escapeHtml(folder)}" aria-label="Jump to ${escapeHtml(folder)}">${emojiCategoryIcon(folder)}</button>`).join('')}</div><div class="emoji-scroll" id="emoji-scroll">${entries.map(([folder, characters], index) => `<section class="emoji-category-section" id="emoji-category-${index}" data-emoji-section><h4>${emojiCategoryIcon(folder)}<span>${escapeHtml(folder)}</span></h4><div class="character-grid">${characters.map(value => { const entry = characterEntry(value); return `<button type="button" class="character-option" data-character="${escapeHtml(entry.character)}" data-search="${escapeHtml(`${entry.name} ${entry.character}`.toLowerCase())}" title="${escapeHtml(entry.name || folder)}">${entry.character}</button>`; }).join('')}</div></section>`).join('')}</div></div>`; return `<div class="character-folders"><div class="character-folder-tabs">${entries.map(([folder], index) => `<button type="button" class="character-folder-tab${index === 0 ? ' active' : ''}" data-folder-tab="${index}" title="${escapeHtml(folder)}" aria-label="${escapeHtml(folder)}">${escapeHtml(folder)}</button>`).join('')}</div>${entries.map(([folder, characters], index) => `<div class="character-folder${index === 0 ? ' active' : ''}" data-folder-panel="${index}"><div class="character-grid">${characters.map(value => { const entry = characterEntry(value); return `<button type="button" class="character-option" data-character="${escapeHtml(entry.character)}" title="${escapeHtml(folder)}">${entry.character}</button>`; }).join('')}</div></div>`).join('')}</div>`; }
function bindCharacterSelector() { document.querySelectorAll('[data-folder-tab]').forEach(tab => tab.addEventListener('click', () => { document.querySelectorAll('.character-folder-tab, .character-folder').forEach(item => item.classList.remove('active')); tab.classList.add('active'); document.querySelector(`[data-folder-panel="${tab.dataset.folderTab}"]`)?.classList.add('active'); })); document.querySelectorAll('[data-folder-jump]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.folderJump)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))); document.getElementById('emoji-search')?.addEventListener('input', event => { const query = event.target.value.trim().toLowerCase(); document.querySelectorAll('[data-emoji-section]').forEach(section => { let visible = 0; section.querySelectorAll('[data-character]').forEach(button => { const match = !query || button.dataset.search.includes(query); button.classList.toggle('hidden', !match); if (match) visible += 1; }); section.classList.toggle('hidden', Boolean(query) && visible === 0); }); }); document.querySelectorAll('[data-character]').forEach(button => button.addEventListener('click', () => { restoreVisualSelection(); visualEditor().focus(); document.execCommand('insertText', false, button.dataset.character); closeNotesModal(); setSaveState('Unsaved changes'); updateLivePreview(); })); }
function emojiCategory(category = '') { const normalized = category.toLowerCase(); if (normalized.includes('smile') || normalized.includes('emotion')) return 'Smileys & Emotion'; if (normalized.includes('people') || normalized.includes('body')) return 'People & Body'; if (normalized.includes('animal') || normalized.includes('nature')) return 'Animals & Nature'; if (normalized.includes('food') || normalized.includes('drink')) return 'Food & Drink'; if (normalized.includes('travel') || normalized.includes('place')) return 'Travel & Places'; if (normalized.includes('activit')) return 'Activities'; if (normalized.includes('object')) return 'Objects'; if (normalized.includes('symbol')) return 'Symbols'; if (normalized.includes('flag')) return 'Flags'; return 'Other'; }
function orderedEmojiFolders(folders) { return Object.fromEntries(EMOJI_CATEGORY_ORDER.filter(category => folders[category]?.length).map(category => [category, folders[category]])); }
async function openCharacterSelector(title, type) { openNotesModal(title, '<div class="text-muted">Loading characters...</div>'); let folders = type === 'special' ? SPECIAL_CHARACTER_FOLDERS : null; if (!folders) { try { if (!emojiDatasetPromise) emojiDatasetPromise = fetch('https://cdn.jsdelivr.net/npm/emoji.json@13.1.0/emoji.json').then(response => response.ok ? response.json() : Promise.reject(new Error('Emoji data unavailable'))); const data = await emojiDatasetPromise; const entries = Array.isArray(data) ? data : Object.entries(data).map(([name, value]) => ({ name, emoji: value })); folders = entries.reduce((groups, item) => { const folder = emojiCategory(item.category || item.group || item.name || ''); const character = item.emoji || item.character || unicodeEmoji(item.unicode || item.codes); if (character) (groups[folder] ||= []).push({ character, name: item.name || '' }); return groups; }, {}); folders = orderedEmojiFolders(folders); if (!Object.keys(folders).length) throw new Error('Emoji data was empty'); } catch (error) { folders = fallbackEmojiFolders(); } } const body = document.querySelector('#notes-modal-body'); if (body && !document.getElementById('notes-modal').classList.contains('hidden')) { body.innerHTML = characterSelectorMarkup(folders, type === 'emoji'); bindCharacterSelector(); } }

function saveVisualSelection() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !visualEditor().contains(selection.anchorNode)) return;
    savedVisualRange = selection.getRangeAt(0).cloneRange();
}
function restoreVisualSelection() {
    if (!savedVisualRange) { visualEditor().focus(); return; }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedVisualRange);
}
function currentListItem() {
    const selection = window.getSelection();
    const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
    return node?.closest?.('li') || null;
}
function indentCurrentListItem() {
    const item = currentListItem();
    if (item) document.execCommand('indent', false, null);
}
function runListIndentCommand(command) {
    const item = currentListItem();
    if (!item) { document.execCommand(command, false, null); return; }
    document.execCommand(command, false, null);
}

function hasUnsavedChanges() { const pane = document.getElementById('note-editor-pane'); return Boolean(pane && !pane.classList.contains('hidden') && document.getElementById('notes-save-state')?.textContent === 'Unsaved changes'); }
function selectTableAtEvent(event) { const table = event.target.closest('table'); if (!table || !visualEditor().contains(table)) return; selectedEquation = null; document.getElementById('equation-toolbar').classList.add('hidden'); selectedTable = table; wholeTableSelected = !event.target.closest('td,th'); document.querySelectorAll('.table-selected').forEach(item => item.classList.remove('table-selected')); document.getElementById('table-toolbar').classList.remove('hidden'); table.classList.add('table-selected'); makeTableInteractive(table); }
function insertEquation(source, edit = false) { document.execCommand('insertHTML', false, `<span class="note-equation" contenteditable="false" data-new-equation="true" data-source="${escapeHtml(source)}">${renderKatex(source, false)}</span>&nbsp;`); const equation = visualEditor().querySelector('.note-equation[data-new-equation="true"]'); if (!equation) return; equation.removeAttribute('data-new-equation'); if (edit) openRawEquationEditor(equation); }
function equationSource(equation) { return equation.dataset.source || equation.textContent.replace(/^\\\(|\\\)$/g, '').trim(); }
function equationVisualMarkup(source) {
    const template = Object.values(EQUATION_TEMPLATES).find(item => item.source === source);
    return template?.html || `<span class="equation-slot equation-wide">${escapeHtml(source)}</span>`;
}
function enterEquationVisualEdit(equation) {
    finalizeEditingEquations(equation);
    equation.dataset.source = equationSource(equation);
    equation.innerHTML = equationVisualMarkup(equation.dataset.source);
    equation.contentEditable = 'true';
    equation.classList.add('is-editing');
    const firstSlot = equation.querySelector('.equation-slot');
    const range = document.createRange();
    range.selectNodeContents(firstSlot || equation);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    equation.focus();
}
function latexFromVisual(equation) {
    const source = equationSource(equation);
    const template = Object.values(EQUATION_TEMPLATES).find(item => item.source === source);
    if (!template) return equation.textContent.trim();
    const values = [...equation.querySelectorAll('.equation-slot')].map(slot => slot.textContent.trim() || '?');
    if (source === EQUATION_TEMPLATES.fraction.source) return String.raw`\frac{${values[0]}}{${values[1]}}`;
    if (source === EQUATION_TEMPLATES.mixed.source) return String.raw`${values[0]}\frac{${values[1]}}{${values[2]}}`;
    if (source === EQUATION_TEMPLATES.root.source) return String.raw`\sqrt{${values[0]}}`;
    if (source === EQUATION_TEMPLATES.integral.source) return String.raw`\int_${values[0]}^${values[1]} ${values[2].replace(/\s+/, String.raw`\,`)}`;
    if (source === EQUATION_TEMPLATES.derivative.source) return String.raw`\left[\frac{${values[0]}}{${values[1]}}${values[2]}\right]`;
    if (source === EQUATION_TEMPLATES.exponent.source) return String.raw`${values[0]}^{${values[1]}}`;
    if (source === EQUATION_TEMPLATES.bar.source) return String.raw`\overline{${values[0]}}`;
    if (source === EQUATION_TEMPLATES.underline.source) return String.raw`\underline{${values[0]}}`;
    if (source === EQUATION_TEMPLATES.real.source) return String.raw`${values[0]}\in\mathbb{R}`;
    if (source === EQUATION_TEMPLATES.integers.source) return String.raw`${values[0]}\in\mathbb{Z}`;
    if (source === EQUATION_TEMPLATES.set.source) return String.raw`\{${values[0]}\mid ${values[1]}\}`;
    return source;
}
function finalizeEditingEquations(except = null) { let finalized = false; visualEditor().querySelectorAll('.note-equation.is-editing').forEach(equation => { if (equation === except) return; const source = latexFromVisual(equation); equation.dataset.source = source; equation.contentEditable = 'false'; equation.classList.remove('is-editing', 'equation-selected'); equation.innerHTML = renderKatex(source, false); finalized = true; }); if (finalized) updateLivePreview(); }
function finishRawEquationEditor(equation, source) { equation.dataset.source = source.trim() || 'x'; equation.contentEditable = 'false'; equation.classList.remove('is-raw-editing', 'equation-selected'); equation.innerHTML = renderKatex(equation.dataset.source, false); setSaveState('Unsaved changes'); updateLivePreview(); }
function resizeRawEquationInput(input) { input.style.width = `${Math.max(2, input.value.length + 1)}ch`; }
function openRawEquationEditor(equation) { if (equation.classList.contains('is-editing')) equation.dataset.source = latexFromVisual(equation); const source = equationSource(equation); equation.contentEditable = 'false'; equation.classList.remove('is-editing'); equation.classList.add('is-raw-editing'); equation.innerHTML = `<input class="equation-latex-inline" type="text" aria-label="Equation LaTeX" value="${escapeHtml(source)}">`; const input = equation.querySelector('.equation-latex-inline'); resizeRawEquationInput(input); input.focus(); input.setSelectionRange(input.value.length, input.value.length); input.addEventListener('input', () => { resizeRawEquationInput(input); setSaveState('Unsaved changes'); }); input.addEventListener('blur', () => finishRawEquationEditor(equation, input.value), { once: true }); input.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); finishRawEquationEditor(equation, source); } }); }
function selectEquationAtEvent(event) { const equation = event.target.closest('.note-equation'); if (!equation || !visualEditor().contains(equation) || equation.classList.contains('is-raw-editing')) return; selectedTable = null; document.getElementById('table-toolbar').classList.add('hidden'); selectedEquation = equation; document.querySelectorAll('.equation-selected').forEach(item => item.classList.remove('equation-selected')); document.getElementById('equation-toolbar').classList.remove('hidden'); equation.classList.add('equation-selected'); if (event.detail > 1) { finalizeEditingEquations(); openRawEquationEditor(equation); } else if (!equation.classList.contains('is-editing')) enterEquationVisualEdit(equation); }
function runEquationAction(action, value) { if (!selectedEquation) return; finalizeEditingEquations(selectedEquation); if (action === 'template') { selectedEquation.dataset.source = value; openRawEquationEditor(selectedEquation); } if (action === 'size-up') selectedEquation.classList.add('equation-large'); if (action === 'size-down') selectedEquation.classList.remove('equation-large'); if (action === 'color') selectedEquation.style.color = value; setSaveState('Unsaved changes'); updateLivePreview(); }
function makeTableInteractive(table) { if (!table) return; table.draggable = true; table.classList.add('note-table'); table.dataset.borderStyle = table.dataset.borderStyle || 'solid'; document.querySelectorAll('.border-style-button').forEach(button => button.classList.toggle('active', button.dataset.borderStyle === table.dataset.borderStyle)); }
function makeTablesInteractive() { visualEditor().querySelectorAll('table').forEach(makeTableInteractive); }
function handleTableDragStart(event) { const table = event.target.closest('table'); if (!table) return; selectedTable = table; wholeTableSelected = true; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'note-table'); table.classList.add('table-dragging'); }
function handleTableDragOver(event) { if (!event.target.closest('table') || !selectedTable) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }
function handleTableDrop(event) { const target = event.target.closest('table'); if (!target || !selectedTable || target === selectedTable) return; event.preventDefault(); const rect = target.getBoundingClientRect(); const before = event.clientY < rect.top + rect.height / 2; target.parentNode.insertBefore(selectedTable, before ? target : target.nextSibling); selectedTable.classList.remove('table-dragging'); setSaveState('Unsaved changes'); updateLivePreview(); }
function resizeTarget(event) { const cell = event.target.closest('td,th'); if (!cell || !visualEditor().contains(cell)) return null; const rect = cell.getBoundingClientRect(); const nearRight = Math.abs(event.clientX - rect.right) <= 6; const nearBottom = Math.abs(event.clientY - rect.bottom) <= 6; return nearRight ? { cell, axis: 'column' } : nearBottom ? { cell, axis: 'row' } : null; }
function handleTableResizeMove(event) { if (tableResizeState) return; const target = resizeTarget(event); visualEditor().style.cursor = target ? `${target.axis === 'column' ? 'col' : 'row'}-resize` : ''; }
function handleTableResizeStart(event) { const target = resizeTarget(event); if (!target) return; event.preventDefault(); tableResizeState = { ...target, startX: event.clientX, startY: event.clientY, width: target.cell.getBoundingClientRect().width, height: target.cell.getBoundingClientRect().height }; }
function handleTableResizeDrag(event) { if (!tableResizeState) return; const { cell, axis } = tableResizeState; if (axis === 'column') cell.style.width = `${Math.max(48, tableResizeState.width + event.clientX - tableResizeState.startX)}px`; else cell.style.height = `${Math.max(28, tableResizeState.height + event.clientY - tableResizeState.startY)}px`; setSaveState('Unsaved changes'); }
function handleTableResizeEnd() { if (!tableResizeState) return; tableResizeState = null; updateLivePreview(); }
function openTableContextMenu(event) { const table = event.target.closest('table'); if (!table) return; event.preventDefault(); selectedTable = table; wholeTableSelected = true; document.querySelectorAll('.table-selected').forEach(item => item.classList.remove('table-selected')); table.classList.add('table-selected'); const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents(table); selection.removeAllRanges(); selection.addRange(range); const menu = document.getElementById('table-context-menu'); menu.style.left = `${event.clientX}px`; menu.style.top = `${event.clientY}px`; menu.classList.remove('hidden'); document.getElementById('table-toolbar').classList.remove('hidden'); }
function closeTableContextMenu() { document.getElementById('table-context-menu').classList.add('hidden'); }
function selectedCell() { const selection = window.getSelection(); const node = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement; return node?.closest?.('td,th') || selectedTable?.querySelector('td,th'); }
function runTableAction(action, value) {
    if (!selectedTable) return;
    const cell = selectedCell();
    if (action === 'add-row') { const row = cell?.parentElement || selectedTable.rows[selectedTable.rows.length - 1]; const newRow = selectedTable.insertRow(row.sectionRowIndex + 1); for (let index = 0; index < selectedTable.rows[0].cells.length; index++) newRow.insertCell().textContent = 'Cell'; }
    if (action === 'add-column') { const index = cell?.cellIndex ?? selectedTable.rows[0].cells.length - 1; [...selectedTable.rows].forEach(row => row.insertCell(index + 1).textContent = 'Cell'); }
    if (action === 'delete-row' && cell) { if (selectedTable.rows.length === 1) return runTableAction('delete-table'); cell.parentElement.remove(); }
    if (action === 'delete-column' && cell) { if (selectedTable.rows[0].cells.length === 1) return runTableAction('delete-table'); [...selectedTable.rows].forEach(row => row.deleteCell(cell.cellIndex)); }
    if (action === 'delete-table') { const table = selectedTable; selectedTable = null; wholeTableSelected = false; table.remove(); document.getElementById('table-toolbar').classList.add('hidden'); closeTableContextMenu(); }
    if (action === 'cell-color' && cell) cell.style.backgroundColor = value;
    if (action === 'border-color') { selectedTable.style.borderColor = value; selectedTable.querySelectorAll('td,th').forEach(tableCell => { tableCell.style.borderColor = value; }); }
    if (action === 'border-style') { selectedTable.dataset.borderStyle = value; document.querySelectorAll('.border-style-button').forEach(button => button.classList.toggle('active', button.dataset.borderStyle === value)); }
    if (action === 'toggle-borders') selectedTable.dataset.borderStyle = selectedTable.dataset.borderStyle === 'none' ? 'solid' : 'none';
    setSaveState('Unsaved changes'); updateLivePreview(); closeTableContextMenu();
}

function equationRawInput(equation) { return equation?.querySelector('.equation-latex-inline'); }
function placeCaretAroundEquation(equation, direction) { const selection = window.getSelection(); const range = document.createRange(); if (direction === 'before') range.setStartBefore(equation); else range.setStartAfter(equation); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); visualEditor().focus(); saveVisualSelection(); }
function enterAdjacentEquation(equation, direction) { if (!equation) return false; openRawEquationEditor(equation); const input = equationRawInput(equation); if (!input) return false; const position = direction === 'start' ? 0 : input.value.length; input.focus(); input.setSelectionRange(position, position); return true; }
function handleEquationNavigation(event) {
    const rawEquation = event.target.closest?.('.note-equation.is-raw-editing');
    if (rawEquation) {
        const input = equationRawInput(rawEquation);
        if (!input || !event.shiftKey && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
        if (event.key === 'ArrowLeft' && input.selectionStart === 0 && input.selectionEnd === 0) { event.preventDefault(); finishRawEquationEditor(rawEquation, input.value); placeCaretAroundEquation(rawEquation, 'before'); return true; }
        if (event.key === 'ArrowRight' && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) { event.preventDefault(); finishRawEquationEditor(rawEquation, input.value); placeCaretAroundEquation(rawEquation, 'after'); return true; }
        return false;
    }
    const selection = window.getSelection();
    if (!selection?.isCollapsed) return false;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false;
    const adjacent = adjacentNode(selection.anchorNode, selection.anchorOffset, event.key === 'ArrowLeft' ? 'previous' : 'next');
    const equation = adjacent?.closest?.('.note-equation');
    if (!equation || !visualEditor().contains(equation)) return false;
    event.preventDefault();
    return enterAdjacentEquation(equation, event.key === 'ArrowLeft' ? 'end' : 'start');
}
function adjacentNode(node, offset, direction) {
    if (!node) return null;
    if (node.nodeType === Node.TEXT_NODE) {
        const before = node.textContent.slice(0, offset).replace(/\u00a0/g, '').trim();
        const after = node.textContent.slice(offset).replace(/\u00a0/g, '').trim();
        if ((direction === 'previous' && before) || (direction === 'next' && after)) return null;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node.childNodes[direction === 'previous' ? offset - 1 : offset];
        if (child) return child.nodeType === Node.TEXT_NODE && !child.textContent.replace(/\u00a0/g, '').trim() ? adjacentNode(node, direction === 'previous' ? offset - 1 : offset + 1, direction) : child;
    }
    let current = node;
    while (current && current !== visualEditor()) {
        let sibling = direction === 'previous' ? current.previousSibling : current.nextSibling;
        while (sibling) {
            if (sibling.nodeType === Node.TEXT_NODE && !sibling.textContent.replace(/\u00a0/g, '').trim()) sibling = direction === 'previous' ? sibling.previousSibling : sibling.nextSibling;
            else return sibling.nodeType === Node.TEXT_NODE ? sibling.parentElement : sibling;
        }
        current = current.parentNode;
    }
    return null;
}

function handleVisualKeydown(event) {
    if (handleEquationNavigation(event)) return;
    if (handleTableKeydown(event)) return;
    if (event.key === 'Tab' && currentListItem()) { event.preventDefault(); runListIndentCommand(event.shiftKey ? 'outdent' : 'indent'); saveVisualSelection(); setSaveState('Unsaved changes'); updateLivePreview(); return; }
    if (handleListBackspace(event)) return;
    if (autoStartList(event)) return;
    if (event.key !== ' ') return;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode || selection.anchorNode.nodeType !== Node.TEXT_NODE) return;
    const textBeforeCaret = selection.anchorNode.textContent.slice(0, selection.anchorOffset);
    const equation = textBeforeCaret.match(/\$([^$\n]+)\$$/);
    if (!equation) return;
    event.preventDefault();
    const range = document.createRange();
    range.setStart(selection.anchorNode, selection.anchorOffset - equation[0].length);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
    selection.removeAllRanges();
    selection.addRange(range);
    const rendered = window.katex ? katex.renderToString(equation[1], { throwOnError: false }) : escapeHtml(equation[1]);
    document.execCommand('insertHTML', false, `<span class="note-equation" contenteditable="false" data-source="${escapeHtml(equation[1])}">${rendered}</span>&nbsp;`);
    updateLivePreview();
}

function autoStartList(event) {
    if (event.key !== ' ') return false;
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.anchorNode?.nodeType !== Node.TEXT_NODE) return false;
    const block = selection.anchorNode.parentElement?.closest('p,div');
    if (block && block !== visualEditor() && !visualEditor().contains(block)) return false;
    const beforeCaret = selection.anchorNode.textContent.slice(0, selection.anchorOffset);
    const ordered = /^\d+\. $/.test(beforeCaret);
    const unordered = /^- $/.test(beforeCaret);
    if (!ordered && !unordered) return false;
    event.preventDefault();
    const markerRange = document.createRange();
    markerRange.setStart(selection.anchorNode, selection.anchorOffset - beforeCaret.length);
    markerRange.setEnd(selection.anchorNode, selection.anchorOffset);
    markerRange.deleteContents();
    if (block && block !== visualEditor()) {
        const blockRange = document.createRange();
        blockRange.selectNodeContents(block);
        selection.removeAllRanges();
        selection.addRange(blockRange);
    }
    document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false, null);
    indentCurrentListItem();
    saveVisualSelection();
    setSaveState('Unsaved changes');
    updateLivePreview();
    return true;
}

function handleListBackspace(event) {
    if (event.key !== 'Backspace') return false;
    const selection = window.getSelection();
    const item = currentListItem();
    const anchorElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const continuation = anchorElement?.closest?.('.list-continuation');
    if (!selection?.isCollapsed || (!item && !continuation) || !isCaretAtStart(selection, item || continuation)) return false;
    event.preventDefault();
    if (continuation) {
        if (continuation.dataset.listIndent !== '0') { continuation.dataset.listIndent = '0'; continuation.style.removeProperty('--list-depth'); }
        else { continuation.classList.remove('list-continuation'); continuation.removeAttribute('data-list-indent'); }
    } else if (!item.textContent.trim()) {
        removeEmptyListItemMarker(item);
    } else if (item.parentElement?.parentElement?.closest('li')) {
        document.execCommand('outdent', false, null);
    } else return false;
    saveVisualSelection();
    setSaveState('Unsaved changes');
    updateLivePreview();
    return true;
}

function isCaretAtStart(selection, item) {
    if (selection.anchorNode?.nodeType === Node.TEXT_NODE) return !selection.anchorNode.textContent.slice(0, selection.anchorOffset).trim();
    return selection.anchorOffset === 0 || !item.textContent.trim();
}
function placeCaretAtStart(element) { const range = document.createRange(); range.selectNodeContents(element); range.collapse(true); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
function removeEmptyListItemMarker(item) {
    const list = item.parentElement;
    const lists = [...visualEditor().querySelectorAll('ol,ul')];
    const depth = Math.max(1, lists.filter(candidate => candidate.contains(item)).length);
    const continuation = document.createElement('div');
    continuation.className = 'list-continuation';
    continuation.dataset.listIndent = String(depth);
    continuation.style.setProperty('--list-depth', depth);
    continuation.innerHTML = '<br>';
    list.parentElement.insertBefore(continuation, list.nextSibling);
    item.remove();
    if (!list.children.length) list.remove();
    placeCaretAtStart(continuation);
}

function selectedTableCells() {
    if (!selectedTable) return [];
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return [];
    const range = selection.getRangeAt(0);
    return [...selectedTable.querySelectorAll('td,th')].filter(cell => { try { return range.intersectsNode(cell); } catch (error) { return false; } });
}
function clearTableCells(cells) { cells.forEach(cell => { cell.innerHTML = ''; }); setSaveState('Unsaved changes'); updateLivePreview(); }
function handleTableKeydown(event) {
    if (!selectedTable || (event.key !== 'Backspace' && event.key !== 'Delete')) return false;
    const cells = selectedTableCells();
    const allCells = [...selectedTable.querySelectorAll('td,th')];
    const wholeTable = wholeTableSelected && selectedTable.classList.contains('table-selected') && (!cells.length || cells.length === allCells.length);
    if (wholeTable) { event.preventDefault(); clearTableCells(allCells); return true; }
    if (event.key === 'Delete') { if (cells.length) { event.preventDefault(); clearTableCells(cells); return true; } return false; }
    if (cells.length) {
        const selectedRows = [...new Set(cells.map(cell => cell.parentElement))];
        const selectedColumns = [...new Set(cells.map(cell => cell.cellIndex))];
        const fullRows = selectedRows.length && selectedRows.every(row => [...row.cells].every(cell => cells.includes(cell)));
        const fullColumns = selectedColumns.length && selectedColumns.every(index => [...selectedTable.rows].every(row => cells.includes(row.cells[index])));
        if (fullRows) { event.preventDefault(); if (selectedTable.rows.length === selectedRows.length) return runTableAction('delete-table') || true; selectedRows.forEach(row => row.remove()); setSaveState('Unsaved changes'); updateLivePreview(); return true; }
        if (fullColumns) { event.preventDefault(); if (selectedTable.rows[0].cells.length === selectedColumns.length) return runTableAction('delete-table') || true; [...selectedTable.rows].forEach(row => selectedColumns.slice().sort((a, b) => b - a).forEach(index => row.deleteCell(index))); setSaveState('Unsaved changes'); updateLivePreview(); return true; }
        event.preventDefault(); clearTableCells(cells); return true;
    }
    return false;
}

function updateLivePreview() {
    const pane = document.getElementById('custom-preview-pane');
    if (currentFormat === 'visual') { pane.innerHTML = visualEditor().innerHTML || '<div class="text-muted">Start typing to see preview...</div>'; renderMath(pane); return; }
    const raw = editor().value;
    if (!raw.trim()) { pane.innerHTML = '<div class="text-muted">Start typing to see preview...</div>'; return; }
    if (currentFormat === 'md') { pane.innerHTML = marked.parse(raw); renderMath(pane); }
    if (currentFormat === 'latex') renderLatex(raw, pane);
    if (currentFormat === 'typst') renderTypst(raw, pane);
}
function renderMath(element) { if (window.renderMathInElement) renderMathInElement(element, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }], throwOnError: false }); }
function renderLatex(raw, pane) {
    const unsupported = [...raw.matchAll(/\\([a-zA-Z]+)\*?/g)].map(match => match[1]).filter(command => !['documentclass', 'usepackage', 'title', 'author', 'date', 'today', 'begin', 'end', 'maketitle', 'section', 'LaTeX', 'textbf', 'textit', 'underline', 'item', 'frac', 'int', 'text', ',', 'quad'].includes(command));
    let source = raw.replace(/%.*$/gm, '').replace(/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/g, '').replace(/\\usepackage(?:\[[^\]]*\])?\{[^}]+\}/g, '');
    const title = source.match(/\\title\{([^}]*)\}/)?.[1] || '';
    const author = source.match(/\\author\{([^}]*)\}/)?.[1] || '';
    const date = source.match(/\\date\{([^}]*)\}/)?.[1] || '';
    source = source.replace(/\\title\{[^}]*\}|\\author\{[^}]*\}|\\date\{[^}]*\}/g, '').replace(/\\begin\{document\}|\\end\{document\}/g, '').replace(/\\maketitle/g, '');
    let html = title || author || date ? `<header class="latex-title"><h1>${renderLatexInline(title)}</h1><p>${renderLatexInline(author)}</p><small>${date === '\\today' ? new Date().toLocaleDateString() : renderLatexInline(date)}</small></header>` : '';
    source = source.replace(/\\begin\{equation\}([\s\S]*?)\\end\{equation\}/g, (_, equation) => `<div class="latex-block-equation">${renderKatex(equation, true)}</div>`);
    source = source.replace(/\\begin\{enumerate\}([\s\S]*?)\\end\{enumerate\}/g, (_, list) => `<ol>${list.split(/\\item\s*/).filter(Boolean).map(item => `<li>${renderLatexInline(item)}</li>`).join('')}</ol>`);
    source = source.replace(/\\begin\{itemize\}([\s\S]*?)\\end\{itemize\}/g, (_, list) => `<ul>${list.split(/\\item\s*/).filter(Boolean).map(item => `<li>${renderLatexInline(item)}</li>`).join('')}</ul>`);
    source.split(/\n\s*\n/).filter(block => block.trim()).forEach(block => {
        const section = block.match(/^\\section\*?\{([^}]*)\}([\s\S]*)$/);
        if (section) html += `<h2>${renderLatexInline(section[1])}</h2>${renderLatexBody(section[2])}`;
        else html += renderLatexBody(block);
    });
    if (unsupported.length) html = `<div class="note-warning">Unsupported LaTeX commands shown as plain text: ${[...new Set(unsupported)].map(escapeHtml).join(', ')}</div>${html}`;
    pane.innerHTML = html || '<div class="text-muted">No renderable LaTeX content.</div>';
}
function renderKatex(source, displayMode) { try { return katex.renderToString(source.trim(), { displayMode, throwOnError: false }); } catch (error) { return `<pre class="note-error">LaTeX error: ${escapeHtml(error.message)}</pre>`; } }
function renderLatexBody(source) { return source.split(/(<ol>[\s\S]*?<\/ol>|<ul>[\s\S]*?<\/ul>|<div class="latex-block-equation">[\s\S]*?<\/div>)/).filter(part => part.trim()).map(part => part.startsWith('<ol>') || part.startsWith('<ul>') || part.startsWith('<div class="latex-block-equation">') ? part : `<p>${renderLatexInline(part)}</p>`).join(''); }
function renderLatexInline(source) { return escapeHtml(source).replace(/\\LaTeX(?:\{\})?/g, 'LaTeX').replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>').replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>').replace(/\\underline\{([^}]*)\}/g, '<u>$1</u>').replace(/\$([^$]+)\$/g, (_, equation) => renderKatex(equation, false)).replace(/\\%/g, '%').replace(/\\([{}])/g, '$1').replace(/\s*\\\\\s*/g, '<br>'); }
async function renderTypst(raw, pane) {
    pane.innerHTML = '<div class="text-muted">Compiling Typst...</div>';
    try {
        if (!typstImportersReady) {
            typstImportersReady = Promise.all([
                import('https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-renderer@0.6.0/+esm'),
                import('https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-ts-web-compiler@0.6.0/+esm')
            ]).then(([rendererModule, compilerModule]) => {
                const importer = (wasmName, moduleUrl) => fetch(new URL(wasmName, moduleUrl));
                rendererModule.setImportWasmModule(importer);
                compilerModule.setImportWasmModule(importer);
            });
        }
        await typstImportersReady;
        if (!typstLoading) typstLoading = import('https://cdn.jsdelivr.net/npm/@myriaddreamin/typst.ts@0.6.0/+esm').then(module => module.$typst);
        typstRenderer = typstRenderer || await typstLoading;
        pane.innerHTML = await typstRenderer.svg({ mainContent: raw });
    } catch (error) {
        const message = String(error.message || error);
        const contextHint = message.includes('can only be used when context is known') && /#counter\s*\(\s*page\s*\)/.test(raw)
            ? '<p><strong>Fix:</strong> wrap the page counter in a context expression:</p><pre>#set page(\n  footer: context [\n    #align(center)[#counter(page).display("1")]\n  ]\n)</pre>'
            : '';
        const hint = location.protocol === 'file:' ? ' Open the app through a web server (http://localhost), not file://.' : ' Check that the network allows jsDelivr and that the Typst source is valid.';
        pane.innerHTML = `<div class="note-error"><strong>Typst could not render.</strong><br>${escapeHtml(message)}${contextHint}<small>${hint}</small></div>`;
    }
}
function convertCurrentNote(targetFormat) {
    const raw = sourceValue();
    if (targetFormat === 'visual') visualEditor().innerHTML = currentFormat === 'md' ? marked.parse(raw) : `<p>${escapeHtml(raw).replace(/\n/g, '<br>')}</p>`;
    else if (currentFormat === 'visual') editor().value = targetFormat === 'md' ? htmlToMarkdown(visualEditor()) : targetFormat === 'latex' ? htmlToLatex(visualEditor()) : htmlToTypst(visualEditor());
    else if (currentFormat === 'md' && targetFormat === 'latex') editor().value = markdownToLatex(raw);
    else if (currentFormat === 'md' && targetFormat === 'typst') editor().value = markdownToTypst(raw);
    else editor().value = raw;
}
function htmlToMarkdown(root) { return root.innerHTML.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n').replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n').replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n').replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**').replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*').replace(/<u[^>]*>(.*?)<\/u>/gi, '<u>$1</u>').replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, '```\n$1\n```\n').replace(/<br\s*\/?>(?=.)/gi, '\n').replace(/<p[^>]*>(.*?)<\/p>/gis, '$1\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{3,}/g, '\n\n').trim(); }
function htmlToLatex(root) { return htmlToMarkdown(root).replace(/^###\s+(.+)$/gm, '\\subsection{$1}').replace(/^##\s+(.+)$/gm, '\\section{$1}').replace(/^#\s+(.+)$/gm, '\\section{$1}').replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}').replace(/\*(.*?)\*/g, '\\textit{$1}'); }
function htmlToTypst(root) { return htmlToMarkdown(root).replace(/^###\s+(.+)$/gm, '=== $1').replace(/^##\s+(.+)$/gm, '== $1').replace(/^#\s+(.+)$/gm, '= $1').replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*(.*?)\*/g, '_$1_'); }
function markdownToLatex(source) { return source.replace(/^###\s+(.+)$/gm, '\\subsection{$1}').replace(/^##\s+(.+)$/gm, '\\section{$1}').replace(/^#\s+(.+)$/gm, '\\section{$1}').replace(/\*\*(.*?)\*\*/g, '\\textbf{$1}').replace(/\*(.*?)\*/g, '\\textit{$1}'); }
function markdownToTypst(source) { return source.replace(/^###\s+(.+)$/gm, '=== $1').replace(/^##\s+(.+)$/gm, '== $1').replace(/^#\s+(.+)$/gm, '= $1').replace(/\*\*(.*?)\*\*/g, '*$1*').replace(/\*(.*?)\*/g, '_$1_'); }
function toggleMenu(id) { closeMenus(); document.getElementById(id).classList.toggle('open'); }
function closeMenus() { document.querySelectorAll('.notes-dropdown').forEach(menu => menu.classList.remove('open')); }
function runFileAction(action) {
    if (action === 'new') return createNewNote('visual');
    if (action === 'save') return saveActiveNote();
    if (action === 'delete') return deleteActiveNote();
    if (action === 'duplicate') return duplicateNote();
    if (action === 'convert') return openNotesModal('Convert note', `<p class="notes-modal-copy">Choose the format for this note. Your current content will be converted in place and can be reviewed before saving.</p><label class="notes-modal-label" for="notes-convert-select">New format</label><select id="notes-convert-select" class="notes-modal-select"><option value="visual">Visual</option><option value="md">Markdown</option><option value="latex">LaTeX</option><option value="typst">Typst</option></select>`, 'Convert', () => setFormat(document.getElementById('notes-convert-select')?.value || currentFormat, true));
    if (action === 'print' || action === 'export-pdf') return printNote();
    if (action === 'export-source') return exportNote();
    if (action === 'page-setup') return openNotesModal('Page setup', '<p class="notes-modal-copy">Page size, margins, orientation, and destination are selected in the browser print dialog.</p><p class="notes-modal-hint">Choose Print or Export as PDF after closing this dialog.</p>');
    if (action === 'details') { const note = activeNote(); return openNotesModal('Note details', `<dl class="notes-details"><dt>Type</dt><dd>${formatLabel(currentFormat)}</dd><dt>Created</dt><dd>${note?.created_at ? new Date(note.created_at).toLocaleString() : 'Not saved'}</dd><dt>Updated</dt><dd>${note?.updated_at ? new Date(note.updated_at).toLocaleString() : 'Not saved'}</dd></dl>`); }
    if (['undo', 'redo', 'cut', 'copy', 'paste', 'paste-plain'].includes(action)) return runEditAction(action);
}
function runEditAction(action) { if (action === 'paste-plain') navigator.clipboard?.readText().then(text => document.execCommand('insertText', false, text)); else document.execCommand(action === 'paste-plain' ? 'paste' : action); }
function duplicateNote() { const note = activeNote(); if (!note) return; guardNoteNavigation(() => { openEditor(); document.getElementById('note-title-input').value = `${note.title} Copy`; visualEditor().innerHTML = note.visual_content || ''; editor().value = note.content || ''; setFormat(note.format || 'visual'); }); }
function printNote() {
    const preview = document.getElementById('custom-preview-pane');
    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    const title = escapeHtml(document.getElementById('note-title-input').value || 'Untitled Note');
    printWindow.document.write(`<html><head><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><style>html,body{background:#fff;color:#37352f}body{font-family:'Inter',sans-serif;line-height:1.5}.note-print{max-width:800px;margin:0 auto;padding:24px}.note-print pre{font-family:Consolas,monospace}.note-print img,.note-print svg{max-width:100%;height:auto}@media print{.note-print{padding:0}}</style></head><body class="note-print">${preview.innerHTML}</body></html>`);
    const closeAfterPrint = () => { printWindow.close(); };
    printWindow.addEventListener('afterprint', closeAfterPrint, { once: true });
    printWindow.onload = async () => {
        await printWindow.document.fonts?.ready;
        printWindow.focus();
        printWindow.print();
    };
    printWindow.document.close();
}
function exportNote() { const extension = currentFormat === 'visual' ? 'html' : currentFormat === 'md' ? 'md' : currentFormat === 'latex' ? 'tex' : 'typ'; const content = currentFormat === 'visual' ? `<!doctype html><meta charset="utf-8"><title>${escapeHtml(document.getElementById('note-title-input').value)}</title>${visualEditor().innerHTML}` : editor().value; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); link.download = `${document.getElementById('note-title-input').value || 'note'}.${extension}`; link.click(); URL.revokeObjectURL(link.href); }

async function saveActiveNote() {
    const now = new Date().toISOString();
    const title = document.getElementById('note-title-input').value.trim() || 'Untitled Note';
    let note = activeNote();
    if (!note) { note = { id: Math.random().toString(36).slice(2, 11), user_id: currentUser.id, created_at: now, term_id: currentNotesContext.type === 'term' ? currentNotesContext.id : null, subject_id: currentNotesContext.type === 'subject' ? currentNotesContext.id : null, assignment_id: currentNotesContext.type === 'assignment' ? currentNotesContext.id : null }; localNotes.push(note); activeNoteId = note.id; document.getElementById('delete-note-btn').classList.remove('hidden'); }
    note.title = title; note.format = currentFormat; note.content = currentFormat === 'visual' ? visualEditor().innerText : editor().value; note.visual_content = currentFormat === 'visual' ? visualEditor().innerHTML : note.visual_content || ''; note.updated_at = now; note._isDirty = true;
    localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes));
    if (isOnline) {
        const synced = await syncNotesWithServer();
        setSaveState(synced ? 'Saved online' : 'Saved locally');
    } else setSaveState('Saved locally');
}
async function deleteActiveNote() { if (!activeNoteId) return; const note = activeNote(); openNotesModal('Delete note?', `<p class="notes-modal-copy">This will permanently remove <strong>${escapeHtml(note?.title || 'Untitled Note')}</strong>. This action cannot be undone.</p>`, 'Delete note', async () => { const deletedId = activeNoteId; localNotes = localNotes.filter(item => item.id !== deletedId); localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes)); if (isOnline && deletedId.length > 15) await supabaseClient.from('notes').delete().eq('id', deletedId); closeEditor(); }, 'danger'); }

function guardNoteNavigation(continueAction) {
    if (!hasUnsavedChanges()) return continueAction();
    openNotesModal('Unsaved changes', '<p class="notes-modal-copy">This note has changes that have not been saved. What would you like to do before leaving?</p>', 'Save and continue', async () => { await saveActiveNote(); continueAction(); }, 'primary', 'Discard and continue', continueAction);
}

window.toggleNoteFolder = function(key, event) { event?.stopPropagation(); guardNoteNavigation(() => { expandedNoteFolders.has(key) ? expandedNoteFolders.delete(key) : expandedNoteFolders.add(key); localStorage.setItem('acad_notes_expanded', JSON.stringify([...expandedNoteFolders])); window.updateNotesTree(); }); };
window.setNotesContext = function(type, id) { guardNoteNavigation(() => { currentNotesContext = { type, id }; localStorage.setItem('acad_notes_active', JSON.stringify(currentNotesContext)); closeEditor(); window.updateNotesTree(); }); };
window.updateNotesTree = function() {
    const tree = document.getElementById('notes-tree'); if (!tree || !window.AcadState) return;
    const sorted = (items, key) => [...items].sort((a, b) => (a[key] || '').localeCompare(b[key] || ''));
    let html = `<button class="tree-node ${currentNotesContext.type === 'root' ? 'active' : ''}" onclick="setNotesContext('root', null)">📁 Root</button>`;
    sorted(window.AcadState.terms || [], 'name').forEach(term => { const termKey = `term_${term.id}`; const open = expandedNoteFolders.has(termKey); html += `<div><button class="tree-node ${currentNotesContext.id === term.id && currentNotesContext.type === 'term' ? 'active' : ''}" onclick="setNotesContext('term','${term.id}')"><span onclick="toggleNoteFolder('${termKey}',event)">${open ? '▼' : '▶'}</span> 📅 ${escapeHtml(term.name)}</button><div class="tree-children ${open ? '' : 'hidden'}">`; sorted((window.AcadState.subjects || []).filter(subject => subject.term_id === term.id), 'code').forEach(subject => { const key = `sub_${subject.id}`; const subOpen = expandedNoteFolders.has(key); html += `<div><button class="tree-node ${currentNotesContext.id === subject.id && currentNotesContext.type === 'subject' ? 'active' : ''}" onclick="setNotesContext('subject','${subject.id}')"><span onclick="toggleNoteFolder('${key}',event)">${subOpen ? '▼' : '▶'}</span> ${escapeHtml(subject.code)}</button><div class="tree-children ${subOpen ? '' : 'hidden'}">`; sorted((window.AcadState.assignments || []).filter(assignment => assignment.subject_id === subject.id), 'title').forEach(assignment => { html += `<button class="tree-node ${currentNotesContext.id === assignment.id && currentNotesContext.type === 'assignment' ? 'active' : ''}" onclick="setNotesContext('assignment','${assignment.id}')">📝 ${escapeHtml(assignment.title)}</button>`; }); html += '</div></div>'; }); html += '</div></div>'; });
    tree.innerHTML = html; renderNotesList();
};
function contextNotes() { return localNotes.filter(note => currentNotesContext.type === 'root' || (currentNotesContext.type === 'term' && note.term_id === currentNotesContext.id && !note.subject_id) || (currentNotesContext.type === 'subject' && note.subject_id === currentNotesContext.id && !note.assignment_id) || (currentNotesContext.type === 'assignment' && note.assignment_id === currentNotesContext.id)); }
function renderNotesList() { const container = document.getElementById('notes-list-container'); if (!container) return; const notes = contextNotes().sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0)); container.innerHTML = notes.length ? notes.map(note => `<button class="note-card" onclick="openEditor('${note.id}')"><span class="note-card-format">${NOTE_FORMATS[note.format || 'visual'].label}</span><h3>${escapeHtml(note.title || 'Untitled Note')}</h3><small>${new Date(note.updated_at || Date.now()).toLocaleDateString()}</small><p>${escapeHtml((note.content || '').replace(/[#*_\[\]]/g, '').slice(0, 130) || 'Empty note')}</p></button>`).join('') : '<p class="text-muted">No notes in this folder. Create one to get started.</p>'; }
async function syncNotesWithServer() { if (!isOnline || !currentUser) return false; const dirty = localNotes.filter(note => note._isDirty); let uploadError = null; if (dirty.length) { const payload = dirty.map(note => { const clean = { ...note }; delete clean._isDirty; if (clean.id.length < 15) delete clean.id; return clean; }); const result = await supabaseClient.from('notes').upsert(payload); uploadError = result.error; } if (!uploadError) { const { data, error } = await supabaseClient.from('notes').select('*').eq('user_id', currentUser.id); uploadError = error; if (!error && data) localNotes = data.map(note => ({ ...normalizeNote(note), _isDirty: false })); } localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes)); setSyncStatus(uploadError ? 'Local changes' : 'Synced'); renderNotesList(); return !uploadError; }
