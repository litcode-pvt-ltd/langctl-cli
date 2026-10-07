import chalk from 'chalk';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, table } from '../core/output.js';

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
  maxMembers?: number | null;
  maxProjects?: number | null;
  maxKeysPerProject?: number | null;
  maxApiKeys?: number | null;
  maxLanguagesPerProject?: number | null;
  aiTranslationsLimit?: number | null;
  aiTranslationsUsedThisMonth?: number | null;
}

interface OrgStats {
  memberCount: number;
  projectCount: number;
  totalKeys: number;
  apiKeyCount: number;
}

const limit = (n: number | null | undefined) => (n === null || n === undefined ? 'unlimited' : String(n));

export async function orgInfoCommand(): Promise<void> {
  const session = await getSession();
  const org = await session.api.get<Org>(`/orgs/${session.orgId}`);
  const { id, name, slug, plan, createdAt } = org;
  if (runtime.json) return printJson({ id, name, slug, plan, createdAt });
  log.out(`${chalk.bold(name)} ${chalk.dim(`(${slug})`)}  ${plan} plan`);
  log.out(chalk.dim(`id ${id} · created ${createdAt.slice(0, 10)}`));
}

export async function orgStatsCommand(): Promise<void> {
  const session = await getSession();
  const stats = await session.api.get<OrgStats>(`/orgs/${session.orgId}/stats`);
  if (runtime.json) return printJson(stats);
  table([
    ['Members', String(stats.memberCount)],
    ['Projects', String(stats.projectCount)],
    ['Translation keys', String(stats.totalKeys)],
    ['Active API keys', String(stats.apiKeyCount)],
  ]);
}

export async function orgPlanCommand(): Promise<void> {
  const session = await getSession();
  const [org, stats] = await Promise.all([
    session.api.get<Org>(`/orgs/${session.orgId}`),
    session.api.get<OrgStats>(`/orgs/${session.orgId}/stats`),
  ]);
  const rows = {
    plan: org.plan,
    members: { used: stats.memberCount, limit: org.maxMembers ?? null },
    projects: { used: stats.projectCount, limit: org.maxProjects ?? null },
    apiKeys: { used: stats.apiKeyCount, limit: org.maxApiKeys ?? null },
    keysPerProject: { limit: org.maxKeysPerProject ?? null },
    languagesPerProject: { limit: org.maxLanguagesPerProject ?? null },
    aiTranslationsPerMonth: { used: org.aiTranslationsUsedThisMonth ?? 0, limit: org.aiTranslationsLimit ?? null },
  };
  if (runtime.json) return printJson(rows);
  log.out(`${chalk.bold(org.plan.toUpperCase())} plan`);
  table([
    ['Members', `${stats.memberCount} / ${limit(org.maxMembers)}`],
    ['Projects', `${stats.projectCount} / ${limit(org.maxProjects)}`],
    ['API keys', `${stats.apiKeyCount} / ${limit(org.maxApiKeys)}`],
    ['Keys per project', limit(org.maxKeysPerProject)],
    ['Languages per project', limit(org.maxLanguagesPerProject)],
    ['AI translations / month', `${org.aiTranslationsUsedThisMonth ?? 0} / ${limit(org.aiTranslationsLimit)}`],
  ]);
}
