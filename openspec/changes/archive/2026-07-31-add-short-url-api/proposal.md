## Why

URLow 目前只有 Redirect 與資料庫健康檢查，首頁建立短網址仍使用本機假資料；需要一個具備穩定輸入驗證、碰撞處理與快取同步契約的建立 API，才能完成後端 MVP 並為後續前端串接提供可靠介面。

## What Changes

- 新增 `POST /api/short-urls`，接受原始 HTTP(S) URL 並回傳 8 字元 Base62 短碼、原始網址與依請求 origin 組成的短網址。
- 以獨立、路由明確套用的 Zod validation middleware 驗證 JSON body，並提供穩定且不洩漏內部細節的錯誤格式。
- 以密碼學安全亂數產生短碼，精確辨識 PostgreSQL 唯一限制碰撞並最多重試五次。
- 沿用 PostgreSQL 作為 source of truth 與既有 Cloudflare KV mutation synchronization；資料庫成功但 KV 同步失敗時仍視為建立成功。
- 依 Red-Green-Refactor 順序先建立 middleware、短碼、service/repository 與 handler 測試，再加入最小實作。

## Capabilities

### New Capabilities

- `short-url-creation-api`: 定義建立短網址 API 的輸入驗證、成功回應、短碼產生與碰撞重試、KV 同步邊界及安全錯誤契約。

### Modified Capabilities

（無）

## Impact

- Affected specs: `short-url-creation-api`（新增），並延用 `cloudflare-postgres-runtime` 與 `edge-redirect-cache` 的既有契約
- Affected code:
  - New: `server/api/short-urls.post.ts`, `server/schemas/short-url.ts`, `server/utils/middleware/validate-request-body.ts`, `server/utils/short-url-creation-response.ts`, `server/services/short-code.ts`, `server/services/short-url-creation.ts`, `tests/server/short-url-creation-api.test.ts`, `tests/server/short-url-validation-middleware.test.ts`, `tests/server/short-code.test.ts`
  - Modified: `server/services/short-url-repository.ts`, `server/services/short-url-mutations.ts`, `README.md`
  - Removed: none
