# SanQ Post-Modularization Backlog

Status: **ACTIVE / PRIORITIZED POST-MODULARIZATION ROADMAP — DO NOT REOPEN THE CLOSED MODULARIZATION PROGRAM**  
Created: 2026-09-19  
Priority audit: 2026-09-19  
Priority-audit base: `origin/dev@835bc2a1`  
Modularization closeout reference: PR #2420 / `835bc2a1`  
Authoritative architecture status: repository-wide modularization is **SOURCE / ARCHITECTURE COMPLETE / CLOSED**.

## 1. Purpose

This file is the single cross-project execution queue after repository-wide modularization closeout.

It is **not** a new modularization Phase. Each implementation batch still follows `AGENTS.md`: refresh latest `origin/dev`, read the owning architecture/CI rules, perform a read-only readiness audit, make the smallest owner-correct change, stop after local diff/status review, and wait for explicit authorization before remote PR/CI delivery.

This roadmap is intentionally dependency-aware rather than a simple numeric to-do list. Work is ordered by:

1. **operational risk** — production-loss / duplicate-operation / recovery risk comes before cosmetic cleanup;
2. **unlock value** — a foundation that stabilizes several later tasks comes before its consumers;
3. **rework avoidance** — do not automate or polish a workflow that is about to change;
4. **complexity / blast radius** — large cross-surface or persistence work is split behind smaller readiness gates;
5. **external gating** — Uber/Clover/real-world evidence does not block internally executable work.

Complexity labels are relative repository effort, not time estimates:

- **L** — narrow, low-coupling change;
- **M** — one subsystem or several coordinated surfaces;
- **H** — cross-surface or reliability-sensitive change with significant regression scope;
- **XL** — major dependency/persistence/provider/workstation cutover with broad verification requirements.

## 2. Executive execution order

The recommended order is:

```text
Wave 0 — immediate safety / reproducibility / migration preparation
  ├─ Uber Direct durable dispatch
  ├─ backup / recovery drill
  ├─ Docker pnpm pin
  ├─ no-op NotificationProcessor cleanup
  ├─ AWS SMS / SES / SNS production-migration preparation
  └─ SanQ MCP behavior tests

Core Lane A — Identity / PWA / workstation
  A1 Unified Staff login + surface authorization
    ↓
  A2 Accounting PWA direct launch
    ↓
  A3 Printer-agent hardening (recommended before workstation cutover)
    ↓
  A4 Windows POS PWA + dual display
    ↓
  A5 Browser E2E stage 2 / workstation coverage

  A1 + A2
    ↓
  A5 Browser E2E stage 1 / stable browser journeys

Core Lane B — Accounting / reporting
  B0 Document recognition + human review safety
    ↓
  B1 Expense -> canonical Journal
    ↓
  B2 Canonical Sales Analytics
    ↓
  B3 Trial Balance + Balance Movement
    ↓
  B4 Accounting reporting polish
    ↓
  B5 Admin “经营报表” redesign

Parallel product lane
  └─ Admin Marketing Overview

Later engineering hardening
  ├─ runtime readiness / health
  ├─ Admin Members test-overlap cleanup
  ├─ TypeScript strictness
  ├─ Prisma 6 -> 7
  └─ large-file decomposition only when touched

Provider / real-world triggers
  ├─ UberEats Production
  ├─ Clover POS production cutover
  │    ↓
  │  Web Clover v1 -> Unified
  │    ↓
  │  CheckoutIntent durable-fact contraction
  └─ Phase 9 deferred real evidence
```

Provider-triggered work may jump ahead of the normal internal queue when a real provider/test/merchant window opens. That is intentional: external access is scarce and these gates should be exercised while available.

## 3. Wave 0 — immediate safety and low-coupling foundations

These items may run independently or in small focused PRs. They should not be bundled with Accounting, Staff login, Clover or UberEats production cutovers.

### 3.1 Uber Direct durable dispatch

Priority: **P0 / FIRST RELIABILITY PROJECT**  
Complexity: **H**  
State: **SOURCE REVIEWED / PRODUCTION VERIFICATION PENDING / DIRECT REPLACEMENT / NO MIGRATION**  
External gate: **production verification only**  
Blocks: no current product task, but removes a real duplicate/missing-delivery failure window.

The historical private `order.paid.verified` Uber Direct fast path is removed rather than retained behind a compatibility flag. The 2026-09-19 source hardening directly replaces it with an Orders-owned durable `OpsEvent` attempt journal/processor plus ADMIN+MFA reconciliation. There is no historical Uber Direct Order population to migrate. Each dispatch cycle performs the initial provider create plus up to **3 automatic retries** only when the provider outcome proves retry is safe, with 2s/5s/10s backoff. Local validation failures skip pointless retries and notify immediately. Timeout/no-response/5xx/ambiguous outcomes are UNKNOWN and never automatically retried because another POST could create a duplicate courier.

FAILED / UNKNOWN reuse the existing Admin delivery-dispatch Email-first / SMS-fallback alert path and deep-link to the Admin `/delivery-dispatch` page. After the automatic retry allowance is exhausted, the alert/page preserves the per-attempt HTTP status/reason/error history; the Admin page also exposes the checkout-derived recipient, phone, address and delivery instructions needed for manual Dashboard creation. For FAILED, Admin may fix the cause and start a new SanQ cycle (again with up to 3 safe automatic retries), or create a delivery manually in Uber Direct Dashboard and then return to SanQ to bind its internal `orderUuid`. For UNKNOWN, Dashboard verification by SanQ order number is mandatory before either binding an existing delivery or authorizing a new SanQ attempt.

Target:

- make dispatch intent/result durably recoverable and idempotent;
- prevent restart/network ambiguity from blindly creating a second courier delivery;
- automatically absorb transient/repeated **provably safe** failures with up to 3 retries before notifying Admin;
- preserve detailed failure evidence for operational diagnosis;
- support reconciliation after “provider succeeded / local persistence unknown”;
- actively alert Admin recipients through the existing delivery-dispatch notification route and provide a guarded Admin reconciliation UI;
- preserve existing Orders / Uber Direct ownership boundaries;
- do not deepen the current CheckoutIntent dependency merely to solve replay.

The later CheckoutIntent contraction (§8.3) will move permanent destination/preparation facts to Order ownership; durable dispatch should be designed so that destination-source replacement can happen without redesigning the durability mechanism.

### 3.2 Backup / recovery drill

Priority: **P0 OPS EVIDENCE**  
Complexity: **M operational / low source coupling**  
External gate: **none**

Backups are useful only if restoration is proven.

Record a current recovery drill that verifies:

- PostgreSQL restore into a safe non-production target;
- uploads-current / uploads-history recovery;
- protected configuration recovery procedure;
- expected ordering between DB/files/config;
- recovery integrity checks and operator runbook.

This is evidence work, not a reason to rewrite the backup system.

### 3.3 Docker pnpm reproducibility pin

Priority: **P0 QUICK HARDENING**  
Complexity: **L**  
External gate: **none**

Root/CI pin pnpm `9.0.0`, while both `Dockerfile.api` and `Dockerfile.web` currently bootstrap `pnpm@latest`.

Replace runtime image build bootstrap with the repository-pinned pnpm version so CI, developer install and Docker build do not silently use different major/minor package-manager behavior.

Keep this separate from broader Compose readiness work (§7.1).

### 3.4 Remove no-op NotificationProcessor

Priority: **P0 QUICK HYGIENE**  
Complexity: **L**  
External gate: **none**

`NotificationProcessor` currently only logs on module init that automatic invoice mail is disabled and has a no-op destroy hook. It is imported and registered by `OrdersModule`, but has no runtime processing responsibility.

After a focused readiness check confirms no dynamic registration assumption remains:

- remove the shell and module registration;
- preserve manual thank-you/invoice behavior unchanged.

### 3.5 Preserve AWS SNS + prepare SMS/SES production migration

Priority: **P0 MIGRATION PREPARATION / PROVIDER CUTOVER**  
Complexity: **M**  
External gate: **September AWS billing evidence + AWS SMS/SES Production approval**  
Authorization note: **any dependency/lockfile change still requires explicit user approval before implementation.**

The earlier SNS/SQS runtime used for Clover HCO queueing was retired, but the later messaging-provider plan intentionally reuses **SNS** for the upcoming AWS messaging cutover. Do **not** remove `@aws-sdk/client-sns` as dead dependency residue.

Current source already contains selectable AWS provider paths for both messaging channels:

- SMS: `AwsSmsProvider` selected by `SMS_PROVIDER=aws`;
- Email: `SesEmailProvider` selected by `EMAIL_PROVIDER=ses`.

Production configuration currently remains on **Twilio** for SMS and **SendGrid** for email. The target is to move both production channels to AWS after the September AWS bill provides the billing/usage evidence needed for the Production-access applications.

Approved migration sequence:

1. after the September AWS bill is available, submit the AWS SMS and SES Production-access applications;
2. retain/re-establish SNS topics and SanQ HTTPS webhook handling for required delivery/bounce/complaint/status events;
3. do **not** restore SQS merely for the migration — add queueing later only if a separately reviewed reliability requirement justifies it;
4. move email from SendGrid to SES first and verify send, delivery, bounce/complaint and suppression behavior;
5. move SMS from Twilio to AWS and verify production delivery/status behavior;
6. after an accepted stability window, retire SendGrid/Twilio as the primary production paths through separately reviewed cleanup.

`apps/api/package.json` still also carries `@aws-sdk/client-sqs`, `sqs-consumer` and `@types/sqs-consumer`, and the 2026-09-19 audit found no current source usage of those SQS-only packages. They remain cleanup candidates, but do not combine their removal with SNS cleanup and do not create package/lockfile churn before the messaging cutover readiness audit.

### 3.6 SanQ MCP behavior tests

Priority: **P0 TOOLING HARDENING**  
Complexity: **M**  
External gate: **none**

CI currently performs only `python3 -m py_compile ops/sanq-mcp/server.py`.

Add focused behavior tests for safety-critical contracts such as:

- production/workspace path separation;
- sensitive-path rejection;
- command allowlists;
- Git branch/write restrictions;
- read-only DB SQL policy;
- secret/token redaction;
- bounded output handling.

Do not weaken the current MCP safety boundary to simplify tests.

## 4. Core Lane A — Identity, PWA and Windows workstation

This lane should be executed in order because later PWA/workstation/browser tests depend on stable authentication and surface routing.

### 4.1 A1 — Unified Staff login + surface authorization

Priority: **P0 CORE FOUNDATION**  
Complexity: **H**  
External gate: **none**  
Hard unlocks: Accounting PWA direct launch, Windows POS PWA, stable Staff/PWA E2E.

Target role matrix remains:

```text
ADMIN      -> Admin + Accounting + POS
ACCOUNTANT -> Accounting only
STAFF      -> POS only
```

This is not merely a visual login-page merge.

Current source has separate Admin, Accounting and POS login flows. Admin/Accounting call the same Auth owner with duplicated presentation/routing, while POS also carries device-enrollment semantics. The current Admin protected layout admits `ADMIN / STAFF / ACCOUNTANT`, and several Admin APIs intentionally admit STAFF for legacy operational/member-management use. Therefore this task needs an explicit readiness audit of **surface authorization**, not only login presentation.

Required design:

- one Identity-owned Staff authentication entry/contract;
- common password / Google OAuth / MFA/session semantics;
- deterministic role landing;
- requested-destination handling without open redirects;
- no redirect loops between Admin, Accounting and POS;
- preserve POS device enrollment/device-key requirements;
- enforce the accepted surface matrix in Web layouts/middleware and the relevant API authorization boundaries.

Do **not** automatically fold the full Admin Members STAFF/ADMIN identity-test cleanup (§7.2) into this slice. A1 must prevent STAFF/ACCOUNTANT from entering unauthorized application surfaces; the deeper membership-test identity overlap may remain until replacement E2E fixtures exist.

### 4.2 A2 — Accounting PWA direct-launch correction

Priority: **P1**  
Complexity: **M**  
Depends on: **A1**

Admin and Accounting already have distinct PWA identities/manifests, but Accounting direct launch must be proven against the unified login/landing model.

Target:

- installed Accounting PWA opens its own Accounting entry;
- unauthenticated launch reaches the unified Staff login with a safe return destination;
- ADMIN and ACCOUNTANT return to Accounting after successful authentication;
- STAFF cannot enter Accounting;
- refresh, expired session, locale and cached/PWA launch paths behave consistently;
- no requirement to visit Admin first.

Do not fix this first by adding more Accounting-specific authentication behavior that A1 would later remove.

### 4.3 A3 — Printer-agent package / test hardening

Priority: **P1 RECOMMENDED WORKSTATION PREPARATION**  
Complexity: **H**  
Depends on: none strictly  
Recommended before: **A4 Windows POS workstation cutover**  
Authorization note: any new/changed dependency manifest requires explicit approval.

`tools/printer-server` is a real independently deployed Windows production boundary but is not a pnpm workspace package and remains a large standalone script.

Target:

- make dependency/install state reproducible from repository root;
- preserve enrollment, WebSocket/job ACK and deployed print wire behavior;
- add deterministic/golden coverage for receipt, kitchen and label rendering;
- cover reconnect/dedupe behavior;
- separate transport/render/Windows adapter concerns only where it creates testability or operational value;
- add package/test smoke coverage appropriate to CI.

Do not perform a cosmetic “split the big file” rewrite.

### 4.4 A4 — Windows POS PWA + dual-display workstation

Priority: **P1/P2 WORKSTATION PROJECT**  
Complexity: **XL**  
Hard depends on: **A1**  
Recommended after: **A3**

There is currently no dedicated POS PWA manifest comparable to Admin/Accounting. POS also has unique device enrollment cookies and workstation responsibilities.

Target workstation behavior:

- employee main display launches POS as the primary installed app/window;
- second non-touch display launches `/[locale]/store/display`;
- customer display remains read-only;
- existing POS/customer-display synchronization remains authoritative;
- device enrollment/store scoping remains intact;
- define Windows startup, restart, full-screen and recovery;
- define PWA update/cache behavior;
- preserve a manual launch/sync fallback;
- verify printer-agent connectivity/recovery on the same workstation.

This should be a dedicated workstation project, not a small PWA-manifest patch.

### 4.5 A5 — Critical browser E2E, staged

Priority: **P1 QUALITY GATE**  
Complexity: **H**  
Dependency authorization: **required if Playwright or another browser-test package is added.**

Current Web has Jest tests but no configured browser E2E runner, no `test:e2e` script and no Playwright/Cypress project configuration. The `@playwright/test` lockfile occurrence is only Next's optional peer declaration, not an installed SanQ E2E stack.

Avoid writing exhaustive UI automation. Build a small stable regression suite in two stages.

**Stage 1 — after A1 + A2 stabilize**

Cover:

- Staff login / MFA / role landing;
- Accounting PWA/browser direct entry;
- customer quote -> checkout -> controlled payment-success boundary;
- member benefits/points/balance/coupon journey.

Provider calls must be controlled/test doubles; browser CI must not perform real Clover charges.

**Stage 2 — after A4**

Add:

- POS authenticated/device-bound entry;
- order acceptance -> durable PrintJob handoff;
- PWA launch/reload paths;
- workstation-relevant POS/display flows.

Physical printers and real Clover hardware remain separate production/device verification.

## 5. Core Lane B — Accounting and reporting

This lane follows `ACCOUNTING_PRODUCT_ROADMAP.md`. Phase 9 remains closed.

### 5.1 B0 — Document recognition + human review safety

Priority: **P0 ACCOUNTING CORRECTNESS / BEFORE NEW FINANCIAL FEATURES**  
Complexity: **H / XL only if a new OCR runtime is later adopted**  
State: **SLICE 0 MERGED (#2428 / `bbd0b1c0`) / SLICE 1 + MIGRATION MERGED (#2429 / `1903b32a`, CI #6017 GREEN) / SLICE 2 MERGED (#2431 / `e52c44b9`) / SLICE 3 MERGED (#2432 / `caabf1c1`, CI GREEN) / EVIDENCE VIEWER SLICE 1 MERGED (#2435 / `0371a155`, CI #6039 GREEN) / SLICE 1B MERGED (#2436 / `9ae4d85d`, CI #6042 GREEN) / SLICE 1B MIGRATION SQL REVIEWED (`cc4c8016`) / EVIDENCE VIEWER SLICE 2 MERGED (#2438 / `4d68379e`, CI GREEN) / SLICE 3V-A MERGED (#2439 / `0d6909bb`, PR CI #6054 + MERGED-HEAD CI #6055 GREEN) / SLICE 3V-B MERGED (#2440 / `0ac9117f`, PR CI #6057 + MERGED-HEAD CI #6058 GREEN) / RELIABILITY SLICE A MERGED (#2442 / `994f5a67`) / RELIABILITY SLICE B MERGED (#2443 / `6e89bc3b`, NO MIGRATION) / ORIGINAL SLICE C UX MERGED (#2445 / `da77b9a5`, CI #6074 GREEN) / 3V-B PRODUCTION VERIFICATION PENDING**  
External gate: **none; active production verification remains for Slice 3V-B scanned-PDF routing**  
Detailed plan: `docs/architecture/accounting-document-recognition-human-review-plan.md`

Two real provider-evidence cases exposed a workflow-level correctness gap rather than a remaining Phase 9 modularization defect. An Uber monthly PDF lost label/value layout when Poppler plain text was parsed, causing `Tax on Sales` to inherit the Sales amount while the source `Net Total` remained correct; because settlement planning currently proves only Journal balance, the malformed normalized document could still reach READY. A separate Fantuan Summary Adjustment correctly failed closed until a Detail workbook was supplied, but also demonstrated that the operator cannot create a durable reviewed resolution when machine extraction or semantic mapping needs human intervention.

Target:

- add provider control-total reconciliation before settlement READY;
- preserve original source and machine extraction as immutable evidence;
- add a versioned Human Review Revision instead of silently mutating parser output;
- distinguish extraction correction, semantic classification and supplementary evidence;
- bind Shadow Preview/replay authority to the exact reviewed revision/hash;
- keep XLSX/CSV on native structured parsers and converge PDF/image recognition behind an Accounting-owned extraction boundary;
- keep native-text PDFs local-first with Poppler text+bbox; treat scanned PDFs as a bounded local page-rasterization problem and call synchronous Textract per rendered image page, then merge page-aware extraction evidence;
- do not introduce S3/async Textract, Paddle/BDA or a new OCR dependency for the normal path without a new explicit architecture decision;
- unify source-evidence access behind authenticated `artifactStableId` delivery so normal inspection opens an online viewer and downloading is an explicit operator action;
- organize retained Accounting evidence with logical folders/assignments only; never physically move source binaries merely to change the operator-visible folder. Allow audited multi-file moves, including confirmed/posted evidence, because organization state is separate from financial authority;
- expose bounded CSV/XLSX structured preview through the authenticated artifact stable-ID boundary, rendering plain text values only and never executing formula/macro/external-link behavior;
- do not introduce suspense accounting merely from this planning decision.

The original implementation sequence through layout-aware Slice 3 is merged. The historical Uber July document has already been Human-Reviewed/corrected and posted, so PDF verification remains read-only and does not reopen that Journal/settlement. Slice 3V is split: **3V-A** native-PDF usability + sanitized Poppler golden is merged in PR #2439, and **3V-B** bounded scanned-PDF page raster/Textract is merged in PR #2440 as `0ac9117f` after final head `3c5c0400`, with PR CI #6057 and merged-head CI #6058 green. 3V-B removes the raw-PDF Textract fallback: scan candidates are bounded to 6 pages, rasterized locally/sequentially at 200 DPI with existing Poppler, sent to synchronous Textract as page images, and merged only from LINE text/confidence/geometry with original page identities. AnalyzeExpense semantic totals/tax/line items do not become provider authority; page/resource failures abort the whole OCR result, while Provider API remains on its existing CSV-owned path. Source/CI work is complete; active production verification of the new scanned-PDF path remains pending. Evidence Viewer Slice 1/1B/2 are merged; Slice 1B's additive user-generated migration `20260921124637_add_accounting_evidence_folders` remains reviewed as matching the schema change with no backfill/drop/rename/physical-file mutation.

### 5.2 B1 — Expense -> canonical Journal

Priority: **P0 CORE FINANCIAL FOUNDATION**  
Complexity: **H / potentially XL if Accounts Payable persistence is chosen**  
External gate: **none**  
Hard unlocks: canonical reporting, Trial Balance, Balance Movement.

Do this first.

Production now runs the B1-A/B1-B/B1-C0 stack and has real replacement evidence for the Expense Journal cutover.

**B1-A state:** **PRODUCTION DEPLOYED / MIGRATION VERIFIED**. B1-A merged in PR #2448 as `8614633a` after CI #6082 passed. The companion migration `20260921224139_post_mod_accounting_b1a_expense_split_ownership` is applied in production and `AccountingExpenseSplit` exists.

**B1-B state:** **PRODUCTION VERIFIED / CI GREEN / NO JOURNAL REPORT CUTOVER**. PR #2449 merged to `dev` as `324a16eb` after final head `acb8db42` passed CI #6086. Real reviewed Expense `expense_iet91ut05fafso8rl48kds9v` persisted one Expense-owned split and one complete payment allocation and atomically produced one canonical Expense v1 Journal.

**B1-C0 state:** **PRODUCTION PARITY EVIDENCE PASSED / MERGED / CI GREEN / READ-ONLY**. PR #2450 merged as `f164be7a` after CI #6090. Full-range production reconstruction from accounting start date 2026-06-01 shows zero split mismatch and zero missing/duplicate/orphan/non-v1 Journal anchors; Expense P&L 7495 cents, recoverable tax 974 cents, primary-bank movement -8469 cents and OPERATING cashflow -8469 cents all match legacy evidence exactly.

**B1-C1 state:** **PRODUCTION VERIFIED / MERGED / CI GREEN / NO MIGRATION / NO GRAPH CHANGE**. PR #2452 merged to `dev` as `cdd3b47a` after final head `dc849d20` passed CI #6099. Production now runs the cutover; post-cutover Expense `expense_bmwt1anetgvhiglbc6wsjzf8` proves zero legacy Transaction write while preserving ExpenseSplit + canonical Journal authority and Journal-driven P&L/account-balance/cashflow behavior.

**B1-C2 state:** **PRODUCTION VERIFIED / CLOSED / MIGRATION DEPLOYED / NO GRAPH CHANGE**. Source merged through PR #2456 / `1cd8ee92`; migration `20260922041449_post_mod_accounting_b1c2_drop_legacy_accounting_transaction` is committed at `24e99b40`, CI #6110/#6111 passed and production applied it at `2026-09-22T04:34:24Z`. Production confirms the retired table/enum are absent, both legacy diagnostics are unregistered, and no post-deploy Prisma/relation errors occurred. Post-migration Expense `expense_v618ly4fflr6jzyvgeiz3e16` created one ExpenseSplit, one complete 3287-cent payment allocation and one balanced three-line canonical Expense Journal with debit=credit=3287. `accounting.expense-split-ownership.v1` is closed; B2 Canonical Sales Analytics is now unblocked for readiness audit.

Target:

- ExpenseDocument remains document/evidence owner;
- deterministic Expense-owned Journal posting;
- preserve category, recoverable tax, payment allocation, audit and period-lock semantics;
- prove parity before removing legacy Expense report arithmetic/writer;
- remove `AccountingTransaction` authority only after replacement proof.

Mandatory readiness decision:

- either require complete payment allocation before posting; or
- explicitly model unpaid expense / Accounts Payable.

The accepted current product path is the first option: an Expense may still be confirmed while its payment account is unknown, but canonical Expense Journal posting remains fail-closed until the reviewed payment allocation is complete. The Expenses page provides a one-way post-confirm completion action only for confirmed documents whose allocation set is empty; it cannot edit date, amount, category, tax, memo or evidence and cannot replace an already-completed or already-posted payment fact. No Accounts Payable inference is introduced.

Do not silently treat an unpaid expense as cash/bank paid. If Accounts Payable is selected later and schema/CoA changes are required, follow the repository's migration authorization workflow.

### 5.3 B2 — Canonical Sales Analytics

Priority: **P1**  
Complexity: **H**  
Depends on: **B1** by approved Accounting roadmap sequence — **satisfied 2026-09-22 by B1-C2 production closeout**.

Current state: **B2 PRODUCTION VERIFIED / CLOSED — B2-P0A PRODUCTION VERIFIED / B2-P0B PRODUCTION VERIFIED + COMPLETE / B2-A MERGED + CI GREEN / B2-B MERGED + CI GREEN / B2-C MERGED + CI GREEN / B2-D MERGED + CI GREEN / B2-E MERGED + CI GREEN + PRODUCTION VERIFIED**. The readiness audit found a prerequisite reliability gap before Sales Analytics projection work: Orders continued to create durable immutable `order.financial_sale.v1` facts, but the canonical SALE posting service had no runtime consumer after the controlled 2026-09-13 replay.

P0A used the existing guarded replay to catch up `2026-09-13..2026-09-23` exclusive: 131/131 READY, 0 BLOCKED, zero parity delta, balanced 213172-cent debit/credit. Production read-only verification then found 131 immutable facts / 131 exactly-one Journal anchors / 0 missing / 0 duplicate.

P0B is **PRODUCTION VERIFIED / COMPLETE**. It merged through PR #2459 as `2c4cb834`; CI #6118 passed all required Architecture/API/Web gates. Forward Web Order `c6ab16o6d7urm906lohrep6yg` paid at `2026-09-22T15:09:16.738Z`, persisted its immutable SALE fact at `15:09:16.846Z`, then acquired exactly one balanced canonical SALE Journal at `15:09:27.551Z` without replay. Processor logs report `RECENT scanned=23 / alreadyPosted=22 / posted=1 / blocked=0 / failed=0 / complete=true`, closing the continuity gate.

B2-A merged through PR #2461 as `1c1549c2`; final head `8f982260` passed CI #6125. The Orders non-monetary attribution boundary and Accounting Sales account/tender/coverage policies are now established without changing report/UI authority.

B2-B merged through PR #2462 as `fe9b08da`; final head `645f0423` passed CI #6130. The canonical `GET /accounting/report/sales` now provides Journal-owned totals/daily/channel/primary-payment/tender/source projections plus explicit provider coverage without changing posting authority.

B2-C is **MERGED / CI GREEN** through PR #2463; final head `b870ae1d` passed CI #6132 and squash merged as `db7a7b65`. It cuts only the Sales page to the canonical endpoint, removing the Sales page's P&L + legacy Order-slice reads and reusing the canonical Web Sales contract for Gross Sales / Discounts / Net Sales Revenue / Output Tax / Channel Contribution, daily trend, channel and canonical-primary-payment attribution, actual tender mix, provider coverage, attribution-quality warnings and explicit source/adjustment buckets. Previous equal-period comparison uses the same endpoint and is omitted when the prior range cannot be read exactly.

B2-D is **MERGED / CI GREEN** through PR #2464; final head `3530764e` passed CI #6134 and squash merged as `9e0dac17`. Dashboard reuses `AccountingSalesAnalyticsReport` and `GET /accounting/report/sales` for its compact channel and primary-payment overview; both amounts are `summary.netSalesRevenueCents` from the canonical Journal projection. Dashboard does not duplicate Sales-only daily, tender, provider-coverage or source/adjustment detail.

B2-E is **MERGED / CI GREEN / PRODUCTION VERIFIED** through PR #2465; final head `bff7899a` passed CI #6136 and squash merged as `3448c271`. It removes the zero-consumer `/accounting/report/slice` route, `AccountingOrderDimensionSlice`, `AccountingService.dimensionSlice()`, Accounting's Orders-reporting module dependency, and the paid-total-only Orders reader method/types/tests. `OrderReportingFactsModule` remains because operational `ReportsModule` still uses it for `readMetricsForRange()` and `readItemsForRange()`.

Consolidated production verification on deployed `3448c271` found Dashboard and canonical `/accounting/report/sales` returning 200, no post-deploy `/accounting/report/slice` traffic, no Web runtime errors, and balanced canonical Sales Journal populations across current order sales/reversals plus provider documents and historical Uber replacement reversals. The operator reported no visible anomaly. B2 is therefore **PRODUCTION VERIFIED / CLOSED**.

B4 polish tail: the valid `2026-06-01..2026-06-30` Sales request succeeds; its automatically calculated equal-period comparison `2026-05-02..2026-05-31` is intentionally rejected because it predates `accountingStartDate=2026-06-01`, then the UI omits comparison. Later reporting polish should suppress that known-out-of-coverage comparison request to avoid expected HTTP 400 / ERROR log noise. This is not a timezone defect and does not block or reopen B2.

Target Accounting views:

- Gross/Nominal Sales;
- Sales Discounts;
- Net Sales Revenue;
- tax separately;
- delivery/surcharge revenue;
- platform/payment fees;
- Channel Contribution;
- primary payment-method attribution;
- actual tender mix;
- period comparison and provider-coverage state.

Journal/canonical financial facts own amounts. Orders may provide narrow channel/payment dimensions, not recreate revenue truth.

### 5.3A EFA — Expense Funding Attribution

Priority: **P1**  
Complexity: **H**  
Depends on: **B2 production closeout — satisfied 2026-09-22**.

Current state: **PRODUCTION VERIFIED / CLOSED — B1 MIGRATION APPLIED — B2/C/D MERGED + CI GREEN + DEPLOYED + VERIFIED — INCLUDED / EXCLUDED / MIXED-ACCOUNT V2 PATHS VERIFIED — MANAGEMENT VS CANONICAL RECONCILED**.

Detailed audit/design: `docs/architecture/accounting-expense-funding-attribution.md`.

EFA moves funding ownership from a document-level allocation model to split-level attribution for new Expense v2 facts while preserving historical Expense v1 authority. EFA-B2 merged through PR #2469 / `6674ab1cdd6bcba78998698cde69469c40b0b03d` with CI #6150 green and provides the grouped canonical v2 posting engine without adding a JournalLine funding dimension. EFA-C merged through PR #2470 / `42e25b04` after CI #6155 passed; current Expense/Inbox writes and UI now use version-2 split funding, confirmed-unposted v2 completion is split-level, historical v1 allocation reads/completion remain, records dual-read both authorities, and account policy configuration is available in Settings.

EFA-D merged through PR #2471 / final head `ddb01f74` / squash `2d3abc0e`; CI #6158 passed and production is deployed at `main@2d3abc0e`. The B1 additive migration is applied. The account-level flag `includeFundedExpensesInManagementReports` is consumed only by Management Dashboard/P&L/category/trend and Management/Boss export projections for Expense v2 Journal groups. Raw canonical transaction export, canonical Journal/audit, account movement, actual cash flow and recoverable GST/HST remain unfiltered; historical v1 Expense Journals are not retroactively hidden. Production verification passed for included Primary Bank, excluded CIBC and mixed CIBC + Primary Bank records, including exact account-scoped 1..N Journal grouping and Management-vs-canonical reconciliation. Both newly verified v2 records have zero legacy `AccountingExpensePaymentAllocation` rows. **EFA is closed.**

The Accounting PWA has one operator and may be deleted/recreated at the v2 cutover, so no long-lived old-client write contract is required. Historical v1 records remain readable and immutable.

EFA is closed; B3 readiness characterization is complete. B3-A merged through PR #2475 / squash `9c92eeda` with PR CI #6171 and merged-head CI #6172 green; B3-B merged through PR #2476 / squash `ec2cff0f` with PR CI #6175 and merged-head CI #6176 green; B3-C Balance Movement is now source-implemented for local review.

### 5.4 B3 — Trial Balance + Balance Movement Statement

Priority: **P1/P2**  
Complexity: **H**  
Depends on: **B1 + B2 + EFA — satisfied 2026-09-22**.

Current state: **READINESS COMPLETE / B3-A + B3-B MERGED + CI GREEN / B3-C SOURCE IMPLEMENTED + LOCAL REVIEW PENDING / NO MIGRATION EXPECTED** at latest baseline `origin/dev@9ac715f3`. B3-A merged through PR #2475 / squash `9c92eeda`; B3-B merged through PR #2476 / final head `7b859b69` / squash `ec2cff0f` with PR CI #6175 and merged-head CI #6176 green. Detailed audit/design: `docs/architecture/accounting-b3-trial-balance-readiness.md`.

The readiness audit proves the existing canonical Journal/CoA is sufficient: production snapshot has 1,501 Journal entries / 4,897 lines, debit=credit=`7,798,968c`, zero unbalanced entries and zero explicit opening Journals. Account-class reconstruction reconciles Assets=`2,104,938c`, Liabilities=`816,109c` and cumulative recorded earnings=`1,288,829c` to zero under the current management-opening policy. B3 therefore does not redesign Journal or revenue/expense posting.

B3-A creates a versioned Accounting-owned whole-ledger/per-currency Trial Balance core directly from Journal lines. It keeps inactive historical accounts, treats ASSET/EXPENSE as debit-normal and LIABILITY/EQUITY/REVENUE as credit-normal, treats explicit `OPENING_BALANCE` Journals as opening facts, attaches period-close visibility and fails closed if individual Journals or opening/period/closing Trial Balance totals do not balance. It does not read Management filtering, so EFA-excluded Expense v2 Journals remain canonical statement facts.

The implementation sequence is `B3-A core -> B3-B HTTP/public contract -> B3-C Balance Movement projection -> B3-D production reconciliation/closeout`. B3-B exposes the existing versioned B3-A report through authenticated `GET /accounting/report/trial-balance`. B3-C consumes that report rather than Journal/Prisma directly, projects ASSET / LIABILITY / direct EQUITY sections plus a `REVENUE - EXPENSE` recorded-earnings bridge, and exposes authenticated `GET /accounting/report/balance-movement`; opening, period and closing bridges each fail closed unless they reconcile to zero. B3-C also exposes zero-opening versus explicit-opening-Journal basis metadata while keeping `absoluteBalanceClaim=false`. Neither slice adds Web/UI, exports, a store filter, FX conversion, Prisma schema/migration or old account-balance contraction. Seven current production Journals have null `storeStableId`, all Expense-document Journals, so store-filtered statements remain deliberately deferred until complete multi-store Accounting attribution exists.

Build Trial Balance directly from Journal lines and then the zero-opening **资产负债变动表 / Balance Movement Statement**.

Keep the existing policy:

- Accounting start: 2026-06-01;
- management opening balance: $0;
- statement represents recorded movement since that date;
- it is **not** a claim of real-world absolute bank/cash balances.

Do not call it a formal Balance Sheet until reviewed real fiscal-year opening balances are posted.

### 5.5 B4 — Accounting reporting UI / export polish

Priority: **P2**  
Complexity: **M**  
Depends on: **B2 + B3 foundations**

Then improve the Accounting reports surface:

- P&L adjustment decomposition;
- Journal-only cash-flow/account movement presentation;
- Trial Balance / Balance Movement UI;
- exports;
- coverage/period-close indicators;
- drill-through;
- stale explanatory copy on Sales/Reports.

Avoid polishing current mixed-authority widgets immediately before replacing their underlying semantics.

### 5.6 B5 — Admin 数据 -> “经营报表” redesign

Priority: **P2**  
Complexity: **M**  
Depends on: **B2 terminology / financial contract stabilization**

Important distinction:

- `/accounting/reports` = Accounting financial reports;
- `/admin/reports` = Admin **数据 -> 经营报表 / Business reports**.

The Admin page currently reads the Orders/Reporting operational endpoint and displays Order totals, tax, delivery fees, AOV, payment/fulfillment breakdown and top items. It should remain an **operational management** surface.

Target:

- rename/reframe ambiguous “销售额/收入” labels so Order totals are not mistaken for accounting revenue;
- improve store/channel/menu/order operational KPIs and equal-period comparisons;
- retain top-item and fulfillment operational analysis;
- if a financial summary is useful, consume an Accounting-owned contract rather than recomputing finance in Admin;
- do not duplicate P&L, settlement, tax or account-balance logic.

B2 comes first so Admin and Accounting can share stable vocabulary rather than implementing two competing meanings of “sales/revenue”.

## 6. Parallel product lane — Admin Marketing Overview

### 6.1 Marketing overview redesign

Priority: **P1 PARALLEL PRODUCT WORK**  
Complexity: **M**  
Hard dependency: none

Current `/admin/promotions` is primarily a navigation landing page for:

- Daily Special;
- coupons/bundles;
- automatic/loyalty promotions.

It still contains migration-era/“第一阶段” wording.

Target a useful **营销总览 / Marketing Overview** while preserving established owners:

- show useful active/upcoming/paused/ended campaign state;
- surface existing usage/performance facts only where authoritative owner APIs already exist;
- distinguish overview/monitoring from editing;
- keep Daily Special, Coupon/Benefit and PromotionRule lifecycle/storage with their owners;
- add an aggregate/read model only after owner/API/query-cost review.

This can proceed in parallel with Lane A or Lane B when product priority warrants; it should not be bundled with either foundation.

## 7. Later internal hardening

### 7.1 Runtime readiness / health semantics

Priority: **P2**  
Complexity: **M**  
Recommended after: §3.3 pnpm pin

Compose currently relies on process/container start plus basic `depends_on`; there is no repository-wide application readiness contract.

Design meaningful readiness before adding YAML-only healthchecks:

- database readiness;
- API readiness including critical dependency policy;
- Web readiness;
- Uber worker health semantics;
- Compose startup dependency behavior;
- deploy verification aligned with the same contract.

Do not equate “process exists” with “ready to receive traffic”.

### 7.2 Admin Members STAFF/ADMIN test-overlap cleanup

Priority: **P2 DEFERRED CONTRACT CLEANUP**  
Complexity: **M**  
Depends on: replacement membership/browser test strategy.

The membership Admin surface currently allows STAFF/ADMIN identities as an explicit development/test compatibility. It is not the canonical Staff-administration path.

A1 must enforce the actual application-surface role matrix, but the deeper member-test cleanup may wait until test identities no longer require STAFF/ADMIN.

Then:

- restrict member list/account-status mutation to customer/member identities;
- retire the development/test overlap;
- retain Staff role/status administration under Identity.

### 7.3 API TypeScript strictness

Priority: **P3**  
Complexity: **H / incremental**  
External gate: none

The CI step named “Strict declaration check” extends API `tsconfig.json`, which still has `noImplicitAny=false`, `strictBindCallApply=false` and other relaxed flags.

Treat this as incremental engineering hardening:

- inventory errors by flag;
- enable one narrow flag/scope at a time;
- avoid broad `any`, ignores or lint suppressions;
- keep feature work separate from strictness churn.

Do not make this a repository-wide flag-day refactor.

### 7.4 Prisma 6 -> 7

Priority: **P3 / LAST MAJOR PLATFORM UPGRADE**  
Complexity: **XL**  
Authorization note: **explicit dependency authorization required before implementation.**

Current lock resolves Prisma 6.19.1.

Run this only after higher-value product/reliability work has stabilized:

- fresh Prisma 7 breaking-change audit;
- dependency/runtime/generator review;
- schema/migration-tooling compatibility;
- Docker/CI/developer workflow verification;
- dedicated migration-risk review;
- no unrelated product or architecture changes in the same batch.

### 7.5 Incremental large-page/service decomposition

Priority: **ONGOING / NO STANDALONE PROJECT**  
Complexity: varies

Large files remain, especially Checkout, Membership, Orders and the Windows printer agent.

Decompose only when a coherent feature/use case is already being changed and extraction reduces coupling/test cost. Do not reopen a “split everything under N lines” program.

## 8. Provider-triggered cutover lane

These are not placed behind P0/P1/P2 internal work. When the provider/merchant/device gate opens, perform the relevant readiness audit and take the opportunity.

### 8.1 Clover POS Terminal production cutover

State: **DEFERRED / PROVIDER + REAL-DEVICE GATE**  
Complexity: **XL**

Required evidence:

- POS <-> Clover Terminal realtime synchronization and recovery;
- real-device acceptance;
- one reconciled settlement cycle;
- clean production stability window;
- pre-cutover Accounting facts resolved;
- legacy direct-paid POS CARD invocation zero.

Then remove `payments.pos-card-legacy.v1`, the flag/config, legacy direct-paid CARD path and legacy refund compatibility together.

### 8.2 Web Clover v1 -> Unified Payment Core

State: **HARD-DEFERRED UNTIL §8.1 IS PRODUCTION-STABLE**  
Complexity: **XL**

The current production Web Ecommerce `/v1/charges` path remains protected by `payments.web-checkout-v1.v1`.

After POS Clover has passed production stability:

1. install/OAuth-authorize Unified on the operating production merchant;
2. perform a fresh production-merchant correlation/readiness audit;
3. run v3 shadow comparison without traffic-authority change;
4. verify amount, surcharge, refund, settlement and provider-ID parity;
5. explicitly cut Web traffic;
6. reconcile a complete settlement cycle;
7. prove old-path invocation zero;
8. contract the compatibility and retired Web v1 implementation.

Do not accelerate this to empty the compatibility register.

### 8.3 CheckoutIntent durable-fact contraction

State: **COUPLED TO WEB CLOVER UNIFIED CUTOVER**  
Complexity: **H**  
Depends on: **§8.2 cutover plan**

Successful `CheckoutIntent` should be temporary workflow state, not a permanent auxiliary Order database.

Current post-order consumers still include CheckoutIntent metadata, and Uber Direct currently also reads destination metadata from the latest CheckoutIntent.

Future contraction must:

- freeze trusted customer/contact snapshot, locale, delivery destination and preparation context into Order-owned immutable facts needed after Order creation;
- keep canonical payment facts in Payments;
- migrate receipt/print/history/delivery consumers away from successful CheckoutIntent metadata;
- define completed/expired CheckoutIntent retention only after consumer count is zero and parity is proven.

Target:

```text
CheckoutIntent = temporary checkout workflow state
Order          = permanent order / fulfillment facts
Payments       = permanent payment facts
```

### 8.4 UberEats Production cutover

State: **PROVIDER-GATED**  
Complexity: **XL provider rollout**

When Uber enables the required production path:

- finish Production Verification;
- provision/activate the Production Store;
- run focused production pilot verification;
- exercise financial-report live replay when provider capability exists;
- preserve the already-closed architecture boundaries;
- after Production Verification succeeds, inventory and remove Test Store/sandbox data through a separately reviewed cleanup.

### 8.5 Fantuan settlement Adjustment decomposition

State: **MERGED / CI GREEN / FOLLOW-UP SETTLEMENT WORK-QUEUE LOCAL / NO MIGRATION**  
Complexity: **M / ACCOUNTING PROVIDER-EVIDENCE CORRECTNESS**

A real August 2026 Fantuan settlement exposed a non-zero Summary `Adjustment` of **2694 cents**. The English provider Detail workbook proves that the net is composed of two explicit `Order type = Adjustment` rows: `Fee type = Compensation` **+3354 cents** and `Fee type = Deduction` **-660 cents**. A later real July 2026 Chinese Detail export exposed the provider's alternate structured shape: ordinary rows use `单据类型 = 订单`, while the two adjustment rows use `单据类型 = 扣款`, blank `订单类型`, and `结算金额` values **-235 cents** and **-1226 cents**, net **-1461 cents**, exactly matching the July Summary Adjustment. The Summary Sales/Sales Tax/Commission totals remain the monthly authority, so adjustment economics must not be guessed from amount sign or remarks.

The correction keeps the Summary as the sole monthly settlement authority and treats the XLSX Detail as supplementary evidence only. The native workbook parser now normalizes observed English/Chinese column aliases into one Accounting-owned shape; `Deduction / 扣款` map to the same canonical raw code, while no unobserved Chinese alias is invented for Compensation. Ordinary `Order / 订单` rows are excluded; an English `Order type = Adjustment` row or any non-order document row is retained as adjustment evidence, and unknown fee/document types remain fail-closed rather than being silently ignored. A non-zero Summary Adjustment is READY only when exactly one confirmed same-period Detail exists, every Adjustment fee type is supported, and the Detail net equals the Summary amount exactly. The Summary Adjustment becomes control evidence; Compensation posts to Other Operating Revenue, Deduction to Chargeback/Adjustment Expense, and Fantuan Pending receives their net. The Detail never creates a second settlement Journal.

Replay authority conditionally binds the supplementary document identity/revision/review evidence and revalidates it inside the existing Serializable settlement transaction. Existing provider plans with no supplementary evidence omit the new optional authority field so historical Uber/Clover plan hashes and idempotency remain unchanged. The change stays entirely inside Accounting plus the existing Accounting Inbox Web adapter; there is no Prisma/schema/migration or new context direction. The explicitly authorized `@keep-lts/xlsx@^0.18.6` dependency and pnpm lockfile were merged through PR #2424; final head `1546a279` passed CI #5994 across API/Web/Architecture gates and squash-merged to `dev` as `fead0039`. A follow-up Settlement workflow defect was then observed on a confirmed/replayed June Fantuan statement: the canonical `PAYOUT` (`Total transfer amount`) existed and the Journal correctly carried 292539 cents to `account_fantuan_pending`, but the Settlement card rendered `—` because the Web summary searched only for raw `Net Total`; additionally, confirmed statements remained visually indistinguishable before Shadow Preview even after a settlement Journal already existed. The local follow-up branch resolves display from canonical `PAYOUT` first with raw `Net Total` as the Uber-compatible fallback, adds a bounded read-only posting-state projection over existing `accounting.provider_financial_document.v1` Journals, and splits the UI into pending statements, collapsed posted history, and supporting/control evidence. Posted statements expose evidence, Journal identity and canonical lines but no Replay action; fresh post-write reconciliation moves the statement into posted history immediately. It also corrects Inbox terminology exposed by the first production Fantuan Detail upload: `PROVIDER_FINANCIAL_DOCUMENT` is presented as provider financial evidence rather than narrowly as a settlement statement, while parser `documentType=OTHER` is explicitly described as supplementary evidence that is not independently posted. If an operator overrides such recognized provider evidence to generic `OTHER_DOCUMENT`, the UI warns that it will no longer participate in provider-settlement matching while still preserving the manual override. Production verification then exposed one remaining compatibility gap in the Web replay gate: the valid August Summary preview contained the authoritative Summary plus one `NOOP` Detail evidence plan, so the old `providerDocuments.length === 1` guard incorrectly blocked with `EXPECTED_EXACTLY_ONE_PROVIDER_DOCUMENT` even though only the Summary was replayable. The follow-up gate counts only non-`NOOP` provider plans as actionable and still fails closed if any second READY/BLOCKED/ALREADY_POSTED provider document is present; settlement execution itself remains unchanged and writes only READY plans. No parser, Journal writer, replay authority, accounting semantics, Prisma/schema/migration, dependency or cross-context edge changes are involved.

### 8.6 Phase 9 deferred real-world evidence

State: **EVENT-TRIGGERED EVIDENCE ONLY — DO NOT REOPEN PHASE 9**

Capture evidence when the real event occurs:

- CRA remittance settlement;
- posted Payroll run reversal/correction;
- first real production period close;
- incomplete Uber provider-financial history/cutover evidence;
- documented 2258-cent fail-closed CARD/RETENDER historical exception if/when resolvable.

These are evidence gates, not reasons to restart Phase 9 development.

## 9. Dependency and sequencing rules

Use these rules when choosing the next task:

1. **Start internal work with one core foundation, not with cosmetic polish.** A1 and B1 are the two major internally executable foundations and may proceed independently in separate branches.
2. **Treat Uber Direct durability as immediate reliability work.** It may be scheduled before or between A1/B1 because it closes an existing production failure window.
3. **Do quick low-coupling hardening opportunistically.** pnpm pin, NotificationProcessor cleanup and MCP behavior tests should be isolated small PRs rather than bundled into core projects. AWS messaging follows the dedicated SMS/SES/SNS production-migration gate in §3.5 rather than being treated as dependency hygiene.
4. **Do not write final Staff/PWA E2E before Staff entry behavior stabilizes.** Stage 1 follows A1/A2; workstation/POS coverage follows A4.
5. **Do not implement Accounting report polish before Accounting fact authority is canonical.** B1 -> B2 -> B3 -> B4 is the authoritative financial sequence.
6. **Do not redesign Admin “经营报表” as another Accounting surface.** Wait for B2 terminology, then keep Admin operational and consume Accounting contracts only where financial facts are intentionally shown.
7. **Marketing Overview is independent.** It can fill a parallel product slot without blocking either core lane.
8. **Windows POS PWA is a workstation project.** A1 is a hard dependency; A3 is a recommended preparation step.
9. **Provider windows override normal queue order.** If Uber/Clover access becomes available, perform the named provider readiness/cutover task while preserving production guards.
10. **Prisma 7 and broad TypeScript strictness stay late.** They create broad platform churn without unlocking current product work.
11. **Large-file decomposition is opportunistic only.** Never create a standalone architecture program solely to reduce line counts.
12. **Every dependency-manifest/lockfile change requires explicit authorization** before implementation, including E2E framework installation, printer-agent package dependencies, any later SQS-only/provider dependency cleanup and Prisma upgrade. `@aws-sdk/client-sns` is intentionally retained for the planned AWS messaging cutover.

## 10. Completed source-note migration / Project cleanup

The temporary Project-source TXT notes were dispositioned in the modularization closeout:

- `模块化后期收尾事项.txt`: resolved — closed-compat annotation enforcement exists;
- `Phase-2残留.txt`: resolved — temporary-close reason codec ownership is corrected;
- `Admin降级为staff判断.txt`: resolved — PR #2418 hardened last-active-admin atomicity;
- `CheckoutIntent遗留数据固化.txt`: implementation remains future work, but its surviving requirement is now owned by §8.3.

Because PR #2420 is merged and this roadmap retains the unresolved CheckoutIntent requirement, those four TXT notes are no longer needed as execution sources and may be removed from the Project source list.

The original full-site modularization audit Markdown should remain as historical baseline/reference evidence, not as the active execution plan.

## 11. Later finance operations — Vehicle Mileage

Priority: **LATER / AFTER CURRENT ACCOUNTING AND CORE BACKLOG**  
Complexity: **M**  
External gate: **none; CRA treatment must be re-verified against the rules in force when calculation/claim support is implemented**

After the higher-priority Accounting and core backlog work is complete, add a **Vehicle Mileage** surface in the most appropriate authenticated finance/operations UI (Accounting or Admin, chosen by the readiness audit rather than by convenience).

The initial goal is **recording first, calculation second**. SanQ currently uses a personally owned vehicle for recurring restaurant procurement trips, including routes that may start at the store or at home and may visit one or more suppliers before arriving at / returning to the store. The first slice should preserve reliable source data rather than trying to infer tax treatment from incomplete history.

Recording should support, at minimum:

- trip date;
- business purpose;
- start location;
- zero or more supplier / business stops;
- end location;
- actual business kilometres claimed for the trip;
- optional odometer start/end or other supporting mileage evidence;
- notes/evidence sufficient to explain the procurement route later.

Do not automatically treat every home-origin leg as business mileage. The later calculation policy must distinguish ordinary personal commuting from qualifying business travel / point-of-call treatment using the CRA rules and evidence applicable at that time.

Once enough real trip data exists, add a separately reviewed calculation/reimbursement slice that:

- applies the then-current CRA reasonable per-kilometre allowance rules and annual thresholds rather than hard-coding the 2026 rates into the recording model;
- keeps personal commuting kilometres excluded unless the applicable CRA rules support business treatment;
- supports multi-stop procurement routes without collapsing them into a simple home-to-store distance adjustment;
- calculates any eligible GST/HST ITC using the CRA method applicable to the reimbursement/allowance structure actually chosen;
- prevents duplicate recovery of the same vehicle cost through both mileage allowance and separately reimbursed fuel/maintenance/repair expenses;
- posts any resulting expense, payable/reimbursement and HST effects through the existing Accounting canonical Journal boundary rather than creating a parallel finance ledger.

This is a future operational-finance feature, not a reason to reopen the closed modularization program or to interrupt the current B-lane execution order.
