import { createRequire } from 'module';

// Single source of truth: package.json (was hardcoded in two places in 0.2.x)
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };

export const VERSION: string = pkg.version;
