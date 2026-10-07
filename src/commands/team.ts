import chalk from 'chalk';
import { CliError, ExitCode, notFoundError, usageError } from '../core/errors.js';
import { getSession, type Session } from '../core/http.js';
import { log, printJson, runtime, table } from '../core/output.js';
import { confirm } from '../core/prompts.js';

/*
 * Team management needs an API key with the "org:admin" scope (listing members works with any key).
 */

interface Member {
  id: string;
  userId: string;
  role: string;
  email: string;
  fullName?: string | null;
  joinedAt?: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  invitedByEmail?: string;
}

const ROLES = ['viewer', 'member', 'admin'];

async function members(session: Session): Promise<Member[]> {
  return session.api.get<Member[]>(`/orgs/${session.orgId}/members`);
}

async function requireMember(session: Session, email: string): Promise<Member> {
  const m = (await members(session)).find(x => x.email.toLowerCase() === email.toLowerCase());
  if (!m) throw notFoundError(`No team member with email ${email}.`, 'List members with "langctl team list".');
  return m;
}

function checkRole(role: string): void {
  if (!ROLES.includes(role)) throw usageError(`Invalid role "${role}".`, `Use one of: ${ROLES.join(', ')} (ownership is transferred in the web app).`);
}

export async function listTeamCommand(): Promise<void> {
  const session = await getSession();
  const list = await members(session);
  if (runtime.json) return printJson(list);
  table(list.map(m => [m.email, m.fullName ?? '', m.role, m.joinedAt ? new Date(m.joinedAt).toISOString().slice(0, 10) : '']), ['EMAIL', 'NAME', 'ROLE', 'JOINED']);
}

export async function getTeamMemberCommand(email: string): Promise<void> {
  const session = await getSession();
  const m = await requireMember(session, email);
  if (runtime.json) return printJson(m);
  log.out(`${chalk.bold(m.email)}  ${m.role}${m.fullName ? `  ${m.fullName}` : ''}`);
}

export async function inviteTeamMemberCommand(email: string, opts: { role: string }): Promise<void> {
  checkRole(opts.role);
  const session = await getSession();
  const inv = await session.api.post<Invitation>(`/orgs/${session.orgId}/invitations`, { email, role: opts.role });
  if (runtime.json) return printJson(inv);
  log.success(`Invited ${chalk.bold(email)} as ${opts.role}`);
}

export async function removeTeamMemberCommand(email: string): Promise<void> {
  const session = await getSession();
  const m = await requireMember(session, email);
  if (!(await confirm(`Remove ${m.email} from the organization?`))) throw new CliError('Cancelled.', ExitCode.Error);
  await session.api.delete(`/orgs/${session.orgId}/members/${m.id}`);
  if (runtime.json) return printJson({ removed: m.email });
  log.success(`Removed ${chalk.bold(m.email)}`);
}

export async function updateTeamRoleCommand(email: string, role: string): Promise<void> {
  checkRole(role);
  const session = await getSession();
  const m = await requireMember(session, email);
  await session.api.patch(`/orgs/${session.orgId}/members/${m.id}`, { role });
  if (runtime.json) return printJson({ email: m.email, role });
  log.success(`${chalk.bold(m.email)} is now ${role}`);
}

export async function listInvitationsCommand(opts: { pending?: boolean; status?: string }): Promise<void> {
  const session = await getSession();
  const status = opts.pending ? 'pending' : opts.status;
  const { invitations } = await session.api.get<{ invitations: Invitation[] }>(`/orgs/${session.orgId}/invitations`, { status });
  if (runtime.json) return printJson(invitations);
  if (!invitations.length) return log.info('No invitations.');
  table(invitations.map(i => [i.email, i.role, i.status, i.expiresAt.slice(0, 10)]), ['EMAIL', 'ROLE', 'STATUS', 'EXPIRES']);
}

export async function revokeInvitationCommand(email: string): Promise<void> {
  const session = await getSession();
  const { invitations } = await session.api.get<{ invitations: Invitation[] }>(`/orgs/${session.orgId}/invitations`, { status: 'pending' });
  const inv = invitations.find(i => i.email.toLowerCase() === email.toLowerCase());
  if (!inv) throw notFoundError(`No pending invitation for ${email}.`);
  await session.api.post(`/orgs/${session.orgId}/invitations/${inv.id}/revoke`);
  if (runtime.json) return printJson({ revoked: inv.email });
  log.success(`Revoked invitation for ${chalk.bold(inv.email)}`);
}
