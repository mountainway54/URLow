## ADDED Requirements

### Requirement: Route-scoped request validation

The system SHALL expose `POST /api/short-urls` through a route-scoped validation middleware that parses the JSON body before invoking short-code generation, PostgreSQL, or KV operations. The body MUST be a strict object containing only `originalUrl`. The middleware SHALL trim `originalUrl`, SHALL enforce a maximum length of 2048 characters, and SHALL accept only absolute HTTP or HTTPS URLs. Validation failure SHALL return HTTP 400 with `{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "issues": [{ "path": string, "message": string }] } }`.

#### Scenario: Valid URL is normalized

- **WHEN** a caller submits `{ "originalUrl": " https://example.com/path?source=test " }`
- **THEN** the creation handler receives `{ "originalUrl": "https://example.com/path?source=test" }`

#### Scenario: Invalid input is rejected before I/O

- **WHEN** a caller submits malformed JSON, a non-object body, a missing or unknown field, an empty URL, a URL longer than 2048 characters, a relative URL, or a URL whose protocol is not HTTP or HTTPS
- **THEN** the system returns HTTP 400 with the stable validation error shape and performs zero short-code generation, PostgreSQL operations, and KV operations

#### Scenario: Validation middleware remains route scoped

- **WHEN** a caller requests the database health endpoint or a redirect route
- **THEN** the short URL creation body middleware does not parse or validate that request

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

### Requirement: Successful short URL creation

After a unique code is inserted, the system SHALL write the version 1 positive redirect value to KV key `redirect:<code>` through the existing mutation coordinator. A successful request SHALL return HTTP 201 with `{ "data": { "code": string, "originalUrl": string, "shortUrl": string } }`. `code` MUST be the persisted 8-character code, `originalUrl` MUST be the normalized persisted URL, and `shortUrl` MUST equal the current request origin followed by `/` and the code.

#### Scenario: Database and cache creation succeed

- **WHEN** `POST /api/short-urls` receives `{ "originalUrl": "https://example.com/article" }` from origin `https://urlow.example` and the generated code is `aB3xY8qP`
- **THEN** PostgreSQL stores that URL under `aB3xY8qP`, KV stores the positive redirect value under `redirect:aB3xY8qP`, and the response is HTTP 201 with `{ "data": { "code": "aB3xY8qP", "originalUrl": "https://example.com/article", "shortUrl": "https://urlow.example/aB3xY8qP" } }`

#### Scenario: Cache synchronization fails after insert

- **WHEN** PostgreSQL inserts the short URL and the following KV put fails
- **THEN** the system preserves the PostgreSQL row, returns the same HTTP 201 success contract, and records only a non-sensitive cache synchronization error

### Requirement: Sanitized creation failures

The creation endpoint MUST NOT expose Zod internals, SQL, database hosts, connection strings, credentials, raw driver messages, or stack traces. A persistence failure SHALL return HTTP 503 with `{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "Unable to create short URL" } }`. An unexpected non-persistence failure SHALL return HTTP 500 with `{ "error": { "code": "INTERNAL_ERROR", "message": "Unable to create short URL" } }`.

#### Scenario: Database error contains sensitive details

- **WHEN** PostgreSQL reports an error containing a host, username, password, SQL text, or connection string
- **THEN** the public response is the stable `DATABASE_UNAVAILABLE` body and contains none of those details

#### Scenario: Unexpected handler failure

- **WHEN** the creation handler encounters a non-validation, non-collision, and non-persistence failure
- **THEN** the public response is HTTP 500 with the stable `INTERNAL_ERROR` body and contains no raw error details
