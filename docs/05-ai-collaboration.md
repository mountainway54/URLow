# 系列五：AI 如何協助我完成這個專案

這次開發 URLow，我沒有只用一句需求要求 AI 直接完成所有程式。我的做法是保留每次 Prompt，觀察 AI 根據什麼做判斷，再透過下一個 Prompt 補充脈絡、挑戰假設、縮小範圍，最後才讓它進入實作。

我也使用 `grill-me` 與 `grilling` skill，要求 AI 一次只問一個問題。能從儲存庫找到的事實由 AI 自行檢查，會影響產品與架構的決策則由我逐項確認。

這篇文章保留實際使用的 Prompt，重點不是展示 AI 產生了多少程式碼，而是記錄我如何透過 Prompt 推進整個專案。

---

## 一、從模糊需求補足專案脈絡

一開始，我只問了一個很寬泛的問題：

> 「請幫我看看我有哪些套件可以先安裝」

AI 開始檢查現有專案，從 `package.json`、README 與原始碼確認已安裝的工具，以及文件中規劃但尚未加入的 PostgreSQL、Drizzle ORM、Zod 與 Vitest。

討論部署方式時，AI 根據舊文件認為 Cloudflare 使用靜態輸出。我沒有直接接受，而是追問判斷依據：

> 「哪可以看得出來 部署指令是nuxt generate」

這個 Prompt 把問題從「AI 認為怎麼部署」改成「儲存庫中的哪一項證據支持這個判斷」。檢查後發現，文件記錄的是早期 Cloudflare Pages 的設定，不是目前外部平台的真實狀態。

因此我再補充正確脈絡：

> 「修改 docs/06-debug-log.md 記載的是過去或已過期的部署方式 目前部署的是 Cloudflare Worker 動態版本」

確認執行環境後，我才指定下一步架構：

> 「Cloudflare Workers + 外部 PostgreSQL(neon) + Hyperdrive」

這個階段的成果不是立刻安裝套件，而是先讓 AI 取得正確的專案現況。若部署前提錯誤，後面的 driver、資料庫連線與建置方案也會一起偏離。

---

## 二、用追問修正 Redirect 架構

第一版 proposal 將 Neon 作為 PostgreSQL，並規劃由 Cloudflare Hyperdrive 提供正式環境連線。看到這個方案後，我先問：

> 「Hyperdrive是必要的嗎」

AI 比較了 Hyperdrive 與 Neon serverless driver，說明 Hyperdrive 的價值在連線池與跨區連線最佳化。不過這仍然只是在比較「如何連資料庫」，尚未回答短網址最常發生的 Redirect 是否需要查資料庫。

因此我直接挑戰 proposal 的核心假設：

> 「真正該質疑的是你的 proposal 本身少了一個更關鍵的架構決策：redirect 到底要不要直接打 Postgres？」

我再把想要的資料路徑說得更具體：

> 「短網址系統的標準做法是把『短碼 → 目標網址』這種讀多寫少、幾乎不變的資料放到 Cloudflare KV 或 Cache API 做邊緣快取，Postgres 只在 cache miss、建立短網址、或寫入點擊記錄時才碰。如果你這樣設計，Hyperdrive vs serverless driver 的效能差異對整體延遲的影響會小很多，因為熱路徑根本不打資料庫。」

這兩個 Prompt 將討論焦點從 driver 效能改成完整讀取階層。最後的方向是：

- Redirect 先查 Cloudflare KV。
- KV miss 才透過 Hyperdrive 查詢 Neon。
- PostgreSQL 保持 source of truth。
- KV 命中時不建立 PostgreSQL 連線。

接著我要求處理不存在的短碼：

> 「負向快取（不存在的短碼）：Postgres 查無資料時，也要在 KV 寫一筆短 TTL 的『不存在』標記，避免短碼掃描/亂猜流量每次都繞過快取直接打資料庫。」

AI 因此把 KV value 分成 `redirect` 與 `missing`。合法短碼查無資料時寫入 60 秒的負向快取；格式不合法則直接回 `404`，不讀取 KV 或 PostgreSQL。

這個階段最重要的改變，是我沒有繼續追問哪個 PostgreSQL driver 比較快，而是先用 Prompt 重新定義哪些請求根本不應碰 PostgreSQL。

---

## 三、用 Prompt 鎖定快取與故障行為

決定使用 KV 後，下一個問題是資料更新時如何避免舊 Redirect 持續存在。我提出：

> 「主動失效優先於 TTL：短網址內容不會自然過期，建議不設 TTL、改成更新或刪除短網址時在同一次操作中主動呼叫 KV delete/overwrite，避免使用者改了目標網址後，舊快取值在 TTL 到期前持續導向錯誤位置（這是正確性問題，不只是效能問題）。」

正向快取因此不依賴 TTL，而是在建立、更新、停用或刪除短網址時主動同步。我另外補充建立流程也要處理既有負向快取：

> 「建立短網址時，這次寫入也應該主動覆寫 KV」

原因是同一個短碼可能先被掃描並留下 `missing`。建立成功後必須立即 overwrite，不能等待負向快取自然過期。

主動同步仍無法讓 Cloudflare KV 變成強一致資料庫。確認官方文件描述的跨區傳播限制後，我接受：

> 「好的 我接受 KV 主動 overwrite/delete 後，跨區仍可能有約 60 秒以上的最終一致性視窗」

這項限制被明確寫入規格，沒有交給實作者自行猜測，也沒有為了 MVP 引入 Durable Object。

我接著限制點擊記錄不能破壞熱路徑：

> 「點擊記錄要非同步、不能卡在 hit 路徑上：如果 KV 命中後還要同步寫一筆 Postgres 記錄點擊，快取省下的延遲等於白費。要嘛用 Queue／Analytics Engine 等非同步方式記錄，要嘛這次 MVP 明確先不做點擊記錄，兩者擇一要寫清楚。」

本次 MVP 最後不做點擊記錄。KV 命中只負責回傳 Redirect，不同步寫 PostgreSQL，也不在未定義規格下加入 Queue 或 Analytics Engine。

資料庫故障時的行為同樣不能模糊：

> 「Postgres 不可用時的降級策略要選定：是直接回 5xx（正確性優先），還是允許讀 KV 裡的舊值當退化方案（可用性優先、但有極小機率回傳已失效的舊目標），這個取捨要明寫進 capability，不能留給實作者自行決定。」

最後決定有效 KV hit 照常服務；只有 cache miss、無效 value 或 KV 讀取失敗且 PostgreSQL 同時不可用時回 `503`。系統不另外保存 stale backup。

我也把費用納入架構討論：

> 「KV服務需要額外收費嗎」

AI 查閱 Cloudflare 官方資料後，確認 Free plan 有 reads、writes、deletes 與儲存額度。這讓 MVP 可以先使用 KV，但大量合法短碼掃描仍可能消耗負向快取 write quota，因此風險必須留在規格與監控中。

這些 Prompt 沒有要求 AI 寫某一個函式，而是逐項固定一致性、故障、分析功能與成本邊界。等到行為不再模糊後，我才把討論轉成 Spectra change `add-cloudflare-neon-hyperdrive`。

實作時使用：

```text
$spectra-apply add-cloudflare-neon-hyperdrive
```

AI 依 proposal、design、specs 與 tasks 完成 Neon、Hyperdrive、KV read-through Redirect、migration、health endpoint 與測試；需要登入、connection string 或本機秘密的步驟仍由我操作。實際 runtime 若推翻原設計，就先更新 Spectra artifacts，再繼續 apply。

---

## 四、用 Prompt 推進 API、TDD 與實際驗證

完成資料庫與 Redirect 基礎後，我用一句 Prompt 指定下一個垂直功能與開發方式：

> 「我想建立後端API 要用ZOD也要使用TDD 要記得分開middleware檔案」

這句 Prompt 同時限制了功能與實作方法：

- 先完成 `POST /api/short-urls`。
- 使用 Zod 定義輸入契約。
- 驗證 middleware 與 route handler 分開。
- 採 Red → Green → Refactor。
- 暫時不加入前端、自訂短碼、修改或刪除 API。

需求收斂後，我依序執行：

```text
$spectra-propose
$spectra-apply
```

AI 先建立失敗測試，再補上 route-scoped validation、8 字元 Base62 短碼、碰撞重試、PostgreSQL insert、KV 同步與安全錯誤回應。這些實作細節由 Spectra specs 與測試固定，文章不逐一展開檔案內容。

自動化測試與 build 通過後，我沒有只接受測試結果，而是要求驗證完整 HTTP 流程：

> 「我要如何在本地測試 by postman」

我使用本機 Cloudflare Worker 建立短網址，再關閉 Postman 的自動 Redirect，直接確認 `302 Found` 與 `Location`。這讓驗證從單一 handler test 延伸到「建立 → PostgreSQL／KV → GET 短碼 → Redirect」的真實路徑。

後續 review 指出 mutation 與 Redirect backfill 可能存在競態。我沒有看到建議就立刻改動，而是先要求 AI 分析完整時序。分析結果顯示，單純交換 DB 與 KV 的操作順序仍無法阻止已在途的舊 backfill；若要完全解決，需要加入版本或強一致仲裁。

理解代價後，我決定把這項 race condition 保留為已知限制，不在本次 MVP 擴大架構。最後封存 change：

```text
$spectra-archive add-short-url-api
```

這一階段的 Prompt 從需求、開發方法一路延伸到實際 HTTP 驗證與 review 評估。AI 負責展開方案與執行測試，我負責決定本次要做到哪裡。

---

## 五、主動縮小範圍，再完成管理驗證

下一個 session 原本準備把前端假資料換成真實 API：

> 「接下來我想將前端的假資料改成真實的 API」

AI 掃描前端與後端後發現，表單中的密碼、備註與啟用狀態尚未存在於 API 與資料表。如果直接串接，前端會把沒有真正保存的欄位顯示成成功。

因此我中途改變優先順序：

> 「這個 session 先做擴充資料庫欄位好了」

這個 Prompt 主動縮小了本次變更。該 session 只處理 `management_password_hash`、`note`、`enabled` 與 `updated_at`，不順便加入管理 API、Redirect `410` 或前端串接。

共同理解確認後，我依序執行：

```text
$spectra-propose
$spectra-apply
$spectra-archive extend-short-url-metadata-schema
```

AI 依規格完成 schema、forward migration 與測試。舊資料保留 `created_at`，並以原建立時間回填 `updated_at`；管理密碼與備註保持 `NULL`。這些實作細節被壓縮成結果，重點是我透過 Prompt 阻止一個前端需求同時擴張成多個尚未定義的後端能力。

資料欄位準備完成後，我才回到管理 API：

> 「接下來，我想實作縮網址 API 增加密碼與備註欄位，同時實作 bcrypt 密碼雜湊與管理驗證」

我再次使用 `grill-me`，讓 AI 一次只問一個會影響契約的問題。討論逐項確認：

- bcrypt 密碼只保護管理操作，不影響公開 Redirect。
- 管理密碼選填；未設定時永久不可管理。
- 密碼不支援補設、輪替或重設。
- 使用 `X-Management-Password` Header。
- bcrypt 使用 cost 10，並拒絕超過 72 UTF-8 bytes 的輸入。
- 管理驗證依來源 IP 與短碼限流，每 60 秒最多 10 次。
- 管理 GET 與 strict PATCH 分別負責讀取及更新私人資料。
- 停用短網址回 `410 Gone`。
- 本次仍不串接前端，也不新增刪除 API。

討論收斂後，我建立並套用新的 Spectra change：

```text
$spectra-propose add-short-url-management-api
```

```text
$spectra-apply add-short-url-management-api
```

Apply preflight 曾發現 proposal 寫錯測試路徑。我先修正 artifacts 並重新 validate，確認 preflight clean 後才繼續。最後完成 `bcryptjs`、管理 GET／PATCH、Rate Limiting binding、KV `gone` 狀態、Redirect `410` 與自動化測試。

完成實作後，我又要求 AI 把手動驗證寫成可重現計畫，涵蓋建立、管理查詢、更新、停用、重新啟用、密碼邊界、錯誤狀態、限流與敏感資訊檢查。

---

## 六、用逐題決策把前端假資料換成真實 API

後端管理能力完成後，我回到先前暫停的前端串接：

> 「我要把前端的假資料換成真實API」

這次我再次使用 `grill-me`，要求 AI 不要直接把現有 mock 行為逐字翻譯成 API request，而是逐題確認哪些前端行為應該保留、修改或移除。討論過程中，我先移除後端契約不支援的功能：

> 「移除『修改密碼』欄位」

管理頁因此只允許修改原始網址、備註與啟用狀態。查詢時仍輸入既有管理密碼，但密碼不會出現在 PATCH body，也不提供補設、修改或重設功能。

接著，我補充一個實際的版面問題：

> 「我發現啟用短網址開關沒有跟長網址input對齊」

最後不是用固定像素硬推位置，而是讓標籤與控制項使用相同的 layout tracks。桌面版讓啟用開關與原始網址 input 的控制邊界對齊，手機版則改為單欄全寬。AI 以 1440 與 375 CSS pixels 的瀏覽器 viewport 檢查水平溢位與互動目標尺寸。

錯誤處理方面，我沒有接受統一顯示「操作失敗」，而是要求：

> 「精確錯誤提示」

因此前端建立集中式 API boundary，先正規化 HTTP status、穩定 error code 與 validation issues，再由表單顯示繁體中文訊息。欄位驗證會對應到原始網址、管理密碼或備註；未識別或格式異常的錯誤則顯示通用服務訊息，不直接曝露 raw exception、server stack 或基礎設施內容。

討論更新後的 KV 一致性提示時，我先問：

> 「時間會差到多少」

但精確寫成「60 秒或更久」容易讓使用者把它誤解成承諾，因此我要求：

> 「舊設定可能持續約 60 秒或更久。寫的更模糊」

再補充提示必須表達問題來自跨區同步：

> 「要寫跨區」

最後採用的文案是：

> 「設定已儲存，跨區同步可能需要一些時間才會完全生效。」

這段訊息只在 PATCH 已成功寫入、但 API 回傳 `cacheSynchronized=false` 時顯示。它代表資料已保存，只是不同地區的 Redirect 結果可能暫時尚未一致，不應被呈現成整次操作失敗。

對建立與修改流程，我選擇不同的互動策略。建立與查詢會等待 API response，pending 時停用控制項並分別顯示「建立中…」或「查詢中…」，避免重複 request。修改則採用：

> 「做樂觀更新」

前端送出 PATCH 時立即保留使用者剛修改的畫面，同時保存最後一次由伺服器確認的 snapshot。若 PATCH 失敗，原始網址、備註與啟用狀態會一起 rollback；成功時則以 response 更新 snapshot。為避免多個 request 的回應順序互相覆蓋，儲存期間不允許重疊 PATCH。

建立流程的細節也逐項確認。提交時按鈕顯示：

> 「建立中」

管理密碼仍是選填，但空白時必須持續顯示「未設定管理密碼，建立後將無法修改此短網址」。我另外明確要求：

> 「不要跳確認視窗」

所以這項不可逆決策使用表單內的持續提示，而不是提交後才用 modal 阻斷操作。管理查詢則同時接受 8 碼 Base62 短碼，或最後一段為該短碼的完整 HTTP(S) URL；格式不符時不發出 request。

需求收斂後，我依序建立並套用 Spectra change：

```text
$spectra-propose
$spectra-apply connect-frontend-to-short-url-api
```

AI 完成 typed API composable、建立表單、受保護管理查詢、樂觀 PATCH、錯誤映射、跨區提示、mock 移除與響應式版面測試。首頁不再載入 seed records，也不再產生 `demo-*` 短碼；重新整理後，資料來源只剩真實 API。

本機整合測試時，建立短網址成功，但管理查詢曾出現：

```text
GET http://127.0.0.1:8787/api/short-urls/3O1wYbx9/management 503 (Service Unavailable)
```

這次我沒有把 `503` 當成前端錯誤直接改掉。AI 比較有無 `CF-Connecting-IP` 的 request，確認本機 Wrangler request 缺少 Cloudflare 注入的可信來源 IP，因此管理限流 identity 在進入資料庫與 bcrypt 前依安全設計 fail closed。解法也不是讓瀏覽器偽造 `CF-Connecting-IP`，而是只由專案的本機 dev wrapper 注入精確的 `URLOW_LOCAL_DEV=true` marker；管理 GET／PATCH 僅在缺少可信 IP 且 marker 完全符合時使用固定的 `local-dev` identity。正式或未標記環境仍維持 `503`，可信 Cloudflare IP 存在時也永遠優先。

修正後，我重新以真實 HTTP 流程手動驗證建立、查詢與修改，確認成功，再完成完整測試、型別檢查與 Spectra 驗證。最後同步 delta specs 並封存：

```text
$spectra-archive connect-frontend-to-short-url-api
```

這次前端串接的重點並不是把 `$fetch` 塞進元件，而是先用 Prompt 決定不可逆提示、精確錯誤、樂觀更新與 rollback、跨區一致性文案，以及本機開發例外不能削弱正式環境安全邊界。自動化測試證明元件與契約一致，最後仍由我透過實際建立與修改完成端到端驗證。

整個過程並不是用一段 Prompt 要 AI「完成短網址系統」，而是透過一連串 Prompt 逐步提供脈絡、要求證據、挑戰架構、限制範圍並指定驗證方式。AI 加快了探索與實作，但每一次真正改變系統方向的取捨，仍由我透過下一個 Prompt 明確做出。
