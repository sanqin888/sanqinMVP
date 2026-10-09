# SanQ backup and recovery runbook

> **Production C4-P2-C status (2026-10-09 UTC):** The separately authorized
> runtime/data cutover is complete. Active layout: `/opt/sanq/runtime`,
> `/srv/sanq/uploads`, `/srv/sanq/backups`; the backup service still runs as
> `ubuntu` with `ExecStart=/home/ubuntu/backup-db.sh`, and logs to journald.
> The legacy installation commands below are **historical, not current production
> instructions**. C4-P2-D off-VM clean restore and business acceptance remain
> PENDING; see `docs/runbooks/runtime-backup-cutover-c4p2d-acceptance.zh-CN.md`.

## Scope

This runbook is the operator contract for Post-Modularization §3.2 Backup /
Recovery Drill. Runtime/Data/CI/Ops owns the backup/restore procedure. This
work does not redesign business persistence, Accounting authority, provider
protocols, or the existing daily/monthly/uploads retention model.

§3.2 is production-verified and closed as of 2026-10-02. The Chinese operator
manual is maintained at `docs/runbooks/backup-recovery.zh-CN.md`.

The production backup job remains a User=ubuntu systemd oneshot. A single
root-only helper is used only for the Nginx/SSL archive because the Cloudflare
Origin private key is intentionally root:root 0600.

Never paste .env, rclone crypt passwords/salts, OAuth tokens, TLS private-key
contents, or decrypted protected configuration into tickets, chat, CI logs, or
repository files.

## Backup layout and retention

Current remote layout:

- gdrive_backup:sanqin-backups/database-daily — daily logical PostgreSQL dump,
  30-day retention;
- gdrive_backup:sanqin-backups/database-monthly — current-month snapshot,
  retained for seven years;
- gdrive_backup:sanqin-backups/uploads-current — current uploads mirror;
- gdrive_backup:sanqin-backups/uploads-history/<backup timestamp> — objects
  moved aside by rclone when a later uploads-current sync replaces or deletes
  them, retained for 30 days;
- gdrive_secure:config — encrypted .env + docker-compose.yml archives,
  30-day retention;
- gdrive_secure:nginx — encrypted Nginx/SSL archives, 30-day retention;
- gdrive_backup:sanqin-archives/messaging — independent MessagingSend archive.

uploads-history is not a write-ahead/WORM archive of every file that ever
existed on the server. An object created and deleted entirely between two
scheduled rclone sync runs never reached uploads-current, so there is no
remote version for --backup-dir to preserve.

## Protected Nginx backup boundary

The main backup service stays unprivileged:

- systemd service: User=ubuntu;
- main script: /home/ubuntu/backup-db.sh;
- privileged helper: /usr/local/sbin/sanq-backup-protected-nginx;
- sudoers grant: only that helper with a sanqin_nginx_*.tar.gz argument.

The helper accepts exactly one timestamped archive filename, uses fixed source
paths, fixed local backup directory, fixed rclone config, and fixed
gdrive_secure:nginx destination. It refuses to run non-root, fails if any
required recovery source is absent/empty/unreadable, creates the archive with a
restrictive umask, validates gzip integrity, and requires these members before
upload. For the upload it uses a root-only temporary copy of ubuntu's rclone
configuration so an OAuth token refresh cannot rewrite or change ownership of
the live rclone.conf:

- nginx/nginx.conf;
- nginx/sites-available/sanq-api.conf;
- nginx/sites-available/sanq-web.conf;
- nginx/certs/cf-origin.pem;
- nginx/certs/cf-origin.key.

The validated local Nginx archive remains root:root 0600 under the existing
backup directory and is covered by the normal local seven-day cleanup. The
private key is not made directly readable by the ubuntu service account.

The main backup script aggregates failures. Core export/upload/sync/retention
errors set the final job status nonzero instead of printing success merely
because a partial archive exists.

## Production installation / update

**HISTORICAL ONLY:** This installation/rollback recipe predates C4-P2-C. The
cutover is already completed; do not re-run these legacy checkout commands on
the active VM. Future upgrades and rollback require a freshly reviewed,
source-matched Runtime change plan and explicit production authorization.

Repository source files under ops/backup/ are the reviewed source of truth.
Installing or changing production files is a separate production mutation and
requires the normal user authorization after the repository PR is reviewed,
CI-green, and merged.

On the production VM, from the intended deployed repository commit, first
preserve the current operational files for rollback:

~~~bash
stamp="$(date +%Y%m%d_%H%M%S)"
cp -a /home/ubuntu/backup-db.sh "/home/ubuntu/backup-db.sh.pre-${stamp}"
sudo cp -a /etc/systemd/system/sanq-backup.service \
  "/etc/systemd/system/sanq-backup.service.pre-${stamp}"
~~~

Then install the reviewed source:

~~~bash
sudo install -o root -g root -m 0755 \
  ops/backup/sanq-backup-protected-nginx \
  /usr/local/sbin/sanq-backup-protected-nginx

sudo visudo -cf ops/backup/sanq-backup.sudoers

sudo install -o root -g root -m 0440 \
  ops/backup/sanq-backup.sudoers \
  /etc/sudoers.d/sanq-backup

install -o ubuntu -g ubuntu -m 0750 \
  ops/backup/backup-db.sh \
  /home/ubuntu/backup-db.sh

sudo install -o root -g root -m 0644 \
  ops/backup/sanq-backup.service \
  /etc/systemd/system/sanq-backup.service

sudo systemctl daemon-reload
~~~

Do not replace the existing timer schedule as part of this hardening unless a
separate timer change is explicitly reviewed.

If deployment verification fails, restore the saved main script and service
unit first, reload systemd, then remove the new sudoers/helper pair. Do not
remove the sudoers/helper while the new main script is still installed.

~~~bash
cp -a "/home/ubuntu/backup-db.sh.pre-<stamp>" /home/ubuntu/backup-db.sh
sudo cp -a \
  "/etc/systemd/system/sanq-backup.service.pre-<stamp>" \
  /etc/systemd/system/sanq-backup.service
sudo systemctl daemon-reload
sudo rm -f /etc/sudoers.d/sanq-backup
sudo rm -f /usr/local/sbin/sanq-backup-protected-nginx
~~~

Rollback changes only the backup implementation. It must not delete remote
backup objects produced before or during the attempted deployment.

## Backup verification after deployment

Before claiming the remediation production-verified, record:

1. systemctl show sanq-backup.service -p User -p ExecStart still reports
   User=ubuntu and the expected script.
2. Running the helper through the exact ubuntu sudo boundary with a valid
   sanqin_nginx_<timestamp>.tar.gz filename succeeds.
3. The resulting encrypted remote archive is independently downloaded through
   gdrive_secure: on a non-production host.
4. gzip -t passes and tar -tzf confirms all five required Nginx/TLS members,
   including nginx/certs/cf-origin.key, without printing key contents.
5. The remote archive decrypts on the recovery host using separately escrowed
   rclone crypt credentials.
6. A normal scheduled run reports systemd success only when all required backup
   tasks succeed. Any observed task failure must result in nonzero service
   status and preserved logs; do not intentionally break production solely to
   manufacture this evidence.

## Recovery order

Use a safe non-production target first. Recovery ordering is:

1. provision the replacement host/runtime and obtain the reviewed application
   commit, without starting provider workers;
2. recover protected configuration into an isolated directory and validate
   archive structure before activation;
3. restore the PostgreSQL logical dump into a clean non-production database and
   run migration/invariant checks;
4. restore uploads-current;
5. retrieve uploads-history only into an isolated history/quarantine path when
   historical objects are needed — never bulk-overlay it onto active uploads;
6. verify DB-to-file references, sizes/hashes where recorded, homepage/menu
   image references, and protected Nginx/TLS members;
7. install/activate validated runtime configuration;
8. start PostgreSQL, then API, then Web; keep provider/background workers last so
   durable work cannot replay before recovery integrity is established;
9. run readiness/smoke checks and inspect bounded logs before reopening normal
   traffic.

## Integrity checks

At minimum record:

- dump gzip integrity and source PostgreSQL/pg_dump version;
- clean logical restore exit code;
- _prisma_migrations count, unresolved migration count, and latest migration;
- critical row-count parity against the recorded backup baseline;
- zero unbalanced Accounting Journals;
- effective Accounting binary reference existence/size/SHA-256 parity;
- homepage JSON parse/version/locale/featured-slot checks;
- referenced /uploads/images/ files present and non-empty;
- uploads-current SHA-256 manifest;
- at least one independently retrieved, non-empty uploads-history object;
- secure-config archive gzip integrity and required archive members;
- Nginx archive contains both cf-origin.pem and cf-origin.key.

## 2026-10-01 to 2026-10-02 drill evidence and closeout

The 2026-10-01 drill established, on an isolated Mac recovery host:

- PostgreSQL logical backup retrieval, gzip integrity, clean restore and
  migration/Journals/count checks passed;
- uploads-current retrieval and DB/file/hash checks passed;
- uploads-history retrieval passed with 25 history-only Accounting Inbox
  objects and a readable non-empty sample;
- gdrive_secure ciphertext retrieval and cross-host rclone crypt decryption
  passed;
- encrypted project-config and Nginx archives downloaded and passed gzip
  integrity;
- the project config archive restored .env and docker-compose.yml; all six
  Compose references absent from .env were optional/defaulted;
- the active Nginx config referenced both cf-origin.pem and cf-origin.key, but
  the pre-remediation archive contained only the certificate.

Root cause of the protected-config gap: sanq-backup.service runs as ubuntu, the
key is root:root 0600, and the legacy tar command used --ignore-failed-read plus
discarded stderr. The partial archive was then uploaded and the job still exited
zero.

The remediation merged through PR #2641 / merge `52dfced9`; CI #6726 passed
the backup safety gate and all required repository checks. Production
installation then preserved the unprivileged main service while installing the
fixed privileged helper and narrow sudoers grant.

Production verification on 2026-10-01 / 2026-10-02 closed every remaining gate:

- installed `backup-db.sh` and the protected helper matched repository source;
- `/etc/sudoers.d/sanq-backup` was `root:root 0440` and parsed successfully;
- `sanq-backup.service` remained `User=ubuntu` with
  `ExecStart=/home/ubuntu/backup-db.sh`;
- manual archive `sanqin_nginx_20261001_214230.tar.gz` was produced through
  the exact ubuntu -> narrow sudo helper boundary, uploaded to
  `gdrive_secure:nginx`, independently recovered on the Mac, passed gzip
  integrity, and contained all five mandatory Nginx/TLS members including
  `nginx/certs/cf-origin.key`;
- the recovery Mac stored the rclone crypt configuration in an AES-256 encrypted
  off-VM DMG; a round-trip restore was byte-identical, exposed both
  `gdrive_backup:` and `gdrive_secure:`, and successfully decrypted the
  secure remote;
- the normal scheduled job on 2026-10-02 ran from 07:30:34 UTC to 07:31:46 UTC
  with `Result=success`, `ExecMainStatus=0`, no `❌` failure markers, and
  created `sanqin_nginx_20261002_073034.tar.gz`.

### Recovery-point and RPO/RTO limitations

The current operational cadence is daily at 03:30 Toronto time. The 2026-10-02
systemd trigger was observed at 07:30 UTC. The backup job is sequential rather
than an atomic whole-system snapshot: the database dump, project config,
protected Nginx archive and uploads sync are produced during one run but not at
one transactionally identical instant. Restore the latest coherent successful
run and re-run the integrity checks before reopening traffic.

No formal end-to-end RPO SLO is claimed by this drill. A missed or failed
scheduled run can extend the age of the last usable recovery point, and
uploads-history cannot preserve a file created and deleted entirely between two
scheduled uploads syncs.

No formal end-to-end RTO SLO is claimed either. The isolated database restore,
file/config retrieval and protected-config recovery were proven, but a complete
clean-host production rebuild through traffic reopening was not timed.

**Closeout:** Post-Modularization §3.2 Backup / Recovery Drill is
**PRODUCTION VERIFIED / CLOSED**.
