import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/workout_entry.dart';
import '../services/calorie_service.dart';
import '../services/storage_service.dart';

class AddWorkoutScreen extends StatefulWidget {
  const AddWorkoutScreen({super.key});

  @override
  State<AddWorkoutScreen> createState() => _AddWorkoutScreenState();
}

class _AddWorkoutScreenState extends State<AddWorkoutScreen> {
  String _selectedExerciseId = 'bench_press';
  final _setsController = TextEditingController(text: '3');
  final _repsController = TextEditingController(text: '10');
  final _weightController = TextEditingController(text: '50');
  final _durationController = TextEditingController(text: '30');
  final _notesController = TextEditingController();
  DateTime _selectedDate = DateTime.now();

  double _previewCalories = 0;
  String _selectedCategory = 'strength';

  @override
  void initState() {
    super.initState();
    _calculatePreview();
  }

  void _calculatePreview() {
    final sets = int.tryParse(_setsController.text) ?? 0;
    final reps = int.tryParse(_repsController.text) ?? 0;
    final duration = double.tryParse(_durationController.text) ?? 0;

    setState(() {
      _previewCalories = CalorieService.calculateCalories(
        exerciseId: _selectedExerciseId,
        bodyWeight: StorageService.bodyWeight,
        sets: sets,
        reps: reps,
        durationMinutes: duration,
      );
    });
  }

  Future<void> _saveWorkout() async {
    final sets = int.tryParse(_setsController.text) ?? 0;
    final reps = int.tryParse(_repsController.text) ?? 0;
    final weight = double.tryParse(_weightController.text) ?? 0;
    final duration = double.tryParse(_durationController.text) ?? 0;

    if (sets <= 0 || reps <= 0 || weight < 0 || duration < 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Vui lòng nhập đúng số liệu')),
      );
      return;
    }

    final exercise = CalorieService.getAllExercises()
        .firstWhere((e) => e['id'] == _selectedExerciseId);

    final calories = CalorieService.calculateCalories(
      exerciseId: _selectedExerciseId,
      bodyWeight: StorageService.bodyWeight,
      sets: sets,
      reps: reps,
      durationMinutes: duration,
    );

    final entry = WorkoutEntry(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      exerciseId: _selectedExerciseId,
      exerciseName: exercise['nameVi'] as String,
      sets: sets,
      reps: reps,
      weightKg: weight,
      durationMinutes: duration,
      date: _selectedDate,
      caloriesBurned: calories,
      metValue: exercise['met'] as double,
      notes: _notesController.text.isEmpty ? null : _notesController.text,
    );

    await StorageService.addWorkout(entry);
    if (mounted) {
      Navigator.pop(context, true);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  @override
  void dispose() {
    _setsController.dispose();
    _repsController.dispose();
    _weightController.dispose();
    _durationController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final exercises = CalorieService.getAllExercises();
    final categories = <String, String>{
      'strength': 'Sức mạnh',
      'cardio': 'Cardio',
      'hiit': 'HIIT',
      'flexibility': 'Linh hoạt',
    };

    return Scaffold(
      appBar: AppBar(title: const Text('Ghi nhận buổi tập')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Category selector
            Text('Nhóm bài tập', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: categories.entries.map((entry) {
                final selected = _selectedCategory == entry.key;
                return ChoiceChip(
                  label: Text(entry.value),
                  selected: selected,
                  onSelected: (_) => setState(() {
                    _selectedCategory = entry.key;
                    final first = exercises.firstWhere(
                      (e) => e['category'] == entry.key,
                    );
                    _selectedExerciseId = first['id'] as String;
                    _calculatePreview();
                  }),
                );
              }).toList(),
            ),
            const SizedBox(height: 16),

            // Exercise selector
            Text('Bài tập', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            ...exercises.where((e) => e['category'] == _selectedCategory).map((e) {
              final selected = _selectedExerciseId == e['id'];
              return RadioListTile<String>(
                title: Row(
                  children: [
                    Text(e['icon'] as String),
                    const SizedBox(width: 8),
                    Expanded(child: Text(e['nameVi'] as String)),
                  ],
                ),
                value: e['id'] as String,
                groupValue: _selectedExerciseId,
                onChanged: (v) {
                  setState(() {
                    _selectedExerciseId = v!;
                    _calculatePreview();
                  });
                },
              );
            }).toList(),
            const SizedBox(height: 16),

            // Sets / Reps / Weight
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _setsController,
                    decoration: const InputDecoration(labelText: 'Sets'),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => _calculatePreview(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _repsController,
                    decoration: const InputDecoration(labelText: 'Reps'),
                    keyboardType: TextInputType.number,
                    onChanged: (_) => _calculatePreview(),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _weightController,
                    decoration: const InputDecoration(labelText: 'kg'),
                    keyboardType: TextInputType.number,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _durationController,
              decoration: const InputDecoration(
                labelText: 'Thời gian (phút)',
                helperText: 'Thời gian tập luyện thực tế',
              ),
              keyboardType: TextInputType.number,
              onChanged: (_) => _calculatePreview(),
            ),
            const SizedBox(height: 16),
            ListTile(
              title: const Text('Ngày'),
              subtitle: Text(DateFormat('dd/MM/yyyy').format(_selectedDate)),
              trailing: const Icon(Icons.calendar_today),
              onTap: _pickDate,
            ),
            TextField(
              controller: _notesController,
              decoration: const InputDecoration(labelText: 'Ghi chú (tuỳ chọn)'),
              maxLines: 2,
            ),
            const SizedBox(height: 24),

            // Preview card
            Card(
              color: Theme.of(context).colorScheme.primaryContainer,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    Text(
                      'Ước tính calo',
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${_previewCalories.toStringAsFixed(1)} kcal',
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                    ),
                    Text(
                      'Cân nặng: ${StorageService.bodyWeight.toStringAsFixed(0)}kg',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saveWorkout,
                icon: const Icon(Icons.save),
                label: const Text('Lưu buổi tập'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
