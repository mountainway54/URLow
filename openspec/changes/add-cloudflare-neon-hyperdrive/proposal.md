## Why

URLow 已由靜態 Cloudflare Pages 部署轉為 Cloudflare Worker 動態版本，但目前尚未具備可供 Nuxt Server API 使用的持久化資料層，也未定義 Redirect 的低延遲讀取階層。現在導入 Neon PostgreSQL、Cloudflare Hyperdrive、Drizzle ORM 與 Cloudflare KV，可讓 PostgreSQL 保持 source of truth，同時使讀多寫少的短碼映射在 Edge 快取命中時不必查詢資料庫。

## What Changes

- 將 Nuxt 的正式建置明確設為 Cloudflare ES Module Worker，保留動態 Server API 與 `cloudflare:sockets` 能力。
- 建立 Cloudflare Hyperdrive binding，正式環境透過 Hyperdrive 連線 Neon PostgreSQL。
- 建立本機開發與 Drizzle migration 使用的直接 Neon PostgreSQL 連線設定，以 `.dev.vars` 隔離 Worker local binding、以 `.env` 提供 migration，且不提交任何憑證。
- 導入 Drizzle ORM、PostgreSQL driver、Drizzle Kit、Zod、Wrangler 與 Vitest，建立資料庫 client、環境設定驗證、migration 與自動化驗證工作流程。
- 建立 `short_urls` 資料表基礎 schema，包含唯一短碼索引及 MVP 所需欄位。
- 建立 `SHORT_URL_CACHE` KV binding 與 `GET /:code` Redirect read-through cache：正向命中直接 302，負向命中直接 404，miss 才透過 Hyperdrive 查詢 PostgreSQL。
- 建立短網址時主動覆寫 KV；更新、停用或刪除前先使 KV 舊值失效，並接受 Cloudflare KV 跨區約 60 秒以上的最終一致性視窗。
- 對 PostgreSQL 查無的合法短碼寫入 60 秒負向標記；MVP 不記錄點擊，避免 Redirect hit 路徑產生同步資料庫寫入。
- 補充可重現的本機設定、migration、建置與 Cloudflare 部署文件。

## Capabilities

### New Capabilities

- `cloudflare-postgres-runtime`: 規範 URLow 在 Cloudflare Worker 動態環境中，透過 Hyperdrive 存取 Neon PostgreSQL、管理 schema migration，並在設定缺失或資料庫失敗時明確失敗的行為。
- `edge-redirect-cache`: 規範短碼格式、KV 正負向快取、PostgreSQL 回源、建立／更新／停用／刪除的主動快取同步，以及 KV／PostgreSQL 故障時的 Redirect 行為。

### Modified Capabilities

（無）

## Impact

- Affected specs: `cloudflare-postgres-runtime`, `edge-redirect-cache`
- Affected code:
  - New: `wrangler.jsonc`, `drizzle.config.ts`, `server/database/client.ts`, `server/database/schema.ts`, `server/utils/env.ts`, `server/services/short-url-cache.ts`, `server/services/short-url-repository.ts`, `server/routes/[code].get.ts`, `server/api/health/database.get.ts`, `tests/server/database-client.test.ts`, `tests/server/database-health.test.ts`, `tests/server/short-url-cache.test.ts`, `tests/server/redirect.test.ts`, `drizzle/`, `.env.example`, `.dev.vars.example`
  - Modified: `package.json`, `package-lock.json`, `nuxt.config.ts`, `.gitignore`, `README.md`, `docs/01-architecture-and-tech-stack.md`, `docs/06-debug-log.md`
  - Removed: none
- Affected dependencies: Neon PostgreSQL、Cloudflare Hyperdrive、Drizzle ORM、PostgreSQL driver、Drizzle Kit、Zod、Wrangler、Vitest
- Affected systems: Cloudflare Worker bindings、Cloudflare KV、Neon database、local development environment
