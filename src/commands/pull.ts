import chalk from 'chalk';
import { isAbsolute, relative, resolve } from 'path';
import { loadProjectConfig, resolvePrefix } from '../core/config.js';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { syncFile, type FileResult } from '../core/files.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, spinner } from '../core/output.js';
import { assertLanguages, getProject, projectSlugFrom } from '../core/project.js';
import { expandTemplate, getFormat, templateHasLanguage, type Entry } from '../formats/index.js';

export interface PullOptions {
  languages?: string;
  format?: string;
  output?: string;
  dir?: string;
  module?: string;
  includeDrafts?: boolean;
  /** also ship AI translations nobody has reviewed yet */
  includeUnreviewed?: boolean;
  /** legacy 0.2.x flag: --no-published-only */
  publishedOnly?: boolean;
  check?: boolean;
  dryRun?: boolean;
  requireComplete?: boolean;
  /** only keys starting with this prefix, written without it */
  stripPrefix?: string;
}

interface ExportSnapshot {
  languages: string[];
  keys: Array<{ key: string; description: string | null; module: string | null; translations: Record<string, string> }>;
  /** unreviewedByLanguage: optional per-language breakdown (newer APIs) */
  metadata?: { unreviewedSkipped?: number; unreviewedByLanguage?: Record<string, number> };
}

/** Show a path the way the user gave it: absolute stays absolute, otherwise relative to the cwd. */
export function displayPath(path: string, asGiven: string | undefined): string {
  if (asGiven && isAbsolute(asGiven)) return path;
  return relative(process.cwd(), path) || path;
}

export async function pullCommand(projectArg: string | undefined, opts: PullOptions): Promise<void> {
  const loaded = loadProjectConfig();
  const cfg = loaded?.config ?? {};
  const slug = projectSlugFrom(projectArg);
  const format = getFormat(opts.format ?? cfg.format);

  // Paths from flags are relative to the cwd; paths from langctl.json are relative to that file
  let template: string;
  if (opts.output) template = resolve(opts.output);
  else if (opts.dir) template = resolve(opts.dir, format.defaultOutput);
  else if (cfg.output && loaded) template = resolve(loaded.root, cfg.output);
  else template = resolve(format.defaultOutput);

  const includeDrafts = Boolean(opts.includeDrafts || opts.publishedOnly === false || cfg.includeDrafts);
  const module = opts.module ?? cfg.module;
  const prefix = resolvePrefix(opts.stripPrefix, cfg);
  const dryRun = Boolean(opts.check || opts.dryRun);
  const show = (p: string) => displayPath(p, opts.output ?? opts.dir);

  const session = await getSession();
  const spin = spinner(`Fetching ${slug}…`);
  let project, snapshot: ExportSnapshot;
  try {
    project = await getProject(session, slug);
    // ETag-cached: unchanged translations come back as a tiny 304 and the saved snapshot is reused
    ({ data: snapshot } = await session.api.getCached<ExportSnapshot>(`/orgs/${session.orgId}/projects/${project.id}/export`, {
      publishedOnly: includeDrafts ? 'false' : 'true',
      includeUnreviewed: opts.includeUnreviewed ? 'true' : undefined,
      module,
    }));
  } finally {
    spin.stop();
  }

  const languages = opts.languages ? splitList(opts.languages) : (cfg.languages ?? project.languages);
  assertLanguages(project, languages);
  if (languages.length > 1 && !templateHasLanguage(template)) {
    throw usageError(`Output "${show(template)}" has no {lang} placeholder, so ${languages.length} languages would overwrite each other.`,
      'Use a template like "locales/{lang}.json", or pick one language with --languages.');
  }

  // Prefix (multi-app projects): keep only "dashboard.*" keys and write them as "*"
  const keys = prefix
    ? snapshot.keys.filter(k => k.key.startsWith(prefix) && k.key.length > prefix.length).map(k => ({ ...k, key: k.key.slice(prefix.length) }))
    : snapshot.keys;
  const prefixSkipped = snapshot.keys.length - keys.length;
  const unreviewed = snapshot.metadata?.unreviewedSkipped ?? 0;
  const unreviewedByLanguage = snapshot.metadata?.unreviewedByLanguage;

  const files: Array<FileResult & { translated: number; total: number }> = [];
  for (const lang of languages) {
    const entries: Entry[] = keys
      .filter(k => typeof k.translations[lang] === 'string' && k.translations[lang] !== '')
      .map(k => ({ key: k.key, value: k.translations[lang], description: k.description }));
    const path = expandTemplate(template, lang, project.defaultLanguage);
    const status = syncFile(path, format.serialize(entries, lang), dryRun, text => format.parse(text, lang));
    files.push({ path, language: lang, status, keys: entries.length, translated: entries.length, total: keys.length });
  }

  const changed = files.filter(f => f.status !== 'unchanged');
  const incomplete = files.filter(f => f.translated < f.total);

  if (runtime.json) {
    printJson({
      project: project.slug,
      format: format.id,
      publishedOnly: !includeDrafts,
      keys: keys.length,
      dryRun,
      files: files.map(f => ({ ...f, path: show(f.path) })),
      changed: changed.length,
      unreviewedSkipped: unreviewed,
      ...(unreviewedByLanguage ? { unreviewedByLanguage } : {}),
      ...(prefix ? { prefix, prefixSkipped } : {}),
    });
  } else {
    for (const f of files) {
      const icon = f.status === 'unchanged' ? chalk.dim('=') : f.status === 'created' ? chalk.green('+') : chalk.yellow('~');
      const verb = dryRun && f.status !== 'unchanged' ? `would be ${f.status}` : f.status;
      let coverage = f.translated < f.total ? chalk.yellow(` ${f.translated}/${f.total} translated`) : '';
      // An empty language with held-back AI drafts is "awaiting review", not "nothing translated"
      const waiting = unreviewedByLanguage ? unreviewedByLanguage[f.language] ?? 0 : unreviewed;
      if (f.translated === 0 && f.total > 0 && waiting > 0 && f.language !== project.defaultLanguage) {
        // Without a per-language breakdown (or with a prefix) the count may include other languages/keys
        const approx = prefix || (!unreviewedByLanguage && languages.filter(l => l !== project.defaultLanguage).length > 1) ? 'up to ' : '';
        coverage = chalk.yellow(` 0 strings: ${approx}${waiting} awaiting review (use langctl review / --include-unreviewed)`);
      }
      log.out(`${icon} ${show(f.path)}  ${chalk.dim(verb)}${coverage}`);
    }
    log.info(chalk.dim(`${project.slug}: ${keys.length} ${includeDrafts ? '' : 'published '}keys${prefix ? ` with prefix "${prefix}"` : ''}, ${languages.length} language(s), format ${format.id}`));
    if (snapshot.keys.length === 0 && !includeDrafts) {
      log.warn('No published keys — drafts are excluded by default. Publish keys, or pass --include-drafts.');
    }
  }
  // Notices go to stderr in every mode (also --json), so a held-back draft is never mistaken for "not translated"
  if (!runtime.quiet) {
    if (unreviewed > 0) {
      log.warn(`${unreviewed} AI translation(s) awaiting review were left out (your app falls back to ${project.defaultLanguage} for them). Review with "langctl review ${project.slug}", or pass --include-unreviewed.`);
    }
    if (prefixSkipped > 0) {
      log.warn(`${prefixSkipped} key(s) without the prefix "${prefix}" were skipped.`);
    }
  }

  if (opts.requireComplete && incomplete.length) {
    throw new CliError(`Missing translations: ${incomplete.map(f => `${f.language} (${f.total - f.translated} missing)`).join(', ')}`, ExitCode.Error);
  }
  if (opts.check && changed.length) {
    throw new CliError(`${changed.length} translation file(s) are out of date.`, ExitCode.Drift, 'Run "langctl pull" and commit the result.');
  }
}

export function splitList(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean);
}
