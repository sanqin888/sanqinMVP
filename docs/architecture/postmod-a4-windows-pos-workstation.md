# Post-modularization A4 — Windows POS PWA + dual-display workstation

## Status

2026-09-25: **A4-A + A4-B MERGED / CI GREEN / A4-C1 LOCAL SOURCE READY FOR REVIEW / EXPLICITLY AUTHORIZED NEW OPERATIONAL BOUNDARY / NO MIGRATION / NO NEW DEPENDENCY / NO GRAPH CHANGE**

A4-A merged through PR #2537 / squash `6f77d5cc` with CI #6381. A4-B merged through PR #2538 / squash `2d0d1a58` with CI #6383. A4-C1 is on `postmod/a4c1-windows-workstation-launcher` from current `origin/dev`.

A4 is a workstation project layered on the existing Store Operations / POS / Print boundaries. It does not move authentication, device enrollment, order, payment, customer-display synchronization, or printer ownership.

## Existing authoritative behavior

- A1 owns the unified Staff authentication entry and role/surface matrix.
- POS remains available only to ADMIN/STAFF.
- POS device enrollment remains enforced by the existing `posDeviceId` + `posDeviceKey` cookie gate.
- `/[locale]/store/display` is the existing read-only customer display.
- POS/customer-display synchronization already uses same-origin localStorage plus BroadcastChannel with polling fallback and remains authoritative.
- A3 established the independently deployed Windows printer-agent package, deterministic rendering coverage, ACK/dedupe/reconnect coverage, and the repository-managed production receipt logo.

A4 must preserve these contracts rather than create a second workstation-specific auth/sync/print implementation.

## A4-A — POS PWA identity / launch contract

### Goal

Make POS an independently installable staff PWA, comparable to Admin and Accounting, without changing the current authenticated/device-bound POS route behavior.

### Source contract

A4-A adds:

- `/pos.webmanifest`;
- independent app identity `/pwa/pos`;
- language-neutral `start_url=/store/pos`;
- standalone display metadata on the existing localized POS layout;
- a repository-hosted existing SanQ PNG icon;
- regression coverage proving Customer/Admin/Accounting/POS PWA identities remain distinct and proving the POS route group binds to the POS manifest.

The non-localized launch URL intentionally relies on the existing locale middleware. It redirects `/store/pos` to `/{locale}/store/pos`, after which the existing A1 gates remain authoritative:

1. no Staff session -> unified `/{locale}/staff/login` with safe POS return;
2. session but missing POS device cookies -> unified Staff login with `needDevice=1`;
3. ADMIN/STAFF + valid device binding -> POS;
4. ACCOUNTANT -> canonical Accounting landing through the existing POS layout role guard.

No old POS-login compatibility entry is restored.

### Compatibility / PWA safety

This is additive. No existing manifest, route, public field, device cookie, storage key, BroadcastChannel name, print wire contract, or installed customer/Admin/Accounting PWA identity is removed or renamed.

The POS manifest uses an independent `id`; sharing an existing SanQ icon asset does not merge PWA identities.

### Verification state

Per `AGENTS.md`, local lint/build/test is not run before user review. GitHub Actions remains the authoritative validation gate after remote authorization.

A4 phase-level active verification must later include:

- fresh POS install launches to POS without an Admin/Accounting prerequisite;
- logged-out launch reaches unified Staff login and returns to POS;
- missing device binding reaches the existing enrollment flow;
- ADMIN and STAFF may enter; ACCOUNTANT cannot;
- locale preference is preserved by the language-neutral launch redirect;
- refresh / session expiry / browser restart behavior remains consistent;
- existing customer-display sync and printer-agent behavior remain unchanged.

## Remaining A4 slices

### A4-B — Customer-display launch contract

A4-B keeps the existing `/{locale}/store/display` page as a non-installable, read-only workstation route rather than creating a fifth PWA identity. A route-specific layout removes the inherited customer manifest, disables Apple standalone capability for this surface, and marks the display non-indexable. The launch URL remains the existing localized route; A4-C may open it in a dedicated browser/app window on the second monitor.

Regression coverage locks the current local projection contract: the display reads `POS_DISPLAY_STORAGE_KEY`, listens to `storage` and `POS_DISPLAY_CHANNEL`, retains the 800ms polling fallback, performs no network fetch/mutation, writes no display storage, and exposes no button/form/input interaction. The POS/payment writers, snapshot schema, BroadcastChannel name and polling cadence are unchanged.

### A4-C — Windows workstation launcher / recovery

#### A4-C1 — launcher foundation

A4-C1 is the explicitly authorized new Windows operational boundary under `tools/windows-pos-workstation`. It coordinates existing owners only; it does not move Staff auth, POS device enrollment, orders/payments, browser-local display sync or printer transport into a new module.

The canonical POS launch source is the real installed `SanQ POS.lnk` created by the Chromium-installed PWA. The launcher reads the shortcut target/profile arguments, launches or reuses that installed POS PWA, and uses the same Chromium executable/profile to open `https://sanq.ca/store/display` as the non-installable Customer Display app window. This same-profile invariant is required by the existing localStorage + BroadcastChannel synchronization contract.

C1 runtime responsibilities are deliberately narrow:

- health-check the existing printer agent at `127.0.0.1:19191` and start the existing VBS wrapper only when unhealthy;
- launch/reuse POS and Customer Display windows without killing browser processes;
- place/maximize POS on the Windows primary monitor;
- place/maximize Customer Display on an explicitly configured or first available non-primary monitor;
- preserve POS operation when the printer agent or second monitor is unavailable while returning a non-zero launcher status for diagnostics;
- write local non-secret workstation logs;
- persist only non-secret POS/Display window handles for idempotent reuse across title changes such as Staff-login redirection;
- keep local `workstation.config.json` ignored by Git.

No Scheduled Task or Windows Startup entry is installed in C1. No browser/session/device credential is stored in workstation config. A Windows CI job uses Windows PowerShell 5.1 to parse the launcher and validate the example JSON only; CI never launches browser/printer processes.

#### A4-C2 — startup / recovery installation

After C1 is reviewed and manually verified on the store workstation, C2 may add an idempotent Windows startup/Task Scheduler installer and periodic ensure/recovery policy. C2 must reuse C1 rather than adding another launcher implementation, and must not replace POS session/network recovery or printer-agent reconnect semantics.

### A4-D — Operational verification / runbook

Document and actively verify cold boot, browser/app restart, network loss/recovery, session expiry, device re-enrollment, PWA update/cache recovery, second-display recovery, printer-agent reconnect, and manual launch fallback.
