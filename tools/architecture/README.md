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
- browser/server direct `fetch` only at canonical transports or explicitly
  recorded raw/protocol exceptions, with stale allowances rejected;
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
  delegates or consumer-specific forbidden Prisma symbols, the deleted
  `common/store-id.ts` path cannot return, and configured store identity has one
  implementation owner;
- Benefits loyalty policy is exposed through `loyalty/public-api.ts`; all
  LoyaltyService policy readers must use transitional `BrandConfig` storage,
  transaction-bound reads must stay on the existing Prisma transaction client,
  migrated Admin readers cannot return to `BusinessConfig`, legacy Loyalty
  `BusinessConfig` helpers/types are forbidden, private policy contracts cannot be
  deep-imported outside the Loyalty owner, and loyalty policy fields cannot be
  added to the Brand/Store public config contract;
- unique, complete compatibility entries;
- no unregistered `@compat <compat_id>` annotation.

Imports through `public-api`, `contracts`, `ports`, and registered public
shared-package aliases are reported but do not consume legacy debt allowances.
When a PR removes direct imports, lower the matching value in
`context-baseline.json` in the same PR. Never raise a limit merely to make CI
green; either use a public contract/port or update the architecture decision and
compatibility plan explicitly.
