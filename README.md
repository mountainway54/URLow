<div align="center">

# URLow

### 把冗長網址，變成簡潔好分享的連結

一個以 Nuxt 打造的現代化縮網址服務。輸入原始網址，即可建立容易分享的短連結，並追蹤基本點擊資料。

![Nuxt](https://img.shields.io/badge/Nuxt-4.5-00DC82?logo=nuxtdotjs&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Lightweight-3178C6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-F59E0B)

</div>

> [!NOTE]
> URLow 目前處於開發階段。Nuxt 專案骨架與技術文件已建立，縮網址 API、資料庫及產品介面將依下方路線圖逐步完成。

## 產品特色

- **快速建立短網址**：貼上 `http` 或 `https` 網址即可產生短連結。
- **即時重新導向**：透過短碼查找原始網址並回傳 HTTP Redirect。
- **安全輸入驗證**：拒絕不支援的協定及格式錯誤的網址。
- **基本點擊統計**：記錄短網址的建立時間與累積點擊次數。
- **響應式介面**：支援桌面與行動裝置。
- **可持續擴充**：預留自訂 Alias、QR Code、登入及流量分析能力。

## 使用流程

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

| 類別 | 技術 | 用途 |
| --- | --- | --- |
| Full-stack Framework | Nuxt 4 | 頁面、Server API 與動態路由 |
| UI | Vue 3、Tailwind CSS | 互動元件與響應式介面 |
| Language | 輕量 TypeScript | 為重要資料加入型別，避免不必要的複雜度 |
| Database | PostgreSQL | 保存原始網址、短碼及點擊資料 |
| ORM | Drizzle ORM | Schema 與型別安全的資料庫查詢 |
| Validation | Zod | API 輸入與環境變數驗證 |
| Testing | Vitest | 短碼、網址驗證及 API 測試 |

目前儲存庫已安裝 Nuxt、Vue 與 Vue Router；其餘項目屬於預定導入的技術，會隨對應功能一併加入。

## 系統架構

```text
┌─────────────┐       ┌─────────────────┐       ┌──────────────┐
│   Browser   │──────▶│ Nuxt Server API │──────▶│  PostgreSQL  │
└─────────────┘       └─────────────────┘       └──────────────┘
       ▲                       │
       └────── 302 Redirect ───┘
```

預計提供以下介面：

```http
POST /api/urls
GET  /:code
GET  /api/urls/:code/stats
```

- `POST /api/urls`：驗證原始網址、建立短碼並回傳短網址。
- `GET /:code`：查找原始網址、更新點擊數並執行 `302` Redirect。
- `GET /api/urls/:code/stats`：取得建立時間及累積點擊次數。

## 開始使用

### 環境需求

- Node.js 20 或更新版本
- npm 10 或更新版本
- PostgreSQL（資料庫功能完成後需要）

### 安裝與啟動

```bash
git clone <repository-url>
cd URLow
npm install
npm run dev
```

開啟 [http://localhost:3000](http://localhost:3000)。

### 可用指令

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 啟動本機開發伺服器 |
| `npm run build` | 建立正式環境版本 |
| `npm run preview` | 預覽正式環境版本 |
| `npm run generate` | 產生靜態輸出 |

> 資料庫連線與環境變數範例會在資料庫功能加入時同步補上，避免文件提供尚未生效的設定。

## 專案文件

完整的設計思考與開發紀錄收錄於 [`docs`](./docs/article.md)：

1. [架構設計與技術選型](./docs/01-architecture-and-tech-stack.md)
2. [Short Code 設計與碰撞率分析](./docs/02-short-code-and-collision.md)
3. [縮網址網站的安全性問題](./docs/03-security.md)
4. [Nuxt Server API 與 Redirect](./docs/04-nuxt-redirect.md)
5. [AI 如何協助完成專案](./docs/05-ai-collaboration.md)

## AI 協作說明

本專案允許使用 AI 協助需求整理、架構討論、Schema 規劃、測試案例與文件撰寫。所有 AI 建議都需要經過人工理解、官方文件查證及實際測試，不會直接將未驗證的內容視為完成結果。

使用過的 Prompt 與驗證方式會整理在 [AI 協作紀錄](./docs/05-ai-collaboration.md)，讓開發過程可以被追溯。

## 開發進度

- [x] 建立 Nuxt 4 專案
- [x] 完成架構規劃與系列文件入口
- [ ] 實作產品首頁與響應式介面
- [ ] 加入 PostgreSQL 與 Drizzle ORM
- [ ] 實作建立短網址 API
- [ ] 實作短碼 Redirect
- [ ] 加入輸入驗證與錯誤處理
- [ ] 加入點擊統計
- [ ] 補充自動化測試
- [ ] 部署至雲端平台
- [ ] 錄製並上傳實作過程

## 設計原則

URLow 以「先完成可靠的 MVP」為核心。第一版專注於建立短網址、重新導向、驗證與基本統計，不會為了展示技術而過早加入會員、複雜 Analytics 或分散式架構。待核心流程經過測試後，再逐步加入：

- 自訂短碼 Alias
- QR Code 產生
- 連結有效期限
- 登入與個人連結管理
- 每日流量及來源分析
- Redis 快取與 Rate Limit

## 授權

本專案目前作為個人學習與作品集使用，尚未指定開源授權。
