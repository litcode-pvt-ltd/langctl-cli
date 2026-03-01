import chalk from 'chalk';
import ora from 'ora';
import { isAuthenticated } from '../auth.js';
import { getApiClient } from '../api.js';
import { config } from '../config.js';

/**
 * List all team members
 */
export async function listTeamCommand(): Promise<void> {
  if (!isAuthenticated()) {
    console.log(chalk.red('✗ Not authenticated. Please run "langctl auth <api-key>" first.\n'));
    return;
  }

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora('Fetching team members...').start();

  try {
    const api = getApiClient();
    const members = await api.get<any[]>(`/orgs/${orgId}/members`);

    spinner.stop();

    if (!members || members.length === 0) {
      console.log(chalk.yellow('\nNo team members found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n👥 Team Members (${members.length})\n`));

    members.forEach((member: any) => {
      console.log(chalk.white.bold(member.email));
      console.log(chalk.gray(`  Role: ${member.role}`));
      if (member.joinedAt) {
        console.log(chalk.gray(`  Joined: ${new Date(member.joinedAt).toLocaleDateString()}`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora('Fetching member details...').start();

  try {
    const api = getApiClient();
    const members = await api.get<any[]>(`/orgs/${orgId}/members`);
    const member = members.find((m: any) => m.email === email);

    if (!member) {
      throw new Error(`Member "${email}" not found`);
    }

    spinner.stop();

    console.log(chalk.blue.bold('\n👤 Team Member Details\n'));
    console.log(chalk.white.bold(`Email: ${member.email}`));
    console.log(chalk.gray(`Role: ${member.role}`));
    console.log(chalk.gray(`User ID: ${member.userId}`));
    if (member.joinedAt) {
      console.log(chalk.gray(`Joined: ${new Date(member.joinedAt).toLocaleString()}`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora(`Inviting ${email}...`).start();

  try {
    const api = getApiClient();
    await api.post(`/orgs/${orgId}/invitations`, {
      email,
      role: options.role || 'member'
    });

    spinner.succeed(chalk.green(`Invitation sent to ${email}`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora(`Removing ${email}...`).start();

  try {
    const api = getApiClient();
    const members = await api.get<any[]>(`/orgs/${orgId}/members`);
    const member = members.find((m: any) => m.email === email);

    if (!member) {
      throw new Error(`Member "${email}" not found`);
    }

    await api.delete(`/orgs/${orgId}/members/${member.id}`);

    spinner.succeed(chalk.green(`Removed ${email} from organization`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora(`Updating role for ${email}...`).start();

  try {
    const api = getApiClient();
    const members = await api.get<any[]>(`/orgs/${orgId}/members`);
    const member = members.find((m: any) => m.email === email);

    if (!member) {
      throw new Error(`Member "${email}" not found`);
    }

    await api.patch(`/orgs/${orgId}/members/${member.id}`, { role });

    spinner.succeed(chalk.green(`Updated ${email} role to ${role}`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora('Fetching invitations...').start();

  try {
    const api = getApiClient();
    const result = await api.get<any>(`/orgs/${orgId}/invitations`);
    const invitations = result.invitations || [];

    spinner.stop();

    if (invitations.length === 0) {
      console.log(chalk.yellow('\nNo invitations found\n'));
      return;
    }

    console.log(chalk.blue.bold(`\n✉️  Invitations (${invitations.length})\n`));

    invitations.forEach((invitation: any) => {
      console.log(chalk.white.bold(invitation.email));
      console.log(chalk.gray(`  Role: ${invitation.role}`));
      console.log(chalk.gray(`  Status: ${invitation.status}`));
      if (invitation.createdAt) {
        console.log(chalk.gray(`  Invited: ${new Date(invitation.createdAt).toLocaleDateString()}`));
      }
      if (invitation.expiresAt) {
        console.log(chalk.gray(`  Expires: ${new Date(invitation.expiresAt).toLocaleDateString()}`));
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

  const orgId = config.get('organizationId');
  if (!orgId) {
    console.log(chalk.red('✗ No organization configured. Please run "langctl init" first.\n'));
    return;
  }

  const spinner = ora(`Revoking invitation for ${email}...`).start();

  try {
    const api = getApiClient();
    const result = await api.get<any>(`/orgs/${orgId}/invitations`);
    const invitation = (result.invitations || []).find(
      (inv: any) => inv.email === email && inv.status === 'pending'
    );

    if (!invitation) {
      throw new Error(`No pending invitation found for "${email}"`);
    }

    await api.post(`/orgs/${orgId}/invitations/${invitation.id}/revoke`);

    spinner.succeed(chalk.green(`Invitation for ${email} revoked`));
    console.log('');

  } catch (error: any) {
    spinner.fail(chalk.red('Failed to revoke invitation'));
    console.error(chalk.red(`Error: ${error.message}\n`));
  }
}
