import { config } from 'dotenv';
import path from 'node:path';

/**
 * CLI scripts run outside Next, so they load env files themselves. Order
 * matters: a value already in the real environment always wins, which is how
 * `ARTIFICER_STORE=blob npm run seed` targets production without editing files.
 */
export function loadEnv(): void {
  for (const file of ['.env.production.local', '.env.local', '.env']) {
    config({ path: path.join(process.cwd(), file), override: false });
  }
}
