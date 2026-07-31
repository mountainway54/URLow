# short-url-creation-api Specification

## Purpose

TBD - created by archiving change 'add-short-url-api'. Update Purpose after archive.

## Requirements

### Requirement: Route-scoped request validation

The system SHALL expose `POST /api/short-urls` through route-scoped validation middleware that parses the JSON body before short-code generation, bcrypt, PostgreSQL, or KV operations. The body MUST be a strict object containing `originalUrl` and optionally `managementPassword` and `note`. The middleware SHALL trim `originalUrl`, SHALL enforce a maximum length of 2048 characters, and SHALL accept only absolute HTTP or HTTPS URLs. The middleware SHALL trim `managementPassword`; a missing or trim-empty value SHALL normalize to no password, while a non-empty value MUST contain 6 through 72 Unicode code points and MUST encode to at most 72 UTF-8 bytes. A missing, null, empty, or whitespace-only `note` SHALL normalize to `null`; a non-empty note SHALL be trimmed and limited to 240 characters. Validation failure SHALL return HTTP 400 with `{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "issues": [{ "path": string, "message": string }] } }`.

#### Scenario: Valid creation metadata is normalized

- **WHEN** a caller submits `{ "originalUrl": " https://example.com/path?source=test ", "managementPassword": " secret12 ", "note": " private note " }`
- **THEN** the creation handler receives normalized values `originalUrl="https://example.com/path?source=test"`, `managementPassword="secret12"`, and `note="private note"`

#### Scenario: Empty optional metadata is normalized

- **WHEN** a caller omits the optional fields or submits whitespace-only `managementPassword` and `note`
- **THEN** the creation handler receives no management password and a null note

#### Scenario: Invalid input is rejected before expensive work or I/O

- **WHEN** a caller submits malformed JSON, a non-object body, a missing or unknown field, an invalid URL, a non-empty management password outside 6 through 72 Unicode code points or above 72 UTF-8 bytes, or a note longer than 240 characters after trimming
- **THEN** the system returns HTTP 400 with the stable validation error shape and performs zero short-code generation, bcrypt operations, PostgreSQL operations, and KV operations

##### Example: Management password boundaries

| Input | Expected output |
| ----- | --------------- |
| `"12345"` | HTTP 400 |
| `"123456"` | accepted |
| 72 ASCII characters | accepted |
| 73 ASCII characters | HTTP 400 |
| 24 three-byte UTF-8 characters | accepted |
| 25 three-byte UTF-8 characters | HTTP 400 |

#### Scenario: Validation middleware remains route scoped

- **WHEN** a caller requests the database health endpoint, a management endpoint, or a redirect route
- **THEN** the short URL creation body middleware does not parse or validate that request

---
### Requirement: Secure short-code allocation

The system SHALL generate each candidate code from the Base62 alphabet `A-Z`, `a-z`, and `0-9` using Web Crypto secure random bytes and rejection sampling. Each code MUST contain exactly 8 characters. The database unique constraint `short_urls_code_unique` SHALL be the authority for collision detection. The system SHALL attempt at most five inserts, SHALL retry only an error with PostgreSQL code `23505` and constraint `short_urls_code_unique`, and MUST NOT write KV for a collided attempt.

#### Scenario: First candidate is unique

- **WHEN** the first generated 8-character Base62 code inserts successfully
- **THEN** the system accepts that code after exactly one PostgreSQL insert attempt

#### Scenario: Collision is retried

- **WHEN** the first insert reports PostgreSQL code `23505` for constraint `short_urls_code_unique` and the second insert succeeds
- **THEN** the system generates a second code, performs exactly two insert attempts, and continues creation with the second code

#### Scenario: Collision budget is exhausted

- **WHEN** all five insert attempts report PostgreSQL code `23505` for constraint `short_urls_code_unique`
- **THEN** the system returns HTTP 503 with `{ "error": { "code": "SHORT_CODE_GENERATION_FAILED", "message": "Unable to allocate a unique short code" } }` and performs no sixth insert

#### Scenario: A different database error is not a collision

- **WHEN** an insert fails with a database error that does not match both PostgreSQL code `23505` and constraint `short_urls_code_unique`
- **THEN** the system performs no collision retry and maps the failure to `DATABASE_UNAVAILABLE`

---
### Requirement: Successful short URL creation

Before inserting a row with a non-empty management password, the system SHALL hash the normalized password through the management password service and SHALL persist only the bcrypt hash. The system SHALL insert the normalized note, `enabled=true`, and generated metadata with the unique code. After insertion, the system SHALL write the versioned positive redirect value to KV key `redirect:<code>` through the mutation coordinator. A successful request SHALL return HTTP 201 with `{ "data": { "code": string, "originalUrl": string, "shortUrl": string, "note": string | null, "enabled": true, "hasManagementPassword": boolean } }`. The response MUST NOT contain a plaintext password or password hash.

#### Scenario: Database and cache creation succeed with management metadata

- **WHEN** a request from `https://urlow.example` creates `https://example.com/article` with password `secret12`, note `private`, and generated code `aB3xY8qP`
- **THEN** PostgreSQL stores a bcrypt hash and note `private`, KV stores the positive redirect value, and HTTP 201 data contains the code, normalized URL, short URL, note, `enabled=true`, and `hasManagementPassword=true` without either password representation

#### Scenario: Creation without management password is permanently unmanageable

- **WHEN** a caller creates a short URL without a non-empty management password
- **THEN** PostgreSQL stores `management_password_hash` as `NULL` and HTTP 201 data contains `hasManagementPassword=false`

#### Scenario: Cache synchronization fails after insert

- **WHEN** PostgreSQL inserts the short URL and the following KV put fails
- **THEN** the system preserves the PostgreSQL row, returns the HTTP 201 creation contract, and records only a non-sensitive cache synchronization error

---
### Requirement: Sanitized creation failures

The creation endpoint MUST NOT expose Zod internals, SQL, database hosts, connection strings, credentials, raw driver messages, or stack traces. A persistence failure SHALL return HTTP 503 with `{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "Unable to create short URL" } }`. An unexpected non-persistence failure SHALL return HTTP 500 with `{ "error": { "code": "INTERNAL_ERROR", "message": "Unable to create short URL" } }`.

#### Scenario: Database error contains sensitive details

- **WHEN** PostgreSQL reports an error containing a host, username, password, SQL text, or connection string
- **THEN** the public response is the stable `DATABASE_UNAVAILABLE` body and contains none of those details

#### Scenario: Unexpected handler failure

- **WHEN** the creation handler encounters a non-validation, non-collision, and non-persistence failure
- **THEN** the public response is HTTP 500 with the stable `INTERNAL_ERROR` body and contains no raw error details
