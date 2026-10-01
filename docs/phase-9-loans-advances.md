# Phase 9 — Loans & Salary Advances

Phase 9 uses one company-scoped facility model with `facility_kind` values `loan` and `salary_advance`. Claims remain isolated in Phase 8.

## Approved MVP decisions

- Manager approval followed by Finance approval; explicitly scoped HR fallback applies only when no effective manager exists.
- Finance approver, disbursement recorder, and repayment recorder are separate explicitly authorized actors. A claimant may perform none of those actions on their own facility.
- All facilities are interest-free. The schema contains no interest method, rate, accrual, schedule, or ledger fields. Total repayable equals approved principal.
- Company currency only; MySQL `DECIMAL(19,2)` and decimal-string APIs; positive amounts; no JavaScript floating-point financial calculation.
- Eligible statuses are probation and confirmed. Ended employment or a known future employment end date prevents submission.
- Type versions configure optional minimum service days, minimum/maximum principal, minimum/maximum monthly term, maximum concurrent active facilities, and due day.
- Submitted applications snapshot facility version, manager, organization, employment status, eligibility inputs, optional compensation eligibility input, and financial terms.
- First installment is in the month after disbursement. A missing configured due day resolves to that month's final calendar day. Generated schedules are immutable.
- Payroll integration is deferred. Repayments are manual, partial repayment and early settlement are allowed, and overpayment is prohibited.
- Repayment, adjustment, and reversal are append-only. Reversal references the original entry; double reversal is prohibited.
- Disbursed facilities cannot be cancelled. Approved-but-undisbursed applications use controlled cancellation.
- Manager and Finance rejection are terminal; corrections are new applications.
- Employees see their own complete financial records. Managers receive minimum approval data. HR requires explicit `loan_sensitive.view` for full sensitive access.
- Number format is `LON-{YYYY}-{000001}` using a company/year locked counter shared by loans and advances.
- Pagination defaults to 25 and is capped at 100; CSV export is capped at 10,000 rows.

No generic workflow/rule/repository engine, scheduler, payment gateway, accounting, bank, or Payroll integration is introduced. The Phase 1B–8 deferred backlog remains unchanged.
