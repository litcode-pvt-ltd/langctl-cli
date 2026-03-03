# Contributing to langctl

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/siddharthsaxena0/langctl.git
cd langctl
npm install
npm run dev   # runs tsx watch
```

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Test locally with `npm run dev`
4. Submit a pull request

## Reporting Bugs

Use the [bug report template](https://github.com/siddharthsaxena0/langctl/issues/new?template=bug_report.md) and include your `langctl --version`, Node.js version, and OS.

## Code Style

- TypeScript with strict mode
- Use `commander` for CLI commands
- Keep commands in `src/commands/`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
