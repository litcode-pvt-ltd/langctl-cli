import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey } from '../auth.js';

const ORG_INFO_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/get-organization-info';

/**
 * Get organization information
 */
export async function orgInfoCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching organization info...').start();

  try {
    const response = await fetch(ORG_INFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'info'
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    const org = data.organization;
    console.log(chalk.blue.bold('\n🏢 Organization Information\n'));
    console.log(chalk.white.bold(org.name));
    console.log(chalk.gray(`ID: ${org.id}`));
    console.log(chalk.gray(`Slug: ${org.slug}`));
    if (org.description) {
      console.log(chalk.gray(`Description: ${org.description}`));
    }
    console.log(chalk.gray(`Plan: ${org.plan}`));
    console.log(chalk.gray(`Created: ${new Date(org.created_at).toLocaleDateString()}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch organization info'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get organization statistics
 */
export async function orgStatsCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching organization statistics...').start();

  try {
    const response = await fetch(ORG_INFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'stats'
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    const stats = data.stats;
    console.log(chalk.blue.bold('\n📊 Organization Statistics\n'));

    console.log(chalk.white.bold('Team'));
    console.log(chalk.gray(`  Members: ${stats.members}`));
    console.log('');

    console.log(chalk.white.bold('Projects'));
    console.log(chalk.gray(`  Total Projects: ${stats.projects}`));
    console.log('');

    console.log(chalk.white.bold('Translation Keys'));
    console.log(chalk.gray(`  Total Keys: ${stats.total_keys}`));
    console.log(chalk.green(`  Published: ${stats.published_keys}`));
    console.log(chalk.yellow(`  Unpublished: ${stats.unpublished_keys}`));
    console.log('');

    console.log(chalk.white.bold('Languages'));
    console.log(chalk.gray(`  Total Languages: ${stats.languages}`));
    if (stats.language_codes && stats.language_codes.length > 0) {
      console.log(chalk.gray(`  Codes: ${stats.language_codes.join(', ')}`));
    }
    console.log('');

    console.log(chalk.white.bold('Resources'));
    console.log(chalk.gray(`  API Keys: ${stats.api_keys}`));
    console.log(chalk.gray(`  Webhooks: ${stats.webhooks}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch statistics'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get organization plan and limits
 */
export async function orgPlanCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching plan information...').start();

  try {
    const response = await fetch(ORG_INFO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'plan'
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    const limits = data.limits;
    console.log(chalk.blue.bold('\n💎 Subscription Plan\n'));
    console.log(chalk.white.bold(`Current Plan: ${data.plan.toUpperCase()}`));
    console.log('');

    console.log(chalk.white.bold('Plan Limits'));

    // Display limits with "Unlimited" for -1 or null values
    const formatLimit = (value: number | null) => (value === -1 || value === null) ? chalk.green('Unlimited') : chalk.gray(value.toString());

    console.log(chalk.gray(`  Max Members: ${formatLimit(limits.max_members)}`));
    console.log(chalk.gray(`  Max Projects: ${formatLimit(limits.max_projects)}`));
    console.log(chalk.gray(`  Max Keys per Project: ${formatLimit(limits.max_keys_per_project)}`));
    console.log(chalk.gray(`  Max API Keys: ${formatLimit(limits.max_api_keys)}`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to fetch plan information'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
