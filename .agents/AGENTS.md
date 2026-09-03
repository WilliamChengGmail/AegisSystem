# Project Rules & Customizations

## Git & Deployment Workflow Rules

- **需要Commit時會通知，不要自行作Commit動作**
- **Commit Message Format**: 每次進行 `git commit` 時，訊息必須使用繁體中文撰寫，若訊息包含多行詳細描述，必須使用正確的換行語法（如 PowerShell 的 `` `n `` 或標準多行訊息），維護變更紀錄的可讀性。
- **Sync to T Drive**: 完成 `git commit` 與 `git push` 之後，必須同步將修改後的檔案完整複製至網路磁碟機 `T:\AegisSystem\`。
- **CI/CD & Cloud Verification**: 完成 Git 動作後，必須驗證 CI/CD 與 Vercel 雲端部署狀態，若 GitHub Webhook 未自動觸發，需確保透過 Vercel CLI 將最新版發布至雲端正式環境。
