(() => {
    const pageNames = new Set(['assignments', 'calendar', 'notes', 'explore', 'calc', 'profile', 'settings']);
    const isActive = new URLSearchParams(window.location.search).get('test') === '1';
    const notesStorageKey = 'tala_test_notes';
    let started = false;

    function dateAtOffset(offset, hour = 12) {
        const date = new Date();
        date.setDate(date.getDate() + offset);
        date.setHours(hour, 0, 0, 0);
        return date;
    }

    function dateString(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function buildNotes() {
        const now = new Date().toISOString();
        return [
            {
                id: 'demo-note-biology',
                user_id: 'test-user',
                title: 'Cell Biology — Review Notes',
                format: 'visual',
                content: 'Cell structure, transport, and energy',
                visual_content: '<h1>Cell Biology</h1><p>Review <strong>cell structure</strong>, membrane transport, and cellular energy.</p><h2>Key ideas</h2><ul><li>Diffusion moves particles down a concentration gradient.</li><li>Mitochondria produce ATP through cellular respiration.</li></ul><p><em>Next:</em> revisit the lab worksheet before the midterm.</p>',
                term_id: 'demo-term',
                subject_id: 'demo-bio',
                assignment_id: null,
                created_at: now,
                updated_at: now,
                references: [],
                format_settings: { pageless: true, columns: 1, pageSize: 'a4', orientation: 'portrait', pageNumbers: false }
            },
            {
                id: 'demo-note-lab',
                user_id: 'test-user',
                title: 'Microscopy Lab Checklist',
                format: 'md',
                content: '# Before the lab\n- Clean the lenses\n- Record magnification\n- Sketch the sample',
                visual_content: '',
                term_id: 'demo-term',
                subject_id: 'demo-bio',
                assignment_id: 'demo-task-lab',
                created_at: now,
                updated_at: now,
                references: [],
                format_settings: { pageless: true, columns: 1, pageSize: 'a4', orientation: 'portrait', pageNumbers: false }
            }
        ];
    }

    function seedAcademicData() {
        const start = dateAtOffset(-30);
        const end = dateAtOffset(90);
        const today = dateString(new Date());
        const tomorrow = dateString(dateAtOffset(1));
        const inFourDays = dateString(dateAtOffset(4));
        const dueSoon = dateAtOffset(1, 23).toISOString();
        const dueLater = dateAtOffset(4, 17).toISOString();
        const overdue = dateAtOffset(-2, 12).toISOString();

        window.AcadState.terms = [{
            id: 'demo-term',
            user_id: 'test-user',
            name: 'Demo Semester',
            start_date: dateString(start),
            end_date: dateString(end),
            tags: [
                { id: 'demo-tag-exam', name: 'Exam', color: '#c53030' },
                { id: 'demo-tag-lab', name: 'Lab', color: '#2f855a' },
                { id: 'demo-tag-reading', name: 'Reading', color: '#2b6cb0' }
            ]
        }];
        window.AcadState.activeTerm = window.AcadState.terms[0];
        window.AcadState.termTags = window.AcadState.activeTerm.tags;
        window.AcadState.subjects = [
            { id: 'demo-bio', term_id: 'demo-term', code: 'BIOL 101', section: 'A', name: 'Introduction to Biology', color: '#2f855a', icon: 'svg:0', venue: 'Science Hall 204' },
            { id: 'demo-math', term_id: 'demo-term', code: 'MATH 204', section: 'B', name: 'Applied Statistics', color: '#2b6cb0', icon: 'svg:8', venue: 'North Building 12' }
        ];
        window.AcadState.assignments = [
            { id: 'demo-task-lab', subject_id: 'demo-bio', title: 'Microscopy Lab Report', due_date: dueSoon, status: 'in_progress', tags: ['demo-tag-lab'], created_at: new Date().toISOString(), notes: 'Include labeled diagrams and a short conclusion.' },
            { id: 'demo-task-exam', subject_id: 'demo-bio', title: 'Cell Biology Midterm', due_date: dueLater, status: 'not_started', tags: ['demo-tag-exam'], created_at: new Date().toISOString(), notes: 'Chapters 4–7.' },
            { id: 'demo-task-reading', subject_id: 'demo-math', title: 'Probability Problem Set', due_date: overdue, status: 'completed', tags: ['demo-tag-reading'], created_at: new Date().toISOString(), notes: '' }
        ];
        window.AcadState.classes = [
            { id: 'demo-class-today', subject_id: 'demo-bio', class_date: today, start_time: '09:00', end_time: '10:30', modality: 'f2f', venue: 'Science Hall 204' },
            { id: 'demo-class-tomorrow', subject_id: 'demo-math', class_date: tomorrow, start_time: '13:00', end_time: '14:30', modality: 'online', venue: 'Online' },
            { id: 'demo-class-friday', subject_id: 'demo-bio', class_date: inFourDays, start_time: '10:00', end_time: '11:30', modality: 'f2f', venue: 'Science Hall 204' }
        ];
        window.AcadState.visibleSubjects = new Set(window.AcadState.subjects.map(subject => subject.id));
        window.AcadState.selectedTags = new Set();
        window.AcadState.searchQuery = '';
        window.AcadState.sortOrder = 'date_added';

        const savedEvents = sessionStorage.getItem('tala_test_calendar_events');
        calCustomEvents = savedEvents ? JSON.parse(savedEvents) : [{
            id: 'demo-calendar-event',
            title: 'Study group',
            type: 'meeting',
            date: tomorrow,
            start: '16:00',
            end: '17:00',
            location: 'Library, Level 2',
            details: 'Review for the biology midterm.',
            color: '#2563eb'
        }];

        localNotes = getNotes();
        currentNotesContext = { type: 'root', id: null };
        expandedNoteFolders = new Set(['term_demo-term', 'sub_demo-bio']);

        appState = JSON.parse(JSON.stringify(defaultState));
        appState.subject = 'BIOL 101 • Grade Calculator';
        appState.description = 'A sample calculator for testing the grade dashboard.';
        appState.categories = [
            {
                id: 'demo-grade-exams',
                name: 'Exams',
                weight: '60',
                calcMode: 'weighted',
                passingScore: '',
                capAtMax: true,
                dropLowestX: 0,
                components: [
                    { id: 'demo-grade-midterm', name: 'Midterm Exam', score: 84, max: 100, weight: '1', extraPoints: 0, capAtMax: true, isBonus: false },
                    { id: 'demo-grade-final', name: 'Final Exam', score: 91, max: 100, weight: '1', extraPoints: 0, capAtMax: true, isBonus: false }
                ]
            },
            {
                id: 'demo-grade-labs',
                name: 'Lab Work',
                weight: '40',
                calcMode: 'weighted',
                passingScore: '',
                capAtMax: true,
                dropLowestX: 0,
                components: [
                    { id: 'demo-grade-lab-report', name: 'Lab Reports', score: 94, max: 100, weight: '1', extraPoints: 0, capAtMax: true, isBonus: false }
                ]
            }
        ];
        appState.isEditMode = false;
        currentCalculatorId = null;
        originalTemplateState = getCleanTemplateState(appState);
        calCurrentDate = new Date();
        calShowClasses = true;
        calShowTasks = true;
    }

    function getNotes() {
        const saved = sessionStorage.getItem(notesStorageKey);
        return (saved ? JSON.parse(saved) : buildNotes()).map(normalizeNote);
    }

    function saveNotes(notes) {
        sessionStorage.setItem(notesStorageKey, JSON.stringify(notes));
    }

    function start() {
        if (!isActive || started) return;
        started = true;
        document.body.classList.add('test-mode');
        document.getElementById('test-mode-banner')?.classList.remove('hidden');

        const exitUrl = new URL(window.location.href);
        exitUrl.searchParams.delete('test');
        exitUrl.searchParams.delete('page');
        exitUrl.searchParams.delete('id');
        const exitLink = document.getElementById('exit-test-mode');
        if (exitLink) exitLink.href = `${exitUrl.pathname}${exitUrl.search}${exitUrl.hash}`;

        seedAcademicData();
        render();

        const protectedButtons = [
            '#sidebar-new-term', '#sidebar-new-course', '#sidebar-manage-tags',
            '.trigger-global-sync', '#save-cloud-btn', '#link-google-btn',
            '#unlink-google-btn', '#manual-sync-btn', '#settings-link-gc',
            '#refresh-classroom-list-btn',
            '#share-btn', '#save-username-btn'
        ];
        document.querySelectorAll(protectedButtons.join(',')).forEach(button => {
            button.disabled = true;
            button.setAttribute('aria-label', `${button.getAttribute('aria-label') || button.textContent.trim()} (disabled in test mode)`);
        });

        const requestedPage = new URLSearchParams(window.location.search).get('page');
        const initialPage = pageNames.has(requestedPage) ? requestedPage : 'assignments';
        switchView(initialPage);
    }

    function exit() {
        const exitUrl = new URL(window.location.href);
        exitUrl.searchParams.delete('test');
        exitUrl.searchParams.delete('page');
        exitUrl.searchParams.delete('id');
        window.location.assign(exitUrl.href);
    }

    window.TalaTestMode = { isActive, start, exit, getNotes, saveNotes };
})();
