import chalk from 'chalk';
import { existsSync } from 'fs';
import { join } from 'path';
import { PROJECT_CONFIG_FILE, resolveCredentials, writeProjectConfig, type ProjectConfig } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { isInteractive, log, printJson, runtime } from '../core/output.js';
import { input, password } from '../core/prompts.js';
import type { Project } from '../core/project.js';
import { FORMATS, getFormat } from '../formats/index.js';
import { saveApiKey } from './auth.js';

interface InitOptions {
  project?: string;
  format?: string;
  output?: string;
  force?: boolean;
}

/**
 * Set up a repository: authenticate if needed, then write langctl.json so that
 * `langctl pull` / `langctl push` need no arguments (locally and in CI).
 */
export async function initCommand(opts: InitOptions): Promise<void> {
  const interactive = isInteractive();
  const target = join(process.cwd(), PROJECT_CONFIG_FILE);
  if (existsSync(target) && !opts.force) {
    throw usageError(`${PROJECT_CONFIG_FILE} already exists here.`, 'Edit it directly, or re-run with --force to replace it.');
  }

  if (!resolveCredentials()) {
    if (!interactive) throw usageError('Not authenticated.', 'Set LANGCTL_API_KEY, or run "langctl auth --stdin" first.');
    log.info(`Create an API key at ${chalk.cyan('https://app.langctl.com/organization/api-keys')}`);
    const org = await saveApiKey(await password('Paste your API key'));
    log.success(`Authenticated to ${chalk.bold(org.name)}`);
  }

  const session = await getSession();
  const projects = await session.api.get<Project[]>(`/orgs/${session.orgId}/projects`);
  if (projects.length === 0) {
    throw usageError('This organization has no projects yet.', 'Create one with "langctl projects create <name>" or at https://app.langctl.com.');
  }

  let project = opts.project ? projects.find(p => p.slug === opts.project) : undefined;
  if (opts.project && !project) {
    throw usageError(`Project "${opts.project}" not found.`, `Available: ${projects.map(p => p.slug).join(', ')}`);
  }
  if (!project) {
    if (projects.length === 1) project = projects[0];
    else if (!interactive) throw usageError('Several projects exist — choose one with --project <slug>.', `Available: ${projects.map(p => p.slug).join(', ')}`);
    else project = await choose('Project', projects.map(p => ({ label: `${p.name} ${chalk.dim(`(${p.slug})`)}`, value: p })));
  }

  let format = opts.format ? getFormat(opts.format) : undefined;
  if (!format) {
    format = interactive ? await choose('Format', FORMATS.map(f => ({ label: f.label, value: f }))) : getFormat('json');
  }

  const output = opts.output ?? (interactive ? await input('Where should translation files go', format.defaultOutput) : format.defaultOutput);

  const config: ProjectConfig = { project: project.slug, format: format.id, output };
  writeProjectConfig(target, config);

  if (runtime.json) return printJson({ created: target, config });
  log.success(`Wrote ${PROJECT_CONFIG_FILE} for ${chalk.bold(project.name)} (${project.languages.join(', ')})`);
  log.info(`\nNext:\n  ${chalk.cyan('langctl pull')}          download translations into ${output}\n  ${chalk.cyan('langctl push')}          upload new ${project.defaultLanguage} strings\n  ${chalk.cyan('langctl pull --check')}  fail CI when committed files are out of date`);
}

async function choose<T>(label: string, options: Array<{ label: string; value: T }>): Promise<T> {
  options.forEach((o, i) => log.info(`  ${chalk.cyan(String(i + 1).padStart(2))}  ${o.label}`));
  for (;;) {
    const answer = await input(`${label} [1-${options.length}]`, '1');
    const n = Number(answer);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value;
    log.warn(`Enter a number between 1 and ${options.length}.`);
  }
}
