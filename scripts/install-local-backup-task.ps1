param(
  [string]$TaskName = 'InceptWeeklyBackupPull',
  [string]$DestDir = 'D:\web-backup\incept',
  [int]$MaxGib = 50,
  [int]$MinKeep = 4,
  [string]$DayOfWeek = 'Sunday',
  [string]$At = '11:00'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot 'scripts\production-backup-pull.mjs'
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$runnerPath = Join-Path $DestDir 'run-weekly-pull.ps1'

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

$runnerBody = @"
`$ErrorActionPreference = 'Continue'
`$logPath = Join-Path '$DestDir' 'pull.log'
`$ts = (Get-Date).ToString('o')
Add-Content -Path `$logPath -Value "=== [`$ts] Starting weekly backup pull ==="
& '$nodeExe' '$scriptPath' --dest '$DestDir' --max-gib $MaxGib --min-keep $MinKeep *>> `$logPath
`$code = `$LASTEXITCODE
Add-Content -Path `$logPath -Value "=== [`$(Get-Date -Format o)] Exit code: `$code ==="
exit `$code
"@

Set-Content -Path $runnerPath -Value $runnerBody -Encoding UTF8

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`""
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Weekly verified pull of latest Incept production backup (50 GiB cap, direct SSH)' -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName
[PSCustomObject]@{
  TaskName    = $task.TaskName
  State       = $task.State.ToString()
  NextRunTime = $info.NextRunTime
  RunnerPath  = $runnerPath
  DestDir     = $DestDir
  MaxGib      = $MaxGib
} | ConvertTo-Json
