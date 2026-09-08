# Phase 6 — Payments / POS Boundary Contraction and Closeout

Start date: 2026-09-07  
Current implementation base: `origin/dev@aa765f9d`  
Current status: **SLICE 4C LOCAL / REVIEW PENDING**

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

The Slice 3A readiness audit confirmed that `createFromConfirmedPaymentSnapshot()` must retain one Orders-owned Prisma transaction for paid Order creation, Points/Balance COMMIT, Coupon/UserCoupon COMMIT and the Terminal order's durable `order.accepted` lifecycle. This is a transaction-sensitive invariant, not ordinary import debt: Phase 6 must not split those writes merely to lower scanner counts, and must not expose `Prisma.TransactionClient` across contexts.

The same audit found that the remaining blocker to a safe public finalization capability is identity ownership rather than transaction ownership. `PaymentCheckoutAttempt.plannedOrderId`, `PaymentCheckoutAttempt.orderId`, the `internalOrderId` finalization input and `ConfirmedPaymentOrderResult.internalOrderId` make Payments/orchestration generate or persist an Orders-owned Prisma UUID. Slice 3A therefore normalizes identity first: Orders creates its own `Order.id` inside the existing atomic transaction, Benefits/Coupon COMMIT receives that UUID only inside the transaction, checkout/recovery keeps only `orderStableId`, and managed POS refund no longer propagates an Order UUID into Payments.

`PaymentTransaction.orderId` is deliberately **retained in Slice 3A**. It is nullable and the read-only production audit found `PaymentTransaction = 0` and `PaymentCheckoutAttempt = 0`; POS Terminal refund/void simply stops populating that field. Before Web Unified Payment migration, Payments will separately decide the long-term stable Order reference and whether the legacy scalar `orderId` should be replaced or contracted. Slice 3A does not widen into that future Web/payment persistence decision.

### Execution sequence after Slice 1

1. **Payment Preparation Contract Normalization Readiness — COMPLETED in Slice 1B** — V2 now carries only stable/business identities across the persisted preparation boundary and keeps internal DB identities inside Orders/Benefits execution.
2. **Stable-ID-only Prepared-Payment Boundary — COMPLETED in Slice 1C** — the unchanged V2 preparation contract is now exposed through `PAYMENT_ORDER_PREPARATION`; PR #2234 final head `a042ea10` passed CI #5329 and squash-merged as `bf95051f`.
3. **POS realtime/device capability contraction — COMPLETED in Slice 2A** — the two Payment orchestration `PosGateway` dependencies now use the POS-owned `POS_PAYMENT_REALTIME` capability; PR #2235 final head `6169d4dd` passed CI #5332 and squash-merged as `b1051c24`.
4. **Auth/POS transport and composition contraction — COMPLETED in Slice 2B** — the three POS payment/refund controllers consume `PosDeviceGuard` through the POS public surface and the composition module consumes `PosDeviceModule` publicly; the full `PosModule` remains a legal direct Nest composition edge after CI proved barrel re-export unsafe. PR #2236 final head `db442930` passed CI #5335 and squash-merged as `e2d72e17`.
5. **POS full-refund management capability contraction — COMPLETED in Slice 2C** — Payment orchestration now consumes the POS-owned `POS_FULL_REFUND_MANAGEMENT` capability instead of concrete `PosOrdersService`/its internal refund DTO; PR #2237 final head `e76c5087` passed PR CI #5338 and squash-merged as `51dd19ec`.
6. **POS CARD legacy rollout seam decision — COMPLETED in Slice 2D** — `PosCardPaymentFeatureConfig` remains temporary `payments.pos-card-legacy.v1` cutover compatibility only. It is not promoted into a permanent POS public policy and is not moved into Payments. PR #2238 final head `5e35bd7f` passed CI #5340 and squash-merged as `37f3e939`.
7. **Confirmed-payment Order identity normalization — COMPLETED in Slice 3A** — `PaymentCheckoutAttempt.plannedOrderId/orderId` and `internalOrderId` finalization plumbing are removed; Orders now generates `Order.id` inside its existing atomic finalization transaction, POS Terminal refund no longer populates a Payments Order UUID, and `PaymentTransaction.orderId` remains deferred for the later Web Unified Payment stable-reference decision. PR #2239 final head `782da646` passed CI #5343 and squash-merged as `239d8f74`.
8. **Confirmed-payment finalization public boundary — COMPLETED in Slice 3B** — the unchanged Orders-owned atomic finalization is exposed through `PAYMENT_ORDER_FINALIZATION`, returns only `orderStableId/orderNumber/pickupCode`, and `PosCardPaymentOrchestrationService` consumes that public capability while completed-checkout recovery reuses `POS_ORDER_OPERATIONS.getByStableIdForStore()`. PR #2240 final head `6eb4b38c` passed CI #5346 and squash-merged as `893fde49`.
9. **Payments orchestration composition cleanup — COMPLETED in Slice 4A** — the two remaining `OrdersModule` Nest composition imports now consume the already-existing `orders/public-api` surface without changing module identity, provider/controller wiring, production Web Clover behavior, or adding a wrapper/facade module. PR #2241 final head `d38dce42` passed PR CI #5348 and merged to `dev` as `00768897`.
10. **Clover provider internal capability cleanup — COMPLETED in Slice 4B** — `CloverPlatformPaymentsGateway` and its Platform v3 canonical HTTP/raw mapping now live under `payments/infrastructure/clover/platform/**`; `CloverPaymentProviderAdapter` consumes the same gateway, unused `PaymentsModule` exports are removed, and source guards prevent Platform infrastructure from leaking into orchestration/POS/Orders. PR #2243 merged as `aa765f9d` after CI #5354 passed API and Web. Web Ecommerce, OAuth/credential, Terminal, webhook and Prisma behavior remained unchanged.
11. **Unified/Sandbox configuration isolation — LOCAL in Slice 4C** — the live Web Ecommerce `CLOVER_BASE` / `CLOVER_MERCHANT_ID` / `CLOVER_ACCESS_TOKEN` and browser `NEXT_PUBLIC_CLOVER_*` consumers remain on the production compatibility path, while Unified merchant/OAuth/Platform now reads only `CLOVER_UNIFIED_*` and Terminal device/REST Pay reads only its `CLOVER_TERMINAL_*` family. Missing Unified/Terminal configuration fails closed with no fallback to the live Web merchant/token/base URL; focused config/provider/OAuth tests and architecture guards lock the separation. No payment traffic cutover is enabled by this Slice.
12. **Unified Clover OAuth credential convergence — PLANNED Slice 4D** — make Platform v3 and Terminal REST Pay use the same database-backed merchant OAuth credential lifecycle through `CloverMerchantAccessTokenService`; remove the Terminal static access-token configuration path, bind OAuth/store mapping to the Unified merchant identity, and keep production Web Ecommerce execution unchanged.
13. **Test Merchant / device sandbox bring-up and POS Terminal verification** — after 4C/4D are merged and deployed with the Terminal rollout still disabled by default, complete Test Merchant OAuth, Platform v3 read verification, Cloud Pay Display/device availability, controlled sandbox Sale/reconciliation, then the full POS Terminal acceptance matrix. Full POS E2E against the production SanQ runtime must be deliberately scheduled because SanQ-side Payment/Order facts still write to the production database even when Clover is sandbox.
14. **Web Clover cutover readiness audit** — only after POS Terminal sandbox/real-device behavior is understood and stable, perform the read-only/high-risk audit of production checkout, immutable snapshot, tender allocation, surcharge, provider confirmation, reconciliation, refunds, recovery/idempotency and wallet/Hosted iFrame compatibility.
15. **Web Unified Payment Core migration / legacy cleanup** — only after readiness PASS, using additive implementation, controlled activation, rollback, active production verification, observation, then compatibility cleanup.

### Dependency priorities and exit criteria

After Slice 3B merged, Payments/Clover direct debt is **43** with `commerce-orders-fulfillment = 3`, `identity-customer-benefits = 13`, `store-operations-pos-print = 2`, `architecture-foundation = 15`, `runtime-data-ci-ops = 8`, and `messaging-notifications = 2`. Slice 4A normalizes the two explicit `OrdersModule` Nest composition imports from `../orders/orders.module` to the already-existing `../orders/public-api` surface. The monotonic direct-import baseline therefore moves `commerce-orders-fulfillment` **3 -> 1** and Payments/Clover total direct debt **43 -> 41**; the dependency itself remains visible as approved public composition traffic rather than being represented as removed. The remaining direct Payments -> Orders edge is only the protected production Web `clover-pay.controller.ts -> OrdersService` seam. The remaining POS pair is still the legal direct `PosModule` Nest composition edge plus temporary `PosCardPaymentFeatureConfig`. These counts are contraction signals, not mechanical zero targets.

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

Status: **MERGED / CI GREEN** — PR #2236; final head `db442930`; squash merge `e2d72e17`; PR CI #5335 passed after the initial `PosModule` barrel attempt failed API tests and was safely contracted.

Migration classification: **Class A atomic internal boundary contraction**. Existing Nest guard/module classes, routes, authorization behavior, provider behavior, persisted facts, schema/migrations, dependencies and Web Clover behavior are unchanged.

### Source change

- `pos/public-api.ts` now explicitly exports the existing `PosDeviceGuard`; `PosDeviceModule` was already public and remains the same class.
- `PosCardPaymentController`, `PosCardRefundController` and `PosFullRefundController` now import `PosDeviceGuard` from the POS public surface together with the already-public `AuthenticatedPosIdentity`. Guard ordering, `@UseGuards(...)`, roles and request/store identity behavior are unchanged.
- `PosCardPaymentOrchestrationModule` now imports the existing `PosDeviceModule` from `../pos/public-api`; the existing direct `PosModule` Nest composition import is intentionally retained. An initial attempt to re-export `PosModule` through `pos/public-api.ts` passed architecture/lint/build/strict but caused 52 Jest suites to fail during module evaluation because the barrel eagerly loaded the full POS module and introduced runtime circular initialization (`ZodValidationPipe is not a constructor` / invalid guard decorators). No wrapper/facade module is introduced and the Nest `imports` array remains unchanged.
- `payments-architecture.spec.ts` guards all three controllers and `PosDeviceModule` against regression to implementation-path imports, and explicitly protects the lightweight POS public barrel from re-exporting `PosModule` again.
- The monotonic direct-import baseline contracts `payments-clover -> store-operations-pos-print` **9 -> 5**, reducing Payments/Clover total outgoing direct debt **51 -> 47**. The four removed edges are three `PosDeviceGuard` deep imports plus `PosDeviceModule`; the retained `PosModule` edge is legal Nest composition, not business-capability leakage. CI #5335 confirmed the architecture baseline and public SCC remained empty.

### Explicit non-scope / preserved behavior

Slice 2B deliberately does **not** touch `PosCardPaymentFeatureConfig` or the three remaining full-refund `PosOrdersService` / `PosCreateFullRefundInput` deep imports. Those four edges contain actual rollout/policy ownership and are reserved for separate readiness/design slices rather than being hidden behind broad exports.

Confirmed-payment transaction atomicity, refund/reconciliation/provider truth, Terminal feature semantics, POS routes, device credential validation, Socket.IO behavior, printing, Prisma schema/migrations, package dependencies and production Web Clover Ecommerce are unchanged.

## Slice 2C — POS full-refund management public-capability contraction

Status: **MERGED / CI GREEN** — PR #2237; final head `e76c5087`; squash merge `51dd19ec`; PR CI #5338 passed.

Migration classification: **Class A atomic internal boundary contraction**. No route, request/response payload, persisted refund fact, provider protocol, schema/migration, dependency manifest, feature flag or production Web Clover behavior changes.

### Readiness finding

The remaining full-refund deep dependency was not merely transport: `PosOrdersService.createFullRefund()` owns the store-facing management policy that checks the store-scoped Order, blocks Uber orders from the manual POS refund path, blocks Web orders with non-zero external payment until a provider reversal path is available, enforces amendable statuses, validates operator/reason text and decorates the manual audit reason before delegating to the Orders public `createFullRefund()` capability. That policy belongs in Store Operations / POS and must not be copied into Payments orchestration or replaced by a broad `PosOrdersService` export.

### Source change

- POS now owns `pos-full-refund-management.contract.ts` with `POS_FULL_REFUND_MANAGEMENT`, `PosFullRefundManagementPort`, the existing request facts and the historical full-refund result shape. The contract uses the shared order payment-method type and a type-only Orders public order DTO; it contains no Prisma, Payments or Clover dependency.
- `PosOrdersService` implements the new port without changing `createFullRefund()` behavior. `PosModule` binds the token with `useExisting: PosOrdersService`, exports only `POS_FULL_REFUND_MANAGEMENT`, and no longer exports the concrete `PosOrdersService` outside the module. Internal POS controllers continue using the same service instance.
- `PosFullRefundOrchestrationService` injects `POS_FULL_REFUND_MANAGEMENT` and keeps the existing managed-card decision tree unchanged: only `LEGACY_MANUAL_REQUIRED` delegates to POS management; `SUCCEEDED` returns refunded, `PROCESSING`/`UNKNOWN`/`RECONCILING` remain pending-platform, and definitive managed failures still throw without legacy fallback.
- `PosFullRefundController` consumes `PosFullRefundManagementInput` from the POS public surface rather than the internal `pos-orders.service` DTO; the existing Zod schema, route, guards, stable store identity and payload fields are unchanged.
- Focused orchestration tests mock `PosFullRefundManagementPort`, and `payments-architecture.spec.ts` prevents regression to `pos-orders.service`, requires the POS public token/port/input, locks the `useExisting` binding, prevents concrete `PosOrdersService` module export, and guards the new contract against Prisma/Payments/Clover leakage.
- The monotonic direct-import baseline contracts `payments-clover -> store-operations-pos-print` **5 -> 2**, reducing Payments/Clover total outgoing direct debt **47 -> 44**. The only remaining production direct imports in this pair are the explicitly retained `PosModule` Nest composition edge and `PosCardPaymentFeatureConfig`; PR CI #5338 confirmed the architecture baseline and public SCC remained empty.

### Explicit non-scope / preserved behavior

Slice 2C does **not** alter Clover refund/void execution, canonical provider truth, UNKNOWN/reconciliation semantics, when an Order may become refunded, Benefits rollback behavior, Orders `POS_ORDER_OPERATIONS`, POS full-refund route/validation, POS management channel/status/operator rules, confirmed-payment transaction atomicity, `PosCardPaymentFeatureConfig`, `PosModule` composition, printing, Prisma schema/migrations, dependencies or production Web Clover Ecommerce.

## Slice 2D — POS CARD legacy rollout seam quarantine / terminal-cutover ownership decision

Status: **DOCS-ONLY GOVERNANCE DECISION DOCUMENTED**

Migration classification: **Controlled critical-cutover governance only**. No application source, architecture baseline, route, request/response payload, persisted payment/order fact, provider protocol, schema/migration, dependency manifest, current feature-flag behavior or production Web Clover behavior changes.

### Decision

- `PosCardPaymentFeatureConfig` is classified as implementation for registered compatibility `payments.pos-card-legacy.v1`, not as a durable POS business policy or Payments domain capability.
- Do **not** add `POS_CARD_PAYMENT_FEATURE_POLICY`, re-export the concrete config through `pos/public-api.ts`, or move the rollout flag/config into Payments merely to remove a direct-import count.
- The current `flag=false -> legacy CARD` / `flag=true -> Unified Payment Core + Clover Terminal` branch remains only while the two POS CARD paths coexist. Its purpose is controlled deployment, cutback and production stabilization.
- The target architecture has no route-choice policy: once the Terminal path is accepted, POS CARD always enters Unified Payment Core; Payments owns payment/provider truth, POS owns store-facing interaction/realtime/device behavior, and orchestration coordinates public capabilities.
- The legacy POS CARD direct-paid path, `PosCardPaymentFeatureConfig`, `POS_CLOVER_TERMINAL_PAYMENT_ENABLED`, POS browser/server route-choice branches and legacy refund compatibility are removed together in the dedicated Phase J contraction after POS ↔ Clover Terminal realtime synchronization/recovery is complete, real-device acceptance passes, one settlement cycle reconciles, the production stability window is clean, and legacy invocation is zero.
- After compatibility deletion, architecture tests should enable the final invariant that a new `paymentMethod=CARD` Order must be traceable to canonical `PaymentTransaction` truth and cannot be created directly as paid by the legacy POS route.

### Architecture effect

None in this docs-only Slice. `payments-clover -> store-operations-pos-print` remains **2**, Payments/Clover total outgoing direct debt remains **44**, and the public SCC baseline remains empty. The direct `PosModule` import remains legal Nest composition; the `PosCardPaymentFeatureConfig` edge is explicitly temporary registered compatibility rather than a candidate for a manufactured permanent facade.

## Slice 3A — Confirmed-payment Order identity normalization

Status: **MERGED / CI GREEN** — PR #2239; final head `782da646`; squash merge `239d8f74`; PR CI #5343 passed.

Migration classification: **Class B persisted pre-production contraction** with explicit user authorization for the destructive schema step. A fresh read-only production audit immediately before implementation found `PaymentCheckoutAttempt = 0` and `PaymentTransaction = 0`, so there is no production Unified Payment history to backfill. The new migration is fail-closed: it refuses to drop the checkout UUID columns if any `PaymentCheckoutAttempt` row exists at deployment time.

### Source / persistence change

- `PaymentCheckoutAttempt.plannedOrderId` and `PaymentCheckoutAttempt.orderId` are removed from Prisma and from `PreparedPaymentCheckout`. Payment checkout preparation no longer calls `randomUUID()` for an Orders-owned persistence identity; `orderStableId` remains the durable business/recovery identity.
- `createFromConfirmedPaymentSnapshot()` no longer accepts `internalOrderId` and `ConfirmedPaymentOrderResult` no longer exposes one. Inside the existing Orders-owned Prisma transaction, `tx.order.create()` now lets Prisma/DB generate `Order.id`, then Tender and Coupon/UserCoupon COMMIT receive that internal UUID only inside the transaction. If any COMMIT or prepared-fact validation fails, the Order creation and `order.accepted` write roll back with the same transaction.
- Coupon persistence remains atomic: the Order is created without `couponId`, the held coupon is committed using the newly generated `Order.id`, then the same transaction binds the returned internal coupon UUID back to the Order before writing durable `order.accepted`.
- `PaymentCheckoutAttemptService.markCompleted()` now records only `COMPLETED/finalizedAt`; crash/reload recovery resolves the already-created Order by `orderStableId`, preserving existing no-reprice/no-recommit semantics.
- POS managed refund no longer requires `PaymentCheckoutAttempt.orderId` and `RefundPaymentService.StartOrRecoverRefundInput` no longer accepts an Order UUID. New POS Terminal refund/void `PaymentTransaction` records therefore leave `orderId = null`; provider correlation, canonical preflight, amount/surcharge/refund truth and idempotency remain unchanged.
- `PaymentTransaction.orderId` itself is intentionally retained as a nullable legacy scalar. Slice 3A does not reinterpret or migrate that field. Before Web Unified Payment migration, Payments must separately decide the long-term stable Order reference and only then determine whether `PaymentTransaction.orderId` should be replaced/contracted.
- Focused characterization/tests lock Orders-owned UUID generation, same-transaction Benefits/Coupon COMMIT, stable-ID recovery, checkout persistence without Order UUIDs, and POS refund PaymentTransaction `orderId = null`. `payments-architecture.spec.ts` prevents `plannedOrderId`, checkout `orderId`, `internalOrderId` finalization plumbing or POS refund Order-UUID coupling from returning.
- New migration: `20260908155000_contract_payment_checkout_order_db_ids`. It checks that `PaymentCheckoutAttempt` is empty, then drops the obsolete unique/index and the two UUID columns. Existing migration history is unchanged.

### Architecture / behavior effect

There is intentionally **no direct-import baseline change** in Slice 3A: `payments-clover -> commerce-orders-fulfillment` remains **4** and Payments/Clover total remains **44**. The concrete confirmed-payment finalization call stays in place until Slice 3B; 3A only makes that future public boundary safe to expose by removing DB-identity leakage first.

Production Web Clover Ecommerce, Clover provider execution/protocol, Payment success/UNKNOWN/reconciliation semantics, external amount/surcharge truth, POS Terminal rollout flag, pricing/promotion snapshots, printing/preparation behavior and package dependencies are unchanged. Deployment must keep the Terminal rollout on the legacy/non-Terminal path while this migration is applied: the fail-closed empty-table guard runs first, the obsolete columns are contracted only if no Unified checkout exists, and the matching API code is then deployed before any Terminal cutover. No production migration has been applied in this workspace.

## Slice 3B — Confirmed-payment finalization public boundary

Status: **MERGED / CI GREEN** — PR #2240; final head `6eb4b38c`; squash merge `893fde49`; PR CI #5346 passed.

Migration classification: **Class A atomic internal boundary contraction**. No Prisma schema/migration, persisted checkout/payment/order fact, route, provider protocol, Terminal rollout flag, refund/reconciliation state meaning, package dependency, or production Web Clover behavior is changed.

### Source change

- Orders now owns `payment-order-finalization.contract.ts` with `PAYMENT_ORDER_FINALIZATION`, `PaymentOrderFinalizationPort`, the stable/business finalization input, and a narrow result containing only `orderStableId`, `orderNumber` and `pickupCode`. The contract reuses the already-public V2 `PreparedPaymentOrderSnapshot` and contains no Prisma type, `Prisma.TransactionClient`, internal DB UUID, Payments/Clover dependency, or full `OrderDto`.
- `OrdersService` implements `PaymentOrderFinalizationPort`. `finalizeConfirmedPayment()` is the public use-case entry for the existing transaction; the transaction body still creates the paid Order, COMMITs Points/Balance and Coupon/UserCoupon reservations, binds the coupon relation, and writes durable `order.accepted` atomically before post-commit paid side effects.
- `OrdersModule` binds `PAYMENT_ORDER_FINALIZATION` with `useExisting: OrdersService` and exports the token, matching the established `PAYMENT_ORDER_PREPARATION` pattern without creating another service/facade instance.
- `PosCardPaymentOrchestrationService` injects `PAYMENT_ORDER_FINALIZATION` through `orders/public-api.ts` and no longer imports concrete `OrdersService`. Completed-checkout recovery reuses the already-public `POS_ORDER_OPERATIONS.getByStableIdForStore(orderStableId, storeStableId)` capability; no second Order-read port is introduced.
- Focused orchestration/characterization tests now mock the public finalization port, lock the narrow finalization result, preserve completed-checkout no-reprice/no-recommit recovery, and retain 3A's internal-ID guards. `payments-architecture.spec.ts` requires the public token/port, `useExisting` binding, stable-only result fields and no Prisma/Payments/Clover/full-Order leakage, while forbidding the concrete OrdersService import from returning.
- The monotonic baseline contracts `payments-clover -> commerce-orders-fulfillment` **4 -> 3**, reducing Payments/Clover total direct debt **44 -> 43**. The three retained direct edges are the protected production Web Clover controller plus the two explicit OrdersModule composition imports; composition cleanup/Web migration remain later work.

### Explicit non-scope / preserved behavior

The Orders-owned Prisma transaction is not moved or split. Benefits/Coupon COMMIT order, prepared snapshot validation, surcharge/charged-total inputs, payment success/UNKNOWN/reconciliation semantics, checkout `FINALIZING/COMPLETED` recovery, immediate-preparation activation, realtime publication, refund/void behavior, `PaymentTransaction.orderId`, POS Terminal feature compatibility, printing and production Web Clover Ecommerce remain unchanged.

## Slice 4A — Payments orchestration composition cleanup

Status: **MERGED / CI GREEN** — PR #2241; final head `d38dce42`; squash merge `00768897`; PR CI #5348 passed.

Migration classification: **Class A atomic internal composition-path contraction**. No provider protocol, payment/order behavior, Nest module identity, controller/provider registration, public contract shape, Prisma schema/migration, dependency manifest, route, feature flag or production Web Clover behavior changes.

### Readiness finding

The two remaining `OrdersModule` implementation-path imports are composition-only wiring in `clover-web-checkout-orchestration.module.ts` and `pos-card-payment-orchestration.module.ts`. `orders/public-api.ts` already re-exports the same `OrdersModule` class and is already used safely by `AppModule` and `PosModule`; unlike the failed Phase 6 Slice 2B `PosModule` barrel experiment, this Orders barrel is an established runtime surface. Read-only inspection found no Orders -> Payments reverse import that would make the public barrel create a new eager runtime cycle.

### Source / architecture change

- Both orchestration modules now import the same `OrdersModule` class from `../orders/public-api` instead of `../orders/orders.module`; their Nest `imports`, `controllers` and `providers` arrays are unchanged.
- `orders/public-api.ts` is not widened and no wrapper/facade module is introduced.
- `payments-architecture.spec.ts` adds a source-specific guard requiring these two composition modules to use the Orders public surface and forbidding regression to `../orders/orders.module`; `orders-public-composition.smoke.spec.ts` imports both orchestration modules so CI exercises the new barrel at runtime and catches eager initialization/cycle failures.
- The architecture scanner continues to observe the Payments -> Orders dependency, but classifies these two imports as approved public-surface traffic rather than implementation-path debt. The monotonic direct-import allowance therefore contracts `payments-clover -> commerce-orders-fulfillment` **3 -> 1**, reducing Payments/Clover total direct debt **43 -> 41**. The sole remaining direct edge is the protected production Web `clover-pay.controller.ts -> OrdersService` compatibility seam.

### Explicit non-scope / preserved behavior

Production Web Clover checkout execution, payment validation, surcharge, reconciliation, order finalization, refund behavior, historical payment facts, POS Terminal orchestration, Benefits HOLD/COMMIT/RELEASE semantics, Orders transaction boundaries, `PaymentTransaction.orderId`, `PosModule` composition and `PosCardPaymentFeatureConfig` compatibility remain unchanged. Slice 4A does not authorize or begin the later Web Unified Payment cutover.

## Slice 4B — Clover provider internal capability cleanup

Status: **MERGED / CI GREEN** — PR #2243; squash merge `aa765f9d`; CI #5354 passed API and Web.

Migration classification: **Class A atomic internal infrastructure cleanup**. No persisted/public contract, provider protocol, route, feature flag, schema/migration, dependency manifest or externally observable payment behavior is intended to change.

### Approved implementation scope

1. Move `CloverPlatformPaymentsGateway` and its Platform v3 canonical payment/reversal HTTP/raw mapping helpers out of `clover-payment-provider.adapter.ts` into `payments/infrastructure/clover/platform/clover-platform-payments.gateway.ts`.
2. Keep `CloverPaymentProviderAdapter` injecting and calling the same gateway capability; provider outcome/status semantics, canonicalization ordering and fallback behavior remain unchanged.
3. Remove `PAYMENT_PROVIDER` and `CreatePaymentAttemptUseCase` from `PaymentsModule.exports` because the readiness audit found no external module consumer for either export. Their internal provider/use-case wiring remains intact.
4. Add architecture guards that require Platform v3 gateway implementation to remain under `payments/infrastructure/clover/platform/**`, prevent `clover-payment-provider.adapter.ts` from re-absorbing Platform HTTP/raw mapping, and prevent orchestration/POS/Orders from importing the concrete Platform gateway. Keep the exact `CloverService -> CloverEcommerceTransport` production Web compatibility seam until the later Web Unified Payment cutover.

### Source / architecture change

- `CloverPlatformPaymentsGateway`, its Platform v3 request helpers, canonical payment/refund mapping and HTTP request/retry logic now live in `payments/infrastructure/clover/platform/clover-platform-payments.gateway.ts`; the code is moved without changing provider result codes, amount/currency/surcharge checks, UNKNOWN handling, 401 refresh retry, timeout or canonicalization semantics.
- `CloverPaymentProviderAdapter` now imports the same gateway from the dedicated Platform path and retains the same Ecommerce/Terminal routing, canonical-read ordering and merge behavior. `CloverProviderInfrastructureModule` provides the relocated gateway exactly as before.
- Existing provider tests continue exercising the same adapter/gateway behavior with only the gateway import path updated. `payments-architecture.spec.ts` now requires the gateway class to live under `platform/**`, forbids Platform HTTP/raw logic from returning to the adapter, and keeps the existing rule that orchestration/POS/Orders cannot import concrete Platform infrastructure.
- `PaymentsModule` no longer exports `PAYMENT_PROVIDER` or `CreatePaymentAttemptUseCase`; both bindings remain internal and unchanged. A source guard locks that they remain provided internally but absent from the module export surface.
- This Slice is intra-context cleanup only. `context-baseline.json` is intentionally unchanged: `payments-clover -> commerce-orders-fulfillment` remains **1**, Payments/Clover total direct debt remains **41**, and no new public SCC/context edge is introduced.

### Explicit non-scope

Slice 4B does **not** modify `CloverPayController`, `CloverService`, `CloverEcommerceTransport`, `/v1/charges`, surcharge handling, Web amount/currency/payment-ID validation, Web finalization/refund behavior, OAuth/merchant credential behavior, Terminal provider semantics, webhook route/auth/reverse-sync behavior, Prisma/schema/migrations, Docker/environment configuration or rollout flags.

## Slice 4C — Unified/Sandbox configuration isolation

Status: **LOCAL / REVIEW PENDING**

Migration classification: **Controlled critical-cutover preparation, configuration-only semantics**. No payment traffic cutover is authorized by this Slice.

### Target configuration ownership

The live Web Ecommerce path retains its current production variables and consumers unchanged during sandbox bring-up:

```text
CLOVER_BASE
CLOVER_MERCHANT_ID
CLOVER_ACCESS_TOKEN
NEXT_PUBLIC_CLOVER_PUBLIC_TOKEN
NEXT_PUBLIC_CLOVER_SDK_URL
NEXT_PUBLIC_CLOVER_MERCHANT_ID
```

Add a separate Unified Clover configuration family for the future shared payment core, initially populated with the new Test Merchant/Test App sandbox values:

```text
CLOVER_UNIFIED_MERCHANT_ID
CLOVER_UNIFIED_STORE_STABLE_ID
CLOVER_UNIFIED_PLATFORM_API_BASE
CLOVER_UNIFIED_OAUTH_CLIENT_ID
CLOVER_UNIFIED_OAUTH_CLIENT_SECRET
CLOVER_UNIFIED_OAUTH_AUTHORIZE_BASE
CLOVER_UNIFIED_OAUTH_API_BASE
CLOVER_UNIFIED_OAUTH_CALLBACK_URL
CLOVER_UNIFIED_OAUTH_SCOPES
```

Keep Terminal-only device/REST Pay configuration separate from both Web Ecommerce and the shared Unified merchant/OAuth identity:

```text
CLOVER_TERMINAL_API_BASE
CLOVER_TERMINAL_DEVICE_ID
CLOVER_TERMINAL_REMOTE_APP_ID
CLOVER_TERMINAL_TIMEOUT_SECONDS
```

Credential-vault encryption-key configuration may remain shared infrastructure because it describes how Clover credentials are encrypted, not which merchant/environment they authorize.

### Hard safety rules

- Missing Unified configuration must make Platform/OAuth unavailable; it must never fall back to live Web `CLOVER_MERCHANT_ID`, `CLOVER_BASE` or `CLOVER_ACCESS_TOKEN`.
- Missing Terminal configuration must make Terminal unavailable; Terminal base/device/RAID must never fall back to Web Ecommerce configuration.
- `POS_CLOVER_TERMINAL_PAYMENT_ENABLED` remains false by default during configuration/OAuth bring-up.
- Existing production Clover webhook merchant/auth configuration remains unchanged in 4C; sandbox bring-up initially relies on synchronous Terminal execution plus Platform v3 canonical read/reconciliation rather than widening production webhook scope.
- No `.env` credential value is committed. `docker-compose.yml` may expose only parameter names/placeholders; deployment values remain operator-injected secrets.

### Source / configuration change

- `CloverProviderConfig` now exposes explicit Web Ecommerce, Unified Clover and Terminal field families. Live Web execution continues to read only `CLOVER_BASE`, `CLOVER_MERCHANT_ID` and `CLOVER_ACCESS_TOKEN`; the old generic Store/Platform/OAuth/Terminal environment aliases are no longer read by Unified or Terminal production code.
- Platform canonical payment reads and merchant verification use only `CLOVER_UNIFIED_MERCHANT_ID` plus `CLOVER_UNIFIED_PLATFORM_API_BASE`. A missing Unified merchant/base stops configuration checks before credential lookup or outbound HTTP; Platform continues to obtain payment-read tokens exclusively from `CloverMerchantAccessTokenService` and never from `CLOVER_ACCESS_TOKEN`.
- OAuth client/authorization uses only `CLOVER_UNIFIED_OAUTH_*`, requires explicit authorize/API/callback endpoints, requires the configured Unified merchant/store mapping, and rejects a launch for a different otherwise-valid merchant. Missing required Unified configuration returns configuration failure before provider traffic rather than defaulting to production Clover endpoints.
- `CloverTerminalTransport` now requires `CLOVER_TERMINAL_API_BASE`, the temporary pre-4D `CLOVER_TERMINAL_OAUTH_TOKEN`, `CLOVER_TERMINAL_DEVICE_ID`, `CLOVER_TERMINAL_REMOTE_APP_ID`, and a numeric 10-300 second timeout. Missing/invalid Terminal configuration reports `MISCONFIGURED`; Terminal no longer inherits `CLOVER_BASE`, `CLOVER_DEVICE_ID`, `CLOVER_REMOTE_APP_ID`, or a default timeout.
- Production Clover webhook ingress remains explicitly bound to the Web compatibility `CLOVER_MERCHANT_ID` plus `CLOVER_WEBHOOK_AUTH_CODE`; sandbox/Unified merchant authorization does not widen the production webhook acceptance scope.
- `docker-compose.yml` keeps the existing live Web values/consumer wiring and adds only operator-injected Unified/Terminal placeholders. The temporary Terminal static token remains only until Slice 4D credential convergence; no sandbox merchant/token/secret value is committed.
- Focused configuration, OAuth, Platform and Terminal regression coverage plus an architecture source guard lock the no-fallback boundary, including the case where production Web configuration is present while Unified/Terminal variables are missing. This is an intra-context runtime-configuration isolation and does not change the context dependency graph or direct-import baseline.

### Explicit non-scope / preserved production behavior

Slice 4C does **not** change `/v1/charges`, Web card/wallet tokenization, `NEXT_PUBLIC_CLOVER_*`, Web pricing-token compatibility, surcharge/amount/currency/payment-ID validation, Web finalization/refund behavior, production webhook scope, persisted payment/order facts, Prisma/schema/migrations, package dependencies, the Terminal rollout flag, or payment traffic routing. `POS_CLOVER_TERMINAL_PAYMENT_ENABLED` therefore remains disabled by default and no Test Merchant/Terminal financial traffic is authorized by this source change.

### Persistence decision

No Prisma change is planned for 4C. `CloverMerchantAuthorization.storeStableId @unique` is acceptable while one runtime has only one active Unified Clover merchant environment for a SanQ store. Before a later production Unified binding, the sandbox authorization must be deliberately revoked/unbound so the production merchant can become the sole active store binding. If long-lived simultaneous sandbox + production authorization in one runtime becomes a requirement, that is a separate schema/architecture decision requiring explicit migration authorization rather than a hidden environment switch.

## Slice 4D — Unified Clover OAuth credential convergence

Status: **PLANNED / AFTER 4C**

Migration classification: **Controlled critical-cutover preparation inside Payments infrastructure**. Production Web Ecommerce execution remains on its guarded legacy path.

### Target credential flow

Replace the Terminal-specific static access-token path with the existing database-backed OAuth credential lifecycle:

```text
Test/Unified Merchant OAuth
        -> CloverMerchantAuthorization
        -> CloverMerchantAccessTokenService
             -> CloverPlatformPaymentsGateway
             -> CloverTerminalTransport
```

Platform v3 and Terminal REST Pay must therefore use the same `CLOVER_UNIFIED_MERCHANT_ID` authorization identity and token refresh/recovery lifecycle. OAuth store mapping must compare against the Unified merchant/store configuration rather than the live Web Ecommerce `CLOVER_MERCHANT_ID`/store configuration. The long-term Terminal static `CLOVER_TERMINAL_OAUTH_TOKEN` configuration path is removed rather than retained as a fallback.

### Explicit non-scope

4D does not migrate Web CARD/Apple Pay/Google Pay into Unified Payment Core, does not change `/v1/charges`, does not activate POS Terminal traffic, does not widen webhook scope, and does not change Prisma schema. Web migration remains later, after POS Terminal sandbox/real-device behavior is verified and a dedicated Web cutover readiness audit passes.

## Sandbox verification gate after 4D

Once 4C/4D are merged and deployed, verification proceeds in this order:

1. Keep Terminal rollout disabled and complete Test App Preview -> OAuth -> `ACTIVE` store binding.
2. Verify Platform v3 merchant/payment read with the stored OAuth credential.
3. Verify Cloud Pay Display/Test device availability using the sandbox Terminal base, device ID and RAID.
4. Run a controlled sandbox Sale and confirm the same payment through Platform v3 canonical read/reconciliation before allowing Order finalization.
5. Exercise timeout/UNKNOWN/recovery, cancel, void/refund and duplicate/idempotency scenarios before the complete POS acceptance matrix.
6. Only in a deliberate non-business/test window enable the POS Terminal route for full E2E. Using Clover sandbox does **not** isolate SanQ persistence: a full POS flow against the production runtime can create production-database `PaymentTransaction`, `PaymentCheckoutAttempt`, Order, print and reporting facts. If test-data isolation is required, use a separately approved staging runtime/database instead of pretending provider sandbox also isolates SanQ data.
7. After Terminal behavior is understood and stable, proceed to the Web Clover cutover readiness audit and only then Phase G migration of Web CARD/Apple Pay/Google Pay into the same Unified Payment Core.

## Verification state

Slice 1 is merged and CI-green through PR #2231 / CI #5318. The readiness baseline refresh is merged through PR #2232 / `94cff60f`, with final head `f35bcd5f` passing CI #5321. Slice 1B is merged and CI-green through PR #2233 / CI #5326, final head `0a2a01d8`, squash merge `be21c8c5`. Slice 1C is merged and CI-green through PR #2234 / CI #5329, final head `a042ea10`, squash merge `bf95051f`. Slice 2A is merged and CI-green through PR #2235 / CI #5332, final head `6169d4dd`, squash merge `b1051c24`.

Slice 2B is merged and CI-green through PR #2236 / CI #5335, final head `db442930`, squash merge `e2d72e17`. The initial CI #5334 failure remains useful architecture evidence: exporting `PosModule` through the lightweight public barrel caused runtime circular initialization, so the final design intentionally retains the direct `PosModule` Nest composition edge.

Slice 2C is merged and CI-green through PR #2237 / PR CI #5338, final head `e76c5087`, squash merge `51dd19ec`. Slice 2D is merged and CI-green through PR #2238 / CI #5340, final head `5e35bd7f`, squash merge `37f3e939`.

Slice 3A is merged and CI-green through PR #2239 / CI #5343, final head `782da646`, squash merge `239d8f74`. Its authorized contraction migration is source-complete in `dev` but no production migration application or Terminal cutover is claimed here.

Slice 3B is merged and CI-green through PR #2240 / CI #5346, final head `6eb4b38c`, squash merge `893fde49`. Slice 4A merged through PR #2241 after final head `d38dce42` passed PR CI #5348; squash merge `00768897`. The post-4A sandbox/config sequencing decision merged through PR #2242 after final head `deb2e8c6` passed CI #5350; squash merge `e12217a3`. Slice 4B merged through PR #2243 as `aa765f9d`; merged-dev CI #5354 passed API and Web. Slice 4C is **LOCAL / REVIEW PENDING** on base `origin/dev@aa765f9d`; no local lint/build/test/scanner execution or remote CI result is claimed for the 4C source yet.

## Remaining Phase 6 work

The final POS pair ownership question remains resolved without source churn: keep the legal `PosModule` composition edge and quarantine `PosCardPaymentFeatureConfig` as temporary registered compatibility until the Terminal cutover cleanup.

After Slice 4C review/delivery, the next implementation is **Slice 4D Unified Clover OAuth credential convergence**: remove the temporary Terminal static token path and make Terminal consume the same database-backed Unified merchant credential lifecycle already used by Platform v3. Do not start Test Merchant/Terminal payment traffic before 4C/4D are both merged with fail-closed sandbox boundaries. After sandbox/device verification, perform the protected Web Clover readiness audit; Web CARD/Apple Pay/Google Pay migration remains a later controlled cutover rather than part of 4B-4D.
