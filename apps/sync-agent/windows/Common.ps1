Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
function Quote-AgentArgument([string]$Value) {
  if($Value -match '["\r\n]'){throw 'Invalid argument'}
  return '"'+[regex]::Replace($Value,'(\\+)$','$1$1')+'"'
}
function Get-AgentNode { return (Get-Command node.exe -ErrorAction Stop).Source }
function Get-AgentCli { return [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../dist/agent.mjs')) }
function Get-AgentState([string]$StateDirectory) {if($StateDirectory){return [IO.Path]::GetFullPath($StateDirectory)};return Join-Path $env:LOCALAPPDATA 'Incept/sync-agent'}
function Get-AgentTaskName([string]$StateDirectory) {
  $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  $sha=[Security.Cryptography.SHA256]::Create();try{$digest=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sid+':'+$StateDirectory.ToLowerInvariant()))).Replace('-','').Substring(0,16)}finally{$sha.Dispose()}
  return 'InceptSyncAgent-'+$digest
}
