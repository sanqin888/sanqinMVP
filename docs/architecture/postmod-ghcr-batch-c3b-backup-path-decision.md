# Batch C3-B — Backup Path and Privileged Helper Decision

Status: **ALTERNATIVE B SOURCE IMPLEMENTATION AUTHORIZED / LOCAL REVIEW**.
C3-A PR #2731 merged to dev as 25184211697c0b421fa366c4bccc26e98ebbb28a.
The owner authorized source-only Alternative B. This does NOT authorize
installation, data movement, any privilege escalation or production cutover.

## Baseline

Inspected source in latest origin/dev: AGENTS.md, CI workflow,
ops/backup/backup-db.sh, sanq-backup-protected-nginx,
sanq-backup.service, sanq-backup.sudoers, backup tests,
ops/runtime/runtime-layout.v1.json, C3-A audit, and
the existing backup-recovery runbooks.

Production backup ownership is a User=ubuntu systemd oneshot plus a
strictly allowlisted root helper for Nginx/TLS backups. The helper writes
root:root 0600 encrypted recovery archives and accepts only a fixed dated
archive filename. It currently uses /home/ubuntu/sanq-app/backups and
gdrive_secure:nginx. The unprivileged job produces PostgreSQL dumps,
encrypted .env/Compose archives, and mirrors uploads.

Existing backup cadence, encrypted destinations, retention and recovery
contracts must not change incidentally with an absolute path relocation.

## Why C3-B requires explicit approval

| Concern | Existing path | Proposed INACTIVE path |
| --- | --- | --- |
| Config root | /home/ubuntu/sanq-app | /opt/sanq/runtime |
| Upload mirror source | /home/ubuntu/sanq-app/uploads | /srv/sanq/uploads |
| Backup destination | /home/ubuntu/sanq-app/backups | /srv/sanq/backups |
| Root helper output | /home/ubuntu/sanq-app/backups | /srv/sanq/backups |
| Backup service log | /home/ubuntu/sanq-app/backup.log | systemd journal (no new log file) |
| Compose project and DB volume | sanq-app / sanq-app_pgdata | unchanged |
| Protected backups | gdrive_secure:config/nginx | unchanged |
| Upload mirror/history | uploads-current / uploads-history | unchanged |

The root-helper output path is a privilege boundary: the helper writes
a protected archive into an unprivileged service's backup directory.
Symlinks, writable ancestors and pathname races can redirect privileged
filesystem operations. A new directory cannot be accepted merely because
its final component passes a shell symlink check.

The actual VM owner/group/ACL, filesystem mounts, installed systemd units,
timer, sudoers and offsite restore health still require host-level evidence.

## Alternatives

### A — Retain original backup and data directories

Use /home/ubuntu/sanq-app as a legacy runtime-data directory even after
the Git working tree has been retired, while the source-locked Runtime
artifact can reside independently. Keep the existing root helper,
backup paths and retained data mounts.

Pros: lowest operational risk, no privileged helper change, no live upload
transfer. Cons: legacy path names survive; target /srv/sanq layout deferred.
The .git checkout still cannot be removed until the C5 MCP ownership gate.

### B — Coordinated target layout (recommended for end architecture)

In a separately authorized source-only C3-B implementation, prepare
exact fixed, versioned paths and tests for backup owner code. Production
does NOT switch until a separate, controlled C4 cutover.

Proposed implementation after user approval:
1. Main backup script: switch fixed PROJECT_ROOT, BACKUP_DIR, UPLOADS_DIR,
   ENV_FILE consistently. No arbitrary environment-supplied destination.
   Preserve all rclone remotes, archives, retention and failure semantics.
2. Protected root helper: switch only the fixed reviewed backup output,
   preserving its strict filename, fixed TLS sources, remote destination,
   temp-rclone isolation, root-only ownership/mode and fail-closed behavior.
   Review ancestor ownership and path-swap risks: shell-only path checking
   is not proof of race freedom. Require a safer directory ownership model
   or separately reviewed dirfd-based mechanism if necessary.
3. Backup systemd service: preserve User=ubuntu, UMask=0077, the timer
   schedule and one-shot behavior. Explicitly select and test its log path.
4. Sudoers: retain the existing helper filename argument rule. Do NOT
   broaden the command or accepted parameters and do not expose TLS keys
   or OAuth credentials to the ubuntu account.
5. Keep the current Compose application topology and Postgres named
   volume completely untouched by C3-B. In C4, coordinate the API and
   Uber worker uploads mounts and the unchanged Compose project name.
6. Never install a mixed pair of backup script and root helper pointing
   to different directories. Maintain old versions for rollback.

Pros: completes future repo-free Runtime and /srv/sanq split. Cons:
higher deployment, backup recovery and privilege-boundary risk.

### C — Update only the main backup path, leave root helper old

Not recommended: splits archive/cleanup/monitoring across distinct
directories and weakens the current common backup-root contract.

## Implementation stages requiring separate authorization

B1. Source-only matching path/script/helper/systemd changes with offline
safety tests; no production rollout. Review sudoers for no widening.

B2. Manual cutover and rollback runbooks including installed-unit parity,
backup readiness, root-only TLS archive, encrypted config and uploads
restoration checks; no automatic activation.

C4. Production cutover ONLY after explicit approval, verified off-VM
restore, existing data safety evidence, host identity/permissions review,
two-pass uploads transfer with quiesced final reconciliation, matched
Compose/backup/helper/service activation and rollback checkpoint.
Do not recreate or migrate the existing sanq-app_pgdata volume.

C5. Remove production Git checkout ONLY after source and MCP boundaries
are independently rehomed and verified.

## Source implementation decisions (Alternative B)

- New absolute constants are fixed to /opt/sanq/runtime and /srv/sanq,
  never accepted from environment variables or command arguments.
- Backup service identity and timer remain unchanged; output/error
  move to the systemd journal. Historical backup.log remains under
  the legacy path until separately authorized C4 cleanup.
- /opt, /opt/sanq, /opt/sanq/runtime, /srv, /srv/sanq must be
  root-owned and not writable by group/other; /srv/sanq/backups is
  ubuntu-owned, private (0700), and provisioned BEFORE enabling the job.
  The main job must not mkdir an empty backup directory.
- New backup job checks for the installed new helper's target path
  and its root ownership before any archive, sync or retention action.
  Both scripts also require a root-owned, non-group/world-writable
  activation marker /opt/sanq/runtime/.sanq-backup-layout-activated
  with the exact non-secret content SANQ_BACKUP_LAYOUT_C4_V1.
  **C4 must create that marker only after the uploads/backup and DB volume
  parity gates pass.** Installing these templates before C4 therefore
  fails closed instead of syncing an incomplete source to uploads-current.
  This guards new-script + old-helper mismatch; C4 must still disable
  the timer during coordinated installation to prevent the reverse mismatch.
- The root helper creates and uploads its protected archive from a
  root-private temporary directory, THEN atomically moves the validated
  local copy into the shared backup directory using mv -T.
  This avoids uploading from a directory whose entries ubuntu can
  rename. Because ubuntu owns the local backup directory, it can still
  unlink/replace entries after archival; remote encrypted backup and
  independent restore evidence remain essential recovery authorities.
- Existing remote backup destinations, retention, name validation,
  root-only TLS handling, temporary rclone config isolation and
  narrow sudoers rule are preserved.
- Reviewed backup sources are included in C1's allowlisted Runtime
  release archive so a later checkout-free installation can deliver
  the matched script/helper/unit/sudoers pair.

This source-level path change is intentionally incompatible with
the currently installed legacy layout until coordinated C4 cutover.
Do not follow older backup-recovery instructions that copy new sources
onto a legacy-production system without completing C4 readiness first.

## Remaining authorization gate

Source implementation has been authorized, not production activation.
Actual backup/data path cutover still requires independent C4 approval,
verified recovery, path/ACL inventory and a maintenance window.
The C5 MCP and source-worktree retirement remain separate.
