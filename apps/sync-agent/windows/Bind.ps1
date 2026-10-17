param([Parameter(Mandatory=$true)][string]$Endpoint,[string]$HomeDirectory=$env:USERPROFILE,[string]$StateDirectory,[switch]$EnableRemote)
. (Join-Path $PSScriptRoot 'Common.ps1')
$state=Get-AgentState $StateDirectory
$secret=Read-Host 'Device Token (hidden, issued once by Owner Settings)' -AsSecureString
$pointer=[IntPtr]::Zero
try {
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
  $info=New-Object Diagnostics.ProcessStartInfo
  $bindArguments=@((Get-AgentCli),'bind','--endpoint',$Endpoint,'--home',$HomeDirectory,'--state',$state,'--token-stdin');if($EnableRemote){$bindArguments+='--remote'}
  $info.FileName=Get-AgentNode;$info.Arguments=(($bindArguments|ForEach-Object {Quote-AgentArgument $_}) -join ' ')
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::Start($info)
  $process.StandardInput.WriteLine([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer));$process.StandardInput.Close()
  $result=$process.StandardOutput.ReadToEnd();$null=$process.StandardError.ReadToEnd();$process.WaitForExit()
  Write-Output $result;if($process.ExitCode -ne 0){throw 'Device binding failed'}
}finally{if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};$secret.Dispose()}
