#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { authCommand, logoutCommand } from './commands/auth.js';
import { configCommand } from './commands/config.js';
import {
  projectsListCommand,
  projectsCreateCommand,
  projectsGetCommand,
  projectsUpdateCommand,
  projectsDeleteCommand,
  projectsAddLanguageCommand,
  projectsRemoveLanguageCommand,
  projectsStatsCommand
} from './commands/projects.js';
import {
  listKeysCommand,
  getKeyCommand,
  createKeyCommand,
  deleteKeyCommand,
  translateKeyCommand,
  publishKeysCommand
} from './commands/keys.js';
import {
  listTeamCommand,
  getTeamMemberCommand,
  inviteTeamMemberCommand,
  removeTeamMemberCommand,
  updateTeamRoleCommand,
  listInvitationsCommand,
  revokeInvitationCommand
} from './commands/team.js';
import {
  orgInfoCommand,
  orgStatsCommand,
  orgPlanCommand
} from './commands/org.js';
import { pullCommand } from './commands/pull.js';
import { exportCommand } from './commands/export.js';
import { importCommand } from './commands/import.js';
import { debugListApiKeys, debugListOrganizations } from './commands/debug.js';
import { showLogo } from './utils/banner.js';

const program = new Command();

// Package info
const packageJson = {
  name: 'langctl',
  version: '0.2.0',
  description: 'CLI-first translation management for developers'
};

program
  .name('langctl')
  .description(packageJson.description)
  .version(packageJson.version, '-v, --version', 'Show version number');

// Init command
program
  .command('init')
  .description('Interactive setup wizard')
  .action(async () => {
    try {
      await initCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Auth command
program
  .command('auth <api-key>')
  .description('Authenticate and save credentials')
  .action(async (apiKey: string) => {
    try {
      await authCommand(apiKey);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Logout command
program
  .command('logout')
  .description('Clear authentication credentials')
  .action(async () => {
    try {
      await logoutCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Config command
program
  .command('config')
  .description('View current configuration')
  .action(() => {
    try {
      configCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Projects command
const projects = program
  .command('projects')
  .description('Manage projects');

projects
  .command('list')
  .description('Show all accessible projects')
  .action(async () => {
    try {
      await projectsListCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('create <name>')
  .description('Create a new project')
  .option('-d, --description <text>', 'Project description')
  .option('-l, --languages <langs>', 'Comma-separated language codes (e.g., en,es,fr)', 'en')
  .option('--default-language <code>', 'Default language code')
  .action(async (name: string, options: any) => {
    try {
      await projectsCreateCommand(name, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('get <slug>')
  .description('Get project details')
  .action(async (slug: string) => {
    try {
      await projectsGetCommand(slug);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('update <slug>')
  .description('Update project')
  .option('-n, --name <name>', 'New project name')
  .option('-d, --description <text>', 'New description')
  .option('-l, --languages <langs>', 'Comma-separated language codes')
  .option('--default-language <code>', 'Default language code')
  .action(async (slug: string, options: any) => {
    try {
      await projectsUpdateCommand(slug, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('delete <slug>')
  .description('Delete project')
  .action(async (slug: string) => {
    try {
      await projectsDeleteCommand(slug);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('add-language <slug> <language>')
  .description('Add language to project')
  .action(async (slug: string, language: string) => {
    try {
      await projectsAddLanguageCommand(slug, language);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('remove-language <slug> <language>')
  .description('Remove language from project')
  .action(async (slug: string, language: string) => {
    try {
      await projectsRemoveLanguageCommand(slug, language);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

projects
  .command('stats <slug>')
  .description('Get project statistics')
  .action(async (slug: string) => {
    try {
      await projectsStatsCommand(slug);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Keys command
const keys = program
  .command('keys')
  .description('Manage translation keys');

keys
  .command('list <project>')
  .description('List translation keys')
  .option('-m, --module <name>', 'Filter by module')
  .option('-p, --published', 'Show only published keys')
  .option('-s, --search <term>', 'Search keys')
  .option('--limit <number>', 'Limit results', '100')
  .option('--offset <number>', 'Offset results', '0')
  .action(async (project: string, options: any) => {
    try {
      await listKeysCommand(project, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

keys
  .command('get <project> <key>')
  .description('Get key details')
  .action(async (project: string, key: string) => {
    try {
      await getKeyCommand(project, key);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

keys
  .command('create <project> <key>')
  .description('Create translation key')
  .option('-d, --description <text>', 'Key description')
  .option('-m, --module <name>', 'Module name')
  .option('--value-en <value>', 'English value')
  .option('--value-es <value>', 'Spanish value')
  .option('--value-fr <value>', 'French value')
  .option('--value-de <value>', 'German value')
  .option('--tags <tags>', 'Comma-separated tags')
  .action(async (project: string, key: string, options: any) => {
    try {
      await createKeyCommand(project, key, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

keys
  .command('delete <project> <key>')
  .description('Delete translation key')
  .action(async (project: string, key: string) => {
    try {
      await deleteKeyCommand(project, key);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

keys
  .command('translate <project> <key>')
  .description('Update translation for a key')
  .requiredOption('-l, --language <code>', 'Language code')
  .requiredOption('-v, --value <text>', 'Translation value')
  .action(async (project: string, key: string, options: any) => {
    try {
      await translateKeyCommand(project, key, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

keys
  .command('publish <project> <keys...>')
  .description('Publish translation keys')
  .option('--unpublish', 'Unpublish instead of publish')
  .action(async (project: string, keysList: string[], options: any) => {
    try {
      await publishKeysCommand(project, keysList, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Team command
const team = program
  .command('team')
  .description('Manage team members');

team
  .command('list')
  .description('List team members')
  .action(async () => {
    try {
      await listTeamCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('get <email>')
  .description('Get team member details')
  .action(async (email: string) => {
    try {
      await getTeamMemberCommand(email);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('invite <email>')
  .description('Invite team member')
  .option('-r, --role <role>', 'Member role: viewer, member, admin', 'member')
  .action(async (email: string, options: any) => {
    try {
      await inviteTeamMemberCommand(email, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('remove <email>')
  .description('Remove team member')
  .action(async (email: string) => {
    try {
      await removeTeamMemberCommand(email);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('update-role <email> <role>')
  .description('Update member role (viewer, member, admin)')
  .action(async (email: string, role: string) => {
    try {
      await updateTeamRoleCommand(email, role);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('invitations')
  .description('List invitations')
  .option('-p, --pending', 'Show only pending invitations')
  .action(async (options: any) => {
    try {
      await listInvitationsCommand(options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

team
  .command('revoke-invitation <email>')
  .description('Revoke pending invitation')
  .action(async (email: string) => {
    try {
      await revokeInvitationCommand(email);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Organization command
const org = program
  .command('org')
  .description('Manage organization');

org
  .command('info')
  .description('Get organization information')
  .action(async () => {
    try {
      await orgInfoCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

org
  .command('stats')
  .description('Get organization statistics')
  .action(async () => {
    try {
      await orgStatsCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

org
  .command('plan')
  .description('Get subscription plan and limits')
  .action(async () => {
    try {
      await orgPlanCommand();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Pull command (deprecated, use export)
program
  .command('pull <project>')
  .description('Pull translations from a project (deprecated, use export)')
  .option('-l, --language <code>', 'Pull specific language only (default: all)')
  .option('-f, --format <type>', 'Export format: json, json-nested, ios, android, flutter (default: json)')
  .option('-d, --dir <path>', 'Output directory (default: ./translations)')
  .option('-o, --output <path>', 'Specific output file path (optional)')
  .option('--no-published-only', 'Include unpublished translations')
  .action(async (project: string, options: any) => {
    try {
      await pullCommand(project, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Export command
program
  .command('export <project>')
  .description('Export translations from a project')
  .option('-l, --language <code>', 'Export specific language (default: all)')
  .option('-f, --format <type>', 'Export format: flat-json, nested-json, i18n-json, android-xml, ios-strings, flutter-arb (default: flat-json)')
  .option('-o, --output <path>', 'Output file path')
  .option('-m, --module <name>', 'Export only keys from specific module')
  .option('--include-unpublished', 'Include unpublished translations')
  .action(async (project: string, options: any) => {
    try {
      await exportCommand(project, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Import command
program
  .command('import <project> <file>')
  .description('Import translations from a file')
  .requiredOption('-l, --language <code>', 'Target language code')
  .option('--overwrite', 'Overwrite existing translations')
  .option('--publish', 'Auto-publish after import')
  .action(async (project: string, file: string, options: any) => {
    try {
      await importCommand(project, file, options);
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Debug command
const debug = program
  .command('debug')
  .description('Debug helpers');

debug
  .command('list-api-keys')
  .description('Test API connection and show debug info')
  .action(async () => {
    try {
      await debugListApiKeys();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

debug
  .command('list-organizations')
  .description('Show current organization details')
  .action(async () => {
    try {
      await debugListOrganizations();
    } catch (error: any) {
      console.error(chalk.red(`Error: ${error.message}\n`));
      process.exit(1);
    }
  });

// Help command
program.on('--help', () => {
  console.log('');
  console.log('Examples:');
  console.log('  $ langctl init');
  console.log('  $ langctl auth lc_abc123...');
  console.log('  $ langctl projects list');
  console.log('');
  console.log('  # Pull all languages as JSON to ./translations/i18n/');
  console.log('  $ langctl pull litcode');
  console.log('');
  console.log('  # Pull to custom directory (e.g., ./src/i18n/)');
  console.log('  $ langctl pull litcode --dir ./src/i18n');
  console.log('');
  console.log('  # Pull specific language');
  console.log('  $ langctl pull litcode --language en');
  console.log('');
  console.log('  # Pull all languages in iOS format to ./ios/localization/');
  console.log('  $ langctl pull litcode --format ios --dir ./ios/localization');
  console.log('');
  console.log('For more information, visit: https://langctl.com/docs');
  console.log('');
});

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  showLogo();
  program.outputHelp();
}
