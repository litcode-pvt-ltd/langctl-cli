import chalk from 'chalk';
import { existsSync, readFileSync } from 'fs';
import { relative, resolve } from 'path';
import { loadProjectConfig, resolvePrefix } from '../core/config.js';
import { notFoundError, usageError } from '../core/errors.js';
import { getSession, type Session } from '../core/http.js';
import { log, printJson, runtime, spinner } from '../core/output.js';
import { assertLanguages, getProject, projectSlugFrom, type Project } from '../core/project.js';
import { expandTemplate, formatFromPath, getFormat, parseRichJson, templateHasLanguage, type Format } from '../formats/index.js';
import { displayPath, splitList } from './pull.js';

export interface PushOptions {
  languages?: string;
  format?: string;
  input?: string;
  module?: string;
  overwrite?: boolean;
  publish?: boolean;
  dryRun?: boolean;
  /** add this prefix to every key (multi-app projects) */
  prefix?: string;
  /** flat JSON file { key: description } stored with the keys */
  descriptions?: string;
}

/** What the import endpoint accepts per key: a plain value, or a value with its description. */
export type ImportValue = string | { value: string; description?: string };

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
  translations: Record<string, ImportValue>,
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
    for (const [key, raw] of entries) {
      const value = typeof raw === 'string' ? raw : raw.value;
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

/**
 * Read one translation file. Flat JSON files may also use rich values
 * ({ "key": { "value": "…", "description": "…" } }); their descriptions are returned separately.
 */
export function readTranslationFile(path: string, format: Format | undefined, lang: string): Record<string, string>;
export function readTranslationFile(path: string, format: Format | undefined, lang: string, withDescriptions: true):
  { translations: Record<string, string>; descriptions: Record<string, string> };
export function readTranslationFile(path: string, format: Format | undefined, lang: string, withDescriptions = false):
  Record<string, string> | { translations: Record<string, string>; descriptions: Record<string, string> } {
  if (!existsSync(path)) throw notFoundError(`File not found: ${relative(process.cwd(), path) || path}`);
  const fmt = format ?? formatFromPath(path);
  const content = readFileSync(path, 'utf-8');
  if (fmt.id === 'json') {
    const rich = parseRichJson(content);
    if (rich) return withDescriptions ? rich : rich.translations;
  }
  const translations = fmt.parse(content, lang);
  if (withDescriptions) return { translations, descriptions: {} };
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

  const prefix = resolvePrefix(opts.prefix, cfg);
  const descriptionsFile = opts.descriptions ? readDescriptions(resolve(opts.descriptions), opts.descriptions) : undefined;
  const show = (p: string) => displayPath(p, opts.input);

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
    throw usageError(`Input "${show(template)}" has no {lang} placeholder but ${languages.length} languages were requested.`);
  }

  const results: UploadResult[] = [];
  let described = 0;
  const unmatchedDescriptions = new Set(Object.keys(descriptionsFile ?? {}));
  for (const lang of languages) {
    const path = expandTemplate(template, lang, project.defaultLanguage);
    if (!existsSync(path)) {
      if (explicit) throw notFoundError(`File not found for ${lang}: ${show(path)}`);
      throw notFoundError(`Source file not found: ${show(path)}`, 'Run "langctl pull" first, or set "output" in langctl.json / pass --input.');
    }
    const file = readTranslationFile(path, format, lang, true);
    const descriptions = { ...file.descriptions, ...(descriptionsFile ?? {}) };
    // Keys go up with the prefix; descriptions may name keys with or without it
    const values: Record<string, ImportValue> = {};
    for (const [key, value] of Object.entries(file.translations)) {
      const full = prefix ? prefix + key : key; // always added: pull strips exactly one prefix
      const description = descriptions[key] ?? (prefix ? descriptions[full] : undefined);
      if (descriptionsFile) { unmatchedDescriptions.delete(key); unmatchedDescriptions.delete(full); }
      if (description !== undefined && description.trim()) {
        values[full] = { value, description };
        described++;
      } else {
        values[full] = value;
      }
    }
    const s = spinner(`${opts.dryRun ? 'Checking' : 'Uploading'} ${lang} (${Object.keys(values).length} keys)…`);
    try {
      const r = await uploadTranslations(session, project, lang, values, { ...opts, module: opts.module ?? cfg.module });
      results.push({ ...r, file: show(path) });
    } finally {
      s.stop();
    }
  }

  if (unmatchedDescriptions.size && !runtime.quiet) {
    log.warn(`${unmatchedDescriptions.size} description(s) in ${opts.descriptions} match no key in the pushed file(s) and were ignored.`);
  }
  if (described && !opts.overwrite && !runtime.quiet) {
    log.warn(`Descriptions are stored for new keys; for keys that already exist pass --overwrite (see "Descriptions" in the README).`);
  }

  if (runtime.json) {
    printJson({ project: project.slug, dryRun: Boolean(opts.dryRun), overwrite: Boolean(opts.overwrite), ...(prefix ? { prefix } : {}), descriptions: described, results });
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

/** A flat { "key": "description" } JSON file for `push --descriptions`. */
export function readDescriptions(path: string, asGiven: string): Record<string, string> {
  if (!existsSync(path)) throw notFoundError(`Descriptions file not found: ${displayPath(path, asGiven)}`);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf-8').replace(/^\uFEFF/, ''));
  } catch (e) {
    throw usageError(`${displayPath(path, asGiven)} is not valid JSON: ${(e as Error).message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw usageError(`${displayPath(path, asGiven)} must be a flat JSON object: { "key": "description" }.`);
  }
  const bad = Object.entries(data as Record<string, unknown>).filter(([, v]) => typeof v !== 'string').map(([k]) => k);
  if (bad.length) {
    throw usageError(`Descriptions must be strings. Not strings: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? ` …and ${bad.length - 5} more` : ''}`);
  }
  return data as Record<string, string>;
}
