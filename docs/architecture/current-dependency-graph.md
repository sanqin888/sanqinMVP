# Current 12-context dependency graph

Phase 2 POS Brand/Store read cutover base: `origin/dev@6fb7d951` (2026-08-31).

This snapshot records the **remaining direct cross-context import debt** enforced
by `tools/architecture/context-baseline.json` after the Phase 1 modularization
slices. Test files and registered composition roots are excluded. Imports through
`public-api`, `contracts`, `ports`, `@shared/foundation`, `@shared/menu`, or
`@shared/order` are approved public-contract traffic and do not consume the debt
counts below.

The CI architecture scanner is authoritative for the exact source scan. This
file is the human-readable closeout snapshot and must be refreshed again at the
end of the next phase.

## Context map

| # | Context | Current paths |
|---:|---|---|
| 1 | architecture-foundation | `apps/api/src/common`, `libs/foundation` (`@shared/foundation`) |
| 2 | brand-store | `homepage`, `location`, `store` |
| 3 | catalog-pricing-offers | `application/menu`, `coupons`, `menu`, `promotions`, `libs/shared` |
| 4 | identity-customer-benefits | `admin`, `auth`, `loyalty`, `membership`, `phone-verification` |
| 5 | commerce-orders-fulfillment | `deliveries`, `orders`, `libs/order` |
| 6 | payments-clover | `clover`, `orchestration`, `payments` |
| 7 | store-operations-pos-print | `pos`, `tools/printer-server` |
| 8 | external-channels | `integrations` |
| 9 | messaging-notifications | `email`, `messaging`, `notifications`, `sms` |
| 10 | accounting-reporting-analytics | `accounting`, `analytics`, `reports` |
| 11 | web-pwa | `apps/web/src` |
| 12 | runtime-data-ci-ops | Prisma, data retention, CI, ops and architecture tooling |

## Remaining direct-import debt

Counts are production import-statement occurrences. Absence from the table means
there is no recorded direct-import allowance for that source context; any new
pair fails CI.

| Source | Remaining direct targets |
|---|---|
| architecture-foundation | none |
| brand-store | accounting-reporting-analytics 2; architecture-foundation 2; runtime-data-ci-ops 4; store-operations-pos-print 1 |
| catalog-pricing-offers | architecture-foundation 2; identity-customer-benefits 3; messaging-notifications 2; runtime-data-ci-ops 10 |
| identity-customer-benefits | architecture-foundation 14; brand-store 4; catalog-pricing-offers 10; commerce-orders-fulfillment 1; external-channels 2; messaging-notifications 24; runtime-data-ci-ops 28; store-operations-pos-print 4 |
| commerce-orders-fulfillment | architecture-foundation 9; brand-store 2; catalog-pricing-offers 5; identity-customer-benefits 11; messaging-notifications 8; runtime-data-ci-ops 14; store-operations-pos-print 6 |
| payments-clover | architecture-foundation 15; commerce-orders-fulfillment 10; identity-customer-benefits 17; messaging-notifications 3; runtime-data-ci-ops 8; store-operations-pos-print 11 |
| store-operations-pos-print | architecture-foundation 7; brand-store 2; commerce-orders-fulfillment 10; external-channels 1; identity-customer-benefits 14; runtime-data-ci-ops 8 |
| external-channels | architecture-foundation 11; commerce-orders-fulfillment 5; identity-customer-benefits 6; messaging-notifications 2; runtime-data-ci-ops 24 |
| messaging-notifications | architecture-foundation 5; runtime-data-ci-ops 10; store-operations-pos-print 1 |
| accounting-reporting-analytics | architecture-foundation 3; commerce-orders-fulfillment 1; external-channels 1; identity-customer-benefits 11; runtime-data-ci-ops 9 |
| web-pwa | none; cross-context shared contracts use registered public aliases |
| runtime-data-ci-ops | none; registered composition-root wiring is excluded |

## Phase 1 boundary changes reflected here

- `@shared/order` now owns Order contracts directly; `@shared/menu` no longer
  re-exports Order contracts.
- Daily-special policy now belongs to Promotions/Pricing instead of `common`.
- StableId validation primitives now live in neutral `@shared/foundation`; API
  `common` re-exports that implementation for existing server callers and Web
  imports the foundation package directly. Menu/Order packages no longer own or
  re-export those primitives.
- Web regular JSON transport is guarded separately: one browser client, one
  App Router BFF, and one server-side API helper; raw/direct fetch exceptions are
  explicit architecture allowances.
- Existing cycles remain migration debt for later phases. Phase 1 did not create
  a new direct context pair; CI rejects any such regression.

## Phase 2 Brand/Store boundary started

- `apps/api/src/store/public-api.ts` now defines the narrow canonical Brand/Store
  configuration read contract. It exposes stable store identity and canonical
  BrandConfig/StoreConfig facts, but not the Store database UUID and not Benefits
  policy fields that happen to be duplicated in `BrandConfig` during transition.
- `PrismaBrandStoreConfigReader` is the single registered Prisma reader for that
  snapshot. It reads `BrandConfig` plus `Store`/`StoreConfig`, fails closed when
  canonical rows are missing, and never creates fallback configuration.
- Configured store stable identity now belongs to the Brand/Store public surface
  as `resolveConfiguredStoreStableId()`. Existing Orders, Clover, POS, Admin and
  Uber callers were moved off `common/store-id.ts`, lowering direct
  architecture-foundation debt without changing the resolved store value.
- `StoreStatusService` is the first canonical consumer and no longer reads or
  creates `BusinessConfig`. BusinessHour/Holiday queries remain legacy global
  store-scope debt for a later schema-safe slice.
- Accounting, Promotions, PublicMenu, AdminMenu, and Orders now read store-local
  timezone through the canonical Store snapshot. Public/Admin menu reads no longer
  create a default `BusinessConfig` row as a side effect; Orders also no longer
  creates `BusinessConfig` while resolving pricing or daily-special time.
- POS exchange-rate configuration now uses the combined Brand/Store snapshot:
  `StoreConfig.timezone` controls the store clock and
  `BrandConfig.wechatAlipayExchangeRate` supplies the existing manual fallback.
  The POS exchange-rate module no longer imports Prisma directly, while the
  externally visible fallback source label remains unchanged for compatibility.
- POS StoreStatus/Connectivity reads now use the canonical Store snapshot as well:
  timed-pause status/timezone reads and the watchdog's recovery race re-check no
  longer query `BusinessConfig`, and the watchdog is architecture-gated against
  regressing to that delegate. POS pause/resume persistence intentionally remains
  a `BusinessConfig` compatibility write in this slice so the existing one-way
  trigger continues mirroring the same state into `StoreConfig` for canonical
  readers while legacy Admin/Uber readers are still being migrated.
- Messaging configuration now caches the canonical Brand/Store snapshot instead
  of a Prisma `BusinessConfig` model and no longer creates configuration on read.
  Brand support contact fields feed message templates, while Store name/address/
  phone feed invoice contact details so support and store-phone semantics are no
  longer conflated.
- `BrandStoreConfigModule` is exported through `store/public-api.ts`; its token,
  identity implementation, contract implementation, composition module, and
  Prisma reader stay owner-internal. Cross-context consumers wire the public
  module and inject the public reader token instead of deep-importing internals.
- The architecture scanner protects the new public surface from cross-context
  deep imports, prevents the canonical reader from regressing to the legacy
  `BusinessConfig` delegate, freezes migrated consumers against reintroducing
  direct `BusinessConfig` access, and can forbid consumer-specific legacy Prisma
  symbols after a service is fully de-Prisma'd.
- Legacy `apps/api/src/admin/**` classification is intentionally unchanged in
  this slice. Admin business/config routes still mix authentication adapters and
  legacy writers; their more specific Brand/Store ownership should be registered
  when that writer boundary is migrated, rather than reclassifying existing
  direct-import debt without changing the implementation.

## Phase 2 Benefits loyalty policy reader/writer boundary active

- `apps/api/src/loyalty/public-api.ts` exposes narrow `LOYALTY_POLICY_READER` and
  `LOYALTY_POLICY_WRITER` contracts owned by Identity/Customer/Benefits. Loyalty
  earn/redeem/referral rates, tier multipliers, and tier thresholds remain
  explicitly excluded from the Brand/Store public configuration contract even
  though transitional columns currently live in `BrandConfig`.
- Membership program rules, Admin member tier-progress thresholds, and all
  LoyaltyService policy reads use the Benefits snapshot backed by transitional
  `BrandConfig` columns. Transaction-bound reads remain inside their existing
  Prisma transaction through `getLoyaltyPolicySnapshotWithTx(tx)`.
- Admin Members policy saves now use `/admin/benefits/loyalty-policy`, whose
  Benefits-owned writer preserves the established rounding/non-negative rules,
  while tightening `redeemDollarPerPoint` to the existing business invariant
  `> 0`; it writes `BrandConfig` plus the `BusinessConfig` compatibility copy in one
  transaction. The compatibility copy is still required because the existing DB
  trigger is one-way (`BusinessConfig` -> canonical config); allowing it to become
  stale could revert Benefits values on a later unrelated legacy config write.
- The general Admin Settings page no longer declares or resubmits Loyalty policy
  fields. Legacy `PATCH /admin/business/config` and compatibility
  `PUT /admin/business/temporary-close` can still accept those fields only as
  explicitly annotated rollback compatibility surfaces; repository-wide Web code
  is now gated from combining either legacy route with a Loyalty policy field.
  New direct BusinessConfig Loyalty persistence consumers are also blocked outside
  the registered rollback writer and temporary Benefits dual-writer.
- Admin Members now reads editable settings from `GET /admin/benefits/loyalty-policy`
  through the Benefits settings reader, while POS payment reads the runtime policy
  from `GET /pos/loyalty-policy` through a POS adapter protected by the existing
  Session/Role/PosDevice guards. Both browser consumers use the centralized Web
  Loyalty API client rather than the legacy Admin Business response.
- Orders quote/create redemption conversion reads `redeemDollarPerPoint` through
  `LOYALTY_POLICY_READER`; the points/cents arithmetic remains characterized in an
  Orders-owned pure helper. Orders delivery pricing, sales tax, store coordinates,
  Uber Direct enablement, and daily-special store-local timezone now read through
  `BRAND_STORE_CONFIG_READER`; Orders no longer reads or creates `BusinessConfig`.
  The architecture scanner registers Orders as a migrated Brand/Store consumer and
  forbids reintroducing the `BusinessConfig` symbol or delegate there.
- `benefits.business-config-loyalty-policy.v1` records this transitional dual-write
  state. `docs/architecture/benefits-loyalty-policy-contraction-plan.md` now fixes
  the implementation order: business-day observation, Admin Business contract
  contraction, dedicated `LoyaltyProgramPolicy` expand/backfill, triple-write and
  shadow-read parity, dedicated read cutover, separate trigger Loyalty split,
  removal of BusinessConfig then BrandConfig dual-writes, and only then the final
  column contraction. Every Prisma/trigger migration remains separately authorized.

## Carried debt outside this closeout

- `web.api-envelope-direct-payload.v1` remains active only because Checkout still
  has six legacy browser fetches. POS session/login claim, login, auth/me,
  store-status and heartbeat calls now use the centralized POS session API adapter;
  their five direct-fetch allowances are removed and cannot return without failing
  the architecture scanner. The canonical clients continue to require the strict
  global envelope.
- Payments/Clover legacy paths remain frozen by their compatibility entries.
- Brand/Store configuration and implicit default-store identity are Phase 2 work.

## Reading the graph

- A count is debt, not permission to add more coupling.
- When a PR removes a direct import, lower/remove the matching baseline in the
  same PR so the dependency cannot return.
- New cross-context work must target the owner's `public-api`, `contracts`, or
  `ports` surface.
- Recompute this snapshot at every phase boundary; a new cycle, new direct pair,
  or ambiguous identity field blocks phase closure.
