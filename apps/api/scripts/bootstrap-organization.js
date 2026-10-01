import { loadEnv } from '../src/config/env.js';
import { createDatabase } from '../src/infrastructure/database/knex.js';
import { insertAuditEvent } from '../src/modules/audit/auditRepository.js';

const env = loadEnv();
const input = {
  code: process.env.ORGANIZATION_COMPANY_CODE?.trim().toUpperCase(),
  name: process.env.ORGANIZATION_COMPANY_NAME?.trim(),
  country_code: (process.env.ORGANIZATION_COMPANY_COUNTRY || 'BD').trim().toUpperCase(),
  currency_code: (process.env.ORGANIZATION_COMPANY_CURRENCY || 'BDT').trim().toUpperCase(),
  timezone: (process.env.ORGANIZATION_COMPANY_TIMEZONE || 'Asia/Dhaka').trim(),
  locale: (process.env.ORGANIZATION_COMPANY_LOCALE || 'en-BD').trim(),
};

if (!input.code || !/^[A-Z0-9][A-Z0-9_-]{1,49}$/.test(input.code))
  throw new Error('ORGANIZATION_COMPANY_CODE is required and must be a valid code.');
if (!input.name || input.name.length > 200)
  throw new Error('ORGANIZATION_COMPANY_NAME is required and must not exceed 200 characters.');

const database = createDatabase(env);
let lockAcquired = false;
try {
  const [[lock]] = await database.raw(
    "SELECT GET_LOCK('hrm:organization-bootstrap', 10) AS acquired",
  );
  if (Number(lock.acquired) !== 1)
    throw new Error('Could not acquire the organization bootstrap lock.');
  lockAcquired = true;
  const company = await database.transaction(async (trx) => {
    const existing = await trx('companies').where({ code: input.code }).forUpdate().first();
    if (existing) {
      if (existing.name !== input.name)
        throw new Error('The company code already exists with a different name.');
      return existing;
    }
    const active = await trx('companies').where({ status: 'active' }).forUpdate().first();
    if (active)
      throw new Error(
        'An active MVP company already exists. Additional-company creation is deferred.',
      );
    const [id] = await trx('companies').insert(input);
    await insertAuditEvent(trx, {
      companyId: id,
      actionCode: 'company.bootstrap',
      outcome: 'success',
      recordType: 'company',
      recordId: id,
      reason: 'controlled_organization_bootstrap',
    });
    return trx('companies').where({ id }).first();
  });
  console.log(`Organization bootstrap complete: code=${company.code}, id=${company.id}`);
} finally {
  if (lockAcquired) await database.raw("SELECT RELEASE_LOCK('hrm:organization-bootstrap')");
  await database.destroy();
}
