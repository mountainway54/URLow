## ADDED Requirements

### Requirement: Real API short URL creation
The homepage SHALL submit creation through `POST /api/short-urls` with `originalUrl` and optional `managementPassword` and `note`, SHALL display the `shortUrl` returned by the API, and MUST NOT generate or persist a local short-link record. The management password label SHALL identify the value as a management password, and the form SHALL continuously state that omitting it makes the created short URL permanently unmanageable.

#### Scenario: Successful API creation
- **WHEN** a user submits valid creation fields and the API returns HTTP 201
- **THEN** the interface displays the returned short URL with its copy action, retains the submitted original URL and note, and clears the management password input

#### Scenario: Creation pending
- **WHEN** a creation request is unresolved
- **THEN** the creation controls are disabled, the submit action displays "建立中…", and an additional submit does not issue another request

#### Scenario: Optional management password
- **WHEN** the management password is blank
- **THEN** the interface displays "未設定管理密碼，建立後將無法修改此短網址" without opening a confirmation dialog

#### Scenario: Creation validation failure
- **WHEN** the API returns `VALIDATION_ERROR` issues for `originalUrl`, `managementPassword`, or `note`
- **THEN** each recognized issue is announced and displayed with the corresponding field, and no created short URL is displayed

#### Scenario: Creation service failure
- **WHEN** creation fails with `SHORT_CODE_GENERATION_FAILED`, `DATABASE_UNAVAILABLE`, `INTERNAL_ERROR`, or a network failure
- **THEN** the interface displays a specific Traditional Chinese form error and preserves all entered fields

### Requirement: Real API protected management lookup
The homepage SHALL accept either an eight-character Base62 short code or an absolute HTTP(S) short URL whose final path segment is such a code, and SHALL request `GET /api/short-urls/:code/management` with the entered password in `X-Management-Password`. It MUST NOT reveal management data before the API authorizes the request.

#### Scenario: Successful lookup by complete short URL
- **WHEN** a user submits `https://urlow.example/aB3xY8qP` and a valid management password and the API returns HTTP 200
- **THEN** the interface displays the returned original URL, note, and enabled state for code `aB3xY8qP`

#### Scenario: Successful lookup by short code
- **WHEN** a user submits `aB3xY8qP` and a valid management password and the API returns HTTP 200
- **THEN** the interface requests management data for `aB3xY8qP` without changing the browser location

#### Scenario: Invalid lookup format
- **WHEN** the lookup input is neither an eight-character Base62 code nor an absolute HTTP(S) URL ending in one
- **THEN** the interface displays a short-link field error and sends no API request

#### Scenario: Lookup pending
- **WHEN** a management lookup is unresolved
- **THEN** the lookup controls are disabled, the submit action displays "查詢中…", and an additional submit does not issue another request

#### Scenario: Precise management lookup errors
- **WHEN** the API returns `MANAGEMENT_UNAUTHORIZED`, `MANAGEMENT_FORBIDDEN`, `SHORT_URL_NOT_FOUND`, `MANAGEMENT_RATE_LIMITED`, `MANAGEMENT_UNAVAILABLE`, or `INTERNAL_ERROR`
- **THEN** the interface displays a distinct Traditional Chinese message for the returned stable code and does not reveal management data

### Requirement: Optimistic real API management update
After an authorized lookup, the homepage SHALL allow editing `originalUrl`, `note`, and `enabled`, SHALL NOT expose management-password modification, and SHALL submit the changed fields through `PATCH /api/short-urls/:code` using the lookup password in `X-Management-Password`. The interface SHALL retain a last-confirmed server snapshot for rollback and MUST prevent overlapping updates.

#### Scenario: Successful optimistic update
- **WHEN** a user submits changed management fields and the PATCH request succeeds
- **THEN** the interface immediately retains the edited values while pending, replaces its snapshot with the API response, and announces that the settings were saved

#### Scenario: Failed optimistic update
- **WHEN** a submitted PATCH request fails validation, authorization, rate limiting, service availability, internal processing, or network transport
- **THEN** the interface restores the original URL, note, and enabled state from the last-confirmed server snapshot and displays the corresponding Traditional Chinese error

#### Scenario: Update pending
- **WHEN** a PATCH request is unresolved
- **THEN** the save action is disabled, displays "儲存中…", and an additional save does not issue another request

#### Scenario: Cross-region synchronization warning
- **WHEN** a PATCH request succeeds with `cacheSynchronized=false`
- **THEN** the interface announces successful persistence and also displays "設定已儲存，跨區同步可能需要一些時間才會完全生效。"

#### Scenario: Synchronized update
- **WHEN** a PATCH request succeeds with `cacheSynchronized=true`
- **THEN** the interface announces successful persistence without the cross-region synchronization warning

### Requirement: Frontend API error normalization
The frontend API boundary SHALL normalize HTTP status, stable error `code`, and validation `issues` before returning failures to form components. It MUST NOT display plaintext passwords, password hashes, SQL, connection strings, raw driver errors, stack traces, or the server-provided English stale-window warning.

#### Scenario: Stable management error mapping
- **WHEN** a management operation receives a stable error envelope
- **THEN** the component selects its Traditional Chinese message from the normalized error code rather than from raw exception text

#### Scenario: Unknown or malformed failure
- **WHEN** an API or transport failure does not contain a recognized stable error envelope
- **THEN** the interface displays a generic Traditional Chinese service error and exposes no raw exception content

## MODIFIED Requirements

### Requirement: Compact accessible layout
The system SHALL display only the URLow brand and one responsive liquid-glass panel without hero copy, a background link illustration, helper text unrelated to form decisions, or a page-information action. On desktop, the enabled control boundary SHALL align with the original URL input boundary by using equivalent label and control layout tracks; on mobile, both controls SHALL occupy the single-column width.

#### Scenario: Responsive layout
- **WHEN** the viewport is 1440 or 375 CSS pixels wide
- **THEN** the selected workflow has no horizontal scrolling, clipped text, overlapping controls, or interactive target smaller than 44 CSS pixels

#### Scenario: Management control alignment
- **WHEN** authorized management fields are visible at a 1440 CSS pixel viewport
- **THEN** the enabled control and original URL input have aligned top and bottom control boundaries below equivalent label tracks

## REMOVED Requirements

### Requirement: Mock link records
**Reason**: The homepage uses the persistent short URL APIs as its only data source, so local seed records and reload-reset behavior are invalid.

**Migration**: Remove `app/data/mockLinks.ts` and remove the in-memory collection from the page component; no mock records are migrated.

#### Scenario: Homepage initializes without seed records
- **WHEN** the migrated homepage initializes
- **THEN** it loads no local short-link records and creates no in-memory record collection

### Requirement: Create mock short URL
**Reason**: Server-generated Base62 codes and persistent API results replace local `demo-{n}` records.

**Migration**: Route creation through `POST /api/short-urls` and render the returned data.

#### Scenario: Creation does not allocate a demo code
- **WHEN** a user submits the migrated creation form
- **THEN** the frontend creates no `demo-{n}` code and waits for the API result

### Requirement: Protected mock lookup
**Reason**: Authorization and resource lookup are enforced by the management API rather than plaintext comparison against local records.

**Migration**: Normalize the submitted code and call `GET /api/short-urls/:code/management` with the management header.

#### Scenario: Lookup does not compare local plaintext records
- **WHEN** a user submits the migrated management lookup form
- **THEN** the frontend performs no local password comparison and reveals data only after an authorized API response

### Requirement: Modify mock settings
**Reason**: Persistent PATCH updates replace in-memory mutation, and the server contract forbids password changes while allowing original URL changes.

**Migration**: Remove password editing, enable original URL editing, and call `PATCH /api/short-urls/:code` with rollback on failure.

#### Scenario: Update does not mutate a local mock record
- **WHEN** a user submits the migrated management edit form
- **THEN** the frontend sends a PATCH request without a password field and does not update any local mock collection
