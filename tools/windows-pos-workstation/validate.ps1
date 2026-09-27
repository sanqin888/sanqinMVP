$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $scriptDir "workstation.config.example.json"
$scriptPaths = @(
  (Join-Path $scriptDir "launch-workstation.ps1"),
  (Join-Path $scriptDir "supervise-workstation.ps1"),
  (Join-Path $scriptDir "install-startup-task.ps1"),
  (Join-Path $scriptDir "uninstall-startup-task.ps1")
)

foreach ($scriptPath in $scriptPaths) {
  $tokens = $null
  $parseErrors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath,
    [ref]$tokens,
    [ref]$parseErrors
  )

  if ($parseErrors.Count -gt 0) {
    $messages = $parseErrors | ForEach-Object { $_.Message }
    throw "PowerShell parse errors in ${scriptPath}: $($messages -join '; ')"
  }
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
  "EnsureIntervalSeconds",
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

if (
  [int]$config.EnsureIntervalSeconds -lt 30 -or
  [int]$config.EnsureIntervalSeconds -gt 3600
) {
  throw "EnsureIntervalSeconds must be between 30 and 3600."
}

$requiredScheduledTaskCommands = @(
  "Register-ScheduledTask",
  "New-ScheduledTask",
  "New-ScheduledTaskAction",
  "New-ScheduledTaskTrigger",
  "New-ScheduledTaskPrincipal",
  "New-ScheduledTaskSettingsSet",
  "Unregister-ScheduledTask"
)

foreach ($command in $requiredScheduledTaskCommands) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "Required ScheduledTasks command is unavailable: $command"
  }
}

$launcherSource = Get-Content -LiteralPath (Join-Path $scriptDir "launch-workstation.ps1") -Raw
foreach ($requiredSnippet in @(
  '[ValidateSet("Launch", "Ensure")]',
  "Enter-WindowFullscreen",
  "SetForegroundWindow",
  "GetForegroundWindow",
  '[System.Windows.Forms.SendKeys]::SendWait("{F11}")',
  "SetWindowPos"
)) {
  if (-not $launcherSource.Contains($requiredSnippet)) {
    throw "Launcher recovery/fullscreen contract missing: $requiredSnippet"
  }
}

$supervisorSource = Get-Content -LiteralPath (Join-Path $scriptDir "supervise-workstation.ps1") -Raw
if (-not $supervisorSource.Contains('Invoke-WorkstationLauncher "Ensure"')) {
  throw "Supervisor must invoke launcher Ensure mode."
}

$installerSource = Get-Content -LiteralPath (Join-Path $scriptDir "install-startup-task.ps1") -Raw
foreach ($requiredSnippet in @(
  "-LogonType Interactive",
  "-MultipleInstances IgnoreNew",
  "-ExecutionTimeLimit ([TimeSpan]::Zero)"
)) {
  if (-not $installerSource.Contains($requiredSnippet)) {
    throw "Scheduled-task safety contract missing: $requiredSnippet"
  }
}

foreach ($scriptPath in @(
  (Join-Path $scriptDir "launch-workstation.ps1"),
  (Join-Path $scriptDir "supervise-workstation.ps1"),
  (Join-Path $scriptDir "install-startup-task.ps1")
)) {
  $source = Get-Content -LiteralPath $scriptPath -Raw
  if ($source.Contains('[string]$ConfigPath = (Join-Path $PSScriptRoot')) {
    throw "PowerShell 5.1 compatibility regression: ConfigPath must not evaluate PSScriptRoot inside param() in $scriptPath"
  }
}

function Assert-DefaultConfigPathResolution {
  param(
    [Parameter(Mandatory = $true)][string]$ScriptPath,
    [Parameter(Mandatory = $true)][string]$ExpectedErrorFragment
  )

  $stdoutPath = Join-Path $env:TEMP ("sanq-workstation-stdout-{0}.txt" -f [Guid]::NewGuid())
  $stderrPath = Join-Path $env:TEMP ("sanq-workstation-stderr-{0}.txt" -f [Guid]::NewGuid())

  try {
    $argumentList = @("-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ('"' + $ScriptPath + '"'))
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentList -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru

    if ($process.ExitCode -eq 0) {
      throw "Expected default ConfigPath probe to fail before runtime mutation: $ScriptPath"
    }

    $output = ""
    if (Test-Path -LiteralPath $stdoutPath) {
      $output += Get-Content -LiteralPath $stdoutPath -Raw
    }
    if (Test-Path -LiteralPath $stderrPath) {
      $output += Get-Content -LiteralPath $stderrPath -Raw
    }

    if ($output.IndexOf($ExpectedErrorFragment, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "Default ConfigPath probe did not reach the expected post-param file check for ${ScriptPath}: $output"
    }
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

Assert-DefaultConfigPathResolution (Join-Path $scriptDir "launch-workstation.ps1") "Workstation config not found"
Assert-DefaultConfigPathResolution (Join-Path $scriptDir "supervise-workstation.ps1") "Workstation config not found"
Assert-DefaultConfigPathResolution (Join-Path $scriptDir "install-startup-task.ps1") "Required workstation file is missing"

Write-Host "Windows workstation launcher/startup recovery validation passed."
