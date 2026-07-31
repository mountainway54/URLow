## ADDED Requirements

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

### Requirement: Management password immutability

A row whose `management_password_hash` is `NULL` SHALL remain unmanageable through the management API. A non-null `management_password_hash` MUST NOT be replaced, cleared, or returned by a management update. This change SHALL provide no password reset, rotation, recovery, or backfill path.

#### Scenario: Existing row has no hash

- **WHEN** a management request targets a row with a null hash
- **THEN** the system returns HTTP 403 and leaves the hash null

#### Scenario: Existing row has a hash

- **WHEN** an authorized caller updates URL, note, or enabled state
- **THEN** the existing hash remains byte-for-byte unchanged

### Requirement: Atomic management metadata update

An authorized partial update SHALL change only supplied mutable fields and SHALL set `updated_at` to the database current time in the same PostgreSQL UPDATE statement. Note normalization SHALL persist no-note state as SQL `NULL`. The UPDATE SHALL return the authoritative post-update row used by the API response.

#### Scenario: Partial metadata update

- **WHEN** an authorized update supplies only `note=" revised "`
- **THEN** PostgreSQL stores `note="revised"`, leaves `original_url`, `enabled`, and `management_password_hash` unchanged, refreshes `updated_at`, and returns the resulting row

#### Scenario: Concurrent target disappears

- **WHEN** authorization reads a row but the atomic UPDATE returns no row because the target no longer exists
- **THEN** the management API returns HTTP 404 and does not synthesize an updated response

