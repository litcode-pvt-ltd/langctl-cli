import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';

/**
 * Get organization information
 */
export async function orgInfoCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
  process.exitCode = 1;
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
  process.exitCode = 1;
    return;
  }

  const spinner = ora('Fetching organization info...').start();

  try {
    const api = getApiClient();
    const org = await api.get<any>(`/orgs/${orgId}`);

    spinner.stop();

    console.log(chalk.blue.bold('\n🏢 Organization Information\n'));
    console.log(chalk.white.bold(org.name));
    console.log(chalk.gray(`ID: ${org.id}`));
    console.log(chalk.gray(`Slug: ${org.slug}`));
    console.log(chalk.gray(`Plan: ${org.plan}`));
    console.log(chalk.gray(`Created: ${new Date(org.createdAt).toLocaleDateString()}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch organization info'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    process.exitCode = 1;
  }
}

/**
 * Get organization statistics
 */
export async function orgStatsCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
  process.exitCode = 1;
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
  process.exitCode = 1;
    return;
  }

  const spinner = ora('Fetching organization statistics...').start();

  try {
    const api = getApiClient();
    const stats = await api.get<any>(`/orgs/${orgId}/stats`);

    spinner.stop();

    console.log(chalk.blue.bold('\n📊 Organization Statistics\n'));

    console.log(chalk.white.bold('Team'));
    console.log(chalk.gray(`  Members: ${stats.memberCount}`));
    console.log('');

    console.log(chalk.white.bold('Projects'));
    console.log(chalk.gray(`  Total Projects: ${stats.projectCount}`));
    console.log('');

    console.log(chalk.white.bold('Translation Keys'));
    console.log(chalk.gray(`  Total Keys: ${stats.totalKeys}`));
    console.log('');

    console.log(chalk.white.bold('Resources'));
    console.log(chalk.gray(`  API Keys: ${stats.apiKeyCount}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch statistics'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    process.exitCode = 1;
  }
}

/**
 * Get organization plan and limits
 */
export async function orgPlanCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
  process.exitCode = 1;
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
  process.exitCode = 1;
    return;
  }

  const spinner = ora('Fetching plan information...').start();

  try {
    const api = getApiClient();
    const org = await api.get<any>(`/orgs/${orgId}`);

    spinner.stop();

    console.log(chalk.blue.bold('\n💎 Subscription Plan\n'));
    console.log(chalk.white.bold(`Current Plan: ${org.plan.toUpperCase()}`));
    console.log('');

    console.log(chalk.white.bold('Plan Limits'));

    // Display limits with "Unlimited" for -1 or null values
    const formatLimit = (value: number | null) => (value === -1 || value === null) ? chalk.green('Unlimited') : chalk.gray(value.toString());

    console.log(chalk.gray(`  Max Members: ${formatLimit(org.maxMembers)}`));
    console.log(chalk.gray(`  Max Projects: ${formatLimit(org.maxProjects)}`));
    console.log(chalk.gray(`  Max Keys per Project: ${formatLimit(org.maxKeysPerProject)}`));
    console.log(chalk.gray(`  Max API Keys: ${formatLimit(org.maxApiKeys)}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch plan information'));
    console.error(chalk.red(`Error: ${error.message}\n`));
    process.exitCode = 1;
  }
}
