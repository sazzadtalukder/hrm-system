# Phase 1B Identity and Authorization

Phase 1B implements opaque rotating refresh tokens stored only as hashes, short-lived access JWTs,
server-side session and `auth_version` checks on every authenticated request, Argon2id passwords,
and permission-specific scoped RBAC.

Refresh tokens are HttpOnly, SameSite=Lax cookies and are never exposed to JavaScript. Access tokens
remain in browser memory. Cookie-mutating authentication endpoints require an allowlisted Origin.
Login and refresh endpoints use a single-instance in-memory limiter; a multi-instance deployment
must replace it with shared proxy/WAF enforcement or an approved shared store.

Role and direct-permission grants preserve their own scope. A protected repository must receive a
server-generated access context. Sensitive access is permitted only when both the base-record grant
and sensitive grant match the record.

The Phase 1B migration intentionally stores `company_id`, `branch_id`, and `department_id` as scoped
identifiers without foreign keys because Organization tables belong to Phase 1C. Phase 1C must add
and validate those relationships without weakening the current authorization boundary.

Administrative authentication reset invalidates all sessions and leaves the account inactive with
an unknown random password. Forgotten-password delivery and reset completion remain deferred until
notification infrastructure is approved.
