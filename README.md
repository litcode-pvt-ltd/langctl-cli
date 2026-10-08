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
   Langctl API keys look like `lc_` followed by 64 hexadecimal characters (`lc_3f9a…`, 67 characters in total).
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
| `prefix` | Key prefix for projects shared by several apps, e.g. `"dashboard."`: `pull` keeps only keys with it and writes them without it; `push` adds it. See [Key prefixes](#key-prefixes-several-apps-in-one-project). |

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

## Review state: AI vs. human translations

Every translation is either *reviewed* (written or approved by a person) or an *unreviewed AI draft*:

| How the text got there | State | Shipped by `pull`? |
| --- | --- | --- |
| `langctl translate` (DeepL) | AI draft, unreviewed | No — held back until approved or edited |
| `langctl push` / `import` (new keys, or changed text with `--overwrite`) | Human, reviewed | Yes |
| Edited in the web app, or `keys update` / `keys translate` | Human, reviewed | Yes |
| `langctl review --approve`, or *Approve* in the web app | Reviewed | Yes |

An AI draft stops being a draft as soon as its text differs from what the AI produced, however it
was changed. So translating with AI, fixing strings in your file, and running
`push -l hi --overwrite` marks the corrected strings as reviewed. Strings you push back *unchanged*
are skipped by the import and stay drafts — approve those with `langctl review --approve`. `pull` tells you how many drafts it
held back (also with `--json`, on stderr); a language that comes back empty because everything is
still a draft is shown as `0 strings: N awaiting review`. Ship drafts anyway with `--include-unreviewed`.

## AI translation (`translate`)

```console
$ langctl translate -t hi -m mobile
Translating 312/889…
✖ Translated 880, copied 7 unchanged, failed 2 (hi; 2211/50000 AI translations used this month).
Needs a human translation:
  hi  mobile.onboarding.duration.hours  "{h}h"  (empty_result)
```

- Strings go up 100 per request, a few requests at a time. A progress counter is shown at a
  terminal; in CI and pipes a progress line is printed about every 10%.
- Strings with nothing to translate (`98860 41022`, `+ {name}`) are copied unchanged.
- A string the provider can't translate never fails the rest: it is listed (with its source text)
  and the command exits **8**. Add it by hand and re-run — only missing strings are translated.
- Per-key lines go to stdout; the summary and failures go to stderr, so they aren't lost when you
  redirect stdout. With `--json` the result has `translated`, `failed` (key, language, source text,
  reason) and `counts`.
- Key descriptions help reviewers; set them in bulk with `push --descriptions` (below).

## Key prefixes (several apps in one project)

Keys are unique per project. When several apps share a project and need the same key name
(`common.save`), store them with a prefix — `dashboard.common.save`, `web.common.save` — and let
langctl add and strip it:

```bash
langctl pull --strip-prefix dashboard     # only dashboard.* keys, written as common.save, …
langctl push --prefix dashboard           # common.save is uploaded as dashboard.common.save
```

Or put `"prefix": "dashboard."` in that app's `langctl.json` and both directions use it. A prefix
without a trailing separator (`.`, `_`, `-`, `:`, `/`) gets a `.` appended. On pull, keys without
the prefix are skipped and counted in a warning. `translate --keys` and `review --keys` accept key
names with or without the configured prefix; `keys get/update/delete/…` take the full stored name.

## Descriptions

Descriptions give translators (and reviewers) context. Set them in bulk when pushing:

```bash
langctl push --descriptions i18n/descriptions.json --overwrite
```

`descriptions.json` is flat: `{ "common.book": "Verb: book an appointment" }`. Only keys present
in both files get a description; unmatched entries are reported. New keys always get their
description; for keys that already exist pass `--overwrite` (the server decides whether an existing
description is replaced). A flat JSON input file may also carry descriptions inline:
`{ "common.book": { "value": "Book", "description": "Verb" } }` (`push` and `import`).

## Profiles (several organizations)

`langctl auth` stores one key per *profile*. The default profile is `~/.langctl/config.json`;
named profiles live in `~/.langctl/profiles/<name>.json`:

```bash
echo "$CLIENT_B_KEY" | langctl auth --profile client-b --stdin
langctl pull --profile client-b               # or: export LANGCTL_PROFILE=client-b
langctl whoami                                # shows the profile in use
```

Storing a key for a *different* organization in a profile that already has one asks for
confirmation; non-interactively it refuses unless you pass `--yes`. `LANGCTL_API_KEY` /
`--api-key` still take precedence over any profile.

## Commands

| Command | Description |
| --- | --- |
| `langctl init` | Set up a repo (auth if needed, write `langctl.json`). Flags: `--project --format --output --force`. |
| `langctl pull [project]` | Download translations. `-l/--languages`, `-f/--format`, `-o/--output`, `-m/--module`, `--include-drafts`, `--include-unreviewed`, `--check`, `--dry-run`, `--require-complete`, `--strip-prefix <p>`. AI translations nobody has reviewed are left out (with a notice) until approved. |
| `langctl push [project]` | Upload files. Default: source language only; `-l all` for every language. `--overwrite`, `--publish`, `--dry-run`, `-i/--input`, `--prefix <p>`, `--descriptions <file>`. Pushed text counts as reviewed. |
| `langctl export [project]` | One-off export: `-l es -f android -o strings.xml`. |
| `langctl import [project] <file>` | One-off import of a single file: `-l es`, `--overwrite`, `--publish`, `--dry-run`. |
| `langctl translate [project]` | Fill missing translations with AI (DeepL) from the default language. `-t/--to es,fr`, `-k/--keys`, `-m/--module`, `--overwrite`, `--dry-run` (no quota used). Placeholders like `{{name}}` are kept as-is; uses the plan's monthly AI translations, or the org's own DeepL key if one is saved. Exits 8 if some strings need a human. |
| `langctl review [project]` | List AI translations awaiting review; `--approve` approves them (narrow with `-m/--module`, `-k/--keys`, `-l/--languages`; `--yes` in CI). Editing a translation in the web app also counts as reviewing it. |
| `langctl auth [--stdin]` | Store an API key in `~/.langctl/config.json` (mode 600), or in a [profile](#profiles-several-organizations). `echo "$KEY" \| langctl auth --stdin`. Asks before replacing a key for a different organization. |
| `langctl whoami` | Show org, key source, profile, scopes and API latency. |
| `langctl logout` · `langctl config` · `langctl formats` | Remove the stored key · show effective config · list formats. |
| `langctl projects list\|get\|create\|update\|delete\|add-language\|remove-language\|stats` | Manage projects. `stats` shows translation coverage per language. |
| `langctl keys list\|get\|create\|update\|translate\|delete\|publish\|unpublish` | Manage keys, e.g. `keys create web home.title --value en="Welcome" --value es="Bienvenido" --publish`. |
| `langctl team list\|invite\|remove\|update-role\|invitations\|revoke-invitation` | Team management (key needs the `org:admin` scope). |
| `langctl org info\|stats\|plan` | Organization details, usage and plan limits. |

Global flags (any position): `--json` · `-q/--quiet` · `--verbose` (log HTTP requests) · `-y/--yes` ·
`--api-key` · `--api-url` · `--profile <name>` · `--timeout <seconds>` · `--no-color`. Run `langctl <command> --help` for details.

## Configuration & environment

| Variable | Purpose |
| --- | --- |
| `LANGCTL_API_KEY` | API key (takes precedence over the stored key). |
| `LANGCTL_API_URL` | API base URL (default `https://api.langctl.com/api/v1`). |
| `LANGCTL_TIMEOUT` | Request timeout in seconds (default 30). Idempotent requests are retried with backoff on network errors, 429 and 5xx. |
| `LANGCTL_PROFILE` | Named credentials profile (`~/.langctl/profiles/<name>.json`); same as `--profile`. |
| `LANGCTL_CONFIG_DIR` | Where the user config lives (default `~/.langctl`). |
| `LANGCTL_UPDATE_CHECK` | `0` turns off the "new version available" notice; `1` enables it in CI / `--json` / `--quiet`, where it is otherwise off. It checks npm at most once a day and never delays a command by more than ~1.5s. |
| `LANGCTL_NO_CACHE` | Set to `1` to disable the export cache (`~/.langctl/cache`). `pull` normally sends the last ETag and reuses the cached snapshot when the server answers 304 Not Modified. |
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
| 8 | Partial: `translate` finished, but some strings could not be AI-translated and need a human (listed in the output) |

Errors from the API or the AI provider are never reported as 2: they are 5 (network, timeout,
5xx) or 1. If the API no longer knows a path this CLI uses (404 route / 410 Gone), the error says
to upgrade: `npm i -g langctl@latest`.

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
