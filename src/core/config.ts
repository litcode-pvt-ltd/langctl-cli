import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { CliError, ExitCode, usageError } from './errors.js';

export const DEFAULT_API_URL = 'https://api.langctl.com/api/v1';

/** User-level settings stored in ~/.langctl/config.json (same path 0.2.x used). */
export interface UserConfig {
  apiKey?: string;
  organizationId?: string;
  organizationName?: string;
  apiBaseUrl?: string;
  defaultLanguage?: string;
}

export function configDir(): string {
  return process.env.LANGCTL_CONFIG_DIR ? resolve(process.env.LANGCTL_CONFIG_DIR) : join(homedir(), '.langctl');
}

// ── Profiles ───────────────────────────────────────────────────
//
// The default profile is ~/.langctl/config.json (unchanged since 0.2). Named profiles live in
// ~/.langctl/profiles/<name>.json and are selected with --profile <name> or LANGCTL_PROFILE.

const PROFILE_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/** The active profile name, or null for the default profile. */
export function activeProfile(): string | null {
  const raw = (flagOverrides.profile ?? process.env.LANGCTL_PROFILE ?? '').trim();
  if (!raw || raw === 'default') return null;
  if (!PROFILE_RE.test(raw)) {
    throw usageError(`Invalid profile name "${raw}".`, 'Use letters, digits, ".", "_" or "-" (e.g. --profile client-a).');
  }
  return raw;
}

export function profileLabel(): string {
  return activeProfile() ?? 'default';
}

export function configPath(): string {
  const profile = activeProfile();
  return profile ? join(configDir(), 'profiles', `${profile}.json`) : join(configDir(), 'config.json');
}

export function readUserConfig(): UserConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const raw = JSON.parse(readFileSync(path, 'utf-8')) as UserConfig & { __internal__?: unknown };
    delete raw.__internal__; // left behind by the 0.2.x `conf` store
    return raw;
  } catch {
    throw new CliError(`Config file ${path} is not valid JSON.`, ExitCode.Error, 'Fix or delete it, then run "langctl auth --stdin" again.');
  }
}

/** Write atomically with owner-only permissions — the file contains an API key. */
export function writeUserConfig(next: UserConfig): void {
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined && v !== ''));
  writeFileSync(tmp, JSON.stringify(clean, null, 2) + '\n', { mode: 0o600 });
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch { /* not supported on Windows */ }
}

export function clearCredentials(): boolean {
  const current = readUserConfig();
  if (!current.apiKey) return false;
  const { apiKey: _k, organizationId: _o, organizationName: _n, ...rest } = current;
  if (Object.keys(rest).length === 0) {
    try { unlinkSync(configPath()); } catch { /* already gone */ }
  } else {
    writeUserConfig(rest);
  }
  return true;
}

// ── Credentials ────────────────────────────────────────────────

export interface Credentials {
  apiKey: string;
  source: 'flag' | 'env' | 'config';
  apiUrl: string;
  /** Known without a network call only when it comes from the config file */
  organizationId?: string;
}

export const flagOverrides: { apiKey?: string; apiUrl?: string; profile?: string } = {};

export function resolveApiUrl(): string {
  return (flagOverrides.apiUrl || process.env.LANGCTL_API_URL || readUserConfig().apiBaseUrl || DEFAULT_API_URL).replace(/\/+$/, '');
}

export function resolveCredentials(): Credentials | null {
  const apiUrl = resolveApiUrl();
  if (flagOverrides.apiKey) return { apiKey: normalizeApiKey(flagOverrides.apiKey), source: 'flag', apiUrl };
  if (process.env.LANGCTL_API_KEY) return { apiKey: normalizeApiKey(process.env.LANGCTL_API_KEY), source: 'env', apiUrl };
  const cfg = readUserConfig();
  if (cfg.apiKey) return { apiKey: cfg.apiKey, source: 'config', apiUrl, organizationId: cfg.organizationId };
  return null;
}

export function requireCredentials(): Credentials {
  const creds = resolveCredentials();
  if (!creds) {
    throw new CliError('Not authenticated.', ExitCode.Auth,
      'Run "langctl auth --stdin" (or "langctl init"), or set LANGCTL_API_KEY in CI.');
  }
  return creds;
}

const KEY_RE = /^lc_[a-f0-9]{64}$/;

/** Trim whitespace/quotes that commonly sneak in from copy-paste or CI secret stores. */
export function normalizeApiKey(input: string): string {
  const key = input.trim().replace(/^['"]|['"]$/g, '').trim();
  if (!KEY_RE.test(key)) {
    throw new CliError('That does not look like a Langctl API key (expected "lc_" followed by 64 hex characters).', ExitCode.Auth,
      'Copy the key from https://app.langctl.com/organization/api-keys — it is shown only once.');
  }
  return key;
}

export function maskApiKey(key: string): string {
  return `${key.slice(0, 7)}…${key.slice(-4)}`;
}

// ── Project config (langctl.json) ──────────────────────────────

export const PROJECT_CONFIG_FILE = 'langctl.json';

export interface ProjectConfig {
  /** Project slug */
  project?: string;
  /** Export/import format id (see `langctl formats`) */
  format?: string;
  /** Path template for translation files, e.g. "src/locales/{lang}.json" */
  output?: string;
  /** Languages to pull (default: all project languages) */
  languages?: string[];
  /** Language whose file `push` uploads by default (default: project default language) */
  sourceLanguage?: string;
  /** Include unpublished (draft) keys when pulling */
  includeDrafts?: boolean;
  /** Only pull/push keys from this module */
  module?: string;
  /**
   * Key prefix for projects shared by several apps (e.g. "dashboard."): pull strips it (and skips
   * keys without it), push adds it. A prefix without a trailing separator gets a "." appended.
   */
  prefix?: string;
}

export interface LoadedProjectConfig {
  config: ProjectConfig;
  path: string;
  /** Directory containing langctl.json — relative paths in it resolve from here */
  root: string;
}

const KNOWN_KEYS = new Set(['$schema', 'project', 'format', 'output', 'languages', 'sourceLanguage', 'includeDrafts', 'module', 'prefix']);

/** Find langctl.json in the current directory or the nearest parent. */
export function loadProjectConfig(cwd = process.cwd()): LoadedProjectConfig | null {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, PROJECT_CONFIG_FILE);
    if (existsSync(candidate)) {
      let config: ProjectConfig;
      try {
        config = JSON.parse(readFileSync(candidate, 'utf-8'));
      } catch (e) {
        throw usageError(`${candidate} is not valid JSON: ${(e as Error).message}`);
      }
      const unknown = Object.keys(config).filter(k => !KNOWN_KEYS.has(k));
      if (unknown.length) {
        throw usageError(`${candidate} has unknown field(s): ${unknown.join(', ')}`,
          `Allowed: ${[...KNOWN_KEYS].filter(k => k !== '$schema').join(', ')}`);
      }
      if (config.prefix !== undefined && (typeof config.prefix !== 'string' || !config.prefix.trim())) {
        throw usageError(`${candidate}: "prefix" must be a non-empty string, e.g. "dashboard."`);
      }
      if (config.languages !== undefined && !Array.isArray(config.languages)) {
        throw usageError(`${candidate}: "languages" must be an array of language codes`);
      }
      return { config, path: candidate, root: dir };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function writeProjectConfig(path: string, config: ProjectConfig): void {
  const ordered: ProjectConfig = {
    project: config.project,
    format: config.format,
    output: config.output,
    ...(config.languages ? { languages: config.languages } : {}),
    ...(config.sourceLanguage ? { sourceLanguage: config.sourceLanguage } : {}),
    ...(config.includeDrafts ? { includeDrafts: true } : {}),
    ...(config.module ? { module: config.module } : {}),
    ...(config.prefix ? { prefix: config.prefix } : {}),
  };
  writeFileSync(path, JSON.stringify(ordered, null, 2) + '\n');
}

// ── Key prefixes ───────────────────────────────────────────────

/** "dashboard" → "dashboard."; prefixes that already end in a separator are kept as given. */
export function normalizePrefix(prefix: string | undefined): string | undefined {
  const p = prefix?.trim();
  if (!p) return undefined;
  return /[.:_/-]$/.test(p) ? p : `${p}.`;
}

/** The prefix in effect: the flag, else langctl.json's "prefix". */
export function resolvePrefix(flag: string | undefined, cfg: ProjectConfig): string | undefined {
  return normalizePrefix(flag ?? cfg.prefix);
}

/**
 * Map key names typed by a user to the names stored in langctl: with a prefix configured,
 * "common.save" and "dashboard.common.save" both mean "dashboard.common.save".
 */
export function withPrefix(name: string, prefix: string | undefined, known?: Set<string>): string {
  if (!prefix || name.startsWith(prefix)) return name;
  if (known && known.has(name) && !known.has(prefix + name)) return name;
  return prefix + name;
}
