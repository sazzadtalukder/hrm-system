# Phase 11 — Training & Development

## Approved baseline

Phase 11 is a bounded Training & Development domain over the protected Phase 1B–10 baseline. It owns course and provider configuration, scheduled sessions, employee requests, manager nominations, authorized assignments, capacity allocation, participation, completion, evidence-reference metadata, history, and scoped CSV export.

Training reads Company, Organization, Employee/Employment, effective manager history, and explicitly identified Phase 10 competency versions. A course mapping references an immutable `performance_competency_versions.id` in the same company; Training never updates Performance records. Training never writes Attendance, Leave, Payroll, Benefits, Claims, Loans, Performance, Employee, Employment, or Organization business tables.

Courses and providers use effective-dated append-only versions. Publishing a session freezes its course version, schedule, capacity, provider/facilitator metadata, completion model, and scoring configuration. Employee eligibility is probation or confirmed at the session-start anchor, and employment must remain active through session end.

Self-requests use one snapshotted-manager approval and enroll atomically when capacity exists. Explicitly scoped HR fallback is allowed only when the manager path is unavailable. Manager nominations require employee acceptance. Authorized Training/HR actors may create mandatory assignments without employee acceptance. Capacity overrides and waitlists are not supported.

Participation statuses are `not_recorded`, `attended`, `partially_attended`, `no_show`, and `excused`. Completion outcomes are `completed`, `passed`, `failed`, and `not_completed`. Optional scoring is bounded by the published session snapshot; an authorized recorder explicitly selects the outcome. Training participation has no effect on Attendance.

Sensitive narratives, scores, results, evidence references, correction reasons, and non-public provider information are omitted unless record access intersects `training_sensitive.view`. Employees may view their own complete result. Sensitive export separately requires `training_sensitive.export`. Sensitive reads and exports are audited without copying sensitive values into audit metadata or logs.

No physical deletion, generic workflow/rule/form/repository engine, background job, notification, LMS integration, binary evidence storage, financial integration, or business-data seed is introduced. The Phase 1B–10 deferred backlog remains unchanged.

## Operational limits

- Pagination: default 25; maximum 100.
- CSV export: maximum 10,000 rows.
- Administrative employment selection: maximum 500 IDs.
- Session capacity: maximum 1,000.
- Evidence types: `certificate_number`, `external_url`, `external_reference`.
- Dates are company-local `YYYY-MM-DD`; timestamps are UTC.
- Transactions use InnoDB `READ COMMITTED`.
- Destructive verification is guarded to MySQL 8 `hrm_test` at `127.0.0.1:3307`.

## Lifecycle

- Session: `draft → published → enrollment_closed → in_progress → completed`; cancellation is allowed from draft, published, or enrollment-closed.
- Self request: `draft → submitted → enrolled`; draft/submitted may be withdrawn, submitted may be rejected, and enrolled may enter controlled cancellation.
- Nomination: `submitted → employee_accepted → enrolled` or `employee_declined`; authorized Training staff may reject before enrollment.
- Direct assignment creates an enrolled record with explicit source, mandatory flag, reason, and capacity allocation.
- Historical corrections always append a replacement version and preserve the original.

## Verification boundary

Phase 11 verification must prove company ownership, immutable competency-version mapping, effective configuration, eligibility, manager snapshots, concurrent capacity protection, lifecycle and idempotency, participation/completion history, sensitive projection, scoped export, transactional audit, least privilege, and absence of cross-domain writes.
