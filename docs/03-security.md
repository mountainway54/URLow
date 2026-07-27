# 系列三：縮網址網站有哪些安全性問題？

## 文章目標

介紹一個小專案背後常見的安全風險。

---

## 內容大綱

### Open Redirect

什麼是 Open Redirect

為什麼很多網站會有

如何避免

---

### URL Validation

只允許

```text
http
https
```

拒絕

```text
javascript
data
file
ftp
```

---

### SSRF

如果未來加入

- 網頁預覽
- 擷取標題
- Open Graph

可能會遇到哪些問題

---

### SQL Injection

介紹 ORM 如何降低風險

---

### Rate Limit

避免

- 暴力建立
- 惡意攻擊

---

### 最後整理

我實際做了哪些安全措施

---
