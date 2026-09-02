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
            
        // Log errors unless it's just PGRST116 (which safely means "no row exists yet")
        if (error && error.code !== 'PGRST116') {
            console.error("Fetch Prefs Error:", error);
        }
        
        return {
            courses: data?.ignored_courses || [],
            items: data?.ignored_items || []
        };
    }

    async updateCloudPreference(column, newArray) {
        if (!currentUser) return;
        
        // 1. Fetch current preferences so we don't accidentally wipe out the other column
        const currentPrefs = await this.getCloudPreferences();
        
        // 2. Build the full payload so the database doesn't complain about missing columns
        const payload = {
            id: currentUser.id,
            ignored_courses: column === 'ignored_courses' ? newArray : currentPrefs.courses,
            ignored_items: column === 'ignored_items' ? newArray : currentPrefs.items,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabaseClient.from('user_preferences').upsert(payload);
        
        if (error) {
            console.error("Cloud Save Error:", error);
        } else {
            console.log(`Successfully saved ${column} to cloud vault.`);
        }
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

    async populateCourseDropdown() {
        try {
            const dropdown = document.getElementById('subj-classroom-id');
            const { courses = [] } = await this.fetchWithAuth('/courses?courseStates=ACTIVE');
            
            let html = '<option value="">-- Unlinked --</option>';
            courses.forEach(c => {
                html += `<option value="${c.id}">${c.name} ${c.section ? `(${c.section})` : ''}</option>`;
            });
            dropdown.innerHTML = html;
        } catch (e) {
            console.warn("Could not fetch classroom courses. Is the account linked?");
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
            const { courses = [] } = await this.fetchWithAuth('/courses?courseStates=ACTIVE');
            const prefs = await this.getCloudPreferences();
            const ignoredList = prefs.courses;
                        
            this.unmatchedCourses = [];

            for (const gcCourse of courses) {
                if (ignoredList.includes(gcCourse.id)) continue;
                
                const isLinked = window.AcadState.subjects.some(s => s.classroom_course_id === gcCourse.id);
                if (!isLinked) {
                    this.unmatchedCourses.push(gcCourse);
                }
            }

            if (this.unmatchedCourses.length > 0) {
                this.renderCourseMapperModal();
                return;
            }

            await this.fetchAndProcessItems();

        } catch (err) {
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
                const { data: newSub } = await supabaseClient.from('subjects').insert([{
                    term_id: window.AcadState.activeTerm.id,
                    code: gcSection || gcName.slice(0, 8),
                    name: gcName,
                    color: '#00573F',
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
        
        await this.fetchAndProcessItems();
    }

    async fetchAndProcessItems() {
        let autoItems = [];
        this.pendingAskItems = [];
        const linkedSubjects = window.AcadState.subjects.filter(s => s.classroom_course_id);
        
        const prefs = await this.getCloudPreferences();
        const ignoredItems = prefs.items;
        
        for (const sub of linkedSubjects) {
            const courseId = sub.classroom_course_id;

            // Coursework
            const { courseWork = [] } = await this.fetchWithAuth(`/courses/${courseId}/courseWork`);
            for (const item of courseWork) {
                if (ignoredItems.includes(item.id)) continue;
                if (!window.AcadState.assignments.find(a => a.classroom_id === item.id)) {
                    const payload = this.createTaskPayload(sub.id, item);
                    if (prefs.coursework === 'auto') autoItems.push(payload);
                    else this.pendingAskItems.push({ type: 'Assignment', payload, localCourse: sub, isModified: false });
                }
            }

            // Materials
            const { courseWorkMaterial = [] } = await this.fetchWithAuth(`/courses/${courseId}/courseWorkMaterials`);
            for (const item of courseWorkMaterial) {
                if (ignoredItems.includes(item.id)) continue;
                if (!window.AcadState.assignments.find(a => a.classroom_id === item.id)) {
                    const payload = this.createTaskPayload(sub.id, item);
                    if (prefs.materials === 'auto') autoItems.push(payload);
                    else this.pendingAskItems.push({ type: 'Material', payload, localCourse: sub, isModified: false });
                }
            }

            // Announcements
            const { announcements = [] } = await this.fetchWithAuth(`/courses/${courseId}/announcements`);
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

            return `
            <div class="sync-item-card" data-idx="${idx}" style="background: var(--bg-color); border: 1px solid var(--border); border-radius: 6px; padding: 0.75rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div style="flex:1; padding-right: 0.5rem;">
                        <span class="sync-meta-text" style="display:inline-block; background:${item.localCourse.color}22; color:${item.localCourse.color}; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.75rem; margin-bottom:0.5rem;">
                            ${item.localCourse.code} &bull; ${formattedDate} | ${formattedTime}
                        </span>
                        <span class="sync-modified-badge ${item.isModified ? '' : 'hidden'}" style="display:inline-block; background:rgba(237, 137, 54, 0.15); color:#dd6b20; padding:2px 6px; border-radius:4px; font-weight:600; font-size:0.7rem; margin-bottom:0.5rem; margin-left:0.25rem;">Modified</span>
                        
                        <!-- TITLE NOW RENDERED AS A CLEAN HYPERLINK -->
                        <a href="${item.payload.link || '#'}" target="_blank" onclick="event.stopPropagation()" class="sync-title-text" style="display:block; font-weight:600; color:var(--text-main); font-size: 1rem; line-height: 1.2; text-decoration: none;">${item.payload.title}</a>
                        
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
        if (selectEl.value === 'link') {
            container.classList.remove('hidden');
        } else {
            container.classList.add('hidden');
        }
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
            if (metaSpan) {
                const courseCode = this.pendingAskItems[idx].localCourse.code;
                metaSpan.innerHTML = `${courseCode} &bull; ${formattedDate} | ${formattedTime}`;
            }
            
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

            if (action === 'add') {
                toInsert.push(item.payload);
            } else if (action === 'link') {
                const targetId = card.querySelector('.sync-link-target').value;
                if (targetId) {
                    toUpdate.push({ id: targetId, payload: item.payload });
                }
            } else if (action === 'discard') {
                toDiscard.push(item.payload.classroom_id);
            }
        }

        if (toDiscard.length > 0) {
            const prefs = await this.getCloudPreferences();
            const ignoredItems = prefs.items;
            ignoredItems.push(...toDiscard);
            await this.updateCloudPreference('ignored_items', ignoredItems);
        }

        if (toInsert.length > 0) {
            await supabaseClient.from('assignments').insert(toInsert);
        }
        
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
            if (btn.dataset.originalHtml) {
                btn.innerHTML = btn.dataset.originalHtml;
            }
            btn.disabled = false;
        }
    };

// Global Listeners for anywhere the Sync button is placed
    document.querySelectorAll('.trigger-global-sync').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const targetBtn = e.currentTarget; // Capture reference before await
            setSyncingState(targetBtn, true);
            await window.ClassroomSync.syncAll(true);
            setSyncingState(targetBtn, false); // Restores button state when modal opens
        });
    });

    document.getElementById('manual-sync-btn')?.addEventListener('click', async (e) => {
        const targetBtn = e.currentTarget; // Capture reference before await
        setSyncingState(targetBtn, true);
        await window.ClassroomSync.syncAll(true);
        setSyncingState(targetBtn, false); // Restores button state when modal opens
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

    ['coursework', 'materials', 'announcements'].forEach(type => {
        const select = document.getElementById(`sync-pref-${type}`);
        if (select) {
            select.value = localStorage.getItem(`sync_pref_${type}`) || 'ask';
            select.addEventListener('change', (e) => localStorage.setItem(`sync_pref_${type}`, e.target.value));
        }
    });
});