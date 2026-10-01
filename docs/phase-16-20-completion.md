# Phases 16–20 completion record

## Phase 16 — Exit Management

Exit requests use employment/company ownership, immutable submission snapshots, optimistic workflow versions, idempotent transitions, manager then HR separation, clearance gates, and transactional audit. Terminal exits release the active-employment slot. Exit processing does not directly mutate employment history.

## Phase 17 — Final Settlement

Settlements are created only from completed exits. Items are immutable snapshots using `DECIMAL(19,2)` values and negative net settlement is prohibited. The lifecycle is Draft → Calculated → Submitted → Approved/Rejected → Paid, with creator/approver/payment-recorder separation. Payment is append-only, idempotent, and transactionally audited.

## Phase 18 — Reports & Analytics

The MVP workforce report is a permission-gated, company-scoped, read-only composition over existing domains. It creates no reporting tables and performs no cross-domain writes.

## Phase 19 — Notifications

The MVP provides an in-application inbox, explicit recipient creation, own-message reads, idempotent creation, and transactional audit. Email/SMS/push delivery, schedulers, retries, templates, and background jobs remain deferred.

## Phase 20 — Security & Audit Hardening

Audit browsing uses an allowlisted projection and company scope. Review decisions are append-only and idempotent. Session inspection requires explicit permission and a company-bound user relationship. Sensitive notification text and settlement reasons are excluded from audit payloads.

## Verification

Guarded verification is restricted to MySQL 8 at `127.0.0.1:3307/hrm_test` with `READ-COMMITTED`. The focused verifier checks schema, permissions, separation of duties, least privilege, monetary/workflow columns, concurrency indexes, read-only reporting, audit-field safety, and migration history. Existing deferred findings from earlier phases remain deferred.
