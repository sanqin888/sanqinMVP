# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@443b1a5c` (2026-08-31).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.business-config.v1` | active | BusinessConfig → BrandConfig + StoreConfig; application runtime and staff Web consumers are canonical and the owner-maintained BusinessConfig mirror is stopped, while the physical table/trigger remain temporarily | Deploy this application contraction; record `BusinessConfig.updatedAt`; actively change/restore one mirrored Admin setting and POS pause/resume; canonical values must change while BusinessConfig stays untouched and final 29-field parity returns to zero; then authorize destructive contraction | Before Phase 2 exit |
| `brand-store.default-store-identity.v1` | active | implicit `default` store → explicit `storeStableId`; canonical POS Orders/StoreStatus/Admin Store contexts are explicit, while the configured original store temporarily reads historical `Order.storeId=NULL` rows and singular staff routes remain stale-bundle compatibility | Default/NULL rows backfilled; implicit resolution metric zero; schema default and fallback routes removed after observation | Before Phase 2 exit |
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
