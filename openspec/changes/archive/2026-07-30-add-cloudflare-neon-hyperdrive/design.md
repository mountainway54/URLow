## Context

URLow 目前是 Nuxt 4 專案，已部署為 Cloudflare Worker 動態版本，但儲存庫仍只有前端假資料，沒有 Worker 設定、資料庫 client、schema、migration 或 Redirect 快取工作流程。正式 runtime 必須在 Cloudflare Workers 的 Edge 執行環境中優先由 KV 解析短碼，僅在 cache miss 時透過 Hyperdrive 存取外部 Neon PostgreSQL；本機開發與 migration 則需要可重現且不洩漏憑證的直接連線方式。

## Goals / Non-Goals

**Goals:**

- 讓 Nuxt Server API 在 Cloudflare Worker 上透過 `HYPERDRIVE` binding 存取 Neon PostgreSQL。
- 以 Drizzle ORM 定義 `short_urls` schema，並以 Drizzle Kit 產生及套用可追蹤的 SQL migration。
- 分離 runtime 與 migration 連線來源，正式 Worker 不讀取或保存 Neon 原始連線字串。
- 提供明確的設定驗證、資料庫健康檢查、建置與部署驗證方式。
- 讓 `GET /:code` 以 Cloudflare KV 為 read-through cache，PostgreSQL 為 source of truth，並定義正向／負向快取、主動同步與故障降級。
- 補齊 README 與架構／除錯文件，使目前動態部署方式可重現。

**Non-Goals:**

- 不在此變更實作對外的建立、編輯、停用或刪除 API；僅建立供後續 API 呼叫的 repository mutation contract，並實作 `GET /:code` Redirect。
- 不把現有前端 mock state 改接後端。
- 不加入使用者帳號、密碼雜湊、存取控制、點擊記錄、Queue、Analytics Engine、限流或管理介面。
- 不改用 Neon serverless driver、Neon pooled connection string、Cloudflare D1 或 NuxtHub。
- 不由應用程式在啟動或 request 期間自動執行 migration。

## Decisions

### 使用 Cloudflare Workers Assets 與 Nitro cloudflare_module preset

正式建置採 `nuxt build`，Nitro preset 設為 `cloudflare_module`，使輸出為具 default export 的 ES Module Worker，並允許 `pg` 使用 `cloudflare:sockets`。`wrangler.jsonc` 的入口為 `.output/server/index.mjs`，靜態資產目錄為 `.output/public`，並啟用 `nodejs_compat` 與 observability。package scripts 提供 `cf:dev`、`deploy` 與 `cf:typegen`，其中 deploy 先執行 build 再執行 Wrangler deploy。

替代方案是沿用 `nuxt generate`，但靜態輸出無法承載 Server API 與資料庫存取；另一替代方案是 cloudflare_pages preset，但專案現況與目標均為 Worker 動態版本，因此不保留 Pages 部署路徑。

### Runtime 只透過 HYPERDRIVE binding 連線

正式 runtime 從 H3 event 的 Cloudflare environment 取得名為 `HYPERDRIVE` 的 binding，使用其 `connectionString` 建立 `pg.Client`，連線後交給 Drizzle。每個 request 建立並在完成後關閉 client；底層 pooling 交由 Hyperdrive 管理，不建立 module-global `pg.Pool`。

替代方案是使用 `@neondatabase/serverless` 直接連 Neon，但 Hyperdrive 需要標準 PostgreSQL TCP driver，且再疊加 Neon serverless transport／pooling 沒有價值。另一替代方案是 Worker 直接持有 Neon connection string，但會繞過 Hyperdrive 並擴大憑證暴露範圍。

### Migration 使用獨立的 DATABASE_URL

Drizzle Kit 僅在本機或 CI migration job 讀取 `DATABASE_URL`，連到 Neon 的 direct、unpooled endpoint，並要求 TLS。正式 Worker runtime 不依賴此變數。`.env`、`.dev.vars` 與 Wrangler local secrets 均不提交；`.env.example` 只列變數名稱與格式說明。

本機 Worker preview 透過未追蹤的 `.dev.vars` 提供且只提供 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` direct Neon URL，避免把 `localConnectionString` 寫進 `wrangler.jsonc`，也避免 Wrangler 將 migration-only `DATABASE_URL` 注入 Worker。Drizzle Kit 從未追蹤的 `.env` 讀取 `DATABASE_URL`。Hyperdrive configuration 名稱固定為 `urlow-neon`，binding 名稱固定為 `HYPERDRIVE`；configuration ID 是非機密部署識別碼，由建立 Hyperdrive 後寫入 Wrangler 設定。

替代方案是讓 runtime 與 migration 共用一個 `DATABASE_URL`，但這會模糊權限邊界，亦無法驗證正式請求確實走 Hyperdrive。

### Drizzle schema 採最小 short_urls 資料模型

`short_urls` 包含：UUID `id`（database default random UUID、primary key）、`original_url`（text、not null）、`code`（varchar 32、not null、unique）與 `created_at`（timestamp with time zone、not null、default current timestamp）。唯一約束同時作為短碼查詢索引。此變更不加入前端假資料中的 password、note 或 enabled，避免在尚未定義安全與編輯語意前固化欄位。

替代方案是一次納入所有 UI 欄位，但密碼儲存、停用狀態與編輯授權需要獨立規格，不屬於本次基礎設施變更。

### 設定驗證與健康檢查採安全失敗

Zod 驗證 server-side 設定與 Cloudflare binding shape。缺少 `HYPERDRIVE`、無 connection string、連線失敗或查詢失敗時，不回退到 mock data 或直連 Neon。`GET /api/health/database` 成功執行 `SELECT 1` 時回傳 HTTP 200 與 `{ "status": "ok" }`；任何設定或資料庫錯誤回傳 HTTP 503 與 `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }`，詳細原因只寫入 server log，不暴露 connection string、host、帳號或 driver error。

替代方案是只依賴部署成功作為健康訊號，但無法驗證 binding、Hyperdrive 與 Neon schema 是否可用。

### Redirect 採 KV read-through cache

Cloudflare KV namespace 以 `SHORT_URL_CACHE` binding 注入 Worker。Redirect key 固定為 `redirect:<code>`；只接受符合 `[A-Za-z0-9_-]{4,32}` 的短碼，不合法格式直接回 404，且不得讀取 KV 或 PostgreSQL。

正向 value 為 `{ "version": 1, "kind": "redirect", "targetUrl": "<absolute-http-url>" }`，不設定 application expiration；負向 value 為 `{ "version": 1, "kind": "missing" }`，以 `expirationTtl: 60` 儲存。正向 hit 直接 302，負向 hit 直接 404，兩者皆不得建立 PostgreSQL client。KV miss 才透過 Hyperdrive 查 `short_urls`：找到時回填正向 value，查無時回填負向 value。回填使用 request context 的 `waitUntil`，不延長 Redirect response；回填失敗只記錄不含敏感資訊的錯誤。

若 KV get 失敗，系統回源 PostgreSQL；若 PostgreSQL 成功，仍按資料庫結果回 302 或 404，KV 回填失敗不改變 response。KV miss 或 KV failure 且 PostgreSQL 不可用時回 503。MVP 不記錄點擊，Redirect hit path 沒有同步或非同步 analytics write。

替代方案是每次 Redirect 直接查 PostgreSQL，但會讓最常見路徑受跨區資料庫延遲影響；另一替代方案是 Cache API，但其內容不跨資料中心複製，`cache.delete` 也只作用於執行該 Worker 的資料中心。

### Mutation 採主動 KV 同步

建立短網址時先成功寫入 PostgreSQL，再 `KV.put` 正向 value，以覆寫可能存在的負向標記。若 KV put 失敗，PostgreSQL 仍為已建立狀態，不執行跨系統 rollback；呼叫端收到建立結果時必須附帶 cache synchronization failure，讓上層 API 不得宣稱短網址已可在所有區域立即解析。既有負向標記最長依 60 秒 TTL 消失。

更新目標時先刪除 KV 舊值；首次 delete 失敗則中止且不得修改 PostgreSQL。delete 成功後更新 PostgreSQL，再寫入新正向 value；最後 put 失敗時資料庫新值仍為 source of truth，KV 中央值保持 miss，後續 Redirect miss 會由 PostgreSQL 回填。停用或刪除同樣先刪除 KV；首次 delete 失敗則中止資料庫 mutation，delete 成功後才修改 PostgreSQL。

Cloudflare KV 為最終一致；即使 overwrite/delete 成功，其他地區仍可能在約 60 秒或更久內讀到舊值。此視窗是已接受的產品限制，不導入 Durable Object 取得強一致。正向 value 不以 TTL 作為主要失效機制，避免未執行 mutation 時自然過期造成不必要的 PostgreSQL miss。

替代方案是只依賴 TTL，但目標更新後會在整個 TTL 期間持續導向舊網址；另一替代方案是 Durable Object，但超出 MVP 的一致性與營運範圍。

### 負向快取僅接受合法短碼

只有通過 `[A-Za-z0-9_-]{4,32}` 驗證且 PostgreSQL 明確查無的 code 才寫入 60 秒負向 value。KV quota 或 put error 時採 fail-open：仍回傳 404，不讓快取失敗改變查無語意。此變更不加入 Cloudflare Rate Limiting；合法格式的高基數掃描仍可能耗盡 Free plan 每日 KV write quota，文件與監控必須明載此風險。

替代方案是對每個 path 寫負向 value，但會讓明顯非法輸入也消耗 KV 與 PostgreSQL資源；另一替代方案是加入邊緣限流，但使用者已選擇不納入本次變更。

## Implementation Contract

**Observable behavior**

- `npm run build` 必須產生具 default export 的 Cloudflare ES Module Worker server bundle 與 assets，允許 external `cloudflare:sockets`，且不得退回靜態 generate 流程。
- `npm run cf:dev` 必須使用 Wrangler 啟動已建置的 Worker，並透過本機 Hyperdrive connection-string 環境變數連到 Neon。
- `npm run db:generate` 必須依 Drizzle schema 產生可提交的 SQL migration；`npm run db:migrate` 必須使用 `DATABASE_URL` 將 migration 套用至 Neon。
- `npm run deploy` 必須先完成 Nuxt build，再由 Wrangler 部署 Worker。
- `GET /api/health/database` 必須遵守成功與失敗 JSON／HTTP contract，不得回傳底層錯誤細節。
- `GET /:code` 必須依合法格式、KV positive／negative hit、KV miss 與 PostgreSQL 故障 contract 回傳 302、404 或 503；cache hit 不得查詢 PostgreSQL。
- 建立 mutation 必須在 PostgreSQL insert 後主動覆寫 KV；更新、停用及刪除 mutation 必須在修改 PostgreSQL 前成功刪除 KV 舊值。

**Interface and data shape**

- Cloudflare binding：`HYPERDRIVE`，其 `connectionString` 為 runtime 唯一資料庫連線來源。
- Cloudflare binding：`SHORT_URL_CACHE`，提供 `redirect:<code>` 的正向與負向 KV values。
- Migration environment：`DATABASE_URL`，只供 Drizzle Kit 與 migration 指令使用。
- Local Worker environment：`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`。
- Local secret files：`.env` 只含 migration `DATABASE_URL`；`.dev.vars` 只含 local Hyperdrive override，Wrangler runtime bindings 不得出現 `DATABASE_URL`。
- Hyperdrive configuration：名稱 `urlow-neon`，origin 使用 Neon direct、unpooled PostgreSQL endpoint。
- `short_urls` 欄位：`id uuid primary key default gen_random_uuid()`、`original_url text not null`、`code varchar(32) not null unique`、`created_at timestamptz not null default now()`。
- Health response：成功為 `{ "status": "ok" }`；失敗為 `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }`。
- Redirect cache positive value：`{ "version": 1, "kind": "redirect", "targetUrl": string }`；`targetUrl` 必須是絕對 HTTP(S) URL。
- Redirect cache negative value：`{ "version": 1, "kind": "missing" }`，儲存時使用 `expirationTtl: 60`。
- Redirect failure：無效／不存在短碼為 404；KV 無法提供結果且 PostgreSQL 不可用時為 503。

**Failure modes**

- 缺少任何必要設定、binding shape 無效或資料庫不可達時，health endpoint 回傳 503；應用程式不得悄悄使用 mock data、空資料庫或 direct runtime connection。
- Migration 指令缺少或收到無效 `DATABASE_URL` 時，在執行 SQL 前以非零狀態結束。
- Log 可包含錯誤類型與 request context，但不得包含完整 connection string 或密碼。
- KV value 無效時視為 miss 並回源 PostgreSQL；不得使用無法解析、版本未知或 `targetUrl` 非 HTTP(S) 的 value 執行 Redirect。
- 首次 KV delete 失敗時，更新、停用及刪除 mutation 必須在 PostgreSQL 變更前失敗；建立後 KV put 失敗不得嘗試非原子的資料庫 rollback。
- KV write quota 或負向回填失敗不得把明確的 PostgreSQL not-found 轉成 5xx。

**Acceptance criteria**

- TypeScript／Nuxt build 通過，Wrangler dry-run 或 deploy validation 能解析 Worker entry、assets、`nodejs_compat`、`HYPERDRIVE` 與 `SHORT_URL_CACHE` bindings。
- Drizzle migration 能在乾淨 Neon branch 建立符合 contract 的 `short_urls` table 與 unique constraint，重複 code insert 必須被 PostgreSQL 拒絕。
- 使用有效 local connection string 啟動 Worker 時，health endpoint 回傳 200；移除 local connection string 或使用不可達資料庫時回傳 503，response 不含連線資訊。
- 儲存庫搜尋不得在 tracked files 找到 Neon 密碼、完整 production connection string 或 Wrangler local secret 值。
- README 與架構／除錯文件清楚區分已過期的 Pages static deployment 與目前 Worker dynamic deployment。
- 正向 hit 與負向 hit 測試斷言 PostgreSQL client 建立次數為 0；miss found／absent 分別回 302／404 並安排正向／60 秒負向回填。
- 無效短碼測試斷言 KV 與 PostgreSQL操作次數皆為 0；KV miss 且 PostgreSQL unavailable 回 503。
- mutation ordering 測試證明建立會覆寫負向 value，更新／停用／刪除在首次 KV delete 失敗時不修改 PostgreSQL。
- Redirect 測試與程式碼搜尋證明 hit path 沒有點擊記錄或其他 PostgreSQL write。

**Scope boundaries**

- In scope：套件與 scripts、Nuxt／Wrangler 設定、binding types、資料庫 client、最小 schema、migration、health endpoint、Redirect endpoint、KV cache codec／resolver、repository mutation contract、相關測試及文件。
- Out of scope：短碼生成、對外 POST／PATCH／DELETE API、前端串接、密碼功能、點擊記錄、Queue、Analytics Engine、Rate Limiting、Durable Object、資料匯入、production migration 自動化及實際業務資料搬移。

## Risks / Trade-offs

- [Neon 與 Hyperdrive 雙重 pooling] → Hyperdrive origin 使用 Neon direct、unpooled endpoint，不使用 Neon pooled endpoint。
- [Worker TCP／Node API 相容性] → 啟用 `nodejs_compat`，採 Cloudflare 官方支援的 `pg` + Hyperdrive 路徑，並以 Wrangler runtime 驗證，不只在 Node dev server 測試。
- [每 request 建立 client 的成本] → 由 Hyperdrive 維持底層 pool；request finally block 保證關閉 client，避免 Worker isolate 洩漏資源。
- [讀取快取造成健康檢查假陽性] → health query 使用最小 `SELECT 1`，健康檢查只代表連線可用，不代表業務資料即時性。
- [migration 與 runtime schema 漂移] → migration SQL 納入版本控制，部署前明確執行 migration，不在 Worker 啟動時自動套用。
- [外部資源 ID 無法由程式庫預先得知] → Hyperdrive 建立步驟產生 ID 後才更新 Wrangler 設定；未設定前 Wrangler validation 必須失敗而非部署無 binding 的 Worker。
- [KV 最終一致造成短暫舊 Redirect] → overwrite/delete 為主要失效手段，文件明載跨區約 60 秒以上的陳舊視窗；不宣稱立即一致。
- [負向快取耗盡 Free plan write quota] → 僅對合法短碼與 PostgreSQL not-found 寫入，quota error fail-open 並記錄 metrics/log；不在本次加入限流。
- [跨系統 mutation 無原子交易] → 更新／停用／刪除採 KV delete-first，首次失效失敗即中止資料庫 mutation；建立失敗不做可能再次失敗的補償 rollback。
