import { createInterface } from 'readline';
import { Writable } from 'stream';
import { isInteractive, runtime } from './output.js';
import { usageError } from './errors.js';

/**
 * Tiny prompts on node:readline (replaces inquirer). They are only ever shown at an
 * interactive terminal; in CI a missing answer is a usage error, never a hang.
 */

function ask(question: string, { hidden = false } = {}): Promise<string> {
  let muted = false;
  const output = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stderr.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  return new Promise((resolve, reject) => {
    rl.question(question, answer => {
      rl.close();
      if (hidden) process.stderr.write('\n');
      resolve(answer.trim());
    });
    rl.on('SIGINT', () => { rl.close(); process.stderr.write('\n'); reject(usageError('Cancelled.')); });
    muted = hidden;
  });
}

export async function input(question: string, fallback?: string): Promise<string> {
  const answer = await ask(`${question}${fallback ? ` (${fallback})` : ''}: `);
  return answer || fallback || '';
}

export async function password(question: string): Promise<string> {
  return ask(`${question}: `, { hidden: true });
}

/**
 * Ask before something destructive. `--yes` skips the question; without a TTY and
 * without `--yes` we refuse instead of guessing.
 */
export async function confirm(question: string, flagName = '--yes'): Promise<boolean> {
  if (runtime.yes) return true;
  if (!isInteractive()) {
    throw usageError(`Refusing to ${question.replace(/\?$/, '').toLowerCase()} without confirmation.`, `Re-run with ${flagName} to confirm in non-interactive environments.`);
  }
  const answer = (await ask(`${question} [y/N] `)).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

/** Read all of stdin (for `auth --stdin`). */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}
