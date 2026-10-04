# Post-Modularization CI Performance — Batches 1–4

Date: 2026-10-04  
Baseline: `origin/dev@6e7b4fbd2067892bf4cf990d2a193dd92e366957`  
Batch 1: **MERGED / PR #2694 / MERGE `d1fdac78` / PR CI #6902 GREEN / DEV PUSH CI #6903 GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**  
Batch 2 baseline: `origin/dev@d1fdac782381e49fc0cd57a58ff482bdd8dbcaab`  
Batch 2 branch: `ci/performance-diagnostics-batch-2`  
Batch 2 state: **MERGED / PR #2695 / MERGE `ad17c92c` / PR CI #6904 GREEN / DEV PUSH CI #6905 GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**  
Batch 3 baseline: `origin/dev@ad17c92c239921a805e4dd6e34c3db08aa30bab1`  
Batch 3 branch: `ci/e2e-preparation-format-batch-3`  
Batch 3 state: **MERGED / PR #2696 / MERGE `936bf21a` / PR CI #6906 GREEN / DEV PUSH CI #6907 GREEN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**  
Batch 4 baseline: `origin/dev@936bf21a75ca79a5e1488a4d998d28869d7dc99a`  
Batch 4 branch: `ci/lint-concurrency-batch-4`  
Batch 4 state: **LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN / NO MIGRATION / NO DEPENDENCY / NO GRAPH OR BASELINE CHANGE**

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

No changed-tests selection, test exclusions, safety-rule suppression, continue-on-error, dependency upgrade, Prisma/schema/migration, architecture allowance or application behavior change is introduced. The full API test command and discovery configuration are unchanged; only its scheduling owner changes.

`publish-images.yml` is unchanged. It still publishes immutable API/Web SHA images only after a successful `ci` push run on main and checks out that run's exact head SHA. The new full-Jest job and aggregate gate remain part of that successful workflow requirement.

## Review and validation status

Batch 1 was reviewed and explicitly authorized for remote delivery. PR #2694 final head `8f59516f2f0da946e633fdb76d4acac77767422d` passed all seven jobs in CI #6902 (149 seconds); the preserved API aggregate and Web names each appeared once. It squash-merged into dev as `d1fdac782381e49fc0cd57a58ff482bdd8dbcaab`. That exact dev push passed CI #6903 in 154 seconds. Both runs preserved full API discovery (486 passing suites / 2956 passing tests and the same two existing skipped suites/tests) and all 13 browser journeys. No main promotion or deployment was performed.

These two runs are approximately 28% and 25% shorter than baseline #6901 (206 seconds), but are not enough to claim a stable improvement across runner variation. PR #6902 had API static checks 140s, API tests 77s, Web 112s, E2E 126s and API aggregate 3s. Dev #6903 had API static checks 145s, API tests 101s, Web 79s, E2E 150s and API aggregate 2s. The critical job alternated between static checks and E2E.

Batch 2 was reviewed and authorized for remote delivery. PR #2695 final head `3417ee56900bc9ee665c2e3316743648f7353bfb` passed all seven jobs in CI #6904 (171s) and squash-merged into dev as `ad17c92c239921a805e4dd6e34c3db08aa30bab1`. That exact dev push passed CI #6905 (145s). Lint timing, the top-20 suite summary and the 7-day JSON artifact were produced in both runs; full API discovery remained 486 passing suites / 2956 passing tests with the same two skips and all 13 E2E journeys passed. No local lint/build/test was run. Batch 3 was reviewed and authorized for remote delivery. PR #2696 head `02ae817854dff35626fcb36752b1117392ca2c53` passed CI #6906 (156s) and squash-merged as `936bf21a75ca79a5e1488a4d998d28869d7dc99a`; exact dev push CI #6907 passed in 154s. Both runs passed all seven jobs, full API discovery (486/2956 with the same two skips) and 13 browser journeys. Batch 4 remains at local source/diff/status review, uncommitted and unpushed.

Preserved remote acceptance criteria (first successful samples are recorded above; broader performance and negative-path evidence remain separate):

1. Both existing display names `build-test (api)` and `build-test (web)` appear exactly once; full API Jest is present as `api-tests` and its failure cannot pass the aggregate API check.
2. Full API discovery matches the unchanged source/configuration (baseline 486 passing suites / 2956 passing tests, with the same two pre-existing skipped suites/tests). Web and all 13 browser journeys remain covered.
3. All architecture/safety/printer/Windows gates pass and the immutable-main-publish contract is preserved.
4. Same-PR stale runs are canceled while different PRs and dev/main pushes have separate groups.
5. At least five comparable completed runs record total elapsed time, critical job times, runner minutes and cache state before claiming a stable speed improvement.

GitHub rulesets were not retrieved, but actual check names and successful PR admission were confirmed by PR #2694. Negative dependency-result branches and stale-PR cancellation have been reviewed in source, not deliberately exercised.

## Architecture and next work

This batch changes CI/Ops execution only: no source imports, context ownership, direct-import allowance/count, public SCC, compatibility registry or `tools/architecture/context-baseline.json` change. Repository modularization remains closed.

The user explicitly authorized starting the next step after Batch 1 merge on 2026-10-04. Batch 2 adds diagnostic output to existing checks as described below. The user authorized continuing optimization after Batch 2 merge. Batch 3 separated CI formatting execution and overlapped independent E2E preparation. After its measured results, the user authorized Batch 4 to revert the format separation while retaining E2E overlap and compare lint concurrency in a separate, narrowly triggered experiment. Build-artifact reuse, additional sharding, incremental caches, safety-rule changes and changed-path selection remain outside these batches; do not start those changes automatically.

## Batch 2 — Reuse existing runs for performance diagnostics

**State:** MERGED / PR #2695 / PR CI #6904 GREEN / DEV PUSH CI #6905 GREEN, based on merged dev `d1fdac78`.

The first successful runs still spent roughly 57 seconds on API typed lint in PR #6902; API checks and E2E alternated as the longest job. Diagnose the actual rule/suite work before choosing an optimization:

- API lint keeps its complete source/test glob, `--concurrency=auto`, rules and exit status, and gains only `TIMING=1` to print rule timings. This is rule-level aggregate output, not per-file parser/Program profiling. The first type-aware rule can include lazy type-checker initialization; its apparent cost is not proof that the rule should be removed.
- The existing full Jest invocation adds `--json --outputFile` to write a report under RUNNER_TEMP. Test discovery, transformations, mocks, worker policy, assertions and exit status are unchanged. There is no second Jest invocation.
- A native Node summary reads the report and writes the top 20 suites to the job log and GitHub step summary. It uses suite endTime minus startTime, includes preparation/transform overhead, and does not claim these values are pure test-body CPU time or sum to overall wall-clock duration.
- The JSON report is uploaded as `api-jest-timings` with 7-day retention. Summary/upload run after a success or failure when Jest was attempted; cancellation and skipped test steps do not trigger them. A missing report is explicitly noted; it cannot turn a failed test step into a successful job.
- No extra runner job, test rerun, package, production-code change, rule/cache change or E2E concurrency change is added. Diagnostics have small recording/upload overhead; Batch 2 itself does not claim another speed reduction.

Local review included the exact workflow diff, report paths, conditions and aggregate failure propagation. No local lint/build/test was run. Actual PR and merged-dev CI confirmed the lint timing table, a readable 20-suite summary, artifact upload, unchanged full discovery and preserved gates. API static jobs took 140/129s; API test jobs 121/92s; E2E jobs 166/140s. API lint took about 56/51s. Prettier accounted for 35.4%/33.8% of cumulative rule timing (not wall-clock savings). The three slowest suites were image OCR (17.089/13.294s), OrdersService (7.847/5.989s) and receipt image (7.443/5.820s). E2E API builds took about 26/20s, Web builds 51/35s, browser installation 17/15s, and actual journeys 15.7/14.5s. Runner variation is substantial; Batch 2 is diagnostic, not a proven extra speed improvement.

Official diagnostic references: [ESLint rule profiling](https://eslint.org/docs/latest/extend/custom-rules#profile-rule-performance), [typed-lint timing interpretation](https://typescript-eslint.io/troubleshooting/typed-linting/performance/), [Jest JSON output](https://jestjs.io/docs/cli#--json).

Related records: [dependency graph](current-dependency-graph.md), [batch worklog supplement](modularization-worklog-ci-performance.md), [main worklog](modularization-worklog.md).

Documentation limitation: SanQ MCP rejected both attempted main-worklog appends because the resulting file exceeds its 1,000,000-character write limit. The main worklog is unchanged; the supplement records this batch without rewriting unrelated history. The AGENTS main-worklog append requirement remains pending a delivery method capable of handling that file. Do not mark that append as completed.

Official capability references: [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [GitHub workflow dependencies](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds), [Playwright headless shell](https://playwright.dev/docs/browsers#chromium-headless-shell).

## Batch 3 — Independent format gate and parallel E2E preparation

**Owner / class:** Runtime / Data / CI / Ops; atomic internal CI execution change. No application, public or persisted contract changes. Consumers are the existing API static matrix entry, preserved API aggregate, browser E2E and successful-main immutable image publishing gate.

**State:** MERGED / PR #2696 / PR CI #6906 GREEN / DEV PUSH CI #6907 GREEN, based on merged dev `ad17c92c`.

- Add a required direct Prettier `--check` on the exact existing `{src,apps,libs,test}/**/*.ts` API glob, using existing dependency/configuration. `--ignore-path /dev/null` overrides the CLI's default gitignore/prettierignore exclusions so the new gate does not silently narrow the existing lint glob. The API currently has no `.prettierignore`, inline Prettier suppression, or custom Prettier rule options. No formatting sweep is included.
- Only the CI ESLint invocation overrides `prettier/prettier` to off, after the required format step; all code-quality/type-aware/security rules and TIMING stay intact. The ESLint configuration and local developer lint behavior are unchanged. The formatting step fails the same static job on mismatch or tool error, so its failure also blocks the existing API aggregate. This changes the formatting execution owner, not whether formatting is required.
- Inside one E2E preparation step, install Playwright headless shell/system dependencies concurrently with a serial API branch: generate Prisma Client -> replay committed migrations in the disposable database -> seed with NODE_ENV=test -> Nest build. Both branches use fail-fast subshells, capture PIDs, and are explicitly awaited. Failure in either branch fails the step; no process is carried into a later step before its exit status is checked.
- Retain production Web build, API/Web start and readiness, BFF readiness, all browser journeys/worker/retry settings, full Jest and all other validation gates. Capture separate preparation logs, print them in grouped CI output, record each command's shell wall/user/sys timing, and include both logs in failure artifacts.
- No extra job, dependency/lockfile change, cache, application source change, migration, architecture allowance/baseline change, main promotion or deployment.

**Verification:** user reviewed and authorized remote delivery; PR #2696 and exact merged-dev runs passed all seven jobs, direct formatting and typed lint, both E2E preparation branches, migration/seed/production readiness, 13 journeys and unchanged full API discovery/report output. Failure propagation was reviewed in source, not deliberately fault-injected. No local lint/build/test or CI reproduction was run.

**Measured outcome:** PR/dev format steps each took ~16.6s; remaining lint ~44.4/43.9s, totaling ~61.0/60.5s versus Batch 2 ~56.4/51.0s. Static jobs rose to 146/145s. Parallel E2E preparation took ~36.2/39.7s versus prior serial ~51.3/43.4s; E2E jobs took 138/147s with Web builds ~44.7/42.5s and tests 14.3/14.4s. Total workflow was 156/154s versus Batch 2 171/145s. This is mixed evidence, not a stable overall speed improvement. Direct format separation showed extra wall time in both samples and is reverted in Batch 4; independent E2E overlap is retained. Some final shell-time lines were absent from the retrieved preparation logs, so comparisons use observed step boundaries rather than claiming complete per-command timing coverage.

**Performance decision:** compare format+lint together against the previous 56/51s lint steps, and parallel preparation against the prior serial ~51/43s browser+API preparation. The browser stage offers roughly 15–17s of overlap before CPU/I/O contention, not a guaranteed workflow reduction. Previous dev static checks (129s) may become the critical path when E2E (140s) improves. Measure PR and merged-dev runs before deciding whether to retain the overlap; collect more comparable samples before claiming stable gains.

**Next work:** if these changes pass CI and improve the longest path, review remaining API build/strict-check sequencing or production Web build work. Keep slow image suites intact until repeated suite/test preparation has been profiled; do not reduce dimensions or boundary assertions merely for speed.

References: [Prettier direct execution](https://prettier.io/docs/integrating-with-linters), [Prettier CLI checks and ignore-path behavior](https://prettier.io/docs/cli).


## Batch 4 — Restore combined lint and measure concurrency

**Owner / class:** Runtime / Data / CI / Ops; atomic internal CI execution/measurement change. No business, public, persistence, dependency, module-boundary or machine-baseline change.

**State:** LOCAL IMPLEMENTED / USER REVIEW PENDING / CI NOT RUN, based on `origin/dev@936bf21a`.

- Restore the API lint invocation from Batch 2: full glob, TIMING=1 and `--concurrency=auto`, with the existing ESLint Prettier rule active. Remove the separate direct format step and its CI-only rule override. Local ESLint config never changed; E2E overlap/logging, all seven normal jobs, static/architecture/safety/test gates and immutable-main publishing stay intact.
- Add `.github/workflows/api-lint-benchmark.yml` as an independent experiment. It runs only for dev PRs changing that exact workflow path or a manual dispatch; there is no push, scheduled or ordinary source-PR trigger. Its three matrix jobs are not dependencies of `ci` and do not publish or deploy. Do not add path-filtered benchmark names as required checks for every PR. Manual UI dispatch availability depends on GitHub admitting the workflow on the repository's default branch; this PR can gather its initial measurements through its self-path trigger without a main promotion.
- Compare `off` (all lint work on the main thread), `2` (two workers) and `auto`. Each job independently checks out the same tested revision, uses the normal Ubuntu 26.04 / Node 20 / pinned pnpm / frozen install, builds shared libraries and generates Prisma Client. All source/test files and rules including Prettier are kept. No ESLint cache or rule override is used.
- Each mode runs two fresh full ESLint processes. Native Node measures process wall time, preserves child status/signal and fails the job if either sample fails; setup and report upload are excluded from measured lint seconds. The second process still may benefit from OS/filesystem warm-up. Different matrix modes use separate hosted runners, so host variation remains a confounder and two samples cannot establish a stable winner.
- Record mode, checkout SHA (PR merge SHA), PR head SHA, Node/runner-image/CPU metadata and each sample's wall seconds/exit code in logs, step summary and a per-mode JSON artifact retained for 7 days. A missing report is not a passed benchmark. Additional runner cost and possible queueing apply only when this experiment is triggered; no automatic concurrency tuning is performed.

**Review / remote acceptance:** source/diff/status review only; no local lint/build/test or benchmark execution. After user review and remote-delivery authorization, require all seven normal CI jobs plus all three triggered benchmark jobs green on the reviewed head. Confirm the restored combined lint gate, unchanged full API discovery and 13 journeys; inspect two successful samples per mode with comparable runner metadata. Compare normal lint/static/E2E/whole-workflow wall time separately from the independent benchmark workflow's elapsed time.

**Next decision:** keep `auto` in normal CI until measured evidence supports a mode. If one mode consistently improves lint wall time across repeat runs with the same rules and runner resources, make that setting change in a separately reviewed batch and confirm the whole workflow improves. If modes are similar, avoid extra permanent jobs/cache/dependency changes and reassess build/strict-check or Web-build work. The main-worklog append limitation remains pending; this supplement does not claim it is resolved.

Reference: [ESLint concurrency option](https://eslint.org/docs/latest/use/command-line-interface#--concurrency).
