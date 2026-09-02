# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@443b1a5c` (2026-08-31).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.default-store-identity.v1` | active | implicit `default`/configured fallback → explicit `storeStableId`; production has `Order.storeId IS NULL = 0` and zero `storeId='default'` rows across all eight Uber defaulted tables; the first batch removed Orders historical NULL-store fallbacks, the second removed singular `/staff/store/*`, the third removes unused `/admin/business/*` transport, and the fourth splits Brand/Store writes, names deployment-store reads explicitly, and threads authenticated POS store identity into exchange-rate timezone selection while keeping `wechatAlipayExchangeRate` Brand-owned | Deploy/verify the third/fourth contractions with direct canonical Admin Brand/Store and POS exchange-rate checks. Non-Uber production callers no longer express configured Store identity by omitting the argument; Uber composition remains the only no-argument `getStoreSnapshot()` caller and stays separate until mixed local/Uber identity semantics are normalized and external freeze conditions permit changes | Before Phase 2 exit |
| `web.api-envelope-direct-payload.v1` | active | remaining Checkout legacy browser calls → strict canonical `apiFetch`/`serverApiFetch` | POS session/login direct fetches stay at zero; remaining Checkout 6 reach zero; page-local Checkout envelope/direct-payload reader removed | Before Phase 1 exit |
| `payments.pos-card-legacy.v1` | frozen | direct paid Order → Unified Payment Core + Terminal + finalize | Clover support blocker resolved; real device accepted; one settlement cycle reconciled; legacy calls zero | Before Phase 5B exit |
| `payments.web-checkout-v1.v1` | frozen | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | External validation unblocked; Web cutover accepted; one settlement cycle reconciled; old calls zero | Before Phase 5B exit |

The two payment entries are frozen boundaries, not work queues. Architecture
scanning may observe them, but modularization must not change their production
behavior while external verification remains blocked.

## Closed history

| compat_id | Closed by | Result |
|---|---|---|
| `pos-device.admin-db-id.v1` | Store Operations/POS Admin DB-ID contraction | Admin create/list/reset/status/delete now require `storeStableId`/`deviceStableId`; no-query aliases, inbound Store/device DB UUID resolvers, `POS_DEVICE_ADMIN_COMPATIBILITY`, and `STORE_LEGACY_DB_ID_RESOLVER` were removed after canonical production traffic and zero compatibility-log usage were verified |
| `brand-store.business-config.v1` | PR #2099 + PR #2101 / `277a5276` | BusinessConfig application mirror, Prisma model, physical table, sync trigger/function were removed; post-deploy Admin persisted exchange rate 5.2, POS pause/resume and Uber store-status sync succeeded, canonical rows remained healthy, and error scans were clean |
| `orders.order-item-components.v1` | PR #2004 / `b8413cd7` | Production dry-run found zero actionable rows; planner/CLI and legacy read reconstruction were removed |

## Candidate review queue

These are not yet declared active compatibility. Before deleting or preserving
them, verify live callers, traffic, queue/dynamic loading, and side effects:

- EventEmitter aliases versus durable outbox events.

The former Next rewrite versus `app/api/[...path]` proxy overlap was resolved in
PR #2020 by making the App Router BFF the single regular JSON API entry.

Every new non-atomic compatibility path must add a unique `compat_id`, all
required lifecycle fields in the JSON register, and an `@compat <compat_id>`
annotation at the code path. The scanner rejects an annotation that is absent
from the register.
