# Changelog

All notable changes to GymLab will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-09-12

### Added
- **Video Analysis** — Local AI exercise recognition using MediaPipe Pose Landmarker
  - Rep counting via pose landmark analysis
  - OCR weight reading (kg/lb) from video frames using Tesseract.js
  - Confidence scoring and provenance tracking
  - Quality gate for pose coverage and motion detection
- **Workout Logging** — Full CRUD for gym workouts with 26 exercises (ACSM Compendium 2024)
- **Calorie Calculation** — MET-based calorie estimation (ACSM formula)
- **Charts & Analytics** — Daily calorie bar chart, exercise distribution doughnut, exercise progress line chart
- **Personal Records** — Automatic PR tracking per exercise
- **Body Weight Tracking** — Log body weight over time with chart visualization
- **Workout Templates** — Save and re-use workout templates
- **Quick Re-log** — One-click re-log from any past workout or template
- **Rest Timer** — Floating rest timer with presets (30s-3min) and countdown ring
- **Responsive Design** — Desktop sidebar, tablet icons-only, mobile hamburger menu
- **Dark Theme** — Modern dark UI with CSS custom properties
- **Offline-First** — All data stored locally in JSON files via Tauri

### Security
- Content Security Policy configured for Tauri v2
- Input validation on all backend commands (sets, reps, weight clamping)
- All processing done locally — no data uploaded to any server

### Testing
- Rust unit tests for calorie calculation, validation, serialization
- JavaScript unit tests for video analysis core (rep counting, OCR parsing)
- Python E2E tests with Playwright for video analysis flow
- CI/CD pipeline with Rust check/clippy/fmt/test, frontend validation, and build verification

### Accessibility
- ARIA labels on navigation, buttons, and interactive elements
- Keyboard navigation (Alt+1-8 page shortcuts, Escape to close menu)
- Screen reader announcements for page changes
- Focus management on page navigation
- WCAG 2.1 AA color contrast compliance
- Reduced motion support (`prefers-reduced-motion`)
- Minimum 44x44px touch targets for mobile

### Internationalization
- Full i18n system with English and Vietnamese locales
- Language selector in Settings
- All UI strings extracted to locale files
- Locale-aware date formatting
