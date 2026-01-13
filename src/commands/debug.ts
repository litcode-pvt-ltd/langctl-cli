import chalk from 'chalk';
import ora from 'ora';
import { getSupabase, initializeSupabase } from '../supabase.js';

export async function debugListApiKeys(): Promise<void> {
  // Initialize supabase (with hardcoded credentials)
  try {
    initializeSupabase();
  } catch (e) {
    console.error(chalk.red('✗ Failed to connect to Langctl servers.'));
    return;
  }

  const supabase = getSupabase();
  const spinner = ora('Fetching API keys (debug)...').start();

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, organization_id, revoked, created_at, last_used_at')
    .limit(100);

  if (error) {
    spinner.fail(chalk.red(`Error fetching API keys: ${error.message}`));
    console.log(chalk.yellow('Hint: This is a debug command and may require elevated permissions.'));
    return;
  }

  spinner.succeed(chalk.green(`Found ${data?.length || 0} API keys`));

  if (!data || data.length === 0) {
    console.log(chalk.yellow('No API keys visible with current permissions.'));
    return;
  }

  for (const row of data) {
    console.log(
      `${chalk.cyan(row.id)}  ${chalk.white(row.name)}  prefix=${chalk.magenta(row.key_prefix)}  org=${chalk.yellow(row.organization_id)}  revoked=${row.revoked ? chalk.red('true') : chalk.green('false')}  last_used=${chalk.gray(row.last_used_at || 'never')}`
    );
  }
}

export async function debugListOrganizations(): Promise<void> {
  // Initialize supabase (with hardcoded credentials)
  try {
    initializeSupabase();
  } catch (e) {
    console.error(chalk.red('✗ Failed to connect to Langctl servers.'));
    return;
  }

  const supabase = getSupabase();
  const spinner = ora('Fetching organizations (debug)...').start();

  const { data, error } = await supabase
    .from('organizations')
    .select('id, name, plan, created_at')
    .limit(100);

  if (error) {
    spinner.fail(chalk.red(`Error fetching organizations: ${error.message}`));
    return;
  }

  spinner.succeed(chalk.green(`Found ${data?.length || 0} organizations`));
  (data || []).forEach(o => {
    console.log(`${chalk.cyan(o.id)}  ${chalk.white(o.name)}  plan=${chalk.magenta(o.plan)}  created=${chalk.gray(o.created_at)}`);
  });
}
