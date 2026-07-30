# 從零打造縮網址網站｜架構設計與技術選型

這次的題目是實作一個簡單版縮網址網站。介面不需要完全復刻參考畫面，重點是完成核心功能，並透過 Git、README 與 AI Prompt 紀錄呈現完整的開發過程。因此，我不會一開始就追求大量功能，而是先定義可交付、可測試、可部署的 MVP。

## 從需求拆解 MVP

使用者輸入一組原始網址後，系統必須驗證網址、產生不重複的短碼，並回傳可分享的短網址。當其他人造訪短網址時，伺服器會根據短碼找回原始網址，再以 HTTP Redirect 將使用者導向目標網站。

預計包含功能：

- 建立短網址
- 透過短碼重新導向
- 顯示輸入錯誤與查無短碼等狀態

## 為什麼選擇 Nuxt

專案目前以 Nuxt 4、Vue 與 TypeScript 建立。Nuxt 不只能開發前端頁面，也能透過 Server API 處理資料驗證、資料庫存取與 Redirect。對這類規模不大的作品而言，使用同一個專案管理前後端，可以減少跨專案設定、部署與型別同步的成本。

在目前固定的需求範圍下，Nuxt 全端架構是開發效率與可維護性之間較合適的選擇。

## 從 JavaScript 過渡到輕量 TypeScript

我先前主要學習 JavaScript，因此這次不會刻意使用複雜泛型或高階型別，而是採用「輕量 TypeScript」：保留熟悉的 JavaScript 寫法，只在函式參數、API 回應與資料模型等重要位置加入型別。例如將網址標示為 `string`，並為建立短網址的回應定義簡單的 `interface`。

選擇 TypeScript 並不是為了增加技術難度，而是希望透過實際專案邊做邊學。縮網址網站的功能範圍明確，資料流也不複雜，很適合練習如何替前端表單、Server API 和資料庫資料補上型別。開發時若出現型別錯誤，我會先理解 TypeScript 對資料的判斷，再修正設計，而不是直接使用 `any` 略過問題。

這種方式既能沿用既有的 JavaScript 基礎，也能逐步體會型別檢查在重構、API 串接與避免拼字錯誤上的幫助。第一版以「看得懂、能維護」為原則；等熟悉基本型別、`interface`、聯合型別和可選欄位後，再視需求學習更進階的語法。

## 其他技術選型

UI 採用 Tailwind CSS 搭配原生 CSS：一次性的排版使用 Tailwind，共用的色彩、字級與動態效果則保留在 CSS。後續基礎設施階段已導入 Neon PostgreSQL、Cloudflare Hyperdrive、Drizzle ORM、Zod、Cloudflare KV、Wrangler 與 Vitest。

## 系統架構與資料流

```text
Browser
   │ GET /:code
   ▼
Cloudflare ES Module Worker
   │
   ├── SHORT_URL_CACHE hit ───────────────▶ 302 / 404
   │
   └── miss → HYPERDRIVE → Neon PostgreSQL
                         │
                         └───────────────▶ 302 / 404 / 503
```

預計依照責任拆分目錄：

```text
app/        # 頁面與 UI 元件
server/     # API、Redirect Route 與伺服器邏輯
database/   # Schema、連線與 Migration
utils/      # 短碼產生及共用驗證
tests/      # 單元測試與 API 測試
```

前端只負責收集輸入與呈現結果，網址是否合法、短碼是否重複等判斷仍由伺服器執行，避免使用者繞過前端驗證。

## 資料表與 API 設計

MVP 的核心資料表為 `short_urls`，只保存 `id`、`original_url`、具唯一限制的 `code` 與 `created_at`。其中 `code` 需要建立 Unique Index，既能阻止重複短碼，也能加速 Redirect 時最頻繁的查詢。

對外介面規劃如下：

```http
GET /:code
GET /api/health/database
```

目前只對外提供 Redirect 與 database health。建立／編輯／停用／刪除僅定義內部 mutation 與 cache synchronization contract，不提供公開 API。Redirect 只接受 `[A-Za-z0-9_-]{4,32}`；無效或不存在回 `404`，KV 與 PostgreSQL 都無法提供結果時回 `503`。

## Worker deployment 與一致性邊界

正式輸出使用 Nitro `cloudflare_module` preset、Wrangler Workers Assets、`nodejs_compat` 與 external `cloudflare:sockets`。舊版 Cloudflare Pages `npm run generate` 是歷史部署方式，目前使用 `npm run build` 與 `npm run deploy`。

PostgreSQL 是 source of truth。KV 正向 value 不設 application TTL；mutation 主動 overwrite/delete。KV 跨區為最終一致，其他區域可能約 60 秒或更久仍讀到舊值。合法短碼查無時寫入 60 秒負向 value；Free plan 每日 1,000 次 writes 的耗盡風險需監控，但本階段不加入 Rate Limiting 或 Durable Object。

## 開發與交付規劃

開發過程會依功能切分 Git commit，例如建立介面、加入短碼 API、完成 Redirect 與補充測試，讓版本紀錄能說明設計演進，而不是最後一次提交全部內容。README 將包含功能說明、安裝步驟、環境變數、測試方式、技術選型及部署連結；若使用 AI 協助設計 Schema、測試案例或整理文件，也會保留實際 Prompt 與人工驗證方式。

完成 MVP 後會評估部署至雲端平台，並視時間錄製實作過程。這套規劃的核心是在固定範圍內交付一個功能完整、結構清楚的縮網址網站。
