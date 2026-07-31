## ADDED Requirements

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
