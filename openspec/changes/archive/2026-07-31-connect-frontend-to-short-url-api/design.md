## Context

首頁目前由 `app/pages/index.vue` 複製 `app/data/mockLinks.ts` 的種子資料，再由建立與修改表單直接讀寫該記憶體集合。伺服器已提供同源建立、受管理密碼保護的查詢與修改 API，並以穩定錯誤 envelope、欄位驗證 issues、管理限流及 KV 同步旗標描述失敗或部分成功。此變更僅替換前端資料來源，不變更 API、資料庫、KV 或管理密碼政策。

## Goals / Non-Goals

**Goals:**

- 以具型別的單一前端 API 邊界串接建立、管理查詢與修改端點。
- 讓表單的 pending、成功、驗證、授權、限流、服務失敗與部分成功狀態可辨識且可測試。
- 修改流程採可回滾的樂觀更新，且不允許重疊 PATCH。
- 移除 mock 資料與密碼修改 UI，開放原始長網址修改。
- 將啟用控制項與長網址 input 外框在桌面版精準對齊，維持行動版單欄排列。

**Non-Goals:**

- 不新增或修改伺服器端 API、OpenAPI、資料庫 schema、KV 同步策略或 rate limiter。
- 不新增管理密碼重設、輪替、復原或建立後補設功能。
- 不保存管理密碼至 localStorage、sessionStorage、cookie、URL 或跨頁狀態。
- 不對建立或查詢做樂觀結果，也不自動重試非冪等 POST。
- 不新增全站狀態管理套件或外部 HTTP client 依賴。
- 不接受瀏覽器傳入的自訂 IP header 作為本機替代方案，也不放寬正式環境對可信 Cloudflare client IP 的要求。

## Decisions

### 集中型別化 API 邊界與錯誤正規化

新增 `app/types/short-url.ts` 定義建立資料、管理資料、更新資料、驗證 issue 與穩定錯誤 envelope；新增 `app/composables/useShortUrlApi.ts`，以 Nuxt `$fetch` 呼叫相對路徑並統一加入 `X-Management-Password`。composable 將 `$fetch` 例外正規化成帶有 HTTP status、穩定 code 與 issues 的前端錯誤，元件不直接解析框架例外形狀。

替代方案是讓每個表單直接呼叫 `$fetch`，但會重複 header、response 型別與錯誤解析，並增加兩個管理流程產生不同訊息的風險。此邊界不使用 runtime Zod 重複驗證成功回應，伺服器共享 schema 與既有契約測試仍是權威。

### 建立與查詢採確認式非同步流程

建立短碼由伺服器配置，管理資料亦須先授權，因此兩者在回應前不產生成功結果。送出時停用該表單的輸入與按鈕，建立按鈕顯示「建立中…」，查詢按鈕顯示「查詢中…」，完成後恢復。建立成功只清除管理密碼，保留長網址、備註及 API 回傳的短網址；密碼不寫入任何持久儲存。

查詢輸入正規化只接受 8 個 Base62 字元的純短碼，或 pathname 最後一段為該短碼的絕對 HTTP(S) URL。格式無效時顯示欄位錯誤且不發 request。替代方案是延續任意字串取最後一段，但會對明顯無效輸入消耗管理 rate limit。

### 可回滾且不重疊的樂觀管理更新

通過查詢後保留一份最後一次伺服器快照。送出 PATCH 時，畫面維持使用者已輸入的新長網址、備註與 enabled 狀態作為樂觀值，停用再次儲存；成功時以 API 回應替換快照與畫面資料。失敗時三個欄位全部回復送出前快照，並顯示正規化錯誤。這避免 last-write-wins API 因重疊請求造成非預期覆蓋。

管理密碼只保留在查詢密碼欄位，供 GET 與後續 PATCH header 使用；編輯區不顯示或回傳密碼欄位。替代方案是失敗後保留使用者草稿，但不符合已決定的樂觀回滾語意，且畫面會與伺服器狀態分歧。

### 精確錯誤與跨區部分成功呈現

建立的 `VALIDATION_ERROR` issues 依 `path` 顯示於長網址、管理密碼或備註欄位；未知 path 顯示在表單層級。管理錯誤依穩定 code 區分未授權、不可管理、不存在、限流、服務不可用與內部錯誤，不把 429 或 503 合併成密碼錯誤。網路中斷使用服務暫時無法使用訊息。

PATCH 回傳成功但 `cacheSynchronized=false` 時，顯示成功狀態以及固定使用者文案「設定已儲存，跨區同步可能需要一些時間才會完全生效。」不直接顯示伺服器英文 warning，也不宣稱固定同步時間。

### 以共同網格軌道對齊管理控制項

桌面版讓長網址欄位與啟用控制項都具有標籤軌道及相同高度的控制軌道，使 toggle 容器邊界對齊 input 外框；行動版維持全寬單欄。避免以負 margin 或固定像素位移補償，因字級與錯誤訊息變化會使補償失效。

### 受信任的本機管理限流 identity

`scripts/cf-dev.mjs` 啟動 Wrangler 時注入專案專用的 `URLOW_LOCAL_DEV=true` binding。管理 GET 與 PATCH 先讀取可信 `CF-Connecting-IP`；只有該 header 缺少且 binding 嚴格等於字串 `true` 時，才使用固定 `local-dev` identity 建立 rate-limit key。未經 wrapper 啟動、binding 缺少／拼錯／為其他值或正式環境缺少 Cloudflare IP 時仍回 `503 MANAGEMENT_UNAVAILABLE`。

替代方案是在前端送出 `CF-Connecting-IP`，但這會把安全邊界錯誤地下放給瀏覽器；另一方案是全面 fallback 至 socket IP，會改變正式環境的 fail-closed 契約。明確 dev binding 將例外限制在專案控制的本機啟動路徑。

## Implementation Contract

**Behavior:** 首頁初始不載入種子資料。建立表單向真實 API 建立資料並顯示可複製短網址；管理表單先以短碼與密碼取得資料，再允許修改長網址、備註與啟用狀態。所有可見密碼輸入仍支援顯示／隱藏及正確 accessible label，但編輯區不提供修改密碼。透過專案 dev wrapper 啟動的本機 Worker 可完成管理 GET／PATCH，不因 Wrangler 缺少 Cloudflare client IP 固定回 503。

**Interface / data shape:** API client 提供 `createShortUrl(body)`、`getManagedShortUrl(code, password)` 與 `updateShortUrl(code, password, patch)` 三個操作，分別對應既有三個端點。PATCH body 僅包含 `originalUrl`、`note`、`enabled` 中至少一項，管理密碼只放在 `X-Management-Password` header。元件使用 API camelCase response，不建立第二套 mock record shape。dev wrapper 將 `URLOW_LOCAL_DEV` 設為字串 `true`；服務層接收解析後的 client identity，不讓前端控制該值。

**Failure modes:** 格式錯誤不發 request；pending 時拒絕重複 submit；建立與查詢失敗不產生成功資料；修改失敗回復完整伺服器快照。穩定 error code 與 validation issue 映射為繁體中文且透過 live region 宣告。Clipboard API 失敗維持既有靜默行為。缺少可信 Cloudflare IP 且沒有精確 local marker 時維持 503；marker 不得由 request header 或 query 決定。

**Acceptance criteria:** `tests/app/short-url-workflows.test.ts` 以 mock `$fetch` 驗證三個 request 的 method、path、body、header、pending 防重複、成功後密碼清除、短碼解析、精確錯誤、樂觀成功與失敗回滾、跨區警告條件及無密碼修改欄位；server 與 script tests 驗證 local marker fallback、正式 fail-closed 及 wrapper 參數；`npm run typecheck`、`npm test` 通過。於 1440 與 375 CSS pixels 檢查 input／toggle 對齊、無水平捲動且互動目標不小於 44 CSS pixels。

**Scope boundaries:** 實作範圍限於 proposal 列出的首頁元件、前端型別／composable、CSS、前端測試、mock 模組移除，以及 dev wrapper／兩個管理 handler／管理 service 的本機 identity 傳遞；不得更動資料庫、KV、rate-limit 數值、正式 Cloudflare IP 優先序或新增依賴。

## Risks / Trade-offs

- [API success shape 日後變更會使純 TypeScript 型別無法在 runtime 攔截] → 依賴共享伺服器 schema、OpenAPI 與既有契約測試，前端集中邊界降低修改面積。
- [樂觀 PATCH 失敗會捨棄使用者剛輸入的草稿] → 依已確認產品決策回復權威快照，並顯示可採取行動的錯誤，避免誤認已儲存。
- [精確 403 與 404 訊息會揭露資源狀態] → 沿用現有 API 明確區分的產品契約，不在前端揭露密碼、hash 或原始 driver 訊息。
- [KV 最終一致使更新成功後跨區行為暫時不同] → 僅在 `cacheSynchronized=false` 顯示不承諾時間的跨區同步警告。
- [local marker 誤設於正式環境會讓缺少 Cloudflare IP 的請求共用固定 key] → marker 採專案專用名稱、只由 dev wrapper CLI 注入，正式 Wrangler config 不宣告此 binding，且可信 Cloudflare IP 永遠優先。
