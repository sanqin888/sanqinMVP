# Phase 3 — Catalog / Pricing / Offers

Start date: 2026-09-03  
Slice 1 base: `origin/dev@e69b913d`

## Goal

Phase 3 establishes Catalog / Pricing / Offers as an enforceable L2 business
boundary. Catalog owns current menu/configuration facts, Pricing owns price and
promotion calculation, and Benefits owns customer-held entitlements. Orders,
Admin, Loyalty and other contexts must consume those capabilities through public
contracts instead of importing Pricing internals.

The phase does not change frozen Payments/Clover traffic, historical Uber sandbox
compatibility, or provider wire behavior unless a later slice is separately
approved and verified.

## Slice 1 — Pricing public boundary contraction

Status: **source implementation included in Slice 1**.

This slice is an internal atomic boundary change. It does not change database
schema, HTTP contracts, promotion algorithms, order pricing semantics or payment
flows.

Changes:

- Added `promotions/promotion-context.contract.ts` with
  `PROMOTION_CONTEXT_READER` and the narrow `PromotionContextReaderPort`.
- `PromotionsService` implements that port. Its cross-boundary channel contract
  uses `@shared/order` rather than a Prisma-generated enum.
- `promotions/public-api.ts` now exposes the Pricing capabilities currently
  required outside the context: order promotion evaluation/types, coupon
  candidate shape, loyalty multiplier interpretation, daily-special helpers,
  the promotion-context reader, and `PromotionsModule` for Nest wiring.
- `OrdersService` no longer imports `coupon-promotion.adapter`,
  `order-promotion-evaluator`, `promotion-engine`, or `PromotionsService`
  directly. It injects `PROMOTION_CONTEXT_READER` and imports Pricing policy only
  through `promotions/public-api.ts`.
- `OrdersModule`, Loyalty promotion consumers, and Admin Promotions wiring now
  use `promotions/public-api.ts`.
- Architecture debt is contracted in the same slice:
  `commerce-orders-fulfillment -> catalog-pricing-offers` goes from 5 direct
  imports to 0, while `identity-customer-benefits -> catalog-pricing-offers`
  goes from 10 to 7. Removing the Commerce -> Catalog allowance means a new
  non-public import in that direction fails the central architecture scanner.

## Remaining Phase 3 work

### Slice 2 — Offers / Benefits ownership normalization

Separate coupon-program definition from customer-held entitlement behavior.
Target ownership:

- Offers: CouponTemplate/CouponProgram definitions, use rules, stacking rules and
  program configuration.
- Benefits: eligibility, claim, issue, trigger, UserCoupon entitlement, reserve,
  commit and release.
- Pricing: receives an already validated coupon candidate and calculates the
  monetary result.

Do not move the Payments-facing coupon HOLD/COMMIT/RELEASE path merely to tidy
files while the two Clover compatibility entries remain externally frozen.

### Slice 3 — Admin Catalog ownership contraction

Move Menu CRUD/application decisions out of `AdminMenuService` into Catalog-owned
use cases. Admin remains an authenticated transport/management adapter.

### Slice 4 — Offers -> Messaging boundary

Coupon issuance/trigger behavior must request Messaging through a public
capability instead of directly importing `NotificationService`.

### Slice 5 — Catalog availability / Uber orchestration contraction

Separate Catalog availability persistence from the Uber provider sync side
effect. Because this touches the active Uber operational path, it requires the
existing per-slice production verification gate.

### Slice 6 — Phase 3 closeout

Refresh the dependency graph and compatibility records, verify no new direct
context pairs or cycles were introduced, and document the next phase boundary.

## Deferred items that are not Slice 1 scope

- Phase 2 left one small `brand-store -> store-operations-pos-print` reverse
  import because `StoreStatusService` reads the POS-owned auto-pause reason
  parser. Move that persistence encoding back to Brand/Store in a later small
  contraction after the recent POS pause/resume and Uber status changes have had
  sufficient separation from this slice.
- Historical Uber sandbox compatibility still carries
  `@compat brand-store.default-store-identity.v1` annotations even though the
  registry entry is closed. Keep them until Uber Production Cutover Cleanup.
  After that cleanup, delete the compatibility code/annotations together and
  tighten the central scanner so a closed compat ID cannot remain in production
  source.
- Payments/Clover compatibility remains frozen and is not a Phase 3 cleanup
  target.
