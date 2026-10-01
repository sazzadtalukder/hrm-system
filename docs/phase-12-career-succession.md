# Phase 12 — Career Planning & Succession Management

Phase 12 implements the approved Career Development and Succession Management subdomains over the protected Phase 1B–11 baseline. Career plans and succession records use separate domain services, repositories, workflows, sensitive permissions, and history while sharing a narrow read-only employee snapshot reader.

Career-plan eligibility is limited to active probationary and confirmed employments. Submission snapshots company-local date, organization, employment status, and effective manager. Manager approval activates the plan. Scoped HR fallback applies only when no manager exists. Goals, development actions, competency-version mappings, and Training course/completion references preserve immutable historical meaning.

Succession uses succession-specific critical positions rather than general headcount positions. Effective direct managers nominate within direct-report scope; department/branch authority requires an explicit matching permission grant. Managers recommend readiness. Authorized HR/Talent actors confirm or revise it, with a mandatory reason, while the manager assessment remains append-only. Employees have no succession route or candidacy visibility.

Phase 12 never writes Employee, Employment, Assignment, Organization, Performance, Training, Attendance, Leave, Payroll, Benefits, Claims, or Loans data. It introduces no generic engine, background job, notification, business fixture, physical deletion, or new runtime dependency.

## Limits

- Default page size: 25
- Maximum page size: 100
- Maximum CSV export: 10,000 rows
- Maximum career goals: 20
- Maximum competency references per versioned record: 50
- Reasons: 500 characters
- Narratives: 5,000 characters

Verification is destructive only against guarded MySQL 8 `hrm_test` on `127.0.0.1:3307` with `READ COMMITTED`.

## Implemented API surface

Career provides permission-scoped path list, create, detail, history, version creation, activation, and deactivation. Career plans provide own/team/administrative list and detail, draft creation/update, submit, return, approval, withdrawal, progress, completion, cancellation, manager reassignment, immutable evidence references, history, and bounded CSV export.

The Career draft editor supports bounded editing of multiple goals and development actions, including competency-version mappings and Training course-version references. Training completion evidence is immutable history tied to the action version on which it was recorded; editing a draft does not rewrite or transfer that historical evidence.

Succession provides scoped critical-position list, create, detail, history, version creation, activation, and deactivation. Succession plans provide scoped create, list, detail, history, activation, closure, and cancellation. Nominations provide create, list, detail, submit, manager recommendation/rejection, HR/Talent confirmation/rejection/removal, withdrawal, readiness history/revision, manager reassignment, history, and bounded CSV export.

Every route uses the existing authentication and `requirePermission` middleware. Protected plan and nomination repositories assert the exact server-generated access context and apply company, branch, department, own, or snapshotted-direct-report scope as applicable. Role names never provide authority by themselves.

## Historical and sensitive behavior

Career paths, plans, goals, development actions, critical positions, succession plans, nominations, readiness decisions, and manager reassignments preserve append-only versions or events. Effective Employee/Employment/Assignment, manager, Performance competency-version, Training course-version, and Training completion-version values are read as immutable references; Phase 12 never updates those source domains.

Career narratives and succession readiness/narrative fields are omitted unless the actor has both the sensitive permission and record scope. Sensitive values are not written to audit metadata. Critical mutations lock their stable parent, apply optimistic version checks, use database uniqueness for final race protection, and write their audit event in the same transaction. Replayable mutations use bounded idempotency keys with company-scoped uniqueness.

## Permissions

Permissions are domain-specific under `career_path.*`, `career_plan.*`, `critical_position.*`, `succession_plan.*`, and `succession_nomination.*`, plus bounded export and exceptional `career_sensitive.view` / `succession_sensitive.view`. Employees receive only own Career permissions and receive no Succession permissions or navigation. Managers receive snapshotted direct-report Career and nomination authority. Broader authority requires an explicit matching scope. Talent Management Administrator and HR Administrator receive approved non-sensitive operational permissions; no role receives sensitive access automatically.

## Database safety restriction

Database verification is pending during the Phase 12 remediation stage. No migration, rollback, seed, status, verifier, or MySQL command is authorized in this stage. Future test-database operations must use `scripts/guarded-hrm-test-knex.js` or the strict `scripts/guarded-phase-12-cycle.ps1` wrapper. Those wrappers explicitly target only `127.0.0.1:3307/hrm_test`, verify MySQL 8 and `READ-COMMITTED`, and stop before Knex on any mismatch.

Static lint, formatting, build, dependency, boundary, migration-source, verifier-source, and guard-source inspection do not establish database correctness. Phase 12 must not be described as database-verified until a separately authorized guarded verification run succeeds.

The pending verifier contains executable, database-backed scenarios for manager snapshots and reassignment, HR fallback, self-decision denial, audit-failure rollback, selected idempotency replay/conflict cases, sensitive projection, HTTP employee succession denial, cross-company reference rejection, active-plan and nomination concurrency, concurrent progress/readiness updates, nomination rejection/withdrawal, succession-plan cancellation, scoped CSV, selected append-only versions, and cross-domain source-row comparison. These scenarios have intentionally not been executed. Full mutation-by-mutation idempotency, complete negative-transition and version-immutability permutations, real production authentication/permission integration, and all CSV scope exclusions remain verifier gaps. No database correctness or Phase 12 completion claim follows from static checks.
