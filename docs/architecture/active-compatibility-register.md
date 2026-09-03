# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@fed618bd` (2026-09-02).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active or externally frozen

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `brand-store.default-store-identity.v1` | active / Uber slices 1-2 VERIFIED / persistence contraction staged, verification-gated | implicit `default`/configured fallback → explicit `storeStableId`; PR #2119 / `7110dd46` and PR #2122 / `53688897` are production-verified. The persistence contraction removes the eight Uber Prisma `storeId @default("default")` defaults so missing store identity fails instead of being silently persisted as `default`. Existing rows are intentionally preserved exactly as-is. | Deploy this persistence slice independently, then actively verify Admin Uber/Reconciliation/OpsTicket pages, create a new Reconciliation Report with `storeId=4750_Yonge_Street`, POS pause 15 min + manual resume, item availability off/on, zero newly-created `storeId='default'` rows, and no missing-store Prisma/validation errors. After user confirmation, reassess whether the Uber persistence portion can be CLOSED. | Before Phase 2 exit / before Uber production traffic |
| `payments.pos-card-legacy.v1` | frozen | direct paid Order → Unified Payment Core + Terminal + finalize | Clover support blocker resolved; real device accepted; one settlement cycle reconciled; legacy calls zero | Before Phase 5B exit |
| `payments.web-checkout-v1.v1` | frozen | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | External validation unblocked; Web cutover accepted; one settlement cycle reconciled; old calls zero | Before Phase 5B exit |

The historical Uber Test Store/sandbox rows are **not** backfilled as part of
`brand-store.default-store-identity.v1` and must not be treated as a closure
blocker for this persistence contraction. This includes legacy provider-UUID
OpsTickets, malformed historical availability tickets, historical
`storeId='default'` rows, and other verification-era Uber records. After Uber
verification is approved and Production cutover begins, handle them in a separate
**Uber Production Cutover Cleanup**: re-audit each Uber table and selectively
remove sandbox/test history. Do not indiscriminately clear OAuth connections,
Store mappings, menu configuration, or other state that Production initialization
still requires.

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
