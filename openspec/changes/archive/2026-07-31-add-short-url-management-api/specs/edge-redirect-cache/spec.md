## MODIFIED Requirements

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

