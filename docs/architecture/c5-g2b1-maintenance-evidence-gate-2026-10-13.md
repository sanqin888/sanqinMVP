# C5-G2-B1 — Inert maintenance evidence gate

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**State (2026-10-13):** MERGED PR #2792 / CI #7171 GREEN / NO HOST OBSERVATION OR PRODUCTION AUTHORIZATION. G2-B2A now in separate local review.  
**Baseline:** `origin/dev@154993898862a81123b8cde29506dace924c89e2` (G2-A PR #2791 merged; PR CI #7169 green).  
**Owner:** Runtime / Ops. No deployment topology, Prisma, application or backup consumer modification.

## Why B1 is separate from privileged production implementation

G2-A established an exact historical original-Archive verifier independent
of the existing newest-release policy. G2-B must next prove a meaningful
maintenance exclusion before any root Runtime handoff. Existing consumers
include `deploy_release.py` (writes .env/release-state), the installed
`/home/ubuntu/backup-db.sh` and systemd timer/service, its Nginx protected
helper/rclone, MCP production reads and child processes with Runtime cwd,
Compose/controller operations, and interactive shell cwd/fds.

A new advisory `flock` **does not** stop these unmodified consumers. B1
therefore defines a strict *normalized evidence vocabulary* and refuses any
missing, contradictory or non-idle observations. It does **not** claim to
collect those observations or create an actual lock. Even an apparently
coherent caller record is not externally authenticated.

## Local source implementation

`ops/runtime/preinstall_maintenance_contract.py` is a **pure offline,
negative-only** contract with no filesystem, root, subprocess, network, Docker,
systemd, rclone or executable installer entry.

`review_maintenance_observation(evidence)` requires an exact v1 record:

- fixed actual Runtime root `/opt/sanq/runtime`; installed sourceSha matches
  manifestSourceSha; claimed 17-member/root-owner verification and no pending
  Runtime incident;
- settled app phase (`active` or `rolled-back`), full previous/current SHA
  and `.env`/release-state agreement; Runtime SHA and app SHA are deliberately
  **not required to be equal**;
- fixed `sanq-app` project, `sanq-app_pgdata` named DB volume and
  `/srv/sanq/uploads` bind; API/worker/Web all report same **app** image SHA,
  correct storage identities and healthy state;
- claimed operator lock and paused backup timer, inactive service, paused MCP,
  blocked Deploy/Compose writers, previously recorded timer restoration state;
- exactly zero claimed active backup processes, root protected helper,
  rclone, MCP production child calls, Deploy, Compose writers, Runtime cwd/fd
  holders and unknown consumers. Booleans do not count as numeric zeros.

Missing keys, extra authority-looking fields, unexpected type, active consumer
or mismatched SHA cause `MaintenanceObservationBlocked`. A coherent result
**still sets all** of:
`evidenceSourceAuthenticated=false`,
`crossProcessQuiescenceVerified=false`,
`externalKitVerified=false`,
`productionReady=false`,
`readyToInstall=false`,
`authorizedToMutateProduction=false`.

This record is NOT an installation token and is never sufficient for C5-G2
production-readiness signoff. No code may simply map
`observationStructurallyConsistent=true` into a privileged action.

## G2-B completion work still required (independent local reviews)

1. A fixed trusted read-only host observer, rooted in verified
   uid/gid/mount/inode and actual Docker/systemd/`/proc` state, capturing a
   before/after quiescence time window; no MCP production permission expansion.
2. A separately operator-approved maintenance entry that *actually* excludes
   all noncooperative consumers and preserves/restores exact original
   timer/service/MCP states. Existing controllers are **not** locked by B1.
3. Independently pinned, root-private one-shot installer source/sha256
   delivery review, with true root execution still disabled.
4. Original current/target Runtime Archives stored externally beyond the
   GitHub Actions 90-day artifact retention, with independent historical SHA
   seals and durable create-only retention policy.
5. Fixed encrypted `gdrive_secure:runtime-recovery/<txid>` transport,
   true create-only collision rejection, full decrypt/readback and SHA-256,
   sealed receipt, off-VM escrow of crypt configuration. No pending/incomplete
   Kit may ever authorize an active Runtime write.
6. End-to-end isolated Linux ext4 test including same-version brand-new
   reinstall from off-VM sources and repeated incident/quiescence failure
   gates before G2-C/D or any production consideration.

**Do not integrate daily backup S2 while C5 is open.** The existing
`ops/backup/protected_config_snapshot.py` S1 library is inert and its fake
remote receipt is insufficient to pass a production Kit gate.

## Test/approval

`ops/runtime/tests/test_preinstall_maintenance_contract.py` covers negative
state, source/app identity separation, exact DB/Uploads identity, each
non-cooperative consumer, false/type-coerced booleans and counts, and forbidden
authority fields. Existing CI `api-checks` discovers this test by
`python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`.

Per `AGENTS.md`, no local build/lint/tests or production action were run.
G2-B1 has passed its PR CI and merged to dev. G2-B2A adds a bounded /proc reference sensor in a **separate** local feature branch but does not establish a real maintenance barrier or Kit. Those remain **NOT IMPLEMENTED / PRODUCTION NO-GO**.
