## Context

URLow 已有 Nuxt/Nitro server、Zod 4、Vitest、Drizzle/PostgreSQL、Hyperdrive 與 Cloudflare KV。`GET /:code` 已透過 KV read-through 解析 redirect；`ShortUrlMutationCoordinator.create` 也已定義先寫 PostgreSQL、再覆寫 KV 的一致性順序，但目前缺少公開建立 API、實際 insert repository、短碼產生與 request body validation middleware。

此功能必須在 Cloudflare Worker 與 Node 24 測試環境運作，沿用既有 `short_urls` schema，不新增 migration。公開錯誤不得包含 Zod 內部結構、SQL、constraint 以外的 driver 細節、連線字串或 stack trace。

## Goals / Non-Goals

**Goals:**

- 提供可測試且契約穩定的 `POST /api/short-urls`。
- 將 Zod schema、路由專用 validation middleware、handler 與建立流程分離。
- 以 8 字元 Base62 安全亂數短碼及資料庫唯一限制處理碰撞。
- 延用 PostgreSQL source of truth 與既有 KV mutation synchronization。
- 以 Red-Green-Refactor 順序完成 unit、handler 與整體 regression 驗證。

**Non-Goals:**

- 不串接或修改 Vue 表單，不移除 mock data。
- 不加入自訂短碼、密碼、備註、enabled 欄位、列表、修改或刪除 API。
- 不加入 authentication、CAPTCHA、rate limiting、URL preview、DNS/private-network 檢查或 analytics。
- 不修改資料表、redirect route、KV value 格式或跨區一致性策略。

## Decisions

### 路由專用 Zod validation middleware

建立 `withValidatedBody(schema, handler)` 高階 event handler，放在 `server/utils/middleware/validate-request-body.ts`，由 `server/api/short-urls.post.ts` 明確套用。它負責 `readBody`、malformed JSON 正規化、Zod `safeParse` 與 400 response；成功時將 `z.output<TSchema>` 傳給 handler。它不放在 Nuxt 會自動套用所有請求的 `server/middleware/`，避免 health 與 redirect request 被解析 body。

替代方案是 handler 內直接 parse，會混合 HTTP、validation 與業務責任；全域 middleware 則會對無關路由增加耦合，兩者均不採用。

### 嚴格且最小的 request schema

request body 固定為 `{ originalUrl: string }`。schema 使用 strict object，先 trim，限制 1 至 2048 字元，再確認為絕對 URL 且 protocol 僅能是 `http:` 或 `https:`。成功建立與資料庫儲存均使用 normalization 後的字串，不額外 canonicalize path、query、fragment 或 hostname。

替代方案是接受 `url`、自訂 `code` 或 UI 的 password/note 欄位；這些都會擴張現有 MVP schema，故不採用。

### Web Crypto Base62 短碼產生

`generateShortCode` 使用 `crypto.getRandomValues` 與 `A-Z`、`a-z`、`0-9` 共 62 字元，固定輸出 8 字元。使用 rejection sampling 排除會造成 modulo bias 的 byte 範圍；亂數填充函式可注入，使測試能確定性驗證邊界，不依賴 mock 全域 crypto。

替代方案包含 `Math.random`、UUID 與新增 nanoid dependency；前者不可預測性不足，後兩者對本需求不是必要依賴。

### 建立服務與唯一碰撞重試

`server/services/short-url-mutations.ts` 抽出只依賴 `insert` 的 `ShortUrlCreationCoordinator`，既有 `ShortUrlMutationCoordinator` 繼承它並保留 update、disable、delete 行為，因此建立 API 不需要替尚未支援的 mutation 偽造 repository method。`createShortUrl` service 注入短碼 generator、`ShortUrlCreationCoordinator` 與最多嘗試次數（production 固定 5）。每次產生新 code 後呼叫 coordinator.create；repository insert 只有在錯誤同時符合 PostgreSQL code `23505` 與 constraint `short_urls_code_unique` 時轉為可辨識的 short-code collision。前四次碰撞重新產生，第五次碰撞回報 `SHORT_CODE_GENERATION_FAILED`；其他 database error 立即回報 `DATABASE_UNAVAILABLE`，不得重試或寫 KV。

替代方案是先查詢 code 是否存在；該作法有 race condition 且增加 round trip，因此以 database unique constraint 為最終仲裁。

### PostgreSQL 成功後的 KV failure policy

沿用 coordinator 的先 insert、後 `redirect:<code>` positive KV put 順序。insert 成功而 KV put 失敗時不補償刪除資料列，API 仍回 HTTP 201；PostgreSQL 保持 authoritative，後續 redirect cache miss 可由資料庫解析並 backfill。服務記錄不含 target URL 或底層訊息的錯誤類型，公開成功 body 不暴露內部快取狀態。

替代方案是回 503 或刪除已建立資料；兩者都會使 caller 無法判斷 PostgreSQL 是否已提交並可能造成重複建立。

### 穩定 API response 與錯誤碼

成功使用 HTTP 201 與 `{ data: { code, originalUrl, shortUrl } }`；`shortUrl` 使用 `getRequestURL(event).origin` 加上 `/${code}`。validation 使用 HTTP 400 `VALIDATION_ERROR`，issues 僅輸出 `{ path, message }`。一般 persistence failure 使用 HTTP 503 `DATABASE_UNAVAILABLE`，五次碰撞使用 HTTP 503 `SHORT_CODE_GENERATION_FAILED`，非預期錯誤使用 HTTP 500 `INTERNAL_ERROR`。所有非 validation 錯誤均使用固定 public message。

替代方案是回傳完整資料列或 RFC Problem Details；前者公開非必要 id/timestamp，後者對單一 MVP endpoint 增加不必要格式負擔。

## Implementation Contract

- Caller 對 `POST /api/short-urls` 傳送 JSON `{ "originalUrl": " https://example.com/path " }` 時，取得 HTTP 201 與 `{ "data": { "code": <8-char Base62>, "originalUrl": "https://example.com/path", "shortUrl": "<request-origin>/<code>" } }`。
- 非物件、malformed JSON、缺少或多餘欄位、空字串、超過 2048 字元、相對 URL 或非 HTTP(S) URL，均在任何 generator、PostgreSQL 或 KV I/O 前回 HTTP 400。body 為 `{ "error": { "code": "VALIDATION_ERROR", "message": "Request body is invalid", "issues": [{ "path": <dot-path>, "message": <safe-message> }] } }`。
- PostgreSQL insert 成功後才可寫 KV；碰撞 insert 不可寫 KV。`short_urls_code_unique` 最多有五次 insert attempt，耗盡後不得執行第六次。
- Database unavailable response 為 `{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "Unable to create short URL" } }`；碰撞耗盡 message 為 `Unable to allocate a unique short code`；internal error message 為 `Unable to create short URL`。
- `npm.cmd run test -- --run` 必須涵蓋 middleware、short-code、service/repository、handler 與既有 regression；`npm.cmd run build` 必須成功。設定 `DATABASE_URL` 時，既有 integration suite 亦必須通過。
- 範圍僅包含後端建立 API 與必要文件；前端、authentication、rate limiting、其他 mutation API 與 schema migration 明確排除。

## Risks / Trade-offs

- [公開建立 API 沒有 rate limiting，可能被濫用] → 本 change 明確記錄為 non-goal；部署前若流量風險提高，另提獨立 capability。
- [由 request origin 組 short URL 會反映 local/staging host] → 這是可預期且可測試的環境行為，不新增易漂移的 base URL 設定。
- [KV put 失敗後跨區首次 redirect 可能需要 PostgreSQL] → 沿用 read-through fallback，並以安全日誌提供操作可觀測性。
- [五次隨機碰撞理論上可能耗盡] → 回穩定 503，不無限重試；8 字元 Base62 空間使正常流量下機率極低。
