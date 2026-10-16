# Post-modularization Runtime / GHCR worklog supplement

Primary `modularization-worklog.md` exceeds the MCP workspace patch-size limit. This owner supplement records the C5 batch without truncating/replacing the original timeline.

## 2026-10-16 — C5-G2 B02-B inert one-shot operator gate source

**LOCAL SOURCE + FOCUSED TESTS AUTHORED / UNTESTED / REVIEW PENDING / NO PR.** `feat/c5-g2-b02b-root-operator-gated-source-20261016` adds external `ops/runtime/trusted_root_operator_gate.py`, a fixed-location/version/operation structural gate for hypothetical root operator prerequisites, including explicit noncooperating process and new-consumer exclusions. Even all-true claimed evidence permanently returns BLOCKED; no actual privileged entrypoint, root execution, real Runtime filesystem writes, Docker, DB, backup, CI change, bundle expansion, public contract or dependency graph changes. Real root-private delivery and privileged root implementation require subsequent separate authorization and independent disposable guest testing. See `docs/architecture/c5-g2-trusted-runtime-contract-2026-10-13.md`.

## 2026-10-16 — C5-G2 B02-A inert operator-source review

**LOCAL SOURCE + FOCUSED UNIT TESTS AUTHORED / USER REVIEW PENDING / NOT TESTED OR PUSHED / NO PRODUCTION CHANGE.** Branch `feat/c5-g2-b02a-trusted-source-preflight-20261016` from latest `dev` after A06 PR #2835. Added `ops/runtime/trusted_operator_source_review.py` as a negative-only checker for claimed SHA-256, private root-owned source ancestry and leaf FD identity. No real host observation or trusted-source authentication is claimed; all production authority flags remain false. No Runtime Bundle member changes, installer, privileged entrypoint, CI workflow, migration, dependencies, service, backup or context graph change. B02-B root-owned operator source delivery and isolated guest execution remain a separately authorized trust boundary. Owner `docs/architecture/c5-g2-trusted-runtime-contract-2026-10-13.md`.

## 2026-10-16 — C5 Batch A06 Prisma CLI migration-status fail-closed classification

**LOCAL SOURCE / TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO PR OR DEPLOY.** Branch `feat/c5-batch-a-a06-prisma-status-guard-20261016` from newest dev after #2834. Runtime/Release owner only: replace substring-based Prisma pending detection and unverified successful exit with exact bounded Prisma 6.19.1 stdout/stderr and exit-code classification. Recognized clean returns no migration; recognized pending still requires user-authorized SQL review and `--apply-migrations`; missing/unknown/mixed output fails closed. No new runtime dependency, business context ownership/imports, schema/migration, Runtime Bundle member, privilege or production mutation. Synthetic source-informed tests authored; real Prisma/PostgreSQL execution and GitHub CI pending. See `docs/architecture/postmod-ghcr-deploy-simplification-2026-10-08.md` §A06.

## 2026-10-08 — MCP GitHub main source-reader cutover

**LOCAL IMPLEMENTATION / USER REVIEW PENDING / CI NOT RUN / NO PRODUCTION CHANGE.** Production source tools use authenticated GitHub `main`, with immutable SHA file reads, bounded GitHub code search, explicit commit comparisons and no production Git/ripgrep subprocess. Docker ps/logs use the separate `/opt/sanq/runtime` Compose root; isolated workspace Git/PR behavior remains unchanged. MCP service installation, production credentials, systemd/tunnel and final checkout deletion remain independently gated. See `docs/architecture/postmod-ghcr-source-retirement-phase2-2026-10-08.md`.

## 2026-10-08 — Application/Runtime release SHA decoupling

**LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN / NO PRODUCTION CHANGES.** Retained the fixed root-owned Runtime file/manifest checks, removed deploy controller reliance on a Git main checkout, and permits newer sealed GHCR application releases only if a bounded GitHub source comparison shows no Runtime Bundle member changes. Runtime installation/update, MCP source-retirement and production validation remain separate gates. See `docs/architecture/postmod-ghcr-deploy-simplification-2026-10-08.md`.

## 2026-10-08 — C5-B3 independent Launcher branch retired

The user canceled the uninstalled independent root Launcher/signing/journal proposal. Related source-only code, tests and stage documents were removed. Git history preserves the original PR record; the GHCR paired-image publisher and existing deploy controller remain authoritative.

