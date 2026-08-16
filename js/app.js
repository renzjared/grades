function setFullTheme(themeName) {
    localStorage.setItem('app_full_theme', themeName);
    document.body.setAttribute('data-theme', themeName);
    
    if (typeof chartInstance !== 'undefined' && chartInstance) {
        const primaryColor = getComputedStyle(document.body).getPropertyValue('--up-maroon').trim();
        chartInstance.data.datasets[0].backgroundColor = primaryColor + 'b3'; 
        chartInstance.data.datasets[0].borderColor = primaryColor;
        chartInstance.update();
    }
}

setFullTheme(localStorage.getItem('app_full_theme') || 'light');

function switchView(viewName) {
    document.getElementById('calculator-view').classList.add('hidden');
    document.getElementById('explore-view').classList.add('hidden');
    document.getElementById('assignments-view').classList.add('hidden');
    
    document.getElementById('nav-calc-btn').classList.remove('active-nav');
    document.getElementById('nav-explore-btn').classList.remove('active-nav');
    document.getElementById('nav-assignments-btn').classList.remove('active-nav');

    if (viewName === 'calc') {
        document.getElementById('calculator-view').classList.remove('hidden');
        document.getElementById('nav-calc-btn').classList.add('active-nav');
        document.getElementById('mode-btn').classList.remove('hidden');
        document.getElementById('share-btn').classList.remove('hidden');
    } else if (viewName === 'explore') {
        document.getElementById('explore-view').classList.remove('hidden');
        document.getElementById('nav-explore-btn').classList.add('active-nav');
        document.getElementById('mode-btn').classList.add('hidden');
        document.getElementById('share-btn').classList.add('hidden');
    } else if (viewName === 'assignments') {
        document.getElementById('assignments-view').classList.remove('hidden');
        document.getElementById('nav-assignments-btn').classList.add('active-nav');
        document.getElementById('mode-btn').classList.add('hidden');
        document.getElementById('share-btn').classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('nav-calc-btn').addEventListener('click', () => switchView('calc'));
    
    document.getElementById('nav-explore-btn').addEventListener('click', () => { 
        switchView('explore'); 
        if (typeof fetchAndRenderCalculators === 'function') fetchAndRenderCalculators(); 
    });
    
    document.getElementById('nav-assignments-btn').addEventListener('click', () => { 
        switchView('assignments'); 
        if (typeof renderAssignmentsView === 'function') renderAssignmentsView(); 
    });
    
    document.getElementById('home-link').addEventListener('click', () => { 
        switchView('explore'); 
        if (typeof fetchAndRenderCalculators === 'function') fetchAndRenderCalculators(); 
    });
});