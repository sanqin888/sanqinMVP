# Current 12-context dependency graph

Phase 2 Brand/Store start base: `origin/dev@7912deec` (2026-08-30).

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
| store-operations-pos-print | architecture-foundation 7; brand-store 2; commerce-orders-fulfillment 10; external-channels 1; identity-customer-benefits 14; runtime-data-ci-ops 10 |
| external-channels | architecture-foundation 11; commerce-orders-fulfillment 5; identity-customer-benefits 6; messaging-notifications 2; runtime-data-ci-ops 24 |
| messaging-notifications | architecture-foundation 5; runtime-data-ci-ops 11; store-operations-pos-print 1 |
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
- The architecture scanner protects the new public surface from cross-context
  deep imports and prevents the canonical reader from regressing to the legacy
  `BusinessConfig` delegate.
- Legacy `apps/api/src/admin/**` classification is intentionally unchanged in
  this slice. Admin business/config routes still mix authentication adapters and
  legacy writers; their more specific Brand/Store ownership should be registered
  when that writer boundary is migrated, rather than reclassifying existing
  direct-import debt without changing the implementation.

## Carried debt outside this closeout

- `web.api-envelope-direct-payload.v1` remains active because Checkout has six
  legacy browser fetches and POS session/login has five. Their allowances are
  frozen at the current counts and must fall to zero in dedicated risk-scoped
  slices; the canonical clients themselves already require the strict global
  envelope.
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
