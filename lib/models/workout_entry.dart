import 'package:hive/hive.dart';

part 'workout_entry.g.dart';

@HiveType(typeId: 0)
class WorkoutEntry extends HiveObject {
  @HiveField(0)
  late String id;

  @HiveField(1)
  late String exerciseId;

  @HiveField(2)
  late String exerciseName;

  @HiveField(3)
  late int sets;

  @HiveField(4)
  late int reps;

  @HiveField(5)
  late double weightKg;

  @HiveField(6)
  late double durationMinutes;

  @HiveField(7)
  late DateTime date;

  @HiveField(8)
  late double caloriesBurned;

  @HiveField(9)
  late double metValue;

  @HiveField(10)
  String? notes;

  WorkoutEntry({
    required this.id,
    required this.exerciseId,
    required this.exerciseName,
    required this.sets,
    required this.reps,
    required this.weightKg,
    required this.durationMinutes,
    required this.date,
    required this.caloriesBurned,
    required this.metValue,
    this.notes,
  });

  /// Calculate total volume (sets × reps × weight)
  double get totalVolume => sets * reps * weightKg;

  /// Approximate duration in minutes based on sets × reps
  /// Assumes ~3 seconds per rep + 60s rest between sets
  double get estimatedDurationMinutes {
    if (durationMinutes > 0) return durationMinutes;
    return (sets * reps * 3.0 + (sets - 1) * 60.0) / 60.0;
  }
}
