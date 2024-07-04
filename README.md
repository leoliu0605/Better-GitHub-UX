# Better GitHub UX

這是一個功能豐富的 Chrome 擴充功能，讓你可以方便地管理 GitHub 倉庫、星標和 Gist。

## 功能特色

- **GitHub 帳號整合**：使用 OAuth 安全登入你的 GitHub 帳號
- **個人倉庫管理**：查看你擁有的所有倉庫
- **星標項目**：瀏覽你星標的專案
- **Gist 管理**：查看和創建 Gist 程式碼片段
- **美觀的使用者界面**：簡潔、直觀的設計，便於使用

## 安裝指南

### 開發者安裝

1. 複製此專案到本地：
   ```
   git clone https://github.com/leoliu0605/better-github-ux.git
   ```

2. 在 GitHub 上創建 OAuth 應用程序：
   - 前往 [GitHub Developer Settings](https://github.com/settings/developers)
   - 點擊 "New OAuth App"
   - 填寫應用程序信息：
     - Application name: Better GitHub UX
     - Homepage URL: 可以留空
     - Authorization callback URL: 在載入擴充功能後從控制台取得 (格式: `https://[extension-id].chromiumapp.org/`)

3. 獲取 OAuth 認證：
   - 複製生成的 Client ID
   - 生成並複製 Client Secret

4. 配置擴充功能：
   - 複製 `config.example.js` 為 `config.js`
   - 在 `config.js` 中填入你的 Client ID 和 Client Secret

5. 在 Chrome 中載入：
   - 開啟 Chrome 瀏覽器
   - 前往 `chrome://extensions/`
   - 開啟 "開發者模式"
   - 點擊 "載入未封裝項目"
   - 選擇專案目錄

### 使用者安裝 (擴充功能發布後)

1. 前往 [Chrome Web Store](https://chrome.google.com/webstore/category/extensions)
2. 搜尋 "Better GitHub UX"
3. 點擊 "添加至 Chrome"

## 使用方法

1. 點擊 Chrome 工具欄中的擴充功能圖標
2. 首次使用時點擊 "Connect with GitHub" 按鈕登入
3. 授權應用程序訪問你的 GitHub 帳號
4. 登入後你可以：
   - 查看你擁有的倉庫列表
   - 瀏覽你星標的倉庫
   - 查看和創建 Gist

## 隱私與安全

- 此擴充功能只獲取必要的 GitHub 權限
- 所有數據直接從 GitHub API 獲取，不經過第三方伺服器
- 個人訪問令牌安全存儲在瀏覽器本地存儲中
- 源代碼完全開放，透明且可審計

## 技術細節

- **前端**：HTML5, CSS3, JavaScript
- **API**：GitHub REST API
- **認證**：GitHub OAuth 2.0
- **存儲**：Chrome Storage API

## 貢獻指南

歡迎提交 Pull Request 來改進此專案！

1. Fork 這個專案
2. 創建你的功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交你的修改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 開啟一個 Pull Request

## 授權

此專案使用 MIT 授權 - 詳見 [LICENSE](LICENSE) 文件。

## 聯絡方式

如有任何問題或建議，請開啟 Issue 或聯繫專案維護者。
