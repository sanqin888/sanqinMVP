# Post-Modularization Accounting Product Roadmap

Status: **EFA-B1 MERGED / CI GREEN / MIGRATION REVIEWED + COMMITTED TO DEV / PRODUCTION APPLICATION PENDING — EFA-B2 LOCAL SOURCE IMPLEMENTED / REVIEW PENDING — B2 PRODUCTION VERIFIED / CLOSED — B1 CLOSED / B0 3V-B PRODUCTION VERIFICATION STILL PENDING — DO NOT REOPEN PHASE 9**  
Planning date: 2026-09-20; updated: 2026-09-22  
Baseline: Phase 9 **PRODUCTION VERIFIED / CLOSED** at production `main@dbea68f3`  
Document-recognition audit baseline: `origin/dev@1ede0599`; Slice 3 merged as `caabf1c1`; Evidence Viewer Slice 1 merged as `0371a155`; Slice 1B merged as `9ae4d85d`; additive folder migration committed as `cc4c8016`; Evidence Viewer Slice 2 merged in PR #2438 as `4d68379e`; Slice 3V-A merged in PR #2439 as `0d6909bb` with PR CI #6054 and merged-head CI #6055 green; Slice 3V-B merged in PR #2440 as `0ac9117f` after final head `3c5c0400`, PR CI #6057 and merged-head CI #6058 green

## 1. Purpose and placement

This is the approved follow-on plan for:

1. provider-document recognition safety and auditable Human Review Revision;
2. ExpenseDocument -> canonical Journal cutover and final `AccountingTransaction` contraction;
3. canonical Accounting Sales Analytics;
4. Expense Funding Attribution (split-level funding + Management reporting scope);
5. Trial Balance;
6. an initial **资产负债变动表 / Balance Movement Statement**;
7. later promotion to a formal Balance Sheet after a real fiscal-year opening balance is entered.

The document-recognition/human-review work is an immediate Accounting correctness package.
It may precede Slice A without reopening Phase 9 because it hardens the already-live
provider-evidence/settlement workflow rather than extending the closed modularization
program.

This work belongs in **Accounting**, not Admin. Admin remains operational reporting (orders, gross order total, AOV, menu/channel operations). Any later Admin financial summary must consume an Accounting-owned report contract rather than duplicate P&L, tax, settlement or balance calculations.

This is a new post-modularization product project. It must not be treated as another Phase 9 slice.

## 2. Mandatory start gate

Implementation may begin only after:

- Phase 9 remains closed and its deferred real-world evidence is not reopened;
- Identity/Staff last-active-admin atomicity is completed or explicitly dispositioned;
- a final repository-wide modularization tail audit classifies all remaining ownership, concurrency, direct-edge and compatibility tails as closed, legitimate infrastructure/composition seams, provider-gated, compatibility-gated or deliberately deferred with a named owner;
- no unresolved architecture defect would force the Accounting work to build around the wrong owner;
- production Web Clover compatibility remains protected;
- each implementation slice performs a fresh readiness audit against latest `origin/dev`, `AGENTS.md`, CI, scanner/baseline and owner contracts.

Already-deferred real evidence does not block the project unless a slice directly depends on it: real CRA remittance, real Payroll reversal/correction, first real production period-close evidence, and Uber provider-history/cutover evidence.

The repository-wide modularization gate is satisfied at `origin/dev@1b18fb00` on 2026-09-19 after PR #2418 passed CI #5972 and the final tail audit was closed. This roadmap remains a separate post-modularization product project. The document-recognition correctness package now precedes Slice A; each source slice still begins from a fresh readiness audit and the normal local-review -> user-authorization -> PR/CI workflow.

## 3. Current baseline

### Sales

B2 Canonical Sales Analytics is production-verified/closed. Accounting Sales and the Dashboard sales summaries consume the canonical `GET /accounting/report/sales` projection. Monetary amounts come from Accounting Journal lines; Orders contributes only the narrow descriptive attribution boundary for channel/canonical primary payment evidence. The legacy paid-total `/accounting/report/slice` surface and its Accounting -> Orders reporting dependency are retired.

### Expenses

Confirmed Expense v1 facts currently materialize as:

```text
AccountingExpenseDocument
├─ AccountingExpenseSplit                 <- expense/category/tax facts
├─ AccountingExpensePaymentAllocation     <- reviewed document-level payment ownership
└─ canonical accounting.expense_document.v1 Journal
```

`AccountingTransaction` and `AccountingSourceType` were physically retired in B1-C2. Authoritative P&L/export, account movement and cash flow now read canonical Journal facts for Expenses. Historical/current v1 posting still treats category splits and payment allocations as independent child sets, which is the funding-attribution gap addressed by EFA before B3 Trial Balance.

### Journal / CoA

The canonical Journal already provides balanced entries, stable source-fact identity, category dimensions, audit and period locks. The CoA has ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE classes and includes cash/bank/provider pending assets, HST accounts, Store Balance/Payroll liabilities, opening-balance equity, revenue and operating/provider/payment expense accounts.

## 4. Immediate Work Package 0 — Document Recognition & Human Review Safety

Detailed design and audit: `docs/architecture/accounting-document-recognition-human-review-plan.md`

This work package is now **P0 Accounting correctness** and should be completed before new
financial-feature work that depends on provider settlement authority.

State: **Slice 0 merged in PR #2428 (`bbd0b1c0`); Slice 1 Human Review Revision + migration merged in PR #2429 (`1903b32a`, CI #6017 green); Slice 2 Human Review UI merged in PR #2431 (`e52c44b9`); Slice 3 layout-aware extraction merged in PR #2432 (`caabf1c1`) with green CI; Evidence Viewer Slice 1 merged in PR #2435 (`0371a155`, CI #6039 green); Slice 1B merged in PR #2436 (`9ae4d85d`, CI #6042 green), with additive migration `20260921124637_add_accounting_evidence_folders` committed as `cc4c8016` and SQL reviewed as safe/additive; Evidence Viewer Slice 2 merged in PR #2438 as `4d68379e` with CI green; Slice 3V-A merged in PR #2439 as `0d6909bb` after PR CI #6054 and merged-head CI #6055 passed; Slice 3V-B merged in PR #2440 as `0ac9117f` after final head `3c5c0400`, PR CI #6057 and merged-head CI #6058 passed; Reliability Slice A CSV ParseRun integrity merged in PR #2442 as `994f5a67`; Reliability Slice B Expense reconciliation + booking correction merged in PR #2443 as `6e89bc3b` with no migration; original Document Recognition Slice C Inbox pre-confirm UX merged in PR #2445 as `da77b9a5` after final head `3cd7e645` passed CI #6074. Production verification of the new scanned-PDF path remains pending.**

Baseline audited state before Slice 0:

- images use Sharp/local geometry preparation and AWS Textract AnalyzeExpense when enabled,
  with local Tesseract fallback;
- PDF uses Poppler plain text first and invokes Textract only when no local text is found;
- CSV/XLSX use native structured paths where implemented, including the Fantuan Adjustment
  Detail workbook; observed English and Chinese Fantuan export columns are normalized inside
  that provider parser rather than sent through OCR;
- provider evidence can be classified/confirmed, but machine-derived financial lines have
  no durable human correction/review revision;
- settlement planning proves Journal debit/credit balance but has no general statement
  control-total integrity gate before READY.

Required order:

1. **Slice 0:** provider control-total fail-closed plus the real Uber layout regression,
   with no schema/dependency change;
2. **Slice 1:** versioned Human Review Revision persistence/authority; expected Prisma
   migration;
3. **Slice 2:** Accounting Inbox/Settlement review UI for source vs machine vs reviewed
   effective values;
4. **Slice 3:** layout-aware provider-neutral document extraction boundary using current
   installed capabilities first — **merged in PR #2432 as `caabf1c1`**, with Poppler
   bbox/Textract geometry normalized into an Accounting-owned extraction contract, Tesseract
   retained as text-only fallback, and the observed Uber July label/value regression pinned
   without adding a dependency/schema change;
5. **Slice 3V:** local-PDF verification/routing hardening, intentionally split:
   - **3V-A:** native-text usability + sanitized Poppler golden — merged in PR #2439 as
     `0d6909bb`. Provider semantic mapping requires usable native text; Poppler text-only
     evidence may use only same-line label/value pairs and never flattened cross-line adjacency.
     The sanitized July Uber regression pins `260336 / 33848 / 143194` through control-total
     reconciliation;
   - **3V-B:** merged in PR #2440 as `0ac9117f` with PR CI #6057 and merged-head
     CI #6058 green; production verification remains pending. `SCAN_CANDIDATE` PDFs use local
     `pdfinfo` + sequential `pdftocairo` rasterization at 200 DPI, capped at 6 pages, then
     synchronous Textract image OCR per page. SanQ merges only Textract LINE text/confidence/
     geometry with original PDF page numbers; page-level AnalyzeExpense totals/tax/line-item
     semantics are not provider authority. Any page/raster/OCR/resource failure fails the whole
     document closed. No S3/async Textract, Paddle or BDA is part of the approved normal path;
6. **Evidence Viewer Slice 1:** unify protected artifact-stable-id delivery, make `/content`
   inline and add explicit `/download`, with browser-native PDF/image preview while structured
   CSV/XLSX preview remains a later bounded adapter slice — merged in PR #2435;
7. **Evidence Viewer Slice 1B:** add logical Accounting evidence folders plus an independent
   artifact-folder assignment and audited multi-file move UI. Physical binaries and
   `storedUrl` remain unchanged; existing files begin in virtual Unfiled — merged in PR #2436,
   with additive migration `20260921124637_add_accounting_evidence_folders` reviewed and
   committed to `dev`;
8. **Evidence Viewer Slice 2:** bounded non-executing CSV/XLSX table preview using existing
   native parser capabilities — merged in PR #2438 as `4d68379e`;
9. **Reliability Slice A:** restore the successful-ParseRun SHA-256 `resultHash` invariant for
   structured-expense CSV and ambiguous provider-recognition CSV — merged in PR #2442 as
   `994f5a67`;
10. **Reliability Slice B:** reconcile ordinary Expense source amounts, expose fail-visible
    `MATCHED / MISMATCH / INSUFFICIENT` status, keep machine extraction read-only, and make the
    existing final booking fields explicitly editable for operator correction. Confirmation records
    machine values, final values and corrected fields in Expense evidence/audit. No Expense review
    persistence or Prisma migration is required;
11. **Slice 6:** optional suspense workflow only after a separate Accounting policy decision.

Do not use a new OCR engine as a substitute for reconciliation or human review. Machine
extraction, operator correction, reconciliation and posting authority remain separate
auditable layers.

## 5. Opening-balance policy

The operator does not have a reliable real-world 2026-06-01 opening balance and does not intend to force the current year to reconcile to real cash/bank balances.

Initial policy:

```text
Accounting start: 2026-06-01
Management opening balance: $0
Meaning: cumulative movement recorded by SanQ since the start date
Not a claim of real-world absolute account balances
```

Do not invent a historical opening Journal.

Until a reviewed real fiscal-year opening is entered, the product is **资产负债变动表 / Balance Movement Statement**, not a formal Balance Sheet.

## 6. Slice A — Expense Journal Canonicalization

**2026-09-21 B1-A state:** **PRODUCTION DEPLOYED / MIGRATION VERIFIED**. B1-A merged in PR #2448 as `8614633a` after CI #6082 passed; the user-generated companion migration `20260921224139_post_mod_accounting_b1a_expense_split_ownership` was committed to `dev` as `7e54853a` and reviewed as additive-only. The post-deployment read-only check confirms that migration is finished/not rolled back in production Prisma history and `AccountingExpenseSplit` exists.

**2026-09-21 B1-B state:** **PRODUCTION VERIFIED / CI GREEN / NO REPORT CUTOVER**. PR #2449 merged to `dev` as `324a16eb` after final head `acb8db42` passed CI #6086. Production now runs the B1-A/B1-B/B1-C0 stack. Real reviewed Expense `expense_iet91ut05fafso8rl48kds9v` confirmed at CAD 84.69 with one Expense-owned split, one complete payment allocation and one canonical `accounting.expense_document.v1` Journal created through the same-transaction posting authority. Unknown-payment confirmation remains intentionally unposted until the one-way completion workflow supplies reviewed allocation.

Do this first so Trial Balance/balance reporting no longer depends on a parallel single-entry Expense path.

Target:

```text
ExpenseDocument
    ↓ Expense-owned canonical posting policy
Accounting Journal
    ├─ debit operating expense + category dimension
    ├─ debit HST/GST recoverable when applicable
    └─ credit reviewed payment account(s) or reviewed unpaid-expense liability
```

Requirements:

- ExpenseDocument remains evidence/document owner;
- category/tax split persistence must belong to Expense itself rather than remain permanently encoded only as legacy `AccountingTransaction` rows;
- preserve category splits, payment allocations, CAD rules, audit and period lock;
- use deterministic stable source fact/idempotency;
- use Expense-specific authority, not arbitrary Web Journal writes;
- keep confirmation/posting/materialization atomic where required;
- cut P&L, account movement and cash flow to Journal facts after parity proof;
- remove the `AccountingTransaction` writer only after replacement parity;
- remove the model only after production preconditions prove no retained rows/data obligation.

### Unpaid expense gate

`paymentAllocations` may currently be absent. Before cutover decide one reviewed policy:

- require complete payment allocation before Journal posting; or
- add an explicit Accounts Payable liability flow.

Never silently credit cash/bank when no payment allocation exists. Accounts Payable CoA/schema work, if selected, is a separate migration/architecture decision.

### B1-A — Expense split ownership foundation

The 2026-09-21 readiness audit found that `AccountingTransaction` EXPENSE rows are still doing two jobs: legacy report arithmetic and the only durable category/tax split persistence for an Expense. Directly deleting that writer would therefore delete the source facts required by the later canonical Journal policy.

B1-A is an explicit expand-contract foundation:

- add dedicated `AccountingExpenseSplit` persistence owned by `AccountingExpenseDocument`;
- atomically dual-write the new split rows and the legacy `AccountingTransaction` compatibility copy inside the existing Serializable Expense write;
- keep Expense query/UI, C0 draft construction and authoritative financial reports on the legacy copy during this slice;
- make C0 read both representations and fail closed on `SPLIT_PERSISTENCE_MISMATCH`;
- register `accounting.expense-split-ownership.v1` with zero-mismatch parity as the exit gate;
- do not start Expense Journal writes or report cutover in B1-A.

A read-only production preflight on 2026-09-21 found **0 confirmed Expense documents / 0 active legacy Expense transactions / 0 canonical Expense Journals**. Therefore the additive split table currently needs no historical backfill. The preflight must be repeated before deployment; if confirmed Expenses appear before migration/cutover, their split facts require an explicit deterministic backfill/parity plan rather than an inferred fallback.

B1-A's additive migration has now been generated by the user and committed to `dev` as `7e54853a`. SQL review confirms the expected create-table/index/FK-only shape with no backfill or destructive operation. Production promotion still requires the normal reviewed migration deployment gate.

### B1-B — Expense owner-read + atomic Journal authority

B1-B cuts the business-facing Expense read model and C0 draft construction to `AccountingExpenseSplit` while keeping the legacy Transaction copy only as temporary parity/report evidence. Expense API/Web cut directly to `splitStableId`; no response-level `txStableId` compatibility alias is kept.

Posting rules:

- complete payment allocation at confirmation -> persist Expense/splits/allocations and canonical Journal in one Serializable transaction;
- unknown payment allocation at confirmation -> keep the confirmed Expense unposted;
- later reviewed payment completion -> persist allocations and canonical Journal in one Serializable transaction;
- identical payment-completion retry may idempotently converge a missing Journal;
- build and revalidate Journal authority from persisted Expense owner facts and child stable IDs inside the transaction;
- keep `SPLIT_PERSISTENCE_MISMATCH` fail-closed before Journal authority;
- do not cut financial reports or remove legacy Expense Transaction writes in B1-B;
- production rollout must apply the already-committed B1-A migration before starting B1-B API/Web code, because B1-B reads `AccountingExpenseSplit` directly.

### B1-C0 — Expense report parity preview

**2026-09-21 state:** **PRODUCTION PARITY EVIDENCE PASSED / MERGED / CI GREEN / READ-ONLY / NO CUTOVER / NO MIGRATION / NO GRAPH CHANGE**. PR #2450 merged to `dev` as `f164be7a` after final head `12909b5d` passed CI #6090. The full canonical range from accounting start date 2026-06-01 currently contains one reviewed confirmed Expense; read-only production reconstruction of the C0 gate shows split mismatch 0, missing/duplicate/orphan/non-v1 Journal anchors 0, P&L 7495=7495 cents, recoverable tax 974=974 cents, payment-account movement -8469=-8469 cents and OPERATING cashflow -8469=-8469 cents.

B1-C0 exists because B1-C1 cannot cut authoritative reports before B1-B is production-verified. It adds a read-only `GET /accounting/report/expense-journal-parity` gate that compares the currently authoritative legacy Expense report arithmetic with canonical Expense Journals both per Expense source fact and in aggregate:

- category-level Expense P&L;
- recoverable HST/GST input tax;
- payment-account balance movement;
- CASH/BANK cashflow classification and signed movement;
- split-persistence parity;
- missing/duplicate/orphan canonical Expense Journal anchors and any non-v1 Expense-document Journal authority.

A zero-Expense population is explicitly **not** accepted as cutover evidence. Confirmed Expenses with unknown payment allocations remain blockers because they are intentionally unposted under the current no-Accounts-Payable policy. B1-C0 does not change P&L, account balance, cashflow, exports or the legacy Expense Transaction writer.

B1-C1 remains gated on: B1-A migration deployed first, B1-B API/Web deployed, Accounting PWA reinstalled, at least one reviewed confirmed Expense with complete payment allocation posted through the canonical Journal path, zero split/report parity deltas, and no missing/duplicate/orphan Expense Journal anchors.

### B1-C1 — Authoritative Expense report cutover

**2026-09-21 state:** **PRODUCTION VERIFIED / MERGED / CI GREEN / PRODUCTION PARITY GATE PASSED / NO MIGRATION / NO GRAPH CHANGE**. PR #2452 merged to `dev` as `cdd3b47a` after final head `dc849d20` passed CI #6099. Production now runs `cdd3b47a`; post-cutover Expense `expense_bmwt1anetgvhiglbc6wsjzf8` proves zero legacy Transaction write while preserving ExpenseSplit + canonical Journal authority and correct Journal-driven report arithmetic.

B1-C1 cuts authoritative P&L/export, account-balance and cashflow reads to canonical Journal facts including `EXPENSE_DOCUMENT`; removes the parallel `AccountingTransaction` Expense projection and report-side `AccountingExpensePaymentAllocation` arithmetic; stops legacy Expense Transaction create/delete paths; removes the posting authority's dependency on legacy split shadow parity so new post-cutover Expenses can post from Expense-owned facts alone; moves Upload Library delete protection from legacy Transaction counts to Expense-owned split counts; records split CREATE/DELETE audit facts as `ACCOUNTING_EXPENSE_SPLIT`; and tightens architecture guards to zero production `AccountingTransaction` mutation callers. The `AccountingTransaction` model/table and existing historical compatibility row are retained for later separately reviewed destructive contraction.

The legacy-comparison diagnostic routes `GET /accounting/report/expense-journal-parity` and `GET /accounting/journal/canonical-expenses/shadow-preview` are intentionally retained in this slice to avoid an unapproved HTTP-contract removal. After B1-C1 stops legacy dual-write, new Expenses will make those legacy-comparison diagnostics fail closed; they are therefore pre-cutover evidence/diagnostic surfaces only, not post-cutover canonical-health monitors. Replacing or removing them belongs to the later explicit compatibility contraction.

### B1-C2 — Expense compatibility contraction

**2026-09-22 state:** **PRODUCTION VERIFIED / CLOSED / MIGRATION DEPLOYED / NO GRAPH CHANGE**. B1-C2 source merged through PR #2456 as `1cd8ee92`; the user-generated migration `20260922041449_post_mod_accounting_b1c2_drop_legacy_accounting_transaction` is committed at `24e99b40`, CI #6110/#6111 passed, and production applied the migration at `2026-09-22T04:34:24Z`.

Production verification confirms the `AccountingTransaction` table and `AccountingSourceType` enum are physically absent, both retired diagnostic routes are no longer registered, and the API starts without Prisma/relation errors. The single pre-cutover CAD 84.69 compatibility row was intentionally removed with the table under the approved destructive contraction.

Post-migration runtime evidence closes the final gate: Expense `expense_v618ly4fflr6jzyvgeiz3e16`, created at `2026-09-22T04:41:26Z`, persists one Expense-owned split (2909 cents + 378 cents tax), one 3287-cent `account_primary_bank` payment allocation and one canonical Expense v1 Journal `journal_cd4frymqkjt7cm0qvld773xu`. Its three Journal lines debit operating expense 2909, debit recoverable HST/GST 378 and credit primary bank 3287, so debit=credit=3287. Audit evidence records Expense confirmation, split creation and Journal creation after the legacy table was already absent.

`accounting.expense-split-ownership.v1` is closed. B2 Canonical Sales Analytics is no longer blocked by Expense compatibility and may proceed to a fresh readiness audit; this closeout does not itself start B2 implementation.

## 7. Slice B — Canonical Sales Analytics

**2026-09-22 closeout state:** **B2 PRODUCTION VERIFIED / CLOSED — B1 DEPENDENCY SATISFIED / B2-P0A PRODUCTION VERIFIED / B2-P0B PRODUCTION VERIFIED + COMPLETE / B2-A MERGED + CI GREEN / B2-B MERGED + CI GREEN / B2-C MERGED + CI GREEN / B2-D MERGED + CI GREEN / B2-E MERGED + CI GREEN + PRODUCTION VERIFIED**. The B2 readiness audit found that immutable Orders SALE facts remained durable after the 2026-09-13 historical Journal replay, but `AccountingCanonicalSalePostingService.postCanonicalSale()` had no production runtime caller. This was a continuity gap, not a Journal redesign requirement.

**B2-P0A — Canonical SALE catch-up:** the operator ran the existing guarded replay for `2026-09-13..2026-09-23` exclusive. Preview/execution reported 131 candidates / 131 READY / 0 BLOCKED, zero parity delta and balanced debit/credit of 213172 cents. Read-only production verification then found 131 immutable SALE facts, 131 exactly-one canonical SALE Journal anchors, zero missing and zero duplicate anchors across Toronto business dates 2026-09-13 through 2026-09-22. P0A is complete.

**B2-P0B — Continuous Canonical SALE Posting:** **PRODUCTION VERIFIED / COMPLETE**. PR #2459 merged as `2c4cb834`; CI #6118 passed Architecture plus all API/Web lint/build/strict/tests. Forward production evidence is Web Order `c6ab16o6d7urm906lohrep6yg`: paid at `2026-09-22T15:09:16.738Z`, immutable `order.financial_sale.v1` fact persisted at `15:09:16.846Z`, and canonical SALE Journal `journal_qc0l2z5vzakcg6nd2fzybwdw` was created automatically at `15:09:27.551Z` with exactly one source anchor and idempotency key `canonical-sale:c6ab16o6d7urm906lohrep6yg:v1`. Its four lines balance debit=credit=1495 cents. API processor logs at `15:09:27.661Z` show a `RECENT` reconciliation with `scanned=23`, `immutable=23`, `alreadyPosted=22`, `posted=1`, `blocked=0`, `failed=0`, `complete=true`, proving forward convergence without manual replay. Historical `LEGACY_CURRENT_ORDER` remains controlled-replay-only and Uber remains statement-authoritative until its separate `liveOrderFactCutoverAt`.

**B2-A — Sales Analytics Contracts + Attribution Policy:** merged through PR #2461 as `1c1549c2`; final head `8f982260` passed CI #6125 after the initial CI #6124 exposed only six Prettier formatting failures. Orders now publishes the dedicated non-monetary sales-attribution reader for SALE plus immutable adjustment/reversal facts, and Accounting owns the Sales source/account/tender/coverage vocabulary without changing the existing report/UI authority.

**B2-B — Canonical Journal Sales Projection:** merged through PR #2462 as `fe9b08da`; final head `645f0423` passed CI #6130 after the earlier CI rounds exposed only lint/test-contract registration issues. The read-only `GET /accounting/report/sales` projection derives every monetary amount from canonical Journal lines, joins Orders only for descriptive attribution, fails closed on broken Accounting provider/replacement references, and exposes total/daily/channel/primary-payment/tender/source/coverage projections without changing Journal posting authority.

**B2-C — Sales UI cutover:** **MERGED / CI GREEN** through PR #2463; final head `b870ae1d` passed CI #6132 and squash merged as `db7a7b65`. The Accounting Sales page moved from the legacy P&L + `/accounting/report/slice` combination to `/accounting/report/sales`. The page shows canonical Gross Sales, Discounts, Net Sales Revenue, Output Tax, approved Channel Contribution, daily trend, by-channel and canonical-primary-payment attribution, actual Journal tender mix, provider financial coverage, attribution quality and explicit source/adjustment buckets. Equal-period comparison uses the same canonical endpoint and is calculated from the effective clamped report range; if the prior period is outside Accounting coverage it is omitted instead of comparing unequal periods. No backend, schema/migration, package, Journal policy or context direction changes were introduced.

**B2-D — Dashboard Canonical Sales cutover:** **MERGED / CI GREEN** through PR #2464; final head `3530764e` passed CI #6134 and squash merged as `9e0dac17`. Dashboard keeps its existing Accounting-owned dashboard summary/expense/attention cards but replaces its two legacy Orders paid-total sales summaries with the existing `AccountingSalesAnalyticsReport` from `GET /accounting/report/sales`. The overview intentionally uses only `byChannel[*].summary.netSalesRevenueCents` and `byPrimaryPaymentMethod[*].summary.netSalesRevenueCents`; the payment section is explicitly labelled primary-payment revenue attribution and is not presented as tender mix. The full Sales-only daily, provider-coverage, tender and source/adjustment detail remains on the Sales page. No backend authority, schema/migration, package, Journal posting, settlement, Orders financial-fact or attribution-owner change was introduced.

**B2-E — Legacy Sales slice cleanup:** **MERGED / CI GREEN / PRODUCTION VERIFIED** through PR #2465; final head `bff7899a` passed CI #6136 and squash merged as `3448c271`. The contraction removes `GET /accounting/report/slice`, `AccountingService.dimensionSlice()`, Accounting's `OrderReportingFactsModule` wiring, the paid-total-only `readPaidTotalDimensionsForRange()` reader method/DTOs, and the obsolete Web `AccountingOrderDimensionSlice`. The shared `OrderReportingFactsModule` remains intact for operational `ReportsModule` consumers of `readMetricsForRange()` and `readItemsForRange()`. Architecture regressions forbid reintroducing the legacy Accounting seam while retaining the independent Reports boundary. No schema/migration, package, Journal posting, settlement, Orders financial-fact or attribution-owner change was introduced.

**B2 consolidated production verification:** deployed checkout `3448c271` started the API/Web/Uber worker cleanly. Production logs show Dashboard and canonical `GET /accounting/report/sales` returning 200, zero post-deploy `/accounting/report/slice` requests, and no Web runtime errors. A read-only Journal sanity query from the Accounting start date found balanced debit=credit for `order.financial_sale.v1` (1,353 entries / 2,394,791 cents), `order.financial_reversal.v1` (2 / 3,952 cents), `accounting.provider_financial_document.v1` (5 / 2,192,707 cents), and `accounting.uber_pre_cutover_order_reversal.v1` (119 / 405,369 cents). The operator also reported no visible anomaly after deployment. This closes the B2 public-route/PWA gate and the complete Canonical Sales Analytics work package.

**Deferred B4 polish tail:** selecting `2026-06-01..2026-06-30` correctly returns 200 for the current-period Sales query. The UI then computes the equal-length prior period `2026-05-02..2026-05-31`, which is before `accountingStartDate=2026-06-01`; the API correctly rejects that comparison with 400 and the UI omits the unavailable comparison. This is not a timezone defect and does not reopen B2. B4 should avoid issuing a known-out-of-coverage comparison request so expected control flow does not create API ERROR log noise.

Accounting Journal/canonical financial facts continue to own every Accounting sales amount. **B2 is PRODUCTION VERIFIED / CLOSED.**

### Net Sales Revenue

Define:

```text
Net Sales Revenue
= Sales Revenue
- Sales Discounts
+ Delivery Revenue
+ Card Surcharge Revenue
```

Rules:

- HST/GST is excluded from revenue;
- Tips and Other Operating Revenue remain separately visible;
- refunds/reversals/changes reduce canonical revenue through Journal authority;
- platform commission and payment-processing fees remain expenses.

Add a management-only metric:

```text
Channel Contribution
= Net Sales Revenue
- Platform Commission
- Payment Processing Fees
- Platform Promotion Expense
```

Do not label Channel Contribution as Revenue or Net Profit.

### By channel

Replace raw paid-total cards with canonical:

- gross/nominal sales;
- discounts;
- Net Sales Revenue;
- tax separately;
- attributable provider/payment fees;
- Channel Contribution;
- equal-period comparison.

Historical Uber replacement remains Journal-authoritative. Never reconstruct historical provider revenue from manual `Order.totalCents` after reversal/provider-statement replacement. If provider coverage is incomplete, surface that state instead of presenting complete contribution numbers.

### By payment method / tender mix

“按支付方式” should mean **canonical primary payment method** for revenue attribution. Attribute the complete order's Net Sales Revenue to the primary method; do not invent proportional revenue splits across mixed tenders.

Add a separate **收款构成 / Tender mix** view for actual cash/card/Store Balance/provider receivable movements.

### Visual analysis

Prefer the existing chart stack. Planned views:

- KPI row: gross sales, discounts, Net Sales Revenue, tax, fees, Channel Contribution;
- daily/weekly/monthly trend and previous equal-period comparison;
- channel amount/share;
- primary-payment-method amount/share;
- actual tender mix;
- revenue -> fees -> contribution waterfall;
- provider-coverage / period-close badges.

### Adjustment presentation

Split the current generic “会计调整 / Adjustments” presentation into at least:

- order refund/change reversal;
- historical migration/de-duplication reversal;
- genuine manual accounting adjustment.

Do not rewrite valid historical Journals merely to simplify presentation.

## 7A. Expense Funding Attribution (EFA)

Detailed readiness/design: `docs/architecture/accounting-expense-funding-attribution.md`.

**2026-09-22 state:** **EFA-A COMPLETE / EFA-B1 MERGED + CI GREEN + MIGRATION REVIEWED + COMMITTED TO DEV / PRODUCTION APPLICATION PENDING / EFA-B2 LOCAL SOURCE IMPLEMENTED + REVIEW PENDING**. B2-E is deployed and production-verified, so Sales B2 is closed. EFA is inserted before B3 Trial Balance so B3 can characterize the final Expense Journal cardinality rather than a transitional one.

The operator explicitly accepts deleting/recreating the single-user Accounting PWA during the later v2 cutover. Therefore no long-lived old-client write compatibility layer is required. Historical `accounting.expense_document.v1` source facts/Journals remain immutable/readable.

Target:

```text
ExpenseDocument
  └─ ExpenseSplit
       ├─ category
       ├─ amount/tax
       └─ paidFromAccount
             ↓ group by funding account
       1..N balanced Expense v2 Journals
```

Management visibility is an account policy, not a deletion rule. A funding account can set `includeFundedExpensesInManagementReports=false`; Expense groups funded by that account are later excluded from Management Dashboard/P&L/category/trend/export views while remaining in canonical Journal, account movement, actual cash flow, audit/evidence and future GST/HST statutory reporting.

EFA-B1 is additive only: it introduces `fundingAttributionVersion`, nullable split-level funding relation and the account management-policy flag. Source merged through PR #2468 / `2250b22d`; PR CI #6145 passed. User-generated migration `20260922183548_accounting_efa_b1_funding_attribution_foundation` was reviewed as additive-only and is committed to `dev` as `3e445345`. Production application is still a later gate.

EFA-B2 is implemented locally on top of that dev baseline: `CanonicalExpenseFactV2`, persisted split-funding authority, per-funding-account balanced Journal grouping, deterministic account-scoped v2 idempotency, v1/v2 authority revalidation, operational funding-account validation, and focused retry/period-lock/grouping/drift regressions. It does not yet activate v2 Expense writes or change Web/PWA/report behavior; those remain EFA-C/D.

## 8. Slice C — Trial Balance and Balance Movement

Start only after Expense -> Journal cutover removes parallel Expense arithmetic from authoritative financial reporting.

### Trial Balance

Build directly from Journal lines by account/account class.

Required invariants:

- total debit = total credit;
- all lines map to Accounting-owned accounts;
- business-timezone as-of/range semantics;
- explicit OPENING_BALANCE treatment;
- visible period-close state;
- UI/PDF/CSV share one projection.

### 资产负债变动表 / Balance Movement Statement

Use cumulative recorded movement from the Accounting start date and the explicit $0 management opening.

Suggested presentation:

```text
Assets movement
  Store cash / bank
  Clover / Uber / Fantuan pending
  HST recoverable
  ...

Liabilities movement
  HST payable
  Store Balance liability
  Payroll liabilities
  ...

Equity bridge
  Opening Balance Equity
  Cumulative recorded earnings since start
  Other direct equity movements

Check:
Assets - Liabilities - Equity = 0
```

Cumulative Revenue/Expense must bridge into Equity presentation so the double-entry equation remains explainable.

The UI must clearly say:

> 从 2026-06-01 起按 $0 期初计算，仅表示 SanQ 已记录交易产生的累计变动；不代表现实银行、现金或其他账户的绝对余额。

### Formal Balance Sheet later

At a future fiscal-year opening, after reviewed real opening balances are available, post an explicit balanced OPENING_BALANCE Journal. Only then promote the product label to **资产负债表 / Balance Sheet** for dates on/after that verified opening.

## 9. Slice D — Reporting polish

After canonical foundations are stable:

- improve P&L adjustment labels/decomposition;
- make Cash Flow Journal-only;
- add Trial Balance / Balance Movement exports;
- keep date presets business-timezone-safe;
- add close/coverage indicators;
- add drill-through from totals to Journal/source facts;
- visually distinguish management metrics from accounting statement values.

## 10. Architecture rules

Preserve:

```text
Orders / External Channels / Payroll / Expense evidence owners
                 ↓ narrow public owner facts
              Accounting
                 ↓
        canonical balanced Journal
                 ↓
     financial reports / analytics
```

- Accounting must not read foreign-owner Prisma tables to rebuild facts.
- Orders may expose channel/payment dimensions through a narrow public boundary.
- External Channels owns provider evidence/mapping; Accounting owns accepted posting.
- Payroll keeps Payroll-specific posting authority.
- ExpenseDocument remains evidence owner after Journal cutover.
- Web consumes Accounting Web contracts; no page-local financial wire DTO ownership.
- Admin does not become a second financial-calculation owner.

Any new context direction, scanner allowance, provider ownership change or production-payment semantic change requires explicit architecture authorization before implementation.

## 11. Deferred evidence and coverage

The Phase 9 deferred items remain future evidence, not reopened debt:

- 2258-cent fail-closed RETENDER exception;
- real CRA remittance;
- real Payroll reversal/correction;
- first real production period close;
- incomplete Uber provider history.

Where incomplete evidence affects a requested report, show the coverage state. For example, Uber Channel Contribution without complete commission evidence should be incomplete/unavailable, not inferred from Order totals.

## 12. Migration expectations

- Document-recognition Slice 0 control-total hardening: no migration expected.
- Expense booking correction uses existing Expense evidence/audit fields; the discarded
  Expense Human Review Revision prototype is not part of the merged design, so **NO MIGRATION**.
- Scanned-PDF page rasterization with the already installed Poppler plus the existing Textract
  SDK path requires no new dependency; any future new OCR/runtime dependency still requires
  separate authorization.
- Sales Analytics/report UI: normally no migration.
- Expense -> Journal cutover: may not need additive schema, but final `AccountingTransaction` model contraction is destructive and requires separate migration review/authorization.
- Accounts Payable, if chosen: separate CoA/schema/migration decision.
- Trial Balance / Balance Movement: normally no migration if Journal/CoA are sufficient.
- future real opening balance: reviewed data operation through Journal authority, not fabricated migration history.

This roadmap itself authorizes no migration or new OCR/runtime dependency.

## 13. Acceptance and handoff

Every future slice must begin with a read-only readiness audit, preserve the final modularization graph unless explicitly authorized otherwise, add financial-semantic and boundary regressions, compare fixed historical totals before cutover, and keep unavailable real/provider evidence explicitly deferred.

The Expense recognition/correction package is merged with no schema migration. The current
handoff is the Expense Journal canonicalization work below; no new OCR/runtime dependency is
required.

**Post-Modularization Accounting — Slice C0: Expense Journal Canonicalization Shadow Preview**

> Naming note: this roadmap C0 is separate from the earlier Document Recognition **original Slice C**
> (Inbox pre-confirm visibility / irreversible-action UX). The original Slice C closes independently;
> do not treat its completion as authorization to continue into Journal C1.

Readiness re-confirmed on 2026-09-21:

- Expense remains the only active `AccountingTransaction` mutation owner;
- the sole accidental production Expense/Transaction was operator-removed and independently
  verified absent before C0, leaving zero confirmed Expense rows and zero retained Expense
  `AccountingTransaction` rows requiring replay;
- payment allocations may be absent by current product policy, so canonical posting must fail
  closed with `MISSING_PAYMENT_ALLOCATION` rather than infer cash/bank or create Accounts Payable;
- canonical mapping is debit `account_general_operating_expense` with the existing expense
  category dimension, debit `account_hst_recoverable` for recoverable tax, and credit only the
  reviewed CAD payment allocation account(s);
- C0 is read-only: deterministic Expense source fact/idempotency, per-document draft hash,
  `READY / BLOCKED / ALREADY_POSTED` classification and range `planHash`; no Journal writer,
  report cutover or legacy mutation removal yet;
- C0 requires no Prisma migration, dependency change or context-edge change.

B1-A source/migration and B1-B owner-read/atomic Journal authority are now merged to `dev`. B1-C0 provides the read-only report-parity evidence gate while B1-B production verification remains pending. Only after the B1-A migration and B1-B runtime are deployed, the Accounting PWA is reinstalled, and a full-range B1-C0 report passes on real reviewed Expense evidence may B1-C1 cut authoritative P&L/account movement/cash flow to Journal facts, stop the legacy Expense Transaction writer/read arithmetic, and then proceed toward compatibility contraction.

**Payment-completion product gate added before C1:** confirmed Expenses may retain the formal
unknown-payment state (`paymentAllocations = []`), but the Expenses surface now owns a narrow,
one-way completion workflow. Only the payment-allocation child facts may be added after confirmation;
date, booked total, category/tax splits, memo and evidence remain immutable through this action.
Completion must use active CAD accounts, close exactly to the booked total, respect Accounting period
locks, use the Expense parent row as the Serializable concurrency anchor, write audit evidence, and
fail if allocations already differ or an Expense Journal already exists. Identical retries are
idempotent. The records surface filters the complete confirmed-Expense
set server-side by local-business date range, minimum amount and payment account/unassigned state
before pagination (10 rows by default). This product slice does not authorize Journal C1, add
Accounts Payable, change schema, or reopen Phase 9.
