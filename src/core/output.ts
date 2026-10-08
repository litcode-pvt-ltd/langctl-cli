import chalk from 'chalk';

/**
 * Process-wide output settings, set once from global flags in index.ts.
 *
 * Contract: command *results* go to stdout (and only JSON when --json is set);
 * progress, warnings and errors go to stderr. That keeps `langctl ... --json | jq`
 * and `$(langctl ...)` reliable in CI.
 */
export const runtime = {
  json: false,
  quiet: false,
  verbose: false,
  yes: false,
};

const ciEnv = ['CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'BUILDKITE', 'CIRCLECI', 'JENKINS_URL', 'TF_BUILD', 'BITBUCKET_BUILD_NUMBER'];

export function detectCi(): string | null {
  for (const name of ciEnv) {
    const value = process.env[name];
    if (value && value !== 'false' && value !== '0') return name === 'CI' ? 'ci' : name.toLowerCase();
  }
  return null;
}

/** True only when a human is at an interactive terminal (prompts and spinners allowed). */
export function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY) && !detectCi() && !runtime.json;
}

const write = (stream: NodeJS.WriteStream, line: string) => stream.write(line + '\n');

export const log = {
  /** Human-readable result line (stdout). Suppressed in --json mode — print JSON with `printJson` instead. */
  out(line = ''): void {
    if (!runtime.json) write(process.stdout, line);
  },
  info(line: string): void {
    if (!runtime.quiet && !runtime.json) write(process.stderr, line);
  },
  success(line: string): void {
    if (!runtime.quiet && !runtime.json) write(process.stderr, `${chalk.green('✔')} ${line}`);
  },
  warn(line: string): void {
    write(process.stderr, `${chalk.yellow('warning:')} ${line}`);
  },
  error(line: string, hint?: string): void {
    write(process.stderr, `${chalk.red('error:')} ${line}`);
    if (hint) write(process.stderr, `${chalk.dim('hint:')} ${hint}`);
  },
  debug(line: string): void {
    if (runtime.verbose) write(process.stderr, chalk.dim(`[debug] ${line}`));
  },
};

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

export interface Spinner {
  text: string;
  stop(): void;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Progress indicator that only animates for humans at a terminal; elsewhere (CI, pipes,
 * --json, --quiet) it is a no-op. Deliberately not `ora`: ora touches stdin/cursor state and
 * froze the CLI under emulated terminals (`script`, `docker -t`, some CI runners). This
 * writes to stderr only, and its timer is unref'd so it can never keep the process alive.
 */
export function spinner(text: string): Spinner {
  if (!isInteractive() || runtime.quiet || runtime.verbose) return { text, stop() {} };
  let i = 0;
  const state = { text };
  const render = () => process.stderr.write(`\r\x1b[2K${chalk.cyan(FRAMES[i++ % FRAMES.length])} ${state.text}`);
  render();
  const timer = setInterval(render, 80);
  timer.unref();
  return {
    get text() { return state.text; },
    set text(t: string) { state.text = t; },
    stop() {
      clearInterval(timer);
      process.stderr.write('\r\x1b[2K');
    },
  };
}

export interface Progress {
  /** Report `done` of `total` processed */
  update(done: number): void;
  /** Print a result line on stdout without garbling the spinner */
  out(line: string): void;
  stop(): void;
}

/**
 * Counter for long operations: "Translating 312/889…". At a terminal it is a spinner line; in CI
 * and pipes (where a spinner is invisible) it prints a plain stderr line every ~10%.
 */
export function progress(label: string, total: number): Progress {
  const text = (n: number) => `${label} ${n}/${total}…`;
  if (isInteractive() && !runtime.quiet && !runtime.verbose) {
    const spin = spinner(text(0));
    return {
      update(n) { spin.text = text(n); },
      out(line) {
        if (runtime.json) return;
        process.stderr.write('\r\x1b[2K');
        process.stdout.write(line + '\n');
      },
      stop() { spin.stop(); },
    };
  }
  const step = Math.max(1, Math.ceil(total / 10));
  let next = step;
  let last = -1;
  return {
    update(n) {
      if (runtime.quiet || runtime.json || total < 1 || n === last) return;
      if (n >= next || n === total) {
        process.stderr.write(text(n) + '\n');
        last = n;
        while (next <= n) next += step;
      }
    },
    out(line) { log.out(line); },
    stop() {},
  };
}

/** Minimal aligned table for human output. */
export function table(rows: string[][], header?: string[]): void {
  const all = header ? [header, ...rows] : rows;
  const widths = all[0]?.map((_, i) => Math.max(...all.map(r => stripAnsi(r[i] ?? '').length))) ?? [];
  const fmt = (r: string[]) => r.map((c, i) => (i === r.length - 1 ? c : c + ' '.repeat(widths[i] - stripAnsi(c).length))).join('  ');
  if (header) log.out(chalk.bold(fmt(header)));
  rows.forEach(r => log.out(fmt(r)));
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}
