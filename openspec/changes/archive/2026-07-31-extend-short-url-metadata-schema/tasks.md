## 1. Drizzle 資料模型

- [x] 1.1 依「使用可空的管理密碼雜湊欄位」與「備註採可空且有資料庫長度限制」決策，在 `server/database/schema.ts` 將 `managementPasswordHash` 映射為 `management_password_hash varchar(255) NULL`、將 `note` 映射為 `note varchar(240) NULL`；以 `npm test -- tests/server/short-url-database-schema.test.ts` 驗證 SQL 欄名、長度、可空性與推導型別。
- [x] 1.2 依「啟用狀態採布林值」及「同時保留建立與更新時間」決策，在 `server/database/schema.ts` 保留 `createdAt`，並加入預設為 `true` 的非空 `enabled` 與預設為 `now()` 的非空 `updatedAt`；以 `Short URL management metadata schema` 與 `Drizzle schema parity` 測試驗證預設值、非空限制及 insert/select 型別。

## 2. 既有資料遷移

- [x] 2.1 依「既有資料沿用建立時間作為初始更新時間」決策產生並校正單一 forward migration，使既有列保留 `created_at`、以該值回填 `updated_at`、設為 `enabled = true`，並讓兩個選填欄位維持 `NULL`；以 `tests/integration/short-url-metadata-migration.test.ts` 的 `Existing short URL metadata migration` 測試在隔離 schema 建立舊版資料表與 `created_at = 2026-07-30T08:00:00Z` 的資料列，執行 migration 後驗證所有回填值。
- [x] 2.2 更新 `drizzle/meta/_journal.json` 與對應 snapshot，使 migration 次序及 Drizzle schema metadata 一致；重新執行 `npm run db:generate` 後不得再產生未預期的 schema 差異，並檢查 migration 在 transaction 失敗時不留下部分欄位或部分回填。

## 3. 契約與迴歸驗證

- [x] 3.1 新增 `tests/server/short-url-database-schema.test.ts`，透過 Drizzle table config 與 TypeScript 型別斷言驗證四個新欄位的 SQL 名稱、型別、長度、可空性、預設值及 insert/select 推導型別；執行 `npm test -- tests/server/short-url-database-schema.test.ts` 必須通過。
- [x] 3.2 擴充 `tests/integration/short-url-schema.test.ts`，在 transaction 內驗證省略新欄位的新列得到 `enabled = true`、非空 `updated_at` 與兩個 `NULL` 選填欄位，並驗證超長字串及兩個非空欄位的 `NULL` 寫入會被 PostgreSQL 拒絕而不截斷；設定 `DATABASE_URL` 後執行 `npm test -- tests/integration/short-url-schema.test.ts` 必須通過且保留既有短碼唯一性案例。
- [x] 3.3 執行 `npm test` 與 `npm run build`，確認資料模型及 migration 變更未破壞既有建立短網址、資料庫連線與重新導向行為；兩個命令皆須以 exit code 0 完成。
