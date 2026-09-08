# Phase 6 — Payments / POS Boundary Contraction and Closeout

Start date: 2026-09-07  
Current implementation base: `origin/dev@80ec51b0`  
Current status: **SLICE 1 MERGED / CI GREEN; READINESS BASELINE REFRESHED**

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

`PreparedPaymentOrderSnapshot` currently includes order, pricing, tender, item, promotion/coupon and preparation facts plus `storeId` and `userId`. Here `storeId` semantically carries `Store.storeStableId`, while `userId` is an internal User database UUID. The snapshot is persisted into Payment checkout `orderDraftJson` and later reused by confirmed-payment finalization.

Therefore the existing snapshot **must not be exported as-is through `orders/public-api.ts`**. Before a public payment-preparation capability is introduced, the contract must be normalized so the cross-context/persisted shape is stable-ID-only (or otherwise contains no internal DB identity), with explicit versioning/compatibility/recovery treatment. A local unpushed draft that attempted direct public export was rejected during this readiness refresh and is not part of `dev`.

### Confirmed-payment transaction finding

`createFromConfirmedPaymentSnapshot()` coordinates Points/Balance COMMIT, Coupon COMMIT, Order creation and the Terminal order's durable `order.accepted` lifecycle inside one Prisma transaction. This is a transaction-sensitive invariant, not ordinary import debt. Phase 6 must not split it merely to lower scanner counts, and must not expose a transaction client across contexts. A later slice may redesign it only with explicit atomicity/idempotency/recovery proof; otherwise a narrow scanner-protected seam may remain.

`ConfirmedPaymentOrderResult.internalOrderId` is also an internal DB identity and must be audited before any future public finalization contract is created.

### Execution sequence after Slice 1

1. **Payment Preparation Contract Normalization Readiness** — define the minimal immutable business facts that must cross Orders -> Payment orchestration/persistence, normalize `storeStableId`, eliminate internal `userId` leakage, and define snapshot version/compatibility/recovery. If schema/migration is required, obtain separate migration authorization first.
2. **Stable-ID-only Prepared-Payment Boundary** — only after normalization, add the narrow Orders public preparation capability and architecture regression guard.
3. **POS realtime/device capability contraction** — move `PosGateway`/socket/device implementation knowledge behind a POS-owned neutral status capability where an existing public boundary is insufficient.
4. **Auth/POS transport and composition contraction** — separate legitimate Nest composition from business-capability leakage; do not manufacture facades around legal composition.
5. **Confirmed-payment transaction seam decision** — independently decide whether the atomic COMMIT + Order creation seam can be safely moved; preserve it if no better design proves equivalent invariants.
6. **Payments orchestration composition cleanup** — contract meaningless concrete module coupling after Orders/POS/Auth boundaries stabilize.
7. **Clover provider/internal cleanup** — keep execution/canonical gateways, raw mappers, OAuth/merchant credentials and provider wire contracts inside Payments infrastructure. Retired SNS/SQS must not be reintroduced; AWS SMS/Email remain separate supported capabilities.
8. **Web Clover cutover readiness audit** — default read-only/high-risk audit of production checkout, immutable snapshot, tender allocation, surcharge, provider confirmation, reconciliation, refunds, recovery/idempotency and wallet/Hosted iFrame compatibility.
9. **Web Unified Payment Core migration / legacy cleanup** — only after readiness PASS, using additive implementation, controlled activation, rollback, active production verification, observation, then compatibility cleanup.

### Dependency priorities and exit criteria

After Slice 1, Payments/Clover direct debt is **54** with `commerce-orders-fulfillment = 5`, `identity-customer-benefits = 13`, `store-operations-pos-print = 11`, `architecture-foundation = 15`, `runtime-data-ci-ops = 8`, and `messaging-notifications = 2`. These counts are contraction signals, not mechanical zero targets.

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

## Verification state

Slice 1 is merged and CI-green through PR #2231 / CI #5318. No standalone production active-test cycle is required for this ordinary modularization slice under the current Phase-level cadence; affected payment/refund behavior remains part of Phase 6 closeout verification.

The refreshed readiness baseline is consolidated into the `Readiness Audit / Execution Baseline` section above and remains binding for subsequent work, especially the prepared-payment identity boundary and confirmed-payment transaction seam.

## Remaining Phase 6 work

The next implementation candidate is **Payment Preparation Contract Normalization Readiness**. The current `PreparedPaymentOrderSnapshot` must not simply be exported through `orders/public-api.ts` because it carries internal `userId` DB identity across the Orders -> Payment orchestration/persistence boundary. First define a stable-ID-only prepared-payment contract and compatibility/recovery strategy; only then establish a public preparation capability.

Do not automatically contract the retained confirmed-payment transaction seam or production Web Clover compatibility path. Benefits Tender/Coupon COMMIT + Order creation remains a transaction-sensitive atomicity boundary, and production Web Clover remains protected under the existing critical-path rules.
