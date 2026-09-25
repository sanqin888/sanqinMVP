# SanQ Windows POS workstation launcher

This directory owns only Windows workstation orchestration. It does not own POS authentication, device enrollment, order/payment state, Customer Display synchronization, printer transport, or PWA business behavior.

## C1/C2 scope

The workstation tools coordinate three already-existing runtime components:

1. the installed **SanQ POS PWA** on the Windows primary monitor;
2. the read-only **Customer Display** on a non-primary monitor;
3. the existing printer agent at `C:\pos-printer-server`.

C1 established the manual launcher. C2 adds true borderless fullscreen plus optional current-user Task Scheduler startup/recovery around that same launcher. C2 does not add another POS/session/network/printer implementation.

## Why the installed POS shortcut is authoritative

POS and Customer Display must run in the same Chromium browser profile because their existing synchronization uses same-origin `localStorage` plus `BroadcastChannel` with polling fallback.

The launcher therefore starts POS from the real installed **SanQ POS** PWA shortcut. It reads that shortcut's Chromium target and profile arguments, then uses the same browser/profile to open Customer Display as an app window. It does not invent or persist browser cookies, session IDs, POS device credentials, or app IDs.

Do not configure POS to run in Chrome while Customer Display runs in Edge, or vice versa.

## Files

- `launch-workstation.ps1` — idempotent launcher with `Launch` and quiet `Ensure` modes.
- `supervise-workstation.ps1` — one long-running current-user supervisor: initial Launch, then periodic Ensure.
- `install-startup-task.ps1` — installs the supervisor as a current-user interactive Scheduled Task at logon.
- `uninstall-startup-task.ps1` — removes only that Scheduled Task; it does not close POS/Display or stop printing.
- `start-sanq-workstation.cmd` — convenience wrapper for a manual Launch.
- `workstation.config.example.json` — non-secret configuration template.
- `validate.ps1` — CI-only syntax/config/ScheduledTasks contract validation; it does not register tasks or launch workstation processes.

## First-time workstation setup

1. Install one supported Chromium browser on the POS workstation (Chrome or Edge).
2. Open SanQ in that browser profile and install the **SanQ POS** PWA created by `/pos.webmanifest`.
3. Confirm Windows has an installed PWA shortcut named `SanQ POS.lnk`. The launcher searches the current user's Desktop and Start Menu recursively. If the shortcut has a different location/name, set `PosPwaShortcutPath` explicitly.
4. Keep the existing printer agent installed at `C:\pos-printer-server`, including `start-printer-server.vbs`.
5. Copy this directory to a stable workstation path, for example `C:\SanQ\workstation`.
6. Copy `workstation.config.example.json` to `workstation.config.json` and review the values.
7. Run `start-sanq-workstation.cmd` manually.

No administrator privileges should be required for the normal launcher when the browser/PWA and printer agent are already installed for the current user.

## Configuration

`workstation.config.json` is local workstation configuration and should not be committed.

- `PosPwaShortcutPath`: optional explicit path to the installed SanQ POS PWA shortcut. Empty means auto-discover `SanQ POS.lnk`.
- `PosWindowTitleContains`: substring used to identify the already-running POS window.
- `CustomerDisplayUrl`: Customer Display URL. The default language-neutral URL relies on existing SanQ locale middleware/cookies.
- `CustomerDisplayWindowTitleContains`: substring used to find the display app window.
- `CustomerDisplayMonitorDeviceName`: optional Windows monitor device name such as `\\.\DISPLAY2`. Empty means first non-primary monitor.
- `AllowSingleMonitorFallback`: default `false`. When false, POS still launches but Customer Display is skipped if no second monitor exists.
- `PrinterHealthUrl`: existing printer-agent health endpoint.
- `PrinterStartScript`: existing VBS wrapper used when health check fails.
- `PrinterStartupTimeoutSeconds`: time allowed for the existing printer agent to become healthy.
- `WindowStartupTimeoutSeconds`: time allowed for each browser window to become visible.
- `EnsureIntervalSeconds`: periodic recovery interval used by the C2 supervisor. Allowed range is 30–3600 seconds; the example uses 60. Existing C1 configs without this property fall back to 60 seconds.
- `LogDirectory`: optional local log directory. Empty defaults to `%LOCALAPPDATA%\SanQ\Workstation\logs`.

The config contains no password, session cookie, POS device key, printer enrollment credential, or provider secret.

## Runtime behavior

The launcher is intentionally idempotent. It keeps a non-secret `workstation-state.json` beside the local logs containing only the last POS/Display window handles, so a POS window that has redirected to Staff login after session expiry can still be recognized without depending on its current title.

- if printer-agent health already passes, it is left alone;
- if printer-agent health fails, the launcher starts the existing VBS wrapper and waits for health;
- if a saved POS window handle is still valid, it is reused even if the current page title changed; otherwise the launcher falls back to title/new-window detection;
- if a saved Customer Display window is still valid, it is reused;
- Launch mode places POS on the Windows primary display and Customer Display on the selected non-primary display in borderless fullscreen, removing the normal Chromium/PWA caption controls and covering the taskbar area;
- Ensure mode leaves healthy existing windows untouched so the periodic supervisor does not steal focus or repeatedly rearrange the workstation;
- if POS or Customer Display is missing during Ensure, only that missing window is relaunched and placed in fullscreen;
- no browser process is killed or forcibly reloaded.

A printer failure does not prevent POS from opening. The launcher records a non-zero exit code so recovery can continue without taking over printer retry semantics.

## C2 startup / recovery

C2 uses one Task Scheduler entry named `SanQ POS Workstation` by default. The task runs only for the current interactive user at logon and starts `supervise-workstation.ps1` hidden.

The supervisor:

1. runs one `Launch` immediately;
2. waits `EnsureIntervalSeconds`;
3. runs one `Ensure` at a time forever;
4. keeps running after degraded launcher exit codes so a later ensure can recover missing printer/window state.

Task settings use `MultipleInstances=IgnoreNew`, current-user interactive logon, limited run level, restart-on-supervisor-failure, and no execution time limit. The supervisor also holds a per-user local mutex so manually starting a second supervisor exits without creating a second recovery loop.

To install after manual C1/C2 verification:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\install-startup-task.ps1
```

The installer does **not** start the task immediately. Use the next Windows logon for the normal path, or deliberately test it from Task Scheduler / `Start-ScheduledTask`.

To remove only the startup/recovery task:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File .\uninstall-startup-task.ps1
```

Uninstalling the task does not close existing POS/Display windows and does not stop the printer agent.

## Manual fallback

If the launcher fails:

1. Start the installed **SanQ POS** PWA manually from its Windows shortcut.
2. In the **same browser profile**, open `https://sanq.ca/store/display` as an app/browser window and move it to the customer monitor.
3. If printing is unavailable, run `C:\pos-printer-server\start-printer-server.vbs`.
4. Review the latest workstation log under the configured log directory.

Do not use a different browser/profile for the Customer Display; browser-local snapshot synchronization would no longer be shared.

## C2 boundaries

C2 installs only the one current-user interactive Scheduled Task described above. It does not:

- modify the Windows Startup folder or machine-wide services;
- run GUI recovery when the configured user is not interactively logged in;
- auto-reload a healthy POS for PWA/service-worker updates;
- kill/restart a healthy browser process;
- replace POS session keep-alive, connectivity heartbeat, or 401 recovery;
- change Customer Display snapshot/storage/channel contracts;
- change printer-agent reconnect, ACK/dedupe, enrollment, or print behavior;
- write browser/session/device credentials.

A4-D owns the deliberate store-workstation operational verification and final runbook closeout.
