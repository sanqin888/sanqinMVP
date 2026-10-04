# CI Performance worklog supplement

The main [modularization worklog](modularization-worklog.md) could not be appended through SanQ MCP because the resulting file exceeds its 1,000,000-character write limit. This supplement records the current batch without truncating or rewriting unrelated history. The required main-worklog append remains pending an authorized delivery method that can handle the file size; this supplement does not claim that requirement was completed.

## 2026-10-04 — Post-Modularization CI Performance Batch 1

**Branch / baseline:** `ci/parallel-api-tests-batch-1` from `origin/dev@6e7b4fbd`; no PR or new commit.  
**State:** **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / MAIN WORKLOG APPEND BLOCKED / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**.  
**Implementation:** full API Jest runs independently of the static/build matrix. The original `build-test (api)` display name is preserved as a success-only aggregate over the matrix and full API tests; failed/cancelled/skipped dependencies cannot pass it. Web retains its original check name. E2E installs Chromium headless shell with system dependencies. Only stale same-PR runs are superseded; every dev/main push has a unique run group. All existing lint/build/strict/architecture/safety/test/browser/printer/Windows coverage and the immutable main-image publication contract remain.  
**Architecture / verification:** no context/import/debt/allowance/SCC/compatibility or machine-baseline change. Source/diff/status review is the current gate; no local lint/build/test, remote validation, push or deployment is performed. Performance targets remain estimates.  
**Details:** `.github/workflows/ci.yml`, [work package](postmod-ci-performance.md), [dependency graph](current-dependency-graph.md), this supplement. Update this same entry when delivery or validation progresses; do not create a duplicate implementation entry.
