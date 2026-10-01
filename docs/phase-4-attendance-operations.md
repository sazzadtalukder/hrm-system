# Phase 4 Attendance Operations

Phase 4 adds attendance configuration, immutable raw events, bounded imports, calculated/versioned daily records, corrections, and period locks. It remains company-scoped and uses effective employee assignments, work calendars, and shift versions.

## Approved limits

| Setting                                  |            Value |
| ---------------------------------------- | ---------------: |
| Check-in association window before shift |      120 minutes |
| Check-out association window after shift |      240 minutes |
| Near-duplicate window                    |       60 seconds |
| Maximum calculation range                | 31 calendar days |
| Maximum employments per calculation      |              500 |
| Maximum import rows                      |           10,000 |
| Import transaction chunk                 |         500 rows |

These values are centralized in `attendanceConstants.js`. API validation rejects requests above the limits. Changing them requires an explicit product decision; there is no generic rule engine.

## Import contract

CSV accepts exactly `employee_code,event_type,occurred_at,source_event_key`; the final column is optional. JSON uses the same field names. Unknown columns are rejected. `occurred_at` must be ISO 8601 with `Z` or an explicit offset. Company comes from the authorized request context/header, never a row. CSV requests require `X-Company-ID` and `Idempotency-Key`; `X-Source-Reference` is optional.

Fatal encoding, format, size, or company errors reject the batch before processing. Valid rows are committed in controlled chunks, row outcomes are retained, and mixed outcomes produce `partially_failed`. Unrestricted source payloads are not stored.

## Operational rules

- Missing effective shift or work calendar produces `configuration_exception`; attendance is not inferred.
- The earliest accepted check-in and latest accepted check-out are used. All contributing event IDs are snapshotted.
- Raw events are immutable. Near duplicates without distinct source keys become `review_required` when ambiguous.
- Manual events require a reason, permission, and audit event; they never overwrite a daily record.
- Corrections use one decision step and preserve state, decision, and record-version history. Requesters cannot decide their own request.
- Locks apply to a company or branch/date range. Reversal is explicit and audited. Lock history is retained.

## Verification safety

Run `npm run verify:phase-4` only with the guarded API environment targeting MySQL 8.x at `127.0.0.1:3307`, database `hrm_test`. The verifier refuses other host, port, database, or major-version values and resets only its isolated test fixtures.
