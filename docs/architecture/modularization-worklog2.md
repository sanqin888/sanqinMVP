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

**Docs:** `docs/architecture/accounting-external-sales-plan.md`, `docs/architecture/current-dependency-graph.md`, `ACCOUNTING_PRODUCT_ROADMAP.md`, and this new continuation worklog are synchronized. The original `modularization-worklog.md` is intentionally left unchanged because of the MCP single-file write limit described above.
