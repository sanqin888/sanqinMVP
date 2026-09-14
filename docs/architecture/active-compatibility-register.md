# Active compatibility register

Machine-readable source:
`docs/architecture/active-compatibility-register.json`. Current modularization base:
`origin/dev@c95cc7d4` (2026-09-13).

Operational fallback (retry, provider timeout recovery, email-to-SMS fallback, and
safe default values unrelated to an old version) is not compatibility debt.

## Active / guarded compatibility

| compat_id | State | Old → new | Exit gate | Deadline |
|---|---|---|---|---|
| `payments.pos-card-legacy.v1` | active / pre-production | direct paid Order → Unified Payment Core + Terminal + finalize | POS ↔ Clover realtime/recovery complete; real-device acceptance; one settlement cycle reconciled; pre-cutover Accounting facts resolved; clean production stability window; legacy calls zero | Phase J cleanup after Terminal synchronization/cutover stability |
| `payments.web-checkout-v1.v1` | guarded production | CheckoutIntent/Clover v1 Web path → Unified Payment Core + v3 truth | Test App/device acceptance complete; App installed/OAuth-authorized on operating production merchant; fresh production-merchant correlation audit passes; Web cutover accepted; one settlement cycle reconciled; old calls zero before compatibility deletion | Deferred until production-merchant Unified authorization and accepted cutover |

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

Accounting reuses this same compatibility meaning during the transition. For legacy in-store CARD changes, immutable Orders adjustment/reversal facts may act as explicitly labeled legacy/order-declared settlement authority when no Payments reversal fact exists; Terminal/Unified CARD changes remain strict and require Payments-owned reversal evidence. This is not a second route-choice boolean and does not turn `PosCardPaymentFeatureConfig` into a durable public policy.

New in-store CARD SALE facts freeze additive Orders-owned `posCardExecutionEvidence=LEGACY_DIRECT_PAID|UNIFIED_PAYMENT_CORE` from the existing persisted payment-breakdown shape. Accounting uses that immutable provenance first. Older SALE facts that predate the field are resolved from existing owner facts: a canonical Payments CARD SALE fact proves Unified/strict handling; no Payments CARD SALE fact means the legacy direct-paid route under this registered compatibility. No cutover timestamp or Accounting -> POS rollout-policy dependency is required. Legacy/order-declared compatibility relaxes refund/negative settlement evidence only; CARD collection/additional charge stays strict. Phase J exit requires pre-cutover Accounting facts to be resolved before the legacy compatibility and legacy routes are removed together.

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

`accounting.order-revenue-journal-cutover.v1` is closed. B2B removed the provisional
`order-accrual` route/writer before exposing canonical replay, so simultaneous old/new
Revenue posting was never available in the deployed cutover state. Production verification
on 2026-09-13 used a fresh plan for `2026-06-01` through `2026-09-13` exclusive at
`4750_Yonge_Street`: 1215 candidates, 1210 READY, five `POST_SALE_MUTATION` blocks,
zero parity delta, and balanced debit/credit of 2,163,201 cents. The first replay created
exactly 1210 Journal entries / 3864 lines / 1210 audit rows, with zero mutation SALE rows
and zero retired `AUTO_ORDER*` rows. A second identical replay left every count and amount
unchanged, proving idempotent convergence. Canonical Journal is now the sole Revenue
automation writer; recovery is forward/idempotent only, and the five blocked mutation
Orders remain 5D-C scope.

## Closed history

| compat_id | Closed by | Result |
|---|---|---|
| `accounting.order-revenue-journal-cutover.v1` | PR #2313 / `72395609`; production verification 2026-09-13 | Legacy `order-accrual` is unavailable and canonical Journal is the sole Revenue automation writer. Fresh production plan `83f242b85a4f85b48db9803454ba9a14b023c2f574678806e03e71983c86c258` yielded 1215 candidates / 1210 READY / five mutation-only blocks with zero parity delta and balanced 2,163,201-cent debit/credit. First replay persisted 1210 Journal entries / 3864 lines / 1210 audit rows with 1210 distinct source facts/idempotency keys, zero mutation SALE rows and zero retired `AUTO_ORDER*` rows; an identical second replay left all counts and amounts unchanged. The five mutations remain 5D-C scope. |
| `pos-connectivity.read-model-shadow.v1` | Phase 7 Slice 5B local source on `refactor/phase7-slice5b-pos-connectivity-cleanup` (PR/CI pending review authorization) | Pre-cutover evidence is complete: PR #2254 / `8abf3162` established ONLINE shadow parity and projection lifecycle, PR #2256 / `ee727ef2` hardened projection authority and finalized UNKNOWN as unavailable, and production logs on 2026-09-09 showed `pos_connectivity_unknown` at 16:43:17 followed by Uber store-status HTTP 200 / `SUCCEEDED`, disabled POS heartbeat attempts rejected with HTTP 401, recovery store-status HTTP 200 / `SUCCEEDED`, and `pos_connectivity_restored` / `ONLINE` at 16:46:18 with zero projection/shadow failure logs. Slice 5B source removes Uber direct `PosDevice` + `common/pos-connectivity` reads and shadow logging, makes `PosConnectivityReadModel` authoritative through a required External Channels query port, and moves the connectivity helper into POS ownership. Final merged/CI evidence remains pending. |
| `brand-store.default-store-identity.v1` | PR #2119 / `7110dd46`, PR #2122 / `53688897`, PR #2124 / `0917f66c`; PR #2272 / `fb6f3bb8` | Explicit `storeStableId` owns Brand/Store, Admin, POS/Orders and Uber SanQ-store context; internal Store DB IDs and provider Uber Store IDs remain distinct. Phase 2 removed the eight Uber Prisma `storeId` defaults and production verification proved new canonical writes. Phase 8 Slice 8.5 removed the remaining Test Store provider-ID OpsTicket read/retry/dedup aliases and the menu-availability provider-ID alias; PR/merged-head CI passed and post-deploy Operations, pause/resume and item availability verification remained canonical with no new provider-UUID-scoped ticket. It includes no data-cleanup migration: all current Uber records remain test data and are retained until Uber Production Verification passes, then the complete test dataset will be removed through a separately reviewed cleanup. Provider wire compatibility remains separately protected. |
| `web.api-envelope-direct-payload.v1` | Checkout canonical Web API transport contraction | Checkout OTP request/verify, membership summary, address list/create, and coupon list now use `apiFetch`; all 6 Checkout browser direct fetches, page-local envelope/direct-payload readers, and the Checkout architecture allowance were removed |
| `pos-device.admin-db-id.v1` | Store Operations/POS Admin DB-ID contraction | Admin create/list/reset/status/delete now require `storeStableId`/`deviceStableId`; no-query aliases, inbound Store/device DB UUID resolvers, `POS_DEVICE_ADMIN_COMPATIBILITY`, and `STORE_LEGACY_DB_ID_RESOLVER` were removed after canonical production traffic and zero compatibility-log usage were verified |
| `brand-store.business-config.v1` | PR #2099 + PR #2101 / `277a5276` | BusinessConfig application mirror, Prisma model, physical table, sync trigger/function were removed; post-deploy Admin persisted exchange rate 5.2, POS pause/resume and Uber store-status sync succeeded, canonical rows remained healthy, and error scans were clean |
| `orders.order-item-components.v1` | PR #2004 / `b8413cd7` | Production dry-run found zero actionable rows; planner/CLI and legacy read reconstruction were removed |

The earlier requirement to retain Uber Test Store/sandbox identity compatibility is
superseded by Phase 8 Slice 8.5. A 2026-09-10 read-only inventory found exactly 15
open `STORE_STATUS_SYNC` OpsTickets scoped by the known Test Store provider UUID and
one historical `UberReconciliationReport.storeId='default'`; current canonical Uber
configuration/report/ticket writes use `4750_Yonge_Street`. PR #2272 / `fb6f3bb8`
removed the read/retry/dedup aliases that kept those identities alive; CI #5467/#5468
passed, and post-deploy Operations/Reconciliation, pause/resume and item-availability
verification remained canonical with no new provider-UUID-scoped OpsTicket. Slice 8.5
intentionally includes no data-cleanup migration. All current Uber integration records are treated as
test data and remain untouched until Uber Production Verification passes; then the
complete accumulated test dataset will be re-inventoried and removed through a separate
reviewed cleanup. Provider state needed for Production initialization must be identified
at that cleanup rather than deleted indiscriminately before verification.

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
