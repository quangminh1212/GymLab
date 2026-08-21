# 🏋️ GymLab

**Gym Journal & Calorie Tracker** — Ứng dụng nhật ký tập gym tính calo theo chuẩn quốc tế.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20iOS%20%7C%20Android%20%7C%20Web-brightgreen)
![Flutter](https://img.shields.io/badge/Flutter-3.2+-02569B)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Tính năng

- 📝 **Ghi nhật ký tập** — Ghi sets, reps, weight cho từng bài tập
- 🔥 **Tính calo** — Sử dụng MET values từ ACSM Compendium of Physical Activities 2024
- 📊 **Biểu đồ** — Biểu đồ cột calo theo ngày, pie chart phân bổ bài tập
- 📅 **Lịch sử** — Xem lại lịch sử tập theo ngày/tuần/tháng
- 🎯 **25+ bài tập** — Strength, Cardio, HIIT, Flexibility
- 💾 **Lưu trữ local** — Hive database, không cần internet
- 🌐 **Cross-platform** — Windows, macOS, Linux, iOS, Android, Web

## 🔬 Nguồn calo chuẩn quốc tế

Công thức tính calo:

```
Calories = MET × bodyWeight(kg) × duration(hours)
```

**MET values** dựa trên:
- **ACSM Compendium of Physical Activities (2024)** — Ainsworth BE, et al.
- **WHO Physical Activity Guidelines**
- **American Heart Association (AHA) Recommendations**

Mức MET:
| Nhóm | MET | Ví dụ |
|------|-----|-------|
| Nhẹ | < 3.0 | Yoga, Stretching |
| Trung bình | 3.0 - 5.9 | Walking, Bicep Curl |
| Nặng | 6.0 - 8.9 | Squat, Bench Press, Running |
| Rất nặng | ≥ 9.0 | Burpees, Jump Rope |

## 🏗️ Kiến trúc

```
lib/
├── main.dart                    # Entry point
├── constants/
│   └── exercise_database.dart   # 25+ bài tập với MET values
├── models/
│   ├── workout_entry.dart       # Model buổi tập
│   └── workout_entry.g.dart     # Hive type adapter
├── screens/
│   ├── home_screen.dart         # Trang chủ + thống kê nhanh
│   ├── add_workout_screen.dart  # Thêm buổi tập
│   ├── history_screen.dart      # Lịch sử tập
│   └── stats_screen.dart        # Biểu đồ & phân tích
├── services/
│   ├── calorie_service.dart     # Tính calories (ACSM formula)
│   └── storage_service.dart     # Local database (Hive)
└── widgets/                     # Reusable widgets

test/
├── calorie_service_test.dart    # Unit tests cho calorie calculation
└── widget_test.dart             # Widget tests
```

## 🚀 Bắt đầu

### Yêu cầu
- Flutter SDK ≥ 3.2.0
- Dart ≥ 3.2.0

### Cài đặt

```bash
# Clone repo
git clone https://github.com/quangminh1212/GymLab.git
cd GymLab

# Cài dependencies
flutter pub get

# Chạy trên Web
flutter run -d chrome

# Chạy trên Desktop
flutter run -d windows   # hoặc macos / linux

# Chạy trên Mobile
flutter run -d android   # hoặc ios
```

### Build

```bash
# Web
flutter build web

# Windows
flutter build windows

# macOS
flutter build macos

# Linux
flutter build linux

# Android APK
flutter build apk

# iOS
flutter build ios
```

## 🧪 Testing

```bash
# Chạy tất cả tests
flutter test

# Chạy với coverage
flutter test --coverage

# Xem coverage report
genhtml coverage/lcov.info -o coverage/html
open coverage/html/index.html
```

### Tiêu chuẩn test quốc tế
- ✅ Unit tests: Tính calo chính xác theo MET formula
- ✅ Widget tests: UI rendering đúng
- ✅ Integration tests: User flow hoàn chỉnh
- ✅ TDD methodology
- ✅ > 80% code coverage target

## 📱 Supported Platforms

| Platform | Status |
|----------|--------|
| Windows  | ✅ Supported |
| macOS    | ✅ Supported |
| Linux    | ✅ Supported |
| iOS      | ✅ Supported |
| Android  | ✅ Supported |
| Web      | ✅ Supported |

## 📄 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Credits

- [ACSM Compendium of Physical Activities](https://sites.google.com/site/compendiumofphysicalactivities/)
- [Flutter](https://flutter.dev)
- [fl_chart](https://pub.dev/packages/fl_chart)
- [Hive](https://pub.dev/packages/hive)
