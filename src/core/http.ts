import { CliError, ExitCode, httpError, networkError } from './errors.js';
import { requireCredentials, type Credentials } from './config.js';
import { detectCi, log } from './output.js';
import { VERSION } from '../version.js';
import { cacheEnabled, cacheKey, readCache, writeCache } from './cache.js';

export const httpSettings = {
  timeoutMs: Number(process.env.LANGCTL_TIMEOUT || 30) * 1000,
  retries: 3,
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function userAgent(): string {
  const ci = detectCi();
  return `langctl/${VERSION} (node ${process.versions.node}; ${process.platform}${ci ? `; ci=${ci}` : ''})`;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Safe to repeat after a dropped connection / 5xx (GETs, upserts, idempotent bulk ops) */
  idempotent?: boolean;
  /** Conditional GET: send If-None-Match; a 304 resolves with notModified=true */
  ifNoneMatch?: string;
}

interface RawResponse<T> { status: number; data: T; etag: string | null; notModified: boolean }

export class ApiClient {
  constructor(private readonly creds: Credentials) {}

  get baseUrl(): string {
    return this.creds.apiUrl;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    return (await this.send<T>(method, this.buildUrl(path, opts.query), opts)).data;
  }

  private buildUrl(path: string, query: RequestOptions['query']): URL {
    const url = new URL(this.creds.apiUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    return url;
  }

  /**
   * GET with an ETag cache: if the server reports the resource unchanged (304) the saved body is
   * reused. Used for exports, which CI fetches over and over while translations rarely change.
   */
  async getCached<T>(path: string, query?: RequestOptions['query']): Promise<{ data: T; fromCache: boolean }> {
    const url = this.buildUrl(path, query);
    if (!cacheEnabled()) return { data: (await this.send<T>('GET', url, {})).data, fromCache: false };
    const key = cacheKey(this.creds.apiUrl, this.creds.apiKey, url.toString());
    const cached = readCache<T>(key);
    const res = await this.send<T>('GET', url, { ifNoneMatch: cached?.etag });
    if (res.notModified && cached) {
      log.debug(`cache hit for ${url.pathname} (${cached.etag})`);
      return { data: cached.data, fromCache: true };
    }
    if (res.notModified) {
      // 304 without a cached body (cache wiped mid-run): fetch unconditionally
      return { data: (await this.send<T>('GET', url, {})).data, fromCache: false };
    }
    if (res.etag) writeCache(key, res.etag, res.data);
    return { data: res.data, fromCache: false };
  }

  private async send<T>(method: string, url: URL, opts: RequestOptions): Promise<RawResponse<T>> {
    const headers: Record<string, string> = {
      'X-API-Key': this.creds.apiKey,
      'User-Agent': userAgent(),
      Accept: 'application/json',
    };
    // Only declare a JSON body when there is one — Fastify rejects an empty body with this header
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.ifNoneMatch) headers['If-None-Match'] = opts.ifNoneMatch;

    const idempotent = opts.idempotent ?? (method === 'GET');
    const attempts = idempotent ? httpSettings.retries : 1;

    for (let attempt = 1; ; attempt++) {
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(httpSettings.timeoutMs),
        });
      } catch (err) {
        const mapped = networkError(err, this.creds.apiUrl, httpSettings.timeoutMs);
        log.debug(`${method} ${url.pathname} → ${mapped.message} (${Date.now() - started}ms, attempt ${attempt}/${attempts})`);
        if (attempt < attempts) { await sleep(backoff(attempt)); continue; }
        throw mapped;
      }
      log.debug(`${method} ${url.pathname}${url.search} → ${res.status} (${Date.now() - started}ms)`);
      if (res.status === 304) {
        return { status: 304, data: undefined as T, etag: res.headers.get('etag'), notModified: true };
      }

      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
      if (retryable && attempt < attempts) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : backoff(attempt));
        continue;
      }

      const text = await res.text();
      let data: unknown = undefined;
      if (text) {
        try { data = JSON.parse(text); } catch {
          if (!res.ok) throw httpError(res.status, undefined, method, url.pathname);
          throw new CliError(`Unexpected non-JSON response from ${url.host} (${res.status}).`, ExitCode.Network,
            'Is LANGCTL_API_URL pointing at the Langctl API (…/api/v1)?');
        }
      }
      if (!res.ok) {
        const d = data as { error?: string; message?: string } | undefined;
        // Fastify's own 404 ("Route GET:/… not found") is in `message`; ours are in `error`
        const routeMessage = typeof d?.message === 'string' && /^Route /.test(d.message) ? d.message : undefined;
        throw httpError(res.status, routeMessage || d?.error || d?.message, method, url.pathname);
      }
      return { status: res.status, data: data as T, etag: res.headers.get('etag'), notModified: false };
    }
  }

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.request<T>('GET', path, { query });
  }
  post<T>(path: string, body?: unknown, idempotent = false): Promise<T> {
    return this.request<T>('POST', path, { body, idempotent });
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body, idempotent: true });
  }
  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path, { idempotent: true });
  }
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
}

// ── Authenticated session (client + organization) ─────────────

export interface KeyInfo {
  organizationId: string;
  scopes: string[];
}

export interface Session {
  api: ApiClient;
  orgId: string;
  creds: Credentials;
  scopes?: string[];
}

/** Look up which org a key belongs to (and its scopes). Returns null if the key is invalid/revoked. */
export async function validateKey(api: ApiClient, apiKey: string): Promise<KeyInfo | null> {
  const res = await api.request<{ valid: boolean; organizationId?: string; scopes?: string[] }>(
    'POST', '/api-keys/validate', { body: { apiKey }, idempotent: true });
  return res.valid && res.organizationId ? { organizationId: res.organizationId, scopes: res.scopes ?? [] } : null;
}

let cached: Session | null = null;

/** Forget the cached session (tests; switching keys within one process). */
export function resetSession(): void {
  cached = null;
}

export async function getSession(): Promise<Session> {
  if (cached) return cached;
  const creds = requireCredentials();
  const api = new ApiClient(creds);
  if (creds.organizationId) {
    cached = { api, orgId: creds.organizationId, creds };
    return cached;
  }
  // Env/flag key: resolve the org from the key itself, so CI needs no config file
  const info = await validateKey(api, creds.apiKey);
  if (!info) {
    throw new CliError(`The API key from ${creds.source === 'env' ? 'LANGCTL_API_KEY' : '--api-key'} is invalid or revoked.`, ExitCode.Auth,
      'Create a new key at https://app.langctl.com/organization/api-keys.');
  }
  cached = { api, orgId: info.organizationId, creds, scopes: info.scopes };
  return cached;
}
