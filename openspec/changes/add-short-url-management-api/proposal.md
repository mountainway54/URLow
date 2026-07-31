## Why

目前建立短網址 API 只接受原始網址，雖然資料庫已預留管理密碼雜湊、私人備註與啟用狀態，卻沒有安全的寫入、驗證、查詢或更新契約。這使後端無法支援既有管理介面所代表的功能，也缺少防止密碼暴力猜測與停用連結繼續跳轉的行為。

## What Changes

- 擴充 POST /api/short-urls，使其接受選填的管理密碼與私人備註，並在持久化前以 bcryptjs cost 10 雜湊密碼。
- 新增受 X-Management-Password 保護的管理查詢與部分更新 API。
- 對管理驗證加入以來源 IP 與短碼組成 key 的 Cloudflare Rate Limiting binding，每分鐘最多 10 次，成功與失敗皆計數。
- 讓停用短網址回傳 HTTP 410，並讓網址、備註與啟用狀態的更新同步 PostgreSQL 與 Redirect KV。
- 回應只公開 hasManagementPassword，不回傳明文密碼或密碼雜湊。
- 新增涵蓋輸入邊界、bcrypt、授權狀態、限流、資料更新、快取一致性與 Redirect 的自動化測試。

## Capabilities

### New Capabilities

- `short-url-management-api`: 受管理密碼保護的 metadata 查詢、部分更新、授權錯誤與驗證限流契約。

### Modified Capabilities

- `short-url-creation-api`: 建立請求新增選填的管理密碼與私人備註，並擴充安全回應欄位。
- `short-url-management-metadata`: 定義管理密碼的 bcrypt 儲存格式、輸入正規化，以及備註與更新時間的持久化行為。
- `edge-redirect-cache`: Redirect lookup 納入啟用狀態，停用時回傳 410，mutation 後同步 KV 並揭露 stale window。

## Impact

- Affected specs: short-url-management-api, short-url-creation-api, short-url-management-metadata, edge-redirect-cache
- Affected code:
  - New: server/services/management-password.ts, server/services/short-url-management.ts, server/api/short-urls/[code]/management.get.ts, server/api/short-urls/[code].patch.ts, tests/server/management-password.test.ts, tests/server/short-url-management.test.ts, tests/server/short-url-management-api.test.ts
  - Modified: package.json, package-lock.json, wrangler.jsonc, worker-configuration.d.ts, server/utils/env.ts, server/database/schema.ts, server/schemas/short-url.ts, server/api/short-urls.post.ts, server/services/short-url-creation.ts, server/services/short-url-repository.ts, server/services/short-url-mutations.ts, server/services/short-url-cache.ts, server/middleware/short-url-redirect.ts, tests/server/short-url-creation-api.test.ts, tests/server/short-url-creation.test.ts, tests/server/short-url-cache.test.ts, tests/server/short-url-mutations.test.ts
  - Removed: none

