## ADDED Requirements

### Requirement: Public OpenAPI document

The system SHALL expose unauthenticated `GET /api/openapi.json` in local and production environments. The response MUST use JSON content type and MUST be an OpenAPI 3.1 document with `info.title` equal to `URLow API`, `info.version` equal to `1.0.0`, and a relative server URL equal to `/`. Document generation MUST NOT access PostgreSQL, KV, the management rate limiter, secrets, or the Node.js file system.

#### Scenario: Retrieve documentation without runtime bindings

- **WHEN** a caller requests `GET /api/openapi.json` without credentials and without Cloudflare database, cache, or rate-limiter bindings
- **THEN** the system returns HTTP 200 with the OpenAPI 3.1 JSON document

#### Scenario: Use the same document in production

- **WHEN** URLow is built and deployed as a Cloudflare Worker
- **THEN** `GET /api/openapi.json` remains publicly available with the same title, version, server URL, paths, and schemas as local development

### Requirement: Complete JSON API operation coverage

The OpenAPI document SHALL contain exactly these documented operations: `POST /api/short-urls`, `GET /api/short-urls/{code}/management`, `PATCH /api/short-urls/{code}`, and `GET /api/health/database`. It MUST describe request bodies, required path parameters, `application/json` success responses, and every stable error response implemented by each operation. It MUST NOT document the browser redirect route `/{code}`.

#### Scenario: Inspect documented operations

- **WHEN** a tool reads the OpenAPI paths object
- **THEN** it finds the four specified method-and-path pairs and no redirect operation

#### Scenario: Inspect creation responses

- **WHEN** a tool reads `POST /api/short-urls`
- **THEN** it finds the Zod-derived creation request body and HTTP 201, 400, 500, and 503 response contracts

#### Scenario: Inspect management responses

- **WHEN** a tool reads the management GET and PATCH operations
- **THEN** GET documents HTTP 200, 401, 403, 404, 429, 500, and 503, while PATCH documents those responses plus HTTP 400 request validation

#### Scenario: Inspect health responses

- **WHEN** a tool reads `GET /api/health/database`
- **THEN** it finds HTTP 200 `{ "status": "ok" }` and HTTP 503 `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }` response contracts

### Requirement: Zod-derived API contracts

Request and response schemas in the OpenAPI document SHALL be derived from shared Zod 4 schemas. The schemas MUST cover creation data, management metadata, update synchronization fields, validation issues, stable error envelopes, and database health results. Response schemas MUST be exercised against representative handler responses in automated tests, but production handlers MUST NOT perform an additional response parse before returning data.

#### Scenario: Request validation and documentation share a schema

- **WHEN** a documented request field constraint changes in the shared creation or update Zod schema
- **THEN** both runtime request validation and the generated OpenAPI request schema reflect that constraint

#### Scenario: Detect response contract drift

- **WHEN** a representative API handler response no longer satisfies its shared Zod response schema
- **THEN** the automated contract test fails before deployment

#### Scenario: Serve a normal production response

- **WHEN** an API handler produces a response in production
- **THEN** the handler returns it without an additional response-schema parsing pass

### Requirement: Management password security declaration

The OpenAPI document SHALL define a security scheme named `ManagementPassword` with type `apiKey`, location `header`, and name `X-Management-Password`. The management GET and PATCH operations MUST reference this scheme. The creation and health operations MUST NOT require this scheme. Documentation, schemas, examples, and logs MUST NOT contain a real plaintext management password or password hash.

#### Scenario: Authorize a management request in Swagger UI

- **WHEN** a user supplies a value through Swagger UI Authorize and executes a management GET or PATCH operation
- **THEN** Swagger UI sends the value in the `X-Management-Password` request header

#### Scenario: Execute a public operation

- **WHEN** a user executes the creation or database health operation without Swagger authorization
- **THEN** Swagger UI sends the request without requiring `X-Management-Password`

### Requirement: Public interactive Swagger UI

The system SHALL expose `/api-docs` in local and production environments without authentication. The page MUST initialize `swagger-ui-dist` with `/api/openapi.json`, MUST allow Try it out submissions, and MUST support deep links to operations. Swagger UI JavaScript and CSS MUST be supplied by the application bundle without a runtime CDN dependency.

#### Scenario: Open interactive API documentation

- **WHEN** a browser visits `/api-docs`
- **THEN** it renders Swagger UI for `URLow API` and loads its specification from `/api/openapi.json`

#### Scenario: Use production Try it out

- **WHEN** a user visits the deployed `/api-docs`, expands an operation, and selects Try it out
- **THEN** the UI allows the user to submit the request to the current URLow deployment

#### Scenario: Open the existing home page

- **WHEN** a browser visits a route other than `/api-docs`
- **THEN** the Swagger UI is not initialized and the existing URLow home experience remains unchanged

### Requirement: Traditional Chinese human-readable documentation

The OpenAPI title, operation summaries, descriptions, field descriptions, response descriptions, and examples SHALL use Traditional Chinese. Operation identifiers, component schema names, JSON property names, HTTP header names, and path parameter names MUST remain in English so code-generation tools receive stable technical identifiers.

#### Scenario: Human and tool consumers inspect the document

- **WHEN** a user reads operation descriptions and a client generator reads identifiers from `/api/openapi.json`
- **THEN** the user-facing explanations are Traditional Chinese and the technical identifiers remain stable English names

### Requirement: Cloudflare-compatible verification

The OpenAPI and Swagger implementation MUST pass the project test suite, TypeScript typecheck, and production build. The production build MUST retain the existing Cloudflare ES Module Worker output and MUST NOT introduce a server-side DOM or file-system dependency.

#### Scenario: Verify the change before deployment

- **WHEN** an operator runs `npm test`, `npm run typecheck`, and `npm run build`
- **THEN** all commands exit successfully and the build produces the existing Cloudflare Worker server and public assets
