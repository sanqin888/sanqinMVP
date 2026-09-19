# Post-Modularization Accounting Product Roadmap

Status: **PLANNED / START GATE NOT YET SATISFIED — DO NOT REOPEN PHASE 9**  
Planning date: 2026-09-19  
Baseline: Phase 9 **PRODUCTION VERIFIED / CLOSED** at production `main@dbea68f3`

## 1. Purpose and placement

This is the approved follow-on plan for:

1. ExpenseDocument -> canonical Journal cutover and final `AccountingTransaction` contraction;
2. canonical Accounting Sales Analytics;
3. Trial Balance;
4. an initial **资产负债变动表 / Balance Movement Statement**;
5. later promotion to a formal Balance Sheet after a real fiscal-year opening balance is entered.

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

Until this gate is satisfied, this document is planning only.

## 3. Current baseline

### Sales

The current Accounting Sales page mixes two amount authorities:

- top-line posted income: Accounting P&L/canonical financial projection;
- “按渠道 / By channel” and “按支付方式 / By payment method”: Orders-owned paid-total dimension slice based on persisted Order totals.

The latter is intentionally non-canonical for revenue and must not be relabeled as Accounting income. The current explanatory copy is also stale because canonical sale/tax/refund posting now exists.

### Expenses

Confirmed expenses currently materialize as:

```text
AccountingExpenseDocument
├─ AccountingTransaction split rows        <- expense/category facts
└─ AccountingExpensePaymentAllocation      <- payment account allocation
```

`AccountingExpenseService` remains the only permitted production mutation owner for `AccountingTransaction`. Production currently has **0 AccountingTransaction rows**, but the source writer is intentional and active; this is not unfinished Phase 9 cleanup.

Reports currently combine canonical Journal facts with confirmed Expense facts, and account-movement/cash-flow reporting also reads Expense payment allocations.

### Journal / CoA

The canonical Journal already provides balanced entries, stable source-fact identity, category dimensions, audit and period locks. The CoA has ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE classes and includes cash/bank/provider pending assets, HST accounts, Store Balance/Payroll liabilities, opening-balance equity, revenue and operating/provider/payment expense accounts.

## 4. Opening-balance policy

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

## 5. Slice A — Expense Journal Canonicalization

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

Expected end-state contraction:

- no `projectAccountingExpenseReportSplit()` in authoritative reporting;
- no parallel payment-allocation arithmetic for already-posted Expense facts;
- architecture guard requires 0 `AccountingTransaction` mutation callers;
- final model drop, if performed, follows destructive migration review rules.

## 6. Slice B — Canonical Sales Analytics

Accounting Journal/canonical financial facts own amounts. Orders may provide narrow business dimensions such as channel or canonical primary payment method, but must not become the amount authority again.

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

## 7. Slice C — Trial Balance and Balance Movement

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

## 8. Slice D — Reporting polish

After canonical foundations are stable:

- improve P&L adjustment labels/decomposition;
- make Cash Flow Journal-only;
- add Trial Balance / Balance Movement exports;
- keep date presets business-timezone-safe;
- add close/coverage indicators;
- add drill-through from totals to Journal/source facts;
- visually distinguish management metrics from accounting statement values.

## 9. Architecture rules

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

## 10. Deferred evidence and coverage

The Phase 9 deferred items remain future evidence, not reopened debt:

- 2258-cent fail-closed RETENDER exception;
- real CRA remittance;
- real Payroll reversal/correction;
- first real production period close;
- incomplete Uber provider history.

Where incomplete evidence affects a requested report, show the coverage state. For example, Uber Channel Contribution without complete commission evidence should be incomplete/unavailable, not inferred from Order totals.

## 11. Migration expectations

- Sales Analytics/report UI: normally no migration.
- Expense -> Journal cutover: may not need additive schema, but final `AccountingTransaction` model contraction is destructive and requires separate migration review/authorization.
- Accounts Payable, if chosen: separate CoA/schema/migration decision.
- Trial Balance / Balance Movement: normally no migration if Journal/CoA are sufficient.
- future real opening balance: reviewed data operation through Journal authority, not fabricated migration history.

This roadmap itself authorizes no migration.

## 12. Acceptance and handoff

Every future slice must begin with a read-only readiness audit, preserve the final modularization graph unless explicitly authorized otherwise, add financial-semantic and boundary regressions, compare fixed historical totals before cutover, and keep unavailable real/provider evidence explicitly deferred.

After repository-wide modularization closes, start with:

**Post-Modularization Accounting — Slice A: Expense Journal Canonicalization Readiness Audit**

Re-confirm:

- only Expense still writes `AccountingTransaction`;
- production Expense/Transaction row counts;
- paid vs unpaid Expense policy;
- Journal account/category/HST mapping;
- payment allocation semantics;
- period lock/idempotency/audit;
- exact migration/contraction requirements.

Implementation starts only after that audit is reviewed.
