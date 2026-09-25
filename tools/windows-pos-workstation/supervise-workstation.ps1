param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = (Join-Path $PSScriptRoot "workstation.config.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$launcherPath = Join-Path $PSScriptRoot "launch-workstation.ps1"
if (-not (Test-Path -LiteralPath $launcherPath -PathType Leaf)) {
  throw "Launcher not found: $launcherPath"
}
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "Workstation config not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

$intervalSeconds = 60
if ($config.PSObject.Properties["EnsureIntervalSeconds"]) {
  $candidate = [int]$config.EnsureIntervalSeconds
  if ($candidate -lt 30 -or $candidate -gt 3600) {
    throw "EnsureIntervalSeconds must be between 30 and 3600."
  }
  $intervalSeconds = $candidate
}

$logDirectory = ""
if ($config.PSObject.Properties["LogDirectory"]) {
  $logDirectory = [string]$config.LogDirectory
}
if ([string]::IsNullOrWhiteSpace($logDirectory)) {
  $logDirectory = Join-Path $env:LOCALAPPDATA "SanQ\Workstation\logs"
} else {
  $logDirectory = [Environment]::ExpandEnvironmentVariables($logDirectory)
}
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$supervisorLog = Join-Path $logDirectory ("supervisor-{0}.log" -f (Get-Date -Format "yyyyMMdd"))

$mutexName = "Local\SanQPosWorkstationSupervisor-" + ($env:USERNAME -replace "[^A-Za-z0-9_.-]", "_")
$createdNew = $false
$mutex = [System.Threading.Mutex]::new($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
  exit 0
}

function Write-SupervisorLog {
  param(
    [ValidateSet("INFO", "WARN", "ERROR")]
    [string]$Level,
    [string]$Message
  )

  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Add-Content -LiteralPath $supervisorLog -Value $line
}

function Invoke-WorkstationLauncher {
  param(
    [ValidateSet("Launch", "Ensure")]
    [string]$Mode
  )

  $escapedLauncher = $launcherPath.Replace('"', '""')
  $escapedConfig = $ConfigPath.Replace('"', '""')
  $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -File `"$escapedLauncher`" -ConfigPath `"$escapedConfig`" -Mode $Mode"

  $process = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList $arguments `
    -WindowStyle Hidden `
    -Wait `
    -PassThru

  return $process.ExitCode
}

Write-SupervisorLog "INFO" "SanQ workstation supervisor starting; ensure interval=$intervalSeconds seconds."

$launchExit = Invoke-WorkstationLauncher "Launch"
if ($launchExit -eq 0) {
  Write-SupervisorLog "INFO" "Initial workstation launch completed successfully."
} else {
  Write-SupervisorLog "WARN" "Initial workstation launch returned exit code $launchExit; periodic ensure will continue."
}

while ($true) {
  Start-Sleep -Seconds $intervalSeconds

  try {
    $ensureExit = Invoke-WorkstationLauncher "Ensure"
    if ($ensureExit -ne 0) {
      Write-SupervisorLog "WARN" "Periodic ensure returned exit code $ensureExit."
    }
  } catch {
    Write-SupervisorLog "ERROR" "Periodic ensure failed: $($_.Exception.Message)"
  }
}
