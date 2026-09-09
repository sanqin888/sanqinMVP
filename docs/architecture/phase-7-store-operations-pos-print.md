# Phase 7 — Store Operations / POS / Print Boundary Contraction

Start date: 2026-09-09  
Current implementation base: `origin/dev@66f29561`  
Current status: **SLICE 2 LOCAL / SOURCE COMPLETE — REVIEW PENDING**

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
- No Prisma schema/migration, dependency manifest/lockfile, provider protocol, print wire contract, PWA contract, or compatibility path changes are part of Slices 1–2.
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

Status: **LOCAL / SOURCE COMPLETE — REVIEW PENDING**

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

The POS -> Brand/Store public dependency direction already existed before this Slice through Brand/Store configuration capabilities, so Slice 2 does not introduce a new context direction. The GitHub Actions architecture gate must still confirm the final SCC/baseline state after user review and remote delivery.

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

Per `AGENTS.md`, no local lint/build/test/scanner command is run during the default workspace phase. The source/diff must be reviewed first. After user approval for remote delivery, GitHub Actions must validate the architecture baseline gate, API lint/build/strict checks/full tests, and Web checks before merge to `dev`.

Existing watchdog characterization coverage remains applicable to non-business-hours suppression, opening grace, offline Uber pause-until-close, preservation of employee-selected pauses, next-business-day re-evaluation, and canonical temporary-close recheck before recovery. No separate production active test is expected for this boundary-only Slice; final Phase 7 closeout should exercise the affected POS connectivity/store-status behavior once from the consolidated merged state.

## Next candidate after Slice 2

After Slice 2, the remaining direct Store Operations / POS / Print debt is `architecture-foundation = 7`, `external-channels = 1`, `identity-customer-benefits = 1`, and `runtime-data-ci-ops = 5`. The next step should be a read-only audit of the single External Channels edge and the remaining Foundation/Runtime seams before choosing another source contraction. Printer-agent workspace/package restructuring remains later because it affects an independently deployed production printing boundary and may require dependency/lockfile authorization.
