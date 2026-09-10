# Phase 8 — External Channels Boundary Contraction & L3 Resilience

Status: **SLICE 8.1 LOCAL SOURCE COMPLETE — PENDING REVIEW**  
Slice 0 audit baseline: `origin/dev@d1c7d7b3e968d99dce1e3df39ca1af04a7696883`  
Slice 8.1 implementation baseline: `origin/dev@96808b0ec1adc984dae99dd73dbd0e8ce4f2c4a9`  
Baseline merges: PR `#2258` — Phase 7 Slice 5B; PR `#2259` — Phase 8 planning / Slice 0 audit  
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

#### Slice 8.1 local implementation result

Local source on `refactor/phase8-slice8.1-public-boundary-hygiene-v2` implements the narrow path contraction without changing Uber business/provider behavior:

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

No local lint/build/test/scanner was run; GitHub Actions remains the validation gate after user review and remote-delivery authorization.

### Slice 8.2 — Runtime/persistence semantic ownership audit and containment

Do **not** target `runtime-data-ci-ops 24 -> 0`.

Instead review the layer-correct persistence adapters for cross-owner database semantics: direct writes/queries of Orders, POS projections, Store facts or other owner data that bypass an owner capability/read model contract. Retain legal Prisma infrastructure access.

Any newly discovered responsibility transfer must be documented and authorized before implementation.

### Slice 8.3 — Orders acceptance atomic seam design/contraction

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

### 2026-09-09 — Slice 8.1 local source

- implementation base is `origin/dev@96808b0e` after PR #2259 merged the Phase 8 planning/audit document;
- four Auth implementation imports moved to `auth/public-api.ts` with guard ordering and policy unchanged;
- six layer-legal API/infrastructure logger imports moved to `common/public-api.ts` with logger behavior unchanged;
- application-layer logger debt is retained because the existing telemetry port is not behavior-equivalent; no fake facade was added;
- machine baseline is updated to Identity **2** and Foundation **4**, making External outgoing direct debt **31**;
- `SESSION_COOKIE_NAME`, `AuthModule`, `getLogContext()`, uploads layout, Orders acceptance and Runtime/Prisma seams remain intentionally unchanged;
- source/docs are local only; lint/build/test/scanner and remote CI are not yet run.
