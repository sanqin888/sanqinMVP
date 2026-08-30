# Phase 1 modularization closeout

Closeout base: `origin/dev@a050d8b2` (2026-08-30).

This document reconciles the original full-site modularization audit with the
actual Phase 1 changes merged to `dev` and the final low-risk cleanup performed
in this closeout branch.

## Status

**Phase 1 low-risk cleanup is functionally complete except for one explicitly
tracked Web compatibility item.** The remaining item is not hidden or widened:
`web.api-envelope-direct-payload.v1` still records 11 legacy browser calls in
Checkout/POS and therefore prevents claiming the compatibility register's formal
"Before Phase 1 exit" condition as fully satisfied.

The canonical Web transports themselves are complete and strict. The remaining
calls are risk-scoped debt to migrate separately rather than a reason to weaken
or bypass the new architecture gate.

## Completed Phase 0/1 slices

| Area | Result | Evidence |
|---|---|---|
| Architecture baseline and CI guardrails | 12 contexts, dependency limits, ID inventory and compatibility register established | PR #2009 |
| OTP characterization / ChallengeEngine | duplicated challenge lifecycle consolidated behind the Identity challenge engine | PRs #2011, #2013 |
| PWA icon paths | manifest and iOS metadata point to real icon assets | PR #2014 |
| Order shared contract ownership | Order contracts moved to `@shared/order`; unrelated Menu re-export removed | PR #2015 |
| Pricing ownership | daily-special policy moved from `common` to Promotions/Pricing public ownership | PR #2016 |
| Browser API protocol | canonical strict-envelope `apiFetch` and browser direct-fetch gate | PR #2018 |
| Membership browser transport | Membership moved from legacy direct fetch/unwrap to canonical API client | PR #2019 |
| Server/BFF API protocol | one App Router JSON BFF, one `serverApiFetch`, one shared envelope parser; ngrok/rewrite overlap removed | PR #2020 |
| Generated shared artifacts | stale root `menu.js`, `menu.js.map`, `menu.d.ts` removed; root emit ignored | this closeout |
| Shared manifest hygiene | duplicate `dependencies` key removed without dependency/version change | this closeout |
| `common` reverse business dependency | StableId validation no longer imports `@shared/menu` | this closeout |
| Confirmed unused shells | unreferenced menu publish use-case shell, deprecated Order event listener and unused StableId decorator removed | this closeout |
| Phase boundary records | dependency graph, ID inventory, architecture README and compatibility register refreshed | this closeout |

## Architecture debt reduced in this closeout

Deleting the deprecated `OrderEventListener` removes one direct
`commerce-orders-fulfillment -> messaging-notifications` import. The CI baseline
is lowered from 9 to 8 in the same change so the debt cannot return.

The final `common -> @shared/menu` StableId import is also removed. This was
approved public-alias traffic rather than a legacy direct-import allowance, so it
does not require a numeric baseline entry, but it restores the intended rule that
architecture-foundation does not depend on a business context.

## Compatibility still active

### `web.api-envelope-direct-payload.v1`

Canonical `apiFetch` and `serverApiFetch` already reject direct payload drift and
share one `code/message/details` parser. Remaining legacy browser calls are:

- Checkout: 6 direct fetches.
- POS `PosSessionKeepAlive`: 3 direct fetches.
- POS login: 2 direct fetches.

These 11 calls are pinned by the architecture scanner. Checkout is payment-adjacent
and POS has device/session behavior, so this closeout does not broaden into those
risk areas. Their dedicated migrations must reduce the allowances to zero and
remove Checkout's page-local envelope/direct-payload reader before the compatibility
entry can move to closed history.

### Frozen Payments/Clover entries

`payments.pos-card-legacy.v1` and `payments.web-checkout-v1.v1` remain frozen.
This closeout makes no production payment-path change.

## Reviewed but not deleted

- EventEmitter aliases alongside durable outbox events remain a review candidate;
  live consumers/duplicate side effects must be measured first.
- Notification disabled/fallback logic and versioned Uber event files were not
  deleted because dynamic/operational behavior is not sufficiently proven and the
  Uber boundary is frozen for structural changes.
- `@shared/menu` still exposes the generic StableId helper for a Web consumer.
  Moving that primitive into a new neutral shared architecture-foundation package
  would change package/boundary ownership and therefore requires an explicit
  architecture decision rather than an opportunistic closeout edit. Server
  `common` no longer depends on it.

## Required production smoke verification

CI proves compile/type/test/architecture consistency but cannot prove deployed
cookie, PWA or device behavior. Before treating the Web transport changes as
production-observed, run these smoke checks after deploying the merged Phase 1
code:

1. Customer login -> Membership summary/coupons/ledger/profile -> logout.
2. Admin login -> MFA (when required) -> protected Admin page.
3. Accounting login -> protected Accounting page.
4. POS login/claim -> POS protected shell -> keepalive/heartbeat remains healthy.
5. Public menu and daily-special display load normally; item images under
   `/uploads/*` still render.
6. Membership rules SSR page loads through `serverApiFetch`.
7. PWA uninstall/reinstall or cache-update check confirms the corrected icons and
   the current service-worker bundle.
8. One phone OTP and one email OTP/MFA flow confirms provider/secrets integration
   after ChallengeEngine consolidation.

No full Clover payment or Uber production re-verification is required by this
closeout because those production protocol paths were not structurally changed.

## Phase 2 entry condition

Brand/Store Phase 2 may begin without changing the frozen payment/Uber paths.
Before any schema migration or package-boundary change, follow the repository's
explicit authorization requirements. The Phase 2 work should start with the
BusinessConfig field-ownership matrix and read-only data audit, then use
expand/backfill/cutover/contract for Store identity/config changes.
