$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcherPath = Join-Path $scriptDir "launch-workstation.ps1"
$configPath = Join-Path $scriptDir "workstation.config.example.json"

$tokens = $null
$parseErrors = $null
[void][System.Management.Automation.Language.Parser]::ParseFile(
  $launcherPath,
  [ref]$tokens,
  [ref]$parseErrors
)

if ($parseErrors.Count -gt 0) {
  $messages = $parseErrors | ForEach-Object { $_.Message }
  throw "PowerShell parse errors: $($messages -join '; ')"
}

$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$requiredProperties = @(
  "PosPwaShortcutPath",
  "PosWindowTitleContains",
  "CustomerDisplayUrl",
  "CustomerDisplayWindowTitleContains",
  "CustomerDisplayMonitorDeviceName",
  "AllowSingleMonitorFallback",
  "PrinterHealthUrl",
  "PrinterStartScript",
  "PrinterStartupTimeoutSeconds",
  "WindowStartupTimeoutSeconds",
  "LogDirectory"
)

foreach ($property in $requiredProperties) {
  if ($null -eq $config.PSObject.Properties[$property]) {
    throw "Missing required example config property: $property"
  }
}

if ($config.CustomerDisplayUrl -notmatch "^https://") {
  throw "CustomerDisplayUrl must use https."
}

Write-Host "Windows workstation launcher syntax/config validation passed."
