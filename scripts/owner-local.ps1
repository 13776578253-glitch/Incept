#Requires -Version 7.0
[CmdletBinding()]
param(
    [ValidateSet('Prepare', 'Show', 'Refresh', 'Check')][string]$Action = 'Show',
    [switch]$ConfirmReset
)

$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This helper uses Windows user-bound encryption. Use auth:owner on other systems.' }
$projectRoot = Split-Path $PSScriptRoot -Parent
$vaultDirectory = Join-Path $projectRoot '.scratch/owner-local-private'
$vaultPath = Join-Path $vaultDirectory 'account.dpapi'

function Invoke-OwnerHelper([string]$Operation, [hashtable]$Payload) {
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $tsxPath = Join-Path $projectRoot 'packages/db/node_modules/tsx/dist/cli.mjs'
    $helperPath = Join-Path $PSScriptRoot 'owner-local.mts'
    $start = [System.Diagnostics.ProcessStartInfo]::new($nodePath)
    $start.WorkingDirectory = $projectRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @($tsxPath, $helperPath, $Operation)) { $start.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stderr = $process.StandardError.ReadToEndAsync()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $process.StandardInput.Write(($Payload | ConvertTo-Json -Compress))
        $process.StandardInput.Close()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw 'Local Owner operation failed. The encrypted password remains available; no secrets were printed.' }
        return ($stdout.GetAwaiter().GetResult() | ConvertFrom-Json -AsHashtable)
    } finally { $process.Dispose() }
}

function Save-Vault([hashtable]$Value, [switch]$Create) {
    $secure = ConvertTo-SecureString ($Value | ConvertTo-Json -Compress) -AsPlainText -Force
    try { $encrypted = ConvertFrom-SecureString $secure }
    finally { $secure.Dispose() }
    if ($Create) {
        $stream = [System.IO.File]::Open($vaultPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($encrypted)
            $stream.Write($bytes, 0, $bytes.Length)
            $stream.Flush($true)
        } finally { $stream.Dispose() }
    } else {
        $temporary = Join-Path $vaultDirectory ([guid]::NewGuid().ToString() + '.dpapi')
        [System.IO.File]::WriteAllText($temporary, $encrypted)
        [System.IO.File]::Move($temporary, $vaultPath, $true)
    }
}

function Read-Vault {
    $secure = ConvertTo-SecureString ([System.IO.File]::ReadAllText($vaultPath))
    try {
        $json = [System.Net.NetworkCredential]::new('', $secure).Password
        return ($json | ConvertFrom-Json -AsHashtable)
    } finally { $secure.Dispose() }
}

if ($Action -eq 'Prepare') {
    if (-not $ConfirmReset) { throw 'Use -ConfirmReset to revoke the old local Owner credentials and prepare a new password.' }
    if (Test-Path -LiteralPath $vaultPath) { throw 'An encrypted account bundle already exists. Refusing to overwrite or reset again.' }
    [void][System.IO.Directory]::CreateDirectory($vaultDirectory)
    if ((Get-Item -LiteralPath $vaultDirectory).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'Vault directory cannot be a link.' }
    $sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($sid, [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $vaultDirectory -AclObject $acl
    $password = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $bundle = @{ version = 1; status = 'prepared'; password = $password; createdAt = [DateTime]::UtcNow.ToString('o') }
    # Save the encrypted password before changing the account so a crash cannot lose it.
    Save-Vault $bundle -Create
    $result = Invoke-OwnerHelper 'prepare' @{ password = $password; confirm = $true }
    foreach ($key in $result.Keys) { $bundle[$key] = $result[$key] }
    $bundle.status = 'pending-authenticator-enrollment'
    Save-Vault $bundle
    Write-Host 'Local Owner prepared. Password and setup code are encrypted for the current Windows user.'
    Write-Host 'Run this script with -Action Show in your own terminal, then enroll your authenticator on the account page.'
} elseif ($Action -eq 'Show') {
    if (-not [Environment]::UserInteractive -or [Console]::IsOutputRedirected) { throw 'Display credentials only in your own interactive terminal.' }
    $bundle = Read-Vault
    Write-Host 'Local Incept Owner account (do not paste this output into chat or reports)'
    Write-Host "Username: $($bundle.username)"
    Write-Host "Password: $($bundle.password)"
    Write-Host "Setup code: $($bundle.setupCode)"
    Write-Host "Setup code expires (UTC): $($bundle.expiresAt)"
    Write-Host 'Open http://localhost:3000/zh/settings?section=account'
} elseif ($Action -eq 'Check') {
    $bundle = Read-Vault
    Invoke-OwnerHelper 'check' @{ password = $bundle.password; confirm = $true } | ConvertTo-Json
} else {
    $bundle = Read-Vault
    if ($bundle.status -ne 'pending-authenticator-enrollment') { throw 'No pending enrollment bundle.' }
    $result = Invoke-OwnerHelper 'refresh' @{ confirm = $true }
    foreach ($key in $result.Keys) { $bundle[$key] = $result[$key] }
    Save-Vault $bundle
    Write-Host 'New setup code saved to the encrypted bundle. The password is unchanged. Run -Action Show in your own terminal.'
}
