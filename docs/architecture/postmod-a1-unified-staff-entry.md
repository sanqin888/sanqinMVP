# Post-Modularization A1 — Unified Staff Entry & Surface Authorization

Date: 2026-09-25  
Baseline: `origin/dev@dfb93962` after P0 PR #2529  
State: **MERGED / CI GREEN / NO MIGRATION / NO PACKAGE CHANGE / NO GRAPH CHANGE — PR #2530 / `524588b6` / CI #6361**

## 1. Frozen role/surface contract

```text
ADMIN      -> Admin + Accounting + POS
ACCOUNTANT -> Accounting only
STAFF      -> POS only
```

A1 owns staff authentication entry, role-aware landing and Web surface admission. It does not remove the intentionally retained STAFF access to selected `/admin/**` API contracts that POS currently consumes for menu/member operations; those are API capabilities used by the POS surface, not permission to enter the Admin application shell.

## 2. Readiness findings

Before A1, Web had three independent login pages:

- `/[locale]/admin/login`;
- `/[locale]/accounting/login`;
- `/[locale]/store/pos/login`.

Admin and Accounting both called `POST /auth/login` with `purpose=admin`; POS called the same Identity-owned endpoint with `purpose=pos` and POS-owned device credentials. The Admin protected layout nevertheless admitted ADMIN / STAFF / ACCOUNTANT, while Accounting and POS layouts already enforced their intended role sets.

Unauthorized browser API handling also routed Accounting to the Admin login page and POS to its own login page, creating three separate recovery paths.

Google OAuth was more important than the duplicated UI: Admin/Accounting used the general membership OAuth start/callback without a staff audience. A Staff login for an unknown Google email could therefore enter the normal customer-creation path before the browser reached a staff surface. The callback also trusted the requested internal callback path without applying the Staff role/surface matrix.

## 3. A1 implementation

A1 introduces one Web entry, `/[locale]/staff/login`, with:

- password login through the existing Identity `POST /auth/login` contract;
- Google OAuth using an authenticated OAuth-state `audience=staff`;
- deterministic role landing and safe requested-destination handling;
- POS device enrollment shown when the requested destination is POS;
- preservation of `purpose=pos` device verification for POS password login;
- legacy Admin / Accounting / POS login URLs retired as non-authenticating tombstones that instruct stale PWA users to uninstall and reinstall before signing in again.

The OAuth state carries only the bounded `staff` audience. In the Staff OAuth path, Auth refuses to create a CUSTOMER and rejects any existing non-staff identity before Google identity binding. After authentication, the callback applies the same role/surface matrix before redirecting.

Admin Web shell admission contracts from ADMIN / STAFF / ACCOUNTANT to ADMIN only. Known authenticated users who request an unauthorized surface are sent to their role's canonical surface instead of being asked to log in again. Accounting remains ADMIN / ACCOUNTANT, and POS remains ADMIN / STAFF.

Middleware now protects all three staff surfaces with the same Staff login recovery path while preserving POS device-cookie enforcement. Browser 401 recovery also converges on the unified entry. Existing Admin action-MFA semantics stay unchanged: `AdminMfaGuard` still protects non-GET Admin operations and the existing Admin 2FA page remains the challenge UI.

## 4. Accounting PWA 404 finding / A2 boundary

The Accounting PWA manifest currently has:

```text
id        /pwa/accounting
start_url /accounting
scope     /
```

The locale middleware rewrites `/accounting` to `/[locale]/accounting`, but there is no `accounting/page.tsx`; only the layout and child pages such as `accounting/dashboard` exist. Therefore an **already-authenticated** installed Accounting PWA launch reaches a real missing route and returns 404.

A1 prevents the unauthenticated variant from returning to that missing root: Staff return-destination policy canonicalizes exact `/[locale]/accounting` to `/[locale]/accounting/dashboard`. Immediate follow-up **A2** now implements the remaining launch correction locally: new installs launch `/accounting/dashboard`, and the localized Accounting root exists only as a canonical redirect to the dashboard so stale/cached `/accounting` PWA launches recover without adding Accounting-specific authentication behavior.

## 5. Architecture and compatibility

No Prisma/schema/migration, dependency manifest/lockfile, new context direction, scanner allowance, public SCC or payment/provider behavior changes.

POS device enrollment remains POS-owned. Identity only consumes the existing POS credential-verification port for `purpose=pos`; A1 does not move device persistence into Auth.

Legacy login URLs are not compatibility aliases. They render only a retirement notice for stale PWA/bookmark traffic and provide no authentication or redirect into the unified Staff entry.

## 6. Review / verification

Per `AGENTS.md`, local lint/build/test/scanner commands are not run before user review. GitHub Actions is the validation gate after remote authorization.

Focused regressions added for:

- Web role/surface matrix and safe `next` handling;
- Accounting-root return canonicalization;
- API Staff OAuth redirect policy;
- Staff OAuth rejection of unknown/customer identities before CUSTOMER creation or Google binding.

After merge/deploy, active verification should cover ADMIN / ACCOUNTANT / STAFF password landing, Staff Google OAuth landing, wrong-surface redirection, expired-session recovery, POS device-bound entry, and the three legacy login retirement notices. A2 then verifies installed Accounting PWA direct launch in authenticated and unauthenticated states.
