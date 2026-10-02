# Refresh src/templates/soil-log from the office template (office PC only: needs Excel and the Dropbox server).
param(
  [string]$Source = "$env:USERPROFILE\Dropbox\Server\Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\Soil Log Template.xls"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$tmp = Join-Path ([IO.Path]::GetTempPath()) "site-eval-snapshot-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null
$copy = Join-Path $tmp 'template.xls'
Copy-Item -LiteralPath $Source $copy
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($copy, 0, $true)
  $wb.SaveAs((Join-Path $tmp 'template.xlsx'), 51)
  $wb.Close($false)
} finally { $xl.Quit() }
# Provenance hash is of the office original, not the copy.
Copy-Item -LiteralPath $Source (Join-Path $tmp 'source.xls')
(Get-Item (Join-Path $tmp 'source.xls')).LastWriteTime = (Get-Item -LiteralPath $Source).LastWriteTime
python (Join-Path $PSScriptRoot 'snapshot_soil_log.py') (Join-Path $tmp 'source.xls') (Join-Path $tmp 'template.xlsx') (Join-Path $repo 'src\templates\soil-log')
Remove-Item -Recurse -Force $tmp
