$specs = @(
  'tools/interros/specs/RC-TC-PC-01.json',
  'tools/interros/specs/RC-TC-SVT-01.json',
  'tools/interros/specs/RC-TA-PHILO-01.json',
  'tools/interros/specs/RC-TA-HG-01.json',
  'tools/interros/specs/RC-TA-MATH-01.json',
  'tools/interros/specs/RC-TD-PC-02.json',
  'tools/interros/specs/RC-T-FRAN-01.json'
)
foreach ($s in $specs) {
  $ok = $false
  for ($i = 1; $i -le 8 -and -not $ok; $i++) {
    Write-Output "== $s (essai $i)"
    node tools/interros/render_interro.js $s 2>&1 | Out-String | Write-Output
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Start-Sleep -Seconds 6 }
  }
  if (-not $ok) { Write-Output "ECHEC FINAL $s" }
}
Write-Output 'TERMINE'
