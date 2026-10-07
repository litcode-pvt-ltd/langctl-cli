import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { relative, resolve } from 'path';
import { loadProjectConfig } from '../core/config.js';
import { notFoundError, usageError } from '../core/errors.js';
import { getSession, type Session } from '../core/http.js';
import { log, printJson, runtime, spinner } from '../core/output.js';
import { assertLanguages, getProject, projectSlugFrom, type Project } from '../core/project.js';
import { expandTemplate, formatFromPath, getFormat, templateHasLanguage, type Format } from '../formats/index.js';
import { splitList } from './pull.js';

export interface PushOptions {
  languages?: string;
  format?: string;
  input?: string;
  module?: string;
  overwrite?: boolean;
  publish?: boolean;
  dryRun?: boolean;
}

export interface UploadResult {
  language: string;
  file: string;
  keys: number;
  created: number;
  updated: number;
  unchanged: number;
  published?: number;
}

const CHUNK = 1000; // stay well under the API's 1 MB request body limit

/** Upload one language's translations. Shared by `push` and the single-file `import`. */
export async function uploadTranslations(
  session: Session,
  project: Project,
  language: string,
  translations: Record<string, string>,
  opts: { overwrite?: boolean; publish?: boolean; module?: string; dryRun?: boolean },
): Promise<Omit<UploadResult, 'file'>> {
  const entries = Object.entries(translations);
  const result = { language, keys: entries.length, created: 0, updated: 0, unchanged: 0, published: undefined as number | undefined };
  if (entries.length === 0) return result;

  if (opts.dryRun) {
    // Compare against the server, including drafts, without writing anything
    const snap = await session.api.get<{ translations: Record<string, string> }>(
      `/orgs/${session.orgId}/projects/${project.id}/export`, { language, publishedOnly: 'false' });
    const all = await session.api.get<{ keys: Array<{ key: string }> }>(
      `/orgs/${session.orgId}/projects/${project.id}/export`, { publishedOnly: 'false' });
    const existingKeys = new Set(all.keys.map(k => k.key));
    for (const [key, value] of entries) {
      if (!existingKeys.has(key)) result.created++;
      else if (snap.translations[key] === value) result.unchanged++;
      else if (opts.overwrite || snap.translations[key] === undefined) result.updated++;
      else result.unchanged++;
    }
    return result;
  }

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = Object.fromEntries(entries.slice(i, i + CHUNK));
    // Import is an upsert, so retrying after a dropped connection is safe
    const res = await session.api.post<{ created: number; updated: number; skipped: number }>(
      `/orgs/${session.orgId}/projects/${project.id}/import`,
      { language, translations: chunk, overwriteExisting: Boolean(opts.overwrite), module: opts.module },
      true,
    );
    result.created += res.created;
    result.updated += res.updated;
    result.unchanged += res.skipped;
  }

  if (opts.publish) {
    let published = 0;
    const names = entries.map(([k]) => k);
    for (let i = 0; i < names.length; i += 5000) {
      const res = await session.api.post<{ count: number }>(
        `/orgs/${session.orgId}/projects/${project.id}/keys/bulk-publish`, { keys: names.slice(i, i + 5000), published: true }, true);
      published += res.count;
    }
    result.published = published;
  }
  return result;
}

export function readTranslationFile(path: string, format: Format | undefined, lang: string): Record<string, string> {
  if (!existsSync(path)) throw notFoundError(`File not found: ${relative(process.cwd(), path) || path}`);
  const fmt = format ?? formatFromPath(path);
  const translations = fmt.parse(readFileSync(path, 'utf-8'), lang);
  if ((fmt.id === 'android' || fmt.id === 'ios') && Object.values(translations).some(v => /\{\{\d+\}\}/.test(v))) {
    log.warn(`${relative(process.cwd(), path)}: positional placeholders (%1$s / %1$@) were imported as {{1}}, {{2}}… — named placeholders can't be recovered from ${fmt.id} files.`);
  }
  return translations;
}

export async function pushCommand(projectArg: string | undefined, opts: PushOptions): Promise<void> {
  const loaded = loadProjectConfig();
  const cfg = loaded?.config ?? {};
  const slug = projectSlugFrom(projectArg);
  const format = opts.format || cfg.format ? getFormat(opts.format ?? cfg.format) : undefined;

  let template: string;
  if (opts.input) template = resolve(opts.input);
  else if (cfg.output && loaded) template = resolve(loaded.root, cfg.output);
  else template = resolve((format ?? getFormat('json')).defaultOutput);

  const session = await getSession();
  const spin = spinner(`Fetching ${slug}…`);
  let project: Project;
  try {
    project = await getProject(session, slug);
  } finally {
    spin.stop();
  }

  // Default: push only the source language, so translators' work in other languages isn't overwritten
  const explicit = Boolean(opts.languages);
  const languages = opts.languages === 'all' ? project.languages
    : opts.languages ? splitList(opts.languages)
    : [cfg.sourceLanguage ?? project.defaultLanguage];
  assertLanguages(project, languages);
  if (languages.length > 1 && !templateHasLanguage(template)) {
    throw usageError(`Input "${relative(process.cwd(), template)}" has no {lang} placeholder but ${languages.length} languages were requested.`);
  }

  const results: UploadResult[] = [];
  for (const lang of languages) {
    const path = expandTemplate(template, lang, project.defaultLanguage);
    if (!existsSync(path)) {
      if (explicit) throw notFoundError(`File not found for ${lang}: ${relative(process.cwd(), path)}`);
      throw notFoundError(`Source file not found: ${relative(process.cwd(), path)}`, 'Run "langctl pull" first, or set "output" in langctl.json / pass --input.');
    }
    const translations = readTranslationFile(path, format, lang);
    const s = spinner(`${opts.dryRun ? 'Checking' : 'Uploading'} ${lang} (${Object.keys(translations).length} keys)…`);
    try {
      const r = await uploadTranslations(session, project, lang, translations, { ...opts, module: opts.module ?? cfg.module });
      results.push({ ...r, file: relative(process.cwd(), path) });
    } finally {
      s.stop();
    }
  }

  if (runtime.json) {
    printJson({ project: project.slug, dryRun: Boolean(opts.dryRun), overwrite: Boolean(opts.overwrite), results });
    return;
  }
  for (const r of results) {
    const parts = [`${chalk.green(`${r.created} new`)}`, `${chalk.yellow(`${r.updated} updated`)}`, chalk.dim(`${r.unchanged} unchanged`)];
    if (r.published !== undefined) parts.push(chalk.cyan(`${r.published} published`));
    log.out(`${r.language}  ${r.file}  ${parts.join(', ')}${opts.dryRun ? chalk.dim('  (dry run)') : ''}`);
  }
  if (!opts.overwrite && results.some(r => r.unchanged > 0)) {
    log.info(chalk.dim('Existing translations are never overwritten unless you pass --overwrite.'));
  }
}
