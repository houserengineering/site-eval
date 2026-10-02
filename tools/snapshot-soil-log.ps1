# Refresh src/templates/soil-log from the office template (office PC only: needs the Dropbox server).
# The .xls is converted without Excel (tools/xls_to_xlsx.py); the committed logo is kept.
param(
  [string]$Source = "$env:USERPROFILE\Dropbox\Server\Office\Tools\Wastewater Tools\SEPTIC\SITE EVALUATION\Soil Log Template.xls"
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$templates = Join-Path $repo 'src\templates\soil-log'
$tmp = Join-Path ([IO.Path]::GetTempPath()) "site-eval-snapshot-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null
# Provenance hash is of the office original, not the copy.
$copy = Join-Path $tmp 'source.xls'
Copy-Item -LiteralPath $Source $copy
(Get-Item $copy).LastWriteTime = (Get-Item -LiteralPath $Source).LastWriteTime
$spec = Get-Content (Join-Path $templates 'snapshot.json') -Raw | ConvertFrom-Json
$anchor = Join-Path $tmp 'anchor.json'
$spec.images[0] | ConvertTo-Json -Depth 5 | Set-Content $anchor -Encoding utf8
python (Join-Path $PSScriptRoot 'xls_to_xlsx.py') $copy (Join-Path $tmp 'template.xlsx') (Join-Path $templates $spec.images[0].file) $anchor
python (Join-Path $PSScriptRoot 'snapshot_soil_log.py') $copy (Join-Path $tmp 'template.xlsx') $templates
Remove-Item -Recurse -Force $tmp
