import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ApiClient } from '../src/core/http.js';

const creds = { apiKey: 'lc_' + 'a'.repeat(64), apiUrl: 'https://api.example.test/api/v1', source: 'env' } as never;

function reply(status: number, body: unknown, etag?: string): Response {
  return new Response(status === 304 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(etag ? { etag } : {}) },
  });
}

describe('ApiClient.getCached', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'langctl-cache-'));
    process.env.LANGCTL_CONFIG_DIR = dir;
    delete process.env.LANGCTL_NO_CACHE;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.LANGCTL_CONFIG_DIR;
  });

  it('stores the ETag and reuses the body on 304', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(200, { keys: [1] }, '"v1"'))
      .mockResolvedValueOnce(reply(304, null, '"v1"'));
    vi.stubGlobal('fetch', fetchMock);
    const api = new ApiClient(creds);

    const first = await api.getCached<{ keys: number[] }>('/export', { lang: 'en' });
    expect(first).toEqual({ data: { keys: [1] }, fromCache: false });

    const second = await api.getCached<{ keys: number[] }>('/export', { lang: 'en' });
    expect(second).toEqual({ data: { keys: [1] }, fromCache: true });
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBe('"v1"');
  });

  it('caches per query string', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(200, { ok: true }, '"x"')));
    vi.stubGlobal('fetch', fetchMock);
    const api = new ApiClient(creds);
    await api.getCached('/export', { lang: 'en' });
    await api.getCached('/export', { lang: 'fr' });
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBeUndefined();
  });

  it('sends no If-None-Match when LANGCTL_NO_CACHE is set', async () => {
    process.env.LANGCTL_NO_CACHE = '1';
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(reply(200, { ok: true }, '"x"')));
    vi.stubGlobal('fetch', fetchMock);
    const api = new ApiClient(creds);
    await api.getCached('/export');
    await api.getCached('/export');
    expect(fetchMock.mock.calls[1][1].headers['If-None-Match']).toBeUndefined();
  });

  it('refetches unconditionally if a 304 arrives without a cached body', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(reply(304, null))
      .mockResolvedValueOnce(reply(200, { fresh: true }, '"v2"'));
    vi.stubGlobal('fetch', fetchMock);
    // Seed nothing: first call has no ETag to send, but simulate a misbehaving proxy answering 304
    const api = new ApiClient(creds);
    const res = await api.getCached('/export');
    expect(res).toEqual({ data: { fresh: true }, fromCache: false });
  });
});
