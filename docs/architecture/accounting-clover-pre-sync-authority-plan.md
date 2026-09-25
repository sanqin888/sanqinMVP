# Accounting Clover Pre-Sync Financial Authority Plan

Status: **DESIGN FROZEN FOR READINESS / NO JOURNAL MUTATION YET**  
Date: 2026-09-25  
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

Gmail Closeout Reports from `app@clover.com` were independently summed. The contiguous provider
batch window **2026-05-29 through 2026-06-28** closes exactly to the June statement:

- Sales count: **180**;
- Sales total: **336,210c / $3,362.10**;
- Refunds: **0**;
- Tips count: **47**;
- Tips total: **9,896c / $98.96**.

The old June statement does **not** expose a `Surcharge Collected` field. Its
`DISCOUNT FEES` / Visa / MasterCard costs are merchant processing charges, not customer
surcharge. For example, the old statement's `DISCOUNT FEES` total **$59.31** is composed from
merchant discount-fee rows including Visa **$37.95**, MasterCard **$19.89**, Visa Debit **$0.53**
and MC Debit **$0.94**. Historical June customer surcharge is therefore **UNKNOWN unless separate
provider evidence proves it**; it must not be inferred from processing cost.

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
calendar-month Closeout dates.

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

No Journal mutation.

- recognize/materialize Gmail Clover Closeout Reports durably;
- enforce Batch ID idempotency;
- project statement-to-Closeout coverage windows;
- require Closeout Sales/count/refund controls to reconcile to statement principal;
- expose Tips and explicit statement surcharge as composition evidence;
- compare Order CARD facts only as diagnostics;
- prove June and July end-to-end from 2026-06-01 coverage.

Exit gate: June and July provider principal must close exactly with no inferred surcharge.

### Slice B — Durable Clover payment-fact cutover contract

Expected schema change / migration.

- add the durable payment-fact cutover timestamp to the appropriate Accounting coverage contract;
- define one-way/controlled update semantics;
- explicitly separate it from `liveOrderFactCutoverAt`;
- connect production POS-Clover go-live procedure to recording this Accounting fact;
- do not make current feature-flag state a report input.

### Slice C — Historical authority-replacement preview

No posting initially.

- enumerate pre-sync Order-derived Clover Pending movement from 2026-06-01;
- generate deterministic proposed compensating adjustments;
- show resulting Closeout/statement-authoritative Pending roll-forward;
- require human review and plan hash;
- fail closed on missing Closeout coverage or ambiguous provider periods.

### Slice D — Historical correction posting + reconciliation UI

Only after Slice C is approved and verified.

- post compensating authority adjustments idempotently;
- preserve historical Journals;
- show provider-document authority separately from Order diagnostics;
- remove misleading interpretation of negative Clover Pending as money owed to Clover.

### Slice E — Post-cutover Payment fact completeness

Before production POS-Clover Sync becomes permanent:

- canonical Clover payment facts must include provider-proven charged total;
- provider-proven surcharge must remain read, never calculated by SanQ;
- provider-proven tip must be represented explicitly;
- refund/reversal facts must preserve the same authority;
- Monthly Statement / Closeout becomes control/reconciliation evidence after cutover.

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

**READY FOR SLICE A READ-ONLY AUTHORITY/COVERAGE IMPLEMENTATION**  
**NOT READY FOR HISTORICAL JOURNAL CORRECTION**  
**SLICE B WILL REQUIRE SCHEMA/MIGRATION AUTHORIZATION AT IMPLEMENTATION TIME**
