import { CliError, ExitCode, httpError, networkError } from './errors.js';
import { requireCredentials, type Credentials } from './config.js';
import { detectCi, log } from './output.js';
import { VERSION } from '../version.js';

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
}

export class ApiClient {
  constructor(private readonly creds: Credentials) {}

  get baseUrl(): string {
    return this.creds.apiUrl;
  }

  async request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(this.creds.apiUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      'X-API-Key': this.creds.apiKey,
      'User-Agent': userAgent(),
      Accept: 'application/json',
    };
    // Only declare a JSON body when there is one — Fastify rejects an empty body with this header
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

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
        throw httpError(res.status, d?.error || d?.message, method, url.pathname);
      }
      return data as T;
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
