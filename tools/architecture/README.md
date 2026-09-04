# Architecture scanner

Run from the repository root:

```bash
node tools/architecture/scan-architecture.mjs --check
node tools/architecture/scan-architecture.mjs --report
```

`--check` enforces:

- exactly 12 registered contexts;
- no unclassified production source roots;
- no new direct cross-context dependency pair;
- no increase in a recorded direct-import allowance;
- no strongly connected cycle made only from public-contract dependency pairs that
  are no longer grandfathered by a recorded legacy direct-import allowance. The
  cycle graph includes `public-api`, `contracts`, `ports`, and registered public
  aliases, so moving both directions behind public surfaces cannot hide an A -> B -> A
  dependency. Existing direct-debt pairs remain governed by their numeric baseline;
  when that debt allowance is removed, the public direction automatically becomes
  subject to the cycle gate;
- browser/server direct `fetch` only at canonical transports or explicitly
  recorded raw/protocol exceptions, with stale allowances rejected; POS
  session/login has no direct-fetch allowance after its canonical-client cutover,
  leaving Checkout as the only regular JSON browser compatibility debt;
- one App Router `/api/v1` JSON BFF instead of a duplicate Next rewrite;
- server-only Web API upstream configuration (`API_UPSTREAM`);
- `@shared/foundation` registered as the `architecture-foundation` public package,
  while architecture-foundation itself cannot depend on business public surfaces;
- StableId foundation primitives have exactly one implementation owner and are not
  re-exported from Menu/Order business packages;
- Brand/Store canonical configuration, configured stable store identity, and the
  Nest composition module are exposed through one registered `store/public-api.ts`
  surface; internal identity/contract/Prisma/module paths cannot be deep-imported
  across contexts, migrated consumers cannot regress to legacy `BusinessConfig`
  delegates or consumer-specific forbidden Prisma symbols; Orders and the POS
  connectivity watchdog are registered fully migrated readers. Admin Business is
  now a canonical reader/writer consumer: it must use the Brand/Store public writer
  boundary and cannot write `BusinessConfig`, `BrandConfig`, or `StoreConfig`
  through Prisma directly. The owner writer is the sole registered Brand/Store
  compatibility writer and must update canonical storage plus the compatibility
  copy transactionally. The deleted `common/store-id.ts` path cannot return, and
  configured store identity has one implementation owner;
- Benefits coupon claims/triggers/admin issuance are exposed through
  `benefits/public-api.ts`; the legacy Coupons implementation module must remain
  non-global, concrete coupon benefit services cannot be deep-imported outside
  their implementation root, and migrated Identity consumers cannot regain a
  direct Catalog/Offers dependency;
- Unified payment preparation consumes points/balance and coupon HOLD/RELEASE only
  through the registered Benefits payment-reservation contracts/composition
  surface. `PaymentCheckoutAttemptService` and its POS composition module cannot
  deep-import Loyalty/Membership implementations again; lowering the matching
  `payments-clover -> identity-customer-benefits` allowance is part of the same
  contraction;
- Admin menu CRUD/read-model decisions are owned by Catalog through
  `menu/public-api.ts`; `apps/api/src/admin/menu/**` cannot regain direct Prisma or
  Uber-provider ownership. Availability/provider coordination lives in the explicit
  `application/menu` orchestration boundary: Catalog exposes availability facts via
  its public reader, Uber composition adapts those facts into an application query
  port, and Uber availability persistence must remain DB-only for Uber-owned
  store-mapping/OpsTicket facts. The retired Admin availability orchestrator cannot
  return, and the fixed-component Uber capability guard cannot move back into
  `CatalogAdminService`. Daily Special persistence, store-time activation and special
  pricing policy are owned by Offers through `DAILY_SPECIAL_OFFERS`; `MenuDailySpecial`
  Prisma access is exclusive to `PromotionsService`. Catalog exposes only item stable
  IDs/base-price facts, while Admin composition, Public Menu and Orders consume the
  Offers public capability. Because Catalog/Public Menu no longer read StoreConfig for
  Daily Special timing, they are no longer registered Brand/Store config consumers;
  `PromotionsService` remains registered there. The Catalog availability module reuses
  the narrow `CatalogAdminModule` so this HTTP-side Offers wiring does not expand the
  Uber worker runtime dependency surface;
- Benefits loyalty policy is exposed through `loyalty/public-api.ts`; all
  LoyaltyService policy readers must use transitional `BrandConfig` storage,
  transaction-bound reads must stay on the existing Prisma transaction client,
  migrated Admin readers cannot return to `BusinessConfig`; Admin Members read/write
  and POS payment policy reads must use the registered Benefits endpoints through
  the centralized Web Loyalty API client. Orders quote/create redemption conversion
  must read `redeemDollarPerPoint` through `LOYALTY_POLICY_READER`, keep its
  points/cents arithmetic in the registered characterized helper, and must not
  reintroduce a BusinessConfig/default redemption-rate fallback. The Benefits
  writer/settings reader must read the existing canonical config, must not invent
  runtime defaults or create missing config rows, and the writer must dual-write
  canonical plus registered compatibility storage in one transaction while the
  one-way legacy trigger remains active; general Admin Settings cannot declare or
  resubmit Loyalty policy fields. Repository-wide Web code cannot combine a legacy
  Admin Business route with a Loyalty policy field, new direct BusinessConfig
  Loyalty persistence consumers are forbidden, and the two remaining server-side
  Admin Business rollback adapters must stay explicitly registered until contract
  contraction.
  Legacy Loyalty reader
  helpers/types are forbidden, private policy implementations cannot be
  deep-imported outside the Loyalty owner, and policy fields cannot be added to the
  Brand/Store public config contract;
- unique, complete compatibility entries;
- no unregistered `@compat <compat_id>` annotation.

Imports through `public-api`, `contracts`, `ports`, and registered public
shared-package aliases are reported but do not consume legacy debt allowances.
When a PR removes direct imports, lower the matching value in
`context-baseline.json` in the same PR. Never raise a limit merely to make CI
green; either use a public contract/port or update the architecture decision and
compatibility plan explicitly.
