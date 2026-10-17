param([string]$StateDirectory,[switch]$ConfirmUninstall)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory;$name=Get-AgentTaskName $state
if(-not $ConfirmUninstall){Write-Output 'No changes. Re-run with -ConfirmUninstall to stop this Agent and remove its task.';return}
$task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if($task){if($task.Description -ne ('InceptSyncAgent/1 '+$name)){throw 'Task ownership mismatch'};Unregister-ScheduledTask -TaskName $name -Confirm:$false}
& (Join-Path $PSScriptRoot 'Stop.ps1') -StateDirectory $state
Write-Output 'Autostart removed. Portable files, encrypted credential and durable outbox retained for recovery.'
