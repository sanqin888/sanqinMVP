param(
  [Parameter(Mandatory = $false)]
  [string]$ConfigPath = (Join-Path $PSScriptRoot "workstation.config.json")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class SanQWindowNative {
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool MoveWindow(
        IntPtr hWnd,
        int X,
        int Y,
        int nWidth,
        int nHeight,
        bool bRepaint
    );

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
}
"@

function Get-ConfigProperty {
  param(
    [Parameter(Mandatory = $true)]$Config,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $Config.PSObject.Properties[$Name]
  if ($null -eq $property) {
    throw "Missing required config property: $Name"
  }
  return $property.Value
}

function Resolve-ConfiguredPath {
  param([string]$PathValue)

  if ([string]::IsNullOrWhiteSpace($PathValue)) {
    return ""
  }
  return [Environment]::ExpandEnvironmentVariables($PathValue)
}

function Initialize-Log {
  param($Config)

  $configured = [string](Get-ConfigProperty $Config "LogDirectory")
  if ([string]::IsNullOrWhiteSpace($configured)) {
    $configured = Join-Path $env:LOCALAPPDATA "SanQ\Workstation\logs"
  }

  $directory = Resolve-ConfiguredPath $configured
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
  return Join-Path $directory ("workstation-{0}.log" -f (Get-Date -Format "yyyyMMdd"))
}

$script:LogFile = $null
$script:StateFile = $null

function Write-WorkstationLog {
  param(
    [ValidateSet("INFO", "WARN", "ERROR")]
    [string]$Level,
    [string]$Message
  )

  $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
  Write-Host $line
  if ($script:LogFile) {
    Add-Content -LiteralPath $script:LogFile -Value $line
  }
}

function Read-WorkstationState {
  if ([string]::IsNullOrWhiteSpace($script:StateFile)) {
    return $null
  }
  if (-not (Test-Path -LiteralPath $script:StateFile -PathType Leaf)) {
    return $null
  }

  try {
    return Get-Content -LiteralPath $script:StateFile -Raw | ConvertFrom-Json
  } catch {
    Write-WorkstationLog "WARN" "Ignoring unreadable workstation state file."
    return $null
  }
}

function Write-WorkstationState {
  param(
    [Int64]$PosWindowHandle,
    [Int64]$CustomerDisplayWindowHandle
  )

  if ([string]::IsNullOrWhiteSpace($script:StateFile)) {
    return
  }

  $state = [ordered]@{
    PosWindowHandle = $PosWindowHandle
    CustomerDisplayWindowHandle = $CustomerDisplayWindowHandle
    UpdatedAt = (Get-Date).ToString("o")
  }

  $state | ConvertTo-Json | Set-Content -LiteralPath $script:StateFile -Encoding UTF8
}

function Resolve-PosPwaShortcut {
  param($Config)

  $configured = Resolve-ConfiguredPath ([string](Get-ConfigProperty $Config "PosPwaShortcutPath"))
  if (-not [string]::IsNullOrWhiteSpace($configured)) {
    if (-not (Test-Path -LiteralPath $configured -PathType Leaf)) {
      throw "Configured POS PWA shortcut does not exist: $configured"
    }
    return (Resolve-Path -LiteralPath $configured).Path
  }

  $searchRoots = @(
    (Join-Path $env:USERPROFILE "Desktop"),
    (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs")
  )

  foreach ($root in $searchRoots) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
      continue
    }

    $match = Get-ChildItem -LiteralPath $root -Filter "SanQ POS.lnk" -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1

    if ($match) {
      return $match.FullName
    }
  }

  throw "SanQ POS.lnk was not found. Install the SanQ POS PWA first, or set PosPwaShortcutPath."
}

function Read-Shortcut {
  param([string]$ShortcutPath)

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  return [pscustomobject]@{
    TargetPath = [string]$shortcut.TargetPath
    Arguments = [string]$shortcut.Arguments
  }
}

function Resolve-BrowserExecutable {
  param([string]$ShortcutTarget)

  if (-not (Test-Path -LiteralPath $ShortcutTarget -PathType Leaf)) {
    throw "POS PWA shortcut target does not exist: $ShortcutTarget"
  }

  $directory = Split-Path -Parent $ShortcutTarget
  $leaf = [IO.Path]::GetFileName($ShortcutTarget).ToLowerInvariant()

  if ($leaf -eq "chrome_proxy.exe") {
    $candidate = Join-Path $directory "chrome.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  if ($leaf -eq "msedge_proxy.exe") {
    $candidate = Join-Path $directory "msedge.exe"
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }

  return $ShortcutTarget
}

function Get-BrowserProfileArguments {
  param([string]$ShortcutArguments)

  $arguments = @()
  $pattern = '(?<!\S)--(?:profile-directory|user-data-dir)=(?:"[^"]+"|\S+)'
  foreach ($match in [regex]::Matches($ShortcutArguments, $pattern)) {
    $arguments += $match.Value
  }

  if ($arguments.Count -eq 0) {
    throw "POS PWA shortcut does not expose Chromium profile arguments. Use the real installed SanQ POS PWA shortcut so POS and Customer Display can share one browser profile."
  }

  return $arguments
}

function Test-PrinterHealth {
  param([string]$HealthUrl)

  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -Method Get -UseBasicParsing -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
  } catch {
    return $false
  }
}

function Ensure-PrinterAgent {
  param($Config)

  $healthUrl = [string](Get-ConfigProperty $Config "PrinterHealthUrl")
  if (Test-PrinterHealth $healthUrl) {
    Write-WorkstationLog "INFO" "Printer agent health check passed."
    return $true
  }

  $startScript = Resolve-ConfiguredPath ([string](Get-ConfigProperty $Config "PrinterStartScript"))
  if (-not (Test-Path -LiteralPath $startScript -PathType Leaf)) {
    Write-WorkstationLog "ERROR" "Printer agent is unhealthy and start script is missing: $startScript"
    return $false
  }

  Write-WorkstationLog "WARN" "Printer agent health check failed; starting existing printer-agent wrapper."
  $wscript = Join-Path $env:WINDIR "System32\wscript.exe"
  Start-Process -FilePath $wscript -ArgumentList ('"' + $startScript + '"') -WindowStyle Hidden | Out-Null

  $timeoutSeconds = [int](Get-ConfigProperty $Config "PrinterStartupTimeoutSeconds")
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  do {
    Start-Sleep -Milliseconds 500
    if (Test-PrinterHealth $healthUrl) {
      Write-WorkstationLog "INFO" "Printer agent became healthy after launch."
      return $true
    }
  } while ((Get-Date) -lt $deadline)

  Write-WorkstationLog "ERROR" "Printer agent did not become healthy within $timeoutSeconds seconds."
  return $false
}

function Get-BrowserWindows {
  param([string]$ProcessName)

  $windows = New-Object System.Collections.ArrayList
  $callback = [SanQWindowNative+EnumWindowsProc]{
    param([IntPtr]$handle, [IntPtr]$lParam)

    if (-not [SanQWindowNative]::IsWindowVisible($handle)) {
      return $true
    }

    [uint32]$processId = 0
    [void][SanQWindowNative]::GetWindowThreadProcessId($handle, [ref]$processId)
    if ($processId -eq 0) {
      return $true
    }

    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      if ($process.ProcessName -ne $ProcessName) {
        return $true
      }
    } catch {
      return $true
    }

    $length = [SanQWindowNative]::GetWindowTextLength($handle)
    $builder = New-Object System.Text.StringBuilder ($length + 1)
    [void][SanQWindowNative]::GetWindowText($handle, $builder, $builder.Capacity)

    [void]$windows.Add([pscustomobject]@{
      Handle = [Int64]$handle
      ProcessId = [int]$processId
      Title = $builder.ToString()
    })
    return $true
  }

  [void][SanQWindowNative]::EnumWindows($callback, [IntPtr]::Zero)
  return @($windows)
}

function Get-WindowByTitle {
  param(
    [string]$ProcessName,
    [string]$TitleContains
  )

  $matches = @(
    Get-BrowserWindows $ProcessName |
      Where-Object {
        -not [string]::IsNullOrWhiteSpace($_.Title) -and
        $_.Title.IndexOf($TitleContains, [StringComparison]::OrdinalIgnoreCase) -ge 0
      }
  )

  if ($matches.Count -gt 1) {
    Write-WorkstationLog "WARN" "Multiple windows matched '$TitleContains'; using the first visible match."
  }

  return ($matches | Select-Object -First 1)
}

function Get-WindowBySavedHandle {
  param(
    [string]$ProcessName,
    [Int64]$HandleValue
  )

  if ($HandleValue -le 0) {
    return $null
  }

  $match = Get-BrowserWindows $ProcessName |
    Where-Object { $_.Handle -eq $HandleValue } |
    Select-Object -First 1

  return $match
}

function Wait-ForNewWindow {
  param(
    [string]$ProcessName,
    [Int64[]]$ExistingHandles,
    [string]$TitleContains,
    [int]$TimeoutSeconds
  )

  $known = @{}
  foreach ($handle in $ExistingHandles) {
    $known[[string]([Int64]$handle)] = $true
  }

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    foreach ($window in (Get-BrowserWindows $ProcessName)) {
      if (-not $known.ContainsKey([string]([Int64]$window.Handle))) {
        return $window
      }
    }

    if (-not [string]::IsNullOrWhiteSpace($TitleContains)) {
      $titleMatch = Get-WindowByTitle $ProcessName $TitleContains
      if ($titleMatch) {
        return $titleMatch
      }
    }

    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)

  return $null
}

function Move-WindowToScreen {
  param(
    $WindowProcess,
    $Screen,
    [string]$Label
  )

  $handle = [IntPtr]([Int64]$WindowProcess.Handle)
  if ($handle -eq [IntPtr]::Zero) {
    throw "$Label window has no visible handle."
  }

  $bounds = $Screen.Bounds
  [void][SanQWindowNative]::ShowWindow($handle, 9)
  $moved = [SanQWindowNative]::MoveWindow(
    $handle,
    $bounds.X,
    $bounds.Y,
    $bounds.Width,
    $bounds.Height,
    $true
  )

  if (-not $moved) {
    throw "Failed to move $Label window to $($Screen.DeviceName)."
  }

  [void][SanQWindowNative]::ShowWindow($handle, 3)
  Write-WorkstationLog "INFO" "$Label window placed on $($Screen.DeviceName) and maximized."
}

function Resolve-CustomerDisplayScreen {
  param($Config)

  $allScreens = @([System.Windows.Forms.Screen]::AllScreens)
  $configuredDevice = [string](Get-ConfigProperty $Config "CustomerDisplayMonitorDeviceName")

  if (-not [string]::IsNullOrWhiteSpace($configuredDevice)) {
    $configured = $allScreens |
      Where-Object { $_.DeviceName -eq $configuredDevice } |
      Select-Object -First 1
    if ($configured) {
      return $configured
    }
    Write-WorkstationLog "WARN" "Configured customer monitor '$configuredDevice' was not found."
  }

  $secondary = $allScreens |
    Where-Object { -not $_.Primary } |
    Select-Object -First 1

  if ($secondary) {
    return $secondary
  }

  $allowFallback = [bool](Get-ConfigProperty $Config "AllowSingleMonitorFallback")
  if ($allowFallback) {
    Write-WorkstationLog "WARN" "No secondary monitor detected; using the primary monitor because AllowSingleMonitorFallback=true."
    return [System.Windows.Forms.Screen]::PrimaryScreen
  }

  return $null
}

if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "Workstation config not found: $ConfigPath. Copy workstation.config.example.json to workstation.config.json and review it first."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$script:LogFile = Initialize-Log $config
$script:StateFile = Join-Path (Split-Path -Parent $script:LogFile) "workstation-state.json"
Write-WorkstationLog "INFO" "SanQ workstation launcher starting."

$exitCode = 0

try {
  $shortcutPath = Resolve-PosPwaShortcut $config
  $shortcut = Read-Shortcut $shortcutPath
  $browserExecutable = Resolve-BrowserExecutable $shortcut.TargetPath
  $browserProcessName = [IO.Path]::GetFileNameWithoutExtension($browserExecutable)
  $profileArguments = @(Get-BrowserProfileArguments $shortcut.Arguments)

  Write-WorkstationLog "INFO" "Using installed SanQ POS PWA shortcut: $shortcutPath"
  Write-WorkstationLog "INFO" "Using Chromium executable: $browserExecutable"

  if (-not (Ensure-PrinterAgent $config)) {
    $exitCode = 2
  }

  $primaryScreen = [System.Windows.Forms.Screen]::PrimaryScreen
  if ($null -eq $primaryScreen) {
    throw "Windows did not report a primary monitor."
  }
  $customerScreen = Resolve-CustomerDisplayScreen $config

  $windowTimeout = [int](Get-ConfigProperty $config "WindowStartupTimeoutSeconds")
  $posTitle = [string](Get-ConfigProperty $config "PosWindowTitleContains")
  $displayTitle = [string](Get-ConfigProperty $config "CustomerDisplayWindowTitleContains")
  $state = Read-WorkstationState

  [Int64]$savedPosHandle = 0
  [Int64]$savedDisplayHandle = 0
  if ($state) {
    if ($state.PSObject.Properties["PosWindowHandle"]) {
      $savedPosHandle = [Int64]$state.PosWindowHandle
    }
    if ($state.PSObject.Properties["CustomerDisplayWindowHandle"]) {
      $savedDisplayHandle = [Int64]$state.CustomerDisplayWindowHandle
    }
  }

  $posWindow = Get-WindowBySavedHandle $browserProcessName $savedPosHandle
  if (-not $posWindow) {
    $posWindow = Get-WindowByTitle $browserProcessName $posTitle
  }

  if (-not $posWindow) {
    $existingHandles = @(
      Get-BrowserWindows $browserProcessName |
        ForEach-Object { [Int64]$_.Handle }
    )
    Write-WorkstationLog "INFO" "Launching installed SanQ POS PWA."
    Start-Process -FilePath $shortcutPath | Out-Null
    $posWindow = Wait-ForNewWindow $browserProcessName $existingHandles $posTitle $windowTimeout
  } else {
    Write-WorkstationLog "INFO" "Existing SanQ POS window found; reusing it."
  }

  if (-not $posWindow) {
    throw "SanQ POS window did not appear within $windowTimeout seconds."
  }
  Move-WindowToScreen $posWindow $primaryScreen "POS"
  $posWindowHandle = [Int64]$posWindow.Handle

  [Int64]$displayWindowHandle = 0
  if ($null -eq $customerScreen) {
    Write-WorkstationLog "ERROR" "No secondary monitor detected. Customer Display was not launched."
    if ($exitCode -eq 0) {
      $exitCode = 3
    }
  } else {
    $displayWindow = Get-WindowBySavedHandle $browserProcessName $savedDisplayHandle
    if (-not $displayWindow) {
      $displayWindow = Get-WindowByTitle $browserProcessName $displayTitle
    }

    if (-not $displayWindow) {
      $existingHandles = @(
        Get-BrowserWindows $browserProcessName |
          ForEach-Object { [Int64]$_.Handle }
      )
      $displayUrl = [string](Get-ConfigProperty $config "CustomerDisplayUrl")
      Write-WorkstationLog "INFO" "Launching Customer Display in the same Chromium profile as POS."
      $displayArguments = @()
      $displayArguments += $profileArguments
      $displayArguments += "--new-window"
      $displayArguments += "--app=$displayUrl"
      Start-Process -FilePath $browserExecutable -ArgumentList $displayArguments | Out-Null
      $displayWindow = Wait-ForNewWindow $browserProcessName $existingHandles $displayTitle $windowTimeout
    } else {
      Write-WorkstationLog "INFO" "Existing Customer Display window found; reusing it."
    }

    if (-not $displayWindow) {
      Write-WorkstationLog "ERROR" "Customer Display window did not appear within $windowTimeout seconds."
      if ($exitCode -eq 0) {
        $exitCode = 4
      }
    } else {
      Move-WindowToScreen $displayWindow $customerScreen "Customer Display"
      $displayWindowHandle = [Int64]$displayWindow.Handle
    }
  }

  try {
    Write-WorkstationState $posWindowHandle $displayWindowHandle
  } catch {
    Write-WorkstationLog "WARN" "Failed to persist non-secret workstation window state: $($_.Exception.Message)"
  }
} catch {
  Write-WorkstationLog "ERROR" $_.Exception.Message
  if ($exitCode -eq 0) {
    $exitCode = 1
  }
}

if ($exitCode -eq 0) {
  Write-WorkstationLog "INFO" "SanQ workstation launcher completed successfully."
} else {
  Write-WorkstationLog "WARN" "SanQ workstation launcher completed with exit code $exitCode. Review the log and use the manual fallback if needed."
}

exit $exitCode
