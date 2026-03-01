import chalk from 'chalk';
import { config } from '../config.js';

export function configCommand(): void {
  console.log(chalk.blue.bold('\n📋 Langctl Configuration\n'));

  const allConfig = config.getAll();

  if (Object.keys(allConfig).length === 0) {
    console.log(chalk.yellow('No configuration found. Run "langctl init" to set up.\n'));
    return;
  }

  // Display config with masked sensitive values
  const displayConfig = {
    apiBaseUrl: allConfig.apiBaseUrl || 'https://api.langctl.com/api/v1 (default)',
    apiKey: allConfig.apiKey ? maskApiKey(allConfig.apiKey) : undefined,
    organizationId: allConfig.organizationId,
    organizationName: allConfig.organizationName,
    defaultProject: allConfig.defaultProject,
    defaultLanguage: allConfig.defaultLanguage
  };

  Object.entries(displayConfig).forEach(([key, value]) => {
    if (value !== undefined) {
      console.log(chalk.white(`${key}: ${chalk.cyan(value)}`));
    }
  });

  console.log(chalk.gray(`\nConfig file: ${config.getConfigPath()}\n`));
}

function maskApiKey(key: string): string {
  if (key.length < 10) return '***';
  return `${key.substring(0, 10)}...${key.substring(key.length - 4)}`;
}
