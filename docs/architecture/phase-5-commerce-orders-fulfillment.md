# Phase 5 — Commerce / Orders / Fulfillment Boundary Contraction

Start date: 2026-09-05  
Current implementation base: `origin/dev@61f5917d` (Slice 1C merge)  
Current status: **SLICE 1D SOURCE COMPLETE / LOCAL REVIEW PENDING — POS CLOVER TERMINAL FINALIZATION NOW CONVERGES ON DURABLE ACCEPTED/PREP_STARTED/AUTO; PHASE 5 ACTIVE VERIFICATION IS DEFERRED TO THE CONSOLIDATED CLOSEOUT GATE**

## Goal

Phase 5 turns Commerce / Orders / Fulfillment into an enforceable L3 boundary before Payments/Clover and POS Terminal contraction. Orders continues to own quote/order snapshots, the Order aggregate and lifecycle, amendments/refund requests, and fulfillment intent. It must progressively stop reading another context's persistence directly or importing another context's concrete service/provider implementation.

This phase is not a rewrite and does not begin by mechanically splitting `orders.service.ts`. Each later slice must first establish the smallest owner/public capability required by the behavior being moved, preserve transaction/idempotency semantics, and then delete the old direct dependency in the same reviewed slice when the migration class permits it.

## Phase 5 verification cadence

Per the repository-wide modularization rule adopted on 2026-09-06, Phase 5 does **not** require a separate production deployment/active-test checklist after every slice. Each slice must remain independently deployable, focused-test/architecture guarded and CI-green, and it must record any runtime/payment/provider/printing/PWA/reconciliation behavior that the final Phase verification must cover. After all planned Phase 5 source slices are merged and immediately before Phase 5 closeout, perform one readiness audit against the final merged state, produce the consolidated Phase 5 deployment + active-verification plan, execute it deliberately, fix any regression found, and only then mark Phase 5 `PRODUCTION VERIFIED / CLOSED`. Explicit compatibility exits, destructive migrations, provider certification, settlement gates or irreversible cutovers may still require an earlier dedicated verification event.

Historical Slice-level active verification evidence from earlier phases remains valid and is not rewritten by this cadence change.

## Entry state

Phase 4 is **PRODUCTION VERIFIED / CLOSED**. The final public SCC baseline is empty. The current direct-import baseline remains:

- payments-clover: **57** *(Slice 1D contracts Payments -> Commerce direct debt by 2)*
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

Status: **SOURCE COMPLETE / LOCAL REVIEW PENDING** on `refactor/phase5-slice1d-terminal-durable-lifecycle`.

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

Planned follow-on order after Slice 1D review/CI is: **1E Uber lifecycle convergence review -> Print ownership/idempotency -> Messaging contraction -> remaining Catalog/Customer/Benefits/provider contractions -> Orders use-case decomposition -> Phase 5 closeout readiness audit -> consolidated Phase 5 deployment/active verification -> closeout**.
