Add-Type -AssemblyName System.Drawing
$out = "C:\Users\MY PC\Documents\CONNEXA\public\games"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$pairs = @(
  @("basketball-stars-cover_1794623624834_3c9cd9c5.png", "basketball-stars.jpg"),
  @("free-kick-3d-cover_1794623670681_2ea3490f.png", "3d-free-kick.jpg"),
  @("parkour-block-3d-cover_1794623856864_2f4c813d.png", "parkour-block-3d.jpg"),
  @("traffic-run-cover_1794623994350_42ce95f2.png", "traffic-run.jpg")
)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]82)
foreach ($p in $pairs) {
  $srcPath = "C:\Users\MY PC\Documents\CONNEXA\vibe_images\" + $p[0]
  $img = [System.Drawing.Image]::FromFile($srcPath)
  $tw = 1200; $th = 675
  $srcH = [int][math]::Round($img.Width * 9.0 / 16.0)
  $offY = [int](($img.Height - $srcH) / 2)
  $bmp = New-Object System.Drawing.Bitmap($tw, $th)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $destRect = New-Object System.Drawing.Rectangle(0, 0, $tw, $th)
  $srcRect = New-Object System.Drawing.Rectangle(0, $offY, $img.Width, $srcH)
  $g.DrawImage($img, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()
  $bmp.Save((Join-Path $out $p[1]), $codec, $ep)
  $bmp.Dispose()
  Write-Output ("OK " + $p[1])
}
Write-Output "PS_DONE"
