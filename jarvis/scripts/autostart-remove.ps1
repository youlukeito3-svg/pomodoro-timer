<#
.SYNOPSIS
    タスクスケジューラからジャービスの自動起動タスクを解除する。
#>
[CmdletBinding()]
param(
    [string]$TaskName = "Jarvis"
)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "タスクスケジューラから '$TaskName' を解除しました。"
} else {
    Write-Host "'$TaskName' は登録されていません。何もしませんでした。"
}
