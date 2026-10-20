# Samples idle memory and CPU for the tray and the Node daemon.
# Usage: powershell -File apps/sync-tray/tools/benchmark.ps1 -StateDirectory <dir> -Seconds 90
param(
  [string]$StateDirectory,
  [int]$Seconds = 90,
  [int]$IntervalSeconds = 3,
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
if (-not $StateDirectory) { $StateDirectory = Join-Path $env:LOCALAPPDATA 'Incept/sync-agent' }
$statusPath = Join-Path $StateDirectory 'status.json'
if (-not (Test-Path -LiteralPath $statusPath)) { throw 'STATUS_FILE_MISSING' }
$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
$agentPid = [int]$status.heartbeat.pid
$tray = Get-Process InceptSync -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $tray) { throw 'TRAY_NOT_RUNNING' }
$trayPid = [int]$tray.Id

function Get-Sample([int]$processId) {
  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $process) { return $null }
  return [pscustomobject]@{
    ws = [double]$process.WorkingSet64
    priv = [double]$process.PrivateMemorySize64
    cpu = [double]$process.TotalProcessorTime.TotalSeconds
    handles = [int]$process.HandleCount
    threads = [int]$process.Threads.Count
  }
}

$started = Get-Date
$firstTray = Get-Sample $trayPid
$firstAgent = Get-Sample $agentPid
$traySamples = @()
$agentSamples = @()
while (((Get-Date) - $started).TotalSeconds -lt $Seconds) {
  Start-Sleep -Seconds $IntervalSeconds
  $traySample = Get-Sample $trayPid
  $agentSample = Get-Sample $agentPid
  if ($traySample) { $traySamples += $traySample }
  if ($agentSample) { $agentSamples += $agentSample }
}
$elapsed = ((Get-Date) - $started).TotalSeconds
$lastTray = Get-Sample $trayPid
$lastAgent = Get-Sample $agentPid

function Get-Stats($samples) {
  if (-not $samples) { return $null }
  $ws = $samples | ForEach-Object { $_.ws }
  $priv = $samples | ForEach-Object { $_.priv }
  $handles = $samples | ForEach-Object { $_.handles }
  $threads = $samples | ForEach-Object { $_.threads }
  return [pscustomobject]@{
    samples = $samples.Count
    working_set_avg_mb = [math]::Round(($ws | Measure-Object -Average).Average / 1MB, 1)
    working_set_peak_mb = [math]::Round(($ws | Measure-Object -Maximum).Maximum / 1MB, 1)
    private_avg_mb = [math]::Round(($priv | Measure-Object -Average).Average / 1MB, 1)
    private_peak_mb = [math]::Round(($priv | Measure-Object -Maximum).Maximum / 1MB, 1)
    handles_avg = [math]::Round(($handles | Measure-Object -Average).Average, 1)
    threads_avg = [math]::Round(($threads | Measure-Object -Average).Average, 1)
  }
}

$trayCpu = 0.0
$agentCpu = 0.0
if ($firstTray -and $lastTray) { $trayCpu = [math]::Round((($lastTray.cpu - $firstTray.cpu) / $elapsed) * 100, 2) }
if ($firstAgent -and $lastAgent) { $agentCpu = [math]::Round((($lastAgent.cpu - $firstAgent.cpu) / $elapsed) * 100, 2) }
$result = [pscustomobject]@{
  duration_s = [math]::Round($elapsed, 1)
  interval_s = $IntervalSeconds
  cores = [Environment]::ProcessorCount
  tray = Get-Stats $traySamples
  agent = Get-Stats $agentSamples
  tray_cpu_percent_of_one_core = $trayCpu
  agent_cpu_percent_of_one_core = $agentCpu
  tray_cpu_percent_of_all_cores = [math]::Round($trayCpu / [Environment]::ProcessorCount, 2)
  agent_cpu_percent_of_all_cores = [math]::Round($agentCpu / [Environment]::ProcessorCount, 2)
}
$json = $result | ConvertTo-Json -Depth 5
if ($OutFile) { Set-Content -LiteralPath $OutFile -Value $json -Encoding utf8 }
Write-Output $json
