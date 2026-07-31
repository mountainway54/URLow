# edge-redirect-cache Specification

## Purpose

TBD - created by archiving change 'add-cloudflare-neon-hyperdrive'. Update Purpose after archive.

## Requirements

### Requirement: Validated edge redirect lookup

The system SHALL accept redirect codes matching `[A-Za-z0-9_-]{4,32}` and SHALL use the KV key `redirect:<code>`. A code outside that format SHALL return HTTP 404 without reading `SHORT_URL_CACHE` or PostgreSQL.

#### Scenario: Valid code reaches the cache

- **WHEN** a caller requests `GET /nuxt-guide`
- **THEN** the system reads the KV key `redirect:nuxt-guide`

#### Scenario: Invalid code is rejected before I/O

- **WHEN** a caller requests a path whose code is shorter than 4 characters, longer than 32 characters, or contains a character outside letters, digits, underscore, and hyphen
- **THEN** the system returns HTTP 404 with zero KV operations and zero PostgreSQL operations

---
### Requirement: KV cached redirect resolution

The `SHORT_URL_CACHE` binding SHALL store versioned discriminated JSON values. A positive value SHALL have the shape `{ "version": 1, "kind": "redirect", "targetUrl": string }`, SHALL contain an absolute HTTP(S) URL, and SHALL have no application expiration. A negative value SHALL have the shape `{ "version": 1, "kind": "missing" }` and SHALL be written with `expirationTtl: 60`. A disabled value SHALL have the shape `{ "version": 1, "kind": "gone" }` and SHALL have no application expiration.

#### Scenario: Positive cache hit

- **WHEN** a valid code resolves to a valid positive KV value
- **THEN** the system returns HTTP 302 to `targetUrl` without creating a PostgreSQL client

#### Scenario: Negative cache hit

- **WHEN** a valid code resolves to a negative KV value
- **THEN** the system returns HTTP 404 without creating a PostgreSQL client

#### Scenario: Disabled cache hit

- **WHEN** a valid code resolves to `{ "version": 1, "kind": "gone" }`
- **THEN** the system returns HTTP 410 without creating a PostgreSQL client

#### Scenario: Invalid cache value

- **WHEN** a KV value cannot be parsed, has an unsupported version or kind, or contains a non-HTTP(S) target URL
- **THEN** the system treats the value as a cache miss and queries PostgreSQL instead of redirecting

---
### Requirement: Read-through PostgreSQL fallback

On a KV miss or KV read failure, the system SHALL query the indexed `short_urls.code` field through Hyperdrive and SHALL retrieve both `original_url` and `enabled`. A found enabled row SHALL return HTTP 302 and schedule a positive KV write with `waitUntil`. A found disabled row SHALL return HTTP 410 and schedule a disabled KV write with `waitUntil`. A confirmed missing row SHALL return HTTP 404 and schedule a negative KV write with `expirationTtl: 60`. KV backfill failure MUST NOT delay or change the database-derived response.

#### Scenario: Cache miss finds an enabled short URL

- **WHEN** KV has no usable value and PostgreSQL returns an enabled row for `https://example.com/target`
- **THEN** the system returns HTTP 302 to that URL and schedules a positive KV backfill

#### Scenario: Cache miss finds a disabled short URL

- **WHEN** KV has no usable value and PostgreSQL returns a row whose `enabled` value is false
- **THEN** the system returns HTTP 410 and schedules a disabled KV backfill

#### Scenario: Cache miss confirms absence

- **WHEN** KV has no usable value and PostgreSQL returns no row for a valid code
- **THEN** the system returns HTTP 404 and schedules a 60-second negative KV backfill

#### Scenario: Backfill exhausts KV quota

- **WHEN** PostgreSQL derives a redirect, gone, or missing result and the corresponding KV write fails because of quota or a service error
- **THEN** the system preserves the database-derived HTTP response and logs a non-sensitive cache synchronization error

---
### Requirement: Database outage redirect policy

A valid positive KV hit SHALL continue to return HTTP 302 and a negative KV hit SHALL continue to return HTTP 404 while PostgreSQL is unavailable. A KV miss, unusable KV value, or KV read failure combined with PostgreSQL unavailability SHALL return HTTP 503. The system MUST NOT use an additional stale backup outside the current KV value.

#### Scenario: Database outage with positive cache hit

- **WHEN** PostgreSQL is unavailable and KV contains a valid positive value
- **THEN** the system returns HTTP 302 without attempting PostgreSQL access

#### Scenario: Database outage with negative cache hit

- **WHEN** PostgreSQL is unavailable and KV contains a negative value
- **THEN** the system returns HTTP 404 without attempting PostgreSQL access

#### Scenario: Database outage after cache failure

- **WHEN** KV cannot provide a usable result and PostgreSQL is unavailable
- **THEN** the system returns HTTP 503 without exposing KV or database error details

---
### Requirement: Active cache synchronization for mutations

Creating a short URL SHALL insert the PostgreSQL row before overwriting `redirect:<code>` with a positive KV value, including when the key currently contains a negative value. Updating an original URL, note, or enabled state SHALL delete the KV key before changing PostgreSQL. An initial KV delete failure MUST prevent the database update. After a successful database update, the system SHALL write a positive value when the resulting row is enabled and a disabled value when it is disabled. A post-update KV put failure MUST NOT roll back the database row; the mutation result SHALL expose `cacheSynchronized=false` and the fixed cross-region stale-window warning.

#### Scenario: Creation overwrites a negative marker

- **GIVEN** `redirect:new-code` contains `{ "version": 1, "kind": "missing" }`
- **WHEN** PostgreSQL successfully inserts `new-code` for `https://example.com/new`
- **THEN** the mutation overwrites the KV key with the corresponding positive value before reporting cache synchronization success

#### Scenario: Creation cache write fails after insert

- **WHEN** PostgreSQL inserts a new short URL and the following KV overwrite fails
- **THEN** the database row remains authoritative, no compensating database delete runs, and the mutation result exposes a cache synchronization failure to its caller

#### Scenario: Update invalidates before database mutation

- **WHEN** an authorized management PATCH targets an existing code and the initial KV delete succeeds
- **THEN** the system applies the atomic PostgreSQL update and writes a cache value derived from the resulting enabled state and target URL

#### Scenario: Initial invalidation fails

- **WHEN** the initial KV delete fails during a management update
- **THEN** the operation returns an infrastructure failure before changing PostgreSQL

#### Scenario: Post-update cache write fails

- **WHEN** PostgreSQL commits the management update and the following KV put fails
- **THEN** the API returns the committed metadata with `cacheSynchronized=false` and the stale-window warning

#### Scenario: Disable and re-enable transition

- **WHEN** an authorized PATCH first sets `enabled=false` and a later authorized PATCH sets `enabled=true`
- **THEN** the first successful cache synchronization stores a gone value and the later synchronization stores a redirect value for the current target URL

---
### Requirement: Explicit KV consistency boundary

The system SHALL treat Cloudflare KV as eventually consistent. Successful overwrite or delete operations MUST NOT be represented as globally immediate; operator and API documentation SHALL state that other regions can observe an older value for approximately 60 seconds or longer. Positive values SHALL rely on active mutation synchronization instead of application TTL expiration.

#### Scenario: Mutation completes in one region

- **WHEN** a KV overwrite or delete succeeds during a short URL mutation
- **THEN** the operation records synchronization success while preserving the documented cross-region stale-window warning

---
### Requirement: Redirect path excludes click recording

The MVP redirect flow SHALL NOT synchronously or asynchronously write click records, enqueue analytics events, or invoke Analytics Engine. Cache hits MUST complete without a PostgreSQL write.

#### Scenario: Cached redirect completes

- **WHEN** a positive KV hit returns HTTP 302
- **THEN** no PostgreSQL write, Queue message, or Analytics Engine event is produced
