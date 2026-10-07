# Accounting Correction worklog supplement

The repository's primary `docs/architecture/modularization-worklog.md` exceeds the current
workspace patch-size limit. This supplement records the same required chronological delivery evidence
for the Posted Financial Correction work package until the main-worklog append limitation is removed.
The authoritative work-package design/status remains
`docs/architecture/accounting-document-recognition-human-review-plan.md` §16.

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
