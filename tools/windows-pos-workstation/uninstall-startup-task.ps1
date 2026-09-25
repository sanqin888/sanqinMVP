param(
  [Parameter(Mandatory = $false)]
  [string]$TaskName = "SanQ POS Workstation"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($null -eq $task) {
  Write-Host "Scheduled task '$TaskName' is not installed."
  exit 0
}

try {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
  # The task may already be stopped.
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed scheduled task '$TaskName'. Existing POS/Display windows and printer-agent processes were left untouched."
