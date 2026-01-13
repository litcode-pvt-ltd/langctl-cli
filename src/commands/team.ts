import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated, getApiKey } from '../auth.js';

const TEAM_MANAGEMENT_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co/functions/v1/manage-team-members';

/**
 * List all team members
 */
export async function listTeamCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching team members...').start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list'
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    if (!data.members || data.members.length === 0) {
      console.log(chalk.yellow('\nNo team members found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n👥 Team Members (${data.members.length})\n`));

    data.members.forEach((member: any) => {
      console.log(chalk.white.bold(member.email || member.user_id));
      console.log(chalk.gray(`  Role: ${member.role}`));
      if (member.joined_at) {
        console.log(chalk.gray(`  Joined: ${new Date(member.joined_at).toLocaleDateString()}`));
      }
      console.log('');
    });

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to list team members'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Get team member details
 */
export async function getTeamMemberCommand(email: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching member details...').start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'get',
        email
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    const member = data.member;
    console.log(chalk.blue.bold('\n👤 Team Member Details\n'));
    console.log(chalk.white.bold(`Email: ${member.email}`));
    console.log(chalk.gray(`Role: ${member.role}`));
    console.log(chalk.gray(`User ID: ${member.user_id}`));
    if (member.joined_at) {
      console.log(chalk.gray(`Joined: ${new Date(member.joined_at).toLocaleString()}`));
    }
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to get member details'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Invite team member
 */
export async function inviteTeamMemberCommand(email: string, options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora(`Inviting ${email}...`).start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'invite',
        email,
        role: options.role || 'member'
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to invite member'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Remove team member
 */
export async function removeTeamMemberCommand(email: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora(`Removing ${email}...`).start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'remove',
        email
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to remove member'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Update team member role
 */
export async function updateTeamRoleCommand(email: string, role: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const validRoles = ['viewer', 'member', 'admin', 'owner'];
  if (!validRoles.includes(role)) {
    console.log(chalk.red(`✗ Invalid role. Must be one of: ${validRoles.join(', ')}\n`));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora(`Updating role for ${email}...`).start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'update-role',
        email,
        role
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to update role'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * List invitations
 */
export async function listInvitationsCommand(options: any): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora('Fetching invitations...').start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'list-invitations',
        pending: options.pending || false
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.stop();

    if (!data.invitations || data.invitations.length === 0) {
      console.log(chalk.yellow('\nNo invitations found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n✉️  Invitations (${data.invitations.length})\n`));

    data.invitations.forEach((invitation: any) => {
      console.log(chalk.white.bold(invitation.email));
      console.log(chalk.gray(`  Role: ${invitation.role}`));
      console.log(chalk.gray(`  Status: ${invitation.status}`));
      if (invitation.invited_at) {
        console.log(chalk.gray(`  Invited: ${new Date(invitation.invited_at).toLocaleDateString()}`));
      }
      if (invitation.expires_at) {
        console.log(chalk.gray(`  Expires: ${new Date(invitation.expires_at).toLocaleDateString()}`));
      }
      console.log('');
    });

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to list invitations'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}

/**
 * Revoke invitation
 */
export async function revokeInvitationCommand(email: string): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const apiKey = getApiKey();
  const spinner = ora(`Revoking invitation for ${email}...`).start();

  try {
    const response = await fetch(TEAM_MANAGEMENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey!
      },
      body: JSON.stringify({
        action: 'revoke-invitation',
        email
      })
    });

    const data = await response.json() as any;

    if (!data.success) {
      throw new Error(data.error);
    }

    spinner.succeed(chalk.green(data.message));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to revoke invitation'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
