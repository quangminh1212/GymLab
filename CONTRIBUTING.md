# Contributing to GymLab

Thank you for your interest in contributing to GymLab! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Rust | >= 1.70 | `rustc --version` |
| Node.js | >= 18 | `node --version` |
| Python | >= 3.10 (for tests) | `python --version` |

### Getting Started

```bash
# Clone the repository
git clone https://github.com/quangminh1212/GymLab.git
cd GymLab

# Install Tauri CLI
cargo install tauri-cli

# Start development server
cargo tauri dev

# Or use the browser dev server
python dev-server.py
```

## Code Style

### Rust
- Follow `cargo fmt` formatting
- Pass `cargo clippy` with zero warnings
- All new commands must include input validation
- Use `Result<T, String>` for error handling in Tauri commands

### JavaScript
- Use `node --check` to validate syntax
- Follow existing code patterns (IIFE modules, async/await)
- All user-facing strings must use `_t()` from the i18n system
- Use `safeInvoke()` instead of raw `invoke()` for IPC calls

### CSS
- Use CSS custom properties (variables) from `:root`
- Follow existing naming conventions (BEM-like)
- All interactive elements must have `:focus-visible` styles
- Test responsive behavior at 360px, 600px, 900px, and 1200px+

## Testing

```bash
# Run all checks
cd src-tauri && cargo test          # Rust unit tests
node tests/video-analysis-core.test.mjs  # JS core tests
python3 tests/test_evaluate_benchmark.py  # Python unit tests

# Full CI simulation
cargo clippy -- -D warnings
cargo fmt --check
```

## Internationalization (i18n)

When adding new UI strings:
1. Add the key to both `en` and `vi` locale objects in `src/js/i18n.js`
2. Use `_t('key.name')` in JavaScript or `data-i18n="key.name"` in HTML
3. Support interpolation with `{param}` syntax
4. Test with both English and Vietnamese locales

## Pull Request Process

1. Create a feature branch from `main`
2. Ensure all CI checks pass
3. Update `CHANGELOG.md` with your changes
4. Request review with a clear description of what changed and why

## Reporting Issues

- Use GitHub Issues for bug reports
- Include steps to reproduce
- Mention your OS and app version
- For video analysis issues, include the video file if possible (privacy permitting)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
