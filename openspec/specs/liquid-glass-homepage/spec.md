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
### Requirement: Mock link records
The system SHALL load typed seed link records from a local module into an in-memory copy, and MUST reset all created or modified records when the page reloads.

#### Scenario: Seed data available
- **WHEN** the page component initializes
- **THEN** the in-memory collection contains the code, short URL, original URL, password, note, and enabled state from the mock module

---
### Requirement: Create mock short URL
The system SHALL accept a non-blank original URL with optional password and note, create a non-colliding `demo-{n}` record in memory, and display its complete short URL.

#### Scenario: Successful mock creation
- **WHEN** a user submits a non-blank original URL
- **THEN** a new in-memory record is added and its short URL is displayed with a copy action

#### Scenario: Blank original URL
- **WHEN** a user submits an original URL containing only whitespace
- **THEN** no record is created and an accessible field error is displayed

---
### Requirement: Protected mock lookup
The system SHALL require both a matching short URL code and exact password before revealing a mock record's original URL or editable settings.

#### Scenario: Successful lookup
- **WHEN** the submitted short URL and password match one in-memory record
- **THEN** the system displays that record's original URL, enabled state, password, note, and update action

#### Scenario: Failed lookup
- **WHEN** the short URL is unknown or the password does not match
- **THEN** no record details are revealed and an accessible error states that the short URL or password is incorrect

---
### Requirement: Modify mock settings
The system SHALL let an authenticated mock record update its enabled state, password, and note in memory while keeping its original and short URLs unchanged.

#### Scenario: Save mock changes
- **WHEN** a user changes editable settings and activates the update action
- **THEN** the in-memory record is updated and the interface announces "已更新本頁資料"

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
The system SHALL display only the URLow brand and one responsive liquid-glass panel without hero copy, a background link illustration, helper text, or a page-information action.

#### Scenario: Responsive layout
- **WHEN** the viewport is 1440 or 375 CSS pixels wide
- **THEN** the selected workflow has no horizontal scrolling, clipped text, overlapping controls, or interactive target smaller than 44 CSS pixels

---
### Requirement: Progressive visual fallback
The system SHALL preserve readable form content under reduced-motion preferences and when backdrop filtering is unavailable.

#### Scenario: Reduced motion
- **WHEN** the user enables reduced-motion preferences
- **THEN** non-essential animation and transitions are removed without changing either workflow

#### Scenario: Backdrop filter unavailable
- **WHEN** the browser does not support backdrop filtering
- **THEN** the panel uses a more opaque background with readable content
