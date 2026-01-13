import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey } from '../auth.js';

const EDGE_FUNCTION_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/manage-translation-keys';
const LIST_PROJECTS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/list-projects';

interface Project {
  id: string;
  name: string;
  slug: string;
  languages: string[];
}

/**
 * Get project by slug
 */
async function getProjectBySlug(apiKey: string, slug: string): Promise<Project | null> {
  try {
    const response = await fetch(LIST_PROJECTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      }
    });

    if (!response.ok) return null;

    const data = await response.json() as any;
    if (!data.success || !data.projects) return null;

    return data.projects.find((p: Project) => p.slug === slug) || null;
  } catch (error) {
    return null;
  }
}

/**
 * List translation keys
 */
export async function listKeysCommand(projectSlug: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching keys...').start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list',
        projectId: project.id,
        module: options.module,
        published: options.published,
        search: options.search,
        limit: options.limit || 100,
        offset: options.offset || 0
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    if (!data.keys || data.keys.length === 0) {
      console.log(chalk.yellow('\nNo keys found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n🔑 Translation Keys (${data.keys.length}${data.total ? ` of ${data.total}` : ''})\n`));

    data.keys.forEach((key: any) => {
      console.log(chalk.white.bold(key.key));
      if (key.description) {
        console.log(chalk.gray(`  Description: ${key.description}`));
      }
      if (key.module) {
        console.log(chalk.gray(`  Module: ${key.module}`));
      }
      console.log(chalk.gray(`  Published: ${key.published ? chalk.green('Yes') : chalk.yellow('No')}`));
      const langs = Object.keys(key.translations);
      if (langs.length > 0) {
        console.log(chalk.gray(`  Languages: ${langs.join(', ')}`));
      }
      console.log('');
    });

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to list keys'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get single key
 */
export async function getKeyCommand(projectSlug: string, keyName: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching key...').start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    // First list to find the key ID
    const listResponse = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list',
        projectId: project.id,
        search: keyName,
        limit: 1
      })
    });

    const listData = await listResponse.json() as any;

    if (!listData.success || !listData.keys || listData.keys.length === 0) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    const key = listData.keys.find((k: any) => k.key === keyName);
    if (!key) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    spinner.stop();

    console.log(chalk.blue.bold('\n🔑 Translation Key Details\n'));
    console.log(chalk.white.bold(`Key: ${key.key}`));
    console.log(chalk.gray(`ID: ${key.id}`));
    if (key.description) {
      console.log(chalk.gray(`Description: ${key.description}`));
    }
    if (key.module) {
      console.log(chalk.gray(`Module: ${key.module}`));
    }
    console.log(chalk.gray(`Published: ${key.published ? chalk.green('Yes') : chalk.yellow('No')}`));
    console.log(chalk.blue.bold('\nTranslations:'));
    Object.entries(key.translations).forEach(([lang, value]) => {
      console.log(chalk.white(`  ${lang}: ${value}`));
    });
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to get key'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Create translation key
 */
export async function createKeyCommand(
  projectSlug: string,
  keyName: string,
  options: any
): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Creating key...').start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    // Build translations object from --value-* options
    const translations: Record<string, string> = {};
    Object.keys(options).forEach(opt => {
      if (opt.startsWith('value')) {
        const lang = opt.replace('value', '').toLowerCase();
        if (lang) {
          translations[lang] = options[opt];
        }
      }
    });

    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'create',
        projectId: project.id,
        key: keyName,
        translations,
        description: options.description,
        module: options.module,
        tags: options.tags ? options.tags.split(',') : []
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(`Created key: ${keyName}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to create key'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Delete translation key
 */
export async function deleteKeyCommand(projectSlug: string, keyName: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Deleting key...').start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    // Find key ID
    const listResponse = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list',
        projectId: project.id,
        search: keyName,
        limit: 1
      })
    });

    const listData = await listResponse.json() as any;
    const key = listData.keys?.find((k: any) => k.key === keyName);

    if (!key) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    // Delete key
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'delete',
        projectId: project.id,
        keyId: key.id
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(`Deleted key: ${keyName}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to delete key'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Update single translation
 */
export async function translateKeyCommand(
  projectSlug: string,
  keyName: string,
  options: any
): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Updating translation...').start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    // Find key ID
    const listResponse = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list',
        projectId: project.id,
        search: keyName,
        limit: 1
      })
    });

    const listData = await listResponse.json() as any;
    const key = listData.keys?.find((k: any) => k.key === keyName);

    if (!key) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    // Update translation
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'translate',
        projectId: project.id,
        keyId: key.id,
        language: options.language,
        value: options.value
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(`Updated ${options.language} translation for ${keyName}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to update translation'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Publish/unpublish keys
 */
export async function publishKeysCommand(
  projectSlug: string,
  keys: string[],
  options: any
): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const action = options.unpublish ? 'unpublish' : 'publish';
  const spinner = ora(`${action === 'publish' ? 'Publishing' : 'Unpublishing'} keys...`).start();

  try {
    const project = await getProjectBySlug(apiKey!, projectSlug);
    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      return;
    }

    // Get key IDs
    const listResponse = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list',
        projectId: project.id,
        limit: 1000
      })
    });

    const listData = await listResponse.json() as any;
    const keyIds = listData.keys
      ?.filter((k: any) => keys.includes(k.key))
      .map((k: any) => k.id) || [];

    if (keyIds.length === 0) {
      spinner.fail(chalk.red('No matching keys found'));
      return;
    }

    // Publish/unpublish keys
    const response = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'publish',
        projectId: project.id,
        keyIds,
        published: !options.unpublish
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to ${action} keys`));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
