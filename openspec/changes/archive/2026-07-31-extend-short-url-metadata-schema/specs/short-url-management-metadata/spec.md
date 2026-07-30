## ADDED Requirements

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

### Requirement: Existing short URL metadata migration

The migration SHALL preserve every existing row and its original `created_at`. For each existing row, the migration SHALL set `updated_at` equal to that row's `created_at`, set `enabled` to `true`, and leave `management_password_hash` and `note` as `NULL`.

#### Scenario: Backfill an existing short URL

- **WHEN** the migration runs for a row whose `created_at` is `2026-07-30T08:00:00Z`
- **THEN** the row remains present with `created_at` and `updated_at` both equal to `2026-07-30T08:00:00Z`, `enabled` equal to `true`, and both optional metadata columns equal to `NULL`

#### Scenario: Migration failure is atomic

- **WHEN** any schema alteration or metadata backfill statement fails during the migration
- **THEN** the migration transaction rolls back without leaving a partially migrated `short_urls` table

### Requirement: Drizzle schema parity

The Drizzle `shortUrls` schema SHALL expose `managementPasswordHash`, `note`, `enabled`, and `updatedAt` with column names, SQL types, nullability, maximum lengths, and defaults matching the PostgreSQL migration.

#### Scenario: Infer insert and select shapes

- **WHEN** TypeScript derives the Drizzle insert and select types for `shortUrls`
- **THEN** insert data permits omission of all four new fields, while selected rows expose nullable strings for `managementPasswordHash` and `note`, a boolean for `enabled`, and a `Date` for `updatedAt`
