## 1. 契約與相依套件

- [x] 1.1 安裝 `zod-openapi` 與 `swagger-ui-dist` 並更新 `package.json`、`package-lock.json`，使 Node 24、Nuxt 4 與既有 Zod 4 相依樹可重現安裝；以 `npm ls zod-openapi swagger-ui-dist zod` 驗證無 invalid 或 missing dependency。
- [x] 1.2 依「以 Zod 契約產生 OpenAPI 3.1」在 `server/schemas/api-contract.ts` 與 `server/schemas/short-url.ts` 建立共用 request／response schema，使 **Zod-derived API contracts** 涵蓋建立資料、管理 metadata、更新同步欄位、validation issues、穩定 error envelope 與 health results，且不含密碼或雜湊；以新增 schema 單元測試驗證成功與拒絕案例。

## 2. OpenAPI 文件端點

- [x] 2.1 依「由固定路由動態提供單一文件」在 `server/utils/openapi-document.ts` 實作無 I/O document factory，使 **Complete JSON API operation coverage** 精確包含四組 method/path、實際 request/response 狀態碼、OpenAPI 3.1、`URLow API` 1.0.0 與 server `/`；以 `tests/server/openapi-document.test.ts` 驗證 metadata、operation 集合、schema 及狀態碼。
- [x] 2.2 依「將管理密碼描述為 header apiKey」在 document factory 定義 `ManagementPassword`，使 **Management password security declaration** 僅套用管理 GET/PATCH 且公開 operation 不要求 header；以 `tests/server/openapi-document.test.ts` 驗證 scheme type、header name、operation security 與文件不含密碼／雜湊範例。
- [x] 2.3 在 `server/api/openapi.json.get.ts` 提供 **Public OpenAPI document**，使無認證且缺少 Cloudflare bindings 的 caller 仍收到 HTTP 200 JSON，且 route 不觸發資料庫、KV、rate limiter 或檔案系統；以 `tests/server/openapi-api.test.ts` 直接呼叫 handler 並檢查 content type、document 與零外部 I/O。
- [x] 2.4 為 operation summary、description、field description、response description 與安全範例補齊繁體中文，同時維持英文 operationId、component、property、header 與 parameter，使 **Traditional Chinese human-readable documentation** 同時適用人類閱讀與 client generator；以 `tests/server/openapi-document.test.ts` 的代表性中文與英文 identifier assertions 驗證。

## 3. Swagger UI

- [x] 3.1 依「以 client-only 元件掛載 Swagger UI」新增 `app/components/SwaggerApiDocs.client.vue` 並調整 `app/app.vue` 的 `/api-docs` route 分支，使 **Public interactive Swagger UI** 從應用 bundle 載入 `swagger-ui-dist`、指向 `/api/openapi.json`、啟用 deep linking 與 Try it out，其他 route 不初始化 UI且首頁維持原貌；以 `tests/app/swagger-api-docs.test.ts` mock Swagger initializer 驗證設定與 route 分支。

## 4. 契約一致性與交付驗證

- [x] 4.1 依「以契約測試防止文件漂移」擴充 `tests/server/short-url-creation-api.test.ts`、`tests/server/short-url-management-api.test.ts` 與 `tests/server/database-health.test.ts`，使代表性成功與錯誤 handler response 通過共用 Zod schema，並以針對不合法 fixture 的測試證明漂移會失敗且 production handler 未增加 response parse。
- [x] 4.2 完成 **Cloudflare-compatible verification**，依序執行 `npm test`、`npm run typecheck` 與 `npm run build`，確認全部成功、Swagger server code 不含 DOM 或 Node.js 檔案系統依賴，且 `.output/server/index.mjs` 與 `.output/public` 保持 Cloudflare Worker 輸出；在 tasks 勾選前記錄三項命令結果。
