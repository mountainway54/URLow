## 1. 前端 API 契約

- [x] 1.1 依「集中型別化 API 邊界與錯誤正規化」在 `app/types/short-url.ts` 與 `app/composables/useShortUrlApi.ts` 提供 `createShortUrl`、`getManagedShortUrl`、`updateShortUrl`、成功資料型別及正規化錯誤，確保管理密碼只進入 `X-Management-Password`、元件不接觸 raw `$fetch` exception；以 `tests/app/short-url-workflows.test.ts` 的 request method/path/body/header 與 Frontend API error normalization 測試驗證。

## 2. 建立與查詢工作流程

- [x] 2.1 依「建立與查詢採確認式非同步流程」完成 Real API short URL creation：`app/components/CreateShortLinkForm.vue` 呼叫真實 POST、pending 時停用控制項並顯示「建立中…」、成功後顯示 API 短網址且只清除管理密碼，同時顯示未設密碼的永久不可管理行內提示；以元件測試驗證單次 request、欄位保留／清除、無確認 dialog 與 Clipboard 既有行為。
- [x] 2.2 依「建立與查詢採確認式非同步流程」完成 Real API protected management lookup：`app/components/EditShortLinkForm.vue` 僅接受 8 碼 Base62 或末段為該短碼的 HTTP(S) URL、無效格式零 request、pending 顯示「查詢中…」且防重複，授權成功後才揭露管理資料；以純短碼、完整 URL、格式錯誤與 unresolved request 元件測試驗證。

## 3. 管理更新與錯誤狀態

- [x] 3.1 依「可回滾且不重疊的樂觀管理更新」完成 Optimistic real API management update：編輯區允許修改 `originalUrl`、`note`、`enabled` 且無密碼修改欄位，以最後伺服器快照在 PATCH 失敗時回復三欄，pending 顯示「儲存中…」並防止重疊 PATCH；以成功採用 response、失敗完整 rollback 及 double-submit 元件測試驗證。
- [x] 3.2 依「精確錯誤與跨區部分成功呈現」將建立 validation issues 與各穩定管理 error code 映射為繁體中文 live-region 訊息，未知／網路錯誤不得洩露 raw exception；PATCH 僅在 `cacheSynchronized=false` 顯示指定跨區文案；以各 code、field path、malformed envelope、true/false 同步旗標測試驗證 Frontend API error normalization。

## 4. 版面與 mock 移除

- [x] 4.1 依「以共同網格軌道對齊管理控制項」調整 `app/components/EnabledToggle.vue`、`app/components/EditShortLinkForm.vue` 與 `app/assets/css/urlow.css`，交付 Compact accessible layout：1440 CSS pixels 時 toggle 與原始網址 input 的控制邊界對齊，375 CSS pixels 時維持全寬單欄、無水平捲動且互動目標至少 44 CSS pixels；以兩種 viewport 的瀏覽器量測與截圖檢查驗證。
- [x] 4.2 從 `app/pages/index.vue` 移除本機展示 badge、props/emits 記憶體集合與 `app/data/mockLinks.ts`，完整遷移 Mock link records、Create mock short URL、Protected mock lookup、Modify mock settings，確保重載後 UI 不載入 seed 或 `demo-*` 資料；以 `rg "mockLinks|MockLink|demo-" app` 無結果及首頁元件測試驗證。
- [x] 4.3 依「受信任的本機管理限流 identity」完成 Local development management identity：`scripts/cf-dev.mjs` 只在 dev wrapper 注入 `URLOW_LOCAL_DEV=true`，管理 GET／PATCH 在可信 `CF-Connecting-IP` 缺少時僅接受此精確 marker 並使用固定 `local-dev` key；正式或未標記環境仍 fail closed 為 503，且前端不傳 IP header；以 `tests/scripts/cf-dev.test.ts`、`tests/server/short-url-management.test.ts`、`tests/server/short-url-management-api.test.ts` 及本機 GET 實測驗證。

## 5. 整合驗證

- [x] 5.1 擴充 `tests/app/short-url-workflows.test.ts` 覆蓋 Real API short URL creation、Real API protected management lookup、Optimistic real API management update、Frontend API error normalization 與 Compact accessible layout 的所有 delta scenarios，並執行 `npm run typecheck`、`npm test`，確認正式 server 安全契約維持不變、本機 dev 例外受 marker 限制且整套測試通過。
