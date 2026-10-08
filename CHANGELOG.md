# Changelog

## 0.5.0 — 2026-10-09

Fixes from a real Hindi rollout of a 3,000-key, three-app project.

### Fixed
- `translate` no longer fails a whole run when the provider can't translate a few strings
  (`{h}h`, `98860 41022`, `+ {name}`): those are reported per key with their source text, everything
  else is saved, and the command exits **8** (new: "partial — some strings need a human
  translation"). Strings with nothing to translate are copied unchanged.
- `translate`: API/provider failures exit 5 (network, 5xx) or 1 — never 2, which means invalid usage.
- `translate`: with stdout piped, the summary and failures go to stderr instead of being lost among
  the per-key lines.
- `push` printed absolute input paths relative to the cwd (`../../../../var/…`); paths are printed as given.

### Added
- `translate`: progress counter (`Translating 312/889…`; a line about every 10% in CI), 100 strings
  per request with 3 requests in flight, summary `Translated N, copied M unchanged, failed K`;
  `--json` includes `failed` and `counts`. On servers that save AI translations themselves the CLI
  no longer saves each key separately; on older servers it saves them 6 at a time.
- `review -m/--module`.
- Key prefixes for several apps in one project: `pull --strip-prefix <p>`, `push --prefix <p>`, or
  `"prefix"` in `langctl.json` (both directions). Keys without the prefix are skipped on pull and counted.
- `push --descriptions <file.json>` (flat `{ "key": "description" }`) and rich JSON input
  (`{ "key": { "value", "description" } }`) for `push`/`import`.
- Named profiles: `--profile <name>` / `LANGCTL_PROFILE` (`~/.langctl/profiles/<name>.json`);
  the default profile is still `~/.langctl/config.json`. `whoami` and `config` show the profile.
- Notice when a newer langctl is published (checked at most once a day, ≤1.5s, off in CI/`--json`/`--quiet`;
  `LANGCTL_UPDATE_CHECK=0|1`). When the API doesn't know a path the CLI uses (404 route / 410), the
  error says to upgrade.
- README: API key format, how review state is set (AI vs. human), exit code 8.

### Changed
- `auth` asks before replacing a stored key that belongs to a different organization, and refuses
  without `--yes` when not interactive (suggesting a profile instead).
- `pull` always says when AI drafts were held back — also with `--json` (on stderr) unless `--quiet` —
  and shows a language that is empty only because of drafts as `0 strings: N awaiting review`.

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
