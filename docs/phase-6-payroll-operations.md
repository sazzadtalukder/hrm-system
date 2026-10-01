# Phase 6 Payroll Operations

Phase 6 implements monthly, company-scoped regular payroll with exact two-decimal arithmetic, effective compensation history, fixed earning/deduction inputs, immutable calculation attempts/results, maker-checker approval, separate locking, controlled adjustment/reversal, and post-lock payslip publication.

## Fixed limits and calculation

- Maximum frozen run population: 500 employments.
- Population must be explicit employment IDs or an authorized branch/department scope.
- Monthly base salary is not prorated for mid-period join/leave in MVP.
- Gross = monthly base + fixed earnings.
- Net = gross - fixed deductions; negative net pay is rejected.
- Attendance and approved Leave summaries are informational only and are frozen in normalized,
  typed snapshot rows for each result version.
- Money crosses the API as decimal strings and is never calculated with JavaScript floating point.

## Workflow and separation of duties

```text
Draft -> Processing -> Processed -> Submitted -> Approved -> Locked
                              ^          |
                              +-- Rejected
```

Every frozen employee must calculate successfully before submission. Processor/submitter cannot approve or lock. Approver cannot lock. Lock permission is exceptional and must be explicitly assigned to a separate actor.

Adjustments use `Draft -> Submitted -> Approved/Rejected -> Applied`; original locked results remain immutable. Result reversal is append-only, revokes an active publication, excludes the result from active payable views, and creates no replacement payment.

## Safety and verification

`npm run verify:phase-6` is destructive only to Phase 6 fixture tables and refuses any target other than MySQL 8.x at `127.0.0.1:3307`, database `hrm_test`. Never use port 3306. Verification must not target or bootstrap `hrm_dev`.

No client periods, components, compensation, statutory rules, or company identity are seeded. Bangladesh tax, benefits, loans, claims, overtime, leave encashment, off-cycle runs, bank files, accounting integration, PDF payslips, schedulers, and background queues remain deferred.
