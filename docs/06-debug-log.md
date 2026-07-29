# Debug 紀錄

集中記錄開發與部署時遇到的問題、原因及解法，方便日後查找。

## Cloudflare Pages：頁籤按鈕無法切換

### 症狀

部署後頁面可以顯示，但「長網址縮址」與「短網址修改」無法切換。Console 顯示 Nuxt 產生的 JavaScript chunk（例如 `DWuSepio.js`）回傳 `404`。

### 排查

- 確認 Vue 的 `v-model` 與點擊事件綁定正常。
- 執行 `npm run generate`，建置成功。
- 確認 `.output/public/_nuxt` 內存在新版 JavaScript chunk。

### 原因與解法

瀏覽器保留舊版 HTML，仍引用前一次部署的 chunk 檔名，但新版部署已產生不同 hash。使用 `Ctrl + Shift + R` 強制重新整理或改用無痕視窗後恢復正常。

Cloudflare Pages 的靜態部署設定應為：

```text
Build command: npm run generate
Build output directory: .output/public
```

若頁面能顯示但所有互動都失效，應先檢查 Console 與 `/_nuxt/*.js` 是否載入成功。JavaScript 404 也可能由輸出目錄錯誤、部署不完整或快取規則造成，不能一律判定為瀏覽器快取。
