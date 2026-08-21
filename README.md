# 🏋️ GymLab

**Gym Journal & Calorie Tracker** — Ứng dụng nhật ký tập gym tính calo theo chuẩn quốc tế.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131)
![Rust](https://img.shields.io/badge/Rust-1.70+-CE422B)
![License](https://img.shields.io/badge/license-MIT-blue)

## ✨ Tính năng

- 📝 **Ghi nhật ký tập** — Sets, reps, weight cho từng bài tập
- 🔥 **Tính calo** — MET values từ ACSM Compendium of Physical Activities 2024
- 📊 **Biểu đồ** — Bar chart calo theo ngày + Doughnut chart phân bổ bài tập
- 📅 **Lịch sử** — Xem lại lịch sử tập theo ngày/tuần/tháng
- 🎯 **26 bài tập** — Strength, Cardio, HIIT, Flexibility
- 💾 **Lưu trữ local** — JSON files, offline-first
- 🌐 **Cross-platform** — Windows, macOS, Linux (WebView renderer)

## 🔬 Nguồn calo chuẩn quốc tế

```
Calories = MET × bodyWeight(kg) × duration(hours)
```

| Nhóm | MET | Ví dụ |
|------|-----|-------|
| Nhẹ | < 3.0 | Yoga, Stretching |
| Trung bình | 3.0 - 5.9 | Walking, Bicep Curl |
| Nặng | 6.0 - 8.9 | Squat, Bench Press |
| Rất nặng | ≥ 9.0 | Burpees, Jump Rope |

## 🏗️ Kiến trúc

```
GymLab/
├── src/                        # Frontend (HTML/CSS/JS WebView)
│   ├── index.html              # SPA with 5 pages
│   ├── css/style.css           # Dark theme, responsive
│   └── js/
│       ├── api.js              # Tauri IPC + browser mock
│       └── app.js              # UI logic, Chart.js integration
├── src-tauri/                  # Backend (Rust)
│   ├── src/main.rs             # Tauri commands, calorie engine
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri config
│   └── capabilities/           # Security permissions
└── package.json                # npm scripts
```

## 🚀 Bắt đầu

### Yêu cầu
- Rust ≥ 1.70
- Node.js ≥ 18 (optional, for npm scripts)

### Dev

```bash
# Clone
git clone https://github.com/quangminh1212/GymLab.git
cd GymLab

# Install Tauri CLI
cargo install tauri-cli

# Run dev mode (opens native window + hot-reload)
cargo tauri dev
```

### Build

```bash
# Build release (creates .msi/.exe on Windows, .deb/.AppImage on Linux, .app on macOS)
cargo tauri build
```

## 🧪 Testing

Rust unit tests + browser dev mode for UI verification.

```bash
cd src-tauri && cargo test
```

## 📱 Supported Platforms

| Platform | Status | Renderer |
|----------|--------|----------|
| Windows  | ✅ Supported | WebView2 (Edge) |
| macOS    | ✅ Supported | WKWebView |
| Linux    | ✅ Supported | WebKitGTK |

## 📄 License

MIT License
