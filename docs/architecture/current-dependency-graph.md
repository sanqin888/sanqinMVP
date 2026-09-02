# Current 12-context dependency graph

Phase 2 Admin Brand/Store + POS-device identity cutover base: `origin/dev@443b1a5c` (2026-08-31).

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
| identity-customer-benefits | architecture-foundation 14; brand-store 4; catalog-pricing-offers 10; commerce-orders-fulfillment 1; external-channels 2; messaging-notifications 24; runtime-data-ci-ops 23; store-operations-pos-print 4 |
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
- `StoreStatusService` no longer reads or creates `BusinessConfig`. Store schedule
  reads now go through the Brand/Store-owned `STORE_SCHEDULE_READER`, with
  `storeStableId` resolved to `storeDbId` only inside the Prisma adapter. The
  BusinessHour/Holiday hard-coded store UUID defaults are removed by the
  store-scope migration, and BusinessHour uniqueness is scoped to
  `(storeDbId, weekday)` instead of weekday globally.
- Accounting, Promotions, PublicMenu, AdminMenu, and Orders now read store-local
  timezone through the canonical Store snapshot. Public/Admin menu reads no longer
  create a default `BusinessConfig` row as a side effect; Orders also no longer
  creates `BusinessConfig` while resolving pricing or daily-special time.
- POS exchange-rate configuration now uses the combined Brand/Store snapshot:
  `StoreConfig.timezone` controls the store clock and
  `BrandConfig.wechatAlipayExchangeRate` supplies the existing manual fallback.
  The POS exchange-rate module no longer imports Prisma directly, while the
  externally visible fallback source label remains unchanged for compatibility.
- POS StoreStatus/Connectivity now uses the canonical Brand/Store boundary for both
  reads and writes. Timed-pause status/timezone reads, manual pause/resume, and the
  watchdog's recovery race re-check no longer query or mutate `BusinessConfig`.
  The guarded POS StoreStatus transport now carries its authenticated device
  `storeStableId` through reads, pause/resume writes, and timed-pause
  compare-and-set reconciliation instead of letting the Brand/Store owner infer a
  configured store. The deployment-scoped connectivity watchdog resolves its
  configured `storeStableId` once, scopes ACTIVE POS-device heartbeats to that
  Store relation, and passes the same explicit identity through StoreStatus and
  pause reconciliation. The public `/public/store-status` route keeps its existing
  deployment-store behavior but resolves that identity at the transport boundary.
  The timed auto-resume compare-and-set remains inside the Brand/Store writer so
  an outdated expiry task cannot clear a newer pause; each store CAS updates only
  its canonical StoreConfig because the former singleton BusinessConfig mirror has
  been fully removed. POS is architecture-gated against regressing to Prisma
  configuration delegates or implicit store selection.
- POS Orders and Daily Summary browser timezone context now comes from the guarded
  `/pos/store-context` adapter. `PosDeviceGuard` supplies the authenticated device
  `storeStableId`, and the adapter requests that exact Store snapshot through
  `BRAND_STORE_CONFIG_READER`; the POS browser no longer uses the implicit
  `/staff/store/config` fallback for its own store context.
- Orders historical NULL-store compatibility is contracted in the current batch after
  direct production verification found `Order.storeId IS NULL = 0`. Store-scoped Orders
  and scheduled queries now match only the explicit canonical `storeStableId`; scheduled
  preparation no longer admits a NULL store row. Accepted, reprint, and amendment print
  dispatch now fail closed with a structured missing-store error instead of routing an
  unscoped order to `resolveConfiguredStoreStableId()`. Architecture scanning registers
  the affected Orders paths and rejects those NULL/configured-store fallbacks returning.
- Admin Business compatibility routes now follow the owner boundaries for both reads
  and writes. Canonical staff Web Store consumers require an explicit `storeStableId`
  and use `/staff/stores/:storeStableId/*` adapters backed by
  `BRAND_STORE_CONFIG_READER/WRITER` and the Store schedule ports. The selector writes
  a valid `?store=` context before Store settings load; singular `/staff/store/*` and
  `/admin/business/*` remain compatibility-only transport paths.
  Admin no longer writes `BusinessConfig`, `BrandConfig`, `StoreConfig`,
  `BusinessHour`, or `Holiday` through Prisma directly. The Brand/Store owner writer
  now writes only canonical `BrandConfig`/`StoreConfig` rows. Mirror-off production
  verification and the fail-closed destructive contraction are complete: the Prisma
  `BusinessConfig` model, physical table, sync trigger, and sync function are gone.
- Uber menu schedule/tax and store-status source reads now cross the Brand/Store
  boundary through an Uber application-owned `UBER_STORE_CONFIG_QUERY` port. The
  sole Uber composition root wires that port to `BRAND_STORE_CONFIG_READER` for
  both HTTP and dedicated-worker runtimes; Uber persistence no longer reads or
  creates `BusinessConfig`. Active Uber admin/source labels now identify
  `StoreConfig` as the canonical timezone/tax source; provider wire behavior is unchanged.
  Uber architecture CI now rejects any production `.businessConfig` regression.
- Messaging configuration now caches the canonical Brand/Store snapshot instead
  of a Prisma `BusinessConfig` model and no longer creates configuration on read.
  Brand support contact fields feed message templates, while Store name/address/
  phone feed invoice contact details so support and store-phone semantics are no
  longer conflated.
- `BrandStoreConfigModule` is exported through `store/public-api.ts`; its reader
  and writer tokens, identity/contract implementation, composition module, and
  shared Prisma implementation stay owner-internal. Cross-context consumers wire
  the public module and inject the public tokens instead of deep-importing internals.
- The architecture scanner protects the public surface from cross-context deep
  imports, prevents the canonical reader/writer from regressing to legacy persistence,
  requires canonical writes plus temporary-closure CAS, forbids any API runtime
  `.businessConfig` delegate, requires the Prisma `BusinessConfig` model to stay absent,
  and pins the registered contraction migration to atomic fail-closed parity/dependency
  checks with trigger → function → table DDL and no `CASCADE`. It also keeps POS
  Orders/Summary browser store context on the guarded POS endpoint and prevents
  canonical Admin Store clients/settings from returning to implicit `/staff/store/*`
  routes or optional `storeStableId` contracts.
- Admin remains an Identity/Customer/Benefits adapter path for dependency-map
  accounting, but its Business configuration persistence now crosses the
  Brand/Store public writer boundary. No new direct context edge is introduced.
- Admin POS-device management now crosses the Store Operations/POS `public-api.ts`
  management boundary. The former Admin Prisma device service and Prisma-generated
  status/store UUID DTO dependencies are removed, lowering Identity/Customer/Benefits
  runtime-data direct-import debt by five. Canonical Web requests use
  `storeStableId`/`deviceStableId`; the temporary stale-browser UUID resolver is
  registered as `pos-device.admin-db-id.v1` and does not emit DB UUIDs back to Web.

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
  `> 0`; Phase B writes `LoyaltyProgramPolicy`, the `BusinessConfig` compatibility
  copy, and `BrandConfig` in one transaction. The compatibility copies are still
  required because the existing DB trigger is one-way (`BusinessConfig` -> canonical
  config); allowing either transitional copy to become stale could revert Benefits
  values on a later unrelated legacy config write.
- The general Admin Settings page no longer declares or resubmits Loyalty policy
  fields. Legacy `PATCH /admin/business/config` and compatibility
  `PUT /admin/business/temporary-close` now reject all ten Loyalty keys with HTTP
  400 and direct stale callers to `/admin/benefits/loyalty-policy`; their request
  shapes and `BusinessConfigResponse` no longer expose Loyalty fields, and
  `AdminBusinessService` no longer imports or invokes Benefits policy readers or
  writers. Repository-wide Web code remains gated from combining either legacy
  route with a Loyalty policy field. New direct BusinessConfig Loyalty persistence
  consumers are also blocked outside the registered Benefits Phase B triple-writer.
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
- `benefits.business-config-loyalty-policy.v1` is **closed**. Phase A expanded and
  backfilled `LoyaltyProgramPolicy`, Phase B established transitional triple-write/parity,
  Phase C cut runtime reads to the dedicated row, and Phase D completed the persistence
  contraction. Editable settings, runtime/transaction reads, and writes now use only
  `LoyaltyProgramPolicy`; `BrandConfig` and `BusinessConfig` no longer contain Loyalty
  policy columns; `syncBusinessConfigToCanonicalConfig()` contains no Loyalty propagation;
  and the architecture scanner rejects both application regression and reactivation of
  this persistence compatibility. Production direct verification covered Admin policy
  change/restore, POS policy load, Web pure-points order plus exact refund reversal,
  public membership rules, unrelated Store write/restore, database metadata, and the
  relevant error logs.
- `brand-store.business-config.v1` is **closed**. The application cutover and mirror-off
  production proof completed first, then migration
  `20260902044000_contract_brand_store_business_config` rechecked the 29 overlapping fields,
  expected trigger/function binding, row counts, and database dependencies under locks before
  dropping trigger → function → table without `CASCADE`. Post-deployment verification on
  2026-09-02 confirmed `BusinessConfig`, `BusinessConfig_sync_canonical_config`, and
  `syncBusinessConfigToCanonicalConfig()` are absent while `BrandConfig`, the configured
  Store, and `StoreConfig` remain intact. An Admin Brand PATCH persisted the new canonical
  exchange rate `5.2`; POS pause/resume both returned 200, Uber status sync succeeded in both
  directions, final StoreConfig state is open, and API/worker error scans were clean.

## Carried debt outside this closeout

- `web.api-envelope-direct-payload.v1` remains active only because Checkout still
  has six legacy browser fetches. POS session/login claim, login, auth/me,
  store-status and heartbeat calls now use the centralized POS session API adapter;
  their five direct-fetch allowances are removed and cannot return without failing
  the architecture scanner. The canonical clients continue to require the strict
  global envelope.
- Payments/Clover legacy paths remain frozen by their compatibility entries.
- Brand/Store configuration persistence contraction is complete; implicit/default-store identity remains the primary Phase 2 Brand/Store work.

## Reading the graph

- A count is debt, not permission to add more coupling.
- When a PR removes a direct import, lower/remove the matching baseline in the
  same PR so the dependency cannot return.
- New cross-context work must target the owner's `public-api`, `contracts`, or
  `ports` surface.
- Recompute this snapshot at every phase boundary; a new cycle, new direct pair,
  or ambiguous identity field blocks phase closure.
