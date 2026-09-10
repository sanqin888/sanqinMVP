# Phase 8 — External Channels Boundary Contraction & L3 Resilience

Status: **SLICE 8.2A MERGED — SLICE 8.2B LOCAL SOURCE IMPLEMENTED / REVIEWED — REMOTE VALIDATION PENDING**  
Slice 0 audit baseline: `origin/dev@d1c7d7b3e968d99dce1e3df39ca1af04a7696883`  
Slice 8.1 implementation baseline: `origin/dev@96808b0ec1adc984dae99dd73dbd0e8ce4f2c4a9`  
Slice 8.2A implementation baseline: `origin/dev@fc9bfc01f651c0d3193ee06e1d71ea0029e77835`  
Baseline merges: PR `#2258` — Phase 7 Slice 5B; PR `#2259` — Phase 8 planning / Slice 0 audit; PR `#2260` — Phase 8 Slice 8.1  
Audit / implementation date: 2026-09-09

## 1. Purpose

Phase 8 owns the next-stage boundary contraction and reliability work for **External Channels**, with UberEats as the current L3 critical provider integration.

This phase does **not** flatten or re-modularize the existing UberEats bounded context. Its internal target architecture is already explicit: `domain/`, `application/`, `api/`, `infrastructure/`, `contracts/`, `test/`, one `ubereats.module.ts` composition root, one worker entry, and one business `public-api.ts`.

Phase 8 therefore focuses on the remaining seams around that architecture:

- direct-import debt that still bypasses existing owner public surfaces;
- ownership leaks hidden inside otherwise layer-correct persistence adapters;
- provider-specific state or persistence behavior that crosses canonical business ownership;
- L3 recovery/compatibility gaps that are not already covered by the durable inbox/action/reconciliation architecture;
- conditional production-cutover cleanup after explicit evidence.

Correctness, retry safety, atomicity, durable recovery and owner boundaries take priority over making dependency counters artificially reach zero.

## 2. Authoritative starting baseline

The Slice 0 audit re-confirmed `dev` at:

- `d1c7d7b3e968d99dce1e3df39ca1af04a7696883`;
- PR `#2258`, Phase 7 Slice 5B, already merged;
- `legacyPublicCycleComponents = []`;
- no Phase 8 production implementation, Prisma schema/migration, package dependency or provider-wire behavior changed by Slice 0.

### 2.1 Important documentation-baseline correction

The authoritative machine baseline is `tools/architecture/context-baseline.json`, not the stale summary row in `docs/architecture/current-dependency-graph.md`.

PR #2258 correctly contracted:

`external-channels -> architecture-foundation 11 -> 10`

when Uber stopped importing Foundation-owned `common/pos-connectivity` during the POS connectivity read-model cutover. The current machine baseline is therefore:

### External Channels outgoing remaining direct-import debt

| Target context | Current allowance |
|---|---:|
| architecture-foundation | 10 |
| commerce-orders-fulfillment | 1 |
| identity-customer-benefits | 6 |
| runtime-data-ci-ops | 24 |
| **Total** | **41** |

### Incoming remaining direct-import debt to External Channels

| Source context | Current allowance |
|---|---:|
| identity-customer-benefits | 1 |
| store-operations-pos-print | 1 |
| accounting-reporting-analytics | 1 |
| **Total** | **3** |

These are **legacy/direct-import debt allowances**, not a count of all legitimate cross-context calls. Imports through approved `public-api`, contracts, ports and registered public aliases do not consume these allowances.

`current-dependency-graph.md` still renders External -> Foundation as `11` in its summary table even though the machine baseline and merged PR #2258 source are already `10`. That human-readable graph must be corrected in the next synchronized modularization documentation change; Slice 0 does not alter it independently.

## 3. Binding architecture rules

Phase 8 keeps the repository and Uber-specific rules intact:

1. Other contexts may use Uber business capabilities only through `integrations/ubereats/public-api.ts`.
2. `ubereats.module.ts` is itself an explicitly allowed external composition entry; importing that root module for Nest composition is not automatically an architecture defect.
3. `application` owns ports for external capabilities; provider/runtime/persistence details do not become application facts.
4. Prisma access remains confined to `infrastructure/persistence`; the root composition module may import `PrismaModule` for wiring.
5. No provider wire DTO/status/UUID may leak into Orders/Catalog/POS/Accounting canonical contracts.
6. No slice may reintroduce a public SCC.
7. No fake facade/public export is created merely to reduce scanner counts.
8. Production Web Clover, Payments/Clover Terminal redesign and Prisma major upgrades remain outside Phase 8.
9. Compatibility removal and provider/wire behavior changes remain evidence-gated L3 operations.

## 4. Slice 0 findings

### 4.1 External -> Identity / Customer / Benefits: 6 exact debt imports

The six current debt statements are fully identified:

| File | Current direct import | Classification | Readiness result |
|---|---|---|---|
| `api/ubereats-access.decorator.ts` | `auth/admin-mfa.guard` | implementation path | `AdminMfaGuard` already exported by `auth/public-api.ts`; safe path contraction candidate |
| `api/ubereats-access.decorator.ts` | `auth/roles.decorator` | implementation path | `Roles` already public; safe path contraction candidate |
| `api/ubereats-access.decorator.ts` | `auth/roles.guard` | implementation path | `RolesGuard` already public; safe path contraction candidate |
| `api/ubereats-access.decorator.ts` | `auth/session-auth.guard` | implementation path | `SessionAuthGuard` already public; safe path contraction candidate |
| `api/oauth.controller.ts` | `SESSION_COOKIE_NAME` from `auth/session-auth.guard` | Auth-owned HTTP/session contract | not currently exported; needs a minimal Auth public-contract decision |
| `ubereats.module.ts` | `auth/auth.module` | Nest composition | retain unless a proven safe Auth composition public surface already exists; do not create an eager barrel cycle just for the metric |

Therefore **4/6 are immediately ready for low-risk public-path contraction**. The cookie constant is a small ownership/public-contract decision. The `AuthModule` edge is currently analogous to other intentionally retained Nest composition seams and should not be changed cosmetically.

### 4.2 Incoming External debt: 3 exact composition seams

The three inbound debt statements are:

- `apps/api/src/pos/pos.module.ts -> integrations/ubereats/ubereats.module`;
- `apps/api/src/admin/admin.module.ts -> integrations/ubereats/ubereats.module`;
- `apps/api/src/accounting/accounting.module.ts -> integrations/ubereats/ubereats.module`.

All three are **composition dependencies on the explicitly allowed Uber root module**, not business deep imports. Actual POS/Accounting/Admin business calls already use Uber public tokens/contracts where appropriate.

**Slice 0 decision:** do not re-export `UberEatsModule` through `public-api.ts` merely to turn these three counts into zero. The Uber architecture explicitly allows callers to use `ubereats.module.ts` for composition, while business capability access remains on `public-api.ts`.

### 4.3 External -> Architecture/Foundation: 10 exact debt imports

After Phase 7 Slice 5B the source-aligned count is **10**, not 11.

The ten statements are:

1. `api/oauth.controller.ts -> common/app-logger`;
2. `application/merchant/uber-merchant-provisioning.service.ts -> common/app-logger`;
3. `application/merchant/uber-merchant-store-mapping.service.ts -> common/app-logger`;
4. `infrastructure/uber-api/uber-api.gateway.ts -> common/app-logger`;
5. `infrastructure/uber-api/uber-http.client.ts -> common/app-logger`;
6. `infrastructure/uber-api/uber-order-action.gateway.ts -> common/app-logger`;
7. `infrastructure/uber-api/uber-token.provider.ts -> common/app-logger`;
8. `infrastructure/persistence/uber-telemetry.service.ts -> common/app-logger`;
9. `infrastructure/persistence/uber-telemetry.service.ts -> common/log-context`;
10. `infrastructure/uber-api/uber-financial-reporting.adapters.ts -> common/utils/uploads-path`.

`common/public-api.ts` already exports `AppLogger`, so **8/10 have an existing public path** and can be considered for a narrow path-contraction slice. The remaining two are different:

- `getLogContext()` is used to enrich Uber telemetry correlation with the request ID and is not currently public;
- `getUploadsAccountingDir()` couples the Uber financial-report artifact adapter to the shared runtime uploads layout and is not currently public.

Those two require an ownership/public-surface decision rather than an automatic re-export.

A separate Uber-internal concern also exists: two of the direct logger imports live in `application/`, whose own architecture says external capabilities should be expressed through application-owned ports. Slice 8.1 must decide whether simple Foundation public-path use is sufficient under the repository-wide rules or whether those application services should use an existing Uber telemetry/logging port instead. No decision is implemented in Slice 0.

### 4.4 External -> Runtime/Data/Ops: 24 are not a blanket contraction target

The current `24` is explained by the existing architecture:

- **23** production imports of `PrismaService` from adapters/services under `infrastructure/persistence/**`;
- **1** `PrismaModule` import in `ubereats.module.ts` composition wiring.

That placement is exactly where the Uber architecture permits Prisma/runtime access. Slice 0 found no reason to wrap these 24 imports in an artificial runtime facade merely to reduce the counter.

**Important distinction:** layer-correct Prisma access can still contain a cross-owner semantic violation. Phase 8 must audit what those persistence adapters *write/read*, not only where they import Prisma from.

### 4.5 External -> Orders/Fulfillment: 1 is a real ownership seam, not a simple import cleanup

The one current direct-import debt is in:

`infrastructure/persistence/uber-order-action-prisma.adapter.ts -> orders/order-lifecycle`

It imports Orders-owned acceptance lifecycle constants/idempotency helpers. More importantly, the same Uber persistence transaction currently:

1. completes the durable `UberOrderAction`;
2. directly updates the canonical `Order.status`;
3. directly appends the Orders-owned `order.accepted` `OpsEvent`.

Existing architecture characterization intentionally pins this behavior so Uber acceptance does not also start preparation and so action success/order acceptance remain atomically coordinated.

**Slice 0 decision:** this cannot be closed by simply re-exporting Orders lifecycle constants through `orders/public-api.ts`. That would improve the scanner number while leaving Orders-owned state mutation inside Uber persistence.

A proper contraction must preserve current atomicity, idempotency and crash/replay semantics while moving the canonical Order transition behind Orders ownership. That is an **architecture-boundary change** and requires a separate design/impact/options report plus explicit user authorization before implementation.

### 4.6 Provider wire leakage / public consumer review

The current public Uber surface exports stable capability tokens/ports/DTOs for store status, order status, reporting and menu availability. Existing POS, Accounting, Admin/Catalog callers use that public surface for business calls.

Slice 0 found no reason to replace those public dependencies. The target remains **zero internal Uber implementation imports by business consumers**, not zero legitimate cross-context capability calls.

Order ingestion remains mapped through canonical Uber application/domain types before Orders ingestion. The requirement matrix explicitly forbids Uber wire schema from leaking into Orders domain.

### 4.7 L3 durability/recovery coverage is already substantial

The current Uber implementation already has more recovery machinery than the initial Phase 8 planning note assumed:

- webhook receiver durably commits inbox before ACK;
- duplicate webhook delivery is idempotently accepted;
- worker retry/replay owns post-ACK recoverable failures;
- webhook processing uses leases and can reclaim expired PROCESSING work;
- durable order actions use idempotency keys and expiring leases;
- Uber order action transport propagates the durable idempotency key upstream;
- Menu V2 has PUT -> GET read-back reconciliation requirements/tests;
- requirement-matrix active verification explicitly includes duplicate/replay, immediate/scheduled accept, deny/cancel/ready, POS offline, menu reconciliation and store-status flows.

Therefore Phase 8 should **not** introduce a generic new outbox/replay framework or rewrite the existing durable inbox/action system. Slice 8.4 is narrowed to gaps demonstrated by evidence after the boundary contractions, not a presumed broad resilience rebuild.

Known external/provider uncertainty that remains intentionally separate includes `orders.customer_order_edit`, which the requirement matrix keeps quarantined pending Uber confirmation and an approved reconciliation design.

### 4.8 Compatibility findings

`brand-store.default-store-identity.v1` is registered closed for the canonical runtime migration, but production Uber source still contains historical compatibility behavior/annotations for old Uber-store-ID-scoped OpsTicket rows, including:

- `application/operations/uber-operations.ports.ts` legacy Uber store IDs in the ticket scope;
- `application/operations/uber-operations.use-cases.ts` legacy persisted scope resolution;
- `infrastructure/persistence/uber-merchant-persistence.adapter.ts` legacy `[storeStableId, uberStoreId]` OpsTicket lookup.

This is consistent with earlier planning that Test Store / historical Uber rows are not automatically deleted or rewritten before the separate Production cutover cleanup.

**Slice 0 decision:** do not enforce `closed compat id -> zero source references` globally yet. First complete the production-cutover decision and historical-data evidence. Scanner hardening can follow only when the remaining historical compatibility path is actually eligible to disappear.

### 4.9 UberDirect is removed from Phase 8 scope

The initial planning draft incorrectly treated UberDirect as External Channels work. Current architecture places UberDirect provider implementation under `apps/api/src/deliveries/**`, owned by **Commerce / Orders / Fulfillment**. Orders already consumes the `UBER_DIRECT_DELIVERY_DISPATCHER` public capability.

The known provider-success/local-`externalDeliveryId`-persistence-failure recovery debt is real, but it belongs to Commerce/Fulfillment follow-up and must not be pulled into Phase 8 to bypass ownership boundaries.

## 5. Revised Phase 8 slice plan after Slice 0

### Slice 8.1 — Public boundary hygiene contraction

Recommended first source slice because it is the lowest-risk measurable contraction.

Candidate scope:

- move the four Uber access-decorator Auth imports to existing `auth/public-api.ts` exports;
- decide and, if approved, expose/use the smallest Auth-owned public contract for `SESSION_COOKIE_NAME`;
- retain direct `AuthModule` composition unless a safe existing composition surface is proven;
- move the eight `AppLogger` imports to the existing `common/public-api.ts` public surface **only where that remains consistent with Uber layer rules**;
- characterize the two application-layer logger consumers before deciding whether they should instead consume an Uber-owned telemetry/logging port;
- leave `getLogContext` and `getUploadsAccountingDir` for a separately justified ownership decision if they cannot use an already-approved public surface.

Expected debt movement must be calculated from the final approved file scope rather than promised in advance. No new public cycle or eager barrel-loading regression is allowed.

#### Slice 8.1 implementation result

PR #2260 on `refactor/phase8-slice8.1-public-boundary-hygiene-v2` implements the narrow path contraction without changing Uber business/provider behavior:

- `api/ubereats-access.decorator.ts` now imports `AdminMfaGuard`, `Roles`, `RolesGuard`, and `SessionAuthGuard` from the existing Auth public surface. Guard order, MFA, CSRF and role metadata are unchanged.
- Six layer-legal `AppLogger` consumers (`api/oauth.controller.ts`, four `infrastructure/uber-api/*` files, and `infrastructure/persistence/uber-telemetry.service.ts`) now import `AppLogger` from `common/public-api.ts`; logger calls and metadata are unchanged.
- The two application-layer merchant services intentionally keep direct `common/app-logger` imports. Existing `UberTelemetryPort.workflowLog()` is not behavior-equivalent because its structured diagnostic path filters current merchant/store context, while `captureEvent()` adds persisted `OpsEvent` side effects. No new logging facade/port is introduced solely to reduce debt.
- `SESSION_COOKIE_NAME` remains on `auth/session-auth.guard`; no canonical public session-cookie contract exists today and Auth public API is not broadened in this slice.
- Direct `AuthModule` composition remains in `ubereats.module.ts`; it is legal Nest wiring and is not re-exported through the business public API.
- `getLogContext()`, `getUploadsAccountingDir()`, the Orders acceptance atomic seam, Runtime/Prisma imports and incoming Uber root-module composition remain untouched.
- `uber-service-architecture.spec.ts` now pins the completed Auth/Foundation public-path contractions so later baseline movement cannot silently reintroduce these implementation imports.

Actual local baseline movement from the reviewed source diff is:

- `external-channels -> identity-customer-benefits`: **6 -> 2**;
- `external-channels -> architecture-foundation`: **10 -> 4**;
- External outgoing direct debt total: **41 -> 31**;
- `external-channels -> commerce-orders-fulfillment`: **1**, unchanged;
- `external-channels -> runtime-data-ci-ops`: **24**, unchanged;
- incoming External composition debt: **3**, unchanged.

No local lint/build/test/scanner was run. PR #2260 final head `8efeb5e6` passed GitHub Actions CI #5414, including the architecture baseline gate, API lint/build/strict declaration/test, and Web lint/build/strict declaration/test, then squash-merged to `dev` as `fc9bfc01`.

### Slice 8.2 — Runtime/persistence semantic ownership audit and containment

Do **not** target `runtime-data-ci-ops 24 -> 0`.

The post-Slice-8.1 audit against merged `origin/dev@fc9bfc01f651c0d3193ee06e1d71ea0029e77835` confirms that the `24` runtime edges remain structurally expected: `23` production `PrismaService` imports are confined to `infrastructure/persistence/**`, and `ubereats.module.ts` retains the single legal `PrismaModule` composition import. The purpose of Slice 8.2 is therefore semantic ownership containment, not a scanner-count exercise.

The audit classified the current cross-owner persistence reads/writes as follows:

1. **Retain as already-correct infrastructure ownership.** Uber-owned `uber*` tables remain local to External Channels. `UberOrderImportPrismaAdapter.getStoreConnectivity()` reads the POS-owned `PosConnectivityReadModel`, which is the intentional authoritative read-model boundary established by Phase 7 Slice 5B; this must not be regressed back to direct `PosDevice` access or wrapped merely to lower the Runtime counter.
2. **Store schedule reads are immediately contractible through an existing owner capability.** Three Uber persistence paths still query `BusinessHour` directly: `uber-menu-supporting-queries-prisma.adapter.ts`, `uber-menu-draft-read-prisma.adapter.ts`, and `uber-menu-draft.repositories.ts`. Brand/Store already exposes `STORE_SCHEDULE_READER` / `StoreScheduleReaderPort.listBusinessHours(storeStableId)`, with the same business fields Uber consumes. Uber already owns `UBER_BUSINESS_SCHEDULE_QUERY_PORT`, so Slice 8.2A will move that port's implementation to the sole `ubereats.module.ts` composition root, adapt Store schedule/config facts there, and make all three persistence paths consume the Uber application port instead of querying `BusinessHour`.
3. **Catalog reads are real ownership debt but need a dedicated public-contract design.** Uber currently reads Catalog-owned `MenuCategory`, `MenuItem`, `MenuOptionGroupTemplate`, `MenuOptionTemplateChoice` and related menu graph facts for draft/publication/import behavior. Existing `CATALOG_AVAILABILITY_READER` and `CATALOG_ORDER_FACTS_READER` do not expose the complete publish/draft snapshot required by Uber. Do not improvise a partial facade or broaden those contracts opportunistically; follow Slice 8.2A with a dedicated Catalog read-boundary readiness/design slice and obtain authorization before changing Catalog public responsibilities.
4. **Orders reads/mutations require the later atomic-seam design gate.** Beyond the already-known acceptance seam, the audit confirmed direct canonical `Order` reads in sync/reconciliation/import paths and direct cancellation persistence that upserts `OrderAmendment`, sets `Order.status=refunded`, and appends the Orders-owned durable `order.cancelled` lifecycle `OpsEvent` in the same transaction. That atomic behavior currently protects cancellation/refund/replay/cancellation-print semantics and must not be replaced by an ordinary service call. Slice 8.3 must therefore cover both acceptance and cancellation ownership transfer/recovery semantics, not acceptance alone.

#### Slice 8.2A — Store Schedule Read Ownership Contraction

Authorized implementation scope:

- reuse the existing Uber application-owned `UBER_BUSINESS_SCHEDULE_QUERY_PORT`; do not add a duplicate schedule port;
- bind that port in `ubereats.module.ts` by composing the existing Uber-owned `UBER_STORE_CONFIG_QUERY` (already backed by Brand/Store `BRAND_STORE_CONFIG_READER`) with the Brand/Store `STORE_SCHEDULE_READER` public capability;
- remove direct `BusinessHour` reads from the three identified Uber persistence paths and route them through `UberBusinessScheduleQueryPort`;
- preserve timezone, sales-tax-rate and weekday/open/close/closed semantics exactly;
- preserve Uber menu payload, validation, provider wire behavior, menu publication/reconciliation, Store schedule ownership and worker/API composition topology;
- make no Prisma schema/migration, package, Orders/POS connectivity, payment/Clover or compatibility-cutover change;
- do not claim `runtime-data-ci-ops` baseline reduction: the affected persistence adapters continue to use Prisma for their own Uber/Catalog persistence where applicable, so the architecture benefit is semantic ownership correction with an expected unchanged direct-import baseline.

Focused architecture/regression coverage must pin the composition-root Store schedule adaptation and prohibit direct `BusinessHour` access from Uber persistence after this slice.

Local implementation result on `refactor/phase8-slice8.2a-store-schedule-ownership`:

- `UBER_BUSINESS_SCHEDULE_QUERY_PORT` is now provided only from `ubereats.module.ts`, where it composes `UBER_STORE_CONFIG_QUERY` with Store-owned `STORE_SCHEDULE_READER`; the same provider graph is reused by the API module and dedicated worker runtime.
- `UberMenuSupportingQueriesPrismaAdapter` no longer implements business-schedule reads and no longer depends on store configuration; it remains responsible only for its existing Catalog existence checks and Uber store-mapping query.
- `UberMenuDraftReadPrismaAdapter` consumes `UberBusinessScheduleQueryPort` for menu schedule validation instead of directly querying `BusinessHour`.
- `PrismaUberMenuUnitOfWork` keeps the existing menu repository transaction boundary for its Prisma-backed repositories while its schedule repository delegates to the same Uber business-schedule port. The prior `UberBusinessSchedulePrismaRepository` is replaced by the non-Prisma `UberBusinessScheduleRepositoryAdapter`.
- `UberBusinessScheduleQueryPort.readBusinessSchedule()` is made non-nullable to match both the previous implementation and the new composition provider: missing Store configuration continues to fail through the existing Store/config error path rather than returning a nullable schedule.
- production Uber persistence now has zero direct `.businessHour` accesses. Timezone, tax rate and business-hour fields remain unchanged, and Store's reader preserves weekday ordering.
- focused coverage verifies the composition-root mapping, repository delegation, removal of the obsolete Prisma schedule binding, and an architecture invariant that no production Uber persistence file directly accesses `businessHour`.
- no direct-import/public-cycle baseline movement is expected. `external-channels -> runtime-data-ci-ops` remains **24**, Orders remains **1**, Identity remains **2**, Foundation remains **4**, and no machine-baseline edit is made.
- no local lint/build/test/scanner was run; PR #2261 final head `ce47baf1` passed GitHub Actions CI #5418, including architecture baseline, API lint/build/strict/test and Web lint/build/strict/test, then squash-merged to `dev` as `87ebad20`.

Phase-closeout active verification scope added by this slice: Admin Uber menu draft/load and menu publish must still derive the configured Store schedule/timezone/tax correctly, and the dedicated worker composition must resolve the same schedule provider without startup/provider-resolution errors. No provider-wire payload shape is intentionally changed.

Any newly discovered responsibility transfer outside this approved 8.2A scope must be documented and authorized before implementation.

#### Slice 8.2B — Catalog read-boundary readiness/design gate

Read-only audit baseline: `origin/dev@87ebad20adbd6c1d86b3bf318dbdd9a41380c170` after PR #2261.

The audit confirms that the remaining Catalog ownership debt inside Uber persistence is broader than a single publication query. There are **17 production Catalog Prisma delegate reads across 7 Uber persistence files**:

| Uber persistence path | Catalog reads | Current purpose |
|---|---:|---|
| `uber-menu-draft.repositories.ts` | 5 | draft source graph plus the legacy/unused menu workflow snapshot path |
| `uber-menu-snapshot-prisma.adapter.ts` | 3 | canonical category/item/modifier facts for publish snapshot construction |
| `uber-menu-supporting-queries-prisma.adapter.ts` | 2 | item / option existence validation |
| `uber-menu-draft-mutation-prisma.adapter.ts` | 3 | item, option and modifier-group source defaults for Uber override writes |
| `uber-menu-config-import-prisma.adapter.ts` | 2 | source item/option price and availability during restore-to-source operations |
| `uber-order-import-prisma.adapter.ts` | 1 | canonical modifier metadata used to snapshot imported Uber order options |
| `uber-operations-prisma.repositories.ts` | 1 | menu-item existence validation for OpsTicket creation |

These accesses cover `MenuCategory`, `MenuItem`, `MenuOptionGroupTemplate` and `MenuOptionTemplateChoice`. Several current query shapes also traverse item option-group bindings and option child links. A correct Catalog capability must translate persistence relations to stable business identifiers; Uber must not receive Catalog database IDs or Prisma types.

Existing `CATALOG_AVAILABILITY_READER` and `CATALOG_ORDER_FACTS_READER` are intentionally insufficient for this responsibility. The availability contract exposes only availability/publication facts, while the Orders contract is purpose-built for order materialization/labels. Broadening either contract into a provider-menu aggregate would blur established ownership and consumer purpose. A dedicated Catalog-owned external-menu facts reader is the preferred boundary if the dependency direction can first be made cycle-safe.

##### Public-cycle blocker

Phase 3 Slice 6 deliberately removed a hidden `catalog-pricing-offers -> external-channels -> catalog-pricing-offers` public cycle. The current production Catalog availability orchestration still imports the Uber public availability capability from `catalog-uber-availability-orchestration.service.ts`; this is the remaining intentional **Catalog -> External** business dependency. `legacyPublicCycleComponents` is now empty, so adding an Uber -> `menu/public-api.ts` Catalog reader today would recreate the same two-context SCC and fail the monotonic architecture gate.

Therefore **do not** implement a new Catalog reader import in `ubereats.module.ts` until the reverse business dependency has first been removed without changing runtime availability behavior.

##### Recommended architecture — two-step dependency inversion

**8.2B.1 — Cycle-safe availability dependency inversion**

1. Add a Catalog/application-owned outbound availability-sync port under `apps/api/src/application/menu/**` with only the provider-neutral inputs/results required by the existing Catalog availability orchestration.
2. Change `CatalogUberAvailabilityOrchestrationService` to depend on that local outbound port rather than importing `integrations/ubereats/public-api.ts` directly.
3. Bind the Catalog outbound port to `UBER_EATS_MENU_AVAILABILITY` only in `catalog-uber-availability-orchestration.module.ts`. That module is already an explicit `compositionRootsExcluded` entry, so cross-context Nest wiring remains visible in its designated composition seam but no Catalog business source depends directly on External Channels.
4. Preserve the current synchronous best-effort availability call, Admin `uberSync` presentation, fixed-component guard, failure logging and provider command semantics. This is dependency inversion, not conversion to eventual/event-driven delivery.
5. Add architecture coverage that the orchestration service no longer imports Uber and that the existing excluded composition module is the sole Catalog/Uber availability bridge.

Once 8.2B.1 is complete, the business dependency graph has no Catalog -> External public edge, so an **External -> Catalog** canonical-read capability can be introduced without restoring an SCC.

**8.2B.2 — Catalog-owned external-menu facts capability**

1. Add a dedicated Catalog public reader/module rather than expanding `CatalogAdminService`, `CATALOG_AVAILABILITY_READER`, or `CATALOG_ORDER_FACTS_READER`. The contract should expose canonical category/item/modifier facts using stable IDs and provider-neutral Catalog semantics; date/time persistence values should be mapped at the Catalog boundary.
2. In the sole `ubereats.module.ts` composition root, adapt that Catalog public reader to one or more Uber application-owned internal query ports. Uber application/infrastructure code continues to depend only on Uber-owned ports; no Uber persistence file imports Catalog directly.
3. Use the capability to contract the active publication/draft/reference/default/operations/order-modifier Catalog reads while leaving Uber-owned `uber*` persistence, provider mapping and Store/POS/Orders seams untouched.
4. Keep API and dedicated worker composition aligned. The worker needs the same Catalog facts capability because imported Uber orders currently snapshot canonical modifier metadata before canonical Order ingestion.
5. Keep `external-channels -> runtime-data-ci-ops = 24` as a non-goal. Most touched adapters still require Prisma for Uber-owned persistence; the measurable architecture result is removal of cross-owner Catalog delegate access plus a one-way public `External -> Catalog` read dependency.
6. Treat the two `restore-source-price` reads in `uber-menu-config-import-prisma.adapter.ts` as transaction-sensitive during implementation review. Today they read Catalog source price/availability inside the Uber transaction that writes the override/audit event. Do not silently weaken that concurrency behavior; either characterize equivalent behavior before moving the read or defer those two calls to a separately authorized sub-slice.

##### Alternatives considered

- **Directly import a Catalog reader from Uber now:** rejected because it recreates the exact Phase 3 public SCC and should fail CI.
- **Preserve Catalog -> External and push a complete Catalog snapshot into new Uber public commands:** cycle-safe, but it would require moving or redesigning current Uber Admin draft/publish/query orchestration and complicate webhook-originated modifier fact reads. This has a materially larger API/controller/runtime surface than the dependency-inversion approach.
- **Create a durable Catalog-to-Uber projection/event stream:** architecturally viable for a future scale/reliability requirement, but currently disproportionate; it would add persisted projection/versioning/replay concerns and likely schema/migration authorization.
- **Move the cross-context contract into `common`/shared:** rejected because it would mis-own a business capability and violate the rule against using shared/foundation as a dependency-cycle escape hatch.

##### Authorized local implementation result

The user explicitly authorized the recommended dependency-direction change. Local source implementation on `refactor/phase8-slice8.2b-catalog-read-boundary` now completes 8.2B.1 and the safe portion of 8.2B.2:

- `CatalogUberAvailabilityOrchestrationService` depends on the Catalog-owned `CATALOG_EXTERNAL_AVAILABILITY_SYNC` outbound port. The only `UBER_EATS_MENU_AVAILABILITY` binding is in the existing scanner-excluded `catalog-uber-availability-orchestration.module.ts`, preserving synchronous best-effort behavior and the current Admin `uberSync` presentation/failure semantics.
- Catalog now owns `CATALOG_EXTERNAL_MENU_FACTS_READER`; its dedicated public module reuses the existing Prisma-owning `CatalogAdminService` via `useExisting`, matching the established Catalog availability/order-facts pattern and avoiding any increase in Catalog -> Runtime direct-import debt. The public contract exposes stable business identifiers, integer monetary facts and ISO timestamps; Catalog DB UUIDs and Prisma types do not cross the boundary.
- `ubereats.module.ts` adapts the Catalog public reader to the Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY` application port for both API and dedicated worker composition. Uber persistence imports only its own port and does not import `menu/public-api.ts` directly.
- Of the audited **17** production Catalog delegate reads, **15 are contracted**. Draft/publish source graphs, item/option/group defaults, existence checks, imported-order modifier snapshot facts and OpsTicket menu-item validation now resolve through the Catalog owner capability.
- The remaining **2** direct reads are exactly `restoreItemPrice()` and `restoreOptionPrice()` in `uber-menu-config-import-prisma.adapter.ts`. They remain deliberately on the existing Serializable transaction client because that path couples the source read with the Uber override/audit write. They are explicitly tagged as the **8.2B.3 transaction-sensitive tail** rather than weakening the existing atomicity/concurrency behavior.
- Architecture coverage pins the residual direct Catalog delegate set to those two reads, forbids Uber persistence from importing Catalog directly, and verifies the Catalog availability business service no longer imports Uber. Owner-side mapping coverage verifies category DB IDs do not leak, dates leave Catalog as ISO strings, and modifier child relations cross only as stable IDs.
- The public dependency graph is now cycle-safe: the Catalog business-source -> External public edge is removed and the canonical read direction is External -> Catalog. `legacyPublicCycleComponents` remains empty. The deep-import debt baseline remains unchanged (`external-channels -> runtime-data-ci-ops = 24`, Orders `1`, Identity `2`, Foundation `4`), so `tools/architecture/context-baseline.json` is not edited.

No Prisma schema/migration, dependency, provider-wire payload, webhook/idempotency, Orders lifecycle, POS connectivity or production Web Clover behavior is changed by this slice. No local lint/build/test/scanner result is claimed; GitHub CI is the validation gate.

### Slice 8.3 — Orders acceptance/cancellation atomic seam design/contraction

Dedicated design slice for `uber-order-action-prisma.adapter.ts`.

Before source changes, provide options that preserve:

- durable Uber action idempotency;
- Order acceptance exactly-once behavior;
- the current transaction/recovery guarantees;
- no accidental `prep_started` side effect;
- safe replay after process/provider failures.

Likely solution classes include an Orders-owned atomic acceptance capability usable from the coordinated transaction boundary, or a durable ownership handoff with equivalent recovery semantics. Do not choose between them without explicit architecture approval.

### Slice 8.4 — Evidence-driven L3 gap hardening

After 8.1-8.3, audit actual uncovered cases only. Existing webhook/action/menu replay and reconciliation behavior is preserved.

Potential candidates must be demonstrated by a concrete missing recovery/characterization case; `orders.customer_order_edit` remains provider-confirmation gated.

### Slice 8.5 — Conditional Production cutover compatibility cleanup

Only after explicit Production evidence/cutover authorization:

- remove historical Uber-store-ID OpsTicket compatibility if no longer required;
- remove eligible default-store/provider-identity compatibility remnants;
- then tighten scanner semantics so closed production compatibility references cannot silently remain.

### Slice 8.6 — Closeout

Synchronize:

- this Phase 8 plan/checklist;
- `current-dependency-graph.md` including the already-known `External -> Foundation = 10` baseline correction;
- `modularization-worklog.md`;
- machine baseline changes made by approved source slices;
- final-head CI and consolidated deployment/active-verification evidence.

## 6. Slice 0 checklist result

- [x] Confirm exact `dev` base and no newer merged commit at audit start.
- [x] Re-read repository and Uber architecture rules before proposing source changes.
- [x] Resolve authoritative External debt counts from the machine baseline.
- [x] Detect human-readable dependency-graph drift (`11` vs machine/source `10`).
- [x] Resolve all six External -> Identity direct-import debt statements.
- [x] Resolve all three incoming External composition debt statements.
- [x] Resolve the current ten External -> Foundation debt statements.
- [x] Classify Runtime/Data/Ops `24` by architectural layer and reject blanket metric contraction.
- [x] Identify and characterize the single External -> Orders ownership seam.
- [x] Review Uber public surface and representative external consumers.
- [x] Review durable webhook/action/menu recovery evidence and requirement matrix.
- [x] Review active/closed compatibility status and remaining production annotations/behavior.
- [x] Remove UberDirect from Phase 8 ownership scope.
- [x] Produce the exact recommended first source-slice scope and identify the later architecture-approval gate.

## 7. Change-control gates

Slice 0 is complete and has made **documentation changes only**. Production source remains untouched.

Before any source modification:

- user reviews this Slice 0 result;
- the next source slice must stay within the approved file/ownership scope;
- any architecture responsibility transfer, Prisma schema/migration, provider-wire change, compatibility cutover or protected production-boundary change requires explicit authorization;
- after local/source work, stop for review before remote PR/merge according to repository workflow;
- modularization code slices synchronize the phase document, current dependency graph and modularization worklog in the same change;
- final evidence is recorded only after the actual PR-head CI/merge/deployment gates occur.

## 8. Status log

### 2026-09-09 — Phase 8 planning document

- initial docs-only plan created from `dev@d1c7d7b3`;
- production code/schema/provider behavior unchanged.

### 2026-09-09 — Slice 0 read-only readiness audit

- base remained `dev@d1c7d7b3` throughout the audit;
- authoritative External outgoing direct debt is **41**, not 42: Foundation is already **10** in the machine baseline after PR #2258;
- inbound direct debt is **3**, all explicit Uber root-module composition seams;
- Identity 6, Foundation 10, Runtime 24 and Orders 1 were classified;
- the Orders 1 edge is an atomic ownership seam requiring a dedicated architecture design/authorization rather than a barrel export;
- broad Uber resilience rewrite is not justified by current evidence; existing durable inbox/action/reconciliation coverage is substantial;
- UberDirect is confirmed Commerce/Fulfillment-owned and removed from Phase 8 scope;
- next recommended source work is **Slice 8.1 Public boundary hygiene contraction**, pending user review/authorization.

### 2026-09-09 — Slice 8.1 merged

- implementation base was `origin/dev@96808b0e` after PR #2259 merged the Phase 8 planning/audit document;
- four Auth implementation imports moved to `auth/public-api.ts` with guard ordering and policy unchanged;
- six layer-legal API/infrastructure logger imports moved to `common/public-api.ts` with logger behavior unchanged;
- application-layer logger debt is retained because the existing telemetry port is not behavior-equivalent; no fake facade was added;
- machine baseline is Identity **2** and Foundation **4**, making External outgoing direct debt **31**;
- `SESSION_COOKIE_NAME`, `AuthModule`, `getLogContext()`, uploads layout, Orders acceptance and Runtime/Prisma seams remain intentionally unchanged;
- PR #2260 final head `8efeb5e6` passed CI #5414 and squash-merged to `dev` as `fc9bfc01`.

### 2026-09-09 — Slice 8.2A Store schedule ownership merged

- the merged-base audit confirmed Runtime/Data/Ops **24** is structurally expected and must not be used as a blanket contraction target;
- authorized Slice 8.2A reused `UBER_BUSINESS_SCHEDULE_QUERY_PORT` and provided it from the Uber composition root using `UBER_STORE_CONFIG_QUERY + STORE_SCHEDULE_READER`;
- all three production Uber persistence `BusinessHour` reads were removed; menu draft validation and menu workflow repository scope now consume the Uber application port;
- Store public API itself is unchanged, provider wire behavior is unchanged, and Runtime **24** / Orders **1** / Identity **2** / Foundation **4** baselines remain unchanged;
- PR #2261 final head `ce47baf1` passed CI #5418 and squash-merged to `dev` as `87ebad20`.

### 2026-09-09 — Slice 8.2B Catalog read-boundary local source

- audit and implementation base is merged `origin/dev@87ebad20`;
- user authorized the two-step dependency inversion: Catalog availability orchestration now uses a Catalog-owned outbound sync port with the Uber binding confined to the existing excluded composition module, removing the Catalog business-source -> External public edge without changing synchronous runtime behavior;
- a dedicated Catalog-owned external-menu facts reader/module now owns canonical Catalog Prisma query shapes and exposes only stable IDs/provider-relevant business facts/ISO timestamps through `menu/public-api.ts`;
- `ubereats.module.ts` adapts that capability to the Uber-owned `UBER_CATALOG_MENU_FACTS_QUERY` port for API and worker composition; Uber persistence does not import Catalog public surfaces directly;
- **15 of 17** audited Catalog delegate reads are removed from Uber persistence; the remaining two are only `restoreItemPrice()` / `restoreOptionPrice()` and are explicitly deferred as the **8.2B.3 transaction-sensitive tail** to preserve the existing Serializable restore/write/audit semantics;
- architecture and mapping coverage pin the one-way ownership boundary, stable-ID-only relation mapping and the exact two-read residual set; `legacyPublicCycleComponents=[]` and the deep-import baseline remain unchanged;
- no Prisma schema/migration, provider-wire payload, webhook/idempotency, Orders lifecycle, POS connectivity or production Web Clover change is introduced; no local lint/build/test/scanner result is claimed before remote CI.
