# Batch C5-A — Runtime source-checkout retirement readiness audit

**State:** C5-A merged to dev via PR #2734
(`2f10cbaaa24fbc55ce831f22b63709be8035009d`).
This document records the C5-A baseline; subsequent C5-B1 source-only
implementation is documented in
`docs/architecture/postmod-ghcr-batch-c5b1-runtime-artifact-trust.md`.
Production checkout deletion remains unauthorized.

## Ownership and architecture evidence

Reviewed `AGENTS.md`, `.github/workflows/ci.yml`, `.github/workflows/publish-images.yml`,
`ops/sanq-mcp/server.py` and its tests, C2 staging, C4-B deploy controller,
paired-image publication and Runtime bundle source/manifest contracts.

**Checkout dependency 1 — MCP production code queries.**
`ops/sanq-mcp/server.py` resolves `SANQ_REPO_ROOT` to
`/home/ubuntu/sanq-app` by default. Its read-only production
`git_status`, `git_log`, `git_diff`, `git_show`, `read_file`
and `search_code` all rely on the working tree. Docker `docker_status`
and `docker_logs` currently use `_run_prod`, whose `cwd` is that
same source tree; compose project/file selection is implicit.
The isolated writable `SANQ_WORKSPACE_ROOT` has independent privileges;
do not turn it into a production code or config mirror.

**Checkout dependency 2 — Runtime provenance.**
`ops/runtime/stage_bundle.py` requires the same main checkout SHA,
branch and exact Runtime file bytes.
C4-B `ops/release/deploy_release.py` compares *every* installed Runtime
file's checksums and exact bytes to a matching `main` Git checkout
and explicitly executes Git as unprivileged `ubuntu`.
That is an intentional temporary C4 trust gate. Removing the checkout
first would block staging, deployment and rollback readiness.

**Checkout dependency 3 — publication evidence.**
The trusted `publish-images` workflow uploads an inert Runtime archive
(`sanq-runtime-<source-SHA>`) and seals a successful image pair.
The source SHA, both image digests, CI/publish run IDs and Runtime
file hashes are embedded **inside the archive**. The GitHub commit status
seal currently independently anchors only the API and Web image digests.
A modified archive could carry *new checksums matching its modified files*;
checking only the internal manifest cannot authenticate its bytes.
Current artifact retention is 90 days, not perpetual, so disaster recovery
and historical rollback must account for artifact expiry.

## What C5-A changes

Add `ops/runtime/audit_source_retirement.py`, a passive,
standard-library-only read of a small set of non-secret tracked source
paths (MCP, staging, release, publish and bundle). The JSON output reports
current checkout-dependent contracts, drift, and missing future evidence,
with **readyToDeleteProductionSourceCheckout=false** at all times.
No Git, Docker, network, production data or archive content is opened.
Add offline fixtures under `ops/runtime/tests` (already discovered by
existing API CI). No active MCP, release trust or runtime code paths are
changed in C5-A.

Command, after checkout includes this audit source:

    python3 ops/runtime/audit_source_retirement.py

This is an information report, **not a production go/no-go authorization**.

## Alternatives for C5-B / C5-C

### Option A — keep a permanent production read-only Git checkout

Preserves MCP production Git and code-reading semantics with few changes,
but does **not achieve** the intended removal of application source from VM.
The Git checkout must remain in its own non-runtime location and still
requires safe source updates and retention management.

### Option B — source reads from immutable GitHub SHA + authenticated Runtime artifact (recommended)

1. **Publication authority (C5-B1):** trusted GitHub workflow publishes
   an independently verifiable Runtime archive digest / attestation tied
   to exact `main` SHA, publish run and paired API/Web digests.
   Consumer independently authenticates artifact bytes and issuer/workflow
   identity before staging. Internal manifest checksums remain useful
   integrity checks, not substitutes for independent provenance.
   Fail closed if artifact/attestation is missing, expired or mismatched.
   Plan retention/recovery beyond normal Actions artifact expiry.
2. **Consumer cutover (C5-B2):** stage and manual deploy controller
   change *only after* new authenticating consumer exists and has
   offline verification tests. Remove their dependence on
   `/home/ubuntu/sanq-app` for source proof without weakening no-symlink,
   path/mode, paired-image or database-volume checks.
3. **MCP read model (C5-C):** retain live VM Docker and database
   **read-only operations** but pin Docker Compose project `sanq-app`,
   fixed Runtime file and directory; source file/history/search
   capabilities instead query GitHub at an immutable, explicitly selected
   reviewed `main` SHA (or deprecate existing production Git-diff/status
   semantics with a versioned contract). Preserve redaction,
   forbidden path/glob, timeout and result-size constraints.
   Do not represent GitHub source as if it were mutable live filesystem.
4. **Final source removal gate (C5-D):** confirm MCP clients work with
   the new source semantics; production runtime, backup, Docker,
   provenance verification and rollback all work without production
   `.git`. Only then propose explicit owner-approved manual removal;
   no automatic delete or source directory cleanup in development slices.

**Ownership changes needing explicit authorization:** C5-B1 changes
the trusted release-proof and artifact authentication boundary. C5-C
changes MCP tool contracts (including `git_status/diff` meanings)
and the distinction between live production versus GitHub source.
The user should explicitly approve those after reviewing this design;
C5-A does not implement or implicitly authorize them.

## Invariants until independent C5 approval

- No production VM files or source checkout deleted, no MCP service restart.
- No PR to main, production image rollout, Docker up/down, migrations or
  DB-volume changes. Preserve `sanq-app_pgdata` exactly.
- No weakening of MCP permissions or exposure of `.env`, rclone,
  backups, uploads, TLS keys or secrets in GitHub artifacts/logs.
- Existing main checkout retained while C4 deploy/rollback depends on it.
- No package, lockfile, Prisma, business bounded-context change.
- GitHub CI remains the authoritative test gate only **after user review**.
