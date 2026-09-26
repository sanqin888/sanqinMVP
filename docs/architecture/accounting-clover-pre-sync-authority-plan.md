# Accounting Clover Pre-Sync Financial Authority Plan

Status: **SLICE A PRODUCTION VERIFIED / CLOSED / READ-ONLY AUTHORITY SHADOW**  
Date: 2026-09-26  
Scope: SanQ Accounting start **2026-06-01** through the future production POS-Clover Unified Payment cutover.

## 1. Why this plan exists

Before POS-Clover Terminal synchronization becomes the production CARD path, SanQ POS and the
physical Clover terminal are operationally separate. The POS operator records the Order and selects
a payment method, while Clover independently owns the actual card charge, customer tip and
provider-applied surcharge.

That means a pre-sync `Order.paymentMethod=CARD` is useful operating evidence, but it is not
provider-authoritative evidence of the amount Clover actually collected. In particular:

- SanQ historical Orders do not contain Clover customer tips;
- SanQ historical Orders do not contain Clover-applied surcharge;
- operator-selected CARD does not prove a one-to-one Clover payment;
- provider batch boundaries do not equal a simple calendar-month Order filter.

Therefore pre-sync Clover receivable / Provider Pending must not be anchored to Order tender
attribution.

## 2. Real evidence already verified

### June 2026 legacy statement + Closeout reports

The June Clover statement is the legacy layout. It reports:

- statement period: 2026-06-01 through 2026-06-30;
- Amount Submitted: **336,210c / $3,362.10**;
- Service Charges: **-6,264c / -$62.64**;
- Fees: **-3,575c / -$35.75**;
- Amount Funded control: **326,371c / $3,263.71**.

Gmail Closeout Reports from `app@clover.com` were independently summed. Production Gmail
acquisition on 2026-09-26 materialized **27 actual provider batches** spanning **2026-05-29 through
2026-06-28**. There are no Closeout batches on 2026-06-01/08/15/22 because the store had no
Clover activity on those closed Mondays; those zero-activity dates are not missing provider
evidence. The observed batch sequence closes exactly to the June statement:

- Sales count: **180**;
- Sales total: **336,210c / $3,362.10**;
- Refunds: **0**;
- Tips count: **47**;
- Tips total: **9,896c / $98.96**.

The old June statement does **not** expose a `Surcharge Collected` field. Its
`DISCOUNT FEES` / Visa / MasterCard costs are merchant processing charges, not customer
surcharge. For example, the old statement's `DISCOUNT FEES` total **$59.31** is composed from
merchant discount-fee rows including Visa **$37.95**, MasterCard **$19.89**, Visa Debit **$0.53**
and MC Debit **$0.94**. The legacy statement itself therefore cannot supply June customer surcharge
authority, and surcharge must never be inferred from processing cost. A later Clover Dashboard Sales
Report downloaded on 2026-09-26 supplies separate provider evidence for the post-Accounting-start
June window; Slice D accepts that surcharge only after exact Closeout controls reconcile.

### July 2026 modern statement + Closeout reports

The modern July statement reports:

- Amount Submitted: **350,132c / $3,501.32**;
- transaction count: **230**;
- Surcharge Collected: **5,551c / $55.51**;
- Visa surcharge: **$35.89**;
- MasterCard surcharge: **$19.62**.

Gmail Closeout Reports for **2026-06-30 through 2026-07-30** close exactly to the same statement
principal:

- Sales count: **230**;
- Sales total: **350,132c / $3,501.32**;
- Refunds: **0**;
- Tips count: **43**;
- Tips total: **7,207c / $72.07**.

This proves that statement coverage must be derived from provider batch evidence, not assumed from
calendar-month Closeout dates or from calendar-day continuity. A date with no provider batch may be
a legitimate zero-activity date; coverage completeness is established by the ordered provider batch
sequence closing the statement principal and any available transaction/refund controls.

### Surcharge versus merchant processing cost

Customer surcharge and merchant processing cost are separate facts.

For July:

- customer `Surcharge Collected`: **$55.51**;
- merchant `DISCOUNT FEES`: **$58.47**.

For August:

- customer `Surcharge Collected`: **$62.52**;
- merchant `DISCOUNT FEES`: **$64.05**.

Accounting must never substitute one for the other.

## 3. Frozen pre-sync authority matrix

From Accounting start 2026-06-01 until the durable Clover payment-fact cutover:

| Fact | Authority |
| --- | --- |
| Clover submitted / provider receivable principal | **Daily Closeout + Monthly Statement control** |
| Clover batch date / batch ID / count | **Daily Closeout** |
| Clover tips | **Daily Closeout** |
| Clover surcharge | **Monthly Statement when explicitly disclosed; otherwise UNKNOWN** |
| Clover refunds | **Daily Closeout, controlled by statement where available** |
| Clover processing / network / equipment fees | **Monthly Statement** |
| Clover actual bank receipt | **Reviewed CIBC bank evidence** |
| Clover fee withdrawal | **Reviewed CIBC bank evidence against Clover Fee Payable** |
| Product sales / discounts / HST / promotions / loyalty facts | **SanQ canonical Order / Sales Journal facts** |
| Historical `Order.paymentMethod=CARD` tender attribution | **Supporting evidence only; not Clover Pending authority** |

The distinction is intentional: Orders remain authoritative for SanQ's sale economics, but they do
not own pre-sync Clover tender truth.

## 4. Amount composition invariant

Closeout `Sales` / statement `Amount Submitted` is the provider receivable principal control.
Tips and surcharge are composition evidence inside that provider activity unless the provider
contract explicitly proves otherwise.

Do **not** calculate:

```text
Clover Pending = Amount Submitted + Tips + Surcharge
```

when Closeout Sales already reconciles to statement Amount Submitted.

Instead the required invariant is:

```text
SUM(Closeout Sales in statement-covered batches)
= Monthly Statement Amount Submitted
```

Tips and surcharge then explain components of the same provider-authoritative activity. They may be
used for revenue classification only when their provider evidence is explicit.

## 5. Cutover semantics

### 5.1 Runtime feature flag is not the Accounting clock

`POS_CLOVER_TERMINAL_PAYMENT_ENABLED` remains the migration-time route switch:

```text
false -> legacy direct-paid CARD
true  -> Unified Payment Core + Clover Terminal
```

Accounting must **not** read its current value dynamically to reinterpret history. The flag is
explicitly temporary and is scheduled for removal when the legacy CARD route is retired. It can
also be cut back operationally after an incident, while accounting history must remain stable.

### 5.2 Durable payment-fact cutover

The production go-live event should establish an Accounting-owned durable timestamp, provisionally
named:

`providerPaymentFactCutoverAt`

For Clover:

```text
2026-06-01 <= fact time < providerPaymentFactCutoverAt
    -> Closeout / Monthly Statement provider authority

fact time >= providerPaymentFactCutoverAt
    -> Payments-owned canonical Clover facts authority
```

The rollout flag may be the operator signal that accompanies this one-time cutover, but the
Accounting timestamp is the durable financial fact.

Do not reuse `liveOrderFactCutoverAt` for this purpose. That field means live **Order fact**
authority for statement-based providers; Clover is changing from provider-document authority to
Payments-owned payment authority, not to Order authority.

Changing this persisted contract is expected to require a Prisma schema change and migration. That
is a later implementation slice and must follow the repository migration gate.

### 5.3 Cutback after production cutover

A later temporary rollback of the POS feature flag must not move the durable Accounting cutover
backward. Post-cutover CARD activity that lacks required Payments-owned canonical facts must fail
closed for automatic Clover settlement authority and surface as reconciliation evidence requiring
explicit handling.

## 6. Historical Journal remediation rule

Existing pre-sync Order-derived Clover Pending Journals are historical audit evidence and must not
be deleted or rewritten.

The later remediation must use deterministic compensating authority-adjustment Journals to:

1. neutralize only the pre-sync Order-derived Clover tender/Pending authority;
2. preserve the original Sales / HST / discount economics;
3. establish provider-authoritative Clover receivable from Closeout + statement controls;
4. classify provider-proven Tips and Surcharge without guessing missing components;
5. keep actual bank receipts clearing Clover Pending through the existing payout path;
6. keep provider fees and bank fee withdrawals on the separate Clover Fee Payable lane.

The exact balanced correction Journal contract is **not frozen yet**. It must be designed only
after the shadow projection proves June and July coverage and identifies all affected historical
Order-derived Pending movements.

## 7. Existing parser / acquisition baseline

The repository already has a Clover `BATCH_CONTROL` parser for Closeout Report text. It recognizes
Batch ID, business date, Sales, Refunds, Net, Tax and Tips, and currently marks those components as
reconciliation-only.

Accounting Inbox already owns Gmail evidence acquisition. The next implementation should reuse
those owners rather than introduce a new Clover-email subsystem.

Monthly statement parsing remains the statement/control owner. Modern statements additionally
expose explicit surcharge evidence; legacy statements may not.

## 8. Implementation slices

### Slice A — Pre-Sync Authority Contract + Shadow Coverage

**Implementation state (2026-09-26): PRODUCTION VERIFIED / CLOSED.** Slice A merged through
PR #2547 / squash `d68cc317`; the zero-activity batch-gap correction merged through PR #2549 /
squash `b7a01075`, with CI #6419 green. Production runs `main@b7a01075`. Gmail acquisition
materialized 113 unique Clover `BATCH_CONTROL` documents, all parser v9 `SUCCESS`, with zero
conflicting Batch IDs. The authenticated production shadow route returned HTTP 200, and read-only
production re-evaluation found exactly one principal-closing provider-batch sequence for June and
exactly one for July. No Journal entry was created by deployment or shadow verification. Neither
Slice A nor its follow-up adds a Prisma migration, cutover timestamp, historical correction or
Journal mutation.

No Journal mutation.

- recognize/materialize Gmail Clover Closeout Reports durably;
- enforce Batch ID idempotency;
- project statement-to-Closeout coverage windows;
- require Closeout Sales/count/refund controls to reconcile to statement principal;
- expose Tips and explicit statement surcharge as composition evidence;
- compare Order CARD facts only as diagnostics;
- prove June and July end-to-end from 2026-06-01 coverage.

The implementation keeps the existing Human Review effective snapshot/correction semantics for
statement evidence and requires exact Clover sender + Closeout subject + complete Batch Totals
controls before automatic Closeout materialization. Coverage candidates must share the statement's
existing Clover merchant reference, preserve the observed provider-batch order and overlap its
provider period, but are not forced into calendar-month or calendar-day-continuity boundaries.
Missing calendar dates do not fail coverage by themselves; missing provider evidence still fails
closed when no exact principal/control closure can be found.

Characterization source now pins the production-shaped June
`2026-05-29..2026-06-28 / 27 batches / 180 / 336210c / Tips 9896c / Refund 0 / surcharge UNKNOWN`
with the four zero-activity Mondays omitted, and July
`2026-06-30..2026-07-30 / 31 batches / 230 / 350132c / Tips 7207c / Refund 0 / explicit surcharge 5551c`.
It also preserves fail-closed behavior when missing provider evidence prevents principal closure,
on duplicate Batch IDs, ambiguity and statement count/refund mismatches. The shadow endpoint is
`GET /accounting/report/clover-pre-sync-authority-shadow?storeStableId=...`; Order CARD
comparison is returned under an explicit `NON_AUTHORITATIVE` diagnostic contract.

Exit gate is satisfied. Production June closes uniquely over 27 observed batches spanning
2026-05-29..2026-06-28 to 336,210c / 180 sales / 9,896c Tips / 0 refunds with surcharge remaining
`UNKNOWN`; production July closes uniquely over 31 observed batches spanning
2026-06-30..2026-07-30 to 350,132c / 230 sales / 7,207c Tips / 0 refunds with explicit surcharge
5,551c. The authenticated production shadow route returned HTTP 200 after deployment of
`b7a01075`, and zero new Accounting Journal entries were observed after the verification request.
Slice A is therefore **PRODUCTION VERIFIED / CLOSED**.

### Slice B — Durable Clover payment-fact cutover contract

**Implementation state (2026-09-26): SOURCE + USER-GENERATED ADDITIVE MIGRATION MERGED TO DEV /
CI GREEN / CUTOVER NOT SET.**

The source change is deliberately contract-only:

- `AccountingProviderFinancialCoverage` gains nullable `providerPaymentFactCutoverAt`; it is
  distinct from `liveOrderFactCutoverAt`, which continues to mean live Order-fact authority for
  statement-based providers;
- the existing Accounting-owned coverage service is the only write boundary. For Clover it permits
  only `null -> timestamp`; replaying the exact persisted timestamp is idempotent, while moving,
  clearing or rewriting an established cutover is rejected;
- coverage readers expose the durable value independently of the POS rollout flag;
- the authority policy freezes the read semantics: before the durable timestamp, provider documents
  remain authority; at/after the timestamp, Payments canonical facts are required; a missing
  canonical Payment fact is explicitly blocked rather than falling back to Order CARD or provider
  document guessing;
- an architecture guard keeps `POS_CLOVER_TERMINAL_PAYMENT_ENABLED` out of Accounting production
  authority code.

There is intentionally **no controller, startup hook, feature-flag listener or production go-live
caller** in Slice B, and an architecture guard pins the production caller set to empty. The new
field is also kept out of the existing provider-settlement preview/write-authority payload so the
current replay `planHash` contract is unchanged. Therefore this source cannot record a production
timestamp merely by being deployed and does not perturb current settlement replay semantics. The
actual go-live procedure remains a later explicitly controlled operation after the companion
additive migration and Slice E readiness gates are satisfied.

The schema change is now paired with user-generated migration
`20260926064114_accounting_clover_payment_fact_cutover_contract` on `dev@459034c2`. Review
confirmed the SQL is additive-only: one nullable `TIMESTAMP(3)` column, with no default, backfill,
DROP, constraint tightening or data rewrite. CI #6431 and #6432 are green. The migration contract is
therefore ready for normal future promotion, but the production cutover timestamp itself remains
unset and Slice E remains a hard go-live gate.

Readiness remains intentionally incomplete for real cutover: `PaymentFinancialFactV1` and
`PaymentTransaction` still have no independent provider-proven `tipCents`, and the 2026-09-26
production read-only check found zero `PaymentTransaction` rows. Slice E therefore remains a hard
pre-cutover gate; Slice B does not switch settlement/posting authority by itself.

### Slice C — Historical authority-replacement preview

**Implementation state (2026-09-26): LOCAL SOURCE READY FOR REVIEW / READ-ONLY / NO POSTING /
NO SCHEMA OR MIGRATION CHANGE.**

The preview reuses the closed Slice A authority projection rather than reopening parser ownership.
For each closed statement-controlled provider batch sequence it:

- truncates provider evidence at the Accounting start boundary before any remediation math;
- anchors historical Order-derived Clover Pending to the immutable Journal entries that actually
  moved `account_clover_pending`;
- compares the provider-authoritative principal with the net Order-derived Pending movement;
- separately recognizes provider-proven Tips and explicit statement surcharge that are absent from
  Order economics;
- derives only the aggregate Store Cash ↔ Clover Pending tender reclassification needed to balance
  the provider authority replacement, without transaction-by-transaction matching;
- emits a deterministic balanced draft Journal only when every required component has authority;
- projects the resulting Clover Pending roll-forward without writing any Journal;
- hashes the complete evidence/proposal report for human review.

Production read-only readiness established an important start-boundary fact: the 2026-06-01 CIBC
Clover deposit is 47,922c and is deliberately `EXCLUDED` from canonical payout posting. It equals
the 2026-05-29/30/31 Closeout Sales exactly
(`20,098 + 11,404 + 16,420 = 47,922`). Those provider batches predate the 2026-06-01 Accounting
start, so neither that deposit nor those batches belong in historical remediation.

The current production-shaped preview math is:

- June in-scope provider batches are 2026-06-02..2026-06-28: provider principal 288,288c,
  provider-proven Tips 8,343c, net Order-derived Clover Pending 275,425c, therefore Pending authority
  delta +12,863c. The Clover Dashboard Sales Report downloaded 2026-09-26 reports 157 transactions,
  288,288c Amount Collected, 8,343c Tips, 4,918c Surcharges and 0 refunds; Jun 1 and Jun 29 are zero.
  Those controls match the 24 selected post-start Closeouts exactly, including daily Amount Collected.
  June can therefore use 4,918c explicit surcharge evidence and the balanced correction becomes
  +12,863c Clover Pending, +398c Store Cash debit, +8,343c Tip revenue and +4,918c surcharge revenue.
- July provider batches are 2026-06-30..2026-07-30: provider principal 350,132c, Tips 7,207c,
  explicit surcharge 5,551c and net Order-derived Clover Pending 318,807c. The deterministic
  balanced preview is +31,325c Clover Pending, -18,567c Store Cash, +7,207c Tip revenue and +5,551c
  card-surcharge revenue. Both periods can now be `READY` for human review with provider-explicit
  surcharge authority: June from Sales Report controls, July from the Monthly Statement.
- The Pending roll-forward independently closes: June's actual 6/28 closing is +30,596c; after the
  proposed +12,863c authority adjustment it becomes +43,459c, exactly cleared by the canonical
  2026-06-29 Clover payout of 43,459c. July therefore opens at provider-authoritative 0c. July's
  actual period movement is -27,793c; adding the +31,325c proposal leaves +3,532c at 2026-07-30,
  exactly matching the next canonical 2026-07-31 Clover payout of 3,532c.

The route is `GET /accounting/report/clover-authority-replacement-preview?storeStableId=...`.
Slice C itself remains the merged read-only baseline. Slice D is now **LOCAL SOURCE READY FOR REVIEW /
NO SCHEMA / NO MIGRATION / NO PRODUCTION WRITE** and adds the separately authorized write gate at
`POST /accounting/journal/clover-authority-replacement`.

### Slice D — Historical correction posting + reconciliation UI

**Implementation state (2026-09-26): LOCAL SOURCE READY FOR REVIEW / NO SCHEMA / NO MIGRATION /
NO PRODUCTION WRITE.**

- the legacy June Statement remains unchanged and still has no surcharge field; Slice D separately
  accepts a Clover Dashboard Sales Report as supplemental provider evidence only when its transaction
  count, Amount Collected, Tips, refunds and every daily Amount Collected value exactly match the
  selected post-start Closeouts;
- the verified June report supplies 4,918c surcharge, producing +12,863c Clover Pending, +398c Store
  Cash debit, +8,343c Tips and +4,918c surcharge revenue; no historical-unclassified account is needed;
- July preserves the provider-proven 18,567c Store Cash credit reclassification, 7,207c Tips and
  5,551c surcharge from the Monthly Statement;
- real posting requires a fresh deterministic plan hash and authenticated operator identity, writes
  compensating Journals without changing old Journals, and immediately re-reads the preview;
- posted source facts become `ALREADY_POSTED`, so a fresh UI does not offer a second write;
- the Accounting settlements UI displays the surcharge evidence source (Sales Report vs Statement),
  Pending roll-forward, draft lines and a strong confirmation gate before the real POST.

### Slice E — Post-cutover Payment fact completeness

Before production POS-Clover Sync becomes permanent:

- canonical Clover payment facts must include provider-proven charged total;
- provider-proven surcharge must remain read, never calculated by SanQ;
- provider-proven tip must be represented explicitly;
- refund/reversal facts must preserve the same authority;
- Monthly Statement / Closeout becomes control/reconciliation evidence after cutover.

#### Slice E1 — Sale fact completeness

**Implementation state (2026-09-26): SOURCE + USER-GENERATED ADDITIVE MIGRATION ON DEV /
CI GREEN / NO CUTOVER / WEB ECOMMERCE UNCHANGED.**

Source merged through PR #2556 / squash `ae6420fc`; user-generated migration
`20260926132951_add_payment_transaction_tip_cents` is on `dev@656265d0`. Migration review confirms
one nullable `INTEGER` column only, with no default/backfill/NOT NULL/DROP/constraint tightening/data
rewrite. CI #6448 passed Architecture, API, Web, printer-agent and Windows workstation.

Readiness audit against the latest `dev` and production evidence confirmed this is a Payments-owned
fact-loss problem rather than an Accounting parser problem. The June 2026 six-page Clover statement
contains no explicit surcharge field in persisted Poppler extraction geometry, and the June
Closeouts also expose no surcharge field. Accounting therefore continues to fail closed instead of
deriving June surcharge from fees, pricing rates or residual arithmetic.

For post-cutover Unified POS payments, Platform v3 exposes provider `tipAmount` separately from the
base payment `amount` and `additionalCharges`. E1 therefore:

- adds nullable `PaymentTransaction.tipCents` as a provider observation;
- carries `tipCents` through the Payments domain and `PaymentFinancialFactV1`;
- reads Platform v3 `tipAmount` and fails closed when it is absent/invalid;
- defines canonical customer charged total as provider base amount + provider tip + all provider
  additional charges;
- keeps `CREDIT_SURCHARGE` separately provider-read and never fixed-rate inferred;
- requires canonical tip/surcharge/charged-total evidence before a Clover POS Terminal success may
  finalize;
- leaves production Web Clover Ecommerce behavior unchanged;
- does not set `providerPaymentFactCutoverAt`, post Journals, or alter Accounting authority.

Existing rows remain representable as `tipCents = null`; no backfill or guessed historical tip is
permitted.

#### Slice E2 — Reversal fact completeness

**Implementation state (2026-09-26): MERGED TO DEV / CI #6449 GREEN / NO NEW SCHEMA / NO MIGRATION /
NO CUTOVER / WEB ECOMMERCE UNCHANGED.**

E2 merged through PR #2557 / head `7bf25b71` / squash `8bb86e42`; CI #6449 passed.

E2 stays inside the existing Payments owner and POS payment orchestration boundary. Readiness audit
found one direct E1 follow-up bug: the POS full-refund coordinator still calculated
`chargedTotalCents - amountCents` as additional charges, but after E1 that delta contains both tip and
additional charges. A tipped refund would therefore misclassify tip as surcharge/additional charge and
fail canonical reconciliation.

E2 contracts the reversal facts explicitly:

- full managed POS reversal requires the original canonical sale to have provider-proven `tipCents`;
- expected tip refund is the immutable original canonical provider tip, not a rate/residual inference;
- expected additional-charge refund is `chargedTotal - base - tip`;
- Platform v3 refund reconciliation reads provider `refund.tipAmount` and fails closed on missing or
  mismatched tip;
- Platform v3 void reconciliation reads the canonical payment `tipAmount` and applies the same strict
  match;
- managed reversal `PaymentTransaction.tipCents` stores the provider-proven refunded tip, reusing the
  E1 column with no new schema;
- `PaymentReversalFinancialFactV1` exposes nullable `tipRefundCents` independently from
  `additionalChargeRefundCents` and customer refund total;
- external provider-webhook reverse-sync keeps `tipRefundCents = null` when the webhook does not prove
  tip, so Accounting continues to fail closed instead of copying the original sale tip;
- Accounting read-only canonical-change preview includes the new tip-refund evidence, but Journal
  posting policy is not redesigned in E2.

The current managed caller remains the POS full-order refund/void path. E2 does not introduce partial
refund tip allocation rules and does not change production Web Clover Ecommerce refund behavior.

#### Slice E3 — Durable cutover scope readiness audit

**Implementation state (2026-09-26): OPTION A SELECTED / PROVIDER-WIDE CUTOVER RETAINED /
DOCS ONLY / NO SOURCE CHANGE / NO CUTOVER.**

The post-E2 audit found a contract-scope mismatch that must be resolved before adding a readiness
endpoint or any production caller for `recordProviderPaymentFactCutover()`:

- `AccountingProviderFinancialCoverage.providerPaymentFactCutoverAt` is persisted only by
  `provider + storeStableId`; it has no payment-source / POS-only dimension;
- the frozen authority rule currently says every Clover fact at/after the timestamp uses
  Payments-owned canonical facts, and missing canonical facts fail closed;
- production Web Clover remains intentionally frozen on the legacy `/v1/charges` path and does not
  yet use the Unified Payment transaction/fact pipeline;
- therefore recording the current provider-wide timestamp at POS go-live would also move post-cutover
  Web Clover money into Payments authority even though the Web path is not yet producing the required
  canonical facts.

The operator selected **Option A**: keep `providerPaymentFactCutoverAt` provider-wide and do **not**
record it until Web Ecommerce is also migrated/accepted onto canonical Unified Payments facts. POS may
go live operationally first, but Accounting continues provider-document authority until that later
provider-wide financial cutover. No source-scoped persisted cutover mechanism will be introduced.

No readiness route, writer caller, feature-flag listener or cutover mutation is added by this audit;
the timestamp remains unset.

## 9. Safety / non-goals

This plan does not:

- reopen Phase 9;
- redesign Journal double-entry;
- change production Web Clover Ecommerce;
- delete historical Orders or Journals;
- infer unknown surcharge from merchant processing fees;
- infer Tips from residual differences;
- require transaction-by-transaction historical Order matching as a posting prerequisite;
- allow current runtime feature-flag state to rewrite prior financial authority.

## 10. Current readiness

State:

**SLICE A PRODUCTION VERIFIED / CLOSED**  
**HISTORICAL JOURNAL CORRECTION LOCAL SOURCE READY FOR REVIEW / NO PRODUCTION WRITE**  
**SLICE B SOURCE + ADDITIVE MIGRATION MERGED TO DEV / CI GREEN / PRODUCTION CUTOVER NOT SET**  
**SLICE C MERGED TO DEV / CI #6439 GREEN / READ-ONLY BASELINE**  
**SLICE D LOCAL SOURCE READY FOR REVIEW / JUNE SALES REPORT SURCHARGE AUTHORITY / NO MIGRATION / NO PRODUCTION WRITE**  
**SLICE E1 SOURCE + USER-GENERATED ADDITIVE MIGRATION ON DEV / CI #6448 GREEN / NO CUTOVER**  
**SLICE E2 MERGED TO DEV / CI #6449 GREEN / NO NEW MIGRATION / NO CUTOVER**  
**SLICE E3 OPTION A SELECTED / PROVIDER-WIDE CUTOVER RETAINED / TIMESTAMP UNSET**
