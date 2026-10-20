# Builds InceptSync.exe with the .NET Framework compiler that ships with
# Windows. No .NET SDK, NuGet restore or network access is required.
param([string]$Output)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { throw 'CSC_NOT_FOUND' }
if (-not $Output) { $Output = Join-Path $root 'dist\InceptSync.exe' }
New-Item -ItemType Directory -Force (Split-Path -Parent $Output) | Out-Null

$assetRoot = Join-Path $root 'assets\icons'
$sourceRoot = Join-Path $assetRoot 'source'
$generatedRoot = Join-Path $assetRoot 'generated'
New-Item -ItemType Directory -Force $generatedRoot | Out-Null

# Source files are the untouched 1254 px PNGs supplied for the tray. The crop
# and rounded mask remove their black background without repainting the art.
$iconAssets = @(
    [pscustomobject]@{ Name = 'running'; Source = '013e72f2-af60-4e18-bc27-3074ccbf6517.png' },
    [pscustomobject]@{ Name = 'paused'; Source = 'cf52a678-4b66-4387-97c9-769513f3547a.png' },
    [pscustomobject]@{ Name = 'offline'; Source = '3209ce34-20f9-4aa1-954b-7f2bbed82b76.png' },
    [pscustomobject]@{ Name = 'sync-0'; Source = '703a2b7c-83fc-42b5-b04f-20671bd52d31.png' },
    [pscustomobject]@{ Name = 'sync-1'; Source = '370c3b99-069e-4bf4-9677-7a34a856dd25.png' },
    [pscustomobject]@{ Name = 'sync-2'; Source = 'c505eb6a-01ff-4f6b-95a7-cad7126a4e7a.png' },
    [pscustomobject]@{ Name = 'sync-3'; Source = '6f938482-8567-49b3-9126-f2826ca88871.png' },
    [pscustomobject]@{ Name = 'sync-4'; Source = '59558536-db8a-4b28-8d44-e1b7e5dbd43a.png' },
    [pscustomobject]@{ Name = 'sync-5'; Source = 'a489524b-0cbe-4063-a0c7-acf264edfe95.png' },
    [pscustomobject]@{ Name = 'sync-6'; Source = '14cfc74a-c957-4e6a-b322-6de116b8e173.png' },
    [pscustomobject]@{ Name = 'sync-7'; Source = 'f2af5f0f-8b24-48a4-9b0b-e803901eaec8.png' }
)

$sourceCrop = New-Object System.Drawing.Rectangle 317, 306, 619, 627
$sourceRadius = 176.0
$assetSize = 160
$workSize = 640

function New-RoundedPath([System.Drawing.RectangleF]$Rect, [float]$Radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $diameter = [Math]::Min($Radius * 2.0, [Math]::Min($Rect.Width, $Rect.Height))
    $arc = New-Object System.Drawing.RectangleF $Rect.X, $Rect.Y, $diameter, $diameter
    $path.AddArc($arc, 180, 90)
    $arc.X = $Rect.Right - $diameter
    $path.AddArc($arc, 270, 90)
    $arc.Y = $Rect.Bottom - $diameter
    $path.AddArc($arc, 0, 90)
    $arc.X = $Rect.Left
    $path.AddArc($arc, 90, 90)
    $path.CloseFigure()
    return $path
}

function Update-IconAsset($Asset) {
    $sourcePath = Join-Path $sourceRoot $Asset.Source
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw ('ICON_SOURCE_NOT_FOUND: ' + $sourcePath)
    }
    $outputPath = Join-Path $generatedRoot ($Asset.Name + '.png')
    if ((Test-Path -LiteralPath $outputPath) -and
        ((Get-Item -LiteralPath $outputPath).LastWriteTimeUtc -ge (Get-Item -LiteralPath $sourcePath).LastWriteTimeUtc)) {
        return (Get-Item -LiteralPath $outputPath).FullName
    }

    $source = $null
    $work = $null
    $workGraphics = $null
    $clip = $null
    $final = $null
    $finalGraphics = $null
    try {
        $source = [System.Drawing.Image]::FromFile($sourcePath)
        if ($source.Width -lt ($sourceCrop.Right) -or $source.Height -lt ($sourceCrop.Bottom)) {
            throw ('ICON_SOURCE_SIZE_INVALID: ' + $sourcePath)
        }

        $work = New-Object System.Drawing.Bitmap $workSize, $workSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $workGraphics = [System.Drawing.Graphics]::FromImage($work)
        $workGraphics.Clear([System.Drawing.Color]::Transparent)
        $workGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $workGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $workGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $workGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

        $scale = [Math]::Min($workSize / [double]$sourceCrop.Width, $workSize / [double]$sourceCrop.Height)
        $destWidth = $sourceCrop.Width * $scale
        $destHeight = $sourceCrop.Height * $scale
        $dest = New-Object System.Drawing.RectangleF (($workSize - $destWidth) / 2.0), (($workSize - $destHeight) / 2.0), $destWidth, $destHeight
        $clip = New-RoundedPath $dest ([float]($sourceRadius * $scale))
        $workGraphics.SetClip($clip, [System.Drawing.Drawing2D.CombineMode]::Replace)
        $workGraphics.DrawImage($source, $dest, $sourceCrop, [System.Drawing.GraphicsUnit]::Pixel)
        $workGraphics.ResetClip()

        $final = New-Object System.Drawing.Bitmap $assetSize, $assetSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $finalGraphics = [System.Drawing.Graphics]::FromImage($final)
        $finalGraphics.Clear([System.Drawing.Color]::Transparent)
        $finalGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $finalGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $finalGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $finalGraphics.DrawImage($work, 0, 0, $assetSize, $assetSize)
        $final.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        if ($finalGraphics) { $finalGraphics.Dispose() }
        if ($final) { $final.Dispose() }
        if ($clip) { $clip.Dispose() }
        if ($workGraphics) { $workGraphics.Dispose() }
        if ($work) { $work.Dispose() }
        if ($source) { $source.Dispose() }
    }
    return (Get-Item -LiteralPath $outputPath).FullName
}

function Update-AppIcon([string]$RunningAsset) {
    $outputPath = Join-Path $generatedRoot 'InceptSync.ico'
    if ((Test-Path -LiteralPath $outputPath) -and
        ((Get-Item -LiteralPath $outputPath).LastWriteTimeUtc -ge (Get-Item -LiteralPath $RunningAsset).LastWriteTimeUtc)) {
        return (Get-Item -LiteralPath $outputPath).FullName
    }

    $image = $null
    $bitmap = $null
    $graphics = $null
    $icon = $null
    $stream = $null
    try {
        $image = [System.Drawing.Image]::FromFile($RunningAsset)
        $bitmap = New-Object System.Drawing.Bitmap $assetSize, $assetSize, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage($image, 0, 0, $assetSize, $assetSize)
        $icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
        $stream = [System.IO.File]::Create($outputPath)
        $icon.Save($stream)
    }
    finally {
        if ($stream) { $stream.Dispose() }
        if ($icon) { $icon.Dispose() }
        if ($graphics) { $graphics.Dispose() }
        if ($bitmap) { $bitmap.Dispose() }
        if ($image) { $image.Dispose() }
    }
    return (Get-Item -LiteralPath $outputPath).FullName
}

$sources = Get-ChildItem (Join-Path $root 'src') -Filter '*.cs' | ForEach-Object { $_.FullName }
$manifest = Join-Path $root 'src\app.manifest'
$cscArguments = @('/nologo', '/target:winexe', '/platform:anycpu', '/optimize+', "/win32manifest:$manifest", "/out:$Output")
$generatedAssets = @{}
foreach ($asset in $iconAssets) {
    $generatedAssets[$asset.Name] = Update-IconAsset $asset
    $cscArguments += "/resource:$($generatedAssets[$asset.Name]),InceptSync.Assets.Icon.$($asset.Name).png"
}
$appIcon = Update-AppIcon $generatedAssets['running']
$cscArguments += "/win32icon:$appIcon"
$cscArguments += $sources

& $csc $cscArguments
if ($LASTEXITCODE -ne 0) { throw 'CSC_FAILED' }
Write-Output ([IO.Path]::GetFullPath($Output))
