class ClassroomSyncService {
    constructor() {
        this.baseUrl = 'https://classroom.googleapis.com/v1';
        this.pendingAskItems = []; 
        this.unmatchedCourses = [];
        this.isManualSync = false;
    }

    async getCloudPreferences() {
        if (!currentUser) return { courses: [], items: [] };
        
        const { data, error } = await supabaseClient
            .from('user_preferences')
            .select('*')
            .eq('id', currentUser.id)
            .single();
            
        if (error && error.code !== 'PGRST116') console.error("Fetch Prefs Error:", error);
        
        return {
            courses: data?.ignored_courses || [],
            items: data?.ignored_items || []
        };
    }

    async updateCloudPreference(column, newArray) {
        if (!currentUser) return;
        const currentPrefs = await this.getCloudPreferences();
        const payload = {
            id: currentUser.id,
            ignored_courses: column === 'ignored_courses' ? newArray : currentPrefs.courses,
            ignored_items: column === 'ignored_items' ? newArray : currentPrefs.items,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('user_preferences').upsert(payload);
        if (error) console.error("Cloud Save Error:", error);
    }

    async getAccessToken() {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session?.provider_token || null;
    }

    async fetchWithAuth(endpoint) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) throw new Error('Not logged in.');

        const res = await fetch(`${SUPABASE_URL}/functions/v1/classroom-sync`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ endpoint })
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Server error during sync.');
        }
        return await res.json();
    }

    // --- NEW: Awaits the postMessage response from the extension ---
    async getUvleData() {
        return new Promise((resolve) => {
            const handler = (event) => {
                if (event.data?.type === 'UVLE_SYNC_PAYLOAD') {
                    window.removeEventListener('message', handler);
                    clearTimeout(timeout);
                    
                    // NEW: UVLe Account Detection Logic
                    const incomingUser = event.data.uvleUser;
                    const savedUser = localStorage.getItem('tala_uvle_user');
                    const statusEl = document.getElementById('settings-uvle-status');
                    const warningEl = document.getElementById('uvle-account-warning');
                    
                    if (statusEl && incomingUser) {
                        statusEl.innerText = `Connected: ${incomingUser}`;
                    }
                    
                    if (savedUser && incomingUser && savedUser !== incomingUser) {
                        if (warningEl) warningEl.classList.remove('hidden');
                    } else if (incomingUser) {
                        localStorage.setItem('tala_uvle_user', incomingUser);
                        if (warningEl) warningEl.classList.add('hidden');
                    }
                    
                    resolve(event.data.data);
                }
            };
            window.addEventListener('message', handler);
            window.postMessage({ type: 'TALA_REQUEST_UVLE_DATA' }, '*');
            
            const timeout = setTimeout(() => {
                window.removeEventListener('message', handler);
                console.warn("UVLe Bridge timeout: Extension did not reply.");
                resolve([]);
            }, 500); 
        });
    }

    async refreshIntegrationUI() {
        const gcStatus = document.getElementById('settings-gc-email');
        const gcBtn = document.getElementById('settings-link-gc');
        
        if (!gcStatus || !gcBtn) return;
        
        if (!currentUser) {
            gcStatus.innerText = 'Not logged in';
            gcBtn.disabled = true;
            return;
        }

        gcBtn.disabled = false;

        // Fetch current identities to check for a Google connection
        const { data: { user } } = await supabaseClient.auth.getUser();
        const googleIdentity = user?.identities?.find(id => id.provider === 'google');

        if (googleIdentity) {
            // Get the name or email from the linked identity data
            const accountName = googleIdentity.identity_data?.full_name || googleIdentity.identity_data?.email || 'Google Account';
            gcStatus.innerText = `Connected: ${accountName}`;
            gcStatus.style.color = 'var(--up-green)';
            
            // Switch button to Unlink state
            gcBtn.innerText = 'Unlink';
            gcBtn.style.color = '#e53e3e';
            gcBtn.style.borderColor = 'rgba(229, 62, 62, 0.5)';
            gcBtn.style.background = 'rgba(229, 62, 62, 0.05)';
            
            // Unlink logic
            gcBtn.onclick = async () => {
                if (!confirm("Are you sure you want to unlink your Google Classroom account? You will lose syncing capabilities.")) return;
                
                gcBtn.innerText = "Unlinking...";
                gcBtn.disabled = true;
                
                const { data, error: idError } = await supabaseClient.auth.getUserIdentities();
                if (idError || !data || !data.identities) {
                    alert("Error fetching account identities.");
                    this.refreshIntegrationUI();
                    return;
                }
                
                const targetIdentity = data.identities.find(id => id.provider === 'google');
                if (!targetIdentity) {
                    this.refreshIntegrationUI();
                    return;
                }

                const { error } = await supabaseClient.auth.unlinkIdentity(targetIdentity);
                
                if (error) {
                    if (error.message.includes("requires at least one identity")) {
                        alert("You cannot unlink your primary login method. If you signed in directly with Google, it must remain linked.");
                    } else {
                        alert("Error unlinking account: " + error.message);
                    }
                } else {
                    localStorage.removeItem('gc_access_token');
                    localStorage.removeItem('gc_refresh_token');
                }
                
                this.refreshIntegrationUI(); // Refresh UI to "Link" state
            };
        } else {
            // Not linked UI state
            gcStatus.innerText = 'Not linked';
            gcStatus.style.color = 'var(--text-muted)';
            
            gcBtn.innerText = 'Link Account';
            gcBtn.style.color = '';
            gcBtn.style.borderColor = '';
            gcBtn.style.background = '';
            
            // Link logic with offline scopes
            gcBtn.onclick = async () => {
                const getRedirectUrl = () => window.location.origin + window.location.pathname;
                const { error } = await supabaseClient.auth.linkIdentity({
                    provider: 'google',
                    options: {
                        redirectTo: getRedirectUrl(),
                        scopes: [
                            'https://www.googleapis.com/auth/classroom.courses.readonly',
                            'https://www.googleapis.com/auth/classroom.course-work.readonly',
                            'https://www.googleapis.com/auth/classroom.student-submissions.students.readonly',
                            'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
                            'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
                            'https://www.googleapis.com/auth/classroom.coursework.me',
                            'https://www.googleapis.com/auth/classroom.announcements.readonly',
                            'https://www.googleapis.com/auth/classroom.courses.readonly',
                            'https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly',
                            'https://www.googleapis.com/auth/classroom.topics.readonly'
                        ].join(' '),
                        queryParams: {
                            access_type: 'offline',
                            prompt: 'consent'
                        }
                    }
                });

                if (error) alert("Error linking account: " + error.message);
            };
        }
        
        // Silently ping the extension to fetch the latest UVLe status text
        this.getUvleData().catch(() => {});
    }

    async populateCourseDropdown(lmsType = 'gc') {
        try {
            const dropdown = document.getElementById('subj-classroom-id');
            dropdown.innerHTML = '<option value="">Loading...</option>';
            
            if (lmsType === 'gc') {
                const { courses = [] } = await this.fetchWithAuth('/courses?courseStates=ACTIVE');
                let html = '<option value="">-- Select GC Course --</option>';
                courses.forEach(c => { html += `<option value="${c.id}">${c.name} ${c.section ? `(${c.section})` : ''}</option>`; });
                dropdown.innerHTML = html;
            } else if (lmsType === 'uvle') {
                const uvleData = await this.getUvleData();
                const uvleCourses = new Map();
                
                // Extract unique courses from the pending UVLe tasks
                uvleData.forEach(ev => {
                    if (ev.course) uvleCourses.set(ev.course.id, ev.course);
                });
                
                let html = '<option value="">-- Select UVLe Course --</option>';
                uvleCourses.forEach(c => {
                    html += `<option value="uvle_${c.id}">${c.fullname}</option>`;
                });
                dropdown.innerHTML = html;
            } else {
                dropdown.innerHTML = '<option value="">-- Unlinked --</option>';
            }
        } catch (e) {
            document.getElementById('subj-classroom-id').innerHTML = '<option value="">-- Failed to load --</option>';
        }
    }

    createTaskPayload(subjectId, item, status = 'not_started') {
        const d = item.dueDate ? new Date(`${item.dueDate.year}-${String(item.dueDate.month).padStart(2,'0')}-${String(item.dueDate.day).padStart(2,'0')}T${item.dueTime?.hours !== undefined ? String(item.dueTime.hours).padStart(2,'0') : '23'}:${item.dueTime?.minutes !== undefined ? String(item.dueTime.minutes).padStart(2,'0') : '59'}:00Z`).toISOString() : new Date().toISOString();
        
        return {
            subject_id: subjectId,
            title: item.title || 'Untitled',
            due_date: d,
            status: status,
            link: item.alternateLink || '',
            notes: item.description || '',
            classroom_id: item.id,
            tags: []
        };
    }


    async syncAll(isManual = false) {
        if (!window.AcadState?.activeTerm) return;
        this.isManualSync = isManual;

        try {
            const gcPromise = this.fetchWithAuth('/courses?courseStates=ACTIVE').catch(() => ({ courses: [] }));
            const uvlePromise = this.getUvleData();

            const [gcRes, uvleEvents] = await Promise.all([gcPromise, uvlePromise]);
            
            const prefs = await this.getCloudPreferences();
            const ignoredList = prefs.courses;
                        
            this.unmatchedCourses = [];
            let uvleTasks = [];

            const courses = gcRes.courses || [];
            for (const gcCourse of courses) {
                if (ignoredList.includes(gcCourse.id)) continue;
                const isLinked = window.AcadState.subjects.some(s => s.classroom_course_id === gcCourse.id);
                if (!isLinked) this.unmatchedCourses.push(gcCourse);
            }

            // 3. Map UVLe Courses with Safety Checks
            console.log(`[Tala] Processing ${uvleEvents.length} UVLe Events`);
            
            uvleEvents.forEach(ev => {
                // Safely handle events that lack a standard course object
                const courseId = ev.course ? ev.course.id : 'general';
                const uvleCourseId = 'uvle_' + courseId;
                const localSub = window.AcadState.subjects.find(s => s.classroom_course_id === uvleCourseId);

                if (!localSub) {
                    if (!this.unmatchedCourses.some(c => c.id === uvleCourseId)) {
                        this.unmatchedCourses.push({
                            id: uvleCourseId,
                            name: ev.course ? ev.course.fullname : 'UVLe General',
                            section: ev.course ? ev.course.shortname : 'UVLe'
                        });
                    }
                } else {
                    const d = new Date(ev.timestart * 1000).toISOString();
                    
                    // NEW: Clean up the UVLe task name by stripping trailing " closes" or " is due"
                    const rawName = ev.name || 'Untitled Task';
                    const cleanName = rawName.replace(/\s+(closes|is due)$/i, '');

                    const payload = {
                        subject_id: localSub.id,
                        title: cleanName,
                        due_date: d,
                        status: 'not_started',
                        link: ev.url || '',
                        notes: ev.description || '',
                        classroom_id: 'uvle_task_' + ev.id,
                        tags: []
                    };

                    if (!window.AcadState.assignments.find(a => a.classroom_id === payload.classroom_id)) {
                        uvleTasks.push({
                            type: 'UVLe Task',
                            payload: payload,
                            localCourse: localSub,
                            isModified: false
                        });
                    }
                }
            });

            if (this.unmatchedCourses.length > 0) {
                this.renderCourseMapperModal();
                return;
            }

            await this.fetchAndProcessItems(uvleTasks);

        } catch (err) {
            console.error("Sync Error:", err);
            if (this.isManualSync) alert(err.message);
        }
    }

    renderCourseMapperModal() {
        const listDiv = document.getElementById('unlinked-courses-list');
        const localOpts = window.AcadState.subjects.map(s => `<option value="${s.id}">${s.code} - ${s.name}</option>`).join('');
        
        listDiv.innerHTML = this.unmatchedCourses.map(gc => `
            <div class="gc-course-map-item" data-gc-id="${gc.id}" data-gc-name="${gc.name}" data-gc-section="${gc.section || ''}">
                <div style="font-weight:600; font-size:0.9rem; color:var(--text-main); margin-bottom: 0.25rem;">${gc.name} ${gc.section ? `(${gc.section})` : ''}</div>
                <select class="input-minimal gc-course-action" style="font-weight: 500; width: 100%;">
                    <option value="add">Add as New Course</option>
                    <optgroup label="Link to Existing">
                        ${localOpts}
                    </optgroup>
                    <option value="ignore">Do Not Sync</option>
                </select>
            </div>
        `).join('');
        
        document.getElementById('course-sync-modal').classList.remove('hidden');
    }

    async processCourseLinks() {
        const items = document.querySelectorAll('.gc-course-map-item');
        const prefs = await this.getCloudPreferences();
        const ignoredList = prefs.courses;
        let addedCount = 0;
        
        for (const item of items) {
            const gcId = item.getAttribute('data-gc-id');
            const gcName = item.getAttribute('data-gc-name');
            const gcSection = item.getAttribute('data-gc-section');
            const action = item.querySelector('.gc-course-action').value;
            
            if (action === 'ignore') {
                ignoredList.push(gcId);
            } else if (action === 'add') {
                const isUvle = gcId.startsWith('uvle_');
                const { data: newSub } = await supabaseClient.from('subjects').insert([{
                    term_id: window.AcadState.activeTerm.id,
                    code: gcSection || gcName.slice(0, 8),
                    name: gcName,
                    color: isUvle ? '#7b1113' : '#00573F',
                    icon: 'svg:0',
                    classroom_course_id: gcId
                }]).select().single();
                if(newSub) window.AcadState.subjects.push(newSub);
                addedCount++;
            } else {
                await supabaseClient.from('subjects').update({ classroom_course_id: gcId }).eq('id', action);
                const localSub = window.AcadState.subjects.find(s => s.id === action);
                if (localSub) localSub.classroom_course_id = gcId;
            }
        }
        
        await this.updateCloudPreference('ignored_courses', ignoredList);
        document.getElementById('course-sync-modal').classList.add('hidden');
        
        if (addedCount > 0 && typeof fetchTermData === 'function') {
            await fetchTermData(window.AcadState.activeTerm.id); 
        }
        
        await this.syncAll(this.isManualSync); // Restart sync process with newly mapped courses
    }

    async fetchAndProcessItems(uvleTasks = []) {
        let autoItems = [];
        this.pendingAskItems = [...uvleTasks];
        
        // Filter out UVLe courses before hitting the Google Classroom API
        const linkedSubjects = window.AcadState.subjects.filter(s => s.classroom_course_id && !s.classroom_course_id.startsWith('uvle_'));
        
        const prefs = await this.getCloudPreferences();
        const ignoredItems = prefs.items;
        
        for (const sub of linkedSubjects) {
            const courseId = sub.classroom_course_id;

            // Coursework
            const { courseWork = [] } = await this.fetchWithAuth(`/courses/${courseId}/courseWork`).catch(()=>({}));
            for (const item of courseWork) {
                if (ignoredItems.includes(item.id)) continue;
                if (!window.AcadState.assignments.find(a => a.classroom_id === item.id)) {
                    const payload = this.createTaskPayload(sub.id, item);
                    if (prefs.coursework === 'auto') autoItems.push(payload);
                    else this.pendingAskItems.push({ type: 'Assignment', payload, localCourse: sub, isModified: false });
                }
            }

            // Materials
            const { courseWorkMaterial = [] } = await this.fetchWithAuth(`/courses/${courseId}/courseWorkMaterials`).catch(()=>({}));
            for (const item of courseWorkMaterial) {
                if (ignoredItems.includes(item.id)) continue;
                if (!window.AcadState.assignments.find(a => a.classroom_id === item.id)) {
                    const payload = this.createTaskPayload(sub.id, item);
                    if (prefs.materials === 'auto') autoItems.push(payload);
                    else this.pendingAskItems.push({ type: 'Material', payload, localCourse: sub, isModified: false });
                }
            }

            // Announcements
            const { announcements = [] } = await this.fetchWithAuth(`/courses/${courseId}/announcements`).catch(()=>({}));
            for (const item of announcements) {
                if (ignoredItems.includes(item.id)) continue;
                if (!window.AcadState.assignments.find(a => a.classroom_id === item.id)) {
                    const payload = this.createTaskPayload(sub.id, { title: item.text.substring(0, 40) + '...', alternateLink: item.alternateLink, id: item.id });
                    if (prefs.announcements === 'auto') autoItems.push(payload);
                    else this.pendingAskItems.push({ type: 'Announcement', payload, localCourse: sub, isModified: false });
                }
            }
        }

        if (autoItems.length > 0) {
            await supabaseClient.from('assignments').insert(autoItems);
        }

        if (this.pendingAskItems.length > 0) {
            this.renderConfirmModal();
        } else if (this.isManualSync) {
            alert(`Sync complete. ${autoItems.length} items automatically synced.`);
            if (autoItems.length > 0 && typeof fetchTermData === 'function') fetchTermData(window.AcadState.activeTerm.id);
        }
    }

    renderConfirmModal() {
        const listDiv = document.getElementById('sync-confirm-list');
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        listDiv.innerHTML = this.pendingAskItems.map((item, idx) => {
            const d = new Date(item.payload.due_date);
            const formattedDate = `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
            const formattedTime = d.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
            
            const existingTasks = window.AcadState.assignments.filter(a => a.subject_id === item.payload.subject_id);
            const linkOptions = existingTasks.length > 0 
                ? existingTasks.map(t => `<option value="${t.id}">${t.title}</option>`).join('') 
                : `<option value="">-- No existing tasks --</option>`;

            // NEW: Determine source and assign the proper inline icon
            const isUvle = item.payload.classroom_id?.startsWith('uvle_');
            const gcIcon = `<svg viewBox="0 0 48 48" width="16" height="16" xmlns="http://www.w3.org/2000/svg" style="vertical-align: top; margin-right: 6px; display: inline-block; transform: translateY(1px);"><path fill="#F2A600" d="M41 40H7a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v26a3 3 0 0 1-3 3z"/><path fill="#1E8E3E" d="M41 36H7a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3h34a3 3 0 0 1 3 3v22a3 3 0 0 1-3 3z"/><circle fill="#FFF" cx="24" cy="19" r="4"/><path fill="#FFF" d="M24 25c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z"/><circle fill="#FFF" cx="14" cy="21" r="3"/><path fill="#FFF" d="M14 26c-2.2 0-6.5 1.1-7 3.3v1.7h7v-5z"/><circle fill="#FFF" cx="34" cy="21" r="3"/><path fill="#FFF" d="M34 26c2.2 0 6.5 1.1 7 3.3v1.7h-7v-5z"/></svg>`;
            const uvleIcon = `<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS6nqAFQhso4ArndeGvTwVMbTJADWao4N6i6PU2iAWBdQ&s=10" style="width:16px; height:16px; border-radius: 2px; vertical-align: top; margin-right: 6px; display: inline-block; transform: translateY(1px);" alt="UVLe">`;
            const sourceIcon = isUvle ? uvleIcon : gcIcon;

            return `
            <div class="sync-item-card" data-idx="${idx}" style="background: var(--bg-color); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1; padding-right: 0.5rem;">
                        <span class="sync-meta-text" style="display:inline-block; background:${item.localCourse.color}22; color:${item.localCourse.color}; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.75rem; margin-bottom:0.5rem;">
                            ${item.localCourse.code} &bull; ${formattedDate} | ${formattedTime}
                        </span>
                        <span class="sync-modified-badge ${item.isModified ? '' : 'hidden'}" style="display:inline-block; background:rgba(237, 137, 54, 0.15); color:#dd6b20; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.7rem; margin-bottom:0.5rem; margin-left:0.25rem;">Modified</span>
                        
                        <!-- Inject the icon right before the title -->
                        <a href="${item.payload.link || '#'}" target="_blank" onclick="event.stopPropagation()" class="sync-title-text" style="display:block; font-weight:600; color:var(--text-main); font-size: 1rem; line-height: 1.2; text-decoration: none;">
                            ${sourceIcon}${item.payload.title}
                        </a>
                        
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">${item.type}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <button class="btn text-btn action-icon" onclick="window.ClassroomSync.openTaskEdit(${idx})" style="padding:4px;" title="Edit details">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                        <select class="input-minimal sync-action-select" onchange="window.ClassroomSync.toggleLinkDropdown(this, ${idx})" style="width: 100px;">
                            <option value="add">Add New</option>
                            <option value="link">Link</option>
                            <option value="discard">Discard</option>
                        </select>
                    </div>
                </div>
                
                <div class="sync-link-container hidden" style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px dashed var(--border);">
                    <label style="font-size:0.75rem; color:var(--text-muted);">Select existing task to overwrite:</label>
                    <select class="input-minimal sync-link-target" style="width:100%; margin-top:0.25rem;">
                        ${linkOptions}
                    </select>
                </div>
            </div>
            `;
        }).join('');
        
        document.getElementById('sync-confirm-modal').classList.remove('hidden');
    }

    toggleLinkDropdown(selectEl, idx) {
        const card = document.querySelector(`.sync-item-card[data-idx="${idx}"]`);
        const container = card.querySelector('.sync-link-container');
        if (selectEl.value === 'link') container.classList.remove('hidden');
        else container.classList.add('hidden');
    }

    openTaskEdit(idx) {
        const item = this.pendingAskItems[idx].payload;
        document.getElementById('sync-edit-idx').value = idx;
        document.getElementById('sync-edit-title').value = item.title;
        
        const d = new Date(item.due_date);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        document.getElementById('sync-edit-date').value = dateStr;
        document.getElementById('sync-edit-time').value = d.toTimeString().slice(0,5);
        
        document.getElementById('sync-task-edit-modal').classList.remove('hidden');
    }

    saveTaskEdit() {
        const idx = document.getElementById('sync-edit-idx').value;
        const title = document.getElementById('sync-edit-title').value.trim();
        const dDate = document.getElementById('sync-edit-date').value;
        const dTime = document.getElementById('sync-edit-time').value || '23:59';
        
        if (!title || !dDate) return alert("Title and date are required.");

        const localDate = new Date(`${dDate}T${dTime}:00`);
        this.pendingAskItems[idx].payload.title = title;
        this.pendingAskItems[idx].payload.due_date = localDate.toISOString();
        this.pendingAskItems[idx].isModified = true;
        
        document.getElementById('sync-task-edit-modal').classList.add('hidden');
        
        const card = document.querySelector(`.sync-item-card[data-idx="${idx}"]`);
        if (card) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const formattedDate = `${localDate.getDate()} ${months[localDate.getMonth()]} ${localDate.getFullYear()}`;
            const formattedTime = localDate.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
            
            const metaSpan = card.querySelector('.sync-meta-text');
            if (metaSpan) metaSpan.innerHTML = `${this.pendingAskItems[idx].localCourse.code} &bull; ${formattedDate} | ${formattedTime}`;
            
            const titleLink = card.querySelector('.sync-title-text');
            if (titleLink) titleLink.innerText = title;

            let modBadge = card.querySelector('.sync-modified-badge');
            if (modBadge) modBadge.classList.remove('hidden');
        }
    }

async processConfirmedSelections() {
        const itemCards = document.querySelectorAll('.sync-item-card');
        let toInsert = [];
        let toUpdate = [];
        let toDiscard = [];

        for (const card of itemCards) {
            const idx = card.getAttribute('data-idx');
            const action = card.querySelector('.sync-action-select').value;
            const item = this.pendingAskItems[idx];

            if (action === 'add') toInsert.push(item.payload);
            else if (action === 'link') {
                const targetId = card.querySelector('.sync-link-target').value;
                if (targetId) toUpdate.push({ id: targetId, payload: item.payload });
            } 
            else if (action === 'discard') toDiscard.push(item.payload.classroom_id);
        }

        if (toDiscard.length > 0) {
            const prefs = await this.getCloudPreferences();
            const ignoredItems = prefs.items;
            ignoredItems.push(...toDiscard);
            await this.updateCloudPreference('ignored_items', ignoredItems);
        }

        if (toInsert.length > 0) await supabaseClient.from('assignments').insert(toInsert);
        
        for (const update of toUpdate) {
            await supabaseClient.from('assignments').update({
                classroom_id: update.payload.classroom_id,
                title: update.payload.title,
                due_date: update.payload.due_date,
                link: update.payload.link
            }).eq('id', update.id);
        }

        if ((toInsert.length > 0 || toUpdate.length > 0) && typeof fetchTermData === 'function') {
            fetchTermData(window.AcadState.activeTerm.id); 
        }
        
        // FIXED: Tell the extension to clear its memory ONLY after we safely processed the tasks
        window.postMessage({ type: 'TALA_ACK_UVLE_DATA' }, '*');
        
        document.getElementById('sync-confirm-modal').classList.add('hidden');
    }
}

window.ClassroomSync = new ClassroomSyncService();

document.addEventListener('DOMContentLoaded', () => {
    
    const setSyncingState = (btn, isSyncing) => {
        if (!btn) return;
        if (isSyncing) {
            btn.dataset.originalHtml = btn.innerHTML;
            btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Syncing<span class="animated-dots"></span>`;
            btn.disabled = true;
        } else {
            if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
            btn.disabled = false;
        }
    };

    document.querySelectorAll('.trigger-global-sync').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.currentTarget; 
            setSyncingState(targetBtn, true);
            await window.ClassroomSync.syncAll(true);
            setSyncingState(targetBtn, false); 
        });
    });

    document.getElementById('manual-sync-btn')?.addEventListener('click', async (e) => {
        const targetBtn = e.currentTarget; 
        setSyncingState(targetBtn, true);
        await window.ClassroomSync.syncAll(true);
        setSyncingState(targetBtn, false); 
    });

    document.getElementById('save-course-links-btn')?.addEventListener('click', () => {
        window.ClassroomSync.processCourseLinks();
    });

    document.getElementById('sync-selected-btn')?.addEventListener('click', () => {
        window.ClassroomSync.processConfirmedSelections();
    });
    
    document.getElementById('save-sync-edit-btn')?.addEventListener('click', () => {
        window.ClassroomSync.saveTaskEdit();
    });
    
    document.getElementById('refresh-classroom-list-btn')?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.target.innerText = "Loading...";
        await window.ClassroomSync.populateCourseDropdown();
        e.target.innerText = "↻ Fetch Courses";
    });

    document.getElementById('bulk-add-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.sync-item-card').forEach(card => {
            const select = card.querySelector('.sync-action-select');
            const idx = card.getAttribute('data-idx');
            select.value = 'add';
            window.ClassroomSync.toggleLinkDropdown(select, idx);
        });
    });

    document.getElementById('bulk-discard-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.sync-item-card').forEach(card => {
            const select = card.querySelector('.sync-action-select');
            const idx = card.getAttribute('data-idx');
            select.value = 'discard';
            window.ClassroomSync.toggleLinkDropdown(select, idx);
        });
    });

    ['coursework', 'materials', 'announcements'].forEach(type => {
        const select = document.getElementById(`sync-pref-${type}`);
        if (select) {
            select.value = localStorage.getItem(`sync_pref_${type}`) || 'ask';
            select.addEventListener('change', (e) => localStorage.setItem(`sync_pref_${type}`, e.target.value));
        }
    });
});