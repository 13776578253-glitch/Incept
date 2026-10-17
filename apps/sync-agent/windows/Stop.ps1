param([string]$StateDirectory)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory;$cli=Get-AgentCli;$node=Get-AgentNode
$status=(& $node $cli status --state $state)|ConvertFrom-Json
if(-not $status.running){Write-Output 'Agent is stopped';return}
& $node $cli stop --state $state
for($i=0;$i -lt 30;$i++){Start-Sleep -Milliseconds 500;$status=(& $node $cli status --state $state)|ConvertFrom-Json;if(-not $status.running){Write-Output 'Agent stopped';return}}
throw 'Agent has not stopped; state and outbox retained'
