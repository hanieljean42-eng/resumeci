param(
  [Parameter(Mandatory=$true)][string]$Text,
  [Parameter(Mandatory=$true)][string]$Out
)
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SelectVoice('Microsoft Hortense Desktop')
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile($Out)
$synth.Speak($Text)
$synth.Dispose()
Write-Output "WAV OK: $Out"
