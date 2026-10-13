# C5-G2-B1 — Inert maintenance evidence gate

**State:** LOCAL IMPLEMENTATION FOR REVIEW / NO CI OR HOST OBSERVATION / NO PRODUCTION AUTHORIZATION.  
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
No PR/push/CI for G2-B1 until the user reviews this local diff. The real
maintenance barrier and Kit remain **NOT IMPLEMENTED / PRODUCTION NO-GO**.
