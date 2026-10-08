# SanQ GHCR Batch C0 — Runtime layout separation readiness

**Status:** C0 merged to dev via PR #2728 (merge `96dc60be`); production
verification and directory cutover still not authorized. **NOT AUTHORIZED FOR
FILE MOVES.** No VM .env, Compose, systemd unit, backups, uploads, Docker
volumes or MCP configuration was changed.

## Architecture and code baseline

Batch A, PR #2726, merge a32e7bcd: GitHub publishes paired SHA-tagged
API/Web images and seals the commit after both manifests verify.
Batch B, PR #2727, merge f10bca42: adds manual, fail-closed image promotion
on the original production checkout; it **does not** relocate a runtime path.

Current production runtime is rooted at /home/ubuntu/sanq-app.
Directly deleting or renaming this checkout today is NOT safe:

- docker-compose.yml (root) reads a local .env and bind-mounts
  ./uploads into both API and Uber worker.
- PostgreSQL persists in Docker Compose project sanq-app, named volume pgdata.
  A changed project name could attach a new empty database volume.
- Web mounts /home/ubuntu/sanq-assets/sounds read-only.
- ops/backup/backup-db.sh pins PROJECT_ROOT, ENV_FILE, UPLOADS_DIR and
  BACKUP_DIR to /home/ubuntu/sanq-app.
- Backups archive .env and docker-compose.yml and synchronize uploads.
- Root-owned protected helper sanq-backup-protected-nginx also writes to
  /home/ubuntu/sanq-app/backups. Its sudoers authority is constrained to
  this helper and a validated archive filename; do not relax privilege.
- systemd backup unit appends logs at /home/ubuntu/sanq-app/backup.log.
- SanQ VM MCP server defaults SANQ_REPO_ROOT=/home/ubuntu/sanq-app and
  SANQ_WORKSPACE_ROOT=/home/ubuntu/sanq-mcp-workspace. Its production git,
  code search and file-read actions expect a Git repository.
- The existing runtime-readiness helper resolves Compose from its working
  directory and expects a production env-file argument.
- Deployment docs and backup recovery runbooks include fixed path examples.

Production Docker and service status is **not** sufficient proof of file
owner/ACL safety, backup offsite health, the exact systemd installed unit,
or working Nginx cert escrow. Confirm those on the actual VM before cutover.

## Alternatives and recommended staged path

### Alternative 1: Retain /home/ubuntu/sanq-app as a runtime-only directory

Keep existing Compose project identity, env/backup/uploads paths, remove
the Git working tree only after new MCP code-read ownership is verified.
This avoids live bind-mount and data moves, but leaves the legacy directory
name and still requires an independent source update mechanism.

### Alternative 2: Move runtime under /opt/sanq and data under /srv/sanq

Cleaner separation, but changes Compose path resolution, backup helper
permissions, production env storage, Nginx/log paths, MCP behavior, and
potentially mounted volume identity. It requires a controlled data copy,
two-pass upload synchronization and reversible cutover. It is riskier.

**Recommend a hybrid in sequential, independently reviewed slices:**

C0. Passive VM filesystem/read-only footprint inventory (this slice).

C1. Create runtime delivery bundle with reviewed Compose, release scripts,
readiness and release metadata, without switching any VM path or volume.
The actual package must be bound to the same main SHA as API/Web images.
A future VM install must enforce package/digest parity before activation.

C2. Define versioned runtime location/config contracts and host-side
validation. Stage a target tree but do not replace the active root.

C3. Separately review and change backup/source/upload ownership under the
existing narrow helper/sudoers contract. Preserve and prove offsite backups,
encrypted escrow, recovery and data integrity first.

C4. Controlled production cutover of Compose project directory and uploaded
assets, keeping the original named volume sanq-app_pgdata and existing data.
Do not create/reset a PostgreSQL volume. Observe uploads during cutover,
reconcile counts/ownership, verify API/worker/Web/readiness and backup.

C5. MCP producer/consumer decoupling and production source checkout cleanup.
Do not delete /home/ubuntu/sanq-app or its .git while the existing production
MCP still depends on Git status/log/search/show there.

C1-5 each require review and explicit authorization where they change
architecture/privilege or production behavior. Source-only staging alone
does not authorize runtime cutover.

## C0 implementation

Add ops/runtime/inspect_layout.py: read-only, standard-library-only inventory.
It uses lstat (does not follow final-component symlinks), checks path
types/permissions and expected static source contracts, and optionally
inspects known host systemd/helper/sudoers/MCP/assets paths. It NEVER opens
.env, TLS keys, upload files, backups, rclone auth, or live database.
It reads tracked non-secret Compose/backup source templates only.

From a production main checkout **after separately authorized deployment of
this read-only helper**:

    python3 ops/runtime/inspect_layout.py --host

The JSON includes per-check metadata, blockers and remaining manual evidence.
It ALWAYS reports readyForProductionDirectoryCutover=false regardless of
preflight results. It does not launch Docker, use GitHub credentials, move
directories, edit config, restart containers, touch database or write files.

CI adds offline tests with temporary fixtures to verify missing/symlinked
paths, source contract drift, group/world-readable .env detection, and
avoiding secret-value disclosure. No local tests executed before user review
per AGENTS.md.

## C0 exit condition

This slice establishes an auditable migration entry gate, not a decision
to move data. Before C1/C2, audit actual VM stdout JSON and separate
privileged/read-only operator evidence for Compose project identity,
mountpoint provenance, backups, MCP systemd entrypoint, data transfer
safety, Nginx/TLS handling and rollback.
