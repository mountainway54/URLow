## Why

目前短網址資料表只能保存目標網址與短碼，無法承載後續管理流程所需的管理密碼雜湊、私有備註、啟用狀態與最後更新時間。先建立明確且可遷移的持久化契約，才能在後續變更中安全地接入真實 API，而不讓前端欄位形成無聲資料遺失。

## What Changes

- 擴充 `short_urls` 資料表，新增可為空的管理密碼雜湊與最多 240 字元的私有備註。
- 新增不可為空且預設啟用的 `enabled` 布林狀態。
- 保留 `created_at`，並新增不可為空的 `updated_at` 時區時間戳。
- 遷移既有資料，使 `updated_at` 沿用各列的 `created_at`，`enabled` 為 `true`，其餘新欄位為 `NULL`。
- 以 schema 與 migration 測試驗證欄位型別、限制、預設值及既有資料回填規則。

## Capabilities

### New Capabilities

- `short-url-management-metadata`: 定義短網址管理中繼資料的資料庫欄位、限制、預設值與既有資料遷移契約。

### Modified Capabilities

（無）

## Impact

- Affected specs: `short-url-management-metadata`
- Affected code:
  - New: `drizzle/0001_salty_red_wolf.sql`, `tests/server/short-url-database-schema.test.ts`, `tests/integration/short-url-metadata-migration.test.ts`
  - Modified: `server/database/schema.ts`, `tests/integration/short-url-schema.test.ts`, `drizzle/meta/_journal.json`
  - Removed: 無
- Affected APIs: 無；本變更不修改建立、管理或重新導向 API。
- Dependencies: 無新增執行階段或開發依賴。
