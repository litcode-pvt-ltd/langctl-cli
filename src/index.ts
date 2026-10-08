#!/usr/bin/env node
import { Command, CommanderError, Option } from 'commander';
import chalk from 'chalk';
import { authCommand, logoutCommand, whoamiCommand } from './commands/auth.js';
import { configCommand, formatsCommand } from './commands/config.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { initCommand } from './commands/init.js';
import { createKeyCommand, deleteKeyCommand, getKeyCommand, listKeysCommand, publishKeysCommand, updateKeyCommand } from './commands/keys.js';
import { orgInfoCommand, orgPlanCommand, orgStatsCommand } from './commands/org.js';
import {
  projectsAddLanguageCommand, projectsCreateCommand, projectsDeleteCommand, projectsGetCommand, projectsListCommand,
  projectsRemoveLanguageCommand, projectsStatsCommand, projectsUpdateCommand,
} from './commands/projects.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { translateCommand } from './commands/translate.js';
import { reviewCommand } from './commands/review.js';
import {
  getTeamMemberCommand, inviteTeamMemberCommand, listInvitationsCommand, listTeamCommand, removeTeamMemberCommand,
  revokeInvitationCommand, updateTeamRoleCommand,
} from './commands/team.js';
import { flagOverrides } from './core/config.js';
import { CliError, ExitCode, usageError } from './core/errors.js';
import { httpSettings } from './core/http.js';
import { log, printJson, runtime } from './core/output.js';
import { VERSION } from './version.js';

const collect = (value: string, previous: string[] = []) => [...previous, value];

/** Global flags, accepted before or after the subcommand (`langctl --json pull` and `langctl pull --json`). */
function withGlobals(cmd: Command): Command {
  return cmd
    .option('--json', 'machine-readable JSON output on stdout')
    .option('-q, --quiet', 'only print results and errors')
    .option('--verbose', 'log HTTP requests to stderr')
    .option('-y, --yes', 'skip confirmation prompts (required for destructive commands in CI)')
    .option('--api-key <key>', 'API key (prefer the LANGCTL_API_KEY env var)')
    .option('--api-url <url>', 'API base URL (env: LANGCTL_API_URL)')
    .option('--timeout <seconds>', 'request timeout in seconds (env: LANGCTL_TIMEOUT)')
    .option('--no-color', 'disable colors (also honors NO_COLOR)');
}

/** Wrap an action so every command shares the same error handling and exit codes. */
function run<A extends unknown[]>(fn: (...args: A) => Promise<void> | void) {
  return async (...args: A) => {
    await fn(...args);
  };
}

const program = new Command();
program
  .name('langctl')
  .description('Translation management for developers — sync i18n files between your code, CI and Langctl.')
  .version(VERSION, '-v, --version', 'print the version')
  .showHelpAfterError('(run with --help for usage)')
  .configureHelp({ sortSubcommands: false })
  .exitOverride();
withGlobals(program);

program.hook('preAction', (_root, action) => {
  const o = action.optsWithGlobals() as Record<string, unknown>;
  runtime.json = Boolean(o.json);
  runtime.quiet = Boolean(o.quiet);
  runtime.verbose = Boolean(o.verbose);
  runtime.yes = Boolean(o.yes);
  if (o.color === false || process.env.NO_COLOR) chalk.level = 0;
  if (typeof o.apiKey === 'string') flagOverrides.apiKey = o.apiKey;
  if (typeof o.apiUrl === 'string') flagOverrides.apiUrl = o.apiUrl;
  if (o.timeout !== undefined) {
    const s = Number(o.timeout);
    if (!Number.isFinite(s) || s <= 0) throw usageError('--timeout must be a positive number of seconds');
    httpSettings.timeoutMs = s * 1000;
  }
});

// ── Setup & auth ────────────────────────────────────────────────

withGlobals(program.command('init'))
  .description('set up this repository: authenticate if needed and write langctl.json')
  .option('-p, --project <slug>', 'project slug')
  .option('-f, --format <format>', 'file format (see "langctl formats")')
  .option('-o, --output <template>', 'path template for files, e.g. src/locales/{lang}.json')
  .option('--force', 'overwrite an existing langctl.json')
  .action(run(opts => initCommand(opts)));

withGlobals(program.command('auth [api-key]'))
  .description('store an API key (prefer --stdin so the key stays out of shell history)')
  .option('--stdin', 'read the API key from stdin')
  .action(run((key: string | undefined, opts) => authCommand(key, opts)));

withGlobals(program.command('logout')).description('remove the stored API key').action(run(() => logoutCommand()));
withGlobals(program.command('whoami')).alias('status').description('show the organization, key and scopes in use, and check connectivity')
  .action(run(() => whoamiCommand()));
withGlobals(program.command('config')).description('show effective configuration and where it comes from').action(run(() => configCommand()));
withGlobals(program.command('formats')).description('list supported file formats').action(run(() => formatsCommand()));

// ── Sync ────────────────────────────────────────────────────────

withGlobals(program.command('pull [project]'))
  .description('download translations into files (project/format/output default to langctl.json)')
  .option('-l, --languages <codes>', 'comma-separated languages (default: all)')
  .addOption(new Option('--language <code>').hideHelp())
  .option('-f, --format <format>', 'file format (default: json)')
  .option('-o, --output <template>', 'path template, e.g. "src/locales/{lang}.json"')
  .addOption(new Option('-d, --dir <path>', 'legacy: base directory for the default layout').hideHelp())
  .option('-m, --module <name>', 'only keys from this module')
  .option('--include-drafts', 'include unpublished keys (excluded by default)')
  .option('--include-unreviewed', 'include AI translations nobody has reviewed yet (excluded by default)')
  .addOption(new Option('--no-published-only').hideHelp())
  .option('--check', 'do not write; exit 7 if any file is out of date (for CI)')
  .option('--dry-run', 'show what would change without writing')
  .option('--require-complete', 'exit 1 if any language is missing translations')
  .action(run((project: string | undefined, opts) => pullCommand(project, { ...opts, languages: opts.languages ?? opts.language })));

withGlobals(program.command('push [project]'))
  .description('upload translation files (by default only the source language)')
  .option('-l, --languages <codes>', 'comma-separated languages, or "all" (default: source language)')
  .option('-f, --format <format>', 'file format (default: from langctl.json or file extension)')
  .option('-i, --input <template>', 'path template to read, e.g. "src/locales/{lang}.json"')
  .option('-m, --module <name>', 'assign new keys to this module')
  .option('--overwrite', 'replace existing translations (default: only add new keys/languages)')
  .option('--publish', 'publish the uploaded keys')
  .option('--dry-run', 'show what would change without uploading')
  .action(run((project: string | undefined, opts) => pushCommand(project, opts)));

withGlobals(program.command('export [project]'))
  .description('export translations to a file (one-off; "pull" is the repo workflow)')
  .option('-l, --language <code>', 'language to export (default: all)')
  .option('--languages <codes>', 'comma-separated languages')
  .option('-f, --format <format>', 'file format (default: json)')
  .option('-o, --output <path>', 'output file, or template with {lang}')
  .option('-m, --module <name>', 'only keys from this module')
  .option('--include-drafts', 'include unpublished keys')
  .addOption(new Option('--include-unpublished').hideHelp())
  .action(run((project: string | undefined, opts) => exportCommand(project, opts)));

withGlobals(program.command('import <project-or-file> [file]'))
  .description('import one translation file (project may come from langctl.json)')
  .option('-l, --language <code>', 'language of the file (default: project default language)')
  .option('-f, --format <format>', 'file format (default: from extension)')
  .option('-m, --module <name>', 'assign new keys to this module')
  .option('--overwrite', 'replace existing translations')
  .option('--publish', 'publish the imported keys')
  .option('--dry-run', 'show what would change without uploading')
  .action(run((a: string, b: string | undefined, opts) => importCommand(a, b, opts)));

// ── Projects ────────────────────────────────────────────────────

const projects = program.command('projects').alias('project').description('manage projects');
withGlobals(projects.command('list')).alias('ls').description('list projects').action(run(() => projectsListCommand()));
withGlobals(projects.command('get <slug>')).description('show a project').action(run((slug: string) => projectsGetCommand(slug)));
withGlobals(projects.command('create <name>')).description('create a project')
  .option('-d, --description <text>', 'description')
  .option('-l, --languages <codes>', 'comma-separated languages', 'en')
  .option('--default-language <code>', 'default (source) language — defaults to the first of --languages')
  .action(run((name: string, opts) => projectsCreateCommand(name, opts)));
withGlobals(projects.command('update <slug>')).description('update a project')
  .option('-n, --name <name>', 'new name (the slug never changes)')
  .option('-d, --description <text>', 'new description')
  .option('-l, --languages <codes>', 'set the full language list (removing a language deletes its translations)')
  .option('--default-language <code>', 'default language')
  .action(run((slug: string, opts) => projectsUpdateCommand(slug, opts)));
withGlobals(projects.command('delete <slug>')).description('delete a project and its keys (asks to confirm; --yes in CI)')
  .action(run((slug: string) => projectsDeleteCommand(slug)));
withGlobals(projects.command('add-language <slug> <codes...>')).description('add languages to a project')
  .action(run((slug: string, codes: string[]) => projectsAddLanguageCommand(slug, codes)));
withGlobals(projects.command('remove-language <slug> <codes...>')).description('remove languages and their translations')
  .action(run((slug: string, codes: string[]) => projectsRemoveLanguageCommand(slug, codes)));
withGlobals(projects.command('stats <slug>')).description('key counts and translation coverage per language')
  .action(run((slug: string) => projectsStatsCommand(slug)));

// ── Keys ────────────────────────────────────────────────────────

const keys = program.command('keys').alias('key').description('manage translation keys');
withGlobals(keys.command('list [project]')).alias('ls').description('list keys')
  .option('-m, --module <name>', 'filter by module')
  .option('-p, --published', 'only published keys')
  .option('--drafts', 'only unpublished keys')
  .option('-s, --search <text>', 'search key names and descriptions')
  .option('--limit <n>', 'show at most n keys')
  .addOption(new Option('--offset <n>').hideHelp())
  .action(run((project: string | undefined, opts) => listKeysCommand(project, opts)));
withGlobals(keys.command('get <project> <key>')).description('show a key and all its translations')
  .action(run((project: string, key: string) => getKeyCommand(project, key)));
withGlobals(keys.command('create <project> <key>')).description('create a key')
  .option('--value <lang=text>', 'translation, repeatable: --value en="Hi" --value es="Hola"', collect)
  .option('-d, --description <text>', 'context for translators')
  .option('-m, --module <name>', 'module')
  .option('--tags <tags>', 'comma-separated tags')
  .option('--publish', 'publish immediately (default: draft)')
  .addOption(new Option('--value-en <text>').hideHelp())
  .addOption(new Option('--value-es <text>').hideHelp())
  .addOption(new Option('--value-fr <text>').hideHelp())
  .addOption(new Option('--value-de <text>').hideHelp())
  .action(run((project: string, key: string, opts) => createKeyCommand(project, key, opts)));
withGlobals(keys.command('update <project> <key>')).description('update translations, description or module')
  .option('--value <lang=text>', 'translation, repeatable', collect)
  .option('-d, --description <text>', 'description')
  .option('-m, --module <name>', 'module')
  .action(run((project: string, key: string, opts) => updateKeyCommand(project, key, opts)));
withGlobals(keys.command('translate <project> <key>')).description('set one translation (same as update --value)')
  .requiredOption('-l, --language <code>', 'language')
  .requiredOption('-t, --text <text>', 'translation text')
  .addOption(new Option('--value <text>').hideHelp())
  .action(run((project: string, key: string, opts) =>
    updateKeyCommand(project, key, { language: opts.language, text: opts.text ?? opts.value })));
withGlobals(keys.command('delete <project> <keys...>')).alias('rm').description('delete keys (asks to confirm; --yes in CI)')
  .action(run((project: string, names: string[]) => deleteKeyCommand(project, names)));
withGlobals(keys.command('publish <project> [keys...]')).description('publish keys so pull/export include them')
  .option('--all', 'publish every draft key')
  .option('-m, --module <name>', 'publish every draft key in a module')
  .addOption(new Option('--unpublish').hideHelp())
  .action(run((project: string, names: string[], opts) => publishKeysCommand(project, names, opts, true)));
withGlobals(keys.command('unpublish <project> [keys...]')).description('move keys back to draft')
  .option('--all', 'unpublish every published key')
  .option('-m, --module <name>', 'unpublish every key in a module')
  .action(run((project: string, names: string[], opts) => publishKeysCommand(project, names, opts, false)));

// ── AI translation ──────────────────────────────────────────────

withGlobals(program.command('translate [project]')).description('fill missing translations with AI (DeepL) from the default language')
  .option('-t, --to <codes>', 'comma-separated target languages (default: every non-default language)')
  .option('-k, --keys <names>', 'only these keys (comma-separated)')
  .option('-m, --module <name>', 'only keys in a module')
  .option('--overwrite', 'retranslate keys that already have a translation')
  .option('--dry-run', 'show what would be translated without using any AI translations')
  .action(run((project: string | undefined, opts) => translateCommand(project, opts)));
withGlobals(program.command('review [project]')).description('list AI translations awaiting review, or approve them')
  .option('--approve', 'approve the listed translations (asks to confirm; --yes in CI)')
  .option('-k, --keys <names>', 'only these keys (comma-separated)')
  .option('-l, --languages <codes>', 'only these languages (comma-separated)')
  .action(run((project: string | undefined, opts) => reviewCommand(project, opts)));

// ── Team & org ──────────────────────────────────────────────────

const team = program.command('team').description('manage team members (needs an API key with the org:admin scope)');
withGlobals(team.command('list')).alias('ls').description('list members').action(run(() => listTeamCommand()));
withGlobals(team.command('get <email>')).description('show a member').action(run((email: string) => getTeamMemberCommand(email)));
withGlobals(team.command('invite <email>')).description('invite someone')
  .option('-r, --role <role>', 'viewer, member or admin', 'member')
  .action(run((email: string, opts) => inviteTeamMemberCommand(email, opts)));
withGlobals(team.command('remove <email>')).description('remove a member (asks to confirm; --yes in CI)')
  .action(run((email: string) => removeTeamMemberCommand(email)));
withGlobals(team.command('update-role <email> <role>')).description('change a member\'s role')
  .action(run((email: string, role: string) => updateTeamRoleCommand(email, role)));
withGlobals(team.command('invitations')).description('list invitations')
  .option('-p, --pending', 'only pending invitations')
  .option('--status <status>', 'pending, accepted, expired or revoked')
  .action(run(opts => listInvitationsCommand(opts)));
withGlobals(team.command('revoke-invitation <email>')).description('revoke a pending invitation')
  .action(run((email: string) => revokeInvitationCommand(email)));

const org = program.command('org').description('organization info');
withGlobals(org.command('info')).description('organization details').action(run(() => orgInfoCommand()));
withGlobals(org.command('stats')).description('member, project and key counts').action(run(() => orgStatsCommand()));
withGlobals(org.command('plan')).description('plan limits and usage').action(run(() => orgPlanCommand()));

program.addHelpText('after', `
Getting started:
  $ langctl init                      # authenticate and create langctl.json
  $ langctl pull                      # download translations
  $ langctl push                      # upload new source strings

In CI (no config file needed):
  env LANGCTL_API_KEY=lc_…  (store it as a secret)
  $ langctl pull --check              # fail if committed files are out of date
  $ langctl push --dry-run --json     # preview what would be uploaded

Exit codes:
  0 ok · 1 error · 2 invalid usage · 3 auth/permission · 4 not found
  5 network/API unavailable · 6 plan limit reached · 7 files out of date (--check)

Docs: https://langctl.com/docs`);

// ── Run ─────────────────────────────────────────────────────────

process.on('SIGINT', () => {
  process.stderr.write('\n');
  process.exit(130);
});

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exitCode = handleError(err);
  }
}

function handleError(err: unknown): number {
  if (err instanceof CommanderError) {
    // help/version requests exit cleanly; everything else commander rejects is a usage error
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version' || err.code === 'commander.help') return 0;
    return ExitCode.Usage;
  }
  if (err instanceof CliError) {
    if (runtime.json) printJson({ error: { message: err.message, exitCode: err.exitCode, hint: err.hint ?? null, status: err.status ?? null } });
    log.error(err.message, err.hint);
    return err.exitCode;
  }
  const e = err as Error;
  if (runtime.json) printJson({ error: { message: e?.message ?? String(err), exitCode: ExitCode.Error } });
  log.error(e?.message ?? String(err), 'This looks like a bug — please report it at https://github.com/litcode-pvt-ltd/langctl-cli/issues (run with --verbose for details).');
  if (runtime.verbose && e?.stack) process.stderr.write(e.stack + '\n');
  return ExitCode.Error;
}

void main();
