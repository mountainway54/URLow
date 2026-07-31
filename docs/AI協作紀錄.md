# AI 協作紀錄

URLow 主要用 Codex 開發，Spectra 保存規格和工作項目，少數架構判斷再交給 Claude 複核。我沒有丟一句「幫我做完」就直接採用結果，而是先問清楚需求，再決定要不要實作。

實際流程通常是：

```text
Grill Me 一次問一個問題
        ↓
Spectra 寫 proposal、design、spec 和 tasks
        ↓
Codex 實作與跑自動化測試
        ↓
我用 Postman、瀏覽器手動操作
        ↓
另開 Session Review，必要時請 Claude 複核
```

下面保留幾段真正影響專案方向的 Prompt。

## 先確認專案現況

一開始我問：

> 「請幫我看看我有哪些套件可以先安裝」

AI 從 `package.json` 和文件整理出已安裝與預計使用的套件。討論部署時，它根據舊文件判斷專案使用 `nuxt generate`。我沒有直接接受，先追問：

> 「哪可以看得出來 部署指令是nuxt generate」

查完才發現，那是早期 Cloudflare Pages 的紀錄。目前真正要跑的是動態 Worker，所以我補上：

> 「修改 docs/除錯紀錄.md 記載的是過去或已過期的部署方式 目前部署的是 Cloudflare Worker 動態版本」

確認這點後，資料庫方向才定成：

> 「Cloudflare Workers + 外部 PostgreSQL(neon) + Hyperdrive」

這次經驗讓我後來多了一個習慣：AI 引用專案現況時，要能指出檔案和程式碼，不只給結論。

## Redirect 不該每次都查資料庫

第一版規劃把焦點放在 Hyperdrive 和 PostgreSQL driver。我覺得問題問錯了，於是改問：

> 「真正該質疑的是你的 proposal 本身少了一個更關鍵的架構決策：redirect 到底要不要直接打 Postgres？」

最後採用的讀取順序是 KV → Hyperdrive → Neon。熱門短網址直接從 KV 回 `302`，只有 cache miss 才連資料庫。

不存在的短碼也會造成資料庫流量，所以我補了一條：

> 「Postgres 查無資料時，也要在 KV 寫一筆短 TTL 的『不存在』標記，避免短碼掃描/亂猜流量每次都繞過快取直接打資料庫。」

因此 KV 有 `redirect`、`missing` 和 `gone` 三種狀態。`missing` 只保存 60 秒；格式不合法的短碼則直接回 `404`，連 KV 都不查。

## 先決定快取失效和故障行為

短網址修改後，舊目標不能一直留在 KV。我提出：

> 「主動失效優先於 TTL：短網址內容不會自然過期，建議不設 TTL、改成更新或刪除短網址時在同一次操作中主動呼叫 KV delete/overwrite。」

建立連結也會直接覆寫 KV，避免同一個短碼先前留下的 `missing` 繼續生效。

Cloudflare KV 是最終一致。Overwrite 或 delete 後，其他區域仍可能短暫讀到舊值。我接受這個限制，沒有為了消除這段時間再加 Durable Object。

PostgreSQL 故障時也要先講清楚。最後的規則是：有效的 KV hit 照常 Redirect；cache miss 且資料庫不可用時回 `503`。系統不拿過期副本假裝是最新資料。

點擊統計則先不做。若 KV hit 後還要同步寫 PostgreSQL，快取省下的時間又被寫入拖回去；要做時應改用 Queue 或 Analytics Engine，而不是順手塞進 Redirect。

這些決定收進 Spectra change：

```text
$spectra-apply add-cloudflare-neon-hyperdrive
```

## 用 TDD 完成建立 API

資料庫與 Redirect 完成後，我下的需求是：

> 「我想建立後端API 要用ZOD也要使用TDD 要記得分開middleware檔案」

這次只做 `POST /api/short-urls`。先寫失敗測試，再加入 Zod request schema、8 字元 Base62 短碼、碰撞重試、PostgreSQL insert 和 KV 同步。驗證 middleware 另外放一個檔案，route handler 不自己重複解析錯誤格式。

自動化測試通過後，我再問：

> 「我要如何在本地測試 by postman」

我用本機 Worker 建立短網址，關掉 Postman 的自動 Redirect，確認 response 是 `302 Found`，`Location` 也指向原始網址。這一步抓的是完整 HTTP 路徑，不只是單一函式。

Review 後發現 mutation 和 Redirect backfill 之間仍可能有競態。單純調換 DB 與 KV 的寫入順序無法完全消除，真的要處理得加入版本或強一致仲裁。這超出 MVP，所以我把它留下作為已知限制，沒有假裝一個小改動就能解決。

## 先補資料欄位，再做管理 API

準備把前端假資料換成 API 時，AI 發現密碼、備註和啟用狀態還沒存在資料庫。如果直接串接，畫面會顯示成功，但資料其實沒保存。

我因此把工作縮小：

> 「這個 session 先做擴充資料庫欄位好了」

該次 change 只加入 `management_password_hash`、`note`、`enabled` 和 `updated_at`。前端和管理 API 留到下一次。

接著才提出：

> 「接下來，我想實作縮網址 API 增加密碼與備註欄位，同時實作 bcrypt 密碼雜湊與管理驗證」

Grill Me 逐項確認後，管理規則定為：

- 密碼只保護管理操作，不影響公開 Redirect。
- 密碼選填；建立時沒設定，之後就不能管理。
- 不提供補設、重設或更換密碼。
- 密碼放在 `X-Management-Password` Header。
- bcrypt cost 是 10，輸入不可超過 72 UTF-8 bytes。
- 依來源 IP 與短碼限流，每分鐘最多 10 次。
- 停用的短網址回 `410 Gone`。

這次實作管理 GET、PATCH、Rate Limiting binding 和 KV `gone` 狀態，沒有偷偷多加刪除 API。

## 把前端假資料換成真實 API

後端完成後，我回到：

> 「我要把前端的假資料換成真實API」

現有畫面有「修改密碼」，但後端契約不支援，所以直接移除，不把前端欄位硬接成不存在的功能。

錯誤訊息也沒有全部寫成「操作失敗」。前端會依 HTTP status、error code 和 Zod issues 顯示對應的繁體中文內容；未識別的錯誤才使用通用訊息，raw exception 不會直接出現在畫面。

修改表單採樂觀更新：送出後先保留使用者看到的新值，失敗才退回上一次由 Server 確認的 snapshot。儲存期間不接受第二個 PATCH，避免較慢的舊 response 蓋掉新結果。

KV 跨區同步的提示原本寫得太像時間保證。我最後改成：

> 「設定已儲存，跨區同步可能需要一些時間才會完全生效。」

本機測試管理 API 時曾收到 `503`。原因不是前端 request，而是 Wrangler 沒有正式環境的 `CF-Connecting-IP`，Rate Limiter 無法取得可信 identity。修法是在專案的 dev wrapper 注入 `URLOW_LOCAL_DEV=true`，只有本機且缺少可信 IP 時才使用固定的 `local-dev`。正式環境仍然 fail closed，瀏覽器也不能靠偽造 Header 繞過判斷。

## 我怎麼驗證 AI 的結果

每個 change 至少會做這幾件事：

1. 跑 Vitest、typecheck 和 build。
2. 用 Postman 或瀏覽器走一次真實流程。
3. 另開 Session Review，不讓同一段對話只檢查自己的結論。
4. 遇到架構取捨時，要求列出時序、失敗情境和修改代價；仍不確定才請 Claude 複核。

AI 幫我加快查找、寫測試和整理規格，但是否擴大範圍、接受哪個限制，以及功能算不算完成，最後仍由我決定。
