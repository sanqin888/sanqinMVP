# Phase 5 — Commerce / Orders / Fulfillment Boundary Contraction

Start date: 2026-09-05  
Current implementation base: `origin/dev@62790355` (Slice 3 Orders -> Messaging merge / PR #2201)  
Current status: **SLICE 4A LOW-RISK DIRECT-EDGE + DEAD-CODE CONTRACTION LOCAL / REVIEW PENDING — SLICE 3 IS MERGED / PR CI GREEN; AUTH GUARD AND LOCATION ACCESS NOW USE OWNER PUBLIC SURFACES LOCALLY, THE OBSOLETE ORDERSERVICE UBER DIRECT / LOYALTY TAIL IS REMOVED, TARGETING COMMERCE -> BRAND/STORE 2 -> 0 AND COMMERCE -> IDENTITY 4 -> 2; PHASE 5 ACTIVE VERIFICATION REMAINS DEFERRED TO THE CONSOLIDATED CLOSEOUT GATE**

## Goal

Phase 5 turns Commerce / Orders / Fulfillment into an enforceable L3 boundary before Payments/Clover and POS Terminal contraction. Orders continues to own quote/order snapshots, the Order aggregate and lifecycle, amendments/refund requests, and fulfillment intent. It must progressively stop reading another context's persistence directly or importing another context's concrete service/provider implementation.

This phase is not a rewrite and does not begin by mechanically splitting `orders.service.ts`. Each later slice must first establish the smallest owner/public capability required by the behavior being moved, preserve transaction/idempotency semantics, and then delete the old direct dependency in the same reviewed slice when the migration class permits it.

## Phase 5 verification cadence

Per the repository-wide modularization rule adopted on 2026-09-06, Phase 5 does **not** require a separate production deployment/active-test checklist after every slice. Each slice must remain independently deployable, focused-test/architecture guarded and CI-green, and it must record any runtime/payment/provider/printing/PWA/reconciliation behavior that the final Phase verification must cover. After all planned Phase 5 source slices are merged and immediately before Phase 5 closeout, perform one readiness audit against the final merged state, produce the consolidated Phase 5 deployment + active-verification plan, execute it deliberately, fix any regression found, and only then mark Phase 5 `PRODUCTION VERIFIED / CLOSED`. Explicit compatibility exits, destructive migrations, provider certification, settlement gates or irreversible cutovers may still require an earlier dedicated verification event.

Historical Slice-level active verification evidence from earlier phases remains valid and is not rewritten by this cadence change.

## Entry state

Phase 4 is **PRODUCTION VERIFIED / CLOSED**. The final public SCC baseline is empty. On the current Slice 3 local source state, direct-import totals are:

- payments-clover: **57** *(Slice 1D contracts Payments -> Commerce direct debt by 2)*
- external-channels: **42**
- identity-customer-benefits: **33**
- store-operations-pos-print: **31**
- commerce-orders-fulfillment: **26** *(pre-Slice 3 hardening 30 -> 29; Slice 3 local contraction 29 -> 26)*
- accounting-reporting-analytics: **25**
- catalog-pricing-offers: **15**
- messaging-notifications: **9** *(Slice 3 local invoice contract removes the remaining Messaging -> POS direct edge)*
- brand-store: **8**

PR #2192 / `a464c1c3` fixed the separate POS Order Management historical query without changing the architecture graph, payment/refund semantics, or Phase 4 closure.

Phase 3 Slice 2C remains explicitly deferred: confirmed-payment finalization currently commits Points/Balance reservations, Coupon reservations, and `Order.create()` in one Prisma transaction. Phase 5 must not remove that direct implementation coupling by splitting the transaction, exporting `Prisma.TransactionClient` as a public cross-context contract, or moving Benefits persistence into Orders.

## Slice 0 — Orders/Fulfillment readiness + characterization

Status: **MERGED / CI GREEN** — PR #2193, final head `a8be129b`, squash merge `07311f74`; merged dev CI #5194 passed.

Migration classification: **Class A, test/documentation-only readiness work**. Slice 0 changes no production behavior, public contract, persistence schema, migration history, provider protocol, dependency direction, architecture allowance, or compatibility path.

Slice 0 locks or inventories the current behavior before any owner movement. Existing tests already cover much of quote/create/status/refund/outbox/print behavior; new characterization is added only where the audit found material gaps.

### Characterization coverage matrix

| Capability | Current owner/entry | Characterization state after Slice 0 |
|---|---|---|
| Quote | `OrdersService.quoteOrderPricing()` | Existing `orders.service.spec.ts` locks Brand/Store pricing inputs, Daily Special, coupon eligibility, hidden item policy, loyalty redemption, PromotionRule channel mapping, automatic promotion, BOGO and retained POS manual discount. |
| Create | `OrdersService.create()` / `createForStore()` / `createImmediatePaid()` | Existing `orders.service.spec.ts` locks Web-only generic create, authenticated POS store identity, checkout contact handling, priority-delivery tolerance and paid-event behavior. |
| Confirmed payment finalize | `OrdersService.createFromConfirmedPaymentSnapshot()` | **New characterization** locks the same-transaction Points/Balance COMMIT + Coupon COMMIT + paid `Order` snapshot creation, immutable prepared amounts/items, surcharge/payment breakdown, idempotent existing-order return, and no replay of paid side effects on that early return. |
| Status | `updateStatus*()` / `updateStatusByInternalId()` | Slice 0 characterization locked the successful guarded `paid -> making` write and the then-existing same-process `prep_started` emission. Slice 1E retains the guarded write but retires that first-print event side effect; durable preparation now owns `prep_started`. |
| Full refund | `createFullRefund()` | Existing dedicated `orders.full-refund.spec.ts` locks Uber/manual pending behavior, internally-finalizable in-store/zero-external Web refunds, Loyalty rollback order, full-amount/method validation and concurrency/idempotency guard. |
| Amendment | `createAmendment()` | Slice 2 extends characterization to canonical ADD/SWAP OrderItem snapshot materialization, payment-method-only RETENDER, kitchen amendment handoff, positive label-plan delta and customer full-receipt reprint after amount/payment changes. |
| Durable lifecycle/outbox | `OrderPreparationService` + `OrderLifecycleOutboxProcessor` | Tests lock accepted-fact gating, row locks/SKIP LOCKED, idempotent `prep_started`, replay after failure, and the Orders-owned `order.initial_print_handoff` checkpoint; the previous `PosPrintJob` existence probe is removed in Slice 2. |
| Print | `FulfillmentProcessor` -> `ORDER_PRINT_HANDOFF_REQUESTED` -> `PosGateway` | Slice 2 locks Print-owned AUTO/REPRINT/AMENDMENT identity/routing, database target claim before socket emission, ACK/timeout terminality, stale-delivery recovery, and Windows-agent `jobId + target` replay suppression. |
| Uber Direct | `FulfillmentProcessor.onPaid` -> `UberDirectService.createDelivery()` | **New adapter characterization** locks canonical request -> provider payload mapping, server-token auth, provider response normalization/cost extraction, and rejection of a DB UUID as `orderRef`. No provider call or runtime behavior is changed. |

## Direct Prisma/persistence inventory inside `apps/api/src/orders/**`

This is a source inventory, not a claim that every listed access should be removed. Orders-owned persistence is valid when kept inside the Orders persistence/application boundary; cross-owner persistence is the contraction target.

| Production file | Direct delegates / raw persistence | Ownership assessment |
|---|---|---|
| `orders.service.ts` | `order`, `menuItem`, `checkoutIntent`, `user`, `userAddress`, `loyaltyAccount`, `orderAmendment`, `orderAmendmentItem`, `orderItem`; `$transaction` | `order/orderItem/orderAmendment*` are Orders-owned. `menuItem` is Catalog leakage; `user/userAddress` are Identity/Customer leakage; `loyaltyAccount` is Benefits leakage; `checkoutIntent` is Payments/Web-checkout persistence and is production-sensitive. |
| `order-ingestion.service.ts` | transaction-scoped `order`, `orderItem`, `uberOrderItemModifier` | Order persistence is owner-local; writing `uberOrderItemModifier` from the Orders ingestion service is provider-persistence coupling and requires a later controlled boundary decision. |
| `order-scheduling-query.service.ts` | `order` | Orders-owned. |
| `order-label-plan.service.ts` | `order`, `menuItem` | `order` is owner-local; `menuItem` is Catalog leakage used for current packaging/label configuration. |
| `print-pos-payload.service.ts` | `order`, `checkoutIntent` | Order snapshot is owner-local; checkout metadata read crosses into payment/checkout persistence. |
| `order-preparation.service.ts` | transaction-scoped `order`, `opsEvent`, raw SQL against `Order` / `OpsEvent` | Orders lifecycle/outbox behavior; currently intentional L3 transaction/locking implementation. |
| `pos-order-read.service.ts` | `order`, `orderAmendment` | Orders-owned read model. |
| `admin-member-orders-read.service.ts` | `order`, `orderItem` | Orders-owned read model. |
| `processors/fulfillment.processor.ts` | `order`, `checkoutIntent` | Order read is local; checkout metadata dependency remains cross-owner. |
| `processors/order-lifecycle-outbox.processor.ts` | `$transaction` + raw SQL across `OpsEvent`, `Order` | Durable Orders lifecycle reads only its own event/order facts and checkpoints successful INITIAL handoff as `order.initial_print_handoff`; Slice 2 removes the Print-owned `PosPrintJob` probe. |

Unique non-Orders persistence surfaces reached from the Orders tree are therefore:

- Catalog: `MenuItem`;
- Identity / Customer: `User`, `UserAddress`;
- Benefits: `LoyaltyAccount`;
- Payments / Web checkout: `CheckoutIntent`;
- External/provider persistence: `UberOrderItemModifier`.

Slice 2 removes the prior Store Operations / Print `PosPrintJob` existence read from the Orders lifecycle query.

## Concrete service/module imports from the Orders tree

The narrow public ports already in use are not listed as concrete-service debt here. The following concrete implementations remain directly imported by production Orders/Fulfillment code. `UberDirectService` currently lives under `deliveries/**`, which the scanner maps into the same Commerce context, so it does not consume a numeric cross-context allowance; it is still provider-specific implementation leakage relative to the target ownership model.

`PrismaService` remains the broadest concrete infrastructure dependency: it is consumed directly by `orders.service.ts`, `order-ingestion.service.ts`, `order-scheduling-query.service.ts`, `order-label-plan.service.ts`, `print-pos-payload.service.ts`, `order-preparation.service.ts`, `pos-order-read.service.ts`, `processors/fulfillment.processor.ts`, and `processors/order-lifecycle-outbox.processor.ts`; `admin-member-orders-read.service.ts` consumes the same service through the local `orders-prisma.ts` re-export. This is why Commerce -> Runtime remains **10** even though some individual persistence accesses are valid Orders-owned data.

| Consumer | Concrete dependency | Current purpose / classification |
|---|---|---|
| `OrdersService` | `LoyaltyService` | stable customer -> DB identity resolution, available tender, reservation/mutation/refund/amendment behavior not yet fully behind Benefits public capabilities |
| `OrdersService` | `MembershipService` | coupon validation/reserve/commit/mark-used behavior |
| `OrdersService` | `UberDirectService` | **Static but apparently inactive legacy tail:** injected only for private `dispatchPriorityDelivery()`. Repository search finds no call site for that private helper; active paid-order Uber Direct dispatch is in `FulfillmentProcessor`. Keep as a review/deletion candidate, not as proof of a second active provider path. |
| `OrdersService` | `LocationService` | address geocoding for delivery quoting/create |
| `FulfillmentProcessor` | `UberDirectService` | paid-order Uber Direct dispatch |

After Slice 3, composition directly imports `DeliveriesModule` and `LocationModule`; `NotificationModule`, `LoyaltyModule`, `BrandStoreConfigModule`, `MembershipModule`, and `PromotionsModule` are imported through their registered public surfaces. The broad `OrdersService` still consumes concrete Loyalty/Membership services in addition to narrower ports, while order-ready and invoice delivery use Messaging public capabilities.

For completeness, same-context concrete wiring found by the source audit is not classified as cross-owner debt by itself: `OrdersController -> OrdersService`; `PosOrderOperationsService -> OrdersService + OrderSchedulingQueryService`; `PosOrderReadService -> OrdersService`; `OrderLifecycleOutboxProcessor -> FulfillmentProcessor + OrderPreparationService`; `ScheduledOrderProcessor -> OrderPreparationService`; and `FulfillmentProcessor -> PrintPosPayloadService + OrderLabelPlanService`. These relationships still matter when `OrdersService` is later split, but Slice 0 does not manufacture interfaces around them merely to reduce concrete class references.

There are also two direct POS type couplings from Orders implementation code (`PrintPosPayloadDto` in `print-pos-payload.service.ts` and `fulfillment.processor.ts`) even though Print is a Store Operations owner. These are recorded for the later Fulfillment/Print slice rather than changed in Slice 0.

## EventEmitter / lifecycle consumer inventory

Slice 0 initially found two in-process event mechanisms plus the durable Orders lifecycle facts. Slice 1E retires the private prep-started first-print event, leaving only one private Node event plus the durable lifecycle.

### Private Node `EventEmitter` — `OrderEventsBus`

| Event/channel | Emitter | Consumer | Current side effect |
|---|---|---|---|
| `order.paid.verified` | `OrdersService.handleOrderPaidSideEffects()` | `FulfillmentProcessor.onPaid` | For eligible delivery orders, call Uber Direct and persist `Order.externalDeliveryId`. |

The former same-process `order.prep_started` / compatibility-named `emitOrderAccepted()` path was a Slice 0 baseline fact and is retired by Slice 1E. Initial AUTO printing now consumes only durable `orders.lifecycle/order.prep_started`. `NotificationProcessor` is still wired in `OrdersModule` but registers no event consumer; it only logs that automatic invoice email is disabled, so it remains a later atomic deletion candidate after confirming no composition/bootstrap dependency. The audit also found the older private `OrdersService.dispatchPriorityDelivery()` / `buildUberPickupOverride()` tail has no source call site; it is not a second active Uber Direct producer and remains dead-code debt for a later atomic cleanup. The obsolete uncalled `OrdersService.notifyDeliveryDispatchFailureAlert()` helper was removed in the pre-Slice 3 Uber Direct alert hardening batch once the active `FulfillmentProcessor` path became canonical. `OrdersService.ensureLoyaltyAccountWithTx()` likewise has only its definition and no source call site; its presence must not be mistaken for an active second Loyalty-account creation path.

### Nest `EventEmitter2`

| Event | Emitter | Consumer | Delivery semantics |
|---|---|---|---|
| `order.reprint` | POS Orders controller | `FulfillmentProcessor.handleOrderReprint()` | Explicit operator reprint; creates a new `REPRINT:<timestamp>` kind. |
| `order.amendment.print` | POS Orders controller | `FulfillmentProcessor.handleOrderAmendmentPrint()` | Best-effort kitchen amendment copy; creates `AMENDMENT:<timestamp>` kind. |
| `orders.pos-print-job.dispatch-requested` | `FulfillmentProcessor.dispatchPrintJob()` using `emitAsync()` | `PosPrintDispatchListener` -> `PosGateway.sendPrintJob()` | Exactly one listener is required by the caller; zero or multiple handler results are treated as an error. |

### Durable lifecycle facts

`UberOrderActionPrismaAdapter` appends `orders.lifecycle / order.accepted` with an idempotency key after external acceptance. `OrderLifecycleOutboxProcessor` claims accepted immediate Orders and calls `OrderPreparationService`, while the scheduled processor activates due scheduled Orders. `OrderPreparationService` changes the Order to `making` and appends `orders.lifecycle / order.prep_started` in the same transaction. The outbox processor then materializes that durable fact through `FulfillmentProcessor.handleAcceptedLifecycle()`.

## In-memory + durable duplicate-side-effect audit

### Finding 1 — Slice 0 coexistence was safe enough for readiness; Slice 1E removes it entirely

At the Slice 0 baseline, the same-process prep path and durable path both ultimately called `FulfillmentProcessor.handleAcceptedLifecycle()`, and source analysis found no intentional fan-out of one successful transition into both mechanisms. Slice 1E closes the remaining Uber staff-transition bypass and retires the same-process prep producer/consumer entirely.

Current source after Slice 2 therefore has one initial-print lifecycle and an owner-safe Print handoff:

- channel/provider-specific acceptance records durable `order.accepted`;
- `OrderPreparationService` requires that accepted fact, locks the Order, and writes status=`making` plus durable `order.prep_started` atomically;
- if the Order is already `making/ready/completed`, `OrderPreparationService` returns `already_active` and does not append another `prep_started` fact;
- the durable lifecycle retries until Print accepts `INITIAL`, then records Orders-owned `order.initial_print_handoff` rather than querying `PosPrintJob`;
- Print maps INITIAL to the unique AUTO job and owns per-target dispatch/ACK state;
- no `OrderEventsBus` prep_started emitter/listener remains.

Result: **the previous coexistence and Orders -> Print persistence probe are no longer part of the current architecture; initial AUTO materialization is durable-only and handoff completion is tracked by Orders-owned lifecycle facts.**

### Finding 2 — Slice 2 closes the Print target-dispatch concurrency/restart gap

At the Slice 0 baseline, sequential AUTO calls reused `(orderStableId, kind)` but `PosGateway.sendPrintJob()` could still allow two truly concurrent callers to reach socket emit before either persisted the per-target delivered state. Slice 2 removes caller-owned `kind` and moves the critical section into Print: `PosGateway` locks the job row, allows only `PENDING/FAILED`, commits `DELIVERED + attempts` first, and only then emits `PRINT_JOB`. A second concurrent caller therefore sees the committed claim and cannot emit the same target.

ACK/timeout mutation uses the same row-lock discipline, `COMPLETED` is terminal, and stale `DELIVERED` targets are recovered after restart/reconnect. The unchanged Windows agent additionally persists successful `jobId + target` completion and suppresses repeated in-flight/completed physical delivery. This closes the known Slice-0 Print hardening debt without a schema or wire-protocol migration.

### Finding 3 — `order.paid.verified` / Uber Direct is not durable

The Uber Direct dispatch fast path is private in-memory delivery, not part of `orders.lifecycle`. It first checks `Order.externalDeliveryId`, calls the provider, then writes the returned provider delivery ID. Therefore there is no duplicate interaction with the current durable accepted/prep outbox. However, a process loss after provider success but before `externalDeliveryId` persistence is not recoverable from the current in-memory event alone, and a later manual/retriggered provider call could create a second provider delivery if the provider itself does not deduplicate the reference.

This is a **durability/idempotency gap**, not evidence of an active duplicate caused by the two event systems. It belongs to the later controlled Fulfillment/Uber Direct slice and must not be changed casually because it is externally observable provider behavior.

### Finding 4 — explicit reprint/amendment events are intentionally separate from AUTO idempotency

`REPRINT:<timestamp>` and `AMENDMENT:<timestamp>` create new job kinds by design, so repeated operator actions are not deduplicated as AUTO. They are not evidence of the fast-path/outbox duplication concern.

## Slice 0 files changed

Tests only:

- `apps/api/src/orders/orders-payment-finalization.characterization.spec.ts`
- `apps/api/src/orders/orders-amendment.characterization.spec.ts`
- `apps/api/src/deliveries/uber-direct.service.spec.ts`
- `apps/api/src/orders/orders.service.spec.ts`
- `apps/api/src/pos/pos.gateway.spec.ts`

Documentation:

- this phase document;
- `docs/architecture/current-dependency-graph.md`;
- `docs/architecture/modularization-worklog.md`.

No production `.ts` implementation, Prisma schema/migration, dependency manifest/lockfile, public API, active/closed compatibility path, architecture scanner baseline, provider wire contract, Web/POS behavior or database state is changed. The compatibility register's review queue is updated only to record that the EventEmitter/outbox candidate was audited and does not require a `compat_id`.

## Revised execution sequence after Slice 0 print-flow audit

Post-merge source tracing found that the existing POS payment page performs its first successful print by calling the manual `/pos/orders/:orderStableId/print` route, which emits `order.reprint` and creates `REPRINT:<timestamp>`, then separately advances the Order from `paid -> making`. The accepted/prep lifecycle AUTO path skips `channel=in_store`, while the pre-production Clover Terminal orchestration has its own `PAYMENT_CHECKOUT:<attemptId>` print path. Uber already uses the durable `order.accepted -> order.prep_started -> AUTO` path. Phase 5 therefore prioritizes lifecycle/initial-print convergence before the previously planned Messaging contraction.

Target first-print semantics are:

```text
channel-specific paid/accept eligibility
  -> durable order.accepted
  -> OrderPreparationService
  -> status=making + durable order.prep_started in one Orders transaction
  -> unique AUTO PrintJob materialization
  -> Print-owned dispatch/retry/ack
```

Explicit operator reprints remain separate `REPRINT:*` operations, and amendment copies remain `AMENDMENT:*`; only the initial automatic print converges on `AUTO`.

### Slice 1A — POS cash payment-summary snapshot readiness

Status: **MERGED / PR CI GREEN** — PR #2194, head `a6abb191`, merge `db7a1de9`; PR CI #5195 passed. Production behavior remains intentionally unchanged by 1A itself.

Migration classification: **backward-compatible additive contract/snapshot change**. No Prisma schema/migration, provider protocol, Order lifecycle transition, PrintJob identity, architecture allowance or context dependency direction changes.

Current POS cash collection computes `cashReceivedCents` and `cashChangeCents` only in the browser and forwards them as transient parameters to the `/print` request. That prevents the future durable `prep_started -> AUTO` path from reconstructing the same customer receipt after a process restart or without the original browser request. Slice 1A therefore:

- adds optional `cashReceivedCents` to the shared CreateOrder contract; old PWA bundles remain valid because the field is additive/optional;
- accepts it only for authenticated `channel=in_store` + `paymentMethod=CASH` creation and rejects underpayment/non-cash misuse;
- preserves the existing POS cash rounding rule exactly: the remaining cash tender is rounded upward to the next 5 cents for collection/change calculation, while `Order.totalCents`, tax, discounts and accounting amounts remain the exact server-calculated cents;
- persists only `{ cashReceivedCents, cashChangeCents }` into the existing nullable `Order.paymentBreakdownJson` for these cash Orders. It deliberately does **not** add `externalCents` for in-store Orders, because that key currently participates in Web external-payment/refund reconstruction and changing in-store interpretation would exceed Slice 1A;
- makes `PrintPosPayloadService` recover the persisted cash receipt facts into the existing top-level print payload shape, so a later AUTO print or operator reprint can reproduce the receipt without browser-only state;
- keeps the current POS first `/print` + `advanceOrder()` behavior untouched in 1A. Existing transient `/print` cash parameters continue to work for old PWA bundles; Slice 1B owns the actual initial-print/lifecycle cutover.

Focused characterization locks server-derived change, including a non-five-cent exact Order total, rejects insufficient cash, and proves print-payload recovery from persisted Order facts.

### Slice 1B — POS ordinary checkout durable lifecycle cutover

Status: **MERGED / CI GREEN** — PR #2195, final head `c8ed5579`, squash merge `e4a783a5`; PR CI #5200 passed. Runtime verification is accumulated into the Phase 5 closeout gate rather than blocking the next Slice.

Migration classification: **Class C controlled critical cutover** for the store-facing POS fulfillment/printing path. The user explicitly authorized a maintenance-window cutover without preserving the old PWA first-print/first-advance sequence. No Prisma schema/migration, dependency, public route name, provider protocol or architecture allowance is changed.

Canonical ordinary POS flow after 1B:

```text
POST /pos/orders
  -> Order(status=paid) + durable orders.lifecycle/order.accepted in the same DB transaction
  -> transaction commit
  -> eager wake of the existing OrderLifecycleOutboxProcessor
  -> OrderPreparationService
  -> Order.status=making + durable order.prep_started in one Orders transaction
  -> OrderLifecycleOutboxProcessor
  -> FulfillmentProcessor durable origin
  -> AUTO PrintJob
  -> existing Print dispatch/retry/ACK path
```

The 500 ms lifecycle poll remains the crash/restart recovery path. The eager wake only asks the **same durable consumer** to drain after commit; it does not directly call preparation or print and therefore does not create a second business side-effect path.

Behavioral contraction in the POS payment browser is atomic for the new deployed bundle: after successful `/pos/orders` creation it no longer calls `printOrderCloud()` and no longer calls `advanceOrder()`. The old sequence `create -> REPRINT:<timestamp> -> advance paid->making` is therefore retired as the canonical first-order path. `/pos/orders/:orderStableId/print` remains because it is the explicit operator reprint capability, and `/advance` remains because staff still use it for later order-state progression such as `making -> ready`; neither retained route is a first-checkout compatibility path. To close the small race where staff could press advance while a fresh in-store Order is still `paid`, `PosOrdersService.advance()` now routes only that `in_store + paid` case through store-scoped `activateImmediatePreparation()` instead of the generic direct status transition, then re-reads the Order. Thus `paid -> making` cannot bypass durable accepted/prep even when invoked manually.

Orders appends `order.accepted` only for authenticated store-scoped `channel=in_store` creation. Store-scoped `ubereats` creation does not synthesize local acceptance; Uber external acceptance continues to own its existing durable accepted fact. Durable `prep_started` is now allowed to materialize AUTO printing for `in_store`, while the private same-process `OrderEventsBus` origin continues to skip in-store AUTO so a non-durable status event cannot form a second initial-print path.

Focused regression coverage locks:

- in-store `Order.create()` and `order.accepted` fact creation in the same mocked transaction path with the stable `order.accepted:<orderStableId>` idempotency key;
- eager post-commit lifecycle drain through `PosOrderOperationsService`, plus store-scoped manual `in_store + paid` activation through the same durable preparation capability;
- durable lifecycle consumers calling Fulfillment with explicit `origin=durable`;
- durable in-store prep creating `kind=AUTO`, while memory-origin in-store prep remains non-printing;
- the POS payment page retaining `/pos/orders` creation and cash receipt submission while containing neither `printOrderCloud()` nor `advanceOrder()`.

No active compatibility entry is added: the user explicitly chose not to support old cached POS payment bundles after cutover. Operational rollout must therefore ensure the deployed POS/PWA is on the intended Phase 5 bundle before Phase-closeout testing begins. Rollback/forward-fix semantics remain important because historical accepted/prep facts must not be rewritten or treated as failed.

Under the 2026-09-06 verification-cadence rule, Slice 1B no longer carries its own post-deployment active-test checklist or a "verify before next Slice" gate. Its affected POS cash/benefit/order-state/printing/reconnect/reprint behaviors are inputs to the consolidated Phase 5 closeout verification plan, which will be generated from the final merged Phase state immediately before closeout.

Slice 1B does not change Web Clover Ecommerce, POS Clover Terminal finalization, Uber wire/order-action behavior, refunds, Benefits COMMIT semantics, pricing/promotion calculation or the known Print socket-concurrency hardening debt.

### Slice 1C — Web/local durable lifecycle convergence

Status: **MERGED / CI GREEN** — PR #2196, final head `3dc21e5d`, squash merge `61f5917d`; PR CI #5204 and merged-dev CI #5205 passed.

Migration classification: **Class C controlled critical cutover** for the Web order acceptance/preparation/initial-print path. It does not change Clover charge/session execution, amount/currency/payment-ID validation, checkout-intent consumption, surcharge calculation, refund behavior, or the fact that Web payment success itself only creates a `paid` Order. The existing store-facing acceptance policy remains authoritative: with auto-accept enabled, `StoreBoardWidget` detects a new Web `paid` order and invokes the canonical POS `/advance`; with auto-accept disabled, staff invoke that same action manually.

Slice 1C moves what happens **after that acceptance decision**:

```text
Web payment success
  -> Order(status=paid)                 # unchanged; no accepted fact yet
  -> store auto/manual acceptance via /pos/orders/:id/advance
  -> store-scoped durable order.accepted
  -> IMMEDIATE: eagerly invoke the same OrderPreparationService materializer
       (accepted-event 500 ms outbox scan remains crash/restart recovery)
  -> SCHEDULED: remain paid/accepted until existing prepStartAt scheduler activates
  -> making + durable order.prep_started
  -> OrderLifecycleOutboxProcessor (eager wake for AUTO; 500 ms recovery)
  -> FulfillmentProcessor(origin=durable)
  -> AUTO PrintJob
```

`OrderPreparationService.acceptWebOrderByStableId()` locks the Order by `orderStableId + storeStableId`, accepts only `channel=web + status=paid`, appends `order.accepted:<orderStableId>` with `skipDuplicates`, and returns the locked fulfillment timing. After that acceptance transaction commits, IMMEDIATE Web acceptance synchronously invokes the same store-scoped `OrderPreparationService` materializer used by durable replay; its own transaction verifies the accepted fact and writes `making + order.prep_started`. The existing accepted-event outbox scan remains the crash/restart recovery path if the process stops after acceptance commit but before eager preparation. Once prep_started exists, `requestDrain()` eagerly runs the durable AUTO materializer while the 500 ms poll remains print recovery. For SCHEDULED Web orders no eager preparation/print drain runs; `ScheduledOrderProcessor` continues to own the `prepStartAt` time gate before writing `making + prep_started`.

`PosOrderOperationsService` exposes only the narrow `acceptWebOrder()` capability to the POS transport. `PosOrdersService.advance()` routes Web `paid` through it instead of `OrdersService.advanceForStore()`. The retained generic `/pos/orders/:id/status` transport is also guarded: a Web `paid -> making` request is redirected to the same durable acceptance path, and an in-store `paid -> making` request remains redirected to Slice 1B durable preparation. Later state changes continue to use the existing status/advance behavior.

Fulfillment now refuses memory-origin AUTO printing for both `web` and `in_store`; only durable prep may create their initial AUTO job. The private `OrderEventsBus` prep channel is intentionally not deleted yet because provider/legacy same-process transitions are outside Slice 1C, and `order.paid.verified` remains required by the later Uber Direct durability slice. This slice therefore contracts Web/local use of the memory fast path without prematurely changing Uber/provider behavior.

Focused regression coverage locks durable Web acceptance without direct status mutation, scheduled Web acceptance without early preparation, Web `/advance` and `/status -> making` routing through durable acceptance, reuse of the same idempotent preparation materializer with accepted-event recovery for IMMEDIATE orders, durable Web AUTO printing, and memory-origin Web print suppression. Existing Orders characterization continues to prove that Web Order creation/payment completion itself does **not** append `order.accepted`.

No Prisma schema/migration, dependency manifest, external route, Web Clover provider wire behavior, Uber runtime behavior, context graph/SCC allowance, PrintJob kind, printer protocol, refund logic, pricing/promotion calculation or Benefits COMMIT transaction changes in Slice 1C.

Slice 1C's Web acceptance, scheduled-order, initial AUTO-print and guarded Web Clover behaviors are recorded as Phase-level verification scope; no standalone Slice 1C production checklist is required. The consolidated Phase 5 closeout plan will derive the exact scenarios and evidence from the final merged code after all planned slices are complete.

### Slice 1D — POS Clover Terminal durable lifecycle convergence

Status: **MERGED / CI GREEN** — PR #2197, final head `04a4a5ed`, squash merge `9a338704`; PR CI #5207 and merged-dev CI #5208 passed.

Migration classification: **Class B internal boundary contraction inside a pre-production Terminal flow**, with one durable lifecycle fact added to the existing confirmed-payment transaction. No database schema or migration is required. The `payments.pos-card-legacy.v1` feature-flag compatibility remains active and is not contracted in this Slice; real-device/provider acceptance and eventual traffic cutover keep their independent compatibility/settlement gates.

The confirmed-payment transaction remains intentionally atomic:

```text
Benefits points/balance COMMIT
  + Coupon COMMIT
  + paid Order.create
  + durable order.accepted
              # one existing Prisma transaction
```

`createFromConfirmedPaymentSnapshot()` appends `order.accepted:<orderStableId>` only when it creates the new paid in-store Order. Its existing-order/read-recovery branch deliberately does **not** synthesize accepted. This protects historical Terminal prototype Orders that may already have printed through the retired `PAYMENT_CHECKOUT:<attemptId>` path: recovering such an old Order after Slice 1D cannot manufacture a new AUTO first print. For a new Slice-1D Order, accepted is atomic with creation, so any retry after a crash can safely resume preparation.

After successful creation and `markCompleted()`, and also when a checkout is already COMPLETED/order-bound, `PosCardPaymentOrchestrationService` calls the existing Orders public capability `POS_ORDER_OPERATIONS.activateImmediatePreparation(orderStableId, storeStableId)`. That capability validates the accepted durable fact, idempotently writes `making + order.prep_started`, and wakes `OrderLifecycleOutboxProcessor` so durable Fulfillment materializes the unique `AUTO` first print. The 500 ms lifecycle scan remains crash/restart recovery rather than a second business path.

The Terminal orchestrator no longer imports `PrintPosPayloadService`, calls `PosGateway.sendPrintJob()`, or owns `PAYMENT_CHECKOUT:<attemptId>` print identity. `PosGateway` remains injected solely for existing best-effort card-payment status publication. This contracts two Payments/Clover -> Commerce deep imports by moving DTO/print interaction to the existing Orders public surface; the scanner allowance tightens `payments-clover -> commerce-orders-fulfillment` **10 -> 8**, and Payments/Clover outgoing direct debt **59 -> 57**. The public SCC baseline remains empty.

Focused automated coverage records the Phase-level verification scope by locking: accepted-fact creation in the same transaction as Benefits/Coupon/Order; no synthetic accepted for an already-existing historical Order; successful external-card and zero-external internal-tender finalization entering durable preparation; DECLINED/UNKNOWN states not entering preparation; COMPLETED/repeated finalization replaying only the idempotent durable command; and an architecture guard forbidding Terminal orchestration from regaining `PrintPosPayloadService`, `sendPrintJob` or `PAYMENT_CHECKOUT:` first-print ownership.

No production Web Clover Ecommerce behavior, provider execution/status mapping, canonical amount/surcharge facts, UNKNOWN/reconciliation, refund, pricing/promotion, Benefits reservation/COMMIT semantics, external route, dependency manifest or Prisma schema changes in Slice 1D. Its affected Terminal lifecycle/recovery/printing behaviors are retained as input to the consolidated Phase 5 closeout verification rather than a Slice-specific deployment checklist.

### Slice 1E — Uber durable preparation / first-print convergence

Status: **MERGED / CI GREEN** — PR #2198, final head `ef6fa962`, squash merge `39bfc09a`; PR CI #5210 and merged dev CI #5211 passed.

Migration classification: **Class C critical lifecycle contraction with no Uber wire/provider contract change**. Uber `ACCEPT` continues to be owned by the existing durable action worker: successful provider acceptance atomically fences the action lease, moves the local imported Order only to `paid`, and appends idempotent `orders.lifecycle/order.accepted`. Slice 1E changes neither the Uber API request/response contract nor webhook signature/idempotency/provider truth.

The readiness audit found one remaining local bypass after a successful Uber ACCEPT: during the short `paid + order.accepted` window before the durable consumer starts preparation, a staff `/pos/orders/:id/advance` or direct `/status -> making` request could fall through to generic Orders status mutation. That path entered `making` without writing durable `order.prep_started` and relied on the obsolete same-process `OrderEventsBus` prep event for first-print materialization.

Slice 1E routes both store-facing Uber `paid -> making` entry points through the existing accepted-fact-gated Orders preparation capability. IMMEDIATE orders use `activateImmediatePreparation()`; SCHEDULED orders use `activateScheduledPreparation()` so explicit staff early-start retains its existing meaning while writing `scheduleActivatedAt + making + durable order.prep_started` atomically. Both commands are store-scoped and idempotent; neither synthesizes acceptance, so an Uber order whose external ACCEPT has not succeeded cannot be started through these paths.

After those bypasses are closed, repository-wide production-call search proves the private same-process prep channel has no remaining legitimate first-print producer/consumer. Slice 1E therefore deletes `emitOrderAccepted` / `emitOrderPrepStarted` and their listeners from `OrderEventsBus`, removes the Fulfillment memory-origin branch, and makes `FulfillmentProcessor.handleAcceptedLifecycle()` reachable only from the durable lifecycle consumer. `OrderEventsBus` itself remains because `order.paid.verified` still drives the separately deferred Uber Direct delivery fast path; that provider durability/idempotency gap is not changed here.

Canonical first-print semantics after 1E are therefore uniform across Web, ordinary POS, POS Clover Terminal and Uber Eats:

```text
channel/provider-specific acceptance eligibility
  -> durable order.accepted
  -> accepted-fact-gated OrderPreparationService
  -> making + durable order.prep_started
  -> OrderLifecycleOutboxProcessor
  -> AUTO PrintJob materialization
```

Explicit operator `REPRINT:*` and `AMENDMENT:*` jobs remain separate by design. The 500 ms Orders lifecycle poll is retained: Uber ACCEPT is completed in the dedicated worker process and cannot safely use an in-process API wake signal, so the poll remains the normal API-side bridge/recovery mechanism for Uber immediate acceptance. Slice 1E does not slow or replace it.

Focused regression/architecture coverage locks IMMEDIATE and SCHEDULED Uber paid advancement through durable preparation, direct status-to-making routing through the same boundary, the absence of the memory prep bus, continued presence of `order.paid.verified`, and Uber action completion remaining POS/Fulfillment agnostic. No new cross-context import is introduced, no allowance changes, and the public SCC baseline remains empty; measured direct-debt totals remain Payments/Clover **57**, External Channels **42**, Commerce/Orders/Fulfillment **30**, and Store Operations/POS/Print **31**.

The affected Uber ACCEPT -> paid -> preparation -> AUTO, scheduled early-start, POS manual advance, and crash/replay behavior is recorded for the consolidated Phase 5 closeout verification. Uber provider certification, wire-contract changes, destructive migrations, traffic cutovers, and observed regressions still retain their independent earlier hard gates.

### Slice 2 — Print ownership / dispatch idempotency + amendment print recovery

Status: **MERGED / PR CI GREEN** — PR #2199, final head `fb8110b3`, squash merge `515be0a6`; PR CI #5215 passed. Runtime verification remains accumulated into the Phase 5 closeout gate.

Migration classification: **Class C Print lifecycle/ownership hardening with no Prisma migration and no printer wire-contract cutover**. Orders/Fulfillment now hand Print only a business purpose (`INITIAL | REPRINT | AMENDMENT`), stable Order identity and immutable payload. The POS/Print owner alone derives persistent job identity and target routing: `INITIAL -> AUTO`, explicit reprints get fresh `REPRINT:<uuid>`, and amendment kitchen jobs get fresh `AMENDMENT:<uuid>`. Orders no longer supplies Print persistence `kind` values.

The initial-print durable consumer no longer probes `PosPrintJob` to decide whether `order.prep_started` has been handed off. After Print accepts the idempotent INITIAL handoff, Orders appends its own durable `orders.lifecycle/order.initial_print_handoff` checkpoint. A crash after Print created the unique `(orderStableId, AUTO)` job but before the Orders checkpoint is safe: lifecycle replay hands INITIAL over again and Print resolves the same unique AUTO job, without a Commerce -> Print persistence read.

Target delivery in `PosGateway` is now database-claimed under `PosPrintJob ... FOR UPDATE`: only `PENDING/FAILED` can transition to `DELIVERED`, attempts are incremented before the transaction commits, and socket emission occurs only after that claim commits. Concurrent API callers therefore cannot emit the same `jobId + target` from the same durable state. ACK and timeout mutation use the same row-lock discipline; `COMPLETED` is terminal, late failure ACKs cannot regress it, and stale `DELIVERED` rows are recovered to `FAILED/ACK_TIMEOUT` on printer reconnect so a process restart cannot strand an in-memory-only timeout. Existing offline/max-attempt semantics remain.

Because API-side claiming cannot by itself prevent a duplicate physical print after an ACK-loss/reconnect replay, the Windows printer agent keeps the unchanged `PRINT_JOB {jobId,target,payload}` / `PRINT_JOB_ACK` envelope but adds local `jobId:target` idempotency. Duplicate in-flight envelopes join one promise; successfully completed physical deliveries are persisted in `~/.sanq-printer-completed-jobs.json` (bounded to 5000 by default) using temp-file + rename replacement, and a repeated completed envelope returns success ACK without printing again. This is an expand-compatible agent hardening: old agents still understand the same wire envelope, while upgraded agents add physical-delivery replay suppression.

Slice 2 also closes the existing POS amendment print defect. Item changes now synchronously hand off a kitchen amendment ticket after the Order mutation, showing `[VOID]/[取消]` and `[ADD]/[新增]`; combo/component content is taken from the immutable Order snapshots before/after the mutation. Labels are re-evaluated as `afterLabelPlan - beforeLabelPlan`, so only positive newly-required labels print: VOID does not reprint removed labels, while ADD/SWAP can print newly-required combo/packaging labels. Any amount change **or payment-method change** independently creates a customer-only REPRINT containing the latest complete receipt. Payment-method-only RETENDER is now valid when the method actually changes; no-op RETENDER remains rejected. Print failure never rolls back an already-committed amendment.

To prevent amendment ADD/SWAP from persisting an incomplete item structure, Orders now has one internal `OrderItemSnapshotBuilder`. It owns canonical menu/option/fixed-component/option-component resolution and produces the complementary immutable `optionsJson + componentsJson` snapshots for both normal order creation and amendment ADD. `calculateLineItems()` consumes that snapshot for Daily Special/pricing/promotion work; `createAmendment()` consumes the same snapshot builder but keeps the amendment-determined `unitPriceCents` and does **not** call `calculateLineItems()`. The builder is not exported on the Orders public API, so this removes duplicate snapshot construction without creating another cross-context contract.

Focused automated/architecture coverage records the Phase-level verification scope for: concurrent INITIAL handoff, claim-before-socket ordering, ACK/timeout terminality, stale DELIVERED recovery, printer-agent completed/in-flight dedupe, Orders-owned initial-print handoff checkpoint, Print-owned AUTO/REPRINT/AMENDMENT identities, payment-method-only RETENDER, kitchen amendment output including combo components, positive label-plan delta, and customer full-receipt reprint after amount/payment changes. No schema/migration, package/lockfile, Web Clover, Uber provider wire, pricing/promotion policy, or Benefits transaction semantics change in Slice 2. The existing context-edge counts/public SCC baseline are expected to remain unchanged.

### Pre-Slice 3 hardening — active Uber Direct dispatch-failure alert

Status: **MERGED / PR CI GREEN** — PR #2200, final head `0feb44fa`, squash merge `f9e0014b`; PR CI #5220 passed.

The Slice 3 readiness audit found that the old `OrdersService.notifyDeliveryDispatchFailureAlert()` helper had no caller and sat beside a separate uncalled priority-dispatch tail, while the real paid-order Uber Direct path in `FulfillmentProcessor.onPaid` only logged `UberDirectService.createDelivery()` failures. This batch wires the alert to that active failure path and removes the obsolete uncalled helper instead of adapting or reviving it.

Ownership is explicit: Commerce decides that Uber Direct delivery creation failed and supplies only stable Order facts; Identity exposes active Admin notification recipients through `OPERATIONS_ALERT_RECIPIENTS` using `userStableId` rather than User DB UUID; Messaging exposes `DELIVERY_DISPATCH_FAILURE_NOTIFICATION`, renders bilingual templates and owns channel fallback. Each Admin is attempted by email first; SMS is used only when email is absent or its send fails. The alert itself is best-effort and cannot roll back or rewrite the already-paid Order. A provider-success/local-`externalDeliveryId` persistence failure is deliberately **not** labeled as a new Uber Direct order failure, because manual redispatch could create a duplicate provider delivery; that state remains separately logged for the later Uber Direct durability/reconciliation slice.

The implementation adds no Prisma migration, dependency, external route or Uber Direct provider wire change. `OrdersModule` consumes `NotificationModule` through the Messaging public surface, contracting `commerce-orders-fulfillment -> messaging-notifications` direct debt **4 -> 3** and Commerce total outgoing direct debt **30 -> 29**; the monotonic baseline is tightened accordingly and the public SCC baseline remains empty. Focused source tests cover active provider-failure -> alert routing, stable Admin recipient mapping, email-success/no-SMS, and email-failure -> SMS fallback. Per repository workflow no local lint/build/test is claimed before user review.

### Slice 3 — Orders -> Messaging public boundary contraction

Status: **MERGED / PR CI GREEN** — PR #2201, final head `90cddfd0`, merge `62790355`; PR CI #5225 passed.

Slice 3 removes the remaining concrete Messaging implementations from Orders. `ORDER_READY_NOTIFICATION` preserves the existing business split: Commerce still decides whether a ready notification applies, selects trusted checkout/member/external contact according to the existing policy, resolves locale/order number and logs the outcome; Messaging still owns template rendering, email-first delivery and SMS fallback. The cross-context recipient identity changes from the internal User DB UUID to `userStableId`; an existing member lookup also supplies the stable ID as a historical-order fallback without adding another query.

Invoice delivery is contracted through `ORDER_INVOICE_DELIVERY`. Orders continues to validate the requested email and build the immutable receipt snapshot from `PrintPosPayloadService`; only a neutral receipt snapshot crosses into Messaging. The new `OrderInvoicePayload` deliberately contains no Prisma type, POS DTO, `@shared/order` import or Orders implementation type. `EmailService` consumes that Messaging-owned payload directly, which also removes the previous reverse `messaging-notifications -> store-operations-pos-print` dependency created by `PrintPosPayloadDto`.

`OrdersService` therefore no longer imports concrete `NotificationService` or `EmailService`, and `OrdersModule` no longer imports `EmailModule`; both capabilities are injected from the existing Notifications public composition surface. The architecture scanner locks the two contracts as provider/persistence/DB-ID/Commerce/POS-free and prevents Orders from regaining concrete Messaging imports or Email invoice rendering from regaining the POS DTO.

The monotonic direct-import baseline contracts `commerce-orders-fulfillment -> messaging-notifications` **3 -> 0**, reducing Commerce outgoing direct debt **29 -> 26**. The same neutral invoice-contract cleanup contracts `messaging-notifications -> store-operations-pos-print` **1 -> 0**, reducing Messaging outgoing direct debt **10 -> 9**. Both zero edges are removed from `legacyDirectImportLimits`; no public return edge is introduced and the public SCC baseline remains empty.

Behavior intentionally unchanged: order-ready eligibility/trusted-contact precedence/locale selection, email-first + SMS fallback, invoice HTTP routes and email normalization, receipt contents/rendering/template type/provider dispatch, payment/pricing/refund/lifecycle behavior and Uber provider wire contracts. No Prisma schema/migration, dependency/lockfile, external route, compatibility or provider cutover is part of Slice 3. Focused source tests cover stable-ID order-ready delivery, historical member stable-ID fallback, invoice boundary mapping and Messaging invoice delegation. PR #2201 final head `90cddfd0` passed CI #5225 before merge `62790355`; Phase-level runtime verification remains deferred to the consolidated Phase 5 closeout gate.

### Slice 4A — low-risk direct-edge + dead-code contraction

Status: **REMOTE / CI RERUN PENDING** on PR #2202 from `refactor/phase5-slice4a-direct-edge-dead-code`, based on `origin/dev@62790355`; initial CI #5227 passed the Architecture gate and failed API lint only on two Prettier formatting errors, now corrected in the current PR head with rerun pending.

Migration classification: **Class A atomic internal contraction**. No Prisma schema/migration, dependency/lockfile, public HTTP route, Web Clover behavior, Uber provider protocol, payment/refund semantics, order lifecycle, pricing/promotion policy or Benefits COMMIT transaction changes are part of 4A.

Orders transport authentication now consumes both `SessionAuthGuard` and `OptionalSessionAuthGuard` through `auth/public-api.ts`; the Auth owner publicly exports the optional guard rather than allowing Orders to deep-import either guard implementation. Orders geocoding now uses the Brand/Store-owned `LOCATION_GEOCODER` capability from `location/public-api.ts`. `LocationModule` exposes only the token-backed `LocationGeocoderPort` across the context boundary while `LocationService` remains the internal HTTP implementation. The existing geocoding behavior, Google Maps provider call, empty/zero-result handling and error semantics are unchanged.

The same slice removes verified uncalled `OrdersService` tails instead of adapting them into new boundaries: `ensureLoyaltyAccountWithTx()`, `normalizeDropoff()`, `buildUberPickupOverride()` and `dispatchPriorityDelivery()` are deleted, and `OrdersService` no longer injects `UberDirectService`. The active Uber Direct dispatch path remains `FulfillmentProcessor -> UberDirectService`; provider request/response handling, dispatch-failure alerting and the separately deferred provider-success/local-persistence durability gap are intentionally unchanged.

The monotonic direct-import baseline therefore targets `commerce-orders-fulfillment -> brand-store` **2 -> 0** and `commerce-orders-fulfillment -> identity-customer-benefits` **4 -> 2**, reducing Commerce outgoing direct debt **26 -> 22**. The remaining direct Identity debt is the transaction-/runtime-sensitive Loyalty/Membership implementation coupling scheduled for later Slice 4 stages. The public dependency directions already exist and the public SCC baseline remains empty. Architecture guards lock Orders transport to the Auth public surface, Orders geocoding to the Location public capability, and prevent the retired OrdersService direct-delivery/loyalty tails from returning.

Focused source coverage is updated to inject the Location port rather than its concrete service and to remove assertions/mocks for the retired uncalled Uber Direct branch. Per repository workflow no local lint/build/test is claimed before user review; Phase-level runtime verification remains deferred to the consolidated Phase 5 closeout gate.

Planned follow-on after Slice 4A is: **Slice 4B Catalog persistence contraction -> Slice 4C Customer runtime read contraction -> Slice 4D Benefits read contraction while preserving the existing transaction seam -> remaining provider contraction -> Orders use-case decomposition -> Phase 5 closeout readiness audit -> consolidated Phase 5 deployment/active verification -> closeout**.
