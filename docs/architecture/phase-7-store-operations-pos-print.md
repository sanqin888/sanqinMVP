# Phase 7 — Store Operations / POS / Print Boundary Contraction

Start date: 2026-09-09  
Current implementation base: `origin/dev@376a7c37`  
Current status: **SLICE 1 LOCAL / SOURCE COMPLETE — REVIEW PENDING**

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

- Production Web Clover and deferred POS Clover Terminal cutover paths remain outside Phase 7 Slice 1.
- Orders remains owner of order aggregate/lifecycle; Payments remains owner of payment truth; Brand/Store remains owner of store status/configuration facts.
- POS device credential persistence/authentication remains behind existing POS public capabilities.
- Guard order, role names, routes, request/response contracts, store scoping, and operator authorization semantics must not change.
- No Prisma schema/migration, dependency manifest/lockfile, provider protocol, print wire contract, PWA contract, or compatibility path changes are part of Slice 1.
- The retained `PosModule -> AuthModule` direct composition import is not permission for controllers/services to deep-import Identity internals.

## Slice 1 — POS staff-auth public-boundary contraction

Status: **LOCAL / SOURCE COMPLETE — REVIEW PENDING**

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

Per `AGENTS.md`, no local lint/build/test/scanner command is run during the default workspace phase. The local source/diff is reviewed first. After user approval for remote delivery, GitHub Actions must validate the architecture baseline gate, API lint/build/strict checks, and full API tests before merge to `dev`.

No separate production active test is expected for Slice 1 because it is import-path-only and preserves runtime class/decorator/provider identity. Its Phase-level closeout verification should nevertheless confirm normal ADMIN/STAFF POS access remains unchanged after the final Phase 7 state is deployed.

## Next candidate after Slice 1

The next recommended readiness audit is the remaining `store-operations-pos-print -> brand-store = 2` pair:

- `PosModule -> StoreStatusModule` composition;
- `PosConnectivityWatchdogService -> StoreStatusService` business dependency.

Unlike Slice 1, that pair requires an explicit Brand/Store-owned store-status capability design and should be reviewed separately before implementation. Printer-agent workspace/package restructuring remains later because it affects an independently deployed production printing boundary and may require dependency/lockfile authorization.
