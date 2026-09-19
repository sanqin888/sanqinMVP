# SanQ Post-Modularization Backlog

Status: **ACTIVE / POST-MODULARIZATION — DO NOT REOPEN THE CLOSED MODULARIZATION PROGRAM**  
Created: 2026-09-19  
Modularization closeout base: `origin/dev@1b18fb00`  
Authoritative architecture status: repository-wide modularization is **SOURCE / ARCHITECTURE COMPLETE / CLOSED**.

## 1. Purpose

This file is the single cross-project queue for work that remains after the repository-wide modularization program closed.

These items are not a new modularization Phase. Each implementation batch still follows `AGENTS.md`: refresh latest `origin/dev`, read the owning architecture/CI rules, perform a read-only readiness audit, make the smallest owner-correct change, stop after local diff/status review, and wait for explicit authorization before remote PR/CI delivery.

Provider/cutover gates, product work, production-evidence follow-ups and engineering hygiene are deliberately separated below so that a blocked external integration does not reopen the closed architecture program.

## 2. Provider / cutover program

### 2.1 Clover POS Terminal production cutover

Status: **DEFERRED / PROVIDER + REAL-DEVICE GATE**

- Complete POS <-> Clover Terminal realtime synchronization and recovery.
- Perform real-device acceptance.
- Reconcile at least one complete settlement cycle.
- Observe a clean production stability window.
- Confirm pre-cutover Accounting facts are resolved.
- Confirm legacy direct-paid POS CARD invocation reaches zero.
- Then remove `payments.pos-card-legacy.v1`, the route-choice flag/config, legacy direct-paid CARD path and legacy refund compatibility together.

This is the required predecessor for the Web Clover Unified cutover below.

### 2.2 Web Clover v1 -> Unified Payment Core

Status: **DEFERRED UNTIL POS CLOVER IS PRODUCTION-STABLE**

The current production Web Ecommerce `/v1/charges` path remains protected under `payments.web-checkout-v1.v1`.

After POS Clover Terminal has passed production acceptance/stability:

1. install/OAuth-authorize the Unified App on the operating production Clover merchant;
2. perform a fresh production-merchant readiness/correlation audit;
3. enable v3 shadow comparison without changing traffic authority;
4. verify payment amount, surcharge, refund, settlement and provider-ID parity;
5. explicitly cut Web traffic to Unified Payment Core;
6. reconcile one complete settlement cycle and confirm old-path invocation is zero;
7. contract `payments.web-checkout-v1.v1` and the retired Web v1 implementation.

Do not accelerate this only to empty the compatibility register.

### 2.3 CheckoutIntent durable-fact contraction

Status: **OPEN / COUPLED TO WEB CLOVER UNIFIED CUTOVER**

Successful `CheckoutIntent` must remain checkout workflow state rather than becoming a permanent auxiliary Order database.

Current source still has post-order consumers such as `PrintPosPayloadService.getCheckoutIntentMetadata()`, while Web CARD Order creation/verification still participates in the guarded v1 checkout path.

During the future Web Clover / Orders contraction:

- freeze trusted customer/contact snapshot, locale, delivery destination and preparation context into Order-owned immutable facts required after successful Order creation;
- keep canonical payment facts in Payments;
- migrate receipt/print/history consumers away from successful `CheckoutIntent` metadata;
- define retention/cleanup for completed/expired CheckoutIntent rows only after consumer count is zero and production parity is proven.

Target ownership:

```text
CheckoutIntent = temporary checkout workflow state
Order          = permanent order/fulfillment facts
Payments       = permanent payment facts
```

### 2.4 UberEats Production cutover

Status: **PROVIDER-GATED**

- Finish Uber Production Verification.
- Provision/activate the Production Store.
- Run the production pilot and focused runtime verification.
- Exercise financial-report live replay when the provider capability is available.
- Preserve current source/architecture-closed boundaries during cutover.
- After Production Verification succeeds, inventory and remove the accumulated Test Store/sandbox dataset through a separately reviewed cleanup; do not delete provider state required for Production initialization.

## 3. Accounting / reporting product work

The detailed financial design remains in `ACCOUNTING_PRODUCT_ROADMAP.md`. Do not reopen Phase 9.

### 3.1 Expense -> canonical Journal

Status: **PLANNED**

Start with the roadmap's Slice A readiness audit. Replace the remaining Expense-backed `AccountingTransaction` authority with Accounting Journal authority only after paid/unpaid Expense policy, HST/category/payment-allocation semantics, idempotency, period lock and parity are reviewed.

### 3.2 Canonical Sales Analytics / Accounting reports

Status: **PLANNED**

Follow the roadmap's canonical Sales Analytics design:

- Journal/canonical financial facts own amounts;
- Orders may contribute narrow channel/payment dimensions but not revenue truth;
- separate Net Sales Revenue, tax, fees, Channel Contribution and actual tender mix;
- keep provider-coverage gaps visible instead of reconstructing missing financial truth from mutable Order totals;
- preserve Toronto/business-timezone range semantics.

### 3.3 Trial Balance / Balance Movement / reporting polish

Status: **PLANNED**

After Expense -> Journal cutover:

- add Trial Balance;
- add the zero-opening **资产负债变动表 / Balance Movement Statement**;
- keep formal Balance Sheet deferred until a reviewed real fiscal-year opening balance exists;
- improve P&L adjustment labels, Journal-only cash flow, exports, coverage/close indicators and drill-through.

### 3.4 Phase 9 deferred real-world evidence

Status: **EVIDENCE ONLY — DOES NOT REOPEN PHASE 9**

Retain explicit follow-up evidence for:

- real CRA remittance settlement;
- real posted-run reversal/correction;
- first real production period close;
- incomplete Uber provider financial history/cutover evidence;
- the documented 2258-cent fail-closed historical CARD/RETENDER exception.

## 4. Staff / PWA / Windows workstation program

### 4.1 Unified staff login experience

Status: **OPEN**

Admin, Accounting and POS should share one Identity-owned staff login experience while authorization remains independent.

Accepted role matrix:

- `ADMIN` -> Admin + Accounting + POS;
- `ACCOUNTANT` -> Accounting only;
- `STAFF` -> POS only.

Work includes:

- consolidate/standardize Admin, Accounting and POS PWA login presentation and error states;
- ensure already-authenticated users land on the correct surface by role;
- prevent wrong-role redirect loops or a requirement to enter through the Admin URL first;
- retain MFA/session semantics under Identity ownership rather than reimplementing authentication in each PWA.

### 4.2 Accounting PWA direct-launch fix

Status: **OPEN / DEFERRED FROM PRE-MODULARIZATION UI WORK**

- Fix installed/desktop Accounting PWA direct launch so it does not depend on first opening the Admin page or fall into a 404/wrong entry flow.
- Align start URL, protected layout, authenticated landing and install/cache behavior with the unified staff-login model.
- Verify ADMIN and ACCOUNTANT independently.

### 4.3 Windows POS PWA + dual-display launcher

Status: **OPEN**

Build the Windows store workstation flow after the unified staff-login entry is settled.

Requirements retained from the earlier decision:

- employee main display opens POS as the primary PWA/window;
- second non-touch customer display uses `/[locale]/store/display`;
- keep the customer display read-only;
- preserve the existing customer-display synchronization mechanism;
- retain a manual fallback if automatic second-screen launch/sync fails;
- preserve POS device enrollment/authentication and store scoping;
- define startup/restart/full-screen behavior for the Windows workstation;
- verify PWA update/cache behavior and dual-screen recovery.

## 5. Admin product/UI follow-ups

### 5.1 Admin Data -> “经营报表” redesign

Status: **OPEN**

Current entry is `/admin/reports` under Admin **数据 -> 经营报表 / Business reports**.

This page should remain an operational-management report rather than becoming a duplicate Accounting financial statement surface.

Readiness/design should separate:

- Orders/store/channel/menu operational KPIs owned by Reporting/Orders;
- financial revenue/tax/settlement/account balances owned by Accounting;
- any financial summary shown in Admin must consume an Accounting-owned report contract rather than recompute finance inside Admin.

Refresh the information architecture, period comparisons and useful operational drill-down after the Accounting report definitions are stable enough to avoid conflicting terminology.

### 5.2 Admin Marketing -> marketing overview redesign

Status: **OPEN**

Current `/admin/promotions` is primarily a navigation landing page for Daily Special, coupons/bundles and automatic/loyalty promotions and still contains transitional copy.

Redesign it as a useful **营销总览 / Marketing Overview** without moving Offers/Benefits ownership into Admin:

- audit which campaign/status/usage facts already exist behind public owner APIs;
- distinguish overview/monitoring from edit pages;
- remove stale migration-era/“第一阶段” wording;
- keep Daily Special, Coupon/Benefit and PromotionRule lifecycle/storage with their established owners;
- add any new aggregate/read model only after ownership and query cost are reviewed.

### 5.3 Admin Members STAFF/ADMIN test overlap cleanup

Status: **DEFERRED UNTIL MEMBERSHIP E2E TESTING NO LONGER NEEDS STAFF/ADMIN IDENTITIES**

The Admin Members surface currently intentionally allows STAFF/ADMIN identities for development/test membership verification. It is not the canonical Staff administration path.

When those identities are no longer needed for membership-system testing:

- restrict member list/status mutation to customer/member identities;
- retire the development/test overlap;
- retain canonical Staff role/status administration under Identity.

## 6. Reliability / runtime / maintainability backlog

### 6.1 Uber Direct durable dispatch

Status: **OPEN L3 RELIABILITY HARDENING**

Private in-memory `order.paid.verified` still drives Uber Direct dispatch. Provider success followed by process failure before local `externalDeliveryId` persistence is not fully replay-safe.

Design a durable, idempotent dispatch/reconciliation path without reopening Orders/Uber ownership boundaries.

### 6.2 Printer-agent workspace/package hardening

Status: **OPEN**

`tools/printer-server` remains an independently deployed production boundary but is not yet a normal pnpm workspace package.

Future work:

- package/workspace registration with explicit dependency review;
- split transport/enrollment, socket/job ACK, renderers, Windows print adapter and bootstrap/config where useful;
- preserve the deployed print wire contract and device behavior;
- add deterministic/golden tests for receipt/kitchen/label output and reconnect/dedupe;
- add a root-reproducible install/test/package smoke gate.

Do not restructure the printer agent merely for file-count aesthetics.

### 6.3 Remove no-op notification processor

Status: **OPEN HYGIENE**

Review and remove the current no-op `NotificationProcessor` shell if there is still no dynamic registration/runtime reason to retain it. Keep manual invoice/thank-you behavior unchanged.

### 6.4 Critical browser E2E

Status: **OPEN**

Add focused browser-level coverage for the highest-risk user journeys rather than attempting exhaustive UI automation:

- staff login/MFA/role landing;
- customer quote -> checkout -> payment success boundary;
- member benefits;
- POS order acceptance/printing;
- installed PWA entry paths where browser/PWA routing behavior matters.

### 6.5 Runtime reproducibility / readiness

Status: **OPEN**

- Replace Docker `pnpm@latest` bootstrap with the repository-pinned pnpm version.
- Add meaningful process/container readiness/health semantics instead of treating process start as readiness.
- Review Compose dependency/readiness behavior.
- Keep deployment checks aligned with the real CI/runtime contract.

### 6.6 SanQ MCP behavior tests

Status: **OPEN**

CI currently compiles the MCP Python server but does not provide the originally planned behavior tests. Add focused tests for path restrictions, command allowlists, query policy and sensitive-output handling without weakening the existing MCP safety boundary.

### 6.7 Backup / recovery drill

Status: **OPEN OPS EVIDENCE**

Backups exist, but retain a separate task to record a current successful restore/recovery drill and verify database/files/config restoration procedures rather than treating backup creation alone as recovery proof.

### 6.8 Incremental large-page/service decomposition

Status: **ONGOING / NOT A STANDALONE REWRITE**

Large production files still exist, especially Checkout, Membership and Orders.

Decompose them opportunistically when product work touches a coherent feature/use case. Do not start another repository-wide “split files” project and do not add facades/repositories with no owner or behavior value.

### 6.9 API TypeScript strictness debt

Status: **OPEN**

The CI command named “Strict declaration check” still inherits API compiler options including `noImplicitAny=false` and other relaxed flags. Audit whether the API can be moved toward genuinely strict settings incrementally without hiding existing debt or weakening current checks.

### 6.10 Prisma 6 -> 7

Status: **DEFERRED INDEPENDENT PROJECT**

Prisma major upgrade was intentionally postponed until the modularization program was complete and stable.

Treat it as a separate dependency/migration-risk project:

- fresh compatibility/readiness audit first;
- do not combine it with product features or owner-boundary changes;
- follow dependency and migration authorization rules in `AGENTS.md`.

## 7. Source-note migration / Project cleanup

The temporary Project-source TXT notes have now been dispositioned as follows:

- `模块化后期收尾事项.txt`: **resolved** — closed-compat annotation enforcement is implemented; the former loophole is guarded.
- `Phase-2残留.txt`: **resolved** — temporary-close reason codec ownership moved to Brand/Store and the reverse helper edge is closed.
- `Admin降级为staff判断.txt`: **resolved** — PR #2418 hardens last-active-admin modification with Serializable transaction + whole-use-case retry.
- `CheckoutIntent遗留数据固化.txt`: **not implemented yet**, but its surviving requirement is now preserved in §2.3 of this backlog and tied explicitly to the future Web Clover Unified cutover.

After this backlog is reviewed/merged, those four TXT notes are no longer needed as execution sources and may be removed from the Project source list. The original modularization audit Markdown can remain as historical baseline evidence; it is no longer the current execution plan.

## 8. Prioritization rule

Do not execute this file strictly top-to-bottom. Use dependency/readiness:

1. externally unblocked and operationally useful product work may proceed;
2. Clover Web Unified waits for Clover POS production stability;
3. Accounting product work follows `ACCOUNTING_PRODUCT_ROADMAP.md`;
4. staff/PWA work should establish unified login/landing before the Windows POS launcher;
5. provider-gated evidence waits for the real provider/settlement event;
6. reliability/hygiene items should be scheduled as focused batches and must not reopen modularization merely to reduce architecture counters.
