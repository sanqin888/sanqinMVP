# Phase 9 Payroll Vertical — Readiness, Design and Closeout Gate

Status: **DESIGN / INSERTION DECISION APPROVED — SOURCE IMPLEMENTATION NOT STARTED**  
Planning date: 2026-09-16  
Implementation branch: `docs/phase9-payroll-design`

## 1. Decision and insertion point

Payroll should be added as a dedicated Accounting-adjacent vertical **before Phase 9 closeout**, but only after the current settlement/reconciliation and remaining Accounting boundary work has stabilized.

Approved Phase 9 order:

1. Slice 6 — provider settlement/reconciliation closure
2. Slice 7 — stable-ID / Prisma contract contraction
3. Slice 8A — Accounting internal capability split / backend vertical cleanup
4. **Slice 8P — Payroll vertical**
5. Slice 8B — Accounting Web vertical-contract cleanup
6. Phase 9 final closeout audit / deployment / production verification

Payroll is intentionally inserted after 8A so it can target the final Accounting internal boundaries instead of being built on transitional services, and before 8B so the final Web contract cleanup can include Payroll as a first-class Accounting surface rather than adding a second UI-contract refactor later.

## 2. Ownership boundary

Payroll is **not** an `AccountingExpenseDocument` subtype and must not be modeled as a generic manual expense. It is also not a resurrection of the legacy `AccountingTransaction` revenue/expense writer.

Target ownership:

- Payroll owns employees, pay periods, calculation inputs, statutory calculation evidence, pay statements, payroll run state and payroll-specific remittance facts.
- Accounting owns the double-entry Journal, Chart of Accounts, period lock, audit and financial reporting.
- Payroll posts only through the existing Accounting Journal write boundary; it must not introduce a parallel ledger.
- `expense_labor` / labour categories may remain reporting dimensions, but they are not the payroll source of truth.
- Payroll must not read/write Staff/Auth persistence as its employee master. A payroll employee is a separate business identity.

Recommended core identity:

`PayrollEmployee`

with its own stable ID and an **optional** `userStableId` link when the employee is also a SanQ login user. Staff role, Admin access and Payroll employment are independent concepts.

## 3. MVP user workflow

The primary operator workflow should support the user's requested flow:

1. choose or create an employee;
2. enter pay-period start/end and pay date;
3. enter hourly rate and hours for the period;
4. backend calculates statutory deductions/contributions and employer payroll cost;
5. operator reviews the calculation;
6. finalize the PayrollRun;
7. generate/download/print a pay-statement PDF;
8. expose the amounts required for employee payment and CRA remittance;
9. post the approved payroll facts to the Accounting Journal through guarded/idempotent write authority.

For hourly payroll, the system must **not infer weekly overtime from one aggregate monthly/biweekly hour total**. Until a real timesheet/week-level source exists, regular hours and overtime hours/rate treatment must be explicit operator inputs or derived from a separately reviewed weekly-timesheet capability.

## 4. Payroll employee configuration

Minimum employee/payroll configuration should include:

- employee stable ID;
- legal/display name used on pay statements;
- optional linked `userStableId`;
- active/inactive employment state;
- province of employment;
- pay frequency;
- default hourly rate;
- statutory calculation/exemption settings required by the supported CRA calculation path;
- vacation-pay policy/treatment;
- effective-date/version history for settings that affect payroll calculation.

The first implementation should be **Ontario-first** and fail closed for unsupported jurisdictions or incomplete statutory configuration rather than silently applying Ontario defaults to another province.

Sensitive payroll identity/tax data must not be added casually to general Staff/User tables. Any later SIN/T4-specific persistence requires a separate privacy/security design review.

## 5. Calculation model

A finalized PayrollRun must persist the inputs and the exact versioned calculation output used for that pay date. Recalculating an old run with today's rates must never silently change historical payroll.

The calculation engine should produce at least:

### Earnings

- regular hours
- regular rate
- regular gross pay
- overtime hours/rate/pay when explicitly supplied or derived from an approved source
- vacation pay paid in the run, if applicable
- other explicitly supported earnings
- gross pay

### Employee deductions

- federal/provincial income tax withholding
- CPP
- CPP2 when applicable
- EI when the employment is insurable
- other explicitly supported deductions
- total employee deductions
- net pay

### Employer payroll cost

- employer CPP
- employer CPP2 when applicable
- employer EI when applicable
- vacation accrual/pay expense as configured
- total employer payroll burden
- total employer cash/cost requirement for the run

### CRA/remittance view

- employee income tax withheld
- employee CPP/CPP2
- employer CPP/CPP2
- employee EI
- employer EI
- total CRA payroll remittance attributable to the run

The engine must respect YTD statutory maxima and pay-frequency-dependent calculations. A PayrollRun therefore cannot be calculated correctly from only `hourlyRate × hours`; it also needs the employee/pay-period statutory context and prior finalized YTD payroll facts.

## 6. Versioned statutory rules

CRA/tax rules must be represented as a **versioned calculation policy selected by pay date**, not as scattered constants in UI code.

Initial policy requirements:

- federal + Ontario payroll withholding support;
- CPP / CPP2;
- EI employee/employer treatment;
- employer multiplier/rate handling;
- annual maxima and YTD consumption;
- pay-frequency/basic-exemption behavior;
- explicit exemption/non-insurable states where legally applicable;
- fail-closed handling when a required employee setting or supported rule is missing.

The calculation result must record the rule/version identity used so the PDF, Journal and remittance evidence can be reproduced later.

No code should infer EI exemption simply from an employee being an owner/Admin. If an exemption applies, Payroll must hold an explicit reviewed employment-insurance status/evidence input.

## 7. PayrollRun lifecycle and immutable evidence

Recommended lifecycle:

`DRAFT -> CALCULATED -> APPROVED -> POSTED`

with explicit cancellation/reversal semantics rather than editing a posted run in place.

A posted run should retain:

- employee stable identity;
- pay-period start/end;
- pay date;
- all earnings inputs;
- all statutory inputs/statuses;
- calculation-policy version;
- complete calculated employee deductions;
- employer contributions/costs;
- YTD values used and resulting YTD values;
- stable run/fact identity;
- operator identity and approval/post timestamps;
- deterministic idempotency/hash evidence for Journal posting.

A historical finalized run must remain reproducible even after hourly rate, pay frequency or statutory rules change.

## 8. Accounting facts: three separate events

Payroll must not collapse all cash and liability effects into one generic expense. At minimum, Accounting should distinguish three separate facts.

### 8.1 Payroll accrual / pay-run recognition

Recognize gross compensation and employer payroll burden while establishing liabilities for:

- employee net pay;
- employee tax withholding;
- employee + employer CPP/CPP2;
- employee + employer EI;
- vacation liability where the selected policy accrues rather than pays it immediately.

Exact stable account IDs must be audited against the final CoA before implementation. Any missing system accounts require the normal separately authorized data-only migration/CoA provisioning step.

### 8.2 Employee payment

When wages are actually paid:

- clear Payroll/Net Pay payable;
- credit the actual bank/cash account used.

Payment timing must not rewrite the original payroll expense/accrual fact.

### 8.3 CRA payroll remittance

When CRA is remitted:

- clear the applicable income-tax / CPP / CPP2 / EI payroll liabilities;
- credit the actual bank account.

CRA remittance is therefore a settlement of payroll liabilities, not another wage expense.

## 9. Vacation pay

Vacation pay must be modeled explicitly rather than hidden in a generic labour expense total.

The employee/payroll policy must distinguish at least:

- vacation paid on each pay run;
- vacation accrued as a liability and paid later.

The PayrollRun calculation/PDF/Journal must reflect the configured policy. The rate/rule should be effective-dated/versioned rather than permanently hard-coded into one UI formula.

## 10. Pay-statement PDF / print output

The finalized PayrollRun should generate a server-owned PDF suitable for download or printing.

Minimum statement content:

- employer name;
- employee name;
- pay-period start/end;
- pay date;
- pay frequency;
- regular/overtime hours and rates;
- gross earnings breakdown;
- vacation pay/accrual display as appropriate;
- income tax, CPP/CPP2 and EI employee deductions;
- total deductions;
- net pay;
- YTD gross/deductions/net and relevant statutory YTD figures;
- stable PayrollRun/pay-statement number.

The PDF is a representation of a finalized PayrollRun, not an editable accounting source. Regeneration of the same finalized run must reproduce the same payroll amounts.

## 11. CRA operational boundary

Slice 8P should calculate and present the CRA remittance amount and remittance-period evidence, but **automatic submission/payment to CRA is not required for the first Payroll slice**.

The first production-ready scope should support the owner operating CRA My Business Account manually using SanQ's calculated remittance summary. A future CRA filing/payment integration, if desired and technically available, must be a separate provider/integration work package with its own authorization, authentication and audit boundary.

Likewise T4/T4 Summary generation/e-filing is not a prerequisite for the first pay-run/PDF/remittance slice unless separately added to scope.

## 12. API / UI boundary

Recommended first-class Accounting routes/surfaces:

- Payroll employees
- Payroll run create/edit/calculate
- Payroll run approval/posting
- Pay statement PDF
- Payroll history
- CRA remittance summary/status

The final 8B Web vertical cleanup should consume stable Payroll DTOs/contracts and must not reach into Prisma models or duplicate statutory calculation formulas in the browser.

## 13. Idempotency, corrections and period locks

Payroll posting must reuse the existing Accounting Journal invariants:

- deterministic stable source fact + version;
- deterministic idempotency key/hash;
- balanced debits/credits;
- Accounting period-lock enforcement;
- one atomic Journal + Audit write boundary;
- repeat submission converges to the same financial fact;
- changed content under the same finalized fact identity fails closed.

A posted payroll correction must use an explicit reversal/correction workflow. Do not mutate a posted historical PayrollRun and silently overwrite its Journal.

## 14. Required implementation decomposition

Recommended implementation decomposition for Slice 8P:

1. **8P-A — Payroll readiness + CoA/schema audit**  
   Confirm final Accounting boundaries after 8A; inventory existing CoA; define minimal Payroll persistence and identify whether any new system accounts/schema are required. No migration is authored until separately approved.

2. **8P-B — Payroll employee + calculation core**  
   Add PayrollEmployee, effective-dated payroll configuration, PayrollRun draft/calculation model and Ontario-first versioned statutory calculator. No Journal write until calculation characterization is complete.

3. **8P-C — Pay statement + review UI**  
   Add Payroll operator UI, calculated breakdown/YTD review and deterministic PDF generation/print.

4. **8P-D — Journal posting + payroll settlement facts**  
   Add approved payroll accrual Journal posting, employee-payment settlement and CRA-remittance settlement using the existing Accounting Journal writer and period/audit/idempotency rules.

5. **8P-E — production verification / closeout evidence**  
   Run controlled payroll calculations against independently checked CRA results and verify PDF + Journal + remittance arithmetic end to end before Phase 9 closeout.

## 15. Phase 9 closeout gate added by Payroll

Because Payroll is now part of the approved Phase 9 sequence, Phase 9 must **not** be marked `PRODUCTION VERIFIED / CLOSED` until the Payroll gate below is satisfied or Payroll is explicitly removed/deferred by a later operator decision.

Required Payroll closeout evidence:

1. final Payroll ownership boundaries match this document: no Payroll-through-Expense shortcut and no legacy `AccountingTransaction` writer;
2. architecture scanner shows no new deep-import/direct-cycle debt and Payroll consumes Accounting only through approved owner boundaries;
3. any required Prisma/schema/CoA migration was separately authorized, reviewed, merged and successfully deployed;
4. Ontario statutory calculator is versioned by pay date and characterized against independent CRA reference calculations for representative pay frequencies and YTD/maxima boundaries;
5. EI-insurable and explicit non-insurable/exempt cases fail closed or calculate according to their reviewed employee setting; no Admin/owner-role inference is used;
6. one controlled hourly PayrollRun verifies `hours/rate -> gross -> Tax/CPP/CPP2/EI -> employer CPP/CPP2/EI -> vacation -> net -> CRA remittance` arithmetic;
7. generated pay-statement PDF matches the approved PayrollRun exactly and includes correct YTD values;
8. payroll accrual Journal is balanced and idempotent and contains the expected wage/employer-cost/liability lines;
9. employee-payment settlement clears only employee-payable liability against the selected bank/cash account;
10. CRA-remittance settlement clears only the applicable payroll liabilities against the selected bank account and does not create a second wage expense;
11. retry/replay proves no duplicate PayrollRun Journal, employee payment or CRA remittance Journal;
12. posted-run correction/reversal is fail-safe and does not mutate historical posted facts in place;
13. Accounting period-close behavior is verified for Payroll facts;
14. final Web 8B contracts include Payroll without browser-side statutory formula duplication;
15. Phase 9 final closeout snapshot and documentation include Payroll production verification evidence together with the existing Revenue, change/reversal, Inbox/Expense and provider-settlement status.

## 16. Explicit non-goals for the first Payroll slice

The first Payroll vertical does not automatically expand into:

- employee scheduling/time-clock software;
- HR/performance management;
- benefits administration;
- ROE filing;
- T4 electronic filing;
- direct CRA bank payment automation;
- multi-province payroll;
- a general-purpose Canadian payroll SaaS product.

Those can be added later only when they become actual SanQ requirements.

## 17. Readiness conclusion

**APPROVED INSERTION POINT: 8P AFTER 8A, BEFORE 8B.**

The current Accounting foundation is suitable for Payroll because the double-entry Journal, audit, period-lock and stable-fact/idempotency boundaries already exist. Payroll should therefore be implemented as a dedicated business-fact vertical that feeds those boundaries, not as extra fields on the generic Expense category.

The next action is **not** Payroll source implementation yet. Finish the approved Phase 9 sequence through Slice 6, Slice 7 and 8A; then perform 8P-A against the merged state before authoring Payroll schema/migrations or runtime code.
