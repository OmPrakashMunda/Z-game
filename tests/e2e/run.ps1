<#
  Runs the browser tests against a dev server it starts itself.

  Usage (from the repository root):
    cd tests\e2e ; npm install ; cd ..\..
    pwsh tests\e2e\run.ps1                       # everything (about half an hour on a slow machine)
    pwsh tests\e2e\run.ps1 -Only cheats,interact # just these
    pwsh tests\e2e\run.ps1 -Port 5300

  Needs Google Chrome. If it is not in the usual place, set CHROME_PATH to chrome.exe first.
  Screenshots go to tests\e2e\shots (or SHOTS_DIR).
#>
param(
  [string[]]$Only = @(),
  [int]$Port = 5199
)

$here = $PSScriptRoot
# Accept both  -Only a,b  and  -File run.ps1 -Only "a,b"
$Only = @($Only | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$root = (Resolve-Path "$here\..\..").Path

if (-not (Test-Path "$here\node_modules\playwright-core")) {
  Write-Error "Run 'npm install' in tests\e2e first."
  exit 2
}

$shots = if ($env:SHOTS_DIR) { $env:SHOTS_DIR } else { "$here\shots" }
New-Item -ItemType Directory -Force -Path $shots | Out-Null
$env:SHOTS_DIR = $shots
$env:PORT = "$Port"

$vite = Start-Process -FilePath 'node' -ArgumentList "node_modules\vite\bin\vite.js --port $Port --strictPort" `
  -WorkingDirectory $root -PassThru -WindowStyle Hidden

try {
  $up = $false
  for ($i = 0; $i -lt 60 -and -not $up; $i++) {
    try { Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 2 | Out-Null; $up = $true } catch { Start-Sleep 1 }
  }
  if (-not $up) { Write-Error "The dev server did not start on port $Port."; exit 2 }

  $scripts = Get-ChildItem "$here\*.mjs" | Where-Object { $_.Name -ne 'helpers.mjs' } | Sort-Object Name
  if ($Only.Count -gt 0) { $scripts = $scripts | Where-Object { $Only -contains $_.BaseName } }
  if ($scripts.Count -eq 0) { Write-Error 'No test matches -Only.'; exit 2 }

  $pass = 0
  $fail = 0
  $rows = @()
  foreach ($s in $scripts) {
    Write-Host ("running {0} ..." -f $s.BaseName)
    $output = (& node $s.FullName 2>&1 | Out-String) -split "`r?`n"
    $p = ($output | Where-Object { $_ -match '^PASS' }).Count
    $f = ($output | Where-Object { $_ -match '^FAIL' }).Count
    # A script that crashed before finishing counts as a failure even if no check failed
    $crashed = ($output | Where-Object { $_ -match 'passed, \d+ failed|no console errors|console errors' }).Count -eq 0
    if ($crashed) { $f++ }
    $pass += $p
    $fail += $f
    $rows += [pscustomobject]@{ Test = $s.BaseName; Passed = $p; Failed = $f }
    $output | Where-Object { $_ -match '^FAIL' } | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    if ($crashed) { $output | Where-Object { $_ -notmatch '^PASS' } | Select-Object -First 12 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red } }
  }
  $rows | Format-Table -AutoSize
  Write-Host ("{0} checks passed, {1} failed" -f $pass, $fail)
  if ($fail -gt 0) { exit 1 }
}
finally {
  if ($vite -and -not $vite.HasExited) { Stop-Process -Id $vite.Id -Force -ErrorAction SilentlyContinue }
}
