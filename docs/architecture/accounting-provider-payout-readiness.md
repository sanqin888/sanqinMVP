# Accounting Provider Payout / Bank Receipt Readiness

Date: 2026-09-23  
Baseline: latest `origin/dev@488f9024` after PAYOUT-C production deployment/verification  
Work package: **PAYOUT-D — Provider Pending canonical roll-forward**  
State: **LOCAL SOURCE READY FOR USER REVIEW / READ-ONLY / NO MIGRATION / NO NEW CONTEXT EDGE**

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

PAYOUT-A merged through PR #2484 / final head `7e094c8b` / squash `b919990f`; CI #6198 passed after the initial CI #6197 reported only formatting findings. PAYOUT-B persists this exact fact without adding statement identity or statement-period fields.

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

PAYOUT-A had no production write caller and is now merged/CI-green. PAYOUT-B adds the internal persistence/write core but still exposes no HTTP/UI/runtime caller before its migration gate is satisfied.

## 8. PAYOUT-B implementation — durable fact + atomic posting

The PAYOUT-B readiness audit confirms the existing Payroll employee-payment pattern is the correct local precedent. The implementation adds one Accounting-owned table:

```text
AccountingProviderPayout
  id                             internal UUID
  payoutStableId                 unique caller-supplied business identity
  provider
  storeStableId
  payoutDate                     date-only
  destinationBankAccountStableId
  amountCents
  currency
  providerReference?
  journalEntryStableId?          unique canonical anchor
  createdByActorRef
  createdAt
  updatedAt
```

There is deliberately no relation to `AccountingProviderFinancialDocument`, no statement period, and no uniqueness requirement on `providerReference`. The latter is supporting bank/provider evidence, not the business identity.

The posting transaction is:

```text
normalize frozen payout fact
        ↓
Serializable Accounting transaction
        ↓
find/create AccountingProviderPayout
        ↓
validate active CAD provider PLATFORM_WALLET + destination BANK
        ↓
revalidate persisted payout fact + current account prerequisites
        ↓
createProviderPayoutJournalInTx()
        ↓
Dr BANK / Cr provider pending
        ↓
save journalEntryStableId on payout
        ↓
write ACCOUNTING_PROVIDER_PAYOUT audit
```

The generic Journal writer rejects `accounting.provider_payout.v1`, and generic Journal update/delete paths reject an existing canonical payout Journal. This prevents a caller from bypassing the payout-specific persisted authority.

### Idempotency and recovery

`payoutStableId` is intentionally caller-supplied. The exact same stable ID + exact same frozen fields is an idempotent retry. Reusing the stable ID with a different provider, date, account, amount, currency or reference fails closed.

If a matching persisted payout exists without a Journal anchor, the same write core can resume posting. If it already has an anchor, replay verifies that the referenced active Journal is `PAYMENT / accounting.provider_payout.v1` for the same payout before returning it.

### Pending-balance policy

PAYOUT-B does **not** require:

```text
current posted provider pending balance >= payout amount
```

This is intentional. Clover daily and Uber/Fantuan weekly deposits can occur before their monthly statement evidence is uploaded, so the current canonical pending balance may temporarily lag the real bank deposit. Blocking that deposit would discard stronger real-world bank evidence. PAYOUT-D reconciliation should surface a negative/unsupported pending balance and explain the missing statement coverage instead.

### Runtime exposure gate

PAYOUT-B registers the Accounting-local service but exposes no controller, HTTP route or Web UI. Architecture tests pin `createProviderPayoutJournalInTx()` to exactly one production caller, `AccountingProviderPayoutService`, and pin the payout controller caller set to zero.

### Migration gate

**MIGRATION REQUIRED.** The schema addition is additive-only and should create the new payout table plus its unique constraints/indexes. It requires no backfill, rename, enum change, drop or data contraction.

Suggested migration name:

```text
accounting_provider_payout_persistence
```

User-local generation command against the verified disposable/local development database:

```bash
pnpm --filter api exec prisma migrate dev --create-only --name accounting_provider_payout_persistence
```

The user-generated migration is now committed as `20260923153202_accounting_provider_payout_persistence` at `dev@da7edc2b`. Review of the complete SQL confirms exactly one additive table, the two expected unique indexes and four lookup indexes. There is no DROP, rename, backfill, enum mutation, relation rewrite or data contraction. The **dev migration gate is satisfied**. Production deployment of payout-writing source still requires this committed migration to be applied there first.

## 9. PAYOUT-C runtime/UI exposure

PAYOUT-C adds no new financial authority. It exposes the existing PAYOUT-B owner service through a dedicated Accounting transport adapter:

```text
GET  /accounting/provider-payouts
POST /accounting/provider-payouts
```

Both routes remain behind the standard Accounting `ADMIN | ACCOUNTANT` guards. GET is bounded to 1..200 rows and may filter by provider/store. POST requires the authenticated stable user ID and passes only the frozen payout fact to `AccountingProviderPayoutService`.

The Web surface is deliberately placed inside **Accounting -> Provider settlements**, but visually and semantically separated from monthly statement replay. The form contains:

- provider;
- store stable ID;
- actual bank receipt date;
- actual received CAD amount;
- destination active CAD BANK account;
- optional provider/bank reference.

Known store IDs discovered from provider evidence are only UI suggestions. A payout does not gain a statement ID, period, document revision or statement allocation.

### Posting safety

The operator must explicitly confirm that the amount/date were verified against the actual bank record. The UI states that monthly statement `Net payout` is not sufficient evidence and that the canonical payout cannot be edited in place after posting.

Changing any material form fact clears that confirmation and clears the current client-generated `payoutStableId`. On POST, the client generates one opaque stable ID and retains it across an unchanged failed/ambiguous retry; after a successful response it is cleared for the next payout. This aligns the browser retry boundary with PAYOUT-B exact-fact idempotency.

The first UI does not infer payout amount from monthly statements and does not automatically submit anything.

### History

The same panel exposes recent payout history from the Accounting-owned table, including provider, store, payout date, destination bank, amount, reference and canonical Journal anchor. This gives the operator immediate evidence that a POST succeeded and reduces accidental duplicate entry.

### PAYOUT-C exclusions

Still excluded:

- bank CSV/API ingestion;
- automatic payout matching;
- provider payout API reads;
- statement-to-payout allocation;
- automatic clearing suggestions;
- payout correction/reversal workflow;
- PAYOUT-D pending-balance reconciliation.

The absence of an in-place edit path is intentional because the canonical payout fact is immutable. A dedicated reversal/correction design should be added before providing a convenience “edit/delete” action.

## 10. PAYOUT-C production verification

PAYOUT-C merged through PR #2486 / final head `cb298a3b` / squash `488f9024`; CI #6205 passed. Production is running `488f9024`.

The PAYOUT-B migration is applied in production:

```text
20260923153202_accounting_provider_payout_persistence
finished_at = 2026-09-23T16:25:54.720044Z
```

Two real bank receipts were then recorded through the production UI:

```text
Uber Eats
payoutStableId   payout_19505915-fb5e-450a-b8e2-93970d121794
payoutDate       2026-06-09
amount           28,448c
bank             CIBC
Journal          journal_xaty4dfjj2g4jyk7weie53uj

Fantuan
payoutStableId   payout_6c1afb5e-3246-4dbc-898e-2cf9ee36fc53
payoutDate       2026-06-10
amount           86,057c
bank             CIBC
Journal          journal_j13nrcsg1uifz6xl5f8hkyds
```

Read-only production verification confirmed for both:

- exactly one `AccountingProviderPayout` row;
- exactly one active canonical Journal anchor;
- balanced debit = credit;
- `TRANSFER / PAYMENT / accounting.provider_payout.v1`;
- `Dr CIBC BANK / Cr provider PLATFORM_WALLET`;
- exactly one `PROVIDER_PAYOUT_POST` audit;
- June Uber/Fantuan provider statement rows kept their earlier `updatedAt`, so payout posting did not mutate statement facts.

Therefore PAYOUT-C is **PRODUCTION VERIFIED**.

## 11. PAYOUT-D Provider Pending canonical roll-forward

PAYOUT-D is intentionally a read-only Accounting report. It does not attempt a one-to-one match between monthly statement payout totals and bank deposits.

Production Journal composition proves why the roll-forward must use canonical Journal source/fact metadata:

- Clover Pending is currently driven by canonical Order sales/reversals;
- historical Uber Pending includes canonical Order sales that were later neutralized by `accounting.uber_pre_cutover_order_reversal.v1`, after which provider statements became authoritative;
- Fantuan Pending is currently provider-statement-driven;
- actual bank receipts reduce Pending through `accounting.provider_payout.v1`.

The projection is:

```text
Opening Provider Pending
+ canonical Order movement
+ provider Statement movement
+ authority adjustment movement
+ other Journal movement
- actual payout reduction
= Closing Provider Pending
```

For every provider, the projection must satisfy:

```text
arithmeticDeltaCents = 0
```

That invariant demonstrates that the canonical Journal movement is internally explainable. It does **not** claim that the closing amount has been independently confirmed by a bank or provider.

### Movement buckets

- **Canonical Order:** Journal `source = ORDER`, excluding more specific authority buckets.
- **Provider Statement:** `accounting.provider_financial_document.v1` / `PLATFORM_STATEMENT`.
- **Authority adjustment:** currently `accounting.uber_pre_cutover_order_reversal.v1`.
- **Actual payout:** `accounting.provider_payout.v1`.
- **Other:** any remaining Pending Journal movement; this remains visible and raises a warning.

Payout reduction is shown as a positive magnitude in the subtraction term. A payout that increases Pending instead raises `PAYOUT_DIRECTION_UNEXPECTED`.

### Coverage evidence

Provider financial coverage is surfaced independently from the Journal arithmetic:

```text
COMPLETE
INCOMPLETE
UNKNOWN
NOT_APPLICABLE
```

Coverage cannot add, remove or change Journal movement. This prevents incomplete provider evidence metadata from silently changing the accounting balance.

### Warnings

PAYOUT-D surfaces rather than hides:

- `NEGATIVE_PENDING_BALANCE`;
- `OTHER_LEDGER_MOVEMENT_PRESENT`;
- `PAYOUT_DIRECTION_UNEXPECTED`.

A negative Pending balance is not automatically rejected because a real payout can precede delayed provider-statement posting.

Store-scoped reconciliation also fails closed if any active Provider Pending Journal movement in the requested range has no `storeStableId`. Silently omitting an unscoped line would produce a falsely precise per-store closing balance. Production readiness audit on 2026-09-23 found zero active unscoped Clover/Uber/Fantuan Pending Journal lines.

Clover currently has no Provider Financial Document or coverage row in production; its Pending movement is canonical Order-driven. PAYOUT-D therefore reports Clover coverage as `UNKNOWN` rather than assuming `NOT_APPLICABLE`. The coverage label is evidence metadata only and does not affect its Journal roll-forward.

### Transport and UI

Authenticated read-only route:

```text
GET /accounting/provider-pending-reconciliation
```

Inputs:

- `storeStableId` required;
- optional `from` / `to` business dates;
- optional provider filter.

The default range is Accounting start through the current business date. A later `from` date produces a true opening Pending from prior canonical Journal movement.

The Settlements page exposes the reconciliation separately from payout posting and statement replay. The UI states explicitly that an internally balanced roll-forward is not an externally confirmed bank/provider closing balance.

PAYOUT-D adds no schema/migration, provider API, bank import, auto-match, package or cross-context dependency.

## 12. Later slices

After PAYOUT-D production verification:

- **PAYOUT-E (later):** bank CSV/API ingestion and suggested automatic matching;
- a payout reversal/correction slice should be scheduled before an operator needs to amend a posted payout.

Bank import is not required for the first production payout workflow.
