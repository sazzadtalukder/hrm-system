# Phase 15 — Document Management

The bounded MVP stores document metadata and immutable external references only. Binary upload/storage, virus scanning, OCR, e-signature, and provider integrations are deferred. Documents target company, branch, department, or one employment; published employee documents may require acknowledgment.

Document versions are append-only. Publication and revocation are audited workflow events with optimistic concurrency and idempotency. Sensitive document references are omitted unless `document_sensitive.view` intersects record scope. Employees receive only own/audience access and acknowledgment permission. Document Administrators receive explicit non-sensitive administration permissions; sensitive access is never automatically granted.

References support `external_url` (HTTPS only) and `external_reference`. Audit metadata never contains reference values, filenames, checksums, or sensitive content.

Excluded: binary storage, folders, full-text search, templates/mail merge, retention deletion, legal holds, e-signature, notifications, and external document-provider integration.
