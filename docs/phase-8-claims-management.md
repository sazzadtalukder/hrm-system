# Phase 8 — Claims & Expense Reimbursement

## Approved decision clarifications

Phase 8 uses a two-step Manager → Finance approval lifecycle and a separate payment actor.

Cancellation permissions are explicit:

- `claim.request_cancellation`: Employee (`own`) for an eligible submitted or approved claim.
- `claim.approve_cancellation`: the snapshotted effective Manager (`direct_reports`) while Submitted; explicitly scoped Finance authority after Manager or Finance approval. Scoped HR fallback may act only when the submission captured HR fallback because no effective manager existed.
- `claim.reject_cancellation`: the same eligible authority and scope as cancellation approval.

The claimant can never approve or reject their own cancellation. Cancellation attempts, decisions, and state changes are append-only, idempotent, transactionally audited, and never delete the claim.

Finance permissions are only:

- `claim.finance_approve`
- `claim.finance_reject`
- `claim.record_payment`

There is no `claim.finance_review` permission. Finance approval and payment recording must be performed by different users, and the claimant may perform neither action.

All remaining Phase 8 Product Decision Record choices are approved. Claims do not write to Payroll, Benefits, Attendance, Leave, accounting, bank-transfer, or document-storage domains.

## Central limits

- 50 line items per claim
- 90 company-local calendar-day expense age
- No future expense dates
- `DECIMAL(19,2)` positive company-currency amounts
- Page size 25 by default and 100 maximum
- CSV export maximum 10,000 rows
- 10 evidence references per item
- Reasons contain 1–500 trimmed characters

Evidence is metadata-only (`document_reference` or `external_reference`). Binary storage is deferred.
