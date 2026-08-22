#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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

// ─── Additional Data Models ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalRecord {
    pub exercise_id: String,
    pub exercise_name: String,
    pub max_weight: f64,
    pub max_reps: i32,
    pub max_volume: f64,
    pub date: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkoutTemplate {
    pub id: String,
    pub name: String,
    pub exercises: Vec<TemplateExercise>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateExercise {
    pub exercise_id: String,
    pub exercise_name: String,
    pub sets: i32,
    pub reps: i32,
    pub weight_kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyWeightEntry {
    pub date: DateTime<Utc>,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseProgress {
    pub date: DateTime<Utc>,
    pub weight: f64,
    pub reps: i32,
    pub volume: f64,
    pub sets: i32,
}

// ─── App State ───

pub struct AppState {
    pub workouts: Mutex<Vec<WorkoutEntry>>,
    pub body_weight: Mutex<f64>,
    pub user_name: Mutex<String>,
    pub templates: Mutex<Vec<WorkoutTemplate>>,
    pub body_weight_log: Mutex<Vec<BodyWeightEntry>>,
    pub data_path: PathBuf,
}

// ─── Exercise Database (ACSM Compendium 2024) ───

pub fn get_exercise_db() -> Vec<Exercise> {
    vec![
        // Strength
        Exercise {
            id: "bench_press".into(),
            name: "Bench Press".into(),
            name_vi: "Ép ngực".into(),
            met: 6.0,
            category: "strength".into(),
            muscle_group: "Ngực".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "squat".into(),
            name: "Squat".into(),
            name_vi: "Squat".into(),
            met: 6.0,
            category: "strength".into(),
            muscle_group: "Chân".into(),
            icon: "🦵".into(),
        },
        Exercise {
            id: "deadlift".into(),
            name: "Deadlift".into(),
            name_vi: "Cuốn đất".into(),
            met: 6.0,
            category: "strength".into(),
            muscle_group: "Lưng".into(),
            icon: "🏋️".into(),
        },
        Exercise {
            id: "overhead_press".into(),
            name: "Overhead Press".into(),
            name_vi: "Đẩy tạ".into(),
            met: 5.0,
            category: "strength".into(),
            muscle_group: "Vai".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "barbell_row".into(),
            name: "Barbell Row".into(),
            name_vi: "Kéo tạ".into(),
            met: 5.0,
            category: "strength".into(),
            muscle_group: "Lưng".into(),
            icon: "🏋️".into(),
        },
        Exercise {
            id: "bicep_curl".into(),
            name: "Bicep Curl".into(),
            name_vi: "Cuốn tay".into(),
            met: 3.5,
            category: "strength".into(),
            muscle_group: "Tay".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "tricep_dip".into(),
            name: "Tricep Dip".into(),
            name_vi: "Chùn tay".into(),
            met: 5.0,
            category: "strength".into(),
            muscle_group: "Tay".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "lateral_raise".into(),
            name: "Lateral Raise".into(),
            name_vi: "Nâng ngang".into(),
            met: 3.5,
            category: "strength".into(),
            muscle_group: "Vai".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "leg_press".into(),
            name: "Leg Press".into(),
            name_vi: "Đạp chân".into(),
            met: 5.0,
            category: "strength".into(),
            muscle_group: "Chân".into(),
            icon: "🦵".into(),
        },
        Exercise {
            id: "calf_raise".into(),
            name: "Calf Raise".into(),
            name_vi: "Nâng gót".into(),
            met: 3.5,
            category: "strength".into(),
            muscle_group: "Chân".into(),
            icon: "🦵".into(),
        },
        Exercise {
            id: "pull_up".into(),
            name: "Pull Up".into(),
            name_vi: "Kéo xô".into(),
            met: 8.0,
            category: "strength".into(),
            muscle_group: "Lưng".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "push_up".into(),
            name: "Push Up".into(),
            name_vi: "Hít đất".into(),
            met: 8.0,
            category: "strength".into(),
            muscle_group: "Ngực".into(),
            icon: "💪".into(),
        },
        Exercise {
            id: "plank".into(),
            name: "Plank".into(),
            name_vi: "Plank".into(),
            met: 4.0,
            category: "strength".into(),
            muscle_group: "Core".into(),
            icon: "💪".into(),
        },
        // Cardio
        Exercise {
            id: "running".into(),
            name: "Running".into(),
            name_vi: "Chạy bộ".into(),
            met: 9.8,
            category: "cardio".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🏃".into(),
        },
        Exercise {
            id: "cycling".into(),
            name: "Cycling".into(),
            name_vi: "Đạp xe".into(),
            met: 7.5,
            category: "cardio".into(),
            muscle_group: "Chân".into(),
            icon: "🚴".into(),
        },
        Exercise {
            id: "swimming".into(),
            name: "Swimming".into(),
            name_vi: "Bơi lội".into(),
            met: 8.0,
            category: "cardio".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🏊".into(),
        },
        Exercise {
            id: "jumping_rope".into(),
            name: "Jump Rope".into(),
            name_vi: "Nhảy dây".into(),
            met: 12.3,
            category: "cardio".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🤸".into(),
        },
        Exercise {
            id: "rowing_machine".into(),
            name: "Rowing Machine".into(),
            name_vi: "Máy chèo".into(),
            met: 7.0,
            category: "cardio".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🚣".into(),
        },
        Exercise {
            id: "stair_climbing".into(),
            name: "Stair Climbing".into(),
            name_vi: "Leo cầu thang".into(),
            met: 9.0,
            category: "cardio".into(),
            muscle_group: "Chân".into(),
            icon: "🏔️".into(),
        },
        Exercise {
            id: "elliptical".into(),
            name: "Elliptical".into(),
            name_vi: "Máy elip".into(),
            met: 5.0,
            category: "cardio".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🏋️".into(),
        },
        Exercise {
            id: "walking".into(),
            name: "Walking".into(),
            name_vi: "Đi bộ".into(),
            met: 3.5,
            category: "cardio".into(),
            muscle_group: "Chân".into(),
            icon: "🚶".into(),
        },
        // HIIT
        Exercise {
            id: "burpees".into(),
            name: "Burpees".into(),
            name_vi: "Burpees".into(),
            met: 12.5,
            category: "hiit".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🤸".into(),
        },
        Exercise {
            id: "mountain_climbers".into(),
            name: "Mountain Climbers".into(),
            name_vi: "Leo núi".into(),
            met: 8.0,
            category: "hiit".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🏔️".into(),
        },
        Exercise {
            id: "box_jumps".into(),
            name: "Box Jumps".into(),
            name_vi: "Nhảy hộp".into(),
            met: 10.0,
            category: "hiit".into(),
            muscle_group: "Chân".into(),
            icon: "📦".into(),
        },
        // Flexibility
        Exercise {
            id: "yoga".into(),
            name: "Yoga".into(),
            name_vi: "Yoga".into(),
            met: 3.0,
            category: "flexibility".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🧘".into(),
        },
        Exercise {
            id: "stretching".into(),
            name: "Stretching".into(),
            name_vi: "Giãn cơ".into(),
            met: 2.5,
            category: "flexibility".into(),
            muscle_group: "Toàn thân".into(),
            icon: "🧘".into(),
        },
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
    let exercise = find_exercise(exercise_id);
    let weight = if body_weight > 0.0 { body_weight } else { 70.0 };
    let duration_hrs = if duration_minutes > 0.0 {
        duration_minutes / 60.0
    } else {
        let total_secs =
            (sets.max(1) as f64) * (reps.max(1) as f64) * 3.0 + ((sets.max(1) - 1) as f64) * 60.0;
        total_secs / 3600.0
    };

    exercise.met * weight * duration_hrs
}

/// Find exercise by ID, returns default "Unknown" exercise if not found.
fn find_exercise(exercise_id: &str) -> Exercise {
    let exercises = get_exercise_db();
    exercises
        .into_iter()
        .find(|e| e.id == exercise_id)
        .unwrap_or(Exercise {
            id: "unknown".into(),
            name: "Unknown".into(),
            name_vi: "Không rõ".into(),
            met: 5.0,
            category: "unknown".into(),
            muscle_group: "unknown".into(),
            icon: "dumbbell".into(),
        })
}

// ─── Input Validation ───

fn validate_sets(s: i32) -> i32 {
    s.clamp(1, 100)
}
fn validate_reps(r: i32) -> i32 {
    r.clamp(1, 1000)
}
fn validate_weight(w: f64) -> f64 {
    w.clamp(0.0, 500.0)
}
fn validate_duration(d: f64) -> f64 {
    d.clamp(0.0, 600.0)
}
fn validate_body_weight(w: f64) -> f64 {
    w.clamp(20.0, 300.0)
}

// ─── Persistence ───

fn data_file_path(app_dir: &Path) -> PathBuf {
    app_dir.join("workouts.json")
}

fn settings_file_path(app_dir: &Path) -> PathBuf {
    app_dir.join("settings.json")
}

fn templates_file_path(app_dir: &Path) -> PathBuf {
    app_dir.join("templates.json")
}

fn body_weight_log_file_path(app_dir: &Path) -> PathBuf {
    app_dir.join("body_weight_log.json")
}

#[derive(Serialize, Deserialize)]
struct Settings {
    body_weight: f64,
    user_name: String,
}

fn load_workouts(path: &Path) -> Vec<WorkoutEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_workouts(path: &Path, workouts: &[WorkoutEntry]) {
    if let Ok(data) = serde_json::to_string_pretty(workouts) {
        let _ = fs::write(path, data);
    }
}

fn load_settings(path: &Path) -> Settings {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or(Settings {
            body_weight: 70.0,
            user_name: "User".into(),
        })
    } else {
        Settings {
            body_weight: 70.0,
            user_name: "User".into(),
        }
    }
}

fn save_settings(path: &Path, settings: &Settings) {
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
    let sets = validate_sets(sets);
    let reps = validate_reps(reps);
    let weight_kg = validate_weight(weight_kg);
    let duration_minutes = validate_duration(duration_minutes);

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
    workouts.sort_by_key(|w| std::cmp::Reverse(w.date));
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
            percentage: if total > 0.0 {
                cal / total * 100.0
            } else {
                0.0
            },
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
    let total_vol: f64 = recent
        .iter()
        .map(|w| w.sets as f64 * w.reps as f64 * w.weight_kg)
        .sum();
    let active_days: i32 = recent
        .iter()
        .map(|w| w.date.date_naive())
        .collect::<std::collections::HashSet<_>>()
        .len() as i32;

    StatsOverview {
        total_calories: total_cal,
        avg_calories_per_day: if days > 0 {
            total_cal / days as f64
        } else {
            0.0
        },
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
    let weight = validate_body_weight(weight);
    *state.body_weight.lock().unwrap() = weight;
    let path = state.data_path.parent().unwrap().join("settings.json");
    let name = state.user_name.lock().unwrap().clone();
    save_settings(
        &path,
        &Settings {
            body_weight: weight,
            user_name: name,
        },
    );
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
    save_settings(
        &path,
        &Settings {
            body_weight: weight,
            user_name: name,
        },
    );
}

#[tauri::command]
fn preview_calories(
    exercise_id: String,
    sets: i32,
    reps: i32,
    duration_minutes: f64,
    state: State<'_, AppState>,
) -> f64 {
    let weight = *state.body_weight.lock().unwrap();
    calculate_calories(&exercise_id, weight, sets, reps, duration_minutes)
}

// ─── Personal Records ───

#[tauri::command]
fn get_personal_records(state: State<'_, AppState>) -> Vec<PersonalRecord> {
    let workouts = state.workouts.lock().unwrap();
    let mut records: Vec<PersonalRecord> = Vec::new();

    let mut by_exercise: std::collections::HashMap<String, Vec<&WorkoutEntry>> =
        std::collections::HashMap::new();
    for w in workouts.iter() {
        by_exercise
            .entry(w.exercise_id.clone())
            .or_default()
            .push(w);
    }

    for (eid, entries) in by_exercise {
        let best = entries
            .iter()
            .max_by(|a, b| a.weight_kg.partial_cmp(&b.weight_kg).unwrap())
            .unwrap();
        let max_vol = entries
            .iter()
            .map(|e| e.sets as f64 * e.reps as f64 * e.weight_kg)
            .fold(0.0f64, f64::max);

        records.push(PersonalRecord {
            exercise_id: eid.clone(),
            exercise_name: best.exercise_name.clone(),
            max_weight: best.weight_kg,
            max_reps: best.reps,
            max_volume: max_vol,
            date: best.date,
        });
    }

    records.sort_by(|a, b| b.max_weight.partial_cmp(&a.max_weight).unwrap());
    records
}

// ─── Workout Templates ───

fn load_templates(path: &Path) -> Vec<WorkoutTemplate> {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_templates(path: &Path, templates: &[WorkoutTemplate]) {
    if let Ok(data) = serde_json::to_string_pretty(templates) {
        let _ = fs::write(path, data);
    }
}

#[tauri::command]
fn get_templates(state: State<'_, AppState>) -> Vec<WorkoutTemplate> {
    state.templates.lock().unwrap().clone()
}

#[tauri::command]
fn save_template(
    state: State<'_, AppState>,
    name: String,
    exercise_ids: Vec<String>,
    sets_list: Vec<i32>,
    reps_list: Vec<i32>,
    weights: Vec<f64>,
) -> WorkoutTemplate {
    let exercises_db = get_exercise_db();
    let exercises: Vec<TemplateExercise> = exercise_ids
        .iter()
        .enumerate()
        .map(|(i, eid)| {
            let ex = exercises_db.iter().find(|e| e.id == *eid);
            TemplateExercise {
                exercise_id: eid.clone(),
                exercise_name: ex.map(|e| e.name_vi.clone()).unwrap_or_default(),
                sets: sets_list.get(i).copied().unwrap_or(3),
                reps: reps_list.get(i).copied().unwrap_or(10),
                weight_kg: weights.get(i).copied().unwrap_or(0.0),
            }
        })
        .collect();

    let template = WorkoutTemplate {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        exercises,
        created_at: Utc::now(),
    };

    let mut templates = state.templates.lock().unwrap();
    templates.push(template.clone());
    let path = state.data_path.parent().unwrap().join("templates.json");
    save_templates(&path, &templates);
    template
}

#[tauri::command]
fn delete_template(state: State<'_, AppState>, id: String) -> bool {
    let mut templates = state.templates.lock().unwrap();
    let len_before = templates.len();
    templates.retain(|t| t.id != id);
    let changed = templates.len() < len_before;
    if changed {
        let path = state.data_path.parent().unwrap().join("templates.json");
        save_templates(&path, &templates);
    }
    changed
}

#[tauri::command]
fn relog_from_template(state: State<'_, AppState>, template_id: String) -> Vec<WorkoutEntry> {
    let templates = state.templates.lock().unwrap();
    let template = match templates.iter().find(|t| t.id == template_id) {
        Some(t) => t.clone(),
        None => return vec![],
    };
    drop(templates);

    let weight = *state.body_weight.lock().unwrap();
    let mut new_entries = Vec::new();

    for ex in &template.exercises {
        let calories = calculate_calories(&ex.exercise_id, weight, ex.sets, ex.reps, 0.0);
        let entry = WorkoutEntry {
            id: uuid::Uuid::new_v4().to_string(),
            exercise_id: ex.exercise_id.clone(),
            exercise_name: ex.exercise_name.clone(),
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg,
            duration_minutes: 0.0,
            date: Utc::now(),
            calories_burned: calories,
            met_value: 6.0,
            notes: None,
        };
        new_entries.push(entry);
    }

    let mut workouts = state.workouts.lock().unwrap();
    workouts.extend(new_entries.clone());
    save_workouts(&state.data_path, &workouts);
    new_entries
}

// ─── Body Weight Log ───

fn load_body_weight_log(path: &Path) -> Vec<BodyWeightEntry> {
    if let Ok(data) = fs::read_to_string(path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        vec![]
    }
}

fn save_body_weight_log(path: &Path, log: &[BodyWeightEntry]) {
    if let Ok(data) = serde_json::to_string_pretty(log) {
        let _ = fs::write(path, data);
    }
}

#[tauri::command]
fn log_body_weight(state: State<'_, AppState>, weight: f64) -> BodyWeightEntry {
    let entry = BodyWeightEntry {
        date: Utc::now(),
        weight,
    };
    let mut log = state.body_weight_log.lock().unwrap();
    log.push(entry.clone());
    let path = state
        .data_path
        .parent()
        .unwrap()
        .join("body_weight_log.json");
    save_body_weight_log(&path, &log);
    entry
}

#[tauri::command]
fn get_body_weight_history(state: State<'_, AppState>, days: i32) -> Vec<BodyWeightEntry> {
    let log = state.body_weight_log.lock().unwrap();
    let cutoff = Utc::now() - chrono::Duration::days(days as i64);
    let mut entries: Vec<BodyWeightEntry> =
        log.iter().filter(|e| e.date > cutoff).cloned().collect();
    entries.sort_by_key(|e| e.date);
    entries
}

// ─── Exercise Progress ───

#[tauri::command]
fn get_exercise_progress(state: State<'_, AppState>, exercise_id: String) -> Vec<ExerciseProgress> {
    let workouts = state.workouts.lock().unwrap();
    let entries: Vec<ExerciseProgress> = workouts
        .iter()
        .filter(|w| w.exercise_id == exercise_id)
        .map(|w| ExerciseProgress {
            date: w.date,
            weight: w.weight_kg,
            reps: w.reps,
            volume: w.sets as f64 * w.reps as f64 * w.weight_kg,
            sets: w.sets,
        })
        .collect();
    entries
}

// ─── Quick Re-log ───

#[tauri::command]
fn quick_relog(state: State<'_, AppState>, workout_id: String) -> Option<WorkoutEntry> {
    let workouts = state.workouts.lock().unwrap();
    let original = workouts.iter().find(|w| w.id == workout_id)?.clone();
    drop(workouts);

    let weight = *state.body_weight.lock().unwrap();
    let calories = calculate_calories(
        &original.exercise_id,
        weight,
        original.sets,
        original.reps,
        original.duration_minutes,
    );

    let new_entry = WorkoutEntry {
        id: uuid::Uuid::new_v4().to_string(),
        exercise_id: original.exercise_id,
        exercise_name: original.exercise_name,
        sets: original.sets,
        reps: original.reps,
        weight_kg: original.weight_kg,
        duration_minutes: original.duration_minutes,
        date: Utc::now(),
        calories_burned: calories,
        met_value: original.met_value,
        notes: Some(format!("Re-log from {}", original.date.format("%d/%m/%Y"))),
    };

    let mut workouts = state.workouts.lock().unwrap();
    workouts.push(new_entry.clone());
    save_workouts(&state.data_path, &workouts);
    Some(new_entry)
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
            let templates_path = templates_file_path(&data_dir);
            let bw_log_path = body_weight_log_file_path(&data_dir);
            let settings = load_settings(&settings_path);
            let workouts = load_workouts(&workouts_path);
            let templates = load_templates(&templates_path);
            let body_weight_log = load_body_weight_log(&bw_log_path);

            app.manage(AppState {
                workouts: Mutex::new(workouts),
                body_weight: Mutex::new(settings.body_weight),
                user_name: Mutex::new(settings.user_name),
                templates: Mutex::new(templates),
                body_weight_log: Mutex::new(body_weight_log),
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
            get_personal_records,
            get_templates,
            save_template,
            delete_template,
            relog_from_template,
            log_body_weight,
            get_body_weight_history,
            get_exercise_progress,
            quick_relog,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Unit Tests ───

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exercise_db_has_26_entries() {
        let db = get_exercise_db();
        assert_eq!(db.len(), 26);
    }

    #[test]
    fn test_find_exercise_valid() {
        let ex = find_exercise("bench_press");
        assert_eq!(ex.name, "Bench Press");
        assert_eq!(ex.met, 6.0);
    }

    #[test]
    fn test_find_exercise_invalid_returns_default() {
        let ex = find_exercise("nonexistent");
        assert_eq!(ex.name, "Unknown");
        assert_eq!(ex.met, 5.0);
    }

    #[test]
    fn test_calculate_calories_positive() {
        let cal = calculate_calories("bench_press", 70.0, 3, 10, 30.0);
        assert!(cal > 0.0, "calories should be positive");
    }

    #[test]
    fn test_calculate_calories_zero_duration_estimates() {
        let cal = calculate_calories("bench_press", 70.0, 3, 10, 0.0);
        assert!(cal > 0.0, "should estimate from reps");
    }

    #[test]
    fn test_calculate_calories_unknown_uses_default_met() {
        // Unknown exercise gets MET 5.0, so calories > 0
        let cal = calculate_calories("fake", 70.0, 3, 10, 30.0);
        assert!(cal > 0.0, "unknown exercise uses default MET 5.0");
    }

    #[test]
    fn test_validate_sets_clamps() {
        assert_eq!(validate_sets(0), 1);
        assert_eq!(validate_sets(5), 5);
        assert_eq!(validate_sets(200), 100);
    }

    #[test]
    fn test_validate_reps_clamps() {
        assert_eq!(validate_reps(0), 1);
        assert_eq!(validate_reps(12), 12);
        assert_eq!(validate_reps(5000), 1000);
    }

    #[test]
    fn test_validate_weight_clamps() {
        assert_eq!(validate_weight(-5.0), 0.0);
        assert_eq!(validate_weight(60.0), 60.0);
        assert_eq!(validate_weight(999.0), 500.0);
    }

    #[test]
    fn test_validate_body_weight_clamps() {
        assert_eq!(validate_body_weight(5.0), 20.0);
        assert_eq!(validate_body_weight(75.0), 75.0);
        assert_eq!(validate_body_weight(500.0), 300.0);
    }

    #[test]
    fn test_validate_duration_clamps() {
        assert_eq!(validate_duration(-1.0), 0.0);
        assert_eq!(validate_duration(45.0), 45.0);
        assert_eq!(validate_duration(999.0), 600.0);
    }

    #[test]
    fn test_all_met_values_positive() {
        let db = get_exercise_db();
        for ex in &db {
            assert!(ex.met > 0.0, "{} has non-positive MET: {}", ex.id, ex.met);
        }
    }

    #[test]
    fn test_all_exercise_ids_unique() {
        let db = get_exercise_db();
        let ids: Vec<&str> = db.iter().map(|e| e.id.as_str()).collect();
        let unique: std::collections::HashSet<&str> = ids.iter().copied().collect();
        assert_eq!(ids.len(), unique.len(), "duplicate exercise IDs found");
    }

    #[test]
    fn test_workout_entry_serialization_roundtrip() {
        let entry = WorkoutEntry {
            id: "test-id".into(),
            exercise_id: "bench_press".into(),
            exercise_name: "Bench Press".into(),
            sets: 3,
            reps: 10,
            weight_kg: 60.0,
            duration_minutes: 30.0,
            date: Utc::now(),
            calories_burned: 123.45,
            met_value: 6.0,
            notes: Some("test".into()),
        };
        let json = serde_json::to_string(&entry).unwrap();
        let back: WorkoutEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(back.id, entry.id);
        assert_eq!(back.exercise_id, entry.exercise_id);
        assert_eq!(back.sets, entry.sets);
        assert!((back.calories_burned - entry.calories_burned).abs() < 0.01);
    }

    #[test]
    fn test_daily_summary() {
        let ds = DailySummary {
            date: Utc::now().date_naive(),
            calories: 500.0,
            workout_count: 3,
        };
        assert_eq!(ds.workout_count, 3);
        assert!(ds.calories > 0.0);
    }

    #[test]
    fn test_settings_default() {
        let s = Settings {
            body_weight: 70.0,
            user_name: "User".into(),
        };
        assert!(s.body_weight > 0.0);
        assert!(!s.user_name.is_empty());
    }
}
