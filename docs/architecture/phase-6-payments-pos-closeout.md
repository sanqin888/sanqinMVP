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

The refreshed readiness baseline is tracked in `docs/architecture/phase-6-readiness-audit-execution-baseline-2026-09-07.md`. That audit remains binding for subsequent work, especially the prepared-payment identity boundary and confirmed-payment transaction seam.

## Remaining Phase 6 work

The next implementation candidate is **Payment Preparation Contract Normalization Readiness**. The current `PreparedPaymentOrderSnapshot` must not simply be exported through `orders/public-api.ts` because it carries internal `userId` DB identity across the Orders -> Payment orchestration/persistence boundary. First define a stable-ID-only prepared-payment contract and compatibility/recovery strategy; only then establish a public preparation capability.

Do not automatically contract the retained confirmed-payment transaction seam or production Web Clover compatibility path. Benefits Tender/Coupon COMMIT + Order creation remains a transaction-sensitive atomicity boundary, and production Web Clover remains protected under the existing critical-path rules.
