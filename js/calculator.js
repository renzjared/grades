let chartInstance = null;

function formatGradeVal(val) {
    const system = appState.gradingSystemType || '1.0-5.0'; 
    if (system === '1.0-5.0') {
        let num = Number(val);
        return (isNaN(num) || val === "" || val === null) ? val : num.toFixed(2);
    }
    if (system === '4.0-0.0') {
        let num = Number(val);
        return (isNaN(num) || val === "" || val === null) ? val : num.toFixed(1);
    }
    return String(val); 
}

const scalePresets = {
    '1.0-5.0': { gradeScale: [{ min: 92, grade: "1.00" }, { min: 88, grade: "1.25" }, { min: 84, grade: "1.50" }, { min: 80, grade: "1.75" }, { min: 76, grade: "2.00" }, { min: 72, grade: "2.25" }, { min: 68, grade: "2.50" }, { min: 64, grade: "2.75" }, { min: 60, grade: "3.00" }, { min: 0,  grade: "5.00" }], heartScale: [{ limit: "2.00", mult: 1.00 }, { limit: "1.75", mult: 0.40 }, { limit: "1.50", mult: 0.16 }, { limit: "1.25", mult: 0.06 }, { limit: "1.00", mult: 0.02 }] },
    '4.0-0.0': { gradeScale: [{ min: 93, grade: "4.0" }, { min: 90, grade: "3.7" }, { min: 87, grade: "3.3" }, { min: 83, grade: "3.0" }, { min: 80, grade: "2.7" }, { min: 77, grade: "2.3" }, { min: 73, grade: "2.0" }, { min: 70, grade: "1.7" }, { min: 67, grade: "1.3" }, { min: 65, grade: "1.0" }, { min: 0, grade: "0.0" }], heartScale: [] },
    'letter': { gradeScale: [{ min: 90, grade: "A" }, { min: 80, grade: "B" }, { min: 70, grade: "C" }, { min: 60, grade: "D" }, { min: 0, grade: "F" }], heartScale: [] },
    'percentage': { gradeScale: [], heartScale: [] }
};

const defaultState = {
    subject: "New Subject",
    description: "",
    isEditMode: true,
    showBreakdown: false,
    globalPassingScore: 60,
    enableHeartPoints: true,
    ignoreBlanks: false,
    targetGradePercent: null,
    gradingSystemType: "1.0-5.0",
    advancedScript: "", 
    routes: [], // Array of {id, name, activeCategories: []}
    activeRouteId: null,
    heartScale: JSON.parse(JSON.stringify(scalePresets['1.0-5.0'].heartScale)),
    categories: [
        { id: generateId(), name: "Lecture", weight: "60", calcMode: 'weighted', passingScore: "", capAtMax: true, dropLowestX: 0, components: [ { id: generateId(), name: "Midterm Exam", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true, isBonus: false }, { id: generateId(), name: "Final Exam", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true, isBonus: false } ] }
    ],
    gradeScale: JSON.parse(JSON.stringify(scalePresets['1.0-5.0'].gradeScale))
};

let appState = JSON.parse(JSON.stringify(defaultState));
let calcInsights = {};
let currentCalculatorId = new URLSearchParams(window.location.search).get('id');
let originalTemplateState = null;

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
    if(typeof switchView === 'function') switchView('calc');
    render();
}

function getCleanTemplateState(state) {
    if (!state) return null;
    const clean = {
        subject: state.subject,
        description: state.description,
        globalPassingScore: state.globalPassingScore,
        enableHeartPoints: state.enableHeartPoints,
        gradingSystemType: state.gradingSystemType,
        advancedScript: state.advancedScript,
        routes: JSON.parse(JSON.stringify(state.routes || [])),
        activeRouteId: state.activeRouteId,
        gradeScale: JSON.parse(JSON.stringify(state.gradeScale || [])),
        heartScale: JSON.parse(JSON.stringify(state.heartScale || [])),
        categories: JSON.parse(JSON.stringify(state.categories || []))
    };
    clean.categories.forEach(cat => { cat.components.forEach(comp => { delete comp.score; delete comp.extraPoints; }); });
    return clean;
}

function hasTemplateChanged() {
    if (!originalTemplateState) return true; 
    const cleanCurrent = getCleanTemplateState(appState);
    const cleanOriginal = getCleanTemplateState(originalTemplateState);
    return JSON.stringify(cleanCurrent) !== JSON.stringify(cleanOriginal);
}

function updateSaveStatus() {
    const saveBtn = document.getElementById('save-cloud-btn');
    const statusText = document.getElementById('save-status-text');
    
    if (!saveBtn || !statusText) return;
    
    if (!appState.isEditMode || document.getElementById('calculator-view').classList.contains('hidden')) {
        saveBtn.style.display = 'none';
        statusText.style.display = 'none';
        return;
    }

    const changed = hasTemplateChanged();
    if (changed || !currentCalculatorId) {
        saveBtn.style.display = 'inline-flex';
        statusText.style.display = 'none';
    } else {
        saveBtn.style.display = 'none';
        statusText.style.display = 'inline-flex';
        statusText.style.alignItems = 'center';
    }
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

function scoreToGrade(percentage) {
    if (!appState.gradeScale || appState.gradeScale.length === 0) return `${percentage.toFixed(2)}%`;
    const scale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
    for (let item of scale) {
        if (percentage >= item.min) return formatGradeVal(item.grade);
    }
    return formatGradeVal(scale[scale.length - 1].grade);
}

function calculateGrades() {
    calcInsights = { categories: [], totalRaw: 0, totalExtra: 0, warnings: [], advancedExtras: [], notices: [], activeHeartIndex: -1, activeGradeIndex: -1, finalPercentage: 0, minRaw: 0, maxRaw: 0, targetNeeded: null };
    
    let totalCatWeightValue = 0;
    
    const activeCatIds = (appState.routes && appState.routes.length > 0 && appState.activeRouteId) 
        ? (appState.routes.find(r => r.id === appState.activeRouteId)?.activeCategories || [])
        : appState.categories.map(c => c.id);

    appState.categories.forEach(cat => {
        if (activeCatIds.includes(cat.id)) totalCatWeightValue += parseWeight(cat.weight);
    });

    let finalR_Weighted = 0;
    let finalE_Weighted = 0;
    let total_missing_r_weighted = 0; 

    appState.categories.forEach((cat, cIdx) => {
        if (!activeCatIds.includes(cat.id)) return; 
        
        let catInsight = { id: cat.id, name: cat.name, components: [], effectiveWeight: 0, rPercent: 0, ePercent: 0, finalContribution: 0 };
        let parsedCatW = parseWeight(cat.weight);
        catInsight.effectiveWeight = totalCatWeightValue > 0 ? (parsedCatW / totalCatWeightValue) * 100 : 0;

        let sumScore = 0, sumMax = 0, sumExtra = 0, missingMax = 0;
        let totalCompWeightValue = 0;
        let catMissingR_percent = 0;
        
        let droppedIndices = [];
        let numDroppable = cat.components.filter(c => !c.isBonus).length;
        let numToDrop = Math.min(cat.dropLowestX || 0, Math.max(0, numDroppable - 1));
        
        if (numToDrop > 0) {
            let droppable = [];
            cat.components.forEach((comp, idx) => {
                if (!comp.isBonus) {
                    let isBlank = (comp.score == null || comp.score === "");
                    let actualScore = isBlank ? 0 : Number(comp.score);
                    let actualExtra = appState.enableHeartPoints ? (comp.extraPoints || 0) : 0;
                    if (comp.capAtMax && comp.max > 0) {
                        if (actualScore > comp.max) actualScore = comp.max;
                        if (actualScore + actualExtra > comp.max) actualExtra = Math.max(0, comp.max - actualScore);
                    }
                    let pct = comp.max > 0 ? (actualScore + actualExtra) / comp.max : 0;
                    droppable.push({ idx, pct });
                }
            });
            droppable.sort((a, b) => a.pct - b.pct);
            droppedIndices = droppable.slice(0, numToDrop).map(d => d.idx);
        }

        let rankedMapping = [];
        if (cat.calcMode === 'ranked') {
            let validComps = cat.components.map((c, i) => ({ ...c, originalIndex: i }))
                .filter((c, i) => !c.isBonus && !droppedIndices.includes(i));
            
            validComps.sort((a, b) => {
                let aBlank = (a.score == null || a.score === "");
                let bBlank = (b.score == null || b.score === "");
                let aPct = aBlank ? 0 : (Number(a.score) + (a.extraPoints||0)) / (a.max||1);
                let bPct = bBlank ? 0 : (Number(b.score) + (b.extraPoints||0)) / (b.max||1);
                return bPct - aPct; 
            });

            let customWeights = (cat.rankedWeights || "").split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
            let sumCustom = customWeights.reduce((a, b) => a + b, 0) || 1;
            
            validComps.forEach((vc, rank) => {
                let assignedWeight = customWeights[rank] !== undefined ? customWeights[rank] : 0;
                rankedMapping[vc.originalIndex] = assignedWeight / sumCustom;
                totalCompWeightValue += assignedWeight / sumCustom;
            });
        } else {
            cat.components.forEach((comp, idx) => {
                if (!comp.isBonus && !droppedIndices.includes(idx)) {
                    if (cat.calcMode === 'weighted') totalCompWeightValue += parseWeight(comp.weight);
                    else sumMax += comp.max;
                }
            });
        }

        let catR = 0, catE = 0;

        cat.components.forEach((comp, compIdx) => {
            let isDropped = droppedIndices.includes(compIdx);
            let compInsight = { effectiveWeight: 0, scorePercent: 0, weightedContribution: 0, isBonus: !!comp.isBonus, isDropped: isDropped };
            
            let isBlank = (comp.score == null || comp.score === "");
            
            let displayScore = isBlank ? 0 : Number(comp.score);
            let displayExtra = appState.enableHeartPoints ? (comp.extraPoints || 0) : 0;
            if (comp.capAtMax && comp.max > 0) {
                if (displayScore > comp.max) displayScore = comp.max;
                if (displayScore + displayExtra > comp.max) displayExtra = Math.max(0, comp.max - displayScore);
            }
            compInsight.scorePercent = comp.max > 0 ? ((displayScore + displayExtra) / comp.max) * 100 : 0;

            let actualScore = (isBlank || comp.isBonus || isDropped) ? 0 : Number(comp.score);
            let actualExtra = (appState.enableHeartPoints && !isDropped) ? (comp.extraPoints || 0) : 0;
            
            if (comp.capAtMax && comp.max > 0) {
                if (actualScore > comp.max) actualScore = comp.max;
                if (actualScore + actualExtra > comp.max) actualExtra = Math.max(0, comp.max - actualScore);
            }

            let pScore = comp.max > 0 ? (actualScore / comp.max) * 100 : 0;
            let pExtra = comp.max > 0 ? (actualExtra / comp.max) * 100 : 0;

            let localWeightFrac = 0;

            if (!isDropped) {
                if (cat.calcMode === 'weighted' || cat.calcMode === 'ranked') {
                    let parsedCompW = cat.calcMode === 'ranked' ? (rankedMapping[compIdx] || 0) : parseWeight(comp.weight);
                    localWeightFrac = totalCompWeightValue > 0 ? (parsedCompW / totalCompWeightValue) : 0;
                    
                    if (isBlank && !comp.isBonus) catMissingR_percent += (localWeightFrac * 100);
                    catR += pScore * localWeightFrac;
                    catE += pExtra * localWeightFrac;

                } else {
                    localWeightFrac = sumMax > 0 ? (comp.max / sumMax) : 0;
                    sumScore += actualScore;
                    sumExtra += actualExtra;
                    if (isBlank && !comp.isBonus) missingMax += comp.max;
                }
            }
            
            if (isDropped) {
                compInsight.effectiveWeight = 0;
                compInsight.weightedContribution = 0;
            } else {
                compInsight.effectiveWeight = localWeightFrac * catInsight.effectiveWeight;
                if (cat.calcMode === 'sum' && !comp.isBonus) {
                     compInsight.weightedContribution = sumMax > 0 ? ((actualScore + actualExtra) / sumMax) * catInsight.effectiveWeight : 0;
                } else if (cat.calcMode === 'sum' && comp.isBonus) {
                     compInsight.weightedContribution = sumMax > 0 ? ((actualScore + actualExtra) / sumMax) * catInsight.effectiveWeight : 0;
                } else {
                     compInsight.weightedContribution = ((pScore + pExtra) / 100) * compInsight.effectiveWeight;
                }
            }

            catInsight.components.push(compInsight);
        });

        if (cat.calcMode === 'sum') {
            if (sumMax > 0) {
                catInsight.rPercent = (sumScore / sumMax) * 100;
                catInsight.ePercent = (sumExtra / sumMax) * 100;
                catMissingR_percent = (missingMax / sumMax) * 100;
            }
        } else {
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

    let base_R = finalR_Weighted; 
    let base_E = finalE_Weighted;
    
    if (appState.advancedScript && appState.advancedScript.trim().length > 0) {
        try {
            const hook = new Function('appState', 'calcInsights', appState.advancedScript);
            const res = hook(appState, calcInsights);
            if (res) {
                if (res.finalPercentage !== undefined) {
                    base_R = res.finalPercentage; 
                    finalR_Weighted = res.totalRaw !== undefined ? res.totalRaw : res.finalPercentage;
                    finalE_Weighted = res.totalExtra !== undefined ? res.totalExtra : 0;
                    total_missing_r_weighted = 0; 
                }
                if (res.warnings) calcInsights.warnings.push(...res.warnings);
                if (res.extras && Array.isArray(res.extras)) calcInsights.advancedExtras = res.extras;
                if (res.notices && Array.isArray(res.notices)) calcInsights.notices = res.notices;
            }
        } catch(e) {
            calcInsights.warnings.push("Advanced Script Error: " + e.message);
        }
    }
    
    function getTruePercentage(R, E) {
        if (!appState.enableHeartPoints || !appState.heartScale || appState.heartScale.length === 0 || !appState.gradeScale || appState.gradeScale.length === 0) return R + E;
        const sortedScale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
        let bestGradeIndex = sortedScale.length;
        let maxP = R;
        appState.heartScale.forEach(rule => {
            let computedPercent = R + (E * rule.mult);
            let computedGradeStr = scoreToGrade(computedPercent);
            let computedIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === computedGradeStr);
            let limitIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === formatGradeVal(rule.limit));
            if (limitIndex === -1) limitIndex = 0;
            let finalIndexForRule = Math.max(computedIndex, limitIndex);
            
            if (finalIndexForRule < bestGradeIndex) {
                bestGradeIndex = finalIndexForRule;
                maxP = Math.max(maxP, computedPercent);
            } else if (finalIndexForRule === bestGradeIndex) {
                maxP = Math.max(maxP, computedPercent);
            }
        });
        if (bestGradeIndex < sortedScale.length) return maxP;
        return R + E;
    }

    calcInsights.minRaw = getTruePercentage(base_R, base_E);
    calcInsights.maxRaw = getTruePercentage(base_R + total_missing_r_weighted, base_E);

    let bestNeededR = Infinity;
    if (appState.targetGradePercent !== null && appState.targetGradePercent !== undefined && total_missing_r_weighted > 0) {
        let targetP = appState.targetGradePercent;
        if (appState.enableHeartPoints && appState.heartScale && appState.heartScale.length > 0 && appState.gradeScale && appState.gradeScale.length > 0) {
            const sortedScale = [...appState.gradeScale].sort((a, b) => b.min - a.min);
            let targetGradeStr = scoreToGrade(targetP);
            let targetGradeIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === targetGradeStr);
            
            appState.heartScale.forEach(rule => {
                let limitIndex = sortedScale.findIndex(g => formatGradeVal(g.grade) === formatGradeVal(rule.limit));
                if (limitIndex === -1) limitIndex = 0;
                
                if (limitIndex <= targetGradeIndex) {
                    let needed = targetP - base_R - (base_E * rule.mult);
                    if (needed < bestNeededR) bestNeededR = needed;
                }
            });
            if (bestNeededR === Infinity) bestNeededR = targetP - base_R;
        } else {
            bestNeededR = targetP - base_R - base_E;
        }
        calcInsights.targetNeeded = (bestNeededR / total_missing_r_weighted) * 100;
    }

    let attempted_weight = 100 - total_missing_r_weighted;
    if (appState.ignoreBlanks && attempted_weight > 0 && attempted_weight < 100 && !appState.advancedScript) {
        finalR_Weighted = (finalR_Weighted / attempted_weight) * 100;
        finalE_Weighted = (finalE_Weighted / attempted_weight) * 100;
    }

    calcInsights.totalRaw = finalR_Weighted;
    calcInsights.totalExtra = finalE_Weighted;
    document.getElementById('final-raw-score').innerText = finalR_Weighted.toFixed(2);

    const rangeDisplay = document.getElementById('range-display');
    if (rangeDisplay) {
        if (total_missing_r_weighted > 0 && !appState.advancedScript) {
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
        if (appState.targetGradePercent !== null && total_missing_r_weighted > 0 && !appState.advancedScript) {
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
    
    const advContainer = document.getElementById('advanced-output-container');
    if (advContainer) {
        if (calcInsights.advancedExtras && calcInsights.advancedExtras.length > 0) {
            advContainer.innerHTML = calcInsights.advancedExtras.map(e => `
                <div style="display:flex; justify-content:space-between; margin-bottom: 0.5rem; font-size: 0.85rem;">
                    <span style="color: var(--text-muted);">${e.label}</span>
                    <strong style="color: var(--text-main);">${e.value}</strong>
                </div>
            `).join('');
        } else {
            advContainer.innerHTML = '<span class="text-muted" style="font-size: 0.85rem;">No advanced variables generated.</span>';
        }
    }
}


function render() {
    calculateGrades(); 

    const idToSave = currentCalculatorId || 'blank';
    localStorage.setItem(`calc_state_${idToSave}`, JSON.stringify(appState));

    const presetSelector = document.getElementById('preset-selector');
    if (presetSelector) presetSelector.value = appState.gradingSystemType || "1.0-5.0";

    const isEdit = appState.isEditMode;
    const showBreakdown = appState.showBreakdown;
    document.getElementById('mode-btn').innerHTML = isEdit ? 'View Mode' : 'Edit Mode';
    document.getElementById('breakdown-btn').innerHTML = showBreakdown ? 'Hide Details' : 'Show Details';
    
    document.querySelectorAll('.edit-only').forEach(el => el.classList.toggle('hidden', !isEdit));
    
    document.getElementById('subject-name').value = appState.subject;
    document.getElementById('calc-description').value = appState.description || '';
    
    document.getElementById('global-passing').value = appState.globalPassingScore;
    document.getElementById('global-passing').disabled = !isEdit;

    document.getElementById('toggle-ignore-blanks').checked = appState.ignoreBlanks;
    document.getElementById('target-grade').value = appState.targetGradePercent !== null && appState.targetGradePercent !== undefined ? appState.targetGradePercent : '';

    const scriptInput = document.getElementById('advanced-script-input');
    if (scriptInput && document.activeElement !== scriptInput) scriptInput.value = appState.advancedScript || '';

    const noticesContainer = document.getElementById('calc-notices-container');
    if (calcInsights.notices && calcInsights.notices.length > 0) {
        noticesContainer.innerHTML = calcInsights.notices.map(n => {
            let icon = 'ℹ️';
            if (n.type === 'success') icon = '✅';
            if (n.type === 'error') icon = '⚠️';
            return `<div class="notice-alert notice-${n.type}"><span>${icon}</span> <span>${n.text}</span></div>`;
        }).join('');
    } else {
        noticesContainer.innerHTML = '';
    }

    const tabsContainer = document.getElementById('calc-tabs-container');
    if ((appState.routes && appState.routes.length > 0) || isEdit) {
        tabsContainer.classList.remove('hidden');
        if (appState.routes && appState.routes.length > 0 && !appState.activeRouteId) {
            appState.activeRouteId = appState.routes[0].id;
        }
        
        let tabsHtml = '';
        if (appState.routes && appState.routes.length > 0) {
            tabsHtml += appState.routes.map(r => `
                <div class="calc-tab ${appState.activeRouteId === r.id ? 'active' : ''}" onclick="switchRoute('${r.id}')">${r.name}</div>
            `).join('');
        }
        
        if (isEdit) {
            tabsHtml += `<div class="edit-only" style="margin-left: auto; display: flex; align-items: center;"><button class="btn secondary" style="padding: 0.2rem 0.5rem; font-size: 0.8rem;" onclick="window.openRoutesManager()">Manage Tabs</button></div>`;
        }
        tabsContainer.innerHTML = tabsHtml;
    } else {
        tabsContainer.classList.add('hidden');
    }

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

    const activeCatIds = (appState.routes && appState.routes.length > 0 && appState.activeRouteId) 
        ? (appState.routes.find(r => r.id === appState.activeRouteId)?.activeCategories || [])
        : appState.categories.map(c => c.id);

    appState.categories.forEach((cat, cIndex) => {
        if (!isEdit && !activeCatIds.includes(cat.id)) return;

        let isRouteInactive = isEdit && !activeCatIds.includes(cat.id);
        let catDisabledStyle = isRouteInactive ? 'opacity: 0.4; border-color: transparent;' : 'transition: all 0.2s;';
        
        const catInsight = calcInsights.categories.find(c => c.id === cat.id) || { effectiveWeight: 0, rPercent: 0, ePercent: 0, finalContribution: 0, components: [] };
        const catDiv = document.createElement('div');
        catDiv.className = 'category-block';
        catDiv.style = catDisabledStyle;

        let headerHtml = isEdit 
            ? `<div style="display:flex; align-items:center;">
                 <input type="text" value="${cat.name}" onchange="updateCat(${cIndex}, 'name', this.value)" class="cat-title-input">
               </div>
               <button class="btn danger" onclick="removeCat(${cIndex})">Delete</button>`
            : `<h3 style="font-size: 1.25rem; font-weight: 600; margin:0; display:flex; align-items:center;">
                 ${cat.name}
               </h3>`;

        let settingsHtml = isEdit ? `
            <div class="cat-settings">
                <div><label>Weight / Fraction:</label> <input type="text" value="${cat.weight}" onchange="updateCat(${cIndex}, 'weight', this.value)" style="width:85px; display:inline-block; padding:0.2rem;"></div>
                <div><label>Mode:</label> 
                    <select onchange="updateCat(${cIndex}, 'calcMode', this.value)" style="width:auto; display:inline-block; padding:0.2rem;">
                        <option value="weighted" ${cat.calcMode === 'weighted' ? 'selected' : ''}>Weighted</option>
                        <option value="sum" ${cat.calcMode === 'sum' ? 'selected' : ''}>Sum Points</option>
                        <option value="ranked" ${cat.calcMode === 'ranked' ? 'selected' : ''}>Ranked Weights</option>
                    </select>
                </div>
                ${cat.calcMode === 'ranked' ? `<div><label>Ranks (%):</label> <input type="text" placeholder="e.g. 25,20,15" value="${cat.rankedWeights || ''}" onchange="updateCat(${cIndex}, 'rankedWeights', this.value)" style="width:100px; display:inline-block; padding:0.2rem;"></div>` : ''}
                <div><label>Drop Lowest:</label> <input type="number" min="0" value="${cat.dropLowestX || 0}" onchange="updateCat(${cIndex}, 'dropLowestX', Number(this.value))" style="width:50px; display:inline-block; padding:0.2rem;"> items</div>
                <div><label>Pass %:</label> <input type="number" placeholder="Global" value="${cat.passingScore}" onchange="updateCat(${cIndex}, 'passingScore', this.value)" style="width:85px; display:inline-block; padding:0.2rem;"></div>
                <div>
                    <label>Cap to Max:</label> 
                    <input type="checkbox" ${cat.capAtMax ? 'checked' : ''} onchange="updateCat(${cIndex}, 'capAtMax', this.checked)" style="width:auto; display:inline-block; vertical-align:middle; margin-left: 4px;">
                </div>
            </div>` : '';

        let summaryHtml = `
            <div class="cat-summary-bar">
                <div class="stat-box">Weight <strong>${catInsight.effectiveWeight ? catInsight.effectiveWeight.toFixed(1) : 0}%</strong></div>
                <div class="stat-box">Category Score <strong>${catInsight.rPercent ? catInsight.rPercent.toFixed(1) : 0}% ${catInsight.ePercent > 0 ? `<span class="heart-text">(+${catInsight.ePercent.toFixed(1)}%)</span>` : ''}</strong></div>
                <div class="stat-box highlight">Final Contribution <strong>+${catInsight.finalContribution ? catInsight.finalContribution.toFixed(2) : 0}</strong></div>
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
            let cInsight = (catInsight.components && catInsight.components[compIndex]) ? catInsight.components[compIndex] : { effectiveWeight: 0, scorePercent: 0, weightedContribution: 0, isBonus: !!comp.isBonus, isDropped: false };
            
            let isBlank = (comp.score == null || comp.score === "");
            let targetHint = '';
            if (isBlank && !comp.isBonus && !cInsight.isDropped && calcInsights.targetNeeded !== null && calcInsights.targetNeeded !== undefined && calcInsights.targetNeeded <= 100 && calcInsights.targetNeeded > 0) {
                let targetPts = (calcInsights.targetNeeded / 100) * comp.max;
                targetHint = `<div style="font-size: 0.75rem; color: var(--up-green); margin-top: 4px; font-weight: 500;">Target: ${targetPts.toFixed(2)}</div>`;
            }

            let effDisplay = cInsight.isDropped ? `<span style="color:var(--up-maroon); font-weight:600;">Dropped</span>` 
                           : comp.isBonus ? `<span style="color:var(--up-green); font-weight:600;">Bonus (+${cInsight.effectiveWeight.toFixed(2)}%)</span>` 
                           : `${cInsight.effectiveWeight.toFixed(2)}%`;

            componentsHtml += `
                <tr style="${cInsight.isDropped ? 'opacity: 0.5;' : ''}">
                    <td class="col-item">${isEdit ? `<input type="text" value="${comp.name}" onchange="updateComp(${cIndex}, ${compIndex}, 'name', this.value)">` : comp.name}</td>
                    
                    <td class="col-num">
                        <input type="number" 
                            value="${comp.score == null || comp.score === '' ? '' : comp.score}" 
                            onchange="updateComp(${cIndex}, ${compIndex}, 'score', this.value === '' ? null : Number(this.value))" 
                            class="input-minimal ${!isEdit && !comp.isBonus && !cInsight.isDropped && !isRouteInactive ? 'view-editable' : ''}" 
                            style="width:85px; ${comp.isBonus || isRouteInactive ? 'opacity: 0.4; cursor: not-allowed; background-color: var(--input-bg);' : ''}"
                            ${comp.isBonus || isRouteInactive ? 'disabled title="Disabled or Bonus"' : ''}>
                        ${!comp.isBonus && !cInsight.isDropped && !isRouteInactive ? targetHint : ''}
                    </td>
                    
                    <td class="col-num">
                        ${isEdit ? `
                            <input type="number" value="${comp.max}" onchange="updateComp(${cIndex}, ${compIndex}, 'max', Number(this.value))" class="input-minimal" style="width:85px;">
                            <div class="cap-control">
                                <div class="cap-control-item">
                                    <input type="checkbox" id="cap-${cIndex}-${compIndex}" ${comp.capAtMax ? 'checked' : ''} onchange="updateComp(${cIndex}, ${compIndex}, 'capAtMax', this.checked)">
                                    <label for="cap-${cIndex}-${compIndex}">Cap</label>
                                </div>
                                <div class="cap-control-item">
                                    <input type="checkbox" id="bonus-${cIndex}-${compIndex}" ${comp.isBonus ? 'checked' : ''} onchange="updateComp(${cIndex}, ${compIndex}, 'isBonus', this.checked)">
                                    <label for="bonus-${cIndex}-${compIndex}" style="color: var(--up-green); font-weight:600;">Bonus</label>
                                </div>
                            </div>
                        ` : comp.max}
                    </td>
                    
                    ${appState.enableHeartPoints ? `
                        <td class="col-num">
                            <input type="number" value="${comp.extraPoints == null || comp.extraPoints === '' ? '' : comp.extraPoints}" 
                                onchange="updateComp(${cIndex}, ${compIndex}, 'extraPoints', this.value === '' ? null : Number(this.value))" 
                                class="input-minimal ${!isEdit && !isRouteInactive ? 'view-editable' : ''}" style="width:85px;" ${isRouteInactive ? 'disabled' : ''}>
                        </td>` : ''}
                        
                    ${cat.calcMode === 'weighted' ? `<td class="col-num">${isEdit ? `<input type="text" value="${comp.weight}" onchange="updateComp(${cIndex}, ${compIndex}, 'weight', this.value)">` : comp.weight}</td>` : ''}
                    
                    ${showBreakdown ? `
                    <td class="col-num"><span class="stat-pill" style="${comp.isBonus ? 'background: rgba(72, 187, 120, 0.1);' : cInsight.isDropped ? 'background: rgba(123, 17, 19, 0.1);' : ''}">${effDisplay}</span></td>
                    <td class="col-num"><span class="stat-pill">${cInsight.isBonus ? 'Bonus' : cInsight.isDropped ? '0.0%' : cInsight.scorePercent.toFixed(1) + '%'}</span></td>
                    <td class="col-num" style="font-weight:600; ${cInsight.isDropped ? 'color: var(--text-muted);' : ''}">+${cInsight.weightedContribution.toFixed(2)}</td>
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

    updateSaveStatus();
}

window.switchRoute = (routeId) => {
    appState.activeRouteId = routeId;
    render();
};

window.openRoutesManager = () => {
    renderRoutesManager();
    document.getElementById('routes-modal').classList.remove('hidden');
};

window.updateCat = (cIdx, field, val) => { appState.categories[cIdx][field] = val; render(); };
window.removeCat = (cIdx) => { appState.categories.splice(cIdx, 1); render(); };
window.updateComp = (cIdx, compIdx, field, val) => { appState.categories[cIdx].components[compIdx][field] = val; render(); };
window.removeComp = (cIdx, compIdx) => { appState.categories[cIdx].components.splice(compIdx, 1); render(); };
window.addComp = (cIdx) => {
    appState.categories[cIdx].components.push({ id: generateId(), name: "New Item", score: null, max: 100, weight: "1", extraPoints: null, capAtMax: true, isBonus: false });
    render();
};
window.updateScale = (idx, field, val) => { appState.gradeScale[idx][field] = val; render(); };
window.removeScale = (idx) => { appState.gradeScale.splice(idx, 1); render(); };
window.updateHeartScale = (idx, field, val) => { appState.heartScale[idx][field] = val; render(); };
window.removeHeartScale = (idx) => { appState.heartScale.splice(idx, 1); render(); };

function renderGrid(elementId, data, includeBlank) {
    const grid = document.getElementById(elementId);
    if (!grid) return;
    let html = '';
    
    if (includeBlank) {
        html += `
            <div class="calc-card blank-card" onclick="resetToBlank()">
                <span style="font-size: 2rem; margin-bottom: 0.5rem;">+</span>
                <h3>Create Blank</h3>
            </div>
        `;
    }
    
    if (data && data.length > 0) {
        html += data.map(calc => {
            const date = new Date(calc.created_at).toLocaleDateString();
            return `
            <div class="calc-card" onclick="window.location.href='?id=${calc.id}'">
                <h3>${calc.title}</h3>
                ${calc.config.description ? `<p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">${calc.config.description}</p>` : ''}
                <div class="meta">Added: ${date}</div>
                <button class="btn secondary" style="width: 100%;">Open</button>
            </div>
        `}).join('');
    } else if (!includeBlank) {
        html += '<p class="text-muted" style="grid-column: 1/-1;">No calculators found here.</p>';
    }
    
    grid.innerHTML = html;
}

async function fetchAndRenderCalculators(searchQuery = '', limitOverride = 8, activeCategory = 'all') {
    const { data: authData } = await supabaseClient.auth.getUser();
    const activeUser = authData?.user;

    if (activeUser && (activeCategory === 'all' || activeCategory === 'my')) {
        let q = supabaseClient.from('calculators').select('id, title, config, created_at').eq('owner_id', activeUser.id).order('created_at', { ascending: false });
        if (searchQuery) q = q.ilike('title', `%${searchQuery}%`);
        if (limitOverride) q = q.limit(limitOverride);
        const { data } = await q;
        renderGrid('my-calcs-grid', data, true); 
    } else if (!activeUser && activeCategory === 'all') {
        document.getElementById('my-calcs-grid').innerHTML = '<p class="text-muted">Please log in to view your templates.</p>';
    }

    if (activeUser && (activeCategory === 'all' || activeCategory === 'shared')) {
        let q = supabaseClient.from('calculator_permissions').select('calculator_id, calculators!inner(id, title, config, created_at)').eq('user_id', activeUser.id);
        if (searchQuery) q = q.ilike('calculators.title', `%${searchQuery}%`);
        const { data } = await q;
        const sharedData = data ? data.map(d => d.calculators).sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limitOverride || 999) : [];
        renderGrid('shared-calcs-grid', sharedData, false);
    } else if (!activeUser && activeCategory === 'all') {
        document.getElementById('shared-calcs-grid').innerHTML = '<p class="text-muted">Please log in to view shared templates.</p>';
    }

    if (activeCategory === 'all' || activeCategory === 'public') {
        let q = supabaseClient.from('calculators').select('id, title, config, created_at').in('link_sharing_mode', ['view', 'edit']).order('created_at', { ascending: false });
        if (searchQuery) q = q.ilike('title', `%${searchQuery}%`);
        if (limitOverride) q = q.limit(limitOverride);
        const { data } = await q;
        renderGrid('public-calcs-grid', data, !activeUser && activeCategory === 'all'); 
    }
    
    document.getElementById('section-my').style.display = (activeCategory === 'all' || activeCategory === 'my') ? 'block' : 'none';
    document.getElementById('section-shared').style.display = (activeCategory === 'all' || activeCategory === 'shared') ? 'block' : 'none';
    document.getElementById('section-public').style.display = (activeCategory === 'all' || activeCategory === 'public') ? 'block' : 'none';
}

async function loadCalculatorFromSupabase() {
    if (!currentCalculatorId) {
        const savedBlank = localStorage.getItem('calc_state_blank');
        if (savedBlank) {
            try { appState = JSON.parse(savedBlank); } catch(e) {}
        }
        
        if (typeof switchView === 'function') switchView('explore');
        fetchAndRenderCalculators();
        return; 
    }

    const { data: authData } = await supabaseClient.auth.getUser();
    const activeUser = authData?.user;

    const { data, error } = await supabaseClient
        .from('calculators')
        .select('*')
        .eq('id', currentCalculatorId)
        .single();

    if (error || !data) {
        document.getElementById('access-denied-modal').classList.remove('hidden');
        return;
    }

    let hasAccess = false;
    if (data.link_sharing_mode === 'view' || data.link_sharing_mode === 'edit') hasAccess = true;
    if (activeUser && data.owner_id === activeUser.id) hasAccess = true;
    
    if (!hasAccess && activeUser) {
        const { data: perm } = await supabaseClient.from('calculator_permissions')
            .select('role')
            .eq('calculator_id', currentCalculatorId)
            .eq('user_id', activeUser.id)
            .single();
        if (perm) hasAccess = true;
    }

    if (!hasAccess) {
        document.getElementById('access-denied-modal').classList.remove('hidden');
        return;
    }

    if (typeof switchView === 'function') switchView('calc');
    document.getElementById('class-stats-card').classList.remove('hidden');

    appState = JSON.parse(JSON.stringify({ ...defaultState, ...data.config }));
    originalTemplateState = JSON.parse(JSON.stringify(appState));
    
    const savedState = localStorage.getItem(`calc_state_${currentCalculatorId}`);
    if (savedState) {
        try { 
            let parsedState = JSON.parse(savedState); 
            if (parsedState.activeRouteId) appState.activeRouteId = parsedState.activeRouteId;
            
            appState.categories.forEach((cat) => {
                let cachedCat = parsedState.categories.find(c => c.id === cat.id);
                if (cachedCat) {
                    cat.components.forEach((comp) => {
                        let cachedComp = cachedCat.components.find(c => c.id === comp.id);
                        if (cachedComp) {
                            comp.score = cachedComp.score;
                            comp.extraPoints = cachedComp.extraPoints;
                        }
                    });
                }
            });
            appState.ignoreBlanks = parsedState.ignoreBlanks || false;
            appState.targetGradePercent = parsedState.targetGradePercent || null;
        } catch(e) {}
    }

    render();
    if (typeof fetchAndRenderStats === 'function') fetchAndRenderStats(currentCalculatorId);
}

function exportCalculator() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${(appState.subject || 'calculator').replace(/\s+/g, '_')}.rzgrade`);
    dlAnchorElem.click();
}

function importCalculator(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedState = JSON.parse(e.target.result);
            appState = { ...defaultState, ...importedState };
            currentCalculatorId = null;
            originalTemplateState = null;
            window.history.replaceState(null, null, window.location.pathname);
            render();
            alert("Calculator imported successfully! It is currently running locally. Click Save to Cloud if you wish to upload it.");
        } catch (err) {
            alert("Invalid .rzgrade file structure.");
        }
    };
    reader.readAsText(file);
    event.target.value = ""; 
}

function renderRoutesManager() {
    const container = document.getElementById('routes-list-container');
    if (!appState.routes) appState.routes = [];
    
    container.innerHTML = appState.routes.map((r, idx) => `
        <div style="background:var(--input-bg); padding:1rem; border-radius:4px; border:1px solid var(--border);">
            <div style="display:flex; gap:0.5rem; margin-bottom:0.5rem;">
                <input type="text" value="${r.name}" onchange="appState.routes[${idx}].name = this.value" placeholder="Tab Name (e.g. Exempted)">
                <button class="btn danger" onclick="appState.routes.splice(${idx}, 1); renderRoutesManager();">×</button>
            </div>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem;">Active Categories for this Tab:</p>
            <div style="display:flex; flex-direction:column; gap:0.25rem;">
                ${appState.categories.map(c => `
                    <label style="font-size:0.85rem; display:flex; align-items:center; gap:4px; cursor:pointer;">
                        <input type="checkbox" ${r.activeCategories.includes(c.id) ? 'checked' : ''} 
                            onchange="if(this.checked) appState.routes[${idx}].activeCategories.push('${c.id}'); else appState.routes[${idx}].activeCategories = appState.routes[${idx}].activeCategories.filter(id=>id!=='${c.id}');">
                        ${c.name}
                    </label>
                `).join('')}
            </div>
        </div>
    `).join('');
}

async function saveCalculatorToCloud() {
    const { data: authData } = await supabaseClient.auth.getUser();
    const activeUser = authData?.user;
    
    if (!activeUser) {
        alert("Please log in to save this calculator to the cloud.");
        document.getElementById('auth-modal').classList.remove('hidden');
        return;
    }

    const saveBtn = document.getElementById('save-cloud-btn');
    const originalText = saveBtn.innerText;
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    try {
        if (currentCalculatorId) {
            const { error } = await supabaseClient
                .from('calculators')
                .update({ title: appState.subject, config: appState })
                .eq('id', currentCalculatorId);
            if (error) throw error;
        } else {
            const { data, error } = await supabaseClient
                .from('calculators')
                .insert([{ title: appState.subject, config: appState, owner_id: activeUser.id, link_sharing_mode: 'restricted' }])
                .select();
            if (error) throw error;
            currentCalculatorId = data[0].id;
            window.history.replaceState(null, null, `?id=${currentCalculatorId}`);
        }
        
        originalTemplateState = JSON.parse(JSON.stringify(appState));
        render(); // Immediately shifts UI to "All changes saved" state
    } catch (err) {
        console.error(err);
        alert("Failed to save to cloud: " + err.message);
    } finally {
        saveBtn.innerText = originalText;
        saveBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('view-all-my-btn')?.addEventListener('click', () => fetchAndRenderCalculators('', null, 'my'));
    document.getElementById('view-all-shared-btn')?.addEventListener('click', () => fetchAndRenderCalculators('', null, 'shared'));
    document.getElementById('view-all-public-btn')?.addEventListener('click', () => fetchAndRenderCalculators('', null, 'public'));

    document.getElementById('export-calc-btn')?.addEventListener('click', exportCalculator);
    document.getElementById('import-calc-btn')?.addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file')?.addEventListener('change', importCalculator);

    document.getElementById('subject-name')?.addEventListener('change', (e) => { appState.subject = e.target.value; render(); });
    document.getElementById('calc-description')?.addEventListener('change', (e) => { appState.description = e.target.value; render(); });
    document.getElementById('advanced-script-input')?.addEventListener('change', (e) => { appState.advancedScript = e.target.value; render(); });

    document.getElementById('mode-btn')?.addEventListener('click', () => { appState.isEditMode = !appState.isEditMode; render(); });
    document.getElementById('breakdown-btn')?.addEventListener('click', () => { appState.showBreakdown = !appState.showBreakdown; render(); });

    document.getElementById('save-cloud-btn')?.addEventListener('click', saveCalculatorToCloud);

    document.getElementById('add-route-btn')?.addEventListener('click', () => {
        appState.routes.push({ id: generateId(), name: "New Tab", activeCategories: appState.categories.map(c=>c.id) });
        renderRoutesManager();
    });
    document.getElementById('save-routes-btn')?.addEventListener('click', () => {
        document.getElementById('routes-modal').classList.add('hidden');
        render();
    });

    // GLOBAL SAVE HOTKEY (Ctrl + S)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            if (!document.getElementById('calculator-view').classList.contains('hidden') && appState.isEditMode) {
                e.preventDefault();
                saveCalculatorToCloud();
            }
        }
    });

    loadCalculatorFromSupabase();
});