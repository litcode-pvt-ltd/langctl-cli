# Changelog

## 0.4.0 — 2026-10-08

### Added
- `langctl translate [project]`: fill missing translations with AI (DeepL) from the default language. `--to`, `--keys`, `--module`, `--overwrite`, `--dry-run` (uses no quota). Placeholders such as `{{name}}`, `{count}`, `%1$s` are preserved.
- `langctl review [project]`: list AI translations awaiting review; `--approve` (narrow with `--keys` / `--languages`).
- `pull --include-unreviewed`.
- `pull` caches exports by ETag in `~/.langctl/cache`: when nothing changed on the server, the API answers `304 Not Modified` and the saved snapshot is reused. Set `LANGCTL_NO_CACHE=1` to disable. In CI, cache `~/.langctl/cache` (e.g. `actions/cache`) to benefit across runs.

### Changed
- `pull` leaves out AI translations nobody has reviewed yet (your app falls back to the default language for them) and warns how many were held back.

## 0.3.0 — 2026-10-08

A rewrite focused on reliability in real projects and CI.

### Added
- `langctl.json` project config and `langctl init` repo setup — `pull`/`push` need no arguments.
- `push`: upload translation files (source language by default), with `--dry-run`, `--overwrite`, `--publish`.
- `pull --check` (exit 7 when committed files are out of date), `--dry-run`, `--require-complete`.
- `LANGCTL_API_KEY` / `LANGCTL_API_URL` / `LANGCTL_TIMEOUT` / `LANGCTL_CONFIG_DIR`: CI needs no config file.
- `--json` on every command (errors too), `--quiet`, `--verbose` (HTTP trace), `--yes`, `--timeout`, `--no-color`.
- `whoami` (org, key source, scopes, latency), `formats`, `keys update`, `keys unpublish`, `publish --all/--module`.
- `projects stats` shows translation coverage per language.
- Import/push read every format pull writes (JSON, nested JSON, Android XML, iOS .strings, ARB).
- Documented exit codes (0–7).
- Retries with backoff for idempotent requests (network errors, 429, 5xx); clear network/TLS/proxy errors.

### Fixed
- `init` could hang forever after entering the API key.
- Spinners froze the CLI under emulated terminals (`script`, `docker -t`); spinners are now off in CI/pipes.
- Exporting all languages to Android/iOS wrote every language to the same file (only the last survived).
- `-o file` with several languages overwrote the same file for each language.
- Android: keys with dots produced invalid resource names; apostrophes were escaped as `&apos;` (Android needs `\'`).
- ARB: keys with dots were invalid message ids; a timestamp made every pull a git diff.
- Repeated placeholders got different positions (`{{name}} … {{name}}` → `%1$s … %2$s`).
- Nested JSON silently dropped keys that were both a string and a parent.
- Unknown language/format, missing keys and empty imports exited 0 — CI passed on failures.
- Key lookups used a substring search limited to 100 results; `keys publish` silently skipped keys beyond 100.
- Files over ~1 MB failed to import (uploads are now chunked).
- The API key was stored world-readable; the config file is now mode 600 and written atomically.
- The API key had to be passed as an argument (shell history); use `auth --stdin` or the hidden prompt.

### Changed
- Requires Node.js 20+ (the dependencies already did).
- Dependencies cut from 5 to 2 (`commander`, `chalk`).
- Default file paths follow platform conventions; see "Upgrading from 0.2" in the README.
- Destructive commands confirm, and require `--yes` when non-interactive.
- `keys translate` uses `-t/--text`; `debug` was replaced by `whoami`.

## 0.2.0 — 2026-03-03
- Initial public release.
