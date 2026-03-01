import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';

interface ImportOptions {
  language: string;
  overwrite?: boolean;
  module?: string;
}

/**
 * Parse translation file based on extension
 */
function parseTranslationFile(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, 'utf-8');
  const ext = filePath.split('.').pop()?.toLowerCase();

  if (ext === 'json') {
    const parsed = JSON.parse(content);

    // Check if it's nested JSON and flatten it
    if (isNestedObject(parsed)) {
      return flattenObject(parsed);
    }

    return parsed;
  }

  throw new Error(`Unsupported file format: .${ext}. Only JSON files are currently supported.`);
}

/**
 * Check if object has nested objects
 */
function isNestedObject(obj: any): boolean {
  return Object.values(obj).some(value =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

/**
 * Flatten nested object to dot-notation keys
 */
function flattenObject(obj: any, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  Object.entries(obj).forEach(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      result[fullKey] = value;
    } else if (typeof value === 'object' && value !== null) {
      Object.assign(result, flattenObject(value, fullKey));
    }
  });

  return result;
}

/**
 * Import translations command
 */
export async function importCommand(
  projectSlug: string,
  filePath: string,
  options: ImportOptions
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

  const spinner = ora('Loading file...').start();

  try {
    // Resolve file path
    const resolvedPath = resolve(filePath);

    // Parse translation file
    spinner.text = 'Parsing translation file...';
    const translations = parseTranslationFile(resolvedPath);

    const keyCount = Object.keys(translations).length;
    if (keyCount === 0) {
      spinner.warn(chalk.yellow('No translations found in file'));
      return;
    }

    spinner.text = 'Fetching project...';

    // Get project by slug
    const api = getApiClient();
    const project = await api.get<any>(`/orgs/${orgId}/projects/by-slug/${projectSlug}`);

    // Validate language
    if (!project.languages.includes(options.language)) {
      spinner.fail(chalk.red(`Language "${options.language}" not found in project`));
      console.log(chalk.yellow(`Available languages: ${project.languages.join(', ')}\n`));
      return;
    }

    spinner.text = `Importing ${keyCount} translations...`;

    // Push translations via REST API
    const body: any = {
      language: options.language,
      translations,
      overwriteExisting: options.overwrite !== false // default true
    };
    if (options.module) body.module = options.module;

    const data = await api.post<any>(`/orgs/${orgId}/projects/${project.id}/import`, body);

    spinner.succeed(chalk.green('Import completed successfully'));

    console.log(chalk.green(`\n✓ Created: ${data.created}`));
    console.log(chalk.blue(`✓ Updated: ${data.updated}`));
    console.log(chalk.yellow(`⊘ Skipped: ${data.skipped}`));
    console.log(chalk.white(`  Total: ${data.total}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to import translations'));

    if (error.code === 'ENOENT') {
      console.error(chalk.red(`Error: File not found: ${filePath}\n`));
    } else if (error instanceof SyntaxError) {
      console.error(chalk.red(`Error: Invalid JSON file\n`));
    } else {
      console.error(chalk.red(`Error: ${error.message}\n`));
    }
  }
}
