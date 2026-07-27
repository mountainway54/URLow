## 1. 假資料與雙流程狀態

- [x] 1.1 依「假資料模組與記憶體副本」完成 Mock link records：在 app/data/mockLinks.ts 定義 MockLink 與至少兩筆 seed records，app/app.vue 初始化可變副本；以重新整理前後比對確認本次建立或修改不會持久化。
- [x] 1.2 依「以頁籤切換兩個獨立流程」完成 Dual workflow tabs：預設顯示「長網址縮址」，可切換至「短網址修改」，各自保留輸入狀態且隱藏 panel 不可聚焦；以滑鼠、Enter、Space 與 accessibility tree 驗證 tablist、aria-selected、tabpanel 關聯。

## 2. 長網址縮址

- [x] 2.1 依「建立流程的假短碼」完成 Create mock short URL：輸入非空白長網址及選填密碼、備註後建立不碰撞的 demo-{n} 記憶體 record，空白長網址則顯示可存取錯誤；以空白與連續建立兩筆案例驗證錯誤及不同 code。
- [x] 2.2 完成 Clipboard feedback：建立成功後顯示完整短網址，Clipboard 成功才暫示「已複製」，API 缺失或拒絕不顯示成功；以成功 stub 與 rejected Promise 驗證且無未處理錯誤。
- [x] 2.3 完成 Password visibility：建立密碼欄可切換 password/text，按鈕 aria-label 同步；以鍵盤 Enter／Space 與 DOM 屬性驗證。

## 3. 短網址修改

- [x] 3.1 依「修改流程的兩階段揭露」完成 Protected mock lookup：初始只顯示短網址與密碼，兩者匹配才顯示長網址與設定；以正確 seed、錯誤密碼及未知 code 驗證失敗時不殘留上一筆資料。
- [x] 3.2 完成 Modify mock settings：查詢成功後長網址唯讀，啟用開關、密碼與備註可更新記憶體 record，成功宣告「已更新本頁資料」；以重新查詢同一 record 驗證新值，重新整理後驗證回復 seed。
- [x] 3.3 完成修改流程的 Password visibility：查詢密碼與新密碼各自切換 password/text 並具獨立動態 aria-label；以鍵盤與 DOM 屬性驗證互不影響。

## 4. 視覺、響應式與整合

- [x] 4.1 依「精簡 Liquid Glass 介面」完成 Compact accessible layout：只保留品牌、頁籤與玻璃面板，不含 Hero、背景鏈結圖、helper text 或頁面資訊按鈕；以 1440px 與 375px 檢查無水平捲動、重疊、截斷或小於 44px 的目標。
- [x] 4.2 依「原生控制項與可存取狀態」及 Progressive visual fallback，確認 label、focus-visible、aria-live、reduced-motion 與無 backdrop-filter fallback；以完整鍵盤走訪、accessibility tree 與瀏覽器模擬驗證兩流程均可用。
- [x] 4.3 執行 npm run build，確認 Nuxt SSR 與 TypeScript 編譯成功；檢查 git diff 僅包含本次前端實作與 build-frontend artifacts。
