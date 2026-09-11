# Phase 8 — External Channels Boundary Contraction & L3 Resilience

Status: **SLICES 8.3A0 / 8.3C / 8.5 PRODUCTION VERIFIED — SLICES 8.3A / 8.3B / 8.4 / 8.6A MERGED / CI GREEN — CLOSEOUT ACTIVE VERIFICATION IN PROGRESS; MENU PUBLISH SCHEDULE FORWARD-FIX LOCAL / USER REVIEW PENDING**  
Slice 0 audit baseline: `origin/dev@d1c7d7b3e968d99dce1e3df39ca1af04a7696883`  
Slice 8.1 implementation baseline: `origin/dev@96808b0ec1adc984dae99dd73dbd0e8ce4f2c4a9`  
Slice 8.2A implementation baseline: `origin/dev@fc9bfc01f651c0d3193ee06e1d71ea0029e77835`  
Slice 8.2B implementation baseline: `origin/dev@87ebad20`  
Slice 8.2B.3 implementation baseline: `origin/dev@00561c82`  
Slice 8.3A0 implementation baseline: `origin/dev@f7b8710a`  
Slice 8.3A readiness/design baseline: `origin/dev@2589225d`  
Slice 8.3A implementation baseline: `origin/dev@f6e3f3db42a1de27d6d86cff7e8053e2dcaf795d`  
Slice 8.3B implementation baseline: `origin/dev@51bf909152ff5e6c1a98ca87bda2c5378705db42`  
Slice 8.3C implementation baseline: `origin/dev@29485a62e515b00ea9e62b7c5ef7c8f7c45d34d2`  
Slice 8.4 implementation baseline: `origin/dev@982b4de19d809dd0ca25d026ff4eb0ccde323791`  
Slice 8.5 implementation baseline: `origin/dev@466ae6332400a9368c9e9bbb8f88ef6e9b5b35da`  
Slice 8.6A implementation baseline: `origin/dev@54fa04dadaedb9a9e9cf0c2ae396f8fc18cef8ec`  
Baseline merges: PR `#2258` — Phase 7 Slice 5B; PR `#2259` — Phase 8 planning / Slice 0 audit; PR `#2260` — Phase 8 Slice 8.1; PR `#2261` — Phase 8 Slice 8.2A; PR `#2262` — Phase 8 Slice 8.2B; PR `#2263` — Phase 8 Slice 8.2B.3; PR `#2264` — Phase 8 Slice 8.3A0; PR `#2266` — Phase 8 A0 evidence / 8.3 plan sync; PR `#2267` — Phase 8 Slice 8.3A; PR `#2268` — Phase 8 Slice 8.3B; PR `#2269` — Phase 8 Slice 8.3C; PR `#2271` — Phase 8 Slice 8.4; PR `#2272` — Phase 8 Slice 8.5; PR `#2275` — Phase 8 Slice 8.6A  
Audit / implementation dates: 2026-09-09–2026-09-10

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

Slice 0 found that `brand-store.default-store-identity.v1` was already registered closed for the canonical runtime migration while production Uber source still retained historical compatibility behavior for old Uber-store-ID-scoped OpsTicket rows: legacy multi-ID ticket scope, persisted provider-ID resolution and `[storeStableId, uberStoreId]` alert lookup. A separate menu-availability path also still accepted `uberStoreId` as a SanQ Store alias.

This originally matched the earlier plan to preserve Test Store / historical Uber rows until a separate Production cutover cleanup. On 2026-09-10 the user confirmed that the current Uber integration history is disposable test data, but directed that data deletion be deferred until Uber Production Verification has passed so all accumulated test data can be removed together rather than through a narrow interim migration.

**Updated Phase 8 result:** Slice 8.5 removed those test-data-only persistence/identity compatibility paths and hardened the scanner against their return; PR #2272 / `fb6f3bb8` is merged and post-deploy verification passed. No Slice 8.5 data-cleanup migration is included. Existing Uber test records remain untouched until the dedicated post-Production-Verification cleanup. This does not generalize to Uber wire/protocol compatibility, which remains separately evidence-gated.

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
- The remaining **2** direct reads are exactly `restoreItemPrice()` and `restoreOptionPrice()` in `uber-menu-config-import-prisma.adapter.ts`. They were deferred as the **8.2B.3 transaction-sensitive tail** because the source read occurred inside the same transaction callback as the Uber override/audit write. Readiness review corrected an earlier documentation overstatement: these two restore transactions do **not** request `Serializable` isolation or lock the Catalog source row; production PostgreSQL reports `read committed`, so the existing source read is not a cross-owner atomicity guarantee.
- Architecture coverage pins the residual direct Catalog delegate set to those two reads, forbids Uber persistence from importing Catalog directly, and verifies the Catalog availability business service no longer imports Uber. Owner-side mapping coverage verifies category DB IDs do not leak, dates leave Catalog as ISO strings, and modifier child relations cross only as stable IDs.
- The public dependency graph is now cycle-safe: the Catalog business-source -> External public edge is removed and the canonical read direction is External -> Catalog. `legacyPublicCycleComponents` remains empty. The deep-import debt baseline remains unchanged (`external-channels -> runtime-data-ci-ops = 24`, Orders `1`, Identity `2`, Foundation `4`), so `tools/architecture/context-baseline.json` is not edited.

No Prisma schema/migration, dependency, provider-wire payload, webhook/idempotency, Orders lifecycle, POS connectivity or production Web Clover behavior is changed by this slice. No local lint/build/test/scanner result is claimed. PR #2262 final head `05291115` passed GitHub Actions CI #5427, including architecture baseline, API lint/build/strict/shared-strict/test and Web lint/build/strict/test, and squash-merged to `dev` as `00561c82`.

#### Slice 8.2B.3 — Restore-source-price Catalog ownership tail

Readiness review on `origin/dev@00561c82` confirmed that the two deferred restore paths do not need a new transaction-aware Catalog public API. `restoreItemPrice()` and `restoreOptionPrice()` use ordinary Prisma transactions with no explicit isolation level and no Catalog row lock; production PostgreSQL reports `read committed`. Their Catalog reads occur before any Uber override/audit write and do not depend on uncommitted state from the surrounding Uber transaction. This is also an existing Uber menu infrastructure pattern: `UberMenuWriteTransactionPrismaAdapter` already supplies the same owner facts port to draft mutation commands executed inside its transaction callback.

The local implementation therefore reuses the already-authorized `UBER_CATALOG_MENU_FACTS_QUERY` application port inside the existing restore transaction callback. Catalog item/option source facts are resolved through the Catalog-owned reader; only the Uber `uber*Config` upsert plus `ubereats_menu_price_restored` audit write remain in the local transaction. Missing owner facts preserve the existing `UBER_MENU_ITEM_NOT_FOUND` / `UBER_MENU_OPTION_NOT_FOUND` errors and produce no Uber write. This contracts the audited Catalog persistence-delegate set **17 -> 15 -> 0** without introducing a new public contract, DB UUID, Prisma type, dependency direction, schema/migration or provider behavior.

Focused characterization now verifies both restore operations consume owner facts, preserve the existing override/audit shapes, and suppress writes when the Catalog owner cannot resolve the requested stable ID. The architecture guard is tightened from the two-item allowlist to **zero** production Uber persistence access to `MenuCategory`, `MenuItem`, `MenuOptionGroupTemplate`, or `MenuOptionTemplateChoice`. `external-channels -> runtime-data-ci-ops` remains **24**, Orders **1**, Identity **2**, Foundation **4**, and `tools/architecture/context-baseline.json` remains unchanged. PR #2263 final head `f001d37a` passed GitHub Actions CI #5432, including architecture baseline, API lint/build/strict/shared-strict/test and Web lint/build/strict/test, and squash-merged to `dev` as `f7b8710a`.

Phase-closeout active verification should include both Admin restore-source-price actions: set an Uber-specific item/option price override, invoke restore, reload the draft, and confirm the displayed effective/source values return to Catalog truth without changing unrelated availability or menu configuration.

### Slice 8.3 — Orders ownership seams

#### Slice 8.3A0 — Remove test-era `UberOrderItemModifier` reverse persistence

Readiness audit on merged `origin/dev@f7b8710a` found a semantic ownership cycle before the remaining Uber -> Orders contraction: `OrderIngestionService` directly wrote the provider-named `UberOrderItemModifier` table. Production-source search found no reader of that delegate/model; the only runtime access was the ingestion `createMany()` write. The active modifier representation already persisted canonically through `ParsedUberModifier[] -> modifierSnapshots() -> NormalizedOrderItem.options -> OrderItem.optionsJson`. A read-only pre-migration DB inventory found **17 modifier rows / 12 OrderItems / 11 Orders / 0 non-Uber channel rows**. The user explicitly confirmed that all current UberEats integration data is test-only, no historical compatibility is required, and authorized destructive removal of this model/table and its migration.

The merged 8.3A0 implementation executes the authorized contraction stage of the persisted migration: the canonical `OrderItem.optionsJson` representation already exists and remains active, the obsolete table has zero production readers, no dual-write/backfill is required, and the user explicitly authorized discarding its test data.

- remove provider-specific `NormalizedOrderItem.external.modifiers` from the Orders ingestion public contract;
- stop `OrderIngestionService` from writing `uberOrderItemModifier`;
- stop the Uber import adapter from flattening parsed modifiers into that dead persistence payload;
- retain the active modifier snapshot path `ParsedUberModifier[] -> modifierSnapshots() -> NormalizedOrderItem.options -> OrderItem.optionsJson` unchanged;
- remove `OrderItem.uberModifiers` and Prisma model `UberOrderItemModifier`;
- add authorized migration `20260910111500_contract_uber_order_item_modifier/migration.sql` with a non-`CASCADE` `DROP TABLE "UberOrderItemModifier"` so an unexpected database dependency aborts deployment rather than being deleted implicitly;
- tighten architecture/characterization coverage so Orders ingestion cannot reintroduce the provider delegate/model and canonical `optionsJson` remains populated.

PR #2264 source head `18034f19` passed GitHub Actions CI #5435: Prisma Client generation, architecture baseline, API lint/build/strict/shared-strict/test and the complete Web job were green. The PR was squash-merged to `dev` as `2589225d`. This slice intentionally does **not** change Uber wire parsing, webhook idempotency, order admission/action state transitions, order amounts, canonical `OrderItem.optionsJson`, POS/Print behavior, Payments/Clover, package dependencies or any machine architecture import allowance. The direct-import counter `external-channels -> commerce-orders-fulfillment = 1` remains until the later 8.3 transition contraction; only the reverse semantic Orders -> External persistence write is removed.

Because this is a destructive migration, it must be applied before Uber Production traffic begins. If real Uber production orders exist before deployment, stop and re-audit instead of applying the test-data contraction unchanged. No current test-era `UberOrderItemModifier` data preservation is required. Deployment and active verification are now complete: the deployed database records migration `20260910111500_contract_uber_order_item_modifier` as applied and not rolled back, the obsolete table is absent, and API/DB/Uber worker/Web are healthy. The active Test Store order `82A94` imported once with its canonical modifier snapshot intact in `OrderItem.optionsJson`; POS receipt/kitchen printing rendered the selected options correctly, ACCEPT completed successfully with Uber HTTP 200, and a subsequent cancellation also completed successfully with the canonical Order reaching `refunded`. The inspected API/worker log window contains no legacy-table reference or related missing-table error. Slice 8.3A0 is therefore `PRODUCTION VERIFIED`.

#### Slice 8.3A — Canonical Order read ownership contraction — readiness/design

Read-only audit on merged `origin/dev@2589225d` identifies four remaining Uber persistence areas that directly read canonical `Order` facts:

| Uber persistence path | Direct Order read | Ownership assessment |
|---|---|---|
| `uber-order-action-prisma.adapter.ts` | `getOrderContext()` reads status/amount/reference/scheduling facts | pure canonical read; move behind Orders owner capability before changing `complete()` |
| `uber-order-sync-prisma.repository.ts` | `findSyncTarget()`, `listPending()`, `pendingSummary()` | pure sync/list/read facts; strongest low-risk 8.3A candidate |
| `uber-operations-prisma.repositories.ts` | `reconciliationOrders()`, `exists()` | pure reconciliation/existence facts; owner-readable without Uber persistence semantics |
| `uber-order-import-prisma.adapter.ts` | `findByExternalOrderId()` plus post-ingestion scheduled timing read | mixed seam: canonical Order facts are owner data, while processed webhook cursor remains Uber-owned |

The recommended 8.3A architecture is a **dedicated Orders-owned external-order facts reader/module** rather than exposing `OrdersService` or importing the full `OrdersModule` into the dedicated Uber worker. The owner contract should accept provider-neutral identity such as `channel + externalOrderId` / `orderStableId`, return canonical facts using stable business IDs, and expose no Prisma types or Orders DB UUIDs. `ubereats.module.ts` should adapt that owner capability to existing Uber application query/repository ports for both API and worker composition, following the same owner-reader/composition pattern already used for Catalog facts.

`findByExternalOrderId()` requires special treatment: today its Uber application result includes `orderId = Order.id` and then passes that DB UUID back into `saveExistingOrderCancellation()`. 8.3A must not legitimize that leak in a new public contract. Instead, compose the Orders-owned stable facts with the Uber-owned `UberWebhookInbox` cursor inside External Channels and return/use `orderStableId`; the cancellation write itself remains unchanged until 8.3C.

8.3A must not move `Order.status`, `OrderAmendment`, lifecycle `OpsEvent`, Uber action lease state, cancellation evidence or webhook state. No schema/migration is expected for this read-only ownership contraction. A new legitimate Orders public capability may be added, but no direct-import/public-cycle debt allowance should be increased. `external-channels -> commerce-orders-fulfillment = 1` is expected to remain until 8.3B removes the existing deep lifecycle import; any Runtime counter movement must be measured from the final implementation rather than promised in advance.

This design changes Orders public responsibility/module composition and therefore requires explicit architecture authorization before source implementation.

The user subsequently granted source authorization. Slice 8.3A added Orders-owned `ORDER_EXTERNAL_FACTS_READER` plus the narrow `OrderExternalFactsModule`, with provider-neutral `channel + externalOrderId` and `orderStableId` inputs, stable-only result identities and ISO timestamps. The Uber composition root maps that public reader to Uber-owned action, sync and operations query ports for both API and dedicated worker; the worker imports the narrow facts module and still does not import `OrdersModule`.

The audited pure Order delegate reads are removed from Uber persistence: action context, sync target/list/summary, reconciliation/existence, import existing-order lookup and imported scheduling lookup. Exactly three transaction-coupled reads remain deliberately local at the 8.3A merge point: two `tx.order.findUnique` reads in action completion and one `tx.order.findFirst` in cancellation persistence. They preserve the existing action lease/fence/status/event atomicity for 8.3B and cancellation evidence/amendment/refund/event atomicity for 8.3C. The import application boundary now carries `orderStableId`; the cancellation transaction resolves its internal `Order.id` locally without exporting it.

Deleting the obsolete Uber sync Prisma repository removed one production External -> Runtime direct import. The machine allowance therefore moved **24 -> 23**; External -> Orders remained **1**, Identity **2**, Foundation **4**, total External direct debt contracted **31 -> 30**, and the public direction remained External -> Orders with no public SCC. PR `#2267` final head `9b996892` passed CI `#5445` (API + Web), squash-merged to `dev` as `51bf9091`, and the merged head passed push CI `#5446`. No schema/migration, dependency manifest, provider wire, webhook inbox lifecycle, action/cancellation transaction, POS/Print or Payments/Clover behavior changed in 8.3A. Per the Phase-level verification cadence, no separate production active-test status is claimed for 8.3A.

#### Slice 8.3B — Provider-confirmed canonical transition ownership — transaction design gate

The current `UberOrderActionPrismaAdapter.complete()` is not a simple status write. One Prisma transaction currently performs the exact action lease lookup/fence, marks `UberOrderAction=SUCCEEDED`, conditionally moves canonical `Order.status`, writes `makingAt` / `readyAt` where applicable, and appends `order.accepted` for successful ACCEPT. Any downstream DB failure rolls the whole completion back. The confirmed transition surface covers **ACCEPT / READY_FOR_PICKUP / CANCEL / DENY**, not ACCEPT alone.

8.3B must preserve that atomicity while moving canonical Order mutation to Orders ownership. The preferred solution class is an **Orders-owned transaction coordinator/capability with a narrow same-transaction External extension**, modeled on the repository's existing `OrderIngestionWithinTransaction` pattern rather than two sequential service calls. The exact contract must preserve the lease-token fence before canonical transition and must not expose DB UUIDs outside the transaction boundary. ACCEPT remains `pending -> paid` plus `order.accepted` only; it must not synthesize `prep_started`, which remains owned by the durable Orders lifecycle.

A sequential `Uber complete -> Orders transition` or `Orders transition -> Uber complete` design is rejected because it creates a crash window where provider action success and canonical state diverge. A new distributed saga/outbox is also not justified unless evidence proves the existing shared-DB atomic model insufficient. This is an L3 state-transition/transaction-ownership change and requires explicit architecture authorization before implementation.

The user explicitly authorized this architecture on 2026-09-10. Slice 8.3B adds Orders-owned `ORDER_EXTERNAL_TRANSITION_COORDINATOR` plus the narrow `OrderExternalTransitionModule`. Orders opens the one shared Prisma transaction, invokes an explicit External extension first through an opaque transaction handle, and only after that extension returns a successful exact-lease fence result does Orders resolve the canonical order, perform the conditional `from -> to` transition, re-read after a lost conditional-update race, maintain `makingAt` / `readyAt` from the provider completion timestamp, and append idempotent `order.accepted` when acceptance is confirmed. The public Orders contract exposes no Prisma type, DB UUID, `clientRequestId` encoding or Uber-specific DTO.

`UberOrderActionPrismaAdapter` is correspondingly reduced to Uber-owned action persistence: `completeWithinTransaction()` validates the claimed `taskId + PROCESSING + leaseToken`, preserves the ACCEPT-only-to-`paid` guard, fences the same lease, stores the exact provider success HTTP status, clears lease state and returns only `externalOrderId + completedAt + acceptanceConfirmed`. It no longer opens the completion transaction, reads/writes canonical `Order`, or appends Orders lifecycle events. `ubereats.module.ts` is the sole cross-context composition point that binds `UBER_ORDER_ACTION_REPOSITORY` from this persistence adapter plus the Orders coordinator; both API and dedicated worker import the narrow transition module, while the worker still does not import `OrdersModule`.

Behavior is intentionally unchanged for ACCEPT / READY_FOR_PICKUP / CANCEL / DENY: a missing/replaced lease still returns false without a canonical mutation; transition `null` still permits a successfully confirmed provider action with no local order transition; ACCEPT remains `pending -> paid` plus deterministic `order.accepted` and never synthesizes `prep_started`; READY preserves the same `readyAt`; provider-confirmed CANCEL/DENY keep the application state-machine-selected `refunded` transition when a local order exists; replay at the target state remains idempotent. The separate cancellation-webhook ownership seam remained untouched in 8.3B.

This slice is treated as a controlled L3 provider cutover with **Test Store / Phase-closeout scoped rollout** rather than a parallel dual implementation: current Uber traffic remains pre-production, there is no persisted/public protocol contract being replaced, and maintaining two competing completion writers would itself violate the single-transaction invariant. The architecture allowance `external-channels -> commerce-orders-fulfillment` was removed entirely, and PR `#2268` final head `24d034e7` passed CI `#5448` before squash merge `29485a62`; merged-head CI `#5449` independently passed API + Web again. The resulting direct-import debt is **1 -> 0**, External total **30 -> 29**, Runtime remains **23**, and public SCC remains empty. No schema/migration or package dependency change was introduced in 8.3B. Phase-level active verification remains pending.

#### Slice 8.3C — Webhook cancellation evidence ownership — transaction/schema contraction

The pre-8.3C cancellation path was the final canonical-order write seam inside Uber persistence: `UberOrderImportPrismaAdapter` opened a transaction that wrote `UberOrderCancellation`, upserted Orders-owned `OrderAmendment`, set `Order.status=refunded`, and appended durable `order.cancelled`. Source audit found the structured `UberOrderCancellation` table had **one production writer and zero readers**, while the signed webhook receiver already durably stores the complete provider payload and event identity in `UberWebhookInbox` before processing.

A read-only production DB inventory before contraction found **21 `UberOrderCancellation` rows / 21 distinct events / 21 distinct orders**. All 21 events had corresponding durable `UberWebhookInbox` evidence and corresponding canonical `OrderAmendment`; the parity checks found zero missing inbox, amendment or Order references. Because current Uber records are Test Store data, the user explicitly authorized both the ownership move and destructive Prisma/table contraction on 2026-09-10.

The local 8.3C implementation therefore chooses deletion rather than preserving an unused mirror table. Orders owns a new provider-neutral `ORDER_EXTERNAL_CANCELLATION_FINALIZER` plus `OrderExternalCancellationModule`. Uber passes only stable `orderStableId`, `channel`, provider external/event identity, normalized reason/operator and ISO `occurredAt`. Orders independently verifies the stable/external identity, reads canonical `totalCents` and payment method, then in one owner transaction upserts a deterministic `EXTERNAL_CANCELLATION` `OrderAmendment`, converges the Order to `refunded`, and appends the existing deterministic `order.cancelled` lifecycle event. Replaying the same provider event remains convergent because amendment and lifecycle identities are deterministic/idempotent. The existing `uber_order_cancelled` structured log remains after successful finalization.

`UberOrderImportPrismaAdapter` no longer performs `tx.order.*`, `tx.orderAmendment.*`, cancellation `tx.opsEvent.*`, or `uberOrderCancellation` writes and no longer carries an Orders DB UUID. The dead top-level `saveImportedOrder().cancellation` compatibility input/branch is removed; the provider detail model's `ParsedUberOrder.cancellation` field is intentionally retained. Both API and dedicated worker import only the narrow cancellation module; the worker still does not import full `OrdersModule`.

Prisma relation `Order.uberCancellations` and model `UberOrderCancellation` are removed. Migration `20260910131300_contract_uber_order_cancellation` drops only `"UberOrderCancellation"` and deliberately does not use `CASCADE`, so an unexpected dependency blocks deployment instead of being silently removed. Durable provider evidence remains in `UberWebhookInbox`; canonical history remains in `OrderAmendment`, Order status and lifecycle events. UUID-backed model inventory contracts **65 -> 64**. Before production contraction, the final read-only parity check still found **21/21/21** cancellation rows/events/orders, zero missing inbox/amendment/Order references, and all 21 corresponding inbox rows already `PROCESSED`. After the new runtime was deployed, Test Store order `E3563` (`orderStableId=cmtvwu3nm0001pb015ik73g0f`) completed normally and Uber later delivered real `orders.failure` event `4afc3ecf-f339-5a92-8eed-769d29f4cc7d`; the inbox processed it once (`attemptCount=1`, no error), the worker recorded `UBER_ORDER_FAILURE` with `refundCents=367`, and the legacy table remained at 21 rows before migration. The authorized production migration was then applied successfully at 2026-09-10 18:13 EDT; Prisma migration history records it finished without rollback, `UberOrderCancellation` is absent, while `UberWebhookInbox` and `OrderAmendment` remain present.

Because this is a destructive contract step, production rollout was staged: the 8.3C API + Uber worker code was deployed first while the legacy table still existed; runtime health, real `orders.failure` handling, and absence of legacy-table writes/errors were verified; the user then executed the separately authorized production migration. Post-migration checks show API/Web/DB/Uber worker containers healthy and no `UberOrderCancellation` / missing-table errors in API or worker logs. This closes the early destructive-migration gate for 8.3C; later Phase 8 closeout still owns the broader consolidated provider verification.

8.3C makes no machine import-baseline change because 8.3B already reduced External -> Orders direct debt to **0**. Runtime remains **23**, External total **29**, and public SCC remains empty. PR `#2269` final head `35defb4b` passed CI `#5453`, squash-merged as `982b4de1`, and merged-head CI `#5454` / `#5455` passed API + Web. Provider wire schema, webhook signature/idempotency/inbox leases and retries, action commands, POS/Print and Payments/Clover behavior are intentionally unchanged. With the real E3563 `orders.failure` evidence, successful destructive migration, post-migration schema check and clean runtime logs, Slice 8.3C is **PRODUCTION VERIFIED** and its early migration gate is closed; the broader Phase 8 closeout verification remains pending.

### Slice 8.4 — Evidence-driven L3 gap hardening

After 8.1-8.3, audit actual uncovered cases only. Existing webhook/action/menu replay and reconciliation behavior is preserved.

Potential candidates must be demonstrated by a concrete missing recovery/characterization case; `orders.customer_order_edit` remains provider-confirmation gated.

The merged `dev@982b4de1` audit found one concrete uncovered crash/replay gap in the financial-report artifact side effect. `eats.report.success` is processed from the durable `UberWebhookInbox`; after downloading a CSV section, the pre-8.4 artifact store wrote a filename prefixed with `Date.now()`. If the file write committed but `UberFinancialReport.markReady()` or the later inbox `markSucceeded()` did not commit before process loss, replay downloaded the same section again and wrote a second timestamp-named copy. Order/menu/store branches were inspected before selecting this slice: menu notification uses a conditional `SUBMITTED` update, menu refresh carries a deterministic provider idempotency key, store provisioning is an idempotent update, and store-status handling has no durable business mutation. No equally concrete uncovered business-side-effect gap was demonstrated there.

The merged 8.4 source hardens only `UberFinancialReportArtifactStore`. New artifact identity is deterministic over raw `workflowId + logical section identity + CSV content hash`; URL rotation alone therefore does not create a second artifact, while genuinely different CSV bytes remain distinct evidence. Files are written to a same-directory unique temporary file, flushed, then atomically published with a hard link. Replay that finds the deterministic final path already present verifies byte equality and reuses it; a mismatched existing artifact fails closed rather than overwriting evidence. Normal error paths remove their temporary file. Existing public artifact URLs, 25 MB limits, HTTPS/SSRF checks, reporting status/error semantics, provider wire payloads and database schema are unchanged.

Focused characterization covers the exact gap: the same workflow/section/content replay returns one URL and one CSV file with no normal-path temp residue; changed content produces a distinct artifact; an existing deterministic path with different bytes fails closed; and the application use case can retry after artifact download succeeded but READY persistence failed, while already-READY reports still skip redownload. No Prisma/migration, package/dependency, DI, machine import-baseline or `orders.customer_order_edit` change is included. PR `#2271` final head `59ed147b` passed PR CI `#5463`, squash-merged to `dev` as `466ae633`, and merged-head GitHub Actions CI `#5464` passed API + Web. Slice 8.4 is therefore **MERGED / CI GREEN**; production/reporting active verification remains part of Phase closeout and provider scope availability.

### Slice 8.5 — Pre-production test-era compatibility cleanup + provider compatibility gate

The user's explicit no-compatibility decision for current Uber test data supersedes the earlier requirement to retain compatibility source for historical Test Store rows. Historical provider-ID-scoped compatibility branches that exist **only** for disposable test records may be contracted before Production, but the records themselves are retained until Uber Production Verification passes. After verification, all accumulated Uber test data is to be removed together in a separately reviewed cleanup rather than through a Slice 8.5 narrow data migration.

Read-only production inventory on 2026-09-10 found the remaining identity tail is narrow and attributable: `UberOpsTicket` contains **15 OPEN `STORE_STATUS_SYNC` rows** under Test Store provider UUID `47f93365-f7dc-4b49-9e3b-a99e9915e558`, whose current mapping points to canonical `4750_Yonge_Street`; `UberReconciliationReport` contains **one** historical `storeId='default'` row. The other audited Uber store-scoped configuration/publish rows are already canonical. These rows are confirmed test data, but they are intentionally retained now; they will be deleted together with the rest of the Uber test dataset only after Uber Production Verification passes.

Merged Slice 8.5 source from PR `#2272` / squash merge `fb6f3bb8` therefore:

- removes `UberOpsTicketStoreScope`, `legacyUberStoreIds`, `persistedStoreScopeId`, mapping-based ticket-scope expansion and provider-ID-to-canonical retry resolution; OpsTicket list/count/summary/retry now carry the persisted canonical `storeStableId` directly;
- removes the historical `OFFLINE -> PAUSED` OpsTicket parser compatibility while keeping current internal `ONLINE | PAUSED` semantics and the normal `storeStableId <-> uberStoreId` mapping validation for Store Status retries;
- changes store-status alert deduplication to canonical `storeStableId + targetStatus` only, so provider UUID scope and legacy `OFFLINE` context are no longer matched;
- removes the menu-availability `uberStoreId` alias/fallback and makes the direct availability transport use `storeStableId`; missing canonical mappings are not represented by provider UUIDs;
- adds a general architecture-scanner rule that any `@compat` annotation for a registry entry already marked `closed` is a failure, plus specific guards preventing this Store-identity compatibility behavior from returning without an annotation;
- intentionally includes **no data-cleanup migration**. The inventoried Test Store records remain in place until Uber Production Verification passes, at which point the complete accumulated Uber test dataset will be inventoried and removed in one separately authorized cleanup.

This does **not** waive protocol compatibility. Provider wire DTOs, webhook signature/envelope handling, idempotency semantics, verification requirements, the narrowly observed Sandbox CANCEL `200 + empty body` success compatibility, Store response field normalization and any compatibility required by the Uber production API remain evidence-gated and unchanged. No context direct-import allowance or public dependency direction changes in 8.5: External -> Orders remains **0**, Runtime remains **23**, External direct debt total remains **29**, and public SCC remains empty. PR-head CI `#5467` and merged-head CI `#5468` passed API + Web. Post-deploy active verification confirmed canonical `4750_Yonge_Street` Operations/Reconciliation queries, POS pause/resume -> Uber Store Status `200/SUCCEEDED`, item availability off/on -> Uber `204/SYNCED`, and clean API/worker identity logs; no new provider-UUID-scoped OpsTicket was created. Slice 8.5 is therefore **PRODUCTION VERIFIED**. Test-data deletion remains deferred until Uber Production Verification passes.

### Slice 8.6 — Closeout

#### Slice 8.6A — Application Diagnostic Logging Boundary

Closeout audit on `origin/dev@54fa04da` found one remaining source-level mismatch with the Uber bounded-context rule that `application` depends only on `application/domain/contracts`: `uber-merchant-provisioning.service.ts` and `uber-merchant-store-mapping.service.ts` still constructed Foundation `AppLogger` directly. Slice 8.1 had deliberately retained those imports because `UberTelemetryPort.workflowLog()` filters ordinary merchant diagnostic messages while `captureEvent()` persists `OpsEvent`; neither behavior is equivalent to the existing plain log side effect.

Merged 8.6A source introduces the narrow application-owned `UBER_DIAGNOSTIC_LOG_PORT`. The merchant application use cases emit the same message text and class context through that port; `UberTelemetryService` implements the log-only adapter with `AppLogger` and the existing common wiring aliases the new token to that service. `diagnosticLog()` performs no `OpsEvent` create/upsert, so the ownership contraction does not convert diagnostics into durable business events. Architecture coverage forbids the two merchant application files from importing/constructing Foundation logging directly and pins the application-port wiring. PR `#2275` final head `ae605c6c` passed PR CI `#5476`, squash-merged to `dev` as `f8896493`, and merged-head CI `#5477` passed API + Web again.

This removes exactly the two intentional application-layer Foundation direct imports identified in Slice 8.1. The machine baseline is now `external-channels -> architecture-foundation` **4 -> 2** and External outgoing direct debt **29 -> 27**; the remaining Foundation debt is the infrastructure-only `getLogContext()` and accounting uploads-layout seam. External -> Orders remains **0**, Runtime remains **23**, Identity remains **2**, and public SCC remains empty. No Prisma/schema/migration, provider wire, OAuth, Store/Menu/Order behavior, webhook/idempotency, Payments/Clover or dependency change is included.

#### Closeout forward-fix — Menu Publish Store Schedule

The first consolidated 8.2A active-verification pass found a real source gap after 8.6A deployment: Admin Dry Run Publish displayed every weekday as `00:00–23:59` even though production Store schedule data for `4750_Yonge_Street` contains configured non-24-hour hours. Read-only DB evidence confirmed Store timezone `America/Toronto`, `salesTaxRate=0.13`, and seven explicit `BusinessHour` rows (for example Monday-Friday `08:00–22:30`, Sunday `12:00–21:00`). The mismatch was therefore source behavior rather than missing Store data.

Root cause: Slice 8.2A moved draft/read schedule consumers behind `UBER_BUSINESS_SCHEDULE_QUERY_PORT`, but `PublishUberMenuUseCase` still generated a private seven-day `00:00–23:59` availability array. The local forward-fix removes that hard-coded path. `UberMenuSnapshotPrismaAdapter` now consumes the same application-owned business-schedule port already backed by Store-owned `STORE_SCHEDULE_READER`, converts the real recurring hours through `toUberServiceAvailability`, and includes that result in `UberMenuPublishSnapshot`; Dry Run and formal Publish both consume `snapshot.serviceAvailability`. Existing timezone/tax validation and error codes are preserved, and empty/invalid schedules still fail closed before provider upload. Focused regression/architecture coverage pins a real `08:00–22:30` example and forbids the `23:59` hard-coded publish fallback from returning.

This forward-fix makes **no dependency-graph or machine-baseline change**: External -> Foundation remains **2**, Orders **0**, Identity **2**, Runtime **23**, total direct debt **27**, and public SCC remains empty. It introduces no Prisma/schema/migration, provider wire schema/API-path, OAuth, payment/Clover or compatibility change; the intentional provider-visible behavior correction is limited to `service_availability` values now reflecting the configured Store schedule instead of the erroneous 24-hour fallback. The Uber Store API continuing to omit its timezone is separately supported by the existing manual-confirmation gate; absence of Uber timezone is not the cause of this schedule defect.

#### Slice 8.6B — Documentation + consolidated closeout evidence

Synchronize:

- this Phase 8 plan/checklist;
- `current-dependency-graph.md`, including final External direct-debt counts after 8.6A (`Foundation=2`, `Orders=0`, `Identity=2`, `Runtime=23`);
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
