import chalk from 'chalk';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, spinner, table } from '../core/output.js';
import { confirm } from '../core/prompts.js';
import { assertLanguages, getProject, listAllKeys, projectSlugFrom, requireKey, type TranslationKey } from '../core/project.js';

interface ListOptions {
  module?: string;
  published?: boolean;
  drafts?: boolean;
  search?: string;
  limit?: string;
}

export async function listKeysCommand(projectArg: string | undefined, opts: ListOptions): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  const spin = spinner('Fetching keys…');
  let keys: TranslationKey[];
  try {
    keys = await listAllKeys(session, project, {
      module: opts.module,
      search: opts.search,
      published: opts.published ? true : opts.drafts ? false : undefined,
    });
  } finally {
    spin.stop();
  }
  const limit = opts.limit ? Number(opts.limit) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) throw usageError('--limit must be a positive integer');
  const shown = limit ? keys.slice(0, limit) : keys;

  if (runtime.json) {
    return printJson(shown.map(k => ({
      key: k.key, published: k.published, module: k.module ?? null, description: k.description ?? null, translations: k.translations,
    })));
  }
  if (shown.length === 0) {
    log.info('No keys match.');
    return;
  }
  table(
    shown.map(k => [
      k.key,
      k.published ? chalk.green('published') : chalk.yellow('draft'),
      k.module ?? '',
      `${project.languages.filter(l => k.translations?.[l]).length}/${project.languages.length}`,
    ]),
    ['KEY', 'STATUS', 'MODULE', 'LANGS'],
  );
  if (limit && keys.length > limit) log.info(chalk.dim(`Showing ${limit} of ${keys.length}. Use --json for scripting.`));
}

export async function getKeyCommand(projectArg: string, keyName: string): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectArg);
  const key = await requireKey(session, project, keyName);
  if (runtime.json) return printJson(key);
  log.out(chalk.bold(key.key) + '  ' + (key.published ? chalk.green('published') : chalk.yellow('draft')));
  if (key.description) log.out(chalk.dim(key.description));
  if (key.module) log.out(chalk.dim(`module: ${key.module}`));
  for (const lang of project.languages) {
    const v = key.translations?.[lang];
    log.out(`  ${lang.padEnd(6)} ${v === undefined || v === '' ? chalk.dim('— missing') : v}`);
  }
}

/** Collect `--value en=Hello --value es=Hola` plus the legacy `--value-en` style flags. */
function collectValues(opts: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (opts.value as string[] | undefined) ?? []) {
    const i = pair.indexOf('=');
    if (i < 1) throw usageError(`--value expects LANG=TEXT, got "${pair}"`, 'Example: --value en="Welcome" --value es="Bienvenido"');
    out[pair.slice(0, i).trim()] = pair.slice(i + 1);
  }
  for (const lang of ['en', 'es', 'fr', 'de']) {
    const legacy = opts[`value${lang[0].toUpperCase()}${lang[1]}`];
    if (typeof legacy === 'string') out[lang] = legacy;
  }
  return out;
}

export async function createKeyCommand(projectArg: string, keyName: string, opts: Record<string, unknown>): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectArg);
  const translations = collectValues(opts);
  assertLanguages(project, Object.keys(translations));
  const key = await session.api.post<TranslationKey>(`/orgs/${session.orgId}/projects/${project.id}/keys`, {
    key: keyName,
    translations,
    description: opts.description,
    module: opts.module,
    tags: typeof opts.tags === 'string' ? opts.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
    published: Boolean(opts.publish),
  });
  if (runtime.json) return printJson(key);
  log.success(`Created ${chalk.bold(keyName)}${opts.publish ? ' (published)' : ' (draft — publish with "langctl keys publish")'}`);
}

export async function updateKeyCommand(projectArg: string, keyName: string, opts: Record<string, unknown>): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectArg);
  const key = await requireKey(session, project, keyName);
  const translations = collectValues(opts);
  // legacy: keys translate <project> <key> -l es -v "Hola"
  if (typeof opts.language === 'string') {
    if (typeof opts.text !== 'string') throw usageError('--language needs --text (or use --value LANG=TEXT)');
    translations[opts.language] = opts.text;
  }
  assertLanguages(project, Object.keys(translations));
  const body: Record<string, unknown> = {};
  if (Object.keys(translations).length) body.translations = { ...key.translations, ...translations };
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.module !== undefined) body.module = opts.module;
  if (Object.keys(body).length === 0) throw usageError('Nothing to update.', 'Pass --value LANG=TEXT, --description or --module.');
  const updated = await session.api.patch<TranslationKey>(`/orgs/${session.orgId}/projects/${project.id}/keys/${key.id}`, body);
  if (runtime.json) return printJson(updated);
  log.success(`Updated ${chalk.bold(keyName)}${Object.keys(translations).length ? ` (${Object.keys(translations).join(', ')})` : ''}`);
}

export async function deleteKeyCommand(projectArg: string, keyNames: string[]): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectArg);
  const keys = [];
  for (const name of keyNames) keys.push(await requireKey(session, project, name));
  if (!(await confirm(`Delete ${keys.length === 1 ? `key "${keys[0].key}"` : `${keys.length} keys`} from ${project.slug}?`))) {
    throw new CliError('Cancelled.', ExitCode.Error);
  }
  for (const k of keys) await session.api.delete(`/orgs/${session.orgId}/projects/${project.id}/keys/${k.id}`);
  if (runtime.json) return printJson({ deleted: keys.map(k => k.key) });
  log.success(`Deleted ${keys.map(k => chalk.bold(k.key)).join(', ')}`);
}

interface PublishOptions {
  all?: boolean;
  module?: string;
  unpublish?: boolean;
}

export async function publishKeysCommand(projectArg: string | undefined, keyNames: string[], opts: PublishOptions, publish = true): Promise<void> {
  const published = publish && !opts.unpublish;
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  let names = keyNames;
  if (opts.all || opts.module) {
    if (names.length) throw usageError('Pass key names or --all/--module, not both.');
    names = (await listAllKeys(session, project, { module: opts.module, published: !published })).map(k => k.key);
  } else if (names.length === 0) {
    throw usageError('No keys given.', `Example: langctl keys ${published ? 'publish' : 'unpublish'} ${project.slug} home.title home.subtitle  (or --all / --module <name>)`);
  }
  if (names.length === 0) {
    if (runtime.json) return printJson({ count: 0, notFound: [] });
    return log.info(`Nothing to ${published ? 'publish' : 'unpublish'}.`);
  }
  const res = await session.api.post<{ count: number; notFound: string[] }>(
    `/orgs/${session.orgId}/projects/${project.id}/keys/bulk-publish`, { keys: names, published }, true);
  if (runtime.json) printJson(res);
  else log.success(`${published ? 'Published' : 'Unpublished'} ${res.count} key(s)`);
  if (res.notFound?.length) {
    throw new CliError(`Not found: ${res.notFound.join(', ')}`, ExitCode.NotFound);
  }
}
