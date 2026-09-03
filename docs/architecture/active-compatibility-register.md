# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@c47c2ca5` (2026-09-03).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active / guarded compatibility

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `payments.pos-card-legacy.v1` | active / pre-production | direct paid Order → Unified Payment Core + Terminal + finalize | Real-device acceptance complete; one settlement cycle reconciled; legacy calls zero before cutover cleanup | Before Phase 5B exit |
| `payments.web-checkout-v1.v1` | guarded production | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | Web cutover accepted; one settlement cycle reconciled; old calls zero before compatibility deletion | Before Phase 5B exit |

The payment entries are no longer governed by a whole-context freeze. The POS
Clover Terminal path is pre-production and may be structurally modularized before
Clover real-device access is restored, provided the live Web Ecommerce path and
production payment facts are unchanged. The Web Clover path remains protected by
default because it is actively processing production payments; however, if it
becomes a documented critical modularization blocker, a narrowly scoped change is
allowed after recording impact, alternatives and rollback/forward-fix handling.
Every such Web-impacting change requires focused regression coverage and an explicit
post-deployment active verification checklist, and is not production-verified until
the user confirms those scenarios passed. Traffic cutover, compatibility deletion
and settlement-based exit criteria remain separately gated.

## Closed history

| compat_id | Closed by | Result |
|---|---|---|
| `brand-store.default-store-identity.v1` | PR #2119 / `7110dd46`, PR #2122 / `53688897`, PR #2124 / `0917f66c` | Explicit `storeStableId` now owns Brand/Store, Admin, POS/Orders and Uber SanQ-store context; internal Store DB IDs and provider Uber Store IDs remain distinct. The eight Uber Prisma `storeId` defaults were removed by migration `20260903022000_contract_uber_store_id_defaults`. Post-deploy verification confirmed the migration applied, all eight columns remain `NOT NULL` with no DB default, a new Reconciliation Report persisted `4750_Yonge_Street`, POS pause/resume reached Uber successfully, published item availability sync returned provider success, zero post-migration `storeId='default'` rows were created, and API/worker error scans were clean. |
| `web.api-envelope-direct-payload.v1` | Checkout canonical Web API transport contraction | Checkout OTP request/verify, membership summary, address list/create, and coupon list now use `apiFetch`; all 6 Checkout browser direct fetches, page-local envelope/direct-payload readers, and the Checkout architecture allowance were removed |
| `pos-device.admin-db-id.v1` | Store Operations/POS Admin DB-ID contraction | Admin create/list/reset/status/delete now require `storeStableId`/`deviceStableId`; no-query aliases, inbound Store/device DB UUID resolvers, `POS_DEVICE_ADMIN_COMPATIBILITY`, and `STORE_LEGACY_DB_ID_RESOLVER` were removed after canonical production traffic and zero compatibility-log usage were verified |
| `brand-store.business-config.v1` | PR #2099 + PR #2101 / `277a5276` | BusinessConfig application mirror, Prisma model, physical table, sync trigger/function were removed; post-deploy Admin persisted exchange rate 5.2, POS pause/resume and Uber store-status sync succeeded, canonical rows remained healthy, and error scans were clean |
| `orders.order-item-components.v1` | PR #2004 / `b8413cd7` | Production dry-run found zero actionable rows; planner/CLI and legacy read reconstruction were removed |

Historical Uber Test Store/sandbox rows remain intentionally untouched by the
closed `brand-store.default-store-identity.v1` contraction and are **not** a Phase 2
closure blocker. This includes legacy provider-UUID OpsTickets, malformed historical
availability tickets, the historical `storeId='default'` Reconciliation row, and
other verification-era Uber records. After Uber verification is approved and
Production cutover begins, handle them in a separate **Uber Production Cutover
Cleanup**: re-audit each Uber table and selectively remove sandbox/test history. Do
not indiscriminately clear OAuth connections, Store mappings, menu configuration,
or other state that Production initialization still requires.

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
