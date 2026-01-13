import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { isAuthenticated, getApiKey } from '../auth.js';

const PUSH_TRANSLATIONS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/push-translations';
const LIST_PROJECTS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/list-projects';

interface ImportOptions {
  language: string;
  overwrite?: boolean;
  publish?: boolean;
}

interface PushResponse {
  success: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
  message?: string;
}

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

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as any;
    if (!data.success || !data.projects) {
      return null;
    }

    return data.projects.find((p: Project) => p.slug === slug) || null;
  } catch (error) {
    return null;
  }
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
    const project = await getProjectBySlug(apiKey, projectSlug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      console.log(chalk.yellow('\nRun "langctl projects list" to see available projects.\n'));
      return;
    }

    // Validate language
    if (!project.languages.includes(options.language)) {
      spinner.fail(chalk.red(`Language "${options.language}" not found in project`));
      console.log(chalk.yellow(`Available languages: ${project.languages.join(', ')}\n`));
      return;
    }

    spinner.text = `Importing ${keyCount} translations...`;

    // Push translations
    const response = await fetch(PUSH_TRANSLATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey
      },
      body: JSON.stringify({
        projectId: project.id,
        language: options.language,
        translations,
        publish: options.publish || false,
        createMissing: true
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as any;
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as PushResponse;

    if (!data.success && data.errors.length > 0) {
      spinner.fail(chalk.red('Import completed with errors'));

      console.log(chalk.green(`\n✓ Created: ${data.created}`));
      console.log(chalk.blue(`✓ Updated: ${data.updated}`));
      console.log(chalk.yellow(`⊘ Skipped: ${data.skipped}`));
      console.log(chalk.red(`✗ Errors: ${data.errors.length}\n`));

      if (data.errors.length > 0) {
        console.log(chalk.red('Errors:'));
        data.errors.slice(0, 5).forEach(err => {
          console.log(chalk.red(`  - ${err.key}: ${err.error}`));
        });
        if (data.errors.length > 5) {
          console.log(chalk.gray(`  ... and ${data.errors.length - 5} more errors\n`));
        }
      }
      return;
    }

    spinner.succeed(chalk.green('Import completed successfully'));

    console.log(chalk.green(`\n✓ Created: ${data.created}`));
    console.log(chalk.blue(`✓ Updated: ${data.updated}`));
    console.log(chalk.yellow(`⊘ Skipped: ${data.skipped}`));

    if (options.publish) {
      console.log(chalk.green('✓ Keys published'));
    }

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
