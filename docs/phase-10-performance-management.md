# Phase 10 — Performance Management

## Approved product decisions

Phase 10 is a bounded Performance Management domain built on the protected Phase 1B–9 baselines. Companies create review cycles without a fixed frequency. Cycles may overlap, but an employment cannot participate in two active reviews whose review periods overlap unless an explicitly authorized HR override is recorded and audited. Population is bounded by explicit employment IDs or an authorized branch/department selection. The review-period end date is the population anchor.

Only probationary and confirmed employments active through the anchor date are eligible. Population snapshots employee identity, employment status, organization, effective manager, template, rating scale, and configuration. Later organizational or manager changes do not rewrite authority or history. Missing-manager work may be handled only by explicitly scoped HR fallback. Manager reassignment is explicit, reasoned, append-only, and audited.

Rating scales contain 3–7 company-configured ordinal levels; the initial product convention is 1–5, but no business configuration is seeded. There is no automatic score or formula. Self-ratings are advisory. The snapshotted manager explicitly chooses the authoritative overall rating. Templates permit at most 20 goals. Goal weights are optional; when enabled, approved goals total exactly 100. Competencies are a minimal versioned company catalog without weighting.

The workflow is Goals → Self Assessment → Manager Assessment → Employee Acknowledgment → HR Finalization. Employees draft and submit goals; the snapshotted manager approves or returns them. Approved goals are immutable except through an authorized append-only correction. Self-assessment is required before manager submission. Acknowledgment records receipt or receipt-with-disagreement, not agreement. Authorized HR may finalize without acknowledgment only after the applicable due date, with a mandatory reason. Finalized reviews cannot be reopened normally. HR may cancel only before manager-assessment submission.

Performance narratives and ratings are sensitive by default. Employees see their own self-assessment and see manager assessment only after submission. Managers see only assigned reviews. HR requires `performance_sensitive.view` intersected with record scope. Auditors receive omitted sensitive projections, and System Administrators receive no automatic performance access. Sensitive reads are audited without narrative/rating values.

The domain never mutates Compensation, Payroll, Benefits, employment status, promotion, Attendance, Leave, Claims, Loans, or Training. No workflow/rule/form-builder engine, generic repository, background job, notification system, or new runtime dependency is introduced. There are no physical-delete APIs or business-data seed fixtures. The Phase 1B–9 deferred backlog remains untouched.

## Operational limits

- Rating levels: 3–7
- Goals per template/review: maximum 20
- Pagination: default 25, maximum 100
- CSV export: maximum 10,000 rows
- Dates use company-local `YYYY-MM-DD`; timestamps are UTC.
- Verification is destructive only against guarded MySQL 8 `hrm_test` on `127.0.0.1:3307`.
