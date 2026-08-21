import 'package:hive_flutter/hive_flutter.dart';
import '../models/workout_entry.dart';

class StorageService {
  static const String _workoutBox = 'workouts';
  static const String _settingsBox = 'settings';
  static const String _bodyWeightKey = 'bodyWeight';
  static const String _userNameKey = 'userName';

  static late Box<WorkoutEntry> _workouts;
  static late Box _settings;

  /// Initialize Hive and open boxes.
  static Future<void> init() async {
    await Hive.initFlutter();
    Hive.registerAdapter(WorkoutEntryAdapter());
    _workouts = await Hive.openBox<WorkoutEntry>(_workoutBox);
    _settings = await Hive.openBox(_settingsBox);
  }

  // ── Workout CRUD ──

  static Future<void> addWorkout(WorkoutEntry entry) async {
    await _workouts.put(entry.id, entry);
  }

  static Future<void> updateWorkout(WorkoutEntry entry) async {
    await _workouts.put(entry.id, entry);
  }

  static Future<void> deleteWorkout(String id) async {
    await _workouts.delete(id);
  }

  static WorkoutEntry? getWorkout(String id) {
    return _workouts.get(id);
  }

  static List<WorkoutEntry> getAllWorkouts() {
    return _workouts.values.toList()
      ..sort((a, b) => b.date.compareTo(a.date));
  }

  /// Get workouts for a specific date.
  static List<WorkoutEntry> getWorkoutsForDate(DateTime date) {
    return _workouts.values.where((w) {
      return w.date.year == date.year &&
          w.date.month == date.month &&
          w.date.day == date.day;
    }).toList();
  }

  /// Get workouts for a date range.
  static List<WorkoutEntry> getWorkoutsInRange(DateTime start, DateTime end) {
    return _workouts.values.where((w) {
      return w.date.isAfter(start.subtract(const Duration(days: 1))) &&
          w.date.isBefore(end.add(const Duration(days: 1)));
    }).toList();
  }

  /// Get workouts for the current week.
  static List<WorkoutEntry> getThisWeekWorkouts() {
    final now = DateTime.now();
    final start = now.subtract(Duration(days: now.weekday - 1));
    return getWorkoutsInRange(
      DateTime(start.year, start.month, start.day),
      now,
    );
  }

  /// Get workouts for the current month.
  static List<WorkoutEntry> getThisMonthWorkouts() {
    final now = DateTime.now();
    return getWorkoutsInRange(
      DateTime(now.year, now.month, 1),
      now,
    );
  }

  /// Get total calories burned in a date range.
  static double getTotalCaloriesInRange(DateTime start, DateTime end) {
    return getWorkoutsInRange(start, end)
        .fold(0.0, (sum, w) => sum + w.caloriesBurned);
  }

  /// Get total volume lifted in a date range.
  static double getTotalVolumeInRange(DateTime start, DateTime end) {
    return getWorkoutsInRange(start, end)
        .fold(0.0, (sum, w) => sum + w.totalVolume);
  }

  /// Get unique exercise count for a date range.
  static int getUniqueExerciseCount(DateTime start, DateTime end) {
    return getWorkoutsInRange(start, end)
        .map((w) => w.exerciseId)
        .toSet()
        .length;
  }

  /// Get daily calorie data for charts (last N days).
  static List<Map<String, dynamic>> getDailyCalories(int days) {
    final now = DateTime.now();
    final data = <Map<String, dynamic>>[];
    for (int i = days - 1; i >= 0; i--) {
      final date = now.subtract(Duration(days: i));
      final dayWorkouts = getWorkoutsForDate(date);
      final totalCal = dayWorkouts.fold(0.0, (sum, w) => sum + w.caloriesBurned);
      data.add({
        'date': DateTime(date.year, date.month, date.day),
        'calories': totalCal,
        'workouts': dayWorkouts.length,
      });
    }
    return data;
  }

  /// Get exercise distribution for pie chart.
  static Map<String, double> getExerciseDistribution(DateTime start, DateTime end) {
    final workouts = getWorkoutsInRange(start, end);
    final dist = <String, double>{};
    for (final w in workouts) {
      dist[w.exerciseName] = (dist[w.exerciseName] ?? 0) + w.caloriesBurned;
    }
    return dist;
  }

  // ── Settings ──

  static double get bodyWeight =>
      (_settings.get(_bodyWeightKey) as double?) ?? 70.0;

  static Future<void> setBodyWeight(double weight) async {
    await _settings.put(_bodyWeightKey, weight);
  }

  static String get userName =>
      (_settings.get(_userNameKey) as String?) ?? 'User';

  static Future<void> setUserName(String name) async {
    await _settings.put(_userNameKey, name);
  }

  /// Clear all data.
  static Future<void> clearAll() async {
    await _workouts.clear();
  }
}
