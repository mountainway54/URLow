<div align="center">

# URLow

### 把冗長網址，變成簡潔好分享的連結

一個以 Nuxt 打造的現代化縮網址服務。目前已完成可操作的前端介面，後端功能仍在開發中。

![Nuxt](https://img.shields.io/badge/Nuxt-4.5-00DC82?logo=nuxtdotjs&logoColor=white)
![Vue](https://img.shields.io/badge/Vue-3.5-42B883?logo=vuedotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Lightweight-3178C6?logo=typescript&logoColor=white)
![Status](https://img.shields.io/badge/status-in%20development-F59E0B)

</div>

> [!NOTE]
> URLow 目前處於開發階段。響應式產品介面與本機假資料互動已完成；縮網址 API、資料庫及真正的重新導向功能尚未實作。

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

目前儲存庫已安裝 Nuxt、Vue、Vue Router 與 Tailwind CSS；其餘項目屬於預定導入的技術，會隨對應功能一併加入。

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
```

- `POST /api/urls`：驗證原始網址、建立短碼並回傳短網址。
- `GET /:code`：查找原始網址並執行 `302` Redirect。

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

| 指令               | 說明               |
| ------------------ | ------------------ |
| `npm run dev`      | 啟動本機開發伺服器 |
| `npm run build`    | 建立正式環境版本   |
| `npm run preview`  | 預覽正式環境版本   |
| `npm run generate` | 產生靜態輸出       |

> 資料庫連線與環境變數範例會在資料庫功能加入時同步補上，避免文件提供尚未生效的設定。

## 專案文件

完整的設計思考與開發紀錄收錄於 [`docs`](./docs/article.md)：

1. [架構設計與技術選型](./docs/01-architecture-and-tech-stack.md)
2. [Short Code 設計與碰撞率分析](./docs/02-short-code-and-collision.md)
3. [縮網址網站的安全性問題](./docs/03-security.md)
4. [Nuxt Server API 與 Redirect](./docs/04-nuxt-redirect.md)
5. [AI 如何協助完成專案](./docs/05-ai-collaboration.md)
6. [Debug 紀錄](./docs/06-debug-log.md)

## AI 協作說明

本專案允許使用 AI 協助需求整理、架構討論、Schema 規劃、測試案例與文件撰寫。所有 AI 建議都需要經過人工理解、官方文件查證及實際測試，不會直接將未驗證的內容視為完成結果。

使用過的 Prompt 與驗證方式會整理在 [AI 協作紀錄](./docs/05-ai-collaboration.md)，讓開發過程可以被追溯。

## 開發進度

- [x] 建立 Nuxt 4 專案
- [x] 完成架構規劃與系列文件入口
- [x] 實作產品首頁與響應式介面
- [x] 完成雙流程本機假資料互動
- [ ] 加入 PostgreSQL 與 Drizzle ORM
- [ ] 實作建立短網址 API
- [ ] 實作短碼 Redirect
- [ ] 加入輸入驗證與錯誤處理
- [ ] 補充自動化測試
- [x] 部署至雲端平台
- [ ] 錄製並上傳實作過程

## 設計原則

URLow 以「完成可靠且範圍明確的 MVP」為核心，只處理建立短網址、重新導向、輸入驗證與錯誤處理，不規劃額外的擴充功能。

## 授權

本專案目前作為個人學習與作品集使用，尚未指定開源授權。
