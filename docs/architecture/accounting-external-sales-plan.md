# Accounting External Sales Plan

Status: **SLICE A/B1/B2/C1/C2/C3/D MERGED; D PR #2660 / HEAD `9df694f4` / MERGE `1198ed52` / CI #6792 GREEN / NO MIGRATION; SLICE E LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION**  
Date: 2026-10-03  
Slice E implementation base: `origin/dev@1198ed52`  
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

State: **MERGED / PR #2657 / FINAL HEAD `ebb13b22` / MERGE `d412f4be` / CI #6780 GREEN / NO MIGRATION**.

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

State: **MERGED / PR #2658 / FINAL HEAD `96179a8c` / MERGE `c81e13bb` /
CI #6784 GREEN / NO MIGRATION / NO SALES ANALYTICS CUTOVER**.

C2 activates `POST /accounting/external-sales/settlements` for
ADMIN/ACCOUNTANT and writes, inside one Serializable transaction:

1. the durable Settlement plus Allocation/Component facts;
2. frozen receivable prerequisites for every allocated External Sale;
3. a purpose-specific `EXTERNAL_SALE_SETTLEMENT` Journal authority;
4. the STANDARD canonical Journal that debits settlement components and credits
   Accounts Receivable;
5. the Settlement `journalEntryStableId` anchor; and
6. an `EXTERNAL_SALE_SETTLEMENT_POST` Accounting audit record.

The original receivable amount is **not** recomputed from mutable commercial
source rows. C2 reads the already-recognized Sale canonical Journal and freezes
the exact positive `account_accounts_receivable` debit as financial authority.
The Sale Journal must be live, source=`EXTERNAL_SALE`,
sourceFactType=`accounting.external_sale.v1`, and anchored to the allocated
Sale. Existing live Settlement allocations are subtracted from that Journal
receivable before the new allocation is accepted.

The Settlement authority freezes, and the Journal writer rechecks inside the
same transaction:

- Sale stable ID, Store, counterparty, currency, occurred date, factHash and
  original Sale Journal anchor;
- total canonical receivable, already-settled amount and outstanding-before;
- the exact allocation amount;
- every selected component account's active CAD class/type shape.

This makes partial and multi-sale settlements possible while preventing
over-settlement. Concurrent writers reuse the existing Serializable/P2034 retry
path; after a serialization retry the outstanding balance is recalculated from
the newly committed allocations.

Runtime component policy is fail-closed:

- collection account: any active CAD ASSET with type BANK or CASH;
- `account_hst_recoverable`: active CAD ASSET, `type=null`;
- settlement expense allowlist:
  `account_commission_expense`,
  `account_general_operating_expense`,
  `account_platform_promotion_expense`,
  `account_advertising_expense`,
  `account_payment_processing_fee_expense`, and
  `account_chargeback_adjustment_expense`;
- PLATFORM_WALLET, revenue, liability, equity, payroll expense and arbitrary
  accounts are rejected;
- recoverable HST requires an allowed settlement-expense component and cannot
  exceed the settlement expense principal.

Reversed allocations do not consume outstanding receivable. An unanchored prior
Settlement fails closed, and an exact-id replay that finds a persisted Settlement
without a Journal anchor also requires manual review rather than auto-repair.
Settlement date cannot precede the Sale, and all
allocations in v1 must match the Settlement Store/counterparty/CAD identity.
Replacement lineage is activated by C3 only after the predecessor has a complete
reversal fact and a live canonical reversal Journal anchor.

Financial Reports are made source-aware at this runtime gate: provider statement
commission keeps the existing `expense_platform_fee` fallback, while
External-Sale-Settlement commission/payment-processing expense uses the existing
`expense_other` fallback so it is not mislabeled as platform commission.
Detailed account identity remains the generic commission/processing account.
External Sale/Settlement remains outside the canonical Sales Analytics whitelist
until Slice D.

#### Slice C3 — Reversal / Correction

##### C3 task contract

**Goal**

Make already-posted External Sale and Settlement facts correctable without
mutating historical canonical Journals, weakening period locks, or recomputing
the reversal from today's commercial policy. C3 must leave an auditable chain:

`original fact -> exact inverse reversal -> optional replacement fact`.

**Execution steps**

1. **Freeze reversal contracts and identities**
   - accept a normalized human reversal reason;
   - derive one deterministic reversal stable ID per Sale/Settlement target;
   - bind target stable ID, original fact hash, original Journal anchor and reason
     into a frozen reversal fact/hash.
2. **Read the original financial authority**
   - require the original source fact to have a live canonical Journal anchor;
   - freeze the original Journal source identity, Store, currency, occurredAt and
     complete ordered line snapshot;
   - never rebuild reversal amounts from current Sale/Settlement posting policy.
3. **Post exact inverse Journal authority**
   - create an `ADJUSTMENT` Journal under the reserved Sale/Settlement reversal
     source fact type;
   - preserve original account/category/memo identity and swap every debit/credit;
   - re-read source-fact reversal evidence and the original Journal inside the
     same Serializable transaction before posting.
4. **Enforce dependency-safe reversal order**
   - Settlement may be reversed directly when its original Journal is intact;
   - Sale reversal is blocked while any allocated Settlement is still live;
   - previously reversed Settlements must have complete reversal evidence and a
     live matching reversal Journal.
5. **Anchor and audit**
   - persist reversal stable ID/hash/actor/time before Journal write in the same
     transaction;
   - anchor the resulting reversal Journal;
   - write JSON-safe Accounting audit evidence containing the readable reason and
     final reversal identity.
6. **Activate correction lineage**
   - reuse the existing C1/C2 create paths for replacements;
   - permit `replacementForExternalSaleStableId` /
     `replacementForSettlementStableId` only after the predecessor is fully
     reversed and its reversal Journal remains live;
   - require matching Store/CAD and an unused one-to-one replacement relation.
7. **Preserve period semantics**
   - reversal Journals are `ADJUSTMENT`;
   - replacement Journals are also `ADJUSTMENT`;
   - ordinary new Sale/Settlement Journals remain `STANDARD`;
   - month-close adjustment behavior and year-close hard lock remain owned by the
     existing Accounting period policy.
8. **Pin reporting and architecture regressions**
   - verify inverse Sale revenue, Settlement expense/input-tax and BANK/CASH
     effects through existing Financial Reports;
   - keep all four External Sales canonical source fact types protected from
     generic Journal update/delete;
   - keep External Sales outside Sales Analytics until Slice D.

**Boundary / non-goals**

C3 must **not**:

- modify `schema.prisma` or add a migration;
- add a special period-lock bypass or reopen closed periods;
- mutate/delete the original Sale, Settlement or Journal in place;
- recalculate historical amounts from current catalog, tax, pricing or settlement
  policies;
- allow arbitrary account/category injection through the reversal path;
- make inactive dimensions generally writable: only the purpose-specific
  exact-inverse writer may reuse dimensions referenced by the original Journal;
- introduce a third correction persistence model: correction remains reversal +
  replacement lineage;
- add External Sales to canonical Sales Analytics;
- add Web UI, evidence UX or historical backfill;
- add inventory/COGS authority or fabricate Order records;
- introduce a cross-context import, new dependency direction, scanner allowance,
  SCC, package dependency or architecture-baseline change.

**Completion gate**

C3 is source-complete only when focused regressions pin:

- exact inverse line-by-line reversal;
- deterministic idempotent replay and reason-hash conflict behavior;
- Sale-with-live-Settlement rejection;
- Settlement reversal reopening AR;
- complete predecessor reversal requirements for replacement lineage;
- replacement `ADJUSTMENT` vs ordinary `STANDARD` semantics;
- Financial Report signed effects;
- controller/module/architecture ownership and generic-Journal mutation guards.

Repository workflow remains: local implementation -> user review -> PR -> CI
green -> merge. Per `AGENTS.md`, CI is the validation gate; no local
lint/build/test/formatter/scanner is run before review.

State: **MERGED / PR #2659 / HEAD `2b7ecef8` / MERGE `3a75c77a` / CI #6788 GREEN / NO MIGRATION / NO SALES ANALYTICS CUTOVER / NO GRAPH OR BASELINE CHANGE**.

C3 activates two ADMIN/ACCOUNTANT reversal transports:

- `POST /accounting/external-sales/:externalSaleStableId/reverse`;
- `POST /accounting/external-sales/settlements/:settlementStableId/reverse`.

The reversal authority never reconstructs current commercial/pricing policy.
It freezes the original canonical Journal's identity and complete ordered line
snapshot, then creates the inverse by swapping debit/credit on every original
line while preserving account stable ID, category stable ID, line memo,
Store, currency and the original Journal `occurredAt`.

Reversal Journals use `AccountingJournalEntryKind.ADJUSTMENT`. Therefore the
existing period policy remains authoritative without a new exception:

- an already month-closed period still accepts the correction adjustment;
- a year-closed period remains a hard lock;
- Accounting start-date protection still applies.

Sale reversal is dependency-safe: any live Settlement allocation blocks the Sale
reversal and must be reversed first. A Settlement with partial reversal evidence
or a missing/inconsistent reversal Journal also blocks the Sale reversal.
Settlement reversal is the exact inverse of its Settlement Journal, so bank/cash,
commission/other settlement expense and recoverable HST are reversed and the
original Accounts Receivable is reopened. The purpose-specific reversal writer
may reference an original Journal account/category that has since been marked
inactive; ordinary Journal writes still require active dimensions. This preserves
historical exact-inverse capability without weakening the normal chart-of-accounts
gate.

Reversal identity is deterministic per target. The user-supplied reason is part
of the frozen `reversalFactHash`; an identical reason may replay the same
reversal Journal, while a different reason for the same target fails closed.
The schema has no dedicated reversal-reason column, so the human-readable reason
is retained in the Accounting audit evidence and is cryptographically bound by
`reversalFactHash`; no schema/migration is introduced for C3.

Correction is modeled as two explicit canonical actions rather than a new hidden
mutation:

1. exact-inverse reversal of the predecessor;
2. creation through the existing Sale/Settlement create path with
   `replacementForExternalSaleStableId` or
   `replacementForSettlementStableId`.

A replacement is accepted only when the predecessor is fully reversed, its
reversal Journal anchor is live and consistent, Store/CAD identity is preserved,
and the predecessor has no existing replacement. The one-to-one replacement
relations already provisioned in B1 remain the durable lineage authority.
Correction replacement Journals use `ADJUSTMENT` rather than `STANDARD`, so
reversal + replacement can complete inside a month-closed period while year-close
remains a hard lock. Ordinary non-replacement Sale/Settlement writes remain
`STANDARD`.

Financial Reports require no new runtime projector: Sale reversal/replacement
ADJUSTMENT Journals contribute signed revenue adjustments; Settlement
reversal/replacement Journals contribute signed settlement-expense adjustments,
recoverable-HST reversal, and inverse BANK/CASH movement through the existing
cashflow projection. External Sale canonical source types remain outside Sales
Analytics until Slice D.

### Slice D — Sales Analytics

**Goal:** project External Sales canonical financial facts into the existing
Sales Analytics read model without changing Journal authority or turning generic
Manual Journals into sales.

**D0/D1 readiness audit — 2026-10-02**

State: **READINESS COMPLETE / D2+D4 LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION / NO GRAPH OR BASELINE CHANGE** at `origin/dev@3a75c77a`.

- D0 confirms C3 is merged through PR #2659, final head `2b7ecef8`,
  squash merge `3a75c77a`, with CI #6788 green. C3 changed the human-readable
  dependency-graph status only; it did not change
  `tools/architecture/context-baseline.json`, any direct-import allowance,
  scanner ceiling, SCC, package dependency or context direction.
- At the D1 baseline, the Sales source whitelist contained only Order
  sale/change/reversal, provider financial document and the historical Uber
  replacement reversal.
  `readSalesJournals()` filters by that whitelist and
  `assertJournalAuthority()` pins each fact type to its expected Journal
  source, so generic `MANUAL` revenue cannot leak into Sales merely by using a
  revenue account.
- Every Sales monetary field is projected from canonical Journal lines. Gross
  Sales, discounts, delivery, surcharge, output tax, tips, other operating
  revenue and the existing fee metrics are selected by account stable ID plus
  accounting sign. Orders contributes only non-monetary channel/payment
  attribution through its public reader.
- External Sale recognition is already projection-compatible without a schema
  change: revenue/discount/delivery/other-operating/HST lines use accounts that
  the Sales policy already understands, while Accounts Receivable is ignored by
  the component projector. The exact-inverse Sale reversal therefore nets the
  same metrics naturally by sign. A corrected replacement Sale uses the normal
  `accounting.external_sale.v1` source type and its own persisted lineage, so
  no replacement-specific analytics source is required.
- The existing `AccountingExternalSale` row already persists every required
  non-monetary External attribution for D: `classificationStableId`,
  granularity, counterparty, Store, occurred date, replacement lineage and
  reversal stable ID. Recognition can resolve by `externalSaleStableId`;
  reversal can resolve the same row by `reversalStableId`; a replacement
  resolves as an ordinary new Sale. No Prisma/schema migration is required.
- Primary channel should be `external`. A later Settlement collection account
  is not the Sale's primary payment method; the D contract should represent the
  External Sale payment dimension as explicitly not applicable rather than
  borrowing BANK/CASH from Settlement or marking the owner fact as missing.
  `classificationStableId` should be exposed as a secondary External-sales
  dimension instead of creating top-level wholesale/consignment/group-buy
  channels.
- **D3 readiness recommendation:** keep
  `accounting.external_sale_settlement.v1` and its reversal outside canonical
  Sales Analytics in this Slice. The current `account_commission_expense`
  mapping is globally hard-coded as `PLATFORM_COMMISSION`, while External
  Settlement commission is intentionally generic; current Financial Reports
  already solve this with source-aware semantics. In addition, one Settlement
  may allocate multiple Sales/classifications while its expense components are
  settlement-level, so classification-level commission allocation is not
  losslessly derivable. For D, External commission/payment-processing and other
  Settlement costs should remain in P&L/financial reporting. A later
  source-aware sales-cost contract may add generic commission metrics only after
  explicit allocation semantics are defined. Do not overload
  `platformCommissionCents`.
- **Web compatibility gate resolved:** the existing Accounting Sales Web consumer
  uses exhaustive `Record` label maps for channel, primary payment method and
  source bucket. The user explicitly authorized the narrow compatibility change:
  synchronize only the existing Web contract unions plus labels for `external`,
  `NOT_APPLICABLE`, `EXTERNAL_SALE` and `EXTERNAL_SALE_REVERSAL`; do not add
  layout, widgets or External Sales UI. This keeps the existing v1 endpoint and
  avoids a temporary versioned/dual contract.

**D2/D4 local implementation — 2026-10-02**

State: **MERGED / PR #2660 / HEAD `9df694f4` / MERGE `1198ed52` / CI #6792 GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.

- Sales whitelist adds only `accounting.external_sale.v1` and
  `accounting.external_sale_reversal.v1`; Settlement and Settlement reversal stay
  excluded.
- Journal source authority pins both included External types to
  `AccountingJournalSource.EXTERNAL_SALE`. Monetary projection continues through
  the existing account/sign policy; AR remains non-Sales.
- The projection joins `AccountingExternalSale` only for non-monetary attribution
  and validates Store plus recognition/reversal Journal anchors before using the
  classification. Primary channel is `external`, primary payment is
  `NOT_APPLICABLE`, and `byExternalClassification` aggregates the persisted
  `classificationStableId`.
- Replacement Sales remain normal `accounting.external_sale.v1` facts. Original
  Sale + exact reversal therefore net naturally, and the replacement contributes
  under its own classification without a replacement-specific source type.
- Existing `platformCommissionCents` remains provider-specific in D. External
  Settlement commission/payment-processing stays outside Sales Analytics and
  continues through source-aware Financial Reports/P&L.
- D4 regressions cover ordinary External Sale, exact reversal + replacement,
  provider/external mixed periods, classification netting, source-fact/Journal
  anchor fail-closed behavior, Settlement source exclusion and existing MANUAL
  source-owner rejection.
- Web changes are compatibility-only: contract unions/report shape plus label
  entries. No Sales-page layout, widget or External Sales UI is introduced.

**Execution steps:**

1. audit the current Sales Analytics source whitelist, canonical fact projector,
   channel/payment attribution contract and all External Sale/Settlement source
   types after C3 merges;
2. add only the External Sales canonical source types required for monetary
   projection:
   - sale recognition;
   - sale reversal;
   - corrected replacement Sale through its normal sale source type;
   - settlement data only where a Sales Analytics metric explicitly needs it;
3. make primary channel `external` and keep the persisted
   `classificationStableId` as the secondary External-sales classification
   dimension rather than creating one top-level channel per B2B mode;
4. derive monetary sales values from canonical Journal lines, not
   `AccountingExternalSale` commercial rows;
5. use External Sale source facts only for non-monetary attribution that the
   Journal does not contain, such as classification/counterparty/evidence
   granularity;
6. preserve signed reversal/replacement behavior so corrected history nets
   correctly without deleting predecessor analytics facts;
7. generalize commission reporting semantics where needed so
   `account_commission_expense` does not imply provider/platform commission for
   External Sales;
8. add focused regressions for sale, reversal, replacement, partial settlement
   and mixed provider/external history.

**Boundary / non-goals:**

- do not redesign Journal or revenue posting;
- do not make Order rows the amount authority for External Sales;
- do not include generic `MANUAL` revenue Journals;
- do not classify later settlement method as the Sale's primary payment method;
- do not change External Sale persistence or add a migration unless a readiness
  audit proves a missing analytics dimension cannot be projected from existing
  facts;
- do not add Web UI or historical backfill in D;
- do not change provider Uber/Fantuan/Clover canonical semantics merely to fit
  External Sales.

**Completion gate:** canonical Sales totals, tax/discount/adjustment signs,
reversal/replacement netting, External classification and commission semantics
must be covered by focused projection tests and the existing Sales Analytics
architecture guards, with no new cross-context amount authority.

### Slice E — Web

**Goal:** expose the already-established Accounting authority safely; the Web
must orchestrate C1/C2/C3 APIs, not duplicate accounting calculations.

**Slice E local implementation — 2026-10-03**

State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE** on `feat/accounting-external-sales-slice-e-web` from `origin/dev@1198ed52`.

- Accounting adds additive ADMIN/ACCOUNTANT GET read models for External Sale
  list, detail, Settlement history and form options. The read model is Store-scoped
  through `BRAND_STORE_CONFIG_READER` and stays inside the existing Accounting
  owner/context.
- Outstanding receivable is projected only from the canonical Sale Journal AR
  line plus live, non-reversed Settlement allocations. Settlement allocation
  totals must reconcile exactly to the Settlement Journal AR credit. Sale,
  Settlement and their reversal Journal source/type/stable-ID anchors are all
  revalidated before the UI sees the facts; missing or drifted anchors fail
  closed.
- Form account options reuse the exact canonical Sale/Settlement Journal-policy
  allowlist constants. Web receives only already-authorized account choices; it
  contains no GL stable-ID allowlist, arbitrary account picker or default bank.
  Collection remains an explicit active CAD BANK/CASH selection.
- Accounting Web adds a mobile-first External Sales workspace with history/detail,
  negotiated Sale entry, explicit receivable Settlement entry, canonical Journal
  references, audit history, reversal reasons and correction as reversal followed
  by a prefilled replacement carrying predecessor lineage. Posted facts have no
  in-place edit path.
- Classification remains data-driven free text with persisted suggestions rather
  than a new enum/table. Evidence granularity remains explicit
  `TRANSACTION | DAILY_SUMMARY | PERIOD_SUMMARY`; the browser does not fabricate
  transaction detail from summary evidence.
- The Accounting read path is decomposed into a query orchestration service,
  a pure canonical projection/validation policy and Prisma select/type persistence
  shapes. The service stays below the repository large-file threshold and Prisma
  does not leak into the policy or controller.
- New form/detail containers were decomposed into feature-owned editors/cards so
  the implementation does not expand the existing large-page debt. Accounting
  remains narrow-screen/mobile-first and the existing manifest-only staff PWA
  runtime is unchanged.
- Focused API regressions pin canonical AR/live-Settlement derivation,
  Settlement allocation-to-Journal reconciliation, reversal-Journal integrity,
  reversed Sale semantics, Sale/Settlement anchor failures and server-authorized
  form options. A Web source-boundary test pins API orchestration, absence of browser
  account allowlists/default-bank logic and External Sales navigation.

**Execution steps:**

1. add External Sales list/history/detail views;
2. add Sale create form with explicit negotiated quantity/unit/unit price,
   adjustments, taxes, classification and evidence granularity;
3. add Settlement form with explicit receivable allocation and explicit
   BANK/CASH/allowed-expense account selection;
4. show outstanding AR from backend authority rather than browser-side
   recomputation;
5. add reversal flow with required reason and clear irreversible-history
   messaging;
6. add correction flow as reversal followed by prefilled replacement, preserving
   predecessor lineage;
7. expose audit/history/replacement chain and canonical Journal references where
   appropriate;
8. add focused narrow-screen/PWA coverage consistent with current Accounting UI
   conventions.

**Boundary / non-goals:**

- no client-side ledger/account allowlist authority;
- no implicit/default bank selection;
- no arbitrary GL account picker;
- no hidden in-place edit of posted financial facts;
- no historical importer in the interactive create form;
- no inventory/COGS behavior.

### Slice F — Post-start historical reconstruction

**Goal:** canonicalize supported External Sales evidence on/after the Accounting
start date `2026-06-01` without fabricating transaction precision.

**Execution steps:**

1. inventory actual source evidence and its supported granularity;
2. map each source record/batch to `TRANSACTION`, `DAILY_SUMMARY` or
   `PERIOD_SUMMARY`;
3. reconcile source control totals before posting;
4. create External Sale facts through the same canonical write authority used by
   live C1;
5. create Settlement facts only when collection/withholding evidence exists;
6. preserve evidence references and deterministic import idempotency;
7. reconcile resulting Journal/Sales Analytics totals back to source documents.

**Boundary / non-goals:**

- never explode monthly/daily evidence into invented individual sales;
- never infer taxes, commission, payment account or settlement date without
  evidence;
- never write directly to Journal tables as a shortcut;
- no pre-2026-06-01 revenue posting in F.

### Slice G — Pre-start opening balance / cutover

**Goal:** represent External Sales economic positions that existed before
`2026-06-01` without moving historical revenue into June.

Examples:

- unpaid pre-start receivable -> opening AR position;
- already-collected pre-start cash/bank -> opening cash/bank position, not June
  revenue;
- no fabricated June External Sale simply to make balances appear.

G requires a dedicated readiness audit of the existing Opening Balance support
before implementation. If a general opening-balance writer is still absent, its
design must be reviewed as Accounting-wide infrastructure rather than hidden
inside External Sales.

### Slice H — Closeout / production verification

**Goal:** close the External Sales program only after source, reporting, UI and
historical behavior are verified together.

Closeout must include:

1. architecture and source-authority re-audit;
2. migration/persistence review status;
3. production deployment gate;
4. active verification of:
   - new Sale;
   - partial/full Settlement;
   - Settlement reversal;
   - Sale reversal after Settlement reversal;
   - corrected replacement Sale/Settlement;
   - month-close adjustment behavior where safely testable;
   - Sales Analytics and Financial Report net effects;
5. historical reconstruction reconciliation evidence;
6. explicit remaining deferrals, especially inventory/COGS or pre-start opening
   balances if not yet completed;
7. final roadmap/worklog/dependency-document state.

Until H is complete, the External Sales program may be `MERGED / CI GREEN` but
must not be labeled `PRODUCTION VERIFIED / CLOSED`.