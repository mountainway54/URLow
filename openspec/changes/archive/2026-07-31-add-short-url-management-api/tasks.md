## 1. 相依套件與 Worker 契約

- [x] 1.1 完成「使用 bcryptjs cost 10 與集中式密碼服務」的執行環境準備：加入 `bcryptjs` 並確認 Cloudflare Worker bundle 不含原生 bcrypt binary；以 `npm run build` 與 dependency inspection 驗證。
- [x] 1.2 完成「管理驗證限流 adapter」：在 `wrangler.jsonc`、`worker-configuration.d.ts` 與 `server/utils/env.ts` 宣告並嚴格解析 `MANAGEMENT_RATE_LIMITER` 的 10 requests / 60 seconds binding，binding 缺少時 fail closed；以 env parser unit tests 與 `npm run typecheck` 驗證。

## 2. 密碼與建立流程

- [x] 2.1 實作「Bcrypt management password storage」與「使用 bcryptjs cost 10 與集中式密碼服務」：`server/services/management-password.ts` 統一 trim、6–72 Unicode code points、UTF-8 ≤72 bytes、空值、cost 10 hash 與 compare，並以 `tests/server/management-password.test.ts` 驗證邊界、Unicode、不同 salt、cost、成功及失敗 compare。
- [x] 2.2 擴充「Route-scoped request validation」：建立 body strict 接受 `originalUrl`、`managementPassword?`、`note?`，空密碼轉未設定、空 note 轉 null，任何錯誤在 bcrypt／短碼／DB／KV 前回穩定 400；以 `tests/server/short-url-creation-api.test.ts` 驗證未知欄位與所有邊界。
- [x] 2.3 完成「Successful short URL creation」與「Management password immutability」：creation service 與 repository 僅持久化 bcrypt hash、normalized note 與 enabled=true，回應加入 note、enabled、hasManagementPassword 且不洩漏密碼或 hash；以 creation unit/API tests 驗證有密碼、無密碼與 KV put failure。

## 3. 管理授權與資料存取

- [x] 3.1 擴充 repository 以支援「Atomic management metadata update」與「Repository 原子部分更新與密碼不可變」：按 code 讀完整管理 row，單一 UPDATE 只改 supplied fields 並刷新 updated_at、回傳 authoritative row，hash 永不更新；以 repository integration tests 驗證 SQL NULL note、欄位保留與競態 missing。
- [x] 3.2 實作「Management verification rate limit」與「管理 API 與授權邊界」的共用 authorization service：以可信 client IP＋validated code 建 key，每次 GET/PATCH 在 DB/PATCH mutation 與 bcrypt 前計數，第 10 次放行、第 11 次回 429，成功失敗皆計數；以 `tests/server/short-url-management.test.ts` 驗證呼叫順序、key isolation 與 fail-closed。
- [x] 3.3 實作「Protected management metadata lookup」與「Management authorization outcomes」：新增 GET management route，依序映射 401、403、404、429、503，成功只回安全 metadata；以 `tests/server/short-url-management-api.test.ts` 驗證每個狀態與 response/log 均無密碼、hash 或 raw infrastructure details。
- [x] 3.4 實作「Strict authorized partial update」與「Last-write-wins management updates」：新增 PATCH route，strict body 至少一欄、支援 URL/note/enabled、拒絕密碼與未知欄位，成功回更新 row 及同步資訊；以 API tests 驗證 clear note、欄位保留、updatedAt、later write wins 與 invalid body zero mutation。

## 4. Redirect 與快取一致性

- [x] 4.1 完成「KV cached redirect resolution」與「Redirect 狀態與 KV mutation 一致性」：cache union 新增 version 1 gone value，cache hit 回 410，舊 redirect/missing 保持相容，無效值仍 fallback；以 `tests/server/short-url-cache.test.ts` 驗證全部 discriminants 與 I/O 次數。
- [x] 4.2 完成「Read-through PostgreSQL fallback」：repository lookup 回傳 missing/disabled/enabled target，cache miss 對應 404/410/302 並以 waitUntil backfill missing/gone/redirect；以 short-url-cache tests 驗證 DB failure 503 與 backfill failure 不改變 response。
- [x] 4.3 完成「Active cache synchronization for mutations」與「穩定錯誤與日誌去敏感化」：PATCH 採 KV delete-before-DB-update，結果 row 決定 gone/redirect put，初始 delete 失敗回 503 且不改 DB，後續 put 失敗保留 DB 並回 cacheSynchronized=false 與 stale warning；以 `tests/server/short-url-mutations.test.ts` 和 API tests 驗證停用 410、重啟 302、ordering、failure mapping 與 sanitized logs。

## 5. 整體驗收

- [x] 5.1 依「Implementation Contract」與「Goals / Non-Goals」執行全套 `npm run test -- --run`、`npm run typecheck`、`npm run build`，並檢查 Vue 元件、刪除 API、密碼輪替、session、migration 均未被加入；所有命令成功且 scope review 無漂移才完成。
- [x] 5.2 依「Risks / Trade-offs」檢查產出：確認每分鐘 10 次包含成功請求、bcrypt 前限流、管理回應揭露 cacheSynchronized/staleWindowWarning、文件不宣稱 KV 全域立即一致；以測試名稱與最終 diff review 留下可稽核證據。

