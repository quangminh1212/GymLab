# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability within GymLab, please send an email to the project maintainer. All security vulnerabilities will be promptly addressed.

Please do **not** report security vulnerabilities through public GitHub issues.

## Security Design Principles

### Data Privacy
- **100% Local Processing** — All workout data, video analysis, and user information stays on your device
- **No Cloud Dependencies** — No data is ever uploaded to external servers
- **No Analytics/Telemetry** — No usage data is collected or transmitted

### Application Security
- **Content Security Policy (CSP)** — Strict CSP configured in Tauri v2 to prevent XSS
- **Input Validation** — All backend commands validate and clamp input values
- **No Shell Execution** — The app does not expose shell command execution capabilities
- **Local-Only Assets** — All dependencies (Chart.js, MediaPipe, Tesseract) are bundled locally

### Video Analysis Security
- **On-Device Inference** — MediaPipe Pose Landmarker runs entirely in the WebView
- **No Upload** — Videos never leave the device; processing happens locally
- **No Network Required** — Video analysis works fully offline after initial app install

### Data Storage
- **JSON Files** — Workout data stored in plaintext JSON in the app data directory
- **No Database** — Simple file-based storage for transparency and easy backup
- **User Control** — Users can manually edit or delete their data files

## Scope

The following are considered in-scope for security reports:
- Cross-Site Scripting (XSS) in the WebView
- Path traversal or file access beyond the app data directory
- Code execution via the Tauri IPC bridge
- Data leakage through video analysis pipeline
- Dependency vulnerabilities in bundled libraries

## Out of Scope

- Physical device security
- Social engineering attacks
- Issues in the operating system or WebView runtime itself
- Issues that require physical access to the user's device

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Security Update Process

1. Vulnerability reported and confirmed
2. Fix developed and tested
3. Patch released as a minor version bump
4. Security advisory published on GitHub
