import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';

export type FileStatus = 'created' | 'updated' | 'unchanged';

export interface FileResult {
  path: string;
  language: string;
  status: FileStatus;
  keys: number;
}

/**
 * Write a file only if its content changed (atomic temp-file + rename).
 * With `dryRun`, report what would happen without touching disk (used by --check / --dry-run).
 */
export function syncFile(
  path: string,
  content: string,
  dryRun: boolean,
  /** Parse function of the file's format: if the existing file holds the same translations, leave it alone */
  parse?: (text: string) => Record<string, string>,
): FileStatus {
  const exists = existsSync(path);
  if (exists) {
    const current = readFileSync(path, 'utf-8');
    if (current === content) return 'unchanged';
    // A hand-edited file (other key order, indentation, no trailing newline) with the same
    // translations is not drift — keep the user's formatting and don't fail `pull --check`
    if (parse && sameTranslations(current, content, parse)) return 'unchanged';
  }
  if (!dryRun) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.langctl-${process.pid}.tmp`;
    writeFileSync(tmp, content, 'utf-8');
    renameSync(tmp, path);
  }
  return exists ? 'updated' : 'created';
}

function sameTranslations(a: string, b: string, parse: (text: string) => Record<string, string>): boolean {
  try {
    const x = parse(a);
    const y = parse(b);
    const kx = Object.keys(x);
    return kx.length === Object.keys(y).length && kx.every(k => x[k] === y[k]);
  } catch {
    return false; // unparseable existing file → rewrite it
  }
}
