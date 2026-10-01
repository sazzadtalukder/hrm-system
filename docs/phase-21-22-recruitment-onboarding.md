# Phases 21–22: Recruitment and Onboarding

Phase 21 owns workforce demand, requisitions, candidate selection, offers and the immutable
accepted-offer conversion record. Phase 3 remains the only writer of Employee, Employment,
employment status and assignment records. Conversion uses the existing Employee creation service
inside the recruitment transaction, locks the offer and requisition, requires both
`recruitment_hire.convert` and `employee.create`, and is company-idempotent.

Phase 22 starts from a completed conversion. It snapshots the selected template, employment,
organization assignment, manager and checklist tasks. Readiness assessments are snapshots only;
they do not write Attendance, Payroll, Leave, Benefits, Claims, Assets, Documents or identity data.

Both modules use company-scoped access contexts, append-only version/state rows, optimistic
workflow versions, transactional audit events, and explicit sensitive-data permissions. Candidate
contact details are omitted from the ordinary candidate projection. In-app notification delivery can
be invoked through the existing Notifications module; email, SMS, public applications, automated
reminders and provisioning integrations are outside this scope.

Database verification is pending the guarded Phase 21 migration retry after the MySQL foreign-key
identifier repair. No business fixture data is included in either migration.
