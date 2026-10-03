# Accounting External Sales Plan

Status: **SLICE A/B1/B2 MERGED; B2 PR #2656 / MERGE `4ce9c6aa` / CI #6777 GREEN; SLICE C1 SALE RECOGNITION LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION**  
Date: 2026-10-02  
Slice C1 implementation base: `origin/dev@4ce9c6aa`  
Owner: **Accounting / Reporting / Analytics**

## 1. Purpose

External Sales covers real SanQ sales that do not originate from the SanQ Order/POS
subsystem, including supermarket supply/wholesale, consignment, group-buy,
corporate and future offline/B2B arrangements.

The canonical rule is:

- do not fabricate an Order;
- do not derive the transaction from SanQ retail/catalog pricing;
- preserve the actual negotiated quantity, unit and unit price;
- recognize the sale through Accounting-owned Accounts Receivable;
- model later collection/withholding through a separate Settlement fact;
- add new sales modes as data, not new persisted fields or enum branches.

Phase 9 remains CLOSED. This is post-modularization Accounting product work.

## 2. Slice A authority freeze

Slice A introduces only Accounting-local TypeScript contracts, normalization,
posting-draft policy and focused regression/architecture tests. It does not wire
a controller, service, persistence model, Journal writer, Sales Analytics
consumer or Web surface.

Canonical source identities are reserved as:

- `accounting.external_sale.v1`
- `accounting.external_sale_settlement.v1`
- `accounting.external_sale_reversal.v1`
- `accounting.external_sale_settlement_reversal.v1`

The future dedicated Journal source is represented in the Slice A posting draft
as `EXTERNAL_SALE`, but the Prisma-backed `AccountingJournalSource` enum is
intentionally unchanged until the separately reviewed persistence slice.

## 3. Generic sale model

`AccountingExternalSale` is not keyed by a hard-coded sale-mode enum.
It carries a data-driven `classificationStableId`.

The commercial authority is composed from child facts:

```text
AccountingExternalSale
├─ SaleLine[]
│  ├─ description
│  ├─ optional external/product reference
│  ├─ quantity              exact decimal string, max 4 decimal places
│  ├─ unit
│  ├─ unitPriceCents        actual negotiated unit price
│  ├─ lineAmountCents       frozen rounded quantity × unit price
│  └─ revenueAccountStableId
├─ Adjustment[]
│  ├─ label
│  ├─ signed amountCents
│  └─ revenueAccountStableId
└─ Tax[]
   ├─ taxCode / label
   ├─ optional descriptive rateBasisPoints
   ├─ explicit amountCents
   └─ liabilityAccountStableId
```

There is deliberately no top-level `discountCents`, `commissionCents`,
`paymentMethod` or retail-price field.

For the historical supermarket Liangpi case, the source fact is simply the
actual supplied quantity multiplied by the negotiated wholesale/supply price.
The supermarket's consumer retail price is not part of SanQ's sale authority.

V1 money remains CAD integer cents. Quantity is normalized as a decimal string
and extended line amount uses deterministic half-up cent rounding so fractional
units do not rely on binary floating point.

## 4. Historical granularity

The fact records evidence granularity separately from sales classification:

- `TRANSACTION`
- `DAILY_SUMMARY`
- `PERIOD_SUMMARY`

Summary facts require explicit period boundaries. This prevents a monthly or
daily source document from being expanded into fabricated transaction-level
precision.

## 5. Receivable-first recognition

Every External Sale is recognized first through the reserved
`account_accounts_receivable` account:

```text
Dr Accounts Receivable
Dr negative revenue adjustments, when present
    Cr sale-line revenue
    Cr positive revenue adjustments, when present
    Cr explicit sales-tax liability
```

Whether cash/bank collection occurs on the same day is not a property of the
Sale fact. The UI may later offer "paid immediately", but that action creates a
separate Settlement atomically with the Sale.

## 6. Generic settlement model

A Settlement clears one or more External Sale receivables through generic
components:

```text
AccountingExternalSaleSettlement
├─ Allocation[]
│  └─ externalSaleStableId + applied amount
└─ Component[]
   └─ accountStableId + amount + label
```

The policy requires:

```text
sum(Settlement Components) == sum(Receivable Allocations)
```

Examples require no schema-specific commission/fee fields:

```text
ordinary collection:
Dr Bank
    Cr Accounts Receivable

collection with commission:
Dr Bank
Dr Commission Expense
    Cr Accounts Receivable

collection with commission tax:
Dr Bank
Dr Commission Expense
Dr HST Recoverable
    Cr Accounts Receivable
```

Later write authority must validate that selected component accounts are
permitted active CAD Accounting accounts and must continue the explicit-account
selection rule. Slice A does not query or mutate account persistence.

## 7. Commission-account normalization

The current `account_platform_commission_expense` name is too narrow for a
general commission expense that may arise from Uber/Fantuan, supermarket
consignment, sales agents or future channels.

Target semantic account:

```text
account_commission_expense
Commission Expense / 佣金费用
```

Slice A does **not** rename the existing account or rewrite historical Journals.
The later CoA/persistence slice must first audit every current reference and use
a data-preserving expand/contract approach. Sales Analytics must tolerate the
transition without losing historical provider commission amounts. A direct
drop/add stable-ID rename is not acceptable.

## 8. Correction / reversal direction

Posted source facts are immutable financial authority.

Future correction uses:

- exact Sale reversal + replacement Sale;
- exact Settlement reversal + replacement Settlement when only money-account
  attribution was wrong;
- replacement lineage carried by the replacement fact.

Closed-month/year behavior continues to use existing Accounting period policy;
External Sales will not receive a special lock bypass.

## 9. Slice A boundaries

Slice A intentionally does not:

- modify `schema.prisma` or any migration;
- add `AccountingJournalSource.EXTERNAL_SALE` to persisted enums;
- provision Accounts Receivable;
- rename the commission account;
- add HTTP routes or module wiring;
- add External Sales to canonical Sales Analytics;
- add Web UI;
- backfill historical supermarket data;
- create a general Opening Balance writer;
- add inventory/COGS authority.

No new cross-context import, dependency direction, scanner allowance or public
SCC is introduced.

## 10. Next slices

### Slice B1 — persistence foundation

State: **MERGED / PR #2655 / MERGE `d3e86921` / SOURCE CI #6773 GREEN / B1 MIGRATION `dc960d6d` REVIEWED / MIGRATION CI #6775 GREEN**.

Fresh readiness against `origin/dev@26e9b15a` found an existing architecture
guard that requires every `DEFAULT_ACCOUNTING_ACCOUNTS` stable ID to be present
in committed migration seed history. B therefore splits at the migration gate
instead of weakening that guard.

B1 adds only the additive persisted fact foundation:

- `AccountingJournalSource.EXTERNAL_SALE`;
- persisted `TRANSACTION | DAILY_SUMMARY | PERIOD_SUMMARY` evidence granularity;
- durable External Sale parent + line + generic adjustment + explicit tax facts;
- durable Settlement parent + receivable allocations + generic account
  components;
- exact quantity storage as `Decimal(18,4)` while public contracts remain
  decimal strings;
- internal AccountingAccount UUID relations for revenue/tax/settlement accounts;
- source-fact idempotency key, fact hash and Journal anchor fields;
- reversal identity/hash/Journal-anchor fields plus reversal actor/time;
- one-to-one replacement lineage for sale and settlement corrections;
- optional sale/settlement evidence links to existing
  `AccountingSourceArtifact`.

B1 does **not** register runtime routes/services, add Sales Analytics sources or
change CoA stable IDs. The user-generated migration
`20261002232836_accounting_external_sales_b1_persistence_foundation` was
reviewed as additive-only: enum extension/type + new External
Sale/Settlement/evidence tables, indexes, uniques and foreign keys, with no
DROP/rename/CoA seed/Journal rewrite/backfill. Commit `dc960d6d` passed CI
#6775, including fresh committed-migration replay in Browser E2E.

### Slice B2 — CoA foundation / commission normalization

State: **MERGED / PR #2656 / MERGE `4ce9c6aa` / FINAL HEAD `cf6e7cd5` / CI #6777 GREEN / MIGRATION REPLAY VERIFIED**.

B2 source changes the canonical CoA semantics to:

```text
account_accounts_receivable
Accounts Receivable / 应收账款
ASSET / type=null / CAD

account_commission_expense
Commission Expense / 佣金费用
EXPENSE / type=null / CAD
```

Production read-only evidence confirms the legacy
`account_platform_commission_expense` is one active CAD EXPENSE account with
six historical JournalLines totaling 703,084 cents of debit. JournalLine
references the account by internal UUID. There is no existing row or name
conflict for `account_commission_expense` or `account_accounts_receivable`.
Therefore the required data migration must update that same commission account
row in place; it must not create a second commission account or rewrite any
JournalLine.

B2 updates all current runtime consumers of the commission stable ID:

- Provider Settlement posts provider commission to the generic commission
  account while retaining the provider-specific `PLATFORM_COMMISSION`
  analytics meaning;
- canonical Sales Analytics reads the new account stable ID for existing
  provider statement facts;
- financial reporting maps the new stable ID to the existing provider-platform
  fallback category so historical report grouping does not change in B2;
- provider-settlement Web replay fixtures and API/reporting regressions use the
  new account ID;
- architecture guards pin AR + generic commission in
  `DEFAULT_ACCOUNTING_ACCOUNTS` and reject the legacy commission ID.

External Sales is still not added to the Sales Analytics source whitelist in
B2. Before External Settlement commission becomes runtime-active, Slice C/D
must give External Sales commission its own source-aware analytics/reporting
presentation rather than treating every debit to the shared commission account
as a platform commission.

Because B2 changes canonical seed data rather than `schema.prisma`, Prisma
cannot auto-generate this migration from a schema diff. The user explicitly
authorized one narrow exception to the repository's normal migration-authoring
rule, so B2 includes the hand-written data-only migration
`20261003002800_accounting_external_sales_b2_coa_normalization`. The exception
is limited to this migration and does not change the repository's default
migration workflow. The migration:

1. fail closed if the target commission stable ID/name already conflicts;
2. verify exactly one legacy commission account with the expected
   EXPENSE/null/CAD/active shape;
3. update that exact row in place from
   `account_platform_commission_expense / 平台佣金` to
   `account_commission_expense / 佣金费用`, preserving its UUID;
4. insert `account_accounts_receivable / 应收账款` as active CAD ASSET with
   `type=NULL`, with conflict checks rather than silently creating duplicates;
5. perform no JournalEntry/JournalLine update, no historical posting, no
   External Sale backfill and no destructive DROP;
6. include both new canonical stable IDs in committed migration SQL so the
   existing cumulative CoA seed architecture guard can include this migration
   without being weakened.

The migration is pinned by
`accounting-journal-boundary.architecture.spec.ts` and its exact path is added
to the existing explicit `ACCOUNTING_COA_SEED_MIGRATIONS` list. The guard is
not weakened.

### Slice C — write authority

Slice C is intentionally split so each canonical financial action has one
purpose-specific authority and one reviewable atomic write path.

#### Slice C1 — Sale Recognition

State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION** on
`feat/accounting-external-sales-slice-c-write-authority` from
`origin/dev@4ce9c6aa`.

C1 activates only `POST /accounting/external-sales` for ADMIN/ACCOUNTANT. It
normalizes the frozen v1 commercial fact and writes, inside one Serializable
transaction:

1. the durable `AccountingExternalSale` parent and line/adjustment/tax facts;
2. a purpose-specific `EXTERNAL_SALE_RECOGNITION` Journal authority;
3. the canonical STANDARD Journal;
4. the source-fact `journalEntryStableId` anchor; and
5. an `EXTERNAL_SALE_POST` Accounting audit record.

The Journal path reuses the existing Accounting start-date and period-lock
policy. Therefore pre-start sales and sales in a closed month/year fail inside
the same transaction and leave no orphan source fact.

C1 fails closed on account injection:

- receivable is exactly `account_accounts_receivable`, active CAD ASSET,
  `type=null`;
- sale lines may use only `account_sales_revenue` or
  `account_other_operating_revenue`;
- negative adjustments may use only `account_sales_discounts`;
- positive adjustments may use only `account_delivery_revenue` or
  `account_other_operating_revenue`;
- `HST` / `ZERO_RATED` tax facts must map to
  `account_hst_payable`;
- commission remains settlement-side and cannot be posted through Sale
  Recognition.

Stable-ID replay is idempotent only when the frozen fact hash is identical and
the existing Journal anchor is live and consistent. Generic Journal
create/update/delete routes cannot forge, mutate or delete External Sales
canonical source types. Replacement input is rejected until C3.

C1 deliberately does **not** activate Settlement, reversal/correction,
External Sales in the Sales Analytics whitelist, historical backfill, evidence
attachment UX or Web UI.

#### Slice C2 — Settlement

Add Serializable Settlement persistence + receivable allocation validation +
purpose-specific Settlement Journal authority. Settlement components must use a
policy-controlled active CAD account set; this is where bank/cash collection,
commission expense and recoverable commission tax become runtime-active.

#### Slice C3 — Reversal / Correction

Add exact inverse reversal of the original Sale/Settlement Journals plus
replacement lineage. Reversal must use the stored original Journal rather than
recomputing current business policy. Closed-period behavior continues through
the existing Accounting period policy.

### Slice D — Sales Analytics

Add the canonical source whitelist/projection while keeping generic Manual
Journals excluded and keeping Orders attribution out of External Sales.

### Slice E — Web

Add create/review/history/settlement/correction UX with explicit account
selection.

### Slice F/G — historical reconstruction

- on/after 2026-06-01: replay only at source-supported granularity;
- before 2026-06-01: Opening Balance/cutover workflow only, never fabricated
  June sales.