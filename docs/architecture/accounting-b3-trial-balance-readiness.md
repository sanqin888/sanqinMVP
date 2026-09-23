# Accounting B3 Trial Balance / Balance Movement Readiness

Date: 2026-09-23  
Repository baseline: latest `origin/dev@dcf126669101ef577cdb16138c387cd07c5df30f`  
B3-A delivery: PR #2475 / squash `9c92eeda`; PR CI #6171 + merged-head CI #6172 green  
B3-B delivery: PR #2476 / final head `7b859b69` / squash `ec2cff0f`; PR CI #6175 + merged-head CI #6176 green  
B3-C delivery: PR #2478 / final head `12597b96` / squash `dcf12666`; final PR CI #6180 green after initial #6179 API-lint-only retry  
State: **B3 READINESS COMPLETE / B3-A + B3-B + B3-C MERGED + CI GREEN / NO MIGRATION / NO GRAPH CHANGE / B3-D NEXT**

## 1. Decision

B3 is ready to implement without reopening Phase 9.

The canonical Accounting Journal and Chart of Accounts already contain the monetary authority required for Trial Balance and the initial zero-opening Balance Movement Statement. B3 must therefore be a read-model/reporting project:

```text
canonical Accounting Journal
          +
Accounting Chart of Accounts
          +
accountingStartDate / business timezone
          +
period-close state
          ↓
B3-A Trial Balance core
          ↓
B3-B HTTP/public report contract
          ↓
B3-C Balance Movement Statement
          ↓
B3-D production reconciliation / closeout
```

B3 must not redesign Journal posting, Revenue Posting, Expense posting, Payroll posting or Provider Settlement.

## 2. Production readiness snapshot

Read-only production inspection during the readiness audit found:

| Check | Snapshot |
|---|---:|
| canonical Journal entries | 1,501 |
| canonical Journal lines | 4,897 |
| total debit | 7,798,968c |
| total credit | 7,798,968c |
| unbalanced Journal entries | 0 |
| explicit `OPENING_BALANCE` Journals | 0 |
| non-CAD Journals | 0 |
| Accounting accounts | 29 |
| non-CAD Accounting accounts | 0 |
| period-close rows | 0 |
| first live Journal occurrence | 2026-06-02 04:00:00Z |
| Accounting start | 2026-06-01 |
| business timezone | America/Toronto |

The same Journal population grouped by account class produced:

| Account class / bridge | Amount |
|---|---:|
| Assets movement | 2,104,938c |
| Liabilities movement | 816,109c |
| Direct Equity movement | 0c |
| Revenue normal balance | 3,687,507c |
| Expense normal balance | 2,398,678c |
| Cumulative recorded earnings | 1,288,829c |

The zero-opening movement equation therefore reconciled exactly:

```text
2,104,938 - 816,109 - 1,288,829 = 0
```

This is readiness evidence, not a frozen business total; production balances will continue to change as new canonical Journals are posted.

## 3. Why the existing account-balance widget is not Trial Balance

`AccountingFinancialReportsService.accountBalanceReport()` is a canonical Journal reader, but it is an operational account-movement widget rather than a Trial Balance.

It:

- keeps only accounts whose operational `type` is CASH / BANK / PLATFORM_WALLET;
- reports debit as `inflowCents`, credit as `outflowCents`, and `debit-credit` as movement;
- omits non-operational ASSET accounts such as recoverable HST;
- omits LIABILITY, EQUITY, REVENUE and EXPENSE accounts;
- has no opening/period/closing Trial Balance columns;
- has no normal-side semantics or explicit `OPENING_BALANCE` treatment.

B3-A must therefore use a dedicated projection rather than extend this method.

The old `GET /accounting/report/account-balance` contract remains untouched in B3-A. Its later UI naming/cutover belongs to B4.

## 4. Why P&L/Management projection is not the B3 source

`AccountingFinancialReportsService.readProjection()` exists for financial-fact/P&L presentation and now supports explicit `MANAGEMENT` and `CANONICAL` scopes.

EFA-D intentionally permits some Expense v2 Journals to disappear from Management P&L according to the funding account's `includeFundedExpensesInManagementReports` policy. That policy must never affect Trial Balance.

B3 authority is therefore:

```text
AccountingJournalEntry
  -> AccountingJournalLine
  -> AccountingAccount
```

without:

- Management scope filtering;
- ExpenseDocument arithmetic;
- legacy payment allocations;
- Orders revenue totals/dimensions;
- Sales Analytics attribution;
- Provider parser arithmetic;
- Payroll-run arithmetic.

A Journal that is excluded from Management P&L remains fully present in B3.

## 5. B3-A contract and invariants

B3-A introduces an Accounting-internal, versioned Trial Balance projection.

For every account touched by the canonical ledger it exposes:

```text
accountStableId
accountName
accountClass
accountType
currency
isActive
normalSide

openingDebitBalanceCents
openingCreditBalanceCents
openingNormalBalanceCents

periodDebitCents
periodCreditCents
periodNormalMovementCents

closingDebitBalanceCents
closingCreditBalanceCents
closingNormalBalanceCents
```

Normal sides are fixed by account class:

```text
ASSET      -> DEBIT
EXPENSE    -> DEBIT
LIABILITY  -> CREDIT
EQUITY     -> CREDIT
REVENUE    -> CREDIT
```

Contra accounts are not special-cased. For example, a debit balance in the REVENUE-class `account_sales_discounts` naturally yields a negative normal balance.

Required fail-closed invariants:

1. every projected Journal entry remains debit = credit;
2. opening debit balances = opening credit balances;
3. period debit activity = period credit activity;
4. closing debit balances = closing credit balances;
5. each line is one-sided and uses the requested currency;
6. no Management-report filter is consulted.

Inactive historical accounts with Journal lines remain visible.

## 6. Range and opening semantics

B3 uses Store business-timezone date-only boundaries.

Current policy:

```text
accountingStartDate = 2026-06-01
management opening = $0
timezone = America/Toronto
```

Requested `from` earlier than Accounting start is clamped to the configured Accounting start. A request whose `to` is before Accounting start fails instead of returning an apparently valid empty statement.

The B3-A read window starts at `accountingStartDate`, not at the requested report start, so earlier canonical lines can form the opening balance for a later-period Trial Balance.

`OPENING_BALANCE` Journal entries receive explicit treatment: if one exists, its lines are classified into opening balance even when its occurrence date equals the report's `from` boundary. Current production has zero such Journals and B3 must not invent one.

The future formal Balance Sheet promotion remains separate: only after reviewed real opening balances are posted as an explicit balanced `OPENING_BALANCE` Journal may the product claim real absolute balances.

## 7. Currency and store scope

B3-A is **per-currency**. It defaults to CAD and performs no FX conversion or cross-currency addition.

B3-A is also deliberately **WHOLE_LEDGER**. It has no `storeStableId` filter.

Readiness inspection found seven current Journals with null `storeStableId`; all seven are Expense-document Journals. A store-filtered Trial Balance would therefore silently omit valid Expense/HST/funding facts and could look precise while being financially incomplete.

Any future multi-store balance statement requires a separate complete store-attribution policy for Expense, Payroll, Provider and other Accounting facts before a store filter can be introduced.

## 8. Period-close visibility

B3-A reads existing Accounting period-close state and attaches month/year close metadata to the projection.

No period-close rows existed in the production readiness snapshot. The projection does not infer closure from dates and does not mutate period state.

## 9. Implementation slices

### B3-A — Canonical Trial Balance Core

Scope:

- Accounting-owned Trial Balance contract;
- pure projection policy;
- Accounting Journal-line query service;
- business-timezone range/clamp semantics;
- explicit opening-Journal metadata;
- normal-side/account-class handling;
- month/year close metadata;
- characterization and architecture regressions;
- AccountingModule provider registration.

Explicitly excluded:

- HTTP route;
- Web/PWA UI;
- CSV/PDF export;
- Balance Movement presentation;
- schema/migration;
- store filtering;
- FX conversion;
- old account-balance contraction.

### B3-B — Trial Balance HTTP/public contract

State: **MERGED / CI GREEN** through PR #2476 / final head `7b859b69` / squash `ec2cff0f`; PR CI #6175 and merged-head CI #6176 passed.

The existing `AccountingReportsController` exposes authenticated `GET /accounting/report/trial-balance` under the same `SessionAuthGuard` + `RolesGuard` and `ADMIN` / `ACCOUNTANT` role contract as the other Accounting reports. The route accepts only `from?`, `to?`, `currency?` and returns `AccountingTrialBalanceReportV1` by directly calling:

```text
AccountingTrialBalanceService.project({ from, to, currency })
```

B3-B performs no normalization, clamp, filtering, money arithmetic or DTO reconstruction. Exact query values are passed to B3-A; B3-A remains authoritative for default CAD, date validation, accounting-start clamp, canonical Journal reads, opening/period/closing totals and BadRequest/Conflict behavior. Controller/architecture characterization also keeps the Trial Balance route away from direct Prisma reads, Management projection arithmetic, ExpenseDocument arithmetic and Orders/provider facts.

Still explicitly excluded from B3-B: Web/PWA UI, CSV/PDF export, Balance Movement, old `report/account-balance` deletion/rename, store filter, FX conversion, Prisma/schema/migration, Journal posting changes and Management Expense filtering.

### B3-C — Balance Movement Statement

State: **MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE** through PR #2478 / final head `12597b96` / squash `dcf12666`; final PR CI #6180 passed after the initial #6179 API-lint-only retry.

B3-C does not query Journal, Prisma or Management reporting itself. `AccountingBalanceMovementService` calls the canonical B3-A `AccountingTrialBalanceService.project(query)` with unchanged `from?`, `to?`, `currency?` values and then applies a pure Balance Movement policy to those versioned account rows.

The v1 contract exposes account-level ASSET, LIABILITY and direct EQUITY movement sections with `openingCumulativeCents`, `periodMovementCents` and `closingCumulativeCents`. REVENUE and EXPENSE are not presented as balance-sheet sections; their signed normal balances are aggregated into an earnings bridge:

```text
Recorded Earnings = Revenue normal balance - Expense normal balance
Assets - Liabilities - Direct Equity - Recorded Earnings = 0
```

The equation is checked independently for opening, period and closing values. B3-C also revalidates Trial Balance source balance, per-account roll-forward, currency consistency and duplicate account IDs; any mismatch fails closed through `ConflictException` rather than emitting a partially reconciled statement.

Opening semantics remain explicit. With no `OPENING_BALANCE` Journal, `openingBasis.kind=ZERO_MANAGEMENT_OPENING`, `zeroOpeningDisclaimerRequired=true` and the statement represents cumulative recorded movement from `accountingStartDate`. If an explicit opening Journal later exists, the basis changes to `EXPLICIT_OPENING_JOURNAL`; B3-C still keeps `absoluteBalanceClaim=false`, so it does not promote itself to a formal Balance Sheet.

Authenticated `GET /accounting/report/balance-movement` is a thin transport under the existing Accounting guards. B3-C adds no Web/PWA UI, CSV/PDF export, old `report/account-balance` contraction, store filter, FX conversion, Prisma/schema/migration, Journal posting change or Management Expense filtering. Those presentation/cutover items remain B4 or later work.

### B3-D — Production reconciliation / closeout

After CI/deployment, reconcile fresh API output against canonical Journal/CoA totals, verify period/timezone/opening metadata and record final B3 evidence. B4 may then own UI/export/drill-through polish.

## 10. Architecture effect

B3-A remains the canonical Accounting Trial Balance authority. B3-B exposes that authority over HTTP. B3-C stays inside the same Accounting owner and depends only on the B3-A service/contract; it creates no second Journal reader and no cross-context financial calculation.

Expected graph effect:

- no new cross-context direction;
- no new scanner allowance;
- no new public SCC;
- no Prisma/schema/migration;
- no dependency manifest/lockfile change;
- no Orders/Payments/Loyalty/Uber/Clover behavior change;
- existing authenticated Trial Balance route retained;
- one additional authenticated Accounting route: `GET /accounting/report/balance-movement`;
- no Web/PWA/export consumer in B3-C.

Phase 9 remains **PRODUCTION VERIFIED / CLOSED** and is not reopened.
