# 磁磚放樣施工圖系統：本機 CI 入口（免安裝，只需 Node.js）
# 用法：在資料夾上層或任何位置執行  powershell -File tests\ci.ps1
$ErrorActionPreference = 'Stop'
$ROOT = Split-Path -Parent $PSScriptRoot

Write-Host "== CI 步驟 1／2：JS 語法檢查 ==" -ForegroundColor Cyan
$jsFiles = Get-ChildItem -LiteralPath (Join-Path $ROOT 'js') -Filter *.js
foreach ($f in $jsFiles) {
  node --check $f.FullName
  if ($LASTEXITCODE -ne 0) {
    Write-Host "FAIL：語法錯誤 $($f.Name)" -ForegroundColor Red
    exit 1
  }
  Write-Host "  OK $($f.Name)"
}

Write-Host ""
Write-Host "== CI 步驟 2／2：煙霧＋紅隊測試 ==" -ForegroundColor Cyan
node (Join-Path $PSScriptRoot 'test-runner.js')
if ($LASTEXITCODE -ne 0) {
  Write-Host "FAIL：測試非零退出" -ForegroundColor Red
  exit 1
}
Write-Host ""
Write-Host "CI 全數通過" -ForegroundColor Green
