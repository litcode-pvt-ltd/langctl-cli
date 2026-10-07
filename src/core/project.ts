import { CliError, ExitCode, notFoundError, usageError } from './errors.js';
import { loadProjectConfig } from './config.js';
import type { Session } from './http.js';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  languages: string[];
  defaultLanguage: string;
  modules?: string[] | null;
}

export interface TranslationKey {
  id: string;
  key: string;
  translations: Record<string, string>;
  description?: string | null;
  module?: string | null;
  tags?: string[] | null;
  published: boolean;
  updatedAt?: string;
}

interface Page<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Project slug from the argument, else langctl.json, else a usage error. */
export function projectSlugFrom(arg?: string): string {
  if (arg) return arg;
  const loaded = loadProjectConfig();
  if (loaded?.config.project) return loaded.config.project;
  throw usageError('No project given.', 'Pass a project slug, or add "project" to langctl.json (see "langctl init"). List projects with "langctl projects list".');
}

export async function getProject(session: Session, slug: string): Promise<Project> {
  try {
    return await session.api.get<Project>(`/orgs/${session.orgId}/projects/by-slug/${encodeURIComponent(slug)}`);
  } catch (err) {
    if (err instanceof CliError && err.exitCode === ExitCode.NotFound) {
      const projects = await session.api.get<Project[]>(`/orgs/${session.orgId}/projects`).catch(() => [] as Project[]);
      const available = projects.map(p => p.slug);
      throw notFoundError(`Project "${slug}" not found.`,
        available.length ? `Available projects: ${available.join(', ')}` : 'This organization has no projects yet — create one with "langctl projects create".');
    }
    throw err;
  }
}

export function assertLanguages(project: Project, languages: string[]): void {
  const missing = languages.filter(l => !project.languages.includes(l));
  if (missing.length) {
    throw usageError(`Language${missing.length > 1 ? 's' : ''} ${missing.join(', ')} not in project "${project.slug}".`,
      `Project languages: ${project.languages.join(', ')}. Add one with "langctl projects add-language ${project.slug} <code>".`);
  }
}

export async function findKey(session: Session, project: Project, keyName: string): Promise<TranslationKey | null> {
  const res = await session.api.get<Page<TranslationKey>>(`/orgs/${session.orgId}/projects/${project.id}/keys`, { key: keyName, pageSize: 1 });
  return res.data.find(k => k.key === keyName) ?? null;
}

export async function requireKey(session: Session, project: Project, keyName: string): Promise<TranslationKey> {
  const key = await findKey(session, project, keyName);
  if (!key) throw notFoundError(`Key "${keyName}" not found in project "${project.slug}".`, `Search with "langctl keys list ${project.slug} --search <text>".`);
  return key;
}

/** Fetch every key page by page (the API caps pages at 100). */
export async function listAllKeys(
  session: Session,
  project: Project,
  filters: { module?: string; published?: boolean; search?: string } = {},
): Promise<TranslationKey[]> {
  const out: TranslationKey[] = [];
  for (let page = 1; ; page++) {
    const res = await session.api.get<Page<TranslationKey>>(`/orgs/${session.orgId}/projects/${project.id}/keys`, {
      page,
      pageSize: 100,
      sortBy: 'key',
      sortOrder: 'asc',
      module: filters.module,
      search: filters.search,
      published: filters.published === undefined ? undefined : String(filters.published),
    });
    out.push(...res.data);
    if (page >= res.pagination.totalPages) return out;
  }
}
