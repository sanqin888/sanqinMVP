# Phase 6 — Payments / POS Boundary Contraction and Closeout

Start date: 2026-09-07  
Current implementation base: `origin/dev@b1051c24`  
Current status: **SLICE 2B LOCAL / REVIEW PENDING**

## Goal

Phase 6 continues the approved Payments / POS modularization after Phase 5 Commerce / Orders / Fulfillment reached `PRODUCTION VERIFIED / CLOSED`. The phase contracts remaining Payments/POS deep imports toward owner public capabilities while preserving the guarded production Web Clover Ecommerce path, POS Terminal payment truth, refund/reconciliation semantics, and existing transaction boundaries.

This phase does not use directory ownership as permission to redesign payment behavior. Production Web Clover remains protected under `AGENTS.md`; POS Terminal prototype code may be structurally contracted where Web behavior and persisted payment facts remain unchanged.

## Entry state

Phase 5 closed with public SCC empty. The current monotonic direct-import baseline before Slice 1 records `payments-clover -> commerce-orders-fulfillment = 8` and Payments/Clover total outgoing direct debt = **57**.

The Orders public surface already exports `POS_ORDER_OPERATIONS`, `PosOrderDto`, and `PosOrderOperationsPort`. That port already includes both `getByStableIdForStore(orderStableId, storeStableId)` and `createFullRefund(input)`. No Orders module/public API/contract expansion is required for Slice 1.

## Readiness Audit / Execution Baseline

The standalone Phase 6 readiness audit is now normalized into this canonical Phase document so implementation status, dependency counts and architecture guardrails cannot drift across parallel files. Its original audit base was `origin/dev@593ce3fe`; this consolidated version is synchronized against `origin/dev@80ec51b0` after Slice 1 merged.

### Hard guardrails

- Web Clover Ecommerce remains a protected production path; early Phase 6 structural work must preserve its checkout, amount/currency/payment-ID validation, surcharge, reconciliation, order-finalization, refund and historical payment semantics.
- POS Clover Terminal remains a pre-production prototype and may be structurally modularized without waiting for real-device acceptance, provided production Web behavior and persisted payment facts are unchanged.
- Orders must not know Clover/provider infrastructure; Payments domain/application must not depend on Orders/POS concrete internals.
- Benefits affecting external due must continue `HOLD -> COMMIT / RELEASE`; immutable order/pricing/tender facts must exist before external payment and recovery must not re-price.
- Timeout/network uncertainty is not proof of payment failure; idempotency, UNKNOWN/reconciliation and no-double-charge semantics must survive modularization.
- Refund/void may mark an Order refunded only after provider success or reconciliation confirmation.
- Architecture debt must not be reduced by weakening payment atomicity, exporting `Prisma.TransactionClient`, or turning internal DB UUIDs into cross-context public identities.

### Prepared-payment identity finding

The readiness audit found the original `PreparedPaymentOrderSnapshot` carried internal `User.id`, `Coupon.id`, pre-generated `OrderItem.id`, and ambiguous `storeId` semantics across the Orders -> Payments persisted boundary. That shape was explicitly rejected for public export.

Slice 1B has now normalized the persisted preparation contract to V2: the only customer identity is `order.userStableId`, the Store identity is explicit `storeStableId`, Coupon/UserCoupon DB identities stay inside Benefits, and OrderItem UUIDs are generated only during finalization. PR #2233 final head `0a2a01d8` passed CI #5326 and squash-merged as `be21c8c5`. This satisfies the identity prerequisite for Slice 1C to expose the same V2 preparation contract through an Orders-owned public capability without changing the persisted payload.

### Confirmed-payment transaction finding

`createFromConfirmedPaymentSnapshot()` coordinates Points/Balance COMMIT, Coupon COMMIT, Order creation and the Terminal order's durable `order.accepted` lifecycle inside one Prisma transaction. This is a transaction-sensitive invariant, not ordinary import debt. Phase 6 must not split it merely to lower scanner counts, and must not expose a transaction client across contexts. A later slice may redesign it only with explicit atomicity/idempotency/recovery proof; otherwise a narrow scanner-protected seam may remain.

`ConfirmedPaymentOrderResult.internalOrderId` is also an internal DB identity and must be audited before any future public finalization contract is created.

### Execution sequence after Slice 1

1. **Payment Preparation Contract Normalization Readiness — COMPLETED in Slice 1B** — V2 now carries only stable/business identities across the persisted preparation boundary and keeps internal DB identities inside Orders/Benefits execution.
2. **Stable-ID-only Prepared-Payment Boundary — COMPLETED in Slice 1C** — the unchanged V2 preparation contract is now exposed through `PAYMENT_ORDER_PREPARATION`; PR #2234 final head `a042ea10` passed CI #5329 and squash-merged as `bf95051f`.
3. **POS realtime/device capability contraction — COMPLETED in Slice 2A** — the two Payment orchestration `PosGateway` dependencies now use the POS-owned `POS_PAYMENT_REALTIME` capability; PR #2235 final head `6169d4dd` passed CI #5332 and squash-merged as `b1051c24`.
4. **Auth/POS transport and composition contraction — ACTIVE in Slice 2B** — expose the existing POS device guard and Nest composition modules through the POS public surface, without adding facades or changing transport/runtime behavior.
5. **Confirmed-payment transaction seam decision** — independently decide whether the atomic COMMIT + Order creation seam can be safely moved; preserve it if no better design proves equivalent invariants.
6. **Payments orchestration composition cleanup** — contract meaningless concrete module coupling after Orders/POS/Auth boundaries stabilize.
7. **Clover provider/internal cleanup** — keep execution/canonical gateways, raw mappers, OAuth/merchant credentials and provider wire contracts inside Payments infrastructure. Retired SNS/SQS must not be reintroduced; AWS SMS/Email remain separate supported capabilities.
8. **Web Clover cutover readiness audit** — default read-only/high-risk audit of production checkout, immutable snapshot, tender allocation, surcharge, provider confirmation, reconciliation, refunds, recovery/idempotency and wallet/Hosted iFrame compatibility.
9. **Web Unified Payment Core migration / legacy cleanup** — only after readiness PASS, using additive implementation, controlled activation, rollback, active production verification, observation, then compatibility cleanup.

### Dependency priorities and exit criteria

Merged through Slice 2A, Payments/Clover direct debt is **51** with `commerce-orders-fulfillment = 4`, `identity-customer-benefits = 13`, `store-operations-pos-print = 9`, `architecture-foundation = 15`, `runtime-data-ci-ops = 8`, and `messaging-notifications = 2`. The local Slice 2B source/baseline contracts the POS pair **9 -> 4** and Payments/Clover total **51 -> 46**; CI is not yet claimed. These counts are contraction signals, not mechanical zero targets.

Phase 6 closeout requires public SCC to remain empty, no new bounded-context cycle, meaningful owner-leakage contraction, stable-ID-only prepared-payment boundary, an explicit safe decision for the confirmed-payment transaction seam, clear Clover infrastructure ownership, scanner/tests preventing regression, and a documented plan for the protected Web Clover legacy seam. If Web Unified Payment Core migration is executed, controlled cutover, production verification and legacy cleanup must complete before Phase 6 can be marked `PRODUCTION VERIFIED / CLOSED`.

## Slice 1 — POS refund + reverse-sync Orders public-boundary contraction

Status: **MERGED / CI GREEN** — PR #2231; final head `f3550efd`; squash merge `1ad42319`; PR CI #5318 passed.

Migration classification: **Class A atomic internal boundary contraction**. No persisted/public contract, route, provider wire protocol, schema/migration, dependency manifest, or payment-state meaning changes.

### Source change

- `pos-card-refund-orchestration.service.ts` no longer imports Orders-internal `OrderDto` or `OrdersService`. It injects `POS_ORDER_OPERATIONS` through `PosOrderOperationsPort` and uses `PosOrderDto`; its existing store-scoped lookup and `createFullRefund()` behavior are unchanged.
- `payment-reverse-sync-orchestration.service.ts` no longer imports `OrdersService`. It injects the same public port. All Order reads now use `getByStableIdForStore(orderStableId, checkout.storeId)`; full refund still uses the existing public `createFullRefund()` capability.
- Both focused specs use the public `PosOrderDto` / `PosOrderOperationsPort` fixture types without changing the tested refund/reverse-sync behavior.
- `payments-architecture.spec.ts` permanently guards both orchestration files against returning to `../orders/orders.service` or `../orders/dto/*`, and requires `../orders/public-api` plus `POS_ORDER_OPERATIONS`.
- The monotonic architecture allowance contracts `payments-clover -> commerce-orders-fulfillment` **8 -> 5**, reducing Payments/Clover total outgoing direct debt **57 -> 54**. Public SCC remains expected to stay empty.

### Explicit non-scope / preserved behavior

Slice 1 does **not** modify `OrdersModule`, `orders/public-api.ts`, `pos-order-operations.contract.ts`, `PaymentCheckoutAttemptService`, `PreparedPaymentOrderSnapshot`, confirmed-payment transaction/finalization, `PosGateway`, production Web Clover Ecommerce behavior, provider execution/status mapping, UNKNOWN/reconciliation handling, pricing/promotion logic, Benefits reservation/COMMIT behavior, Prisma schema/migrations, or package dependencies.

The reverse-sync store identity comes from the already-persisted checkout `storeId` / store-stable identity carried by `PreparedPaymentCheckout`; no extra parameter or database lookup is added.

## Slice 1B — Prepared-payment V2 stable-identity contract normalization

Status: **MERGED / CI GREEN** — PR #2233; final head `0a2a01d8`; squash merge `be21c8c5`; PR CI #5326 passed.

Migration classification: **Class A persisted JSON contract normalization with an explicit coordinated cutover**. No Prisma schema/migration or data migration is required. The user explicitly chose a V2-only deployment during non-business hours rather than retaining a V1 read adapter. A fresh read-only production audit before implementation found `PaymentCheckoutAttempt = 0` rows, so there is no historical checkout payload to migrate; any V1 row encountered after deployment is rejected explicitly instead of being silently adapted.

### Source change

- `PreparedPaymentOrderSnapshot` moves from `version: 1` to **`version: 2`** and narrows its order payload to immutable finalization facts only. `userId` is removed; `order.userStableId` becomes the only persisted customer identity.
- Snapshot `storeId` is renamed to **`storeStableId`**, making the already-existing business identity semantics explicit without renaming `PaymentCheckoutAttempt.storeId` in Prisma. The persistence column remains schema-compatible and is checked against the V2 draft on read.
- Prepared item snapshots no longer carry pre-generated `OrderItem.id` UUIDs. Finalization lets the existing Prisma/DB UUID default create item identities inside the atomic Order transaction.
- Prepared coupon snapshots no longer carry `Coupon.id`. They persist `couponStableId` plus immutable display/eligibility facts. `MembershipService.commitPaymentCouponsForOrder()` returns the already-held internal `couponId` together with its `couponStableId` inside the existing finalization transaction; Orders verifies the stable ID matches the prepared snapshot before using the internal relation.
- `selectedUserCouponId` is removed from the Payments -> Benefits reservation contract and from persisted payment preparation. V2 records only `reserveAssignedCoupon: boolean` as the prior business selection intent; Benefits resolves its own `UserCoupon` through the existing unique `(userStableId, couponStableId)` pair and keeps the DB UUID internal.
- Checkout idempotency identity no longer hashes internal `selectedUserCouponId` or `checkoutIntentId`. The former is represented only by the same `reserveAssignedCoupon` business intent, while the latter is excluded from unified-payment identity; stable order facts plus the existing client idempotency key continue to define duplicate/recovery identity.
- Confirmed-payment Order creation resolves `Order.userId` late from the persisted `userStableId`; the DB UUID exists only inside Orders/Benefits execution and no longer crosses the Orders -> Payments persisted snapshot boundary.
- `PaymentCheckoutAttemptService.mapRecord()` accepts only V2 and rejects any other persisted version with `PAYMENT_CHECKOUT_SNAPSHOT_VERSION_UNSUPPORTED`; it also rejects a mismatch between persisted `storeStableId` and the checkout record's store-stable identity.
- Preparation-side member/coupon validation uses the existing stable-ID `ORDER_BENEFITS_READER` public capability rather than adding another concrete Loyalty/Membership resolution. The Benefits owner serializes coupon `expiresAt` into the order-facing business snapshot while retaining DB identities internally.
- Focused characterization now guards V2 persistence against `userId`, `Coupon.id`, `OrderItem.id`, and `selectedUserCouponId` leakage, locks the stable-pair assigned-coupon reservation behavior, and verifies late internal-ID resolution during the unchanged confirmed-payment transaction. `payments-architecture.spec.ts` adds a source guard preventing the removed identity fields from returning to payment-preparation persistence.

### Explicit non-scope / preserved behavior

Slice 1B deliberately does **not** introduce the future Orders public `PAYMENT_ORDER_PREPARATION` port/token, so the remaining `PaymentCheckoutAttemptService -> OrdersService.preparePaymentOrder()` concrete seam stays in place for the next slice. It does not change the architecture baseline: `payments-clover -> commerce-orders-fulfillment` remains **5**, Payments/Clover total outgoing direct debt remains **54**, and public SCC remains expected empty.

The existing confirmed-payment Prisma transaction remains intact: Points/Balance COMMIT, Coupon/UserCoupon COMMIT, Order creation and durable `order.accepted` still succeed or roll back together. No `Prisma.TransactionClient` is added to a public contract. `plannedOrderId` / internal Order identity coordination is unchanged and remains transaction-seam debt for later audit.

Production Web Clover Ecommerce, Clover provider execution, surcharge, UNKNOWN/reconciliation, refunds/reverse-sync, pricing/promotion evaluation, POS realtime/device transport, routes, Prisma schema/migrations and dependency manifests are unchanged. V2 normalization applies to the POS Terminal unified-payment preparation path; it is not a Web Clover cutover.

## Slice 1C — Stable-ID-only Orders public payment-preparation boundary

Status: **MERGED / CI GREEN** — PR #2234; final head `a042ea10`; squash merge `bf95051f`; PR CI #5329 passed.

Migration classification: **Class A atomic internal boundary contraction**. The V2 persisted payload, provider protocol, routes, Prisma schema/migrations, dependency manifests and externally observable payment behavior are unchanged; all in-repo consumers of the new internal public capability are updated atomically.

### Source change

- Orders now owns `payment-order-preparation.contract.ts`, which contains `PAYMENT_ORDER_PREPARATION`, `PaymentOrderPreparationPort`, and the existing V2 prepared-payment snapshot/pricing/tender/item types previously declared inside `orders.service.ts`. The contract shape is moved, not redesigned.
- `OrdersService` implements `PaymentOrderPreparationPort`. `OrdersModule` provides `PAYMENT_ORDER_PREPARATION` with `useExisting: OrdersService` and exports the token, so the public capability reuses the existing Orders singleton rather than creating another service instance.
- `orders/public-api.ts` exports only the preparation token, port and V2 snapshot required by Payments orchestration.
- `PaymentCheckoutAttemptService` injects `PAYMENT_ORDER_PREPARATION` and no longer imports `../orders/orders.service`; its `preparePaymentOrder(order, storeStableId)` call, persisted V2 draft, HOLD ordering, recovery and idempotency behavior are unchanged.
- The focused checkout spec mocks `PaymentOrderPreparationPort`, and `payments-architecture.spec.ts` now requires the public import/token plus the Orders `useExisting` binding and rejects regression to the concrete Orders service.
- The monotonic direct-import baseline contracts `payments-clover -> commerce-orders-fulfillment` **5 -> 4**, reducing Payments/Clover total outgoing direct debt **54 -> 53**. The existing public Payments -> Orders direction is reused; CI #5329 confirmed the architecture baseline and public SCC remained empty.

### Explicit non-scope / preserved behavior

Slice 1C does **not** change `PosCardPaymentOrchestrationService -> OrdersService.createFromConfirmedPaymentSnapshot()`. Benefits Tender/Coupon COMMIT, Order creation and durable `order.accepted` remain inside the existing atomic Prisma transaction, and no `Prisma.TransactionClient` or internal Order UUID is added to a public contract.

The two current OrdersModule composition imports remain for later composition cleanup, and the production Web Clover `clover-pay.controller.ts -> OrdersService` compatibility seam remains protected. POS realtime/device `PosGateway`, provider execution/status, surcharge, UNKNOWN/reconciliation, refunds/reverse-sync, V2 JSON shape, Prisma schema/migrations and package dependencies are unchanged.

## Slice 2A — POS payment realtime public-boundary contraction

Status: **MERGED / CI GREEN** — PR #2235; final head `6169d4dd`; squash merge `b1051c24`; PR CI #5332 passed.

Migration classification: **Class A atomic internal boundary contraction**. No Socket.IO event name/payload, persisted payment/order fact, route, provider protocol, schema/migration, dependency manifest, feature flag, or production Web Clover behavior changes.

### Source change

- POS now owns `pos-payment-realtime.contract.ts` with `POS_PAYMENT_REALTIME` and `PosPaymentRealtimePort`. The contract exposes only the payment status/reverse-sync fields that the existing gateway actually emits; previously accepted-but-not-emitted amount/tender fields are not promoted into the public POS boundary.
- `PosGateway` implements the public port and keeps the exact existing `POS_CARD_PAYMENT_STATUS_UPDATED` and `POS_CARD_PAYMENT_REVERSE_SYNC_UPDATED` wire payloads. Its store parameter is renamed internally to `storeStableId` to make the already-existing room identity explicit.
- `PosDeviceModule` binds `POS_PAYMENT_REALTIME` with `useExisting: PosGateway` and exports the token; `pos/public-api.ts` exports the token/port/message contracts without importing Payments or Clover.
- `PosCardPaymentOrchestrationService` and `PaymentReverseSyncOrchestrationService` inject `POS_PAYMENT_REALTIME` and no longer deep-import `pos.gateway`. Their existing best-effort `try/catch` publication semantics remain intact, so realtime failure cannot alter persisted Payment/Checkout/Order truth.
- Focused specs mock `PosPaymentRealtimePort`, and `payments-architecture.spec.ts` requires both orchestration files to use the POS public surface, requires the `useExisting` binding, rejects a return to `../pos/pos.gateway`, and guards the POS realtime contract against Payments/Clover imports.
- The monotonic direct-import baseline contracts `payments-clover -> store-operations-pos-print` **11 -> 9**, reducing Payments/Clover total outgoing direct debt **53 -> 51**. CI #5332 confirmed the architecture baseline and public SCC remained empty.

### Explicit non-scope / preserved behavior

Slice 2A does **not** change `PosCardPaymentFeatureConfig`, `PosDeviceGuard`, full-refund `PosOrdersService` transport, `PosDeviceModule`/`PosModule` composition imports, confirmed-payment atomic finalization, provider execution/status mapping, UNKNOWN/reconciliation, refund truth, surcharge, print, or Web Clover Ecommerce.

The realtime events remain advisory UI delivery only. Payment status/reversal truth continues to be produced by Payments/orchestration and persisted before/beside publication; POS owns only the store-facing delivery capability.

## Slice 2B — POS transport / composition public-surface contraction

Status: **LOCAL / REVIEW PENDING**

Migration classification: **Class A atomic internal boundary contraction**. Existing Nest guard/module classes, routes, authorization behavior, provider behavior, persisted facts, schema/migrations, dependencies and Web Clover behavior are unchanged.

### Source change

- `pos/public-api.ts` now explicitly exports the existing `PosDeviceGuard` and `PosModule`; `PosDeviceModule` was already public and remains the same class.
- `PosCardPaymentController`, `PosCardRefundController` and `PosFullRefundController` now import `PosDeviceGuard` from the POS public surface together with the already-public `AuthenticatedPosIdentity`. Guard ordering, `@UseGuards(...)`, roles and request/store identity behavior are unchanged.
- `PosCardPaymentOrchestrationModule` now imports the existing `PosDeviceModule` and `PosModule` from `../pos/public-api` rather than deep-importing their implementation paths. No wrapper/facade module is introduced and the Nest `imports` array remains unchanged.
- `payments-architecture.spec.ts` guards all three controllers and the composition module against regression to `pos-device.guard`, `pos-device.module` or `pos.module` deep imports and verifies those classes remain on the POS public surface.
- The monotonic direct-import baseline contracts `payments-clover -> store-operations-pos-print` **9 -> 4**, reducing Payments/Clover total outgoing direct debt **51 -> 46**. No POS -> Payments dependency is introduced, so public SCC remains expected empty pending GitHub CI.

### Explicit non-scope / preserved behavior

Slice 2B deliberately does **not** touch `PosCardPaymentFeatureConfig` or the three remaining full-refund `PosOrdersService` / `PosCreateFullRefundInput` deep imports. Those four edges contain actual rollout/policy ownership and are reserved for separate readiness/design slices rather than being hidden behind broad exports.

Confirmed-payment transaction atomicity, refund/reconciliation/provider truth, Terminal feature semantics, POS routes, device credential validation, Socket.IO behavior, printing, Prisma schema/migrations, package dependencies and production Web Clover Ecommerce are unchanged.

## Verification state

Slice 1 is merged and CI-green through PR #2231 / CI #5318. The readiness baseline refresh is merged through PR #2232 / `94cff60f`, with final head `f35bcd5f` passing CI #5321. Slice 1B is merged and CI-green through PR #2233 / CI #5326, final head `0a2a01d8`, squash merge `be21c8c5`. Slice 1C is merged and CI-green through PR #2234 / CI #5329, final head `a042ea10`, squash merge `bf95051f`. Slice 2A is merged and CI-green through PR #2235 / CI #5332, final head `6169d4dd`, squash merge `b1051c24`.

Slice 2B is currently **LOCAL / REVIEW PENDING**. Per repository workflow, no local lint/build/test/scanner run is claimed; GitHub Actions becomes authoritative only after user approval for remote delivery.

## Remaining Phase 6 work

After Slice 2B review/delivery, the next recommended readiness audit is the remaining **POS full-refund management capability** seam: determine the narrow public contract needed for `PosOrdersService.createFullRefund()` and its `PosCreateFullRefundInput` without exporting the whole service or weakening POS-owned channel/status/operator policy. `PosCardPaymentFeatureConfig` should stay separate as the final POS feature-policy ownership decision.

The confirmed-payment transaction seam remains an independent high-sensitivity decision and must not be split merely to reduce the scanner count. Production Web Clover compatibility remains protected until its later readiness/cutover work.
