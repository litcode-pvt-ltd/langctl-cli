import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';
import { exportTranslations, ExportFormat, TranslationKey } from '../exporters/index.js';

interface ExportOptions {
  language?: string;
  format?: string;
  output?: string;
  module?: string;
  includeUnpublished?: boolean;
}

/**
 * Map CLI format names to exporter format names
 */
const formatMap: Record<string, ExportFormat> = {
  'flat-json': 'json',
  'nested-json': 'json-nested',
  'i18n-json': 'json',
  'android-xml': 'android',
  'ios-strings': 'ios',
  'flutter-arb': 'flutter',
  // Also accept exporter format names directly
  'json': 'json',
  'json-nested': 'json-nested',
  'android': 'android',
  'ios': 'ios',
  'flutter': 'flutter',
};

/**
 * Get file extension for a given export format
 */
function getFileExtension(format: ExportFormat, language: string): string {
  switch (format) {
    case 'json':
    case 'json-nested':
      return `${language}.json`;
    case 'android':
      return `strings.xml`;
    case 'ios':
      return `Localizable.strings`;
    case 'flutter':
      return `intl_${language}.arb`;
    default:
      return `${language}.json`;
  }
}

/**
 * Export translations command
 */
export async function exportCommand(projectSlug: string, options: ExportOptions): Promise<void> {
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
    const api = getApiClient();

    // Resolve project by slug
    const project = await api.get<any>(`/orgs/${orgId}/projects/by-slug/${projectSlug}`);

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

    // Resolve format
    const cliFormat = options.format || 'flat-json';
    const exportFormat = formatMap[cliFormat];
    if (!exportFormat) {
      spinner.fail(chalk.red(`Unsupported format: ${cliFormat}`));
      console.log(chalk.yellow(`Valid formats: ${Object.keys(formatMap).join(', ')}\n`));
      return;
    }

    const publishedOnly = !options.includeUnpublished;

    // Export each language
    for (const language of languages) {
      spinner.text = `Exporting ${language}...`;

      // Fetch flat translations from the API
      const params: Record<string, string> = {
        language,
        publishedOnly: publishedOnly ? 'true' : 'false'
      };
      if (options.module) params.module = options.module;

      const result = await api.get<any>(`/orgs/${orgId}/projects/${project.id}/export`, params);

      // Convert flat translations to TranslationKey array for the exporter
      const flatTranslations = result.translations || {};
      const translationKeys: TranslationKey[] = Object.entries(flatTranslations).map(([key, value]) => ({
        key,
        translations: { [language]: value as string }
      }));

      // Use client-side exporter for format conversion
      const exportResult = exportTranslations(translationKeys, language, exportFormat);

      // Determine output path
      const outputPath = options.output
        ? options.output
        : join(process.cwd(), 'translations', getFileExtension(exportFormat, language));

      // Ensure directory exists
      mkdirSync(dirname(outputPath), { recursive: true });

      // Write file
      writeFileSync(outputPath, exportResult.content, 'utf-8');

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
