# Phase 9 Payroll Vertical — Readiness, Design and Closeout Gate

Status: **8P-D3-B2 LOCAL SOURCE REVIEW PENDING — NO MIGRATION**  
Planning date: 2026-09-16  
Implementation baseline: `origin/dev@95cfbf70` (8P-D3-B1 merged through PR #2394; final head `f35249af`, PR CI #5897 and post-merge CI #5898 green)  
Current implementation branch: `feat/phase9-slice8p-d3b2-cra-remittance-settlement`

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

The prerequisite named by the original design is now satisfied: Slice 6, Slice 7 and Slice 8A are merged, and the latest audited `origin/dev@6d216eab` passed CI #5855 across Architecture plus API/Web lint, build, strict and tests. The next action is therefore **8P-A readiness + CoA/schema audit against the merged state**. Payroll runtime code, Prisma schema changes, migration generation and Journal posting remain out of scope until 8P-A closes its design decisions.

## 18. 2026-09-17 latest-dev Payroll readiness audit

### 18.1 Audit baseline and result

This audit was performed read-only against `origin/dev@6d216eabed5d45ed2ed61e1c02293130c3fdb0d9`, after the full Slice 8A backend capability split and the Accounting Inbox follow-up had merged. Exact-head CI #5855 passed the architecture gate and all API/Web lint, build, strict and test jobs.

Result:

**READY FOR 8P-A / NOT READY FOR PAYROLL SOURCE IMPLEMENTATION**

No Payroll production implementation currently exists under `apps/api` or the Accounting Web surface, so 8P begins without a legacy Payroll writer or persisted Payroll fact model that must be preserved.

### 18.2 Accounting capabilities Payroll can safely target

The merged 8A state materially improves the Payroll insertion point:

- `AccountingJournalService` owns balanced Journal mutation, deterministic idempotency hashing/replay, Serializable writes, account/category resolution and atomic Journal audit writes.
- `AccountingPeriodService` owns accounting-start/date policy plus month/year period locks and Journal editability.
- `AccountingChartService` owns the system Chart of Accounts and Accounting categories.
- `AccountingFinancialReportsService` now projects canonical Journal Revenue/Expense-class effects plus confirmed Expense facts; Payroll does not need a second reporting ledger.
- the former god `AccountingController` is absent. Twelve explicit Accounting transport verticals are pinned by `accounting-controller-vertical-boundary.architecture.spec.ts`, so Payroll must be added as its own explicit vertical rather than reconstructed through a broad controller/facade.
- generic authenticated `/accounting/tx` mutation is removed. Payroll must not revive `AccountingTransaction` as a generic payroll writer; that model remains Expense-owned persistence.

The generic Journal create capability is a persistence/ledger primitive, not by itself sufficient Payroll write authority. Before 8P-D, Payroll should add an owner-specific fact/authority policy that proves a finalized Payroll fact maps exactly to the permitted accounts and amounts before delegating the atomic write to `AccountingJournalService`.

### 18.3 Production CoA audit

Read-only production inspection at this audit baseline shows **21 active Accounting accounts**. Existing liability accounts cover HST payable and stored-value liability, and existing expense accounts cover general/platform operating expenses. There are **no dedicated payroll wage, employer-contribution, employee-net-pay, income-tax, CPP/CPP2, EI or vacation-pay liability accounts**.

`expense_labor` exists as an Accounting **category** under fixed/operating expense. It is suitable as the reporting dimension attached to Payroll expense Journal lines, but it is not a substitute for the payroll Chart-of-Accounts facts required to separate expense recognition from employee/CRA settlement.

8P-A must therefore define the minimum stable system-account set. The working candidate set is:

- `account_payroll_wages_expense`
- `account_payroll_employer_contributions_expense`
- `account_payroll_net_pay_payable`
- `account_payroll_income_tax_payable`
- `account_payroll_cpp_payable`
- `account_payroll_ei_payable`
- `account_payroll_vacation_payable`

The exact set and names remain **8P-A decisions**, not implemented facts. CoA provisioning must follow the repository's normal reviewed data/migration workflow before Payroll Journal posting can be enabled.

### 18.4 Persistence design requirements exposed by the audit

The existing Prisma schema has no Payroll employee, configuration, pay-run, payment-settlement or CRA-remittance fact model. An additive persisted Payroll model is therefore required before runtime implementation.

The original design's `PayrollEmployee` and effective-dated employee configuration remain appropriate, but the readiness audit adds two design requirements that must be resolved in 8P-A:

1. **Employer/remittance configuration.** CRA remittance grouping/due-date semantics are employer-level facts, not properties of one employee run. Payroll therefore needs an explicit employer/remitter configuration boundary rather than deriving remittance timing from a PayrollRun alone.
2. **Statutory claim/configuration inputs.** The employee configuration must persist the reviewed statutory inputs required by the supported CRA/Ontario calculation path; hourly rate and pay frequency alone are not a sufficient calculation contract. Exact fields must be confirmed against the current CRA formula/reference material before schema implementation.

Payroll employment identity remains separate from Auth/User identity. An optional `userStableId` link may be stored as a stable reference when useful, but Payroll must not use the User/Staff Prisma model as its employee master.

### 18.5 Calculation and immutable evidence boundary

The calculator should remain a versioned, deterministic server-side policy selected by pay date. A finalized run must freeze both inputs and outputs, including the statutory-policy version and YTD-before/YTD-after evidence. Historical runs must not be silently recalculated with newer policy constants.

For hourly inputs, persistence should avoid binary floating-point as a fact representation. 8P-A should prefer integer minor units for money and an integer time unit (for example minutes) for worked time, while allowing the UI to present decimal hours.

Weekly overtime must remain explicit input or come from a separately reviewed week-level timesheet source; one aggregate biweekly/monthly hour total cannot be used to infer weekly overtime.

### 18.6 Journal fact separation

The audit confirms the original design's three-fact model is required:

1. payroll accrual / pay-run recognition creates wage/employer-cost expense plus employee/CRA/vacation liabilities;
2. employee payment clears only the employee net-pay liability against the selected bank/cash account;
3. CRA remittance clears only the applicable payroll liabilities against the selected bank account.

Employee payment and CRA remittance must not rewrite the original Payroll expense fact or create a second wage expense.

The existing `AccountingJournalSource` enum has no Payroll source. 8P-A should decide whether to add an explicit `PAYROLL` source (preferred for audit/report traceability) rather than representing active Payroll facts as generic `SYSTEM`.

### 18.7 Pay-statement/PDF readiness

The API currently has no dedicated PDF library. The existing Accounting report PDF is a minimal handwritten PDF renderer intended for a small report summary and is not an appropriate long-term pay-statement foundation.

8P-C must therefore choose between:

- a deliberately scoped, separately authorized PDF dependency addition; or
- a repository-owned deterministic renderer with sufficient typography/layout/test coverage.

Because dependency-manifest and lockfile changes require explicit authorization under `AGENTS.md`, 8P-A records this as a later 8P-C decision and does not alter dependencies.

### 18.8 Refined implementation decomposition

The original A-E decomposition remains valid, but implementation should use smaller reviewable packages:

1. **8P-A — readiness + CoA/schema/statutory contract audit**: close account set, persisted fact model, identity, employer remitter boundary, statutory input contract, source-fact identities, correction semantics and external CRA/Ontario reference cases. No runtime/schema change.
2. **8P-B1 — persistence/contracts/architecture foundation**: additive Payroll Prisma models/contracts, explicit architecture guards and any approved Journal-source contract. This is expected to require a user-generated migration and must be reported `MIGRATION REQUIRED`.
3. **8P-B2 — Ontario statutory calculation core**: pure versioned calculation policies and independent characterization/golden cases. No Journal writer.
4. **8P-B3 — employee/config/run lifecycle + YTD API**: DRAFT/CALCULATED/APPROVED behavior and immutable calculation snapshots. Still no Journal posting.
5. **8P-C — operator UI + pay statement**: Accounting Payroll workspace, server-owned calculation review and deterministic PDF; no browser statutory formula.
6. **8P-D1..D4 — financial posting/settlement/correction**: accrual, employee payment, CRA remittance, then reversal/correction/period-lock hardening through Payroll-specific write authority into the existing Journal.
7. **8P-E — controlled production verification**: independently checked statutory results plus end-to-end PayrollRun, PDF, Journal, settlement, retry, YTD, reversal and period-lock evidence.

### 18.9 8P-A immediate questions

8P-A must close the following before any schema/runtime implementation:

- exact Payroll system accounts and whether vacation requires a separate expense account in addition to the payable account;
- Payroll employer/remitter persistence cardinality and Store/brand relationship;
- supported pay frequencies in MVP;
- exact CRA/Ontario statutory employee inputs and default/fail-closed behavior;
- canonical YTD definition and how imported pre-SanQ/current-year payroll history is represented when starting mid-year;
- PayrollRun stable identity/version/correction model;
- employee-payment and CRA-remittance settlement persistence/idempotency model;
- whether `AccountingJournalSource.PAYROLL` is added;
- pay-statement retention/regeneration requirements;
- independently reproducible CRA/Ontario calculation fixtures for the supported policy versions.

Until those items are resolved, 8P-A remains a read-only design/readiness package and **no Payroll schema, migration, runtime writer or statutory constants should be authored**.

## 19. 8P-A working analysis — recommended contracts before implementation

The findings in this section are design recommendations from the 8P-A audit. They do not create runtime/schema facts and remain subject to operator review before 8P-B1 source implementation.

### 19.1 No existing SanQ Payroll fact migration is required

Read-only production inspection found:

- one active Store and one BrandConfig;
- zero `AccountingExpenseDocument` rows;
- zero active `AccountingTransaction` rows categorized as `expense_labor`;
- zero active Journal lines categorized as `expense_labor`.

Therefore no current SanQ Accounting payroll writer/fact set needs a cutover, backfill or reversal before 8P starts. Historical/current-year payroll that happened outside SanQ is a different problem: if SanQ begins calculating payroll mid-year, the statutory calculator still needs reviewed same-employer YTD opening evidence even though Accounting has no historical payroll Journals to migrate.

### 19.2 PayrollEmployer should be Payroll-owned, not Brand/Store-owned

The repository currently models Store as an operating location and BrandConfig as brand/site/contact configuration. Neither owns legal-employer/remitter semantics. Payroll should therefore introduce its own stable business identity:

`PayrollEmployer`

Recommended ownership:

- legal/display employer name used on wage statements;
- active state;
- optional/default `storeStableId` for Accounting attribution;
- Payroll-employer configuration history.

Do not add Payroll legal/remitter fields to `BrandConfig` or `StoreConfig` merely because SanQ currently has one brand and one active store. Do not use Store DB UUID as Payroll identity. A future employer may cover more than one location.

The MVP does not require storing a CRA business number/payroll-program account identifier in order to calculate payroll or present manual remittance evidence. Adding such identifiers later should receive an explicit privacy/security and operational review.

### 19.3 Employer configuration must be effective-dated

Recommended employer configuration facts:

- effective date;
- reviewed CRA remitter type;
- EI employer multiplier/profile;
- default province/jurisdiction support state;
- operator/audit identity.

The remitter type must be a reviewed configured fact rather than inferred from one PayrollRun amount. Initial contract should be capable of representing CRA quarterly, regular monthly and accelerated remitter classes, even if the first operator workflow only enables the reviewed class actually used by SanQ.

The standard EI employer multiplier is policy-driven, but an approved reduced EI rate can exist. Payroll must not permanently hard-code the employer share as `employeeEI * 1.4` without an employer-profile override boundary.

### 19.4 PayrollEmployee and effective-dated employee configuration

`PayrollEmployee` should own employment identity independent of Auth/User:

- `employeeStableId`;
- `employerStableId`;
- legal/display name;
- optional linked `userStableId` scalar;
- active/employment dates;
- default/home `storeStableId` for MVP accounting attribution;
- vacation-service date when it differs from the simple hire date.

No SIN/T4-specific identifier is required in 8P MVP.

Recommended effective-dated employee calculation configuration:

- province of employment: Ontario only in MVP, fail closed otherwise;
- pay-frequency family plus the actual number of pay periods in the year;
- default hourly rate in integer cents;
- federal TD1 claim mode/amount;
- Ontario TD1 claim mode/amount;
- additional tax requested per pay when applicable;
- CPP participation/applicability mode with explicit reviewed exception handling;
- EI insurability state; never infer from User/Admin/owner role;
- vacation treatment and rate;
- explicit evidence/acknowledgement state when vacation pay is configured to be paid each pay period;
- a calculation profile that makes unsupported deductions/benefits explicit rather than silently assuming they are zero.

### 19.5 Initial statutory calculation method

For the first Ontario hourly calculator, use CRA **T4127 Option 1** as the canonical tax method. CRA states that Option 1 is used by the Payroll Deductions Tables and PDOC and supports regular periodic pay plus non-periodic payments. Option 2 cumulative averaging is useful where pay varies considerably, but it is not required for the first SanQ calculator.

The policy registry must be selected by pay date, not merely tax year. For 2026 this already requires at least:

- `CA-ON-2026-01`: T4127 122nd edition, effective January 1, 2026;
- `CA-ON-2026-07`: T4127 123rd edition, effective July 1, 2026.

A historical run permanently records its policy version.

The employee/config contract must supply or deterministically derive the factors required by the supported T4127 path. In particular, pay frequency/period count and TD1 federal/provincial claim inputs are real calculation inputs; `hourlyRate * hours` is insufficient.

### 19.6 Pay-frequency representation

Do not model pay frequency as only `WEEKLY | BIWEEKLY | SEMIMONTHLY | MONTHLY`. T4127 distinguishes the actual number of pay periods, including 52/53 weekly and 26/27 biweekly cases.

Recommended contract:

- a semantic frequency enum for UI/operator meaning; and
- an integer `payPeriodsPerYear` constrained to supported CRA values for the selected frequency.

This keeps the calculation evidence explicit and makes exceptional calendar years reproducible.

### 19.7 Same-employer YTD opening fact is required for mid-year startup

If SanQ begins Payroll after payroll has already been processed elsewhere during the same tax year, create one reviewed Payroll-owned annual opening fact for each employee/employer/tax-year before the first SanQ finalized run.

Recommended minimum evidence includes same-employer:

- pensionable earnings YTD;
- employee CPP YTD;
- employee CPP2 YTD;
- insurable earnings YTD;
- employee EI YTD;
- income tax withheld YTD;
- gross earnings / deductions / net-pay YTD needed for pay-statement presentation;
- non-periodic-payment/tax YTD inputs when the supported calculation path requires them;
- evidence date, source note and operator/audit identity.

This opening fact is statutory-calculation context only. It must **not** automatically create historical Payroll Journals or pretend that prior payroll was booked in SanQ Accounting.

CPP/EI YTD imported into this opening fact must be limited to the same legal employer/payroll employment continuity recognized by CRA rules. Deductions made by an unrelated previous employer/business number are not used to stop SanQ's CPP/EI deductions.

### 19.8 Vacation-pay calculation requires two separate concerns

Ontario employment-standard entitlement and CRA source-deduction treatment are different concerns and both must be represented.

Ontario minimum vacation pay is generally 4% before the five-year employment threshold and 6% at/after the threshold, with a possible top-up when the threshold is crossed during an entitlement year. An employer can provide a greater entitlement.

For Payroll configuration:

- `PAID_EACH_RUN`: vacation pay is shown separately and paid with payroll;
- `ACCRUED`: vacation pay creates a Payroll liability and is paid later.

For statutory deductions, continuously paid vacation pay when vacation is not taken cannot simply be merged into ordinary periodic earnings for every deduction: CRA directs income tax and CPP to the bonus/irregular-payment method while EI continues under the regular method. The calculator therefore needs an explicit non-periodic earnings branch.

No separate vacation **expense** account is required for the MVP if wages expense is the compensation expense owner. Accrued vacation can debit wages expense with `expense_labor` and credit vacation payable; later payment clears the vacation payable. A separate vacation payable liability is still required.

### 19.9 Overtime evidence remains week-level

Ontario's general overtime threshold is weekly, normally after 44 hours in a work week at 1.5 times the regular rate, subject to exemptions and averaging agreements. Therefore a biweekly/monthly aggregate hour count is insufficient evidence.

The MVP should accept explicit reviewed regular/overtime inputs. A future timesheet capability may derive these values week-by-week. Payroll must not silently infer overtime from the aggregate PayrollRun period total.

### 19.10 Recommended minimum Payroll CoA

The 8P-A recommendation is to provision these seven stable system accounts before Journal posting is enabled:

- `account_payroll_wages_expense` — EXPENSE;
- `account_payroll_employer_contributions_expense` — EXPENSE;
- `account_payroll_net_pay_payable` — LIABILITY;
- `account_payroll_income_tax_payable` — LIABILITY;
- `account_payroll_cpp_payable` — LIABILITY, combining CPP and CPP2 GL control while Payroll retains component detail;
- `account_payroll_ei_payable` — LIABILITY;
- `account_payroll_vacation_payable` — LIABILITY.

Payroll compensation expense Journal lines should carry `expense_labor` as the reporting category. The system does not need a separate vacation expense account for MVP; employee/run detail remains the Payroll subledger.

These accounts should follow the existing Accounting CoA provisioning pattern: stable IDs in `DEFAULT_ACCOUNTING_ACCOUNTS`, a separately user-generated/reviewed data migration that provisions active CAD account facts, and architecture regression proving the TypeScript CoA and cumulative migration seeds stay synchronized. No opening Journal should be seeded merely because the accounts are created.

### 19.11 Payroll Journal source and fact identities

8P-A recommends adding an explicit `AccountingJournalSource.PAYROLL` when financial posting begins rather than using generic `SYSTEM`. This is an additive persisted enum change and therefore belongs to a reviewed schema/migration step, not this audit.

Recommended versioned source facts:

- `payroll.run.accrual.v1`;
- `payroll.employee_payment.v1`;
- `payroll.cra_remittance.v1`;
- an explicit versioned Payroll reversal/correction fact when required.

Accrual, employee payment and CRA remittance should use normal balanced Journal semantics. A Payroll reversal should prefer an explicit inverse Payroll fact/Journal rather than a generic non-platform `ADJUSTMENT`, because the current financial-report policy intentionally collapses generic ADJUSTMENT entries into an adjustment total instead of preserving the original expense category effect.

Payroll needs a dedicated write-authority policy analogous to existing canonical-change/provider-settlement authority. The authority must bind finalized Payroll fact identity/version/hash, permitted account set and exact amounts before delegating to `AccountingJournalService`.

### 19.12 Recommended core persistence split

8P-B1 should add only the Payroll core persistence needed before calculation/runtime rollout, rather than pre-creating every later settlement table:

- `PayrollEmployer`;
- `PayrollEmployerConfigVersion`;
- `PayrollEmployee`;
- `PayrollEmployeeConfigVersion`;
- `PayrollEmployeeYearOpening`;
- `PayrollRun`.

Settlement persistence can be introduced when 8P-D actually needs it:

- `PayrollEmployeePayment` for employee net-pay settlement;
- `PayrollCraRemittance` plus immutable included-run/component evidence for employer remittance-period settlement.

This keeps schema evolution vertical and reviewable instead of creating unused tables in B1.

### 19.13 PayrollRun fact shape

A PayrollRun remains one employee + one pay period + one pay date.

Recommended invariant fields include:

- stable run identity;
- employer/employee stable identity;
- Store stable attribution snapshot;
- period start/end and pay date;
- status/version;
- effective employee/employer config identities;
- regular and overtime time in integer minutes;
- rates and all money in integer cents;
- policy version;
- deterministic calculation hash;
- explicit headline component amounts needed for query, Journal and remittance;
- versioned calculation evidence snapshot containing the complete inputs, intermediate statutory evidence and YTD before/after;
- approval/posting actor/timestamps;
- correction/reversal links rather than mutation of posted history.

The browser may display decimal hours, but persisted canonical worked time should avoid binary floating-point.

### 19.14 Settlement facts

Employee payment and CRA remittance are independent canonical facts from the PayrollRun accrual.

For MVP employee payment, prefer **one full settlement of the run's net-pay liability**. Supporting partial/multiple wage payments introduces another allocation invariant and should be added only if an actual SanQ workflow requires it.

CRA remittance is an employer/remitter-period fact, not one remittance per PayrollRun. It should freeze:

- remittance period;
- reviewed remitter type/config version;
- due date;
- included PayrollRun/component evidence;
- employee income tax withheld;
- employee/employer CPP + CPP2;
- employee/employer EI;
- total amount;
- payment date/account when settled;
- stable identity/idempotency evidence.

The remitter type should drive period/due-date policy after the operator configures the CRA-assigned type; the system must not guess the type solely from current PayrollRun amounts.

### 19.15 Pay-statement contract

The first Ontario pay statement must at least expose the pay period, wage rate, gross wages and calculation basis, each deduction and its purpose, and net wages. Electronic delivery is acceptable only where the employee can make/retain a paper copy.

The pay statement should be generated from immutable finalized PayrollRun evidence and record a template/renderer version. The PDF bytes do not need to become the payroll source of truth; regeneration from the same finalized run must reproduce the same financial amounts.

### 19.16 Explicit MVP exclusions surfaced by 8P-A

The existing first-slice non-goals remain. 8P-A additionally recommends that **Ontario Employer Health Tax (EHT)** be explicitly treated as unsupported in the initial calculator unless separately added. Ontario currently has an EHT regime with an eligibility/exemption framework; silently labeling CPP/EI-only results as the employer's complete statutory burden could therefore be misleading.

Until EHT is deliberately supported, API/UI naming should describe the calculated amount as the **supported employer payroll contributions/cost** rather than implying every Ontario employer levy is included.

### 19.17 8P-A remaining operator facts, not architecture blockers

The architecture/schema contract can be finalized without hard-coding SanQ's current operational values. Before the first real PayrollRun is approved, the operator must configure/review:

- SanQ's actual CRA remitter type;
- the actual pay frequency and periods-per-year;
- employee TD1 federal/Ontario inputs or documented default handling;
- CPP/EI applicability exceptions, if any;
- EI employer multiplier if SanQ has an approved reduced rate;
- vacation treatment/rate and any required employee agreement evidence;
- same-employer current-year opening YTD figures when Payroll starts mid-year.

Those values belong in Payroll configuration/evidence, not source constants.

### 19.18 Migration/delivery sequencing required by existing CoA guard

Payroll has two different persisted-change classes and they should not be mixed:

1. **8P-B1 structural Payroll schema** — additive models/enums/relations in `schema.prisma` may follow the repository's schema-first exception. MCP may prepare the reviewed schema/source change, but no migration file is generated or edited by MCP. After the reviewed source reaches `dev`, the operator generates the companion migration locally and returns it for review before any promotion/deployment.
2. **Payroll CoA provisioning before 8P-D** — this is data-only system-account seeding, not a structural Prisma diff. Follow the existing Tip Revenue pattern: the durable operator-generated data migration that provisions the approved active CAD accounts must exist first; only then should source add those stable IDs to `DEFAULT_ACCOUNTING_ACCOUNTS` and extend the cumulative CoA architecture guard.

The current `accounting-journal-boundary.architecture.spec.ts` intentionally verifies that every default Accounting account exists in the cumulative migration seeds. Adding Payroll accounts to TypeScript before their durable data migration would therefore fail CI by design and must not be worked around by weakening the guard.

## 20. 8P-A field-level contract closeout

### 20.1 B1 persisted enums

8P-B1 should introduce only the persisted enums needed by the core Payroll aggregate:

`PayrollRunStatus`
- `DRAFT`
- `CALCULATED`
- `APPROVED`
- `POSTED`
- `REVERSED`
- `VOIDED`

`PayrollPayFrequency`
- `WEEKLY`
- `BIWEEKLY`
- `SEMIMONTHLY`
- `MONTHLY`

`PayrollTd1Mode`
- `FILED_TOTAL_CLAIM`
- `NO_FORM_DEFAULT`

A separate income-tax treatment flag should represent a reviewed claim-code-E case rather than abusing the claim amount:

`PayrollIncomeTaxTreatment`
- `STANDARD`
- `TD1_CLAIM_CODE_E_REVIEWED`

`PayrollCppTreatment`
- `STANDARD`
- `EXEMPT_REVIEWED`

`PayrollEiTreatment`
- `INSURABLE`
- `NON_INSURABLE_REVIEWED`

`PayrollVacationTreatment`
- `PAID_EACH_RUN`
- `ACCRUED`

`PayrollRemitterType`
- `QUARTERLY`
- `REGULAR`
- `ACCELERATED_THRESHOLD_1`
- `ACCELERATED_THRESHOLD_2`

Do not add a persisted Ontario-only province enum. Persist the ISO-style province-of-employment code as a string and make the B2 policy accept only `ON`; this avoids schema enum churn when another province is deliberately added later.

### 20.2 PayrollEmployer

Recommended B1 fields:

- internal UUID primary key;
- `employerStableId` unique CUID business identity;
- `legalName`;
- optional `displayName`;
- optional `defaultStoreStableId` scalar;
- `isActive`;
- `createdByActorRef`;
- `createdAt`;
- `updatedAt`.

No FK to Brand or Store. Store attribution is a stable scalar because Store is a different owner boundary.

### 20.3 PayrollEmployerConfigVersion

Employer config rows should be immutable effective-dated versions:

- internal UUID;
- `configStableId` unique CUID;
- PayrollEmployer FK;
- monotonically increasing `version`;
- `effectiveFrom` as `@db.Date`;
- `remitterType`;
- `eiEmployerMultiplierMicros` integer, where standard 1.4 is stored as `1_400_000`;
- `createdByActorRef`;
- `createdAt`.

Recommended uniqueness:

- unique employer + version;
- unique employer + effectiveFrom.

Do not persist `effectiveTo`; the next effectiveFrom bounds the previous version. This prevents overlapping editable intervals.

The multiplier must be positive and should be constrained to a reviewed reasonable range by application policy. The standard policy supplies 1.4; a reduced value is accepted only as an explicitly reviewed employer configuration.

### 20.4 PayrollEmployee

Recommended B1 fields:

- internal UUID;
- `employeeStableId` unique CUID;
- PayrollEmployer FK;
- `legalName`;
- optional `displayName`;
- optional `userStableId` scalar, never a User DB UUID FK;
- optional/default `storeStableId` scalar for Payroll/Accounting attribution;
- `employmentStartDate` as `@db.Date`;
- optional `employmentEndDate` as `@db.Date`;
- optional `vacationServiceStartDate` as `@db.Date` when legal vacation service differs from the simple employment-start fact;
- `isActive`;
- `createdByActorRef`;
- `createdAt`;
- `updatedAt`.

B1 should not store SIN, date of birth, bank-account details, T4 identifiers or CRA payroll-account identifiers.

### 20.5 PayrollEmployeeConfigVersion

Employee calculation config should also be immutable effective-dated versions:

Identity/audit:
- internal UUID;
- `configStableId` unique CUID;
- PayrollEmployee FK;
- `version`;
- `effectiveFrom @db.Date`;
- `createdByActorRef`;
- `createdAt`.

Employment/pay:
- `provinceOfEmployment`, with B2 supporting only `ON`;
- `payFrequency`;
- `payScheduleAnchorDate @db.Date`, one known scheduled payday used to derive whether a tax year contains 52/53 weekly or 26/27 biweekly periods;
- `defaultHourlyRateCents`.

TD1/tax:
- `federalTd1Mode`;
- nullable `federalTd1TotalClaimCents`, required only for `FILED_TOTAL_CLAIM`;
- `ontarioTd1Mode`;
- nullable `ontarioTd1TotalClaimCents`, required only for `FILED_TOTAL_CLAIM`;
- `incomeTaxTreatment`;
- `additionalTaxPerPayCents`, default 0.

CPP/EI:
- `cppTreatment`;
- nullable `cppExceptionCode` and `cppExceptionNote` when treatment is reviewed-exempt;
- `eiTreatment`;
- nullable `eiExceptionCode` and `eiExceptionNote` when non-insurable is reviewed.

Vacation:
- `vacationTreatment`;
- `vacationRateBasisPoints` integer, e.g. 4% = 400 and 6% = 600;
- optional `vacationAgreementConfirmedAt` and `vacationAgreementNote` for paid-each-run evidence.

Calculation-support profile:
- a persisted profile/version such as `ON_HOURLY_SIMPLE_V1`, so B2 can fail closed when the actual employee requires unsupported inputs rather than assuming all omitted T4127 factors are zero.

Recommended uniqueness:

- unique employee + version;
- unique employee + effectiveFrom.

B1 should not attempt to fully model RPP/RRSP source deductions, union dues, commission remuneration, taxable benefits, prescribed-zone deductions, court-ordered tax deductions, Quebec transfers or other unsupported T4127 factors. The calculation profile makes that limitation explicit.

### 20.6 PayrollEmployeeYearOpening

A year-opening row is required only when same-employer payroll happened before SanQ owns the first finalized run for that employee/tax year.

Recommended fields:

- internal UUID;
- `openingStableId` unique CUID;
- PayrollEmployee FK;
- `taxYear`;
- `asOfDate @db.Date`;
- `grossEarningsYtdCents`;
- `netPayYtdCents`;
- `periodicEarningsYtdCents`;
- `nonPeriodicEarningsYtdCents` for T4127 factor B1 history;
- `pensionableEarningsYtdCents`;
- `employeeCppYtdCents`;
- `employeeCpp2YtdCents`;
- `insurableEarningsYtdCents`;
- `employeeEiYtdCents`;
- `incomeTaxYtdCents`;
- `vacationPayPaidYtdCents`;
- `vacationPayAccruedYtdCents`;
- `sourceNote`;
- `version`;
- `confirmedByActorRef`;
- `confirmedAt`;
- `createdAt`;
- `updatedAt`.

Recommended uniqueness: one opening business row per employee + tax year.

The opening may be corrected only before the employee's first PayrollRun for that tax year reaches `APPROVED`. Approval of the first run freezes the opening as consumed statutory evidence. A discovered error after that point requires an explicit Payroll correction workflow; silently changing the opening would make every later YTD snapshot non-reproducible.

### 20.7 PayrollRun

A run is one employee + one pay period + one pay date.

Identity/state:
- internal UUID;
- `runStableId` unique CUID;
- PayrollEmployer FK;
- PayrollEmployee FK;
- optional `correctionOfRunId` self-reference for a replacement/correction chain;
- `correctionSequence` integer, where the original normal run is 0 and later corrections increment within the same employee/period/pay-date identity;
- `status`;
- integer `version`;
- `periodStart @db.Date`;
- `periodEnd @db.Date`;
- `payDate @db.Date`;
- `storeStableId` attribution snapshot.

Configuration/policy snapshot references:
- `employeeConfigStableId`;
- `employerConfigStableId`;
- `statutoryPolicyVersion`;
- `payPeriodsPerYear`, frozen after derivation from frequency/calendar;
- `calculationProfileVersion`.

Input facts:
- `regularMinutes`;
- `regularHourlyRateCents`;
- `overtimeMinutes`;
- `overtimeHourlyRateCents`;
- `vacationTopUpCents`, default 0, treated as reviewed non-periodic pay when applicable.

Headline calculated earnings:
- `regularPayCents`;
- `overtimePayCents`;
- `vacationPayPaidCents`;
- `vacationPayAccruedCents`;
- `grossPayCents`;
- `periodicTaxableEarningsCents`;
- `nonPeriodicTaxableEarningsCents`;
- `pensionableEarningsCents`;
- `insurableEarningsCents`.

Deductions/contributions:
- `incomeTaxCents`;
- `employeeCppCents`;
- `employeeCpp2Cents`;
- `employeeEiCents`;
- `employerCppCents`;
- `employerCpp2Cents`;
- `employerEiCents`;
- `totalEmployeeDeductionsCents`;
- `netPayCents`;
- `craRemittanceCents`;
- `compensationExpenseCents`;
- `supportedEmployerPayrollCostCents`.

Evidence:
- `calculationInputJson`;
- `calculationOutputJson`;
- `calculationHash`;
- `ytdBeforeJson`;
- `ytdAfterJson`;
- `payStatementTemplateVersion`.

Approval/posting:
- nullable `approvedByActorRef`;
- nullable `approvedAt`;
- nullable `postedJournalEntryStableId`;
- nullable `postedAt`;
- nullable `reversedAt`;
- nullable `voidedAt`;
- `createdByActorRef`;
- `createdAt`;
- `updatedAt`.

All minute/money fields are integers. Every cents amount is non-negative; the sign/direction belongs to the derived Journal policy.

Recommended business uniqueness is `employee + periodStart + periodEnd + payDate + correctionSequence`. Sequence 0 is the one normal run for that period; a correction receives a new stable run identity, increments the correction sequence and links through `correctionOfRunId`. This prevents accidental duplicate originals without forcing a corrected payroll to overwrite history.

### 20.8 PayrollRun state machine

Allowed transitions:

`DRAFT -> CALCULATED`
- calculator normalizes input, resolves effective configs/policy/YTD and writes deterministic evidence/hash.

`CALCULATED -> DRAFT`
- any editable input/config selection change invalidates the previous result; calculated amounts/hash must no longer be treated as reviewable.

`CALCULATED -> CALCULATED`
- explicit recalculation is allowed only if it produces/replaces the current unapproved calculation evidence and increments run version.

`CALCULATED -> APPROVED`
- operator approval freezes all business/calculation amounts and the exact config/policy/YTD evidence consumed;
- approval must re-read the employee/tax-year opening plus earlier finalized run set inside the owning transaction and compare it to the frozen `ytdBefore`/calculation hash. If another run was approved/voided/reversed or the opening changed after calculation, approval fails as stale and requires recalculation. This prevents two concurrently approved runs from consuming the same YTD state.

`APPROVED -> POSTED`
- 8P-D Payroll write authority posts the accrual Journal idempotently and stores the Journal stable identity.

`APPROVED -> VOIDED`
- an approved but unposted run may be explicitly abandoned with audit evidence; it must not be deleted silently.

`POSTED -> REVERSED`
- only through the later explicit reversal/correction workflow that posts inverse Payroll financial facts.

No transition may return `APPROVED`, `POSTED`, `REVERSED` or `VOIDED` to an editable state. A corrected payroll is a new PayrollRun stable fact linked to the prior run.

Draft deletion is unnecessary for MVP; voiding provides a clearer audit trail and avoids inventing special hard-delete rules.

### 20.9 Calculation-profile boundary

`ON_HOURLY_SIMPLE_V1` should mean, explicitly:

Supported:
- Ontario province of employment;
- hourly regular pay;
- explicit overtime hours/rate;
- vacation paid each run or accrued;
- reviewed vacation top-up as non-periodic earnings;
- federal/Ontario TD1 total claims or official no-form defaults;
- additional tax requested per pay;
- normal CPP plus CPP2;
- reviewed full-pay-period CPP exemption;
- EI insurable or reviewed non-insurable;
- standard or configured reduced employer EI multiplier.

Fail closed / unsupported in V1:
- commission-remunerated employees / TD1X;
- Quebec/QPP/QPIP or inter-provincial Quebec transfer formulas;
- RPP/RRSP/PRPP/RCA deductions at source;
- union dues or other F/U1 tax deductions;
- F1/F2/K3/K3P/LCF/LCP special authorization factors;
- taxable benefits;
- partial-pay-period CPP proration events that require PM handling beyond the supported profile;
- automatic vacation-entitlement-year top-up derivation beyond an explicitly reviewed top-up input;
- Ontario EHT;
- T4/ROE filing.

The API must return a structured unsupported-profile reason rather than calculate a plausible-looking result with missing factors.

### 20.10 YTD derivation

The canonical YTD before a run is:

`frozen same-employer PayrollEmployeeYearOpening (if any) + all earlier APPROVED/POSTED non-reversed PayrollRuns for that employee and tax year`.

DRAFT/CALCULATED/VOIDED runs do not contribute to YTD.

A POSTED run that has been reversed must contribute its original facts plus the explicit reversal effect; the aggregate result after reversal must be mathematically reproducible from immutable facts, not by deleting the run from history.

The calculation snapshot should freeze both `ytdBefore` and `ytdAfter`, including at minimum:

- gross earnings;
- periodic/non-periodic earnings;
- pensionable earnings;
- CPP;
- CPP2;
- insurable earnings;
- EI;
- income tax;
- vacation paid/accrued;
- net pay.

This supplies the statutory maxima context and pay-statement YTD evidence while preserving reproducibility.

### 20.11 CRA reference implications now pinned in the schema contract

The 2026 T4127 formulas define P as the number of pay periods in the year and explicitly allow 52/53 weekly and 26/27 biweekly schedules. The pay schedule anchor plus pay-date calendar therefore belongs in the calculation boundary, while the resolved P is frozen on the run.

T4127 also identifies B1 as prior-year-to-date non-periodic payments, D/D2 as prior employee CPP/CPP2 and D1 as prior EI with the employer. These are why YearOpening and YTD snapshots must retain separate non-periodic, CPP/CPP2 and EI facts rather than only one generic `deductionsYtd` total.

The official no-TD1 handling is also policy behavior: federal TC uses the official BPAF calculation and provincial TCP uses the applicable basic personal amount; a claim-code-E case is separate and Ontario Health Premium can still apply. These are reasons to persist TD1 **mode/evidence**, not only an annual claim number.

### 20.12 Pay-statement/record retention decision

Do not persist generated PDF bytes as the canonical Payroll fact in B1. Persist finalized run evidence plus `payStatementTemplateVersion`; 8P-C may render on demand and can later add an immutable delivery/artifact record if operationally needed.

Ontario requires wage-statement information to be retained for three years after it is given to the employee, while vacation time/pay records generally have a five-year retention requirement. For MVP, finalized PayrollRun/config/opening evidence should therefore have **no automatic hard-delete path** and the operational retention policy should preserve the vacation-related evidence for at least the longer applicable five-year period.

### 20.13 Exact 8P-B1 source scope after approval

When 8P-A is approved for implementation, B1 should be limited to:

1. additive Payroll enums/models/relations in `apps/api/prisma/schema.prisma`;
2. additive `PAYROLL` in Prisma `AccountingJournalSource` and Accounting-owned non-Prisma contract mirror;
3. `apps/api/src/accounting/payroll/payroll-contracts.ts` for owner-local stable DTO/domain constants without Prisma types;
4. `apps/api/src/accounting/payroll/payroll-policy.ts` for pure field/state/config invariants only — **no statutory formulas yet**;
5. architecture coverage that:
   - keeps Payroll inside Accounting ownership;
   - forbids Payroll use of User/Store DB UUID identity;
   - forbids direct JournalEntry/JournalLine Prisma mutation outside `AccountingJournalService`;
   - prevents Payroll from mutating `AccountingTransaction`;
   - keeps Payroll transport absent until the later lifecycle API slice;
6. documentation synchronization in the Phase 9 Payroll doc, dependency graph, worklog and ID inventory.

B1 must **not** add:
- statutory tax-rate constants/formulas;
- Payroll HTTP controller/UI;
- Journal posting;
- Payroll CoA stable IDs before their durable data migration exists;
- employee-payment/CRA-remittance tables;
- PDF dependency;
- SIN/bank/T4/ROE data.

B1 is therefore a schema/contracts/guard foundation only.

### 20.14 8P-A closeout state

The field-level architecture, state machine, YTD bootstrap, CoA boundary, Journal-source/write-authority direction and B1 scope are now sufficiently specified for implementation review.

Remaining values such as SanQ's actual remitter type, employee TD1 values, EI reduced-rate status, vacation agreement and current-year same-employer YTD are **operator configuration/evidence**, not unresolved schema architecture.

Recommended state after user review:

**8P-A ANALYSIS COMPLETE / READY FOR 8P-B1 SCHEMA-CONTRACT IMPLEMENTATION / MIGRATION REQUIRED AFTER SOURCE REVIEW**.

## 21. 8P-B1 local implementation review state

8P-B1 is now locally implemented from merged `origin/dev@5e968136` and is intentionally limited to the approved schema/contracts/architecture foundation.

Implemented source scope:

- Prisma adds the six approved Payroll core models: `PayrollEmployer`, `PayrollEmployerConfigVersion`, `PayrollEmployee`, `PayrollEmployeeConfigVersion`, `PayrollEmployeeYearOpening`, and `PayrollRun`.
- Prisma adds the approved Payroll enums and adds `PAYROLL` to `AccountingJournalSource`.
- `PayrollRun` freezes employer/employee config references through their stable config identities, while Payroll-internal aggregate ownership may still use internal UUID relations.
- draft-input, effective-config, same-employer YTD opening, calculated-evidence completeness and immutable run-state transitions are pinned in owner-local pure policy code.
- Payroll production code remains framework/Prisma neutral in B1 and has no controller, service, repository, Journal writer or transport surface.
- architecture regression forbids User/Store DB relations, direct Journal/Transaction mutation, Payroll CoA provisioning and settlement-table pre-creation.
- ID inventory is refreshed to include the six Payroll models and their stable business identities.

Explicitly still absent:

- CRA/Ontario tax, CPP/CPP2 or EI formulas/constants;
- Payroll HTTP API or Web UI;
- Payroll Journal posting/write authority;
- Payroll CoA system-account provisioning;
- employee-payment / CRA-remittance settlement persistence;
- PDF dependency/pay-statement renderer;
- SIN, bank, T4 or ROE persistence.

### 21.1 Migration handoff

**MIGRATION REQUIRED.**

Reason: B1 adds persisted Prisma enums/models/relations and extends the persisted `AccountingJournalSource` enum with `PAYROLL`.

Suggested migration name: `phase9_payroll_b1_foundation`.

After the reviewed schema/source change is merged into `dev`, generate locally with:

`pnpm --filter api exec prisma migrate dev --create-only --name phase9_payroll_b1_foundation`

Expected generated SQL should be additive only: create the Payroll enums, add `PAYROLL` to the Accounting Journal source enum, create the six new Payroll tables, and create their approved unique/index constraints and Payroll-internal foreign keys.

There is no existing production Payroll table/data to rename or backfill. Review the generated SQL for enum alteration ordering, table/constraint names, nullable calculated fields, stable-config foreign keys and accidental destructive statements. No migration file was created or edited by MCP.

Promotion to `main` / production remains blocked until the user-generated migration is reviewed, committed and merged back into `dev`.

### 21.2 Local validation state

Per repository workflow, no local Prisma generation/validation, lint, build, Jest or architecture scanner execution is claimed before user review. The current state is **LOCAL SOURCE COMPLETE / REVIEW PENDING**, not CI-green or deployable.

### 21.3 B1 merged/migration closeout update

The earlier local-review state above has now advanced. The 8P-B1 source merged through PR #2387 / dev commit `6dae3bd8`. The duplicate effective-date indexes were removed before final migration alignment in `2110e508`, and the user-generated additive migration `20260918120954_phase9_payroll_b1_foundation` is present in dev at `963485a8`. The reviewed migration creates only the approved Payroll enums/tables/indexes/foreign keys and adds `PAYROLL` to `AccountingJournalSource`; no destructive/backfill/CoA data step is part of B1. B1 is therefore the merged persistence baseline for B2.

## 22. 8P-B2 Ontario statutory calculation core — local implementation review state

8P-B2 starts from `origin/dev@963485a8` and remains a **pure Accounting/Payroll calculation layer**. It does not add or alter Prisma persistence, HTTP routes, Nest providers, Journal writers, AccountingTransaction mutation, CoA provisioning, settlement tables, Web UI or package dependencies. No migration is required.

### 22.1 Versioned policy registry

The calculator selects statutory policy by **pay date** and records one of two distinct 2026 identities:

- `CA-ON-2026-01` — CRA T4127 122nd edition, effective 2026-01-01 through 2026-06-30;
- `CA-ON-2026-07` — CRA T4127 123rd edition, effective 2026-07-01 through 2026-12-31.

The 123rd edition states that the Option 1, CPP and EI formulas did not change for July 2026, so the two identities intentionally share the applicable 2026 Ontario/federal/CPP/EI parameters while preserving historical policy provenance.

The registry pins 2026 federal/Ontario brackets and constants, federal BPAF phaseout parameters, Ontario BPA/OHP/surtax/tax-reduction parameters, CPP/CPP2 limits/rates and EI limits/rate. Unsupported pay dates fail closed.

### 22.2 Supported calculation profile

`ON_HOURLY_SIMPLE_V1` supports:

- Ontario hourly regular earnings using integer minutes/rates;
- explicitly supplied overtime minutes/rate without aggregate-hour inference;
- CRA T4127 Option 1 periodic tax;
- federal/Ontario filed TD1 total claims or official no-form defaults;
- reviewed claim-code-E handling, with Ontario Health Premium retained;
- additional per-pay tax for standard treatment;
- CPP + CPP2 with YTD maxima;
- reviewed full-pay-period CPP exemption;
- EI insurable / reviewed non-insurable treatment and configured employer multiplier;
- vacation accrued or paid each run;
- paid vacation/top-up as the supported non-periodic earnings branch;
- deterministic YTD output/evidence for later B3 lifecycle freezing.

The profile continues to fail closed for commissions/TD1X, Quebec/QPP/QPIP/interprovincial transfers, RPP/RRSP/PRPP/RCA/source-deduction factors, union dues, taxable benefits, partial-period CPP proration, EHT, automatic vacation-entitlement-year top-up derivation and other inputs not represented by this simple profile.

### 22.3 CRA formula characterization

The pure statutory math layer pins:

- actual `P` values 52/53 weekly, 26/27 biweekly, 24 semi-monthly and 12 monthly;
- CPP basic exemption and annual maximum behavior;
- CPP2 YMPE/YAMPE threshold/max behavior;
- EI regular-pay formula/max;
- T4127 `F5 = C × (0.0100 / 0.0595) + C2` with proportional `F5A/F5B` allocation;
- federal Option 1 tax credits/brackets;
- Ontario base tax, surtax, OHP and tax reduction with dependent factor `Y = 0` for this profile;
- regular-bonus Step 1/Step 2 difference for supported paid-vacation non-periodic earnings.

Characterization includes the CRA regular-bonus example where `F5=$34.33`, `F5A=$9.81` and `F5B=$24.52`. It also pins the expected exact Option 1 result behind the published T4032 Ontario weekly `$615` claim-code-1 table case: the table displays `$54.00` because it is a range table, while the exact T4127 formula yields a `$53.86` characterization target.

### 22.4 Historical non-periodic YTD evidence

Exact regular-bonus tax requires more than the B1 headline `nonPeriodicEarningsYtdCents`: T4127 also needs the prior non-periodic additional CPP/CPP2 deduction allocation (`F5B_YTD`) and the related base CPP/EI credit evidence.

B2 does **not** expand the B1 schema merely to add those intermediate facts. Instead the calculator accepts versioned supplemental `nonPeriodicTaxEvidenceYtd` evidence and returns the updated evidence in its calculation output. B3 can derive/carry this evidence from earlier finalized SanQ calculation snapshots.

If an employee has same-employer prior non-periodic earnings but that exact supplemental evidence is unavailable (for example, an incomplete mid-year external opening), B2 returns structured `PRIOR_NON_PERIODIC_EVIDENCE_REQUIRED` and does not fabricate a plausible tax result.

### 22.5 Architecture and validation state

Production Payroll source through B2 remains framework- and Prisma-neutral. The B1 architecture regression is extended to enumerate the B2 pure calculator files and continues to prohibit Nest/Prisma access, direct Journal/AccountingTransaction mutation, Payroll CoA provisioning and settlement persistence.

Focused source characterization covers pay-date policy selection, official 2026 constants, CPP/F5 golden evidence, CPP2/EI maxima, federal BPAF/Ontario OHP, the exact weekly tax case, 52/53 and 26/27 schedules, vacation accrued/paid treatment, reviewed CPP/EI exceptions, claim code E, YTD maxima and structured fail-closed cases.

The local-review state above has advanced: 8P-B2 merged through PR #2388 / squash `bf175d2a` after final head `f6de240b` passed CI #5864 across Architecture and all API/Web lint/build/strict/test gates. B2 is therefore **MERGED / CI GREEN / NO MIGRATION** and is the runtime-calculation baseline for B3.

## 23. 8P-B3 Payroll lifecycle + canonical YTD API — local implementation review state

8P-B3 starts from merged `origin/dev@bf175d2a` and activates the B1/B2 Payroll foundation as an explicit Accounting-owned runtime vertical. It adds authenticated lifecycle/configuration transport and persistence orchestration, but deliberately does **not** activate Payroll Journal posting, employee-payment settlement, CRA-remittance settlement, correction/reversal posting, Pay Statement PDF rendering or Web UI.

### 23.1 Accounting-owned runtime boundary

B3 keeps one Accounting composition root and one Payroll transport adapter:

- `AccountingPayrollController` uses the existing Accounting `SessionAuthGuard + RolesGuard` policy and remains `ADMIN / ACCOUNTANT` only;
- external routes accept/return Payroll stable IDs, date-only strings and integer cents/minutes; internal Payroll UUID relations remain inside persistence services;
- `AccountingPayrollConfigService`, `AccountingPayrollEmployeeService`, `AccountingPayrollOpeningService`, `AccountingPayrollRunService`, `AccountingPayrollFinalizationService` and `AccountingPayrollYtdService` split the runtime by capability rather than reintroducing a broad Accounting facade;
- Payroll runtime consumes Prisma only through the existing Accounting-local `ACCOUNTING_DB / accounting-db.ts` seam. Payroll production source has no direct `@prisma/client` import, so B3 does not add a new Accounting -> Runtime direct-import allowance;
- architecture guards continue to reject Payroll direct mutation of `AccountingTransaction`, `AccountingJournalEntry` or `AccountingJournalLine`.

### 23.2 Config and same-employer opening lifecycle

Employer/employee configuration remains append-only and effective-dated. Service-side Serializable writes allocate monotonically increasing config versions and preserve stable config identities for later run freezing.

`PayrollEmployeeYearOpening` is editable only until the first run in that employee/tax year reaches APPROVED. The freeze is based on durable `approvedAt`, so a later VOID does not make previously consumed opening evidence editable again.

B3 closes one B1/B2 evidence gap for mid-year same-employer startup. If opening `nonPeriodicEarningsYtdCents > 0`, the B2 T4127 regular-bonus path also requires prior non-periodic credit/deduction evidence. The opening therefore gains three required integer-cent facts:

- `nonPeriodicCppBaseContributionYtdCents`;
- `nonPeriodicCppAdditionalDeductionYtdCents`;
- `nonPeriodicEiPremiumYtdCents`.

The policy requires all three to be zero when non-periodic earnings are zero. They are not given schema defaults: unknown historical evidence must not be silently rewritten as zero.

### 23.3 Canonical YTD derivation and pay schedule

Canonical YTD is rebuilt from first principles as:

`same-employer opening + earlier APPROVED/POSTED PayrollRun persisted facts`.

`DRAFT`, `CALCULATED` and `VOIDED` runs do not contribute. B3 does not trust the previous run's `ytdAfterJson` as a ledger; frozen snapshots remain calculation/approval evidence while the canonical aggregate is reconstructed from opening fields plus finalized run amount fields and persisted non-periodic contribution evidence.

The schedule helper derives the actual CRA pay-period count from `payScheduleAnchorDate`: weekly may resolve to 52/53, biweekly to 26/27, semi-monthly to 24 and monthly to 12. The resolved count is frozen on each calculated run.

### 23.4 Run state machine activated in B3

B3 exposes only the pre-Journal lifecycle:

- create/update `DRAFT`;
- `DRAFT -> CALCULATED`;
- explicit `CALCULATED -> CALCULATED` recalculation;
- editing a calculated run invalidates its evidence and returns it to `DRAFT`;
- `CALCULATED -> APPROVED`;
- `APPROVED -> VOIDED` only while no later finalized run for that employee exists.

Calculation freezes the effective employer/employee config stable IDs, policy/profile identity, resolved pay-period count, input/output JSON, `ytdBefore`, `ytdAfter` and a canonical SHA-256 calculation hash.

Approval runs inside the existing Accounting Serializable transaction helper. It validates the persisted hash, re-derives canonical YTD/effective configs, rebuilds the calculation, and requires the fresh hash to equal the frozen hash. A changed opening, newly finalized earlier run, effective config change or other calculation-input drift therefore returns a stale-calculation conflict and requires recalculation.

B3 intentionally exposes no `POSTED` or `REVERSED` mutation endpoint. Those states remain reserved for 8P-D Accounting Journal/correction authority.

### 23.5 B2 evidence correction discovered during B3

B3 review found one B2 output inconsistency: reviewed CPP-exempt or EI-non-insurable runs correctly deducted zero CPP/EI but still reported gross earnings as pensionable/insurable earnings. B3 corrects the headline bases so reviewed `EXEMPT_REVIEWED` CPP yields zero `pensionableEarningsCents`, and reviewed `NON_INSURABLE_REVIEWED` EI yields zero `insurableEarningsCents`. Focused B2 characterization is extended so canonical YTD cannot accumulate excluded earnings bases.

### 23.6 Migration handoff

**MIGRATION REQUIRED.**

Reason: B3 adds three persisted, required evidence columns to `PayrollEmployeeYearOpening`. No migration file is created or edited by MCP.

Suggested migration name:

`phase9_slice8p_b3_payroll_opening_non_periodic_evidence`

After the reviewed B3 schema/source PR is merged into `dev`, generate the companion migration in the user's verified disposable/local development database with:

`pnpm --filter api exec prisma migrate dev --create-only --name phase9_slice8p_b3_payroll_opening_non_periodic_evidence`

Expected SQL should add only the three integer columns above. Because they intentionally have no defaults and are required, review the target database first: if any `PayrollEmployeeYearOpening` rows already exist, the generated SQL must not be applied until a correct evidence backfill/staged constraint plan is defined. Do not replace unknown non-periodic evidence with zero merely to satisfy `NOT NULL`.

Promotion from `dev` to `main` / production remains blocked until the companion migration is generated locally, reviewed, committed and merged back into `dev`.

### 23.7 Local validation state

Per repository workflow, no local Prisma generate/validate, scanner, lint, build, strict TypeScript or Jest command is claimed during the local implementation phase. GitHub Actions is the authoritative validation gate after remote delivery.

The local-review state above has advanced: 8P-B3 merged through PR #2389 with final head `dc48ea9a`; CI #5868 passed Architecture and all API/Web lint/build/strict/test gates. The user-generated B3 companion migration is included in the merged `dev@dca67435` baseline. B3 is therefore **MERGED / CI GREEN / COMPANION MIGRATION MERGED** and is the runtime/API baseline for 8P-C.

## 24. 8P-C Payroll operator UI + pay-statement PDF — local implementation review state

8P-C starts from merged `origin/dev@dca67435`. It adds the operator-facing Accounting Payroll surface and finalized Pay Statement rendering while keeping statutory calculation authority in the B2/B3 backend and keeping all 8P-D financial posting/settlement work out of scope.

### 24.1 Operator UI boundary

The Accounting Web shell gains a first-class `/accounting/payroll` surface. It consumes only the authenticated B3 Accounting Payroll API and contains **no federal/Ontario tax, CPP/CPP2 or EI formula constants**.

The UI supports:

- employer selection/creation plus explicit effective-dated remitter type and EI employer multiplier;
- employee selection/creation plus explicit Ontario effective-dated pay frequency, pay-schedule anchor, hourly rate, Federal/Ontario TD1 mode/claim totals, reviewed claim-code-E treatment, additional per-pay tax, CPP/EI reviewed exception evidence and vacation treatment;
- same-employer mid-year Year Opening review/edit before approval, including all B3 non-periodic CPP/EI opening evidence;
- run create/edit, explicit overtime input, calculate/recalculate, server-result review, YTD review, approve/freeze and guarded void;
- finalized Pay Statement PDF download.

Browser code performs only display/unit conversion such as dollars<->integer cents and hours<->integer minutes. The server remains the sole statutory calculator and approval stale-check authority.

### 24.2 Pay Statement V1 evidence contract

`PAY_STATEMENT_V1` is frozen onto `PayrollRun.payStatementTemplateVersion` during `CALCULATED -> APPROVED`. The statement endpoint accepts only finalized `APPROVED / POSTED / REVERSED` runs and rejects DRAFT, CALCULATED and VOIDED facts.

The PDF snapshot is constructed only from the frozen run/config/evidence facts. It includes employer/employee name, pay period/date/frequency, regular/overtime/vacation earnings, gross pay, income tax, CPP/CPP2, EI, total deductions, net pay and selected YTD facts. It does not call or reimplement the statutory calculator.

Missing frozen amount/YTD evidence, unsupported template version or missing approval/config evidence fails closed. Successful statement export writes `PAYROLL_PAY_STATEMENT_EXPORT` to the existing Accounting audit log.

### 24.3 Shared PDF primitive and broken Accounting PDF repair

The previous Accounting report PDF implementation manually concatenated PDF objects/xref offsets and encoded UTF-8 text into built-in Helvetica. 8P-C removes that low-level writer and replaces it with one Accounting-owned PDFKit primitive used by both Financial Report PDF and Payroll Pay Statement PDF.

The shared primitive:

- streams PDFKit output to a real Buffer rather than manually computing byte offsets;
- fixes metadata dates from frozen evidence (or a deterministic fallback) rather than using ad-hoc timestamps;
- supports pagination and explicit money/text alignment;
- uses Noto Sans CJK TTC fonts for Unicode names/category labels in the production Alpine image;
- allows `SANQ_PDF_FONT_REGULAR` / `SANQ_PDF_FONT_BOLD` overrides;
- falls back to built-in Helvetica only for ASCII documents;
- fails closed for Unicode content when the CJK font is unavailable instead of silently producing mojibake.

The existing `GET /accounting/export/report.pdf` route is unchanged externally but now renders through PDFKit. Report export audit is written only after successful rendering, so a PDF render failure no longer records a false successful export.

### 24.4 Dependency/runtime packaging

The user explicitly authorized the new PDF dependency. Source declares:

- `pdfkit@^0.20.2` in API runtime dependencies;
- `@types/pdfkit@^0.17.6` in API dev dependencies;
- Alpine `font-noto-cjk` in the API runner image.

The SanQ MCP has no package-manager execution tool and the current lockfile does not already contain PDFKit's complete dependency graph. Therefore MCP intentionally does **not** hand-edit `pnpm-lock.yaml` or fabricate integrity metadata.

Before remote delivery, the user must run real pnpm against this branch/workspace so the lockfile is generated by pnpm:

`pnpm --filter api add pdfkit@0.20.2`

`pnpm --filter api add -D @types/pdfkit@0.17.6`

After that lockfile update is visible in the workspace, it must be reviewed before commit/PR. This is a dependency-lock handoff, **not a Prisma migration**; 8P-C changes no Prisma schema and requires no migration.

### 24.5 Architecture and validation state

Payroll production source still has zero direct `@prisma/client` imports and no direct `AccountingTransaction` / Journal delegate mutation. 8P-C adds no Payroll CoA, payment/remittance persistence, POSTED/REVERSED mutation path or 8P-D financial authority. The existing expected direct-import baseline therefore remains Foundation **1** / External **1** / Identity **2** / Runtime **4**, total **8**, public SCC empty.

Focused source coverage adds real PDF Buffer header/EOF characterization, Unicode-font fail-closed behavior and approval-time pay-statement-template freezing. Per repository workflow, no local package install, lint, build, strict TypeScript or Jest execution is claimed by MCP before user review.

8P-C has advanced beyond this local-review state. The user generated the PDFKit lockfile with repository-pinned pnpm 9.0.0, final PR head `54c82a1c` passed CI #5877 across Architecture plus API/Web install, lint, build, strict and tests, and PR #2390 squash-merged to `dev` as `b252382d`. 8P-C is therefore **MERGED / CI GREEN / NO PRISMA MIGRATION** and is the baseline for 8P-D.

## 25. 8P-D1 Payroll accrual Journal posting — local implementation review state

8P-D is deliberately split into four reviewable packages. D1 activates only approved-run accrual posting. Employee payment settlement remains D2, CRA remittance settlement remains D3, and posted-run reversal/correction/period-lock hardening remains D4.

### 25.1 Canonical accrual fact and Journal mapping

D1 defines `payroll.run.accrual.v1` as the canonical Accounting source fact for one finalized PayrollRun. Its deterministic Journal identity is:

- source: `AccountingJournalSource.PAYROLL`;
- kind: `STANDARD`;
- source fact stable ID: `PayrollRun.runStableId`;
- source fact version: `1`;
- idempotency key: `payroll-run-accrual:<runStableId>:v1`;
- occurred-at date: the frozen Payroll pay date;
- currency: CAD;
- Store attribution: the frozen run `storeStableId`.

The owner-specific policy rechecks the frozen calculation hash plus all headline components before producing any Journal. It requires:

- employee deductions = income tax + employee CPP + employee CPP2 + employee EI;
- net pay + employee deductions = gross pay;
- CRA remittance = employee deductions + employer CPP + employer CPP2 + employer EI;
- compensation expense = gross pay + accrued vacation;
- supported employer payroll cost = compensation expense + employer CPP + employer CPP2 + employer EI.

The exact D1 Journal is:

- debit `account_payroll_wages_expense` / category `expense_labor` for `compensationExpenseCents`;
- debit `account_payroll_employer_contributions_expense` / category `expense_labor` for employer CPP + CPP2 + EI;
- credit `account_payroll_net_pay_payable` for net pay;
- credit `account_payroll_income_tax_payable` for employee income tax withheld;
- credit `account_payroll_cpp_payable` for employee + employer CPP/CPP2;
- credit `account_payroll_ei_payable` for employee + employer EI;
- credit `account_payroll_vacation_payable` for accrued vacation pay.

Zero-value credit/contribution lines are omitted, but zero compensation cannot create an accrual Journal.

### 25.2 Payroll-specific write authority and atomic transition

The browser/controller does not receive generic Journal-write authority. `POST /accounting/payroll/runs/:runStableId/post` delegates to an Accounting Payroll posting service that consumes the existing Chart and Journal capabilities.

Posting uses one existing Accounting Serializable transaction. Inside that transaction:

1. the run must be `APPROVED` or an idempotent `POSTED` replay;
2. calculated evidence must be complete and the persisted calculation evidence hash must still reproduce exactly;
3. the Payroll-specific authority binds the frozen run identity/hash/pay date/Store and exact monetary components;
4. `AccountingJournalService` independently re-reads the PayrollRun and all seven Payroll control-account facts inside the same transaction;
5. normal Accounting period-start/period-lock/account/category/currency/balance/idempotency checks remain authoritative;
6. only after the Journal write succeeds does the same transaction perform `APPROVED -> POSTED`, freeze `postedJournalEntryStableId / postedAt`, and write `PAYROLL_RUN_POST` audit evidence.

A retry of an already POSTED run must reproduce the same authority and same Journal stable ID. A different Journal under the same finalized run identity fails closed.

Payroll production code still contains no direct JournalEntry/JournalLine mutation; the actual Journal persistence remains owned by `AccountingJournalService`.

### 25.3 CoA data-migration gate

**PAYROLL COA DATA MIGRATION REVIEWED / PRESENT ON THE D1 FEATURE BRANCH.**

This is a data-only Accounting Chart-of-Accounts provisioning step. It cannot be generated from `schema.prisma` by normal `prisma migrate dev --create-only` because D1 changes no Prisma schema. The durable migration must follow the existing Tip Revenue data-seed pattern and provision exactly these active CAD system accounts:

- `account_payroll_wages_expense` — EXPENSE;
- `account_payroll_employer_contributions_expense` — EXPENSE;
- `account_payroll_net_pay_payable` — LIABILITY;
- `account_payroll_income_tax_payable` — LIABILITY;
- `account_payroll_cpp_payable` — LIABILITY;
- `account_payroll_ei_payable` — LIABILITY;
- `account_payroll_vacation_payable` — LIABILITY.

No opening Journal/backfill is created by account provisioning.

Per `AGENTS.md`, MCP did not create or edit the migration. The operator added `20260918185000_phase9_slice8p_d0_payroll_coa` locally in commit `c4b9135b`. Review confirms that it is an additive data-only `AccountingAccount` seed using `ON CONFLICT ("accountStableId") DO UPDATE`, provisions exactly the seven required active CAD accounts with the expected EXPENSE/LIABILITY classes, and creates no Journal/opening/backfill facts.

With that durable evidence present, D1 now adds the same seven stable IDs to `DEFAULT_ACCOUNTING_ACCOUNTS`. `accounting-journal-boundary.architecture.spec.ts` includes the Payroll migration in the cumulative CoA seed set and separately pins each Payroll account name/class plus CAD/active/no-Journal constraints. Runtime posting still revalidates those account facts and fails closed if deployment state does not match the reviewed seed.

### 25.4 Scope deliberately deferred to D2-D4

D1 adds no `PayrollEmployeePayment` or `PayrollCraRemittance` persistence and no structural Prisma migration. It does not clear employee net-pay liability, does not record a CRA payment, and does not expose `POSTED -> REVERSED`.

Next packages remain:

- **8P-D2** — one-full-settlement employee payment fact + liability-clearing Journal;
- **8P-D3** — employer/remitter-period CRA remittance fact + immutable included-run/component evidence + liability-clearing Journal;
- **8P-D4** — explicit inverse Payroll reversal/correction, correction run linkage, retry/replay and period-lock hardening.

### 25.5 Local review state

Source now contains the D1 authority/policy, atomic posting service/controller route, posted-Journal DTO/UI evidence and focused characterization for mapping, stale authority, account prerequisite and replay behavior. The pre-existing finalization fixture's inconsistent supported-employer-cost example is corrected from 185200 cents to the calculator-consistent 177200 cents.

D1 changes no `schema.prisma`, package manifest or lockfile. The only migration in the feature branch is the operator-created/reviewed data-only Payroll CoA seed `20260918185000_phase9_slice8p_d0_payroll_coa`. Per repository workflow, no local lint/build/strict/Jest/scanner execution is claimed before remote CI.

Current D1 state: **MERGED / CI GREEN / COA DATA MIGRATION MERGED** through PR #2391, final head `266a91de`, CI #5884 and squash `3bae5682`.

## 26. 8P-D2 employee net-pay settlement — local implementation review state

8P-D2 starts from merged `origin/dev@3bae5682` and activates the second Payroll financial fact: actual employee payment. It does not change the D1 payroll accrual or statutory calculation. The settlement is explicitly one full payment per posted PayrollRun and clears only the employee net-pay liability.

### 26.1 Persisted settlement fact and public identity

D2 adds one Accounting/Payroll-owned model, `PayrollEmployeePayment`:

- internal UUID `id`;
- public/business `paymentStableId`;
- one required internal `runId` relation with a unique constraint, so a PayrollRun can have at most one employee-payment settlement;
- stable scalar `paymentAccountStableId`, never an `AccountingAccount.id` FK;
- frozen `amountCents`, `currency=CAD`, date-only `paymentDate`, optional operator reference;
- stable scalar `journalEntryStableId` evidence, never an `AccountingJournalEntry.id` FK;
- actor/time audit evidence.

The API exposes `GET/POST /accounting/payroll/runs/:runStableId/employee-payment`. The POST contract deliberately has **no amount field**. The server always takes the amount from the already-POSTED run's frozen `netPayCents`.

### 26.2 Full-settlement and account policy

Employee payment is allowed only when:

1. the PayrollRun is `POSTED`;
2. D1 accrual evidence (`calculationHash`, `postedJournalEntryStableId`, `postedAt`) is complete;
3. frozen `netPayCents` is positive;
4. `paymentDate >= payDate`;
5. the selected payment account is active, CAD, `ASSET`, and has `type=BANK|CASH`;
6. `account_payroll_net_pay_payable` remains active CAD `LIABILITY`.

`PLATFORM_WALLET` is intentionally rejected as an employee-payment source. A retry with the same run/account/date/reference replays the same persisted settlement; a changed replay fails closed.

### 26.3 Owner-specific Journal authority and atomicity

The D2 fact type is `payroll.employee-payment.v1`. Its only allowed Journal is:

```text
Dr account_payroll_net_pay_payable  = frozen PayrollRun.netPayCents
Cr selected BANK/CASH account       = same amount
```

There is no wage expense, employer-contribution expense, tax/CPP/EI liability movement, or labour category on this settlement Journal. Payment timing therefore never rewrites the original payroll accrual.

`AccountingPayrollEmployeePaymentService` creates the payment fact, asks the existing `AccountingJournalService` to write the owner-authorized Journal, freezes the returned Journal stable ID on the payment row and writes audit evidence inside one Accounting Serializable transaction. `AccountingJournalService` independently re-reads the payment fact, POSTED PayrollRun, referenced active D1 accrual Journal and both account facts immediately before persistence. Any failure rolls back both the payment row and Journal write.

### 26.4 Operator UI

The Payroll review UI adds a separate employee-payment panel only for POSTED runs. It reads the existing Accounting account list, exposes only CAD BANK/CASH choices, displays the frozen Net Pay as read-only settlement amount, accepts payment date/reference, and displays the resulting payment stable ID and Journal stable ID after success.

CRA remittance remains D3 and posted-run reversal/correction remains D4.

### 26.5 Migration review

**MIGRATION REVIEWED / ADDITIVE / MERGED TO `dev`.**

D2 changes `schema.prisma` by adding `PayrollEmployeePayment` and the one-to-one `PayrollRun.employeePayment` relation. Per `AGENTS.md`, MCP did not create or edit the migration; the user-generated migration is `apps/api/prisma/migrations/20260918200458_phase9_slice8p_d2_payroll_employee_payment/migration.sql`.

The reviewed SQL matches the intended schema exactly: it creates the new table, unique `paymentStableId`, unique `runId`, nullable unique `journalEntryStableId`, `runId -> PayrollRun.id` with `ON DELETE RESTRICT`, and the payment-date/account-date indexes. It contains **no drops, destructive renames, alteration of existing columns or historical backfill**.

PR #2392 final head `3e821f7f` passed PR CI #5888 across Architecture/API/Web gates after the stale source-text architecture assertion was corrected to assert canonical `PAYROLL_ACCOUNT_IDS.netPayPayable` reuse. The PR squash-merged as `6b1d2dcd`; post-merge CI #5889 also passed all required gates.

Current D2 state: **MERGED / CI GREEN / COMPANION MIGRATION MERGED**.

## 27. 8P-D3-A CRA remittance period / due-date policy — local implementation review state

8P-D3-A starts from merged `origin/dev@6b1d2dcd` and isolates CRA remittance calendar semantics before any D3 persistence or Journal write is introduced. It adds no Prisma model, migration, API route, UI, settlement fact or Accounting posting behavior.

### 27.1 Versioned pure policy

The framework-neutral `payroll-remittance-policy.ts` exposes `CA-CRA-REMIT-2026-V1` and derives a canonical remittance period from only the reviewed `PayrollRemitterType` plus the PayrollRun payday. The policy deliberately uses **payday**, not `PayrollRun.periodStart/periodEnd`, because CRA remittance timing is based on when remuneration is paid.

For 2026 Ontario Payroll it pins:

- `QUARTERLY`: calendar quarters, due on the 15th of the following month;
- `REGULAR`: calendar month, due on the 15th of the following month;
- `ACCELERATED_THRESHOLD_1`: 1-15 due the 25th of the same month, 16-month-end due the 10th of the following month;
- `ACCELERATED_THRESHOLD_2`: 1-7 / 8-14 / 15-21 / 22-month-end, due on the third CRA working day after the period end.

Nominal due dates that land on a Saturday, Sunday or CRA-recognized public holiday move to the next CRA working day. Threshold 2 working-day counting skips the same non-working dates. T4001 also calls Threshold 1/2 employers with only one payroll per month "monthly accelerated" remitters; D3-A does not add a fifth due-date algorithm because actual remuneration still lands in one of the reviewed Threshold bands. D3-B must create remittance facts only from included POSTED runs and must not synthesize empty accelerated bands.

### 27.2 Reviewed 2026 Ontario holiday boundary

The policy freezes the CRA-recognized 2026 public holidays relevant to the current Ontario-only Payroll profile. Quebec-only Saint-Jean-Baptiste Day is intentionally excluded. `2027-01-01` is included only as a carry-over holiday so a Threshold 2 period ending `2026-12-31` can calculate its third working day correctly; this does not make 2027 pay dates supported.

The reviewed policy therefore fails closed for a payday outside calendar year 2026. A future tax/remittance year must introduce a deliberately reviewed policy version rather than silently reusing the 2026 calendar.

### 27.3 Characterization and deferred D3-B scope

Focused tests pin monthly/quarterly boundaries, both Threshold 1 halves, all four Threshold 2 bands, weekend/holiday due-date movement, the 2026-12-31 cross-year working-day case, and unsupported-year rejection. The Payroll architecture regression now treats the remittance policy as part of the Prisma/Nest-neutral policy core.

D3-A deliberately keeps `PayrollCraRemittance` persistence absent. Employer-period remittance facts, immutable included-run/component evidence, server-authoritative preview/settlement, BANK-only payment authority, liability-clearing Journal and operator UI remain D3-B and will require a separately user-generated/reviewed additive migration.

Current D3-A state: **MERGED / CI GREEN / NO MIGRATION** through PR #2393, final head `58204478`, PR CI #5891, squash `73a70839` and post-merge CI #5892.

## 28. 8P-D3-B1 CRA remittance persistence + canonical preview — merged closeout

8P-D3-B1 starts from merged `origin/dev@73a70839`. It adds the durable employer-period remittance evidence shape and a read-only server-authoritative preview, but deliberately does **not** create a remittance settlement, payment Journal or Web payment action yet.

### 28.1 Persistence and identity

D3-B1 adds two Accounting/Payroll-owned UUID models:

- `PayrollCraRemittance` — public `remittanceStableId`, employer/remitter-period snapshot, policy version, due date, component totals, `currency=CAD`, unique canonical `evidenceHash`, nullable future payment account/date/reference and nullable unique Journal stable-ID evidence;
- `PayrollCraRemittanceRun` — immutable included-run evidence with internal `runId @unique`, frozen employer-config stable ID, calculation hash, D1 accrual Journal stable ID, payday and all seven CRA source-deduction/contribution components.

There is intentionally **no unique employer+period constraint**. CRA may receive a later supplementary remittance for another PayrollRun in the same statutory period. Instead, `PayrollCraRemittanceRun.runId @unique` guarantees that one PayrollRun can belong to at most one CRA settlement fact, while `PayrollCraRemittance.evidenceHash @unique` provides stable replay identity for one exact frozen run set.

Accounting Account and Journal references remain stable scalar IDs rather than cross-model FKs. The parent owns an internal FK to PayrollEmployer and each included-run row owns internal FKs to its parent remittance and PayrollRun, all with RESTRICT deletion.

### 28.2 Canonical preview and remitter-config transitions

The employer-level endpoint is:

`GET /accounting/payroll/employers/:employerStableId/cra-remittances/preview?anchorDate=YYYY-MM-DD`

The server resolves the effective employer config for the anchor date, derives the D3-A remittance period, then reads only unremitted `POSTED` PayrollRuns in that date window. Every candidate must retain frozen calculation hash, employer-config stable ID, D1 accrual Journal stable ID and posted evidence.

Each run's **own frozen employer config** is re-used to derive its remitter period. A run is included only when its frozen remitter type + period boundaries match the anchor period. This prevents an employer-config change inside a calendar month from silently moving old-type runs into the new remitter bucket.

The preview freezes and hashes sorted included-run evidence and independently verifies for every run:

`craRemittanceCents = incomeTax + employeeCPP + employeeCPP2 + employerCPP + employerCPP2 + employeeEI + employerEI`

Parent totals are then recomputed from those components. The browser never supplies or calculates a remittance amount.

### 28.3 D3-B2 handoff

D3-B1 exposes no settlement POST and does not write Journal rows. D3-B2 will consume `expectedEvidenceHash`, recompute the preview inside the Accounting Serializable transaction, create the parent + included-run rows, allow only an active CAD BANK payment account, and post exactly:

`Dr income-tax payable + Dr CPP/CPP2 payable + Dr EI payable / Cr selected BANK`

using employer-level `storeStableId=null`. It will also add identical-retry handling, Journal authority re-read of every frozen included run/accrual Journal, audit evidence and the employer-level Web settlement panel.

### 28.4 Migration review

The user-generated migration `20260918215432_phase9_slice8p_d3_cra_remittance` is present on PR #2394 head `ec10eb60` and has been reviewed against the current `schema.prisma`.

The SQL is additive and matches the intended D3-B1 persistence shape: it creates `PayrollCraRemittance` and `PayrollCraRemittanceRun`, the expected stable/evidence/Journal unique indexes, `PayrollCraRemittanceRun.runId` uniqueness, ordinary date/employer indexes, and RESTRICT FKs to PayrollEmployer, PayrollRun and the parent remittance. It contains **no drop, rename, backfill, enum rewrite or alteration of existing Payroll rows**. Nullable `journalEntryStableId` uniqueness is compatible with PostgreSQL's multiple-NULL unique-index semantics.

PR CI #5894 passed Prisma generation, the architecture baseline gate and the full Web job, but API lint failed one type-aware test matcher in `accounting-payroll-cra-remittance.service.spec.ts` (`@typescript-eslint/no-unsafe-assignment`). The redundant nested matcher was removed and pushed in `6f0929f4`. CI #5895 again passed Prisma generation, Architecture and Web, then failed only on the follow-on unused `prisma` fixture; `e017cd85` removed that stale destructure. CI #5896 passed API lint, API build, strict declaration checks, shared strict and the full Web job, then failed only in `accounting-controller-vertical-boundary.architecture.spec.ts`: the explicit Payroll capability allowlist and exact authenticated Accounting route inventory had not yet been extended for `AccountingPayrollCraRemittanceService` and `GET payroll/employers/:employerStableId/cra-remittances/preview`. D3-B1 production source, migration and focused Payroll tests passed. The local follow-up updates only those two explicit 8A architecture inventories.

The migration-bearing D3-B1 source is now merged to `dev`; PR CI #5897 and post-merge CI #5898 are green. Production promotion remains governed by the normal dev→main release/deployment gate.

Current D3-B1 state: **MERGED / CI GREEN / COMPANION MIGRATION MERGED** through PR #2394, final head `f35249af`, PR CI #5897, squash `95cfbf70` and post-merge CI #5898.

## 29. 8P-D3-B2 CRA remittance settlement / Journal / employer UI — local implementation review state

8P-D3-B2 starts from merged `origin/dev@95cfbf70`. It completes the executable CRA settlement path on top of the reviewed D3-B1 persistence/evidence model. **No Prisma schema or migration change is required.**

### 29.1 Server-authoritative settlement

The write endpoint is:

`POST /accounting/payroll/employers/:employerStableId/cra-remittances`

The client supplies only `anchorDate`, `expectedEvidenceHash`, `paymentAccountStableId`, actual `paymentDate` and optional `reference`. It cannot supply amount or CRA component totals.

Inside one Accounting Serializable transaction the service:

1. checks whether the unique evidence hash already belongs to an identical completed settlement and returns that immutable fact on an exact replay;
2. recomputes the D3-B1 preview from currently unremitted POSTED PayrollRuns;
3. requires `expectedEvidenceHash` to match the recomputed preview;
4. requires at least one positive included Payroll liability and `paymentDate >= max(included run payDate)`;
5. creates the parent remittance and immutable included-run evidence rows;
6. reads the three Payroll liability accounts plus the selected payment source;
7. builds and writes the owner-specific Payroll CRA Journal;
8. freezes the resulting Journal stable ID on the remittance;
9. writes `PAYROLL_CRA_REMITTANCE_POST` Accounting audit evidence.

The B1 `evidenceHash @unique` and child `runId @unique` remain the database concurrency/idempotency backstops. A race that consumes the same PayrollRun is retried/recomputed rather than silently duplicating the liability settlement.

### 29.2 Journal authority

D3-B2 adds source fact `payroll.cra_remittance.v1`. Its Journal is employer-level with `storeStableId = null` and actual payment date as `occurredAt`:

`Dr income-tax payable + Dr CPP/CPP2 payable + Dr EI payable / Cr selected BANK`

Only positive liability lines are emitted. The payment source must be an **active CAD ASSET/BANK** account; CASH and PLATFORM_WALLET are rejected. No wage expense, employer-contribution expense or labor category is touched.

The Accounting Journal writer independently re-reads, immediately before persistence:

- the complete remittance parent fact and its frozen payment fields;
- every child included-run evidence row;
- every current PayrollRun, which must remain POSTED and match frozen config/calculation/accrual/component evidence;
- every referenced D1 `payroll.run.accrual.v1` Journal, which must remain active and point to the expected run;
- all three Payroll liability accounts and the selected BANK account.

Any drift fails closed before the Journal is written. Normal Accounting start-date and period-lock rules continue to apply through the existing Journal writer.

A real payment after the statutory `dueDate` is allowed and remains dated to the actual payment date. D3-B2 does not rewrite late payments to the due date. Payment before the latest included Payroll pay date is rejected both by settlement orchestration and by the pure Journal authority.

### 29.3 Read surface and employer-level UI

D3-B2 adds a period-scoped history read:

`GET /accounting/payroll/employers/:employerStableId/cra-remittances?anchorDate=YYYY-MM-DD`

This is intentionally separate from the unremitted preview. Because one statutory period may have a later supplementary remittance, the UI needs both the remaining canonical preview and already completed immutable settlements.

The Payroll page now exposes an employer-level CRA panel. It loads active Accounting accounts, canonical preview and completed period remittances; it offers only active CAD BANK accounts, shows the server-owned tax/CPP/CPP2/EI breakdown and included runs, never renders an editable amount, warns without blocking when the actual payment date is later than CRA due date, and refreshes preview/history after posting.

### 29.4 Characterization / architecture boundary

Focused coverage now pins:

- canonical liability-only Journal shape and `storeStableId=null`;
- BANK-only payment authority and rejection of CASH / PLATFORM_WALLET;
- late-payment acceptance and pre-payday rejection;
- canonical parent/component reconciliation and tamper rejection;
- service hash mismatch, exact replay, period history and atomic Journal/audit path;
- Journal-writer re-read failure on changed PayrollRun, deleted accrual Journal or changed BANK authority;
- exactly one Payroll production caller of `createPayrollCraRemittanceJournalInTx`;
- exact authenticated Accounting route inventory including preview/list/POST;
- POST contract excludes amount and CRA components.

D3-B2 introduces no package/lockfile change, no scanner allowance, no new public context edge, no Prisma model/ID and no migration. Per repository workflow no local lint/build/strict/Jest/scanner run is claimed before user review.

Current D3-B2 state: **LOCAL SOURCE REVIEW PENDING / NO MIGRATION / NO LOCAL CI CLAIMED**.
