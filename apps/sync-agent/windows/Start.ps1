param([string]$StateDirectory)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory;$cli=Get-AgentCli;$node=Get-AgentNode
if(-not(Test-Path -LiteralPath (Join-Path $state 'config.json'))){throw 'Bind this device first'}
$arguments=((@($cli,'supervise','--state',$state)|ForEach-Object {Quote-AgentArgument $_}) -join ' ')
$process=Start-Process -FilePath $node -ArgumentList $arguments -WindowStyle Hidden -PassThru
Write-Output ('Agent supervisor started: '+$process.Id)
