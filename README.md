# 🏋️ GymLab

**Gym Journal & Calorie Tracker** — Ứng dụng nhật ký tập gym tính calo theo chuẩn quốc tế.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen)
![Tauri](https://img.shields.io/badge/Tauri-2.x-FFC131)
![Rust](https://img.shields.io/badge/Rust-1.70+-CE422B)
![License](https://img.shields.io/badge/license-MIT-blue)
![Build](https://img.shields.io/badge/build-passing-brightgreen)

## ✨ Tính năng

- 📝 **Ghi nhật ký tập** — Sets, reps, weight cho từng bài tập
- 🎥 **Phân tích video local** — Pose Landmarker chạy trên thiết bị, nhận diện bài tập, đếm reps/sets và ước tính kcal
- 🔎 **Đọc tải từ video** — OCR local đọc nhãn `kg`/`lb` qua nhiều frame và trả confidence; cho phép xác nhận thủ công
- 🧾 **Báo cáo audit JSON** — Xuất kết quả, provenance model, confidence và giới hạn đo lường để lưu kèm hồ sơ đánh giá
- 🔥 **Tính calo** — MET values từ ACSM Compendium of Physical Activities 2024
- 📊 **Biểu đồ** — Bar chart calo theo ngày + Doughnut chart phân bổ bài tập
- 📅 **Lịch sử** — Xem lại lịch sử tập theo ngày/tuần/tháng với bộ lọc
- 🎯 **26 bài tập trong nhật ký** — Strength, Cardio, HIIT, Flexibility; video inference hiện công khai scope tự động `13/26` (5 profile baseline và 8 candidate có quality gate), các bài chưa có đánh giá held-out yêu cầu xác nhận thủ công
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
│       ├── app.js              # UI logic, Chart.js, mobile nav
│       └── video-analysis.js   # Pose inference, rep counter, confidence/provenance
│   ├── models/pose_landmarker_lite.task # Model pose local, không upload video
│   ├── models/tessdata/eng.traineddata.gz # OCR model local cho nhãn kg/lb
│   └── vendor/mediapipe/       # MediaPipe Tasks Vision runtime + WASM
│       └── tesseract/          # Tesseract.js runtime + core/WASM
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

# Video-analysis core tests (rep counting + OCR weight parsing)
cd ..
node tests/video-analysis-core.test.mjs

# Browser/WebView-style end-to-end flow (requires Playwright + Chromium)
python -m playwright install chromium
python tests/video-analysis-e2e.py

# OCR positive path (synthetic visible "60 kg" label)
python tests/generate_weight_fixture.py --output tests/fixtures/pose_squats_60kg.webm
python tests/video-analysis-e2e.py --fixture tests/fixtures/pose_squats_60kg.webm --auto-weight

# Optional pose benchmark (requires Python MediaPipe in the test environment)
$env:PYTHONPATH = "<mediapipe-target>"
python tests/benchmark_pose.py

# Reproducible labeled-dataset release gate
python tests/evaluate_benchmark.py data/test.json --train-manifest data/train.json --strict-disjoint

# Exact packaged Windows flow (after npm run build)
python tests/packaged-video-smoke.py
```

### Video analysis boundaries

GymLab xử lý video trực tiếp trong WebView bằng MediaPipe Pose Landmarker. Danh mục nhật ký có 26 bài tập; video classification hiện công khai scope tự động `13/26`: 5 profile baseline cho squat, push-up, bicep curl, overhead press và deadlift, cùng 8 candidate profile cho barbell row, pull-up, tricep dip, lateral raise, calf raise, plank, mountain climbers và burpees. Candidate profile chưa có đánh giá held-out trên người thật nên bắt buộc người dùng review trước khi lưu. Các bài còn lại vẫn có trong catalog để người dùng xác nhận thủ công, không bị trình bày như đã nhận diện tự động. Kết quả và journal đều lưu scope này trong `analysis_scope` để tránh hiểu nhầm phạm vi sản phẩm.

Khối lượng tạ được đọc tự động khi OCR thấy nhãn `kg`/`lb` rõ ràng và lặp lại trên nhiều frame. OCR không thể đảm bảo nhãn đó là tải của máy hay cân nặng người nếu bố cục video mơ hồ, nên giao diện luôn hiển thị nguồn/confidence và yêu cầu xác nhận nhãn OCR thuộc bài tập trước khi lưu. Nếu không có nhãn, trạng thái là `Chưa xác định` và journal lưu `weight_known=false`, không biến dữ liệu thiếu thành `0 kg`. Calories là ước tính theo `MET × body weight × active duration`, không phải phép đo sinh lý y khoa; audit luôn ghi rõ cân nặng do người dùng nhập hay mặc định 70 kg.

Kết quả luôn có bước review trước khi lưu: người dùng có thể xác nhận lại bài tập trong toàn bộ catalog 26 bài và chỉnh reps. Nhật ký lưu riêng nguồn `AI` hay `Người dùng xác nhận`, cùng bài tập AI ban đầu để truy vết.

Mỗi nhật ký phân tích video cũng lưu phiên bản thuật toán, SHA-256 của file
video đầu vào và model pose/OCR, số frame đã lấy mẫu/có pose cùng quyết định
quality gate để có thể audit và tái lập kết quả. Báo cáo JSON audit có thêm
trace đặc trưng pose chuẩn hóa (`gymlab.pose-feature-trace.v1`), không chứa
frame gốc hay tọa độ landmark thô. Phân tích dưới 50% pose
coverage hoặc không đo được chuyển động sẽ abstain thay vì tự bịa thời gian,
reps hay calories. Nhận diện tự động cũng phải đạt confidence tối thiểu 55%;
nếu không, người dùng phải xác nhận bài trước khi lưu. Video có nhiều người
xuất hiện đáng kể sẽ bị từ chối để tránh gán nhầm chuyển động cho user.

Khi mở rộng production, cần benchmark trên bộ video được gán nhãn riêng (theo góc quay, ánh sáng, dáng người và thiết bị), đặt ngưỡng acceptance cho precision/recall reps và OCR kg, đồng thời thêm calibration/nhận diện tải riêng nếu muốn đọc khối lượng không có nhãn chữ. Profile model validated có thể mở rộng nhận diện sang bài trong catalog, nhưng phải khai báo `runtime_profile` cho tín hiệu reps hoặc duration-only; artifact thiếu metadata sẽ bị từ chối.

Profile model learned từ audit trace được đóng gói riêng ở trạng thái
`candidate`; chỉ artifact có `status=validated`, snapshot report evaluator
provenance đạt gate và canonical report hash khớp mới được runtime sử dụng.

Tiêu chí đánh giá, provenance và release gates chi tiết nằm trong [AI_EVALUATION.md](C:/Dev/GymLab/AI_EVALUATION.md).
Quy trình consent, ẩn danh, gán nhãn và tách subject/camera nằm trong [DATASET_CARD.md](C:/Dev/GymLab/DATASET_CARD.md).

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
