param(
  [string]$Src = 'E:\Markdown Reader\.tmp-assets\v1.jpg',
  [string]$Out = 'E:\Markdown Reader\src-tauri\icons\icon-source.png',
  [int]$Target = 1024
)

# Convert an AI-generated JPG into an icon source PNG.
# JPEG compression turns pure white into ~250, so a "not near-white" test
# fails to find the margins. Instead detect COLOURED pixels: the artwork is
# indigo + skin tones, while the surrounding canvas is neutral white/grey.
# Chroma (max channel - min channel) cleanly separates the two.
#
# NOTE: output is ASCII on purpose - PowerShell 5.1 reads this file as ANSI,
# so Chinese strings here would come out as mojibake.

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$img = [System.Drawing.Image]::FromFile($Src)
$w = $img.Width
$h = $img.Height

$bmp = New-Object System.Drawing.Bitmap($w, $h)
$g0 = [System.Drawing.Graphics]::FromImage($bmp)
$g0.DrawImage($img, 0, 0, $w, $h)
$g0.Dispose()

# JPEG noise puts stray colour into nominally white pixels, so a per-pixel
# test never finds a clean margin. Detect content by DENSITY instead:
# shrink to a thumbnail for speed, then keep rows/columns whose share of
# strongly-coloured pixels exceeds a threshold.
$TW = 400
$small = New-Object System.Drawing.Bitmap($TW, $TW)
$gs = [System.Drawing.Graphics]::FromImage($small)
$gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gs.DrawImage($bmp, 0, 0, $TW, $TW)
$gs.Dispose()

$thr = $TW * 0.02
$rowHit = New-Object 'bool[]' $TW
$colHit = New-Object 'bool[]' $TW

for ($y = 0; $y -lt $TW; $y++) {
  $rowCount = 0
  for ($x = 0; $x -lt $TW; $x++) {
    $p = $small.GetPixel($x, $y)
    $mx = [Math]::Max($p.R, [Math]::Max($p.G, $p.B))
    $mn = [Math]::Min($p.R, [Math]::Min($p.G, $p.B))
    if (($mx - $mn) -gt 30) {
      $rowCount++
      $colHit[$x] = $true
    }
  }
  if ($rowCount -gt $thr) { $rowHit[$y] = $true }
}
$small.Dispose()
$bmp.Dispose()

$minX = -1; $maxX = -1; $minY = -1; $maxY = -1
for ($i = 0; $i -lt $TW; $i++) {
  if ($rowHit[$i]) { if ($minY -lt 0) { $minY = $i }; $maxY = $i }
  if ($colHit[$i]) { if ($minX -lt 0) { $minX = $i }; $maxX = $i }
}
if ($maxX -lt 0) { throw 'no coloured content found' }

$scale = $w / $TW
$minX = [int]($minX * $scale); $maxX = [int](($maxX + 1) * $scale)
$minY = [int]($minY * $scale); $maxY = [int](($maxY + 1) * $scale)

$pad = [int](($maxX - $minX) * 0.02)
$minX = [Math]::Max(0, $minX - $pad); $minY = [Math]::Max(0, $minY - $pad)
$maxX = [Math]::Min($w - 1, $maxX + $pad); $maxY = [Math]::Min($h - 1, $maxY + $pad)
$cropW = $maxX - $minX
$cropH = $maxY - $minY

$side = [Math]::Min($cropW, $cropH)
$sx = $minX + [int](($cropW - $side) / 2)
$sy = $minY + [int](($cropH - $side) / 2)

$dst = New-Object System.Drawing.Bitmap($Target, $Target, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

# The generated art is edge-to-edge: the artwork is a rounded square whose
# four corners are plain WHITE (a JPEG has no alpha). Drawing it straight
# would leave white blocks on light backgrounds. Clip to a rounded rect so
# those corners become transparent, which is what a real app icon needs.
$corner = [int]($Target * 0.22)
$clip = New-Object System.Drawing.Drawing2D.GraphicsPath
$clip.AddArc(0, 0, $corner, $corner, 180, 90)
$clip.AddArc($Target - $corner, 0, $corner, $corner, 270, 90)
$clip.AddArc($Target - $corner, $Target - $corner, $corner, $corner, 0, 90)
$clip.AddArc(0, $Target - $corner, $corner, $corner, 90, 90)
$clip.CloseFigure()
$g.SetClip($clip)

$g.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $Target, $Target)), $sx, $sy, $side, $side, [System.Drawing.GraphicsUnit]::Pixel)
$g.ResetClip()
$g.Dispose()

$dst.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()
$img.Dispose()

Write-Output "crop: ${side}x${side} from ${sx},${sy}"
Write-Output "out : $Out ($((Get-Item $Out).Length) bytes, ${Target}x${Target})"