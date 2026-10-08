import chalk from 'chalk';
import {
  activeProfile, clearCredentials, configPath, maskApiKey, normalizeApiKey, profileLabel, readUserConfig, resolveApiUrl, resolveCredentials,
  writeUserConfig,
} from '../core/config.js';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { ApiClient, validateKey } from '../core/http.js';
import { isInteractive, log, printJson, runtime, spinner } from '../core/output.js';
import { confirm, password, readStdin } from '../core/prompts.js';

interface AuthOptions {
  stdin?: boolean;
}

/** Validate a key against the API and store it in the user config. Returns the organization. */
export async function saveApiKey(rawKey: string): Promise<{ id: string; name: string; plan: string; scopes: string[] }> {
  const apiKey = normalizeApiKey(rawKey);
  const apiUrl = resolveApiUrl();
  const api = new ApiClient({ apiKey, apiUrl, source: 'flag' });
  const spin = spinner('Verifying API key…');
  try {
    const info = await validateKey(api, apiKey);
    if (!info) {
      throw new CliError('This API key is invalid or has been revoked.', ExitCode.Auth,
        'Create a new key at https://app.langctl.com/organization/api-keys.');
    }
    const org = await api.get<{ id: string; name: string; plan: string }>(`/orgs/${info.organizationId}`);
    spin.stop();
    await guardOrgSwitch(readUserConfig(), org);
    writeUserConfig({ ...readUserConfig(), apiKey, organizationId: org.id, organizationName: org.name });
    return { ...org, scopes: info.scopes };
  } finally {
    spin.stop();
  }
}

/**
 * Storing a key for a different organization would silently drop the old one (0.4 did exactly
 * that). Ask first; --yes confirms; without a terminal, refuse and point at profiles.
 */
async function guardOrgSwitch(current: { apiKey?: string; organizationId?: string; organizationName?: string }, next: { id: string; name: string }): Promise<void> {
  if (!current.apiKey || !current.organizationId || current.organizationId === next.id) return;
  const profile = profileLabel();
  const was = current.organizationName ? `"${current.organizationName}"` : current.organizationId;
  const where = activeProfile() ? `profile "${profile}"` : 'the default profile';
  log.warn(`${where} holds a key for ${was}; this key belongs to a different organization ("${next.name}").`);
  const suggestion = `To keep both, store the new key in its own profile: langctl auth --profile <name> --stdin (then use --profile <name> or LANGCTL_PROFILE=<name>).`;
  let ok: boolean;
  try {
    ok = await confirm(`Replace the stored key for ${was} with one for "${next.name}"?`);
  } catch (err) {
    if (err instanceof CliError) {
      throw new CliError(`Refusing to replace the stored key for ${was} (${where}) with a key for "${next.name}" without confirmation.`,
        ExitCode.Usage, `Re-run with --yes to replace it. ${suggestion}`);
    }
    throw err;
  }
  if (!ok) throw new CliError('Cancelled — the stored key was not changed.', ExitCode.Error, suggestion);
}

export async function authCommand(apiKeyArg: string | undefined, opts: AuthOptions): Promise<void> {
  let key = apiKeyArg;
  if (opts.stdin) {
    key = (await readStdin()).trim();
    if (!key) throw usageError('No API key received on stdin.', 'Example: echo "$LANGCTL_API_KEY" | langctl auth --stdin');
  } else if (key) {
    log.warn('Passing the key as an argument stores it in your shell history. Prefer "langctl auth --stdin" or the interactive prompt.');
  } else if (isInteractive()) {
    key = await password('Paste your API key');
  } else {
    throw usageError('No API key given.', 'Use "langctl auth --stdin" (e.g. echo "$KEY" | langctl auth --stdin), or set LANGCTL_API_KEY instead of storing a key in CI.');
  }

  const org = await saveApiKey(key!);
  if (runtime.json) {
    printJson({ authenticated: true, organization: { id: org.id, name: org.name, plan: org.plan }, scopes: org.scopes, profile: profileLabel(), configPath: configPath() });
    return;
  }
  log.success(`Authenticated to ${chalk.bold(org.name)} (${org.plan} plan)${activeProfile() ? ` — profile "${profileLabel()}"` : ''}`);
  log.info(chalk.dim(`Key saved to ${configPath()} (readable only by you). Scopes: ${org.scopes.join(', ')}`));
}

export function logoutCommand(): void {
  const removed = clearCredentials();
  if (runtime.json) return printJson({ loggedOut: removed });
  log.success(removed ? 'Logged out — stored API key removed.' : 'No stored API key — nothing to do.');
  if (process.env.LANGCTL_API_KEY) log.warn('LANGCTL_API_KEY is still set in your environment and will keep being used.');
}

export async function whoamiCommand(): Promise<void> {
  const creds = resolveCredentials();
  if (!creds) {
    if (runtime.json) printJson({ authenticated: false, profile: profileLabel(), apiUrl: resolveApiUrl() });
    throw new CliError('Not authenticated.', ExitCode.Auth, 'Run "langctl auth --stdin", or set LANGCTL_API_KEY.');
  }
  const api = new ApiClient(creds);
  const started = Date.now();
  const info = await validateKey(api, creds.apiKey);
  const latency = Date.now() - started;
  if (!info) {
    throw new CliError(`The API key from ${sourceLabel(creds.source)} is invalid or revoked.`, ExitCode.Auth,
      'Create a new key at https://app.langctl.com/organization/api-keys.');
  }
  const org = await api.get<{ id: string; name: string; slug: string; plan: string }>(`/orgs/${info.organizationId}`);
  const data = {
    authenticated: true,
    organization: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
    key: maskApiKey(creds.apiKey),
    keySource: sourceLabel(creds.source),
    profile: profileLabel(),
    scopes: info.scopes,
    apiUrl: creds.apiUrl,
    latencyMs: latency,
  };
  if (runtime.json) return printJson(data);
  log.out(`${chalk.bold(org.name)} ${chalk.dim(`(${org.slug}, ${org.plan} plan)`)}`);
  log.out(`  key      ${data.key}  ${chalk.dim(`from ${data.keySource}`)}`);
  log.out(`  profile  ${data.profile}${creds.source !== 'config' ? chalk.dim(` (not used: key from ${data.keySource})`) : ''}`);
  log.out(`  scopes   ${info.scopes.join(', ')}`);
  log.out(`  api      ${creds.apiUrl}  ${chalk.dim(`${latency}ms`)}`);
}

function sourceLabel(source: 'flag' | 'env' | 'config'): string {
  return source === 'env' ? 'LANGCTL_API_KEY' : source === 'flag' ? '--api-key' : configPath();
}
