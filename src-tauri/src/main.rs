#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc, NaiveDate};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

// ─── Data Models ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exercise {
    pub id: String,
    pub name: String,
    pub name_vi: String,
    pub met: f64,
    pub category: String,
    pub muscle_group: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkoutEntry {
    pub id: String,
    pub exercise_id: String,
    pub exercise_name: String,
    pub sets: i32,
    pub reps: i32,
    pub weight_kg: f64,
    pub duration_minutes: f64,
    pub date: DateTime<Utc>,
    pub calories_burned: f64,
    pub met_value: f64,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailySummary {
    pub date: NaiveDate,
    pub calories: f64,
    pub workout_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseDistribution {
    pub exercise_name: String,
    pub calories: f64,
    pub percentage: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsOverview {
    pub total_calories: f64,
    pub avg_calories_per_day: f64,
    pub active_days: i32,
    pub total_workouts: i32,
    pub total_volume: f64,
}

// ─── App State ───

pub struct AppState {
    pub workouts: Mutex<Vec<WorkoutEntry>>,
    pub body_weight: Mutex<f64>,
    pub user_name: Mutex<String>,
    pub data_path: PathBuf,
}

// ─── Exercise Database (ACSM Compendium 2024) ───

pub fn get_exercise_db() -> Vec<Exercise> {
    vec![
        // Strength
        Exercise { id: "bench_press".into(), name: "Bench Press".into(), name_vi: "Ép ngực".into(), met: 6.0, category: "strength".into(), muscle_group: "Ngực".into(), icon: "💪".into() },
        Exercise { id: "squat".into(), name: "Squat".into(), name_vi: "Squat".into(), met: 6.0, category: "strength".into(), muscle_group: "Chân".into(), icon: "🦵".into() },
        Exercise { id: "deadlift".into(), name: "Deadlift".into(), name_vi: "Cuốn đất".into(), met: 6.0, category: "strength".into(), muscle_group: "Lưng".into(), icon: "🏋️".into() },
        Exercise { id: "overhead_press".into(), name: "Overhead Press".into(), name_vi: "Đẩy tạ".into(), met: 5.0, category: "strength".into(), muscle_group: "Vai".into(), icon: "💪".into() },
        Exercise { id: "barbell_row".into(), name: "Barbell Row".into(), name_vi: "Kéo tạ".into(), met: 5.0, category: "strength".into(), muscle_group: "Lưng".into(), icon: "🏋️".into() },
        Exercise { id: "bicep_curl".into(), name: "Bicep Curl".into(), name_vi: "Cuốn tay".into(), met: 3.5, category: "strength".into(), muscle_group: "Tay".into(), icon: "💪".into() },
        Exercise { id: "tricep_dip".into(), name: "Tricep Dip".into(), name_vi: "Chùn tay".into(), met: 5.0, category: "strength".into(), muscle_group: "Tay".into(), icon: "💪".into() },
        Exercise { id: "lateral_raise".into(), name: "Lateral Raise".into(), name_vi: "Nâng ngang".into(), met: 3.5, category: "strength".into(), muscle_group: "Vai".into(), icon: "💪".into() },
        Exercise { id: "leg_press".into(), name: "Leg Press".into(), name_vi: "Đạp chân".into(), met: 5.0, category: "strength".into(), muscle_group: "Chân".into(), icon: "🦵".into() },
        Exercise { id: "calf_raise".into(), name: "Calf Raise".into(), name_vi: "Nâng gót".into(), met: 3.5, category: "strength".into(), muscle_group: "Chân".into(), icon: "🦵".into() },
        Exercise { id: "pull_up".into(), name: "Pull Up".into(), name_vi: "Kéo xô".into(), met: 8.0, category: "strength".into(), muscle_group: "Lưng".into(), icon: "💪".into() },
        Exercise { id: "push_up".into(), name: "Push Up".into(), name_vi: "Hít đất".into(), met: 8.0, category: "strength".into(), muscle_group: "Ngực".into(), icon: "💪".into() },
        Exercise { id: "plank".into(), name: "Plank".into(), name_vi: "Plank".into(), met: 4.0, category: "strength".into(), muscle_group: "Core".into(), icon: "💪".into() },
        // Cardio
        Exercise { id: "running".into(), name: "Running".into(), name_vi: "Chạy bộ".into(), met: 9.8, category: "cardio".into(), muscle_group: "Toàn thân".into(), icon: "🏃".into() },
        Exercise { id: "cycling".into(), name: "Cycling".into(), name_vi: "Đạp xe".into(), met: 7.5, category: "cardio".into(), muscle_group: "Chân".into(), icon: "🚴".into() },
        Exercise { id: "swimming".into(), name: "Swimming".into(), name_vi: "Bơi lội".into(), met: 8.0, category: "cardio".into(), muscle_group: "Toàn thân".into(), icon: "🏊".into() },
        Exercise { id: "jumping_rope".into(), name: "Jump Rope".into(), name_vi: "Nhảy dây".into(), met: 12.3, category: "cardio".into(), muscle_group: "Toàn thân".into(), icon: "🤸".into() },
        Exercise { id: "rowing_machine".into(), name: "Rowing Machine".into(), name_vi: "Máy chèo".into(), met: 7.0, category: "cardio".into(), muscle_group: "Toàn thân".into(), icon: "🚣".into() },
        Exercise { id: "stair_climbing".into(), name: "Stair Climbing".into(), name_vi: "Leo cầu thang".into(), met: 9.0, category: "cardio".into(), muscle_group: "Chân".into(), icon: "🏔️".into() },
        Exercise { id: "elliptical".into(), name: "Elliptical".into(), name_vi: "Máy elip".into(), met: 5.0, category: "cardio".into(), muscle_group: "Toàn thân".into(), icon: "🏋️".into() },
        Exercise { id: "walking".into(), name: "Walking".into(), name_vi: "Đi bộ".into(), met: 3.5, category: "cardio".into(), muscle_group: "Chân".into(), icon: "🚶".into() },
        // HIIT
        Exercise { id: "burpees".into(), name: "Burpees".into(), name_vi: "Burpees".into(), met: 12.5, category: "hiit".into(), muscle_group: "Toàn thân".into(), icon: "🤸".into() },
        Exercise { id: "mountain_climbers".into(), name: "Mountain Climbers".into(), name_vi: "Leo núi".into(), met: 8.0, category: "hiit".into(), muscle_group: "Toàn thân".into(), icon: "🏔️".into() },
        Exercise { id: "box_jumps".into(), name: "Box Jumps".into(), name_vi: "Nhảy hộp".into(), met: 10.0, category: "hiit".into(), muscle_group: "Chân".into(), icon: "📦".into() },
        // Flexibility
        Exercise { id: "yoga".into(), name: "Yoga".into(), name_vi: "Yoga".into(), met: 3.0, category: "flexibility".into(), muscle_group: "Toàn thân".into(), icon: "🧘".into() },
        Exercise { id: "stretching".into(), name: "Stretching".into(), name_vi: "Giãn cơ".into(), met: 2.5, category: "flexibility".into(), muscle_group: "Toàn thân".into(), icon: "🧘".into() },
    ]
}

// ─── Calorie Calculation (ACSM Formula) ───

/// Calories = MET × body_weight(kg) × duration(hours)
/// Reference: Ainsworth BE et al. "2024 Compendium of Physical Activities"
fn calculate_calories(
    exercise_id: &str,
    body_weight: f64,
    sets: i32,
    reps: i32,
    duration_minutes: f64,
) -> f64 {
    let exercises = get_exercise_db();
    let exercise = match exercises.iter().find(|e| e.id == exercise_id) {
        Some(e) => e,
        None => return 0.0,
    };

    let weight = if body_weight > 0.0 { body_weight } else { 70.0 };
    let duration_hrs = if duration_minutes > 0.0 {
        duration_minutes / 60.0
    } else {
        // Estimate: ~3 sec/rep + 60s rest between sets
        let total_secs = (sets as f64) * (reps as f64) * 3.0 + ((sets - 1) as f64) * 60.0;
        total_secs / 3600.0
    };

    exercise.met * weight * duration_hrs
}

// ─── Persistence ───

fn data_file_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("workouts.json")
}

fn settings_file_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("settings.json")
}

#[derive(Serialize, Deserialize)]
struct Settings {
    body_weight: f64,
    user_name: String,
}

fn load_workouts(path: &PathBuf) -> Vec<WorkoutEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_workouts(path: &PathBuf, workouts: &[WorkoutEntry]) {
    if let Ok(data) = serde_json::to_string_pretty(workouts) {
        let _ = fs::write(path, data);
    }
}

fn load_settings(path: &PathBuf) -> Settings {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or(Settings {
            body_weight: 70.0,
            user_name: "User".into(),
        })
    } else {
        Settings { body_weight: 70.0, user_name: "User".into() }
    }
}

fn save_settings(path: &PathBuf, settings: &Settings) {
    if let Ok(data) = serde_json::to_string_pretty(settings) {
        let _ = fs::write(path, data);
    }
}

// ─── Tauri Commands ───

#[tauri::command]
fn get_exercises() -> Vec<Exercise> {
    get_exercise_db()
}

#[tauri::command]
fn get_exercises_by_category(category: String) -> Vec<Exercise> {
    get_exercise_db()
        .into_iter()
        .filter(|e| e.category == category)
        .collect()
}

#[tauri::command]
fn add_workout(
    state: State<'_, AppState>,
    exercise_id: String,
    sets: i32,
    reps: i32,
    weight_kg: f64,
    duration_minutes: f64,
    notes: Option<String>,
) -> WorkoutEntry {
    let exercises = get_exercise_db();
    let exercise = exercises.iter().find(|e| e.id == exercise_id).unwrap();

    let weight = *state.body_weight.lock().unwrap();
    let calories = calculate_calories(&exercise_id, weight, sets, reps, duration_minutes);

    let entry = WorkoutEntry {
        id: uuid::Uuid::new_v4().to_string(),
        exercise_id: exercise_id.clone(),
        exercise_name: exercise.name_vi.clone(),
        sets,
        reps,
        weight_kg,
        duration_minutes,
        date: Utc::now(),
        calories_burned: calories,
        met_value: exercise.met,
        notes,
    };

    let mut workouts = state.workouts.lock().unwrap();
    workouts.push(entry.clone());
    save_workouts(&state.data_path, &workouts);
    entry
}

#[tauri::command]
fn delete_workout(state: State<'_, AppState>, id: String) -> bool {
    let mut workouts = state.workouts.lock().unwrap();
    let len_before = workouts.len();
    workouts.retain(|w| w.id != id);
    let changed = workouts.len() < len_before;
    if changed {
        save_workouts(&state.data_path, &workouts);
    }
    changed
}

#[tauri::command]
fn get_all_workouts(state: State<'_, AppState>) -> Vec<WorkoutEntry> {
    let mut workouts = state.workouts.lock().unwrap().clone();
    workouts.sort_by(|a, b| b.date.cmp(&a.date));
    workouts
}

#[tauri::command]
fn get_daily_calories(state: State<'_, AppState>, days: i32) -> Vec<DailySummary> {
    let workouts = state.workouts.lock().unwrap();
    let now = Utc::now();
    let mut summaries = Vec::new();

    for i in 0..days {
        let date = now - chrono::Duration::days(i as i64);
        let naive = date.date_naive();
        let day_cal: f64 = workouts
            .iter()
            .filter(|w| w.date.date_naive() == naive)
            .map(|w| w.calories_burned)
            .sum();
        let count = workouts
            .iter()
            .filter(|w| w.date.date_naive() == naive)
            .count() as i32;

        summaries.push(DailySummary {
            date: naive,
            calories: day_cal,
            workout_count: count,
        });
    }

    summaries.reverse();
    summaries
}

#[tauri::command]
fn get_exercise_distribution(state: State<'_, AppState>, days: i32) -> Vec<ExerciseDistribution> {
    let workouts = state.workouts.lock().unwrap();
    let now = Utc::now();
    let cutoff = now - chrono::Duration::days(days as i64);

    let mut dist: Vec<(String, f64)> = Vec::new();
    for w in workouts.iter() {
        if w.date > cutoff {
            if let Some(existing) = dist.iter_mut().find(|(name, _)| name == &w.exercise_name) {
                existing.1 += w.calories_burned;
            } else {
                dist.push((w.exercise_name.clone(), w.calories_burned));
            }
        }
    }

    let total: f64 = dist.iter().map(|(_, c)| c).sum();
    dist.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());

    dist.into_iter()
        .map(|(name, cal)| ExerciseDistribution {
            exercise_name: name,
            calories: cal,
            percentage: if total > 0.0 { cal / total * 100.0 } else { 0.0 },
        })
        .collect()
}

#[tauri::command]
fn get_stats_overview(state: State<'_, AppState>, days: i32) -> StatsOverview {
    let workouts = state.workouts.lock().unwrap();
    let now = Utc::now();
    let cutoff = now - chrono::Duration::days(days as i64);

    let recent: Vec<&WorkoutEntry> = workouts.iter().filter(|w| w.date > cutoff).collect();
    let total_cal: f64 = recent.iter().map(|w| w.calories_burned).sum();
    let total_vol: f64 = recent.iter().map(|w| w.sets as f64 * w.reps as f64 * w.weight_kg).sum();
    let active_days: i32 = recent.iter().map(|w| w.date.date_naive()).collect::<std::collections::HashSet<_>>().len() as i32;

    StatsOverview {
        total_calories: total_cal,
        avg_calories_per_day: if days > 0 { total_cal / days as f64 } else { 0.0 },
        active_days,
        total_workouts: recent.len() as i32,
        total_volume: total_vol,
    }
}

#[tauri::command]
fn get_body_weight(state: State<'_, AppState>) -> f64 {
    *state.body_weight.lock().unwrap()
}

#[tauri::command]
fn set_body_weight(state: State<'_, AppState>, weight: f64) {
    *state.body_weight.lock().unwrap() = weight;
    let path = state.data_path.parent().unwrap().join("settings.json");
    let name = state.user_name.lock().unwrap().clone();
    save_settings(&path, &Settings { body_weight: weight, user_name: name });
}

#[tauri::command]
fn get_user_name(state: State<'_, AppState>) -> String {
    state.user_name.lock().unwrap().clone()
}

#[tauri::command]
fn set_user_name(state: State<'_, AppState>, name: String) {
    *state.user_name.lock().unwrap() = name.clone();
    let path = state.data_path.parent().unwrap().join("settings.json");
    let weight = *state.body_weight.lock().unwrap();
    save_settings(&path, &Settings { body_weight: weight, user_name: name });
}

#[tauri::command]
fn preview_calories(exercise_id: String, sets: i32, reps: i32, duration_minutes: f64, state: State<'_, AppState>) -> f64 {
    let weight = *state.body_weight.lock().unwrap();
    calculate_calories(&exercise_id, weight, sets, reps, duration_minutes)
}

// ─── Main ───

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let _ = fs::create_dir_all(&data_dir);

            let workouts_path = data_file_path(&data_dir);
            let settings_path = settings_file_path(&data_dir);
            let settings = load_settings(&settings_path);
            let workouts = load_workouts(&workouts_path);

            app.manage(AppState {
                workouts: Mutex::new(workouts),
                body_weight: Mutex::new(settings.body_weight),
                user_name: Mutex::new(settings.user_name),
                data_path: workouts_path,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_exercises,
            get_exercises_by_category,
            add_workout,
            delete_workout,
            get_all_workouts,
            get_daily_calories,
            get_exercise_distribution,
            get_stats_overview,
            get_body_weight,
            set_body_weight,
            get_user_name,
            set_user_name,
            preview_calories,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
