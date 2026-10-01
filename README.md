# HRM — Human Resource Management System

Production-oriented HRM web application implemented as a modular monolith. The current repository
contains the verified engineering, identity/authorization, organization, employee, attendance, and
Leave Management foundations through Phase 5.

## Architecture

- API: Node.js 24, Express, ESM JavaScript
- Web: React, Vite, React Router Data Mode, TanStack Query, Tailwind CSS
- Database: MySQL 8.x through Knex and mysql2
- Validation: Zod
- Logging: Pino and pino-http
- Workspaces: npm workspaces

```text
apps/
├── api/   Express, configuration, database, HTTP and operational infrastructure
└── web/   React application shell and frontend infrastructure
docs/      Operational documentation
```

## Prerequisites

- Node.js 24 LTS
- npm 11 or later
- MySQL 8.x for database readiness and migration commands

## Environment setup

Copy the examples without committing the resulting files:

```text
apps/api/.env.example → apps/api/.env
apps/web/.env.example → apps/web/.env
```

The API environment must contain valid MySQL connection settings. Local defaults use API port
`3000`, web port `5173`, a 1 MB JSON body limit, a 10-second shutdown deadline, a pool range of 0–10
connections, and 5-second database connection/acquisition timeouts. An empty database password is
permitted only for development or test environments; production requires a nonempty password.

## Local development

Install dependencies:

```text
npm install
```

Start both applications:

```text
npm run dev
```

Or start them separately:

```text
npm run dev:api
npm run dev:web
```

The API fails fast when required configuration is invalid. A running MySQL server is not required
to serve `/health/live`, but `/health/ready` returns 503 until MySQL is reachable.

## Database

Create the configured development database and use a runtime account with only required DML
privileges. Schema migrations should use a separate, more privileged credential supplied to the
migration process.

```text
npm run db:migrate
npm run db:rollback
npm run db:status
npm run db:seed
npm run db:bootstrap-admin
npm run db:reconcile-bootstrap-admin-scope
npm run db:bootstrap-organization
npm run db:reconcile-organization
npm run verify:phase-1b
npm run verify:phase-2
npm run verify:phase-3
npm run verify:phase-4
npm run verify:phase-5
```

Database connections and transactions explicitly use InnoDB `READ COMMITTED` isolation. Phase 1B
adds identity, session, scoped authorization, and audit tables. After migrations and the catalog
seed, provide `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` to the one-time bootstrap
command. It creates the initial System Administrator with `all` scope and refuses to run when an
active System Administrator already exists.

Legacy bootstrap administrators created with company scope are corrected only through the explicit,
audited reconciliation command. Set `RECONCILE_SYSTEM_ADMIN_EMAIL` and set
`RECONCILE_SYSTEM_ADMIN_CONFIRM` to the exact value `PROMOTE:<email>:ALL`, then run
`npm run db:reconcile-bootstrap-admin-scope`. The command is transactional and idempotent: it
creates an all-scope assignment, revokes the legacy company-scope assignment, increments the
account authorization version, and records an audit event. It is never run by migrations or seeds.

## Quality commands

```text
npm run lint
npm run format
npm run format:check
npm run build
```

Automated test infrastructure is intentionally deferred by product direction.

The web workspace produces a Vite production bundle. The API is validated with Node syntax checks
and runs its ESM JavaScript source directly; it is not bundled. Production must set
`NODE_ENV=production` in the process environment before running `npm start --workspace @hrm/api`.

## Implemented boundary

Included:

- Workspace, API and web foundations
- Environment validation
- Logging and request identity
- HTTP security and error handling
- Liveness and readiness
- Graceful shutdown
- Knex migration/seed and transaction infrastructure
- Minimal React application shell
- Identity, access/refresh sessions, password security, and auth-version invalidation
- Scoped roles, permissions, exceptional sensitive grants, and security audit events
- In-memory frontend access token with cookie-backed refresh and cross-tab coordination
- Multi-company-compatible organization masters with controlled single-company MVP bootstrap
- Scoped organization administration UI and API
- Employee Management with effective-dated assignment, status, and manager history
- Attendance shifts, immutable events, calculation versions, corrections, and locks
- Leave types/policies, request workflows, append-only balances, and attendance reconciliation

Explicitly deferred:

- Payroll
- ESS and all later HRM modules
- Distributed rate limiting; the single-instance MVP uses in-memory authentication limits
- Automated testing, pending a later testing decision

See [Phase 1A operations](docs/phase-1a-operations.md) for operational assumptions.
See [Phase 2 organization](docs/phase-2-organization.md) for bootstrap and reconciliation rules.
See [Phase 5 Leave Management](docs/phase-5-leave-management.md) for the leave contract and
verification boundary.
