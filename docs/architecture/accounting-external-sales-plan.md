# Accounting External Sales Plan

Status: **SLICE A MERGED / CI #6771 GREEN / PR #2654 / MERGE `26e9b15a`; SLICE B1 LOCAL IMPLEMENTED / MIGRATION REQUIRED / USER REVIEW PENDING**  
Date: 2026-10-02  
Slice B1 implementation base: `origin/dev@26e9b15a`  
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

State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED**.

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
change CoA stable IDs. It creates no migration file in MCP.

### Slice B2 — CoA foundation / commission normalization

B2 begins only after the user-generated B1 migration SQL is returned and
reviewed.

Production read-only evidence at B1 readiness shows the existing
`account_platform_commission_expense` has one AccountingAccount row and six
historical JournalLines totaling 703,084 cents of debit. JournalLine references
the account by internal UUID, not by stable ID. Therefore the target commission
normalization can preserve the same account row/UUID while changing its stable
business ID/name to:

```text
account_commission_expense
Commission Expense / 佣金费用
```

No historical JournalLine rewrite is required. B2 must update every current
provider/reporting/Sales Analytics reference atomically and retain regression
coverage proving historical provider commission remains visible.

B2 also provisions `account_accounts_receivable` as an active CAD ASSET
account with `type=null`. It must not add a new `AccountingAccountType`.

The B1 migration should be generated locally with:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name accounting_external_sales_b1_persistence_foundation
```

The generated SQL must be reviewed before application. Expected B1 SQL is
additive: one `AccountingJournalSource` enum value, one External Sale
granularity enum, new External Sale/Settlement/evidence tables, indexes,
uniques and foreign keys. It must not rename/drop the commission account,
create AR yet, rewrite Journal rows or backfill historical sales.

### Slice C — write authority

Add Serializable source-fact persistence + purpose-specific Journal write
authority + audit + period/start-date gates.

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