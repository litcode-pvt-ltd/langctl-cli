import chalk from 'chalk';
import { relative, resolve } from 'path';
import { loadProjectConfig } from '../core/config.js';
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
  /** legacy 0.2.x flag: --no-published-only */
  publishedOnly?: boolean;
  check?: boolean;
  dryRun?: boolean;
  requireComplete?: boolean;
}

interface ExportSnapshot {
  languages: string[];
  keys: Array<{ key: string; description: string | null; module: string | null; translations: Record<string, string> }>;
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
  const dryRun = Boolean(opts.check || opts.dryRun);

  const session = await getSession();
  const spin = spinner(`Fetching ${slug}…`);
  let project, snapshot: ExportSnapshot;
  try {
    project = await getProject(session, slug);
    snapshot = await session.api.get<ExportSnapshot>(`/orgs/${session.orgId}/projects/${project.id}/export`, {
      publishedOnly: includeDrafts ? 'false' : 'true',
      module,
    });
  } finally {
    spin.stop();
  }

  const languages = opts.languages ? splitList(opts.languages) : (cfg.languages ?? project.languages);
  assertLanguages(project, languages);
  if (languages.length > 1 && !templateHasLanguage(template)) {
    throw usageError(`Output "${relative(process.cwd(), template)}" has no {lang} placeholder, so ${languages.length} languages would overwrite each other.`,
      'Use a template like "locales/{lang}.json", or pick one language with --languages.');
  }

  const files: Array<FileResult & { translated: number; total: number }> = [];
  for (const lang of languages) {
    const entries: Entry[] = snapshot.keys
      .filter(k => typeof k.translations[lang] === 'string' && k.translations[lang] !== '')
      .map(k => ({ key: k.key, value: k.translations[lang], description: k.description }));
    const path = expandTemplate(template, lang, project.defaultLanguage);
    const status = syncFile(path, format.serialize(entries, lang), dryRun, text => format.parse(text, lang));
    files.push({ path, language: lang, status, keys: entries.length, translated: entries.length, total: snapshot.keys.length });
  }

  const changed = files.filter(f => f.status !== 'unchanged');
  const incomplete = files.filter(f => f.translated < f.total);

  if (runtime.json) {
    printJson({
      project: project.slug,
      format: format.id,
      publishedOnly: !includeDrafts,
      keys: snapshot.keys.length,
      dryRun,
      files: files.map(f => ({ ...f, path: relative(process.cwd(), f.path) })),
      changed: changed.length,
    });
  } else {
    for (const f of files) {
      const icon = f.status === 'unchanged' ? chalk.dim('=') : f.status === 'created' ? chalk.green('+') : chalk.yellow('~');
      const verb = dryRun && f.status !== 'unchanged' ? `would be ${f.status}` : f.status;
      const coverage = f.translated < f.total ? chalk.yellow(` ${f.translated}/${f.total} translated`) : '';
      log.out(`${icon} ${relative(process.cwd(), f.path)}  ${chalk.dim(verb)}${coverage}`);
    }
    log.info(chalk.dim(`${project.slug}: ${snapshot.keys.length} ${includeDrafts ? '' : 'published '}keys, ${languages.length} language(s), format ${format.id}`));
    if (snapshot.keys.length === 0 && !includeDrafts) {
      log.warn('No published keys — drafts are excluded by default. Publish keys, or pass --include-drafts.');
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
