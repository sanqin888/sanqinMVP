# Post-Modularization Accounting Product Roadmap

Status: **CLOVER FEE BANK CLEARING PRODUCTION VERIFIED; PAYOUT-E-B1 PRODUCTION VERIFIED / MIGRATION APPLIED; PAYOUT-E-B2 PRODUCTION VERIFIED / NO MIGRATION; PAYOUT-E-A + INBOX-ONLY + SETTLEMENT ROW-DECISION FOLLOW-UPS DEPLOYED — PAYOUT-D DEPLOYED / BACKEND DATA-PATH VERIFIED / UI SPOT-CHECK PENDING — PAYOUT-C PRODUCTION VERIFIED — PAYOUT-B MIGRATION APPLIED — PAYOUT-A MERGED / CI GREEN — B4-B MERGED / CI GREEN — B4-A MERGED / CI GREEN — B3 PRODUCTION VERIFIED / CLOSED — EFA PRODUCTION VERIFIED / CLOSED — B2 PRODUCTION VERIFIED / CLOSED — B1 CLOSED / B0 3V-B PRODUCTION VERIFICATION STILL PENDING — DO NOT REOPEN PHASE 9**  
Planning date: 2026-09-20; updated: 2026-09-25  
Baseline: Phase 9 **PRODUCTION VERIFIED / CLOSED** at production `main@dbea68f3`  
Document-recognition audit baseline: `origin/dev@1ede0599`; Slice 3 merged as `caabf1c1`; Evidence Viewer Slice 1 merged as `0371a155`; Slice 1B merged as `9ae4d85d`; additive folder migration committed as `cc4c8016`; Evidence Viewer Slice 2 merged in PR #2438 as `4d68379e`; Slice 3V-A merged in PR #2439 as `0d6909bb` with PR CI #6054 and merged-head CI #6055 green; Slice 3V-B merged in PR #2440 as `0ac9117f` after final head `3c5c0400`, PR CI #6057 and merged-head CI #6058 green  
B3 closeout baseline: latest `origin/dev@e29621bc`; B3-A merged through PR #2475 / squash `9c92eeda`, B3-B through PR #2476 / squash `ec2cff0f`, B3-C through PR #2478 / final head `12597b96` / squash `dcf12666`, and merge-evidence docs through PR #2479 / squash `b5d64e0e`. B3-D production reconciliation passed on 2026-09-23 against live authenticated API output and read-only canonical Journal/CoA data. Detailed readiness, implementation and closeout evidence: `docs/architecture/accounting-b3-trial-balance-readiness.md`.

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

2026-09-24 follow-up: Clover statement semantic-detail parser v7 is **MERGED / CI GREEN**
through PR #2516 (`b8e5b844`, CI #6310). It separates Monthly Equipment Bill base/HST from
card/network fees, maps the base to the existing `expense_software` category, adds exact FEES
detail reconciliation, and preserves category on settlement Journal lines. That source-only slice
did not rewrite already materialized historical documents.

2026-09-25 follow-up: Clover modern statement parser v8 is **MERGED / CI GREEN via PR #2535** on
`accounting/clover-modern-statement-v8`. Real July/August statements establish a new stable
layout (`YOUR CARD PROCESSING STATEMENT`, four-digit `PERIOD`, Account Summary, Fee Summary,
cross-page Fees table). v8 intentionally stops accepting the pre-July PDF layout while preserving
historical v7 materialized raw codes in settlement/reporting. It reads the modern layout from
Poppler geometry, accepts the observed equipment aliases `MONTHLY EQUIPMENT BILL` and
`Clover Flex 3` into semantic equipment-fee raw codes, recognizes `VI ...` network rows, and
requires layered Account Summary / Fee Summary / Fees detail / Service Charges detail /
Card Processing fee reconciliation before READY. `Amounts Funded` remains bank-reconciliation
evidence and is not normalized as statement payout authority. No schema/migration, dependency,
payment-provider runtime or graph-direction change is introduced.

2026-09-25 Evidence File Manager retained-display follow-up is **PR #2539 / CI #6386
GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH-DIRECTION CHANGE** on
`fix/accounting-evidence-retained-projection`. The Accounting-owned file-manager response now
preserves original upload provenance while adding operator-visible retained-binary filename/size
projection for accepted compressed images. The Web manager renders those display fields with
fallback to the original metadata. Physical binaries, `storedUrl`, content hashes, retention
state transitions, logical folder placement, Human Review, settlement and Journal authority are
unchanged.

2026-09-25 Clover replay UI-gate follow-up is **MERGED / CI GREEN via PR #2541** on
`fix/accounting-clover-replay-pending-gate-v2`. Production verification of the July v8
materialization exposed a stale Web-only invariant: the replay gate required an
`account_*_pending` line even when the authoritative Clover fee-only Journal correctly balances
to `account_clover_fee_payable`. The fix keeps provider-pending net nullable as summary data,
removes only that unconditional UI blocker, and leaves backend settlement READY/review/coverage/
plan-hash/balance/idempotency gates unchanged. No schema, parser, posting-policy or dependency
change is introduced.

2026-09-26 pre-sync Clover authority Slice A is **PRODUCTION VERIFIED / CLOSED / READ-ONLY SHADOW / NO PRISMA / NO JOURNAL MUTATION**. Slice A merged via PR #2547 / `d68cc317`; the zero-activity coverage correction merged via PR #2549 / `b7a01075`, with CI #6419 green and production running `main@b7a01075`.
Real Gmail Closeout Reports prove that pre-sync Clover tender truth cannot be anchored to
`Order.paymentMethod=CARD`: June Closeouts for 2026-05-29..2026-06-28 close exactly to the legacy
June statement Amount Submitted 336,210c with 180 sales and 9,896c Tips; July Closeouts for
2026-06-30..2026-07-30 close exactly to the modern July statement Amount Submitted 350,132c with
230 sales and 7,207c Tips. Modern July/August statements separately disclose customer surcharge
(5,551c / 6,252c), while legacy June does not. June `DISCOUNT FEES` 5,931c is merchant processing
cost and must not be treated as customer surcharge. From Accounting start 2026-06-01 until a
future durable Clover Payments cutover, Daily Closeout + Monthly Statement becomes Clover
receivable/Pending authority; Order sales/HST/discount economics remain authoritative but historical
CARD tender attribution becomes diagnostic-only. The current POS terminal rollout flag must not be
read dynamically by Accounting; a later persisted payment-fact cutover timestamp is required.
Slice A now reuses the existing Gmail Inbox path to durably materialize only the exact
`app@clover.com` + Closeout-subject contract, preserves the exact 2026-05-29..2026-05-31
provider-evidence exception around the 2026-06-01 Accounting start, requires the complete Closeout
Batch Totals control set, carries transaction counts, fails closed on Batch ID conflicts, and
exposes a read-only statement-to-observed-Closeout-sequence shadow projection bound by existing
Clover merchant identity and provider-period overlap rather than calendar-month assignment or
calendar-day continuity. Production Gmail ingestion materialized 113 unique Clover Closeouts
through 2026-09-25. June uses 27 actual provider batches spanning 2026-05-29..2026-06-28 because
2026-06-01/08/15/22 were closed zero-activity Mondays; those batches still reconcile exactly to
336,210c / 180 sales / 9,896c Tips. The follow-up keeps duplicate/ambiguous/control mismatches
fail-closed and reports incomplete provider evidence as coverage-not-found when principal closure
cannot be established.
Modern statement layout evidence now exposes transaction/refund controls plus explicit
`Surcharge Collected`; confirmed Human Review effective snapshots remain authoritative when
present; legacy June surcharge remains `UNKNOWN` and merchant `DISCOUNT FEES` is never
consulted as surcharge. Order `CARD` totals/counts are surfaced only as
`NON_AUTHORITATIVE` diagnostics through the existing Orders financial-facts port. June/July
characterization source pins the confirmed 336,210c / 180 / 9,896c and
350,132c / 230 / 7,207c / 5,551c structures. Production verification found exactly one closing
sequence for each June and July statement, the authenticated shadow endpoint returned HTTP 200,
and no Journal entry was created by deployment or the verification request. Detailed contract:
`docs/architecture/accounting-clover-pre-sync-authority-plan.md`. No historical Journal mutation,
authority replacement, cutover timestamp or Prisma migration is part of Slice A. Slice B source and
its user-generated additive migration
`20260926064114_accounting_clover_payment_fact_cutover_contract` are now merged to `dev`; review
confirmed one nullable `TIMESTAMP(3)` column only, with no default/backfill/drop/data rewrite, and
CI #6431/#6432 are green. The durable cutover timestamp remains unset and Slice E provider-proven
tip authority is still a hard production-cutover gate.

Slice C is now **LOCAL READ-ONLY PREVIEW READY FOR REVIEW**. It anchors actual historical
Order-derived Clover Pending Journal movements to the closed Slice A provider-batch authority,
truncates provider evidence at the 2026-06-01 Accounting boundary, and emits deterministic
human-review plans without posting. Production read-only evidence confirms the excluded 2026-06-01
47,922c bank deposit equals the pre-start 2026-05-29/30/31 Closeouts exactly, so neither belongs in
remediation. June in-scope Pending requires +12,863c authority replacement but remains blocked
because 4,520c cannot be separated between unknown surcharge and tender reclassification without
guessing. July is fully evidenced: +31,325c Clover Pending is balanced by 7,207c Tips, 5,551c
explicit surcharge and 18,567c Store Cash tender reclassification. The simulated Pending roll-forward
also closes against real payouts: June adjusted closing 43,459c equals the canonical 6/29 payout,
and July adjusted 7/30 closing 3,532c equals the canonical 7/31 payout. Slice D posting remains
blocked pending review and resolution of June's unknown surcharge.

The existing-materialized remediation is **MERGED / CI GREEN** through PR #2517
(`a7a872bc`) with the user-generated additive migration committed to `dev` as `5e14e8db`.
It keeps the original `AccountingProviderFinancialDocument` and machine lines immutable, reruns
the current provider parser from persisted extraction evidence into a new immutable
`AccountingParseRun`, stores the candidate full effective line set on a DRAFT Human Review
Revision, and switches settlement to that snapshot only after explicit confirmation.

2026-09-24 Clover cash-flow correction is **PRODUCTION VERIFIED** through PR #2522
(squash `9c3b1cf2`, final PR head `1866d148`, CI #6335 green). Real May/June evidence proves
Clover pays card sales gross and withdraws statement fees separately. Clover statement fee
components therefore balance to dedicated liability `account_clover_fee_payable` instead of
`account_clover_pending`. Production historical reclassification
`journal_ll3v2uxsfjefs6t6ve3bxpzb` corrected the posted June `98.39` statement without rewriting
the original Journal or duplicating expense/HST. Production June Clover sales Pending now closes at
`+48.38`, and that correction established the separate `98.39` Clover fee-payable credit before
the later bank-withdrawal clearing described below.

2026-09-25 bank-withdrawal follow-up is **PRODUCTION VERIFIED**. PR #2525 is deployed with
migration `20260925024320_accounting_provider_fee_bank_withdrawal_clearing` applied. The bank CSV
parser retains withdrawal rows while keeping payout deposits on their existing contract. A separate
Accounting-owned durable withdrawal-decision model admits only explicit Clover / First Data
withdrawal evidence from reviewed bank CSVs. Production cleared the June 33.90 + 1.85 + 3.33 bank
withdrawals and the July 2 59.31 withdrawal against the already-posted 98.39 Clover fee payable;
the canonical `account_clover_fee_payable` balance is now 0.00. Each clearing uses the
authority-bound, idempotent `Dr Clover Fee Payable / Cr selected CAD Bank` Journal in the same
Serializable transaction that marks the row `CLEARED`; no ExpenseDocument or expense Journal is
created. Unrelated First Data withdrawals remain explicitly excluded, and the post-operation API
error scan is clean.

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

**Deferred B4 polish tail:** selecting `2026-06-01..2026-06-30` correctly returns 200 for the current-period Sales query. The former UI then computed the equal-length prior period `2026-05-02..2026-05-31`, which is before `accountingStartDate=2026-06-01`; the API correctly rejected that comparison with 400. **B4-D2 is now merged through PR #2506 / squash `a72dd12b` and suppresses known-out-of-coverage comparison requests before they reach the API.** This was presentation/control-flow polish and does not reopen B2.

Accounting Journal/canonical financial facts continue to own every Accounting sales amount. **B2 is PRODUCTION VERIFIED / CLOSED.**

### Provider Financial Coverage Advancement — post-B2 correctness tail

**2026-09-23 delivery:** **PR #2501 / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** on `accounting/provider-financial-coverage-advancement` from `origin/dev@d0c10099`. This is a post-modularization Accounting evidence-completeness correction and does **not** reopen Phase 9 or B2.

Readiness audit confirmed that `AccountingProviderFinancialCoverage.financialCompleteThrough` is already the inclusive provider-evidence frontier consumed by canonical Sales Analytics, but no normal business writer advances it. Production read-only evidence currently has Uber Eats and Fantuan coverage starting `2026-06-01` with `financialCompleteThrough = null`, while both providers already have canonical posted `STATEMENT` documents continuously covering June, July and August 2026. Uber July is additionally bound to an exact confirmed Human Review Revision; Fantuan `OTHER` adjustment-detail evidence remains supplementary/NOOP and has no independent settlement Journal.

The implemented rule is conservative and monotonic: only the latest revision of each confirmed `STATEMENT` business identity, with an exact Inbox materialization link and exactly one active canonical `accounting.provider_financial_document.v1` / `PLATFORM_STATEMENT` Journal anchor for the same revision/store, can form coverage intervals. Historical machine-confirmed statements remain eligible when no Human Review exists; once Human Review exists, the latest review revision must be `CONFIRMED` with operator/timestamp authority. `financialCompleteThrough` advances only across continuously adjacent/overlapping eligible intervals from the already-proven frontier and never jumps a gap or moves backward.

Coverage mutation is deliberately **not** part of each provider replacement-group Journal transaction. `AccountingProviderSettlementExecutionService` first completes all READY Journal groups under the existing frozen coverage authority, then invokes one Accounting-owned Serializable coverage reconciliation per affected provider. The reconciliation service computes eligibility/frontier, while the existing Unified Inbox Core writer remains the designated Prisma mutation owner for `AccountingProviderFinancialCoverage`. This avoids both an architecture-boundary bypass and invalidating the same Preview's later document authorities through an early `coverage.updatedAt` change. A failed coverage reconciliation therefore leaves metadata conservatively behind already-posted Journals rather than allowing metadata to get ahead of ledger authority. ALREADY_POSTED statements also trigger the same idempotent reconciliation without rewriting Journals, which provides the controlled production backfill path after deployment.

Current production data would derive an inclusive frontier of **2026-08-31** for both Uber Eats and Fantuan under this policy, but the readiness audit and this local source batch perform no production write. Production advancement remains a later deploy/verification action using the existing expected-plan-hash settlement replay boundary.

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

**2026-09-22 state:** **EFA PRODUCTION VERIFIED / CLOSED**. EFA-D merged through PR #2471 / final head `ddb01f74` / squash `2d3abc0e` after CI #6158 passed, production is deployed at `main@2d3abc0e`, and the B1 migration is applied. Production verification now covers included-account, excluded-account and mixed-account Expense v2 paths, exact 1..N balanced Journal grouping, zero legacy payment-allocation rows on new v2 records, preservation of historical v1 authority, and Management-vs-canonical arithmetic. B2-E remains production-verified/closed. EFA's pre-B3 gate is therefore satisfied and B3 may begin readiness audit.

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

EFA-B1 is additive only: it introduces `fundingAttributionVersion`, nullable split-level funding relation and the account management-policy flag. Source merged through PR #2468 / `2250b22d`; PR CI #6145 passed. User-generated migration `20260922183548_accounting_efa_b1_funding_attribution_foundation` was reviewed as additive-only, committed to `dev` as `3e445345`, and applied successfully in production at `2026-09-22 22:51:15Z`.

EFA-B2 merged through PR #2469 / `6674ab1cdd6bcba78998698cde69469c40b0b03d` with CI #6150 green. It provides `CanonicalExpenseFactV2`, persisted split-funding authority, per-funding-account balanced Journal grouping, deterministic account-scoped v2 idempotency, v1/v2 authority revalidation, operational funding-account validation, and focused retry/period-lock/grouping/drift regressions.

EFA-C merged through PR #2470 / final head `483109e6` / squash `42e25b04`; CI #6155 passed API/Web/Architecture gates. Current Expense/Inbox writes use explicit split-level funding and version 2, confirmed-but-unposted v2 completion is split-level, Expense records dual-read v1/v2 funding, and Accounting Settings can create/view/update the account Management-expense policy. The standalone v2 payment-allocation card is removed; new category rows and Inbox Quick Classify rows inherit payment account, and Quick Classify aggregates by category + payment account. Historical v1 allocation completion remains supported.

EFA-D is merged and deployed through PR #2471 / squash `2d3abc0e`, with CI #6158 green. Reporting projection scope is explicit: Dashboard/P&L/category/trend plus Management/Boss exports use `MANAGEMENT`; raw transaction CSV remains `CANONICAL`. Only Expense v2 Journal groups consult their single operational funding account's `includeFundedExpensesInManagementReports`; excluded groups disappear from management Expense/P&L facts while historical v1 and canonical exports remain intact. Recoverable GST/HST is still accumulated from canonical Journal before the management filter, and account movement / actual cash flow remain on their independent canonical query paths. No new schema/migration or graph edge is introduced.

Production deployment, the B1 migration gate and the full EFA verification matrix are complete. Included `expense_nha2w24tprp8s74921k3ge9p` posts one balanced `3212c` Primary Bank v2 Journal. Excluded `expense_o5uf67it43suw1c4sk06jz3e` posts one balanced `9039c` CIBC v2 Journal while contributing `0c` Expense to Management reporting. Mixed `expense_ramw3wdzp4r0wkxndshpnyz2` posts two balanced account-scoped v2 Journals (`1174c` CIBC + `4102c` Primary Bank = `5276c`). For the excluded + mixed verification population, canonical Expense=`13214c`, HST=`1101c`, cash/account movement=`14315c`, Management Expense=`4097c`, and the excluded CIBC-funded Expense is exactly `9117c`. EFA is closed; B3 is ready for readiness audit.

## 8. Slice C — Trial Balance and Balance Movement

**2026-09-22 B3 readiness:** **COMPLETE** at `origin/dev@1182a46e`; exact-head CI #6168 is green. Read-only production inspection found 1,501 canonical Journal entries / 4,897 lines, debit=credit=`7,798,968c`, zero unbalanced entries, zero `OPENING_BALANCE` Journals, 29 CAD accounts, zero non-CAD Journals/accounts and zero period-close rows. Account-class reconstruction produced Assets=`2,104,938c`, Liabilities=`816,109c`, Direct Equity=`0c`, Revenue=`3,687,507c`, Expense=`2,398,678c`, therefore cumulative recorded earnings=`1,288,829c` and `Assets - Liabilities - Earnings = 0`. Seven current Journals have null `storeStableId`, all Expense-document Journals, so B3 v1 is explicitly whole-ledger/per-currency and does not offer a store filter. Detailed evidence and design are in `docs/architecture/accounting-b3-trial-balance-readiness.md`.

**B3-A state:** **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2475 / PR head `8a9280a5` / squash `9c92eeda`; PR CI #6171 and merged-head CI #6172 both passed. The implementation introduces an Accounting-owned versioned Trial Balance contract, pure projection policy and Journal-line query service with business-timezone range/clamp behavior, explicit `OPENING_BALANCE` treatment, debit/credit normal-side semantics, inactive historical-account retention, per-currency scope, month/year close metadata and fail-closed Journal/opening/period/closing balance invariants. It is registered as the canonical Accounting projection authority and intentionally bypasses P&L Management filtering, so EFA-excluded Expense v2 Journals remain canonical Trial Balance facts.

**B3-B state:** **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2476 / final head `7b859b69` / squash `ec2cff0f`; PR CI #6175 and merged-head CI #6176 both passed. It exposes authenticated `GET /accounting/report/trial-balance` and delegates unchanged `from?`, `to?`, `currency?` values to `AccountingTrialBalanceService`; CAD defaulting, range/clamp semantics and all monetary projection remain exclusively in B3-A.

**B3-C state:** **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2478 / final head `12597b96` / squash `dcf12666`; final PR CI #6180 passed Architecture, API/Web lint/build/strict/test gates after the initial #6179 API-lint-only retry. It derives a versioned `AccountingBalanceMovementReportV1` only from the existing B3-A Trial Balance report: ASSET / LIABILITY / direct EQUITY rows remain account-level movement sections, while REVENUE minus EXPENSE bridges into recorded earnings. Opening, period and closing equations must each reconcile `Assets - Liabilities - Direct Equity - Recorded Earnings = 0` or fail closed. The contract carries zero-management-opening versus explicit-opening-Journal basis metadata and always keeps `absoluteBalanceClaim=false`. Authenticated `GET /accounting/report/balance-movement` is transport-only and reuses B3-A date/currency/close-state authority. No Web/PWA UI, CSV/PDF, old account-balance contraction, store filter, FX conversion, Prisma/schema/migration, posting change or Management projection is included.

**B3-D state:** **PRODUCTION VERIFIED / B3 CLOSED** on 2026-09-23. Live authenticated Trial Balance and Balance Movement responses were reconciled against read-only canonical Journal/CoA data. The current snapshot contains 1,505 CAD Journal entries / 4,906 lines, debit=credit=`7,869,502c`, zero unbalanced entries, zero non-CAD entries, zero `OPENING_BALANCE` entries and 29 CAD accounts. The July fixed window reconciled Trial Balance opening=`1,431,643c`, period=`2,510,683c`, closing=`3,562,773c` on both sides; Balance Movement opening/period/closing bridge reconciliation is `0c` in all three buckets. Accounting-start clamp, Toronto timezone, zero-opening disclaimer, period-close visibility and EFA Management-filter isolation also passed. Ten current Journals still have null `storeStableId`, including seven Expense v2 Journals, so the statement remains correctly `WHOLE_LEDGER` with no store filter.

Implementation sequence `B3-A -> B3-B -> B3-C -> B3-D` is complete. **B3 is PRODUCTION VERIFIED / CLOSED.** B4 now owns Accounting reporting UI/export/drill-through polish and should be executed as a separate follow-on work package.

Start only after Expense -> Journal cutover removes parallel Expense arithmetic from authoritative financial reporting. This gate is satisfied by B1 + EFA closeout.

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
- keep Cash Flow Journal-only (current implementation already satisfies this; no rebuild required);
- add Trial Balance / Balance Movement exports;
- keep date presets business-timezone-safe;
- add close/coverage indicators;
- add drill-through from totals to Journal/source facts;
- visually distinguish management metrics from accounting statement values.

**B4-A state (2026-09-23):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2482 / head `8cb87700` / squash `58aa54c0`; CI #6190 passed Architecture, API/Web lint/build/strict/test. The Accounting Reports Web surface now consumes the existing B3 `/report/trial-balance` and `/report/balance-movement` contracts through first-class Web DTOs, separates Management P&L from canonical statements, removes the old `/report/account-balance` browser consumer, exposes requested/effective range, WHOLE_LEDGER/currency/timezone/period-close metadata, preserves inactive historical accounts, and renders the required zero-opening / non-formal-Balance-Sheet disclosure. Report date presets now derive today's date in `America/Toronto` and use date-only arithmetic instead of browser-local Date -> UTC serialization. The legacy account-balance HTTP route remains registered for a later explicit contraction; statement exports are delivered by B4-B, while Journal/source drill-through, P&L adjustment decomposition and Sales comparison-noise cleanup remain later B4 slices. Per repository workflow no local lint/build/test command was run before user review.

**B4-B state (2026-09-23):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2483 / head `c42ea444` / squash `cbd8bb1d`; PR CI #6195 passed Architecture and all API/Web lint/build/strict/test gates. Four authenticated Accounting-owned export routes provide Trial Balance and Balance Movement CSV/PDF. `AccountingStatementExportService` calls the existing B3 projection exactly once per export, passes that versioned report unchanged into pure renderers, and records an Accounting audit row; it does not query Journal/Prisma for statement money or use Management reporting arithmetic. CSV includes statement metadata, effective range, close state, account rows/totals and reconciliation/opening-basis fields. PDF reuses the existing Accounting PDFKit/Noto CJK infrastructure and carries the Balance Movement zero-opening/non-formal-Balance-Sheet disclaimer. The Reports UI exposes PDF/CSV links using the same selected date range. No package, schema/migration, posting, provider, store-filter or cross-context edge is added.

**B4-C1 state (2026-09-24):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2503 / final head `fd27149e` / squash `43b05537`; CI #6268 passed. Trial Balance and Balance Movement account rows drill through by `OPENING | PERIOD | CLOSING` into an authenticated Accounting-owned Journal read model. The read model reuses `AccountingTrialBalanceService.resolveStatementScope()`, so accounting-start clamping, CAD normalization and America/Toronto date semantics stay aligned with B3; it reads only Accounting Journal/account/category persistence, returns the complete balanced Journal plus the selected-account line contribution, and exposes `sourceFactType/sourceFactStableId/sourceFactVersion` without querying Orders, Payroll, Expense or provider owners. PAYOUT is naturally covered as ordinary canonical lineage such as `accounting.provider_payout.v1` / `TRANSFER` / `PAYMENT`, not through a provider-specific reporting path. The Web drawer paginates Journals, highlights selected-account lines, renders occurrence timestamps in the statement business timezone and labels page-only monetary totals as page summaries.

**B4-C2 state (2026-09-24):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO JOURNAL CHANGE / NO GRAPH CHANGE** through PR #2504 / final head `358ef7cf` / squash `151cf0f0`; CI #6271 passed Architecture and all API/Web lint/build/strict/test gates after #6270 exposed only a Prettier-only API lint finding. C2 is a pure Web source-navigation adapter over C1 identity. Stable destinations are mapped for Order SALE, Expense v1/v2, Provider Statement, Provider Payout and Payroll run accrual/reversal; same-owner exact stable-ID filters keep bounded Accounting lists navigable without foreign-owner enrichment, while unreliable/unknown source identities remain identity-only.

**B4-D1 state (2026-09-24):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO JOURNAL OR P&L ARITHMETIC CHANGE / NO GRAPH CHANGE** through PR #2505 / final head `336a541b` / squash `8928580f`; CI #6274 passed Architecture and all API/Web lint/build/strict/test gates after #6273 exposed only Prettier formatting in one new policy spec. Cash Movement remains unchanged because readiness confirmed it was already Journal-only. Management P&L keeps the existing adjustment fact, period totals, trends and net-profit arithmetic while exposing a reconciled `adjustmentBreakdown` grouped by source/sourceFactType in Web and Management CSV/PDF.

**B4-D2 state (2026-09-24):** **MERGED / CI GREEN / ADDITIVE SALES V1 METADATA / NO MIGRATION / NO DEPENDENCY / NO JOURNAL OR SALES MONEY CHANGE / NO GRAPH CHANGE** through PR #2506 / final head `4c9c5f63` / squash `a72dd12b`; CI #6276 passed Architecture and all API/Web lint/build/strict/test gates. The canonical Sales report exposes its already-resolved `accountingStartDate`, and the Web requires the full equal-length prior range to lie inside Accounting coverage before issuing the second canonical Sales request. Known-out-of-coverage comparisons no longer generate expected 400/API log noise, and no clamped unequal-period comparison is accepted. No P&L/legacy slice fallback or extra owner query was introduced.

**B4-D3 state (2026-09-24):** **PRODUCTION VERIFIED / MERGED / CI GREEN / HTTP CONTRACT CONTRACTION / NO MIGRATION / NO DEPENDENCY / NO JOURNAL OR REPORT ARITHMETIC CHANGE / NO GRAPH CHANGE** through PR #2507 / final head `82b43a52` / squash `286888cf`; CI #6278 passed Architecture and all API/Web lint/build/strict/test gates. The deployed production checkout is `main@286888cf`. B4-A had already removed the only Web consumer, repo-wide runtime search found no other caller, and the retired `accountBalanceReport()` implementation was not reused by any surviving report. Post-deploy API startup mapping no longer contains `/accounting/report/account-balance`; a fresh runtime scan found zero Accounting 400/401/403/404/409/422/5xx responses and zero API/Web ERROR lines. Trial Balance, Balance Movement, P&L, Cash Movement and canonical Sales all returned live 200 responses after deployment.

**B4 closeout (2026-09-24): PRODUCTION VERIFIED / CLOSED.** B4-A/B/C1/C2/D1/D2/D3 are complete. Production is running the final B4 head `286888cf`; the operator completed a UI spot-check with no visible anomaly, backend containers are healthy, current canonical reporting endpoints are serving 200 responses, and the retired account-balance route is absent. D2's specific June-start suppression case was not re-issued during this backend log audit, but the deployed build includes the CI-green D2 code (`a72dd12b`) and no post-deploy Accounting 400 responses were observed. No B4-D4 or further B4 implementation slice is planned.

**PAYOUT-A state (2026-09-23):** **MERGED / CI GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2484 / final head `7e094c8b` / squash `b919990f`; CI #6198 passed Architecture and all API/Web lint/build/strict/test gates after the initial CI #6197 exposed only three Prettier findings. The Accounting-owned `accounting.provider_payout.v1` contract is frozen independently from monthly provider statements: provider/store/business-date/destination BANK/amount/CAD/reference only, with no statement ID or statement-period binding. Its deterministic Journal draft is `TRANSFER`, `PAYMENT`, `Dr BANK / Cr provider PLATFORM_WALLET`, protected by account prerequisites plus a frozen authority hash. Provider pending account IDs are shared by settlement and payout policies so Clover/Uber/Fantuan cannot drift to different assets. Cash Movement admits TRANSFER Journals and derives movement only from CASH/BANK lines: CASH↔BANK transfers net to zero, while PLATFORM_WALLET→BANK receipts become visible. Production read-only evidence before the change found zero active TRANSFER Journals, so this query correction does not alter existing production report numbers.

**PAYOUT-B state (2026-09-23):** **MERGED / CI GREEN / MIGRATION MERGED + REVIEWED / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2485 / final head `5b37e650` / squash `662aceb4`; CI #6201 passed Architecture, Prisma generate and all API/Web lint/build/strict/test gates. User-generated migration `20260923153202_accounting_provider_payout_persistence` then entered `dev` at `da7edc2b`. SQL review confirms additive-only `AccountingProviderPayout` creation plus the expected unique/index set, with no DROP, rename, backfill, enum mutation or data contraction. The Accounting-owned persisted fact stores the frozen v1 payout plus its canonical Journal anchor; exact-fact retries are idempotent, conflicting stable-ID reuse fails closed, and payout-specific Journal posting plus anchor update is atomic. No monthly-statement relation or current-pending-balance gate exists.

**PAYOUT-C state (2026-09-23):** **PRODUCTION VERIFIED / NO MIGRATION IN C / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2486 / final head `cb298a3b` / squash `488f9024`; CI #6205 passed Architecture, Prisma generate and all API/Web lint/build/strict/test gates. Production is running `488f9024`, and migration `20260923153202_accounting_provider_payout_persistence` is applied (`finished_at=2026-09-23T16:25:54.720044Z`). Live verification recorded two real bank receipts: Uber Eats `payout_19505915-fb5e-450a-b8e2-93970d121794`, 2026-06-09, 28,448c, Journal `journal_xaty4dfjj2g4jyk7weie53uj`; Fantuan `payout_6c1afb5e-3246-4dbc-898e-2cf9ee36fc53`, 2026-06-10, 86,057c, Journal `journal_j13nrcsg1uifz6xl5f8hkyds`. Both are exactly one payout row to one active balanced Journal, `Dr CIBC / Cr provider Pending`, with one `PROVIDER_PAYOUT_POST` audit each. June provider statement rows retained their earlier `updatedAt`, proving payout writes do not mutate statement facts.

**PAYOUT-D state (2026-09-23):** **DEPLOYED / BACKEND DATA-PATH VERIFIED / UI OPERATOR SPOT-CHECK PENDING / READ-ONLY / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2488 / final head `6a3dc03f` / squash `1666b3ed`; CI #6214 passed Architecture and all API/Web lint/build/strict/test gates. Production `main@1666b3ed` is running fresh API/Web/worker containers and maps `GET /api/v1/accounting/provider-pending-reconciliation`; post-deploy API/Web error-log scans were empty. Independent read-only reconstruction for 2026-06-01..2026-09-23 produced arithmetic delta 0 for all providers: Clover Closing Pending 1,229,110c; Uber 439,214c from Order +326,092 / authority -326,092 / Statement +467,662 / payout -28,448; Fantuan 940,676c from Statement +1,026,733 / payout -86,057. Aggregate Closing Pending is 2,609,000c, Other movement is 0, and active unscoped provider-Pending Journal lines remain 0. The only remaining D check is a human visual spot-check of the deployed panel/API rendering; no accounting-data blocker remains.

**PAYOUT-E-A state (2026-09-23):** **MERGED / CI GREEN / PREVIEW-ONLY / NO MIGRATION / NO NEW WRITER / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2490 / squash `1d90e6fd`, CI #6223 green. Inbox-only acquisition/review ownership merged through PR #2492 / squash `c4324edd`, CI #6229 green; settlement row-decision ownership merged through PR #2493 / squash `3d20fd4f`, CI #6232 green and is production deployed. Inbox remains the only Accounting file-upload surface and bank-evidence preview owner; Settlements consumes only reviewed `CONFIRMED + OTHER_DOCUMENT + CSV` evidence.

**PAYOUT-E-B1 state (2026-09-23):** **PRODUCTION VERIFIED / MIGRATION APPLIED / NO PAYOUT OR JOURNAL WRITER CHANGE / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2495 / squash `8b0c906b` plus migration commit `56d58ccd`. Migration `20260923230651_accounting_provider_payout_bank_row_decisions` is applied in production; durable decision restore/confirmation was verified with 27 persisted rows before E-B2 posting.

**PAYOUT-E-B2 state (2026-09-23):** **PRODUCTION VERIFIED / NO MIGRATION / NO DEPENDENCY / NO GRAPH CHANGE** through PR #2498 / squash `11c80d66`, merged-head CI #6252 green and production `main@11c80d66`. A reviewed June bank CSV produced five real READY decisions and all five were posted through the decision-owned endpoint: Uber 44,190c (06-16), Fantuan 45,536c (06-17), Uber 29,828c (06-23), Fantuan 77,093c (06-24), Uber 16,551c (06-30). Each has exactly one deterministic payout, one balanced `TRANSFER / PAYMENT / accounting.provider_payout.v1` Journal (`Dr CIBC / Cr provider Pending`), one POST audit and one decision-bind audit, and every row transitioned to `MATCH_EXISTING_PAYOUT`. June reconciliation remains coherent from the 2026-06-01 accounting start: Uber closing Pending 3,268c after 119,017c total payout reduction; Fantuan closing Pending 83,853c after 208,686c total payout reduction; no unexplained Other movement was found in the audited buckets. Detailed readiness/production evidence: `docs/architecture/accounting-provider-payout-readiness.md`.

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
