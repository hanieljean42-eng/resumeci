param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Specs)
if (-not $Specs -or $Specs.Count -eq 0) {
  $Specs = Get-ChildItem tools/interros/specs/*.json | ForEach-Object { $_.FullName.Replace('\','/').Replace((Get-Location).Path.Replace('\','/') + '/', '') }
}
foreach ($s in $Specs) {
  $ok = $false
  for ($i = 1; $i -le 8 -and -not $ok; $i++) {
    Write-Output "== $s (essai $i)"
    node tools/interros/render_interro.js $s 2>&1 | Out-String | Write-Output
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Start-Sleep -Seconds 6 }
  }
  if (-not $ok) { Write-Output "ECHEC FINAL $s" }
}
Write-Output 'TERMINE'
