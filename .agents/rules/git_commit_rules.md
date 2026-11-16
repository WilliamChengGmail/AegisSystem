# Git 操作與 Commit 規則（詳細版）

> 本檔案為 `.agents\AGENTS.md` 中「Git 操作與 Commit 規範」的詳細規則說明。
> 執行本計畫時，所有 Git 操作與 Commit 訊息必須遵守下列規範。

## 1. 操作權限規範

- 僅在**使用者明確指示**（主動通知）時，才可執行 `git add`、`git commit`、`git push` 等寫入操作。
- 使用者未指示前，AI **不得自行 commit**；可先備妥下列資料供使用者確認：
  - **變更檔案清單**：列出本次預備提交的所有檔案與變更摘要。
  - **Commit 訊息草稿**：依照下方規範撰寫的完整 Commit 訊息。
- 使用者通知要執行 commit 時，AI 應立即執行 `git add`、`git commit`，完成後回報執行結果。
- 使用者通知要執行 push 時，AI 應先執行 `.agents\scripts\select_git_account.ps1` 跳出帳號選擇視窗，由使用者選擇要用哪個帳號權限 push 到遠端，再依選擇結果執行 `git push`（詳細流程見第 3 節）。

## 2. Commit 訊息規範

### 基本要求

- 訊息必須為**完整的中文變更說明（繁體中文）**，說明本次做了什麼、為什麼做。
- 必須**適度排版（多行）**，禁止將所有說明擠在同一行。
- 若訊息包含多行詳細描述，必須使用正確的換行語法（如 PowerShell 的 `` `n `` 或標準多行訊息），維護變更紀錄的可讀性。

### 建議結構

1. **第一行（主旨）**：`<type>(<scope>): <變更摘要>`
2. **空一行**
3. **「變更內容：」段落**：以條列方式列出新增/修改的檔案與說明
4. **空一行**
5. **「驗證方式：」段落**：說明如何驗證本次變更

常用 type 範例：`feat`（新功能）、`fix`（錯誤修正）、`docs`（文件）、`refactor`（重構）、`test`（測試）、`chore`（雜項維護）。

### 格式範例

    feat(auth): 新增 Google OAuth2 登入流程

    變更內容：
    - 新增 src/auth/oauth2.ts：OAuth2 驗證與 Token 交換邏輯
    - 修改 src/routes/user.ts：新增 /auth/google/callback 路由
    - 修改 src/config/env.ts：新增 GOOGLE_CLIENT_ID 環境變數

    驗證方式：
    - 單元測試：npm run test src/auth/oauth2.test.ts

### 不良範例（禁止）

    fix: 修登入功能還改了路由和env設定

（禁止原因：多項變更混在同一行、未說明變更內容與原因，難以追蹤與審查。）

## 3. Push 帳號選擇流程

- 使用者通知要 push 時，AI 必須先執行 `.agents\scripts\select_git_account.ps1`，該腳本會跳出 Windows 視窗，列出可用帳號供使用者選擇。
- 帳號清單設定於 `.agents\scripts\git_accounts.json`，每個帳號需包含：`name`（顯示名稱）、`username`（GitHub 使用者名稱）、`email`（Git 信箱）、`sshKey`（SSH 私鑰路徑）。
- 腳本依使用者選擇的帳號，透過 `GIT_SSH_COMMAND` 指定對應的 SSH Key 執行 `git push`，確保以正確的帳號權限推送至遠端。
- 若使用者取消視窗，則不執行 push，AI 應回報「已取消 push」。
