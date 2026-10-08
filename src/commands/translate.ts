import chalk from 'chalk';
import { usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, spinner, table } from '../core/output.js';
import { assertLanguages, getProject, listAllKeys, projectSlugFrom, type TranslationKey } from '../core/project.js';

interface TranslateOptions {
  to?: string;
  keys?: string;
  module?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

interface BulkResponse {
  results: { keyId?: string; translatedText: string }[];
  provider?: 'org' | 'platform';
  usage: { used: number; limit: number | null };
}

/** The API translates at most 50 strings per request. */
const BATCH = 50;

const isBlank = (v: string | undefined) => !v || !v.trim();

/**
 * Fill missing translations with AI (DeepL) from the project's default language.
 * Counts against the plan's monthly AI translations unless the org uses its own DeepL key.
 */
export async function translateCommand(projectArg: string | undefined, opts: TranslateOptions): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  const source = project.defaultLanguage;

  const targets = opts.to
    ? opts.to.split(',').map(s => s.trim()).filter(Boolean)
    : project.languages.filter(l => l !== source);
  if (!targets.length) throw usageError(`Project "${project.slug}" has no languages besides ${source}.`, `Add one with "langctl projects add-language ${project.slug} <code>".`);
  assertLanguages(project, targets);
  if (targets.includes(source)) throw usageError(`${source} is the source language and can't be a target.`);

  const spin = spinner('Fetching keys…');
  let keys: TranslationKey[];
  try {
    keys = await listAllKeys(session, project, { module: opts.module });
  } finally {
    spin.stop();
  }
  if (opts.keys) {
    const wanted = new Set(opts.keys.split(',').map(s => s.trim()).filter(Boolean));
    const unknown = [...wanted].filter(k => !keys.some(key => key.key === k));
    if (unknown.length) throw usageError(`Key${unknown.length > 1 ? 's' : ''} not found: ${unknown.join(', ')}`);
    keys = keys.filter(k => wanted.has(k.key));
  }

  // Work list: per target language, keys with source text whose target is empty (or all, with --overwrite)
  const plan = targets.map(lang => ({
    lang,
    keys: keys.filter(k => !isBlank(k.translations?.[source]) && (opts.overwrite || isBlank(k.translations?.[lang]))),
  }));
  const total = plan.reduce((n, p) => n + p.keys.length, 0);
  const noSource = keys.filter(k => isBlank(k.translations?.[source])).length;

  if (opts.dryRun || total === 0) {
    if (runtime.json) {
      return printJson({ dryRun: Boolean(opts.dryRun), source, languages: plan.map(p => ({ language: p.lang, keys: p.keys.map(k => k.key) })), total });
    }
    table(plan.map(p => [p.lang, String(p.keys.length)]), ['language', opts.overwrite ? 'keys to retranslate' : 'missing']);
    if (noSource) log.info(chalk.dim(`${noSource} key(s) have no ${source} text and are skipped.`));
    if (total === 0) log.success('Nothing to translate.');
    else log.info(`Dry run: ${total} translation(s) would use ${total} AI translation(s). Run without --dry-run to translate.`);
    return;
  }

  const done: { language: string; key: string; text: string }[] = [];
  let usage: BulkResponse['usage'] | undefined;
  let provider: BulkResponse['provider'];
  const progress = spinner(`Translating 0/${total}…`);
  try {
    for (const { lang, keys: todo } of plan) {
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const res = await session.api.post<BulkResponse>(`/orgs/${session.orgId}/translate/bulk`, {
          items: batch.map(k => ({ text: k.translations[source], keyId: k.id })),
          sourceLang: source,
          targetLang: lang,
          projectId: project.id,
        });
        usage = res.usage;
        provider = res.provider;
        for (const [j, key] of batch.entries()) {
          const text = res.results[j]?.translatedText;
          if (!text) continue;
          await session.api.patch(`/orgs/${session.orgId}/projects/${project.id}/keys/${key.id}/translations/${encodeURIComponent(lang)}`, { value: text });
          done.push({ language: lang, key: key.key, text });
          progress.text = `Translating ${done.length}/${total}…`;
        }
      }
    }
  } finally {
    progress.stop();
  }

  if (runtime.json) return printJson({ source, translated: done, provider, usage });
  for (const d of done) log.out(`${chalk.dim(d.language)}  ${d.key}  ${d.text}`);
  const quota = provider === 'org'
    ? 'using your own DeepL key'
    : usage?.limit != null ? `${usage.used}/${usage.limit} AI translations used this month` : `${usage?.used ?? done.length} AI translations used this month`;
  log.success(`Translated ${done.length} string(s) into ${plan.filter(p => p.keys.length).map(p => p.lang).join(', ')} (${quota}).`);
  const live = new Set(plan.flatMap(p => p.keys).filter(k => k.published).map(k => k.key));
  if (live.size) log.info(chalk.dim(`${live.size} of these key(s) are already published, so their new translations ship on the next pull — review them first if needed.`));
}
