import chalk from 'chalk';
import { loadProjectConfig, resolvePrefix, withPrefix } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, spinner, table } from '../core/output.js';
import { assertLanguages, getProject, listAllKeys, projectSlugFrom } from '../core/project.js';
import { confirm } from '../core/prompts.js';

interface ReviewOptions {
  approve?: boolean;
  keys?: string;
  languages?: string;
  module?: string;
}

interface ReviewList {
  total: number;
  items: Array<{ keyId: string; key: string; published: boolean; language: string; text: string; module?: string | null }>;
}

const split = (v?: string) => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : undefined);

/**
 * List AI translations awaiting review, or approve them with --approve.
 * Unreviewed AI translations are left out of `langctl pull` until approved (or edited) in langctl.
 */
export async function reviewCommand(projectArg: string | undefined, opts: ReviewOptions): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  const prefix = resolvePrefix(undefined, loadProjectConfig()?.config ?? {});
  const languages = split(opts.languages);
  if (languages) assertLanguages(project, languages);

  const spin = spinner('Fetching AI translations awaiting review…');
  let list: ReviewList;
  let inModule: Set<string> | undefined;
  try {
    list = await session.api.get<ReviewList>(`/orgs/${session.orgId}/projects/${project.id}/review`, { module: opts.module });
    // The review list may not carry modules (older API): resolve the module's keys separately
    if (opts.module && !list.items.every(i => i.module !== undefined)) {
      inModule = new Set((await listAllKeys(session, project, { module: opts.module })).map(k => k.id));
    }
  } finally {
    spin.stop();
  }
  // With "prefix" in langctl.json, --keys may name keys with or without it
  const known = new Set(list.items.map(i => i.key));
  const keys = split(opts.keys)?.map(k => withPrefix(k, prefix, known));
  const items = list.items.filter(i => (!keys || keys.includes(i.key)) && (!languages || languages.includes(i.language))
    && (!opts.module || (inModule ? inModule.has(i.keyId) : i.module === opts.module)));
  if (keys) {
    const unknown = keys.filter(k => !list.items.some(i => i.key === k));
    if (unknown.length) log.warn(`Nothing awaiting review for: ${unknown.join(', ')}`);
  }

  if (!opts.approve) {
    if (runtime.json) return printJson({ project: project.slug, total: items.length, items });
    if (!items.length) {
      log.success('No AI translations awaiting review.');
      return;
    }
    table(items.map(i => [i.key, i.language, i.text.length > 60 ? `${i.text.slice(0, 57)}…` : i.text]), ['key', 'lang', 'AI translation']);
    log.info(chalk.dim(`${items.length} awaiting review — left out of "langctl pull" until approved. Approve with "langctl review ${project.slug} --approve" (narrow with --module / --keys / --languages), or edit them in the web app.`));
    return;
  }

  if (!items.length) {
    if (runtime.json) return printJson({ project: project.slug, approved: 0 });
    log.success('Nothing to approve.');
    return;
  }
  if (!(await confirm(`Approve ${items.length} AI translation(s) in ${project.slug}? They will ship on the next pull.`))) {
    throw usageError('Cancelled.');
  }
  const keyIds = [...new Set(items.map(i => i.keyId))];
  let approved = 0;
  for (let i = 0; i < keyIds.length; i += 1000) {
    const res = await session.api.post<{ approved: number }>(`/orgs/${session.orgId}/projects/${project.id}/keys/review`, {
      keyIds: keyIds.slice(i, i + 1000),
      languages: languages ?? [...new Set(items.map(it => it.language))],
    });
    approved += res.approved;
  }
  if (runtime.json) return printJson({ project: project.slug, approved });
  log.success(`Approved ${approved} AI translation(s). They'll be included in the next "langctl pull".`);
}
