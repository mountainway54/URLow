# Database Operations

URLow 的 PostgreSQL migration 是明確的 operator／CI 步驟。Worker 啟動與 request handler 不會執行 Drizzle Kit，也不會自動修改 schema。

## 部署順序

1. 從 Neon 取得 direct、unpooled connection string，確認 hostname 不含 `-pooler`，且 query string 包含 `sslmode=require`。
2. 只在目前的 operator／CI process 設定 `DATABASE_URL`，不要寫入 tracked file：

   ```powershell
   $env:DATABASE_URL="<NEON_DIRECT_URL>"
   ```

3. 確認 schema 沒有未產生的 drift：

   ```powershell
   npm.cmd run db:generate
   git status --short drizzle server/database/schema.ts
   ```

   `db:generate` 應顯示 `No schema changes, nothing to migrate`。

4. 在獨立的乾淨 Neon branch 先演練：

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run test -- --run tests/integration/short-url-schema.test.ts
   ```

5. 對目標 Neon branch 執行 `npm.cmd run db:migrate`，成功後才執行：

   ```powershell
   npm.cmd run build
   npx.cmd wrangler deploy --dry-run
   npm.cmd run deploy
   ```

6. 驗證 `GET /api/health/database` 回傳 HTTP 200 與 `{"status":"ok"}`，最後移除 process secret：

   ```powershell
   Remove-Item Env:DATABASE_URL
   ```

## Rollback

Application rollback 與 schema rollback 分開處理：

1. 若 Worker deployment 失敗或 health check 失敗，先使用 Cloudflare dashboard／Wrangler versions 將 Worker 回復至上一個已知正常版本。
2. 初始 migration 只新增 `short_urls`，不應在一般 deployment failure 時刪除資料表；舊 Worker 可忽略新表。
3. 只有在確認 migration 必須撤銷、已備份資料且沒有任何已部署 Worker 使用該表時，才由 operator 在 Neon SQL Editor 或受控 CI job 明確執行：

   ```sql
   DROP TABLE IF EXISTS "short_urls";
   ```

4. 不得把 rollback SQL 加到 Worker startup、request handler 或自動 deploy script。若 production 已有資料，優先 forward-fix；任何破壞性 rollback 都必須先建立 Neon branch／restore point。

`DATABASE_URL` 僅供 Drizzle Kit 使用；runtime database access 僅來自 Cloudflare `HYPERDRIVE` binding。
