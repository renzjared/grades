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

	itle{Untitled Note}
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
    document.addEventListener('click', event => { if (!event.target.closest('.notes-menu-group')) closeMenus(); if (!event.target.closest('.notes-new-group')) closeNewNoteMenu(); });
    document.addEventListener('keydown', handleNotesShortcut);
    document.getElementById('notes-modal-close').addEventListener('click', closeNotesModal);
    document.getElementById('notes-modal').addEventListener('click', event => { if (event.target.id === 'notes-modal') closeNotesModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.getElementById('notes-modal').classList.contains('hidden')) closeNotesModal(); });
    document.querySelectorAll('[data-table-action]').forEach(control => control.addEventListener('click', () => runTableAction(control.dataset.tableAction, control.dataset.borderStyle || control.value)));
    document.querySelectorAll('.color-tool').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.colorTarget)?.click()));
    document.querySelectorAll('.color-picker-input').forEach(input => input.addEventListener('input', () => { if (input.id === 'font-color-picker') runVisualCommand('foreColor', input.value); else runTableAction(input.id === 'cell-color-picker' ? 'cell-color' : 'border-color', input.value); }));
    visualEditor().addEventListener('contextmenu', openTableContextMenu);
    visualEditor().addEventListener('click', selectTableAtEvent);
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

function createNewNote(format = 'visual') { openEditor(null, 'Untitled Note', NOTE_FORMATS[format] ? format : 'visual'); }
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
function runVisualCommand(command, value) {
    restoreVisualSelection();
    visualEditor().focus();
    if (command === 'insertTable') { document.execCommand('insertHTML', false, '<table class="note-table" draggable="true" data-border-style="solid"><tbody><tr><td>Cell</td><td>Cell</td></tr><tr><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>'); makeTablesInteractive(); }
    else if (command === 'insertCode') document.execCommand('insertHTML', false, '<pre class="note-code-block"><code>code</code></pre><p></p>');
    else if (command === 'insertEquation') document.execCommand('insertHTML', false, '<span class="note-equation" contenteditable="false">\\(x^2 + y^2 = z^2\\)</span>&nbsp;');
    else if (command === 'indent' || command === 'outdent') runListIndentCommand(command);
    else if (command === 'insertUnorderedList' || command === 'insertOrderedList') { document.execCommand(command, false, null); indentCurrentListItem(); }
    else document.execCommand(command, false, value || null);
    saveVisualSelection();
    updateLivePreview();
}

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
function selectTableAtEvent(event) { const table = event.target.closest('table'); if (!table || !visualEditor().contains(table)) return; selectedTable = table; wholeTableSelected = !event.target.closest('td,th'); document.querySelectorAll('.table-selected').forEach(item => item.classList.remove('table-selected')); document.getElementById('table-toolbar').classList.remove('hidden'); table.classList.add('table-selected'); makeTableInteractive(table); }
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

function handleVisualKeydown(event) {
    if (handleTableKeydown(event)) return;
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
    if (!selection?.isCollapsed || !item || selection.anchorOffset !== 0) return false;
    const beforeCaret = selection.anchorNode?.textContent?.slice(0, selection.anchorOffset) || '';
    if (beforeCaret || !item.parentElement?.matches('ul,ol') || !item.parentElement.parentElement?.closest('li')) return false;
    event.preventDefault();
    document.execCommand('outdent', false, null);
    saveVisualSelection();
    setSaveState('Unsaved changes');
    updateLivePreview();
    return true;
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
function duplicateNote() { const note = activeNote(); if (!note) return; openEditor(); document.getElementById('note-title-input').value = `${note.title} Copy`; visualEditor().innerHTML = note.visual_content || ''; editor().value = note.content || ''; setFormat(note.format || 'visual'); }
function printNote() { const preview = document.getElementById('custom-preview-pane'); const printWindow = window.open('', '_blank'); if (!printWindow) return; printWindow.document.write(`<html><head><title>${escapeHtml(document.getElementById('note-title-input').value)}</title><link rel="stylesheet" href="styles.css"></head><body class="note-print">${preview.innerHTML}</body></html>`); printWindow.document.close(); printWindow.focus(); printWindow.print(); }
function exportNote() { const extension = currentFormat === 'visual' ? 'html' : currentFormat === 'md' ? 'md' : currentFormat === 'latex' ? 'tex' : 'typ'; const content = currentFormat === 'visual' ? `<!doctype html><meta charset="utf-8"><title>${escapeHtml(document.getElementById('note-title-input').value)}</title>${visualEditor().innerHTML}` : editor().value; const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' })); link.download = `${document.getElementById('note-title-input').value || 'note'}.${extension}`; link.click(); URL.revokeObjectURL(link.href); }

async function saveActiveNote() {
    const now = new Date().toISOString();
    const title = document.getElementById('note-title-input').value.trim() || 'Untitled Note';
    let note = activeNote();
    if (!note) { note = { id: Math.random().toString(36).slice(2, 11), user_id: currentUser.id, created_at: now, term_id: currentNotesContext.type === 'term' ? currentNotesContext.id : null, subject_id: currentNotesContext.type === 'subject' ? currentNotesContext.id : null, assignment_id: currentNotesContext.type === 'assignment' ? currentNotesContext.id : null }; localNotes.push(note); activeNoteId = note.id; document.getElementById('delete-note-btn').classList.remove('hidden'); }
    note.title = title; note.format = currentFormat; note.content = currentFormat === 'visual' ? visualEditor().innerText : editor().value; note.visual_content = currentFormat === 'visual' ? visualEditor().innerHTML : note.visual_content || ''; note.updated_at = now; note._isDirty = true;
    localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes)); setSaveState('Saved locally');
    if (isOnline) await syncNotesWithServer();
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
async function syncNotesWithServer() { if (!isOnline || !currentUser) return; const dirty = localNotes.filter(note => note._isDirty); let uploadError = null; if (dirty.length) { const payload = dirty.map(note => { const clean = { ...note }; delete clean._isDirty; if (clean.id.length < 15) delete clean.id; return clean; }); const result = await supabaseClient.from('notes').upsert(payload); uploadError = result.error; } if (!uploadError) { const { data, error } = await supabaseClient.from('notes').select('*').eq('user_id', currentUser.id); if (!error && data) localNotes = data.map(note => ({ ...normalizeNote(note), _isDirty: false })); } localStorage.setItem(`notes_cache_${currentUser.id}`, JSON.stringify(localNotes)); setSyncStatus(uploadError ? 'Local changes' : 'Synced'); renderNotesList(); }
