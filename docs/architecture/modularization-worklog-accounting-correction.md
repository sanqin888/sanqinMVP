# Accounting Correction worklog supplement

The repository's primary `docs/architecture/modularization-worklog.md` exceeds the current
workspace patch-size limit. This supplement records the same required chronological delivery evidence
for the Posted Financial Correction work package until the main-worklog append limitation is removed.
The authoritative work-package design/status remains
`docs/architecture/accounting-document-recognition-human-review-plan.md` §16.

## 2026-10-09 — Accounting Provider Structural Correction SC-A / SC-B1 / SC-B2

**Delivery:** SC-A PR #2763 / dev merge `1fc8003c` / CI #7093 green;
SC-B1 PR #2764 / dev merge `49fe8ef5` / CI #7097 green.
SC-B2 PR #2765 / final PR head `fac30666` / dev merge `0503e15f` /
CI #7100 green; baseline `origin/dev@49fe8ef5`; **MERGED**.

**Boundary/behavior:** SC-A added a pure Provider-owned v2 structural target
with separate effective/source identities and explicit provenance. SC-B1
permits read-only audited reconstruction of the original posted Fantuan
10-line Journal under the narrowly allowed historical controls mismatch;
original source and Human Review stay immutable, and v1 control-total
edits remain forbidden. SC-B2 adds a limited v2 Provider owner Adapter:
server-generated stable identities, exactly two missing Marketing Fee/tax
lines whose amounts reconcile to original Statement controls, frozen 10
source lines, Provider policy READY, common A3 DELTA and typed v1/v2
activation hash checks. No Common A3 modification, schema/migration,
dependency, context edge, direct-import allowance, scanner ceiling or
SCC changes. Current architecture graph/baseline stays unchanged.

**Remaining gates:** SC-C v1/v2 latest-effective/facade/Analytics
reader expansion is in local review (entry below); SC-D Web structural
editor and controlled production verification remain pending.
SC-B2 CI passed and its PR merged, but no production deployment or
production correction is claimed.

**Details:** `docs/architecture/accounting-document-recognition-human-review-plan.md`
§16.13A/B1/B2 and `docs/architecture/current-dependency-graph.md`.

## 2026-10-09 — Accounting Provider Structural Correction SC-C v1/v2 current-effective readers

**PR/SHA:** PR #2766 / final head `f5ef0480` / dev merge
`c7ebdd69` / CI #7104 all green. Baseline `origin/dev@0503e15f`.

**State:** **MERGED / NO PRISMA / NO MIGRATION / NO DEPENDENCY /
NO GRAPH OR BASELINE CHANGE**.

**Owner/boundary:** The Accounting Provider-owned current-effective
decoder now validates both v1/v2 immutable correction authority
schemas and hashes; Adapter/latest POSTED, Provider Correction
facade/history and Platform Analytics use that authority without
misrepresenting correction-added lines as original source. The Web
fixed-line panel is fail-closed/read-only for structural cases
until SC-D supplies the deliberate v2 workflow. No Common A3 or
Journal writer change is made. The persisted compatibility
`accounting.provider-correction-structural-v2.v1` is registered
with a read parity/rollback/deletion gate; this introduces no
new inter-context dependency or direct-import allowance.

**Remaining:** SC-D operator UI is implemented locally but has not
passed remote CI or acceptance; v2 POST remains gated at Adapter
activation until controlled production acceptance;
no production source, Journal, Human Review or data write
was performed during SC-C; CI #7104 was green.

**Owner plan:** `docs/architecture/accounting-document-recognition-human-review-plan.md`
§16.13C; `docs/architecture/current-dependency-graph.md`;
`docs/architecture/active-compatibility-register.json` and Markdown view.

## 2026-10-09 — Accounting Provider Structural Correction SC-D safe UI

**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / NO REMOTE PR**.
Branch `feat/accounting-provider-structural-sc-d` from
`origin/dev@c7ebdd69`; SC-C merged via PR #2766 / dev
`c7ebdd69` / CI #7104 all green.

**Behavior:** The Accounting Provider owner supplies an exact
two-line audited Fantuan correction `structuralProposal`, rather
than letting Web implement or override fee/tax/control-total
formulas. The existing Provider posted-record panel now renders
read-only source identity and approved v2-added fees, separate
operator acknowledgement before DRAFT, common Preview with
compensating DELTA, second acknowledgement plus manually typed
full planHash before READY, and existing cancellation. Ordinary
v1 UI remains available and historical source-line edits stay
blocked. Backend v2 POST and client POST remain **fail-closed**;
operator consent for a controlled production procedure is a
separate gate after CI and merge. No existing financial fact,
Prisma, migration, dependency, Common A3, context edge or
architecture scanner baseline is changed.

**Validation:** Not run locally under AGENTS.md; remote PR is
not authorized yet. Details in
`docs/architecture/accounting-document-recognition-human-review-plan.md`
§16.13D.

## 2026-10-09 — Provider Structural Correction SC-E1 generic schema transition

**State:** LOCAL IMPLEMENTED / REVIEW PENDING / NO REMOTE PR. Baseline:
latest origin/dev after SC-D PR #2767 / CI #7110 all green /
dev merge `e69365b7`. SC-D is MERGED (its earlier local-pending entry
above is superseded by this delivery record).

**Scope:** Extend Common A3's Preview authority with an optional, owner-attested
v1 schema-transition bridge (from schema/hash, to schema, equivalent-base hash).
Same-schema corrections remain unchanged; mismatched schemas without owner
evidence remain rejected. Provider owner derives the v1 → v2 equivalent base
from immutable source authority and retains its strict historical Fantuan
two-ADD policy. The bridge is included in the immutable planHash.

**Gates:** v2 POST remains blocked; no Prisma, migration, dependency, or
production write. GitHub Actions validation and controlled verification remain
pending separately. Other owners need their own validated equivalence proof
before electing into the generic transition contract.

## 2026-10-09 — SC-E2A cross-schema lifecycle regression

**State:** LOCAL REVIEW / NO REMOTE PR. Adds service-level Preview → READY,
frozen cross-schema planHash, stale bridge rejection before READY or activation,
and further policy negative cases. No schema/migration, dependency, Journal
writer, production data or POST gate changes. CI and controlled verification
remain pending, per §16.13F of the Accounting correction plan.

## 2026-10-09 — SC-E2C Provider correction Analytics attribution

**State:** LOCAL IMPLEMENTED / USER REVIEW PENDING / NO PR. Accounting
Sales includes only verified POSTED Provider Settlement correction Journal
outputs via their Case → Journal anchor; attribution retains existing
Provider Statement bucket and owner/store verification. Sales orders and
Provider coverage rules remain unchanged. Provider v2 POST stays blocked.
No migration, new dependency, or Journal writer change. Tests await CI.

## 2026-10-07 — Accounting Posted Financial Correction E1 Clover ordered compatibility bridge

**PR / SHA:** local branch `feat/accounting-correction-e1-clover-bridge`; baseline
`origin/dev@99d7c9c7`; remote delivery not authorized yet.

**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / NO PRISMA / NO MIGRATION / NO PUBLIC ROUTE /
NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**. Correction-D is already merged through PR #2722 /
`99d7c9c7` with CI #7003 green; B2 controlled production correction verification remains
independently pending.

**E audit decision:** Opening Receivable reversal, External Sale reversal and Payroll reversal stay
with their mature owner-specific immutable reversal/replacement/correction lifecycles. Moving them
into the common Correction Case shell would require new common target kinds and persisted
contract/migration work without improving their domain invariants. E1 is therefore limited to the
one real coexistence seam: historical Clover fee Pending reclassification versus later common
Provider correction.

**Compatibility behavior:** `accounting.clover-fee-reclassification-bridge.v1` replaces the former
permanent bidirectional exclusion with ordered, read-only compatibility. A Clover Statement may
enter a later common Provider correction after one historical specialized reclassification only when
the bridge validates the exact specialized source identity/idempotency/Store/date/currency/two-line
Pending -> Fee Payable shape, verifies the deterministic generic-Journal payload hash, and proves
posting-vector equality between `original Provider Journal + specialized adjustment` and the current
Provider-policy rebuild. Multiple, malformed, tampered or non-reconciling specialized Journals fail
closed; a legacy Provider Journal without the required bridge retains the previous rebuild failure.
The specialized writer still blocks after any POSTED common Provider correction through
`POSTED_COMMON_CORRECTION_EXISTS`, so the write order cannot reverse. No specialized Journal is
rewritten, backfilled or converted into a synthetic Correction Case.

**Implementation / regression:** the bridge invariant is isolated in
`accounting-clover-fee-reclassification-bridge.policy.ts` rather than expanding the oversized
Provider correction adapter. Adapter integration regression uses the established Clover June policy
shape and proves a later common DELTA can start from the validated legacy baseline; tampered-hash and
missing-bridge paths remain fail-closed. The B2 architecture guard pins ordered coexistence and
continued reverse-direction blocking. Per `AGENTS.md`, local lint/build/test/CI are not run before
user review; GitHub Actions remains the authoritative validation gate after remote authorization.

**Details:** `apps/api/src/accounting/accounting-clover-fee-reclassification-bridge.policy.ts`,
Provider correction adapter/spec/B2 architecture guard,
`docs/architecture/accounting-document-recognition-human-review-plan.md` §16,
`docs/architecture/current-dependency-graph.md`, active compatibility register and this supplement.
