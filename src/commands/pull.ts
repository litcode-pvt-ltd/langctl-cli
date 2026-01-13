import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { getSupabase } from '../supabase.js';
import { isAuthenticated, getOrganizationId } from '../auth.js';
import { exportTranslations, ExportFormat, TranslationKey } from '../exporters/index.js';
import { config } from '../config.js';

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

/**
 * Resolve project identifier (name, slug, or UUID) to project UUID
 */
async function resolveProjectId(identifier: string, organizationId: string): Promise<string | null> {
  const supabase = getSupabase();
  
  // Check if it's already a UUID (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(identifier)) {
    // Verify it exists
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', identifier)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();
    
    return data ? identifier : null;
  }
  
  // Try to match by slug (case-insensitive)
  const { data: bySlug } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('slug', identifier)
    .is('deleted_at', null)
    .single();
  
  if (bySlug) {
    return bySlug.id;
  }
  
  // Try to match by name (case-insensitive)
  const { data: byName } = await supabase
    .from('projects')
    .select('id')
    .eq('organization_id', organizationId)
    .ilike('name', identifier)
    .is('deleted_at', null)
    .single();
  
  if (byName) {
    return byName.id;
  }
  
  return null;
}

export async function pullCommand(projectIdentifier: string, options: PullOptions): Promise<void> {
  // Check authentication
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const organizationId = getOrganizationId();
  if (!organizationId) {
    console.log(chalk.red('✗ Organization ID not found. Please run "langctl init" again.\n'));
    return;
  }

  // Set defaults
  const format = (options.format || 'json') as ExportFormat;
  const publishedOnly = options.publishedOnly !== false; // Default to true
  const specificLanguage = options.language; // If not specified, pull all languages
  const baseDir = options.dir || './translations'; // Default to ./translations

  // Validate format
  const validFormats: ExportFormat[] = ['json', 'json-nested', 'ios', 'android', 'flutter'];
  if (!validFormats.includes(format)) {
    console.log(chalk.red(`✗ Invalid format: ${format}`));
    console.log(chalk.yellow(`Valid formats: ${validFormats.join(', ')}\n`));
    return;
  }

  const spinner = ora('Resolving project...').start();

  try {
    const supabase = getSupabase();

    // Resolve project identifier to UUID
    const projectId = await resolveProjectId(projectIdentifier, organizationId);
    
    if (!projectId) {
      spinner.fail(chalk.red(`Project "${projectIdentifier}" not found`));
      console.log(chalk.yellow('\nRun "langctl projects list" to see available projects.\n'));
      return;
    }

    // Fetch project details
    spinner.text = 'Fetching project...';
    
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, slug, languages, default_language')
      .eq('id', projectId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .single();

    if (projectError || !project) {
      spinner.fail(chalk.red('Project not found or access denied'));
      return;
    }

    // Determine which languages to pull
    let languagesToPull: string[];
    
    if (specificLanguage) {
      // Check if specified language exists in project
      if (!project.languages.includes(specificLanguage)) {
        spinner.fail(chalk.red(`Language "${specificLanguage}" not found in project`));
        console.log(chalk.yellow(`Available languages: ${project.languages.join(', ')}\n`));
        return;
      }
      languagesToPull = [specificLanguage];
    } else {
      // Pull all languages
      languagesToPull = project.languages;
    }

    spinner.text = `Fetching translations for "${project.name}"...`;

    // Fetch translation keys
    let query = supabase
      .from('translation_keys')
      .select('key, translations, description, module')
      .eq('project_id', projectId)
      .is('deleted_at', null);

    if (publishedOnly) {
      query = query.eq('published', true);
    }

    const { data: keys, error: keysError } = await query;

    if (keysError) {
      spinner.fail(chalk.red('Failed to fetch translations'));
      console.error(chalk.red(`Error: ${keysError.message}\n`));
      return;
    }

    if (!keys || keys.length === 0) {
      spinner.fail(chalk.yellow('No translations found'));
      console.log(chalk.yellow(`\nNo ${publishedOnly ? 'published ' : ''}translations found for this project.\n`));
      return;
    }

    spinner.succeed(chalk.green(`Found ${keys.length} translation keys`));

    // Get platform directory
    const platformDir = getPlatformDirectory(format);

    // Export translations for each language
    const exportedFiles: string[] = [];
    
    for (const language of languagesToPull) {
      spinner.start(`Exporting ${language}...`);

      const result = exportTranslations(keys as TranslationKey[], language, format);

      // Determine output path
      let outputPath: string;

      if (options.output) {
        // If custom output is specified and multiple languages, append language code
        if (languagesToPull.length > 1) {
          const ext = result.filename.split('.').pop();
          const base = options.output.replace(/\.[^.]+$/, '');
          outputPath = `${base}-${language}.${ext}`;
        } else {
          outputPath = options.output;
        }
      } else {
        // Default output path: <baseDir>/<platform>/<language>.<ext>
        const ext = result.filename.split('.').pop();
        outputPath = join(baseDir, platformDir, `${language}.${ext}`);
      }

      // Create directory if it doesn't exist
      const dir = dirname(outputPath);
      mkdirSync(dir, { recursive: true });

      writeFileSync(outputPath, result.content, 'utf-8');
      exportedFiles.push(outputPath);

      spinner.succeed(chalk.green(`Exported ${language} → ${outputPath}`));
    }

    // Summary
    console.log(chalk.hex('#10b981').bold('\n📦 Export Summary:'));
    console.log(chalk.white(`  Project: ${project.name}`));
    console.log(chalk.white(`  Format: ${format}`));
    console.log(chalk.white(`  Platform: ${platformDir}`));
    console.log(chalk.white(`  Output: ${baseDir}`));
    console.log(chalk.white(`  Keys: ${keys.length}`));
    console.log(chalk.white(`  Languages: ${languagesToPull.join(', ')}`));
    console.log(chalk.white(`  Files: ${exportedFiles.length}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to pull translations'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
