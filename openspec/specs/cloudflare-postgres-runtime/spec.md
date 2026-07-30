# cloudflare-postgres-runtime Specification

## Purpose

TBD - created by archiving change 'add-cloudflare-neon-hyperdrive'. Update Purpose after archive.

## Requirements

### Requirement: Dynamic Cloudflare Worker deployment

The system SHALL build the Nuxt application as a dynamic ES Module Cloudflare Worker with a default export, a server entry point, and a static asset binding. The bundle SHALL retain `cloudflare:sockets` as a Worker runtime external. The Worker configuration MUST enable Node.js compatibility and MUST declare the `HYPERDRIVE` binding.

#### Scenario: Production build targets Cloudflare Worker

- **WHEN** the production build command completes
- **THEN** the output contains an ES Module Worker server entry with a default export at `.output/server/index.mjs` and static assets under `.output/public`

#### Scenario: Worker configuration is incomplete

- **WHEN** Wrangler validates a deployment configuration without the `HYPERDRIVE` binding or Node.js compatibility flag
- **THEN** deployment validation fails before the Worker is published

---
### Requirement: Hyperdrive-only runtime database access

The production runtime SHALL obtain its PostgreSQL connection string exclusively from the `HYPERDRIVE` binding. Each database operation MUST close its request-scoped PostgreSQL client after success or failure, and the runtime MUST NOT fall back to a direct Neon connection or mock data.

#### Scenario: Runtime database query succeeds

- **WHEN** a server request runs with a valid `HYPERDRIVE` binding connected to Neon
- **THEN** the request creates a PostgreSQL client from the binding, executes through Drizzle ORM, and closes the client after completion

#### Scenario: Hyperdrive binding is missing

- **WHEN** a server request requires database access but the `HYPERDRIVE` binding is missing or malformed
- **THEN** the request fails explicitly without reading `DATABASE_URL`, using mock data, or attempting a direct Neon connection

---
### Requirement: Separate migration connection

The migration workflow SHALL read the direct Neon PostgreSQL connection from `DATABASE_URL` in an untracked `.env`, SHALL require TLS, and SHALL keep this value outside tracked files. Local Wrangler development SHALL read only `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` from an untracked `.dev.vars`; the local and production Worker runtime MUST NOT receive or use `DATABASE_URL`.

#### Scenario: Migration runs with valid configuration

- **WHEN** an operator runs the migration command with a valid direct Neon `DATABASE_URL`
- **THEN** Drizzle Kit applies the committed SQL migrations to Neon and exits successfully

#### Scenario: Migration configuration is absent

- **WHEN** an operator runs a migration command without `DATABASE_URL`
- **THEN** the command exits with a non-zero status before executing SQL

#### Scenario: Local Worker connects to Neon

- **WHEN** an operator starts Wrangler development with `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` set to a valid direct Neon URL
- **THEN** the local Worker resolves the `HYPERDRIVE` binding and executes database queries without storing the URL in `wrangler.jsonc` or exposing `DATABASE_URL` as a Worker binding

---
### Requirement: Minimal short URL schema

The database SHALL contain a `short_urls` table with a database-generated UUID primary key named `id`, a non-null text field named `original_url`, a non-null `varchar(32)` field named `code`, and a non-null time-zone-aware timestamp named `created_at` with a database default. The database MUST enforce uniqueness for `code`.

#### Scenario: Migration creates the schema

- **WHEN** the initial migration is applied to an empty Neon branch
- **THEN** PostgreSQL creates `short_urls` with the required columns, defaults, primary key, and unique constraint

#### Scenario: Duplicate short code is rejected

- **GIVEN** `short_urls` contains a row whose `code` is `nuxt-guide`
- **WHEN** another row is inserted with `code` equal to `nuxt-guide`
- **THEN** PostgreSQL rejects the insert with a unique-constraint violation

---
### Requirement: Database health endpoint

The system SHALL expose `GET /api/health/database`. A successful `SELECT 1` query SHALL return HTTP 200 with `{ "status": "ok" }`. Missing configuration, connection failure, or query failure SHALL return HTTP 503 with `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }` and MUST NOT expose connection strings, credentials, database hosts, or raw driver errors.

#### Scenario: Database is available

- **WHEN** a caller requests `GET /api/health/database` and Hyperdrive successfully executes `SELECT 1`
- **THEN** the endpoint returns HTTP 200 and the JSON body `{ "status": "ok" }`

#### Scenario: Database is unavailable

- **WHEN** a caller requests `GET /api/health/database` and configuration validation, connection, or query execution fails
- **THEN** the endpoint returns HTTP 503 and the JSON body `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }`

#### Scenario: Database error contains sensitive details

- **WHEN** the underlying database driver reports an error containing a connection string, host, username, or password
- **THEN** the public health response contains only the stable 503 error body and no sensitive details

---
### Requirement: Reproducible operator documentation

The project documentation SHALL distinguish the obsolete Cloudflare Pages static deployment from the current Cloudflare Worker dynamic deployment and SHALL document dependency installation, Neon direct connection setup, Hyperdrive creation and binding, local development, migration, build, health verification, and deployment commands without embedding credentials.

#### Scenario: New operator follows the setup guide

- **WHEN** an operator starts from a clean checkout with Cloudflare and Neon access
- **THEN** the documented steps provide every variable name, resource name, command, and verification response required to migrate, run, and deploy URLow without copying a secret into a tracked file
