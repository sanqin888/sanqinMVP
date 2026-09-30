# Post-Modularization Catalog Store Menu

Date: 2026-09-29  
Slice 1 base: `origin/dev@bfbf8e2c`  
Slice 2A base: `origin/dev@78f4e6d8` after Slice 1 merge  
Current branch: `catalog/store-menu-store-aware-contracts`  
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

Active compatibility ID:

`catalog.store-menu-ownership.v1`

Slice 1 intentionally adds nullable ownership fields. Existing global readers/writers remain unchanged until the persisted data is backfilled and every consumer can cut over together. The nullable state is temporary compatibility infrastructure, not the final Catalog contract.

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

Status: **NOT STARTED / EXPLICIT AUTHORIZATION REQUIRED / MIGRATION REQUIRED**.

The remaining `MenuCategory.storeStableId String?` and `MenuOptionGroupTemplate.storeStableId String?` compatibility fields are a deliberate staged seam. Tightening them to non-null is a constraint contraction under `AGENTS.md`; it must not be bundled into 2A. Before 2B:

1. confirm all existing root ownership values are non-null and valid;
2. verify the `4750_Yonge_Street` Store-scoped projection against the pre-cutover menu/operational paths;
3. obtain explicit authorization for the NOT NULL schema contraction;
4. generate the companion migration locally with `--create-only`, review the exact ALTER/constraint SQL, then merge it through the normal dev/CI gate;
5. only after the contraction is verified may `catalog.store-menu-ownership.v1` be removed.

### Slice 3 — Admin Category / Item workspace cutover

Planned scope:

- activate the existing `/admin/menu/categories` workspace;
- activate the existing `/admin/menu/items` workspace;
- use narrow Store-scoped APIs instead of loading the full combined menu for both screens;
- preserve the separate Options workspace while making it Store-scoped.

### Slice 4 — Legacy combined menu contraction

Planned scope:

- retire `/admin/menu` combined Category + Item maintenance;
- remove `/admin/menu/full` only after Category, Item and Options consumers no longer depend on it;
- remove `catalog.store-menu-ownership.v1` after non-null Store ownership and active store-scoped verification are complete.

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

Slice 2A core deployment has production Store-ownership/parity evidence, but the follow-up Homepage Featured consumer fix is still local and must pass review, CI and deployment verification before Slice 2A can be declared fully verified. Slice 2B remains blocked until that final consumer-completeness gate passes; the nullable compatibility seam stays active.
