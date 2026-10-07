import chalk from 'chalk';
import { configPath, loadProjectConfig, maskApiKey, readUserConfig, resolveApiUrl, resolveCredentials } from '../core/config.js';
import { log, printJson, runtime } from '../core/output.js';
import { FORMATS } from '../formats/index.js';

/** Show effective configuration and where each value comes from (no network). */
export function configCommand(): void {
  const user = readUserConfig();
  const creds = resolveCredentials();
  const project = loadProjectConfig();
  const data = {
    apiUrl: resolveApiUrl(),
    apiKey: creds ? maskApiKey(creds.apiKey) : null,
    apiKeySource: creds ? (creds.source === 'env' ? 'LANGCTL_API_KEY' : creds.source === 'flag' ? '--api-key' : configPath()) : null,
    organization: user.organizationName ?? null,
    userConfig: configPath(),
    projectConfig: project ? { path: project.path, ...project.config } : null,
  };
  if (runtime.json) return printJson(data);
  log.out(`api url       ${data.apiUrl}`);
  log.out(`api key       ${data.apiKey ?? chalk.yellow('not set')}${data.apiKeySource ? chalk.dim(`  (${data.apiKeySource})`) : ''}`);
  if (data.organization) log.out(`organization  ${data.organization}`);
  log.out(`user config   ${data.userConfig}`);
  if (project) {
    log.out(`project file  ${project.path}`);
    for (const [k, v] of Object.entries(project.config)) log.out(chalk.dim(`  ${k}: ${JSON.stringify(v)}`));
  } else {
    log.out(`project file  ${chalk.dim('none — run "langctl init" to create langctl.json')}`);
  }
}

export function formatsCommand(): void {
  if (runtime.json) return printJson(FORMATS.map(f => ({ id: f.id, aliases: f.aliases, description: f.label, defaultOutput: f.defaultOutput })));
  for (const f of FORMATS) {
    log.out(`${chalk.bold(f.id.padEnd(12))} ${f.label}`);
    log.out(chalk.dim(`${''.padEnd(12)} default path ${f.defaultOutput}${f.aliases.length ? ` · aliases ${f.aliases.join(', ')}` : ''}`));
  }
}
