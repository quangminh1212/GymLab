# 🏋️ GymLab

**Gym Journal & Calorie Tracker** — Ứng dụng nhật ký tập gym tính calo theo chuẩn quốc tế.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131)
![Rust](https://img.shields.io/badge/Rust-1.70+-CE422B)
![License](https://img.shields.io/badge/license-MIT-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

## ✨ Tính năng

- 📝 **Ghi nhật ký tập** — Sets, reps, weight cho từng bài tập
- 🔥 **Tính calo** — MET values từ ACSM Compendium of Physical Activities 2024
- 📊 **Biểu đồ** — Bar chart calo theo ngày + Doughnut chart phân bổ bài tập
- 📅 **Lịch sử** — Xem lại lịch sử tập theo ngày/tuần/tháng với bộ lọc
- 🎯 **26 bài tập** — Strength, Cardio, HIIT, Flexibility
- 💾 **Lưu trữ local** — JSON files, offline-first
- 🌐 **Cross-platform** — Windows, macOS, Linux (WebView renderer)
- 📱 **Responsive** — Desktop, tablet, mobile với hamburger menu

## 🔬 Nguồn calo chuẩn quốc tế

```
Calories = MET × bodyWeight(kg) × duration(hours)
```

**MET values** dựa trên:
- **ACSM Compendium of Physical Activities (2024)** — Ainsworth BE, et al.
- **WHO Physical Activity Guidelines**
- **American Heart Association (AHA) Recommendations**

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
│   ├── index.html              # SPA với 5 trang, responsive
│   ├── css/style.css           # Dark theme, CSS variables, media queries
│   └── js/
│       ├── api.js              # Tauri IPC + browser mock layer
│       └── app.js              # UI logic, Chart.js, mobile nav
├── src-tauri/                  # Backend (Rust)
│   ├── src/main.rs             # Tauri commands, calorie engine
│   ├── Cargo.toml              # Rust dependencies
│   ├── tauri.conf.json         # Tauri v2 config
│   └── capabilities/           # Security permissions (Tauri v2)
├── dev-server.py               # Hot-reload dev server
├── run.bat                     # One-click Windows launcher
└── package.json                # npm scripts (tauri CLI)
```

## 🚀 Bắt đầu

### Yêu cầu

| Tool | Version | Kiểm tra |
|------|---------|----------|
| Rust | ≥ 1.70 | `rustc --version` |
| Node.js | ≥ 18 (optional) | `node --version` |

### Cài đặt & Chạy

```bash
# Clone
git clone https://github.com/quangminh1212/GymLab.git
cd GymLab

# ── Dev mode (hot-reload) ──
cargo install tauri-cli
cargo tauri dev

# ── Hoặc dùng dev server (browser preview) ──
python dev-server.py
# Mở http://localhost:8080

# ── Windows ──
run.bat
```

### Build Release

```bash
cargo tauri build
```

Tạo file cài đặt:
- Windows: `.msi` / `.exe`
- Linux: `.deb` / `.AppImage`
- macOS: `.app`

## 🧪 Testing

```bash
# Rust unit tests
cd src-tauri && cargo test

# Clippy (lint)
cargo clippy

# Format
cargo fmt
```

### Code Quality

- ✅ `cargo clippy` — 0 warnings
- ✅ `cargo fmt` — formatted
- ✅ `.editorconfig` — consistent style across editors
- ✅ Responsive CSS — tested on desktop, tablet, mobile

## 📱 Responsive Design

| Màn hình | Sidebar | Layout |
|----------|---------|--------|
| Desktop (> 900px) | Full sidebar + labels | 4-col stats grid |
| Tablet (600-900px) | Icons only (60px) | 2-col stats grid |
| Mobile (< 600px) | Hamburger menu, slide-out | 2-col stacked |

## 📁 Supported Platforms

| Platform | Renderer | Status |
|----------|----------|--------|
| Windows | WebView2 (Edge) | ✅ |
| macOS | WKWebView | ✅ |
| Linux | WebKitGTK | ✅ |

## 📄 License

MIT License — see [LICENSE](LICENSE).

## 🙏 Credits

- [Tauri](https://tauri.app) — Cross-platform app framework
- [ACSM Compendium](https://sites.google.com/site/compendiumofphysicalactivities/) — MET values
- [Chart.js](https://chartjs.org) — Interactive charts
- [Rust](https://rust-lang.org) — Systems programming
