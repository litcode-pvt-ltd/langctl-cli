import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';

/**
 * Resolve a project slug to a full project object
 */
async function resolveProject(orgId: string, slug: string): Promise<any> {
  const api = getApiClient();
  return api.get(`/orgs/${orgId}/projects/by-slug/${slug}`);
}

/**
 * List all projects
 */
export async function projectsListCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching projects...').start();

  try {
    const api = getApiClient();
    const projects = await api.get<any[]>(`/orgs/${orgId}/projects`);

    spinner.stop();

    if (!projects || projects.length === 0) {
      console.log(chalk.yellow('\nNo projects found. Create one in the dashboard first.\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n📦 Projects (${projects.length})\n`));

    projects.forEach((project: any) => {
      console.log(chalk.white.bold(project.name));
      console.log(chalk.gray(`  Slug: ${project.slug}`));
      if (project.description) {
        console.log(chalk.gray(`  Description: ${project.description}`));
      }
      console.log(chalk.gray(`  Languages: ${project.languages.join(', ')}`));
      console.log(chalk.gray(`  Default: ${project.defaultLanguage}`));
      if (project.modules && project.modules.length > 0) {
        console.log(chalk.gray(`  Modules: ${project.modules.join(', ')}`));
      }
      console.log('');
    });

    console.log(chalk.blue('To export translations, run:'));
    console.log(chalk.white(`  langctl export ${projects[0].slug} -l en\n`));
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch projects'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Create new project
 */
export async function projectsCreateCommand(name: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Creating project...').start();

  try {
    const api = getApiClient();
    const languages = options.languages ? options.languages.split(',') : ['en'];
    const defaultLanguage = options.defaultLanguage || languages[0];

    const project = await api.post<any>(`/orgs/${orgId}/projects`, {
      name,
      description: options.description,
      languages,
      defaultLanguage
    });

    spinner.succeed(chalk.green(`Created project: ${name} (${project.slug})`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to create project'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get project details
 */
export async function projectsGetCommand(slug: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching project...').start();

  try {
    const project = await resolveProject(orgId, slug);

    spinner.stop();

    console.log(chalk.blue.bold('\n📦 Project Details\n'));
    console.log(chalk.white.bold(project.name));
    console.log(chalk.gray(`Slug: ${project.slug}`));
    console.log(chalk.gray(`ID: ${project.id}`));
    if (project.description) {
      console.log(chalk.gray(`Description: ${project.description}`));
    }
    console.log(chalk.gray(`Languages: ${project.languages.join(', ')}`));
    console.log(chalk.gray(`Default Language: ${project.defaultLanguage}`));
    if (project.modules && project.modules.length > 0) {
      console.log(chalk.gray(`Modules: ${project.modules.join(', ')}`));
    }
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to fetch project "${slug}"`));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Update project
 */
export async function projectsUpdateCommand(slug: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Updating project...').start();

  try {
    const project = await resolveProject(orgId, slug);

    const api = getApiClient();
    const updateData: any = {};
    if (options.name) updateData.name = options.name;
    if (options.description !== undefined) updateData.description = options.description;
    if (options.defaultLanguage) updateData.defaultLanguage = options.defaultLanguage;

    await api.patch(`/orgs/${orgId}/projects/${project.id}`, updateData);

    spinner.succeed(chalk.green(`Updated project: ${slug}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to update project'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Delete project
 */
export async function projectsDeleteCommand(slug: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Deleting project...').start();

  try {
    const project = await resolveProject(orgId, slug);

    const api = getApiClient();
    await api.delete(`/orgs/${orgId}/projects/${project.id}`);

    spinner.succeed(chalk.green(`Deleted project: ${slug}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to delete project'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Add language to project
 */
export async function projectsAddLanguageCommand(slug: string, language: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora(`Adding language ${language}...`).start();

  try {
    const project = await resolveProject(orgId, slug);

    const api = getApiClient();
    await api.post(`/orgs/${orgId}/projects/${project.id}/languages`, { code: language });

    spinner.succeed(chalk.green(`Added language "${language}" to project "${slug}"`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to add language'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Remove language from project
 */
export async function projectsRemoveLanguageCommand(slug: string, language: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora(`Removing language ${language}...`).start();

  try {
    const project = await resolveProject(orgId, slug);

    const api = getApiClient();
    await api.delete(`/orgs/${orgId}/projects/${project.id}/languages/${language}`);

    spinner.succeed(chalk.green(`Removed language "${language}" from project "${slug}"`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to remove language'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get project statistics
 */
export async function projectsStatsCommand(slug: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching statistics...').start();

  try {
    const project = await resolveProject(orgId, slug);

    const api = getApiClient();
    const stats = await api.get<any>(`/orgs/${orgId}/projects/${project.id}/stats`);

    spinner.stop();

    console.log(chalk.blue.bold('\n📊 Project Statistics\n'));
    console.log(chalk.white(`Total Keys: ${stats.totalKeys}`));
    console.log(chalk.green(`Published Keys: ${stats.publishedKeys}`));
    console.log(chalk.yellow(`Unpublished Keys: ${stats.unpublishedKeys}`));
    console.log(chalk.white(`Language Count: ${stats.languageCount}`));
    if (stats.modules && stats.modules.length > 0) {
      console.log(chalk.white(`Modules: ${stats.modules.length}`));
      console.log(chalk.gray(`  ${stats.modules.join(', ')}`));
    }
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch statistics'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
