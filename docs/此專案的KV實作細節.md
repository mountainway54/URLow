# 此專案的 KV 實作細節

URLow 把短網址資料存在 Neon PostgreSQL，Cloudflare KV 只負責加快 Redirect。就算 KV 暫時故障，資料庫裡的短網址也不會消失。

## KV 存了什麼

每個短碼會變成一個 key：

```text
redirect:{code}
```

Value 是 JSON，共有三種：

```json
{ "version": 1, "kind": "redirect", "targetUrl": "https://example.com" }
{ "version": 1, "kind": "missing" }
{ "version": 1, "kind": "gone" }
```

| `kind` | 回應 | 意思 |
| --- | --- | --- |
| `redirect` | `302` | 連結存在而且已啟用 |
| `missing` | `404` | 資料庫裡沒有這個短碼 |
| `gone` | `410` | 連結存在，但已停用 |

程式讀到 value 後會先交給 Zod 驗證。JSON 壞掉、版本不對或網址不是 HTTP(S) 時，就當成沒有快取，改查 PostgreSQL。

## 開啟短網址時

```text
GET /{code}
    │
    ▼
先查 Cloudflare KV
    ├── redirect → 302
    ├── missing  → 404
    ├── gone     → 410
    └── 沒有可用資料
             │
             ▼
       查 PostgreSQL
             ├── 已啟用 → 302，順便回填 redirect
             ├── 已停用 → 410，順便回填 gone
             ├── 不存在 → 404，回填 missing 60 秒
             └── 查詢失敗 → 503
```

回填 KV 使用 Cloudflare 的 `waitUntil()`。使用者不用等 KV 寫完才收到 Redirect；若回填失敗，這次由 PostgreSQL 查到的結果仍然有效。

## 為什麼快取 404

有人可能重複開啟同一個不存在的短碼。若每次都查 PostgreSQL，資料庫只是在反覆確認「沒有」。因此程式會把 `missing` 存 60 秒，同一個短碼在這段時間直接回 `404`。

60 秒後會再查一次資料庫，不會把「不存在」永久記住。停用中的 `gone` 不設相同 TTL；重新啟用連結時，更新流程會主動重建 cache。

## 建立和修改連結時

建立短網址會先寫 PostgreSQL，再寫 KV。KV 寫入失敗時，API 仍回建立成功，並把 `cacheSynchronized` 設為 `false`。之後第一次開啟短網址，程式會從 PostgreSQL 找到資料並補回 KV。

修改連結的順序是：

1. 刪除舊的 KV key。
2. 更新 PostgreSQL。
3. 依新狀態寫回 `redirect` 或 `gone`。

KV 是最終一致，其他地區可能在約 60 秒或更久內看到舊值。API 會回傳 `staleWindowWarning` 說明這個情況。

## 故障時怎麼回應

| 發生的問題 | 程式的處理方式 |
| --- | --- |
| KV 讀取失敗 | 改查 PostgreSQL |
| 建立後無法寫入 KV | 保留資料庫紀錄，回報 cache 未同步 |
| PostgreSQL 查詢失敗 | 回 `503`，不假裝是 `404` |
| KV value 格式錯誤 | 忽略這筆 cache，再查資料庫 |
| 背景回填失敗 | 記錄錯誤，不改變這次查詢結果 |

簡單說，PostgreSQL 保存答案，KV 只是答案的副本。副本壞了可以重建，不會反過來覆蓋正式資料。
