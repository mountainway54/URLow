# liquid-glass-homepage Specification

## Purpose

TBD - created by archiving change 'build-frontend'. Update Purpose after archive.

## Requirements

### Requirement: Dual workflow tabs
The system SHALL provide keyboard-operable tabs named "長網址縮址" and "短網址修改" inside one glass panel, and SHALL expose only the controls belonging to the selected workflow.

#### Scenario: Default workflow
- **WHEN** the homepage loads
- **THEN** the "長網址縮址" tab is selected and its creation form is visible

#### Scenario: Switch workflow
- **WHEN** a user activates the "短網址修改" tab
- **THEN** the modification lookup form replaces the creation form without a network request

---
### Requirement: Password visibility
The system SHALL let users switch each visible password field between concealed and visible text, and each visibility button MUST expose an accessible label describing its current action.

#### Scenario: Toggle password visibility
- **WHEN** a user activates a password visibility button
- **THEN** its associated input type and accessible label change together

---
### Requirement: Clipboard feedback
The system SHALL enable copying only when a generated short URL is present and SHALL show temporary success feedback only after Clipboard API completion succeeds.

#### Scenario: Successful copy
- **WHEN** the Clipboard API successfully writes the generated short URL
- **THEN** the copy action temporarily displays an accessible success state

#### Scenario: Failed copy
- **WHEN** the Clipboard API is unavailable or rejects the write
- **THEN** the interface remains usable and does not display copy success

---
### Requirement: Compact accessible layout
The system SHALL display only the URLow brand and one responsive liquid-glass panel without hero copy, a background link illustration, helper text unrelated to form decisions, or a page-information action. On desktop, the enabled control boundary SHALL align with the original URL input boundary by using equivalent label and control layout tracks; on mobile, both controls SHALL occupy the single-column width.

#### Scenario: Responsive layout
- **WHEN** the viewport is 1440 or 375 CSS pixels wide
- **THEN** the selected workflow has no horizontal scrolling, clipped text, overlapping controls, or interactive target smaller than 44 CSS pixels

#### Scenario: Management control alignment
- **WHEN** authorized management fields are visible at a 1440 CSS pixel viewport
- **THEN** the enabled control and original URL input have aligned top and bottom control boundaries below equivalent label tracks

---
### Requirement: Progressive visual fallback
The system SHALL preserve readable form content under reduced-motion preferences and when backdrop filtering is unavailable.

#### Scenario: Reduced motion
- **WHEN** the user enables reduced-motion preferences
- **THEN** non-essential animation and transitions are removed without changing either workflow

#### Scenario: Backdrop filter unavailable
- **WHEN** the browser does not support backdrop filtering
- **THEN** the panel uses a more opaque background with readable content

---
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

---
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

---
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

---
### Requirement: Frontend API error normalization
The frontend API boundary SHALL normalize HTTP status, stable error `code`, and validation `issues` before returning failures to form components. It MUST NOT display plaintext passwords, password hashes, SQL, connection strings, raw driver errors, stack traces, or the server-provided English stale-window warning.

#### Scenario: Stable management error mapping
- **WHEN** a management operation receives a stable error envelope
- **THEN** the component selects its Traditional Chinese message from the normalized error code rather than from raw exception text

#### Scenario: Unknown or malformed failure
- **WHEN** an API or transport failure does not contain a recognized stable error envelope
- **THEN** the interface displays a generic Traditional Chinese service error and exposes no raw exception content
