# Phase 7 — Store Operations / POS / Print Boundary Contraction

Start date: 2026-09-09  
Current implementation base: `origin/dev@af8b4d63`  
Current status: **SLICE 5A LOCAL IMPLEMENTATION / REVIEW PENDING — additive read-model expand + shadow parity only**

## Goal

Phase 7 continues the 12-context modularization after Phase 6 payment source/architecture closeout. The owner context is **Store Operations / POS / Print**: store-facing POS interaction, POS device operation, print-job delivery/ack/retry, and printer-agent behavior.

The phase must reduce remaining implementation-path debt without moving Orders, Payments, Brand/Store, Identity, Uber, or printer-driver ownership into POS. Existing production POS behavior, durable order/print lifecycle, device authentication, payment compatibility gates, and independently deployed printer-agent contracts remain protected.

## Entry state

At `origin/dev@376a7c37`, the monotonic direct-import baseline records:

- `store-operations-pos-print -> architecture-foundation = 7`
- `store-operations-pos-print -> brand-store = 2`
- `store-operations-pos-print -> external-channels = 1`
- `store-operations-pos-print -> identity-customer-benefits = 14`
- `store-operations-pos-print -> runtime-data-ci-ops = 5`
- total Store Operations / POS / Print direct debt = **29**
- public SCC = **empty**

The Phase 7 readiness audit identified the Identity pair as the safest first contraction. Thirteen of the fourteen direct imports are only staff-auth transport dependencies (`SessionAuthGuard`, `RolesGuard`, `Roles`) that are already exported by `apps/api/src/auth/public-api.ts`. The remaining direct import is `PosModule -> AuthModule`, a legal Nest composition seam. Slice 1 deliberately keeps that composition seam rather than re-exporting `AuthModule` solely to reduce a numeric count.

## Hard guardrails

- Production Web Clover and deferred POS Clover Terminal cutover paths remain outside Phase 7.
- Orders remains owner of order aggregate/lifecycle; Payments remains owner of payment truth; Brand/Store remains owner of store status/configuration facts.
- POS device credential persistence/authentication remains behind existing POS public capabilities.
- Guard order, role names, routes, request/response contracts, store scoping, and operator authorization semantics must not change.
- No Prisma schema/migration, dependency manifest/lockfile, provider protocol, print wire contract, PWA contract, or compatibility path changes are part of Slices 1–3.
- The retained `PosModule -> AuthModule` direct composition import is not permission for controllers/services to deep-import Identity internals.

## Slice 1 — POS staff-auth public-boundary contraction

Status: **MERGED / CI GREEN** — PR #2250; final head `4b44debc`; squash merge `66f29561`; final PR CI #5374 passed API and Web. The initial PR run #5373 reached a green architecture gate but failed API lint only on Prettier formatting in the new architecture assertions; the formatting-only follow-up produced the final green head.

Migration classification: **Class A atomic internal boundary contraction**. The owner public surface already exists and all affected API consumers are changed atomically. No persisted/public/external contract changes.

### Source change

The following production consumers now import `SessionAuthGuard`, `RolesGuard`, and/or `Roles` only from `../auth/public-api`:

- `apps/api/src/pos/pos-orders.controller.ts`
- `apps/api/src/pos/pos-store-status.controller.ts`
- `apps/api/src/pos/pos-summary.controller.ts`
- `apps/api/src/pos/pos-exchange-rate.controller.ts`
- `apps/api/src/pos/pos.module.ts` (`RolesGuard` only)

`apps/api/src/pos/pos.module.ts` intentionally continues importing `AuthModule` from `../auth/auth.module` for Nest composition. No `AuthModule` public re-export or wrapper module is added.

### Architecture guard

`apps/api/src/pos/pos-device-management.architecture.spec.ts` now requires the four POS controllers to consume Identity auth guards/role metadata through `../auth/public-api`, rejects regressions to `session-auth.guard`, `roles.guard`, or `roles.decorator`, confirms the Identity public surface still exports the three required symbols, and pins the retained direct seam to `PosModule -> AuthModule` while requiring `RolesGuard` to remain public-surface traffic.

The monotonic scanner allowance is contracted in the same change:

```text
store-operations-pos-print -> identity-customer-benefits
14 -> 1
```

Therefore Store Operations / POS / Print total direct debt contracts:

```text
29 -> 16
```

The remaining direct Identity edge is only the explicit Nest composition import. Public imports through `auth/public-api.ts` are approved public-contract traffic and do not consume direct-debt allowance.

### Preserved behavior / explicit non-scope

Slice 1 does **not** change:

- `@UseGuards(...)` ordering or `@Roles('ADMIN', 'STAFF')` semantics;
- POS device guard/credential behavior;
- POS routes, DTOs, store scoping, order management, summary, exchange-rate, or store-status behavior;
- `AuthModule` composition or provider identity;
- Orders/Payments/Clover/Uber/printing behavior;
- Prisma/schema/migrations;
- dependency manifests/lockfile;
- active compatibility records.

### Verification state

No local lint/build/test/scanner command was run before Slice 1 review, per `AGENTS.md`. After remote authorization, PR #2250 final head `4b44debc` passed GitHub Actions CI #5374 including the architecture baseline gate, API lint/build/strict checks/full tests, and Web checks before squash merge `66f29561`.

No separate production active test is expected for Slice 1 because it is import-path-only and preserves runtime class/decorator/provider identity. Its Phase-level closeout verification should nevertheless confirm normal ADMIN/STAFF POS access remains unchanged after the final Phase 7 state is deployed.

## Slice 2 — Brand/Store status read-capability contraction

Status: **MERGED / CI GREEN** — PR #2251; final head `424d06fa`; squash merge `8f78f0b5`; final PR CI #5378 passed API and Web after two Prettier-only lint follow-ups.

Migration classification: **Class A atomic internal boundary contraction**. Brand/Store already owns schedule, temporary-closure, timezone and store-status calculation. Slice 2 exposes only the read projection required by the POS connectivity watchdog and updates all production consumers atomically; no persisted/public HTTP/provider contract changes.

### Source change

Brand/Store now defines `STORE_STATUS_READER`, `StoreStatusReaderPort`, and a narrow `StoreStatusReadSnapshot` under `store-status.contract.ts`. The snapshot intentionally contains only the watchdog facts: `isOpenBySchedule`, `isTemporarilyClosed`, `timezone`, and `today.date/closeMinutes`.

`StoreStatusModule` binds the token with `useExisting: StoreStatusService` and exports the token rather than the concrete service. `store/public-api.ts` exposes the token/port/snapshot plus `StoreStatusModule`; it does not expose `StoreStatusService`.

To keep that public module export cycle-free, `StoreStatusService` no longer imports its own context through `./public-api`. Its Brand/Store-internal config and schedule dependencies now come directly from `brand-store-config.contract.ts` and `store-schedule.contract.ts`. No `forwardRef`, wrapper module, global module, duplicate service, or service locator is introduced.

POS then consumes the owner boundary only:

- `PosConnectivityWatchdogService` injects `STORE_STATUS_READER` as `StoreStatusReaderPort` and retains the same `getCurrentStatus(storeStableId)` behavior;
- its `resolveScheduleCloseAt()` helper accepts the narrow `StoreStatusReadSnapshot` instead of deriving a type from the concrete service;
- `PosModule` imports `StoreStatusModule` from `../store/public-api` instead of `../store/store-status.module`.

### Architecture guard and graph effect

`pos-device-management.architecture.spec.ts` now guards the complete seam: POS production code must consume Store status through `../store/public-api`, the public boundary must not export `StoreStatusService`, the Store module must bind/export only `STORE_STATUS_READER`, the public snapshot must remain narrow, and `StoreStatusService` must not re-import `./public-api` and recreate a barrel cycle.

The two remaining direct implementation imports are removed, so the monotonic allowance is deleted rather than set to zero:

```text
store-operations-pos-print -> brand-store
2 -> 0
```

Therefore Store Operations / POS / Print total direct debt contracts:

```text
16 -> 14
```

The POS -> Brand/Store public dependency direction already existed before this Slice through Brand/Store configuration capabilities, so Slice 2 does not introduce a new context direction.

### Preserved behavior / explicit non-scope

Slice 2 does **not** change:

- store-hours, holiday or timezone calculation;
- temporary-close expiry semantics or the persisted pause reason;
- watchdog heartbeat thresholds, opening grace, recovery stabilization, retry behavior, or device queries;
- Uber pause/resume target, reason or `pauseUntil` calculation;
- POS store-status routes, staff pause/resume behavior or realtime broadcasts;
- `/public/store-status` response behavior;
- Orders, Payments/Clover, printing, Prisma/schema/migrations, dependencies/lockfile, or compatibility records.

### Verification state

Per `AGENTS.md`, no local lint/build/test/scanner command was run before review. After remote authorization, PR #2251 final head `424d06fa` passed GitHub Actions CI #5378 including the architecture baseline gate, API lint/build/strict checks/full tests, and Web checks before squash merge `8f78f0b5`. The two earlier runs failed only Prettier formatting in the new architecture assertions.

Existing watchdog characterization coverage remains applicable to non-business-hours suppression, opening grace, offline Uber pause-until-close, preservation of employee-selected pauses, next-business-day re-evaluation, and canonical temporary-close recheck before recovery. No separate production active test is expected for this boundary-only Slice; final Phase 7 closeout should exercise the affected POS connectivity/store-status behavior once from the consolidated merged state.

## Slice 3 — API Foundation public-surface contraction

Status: **MERGED / CI GREEN** — PR #2252; final head `fedeb9fe`; final PR CI #5382 passed Architecture, API/Web lint/build/strict checks and tests; squash merge `d3b7996b`. CI #5380 had failed only Prettier formatting in the new architecture assertion, and source/formatting head `e0112d3f` then passed CI #5381 before the final docs-only evidence head.

Migration classification: **Class A atomic internal boundary contraction**. Slice 3 does not redefine POS connectivity ownership or create a new Foundation abstraction. It only moves neutral API utilities that already belong to `architecture-foundation` behind one explicit API public surface and removes the accidental POS pass-through ownership of Foundation pipes.

### Source change

`apps/api/src/common/public-api.ts` now exposes exactly the neutral utilities required by POS in this Slice:

- `AppLogger`;
- `StableIdPipe`;
- `ZodValidationPipe`.

The three POS logger consumers (`pos-connectivity-watchdog.service.ts`, `pos-exchange-rate.service.ts`, and `pos-store-status.service.ts`) import `AppLogger` through `../common/public-api`. `pos-orders.controller.ts` imports `StableIdPipe` and `ZodValidationPipe` from the same Foundation public surface while retaining only `AuthenticatedPosIdentity` from the POS owner public API.

`apps/api/src/pos/public-api.ts` no longer re-exports `StableIdPipe` or `ZodValidationPipe`. Those utilities are Foundation-owned transport primitives rather than POS capabilities, and no production cross-context consumer requires the POS pass-through.

### Intentional remaining Foundation seam

`apps/api/src/common/pos-connectivity.ts` is deliberately **not** exported from `common/public-api.ts`. Its heartbeat metadata, timeout defaults and connectivity-resolution semantics are POS operational behavior that is also consumed by Uber order admission. Hiding that ownership question behind the generic Foundation barrel would make the scanner count look cleaner while freezing the wrong ownership model.

Therefore `PosDeviceService` and `PosConnectivityWatchdogService` continue importing `../common/pos-connectivity` directly in Slice 3. Those two imports remain an explicit follow-up signal rather than being normalized as public Foundation traffic.

### Architecture guard and graph effect

`pos-device-management.architecture.spec.ts` now requires the neutral logger/pipes to come through `common/public-api.ts`, prevents POS from regaining `common/app-logger` or `common/pipes/*` implementation imports, verifies that POS no longer re-exports the Foundation pipes, and separately pins the two intentional `common/pos-connectivity` imports while requiring that file to stay out of the Foundation public surface.

The monotonic scanner allowance contracts:

```text
store-operations-pos-print -> architecture-foundation
7 -> 2
```

Therefore Store Operations / POS / Print total direct debt contracts:

```text
14 -> 9
```

The expected remaining Phase 7 direct debt after Slice 3 is:

```text
architecture-foundation     2  # explicit POS connectivity ownership seam
external-channels           1  # legal UberEatsModule composition entry
identity-customer-benefits  1  # retained AuthModule composition seam
runtime-data-ci-ops         5  # mostly POS-owned persistence/composition
```

### Preserved behavior / explicit non-scope

Slice 3 does **not** change logger behavior, validation rules, StableId semantics, POS routes, DTOs, device/auth behavior, connectivity heartbeat/timeout calculation, Uber pause/resume/provider behavior, Orders/Payments/Clover, printing, Prisma/schema/migrations, dependencies/lockfile, or compatibility records.

Per `AGENTS.md`, no local lint/build/test/scanner command was run before review. GitHub Actions remains the authoritative verification gate after remote delivery.

## Slice 4 — POS connectivity -> Uber Store Status ownership contraction

Status: **MERGED / CI GREEN** — PR #2253; final PR head `f2ad198a`; squash merge `af8b4d63`; final PR CI #5387 and resulting `dev` push CI #5388 both passed. Initial CI #5385 failed only four Prettier formatting findings after Architecture had passed, and source/formatting head `bb6b6595` then passed CI #5386 before the final docs evidence head.

Migration classification: **Class A atomic ownership contraction with the Uber L3 Phase-closeout verification gate**. No persisted/external wire contract, provider command shape, idempotency rule, route or independently deployed consumer changes. The cross-context public capability changes atomically with all in-repository consumers; provider-store mapping stays inside the existing Uber bounded context.

### Source change

`PosConnectivityWatchdogService` no longer reads `prisma.uberStoreMapping`. It still reads POS-owned `PosDevice` heartbeat persistence directly, but sends only SanQ `storeStableId`, target status, and the existing connectivity pause metadata through `UBER_EATS_STORE_STATUS_SYNC`.

The Uber public store-status capability now exposes `syncStoreStatusForStore()` with `UberEatsStoreStatusForStoreInput { storeStableId, targetStatus, reason?, pauseUntil? }`. The previous public target carrying provider `uberStoreId` is removed from `public-api.ts`; Uber's concrete use case keeps its internal `UberStoreStatusTarget` for its own Ops/retry paths.

`UberStoreMappingRepositoryPort` adds `findProvisionedMappingsByStoreStableId()`, implemented by `UberStoreMappingPrismaAdapter` with the same canonical mapping facts the watchdog previously queried: `posExternalStoreId = storeStableId` and `isProvisioned = true`. `SyncUberStoreStatusUseCase.syncStoreStatusForStore()` resolves those mappings inside Uber and sequentially reuses the existing per-provider-target sync path. It accumulates successful stores, treats no matching/provisioned mappings as a non-failure skip, and returns immediately on the first provider `FAILED` result so the watchdog's retry/backoff behavior remains unchanged.

### Preserved behavior / verification scope

Slice 4 preserves opening grace, heartbeat thresholds, schedule-close `pauseUntil`, reason `POS connectivity lost`, employee temporary-pause precedence, 30-second recovery stabilization, canonical Store re-check before resume, retry/backoff, provider status payload/idempotency/telemetry/alert behavior and the current `SKIPPED`-is-not-watchdog-failure rule. It does not write connectivity state into Brand/Store temporary closure.

Focused characterization now covers pause and recovery using only `storeStableId`, multi-mapping success, and fail-fast after the first mapped provider failure. `pos-device-management.architecture.spec.ts` prevents POS from regaining `UberStoreMapping`/`uberStoreId` knowledge and requires mapping resolution to remain behind the Uber repository/public capability.

This Slice intentionally makes **no direct-debt or SCC baseline change**. The expected remaining Phase 7 direct debt stays **9** (`architecture-foundation 2`, `external-channels 1`, `identity-customer-benefits 1`, `runtime-data-ci-ops 5`) because the watchdog still legitimately uses Prisma for POS-owned device heartbeat persistence and `PosModule -> UberEatsModule` remains the legal Uber composition seam. Public SCC remains expected empty.

Per `AGENTS.md`, no local lint/build/test/scanner command is run before review. Because this changes the active Uber store-status runtime path, final Phase 7 consolidated verification must actively exercise POS offline -> Uber PAUSED until current business-day close, stable POS recovery -> Uber ONLINE, employee pause preservation, successful Uber telemetry, and absence of new mapping/retry errors.

## Slice 5A — POS connectivity purpose-built read-model expand + shadow parity

Status: **LOCAL IMPLEMENTATION / REVIEW PENDING** on `refactor/phase7-slice5a-pos-connectivity-read-model`, based on `origin/dev@af8b4d63`. No remote push/PR/CI/deployment/active verification has been performed yet.

Migration classification: **Class B expand-contract with Uber L3 verification**, explicitly authorized for an additive Prisma schema + migration only. Slice 5A does not cut admission truth and does not delete any legacy persistence path. Compatibility is registered as `pos-connectivity.read-model-shadow.v1` and must be removed in Slice 5B before Phase 7 source closeout.

### Closeout blocker being resolved

The Phase 7 closeout audit confirmed that `UberOrderImportPrismaAdapter.getPosStoreConnectivity()` still reads POS-owned `PosDevice` persistence and evaluates `common/pos-connectivity` inside External Channels. This is an ownership violation even though the public SCC scanner remains empty, because the dependency bypasses a POS source boundary through shared Prisma persistence. Adding an `Uber -> POS public-api` reader would be worse: POS already depends on Uber public capabilities, so the reverse public dependency would create an A <-> B public SCC.

### Additive persistence/read-fact design

`PosConnectivityReadModel` is added as a purpose-built POS-owned projection keyed only by `storeStableId`. It records whether the store currently has at least one heartbeat-capable ACTIVE POS device, the latest participating `lastHeartbeatAt`, and the derived `validUntil` lease. It deliberately has no Store DB UUID or Uber/provider identity. The migration only creates the new table; there is no destructive change and no migration-time backfill that would guess the runtime timeout setting.

`PosDeviceService` remains the only writer. It updates the projection from the same current behavior that owns `PosDevice.lastSeenAt` and `connectivityHeartbeatV1`: heartbeat-capable authenticated POS activity extends `validUntil`; first heartbeat capability, claim metadata replacement, enrollment reset, status changes and deletion trigger a store-level recomputation so multi-device/UNKNOWN semantics remain derivable from POS-owned facts. Projection write/refresh failures are logged and do not fail POS authentication/heartbeat/management in 5A because the projection is not yet authoritative.

### Uber shadow behavior

Uber order admission still returns the existing `PosDevice` + `resolvePosConnectivityStatus()` result. In parallel, the Uber persistence adapter reads `PosConnectivityReadModel` and emits `uber_pos_connectivity_read_model_shadow_compare` with `matched`, legacy/shadow status and timestamps. Shadow read failures emit `uber_pos_connectivity_read_model_shadow_failed` and do not affect admission. Uber has no write path to the read model and gains no import from `pos/**` or `pos/public-api.ts`.

Focused tests/architecture guards pin:

- heartbeat-capable POS activity refreshes the read model using the configured timeout;
- an intentional shadow mismatch cannot change the legacy Uber admission result;
- unrelated store IDs read neither legacy nor shadow POS connectivity persistence;
- the Prisma model is keyed by `storeStableId` and is not exported through POS public API;
- POS owns `posConnectivityReadModel.upsert`, while Uber may only `findUnique` it;
- the temporary direct `PosDevice` read is annotated with `@compat pos-connectivity.read-model-shadow.v1`;
- no `Uber -> POS` source/public dependency is introduced.

This expand/shadow Slice intentionally makes **no direct-import baseline or public-SCC change**. The configured Phase 7 Store Operations direct-debt baseline therefore remains **9** (`architecture-foundation 2`, `external-channels 1`, `identity-customer-benefits 1`, `runtime-data-ci-ops 5`) until the later contraction removes the remaining connectivity implementation seam. Source inspection adds no reverse public edge; the GitHub Architecture gate must confirm public SCC remains empty after review.

Per `AGENTS.md`, local lint/build/test/scanner commands are deferred until remote GitHub Actions after user review. The additive migration file has been authored for review but has not been locally applied or validated against a disposable database.

## Required Slice 5B after 5A parity

Slice 5B remains mandatory before Phase 7 source scope can be declared complete. After deployment of 5A and deliberate parity evidence shows zero mismatches/read-write failures for ONLINE, OFFLINE, UNKNOWN, timeout-boundary and device lifecycle cases, 5B should atomically switch Uber admission to `PosConnectivityReadModel`, remove `UberOrderImportRepositoryPort.getPosStoreConnectivity()` from the mixed order persistence contract, delete Uber's direct `prisma.posDevice` and `common/pos-connectivity` reads, move the remaining POS connectivity policy out of Foundation into POS ownership, close/remove `pos-connectivity.read-model-shadow.v1`, recompute the dependency baseline and keep public SCC empty.

The direct `PosModule -> UberEatsModule` and `PosModule -> AuthModule` imports remain intentional composition seams. Printer-agent workspace/package restructuring stays later because it affects an independently deployed production printing boundary and may require dependency/lockfile authorization.
