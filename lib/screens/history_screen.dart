import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/workout_entry.dart';
import '../services/storage_service.dart';

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<WorkoutEntry> _workouts = [];
  String _filterCategory = 'all';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    setState(() {
      _workouts = StorageService.getAllWorkouts();
    });
  }

  List<WorkoutEntry> get _filteredWorkouts {
    if (_filterCategory == 'all') return _workouts;
    return _workouts.where((w) {
      final exercise = ExerciseDatabase.getById(w.exerciseId);
      return exercise?['category'] == _filterCategory;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final grouped = _groupByDate(_filteredWorkouts);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Lịch sử'),
      ),
      body: Column(
        children: [
          // Category filter
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _FilterChip('Tất cả', 'all'),
                _FilterChip('Sức mạnh', 'strength'),
                _FilterChip('Cardio', 'cardio'),
                _FilterChip('HIIT', 'hiit'),
                _FilterChip('Linh hoạt', 'flexibility'),
              ],
            ),
          ),
          // Workout list
          Expanded(
            child: grouped.isEmpty
                ? const Center(child: Text('Chưa có dữ liệu'))
                : ListView.builder(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    itemCount: grouped.length,
                    itemBuilder: (context, index) {
                      final date = grouped.keys.elementAt(index);
                      final workouts = grouped[date]!;
                      final dayCal = workouts.fold<double>(
                          0, (sum, w) => sum + w.caloriesBurned);

                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 8),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  DateFormat('dd/MM/yyyy - EEEE', 'vi').format(date),
                                  style: Theme.of(context)
                                      .textTheme
                                      .titleSmall
                                      ?.copyWith(fontWeight: FontWeight.bold),
                                ),
                                Text(
                                  '${dayCal.toStringAsFixed(0)} kcal',
                                  style: Theme.of(context)
                                      .textTheme
                                      .bodySmall
                                      ?.copyWith(
                                        color: Theme.of(context)
                                            .colorScheme
                                            .primary,
                                        fontWeight: FontWeight.bold,
                                      ),
                                ),
                              ],
                            ),
                          ),
                          ...workouts.map((w) => Card(
                                child: ListTile(
                                  leading: Text(
                                    ExerciseDatabase.getById(w.exerciseId)?['icon'] ?? '🏋️',
                                    style: const TextStyle(fontSize: 24),
                                  ),
                                  title: Text(w.exerciseName),
                                  subtitle: Text(
                                    '${w.sets}×${w.reps} × ${w.weightKg.toStringAsFixed(0)}kg '
                                    '| ${w.caloriesBurned.toStringAsFixed(1)} kcal',
                                  ),
                                  trailing: IconButton(
                                    icon: const Icon(Icons.delete_outline, size: 20),
                                    onPressed: () async {
                                      final confirm = await showDialog<bool>(
                                        context: context,
                                        builder: (_) => AlertDialog(
                                          title: const Text('Xóa?'),
                                          actions: [
                                            TextButton(
                                              onPressed: () => Navigator.pop(context, false),
                                              child: const Text('Hủy'),
                                            ),
                                            TextButton(
                                              onPressed: () => Navigator.pop(context, true),
                                              child: const Text('Xóa'),
                                            ),
                                          ],
                                        ),
                                      );
                                      if (confirm == true) {
                                        await StorageService.deleteWorkout(w.id);
                                        _loadData();
                                      }
                                    },
                                  ),
                                ),
                              )),
                          const SizedBox(height: 8),
                        ],
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  Map<DateTime, List<WorkoutEntry>> _groupByDate(List<WorkoutEntry> workouts) {
    final grouped = <DateTime, List<WorkoutEntry>>{};
    for (final w in workouts) {
      final date = DateTime(w.date.year, w.date.month, w.date.day);
      grouped.putIfAbsent(date, () => []).add(w);
    }
    return grouped;
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final String value;
  const _FilterChip(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: FilterChip(
        label: Text(label),
        selected: false, // handled by parent
        onSelected: (_) {},
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}
