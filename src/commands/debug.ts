import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';

export async function debugListApiKeys(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated.\n'));
  process.exitCode = 1;
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured.\n'));
  process.exitCode = 1;
    return;
  }

  const spinner = ora('Testing API connection...').start();

  try {
    const api = getApiClient();
    const org = await api.get<any>(`/orgs/${orgId}`);
    spinner.succeed(chalk.green(`API connection successful`));

    console.log(chalk.blue.bold('\n🔧 Debug Info\n'));
    console.log(chalk.white(`Organization: ${org.name}`));
    console.log(chalk.white(`Plan: ${org.plan}`));
    console.log(chalk.gray(`API URL: ${config.get('apiBaseUrl') || 'https://api.langctl.com/api/v1'}`));
    console.log(chalk.gray(`Config: ${config.getConfigPath()}`));
    console.log('');
  } catch (error: any) {
    spinner.fail(chalk.red('API connection failed'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    process.exitCode = 1;
  }
}

export async function debugListOrganizations(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated.\n'));
  process.exitCode = 1;
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured.\n'));
  process.exitCode = 1;
    return;
  }

  const spinner = ora('Fetching organization...').start();

  try {
    const api = getApiClient();
    const org = await api.get<any>(`/orgs/${orgId}`);
    spinner.succeed(chalk.green('Found organization'));
    console.log(`${chalk.cyan(org.id)}  ${chalk.white(org.name)}  plan=${chalk.magenta(org.plan)}  created=${chalk.gray(org.createdAt)}`);
  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch organization'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    process.exitCode = 1;
  }
}
