# C5-U2C — Production Runtime consumer dependency audit (read-only)

**Date:** 2026-10-09 America/Toronto / 2026-10-10 UTC  
**Status:** SOURCE-DEPENDENCY AUDIT COMPLETED / INSTALLED RUNTIME INTEGRITY PASS / SAME-FILESYSTEM ATOMIC EXCHANGE PASS / PRODUCTION INSTALL NO-GO  
**Baseline:** `origin/dev` after C5-U2C readiness PR #2778, merge `ddc3005930aebd4f01785ed53534c3204ec14e85`. No production writes.

## Confirmed live state (read-only MCP)

At 2026-10-10 03:06 UTC: `sanq-app` API, Web, Uber worker and PostgreSQL 15 all report `healthy`. Application image tags are `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`; postgres container remains separate. `system_status` reports Docker and `sanq-mcp-tunnel` active, 37 GiB disk available, 547 MiB memory available. These status tools do **not** attest actual bind-mount identities, the installed Runtime archive digest, timer state, process file descriptors, or the live installed 17-member inventory.

## Operator-provided host evidence (follow-up)

The operator ran **read-only** `systemctl show`, `findmnt -T /opt/sanq/runtime` and `sudo -n stat` from `/opt/sanq/runtime`, and supplied these results:

| Evidence | Exact observed fact | Gate |
| --- | --- | --- |
| Backup timer | `sanq-backup.timer` active/waiting; next `2026-10-10 07:30 UTC` (Toronto 03:30) | PASS at observation; must recheck during maintenance |
| Backup process | `sanq-backup.service` inactive/dead, `MainPID=0` | PASS at observation; not proof helper/other jobs absent |
| MCP tunnel | `sanq-mcp-tunnel.service` active/running, `MainPID=2388208` | NEED LIVE CONSUMER QUIESCENCE PLAN |
| Runtime backing mount | `/dev/nvme0n1p1` mounted as `/` (ext4, rw) | MOUNT TYPE VERIFIED; `renameat2` on same production FS **not tested** |
| Runtime root | uid=0 gid=0 mode=755 inode=290798 dev=66305 | PASS expected owner/mode |
| `.env` | uid=1000 gid=1000 mode=600 inode=284104 dev=66305 | PASS expected owner/mode |
| `.sanq-release-state.json` | uid=0 gid=0 mode=600 inode=284106 dev=66305 | PASS expected owner/mode; content/phase not freshly read |
| `.sanq-backup-layout-activated` | uid=0 gid=0 mode=644 inode=290926 dev=66305 | PASS expected owner/mode; marker content not freshly read |

The Runtime root and all three dynamic files share device number `66305`. This is a **same-device and metadata verification**, not an atomic-switch durability test, process-FD census, immutable-file checksum audit, or authorization to install. Production `NO-GO` remains unchanged.

## Operator-provided process and Docker-mount follow-up

The operator ran an explicitly read-only, root-assisted `/proc` cwd/fd scan and `docker inspect` of the named SanQ containers from the existing SSH session:

| Observed process PID | Name | Runtime reference | Interpretation |
| --- | --- | --- | --- |
| 2700387 | `bash` | `cwd` | Interactive operator shell started in `/opt/sanq/runtime`; **must leave this cwd before any future handoff** |
| 2759535 | `sudo` | `cwd` | Transient inspection process |
| 2759536 | `sudo` | `cwd` | Transient inspection process |
| 2759537 | `python3` | `cwd` | The transient read-only inspector itself |

The scan reported no other matching cwd or fd at the instant observed. In particular it did **not** report an active MCP subprocess, backup helper or container holding that path then. It does **not** establish that the active MCP service cannot start new production operations immediately afterward, and is not a maintenance lock.

| Container | Docker-inspected mount | Result |
| --- | --- | --- |
| `sanq-app-api-1` | bind source `/srv/sanq/uploads` | API uploads source verified |
| `sanq-app-ubereats-worker-1` | bind source `/srv/sanq/uploads` | Worker uploads source verified |
| `sanq-app-db-1` | volume `sanq-app_pgdata`, host source `/var/lib/docker/volumes/sanq-app_pgdata/_data` | Existing named DB volume verified |

This confirms the three inspected containers' data mounts do **not** bind into the live Runtime directory. It does not prove process quiescence for a future window, current backup restore evidence or the absence of other independent consumers. No service, database or mount changes occurred.

## Source-contract consumer matrix

| Consumer | Exact source and contract | Operational impact |
| --- | --- | --- |
| Backup main executable (outside Runtime) | `ops/backup/sanq-backup.service` uses `ExecStart=/home/ubuntu/backup-db.sh` as `ubuntu`; `ops/backup/backup-db.sh` sets `PROJECT_ROOT=/opt/sanq/runtime` and reads its `.env`, Compose and C4 marker; archives `.env` and `docker-compose.yml` with `tar -C $PROJECT_ROOT` | Backup must be fully quiescent before exchange; pausing timer alone does not stop an already running service. A mixed pre/post-exchange config archive or backup scan must be prevented |
| Privileged protected Nginx backup helper | `ops/backup/sanq-backup-protected-nginx` validates directory `/opt/sanq/runtime` and C4 marker; called by main backup through narrowly scoped sudoers | Helper could access active path while swapping; no concurrent helper can run. No sudoers expansion |
| Deployment controller | `ops/release/deploy_release.py` requires exact `Path.cwd()==/opt/sanq/runtime`, manifest/17-file checks and dynamic `.env`/release-state; Compose commands inherit Runtime project directory | No concurrent deploy/rollback/planning command during Runtime handoff; verify the controller's working directory and open inode references before resuming |
| Readiness helper | `ops/verify-runtime-readiness.sh` hardcodes the same root and its `.env`, Compose and activation marker | Quiesce probes during cutover; post-handoff use reviewed newly installed trusted source |
| MCP service and its subprocesses | `ops/sanq-mcp/server.py` sets `PROD_REPO_ROOT=Path('/opt/sanq/runtime')`; `_run_prod()` launches subprocesses with `cwd=PROD_REPO_ROOT` | Merely pausing deployments/timer is insufficient: active read-only MCP requests can hold the previous Runtime inode, leading to old/new observations. Introduce explicit maintenance exclusion, or prove MCP production calls are inactive |
| Docker Compose | `docker-compose.yml` names project `sanq-app`; the operator's live `docker inspect` verifies API/worker binds to `/srv/sanq/uploads` and DB volume `sanq-app_pgdata` | Container data mounts are independent of the host Runtime source directory; no automatic recreate is permitted. Repeat mount verification at the installation gate |
| Backup timer and service manager | C4 P2-C docs describe `sanq-backup.timer` and `sanq-backup.service` managed externally in systemd | Confirm installed unit/timer contents, active state, next trigger, pid and recent completion from host, not only repository templates |

## Newly explicit race/blockers

1. **Backup archiving is a mixed-version risk.** `tar -C /opt/sanq/runtime .env docker-compose.yml` can observe different directory versions if run during handoff. Block the *running service* and protected helper, not only its timer.
2. **MCP read-only calls are consumers.** `docker_status`, `read_file`, source searches and other production reads may run with old Runtime cwd while the path is exchanged. Coordinate a maintenance barrier for all production-MCP operations; source-root vs installed Runtime is not a universal immutable pointer.
3. **Dynamic file inode identity is unresolved.** Swapping complete directories replaces the inode of active `.env`, `.sanq-release-state.json` and C4 marker at the pathname. U2B checks synthetic bytes/mode/owner, not real opened file descriptors, ubuntu ownership or live readers/writers. An operator must approve an explicit quiescence-and-inode strategy; do not silently assume byte parity is sufficient.
4. **Proof of filesystem atomic exchange is missing on /opt.** U2B /tmp CI proves only a different filesystem and in-process fault injections, not production crash durability, on-mount feature support or absence of active /proc descriptors.
5. **Trusted privileged installer does not exist.** The inert U1/U2A/U2B files must never be run as root against production, nor copied into 17-member Runtime as undeclared trusted source. Neither direct controller overwrite nor runtime manifest checksum edit is allowed.
6. **No evidence of active recovery from interrupted production handoff.** Previous archive and full matched Runtime snapshot must be frozen, verified and retained independently before any installation window.

## Host-only evidence required (operator read-only, sanitized)

- `systemctl show sanq-backup.timer sanq-backup.service sanq-mcp-tunnel` selected safe fields: ActiveState/SubState/MainPID/NextElapse and exact ExecStart executable path only. Verify backup job not active or already executing before any future quiescence window.
- `findmnt -T /opt/sanq/runtime` and device/inode metadata for `/opt/sanq` and Runtime (no write probe yet).
- Read-only root inspection of actual `runtime-release.json` and 17 file bytes (compare SHA256/length/owner/mode only; do not expose `.env` content); 3 dynamic file owner/mode/inode plus release phase/sha without other secrets.
- **Initial bounded `/proc/*/cwd` and `/proc/*/fd` scan completed:** only the operator shell and three inspector processes matched. Must rerun under an exclusive maintenance barrier; coordinate MCP and shell cwd.
- **Operator `docker inspect` completed:** API/worker bind sources `/srv/sanq/uploads`, DB named volume `sanq-app_pgdata`. Image tags and health separately observed with MCP; recheck complete identity as part of installation preflight.
- Fresh last successful automated backup and independent external recovery evidence; U2C must not assume C4 historical evidence is newly tested.

## Installed Runtime integrity audit — OPERATOR VERIFIED (point-in-time)

The production installed `runtime-release.json` is generated as part of the trusted Runtime Archive, not a tracked GitHub repository file. The current MCP `read_file` endpoint is GitHub-backed and returned a repository HTTP 404 when asked for that filename; this is **not** evidence that the installed file is absent. No host-wide file read has been performed by the assistant.

Before any same-filesystem write probe, operator supplies a **sanitized, read-only** audit of `/opt/sanq/runtime` with the exact source-pinned 17-path list from `ops/runtime/build_bundle.py`, rather than trusting the manifest's own member list. Minimum requirements:

1. Confirm `/opt`, `/opt/sanq`, and Runtime root are real, root-owned directories without group/world write permissions and no symlinked ancestors of protected member files.
2. Confirm root-owned manifest is a regular, <=16384-byte, non-group/world-writable JSON file with `schemaVersion=1`, `sourceBranch=main`, `productionActivationAuthorized=false`, valid 40-character source SHA, exact `SOURCE_FILES` set, and historical API/Web image refs + digest syntax. A correct manifest is self-consistency evidence only, **not independently authenticated archive provenance**.
3. Read all 17 actual protected files, requiring regular files owned by root, no group/world write bits, each <=2 MiB, matching Manifest `bytes` and `sha256`.
4. Confirm `.env` is ubuntu-owned 0600 and contains **exactly one** valid `SANQ_IMAGE_SHA`; do not echo its contents. Confirm release-state is root-owned 0600 with `schemaVersion=1`, `phase=active`, valid `current` and `previous`; `current` must match the .env value and observed running image SHA.
5. Confirm C4 marker root-owned/non-group/world-writable, exact `SANQ_BACKUP_LAYOUT_C4_V1` content. Only output counts, statuses, and the non-secret SHAs, not secret data or dynamic file byte hashes.
6. The installed Runtime Manifest source SHA **may differ** from the current running image SHA: the controller explicitly supports unchanged Runtime sources during later image-only releases. Do not falsely require equality of these two SHAs.
7. Record resulting metadata and version labels as a **point-in-time** observation; re-run under future maintenance lock. Treat failure as BLOCKED, and never repair the manifest, change .env, restart containers or launch the deploy controller as part of this read-only audit.

### Submitted integrity-audit result — 2026-10-10 03:43:10.618622 UTC

The operator ran the previously reviewed **read-only** host-side Python audit and supplied:

| Evidence | Observed output | Interpretation |
| --- | --- | --- |
| Overall | `RESULT: PASS` | The offline inventory-and-consistency checks completed |
| Protected members | `17/17` | SHA256, bytes, file type, root ownership and write bits matched the installed Manifest |
| Manifest source SHA | `a84b72007e6b4e82c981101e56c897355757c0ff` | Trusted Runtime file-set version claimed by installed Manifest; not an independent original-publication proof |
| `.env` and release-state current SHA | `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | Matches prior independently observed Docker application image tags |
| Release phase | `ACTIVE` | Current production state was verified as ACTIVE at observation |
| Previous SHA | `a84b72007e6b4e82c981101e56c897355757c0ff` | Historical application rollback identity recorded by release-state |
| Dynamic-file permissions | `PASS` | `.env` ubuntu:ubuntu 0600; root-owned release-state; no group/world write |
| C4 marker | `PASS` | Marker exact content/ownership/permissions validated |

**Gate status: `INSTALLED RUNTIME INVENTORY / CURRENT RELEASE STATE — POINT-IN-TIME PASS`.** The installed Manifest SHA being earlier than running-image SHA is **expected and permitted** for image-only releases with unchanged Runtime members. Neither the operator's audit nor this record independently re-authenticates the old GitHub archive bytes/digests, tests an executable installer, or authorizes a live Runtime switch.

Remaining blockers: exact target `main` archive/API-Web digests; actual trusted root-private installer and immutable previous snapshot; maintenance exclusion for backup/MCP/deploy and operator shell cwd; **real crash/power-failure durability and journal recovery evidence** (distinct from the now-verified same-filesystem syscall support); live dynamic-file inode/release-state preservation; explicit manual recovery runbook and separate production approval. Do not infer production installation readiness from either PASS.

**This scratch-only test has now been completed with separate explicit authorization.** No active Runtime exchange was authorized by it. Next production writes (even other probes) need separate approval.

## Controlled same-filesystem atomic-exchange probe — OPERATOR-EXECUTED PASS

The operator explicitly authorized **only** a dedicated root-private scratch-directory `renameat2(RENAME_EXCHANGE)` test on the production VM's `/opt/sanq` filesystem, with no active Runtime, service, backup, DB, image or upload changes. This is narrower than permission for a real Runtime install.

The SanQ VM MCP retains read-only production access. The operator, using SSH, executed the separately authorized scratch probe; all test evidence below is **operator-supplied host output**, not a command run by this assistant or MCP.

The proposed test shall:
1. Verify real root-owned `/opt/sanq` and `/opt/sanq/runtime` on the same st_dev; never use or rename the active Runtime.
2. Create a unique root-owned mode-0700 `/opt/sanq/.sanq-u2c-renameat2-*` directory, only two fixed test subdirectories and non-sensitive sentinel files.
3. Fsync sentinel files/directories, perform a same-parent `renameat2(RENAME_EXCHANGE)`, fsync the parent, and verify directory inode identities and sentinel contents exchanged. Repeat the exchange to restore the original layout, then verify the reverse transition.
4. On success, remove only the exact two owned sentinel files and their known scratch directories after exact-type/inode/content checks; do not use recursive deletion. On failure, fail closed and preserve the scratch directory for explicit operator inspection.
5. Record exact test UTC time, filesystem device, `renameat2` result and cleanup status. Passing proves the syscall is supported on the observed filesystem, not sudden power-loss crash durability, live inode preservation, trusted archive provenance or production activation readiness.

### Operator-supplied scratch-test results — 2026-10-10 03:51:36.736277 UTC

| Test output | Observed value | Gate |
| --- | --- | --- |
| `Atomic exchange` | `PASS` | Native `renameat2(RENAME_EXCHANGE)` succeeded on two disposable sibling directories |
| `Reverse exchange` | `PASS` | Directory entry inode identities and sentinels restored correctly |
| `RESULT` | `PASS` | Probe assertions completed |
| `Same device` | `66305` | Matches previously recorded production Runtime and dynamic-file st_dev |
| `Cleanup` | `PASS` | Exact owned sentinel files and test directories removed by the test script |
| UTC | `2026-10-10T03:51:36.736277+00:00` | Point-in-time evidence |

**Status: `SAME-FILESYSTEM ATOMIC EXCHANGE — POINT-IN-TIME PASS / PRODUCTION INSTALL BLOCKED`.** The probe tested inode/content exchange and restoration in separately authorized scratch directories, not the active Runtime. This confirms operational syscall support on the production ext4 filesystem at test time, **not** crash consistency under kernel panic/power loss, concurrent process quiescence, preservation of production dynamic-file inodes, or an independently authenticated trusted installer.

No permission was granted to modify `/opt/sanq/runtime`, start/stop services, deploy images or clean any historical recovery assets.

## Recommended next gate

**Remain NO-GO.** The installed Runtime integrity, mounts, backup-service idle state at observation, process/fd snapshot, and on-filesystem atomic-exchange capability are now verified to their stated limits. Next freeze a root-private one-shot operator-controlled installation/rollback *design* with explicit quiescence, trusted publication evidence, immutable snapshot, journal and manual recovery; independently test its failure cases before a separately authorized live switch. Any privileged installer or new ownership/scope requires separate architectural approval. No active Runtime, state, container, backup timer or live application files were modified by the scratch probe.
