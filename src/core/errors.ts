/**
 * Exit codes are part of the CLI's contract — CI scripts branch on them. Keep in sync with README.
 */
export const ExitCode = {
  Ok: 0,
  Error: 1,
  Usage: 2,
  Auth: 3,
  NotFound: 4,
  Network: 5,
  Limit: 6,
  Drift: 7,
} as const;

export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: ExitCodeValue = ExitCode.Error,
    public readonly hint?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export const usageError = (message: string, hint?: string) => new CliError(message, ExitCode.Usage, hint);
export const notFoundError = (message: string, hint?: string) => new CliError(message, ExitCode.NotFound, hint);

/** Map an HTTP error response from the API to a CliError with the right exit code and a useful hint. */
export function httpError(status: number, serverMessage: string | undefined, method: string, path: string): CliError {
  const msg = serverMessage || `HTTP ${status}`;
  if (status === 401) {
    return new CliError('Your API key is invalid or has been revoked.', ExitCode.Auth,
      'Create a new key at https://app.langctl.com/organization/api-keys and run "langctl auth --stdin", or set LANGCTL_API_KEY.', status);
  }
  if (status === 403) {
    if (/limit/i.test(msg)) return new CliError(msg, ExitCode.Limit, 'See your plan limits with "langctl org plan".', status);
    if (/scope/i.test(msg)) {
      return new CliError(msg, ExitCode.Auth, 'Create an API key with the required permission at https://app.langctl.com/organization/api-keys.', status);
    }
    return new CliError(msg, ExitCode.Auth, undefined, status);
  }
  if (status === 404) return new CliError(msg, ExitCode.NotFound, undefined, status);
  if (status === 400 || status === 409 || status === 422) return new CliError(msg, ExitCode.Usage, undefined, status);
  if (status === 429) return new CliError('Rate limited by the Langctl API.', ExitCode.Network, 'Wait a moment and retry.', status);
  if (status >= 500) {
    return new CliError(`The Langctl API failed (${status}) on ${method} ${path}.`, ExitCode.Network,
      'This is usually temporary — retry in a minute. If it persists, contact hello@langctl.com.', status);
  }
  return new CliError(msg, ExitCode.Error, undefined, status);
}

/** Map a fetch/network failure (no HTTP response) to a CliError. */
export function networkError(err: unknown, baseUrl: string, timeoutMs: number): CliError {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = e?.cause?.code;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return new CliError(`Request to ${baseUrl} timed out after ${Math.round(timeoutMs / 1000)}s.`, ExitCode.Network,
      'Check your connection, or raise the limit with --timeout <seconds> / LANGCTL_TIMEOUT.');
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return new CliError(`Cannot resolve ${new URL(baseUrl).host}.`, ExitCode.Network, 'Check your network/DNS, or LANGCTL_API_URL if you set it.');
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') {
    return new CliError(`Could not connect to ${baseUrl} (${code}).`, ExitCode.Network, 'Check your network, proxy, or LANGCTL_API_URL.');
  }
  if (code === 'CERT_HAS_EXPIRED' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return new CliError(`TLS error talking to ${baseUrl} (${code}).`, ExitCode.Network,
      'If you are behind a corporate proxy, set NODE_EXTRA_CA_CERTS to its CA bundle.');
  }
  return new CliError(`Network error: ${e?.cause?.message || e?.message || String(err)}`, ExitCode.Network);
}
