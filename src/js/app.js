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

// ── Toast notifications ──
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
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
        return await invoke(cmd, args);
    } catch (err) {
        showToast(`Lỗi: ${err.message || err}`, 'error');
        return null;
    }
}

const CATEGORIES = [
    { id: 'strength', label: 'Sức mạnh', icon: 'strength' },
    { id: 'cardio', label: 'Cardio', icon: 'cardio' },
    { id: 'hiit', label: 'HIIT', icon: 'hiit' },
    { id: 'flexibility', label: 'Linh hoạt', icon: 'flexibility' },
];

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    allExercises = await safeInvoke('get_exercises');
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
        <div class="stat-card fire"><div class="stat-icon" data-icon="flame"></div><div class="stat-value" id="stat-today-cal">0</div><div class="stat-label">kcal hôm nay</div></div>
        <div class="stat-card blue"><div class="stat-icon" data-icon="calendar"></div><div class="stat-value" id="stat-week-cal">0</div><div class="stat-label">kcal tuần</div></div>
        <div class="stat-card green"><div class="stat-icon" data-icon="dumbbell"></div><div class="stat-value" id="stat-week-count">0</div><div class="stat-label">buổi/tuần</div></div>
        <div class="stat-card purple"><div class="stat-icon" data-icon="trophy"></div><div class="stat-value" id="stat-month-count">0</div><div class="stat-label">buổi/tháng</div></div>
    `;

    document.getElementById('category-chips').innerHTML = CATEGORIES.map(c =>
        `<button class="chip ${c.id === 'strength' ? 'active' : ''}" data-category="${c.id}">${icon(c.icon, 16)} ${c.label}</button>`
    ).join('');

    document.getElementById('history-filters').innerHTML =
        `<button class="chip active" data-filter="all">Tất cả</button>` +
        CATEGORIES.map(c => `<button class="chip" data-filter="${c.id}">${icon(c.icon, 16)}</button>`).join('');

    document.getElementById('stats-filters').innerHTML = [7, 14, 30].map(d =>
        `<button class="chip range-chip ${d === 30 ? 'active' : ''}" data-days="${d}">${d} ngày</button>`
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
    function openMenu() { sidebar.classList.add('open'); overlay.classList.add('open'); }
    function closeMenu() { sidebar.classList.remove('open'); overlay.classList.remove('open'); }
    if (menuBtn) menuBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeMenu() : openMenu());
    if (overlay) overlay.addEventListener('click', closeMenu);

    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(x => x.classList.remove('active'));
            li.classList.add('active');
            const page = li.dataset.page;
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-' + page).classList.add('active');
            closeMenu();
            const loaders = { home: loadHomePage, history: loadHistory, stats: loadStats, records: loadRecords, weight: loadWeight, settings: loadSettings, add: loadTemplates };
            if (loaders[page]) loaders[page]();
        });
    });
}

// ── Home Page ──
async function loadHomePage() {
    const name = await safeInvoke('get_user_name');
    document.getElementById('greeting').textContent = `Xin chào, ${name}!`;
    document.getElementById('date-display').textContent = new Date().toLocaleDateString('vi-VN', { weekday:'long', year:'numeric', month:'2-digit', day:'2-digit' });

    const workouts = await safeInvoke('get_all_workouts');
    const today = new Date().toISOString().slice(0,10);
    const todayWorkouts = workouts.filter(w => w.date.slice(0,10) === today);
    document.getElementById('stat-today-cal').textContent = Math.round(todayWorkouts.reduce((s,w) => s+w.calories_burned, 0));

    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekW = workouts.filter(w => new Date(w.date) >= weekStart);
    document.getElementById('stat-week-cal').textContent = Math.round(weekW.reduce((s,w) => s+w.calories_burned, 0));
    document.getElementById('stat-week-count').textContent = weekW.length;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    document.getElementById('stat-month-count').textContent = workouts.filter(w => new Date(w.date) >= monthStart).length;

    const listEl = document.getElementById('today-list');
    if (todayWorkouts.length === 0) {
        listEl.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="dumbbell"></div><p>Chưa có buổi tập nào hôm nay</p></div>`;
    } else {
        listEl.innerHTML = todayWorkouts.map(w => `<div class="workout-item">
            <span class="wi-icon" data-icon="${getExerciseIcon(w.exercise_id)}"></span>
            <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
            <div class="wi-detail">${w.sets}×${w.reps} × ${w.weight_kg}kg · ${w.calories_burned.toFixed(1)} kcal</div></div>
            <button class="wi-delete" onclick="quickRelog('${w.id}')" title="Re-log">${icon('repeat', 16)}</button>
        </div>`).join('');
    }

    // Top 3 PRs on home
    const prs = await safeInvoke('get_personal_records');
    const prEl = document.getElementById('home-pr');
    if (prs.length === 0) {
        prEl.innerHTML = `<div class="empty-state"><p>Chưa có kỷ lục</p></div>`;
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
    ['input-sets','input-reps','input-duration'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });
    document.getElementById('btn-save').addEventListener('click', saveWorkout);
    document.getElementById('btn-save-template').addEventListener('click', saveAsTemplate);
}

function renderExercises(category) {
    const list = allExercises.filter(e => e.category === category);
    const el = document.getElementById('exercise-list');
    el.innerHTML = list.map(e => `<div class="exercise-opt ${e.id === selectedExerciseId ? 'selected' : ''}" data-id="${e.id}">
        <span class="eo-icon" data-icon="${getExerciseIcon(e.id)}"></span>
        <span>${e.name_vi}</span>
        <span class="eo-met">MET ${e.met}</span>
    </div>`).join('');
    el.querySelectorAll('.exercise-opt').forEach(opt => {
        opt.addEventListener('click', () => {
            el.querySelectorAll('.exercise-opt').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            selectedExerciseId = opt.dataset.id;
            updatePreview();
        });
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
    if (sets <= 0 || reps <= 0) { showToast('Vui lòng nhập Sets và Reps hợp lệ', 'warning'); return; }
    await safeInvoke('add_workout', { exercise_id: selectedExerciseId, sets, reps, weight_kg: weight, duration_minutes: dur, notes });
    document.querySelector('.nav-links li[data-page="home"]').click();
}

async function saveAsTemplate() {
    const name = prompt('Tên template:');
    if (!name) return;
    const sets = parseInt(document.getElementById('input-sets').value) || 3;
    const reps = parseInt(document.getElementById('input-reps').value) || 10;
    const weight = parseFloat(document.getElementById('input-weight').value) || 0;
    await safeInvoke('save_template', {
        name, exercise_ids: [selectedExerciseId],
        sets_list: [sets], reps_list: [reps], weights: [weight]
    });
    showToast('Đã lưu template!', 'success');
}

// ── Templates ──
async function loadTemplates() {
    const templates = await safeInvoke('get_templates');
    const el = document.getElementById('template-list');
    if (templates.length === 0) {
        el.innerHTML = `<div class="empty-state"><p>Chưa có template nào</p></div>`;
    } else {
        el.innerHTML = templates.map(t => `<div class="tpl-card" onclick="relogTemplate('${t.id}')">
            <div class="pr-icon">${icon('bookmark', 20)}</div>
            <div class="tpl-info"><div class="tpl-name">${t.name}</div>
            <div class="tpl-detail">${t.exercises.length} bài · ${t.exercises.map(e => e.exercise_name).join(', ')}</div></div>
            <div class="tpl-action"><button class="wi-delete" onclick="event.stopPropagation();deleteTemplate('${t.id}')" title="Xóa">${icon('delete', 16)}</button></div>
        </div>`).join('');
    }
    injectIcons();
}

async function relogTemplate(id) {
    const result = await safeInvoke('relog_from_template', { template_id: id });
    if (result && result.length > 0) {
        showToast(`Đã ghi nhận ${result.length} bài tập từ template!`);
        document.querySelector('.nav-links li[data-page="home"]').click();
    }
}

async function deleteTemplate(id) {
    if (confirm('Xóa template?')) {
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
    filtered.forEach(w => { const day = w.date.slice(0,10); (grouped[day] = grouped[day]||[]).push(w); });

    const el = document.getElementById('history-list');
    if (Object.keys(grouped).length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="clipboard"></div><p>Chưa có dữ liệu</p></div>`;
        injectIcons(); return;
    }

    el.innerHTML = Object.entries(grouped).map(([day, workouts]) => {
        const dayCal = workouts.reduce((s,w) => s+w.calories_burned, 0);
        const dateStr = new Date(day+'T00:00:00').toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
        return `<div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="font-weight:600;font-size:13px">${dateStr}</span>
                <span style="font-size:12px;color:var(--fire);font-weight:600">${dayCal.toFixed(0)} kcal</span>
            </div>${workouts.map(w => `<div class="workout-item">
                <span class="wi-icon" data-icon="${getExerciseIcon(w.exercise_id)}"></span>
                <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
                <div class="wi-detail">${w.sets}×${w.reps} × ${w.weight_kg}kg · ${w.calories_burned.toFixed(1)} kcal</div></div>
                <button class="wi-delete" onclick="quickRelog('${w.id}')" title="Re-log">${icon('repeat', 16)}</button>
                <button class="wi-delete" onclick="deleteWorkout('${w.id}')" title="Xóa">${icon('delete', 16)}</button>
            </div>`).join('')}</div>`;
    }).join('');
    injectIcons();
}

async function deleteWorkout(id) {
    if (confirm('Xóa buổi tập?')) {
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
        <div class="stat-card fire"><div class="stat-icon" data-icon="flame"></div><div class="stat-value">${overview.total_calories.toFixed(0)}</div><div class="stat-label">Tổng kcal</div></div>
        <div class="stat-card blue"><div class="stat-icon" data-icon="chart"></div><div class="stat-value">${overview.avg_calories_per_day.toFixed(0)}</div><div class="stat-label">TB/ngày</div></div>
        <div class="stat-card green"><div class="stat-icon" data-icon="calendar"></div><div class="stat-value">${overview.active_days}</div><div class="stat-label">Ngày tập</div></div>
        <div class="stat-card purple"><div class="stat-icon" data-icon="dumbbell"></div><div class="stat-value">${overview.total_workouts}</div><div class="stat-label">Buổi tập</div></div>
    `;
    injectIcons();

    // Calorie bar chart
    const calLabels = daily.map(d => { const dt = new Date(d.date+'T00:00:00'); return `${dt.getDate()}/${dt.getMonth()+1}`; });
    const ctx1 = document.getElementById('chart-calories').getContext('2d');
    if (calChart) calChart.destroy();
    calChart = new Chart(ctx1, { type:'bar', data:{ labels:calLabels, datasets:[{data:daily.map(d=>d.calories),backgroundColor:'rgba(34,197,94,0.6)',borderColor:'rgba(34,197,94,1)',borderWidth:1,borderRadius:4}] }, options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}},y:{grid:{color:'#2d3148'},ticks:{color:'#9ca3af'},beginAtZero:true}}} });

    // Distribution doughnut
    const distColors = ['#22c55e','#3b82f6','#f97316','#a855f7','#ef4444','#06b6d4','#eab308','#ec4899'];
    const ctx2 = document.getElementById('chart-distribution').getContext('2d');
    if (distChart) distChart.destroy();
    if (dist.length > 0) {
        distChart = new Chart(ctx2, { type:'doughnut', data:{ labels:dist.map(d=>d.exercise_name), datasets:[{data:dist.map(d=>d.calories),backgroundColor:distColors.slice(0,dist.length),borderWidth:0}] }, options:{responsive:true,plugins:{legend:{position:'bottom',labels:{color:'#9ca3af',font:{size:12},padding:12}}}} });
    }

    loadExerciseProgress();
}

async function loadExerciseProgress() {
    const eid = document.getElementById('exercise-select-progress').value;
    const data = await safeInvoke('get_exercise_progress', { exercise_id: eid });
    const ctx = document.getElementById('chart-exercise-progress').getContext('2d');
    if (exProgressChart) exProgressChart.destroy();
    if (data.length === 0) return;
    exProgressChart = new Chart(ctx, { type:'line', data:{ labels:data.map(d=>{const dt=new Date(d.date);return `${dt.getDate()}/${dt.getMonth()+1}`;}), datasets:[{label:'Weight (kg)',data:data.map(d=>d.weight),borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.1)',tension:0.3,fill:true}] }, options:{responsive:true,plugins:{legend:{labels:{color:'#9ca3af'}}},scales:{x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}},y:{grid:{color:'#2d3148'},ticks:{color:'#9ca3af'}}}} });
}

// ── Personal Records ──
function setupRecordsPage() {}

async function loadRecords() {
    const prs = await safeInvoke('get_personal_records');
    const el = document.getElementById('records-list');
    if (prs.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon" data-icon="medal"></div><p>Chưa có kỷ lục nào</p></div>`;
        injectIcons(); return;
    }
    el.innerHTML = prs.map((pr, i) => `<div class="pr-card">
        <div class="pr-icon">${icon(getExerciseIcon(pr.exercise_id), 20)}</div>
        <div class="pr-info"><div class="pr-name">${i+1}. ${pr.exercise_name}</div>
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
        bwChart = new Chart(ctx, { type:'line', data:{ labels:history.map(e=>{const dt=new Date(e.date);return `${dt.getDate()}/${dt.getMonth()+1}`;}), datasets:[{label:'Cân nặng',data:history.map(e=>e.weight),borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',tension:0.3,fill:true}] }, options:{responsive:true,plugins:{legend:{labels:{color:'#9ca3af'}}},scales:{x:{grid:{display:false},ticks:{color:'#9ca3af',font:{size:10}}},y:{grid:{color:'#2d3148'},ticks:{color:'#9ca3af'}}}} });
    }

    // History list
    const el = document.getElementById('bw-history');
    if (history.length === 0) {
        el.innerHTML = `<div class="empty-state"><p>Chưa có dữ liệu cân nặng</p></div>`;
    } else {
        el.innerHTML = history.slice().reverse().slice(0, 30).map(e => {
            const dt = new Date(e.date);
            return `<div class="bw-item">
                <span class="bw-date">${dt.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}</span>
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
        showToast('Đã lưu!', 'success');
    });
}

async function loadSettings() {
    document.getElementById('input-username').value = await safeInvoke('get_user_name');
    document.getElementById('input-bodyweight').value = await safeInvoke('get_body_weight');
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
                try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ==').play(); } catch(e){}
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
        display.textContent = `${min}:${sec.toString().padStart(2,'0')}`;
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
    // Alt+1-7 navigate pages
    if (e.altKey && e.key >= '1' && e.key <= '7') {
        const pages = ['home', 'add', 'history', 'stats', 'records', 'weight', 'settings'];
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
    const labels = { home: 'Trang chủ', add: 'Thêm buổi tập', history: 'Lịch sử', stats: 'Thống kê', records: 'Kỷ lục', weight: 'Cân nặng', settings: 'Cài đặt' };
    liveRegion.textContent = `Đã chuyển sang trang ${labels[pageName] || pageName}`;
}
