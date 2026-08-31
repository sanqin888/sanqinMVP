# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Phase 1 closeout base:
`origin/dev@a050d8b2` (2026-08-30).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.business-config.v1` | active | BusinessConfig → BrandConfig + StoreConfig snapshot; Brand/Store production reads are canonical, while POS/Admin compatibility writes remain | All field owners assigned; difference report zero for one business cycle; old reads/writes zero | Before Phase 2 exit |
| `brand-store.default-store-identity.v1` | active | implicit `default` store → explicit `storeStableId` | Rows backfilled; implicit resolution metric zero; schema default removed | Before Phase 2 exit |
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
