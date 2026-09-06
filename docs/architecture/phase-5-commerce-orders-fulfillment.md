# Phase 5 — Commerce / Orders / Fulfillment Boundary Contraction

Start date: 2026-09-05  
Current implementation base: `origin/dev@07311f74` (Slice 0 merge)  
Current status: **SLICE 1A SOURCE COMPLETE / LOCAL REVIEW PENDING — POS CASH SNAPSHOT READINESS; NO LIFECYCLE/PRINT-TRIGGER CUTOVER YET**

## Goal

Phase 5 turns Commerce / Orders / Fulfillment into an enforceable L3 boundary before Payments/Clover and POS Terminal contraction. Orders continues to own quote/order snapshots, the Order aggregate and lifecycle, amendments/refund requests, and fulfillment intent. It must progressively stop reading another context's persistence directly or importing another context's concrete service/provider implementation.

This phase is not a rewrite and does not begin by mechanically splitting `orders.service.ts`. Each later slice must first establish the smallest owner/public capability required by the behavior being moved, preserve transaction/idempotency semantics, and then delete the old direct dependency in the same reviewed slice when the migration class permits it.

## Entry state

Phase 4 is **PRODUCTION VERIFIED / CLOSED**. The final public SCC baseline is empty. The current direct-import baseline remains:

- payments-clover: **59**
- external-channels: **42**
- identity-customer-benefits: **33**
- store-operations-pos-print: **31**
- commerce-orders-fulfillment: **30**
- accounting-reporting-analytics: **25**
- catalog-pricing-offers: **15**
- messaging-notifications: **10**
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
| Status | `updateStatus*()` / `updateStatusByInternalId()` | Existing illegal/missing/ready notification tests plus **new characterization** locking the successful guarded `paid -> making` write and the same-process `prep_started` fast-path emission. |
| Full refund | `createFullRefund()` | Existing dedicated `orders.full-refund.spec.ts` locks Uber/manual pending behavior, internally-finalizable in-store/zero-external Web refunds, Loyalty rollback order, full-amount/method validation and concurrency/idempotency guard. |
| Amendment | `createAmendment()` | **New characterization** locks validation before transaction and a VOID_ITEM transaction that creates amendment facts, mutates the OrderItem snapshot and recalculates persisted Order totals without moving ownership. |
| Durable lifecycle/outbox | `OrderPreparationService` + `OrderLifecycleOutboxProcessor` | Existing tests lock accepted-fact gating, row locks/SKIP LOCKED, idempotent `prep_started`, replay after failure, and `NOT EXISTS PosPrintJob(kind=AUTO)` materialization gating. |
| Print | `FulfillmentProcessor` -> `POS_PRINT_JOB_DISPATCH_REQUESTED` -> `PosGateway` | Existing tests lock store routing, AUTO targets, offline retry/ACK behavior and stable `(orderStableId, kind)` upsert. Slice 0 strengthens the repeated AUTO characterization so two sequential calls emit only the original requested targets once. |
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
| `processors/order-lifecycle-outbox.processor.ts` | `$transaction` + raw SQL across `OpsEvent`, `Order`, `PosPrintJob` | Durable Orders lifecycle reads its own event/order facts but also probes Print-owned AUTO materialization as its acknowledgement condition. |

Unique non-Orders persistence surfaces reached from the Orders tree are therefore:

- Catalog: `MenuItem`;
- Identity / Customer: `User`, `UserAddress`;
- Benefits: `LoyaltyAccount`;
- Payments / Web checkout: `CheckoutIntent`;
- External/provider persistence: `UberOrderItemModifier`;
- Store Operations / Print read coupling: `PosPrintJob` existence in the durable lifecycle query.

## Concrete service/module imports from the Orders tree

The narrow public ports already in use are not listed as concrete-service debt here. The following concrete implementations remain directly imported by production Orders/Fulfillment code. `UberDirectService` currently lives under `deliveries/**`, which the scanner maps into the same Commerce context, so it does not consume a numeric cross-context allowance; it is still provider-specific implementation leakage relative to the target ownership model.

`PrismaService` remains the broadest concrete infrastructure dependency: it is consumed directly by `orders.service.ts`, `order-ingestion.service.ts`, `order-scheduling-query.service.ts`, `order-label-plan.service.ts`, `print-pos-payload.service.ts`, `order-preparation.service.ts`, `pos-order-read.service.ts`, `processors/fulfillment.processor.ts`, and `processors/order-lifecycle-outbox.processor.ts`; `admin-member-orders-read.service.ts` consumes the same service through the local `orders-prisma.ts` re-export. This is why Commerce -> Runtime remains **10** even though some individual persistence accesses are valid Orders-owned data.

| Consumer | Concrete dependency | Current purpose / classification |
|---|---|---|
| `OrdersService` | `LoyaltyService` | stable customer -> DB identity resolution, available tender, reservation/mutation/refund/amendment behavior not yet fully behind Benefits public capabilities |
| `OrdersService` | `MembershipService` | coupon validation/reserve/commit/mark-used behavior |
| `OrdersService` | `UberDirectService` | **Static but apparently inactive legacy tail:** injected only for private `dispatchPriorityDelivery()`. Repository search finds no call site for that private helper; active paid-order Uber Direct dispatch is in `FulfillmentProcessor`. Keep as a review/deletion candidate, not as proof of a second active provider path. |
| `OrdersService` | `LocationService` | address geocoding for delivery quoting/create |
| `OrdersService` | `NotificationService` | order-ready and delivery-dispatch-failure delivery |
| `OrdersService` | `EmailService` | invoice email delivery |
| `FulfillmentProcessor` | `UberDirectService` | paid-order Uber Direct dispatch |

Composition also directly imports `DeliveriesModule`, `LocationModule`, `NotificationModule`, and `EmailModule`. `LoyaltyModule`, `BrandStoreConfigModule`, `MembershipModule`, and `PromotionsModule` are imported through their registered public surfaces, but the broad `OrdersService` still consumes concrete Loyalty/Membership services in addition to narrower ports.

For completeness, same-context concrete wiring found by the source audit is not classified as cross-owner debt by itself: `OrdersController -> OrdersService`; `PosOrderOperationsService -> OrdersService + OrderSchedulingQueryService`; `PosOrderReadService -> OrdersService`; `OrderLifecycleOutboxProcessor -> FulfillmentProcessor + OrderPreparationService`; `ScheduledOrderProcessor -> OrderPreparationService`; and `FulfillmentProcessor -> PrintPosPayloadService + OrderLabelPlanService`. These relationships still matter when `OrdersService` is later split, but Slice 0 does not manufacture interfaces around them merely to reduce concrete class references.

There are also two direct POS type couplings from Orders implementation code (`PrintPosPayloadDto` in `print-pos-payload.service.ts` and `fulfillment.processor.ts`) even though Print is a Store Operations owner. These are recorded for the later Fulfillment/Print slice rather than changed in Slice 0.

## EventEmitter / lifecycle consumer inventory

There are two separate in-process event mechanisms plus the durable Orders lifecycle facts.

### Private Node `EventEmitter` — `OrderEventsBus`

| Event/channel | Emitter | Consumer | Current side effect |
|---|---|---|---|
| `order.paid.verified` | `OrdersService.handleOrderPaidSideEffects()` | `FulfillmentProcessor.onPaid` | For eligible delivery orders, call Uber Direct and persist `Order.externalDeliveryId`. |
| `order.prep_started` | `OrdersService.updateStatusByInternalId()` via compatibility-named `emitOrderAccepted()` | `FulfillmentProcessor.onAccepted` | Build receipt/label payload and request the AUTO PrintJob path. |

`emitOrderAccepted()` and `onOrderAccepted()` are compatibility names only; both use the actual same-process `order.prep_started` channel. `emitOrderPrepStarted()` / `onOrderPrepStarted()` also exist on the private bus, but repository search found no separate production consumer currently using that pair. `NotificationProcessor` is also wired in `OrdersModule` but registers no event consumer; it only logs that automatic invoice email is disabled, so it is another later atomic deletion candidate after confirming no composition/bootstrap dependency. The audit also found the older private `OrdersService.dispatchPriorityDelivery()` / `buildUberPickupOverride()` / `notifyDeliveryDispatchFailureAlert()` tail has no source call site; it is not a second active Uber Direct producer and should be reviewed as dead-code debt in a later atomic cleanup. `OrdersService.ensureLoyaltyAccountWithTx()` likewise has only its definition and no source call site; its presence must not be mistaken for an active second Loyalty-account creation path.

### Nest `EventEmitter2`

| Event | Emitter | Consumer | Delivery semantics |
|---|---|---|---|
| `order.reprint` | POS Orders controller | `FulfillmentProcessor.handleOrderReprint()` | Explicit operator reprint; creates a new `REPRINT:<timestamp>` kind. |
| `order.amendment.print` | POS Orders controller | `FulfillmentProcessor.handleOrderAmendmentPrint()` | Best-effort kitchen amendment copy; creates `AMENDMENT:<timestamp>` kind. |
| `orders.pos-print-job.dispatch-requested` | `FulfillmentProcessor.dispatchPrintJob()` using `emitAsync()` | `PosPrintDispatchListener` -> `PosGateway.sendPrintJob()` | Exactly one listener is required by the caller; zero or multiple handler results are treated as an error. |

### Durable lifecycle facts

`UberOrderActionPrismaAdapter` appends `orders.lifecycle / order.accepted` with an idempotency key after external acceptance. `OrderLifecycleOutboxProcessor` claims accepted immediate Orders and calls `OrderPreparationService`, while the scheduled processor activates due scheduled Orders. `OrderPreparationService` changes the Order to `making` and appends `orders.lifecycle / order.prep_started` in the same transaction. The outbox processor then materializes that durable fact through `FulfillmentProcessor.handleAcceptedLifecycle()`.

## In-memory + durable duplicate-side-effect audit

### Finding 1 — no current source path deliberately emits both prep paths for the same successful state transition

The same-process path and durable path both ultimately call `FulfillmentProcessor.handleAcceptedLifecycle()`, but current source does not fan one transition into both mechanisms:

- manual/POS-style `paid -> making` through `updateStatusByInternalId()` performs a guarded `updateMany` and emits the private same-process `order.prep_started` only when that write wins;
- durable external acceptance goes through `order.accepted` -> `OrderPreparationService`; that service locks the Order and, when it actually activates it, writes status=`making` plus durable `order.prep_started` in one transaction without emitting `OrderEventsBus`;
- if the Order is already `making/ready/completed`, `OrderPreparationService` returns `already_active` and does not append another `prep_started` fact;
- the durable print claim requires `NOT EXISTS` an AUTO `PosPrintJob` for the Order.

Result: **no proven active double-print path was found from the coexistence of the private fast path and durable outbox itself.**

### Finding 2 — PrintJob persistence is idempotent, but the final socket emit is not a database-claimed critical section

`PosGateway.sendPrintJob()` upserts on `(orderStableId, kind)`. Repeated sequential AUTO calls in one process reuse the same job and the in-memory per-target timer/COMPLETED checks suppress another immediate send; Slice 0 strengthens that behavior with an exact emit-count assertion.

There is nevertheless a latent concurrency window: two truly concurrent callers for the same AUTO job can both obtain the same upserted row and enter `dispatchTarget()` before either has installed the in-memory timer or persisted the delivered attempt. Both could then emit the same `PRINT_JOB` socket message. The readiness audit found **no current legitimate source path expected to create those two concurrent AUTO callers for the same Order**, so this is recorded as a future Print delivery hardening item rather than a Slice 0 production bug fix.

A later Print-owner slice should consider a database claim/lease or equivalent target-dispatch state transition before external emit if concurrent producers are ever introduced.

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

Status: **SOURCE COMPLETE / LOCAL REVIEW PENDING** on `refactor/phase5-slice1a-pos-cash-snapshot`.

Migration classification: **backward-compatible additive contract/snapshot change**. No Prisma schema/migration, provider protocol, Order lifecycle transition, PrintJob identity, architecture allowance or context dependency direction changes.

Current POS cash collection computes `cashReceivedCents` and `cashChangeCents` only in the browser and forwards them as transient parameters to the `/print` request. That prevents the future durable `prep_started -> AUTO` path from reconstructing the same customer receipt after a process restart or without the original browser request. Slice 1A therefore:

- adds optional `cashReceivedCents` to the shared CreateOrder contract; old PWA bundles remain valid because the field is additive/optional;
- accepts it only for authenticated `channel=in_store` + `paymentMethod=CASH` creation and rejects underpayment/non-cash misuse;
- preserves the existing POS cash rounding rule exactly: the remaining cash tender is rounded upward to the next 5 cents for collection/change calculation, while `Order.totalCents`, tax, discounts and accounting amounts remain the exact server-calculated cents;
- persists only `{ cashReceivedCents, cashChangeCents }` into the existing nullable `Order.paymentBreakdownJson` for these cash Orders. It deliberately does **not** add `externalCents` for in-store Orders, because that key currently participates in Web external-payment/refund reconstruction and changing in-store interpretation would exceed Slice 1A;
- makes `PrintPosPayloadService` recover the persisted cash receipt facts into the existing top-level print payload shape, so a later AUTO print or operator reprint can reproduce the receipt without browser-only state;
- keeps the current POS first `/print` + `advanceOrder()` behavior untouched in 1A. Existing transient `/print` cash parameters continue to work for old PWA bundles; Slice 1B owns the actual initial-print/lifecycle cutover.

Focused characterization locks server-derived change, including a non-five-cent exact Order total, rejects insufficient cash, and proves print-payload recovery from persisted Order facts.

Planned follow-on order is: **1B POS ordinary durable lifecycle cutover -> 1C Web/local durable lifecycle -> 1D POS Clover Terminal durable lifecycle -> 1E Uber convergence verification -> Print ownership/idempotency -> Messaging contraction -> remaining Catalog/Customer/Benefits/provider contractions -> Orders use-case decomposition -> Phase 5 closeout**.
