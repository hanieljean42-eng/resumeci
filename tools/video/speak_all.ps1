param(
  [Parameter(Mandatory=$true)][string]$JsonPath,
  [Parameter(Mandatory=$true)][string]$OutDir
)
Add-Type -AssemblyName System.Speech
$scenes = Get-Content $JsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$i = 0
foreach ($s in $scenes) {
  $out = Join-Path $OutDir ("voice_{0:d2}.wav" -f $i)
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice('Microsoft Hortense Desktop')
  $synth.Rate = 0
  $synth.Volume = 100
  $synth.SetOutputToWaveFile($out)
  $synth.Speak($s.narration)
  $synth.Dispose()
  Write-Output ("WAV {0:d2}: {1}" -f $i, $s.id)
  $i++
}
Write-Output "DONE"
