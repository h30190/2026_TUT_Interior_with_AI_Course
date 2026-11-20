# 把編譯好的外掛裝進 Revit 2024（關掉 Revit 再執行）
# 用法：powershell -File install.ps1
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'bin\Release\net48'
$dest = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2024'
if (-not (Test-Path (Join-Path $out 'TileSettingOutExport.dll'))) {
  Write-Host "找不到 TileSettingOutExport.dll，請先在這個資料夾執行：dotnet build -c Release" -ForegroundColor Red
  exit 1
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item (Join-Path $out 'TileSettingOutExport.dll') $dest -Force
Copy-Item (Join-Path $PSScriptRoot 'TileSettingOut.addin') $dest -Force
Write-Host "已安裝到 $dest，重新打開 Revit 2024 → 增益集 → 外部工具" -ForegroundColor Green
