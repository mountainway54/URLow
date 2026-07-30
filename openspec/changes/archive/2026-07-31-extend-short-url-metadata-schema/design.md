## Context

`short_urls` 目前只保存 `id`、`original_url`、`code` 與 `created_at`。前端原型已呈現管理密碼、備註與啟停狀態，但本變更刻意先建立資料庫契約，避免 API 接入時無處持久化或以明文保存敏感資料。目標環境是 Cloudflare Workers 搭配 PostgreSQL／Neon Hyperdrive，schema 由 Drizzle 定義並以 Drizzle migration 管理。

## Goals / Non-Goals

**Goals:**

- 為每筆短網址提供可選的管理密碼雜湊、可選私有備註、啟用狀態及建立／更新時間。
- 保證既有資料遷移後仍為啟用狀態，且 `updated_at` 不捏造為部署時間。
- 讓 Drizzle 推導型別與 PostgreSQL schema 對欄位限制、可空性及預設值保持一致。

**Non-Goals:**

- 不修改建立短網址 API 的 request／response。
- 不實作管理查詢、修改、停用 API，亦不改變重新導向的 HTTP 狀態。
- 不實作 PBKDF2-SHA-256 雜湊或密碼驗證。
- 不修改前端表單或移除假資料。
- 不使用資料庫 trigger 自動維護 `updated_at`。

## Decisions

### 使用可空的管理密碼雜湊欄位

`management_password_hash` 使用 `varchar(255) NULL`，只承載後續 API 產生的不可逆、帶版本與參數資訊之雜湊字串。`NULL` 表示短網址沒有管理憑證，依產品決策將永久不可管理。選擇單一編碼字串而非拆成 salt、迭代次數與 digest 多欄，可讓後續雜湊格式升級而不必再次改 schema；不採明文或可逆加密，因管理密碼只需驗證而不需取回。

### 備註採可空且有資料庫長度限制

`note` 使用 `varchar(240) NULL`。`NULL` 表示沒有備註，240 字元限制與既有前端輸入限制一致，並在資料庫層防止繞過應用驗證寫入超長內容。備註的私有可見性將由後續管理 API 規格執行，本變更只提供儲存欄位。

### 啟用狀態採布林值

`enabled` 使用 `boolean NOT NULL DEFAULT true`。目前狀態只有啟用與停用兩態，因此不引入 enum 狀態機。`false` 的未來重新導向語意已決定為 `410 Gone`，但該 HTTP 行為不在本變更範圍。

### 同時保留建立與更新時間

保留既有 `created_at`，新增 `updated_at`，型別為帶時區時間戳、不可為空且新資料預設 `now()`。未來所有管理寫入由後端明確設定 `updated_at`，不使用隱藏更新行為的 trigger。

### 既有資料沿用建立時間作為初始更新時間

migration 必須先讓 `updated_at` 可回填，再將每筆既有資料設為該列 `created_at`，最後套用 `NOT NULL` 與 `DEFAULT now()`。直接以新增欄位預設值回填會把 migration 時間錯誤記成歷史資料的最後更新時間，因此不採用。

## Implementation Contract

**Behavior and data shape**

- PostgreSQL `short_urls` 新增 `management_password_hash varchar(255) NULL`、`note varchar(240) NULL`、`enabled boolean NOT NULL DEFAULT true`、`updated_at timestamp with time zone NOT NULL DEFAULT now()`。
- Drizzle `shortUrls` schema 暴露對應 camelCase 欄位 `managementPasswordHash`、`note`、`enabled`、`updatedAt`，並保留 `createdAt`。
- migration 執行於含既有短網址的資料庫後，每筆舊資料 SHALL 保持原 `created_at`，其 `updated_at` SHALL 等於原 `created_at`，`enabled` SHALL 為 `true`，`management_password_hash` 與 `note` SHALL 為 `NULL`。
- migration 後新增且未明確提供新欄位的資料列 SHALL 得到 `enabled = true` 及資料庫產生的非空 `updated_at`；兩個可選欄位 SHALL 保持 `NULL`。

**Failure modes**

- 超過 255 字元的管理密碼雜湊或超過 240 字元的備註由 PostgreSQL 拒絕，不截斷資料。
- `enabled = NULL` 或 `updated_at = NULL` 由 PostgreSQL 的 `NOT NULL` 約束拒絕。
- migration 若失敗 SHALL 由 migration transaction 回滾，不接受部分欄位或部分回填狀態。

**Acceptance criteria**

- `npm run db:generate` 所對應的 migration 檔與 `server/database/schema.ts` 契約一致，且 migration 明確以 `created_at` 回填舊列的 `updated_at`。
- `npm test -- tests/integration/short-url-schema.test.ts` 驗證 Drizzle 欄位名稱、SQL 型別、可空性、預設值與新增資料型別。
- `tests/integration/short-url-metadata-migration.test.ts` 在隔離的測試 schema 建立舊版資料表與一筆既有資料，執行新 migration，並斷言回填值與 transaction 原子性符合上述契約。

**Scope boundaries**

- In scope: Drizzle schema、單一 forward migration、Drizzle metadata journal、`tests/server/short-url-database-schema.test.ts` 的 schema 單元測試，以及 `tests/integration/short-url-schema.test.ts`、`tests/integration/short-url-metadata-migration.test.ts` 的 PostgreSQL 整合測試。
- Out of scope: API payload、PBKDF2 實作、管理授權、備註回傳、`410 Gone` 重新導向與前端串接。

## Risks / Trade-offs

- [Risk] `varchar(255)` 可能不足以容納未來不同格式的密碼雜湊 → [Mitigation] 後續 PBKDF2 格式設計須以 255 字元為上限並用測試固定格式；若選擇更長格式，須先提出 schema 變更。
- [Risk] 手動調整 Drizzle 產生的 migration 以正確回填時間可能與 metadata 不一致 → [Mitigation] schema 由 Drizzle 產生後，只調整必要的 SQL 回填順序，並以 migration 測試及 `drizzle/meta/_journal.json` 驗證一致性。
- [Risk] rollback 移除新欄位會遺失已寫入的管理中繼資料 → [Mitigation] 尚未有 API 寫入新欄位時可安全 rollback；開始寫入後須以 forward fix 為主並在 rollback 前備份。
