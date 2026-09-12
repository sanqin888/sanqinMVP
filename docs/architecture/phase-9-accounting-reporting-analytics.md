# Phase 9 — Accounting / Reporting / Analytics Boundary Contraction & L3 Financial Integrity

Status: **SLICE 0 READINESS AUDIT COMPLETE — SLICE 1/2/3/4 MERGED / CI GREEN — SLICE 5 PLAN REVISED FOR DOUBLE-ENTRY ACCOUNTING**  
Slice 0 audit baseline: `origin/dev@1a69bd7dbd49eba08661b169463e32dc820f0396`  
Slice 1 merge: PR #2281 / final head `974066e7c11f58316368fcb4fcfeec28c5da5509` / squash merge `f529f4701b63040a8e2dfee2cf3ca82213f25ec6` / CI #5494 green  
Slice 2 merge: PR #2283 / final head `d6518ba13f8b1bb43df941d2fde10a44409e2a3b` / squash merge `b35890d8ed7399bc389915b192f7c20ff966c9b8` / CI #5500 green  
Slice 3 merge: PR #2284 / final head `4399c841884e3267e18f7ab7f5b99781e0ed1fb6` / squash merge `0f37901a134062fcdb860e9ca256b4be2147586a` / CI #5503 green  
Slice 4 merge: PR #2285 / final head `f38d8feb98819378d2667498a90acfd2d06b0e54` / squash merge `e3a3785dd7b428658cfec6720ca77da8be6eb350` / CI #5507 green  
Planning decision updated: 2026-09-12

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
5. **Slice 5A — Double-entry + Statement Ingestion readiness/schema design audit.** Before changing persisted contracts, complete a read-only design audit for the minimal double-entry core, Chart of Accounts, provider statement import/inbox pipeline, historical coverage/cutover rules, idempotency/revision handling and the expand-contract migration plan. This work package must not edit Prisma schema/migrations or change runtime behavior.
6. **Slice 5B — Double-entry Accounting Core.** After separate Prisma/migration authorization, introduce the minimal balanced journal model and account classification needed by SanQ Accounting while preserving the existing category taxonomy as a reporting/operating dimension where practical. Do not expand this slice into a full ERP/general-ledger product.
7. **Slice 5C — External Platform Historical Financial Import + Accounting Inbox.** Add the unified Email / Manual Upload / Provider API document-ingestion boundary, UI-managed trusted senders, document classification and statement parsing. Historical Uber Eats and Fantuan backfill begins **2026-06-01** and is statement/monthly financial coverage only; it intentionally does not create asymmetric Uber-only historical order/item detail.
8. **Slice 5D — Canonical Financial Facts + Revenue Posting.** Define versioned Orders/Payments/External-Channel financial facts and Accounting-owned idempotent/replayable posting into the double-entry journal rather than treating `Order.totalCents` as revenue. Provider/API-era order facts are the sales source; settlement statements must not duplicate recognized sales.
9. **Slice 6 — Platform Settlement / Reconciliation + Uber financial-reporting boundary.** Remove Accounting knowledge of `UberStoreMapping`/provider UUIDs while preserving provider gates, and use provider statements/reports for fees, promotions/subsidies, advertising, chargebacks/complaint deductions, adjustments, payout and receivable reconciliation rather than rewriting original order revenue.
10. **Slice 7 — stable-ID / Prisma contract contraction.** Use an explicitly authorized Class B expand-contract migration for ambiguous persisted identity names and related Prisma contract leakage.
11. **Slice 8 — internal capability split + Accounting Web vertical-contract cleanup.** Split Ledger/Expenses/Revenue/Settlements/Reports internals and then consolidate Web DTO contracts after backend boundaries are stable.

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

## 12. Slice 2 — Accounting / Reporting Characterization

State: **MERGED / CI GREEN**  
PR/SHA: PR #2283; final head `d6518ba13f8b1bb43df941d2fde10a44409e2a3b`; squash merge `b35890d8ed7399bc389915b192f7c20ff966c9b8`; CI #5500 green  
Implementation base: `origin/dev@9a25e8221bb16cb9d18d16bcbbdcb974d1b05bc3`

Slice 2 is intentionally test-only for production behavior. It adds characterization coverage before any L3 financial-integrity or cross-owner ownership change and does not modify Accounting, Reports, Uber, Orders, Payments, Web, Prisma schema/migrations, package dependencies, provider contracts or architecture allowances.

The new coverage locks the following existing semantics:

- ledger transaction create/update/soft-delete behavior, operator stable-identity persistence, idempotent create replay, optimistic `lastKnownUpdatedAt` conflict handling, version increment and current `AccountingAuditLog` evidence;
- closed-month policy where ordinary entries are rejected but `ADJUSTMENT` remains writable until the fiscal year is hard-locked, explicit month reopen behavior/audit evidence, plus StoreConfig/Toronto month and year UTC boundaries and accounting-start-month handling for year close;
- manual Expense and inbox-confirmation writes keeping the expense document and all split ledger rows inside one existing Prisma transaction, including current split idempotency keys and attachment preservation;
- current provisional order-revenue accrual behavior: DAILY mode sums `Order.totalCents` into one day-level ledger entry, PER_ORDER mode keeps stable-order idempotency and Uber-vs-order source classification, and replays skip existing entries. These assertions describe current behavior only and do **not** reclassify `Order.totalCents` as canonical accounting revenue;
- Accounting automation's `eats.report` capability gate, provisioned-store lookup, previous-four-day rolling report window clipped by `accountingStartDate`, latest-completed-business-day end date, and the existing three Uber financial report types;
- Reports KPI/date behavior using `process.env.TZ || America/Toronto`, `Order.createdAt`, the paid/making/ready/completed status set, `totalCents`-based sales/payment/fulfillment/chart aggregation, and existing top-item snapshot behavior. The previously existing `componentsJson` characterization remains the authority for historical combo composition.

Architecture effect: **none**. The machine direct-import baseline remains `accounting-reporting-analytics -> architecture-foundation 3`, `commerce-orders-fulfillment 1`, `external-channels 1`, `identity-customer-benefits 2`, `runtime-data-ci-ops 9` for a total of **16**, with `legacyPublicCycleComponents=[]`. No new public API, port, module dependency, compatibility path or owner transfer is introduced.

This slice deliberately does not fix the L3 atomicity/audit gap, normalize Reports onto StoreConfig timezone, change `accountingStartDate` UTC-midnight storage, replace direct Orders reads, change Revenue Posting semantics, or remove Accounting knowledge of Uber provider store UUIDs. Those remain later explicitly scoped Phase 9 work.

Remote validation: initial PR heads stopped only on type-aware lint/Prettier issues in the newly added tests. Final head `d6518ba1` passed GitHub Actions CI #5500 completely: API architecture baseline, lint, build, strict declaration/shared checks and Jest were green; Web lint, build, strict declaration check and tests were green. PR #2283 was squash-merged to `dev` as `b35890d8`.

## 13. Slice 3 — Accounting L3 Atomicity Hardening

State: **MERGED / CI GREEN**  
PR/SHA: PR #2284; final head `4399c841884e3267e18f7ab7f5b99781e0ed1fb6`; squash merge `0f37901a134062fcdb860e9ca256b4be2147586a`; CI #5503 green  
Implementation base: `origin/dev@b35890d8ed7399bc389915b192f7c20ff966c9b8`

Slice 3 establishes an owner-internal atomic-write invariant without changing the Accounting HTTP contract, Prisma schema, open-period edit/soft-delete semantics, Revenue Posting rules or cross-context ownership. A shared Accounting-only helper now executes financial write units at Prisma `Serializable` isolation and retries Prisma `P2034` serialization conflicts up to three attempts, following the repository's existing coupon-claim transaction pattern.

The following operations now keep the period-state read, financial mutation and required audit evidence inside the same Serializable transaction:

- ledger `createTx`, `updateTx` and soft `deleteTx`, including idempotency/OCC checks and `CREATE` / `UPDATE` / `DELETE` audit rows;
- `closeMonth`, `reopenMonth` and `closeYear`, including year/month state checks and `PERIOD_CLOSE` / `PERIOD_REOPEN` / `YEAR_LOCK` audit rows;
- manual Expense creation and inbox confirmation split writes. Their accounting-start/closed-period checks now run inside the same transaction as document/split persistence, and every created split ledger row receives `CREATE` audit evidence atomically;
- inbox confirmation re-reads the document state inside the transaction before replacement, preventing concurrent double-confirmation. Any replaced active split rows are captured before deletion and receive matching `DELETE` audit evidence in the same transaction.

The shared atomic-write helper intentionally depends only on Prisma client transaction contracts rather than importing `PrismaService`, so it does not add a new Accounting -> Runtime/Data direct edge. Architecture movement for Slice 3 is therefore **none**: Foundation **3**, Orders **1**, External **1**, Identity **2**, Runtime **9**, total **16**, with `legacyPublicCycleComponents=[]`.

Slice 3 deliberately does **not** convert the ledger to append-only/reversal semantics, normalize Reports timezone behavior, change `accountingStartDate` storage, alter provisional `Order.totalCents` revenue accrual, contract Reporting -> Orders ownership, modify Uber financial-report identity, or touch production Web Clover. Those remain later Phase 9 slices.

Remote validation: initial CI #5502 passed the architecture baseline and stopped only on four Prettier formatting errors. Formatting-only final head `4399c841` then passed CI #5503 completely: API architecture baseline, lint, build, strict declaration/shared checks and Jest were green; Web lint, build, strict declaration and tests were green. PR #2284 was squash-merged to `dev` as `0f37901a`.

## 14. Slice 4 — Projection-ready Reporting / Orders Boundary Contraction

State: **MERGED / CI GREEN**  
PR/SHA: PR #2285; final head `f38d8feb98819378d2667498a90acfd2d06b0e54`; squash merge `e3a3785dd7b428658cfec6720ca77da8be6eb350`; CI #5507 green  
Implementation base: `origin/dev@0f37901a134062fcdb860e9ca256b4be2147586a`

Slice 4 adopts the approved projection-ready live-reader design. Reporting now owns an outbound `REPORTING_ORDER_FACTS_QUERY` port containing versioned V1 metric/item fact shapes. Orders owns a matching public `ORDER_REPORTING_FACTS_READER` capability and the Prisma queries that materialize current report facts. Immutable `OrderItem.componentsJson` decoding also moves behind the Orders owner boundary before facts cross into Reporting, so Reporting no longer imports Orders' internal snapshot parser or Orders persistence types.

`ReportsModule` is now an explicit registered composition root: it imports the Orders public reporting-facts module and adapts the Orders-owned reader onto the Reporting-owned outbound port. `ReportsService` therefore depends only on Reporting contracts. Homepage now owns a local `HOMEPAGE_SALES_RANKING_QUERY` outbound port; `HomepageFeaturedService` depends only on that Brand-owned contract, while `HomepageContentModule` is registered as the second composition root that adapts the exported Reporting top-items capability onto the Homepage port. This preserves the existing seven-day featured-item behavior without creating a lasting Brand -> Reporting public edge.

The report behavior intentionally remains unchanged: `process.env.TZ || 'America/Toronto'` still defines report-day boundaries; the reportable Order status set remains `paid/making/ready/completed`; KPI/payment/fulfillment/timeline aggregation remains based on the same current Order fields; historical Top Items still use immutable purchased component snapshots and fall back to the purchased parent item when no component snapshot exists. This slice does **not** introduce a persisted Reporting projection/read model, new tables, backfill/replay workers, canonical revenue semantics, or Accounting consumption of Reporting facts.

Architecture movement targeted by the source change: `accounting-reporting-analytics -> commerce-orders-fulfillment` direct debt **1 -> 0**; `accounting-reporting-analytics -> runtime-data-ci-ops` **9 -> 7**; `brand-store -> accounting-reporting-analytics` direct debt **2 -> 0**; registering `HomepageContentModule` as composition wiring also contracts `brand-store -> runtime-data-ci-ops` **4 -> 3**. The resulting Accounting / Reporting / Analytics direct debt is Foundation **3**, External **1**, Identity **2**, Runtime **7**, total **13**. Both cross-owner bindings are confined to registered composition roots, so neither a lasting `Reporting -> Orders` public edge nor a lasting `Brand -> Reporting` public edge is introduced; `legacyPublicCycleComponents` is expected to remain empty.

Focused tests retain Slice 2 report characterization at the Reporting contract boundary and add Orders-reader coverage for the exact reportable status set, current metric query semantics and immutable component-snapshot decoding. A boundary architecture spec prevents `ReportsService` from regaining Prisma/Orders-parser imports, requires Homepage business logic to stay on its Brand-owned ranking port, and pins both explicit composition-root registrations. Remote validation proceeded in three heads: CI #5505 correctly rejected the initial Brand -> Reporting public SCC; head `a6bfefaf` removed that edge and passed the architecture gate in CI #5506, which then stopped on Prettier-only API lint; formatting-only final head `f38d8feb` passed CI #5507 completely across API and Web before PR #2285 was squash-merged as `e3a3785d`.

## 15. Slice 5 planning decision — Double-entry Accounting, provider statements and historical coverage

State: **DESIGN DECISION RECORDED — IMPLEMENTATION NOT STARTED**  
Planning base: `origin/dev@703a4269`  
Decision date: 2026-09-12

### 15.1 Double-entry is now the target Accounting ledger model

The current `AccountingTransaction` model is an operational single-record income/expense/adjustment/transfer ledger and is no longer the intended terminal architecture for Phase 9. Before canonical Revenue Posting is implemented, Accounting must move to a minimal double-entry core so Revenue Posting, refunds, provider receivables, fees, taxes and settlements are defined once against balanced accounting entries rather than being rebuilt later.

The target design direction is a SanQ-sized Chart of Accounts plus balanced journal entries/lines, conceptually:

- account classifications capable of representing at least **ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE**;
- one journal-entry header carrying stable business identity, source/fact identity, posting version, idempotency and audit/reversal references as required by the final design;
- two or more journal lines whose total debits equal total credits;
- existing operational categories such as food sales, delivery, ingredients, rent and utilities retained as reporting/operating dimensions where useful instead of being mechanically collapsed into the account hierarchy.

This decision does **not** authorize a full ERP redesign, a specific persisted schema, a particular Chart-of-Accounts numbering system, or a change from current open-period update/soft-delete semantics to append-only/reversal semantics. Those details require the Slice 5A audit and, for persisted changes, separate Prisma/migration authorization.

The low-risk migration window remains favorable: the Slice 0 production inventory found no `AccountingTransaction`, `AccountingAuditLog`, `AccountingPeriodClose`, `PlatformSettlementRecord` or `UberFinancialReport` rows. A later 2026-09-11 read-only inventory found the operating Orders dataset had continued to grow and also confirmed that historic Unified Payment Core tables do not provide a complete historical payment-fact source, so historical replay must not assume `PaymentTransaction` coverage.

### 15.2 Revenue recognition and platform settlement are separate facts

Canonical Revenue Posting answers what SanQ sold, what tax/delivery/surcharge components belong to the sale and what confirmed sale/refund/amendment facts changed that revenue. Platform settlement answers how a provider later settled its receivable after commission, marketing, subsidies, chargebacks, advertising, adjustments and payout timing. Settlement data must not overwrite the original order sale merely because the provider later deducted money.

For Uber Eats, the production-target order integration is treated as essentially terminal for the order-lifecycle side: a provider-confirmed cancellation before delivery is an order/cancellation fact that can reverse or prevent revenue posting. Post-delivery customer complaint deductions, chargebacks and other Uber-side financial actions belong to settlement/adjustment facts and must not mutate the original completed sale into a synthetic cancellation.

`PENDING_MANUAL`, `UBER_MANUAL_REFUND` and similar manual-refund states are transitional compatibility only. After Clover POS synchronization and authoritative provider-side refund/cancellation flows are live, new canonical financial posting must be driven by confirmed Payments/External-Channel facts rather than a permanent manual-refund branch. Historical confirmed manual records still require replay compatibility; pending/unconfirmed requests are not revenue reversals.

### 15.3 Historical Clover / Uber Eats / Fantuan financial coverage starts 2026-06-01

Historical provider financial coverage will be backfilled from **2026-06-01** for **Clover, Uber Eats and Fantuan**. The same coverage start applies to all three providers so Accounting has one explicit financial-history boundary rather than provider-specific start dates.

- import the available monthly/settlement-level financial evidence for Clover, Uber Eats and Fantuan from that date forward;
- Clover processor statements remain settlement/accounting evidence rather than canonical sales revenue, while daily Clover Closeout content remains batch-control/reconciliation evidence;
- do **not** import Uber-only historical order/item detail merely because Uber currently exposes richer downloads while Fantuan may not expose an equivalent downloadable item-level history;
- do not synthesize operational `Order` rows from historical provider financial files;
- retain explicit provider coverage metadata so UI/reporting can distinguish financial-history completeness from future order/item-detail completeness.

After a provider's live API integration cutover, provider order facts become the sales/analytics source for that period. Monthly statements/reports continue to be imported, but their role changes to settlement, fee/adjustment evidence and reconciliation. This separation prevents the same provider sales from being counted once from the live order feed and again from the monthly statement.

Fantuan API availability and exact third-party capabilities remain to be confirmed with the provider. The architecture must not assume a Fantuan order/item API until that capability is verified.

### 15.4 Accounting Inbox: nightly Gmail ingest, trusted senders and document classification

The existing Accounting automation already has Store-local scheduling and defaults to `02:15` in `America/Toronto`; Gmail ingestion currently reads `bills@sanq.ca` using the `SanQ-Bills` label and writes supported attachments into `AccountingExpenseDocument`. Slice 5 must evolve this expense-only path into a unified Accounting Inbox rather than building a second unrelated mailbox pipeline.

Target behavior:

- Accounting UI exposes a freely editable **trusted sender** list. Sender trust controls whether a message/attachment is eligible for normal automatic processing; it does **not** map an email address to a vendor/platform or decide whether an attachment is an expense or settlement.
- A trusted personal sender may create a new email and attach a downloaded Clover/Uber/Fantuan financial document directly to `bills@sanq.ca`; the real `From` may therefore be the user's own Gmail address. Provider/document classification must rely primarily on content, then filename/subject and other deterministic evidence, not on an assumed official-provider sender.
- Unknown/untrusted sources are preserved for review/quarantine rather than silently trusted or silently classified as a provider.
- The common intake classification is at least `EXPENSE_DOCUMENT`, `PLATFORM_SETTLEMENT` and `UNKNOWN`.
- Expense documents continue to flow to expense review. Provider statements flow to a dedicated statement/settlement review surface because one statement may contain both revenue-side and expense/adjustment components.
- The existing Accounting Web manual file-upload experience must be included in this same Inbox design. Today the Expenses UI uploads receipt images through `/accounting/files/receipts` and then attaches the returned URL to manual Expense creation; the target Accounting-side upload window must also accept supported provider statements/documents and route them through the same de-duplication, extraction, classification and review pipeline as Gmail intake rather than creating a second import path. Existing receipt-image compression/type/size protections should be preserved where they remain applicable.
- Automatic acquisition, de-duplication, extraction and classification may run unattended; formal journal posting remains review/confirmation gated until parser/posting behavior has sufficient evidence for a later explicit auto-approval decision.

A unified import batch should support source modes conceptually equivalent to `EMAIL`, `MANUAL_UPLOAD` and `PROVIDER_API` so the downstream parser/accounting path is stable even when acquisition changes. `MANUAL_UPLOAD` specifically includes the Accounting Web file-upload window, not only an API-only fallback. File hash, Gmail message/attachment identity, provider statement identity/period and parser-version evidence must support duplicate/revision detection. A later corrected statement must not silently overwrite previously posted accounting evidence; the design audit must define revision/reconciliation behavior.

Uber monthly statements are currently treated as manually downloadable evidence unless/until an authoritative provider API/reporting capability supplies them automatically. The user may download a statement and send it as a fresh attachment email to `bills@sanq.ca`; no forwarded-message metadata is required for classification.

### 15.5 Real provider statements require a richer settlement model

The real provider samples reviewed during planning/readiness show why the existing `PlatformSettlementRecord(grossCents, commissionCents, netCents, payoutAt, rawPayload)` shape is insufficient as a terminal model:

- Clover monthly processing statements separate submitted/funded totals, per-batch gross/funded rows, service charges, processor fees, chargebacks/reversals and fee tax details; daily Closeout email-body content is a separate batch-control artifact;
- Uber statements separate Sales, sales tax, Marketplace Fees and their tax, item offers, other offer charges, ad spend/credits, chargebacks and tax adjustments, plus payout/net totals;
- Fantuan statements separate Sales, promotion discounts, Fantuan promotion subsidy, commission, commission GST/HST, adjustments, net taxes and transfer totals.

The preferred design direction is therefore a provider-statement header plus extensible financial lines/components and preserved raw evidence, with normalized canonical component types only where they are stable and useful to posting/reconciliation. Exact persisted fields/table names remain a Slice 5A design output and are **not** authorized by this planning record.

### 15.6 Next work package

The next task is **Phase 9 Slice 5A — Double-entry + Statement Ingestion readiness/schema design audit**. It is read-only and must:

1. inventory the current Accounting schema, ledger/category/account semantics, expense inbox/Gmail parser, automation configuration, settlement importer, Web Accounting UI contracts, audit/period rules and migration history;
2. map the real Uber/Fantuan statement concepts onto a canonical statement/header-line model without forcing provider-specific fields into one flat record;
3. propose the minimal double-entry Chart of Accounts + journal model and define how existing categories/accounts/documents map or transition;
4. define historical coverage from 2026-06-01, API-era cutover rules, trusted-sender UI/settings, duplicate/revision handling and review/confirmation semantics;
5. define Revenue Posting versus Settlement Posting responsibilities and the stable source/fact/idempotency identities needed for replay;
6. produce an expand-contract Prisma/migration/backfill/cutover plan, explicitly separating changes that can be implemented without persisted-schema work from changes requiring separate migration authorization;
7. give the recommended Slice 5B implementation boundary, affected tests/architecture guards and eventual Phase-level active verification scope.

No Prisma/schema/migration/source implementation should begin during 5A unless the user separately authorizes that implementation after reviewing the audit.

## 16. Slice 5A readiness result and Slice 5B implementation boundary

State: **5A READINESS / SCHEMA DESIGN COMPLETE — 5B MERGED / CI GREEN — 5C READINESS AUDIT COMPLETE / IMPLEMENTATION NOT STARTED**  
Audit/implementation base: `origin/dev@cbe8ad6f`  
Decision/authorization date: 2026-09-12

### 16.1 Accounting migration compatibility decision

The user confirmed that Accounting has not started formal production use and that the current Accounting-owned persisted records may be discarded. Phase 9 therefore does **not** need historical compatibility for current `AccountingTransaction`, `AccountingExpenseDocument`, `PlatformSettlementRecord`, Accounting account/category seed rows, or other current Accounting-only test/setup data. This removes the need for data-parity dual-write/backfill work whose only purpose would be preserving those records.

This does not authorize unrelated destructive database work. Slice 5B remains narrowly scoped to introducing the terminal double-entry core while leaving existing runtime Accounting flows in place until their later cutover slices. The user separately authorized the Prisma schema change and creation of the matching migration for Slice 5B.

### 16.2 Minimal double-entry core selected for Slice 5B

Slice 5B introduces a SanQ-sized journal rather than converting `AccountingTransaction` in place:

- `AccountingAccount` gains the terminal **ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE** classification. The existing operational account kind (`CASH / BANK / PLATFORM_WALLET`) remains only where useful to current UI/workflows and is not allowed to define debit/credit semantics.
- `AccountingJournalEntry` owns stable entry identity, deterministic idempotency identity/hash, entry kind/source, optional source-fact identity/version, Store stable identity, occurrence time/currency, optimistic versioning, operator stable IDs and soft deletion.
- `AccountingJournalLine` owns ordered debit/credit lines, account ownership and an optional existing `AccountingCategory` operating/reporting dimension.
- Journal entries require at least two lines, exactly one positive debit-or-credit side per line, non-negative integer minor units and equal total debits/credits. Application validation is backed by PostgreSQL constraints, including a deferred balance constraint checked at transaction commit.
- Create/update/delete remains inside the existing Accounting-owned Serializable write boundary with `P2034` retry and `AccountingAuditLog` evidence. Slice 5B intentionally preserves the current period policy: ordinary entries are blocked in a closed month, `ADJUSTMENT` remains writable until the fiscal year is hard-locked, and open-period rows remain optimistic-update/soft-delete rather than switching early to append-only reversal semantics.
- The initial Chart of Accounts covers Store cash/bank/processor receivables, HST recoverable/payable, opening equity, sales/delivery/surcharge/discount revenue and the minimum operating/platform/payment/chargeback expense accounts. Existing Accounting categories remain dimensions rather than becoming the account hierarchy.

Slice 5B does **not** cut current Expense, Revenue, settlement, report or Web UI reads/writes to the new journal. It also does not add statement parsing, trusted-sender management, historical provider imports, provider financial-fact ports, automatic posting or settlement reconciliation. Those remain 5C/5D/Slice 6 work.

### 16.3 Clover evidence added to the statement-ingestion design

Two real Clover artifacts were reviewed before 5B implementation:

- the monthly merchant card processing statement is settlement/accounting evidence. It contains statement period, submitted/funded totals, per-batch submitted/funded rows, service charges, fees, chargebacks/reversals and detailed fee/tax lines. It must not be used as canonical monthly Revenue because statement batches can cross calendar-month sales boundaries;
- the daily Clover Closeout is **not a PDF attachment in production**. Clover sends the report as structured email-body content at approximately 01:30. The PDF used during the audit was manually generated from that email body only as a design sample. The production Inbox must therefore treat `EMAIL` acquisition as capable of producing both body artifacts and attachment artifacts rather than assuming every accounting document is a file attachment.

The daily Closeout is classified as `CLOVER / BATCH_CONTROL` reconciliation evidence. Its Batch ID, Sales, Refunds, Net, Tax, Tips and card totals are used to compare Payment/API facts; it does not independently create Revenue or Settlement journal postings. The monthly Clover processing statement is classified as processor settlement evidence and supplies fee/adjustment/chargeback/funding information for later settlement posting and bank reconciliation.

The generic Journal keeps the accounting occurrence timestamp (`occurredAt`) and source-fact identity; provider-specific `statementPeriod`, `settledAt`, `payoutAt` and similar lifecycle timestamps belong on the future canonical statement/settlement facts referenced by the journal rather than being duplicated as Clover/Uber/Fantuan-specific columns on every JournalEntry.

The 5C canonical statement model must therefore cover **CLOVER / UBER_EATS / FANTUAN** and retain acquisition form independently from document/provider classification.

### 16.4 Slice 5B merge/validation state

Slice 5B is **MERGED / CI GREEN** through PR #2288. Final PR head `c2d01b89` passed CI #5516 across Prisma generation, architecture baseline, API/Web lint/build/strict declarations and tests, then squash-merged to `dev` as `cbe8ad6f`. The migration SQL remains only statically reviewed in this workflow and has **not yet been applied on the running VM/production database**, so deployment/runtime evidence is not claimed.

## 17. Slice 5C readiness audit — Unified Accounting Inbox + Provider Financial Evidence

State: **READ-ONLY AUDIT COMPLETE — IMPLEMENTATION NOT STARTED**  
Audit base: `origin/dev@cbe8ad6f`  
Audit date: 2026-09-12

### 17.1 Current-state findings

The current Gmail path is still an Expense-specific importer rather than a terminal Accounting Inbox. `AccountingGmailIngestService` writes directly into `AccountingExpenseDocument`, so acquisition, de-duplication, extraction, review classification and Expense-domain persistence are coupled. It can ingest email-body text, but **only when no supported attachment is present**; a message that contains both a structured body and a PDF/image therefore loses the body as independent accounting evidence. This is incompatible with the real Clover Daily Closeout, whose production form is structured email-body content.

Current duplicate handling is also insufficient for a unified financial inbox. Attachments use a content SHA, but body-only email hashing includes the Gmail message ID, so the same body resent in a new message is not recognized as a content duplicate. `AccountingExpenseDocument` further mixes transport identity (`gmailMessageId` / attachment ID), file identity (`fileHash`) and business-document identity into one Expense record.

The existing Accounting Web manual-upload path is separate: `/accounting/files/receipts` compresses/saves a receipt image and returns a URL, after which the Expenses page creates a manual Expense directly. It does not pass through Gmail-style extraction, classification, duplicate detection or Inbox review. The existing flat `PlatformSettlementRecord` importer is likewise not a suitable terminal representation for the richer Clover/Uber/Fantuan statements. Uber reporting already has an External-Channels-owned public port and durable downloaded CSV artifacts, but Accounting does not yet register those artifacts into a common evidence pipeline.

### 17.2 Target intake ownership and persisted concepts

Slice 5C should introduce an Accounting-owned intake/evidence layer before any automatic journal posting. Recommended persisted concepts are:

- **SourceArtifact** — immutable acquisition evidence with stable artifact identity, acquisition mode (`EMAIL`, `MANUAL_UPLOAD`, `PROVIDER_API`), raw/content hash, MIME/input kind, transport metadata and stored evidence location/text;
- **ParseRun** — parser identity/version, parse status, normalized extraction result and error/retry evidence for replayable parsing;
- **InboxItem** — review/classification state, trust/quarantine decision and the relationship between one artifact and the downstream Accounting domain object;
- **TrustedSender** — UI-managed sender allow-list controlling automatic intake eligibility only; it does not assign provider identity, document type or accounting treatment;
- **ProviderFinancialDocument** — canonical provider financial header for Clover/Uber/Fantuan evidence, with provider, document scope/type, merchant/store identity, statement period, payout/settlement lifecycle timestamps, parser version, revision/supersession identity and preserved raw evidence;
- **ProviderFinancialLine** — extensible raw + normalized financial components with integer minor-unit amounts, tax role and posting treatment.

`ProviderFinancialDocument` is intentionally broader than a model named only `PlatformStatement`: Clover Daily Closeout is a financial control document but is not a processor statement. Provider-specific lifecycle dates such as `statementPeriod`, `settledAt` and `payoutAt` belong on these source facts rather than on generic `AccountingJournalEntry`.

### 17.3 Duplicate, revision and review semantics

5C should separate three identities instead of treating every replay as the same duplicate class:

1. **transport identity** — for example Gmail message + attachment/part identity or Uber report workflow/section identity;
2. **content identity** — SHA-256 of raw file bytes or deterministic normalized email-body content, independent of Gmail message ID;
3. **business identity** — provider + merchant/business scope + document type/scope + statement period/reference.

A byte-identical statement sent through a second email is a content duplicate. A corrected statement with the same business identity but different content is a **revision**, not a duplicate; it must supersede/link to the earlier evidence without silently overwriting already reviewed or later-posted facts. Unknown/untrusted material is preserved for quarantine/review rather than discarded. Formal Journal posting remains outside 5C and review-gated in later posting slices.

### 17.4 Provider classification and posting-treatment boundary

The common provider-document model must cover at least:

- `CLOVER / BATCH_CONTROL` for Daily Closeout email-body evidence;
- `CLOVER / MONTHLY_STATEMENT` for merchant processor settlement/accounting statements;
- `UBER_EATS / MONTHLY_STATEMENT` and eligible financial API-report artifacts;
- `FANTUAN / MONTHLY_STATEMENT` for imported financial statements.

Normalized line components may include Sales, Sales Tax, Commission/Marketplace Fee, Processing Fee, Promotion/Offer, Subsidy, Advertising, Advertising Credit, Chargeback, Adjustment, Payout/Funding and Control Total. Each normalized line must also carry a posting treatment such as `POSTABLE`, `CONTROL_TOTAL`, `RECONCILIATION_ONLY` or `UNCLASSIFIED` so provider totals are not double-posted together with their component lines.

Clover Daily Closeout remains **reconciliation evidence only**: Batch ID, Sales, Refunds, Net, Tax, Tips and card totals compare against Payments/API facts and do not independently create Revenue or Settlement journal entries. Clover monthly statements provide processor fee/tax/adjustment/chargeback/funding evidence for later settlement posting. Uber/Fantuan monthly statements likewise remain provider financial/settlement evidence rather than a second copy of live-order Revenue.

### 17.5 Historical coverage decision

The formal provider financial-history boundary is now **2026-06-01 for all three providers: CLOVER, UBER_EATS and FANTUAN**. This is financial evidence coverage, not a declaration that equivalent order-detail history exists for each provider. Historical provider files must not synthesize operational `Order` rows.

Coverage metadata should therefore distinguish `financialHistoryRequiredFrom`, financial-document completeness and any later `liveOrderFactCutoverAt` / order-detail coverage separately. A statement or payout crossing the 2026-06-01 boundary is review evidence; 5C must not invent an opening receivable automatically. Opening-balance treatment belongs to the later settlement/posting policy.

### 17.6 Gmail, manual upload and Uber API acquisition

`EMAIL` acquisition must process **email body and every supported attachment independently** from the same message. The existing `SanQ-Bills` label remains the mailbox-routing boundary for 5C; Trusted Sender is an additional trust layer, not a replacement for provider/content classification.

`MANUAL_UPLOAD` must become a first-class Inbox acquisition path accepting supported provider documents as well as expense evidence and feeding the same hash/parser/classifier/review pipeline. The current receipt URL-only path may remain temporarily for existing manual Expense behavior until the later Expense-to-Journal cutover, because current manual Expense creation still has unresolved double-entry account-selection semantics.

For Uber, 5C should reuse the existing `UBER_EATS_REPORTING` public capability rather than introduce an External-Channels -> Accounting callback. Accounting may register READY downloaded financial-report artifacts into `PROVIDER_API` acquisition using stable report/section identities. Historical finance ingestion must not use `ORDERS_AND_ITEMS_REPORT` to synthesize Uber-only historical order/item coverage.

### 17.7 Architecture effect and recommended implementation slices

The readiness design introduces no new cross-context dependency direction. Accounting continues to depend on the existing External Channels reporting public boundary; provider wire/download behavior remains owned by External Channels. The current direct-debt target therefore remains Foundation **3**, External **1**, Identity **2**, Runtime **7**, total **13**, with no new public SCC or scanner allowance expected.

Recommended implementation sequence:

1. **5C-A — Unified Inbox Core:** add SourceArtifact / ParseRun / InboxItem / TrustedSender / ProviderFinancialDocument / ProviderFinancialLine / provider-coverage persistence and Accounting-owned writer/policy boundaries; do not cut Gmail/Web/provider runtime inputs yet;
2. **5C-B — Acquisition Cutover:** route Gmail body + attachments, trusted-sender quarantine and Accounting Web manual uploads through the common intake pipeline while preserving current Expense downstream behavior during expansion;
3. **5C-C — Provider Financial Parsing + History:** add Clover Closeout/monthly, Uber financial report/monthly and Fantuan monthly parsers plus 2026-06-01 historical financial ingestion/coverage controls, still without Journal posting or `Order` synthesis.

5C remains evidence ingestion/review. Canonical Revenue Posting stays in 5D; provider settlement posting/reconciliation stays in Slice 6.

### 17.8 Deployment prerequisite before 5C-A

Repository policy does not require production deployment after every source slice, but 5B is the first Phase 9 persisted-schema foundation and its migration has never been applied on the running VM. Because 5C-A will add a second migration that depends on the 5B schema, the preferred rollout gate is to **deploy/apply 5B before implementing the 5C-A schema**. This isolates migration/runtime failures to the correct slice and confirms that the journal/CoA foundation can be applied cleanly before another persisted layer is stacked on top.

The 5B deployment gate only needs migration/runtime smoke evidence at this stage; it does not require pretending that Revenue/settlement workflows already use the new Journal. The Phase remains subject to the later consolidated active-verification/closeout gate.
