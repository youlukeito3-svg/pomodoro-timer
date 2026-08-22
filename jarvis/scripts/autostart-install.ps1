<#
.SYNOPSIS
    ログオン時にジャービスを自動起動するタスクを、タスクスケジューラに登録する。
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

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "タスクスケジューラに '$TaskName' を登録しました。次回ログオン時から自動起動します。"
Write-Host "今すぐ試すには: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "解除するには: jarvis\scripts\autostart-remove.ps1"
