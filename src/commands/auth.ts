import chalk from 'chalk';
import ora from 'ora';
import { authenticate, logout } from '../auth.js';
import { config } from '../config.js';
import { initializeSupabase } from '../supabase.js';

export async function authCommand(apiKey: string): Promise<void> {
  // Initialize Supabase (with hardcoded credentials)
  try {
    initializeSupabase();
  } catch (error) {
    console.log(chalk.red('✗ Failed to connect to Langctl servers.\n'));
    return;
  }

  const spinner = ora('Authenticating...').start();

  const result = await authenticate(apiKey);

  if (result.success) {
    spinner.succeed(chalk.green(`Authenticated as ${result.data?.organization.name}`));
    console.log(chalk.gray(`\nAPI Key saved to: ${config.getConfigPath()}\n`));
  } else {
    spinner.fail(chalk.red(result.message));
    console.log(chalk.yellow('\nTroubleshooting:'));
    console.log(chalk.white('  - Check that your API key is correct'));
    console.log(chalk.white('  - Verify the key is not revoked in the dashboard'));
    console.log(chalk.white('  - Generate a new key: https://langctl.com/dashboard/settings/api-keys\n'));
  }
}

export async function logoutCommand(): Promise<void> {
  logout();
  console.log(chalk.green('✓ Logged out successfully\n'));
}
