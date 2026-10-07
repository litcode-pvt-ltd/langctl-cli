import chalk from 'chalk';
import { relative, resolve } from 'path';
import { loadProjectConfig } from '../core/config.js';
import { usageError } from '../core/errors.js';
import { getSession } from '../core/http.js';
import { log, printJson, runtime, spinner } from '../core/output.js';
import { assertLanguages, getProject, projectSlugFrom } from '../core/project.js';
import { getFormat } from '../formats/index.js';
import { readTranslationFile, uploadTranslations } from './push.js';

interface ImportOptions {
  language?: string;
  format?: string;
  module?: string;
  overwrite?: boolean;
  publish?: boolean;
  dryRun?: boolean;
}

/**
 * `langctl import [project] <file> --language <code>` — upload one file.
 * The project may be omitted when langctl.json names it.
 */
export async function importCommand(first: string, second: string | undefined, opts: ImportOptions): Promise<void> {
  const [projectArg, file] = second === undefined ? [undefined, first] : [first, second];
  const session = await getSession();
  const project = await getProject(session, projectSlugFrom(projectArg));
  const language = opts.language ?? loadProjectConfig()?.config.sourceLanguage ?? project.defaultLanguage;
  if (!opts.language) log.info(chalk.dim(`No --language given; importing as ${language} (the project's default).`));
  assertLanguages(project, [language]);

  const path = resolve(file);
  const translations = readTranslationFile(path, opts.format ? getFormat(opts.format) : undefined, language);
  if (Object.keys(translations).length === 0) throw usageError(`${relative(process.cwd(), path)} contains no translations.`);

  const spin = spinner(`${opts.dryRun ? 'Checking' : 'Importing'} ${Object.keys(translations).length} keys…`);
  let result;
  try {
    result = await uploadTranslations(session, project, language, translations, opts);
  } finally {
    spin.stop();
  }
  if (runtime.json) return printJson({ project: project.slug, file: relative(process.cwd(), path), dryRun: Boolean(opts.dryRun), ...result });
  log.out(`${language}  ${chalk.green(`${result.created} new`)}, ${chalk.yellow(`${result.updated} updated`)}, ${chalk.dim(`${result.unchanged} unchanged`)}${result.published !== undefined ? `, ${chalk.cyan(`${result.published} published`)}` : ''}${opts.dryRun ? chalk.dim('  (dry run)') : ''}`);
  if (!opts.overwrite && result.unchanged > 0) log.info(chalk.dim('Existing translations are kept unless you pass --overwrite.'));
}
