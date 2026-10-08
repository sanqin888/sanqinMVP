# C5-B2B3 — Runtime installer and transaction recovery readiness

**Status: READ-ONLY DESIGN / AUTHORIZATION REQUIRED FOR ACTIVE INSTALLER.**
Baseline: C5-B2B2 PR #2739 merged into dev as
`2df7254f50faa5d0142496d5c4d709c1bb5036c6`.
Audit branch: `feat/ops-runtime-installer-readiness-c5b2b3`.

## Evidence reviewed

The current `AGENTS.md`, CI workflow, `ops/release/deploy_release.py`,
`ops/runtime/plan_versioned_install.py`, `stage_bundle.py`,
`ops/runtime/runtime-layout.v1.json`, `ops/backup/backup-db.sh` and
`docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`.

B2B1 authenticates a specific historic release; B2B2 builds an **inert**
transaction intent. Neither is an installer or a durable transaction journal.
The current C4 manual controller is still **not a versioned-runtime
controller**, and its Git checkout remains necessary.

## Findings and blocking conditions

### 1. Runtime source vs operator executable ownership

- The existing deploy controller executes from `/opt/sanq/runtime`,
  itself a source tree whose files may change in a proposed cutover.
- `/opt/sanq/runtime` must remain a real root-owned directory, not a
  symlink. A self-replacing controller could read one revision and write
  another in a partial failure.
- Any installation operation needs a separately reviewed **stable launcher
  outside the active tree**, with no arbitrary path, command or
  privilege input.
- Current deployment requires an explicit root operator, yet the backup
  service and .env permissions require `ubuntu` ownership. Do not widen
  the narrow Nginx-helper sudoers entry.

### 2. Atomic replacement and crash durability are different

- `deploy_release.atomic_write` fsyncs file content and calls
  `os.replace`, but does not fsync the **parent directory**.
  It is suitable for the existing source's local write pattern, not
  enough by itself to claim crash-durable, multi-file activation.
- A version installation spans multiple files, .env SHA and Docker
  containers; it cannot be made truly all-or-nothing by repeating
  per-file `os.replace`.
- The installer needs a transaction state machine and explicit
  interruption recovery before any active file is overwritten.
- Current state phases are `pending/active/rolled-back`; the pure B2B2
  plan also recognizes `failed`. These are not yet the same persisted
  contract. An old controller must not misinterpret a new journal as
  permission to proceed.

### 3. Historical recovery is not image-only rollback

- Existing controller rollback changes API/Web image SHA, keeping the
  current Compose, runtime scripts and readiness helper.
- Historical rollback must authenticate and retain the **exact matching
  Runtime archive plus API and Web image digests** for both current and
  previous versions.
- A missing archive, expired 90-day Actions artifact, unverifiable
  historical publication or unknown partial transaction must fail
  closed. A GitHub SHA256 status does not preserve archive bytes.
- Preserve `sanq-app`, physical `sanq-app_pgdata`, and the shared
  `/srv/sanq/uploads` location. Rollback must never reset or replace
  PostgreSQL or silently replace uploaded content.

### 4. Active backup and upload ownership cannot be hidden

- The backup helper and service are fixed-path and privileged separately.
  Source cutover of backup scripts cannot be conflated with a normal
  API/Web release.
- The C4 activation marker is an operator gate, not a release selector;
  do not create or rewrite it as a side effect of a C5 installer.
- Existing runbook requires backup restore evidence, stopped writers,
  verified uploads, unchanged DB volume and a reviewed manual rollback.
  C5 cannot supersede or shortcut these obligations.

## Options

**A. Continue image-only releases with the retained checkout (lowest
change risk).** Keep current deploy code. Do not claim versioned-runtime
recovery or delete `.git`. Does not satisfy final checkout-retirement
objective.

**B. Versioned, manually activated Runtime with an external fixed
launcher (recommended after explicit authorization).** Design version
storage proposed at `/opt/sanq/releases/<source-sha>`; pin exact archived
SHA256 and both image digests. Preflight with authenticated archive bytes,
strict paths, ownership and a transaction lease. Create an immutable
recovery snapshot and durable pending journal before touching active
state. Change active Runtime under an operator-controlled maintenance
window, verify Docker and App health, then explicitly commit Active.
An interruption or uncertain state must remain blocked pending manual
reconciliation.

**C. Switch the active Runtime path to a symlink.** This conflicts with
existing no-symlink root and helper contracts and could change unrelated
privileged trust assumptions. Not recommended.

## Proposed follow-on slices, not yet authorized for execution

- **B3-A:** versioned install *source-only* trust/ownership audit, fixed
  on-disk version and journal schema, interruption and failure matrix,
  offline fixtures. No installer executor or root writes.
- **B3-B:** separately authorized manual-only installer/launcher and
  versioned state transitions. Requires approval of root/ubuntu
  privilege contract, exact activation ordering, rollback strategy,
  archive retention and preflight behavior. Stop at local review before
  PR. Never activate in production without an additional C4 authorization.
- **B3-C:** controlled end-to-end recovery evidence on an isolated
  environment; production remains gated.
- **C5-C/C5-D:** MCP decoupling and original checkout removal remain
  separate workstreams.

### Suggested interruption matrix

| Failure point | Required response |
| --- | --- |
| Before durable pending journal | No active files touched; abort |
| After journal but before copy | Mark blocked; manual verification required |
| Partial active Runtime replacement | Stop release commands; restore exact retained version by controlled operator procedure |
| After Runtime files, before image change | Block; no automatic forward/rollback |
| During container switch | Verify actual service IDs, image digests, mounts and DB volume; operator reconciles |
| Health check fails | Keep pending/failed; do not auto-rollback |
| After health but before active-commit fsync | Treat state as uncertain; manual proof required |
| Historic archive/proof unavailable | HISTORICAL_ROLLBACK_BLOCKED |

## Decision gate

Request separate permission **before implementing any executable
versioned installer, new privileged helper, changed sudoers rule,
root-owned active Runtime writes or changes to deploy/rollback owner
semantics**. The current user request authorizes beginning the next
phase, not production cutover or widening architectural authority.

No source behavior, CI, migrations, Docker, backups, uploads or live
systemd services are modified by this read-only design step.

## Subsequent stage record (2026-10-08)

C5-B3A source-only contract is recorded in
`docs/architecture/postmod-ghcr-batch-c5b3a-persistence-recovery.md`.
The B3A schema/transition module and offline test fixtures do **not** install
Runtime, persist a production journal, modify the legacy controller, or supply
root execution rights. B3-B must separately obtain authorization for actual
filesystem persistence, lock enforcement and transactional recovery.
