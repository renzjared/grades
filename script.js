const SUPABASE_URL = 'https://hjpihzsdebckouckxewi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcGloenNkZWJja291Y2t4ZXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODY2NjYsImV4cCI6MjA5NTQ2MjY2Nn0.XyXSuxb51G_08PLgrKwt1RvYmVwgIajqCnMWuS_V82c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
// dont worry guys this is safe

let chartInstance = null;

function generateId() { return Math.random().toString(36).substr(2, 9); }

const defaultState = {
    subject: "New Subject",
    isEditMode: true,
    darkMode: false,
    showBreakdown: false,
    globalPassingScore: 60,
    enableHeartPoints: true,
    heartScale: [
        { limit: 2.00, mult: 1.00 },
        { limit: 1.75, mult: 0.40 },
        { limit: 1.50, mult: 0.16 },
        { limit: 1.25, mult: 0.06 },
        { limit: 1.00, mult: 0.02 }
    ],
    categories: [
        {
            id: generateId(), name: "Lecture", weight: "60", calcMode: 'weighted', passingScore: "", capAtMax: true,
            components: [ 
                { id: generateId(), name: "Midterm Exam", score: 85, max: 100, weight: "1", extraPoints: 0, capAtMax: true },
                { id: generateId(), name: "Final Exam", score: 90, max: 100, weight: "1", extraPoints: 5, capAtMax: true }
            ]
        }
    ],
    gradeScale: [
        { min: 92, grade: 1.00 }, { min: 88, grade: 1.25 },
        { min: 84, grade: 1.50 }, { min: 80, grade: 1.75 },
        { min: 76, grade: 2.00 }, { min: 72, grade: 2.25 },
        { min: 68, grade: 2.50 }, { min: 64, grade: 2.75 },
        { min: 60, grade: 3.00 }, { min: 0,  grade: 5.00 }
    ]
};

let appState = JSON.parse(JSON.stringify(defaultState));
let calcInsights = {};
let currentCalculatorId = new URLSearchParams(window.location.search).get('id');


let originalTemplateState = null;
function getCleanTemplateState(state) {
    if (!state) return null;
    const clean = JSON.parse(JSON.stringify(state)); // Deep copy
    delete clean.isEditMode;
    delete clean.showBreakdown;
    
    clean.categories.forEach(cat => {
        cat.components.forEach(comp => {
            delete comp.score;
            delete comp.extraPoints;
        });
    });
    return clean;
}

function hasTemplateChanged() {
    if (!originalTemplateState) return true; // if no original state, it's a brand new calculator
    const cleanCurrent = getCleanTemplateState(appState);
    const cleanOriginal = getCleanTemplateState(originalTemplateState);
    return JSON.stringify(cleanCurrent) !== JSON.stringify(cleanOriginal);
}

function parseWeight(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    let str = String(val).trim().replace('%', '');
    if (str.includes('/')) {
        const parts = str.split('/');
        const num = parseFloat(parts[0]);
        const den = parseFloat(parts[1]);
        if (den === 0 || isNaN(num) || isNaN(den)) return 0;
        return num / den;
    }
    const res = parseFloat(str);
    return isNaN(res) ? 0 : res;
}

// Check if user already submitted for this specific calculator
function hasUserSubmitted(calculatorId) {
    return localStorage.getItem(`submitted_${calculatorId}`) === 'true';
}

function setSubmissionStatus(calculatorId) {
    localStorage.setItem(`submitted_${calculatorId}`, 'true');
}

function scoreToGrade(percentage) {
    const scale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
    for (let item of scale) {
        if (percentage >= item.min) return item.grade;
    }
    return 5.00;
}

function calculateGrades() {
    calcInsights = { categories: [], totalRaw: 0, totalExtra: 0, warnings: [] };
    
    let totalCatWeightValue = 0;
    appState.categories.forEach(cat => totalCatWeightValue += parseWeight(cat.weight));

    let finalR_Weighted = 0;
    let finalE_Weighted = 0;

    appState.categories.forEach((cat, cIdx) => {
        let catInsight = { components: [], effectiveWeight: 0, rPercent: 0, ePercent: 0, finalContribution: 0 };
        let parsedCatW = parseWeight(cat.weight);
        catInsight.effectiveWeight = totalCatWeightValue > 0 ? (parsedCatW / totalCatWeightValue) * 100 : 0;

        let sumScore = 0, sumMax = 0, sumExtra = 0;
        let totalCompWeightValue = 0;
        
        cat.components.forEach(comp => totalCompWeightValue += parseWeight(comp.weight));

        cat.components.forEach((comp, compIdx) => {
            let compInsight = { effectiveWeight: 0, scorePercent: 0, weightedContribution: 0 };
            
            let actualScore = comp.score;
            let actualExtra = comp.extraPoints || 0;
            if (comp.capAtMax) {
                if (actualScore > comp.max) actualScore = comp.max;
                if (actualScore + actualExtra > comp.max) {
                    actualExtra = Math.max(0, comp.max - actualScore);
                }
            }

            let pScore = comp.max > 0 ? (actualScore / comp.max) * 100 : 0;
            let pExtra = comp.max > 0 ? (actualExtra / comp.max) * 100 : 0;
            compInsight.scorePercent = pScore + pExtra;

            if (cat.calcMode === 'weighted') {
                let parsedCompW = parseWeight(comp.weight);
                compInsight.effectiveWeight = totalCompWeightValue > 0 ? (parsedCompW / totalCompWeightValue) * 100 : 0;
                compInsight.weightedContribution = compInsight.scorePercent * (compInsight.effectiveWeight / 100);
            } else {
                sumScore += actualScore;
                sumMax += comp.max;
                sumExtra += actualExtra;
            }
            catInsight.components.push(compInsight);
        });

        if (cat.calcMode === 'sum') {
            if (sumMax > 0) {
                catInsight.rPercent = (sumScore / sumMax) * 100;
                catInsight.ePercent = (sumExtra / sumMax) * 100;
            }
            catInsight.components.forEach((cInsight, i) => {
                let c = cat.components[i];
                cInsight.effectiveWeight = sumMax > 0 ? (c.max / sumMax) * 100 : 0;
                cInsight.weightedContribution = cInsight.scorePercent * (cInsight.effectiveWeight / 100);
            });
        } else {
            let catR = 0, catE = 0;
            catInsight.components.forEach((cInsight, i) => {
                let c = cat.components[i];
                let actualScore = c.score;
                let actualExtra = c.extraPoints || 0;
                if (c.capAtMax) {
                    if (actualScore > c.max) actualScore = c.max;
                    if (actualScore + actualExtra > c.max) actualExtra = Math.max(0, c.max - actualScore);
                }
                let pScore = c.max > 0 ? (actualScore / c.max) * 100 : 0;
                let pExtra = c.max > 0 ? (actualExtra / c.max) * 100 : 0;
                catR += pScore * (cInsight.effectiveWeight / 100);
                catE += pExtra * (cInsight.effectiveWeight / 100);
            });
            catInsight.rPercent = catR;
            catInsight.ePercent = catE;
        }

        if (cat.capAtMax) {
            if (catInsight.rPercent > 100) catInsight.rPercent = 100;
            if (catInsight.rPercent + catInsight.ePercent > 100) {
                catInsight.ePercent = Math.max(0, 100 - catInsight.rPercent);
            }
        }

        catInsight.finalContribution = (catInsight.rPercent + catInsight.ePercent) * (catInsight.effectiveWeight / 100);

        let requiredPass = cat.passingScore !== "" ? Number(cat.passingScore) : appState.globalPassingScore;
        if (catInsight.rPercent < requiredPass) {
            calcInsights.warnings.push(`${cat.name} score (${catInsight.rPercent.toFixed(1)}%) is below passing (${requiredPass}%).`);
        }

        calcInsights.categories.push(catInsight);
        finalR_Weighted += catInsight.rPercent * (catInsight.effectiveWeight / 100);
        finalE_Weighted += catInsight.ePercent * (catInsight.effectiveWeight / 100);
    });

    calcInsights.totalRaw = finalR_Weighted;
    calcInsights.totalExtra = finalE_Weighted;

    document.getElementById('final-raw-score').innerText = finalR_Weighted.toFixed(2);
    document.getElementById('final-heart-score').innerText = finalE_Weighted > 0 ? `+${finalE_Weighted.toFixed(2)}% Heart Bonus ❤️` : '';

    let finalGrade = 5.00;
    if (finalE_Weighted > 0) {
        if (appState.enableHeartPoints && appState.heartScale && appState.heartScale.length > 0) {
            const grades = appState.heartScale.map(rule => {
                let computed = scoreToGrade(finalR_Weighted + (finalE_Weighted * rule.mult));
                return Math.max(rule.limit, computed);
            });
            finalGrade = Math.min(...grades); 
        } else {
            finalGrade = scoreToGrade(finalR_Weighted + finalE_Weighted);
        }
    } else {
        finalGrade = scoreToGrade(finalR_Weighted);
    }

    const gradeDisplay = document.getElementById('final-grade');
    gradeDisplay.innerText = finalGrade.toFixed(2);
    gradeDisplay.style.color = finalGrade <= 3.00 ? "var(--up-green)" : "var(--up-maroon)";
    document.getElementById('passing-warnings').innerHTML = calcInsights.warnings.map(w => `<div>⚠️ ${w}</div>`).join('');
}


function render() {
    calculateGrades(); 

    const shareBtn = document.getElementById('share-btn');
    if (currentCalculatorId && !hasTemplateChanged()) {
        shareBtn.innerText = "Copy Template Link";
        shareBtn.classList.remove('primary');
        shareBtn.classList.add('secondary');
    } else {
        shareBtn.innerText = "Save & Share Template";
        shareBtn.classList.remove('secondary');
        shareBtn.classList.add('primary');
    }

    document.body.setAttribute('data-theme', appState.darkMode ? 'dark' : 'light');
    document.getElementById('theme-btn').innerHTML = appState.darkMode ? 'Light Mode' : 'Dark Mode';
    
    const isEdit = appState.isEditMode;
    const showBreakdown = appState.showBreakdown;
    document.getElementById('mode-btn').innerHTML = isEdit ? 'View Mode' : 'Edit Mode';
    document.getElementById('breakdown-btn').innerHTML = showBreakdown ? 'Hide Details' : 'Show Details';
    
    document.querySelectorAll('.edit-only').forEach(el => el.classList.toggle('hidden', !isEdit));
    
    document.getElementById('subject-name').value = appState.subject;
    document.getElementById('global-passing').value = appState.globalPassingScore;
    document.getElementById('global-passing').disabled = !isEdit;

    const scaleBody = document.getElementById('grade-scale-body');
    scaleBody.innerHTML = appState.gradeScale.map((item, idx) => `
        <tr>
            <td>${isEdit ? `<input type="number" value="${item.min}" onchange="updateScale(${idx}, 'min', Number(this.value))" class="input-minimal" style="width:85px;">%` : `≥ ${item.min}%`}</td>
            <td style="font-weight: 500;">${isEdit ? `<input type="number" value="${item.grade}" step="0.25" onchange="updateScale(${idx}, 'grade', Number(this.value))" class="input-minimal" style="width:85px;">` : item.grade.toFixed(2)}</td>
            <td class="edit-only ${isEdit ? '' : 'hidden'}"><button class="btn danger" onclick="removeScale(${idx})">×</button></td>
        </tr>
    `).join('');

    document.getElementById('enable-heart-points').checked = appState.enableHeartPoints;
    const heartBody = document.getElementById('heart-scale-body');
    if (appState.heartScale) {
        heartBody.innerHTML = appState.heartScale.map((item, idx) => `
            <tr>
                <td><span style="font-size: 0.8rem; color: var(--text-muted);">Max Grade:</span> ${isEdit ? `<input type="number" value="${item.limit}" step="0.25" onchange="updateHeartScale(${idx}, 'limit', Number(this.value))" class="input-minimal" style="width:85px;">` : `<span style="font-weight: 500;">${item.limit.toFixed(2)}</span>`}</td>
                <td><span style="font-size: 0.8rem; color: var(--text-muted);">Mult:</span> ${isEdit ? `<input type="number" value="${item.mult}" step="0.01" onchange="updateHeartScale(${idx}, 'mult', Number(this.value))" class="input-minimal" style="width:85px;">` : `<span style="font-weight: 500;">${item.mult.toFixed(2)}x</span>`}</td>
                <td class="edit-only ${isEdit ? '' : 'hidden'}"><button class="btn danger" onclick="removeHeartScale(${idx})">×</button></td>
            </tr>
        `).join('');
    }

    const container = document.getElementById('categories-container');
    container.innerHTML = '';

    appState.categories.forEach((cat, cIndex) => {
        const catInsight = calcInsights.categories[cIndex];
        const catDiv = document.createElement('div');
        catDiv.className = 'category-block';
        
        let headerHtml = isEdit 
            ? `<input type="text" value="${cat.name}" onchange="updateCat(${cIndex}, 'name', this.value)" class="cat-title-input">
               <button class="btn danger" onclick="removeCat(${cIndex})">Delete</button>`
            : `<h3 style="font-size: 1.25rem; font-weight: 600; margin:0;">${cat.name}</h3>`;

        let settingsHtml = isEdit ? `
            <div class="cat-settings">
                <div><label>Weight / Fraction:</label> <input type="text" value="${cat.weight}" onchange="updateCat(${cIndex}, 'weight', this.value)" style="width:85px; display:inline-block; padding:0.2rem;"></div>
                <div><label>Mode:</label> 
                    <select onchange="updateCat(${cIndex}, 'calcMode', this.value)" style="width:auto; display:inline-block; padding:0.2rem;">
                        <option value="weighted" ${cat.calcMode === 'weighted' ? 'selected' : ''}>Weighted</option>
                        <option value="sum" ${cat.calcMode === 'sum' ? 'selected' : ''}>Sum Points</option>
                    </select>
                </div>
                <div><label>Pass %:</label> <input type="number" placeholder="Global" value="${cat.passingScore}" onchange="updateCat(${cIndex}, 'passingScore', this.value)" style="width:85px; display:inline-block; padding:0.2rem;"></div>
                <div>
                    <label>Cap to Max:</label> 
                    <input type="checkbox" ${cat.capAtMax ? 'checked' : ''} onchange="updateCat(${cIndex}, 'capAtMax', this.checked)" style="width:auto; display:inline-block; vertical-align:middle; margin-left: 4px;">
                </div>
            </div>` : '';

        let summaryHtml = `
            <div class="cat-summary-bar">
                <div class="stat-box">Weight <strong>${catInsight.effectiveWeight.toFixed(1)}%</strong></div>
                <div class="stat-box">Category Score <strong>${catInsight.rPercent.toFixed(1)}% ${catInsight.ePercent > 0 ? `<span class="heart-text">(+${catInsight.ePercent.toFixed(1)}%)</span>` : ''}</strong></div>
                <div class="stat-box highlight">Final Contribution <strong>+${catInsight.finalContribution.toFixed(2)}</strong></div>
            </div>
        `;

        let componentsHtml = `
            <table class="components-table">
                <thead>
                    <tr>
                        <th class="col-item">Item Name</th>
                        <th class="col-num">Score</th>
                        <th class="col-num">Max</th>
                        <th class="col-num"><span class="heart-text">Extra</span></th>
                        ${cat.calcMode === 'weighted' ? `<th class="col-num">Weight</th>` : ''}
                        ${showBreakdown ? `<th class="col-num">Eff. %</th><th class="col-num">Score %</th><th class="col-num">Contrib.</th>` : ''}
                        <th class="edit-only ${isEdit ? '' : 'hidden'}" style="width: 30px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        cat.components.forEach((comp, compIndex) => {
            let cInsight = catInsight.components[compIndex];
            componentsHtml += `
                <tr>
                    <td class="col-item">${isEdit ? `<input type="text" value="${comp.name}" onchange="updateComp(${cIndex}, ${compIndex}, 'name', this.value)">` : comp.name}</td>
                    
                    <td class="col-num"><input type="number" value="${comp.score}" onchange="updateComp(${cIndex}, ${compIndex}, 'score', Number(this.value))" class="input-minimal ${!isEdit ? 'view-editable' : ''}" style="width:85px;"></td>
                    
                    <td class="col-num">
                        ${isEdit ? `
                            <input type="number" value="${comp.max}" onchange="updateComp(${cIndex}, ${compIndex}, 'max', Number(this.value))" class="input-minimal" style="width:85px;">
                            <div class="cap-control">
                                <input type="checkbox" id="cap-${cIndex}-${compIndex}" ${comp.capAtMax ? 'checked' : ''} onchange="updateComp(${cIndex}, ${compIndex}, 'capAtMax', this.checked)">
                                <label for="cap-${cIndex}-${compIndex}">Cap</label>
                            </div>
                        ` : comp.max}
                    </td>
                    
                    <td class="col-num"><input type="number" value="${comp.extraPoints || 0}" onchange="updateComp(${cIndex}, ${compIndex}, 'extraPoints', Number(this.value))" class="input-minimal ${!isEdit ? 'view-editable' : ''}" style="width:85px;"></td>
                    
                    ${cat.calcMode === 'weighted' ? `<td class="col-num">${isEdit ? `<input type="text" value="${comp.weight}" onchange="updateComp(${cIndex}, ${compIndex}, 'weight', this.value)">` : comp.weight}</td>` : ''}
                    
                    ${showBreakdown ? `
                    <td class="col-num"><span class="stat-pill">${cInsight.effectiveWeight.toFixed(1)}%</span></td>
                    <td class="col-num"><span class="stat-pill">${cInsight.scorePercent.toFixed(1)}%</span></td>
                    <td class="col-num" style="font-weight:600;">+${cInsight.weightedContribution.toFixed(2)}</td>
                    ` : ''}
                    
                    <td class="edit-only ${isEdit ? '' : 'hidden'}"><button class="btn danger" onclick="removeComp(${cIndex}, ${compIndex})">×</button></td>
                </tr>
            `;
        });

        componentsHtml += `</tbody></table>`;

        catDiv.innerHTML = `
            <div class="cat-header-row">${headerHtml}</div>
            ${settingsHtml}
            ${summaryHtml}
            ${componentsHtml}
            ${isEdit ? `<button class="btn text-btn" style="font-size: 0.85rem;" onclick="addComp(${cIndex})">+ Add Item</button>` : ''}
        `;
        container.appendChild(catDiv);
    });
}

// EVENT LISTENERS / MODIFIERS
window.updateCat = (cIdx, field, val) => { appState.categories[cIdx][field] = val; render(); };
window.removeCat = (cIdx) => { appState.categories.splice(cIdx, 1); render(); };
window.updateComp = (cIdx, compIdx, field, val) => { appState.categories[cIdx].components[compIdx][field] = val; render(); };
window.removeComp = (cIdx, compIdx) => { appState.categories[cIdx].components.splice(compIdx, 1); render(); };
window.addComp = (cIdx) => {
    appState.categories[cIdx].components.push({ id: generateId(), name: "New Item", score: 0, max: 100, weight: "1", extraPoints: 0, capAtMax: true });
    render();
};
window.updateScale = (idx, field, val) => { appState.gradeScale[idx][field] = val; render(); };
window.removeScale = (idx) => { appState.gradeScale.splice(idx, 1); render(); };
window.updateHeartScale = (idx, field, val) => { appState.heartScale[idx][field] = val; render(); };
window.removeHeartScale = (idx) => { appState.heartScale.splice(idx, 1); render(); };

document.getElementById('subject-name').addEventListener('change', (e) => { appState.subject = e.target.value; render(); });
document.getElementById('global-passing').addEventListener('change', (e) => { appState.globalPassingScore = Number(e.target.value); render(); });
document.getElementById('enable-heart-points').addEventListener('change', (e) => { appState.enableHeartPoints = e.target.checked; render(); });

document.getElementById('add-category-btn').addEventListener('click', () => {
    appState.categories.push({ id: generateId(), name: "New Category", weight: "1", calcMode: 'weighted', passingScore: "", capAtMax: true, components: [] });
    render();
});
document.getElementById('add-scale-btn').addEventListener('click', () => { appState.gradeScale.push({ min: 50, grade: 4.00 }); render(); });
document.getElementById('add-heart-scale-btn').addEventListener('click', () => { appState.heartScale.push({ limit: 1.00, mult: 1.00 }); render(); });

document.getElementById('mode-btn').addEventListener('click', () => { appState.isEditMode = !appState.isEditMode; render(); });
document.getElementById('theme-btn').addEventListener('click', () => { appState.darkMode = !appState.darkMode; render(); });
document.getElementById('breakdown-btn').addEventListener('click', () => { appState.showBreakdown = !appState.showBreakdown; render(); });


// navigation/explore
function switchView(viewName) {
    if (viewName === 'calc') {
        document.getElementById('calculator-view').classList.remove('hidden');
        document.getElementById('explore-view').classList.add('hidden');
        document.getElementById('nav-calc-btn').classList.add('active-nav');
        document.getElementById('nav-explore-btn').classList.remove('active-nav');
        
        // Hide specific header controls on explore page
        document.getElementById('mode-btn').classList.remove('hidden');
        document.getElementById('share-btn').classList.remove('hidden');
    } else if (viewName === 'explore') {
        document.getElementById('calculator-view').classList.add('hidden');
        document.getElementById('explore-view').classList.remove('hidden');
        document.getElementById('nav-explore-btn').classList.add('active-nav');
        document.getElementById('nav-calc-btn').classList.remove('active-nav');
        
        document.getElementById('mode-btn').classList.add('hidden');
        document.getElementById('share-btn').classList.add('hidden');
    }
}

document.getElementById('nav-calc-btn').addEventListener('click', () => switchView('calc'));
document.getElementById('nav-explore-btn').addEventListener('click', () => {
    switchView('explore');
    fetchAndRenderCalculators();
});

document.getElementById('search-input').addEventListener('input', (e) => {
    // Basic debounce to avoid spamming the DB
    clearTimeout(window.searchTimeout);
    window.searchTimeout = setTimeout(() => {
        fetchAndRenderCalculators(e.target.value);
    }, 300);
});

async function fetchAndRenderCalculators(searchQuery = '') {
    const grid = document.getElementById('calculators-grid');
    grid.innerHTML = '<p style="color: var(--text-muted);">Loading templates...</p>';
    
    let query = supabaseClient
        .from('calculators')
        .select('id, title, created_at')
        .order('created_at', { ascending: false })
        .limit(30);
        
    if (searchQuery) {
        query = query.ilike('title', `%${searchQuery}%`);
    }
    
    const { data, error } = await query;
    
    if (error) {
        grid.innerHTML = '<p style="color: var(--danger);">Error loading database.</p>';
        return;
    }

    // create card blank
    let html = `
        <div class="calc-card blank-card" onclick="window.location.href=window.location.pathname">
            <span style="font-size: 2rem; margin-bottom: 0.5rem;">+</span>
            <h3>Create Blank Calculator</h3>
        </div>
    `;
    
    if (data.length > 0) {
        html += data.map(calc => {
            const date = new Date(calc.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            return `
            <div class="calc-card" onclick="window.location.href='?id=${calc.id}'">
                <h3>${calc.title}</h3>
                <div class="meta">Added: ${date}</div>
                <button class="btn secondary" style="width: 100%;">Use Template</button>
            </div>
        `}).join('');
    }
    
    grid.innerHTML = html;
}

// SUPABASE: Share Template (Wipes scores, pushes to DB, updates URL)
document.getElementById('share-btn').addEventListener('click', async () => {
    const btn = document.getElementById('share-btn');
    
    // template hasnt changed; copy same link
    if (currentCalculatorId && !hasTemplateChanged()) {
        const shareUrl = window.location.origin + window.location.pathname + '?id=' + currentCalculatorId;
        navigator.clipboard.writeText(shareUrl);
        btn.innerText = "Link Copied!";
        setTimeout(() => render(), 2000);
        return;
    }

    // configuration was changed // brand new so we save to database
    btn.innerText = "Saving...";
    
    const shareState = JSON.parse(JSON.stringify(appState));
    shareState.isEditMode = false;
    shareState.showBreakdown = false;
    
    // Wipe personal scores for the public template
    shareState.categories.forEach(cat => {
        cat.components.forEach(comp => {
            comp.score = 0; comp.extraPoints = 0;
        });
    });

    const { data, error } = await supabaseClient
        .from('calculators')
        .insert([{ title: shareState.subject, config: shareState }])
        .select();

    if (error) {
        console.error("Error saving template", error);
        btn.innerText = "Error Saving";
        setTimeout(() => render(), 2000);
        return;
    }
    
    // Update local context
    currentCalculatorId = data[0].id;
    originalTemplateState = JSON.parse(JSON.stringify(shareState)); 
    const shareUrl = window.location.origin + window.location.pathname + '?id=' + currentCalculatorId;
    window.history.replaceState(null, null, '?id=' + currentCalculatorId);
    
    document.getElementById('share-link-card').classList.remove('hidden');
    document.getElementById('sidebar-share-url').value = shareUrl;
    document.getElementById('class-stats-card').classList.remove('hidden');
    fetchAndRenderStats(currentCalculatorId);
    
    navigator.clipboard.writeText(shareUrl);
    btn.innerText = "Template Saved & Copied!";
    setTimeout(() => render(), 2000); // Reset button text via render
});


document.getElementById('sidebar-copy-btn').addEventListener('click', () => {
    const urlInput = document.getElementById('sidebar-share-url');
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    const btn = document.getElementById('sidebar-copy-btn');
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = "Copy", 2000);
});

// Load Template on Init
async function loadCalculatorFromSupabase() {
    if (!currentCalculatorId) {
        switchView('explore');
        fetchAndRenderCalculators();
        return; 
    }

    switchView('calc');
    document.getElementById('class-stats-card').classList.remove('hidden');
    document.getElementById('share-link-card').classList.remove('hidden');
    document.getElementById('sidebar-share-url').value = window.location.href;

    const { data, error } = await supabaseClient
        .from('calculators')
        .select('config')
        .eq('id', currentCalculatorId)
        .single();

    if (data) {
        appState = { ...defaultState, ...data.config };
        originalTemplateState = JSON.parse(JSON.stringify(appState));
        render();
        fetchAndRenderStats(currentCalculatorId);
    }
}

// Submit Grade Anonymously
document.getElementById('submit-grade-btn').addEventListener('click', async () => {
    if (!currentCalculatorId) return alert("You must be using a saved template to submit grades.");

    const btn = document.getElementById('submit-grade-btn');
    btn.innerText = "Submitting...";
    btn.disabled = true;

    const rawScore = calcInsights.totalRaw; 
    const finalGrade = parseFloat(document.getElementById('final-grade').innerText);

    const { error } = await supabaseClient
        .from('submissions')
        .insert([{ calculator_id: currentCalculatorId, raw_score: rawScore, final_grade: finalGrade }]);

    if (!error) {
        btn.innerText = "Submitted!";
        btn.disabled = true;
        setSubmissionStatus(currentCalculatorId); // Mark as submitted locally
        fetchAndRenderStats(currentCalculatorId, finalGrade); // Unlock the chart!
    } else {
        console.error(error);
        btn.innerText = "Error Submitting";
        btn.disabled = false;
    }
});

async function fetchAndRenderStats(calculatorId, userGrade = null) {
    const isSubmitted = hasUserSubmitted(calculatorId);
    const { data, error } = await supabaseClient
        .from('submissions')
        .select('final_grade')
        .eq('calculator_id', calculatorId);

    if (error || !data) return;

    const N = data.length;
    if (!isSubmitted) {
        document.getElementById('stats-locked-view').classList.remove('hidden');
        document.getElementById('stats-content').classList.add('hidden');
        document.getElementById('stats-minimum-warning').classList.add('hidden');
        return;
    }
    document.getElementById('stats-locked-view').classList.add('hidden');
    
    if (N < 3) { 
        document.getElementById('stats-minimum-warning').classList.remove('hidden');
        document.getElementById('stats-needed').innerText = 3 - N;
        document.getElementById('stats-content').classList.add('hidden');
        return;
    }
    document.getElementById('stats-minimum-warning').classList.add('hidden');
    document.getElementById('stats-content').classList.remove('hidden');

    if (userGrade !== null) {
        const betterScoresCount = grades.filter(g => g < userGrade).length;
        const equalScoresCount = grades.filter(g => g === userGrade).length;
        const percentile = ((betterScoresCount + (0.5 * equalScoresCount)) / N) * 100;
        document.getElementById('user-percentile').innerText = `Top ${Math.max(1, Math.round(percentile))}%`;
    }

    const gradeCounts = {};
    appState.gradeScale.forEach(scale => gradeCounts[scale.grade.toFixed(2)] = 0);
    grades.forEach(g => {
        const key = g.toFixed(2);
        if(gradeCounts[key] !== undefined) gradeCounts[key]++;
    });

    const ctx = document.getElementById('gradeChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(gradeCounts),
            datasets: [{
                label: 'Students',
                data: Object.values(gradeCounts),
                backgroundColor: 'rgba(123, 17, 19, 0.7)',
                borderColor: '#7b1113',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}


render();
loadCalculatorFromSupabase();