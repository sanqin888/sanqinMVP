# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@45e38d95` (2026-09-02).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.default-store-identity.v1` | active / Uber slice 1 VERIFIED / slice 2 staged, verification-gated | implicit `default`/configured fallback → explicit `storeStableId`; PR #2119 / `7110dd46` is production-verified. Slice 2 contracts Operations/OpsTicket runtime fallback: Admin Operations/Reconciliation now requires canonical SanQ `storeStableId`, reconciliation orders are store-scoped, `MENU_PUBLISH` retry context remains canonical `storeStableId`, provider `uberStoreId` is retained only where Store Status calls the Uber store API, and new store-status failure tickets persist canonical `storeStableId`. Historical provider-UUID tickets remain visible/retryable only through an explicit mapping compatibility read. Future item-availability failures are also corrected to create `MENU_ITEM_AVAILABILITY` tickets rather than malformed `MENU_PUBLISH` tickets. `failedSyncEvents` remains a range-level Uber telemetry count because current event producers do not provide a reliable SanQ store identity. No historical row or Prisma default is changed in this slice. | Deploy slice 2 independently, then actively verify Operations list/summary, reconciliation generation, historical ticket visibility/retry safety, POS pause/resume failure/success behavior, and item-availability failure/retry behavior with sanitized log/DB evidence. Only after user confirmation may the 15 legacy store-status rows, 3 malformed historical availability rows, and eight Prisma `@default("default")` declarations enter persistence contraction. | Before Phase 2 exit / before Uber production traffic |
| `payments.pos-card-legacy.v1` | frozen | direct paid Order → Unified Payment Core + Terminal + finalize | Clover support blocker resolved; real device accepted; one settlement cycle reconciled; legacy calls zero | Before Phase 5B exit |
| `payments.web-checkout-v1.v1` | frozen | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | External validation unblocked; Web cutover accepted; one settlement cycle reconciled; old calls zero | Before Phase 5B exit |

The two payment entries are frozen boundaries, not work queues. Architecture
scanning may observe them, but modularization must not change their production
behavior while external verification remains blocked.

## Closed history

| compat_id | Closed by | Result |
|---|---|---|
| `web.api-envelope-direct-payload.v1` | Checkout canonical Web API transport contraction | Checkout OTP request/verify, membership summary, address list/create, and coupon list now use `apiFetch`; all 6 Checkout browser direct fetches, page-local envelope/direct-payload readers, and the Checkout architecture allowance were removed |
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
