Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Quote-AgentArgument([string]$Value) {
  if($Value -match '["\r\n]'){throw 'Invalid argument'}
  return '"'+[regex]::Replace($Value,'(\\+)$','$1$1')+'"'
}
function Get-AgentNode { return (Get-Command node.exe -ErrorAction Stop).Source }
function Assert-AgentPackage([string]$Cli) {
  $root=[IO.Path]::GetFullPath((Join-Path (Split-Path $Cli -Parent) '..'))
  $manifestPath=Join-Path $root 'manifest.json'
  if(-not(Test-Path -LiteralPath $manifestPath)){return}
  $manifest=Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if(-not $manifest.version -or -not $manifest.files){throw 'AGENT_PACKAGE_MANIFEST_INVALID'}
  foreach($file in $manifest.files.PSObject.Properties){
    $target=Join-Path $root ($file.Name -replace '/','\')
    if(-not(Test-Path -LiteralPath $target)){throw 'AGENT_PACKAGE_FILE_MISSING'}
    $sha=[Security.Cryptography.SHA256]::Create()
    try{$actual=[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($target))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
    if($actual -ne ([string]$file.Value).ToLowerInvariant()){throw 'AGENT_PACKAGE_HASH_MISMATCH'}
  }
}
function Get-AgentCli {
  $source=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../dist/agent.mjs'))
  if(Test-Path -LiteralPath $source){Assert-AgentPackage $source;return $source}
  $packaged=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../agent/agent.mjs'))
  if(Test-Path -LiteralPath $packaged){Assert-AgentPackage $packaged;return $packaged}
  return $source
}
function Get-AgentState([string]$StateDirectory) {if($StateDirectory){return [IO.Path]::GetFullPath($StateDirectory)};return Join-Path $env:LOCALAPPDATA 'Incept/sync-agent'}
function Get-AgentTaskName([string]$StateDirectory) {
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $sha=[Security.Cryptography.SHA256]::Create();try{$digest=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid+':'+$StateDirectory.ToLowerInvariant()))).Replace('-','').Substring(0,16)}finally{$sha.Dispose()}
  return 'InceptSyncAgent-'+$digest
}
