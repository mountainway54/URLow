# 系列五：AI 如何協助我完成這個專案

這次協作先安裝了 `grill-me` 與它依賴的 `grilling` skill。它不負責直接產生程式碼，而是要求 AI 一次只問一個問題，並優先從專案中查找能自行確認的事實。

我一開始的問題是：

> 「請幫我看看我有哪些套件可以先安裝」

釐清範圍後，我指定：

> 「URLow 專案的 npm 套件」

AI 檢查 `package.json`、README 與目前原始碼後，確認專案現階段只有 Nuxt、Vue、Vue Router 與 Tailwind CSS。README 雖然已規劃 PostgreSQL、Drizzle ORM、Zod 與 Vitest，但這些套件尚未安裝。

這個步驟帶出第一個原則：套件不是「看起來有用就先裝」，而是要由下一個功能目標決定。URLow 的下一階段因此被收斂為後端 MVP：資料庫、Schema、輸入驗證、Server API 與測試。

---

## 要求 AI 說明判斷依據

討論部署架構時，AI 一開始根據儲存庫文件判斷 Cloudflare 使用 `npm run generate`。我沒有直接接受，而是追問：

> 「哪可以看得出來 部署指令是nuxt generate」

AI 回頭指出三個依據：

- `docs/06-debug-log.md` 記載 `Build command: npm run generate`。
- `package.json` 將 `generate` 定義為 `nuxt generate`。
- README 將這個指令描述為「產生靜態輸出」。

但這些證據只代表儲存庫內曾經記錄的部署方式，不等於 Cloudflare 控制台的現在狀態。我因此補充：

> 「修改 docs/06-debug-log.md 記載的是過去或已過期的部署方式 目前部署的是 Cloudflare Worker 動態版本」

最後文件被修正為：`npm run generate` 是過去的 Cloudflare Pages 靜態部署設定，目前專案使用 Cloudflare Worker 動態版本。

這段經驗說明，即使 AI 能提出檔案證據，也必須區分「歷史紀錄」和「目前外部系統狀態」。部署平台、控制台設定與雲端資源都是可能在儲存庫之外改變的資訊。

---

## 第一版架構：Cloudflare Workers、Neon 與 Hyperdrive

確認部署現況後，我要求建立 Spectra proposal：

> 「Cloudflare Workers + 外部 PostgreSQL(neon) + Hyperdrive」

第一版 proposal 規劃：

- 使用 Cloudflare Workers Assets 與 Nitro `cloudflare` preset。
- 以 Neon 提供 PostgreSQL。
- 正式環境透過 Cloudflare Hyperdrive 連線。
- 使用 Drizzle ORM 與 Drizzle Kit 管理 schema 和 migration。
- 使用 Zod 驗證設定。
- 使用 Vitest 驗證 database client 與 health endpoint。
- 建立最小 `short_urls` table。

接著我問：

> 「Hyperdrive是必要的嗎」

答案是否定的。Cloudflare Worker 也可以使用 `@neondatabase/serverless` 直接連線 Neon；若使用 Hyperdrive，則應採標準 PostgreSQL driver，例如 `pg`，而不是同時疊加 Neon serverless driver。

對小型 MVP 而言，直接使用 Neon serverless driver 的設定更少；Hyperdrive 的主要價值是連線池、跨區連線最佳化及快取能力。不過這場討論很快發現，真正影響 Redirect 延遲的問題並不是 driver 選擇。

---

## 真正的問題：Redirect 到底要不要直接打 PostgreSQL？

我對第一版 proposal 提出最重要的質疑：

> 「真正該質疑的是你的 proposal 本身少了一個更關鍵的架構決策：redirect 到底要不要直接打 Postgres？」

我進一步補充：

> 「短網址系統的標準做法是把『短碼 → 目標網址』這種讀多寫少、幾乎不變的資料放到 Cloudflare KV 或 Cache API 做邊緣快取，Postgres 只在 cache miss、建立短網址、或寫入點擊記錄時才碰。如果你這樣設計，Hyperdrive vs serverless driver 的效能差異對整體延遲的影響會小很多，因為熱路徑根本不打資料庫。」

這使架構焦點從「哪個 PostgreSQL driver 比較快」改成「如何讓熱路徑不需要 PostgreSQL」。

最後選擇 Cloudflare KV，而不是 Cache API：

- KV 適合讀多寫少、跨區讀取的 key-value mapping。
- Cache API 的內容不會跨資料中心複製。
- Cache API 的 `cache.delete` 只會刪除執行該 Worker 之資料中心的內容。

新的 Redirect 讀取階層為：

```text
GET /:code
    │
    ▼
驗證短碼格式
    │
    ▼
Cloudflare KV
    │
    ├── 正向命中 ──▶ 302 Redirect
    │
    ├── 負向命中 ──▶ 404
    │
    └── Miss / KV 失敗
              │
              ▼
       Neon PostgreSQL
              │
              ├── 找到 ──▶ 回填 KV ──▶ 302
              ├── 查無 ──▶ 負向快取 ──▶ 404
              └── 不可用 ───────────▶ 503
```

PostgreSQL 仍是 source of truth；Hyperdrive 被保留在 cache miss、health check 與 mutation 路徑，不再位於 Redirect cache hit 的熱路徑。

---

## 負向快取：避免亂猜短碼持續打資料庫

我提出：

> 「負向快取（不存在的短碼）：Postgres 查無資料時，也要在 KV 寫一筆短 TTL 的『不存在』標記，避免短碼掃描/亂猜流量每次都繞過快取直接打資料庫。」

最後定義兩種 KV value：

```ts
type RedirectCacheValue =
  | {
      version: 1;
      kind: "redirect";
      targetUrl: string;
    }
  | {
      version: 1;
      kind: "missing";
    };
```

規則如下：

- Key 格式為 `redirect:<code>`。
- 合法短碼格式為 `[A-Za-z0-9_-]{4,32}`。
- 不合法格式直接回 404，不查 KV 或 PostgreSQL。
- 正向 value 不設應用層 TTL。
- 負向 value 使用 60 秒 TTL。
- 只有 PostgreSQL 明確查無的合法短碼才寫入負向 value。
- 負向 KV 寫入因額度或服務錯誤失敗時，仍回傳 404，不把已確認的查無結果改成 5xx。

---

## 主動失效比 TTL 更重要

我接著指出：

> 「主動失效優先於 TTL：短網址內容不會自然過期，建議不設 TTL、改成更新或刪除短網址時在同一次操作中主動呼叫 KV delete/overwrite，避免使用者改了目標網址後，舊快取值在 TTL 到期前持續導向錯誤位置（這是正確性問題，不只是效能問題）。」

因此正向快取不依靠 TTL 自然過期，而是由 mutation 主動同步：

- 建立：先寫 PostgreSQL，再 `KV.put` 正向 value。
- 更新：先刪除 KV 舊值，再更新 PostgreSQL，最後寫入新 value。
- 停用／刪除：先成功刪除 KV，再修改 PostgreSQL。
- 首次 KV delete 失敗時，不允許繼續修改 PostgreSQL。

我另外補充：

> 「建立短網址時，這次寫入也應該主動覆寫 KV」

這是因為新產生的短碼可能先前曾被掃描，KV 中已經有 `missing` 負向標記。建立成功後必須主動 overwrite，不能等待負向 TTL 自然過期。

若 PostgreSQL 已完成 insert，但 KV overwrite 失敗，不能再假裝跨系統 rollback 一定成功。PostgreSQL row 保持權威狀態，mutation result 必須向呼叫端暴露 cache synchronization failure；既有負向標記最晚會依 60 秒 TTL 消失。

---

## KV 不是強一致資料庫

主動 overwrite/delete 並不代表全球立即一致。Cloudflare KV 採最終一致模型：寫入通常會先在執行地區可見，其他地區可能在約 60 秒或更久內繼續看到舊值。

在確認官方限制後，我接受：

> 「好的 我接受 KV 主動 overwrite/delete 後，跨區仍可能有約 60 秒以上的最終一致性視窗」

因此規格不宣稱立即全球失效，也不為了強一致加入 Durable Object。這是 MVP 明確接受的產品限制，而不是留給實作者自行猜測的行為。

參考資料：

- [Cloudflare Workers KV：How KV works](https://developers.cloudflare.com/kv/concepts/how-kv-works/)
- [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)

---

## 點擊記錄不能拖慢熱路徑

我的第三項要求是：

> 「點擊記錄要非同步、不能卡在 hit 路徑上：如果 KV 命中後還要同步寫一筆 Postgres 記錄點擊，快取省下的延遲等於白費。要嘛用 Queue／Analytics Engine 等非同步方式記錄，要嘛這次 MVP 明確先不做點擊記錄，兩者擇一要寫清楚。」

本次 MVP 選擇不做點擊記錄：

- 不同步寫 PostgreSQL。
- 不傳送 Queue message。
- 不呼叫 Analytics Engine。
- KV cache hit 只負責產生 Redirect response。

未來若加入分析功能，必須以獨立規格決定 Queue 或 Analytics Engine，而不能偷偷把同步 write 塞回 Redirect handler。

---

## PostgreSQL 不可用時如何降級

我也要求：

> 「Postgres 不可用時的降級策略要選定：是直接回 5xx（正確性優先），還是允許讀 KV 裡的舊值當退化方案（可用性優先、但有極小機率回傳已失效的舊目標），這個取捨要明寫進 capability，不能留給實作者自行決定。」

最後行為被明確定義為：

| KV 狀態                 | PostgreSQL 狀態 | 結果                     |
| ----------------------- | --------------- | ------------------------ |
| 正向命中                | 不檢查          | 302                      |
| 負向命中                | 不檢查          | 404                      |
| Miss                    | 找到            | 302，並回填正向 KV       |
| Miss                    | 查無            | 404，並寫入 60 秒負向 KV |
| Miss／無效 value        | 不可用          | 503                      |
| KV 讀取失敗             | 可用            | 依 PostgreSQL 結果回應   |
| KV 與 PostgreSQL 皆失敗 | 不可用          | 503                      |

系統不另外保存 stale backup。有效 KV hit 即使在 PostgreSQL outage 期間仍可服務，但 cache miss 不會猜測目標網址。

---

## 費用也是架構限制

我問：

> 「KV服務需要額外收費嗎」

Cloudflare Workers Free plan 已包含有限的 Workers KV 額度：

- 每天 100,000 次 reads。
- 每天 1,000 次 writes。
- 每天 1,000 次 deletes。
- 1 GB 儲存空間。

這讓 URLow 初期可以不額外付費，但負向快取帶來另一個風險：攻擊者若掃描大量不同且格式合法的短碼，可能耗盡每天 1,000 次免費 writes。

這次選擇只做格式驗證，不加入 Cloudflare Rate Limiting。因此這項 quota exhaustion 風險必須被寫進規格、文件與監控，而不能假設免費額度永遠足夠。

參考資料：

- [Cloudflare Workers KV Pricing](https://developers.cloudflare.com/kv/platform/pricing/)

---

## 從討論轉成 Spectra 規格

討論結果沒有只停留在聊天室，而是被整理進 Spectra change：

```text
add-cloudflare-neon-hyperdrive
```

目前包含兩個 capabilities：

- `cloudflare-postgres-runtime`
- `edge-redirect-cache`

Artifacts 包含：

- Proposal：說明為什麼要加入 Neon、Hyperdrive 與 KV。
- Design：記錄 runtime、migration、cache、mutation ordering 與 failure modes。
- Specs：以 SHALL／MUST 和 WHEN／THEN 定義可測試行為。
- Tasks：16 項可追蹤的實作與驗證任務。

Spectra analyzer 的 Coverage、Consistency 與 Gaps 均為 Clean，validation 也已通過。

> [!IMPORTANT]
> 此 change 後續已完成實作與驗證：Neon、Hyperdrive、KV read-through Redirect、migration、health endpoint、內部 mutation contract 與測試均已落地；對外建立／編輯／刪除 API 與前端串接仍不在本次範圍。

## 本次實作協作流程摘要

這個 session 從 `$spectra-apply add-cloudflare-neon-hyperdrive` 開始，由 AI 依 proposal、design、specs 與 tasks 逐項實作。套件安裝、Cloudflare 登入與 Neon connection string 等需要本機秘密或互動授權的步驟由我操作；AI 負責檢查結果、更新程式碼、執行可自動化的測試，並在每個 task 完成後立即更新 Spectra checkbox。

實作過程不是一次把所有檔案產生完，而是依照以下循環推進：

```text
讀取 task 與 Implementation Contract
              │
              ▼
搜尋現有程式與可重用設計
              │
              ▼
實作最小範圍的程式或設定
              │
              ▼
執行單元測試、build、dry-run 或實際 HTTP 驗證
              │
        ┌─────┴─────┐
        │           │
      通過         發現限制
        │           │
        ▼           ▼
勾選 task    更新 Spectra artifacts
        │           │
        └─────繼續 apply
```

當實際 Cloudflare runtime 顯示原設計不足時，我先確認新的取捨，再用 `$spectra-ingest` 把 ES Module Worker 與本機 secret isolation 寫回 artifacts，通過 analyzer／validation 後才重新 apply。這讓規格與程式碼保持同步，而不是只在程式裡留下無法追溯的例外處理。具體錯誤、症狀與排除方式另記於 [Debug 紀錄](./06-debug-log.md)，本篇不重複。

最終驗證包含：

- Vitest 單元與 route tests。
- Neon migration 與 duplicate short-code integration test。
- Nuxt Cloudflare Module build。
- Wrangler local health endpoint 的 200／503 response。
- Wrangler deploy dry-run。
- Drizzle schema drift、secret scan 與 out-of-scope scan。
- `spectra validate add-cloudflare-neon-hyperdrive`。

最後也討論了 GitHub CI 的下一步方向：PR 僅執行無 production secrets 的 test/build/dry-run，production deployment 則使用受保護的 GitHub Environment，依序執行 migration、deploy 與 health check。這部分本次只保留為後續建議，尚未建立 workflow。

---

## 建立短網址 API：從一句需求到 TDD、Postman 驗證與架構檢討

完成 Neon、Hyperdrive、KV 與 Redirect 基礎後，我用一句很直接的需求開啟下一個 session：

> 「我想建立後端API 要用ZOD也要使用TDD 要記得分開middleware檔案」

這次的重點不是讓 AI 自由決定一整套 API，而是由我逐步鎖定範圍。我選擇先完成 `POST /api/short-urls`，短碼由系統自動產生，暫時不串接前端，也不加入自訂短碼、修改或刪除 API。

我要求 Zod schema、request validation 與 handler 分開，但不把驗證做成 Nuxt 全域 middleware。最後採用 route-scoped wrapper：由 `POST /api/short-urls` 明確套用共用 validation helper，避免 Redirect 與 health endpoint 也被迫解析 request body。

這個要求最後形成清楚的責任分工：

| 檔案角色             | 責任                                                     |
| -------------------- | -------------------------------------------------------- |
| API handler          | 組裝依賴、呼叫建立流程、設定 HTTP status 與成功 response |
| Zod schema           | 定義並正規化 `{ originalUrl }`                           |
| Validation helper    | 讀取 JSON body、執行 `safeParse`、產生穩定的 400 error   |
| Short-code service   | 使用 Web Crypto 產生 8 字元 Base62 短碼                  |
| Creation service     | 協調短碼產生、碰撞重試與建立流程                         |
| Repository           | 封裝 PostgreSQL insert、lookup 與 unique constraint 判斷 |
| Mutation coordinator | 維持 PostgreSQL 與 KV 的寫入順序                         |
| Response mapper      | 將內部例外轉成不洩漏敏感資訊的 500／503 response         |

實作完成後，我也主動依檔名與資料夾結構逐一描述這些檔案的用途，再請 AI 對照實際程式確認。這個步驟讓我發現兩個容易誤會的地方：短碼 service 只負責產生候選值，不查資料庫；response mapper 目前只處理錯誤，成功 response 仍由 handler 組裝。

### 用 Spectra 與 TDD 推進實作

需求收斂後，我依序下達：

```text
$spectra-propose
$spectra-apply
```

Spectra change `add-short-url-api` 將需求整理成 proposal、design、specs 與 tasks。實作採 Red → Green → Refactor：

1. 先建立 Zod middleware、Base62 generator、collision retry 與 API contract 的失敗測試。
2. 確認測試因 production module 尚不存在而失敗。
3. 加入最小實作讓目標測試通過。
4. 集中整理 public error mapping，再執行完整 Vitest 與 Nuxt Cloudflare build。

這次完成的行為包括：

- `POST /api/short-urls` 只接受 strict `{ originalUrl }`。
- URL 會 trim，長度上限為 2048，只允許絕對 HTTP(S) URL。
- 使用 Web Crypto 與 rejection sampling 產生 8 字元 Base62 code。
- 由 PostgreSQL unique constraint 判斷碰撞，最多嘗試五次。
- PostgreSQL 建立成功後主動同步 KV。
- 回應使用固定的 201、400、500 與 503 contract，且不公開 SQL、連線資訊或 stack trace。

### 我要求用 Postman 驗證真正的 HTTP 行為

自動化測試與 build 通過後，我沒有只停在 test result，而是追問：

> 「我要如何在本地測試 by postman」

我先透過本機 Cloudflare Worker 送出建立請求，取得短碼與本機 `shortUrl`，再用 Postman 對短碼發送 GET。因為 Postman 預設會自動跟隨 Redirect，我關閉 request-level 的 `Automatically follow redirects`，最後直接看到：

```text
302 Found
Location: https://example.com/article
```

回應 body 同時包含 Nitro/H3 產生的 HTML meta refresh。這次手動驗證補上了自動化 handler test 沒有呈現的完整使用流程：

```text
POST 建立短網址
        ↓
PostgreSQL／KV
        ↓
GET /<code>
        ↓
302 Redirect
```

### 面對 review comment，我先要求評估而不是直接修改

後續 review 指出 mutation 先刪除 KV、再修改資料庫時，並行 Redirect 可能讀到舊資料並排程 backfill。我請codex評估一下：

分析時發現，DB-first 的確能縮小由主動刪除造成的 race window，卻不能完全阻止已在途的舊 backfill 最後覆蓋新值。若要真正消除這個問題，需要停止 Redirect-side backfill，或引入版本與強一致性仲裁；單純交換兩行順序不足以提供完整保證。

理解代價後，我決定：

### 本次 session 的結果分類

| 狀態           | 內容                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 已完成         | Zod strict validation、route-scoped middleware、短碼產生、碰撞重試、建立 API、錯誤遮蔽、自動化測試、Nuxt build、Postman 201／302 驗證、Spectra 封存 |
| 已評估但未修改 | mutation 與 Redirect backfill 之間的 KV race condition                                                                                              |

最後我執行：

```text
$spectra-archive add-short-url-api
```

這次協作讓我再次確認：AI 最有價值的地方不是替我快速接受 review 建議，而是把建議放回完整時序中檢查。看似合理的「先改 DB 再刪快取」仍可能漏掉在途 backfill；先要求評估，再決定是否承擔複雜度，比直接修改更符合這個 MVP 的範圍。

---

## AI 哪些地方沒有一次答對？

AI 的第一版 proposal 把焦點放在 PostgreSQL driver 與 Hyperdrive，卻沒有先回答 Redirect 熱路徑是否應直接查資料庫。這不是單純缺少一個套件，而是缺少整個 cache hierarchy、negative caching、mutation invalidation 與 outage policy。

這次協作中，AI 真正有價值的部分包括：

- 從儲存庫找出可驗證的現況。
- 比較可行方案。
- 查閱 Cloudflare、Neon 與 Nuxt 官方文件。
- 把口頭討論轉成 proposal、design、specs 與 tasks。
- 用 analyzer 檢查規格覆蓋率與一致性。

但人仍然需要：

- 質疑 AI 使用了哪些前提。
- 區分舊文件與現行部署。
- 指出真正的熱路徑。
- 決定正確性、可用性、成本與複雜度之間的取捨。
- 確認哪些限制可以接受。

---

## 如何驗證 AI 的回答

這次實際採用的流程是：

```text
提出問題

↓

AI 掃描專案並提出初版回答

↓

要求 AI 說明判斷依據

↓

用反例與真實流量路徑挑戰設計

↓

查閱官方文件

↓

把取捨寫成明確規格

↓

執行 Spectra analyze / validate

↓

實作、runtime 驗證與測試
```

我不會把 AI 的回答直接視為完成結果。對部署方式、KV 一致性、免費額度及 driver 相容性這類會隨平台更新的資訊，應以官方文件和實際環境為準。

---

## 心得

把 AI 當成協作工具，並不是讓它替我決定所有事情，而是利用它快速展開決策樹，再由我逐項確認。

這次最重要的收穫不是「應該安裝哪些套件」，而是學會把問題從：

> 哪個 PostgreSQL driver 比較快？

往前推成：

> Redirect 熱路徑為什麼需要碰 PostgreSQL？

當問題問對後，Hyperdrive、KV、負向快取與點擊記錄的位置才會自然清楚。AI 能加快這個過程，但架構品質仍取決於工程師是否願意追問、驗證並承擔最後的取捨。

---

# 系列總結

## 專案技術

### 目前已使用

- Nuxt 4
- Vue 3
- TypeScript
- Tailwind CSS
- Cloudflare Worker 動態部署

### 本次新增並已實作

- Cloudflare KV
- Neon PostgreSQL
- Cloudflare Hyperdrive
- Drizzle ORM
- Zod
- Vitest

## 讀者收穫

閱讀完本系列後，可以學到：

- 如何規劃 Nuxt 全端專案架構。
- 如何設計短網址與安全的 Short Code。
- 如何區分 PostgreSQL source of truth 與 Edge cache。
- 如何設計正向、負向快取及主動失效。
- 如何明確定義 outage 與最終一致性行為。
- 如何查證 AI 對雲端平台與套件的建議。
- 如何把討論轉成可分析、可驗證的 Spectra 規格。
- 如何在開發中有效運用 AI，而不是直接複製答案。
