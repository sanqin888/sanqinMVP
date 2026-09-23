# Accounting Provider Payout / Bank Receipt Readiness

Date: 2026-09-23  
Baseline: `origin/dev@cbd8bb1d` after Accounting B4-B Statement exports (#2483)  
Work package: **PAYOUT-A — contract/reporting foundation**  
State: **LOCAL SOURCE / NO RUNTIME WRITER / NO MIGRATION / NO NEW CONTEXT EDGE**

## 1. Purpose

SanQ currently recognizes sales, provider statement economics, Expenses and Payroll into the canonical Accounting Journal, but it does not yet own a canonical fact for the later real-world event where Clover, Uber Eats or Fantuan transfers money into a bank account.

That event must be separate from the provider monthly statement.

The accounting chain is:

```text
sale / provider economics
        ↓
provider pending asset
        ↓
actual provider payout
        ↓
bank asset
```

The payout must never recreate Revenue, tax, commission or provider-fee arithmetic.

## 2. Why monthly statements cannot own bank receipt

Observed operating cadence is different from statement cadence:

- Clover generally deposits on business days for prior activity;
- Uber Eats pays on a weekly cadence;
- Fantuan pays on a weekly cadence;
- provider statements used by Accounting are monthly.

Therefore a payout can cross a month boundary and one monthly statement can correspond to many bank deposits. The canonical payout fact must not contain or require `documentStableId`, statement period start/end, or a one-to-one statement link.

Provider statements remain evidence/authority for provider economics. Payout facts own only the actual transfer into a bank account.

## 3. Existing foundations confirmed

The existing CoA already has the required assets:

- `account_clover_pending`;
- `account_uber_pending`;
- `account_fantuan_pending`;
- BANK accounts including the configured primary bank and operator-created bank accounts.

The canonical Journal already has:

- balanced line validation;
- stable source-fact identity;
- idempotency keys/hashes;
- period-lock enforcement;
- accounting-start enforcement;
- audit evidence;
- `TRANSFER` Journal kind.

Production read-only audit on 2026-09-23 found **zero active TRANSFER Journal entries**, so changing the current Cash Movement query to admit TRANSFER rows does not change existing production numbers.

## 4. PAYOUT-A frozen fact contract

The Accounting-owned v1 fact is:

```text
accounting.provider_payout.v1

payoutStableId
provider                     CLOVER | UBER_EATS | FANTUAN
storeStableId
payoutDate                   business date, YYYY-MM-DD
destinationBankAccountStableId
amountCents                  positive
currency                     CAD
providerReference            optional
```

Explicitly absent:

```text
provider statement ID
statement period
monthly statement revision
sales/tax/fee components
```

A later persistence slice may store this exact fact durably, but PAYOUT-A does not add schema or a write endpoint.

## 5. Frozen Journal semantics

A payout posts only an asset movement:

```text
Dr  destination BANK                    amount
Cr  provider-specific PLATFORM_WALLET  amount
```

The v1 draft uses:

- `kind = TRANSFER`;
- `source = PAYMENT`;
- `sourceFactType = accounting.provider_payout.v1`;
- `sourceFactStableId = payoutStableId`;
- `sourceFactVersion = 1`;
- idempotency key `provider-payout:<payoutStableId>:v1`.

`PAYMENT` is the Accounting Journal source classification for the settlement payment. It does not create an Accounting -> Payments context dependency and PAYOUT-A imports no Payments implementation/public contract.

The destination prerequisite is an active CAD BANK / ASSET account. The provider source prerequisite is the provider-specific active CAD PLATFORM_WALLET / ASSET account.

The payout date is interpreted in the configured business timezone before being converted to the Journal instant. This avoids UTC date rollover at month boundaries.

## 6. Cash Movement correction required by the contract

Before PAYOUT-A, `cashflowOverview()` excluded every `TRANSFER` Journal at the query level. That is too coarse for provider payouts:

- CASH -> BANK internal movement should contribute net zero cash movement because both CASH/BANK lines offset;
- PLATFORM_WALLET -> BANK provider payout should increase actual CASH/BANK by the deposited amount.

PAYOUT-A therefore excludes only `OPENING_BALANCE` at query time and continues deriving movement solely from CASH/BANK Journal lines. Internal CASH/BANK transfers naturally net to zero, while provider pending -> BANK is visible as operating cash movement.

This remains the existing lightweight **Cash movement** report, not a formal Statement of Cash Flows.

## 7. PAYOUT-A scope

Included now:

- shared provider -> pending-account mapping inside Accounting;
- pure provider payout fact normalization;
- provider payout account prerequisites;
- deterministic TRANSFER Journal draft;
- frozen write-authority hash/assertion policy;
- Cash Movement query semantics required for provider payouts;
- characterization coverage;
- roadmap/worklog/dependency documentation.

Not included now:

- Prisma persistence;
- migration;
- HTTP route;
- Web/PWA UI;
- actual Journal writer wiring;
- bank statement import;
- automatic matching;
- statement-to-payout allocation;
- provider API changes.

Therefore PAYOUT-A cannot create production money facts.

## 8. Next implementation gate — PAYOUT-B

Before exposing any write route, PAYOUT-B should add a durable Accounting-owned payout fact and same-transaction Journal posting authority.

Recommended persisted shape:

```text
AccountingProviderPayout
  payoutStableId
  provider
  storeStableId
  payoutDate
  destinationBankAccountStableId
  amountCents
  currency
  providerReference?
  journalEntryStableId?
  createdByActorRef
  createdAt
```

The exact Prisma relation/index design must be re-audited before editing schema. A persisted payout fact will require an additive user-generated migration under the repository migration workflow.

PAYOUT-B should:

1. create the immutable payout fact;
2. read/validate the pending and destination-account prerequisites;
3. post its Journal in the same Serializable Accounting transaction;
4. bind the Journal hash to the frozen payout fact + account authority;
5. save the Journal anchor back to the payout fact;
6. make an identical retry idempotent and reject conflicting reuse;
7. enforce accounting start/period locks through the existing Journal writer.

Do not enforce a monthly-statement foreign key.

Whether to block a payout when the current provider-pending balance is insufficient must be decided in PAYOUT-B readiness. Weekly/daily payouts can arrive before a monthly statement is uploaded, so a simplistic `payout <= current pending balance` rule can incorrectly block legitimate bank evidence when the provider economics authority is statement-lagged.

## 9. Later slices

After PAYOUT-B:

- **PAYOUT-C:** Accounting UI to record/inspect provider bank receipts;
- **PAYOUT-D:** pending-balance reconciliation and production verification;
- **PAYOUT-E (later):** bank CSV/API ingestion and suggested automatic matching.

Bank import is not required for the first production payout workflow.
