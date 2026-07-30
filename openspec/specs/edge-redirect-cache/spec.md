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

The `SHORT_URL_CACHE` binding SHALL store versioned discriminated JSON values. A positive value SHALL have the shape `{ "version": 1, "kind": "redirect", "targetUrl": string }`, SHALL contain an absolute HTTP(S) URL, and SHALL have no application expiration. A negative value SHALL have the shape `{ "version": 1, "kind": "missing" }` and SHALL be written with `expirationTtl: 60`.

#### Scenario: Positive cache hit

- **WHEN** a valid code resolves to a valid positive KV value
- **THEN** the system returns HTTP 302 to `targetUrl` without creating a PostgreSQL client

#### Scenario: Negative cache hit

- **WHEN** a valid code resolves to a negative KV value
- **THEN** the system returns HTTP 404 without creating a PostgreSQL client

#### Scenario: Invalid cache value

- **WHEN** a KV value cannot be parsed, has an unsupported version or kind, or contains a non-HTTP(S) target URL
- **THEN** the system treats the value as a cache miss and queries PostgreSQL instead of redirecting

---
### Requirement: Read-through PostgreSQL fallback

On a KV miss or KV read failure, the system SHALL query the indexed `short_urls.code` field through Hyperdrive. A found row SHALL return HTTP 302 and schedule a positive KV write with `waitUntil`. A confirmed missing row SHALL return HTTP 404 and schedule a negative KV write with `expirationTtl: 60`. KV backfill failure MUST NOT delay or change the database-derived response.

#### Scenario: Cache miss finds a short URL

- **WHEN** KV has no usable value and PostgreSQL returns `https://example.com/target` for the code
- **THEN** the system returns HTTP 302 to that URL and schedules a positive KV backfill

#### Scenario: Cache miss confirms absence

- **WHEN** KV has no usable value and PostgreSQL returns no row for a valid code
- **THEN** the system returns HTTP 404 and schedules a 60-second negative KV backfill

#### Scenario: Negative backfill exhausts KV quota

- **WHEN** PostgreSQL confirms that a valid code is absent and the negative KV write fails because of quota or a service error
- **THEN** the system still returns HTTP 404 and logs a non-sensitive cache synchronization error

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

Creating a short URL SHALL insert the PostgreSQL row before overwriting `redirect:<code>` with a positive KV value, including when the key currently contains a negative value. Updating a target URL SHALL delete the KV key before changing PostgreSQL and SHALL write the new positive value after the database update. Disabling or deleting a short URL SHALL delete the KV key before changing PostgreSQL. An initial KV delete failure MUST prevent the update, disable, or delete database mutation.

#### Scenario: Creation overwrites a negative marker

- **GIVEN** `redirect:new-code` contains `{ "version": 1, "kind": "missing" }`
- **WHEN** PostgreSQL successfully inserts `new-code` for `https://example.com/new`
- **THEN** the mutation overwrites the KV key with the corresponding positive value before reporting cache synchronization success

#### Scenario: Creation cache write fails after insert

- **WHEN** PostgreSQL inserts a new short URL and the following KV overwrite fails
- **THEN** the database row remains authoritative, no compensating database delete runs, and the mutation result exposes a cache synchronization failure to its caller

#### Scenario: Target update invalidates before database mutation

- **WHEN** the initial KV delete succeeds for an existing code
- **THEN** the system updates PostgreSQL and then writes the new positive KV value

#### Scenario: Initial invalidation fails

- **WHEN** the initial KV delete fails during an update, disable, or delete operation
- **THEN** the operation fails before changing PostgreSQL

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
