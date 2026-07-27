## Why

URLow 目前仍顯示 Nuxt 預設歡迎頁，缺少可呈現產品用途與核心建立流程的介面。需要先建立一個可存取、響應式且具完整本機互動狀態的短網址首頁，作為後續 API 整合的穩定前端基礎。

## What Changes

- 以 URLow 品牌頁取代 Nuxt 預設歡迎頁，加入日光霧藍 iOS Liquid Glass 視覺。
- 將「縮短連結」具象化為穿過表單上緣的單一大型鏈結入口，作為 URLow 專屬視覺主張；其餘背景與裝飾維持克制，避免落入通用玻璃卡模板。
- 以 Apple 系統字體堆疊分出 Display、Text 與 Mono 三種角色，並以真實、直接的繁體中文介面文案呈現產品工作。
- 建立原始連結、短網址、密碼、備註與啟用狀態等表單控制項。
- 將玻璃表單分成「長網址縮址」與「短網址修改」兩種可切換流程。
- 長網址縮址接受長網址、密碼與備註，透過本機假資料層產生並顯示可複製的短網址。
- 短網址修改先以短網址與密碼查詢本機假資料，成功後顯示長網址，並允許修改啟用狀態、密碼與備註。
- 加入密碼顯示切換、查詢成功／失敗、儲存回饋及短網址複製回饋。
- 提供桌面與手機響應式排版、鍵盤操作、清楚的焦點狀態及 reduced-motion 支援。
- 不新增套件，僅使用 Vue Composition API、原生 CSS 與內嵌 SVG。

## Capabilities

### New Capabilities

- `liquid-glass-homepage`: URLow 響應式短網址首頁的呈現、可存取性與純前端互動行為。

### Modified Capabilities

（無）

## Impact

- Affected specs: liquid-glass-homepage
- Affected code:
  - Modified: app/app.vue
  - New: app/data/mockLinks.ts, openspec/specs/liquid-glass-homepage/spec.md
  - Removed: none
- APIs: 不新增或呼叫公開 API；資料操作限定於瀏覽器記憶體中的假資料副本。
- Dependencies: 不新增執行期或開發依賴。
