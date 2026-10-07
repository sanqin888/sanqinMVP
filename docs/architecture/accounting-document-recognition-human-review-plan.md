# Accounting Document Recognition & Human Review Plan

Status: **SLICE 0-3 + 3V-A + 3V-B DEV MERGED / CI GREEN / 3V-B PRODUCTION VERIFICATION PENDING / EVIDENCE VIEWER SLICE 1 + 1B + 2 MERGED / RELIABILITY SLICE A + B MERGED / EXPENSE REVIEW HARDENING MERGED / ORIGINAL SLICE C UX CLOSEOUT MERGED (#2445 / `da77b9a5`, CI #6074 GREEN) / GMAIL INCREMENTAL + DUPLICATE FILE ARTIFACT FOLLOW-UP PRODUCTION VERIFIED (#2605 / `bfbf8e2c`, CI #6605, MIGRATION APPLIED) / EXPENSE SOURCE-EVIDENCE READINESS LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION NOT APPLIED / POSTED FINANCIAL CORRECTION A0 + A1 MERGED / CI #6973 GREEN / PR #2715 / MERGE `2e172b33` / A2 LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED + NOT GENERATED / A3 NOT STARTED — DO NOT REOPEN PHASE 9**  
Planning date: 2026-09-20; updated: 2026-10-06  
Audit baseline: `origin/dev@1ede0599`; Slice 3 merged in PR #2432 as `caabf1c1`; Slice 3V-A merged in PR #2439 as `0d6909bb` after PR CI #6054 and merged-head CI #6055 passed; Slice 3V-B merged in PR #2440 as `0ac9117f` after final head `3c5c0400`, PR CI #6057 and merged-head CI #6058 green  
Owner: **Accounting / Reporting / Analytics**  
Phase 9 status: **remains PRODUCTION VERIFIED / CLOSED — do not reopen Phase 9**

## 1. Purpose

SanQ Accounting already preserves original evidence, parses provider financial documents,
requires Inbox review, builds settlement Shadow Preview, and writes balanced canonical
Journal entries. Two real production-evidence cases exposed a different class of risk:

1. machine extraction can be wrong while the source document is correct;
2. machine extraction can be incomplete or semantically ambiguous while a human reviewer
   knows either the correct source value or the correct accounting treatment;
3. the current review flow can confirm or reject/classify evidence, but cannot create a
   durable, auditable correction to the machine-derived financial lines.

The target is therefore **not** merely a better OCR engine. The target is a document
evidence pipeline where:

```text
original evidence
    -> machine extraction
    -> human review / correction revision
    -> deterministic reconciliation
    -> Shadow Preview
    -> confirmed posting authority
    -> Journal
```

Machine extraction must never become the final accounting authority by itself, and human
review must never silently overwrite the machine result or source evidence.

## 2. Binding architecture constraints

This work stays inside the existing Accounting L3 ownership boundary.

- Accounting owns expenses, settlements, reconciliation, accepted posting and financial
  read models.
- External providers and source documents remain evidence; they do not own SanQ Journal
  semantics.
- Web Accounting is an adapter and must not own financial classification/posting policy.
- Money remains integer minor units with explicit currency.
- Source evidence, machine extraction, operator review and posted Journal authority must
  remain traceable.
- Posted historical facts must not be silently rewritten.
- Any persisted review/correction model requires the repository's normal Prisma
  expand-contract and user-local migration workflow.
- Any new runtime dependency such as PaddleOCR/PaddlePaddle requires separate dependency
  authorization before manifest/image changes.
- No production Web Clover payment semantics, UberEats wire behavior, Orders facts or
  provider cutover behavior is changed by this project.

This is a **post-modularization Accounting product/reliability project**, not a new
Phase 9 slice.

## 3. Current implementation audit

### 3.1 Current accepted file types

`AccountingInboxAcquisitionService.detectFile()` currently accepts:

- PDF;
- CSV;
- XLSX;
- JPEG;
- PNG;
- WebP.

DOCX is not currently accepted by the Accounting Inbox.

### 3.2 Current image path

When Textract is enabled, images currently use:

```text
image
  -> Sharp + local receipt geometry analysis
  -> crop / orientation / resize / JPEG preparation
  -> AWS Textract AnalyzeExpense
  -> normalized extraction
```

If Textract fails, the existing local Tesseract path is used as a fallback.

The current API runner already contains:

- `sharp`;
- `tesseract-ocr`;
- English and Simplified Chinese Tesseract language data;
- Poppler.

Therefore image preprocessing and a local OCR fallback already exist. PaddleOCR is **not**
currently installed.

### 3.3 Current PDF path

PDF currently uses:

```text
PDF
  -> Poppler pdftotext
  -> plain extracted text
  -> provider-specific text parser / regex mapping
```

Textract is used for PDF only when the local Poppler result is empty.

This means a machine-generated PDF with a valid text layer can still lose two-dimensional
layout relationships before provider parsing. A PDF can therefore be "readable" but still
be parsed incorrectly.

### 3.4 Current XLSX / CSV path

CSV has dedicated structured parsing paths.

XLSX is currently recognized as `AccountingArtifactKind.OTHER` and has one explicit
provider-financial parser: Fantuan Adjustment Detail. That parser reads workbook cells
directly through `@keep-lts/xlsx`. This is the correct pattern for structured Excel data:
do not OCR cells that can be read natively.

### 3.5 Current provider-financial review authority

The current operator flow can:

- change Inbox classification before materialization;
- choose provider before materialization;
- open original evidence;
- inspect a machine extraction preview;
- confirm provider financial evidence;
- discard eligible unmaterialized evidence.

It cannot:

- edit a machine-extracted provider-financial amount;
- correct a label-to-value pairing;
- change the effective component/tax role through a formal reviewed revision;
- resolve a blocked semantic line with a durable operator decision;
- preserve "machine value" and "reviewed value" as two separate auditable facts.

Once provider evidence has been materialized, Inbox classification is intentionally locked.

For Email/Manual Upload provider evidence, the current flow generally stores a machine
parse suggestion first and materializes the ProviderFinancialDocument only when the
operator presses Confirm. Provider API evidence may materialize earlier. A Human Review
workflow therefore should not overload the existing Confirm button; it should introduce an
explicit review-draft/effective-document step so an operator can correct machine output
before final confirmation while preserving Provider API idempotency.

### 3.6 Current document revision semantics

`AccountingProviderFinancialDocument` already supports provider-document revisions through
`businessIdentityKey + revision + supersedesDocumentId`.

However, those revisions represent **new source artifacts/content**. The document has a
unique `artifactId`, and replaying the same artifact content returns the existing
materialized document.

Therefore the existing document revision model is not an appropriate mechanism for a human
correction to the same source artifact. Reusing it would conflate:

- source/provider revision; and
- SanQ human review revision.

A separate reviewed-revision authority is required.

### 3.7 Current settlement safety gap

`buildProviderSettlementDocumentPlan()` classifies normalized lines, sums each POSTABLE
line into the provider-pending account, maps the opposite side to target accounts and then
verifies only that the generated Journal is debit/credit balanced.

A balanced Journal proves only:

```text
debits == credits
```

It does **not** prove:

```text
parsed component values == the source statement's control totals
```

The current settlement policy has no general provider-statement control-total integrity
gate before READY.

A read-only production data audit on 2026-09-20 found four current Statement documents:

- Uber June: raw POSTABLE sum `122285` cents and source Net Total `122285` cents;
- Uber July: raw POSTABLE sum `369682` cents but source Net Total `143194` cents;
- Fantuan June: raw POSTABLE sum and Total transfer amount both `292539` cents;
- Fantuan August: raw POSTABLE sum and Total transfer amount both `381311` cents.

The malformed Uber July document has **no provider-settlement Journal entry**, while the
other three Statement documents are already posted. This means the current incident can
still be corrected without rewriting a posted July Journal.

## 4. Real incidents that define the requirements

### 4.1 Uber July 2026 layout-loss incident

The source Uber monthly statement contained:

```text
Sales          $2,603.36
Tax on Sales     $338.48
...
Net Total      $1,431.94
```

The extracted plain-text order placed both labels before both amounts. The current
`findNamedAmount()` logic mapped `Tax on Sales` to `$2,603.36`.

The resulting canonical lines contained:

```text
Sales        = 260336 cents
Tax on Sales = 260336 cents   <- wrong
Net Total    = 143194 cents   <- source control total remains correct
```

The settlement draft then summed POSTABLE lines and produced provider pending
`$3,696.82`, while the statement's Net Total remained `$1,431.94`.

This is a critical example of why:

1. layout-aware extraction is preferable to plain-text positional guessing;
2. provider control totals must fail closed before READY; and
3. an operator must be able to correct a machine extraction without changing source
   evidence or patching code for one document.

### 4.2 Fantuan August 2026 Adjustment incident

The Fantuan monthly Summary contained a non-zero Adjustment but did not itself decompose
the economic meaning. The system correctly failed closed.

A supplementary Detail workbook later proved the amount as Compensation plus Deduction,
and the current implementation now uses the Detail as supplementary evidence while the
Summary remains monthly authority.

That solution is valid evidence-driven reconciliation, but it exposed a workflow gap:
supplementary evidence is currently the only supported resolution path. A later real July
2026 Chinese Fantuan Detail workbook also showed that provider-native structured exports
can vary by locale: ordinary rows use `单据类型 = 订单`, while the observed adjustment rows
use `单据类型 = 扣款`, blank `订单类型`, and Chinese column labels such as `单据时间`,
`单据号` and `结算金额`. The native XLSX adapter therefore owns explicit observed
English/Chinese aliases and keeps unknown non-order document types fail-closed; it does not
guess an unobserved Chinese Compensation label from amount sign or remarks.

There is no general operator review authority for:

- correcting a source-reading error;
- classifying a source line when the source evidence is sufficient but the parser lacks a
  mapping; or
- explicitly placing an unresolved amount into a reviewed suspense workflow when policy
  allows it.

## 5. File-format strategy

Do **not** force every file through one OCR engine.

Use the strongest native representation first:

| Input | Preferred primary path | Fallback / optional path |
| --- | --- | --- |
| CSV | native structured parser | manual review |
| XLSX | native workbook/cell parser | manual review |
| DOCX | not currently accepted; future native parser decision | manual review |
| native-text PDF | local Poppler text + bbox/layout | fail closed / Human Review |
| scanned PDF | local Poppler page detection + bounded page rasterization -> synchronous Textract image OCR per page | fail closed / Human Review |
| JPEG/PNG/WebP | synchronous Textract image path when enabled | existing Tesseract fallback / Human Review |
| email body | native text | manual review |

The output of each adapter should converge on one internal document-extraction contract,
not one universal OCR implementation. This table is the current approved routing direction;
Paddle/BDA and S3/async Textract are not fallback defaults.

## 6. Recognition-engine assessment

This section records the engine assessment that informed the 2026-09-21 architecture decision.
It is no longer a gate requiring a Paddle/BDA benchmark before the normal PDF path can proceed.
New engines should still not be adopted from generic vendor claims; they require a demonstrated
SanQ gap plus explicit architecture/dependency authorization.

### 6.1 AWS Textract

Current integration: **already present**.

Strengths for SanQ:

- purpose-built receipt/invoice `AnalyzeExpense` path;
- image and PDF support;
- structured summary fields and line items;
- geometry/confidence evidence;
- no model runtime load on the 2 GB production VM.

Limitations / current role for this project:

- provider monthly statements are not necessarily receipt/invoice layouts;
- native-text PDFs stay on local Poppler and do not use Textract merely because Textract can
  accept PDFs;
- the existing scanned-PDF fallback still sends PDF bytes directly to synchronous
  `AnalyzeExpense`; Slice 3V replaces that with bounded local page rasterization and
  synchronous image-page OCR;
- per-document/page cloud cost remains;
- a successful OCR result still needs Accounting reconciliation and human review.

### 6.2 Bedrock Data Automation (BDA)

Current integration: **not present; not part of the currently approved normal recognition path**.

Potential advantages considered during the earlier assessment:

- custom Blueprint-style semantic extraction is a better conceptual fit for fields such as
  Sales, Tax, Commission, Adjustment and Net Total;
- supports document inputs including PDF/images and async DOCX;
- useful for varying provider statement layouts.

Limitations / current disposition:

- higher per-document/page cost than the simplest Textract path;
- no XLSX input, so Excel still requires native parsing;
- adopting it would introduce a new external recognition/configuration path;
- it is not currently justified by a demonstrated gap in the local-PDF + page-Textract target;
- it would still require deterministic Accounting validation and human review.

### 6.3 PaddleOCR / PP-StructureV3

Current integration: **not present; not part of the currently approved normal recognition path**.

Potential advantages considered during the earlier assessment:

- local image and PDF recognition;
- layout/table/document-structure extraction rather than plain text only;
- can potentially cover both scanned images and provider PDFs through one local recognition
  adapter;
- can reduce cloud OCR calls if quality is sufficient.

Limitations / current disposition:

- it is not a native XLSX/CSV/DOCX parser;
- local installation adds Python/Paddle model/runtime dependencies;
- model memory/CPU must be measured against the current small Lightsail runtime;
- adopting it changes the production image/runtime footprint and therefore requires an
  explicit dependency/runtime authorization.

No Paddle work is scheduled in the current plan. If a future real document class exposes a
gap that Poppler + bounded Textract fallback cannot safely cover, Paddle may be reconsidered as
an isolated benchmark/spike. Any runtime adoption or separate process/container still requires
explicit dependency and architecture authorization before implementation.

### 6.4 Existing Tesseract / Poppler

Current approved role:

- Poppler is the primary deterministic native-text PDF extractor and bbox/layout source;
- the same installed Poppler runtime is the planned local rasterizer for bounded scanned-PDF
  pages before Textract image OCR;
- Tesseract remains the existing local image fallback, not the preferred scanned-PDF statement
  engine;
- recognition output still does not by itself create posting authority; control totals and
  Human Review remain separate layers.

## 7. Target internal extraction contract

The long-term target is an Accounting-owned, provider-neutral extraction boundary.

Conceptually:

```ts
type DocumentExtraction = {
  engine: string;
  engineVersion: string | null;
  pages: DocumentPage[];
  text: string;
  fields: ExtractedField[];
};

type ExtractedField = {
  key: string | null;
  text: string;
  page: number;
  confidence: number | null;
  geometry: BoundingBox | null;
};
```

Exact types are an implementation decision, but the important properties are:

- engine identity/version is retained;
- original text is retained;
- geometry/confidence can be retained when available;
- provider parsers consume this boundary instead of depending only on one flattened string;
- provider-specific mapping remains in Accounting's anti-corruption layer.

This boundary should not expose Textract/BDA/Paddle SDK DTOs to Accounting business policy.

## 8. Human Review Revision

### 8.1 Immutable layers

The required authority chain is:

```text
SourceArtifact                  immutable source evidence
    |
MachineExtraction              immutable machine observation
    |
HumanReviewRevision            immutable confirmed operator revision
    |
EffectiveProviderDocument      deterministic projection
    |
Reconciliation                 deterministic policy
    |
Settlement Preview / Journal
```

Do not overwrite the source artifact or machine extraction.

### 8.2 Review actions

At minimum, a reviewer needs to be able to:

- accept a machine line unchanged;
- correct `amountCents` when the original evidence visibly proves the correct amount;
- correct a label/value association;
- choose an allowed canonical component/tax role when the evidence supports it;
- mark a line as control/reconciliation-only where policy explicitly allows that choice;
- attach a reason code and optional note;
- reference supplementary evidence when required;
- save a draft without giving it posting authority;
- explicitly confirm a reviewed revision.

### 8.3 Correction categories

Use distinct semantics rather than one generic "edit":

**EXTRACTION_CORRECTION**

The source evidence already contains the correct fact; machine reading/pairing was wrong.

Example: Uber Tax on Sales `$2,603.36 -> $338.48`.

This should not require another external evidence file.

**SEMANTIC_CLASSIFICATION**

The amount is visible but the parser cannot determine its Accounting component.

The reviewer may choose only from an Accounting-owned allowed mapping set and must provide
a reason/note. The UI must not permit arbitrary account IDs or arbitrary Journal lines.

**SUPPLEMENTARY_EVIDENCE**

The source statement lacks enough detail. Another provider document proves the
decomposition.

Example: Fantuan Adjustment Summary + Detail workbook.

**UNRESOLVED / SUSPENSE**

Potential future policy: allow a settlement to proceed while an explicitly reviewed,
unresolved amount is parked in a dedicated suspense account/work queue.

This is **not authorized by this document**. It requires a separate Accounting policy
decision, CoA review, lifecycle/reclassification design and tests before implementation.

### 8.4 Review authority and concurrency

A confirmed review revision must carry at least:

- stable review identity;
- base provider document stable ID and source revision;
- review revision/version;
- operator stable ID;
- created/confirmed timestamps;
- correction reason(s);
- effective line snapshot or deterministic correction set;
- review hash used by Shadow Preview/replay authority.

Settlement replay must revalidate that the exact reviewed revision/hash used by Preview is
still current inside the existing Serializable execution boundary.

If the review changes after Preview, execution must fail with a stale-authority conflict
and require a new Preview.

## 9. Recommended persisted model direction

The exact Prisma names remain implementation details, but the cleanest direction is a
separate review authority such as:

```text
AccountingProviderFinancialDocument
  1 -> many AccountingProviderFinancialReviewRevision
             1 -> many AccountingProviderFinancialReviewedLine
```

The provider document remains the immutable machine/source materialization.

The review revision stores the operator-approved effective financial lines or a typed
correction representation. A confirmed review revision supersedes the prior review
revision; it does not mutate the source document.

Why not reuse `AccountingProviderFinancialDocument.revision`?

Because current document revision means a new source artifact/content revision. Human
reviewing the same PDF is a different kind of revision and must remain distinguishable in
audit/replay.

This model direction **will require a Prisma migration** when implementation begins.

## 10. Reconciliation must precede READY

Balanced Journal validation remains necessary but is not sufficient.

Provider-specific document integrity checks should run against the effective reviewed
document before a plan can be READY.

For Uber monthly statements, examples include:

```text
earnings components = Total Earnings
fee components      = Total Uber Fees
marketing components= Total Marketing Spends
amendment components= Total Amendments
section totals       = Net Total
```

For Fantuan/Clover, use their own source control totals and document semantics.

Rules:

- exact integer-cent comparison;
- zero tolerance unless provider documentation explicitly defines rounding behavior;
- mismatch -> BLOCKED with a specific reason;
- the UI must show expected, calculated and delta values;
- a human review can correct the underlying effective lines but cannot simply click
  "ignore reconciliation" and force READY.

## 11. Recommended implementation slices

### Slice 0 — Immediate fail-closed settlement integrity

Goal: prevent another incorrect-but-balanced provider Journal before building the full
review editor.

Scope:

- add provider statement control-total integrity policy;
- add the real Uber column-order regression fixture;
- make July-style mismatches BLOCKED before READY;
- surface reconciliation expected/calculated/delta in Preview;
- no schema change;
- no dependency change;
- no OCR-engine change.

Local implementation status on 2026-09-20: **IMPLEMENTED / REVIEW PENDING**.

The first fail-closed policy is intentionally scoped to **Uber monthly statements**, whose
source section/control semantics are already represented by the current canonical parser.
It validates Total Earnings, Total Uber Fees, Total Marketing Spends, Total Amendments and
Net Total before a document can be READY. Missing required controls produce
`PROVIDER_CONTROL_TOTAL_INCOMPLETE`; arithmetic mismatches produce
`PROVIDER_CONTROL_TOTAL_MISMATCH`. Shadow Preview now returns and displays source total,
calculated total and delta, and a blocked document receives no draft Journal.

The July `B4842290` regression is represented with the observed malformed canonical
values: Sales `260336`, Tax on Sales `260336`, Total Earnings `294184`, and Net Total
`143194`. The earnings check therefore exposes the `226488`-cent mismatch and prevents
the previously possible incorrect-but-balanced settlement plan.

Slice 0 deliberately does **not** repair the parser output, mutate the historical provider
document, add a Human Review persistence model, change OCR engines, add dependencies, or
change Fantuan/Clover settlement semantics. Those remain later slices after this safety
gate is reviewed.

### Slice 1 — Human Review Revision persistence + authority

Goal: allow a reviewer to correct machine-derived provider financial lines safely.

Scope:

- add reviewed-revision persistence;
- add operator/audit/reason/version/hash semantics;
- expose narrow Accounting review API contracts;
- have settlement preview consume the confirmed effective reviewed revision;
- replay binds and revalidates review authority;
- unreviewed provider documents remain fail-closed where correction is required.

Implementation status on 2026-09-20: **MERGED TO DEV / CI GREEN / MIGRATION INCLUDED AND REVIEWED**.

Implemented source semantics:

- `AccountingProviderFinancialDocument` remains the immutable machine/source materialization;
- separate Human Review Revision and typed Correction persistence stores full deterministic correction sets, including an explicit zero-correction revision when the reviewer returns to/accepts the machine evidence unchanged;
- review revisions use `DRAFT / CONFIRMED / SUPERSEDED`, stable review identity, operator identity, timestamps and SHA-256 review hash;
- `EXTRACTION_CORRECTION` may correct source-visible label/value association or amount but cannot alter Accounting classification fields;
- `SEMANTIC_CLASSIFICATION` may change Accounting component/posting/tax-role only, cannot rewrite source evidence values, and requires a review note;
- machine lines are never updated; Settlement projects the latest confirmed review over the immutable source lines and reruns provider reconciliation;
- creating or confirming a review revision is blocked once the provider document has an active posted Journal;
- Settlement replay authority carries the exact confirmed review stable ID/revision/hash/operator/timestamp, and the Serializable Journal write revalidates that authority before persistence;
- if Preview had no review but one is confirmed before execution, or if the confirmed revision/hash changes after Preview, execution fails closed and requires a new Preview;
- existing Fantuan supplementary evidence remains a separate evidence mechanism; if that supporting document itself has a confirmed Human Review Revision, its exact review authority is bound and revalidated too;
- no OCR engine, parser, provider wire contract, package dependency, context direction or public SCC changes are part of Slice 1.

PR #2429 merged to `dev` as `1903b32a` with CI #6017 green. The user-generated migration
`20260920150651_accounting_provider_financial_human_review_revision` was included in that PR and reviewed as additive-only: two enums, the ReviewRevision and ReviewCorrection tables, expected stable-ID/identity indexes, `ReviewRevision -> ProviderFinancialDocument` with `ON DELETE RESTRICT`, and `Correction -> ReviewRevision` with `ON DELETE CASCADE`. It contains no historical rename/backfill/drop operation.

### Slice 2 — Human Review UI

Goal: make the workflow usable from Accounting Inbox / Provider settlements.

UI should show side-by-side:

```text
source / machine value / reviewed effective value / reconciliation
```

Provide:

- original evidence link/view;
- machine engine/confidence where available;
- editable allowed fields;
- reason/note;
- draft/save/confirm;
- correction history;
- stale-preview handling.

Accounting Web remains an adapter; all allowed mappings/invariants stay server-owned.

Implementation status on 2026-09-20: **LOCAL IMPLEMENTED / REVIEW PENDING** on
`accounting/human-review-ui-slice2`.

Implemented UI behavior:

- materialized pending Provider Financial evidence exposes the Human Review panel directly inside Accounting Inbox; after Inbox confirmation, a handoff link jumps to the same document in Provider Settlements, where unposted statements remain editable;
- the panel lazily loads versioned review history and shows original evidence access, machine recognition engine/confidence when available, immutable machine values, the current confirmed effective values and correction reasons side-by-side;
- operators can create a full replacement review revision using `EXTRACTION_CORRECTION` or `SEMANTIC_CLASSIFICATION`, add per-line/revision notes, save a DRAFT and explicitly confirm the exact hash-bound draft;
- money editing stays in exact decimal-string -> integer-cent conversion in the Web adapter; server policy remains authoritative for allowed edits/invariants;
- current Shadow control-total reconciliation is shown next to reviewed values when a Preview exists;
- confirming a review immediately invalidates the client-held Shadow Preview and requires a fresh Preview before replay, while server-side stale-authority rejection remains the final safety boundary;
- review history remains visible on posted/supporting documents, but editing is intentionally disabled there in Slice 2. Supporting-evidence mutation after a parent settlement is posted needs a separate lifecycle audit before the UI exposes it;
- the existing oversized Settlements page is not given the editor responsibility directly: review model, comparison, editor, history and orchestration are split into cohesive feature components;
- no API route, Prisma schema/migration, OCR engine, package dependency or Accounting policy change is introduced by Slice 2.

### Slice 3 — Layout-aware extraction boundary using existing stack

Goal: stop provider parsing from depending only on flattened text.

Source implementation on `origin/dev@e52c44b9`:

- adds an Accounting-owned versioned `AccountingDocumentExtraction` contract with bounded
  page/line text, optional normalized geometry, engine identity, confidence and truncation
  metadata;
- retains the existing Poppler native-text path and adds `pdftotext -bbox-layout` as an
  optional layout pass, falling back to the existing text-only result if the layout pass is
  unavailable;
- retains Textract `LINE` geometry/confidence instead of discarding it after text flattening;
- represents the existing Tesseract fallback through the same contract as text-only evidence;
- persists extraction evidence in the existing parse-run JSON and revalidates that evidence
  before operator confirmation/materialization; malformed persisted layout evidence fails
  closed rather than silently degrading;
- upgrades the provider-financial parser to v4 and makes the known Uber monthly-statement
  label/value path layout-aware. A label with geometry must resolve to an inline value or a
  same-row value to its right; if the label is present but cannot be paired reliably, that
  field is omitted and the downstream control-total gate remains authoritative;
- records the exact label/value line evidence used for a layout-derived provider line in its
  immutable machine `rawPayload`, preserving page, bbox, confidence and engine identity;
- pins the observed July Uber failure shape so `Sales = 260336` and
  `Tax on Sales = 33848` instead of allowing flattened Poppler order to duplicate Sales;
- does not change Clover/Fantuan parsing semantics in this slice and does not add a new OCR
  runtime, package dependency, Prisma model/migration, provider wire contract or context edge.

Slice 3 was subsequently merged in PR #2432 as `caabf1c1`; its PR CI completed green. The
previous `REMOTE CI PENDING` status is obsolete.

#### 2026-09-21 Poppler / PDF path audit

A fresh read-only audit against `origin/dev@971a3172` establishes the following runtime facts:

- native PDFs already use local Poppler `pdftotext`, with an Accounting-owned optional
  `-bbox-layout` pass that normalizes page/line geometry into `AccountingDocumentExtraction`;
- provider parser v4 uses that geometry for Uber monthly-statement label/value pairing and
  fails closed when a geometry-backed label cannot be paired safely;
- the historical July Uber source shape is explained by flattened-text ordering: `Sales` and
  `Tax on Sales` appeared before their amounts, so the old adjacency parser duplicated Sales;
- focused regression coverage pins the intended July values `Sales = 260336`,
  `Tax on Sales = 33848`, and `Net Total = 143194`, but the current bbox fixtures are synthetic;
- a real July Fantuan production artifact has persisted `POPPLER / GEOMETRY` extraction with
  clean same-row label/value geometry, proving that the deployed Poppler bbox path is operating
  on real documents;
- current scanned-PDF fallback is weaker than the target architecture: fallback is triggered
  only when native text is exactly blank (`!text.trim()`), and the current Textract helper sends
  the PDF bytes directly to synchronous `AnalyzeExpense`;
- `Dockerfile.api` already installs `poppler-utils`, so local page rasterization can use the
  existing runtime instead of adding a package or service;
- Poppler/Alpine versions are not pinned today. Reproducibility pinning is a separate runtime
  decision, not silently bundled into document-recognition correctness work.

The remaining proof gap is therefore not another generic OCR benchmark. It is deterministic
SanQ evidence that the local Poppler path handles representative real provider documents and
that scanned PDFs use a bounded, page-aware OCR fallback.

### Slice 3V — Poppler golden verification + scanned-PDF routing hardening

The approved recognition direction is now:

```text
XLSX / CSV              -> native structured parser
native-text PDF          -> local Poppler text + bbox/layout
scanned PDF              -> local PDF validation/page detection
                            -> local page rasterization
                            -> one image page at a time to synchronous Textract
                            -> merge page-aware text/geometry
JPG / PNG / WebP         -> synchronous Textract image path
recognition uncertainty  -> fail closed / Human Review
```

This supersedes the earlier plan to benchmark PaddleOCR/BDA before choosing the normal PDF
path. SanQ will not introduce S3 + asynchronous Textract jobs merely to support ordinary
multi-page scanned PDFs, and it will not adopt Paddle/BDA in this work package without a new,
explicit architecture decision.

3V should be delivered in narrow steps:

1. capture sanitized real Poppler bbox golden evidence for representative provider PDFs,
   especially the observed Uber column-order shape, and exercise
   `Poppler bbox -> provider parser -> control-total` without mutating historical production
   documents;
2. replace the literal blank-text test with a conservative Accounting-owned
   `usable native PDF text` decision derived from real fixtures rather than an arbitrary
   threshold;
3. for PDFs without usable native text, obtain a bounded page count and rasterize one page at
   a time locally with Poppler, prepare each page under the existing Textract image limits,
   call synchronous Textract, then merge lines back into one PDF-level
   `AccountingDocumentExtraction` with original page numbers;
4. enforce page/size/time/line limits fail-closed. A page-limit overflow must go to Human
   Review rather than silently OCR only a prefix;
5. keep provider financial semantics in SanQ. Textract page-level OCR/layout may be merged,
   but per-page `TOTAL`, `TAX` or other `AnalyzeExpense` semantic fields must not be blindly
   aggregated into provider statement totals;
6. separately audit the current `PROVIDER_API` scanned-PDF fallback exclusion before changing
   it. Do not broaden provider ingestion behavior without evidence.

No new npm dependency, S3 bucket, async Textract workflow, queue, schema or migration is
required for this target.

#### Slice 3V-A — Native PDF usability + sanitized Poppler golden

Source implementation on `origin/dev@4d68379e` / branch
`accounting/document-recognition-3v-a` establishes the first half of Slice 3V without
activating the new scanned-PDF raster path:

- `accounting-pdf-routing.ts` owns a provider-neutral native-text decision with three outcomes:
  `USABLE_NATIVE_TEXT`, `SCAN_CANDIDATE`, and `FAIL_CLOSED`;
- usable native text requires at least eight Unicode letter/number characters, at least two
  meaningful tokens, and either at least two meaningful lines or at least four Han characters.
  This deliberately recognizes CJK text without relying on ASCII-only scoring;
- blank or fragment-only layers become `SCAN_CANDIDATE`; extraction truncation is
  `FAIL_CLOSED`; replacement/private-use/control-character contamination fails closed when at
  least four suspicious characters comprise at least 20% of non-whitespace characters;
- the decision records bounded quality metrics, including meaningful characters/tokens/lines,
  Han characters, suspicious-character ratio, extraction line count and geometry line count;
- provider semantic mapping runs only for `USABLE_NATIVE_TEXT`. Weak/suspicious native text is
  retained for operator review instead of being interpreted as financial facts;
- 3V-A intentionally does **not** broaden the old whole-PDF Textract path. Until 3V-B replaces it,
  only the historical `NO_NATIVE_TEXT` case may still use that legacy fallback. An
  `INSUFFICIENT_NATIVE_TEXT` candidate stays local/manual rather than being sent through the
  unsafe old raw-PDF path;
- persisted PDF routing evidence is revalidated before later manual provider confirmation, so an
  operator cannot bypass a non-usable native-text decision merely by selecting a provider;
- provider-financial parser v5 treats explicit `POPPLER / TEXT_ONLY` PDF evidence
  conservatively: it accepts a named amount only when label and value remain on the same extracted
  line, records that line evidence, and never falls back to cross-line flattened adjacency. A
  provider statement whose columns collapse into separate label/value line groups therefore fails
  closed instead of recreating the July column-order bug;
- sanitized July Uber fixtures preserve the observed flattened
  `Sales / Tax on Sales / $2,603.36 / $338.48` shape plus representative two-column bbox
  relationships. Source identifiers are removed and the source PDF itself is not committed.
  Regression coverage runs `bbox -> Accounting extraction -> provider parser -> settlement
  control totals` and pins `Sales = 260336`, `Tax on Sales = 33848`,
  `Net Total = 143194`, payout-section exclusion, and five matched Uber control-total checks;
- bbox coordinates in the sanitized fixture are representative geometry, not byte-for-byte
  production floating-point coordinates. Tests assert page/row/right-of-label relationships and
  financial semantics rather than exact Poppler coordinate bytes;
- no historical source artifact, machine extraction, Human Review Revision, posted settlement or
  Journal is rewritten or reprocessed by this source batch.

Slice 3V-A merged in PR #2439 as `0d6909bb`; PR CI #6054 and merged-head CI #6055
passed.

#### Slice 3V-B — Bounded scanned-PDF page raster + Textract merge

Final implementation merged in PR #2440 as `0ac9117f` after final head `3c5c0400`;
PR CI #6057 and merged-head CI #6058 passed. The merged path replaces the temporary whole-PDF
Textract fallback without adding another OCR engine or remote document-storage workflow:

- only `SCAN_CANDIDATE` PDFs enter this path. `USABLE_NATIVE_TEXT` remains on local Poppler
  text/layout and `FAIL_CLOSED` remains local/manual; Provider API remains excluded;
- page inspection uses the already-installed Poppler `pdfinfo`; PDFs are limited to **6 pages**.
  A larger document is rejected before page rasterization or Textract;
- pages are rasterized sequentially with the existing Poppler `pdftocairo` at **200 DPI**.
  Each Poppler command has a **10 second** timeout, bounded stderr, and a **20 MiB** raster-output
  ceiling. The existing Inbox source-file ceiling remains **25 MiB**;
- each rendered page is prepared as a non-cropped JPEG under the existing synchronous Textract
  image policy: at most **9,500,000 bytes** and **9000 px** on either axis. The receipt-specific
  crop heuristic is deliberately not reused for provider statements;
- synchronous AnalyzeExpense requests remain sequential (**concurrency 1**) and reuse the
  existing **20 second** Textract request timeout;
- the scanned-PDF adapter consumes **only Textract LINE blocks** for OCR text/confidence/geometry.
  AnalyzeExpense `SummaryFields`, line-item groups, inferred totals/tax/currency and receipt
  semantics are not merged into provider statement authority;
- successful page extraction requires non-empty OCR lines and layout geometry. Every line is
  remapped to the original PDF page and deterministic `pN-lX` identity before the pages are
  merged in page/top/left order;
- the complete PDF is capped at **2000 merged lines** and **57,000,000 bytes** of aggregate
  prepared Textract page images. Overflow is an error; the adapter never truncates to a
  successful prefix;
- any page-count, raster, image-preparation, Textract, empty-page, geometry, aggregate-resource
  or merged-line failure aborts the whole OCR result. Inbox acquisition records the parse as
  `ERROR`, retains the SourceArtifact/PENDING_REVIEW evidence, and does not call provider
  parsing/materialization on a partial prefix;
- the generic PDF review parse-run contract advances to v6 and records bounded
  `pdfOcrEvidence` diagnostics (page count, DPI, request/model IDs, prepared image
  dimensions/bytes and line counts) separately from receipt `textractEvidence`; when provider
  recognition succeeds before generic review, the same OCR evidence is carried into the
  provider-recognition/provider-financial parse runs instead of being dropped;
- Provider API behavior remains unchanged. Its current public ingress is CSV-only, and the
  scanned-PDF OCR branch keeps the explicit `acquisitionMode !== PROVIDER_API` guard. Enabling
  Provider API PDF OCR later would require a new evidence-backed decision;
- no raw PDF bytes are submitted to Textract by the normal scanned-PDF path after 3V-B. No
  S3/async Textract, queue, PaddleOCR, BDA, Prisma/schema/migration, package/lockfile or
  Docker/runtime-package change is introduced.

The historical posted Uber July statement remains immutable and was not reprocessed by this
batch. Existing control-total reconciliation and Human Review stay downstream authority after
OCR/provider mapping. Source/CI delivery is complete; active production verification of the new
scanned-PDF path remains pending.

#### Reliability Slice A — CSV ParseRun SUCCESS integrity

Reliability Slice A is merged to `dev` through PR #2442 / squash `994f5a67`; final remote validation
passed API/Web after the test-only typed matcher follow-up. It fixes a post-Phase-9 Inbox integrity
defect without changing CSV classification or financial semantics. `AccountingInboxCore`
requires every successful parse run to carry a SHA-256 `resultHash`, but two CSV acquisition paths
were bypassing that invariant at the orchestration call site: structured-expense CSV success and
same-priority provider-recognition ambiguity success. Both now hash the exact persisted
`resultJson` through the existing Accounting-owned `hashAccountingJson()` helper before recording
the `SUCCESS` ParseRun.

The structured-expense parser, one-row Expense suggestion, multi-row/invalid-row
`requiresBatchExpenseImport` fail-closed behavior, Provider API routing, provider recognition,
materialization and Journal authority are intentionally unchanged. Focused acquisition regressions
pin a policy-valid 64-character SHA-256 result hash for single-row structured expense CSV,
multi-row batch CSV and ambiguous provider-recognition CSV. No Prisma/schema/migration, package or
runtime dependency, context direction, scanner allowance, public contract, provider wire behavior,
Phase 9 status or production evidence is changed. Per repository workflow, local lint/build/tests
have not been run before user review; GitHub Actions remains the validation gate after explicit
remote authorization.

#### Reliability Slice B — Expense layout reconciliation + booking correction audit

Expense recognition now treats source amounts as a deterministic evidence set instead of three
independent suggestions. Native-text PDFs keep Poppler text extraction and additionally use the
existing bbox/layout geometry to pair Accounting-owned expense labels with same-row/right-hand
amounts. The resolver accepts direct inline amounts only when the label is followed immediately by
money, so descriptive text such as `Total discounts of $185.00` cannot become a generic Total.
Observed Bell-style `Taxes -> 9.74` plus `Total current charges -> 84.69` geometry can replace an
unsafe flattened-text HST match; when subtotal is absent but tax and total are reliable, subtotal is
recorded as the deterministic `total - tax` derivation with explicit evidence strategy.

All ordinary Expense recognition paths now expose `financialConsistency = MATCHED / MISMATCH /
INSUFFICIENT`. Native Poppler PDFs, bounded scanned-PDF page OCR and image Textract normalize into
the same invariant. Exact integer-cent `subtotal + tax == total` is required for `MATCHED`;
`MISMATCH` forces LOW extraction confidence and is shown prominently in Web rather than allowing a
misleading HIGH result. Source-currency arithmetic remains distinct from CAD booking arithmetic:
foreign-source totals are reconciled internally in their source currency and are not compared
numerically to a later CAD booking amount merely because FX conversion changes the number.

Ordinary Expense keeps machine extraction immutable and read-only, but does **not** introduce a
second persisted Human Review state machine. The existing Expense booking form remains the operator
authority for date, source currency, category splits, subtotal/tax/total, payment allocations and
memo. Web now makes that distinction explicit: machine values are shown as recognition evidence,
while the lower **Final booking values** section is editable and surfaces which machine-observed
fields have been manually corrected.

Final Expense materialization remains the only action that creates the ExpenseDocument and
AccountingTransaction rows. Server-side booking validation still requires exact integer-cent
balance for the final operator values. At confirmation, Accounting records a deterministic
`bookingReview` snapshot in the Expense `extractionJson`: machine values, final booked values,
machine financial-consistency state, corrected field names, operator identity and confirmation
timestamp. A matching `CONFIRM_EXPENSE_BOOKING` AccountingAuditLog entry preserves the same review
evidence. Foreign-source amounts remain distinct from CAD booking amounts, so FX conversion alone
does not create a false amount-correction flag.

No Expense review enum/table/relation/API is added, and Provider Financial Human Review remains
unchanged. Slice B therefore requires **no Prisma migration**, no package/runtime dependency, no
provider wire change, no context direction, no architecture scanner allowance and no public SCC
change; Phase 9 remains closed.

#### Original Slice C — Inbox pre-confirm visibility + irreversible-action UX closeout

**Final state:** **MERGED / CI GREEN / WEB-ONLY / NO MIGRATION** through PR #2445 / final head `3cd7e645` / squash `da77b9a5`; final PR CI #6074 passed all required checks.

This final A/B/C closeout is Web-only. The Expense Inbox summary surfaces recognition confidence
alongside the already-present date/category/subtotal/tax/total/engine and reconciliation status.
Opening Expense review is explicitly described as non-posting; the final confirmation warning states
that creating the Expense writes the formal accounting record and protects the source evidence from
permanent deletion. Provider Financial confirmation similarly states before action that evidence
moves to Provider settlements, becomes protected, and does not itself post a Journal entry.

Manual Upload Library makes evidence lifecycle visible with `未确认 · 可永久删除` /
`Unconfirmed · permanent delete available` and `已确认 · 受保护` / `Confirmed · protected` badges.
No backend materialization, deletion, review, settlement or Journal semantics change. The separately
merged Expense Journal canonicalization C0 shadow preview (PR #2444) is a future-roadmap readiness
tool and is not part of this original Slice C; this closeout does not start C1 Journal cutover.


#### Expense source-evidence readiness gate — notification email + supplemental bill

**Current state:** source-evidence readiness shipped through **PR #2649 / squash merge `b94faa98` / CI #6758 GREEN** and additive migration `20261002154500_accounting_expense_evidence_link` is applied in production. The nullable Pending Inbox regression was corrected by **PR #2663 / squash merge `a936d0e8` / CI #6803 GREEN** with no schema or authority change. Gmail message-level Inbox grouping is now **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / NO PRISMA / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE** on `feat/accounting-gmail-message-grouping`. Phase 9 remains **CLOSED**.

A 2026-10-02 production read-only inspection exposed a concrete false-positive class: the Metergy message `Metergy Solutions - Your e-bill is ready` entered `PENDING_REVIEW / EXPENSE_DOCUMENT` as an `EMAIL_BODY` even though the body only said the monthly bill was ready to view and supplied a balance/due date. Generic extraction observed `totalCents=24757`, `date=2026-10-13`, `financialConsistency=INSUFFICIENT`, `confidence=MEDIUM`. Classification as expense-related evidence is acceptable, but that classification must not imply that the source evidence is sufficient to create a formal Expense.

Accounting therefore adds a separate derived **Expense Evidence Readiness** policy. Retained PDF/image/other supported file evidence remains human-reviewable even when machine extraction is insufficient; a reconciled standalone email invoice may also remain reviewable. Notification-only or otherwise insufficient email bodies fail closed as `SUPPLEMENT_REQUIRED`. Deterministic notification signals include “bill/e-bill/invoice/statement is ready/available”, “view/download bill/invoice/statement”, login-to-view wording and corresponding Chinese bill/invoice wording. A complete reconciled body-only invoice takes precedence over notification wording so an email that actually embeds the invoice is not forced to upload a duplicate file.

For `SUPPLEMENT_REQUIRED` email evidence, the same **Pending Inbox card** owns the evidence-completion workflow. `POST /accounting/inbox/:inboxItemStableId/expense-evidence` reuses normal manual-file acquisition/parsing and then creates an Accounting-owned `AccountingExpenseEvidenceLink` from the notification Inbox item to exactly one retained source-file Inbox item. The card keeps **Confirm & review / 确认并审核** disabled while readiness is `SUPPLEMENT_REQUIRED`; the operator uploads or replaces the formal bill on that same pending card. The linked source is protected from independent reclassification, confirmation, discard and permanent deletion. Replacing deletes the link and marks the superseded manual upload `DISCARDED`, returning the notification to the missing-evidence state. The Manual Upload Library continues to show the physical source but treats an active link as protected evidence.

Entering Expense review is now a distinct server-authoritative handoff rather than a front-end-only panel toggle. `POST /accounting/inbox/:inboxItemStableId/expense/review` recomputes readiness inside a serializable write. If evidence is insufficient, the handoff fails closed. If it is ready, the effective source artifact is materialized as `AccountingExpenseDocument(status=PENDING_REVIEW)`; its source Inbox item is marked `CONFIRMED`, and for notification-plus-file cases the original email is simultaneously closed as `CONFIRMED / OTHER_DOCUMENT`. Both therefore leave the Pending Inbox immediately when the operator clicks **Confirm & review**, while the newly materialized Expense appears in the dedicated Expense review queue. This handoff does **not** post a Journal and does not make the expense final.

Final booking happens only from the Expense review queue through the existing `confirmInboxDocument()` authority exposed by `POST /accounting/expenses/:documentStableId/confirm`. The linked file—not the notification email—owns `fileHash`, source metadata, extracted text, attachment URL and machine extraction. Final confirmation writes the reviewed splits/funding facts, changes the Expense to `CONFIRMED`, and invokes the existing canonical Expense Journal post-if-ready path. If funding attribution is incomplete, the existing Expense v2 rule continues to defer Journal creation rather than inventing a funding account. The legacy direct Inbox confirmation path remains hard-gated for compatibility, but the Web flow uses the two-stage Pending -> Expense review -> final booking path. Audit actions preserve link creation/removal, `BEGIN_EXPENSE_REVIEW`, `BEGIN_EXPENSE_REVIEW_WITH_EVIDENCE` and final confirmation; the original notification source artifact is never physically deleted.

The additive persistence change introduces only `AccountingExpenseEvidenceLink`, with unique notification/source Inbox foreign keys and `RESTRICT` deletion semantics. Migration `20261002154500_accounting_expense_evidence_link` is applied in production. The 2026-10-03 Pending Inbox hotfix is query-only: default list/count visibility uses an explicit NULL-safe predicate equivalent to `materializedEntityType IS NULL OR materializedEntityType <> EXPENSE_DOCUMENT`, while the exact `materializedEntityStableId` deep-link path remains exempt from that visibility filter. Gmail acquisition continues to preserve the email body and every supported attachment as independent immutable SourceArtifacts. The Inbox read model now groups ordinary same-message Gmail evidence by the existing `gmailMessageId` metadata so body + attachment render as one work card and count as one pending work item. A unique eligible retained attachment is preferred as the Expense canonical source; when review begins, that attachment is materialized and the remaining ordinary same-message rows are closed as reviewed supporting evidence in the same serializable write. Multiple equally plausible attachments fail closed and remain separate; Provider Financial classification, selected-provider evidence, and parser-recognized provider financial messages also remain on the existing independent review path. No new relation or migration is required because same-message identity is already supplied by Gmail metadata; `AccountingExpenseEvidenceLink` remains reserved for later manual supplemental evidence. No Provider Financial parser/review behavior, Gmail acquisition ownership, Expense Journal mapping, EFA/funding semantics, context direction, package dependency, scanner allowance, public SCC or architecture baseline changes. Per repository workflow, no local lint/build/test/Prisma-generation command is claimed before user review; GitHub Actions is the validation gate after explicit remote authorization.

### Slice 6 — Optional suspense workflow

Only if separately approved.

Define:

- suspense account;
- eligibility rules;
- maximum age;
- work queue;
- resolution Journal/reclassification;
- reporting disclosure;
- period-close behavior.

Do not use suspense as a generic bypass for missing evidence.

## 12. Historical Uber July status and golden-fixture rule

The historical July Uber document remains immutable machine evidence. The operator has now
completed Human Review/correction and posted the reviewed result, so this work package must not
reprocess, rematerialize or rewrite that posted document merely to prove the newer parser.

Its retained source PDF may still be used read-only to derive a sanitized deterministic golden
fixture for regression coverage. That fixture exists to prove that a future statement with the
same layout resolves `Sales = 260336`, `Tax on Sales = 33848`, and `Net Total = 143194`; it does
not reopen the posted settlement or Journal.

For newly acquired statements, Poppler layout evidence may pair the rows correctly before
materialization, subject to the existing control-total and Human Review authority.

## 12A. Accounting Evidence Viewer & Artifact Delivery Boundary

Operators currently reach source evidence through mixed paths: retained images use an
authenticated artifact-stable-id content route, while PDFs/CSV/XLSX and several historical
screens still expose storage URLs directly. Browser behavior therefore varies by file type and
can immediately download a file when the operator only wanted to inspect the evidence.

Target UX:

```text
Accounting evidence record
    -> View source evidence
    -> authenticated Evidence Viewer
         -> PDF: browser-native inline preview
         -> image: inline image preview
         -> CSV/XLSX: safe SanQ structured preview in a later slice
         -> unsupported: metadata/message only
         -> explicit Download original/retained evidence button
         -> permanent Delete button always visible; protected evidence is disabled/grey
```

Target delivery boundary:

```text
GET /accounting/inbox/artifacts/:artifactStableId/content
    -> authenticated binary delivery
    -> Content-Disposition: inline

GET /accounting/inbox/artifacts/:artifactStableId/download
    -> same authenticated artifact resolution
    -> Content-Disposition: attachment
```

The artifact stable ID is the UI/business boundary; `storedUrl` and local filesystem paths are
storage implementation details. Image-retention semantics remain authoritative: when the
original image has already been purged by an accepted retention policy, the viewer can only
serve the retained derivative and must not imply that it is the original binary.

The Viewer must not invent a second deletion policy. Its Delete button reuses the existing
manual-upload `canPermanentDelete` capability and existing
`DELETE /accounting/inbox/manual-uploads/:inboxItemStableId/permanent` route. Only eligible
unconfirmed manual uploads are enabled. Confirmed/posted evidence, provider financial evidence,
non-manual sources and other protected evidence show the same button disabled/grey. The server
writer remains authoritative even if a client capability is stale or tampered with; no new
artifact-delete route is introduced.

Delivery slices:

1. **Evidence Viewer Slice 1 — artifact delivery + browser-native preview:** generalize the
   protected stable-ID delivery resolver beyond IMAGE, add explicit inline/download semantics,
   and route PDF/image evidence through one Web viewer. CSV/XLSX/unsupported binary evidence
   must not auto-download from the viewer; it may show an explicit download action until the
   structured preview exists. The Viewer also exposes the existing permanent-delete action:
   deletable manual uploads are enabled after confirmation, while all protected evidence keeps
   the Delete button visibly disabled. **Merged in PR #2435 as `0371a155`; CI #6039 green.**
2. **Evidence Viewer Slice 1B — logical file manager:** keep all physical binaries and
   `storedUrl` values unchanged, but add Accounting-owned logical folders and a separate
   artifact->folder assignment. The Viewer opens a file manager that supports creating
   first-level folders, filtering All/Unfiled/folder, selecting multiple retained evidence
   files and moving them to a chosen folder or back to Unfiled. Folder assignment is
   organizational metadata only: confirmed/posted/provider evidence may be moved without
   changing content hashes, source facts, Human Review, settlement or Journal authority.
   Folder creation and every actual move are audit logged. V1 intentionally does not add
   nested folders, folder rename or folder deletion. **Merged in PR #2436 as `9ae4d85d`,
   CI #6042 green; additive migration `20260921124637_add_accounting_evidence_folders`
   committed as `cc4c8016` and SQL-reviewed as matching the schema without backfill/drop.**
   **2026-09-25 retained-display follow-up:** the file-manager list now keeps
   `originalFilename` / original `byteSize` as provenance while projecting separate
   operator-visible `displayFilename` / `displayByteSize` from the accepted retained image
   binary in `PURGE_PENDING` / `COMPRESSED_ONLY`. Legacy retained image names reuse the
   existing vendor-aware display naming logic; no `storedUrl`, file bytes, retention state,
   folder assignment, source hash, Human Review, settlement or Journal authority changes.
3. **Evidence Viewer Slice 2 — structured preview:** use the existing native CSV/XLSX parsing
   stack to expose bounded, non-executing tabular preview data. Do not emulate Excel, execute
   formulas/macros/external links, or make workbook formatting part of Accounting authority.
   Source implementation uses the existing CSV tokenizer and `@keep-lts/xlsx`, routes through
   authenticated `artifactStableId` delivery, and bounds preview to 8 MiB source files,
   200 rows, 40 columns, 500 characters per cell and 20 worksheets.
4. Later contraction may remove remaining Web dependence on raw `storedUrl` only after all
   consumers use the stable-ID boundary.

This presentation/access work does not mutate source artifacts, content hashes, Human Review,
provider financial facts, settlement authority, Journal facts or posting state.

### 12.1 2026-09-24 Clover statement semantic-detail follow-up

A real June 2026 Clover monthly statement exposed two related machine-semantics defects in the
existing provider parser. The FEES table contains a right-side column heading named `Total` before
the later left-side section-total row, so selecting the first `Total` below the FEES heading can
miss the section HST. The same section also mixes a `MONTHLY EQUIPMENT BILL` with card/network
fees, so treating the whole FEES control amount as payment processing loses the business expense
classification.

The first remediation slice is intentionally parser/settlement-only and does not rewrite any
materialized historical document. Parser v7:

- distinguishes the actual left-side FEES total from the table-header `Total`;
- reads fee-detail rows and preserves stable Clover raw codes plus source extraction evidence;
- decomposes Monthly Equipment Bill base/HST from recognized card/network fees;
- keeps the statement `Fees` amount as a control-only line and requires fee detail to reconcile
  exactly before settlement can be READY;
- maps the Monthly Equipment Bill base to the existing general-operating-expense account with
  category `expense_software` (软件订阅), while its HST maps to recoverable input tax and
  card/network rows remain payment-processing expense;
- leaves unrecognized fee descriptions UNCLASSIFIED so the statement fails closed.

Settlement Journal aggregation therefore preserves the optional category dimension when multiple
provider lines hit the same account. This slice has no schema/dependency change. The already
materialized June source document remains immutable and unmodified; applying parser v7 to an
existing materialized document is a separate follow-up using the previously selected
parser-re-evaluation -> Human Review effective-snapshot path.

Implementation state: **MERGED / CI GREEN** through PR #2516 (`b8e5b844`, CI #6310). Production
verification of the existing-materialized June statement is intentionally deferred to the
effective-snapshot remediation below rather than rewriting the v6 machine document.

### 12.2 2026-09-25 Clover modern statement parser v8

July and August 2026 Clover/Fiserv statements establish a new statement generation rather than a
minor wording change. The active input now uses `YOUR CARD PROCESSING STATEMENT`, a four-digit
`PERIOD`, Account Summary and Fee Summary, a Fees/Service Charges table that may continue across
pages, and a separate `Amounts Funded` bank-reconciliation section. The already-posted June
statement remains historical evidence and is not a reason to retain the old PDF parser contract.

Parser v8 therefore:

- recognizes only the modern statement anchors and requires layout-aware Poppler geometry;
- preserves historical v7 materialized raw codes for settlement/audit but does not parse the
  pre-July PDF layout;
- extracts Account Summary, Fee Summary and Card Processing Total Fees as control evidence;
- parses fee rows across page boundaries from invoice/description/type/tax/amount geometry;
- maps the observed equipment descriptions `MONTHLY EQUIPMENT BILL` and `Clover Flex 3` to
  semantic equipment-fee raw codes, retaining source descriptions in evidence;
- recognizes `VI ...` in addition to existing card/network prefixes and leaves unsupported fee
  semantics fail-closed;
- emits Service Charges as processing-fee detail, while nonzero `IC/PF` remains unsupported and
  therefore blocks posting;
- requires exact Account Summary, Fee Summary, Fees-detail, Service-Charges-detail and
  Card-Processing fee reconciliation before settlement can be READY;
- explicitly excludes `Amounts Funded` from normalized provider lines because Clover states that
  it may contain fees reported on earlier statements and collected in the current period.

The current equipment base continues to use the existing `expense_software` category. Renaming or
reclassifying that Accounting taxonomy is a separate decision and is not bundled with recognition
correctness. This v8 source slice changes no Prisma schema/migration, dependency, Web Clover
payment behavior, Clover terminal path or cross-context architecture direction.

### 12.3 Existing-materialized parser re-evaluation -> Human Review effective snapshot

The follow-up remediation keeps the three evidence layers distinct:

1. the original `AccountingSourceArtifact` and persisted extraction evidence remain immutable;
2. the original `AccountingProviderFinancialDocument` + `AccountingProviderFinancialLine` machine
   materialization remains immutable, including its historical parser version;
3. re-evaluation with the current provider parser produces a new immutable `AccountingParseRun`
   containing current-parser metadata plus a DRAFT Human Review Revision containing the complete
   effective-line snapshot.

The review snapshot is not a mutation patch against the old machine line list. This matters for
parser changes such as Clover v6 -> v7 where one old `Fees` line can become a control line plus
multiple expense/tax detail lines. The review therefore owns `AccountingProviderFinancialReviewedLine`
children with independent line numbering and stable IDs; `sourceLineStableId` is optional because
a structural split/merge does not always have a one-to-one source-line mapping.

Creation is fail-closed: only the latest unposted provider-document revision may be re-evaluated;
the current parser must preserve provider/document identity, merchant/document references, period
and currency; a deterministic current-parser ParseRun is persisted, while the review hash/audit bind
the source-extraction ParseRun provenance; duplicate active snapshots for the same current parser
version are rejected. Confirmation additionally
requires a non-empty effective line set, matching successful ParseRun parser identity, and no
mixed legacy correction rows. Until confirmation, settlement continues to use the prior confirmed
authority. After confirmation, Shadow Preview/settlement uses the full reviewed snapshot and reruns
the existing provider reconciliation gates using reviewed effective lines plus raw metadata from the
approved current-parser ParseRun; the historical machine rows remain available for machine-vs-effective
comparison and audit.

Persistence is additive: nullable parser-snapshot provenance fields are added to
`AccountingProviderFinancialReviewRevision` plus the reviewed-line child model. Per repository
migration policy, MCP changes `schema.prisma` only in this source slice and does not touch
`apps/api/prisma/migrations/**`.

**MIGRATION REQUIRED.** Suggested migration name:
`accounting_provider_parser_reevaluation_review_snapshot`.

After this schema/source change is reviewed and merged to `dev`, generate it only from the user's
verified disposable/local development database with:

`pnpm --filter api exec prisma migrate dev --create-only --name accounting_provider_parser_reevaluation_review_snapshot`

Expected SQL is additive only: add four nullable snapshot-provenance columns to
`AccountingProviderFinancialReviewRevision` (parser name/version, effective ParseRun FK and source
evidence ParseRun FK); create
`AccountingProviderFinancialReviewedLine`; add the review -> effective ParseRun and
review -> source-evidence ParseRun foreign keys/indexes; and add the reviewed-line stable-ID,
review/line-number uniqueness, source-line lookup index and
review-revision foreign key. No rename, backfill, enum mutation, DROP, NOT NULL tightening or
historical review/correction rewrite is expected. Promotion to `main` / production remains blocked
until the user-generated migration is reviewed, committed and merged back into `dev`.

Implementation state: **LOCAL SOURCE READY FOR REVIEW** on
`accounting/provider-parser-reevaluation-review`; no migration/PR/CI/deployment/production
verification is claimed yet.

## 13. Testing requirements

Add focused tests for:

- real Uber Poppler column-order regression;
- control-total mismatch -> BLOCKED;
- corrected reviewed revision -> reconciliation PASS;
- unconfirmed review revision cannot affect Preview;
- stale review revision/hash blocks replay;
- machine extraction remains unchanged after correction;
- correction audit includes operator/reason/before/effective values;
- Fantuan supplementary evidence still works unchanged;
- unsupported semantic mapping remains fail-closed;
- posted document cannot be silently rewritten;
- existing Clover/Uber/Fantuan idempotency remains stable;
- Web contracts do not reimplement Accounting policy.

If recognition adapters are introduced, use sanitized representative fixtures and keep
provider SDK DTOs inside the adapter boundary.

## 14. Migration / dependency / rollout classification

**Slice 0:** ordinary internal correctness change, no migration/dependency.

**Slice 1:** Class B expand-contract persisted Accounting authority; **MIGRATION REQUIRED**.
Do not generate the migration through MCP. Follow the repository's user-local migration
workflow after the source/schema change is reviewed and merged to `dev`.

**Scanned-PDF raster fallback:** existing-runtime change only if implemented with the already
installed Poppler + existing Textract SDK path; no dependency or migration is expected. Any
future new OCR/runtime dependency still requires separate authorization.

**Evidence Viewer Slice 1:** ordinary Accounting-internal read-boundary/UI change; no migration
or dependency is expected.

**Evidence Viewer Slice 1B:** additive Accounting persistence change; migration
`20260921124637_add_accounting_evidence_folders` has been generated, committed and SQL-reviewed.
It creates only the logical folder + assignment tables, stable/name-key uniqueness,
one-folder-per-artifact identity, lookup indexes and foreign keys. Existing artifacts require no
backfill and remain Unfiled because absence of an assignment is the virtual root. No physical file
or `storedUrl` migration is present.

**Evidence Viewer Slice 2:** ordinary Accounting-internal read/UI capability; no schema,
migration or dependency change is expected.

**Existing-materialized parser re-evaluation / effective snapshot:** additive Accounting persistence
change; **MIGRATION REQUIRED**. The source/schema slice must not promote beyond `dev` until the
user-generated migration named `accounting_provider_parser_reevaluation_review_snapshot` has been
reviewed and merged. Expected migration shape is exactly the nullable review snapshot provenance
plus the new reviewed-line table and approved indexes/FKs described in §12.3.

No recognition or delivery change should rewrite historical machine extraction or posted
financial facts. Retain source/review evidence.

### 14.1 2026-09-29 Gmail duplicate binary retention / transport-id hardening

**State:** PR #2603 merged as `bce195de` after CI #6596 passed and was deployed. Production
verification then exposed a persisted invariant mismatch: `AccountingSourceArtifact_storage_check`
requires PDF/IMAGE/CSV artifacts to retain a non-empty `storedUrl`, so the PR #2603 strategy of
persisting a duplicate file artifact with `storedUrl = null` failed closed at the database. The
follow-up merged through PR #2605 as `bfbf8e2c`; final head `e509d4f0` passed CI #6605. Its
user-generated additive migration `20260929214605_accounting_gmail_history_cursor` is applied in
production, and production verification confirms the incremental cursor plus duplicate skip/purge
path are active.

The follow-up preserves the existing Accounting L3 ownership while changing duplicate-file
retention semantics and Gmail polling:

- Content SHA remains the duplicate identity. For MANUAL_UPLOAD or EMAIL file evidence whose bytes
  already match an existing SourceArtifact, Accounting does **not** create another PDF/IMAGE/CSV
  SourceArtifact or InboxItem. The just-stored temporary file is deleted, the canonical artifact is
  returned as the duplicate target, and `SKIP_DUPLICATE_FILE_ARTIFACT` audit metadata preserves
  transport identity, filename, sender/subject and Gmail message/part metadata.
- Existing historical Gmail `DUPLICATE` file artifacts are purged only when unmaterialized and
  free of ParseRun, evidence-folder, provider-financial, provider bank-row, derivative-retention or
  reverse duplicate references. Purge writes `PURGE_DUPLICATE_EMAIL_ARTIFACT` audit evidence,
  then removes the duplicate InboxItem/SourceArtifact and its exact redundant physical file.
  Protected rows and the canonical/original artifact remain untouched.
- Gmail attachment transport identity still prefers `messageId + MIME partId`, with content hash
  fallback when Gmail omits `partId`.
- Gmail polling becomes incremental. A nullable `AccountingAutomationConfig.gmailHistoryId`
  stores the Gmail history watermark. With no cursor, Accounting performs the existing
  `accountingStartDate` bootstrap and captures a history watermark; later runs request only
  history changes for the `SanQ-Bills` label. Any ingestion failure prevents cursor advancement.
  A Gmail-expired history cursor fails safe to bounded bootstrap. Changing the accounting start
  date resets the cursor so the new boundary is bootstrapped deliberately.

The SourceArtifact storage invariant is **not** relaxed. The only Prisma change is the additive
nullable Gmail history cursor. Production `_prisma_migrations` records
`20260929214605_accounting_gmail_history_cursor` applied at `2026-09-29T23:35:17.182925Z`; live
`AccountingAutomationConfig.gmailHistoryId` is `562515`, Accounting audit records 7
`SKIP_DUPLICATE_FILE_ARTIFACT` and 25 `PURGE_DUPLICATE_EMAIL_ARTIFACT` events, and post-follow-up
API logs contain no `AccountingSourceArtifact_storage_check` matches. No package/lockfile,
Journal/Expense authority, provider parser, trusted-sender policy, public HTTP route, context edge,
scanner allowance or Phase 9 status changes.

## 15. Decisions intentionally left open

Slice 3V-A resolves the native-text usability decision above. Slice 3V-B resolves the
initial scanned-PDF limits and keeps Provider API excluded from PDF OCR. Evidence Viewer Slice 2
also resolved the bounded CSV/XLSX preview contract and is merged. The following decisions remain
open and must not be guessed during later implementation:

1. whether the runtime should pin a specific Alpine/Poppler version for golden reproducibility;
2. whether DOCX should be accepted by Accounting Inbox;
3. whether unresolved provider components may use a suspense account.

The 3V-B six-page/resource limits are intentionally conservative first-production bounds. Raise
them only from real document evidence and a new bounded-resource review rather than silently
changing the policy.

PaddleOCR/BDA and S3/async Textract are not part of the currently approved normal recognition
path. Reintroducing any of them requires a new explicit decision based on a demonstrated gap.

## 16. 2026-10-06 audit — Post-Posting Financial Correction Framework

### 16.1 Decision

The 2026-10-06 read-only audit establishes a new post-posting Accounting requirement:

> **Do not create one-off correction services for individual incidents, providers or documents.**
> Build a provider-neutral / document-neutral **Posted Financial Correction** lifecycle inside
> Accounting, while keeping the calculation of the corrected business fact inside the owning
> Accounting domain policy.

This work is **not** a Fantuan September hotfix. The observed Fantuan September 2026 incident is
the first production case that demonstrates the need: a statement had already become a posted
canonical Journal before a later parser/control-total improvement exposed missing Marketing Fee
and GST/HST components. The original source evidence and original Journal must remain immutable.
The durable solution must also work for future posted Provider Statements, Expenses and other
Accounting-owned facts that are later proven wrong.

Phase 9 remains **CLOSED**. This is post-modularization Accounting product/reliability work.

### 16.2 Existing architecture that should be reused

The repository already contains the core safety patterns required for a general framework:

- Provider settlement execution already uses deterministic Preview -> planHash -> Execute and
  rejects stale plans.
- AccountingJournalService owns Journal writes and enforces accounting start-date / period-lock
  policy.
- AccountingPeriodService allows ADJUSTMENT entries in a closed month but still blocks all
  historical writes after the containing fiscal year is hard-locked.
- Opening Receivable, External Sale and Payroll already model exact reversal as a new immutable
  Journal rather than mutating the original posting.
- Clover fee reclassification already models a posted-Journal correction as an idempotent
  ADJUSTMENT Journal tied to the original provider fact.
- AccountingAuditLog and existing stable fact identities provide the audit primitives required
  for a correction lifecycle.
- Provider Statement Human Review already preserves source evidence, machine extraction and
  confirmed review revisions separately; confirmed posting authority can therefore be rebuilt
  from reviewed business facts without rewriting source evidence.

The gap is architectural consolidation: these mechanisms are currently owner-specific and do not
provide one common lifecycle for correcting an already-posted financial fact.

### 16.3 Required authority chain

The target post-posting authority chain is:

~~~text
immutable source / original business fact
        ->
original posted Journal set
        ->
Correction Case DRAFT
        ->
operator-reviewed corrected target business fact
        ->
owner-specific deterministic reconciliation / replan
        ->
Corrected Target Journal Set
        ->
Current Effective Posted Journal Set
        ->
Target - Current Effective = Correction Delta
        ->
Correction Preview + planHash
        ->
atomic confirmation / ADJUSTMENT Journal write
        ->
new Current Effective Posted State
~~~

A Correction must never overwrite the original source artifact, source/provider document,
confirmed historical Journal or prior correction Journal.

### 16.4 Common Correction authority

The persisted authority should be Accounting-owned but should not collapse lifecycle state,
operator-edited business targets and produced Journals into one opaque row. The approved
implementation plan therefore uses three additive authorities in **Correction-A2** (exact Prisma
names remain an implementation detail):

1. **AccountingCorrectionCase** — lifecycle, stable target identity, reason, optimistic version,
   base/target authority hashes, READY revision pointer, frozen Preview authority and planHash;
2. **AccountingCorrectionRevision** — append-only, versioned corrected-business-target snapshot.
   The payload may use JSON only behind a named/versioned owner schema such as
   `accounting.provider-settlement-correction-target.v1`; arbitrary untyped debit/credit JSON is
   forbidden;
3. **AccountingCorrectionJournalOutput** — stable relation from one POSTED Correction Case to every
   immutable Journal it actually produced.

The Case should carry at least:

~~~text
correctionStableId
version
targetKind
targetStableId
targetVersion
status
reasonCode
note
strategy

baseAuthoritySchema
baseAuthorityHash
baseJournalSetHash   # current-effective Journal Set at READY
readyRevisionId
targetAuthoritySchema
targetAuthorityHash
readyPreviewSchema
readyPreviewJson
planHash

createdBy / createdAt
readyBy / readyAt
postedBy / postedAt
cancelledBy / cancelledAt
~~~

Each immutable Revision should preserve the owner schema/version, corrected target snapshot and
target hash. The READY preview must preserve the original Journal anchors, every prior POSTED
Correction Journal anchor, Current Effective / Target / Delta hashes, owner prerequisites and the
strategy that was reviewed. Hashes are integrity identities; they do not replace the persisted
evidence required to explain a historical correction later.

Recommended lifecycle:

~~~text
DRAFT -> READY -> POSTED
  ^        |
  |        +-> DRAFT   # editing after Preview invalidates the old planHash
  |
  +------------- operator edits

DRAFT / READY -> CANCELLED
~~~

`POSTED` and `CANCELLED` are terminal. A READY case may return to DRAFT only by creating a new
immutable target revision and clearing the stale Preview/planHash.

The first supported targetKind values remain intentionally narrow:

~~~text
PROVIDER_SETTLEMENT
EXPENSE
~~~

Opening Receivable, External Sale and Payroll already have mature reversal authorities and should
not be rewritten in the foundation slice. They may later adopt the common Correction Case shell
without changing their owner-specific posting policies.

**A0 + A1 do not change Prisma and require no migration.** Correction-A2 is the first persistence
slice and will require an **additive Prisma schema change and user-generated migration** under the
repository migration workflow. No new runtime/package dependency is required.

### 16.5 The common layer must not become a manual-Journal editor

The Correction framework must not persist arbitrary operator-selected debit/credit lines such as:

~~~text
debitAccount + debitAmount
creditAccount + creditAmount
~~~

That would bypass canonical Accounting authority.

Instead:

~~~text
Correction Case
      ->
owner adapter
      ->
Corrected Business Fact
      ->
owner reconciliation / posting policy
      ->
Corrected Target Journal Set
~~~

The operator edits the **business fact that should have been posted**, not raw Journal lines.
Account/category mapping, tax semantics, provider-pending treatment and Journal construction
remain server-owned Accounting policy.

### 16.6 Current Effective Posting and repeated corrections

A future correction must compare against the **current effective posted state**, not only the
original Journal.

For one target fact:

~~~text
Current Effective Posting
  = Original Journal Set
  + every prior POSTED Correction Journal Set
~~~

Then:

~~~text
New Correction Delta
  = Corrected Target Journal Set
  - Current Effective Posting
~~~

This is required so a fact can be corrected safely more than once without reapplying previous
deltas.

The comparison unit must be a **Journal Set**, not one originalJournalEntryStableId, because an
Accounting fact may legitimately produce multiple Journals (for example, Expense funding
attribution). The engine should normalize Journal lines to an Accounting posting vector such as:

~~~text
accountStableId
categoryStableId
debitCents
creditCents
~~~

and aggregate comparable lines deterministically before calculating the delta. **Correction-A1
freezes this as `accounting posting vector v1`: the comparison dimension is exactly
`accountStableId + categoryStableId`, while currency is a Journal-Set invariant.** This is
intentional: a classification-only correction from Category A to Category B on the same account
must produce a real credit/debit reclassification delta rather than collapse to NOOP.

The A1 policy normalizes each persisted Journal anchor, sorts Journal/line identity
deterministically, verifies each Journal and resulting vector is balanced, and computes:

~~~text
Current Effective Vector
  = vector(Original Journal Set + all prior POSTED Correction Journals)

Delta Vector
  = Target Vector - Current Effective Vector
~~~

Every persisted source/correction anchor freezes `entryStableId + idempotencyKey +
idempotencyHash + version`. Preview authority separately freezes the immutable Original Journal-Set
hash, prior-Correction Journal-Set hash and the resulting current-effective `baseJournalSetHash`,
while each Journal-Set hash also covers normalized source identity,
date/currency/memo and financial lines. Target Journals are owner-produced deterministic drafts;
their normalized payload hashes are frozen separately. `baseAuthorityHash` means the **current
effective business authority**, not the immutable original source hash; base and target must be
normalized under the same versioned correction-target schema before their hashes are comparable.
The Preview authority binds those schemas/hashes, strategy/reason and target identity into one
deterministic `planHash`. If the Target posting changes while the target authority hash does not,
A1 fails closed because the owner adapter has supplied inconsistent authority evidence.

Store/provider/business prerequisites remain owner authority rather than posting-vector
dimensions. A later execute path must re-read those prerequisites and all frozen Journal anchors
before accepting the reviewed planHash.

### 16.7 Correction strategies

The owner policy should choose one of three typed strategies:

| Strategy | Intended use |
| --- | --- |
| DELTA | normal amount, tax, fee or classification correction |
| REVERSAL_REPOST | the corrected fact changes structure/date/authority such that a direct delta is unsafe |
| REVERSAL_ONLY | the originally posted business fact should not exist |

DELTA should be preferred for ordinary posted-document corrections because it produces only the
incremental accounting change. Exact reversal remains appropriate where the owner policy proves
that replacement rather than delta is required.

All correction Journals use AccountingJournalEntryKind.ADJUSTMENT and remain subject to the
existing Accounting period policy. A month-close does not by itself prohibit an Adjustment; a
fiscal-year hard lock remains a hard block. Cross-hard-locked-year prior-period adjustments are a
separate accounting-policy decision and must not be silently added to this framework.

### 16.8 Provider Settlement adapter — first production consumer

Provider Settlement should be the first adapter because the current pipeline already provides:

~~~text
ProviderFinancialDocument
  -> confirmed Human Review effective lines
  -> provider control-total reconciliation
  -> buildProviderSettlementDocumentPlan()
  -> canonical Journal
~~~

For a posted statement, the UI action should be **Correct posted record**, not Return to Inbox or
Replay original Journal.

The correction editor should show the current business values to be corrected and allow only the
same Accounting-owned reviewed fields already allowed before posting. It may expose the original
evidence for reference, but machine-recognition workflow remains an Inbox concern.

Before a Provider correction can become READY:

1. the corrected effective Provider Statement must pass all provider-specific vertical control
   totals;
2. the owner settlement policy must be able to build the complete Corrected Target Journal Set;
3. the resulting target and correction delta must each be debit/credit balanced;
4. the original/current Journal set, corrected target authority and prior correction chain must
   still match the Preview planHash.

For Uber, Fantuan and Clover, provider-specific source control semantics remain owner policy; the
common Correction engine must not duplicate those formulas.

### 16.9 Expense adapter — second production consumer

A confirmed AccountingExpenseDocument must remain immutable through the existing normal edit
path; the current service correctly rejects attempts to edit an already-confirmed Expense.

A posted Expense correction therefore creates a separate corrected target rather than reopening or
updating the original Expense row in place.

The Expense adapter should re-use canonical Expense policy:

- corrected total / split / tax/category values are business inputs;
- vertical reconciliation remains sum(split subtotal) + sum(split tax) = document total;
- funding attribution is **not** a hard requirement for the expense fact to be corrected or
  confirmed, because an expense may still be unpaid or its payment account may still be unknown;
- when funding exists, the corrected target must include the applicable funding Journal Set;
- classification-only corrections should naturally produce reclassification deltas rather than
  requiring manual account selection.

### 16.10 Posted read model and correction history

Posted UI must continue to display persisted database accounting facts, not recognition output.

For a corrected posted fact, the effective display becomes:

~~~text
Original persisted Journal Set
+ persisted POSTED Correction Journal Sets
= Current Effective Posted State
~~~

The UI should expose a correction history under the posted record:

~~~text
Original posting
Correction #1
Correction #2
...
Current effective state
~~~

Each correction detail should show at least:

- correction reason/note;
- operator and timestamps;
- original/current Journal Set anchors;
- corrected target;
- calculated delta;
- correction Journal stable IDs;
- preview/authority hash.

The UI must never rewrite the original card so that it appears the initial posting was always
correct.

### 16.11 Atomicity requirement for already-posted Provider facts

Pre-posting Human Review and post-posting Correction are different lifecycles.

For an already-posted Provider Statement, a new effective reviewed target must **not** become
globally authoritative before its matching correction Journal is persisted. Otherwise Accounting
could temporarily expose:

~~~text
Effective Provider Document = corrected value
Journal                     = old value
~~~

Therefore posted correction confirmation must atomically:

1. validate/freeze the corrected target;
2. revalidate the current effective Journal/correction chain;
3. persist the correction Journal(s);
4. mark the Correction Case POSTED;
5. activate the corrected business authority used by posted read models.

The operation belongs inside the existing Serializable Accounting write boundary. A stale preview,
new prior correction, changed review authority or changed Journal set must return a conflict and
require a new Preview.

### 16.12 Audit and reason semantics

Post-posting corrections require their own reason semantics; they must not be conflated with
pre-posting Inbox/Human Review correction reasons.

Recommended initial reason codes:

~~~text
EXTRACTION_ERROR
AMOUNT_ERROR
CLASSIFICATION_ERROR
MISSING_COMPONENT
DUPLICATE_POSTING
BUSINESS_FACT_ERROR
OTHER
~~~

Conceptually:

- Inbox / Human Review correction answers: **what should be posted before posting?**
- Posted Financial Correction answers: **how do we correct a fact that already became Ledger
  authority?**

Every execute path must write an Accounting audit record and preserve immutable before/target/delta
evidence.

### 16.13 Approved implementation slices

The 2026-10-06 implementation audit refined the original large Correction-A into smaller,
independently reviewable slices. This avoids combining a canonical-Journal invariant fix, pure
financial arithmetic, persisted lifecycle state and runtime mutation in one change.

#### Correction-A0 — Canonical posted-Journal immutability hardening

Status: **MERGED / CI GREEN / PR #2715 / MERGE `2e172b33` / CI #6973 GREEN / NO MIGRATION / NO RUNTIME CUTOVER**

Scope:

- generic Journal creation may not manufacture Provider Settlement canonical authority;
- generic Journal update/delete may not mutate an existing
  `accounting.provider_financial_document.v1` Journal;
- the same protection applies to
  `accounting.uber_pre_cutover_order_reversal.v1`;
- reserve `accounting.posted_financial_correction.v1` for the later typed Correction writer and
  block generic create/update/delete from using or mutating that authority;
- add characterization coverage for all three guards.

This closes an audited invariant gap: Expense and several other canonical Accounting facts already
had generic update/delete guards, while Provider Settlement did not. A0 changes only the generic
Journal boundary; the existing typed Provider Settlement replacement-group writer is intentionally
unchanged.

#### Correction-A1 — Common correction contracts and pure policy

Status: **MERGED / CI GREEN / PR #2715 / MERGE `2e172b33` / CI #6973 GREEN / NO MIGRATION / NO DEPENDENCY / NO RUNTIME CUTOVER**

Scope:

- freeze first target kinds `PROVIDER_SETTLEMENT | EXPENSE`;
- freeze correction strategies `DELTA | REVERSAL_REPOST | REVERSAL_ONLY`;
- freeze post-posting reason codes separately from Inbox/Human Review reasons;
- normalize immutable persisted Journal Sets;
- normalize owner-produced Target Journal Sets;
- calculate the versioned `accountStableId + categoryStableId` posting vector;
- compute Current Effective = Original + prior POSTED Correction Journals;
- compute deterministic Target - Current Effective delta;
- freeze strategy output: DELTA uses the net delta; REVERSAL_ONLY exposes the exact inverse of
  Current Effective; REVERSAL_REPOST exposes both that inverse and the complete Target posting;
- produce `READY | NOOP` Preview classification, where NOOP requires both unchanged business
  authority and zero financial delta so a structural/authority-only correction cannot disappear;
- require base/current-effective and target business authority to use the same versioned owner
  correction-target schema, and fail closed if financial posting changes without an authority-hash
  change;
- freeze Journal anchors/hashes plus owner target authority schemas/hashes into one deterministic
  `planHash`;
- remain pure Accounting policy: no Prisma, Nest transport, Provider formulas, UI or external
  integration imports.

Focused source tests cover deterministic Journal ordering, category-only reclassification,
repeated corrections, true NOOP, authority-only correction, exact `REVERSAL_ONLY`,
same-vector `REVERSAL_REPOST`, balance/currency failure and stale-anchor planHash changes.
Architecture coverage keeps the common layer provider-neutral and persistence-neutral.

#### Correction-A2 — Additive persisted correction authority

Status: **LOCAL IMPLEMENTED / USER REVIEW PENDING / MIGRATION REQUIRED / MIGRATION NOT GENERATED / NO RUNTIME CUTOVER**

Implemented persistence scope:

- five bounded Prisma enums for target kind, lifecycle status, correction reason, posting strategy
  and output-Journal role;
- additive `AccountingCorrectionCase` with stable target identity, optimistic `version`,
  lifecycle/reason, nullable READY authority fields, frozen Preview JSON/planHash and operator
  timestamps;
- append-only `AccountingCorrectionRevision` with per-Case revision number, versioned owner
  target-authority schema/hash and corrected `targetJson`;
- additive `AccountingCorrectionJournalOutput` with typed role/sequence and a unique restrictive
  FK to the immutable `AccountingJournalEntry` it represents;
- nullable one-to-one Case -> READY Revision pointer; the runtime A3 transaction must additionally
  prove that the selected READY Revision belongs to the same Case before transition;
- polymorphic `targetKind + targetStableId + targetVersion` remains the owner boundary. The common
  schema deliberately does **not** add ProviderDocument/ExpenseDocument/store/provider-specific
  foreign keys.

A2 adds no controller/service/runtime writer and cannot execute a correction by itself. Case
lifecycle transitions, append-only revision writes, READY invariants, stale-plan revalidation and
Journal output creation remain A3 work.

**MIGRATION REQUIRED.** The schema change is intended to be additive-only: create five enum types,
three new tables, their indexes/unique constraints and restrictive FKs. No existing Accounting row
requires backfill or rewrite, and no DROP/rename/type tightening is intended. MCP does not generate
or edit `apps/api/prisma/migrations/**`.

#### Correction-A3 — Lifecycle, typed Journal writer and atomic execution

Status: **NOT STARTED**

Scope:

- DRAFT / READY / POSTED / CANCELLED lifecycle and READY -> DRAFT invalidation on edits;
- owner-adapter contract that supplies corrected business authority and deterministic Target
  Journal Set;
- typed `createPostedCorrectionJournalEntryInTx(..., tx)` authority;
- correction idempotency and output-Journal links;
- Serializable Preview revalidation / execute;
- existing Accounting period-lock policy;
- atomic Case POSTED transition + Journal output + audit + activation of current-effective owner
  authority;
- same correctionStableId/planHash replay returns the persisted POSTED result instead of producing
  another delta;
- a DELTA correction whose business authority changes but whose financial delta is zero may POST
  with zero Journal outputs, provided the corrected authority activation and audit remain atomic.

A3 must not add Provider/Fantuan-specific policy to the common layer.

#### Correction-B1 — Provider Settlement backend adapter

Status: **NOT STARTED**

Scope:

- Uber/Fantuan/Clover posted Statement correction target;
- reuse existing Provider Human Review/effective-line semantics without reopening posted Human
  Review;
- reuse provider control-total reconciliation;
- rebuild the Target Journal Set through existing settlement policy;
- freeze existing Uber pre-cutover reversal Journals as prerequisites rather than recomputing
  statement coverage in normal v1 line corrections;
- prohibit period/store/provider/business-identity changes in normal DELTA correction; a later
  structural correction may require owner-approved `REVERSAL_REPOST`.

#### Correction-B2 — Provider posted-record UI + production fixture

Status: **NOT STARTED**

Scope:

- **Correct posted record** action;
- business-field correction editor, Preview/delta and explicit confirmation;
- original posting + correction history + current effective state;
- sanitized Fantuan September 2026 regression fixture and controlled production verification.

The observed Fantuan September incident is a verification case only. No branch, enum or service may
special-case that provider/month/document.

#### Correction-C1 — Expense backend adapter

Status: **NOT STARTED**

Scope:

- corrected Expense target authority;
- amount/tax/category/split correction;
- reuse canonical Expense posting policy;
- business correction may be drafted without complete funding, but financial correction may become
  READY/POSTED only when the adapter can construct a complete Target Journal Set;
- unchanged funding may be inherited from current effective authority;
- classification-only changes produce normal vector reclassification deltas.

#### Correction-C2 — Expense posted-record UI/history

Status: **NOT STARTED**

Scope:

- correction action on persisted Expense records;
- original/current values, Preview/delta and correction history;
- no reopening or rewriting of the original confirmed Expense row.

#### Correction-D — Current-effective read-model unification

Status: **NOT STARTED**

Scope:

- common Original -> Corrections -> Current Effective projection;
- consistent correction history across supported fact types;
- Provider Platform Analytics consumes corrected current-effective Provider authority;
- Expense records expose original facts separately from current effective corrected values;
- Trial Balance / Balance Movement continue consuming immutable Journal lines naturally.

#### Correction-E — Existing specialized correction convergence audit

Status: **NOT STARTED**

Only after A-D are proven should the project evaluate whether existing Clover fee
reclassification, Opening Receivable reversal, External Sale reversal and Payroll reversal should
adopt the common Correction Case lifecycle shell. Their mature owner-specific write authority
should not be rewritten merely for naming consistency.

### 16.14 Explicit non-goals

This framework must not:

- mutate/delete original posted Journals;
- overwrite source evidence or machine extraction;
- permit arbitrary manual Journal line construction through correction UI;
- allow an operator to bypass provider control-total reconciliation;
- reopen a fiscal-year hard lock;
- make Provider-specific formulas part of the common Correction engine;
- make Inbox recognition responsible for post-posting correction;
- reopen Phase 9.

### 16.15 Readiness conclusion

Current status after A0/A1 remote delivery and the A2 local persistence implementation:

**A0 + A1 MERGED / CI #6973 GREEN / A2 SOURCE COMPLETE LOCALLY / MIGRATION REQUIRED + NOT GENERATED / A3 NOT STARTED**

PR #2715 merged A0/A1 to `dev` as `2e172b33` after the exact-head CI #6973 passed API tests,
API lint/build/strict checks, architecture baseline, Web checks and browser E2E. The common
arithmetic/authority vocabulary and generic Journal immutability guards are therefore now on the
shared development baseline.

A2 adds only the persisted shell required by the later runtime lifecycle. It still does **not**
create a Correction API, write a correction Journal, activate corrected Provider/Expense authority
or change any posted read model. No production correction is executable until A3 plus an owner
adapter are implemented.

Per repository workflow, the A2 workspace stops before remote delivery and before migration
generation. The matching migration must be generated by the user after the schema/source change is
reviewed and merged to `dev`.

### 16.16 A0 + A1 delivery record

- implementation branch head before squash: `6df0169b7720a387cf295ac68f1f36008f93030e`;
- PR: **#2715**;
- `dev` merge SHA: `2e172b33a13fe7d3bb980be77b7a1278ecd243d6`;
- final PR CI: **#6973 GREEN**;
- no Prisma/schema/migration or dependency change;
- no HTTP/controller/runtime route, Provider wire change or architecture graph change.

### 16.17 A2 implementation record

Implementation baseline:

- `origin/dev@2e172b33a13fe7d3bb980be77b7a1278ecd243d6`;
- local branch `feat/accounting-correction-a2`;
- owner: Accounting / Reporting / Analytics;
- change class: additive persisted Accounting authority only;
- no dependency/lockfile change;
- no controller/service/API/UI/runtime cutover;
- no Provider/Expense-specific persistence relation;
- no new context direction, direct-import allowance or public SCC.

A2 persists:

~~~text
AccountingCorrectionCase
  1 -> N AccountingCorrectionRevision
  0 -> 1 readyRevision
  1 -> N AccountingCorrectionJournalOutput -> AccountingJournalEntry
~~~

The five Prisma enums are intentionally closed to the A1 vocabulary:

~~~text
AccountingCorrectionTargetKind
AccountingCorrectionStatus
AccountingCorrectionReasonCode
AccountingCorrectionStrategy
AccountingCorrectionJournalOutputRole
~~~

`AccountingCorrectionRevision` and `AccountingCorrectionJournalOutput` intentionally omit
`updatedAt` / `deletedAt`; they are append-only evidence. Case -> Revision, Case -> JournalOutput
and JournalOutput -> Journal relations use restrictive deletion. A3 remains responsible for
transactional invariants that Prisma alone cannot express, especially proving that the selected
`readyRevisionId` belongs to the same Case and revalidating frozen READY authority before POSTED.

**MIGRATION REQUIRED**

Suggested migration name:

~~~text
add_accounting_posted_correction_authority
~~~

Required user-local generation command, only against the verified disposable/local development
database after pulling the schema change from `dev`:

~~~bash
pnpm --filter api exec prisma migrate dev --create-only --name add_accounting_posted_correction_authority
~~~

The generated SQL must be reviewed as additive-only. Expected changes are five enum types, three
new tables, indexes/unique constraints and restrictive foreign keys. It must contain **no backfill,
DROP, rename, existing-column type change, existing-row rewrite or destructive contraction**.
Promotion to `main` / production remains blocked until that user-generated migration is reviewed,
committed and merged back into `dev`.

The next source slice after A2 is **Correction-A3 — lifecycle, typed Journal writer and Serializable
atomic execution**. A3 must not begin inside the A2 review batch.
