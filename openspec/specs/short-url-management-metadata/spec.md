# short-url-management-metadata Specification

## Purpose

TBD - created by archiving change 'extend-short-url-metadata-schema'. Update Purpose after archive.

## Requirements

### Requirement: Short URL management metadata schema

The `short_urls` table SHALL store an optional management password hash in `management_password_hash` as `varchar(255)`, an optional private note in `note` as `varchar(240)`, an enabled state in `enabled` as a non-null boolean defaulting to `true`, and a last-updated timestamp in `updated_at` as a non-null timestamp with time zone defaulting to the database current time. The table MUST retain the existing `created_at` timestamp.

#### Scenario: Insert a short URL without optional management metadata

- **WHEN** a new `short_urls` row is inserted without `management_password_hash`, `note`, `enabled`, or `updated_at`
- **THEN** `management_password_hash` and `note` are `NULL`, `enabled` is `true`, and `updated_at` contains a non-null database-generated timestamp

#### Scenario: Reject metadata beyond database limits

- **WHEN** an insert or update supplies more than 255 characters for `management_password_hash` or more than 240 characters for `note`
- **THEN** PostgreSQL rejects the write without truncating either value

#### Scenario: Reject null required state

- **WHEN** an insert or update explicitly supplies `NULL` for `enabled` or `updated_at`
- **THEN** PostgreSQL rejects the write through a `NOT NULL` constraint

---
### Requirement: Existing short URL metadata migration

The migration SHALL preserve every existing row and its original `created_at`. For each existing row, the migration SHALL set `updated_at` equal to that row's `created_at`, set `enabled` to `true`, and leave `management_password_hash` and `note` as `NULL`.

#### Scenario: Backfill an existing short URL

- **WHEN** the migration runs for a row whose `created_at` is `2026-07-30T08:00:00Z`
- **THEN** the row remains present with `created_at` and `updated_at` both equal to `2026-07-30T08:00:00Z`, `enabled` equal to `true`, and both optional metadata columns equal to `NULL`

#### Scenario: Migration failure is atomic

- **WHEN** any schema alteration or metadata backfill statement fails during the migration
- **THEN** the migration transaction rolls back without leaving a partially migrated `short_urls` table

---
### Requirement: Drizzle schema parity

The Drizzle `shortUrls` schema SHALL expose `managementPasswordHash`, `note`, `enabled`, and `updatedAt` with column names, SQL types, nullability, maximum lengths, and defaults matching the PostgreSQL migration.

#### Scenario: Infer insert and select shapes

- **WHEN** TypeScript derives the Drizzle insert and select types for `shortUrls`
- **THEN** insert data permits omission of all four new fields, while selected rows expose nullable strings for `managementPasswordHash` and `note`, a boolean for `enabled`, and a `Date` for `updatedAt`

---
### Requirement: Bcrypt management password storage

The system SHALL use `bcryptjs` with cost factor 10 to hash each normalized non-empty management password. Each hash operation MUST use a newly generated bcrypt salt, and the database SHALL persist only the resulting modular bcrypt string in `management_password_hash`. The password service MUST reject an input above 72 UTF-8 bytes before hashing and MUST NOT rely on bcrypt truncation. Password verification SHALL trim the presented value with the same rule used at creation and SHALL compare it against the stored bcrypt string.

#### Scenario: Equal passwords receive independent salts

- **WHEN** two short URLs are created with the same normalized management password
- **THEN** both stored hashes report cost factor 10, the hashes differ, and each hash verifies the original password

#### Scenario: UTF-8 input above the bcrypt limit is rejected

- **WHEN** a non-empty management password contains no more than 72 Unicode code points but encodes to more than 72 UTF-8 bytes
- **THEN** validation returns HTTP 400 before bcrypt hashing and no truncated credential is stored

#### Scenario: Verification applies creation normalization

- **WHEN** a stored password was created from `" secret12 "` and a management request presents `"  secret12  "`
- **THEN** both values normalize to `"secret12"` and bcrypt verification succeeds

---
### Requirement: Management password immutability

A row whose `management_password_hash` is `NULL` SHALL remain unmanageable through the management API. A non-null `management_password_hash` MUST NOT be replaced, cleared, or returned by a management update. This change SHALL provide no password reset, rotation, recovery, or backfill path.

#### Scenario: Existing row has no hash

- **WHEN** a management request targets a row with a null hash
- **THEN** the system returns HTTP 403 and leaves the hash null

#### Scenario: Existing row has a hash

- **WHEN** an authorized caller updates URL, note, or enabled state
- **THEN** the existing hash remains byte-for-byte unchanged

---
### Requirement: Atomic management metadata update

An authorized partial update SHALL change only supplied mutable fields and SHALL set `updated_at` to the database current time in the same PostgreSQL UPDATE statement. Note normalization SHALL persist no-note state as SQL `NULL`. The UPDATE SHALL return the authoritative post-update row used by the API response.

#### Scenario: Partial metadata update

- **WHEN** an authorized update supplies only `note=" revised "`
- **THEN** PostgreSQL stores `note="revised"`, leaves `original_url`, `enabled`, and `management_password_hash` unchanged, refreshes `updated_at`, and returns the resulting row

#### Scenario: Concurrent target disappears

- **WHEN** authorization reads a row but the atomic UPDATE returns no row because the target no longer exists
- **THEN** the management API returns HTTP 404 and does not synthesize an updated response
