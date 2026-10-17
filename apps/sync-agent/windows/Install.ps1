param([string]$StateDirectory,[switch]$ConfirmInstall)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory;$name=Get-AgentTaskName $state
if(-not $ConfirmInstall){Write-Output 'No task installed. Re-run with -ConfirmInstall to authorize this current-user logon task.';return}
$node=Get-AgentNode;$cli=Get-AgentCli
$status=(& $node $cli status --state $state)|ConvertFrom-Json
if(-not $status.configured){throw 'Bind this device before installing autostart'}
$description='InceptSyncAgent/1 '+$name
$previous=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
if($previous -and $previous.Description -ne $description){throw 'Task name belongs to another installation'}
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File '+(Quote-AgentArgument (Join-Path $PSScriptRoot 'Invoke-Agent.ps1'))+' -StateDirectory '+(Quote-AgentArgument $state)
$action=New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe') -Argument $arguments
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $sid
$principal=New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
$settings=New-ScheduledTaskSettingsSet -Hidden -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $description -Force | Out-Null
Write-Output 'Current-user logon task installed. No administrator privileges or machine policy changes.'
