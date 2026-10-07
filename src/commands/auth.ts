import chalk from 'chalk';
import {
  clearCredentials, configPath, maskApiKey, normalizeApiKey, readUserConfig, resolveApiUrl, resolveCredentials, writeUserConfig,
} from '../core/config.js';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { ApiClient, validateKey } from '../core/http.js';
import { isInteractive, log, printJson, runtime, spinner } from '../core/output.js';
import { password, readStdin } from '../core/prompts.js';

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
    writeUserConfig({ ...readUserConfig(), apiKey, organizationId: org.id, organizationName: org.name });
    return { ...org, scopes: info.scopes };
  } finally {
    spin.stop();
  }
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
    printJson({ authenticated: true, organization: { id: org.id, name: org.name, plan: org.plan }, scopes: org.scopes, configPath: configPath() });
    return;
  }
  log.success(`Authenticated to ${chalk.bold(org.name)} (${org.plan} plan)`);
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
    if (runtime.json) printJson({ authenticated: false, apiUrl: resolveApiUrl() });
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
    scopes: info.scopes,
    apiUrl: creds.apiUrl,
    latencyMs: latency,
  };
  if (runtime.json) return printJson(data);
  log.out(`${chalk.bold(org.name)} ${chalk.dim(`(${org.slug}, ${org.plan} plan)`)}`);
  log.out(`  key      ${data.key}  ${chalk.dim(`from ${data.keySource}`)}`);
  log.out(`  scopes   ${info.scopes.join(', ')}`);
  log.out(`  api      ${creds.apiUrl}  ${chalk.dim(`${latency}ms`)}`);
}

function sourceLabel(source: 'flag' | 'env' | 'config'): string {
  return source === 'env' ? 'LANGCTL_API_KEY' : source === 'flag' ? '--api-key' : configPath();
}
