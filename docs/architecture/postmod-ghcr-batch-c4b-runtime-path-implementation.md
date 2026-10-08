# Batch C4-B — Runtime path, deploy controller and readiness source cutover

**State:** Source-only implementation on `feat/ops-runtime-cutover-readiness-c4a`, pending local review. C4-A uncommitted source audit is intentionally included on this same branch. **No production authorization, migration or image deployment.**

## Architecture and owner boundaries

The owner authorized **C4-B option B** after the C4-A audit. These changes remain inside existing Runtime / Ops contracts; the Uber integration change is a regression-test expectation for the existing shared uploads mount, not a new Uber data owner.

Frozen target layout:

| Component | Exact target | Safety obligation |
|---|---|---|
| Compose runtime | `/opt/sanq/runtime` | root-owned directories, stable project name `sanq-app` |
| Compose `.env` | `/opt/sanq/runtime/.env` | ubuntu-owned, owner-only permissions |
| Data / API / worker uploads | `/srv/sanq/uploads` | same bind source for both app containers |
| Local recovery files | `/srv/sanq/backups` | ubuntu-owned, private directory |
| Existing PostgreSQL | named volume `sanq-app_pgdata` | never copy, delete, recreate or remap |
| Public sounds | `/home/ubuntu/sanq-assets/sounds` | unchanged |
| Source provenance checkout | `/home/ubuntu/sanq-app` | remains until separately authorized C5 |
| Backup marker | `/opt/sanq/runtime/.sanq-backup-layout-activated` | root-owned fixed content, created only in C4 |

### Compose ownership

Top-level project name is fixed to `sanq-app`. The API and Uber worker both use the absolute, identical `/srv/sanq/uploads:/app/uploads` bind mount. The DB logical `pgdata:/var/lib/postgresql/data` and project-derived existing `sanq-app_pgdata` identity are preserved. Changes to Compose are **not backwards compatible** with old production paths. They require C4's explicit data-copy and stopped-writer verification first.

### Manual deploy controller

The existing deployment controller is now bound to `/opt/sanq/runtime` for Compose, `.env`, runtime manifest and release state. It reads fresh local database backup archives only from `/srv/sanq/backups`, never builds images, runs migrations or recreates the DB service. It pins Compose arguments to the explicit project and directory.

Before any write, it verifies trusted host directory ownership/modes, required C4 marker, `.env` owner-only access, the Compose source's exact mount contract, and the bundled runtime files/checksums against the Git main checkout **at the same bundled SHA**. It checks target API/Web image digest parity against both GitHub seal and the reviewed Runtime release manifest. Live Docker container mount inspection enforces that DB actually uses `sanq-app_pgdata`, and API+worker use `/srv/sanq/uploads`.

The existing checkout is required only as a temporary C4 source authenticity gate. Git against that ubuntu-owned checkout runs **as ubuntu** even if the controller runs as root; it does not run Git configuration or diff drivers with root privileges. C5 must eventually replace this with trusted Runtime artifact attestation.

**Privilege constraint:** C3-B requires `/opt/sanq/runtime` to stay root-owned, so an unprivileged user cannot atomically replace sibling `.env` or state files. Consequently `deploy --execute` and `rollback --execute` fail unless initiated by an explicitly authorized root operator. The controller itself **never invokes sudo** and the Nginx helper's sudoers rule remains unchanged. Atomic replacement preserves the existing `.env` ubuntu UID/GID and restrictive mode. This is a new operational execution requirement that **must be explicitly reviewed at the C4 production gate**.

A read-only plan may discover a release without deploying. The controller does not install new runtime bundles itself: the target release's reviewed Runtime bundle must have been installed and verified separately, while C4 keeps the Git checkout. If the newest sealed candidate SHA disagrees with the installed Runtime manifest, any requested deployment is blocked. Rollback remains manually requested and does not mutate schema or volumes.

### Readiness

`ops/verify-runtime-readiness.sh` uses a fixed Compose project name, fixed Compose file and project directory, and only the reviewed Runtime `.env`. It requires the C4 marker and confirms that the old named DB volume exists before the ordinary read-only `prisma migrate status`, local health and public smoke checks. The controller separately verifies actual DB/uploads mounts.

## Stage gates

1. C4-B code is reviewed locally; only after explicit authorization does it go to a PR targeting dev and GitHub CI.
2. After all Batch C slices are complete, a separate release review can propose one dev→main publication; **no automatic VM deployment**.
3. C4 production cutover requires separate approval, real off-VM restore evidence, the original PG volume identity, upload checksums and paused writes, and a verified old-layout rollback. The C3-B root marker is created **only after** that gate.
4. C5 later decouples the Git-based provenance check and MCP source reads before retiring the original working tree.

## Tests / exclusions

Updated existing Uber startup Compose assertions, added offline Runtime provenance, digest, root operator and container mount checks, and updated C4 static cutover tests. CI already discovers ops/release/tests and ops/runtime/tests. No local build/lint/tests executed before review, per AGENTS.md. No npm/lockfile, database schema/migration, API/Web production business code, privileged helper/sudoers, backup service/timer, or production filesystem changes in C4-B.
