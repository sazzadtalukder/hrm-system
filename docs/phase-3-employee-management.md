# Phase 3 Employee Management

Phase 3 adds company-owned employee person records, employment episodes, effective-dated assignment
and status history, direct reporting relationships, sensitive personal/contact boundaries, and
transactional audit coverage. Employee codes are explicit, normalized, immutable, and unique per
company. Company and organization identifiers are always resolved dynamically.

Historical corrections insert replacement history and retain superseded rows. Assignment and status
period checks lock the stable employment parent under READ COMMITTED before checking overlaps.
Employee record status is administrative and does not replace authoritative employment-status history.

The Phase 3 verifier is destructive only in `hrm_test` and proves the exact database host, port,
database name, and MySQL major version before resetting its isolated fixtures:

```text
npm run verify:phase-3
npm run verify:phase-1b
npm run verify:phase-2
```

Phase 3 does not create client organization data in `hrm_dev` and does not include attendance, leave,
payroll, ESS workflows, compensation, recruitment, benefits, documents, or reporting trees.
