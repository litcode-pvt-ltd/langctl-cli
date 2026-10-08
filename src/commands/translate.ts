import chalk from 'chalk';
import { loadProjectConfig, resolvePrefix, withPrefix } from '../core/config.js';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { getSession, type Session } from '../core/http.js';
import { log, printJson, progress, runtime, spinner, table } from '../core/output.js';
import { assertLanguages, getProject, listAllKeys, projectSlugFrom, type Project, type TranslationKey } from '../core/project.js';

interface TranslateOptions {
  to?: string;
  keys?: string;
  module?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

interface BulkResult {
  keyId?: string;
  sourceText?: string;
  /** null when the provider returned nothing usable for this string (see `error`) */
  translatedText: string | null;
  error?: string;
  /** the source was copied unchanged (nothing to translate, e.g. "98860 41022" or "{h}h") */
  copied?: boolean;
  /** with `save: true`: whether the server stored this translation */
  saved?: boolean;
}

interface BulkResponse {
  results: BulkResult[];
  failed?: { keyId?: string; sourceText?: string; error?: string }[];
  /** Present (a number) only on servers that support `save: true` */
  saved?: number;
  provider?: 'org' | 'platform';
  usage?: { used: number; limit: number | null };
}

export interface Translated { language: string; key: string; text: string; copied?: boolean }
export interface Failed { language: string; key: string; sourceText: string; error: string }

/** Strings per request (API maximum). Servers before API 2026-10 accept at most LEGACY_BATCH. */
export const BATCH = 100;
const LEGACY_BATCH = 50;
/** Requests in flight at once */
export const CONCURRENCY = 3;
/** Per-key saves in flight at once on servers without `save: true` */
export const SAVE_CONCURRENCY = 6;

const isBlank = (v: string | undefined) => !v || !v.trim();

/** Run `fn` over `items` with at most `limit` running at a time. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

interface Job { lang: string; keys: TranslationKey[] }

/**
 * Fill missing translations with AI (DeepL) from the project's default language.
 * Counts against the plan's monthly AI translations unless the org uses its own DeepL key.
 *
 * Strings the provider can't translate are reported per key and never fail the rest: the
 * command finishes, lists them, and exits 8 (partial) so CI can tell "needs a human" apart
 * from usage (2) and network/API (5) errors.
 */
export async function translateCommand(projectArg: string | undefined, opts: TranslateOptions): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  const source = project.defaultLanguage;
  const prefix = resolvePrefix(undefined, loadProjectConfig()?.config ?? {});

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
    const known = new Set(keys.map(k => k.key));
    // With "prefix" in langctl.json, keys may be named with or without it
    const wanted = new Set(opts.keys.split(',').map(s => s.trim()).filter(Boolean).map(k => withPrefix(k, prefix, known)));
    const unknown = [...wanted].filter(k => !known.has(k));
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
    else log.info(`Dry run: ${total} translation(s) would use up to ${total} AI translation(s). Run without --dry-run to translate.`);
    return;
  }

  const outcome = await runTranslation(session, project, source, plan, Boolean(opts.overwrite));
  report(project, plan.filter(p => p.keys.length).map(p => p.lang), total, outcome);
}

export interface Outcome {
  done: Translated[];
  failed: Failed[];
  /** Request-level error that stopped the run (auth, plan limit, network, API) */
  fatal?: CliError;
  provider?: BulkResponse['provider'];
  usage?: BulkResponse['usage'];
  /** Whether the server stored translations itself (`save: true`) or the CLI saved them per key */
  savedBy?: 'server' | 'client';
}

export async function runTranslation(
  session: Session,
  project: Project,
  source: string,
  plan: Array<{ lang: string; keys: TranslationKey[] }>,
  overwrite: boolean,
): Promise<Outcome> {
  const total = plan.reduce((n, p) => n + p.keys.length, 0);
  const out: Outcome = { done: [], failed: [] };
  let batchSize = BATCH;
  const queue: Job[] = plan.flatMap(({ lang, keys }) => chunk(keys, batchSize).map(k => ({ lang, keys: k })));
  const bar = progress('Translating', total);
  const tick = () => bar.update(out.done.length + out.failed.length);
  const keyPath = (key: TranslationKey, lang: string) =>
    `/orgs/${session.orgId}/projects/${project.id}/keys/${key.id}/translations/${encodeURIComponent(lang)}`;

  const succeed = (lang: string, key: TranslationKey, text: string, copied: boolean) => {
    out.done.push({ language: lang, key: key.key, text, ...(copied ? { copied: true } : {}) });
    bar.out(`${chalk.dim(lang)}  ${key.key}  ${text}${copied ? chalk.dim('  (copied unchanged)') : ''}`);
  };
  const fail = (lang: string, key: TranslationKey, error: string) =>
    out.failed.push({ language: lang, key: key.key, sourceText: key.translations[source], error });

  const runJob = async (job: Job): Promise<void> => {
    let res: BulkResponse;
    try {
      res = await session.api.post<BulkResponse>(`/orgs/${session.orgId}/translate/bulk`, {
        items: job.keys.map(k => ({ text: k.translations[source], keyId: k.id })),
        sourceLang: source,
        targetLang: job.lang,
        projectId: project.id,
        save: true,
        overwrite,
      });
    } catch (err) {
      // Servers before the 100-item limit reject the batch as invalid: retry it in halves
      if (err instanceof CliError && err.status === 400 && job.keys.length > LEGACY_BATCH) {
        batchSize = LEGACY_BATCH;
        queue.unshift(...chunk(job.keys, LEGACY_BATCH).map(k => ({ lang: job.lang, keys: k })));
        return;
      }
      throw err;
    }
    out.provider = res.provider ?? out.provider;
    out.usage = res.usage ?? out.usage;
    const serverSaved = typeof res.saved === 'number';
    out.savedBy ??= serverSaved ? 'server' : 'client';

    const byId = new Map((res.results ?? []).filter(r => r.keyId).map(r => [r.keyId!, r]));
    const failedById = new Map((res.failed ?? []).filter(f => f.keyId).map(f => [f.keyId!, f]));
    const toSave: Array<{ key: TranslationKey; text: string; copied: boolean }> = [];
    job.keys.forEach((key, j) => {
      const r = byId.get(key.id) ?? (byId.size ? undefined : res.results?.[j]);
      const text = r?.translatedText;
      if (typeof text !== 'string' || text === '') {
        fail(job.lang, key, r?.error ?? failedById.get(key.id)?.error ?? (r ? 'empty_result' : 'missing_result'));
      } else if (serverSaved) {
        if (r!.saved === false) fail(job.lang, key, 'not_saved');
        else succeed(job.lang, key, text, Boolean(r!.copied));
      } else {
        toSave.push({ key, text, copied: Boolean(r!.copied) });
      }
    });
    tick();

    // Older servers: save each translation ourselves, a few at a time
    let fatal: unknown;
    await pool(toSave, SAVE_CONCURRENCY, async ({ key, text, copied }) => {
      if (fatal) { fail(job.lang, key, 'not_saved'); return; }
      try {
        await session.api.patch(keyPath(key, job.lang), { value: text });
        succeed(job.lang, key, text, copied);
      } catch (err) {
        if (err instanceof CliError && (err.exitCode === ExitCode.Auth || err.exitCode === ExitCode.Limit)) fatal = err;
        fail(job.lang, key, `not saved: ${(err as Error).message}`);
      }
      tick();
    });
    if (fatal) throw fatal;
  };

  try {
    const worker = async () => {
      while (queue.length && !out.fatal) {
        const job = queue.shift()!;
        if (job.keys.length > batchSize) {
          queue.unshift(...chunk(job.keys, batchSize).map(k => ({ lang: job.lang, keys: k })));
          continue;
        }
        try {
          await runJob(job);
        } catch (err) {
          // Stop starting new batches; batches already in flight finish and are reported
          out.fatal ??= asUpstreamError(err);
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  } finally {
    bar.stop();
  }
  return out;
}

/** The API (not the user) failed: never report that as "invalid usage" (exit 2). */
function asUpstreamError(err: unknown): CliError {
  if (!(err instanceof CliError)) return new CliError((err as Error)?.message ?? String(err), ExitCode.Error);
  if (err.exitCode !== ExitCode.Usage) return err;
  const code = err.status !== undefined && err.status >= 500 ? ExitCode.Network : ExitCode.Error;
  return new CliError(err.message, code, err.hint, err.status);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function report(project: Project, languages: string[], total: number, o: Outcome): void {
  const copied = o.done.filter(d => d.copied).length;
  const translated = o.done.length - copied;
  const notAttempted = total - o.done.length - o.failed.length;
  const exitCode = o.fatal ? o.fatal.exitCode : o.failed.length ? ExitCode.Partial : ExitCode.Ok;

  if (runtime.json) {
    printJson({
      project: project.slug,
      source: project.defaultLanguage,
      total,
      translated: o.done,
      failed: o.failed,
      counts: { translated, copied, failed: o.failed.length, notAttempted },
      provider: o.provider,
      usage: o.usage,
      exitCode,
      ...(o.fatal ? { error: { message: o.fatal.message, exitCode: o.fatal.exitCode, hint: o.fatal.hint ?? null, status: o.fatal.status ?? null } } : {}),
    });
  }

  // Summary and failures go to stderr, so they aren't lost when stdout is piped to a file
  const quota = o.provider === 'org'
    ? 'using your own DeepL key'
    : o.usage?.limit != null ? `${o.usage.used}/${o.usage.limit} AI translations used this month` : o.usage ? `${o.usage.used} AI translations used this month` : '';
  const summary = `Translated ${translated}, copied ${copied} unchanged, failed ${o.failed.length}` +
    (notAttempted > 0 ? `, not attempted ${notAttempted}` : '') +
    ` (${languages.join(', ')}${quota ? `; ${quota}` : ''}).`;
  if (!runtime.json) {
    if (o.failed.length || o.fatal) process.stderr.write(`${chalk.yellow('✖')} ${summary}\n`);
    else log.success(summary);
  }
  if (o.failed.length && !runtime.json) {
    process.stderr.write(`${chalk.yellow('Needs a human translation:')}\n`);
    for (const f of o.failed) {
      process.stderr.write(`  ${chalk.dim(f.language)}  ${f.key}  ${JSON.stringify(f.sourceText)}  ${chalk.dim(`(${f.error})`)}\n`);
    }
  }
  if (o.done.length) {
    log.info(chalk.dim(`AI translations are held back from "langctl pull" until reviewed. Check them with "langctl review ${project.slug}", then approve with --approve (or edit them in the web app).`));
  }

  if (o.fatal) {
    if (runtime.json) { process.exitCode = o.fatal.exitCode; return; }
    throw o.fatal;
  }
  if (o.failed.length) {
    const hint = `Add these in the web app or with "langctl keys translate ${project.slug} <key> -l <lang> -t <text>", then re-run (only missing strings are translated).`;
    if (!runtime.json) log.error(`${o.failed.length} string(s) could not be translated automatically.`, hint);
    process.exitCode = ExitCode.Partial;
  }
}
