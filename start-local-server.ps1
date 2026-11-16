# ==============================================================================
# AegisSystem - 本地服務一鍵啟動程序 (Local Dev Server Launcher)
# 維護者 / 製作者: Office of William
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$Host.UI.RawUI.WindowTitle = "AegisSystem Local Service"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "         AegisSystem 本地開發服務一鍵啟動程序            " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 取得專案路徑
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebLoginDir = Join-Path $ScriptDir "web-login"

if (-not (Test-Path $WebLoginDir)) {
    Write-Host "[錯誤] 找不到服務目錄: $WebLoginDir" -ForegroundColor Red
    Pause
    exit 1
}

Set-Location $WebLoginDir
Write-Host "[1/4] 工作目錄設定成功: $WebLoginDir" -ForegroundColor Green

# 2. 檢查環境變數檔案 (.env.local)
$EnvFile = Join-Path $WebLoginDir ".env.local"
if (-not (Test-Path $EnvFile)) {
    Write-Host "[警告] 未找到 .env.local 環境變數檔案！" -ForegroundColor Yellow
    Write-Host "       請確認是否已設定 TURSO_DATABASE_URL 與 TURSO_AUTH_TOKEN。" -ForegroundColor Yellow
    $ExampleEnv = Join-Path $WebLoginDir "_env_local_example"
    if (Test-Path $ExampleEnv) {
        Write-Host "       已為您複製 _env_local_example -> .env.local，請記得補齊金鑰。" -ForegroundColor Yellow
        Copy-Item $ExampleEnv $EnvFile
    }
} else {
    Write-Host "[2/4] 環境變數檔案 (.env.local) 檢查正常" -ForegroundColor Green
}

# 3. 檢查 node_modules
$NodeModulesDir = Join-Path $WebLoginDir "node_modules"
if (-not (Test-Path $NodeModulesDir)) {
    Write-Host "[提示] 偵測到尚未安裝相依套件，正在執行 npm install..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[錯誤] npm install 失敗，請檢查網路連線與 Node.js 環境！" -ForegroundColor Red
        Pause
        exit 1
    }
} else {
    Write-Host "[3/4] 相依套件庫 (node_modules) 檢查齊全" -ForegroundColor Green
}

# 4. 檢查 Port 3000 是否被佔用
$portInUse = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[提示] 偵測到 Port 3000 已有程式在監聽中。" -ForegroundColor Yellow
    Write-Host "       若是先前的 Next.js 開發伺服器，可能需要重新啟動以套用更新。" -ForegroundColor Yellow
    $choice = Read-Host "       是否要自動清理舊的 Node 伺服器程序並重啟？ (Y/N，預設 Y)"
    if ($choice -eq "" -or $choice -match "^[Yy]") {
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "       已終止舊程序，準備全新啟動。" -ForegroundColor Green
    }
}

# 5. 啟動本機開發伺服器
Write-Host "[4/4] 正在啟動 Next.js 本地開發伺服器..." -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host " 👉 服務網址: http://localhost:3000" -ForegroundColor Green
Write-Host " 👉 具備熱重載 (Hot Reload) 監控模式" -ForegroundColor DarkCyan
Write-Host " 👉 按下 Ctrl + C 即可終止伺服器" -ForegroundColor DarkGray
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray
Write-Host ""

# 自動在預設瀏覽器打開頁面 (延遲 3 秒等待服務啟動)
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 3
    Start-Process "http://localhost:3000"
} | Out-Null

# 執行 npm run dev (已配置 cross-env CHOKIDAR_USEPOLLING=true WATCHPACK_POLLING=true)
npm run dev

