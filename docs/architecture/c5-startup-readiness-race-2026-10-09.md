# C5 — Startup readiness race remediation and Runtime delivery gate

**2026-10-09 · LOCAL FIX / PR+CI PENDING / INSTALLED RUNTIME UNCHANGED**

## Production evidence and limits

The first checkout-independent GHCR release advanced application images from `a84b72007e6b4e82c981101e56c897355757c0ff` to `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` using the installed `/opt/sanq/runtime` deployment controller. CI and paired-image publication were verified, and the candidate had no pending Prisma migrations. Docker Compose recreated only `api`, `ubereats-worker` and `web`, retaining `db` and existing mounts.

Immediately after recreation, the installed `ops/verify-runtime-readiness.sh` attempted HTTP readiness while API was still starting. Curl returned `(56) Recv failure: Connection reset by peer`. The controller deliberately left `PENDING`; no automatic rollback occurred. Minutes later all four containers were healthy, full installed-Runtime readiness and public smoke checks passed, and the operator separately authorized an atomic `PENDING → ACTIVE` state reconciliation retaining the previous release. This proves application release activation and manual reconciliation, **not** a successful unattended post-switch readiness check and **not** a completed rollback drill.

An operator also verified the read-only `rollback` plan and a separate preflight of local previous API/Web images, backup freshness and previous-image Prisma migration parity. No production rollback was executed. Historical rollback image digests were **not** independently verified.

## Fix: preserve fail-closed behavior, wait for Docker health

The existing controller `ops/release/deploy_release.py` now waits for **all three application containers** (`api`, `ubereats-worker`, `web`) to report Docker health `healthy` before invoking the unchanged HTTP/public readiness helper. After asserting running-image identities and persistent storage mounts, it polls container state at bounded intervals (2 seconds, 90-second monotonic deadline). Missing/ambiguous containers, exited containers, invalid/unavailable health information or a deadline expiry block the release; `unhealthy` is never treated as ready. Existing `PENDING` incident semantics remain intact. The same post-switch verification applies to explicit rollback.

Offline regression coverage in `ops/release/tests/test_deploy_release.py` adds waiting-to-healthy, timeout, exited-container and ordering checks. No schema, Migration, dependency, Compose, HTTP API or business behavior is changed. Per `AGENTS.md`, GitHub Actions PR CI is the authoritative validation gate; no local tests have been run before review.

## Runtime installation gate and next work

**Merging this source change does not activate it in production.** The controller is included in the 17-member `ops/runtime/build_bundle.py:SOURCE_FILES` allowlist and the root-owned `runtime-release.json` checksum contract. Once the fix reaches `main`, the installed Runtime's existing image-only forward-compatibility check must **block** that new release until a separately reviewed, versioned trusted Runtime installation procedure has updated the controller, its manifest and all exact bundle bytes without broadening trust or changing database/Uploads identity.

Do not directly overwrite `/opt/sanq/runtime/ops/release/deploy_release.py`, edit its manifest to mask a hash mismatch, restart services, alter production release state or remove `/home/ubuntu/sanq-app` as part of this repository PR. A later operator-approved Runtime handoff must independently verify the published archive SHA, installation provenance, ownership/modes, full byte inventory, backup/recovery and controlled no-migration deployment; it must have a clearly reviewed failure recovery path. Do not resurrect the retired C5-B3 root Launcher/Ed25519 approach.

Remaining C5 gates: trusted Runtime update procedure and production activation of this fix; historical rollback-image Digest verification; controlled rollback/recovery evidence; complete legacy checkout consumer/mount/symlink audit; separately authorized exact-path checkout deletion. Full isolated disaster recovery remains outside this release fix.
