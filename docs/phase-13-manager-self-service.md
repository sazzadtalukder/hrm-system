# Phase 13 — Manager Self Service

Phase 13 consolidates manager work without duplicating the workflows owned by Leave, Attendance, Claims, Loans, Performance, Training, Career, and Succession. The MVP provides a permission-scoped dashboard containing current direct reports and pending-work counts. Links continue to the authoritative module screens.

Authority is derived from the effective current manager assignment and `manager_self_service.view`; role names alone confer nothing. The endpoint is read-only, company-scoped, fail-closed, and does not write cross-domain data. Historical workflow authority remains governed by each source module's snapshots.

Excluded: notifications, delegation, bulk approval, workflow mutation, analytics, and new employee/assignment tables.
