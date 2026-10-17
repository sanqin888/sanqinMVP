# C5-U2D — Abort & Clean Reinstall / Recovery Kit architecture amendment

**Status: OPTION 2 PRIMARY + OPTION 1 SUPPLEMENTARY / S1 MERGED CI GREEN / C5-G2-A LOCAL REVIEW / NO PRODUCTION INSTALL AUTHORITY**

> 2026-10-11 S1 implementation record:
> [Protected Config Snapshot / old-plan retirement](./c5-u2d-s1-protected-config-snapshot-2026-10-11.md).
> S1 merged as PR #2789 / dev merge 7723262e (CI #7164 PR and #7165 dev green).
> C5-G2-A is now a **separate local review** of historical archive provenance
> and production authorization contracts. See
> [G2 architecture contract](./c5-g2-trusted-runtime-contract-2026-10-13.md).
> No sudoers, backup service, live Runtime or production install is authorized.  
**Date:** 2026-10-11 (America/Toronto)  
**Read-only baseline:** `origin/dev` `ffae689ec332d0499cefd9957273f6635041780d` (PR #2785 merged).  
**Change type:** Explicitly proposed recovery-policy and backup-contract change; no implementation or production authorization is inferred from this document.

> **2026-10-17 documentation-only navigation:** prior U2D design, 2B2-B root-lab evidence and the retired 2B2-C cold plan are consolidated in [Runtime historical decisions and evidence](./Runtime历史决策与证据索引.md), including their fixed-version originals and explicit limits. [Inherited Runtime constraints](./Runtime交付与安装约束.md) preserve the surviving rules. This adds no implementation, acceptance PASS or production authority.

## 1. Decision requested and unchanged objective

The operator's preferred policy is **Abort & Clean Reinstall**: if host power loss, process crash or another exceptional interruption occurs **during Runtime installation/update**, abandon that installation transaction outright. Do not resume the prior transaction, replay intermediate journal phases, auto-rollback the application/database, or require restoration of the exact prior filesystem-transaction execution point. After independent inspection and authorization, reconstruct a complete, trusted Runtime **from external GitHub/GHCR publication material and encrypted off-VM recovery configuration** in a new private location, then install and verify it as a **new transaction**.

This is a manual incident-recovery tradeoff: longer downtime is acceptable for an exceptionally rare event; silent unattended repair is not a requirement. **An ordinary VM restart outside an active Runtime installation is NOT a trigger for mandatory Runtime reinstall.** Application deploy/rollback remains under `ops/release/deploy_release.py`.

Retain the original C5 final objective: an operator-triggered, controlled one-command GHCR application release path with no production `/home/ubuntu/sanq-app` source checkout dependency, and separate approval for Runtime source updates. No new permanent root launcher/daemon, open sudo interface, symlink-based active Runtime, arbitrary MCP root execution, or application/database cutover is proposed.

This amendment is the **proposed prospective recovery contract**. The earlier U2D installer design, 2B2-B isolated root evidence and U2D-2B2-C cold-power-loss plan remain historical records; no earlier `PASS`/`NOT EXECUTED` is rewritten. The proposed replacement of C2-C2's default three-checkpoint forensic gate takes effect **only after explicit architecture/acceptance approval**.

## 2. Existing facts versus requested additions

| Area | Verified repo/current contract | Proposed addition; NOT deployed |
| --- | --- | --- |
| Daily scheduled backup | `sanq-backup.service` executes `/home/ubuntu/backup-db.sh` as `ubuntu`; project-config tar currently contains **only** `.env` and `docker-compose.yml` and uploads to `gdrive_secure:config` | Include independently validated root-only release state and C4 marker in a safe daily configuration snapshot |
| Dynamic identities | `.env` is ubuntu:ubuntu `0600`; `.sanq-release-state.json` root:root `0600`; `.sanq-backup-layout-activated` root:root `0644` | A restricted root component is required to read the protected state; **never** broaden permissions to make `ubuntu` read it |
| Runtime publication | Strict 17-member `SOURCE_FILES` + `runtime-release.json`, paired API/Web digests, independent GitHub publication status | Ensure at least one verified, durable off-VM original Runtime Archive plus its external provenance remains obtainable even after CI artifact expiry |
| Published artifacts | `publish-images.yml` uploads `sanq-runtime-<SHA>` artifact with **90-day** retention | Independent approved long-lived recovery retention / publication proof policy; do not imply GitHub artifacts are perpetual |
| Existing U2D handoff | Lab-only `offline_root_private_installer.py` rejects unfinished journal/occupied recovery slot; no production-capable root installer | Separate, independently authenticated clean-reinstall incident path, without relaxing ordinary install's fail-closed checks |
| Off-VM crypto | `gdrive_secure` is rclone crypt, and the backup runbook documents separate encrypted crypt-config escrow | Prove the recovery operator can independently retrieve/decrypt/read back each Recovery Kit, without relying on the failed Runtime |

The production U2C point-in-time source identity was `a84b72007e6b4e82c981101e56c897355757c0ff`, with application images `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8`. **Runtime source SHA and application image SHA are different identity dimensions.** These values are audit history, not an approved future install target.

## 3. Chosen high-level direction: option 2 primary + option 1 supplementary

### Option 2 (PRIMARY): mandatory pre-install Recovery Kit

After independent operator consent for a specific Runtime source update, and **before any active-Runtime mutation**, establish a maintenance/quiescence barrier, freeze the selected versions and capture a complete off-VM `Runtime Recovery Kit`. Upload and independently **read back, decrypt and verify** the kit from `gdrive_secure`; only a matched, fresh, explicitly verified kit for the exact operation can satisfy the install preflight. A local archive, rclone upload exit 0 or remote listing alone is **not** an acceptable PASS. Failure at any step: **BLOCKED / no Runtime modification**.

Suggested logical remote prefix: `gdrive_secure:runtime-recovery/<unique-transaction-id>/`. This is a design suggestion, not an existing production directory or permission grant. A unique transaction id must prevent accidental overwrite/reuse; Google Drive/rclone storage is not intrinsically append-only or cryptographically authoritative. Record external release-source proof separately, and review write/remove permissions and retention before implementation.

The Kit must at least carry:

1. **Exact dynamic configuration bytes and metadata:** `.env`, `.sanq-release-state.json`, `.sanq-backup-layout-activated` and `docker-compose.yml`; record file type, size, owner, group, mode, timestamp, consistency checks, and protected hashes without printing secrets.
2. **Identity/compatibility record:** frozen `main` source SHA, Runtime `runtime-release.json`, exact 17-member allowlist, current/target archive digest and external seal/publication identifiers, paired GHCR API/Web image digests, actual application current/previous state, `SANQ_IMAGE_SHA` equality, fixed `sanq-app` project / `sanq-app_pgdata` volume and `/srv/sanq/uploads` bind identity.
3. **Recoverable original Runtime Archive byte stream**, either included in the off-VM kit or independently proven retrievable from an approved long-lived external source; **manifest/self-hash alone is not origin authentication**. Preserve trusted pinning for the independently delivered, root-private recovery executable, which is not a bundle member.
4. **Recovery evidence:** transaction id, source-of-truth provenance, snapshot capture/readback time, off-VM object names and immutable-in-purpose verification record, non-secret PASS/FAIL fields, and backup/key escrow retrieval prerequisites.

Production database dumps, uploads files and Nginx/SSL archives stay under their existing separate DR backup ownership; a Runtime Recovery Kit does **not** silently replace those backups or restore business data. The off-VM Kit must not store raw keys in plaintext logs, Git, status descriptions or user-visible audit reports.

### Option 1 (SUPPLEMENTARY): enrich scheduled daily configuration backup

Preserve the existing daily job's trigger, DB/Uploads/Messaging/Nginx duties and existing `gdrive_secure:config` purpose. Design a **shared restricted snapshot owner** used by both modes; daily snapshots should additionally include the exact protected release state and C4 marker alongside `.env` and Compose. Keep existing historical daily objects/retention until a separately approved policy change. The daily snapshot is an availability fallback, **not a guaranteed latest/quiescent reinstall input**.

Daily capture must fail closed on unsafe file types/modes, release state `pending`, `.env`/release-state SHA mismatch, conflicting installed/running image identity, or concurrent deploy/update, and must not overwrite the last verified backup on failure. Existing unrelated backup work should still report its own accurate result; never mark an incomplete full scheduled run successful. The shared capture component must not invent source-of-truth values or silently normalize incomplete state.

### Shared component, distinct authority

The two modes should reuse validated file enumeration, bounded FD-anchored reads, ownership/mode/regular-file checks, metadata/consistency tests, isolated archive creation, encrypted upload and remote readback logic. **Do not let the unprivileged daily `ubuntu` service read root:root `0600` state by loosening permissions.**

Audit a narrowly constrained, root-owned helper for fixed paths and fixed destination classes. Daily invocation may require a reviewed narrow sudoers entry; authorized pre-install invocation must bind to the separately approved root-private operator and transaction id. Neither entrypoint accepts arbitrary file paths, arbitrary URLs or shell fragments, expands MCP permissions, installs Runtime, or can amend deployment `.env`/state. Existing `sanq-backup-protected-nginx` is a **pattern only**, not an authorization to extend its Nginx-only sudoers scope. New helper delivery, service wiring and root trust boundary need separate approval.

The daily and pre-install modes have different concurrency requirements: a scheduled backup must coordinate or fail closed when deploy/state writes overlap; pre-install must run under a proven maintenance barrier covering `deploy_release.py`, backup service/timer, MCP processes, shell cwd/fd and Docker/Compose reads. A new advisory flock alone does not stop legacy non-participants. Freeze and double-check dynamic bytes and application identities before and after backup; full cross-resource atomicity cannot be claimed without coordinated exclusion.

## 4. Trusted clean reinstall after an interrupted Runtime transaction

1. **ABORT** the old transaction on interruption. An independent trusted operator procedure prevents re-entry, records the incident out of the untrusted active Runtime, quarantines remaining installed/candidate material for investigation, and never resumes/patches the old journal. Do not automatically delete old assets.
2. **Inspect and separate faults:** verify host filesystem health, preserved PostgreSQL/Uploads/backup identities, actual running containers and potential automatic Docker restart. If the disk/VM or business data is damaged, switch to the established full off-VM disaster recovery runbook instead. No blanket database restore on a Runtime incident.
3. **Select a coherent external recovery point:** an independently verified Kit (pre-install kit preferred; daily backup only after explicit stale-state review), exact trusted GitHub/GHCR source and digests, source/application compatibility, live or separately authenticated externally retained dynamic state. A backup snapshot may be older than Clover/Uber credential changes, release-state or running images. **Never copy outdated `.env` or guess `previous`, `current` or C4 activation from an archive.** Missing consistency proof = BLOCKED.
4. **Prepare a fresh Runtime**, from a trusted executable/source and original verified Archive in a new root-private, non-user-writable area, checking full 17-member inventory and ownership/modes. The recovery path cannot execute a script from the damaged active tree, an ordinary checkout or a writable staging path.
5. **Perform a new separately authorized install** under reviewed cross-process maintenance exclusion, without modifying `sanq-app_pgdata`, `/srv/sanq/uploads`, application images, database migrations or hosted backup records. A second interruption means abandon this new attempt and start over from external sources.
6. **Validate before closing:** active Runtime hash/manifest, dynamic config and current application identities, Compose/DB/Uploads mounts, backup helper/timer compatibility, all service health and provider/worker restart safety. Only then independently close the incident and restore the original maintenance service/timer state.

Do not equate 'a crypt-encrypted backup exists' with 'this is the latest valid production state'; integrity, provenance, recency and compatibility are separate gates. The C4 marker is **evidence of prior activation, not authority to skip C4 layout/storage checks on restore**.

## 5. Test and acceptance contract (proposed amendment, NOT a claim of PASS)

**Required before production-capable recovery implementation is activated:**

- Scheduled daily: root `0600` release-state read without permission relaxation, complete fixed-file bundle, encrypted upload + decrypt/readback, retention and failure isolation; fail closed on concurrent/pending deploy without concealing an incomplete scheduled run.
- Mandatory pre-install: source/manifest/digest match, running application-state coherence, full remote readback, expired artifact fallback, prior successful Kit preservation, remote failure/stale/partial/corrupt kit => **no active Runtime write**.
- Recovery: interruption during prepare and across active handoff, occupied prior journal/candidate, independently selected external recovery point, same-version clean reinstall, fresh secret preservation, cross-process exclusion, and repeated interruption => **new isolated transaction, never resume/overwrite**.
- Root/ownership: malicious symlink/hardlink/race, FD-safe file reading/writing, path and snapshot isolation, fixed root helper arguments/permissions, sudoers lint and refusal, authentic reviewed installer source.
- Run on a genuinely isolated Linux ext4 VM with synthetic credentials plus CI unit tests; demonstrate at least one **complete end-to-end external-source restore** without any damaged Runtime input. Demonstrate a failed/incomplete snapshot is not marked recoverable. Production source handoff and legacy checkout retirement retain independent deployment approval and verification gates.

The existing three specific cold-power-loss forensic checkpoints are **proposed to be retired from the default U2D acceptance scope**, not retrospectively marked VERIFIED. Real cold-power-loss durability is **NOT VERIFIED** unless that specific test actually runs. Alternative interruption + independent reinstall evidence proves only its actual tested behavior; unexpected on-disk states still require fail-closed handling and may require separate recovery investigation. If the project's safety owner retains physical/virtual power-loss proof as mandatory, keep it as a separate explicitly scoped gate pending approval.

## 6. Implementation readiness audit: required outputs in next conversation

Start at latest `origin/dev`, reread `AGENTS.md` and current CI, inspect `ops/backup/backup-db.sh`, protected Nginx helper/sudoers, `sanq-backup.service`, `ops/release/deploy_release.py`, Runtime bundle/trust/staging code, backup runbook, and production consumer evidence. **READ ONLY; do not implement, deploy or change production permissions during the audit.**

Produce: (a) precise owner/permission/consumer graph for daily and preflight; (b) minimal shared protected snapshot component and interfaces including exact file inventory; (c) remote namespace, credential, encrypted archive integrity/readback, provenance and retention/freshness contract; (d) lock/quiescence and release-state consistency plan; (e) how to make original Archive + metadata reproducibly obtainable beyond CI retention; (f) separate daily and preflight failure handling with exhaustive test matrix; (g) scoped implementation slices and all new privilege, external-service, and production approval gates; (h) a verifiable reinstall drill plan from external sources; (i) rollback and no-data-mutation rules.

**Do not** expand the 17 Runtime member allowlist, change Prisma/schema, the app release controller, current backup/VM services or cloud configuration during this documentation gate. Any later implementation changing external helper/sudoers or installed backup script/service must pass separate C4-style compatibility and operator installation review because those are installed outside the Runtime Archive.

## 7. Current disposition / next approval

`TR-2 S1 MERGED AND CI GREEN / C5-G2-A LOCAL REVIEW / PRODUCTION INSTALL NO-GO / S2 PAUSED`.

The S1 source was merged to `dev` only; no production helper, Runtime installation or daily-backup cutover occurred. G2-A adds separate historical-publication verification in a local feature branch, not an executable root installer. Existing U2D-2B2-C cold-power-loss evidence is still NOT VERIFIED; Mac/VirtualBox evidence may not be deleted without separate authorization. Production installation and S2–S5 remain independently gated.
