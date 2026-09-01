$source = "D:\tmp\web-login"
$destination = "T:\AegisSystem\web-login"

# 設定要排除的資料夾
$excludeDirs = @("node_modules", ".next", ".git")

Write-Host "Starting sync from D: to T:..." -ForegroundColor Cyan

# Execute robocopy
robocopy $source $destination /MIR /XD $excludeDirs /XF ".env.local" /NFL /NDL /NJH /NJS /nc /ns /np

Write-Host "Sync complete! You can now run git commit in T:\AegisSystem" -ForegroundColor Green
