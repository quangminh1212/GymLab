import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../constants/exercise_database.dart';
import '../models/workout_entry.dart';
import '../services/storage_service.dart';
import 'add_workout_screen.dart';
import 'stats_screen.dart';
import 'history_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  List<WorkoutEntry> _todayWorkouts = [];
  double _todayCalories = 0;
  double _weekCalories = 0;
  int _weekWorkouts = 0;
  int _monthWorkouts = 0;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  void _loadData() {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final weekStart = today.subtract(Duration(days: now.weekday - 1));
    final monthStart = DateTime(now.year, now.month, 1);

    setState(() {
      _todayWorkouts = StorageService.getWorkoutsForDate(now);
      _todayCalories = _todayWorkouts.fold(0.0, (sum, w) => sum + w.caloriesBurned);
      _weekCalories = StorageService.getTotalCaloriesInRange(weekStart, now);
      _weekWorkouts = StorageService.getWorkoutsInRange(weekStart, now).length;
      _monthWorkouts = StorageService.getWorkoutsInRange(monthStart, now).length;
    });
  }

  void _navigateToAdd() async {
    final result = await Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => const AddWorkoutScreen()),
    );
    if (result == true) _loadData();
  }

  void _deleteWorkout(WorkoutEntry entry) async {
    await StorageService.deleteWorkout(entry.id);
    _loadData();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GymLab'),
        actions: [
          IconButton(
            icon: const Icon(Icons.bar_chart),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const StatsScreen()),
            ),
            tooltip: 'Thống kê',
          ),
          IconButton(
            icon: const Icon(Icons.history),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const HistoryScreen()),
            ),
            tooltip: 'Lịch sử',
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _loadData(),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Greeting
              Text(
                'Xin chào, ${StorageService.userName}!',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              Text(
                DateFormat('EEEE, dd/MM/yyyy', 'vi').format(DateTime.now()),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.outline,
                    ),
              ),
              const SizedBox(height: 20),

              // Stats cards
              Row(
                children: [
                  Expanded(
                    child: _StatCard(
                      title: 'Hôm nay',
                      value: '${_todayCalories.toStringAsFixed(0)} kcal',
                      icon: Icons.local_fire_department,
                      color: Colors.orange,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(
                      title: 'Tuần này',
                      value: '${_weekCalories.toStringAsFixed(0)} kcal',
                      icon: Icons.calendar_week,
                      color: Colors.blue,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: _StatCard(
                      title: 'Buổi tập tuần',
                      value: '$_weekWorkouts',
                      icon: Icons.fitness_center,
                      color: Colors.green,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _StatCard(
                      title: 'Buổi tập tháng',
                      value: '$_monthWorkouts',
                      icon: Icons.event_repeat,
                      color: Colors.purple,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Today's workouts
              Text(
                'Buổi tập hôm nay',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              if (_todayWorkouts.isEmpty)
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Column(
                        children: [
                          Icon(Icons.fitness_center,
                              size: 48,
                              color: Theme.of(context).colorScheme.outline),
                          const SizedBox(height: 8),
                          const Text('Chưa có buổi tập nào hôm nay'),
                        ],
                      ),
                    ),
                  ),
                )
              else
                ..._todayWorkouts.map((w) => Card(
                      child: Dismissible(
                        key: Key(w.id),
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 16),
                          color: Colors.red,
                          child: const Icon(Icons.delete, color: Colors.white),
                        ),
                        confirmDismiss: (_) async {
                          return await showDialog<bool>(
                            context: context,
                            builder: (_) => AlertDialog(
                              title: const Text('Xóa buổi tập?'),
                              content: const Text('Bạn chắc chắn muốn xóa?'),
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
                        },
                        onDismissed: (_) => _deleteWorkout(w),
                        child: ListTile(
                          leading: Text(
                            ExerciseDatabase.getById(w.exerciseId)?['icon'] ?? '🏋️',
                            style: const TextStyle(fontSize: 28),
                          ),
                          title: Text(w.exerciseName),
                          subtitle: Text(
                            '${w.sets}×${w.reps} × ${w.weightKg.toStringAsFixed(0)}kg '
                            '| ${w.caloriesBurned.toStringAsFixed(1)} kcal',
                          ),
                          trailing: Text(
                            '${w.durationMinutes.toStringAsFixed(0)} phút',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ),
                      ),
                    )),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _navigateToAdd,
        icon: const Icon(Icons.add),
        label: const Text('Thêm buổi tập'),
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 8),
            Text(
              value,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
            ),
            Text(
              title,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.outline,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
