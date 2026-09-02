# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@443b1a5c` (2026-08-31).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.default-store-identity.v1` | active | implicit `default`/configured fallback → explicit `storeStableId`; production has `Order.storeId IS NULL = 0` and zero `storeId='default'` rows across all eight Uber defaulted tables; the first batch removed Orders historical NULL-store query/preparation/print fallbacks, and this second batch removes singular `/staff/store/*` transport routes | Deploy/verify this Admin route contraction with direct canonical Store config/hours/holidays checks; then audit remaining implicit resolvers and remove eight Uber `@default("default")` schema defaults after explicit-store verification; re-run direct Admin/POS/Uber tests and zero-count queries | Before Phase 2 exit |
| `pos-device.admin-db-id.v1` | active | Admin POS-device DB UUID contract → POS-owned `storeStableId` / `deviceStableId` management contract | New Admin Web uses zero DB UUID fields; stale-browser UUID resolution and no-query legacy list traffic reach zero | Before Store Operations/POS identity exit |
| `web.api-envelope-direct-payload.v1` | active | remaining Checkout legacy browser calls → strict canonical `apiFetch`/`serverApiFetch` | POS session/login direct fetches stay at zero; remaining Checkout 6 reach zero; page-local Checkout envelope/direct-payload reader removed | Before Phase 1 exit |
| `payments.pos-card-legacy.v1` | frozen | direct paid Order → Unified Payment Core + Terminal + finalize | Clover support blocker resolved; real device accepted; one settlement cycle reconciled; legacy calls zero | Before Phase 5B exit |
| `payments.web-checkout-v1.v1` | frozen | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | External validation unblocked; Web cutover accepted; one settlement cycle reconciled; old calls zero | Before Phase 5B exit |

The two payment entries are frozen boundaries, not work queues. Architecture
scanning may observe them, but modularization must not change their production
behavior while external verification remains blocked.

## Closed history

| compat_id | Closed by | Result |
|---|---|---|
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
