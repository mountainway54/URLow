# 系列二：短網址不是亂數而已｜Short Code 設計與碰撞率分析

## 文章目標

介紹短網址最重要的核心：

「如何產生短碼？」

---

## 內容大綱

### 常見方案

- UUID
- Base62
- nanoid
- Hash
- Sequential ID

---

### 為什麼不用 Math.random()

說明

- 可預測
- 容易碰撞
- 安全性不足

---

### 如何避免碰撞

```text
產生 Short Code

↓

查詢 Database

↓

存在？

↓

重新產生
```

---

### 自訂 Alias

需要驗證哪些內容

例如：

- 長度限制
- 保留字
- 特殊字元

---

### Database Unique Index

介紹 Unique Constraint

---

### 效能

為什麼 code 一定要建立 Index

---
