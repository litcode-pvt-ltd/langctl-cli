import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey } from '../auth.js';

const LIST_PROJECTS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/list-projects';
const MANAGE_PROJECTS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/manage-projects';

interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  default_language: string;
  languages: string[];
  modules: string[];
  created_at: string;
}

interface ListProjectsResponse {
  success: boolean;
  projects?: Project[];
  error?: string;
}

export async function projectsListCommand(): Promise<void> {
  // Check authentication
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    console.log(chalk.red('✗ API key not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching projects...').start();

  try {
    // Call list-projects Edge Function
    const response = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as ListProjectsResponse;

    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch projects');
    }

    spinner.stop();

    if (!data.projects || data.projects.length === 0) {
      console.log(chalk.yellow('\nNo projects found. Create one in the dashboard first.\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n📦 Projects (${data.projects.length})\n`));

    data.projects.forEach((project: Project) => {
      console.log(chalk.white.bold(project.name));
      console.log(chalk.gray(`  Slug: ${project.slug}`));
      if (project.description) {
        console.log(chalk.gray(`  Description: ${project.description}`));
      }
      console.log(chalk.gray(`  Languages: ${project.languages.join(', ')}`));
      console.log(chalk.gray(`  Default: ${project.default_language}`));
      if (project.modules && project.modules.length > 0) {
        console.log(chalk.gray(`  Modules: ${project.modules.join(', ')}`));
      }
      console.log('');
    });

    console.log(chalk.blue('To export translations, run:'));
    console.log(chalk.white(`  langctl export ${data.projects[0].slug} -l en\n`));
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

  const apiKey = getApiKey();
  const spinner = ora('Creating project...').start();

  try {
    const languages = options.languages ? options.languages.split(',') : ['en'];
    const defaultLanguage = options.defaultLanguage || languages[0];

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'create',
        name,
        description: options.description,
        languages,
        defaultLanguage
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(`Created project: ${name} (${data.project.slug})`));
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

  const apiKey = getApiKey();
  const spinner = ora('Fetching project...').start();

  try {
    // Get project from list first
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    spinner.stop();

    console.log(chalk.blue.bold('\n📦 Project Details\n'));
    console.log(chalk.white.bold(project.name));
    console.log(chalk.gray(`Slug: ${project.slug}`));
    console.log(chalk.gray(`ID: ${project.id}`));
    if (project.description) {
      console.log(chalk.gray(`Description: ${project.description}`));
    }
    console.log(chalk.gray(`Languages: ${project.languages.join(', ')}`));
    console.log(chalk.gray(`Default Language: ${project.default_language}`));
    if (project.modules && project.modules.length > 0) {
      console.log(chalk.gray(`Modules: ${project.modules.join(', ')}`));
    }
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch project'));
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

  const apiKey = getApiKey();
  const spinner = ora('Updating project...').start();

  try {
    // Get project ID from slug
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    const updateData: any = { projectId: project.id, action: 'update' };
    if (options.name) updateData.name = options.name;
    if (options.description !== undefined) updateData.description = options.description;
    if (options.languages) updateData.languages = options.languages.split(',');
    if (options.defaultLanguage) updateData.defaultLanguage = options.defaultLanguage;

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify(updateData)
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

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

  const apiKey = getApiKey();
  const spinner = ora('Deleting project...').start();

  try {
    // Get project ID from slug
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'delete',
        projectId: project.id
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

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

  const apiKey = getApiKey();
  const spinner = ora(`Adding language ${language}...`).start();

  try {
    // Get project ID from slug
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'add-language',
        projectId: project.id,
        language
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
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

  const apiKey = getApiKey();
  const spinner = ora(`Removing language ${language}...`).start();

  try {
    // Get project ID from slug
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'remove-language',
        projectId: project.id,
        language
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
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

  const apiKey = getApiKey();
  const spinner = ora('Fetching statistics...').start();

  try {
    // Get project ID from slug
    const listResponse = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      }
    });

    const listData = await listResponse.json() as any;
    const project = listData.projects?.find((p: any) => p.slug === slug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${slug}" not found`));
      return;
    }

    const response = await fetch(MANAGE_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'stats',
        projectId: project.id
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    console.log(chalk.blue.bold('\n📊 Project Statistics\n'));
    console.log(chalk.white(`Total Keys: ${data.stats.total_keys}`));
    console.log(chalk.green(`Published Keys: ${data.stats.published_keys}`));
    console.log(chalk.yellow(`Unpublished Keys: ${data.stats.unpublished_keys}`));
    console.log(chalk.white(`Modules: ${data.stats.modules}`));
    if (data.stats.module_names && data.stats.module_names.length > 0) {
      console.log(chalk.gray(`  ${data.stats.module_names.join(', ')}`));
    }
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch statistics'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
