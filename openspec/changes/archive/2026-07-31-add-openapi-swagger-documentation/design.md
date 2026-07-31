## Context

URLow 目前以 Nuxt 4 的 Nitro route 提供四組 JSON API，部署目標是 Cloudflare ES Module Worker。請求驗證集中在 Zod 4 schema，但成功回應、錯誤回應與 API metadata 分散在 handler、response helper、TypeScript 型別及測試中；前端則由單一 `app/app.vue` 呈現首頁，尚未使用 pages router。此次功能橫跨 server 契約、公開文件端點、瀏覽器 UI、相依套件及契約測試，且不得改變既有 API 的執行期行為。

## Goals / Non-Goals

**Goals:**

- 在本機與正式部署公開 OpenAPI 3.1 JSON 與可互動的 Swagger UI。
- 讓 request 與 response schema 由 Zod 契約供文件與測試共用。
- 完整描述目前四組 JSON API、管理密碼 header、成功與穩定錯誤回應。
- 保持 Cloudflare Worker build 可部署，且 Swagger UI 不依賴執行時 Node.js 檔案系統。

**Non-Goals:**

- 不記錄或改變短網址 `/{code}` 的瀏覽器 redirect 行為。
- 不新增認證機制，不隱藏公開文件，也不停用正式環境的 Try it out。
- 不從檔案系統掃描 Nitro route，不引入 decorators，也不手寫獨立的 openapi.yaml。
- 不在正式請求回傳前執行 response schema parsing；契約一致性由測試驗證。
- 不改變任何既有 API payload、狀態碼、限流、資料庫或 KV 行為。

## Decisions

### 以 Zod 契約產生 OpenAPI 3.1

採用 `zod-openapi`，由共用 Zod request／response schema 建立單一 OpenAPI document factory。既有 `createShortUrlBodySchema` 與 `updateShortUrlBodySchema` 繼續負責執行期 request 驗證；新增的成功、validation error、management error 與 health response schema 供文件生成及測試使用。替代方案是手寫 JSON/YAML，但會複製欄位限制並提高漂移風險；另一方案是掃描 route 或使用 decorators，但 Nitro 檔案路由沒有現成 metadata，且會增加框架耦合。

### 由固定路由動態提供單一文件

`GET /api/openapi.json` 每次請求呼叫純函式產生 OpenAPI 3.1 文件，固定 metadata 為 title `URLow API`、version `1.0.0`、server URL `/`。document 明確列出 `POST /api/short-urls`、`GET /api/short-urls/{code}/management`、`PATCH /api/short-urls/{code}`、`GET /api/health/database`，不做 route discovery。文件生成不得存取資料庫、KV、Cloudflare binding 或 Node.js 檔案系統。替代的建置時靜態產檔需要額外同步與發布步驟，對目前規模沒有收益。

### 將管理密碼描述為 header apiKey

在 `components.securitySchemes` 定義 `ManagementPassword`，型別為 `apiKey`、位置為 `header`、名稱為 `X-Management-Password`。管理 GET 與 PATCH operation 宣告 `security: [{ ManagementPassword: [] }]`；建立及健康檢查 operation 不宣告此 security requirement。Swagger UI 因而能透過 Authorize 保存 header 值並執行受保護的試呼叫，文件與回應範例不得包含真實密碼或雜湊。

### 以 client-only 元件掛載 Swagger UI

採用 `swagger-ui-dist` 的瀏覽器 bundle 與 CSS，在 `SwaggerApiDocs.client.vue` 的 mounted 階段初始化 UI，設定 spec URL `/api/openapi.json`、開啟 Try it out 與 deep linking。`app/app.vue` 依目前 route path 在 `/api-docs` 呈現此元件，其他路徑維持既有首頁內容；不為導入文件而重構整個首頁為 pages router。UI 資源由 Nuxt/Vite 納入網站 bundle，不從 CDN 載入，避免外部可用性與 CSP 相依。

### 以契約測試防止文件漂移

文件測試直接檢查 OpenAPI version、metadata、四個 path/method、request/response content、所有已知狀態碼及 security scheme。端點測試以相同 Zod response schema safe-parse 代表性 handler 結果，但 production handler 不新增 response parse。UI 測試驗證 `/api-docs` 分支初始化 Swagger UI 且指向 `/api/openapi.json`。最終驗證執行 `npm test`、`npm run typecheck` 與 `npm run build`。

## Implementation Contract

**Observable behavior**

- 未驗證的 caller 對 `GET /api/openapi.json` 收到 HTTP 200 與 JSON content type，body 為 OpenAPI 3.1 文件，且在本機與正式 Worker 行為相同。
- 瀏覽器造訪 `/api-docs` 看到標題為 `URLow API` 的 Swagger UI，可展開四組 API operation、Authorize 管理密碼並使用 Try it out。
- 文件說明與範例採繁體中文；operationId、schema component 名稱、JSON property、HTTP header 與路徑參數維持英文。

**Interface and data shape**

- OpenAPI metadata 固定為 `openapi: "3.1.0"`、`info.title: "URLow API"`、`info.version: "1.0.0"`、`servers: [{ url: "/" }]`。
- 文件 path 僅含 `/api/short-urls` 的 POST、`/api/short-urls/{code}/management` 的 GET、`/api/short-urls/{code}` 的 PATCH、`/api/health/database` 的 GET。
- `{code}` 是 required path parameter；管理 header 透過 `ManagementPassword` security scheme 表示。
- request 與 response media type 為 `application/json`。文件至少列出實作已穩定處理的成功、400 validation、401、403、404、429、500 與 503 response；每個 operation 只列出其實際可能回傳的狀態。
- response schema 涵蓋建立資料、管理 metadata、更新結果、validation issues、穩定 error envelope 及 health success/failure，不包含 plaintext management password 或 hash。

**Failure modes**

- 文件生成是無 I/O 純函式；若程式缺少必要 schema 或 path，測試與 typecheck 必須失敗，而不是在執行時回退成過期的靜態文件。
- Swagger UI 若無法取得 `/api/openapi.json`，由 Swagger UI 顯示載入錯誤；應用程式不得改用 CDN 或內嵌過期備份。
- 文件端點不得需要 Hyperdrive、KV、rate limiter 或任何 secret，因此這些 binding 缺失不影響文件取得。

**Acceptance criteria**

- OpenAPI 文件可由測試解析，並斷言 metadata、精確 operation 集合、security scheme、request/response schema 與狀態碼。
- 既有 API 代表性成功及錯誤回應通過共用 Zod response schema 的測試解析。
- `/api-docs` UI 測試確認 Swagger UI 初始化設定包含 `/api/openapi.json` 且允許互動操作。
- `npm test`、`npm run typecheck` 與 `npm run build` 全部成功，build 輸出仍為 Cloudflare Worker。

**Scope boundaries**

- In scope：Zod API 契約、OpenAPI document factory、公開 JSON route、client-only Swagger UI、相關相依套件及自動化測試。
- Out of scope：API 行為變更、redirect 文件、SDK 生成、OpenAPI YAML、文件存取控制、production response validation、API versioned route 與 UI 品牌客製化。

## Risks / Trade-offs

- [Risk] `swagger-ui-dist` 增加瀏覽器 bundle 體積 → 只在 client-only 文件元件載入，首頁路徑不主動初始化 Swagger UI。
- [Risk] Zod transform 與 refine 無法完整表達所有 runtime 語意 → 以繁體中文 description、限制 metadata 與具體 request examples 補足，並以 handler 契約測試驗證。
- [Risk] 公開 Try it out 讓匿名使用者更容易呼叫建立 API → 不改變既有公開 API 權限；管理操作仍需 header 且受既有限流保護。
- [Risk] 單一 `app.vue` 以 path 分支可能使未來路由擴充變複雜 → 本次維持最小整合；若新增更多頁面，再另案導入 pages router。
- [Risk] OpenAPI 文件與尚未歸檔的管理 API change 有時序相依 → apply 前以目前已完成的管理 API 程式與測試為真實契約，文件 change 不修改其行為。
