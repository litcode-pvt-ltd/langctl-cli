import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';
import { exportTranslations, ExportFormat, TranslationKey } from '../exporters/index.js';

export interface PullOptions {
  language?: string;
  format?: string;
  output?: string;
  dir?: string;  // Base output directory
  publishedOnly?: boolean;
}

/**
 * Get platform-specific output directory
 */
function getPlatformDirectory(format: ExportFormat): string {
  const platformDirs: Record<ExportFormat, string> = {
    'json': 'i18n',
    'json-nested': 'i18n',
    'ios': 'ios',
    'android': 'android',
    'flutter': 'flutter'
  };

  return platformDirs[format] || 'i18n';
}

export async function pullCommand(projectIdentifier: string, options: PullOptions): Promise<void> {
  // Check authentication
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl auth <api-key>" again.\n'));
    return;
  }

  // Set defaults
  const format = (options.format || 'json') as ExportFormat;
  const publishedOnly = options.publishedOnly !== false; // Default to true
  const specificLanguage = options.language;
  const baseDir = options.dir || './translations';

  // Validate format
  const validFormats: ExportFormat[] = ['json', 'json-nested', 'ios', 'android', 'flutter'];
  if (!validFormats.includes(format)) {
    console.log(chalk.red(`✗ Invalid format: ${format}`));
    console.log(chalk.yellow(`Valid formats: ${validFormats.join(', ')}\n`));
    return;
  }

  const spinner = ora('Resolving project...').start();

  try {
    const api = getApiClient();

    // Resolve project by slug
    const project = await api.get<any>(`/orgs/${orgId}/projects/by-slug/${projectIdentifier}`);

    if (!project) {
      spinner.fail(chalk.red(`Project "${projectIdentifier}" not found`));
      console.log(chalk.yellow('\nRun "langctl projects list" to see available projects.\n'));
      return;
    }

    // Determine which languages to pull
    let languagesToPull: string[];

    if (specificLanguage) {
      if (!project.languages.includes(specificLanguage)) {
        spinner.fail(chalk.red(`Language "${specificLanguage}" not found in project`));
        console.log(chalk.yellow(`Available languages: ${project.languages.join(', ')}\n`));
        return;
      }
      languagesToPull = [specificLanguage];
    } else {
      languagesToPull = project.languages;
    }

    spinner.text = `Fetching translations for "${project.name}"...`;

    // Get platform directory
    const platformDir = getPlatformDirectory(format);

    // Export translations for each language
    const exportedFiles: string[] = [];
    let totalKeyCount = 0;

    for (const language of languagesToPull) {
      spinner.text = `Exporting ${language}...`;

      // Fetch flat translations from the API
      const result = await api.get<any>(`/orgs/${orgId}/projects/${project.id}/export`, {
        language,
        publishedOnly: publishedOnly ? 'true' : 'false'
      });

      // Convert flat translations to TranslationKey array for the exporter
      const flatTranslations = result.translations || {};
      const translationKeys: TranslationKey[] = Object.entries(flatTranslations).map(([key, value]) => ({
        key,
        translations: { [language]: value as string }
      }));

      if (totalKeyCount === 0) {
        totalKeyCount = translationKeys.length;
      }

      const exportResult = exportTranslations(translationKeys, language, format);

      // Determine output path
      let outputPath: string;

      if (options.output) {
        // If custom output is specified and multiple languages, append language code
        if (languagesToPull.length > 1) {
          const ext = exportResult.filename.split('.').pop();
          const base = options.output.replace(/\.[^.]+$/, '');
          outputPath = `${base}-${language}.${ext}`;
        } else {
          outputPath = options.output;
        }
      } else {
        // Default output path: <baseDir>/<platform>/<language>.<ext>
        const ext = exportResult.filename.split('.').pop();
        outputPath = join(baseDir, platformDir, `${language}.${ext}`);
      }

      // Create directory if it doesn't exist
      const dir = dirname(outputPath);
      mkdirSync(dir, { recursive: true });

      writeFileSync(outputPath, exportResult.content, 'utf-8');
      exportedFiles.push(outputPath);

      spinner.succeed(chalk.green(`Exported ${language} → ${outputPath}`));

      // Restart spinner if more languages remain
      if (languagesToPull.indexOf(language) < languagesToPull.length - 1) {
        spinner.start();
      }
    }

    // Summary
    console.log(chalk.hex('#10b981').bold('\n📦 Export Summary:'));
    console.log(chalk.white(`  Project: ${project.name}`));
    console.log(chalk.white(`  Format: ${format}`));
    console.log(chalk.white(`  Platform: ${platformDir}`));
    console.log(chalk.white(`  Output: ${baseDir}`));
    console.log(chalk.white(`  Keys: ${totalKeyCount}`));
    console.log(chalk.white(`  Languages: ${languagesToPull.join(', ')}`));
    console.log(chalk.white(`  Files: ${exportedFiles.length}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to pull translations'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
