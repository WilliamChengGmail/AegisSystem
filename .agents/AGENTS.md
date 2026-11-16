# Project Rules & Customizations

## Git 操作與 Commit 規範 (Git & Commit Rules)

> 執行本計畫時，所有 Git 操作與 Commit 訊息必須遵守下列規範。詳細規則請參閱 `.agents\rules\git_commit_rules.md`。

### 操作權限規範

- 僅在**使用者明確指示**（主動通知）時，才可執行 `git add`、`git commit`、`git push` 等寫入操作。
- 使用者未指示前，AI 不得自行 commit；可先備妥「變更檔案清單」與「Commit 訊息草稿」供使用者確認。
- 使用者通知要執行 commit 時，AI 應立即執行 `git add`、`git commit`，完成後回報執行結果，不需再等待額外確認。
- 使用者通知要執行 push 時，AI 應先執行 `.agents\scripts\select_git_account.ps1`，跳出視窗讓使用者選擇要用哪個帳號權限將 commit push 到遠端；依選擇結果執行 `git push`，完成後回報執行結果，不需再等待額外確認。

### Commit 訊息規範

- Commit 訊息必須為**完整的中文變更說明（繁體中文）**，說明本次做了什麼、為什麼做。
- 必須**適度排版（多行）**，禁止將所有說明擠在同一行。
- 若訊息包含多行詳細描述，必須使用正確的換行語法（如 PowerShell 的 `` `n `` 或標準多行訊息），維護變更紀錄的可讀性。

**格式範例：**

    feat(auth): 新增 Google OAuth2 登入流程

    變更內容：
    - 新增 src/auth/oauth2.ts：OAuth2 驗證與 Token 交換邏輯
    - 修改 src/routes/user.ts：新增 /auth/google/callback 路由
    - 修改 src/config/env.ts：新增 GOOGLE_CLIENT_ID 環境變數

    驗證方式：
    - 單元測試：npm run test src/auth/oauth2.test.ts

**不良範例（禁止）：**

    fix: 修登入功能還改了路由和env設定

## 部署與同步規則 (Deployment & Sync Rules)

- **Sync to T Drive**: 完成 `git commit` 與 `git push` 之後，必須同步將修改後的檔案完整複製至網路磁碟機 `T:\AegisSystem\`。
- **CI/CD & Cloud Verification**: 完成 Git 動作後，必須驗證 CI/CD 與 Vercel 雲端部署狀態，若 GitHub Webhook 未自動觸發，需確保透過 Vercel CLI 將最新版發布至雲端正式環境。
