# Phase 1A Operations

## Health semantics

`GET /health/live` reports process liveness and never queries MySQL. It returns 200 while the
Express process can serve requests.

`GET /health/ready` executes a bounded database connectivity query. It returns 200 only when MySQL
is reachable and 503 otherwise. A readiness failure should remove an instance from traffic but
should not by itself force a restart.

## Startup and shutdown

Invalid environment configuration terminates startup with a nonzero exit code. The pool is created
at startup, while database connectivity is exposed through readiness so temporary database
unavailability can be observed without conflating it with process liveness.

`SIGINT` and `SIGTERM` start graceful shutdown:

1. Stop accepting new HTTP connections.
2. Close the HTTP server.
3. Destroy the Knex/mysql2 pool.
4. Exit successfully.

The default deadline is 10 seconds. Exceeding it exits unsuccessfully so the process supervisor can
detect an unclean shutdown.

## Database boundaries

- MySQL 8.x with InnoDB is required.
- Session transaction isolation is explicitly set to `READ COMMITTED` for pooled connections.
- Every pooled MySQL session is explicitly set to UTC with `time_zone = '+00:00'`.
- The transaction helper also requests `READ COMMITTED` for each transaction.
- Cross-row business invariants in later phases must lock a stable aggregate parent with
  `SELECT ... FOR UPDATE` and retain unique constraints as the final duplicate-write guard.
- Phase 1A contains no business migrations or tables.

Production credentials must be separated:

- Migration credentials may create and alter schema objects.
- Runtime credentials receive only the DML and metadata access required by the application.
- Optional reporting and backup credentials remain operational concerns outside the runtime API.
- Runtime credentials must not receive `DROP`, `ALTER`, or broad grant privileges.

## Local assumptions

- API: `http://127.0.0.1:3101`
- Web: `http://localhost:5173`
- MySQL: `127.0.0.1:3307` (HRM MySQL 8.x only; the separate XAMPP/MariaDB instance is out of scope)
- Database pool: minimum 0, maximum 10
- Database connection timeout: 5 seconds
- Database pool-acquisition timeout: 5 seconds
- JSON body limit: 1 MB
- Shutdown deadline: 10 seconds

All values are environment-configurable. Secrets belong in ignored local environment files or a
production secret manager.

Passwordless local MySQL is permitted only in development and test environments. Production
configuration validation requires a nonempty `DB_PASSWORD`.

## Deployment assumptions

The default configuration assumes one API instance behind either no proxy or one explicitly
configured trusted proxy. `TRUST_PROXY=false` is the safe default. Operators must set an exact hop
count only after confirming the proxy topology.

The API production deployment runs validated ESM JavaScript source directly; there is no backend
bundle. Set `NODE_ENV=production` through the process supervisor and run
`npm start --workspace @hrm/api`. The root build command syntax-checks all backend source files and
builds the frontend Vite artifact.

The configured web-origin allowlist controls CORS. Wildcard credentialed origins are not supported.
Development CSP is relaxed only for the Vite development environment; production uses Helmet's CSP
baseline and must not inherit HMR allowances.

Rate limiting is deferred. A single-instance deployment may later use an in-memory limiter. Multiple
instances require a shared limiter or reverse-proxy/WAF enforcement; Redis is not assumed.

## Request identity

The server generates a UUID `requestId` for every request and returns it as `X-Request-ID`. A valid
client `X-Correlation-ID` or `X-Request-ID` is retained separately as `correlationId`; it never
replaces the server request ID. External identifiers are limited to 128 safe ASCII characters.

Structured request logs include request ID, correlation ID, method, path, response status and
duration. Authorization headers, cookies, passwords, database passwords, tokens and secrets are
redacted or never logged.

## Operational signals

Phase 1A structured HTTP logs provide request count inputs, duration and HTTP outcome. Readiness
provides database latency. Later operational instrumentation must cover pool utilization, login
failures, refresh-token reuse, audit failures and database deadlocks when those capabilities exist.
