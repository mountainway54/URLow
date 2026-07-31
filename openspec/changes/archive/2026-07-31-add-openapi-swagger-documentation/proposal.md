## Why

目前 URLow 的 API 契約分散在 Nitro route、Zod request schema、TypeScript 回應物件與測試中，缺少可供使用者瀏覽、互動試呼叫及供工具解析的標準文件。新增公開且由契約來源動態產生的 OpenAPI 文件，可降低文件與實作漂移，並改善 API 的探索與整合體驗。

## What Changes

- 新增公開的 GET /api/openapi.json，於執行時產生 URLow API 1.0.0 的 OpenAPI 3.1 JSON 文件。
- 新增公開的 /api-docs Swagger UI，正式部署環境同樣開放，並允許 Try it out。
- 使用既有與新增的 Zod schema 描述 request、成功 response 與錯誤 response，文件內容採繁體中文。
- 文件涵蓋短網址建立、管理查詢、部分更新及資料庫健康檢查 API，不納入瀏覽器短網址重新導向行為。
- 將 X-Management-Password 宣告為 apiKey security scheme，套用於受保護的管理端點。
- 新增契約、文件路由及 Swagger UI 自動化測試，並驗證型別檢查、既有測試與 Cloudflare Worker build。
- 新增 zod-openapi 與 swagger-ui-dist 執行期相依套件。

## Capabilities

### New Capabilities

- `openapi-api-documentation`: 公開、可互動且由 Zod 契約動態產生的 OpenAPI 3.1 與 Swagger UI 文件。

### Modified Capabilities

(none)

## Impact

- Affected specs: openapi-api-documentation
- Affected code:
  - New: server/schemas/api-contract.ts, server/utils/openapi-document.ts, server/api/openapi.json.get.ts, app/components/SwaggerApiDocs.client.vue, tests/server/openapi-document.test.ts, tests/server/openapi-api.test.ts, tests/app/swagger-api-docs.test.ts
  - Modified: package.json, package-lock.json, app/app.vue, server/schemas/short-url.ts, tests/server/short-url-creation-api.test.ts, tests/server/short-url-management-api.test.ts, tests/server/database-health.test.ts
  - Removed: none
