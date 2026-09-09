# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@af8b4d63` (2026-09-09).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active / guarded compatibility

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `payments.pos-card-legacy.v1` | active / pre-production | direct paid Order → Unified Payment Core + Terminal + finalize | POS ↔ Clover realtime/recovery complete; real-device acceptance; one settlement cycle reconciled; clean production stability window; legacy calls zero | Phase J cleanup after Terminal synchronization/cutover stability |
| `payments.web-checkout-v1.v1` | guarded production | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | Test App/device acceptance complete; App installed/OAuth-authorized on operating production merchant; fresh production-merchant correlation audit passes; Web cutover accepted; one settlement cycle reconciled; old calls zero before compatibility deletion | Deferred until production-merchant Unified authorization and accepted cutover |
| `pos-connectivity.read-model-shadow.v1` | active shadow | Uber direct `PosDevice` connectivity read → POS-owned `PosConnectivityReadModel` purpose-built read fact | Deliberate parity shows zero mismatch/read-write failures across ONLINE/OFFLINE/UNKNOWN, timeout boundary and device lifecycle cases; Slice 5B cuts Uber admission to the read model and removes the legacy direct read while public SCC stays empty | Remove in Phase 7 Slice 5B before Phase 7 source closeout |

The payment entries are no longer governed by a whole-context freeze. The POS
Clover Terminal path is pre-production and may be structurally modularized before
Clover real-device access is restored, provided the live Web Ecommerce path and
production payment facts are unchanged. `PosCardPaymentFeatureConfig` and
`POS_CLOVER_TERMINAL_PAYMENT_ENABLED` are part of `payments.pos-card-legacy.v1`
cutover infrastructure only while legacy direct-paid CARD and the Unified Payment Core
Terminal path coexist. They must not be promoted into a permanent POS public feature
policy or moved into Payments merely to make the direct-import graph numerically smaller.
The target POS CARD architecture has no route-choice policy: after Terminal realtime
synchronization/recovery, real-device acceptance and the production stability gate pass,
legacy path + flag/config + route-choice branches + legacy refund compatibility are
contracted together in Phase J.

The Web Clover path is now explicitly frozen by the 2026-09-09 operator decision while it
continues processing production payments. Do not modify Web `/v1/charges` execution,
CARD/Apple Pay/Google Pay tokenization, 3DS/session/pricing-token/contact-verification,
Web paid-Order creation, Web external-payment refund, production webhook merchant scope,
or persisted Web payment/surcharge facts merely to advance modularization. Resume Web
Unified Payment work only after Test App/device acceptance completes and the App is
installed/OAuth-authorized on the operating production Clover merchant; then run a fresh
production-merchant readiness/correlation audit before any v3 shadow comparison or
traffic authority change. Traffic cutover, compatibility deletion and settlement-based
exit criteria remain separately gated after that point. Non-payment bounded-context work
may proceed without reopening this compatibility seam.

`pos-connectivity.read-model-shadow.v1` is the deliberately short-lived Phase 7
Slice 5A expand side. POS remains the sole writer of connectivity/device facts and
additionally maintains `PosConnectivityReadModel`, keyed by `storeStableId`. Uber
order admission still returns the legacy `PosDevice`-derived result as truth while
reading the projection only to emit parity evidence. No `Uber -> POS public-api`
dependency is introduced, so the existing POS -> Uber capabilities do not become a
public SCC. Slice 5B is the mandatory contraction: after deliberate parity succeeds,
cut admission to the read model and delete the Uber `PosDevice` plus
`common/pos-connectivity` reads and the temporary compatibility registration.

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

No unresolved candidate remains after Phase 5 Slice 0. The former EventEmitter-alias
versus durable-outbox candidate was audited on 2026-09-05: repository consumers and
side effects show no current source path that deliberately fans one successful
preparation transition through both mechanisms, so no compatibility ID is required.
The deprecated private `OrderEventsBus` accepted/prep naming remains an ordinary
future atomic cleanup candidate rather than active compatibility debt. Detailed
evidence is recorded in `docs/architecture/phase-5-commerce-orders-fulfillment.md`.

The former Next rewrite versus `app/api/[...path]` proxy overlap was resolved in
PR #2020 by making the App Router BFF the single regular JSON API entry.

Every new non-atomic compatibility path must add a unique `compat_id`, all
required lifecycle fields in the JSON register, and an `@compat <compat_id>`
annotation at the code path. The scanner rejects an annotation that is absent
from the register.
