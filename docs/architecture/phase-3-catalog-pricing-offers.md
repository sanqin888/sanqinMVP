# Phase 3 — Catalog / Pricing / Offers

Start date: 2026-09-03  
Slice 1 base: `origin/dev@e69b913d`

## Goal

Phase 3 establishes Catalog / Pricing / Offers as an enforceable L2 business
boundary. Catalog owns current menu/configuration facts, Pricing owns price and
promotion calculation, and Benefits owns customer-held entitlements. Orders,
Admin, Loyalty and other contexts must consume those capabilities through public
contracts instead of importing Pricing internals.

The phase does not change production Web Clover behavior by default, historical
Uber sandbox compatibility, or provider wire behavior unless a later slice is
separately justified and verified. POS Clover Terminal is no longer structurally
frozen: pre-production Terminal modularization may proceed when it does not alter
live Web Ecommerce behavior. If production Web Clover becomes a critical
modularization blocker, the guarded-production exception in `AGENTS.md` and the
Payments charter applies, including post-deployment active payment verification.

## Pre-Phase-3 Uber boundary verification baseline

Status: **PRODUCTION VERIFIED on 2026-09-03**.

The Uber structural work merged immediately before Phase 3 is now fully closed by
active verification rather than CI evidence alone:

- PR #2130 / `32d3925f`: Store Policy ownership contraction. Uber order admission
  consumes store auto-accept/allergen policy through the Brand/Store public query
  boundary instead of persistence-adapter policy methods.
- PR #2131 / `4b615f49`: explicit store identity naming. SanQ store context is
  `storeStableId`, Uber provider identity is `uberStoreId`, and the two identity
  spaces remain distinct across application/persistence boundaries.
- PR #2132 / `0c0a678e`: Orders ingestion public boundary. Uber consumes
  `ORDER_INGESTION` instead of concrete `OrderIngestionService`; the existing
  same-transaction callback for Uber action/cancellation persistence remains
  intact. This contraction lowered `external-channels ->
  commerce-orders-fulfillment` from 5 to 1.

Active verification covered auto-accept enabled, auto-accept disabled with manual
acceptance, immediate order lifecycle, Uber cancel/refund, and scheduled-order
activation. The scheduled order left the scheduled queue at preparation time,
entered active preparation, generated one print job, and received both kitchen
and customer print ACKs. Three test orders persisted with
`Order.storeId = 4750_Yonge_Street`; no duplicate ingestion or new default/provider
UUID store identity was observed, first-attempt webhook processing succeeded, and
worker error/warn/failure scans were clean.

The allergen DENY_LIST scenario is **N/A due to Uber Test Store sandbox
limitations**: its customer flow does not provide an allergen-entry control. This
is recorded as an untestable sandbox case, not a failed verification.

PR #2134 / `e69b913d` subsequently fixed the Admin pending-order display contract:
`orderStableId` and `totalCents` are again exposed, `pickupCode` was added for a
human-readable operator identifier, and the Web table truncates the two long IDs.
Its CI is green; production UI re-verification is intentionally left pending until
the next deployment.

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

## Slice 2 — Offers / Benefits ownership normalization

Status: **implemented in Slice 2**.

The target ownership remains:

- Offers: CouponTemplate/CouponProgram definitions, use rules, stacking rules and
  program configuration.
- Benefits: eligibility, claim, issue, trigger, UserCoupon entitlement, reserve,
  commit and release.
- Pricing: receives an already validated coupon candidate and calculates the
  monetary result.

This slice establishes that ownership at the public/module boundary without
mechanically relocating the legacy Prisma/Messaging implementations and thereby
raising other architecture debt allowances:

- added `apps/api/src/benefits` as an explicit Identity / Customer / Benefits owner
  root;
- added Benefits-owned claim, trigger and admin-issuance contracts/tokens with
  stableId-based inputs instead of Prisma `User` leakage;
- kept composition explicit without adding a pass-through Benefits facade: the
  legacy `CouponsModule` is now non-global and imported only through its public
  surface while Benefits owns the stable contracts/tokens;
- stopped exporting concrete claim/eligibility/issuer/trigger services from the
  legacy module;
- Auth, Loyalty, Membership, Promotions and Admin now consume only Benefits public
  capabilities for customer-held coupon behavior;
- CouponTemplate/CouponProgram validation and CRUD now sit behind the Offers public
  capability, leaving `AdminCouponsService` as a thin authenticated management
  facade instead of a second persistence owner;
- moved Admin `ADMIN_PUSH` user lookup and entitlement issuance out of
  `AdminCouponsService` into the Benefits capability;
- removed the final `identity-customer-benefits -> catalog-pricing-offers` direct
  import allowance, contracting that measured debt from 7 to 0, and removed two
  Admin Prisma imports so `identity-customer-benefits -> runtime-data-ci-ops`
  contracts from 23 to 21.

The legacy implementation files remain under `apps/api/src/coupons` temporarily
because they still combine Prisma persistence and direct Messaging delivery. A
physical move before those dependencies are separately contracted would only
move debt between contexts and require raising baseline limits. The later
Offers -> Messaging slice remains the next prerequisite for relocating trigger
implementation cleanly.

The Payments-facing coupon HOLD/COMMIT/RELEASE path remains unchanged in this
slice. The Clover compatibility entries are now governed separately: POS Terminal
is active pre-production work, while Web Ecommerce is guarded production and may
only be changed when it is a documented critical modularization blocker with the
required active verification gate.

## Slice 2B — POS Payment Benefits reservation boundary contraction

Status: **LOCAL implementation complete, pending review/CI**.  
Base: `origin/dev@4fc982cd` (2026-09-03).

This follow-up contracts only the Unified Payment preparation HOLD/RELEASE boundary;
it does not move the transaction-bound COMMIT path:

- Benefits now owns two narrow payment-reservation ports: one for Points/Stored
  Balance HOLD/RELEASE and one for Coupon HOLD/RELEASE. The contracts expose only
  payment/business facts (`attemptId`, `userStableId`, benefit selections, cents and
  `expiresAt`) and return no Prisma reservation/user IDs.
- `LoyaltyService` and `MembershipService` remain the current implementations but
  implement those Benefits-owned ports. A Benefits public composition module aliases
  the tokens to the existing providers without creating another pass-through facade.
- `PaymentCheckoutAttemptService` no longer imports/injects concrete `LoyaltyService`
  or `MembershipService`. Coupon HOLD also stops receiving the snapshot's internal
  User DB UUID; Benefits resolves the user internally from `userStableId`.
- `PosCardPaymentOrchestrationModule` now imports the Benefits reservation
  composition surface rather than wiring `LoyaltyModule` and `MembershipModule`
  directly.
- Existing payment-preparation behavior stays in the same order:
  `PREPARING -> HOLD tender -> HOLD coupon -> PREPARED`; partial HOLD failure,
  expired pre-provider preparation, cancel-before-provider and definitive provider
  failure still release reservations, while `UNKNOWN` / `RECONCILING` remain held
  and duplicate preparation continues to reuse the persisted immutable snapshot.
- Four production deep imports are removed, contracting
  `payments-clover -> identity-customer-benefits` direct-import debt from 17 to 13.
  The baseline is lowered in the same slice and both the central scanner and Payments
  architecture test guard the migrated payment-preparation consumers against
  regressing to Loyalty/Membership internals.
- Production Web Clover Ecommerce, Web checkout/surcharge/reconciliation/refund,
  payment traffic cutover, feature flags, Prisma schema and migrations are unchanged.

The existing COMMIT sequence is deliberately retained inside
`OrdersService.createFromConfirmedPaymentSnapshot()` so Points/Balance COMMIT,
Coupon COMMIT and Order creation remain in one Prisma transaction. That remaining
cross-context transaction boundary is Slice 2C work only if a contract can preserve
atomicity without exposing `Prisma.TransactionClient` as an ordinary public contract
or moving Benefits persistence ownership into Orders.

## Remaining Phase 3 work

### Slice 2C — transaction-bound Benefits COMMIT contraction

Design the safe follow-up for `commitPaymentTenderForOrder()` and
`commitPaymentCouponsForOrder()` while preserving the current single-transaction
Order finalization invariant. Do not implement a separate Benefits transaction or
move Benefits persistence into Orders merely to reduce import counts.

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
- Payments/Clover is no longer a whole-context frozen zone. POS Clover Terminal
  may be modularized as pre-production work when isolated from live Web Ecommerce.
  Production Web Clover remains guarded and is not a routine Phase 3 cleanup
  target; touch it only when it is a documented critical blocker and then apply
  the required post-deployment active payment verification gate.

## Progress-recording rule from 2026-09-03

A central chronological index now lives at
`docs/architecture/modularization-worklog.md`. Starting with the next Phase 3 code
slice, each implementation batch must update this phase document, the current
dependency graph, and exactly one worklog entry in the same local change. Later CI,
deployment, or active-verification evidence updates the same worklog entry instead
of creating a duplicate implementation record. This documentation rule does not
change the Phase 3 dependency baseline by itself.
