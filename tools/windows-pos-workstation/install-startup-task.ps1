param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = (Join-Path $PSScriptRoot "workstation.config.json"),

  [Parameter(Mandatory = $false)]
  [string]$TaskName = "SanQ POS Workstation"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
  throw "Windows ScheduledTasks module is unavailable."
}

$launcherPath = Join-Path $PSScriptRoot "launch-workstation.ps1"
$supervisorPath = Join-Path $PSScriptRoot "supervise-workstation.ps1"

foreach ($path in @($launcherPath, $supervisorPath, $ConfigPath)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Required workstation file is missing: $path"
  }
}

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
$userId = $identity.Name
if ([string]::IsNullOrWhiteSpace($userId)) {
  throw "Unable to determine the current interactive Windows user."
}

$escapedSupervisor = $supervisorPath.Replace('"', '""')
$escapedConfig = $ConfigPath.Replace('"', '""')
$arguments = "-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$escapedSupervisor`" -ConfigPath `"$escapedConfig`""

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument $arguments `
  -WorkingDirectory $PSScriptRoot

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$principal = New-ScheduledTaskPrincipal `
  -UserId $userId `
  -LogonType Interactive `
  -RunLevel Limited

$settings = New-ScheduledTaskSettingsSet `
  -MultipleInstances IgnoreNew `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description "Launch and recover the SanQ POS workstation for the current interactive Windows user."

Register-ScheduledTask `
  -TaskName $TaskName `
  -InputObject $task `
  -Force | Out-Null

Write-Host "Installed scheduled task '$TaskName' for $userId."
Write-Host "The task runs only in this user's interactive logon session."
Write-Host "It will take effect on the next logon; use Task Scheduler or Start-ScheduledTask to test deliberately."
