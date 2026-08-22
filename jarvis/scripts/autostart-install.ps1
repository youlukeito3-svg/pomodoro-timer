<#
.SYNOPSIS
    ログオン時にジャービスを自動起動するタスクを、タスクスケジューラに登録する。

.DESCRIPTION
    バックティックによる行継続は使わない。行末の見えない空白ひとつで壊れるうえ、
    壊れ方が「構文エラー」として離れた行に出るので原因が追いにくい。
    引数はハッシュテーブルにまとめて渡す（スプラッティング）。
#>
[CmdletBinding()]
param(
    [string]$JarvisDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [string]$TaskName = "Jarvis"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $JarvisDir "scripts\jarvis-start.ps1"
if (-not (Test-Path $scriptPath)) {
    throw "$scriptPath が見つかりません。"
}

# タスクの登録には管理者権限が要る。先に見ておかないと、後で出る
# 「Access is denied」だけが残って、何を直せばよいのか分からない。
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw @"
管理者権限がありません。タスクスケジューラへの登録には必要です。
PowerShell を「管理者として実行」で開き直してから、もう一度実行してください:
    & "$PSCommandPath"
"@
}

$argument = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $scriptPath
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument
$trigger = New-ScheduledTaskTrigger -AtLogOn

$settingsArgs = @{
    AllowStartIfOnBatteries    = $true
    DontStopIfGoingOnBatteries = $true
    StartWhenAvailable         = $true
    ExecutionTimeLimit         = [TimeSpan]::Zero
}
$settings = New-ScheduledTaskSettingsSet @settingsArgs

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

$taskArgs = @{
    TaskName  = $TaskName
    Action    = $action
    Trigger   = $trigger
    Settings  = $settings
    Principal = $principal
    Force     = $true
}
Register-ScheduledTask @taskArgs | Out-Null

# 本当に登録できたかを見てから「できました」と言う。Register-ScheduledTask は
# 権限が足りないときに終了せず先へ進むことがあり、確かめずに書くと
# 登録できていないのに成功したと報せてしまう。
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    throw "'$TaskName' を登録できませんでした。上のエラーを確認してください。"
}

Write-Host "タスクスケジューラに '$TaskName' を登録しました。次回ログオン時から自動起動します。"
Write-Host "今すぐ試すには: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "解除するには: jarvis\scripts\autostart-remove.ps1"
