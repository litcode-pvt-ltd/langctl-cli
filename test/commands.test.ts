import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { httpSettings, resetSession } from '../src/core/http.js';
import { CliError, ExitCode, httpError } from '../src/core/errors.js';
import { activeProfile, configPath, flagOverrides, readUserConfig, resolveCredentials, withPrefix, writeUserConfig } from '../src/core/config.js';
import { runtime } from '../src/core/output.js';
import { translateCommand } from '../src/commands/translate.js';
import { reviewCommand } from '../src/commands/review.js';
import { pullCommand } from '../src/commands/pull.js';
import { pushCommand } from '../src/commands/push.js';
import { authCommand, whoamiCommand } from '../src/commands/auth.js';
import { finishUpdateCheck, isNewer, startUpdateCheck } from '../src/core/update-check.js';

const KEY = 'lc_' + 'a'.repeat(64);
const KEY2 = 'lc_' + 'b'.repeat(64);
const ORG = '11111111-1111-1111-1111-111111111111';
const ORG2 = '22222222-2222-2222-2222-222222222222';
const PID = '33333333-3333-3333-3333-333333333333';

// ── Fake Langctl API ─────────────────────────────────────────────

interface Key { id: string; key: string; translations: Record<string, string>; module?: string | null; published: boolean; description?: string | null }
interface Hit { method: string; path: string; query: URLSearchParams; body: any }

let server: Server;
let baseUrl: string;
let hits: Hit[];
let keys: Key[];
/** Override one route: return true when handled */
let override: ((h: Hit, res: ServerResponse) => boolean | Promise<boolean>) | null;
let bulk: (items: Array<{ text: string; keyId: string }>, body: any) => any;
let exportMeta: Record<string, unknown>;
let reviewItems: any[];
let inFlight = 0;
let maxInFlight = 0;

const send = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

async function route(h: Hit, res: ServerResponse): Promise<void> {
  if (override && (await override(h, res))) return;
  const p = h.path.replace('/api/v1', '');
  let m: RegExpMatchArray | null;
  if (h.method === 'POST' && p === '/api-keys/validate') {
    const org = h.body.apiKey === KEY2 ? ORG2 : ORG;
    return send(res, 200, { valid: true, organizationId: org, scopes: ['translations:read', 'translations:write'] });
  }
  if (h.method === 'GET' && (m = p.match(/^\/orgs\/([^/]+)$/))) {
    return send(res, 200, { id: m[1], name: m[1] === ORG2 ? 'Second Org' : 'First Org', slug: m[1] === ORG2 ? 'second' : 'first', plan: 'pro' });
  }
  if (h.method === 'GET' && p.endsWith('/projects/by-slug/app')) {
    return send(res, 200, { id: PID, name: 'App', slug: 'app', languages: ['en', 'hi'], defaultLanguage: 'en' });
  }
  if (h.method === 'GET' && p.endsWith(`/projects/${PID}/keys`)) {
    const module = h.query.get('module');
    const list = keys.filter(k => !module || k.module === module);
    const page = Number(h.query.get('page') || 1);
    const size = Number(h.query.get('pageSize') || 100);
    return send(res, 200, {
      data: list.slice((page - 1) * size, page * size),
      pagination: { page, pageSize: size, total: list.length, totalPages: Math.max(1, Math.ceil(list.length / size)) },
    });
  }
  if (h.method === 'POST' && p.endsWith('/translate/bulk')) {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(r => setTimeout(r, 15));
    inFlight--;
    const out = bulk(h.body.items, h.body);
    if (out && out.__status) return send(res, out.__status, out.body);
    return send(res, 200, out);
  }
  if (h.method === 'PATCH' && (m = p.match(/\/keys\/([^/]+)\/translations\/([^/]+)$/))) {
    const k = keys.find(x => x.id === m![1])!;
    k.translations[m[2]] = h.body.value;
    return send(res, 200, k);
  }
  if (h.method === 'GET' && p.endsWith(`/projects/${PID}/export`)) {
    const language = h.query.get('language');
    if (language) {
      return send(res, 200, { translations: Object.fromEntries(keys.filter(k => k.translations[language] !== undefined).map(k => [k.key, k.translations[language]])) });
    }
    return send(res, 200, {
      languages: ['en', 'hi'],
      keys: keys.map(k => ({ key: k.key, description: k.description ?? null, module: k.module ?? null, translations: k.translations })),
      metadata: exportMeta,
    });
  }
  if (h.method === 'POST' && p.endsWith(`/projects/${PID}/import`)) {
    return send(res, 200, { created: Object.keys(h.body.translations).length, updated: 0, skipped: 0 });
  }
  if (h.method === 'GET' && p.endsWith(`/projects/${PID}/review`)) {
    return send(res, 200, { total: reviewItems.length, items: reviewItems });
  }
  // Fastify's default for unknown routes
  send(res, 404, { message: `Route ${h.method}:${h.path} not found`, error: 'Not Found', statusCode: 404 });
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://x');
      const h: Hit = { method: req.method!, path: url.pathname, query: url.searchParams, body: raw ? JSON.parse(raw) : undefined };
      hits.push(h);
      void route(h, res);
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1`;
});
afterAll(() => server.close());

// ── Harness ──────────────────────────────────────────────────────

const env = { ...process.env };
const cwd = process.cwd();
let dir: string;
let stdout: string;
let stderr: string;

beforeEach(() => {
  hits = [];
  override = null;
  exportMeta = {};
  reviewItems = [];
  inFlight = 0;
  maxInFlight = 0;
  keys = [];
  bulk = items => ({ results: items.map(i => ({ keyId: i.keyId, translatedText: `HI:${i.text}` })), failed: [], provider: 'platform', usage: { used: items.length, limit: 1000 } });
  dir = mkdtempSync(join(tmpdir(), 'langctl-cmd-'));
  process.chdir(dir);
  for (const k of ['CI', 'GITHUB_ACTIONS', 'LANGCTL_PROFILE', 'LANGCTL_UPDATE_CHECK']) delete process.env[k];
  process.env.LANGCTL_CONFIG_DIR = join(dir, 'cfg');
  process.env.LANGCTL_API_KEY = KEY;
  process.env.LANGCTL_API_URL = baseUrl;
  process.env.LANGCTL_NO_CACHE = '1';
  process.env.NO_COLOR = '1';
  Object.assign(runtime, { json: false, quiet: false, verbose: false, yes: false });
  Object.assign(flagOverrides, { apiKey: undefined, apiUrl: undefined, profile: undefined });
  httpSettings.retries = 1;
  httpSettings.timeoutMs = 3000;
  resetSession();
  process.exitCode = undefined;
  stdout = '';
  stderr = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((c: any) => { stdout += String(c); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((c: any) => { stderr += String(c); return true; });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.chdir(cwd);
  process.env = { ...env };
  process.exitCode = undefined;
});

const mkKeys = (n: number, prefix = 'k', module?: string): Key[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    key: `${prefix}.${String(i).padStart(4, '0')}`,
    translations: { en: `Text ${i}` },
    module: module ?? null,
    published: true,
  }));

async function expectCliError(p: Promise<unknown>, code: number): Promise<CliError> {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(CliError); expect((e as CliError).exitCode).toBe(code); return e as CliError; }
  throw new Error('expected rejection');
}

const bulkHits = () => hits.filter(h => h.path.endsWith('/translate/bulk'));
const patchHits = () => hits.filter(h => h.method === 'PATCH');

// ── translate ────────────────────────────────────────────────────

describe('translate', () => {
  const mixed = (items: Array<{ text: string; keyId: string }>) => ({
    results: items.map(i => i.text === '{h}h' ? { keyId: i.keyId, sourceText: i.text, translatedText: null, error: 'empty_result' }
      : i.text === '98860 41022' ? { keyId: i.keyId, sourceText: i.text, translatedText: i.text, copied: true }
      : { keyId: i.keyId, sourceText: i.text, translatedText: `HI:${i.text}` }),
    failed: items.filter(i => i.text === '{h}h').map(i => ({ keyId: i.keyId, sourceText: i.text, error: 'empty_result' })),
    provider: 'platform',
    usage: { used: 10, limit: 1000 },
  });

  beforeEach(() => {
    keys = mkKeys(5, 'mobile');
    keys[1].translations.en = '{h}h';
    keys[2].translations.en = '98860 41022';
  });

  it('mixed batch on an older server (no `saved`): saves per key, reports failures, exits 8', async () => {
    bulk = mixed;
    await translateCommand('app', { to: 'hi' });
    expect(bulkHits()).toHaveLength(1);
    expect(bulkHits()[0].body).toMatchObject({ save: true, overwrite: false, targetLang: 'hi', sourceLang: 'en' });
    expect(patchHits()).toHaveLength(4); // fallback path: every result except the null one
    expect(process.exitCode).toBe(ExitCode.Partial);
    // per-key lines on stdout; summary and failures on stderr (not lost when stdout is piped)
    expect(stdout).toContain('mobile.0000  HI:Text 0');
    expect(stdout).not.toContain('Translated');
    expect(stderr).toContain('Translated 3, copied 1 unchanged, failed 1');
    expect(stderr).toMatch(/mobile\.0001\s+"\{h\}h"\s+\(empty_result\)/);
    expect(stderr).toContain('Translating 5/5…');
  });

  it('--json includes failed keys with their source text and keeps one JSON document on stdout', async () => {
    bulk = mixed;
    runtime.json = true;
    await translateCommand('app', { to: 'hi' });
    const out = JSON.parse(stdout);
    expect(out.failed).toEqual([{ language: 'hi', key: 'mobile.0001', sourceText: '{h}h', error: 'empty_result' }]);
    expect(out.counts).toEqual({ translated: 3, copied: 1, failed: 1, notAttempted: 0 });
    expect(out.exitCode).toBe(ExitCode.Partial);
    expect(process.exitCode).toBe(ExitCode.Partial);
  });

  it('uses server-side saving when the response has a numeric `saved` (no PATCH)', async () => {
    bulk = items => ({ ...mixed(items), saved: items.length - 1 });
    await translateCommand('app', { to: 'hi' });
    expect(patchHits()).toHaveLength(0);
    expect(stderr).toContain('Translated 3, copied 1 unchanged, failed 1');
    expect(process.exitCode).toBe(ExitCode.Partial);
  });

  it('exits 0 when everything translates', async () => {
    bulk = items => ({ results: items.map(i => ({ keyId: i.keyId, translatedText: `HI:${i.text}`, saved: true })), failed: [], saved: items.length });
    await translateCommand('app', { to: 'hi' });
    expect(process.exitCode).toBeUndefined();
    expect(stderr).toContain('Translated 5, copied 0 unchanged, failed 0');
  });

  it('batches 100 strings per request with up to 3 in flight', async () => {
    keys = mkKeys(450);
    bulk = items => ({ results: items.map(i => ({ keyId: i.keyId, translatedText: 'x' })), saved: items.length });
    await translateCommand('app', { to: 'hi' });
    expect(bulkHits().map(h => h.body.items.length)).toEqual([100, 100, 100, 100, 50]);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    // non-TTY progress: a line every ~10%, ending at the total
    const lines = stderr.split('\n').filter(l => l.startsWith('Translating '));
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(lines.length).toBeLessThanOrEqual(11);
    expect(lines.at(-1)).toBe('Translating 450/450…');
  });

  it('falls back to 50-string batches on servers that reject 100', async () => {
    keys = mkKeys(120);
    bulk = items => items.length > 50
      ? { __status: 400, body: { error: 'Validation error' } }
      : { results: items.map(i => ({ keyId: i.keyId, translatedText: 'x' })), saved: items.length };
    await translateCommand('app', { to: 'hi' });
    const ok = bulkHits().filter(h => h.body.items.length <= 50);
    expect(ok.reduce((n, h) => n + h.body.items.length, 0)).toBe(120);
    expect(process.exitCode).toBeUndefined();
  });

  it('an API failure is never exit 2: 502 → 5, other 4xx → 1, with a summary first', async () => {
    bulk = () => ({ __status: 502, body: { error: 'DeepL unavailable' } });
    await expectCliError(translateCommand('app', { to: 'hi' }), ExitCode.Network);
    expect(stderr).toMatch(/not attempted/);
    resetSession();
    bulk = () => ({ __status: 422, body: { error: 'Translation returned incomplete results' } });
    const e = await expectCliError(translateCommand('app', { to: 'hi' }), ExitCode.Error);
    expect(e.message).toMatch(/incomplete/);
  });

  it('accepts --keys with or without the langctl.json prefix', async () => {
    writeFileSync(join(dir, 'langctl.json'), JSON.stringify({ project: 'app', prefix: 'mobile' }));
    bulk = items => ({ results: items.map(i => ({ keyId: i.keyId, translatedText: 'x' })), saved: items.length });
    await translateCommand(undefined, { to: 'hi', keys: '0000,mobile.0003', dryRun: true });
    expect(stderr + stdout).toMatch(/hi\s+2/);
  });
});

// ── review ───────────────────────────────────────────────────────

describe('review --module', () => {
  it('filters by module (resolving keys when the review list has no module field)', async () => {
    keys = [...mkKeys(2, 'web', 'web'), ...mkKeys(2, 'mobile', 'mobile').map((k, i) => ({ ...k, id: `m-${i}` }))];
    reviewItems = keys.map(k => ({ keyId: k.id, key: k.key, published: true, language: 'hi', text: 'x' }));
    runtime.json = true;
    await reviewCommand('app', { module: 'mobile' });
    const out = JSON.parse(stdout);
    expect(out.items.map((i: any) => i.key)).toEqual(['mobile.0000', 'mobile.0001']);
  });
});

// ── prefixes ─────────────────────────────────────────────────────

describe('key prefixes', () => {
  it('withPrefix maps names typed with or without the prefix', () => {
    expect(withPrefix('common.save', 'web.')).toBe('web.common.save');
    expect(withPrefix('web.common.save', 'web.')).toBe('web.common.save');
    expect(withPrefix('other.key', 'web.', new Set(['other.key']))).toBe('other.key');
  });

  it('pull --strip-prefix keeps only prefixed keys, strips them, and counts the skipped ones', async () => {
    keys = [
      { id: '1', key: 'dashboard.common.save', translations: { en: 'Save', hi: 'सेव' }, published: true },
      { id: '2', key: 'dashboard.status.paid', translations: { en: 'Paid' }, published: true },
      { id: '3', key: 'web.common.save', translations: { en: 'Save' }, published: true },
      { id: '4', key: 'legacy', translations: { en: 'Old' }, published: true },
    ];
    await pullCommand('app', { output: 'out/{lang}.json', stripPrefix: 'dashboard' });
    expect(JSON.parse(readFileSync(join(dir, 'out/en.json'), 'utf-8'))).toEqual({ 'common.save': 'Save', 'status.paid': 'Paid' });
    expect(JSON.parse(readFileSync(join(dir, 'out/hi.json'), 'utf-8'))).toEqual({ 'common.save': 'सेव' });
    expect(stderr).toContain('2 key(s) without the prefix "dashboard." were skipped');
  });

  it('push --prefix adds the prefix (and langctl.json "prefix" works for both directions)', async () => {
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ 'common.save': 'Save' }));
    await pushCommand('app', { input: '{lang}.json', prefix: 'web.' });
    const imp = hits.find(h => h.path.endsWith('/import'))!;
    expect(imp.body.translations).toEqual({ 'web.common.save': 'Save' });

    hits = [];
    resetSession();
    writeFileSync(join(dir, 'langctl.json'), JSON.stringify({ project: 'app', output: '{lang}.json', prefix: 'web.' }));
    await pushCommand(undefined, {});
    expect(hits.find(h => h.path.endsWith('/import'))!.body.translations).toEqual({ 'web.common.save': 'Save' });
  });
});

// ── push descriptions & paths ───────────────────────────────────

describe('push', () => {
  it('--descriptions sends rich values only for keys in that file', async () => {
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ 'common.book': 'Book', 'common.open': 'Open' }));
    writeFileSync(join(dir, 'desc.json'), JSON.stringify({ 'common.book': 'Verb: book an appointment', 'nope.key': 'unused' }));
    await pushCommand('app', { input: '{lang}.json', descriptions: 'desc.json', overwrite: true });
    const imp = hits.find(h => h.path.endsWith('/import'))!;
    expect(imp.body).toMatchObject({ language: 'en', overwriteExisting: true });
    expect(imp.body.translations).toEqual({
      'common.book': { value: 'Book', description: 'Verb: book an appointment' },
      'common.open': 'Open',
    });
    expect(stderr).toContain('1 description(s) in desc.json match no key');
  });

  it('reads rich JSON input files { key: { value, description } }', async () => {
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ a: { value: 'A', description: 'about A' }, b: 'B' }));
    await pushCommand('app', { input: '{lang}.json' });
    expect(hits.find(h => h.path.endsWith('/import'))!.body.translations).toEqual({ a: { value: 'A', description: 'about A' }, b: 'B' });
    expect(stderr).toContain('pass --overwrite'); // descriptions on existing keys need --overwrite
  });

  it('prints input paths as given: absolute stays absolute, relative stays relative', async () => {
    const abs = join(mkdtempSync(join(tmpdir(), 'langctl-abs-')), '{lang}.json');
    writeFileSync(abs.replace('{lang}', 'en'), JSON.stringify({ a: 'A' }));
    await pushCommand('app', { input: abs });
    expect(stdout).toContain(abs.replace('{lang}', 'en'));
    stdout = '';
    resetSession();
    writeFileSync(join(dir, 'en.json'), JSON.stringify({ a: 'A' }));
    await pushCommand('app', { input: './{lang}.json' });
    expect(stdout).toMatch(/^en {2}en\.json /m);
  });
});

// ── pull notices ─────────────────────────────────────────────────

describe('pull: unreviewed AI translations', () => {
  beforeEach(() => {
    keys = mkKeys(3);
    exportMeta = { unreviewedSkipped: 3 };
  });

  it('says so on stderr even with --json', async () => {
    runtime.json = true;
    await pullCommand('app', { output: 'l/{lang}.json' });
    expect(JSON.parse(stdout).unreviewedSkipped).toBe(3);
    expect(stderr).toContain('3 AI translation(s) awaiting review were left out');
  });

  it('is silent with --quiet', async () => {
    runtime.quiet = true;
    await pullCommand('app', { output: 'l/{lang}.json' });
    expect(stderr).not.toContain('awaiting review');
  });

  it('explains an empty language as "awaiting review"', async () => {
    await pullCommand('app', { output: 'l/{lang}.json' });
    expect(stdout).toMatch(/hi\.json .*0 strings: 3 awaiting review \(use langctl review \/ --include-unreviewed\)/);
  });
});

// ── auth & profiles ──────────────────────────────────────────────

describe('auth', () => {
  beforeEach(() => { delete process.env.LANGCTL_API_KEY; });

  it('refuses to replace a key for a different org without confirmation, keeps the old key', async () => {
    writeUserConfig({ apiKey: KEY, organizationId: ORG, organizationName: 'First Org' });
    const e = await expectCliError(authCommand(KEY2, {}), ExitCode.Usage);
    expect(e.message).toMatch(/Refusing to replace the stored key for "First Org"/);
    expect(e.hint).toMatch(/--yes.*--profile/s);
    expect(readUserConfig().apiKey).toBe(KEY);
  });

  it('replaces with --yes, and re-auth for the same org needs no confirmation', async () => {
    writeUserConfig({ apiKey: KEY, organizationId: ORG, organizationName: 'First Org' });
    await authCommand(KEY, {});
    expect(readUserConfig().organizationId).toBe(ORG);
    runtime.yes = true;
    await authCommand(KEY2, {});
    expect(readUserConfig()).toMatchObject({ apiKey: KEY2, organizationId: ORG2 });
  });

  it('profiles: --profile / LANGCTL_PROFILE select ~/.langctl/profiles/<name>.json; default stays config.json', async () => {
    const cfgDir = process.env.LANGCTL_CONFIG_DIR!;
    expect(configPath()).toBe(join(cfgDir, 'config.json'));
    writeUserConfig({ apiKey: KEY, organizationId: ORG, organizationName: 'First Org' });

    process.env.LANGCTL_PROFILE = 'client-b';
    expect(configPath()).toBe(join(cfgDir, 'profiles', 'client-b.json'));
    expect(resolveCredentials()).toBeNull(); // separate store
    await authCommand(KEY2, {}); // a new profile: no guard, nothing replaced
    expect(existsSync(join(cfgDir, 'profiles', 'client-b.json'))).toBe(true);
    expect(resolveCredentials()?.apiKey).toBe(KEY2);

    flagOverrides.profile = 'default'; // flag beats env
    expect(activeProfile()).toBeNull();
    expect(resolveCredentials()?.apiKey).toBe(KEY);

    flagOverrides.profile = '../evil';
    expect(() => configPath()).toThrow(/Invalid profile name/);
  });

  it('whoami shows the profile', async () => {
    process.env.LANGCTL_PROFILE = 'work';
    mkdirSync(join(process.env.LANGCTL_CONFIG_DIR!, 'profiles'), { recursive: true });
    writeUserConfig({ apiKey: KEY2, organizationId: ORG2 });
    runtime.json = true;
    await whoamiCommand();
    const out = JSON.parse(stdout);
    expect(out).toMatchObject({ profile: 'work', keySource: join(process.env.LANGCTL_CONFIG_DIR!, 'profiles', 'work.json') });
    expect(out.organization.name).toBe('Second Org');
  });
});

// ── update check ─────────────────────────────────────────────────

describe('update check', () => {
  const registry = (version: string) => vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify({ version }), { status: 200, headers: { 'content-type': 'application/json' } })));

  it('compares versions', () => {
    expect(isNewer('0.5.1', '0.5.0')).toBe(true);
    expect(isNewer('1.0.0', '0.9.9')).toBe(true);
    expect(isNewer('0.5.0', '0.5.0')).toBe(false);
    expect(isNewer('0.4.9', '0.5.0')).toBe(false);
  });

  it('checks at most once per 24h and prints the upgrade command', async () => {
    const fetchMock = registry('99.0.0');
    vi.stubGlobal('fetch', fetchMock);
    const now = Date.now();
    await finishUpdateCheck(startUpdateCheck(now));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('https://registry.npmjs.org/langctl/latest');
    expect(stderr).toMatch(/langctl 99\.0\.0 is available \(you have \d+\.\d+\.\d+\): npm i -g langctl@latest/);
    await finishUpdateCheck(startUpdateCheck(now + 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await finishUpdateCheck(startUpdateCheck(now + 25 * 3600_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stays quiet when up to date, and is off in CI / --json / --quiet unless LANGCTL_UPDATE_CHECK=1', async () => {
    const fetchMock = registry('0.0.1');
    vi.stubGlobal('fetch', fetchMock);
    await finishUpdateCheck(startUpdateCheck(1));
    expect(stderr).toBe('');

    process.env.CI = 'true';
    await finishUpdateCheck(startUpdateCheck(2 * 86_400_000));
    runtime.json = true;
    await finishUpdateCheck(startUpdateCheck(4 * 86_400_000));
    delete process.env.CI;
    runtime.json = false;
    runtime.quiet = true;
    await finishUpdateCheck(startUpdateCheck(6 * 86_400_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    process.env.CI = 'true';
    process.env.LANGCTL_UPDATE_CHECK = '1';
    await finishUpdateCheck(startUpdateCheck(8 * 86_400_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    process.env.LANGCTL_UPDATE_CHECK = '0';
    runtime.quiet = false;
    delete process.env.CI;
    await finishUpdateCheck(startUpdateCheck(10 * 86_400_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never waits long on a slow registry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => new Promise(() => { /* hang */ })));
    const t = Date.now();
    await finishUpdateCheck(startUpdateCheck());
    expect(Date.now() - t).toBeLessThan(2500);
    expect(stderr).toBe('');
  });
});

// ── retired endpoints ───────────────────────────────────────────

describe('upgrade hint for unknown/retired API paths', () => {
  it('maps a Fastify route 404 and 410 Gone to an "upgrade your CLI" hint', async () => {
    expect(httpError(404, 'Route GET:/api/v1/old not found', 'GET', '/api/v1/old').hint).toMatch(/npm i -g langctl@latest/);
    expect(httpError(410, 'Gone', 'POST', '/x').hint).toMatch(/npm i -g langctl@latest/);
    expect(httpError(404, 'Project not found', 'GET', '/x').hint).toBeUndefined();
    override = (h, res) => { if (h.path.endsWith('/review')) { send(res, 404, { message: `Route GET:${h.path} not found`, error: 'Not Found' }); return true; } return false; };
    const e = await expectCliError(reviewCommand('app', {}), ExitCode.NotFound);
    expect(e.hint).toMatch(/too old/);
  });
});
