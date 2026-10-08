# Batch C4-A — Runtime cutover source compatibility gate

**Status:** C4-A source findings retained; C4-B option B source implementation
is now locally prepared on the same unsubmitted branch. This document records
the *prior baseline blockers* rather than claiming they remain unresolved.
See `docs/architecture/postmod-ghcr-batch-c4b-runtime-path-implementation.md`.
Production cutover is still NOT authorized.

## Source baseline

Developed from origin/dev after C3-B PR #2732, merge
225f5d4617f792bbd22e7bbf267eda0f75cf841e.
Read AGENTS.md, .github/workflows/ci.yml, the current Compose file, Batch B
deployment controller, readiness helper, C2 layout contract and C3 backup
preparation. No runtime files, services, database, uploads or backups on VM
are changed by this slice.

## Concrete blockers in current checked-out source

1. **Uploads mount:** docker-compose.yml still uses
   ./uploads:/app/uploads for both api and ubereats-worker. When Compose is
   relocated to /opt/sanq/runtime, that path resolves under /opt, not
   /srv/sanq/uploads. Both services must retain one shared persistent
   upload source after moving directories.
2. **Release controller:** ops/release/deploy_release.py still requires the
   legacy production Git branch and original checkout identity; its local
   backup preflight reads ROOT/backups. That is incompatible with the target
   /srv/sanq/backups and checkout-free Runtime deployment.
3. **Readiness helper:** ops/verify-runtime-readiness.sh invokes Docker
   Compose using only --env-file. It relies on the invocation directory to
   choose the Compose file, project and volume namespace. Readiness from
   the wrong directory could inspect the wrong project or volume.
4. **Unverified production evidence:** neither source text nor CI can prove
   actual Docker named-volume identity, remote restore health, uploaded
   file integrity, installed root helper/sudoers or live service behavior.

The current Compose image tags and service topology are intentionally
unchanged; a cutover must preserve sanq-app and sanq-app_pgdata.

## C4-A implementation

Add ops/runtime/audit_compose_cutover.py as a standard-library-only,
read-only source checker. It examines a fixed allowlist of *non-secret*
tracked files, rejects symlinks, detects unresolved path/project contract
assumptions, and always reports productionCutoverAuthorized=false and
productionCutoverReady=false even if source compatibility eventually passes.

Usage from a reviewed checkout (not a production migration command):

    python3 ops/runtime/audit_compose_cutover.py

Exit 2 indicates static contract blockers; exit 0 only indicates the static
source checklist found none. **Exit 0 does not authorize any deployment**.
No Docker, sudo, data reads, migrations, network calls or filesystem writes.
The check is included in the future source-pinned Runtime bundle. Offline
synthetic-fixture tests are covered by the existing API CI
ops/runtime/tests discovery. No local tests before review per AGENTS.md.

## C4-B decision before source changes

**Option A — defer the /srv cutover.** Keep active Compose and existing
/home/ubuntu/sanq-app/uploads/backups paths. This minimizes production
risk but leaves the independent Runtime/Data architecture incomplete.
C3-B source templates are incompatible with installing directly onto this
legacy setup and must stay uninstalled.

**Option B — implement the reviewed target (recommended).** In a separately
approved source-only C4-B slice:
- Make Compose explicitly bind the same /srv/sanq/uploads to api and worker,
  while retaining the logical pgdata:/var/lib/postgresql/data and external
  Compose project name sanq-app.
- Adapt manual release controller to the exact reviewed Runtime location
  and /srv/sanq/backups. Require pinned project/directory and digest checks.
  Do not remove main Git checkout during C4; C5 owns source retirement.
- Pin the readiness helper to the exact reviewed Compose file, project name
  and directory instead of current-working-directory inference.
- Add offline tests for mount parity, project name, image SHA, source/runtime
  compatibility and fail-closed pre-cutover behavior.
- Preserve existing .env and upload data with an independently approved
  handoff and rollback runbook; never have a two-project DB volume split.

These are operational authority and active-path contract changes. The owner
subsequently **authorized C4-B option B source-only modifications**.
That permission does not cover GitHub submission or production cutover.

## Production gate remains separate

Actual installation or moving files under /opt or /srv, pausing the backup
timer, copying uploads, recreating app containers and verifying or invoking
backup/restore require further production authorization and live evidence.
A previously closed backup recovery drill does not prove the target layout
recoverable. No Prisma migration, production deployment, timer action,
user file copy or PostgreSQL data volume manipulation is part of C4-A.
