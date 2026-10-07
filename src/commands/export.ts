import { pullCommand } from './pull.js';

interface ExportOptions {
  language?: string;
  languages?: string;
  format?: string;
  output?: string;
  module?: string;
  includeUnpublished?: boolean;
  includeDrafts?: boolean;
}

/**
 * `langctl export` — 0.2.x-compatible entry point. Same engine as `pull`, but
 * aimed at one-off exports (`-l es -o es.json`); `pull` is the CI/repo workflow.
 */
export async function exportCommand(projectArg: string | undefined, opts: ExportOptions): Promise<void> {
  await pullCommand(projectArg, {
    languages: opts.languages ?? opts.language,
    format: opts.format,
    output: opts.output,
    module: opts.module,
    includeDrafts: opts.includeDrafts || opts.includeUnpublished,
  });
}
