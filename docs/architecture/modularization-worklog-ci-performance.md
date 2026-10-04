# CI Performance worklog supplement

The main [modularization worklog](modularization-worklog.md) could not be appended through SanQ MCP because the resulting file exceeds its 1,000,000-character write limit. This supplement records the current batch without truncating or rewriting unrelated history. The required main-worklog append remains pending an authorized delivery method that can handle the file size; this supplement does not claim that requirement was completed.

## 2026-10-04 — Post-Modularization CI Performance Batch 1

**PR / SHA:** PR #2694 / final head `8f59516f2f0da946e633fdb76d4acac77767422d` / merge `d1fdac782381e49fc0cd57a58ff482bdd8dbcaab`; baseline `origin/dev@6e7b4fbd`.  
**State:** **MERGED / PR CI #6902 GREEN / DEV PUSH CI #6903 GREEN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Implementation:** full API Jest runs independently of the static/build matrix. The original `build-test (api)` display name is preserved as a success-only aggregate over the matrix and full API tests; failed/cancelled/skipped dependencies cannot pass it. Web retains its original check name. E2E installs Chromium headless shell with system dependencies. Only stale same-PR runs are superseded; every dev/main push has a unique run group. All existing lint/build/strict/architecture/safety/test/browser/printer/Windows coverage and the immutable main-image publication contract remain.  
**Architecture / verification:** no context/import/debt/allowance/SCC/compatibility or machine-baseline change. The user reviewed and authorized remote delivery; PR CI #6902 passed all seven jobs in 149s, and exact merged-dev CI #6903 passed in 154s. Full API discovery remained 486 passing suites / 2956 passing tests with the same two pre-existing skips; all 13 E2E journeys passed. These are two observed samples, not a stable benchmark. No local lint/build/test, main promotion or production deployment was performed.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement. Update this same entry when delivery or validation progresses; do not create a duplicate implementation entry.

## 2026-10-04 — Post-Modularization CI Performance Batch 2 diagnostics

**Branch / baseline:** `ci/performance-diagnostics-batch-2` from merged `origin/dev@d1fdac78`; no Batch 2 PR or commit.  
**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Authorization / implementation:** the user explicitly authorized starting the next step after Batch 1 merge. API lint gains rule timing output; the existing single full Jest run writes JSON and a native Node summary lists the 20 slowest suites in CI logs/step summary, with the report retained for 7 days. No extra test run, job, rule/cache change or validation weakening is introduced. Failed tests still fail their job and the preserved API aggregate.  
**Verification / next:** source/diff/status review only; no local lint/build/test or remote execution. This batch provides measurements, not an additional claimed speed improvement. After review and separate remote-delivery authorization, confirm the reports and unchanged full test coverage, then select a measured optimization.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement.
