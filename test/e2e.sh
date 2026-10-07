#!/usr/bin/env bash
# End-to-end test of the built CLI against a real Langctl API, the way CI uses it:
# no TTY, no config file, only LANGCTL_API_KEY. Creates and deletes its own keys.
#
#   LANGCTL_API_KEY=lc_… LANGCTL_E2E_PROJECT=<slug> npm run test:e2e
#
# Needs a key with translations:read/write + projects:read on a project with ≥2 languages.
set -uo pipefail

: "${LANGCTL_API_KEY:?set LANGCTL_API_KEY}"
: "${LANGCTL_E2E_PROJECT:?set LANGCTL_E2E_PROJECT to a test project slug}"
P="$LANGCTL_E2E_PROJECT"
CLI="${LANGCTL_CLI:-node $(cd "$(dirname "$0")/.." && pwd)/dist/index.js}"
WORK="$(mktemp -d)"
export LANGCTL_CONFIG_DIR="$WORK/config" CI=true NO_COLOR=1
STAMP="e2e.$(date +%s)$RANDOM"
pass=0; fail=0

lc() { (cd "$WORK/app" && $CLI "$@"); }
ok()   { pass=$((pass+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; [ -n "${2:-}" ] && printf '    %s\n' "$2"; }
# expect <exit-code> <description> -- <args…>   (captures stdout/stderr into $OUT/$ERR)
expect() {
  local code="$1" desc="$2"; shift 3
  OUT="$(lc "$@" 2>"$WORK/stderr")"; local got=$?; ERR="$(cat "$WORK/stderr")"
  if [ "$got" = "$code" ]; then ok "$desc"; else bad "$desc" "expected exit $code, got $got: ${ERR:-$OUT}"; fi
}
has() { if grep -q -- "$2" <<<"$3"; then ok "$1"; else bad "$1" "missing \"$2\" in: $3"; fi; }
cleanup() { lc keys delete "$P" "$STAMP.a" "$STAMP.b" --yes >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$WORK/app"

echo "langctl e2e against ${LANGCTL_API_URL:-https://api.langctl.com/api/v1} (project $P)"

echo "auth & discovery"
expect 0 "whoami works from LANGCTL_API_KEY alone" -- whoami --json
has "whoami reports the key source" '"keySource": "LANGCTL_API_KEY"' "$OUT"
expect 0 "projects list --json is pure JSON on stdout" -- projects list --json
node -e 'JSON.parse(process.argv[1])' "$OUT" 2>/dev/null && ok "stdout parses as JSON" || bad "stdout parses as JSON" "$OUT"
LANGS="$(node -e 'const p=JSON.parse(process.argv[1]).find(p=>p.slug===process.argv[2]);console.log(p?p.languages.join(","):"")' "$OUT" "$P")"
[ -n "$LANGS" ] && ok "test project exists ($LANGS)" || { bad "test project exists"; exit 1; }
DEFAULT_LANG="${LANGS%%,*}"
SECOND_LANG="$(cut -d, -f2 <<<"$LANGS")"

echo "init & pull"
expect 0 "init is non-interactive in CI" -- init --project "$P" --format json --output "locales/{lang}.json"
expect 2 "init refuses to overwrite without --force" -- init --project "$P"
expect 0 "pull with no arguments (uses langctl.json)" -- pull
[ -f "$WORK/app/locales/$DEFAULT_LANG.json" ] && ok "wrote locales/$DEFAULT_LANG.json" || bad "wrote locales/$DEFAULT_LANG.json"
expect 0 "pull --check passes right after pull" -- pull --check
echo '{"tampered":"yes"}' > "$WORK/app/locales/$DEFAULT_LANG.json"
expect 7 "pull --check exits 7 when files drift" -- pull --check
has "drift message names the problem" "out of date" "$ERR"
expect 0 "pull restores the file" -- pull
expect 0 "second pull reports unchanged" -- pull
has "unchanged files are reported" "unchanged" "$OUT"
expect 0 "pull --json is machine readable" -- pull --json
has "pull json lists files" '"files"' "$OUT"
case "$OUT" in *⠋*|*⠙*) bad "no spinner frames in CI output";; *) ok "no spinner frames in CI output";; esac

echo "formats"
expect 0 "android pull" -- pull --format android --output "android/res/{android}/strings.xml"
[ -f "$WORK/app/android/res/values/strings.xml" ] && ok "default language → res/values/" || bad "default language → res/values/"
[ -f "$WORK/app/android/res/values-$SECOND_LANG/strings.xml" ] && ok "other languages → res/values-xx/" || bad "other languages → res/values-xx/"
if command -v xmllint >/dev/null; then xmllint --noout "$WORK/app/android/res/values/strings.xml" && ok "android XML is well-formed" || bad "android XML is well-formed"; fi
if grep -q 'name="[^"]*\.' "$WORK/app/android/res/values/strings.xml"; then bad "android names contain no dots"; else ok "android names contain no dots"; fi
expect 0 "ios pull" -- pull --format ios --output "ios/{lang}.lproj/Localizable.strings"
if command -v plutil >/dev/null; then plutil -lint "$WORK/app/ios/$DEFAULT_LANG.lproj/Localizable.strings" >/dev/null && ok ".strings passes plutil -lint" || bad ".strings passes plutil -lint"; fi
expect 0 "arb pull" -- pull --format arb --output "arb/app_{lang_}.arb"
node -e 'const o=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(!o["@@locale"]||o["@@last_modified"]) process.exit(1)' "$WORK/app/arb/app_$DEFAULT_LANG.arb" && ok "arb has @@locale and no timestamp" || bad "arb has @@locale and no timestamp"
expect 0 "nested-json pull" -- pull --format nested-json --output "nested/{lang}.json"
expect 2 "refuses multi-language output without {lang}" -- pull --output out.json
expect 2 "unknown format is a usage error" -- pull --format yaml
expect 0 "single language to a plain file is fine" -- pull --languages "$DEFAULT_LANG" --output "single.json"

echo "keys"
expect 0 "keys create with --value for any language" -- keys create "$P" "$STAMP.a" --value "$DEFAULT_LANG=Hello {{name}}" --value "$SECOND_LANG=Hola {{name}}" --description "e2e" --json
expect 2 "keys create rejects a language the project lacks" -- keys create "$P" "$STAMP.zz" --value "xx=nope"
expect 2 "duplicate key is a usage error (409)" -- keys create "$P" "$STAMP.a"
expect 0 "keys get --json" -- keys get "$P" "$STAMP.a" --json
has "key has the second language" "Hola" "$OUT"
expect 0 "keys update --value" -- keys update "$P" "$STAMP.a" --value "$SECOND_LANG=Hola de nuevo, {{name}}"
expect 0 "legacy keys translate -l -t" -- keys translate "$P" "$STAMP.a" -l "$DEFAULT_LANG" -t "Hello again, {{name}}"
expect 0 "draft keys are excluded from pull" -- pull --languages "$DEFAULT_LANG" --output check.json
if grep -q "$STAMP.a" "$WORK/app/check.json"; then bad "drafts excluded by default"; else ok "drafts excluded by default"; fi
expect 0 "--include-drafts includes them" -- pull --languages "$DEFAULT_LANG" --output check.json --include-drafts
has "draft present with --include-drafts" "$STAMP.a" "$(cat "$WORK/app/check.json")"
expect 0 "keys publish by name" -- keys publish "$P" "$STAMP.a"
expect 4 "publishing a missing key exits 4" -- keys publish "$P" "$STAMP.missing"
expect 0 "keys list --search --json" -- keys list "$P" --search "$STAMP" --json
has "list finds the key" "$STAMP.a" "$OUT"
expect 4 "keys get on a missing key exits 4" -- keys get "$P" "$STAMP.missing"
expect 2 "delete without --yes is refused in CI" -- keys delete "$P" "$STAMP.a"
expect 0 "keys delete --yes" -- keys delete "$P" "$STAMP.a" --yes
expect 0 "re-creating a deleted key works" -- keys create "$P" "$STAMP.a" --value "$DEFAULT_LANG=Back"

echo "push"
node -e 'const f=process.argv[1];const o=require(f);o[process.argv[2]]="Pushed from e2e";require("fs").writeFileSync(f,JSON.stringify(o,null,2))' "$WORK/app/locales/$DEFAULT_LANG.json" "$STAMP.b"
expect 0 "push --dry-run" -- push --dry-run --json
has "dry run counts the new key" '"created": 1' "$OUT"
expect 0 "push uploads the source language" -- push --publish
expect 0 "pushed key is published and pullable" -- pull --check
has "check is clean after push" "" "$ERR"
expect 0 "push again is a no-op" -- push --json
has "nothing new on second push" '"created": 0' "$OUT"

echo "errors & exit codes"
expect 4 "unknown project exits 4" -- pull nope-not-a-project
has "not-found lists available projects" "Available projects" "$ERR"
expect 2 "language not in project exits 2" -- pull --languages xx
expect 2 "unknown option exits 2" -- pull --nope
expect 3 "team invite without org:admin exits 3" -- team invite e2e@example.com
has "scope error names the scope" "org:admin" "$ERR"
LANGCTL_API_KEY="lc_$(printf 'f%.0s' {1..64})" expect 3 "invalid key exits 3" -- projects list
LANGCTL_API_URL="http://127.0.0.1:9/api/v1" expect 5 "unreachable API exits 5" -- projects list --timeout 3
expect 0 "--json errors are JSON too" -- whoami --json
OUT="$(lc pull nope-not-a-project --json 2>/dev/null)"; has "error JSON on stdout" '"exitCode": 4' "$OUT"

echo "stored credentials"
printf '%s\n' "$LANGCTL_API_KEY" | (cd "$WORK/app" && env -u LANGCTL_API_KEY $CLI auth --stdin >/dev/null 2>&1) && ok "auth --stdin" || bad "auth --stdin"
if [ "$(uname)" != "MINGW64_NT" ] && [ -f "$LANGCTL_CONFIG_DIR/config.json" ]; then
  perms="$(stat -f %Lp "$LANGCTL_CONFIG_DIR/config.json" 2>/dev/null || stat -c %a "$LANGCTL_CONFIG_DIR/config.json")"
  [ "$perms" = "600" ] && ok "config file is 0600" || bad "config file is 0600" "got $perms"
fi
(cd "$WORK/app" && env -u LANGCTL_API_KEY $CLI whoami >/dev/null 2>&1) && ok "whoami from stored key" || bad "whoami from stored key"
(cd "$WORK/app" && env -u LANGCTL_API_KEY $CLI logout >/dev/null 2>&1) && ok "logout" || bad "logout"
(cd "$WORK/app" && env -u LANGCTL_API_KEY $CLI whoami >/dev/null 2>&1); [ $? = 3 ] && ok "after logout: exit 3" || bad "after logout: exit 3"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
