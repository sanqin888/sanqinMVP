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

The legacy implementation files remain under `apps/api/src/coupons` temporarily.
Slice 2 deliberately did not move them while Prisma persistence and direct Messaging
delivery were still combined, because that would only have moved debt between
contexts and raised baseline limits. Slice 4 now satisfies the Messaging-boundary
prerequisite; physical relocation of the remaining persistence implementation is a
separate ownership move and is not bundled into this boundary-only slice.

The Payments-facing coupon HOLD/COMMIT/RELEASE path remains unchanged in this
slice. The Clover compatibility entries are now governed separately: POS Terminal
is active pre-production work, while Web Ecommerce is guarded production and may
only be changed when it is a documented critical modularization blocker with the
required active verification gate.

## Slice 2B — POS Payment Benefits reservation boundary contraction

Status: **MERGED** via PR #2139 / `6a022c8c` on 2026-09-03.  
Implementation base: `origin/dev@4fc982cd`. CI architecture, lint, build,
declaration and test gates passed before merge.

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

## Slice 2C — transaction-bound Benefits COMMIT contraction

Status: **DEFERRED after readiness audit (2026-09-03)**.

The audit confirmed that `commitPaymentTenderForOrder()`,
`commitPaymentCouponsForOrder()` and `Order.create()` currently participate in the
same Prisma transaction owned by `OrdersService.createFromConfirmedPaymentSnapshot()`.
The Loyalty COMMIT also locks the reservation/account and writes ledger/account
state inside that transaction. A normal Benefits facade or a separate Benefits
transaction would weaken the atomic invariant, while publishing
`Prisma.TransactionClient` as an ordinary cross-context public contract would
violate the current architecture rules.

The audit also found that `OrdersService` still has many other concrete
Loyalty/Membership calls, so replacing only these two COMMIT calls would not
meaningfully contract `commerce-orders-fulfillment -> identity-customer-benefits`.
Slice 2C is therefore not an implementation blocker and remains deferred until a
safe transaction-scoped capability/Unit-of-Work design can preserve atomicity
without moving Benefits persistence ownership into Orders.

## Slice 3 — Admin Catalog ownership contraction

Status: **MERGED** via PR #2141 / merge `a29aae1d` on 2026-09-03.  
Reviewed PR head `0fb3db83`; Web/API GitHub Actions completed successfully before
merge.

This slice moves the Admin menu management owner from the Admin adapter into the
Catalog context without changing Admin HTTP routes or menu persistence semantics:

- added Catalog-owned `CatalogAdminService` under `apps/api/src/menu` for Admin
  full-menu reads, categories, packaging, menu items/fixed-component validation,
  option-group templates/options/bindings and daily-special management;
- added `menu/public-api.ts` and exports the Catalog management capability through
  the existing `PublicMenuModule` composition surface;
- `AdminMenuController` now delegates ordinary menu management directly to the
  Catalog public use case; `AdminMenuModule` no longer provides `PrismaService` or
  imports Brand/Store configuration for menu business logic;
- deleted the legacy `AdminMenuService`, so there is no duplicate active menu
  persistence/validation implementation under the Identity/Admin context;
- retained a narrow `AdminMenuAvailabilityOrchestrationService` only for the three
  existing Uber side-effect paths: availability-affecting `updateItem`, explicit
  item availability, and option availability. Catalog performs the persistence
  and effective-availability decision first; Admin then invokes only the Uber
  public availability port and preserves the existing HTTP response behavior;
- moved the existing characterization coverage so Catalog rules remain tested and
  added coverage that ordinary item updates do not trigger Uber while availability
  changes still do;
- added a central architecture guard that requires Admin menu to consume
  `menu/public-api.ts`, forbids direct Prisma ownership from returning under
  `apps/api/src/admin/menu/**`, keeps Uber provider coordination out of
  `CatalogAdminService`, and prevents the retired `AdminMenuService` from returning;
- removing the old Admin service/module Prisma imports lowers
  `identity-customer-benefits -> runtime-data-ci-ops` from 21 to 19. The new
  Catalog persistence import is balanced by removing the redundant local
  `PrismaService` provider/import from `PromotionsModule`, so
  `catalog-pricing-offers -> runtime-data-ci-ops` remains 10 and no baseline is
  increased.

No Prisma schema/migration, Web route, production Web Clover behavior or Uber wire
contract changes are part of Slice 3.

## Remaining Phase 3 work

### Slice 4 — Offers -> Messaging boundary

Status: **MERGED / CI GREEN** via PR #2142 / `3629bc3b` on 2026-09-03.  
Web/API GitHub Actions completed successfully for the merged change.

This slice contracts the two remaining direct Catalog/Pricing/Offers ->
Messaging/Notifications imports without changing coupon eligibility, issuance,
notification timing, template selection, provider execution, HTTP behavior, Prisma
schema, Web Clover or Uber behavior:

- Messaging now exposes `notifications/public-api.ts` with the narrow
  `COUPON_ISSUED_NOTIFICATION` capability and contract instead of requiring Offers
  to inject the concrete `NotificationService`.
- `CouponProgramTriggerService` injects the Messaging-owned port and maps the
  existing Prisma User/CouponProgram records once into an explicit notification
  snapshot. Only `userStableId` crosses as user identity; the full Prisma models and
  User DB UUID no longer cross the Offers -> Messaging boundary.
- `NotificationService` implements that port and preserves the existing gift title,
  locale, template, `MessagingSend.userId`, metadata and email-provider behavior.
  `EmailService` resolves the existing internal `MessagingSend.userId` relation from
  `userStableId` inside the Messaging persistence boundary, while its legacy
  `userId` input remains available to untouched Messaging callers in this slice.
- `CouponsModule` imports `NotificationModule` only through the Messaging public
  surface. Existing non-Offers callers of `NotificationService` are intentionally
  outside this slice and remain later Messaging-boundary debt.
- Characterization coverage now checks both the Offers-side snapshot mapping and
  the Messaging-side preservation of the DB audit link / trigger metadata.
- The architecture baseline removes the
  `catalog-pricing-offers -> messaging-notifications` direct-import allowance,
  contracting that measured debt from `2 -> 0`. Any future deep import in that
  direction is therefore a new-edge CI failure; public `public-api/contracts/ports`
  traffic remains allowed.

Local lint/build/test commands are intentionally not run before review under the
repository workflow. Remote GitHub Actions is the validation gate after approval.

### Slice 5 — Catalog availability / Uber orchestration contraction

Status: **PRODUCTION VERIFIED**.  
Implementation: PR #2145 / `6438f934`; Web verification fix PR #2148 / merge `bf82d40d`.

This slice completes the temporary availability/provider boundary left by Slice 3
without changing Catalog availability semantics or Uber wire behavior:

- deleted the Admin-owned `AdminMenuAvailabilityOrchestrationService`; Admin menu
  now consumes a public application orchestration surface and no longer wires
  `UberEatsModule` directly;
- added a Catalog-owned availability reader contract/module. Menu-item publication
  intent, effective suspend-until inputs and fixed-component composition facts are
  projected from Catalog persistence through `menu/public-api.ts`;
- Uber availability composition now adapts the Catalog public availability reader
  into a narrow Uber application query port. `UberMenuAvailabilityPrismaAdapter` no
  longer reads `MenuItem` or `MenuOptionTemplateChoice` Prisma delegates and remains
  DB-only for Uber-owned store mapping and OpsTicket persistence;
- moved the fixed-component / `publishToUberEats` provider-capability guard out of
  `CatalogAdminService` and into the cross-context Catalog/Uber orchestration layer,
  so current Uber limitations no longer become Catalog invariants;
- preserved the existing mutation order and failure semantics: Catalog persists
  first, Uber sync is best-effort, availability-affecting `updateItem` fields alone
  trigger item sync, option availability still syncs through the Uber public port,
  and Admin response stores continue to expose compatibility `storeId` values;
- aligned the Admin Web availability status type with the existing public contract by
  using `SYNC_REQUESTED` instead of the stale internal `PENDING` label;
- strengthened the central architecture scanner so the deleted Admin orchestration
  cannot return, Admin menu cannot wire Uber directly, Catalog management cannot
  regain the fixed-component provider policy, and the Uber availability persistence
  adapter cannot regain direct Catalog Prisma reads.

Removing the old Admin logger dependency and direct `UberEatsModule` wiring lowers
`identity-customer-benefits -> architecture-foundation` from 14 to 13 and
`identity-customer-benefits -> external-channels` from 2 to 1. Replacement
cross-context traffic uses public surfaces, so no new debt pair is introduced. No
Prisma schema/migration, production Web Clover,
Uber webhook/order state, full-menu publication protocol, or external wire contract
is changed. Because this changes the active Uber operational availability path, the
slice remains subject to the per-slice production verification gate after CI/deploy.

Active verification on 2026-09-03 confirmed item permanent OFF/ON, temporary-today
availability sync and option OFF/ON against the Uber sandbox with HTTP 204 / SYNCED
telemetry and no new OpsTicket. The ordinary item-edit check exposed one Web adapter
tail: `handleSaveItem` still serialized the unchanged `isAvailable` value, so PR #2148
removed availability fields from the ordinary item PUT payload and added a Web
regression test. After deployment and a hard refresh, the final 2026-09-04 verification
recorded ordinary item PUTs at 00:11:00 and 00:11:05 Toronto with HTTP 200 and **zero**
`uber.menu.item.availability.update` calls in the surrounding 00:10:30–00:11:30 window.
Slice 5 is therefore production verified.

### Slice 5B — Daily Special -> Offers ownership contraction

Status: **PR #2153 OPEN / CI PENDING**.  
Branch: `refactor/phase3-slice5b-daily-special-offers`; reviewed source commit `848a23eb`.

This slice contracts the remaining half-migrated Daily Special ownership without
renaming persistence or changing public transport contracts:

- added the narrow Offers capability `DAILY_SPECIAL_OFFERS`; existing Offers core
  `PromotionsService` now implements it and remains the sole production owner of
  `MenuDailySpecial` Prisma reads/writes, store-time activation and special-price
  calculation, avoiding any new Prisma dependency edge;
- removed Daily Special persistence/policy from `CatalogAdminService`. Catalog now
  exposes only item stable-ID/base-price snapshots needed to validate or price an
  Offers definition; Admin reads may explicitly include soft-deleted items to preserve
  historical Daily Special display, while writes still validate only live items;
- added explicit `CatalogOffersMenuOrchestrationService` composition for Admin full
  menu plus Daily Special list/bulk-write routes. Existing Admin HTTP paths, body
  shapes and response DTOs remain unchanged;
- Public Menu and Orders no longer read `menuDailySpecial` directly. They pass their
  existing Catalog item/base-price facts to the Offers capability and consume the
  returned active/effective-price DTOs;
- split the reusable Catalog owner provider into `CatalogAdminModule`, allowing the
  Uber availability worker composition to keep its narrow Catalog dependency without
  inheriting HTTP-side Daily Special/StoreConfig wiring;
- tightened the architecture scanner so `MenuDailySpecial` Prisma access outside the
  Offers service, Daily Special policy returning to Catalog, or direct persistence
  returning to Public Menu/Orders fails CI.

No Prisma schema/migration, Admin/Web contract, Daily Special pricing rule, production
Web Clover path, or Uber wire/runtime behavior is intentionally changed. Dependency
traffic added by this slice uses owner `public-api`/application composition surfaces,
so the direct cross-context debt counts are expected to remain unchanged; GitHub
Actions is the authoritative graph/test gate after review.

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
