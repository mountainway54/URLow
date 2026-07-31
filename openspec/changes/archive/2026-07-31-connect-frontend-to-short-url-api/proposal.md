## Why

目前首頁以記憶體假資料模擬建立、查詢與修改，畫面成功狀態不代表資料已寫入 PostgreSQL 或可由短網址重新導向。既有建立與管理 API 已具備完整契約，前端應改為使用真實資料來源並正確呈現驗證、授權、限流及跨區同步結果。

## What Changes

- 建立流程改呼叫 `POST /api/short-urls`，以 API 回傳的短碼與短網址顯示結果，不再產生 `demo-*` 假短碼。
- 管理查詢改呼叫 `GET /api/short-urls/:code/management`，接受完整短網址或 8 碼短碼，並以 `X-Management-Password` 授權。
- 修改流程改呼叫 `PATCH /api/short-urls/:code`；允許修改長網址、備註與啟用狀態，移除 API 不支援的管理密碼修改欄位。
- 將建立欄位命名為「管理密碼」，持續提示未設定時建立後無法管理；建立成功後清除前端保存的密碼。
- 建立與查詢等待真實回應並防止重複送出；修改採樂觀更新，失敗時回復最後一次伺服器資料。
- 將穩定 API 錯誤碼與欄位驗證 issues 映射為精確的繁體中文訊息，並在快取未同步時顯示「設定已儲存，跨區同步可能需要一些時間才會完全生效。」
- 修正管理表單中啟用開關與長網址輸入框的視覺對齊。
- 移除前端 mock 資料模組與首頁的記憶體集合狀態。
- 修正本機 Wrangler 不提供 `CF-Connecting-IP` 而使管理 GET／PATCH 固定回 503 的問題；只有專案 dev wrapper 明確標記的本機環境使用固定 local rate-limit identity，正式環境安全契約不變。

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `liquid-glass-homepage`: 將首頁的 mock 建立、查詢與修改需求改為真實 API 工作流程，並定義非同步狀態、錯誤呈現、樂觀更新與管理表單對齊行為。
- `short-url-management-api`: 定義受信任的本機 dev wrapper 在缺少 Cloudflare client IP 時使用隔離的固定管理限流 identity，同時保留其他環境缺少可信 IP 即失敗的行為。

## Impact

- Affected specs: `liquid-glass-homepage`, `short-url-management-api`
- Affected APIs: 既有 `POST /api/short-urls`、`GET /api/short-urls/:code/management`、`PATCH /api/short-urls/:code`；伺服器契約不變。
- Affected code:
  - New: `app/composables/useShortUrlApi.ts`, `app/types/short-url.ts`, `tests/app/short-url-workflows.test.ts`
  - Modified: `app/pages/index.vue`, `app/components/CreateShortLinkForm.vue`, `app/components/EditShortLinkForm.vue`, `app/components/EnabledToggle.vue`, `app/assets/css/urlow.css`, `scripts/cf-dev.mjs`, `server/api/short-urls/[code]/management.get.ts`, `server/api/short-urls/[code].patch.ts`, `server/services/short-url-management.ts`, `tests/scripts/cf-dev.test.ts`, `tests/server/short-url-management.test.ts`, `tests/server/short-url-management-api.test.ts`
  - Removed: `app/data/mockLinks.ts`
