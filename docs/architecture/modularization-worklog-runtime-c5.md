# Post-modularization Runtime / GHCR worklog supplement

Primary `modularization-worklog.md` exceeds the MCP workspace patch-size limit. This owner supplement records the C5 batch without truncating/replacing the original timeline.

## 2026-10-08 — C5-B3B2A authority and recovery design freeze

**Status: LOCAL DESIGN / REVIEW PENDING; NO INSTALLER, NO PROD / CI NOT RUN.** Latest dev baseline C5-B3B1 merge `454c7c33` (PR #2742). Reviewed AGENTS.md, CI, C4 runbook, current deploy/backup ownership, B2B3/B3A/B3B1 and proposed versioned Runtime contracts. Freeze specifies launcher and journal authority separation, proposed fixed root-owned state/layout, cross-transaction continuity, historic archive+two-image-digest rollback and fail-closed recovery. Explicit architectural approval required before production writer/launcher implementation: `docs/architecture/postmod-ghcr-batch-c5b3b2a-authority-recovery-freeze.md`.

## 2026-10-08 — C5-B3B1 offline durable Journal and locking fixture

**Status: LOCAL SOURCE / REVIEW PENDING.** Branch `feat/ops-runtime-durable-journal-offline-c5b3b1`, based on C5-B3A dev merge `31cbfab5`; no PR/CI/deployment. Adds test-only auto-created private temporary sandbox, fsync/rename/directory-fsync sequence, exclusive flock, append-only journal generations, conservative interruption markers, strict replay and fault fixtures. Does not implement production journal I/O, installer, privilege changes, runtime files or Docker operations. No context/graph/baseline, dependencies or migration change. Details: `docs/architecture/postmod-ghcr-batch-c5b3b1-offline-durable-journal.md`.

## 2026-10-08 — C5-B3A versioned Runtime persistence and recovery

**Status: MERGED DEV / PR #2741 / DEV `31cbfab5` / CI #37737346064 GREEN / NO PRODUCTION DEPLOYMENT.** Branch `feat/ops-runtime-persistence-contracts-c5b3a`.

Adds pure Python v1 journal validation and modeled transaction transitions, fixed version directory contract, offline tests and durable persistence/recovery design. Does **not** write journal, run installer, change current controller responsibilities, alter publication allowlist, run Docker, or grant privileges. No dependency graph/scanner baseline change, migration or lockfile change.

Detailed authority and outstanding B3-B/B3-C gates: `docs/architecture/postmod-ghcr-batch-c5b3a-persistence-recovery.md`.
