# 系列四：Nuxt Server API 如何完成縮網址 Redirect

## 文章目標

介紹 Nuxt Server API 的實作方式。

---

## 內容大綱

### Nuxt Server API

介紹

server/api

server/routes

差異

---

### Dynamic Route

```text
/:code
```

如何取得參數

---

### Redirect 流程

```text
Request

↓

取得 code

↓

查詢 Database

↓

302 Redirect
```

---

### HTTP Status Code

介紹

301

302

307

308

差異

以及縮網址適合哪一種

---

### Error Handling

404

410（已過期）

500

---

### 效能優化

未來可以加入

- Redis Cache
- Edge Function

---
