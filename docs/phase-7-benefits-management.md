# Phase 7 Benefits Management

Phase 7 provides company-scoped benefit plans, immutable effective-dated plan terms,
employee enrollment snapshots, lifecycle history, employee self-service viewing, sensitive
projection, and audited CSV export.

## MVP rules

- Plan type is `other`; no client, provider, statutory, or medical plan is seeded.
- Employer and employee contributions are fixed monthly decimal amounts. At least one must be
  positive.
- Contributions are informational and never write to Payroll.
- Eligibility is limited to configured employment types and probation/confirmed statuses.
- One non-overlapping enrollment is allowed per employment and plan at any date.
- Normal enrollment cannot be backdated. Historical creation and plan correction use exceptional
  permissions.
- Employees have read-only own access. Managers receive no default Benefits access.
- Sensitive fields require `benefit_sensitive.view` intersected with record scope.
- No physical deletion, scheduler, provider integration, dependents, claims, or adjustment workflow
  exists.

## Limits and verification

- Default page size: 20; maximum page size: 100.
- CSV enrollment export is capped at 10,000 rows and audited.
- `npm run verify:phase-7` refuses any database other than MySQL 8.x `hrm_test` at
  `127.0.0.1:3307` and resets only Phase 7 fixture tables.
- Never use port 3306 and never run destructive verification against `hrm_dev`.
