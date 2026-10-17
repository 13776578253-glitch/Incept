param([string]$StateDirectory)
. (Join-Path $PSScriptRoot 'Common.ps1')
& (Get-AgentNode) (Get-AgentCli) supervise --state (Get-AgentState $StateDirectory)
exit $LASTEXITCODE
