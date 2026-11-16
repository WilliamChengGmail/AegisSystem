# select_git_account.ps1
# 跳出視窗讓使用者選擇要用哪個帳號權限將 commit push 到遠端
# 帳號清單請見同目錄下的 git_accounts.json

[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'git_accounts.json')
)

# 讀取帳號設定
if (-not (Test-Path $ConfigPath)) {
    Write-Host "找不到帳號設定檔: $ConfigPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$accounts = @($config.accounts)

if ($accounts.Count -eq 0) {
    Write-Host "帳號設定檔中沒有任何帳號，請先編輯 git_accounts.json" -ForegroundColor Red
    exit 1
}

# 建立選擇視窗
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = '選擇 Push 使用的帳號'
$form.Size = New-Object System.Drawing.Size(440, 220)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $false

$label = New-Object System.Windows.Forms.Label
$label.Text = '請選擇要用哪個帳號權限將 commit push 到遠端：'
$label.Location = New-Object System.Drawing.Point(20, 20)
$label.Size = New-Object System.Drawing.Size(400, 40)
$form.Controls.Add($label)

$combo = New-Object System.Windows.Forms.ComboBox
$combo.Location = New-Object System.Drawing.Point(20, 65)
$combo.Size = New-Object System.Drawing.Size(380, 25)
$combo.DropDownStyle = 'DropDownList'
foreach ($acc in $accounts) {
    [void]$combo.Items.Add("$($acc.name)  ($($acc.username))")
}
$combo.SelectedIndex = 0
$form.Controls.Add($combo)

$okBtn = New-Object System.Windows.Forms.Button
$okBtn.Text = 'Push'
$okBtn.Location = New-Object System.Drawing.Point(150, 120)
$okBtn.Size = New-Object System.Drawing.Size(100, 30)
$okBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($okBtn)
$form.AcceptButton = $okBtn

$cancelBtn = New-Object System.Windows.Forms.Button
$cancelBtn.Text = '取消'
$cancelBtn.Location = New-Object System.Drawing.Point(270, 120)
$cancelBtn.Size = New-Object System.Drawing.Size(100, 30)
$cancelBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancelBtn)
$form.CancelButton = $cancelBtn

$result = $form.ShowDialog()
if ($result -ne [System.Windows.Forms.DialogResult]::OK) {
    Write-Host "已取消 push，未執行任何 Git 寫入操作" -ForegroundColor Yellow
    exit 2
}

$selected = $accounts[$combo.SelectedIndex]

# 依選擇的帳號指定 SSH Key 後執行 push
if ($selected.sshKey) {
    $env:GIT_SSH_COMMAND = "ssh -i `"$($selected.sshKey)`" -o IdentitiesOnly=yes"
    Write-Host "使用帳號 : $($selected.name) ($($selected.username))"
    Write-Host "SSH Key  : $($selected.sshKey)"
} else {
    Write-Host "使用帳號 : $($selected.name) ($($selected.username))"
    Write-Host "警告：此帳號未設定 sshKey，將使用預設認證方式" -ForegroundColor Yellow
}

Write-Host ""
git push
exit $LASTEXITCODE
