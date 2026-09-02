# Phase 1 modularization closeout

Closeout base: `origin/dev@a050d8b2` (2026-08-30).

This document reconciles the original full-site modularization audit with the
actual Phase 1 changes merged to `dev` and the final low-risk cleanup performed
in this closeout branch.

## Status

**Phase 1 low-risk cleanup is now complete.** The final tracked Web compatibility
item, `web.api-envelope-direct-payload.v1`, was contracted on 2026-09-02: Checkout's
remaining 6 regular JSON browser calls now use the canonical `apiFetch`, its
page-local envelope/direct-payload readers are removed, and the architecture
allowance is deleted. The formal "Before Phase 1 exit" compatibility condition is
therefore satisfied in source.

The canonical Web transports remain strict: regular browser JSON calls use
`apiFetch`, App Router server calls use `serverApiFetch`, and only documented raw
binary/beacon/provider transports retain direct `fetch` allowances.

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

## Compatibility closeout

### `web.api-envelope-direct-payload.v1`

Canonical `apiFetch` and `serverApiFetch` reject direct payload drift and share one
`code/message/details` parser. POS session/device calls had already moved to the
canonical client; the 2026-09-02 Checkout contraction moved the remaining 6 regular
JSON calls (OTP request/verify, membership summary, address list/create, and coupon
list) to `apiFetch` as well.

Checkout now has zero direct browser `fetch` calls and no page-local
`ApiEnvelope`/direct-payload compatibility reader. Its architecture allowance was
removed, so the scanner will reject any future reintroduction as new direct-fetch
debt. `web.api-envelope-direct-payload.v1` is therefore closed.

### Frozen Payments/Clover entries

`payments.pos-card-legacy.v1` and `payments.web-checkout-v1.v1` remain frozen.
This closeout makes no production payment-path change.

## Reviewed but not deleted

- EventEmitter aliases alongside durable outbox events remain a review candidate;
  live consumers/duplicate side effects must be measured first.
- Notification disabled/fallback logic and versioned Uber event files were not
  deleted because dynamic/operational behavior was not sufficiently proven and the
  Uber boundary was frozen for structural changes at Phase 1 closeout time. That
  structural freeze was explicitly lifted by the user on 2026-09-02; subsequent
  Uber changes follow the slice-by-slice active verification gate in `AGENTS.md`.

## Post-closeout StableId ownership decision

The explicit follow-up architecture decision moves generic StableId validation
primitives into neutral `@shared/foundation`. API `common` uses that implementation,
Web imports the foundation package directly, and `@shared/menu` no longer exports
StableId helpers. The architecture scanner registers the package under
`architecture-foundation` and rejects duplicate primitive implementations or
business-package re-exports.

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

Brand/Store Phase 2 originally began while both payment and Uber provider paths
were structurally frozen. The Uber structural freeze was explicitly lifted on
2026-09-02 so the remaining Store-identity contraction can be completed before
real Uber production traffic; Payments/Clover remains frozen while its external
blocker is open. Before any schema migration or package-boundary change, follow
the repository's explicit authorization requirements. Uber work must additionally
follow the per-slice active verification gate in `AGENTS.md` before advancing to
the next Uber code slice.
