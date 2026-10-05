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

## 2026-10-05 — External Sales Slice G2 Opening Receivable Settlement (complete in dev)

**State:** **MERGED / SOURCE PR #2704 / MERGE `2019caf9` / SOURCE CI #6934 GREEN / MIGRATION `20261005165144_accounting_opening_receivable_settlement_g2` REVIEWED ADDITIVE-ONLY / DEV `5c5d21ae` / CI #6936 GREEN / PRODUCTION DEPLOYMENT PENDING**.

**Dedicated authority:** G2 adds Accounting-owned `AccountingOpeningReceivableSettlement` and source fact `accounting.opening_receivable_settlement.v1`. It does not reuse `AccountingExternalSaleSettlement` or make `AccountingExternalSaleSettlementAllocation.externalSaleId` nullable/polymorphic. Stable request UUID -> deterministic settlement stable ID plus frozen fact hash provides replay identity; a matching source fact without a canonical Journal anchor fails closed for manual review.

**Canonical outstanding:** the opening amount is re-derived from the live G1 `OPENING_BALANCE` Journal and must have exact `Dr AR / Cr Opening Balance Equity` shape. Every prior live G2 settlement is re-derived from its canonical `STANDARD` Journal and must have exact `Dr selected BANK/CASH / Cr AR` shape. Persistence amounts are integrity checks, not final financial authority. `outstanding = canonical opening AR - canonical prior live settlements` is evaluated during the Serializable command and again inside the purpose-specific Journal write authority.

**Migration/validation:** the user-generated migration adds one dedicated settlement table, Prisma uniques/indexes, an Opening Receivable RESTRICT FK and a collection-account RESTRICT FK. It contains no DROP, rename, backfill, enum rewrite or existing-row rewrite. Commit `5c5d21ae` passed push CI #6936 across API checks/tests, Web, Browser E2E committed-migration replay, printer-agent and Windows workstation. No new context edge, scanner allowance or architecture baseline change was introduced.

## 2026-10-05 — External Sales Slice G3 Opening Receivable Reversal / Correction + Web (complete in dev)

**State:** **MERGED / SOURCE PR #2705 / MERGE `343d1c13` / SOURCE CI #6940 GREEN / MIGRATION `20261005185654_accounting_opening_receivable_g3_reversal_web` REVIEWED ADDITIVE-ONLY / DEV `1560e12a` / CI #6942 GREEN / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE / PRODUCTION DEPLOYMENT PENDING**.

**Reversal authority:** G3 reserves `accounting.opening_receivable_reversal.v1` and `accounting.opening_receivable_settlement_reversal.v1`. Dedicated reversal commands freeze the original canonical G1/G2 Journal snapshot and post a MANUAL `ADJUSTMENT` with exact debit/credit inversion, same Store/currency/occurredAt/dimensions, through a purpose-specific Journal writer. The two reversal source types join the existing Opening Receivable generic-Journal deny set, so generic create/update/delete cannot forge or mutate G3 authority.

**Ordering / outstanding:** G1 cannot reverse while a live G2 settlement exists. A G2 settlement counts as reversed only when all reversal metadata is present and its live reversal Journal validates as the exact inverse of the original settlement Journal. Canonical Opening AR reads and the Serializable G2 in-transaction outstanding recheck exclude only such fully validated reversals; partial/missing/malformed reversal evidence fails closed.

**Immutable correction:** G1 and G2 gain separate nullable one-to-one self-replacement lineage. Replacement IDs intentionally stay outside the frozen G1/G2 v1 source fact/hash contracts, preserving existing fact-hash semantics. A replacement predecessor must already be fully reversed with a live purpose-specific reversal Journal and must not already have another replacement.

**API/Web:** ADMIN/ACCOUNTANT adds Opening AR form options plus G1/G2 reversal routes. Accounting owns the configured Store and explicit active CAD ASSET BANK/CASH collection-account options. The mobile-first `/accounting/opening-receivables` Web workspace covers history/detail, canonical opening/settled/outstanding balances, new Opening AR, collection, audit history, required-reason reversal and reversal + prefilled replacement. Browser code constructs no Journal and contains no GL account allowlist/default-bank stable ID.

**Architecture/tests:** controller route inventory is updated; G3 architecture coverage pins dedicated reversal types, non-polymorphic External Sale C2, generic Journal guards and frozen G1/G2 fact contracts. New authority tests cover exact inverse, settlement reversal and tamper/reason binding; service coverage includes atomic settlement reversal, blocking G1 reversal while a live G2 exists, and restoring canonical outstanding after a fully validated G2 reversal. Exact-inverse read/in-transaction checks include line order, account, category, memo and swapped debit/credit amounts. Web follows the existing External Sales component split (page/create form/settlement form/detail/utils), while contract coverage pins server-owned options and no browser Journal/GL policy.

**Migration/validation:** the user-generated migration adds only nullable reversal metadata plus one-to-one self-replacement FKs/uniques/indexes on the existing G1/G2 tables. It contains no DROP, rename, backfill, type rewrite, NOT NULL tightening or existing-row rewrite. The generated unique warnings apply to new nullable columns and are safe for existing rows. CI #6942 replayed the full committed migration chain and passed API/Web, Browser E2E, printer-agent and Windows workstation.

## 2026-10-05 — External Sales Slice H Closeout / Production Verification readiness

**State:** **READINESS AUDIT COMPLETE / PRODUCTION PROMOTION AUTHORIZATION REQUIRED / NOT DEPLOYED / NOT PRODUCTION VERIFIED**. No production mutation was performed.

**Production baseline:** production repository is clean at `main@feff02c8`; running API/Web images are pinned to `554997d743197cf9c2a9c96714e5c600f1d337aa`, so checked-out main and runtime image SHA differ. Database migration history currently ends at `20261004131125_add_operating_availability_history`; G1/G2/G3 migrations are pending and Opening Receivable tables are absent. Existing External Sale tables contain zero Sales, zero Settlements, zero evidence links and zero External Sale canonical Journals. There are zero closed Accounting periods. Required active CAD CoA identities for AR, Opening Balance Equity, primary BANK, Commission Expense, HST payable and HST recoverable are present.

**Promotion/deployment gate:** `dev@1560e12a` is 12 commits ahead of production main and the promotion set consists of CI #2700 plus External Sales F/G1/G2/G3 source/docs/migrations. The normal dev-to-main PR/CI/image flow must complete first. The runtime path does not auto-run Prisma migrations. Because G1/G2/G3 are additive-only, the preferred authorized rollout is: record backup/readiness baseline -> make the exact promoted image available -> apply the three pending migrations -> activate that exact image -> run the runtime-readiness helper and bounded startup-log review. This readiness audit does not authorize migration, restart or deployment.

**Active financial verification:** use clearly tagged small controlled facts and accept that reversed facts remain immutable audit history. Verify one External Sale through partial/full Settlement, Settlement reversal, replacement Settlement, full Settlement reversal before Sale reversal, replacement Sale and final reversal to zero net test effect. Separately verify Opening Receivable through partial/full G2 collection, collection reversal, replacement collection, G1 reversal only after all live collections are reversed, replacement Opening Receivable and final reversal to zero net test balance. Capture canonical Journal anchors, outstanding AR, Sales Analytics and Financial Report effects throughout; Opening Receivable must never appear as Sales/HST/P&L.

**Historical evidence:** production has one real eligible retained Customer Statement artifact, `acctart_qcyovbh12vq5nle9looyzwpf` / `丰亚结算单26年4月.xlsx`, confirmed as OTHER_DOCUMENT. After deployment it must preview as `BLOCKED / PRE_START_OPENING_BALANCE_REQUIRED` with no Sale/Journal. That April statement does not prove the amount collectible on 2026-06-01 and must not be copied into G1 automatically. No confirmed post-start Customer Statement XLSX exists today, so successful production reconstruction execute remains an evidence gap unless authentic post-start evidence is later supplied or the operator explicitly accepts that item as deferred.

**Safe deferrals:** production has zero closed months, so do not manufacture a close/reopen solely to test closed-month correction. Closed-period ADJUSTMENT behavior remains source/CI evidence until a natural closed month or separately authorized controlled test exists. Inventory/COGS remains outside this program.

**Next gate:** user review of this readiness record, then explicit authorization is required before any dev-to-main promotion or production migration/deployment.
