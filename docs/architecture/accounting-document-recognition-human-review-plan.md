# Accounting Document Recognition & Human Review Plan

Status: **SLICE 0-3 MERGED / CI GREEN / POPPLER PDF PATH AUDITED / EVIDENCE VIEWER SLICE 1 SOURCE IMPLEMENTED / LOCAL REVIEW**  
Planning date: 2026-09-20; updated: 2026-09-21  
Audit baseline: `origin/dev@1ede0599`; Slice 3 merged in PR #2432 as `caabf1c1`; current follow-up baseline: `origin/dev@971a3172`  
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
   nested folders, folder rename or folder deletion.
3. **Evidence Viewer Slice 2 — structured preview:** use the existing native CSV/XLSX parsing
   stack to expose bounded, non-executing tabular preview data. Do not emulate Excel, execute
   formulas/macros/external links, or make workbook formatting part of Accounting authority.
4. Later contraction may remove remaining Web dependence on raw `storedUrl` only after all
   consumers use the stable-ID boundary.

This presentation/access work does not mutate source artifacts, content hashes, Human Review,
provider financial facts, settlement authority, Journal facts or posting state.

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

**Evidence Viewer Slice 1B:** additive Accounting persistence change; **MIGRATION REQUIRED**.
The migration should create logical folder + assignment tables, unique stable/name-key and
one-folder-per-artifact constraints, the folder lookup index and foreign keys. Existing artifacts
require no backfill and remain Unfiled because absence of an assignment is the virtual root.
No physical file or `storedUrl` migration is permitted.

No recognition or delivery change should rewrite historical machine extraction or posted
financial facts. Retain source/review evidence.

## 15. Decisions intentionally left open

The following remain open and must not be guessed during implementation:

1. the exact conservative rule for deciding whether a PDF's native text layer is usable;
2. the scanned-PDF maximum page count and aggregate OCR resource limits;
3. whether Provider API ingestion should participate in scanned-PDF raster/Textract fallback;
4. whether the runtime should pin a specific Alpine/Poppler version for golden reproducibility;
5. whether DOCX should be accepted by Accounting Inbox;
6. whether unresolved provider components may use a suspense account;
7. the exact bounded CSV/XLSX preview response contract for Evidence Viewer Slice 2.

PaddleOCR/BDA and S3/async Textract are not part of the currently approved normal recognition
path. Reintroducing any of them requires a new explicit decision based on a demonstrated gap.
