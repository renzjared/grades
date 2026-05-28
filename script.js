const SUPABASE_URL = 'https://hjpihzsdebckouckxewi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqcGloenNkZWJja291Y2t4ZXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODY2NjYsImV4cCI6MjA5NTQ2MjY2Nn0.XyXSuxb51G_08PLgrKwt1RvYmVwgIajqCnMWuS_V82c';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let chartInstance = null;

let isGlobalDarkMode = localStorage.getItem('global_dark_mode') === 'true';
function applyGlobalTheme() {
    document.body.setAttribute('data-theme', isGlobalDarkMode ? 'dark' : 'light');
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.innerHTML = isGlobalDarkMode ? 'Light Mode' : 'Dark Mode';
}

function generateId() { return Math.random().toString(36).substr(2, 9); }

function formatGradeVal(val) {
    if (appState.gradingSystemType === '1.0-5.0') {
        let num = Number(val);
        return (isNaN(num) || val === "" || val === null) ? val : num.toFixed(2);
    }
    if (appState.gradingSystemType === '4.0-0.0') {
        let num = Number(val);
        return (isNaN(num) || val === "" || val === null) ? val : num.toFixed(1);
    }
    return val;
}

const scalePresets = {
    '1.0-5.0': {
        gradeScale: [
            { min: 92, grade: "1.00" }, { min: 88, grade: "1.25" },
            { min: 84, grade: "1.50" }, { min: 80, grade: "1.75" },
            { min: 76, grade: "2.00" }, { min: 72, grade: "2.25" },
            { min: 68, grade: "2.50" }, { min: 64, grade: "2.75" },
            { min: 60, grade: "3.00" }, { min: 0,  grade: "5.00" }
        ],
        heartScale: [
            { limit: "2.00", mult: 1.00 }, { limit: "1.75", mult: 0.40 },
            { limit: "1.50", mult: 0.16 }, { limit: "1.25", mult: 0.06 },
            { limit: "1.00", mult: 0.02 }
        ]
    },
    '4.0-0.0': {
        gradeScale: [
            { min: 93, grade: "4.0" }, { min: 90, grade: "3.7" },
            { min: 87, grade: "3.3" }, { min: 83, grade: "3.0" },
            { min: 80, grade: "2.7" }, { min: 77, grade: "2.3" },
            { min: 73, grade: "2.0" }, { min: 70, grade: "1.7" },
            { min: 67, grade: "1.3" }, { min: 65, grade: "1.0" },
            { min: 0, grade: "0.0" }
        ],
        heartScale: []
    },
    'letter': {
        gradeScale: [
            { min: 90, grade: "A" }, { min: 80, grade: "B" },
            { min: 70, grade: "C" }, { min: 60, grade: "D" },
            { min: 0, grade: "F" }
        ],
        heartScale: []
    },
    'percentage': {
        gradeScale: [],
        heartScale: []
    }
};

const defaultState = {
    subject: "New Subject",
    isEditMode: true,
    showBreakdown: false,
    globalPassingScore: 60,
    enableHeartPoints: true,
    ignoreBlanks: false,
    targetGradePercent: null,
    gradingSystemType: "1.0-5.0",
    heartScale: JSON.parse(JSON.stringify(scalePresets['1.0-5.0'].heartScale)),
    categories: [
        {
            id: generateId(), name: "Lecture", weight: "60", calcMode: 'weighted', passingScore: "", capAtMax: true,
            components: [ 
                { id: generateId(), name: "Midterm Exam", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true },
                { id: generateId(), name: "Final Exam", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true }
            ]
        }
    ],
    gradeScale: JSON.parse(JSON.stringify(scalePresets['1.0-5.0'].gradeScale))
};

let appState = JSON.parse(JSON.stringify(defaultState));
let calcInsights = {};
let currentCalculatorId = new URLSearchParams(window.location.search).get('id');

applyGlobalTheme();

function resetToBlank() {
    window.history.replaceState(null, null, window.location.pathname);
    currentCalculatorId = null;
    
    const savedBlank = localStorage.getItem('calc_state_blank');
    if (savedBlank) {
        try { appState = JSON.parse(savedBlank); } 
        catch(e) { appState = JSON.parse(JSON.stringify(defaultState)); }
    } else {
        appState = JSON.parse(JSON.stringify(defaultState));
    }
    
    originalTemplateState = null;
    switchView('calc');
    render();
}

let originalTemplateState = null;
function getCleanTemplateState(state) {
    if (!state) return null;
    const clean = JSON.parse(JSON.stringify(state)); 
    
    delete clean.isEditMode;
    delete clean.showBreakdown; 
    delete clean.ignoreBlanks;
    delete clean.targetGradePercent;
    
    clean.categories.forEach(cat => {
        cat.components.forEach(comp => {
            delete comp.score;
            delete comp.extraPoints;
        });
    });
    return clean;
}

function hasTemplateChanged() {
    if (!originalTemplateState) return true; 
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

function hasUserSubmitted(calculatorId) {
    return localStorage.getItem(`submitted_${calculatorId}`) === 'true';
}

function setSubmissionStatus(calculatorId) {
    localStorage.setItem(`submitted_${calculatorId}`, 'true');
}

function scoreToGrade(percentage) {
    if (!appState.gradeScale || appState.gradeScale.length === 0) return `${percentage.toFixed(2)}%`;
    const scale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
    for (let item of scale) {
        if (percentage >= item.min) return formatGradeVal(item.grade);
    }
    return formatGradeVal(scale[scale.length - 1].grade);
}

function calculateGrades() {
    calcInsights = { categories: [], totalRaw: 0, totalExtra: 0, warnings: [], activeHeartIndex: -1, activeGradeIndex: -1, finalPercentage: 0, minRaw: 0, maxRaw: 0, targetNeeded: null };
    
    let totalCatWeightValue = 0;
    appState.categories.forEach(cat => totalCatWeightValue += parseWeight(cat.weight));

    let finalR_Weighted = 0;
    let finalE_Weighted = 0;
    let total_missing_r_weighted = 0; 

    appState.categories.forEach((cat, cIdx) => {
        let catInsight = { components: [], effectiveWeight: 0, rPercent: 0, ePercent: 0, finalContribution: 0 };
        let parsedCatW = parseWeight(cat.weight);
        catInsight.effectiveWeight = totalCatWeightValue > 0 ? (parsedCatW / totalCatWeightValue) * 100 : 0;

        let sumScore = 0, sumMax = 0, sumExtra = 0, missingMax = 0;
        let totalCompWeightValue = 0;
        let catMissingR_percent = 0;
        
        cat.components.forEach(comp => totalCompWeightValue += parseWeight(comp.weight));

        cat.components.forEach((comp, compIdx) => {
            let compInsight = { effectiveWeight: 0, scorePercent: 0, weightedContribution: 0 };
            
            let isBlank = (comp.score == null || comp.score === "");
            let actualScore = isBlank ? 0 : Number(comp.score);
            let actualExtra = appState.enableHeartPoints ? (comp.extraPoints || 0) : 0;
            
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
                if (isBlank) catMissingR_percent += compInsight.effectiveWeight;
            } else {
                sumScore += actualScore;
                sumMax += comp.max;
                sumExtra += actualExtra;
                if (isBlank) missingMax += comp.max;
            }
            catInsight.components.push(compInsight);
        });

        if (cat.calcMode === 'sum') {
            if (sumMax > 0) {
                catInsight.rPercent = (sumScore / sumMax) * 100;
                catInsight.ePercent = (sumExtra / sumMax) * 100;
                catMissingR_percent = (missingMax / sumMax) * 100;
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
                let isBlank = (c.score == null || c.score === "");
                let actualScore = isBlank ? 0 : Number(c.score);
                let actualExtra = appState.enableHeartPoints ? (c.extraPoints || 0) : 0;
                
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
            if (catInsight.rPercent + catInsight.ePercent > 100) catInsight.ePercent = Math.max(0, 100 - catInsight.rPercent);
            if (catInsight.rPercent + catMissingR_percent > 100) catMissingR_percent = Math.max(0, 100 - catInsight.rPercent);
        }

        catInsight.finalContribution = (catInsight.rPercent + catInsight.ePercent) * (catInsight.effectiveWeight / 100);

        let requiredPass = cat.passingScore !== "" ? Number(cat.passingScore) : appState.globalPassingScore;
        let attemptedCatPercent = 100 - catMissingR_percent;
        if (appState.ignoreBlanks && attemptedCatPercent > 0) {
            if ((catInsight.rPercent / (attemptedCatPercent/100)) < requiredPass) {
                calcInsights.warnings.push(`Current standing for ${cat.name} is below passing (${requiredPass}%).`);
            }
        } else if (!appState.ignoreBlanks && catInsight.rPercent < requiredPass) {
             calcInsights.warnings.push(`${cat.name} score (${catInsight.rPercent.toFixed(1)}%) is below passing (${requiredPass}%).`);
        }

        calcInsights.categories.push(catInsight);
        finalR_Weighted += catInsight.rPercent * (catInsight.effectiveWeight / 100);
        finalE_Weighted += catInsight.ePercent * (catInsight.effectiveWeight / 100);
        total_missing_r_weighted += catMissingR_percent * (catInsight.effectiveWeight / 100);
    });

    let totalEarnedExtra = appState.enableHeartPoints ? finalE_Weighted : 0;
    calcInsights.minRaw = finalR_Weighted + totalEarnedExtra;
    calcInsights.maxRaw = finalR_Weighted + total_missing_r_weighted + totalEarnedExtra;

    let attempted_weight = 100 - total_missing_r_weighted;
    if (appState.ignoreBlanks && attempted_weight > 0 && attempted_weight < 100) {
        finalR_Weighted = (finalR_Weighted / attempted_weight) * 100;
        finalE_Weighted = (finalE_Weighted / attempted_weight) * 100;
    }

    if (appState.targetGradePercent !== undefined && appState.targetGradePercent !== null && total_missing_r_weighted > 0) {
        let missingNeeded = appState.targetGradePercent - calcInsights.minRaw;
        calcInsights.targetNeeded = (missingNeeded / total_missing_r_weighted) * 100;
    }

    calcInsights.totalRaw = finalR_Weighted;
    calcInsights.totalExtra = finalE_Weighted;
    document.getElementById('final-raw-score').innerText = finalR_Weighted.toFixed(2);

    const rangeDisplay = document.getElementById('range-display');
    if (rangeDisplay) {
        if (total_missing_r_weighted > 0) {
            rangeDisplay.classList.remove('hidden');
            let minGradeStr = scoreToGrade(calcInsights.minRaw);
            let maxGradeStr = scoreToGrade(calcInsights.maxRaw);
            document.getElementById('grade-range-values').innerText = `${minGradeStr} to ${maxGradeStr} (${calcInsights.minRaw.toFixed(2)}% to ${calcInsights.maxRaw.toFixed(2)}%)`;
        } else {
            rangeDisplay.classList.add('hidden');
        }
    }

    const targetOutput = document.getElementById('target-output');
    if (targetOutput) {
        if (appState.targetGradePercent !== null && total_missing_r_weighted > 0) {
            targetOutput.classList.remove('hidden');
            let tNeeded = calcInsights.targetNeeded;
            const tnValue = document.getElementById('target-needed-value');
            if (tNeeded > 100) {
                tnValue.innerText = `Impossible (>100% on rest)`;
                tnValue.style.color = 'var(--up-maroon)';
            } else if (tNeeded <= 0) {
                tnValue.innerText = `Goal Achieved!`;
                tnValue.style.color = 'var(--up-green)';
            } else {
                tnValue.innerText = `${tNeeded.toFixed(2)}% avg. on rest`;
                tnValue.style.color = 'inherit';
            }
        } else {
            targetOutput.classList.add('hidden');
        }
    }

    let finalPercentage = finalR_Weighted;
    let finalGradeString = "";
    
    if (finalE_Weighted > 0 && appState.enableHeartPoints) {
        if (appState.heartScale && appState.heartScale.length > 0 && appState.gradeScale && appState.gradeScale.length > 0) {
            const sortedScale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
            let bestGradeIndex = sortedScale.length; 
            
            appState.heartScale.forEach((rule, idx) => {
                let computedPercent = finalR_Weighted + (finalE_Weighted * rule.mult);
                let computedGradeStr = scoreToGrade(computedPercent);
                let computedIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === computedGradeStr);
                
                let limitIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === formatGradeVal(rule.limit));
                if (limitIndex === -1) limitIndex = 0; 
                
                let finalIndexForRule = Math.max(computedIndex, limitIndex);
                
                if (finalIndexForRule < bestGradeIndex) {
                    bestGradeIndex = finalIndexForRule;
                    calcInsights.activeHeartIndex = idx;
                    finalPercentage = Math.max(finalPercentage, computedPercent);
                }
            });
            
            if (bestGradeIndex < sortedScale.length) {
                finalGradeString = formatGradeVal(sortedScale[bestGradeIndex].grade);
                calcInsights.activeGradeIndex = appState.gradeScale.findIndex(g => formatGradeVal(g.grade) === finalGradeString);
            }
        } else {
            finalPercentage = finalR_Weighted + finalE_Weighted;
            finalGradeString = scoreToGrade(finalPercentage);
            if (appState.gradeScale && appState.gradeScale.length > 0) {
                calcInsights.activeGradeIndex = appState.gradeScale.findIndex(g => formatGradeVal(g.grade) === finalGradeString);
            }
        }
    } else {
        finalGradeString = scoreToGrade(finalPercentage);
        if (appState.gradeScale && appState.gradeScale.length > 0) {
            calcInsights.activeGradeIndex = appState.gradeScale.findIndex(g => formatGradeVal(g.grade) === finalGradeString);
        }
    }
    
    calcInsights.finalPercentage = finalPercentage;

    if (finalE_Weighted > 0 && appState.enableHeartPoints) {
        let multText = "";
        if (calcInsights.activeHeartIndex !== -1 && appState.heartScale && appState.heartScale.length > 0) {
            let mult = appState.heartScale[calcInsights.activeHeartIndex].mult;
            multText = ` (${(mult * 100).toFixed(0)}%)`;
        }
        document.getElementById('final-heart-score').innerText = `+${finalE_Weighted.toFixed(2)}% Extra Points ❤️${multText}`;
    } else {
        document.getElementById('final-heart-score').innerText = '';
    }

    const gradeDisplay = document.getElementById('final-grade');
    gradeDisplay.innerText = finalGradeString;
    gradeDisplay.style.color = finalPercentage >= appState.globalPassingScore ? "var(--up-green)" : "var(--up-maroon)";
    
    document.getElementById('passing-warnings').innerHTML = calcInsights.warnings.map(w => `<div>⚠️ ${w}</div>`).join('');
}


function render() {
    calculateGrades(); 

    const idToSave = currentCalculatorId || 'blank';
    localStorage.setItem(`calc_state_${idToSave}`, JSON.stringify(appState));

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

    const presetSelector = document.getElementById('preset-selector');
    if (presetSelector) presetSelector.value = appState.gradingSystemType || "1.0-5.0";

    const isEdit = appState.isEditMode;
    const showBreakdown = appState.showBreakdown;
    document.getElementById('mode-btn').innerHTML = isEdit ? 'View Mode' : 'Edit Mode';
    document.getElementById('breakdown-btn').innerHTML = showBreakdown ? 'Hide Details' : 'Show Details';
    
    document.querySelectorAll('.edit-only').forEach(el => el.classList.toggle('hidden', !isEdit));
    
    document.getElementById('subject-name').value = appState.subject;
    document.getElementById('global-passing').value = appState.globalPassingScore;
    document.getElementById('global-passing').disabled = !isEdit;

    document.getElementById('toggle-ignore-blanks').checked = appState.ignoreBlanks;
    document.getElementById('target-grade').value = appState.targetGradePercent !== null && appState.targetGradePercent !== undefined ? appState.targetGradePercent : '';

    const scaleBody = document.getElementById('grade-scale-body');
    if (appState.gradeScale && appState.gradeScale.length > 0) {
        document.querySelector('.grade-scale-card').classList.remove('hidden');
        scaleBody.innerHTML = appState.gradeScale.map((item, idx) => `
            <tr class="${idx === calcInsights.activeGradeIndex ? 'active-grade-row' : ''}">
                <td>${isEdit ? `<input type="number" value="${item.min}" onchange="updateScale(${idx}, 'min', Number(this.value))" class="input-minimal" style="width:85px;">%` : `≥ ${item.min}%`}</td>
                <td style="font-weight: 500;">${isEdit ? `<input type="text" value="${formatGradeVal(item.grade)}" onchange="updateScale(${idx}, 'grade', this.value)" class="input-minimal" style="width:85px;">` : formatGradeVal(item.grade)}</td>
                <td class="edit-only ${isEdit ? '' : 'hidden'}"><button class="btn danger" onclick="removeScale(${idx})">×</button></td>
            </tr>
        `).join('');
    } else {
        document.querySelector('.grade-scale-card').classList.add('hidden');
    }

    const heartToggle = document.getElementById('enable-heart-points');
    heartToggle.checked = appState.enableHeartPoints;
    heartToggle.disabled = !appState.isEditMode;
    
    const heartCard = document.querySelector('.heart-scale-card');
    if (!appState.enableHeartPoints || !appState.heartScale || appState.heartScale.length === 0) {
        heartCard.classList.add('hidden');
    } else {
        heartCard.classList.remove('hidden');
        const heartBody = document.getElementById('heart-scale-body');
        if (appState.heartScale) {
            heartBody.innerHTML = appState.heartScale.map((item, idx) => `
                <tr class="${idx === calcInsights.activeHeartIndex ? 'active-grade-row' : ''}">
                    <td><span style="font-size: 0.8rem; ${idx === calcInsights.activeHeartIndex ? 'color: inherit;' : 'color: var(--text-muted);'}">Max Grade:</span> ${isEdit ? `<input type="text" value="${formatGradeVal(item.limit)}" onchange="updateHeartScale(${idx}, 'limit', this.value)" class="input-minimal" style="width:85px;">` : `<span style="font-weight: 500;">${formatGradeVal(item.limit)}</span>`}</td>
                    <td><span style="font-size: 0.8rem; ${idx === calcInsights.activeHeartIndex ? 'color: inherit;' : 'color: var(--text-muted);'}">Mult:</span> ${isEdit ? `<input type="number" value="${item.mult}" step="0.01" onchange="updateHeartScale(${idx}, 'mult', Number(this.value))" class="input-minimal" style="width:85px;">` : `<span style="font-weight: 500;">${item.mult.toFixed(2)}x</span>`}</td>
                    <td class="edit-only ${isEdit ? '' : 'hidden'}"><button class="btn danger" onclick="removeHeartScale(${idx})">×</button></td>
                </tr>
            `).join('');
        }
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
                        ${appState.enableHeartPoints ? `<th class="col-num"><span class="heart-text">Extra</span></th>` : ''}
                        ${cat.calcMode === 'weighted' ? `<th class="col-num">Weight</th>` : ''}
                        ${showBreakdown ? `<th class="col-num">Eff. %</th><th class="col-num">Score %</th><th class="col-num">Contrib.</th>` : ''}
                        <th class="edit-only ${isEdit ? '' : 'hidden'}" style="width: 30px;"></th>
                    </tr>
                </thead>
                <tbody>
        `;

        cat.components.forEach((comp, compIndex) => {
            let cInsight = catInsight.components[compIndex];
            
            let isBlank = (comp.score == null || comp.score === "");
            let targetHint = '';
            if (isBlank && calcInsights.targetNeeded !== null && calcInsights.targetNeeded !== undefined && calcInsights.targetNeeded <= 100 && calcInsights.targetNeeded > 0) {
                let targetPts = (calcInsights.targetNeeded / 100) * comp.max;
                targetHint = `<div style="font-size: 0.75rem; color: var(--up-green); margin-top: 4px; font-weight: 500;">Target: ${targetPts.toFixed(2)}</div>`;
            }

            componentsHtml += `
                <tr>
                    <td class="col-item">${isEdit ? `<input type="text" value="${comp.name}" onchange="updateComp(${cIndex}, ${compIndex}, 'name', this.value)">` : comp.name}</td>
                    
                    <td class="col-num">
                        <input type="number" value="${comp.score == null || comp.score === '' ? '' : comp.score}" onchange="updateComp(${cIndex}, ${compIndex}, 'score', this.value === '' ? null : Number(this.value))" class="input-minimal ${!isEdit ? 'view-editable' : ''}" style="width:85px;">
                        ${targetHint}
                    </td>
                    
                    <td class="col-num">
                        ${isEdit ? `
                            <input type="number" value="${comp.max}" onchange="updateComp(${cIndex}, ${compIndex}, 'max', Number(this.value))" class="input-minimal" style="width:85px;">
                            <div class="cap-control">
                                <input type="checkbox" id="cap-${cIndex}-${compIndex}" ${comp.capAtMax ? 'checked' : ''} onchange="updateComp(${cIndex}, ${compIndex}, 'capAtMax', this.checked)">
                                <label for="cap-${cIndex}-${compIndex}">Cap</label>
                            </div>
                        ` : comp.max}
                    </td>
                    
                    ${appState.enableHeartPoints ? `
                        <td class="col-num">
                            <input type="number" value="${comp.extraPoints == null || comp.extraPoints === '' ? '' : comp.extraPoints}" 
                                onchange="updateComp(${cIndex}, ${compIndex}, 'extraPoints', this.value === '' ? null : Number(this.value))" 
                                class="input-minimal ${!isEdit ? 'view-editable' : ''}" style="width:85px;">
                        </td>` : ''}
                        
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

window.updateCat = (cIdx, field, val) => { appState.categories[cIdx][field] = val; render(); };
window.removeCat = (cIdx) => { appState.categories.splice(cIdx, 1); render(); };
window.updateComp = (cIdx, compIdx, field, val) => { appState.categories[cIdx].components[compIdx][field] = val; render(); };
window.removeComp = (cIdx, compIdx) => { appState.categories[cIdx].components.splice(compIdx, 1); render(); };
window.addComp = (cIdx) => {
    appState.categories[cIdx].components.push({ id: generateId(), name: "New Item", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true });
    render();
};
window.updateScale = (idx, field, val) => { appState.gradeScale[idx][field] = val; render(); };
window.removeScale = (idx) => { appState.gradeScale.splice(idx, 1); render(); };
window.updateHeartScale = (idx, field, val) => { appState.heartScale[idx][field] = val; render(); };
window.removeHeartScale = (idx) => { appState.heartScale.splice(idx, 1); render(); };

document.getElementById('subject-name').addEventListener('change', (e) => { appState.subject = e.target.value; render(); });
document.getElementById('global-passing').addEventListener('change', (e) => { appState.globalPassingScore = Number(e.target.value); render(); });
document.getElementById('enable-heart-points').addEventListener('change', (e) => { appState.enableHeartPoints = e.target.checked; render(); });
document.getElementById('toggle-ignore-blanks').addEventListener('change', (e) => { appState.ignoreBlanks = e.target.checked; render(); });
document.getElementById('target-grade').addEventListener('input', (e) => { appState.targetGradePercent = e.target.value === '' ? null : Number(e.target.value); render(); });

document.getElementById('theme-btn').addEventListener('click', () => { 
    isGlobalDarkMode = !isGlobalDarkMode; 
    localStorage.setItem('global_dark_mode', isGlobalDarkMode);
    applyGlobalTheme();
});

document.getElementById('preset-selector').addEventListener('change', (e) => {
    const selected = e.target.value;
    appState.gradingSystemType = selected;
    if (scalePresets[selected]) {
        appState.gradeScale = JSON.parse(JSON.stringify(scalePresets[selected].gradeScale));
        appState.heartScale = JSON.parse(JSON.stringify(scalePresets[selected].heartScale));
    }
    render();
});

document.getElementById('add-category-btn').addEventListener('click', () => {
    appState.categories.push({ id: generateId(), name: "New Category", weight: "1", calcMode: 'weighted', passingScore: "", capAtMax: true, components: [] });
    render();
});
document.getElementById('add-scale-btn').addEventListener('click', () => { appState.gradeScale.push({ min: 50, grade: "4.00" }); render(); });
document.getElementById('add-heart-scale-btn').addEventListener('click', () => { appState.heartScale.push({ limit: "1.00", mult: 1.00 }); render(); });

document.getElementById('mode-btn').addEventListener('click', () => { appState.isEditMode = !appState.isEditMode; render(); });
document.getElementById('breakdown-btn').addEventListener('click', () => { appState.showBreakdown = !appState.showBreakdown; render(); });
document.getElementById('reset-scores-btn').addEventListener('click', (e) => {
    appState.categories.forEach(cat => {
        cat.components.forEach(comp => {
            comp.score = null;
            comp.extraPoints = null;
        });
    });
    render();
    
    const btn = e.target;
    btn.innerText = "✓ Scores Reset!";
    setTimeout(() => btn.innerText = "↺ Reset Scores", 2000);
});

function switchView(viewName) {
    if (viewName === 'calc') {
        document.getElementById('calculator-view').classList.remove('hidden');
        document.getElementById('explore-view').classList.add('hidden');
        document.getElementById('nav-calc-btn').classList.add('active-nav');
        document.getElementById('nav-explore-btn').classList.remove('active-nav');
        
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

document.getElementById('home-link').addEventListener('click', () => {
    switchView('explore');
    fetchAndRenderCalculators();
});

document.getElementById('search-input').addEventListener('input', (e) => {
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

    let html = `
        <div class="calc-card blank-card" onclick="resetToBlank()">
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

document.getElementById('share-btn').addEventListener('click', async () => {
    const btn = document.getElementById('share-btn');
    
    if (currentCalculatorId && !hasTemplateChanged()) {
        const shareUrl = window.location.origin + window.location.pathname + '?id=' + currentCalculatorId;
        navigator.clipboard.writeText(shareUrl);
        btn.innerText = "Link Copied!";
        setTimeout(() => render(), 2000);
        return;
    }

    btn.innerText = "Saving...";
    
    const shareState = JSON.parse(JSON.stringify(appState));
    shareState.isEditMode = false;
    shareState.showBreakdown = false;
    shareState.targetGradePercent = null; 
    shareState.ignoreBlanks = false;
    
    shareState.categories.forEach(cat => {
        cat.components.forEach(comp => {
            comp.score = null; comp.extraPoints = null;
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
    setTimeout(() => render(), 2000); 
});

document.getElementById('sidebar-copy-btn').addEventListener('click', () => {
    const urlInput = document.getElementById('sidebar-share-url');
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    const btn = document.getElementById('sidebar-copy-btn');
    btn.innerText = "Copied!";
    setTimeout(() => btn.innerText = "Copy", 2000);
});

async function loadCalculatorFromSupabase() {
    if (!currentCalculatorId) {
        const savedBlank = localStorage.getItem('calc_state_blank');
        if (savedBlank) {
            try { appState = JSON.parse(savedBlank); } catch(e) {}
        }
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
        originalTemplateState = JSON.parse(JSON.stringify({ ...defaultState, ...data.config }));
        
        const savedState = localStorage.getItem(`calc_state_${currentCalculatorId}`);
        if (savedState) {
            try { 
                let parsedState = JSON.parse(savedState); 
                if (parsedState.subject === "New Subject" && data.config.subject !== "New Subject") {
                    appState = { ...defaultState, ...data.config };
                } else {
                    appState = { ...defaultState, ...data.config, ...parsedState }; 
                }
            } catch(e) { 
                appState = { ...defaultState, ...data.config }; 
            }
        } else {
            appState = { ...defaultState, ...data.config };
        }

        render();
        fetchAndRenderStats(currentCalculatorId);
    }

    const btn = document.getElementById('submit-grade-btn');
    if (hasUserSubmitted(currentCalculatorId)) {
        btn.innerText = "Submitted!";
        btn.disabled = true;
    } else {
        btn.innerText = "Submit My Grade";
        btn.disabled = false;
    }
}

document.getElementById('submit-grade-btn').addEventListener('click', async () => {
    if (!currentCalculatorId) return alert("You must be using a saved template to submit grades.");

    const btn = document.getElementById('submit-grade-btn');
    btn.innerText = "Submitting...";
    btn.disabled = true;

    const rawScore = calcInsights.finalPercentage; 
    const finalGrade = document.getElementById('final-grade').innerText;

    const { error } = await supabaseClient
        .from('submissions')
        .insert([{ calculator_id: currentCalculatorId, raw_score: rawScore, final_grade: finalGrade }]);

    if (!error) {
        btn.innerText = "Submitted!";
        btn.disabled = true;
        setSubmissionStatus(currentCalculatorId); 
        fetchAndRenderStats(currentCalculatorId, rawScore); 
    } else {
        console.error(error);
        btn.innerText = "Error Submitting";
        btn.disabled = false;
    }
});

async function fetchAndRenderStats(calculatorId, userRawScore = null) {
    const lockedView = document.getElementById('stats-locked-view');
    const content = document.getElementById('stats-content');
    const warning = document.getElementById('stats-minimum-warning');
    if (!lockedView || !content || !warning) return; 
    
    const isSubmitted = hasUserSubmitted(calculatorId);
    
    const { data, error } = await supabaseClient
        .from('submissions')
        .select('final_grade, raw_score')
        .eq('calculator_id', calculatorId);

    if (error || !data) return;

    const N = data.length;

    if (!isSubmitted) {
        lockedView.classList.remove('hidden');
        content.classList.add('hidden');
        warning.classList.add('hidden');
        return;
    }
    lockedView.classList.add('hidden');
    
    if (N < 3) { 
        warning.classList.remove('hidden');
        document.getElementById('stats-needed').innerText = 3 - N;
        content.classList.add('hidden');
        return;
    }
    warning.classList.add('hidden');
    content.classList.remove('hidden');

    const rawScores = data.map(d => d.raw_score);
    let targetRaw = userRawScore !== null ? userRawScore : calcInsights.finalPercentage;
    
    if (targetRaw !== undefined && !isNaN(targetRaw)) {
        const betterScoresCount = rawScores.filter(s => s > targetRaw).length;
        const equalScoresCount = rawScores.filter(s => s === targetRaw).length;
        const percentile = ((betterScoresCount + (0.5 * equalScoresCount)) / N) * 100;
        document.getElementById('user-percentile').innerText = `Top ${Math.max(1, Math.round(percentile))}%`;
    }

    const grades = data.map(d => d.final_grade);
    const gradeCounts = {};
    
    if (appState.gradeScale && appState.gradeScale.length > 0) {
        appState.gradeScale.forEach(scale => gradeCounts[formatGradeVal(scale.grade)] = 0);
        grades.forEach(g => {
            const key = formatGradeVal(g);
            if(gradeCounts[key] !== undefined) gradeCounts[key]++;
        });
    } else {
        grades.forEach(g => {
            const key = formatGradeVal(g);
            if(gradeCounts[key] === undefined) gradeCounts[key] = 0;
            gradeCounts[key]++;
        });
    }

    const ctx = document.getElementById('gradeChart').getContext('2d');
    if (chartInstance) chartInstance.destroy();

    let labels = [];
    let values = [];

    if (appState.gradeScale && appState.gradeScale.length > 0) {
        const scale = [...appState.gradeScale];

        const isNumeric = !isNaN(scale[0].grade);
        if (isNumeric) {
            scale.sort((a, b) => Number(a.grade) - Number(b.grade));
        }
        labels = scale.map(s => formatGradeVal(s.grade));
        values = labels.map(l => gradeCounts[l] || 0);

    } else {
        labels = Object.keys(gradeCounts).sort((a, b) => {
            let numA = Number(a); let numB = Number(b);
            if(!isNaN(numA) && !isNaN(numB)) return numA - numB;
            return a.localeCompare(b);
        });
        values = labels.map(l => gradeCounts[l]);
    }

    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Students',
                data: values,
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

loadCalculatorFromSupabase();