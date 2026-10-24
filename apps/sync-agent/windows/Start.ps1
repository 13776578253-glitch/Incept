param([string]$StateDirectory)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory;$cli=Get-AgentCli;$node=Get-AgentNode
if(-not(Test-Path -LiteralPath (Join-Path $state 'config.json'))){throw 'Bind this device first'}
$arguments=((@($cli,'supervise','--state',$state)|ForEach-Object {Quote-AgentArgument $_}) -join ' ')
$psi=New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName=$node
$psi.Arguments=$arguments
$psi.CreateNoWindow=$true
$psi.UseShellExecute=$false
$psi.WindowStyle=[System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.WorkingDirectory=[System.IO.Path]::GetDirectoryName($cli)
$process=[System.Diagnostics.Process]::Start($psi)
Write-Output ('Agent supervisor started: '+$process.Id)
