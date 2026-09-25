# Accounting Provider Payout / Bank Receipt Readiness

Date: 2026-09-23  
Baseline: PAYOUT-E-A merged through PR #2490 / squash `1d90e6fd`; Inbox-only evidence workflow merged through PR #2492 / squash `c4324edd`, CI #6229 green; settlement row-decision ownership follow-up merged through PR #2493 / squash `3d20fd4f`, CI #6232 green; PAYOUT-E-B2 merged through PR #2498 / squash `11c80d66`, merged-head CI #6252 green  
Work package: **PAYOUT-E-B2 — confirmed bank row to canonical payout**  
State: **PAYOUT-E-B1 PRODUCTION VERIFIED / PAYOUT-E-B2 PRODUCTION VERIFIED / NO MIGRATION / NO NEW CONTEXT EDGE**

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

At PAYOUT-B merge, the Accounting-local service had no controller, HTTP route or Web UI. Architecture tests pinned `createProviderPayoutJournalInTx()` to exactly one production caller, `AccountingProviderPayoutService`; later PAYOUT-C intentionally added the dedicated payout controller without adding another Journal-writer caller.

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

The user-generated migration was committed as `20260923153202_accounting_provider_payout_persistence` at `dev@da7edc2b`. Review of the complete SQL confirms exactly one additive table, the two expected unique indexes and four lookup indexes. There is no DROP, rename, backfill, enum mutation, relation rewrite or data contraction. The migration has since been applied in production, so both the dev and production PAYOUT-B migration gates are satisfied.

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

- Clover sales Pending is driven by canonical Order sales/reversals and gross bank receipts; Clover statement fees are a separate liability settlement lane and must not reduce sales Pending;
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
- **Provider Statement:** `accounting.provider_financial_document.v1` / `PLATFORM_STATEMENT`. For Clover, only actual Pending movement belongs in this bucket; statement-accrued processing/software/HST costs balance to `account_clover_fee_payable` and therefore stay outside sales Pending.
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

A negative Pending balance is not automatically rejected because a real payout can precede delayed provider-statement posting. However, Clover fee accruals are not a valid explanation for a negative sales Pending balance: real May/June evidence shows gross sales receipts and separate First Data fee debits, so fee liabilities must remain outside the Clover sales Pending roll-forward.

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

### PAYOUT-D production verification

PAYOUT-D merged through PR #2488 / final head `6a3dc03f` / squash `1666b3ed`; CI #6214 passed. Production is now running `main@1666b3ed` with fresh API/Web/worker containers. Nest startup confirms:

```text
GET /api/v1/accounting/provider-pending-reconciliation
```

Post-deploy API/Web error-log scans returned zero matches.

An independent read-only reconstruction for the default Accounting period `2026-06-01..2026-09-23` confirms:

```text
Clover
  canonical Order            +1,229,110c
  Closing Pending             1,229,110c
  arithmetic delta                    0

Uber Eats
  canonical Order              +326,092c
  authority adjustment         -326,092c
  provider Statement           +467,662c
  actual payout                 -28,448c
  Closing Pending               439,214c
  arithmetic delta                    0

Fantuan
  provider Statement         +1,026,733c
  actual payout                 -86,057c
  Closing Pending               940,676c
  arithmetic delta                    0

Aggregate Closing Pending     2,609,000c
Other movement                        0
Active unscoped Pending lines         0
```

This closes the backend/data-path portion of PAYOUT-D production verification. A human operator visual spot-check of the deployed panel/API rendering remains outstanding; there is no accounting-data blocker.

## 12. PAYOUT-E-A bank CSV payout match preview

PAYOUT-E-A deliberately starts with **evidence + suggestions only**. It does not introduce a durable bank-transaction authority or automatically create provider payouts.

### Evidence boundary

The existing Accounting Inbox manual-upload boundary is the **only** file-upload entry for bank CSV evidence:

```text
Accounting Inbox
POST /accounting/inbox/artifacts
        ↓
Accounting SourceArtifact
        ↓
Inbox item classification / review
        ↓
CSV row "Preview bank receipts"
        ↓
GET /accounting/provider-payouts/bank-match-preview
```

The Settlements page must not render either a file input or the bank-match preview. Bank CSV review belongs to the Inbox evidence lifecycle: upload, classify, preview, then mark reviewed. Only after review does the operator continue to Settlements for formal payout posting. This preserves one acquisition path, one canonical SourceArtifact identity and one evidence-review owner.

No second file-storage or bank-import subsystem is created.

Normal bank transaction CSVs do not automatically become provider statements or Expenses:

- provider-financial recognition requires the existing statement-specific recognition phrases;
- structured Expense CSV recognition uses its own expense-oriented schema;
- otherwise the uploaded CSV remains reviewable Accounting evidence.

Manual-upload deduplication deliberately discards a duplicate binary. Bank CSV preview is attached to the current Inbox CSV item rather than a downstream file selector. The preview action is available while a CSV is `OTHER_DOCUMENT` or still `UNKNOWN`; the persisted classification remains `OTHER_DOCUMENT`, whose UI label is now "银行流水 / 其他资料" / "Bank statement / other evidence". Provider-financial and Expense evidence keep their existing review paths.

### Strong bank CSV signature

The parser accepts only bounded CSVs with a strong bank signature.

The production CIBC sample exported for June 2026 establishes CIBC's native CSV as a **headerless four-column format**:

```text
YYYY-MM-DD | Description | Withdrawal | Deposit
```

PAYOUT-E-A recognizes that format only when the first data row has the exact four-column directional shape, a valid date/amount direction, and a CIBC-style transaction-family description such as `Electronic Funds Transfer`, `Branch Transaction`, `Internet Banking`, `Point of Sale - Interac` or `CHEQUE`. This prevents a generic headerless four-column file from being guessed as CIBC.

Headered bank CSVs remain supported when they contain a recognized transaction/posted date column plus one of the explicit directional column pairs:

- `Withdrawals / Deposits`;
- `Funds Out / Funds In`;
- `Money Out / Money In`.

Generic `Date + Amount + Description` and generic `Debit / Credit` files are not treated as bank evidence by this preview.

Only positive inflow rows become deposit candidates. Withdrawals are counted and excluded from payout matching. Malformed dates/amounts or rows containing both inflow and outflow remain visible as invalid evidence rather than being silently dropped. Parser/file bounds fail closed.

### Matching semantics

The operator selects the SanQ store and active CAD BANK account represented by the uploaded statement. E-A compares deposit candidates only with existing `AccountingProviderPayout` rows that are:

- for that exact `storeStableId`;
- for that exact destination BANK stable ID;
- CAD;
- already anchored to a canonical Journal;
- exactly the same amount;
- within a bounded ±3-day payout-date window.

Possible statuses are:

```text
EXACT_EXISTING_PAYOUT
AMBIGUOUS_EXISTING_PAYOUT
POSSIBLE_EXISTING_PAYOUT
UNMATCHED
```

A provider name detected in the bank description is **only a hint**. When a provider hint exists, a same-date/same-amount payout for a contradictory provider cannot be called exact; it remains only a possible candidate. If no provider hint exists, same-date/same-amount may still be exact because the bank evidence itself has not contradicted the existing canonical payout.

The verified June CIBC sample establishes these provider hints:

- Uber EFT descriptions containing `Uber Holdings Canad` / `UBER HOLDINGS CANADA INC` -> `UBER_EATS`;
- `FANTUAN` -> `FANTUAN`;
- deposit descriptions containing `FIRST DATA CANADA(K)` -> `CLOVER`.

The First Data mapping remains a hint, not posting authority.

No status mutates payout, Journal, statement or bank-account persistence.

### Cross-period bank receipts and manual exclusion

A bank receipt date is not itself the provider settlement period. The June CIBC sample contains:

```text
2026-06-02 Uber    26,039c  -> provider settlement week 2026-05-25..2026-05-31
2026-06-03 Fantuan 65,354c  -> provider settlement week 2026-05-25..2026-05-31
```

These rows must remain in immutable June bank evidence while being excluded from a June settlement selection.

PAYOUT-E-A keeps those two responsibilities separate:

- Inbox preview always shows every detected deposit and its existing-payout match status;
- Inbox does **not** expose Include/Exclude because that is a settlement decision, not evidence classification;
- after the CSV is classified as `OTHER_DOCUMENT` and confirmed/reviewed, Settlements may load that reviewed artifact;
- rows with neither a provider hint nor an existing payout candidate start excluded in the Settlements session, keeping ordinary bank deposits such as mobile deposits out of provider settlement by default;
- provider-hinted or candidate-bearing rows start included and may be manually excluded there;
- the original CSV/SourceArtifact is never edited or deleted;
- only an included `UNMATCHED` row with a provider hint may populate the payout-posting form; `EXACT`, `POSSIBLE` and `AMBIGUOUS` rows do not expose a new-post action.

The inclusion/exclusion decision is intentionally session-only in E-A. Persisting a durable bank-row identity plus user-confirmed include/exclude/match decision would create a new Accounting authority and belongs to PAYOUT-E-B.

### Transport and Web

Authenticated read-only preview route:

```text
GET /accounting/provider-payouts/bank-match-preview
```

Inputs:

- `artifactStableId`;
- `storeStableId`;
- `destinationBankAccountStableId`.

The Accounting Inbox adds bank CSV review to the evidence row itself. A CSV classified as `OTHER_DOCUMENT` or still `UNKNOWN` can open the bank-receipt preview, which shows deposit/withdrawal/invalid counts and every exact/ambiguous/possible/unmatched row with existing payout candidates. This Inbox preview is read-only with respect to settlement scope: it has no Include/Exclude controls and tells the operator to classify and mark the evidence reviewed.

Settlements separately reads the existing manual-upload library and admits only retained `CONFIRMED + OTHER_DOCUMENT + CSV` evidence into the settlement-decision surface. There the operator chooses the bank/store context, applies session-only Include/Exclude decisions, and may populate the formal payout form only from an included `UNMATCHED` row with a provider hint. Existing exact/possible/ambiguous candidates cannot create a new payout through this handoff.

The Web characterization test pins this split: Inbox remains the only Accounting file-upload surface and owns evidence preview; Settlements owns settlement Include/Exclude and posting handoff but never uploads evidence.

### Clover fee bank-withdrawal clearing

The same reviewed bank CSV evidence lifecycle now exposes withdrawal rows without changing the provider-payout deposit contract. Deposit matching remains owned by `AccountingProviderPayoutBankRowDecision`; fee withdrawals use a separate Accounting-owned durable decision model so payout semantics stay deposit-only.

Only withdrawal rows whose normalized bank description produces `providerHint=CLOVER` (currently explicit Clover / First Data Canada evidence) are eligible. The operator must explicitly include rows and confirm a durable withdrawal scope. Each confirmed row is fingerprinted against the immutable artifact, store and selected CAD bank account. Reopening reparses the source and fails closed if the row facts no longer match. Cleared rows cannot be excluded or rewritten.

The canonical clearing Journal is strictly:

```text
Dr account_clover_fee_payable
Cr selected CAD BANK
```

It uses source fact `accounting.provider_fee_bank_withdrawal.v1`, is idempotent by durable bank-row decision stable ID, and is written in the same Serializable transaction that transitions the decision from `READY_FOR_CLEARING` to `CLEARED`. The writer verifies current row authority, account class/type/currency/activity, and that the current Clover fee-payable credit balance is at least the withdrawal amount. No ExpenseDocument or expense Journal is created by this clearing path.

This is intentionally separate from statement accrual. Clover statements recognize processing/software/HST economics into `account_clover_fee_payable`; actual CIBC withdrawals clear that liability when cash leaves the bank. For the verified June statement, the 33.90, 1.85 and 3.33 June withdrawals plus the 59.31 July 2 withdrawal together clear the 98.39 payable. The operator remains responsible for selecting only bank withdrawals whose fee accrual is already present; row identity and payable-balance guards prevent duplicate/over-clearing but do not invent a statement-to-bank-row match.

The fee-withdrawal panel now shows the current `account_clover_fee_payable` credit balance from the existing canonical Trial Balance projection and refreshes it after clearing. This is display-only reuse of canonical Journal authority; it does not introduce a parallel balance calculator or a new persistence/read authority.

### PAYOUT-E-A exclusions

Still deferred:

- a persisted canonical bank-transaction model;
- durable bank-row identity across different exports;
- user-confirmed bank-row -> payout relationship persistence;
- auto-creating an unmatched canonical payout;
- bank API/Open Banking ingestion;
- provider payout API ingestion;
- automatic clearing/reconciliation;
- payout reversal/correction.

PAYOUT-E-A adds no Prisma/schema/migration, package dependency, payout/Journal writer, provider/bank API or new context edge.

## 13. PAYOUT-E-B — durable bank reconciliation

### PAYOUT-E-B1 — durable bank row decision authority

E-B1 adds the Accounting-owned persistence layer between immutable bank evidence and the already-frozen provider payout fact. It does **not** redesign `AccountingProviderPayout`, provider statements or the Journal writer.

The durable scope identity is:

`artifactStableId + rowNumber + storeStableId + destinationBankAccountStableId`

The persisted row stores a deterministic `decisionStableId`, parser-bound row fingerprint, normalized date/amount/description/provider hint, operator/time and one decision:

- `EXCLUDED`
- `READY_FOR_POSTING`
- `MATCH_EXISTING_PAYOUT`

The original `AccountingSourceArtifact` remains immutable. Confirmation always reparses the retained reviewed CSV and derives decisions from the current bank-match preview; the browser cannot submit date, amount, provider or match authority. Included `EXACT_EXISTING_PAYOUT` rows become `MATCH_EXISTING_PAYOUT`; included `UNMATCHED` rows require a provider hint and become `READY_FOR_POSTING`; included `POSSIBLE_EXISTING_PAYOUT` or `AMBIGUOUS_EXISTING_PAYOUT` rows fail closed. All non-included deposit rows persist as `EXCLUDED`.

A row fingerprint includes bank parser version plus row number/date/amount/description/provider hint. Reopening the same CSV restores confirmed choices. If parser output or current payout-match semantics no longer agree with the persisted decision, the scope is no longer treated as confirmed and requires explicit reconfirmation.

The UI changes first-load defaults conservatively: for a scope with no durable decisions, only `EXACT_EXISTING_PAYOUT` rows start included; `UNMATCHED`, `POSSIBLE` and `AMBIGUOUS` rows start excluded. The operator must explicitly include the platform receipts intended for this reconciliation and press **Confirm settlement scope**. Changing any checkbox after confirmation makes the scope dirty until reconfirmed.

E-B1 introduces no payout/Journal posting authority. Existing posting handoff is gated behind a confirmed, current `READY_FOR_POSTING` decision, but the final atomic bank-row-decision → payout binding belongs to E-B2.

### PAYOUT-E-B2 — confirmed bank row to canonical payout

E-B2 binds a `READY_FOR_POSTING` bank-row decision to exactly one canonical `AccountingProviderPayout` in the same Accounting Serializable transaction, derives the idempotent payout identity as `payout_<decisionStableId>`, and transitions the durable decision to `MATCH_EXISTING_PAYOUT`. The HTTP command accepts only `decisionStableId`; provider/date/amount/store/bank authority is re-derived from the persisted Accounting-owned decision rather than trusted from browser form values.

The existing manual `POST /accounting/provider-payouts` path remains unchanged for manually evidenced payouts. The bank-row workflow uses `POST /accounting/provider-payouts/from-bank-row-decision`; replay of an already matched decision returns its anchored payout without creating another payout or Journal. Before a READY decision enters the writer, the E-B1 owner reparses/reprojects its current scope and requires the scope to remain confirmed and the row to remain `READY_FOR_POSTING`. If an exact canonical payout appears after that preflight but before the Accounting transaction completes, E-B2 fails closed and requires explicit scope reconfirmation rather than silently binding or creating a duplicate. Non-READY/non-MATCHED decisions fail closed. Payout creation, canonical Journal anchoring, row-decision transition and both audit writes share the same Accounting transaction.

The reviewed-bank Settlements UI now invokes that existing command directly on each confirmed `READY_FOR_POSTING` row through **Confirm posting / 确认入账**. It no longer copies bank-row facts into the manual Provider bank receipts form. The manual form remains available for separately evidenced payouts that do not originate from a durable bank-row decision; bank-row posting authority remains server-owned and accepts only `decisionStableId`.

**2026-09-23 production state:** **PRODUCTION VERIFIED / NO MIGRATION / NO DEPENDENCY CHANGE / NO GRAPH CHANGE** through PR #2498 / squash `11c80d66`; merged-head CI #6252 passed API/Web architecture, lint, build, strict and test gates, and production `main@11c80d66` is running the route with healthy API/Web containers and no post-deploy API/Web error scan findings.

Live verification confirmed the durable settlement-scope transition first: the reviewed June bank CSV confirmation returned 201 and produced five real `READY_FOR_POSTING` rows. The operator then posted all five through `POST /accounting/provider-payouts/from-bank-row-decision`: Uber Eats 44,190c (2026-06-16), Fantuan 45,536c (2026-06-17), Uber Eats 29,828c (2026-06-23), Fantuan 77,093c (2026-06-24), and Uber Eats 16,551c (2026-06-30). Each request returned 201 and produced exactly one deterministic `payout_<decisionStableId>`, exactly one active canonical `TRANSFER / PAYMENT / accounting.provider_payout.v1` Journal, exactly one `PROVIDER_PAYOUT_POST` audit and exactly one `PROVIDER_PAYOUT_BANK_ROW_DECISION_BIND` audit. Every Journal is balanced and posts `Dr CIBC / Cr provider Pending` for the exact bank-row amount; every decision is now `MATCH_EXISTING_PAYOUT` bound to that deterministic payout.

June Provider Pending reconciliation remains coherent from the configured 2026-06-01 accounting start. Uber opening is 0; Order +235,521c and authority adjustment -235,521c cancel, provider statement contributes +122,285c, total June payout reduction is 119,017c, and closing Pending is 3,268c. Fantuan opening is 0; provider statement contributes +292,539c, total June payout reduction is 208,686c, and closing Pending is 83,853c. These figures contain no unexplained `OTHER` movement in the audited buckets and preserve the reconciliation arithmetic invariant.

E-B2 production verification removes the prior gate on follow-on design work, but automatic bank ingestion/auto-posting remains a separate architecture decision rather than an implied next step.
