# CI Performance worklog supplement

The main [modularization worklog](modularization-worklog.md) could not be appended through SanQ MCP because the resulting file exceeds its 1,000,000-character write limit. This supplement records the current batch without truncating or rewriting unrelated history. The required main-worklog append remains pending an authorized delivery method that can handle the file size; this supplement does not claim that requirement was completed.

## 2026-10-04 — Post-Modularization CI Performance Batch 1

**PR / SHA:** PR #2694 / final head `8f59516f2f0da946e633fdb76d4acac77767422d` / merge `d1fdac782381e49fc0cd57a58ff482bdd8dbcaab`; baseline `origin/dev@6e7b4fbd`.  
**State:** **MERGED / PR CI #6902 GREEN / DEV PUSH CI #6903 GREEN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Implementation:** full API Jest runs independently of the static/build matrix. The original `build-test (api)` display name is preserved as a success-only aggregate over the matrix and full API tests; failed/cancelled/skipped dependencies cannot pass it. Web retains its original check name. E2E installs Chromium headless shell with system dependencies. Only stale same-PR runs are superseded; every dev/main push has a unique run group. All existing lint/build/strict/architecture/safety/test/browser/printer/Windows coverage and the immutable main-image publication contract remain.  
**Architecture / verification:** no context/import/debt/allowance/SCC/compatibility or machine-baseline change. The user reviewed and authorized remote delivery; PR CI #6902 passed all seven jobs in 149s, and exact merged-dev CI #6903 passed in 154s. Full API discovery remained 486 passing suites / 2956 passing tests with the same two pre-existing skips; all 13 E2E journeys passed. These are two observed samples, not a stable benchmark. No local lint/build/test, main promotion or production deployment was performed.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement. Update this same entry when delivery or validation progresses; do not create a duplicate implementation entry.

## 2026-10-04 — Post-Modularization CI Performance Batch 2 diagnostics

**PR / SHA:** PR #2695 / final head `3417ee56900bc9ee665c2e3316743648f7353bfb` / merge `ad17c92c239921a805e4dd6e34c3db08aa30bab1`; baseline `origin/dev@d1fdac78`.  
**State:** **MERGED / PR CI #6904 GREEN / DEV PUSH CI #6905 GREEN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Authorization / implementation:** the user explicitly authorized starting the next step after Batch 1 merge. API lint gains rule timing output; the existing single full Jest run writes JSON and a native Node summary lists the 20 slowest suites in CI logs/step summary, with the report retained for 7 days. No extra test run, job, rule/cache change or validation weakening is introduced. Failed tests still fail their job and the preserved API aggregate.  
**Verification / next:** user reviewed and authorized remote delivery. All seven PR/dev jobs passed in 171/145s; both lint tables/top-20 summaries/artifacts appeared, full API discovery remained 486/2956 with the same two skips, and all 13 E2E journeys passed. E2E was the longest job (166/140s); lint took about 56/51s and Prettier 35.4%/33.8% of cumulative rule time. No local lint/build/test or deployment. These samples provide diagnostic evidence, not a stable speed claim.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement.

## 2026-10-04 — Post-Modularization CI Performance Batch 3

**Branch / baseline:** `ci/e2e-preparation-format-batch-3` from `origin/dev@ad17c92c`; no Batch 3 PR or commit.  
**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Owner / authorization:** Runtime / Data / CI / Ops; atomic internal execution change, authorized by the user's request to continue optimization after Batch 2.  
**Implementation:** required direct Prettier checks the existing API glob; only CI ESLint disables duplicate Prettier execution, keeping all other rules and local config. E2E overlaps browser/system installation with serial Prisma generation -> committed migration replay -> NODE_ENV=test seed -> API build. Both fail-fast child branches are explicitly awaited; grouped logs and per-command timings remain, and failure artifacts include both logs. Existing aggregate names, test discovery, production Web build, readiness/BFF checks, 13 browser journeys and immutable-main publishing remain.  
**Verification / next:** final source/diff/status review only, no local lint/build/test or remote execution. No measured Batch 3 speed claim. After separate remote-delivery authorization, require all seven CI jobs green, unchanged full discovery and journeys, both preparation exits checked, and compare format+lint and preparation wall times against #6904/#6905.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement. Update the same entry as delivery advances; main-worklog append remains pending the previously recorded MCP size limit.

