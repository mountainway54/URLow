## 1. TDD Red：先建立失敗測試

- [x] 1.1 為 `Route-scoped request validation`、`路由專用 Zod validation middleware` 與 `嚴格且最小的 request schema` 在 `tests/server/short-url-validation-middleware.test.ts` 建立失敗測試，涵蓋合法 trim、malformed JSON、非物件、缺少／未知欄位、空值、2048 邊界、非 HTTP(S) 及 health/redirect 不套用；以該 Vitest 檔在 middleware 尚未實作時如預期失敗驗證 Red 階段。
- [x] 1.2 為 `Secure short-code allocation` 與 `Web Crypto Base62 短碼產生` 在 `tests/server/short-code.test.ts` 建立失敗測試，驗證固定 8 字元、Base62、rejection sampling 丟棄偏差 byte，以及可注入亂數填充函式；以該 Vitest 檔在 generator 尚未實作時失敗驗證 Red 階段。
- [x] 1.3 為 `建立服務與唯一碰撞重試`、`PostgreSQL 成功後的 KV failure policy` 與 `Successful short URL creation` 擴充 `tests/server/short-url-mutations.test.ts` 並新增 service 測試，驗證 create-only coordinator、一次成功、一次碰撞後成功、五次耗盡、其他 database error 不重試、碰撞不寫 KV，以及 KV failure 保留 database success；以相關 Vitest 檔在新契約尚未實作時失敗驗證 Red 階段。
- [x] 1.4 為 `穩定 API response 與錯誤碼` 與 `Sanitized creation failures` 在 `tests/server/short-url-creation-api.test.ts` 建立 handler 失敗測試，精確驗證 201 data、request origin、400/500/503 body、I/O short-circuit 與敏感錯誤不外洩；以該 Vitest 檔在 route 尚未實作時失敗驗證 Red 階段。

## 2. TDD Green：完成最小實作

- [x] 2.1 在 `server/schemas/short-url.ts` 與 `server/utils/middleware/validate-request-body.ts` 完成 strict Zod schema 及 `withValidatedBody` route wrapper，使合法輸入產生型別安全的 normalized body、非法輸入在 I/O 前回穩定 400，且 wrapper 不進入 Nuxt 全域 middleware；以 `npm.cmd run test -- --run tests/server/short-url-validation-middleware.test.ts` 全數通過驗證。
- [x] 2.2 在 `server/services/short-code.ts` 完成 Web Crypto rejection sampling generator，使注入測試與 production crypto 均輸出無 modulo bias 的 8 字元 Base62 code；以 `npm.cmd run test -- --run tests/server/short-code.test.ts` 全數通過驗證。
- [x] 2.3 在 `server/services/short-url-repository.ts` 實作 insert 與精確 PostgreSQL collision classifier，並在 `server/services/short-url-mutations.ts` 抽出 `ShortUrlCreationCoordinator`、讓既有 coordinator 繼承且不改變 update/disable/delete 行為；以 repository/service 測試及既有 `tests/server/short-url-mutations.test.ts` 全數通過驗證。
- [x] 2.4 在 `server/services/short-url-creation.ts` 完成五次上限的建立 orchestration，使僅指定 constraint 的碰撞重試、其他 persistence error 立即失敗、成功後才同步 KV，且 KV failure 不回滾 PostgreSQL；以 service 測試精確驗證 insert 次數、code 次序、KV 呼叫次數與 typed failure mapping。
- [x] 2.5 在 `server/api/short-urls.post.ts` 明確套用 validation wrapper 並完成 HTTP mapping，使成功回 201 `{ data: { code, originalUrl, shortUrl } }`、碰撞耗盡／database unavailable／internal failure 回固定安全 body；以 `npm.cmd run test -- --run tests/server/short-url-creation-api.test.ts` 全數通過驗證。

## 3. Refactor、文件與整體驗證

- [x] 3.1 重構重複的 public error mapping 與測試 fixture，但保持 spec 中所有 JSON shape、status、重試與 I/O 順序不變；以新增測試與既有 server test suite 維持全綠驗證 Refactor 階段沒有行為漂移。
- [x] 3.2 更新 `README.md`，使公開 endpoint、request/response 範例、Zod 驗證限制、錯誤碼、KV failure policy 與暫不包含前端串接的範圍可由使用者直接查得；以人工比對 `short-url-creation-api` spec 確認文件沒有宣稱未實作功能或洩漏環境秘密。
- [x] 3.3 執行 `npm.cmd run test -- --run`、`npm.cmd run build`，並在 `DATABASE_URL` 可用時執行 integration suite；所有非環境條件測試與 build 必須成功，database integration 缺少變數時只允許既有明確 skip。
