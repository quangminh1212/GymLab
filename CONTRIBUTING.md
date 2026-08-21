# Contributing to GymLab

Thank you for your interest in contributing!

## Development Setup

### Prerequisites
- Rust ≥ 1.70
- Node.js ≥ 18 (optional, for npm scripts)

### Getting Started
```bash
git clone https://github.com/quangminh1212/GymLab.git
cd GymLab
cargo install tauri-cli
cargo tauri dev
```

## Code Style

### Rust
- Format with `cargo fmt`
- Lint with `cargo clippy`
- Follow Rust naming conventions (snake_case for functions, PascalCase for types)

### JavaScript
- Use ES6+ features
- Keep functions small and focused
- Add JSDoc comments for complex logic

### CSS
- Use CSS custom properties (variables) for theming
- Follow BEM naming convention
- Mobile-first responsive design

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `cargo clippy` and `cargo fmt`
4. Test on desktop and mobile
5. Submit PR with clear description

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Specify OS and browser
- Add screenshots if UI-related

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
