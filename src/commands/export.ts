import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { isAuthenticated, getApiKey } from '../auth.js';

const EDGE_FUNCTION_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/export-translations';
const LIST_PROJECTS_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/list-projects';

type ExportFormat = 'i18n-json' | 'android-xml' | 'ios-strings' | 'flutter-arb' | 'flat-json' | 'nested-json';

interface ExportOptions {
  language?: string;
  format?: ExportFormat;
  output?: string;
  module?: string;
  includeUnpublished?: boolean;
}

interface ExportResponse {
  success: boolean;
  content?: string;
  filename?: string;
  mimeType?: string;
  error?: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
  languages: string[];
  default_language: string;
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
 * Export translations command
 */
export async function exportCommand(projectSlug: string, options: ExportOptions): Promise<void> {
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

  const spinner = ora('Fetching project...').start();

  try {
    // Get project by slug
    const project = await getProjectBySlug(apiKey, projectSlug);

    if (!project) {
      spinner.fail(chalk.red(`Project "${projectSlug}" not found`));
      console.log(chalk.yellow('\nRun "langctl projects list" to see available projects.\n'));
      return;
    }

    spinner.text = 'Exporting translations...';

    // Determine languages to export
    const languages = options.language
      ? [options.language]
      : project.languages;

    // Validate language if specified
    if (options.language && !project.languages.includes(options.language)) {
      spinner.fail(chalk.red(`Language "${options.language}" not found in project`));
      console.log(chalk.yellow(`Available languages: ${project.languages.join(', ')}\n`));
      return;
    }

    const format = options.format || 'flat-json';
    const publishedOnly = !options.includeUnpublished;

    // Export each language
    for (const language of languages) {
      spinner.text = `Exporting ${language}...`;

      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({
          projectId: project.id,
          language,
          format,
          publishedOnly,
          module: options.module
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as any;
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as ExportResponse;

      if (!data.success || !data.content) {
        throw new Error(data.error || 'Failed to export translations');
      }

      // Determine output path
      const outputPath = options.output
        ? options.output
        : join(process.cwd(), 'translations', data.filename || `${language}.json`);

      // Ensure directory exists
      mkdirSync(dirname(outputPath), { recursive: true });

      // Write file
      writeFileSync(outputPath, data.content, 'utf-8');

      spinner.succeed(chalk.green(`Exported ${language} → ${outputPath}`));

      // Show spinner again if there are more languages
      if (languages.indexOf(language) < languages.length - 1) {
        spinner.start();
      }
    }

    console.log(chalk.blue(`\n✓ Exported ${languages.length} language(s) successfully\n`));

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to export translations'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
