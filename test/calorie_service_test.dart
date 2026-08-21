import 'package:flutter_test/flutter_test.dart';
import 'package:gym_lab/constants/exercise_database.dart';
import 'package:gym_lab/services/calorie_service.dart';

void main() {
  group('ExerciseDatabase', () {
    test('has all required exercises', () {
      expect(ExerciseDatabase.exercises.isNotEmpty, true);
      expect(ExerciseDatabase.exercises.length >= 20, true);
    });

    test('each exercise has required fields', () {
      for (final entry in ExerciseDatabase.exercises.entries) {
        expect(entry.value['name'], isNotNull);
        expect(entry.value['met'], isA<double>());
        expect(entry.value['category'], isA<String>());
        expect(entry.value['muscleGroup'], isA<String>());
      }
    });

    test('getById returns correct exercise', () {
      final exercise = ExerciseDatabase.getById('bench_press');
      expect(exercise, isNotNull);
      expect(exercise!['name'], 'Bench Press');
      expect(exercise['met'], 6.0);
    });

    test('getById returns null for invalid id', () {
      expect(ExerciseDatabase.getById('nonexistent'), isNull);
    });

    test('getByCategory filters correctly', () {
      final strengthExercises = ExerciseDatabase.getByCategory('strength');
      expect(strengthExercises.isNotEmpty, true);
      for (final e in strengthExercises) {
        expect(e['category'], 'strength');
      }
    });

    test('allExercises returns list with id field', () {
      final all = ExerciseDatabase.allExercises;
      expect(all.isNotEmpty, true);
      expect(all.every((e) => e.containsKey('id')), true);
    });
  });

  group('CalorieService', () {
    test('calculates calories with MET formula', () {
      // MET 6.0 × 70kg × 1hr = 420 kcal
      final calories = CalorieService.calculateCalories(
        exerciseId: 'bench_press',
        bodyWeight: 70,
        sets: 3,
        reps: 10,
        durationMinutes: 60,
      );
      expect(calories, closeTo(420.0, 0.1));
    });

    test('calculates calories with auto duration', () {
      // 3 sets × 10 reps × 3 sec + 2 × 60 sec rest = 210 sec = 3.5 min
      final calories = CalorieService.calculateCalories(
        exerciseId: 'running',
        bodyWeight: 70,
        sets: 1,
        reps: 1,
        durationMinutes: 0,
      );
      expect(calories, greaterThan(0));
    });

    test('returns 0 for invalid exercise', () {
      final calories = CalorieService.calculateCalories(
        exerciseId: 'nonexistent',
        bodyWeight: 70,
        sets: 3,
        reps: 10,
      );
      expect(calories, 0.0);
    });

    test('uses default weight when bodyWeight is 0', () {
      final calories = CalorieService.calculateCalories(
        exerciseId: 'bench_press',
        bodyWeight: 0,
        sets: 3,
        reps: 10,
        durationMinutes: 60,
      );
      // MET 6.0 × 70kg(default) × 1hr = 420 kcal
      expect(calories, closeTo(420.0, 0.1));
    });

    test('strength calorie formula is consistent', () {
      // 3 sets × 10 reps × 50kg × 0.05 = 75 kcal
      final calories = CalorieService.calculateStrengthCalories(
        sets: 3,
        reps: 10,
        weightKg: 50,
      );
      expect(calories, 75.0);
    });

    test('getMetCategory returns correct labels', () {
      expect(CalorieService.getMetCategory(2.0), 'Nhẹ');
      expect(CalorieService.getMetCategory(5.0), 'Trung bình');
      expect(CalorieService.getMetCategory(8.0), 'Nặng');
      expect(CalorieService.getMetCategory(12.0), 'Rất nặng');
    });

    test('searchExercises finds by Vietnamese name', () {
      final results = CalorieService.searchExercises('chạy');
      expect(results.isNotEmpty, true);
      expect(results.any((e) => e['id'] == 'running'), true);
    });

    test('searchExercises is case-insensitive', () {
      final results = CalorieService.searchExercises('BENCH');
      expect(results.isNotEmpty, true);
    });

    test('calculateDailyTotal sums correctly', () {
      final workouts = [
        {'caloriesBurned': 100.0},
        {'caloriesBurned': 200.0},
        {'caloriesBurned': 150.0},
      ];
      final total = CalorieService.calculateDailyTotal(workouts);
      expect(total, 450.0);
    });

    test('calculateDailyTotal handles empty list', () {
      final total = CalorieService.calculateDailyTotal([]);
      expect(total, 0.0);
    });

    test('recommended calories is reasonable', () {
      final calories = CalorieService.getRecommendedCalories(
        bodyWeight: 70,
        activityLevel: 'active',
      );
      expect(calories, greaterThan(1500));
      expect(calories, lessThan(4000));
    });
  });
}
