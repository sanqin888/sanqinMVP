# Post-modularization A4 — Windows POS PWA + dual-display workstation

## Status

2026-09-25: **A4-A LOCAL SOURCE READY FOR REVIEW / NO MIGRATION / NO NEW DEPENDENCY / NO GRAPH CHANGE**

Branch: `postmod/a4a-pos-pwa-identity` from current `origin/dev`.

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

Define workstation launch expectations for the existing `/[locale]/store/display` route while keeping it read-only and preserving localStorage/BroadcastChannel/polling synchronization.

### A4-C — Windows workstation launcher / recovery

Select and implement the Windows orchestration boundary for launching the POS main display, customer display on the second monitor, and printer agent, including restart/full-screen/recovery behavior. The repository currently has no general workstation launcher, so this slice requires an explicit implementation decision before source changes.

### A4-D — Operational verification / runbook

Document and actively verify cold boot, browser/app restart, network loss/recovery, session expiry, device re-enrollment, PWA update/cache recovery, second-display recovery, printer-agent reconnect, and manual launch fallback.
