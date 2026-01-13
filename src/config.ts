import Conf from 'conf';
import { join } from 'path';
import { homedir } from 'os';

export interface LangctlConfig {
  // User credentials (safe to store)
  apiKey?: string;
  organizationId?: string;
  organizationName?: string;
  
  // User preferences (safe to store)
  defaultProject?: string;
  defaultLanguage?: string;
}

class ConfigManager {
  private config: Conf<LangctlConfig>;
  private configDir: string;

  constructor() {
    this.configDir = join(homedir(), '.langctl');

    this.config = new Conf<LangctlConfig>({
      projectName: 'langctl',
      cwd: this.configDir,
      configName: 'config'
    });
  }

  /**
   * Get a configuration value
   */
  get<K extends keyof LangctlConfig>(key: K): LangctlConfig[K] | undefined {
    return this.config.get(key);
  }

  /**
   * Set a configuration value
   */
  set<K extends keyof LangctlConfig>(key: K, value: LangctlConfig[K]): void {
    this.config.set(key, value);
  }

  /**
   * Get all configuration
   */
  getAll(): LangctlConfig {
    return this.config.store;
  }

  /**
   * Set multiple configuration values
   */
  setAll(config: Partial<LangctlConfig>): void {
    Object.entries(config).forEach(([key, value]) => {
      if (value !== undefined) {
        this.config.set(key as keyof LangctlConfig, value);
      }
    });
  }

  /**
   * Delete a configuration value
   */
  delete(key: keyof LangctlConfig): void {
    this.config.delete(key);
  }

  /**
   * Clear all configuration
   */
  clear(): void {
    this.config.clear();
  }

  /**
   * Check if user is authenticated
   */
  isConfigured(): boolean {
    return !!(
      this.config.get('apiKey') &&
      this.config.get('organizationId')
    );
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return this.config.path;
  }
}

// Singleton instance
export const config = new ConfigManager();
