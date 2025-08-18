# Render 部署檢查清單

## ✅ 已完成的修正

### 1. 伺服器配置
- [x] 修正 SSL 憑證處理 - 雲端環境不讀取本地憑證
- [x] 環境檢測 - 自動檢測 Render 環境
- [x] 主機綁定 - 使用 `0.0.0.0` 而非 `localhost`
- [x] 端口配置 - 使用 `process.env.PORT`
- [x] 移除衝突的 `http.createServer` 行

### 2. CORS 配置
- [x] 彈性 CORS 配置 - 支援多種來源
- [x] 預檢請求處理
- [x] 環境適應性 Headers

### 3. Package.json
- [x] 修正 main 入口點 -> `server.js`
- [x] 添加 `start` 腳本
- [x] 指定 Node.js 版本要求
- [x] 完善專案描述

### 4. 健康檢查
- [x] 根路徑健康檢查 (`/`)
- [x] 專用健康檢查端點 (`/health`)

## 🚀 部署步驟

1. **提交程式碼到 Git**
   ```bash
   git add .
   git commit -m "Fix Render deployment issues - SSL, CORS, and server config"
   git push origin master
   ```

2. **Render 自動部署**
   - Render 會自動檢測到更新
   - 使用 `npm start` 啟動伺服器
   - 監聽環境變數 `PORT`

3. **驗證部署**
   - 訪問: https://bms-backend-server1.onrender.com/
   - 應該看到健康檢查回應
   - 訪問: https://bms-backend-server1.onrender.com/health
   - 應該看到 OK 狀態

## 🔧 預期的 Render 日誌

```
雲端環境或憑證檔案不存在，使用 HTTP 模式
🚀 雲端 HTTP 伺服器正在 https://bms-backend-server1.onrender.com 運行
🌐 CORS 已啟用彈性配置，支援多種來源連線
✅ 支援 GitHub Pages、Netlify、Vercel 和本地開發環境
🔧 環境變數 PORT: [Render分配的端口], HOST: 0.0.0.0
```

## 🌐 API 端點測試

一旦部署成功，這些端點應該都能正常工作：

- `GET /` - 健康檢查
- `GET /health` - 狀態檢查
- `GET /api/parking/b3f` - 停車場數據
- `GET /api/elevators` - 電梯數據
- `GET /api/ac/1f` - 空調數據
- `POST /api/ac/1f/AC-1F-01/status` - 空調控制

## 🎯 問題排查

如果仍有問題，檢查：
1. Render 建構日誌是否有錯誤
2. 環境變數是否正確設定
3. package.json 中的依賴是否完整
4. Node.js 版本是否符合要求（>= 16.0.0）
