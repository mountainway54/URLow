## Context

URLow 已有 `management_password_hash`、`note`、`enabled` 與 `updated_at` 欄位，但建立 API 尚未寫入這些 metadata，也沒有管理授權端點。Redirect KV 目前只表達 redirect 與 missing，Repository lookup 只回傳目標網址，因此無法區分停用資料。後端運行於 Cloudflare Workers，原生 Node bcrypt binary 不可作為可攜依賴；KV 為最終一致；管理密碼驗證是 CPU 密集操作，必須在 bcrypt 前限流。

## Goals / Non-Goals

**Goals:**

- 建立時安全地正規化、驗證並以 bcryptjs cost 10 儲存選填管理密碼。
- 提供受管理密碼保護的 metadata GET 與 strict PATCH。
- 以每個來源 IP 與短碼每分鐘 10 次的 Cloudflare Rate Limiting binding 保護所有驗證嘗試。
- 讓 Redirect 正確處理 enabled 狀態並維持既有 KV read-through 與 stale-window 契約。
- 以穩定、無敏感資訊的 HTTP 狀態與 JSON error shape 表達失敗。

**Non-Goals:**

- 不串接建立或編輯前端，現有 mock 資料維持不變。
- 不新增刪除 API、管理密碼輪替、密碼補設、密碼重設、session 或一次性 token。
- 不將管理密碼用作 Redirect 存取密碼。
- 不導入 Durable Object 或強一致全域停用。
- 不把既有無管理密碼的短網址轉換成可管理資源。

## Decisions

### 使用 bcryptjs cost 10 與集中式密碼服務

新增管理密碼服務，集中處理 trim、空值、Unicode 字元數、UTF-8 byte 長度、bcrypt hash 與 compare。建立時 trim 後空值轉為 null；非空值須為 6 至 72 個 Unicode code point，且 UTF-8 不超過 72 bytes。驗證 Header 使用相同 trim 規則，但空值視為缺少憑證。服務必須在呼叫 bcrypt 前拒絕超長輸入，避免 bcrypt 靜默截斷。

採 `bcryptjs` 而非原生 `bcrypt`，因為 Worker 無法載入原生 binary。cost 固定為 10；bcrypt hash 已包含版本、cost 與 salt，因此不新增自訂 envelope。替代的 PBKDF2 已被需求取代；cost 12 因純 JavaScript Worker CPU 風險而不採用。

### 管理 API 與授權邊界

新增 `GET /api/short-urls/:code/management` 與 `PATCH /api/short-urls/:code`。兩者從 `X-Management-Password` 取得密碼，先驗證短碼格式、套用 rate limit、讀取管理資料，再執行 bcrypt compare。Route 只負責 HTTP mapping；管理服務擁有查詢、授權與 mutation orchestration，Repository 是唯一 PostgreSQL adapter。

GET 回傳 code、originalUrl、shortUrl、note、enabled、hasManagementPassword、createdAt、updatedAt。PATCH body 只接受 originalUrl、note、enabled，至少一個欄位；採 last-write-wins。管理密碼不能由 PATCH 更新。成功 PATCH 回傳更新後相同 metadata，加上 cacheSynchronized 與 staleWindowWarning。

### 管理驗證限流 adapter

新增 `MANAGEMENT_RATE_LIMITER` Cloudflare Rate Limiting binding。key 由可信任的 Cloudflare client IP 與已驗證格式的短碼組合，週期 60 秒、上限 10。每次 GET 或 PATCH 的驗證嘗試在資料庫查詢與 bcrypt 前呼叫 limiter；缺少、錯誤、正確密碼皆消耗額度。第 11 次及後續請求回 HTTP 429。

若 binding 缺少或 limiter 呼叫失敗，管理 API fail closed 並回 HTTP 503，不退化成無限流 bcrypt。替代的失敗次數計數需要 Durable Object，超出本次範圍。

### Repository 原子部分更新與密碼不可變

Repository 提供按 code 讀取完整管理資料與單次 UPDATE 部分更新。服務先驗證現有 hash，再根據 body 建立明確 update set；note 的 null、空字串與純空白均寫入 null，非空 note trim 後最多 240 字元；originalUrl 沿用建立 API 的 HTTP(S) 正規化。UPDATE 同時設定 `updated_at` 為資料庫目前時間並回傳更新後 row。不存在或競態刪除映射為 404。

沒有 hash 的 row 回 403，且不允許透過 PATCH 補設 hash。採 last-write-wins，不加入 ETag 或版本前置條件。

### Redirect 狀態與 KV mutation 一致性

Redirect lookup 改回傳 missing、disabled 或 enabled target，而不是 nullable string。KV discriminated union 新增 version 1 的 `{ "kind": "gone" }`，讓停用 cache hit 直接回 410；舊 redirect 與 missing 值維持相容。

PATCH 前先刪除 `redirect:<code>`；刪除失敗則不得更新 DB。DB 更新後，enabled=true 寫入 redirect value，enabled=false 寫入 gone value。後續 KV put 失敗不回滾 DB，PATCH 仍成功但回傳 `cacheSynchronized: false` 與固定 stale-window warning。KV 的跨區域陳舊仍可能使舊 Redirect 約 60 秒或更久可見。

### 穩定錯誤與日誌去敏感化

管理 API 使用既有 error envelope 風格。缺少或錯誤密碼回 401；存在但無管理密碼回 403；不存在回 404；限流回 429；資料庫、KV 初始 invalidation 或 limiter 不可用回 503；未預期錯誤回 500。驗證失敗不回傳 hash 或細節。所有日誌禁止包含 Header、明文密碼、hash、SQL、連線字串或 raw driver message，只記錄安全的 error type 與操作名稱。

## Implementation Contract

建立請求的 strict JSON shape 為 `{ originalUrl, managementPassword?, note? }`。成功 HTTP 201 的 data 在既有三欄之外包含正規化後的 note、enabled=true 與 hasManagementPassword。明文與 hash 不出現在任何回應。

管理 GET 與 PATCH 必須要求 `X-Management-Password`，並以每分鐘 10 次、IP 與 code 組合 key 的 limiter 在昂貴 I/O 前保護。GET 只在 bcrypt compare 成功後回傳私有 note。PATCH 只修改 originalUrl、note、enabled；空 body、未知欄位、無效 URL、超長 note 回 400。PATCH 不能建立、更新或移除管理密碼。

短碼不存在回 404；無 Header 或錯誤密碼回 401；無 hash 回 403；rate limit 回 429。成功停用後 Redirect 回 410，重新啟用後回 302。資料庫為權威；KV mutation 採 delete-before-update，後續 put 失敗由成功回應中的同步旗標與 stale warning 揭露。

驗收以 Vitest 單元與 API 測試確認：密碼 6/72 字元與 72-byte 邊界、Unicode、trim、空值、不同 salt、cost 10、compare；所有授權狀態；第 10 與第 11 次 limiter 行為；strict PATCH；note null 正規化；updatedAt；disabled 410；重新啟用 302；KV invalidation 與 put failure；所有公開 response 與日誌不含敏感值。執行 `npm run test -- --run`、`npm run typecheck` 與 `npm run build` 均須成功。

本次範圍限於後端 routes、services、repository、schemas、Worker bindings、KV redirect contract 與測試；不修改 Vue 元件，不新增刪除、密碼輪替、session、管理列表或資料庫 migration。

## Risks / Trade-offs

- [bcryptjs cost 10 仍消耗 Worker CPU] → 在 bcrypt 前以每分鐘 10 次驗證嘗試限流，並以測試及部署量測監控。
- [Cloudflare KV 最終一致導致停用或改址非全域即時] → 回應同步狀態與固定 stale-window warning，不宣稱立即生效。
- [密碼 trim 使前後空白無法成為密碼] → 建立與驗證採完全一致規則並以邊界測試固定。
- [沒有密碼的資源永久不可管理] → 建立回應明確回傳 hasManagementPassword，403 明確表達不可管理。
- [每分鐘 10 次包含成功請求，合法管理者可能收到 429] → 規格與錯誤契約明示固定窗口，後續有實際流量證據再另案調整。
- [KV delete 成功而 DB update 失敗造成暫時 cache miss] → Redirect 由 PostgreSQL read-through 恢復原狀，資料不被錯誤更新。

