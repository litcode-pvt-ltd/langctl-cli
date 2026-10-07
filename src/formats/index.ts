import { usageError } from '../core/errors.js';

/**
 * Translation file formats. Langctl stores placeholders i18next-style ("Hello {{name}}");
 * each format converts to/from its platform's syntax.
 *
 * Output must be deterministic (sorted keys, no timestamps, trailing newline) so
 * `langctl pull` only produces a git diff when translations actually change.
 */

export interface Entry {
  key: string;
  value: string;
  description?: string | null;
}

export interface Format {
  id: string;
  aliases: string[];
  label: string;
  /** Default path template; see expandTemplate for variables */
  defaultOutput: string;
  serialize(entries: Entry[], lang: string): string;
  parse(content: string, lang: string): Record<string, string>;
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;

/** Unique placeholder names in order of first appearance — the same name always gets the same position. */
function placeholderOrder(text: string): string[] {
  const names: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER)) if (!names.includes(m[1])) names.push(m[1]);
  return names;
}

function toPositional(text: string, suffix: string): string {
  const names = placeholderOrder(text);
  if (names.length === 0) return text;
  // A literal % must be doubled once the string is used as a format string
  const escaped = text.replace(/%/g, '%%');
  return escaped.replace(PLACEHOLDER, (_m, name: string) => `%${names.indexOf(name) + 1}$${suffix}`);
}

function fromPositional(text: string, suffix: string): string {
  const re = new RegExp(`%(\\d+)\\$${suffix.replace('@', '@')}`, 'g');
  if (!re.test(text)) return text;
  return text.replace(re, (_m, n: string) => `{{${n}}}`).replace(/%%/g, '%');
}

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** Rename keys for platforms with stricter identifier rules; fail loudly on collisions instead of silently dropping strings. */
function renameKeys(entries: Entry[], rename: (k: string) => string, platform: string): Array<Entry & { id: string }> {
  const seen = new Map<string, string>();
  const collisions: string[] = [];
  const out = entries.map(e => {
    const id = rename(e.key);
    const prev = seen.get(id);
    if (prev !== undefined && prev !== e.key) collisions.push(`"${prev}" and "${e.key}" both become "${id}"`);
    seen.set(id, e.key);
    return { ...e, id };
  });
  if (collisions.length) {
    throw usageError(`Keys collide when converted to ${platform} names:\n  ${collisions.join('\n  ')}`, 'Rename one of the keys, or export with a JSON format.');
  }
  return out;
}

// ── Flat JSON ───────────────────────────────────────────────────

function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}, bad: string[] = []): Record<string, string> {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw usageError('Expected a JSON object of translations.');
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out, bad);
    else bad.push(`${key} (${Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v})`);
  }
  if (!prefix && bad.length) {
    throw usageError(`Only string values can be imported. Not strings:\n  ${bad.slice(0, 10).join('\n  ')}${bad.length > 10 ? `\n  …and ${bad.length - 10} more` : ''}`);
  }
  return out;
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content.replace(/^\uFEFF/, ''));
  } catch (e) {
    throw usageError(`Invalid JSON: ${(e as Error).message}`);
  }
}

const flatJson: Format = {
  id: 'json',
  aliases: ['flat-json', 'i18n-json', 'i18next'],
  label: 'Flat JSON  { "home.title": "Welcome" }',
  defaultOutput: 'locales/{lang}.json',
  serialize(entries) {
    const obj: Record<string, string> = {};
    for (const e of sortEntries(entries)) obj[e.key] = e.value;
    return JSON.stringify(obj, null, 2) + '\n';
  },
  parse: content => flatten(parseJson(content)),
};

// ── Nested JSON ─────────────────────────────────────────────────

const nestedJson: Format = {
  id: 'nested-json',
  aliases: ['json-nested'],
  label: 'Nested JSON  { "home": { "title": "Welcome" } }',
  defaultOutput: 'locales/{lang}.json',
  serialize(entries) {
    const root: Record<string, unknown> = {};
    const conflicts: string[] = [];
    for (const e of sortEntries(entries)) {
      const parts = e.key.split('.');
      let node = root;
      let ok = true;
      for (let i = 0; i < parts.length - 1; i++) {
        const next = node[parts[i]];
        if (typeof next === 'string') {
          conflicts.push(`"${e.key}" is nested under "${parts.slice(0, i + 1).join('.')}", which is also a string`);
          ok = false;
          break;
        }
        node = (next as Record<string, unknown>) ?? (node[parts[i]] = {});
      }
      const leaf = parts[parts.length - 1];
      if (!ok) continue;
      if (node[leaf] !== undefined && typeof node[leaf] === 'object') { conflicts.push(`"${e.key}" is a string but also has nested keys`); continue; }
      node[leaf] = e.value;
    }
    if (conflicts.length) {
      throw usageError(`These keys can't be represented as nested JSON:\n  ${conflicts.join('\n  ')}`, 'Use --format json (flat) or rename the keys.');
    }
    return JSON.stringify(root, null, 2) + '\n';
  },
  parse: content => flatten(parseJson(content)),
};

// ── Android strings.xml ─────────────────────────────────────────

const androidName = (key: string) => {
  const n = key.replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(n) ? `_${n}` : n;
};

function escapeAndroid(text: string): string {
  let s = text
    .replace(/\\/g, '\\\\')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  if (/^[@?]/.test(s)) s = `\\${s}`;
  return s;
}

function unescapeAndroid(text: string): string {
  return text
    .replace(/^\\([@?])/, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\\\\/g, '\\');
}

const escapeXmlComment = (s: string) => s.replace(/--/g, '- -');

const android: Format = {
  id: 'android',
  aliases: ['android-xml', 'xml'],
  label: 'Android strings.xml (res/values-xx/)',
  defaultOutput: 'res/{android}/strings.xml',
  serialize(entries) {
    const lines = ['<?xml version="1.0" encoding="utf-8"?>', '<resources>'];
    for (const e of renameKeys(sortEntries(entries), androidName, 'Android resource')) {
      if (e.description) lines.push(`    <!-- ${escapeXmlComment(e.description)} -->`);
      lines.push(`    <string name="${e.id}">${escapeAndroid(toPositional(e.value, 's'))}</string>`);
    }
    lines.push('</resources>');
    return lines.join('\n') + '\n';
  },
  parse(content) {
    const out: Record<string, string> = {};
    const re = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/g;
    for (const m of content.matchAll(re)) {
      const raw = m[2].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
      out[m[1]] = fromPositional(unescapeAndroid(raw), 's');
    }
    if (!/<resources/.test(content)) throw usageError('Not an Android strings.xml file (no <resources> element).');
    return out;
  },
};

// ── iOS Localizable.strings ─────────────────────────────────────

const escapeStrings = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
const unescapeStrings = (s: string) => s.replace(/\\(["\\nrt])/g, (_m, c: string) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }[c] ?? c));

const ios: Format = {
  id: 'ios',
  aliases: ['ios-strings', 'strings'],
  label: 'iOS Localizable.strings (xx.lproj/)',
  defaultOutput: '{lang}.lproj/Localizable.strings',
  serialize(entries) {
    const blocks = sortEntries(entries).map(e =>
      `${e.description ? `/* ${e.description.replace(/\*\//g, '* /')} */\n` : ''}"${escapeStrings(e.key)}" = "${escapeStrings(toPositional(e.value, '@'))}";`);
    return blocks.join('\n') + (blocks.length ? '\n' : '');
  },
  parse(content) {
    const out: Record<string, string> = {};
    const body = content.replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const re = /"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)"\s*;/g;
    for (const m of body.matchAll(re)) out[unescapeStrings(m[1])] = fromPositional(unescapeStrings(m[2]), '@');
    return out;
  },
};

// ── Flutter ARB ─────────────────────────────────────────────────

/** ARB message ids must be valid Dart identifiers: "auth.login.title" → "authLoginTitle". */
function arbName(key: string): string {
  const parts = key.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const id = parts.map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1))).join('');
  return /^[A-Za-z]/.test(id) ? id : `k${id}`;
}

const arb: Format = {
  id: 'arb',
  aliases: ['flutter', 'flutter-arb'],
  label: 'Flutter ARB (lib/l10n/app_xx.arb)',
  defaultOutput: 'lib/l10n/app_{lang_}.arb',
  serialize(entries, lang) {
    const obj: Record<string, unknown> = { '@@locale': lang.replace('-', '_') };
    for (const e of renameKeys(sortEntries(entries), arbName, 'Flutter ARB')) {
      const names = placeholderOrder(e.value);
      obj[e.id] = e.value.replace(PLACEHOLDER, '{$1}');
      const meta: Record<string, unknown> = {};
      if (e.description) meta.description = e.description;
      if (names.length) meta.placeholders = Object.fromEntries(names.map(n => [n, { type: 'String' }]));
      if (Object.keys(meta).length) obj[`@${e.id}`] = meta;
    }
    return JSON.stringify(obj, null, 2) + '\n';
  },
  parse(content) {
    const obj = parseJson(content) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@')) continue;
      if (typeof v !== 'string') throw usageError(`ARB entry "${k}" is not a string.`);
      // Simple {name} placeholders → {{name}}; ICU blocks like {count, plural, …} are left as-is
      out[k] = v.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, '{{$1}}');
    }
    return out;
  },
};

// ── Registry ────────────────────────────────────────────────────

export const FORMATS: Format[] = [flatJson, nestedJson, android, ios, arb];

export function getFormat(name: string | undefined): Format {
  const wanted = (name || 'json').toLowerCase();
  const found = FORMATS.find(f => f.id === wanted || f.aliases.includes(wanted));
  if (!found) {
    throw usageError(`Unknown format "${name}".`, `Supported: ${FORMATS.map(f => f.id).join(', ')} (see "langctl formats").`);
  }
  return found;
}

/** Guess a format from a file name (used by import/push when --format is omitted). */
export function formatFromPath(path: string): Format {
  const lower = path.toLowerCase();
  if (lower.endsWith('.arb')) return arb;
  if (lower.endsWith('.xml')) return android;
  if (lower.endsWith('.strings')) return ios;
  if (lower.endsWith('.json')) return flatJson; // flat and nested JSON both parse to the same thing
  throw usageError(`Can't tell the format of "${path}" from its extension.`, 'Pass --format.');
}

/**
 * Expand a path template for one language.
 *   {lang}     pt-BR
 *   {lang_}    pt_BR          (Flutter / gettext style)
 *   {android}  values / values-pt-rBR   (default language → "values")
 */
export function expandTemplate(template: string, lang: string, defaultLang: string): string {
  const [base, region] = lang.split('-');
  const androidDir = lang === defaultLang ? 'values' : `values-${base}${region ? `-r${region.toUpperCase()}` : ''}`;
  return template
    .replace(/\{lang_\}/g, lang.replace(/-/g, '_'))
    .replace(/\{lang\}/g, lang)
    .replace(/\{android\}/g, androidDir);
}

export function templateHasLanguage(template: string): boolean {
  return /\{(lang|lang_|android)\}/.test(template);
}
