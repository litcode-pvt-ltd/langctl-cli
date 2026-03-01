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
 * Find a key by exact name within a project (search + exact match)
 */
async function findKeyByName(orgId: string, projectId: string, keyName: string): Promise<any | null> {
  const api = getApiClient();
  const result = await api.get<any>(`/orgs/${orgId}/projects/${projectId}/keys`, {
    search: keyName,
    pageSize: '100'
  });
  const key = result.data?.find((k: any) => k.key === keyName);
  return key || null;
}

/**
 * List translation keys
 */
export async function listKeysCommand(projectSlug: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching keys...').start();

  try {
    const project = await resolveProject(orgId, projectSlug);

    const api = getApiClient();
    const params: Record<string, string> = {
      page: '1',
      pageSize: options.limit || '100'
    };
    if (options.module) params.module = options.module;
    if (options.search) params.search = options.search;
    if (options.published) params.published = 'true';

    const result = await api.get<any>(`/orgs/${orgId}/projects/${project.id}/keys`, params);

    spinner.stop();

    const keys = result.data;
    const total = result.pagination?.total;

    if (!keys || keys.length === 0) {
      console.log(chalk.yellow('\nNo keys found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n🔑 Translation Keys (${keys.length}${total ? ` of ${total}` : ''})\n`));

    keys.forEach((key: any) => {
      console.log(chalk.white.bold(key.key));
      if (key.description) {
        console.log(chalk.gray(`  Description: ${key.description}`));
      }
      if (key.module) {
        console.log(chalk.gray(`  Module: ${key.module}`));
      }
      console.log(chalk.gray(`  Published: ${key.published ? chalk.green('Yes') : chalk.yellow('No')}`));
      const langs = Object.keys(key.translations || {});
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Fetching key...').start();

  try {
    const project = await resolveProject(orgId, projectSlug);

    const key = await findKeyByName(orgId, project.id, keyName);
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
    Object.entries(key.translations || {}).forEach(([lang, value]) => {
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Creating key...').start();

  try {
    const project = await resolveProject(orgId, projectSlug);

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

    const api = getApiClient();
    await api.post(`/orgs/${orgId}/projects/${project.id}/keys`, {
      key: keyName,
      translations: Object.keys(translations).length > 0 ? translations : undefined,
      description: options.description,
      module: options.module,
      tags: options.tags ? options.tags.split(',') : undefined
    });

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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Deleting key...').start();

  try {
    const project = await resolveProject(orgId, projectSlug);

    const key = await findKeyByName(orgId, project.id, keyName);
    if (!key) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    const api = getApiClient();
    await api.delete(`/orgs/${orgId}/projects/${project.id}/keys/${key.id}`);

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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const spinner = ora('Updating translation...').start();

  try {
    const project = await resolveProject(orgId, projectSlug);

    const key = await findKeyByName(orgId, project.id, keyName);
    if (!key) {
      spinner.fail(chalk.red(`Key "${keyName}" not found`));
      return;
    }

    const api = getApiClient();
    await api.patch(
      `/orgs/${orgId}/projects/${project.id}/keys/${key.id}/translations/${options.language}`,
      { value: options.value }
    );

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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  const action = options.unpublish ? 'unpublish' : 'publish';
  const spinner = ora(`${action === 'publish' ? 'Publishing' : 'Unpublishing'} keys...`).start();

  try {
    const project = await resolveProject(orgId, projectSlug);

    // List all keys to match names to IDs
    const api = getApiClient();
    const result = await api.get<any>(`/orgs/${orgId}/projects/${project.id}/keys`, {
      pageSize: '1000'
    });

    const keyIds = result.data
      ?.filter((k: any) => keys.includes(k.key))
      .map((k: any) => k.id) || [];

    if (keyIds.length === 0) {
      spinner.fail(chalk.red('No matching keys found'));
      return;
    }

    const response = await api.post<any>(
      `/orgs/${orgId}/projects/${project.id}/keys/bulk-publish`,
      { keyIds, published: !options.unpublish }
    );

    spinner.succeed(chalk.green(response.message || `${action === 'publish' ? 'Published' : 'Unpublished'} ${response.count} key(s)`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to ${action} keys`));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
