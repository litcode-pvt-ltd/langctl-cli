import chalk from 'chalk';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { configDir } from './config.js';
import { detectCi, runtime } from './output.js';
import { VERSION } from '../version.js';

/**
 * "A newer langctl is available" notice. At most one registry lookup per 24 hours (timestamp in
 * ~/.langctl/update-check.json), never blocks a command for more than ~1.5s, and is off in
 * --json / --quiet / CI unless LANGCTL_UPDATE_CHECK=1. LANGCTL_UPDATE_CHECK=0 turns it off.
 */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPDATE_CHECK_TIMEOUT_MS = 1500;
const REGISTRY_URL = 'https://registry.npmjs.org/langctl/latest';

interface State { checkedAt?: number; latest?: string }

function statePath(): string {
  return join(configDir(), 'update-check.json');
}

function readState(): State {
  try { return JSON.parse(readFileSync(statePath(), 'utf-8')) as State; } catch { return {}; }
}

function writeState(state: State): void {
  try {
    mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    writeFileSync(statePath(), JSON.stringify(state) + '\n', { mode: 0o600 });
  } catch { /* read-only home: never fail a command over this */ }
}

export function updateCheckEnabled(): boolean {
  const flag = String(process.env.LANGCTL_UPDATE_CHECK ?? '').toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(flag)) return false;
  if (['1', 'true', 'yes', 'on'].includes(flag)) return true;
  return !runtime.json && !runtime.quiet && !detectCi();
}

/** Compare x.y.z versions (pre-release tags ignored). */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('-')[0].split('.').map(n => Number(n) || 0);
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function updateMessage(latest: string, current = VERSION): string {
  return `langctl ${latest} is available (you have ${current}): npm i -g langctl@latest`;
}

/**
 * Start the check (call early, runs alongside the command). Resolves to the notice to print,
 * or null. Never rejects.
 */
export function startUpdateCheck(now = Date.now()): Promise<string | null> {
  if (!updateCheckEnabled()) return Promise.resolve(null);
  const state = readState();
  if (state.checkedAt && now - state.checkedAt < UPDATE_CHECK_INTERVAL_MS) return Promise.resolve(null);
  // Record the attempt up front, so being offline doesn't mean a lookup on every run
  writeState({ ...state, checkedAt: now });
  return (async () => {
    try {
      const res = await fetch(REGISTRY_URL, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(UPDATE_CHECK_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const latest = ((await res.json()) as { version?: unknown }).version;
      if (typeof latest !== 'string') return null;
      writeState({ checkedAt: now, latest });
      return isNewer(latest, VERSION) ? updateMessage(latest) : null;
    } catch {
      return null;
    }
  })();
}

/** Wait (bounded) for the check and print the notice to stderr. */
export async function finishUpdateCheck(pending: Promise<string | null> | null): Promise<void> {
  if (!pending) return;
  const timeout = new Promise<null>(r => setTimeout(() => r(null), UPDATE_CHECK_TIMEOUT_MS).unref());
  const message = await Promise.race([pending, timeout]);
  if (message) process.stderr.write(`${chalk.yellow('update:')} ${message}\n`);
}
