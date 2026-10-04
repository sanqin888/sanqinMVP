# Post-Modularization CI Performance — Batch 1

Date: 2026-10-04  
Baseline: `origin/dev@6e7b4fbd2067892bf4cf990d2a193dd92e366957`  
Branch: `ci/parallel-api-tests-batch-1`  
State: **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**

## Evidence and goal

The exact baseline CI #6901 passed. Observed workflow elapsed time was 206 seconds; API took 203 seconds, browser E2E 158 seconds, Web 81 seconds. API lint (~51s), Nest build (~22s), strict TypeScript (~24s) and full Jest (~72s) ran serially. Five same-day dev push samples had median workflow elapsed time 207 seconds. Browser E2E itself passed 13 tests in 14.6 seconds; environment setup and API/Web builds dominate that job.

Batch 1 reduces the serial API path while retaining the existing validation scope. The estimated full-workflow target is 140–170 seconds, not a measured result. Additional job setup and runner-minute costs must be measured after remote validation.

## Implementation

Only `.github/workflows/ci.yml` changes execution:

- The existing `build-test` matrix still runs Web and API static/build gates. Its Web check keeps the display name `build-test (web)`; its API entry is named `api-checks`.
- A root `api-tests` job runs full `pnpm --filter api exec jest` independently of the matrix. It prepares its own clean checkout, pinned pnpm 9.0.0 / Node 20, frozen install, parallel shared-library builds and Prisma Client. No Nest dist artifact or successful lint/build job is needed before Jest.
- The `api-validation` job keeps the original check display name `build-test (api)`. It waits for the entire `build-test` matrix and `api-tests`, runs with `always()`, and explicitly requires both dependency results to equal `success`. Failure, cancellation, skip or a missing result cannot produce a successful API gate. Because the matrix result includes Web, a failed Web entry also prevents this aggregate API gate from succeeding. No branch/ruleset mutation is included.
- E2E uses `playwright install --with-deps --only-shell chromium`. The lockfile currently resolves Playwright 1.63.0; the configured Chromium project has no browser channel or headed/executable-path override. System dependencies are still installed. Test concurrency, all journeys, migration replay, seed, production builds, readiness/BFF checks and diagnostics remain intact.
- Workflow concurrency uses a shared group for the same PR and a unique run-ID group for each push. Only PR events enable cancel-in-progress; dev/main push runs do not supersede one another. Workflow name `ci`, triggers and read-only permissions remain unchanged.

## Preserved gates and release contract

API typed ESLint, Nest build, API strict TypeScript, shared strict checks, architecture baseline, MCP safety tests and backup safety tests remain in the matrix. Web lint/build/strict/Jest, real browser E2E, printer-agent and Windows workstation checks remain.

No changed-tests selection, test exclusions, rule suppression, continue-on-error, dependency upgrade, Prisma/schema/migration, architecture allowance or application behavior change is introduced. The full API test command and discovery configuration are unchanged; only its scheduling owner changes.

`publish-images.yml` is unchanged. It still publishes immutable API/Web SHA images only after a successful `ci` push run on main and checks out that run's exact head SHA. The new full-Jest job and aggregate gate remain part of that successful workflow requirement.

## Review and validation status

Local source/diff/status review is the current gate. No local lint, build, test or CI-reproduction command is run, following AGENTS.md and the user's review-first workflow. No commit, push, PR, CI run, main promotion or deployment is claimed.

After the user authorizes remote delivery, require the actual PR CI to establish:

1. Both existing display names `build-test (api)` and `build-test (web)` appear exactly once; full API Jest is present as `api-tests` and its failure cannot pass the aggregate API check.
2. Full API discovery matches the unchanged source/configuration (baseline 486 passing suites / 2956 passing tests, with the same two pre-existing skipped suites/tests). Web and all 13 browser journeys remain covered.
3. All architecture/safety/printer/Windows gates pass and the immutable-main-publish contract is preserved.
4. Same-PR stale runs are canceled while different PRs and dev/main pushes have separate groups.
5. At least five comparable completed runs record total elapsed time, critical job times, runner minutes and cache state before claiming a stable speed improvement.

GitHub rulesets were not retrieved in this read-only audit; preserving existing check display names avoids an intentional required-check rename, but actual emitted names and PR admission still require remote confirmation. Negative dependency-result branches have been reviewed in source, not executed.

## Architecture and next work

This batch changes CI/Ops execution only: no source imports, context ownership, direct-import allowance/count, public SCC, compatibility registry or `tools/architecture/context-baseline.json` change. Repository modularization remains closed.

Do not start Batch 2 automatically. After Batch 1 is reviewed and validated, use measured results to choose typed-lint profiling, Jest suite timing or E2E preparation/build scheduling. Build-artifact reuse, additional sharding, incremental caches and changed-path selection remain outside this batch.

Related records: [dependency graph](current-dependency-graph.md), [batch worklog supplement](modularization-worklog-ci-performance.md), [main worklog](modularization-worklog.md).

Documentation limitation: SanQ MCP rejected both attempted main-worklog appends because the resulting file exceeds its 1,000,000-character write limit. The main worklog is unchanged; the supplement records this batch without rewriting unrelated history. The AGENTS main-worklog append requirement remains pending a delivery method capable of handling that file. Do not mark that append as completed.

Official capability references: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [GitHub workflow dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds), [Playwright headless shell](https://playwright.dev/docs/browsers#chromium-headless-shell).
