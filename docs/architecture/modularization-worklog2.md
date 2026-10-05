# Modularization Worklog 2

> Continuation note — 2026-10-05
>
> `docs/architecture/modularization-worklog.md` has reached the practical
> single-file write limit of the current SanQ VM MCP workflow and can no longer
> be safely appended through the repository editing tool. To avoid truncating,
> rewriting, splitting, or otherwise risking the existing historical record,
> that file is now treated as the read-only first volume of the modularization
> worklog.
>
> All subsequent modularization / post-modularization implementation logs are
> recorded in this file, `docs/architecture/modularization-worklog2.md`.
> Historical entries already present in `modularization-worklog.md` remain
> authoritative and are not duplicated here unless a later entry needs to
> reference or correct their status.

## 2026-10-05 — External Sales Slice F Post-start historical reconstruction

**PR/SHA:** local branch `feat/accounting-external-sales-slice-f-reconstruction` from `origin/dev@9c9a66cd`; no remote PR yet  
**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**. Phase 9 remains CLOSED. Slice E is already merged through PR #2661 / final head `995c727d` / merge `99ea990b` / CI #6797 green.

**Evidence / source contract:** the first supported historical source is a confirmed Accounting Inbox `OTHER_DOCUMENT` XLSX matching the existing SanQ `Customer Statement` layout. Reconstruction reuses the existing retained `AccountingSourceArtifact` plus `AccountingTabularPreviewService`; it does not add a second evidence store, parser dependency, Prisma model, schema change, or migration. The Web evidence selector reads confirmed OTHER inbox items rather than only manual-upload records, so future confirmed Gmail XLSX evidence can use the same path.

**Control-total reconciliation:** the parser reads source-backed counterparty, date, item, negotiated unit price, quantity, amount, tax, subtotal, total quantity, total amount, total tax, total subtotal, paid amount, and balance due. Every source row must reconcile `quantity × negotiated price = amount` and `amount + tax = subtotal`; statement controls must reconcile to the sum of source rows and `Paid Amount + Balance Due = Total Subtotal`. Unsupported negative/non-positive statement controls fail closed.

**Returns / precision:** negative quantity rows such as supermarket returns/credits are accepted at source-row level when their extended amount reconciles. The canonical reconstruction does not fabricate individual transactions and does not reinterpret returns as discounts. Rows are netted only within the same item + negotiated-price group; each resulting net group must remain positive and reconcile exactly. One reviewed monthly statement therefore becomes one canonical `PERIOD_SUMMARY` Sale candidate.

**Tax / account authority:** HST is taken only from the statement's explicit tax control; no tax amount or rate is inferred. Reconstruction policy reuses the existing C1 External Sale revenue/HST account authority constants instead of owning a second GL allowlist. Web contains no GL account IDs, Journal builder, tax arithmetic authority, or posting policy.

**Preview / deterministic idempotency:** preview builds the proposed canonical Sale and emits a SHA-256 `planHash` over the Accounting start date, artifact stable ID/content hash, normalized source controls, and proposed Sale. Execute rebuilds the plan from the currently retained artifact and requires the exact reviewed hash. The historical Sale request ID is deterministic UUIDv5 derived from artifact identity/content, so editing classification cannot create a second stable Sale for the same evidence; classification changes alter the plan/fact and therefore conflict rather than duplicate.

**Canonical write authority / evidence atomicity:** execute does not write Journal tables directly. It calls the existing C1 `AccountingExternalSalesService` through a narrow evidence-aware internal seam. Inside the existing Serializable transaction, C1 revalidates that the artifact is still unchanged `CONFIRMED / OTHER_DOCUMENT` evidence, then persists the External Sale fact, canonical Journal, Journal anchor, `AccountingExternalSaleEvidence` relation, `EXTERNAL_SALE_POST` audit, and evidence-link audit atomically. An idempotent replay must also retain the reviewed evidence link or it fails closed.

**Fiscal boundary:** the canonical Accounting start date remains `2026-06-01`. Any statement whose source period begins before that date is returned as `BLOCKED / PRE_START_OPENING_BALANCE_REQUIRED` and cannot post revenue through Slice F. The reviewed April sample therefore remains evidence only; any pre-start receivable/cash position is deferred to Slice G Opening Balance rather than moved into June revenue.

**Settlement boundary:** a statement with non-zero `Paid Amount` is returned as `BLOCKED / PAID_AMOUNT_REQUIRES_SETTLEMENT_EVIDENCE`. The statement alone is not accepted as proof of settlement date, collection account, commission, withholding, or bank movement. Historical Settlement reconstruction remains evidence-gated and must not be inferred from receivable statements.

**Web operator flow:** Accounting External Sales adds a separate Historical reconstruction surface. The operator selects confirmed OTHER XLSX evidence, previews server-produced counterparty/period/control totals/proposed Sale/planHash, and may execute only when backend status is `READY`. Pre-start or settlement-incomplete evidence shows `BLOCKED` and no execute action. External Sale detail now exposes linked source-evidence identity.

**Architecture / compatibility:** this work remains Accounting-owned and reuses only the existing Accounting -> Brand/Store public configuration seam. The reconstruction service has no Orders, Payments, POS, Catalog, External Channels, or direct Journal persistence import. Existing live `POST /accounting/external-sales` behavior and request contract remain unchanged; evidence binding is an Accounting-internal optional path used only by reconstruction. Web detail treats the new evidence field as additive/optional for rolling compatibility.

**Coverage added:** focused policy/service/C1/query/Web-boundary regressions cover statement control reconciliation, negative-return netting, deterministic request identity, planHash mismatch rejection, pre-start fail-closed behavior, evidence-aware C1 atomic write, query evidence projection, reconstruction routes, and the browser's absence of Journal/GL authority.

**Validation state:** per `AGENTS.md`, no local lint/build/test/scanner/formatter command has been run before user review. GitHub Actions remains the authoritative validation gate after explicit remote-delivery authorization.

**Remote result:** Slice F was subsequently delivered as PR #2701. Final head `9b5a1226`; CI #6924 passed API lint/build/strict/tests, Web lint/build/strict/tests, Browser E2E, printer-agent and Windows workstation; squash merge `23f4f526` landed in `dev`.

**Docs:** `docs/architecture/accounting-external-sales-plan.md`, `docs/architecture/current-dependency-graph.md`, `ACCOUNTING_PRODUCT_ROADMAP.md`, and this new continuation worklog are synchronized. The original `modularization-worklog.md` is intentionally left unchanged because of the MCP single-file write limit described above.

## 2026-10-05 — External Sales Slice G1 Opening Receivable Foundation

**Branch/base:** source implementation used `feat/accounting-external-sales-slice-g-opening-balance` from `origin/dev@23f4f526`.  
**State:** **MERGED / SOURCE PR #2702 / MERGE `39a4b402` / SOURCE CI #6928 GREEN / MIGRATION REVIEWED / DEV CI #6930 GREEN / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE / PRODUCTION DEPLOYMENT PENDING**. Phase 9 remains CLOSED.

**Readiness result:** Accounting already owns `OPENING_BALANCE` Journal semantics, active CAD Accounts Receivable and Opening Balance Equity accounts, Trial Balance / Balance Movement opening treatment, and Financial Report exclusion of opening entries from period P&L. Production audit found zero existing Opening Balance Journals and zero closed Accounting periods. The missing capability was a durable receivable identity: current External Sale C2 allocations are intentionally FK-bound to `AccountingExternalSale`, so a bare opening Journal would not provide an auditable future settlement target.

**Persistence:** additive `AccountingOpeningReceivable` stores stable source identity, configured Store, cutover opening date, counterparty/reference, positive CAD amount, fact hash, canonical Journal anchor, note and actor/timestamps. No existing External Sale/Settlement table or FK is changed. This requires a user-generated additive migration before production promotion.

**Posting authority:** create input does not expose `openingDate`; the service derives it from configured `accountingStartDate` and validates the configured Store. The dedicated `accounting.opening_receivable.v1` authority permits exactly one `OPENING_BALANCE` Journal shape: debit Accounts Receivable and credit Opening Balance Equity. Revenue, HST, Catalog/Order pricing and External Sale source identities are absent. Generic Journal creation explicitly rejects this source-fact type.

**Atomicity / audit:** source fact, dedicated Journal, source->Journal anchor and `OPENING_RECEIVABLE_POST` audit are created inside one Serializable Accounting transaction. Stable request UUID -> source stable ID plus fact hash provides idempotent replay; a replay with changed facts fails closed, and an existing source fact without a valid canonical Journal anchor requires review.

**HTTP/read model:** ADMIN/ACCOUNTANT gains additive list/detail/create routes under `/accounting/opening-receivables`. G1 intentionally adds no Web operator page, settlement, reversal, correction or External Sale allocation changes.

**Migration review:** user-generated `20261005145529_accounting_opening_receivable_g1_foundation` exactly matches the final Prisma model: one additive `AccountingOpeningReceivable` table, stable-id/idempotency/Journal-anchor uniques and three query indexes. No DROP, rename, backfill, enum rewrite, existing-row rewrite or FK cascade is present. The first empty generated migration was removed from the final repository tree and is not part of replay. Commit `3399c93e` is the reviewed final migration state; push CI #6930 passed API/Web, Browser E2E committed-migration replay, printer-agent and Windows workstation.

**Next slice — G2 Opening Receivable Settlement:** add a dedicated `accounting.opening_receivable_settlement.v1` source fact and dedicated settlement persistence linked to one Opening Receivable. Outstanding authority must be derived from the live G1 canonical Opening Balance Journal minus live prior G2 settlements. Permit partial/full explicit active-CAD BANK/CASH collection only; reject over-settlement and dates before cutover; post exactly `Dr BANK/CASH / Cr AR` through a purpose-specific STANDARD Journal authority inside one Serializable transaction. Do not make External Sale C2 allocations polymorphic, do not infer fees/tax, and do not add reversal/Web yet. G2 is expected to require a second additive user-generated migration after source/schema review.

## 2026-10-05 — External Sales Slice G2 Opening Receivable Settlement (local review state)

**State:** **LOCAL SOURCE/SCHEMA IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED / NOT PUSHED / CI NOT RUN** on `feat/accounting-opening-receivable-settlement-g2`, based on latest `origin/dev@0417834f`. No migration was generated or edited by MCP.

**Dedicated authority:** G2 adds Accounting-owned `AccountingOpeningReceivableSettlement` and source fact `accounting.opening_receivable_settlement.v1`. It does not reuse `AccountingExternalSaleSettlement` or make `AccountingExternalSaleSettlementAllocation.externalSaleId` nullable/polymorphic. Stable request UUID -> deterministic settlement stable ID plus frozen fact hash provides replay identity; a matching source fact without a canonical Journal anchor fails closed for manual review.

**Canonical outstanding:** the opening amount is re-derived from the live G1 `OPENING_BALANCE` Journal and must have exact `Dr AR / Cr Opening Balance Equity` shape. Every prior G2 settlement is re-derived from its live canonical `STANDARD` Journal and must have exact `Dr selected BANK/CASH / Cr AR` shape. Persistence amounts are checked against those Journals but are not accepted as final financial authority. `outstanding = canonical opening AR - canonical prior settlements` is evaluated during the Serializable command and again inside the purpose-specific Journal write authority immediately before posting, so concurrent over-settlement is fail-closed through the existing Serializable retry path.

**Collection/account/date policy:** the collection account is explicitly supplied and must currently be active, CAD, ASSET and type BANK or CASH; there is no default bank and arbitrary GL injection is rejected. Settlement amount must be a positive safe integer and cannot exceed outstanding. Settlement date cannot precede the G1 opening date or configured Accounting cutover date.

**Atomicity/read model:** settlement persistence, canonical Journal, Journal anchor and `OPENING_RECEIVABLE_SETTLEMENT_POST` audit are one Serializable transaction. ADMIN/ACCOUNTANT gains `POST /accounting/opening-receivables/settlements`; existing Opening Receivable list/detail now return canonical `openingAmountCents`, `settledAmountCents`, `outstandingAmountCents` and settlement history after validating all Journal anchors. Generic Journal create/update/delete now reject both G1 and G2 Opening Receivable canonical source facts; this closes the G1 mutation gap discovered during G2 static review.

**Architecture/tests:** source changes remain inside Accounting and add no cross-context import direction, direct-import allowance or scanner exception. Architecture coverage pins the dedicated settlement model, non-polymorphic External Sale C2 allocation, generic-Journal block and ADMIN/ACCOUNTANT route. Unit coverage includes deterministic source hash, positive/CAD policy, BANK/CASH allowlist, date gate, canonical Journal shapes, partial settlement, over-settlement and unanchored replay failure. Per `AGENTS.md`, no local lint/build/test was run before user review; formal scanner/CI evidence is pending authorized remote delivery.

**Migration gate:** Prisma adds one dedicated Opening Receivable settlement table with relations to the Opening Receivable and selected collection account plus stable-id/idempotency/Journal-anchor uniqueness and query indexes. The next step after source review/authorized source merge is the user-local `prisma migrate dev --create-only` flow, followed by MCP migration review before the migration is committed to `dev`.

**Remaining sequence:** G3 = Opening Receivable reversal/correction + operator Web; H = migration/deployment gate + active production verification + historical reconciliation + final External Sales closeout.

**Validation state:** G1 source CI #6928 and migration push CI #6930 are green. No local validation command was substituted for GitHub Actions.
