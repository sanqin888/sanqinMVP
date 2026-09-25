# SanQ Windows POS workstation launcher

This directory owns only Windows workstation orchestration. It does not own POS authentication, device enrollment, order/payment state, Customer Display synchronization, printer transport, or PWA business behavior.

## C1 scope

The launcher coordinates three already-existing runtime components:

1. the installed **SanQ POS PWA** on the Windows primary monitor;
2. the read-only **Customer Display** on a non-primary monitor;
3. the existing printer agent at `C:\pos-printer-server`.

It intentionally does **not** install Task Scheduler or Windows Startup entries in C1. Startup automation/recovery installation belongs to A4-C2.

## Why the installed POS shortcut is authoritative

POS and Customer Display must run in the same Chromium browser profile because their existing synchronization uses same-origin `localStorage` plus `BroadcastChannel` with polling fallback.

The launcher therefore starts POS from the real installed **SanQ POS** PWA shortcut. It reads that shortcut's Chromium target and profile arguments, then uses the same browser/profile to open Customer Display as an app window. It does not invent or persist browser cookies, session IDs, POS device credentials, or app IDs.

Do not configure POS to run in Chrome while Customer Display runs in Edge, or vice versa.

## Files

- `launch-workstation.ps1` — idempotent manual workstation launcher.
- `start-sanq-workstation.cmd` — convenience wrapper for Windows PowerShell.
- `workstation.config.example.json` — non-secret configuration template.
- `validate.ps1` — CI-only syntax/config validation; it does not launch anything.

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
- `LogDirectory`: optional local log directory. Empty defaults to `%LOCALAPPDATA%\SanQ\Workstation\logs`.

The config contains no password, session cookie, POS device key, printer enrollment credential, or provider secret.

## Runtime behavior

The launcher is intentionally idempotent. It keeps a non-secret `workstation-state.json` beside the local logs containing only the last POS/Display window handles, so a POS window that has redirected to Staff login after session expiry can still be recognized without depending on its current title.

- if printer-agent health already passes, it is left alone;
- if printer-agent health fails, the launcher starts the existing VBS wrapper and waits for health;
- if a saved POS window handle is still valid, it is reused even if the current page title changed; otherwise the launcher falls back to title/new-window detection;
- if a saved Customer Display window is still valid, it is reused;
- POS is moved to the Windows primary display and maximized;
- Customer Display is moved to the selected non-primary display and maximized;
- no browser process is killed or forcibly reloaded.

A printer failure does not prevent POS from opening. The launcher records a non-zero exit code so later C2 recovery automation can detect that the workstation is degraded without taking over printer retry semantics.

## Manual fallback

If the launcher fails:

1. Start the installed **SanQ POS** PWA manually from its Windows shortcut.
2. In the **same browser profile**, open `https://sanq.ca/store/display` as an app/browser window and move it to the customer monitor.
3. If printing is unavailable, run `C:\pos-printer-server\start-printer-server.vbs`.
4. Review the latest workstation log under the configured log directory.

Do not use a different browser/profile for the Customer Display; browser-local snapshot synchronization would no longer be shared.

## C1 boundaries

C1 does not:

- create or install Scheduled Tasks;
- modify Windows Startup;
- auto-reload the POS after PWA/service-worker updates;
- replace POS session keep-alive, connectivity heartbeat, or 401 recovery;
- change Customer Display snapshot/storage/channel contracts;
- change printer-agent reconnect, ACK/dedupe, enrollment, or print behavior;
- write browser/session/device credentials.

Those recovery/installation decisions belong to A4-C2/A4-D after C1 is reviewed and verified.
