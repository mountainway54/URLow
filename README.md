<div align="center">

# URLow

### 把冗長網址，變成簡潔好分享的連結

一個以 Nuxt 打造的現代化縮網址服務。目前具備可操作的前端介面、Cloudflare Worker 動態 runtime、Neon PostgreSQL 基礎 schema，以及 KV read-through Redirect；對外建立／編輯／刪除 API 仍在開發中。

![Nuxt](https://img.shields.io/badge/Nuxt-4.5-00DC82?logo=nuxtdotjs&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Lightweight-3178C6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-F59E0B)

</div>

> [!NOTE]
> URLow 目前處於開發階段。響應式介面仍使用本機假資料；`GET /:code` Redirect 與資料庫健康檢查已實作，但尚未提供對外 mutation API 或前端後端串接。

## 目前功能

- **建立短網址**：輸入長網址、密碼與備註，即可產生本機展示用短連結。
- **修改短網址**：使用短網址與密碼查詢假資料，修改啟用狀態、密碼及備註。
- **本機 UI 狀態**：資料只保留在目前頁面，重新整理後回復預設假資料。
- **響應式介面**：支援桌面與行動裝置。

## 預計完整使用流程

```text
輸入原始網址
      │
      ▼
驗證網址並產生唯一短碼
      │
      ▼
儲存至 PostgreSQL
      │
      ▼
取得可分享的短網址
      │
      ▼
造訪短網址 → 302 Redirect → 原始網站
```

## 技術架構

| 類別                 | 技術                | 用途                                   |
| -------------------- | ------------------- | -------------------------------------- |
| Full-stack Framework | Nuxt 4              | 頁面、Server API 與動態路由            |
| UI                   | Vue 3、Tailwind CSS | 互動元件與響應式介面                   |
| Language             | 輕量 TypeScript     | 為重要資料加入型別，避免不必要的複雜度 |
| Database             | PostgreSQL          | 保存原始網址與短碼                     |
| ORM                  | Drizzle ORM         | Schema 與型別安全的資料庫查詢          |
| Validation           | Zod                 | API 輸入與環境變數驗證                 |
| Testing              | Vitest              | 短碼、網址驗證及 API 測試              |
| Runtime              | Cloudflare Workers  | ES Module Worker 與靜態 Assets         |
| Database access      | Neon + Hyperdrive   | PostgreSQL source of truth 與連線加速  |
| Edge cache           | Cloudflare KV       | Redirect 正向／60 秒負向快取           |

上述 runtime、資料庫、ORM、驗證與測試工具均已納入可重現的 npm toolchain。

## 系統架構

```text
Browser → Cloudflare ES Module Worker → SHORT_URL_CACHE (KV)
                                            │ cache miss
                                            ▼
                                      HYPERDRIVE
                                            ▼
                                      Neon PostgreSQL
```

目前提供：

```http
GET /:code
GET /api/health/database
```

- `GET /:code`：KV hit 直接回應，miss 才查 PostgreSQL；回傳 `302`、`404` 或 `503`。
- `GET /api/health/database`：資料庫可用時回傳 `200 {"status":"ok"}`，否則回傳穩定的 sanitized `503 {"status":"error","code":"DATABASE_UNAVAILABLE"}`。
- 對外 `POST`／`PATCH`／`DELETE` API 不在目前範圍。

## 開始使用

### 環境需求

- Node.js 20 或更新版本
- npm 10 或更新版本
- Neon PostgreSQL 專案
- Cloudflare 帳號、Wrangler 登入權限

### 安裝與啟動

```bash
git clone <repository-url>
cd URLow
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

### 可用指令

| 指令               | 說明               |
| ------------------ | ------------------ |
| `npm run dev`      | 啟動本機開發伺服器 |
| `npm run build`    | 建立正式環境版本   |
| `npm run preview`  | 預覽正式環境版本   |
| `npm run generate` | 產生靜態輸出       |
| `npm run cf:dev`   | 建置並啟動 Wrangler local Worker |
| `npm run cf:typegen` | 產生 Cloudflare binding 型別 |
| `npm run db:generate` | 產生 Drizzle migration |
| `npm run db:migrate` | 套用 migration 至 Neon |
| `npm run test -- --run` | 執行完整測試 |
| `npm run deploy` | 建置並部署 Worker |

### Cloudflare、Neon 與本機設定

1. Neon connection 必須使用 direct、unpooled host（hostname 不含 `-pooler`）與 `sslmode=require`。
2. Hyperdrive configuration 名稱固定為 `urlow-neon`，Wrangler binding 固定為 `HYPERDRIVE`。
3. KV namespace 名稱與 binding 固定為 `SHORT_URL_CACHE`。
4. `.env`（不追蹤）只放 migration 使用的 `DATABASE_URL`。
5. `.dev.vars`（不追蹤）只放 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`。不要讓 `DATABASE_URL` 出現在 Worker binding 清單。
6. 複製 `.env.example`、`.dev.vars.example` 的格式後，依序執行：

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run cf:dev
   curl.exe -i http://127.0.0.1:8787/api/health/database
   ```

正式部署順序必須是 migration → build → deploy：

```powershell
npm.cmd run db:migrate
npm.cmd run build
npx.cmd wrangler deploy --dry-run
npm.cmd run deploy
```

完整 rollback 與乾淨 Neon branch 演練方式見 [Database Operations](./docs/07-database-operations.md)。舊版 Cloudflare Pages 的 `npm run generate` 流程已過期，不得作為目前 deployment script。

> [!WARNING]
> Free plan KV 每日 write 上限風險以 1,000 次估算。合法但不存在的高基數短碼會產生 60 秒負向快取 write；quota error 採 fail-open，仍回 404。KV 為最終一致，overwrite/delete 後其他區域可能在約 60 秒或更久內看到舊 Redirect。

## 專案文件

完整的設計思考與開發紀錄收錄於 [`docs`](./docs/article.md)：

1. [架構設計與技術選型](./docs/01-architecture-and-tech-stack.md)
2. [Short Code 設計與碰撞率分析](./docs/02-short-code-and-collision.md)
3. [縮網址網站的安全性問題](./docs/03-security.md)
4. [Nuxt Server API 與 Redirect](./docs/04-nuxt-redirect.md)
5. [AI 如何協助完成專案](./docs/05-ai-collaboration.md)
6. [Debug 紀錄](./docs/06-debug-log.md)
7. [Database Operations](./docs/07-database-operations.md)

## AI 協作說明

本專案允許使用 AI 協助需求整理、架構討論、Schema 規劃、測試案例與文件撰寫。所有 AI 建議都需要經過人工理解、官方文件查證及實際測試，不會直接將未驗證的內容視為完成結果。

使用過的 Prompt 與驗證方式會整理在 [AI 協作紀錄](./docs/05-ai-collaboration.md)，讓開發過程可以被追溯。

## 開發進度

- [x] 建立 Nuxt 4 專案
- [x] 完成架構規劃與系列文件入口
- [x] 實作產品首頁與響應式介面
- [x] 完成雙流程本機假資料互動
- [x] 加入 PostgreSQL、Hyperdrive 與 Drizzle ORM
- [ ] 實作建立短網址 API
- [x] 實作短碼 Redirect
- [x] 加入 Redirect 與 runtime 設定驗證
- [x] 補充資料庫、快取與 Redirect 自動化測試
- [x] 部署至雲端平台
- [ ] 錄製並上傳實作過程

## 設計原則

URLow 以「完成可靠且範圍明確的 MVP」為核心，只處理建立短網址、重新導向、輸入驗證與錯誤處理，不規劃額外的擴充功能。

## 授權

本專案目前作為個人學習與作品集使用，尚未指定開源授權。
