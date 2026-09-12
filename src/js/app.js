// ── GymLab App Logic ──

let allExercises = [];
let selectedExerciseId = 'bench_press';
let currentFilter = 'all';
let statsDays = 30;
let calChart = null;
let distChart = null;
let progressChart = null;
let bwChart = null;
let exProgressChart = null;

// Convenience shorthand
const _t = (key, params) => window.GymLabI18n.t(key, params);
const _formatDate = (date, opts) => window.GymLabI18n.formatDate(date, opts);

// ── Toast notifications ──
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { success: '#22c55e', error: '#ef4444', info: '#3b82f6', warning: '#f97316' };
    toast.style.cssText = `pointer-events:auto;padding:12px 20px;border-radius:10px;background:#18181b;border:1px solid ${colors[type] || colors.info};color:#fafafa;font-size:13px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,.4);animation:slideIn .2s ease;max-width:360px`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .2s'; setTimeout(() => toast.remove(), 200); }, duration);
}

// ── Safe invoke wrapper ──
async function safeInvoke(cmd, args = {}) {
    try {
        const bridge = window.gymLabInvoke;
        if (typeof bridge !== 'function') throw new Error('IPC bridge unavailable');
        return await bridge(cmd, args);
    } catch (err) {
        showToast(`Error: ${err.message || err}`, 'error');
        return null;
    }
}

function formatWorkoutWeight(workout) {
    return workout?.weight_known === false ? _t('weight.unknown') : `${workout?.weight_kg ?? 0}kg`;
}

const CATEGORIES = [
    { id: 'strength', labelKey: 'cat.strength', icon: 'strength' },
    { id: 'cardio', labelKey: 'cat.cardio', icon: 'cardio' },
    { id: 'hiit', labelKey: 'cat.hiit', icon: 'hiit' },
    { id: 'flexibility', labelKey: 'cat.flexibility', icon: 'flexibility' },
];

// ── i18n: Apply translations to all [data-i18n] elements ──
function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = _t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = _t(key);
    });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    applyTranslations();
    allExercises = (await safeInvoke('get_exercises')) || [];
    injectIcons();
    buildUI();
    setupNav();
    setupAddPage();
    setupHistoryPage();
    setupStatsPage();
    setupRecordsPage();
    setupWeightPage();
    setupSettingsPage();
    setupTimer();
    loadHomePage();
});

function injectIcons() {
    document.querySelectorAll('[data-icon]').forEach(el => {
        el.innerHTML = icon(el.dataset.icon);
    });
}

function buildUI() {
    document.getElementById('logo-icon').innerHTML = icon('dumbbell', 28);
    document.getElementById('menu-btn').innerHTML = icon('menu', 22);
    document.getElementById('timer-fab').innerHTML = icon('timer', 24);

    document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card fire"><div class="stat-icon" data-icon="flame"></div><div class="stat-value" id="stat-today-cal">0</div><div class="stat-label">${_t('home.stat_today_cal')}</div></div>
        <div class="stat-card blue"><div class="stat-icon" data-icon="calendar"></div><div class="stat-value" id="stat-week-cal">0</div><div class="stat-label">${_t('home.stat_week_cal')}</div></div>
        <div class="stat-card green"><div class="stat-icon" data-icon="dumbbell"></div><div class="stat-value" id="stat-week-count">0</div><div class="stat-label">${_t('home.stat_week_count')}</div></div>
        <div class="stat-card purple"><div class="stat-icon" data-icon="trophy"></div><div class="stat-value" id="stat-month-count">0</div><div class="stat-label">${_t('home.stat_month_count')}</div></div>
    `;

    document.getElementById('category-chips').innerHTML = CATEGORIES.map(c =>
        `<button class="chip ${c.id === 'strength' ? 'active' : ''}" data-category="${c.id}">${icon(c.icon, 16)} ${_t(c.labelKey)}</button>`
    ).join('');

    document.getElementById('history-filters').innerHTML =
        `<button class="chip active" data-filter="all">${_t('cat.all')}</button>` +
        CATEGORIES.map(c => `<button class="chip" data-filter="${c.id}">${icon(c.icon, 16)}</button>`).join('');

    document.getElementById('stats-filters').innerHTML = [7, 14, 30].map(d =>
        `<button class="chip range-chip ${d === 30 ? 'active' : ''}" data-days="${d}">${d} ${_t('format.days_short')}</button>`
    ).join('');

    // Exercise selector for progress chart
    const sel = document.getElementById('exercise-select-progress');
    sel.innerHTML = allExercises.map(e => `<option value="${e.id}">${e.name_vi}</option>`).join('');

    injectIcons();
}

// ── Navigation ──
function setupNav() {
    const menuBtn = document.getElementById('menu-btn');
    const overlay = document.getElementById('menu-overlay');
    const sidebar = document.getElementById('sidebar');
    function openMenu() { sidebar.classList.add('open'); overlay.classList.add('open'); menuBtn.setAttribute('aria-expanded', 'true'); }
    function closeMenu() { sidebar.classList.remove('open'); overlay.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
    if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeMenu() : openMenu());
    }
    if (overlay) overlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(x => x.classList.remove('active'));
            li.classList.add('active');
            const page = li.dataset.page;
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            const pageEl = document.getElementById('page-' + page);
            pageEl.classList.add('active');
            closeMenu();
            // Focus management: move focus to page heading for screen readers
            const heading = pageEl.querySelector('h1');
            if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
            announcePage(page);
            const loaders = { home: loadHomePage, history: loadHistory, stats: loadStats, records: loadRecords, weight: loadWeight, settings: loadSettings, add: loadTemplates };
            if (loaders[page]) loaders[page]();
        });
    });
}

// ── Home Page ──
async function loadHomePage() {
    const name = (await safeInvoke('get_user_name')) || '';
    document.getElementById('greeting').textContent = name ? _t('home.greeting', { name }) : _t('home.greeting_default');
    document.getElementById('date-display').textContent = _formatDate(new Date(), { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });

    const workouts = (await safeInvoke('get_all_workouts')) || [];
    const today = new Date().toISOString().slice(0, 10);
    const todayWorkouts = workouts.filter(w => w.date.slice(0, 10) === today);
    document.getElementById('stat-today-cal').textContent = Math.round(todayWorkouts.reduce((s, w) => s + w.calories_burned, 0));

    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekW = workouts.filter(w => new Date(w.date) >= weekStart);
    document.getElementById('stat-week-cal').textContent = Math.round(weekW.reduce((s, w) => s + w.calories_burned, 0));
    document.getElementById('stat-week-count').textContent = weekW.length;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    document.getElementById('stat-month-count').textContent = workouts.filter(w => new Date(w.date) >= monthStart).length;

    const listEl = document.getElementById('today-list');
    if (todayWorkouts.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="dumbbell"></div><p>${_t('home.no_workouts_today')}</p></div>`;
    } else {
        listEl.innerHTML = todayWorkouts.map(w => `<div class="workout-item">
            <span class="wi-icon" data-icon="${getExerciseIcon(w.exercise_id)}"></span>
            <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
            <div class="wi-detail">${w.sets}×${w.reps} × ${formatWorkoutWeight(w)} · ${w.calories_burned.toFixed(1)} ${_t('format.kcal')}</div></div>
            <button class="wi-delete" onclick="quickRelog('${w.id}')" aria-label="${_t('relog.re_log')}" title="${_t('relog.re_log')}">${icon('repeat', 16)}</button>
        </div>`).join('');
    }

    // Top 3 PRs on home
    const prs = (await safeInvoke('get_personal_records')) || [];
    const prEl = document.getElementById('home-pr');
    if (prs.length === 0) {
        prEl.innerHTML = `<div class="empty-state"><p>${_t('home.no_records')}</p></div>`;
    } else {
        prEl.innerHTML = prs.slice(0, 3).map(pr => `<div class="pr-card">
            <div class="pr-icon">${icon(getExerciseIcon(pr.exercise_id), 20)}</div>
            <div class="pr-info"><div class="pr-name">${pr.exercise_name}</div><div class="pr-detail">${pr.max_reps} reps</div></div>
            <div class="pr-value">${pr.max_weight}kg</div>
        </div>`).join('');
    }
    injectIcons();
}

// ── Quick Re-log ──
async function quickRelog(id) {
    const result = await safeInvoke('quick_relog', { workout_id: id });
    if (result) { loadHomePage(); }
}

// ── Add Workout ──
function setupAddPage() {
    document.querySelectorAll('#category-chips .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderExercises(chip.dataset.category);
        });
    });
    renderExercises('strength');
    ['input-sets', 'input-reps', 'input-duration'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
    document.getElementById('btn-save').addEventListener('click', saveWorkout);
    document.getElementById('btn-save-template').addEventListener('click', saveAsTemplate);
}

function renderExercises(category) {
    const list = allExercises.filter(e => e.category === category);
    const el = document.getElementById('exercise-list');
    el.innerHTML = list.map(e => `<div class="exercise-opt ${e.id === selectedExerciseId ? 'selected' : ''}" data-id="${e.id}" role="option" tabindex="0" aria-selected="${e.id === selectedExerciseId}">
        <span class="eo-icon" data-icon="${getExerciseIcon(e.id)}"></span>
        <span>${e.name_vi}</span>
        <span class="eo-met">MET ${e.met}</span>
    </div>`).join('');
    el.querySelectorAll('.exercise-opt').forEach(opt => {
        const handler = () => {
            el.querySelectorAll('.exercise-opt').forEach(o => { o.classList.remove('selected'); o.setAttribute('aria-selected', 'false'); });
            opt.classList.add('selected');
            opt.setAttribute('aria-selected', 'true');
            selectedExerciseId = opt.dataset.id;
            updatePreview();
        };
        opt.addEventListener('click', handler);
        opt.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } });
    });
    injectIcons();
    updatePreview();
}

async function updatePreview() {
    const sets = parseInt(document.getElementById('input-sets').value) || 0;
    const reps = parseInt(document.getElementById('input-reps').value) || 0;
    const dur = parseFloat(document.getElementById('input-duration').value) || 0;
    const cal = await safeInvoke('preview_calories', { exercise_id: selectedExerciseId, sets, reps, duration_minutes: dur });
    document.getElementById('preview-calories').textContent = cal.toFixed(1);
}

async function saveWorkout() {
    const sets = parseInt(document.getElementById('input-sets').value) || 0;
    const reps = parseInt(document.getElementById('input-reps').value) || 0;
    const weight = parseFloat(document.getElementById('input-weight').value) || 0;
    const dur = parseFloat(document.getElementById('input-duration').value) || 0;
    const notes = document.getElementById('input-notes').value || null;
    if (sets <= 0 || reps <= 0) { showToast(_t('add.validation_error'), 'warning'); return; }
    await safeInvoke('add_workout', { exercise_id: selectedExerciseId, sets, reps, weight_kg: weight, duration_minutes: dur, notes });
    document.querySelector('.nav-links li[data-page="home"]').click();
}

async function saveAsTemplate() {
    const name = prompt(_t('add.template_name_prompt') || 'Template name:');
    if (!name) return;
    const sets = parseInt(document.getElementById('input-sets').value) || 3;
    const reps = parseInt(document.getElementById('input-reps').value) || 10;
    const weight = parseFloat(document.getElementById('input-weight').value) || 0;
    await safeInvoke('save_template', {
        name, exercise_ids: [selectedExerciseId],
        sets_list: [sets], reps_list: [reps], weights: [weight]
    });
    showToast(_t('add.template_saved'), 'success');
}

// ── Templates ──
async function loadTemplates() {
    const templates = await safeInvoke('get_templates');
    const el = document.getElementById('template-list');
    if (!templates || templates.length === 0) {
        el.innerHTML = `<div class="empty-state"><p>${_t('add.no_templates')}</p></div>`;
    } else {
        el.innerHTML = templates.map(t => `<div class="tpl-card" onclick="relogTemplate('${t.id}')">
            <div class="pr-icon">${icon('bookmark', 20)}</div>
            <div class="tpl-info"><div class="tpl-name">${t.name}</div>
            <div class="tpl-detail">${t.exercises.length} ${_t('format.exercises')} · ${t.exercises.map(e => e.exercise_name).join(', ')}</div></div>
            <div class="tpl-action"><button class="wi-delete" onclick="event.stopPropagation();deleteTemplate('${t.id}')" aria-label="${_t('confirm.delete_template')}" title="${_t('confirm.delete_template')}">${icon('delete', 16)}</button></div>
        </div>`).join('');
    }
    injectIcons();
}

async function relogTemplate(id) {
    const result = await safeInvoke('relog_from_template', { template_id: id });
    if (result && result.length > 0) {
        showToast(_t('toast.logged_count', { count: result.length }));
        document.querySelector('.nav-links li[data-page="home"]').click();
    }
}

async function deleteTemplate(id) {
    if (confirm(_t('confirm.delete_template'))) {
        await safeInvoke('delete_template', { id });
        loadTemplates();
    }
}

// ── History ──
function setupHistoryPage() {
    document.querySelectorAll('#history-filters .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#history-filters .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            loadHistory();
        });
    });
}

async function loadHistory() {
    const workouts = await safeInvoke('get_all_workouts');
    const filtered = currentFilter === 'all' ? workouts :
        workouts.filter(w => { const ex = allExercises.find(e => e.id === w.exercise_id); return ex && ex.category === currentFilter; });

    const grouped = {};
    filtered.forEach(w => { const day = w.date.slice(0, 10); (grouped[day] = grouped[day] || []).push(w); });

    const el = document.getElementById('history-list');
    if (Object.keys(grouped).length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="clipboard"></div><p>${_t('history.no_data')}</p></div>`;
        injectIcons(); return;
    }

    el.innerHTML = Object.entries(grouped).map(([day, workouts]) => {
        const dayCal = workouts.reduce((s, w) => s + w.calories_burned, 0);
        const dateStr = _formatDate(new Date(day + 'T00:00:00'), { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
        return `<div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="font-weight:600;font-size:13px">${dateStr}</span>
                <span style="font-size:12px;color:var(--fire);font-weight:600">${dayCal.toFixed(0)} ${_t('format.kcal')}</span>
            </div>${workouts.map(w => `<div class="workout-item">
                <span class="wi-icon" data-icon="${getExerciseIcon(w.exercise_id)}"></span>
                <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
                <div class="wi-detail">${w.sets}×${w.reps} × ${formatWorkoutWeight(w)} · ${w.calories_burned.toFixed(1)} ${_t('format.kcal')}</div></div>
                <button class="wi-delete" onclick="quickRelog('${w.id}')" aria-label="${_t('relog.re_log')}" title="${_t('relog.re_log')}">${icon('repeat', 16)}</button>
                <button class="wi-delete" onclick="deleteWorkout('${w.id}')" aria-label="${_t('confirm.delete_workout')}" title="${_t('confirm.delete_workout')}">${icon('delete', 16)}</button>
            </div>`).join('')}</div>`;
    }).join('');
    injectIcons();
}

async function deleteWorkout(id) {
    if (confirm(_t('confirm.delete_workout'))) {
        await safeInvoke('delete_workout', { id });
        loadHistory();
    }
}

// ── Stats ──
function setupStatsPage() {
    document.querySelectorAll('.range-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.range-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            statsDays = parseInt(chip.dataset.days);
            loadStats();
        });
    });
    document.getElementById('exercise-select-progress').addEventListener('change', loadExerciseProgress);
}

async function loadStats() {
    const [daily, dist, overview] = await Promise.all([
        invoke('get_daily_calories', { days: statsDays }),
        invoke('get_exercise_distribution', { days: statsDays }),
        invoke('get_stats_overview', { days: statsDays })
    ]);

    document.getElementById('stats-overview').innerHTML = `
        <div class="stat-card fire"><div class="stat-icon" data-icon="flame"></div><div class="stat-value">${overview.total_calories.toFixed(0)}</div><div class="stat-label">${_t('stats.total_kcal')}</div></div>
        <div class="stat-card blue"><div class="stat-icon" data-icon="chart"></div><div class="stat-value">${overview.avg_calories_per_day.toFixed(0)}</div><div class="stat-label">${_t('stats.avg_daily')}</div></div>
        <div class="stat-card green"><div class="stat-icon" data-icon="calendar"></div><div class="stat-value">${overview.active_days}</div><div class="stat-label">${_t('stats.active_days')}</div></div>
        <div class="stat-card purple"><div class="stat-icon" data-icon="dumbbell"></div><div class="stat-value">${overview.total_workouts}</div><div class="stat-label">${_t('stats.workouts')}</div></div>
    `;
    injectIcons();

    // Calorie bar chart
    const calLabels = daily.map(d => { const dt = new Date(d.date + 'T00:00:00'); return `${dt.getDate()}/${dt.getMonth() + 1}`; });
    const ctx1 = document.getElementById('chart-calories').getContext('2d');
    if (calChart) calChart.destroy();
    calChart = new Chart(ctx1, { type: 'bar', data: { labels: calLabels, datasets: [{ data: daily.map(d => d.calories), backgroundColor: 'rgba(34,197,94,0.6)', borderColor: 'rgba(34,197,94,1)', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { grid: { color: '#2d3148' }, ticks: { color: '#9ca3af' }, beginAtZero: true } } } });

    // Distribution doughnut
    const distColors = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#06b6d4', '#eab308', '#ec4899'];
    const ctx2 = document.getElementById('chart-distribution').getContext('2d');
    if (distChart) distChart.destroy();
    if (dist.length > 0) {
        distChart = new Chart(ctx2, { type: 'doughnut', data: { labels: dist.map(d => d.exercise_name), datasets: [{ data: dist.map(d => d.calories), backgroundColor: distColors.slice(0, dist.length), borderWidth: 0 }] }, options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#9ca3af', font: { size: 12 }, padding: 12 } } } } });
    }

    loadExerciseProgress();
}

async function loadExerciseProgress() {
    const eid = document.getElementById('exercise-select-progress').value;
    const data = await safeInvoke('get_exercise_progress', { exercise_id: eid });
    const ctx = document.getElementById('chart-exercise-progress').getContext('2d');
    if (exProgressChart) exProgressChart.destroy();
    if (data.length === 0) return;
    exProgressChart = new Chart(ctx, { type: 'line', data: { labels: data.map(d => { const dt = new Date(d.date); return `${dt.getDate()}/${dt.getMonth() + 1}`; }), datasets: [{ label: 'Weight (kg)', data: data.map(d => d.weight), borderColor: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', tension: 0.3, fill: true }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { grid: { color: '#2d3148' }, ticks: { color: '#9ca3af' } } } } });
}

// ── Personal Records ──
function setupRecordsPage() {}

async function loadRecords() {
    const prs = await safeInvoke('get_personal_records');
    const el = document.getElementById('records-list');
    if (!prs || prs.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="medal"></div><p>${_t('records.no_records')}</p></div>`;
        injectIcons(); return;
    }
    el.innerHTML = prs.map((pr, i) => `<div class="pr-card">
        <div class="pr-icon">${icon(getExerciseIcon(pr.exercise_id), 20)}</div>
        <div class="pr-info"><div class="pr-name">${i + 1}. ${pr.exercise_name}</div>
        <div class="pr-detail">Max reps: ${pr.max_reps} · Max volume: ${pr.max_volume.toFixed(0)}</div></div>
        <div class="pr-value">${pr.max_weight}kg</div>
    </div>`).join('');
    injectIcons();
}

// ── Body Weight ──
function setupWeightPage() {
    document.getElementById('btn-log-bw').addEventListener('click', async () => {
        const w = parseFloat(document.getElementById('input-bw').value);
        if (!w || w < 20) return;
        await safeInvoke('log_body_weight', { weight: w });
        loadWeight();
    });
}

async function loadWeight() {
    const history = await safeInvoke('get_body_weight_history', { days: 365 });

    // Chart
    const ctx = document.getElementById('chart-bodyweight').getContext('2d');
    if (bwChart) bwChart.destroy();
    if (history.length > 0) {
        bwChart = new Chart(ctx, { type: 'line', data: { labels: history.map(e => { const dt = new Date(e.date); return `${dt.getDate()}/${dt.getMonth() + 1}`; }), datasets: [{ label: _t('weight.title'), data: history.map(e => e.weight), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', tension: 0.3, fill: true }] }, options: { responsive: true, plugins: { legend: { labels: { color: '#9ca3af' } } }, scales: { x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } }, y: { grid: { color: '#2d3148' }, ticks: { color: '#9ca3af' } } } } });
    }

    // History list
    const el = document.getElementById('bw-history');
    if (!history || history.length === 0) {
        el.innerHTML = `<div class="empty-state"><p>${_t('weight.no_data')}</p></div>`;
    } else {
        el.innerHTML = history.slice().reverse().slice(0, 30).map(e => {
            const dt = new Date(e.date);
            return `<div class="bw-item">
                <span class="bw-date">${_formatDate(dt, { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
                <span class="bw-value">${e.weight} kg</span>
            </div>`;
        }).join('');
    }
}

// ── Settings ──
function setupSettingsPage() {
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const name = document.getElementById('input-username').value;
        const weight = parseFloat(document.getElementById('input-bodyweight').value) || 70;
        await safeInvoke('set_user_name', { name });
        await safeInvoke('set_body_weight', { weight });
        showToast(_t('settings.saved'), 'success');
    });
    document.getElementById('btn-ai-diagnostics').addEventListener('click', () => {
        window.location.href = 'diagnostics/inference-smoke.html';
    });

    // Language selector
    const langSelect = document.getElementById('input-language');
    langSelect.value = window.GymLabI18n.getLocale();
    langSelect.addEventListener('change', (e) => {
        window.GymLabI18n.setLocale(e.target.value);
        applyTranslations();
        buildUI();
        loadHomePage();
    });
}

async function loadSettings() {
    document.getElementById('input-username').value = (await safeInvoke('get_user_name')) || '';
    document.getElementById('input-bodyweight').value = (await safeInvoke('get_body_weight')) || 70;
}

// ── Rest Timer ──
let timerInterval = null;
let timerSeconds = 60;
let timerRemaining = 60;
let timerRunning = false;

function setupTimer() {
    const fab = document.getElementById('timer-fab');
    const panel = document.getElementById('rest-timer');
    const display = document.getElementById('timer-display');
    const circle = document.getElementById('timer-circle');
    const circumference = 2 * Math.PI * 54;

    fab.addEventListener('click', () => {
        fab.classList.add('hidden');
        panel.classList.remove('hidden');
    });

    document.querySelectorAll('.timer-presets .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.timer-presets .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            timerSeconds = parseInt(chip.dataset.sec);
            timerRemaining = timerSeconds;
            updateTimerDisplay();
        });
    });

    document.getElementById('timer-toggle').addEventListener('click', () => {
        if (timerRunning) { pauseTimer(); } else { startTimer(); }
    });

    document.getElementById('timer-minus').addEventListener('click', () => {
        timerSeconds = Math.max(10, timerSeconds - 15);
        timerRemaining = Math.min(timerRemaining, timerSeconds);
        updateTimerDisplay();
    });

    document.getElementById('timer-plus').addEventListener('click', () => {
        timerSeconds += 15;
        timerRemaining = timerSeconds;
        updateTimerDisplay();
    });

    document.getElementById('timer-reset').addEventListener('click', () => {
        pauseTimer();
        timerRemaining = timerSeconds;
        updateTimerDisplay();
    });

    function startTimer() {
        timerRunning = true;
        document.getElementById('timer-toggle').innerHTML = icon('pause', 20);
        timerInterval = setInterval(() => {
            timerRemaining--;
            updateTimerDisplay();
            if (timerRemaining <= 0) {
                pauseTimer();
                timerRemaining = timerSeconds;
                updateTimerDisplay();
                // Flash animation
                circle.style.stroke = 'var(--fire)';
                setTimeout(() => { circle.style.stroke = 'var(--primary)'; }, 500);
                try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==').play(); } catch (e) { /* silent */ }
            }
        }, 1000);
    }

    function pauseTimer() {
        timerRunning = false;
        clearInterval(timerInterval);
        document.getElementById('timer-toggle').innerHTML = icon('play', 20);
    }

    function updateTimerDisplay() {
        const min = Math.floor(timerRemaining / 60);
        const sec = timerRemaining % 60;
        display.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        const progress = timerRemaining / timerSeconds;
        circle.style.strokeDashoffset = circumference * (1 - progress);
    }

    updateTimerDisplay();
    injectIcons();
}

// ── Keyboard shortcuts ──
document.addEventListener('keydown', (e) => {
    // Escape closes mobile menu
    if (e.key === 'Escape') {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('menu-overlay')?.classList.remove('open');
    }
    // Alt+1-8 navigate pages
    if (e.altKey && e.key >= '1' && e.key <= '8') {
        const pages = ['home', 'video', 'add', 'history', 'stats', 'records', 'weight', 'settings'];
        const idx = parseInt(e.key) - 1;
        if (idx < pages.length) {
            document.querySelector(`.nav-links li[data-page="${pages[idx]}"]`)?.click();
        }
    }
    // Space toggles rest timer (when not in input)
    if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        document.getElementById('timer-fab')?.click();
    }
});

// ── Accessibility: announce page changes ──
const liveRegion = document.createElement('div');
liveRegion.setAttribute('role', 'status');
liveRegion.setAttribute('aria-live', 'polite');
liveRegion.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden';
document.body.appendChild(liveRegion);

function announcePage(pageName) {
    const pageLabels = {
        home: _t('nav.home'), add: _t('nav.add'), history: _t('nav.history'),
        stats: _t('nav.stats'), records: _t('nav.records'), weight: _t('nav.weight'),
        settings: _t('nav.settings'), video: _t('nav.video'),
    };
    liveRegion.textContent = _t('a11y.page_changed', { page: pageLabels[pageName] || pageName });
}
