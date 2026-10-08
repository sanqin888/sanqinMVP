# Batch C3-A — Backup, uploads and config boundary readiness audit

Status: LOCAL IMPLEMENTATION / NOT CUTOVER READY. C2 PR #2730 merged
to dev as e0f992f1. No active VM paths have been changed.

## Current source-of-truth audit

Current backup owner is ops/backup, using a non-privileged ubuntu
sanq-backup.service and the narrow root-owned
sanq-backup-protected-nginx helper.

A single daily job covers:
- PostgreSQL pg_dump gzip with daily/monthly remote retention;
- MessagingSend rows archived separately;
- .env and docker-compose.yml packaged to encrypted gdrive_secure:config;
- privileged Nginx/TLS archive to gdrive_secure:nginx;
- uploads-current sync with uploads-history backup-dir and retention cleanup.

Uploads sync is NOT a permanently complete history: files that appear and
vanish before synchronization are not captured. The backup job is NOT an
atomic multi-resource snapshot; production restore requires cross-system
verification. Backup recovery drill was previously closed, but this does not
prove a future new path/layout is restorable.

Critical pinned paths:

| Owner | Current path | Proposed path (NOT ACTIVE) |
| --- | --- | --- |
| API and Uber worker uploaded artifacts | /home/ubuntu/sanq-app/uploads | /srv/sanq/uploads |
| Daily local backup outputs | /home/ubuntu/sanq-app/backups | /srv/sanq/backups |
| Compose and env config | /home/ubuntu/sanq-app | /opt/sanq/runtime |
| Backup service logs | /home/ubuntu/sanq-app/backup.log | separate plan required |
| Root-owned helper target | /home/ubuntu/sanq-app/backups | must be narrow/reviewed |
| Database Docker named volume | sanq-app_pgdata | PRESERVE UNCHANGED |
| Web public sounds | /home/ubuntu/sanq-assets/sounds | PRESERVE UNCHANGED |

A service/project directory change can implicitly create a distinct Postgres
volume if compose project name is changed. Keep project name sanq-app and
actual sanq-app_pgdata volume unchanged in every phase.

The Nginx/TLS helper depends on a fixed local backup directory and a root
privilege boundary: sudoers only grants
/usr/local/sbin/sanq-backup-protected-nginx with a strict dated filename.
Do NOT widen sudoers, change private key readability, or allow an arbitrary
environment-supplied destination path to the privileged helper. The rclone
crypt secrets must not be copied to the GitHub runtime bundle or logs.

## C3-A implementation

New script ops/runtime/audit_backup_cutover.py performs strictly
read-only preflight against the *reviewed tracked source files*:
- fixed backup root/locations;
- remote backup/history destinations and fail-closed upload conventions;
- restricted privileged helper and sudoers contracts;
- unprivileged service identity and existing log location;
- Compose named volume + shared API/worker uploads bind mount;
- frozen C2 v1 proposed directory paths/authorization=false flags.

It can additionally stat a small set of known host paths using --host.
No directory recursion or reading .env, archives, uploads, TLS keys, rclone
configuration or database occurs. It does not run Docker, sudo, systemd,
rclone or a migration. It always reports readyForProductionCutover=false.

After the next separately approved production source delivery, an operator
may run the read-only assessment from the reviewed main checkout:

    python3 ops/runtime/audit_backup_cutover.py
    python3 ops/runtime/audit_backup_cutover.py --host

In CI the existing ops/runtime/tests suite covers frozen-contract drift,
privilege widening, symlinks, unsafe env permissions, world-writable staging
targets and no secret-value inclusion in the report.

## Mandatory evidence before any live migration

1. Compare installed /home/ubuntu/backup-db.sh, backup.service/timer,
   /usr/local/sbin/sanq-backup-protected-nginx and sudoers to approved
   source *without exposing secrets*. The repository template alone cannot
   establish live parity.
2. Confirm last full backup and remote uploads with a real off-VM recovery
   proof. Verify DB, .env/Compose, Nginx/SSL and uploads are recoverable and
   consistent; record real timestamps and archive checksums.
3. Inspect old/new directory ownership/ACLs; plan root-only archive access
   and fail-closed ownership preservation for files/dirs and nested artifacts.
4. Stage candidate uploads outside active paths, reconcile counts, types,
   sizes, metadata and checksums, then do a final write-quiesced delta copy
   at the separately approved cutover. Never run sync against an empty new
   source to the canonical remote uploads-current.
5. Keep BOTH API and Uber worker on one persistent uploads mount. Confirm
   provider reporting artifacts and accounting attachment delivery survive.
6. Preserve previous backup scripts, installed units, privileged helper,
   sudoers and encrypted recoverable configurations for independently
   controlled backout. Do not let failed directory cutover break scheduled
   backups or silently shorten retention.
7. Revalidate true Docker compose project name and named DB volume, then
   run runtime readiness and backup restore checks AFTER cutover.

## Implementation sequencing / unresolved architecture choice

Path ownership changes affect backup authority and helper trust boundaries.
The C3-A read-only checker is within the existing Runtime/Ops scope and does
not change them. Future C3-B code that re-points backup paths or changes
sudoers/helper responsibilities is NOT covered by this implementation.

Two alternatives need separate approval:
- Low-risk: keep /home/ubuntu/sanq-app as runtime-only for now, preserve
  current backup and mounts, defer data moves.
- Target-layout: move operational config to /opt/sanq/runtime and data
  to /srv/sanq, with explicitly reviewed new backup helper/units and
  phased upload copy/cutover.

C3-A recommends preparing the target layout without changing production
backup owner until C3-B's privilege/path design is reviewed. Final cutover
belongs to Batch C4, MCP checkout retirement to C5. CI success on C3-A
does not authorize either operation.
