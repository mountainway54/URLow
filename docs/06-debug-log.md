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

本次問題發生時，專案仍採用 Cloudflare Pages 靜態部署，當時的設定為：

```text
Build command: npm run generate
Build output directory: .output/public
```

> [!NOTE]
> 上述設定僅保留作為歷史除錯紀錄，現已過期。目前專案部署為 Cloudflare Worker 動態版本，使用 Nuxt 動態建置，不再以 `npm run generate` 產生靜態網站。

若頁面能顯示但所有互動都失效，應先檢查 Console 與 `/_nuxt/*.js` 是否載入成功。JavaScript 404 也可能由輸出目錄錯誤、部署不完整或快取規則造成，不能一律判定為瀏覽器快取。

## Cloudflare Worker：PostgreSQL runtime 相容性

### 症狀

- Nitro `cloudflare` preset 產生 Service Worker，Wrangler 拒絕 external `cloudflare:sockets`。
- `pg` bundling 嘗試解析 optional `pg-native`。
- `workerd` 支援的最新 compatibility date 比設定值早一天。

### 原因與解法

- 改用 Nitro `cloudflare_module`，輸出具 default export 的 ES Module Worker。
- 將 `pg-native` alias 到明確失敗的 Worker shim，並把 `cloudflare:sockets` 保留為 Rollup external。
- `wrangler.jsonc` compatibility date 對齊目前 workerd 支援的 `2026-07-29`。

## Wrangler local Hyperdrive：秘密值載入順序

Wrangler 4.115 對 Hyperdrive local emulator 要求 process environment 中先存在 `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`；單靠晚期載入 `.dev.vars` 會在 runtime 啟動前失敗。`npm run cf:dev` 因此由 wrapper 先驗證並載入 `.dev.vars`，再啟動 Wrangler。

`.env` 只存 `DATABASE_URL` 供 Drizzle migration；`.dev.vars` 只存 local Hyperdrive override。這避免 migration credential 出現在 Worker binding 清單。完全缺少 local URL 時 Wrangler 會安全失敗；使用不可達但格式有效的 URL 時，health endpoint 穩定回傳 sanitized HTTP 503。

### `.dev.vars` 不存在

執行 `npm run cf:dev` 時曾出現：

```text
Error: ENOENT: no such file or directory, open '...\URLow\.dev.vars'
```

原因是儲存庫只提供 `.dev.vars.example`，真正含秘密值的 `.dev.vars` 必須由開發者自行建立。檔名需完全一致，不能是 `.dev.vars.txt` 或 `.dev.vars.example`。

```dotenv
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://USER:PASSWORD@DIRECT_HOST/DATABASE?sslmode=require
```

`.dev.vars` 已列入 `.gitignore`，不得提交。Neon host 必須使用 direct、unpooled endpoint，不能包含 `-pooler`。

### Wrangler 找不到 local Hyperdrive connection string

曾出現：

```text
When developing locally, you should use a local Postgres connection string to emulate Hyperdrive functionality.
Please setup Postgres locally and set the value of the
'CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE' variable.
```

即使 `.dev.vars` 已存在，Wrangler 4.115 仍可能在載入 Worker vars 之前就檢查 Hyperdrive override。解法是由 `scripts/cf-dev.mjs` 先讀取並驗證 `.dev.vars`，把該值放入 Wrangler process environment，再執行 `wrangler dev`。wrapper 不讀取 `DATABASE_URL`，也不輸出 connection string。

啟動失敗後 Windows 曾額外顯示：

```text
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c
```

這是 Wrangler／Node 在前一個啟動錯誤後清理 async handle 時產生的次生錯誤；應優先修正它前面的 Hyperdrive 設定錯誤。

## Wrangler local runtime：compatibility date 超前

### 症狀

Worker build 成功，但 local runtime 無法啟動：

```text
This Worker requires compatibility date "2026-07-30",
but the newest date supported by this server binary is "2026-07-29".
The Workers runtime failed to start.
```

### 原因與解法

`wrangler.jsonc` 使用的 compatibility date 比目前 Wrangler 內含的 `workerd` 新一天。將設定對齊 runtime 支援的最新日期：

```json
{
  "compatibility_date": "2026-07-29"
}
```

這只調整 Worker API compatibility baseline，不會改變 Hyperdrive、KV 或資料庫 schema。

## PowerShell：health check 的網頁剖析警告

Windows PowerShell 的 `Invoke-WebRequest` 可能顯示「指令碼執行風險」並要求互動確認。選擇 `N` 後會得到 `WebCmdletIEParsingDeclined`，這不代表 Worker 或 health endpoint 故障。

使用安全的 basic parsing：

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/api/health/database |
  Select-Object StatusCode, Content
```

或直接使用：

```powershell
curl.exe -i http://127.0.0.1:8787/api/health/database
```

成功時預期 `200 {"status":"ok"}`；資料庫不可達時預期 `503 {"status":"error","code":"DATABASE_UNAVAILABLE"}`。
