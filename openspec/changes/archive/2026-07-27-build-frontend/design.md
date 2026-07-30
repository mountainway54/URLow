## Context

URLow 首頁已由 Nuxt 歡迎頁改為淺色 Liquid Glass 表單。需求進一步調整為兩個產品流程：建立短網址，以及用短網址與密碼查詢並修改既有設定。目前仍不串接後端，因此以獨立 TypeScript 假資料模組提供可重現的本機資料。

## Goals / Non-Goals

**Goals:**

- 在單一玻璃面板內提供「長網址縮址」與「短網址修改」兩個鍵盤可操作的切換頁籤。
- 建立流程可用長網址、密碼與備註產生本機短網址，並提供複製回饋。
- 修改流程先驗證短網址與密碼，成功後顯示長網址及可編輯的啟用狀態、密碼與備註。
- 保留響應式、Liquid Glass、焦點狀態、reduced-motion 與無 backdrop-filter fallback。

**Non-Goals:**

- 不呼叫 API、不持久化至 localStorage、資料庫或檔案，不實作重新導向。
- 不進行正式 URL 格式驗證、權限安全或真正唯一短碼保證。
- 不新增套件、路由、Hero 文案、背景鏈結圖、helper text 或頁面資訊按鈕。

## Decisions

### 以頁籤切換兩個獨立流程

面板標題下使用具 `tablist`、`tab`、`tabpanel` 語意的雙頁籤。切換時保留各流程自己的輸入狀態，避免建立表單內容被修改流程覆蓋；頁籤按鈕可由滑鼠、Enter 與 Space 操作。

### 假資料模組與記憶體副本

新增 `app/data/mockLinks.ts`，匯出 `MockLink` 型別與唯讀 seed records。每筆資料包含 `code`、`shortUrl`、`originalUrl`、`password`、`note`、`enabled`。頁面載入時複製 seed records 到元件內 refs；建立、查詢與修改只操作此記憶體副本，重新整理即還原。

### 建立流程的假短碼

建立表單收集 `originalUrl`、`password`、`note`。提交時以目前記憶體筆數產生 `demo-{n}` 短碼，避開已存在 code 後加入記憶體副本，顯示完整短網址與複製按鈕。空白長網址時不建立並顯示欄位錯誤；成功時不宣稱資料已永久儲存。

### 修改流程的兩階段揭露

查詢階段只顯示短網址與密碼。以 short URL 最後一段或 code 精確比對，並要求密碼完全相符；成功後才顯示唯讀長網址、啟用開關、新密碼與備註。查詢失敗顯示明確錯誤且不揭露長網址。儲存只更新記憶體副本並顯示「已更新本頁資料」。

### 精簡 Liquid Glass 介面

保留 Cloud White、Ice Glass、Sky Blue、Iris Reflection、Ink 與 Muted Slate token，品牌列下直接接玻璃面板。移除 Hero 文案、背景鏈結圖、欄位 helper text 與頁面資訊按鈕；桌面與手機都採單欄表單，僅相關的小型欄位可同列。

### 原生控制項與可存取狀態

所有輸入具 label，錯誤與成功訊息使用 `aria-live`，密碼按鈕具動態 `aria-label`。頁籤公開 `aria-selected` 與對應 panel 關聯，隱藏 panel 不保留可聚焦控制項。互動目標至少 44px 並提供 `focus-visible`。

## Implementation Contract

- 首頁只顯示 URLow 品牌與單一玻璃面板，不顯示 Hero 文案、背景鏈結圖或 helper text。
- 預設選取「長網址縮址」。提交非空白長網址後，記憶體資料新增一筆 `demo-{n}` record，介面顯示完整短網址與可用的複製按鈕。
- 「短網址修改」初始只顯示短網址與密碼。只有兩者匹配 seed 或本次建立的 record 時，才顯示其長網址、啟用開關、新密碼、備註與儲存按鈕。
- 查詢失敗不得顯示任何 record 的長網址或設定，並以可存取錯誤文字說明短網址或密碼不正確。
- 修改儲存只更新元件內記憶體副本；重新整理後回到 seed records。
- Clipboard 成功後才短暫顯示「已複製」，API 缺失或拒絕時不得顯示成功。
- 不發出資料 API 或外部字型請求，不新增相依套件。
- 1440px 與 375px viewport 均不得出現水平捲動、欄位重疊或小於 44px 的互動目標。

## Risks / Trade-offs

- [假密碼以明文存在前端] → 明確限定為展示資料，不作正式安全模型或部署資料。
- [建立資料重新整理後消失] → 成功文案使用「本頁」措辭，不暗示永久儲存。
- [兩階段修改流程增加狀態] → 查詢成功時複製 record 至獨立 edit refs；切換查詢目標時先清除上一筆揭露內容。
- [假短碼可能碰撞] → 從目前筆數起遞增並檢查 code 集合，直到找到未使用的 `demo-{n}`。
