# Current 12-context dependency graph

Phase 3 is **PRODUCTION VERIFIED / CLOSED** for its approved scope as of 2026-09-04.
Phase 4 is **PRODUCTION VERIFIED / CLOSED** as of 2026-09-05 after the consolidated migration recovery,
deployment and active verification; its final source graph remains cycle-free under the recorded baseline.
Slice 6 merged via PR #2157 with final PR head `8547b46c`, squash merge `b91afb6a`, and
CI #5070 green; focused Uber menu item availability OFF -> ON, temporary suspension /
recovery, and option availability OFF -> ON verification were completed successfully.
Slice 2C remains explicitly DEFERRED and is not represented as completed by this
closure.

This snapshot records the **remaining direct cross-context import debt** enforced
by `tools/architecture/context-baseline.json` after Phase 3 closure plus the merged
post-closeout ownership/scanner hardening tail in PR #2160. Test files and registered
composition roots are excluded. Imports through `public-api`, `contracts`, `ports`,
`@shared/foundation`, `@shared/menu`, or `@shared/order` are approved public-contract
traffic and do not consume the debt counts below.

The CI architecture scanner is authoritative for the exact source scan. This file is
the human-readable working snapshot and must be refreshed at every modularization
boundary change. PR #2160 merged to `dev` as `3a20c8c5`; GitHub Actions CI #5080 passed
on final PR head `27b57f99`. The timed Store pause codec change has not yet been recorded
as production smoke-verified, so this document claims merged/CI evidence only for that
tail.

## Phase 3 Slice 6 cycle audit and contraction

Static closeout review found one public-contract cycle that the previous scanner
could not reject because public imports were counted separately from direct debt:

`catalog-pricing-offers -> external-channels -> catalog-pricing-offers`

Slice 6 first adds a strongly-connected-component cycle gate over public dependency
pairs that are not still grandfathered by an explicit legacy direct-import allowance.
The same slice then contracts the exposed cycle at source: Catalog availability
orchestration now supplies publication and suspend-window facts to the Uber public
availability command, while Uber menu wiring/API/worker composition no longer imports
Catalog availability surfaces. The reverse `external-channels -> catalog-pricing-offers`
public edge is therefore removed in source; the intended remaining availability
coordination direction is `catalog-pricing-offers -> external-channels` through the
Uber public capability. The first remote cycle-gate run additionally surfaced a
pre-existing public SCC among Catalog / Orders / Identity / Messaging. Because those
edges predate Slice 6, they are now captured as `legacyPublicCycleComponents`
contraction-only debt: they may shrink but cannot gain a new context or internal edge.
GitHub Actions CI #5070 passed on final PR head `8547b46c`; the Architecture gate found
no new direct pair and no new/expanded public-contract cycle. PR #2157 merged to `dev`
as `b91afb6a`, and the affected Uber availability flows were then actively verified.
No local scanner execution is claimed here.

## Post-closeout tail — monotonic guards and Store temporary-closure ownership

PR #2160 is **MERGED / CI GREEN**. It contracts the remaining
`brand-store -> store-operations-pos-print` direct import from `1 -> 0`. The timed
`temporaryCloseReason` codec (`buildAutoPauseReason` / `parseAutoPauseReason`) is now
implemented once under Brand/Store and exposed through `store/public-api.ts`; POS uses
that owner surface instead of owning the persistence format, while `StoreStatusService`
no longer imports POS internals. Existing encoded values and pause/resume semantics are
unchanged, with focused codec characterization coverage added.

The architecture scanner is hardened at the same time so legacy debt can only move
monotonically downward. A direct-import allowance whose observed count falls below its
baseline now fails as stale until the same PR lowers/removes the allowance. Likewise a
`legacyPublicCycleComponents` entry must exactly match the currently detected SCC
contexts and internal public edges; if the SCC shrinks or disappears, the old superset
baseline fails as stale. This prevents a previously removed direct edge or public-cycle
edge from being re-authorized later by an obsolete baseline. Initial CI #5078 exercised
that guard and exposed seven stale numeric allowances; the follow-up normalized those
allowances to the observed source counts, and final CI #5080 passed on PR head
`27b57f99` before squash merge `3a20c8c5`. No local scanner/lint/build/test run is
claimed. A POS timed-pause -> Uber status -> manual recovery smoke verification remains
to be recorded separately if/when exercised.

## Context map

| # | Context | Current paths |
|---:|---|---|
| 1 | architecture-foundation | `apps/api/src/common`, `libs/foundation` (`@shared/foundation`) |
| 2 | brand-store | `homepage`, `location`, `store` |
| 3 | catalog-pricing-offers | `application/menu`, `coupons`, `menu`, `promotions`, `libs/shared` |
| 4 | identity-customer-benefits | `admin`, `auth`, `benefits`, `loyalty`, `membership`, `phone-verification` |
| 5 | commerce-orders-fulfillment | `deliveries`, `orders`, `libs/order` |
| 6 | payments-clover | `clover`, `orchestration`, `payments` |
| 7 | store-operations-pos-print | `pos`, `tools/printer-server` |
| 8 | external-channels | `integrations` |
| 9 | messaging-notifications | `email`, `messaging`, `notifications`, `sms` |
| 10 | accounting-reporting-analytics | `accounting`, `analytics`, `reports` |
| 11 | web-pwa | `apps/web/src` |
| 12 | runtime-data-ci-ops | Prisma, data retention, CI, ops and architecture tooling |

## Remaining direct-import debt

Counts are production import-statement occurrences. Absence from the table means
there is no recorded direct-import allowance for that source context; any new
pair fails CI.

| Source | Remaining direct targets |
|---|---|
| architecture-foundation | none |
| brand-store | accounting-reporting-analytics 2; architecture-foundation 2; runtime-data-ci-ops 4 |
| catalog-pricing-offers | architecture-foundation 2; identity-customer-benefits 3; runtime-data-ci-ops 10 |
| identity-customer-benefits | architecture-foundation 13; brand-store 4; commerce-orders-fulfillment 1; external-channels 1; runtime-data-ci-ops 10; store-operations-pos-print 4 |
| commerce-orders-fulfillment | architecture-foundation 8; identity-customer-benefits 2; runtime-data-ci-ops 10; store-operations-pos-print 2 |
| payments-clover | architecture-foundation 15; commerce-orders-fulfillment 8; identity-customer-benefits 13; messaging-notifications 2; runtime-data-ci-ops 8; store-operations-pos-print 11 |
| store-operations-pos-print | architecture-foundation 7; brand-store 2; commerce-orders-fulfillment 2; external-channels 1; identity-customer-benefits 14; runtime-data-ci-ops 5 |
| external-channels | architecture-foundation 11; commerce-orders-fulfillment 1; identity-customer-benefits 6; runtime-data-ci-ops 24 |
| messaging-notifications | architecture-foundation 3; runtime-data-ci-ops 6 |
| accounting-reporting-analytics | architecture-foundation 3; commerce-orders-fulfillment 1; external-channels 1; identity-customer-benefits 11; runtime-data-ci-ops 9 |
| web-pwa | none; cross-context shared contracts use registered public aliases |
| runtime-data-ci-ops | none; registered composition-root wiring is excluded |

## Phase 4 final baseline and production verification

**Phase 4 — Identity / Customer / Benefits + Messaging Boundary Contraction** is complete and tracked in
`docs/architecture/phase-4-identity-customer-benefits-messaging.md`. The final monotonic baseline after Slice 6
and the production-verified rollout records these direct-debt totals:

- payments-clover: **59**
- external-channels: **42**
- identity-customer-benefits: **33**
- commerce-orders-fulfillment: **30**
- store-operations-pos-print: **31**
- accounting-reporting-analytics: **25**
- catalog-pricing-offers: **15**
- messaging-notifications: **10**
- brand-store: **8**

The reduction in Orders/POS counts is baseline normalization of source debt that had
already contracted; it does not reopen those contexts as the next primary owner phase.
After Slice 2E-B, Payments/Clover at **59** is numerically above Identity/Customer/Benefits
at **37**, but that does not change the active Phase 4 owner scope. Slice 2E-A reduced Messaging
from **14 -> 10** by retiring SNS/SQS infrastructure; Slice 2E-B then removes the final direct
Identity -> Messaging pair, returns OrderEventsBus ownership to Orders and eliminates Uber's
Messaging bridge without recreating a public SCC. Identity, Commerce and External outgoing debt
now contract to **37 / 31 / 42** respectively. Slice 2E-B is merged via PR #2177 after final head
`dc07e820` passed CI #5137 and squash-merged as `718b2133`.

Slice 3 then contracts the internal Customer ownership surface without changing those counts:
`CustomerService` owns onboarding/profile/address/marketing-consent behavior, the retired
`MembershipOnboardingService` is deleted, and broad Membership reads no longer perform implicit
User creation/profile/PHONE_VERIFY mutations. Existing member HTTP routes stay unchanged,
Identity -> Messaging direct debt remains **0**, and the public SCC baseline remains empty. Slice 3
merged through PR #2178 after final head `73f7d2e1` passed CI #5140 and squash-merged as
`e813d918`.

Slice 4A then moves Staff list/update/invite administration and the self/last-active-admin invariants
from the Admin transport adapter behind the Identity-owned `STAFF_ADMINISTRATION` public port, with
`StaffAdministrationService` as its internal implementation. `AdminStaffController` no longer imports
Prisma or Prisma-generated role/status types and no longer owns invite delivery; the Identity owner
coordinates the existing `STAFF_INVITE_DELIVERY` public capability while reusing AuthService's
existing invite lifecycle. `AdminModule` also drops its historical direct Prisma provider and Staff
invite delivery wiring. This contracts Identity -> Runtime **14 -> 12** and Identity total
**37 -> 35** without adding a new direct Identity -> Messaging debt or reopening the public SCC. The
existing non-atomic active-admin count/update semantics and current ADMIN/STAFF transport behavior are
intentionally preserved. Slice 4A merged through PR #2179 after final head `f235893e` passed CI #5144
and squash-merged as `f91a849e`.

Slice 4B contracts Admin/member Customer/Security ownership without changing the numeric context graph.
Stage 1 merged via PR #2180 as `252cd26f` after final head `a2f52ddf` passed CI #5150.
Stage 2 merged via PR #2181 as `060e9417` after final head `f2cbf835` passed CI #5153:
`CUSTOMER_ADMINISTRATION` makes CustomerService the owner of Admin profile mutation/address reads, while
`ACCOUNT_SECURITY_ADMINISTRATION` owns stable-ID-scoped session/trusted-device management and
ACTIVE/DISABLED account status. `TrustedDevice.trustedDeviceStableId` is added through the authorized
additive migration; the browser-facing legacy `id` alias now carries the same stable identity rather
than the Prisma UUID. Identity -> Architecture remains **13**, Identity -> Runtime **12**, Identity total
**35**, Identity -> Messaging **0**, and the public SCC baseline remains empty. The TrustedDevice
migration was successfully applied to production when the consolidated Phase 4 rollout began on 2026-09-05.

Slice 4C is **PRODUCTION VERIFIED** via PR #2182 plus UUID recovery PR #2190. Final Slice 4C head
`7cb071ad` passed GitHub Actions CI #5158 and squash-merged to `dev` as `3119ce76`; recovery head
`8392e42f` passed CI #5182, squash-merged as `ccf0aee9`, and the merged dev source passed CI #5183. The approved
additive migration adds nullable `Order.userStableId`, deterministically backfills it from the existing
`Order.userId -> User.id` association with count/mismatch/orphan checks, and adds the
`(userStableId, createdAt)` index. The two existing `/admin/members/:userStableId/orders` and
`/top-items` transports move physically into Orders with the same guards/roles/response semantics;
Admin no longer queries Order/OrderItem persistence. Orders queries its own `userStableId` snapshot
and uses only the narrow Customer existence public capability to preserve `404 member not found`, so
no User DB UUID crosses the boundary and no Identity -> Orders public edge is introduced.
`OrdersModule` also switches its historical Membership module import to `membership/public-api`,
contracting Commerce -> Identity direct debt **5 -> 4** and Commerce outgoing total **31 -> 30** while
the public SCC baseline remains empty. The consolidated rollout exposed a historical persistence mismatch before this migration could complete:
production `Order.userId` is `TEXT` while `User.id` is `UUID`. The first Phase 4 migration applied successfully,
then `20260905145500_add_order_user_stable_id` failed with PostgreSQL `42883` and rolled back. Read-only production
verification found all **45/45** non-null `Order.userId` values are valid UUID text and map to `User.id`. The recovery
therefore adds ordered prerequisite `20260905144000_normalize_order_user_id_uuid`, models `Order.userId` as
`String? @db.Uuid`, converts it with `USING "userId"::uuid`, and deliberately adds no FK/NOT NULL/delete semantics
before retrying the untouched stable-ID migration. Production recovery completed successfully: `Order.userId`
is now PostgreSQL UUID, **45/45** member-linked Orders have matching `userStableId`, and orphan/mismatch counts
are **0**.

Slice 4D-A is **PRODUCTION VERIFIED** via PR #2183. Final head
`cec141ba` passed GitHub Actions CI #5162 and squash-merged to `dev` as `07dc1206`. The Identity-owned
`MEMBER_RECHARGE_VERIFICATION` public capability owns the existing `pos-recharge` member/contact
resolution, challenge/token lifecycle and Admin delegation boundary while `AdminMembersService` retains
the unchanged amount/token input validation and `LoyaltyService.applyTopup()` orchestration.

Slice 4D-H is **PRODUCTION VERIFIED** via PR #2184. Final head
`4d850ba1` passed CI #5165 and squash-merged as `7853e4f9`. Recharge Email/SMS share one Identity-owned
challenge policy and DB-backed per-member send budget (one per 60 seconds, five per rolling 24 hours).
SMS uses Messaging `PHONE_VERIFICATION_DELIVERY` only for delivery rather than delegating its challenge
lifecycle to `PhoneVerificationService`. New recharge codes use required `MEMBER_RECHARGE_OTP_SECRET`,
and non-zero six-digit generation uses `crypto.randomInt`. POS rejects backend `{ ok:false }` sends
without entering `code-sent`; the approved rollout remains an atomic cutover with no legacy-secret fallback.

Slice 4D-I is **PRODUCTION VERIFIED** via PR #2185. Final head
`d4b85e3a` passed GitHub Actions CI #5168 and squash-merged to `dev` as `b27ad8ce`. The new
Identity-internal `OtpChallengePolicyService` centralizes DB-backed cooldown/quota/supersession behavior
for Login 2FA, Phone Enrollment, Membership Login, Checkout, Email Verify, POS Recharge and generic Phone
Verification. `email_verify` contracts from 24 hours to 10 minutes; public membership-login/checkout flows
add a 30/hour IP spray budget; successful sends revoke older pending codes only after provider success;
failed provider sends revoke only the new challenge; and code-based verification consistently applies the
five-attempt revoke behavior. Generic Phone Verification no longer keeps process-local Map/timer rate-limit
state. Messaging remains delivery-only, with additive `ok/error` status on Auth challenge delivery.
No Prisma/dependency/context-import change is introduced. Expected numeric graph baselines remain
Identity -> Architecture **13**, Identity -> Runtime **12**, Identity total **35**, Identity -> Messaging
**0**, Commerce -> Identity **4**, with the public SCC baseline empty.

Slice 5A is **PRODUCTION VERIFIED** via PR #2186. Final head
`3b904dd1` passed GitHub Actions CI #5171 and squash-merged to `dev` as `c28df1b5`. The authorized additive
migration adds nullable `LoyaltyLedger.orderStableId`, deterministically backfills the existing Order mapping
with count/mismatch/orphan checks, and deliberately leaves the existing `(orderId, type, sourceKey)` internal
idempotency key plus nullable `orderId` in place. All order-linked Loyalty ledger writes dual-write the stable
identity inside their existing transaction; manual no-order adjustments remain identity-null.
`LOYALTY_LEDGER_READER` now returns the persisted stable identity directly, so both Admin Members and Membership
stop performing `Order.id -> orderStableId` enrichment. The normal order-create path allocates its stable ID
before Loyalty writes, while payment/refund/amendment/top-up paths reuse their already-known stable identity.
Consolidating Loyalty Runtime imports through `loyalty-prisma.ts` contracts Identity -> Runtime **12 -> 10** and
Identity total **35 -> 33**. No new public dependency edge is introduced, so the public SCC baseline remains
empty. Production migration verification later confirmed **89/89** order-linked ledger rows carry matching
`orderStableId`, the **2** manual no-order adjustments remain NULL, and orphan/mismatch counts are **0**.

### Phase 4 Slice 6 final dependency/SCC closeout — 2026-09-05

Final audit base is `origin/dev@0f58cf83` after Slice 5B merged through PR #2187. Final head `42891cf4` passed
CI #5174 and the merge SHA passed dev push CI #5175; both runs passed the Architecture baseline/SCC gate.

The final graph remains Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store
Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**,
Messaging **10**, Brand/Store **8**. Slice 5B did not require a numeric allowance change because the new
`LOYALTY_ORDER_USAGE_READER` reused the already-existing Commerce -> Identity/Benefits direction.
`legacyPublicCycleComponents` remains empty and no reduced allowance is stale.

Slice 5B is **PRODUCTION VERIFIED**. Orders detail/public-summary, legacy Web
external-payment reconstruction and POS/receipt/email print now delegate order usage to the Benefits-owned
stable-ID reader. Production-source search finds `this.prisma.loyaltyLedger` only under `apps/api/src/loyalty/**`;
`orderStableById` and `getSettledBalancePaymentCentsForOrder` have no remaining source matches. The non-unique
`LoyaltyLedger(orderStableId)` read index is present through the separate additive migration
`20260905204500_add_loyalty_ledger_order_stable_id_index`, while the 5A migration remains untouched.

Two visible debts are intentionally deferred rather than hidden to force a lower number. First,
`MembershipService.getMemberSummary()` still reads Order/OrderItem persistence and deep-imports the Orders-
internal `OrderItemOptionsSnapshot`; that remains the **Identity -> Commerce = 1** allowance. Replacing it with
an Orders public reader while Commerce already consumes Identity/Benefits would recreate a public SCC, so it
requires a later composite read-model/orchestration ownership design. Second, Phase 3 Slice 2C remains
transaction-sensitive: Points/Balance COMMIT, Coupon COMMIT and Order creation still share the same Prisma
transaction, and both Benefits COMMIT implementations consume the supplied transaction client. Closeout does
not split that atomicity or expose `Prisma.TransactionClient` across a public boundary.

Loyalty's paid-settlement Order lookup and UUID-based refund rollback also remain part of its intentionally
retained internal `LoyaltyLedger.orderId` idempotency/refund implementation from Slice 5A; they are not a
Commerce-side read-owner leak and are not silently reclassified as closed debt.

Production rollout is complete. The failed 14:55 Order migration was marked rolled back, then 14:40 UUID
normalization, the retried 14:55 stable-ID backfill, the 19:30 Loyalty stable-ID migration and the 20:45 Loyalty
index migration all applied successfully before the new API/Web/Uber worker were activated. Post-deploy evidence:
TrustedDevice **2/2 populated + unique**; Order member identity **45/45 populated with 0 orphan/mismatch**;
LoyaltyLedger **89/89 order-linked stable IDs populated with 0 orphan/mismatch**, with **2** manual no-order rows
remaining NULL by design. Active member/Admin/OTP/points/balance/receipt/refund/POS-recharge smoke checks completed
without relevant 5xx/Prisma/OTP runtime errors. Recharge SMS is N/A under the current email-first account mix;
separate SMS Login 2FA negative/cooldown/success behavior was verified.

No further safe Phase 4 dependency contraction is identified. Phase 4 is **PRODUCTION VERIFIED / CLOSED** and the
final numeric baseline plus empty public SCC remain authoritative. The POS Order Management "full query" page bug
found during verification is separate: it loaded only the newest 30 Orders even though older production rows are
present, so its server-side historical query/pagination repair does not reopen Phase 4.

### Phase 5 Slice 0 Orders/Fulfillment readiness + characterization — 2026-09-05

Audit base is `origin/dev@a464c1c3` after PR #2192. Slice 0 changes tests and architecture documentation only: no
production implementation, public contract, Prisma schema/migration, dependency, active/closed compatibility path,
architecture allowance or provider wire behavior is changed. The compatibility review queue only records the
EventEmitter/outbox candidate as resolved without assigning a `compat_id`. The exact direct-debt totals therefore
remain Payments/Clover **59**,
External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment
**30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains
empty.

The readiness inventory confirms Orders still reaches cross-owner persistence through Catalog `MenuItem`, Customer
`User`/`UserAddress`, Benefits `LoyaltyAccount`, checkout/payment `CheckoutIntent`, and provider
`UberOrderItemModifier`. Slice 2 removes the durable lifecycle's former `PosPrintJob` existence probe and replaces
it with an Orders-owned `order.initial_print_handoff` checkpoint after the Print handoff. `OrdersService` also still
imports concrete `LoyaltyService`, `MembershipService`, `UberDirectService`, `LocationService`,
`NotificationService` and `EmailService`; `FulfillmentProcessor` directly imports `UberDirectService`. These remaining
items are recorded migration debts, not newly introduced edges.

Behavior coverage was locked before movement. Slice 0 added focused characterization for confirmed-payment
finalization, `createAmendment()`, Uber Direct request/response mapping, the then-existing guarded `paid -> making`
same-process prep fast path, and exact sequential AUTO print deduplication behavior. Slice 1E retains the guarded
status-write characterization but intentionally removes that prep-event side effect.

The Slice 0 in-memory/durable audit found no deliberate fan-out into both initial-print mechanisms. After Slices
1B-1E, the coexistence itself was removed: channel/provider acceptance records durable `order.accepted`,
`OrderPreparationService` writes `making + durable order.prep_started` atomically, and already-active orders do not append
another durable prep fact. Slice 2 then closes the print-handoff hardening debt: Orders no longer reads AUTO `PosPrintJob`
existence, Print owns AUTO/REPRINT/AMENDMENT identity and routing, per-target delivery is row-lock claimed before socket
emit, ACK/timeout are terminal-state guarded, stale DELIVERED rows recover after restart, and the Windows agent suppresses
repeated physical delivery by stable `jobId + target`. No private `OrderEventsBus` prep_started producer/consumer remains.
The remaining explicit provider durability debt is Uber Direct's private `order.paid.verified` path, which can still lose
the local `externalDeliveryId` write after provider success and remains a later Uber Direct durable-fulfillment slice.

Detailed evidence and next-slice guidance are in
`docs/architecture/phase-5-commerce-orders-fulfillment.md`.

### Phase 5 Slice 1A POS cash payment-summary snapshot readiness — 2026-09-05

Slice 1A is a backward-compatible additive contract/snapshot change and does not alter the measured context graph. The direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

The POS cash browser now supplies optional `cashReceivedCents` on canonical `/pos/orders` creation. Orders validates it only for authenticated in-store cash orders, derives `cashChangeCents` from the server-calculated remaining cash tender using the existing POS upward-to-5-cent cash rounding rule, and persists only those two receipt-display facts in the existing `Order.paymentBreakdownJson`. `Order.totalCents`, tax, discounts, benefit settlement and refund semantics remain unchanged; in particular Slice 1A deliberately does not add in-store `externalCents`, so the existing Web external-payment reconstruction/refund interpretation is not broadened.

`PrintPosPayloadService` can now recover persisted cash receipt facts into the existing print payload, while the current browser `/print` transient fields remain valid for older PWA bundles. No lifecycle transition, `order.accepted` / `order.prep_started` producer, PrintJob kind, printer transport, Clover provider behavior, Prisma schema/migration or architecture allowance changes in 1A. The actual POS first-print convergence from `REPRINT:* + advance` to durable `accepted -> prep_started -> AUTO` remains Slice 1B.

### Phase 5 Slice 1B POS ordinary durable lifecycle cutover — 2026-09-05

Slice 1B changes runtime orchestration but **does not change the measured context graph or architecture allowance baseline**. Direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

Canonical in-store creation now writes the Orders-owned durable `order.accepted` fact atomically with the paid Order, then asks the existing `OrderLifecycleOutboxProcessor` to drain after commit. The same durable path owns `making + order.prep_started` and AUTO first-print materialization. The POS payment browser no longer performs first-print `REPRINT:*` or the first `advance`, so the old create/print/advance orchestration is contracted rather than retained in parallel. The existing POS -> Orders operations boundary is expanded narrowly with store-scoped `activateImmediatePreparation()` so a manual `/advance` arriving while an in-store Order is still `paid` also joins that same durable path; later `making -> ready` advancement and explicit operator reprint remain separate store-operation capabilities.

This slice adds no new cross-context import: `OrdersService -> order-lifecycle`, `PosOrderOperationsService -> OrderLifecycleOutboxProcessor`, and the durable-origin marker inside Fulfillment are all Commerce/Orders/Fulfillment internal wiring. The existing Orders -> POS print-type/dispatch debt is unchanged and remains scheduled for the later Print ownership slice. No Prisma schema/migration, Clover/Web payment path, Uber provider behavior, dependency manifest, SCC member/edge or scanner baseline is changed.

The cutover is intentionally not represented as an active compatibility path: the user authorized no support for an old cached POS payment bundle after cutover. PR #2195 subsequently merged as `e4a783a5` after final head `c8ed5579` passed PR CI #5200. Under the repository-wide verification cadence adopted on 2026-09-06, Slice 1B does not carry a standalone post-deployment active-test gate; its runtime/printing/PWA coverage is accumulated into the consolidated Phase 5 closeout verification plan.

### Phase 5 Slice 1C Web/local durable lifecycle convergence — 2026-09-05

Slice 1C also leaves the measured context graph and architecture allowance baseline unchanged. Direct-debt totals remain Payments/Clover **59**, External **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty.

The Web payment path still creates a `paid` Order without `order.accepted`; acceptance remains a store-operation decision made by the existing auto-accept/manual `/pos/orders/:id/advance` flow. That decision now enters Orders through the narrow `PosOrderOperationsPort.acceptWebOrder()` capability. Orders locks the store-scoped paid Web Order and appends durable `order.accepted`. For IMMEDIATE Web orders, after acceptance commit the POS-facing orchestration synchronously invokes the same idempotent `OrderPreparationService` materializer used by durable replay, which atomically writes `making + order.prep_started`; the accepted-event 500 ms scan remains crash/restart recovery if eager preparation is interrupted. Once prep_started exists the lifecycle outbox is eagerly woken for AUTO materialization. Scheduled Web orders retain only the accepted fact until the existing scheduler reaches `prepStartAt`. The generic POS status route also redirects local `paid -> making` attempts into the corresponding durable Web/in-store command instead of the legacy direct status mutation.

No new cross-context import is introduced: the new port method, `OrderPreparationService` command and outbox wake are all existing Commerce/POS-public-boundary wiring. Fulfillment now suppresses memory-origin AUTO printing for both Web and in-store Orders, so their first print is durable-only; the memory prep channel remains temporarily for provider/legacy work outside Slice 1C. Web Clover charge/session/finalization, Uber runtime, PrintJob identity/protocol, Prisma schema/migrations and scanner/SCC baselines are unchanged. Slice 1C merged via PR #2196 as `61f5917d` after final head `3dc21e5d` passed PR CI #5204; merged-dev CI #5205 also passed. Its runtime verification scope is now accumulated into the Phase 5 closeout verification gate rather than a standalone Slice deployment test.

### Phase 5 Slice 1D POS Clover Terminal durable lifecycle convergence — 2026-09-06

Slice 1D contracts the pre-production Terminal finalization path onto the same Orders durable acceptance/preparation/AUTO-print lifecycle established by Slices 1B/1C. `OrdersService.createFromConfirmedPaymentSnapshot()` still owns the existing atomic Benefits tender COMMIT + Coupon COMMIT + paid Order creation transaction, but now appends the idempotent `orders.lifecycle/order.accepted` fact inside that **same** Prisma transaction. The outer Terminal orchestrator never receives or transports a transaction client.

`PosCardPaymentOrchestrationService` no longer imports `PrintPosPayloadService`, no longer calls `PosGateway.sendPrintJob()`, and no longer creates `PAYMENT_CHECKOUT:<attemptId>` first-print identities. New successful finalization and COMPLETED/recovery paths call the existing public `POS_ORDER_OPERATIONS.activateImmediatePreparation(orderStableId, storeStableId)` capability; that command requires the accepted fact, writes `making + durable order.prep_started` idempotently, and wakes the same durable AUTO materializer. `PosGateway` remains because the orchestration still owns best-effort POS card-payment status publication; realtime delivery is not part of this Slice.

Historical pre-Slice-1D Terminal prototype Orders are deliberately not backfilled with `order.accepted`: the existing-order branch in confirmed-payment finalization remains read-only. Therefore a historical COMPLETED recovery cannot create a new AUTO first print merely because the lifecycle implementation changed. New Slice-1D Orders have accepted atomically with creation, so retries after any crash between Order creation, checkout completion, preparation and printing converge through the same idempotent durable path.

This removes two direct Payments/Clover -> Commerce internal imports (`OrderDto` and `PrintPosPayloadService`) by replacing them with the existing Orders public surface while the still-deferred direct `OrdersService` confirmed-payment finalization call remains. The monotonic allowance therefore contracts `payments-clover -> commerce-orders-fulfillment` **10 -> 8**, and Payments/Clover total outgoing direct debt **59 -> 57**. The public SCC baseline remains empty. No Prisma schema/migration, package dependency, Web Clover Ecommerce behavior, Terminal provider/payment-state truth, UNKNOWN/reconciliation, refund, pricing/promotion or Benefits COMMIT semantics change.

Per the 2026-09-06 Phase-level verification cadence, Terminal payment/lifecycle/recovery/initial-print behavior is recorded as Phase 5 closeout verification scope rather than a standalone Slice deployment checklist. PR #2197 merged as `9a338704` after final head `04a4a5ed` passed PR CI #5207; merged-dev CI #5208 also passed.

### Phase 5 Slice 1E Uber durable lifecycle convergence — 2026-09-06

Slice 1E closes the final known store-facing bypass around the durable accepted/preparation lifecycle. Uber external ACCEPT still completes in the dedicated durable action worker and atomically records local `paid + orders.lifecycle/order.accepted`; no Uber wire/provider contract, webhook, worker composition, provider truth or action idempotency changes. The source change is on the POS/Orders side after that acceptance fact already exists.

A staff `/advance` or direct `/status -> making` request arriving while an accepted Uber order is still `paid` no longer falls through to generic `OrdersService` status mutation. The POS adapter resolves the existing Orders-owned fulfillment timing and routes IMMEDIATE orders to `activateImmediatePreparation()` and SCHEDULED explicit early-starts to `activateScheduledPreparation()`. Both commands require the durable accepted fact and write `making + durable order.prep_started` through `OrderPreparationService`; therefore staff cannot manufacture preparation before successful Uber acceptance.

With Web, ordinary in-store, Terminal and Uber paid entry points all on durable preparation, the old private same-process `order.prep_started` first-print channel has no production caller. Slice 1E removes its emitter/listener API and Fulfillment memory-origin branch. `OrderEventsBus` remains only for `order.paid.verified`, which still drives the explicitly deferred Uber Direct provider dispatch path. Initial `AUTO` printing is now reachable only from durable `order.prep_started`; explicit `REPRINT:*` and `AMENDMENT:*` operations remain independent.

This is same-context lifecycle contraction plus use of the already-public POS -> Orders preparation surface, so it adds no direct/public context edge and requires no baseline update. Direct-debt totals remain Payments/Clover **57**, External Channels **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty. The existing 500 ms lifecycle poll remains unchanged because the dedicated Uber worker cannot safely wake an API-process in-memory consumer; it continues to bridge/recover accepted immediate Uber orders until a later durable trigger design changes that boundary.

### Phase 5 Slice 2 Print handoff / dispatch idempotency — 2026-09-06

Slice 2 keeps the measured context graph unchanged while tightening the existing Orders -> POS/Print handoff. Orders/Fulfillment no longer chooses persistence `kind`; it emits only `INITIAL | REPRINT | AMENDMENT` intent through the existing public-surface listener. The POS/Print owner generates `AUTO`, fresh `REPRINT:<uuid>` and `AMENDMENT:<uuid>` identities and target routing. The lifecycle consumer no longer queries Print-owned `PosPrintJob`; successful INITIAL handoff is checkpointed with Orders-owned durable `order.initial_print_handoff`, so replay remains idempotent without a Commerce -> Print persistence read.

`PosGateway` now claims each target under a database row lock before socket emission. Only `PENDING/FAILED` can become `DELIVERED`; concurrent callers see the committed claim and cannot emit the same delivery. ACK and timeout use the same row-lock discipline, `COMPLETED` is terminal, and reconnect recovery turns stale `DELIVERED` targets into retryable `FAILED/ACK_TIMEOUT`. The unchanged printer wire envelope is hardened on the Windows agent by persistent/in-flight `jobId + target` deduplication, with a bounded local completion file written by temp-file replacement.

The POS amendment path is repaired in the same Print-ownership slice because it is an existing AMENDMENT handoff defect rather than a new cross-context capability. VOID/ADD/SWAP creates a kitchen difference ticket; combo components come from the immutable before/after OrderItem snapshots; labels use only the positive delta between before/after label plans; and amount or payment-method changes create a customer-only full-receipt REPRINT. Orders also centralizes normal-create and amendment-ADD option/component materialization in an internal `OrderItemSnapshotBuilder`; pricing/Daily Special/promotion stay in `calculateLineItems`, while amendment keeps its explicit unit price and does not invoke pricing policy.

No new cross-context import or public SCC member is introduced, and no architecture allowance is relaxed. Direct-debt totals therefore remain Payments/Clover **57**, External Channels **42**, Identity/Customer/Benefits **33**, Store Operations/POS/Print **31**, Commerce/Orders/Fulfillment **30**, Accounting **25**, Catalog/Offers **15**, Messaging **10**, Brand/Store **8**; the public SCC baseline remains empty. No Prisma schema/migration, package/lockfile, Web Clover, Uber wire/provider behavior or Benefits transaction semantics change.

### Phase 5 pre-Slice 3 Uber Direct dispatch-failure alert hardening — 2026-09-06

The previously dormant delivery-dispatch-failure notification is now wired to the active `FulfillmentProcessor -> UberDirectService.createDelivery()` failure path. Commerce owns the decision that an Uber Direct delivery creation failed, Identity exposes only active Admin alert recipients through a stable-ID public query, and Messaging owns bilingual template rendering plus channel routing. Alert delivery is email-first per Admin and falls back to SMS only when email is unavailable or fails; provider/recipient internals do not leak back into Commerce.

`OrdersModule` also switches its Notification module composition import to `../notifications/public-api`, so `commerce-orders-fulfillment -> messaging-notifications` direct debt contracts **4 -> 3** and Commerce total outgoing direct debt contracts **30 -> 29**. The new Fulfillment imports use registered Identity/Messaging public surfaces, so no new direct-debt allowance is created and the public SCC baseline remains empty. No Prisma schema/migration, package/lockfile, Uber Direct provider request/response contract, order lifecycle, payment behavior or external route changes. PR #2200 merged as `f9e0014b` after final head `0feb44fa` passed PR CI #5220; Phase-level runtime verification remains deferred to Phase 5 closeout.

### Phase 5 Slice 3 — Orders -> Messaging public boundary contraction — 2026-09-06

The remaining Order-ready and invoice delivery calls are now expressed as Messaging-owned public capabilities. `ORDER_READY_NOTIFICATION` receives only the already-resolved trusted contacts, Order presentation facts and stable customer identity; Orders retains eligibility/contact/locale policy while Messaging retains rendering and email-first/SMS-fallback delivery. `ORDER_INVOICE_DELIVERY` accepts a neutral Messaging-owned receipt snapshot, so Orders still builds the receipt while Email owns invoice rendering/provider delivery without importing the POS `PrintPosPayloadDto`.

The source graph therefore contracts `commerce-orders-fulfillment -> messaging-notifications` **3 -> 0** and Commerce outgoing direct debt **29 -> 26**. Removing the invoice renderer's POS DTO import also contracts `messaging-notifications -> store-operations-pos-print` **1 -> 0** and Messaging outgoing direct debt **10 -> 9**. Both zero edges are removed from the monotonic legacy baseline, and an explicit scanner guard prevents concrete Messaging imports or POS/Prisma/Commerce leakage from returning through the two public contracts. The public SCC baseline remains empty. No schema/migration, dependency, route, payment, pricing, refund, lifecycle, compatibility or provider-wire change is part of Slice 3. PR #2201 final head `90cddfd0` passed CI #5225 and merged to `dev` as `62790355`; Phase-level runtime verification remains deferred to Phase 5 closeout.

### Phase 5 Slice 4A — low-risk direct-edge + dead-code contraction — 2026-09-06

Slice 4A merged via PR #2202 as `6e2da654` after final head `09cdd74d` passed rerun CI #5228. Orders transport gets both session guards from `auth/public-api.ts`, and Orders geocoding uses the Brand/Store-owned `LOCATION_GEOCODER` public capability rather than `LocationService` / `LocationModule` internals. The Location owner keeps the concrete Google Maps HTTP implementation private and exports only the token-backed port; existing geocoding behavior is unchanged.

The same atomic contraction deletes verified uncalled `OrdersService` tails (`ensureLoyaltyAccountWithTx`, `normalizeDropoff`, `buildUberPickupOverride`, `dispatchPriorityDelivery`) and removes the obsolete `OrdersService -> UberDirectService` injection. The active Uber Direct provider path remains `FulfillmentProcessor -> UberDirectService` and is intentionally unchanged. The monotonic direct-import baseline contracts `commerce-orders-fulfillment -> brand-store` **2 -> 0** and `commerce-orders-fulfillment -> identity-customer-benefits` **4 -> 2**, reducing Commerce outgoing direct debt **26 -> 22**. Architecture guards prevent the old deep imports and dead tails from returning; the public SCC baseline remains empty. No Prisma schema/migration, dependency, HTTP route, Web Clover, Uber wire/provider, pricing, refund, lifecycle or Benefits COMMIT semantics change.

### Phase 5 Slice 4B — Catalog persistence contraction — 2026-09-06

Slice 4B merged through PR #2203 after final head `7f8c0c9f` passed PR CI #5232; squash merge `b8f838ff` then passed merged-dev CI #5233. Earlier CI runs exposed lint-only issues and one final `tx.menuItem.findMany` hidden-item read; the final source routes every protected Orders Catalog read through the stable-ID-only `CATALOG_ORDER_FACTS_READER` and the scanner rejects any `.menuItem.` delegate in those consumers. Catalog exposes the same public capability for hidden-item facts, immutable OrderItem materialization facts and current label/packaging configuration. Orders retains the Web-vs-POS hidden-item policy, immutable snapshot assembly and physical label-plan decisions; only persistence ownership moves behind Catalog.

`OrderItemSnapshotBuilder` no longer imports Prisma-generated Catalog models or reads `MenuItem`; its prior DB-UUID fallbacks are not carried into the public contract because all legitimate create/amendment paths already normalize business stable IDs. `OrderLabelPlanService` no longer reads MenuItem/packaging persistence and uses `packagingType.stableId` instead of a packaging-row UUID for its ephemeral internal instance key. The three Orders consumers are scanner-guarded against direct MenuItem persistence access and deep Catalog imports, while the public contract is guarded against Prisma/concrete-service/DB-ID leakage. This extends the already-existing Commerce -> Catalog public direction (`@shared/menu`) without changing the legacy direct-import table: Commerce remains **22**, Catalog remains **15**, and the public SCC baseline remains empty. No schema/migration, dependency, route, pricing/promotion, payment/refund, Benefits transaction or provider-wire semantics change.

### Phase 5 Slice 4C — Customer runtime read contraction — 2026-09-06

Slice 4C merged through PR #2204 after final head `3efd8930` passed PR CI #5236; squash merge `1f58f1a3` is the current `dev` base for the follow-up repair. Customer exposes `CUSTOMER_ORDER_CONTEXT_READER` through `membership/public-api.ts`; the existing `CustomerService` remains the single Prisma-backed owner for verified contact/language and saved-address lookup. Orders supplies only `userStableId` / `addressStableId`, and no User DB UUID, Prisma model or concrete Customer implementation crosses the public boundary.

Orders no longer reads `User` or `UserAddress` persistence directly. Order-ready member contact/locale fallback and delivery verified-phone/saved-address facts use the Customer public capability, while Commerce keeps trusted-contact precedence, delivery requirements and notification policy. `getByStableIdWithOwner()` now returns persisted `Order.userStableId` directly; the production Phase 4 stable-ID backfill already verified 45/45 linked Orders with 0 orphan/mismatch and all current member Order creation paths dual-write the stable identity.

This is hidden persistence-ownership contraction, so the direct-import table does not change: `commerce-orders-fulfillment -> identity-customer-benefits` remains **2** and Commerce total remains **22**. Those two counted direct imports are the still-deferred concrete `LoyaltyService` and `MembershipService` seam, not Customer reads. The public SCC baseline remains empty, and scanner guards prevent Orders from regaining User/UserAddress delegates or leaking Prisma/DB IDs through the Customer contract. No schema/migration, dependency, route, payment/refund, pricing, lifecycle, provider-wire or Benefits COMMIT transaction behavior changes.

Read-only production audit during 4C found a separate existing functional debt: both current `UserAddress.addressStableId` rows use the historical `a...` prefix, while Orders' existing `normalizeStableId()` accepts only canonical `c...` CUID values. Slice 4C-A fixes only the Customer-owned generator and its focused fixtures so new addresses use the canonical StableId format; Orders validation is not widened. The source repair merged through PR #2205 after final head `227643935d6c8ad02e39ef1b91fff176c49bb204` passed CI #5238, with squash merge `c02c3bac`; the two historical production rows remain a separately gated deterministic data repair (`a` -> `c` first-character restoration) requiring explicit production-mutation approval. This follow-up changes no imports, context ownership, direct-debt count, scanner allowance, or SCC baseline: Commerce remains **22** and the public SCC remains empty.

### Phase 5 Slice 4D — Benefits runtime read contraction — 2026-09-06

Slice 4D merged through PR #2206 after final head `4c6795de89e775dffd3228d8c9d34f617bf1c936` passed final PR CI #5242; squash merge `a88d82f7b5dd9917dd4789e965fa252e1b3fda7d`. It adds the Benefits-owned stable-ID-only `ORDER_BENEFITS_READER` for coupon-for-order projection, current payment-tender availability and loyalty-only redeem capacity. Member existence remains Customer ownership and Orders reuses `CUSTOMER_EXISTENCE_READER` to preserve the historical `member not found` behavior. Orders quote pricing, Web stored-balance validation and loyalty-only order eligibility consume those public owner capabilities; `createLoyaltyOnlyOrder()` no longer reads `LoyaltyAccount` persistence directly. Internal User/Coupon DB UUID resolution needed for Benefits facts stays inside the Benefits implementation, while Commerce continues to own pricing, promotion acceptance and insufficient-balance decisions. Normal checkout availability still excludes active payment holds; loyalty-only eligibility deliberately preserves the historical raw-account-points check.

The existing `LoyaltyService` and `MembershipService` direct imports are deliberately retained only for the preparation/transaction/mutation seam that cannot be safely replaced without changing atomicity: prepared-payment internal identity, same-transaction Tender/Coupon COMMIT + Order creation, transactional normal-order coupon/Loyalty reserve/deduct, and refund/amendment/paid-side-effect mutations. Therefore the monotonic direct-import table intentionally remains `commerce-orders-fulfillment -> identity-customer-benefits = 2` and Commerce total remains **22**; public SCC remains empty. The scanner instead prevents regression of direct `loyaltyAccount` reads, concrete tender/max-redeem runtime reads, DB-ID leakage through the new contract, and any expansion beyond the two preserved concrete member/coupon read call sites. No schema/migration, dependency, route, payment/refund, pricing, lifecycle, provider-wire or Benefits COMMIT semantics change.

### Phase 5 Slice 4E — Uber Direct provider implementation contraction — 2026-09-06

Slice 4E removes the remaining production `FulfillmentProcessor -> UberDirectService` concrete dependency. Deliveries exposes `UBER_DIRECT_DELIVERY_DISPATCHER` plus stable request/result types through `deliveries/public-api.ts`; the existing `UberDirectService` implements the port internally, and `DeliveriesModule` binds the token with `useExisting` while exporting only that token. `OrdersModule` now composes Deliveries through the public surface rather than deep-importing `deliveries.module`.

Fulfillment still owns Uber-delivery eligibility and builds exactly the same `orderRef`, pickup code, manifest, destination and pickup-ready input. The provider adapter still owns HTTP/auth, payload transformation and response normalization, and Fulfillment still persists the returned `deliveryId` into `Order.externalDeliveryId`. The existing provider-create failure -> Admin alert behavior and the provider-success/local-persistence-failure distinction are unchanged; the latter remains log-only to avoid accidentally creating a duplicate provider delivery. The broader in-memory `order.paid.verified` durability/idempotency gap remains deferred.

This is a same-context provider-implementation contraction, so the numeric direct-import table does not change: Commerce remains **22** and public SCC remains empty. Scanner guards prevent `FulfillmentProcessor` from importing `UberDirectService`, prevent `OrdersModule` from deep-importing `deliveries.module`, keep the public dispatch contract free of Nest/Prisma/Http/concrete-service/internal Order DB IDs, and require `DeliveriesModule` to export only the token-backed capability. Existing Uber Direct characterization continues to lock provider wire behavior, while Fulfillment coverage locks the request handed to the dispatcher and the existing failure semantics.

Before the main Identity/Messaging slices, the planned cross-phase readiness/contraction
work is now complete and production verified:

1. **Slice 0A — Admin PromotionRule ownership contraction.** Merged via PR #2163 /
   `aa302629` after final GitHub Actions CI #5092 passed. PromotionRule management
   validation/CRUD sits behind the Offers-owned `PROMOTION_RULE_MANAGEMENT` capability;
   Admin no longer owns Prisma or Prisma-generated rule types. Raw persistence remains
   behind the existing `PromotionsService` Prisma entry, so Catalog -> Runtime stays at
   `10`. The retired Admin service is deleted, focused characterization/mapping tests are
   present, the central scanner reserves the delegate to Offers, and Identity -> Runtime
   contracts `18 -> 16`. The authorized Admin response contraction also removes unused
   DB `id`/`createdAt`/`updatedAt`/`deletedAt` fields while preserving all business fields,
   routes and request semantics. Active Admin create/edit/refresh/delete verification was
   completed on 2026-09-04, so the original 0A ownership slice is production VERIFIED.
2. **Slice 0A verification hotfix — POS server-authoritative promotion pricing.** PR #2166
   merged as `bb833550` after final head `567a1aba` passed CI #5102. It adds a narrow POS
   pricing quote to the existing Orders public capability so the POS adapter displays
   automatic promotions and the retained staff manual discount from the canonical server
   quote before taking payment. The POS payment adapter is also contracted to local
   `channel=in_store` only: the staff UberEats channel selector/payment method and their
   legacy branches are removed, while Uber webhook/import/runtime remains unchanged. Active
   production verification on 2026-09-04 confirmed same-item BOGO pricing appears in POS,
   the staff manual discount remains separate and stackable, and the completed order/payment
   amount matches the server-authoritative checkout total. The hotfix is therefore
   **PRODUCTION VERIFIED**. This is a method/transport expansion plus adapter cleanup on an
   already-existing POS -> Orders public boundary; it introduces no new context edge,
   direct-import debt, SCC member/edge, Prisma ownership, or baseline change. Offers still
   owns promotion policy and Orders still owns order pricing truth.
3. **Slice 0B — Catalog -> Orders public-cycle edge contraction.** PR #2168 merged as
   `b2d42c32` after final head `739938c5` passed GitHub Actions CI #5107. The reverse
   dependency was exactly the two Offers imports of Orders-owned `Channel`. Promotion
   applicability now uses the Offers-owned `PromotionRuleChannel = 'web' | 'in_store'`;
   Orders performs one exhaustive boundary mapping (`web -> web`, `in_store -> in_store`,
   `ubereats -> no PromotionRule context`). The authenticated Admin PromotionRule editor
   exposes only Web/POS channels, and the owner validator rejects the historical dead
   `ubereats` configuration value. Production data was read-only audited before
   implementation and contained **0** PromotionRule rows whose `channels` array included
   `ubereats`, so no schema/migration or data rewrite was required. Active production
   verification on 2026-09-04 confirmed the Admin channel contraction, Web PromotionRule
   pricing, POS BOGO/manual-discount behavior and Uber selection isolation; Slice 0B is
   therefore **PRODUCTION VERIFIED**. Uber order ingestion/runtime/wire behavior remains
   unchanged and continues to persist provider-supplied order amounts through the separate
   ingestion path rather than SanQ PromotionRule evaluation.

The prior Store temporary-close codec item is no longer a Phase 4 Slice 0 task because
PR #2160 already moved that persistence encoding to Brand/Store and removed the final
`brand-store -> store-operations-pos-print` direct edge.

Slice 0B removed the public edge
`catalog-pricing-offers -> commerce-orders-fulfillment`; Orders therefore left the legacy
SCC while `commerce-orders-fulfillment -> catalog-pricing-offers` remained the correct
one-way pricing-consumer dependency.

Phase 4 Slice 1 removes the remaining owner-reversed
`messaging-notifications -> identity-customer-benefits` public edge by moving email
verification challenge/account ownership to Identity and leaving Messaging with delivery
only. PR #2171 merged as `afa1bff6` after final head `94955b27` passed CI #5116. The former
three-context Catalog / Identity / Messaging component is no longer strongly connected:
`identity-customer-benefits -> catalog-pricing-offers` and
`catalog-pricing-offers -> messaging-notifications` may remain as forward consumer flows,
but there is no return path from Messaging to Identity. The
`legacyPublicCycleComponents` baseline is empty and the monotonic SCC guard rejects any
future public edge that recreates the cycle. Production deployment/verification is
intentionally deferred to the Phase 4 batch rollout.

Slice 2A contracts Auth challenge delivery behind the Messaging-owned
`AUTH_CHALLENGE_DELIVERY` public capability. Auth keeps challenge/session/MFA lifecycle;
Messaging owns OTP configuration/template/provider dispatch. Auth's seven concrete
Email/SMS/Messaging imports disappear while the welcome-notification pair remains, so
`identity-customer-benefits -> messaging-notifications` contracts **22 -> 15** and total
Identity outgoing direct debt contracts **60 -> 53**. Known-user delivery now crosses the
public boundary with `userStableId`, not the internal User DB UUID. PR #2172 merged as
`c8e91303` after final head `29bf23b7` passed CI #5120; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2B contracts the five remaining Phone Verification Messaging implementation imports
behind the dedicated `PHONE_VERIFICATION_DELIVERY` public capability. Identity continues to
own phone normalization, IP/daily rate limits, non-zero OTP/hash policy, `AuthChallenge`,
10-minute expiry, attempts/consume/token validation and `sms_send_failed`; Messaging owns
only messaging snapshot/template/SMS provider dispatch. The historical OTP template purpose
stays fixed at `verify`, while caller purpose remains challenge metadata and Messaging
metadata. `identity-customer-benefits -> messaging-notifications` contracts **15 -> 10** and
total Identity outgoing direct debt contracts **53 -> 48**. PR #2173 merged as `41428324`
after final head `d63bc307` passed CI #5123; HTTP routes, Clover phone-proof validation and
AdminMembers' current PhoneVerificationService dependency remain unchanged. Deployment stays
deferred to the Phase 4 batch rollout.

Slice 2C contracts Admin's four concrete Email dependencies into two narrow Email public
capabilities. Staff invite create/resend/revoke state remains in Identity/Admin while
`STAFF_INVITE_DELIVERY` delegates the existing invite email path. POS member recharge email
OTP keeps contact/profile matching, challenge lifecycle and recharge-token semantics in
Identity, while `MEMBER_RECHARGE_EMAIL_DELIVERY` owns the bilingual message body,
`MessagingTemplateType.OTP`, `pos_recharge_otp` tag and provider dispatch. The delivery
boundary uses `userStableId` rather than the internal User DB UUID. Admin no longer imports
`EmailService` or `EmailModule`; `identity-customer-benefits -> messaging-notifications`
contracts **10 -> 6** and total Identity outgoing debt contracts **48 -> 44**. PR #2174 merged
as `e27489cf` after final head `2c18e3c5` passed CI #5126; deployment remains deferred to the
Phase 4 batch rollout.

Slice 2D contracts Auth and Membership lifecycle notifications behind the narrow
`CUSTOMER_LIFECYCLE_NOTIFICATION` public capability. Auth retains the new-user decision and
maps only stable customer/contact/name/language facts for registration welcome delivery.
Membership retains the persisted marketing-consent decision and invokes subscription welcome
only after `email + marketingEmailOptIn` are true; the existing marketing opt-in coupon trigger
still runs afterward. Messaging retains template rendering, registration email-to-SMS fallback,
provider routing and audit metadata, but registration/subscription sends now link by
`userStableId` rather than the User DB UUID. `identity-customer-benefits ->
messaging-notifications` contracts **6 -> 2** and total Identity outgoing debt contracts
**44 -> 40**. PR #2175 merged as `0cb3ce11` after final head `a0fa3f85` passed CI #5130;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-A retires the user-confirmed unused AWS SNS/SQS infrastructure. The SNS HTTP webhook
and SES SQS processor are deleted, MessagingModule no longer needs Prisma for SNS persistence,
and runtime SNS/SQS environment wiring is removed while AWS SES/SMS send providers remain
available. This contracts `messaging-notifications -> architecture-foundation` **4 -> 3**,
`messaging-notifications -> runtime-data-ci-ops` **9 -> 6**, and Messaging total outgoing direct
debt **14 -> 10**. PR #2176 merged as `7746402b` after final head `11f73e88` passed CI #5132;
deployment remains deferred to the Phase 4 batch rollout.

Slice 2E-B locally moves `OrderEventsBus` out of Messaging and makes it private Orders/Fulfillment
fast-path infrastructure while preserving the separate durable lifecycle outbox. Loyalty no longer
subscribes to that bus; Orders invokes the stable-ID-only `LOYALTY_ORDER_PAID_SETTLEMENT` public
capability in the existing Orders -> Identity direction, so the empty public SCC baseline remains
empty. The final direct Identity -> Messaging imports contract **2 -> 0**, Identity -> Runtime
contracts **15 -> 14**, Commerce -> Messaging contracts **8 -> 4**, and External -> Messaging
contracts **2 -> 0**. Totals become Identity **37**, Commerce **31**, External **42**, Messaging
**10**. Uber order ingestion drops its dead paid-lifecycle flag and no longer needs a Messaging
bridge in API or worker composition; Uber wire behavior remains unchanged. The existing internal
`LoyaltyLedger.orderId` UUID remains deferred persistence debt; the new public boundary carries
only `orderStableId`.

## Phase 1 boundary changes reflected here

- `@shared/order` now owns Order contracts directly; `@shared/menu` no longer
  re-exports Order contracts.
- Daily-special policy now belongs to Promotions/Pricing instead of `common`.
- StableId validation primitives now live in neutral `@shared/foundation`; API
  `common` re-exports that implementation for existing server callers and Web
  imports the foundation package directly. Menu/Order packages no longer own or
  re-export those primitives.
- Web regular JSON transport is guarded separately: one browser client, one
  App Router BFF, and one server-side API helper; raw/direct fetch exceptions are
  explicit architecture allowances.
- Existing cycles remain migration debt for later phases. Phase 1 did not create
  a new direct context pair; CI rejects any such regression.

## Phase 2 Brand/Store boundary closed

- `apps/api/src/store/public-api.ts` now defines the narrow canonical Brand/Store
  configuration read contract. It exposes stable store identity and canonical
  BrandConfig/StoreConfig facts, but not the Store database UUID and not Benefits
  policy fields that happen to be duplicated in `BrandConfig` during transition.
- `PrismaBrandStoreConfigReader` is the single registered Prisma reader for that
  snapshot. It reads `BrandConfig` plus `Store`/`StoreConfig`, fails closed when
  canonical rows are missing, and never creates fallback configuration.
- Configured store stable identity now belongs to the Brand/Store public surface
  as `resolveConfiguredStoreStableId()`. Existing Orders, Clover, POS, Admin and
  Uber callers were moved off `common/store-id.ts`, lowering direct
  architecture-foundation debt without changing the resolved store value.
- `StoreStatusService` no longer reads or creates `BusinessConfig`. Store schedule
  reads now go through the Brand/Store-owned `STORE_SCHEDULE_READER`, with
  `storeStableId` resolved to `storeDbId` only inside the Prisma adapter. The
  BusinessHour/Holiday hard-coded store UUID defaults are removed by the
  store-scope migration, and BusinessHour uniqueness is scoped to
  `(storeDbId, weekday)` instead of weekday globally.
- Accounting, Promotions, PublicMenu, AdminMenu, and Orders now read store-local
  timezone through the canonical Store snapshot. Public/Admin menu reads no longer
  create a default `BusinessConfig` row as a side effect; Orders also no longer
  creates `BusinessConfig` while resolving pricing or daily-special time.
- POS exchange-rate configuration now uses the combined Brand/Store snapshot:
  `StoreConfig.timezone` controls the store clock and
  `BrandConfig.wechatAlipayExchangeRate` supplies the existing manual fallback.
  The POS exchange-rate module no longer imports Prisma directly, while the
  externally visible fallback source label remains unchanged for compatibility.
- POS StoreStatus/Connectivity now uses the canonical Brand/Store boundary for both
  reads and writes. Timed-pause status/timezone reads, manual pause/resume, and the
  watchdog's recovery race re-check no longer query or mutate `BusinessConfig`.
  The guarded POS StoreStatus transport now carries its authenticated device
  `storeStableId` through reads, pause/resume writes, and timed-pause
  compare-and-set reconciliation instead of letting the Brand/Store owner infer a
  configured store. The deployment-scoped connectivity watchdog resolves its
  configured `storeStableId` once, scopes ACTIVE POS-device heartbeats to that
  Store relation, and passes the same explicit identity through StoreStatus and
  pause reconciliation. The public `/public/store-status` route keeps its existing
  deployment-store behavior but resolves that identity at the transport boundary.
  The timed auto-resume compare-and-set remains inside the Brand/Store writer so
  an outdated expiry task cannot clear a newer pause; each store CAS updates only
  its canonical StoreConfig because the former singleton BusinessConfig mirror has
  been fully removed. POS is architecture-gated against regressing to Prisma
  configuration delegates or implicit store selection.
- POS Orders and Daily Summary browser timezone context now comes from the guarded
  `/pos/store-context` adapter. `PosDeviceGuard` supplies the authenticated device
  `storeStableId`, and the adapter requests that exact Store snapshot through
  `BRAND_STORE_CONFIG_READER`; the POS browser no longer uses the implicit
  `/staff/store/config` fallback for its own store context.
- Orders historical NULL-store compatibility is contracted in the current batch after
  direct production verification found `Order.storeId IS NULL = 0`. Store-scoped Orders
  and scheduled queries now match only the explicit canonical `storeStableId`; scheduled
  preparation no longer admits a NULL store row. Accepted, reprint, and amendment print
  dispatch now fail closed with a structured missing-store error instead of routing an
  unscoped order to `resolveConfiguredStoreStableId()`. Architecture scanning registers
  the affected Orders paths and rejects those NULL/configured-store fallbacks returning.
- Admin Brand/Store transport now uses only the owner-aligned staff contracts. Canonical
  staff Web Store consumers require an explicit `storeStableId` and use
  `/staff/stores/:storeStableId/*` adapters backed by `BRAND_STORE_CONFIG_READER/WRITER`
  and the Store schedule ports. The selector writes a valid `?store=` context before
  Store settings load. The singular `/staff/store/*` compatibility routes and the
  legacy `/admin/business/*` config/hours/holidays/temporary-close transport are both
  removed; the standalone legacy `BusinessHoursModule` is retired with that transport.
  Admin no longer writes `BusinessConfig`, `BrandConfig`, `StoreConfig`,
  `BusinessHour`, or `Holiday` through Prisma directly. The Brand/Store owner writer
  now writes only canonical `BrandConfig`/`StoreConfig` rows. Mirror-off production
  verification and the fail-closed destructive contraction are complete: the Prisma
  `BusinessConfig` model, physical table, sync trigger, and sync function are gone.
- Uber menu schedule/tax and store-status source reads now cross the Brand/Store
  boundary through an Uber application-owned `UBER_STORE_CONFIG_QUERY` port. The
  sole Uber composition root wires that port to `BRAND_STORE_CONFIG_READER` for
  both HTTP and dedicated-worker runtimes; Uber persistence no longer reads or
  creates `BusinessConfig`. Active Uber admin/source labels now identify
  `StoreConfig` as the canonical timezone/tax source; provider wire behavior is unchanged.
  Uber architecture CI now rejects any production `.businessConfig` regression.
- Messaging configuration now caches the canonical Brand/Store snapshot instead
  of a Prisma `BusinessConfig` model and no longer creates configuration on read.
  Brand support contact fields feed message templates, while Store name/address/
  phone feed invoice contact details so support and store-phone semantics are no
  longer conflated.
- `BrandStoreConfigModule` is exported through `store/public-api.ts`; its reader
  and writer tokens, identity/contract implementation, composition module, and
  shared Prisma implementation stay owner-internal. Cross-context consumers wire
  the public module and inject the public tokens instead of deep-importing internals.
- The architecture scanner protects the public surface from cross-context deep
  imports, prevents the canonical reader/writer from regressing to legacy persistence,
  requires canonical writes plus temporary-closure CAS, forbids any API runtime
  `.businessConfig` delegate, requires the Prisma `BusinessConfig` model to stay absent,
  and pins the registered contraction migration to atomic fail-closed parity/dependency
  checks with trigger → function → table DDL and no `CASCADE`. It also keeps POS
  Orders/Summary browser store context on the guarded POS endpoint and prevents
  canonical Admin Store clients/settings or the staff transport adapter from
  restoring implicit `/staff/store/*` routes or optional `storeStableId` contracts.
- Admin remains an Identity/Customer/Benefits adapter path for dependency-map
  accounting, but its Business configuration persistence now crosses the
  Brand/Store public writer boundary. No new direct context edge is introduced.
- Admin POS-device management crosses the Store Operations/POS `public-api.ts`
  management boundary. The former Admin Prisma device service and Prisma-generated
  status/store UUID DTO dependencies are removed, lowering Identity/Customer/Benefits
  runtime-data direct-import debt by five. Canonical Web requests use only
  `storeStableId`/`deviceStableId`; `pos-device.admin-db-id.v1` is now contracted,
  so unscoped list aliases, inbound Store/device DB UUID translation, the POS
  compatibility port/provider, and the Brand/Store legacy DB-ID resolver are absent.

## Phase 2 Benefits loyalty policy reader/writer boundary closed

- `apps/api/src/loyalty/public-api.ts` exposes narrow `LOYALTY_POLICY_READER` and
  `LOYALTY_POLICY_WRITER` contracts owned by Identity/Customer/Benefits. Loyalty
  earn/redeem/referral rates, tier multipliers, and tier thresholds remain
  explicitly excluded from the Brand/Store public configuration contract even
  though transitional columns currently live in `BrandConfig`.
- Membership program rules, Admin member tier-progress thresholds, and all
  LoyaltyService policy reads use the Benefits snapshot backed by transitional
  `BrandConfig` columns. Transaction-bound reads remain inside their existing
  Prisma transaction through `getLoyaltyPolicySnapshotWithTx(tx)`.
- Admin Members policy saves now use `/admin/benefits/loyalty-policy`, whose
  Benefits-owned writer preserves the established rounding/non-negative rules,
  while tightening `redeemDollarPerPoint` to the existing business invariant
  `> 0`; Phase B writes `LoyaltyProgramPolicy`, the `BusinessConfig` compatibility
  copy, and `BrandConfig` in one transaction. The compatibility copies are still
  required because the existing DB trigger is one-way (`BusinessConfig` -> canonical
  config); allowing either transitional copy to become stale could revert Benefits
  values on a later unrelated legacy config write.
- The general Admin Settings page no longer declares or resubmits Loyalty policy
  fields. During the Benefits transition, legacy `PATCH /admin/business/config` and
  `PUT /admin/business/temporary-close` rejected all ten Loyalty keys with HTTP 400;
  the later Brand/Store transport contraction now removes those routes entirely.
  `AdminBusinessService` still does not import or invoke Benefits policy readers or
  writers, and repository-wide Web code remains gated from restoring the retired
  `/admin/business/*` transport or routing Loyalty policy through it.
- Admin Members now reads editable settings from `GET /admin/benefits/loyalty-policy`
  through the Benefits settings reader, while POS payment reads the runtime policy
  from `GET /pos/loyalty-policy` through a POS adapter protected by the existing
  Session/Role/PosDevice guards. Both browser consumers use the centralized Web
  Loyalty API client rather than the legacy Admin Business response.
- Orders quote/create redemption conversion reads `redeemDollarPerPoint` through
  `LOYALTY_POLICY_READER`; the points/cents arithmetic remains characterized in an
  Orders-owned pure helper. Orders delivery pricing, sales tax, store coordinates,
  Uber Direct enablement, and daily-special store-local timezone now read through
  `BRAND_STORE_CONFIG_READER`; Orders no longer reads or creates `BusinessConfig`.
  The architecture scanner registers Orders as a migrated Brand/Store consumer and
  forbids reintroducing the `BusinessConfig` symbol or delegate there.
- `benefits.business-config-loyalty-policy.v1` is **closed**. Phase A expanded and
  backfilled `LoyaltyProgramPolicy`, Phase B established transitional triple-write/parity,
  Phase C cut runtime reads to the dedicated row, and Phase D completed the persistence
  contraction. Editable settings, runtime/transaction reads, and writes now use only
  `LoyaltyProgramPolicy`; `BrandConfig` and `BusinessConfig` no longer contain Loyalty
  policy columns; `syncBusinessConfigToCanonicalConfig()` contains no Loyalty propagation;
  and the architecture scanner rejects both application regression and reactivation of
  this persistence compatibility. Production direct verification covered Admin policy
  change/restore, POS policy load, Web pure-points order plus exact refund reversal,
  public membership rules, unrelated Store write/restore, database metadata, and the
  relevant error logs.
- `brand-store.business-config.v1` is **closed**. The application cutover and mirror-off
  production proof completed first, then migration
  `20260902044000_contract_brand_store_business_config` rechecked the 29 overlapping fields,
  expected trigger/function binding, row counts, and database dependencies under locks before
  dropping trigger → function → table without `CASCADE`. Post-deployment verification on
  2026-09-02 confirmed `BusinessConfig`, `BusinessConfig_sync_canonical_config`, and
  `syncBusinessConfigToCanonicalConfig()` are absent while `BrandConfig`, the configured
  Store, and `StoreConfig` remain intact. An Admin Brand PATCH persisted the new canonical
  exchange rate `5.2`; POS pause/resume both returned 200, Uber status sync succeeded in both
  directions, final StoreConfig state is open, and API/worker error scans were clean.

## Phase 3 Catalog / Pricing / Offers started

- Phase 3 Slice 1 is tracked in
  `docs/architecture/phase-3-catalog-pricing-offers.md`.
- Orders now consumes Pricing only through `apps/api/src/promotions/public-api.ts`.
  The public surface exposes the existing promotion evaluator/types plus a narrow
  `PROMOTION_CONTEXT_READER`; `OrdersService` no longer imports the Pricing
  service, evaluator, engine or coupon adapter internals directly.
- The corresponding architecture allowance
  `commerce-orders-fulfillment -> catalog-pricing-offers` is removed from the
  baseline, contracting that direct-import debt from 5 to 0.
- Loyalty's two promotion-engine imports and Admin's Promotions module wiring now
  use the same public surface, lowering
  `identity-customer-benefits -> catalog-pricing-offers` from 10 to 7 in Slice 1.
- Slice 2 adds an explicit `apps/api/src/benefits` owner root and Benefits-owned
  coupon claim/trigger/admin-issuance contracts. `CouponsModule` is no longer
  global and exports only those narrow tokens instead of concrete services.
- Auth, Loyalty, Membership, Promotions and Admin now consume coupon-entitlement
  behavior through `benefits/public-api.ts`; CouponTemplate/CouponProgram
  validation and CRUD are exposed through `coupons/public-api.ts`. The remaining
  `identity-customer-benefits -> catalog-pricing-offers` allowance is therefore
  removed, contracting that direct-import debt from 7 to 0. Removing Admin's two
  direct Prisma imports also contracts `identity-customer-benefits ->
  runtime-data-ci-ops` from 23 to 21.
- The legacy Coupon implementation stays physically under `coupons` until its
  Prisma/Messaging dependencies can be contracted without raising another debt
  allowance. Slice 2 itself left Payments-facing coupon HOLD/COMMIT/RELEASE unchanged.
- Slice 2B is **MERGED** via PR #2139 / `6a022c8c`. Unified Payment preparation now
  injects Benefits-owned Points/Balance and Coupon reservation ports, and the POS
  payment composition module imports the Benefits public reservation module instead
  of `LoyaltyModule` / `MembershipModule` directly. Coupon HOLD carries
  `userStableId` rather than the snapshot's internal User DB UUID. Four production
  deep imports disappeared, lowering `payments-clover -> identity-customer-benefits`
  from 17 to 13; CI architecture/lint/build/test gates were green before merge.
- Slice 2C is **DEFERRED** after a 2026-09-03 readiness audit. The transaction-bound
  COMMIT remains inside `OrdersService.createFromConfirmedPaymentSnapshot()` because
  Points/Balance COMMIT, Coupon COMMIT and Order creation currently protect one
  atomic Prisma transaction. Replacing only the two COMMIT calls would not remove
  the broader `OrdersService` Benefits dependency, while splitting the transaction
  or publishing `Prisma.TransactionClient` would violate the current transaction
  boundary rules. Revisit only after a safe transaction-scoped capability exists.
- Slice 3 is merged via PR #2141 / `a29aae1d`. Admin menu CRUD/read-model/application
  decisions now live in Catalog-owned `CatalogAdminService` exposed via
  `menu/public-api.ts`. The legacy `AdminMenuService` is deleted; Admin
  controller/module no longer own Prisma or Brand/Store configuration reads. The two
  removed Admin Prisma imports contract `identity-customer-benefits ->
  runtime-data-ci-ops` from 21 to 19. A new Catalog Prisma import is offset by
  deleting the redundant local `PrismaService` provider from `PromotionsModule`, so
  `catalog-pricing-offers -> runtime-data-ci-ops` remains 10 rather than increasing.
- Slice 3's temporary Admin availability/provider coordination is contracted by
  Slice 5. `AdminMenuAvailabilityOrchestrationService` is deleted; Admin menu now
  consumes a public application orchestration surface and no longer wires
  `UberEatsModule` directly. Catalog availability facts are exposed through a narrow
  public reader that Uber composition adapts into an application query port;
  `UberMenuAvailabilityPrismaAdapter` no longer reads Catalog `MenuItem` /
  `MenuOptionTemplateChoice` Prisma delegates and stays DB-only for Uber mapping /
  OpsTicket facts. The fixed-component
  `publishToUberEats` provider-capability restriction now lives in orchestration
  rather than `CatalogAdminService`. Removing the old Admin service's foundation
  logger import and Admin module's direct `UberEatsModule` wiring lowers
  `identity-customer-benefits -> architecture-foundation` from 14 to 13 and
  `identity-customer-benefits -> external-channels` from 2 to 1. The replacement
  cross-context calls use public surfaces, so no new debt pair is introduced. The
  scanner is tightened to prevent the old Admin/provider and Uber/Catalog persistence
  paths from returning. Production Web Clover, Prisma schema/migrations and Uber
  wire contracts remain unchanged. Active verification passed item permanent OFF/ON,
  temporary-today availability and option OFF/ON. PR #2148 removed the stale
  `isAvailable` field from ordinary Admin item saves; after hard refresh, final
  verification at 00:11:00/00:11:05 Toronto observed two normal item PUT 200s and zero
  Uber availability updates in the surrounding minute. Slice 5 is production verified.
- Slice 5B locally contracts Daily Special ownership into Offers. The existing
  `PromotionsService` implements the new `DAILY_SPECIAL_OFFERS` capability and remains
  the sole `MenuDailySpecial` persistence owner for store-time activation/effective
  pricing without adding a new Prisma direct edge. Catalog supplies only item stable-ID/base-
  price facts; Admin full-menu/list/bulk-write composition lives in `application/menu`,
  and Public Menu / Orders consume the Offers public capability rather than the
  `menuDailySpecial` Prisma delegate. `CatalogAdminModule` isolates the reusable Catalog
  owner provider so Uber worker availability composition does not inherit HTTP-side
  Daily Special/StoreConfig wiring. The central scanner now reserves
  `MenuDailySpecial` Prisma access exclusively for the Offers service. No direct debt
  pair/count is expected to change because replacement traffic uses public surfaces.
- Slice 4 is merged via PR #2142 / `3629bc3b`; coupon-issued notification requests
  now cross the Messaging public boundary. `CouponProgramTriggerService` injects the
  `COUPON_ISSUED_NOTIFICATION` port from `notifications/public-api.ts`, maps the
  current User/CouponProgram records into a narrow snapshot, and no longer imports
  `NotificationService`. `CouponsModule` also imports `NotificationModule` only via
  the public surface. Only `userStableId` crosses the public boundary; `EmailService`
  resolves the existing internal `MessagingSend.userId` relation inside Messaging
  persistence. Removing both former deep imports contracts
  `catalog-pricing-offers -> messaging-notifications` from 2 to 0, and the baseline
  allowance is deleted so any direct edge in that direction now fails CI.
- Pre-Phase-3 Uber boundary hardening is now **PRODUCTION VERIFIED** (2026-09-03):
  - PR #2130 / `32d3925f` contracted Uber Store Policy ownership so order admission
    reads auto-accept/allergen policy through `UBER_STORE_CONFIG_QUERY` ->
    `BRAND_STORE_CONFIG_READER` instead of persistence-adapter policy methods.
  - PR #2131 / `4b615f49` contracted Uber store identity naming: SanQ store context
    is explicitly `storeStableId`, provider identity remains `uberStoreId`, and
    persistence still writes the SanQ stable ID into `Order.storeId`.
  - PR #2132 / `0c0a678e` exposed Orders ingestion through the public
    `ORDER_INGESTION` boundary, removed Uber's concrete `OrderIngestionService`
    dependency, preserved the same-transaction Uber action/cancellation callback,
    and lowered `external-channels -> commerce-orders-fulfillment` from 5 to 1.
  - Active production/sandbox verification covered auto-accept ON, auto-accept OFF
    with manual acceptance, immediate order completion, Uber cancel/refund, and a
    scheduled order moving from scheduled queue into active preparation. The
    scheduled activation produced one print job with kitchen/customer delivery
    ACKs; three test orders persisted under `4750_Yonge_Street`, no duplicate
    ingestion was found, webhook processing completed on first attempt, and the
    Uber worker error/warn/failure scan was clean.
  - The allergen DENY_LIST case is recorded as **N/A (Uber Test Store limitation)**
    because the sandbox customer flow does not expose an allergen-entry control;
    it is not a failed verification item.
- PR #2134 / `e69b913d` fixed the Admin Uber pending-order read contract/UI mismatch:
  `orderStableId` and `totalCents` are returned again, `pickupCode` is exposed, and
  the table now shows a human-readable pickup code while truncating the two long
  IDs. CI is green; production UI re-verification remains pending the next deploy.

## Carried debt outside Phase 3 Slice 2

- `web.api-envelope-direct-payload.v1` was closed on 2026-09-02. Checkout now has
  zero regular JSON browser direct fetches, and the architecture scanner no longer
  carries a Checkout allowance.
- Payments/Clover is no longer frozen as one context. The dependency counts above
  are unchanged by this documentation-only policy revision. POS Clover Terminal is
  active pre-production modularization work and may be structurally contracted
  before real-device access returns when production Web Ecommerce behavior is
  unchanged. The current Web Clover path remains guarded production; a Web-impacting
  modularization change is allowed only when it is a documented critical blocker
  and must carry focused regression coverage plus post-deployment active payment
  verification before being marked production verified.
- A central chronological modularization index now lives at
  `docs/architecture/modularization-worklog.md`. Creating the worklog and making it
  a required per-slice progress record is documentation governance only and does
  not change the dependency counts or architecture baseline in this snapshot.
- Phase 2 Brand/Store identity and configuration contraction is **CLOSED** at
  `origin/dev@0917f66c`. `brand-store.business-config.v1`,
  `benefits.business-config-loyalty-policy.v1`, `pos-device.admin-db-id.v1`, and
  `brand-store.default-store-identity.v1` are all closed. The final Uber persistence
  migration removed the eight implicit `storeId` database defaults while preserving
  historical Test Store/sandbox rows exactly as-is. Post-deploy verification proved
  explicit `4750_Yonge_Street` Reconciliation persistence, successful POS pause/resume
  Uber status sync, successful published-item availability sync, zero new
  `storeId='default'` persistence, and clean API/worker error scans. Historical Uber
  verification records remain scheduled for the separate Uber Production Cutover
  Cleanup after verification approval and are not modularization debt or a Phase 2
  closure blocker.

## Reading the graph

- A count is debt, not permission to add more coupling.
- When a PR removes a direct import, lower/remove the matching baseline in the
  same PR so the dependency cannot return.
- New cross-context work must target the owner's `public-api`, `contracts`, or
  `ports` surface.
- Recompute this snapshot at every phase boundary; a new cycle, new direct pair,
  or ambiguous identity field blocks phase closure.
