# short-url-management-api Specification

## Purpose

TBD - created by archiving change 'add-short-url-management-api'. Update Purpose after archive.

## Requirements

### Requirement: Protected management metadata lookup

The system SHALL expose `GET /api/short-urls/:code/management` and MUST require `X-Management-Password`. After successful authorization, HTTP 200 data SHALL contain `code`, `originalUrl`, `shortUrl`, `note`, `enabled`, `hasManagementPassword`, `createdAt`, and `updatedAt`, and MUST NOT contain the plaintext password or `managementPasswordHash`.

#### Scenario: Authorized metadata lookup

- **WHEN** a caller requests an existing manageable code with the matching management password
- **THEN** the system returns HTTP 200 with its private note and management metadata and exposes neither the password nor its hash

#### Scenario: Missing management header

- **WHEN** a caller omits `X-Management-Password` or it trims to an empty string
- **THEN** the system returns HTTP 401 without performing bcrypt comparison

---
### Requirement: Strict authorized partial update

The system SHALL expose `PATCH /api/short-urls/:code` with a strict JSON body containing at least one of `originalUrl`, `note`, or `enabled`. Omitted fields SHALL remain unchanged. `originalUrl` SHALL use the creation API HTTP(S) normalization rules. A non-null `note` SHALL be trimmed and limited to 240 characters; `null`, an empty string, or whitespace-only note SHALL persist as `NULL`. A successful update SHALL set `updatedAt` to the database current time and return HTTP 200 with the updated management metadata, `cacheSynchronized`, and `staleWindowWarning`.

#### Scenario: Update selected fields

- **WHEN** an authorized caller submits `{ "note": " revised ", "enabled": false }`
- **THEN** the system persists `note` as `"revised"`, persists `enabled` as `false`, leaves `originalUrl` unchanged, refreshes `updatedAt`, and returns the updated metadata

#### Scenario: Clear a note

- **WHEN** an authorized caller submits `note` as `null`, an empty string, or whitespace-only text
- **THEN** the system persists `note` as SQL `NULL`

#### Scenario: Reject an invalid patch body

- **WHEN** the body is empty, contains an unknown field, contains an invalid original URL, or contains a note longer than 240 characters after trimming
- **THEN** the system returns HTTP 400 with the stable validation error shape and performs no PostgreSQL or KV mutation

#### Scenario: Management password is immutable

- **WHEN** a PATCH body includes `managementPassword`, `newManagementPassword`, or `managementPasswordHash`
- **THEN** strict validation returns HTTP 400 and the stored hash remains unchanged

---
### Requirement: Management authorization outcomes

Each management GET and PATCH SHALL authorize against the stored bcrypt hash after rate limiting and resource lookup. A missing or incorrect password SHALL return HTTP 401, an existing row with a null management password hash SHALL return HTTP 403, and an absent code SHALL return HTTP 404. Responses and logs MUST NOT disclose plaintext passwords, password hashes, SQL, connection strings, raw driver errors, or stack traces.

#### Scenario: Incorrect password

- **WHEN** an existing manageable code receives a non-matching management password
- **THEN** the system returns HTTP 401 and performs no mutation

#### Scenario: Permanently unmanageable code

- **WHEN** an existing code has `management_password_hash` equal to `NULL`
- **THEN** the management endpoint returns HTTP 403 and does not permit adding a password

#### Scenario: Unknown code

- **WHEN** the requested valid-format code does not exist
- **THEN** the management endpoint returns HTTP 404

#### Scenario: Sanitized infrastructure failure

- **WHEN** database access, initial KV invalidation, or the rate limiter fails
- **THEN** the system returns HTTP 503 with a stable public error and logs no sensitive request or infrastructure value

---
### Requirement: Management verification rate limit

The system SHALL use the Cloudflare `MANAGEMENT_RATE_LIMITER` binding before PostgreSQL access and bcrypt comparison for every management GET or PATCH verification attempt. The key MUST combine the trusted Cloudflare client IP and validated short code. Each key SHALL permit at most 10 attempts per 60-second period, and missing, incorrect, and correct passwords MUST all consume attempts. An attempt beyond the limit SHALL return HTTP 429 without PostgreSQL access or bcrypt comparison.

#### Scenario: Tenth attempt is admitted

- **WHEN** a key has consumed nine attempts in the current 60-second period and sends its tenth request
- **THEN** the request proceeds to resource lookup and authorization

#### Scenario: Eleventh attempt is rejected early

- **WHEN** a key has consumed ten attempts in the current 60-second period and sends another request
- **THEN** the system returns HTTP 429 with zero PostgreSQL operations and zero bcrypt comparisons

#### Scenario: Limits are isolated by IP and code

- **WHEN** two requests differ by trusted client IP or validated short code
- **THEN** they consume different rate-limit keys

---
### Requirement: Last-write-wins management updates

Management PATCH operations SHALL use last-write-wins semantics and SHALL NOT require an ETag, version, or `If-Match` precondition. Each successful database update SHALL atomically apply the supplied fields and refresh `updated_at`.

#### Scenario: Later authorized update wins

- **WHEN** two authorized PATCH requests update the same field without a concurrency precondition and the second database update commits after the first
- **THEN** the persisted field contains the second value and `updated_at` reflects the second update

---
### Requirement: Local development management identity
The project dev wrapper SHALL inject `URLOW_LOCAL_DEV` with the exact string value `true`. A management GET or PATCH request that has no trusted `CF-Connecting-IP` SHALL use the fixed client identity `local-dev` only when this binding is present with that exact value. A trusted Cloudflare client IP MUST take precedence whenever present. An unmarked environment, a marker with any other value, and production configuration without a trusted client IP MUST continue to return HTTP 503 before rate limiting, PostgreSQL access, or bcrypt comparison. The browser client MUST NOT send `CF-Connecting-IP` or the local marker.

#### Scenario: Marked local request without Cloudflare IP
- **WHEN** the project dev wrapper starts the Worker with `URLOW_LOCAL_DEV=true` and a management request has no `CF-Connecting-IP`
- **THEN** authorization uses `local-dev:<code>` as the rate-limit key and proceeds according to the supplied management password

#### Scenario: Trusted Cloudflare IP takes precedence
- **WHEN** `URLOW_LOCAL_DEV=true` and a management request contains a trusted `CF-Connecting-IP` value of `203.0.113.10`
- **THEN** authorization uses `203.0.113.10:<code>` as the rate-limit key

#### Scenario: Unmarked request remains fail closed
- **WHEN** a management request has no trusted `CF-Connecting-IP` and `URLOW_LOCAL_DEV` is missing or is not the exact string `true`
- **THEN** the system returns HTTP 503 with zero rate-limiter, PostgreSQL, and bcrypt operations

#### Scenario: Browser does not forge infrastructure identity
- **WHEN** the frontend issues a management GET or PATCH
- **THEN** its request headers contain `X-Management-Password` and contain neither `CF-Connecting-IP` nor `URLOW_LOCAL_DEV`
