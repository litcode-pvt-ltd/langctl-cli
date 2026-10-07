<div align="center">

# langctl

**Translation management from your terminal and CI**

[![npm version](https://img.shields.io/npm/v/langctl.svg)](https://www.npmjs.com/package/langctl)
[![CI](https://github.com/litcode-pvt-ltd/langctl-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/litcode-pvt-ltd/langctl-cli/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/langctl.svg)](LICENSE)

[Website](https://langctl.com) · [Docs](https://langctl.com/docs) · [Sign up](https://app.langctl.com/signup)

</div>

`langctl` keeps the translation files in your repository in sync with [Langctl](https://langctl.com):
**pull** translations into JSON, Android, iOS or Flutter files, **push** new source strings,
and **check** in CI that committed files are up to date.

```console
$ langctl init          # once per repo: pick a project, format and path → langctl.json
$ langctl pull          # download translations
+ src/locales/en.json  created
+ src/locales/es.json  created  41/45 translated
$ langctl push          # upload new strings from your source-language file
en  src/locales/en.json  3 new, 0 updated, 42 unchanged
```

## Install

```bash
npm install -g langctl        # Node.js 20 or newer
# or, without installing:
npx langctl --help
```

## Quick start

1. Create an API key at **[app.langctl.com → API Keys](https://app.langctl.com/organization/api-keys)** (it is shown only once).
2. In your repository:

   ```bash
   langctl init
   ```

   This asks for the key (input is hidden), lets you pick the project, file format and location,
   and writes a `langctl.json` you can commit. Then:

   ```bash
   langctl pull      # write translation files
   langctl push      # upload new keys from your source language file
   ```

Keys are only included in `pull` once they are **published** — drafts stay out of your app until
someone reviews them (`--include-drafts` to override).

## Use it in CI

No config file or login step is needed — set the key as a secret environment variable.

```yaml
# .github/workflows/i18n.yml
name: translations
on: [pull_request]
jobs:
  i18n:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npx langctl@0 pull --check            # fail if committed files are out of date
        env:
          LANGCTL_API_KEY: ${{ secrets.LANGCTL_API_KEY }}
```

Other useful CI commands:

```bash
langctl push --dry-run --json          # preview what a push would change
langctl push --publish                 # upload and publish new source strings (e.g. on main)
langctl pull --require-complete        # fail if any language is missing translations
langctl whoami --json                  # verify the key, org and scopes
```

In CI `langctl` never prompts and never animates: spinners are off when `CI` is set or output
isn't a terminal, destructive commands require `--yes`, and every failure has a distinct
[exit code](#exit-codes). Use a key with only the scopes the job needs — `translations:read`
is enough for `pull`.

## `langctl.json`

```json
{
  "project": "web-app",
  "format": "json",
  "output": "src/locales/{lang}.json"
}
```

| Field | Description |
| --- | --- |
| `project` | Project slug (`langctl projects list`). |
| `format` | `json` (default), `nested-json`, `android`, `ios`, `arb` — see below. |
| `output` | Path template, relative to `langctl.json`. Variables: `{lang}` (`pt-BR`), `{lang_}` (`pt_BR`), `{android}` (`values`, `values-pt-rBR`). |
| `languages` | Languages to pull (default: all project languages). |
| `sourceLanguage` | Language `push` uploads by default (default: the project's default language). |
| `includeDrafts` | Pull unpublished keys too (default `false`). |
| `module` | Only pull/push keys in this module. |

Command-line flags override the file; `langctl` looks for `langctl.json` in the current directory and its parents.

## Formats

| Format | Default path | Notes |
| --- | --- | --- |
| `json` | `locales/{lang}.json` | Flat `{"home.title": "…"}` (i18next, vue-i18n, …). Import also accepts nested JSON. |
| `nested-json` | `locales/{lang}.json` | `{"home": {"title": "…"}}`. Fails if a key is both a string and a parent. |
| `android` | `res/{android}/strings.xml` | Names become valid resources (`home.title` → `home_title`); `{{name}}` → `%1$s`. |
| `ios` | `{lang}.lproj/Localizable.strings` | `{{name}}` → `%1$@`. |
| `arb` | `lib/l10n/app_{lang_}.arb` | Flutter; ids become Dart identifiers (`home.title` → `homeTitle`); placeholders declared. |

Placeholders are stored as `{{name}}`. A placeholder used twice gets the same position on every
platform, and literal `%` is escaped where needed. Output is sorted and has no timestamps, so a
pull only changes files when translations change. If two keys map to the same Android/ARB name,
the pull fails and names both keys instead of silently dropping one.

## Commands

| Command | Description |
| --- | --- |
| `langctl init` | Set up a repo (auth if needed, write `langctl.json`). Flags: `--project --format --output --force`. |
| `langctl pull [project]` | Download translations. `-l/--languages`, `-f/--format`, `-o/--output`, `-m/--module`, `--include-drafts`, `--check`, `--dry-run`, `--require-complete`. |
| `langctl push [project]` | Upload files. Default: source language only; `-l all` for every language. `--overwrite`, `--publish`, `--dry-run`, `-i/--input`. |
| `langctl export [project]` | One-off export: `-l es -f android -o strings.xml`. |
| `langctl import [project] <file>` | One-off import of a single file: `-l es`, `--overwrite`, `--publish`, `--dry-run`. |
| `langctl auth [--stdin]` | Store an API key in `~/.langctl/config.json` (mode 600). `echo "$KEY" \| langctl auth --stdin`. |
| `langctl whoami` | Show org, key source, scopes and API latency. |
| `langctl logout` · `langctl config` · `langctl formats` | Remove the stored key · show effective config · list formats. |
| `langctl projects list\|get\|create\|update\|delete\|add-language\|remove-language\|stats` | Manage projects. `stats` shows translation coverage per language. |
| `langctl keys list\|get\|create\|update\|translate\|delete\|publish\|unpublish` | Manage keys, e.g. `keys create web home.title --value en="Welcome" --value es="Bienvenido" --publish`. |
| `langctl team list\|invite\|remove\|update-role\|invitations\|revoke-invitation` | Team management (key needs the `org:admin` scope). |
| `langctl org info\|stats\|plan` | Organization details, usage and plan limits. |

Global flags (any position): `--json` · `-q/--quiet` · `--verbose` (log HTTP requests) · `-y/--yes` ·
`--api-key` · `--api-url` · `--timeout <seconds>` · `--no-color`. Run `langctl <command> --help` for details.

## Configuration & environment

| Variable | Purpose |
| --- | --- |
| `LANGCTL_API_KEY` | API key (takes precedence over the stored key). |
| `LANGCTL_API_URL` | API base URL (default `https://api.langctl.com/api/v1`). |
| `LANGCTL_TIMEOUT` | Request timeout in seconds (default 30). Idempotent requests are retried with backoff on network errors, 429 and 5xx. |
| `LANGCTL_CONFIG_DIR` | Where the user config lives (default `~/.langctl`). |
| `NO_COLOR` / `CI` | Disable colors / force non-interactive mode. |
| `NODE_EXTRA_CA_CERTS` | Trust a corporate proxy's CA. |

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Error (including a cancelled confirmation, `--require-complete` failures) |
| 2 | Invalid usage — bad flag, unknown language/format, refused without `--yes` |
| 3 | Not authenticated, invalid/revoked key, or missing permission (scope) |
| 4 | Project, key, member or file not found |
| 5 | Network error, timeout, or the API is unavailable |
| 6 | Plan limit reached |
| 7 | `pull --check`: files are out of date |

With `--json`, errors are also printed to stdout as `{"error": {"message", "exitCode", "hint"}}`.

## Upgrading from 0.2

- Requires **Node.js 20+** (0.2 already needed it in practice).
- `pull`/`export` default paths follow each platform's layout (`locales/{lang}.json`,
  `res/values-xx/strings.xml`, `xx.lproj/…`, `app_xx.arb`). Use `-o` or `langctl.json` to keep your old paths.
- Exporting several languages to one file is now an error instead of silently overwriting it.
- Android and ARB output now uses valid identifiers (`home_title`, `homeTitle`) and correct escaping.
- Destructive commands (`projects delete`, `keys delete`, removing languages, `team remove`) ask for
  confirmation, and require `--yes` when not run interactively.
- `keys translate` takes the text with `-t/--text` (`-v` is the version flag); `keys create`
  accepts `--value LANG=TEXT` for any language. The `debug` command was replaced by `whoami`.
- `team` commands need an API key with the `org:admin` scope.

See [CHANGELOG.md](CHANGELOG.md) for everything else.

## Development

```bash
npm ci
npm test                 # unit tests
npm run build
LANGCTL_API_KEY=lc_… LANGCTL_E2E_PROJECT=<test-project> npm run test:e2e   # against a real API
```

## License

MIT
