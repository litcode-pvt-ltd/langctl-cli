import { createHash } from 'crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { configDir } from './config.js';

/**
 * Small on-disk cache for conditional GETs (ETag / If-None-Match). When the server says
 * "304 Not Modified" the CLI reuses the saved body, so repeated pulls cost almost nothing.
 * Lives in the config dir (~/.langctl/cache); disable with LANGCTL_NO_CACHE=1.
 */
const MAX_ENTRIES = 40;

interface CacheEntry<T> { etag: string; data: T; savedAt: string }

function cacheDir(): string {
  return join(configDir(), 'cache');
}

export function cacheEnabled(): boolean {
  return !['1', 'true', 'yes'].includes(String(process.env.LANGCTL_NO_CACHE || '').toLowerCase());
}

/** Cache key covers the API, the key (orgs/scopes differ per key) and the full request URL. */
export function cacheKey(apiUrl: string, apiKey: string, url: string): string {
  const keyId = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return createHash('sha256').update(`${apiUrl}\n${keyId}\n${url}`).digest('hex').slice(0, 32);
}

export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const entry = JSON.parse(readFileSync(join(cacheDir(), `${key}.json`), 'utf8')) as CacheEntry<T>;
    return entry && typeof entry.etag === 'string' ? entry : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, etag: string, data: T): void {
  try {
    const dir = cacheDir();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, `${key}.json`), JSON.stringify({ etag, data, savedAt: new Date().toISOString() }), { mode: 0o600 });
    prune(dir);
  } catch {
    // A cache that can't be written (read-only home, full disk) must never fail a command
  }
}

function prune(dir: string): void {
  const files = readdirSync(dir).filter(f => f.endsWith('.json'))
    .map(f => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const { f } of files.slice(MAX_ENTRIES)) unlinkSync(join(dir, f));
}
