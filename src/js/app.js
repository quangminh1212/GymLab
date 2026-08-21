// ── GymLab App Logic ──

let allExercises = [];
let selectedExerciseId = 'bench_press';
let currentFilter = 'all';
let statsDays = 7;
let calChart = null;
let distChart = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', async () => {
    allExercises = await invoke('get_exercises');
    setupNav();
    setupAddPage();
    setupHistoryPage();
    setupStatsPage();
    setupSettingsPage();
    loadHomePage();
});

// ── Navigation ──
function setupNav() {
    document.querySelectorAll('.nav-links li').forEach(li => {
        li.addEventListener('click', () => {
            document.querySelectorAll('.nav-links li').forEach(x => x.classList.remove('active'));
            li.classList.add('active');
            const page = li.dataset.page;
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-' + page).classList.add('active');
            if (page === 'home') loadHomePage();
            if (page === 'history') loadHistory();
            if (page === 'stats') loadStats();
            if (page === 'settings') loadSettings();
        });
    });
}

// ── Home Page ──
async function loadHomePage() {
    const name = await invoke('get_user_name');
    document.getElementById('greeting').textContent = `Xin chào, ${name}!`;
    const now = new Date();
    const opts = { weekday:'long', year:'numeric', month:'2-digit', day:'2-digit' };
    document.getElementById('date-display').textContent = now.toLocaleDateString('vi-VN', opts);

    const workouts = await invoke('get_all_workouts');
    const today = now.toISOString().slice(0,10);
    const todayWorkouts = workouts.filter(w => w.date.slice(0,10) === today);
    const todayCal = todayWorkouts.reduce((s,w) => s+w.calories_burned, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    const weekWorkouts = workouts.filter(w => new Date(w.date) >= weekStart);
    const weekCal = weekWorkouts.reduce((s,w) => s+w.calories_burned, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthWorkouts = workouts.filter(w => new Date(w.date) >= monthStart);

    document.getElementById('stat-today-cal').textContent = Math.round(todayCal);
    document.getElementById('stat-week-cal').textContent = Math.round(weekCal);
    document.getElementById('stat-week-count').textContent = weekWorkouts.length;
    document.getElementById('stat-month-count').textContent = monthWorkouts.length;

    const listEl = document.getElementById('today-list');
    if (todayWorkouts.length === 0) {
        listEl.innerHTML = '<div class="empty-state"><div class="empty-icon">🏋️</div><p>Chưa có buổi tập nào hôm nay</p></div>';
    } else {
        listEl.innerHTML = todayWorkouts.map(w => {
            const ex = allExercises.find(e => e.id === w.exercise_id);
            return `<div class="workout-item">
                <span class="wi-icon">${ex ? ex.icon : '🏋️'}</span>
                <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
                <div class="wi-detail">${w.sets}×${w.reps} × ${w.weight_kg}kg · ${w.duration_minutes} phút</div></div>
                <span class="wi-cal">${w.calories_burned.toFixed(1)} kcal</span>
            </div>`;
        }).join('');
    }
}

// ── Add Workout ──
function setupAddPage() {
    // Category chips
    document.querySelectorAll('#category-chips .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#category-chips .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderExercises(chip.dataset.category);
        });
    });
    renderExercises('strength');

    // Input change → update preview
    ['input-sets','input-reps','input-duration'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePreview);
    });

    // Save button
    document.getElementById('btn-save').addEventListener('click', saveWorkout);
}

function renderExercises(category) {
    const list = allExercises.filter(e => e.category === category);
    const el = document.getElementById('exercise-list');
    el.innerHTML = list.map(e => `
        <div class="exercise-opt ${e.id === selectedExerciseId ? 'selected' : ''}" data-id="${e.id}">
            <span class="eo-icon">${e.icon}</span>
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
    updatePreview();
}

async function updatePreview() {
    const sets = parseInt(document.getElementById('input-sets').value) || 0;
    const reps = parseInt(document.getElementById('input-reps').value) || 0;
    const dur = parseFloat(document.getElementById('input-duration').value) || 0;
    const cal = await invoke('preview_calories', {
        exercise_id: selectedExerciseId, sets, reps, duration_minutes: dur
    });
    document.getElementById('preview-calories').textContent = cal.toFixed(1);
}

async function saveWorkout() {
    const sets = parseInt(document.getElementById('input-sets').value) || 0;
    const reps = parseInt(document.getElementById('input-reps').value) || 0;
    const weight = parseFloat(document.getElementById('input-weight').value) || 0;
    const dur = parseFloat(document.getElementById('input-duration').value) || 0;
    const notes = document.getElementById('input-notes').value || null;

    if (sets <= 0 || reps <= 0) {
        alert('Vui lòng nhập Sets và Reps hợp lệ');
        return;
    }

    await invoke('add_workout', {
        exercise_id: selectedExerciseId,
        sets, reps, weight_kg: weight, duration_minutes: dur, notes
    });

    // Navigate to home
    document.querySelector('.nav-links li[data-page="home"]').click();
}

// ── History ──
function setupHistoryPage() {
    document.querySelectorAll('.filter-bar .chip[data-filter]').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.filter-bar .chip[data-filter]').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            loadHistory();
        });
    });
}

async function loadHistory() {
    const workouts = await invoke('get_all_workouts');
    const filtered = currentFilter === 'all'
        ? workouts
        : workouts.filter(w => {
            const ex = allExercises.find(e => e.id === w.exercise_id);
            return ex && ex.category === currentFilter;
        });

    const grouped = {};
    filtered.forEach(w => {
        const day = w.date.slice(0,10);
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(w);
    });

    const el = document.getElementById('history-list');
    if (Object.keys(grouped).length === 0) {
        el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>Chưa có dữ liệu</p></div>';
        return;
    }

    el.innerHTML = Object.entries(grouped).map(([day, workouts]) => {
        const dayCal = workouts.reduce((s,w) => s+w.calories_burned, 0);
        const dateObj = new Date(day + 'T00:00:00');
        const dateStr = dateObj.toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
        const items = workouts.map(w => {
            const ex = allExercises.find(e => e.id === w.exercise_id);
            return `<div class="workout-item">
                <span class="wi-icon">${ex ? ex.icon : '🏋️'}</span>
                <div class="wi-info"><div class="wi-name">${w.exercise_name}</div>
                <div class="wi-detail">${w.sets}×${w.reps} × ${w.weight_kg}kg · ${w.calories_burned.toFixed(1)} kcal</div></div>
                <button class="wi-delete" data-id="${w.id}">✕</button>
            </div>`;
        }).join('');
        return `<div style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="font-weight:600;font-size:13px">${dateStr}</span>
                <span style="font-size:12px;color:var(--fire);font-weight:600">${dayCal.toFixed(0)} kcal</span>
            </div>${items}</div>`;
    }).join('');

    el.querySelectorAll('.wi-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            await invoke('delete_workout', { id: btn.dataset.id });
            loadHistory();
        });
    });
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
}

async function loadStats() {
    const [daily, dist, overview] = await Promise.all([
        invoke('get_daily_calories', { days: statsDays }),
        invoke('get_exercise_distribution', { days: statsDays }),
        invoke('get_stats_overview', { days: statsDays })
    ]);

    // Overview cards
    document.getElementById('stats-overview').innerHTML = `
        <div class="stat-card fire"><div class="stat-icon">🔥</div><div class="stat-value">${overview.total_calories.toFixed(0)}</div><div class="stat-label">Tổng kcal</div></div>
        <div class="stat-card blue"><div class="stat-icon">📈</div><div class="stat-value">${overview.avg_calories_per_day.toFixed(0)}</div><div class="stat-label">TB/ngày</div></div>
        <div class="stat-card green"><div class="stat-icon">📅</div><div class="stat-value">${overview.active_days}</div><div class="stat-label">Ngày tập</div></div>
        <div class="stat-card purple"><div class="stat-icon">🏋️</div><div class="stat-value">${overview.total_workouts}</div><div class="stat-label">Buổi tập</div></div>
    `;

    // Calorie bar chart
    const calLabels = daily.map(d => {
        const dt = new Date(d.date + 'T00:00:00');
        return `${dt.getDate()}/${dt.getMonth()+1}`;
    });
    const calData = daily.map(d => d.calories);
    const ctx1 = document.getElementById('chart-calories').getContext('2d');
    if (calChart) calChart.destroy();
    calChart = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: calLabels,
            datasets: [{
                data: calData,
                backgroundColor: 'rgba(34,197,94,0.6)',
                borderColor: 'rgba(34,197,94,1)',
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 10 } } },
                y: { grid: { color: '#2d3148' }, ticks: { color: '#9ca3af' }, beginAtZero: true }
            }
        }
    });

    // Distribution pie chart
    const distColors = ['#22c55e','#3b82f6','#f97316','#a855f7','#ef4444','#06b6d4','#eab308','#ec4899'];
    const ctx2 = document.getElementById('chart-distribution').getContext('2d');
    if (distChart) distChart.destroy();
    if (dist.length === 0) {
        distChart = null;
        return;
    }
    distChart = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: dist.map(d => d.exercise_name),
            datasets: [{
                data: dist.map(d => d.calories),
                backgroundColor: distColors.slice(0, dist.length),
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#9ca3af', font: { size: 12 }, padding: 12 }
                }
            }
        }
    });
}

// ── Settings ──
function setupSettingsPage() {
    document.getElementById('btn-save-settings').addEventListener('click', async () => {
        const name = document.getElementById('input-username').value;
        const weight = parseFloat(document.getElementById('input-bodyweight').value) || 70;
        await invoke('set_user_name', { name });
        await invoke('set_body_weight', { weight });
        alert('Đã lưu cài đặt!');
    });
}

async function loadSettings() {
    const name = await invoke('get_user_name');
    const weight = await invoke('get_body_weight');
    document.getElementById('input-username').value = name;
    document.getElementById('input-bodyweight').value = weight;
}
