## 1. Cloudflare 執行環境與套件

- [x] 1.1 安裝並鎖定 `drizzle-orm`、`pg`、`zod`、`drizzle-kit`、`@types/pg`、`wrangler` 與 `vitest`，加入 `cf:dev`、`deploy`、`cf:typegen`、`db:generate`、`db:migrate`、`test` scripts，使安裝後的工具鏈可由 npm scripts 重現；以 `npm install`、`npm run postinstall` 與 `npm run test -- --run` 驗證依賴解析及 scripts 可執行。
- [x] 1.2 依「使用 Cloudflare Workers Assets 與 Nitro cloudflare preset」決策完成 Dynamic Cloudflare Worker deployment：Nuxt build 產生 `.output/server/index.mjs` 與 `.output/public`，Wrangler 啟用 `nodejs_compat`、observability、assets、`HYPERDRIVE` 與 `SHORT_URL_CACHE` bindings；以 `npm run build`、`npm run cf:typegen` 及 Wrangler deploy dry-run 驗證設定，並確認 `npm run generate` 不在 deploy script 中。
- [x] 1.3 建立 Neon direct、unpooled PostgreSQL origin 與名為 `urlow-neon` 的 Hyperdrive configuration，將實際 configuration ID 綁定為 `HYPERDRIVE`；以 `wrangler hyperdrive get urlow-neon` 與 Wrangler deploy dry-run 驗證 origin 類型、binding 名稱及 ID 均可解析，且 tracked files 不含 Neon 密碼。

## 2. 資料庫設定、Schema 與 Migration

- [x] 2.1 依「Migration 使用獨立的 DATABASE_URL」決策實作 Separate migration connection：`drizzle.config.ts` 只接受具 TLS 的 `DATABASE_URL`，本機 Worker 只接受 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`，缺少或無效值須在 SQL 前失敗；以有效與缺失環境變數各執行一次 `npm run db:generate`／設定驗證測試，並搜尋 tracked files 確認沒有完整 connection string 或密碼。
- [x] 2.2 依「Drizzle schema 採最小 short_urls 資料模型」決策實作 Minimal short URL schema，產生並提交初始 SQL migration，使空 Neon branch 建立 UUID primary key、`original_url`、唯一 `varchar(32)` code 與具時區 `created_at`；以 `npm run db:generate` 無未提交 schema drift、`npm run db:migrate` 成功及整合測試插入重複 `nuxt-guide` 被 unique constraint 拒絕來驗證。
- [x] 2.3 建立 migration rollback 操作說明與部署順序，確保 migration 由 operator／CI 在 Worker deploy 前明確執行且 request／Worker startup 不會自動 migration；以程式碼搜尋確認 runtime 無 Drizzle Kit migration 呼叫，並在乾淨 Neon branch 依文件完整演練 migrate 後再 deploy dry-run。

## 3. Runtime 資料庫存取與健康檢查

- [x] 3.1 依「Runtime 只透過 HYPERDRIVE binding 連線」決策實作 Hyperdrive-only runtime database access：從 H3 event 解析 `HYPERDRIVE.connectionString`、建立 request-scoped `pg.Client` 與 Drizzle instance，並在成功或失敗後關閉 client，禁止讀取 runtime `DATABASE_URL` 或回退 mock data；以 Vitest 模擬成功、binding 缺失、connect 失敗與 query 失敗，斷言 connect／close 次數及禁止 fallback。
- [x] 3.2 依「設定驗證與健康檢查採安全失敗」決策實作 Database health endpoint `GET /api/health/database`：`SELECT 1` 成功回傳 HTTP 200 `{ "status": "ok" }`，所有設定／連線／查詢錯誤回傳 HTTP 503 `{ "status": "error", "code": "DATABASE_UNAVAILABLE" }`；以 endpoint 測試覆蓋成功與三種失敗，並斷言 response 不含 connection string、host、username、password 或 raw driver error。
- [x] 3.3 使用 Wrangler local runtime 驗證 bindings 與 Edge 相容性：以有效的 local Hyperdrive connection-string 及 KV namespace 啟動 Worker 後 health endpoint 回傳 200，改用不可達但格式有效的 local PostgreSQL URL 後回傳穩定 503；完全缺少 local connection string 時 Wrangler 4.115 須在啟動前安全失敗。以實際 HTTP response、Worker log 無憑證及 client 正常關閉作為驗證證據。
- [x] 3.4 依「使用 Cloudflare Workers Assets 與 Nitro cloudflare_module preset」修正 ES Module Worker 與 local secret isolation：`npm run build` 產生具 default export 的 module Worker 並保留 external `cloudflare:sockets`，`.env` 只供 Drizzle 使用且 `.dev.vars` 只供 Wrangler local Hyperdrive override；以 `npm run build`、Wrangler local startup binding 清單不含 `DATABASE_URL`、health endpoint 200 及 deploy dry-run 驗證。

## 4. Edge Redirect 快取

- [x] 4.1 依「負向快取僅接受合法短碼」決策實作 Validated edge redirect lookup：只接受 `[A-Za-z0-9_-]{4,32}`，key 固定為 `redirect:<code>`，不合法格式直接 404 且不讀 KV／PostgreSQL；以 Vitest 參數化測試合法邊界、過短、過長及非法字元，斷言無效案例的 KV 與 database 呼叫數皆為 0。
- [x] 4.2 依「Redirect 採 KV read-through cache」決策實作 KV cached redirect resolution、Read-through PostgreSQL fallback 與 Database outage redirect policy：positive hit 302、negative hit 404、miss 才查 PostgreSQL並以 `waitUntil` 回填、雙重不可用時 503；以 resolver 與 endpoint 測試覆蓋有效／無效 cache value、KV error、database found／absent／unavailable、負向寫入 quota error，並斷言 cache hit 不建立 PostgreSQL client。
- [x] 4.3 依「Mutation 採主動 KV 同步」決策實作 Active cache synchronization for mutations 與 Explicit KV consistency boundary：create 在 insert 後覆寫包含負向 marker 的 KV，update 先 delete、更新 database、再 put，disable/delete 先 delete 再改 database，首次 delete 失敗禁止 database mutation；以 ordered mocks 驗證呼叫順序、create put failure 不執行補償 delete，並斷言 mutation result 暴露 cache synchronization failure。
- [x] 4.4 實作 Redirect path excludes click recording：`GET /:code` 只執行 cache resolution、必要的 PostgreSQL read 與 302／404／503 response，不寫點擊、Queue 或 Analytics Engine；以 positive hit、negative hit、miss found 三個 endpoint 測試及 tracked-code search 驗證 PostgreSQL write、Queue send 與 Analytics Engine 呼叫數皆為 0。

## 5. 文件與交付檢查

- [x] 5.1 完成 Reproducible operator documentation，更新 README、架構文件與 debug log，清楚區分已過期的 Cloudflare Pages static deployment 與目前 Worker dynamic deployment，並逐步記錄 Neon、Hyperdrive、KV namespace、local dev、migration、build、health check、deploy、rollback、每日 1,000 次 Free plan KV writes 風險及跨區約 60 秒以上的 stale window；由未使用作者本機秘密值的 clean checkout 內容審查，確認每個變數名、resource 名、失敗行為與指令都有明確定義。
- [x] 5.2 執行完整交付驗證：`npm run test -- --run`、`npm run build`、Wrangler deploy dry-run、Drizzle schema drift check、tracked-secret scan 與 `spectra validate add-cloudflare-neon-hyperdrive` 全部通過，並確認成果仍符合 Implementation Contract 的 in-scope／out-of-scope 邊界，只新增 Redirect 與內部 mutation contract，未實作對外建立／編輯／刪除 API、前端串接、點擊記錄、Rate Limiting 或 Durable Object。
