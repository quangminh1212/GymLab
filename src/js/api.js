// ── Tauri API Bridge ──
// Wraps invoke() calls; in dev mode (browser), falls back to localStorage mock.

const isTauri = typeof window.__TAURI__ !== 'undefined';

async function invoke(cmd, args = {}) {
    if (isTauri) {
        return window.__TAURI__.core.invoke(cmd, args);
    }
    // Fallback: mock storage for browser dev
    return mockInvoke(cmd, args);
}

// ── Mock for browser dev ──
const MOCK_KEY = 'gymlab_workouts';
const MOCK_SETTINGS = 'gymlab_settings';

function getMockWorkouts() {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY) || '[]'); }
    catch { return []; }
}
function saveMockWorkouts(w) { localStorage.setItem(MOCK_KEY, JSON.stringify(w)); }
function getMockSettings() {
    try { return JSON.parse(localStorage.getItem(MOCK_SETTINGS) || '{}'); }
    catch { return {}; }
}
function saveMockSettings(s) { localStorage.setItem(MOCK_SETTINGS, JSON.stringify(s)); }

// MET database for mock calorie calc
const MET_DB = {
    bench_press:6, squat:6, deadlift:6, overhead_press:5, barbell_row:5,
    bicep_curl:3.5, tricep_dip:5, lateral_raise:3.5, leg_press:5, calf_raise:3.5,
    pull_up:8, push_up:8, plank:4,
    running:9.8, cycling:7.5, swimming:8, jumping_rope:12.3, rowing_machine:7,
    stair_climbing:9, elliptical:5, walking:3.5,
    burpees:12.5, mountain_climbers:8, box_jumps:10,
    yoga:3, stretching:2.5
};

async function mockInvoke(cmd, args) {
    const w = getMockWorkouts();
    const s = getMockSettings();
    const now = new Date();

    switch (cmd) {
        case 'get_exercises': return EXERCISE_DB;
        case 'get_exercises_by_category':
            return EXERCISE_DB.filter(e => e.category === args.category);
        case 'get_body_weight': return s.body_weight || 70;
        case 'set_body_weight':
            s.body_weight = args.weight; saveMockSettings(s); return;
        case 'get_user_name': return s.user_name || 'User';
        case 'set_user_name':
            s.user_name = args.name; saveMockSettings(s); return;
        case 'preview_calories': {
            const met = MET_DB[args.exercise_id] || 5;
            const wt = s.body_weight || 70;
            const dur = args.duration_minutes > 0 ? args.duration_minutes / 60
                : ((args.sets * args.reps * 3 + (args.sets-1)*60) / 3600);
            return met * wt * dur;
        }
        case 'add_workout': {
            const met = MET_DB[args.exercise_id] || 5;
            const wt = s.body_weight || 70;
            const dur = args.duration_minutes > 0 ? args.duration_minutes / 60
                : ((args.sets * args.reps * 3 + (args.sets-1)*60) / 3600);
            const cal = met * wt * dur;
            const ex = EXERCISE_DB.find(e => e.id === args.exercise_id);
            const entry = {
                id: crypto.randomUUID(),
                exercise_id: args.exercise_id,
                exercise_name: ex ? ex.name_vi : args.exercise_id,
                sets: args.sets, reps: args.reps, weight_kg: args.weight_kg,
                duration_minutes: args.duration_minutes,
                date: now.toISOString(),
                calories_burned: cal, met_value: met,
                notes: args.notes || null
            };
            w.push(entry); saveMockWorkouts(w); return entry;
        }
        case 'delete_workout': {
            const nw = w.filter(x => x.id !== args.id);
            saveMockWorkouts(nw); return true;
        }
        case 'get_all_workouts': {
            return [...w].sort((a,b) => new Date(b.date) - new Date(a.date));
        }
        case 'get_daily_calories': {
            const days = args.days;
            const result = [];
            for (let i = days-1; i >= 0; i--) {
                const d = new Date(now); d.setDate(d.getDate()-i);
                const ds = d.toISOString().slice(0,10);
                const dayW = w.filter(x => x.date.slice(0,10) === ds);
                result.push({
                    date: ds,
                    calories: dayW.reduce((s,x) => s+x.calories_burned, 0),
                    workout_count: dayW.length
                });
            }
            return result;
        }
        case 'get_exercise_distribution': {
            const cutoff = new Date(now); cutoff.setDate(cutoff.getDate()-args.days);
            const dist = {};
            w.filter(x => new Date(x.date) > cutoff).forEach(x => {
                dist[x.exercise_name] = (dist[x.exercise_name]||0) + x.calories_burned;
            });
            const total = Object.values(dist).reduce((a,b)=>a+b, 0);
            return Object.entries(dist)
                .map(([n,c]) => ({exercise_name:n, calories:c, percentage: total>0?c/total*100:0}))
                .sort((a,b) => b.calories - a.calories);
        }
        case 'get_stats_overview': {
            const cutoff = new Date(now); cutoff.setDate(cutoff.getDate()-args.days);
            const recent = w.filter(x => new Date(x.date) > cutoff);
            const tCal = recent.reduce((s,x)=>s+x.calories_burned,0);
            const tVol = recent.reduce((s,x)=>s+x.sets*x.reps*x.weight_kg,0);
            const activeDays = new Set(recent.map(x=>x.date.slice(0,10))).size;
            return {
                total_calories: tCal,
                avg_calories_per_day: args.days>0?tCal/args.days:0,
                active_days: activeDays,
                total_workouts: recent.length,
                total_volume: tVol
            };
        }
        case 'get_personal_records': {
            const byEx = {};
            w.forEach(x => { (byEx[x.exercise_id] = byEx[x.exercise_id]||[]).push(x); });
            return Object.entries(byEx).map(([eid, entries]) => {
                const best = entries.reduce((a,b) => a.weight_kg > b.weight_kg ? a : b);
                const maxVol = Math.max(...entries.map(e => e.sets*e.reps*e.weight_kg));
                return { exercise_id: eid, exercise_name: best.exercise_name, max_weight: best.weight_kg, max_reps: best.reps, max_volume: maxVol, date: best.date };
            }).sort((a,b) => b.max_weight - a.max_weight);
        }
        case 'get_templates': return getMockTemplates();
        case 'save_template': {
            const tpls = getMockTemplates();
            const exDb = EXERCISE_DB;
            const exercises = args.exercise_ids.map((eid, i) => {
                const ex = exDb.find(e => e.id === eid);
                return { exercise_id: eid, exercise_name: ex?ex.name_vi:eid, sets: (args.sets_list||[])[i]||3, reps: (args.reps_list||[])[i]||10, weight_kg: (args.weights||[])[i]||0 };
            });
            const tpl = { id: crypto.randomUUID(), name: args.name, exercises, created_at: now.toISOString() };
            tpls.push(tpl); saveMockTemplates(tpls); return tpl;
        }
        case 'delete_template': {
            const tpls = getMockTemplates().filter(t => t.id !== args.id);
            saveMockTemplates(tpls); return true;
        }
        case 'relog_from_template': {
            const tpl = getMockTemplates().find(t => t.id === args.template_id);
            if (!tpl) return [];
            const wt = s.body_weight || 70;
            return tpl.exercises.map(ex => {
                const met = MET_DB[ex.exercise_id]||5;
                const dur = (ex.sets*ex.reps*3+(ex.sets-1)*60)/3600;
                const cal = met*wt*dur;
                return { id: crypto.randomUUID(), exercise_id: ex.exercise_id, exercise_name: ex.exercise_name, sets: ex.sets, reps: ex.reps, weight_kg: ex.weight_kg, duration_minutes: 0, date: now.toISOString(), calories_burned: cal, met_value: met, notes: null };
            });
        }
        case 'log_body_weight': {
            const log = getMockBWLog();
            const entry = { date: now.toISOString(), weight: args.weight };
            log.push(entry); saveMockBWLog(log); return entry;
        }
        case 'get_body_weight_history': {
            const log = getMockBWLog();
            const cutoff = new Date(now); cutoff.setDate(cutoff.getDate()-args.days);
            return log.filter(e => new Date(e.date) > cutoff).sort((a,b) => new Date(a.date)-new Date(b.date));
        }
        case 'get_exercise_progress': {
            return w.filter(x => x.exercise_id === args.exercise_id).map(x => ({
                date: x.date, weight: x.weight_kg, reps: x.reps, volume: x.sets*x.reps*x.weight_kg, sets: x.sets
            }));
        }
        case 'quick_relog': {
            const orig = w.find(x => x.id === args.workout_id);
            if (!orig) return null;
            const wt = s.body_weight || 70;
            const met = MET_DB[orig.exercise_id]||5;
            const dur = orig.duration_minutes > 0 ? orig.duration_minutes/60 : (orig.sets*orig.reps*3+(orig.sets-1)*60)/3600;
            const cal = met*wt*dur;
            const entry = { id: crypto.randomUUID(), exercise_id: orig.exercise_id, exercise_name: orig.exercise_name, sets: orig.sets, reps: orig.reps, weight_kg: orig.weight_kg, duration_minutes: orig.duration_minutes, date: now.toISOString(), calories_burned: cal, met_value: met, notes: 'Re-log' };
            w.push(entry); saveMockWorkouts(w); return entry;
        }
        default: return null;
    }
}

// ── Additional mock storage for new features ──
const MOCK_TEMPLATES = 'gymlab_templates';
const MOCK_BW_LOG = 'gymlab_bw_log';
const MOCK_PR = 'gymlab_pr';

function getMockTemplates() { try { return JSON.parse(localStorage.getItem(MOCK_TEMPLATES)||'[]'); } catch { return []; } }
function saveMockTemplates(t) { localStorage.setItem(MOCK_TEMPLATES, JSON.stringify(t)); }
function getMockBWLog() { try { return JSON.parse(localStorage.getItem(MOCK_BW_LOG)||'[]'); } catch { return []; } }
function saveMockBWLog(l) { localStorage.setItem(MOCK_BW_LOG, JSON.stringify(l)); }

// ── Exercise DB (same as Rust backend) ──
const EXERCISE_DB = [
    {id:"bench_press",name:"Bench Press",name_vi:"Ép ngực",met:6,category:"strength",muscle_group:"Ngực",icon:"💪"},
    {id:"squat",name:"Squat",name_vi:"Squat",met:6,category:"strength",muscle_group:"Chân",icon:"🦵"},
    {id:"deadlift",name:"Deadlift",name_vi:"Cuốn đất",met:6,category:"strength",muscle_group:"Lưng",icon:"🏋️"},
    {id:"overhead_press",name:"Overhead Press",name_vi:"Đẩy tạ",met:5,category:"strength",muscle_group:"Vai",icon:"💪"},
    {id:"barbell_row",name:"Barbell Row",name_vi:"Kéo tạ",met:5,category:"strength",muscle_group:"Lưng",icon:"🏋️"},
    {id:"bicep_curl",name:"Bicep Curl",name_vi:"Cuốn tay",met:3.5,category:"strength",muscle_group:"Tay",icon:"💪"},
    {id:"tricep_dip",name:"Tricep Dip",name_vi:"Chùn tay",met:5,category:"strength",muscle_group:"Tay",icon:"💪"},
    {id:"lateral_raise",name:"Lateral Raise",name_vi:"Nâng ngang",met:3.5,category:"strength",muscle_group:"Vai",icon:"💪"},
    {id:"leg_press",name:"Leg Press",name_vi:"Đạp chân",met:5,category:"strength",muscle_group:"Chân",icon:"🦵"},
    {id:"calf_raise",name:"Calf Raise",name_vi:"Nâng gót",met:3.5,category:"strength",muscle_group:"Chân",icon:"🦵"},
    {id:"pull_up",name:"Pull Up",name_vi:"Kéo xô",met:8,category:"strength",muscle_group:"Lưng",icon:"💪"},
    {id:"push_up",name:"Push Up",name_vi:"Hít đất",met:8,category:"strength",muscle_group:"Ngực",icon:"💪"},
    {id:"plank",name:"Plank",name_vi:"Plank",met:4,category:"strength",muscle_group:"Core",icon:"💪"},
    {id:"running",name:"Running",name_vi:"Chạy bộ",met:9.8,category:"cardio",muscle_group:"Toàn thân",icon:"🏃"},
    {id:"cycling",name:"Cycling",name_vi:"Đạp xe",met:7.5,category:"cardio",muscle_group:"Chân",icon:"🚴"},
    {id:"swimming",name:"Swimming",name_vi:"Bơi lội",met:8,category:"cardio",muscle_group:"Toàn thân",icon:"🏊"},
    {id:"jumping_rope",name:"Jump Rope",name_vi:"Nhảy dây",met:12.3,category:"cardio",muscle_group:"Toàn thân",icon:"🤸"},
    {id:"rowing_machine",name:"Rowing Machine",name_vi:"Máy chèo",met:7,category:"cardio",muscle_group:"Toàn thân",icon:"🚣"},
    {id:"stair_climbing",name:"Stair Climbing",name_vi:"Leo cầu thang",met:9,category:"cardio",muscle_group:"Chân",icon:"🏔️"},
    {id:"elliptical",name:"Elliptical",name_vi:"Máy elip",met:5,category:"cardio",muscle_group:"Toàn thân",icon:"🏋️"},
    {id:"walking",name:"Walking",name_vi:"Đi bộ",met:3.5,category:"cardio",muscle_group:"Chân",icon:"🚶"},
    {id:"burpees",name:"Burpees",name_vi:"Burpees",met:12.5,category:"hiit",muscle_group:"Toàn thân",icon:"🤸"},
    {id:"mountain_climbers",name:"Mountain Climbers",name_vi:"Leo núi",met:8,category:"hiit",muscle_group:"Toàn thân",icon:"🏔️"},
    {id:"box_jumps",name:"Box Jumps",name_vi:"Nhảy hộp",met:10,category:"hiit",muscle_group:"Chân",icon:"📦"},
    {id:"yoga",name:"Yoga",name_vi:"Yoga",met:3,category:"flexibility",muscle_group:"Toàn thân",icon:"🧘"},
    {id:"stretching",name:"Stretching",name_vi:"Giãn cơ",met:2.5,category:"flexibility",muscle_group:"Toàn thân",icon:"🧘"},
];
