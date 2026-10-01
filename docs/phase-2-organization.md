# Phase 2 Organization Foundation

Phase 2 adds company-owned branches, departments, designations, grades, cost centers, work calendars,
calendar days, and holidays. The schema supports multiple companies; the MVP bootstrap operation
allows one active company until additional-company operations are approved.

## Controlled bootstrap

No client identity is stored in application constants. Supply company identity at execution time:

```text
ORGANIZATION_COMPANY_CODE=<approved code>
ORGANIZATION_COMPANY_NAME=<approved name>
npm run db:bootstrap-organization
```

Country, currency, timezone, and locale have environment inputs with Bangladesh-oriented defaults.
The command obtains a MySQL bootstrap lock, is idempotent by company code, and rejects conflicting
identity or an unapproved second active company.

Before adding legacy authorization constraints, run:

```text
npm run db:reconcile-organization
```

The validator rejects missing companies, cross-company branch or department scopes, and invalid
scope shapes. Organization records and audit history are not physically deleted.

## Verification

The Phase 2 verifier is destructive only inside the dedicated `hrm_test` database and has hard
guards for `127.0.0.1:3307`, MySQL 8.0.46, and the exact database name.

```text
npm run verify:phase-2
npm run verify:phase-1b
```

The verifier creates company fixtures dynamically and never treats historical Phase 1B numeric
fixture identifiers as real companies.
