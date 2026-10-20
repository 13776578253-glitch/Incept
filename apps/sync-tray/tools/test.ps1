# Reflection tests against an already-built executable; never runs its entry point.
param(
    [Alias('ExePath')]
    [string]$Exe = (Join-Path (Split-Path -Parent $PSScriptRoot) 'dist\InceptSync.exe')
)
$ErrorActionPreference = 'Stop'
$exePath = (Resolve-Path -LiteralPath $Exe).ProviderPath
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $csc)) {
    $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe'
}
if (-not (Test-Path -LiteralPath $csc)) { throw 'CSC_NOT_FOUND' }
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('InceptSync-tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $harness = Join-Path $testRoot 'InceptSync.Tests.exe'
    $sources = @(Get-ChildItem -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'tests') -Filter '*.cs' | ForEach-Object { $_.FullName })
    $arguments = @('/nologo', '/target:exe', '/platform:anycpu', '/optimize+', '/warnaserror+', "/out:$harness", '/r:System.Drawing.dll', '/r:System.Windows.Forms.dll') + $sources
    & $csc $arguments
    if ($LASTEXITCODE -ne 0) { throw 'TEST_CSC_FAILED' }
    & $harness $exePath
    $testExitCode = $LASTEXITCODE
}
finally {
    # Validate the absolute target before any recursive deletion.
    $separators = [char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
    $cleanupRoot = [IO.Path]::GetFullPath($testRoot).TrimEnd($separators)
    $tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd($separators)
    $cleanupParent = [IO.Path]::GetDirectoryName($cleanupRoot)
    $cleanupLeaf = [IO.Path]::GetFileName($cleanupRoot)
    if (-not [string]::Equals($cleanupParent, $tempParent, [StringComparison]::OrdinalIgnoreCase) -or
        $cleanupLeaf -cnotmatch '^InceptSync-tests-[0-9a-f]{32}$') {
        throw 'UNSAFE_TEST_CLEANUP_PATH'
    }
    $cleanupItem = Get-Item -LiteralPath $cleanupRoot -Force -ErrorAction Stop
    if (-not $cleanupItem.PSIsContainer -or
        -not [string]::Equals($cleanupItem.FullName, $cleanupRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'UNSAFE_TEST_CLEANUP_ITEM'
    }
    Remove-Item -LiteralPath $cleanupItem.FullName -Recurse -Force
}
if ($testExitCode -ne 0) { throw "TESTS_FAILED (exit $testExitCode)" }
