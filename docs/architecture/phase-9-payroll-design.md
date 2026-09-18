# Phase 9 Payroll Vertical — Readiness, Design and Closeout Gate

Status: **8P-B1 LOCAL SOURCE COMPLETE / REVIEW PENDING — MIGRATION REQUIRED**  
Planning date: 2026-09-16  
Implementation baseline: `origin/dev@5e968136` (PR #2386 merged)  
Current implementation branch: `feat/phase9-slice8p-b1-payroll-foundation-dev2386`

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
