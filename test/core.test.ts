import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { mkdtempSync, mkdirSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiClient, httpSettings } from '../src/core/http.js';
import { CliError, ExitCode } from '../src/core/errors.js';
import {
  configPath, flagOverrides, loadProjectConfig, normalizeApiKey, readUserConfig, resolveCredentials, writeUserConfig,
} from '../src/core/config.js';

const KEY = 'lc_' + 'a'.repeat(64);

// ── Mock API ─────────────────────────────────────────────────────

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;
let server: Server;
let baseUrl: string;
let handler: Handler;
let hits: Array<{ method: string; url: string; headers: IncomingMessage['headers']; body: string }>;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      hits.push({ method: req.method!, url: req.url!, headers: req.headers, body });
      handler(req, res, body);
    });
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
});
afterAll(() => server.close());
beforeEach(() => {
  hits = [];
  httpSettings.retries = 3;
  httpSettings.timeoutMs = 2000;
});

const json = (res: ServerResponse, status: number, data: unknown) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};
const client = () => new ApiClient({ apiKey: KEY, apiUrl: baseUrl, source: 'env' });
async function expectExit(p: Promise<unknown>, code: number): Promise<CliError> {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(CliError); expect((e as CliError).exitCode).toBe(code); return e as CliError; }
  throw new Error('expected rejection');
}

describe('ApiClient', () => {
  it('sends the key, a user agent, and no Content-Type without a body', async () => {
    handler = (_q, res) => json(res, 200, { ok: true });
    await client().get('/x');
    await client().post('/y');
    expect(hits[0].headers['x-api-key']).toBe(KEY);
    expect(hits[0].headers['user-agent']).toMatch(/^langctl\/\d+\.\d+\.\d+ \(node /);
    expect(hits[1].headers['content-type']).toBeUndefined();
  });

  it('retries GETs on 503 and succeeds', async () => {
    let n = 0;
    handler = (_q, res) => (++n < 3 ? json(res, 503, { error: 'busy' }) : json(res, 200, { ok: n }));
    await expect(client().get('/x')).resolves.toEqual({ ok: 3 });
    expect(hits).toHaveLength(3);
  });

  it('honors Retry-After on 429', async () => {
    let n = 0;
    handler = (_q, res) => {
      if (++n === 1) { res.writeHead(429, { 'Retry-After': '1' }); res.end('{}'); } else json(res, 200, {});
    };
    const t = Date.now();
    await client().get('/x');
    expect(Date.now() - t).toBeGreaterThanOrEqual(900);
  });

  it('does not retry non-idempotent POSTs', async () => {
    handler = (_q, res) => json(res, 503, { error: 'busy' });
    await expectExit(client().post('/create', { a: 1 }), ExitCode.Network);
    expect(hits).toHaveLength(1);
  });

  it('maps statuses to exit codes', async () => {
    handler = (q, res) => {
      const status = Number(q.url!.split('/').pop());
      const msg = { 401: 'Invalid', 403: 'API key missing required scope: org:admin', 404: 'Project not found', 409: 'exists', 500: 'boom' }[status];
      json(res, status === 4031 ? 403 : status, { error: status === 4031 ? 'Project limit reached (1). Upgrade.' : msg });
    };
    httpSettings.retries = 1;
    await expectExit(client().get('/401'), ExitCode.Auth);
    await expectExit(client().get('/403'), ExitCode.Auth);
    await expectExit(client().get('/4031'), ExitCode.Limit);
    await expectExit(client().get('/404'), ExitCode.NotFound);
    await expectExit(client().get('/409'), ExitCode.Usage);
    await expectExit(client().get('/500'), ExitCode.Network);
  });

  it('times out with a network exit code', async () => {
    handler = () => { /* never respond */ };
    httpSettings.timeoutMs = 200;
    httpSettings.retries = 1;
    const e = await expectExit(client().get('/slow'), ExitCode.Network);
    expect(e.message).toMatch(/timed out/);
  });

  it('explains connection failures', async () => {
    const c = new ApiClient({ apiKey: KEY, apiUrl: 'http://127.0.0.1:9/api/v1', source: 'env' });
    httpSettings.retries = 1;
    const e = await expectExit(c.get('/x'), ExitCode.Network);
    expect(e.message).toMatch(/Could not connect|Network error/);
  });

  it('flags a non-JSON 200 (wrong LANGCTL_API_URL)', async () => {
    handler = (_q, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>'); };
    const e = await expectExit(client().get('/x'), ExitCode.Network);
    expect(e.hint).toMatch(/LANGCTL_API_URL/);
  });
});

// ── Config ───────────────────────────────────────────────────────

describe('config', () => {
  let dir: string;
  const env = { ...process.env };
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'langctl-test-'));
    process.env.LANGCTL_CONFIG_DIR = join(dir, 'cfg');
    delete process.env.LANGCTL_API_KEY;
    delete process.env.LANGCTL_API_URL;
    flagOverrides.apiKey = undefined;
    flagOverrides.apiUrl = undefined;
  });
  afterEach(() => { process.env = { ...env }; });

  it('normalizes keys pasted with whitespace/quotes, rejects garbage', () => {
    expect(normalizeApiKey(`  "${KEY}"\n`)).toBe(KEY);
    expect(() => normalizeApiKey('lc_123')).toThrow(/does not look like/);
  });

  it('writes the credentials file with 0600 permissions', () => {
    writeUserConfig({ apiKey: KEY, organizationId: 'org' });
    expect(readUserConfig().apiKey).toBe(KEY);
    if (process.platform !== 'win32') expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  it('precedence: --api-key > LANGCTL_API_KEY > config file', () => {
    writeUserConfig({ apiKey: KEY, organizationId: 'org' });
    expect(resolveCredentials()?.source).toBe('config');
    process.env.LANGCTL_API_KEY = 'lc_' + 'b'.repeat(64);
    expect(resolveCredentials()?.source).toBe('env');
    flagOverrides.apiKey = 'lc_' + 'c'.repeat(64);
    expect(resolveCredentials()?.apiKey).toBe('lc_' + 'c'.repeat(64));
  });

  it('works in CI with only env vars (no config file)', () => {
    process.env.LANGCTL_API_KEY = KEY;
    process.env.LANGCTL_API_URL = 'https://example.test/api/v1/';
    const c = resolveCredentials()!;
    expect(c.apiUrl).toBe('https://example.test/api/v1');
    expect(c.organizationId).toBeUndefined();
  });

  it('ignores the 0.2.x conf store internals', () => {
    mkdirSync(join(dir, 'cfg'), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ __internal__: { migrations: {} }, apiKey: KEY }));
    expect(readUserConfig()).toEqual({ apiKey: KEY });
  });

  it('finds langctl.json in a parent directory and validates fields', () => {
    writeFileSync(join(dir, 'langctl.json'), JSON.stringify({ project: 'web', output: 'locales/{lang}.json' }));
    mkdirSync(join(dir, 'a', 'b'), { recursive: true });
    const loaded = loadProjectConfig(join(dir, 'a', 'b'))!;
    expect(loaded.config.project).toBe('web');
    expect(loaded.root).toBe(dir);
    writeFileSync(join(dir, 'langctl.json'), JSON.stringify({ projct: 'typo' }));
    expect(() => loadProjectConfig(dir)).toThrow(/unknown field\(s\): projct/);
  });
});

describe('syncFile', () => {
  it('treats a reformatted file with the same translations as unchanged and keeps it as-is', async () => {
    const { syncFile } = await import('../src/core/files.js');
    const { getFormat } = await import('../src/formats/index.js');
    const { readFileSync } = await import('fs');
    const f = getFormat('json');
    const path = join(mkdtempSync(join(tmpdir(), 'langctl-sync-')), 'en.json');
    writeFileSync(path, '{"b":"2",   "a":"1"}');
    const generated = f.serialize([{ key: 'a', value: '1' }, { key: 'b', value: '2' }], 'en');
    expect(syncFile(path, generated, false, t => f.parse(t, 'en'))).toBe('unchanged');
    expect(readFileSync(path, 'utf-8')).toBe('{"b":"2",   "a":"1"}');
    expect(syncFile(path, f.serialize([{ key: 'a', value: 'changed' }], 'en'), true, t => f.parse(t, 'en'))).toBe('updated');
  });
});
