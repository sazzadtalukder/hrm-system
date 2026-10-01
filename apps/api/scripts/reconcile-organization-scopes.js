import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { validateOrganizationScopes } from '../src/modules/organization/reconciliation.js';

const env = loadEnv();
if (env.DB_HOST !== '127.0.0.1' || env.DB_PORT !== 3307)
  throw new Error('Organization reconciliation is restricted to 127.0.0.1:3307.');
const database = createDatabase(env);
try {
  await validateOrganizationScopes(database);
  console.log(`Organization scope reconciliation passed for ${env.DB_NAME}.`);
} finally {
  await database.destroy();
}
