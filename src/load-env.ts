import { existsSync } from 'node:fs';

// Loaded before Nest reads configuration. A missing file is fine: the
// process environment (and tests) can supply the same variables.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
