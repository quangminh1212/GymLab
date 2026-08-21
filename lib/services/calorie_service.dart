import '../constants/exercise_database.dart';

/// Calorie calculation service using the Compendium of Physical Activities.
///
/// Formula: Calories = MET × bodyWeight(kg) × duration(hours)
///
/// References:
/// - Ainsworth BE, et al. "2024 Compendium of Physical Activities"
/// - American College of Sports Medicine (ACSM) Guidelines
/// - World Health Organization (WHO) Physical Activity Guidelines
class CalorieService {
  static const double _defaultBodyWeight = 70.0; // kg

  /// Calculate calories burned for a single exercise set.
  ///
  /// [exerciseId] - ID from ExerciseDatabase
  /// [bodyWeight] - User body weight in kg
  /// [sets] - Number of sets
  /// [reps] - Reps per set
  /// [durationMinutes] - Duration in minutes (0 = auto-calculate)
  static double calculateCalories({
    required String exerciseId,
    required double bodyWeight,
    required int sets,
    required int reps,
    double durationMinutes = 0,
  }) {
    final exercise = ExerciseDatabase.getById(exerciseId);
    if (exercise == null) return 0.0;

    final met = exercise['met'] as double;
    final weight = bodyWeight > 0 ? bodyWeight : _defaultBodyWeight;

    double durationHrs;
    if (durationMinutes > 0) {
      durationHrs = durationMinutes / 60.0;
    } else {
      // Estimate: ~3 sec/rep + 60s rest between sets
      final totalSecs = sets * reps * 3.0 + (sets - 1) * 60.0;
      durationHrs = totalSecs / 3600.0;
    }

    return met * weight * durationHrs;
  }

  /// Calculate calories for a strength exercise based on volume.
  ///
  /// Alternative formula for resistance training:
  /// Calories ≈ sets × reps × weight(kg) × 0.05
  /// (Approximation per ACSM resistance training guidelines)
  static double calculateStrengthCalories({
    required int sets,
    required int reps,
    required double weightKg,
  }) {
    return sets * reps * weightKg * 0.05;
  }

  /// Get daily calorie burn estimate from all workouts.
  static double calculateDailyTotal(List<Map<String, dynamic>> workouts) {
    double total = 0;
    for (final w in workouts) {
      total += (w['caloriesBurned'] as double?) ?? 0;
    }
    return total;
  }

  /// Get recommended daily calorie target based on activity level.
  /// Based on WHO/FAO/UNU energy requirements report.
  static double getRecommendedCalories({
    required double bodyWeight,
    required String activityLevel, // sedentary, light, moderate, active, very_active
  }) {
    // Basal Metabolic Rate (Mifflin-St Jeor)
    // For males: BMR = 10W + 6.25H - 5A + 5
    // Using average height 170cm, age 30
    final bmr = 10 * bodyWeight + 6.25 * 170 - 5 * 30 + 5;

    const multipliers = {
      'sedentary': 1.2,
      'light': 1.375,
      'moderate': 1.55,
      'active': 1.725,
      'very_active': 1.9,
    };

    return bmr * (multipliers[activityLevel] ?? 1.55);
  }

  /// Get MET category label for display.
  static String getMetCategory(double met) {
    if (met < 3.0) return 'Nhẹ';
    if (met < 6.0) return 'Trung bình';
    if (met < 9.0) return 'Nặng';
    return 'Rất nặng';
  }

  /// Get all available exercises as a list.
  static List<Map<String, dynamic>> getAllExercises() {
    return ExerciseDatabase.allExercises;
  }

  /// Search exercises by name.
  static List<Map<String, dynamic>> searchExercises(String query) {
    final q = query.toLowerCase();
    return ExerciseDatabase.allExercises.where((e) {
      final name = (e['name'] as String).toLowerCase();
      final nameVi = (e['nameVi'] as String).toLowerCase();
      return name.contains(q) || nameVi.contains(q);
    }).toList();
  }
}
