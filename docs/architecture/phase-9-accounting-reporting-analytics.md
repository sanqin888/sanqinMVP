# Phase 9 — Accounting / Reporting / Analytics Boundary Contraction & L3 Financial Integrity

Status: **SLICE 0 READINESS AUDIT COMPLETE — SLICE 1 MERGED / CI GREEN**  
Slice 0 audit baseline: `origin/dev@1a69bd7dbd49eba08661b169463e32dc820f0396`  
Slice 1 merge: PR #2281 / final head `974066e7c11f58316368fcb4fcfeec28c5da5509` / squash merge `f529f4701b63040a8e2dfee2cf3ca82213f25ec6` / CI #5494 green  
Audit date: 2026-09-11

## 1. Purpose

Phase 9 owns the modularization and L3 integrity work for the `accounting-reporting-analytics` context. The intended owner scope is accounting ledger/expense operations, revenue posting, settlements/reconciliation, reporting/export read models and analytics ingestion/query. Orders, Payments, Brand/Store and External Channels remain the owners of their business facts and provider identities; Accounting may consume explicit facts/capabilities but must not acquire their persistence ownership.

This phase is not a file-layout rewrite. It must preserve current production behavior unless a later explicitly authorized slice changes accounting semantics. In particular, Slice 0 does **not** authorize changing revenue-recognition rules, removing open-period edit/delete behavior, changing persisted identity fields, creating Prisma migrations, altering Uber provider wire behavior or modifying production Web Clover behavior.

## 2. Slice 0 readiness baseline

The architecture scanner records the following direct-import allowances for `accounting-reporting-analytics` at the Slice 0 baseline:

| Target context | Direct imports |
|---|---:|
| architecture-foundation | 3 |
| commerce-orders-fulfillment | 1 |
| external-channels | 1 |
| identity-customer-benefits | 11 |
| runtime-data-ci-ops | 9 |
| **Total** | **25** |

The graph also contains `brand-store -> accounting-reporting-analytics = 2`, currently caused by Homepage featured-item ranking consuming `ReportsModule` / `ReportsService`. `legacyPublicCycleComponents` is empty, so Phase 9 must not create a new public SCC while contracting these edges.

### 2.1 Identity debt classification

Nine of the eleven Accounting -> Identity direct imports are implementation-path imports of `SessionAuthGuard`, `RolesGuard` and `Roles` from the three controllers:

- `apps/api/src/accounting/accounting.controller.ts`
- `apps/api/src/reports/reports.controller.ts`
- `apps/api/src/analytics/analytics.controller.ts`

The required symbols already exist on `apps/api/src/auth/public-api.ts`. The remaining two direct Identity imports are `AccountingModule -> AuthModule` and `AnalyticsModule -> AuthModule`; these are legal Nest composition seams and must not be wrapped merely to force the numeric debt to zero.

Therefore Slice 1 can safely contract `accounting-reporting-analytics -> identity-customer-benefits` from **11 -> 2**, reducing total direct debt from **25 -> 16**, with no runtime, schema, persisted-data, route, role or authorization behavior change.

### 2.2 Runtime/Data debt classification

The nine Runtime/Data imports are primarily local `PrismaService` / `PrismaModule` persistence wiring. Owner-local persistence access is not a mechanical zero target. Phase 9 instead treats access through `PrismaService` to another context's models as semantic ownership debt even when the import counter only sees Runtime/Data.

## 3. Hidden cross-owner persistence debt

### 3.1 Accounting -> Orders persistence

`AccountingService` directly queries Orders persistence for several behaviors:

- validating an ORDER-sourced accounting transaction against `Order.orderStableId`;
- `autoAccrueOrderRevenue()` reading order status, `totalCents`, `paidAt`, `channel` and `paymentMethod`;
- `dimensionSlice()` reading order totals grouped by channel/payment method.

The existing auto-accrual implementation posts `Order.totalCents` directly as accounting income. This is provisional behavior only. The Accounting Web sales page already states that order total cannot be treated as revenue directly because tax, discounts, delivery, surcharge, refunds and stored-value tender require explicit posting rules. Phase 9 must not re-label the current query as a canonical Revenue Posting capability merely by placing it behind an Orders public reader.

### 3.2 Reports -> Orders internals

`ReportsService` directly queries `Order` / `OrderItem` and deep-imports `readOrderItemComponentsSnapshot()` from Orders internals. Existing characterization is valuable and must be preserved: historical combo quantities are based on immutable `componentsJson`, and current menu configuration is not used to reconstruct historical sales composition.

### 3.3 Accounting -> Uber persistence

`AccountingAutomationScheduler` correctly calls the public `UBER_EATS_REPORTING` capability, but first directly queries `UberStoreMapping` for provider `uberStoreId` values. The current public reporting port also asks callers for `storeUuids`, leaking provider identity into Accounting. The target direction is for External Channels to resolve provider targets internally from SanQ business identity/reporting intent.

This contraction is deferred until a later Phase 9 slice because Phase 8 financial-report success replay is still `CODE READY / LIVE TEST BLOCKED BY UBER CAPABILITY`; Slice 1 must not reopen that provider seam.

## 4. Public-cycle constraint for Reporting

A naive `Reports -> Orders public API` contraction is unsafe because the current graph already has:

`Brand/Store -> Reporting`

for Homepage featured-item ranking, while Orders legitimately consumes Brand/Store public capabilities. Adding a lasting `Reporting -> Orders` public dependency can therefore form:

`Brand/Store -> Reporting -> Orders -> Brand/Store`

This phase must keep `legacyPublicCycleComponents=[]`. Before moving Reporting ownership, the implementation must choose a cycle-safe design such as a Reporting-owned outbound query port wired only at composition, or a purpose-built/versioned reporting projection where consistency and replay requirements justify persistence.

For canonical Revenue Posting, the preferred architecture is stronger than a synchronous query: Orders/Payments should publish/version the financial facts they own, and Accounting should idempotently consume/replay those facts into Accounting-owned state.

## 5. L3 financial-integrity findings

### 5.1 Transaction / audit atomicity gap

The base transaction mutation methods currently perform period checks, `AccountingTransaction` mutation and `AccountingAuditLog` creation as separate database operations. This leaves theoretical concurrency/failure windows where a transaction can be written after a concurrent period close or a transaction mutation can commit while its audit record fails.

Expense-document split creation already demonstrates the repository's accepted pattern by using `prisma.$transaction(...)`. A later Phase 9 L3 hardening slice should make financial fact mutation, close-state enforcement and required audit evidence atomic without changing the HTTP contract first.

### 5.2 Audit coverage is not complete

Manual/inbox expense flows create accounting transactions through `AccountingOperationsService` but do not currently create the same `AccountingAuditLog` evidence as the base transaction CRUD path. Phase 9 must define a single owner-internal invariant for traceable accounting writes instead of assuming the current audit table is complete.

### 5.3 Ledger mutability is a product/accounting decision

Current open-period transaction APIs support update and soft delete with optimistic concurrency. The long-term L3 target may instead require stricter append-only/reversal semantics, but that is a behavior change and is not authorized by Slice 0. Existing behavior must be characterized and preserved until a separate semantic decision is explicitly approved.

## 6. Persisted identity naming findings

The schema still contains generic names such as `AccountingTransaction.orderId`, `createdByUserId`, `updatedByUserId`, `confirmedByUserId`, `closedByUserId` and `operatorUserId`, while current application code is already passing stable business identities (`orderStableId` / `userStableId`). These are naming/contract debts, not evidence that DB UUIDs should cross the boundary.

A future persisted rename/contraction is Class B expand-contract work and requires explicit migration authorization. Slice 1 must not touch Prisma schema or migration history.

## 7. Production data evidence at Slice 0

Read-only production inventory on 2026-09-11 found:

- `AccountingCategory`: 31
- `AccountingAccount`: 4
- `AccountingExpenseDocument`: 7, all `PENDING_REVIEW`
- `AccountingTransaction`: 0
- `AccountingAuditLog`: 0
- `AccountingPeriodClose`: 0
- `PlatformSettlementRecord`: 0
- `UberFinancialReport`: 0

Orders history is not empty: 2,535 Orders, 3,536 OrderItems, 43 refunded Orders and 60 OrderAmendments were present at audit time. This is a low-risk window for future Accounting persisted-contract cleanup, but any Reporting projection/backfill must be designed against real historical Orders rather than assuming an empty source dataset.

## 8. Time-boundary findings

`AccountingService` already obtains the business timezone through the Brand/Store public configuration reader and has characterization coverage for Store-local period boundaries. `ReportsService` still uses `process.env.TZ || 'America/Toronto'`, while accounting automation validates `accountingStartDate` in the configured timezone but persists/compares the date at UTC midnight.

Slice 0 does not change these semantics. Later boundary work must add/retain characterization before normalizing Store-local business-day behavior so a structural refactor does not silently change reporting dates or accounting period eligibility.

## 9. Approved Phase 9 sequence

1. **Slice 1 — Auth Public Boundary Contraction + Accounting Architecture Guard.** Move the nine controller guard/decorator imports to the existing Identity public API, retain the two legal `AuthModule` composition seams, lower the monotonic baseline `11 -> 2`, and add focused architecture protection.
2. **Slice 2 — Accounting / Reporting characterization.** Lock current transaction CRUD, close/reopen/year-lock, current revenue-accrual, report KPI/top-items/time-boundary and Uber scheduler-window behavior before moving deeper ownership.
3. **Slice 3 — Accounting L3 atomicity hardening.** Make financial mutation/period-state/audit invariants atomic while initially preserving existing HTTP semantics.
4. **Slice 4 — cycle-safe Reporting / Orders ownership contraction.** Replace direct Orders/internal-parser consumption without introducing a Brand -> Reporting -> Orders -> Brand public SCC.
5. **Slice 5 — canonical Revenue Posting.** Define versioned Orders/Payments financial facts and Accounting-owned idempotent/replayable posting rather than treating `Order.totalCents` as revenue.
6. **Slice 6 — Uber financial-reporting boundary.** Remove Accounting knowledge of `UberStoreMapping`/provider UUIDs while preserving Phase 8 provider behavior and gates.
7. **Slice 7 — stable-ID / Prisma contract contraction.** Use an explicitly authorized Class B expand-contract migration for ambiguous persisted identity names and related Prisma contract leakage.
8. **Slice 8 — internal capability split + Accounting Web vertical-contract cleanup.** Split Ledger/Expenses/Revenue/Settlements/Reports internals and then consolidate Web DTO contracts after backend boundaries are stable.

Phase 9 closes only after the planned source slices are merged, a final closeout/readiness audit is performed against the merged state, and one consolidated deployment + active verification plan passes.

## 10. Slice 0 decision

**PASS.** Phase 9 is ready to begin source contraction. Slice 1 is a Class A atomic internal migration and requires no Prisma migration, dependency change, compatibility registration, provider cutover or production behavior change.

## 11. Slice 1 — Auth Public Boundary Contraction + Architecture Guard

State: **MERGED / CI GREEN**  
PR/SHA: PR #2281; final head `974066e7c11f58316368fcb4fcfeec28c5da5509`; squash merge `f529f4701b63040a8e2dfee2cf3ca82213f25ec6`  
Implementation base: `origin/dev@1a69bd7dbd49eba08661b169463e32dc820f0396`

Slice 1 changes only the Identity implementation path used by staff-protected Accounting/Reports/Analytics controllers. `AccountingController`, `ReportsController` and `AnalyticsController` now import `SessionAuthGuard`, `RolesGuard` and `Roles` from the already-existing `auth/public-api.ts` surface. Guard order, role declarations, route paths and request behavior remain unchanged.

The direct `AccountingModule -> AuthModule` and `AnalyticsModule -> AuthModule` imports are intentionally retained as legal Nest composition seams. No new Auth wrapper/module alias is introduced merely to force the numeric debt to zero.

A focused `accounting-auth-boundary.architecture.spec.ts` guard requires all three controllers to consume the Identity public surface, rejects the old guard/decorator implementation paths, verifies those symbols remain exported publicly, and records the two retained module-composition seams.

Architecture movement for this slice:

- `accounting-reporting-analytics -> identity-customer-benefits`: **11 -> 2**
- total Accounting / Reporting / Analytics direct-import debt: **25 -> 16**
- `legacyPublicCycleComponents`: remains expected empty; Slice 1 introduces no new public dependency pair

Intentionally unchanged: Accounting/Reports/Analytics business behavior, Prisma schema/migrations, persisted identity fields, ledger/revenue semantics, Orders/Payments facts, Uber financial reporting, production Web Clover behavior, package dependencies and compatibility registrations.

Remote validation: initial CI #5493 passed the architecture baseline but stopped on one Prettier-only line-wrap error in the new architecture spec. Formatting-only head `974066e7` then passed GitHub Actions CI #5494 completely: API architecture baseline, lint, build, strict declaration checks, shared strict checks and Jest were green; Web lint, build, strict declaration check and tests were green. PR #2281 was squash-merged to `dev` as `f529f470`.

No separate production deployment/active verification is required for Slice 1 because runtime authorization behavior did not change and the repository's modularization verification cadence is Phase-level. The next source work package is Slice 2 characterization; it must preserve behavior and add evidence before any deeper L3 atomicity or cross-owner boundary change.
