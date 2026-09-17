let warnings = [];
let extras = [];
let notices = [];

let examCat = appState.categories.find(c => c.id === "c_le");
let examComps = examCat ? examCat.components.filter(c => !c.isBonus) : [];
let r_scores = [];
examComps.forEach((le, idx) => {
    if (le.score !== null && le.score !== "") {
        r_scores.push({r: Number(le.score) / le.max, l: Number(le.extraPoints || 0) / le.max, order: idx});
    }
});

r_scores.sort((a,b) => { if (b.r === a.r) return a.order - b.order; return b.r - a.r; });
let R1 = r_scores[0]?.r || 0; let R2 = r_scores[1]?.r || 0; let R3 = r_scores[2]?.r || 0;

let Le = r_scores.reduce((sum, item) => sum + Math.min(item.l, Math.max(0, 0.75 - item.r)), 0);
let L_total = r_scores.reduce((sum, item) => sum + item.l, 0) * 20;

let quizCat = appState.categories.find(c => c.id === "c_quiz");
if (quizCat && quizCat.components[0]) {
   L_total += Number(quizCat.components[0].extraPoints || 0);
}

let exemptionScore = 25*R1 + 20*R2 + 15*R3 + 20*Le;
let attCat = appState.categories.find(c => c.id === "c_att");
let att = attCat ? Number(attCat.components[0].score || 0) : 0;
let isExempt = (r_scores.length === 3 && exemptionScore >= 36 && att >= 3.0);

// Determine Route-Specific Feedback
if (r_scores.length === 3) {
    if (appState.activeRouteId === "r_exempt") {
        if (isExempt) notices.push({type: 'success', text: 'You are eligible for exemption!'});
        else notices.push({type: 'error', text: 'You are NOT eligible for exemption. Please switch to the With Finals tab.'});
    } else if (appState.activeRouteId === "r_finals") {
        if (isExempt) notices.push({type: 'info', text: 'You are eligible for exemption! You may switch to the Exempted tab.'});
    }
    
    extras.push({label: "Exemption Score", value: `${exemptionScore.toFixed(2)} / 36`});
}

extras.push({label: "Total Lifeline Points", value: L_total.toFixed(2)});

let pfg = 25*R1 + 20*R2 + 15*R3;

let csCat = appState.categories.find(c => c.id === "c_cs");
if (csCat && csCat.components[0] && csCat.components[0].score !== null && csCat.components[0].score !== "") {
    pfg += (Number(csCat.components[0].score) / csCat.components[0].max) * 18;
}

let notesCat = appState.categories.find(c => c.id === "c_notes");
if (notesCat && notesCat.components[0] && notesCat.components[0].score !== null && notesCat.components[0].score !== "") {
    pfg += (Number(notesCat.components[0].score) / notesCat.components[0].max) * 9;
}

if (quizCat && quizCat.components[0] && quizCat.components[0].score !== null && quizCat.components[0].score !== "") {
    pfg += (Number(quizCat.components[0].score) / quizCat.components[0].max) * 6;
}
pfg += att;

extras.push({label: "Prefinal Grade (PFG)", value: pfg.toFixed(2)});

let X = pfg;
if (appState.activeRouteId === "r_finals") {
    let finalCat = appState.categories.find(c => c.id === "c_fin");
    if (finalCat && finalCat.components[0] && finalCat.components[0].score !== null && finalCat.components[0].score !== "") {
        let fe = (Number(finalCat.components[0].score) / finalCat.components[0].max) * 100;
        X = 0.75 * pfg + 0.25 * fe;
        extras.push({label: "FE Adjusted Grade", value: X.toFixed(2)});
    }
}

let fg = X + L_total;
if (L_total > 0) {
    for(let i=0; i<10; i++) {
        let f = fg - X - L_total / (1 + Math.exp(0.25*(fg - 84)));
        let df = 1 + (L_total * 0.25 * Math.exp(0.25*(fg - 84))) / Math.pow(1 + Math.exp(0.25*(fg - 84)), 2);
        fg = fg - f/df;
    }
}

return { finalPercentage: fg, totalRaw: X, totalExtra: fg - X, warnings, extras, notices };