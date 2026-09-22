# Accounting Expense Funding Attribution (EFA)

Status: **EFA-B1 MERGED / CI GREEN / MIGRATION REVIEWED + COMMITTED TO DEV / PRODUCTION APPLICATION PENDING — EFA-B2 MERGED / CI GREEN — EFA-C LOCAL SOURCE IMPLEMENTED / REVIEW PENDING / NO NEW MIGRATION / NO GRAPH CHANGE — SALES B2 PRODUCTION VERIFIED / CLOSED — PHASE 9 REMAINS CLOSED**  
Planning/audit date: 2026-09-22  
Audit baseline: `origin/dev@6674ab1c`  
Owner: **Accounting / Reporting / Analytics**

## 1. Purpose

EFA closes a modeling gap between Expense category facts and the account that actually funded each expense amount.

The target business behavior is:

- a receipt/invoice remains one `AccountingExpenseDocument`;
- each category/tax row remains one `AccountingExpenseSplit`;
- each split can identify the reviewed funding account;
- a document can therefore contain splits funded by different accounts;
- canonical Expense posting groups splits by funding account and may produce more than one balanced Journal entry for one ExpenseDocument;
- Management P&L/expense analytics may exclude Expense groups funded by an account configured outside management reporting;
- canonical ledger, account movement, real cash flow, audit, evidence and future GST/HST reporting retain the facts.

This is a post-modularization Accounting product project. It does **not** reopen Phase 9 and does not redesign the generic Journal.

## 2. Insertion point

B2 Canonical Sales Analytics is production verified and closed, including B2-E Legacy Sales slice cleanup and Accounting PWA verification.

EFA is intentionally inserted **after B2 and before B3 Trial Balance / Balance Movement**.

Reason:

1. Expense canonical authority is already Journal-only after B1.
2. B3 is meant to read Journal lines directly.
3. It is safer to settle the final Expense funding/posting cardinality before Trial Balance characterization is built around it.

Approved sequence:

```text
B2 CLOSED
  ↓
EFA
  ↓
B3 Trial Balance / Balance Movement
```

## 3. PWA compatibility decision

Accounting PWA currently has one operator. The operator explicitly accepts deleting/recreating the installed PWA during cutover.

Therefore EFA does **not** need a long-lived old-client write-compatibility layer.

This does not mean historical Expense v1 records are rewritten. It means:

- historical v1 source facts and Journals remain valid and readable;
- the currently deployed v1 write path remains active until the v2 runtime cutover;
- after the v2 Web/API cutover, the old PWA can be removed and recreated;
- the server does not need to accept the old Expense write payload indefinitely.

## 4. Production data preflight

Read-only production audit on 2026-09-22 found:

```text
Confirmed AccountingExpenseDocument     3
AccountingExpenseSplit                  3
AccountingExpensePaymentAllocation      3
Canonical Expense v1 Journal            3

Documents with >1 split                 0
Documents with >1 payment allocation    0
Documents with missing payment          0
Documents with >1 Expense Journal       0
AccountingPeriodClose rows              0
```

All three current Expenses have the same simple shape:

```text
1 ExpenseDocument
  → 1 ExpenseSplit
  → 1 account_primary_bank PaymentAllocation
  → 1 accounting.expense_document.v1 Journal
```

No production record currently contains ambiguous historical split-to-account attribution.

EFA deliberately does **not** infer or rewrite that history. Historical v1 payment ownership remains represented by `AccountingExpensePaymentAllocation`.

## 5. Current v1 authority

The current canonical Expense fact is:

```text
accounting.expense_document.v1

CanonicalExpenseFactV1
├─ splits[]
└─ paymentAllocations[]
```

The posting policy creates exactly one Journal draft with:

```text
canonical-expense:{documentStableId}:v1
```

and the Expense-specific Journal write authority re-reads the persisted ExpenseDocument, splits and payment allocations inside the transaction before accepting the write.

That v1 meaning is frozen as historical behavior. EFA must not silently reinterpret it.

## 6. Target v2 ownership model

The target owner model is:

```text
AccountingExpenseDocument
├─ fundingAttributionVersion
└─ AccountingExpenseSplit[]
      ├─ category
      ├─ amountCents
      ├─ taxCents
      └─ paidFromAccount
```

The dimensions remain separate:

- **category** = what the money was spent on;
- **amount/tax** = how much was spent and recognized as input tax;
- **paidFromAccount** = where the funds came from;
- **account management policy** = whether Expense groups funded by that account participate in management expense/P&L reporting.

Do not encode a funding account into the expense category name.

## 7. Why one Expense may create multiple Journals

A single Journal containing both multiple expense debits and multiple bank credits does not preserve which debit group belongs to which funding account.

Example:

```text
Dr Meat expense       100
Dr Kitchen supplies    50
Dr HST                 19.50
Cr CIBC                113
Cr Primary Bank         56.50
```

The Journal is balanced but cannot independently prove whether Meat was funded by CIBC or Primary Bank.

EFA therefore groups Expense v2 splits by `paidFromAccount`.

Example source:

```text
Meat              100 + 13.00 HST → CIBC
Kitchen supplies   50 +  6.50 HST → Primary Bank
```

Canonical output:

```text
Journal A
Dr Operating Expense / Meat       100.00
Dr HST Recoverable                 13.00
Cr CIBC                           113.00

Journal B
Dr Operating Expense / Kitchen     50.00
Dr HST Recoverable                  6.50
Cr Primary Bank                    56.50
```

Both Journals share the same Expense source fact identity but have distinct idempotency keys.

The generic Journal schema already supports this because `sourceFactStableId` is indexed but not unique; `idempotencyKey` is the unique write key.

No `AccountingJournalLine` funding-account dimension is required.

## 8. Versioning policy

EFA uses explicit Expense funding versions.

### v1

- historical/current pre-cutover behavior;
- payment ownership represented by `AccountingExpensePaymentAllocation`;
- one ExpenseDocument -> one Expense Journal;
- source fact type `accounting.expense_document.v1`.

### v2

- split-level `paidFromAccount` is the source authority;
- one ExpenseDocument -> one or more Journals grouped by account;
- old PWA write compatibility is not retained after cutover;
- source fact type/idempotency version must be distinct from v1.

`AccountingExpenseDocument.fundingAttributionVersion` is introduced as a nullable expand-stage column with default `1`, so the additive schema can be deployed without a NOT NULL tightening. Null or `1` is treated as historical/current v1 during the transition; the v2 writer will explicitly persist version `2`.

## 9. Management reporting policy

The account-level policy is intentionally narrow:

`includeFundedExpensesInManagementReports`

Default: `true`.

The policy means only:

> Expense v2 Journal groups funded by this operational account participate in Management expense/P&L analytics.

It does **not** hide the account or its movement from canonical accounting.

For example:

```text
Primary Bank
includeFundedExpensesInManagementReports = true

CIBC
includeFundedExpensesInManagementReports = false
```

A CIBC-funded Expense remains in canonical Journal/accounting facts while being omitted from Management expense analytics.

## 10. Reporting scope matrix

| Surface | Scope | Excluded funding-account Expense |
| --- | --- | --- |
| Accounting Dashboard expense/net/category | MANAGEMENT | exclude |
| P&L page/trends/category | MANAGEMENT | exclude |
| Management/Boss P&L CSV/PDF | MANAGEMENT | exclude |
| Expense records/evidence | SOURCE FACT | retain |
| Canonical Journal/audit | CANONICAL | retain |
| Raw canonical transaction export | CANONICAL | retain |
| Account balance / account movement | CANONICAL | retain |
| Actual cash flow | CANONICAL | retain |
| B3 Trial Balance | CANONICAL | retain |
| Balance Movement | CANONICAL | retain |
| Future GST/HST return projection | STATUTORY | retain |

Actual cash flow remains canonical because money leaving CIBC is still a real cash movement even when management P&L excludes the corresponding Expense.

## 11. GST/HST boundary

Current Expense posting debits `account_hst_recoverable`, while Sales posting credits `account_hst_payable`.

EFA must not make management-report visibility control tax recognition.

A CIBC-funded Expense therefore still posts its HST/GST recoverable amount to canonical Journal.

A dedicated CRA GST/HST return projection does not currently exist in this roadmap. That is a separate future statutory-reporting project and is not implemented by EFA.

## 12. Expense records / filtering

Current Expense records filter payment account/state through `AccountingExpensePaymentAllocation`.

During v1/v2 coexistence, read behavior must distinguish:

- v1 records: payment account from `AccountingExpensePaymentAllocation`;
- v2 records: funding account from `AccountingExpenseSplit.paidFromAccount`.

The historical v1 allocation table is not deleted in the initial EFA project.

Any later contraction requires a separate reviewed decision and must not destroy historical v1 authority merely to remove a table.

## 13. Funding account validity

The current v1 payment resolver validates existence, active state and CAD currency, while the normal account picker only returns active operational ASSET accounts with non-null type.

The v2 funding writer must enforce the operational-account invariant server-side:

- active;
- CAD functional currency;
- `accountClass = ASSET`;
- operational type is one of `CASH / BANK / PLATFORM_WALLET`.

A system HST/revenue/expense account must never be accepted merely because its stable ID exists.

## 14. Approved implementation slices

### EFA-A — readiness / contract freeze

State: **COMPLETE**.

This document records the read-only audit, production preflight, v1/v2 boundary, reporting-scope policy, PWA decision and B3 insertion point.

### EFA-B1 — additive persistence foundation

State: **MERGED / CI GREEN / MIGRATION REVIEWED + COMMITTED TO DEV / PRODUCTION APPLICATION PENDING** through PR #2468 / `2250b22d`; migration committed to `dev` as `3e445345`.

Additive source changes:

- nullable `AccountingExpenseDocument.fundingAttributionVersion Int? @default(1)`;
- nullable `AccountingExpenseSplit.paidFromAccountId` / `paidFromAccount`;
- inverse `AccountingAccount.fundedExpenseSplits`;
- index on `paidFromAccountId`;
- nullable `AccountingAccount.includeFundedExpensesInManagementReports Boolean? @default(true)`; the public account contract normalizes null to the semantic default `true`;
- account create/list contract exposes the management policy;
- Web account contract mirrors the field;
- architecture regression pins the new seam and explicitly keeps v1 posting/input unchanged.

B1 deliberately does **not**:

- create Expense v2 Journals;
- change `CanonicalExpenseFactV1`;
- write `paidFromAccountId` from the current Expense flow;
- change Dashboard/P&L/cashflow/account-balance arithmetic;
- remove `AccountingExpensePaymentAllocation`;
- add a migration file through MCP;
- add a package/dependency;
- add a context edge or scanner allowance.

### EFA-B2 — canonical Expense v2 posting

State: **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2469 / `6674ab1cdd6bcba78998698cde69469c40b0b03d`; CI #6150 passed.

Implemented locally:

- defines `CanonicalExpenseFactV2` while preserving `CanonicalExpenseFactV1` and its v1 idempotency/source-fact contract;
- derives v2 write authority from persisted Expense v2 splits plus the persisted funding-account facts required to enforce the operational-account invariant;
- groups splits by `paidFromAccountStableId` and creates one balanced Journal per funding account;
- reuses the caller's existing Serializable Expense transaction for the full grouped write set;
- uses deterministic account-scoped v2 idempotency keys `canonical-expense:<documentStableId>:funding:<accountStableId>:v2`;
- rejects v2 documents that retain legacy document-level payment allocations and leaves incomplete split funding unposted;
- enforces active CAD `ASSET` funding accounts with operational type `CASH / BANK / PLATFORM_WALLET`;
- revalidates persisted v2 source authority immediately before each Journal write, rejects any v1/v2 source-fact-version crossover or stale funding-group anchor once a canonical Expense anchor exists, and retains the existing period-lock/idempotent replay path;
- focused regressions cover duplicate-account grouping, missing funding, mixed-account 1:N posting, invalid funding accounts, legacy-allocation rejection, period lock, idempotent retry and source-authority drift.

After B2, the posting engine is active source code but remains dormant until EFA-C writes v2 facts. Management filtering remains intentionally deferred to EFA-D, and historical `AccountingExpensePaymentAllocation` remains the immutable/readable v1 authority.

### EFA-C — Expense write/UI cutover

State: **LOCAL SOURCE IMPLEMENTED / REVIEW PENDING / NO NEW MIGRATION / NO GRAPH CHANGE** on `accounting/efa-c-expense-write-ui-cutover` from `origin/dev@6674ab1c`.

Implemented locally:

- current manual Expense, unified Inbox Expense confirmation and pending-document confirmation write `fundingAttributionVersion = 2`;
- every current write payload explicitly carries `paidFromAccountStableId` per split; null remains a deliberate confirmed-but-unposted state, while stale document-level `accountStableId` / `paymentAllocations` write payloads fail closed;
- v2 writes never create document-level `AccountingExpensePaymentAllocation`; historical v1 allocations and the v1 completion endpoint remain readable/usable for legacy records;
- Inbox and Expenses editor place payment account directly on each category row and remove the standalone v2 allocation card; category rows expose category / pre-tax / tax mode / HST / payment account / delete, and newly added rows inherit the previous funding account. The Inbox Quick Classify Calculator also carries payment account per row, inherits it on Enter/Next item, and aggregates by category + payment account so same-category rows funded by different accounts are never collapsed together;
- repeated use of the same funding account across multiple splits is valid; Web does not group Journals and delegates all grouping to the B2 posting authority;
- confirmed-but-unposted v2 Expenses gain an audited, period-locked split-funding completion route that requires every split exactly once, permits identical replay, rejects replacement of already-assigned funding and delegates posting to B2;
- Expense records/query dual-read historical v1 allocations and v2 split funding for account filters plus `ASSIGNED / UNASSIGNED`;
- Accounting Settings exposes the existing account policy on account creation and adds a narrow update path/UI for active operational accounts; EFA-C does not consume the flag in Dashboard/P&L calculations;
- no Journal schema/policy redesign, JournalLine funding dimension, Orders/Payments/Clover/Uber change, dependency/package addition, Prisma schema change or new context edge is introduced.

Deployment gate: production still lacks the B1 columns as of the EFA-C readiness audit. Apply the already-reviewed additive migration `20260922183548_accounting_efa_b1_funding_attribution_foundation` before deploying EFA-C API/Web, then delete/reinstall the single-user Accounting PWA so no stale v1 write client remains.

### EFA-D — management reporting cutover / production verification

Planned:

- apply the account policy only to Management Expense/P&L projections;
- Dashboard, P&L, category/trend and Management/Boss exports share the same management scope;
- canonical account movement, actual cash flow, Journal/audit and HST remain unfiltered;
- verify one included account Expense, one excluded-account Expense and one mixed-account receipt;
- verify one source Expense creates the expected number of balanced v2 Journal groups;
- verify Management vs canonical arithmetic independently;
- close EFA before B3 begins.

## 15. Migration gate for EFA-B1

**MIGRATION REVIEWED + COMMITTED TO DEV / PRODUCTION APPLICATION STILL PENDING.**

The B1 schema change is additive, but persisted database columns/FK/index are required before later runtime code may depend on them in production. Source merged through PR #2468 / `2250b22d` with CI #6145 green. The user-generated migration was reviewed as additive-only and is committed to `dev` as `3e445345`:

```text
20260922183548_accounting_efa_b1_funding_attribution_foundation
```

Reviewed SQL shape:

- add nullable `AccountingExpenseDocument.fundingAttributionVersion` with default `1`;
- add nullable `AccountingExpenseSplit.paidFromAccountId`;
- add FK to `AccountingAccount(id)` with Restrict delete behavior;
- add index on `paidFromAccountId`;
- add nullable `AccountingAccount.includeFundedExpensesInManagementReports` with default `true`.

No historical backfill is required in B1. Existing v1 Expense rows keep `paidFromAccountId = NULL` and retain their existing `AccountingExpensePaymentAllocation` authority.

The migration remains additive only: no table/column drop, rename, enum contraction, NOT NULL tightening or history rewrite. Promotion to `main` / production still requires the normal reviewed deployment/migration-application gate.

## 16. Architecture effect

EFA remains inside the existing Accounting L3 owner and Accounting Web adapter.

Expected graph effect through EFA-B2:

```text
new context direction: none
new direct-import allowance: none
new public SCC: none
new runtime dependency: none
Journal schema change: none
provider wire change: none
Orders/Payments/Clover/Uber change: none
```

Phase 9 remains closed.
