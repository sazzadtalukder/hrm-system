# Phase 5 Leave Management

Phase 5 implements company-scoped Leave Management on the verified identity, organization, employee, and attendance foundations. It uses employment episodes, effective assignments and managers, fixed annual balance periods, append-only balance entries, immutable request versions/days, module-specific approval persistence, and explicit attendance recalculation.

## Approved product contract

- Leave units are `full_day`, `first_half`, and `second_half`; hourly leave is excluded.
- The leave year is company-defined and explicitly snapshotted. MVP defaults to January 1–December 31.
- Business leave types are configured, never inferred or seeded.
- Full-period entitlement is posted once; monthly accrual, carry forward, and expiry processing are deferred.
- Negative balances are prohibited unless the effective leave configuration explicitly allows them.
- Submission reserves balance; approval consumes it; rejection or cancellation releases it through new ledger entries.
- Rest days and holidays do not count by default and are controlled by the effective leave-type version.
- Submitted, approved, and cancellation-requested requests block overlap. Draft, rejected, withdrawn, and cancelled requests do not.
- The effective direct manager on the first leave date is snapshotted at submission. Explicitly scoped HR is fallback only when no manager path exists.
- Employees cannot submit backdated leave and may apply no more than 365 calendar days ahead using the company-local date.
- Probationary and confirmed employments are eligible. Suspended, resigned, terminated, and retired employments cannot submit new requests.
- Cross-period requests remain one request and allocate each request day to its applicable balance period.
- Sensitive reasons require the intersection of record access and `leave_sensitive.view`.
- Full-day approved leave may calculate attendance as `on_leave`. Half-day leave retains normal punch calculation and a reviewable partial-leave exception where needed.
- Leave decisions never mutate attendance. Locked attendance creates append-only reconciliation-required history.

## Workflow

```text
Draft -> Submitted -> Approved / Rejected
Draft -> Withdrawn
Approved -> Cancellation Requested -> Cancelled / Cancellation Rejected
```

Every state change uses optimistic workflow/request versions, an append-only state event, transactional audit, and an idempotent terminal decision. Requesters cannot decide their own request or cancellation.

## Boundaries

No generic workflow, rule, policy, or repository framework is introduced. Payroll, leave encashment, attachments, notifications, hourly leave, automatic accrual, and attendance/payroll compensation consequences remain deferred. The five Phase 3 backlog warnings remain unchanged.

## Verification safety

The Phase 5 verifier must prove MySQL 8.x, `127.0.0.1:3307`, and database `hrm_test` before resetting isolated fixtures. It must never connect to port 3306 or destructively verify against `hrm_dev`.
