import chalk from 'chalk';
import { CliError, ExitCode, usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, table } from '../core/output.js';
import { confirm } from '../core/prompts.js';
import { getProject, type Project } from '../core/project.js';
import { splitList } from './pull.js';

export async function projectsListCommand(): Promise<void> {
  const session = await getSession();
  const projects = await session.api.get<Project[]>(`/orgs/${session.orgId}/projects`);
  if (runtime.json) return printJson(projects);
  if (projects.length === 0) return log.info('No projects yet. Create one with "langctl projects create <name>".');
  table(projects.map(p => [p.slug, p.name, p.languages.join(','), p.defaultLanguage]), ['SLUG', 'NAME', 'LANGUAGES', 'DEFAULT']);
}

export async function projectsGetCommand(slug: string): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  if (runtime.json) return printJson(project);
  log.out(`${chalk.bold(project.name)} ${chalk.dim(`(${project.slug})`)}`);
  if (project.description) log.out(chalk.dim(project.description));
  log.out(`  languages  ${project.languages.join(', ')}  ${chalk.dim(`default ${project.defaultLanguage}`)}`);
  if (project.modules?.length) log.out(`  modules    ${project.modules.join(', ')}`);
  log.out(`  id         ${project.id}`);
}

export async function projectsCreateCommand(name: string, opts: { description?: string; languages?: string; defaultLanguage?: string }): Promise<void> {
  const session = await getSession();
  const languages = splitList(opts.languages ?? 'en');
  const defaultLanguage = opts.defaultLanguage ?? languages[0];
  if (!languages.includes(defaultLanguage)) throw usageError(`Default language "${defaultLanguage}" must be one of --languages (${languages.join(',')}).`);
  const project = await session.api.post<Project>(`/orgs/${session.orgId}/projects`, { name, description: opts.description, languages, defaultLanguage });
  if (runtime.json) return printJson(project);
  log.success(`Created ${chalk.bold(project.name)} — slug ${chalk.cyan(project.slug)}`);
}

export async function projectsUpdateCommand(slug: string, opts: { name?: string; description?: string; languages?: string; defaultLanguage?: string }): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  const body: Record<string, unknown> = {};
  if (opts.name) body.name = opts.name;
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.defaultLanguage) body.defaultLanguage = opts.defaultLanguage;

  let toAdd: string[] = [];
  let toRemove: string[] = [];
  if (opts.languages) {
    const desired = splitList(opts.languages);
    const effectiveDefault = opts.defaultLanguage ?? project.defaultLanguage;
    if (!desired.includes(effectiveDefault)) throw usageError(`--languages must include the default language "${effectiveDefault}".`);
    toAdd = desired.filter(l => !project.languages.includes(l));
    toRemove = project.languages.filter(l => !desired.includes(l));
  }
  if (Object.keys(body).length === 0 && !toAdd.length && !toRemove.length) throw usageError('Nothing to update.');
  if (toRemove.length && !(await confirm(`Remove ${toRemove.join(', ')} from ${project.slug} and delete all of their translations?`))) {
    throw new CliError('Cancelled.', ExitCode.Error);
  }

  // Add new languages first so a new default language exists before it is set
  for (const code of toAdd) await session.api.post(`/orgs/${session.orgId}/projects/${project.id}/languages`, { code });
  if (Object.keys(body).length) await session.api.patch(`/orgs/${session.orgId}/projects/${project.id}`, body);
  for (const code of toRemove) await session.api.delete(`/orgs/${session.orgId}/projects/${project.id}/languages/${encodeURIComponent(code)}`);

  const updated = await getProject(session, slug);
  if (runtime.json) return printJson(updated);
  log.success(`Updated ${chalk.bold(updated.slug)}${toAdd.length ? ` +${toAdd.join(',')}` : ''}${toRemove.length ? ` -${toRemove.join(',')}` : ''}`);
}

export async function projectsDeleteCommand(slug: string): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  if (!(await confirm(`Delete project "${project.slug}" and all of its translation keys?`))) throw new CliError('Cancelled.', ExitCode.Error);
  await session.api.delete(`/orgs/${session.orgId}/projects/${project.id}`);
  if (runtime.json) return printJson({ deleted: project.slug });
  log.success(`Deleted project ${chalk.bold(project.slug)}`);
}

export async function projectsAddLanguageCommand(slug: string, codes: string[]): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  const added: string[] = [];
  for (const code of codes) {
    if (project.languages.includes(code)) { log.info(`${code} is already in ${project.slug}`); continue; }
    await session.api.post(`/orgs/${session.orgId}/projects/${project.id}/languages`, { code });
    added.push(code);
  }
  if (runtime.json) return printJson({ project: project.slug, added });
  if (added.length) log.success(`Added ${added.join(', ')} to ${chalk.bold(project.slug)}`);
}

export async function projectsRemoveLanguageCommand(slug: string, codes: string[]): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  const missing = codes.filter(c => !project.languages.includes(c));
  if (missing.length) throw usageError(`Not in ${project.slug}: ${missing.join(', ')}`);
  if (codes.includes(project.defaultLanguage)) throw usageError(`"${project.defaultLanguage}" is the default language and can't be removed.`);
  if (!(await confirm(`Remove ${codes.join(', ')} from ${project.slug} and delete all of their translations?`))) throw new CliError('Cancelled.', ExitCode.Error);
  for (const code of codes) await session.api.delete(`/orgs/${session.orgId}/projects/${project.id}/languages/${encodeURIComponent(code)}`);
  if (runtime.json) return printJson({ project: project.slug, removed: codes });
  log.success(`Removed ${codes.join(', ')} from ${chalk.bold(project.slug)}`);
}

interface Stats {
  totalKeys: number;
  publishedKeys: number;
  unpublishedKeys: number;
  languageCount: number;
  modules?: string[];
}

export async function projectsStatsCommand(slug: string): Promise<void> {
  const session = await getSession();
  const project = await getProject(session, slug);
  const [stats, snapshot] = await Promise.all([
    session.api.get<Stats>(`/orgs/${session.orgId}/projects/${project.id}/stats`),
    session.api.get<{ keys: Array<{ translations: Record<string, string> }> }>(
      `/orgs/${session.orgId}/projects/${project.id}/export`, { publishedOnly: 'false' }),
  ]);
  const total = snapshot.keys.length;
  const coverage = project.languages.map(lang => {
    const translated = snapshot.keys.filter(k => k.translations[lang]).length;
    return { language: lang, translated, missing: total - translated, percent: total ? Math.round((translated / total) * 100) : 100 };
  });
  if (runtime.json) return printJson({ ...stats, coverage });
  log.out(`${chalk.bold(project.slug)}  ${stats.totalKeys} keys  ${chalk.green(`${stats.publishedKeys} published`)}  ${chalk.yellow(`${stats.unpublishedKeys} draft`)}`);
  table(coverage.map(c => [c.language, `${c.translated}/${total}`, c.missing ? chalk.yellow(`${c.percent}%`) : chalk.green('100%')]), ['LANG', 'TRANSLATED', 'DONE']);
}
