/// MET values based on the 2024 Compendium of Physical Activities
/// Reference: Ainsworth BE, et al. "2024 Compendium of Physical Activities"
/// Medicine & Science in Sports & Exercise, 2024.
/// MET = Metabolic Equivalent of Task (1 MET = 3.5 ml O2/kg/min)
class ExerciseDatabase {
  static const Map<String, Map<String, dynamic>> exercises = {
    // ── Strength Training ──
    'bench_press': {
      'name': 'Bench Press',
      'nameVi': 'Ép ngực',
      'met': 6.0,
      'category': 'strength',
      'muscleGroup': 'Ngực',
      'icon': '💪',
    },
    'squat': {
      'name': 'Squat',
      'nameVi': 'Squat',
      'met': 6.0,
      'category': 'strength',
      'muscleGroup': 'Chân',
      'icon': '🦵',
    },
    'deadlift': {
      'name': 'Deadlift',
      'nameVi': 'Cuốn đất',
      'met': 6.0,
      'category': 'strength',
      'muscleGroup': 'Lưng',
      'icon': '🏋️',
    },
    'overhead_press': {
      'name': 'Overhead Press',
      'nameVi': 'Đẩy tạ overhead',
      'met': 5.0,
      'category': 'strength',
      'muscleGroup': 'Vai',
      'icon': '💪',
    },
    'barbell_row': {
      'name': 'Barbell Row',
      'nameVi': 'Kéo tạ',
      'met': 5.0,
      'category': 'strength',
      'muscleGroup': 'Lưng',
      'icon': '🏋️',
    },
    'bicep_curl': {
      'name': 'Bicep Curl',
      'nameVi': 'Cuốn tay',
      'met': 3.5,
      'category': 'strength',
      'muscleGroup': 'Tay',
      'icon': '💪',
    },
    'tricep_dip': {
      'name': 'Tricep Dip',
      'nameVi': 'Chùn tay',
      'met': 5.0,
      'category': 'strength',
      'muscleGroup': 'Tay',
      'icon': '💪',
    },
    'lateral_raise': {
      'name': 'Lateral Raise',
      'nameVi': 'Nâng ngang',
      'met': 3.5,
      'category': 'strength',
      'muscleGroup': 'Vai',
      'icon': '💪',
    },
    'leg_press': {
      'name': 'Leg Press',
      'nameVi': 'Đạp chân',
      'met': 5.0,
      'category': 'strength',
      'muscleGroup': 'Chân',
      'icon': '🦵',
    },
    'calf_raise': {
      'name': 'Calf Raise',
      'nameVi': 'Nâng gót',
      'met': 3.5,
      'category': 'strength',
      'muscleGroup': 'Chân',
      'icon': '🦵',
    },

    // ── Cardio ──
    'running': {
      'name': 'Running',
      'nameVi': 'Chạy bộ',
      'met': 9.8,
      'category': 'cardio',
      'muscleGroup': 'Toàn thân',
      'icon': '🏃',
    },
    'cycling': {
      'name': 'Cycling',
      'nameVi': 'Đạp xe',
      'met': 7.5,
      'category': 'cardio',
      'muscleGroup': 'Chân',
      'icon': '🚴',
    },
    'swimming': {
      'name': 'Swimming',
      'nameVi': 'Bơi lội',
      'met': 8.0,
      'category': 'cardio',
      'muscleGroup': 'Toàn thân',
      'icon': '🏊',
    },
    'jumping_rope': {
      'name': 'Jump Rope',
      'nameVi': 'Nhảy dây',
      'met': 12.3,
      'category': 'cardio',
      'muscleGroup': 'Toàn thân',
      'icon': '🤸',
    },
    'rowing_machine': {
      'name': 'Rowing Machine',
      'nameVi': 'Máy chèo thuyền',
      'met': 7.0,
      'category': 'cardio',
      'muscleGroup': 'Toàn thân',
      'icon': '🚣',
    },
    'stair_climbing': {
      'name': 'Stair Climbing',
      'nameVi': 'Leo cầu thang',
      'met': 9.0,
      'category': 'cardio',
      'muscleGroup': 'Chân',
      'icon': '🏔️',
    },
    'elliptical': {
      'name': 'Elliptical',
      'nameVi': 'Máy elip',
      'met': 5.0,
      'category': 'cardio',
      'muscleGroup': 'Toàn thân',
      'icon': '🏋️',
    },
    'walking': {
      'name': 'Walking',
      'nameVi': 'Đi bộ',
      'met': 3.5,
      'category': 'cardio',
      'muscleGroup': 'Chân',
      'icon': '🚶',
    },

    // ── HIIT / CrossFit ──
    'burpees': {
      'name': 'Burpees',
      'nameVi': 'Burpees',
      'met': 12.5,
      'category': 'hiit',
      'muscleGroup': 'Toàn thân',
      'icon': '🤸',
    },
    'mountain_climbers': {
      'name': 'Mountain Climbers',
      'nameVi': 'Leo núi',
      'met': 8.0,
      'category': 'hiit',
      'muscleGroup': 'Toàn thân',
      'icon': '🏔️',
    },
    'box_jumps': {
      'name': 'Box Jumps',
      'nameVi': 'Nhảy hộp',
      'met': 10.0,
      'category': 'hiit',
      'muscleGroup': 'Chân',
      'icon': '📦',
    },

    // ── Flexibility / Yoga ──
    'yoga': {
      'name': 'Yoga',
      'nameVi': 'Yoga',
      'met': 3.0,
      'category': 'flexibility',
      'muscleGroup': 'Toàn thân',
      'icon': '🧘',
    },
    'stretching': {
      'name': 'Stretching',
      'nameVi': 'Giãn cơ',
      'met': 2.5,
      'category': 'flexibility',
      'muscleGroup': 'Toàn thân',
      'icon': '🧘',
    },

    // ── Other ──
    'pull_up': {
      'name': 'Pull Up',
      'nameVi': 'Kéo xô',
      'met': 8.0,
      'category': 'strength',
      'muscleGroup': 'Lưng',
      'icon': '💪',
    },
    'push_up': {
      'name': 'Push Up',
      'nameVi': 'Hít đất',
      'met': 8.0,
      'category': 'strength',
      'muscleGroup': 'Ngực',
      'icon': '💪',
    },
    'plank': {
      'name': 'Plank',
      'nameVi': 'Plank',
      'met': 4.0,
      'category': 'strength',
      'muscleGroup': 'Core',
      'icon': '💪',
    },
  };

  static List<Map<String, dynamic>> get allExercises =>
      exercises.entries.map((e) => {'id': e.key, ...e.value}).toList();

  static List<Map<String, dynamic>> getByCategory(String category) {
    return allExercises
        .where((e) => e['category'] == category)
        .toList();
  }

  static List<String> get categories => ['strength', 'cardio', 'hiit', 'flexibility'];

  static Map<String, dynamic>? getById(String id) {
    final data = exercises[id];
    if (data == null) return null;
    return {'id': id, ...data};
  }
}
