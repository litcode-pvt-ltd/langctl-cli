import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { config } from '../config.js';
import { authenticate } from '../auth.js';
import { showLogo } from '../utils/banner.js';

export async function initCommand(): Promise<void> {
  // Show logo
  showLogo();

  console.log(chalk.blue.bold('🚀 CLI Setup\n'));
  console.log(chalk.gray('Get your API key from: https://app.langctl.com/dashboard/settings/api-keys\n'));

  // Check if already configured
  if (config.isConfigured()) {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Configuration already exists. Do you want to reconfigure?',
        default: false
      }
    ]);

    if (!confirm) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
  }

  // Ask for API key
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your API key:',
      mask: '*',
      filter: (input: string) => input?.trim(),
      validate: (input: string) => {
        const value = (input || '').trim();
        if (!value || !value.startsWith('lc_')) {
          return 'Please enter a valid API key (starts with lc_)';
        }
        if (value.length !== 67) {
          return 'Invalid API key format (should be 67 characters)';
        }
        return true;
      }
    }
  ]);

  // Authenticate
  const spinner = ora('Verifying API key...').start();

  const result = await authenticate(apiKey);

  if (result.success) {
    spinner.succeed(chalk.green(`Authenticated as ${result.data?.organization.name}`));
  } else {
    spinner.fail(chalk.red(result.message));
    console.log(chalk.yellow('\nTroubleshooting:'));
    console.log(chalk.white('  - Check that your API key is correct'));
    console.log(chalk.white('  - Verify the key is not revoked in the dashboard'));
    console.log(chalk.white('  - Generate a new key if needed: https://app.langctl.com/dashboard/settings/api-keys\n'));
    return;
  }

  // Ask for default settings
  const { defaultLanguage } = await inquirer.prompt([
    {
      type: 'input',
      name: 'defaultLanguage',
      message: 'Default language code:',
      default: 'en'
    }
  ]);

  config.set('defaultLanguage', defaultLanguage);

  console.log(chalk.green.bold('\n✓ Setup complete!\n'));
  console.log(chalk.gray(`Configuration saved to: ${config.getConfigPath()}\n`));
  console.log(chalk.blue('Next steps:'));
  console.log(chalk.white('  1. Run "langctl projects list" to see your projects'));
  console.log(chalk.white('  2. Run "langctl pull <project-slug>" to download translations\n'));
}
