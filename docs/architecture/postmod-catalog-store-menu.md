# Post-Modularization Catalog Store Menu

Date: 2026-09-29  
Slice 1 base: `origin/dev@bfbf8e2c`  
Slice 2A base: `origin/dev@78f4e6d8` after Slice 1 merge  
Current branch: `catalog/store-menu-not-null-contraction`  
Program status: repository-wide modularization remains **CLOSED**; this is post-modularization Catalog product/persistence work.

## 1. Goal

Replace the current brand-level shared Catalog menu with explicit Store-scoped menu ownership, then retire the legacy combined Admin menu workspace in favor of the already-reserved Category and Item workspaces.

This work must preserve the established ownership model:

- Catalog remains the owner of current menu/configuration facts;
- Store remains the owner of canonical `Store.storeStableId`;
- Orders/POS/Public Menu consume Catalog facts through store-aware Catalog contracts;
- Uber remains an external-channel adapter and must request Catalog source facts for the target SanQ Store;
- Offers remains the owner of Daily Special policy/persistence while resolving eligible Catalog items in the target Store;
- no production Web Clover payment behavior is part of this work.

## 2. Readiness audit

The 2026-09-29 audit found no architecture or provider blocker.

Current production read-only inventory at Slice 1 start:

- Stores: **1 total / 1 active**;
- canonical Store: `4750_Yonge_Street`;
- MenuCategory: **7 total / 7 active / 0 soft-deleted**;
- MenuItem: **33 total / 33 active**;
- MenuOptionGroupTemplate: **23 total / 23 active / 0 soft-deleted**.

Because there is exactly one current Store, historical Catalog ownership is unambiguous. Every existing Category and Option Group Template can be deterministically backfilled to `4750_Yonge_Street`.

The Admin shell already preserves `?store=<storeStableId>` for Catalog navigation and already renders the Store selector. The Category and Item routes exist but are placeholders. The current combined `/admin/menu` page and `GET /admin/menu/full` remain the active management workspace.

The important downstream audit findings are:

- Public Menu still reads one global Catalog;
- POS loads `/menu/public` globally;
- Orders/POS pricing/materialization Catalog ports do not yet accept `storeStableId`;
- Uber draft loading already has a SanQ Store context, but its Catalog reader still calls global `readMenuSource()`;
- Daily Special consumes Catalog item snapshots without explicit Store identity.

Those are Slice 2 consumers, not Slice 1 blockers.

## 3. Ownership model

Store ownership is attached only to Catalog roots that need independent per-store configuration.

### Store-scoped roots

- `MenuCategory.storeStableId -> Store.storeStableId`
- `MenuOptionGroupTemplate.storeStableId -> Store.storeStableId`

### Inherited descendants

- `MenuItem` inherits Store ownership from `MenuCategory`;
- `MenuOptionTemplateChoice` inherits Store ownership from `MenuOptionGroupTemplate`;
- `MenuItemOptionGroup` must eventually bind only roots from the same Store;
- fixed components and target-item references must eventually remain within the same Store.

### Brand-level reusable dictionary

`MenuPackagingType` remains brand-level in this work package. A packaging definition such as `16oz`, `38oz`, or sandwich bag is reusable across Stores; the item-to-packaging binding remains item-specific and therefore Store-specific through the MenuItem.

### Stable identity

Existing Catalog `stableId` values remain globally unique. This work does **not** change stable IDs to a composite `(storeStableId, stableId)` identity and does not rewrite historical Order/Uber/print references.

## 4. Migration class

This is **Class B — expand-contract**.

Compatibility ID (retired in Slice 2B):

`catalog.store-menu-ownership.v1`

Slice 1 intentionally introduced nullable ownership as temporary compatibility infrastructure while consumers cut over. Slice 2B has now completed the production NOT NULL contraction and retired this compatibility; the final Catalog contract requires Store ownership on both roots.

## 5. Slice plan

### Slice 1 — Catalog Store Ownership Foundation

Status: **MERGED / CI GREEN / COMPANION MIGRATION MERGED — PR #2607 / FINAL HEAD `c69ce30b` / MERGE `78f4e6d8` / CI #6613**.

Scope:

- add nullable `storeStableId` ownership to MenuCategory and MenuOptionGroupTemplate;
- reference canonical `Store.storeStableId` with `onDelete: Restrict`;
- add Store back-relations and store/deleted/sort indexes;
- keep MenuItem/OptionChoice ownership inherited rather than duplicating Store identity;
- keep MenuPackagingType brand-level;
- register the temporary expand-contract compatibility;
- add an architecture regression test for the ownership shape.

Intentionally unchanged:

- no Admin/Public/POS/Orders/Uber/Daily Special store-aware read cutover yet;
- no Admin HTTP route change;
- no `/admin/menu/full` contraction;
- no Category/Item UI migration;
- no price/availability/promotion semantics;
- no Uber provider wire/OAuth/webhook/publish protocol;
- no stable-ID rewrite;
- no package/lockfile change;
- no direct-import/public-SCC architecture change.

### Slice 1 companion migration gate

**MIGRATION REQUIRED.**

Suggested migration name:

`post_mod_catalog_store_menu_ownership_foundation`

User-local generation command after the Slice 1 source PR is merged to `dev` and a disposable/local development database is verified:

`pnpm --filter api exec prisma migrate dev --create-only --name post_mod_catalog_store_menu_ownership_foundation`

The generated SQL must be reviewed and augmented by the operator as needed so it performs a deterministic historical backfill before production promotion:

1. add nullable `storeStableId` columns;
2. add the two FK relations to `Store.storeStableId` with restrictive deletion;
3. add the composite indexes;
4. assert `Store.storeStableId='4750_Yonge_Street'` exists;
5. backfill **all** MenuCategory rows and **all** MenuOptionGroupTemplate rows, including soft-deleted rows, to `4750_Yonge_Street`;
6. verify pre/post row counts and verify zero unexpected ownership values.

The Slice 1 schema intentionally remains nullable after this backfill. The user-generated migration `20260929235417_post_mod_catalog_store_menu_ownership_foundation` was reviewed with the backfill before FK enforcement and merged with Slice 1. Empty migration replay remains safe, while existing production rows deterministically map to `4750_Yonge_Street`.

### Slice 2A — Store-aware Catalog contracts and consumers

Status: **PR #2608 MERGED / CI #6619 GREEN / DEPLOYED / CORE PRODUCTION PARITY VERIFIED / HOMEPAGE FEATURED COMPLETENESS FOLLOW-UP LOCAL / NO NEW MIGRATION**.

Implemented scope:

- Catalog Admin/category/item/template/option reads and writes require explicit `storeStableId`; new Category and Option Group Template rows persist that owner;
- Category moves, fixed components, target-item references and item↔template bindings fail closed when the referenced Catalog root is outside the selected Store; child-option links remain even stricter because the existing rule only permits links inside the same template group, whose root is already Store-validated;
- `GET /menu/public` preserves its public route but resolves the server-configured Store and only projects that Store's Catalog/Offers facts;
- POS pricing now preserves the authenticated Store all the way through Orders pricing/materialization instead of dropping it; Orders item snapshots, hidden-item checks, Daily Special pricing, delivery pricing and label-plan Catalog reads are Store-scoped;
- legacy amendment and financial-replay Catalog lookups derive Store from persisted Order/financial facts, with the configured Store retained only as compatibility fallback for historical rows whose old `Order.storeId` is null;
- Offers remains the Daily Special owner; Daily Special list/active/write paths receive an explicit Store and constrain definitions to Store-scoped Catalog item subjects rather than reading Catalog persistence;
- Uber keeps its existing adapter/application boundaries, but Catalog source/menu-item/option/template/modifier-snapshot reads now require the target SanQ Store; menu reference validation and availability sync carry the same Store identity;
- the current combined Admin Menu and separate Options screens forward the existing shell `?store=` context to the Store-scoped API; Category/Item workspace split remains Slice 3;
- production verification after deployment confirmed the Slice 1 ownership migration is applied, all 7 Category and 23 Option Group Template roots are non-null/valid and owned by `4750_Yonge_Street`, and the Store-scoped category/item/template-choice/binding/fixed-component fingerprints match the pre-cutover single-store baseline;
- the verification audit found one omitted consumer: Homepage Featured still loaded candidate MenuItems by global stableId and its seven-day sales ranking had no Store input. The current 2A follow-up makes both candidate validation/projection and ranking explicitly use the configured Store without changing Homepage content ownership or Catalog persistence;
- Packaging Type remains a brand-level reusable dictionary;
- no Web Clover execution, Uber provider protocol/OAuth/webhook contract, stable-ID identity, dependency or Prisma schema change is included.

### Slice 2B — root ownership NOT NULL contraction

Status: **PRODUCTION VERIFIED / SLICE 2B CLOSED / COMPATIBILITY RETIRED / READY FOR SLICE 3**.

Before Slice 2B, `MenuCategory.storeStableId String?` and `MenuOptionGroupTemplate.storeStableId String?` were the deliberate staged compatibility seam. Production verification after PR #2610 confirmed the Homepage Featured follow-up is deployed, all current ownership roots are valid/non-null under `4750_Yonge_Street`, Store-scoped persisted-menu parity still holds, and production has zero null-`Order.storeId` rows. The user explicitly authorized 2B on 2026-09-30. PR #2616 now makes both Prisma ownership roots and their `Store` relations required while retaining the compatibility marker until the reviewed companion migration is applied and verified in production.

Completed prerequisites:

1. all existing root ownership values are non-null and valid;
2. the `4750_Yonge_Street` Store-scoped projection matches the pre-cutover persisted-menu baseline;
3. Homepage Featured candidate/ranking reads are deployed and Store-scoped;
4. explicit authorization for the NOT NULL contraction has been given.

Completed additional gates:

1. schema/source contraction merged through PR #2616 / merge `51f3749a` after CI #6645;
2. user-generated migration `20260930162009_post_mod_catalog_store_menu_not_null_contraction` committed to `dev` as `88dd319a`;
3. migration SQL review confirmed exactly two `SET NOT NULL` statements and no backfill, DROP, FK/index churn, table rebuild or unrelated DDL;
4. production preflight re-confirmed zero NULL / other-Store ownership rows and confirmed the new migration is not yet present in production `_prisma_migrations`.

Completed CI gate:

1. GitHub Actions CI #6647 ran on `dev@88dd319a` and completed green;
2. Browser E2E successfully replayed all committed migrations, including `20260930162009_post_mod_catalog_store_menu_not_null_contraction`, into a disposable PostgreSQL database before seed/API/Web/browser verification;
3. API, Web, Browser E2E, printer-agent and Windows workstation jobs all passed.

Production closeout completed:

1. production deployed `main@88dd319a` and applied `20260930162009_post_mod_catalog_store_menu_not_null_contraction` at 2026-09-30 17:42:42 UTC;
2. `information_schema.columns` reports `is_nullable=NO` for both `MenuCategory.storeStableId` and `MenuOptionGroupTemplate.storeStableId`;
3. production ownership remains 7 MenuCategory roots and 23 MenuOptionGroupTemplate roots, with zero NULL or non-`4750_Yonge_Street` owners;
4. current Store composition has zero cross-Store item↔option-group bindings and zero cross-Store fixed components, with 33 live MenuItems and 92 live MenuOptionTemplateChoices;
5. API, Web and Uber worker logs showed no `error` matches in the post-deploy verification window;
6. `catalog.store-menu-ownership.v1` is therefore retired and its temporary Prisma `@compat` markers are removed.

### Slice 3 — Admin Category / Item workspace cutover

Slice 3 is split into independently reviewable UI/read-contract batches so the legacy combined workspace can remain intact until replacement surfaces are proven.

#### Slice 3A — Category workspace + narrow Category read

Local implementation scope:

- activate `/admin/menu/categories` as the Store-scoped Category maintenance workspace;
- add `GET /admin/menu/categories?storeStableId=...` owned by Catalog Admin;
- return only live Category fields required by that screen and do not load MenuItem/Options/Packaging data;
- preserve existing Store-scoped Category create/update contracts;
- keep the legacy combined `/admin/menu` workspace untouched as transition fallback;
- add API query-shape and Web source-boundary regressions that prohibit `/admin/menu/full` on the Category workspace.

State: **MERGED / PR #2619 / CI #6655 GREEN / MERGE `e92ab60c` / NO PRISMA OR MIGRATION / NO DEPENDENCY OR GRAPH CHANGE**.

#### Slice 3B — Item workspace + Options full-menu read contraction

Local implementation scope:

- activate `/admin/menu/items` as the independent Store-scoped Item maintenance workspace;
- add Store-scoped `GET /admin/menu/items?storeStableId=...` for full Item-editing DTOs and brand-level `GET /admin/menu/packaging-types` for the reusable packaging dictionary;
- compose Item support data from the already-narrow Category and Option Template reads instead of the combined snapshot;
- preserve item create/edit, dedicated availability control, image/media selection, packaging assignment/creation, fixed-combo composition, Uber publication flag, label strategy and option-group bind/update/unbind behavior;
- move the Options workspace target-item selector from `/admin/menu/full` to Store-scoped Category + Item reads;
- add query-shape/source-boundary regressions that prohibit `/admin/menu/full` from both Item and Options workspaces;
- leave the old combined workspace and `/admin/menu/full` available until Slice 4 because other consumers still exist.

State: **LOCAL / READY FOR REVIEW / NO PRISMA OR MIGRATION / NO DEPENDENCY OR GRAPH CHANGE**.

### Slice 4 — Legacy combined menu contraction

Planned scope:

- retire `/admin/menu` combined Category + Item maintenance;
- remove `/admin/menu/full` only after Category, Item and Options consumers no longer depend on it.

The Store-ownership compatibility seam was already retired in Slice 2B after production NOT NULL verification; Slice 4 does not own that compatibility cleanup.

## 6. Architecture effect

Neither Slice 1 nor Slice 2A moves business ownership between bounded contexts. Catalog remains the menu owner, Brand/Store remains the canonical Store-identity/config owner, Orders consumes Catalog facts through Catalog public ports, Offers remains policy/persistence owner for Daily Special, and Uber remains an external-channel adapter.

Slice 2A uses already-established public capability directions. It does not add a direct implementation import allowance, scanner ceiling change, public SCC or context-baseline change; `tools/architecture/context-baseline.json` therefore remains unchanged.

## 7. Verification state

Per repository workflow, no local lint/build/test/CI reproduction is run before user review.

After remote authorization, the reviewed branch must pass the normal GitHub Actions gates, including:

- Prisma Client generation;
- Architecture baseline;
- API lint/build/strict/test;
- Web lint/build/strict/test;
- Browser E2E and existing independent workstation/printer jobs where triggered.

Slice 2A is production verified, including the Homepage Featured follow-up merged in PR #2610 and deployed. Slice 2B source merged through PR #2616; user-generated migration `20260930162009_post_mod_catalog_store_menu_not_null_contraction` was reviewed on `dev@88dd319a`, passed CI #6647 including committed-migration replay, and is now applied in production. Both Store roots are physically NOT NULL, ownership/composition checks pass, and post-deploy runtime logs are clean. Slice 2B is therefore production verified and `catalog.store-menu-ownership.v1` is retired. Slice 3 is the next Catalog Store Menu work package.
