# C5-B3B2A — Production installer authority & recovery contract freeze

**Subsequent authorization (2026-10-08):** User approved Option B as a separate independent root-owned Launcher *architecture boundary*. B3B2B inert pure preflight contract is at `docs/architecture/postmod-ghcr-batch-c5b3b2b-root-launcher-preflight.md`. No installation, root filesystem writes, persistence writer, privilege delegation or production cutover is authorized by this note.

**Status: LOCAL DESIGN / REVIEW PENDING / NO EXECUTOR AUTHORIZATION.** Read-only baseline: latest `origin/dev` after C5-B3B1 PR #2742, merge `454c7c337e1a568fb29e9665d93f4bb5c4f2ee84`. This document is a **proposed freeze**, not proof that the proposed paths/owners exist on a production VM and not authorization to implement root writes.

## Current ownership confirmed by source

- Existing C4 deployment owner `ops/release/deploy_release.py` operates from real `/opt/sanq/runtime`, explicitly requires root for mutation, reads `/opt/sanq/runtime/.env` as an `ubuntu`-owned protected file, and retains `/home/ubuntu/sanq-app` checkout and `runtime-release.json` same-SHA proof. Its existing state file `.sanq-release-state.json` is **not** this proposed journal.
- `ops/backup/backup-db.sh` declares `/opt/sanq/runtime`, `/srv/sanq/backups`, and `/srv/sanq/uploads`; the backup operator is `ubuntu` and the fixed protected-Nginx backup helper is separately privileged. Its sudoers contract must not widen.
- The existing C4 runbook is **preparation and production authorization gated**; the repo cannot establish that directories, ownership or activation are already deployed on the production host. No command or installation follows from this design.
- B2B1/B2B2 verify publication / produce an inert install plan; B3A validates the strict v1 transaction record; B3B1 demonstrates append-only generations, `flock`, temp write and directory `fsync` **only within a new private temporary test sandbox**. None establishes a production transaction authority.
- No direct-import edge between API/Web/Accounting contexts is needed; the ownership is wholly Runtime/Ops.

## Proposed authority partition (requires explicit approval to implement)

| Identity/owner | Permitted responsibility | Explicitly prohibited |
| --- | --- | --- |
| Human maintenance operator | Approve exact release pair, source and target SHA, window, backup/restore evidence, recovery decision | Broad arbitrary command/path forwarding via release input |
| Root-owned immutable stable launcher outside replaceable active Runtime | After separate authorization, accept fixed verbs with validated immutable manifests; acquire lock, verify archive/storage/physical fingerprints, stage and journal updates | Execute untrusted scripts from writable checkout as root; mutate without durable pending evidence; automatic rollback |
| Root-owned state/verifier owner | Own durable journal, generation/continuity, lock, proof snapshots and transaction-id history | Trust a caller JSON alone; silently reset damaged journal; reinitialize on missing state |
| `ubuntu` backup operator | Preserve current `.env` and backups ownership and narrowly scoped Nginx helper contract | Gain new root install privileges or write privileged release code/lock/journal |
| Existing `deploy_release.py` owner | Continue current approved image-only deployments without behavioral change during transition | Parse B3 journal or become self-replacing runtime installer |

A root launcher is **a new privileged owner/surface**, not a harmless reuse of B3B1. Design alternatives: (A) retain source checkout/current image-only controller indefinitely (lowest change risk, not C5 retirement), (B) stable external manually invoked launcher with fixed executable and no sudoers widening (preferred only after authorization), (C) symlink-switch active root (rejected: violates existing no-symlink checks). Selecting (B) is a future *separate user decision*.

## Candidate filesystem contract (not installed)

| Proposed path | Function / owner / policy |
| --- | --- |
| `/opt/sanq/runtime` | Real root-owned active directory; must **never** become symlink |
| `/opt/sanq/releases/<source-sha>` | Root-owned immutable verified release and independently retained archive bytes; no symlinks, writable hardlink aliases or uncontrolled subtree |
| `/var/lib/sanq/runtime/` | New root:root 0700 independent state root (proposal only) |
| `/var/lib/sanq/runtime/transaction.v1.json` | Strict v1 journal; root:root 0600; not itself authority |
| `/var/lib/sanq/runtime/lock` | Root-owned stable 0600 OS-held exclusive lock; inode/path/owner validation before use |
| `/var/lib/sanq/runtime/ledger/` | Proposed append-only generation chain and monotonic committed checkpoint; structure/version not yet approved |
| `/usr/local/libexec/sanq-runtime/` | Candidate stable root-owned code location outside active Runtime; **not a selected install target yet** |

No relative paths, `PATH` lookup, caller-selected archive/destination, arbitrary shell fragments, `sudo` privilege bridge, writable `ubuntu` parent or implicit directory creation under production paths. A concrete package manifest and SHA256 owner must be reviewed before implementation.

## Cross-transaction state & exact historical rollback

B3A `currentSha` means **transaction-entry SHA**, not the current committed installation. B3B1 `head.json` is a single-transaction *model pointer*, with `requiresPhysicalReconciliation=true`: it cannot independently certify the active version. Thus the production format **cannot simply copy** the offline fixture.

The new durable ledger must, before executing a second transaction, prove at minimum: stable installation identity, monotonic generation, unique transaction ID across all retained generations, previous committed active/previous pointers, exact source/target archive SHA256, two independent GHCR image digests, committed record hash, external release proof reference, time-ordered intent/commit, and independent observed physical fingerprints. Committed-pointer continuity must be mechanically checked against the preceding sealed checkpoint. Unknown schema, missing/corrupt evidence, unexpected orphan/temp files, stale generation or `pending/failed` must **BLOCK** new operations and not guess a committed state.

Rollback means restoring the *exact authenticated matching historical Runtime files + API/Web image digest pair*. Merely changing an image tag is not historical Runtime rollback. Retain original archive bytes independent of GitHub Actions expiration, reject modified archive manifests and symlinks, and require manual reconciled proof of Runtime, Compose, containers and previous checkpoint. A completed logical phase alone is not confirmation that containers or files actually switched. `sanq-app` project and **physical** `sanq-app_pgdata` volume, `/srv/sanq/uploads` and `/srv/sanq/backups` are invariant; rollback must never roll back/reset PostgreSQL or uploads.

## Non-atomic activation / recovery protocol to approve separately

1. Verify an explicit maintenance ticket and recorded operator approval. Confirm installed host identity, stable launcher file owner/mode and bootstrapping trust chain, root-only lock ancestry, archive bytes, publication proof and both image digests for both versions.
2. Check the exact **live** DB mount (not only Compose text), uploads mounts and directory ancestry; validate backup success, independent restore, unchanged helper/sudoers/service/timer. Require a stopped-writers/no-write window and restore-ready recovery snapshot. Preserve `.env` `ubuntu` ownership.
3. Hold an exclusive OS file lock; validate entire transaction history and independent physical fingerprint. Durably append `pending` evidence and parent-directory `fsync` **before** changing any active bytes or containers.
4. Use only fixed-path, independently verified immutable versions. Perform an operator-approved controlled active-tree update without symlink substitution; record step-level before/after fingerprints. A sequence of file renames is **not an atomic installation**.
5. Verify the exact runtime inventory, Compose project, containers' immutable image IDs/digests, DB volume and uploads after cutover; perform manual application health verification while still in controlled window.
6. On failure/interruption, preserve intent and all raw evidence as `pending/failed`; stop writers and further deployments. No automatic retry, success assumption or rollback.
7. A separately verified and signed operator reconciliation event is required to durably append the final `active` or `rolled-back` checkpoint. The event must bind the matching transaction ID, generation, physical evidence and approved action; boolean `manually_reconciled=True` in B3A is **not** an authorization credential.
8. Restore backup operation/timer only under the **separately approved C4 runbook** and after physical validation. Never delete Git checkout, release/archive or original files as part of B3B2A.

## Fail-closed examples / validation evidence for a future isolated B3-C

| Fault | Required outcome |
| --- | --- |
| Lock busy, invalid root owner, symlink race, untrusted parent | BLOCK; no mutation |
| Tampered archive/proof, missing historical bytes, one wrong image digest | BLOCK including rollback |
| Stale ledger pointer, duplicate ID, missing committed generation | BLOCK; no self-heal |
| Crash before pending directory fsync | No active modifications; manual examination of any temp/partial evidence |
| Crash after pending commit and during file updates | Keep unresolved, compare exact active/retained files |
| Crash during Compose image switch or DB mount discrepancy | No automatic recovery; prevent second transaction |
| Crash after healthy application but before durable active checkpoint | Still uncertain; physical reconciliation required |
| Failed backup restore evidence, changed uploads/DB volume | BLOCK cutover, even when app health is green |
| Old controller sees new journal | Must not accept it as authorization or mutate based on it |

CI for any future Python sources remains the existing `api-checks` Runtime stdlib unittest discovery, plus other required repository checks. CI cannot replace a root-owned isolated crash test, verified restoration and explicit production gate.

## Decision gates / recommended slicing

**B3-B2A (this slice):** design freeze for review only. No executable source, privileged path, test fixture production reuse, deployment or schema changes.

**B3-B2B (requires explicit architectural approval):** first choose operator/root identity, launcher installation method, fixed executable placement, root state directory, append-only cross-transaction ledger and provisioning ownership; only then implement the *minimal non-executing production preflight* and offline fixture with no Docker or Runtime switching. If that design adds a new privileged owner, explain and authorize the owner boundary before editing.

**B3-B2C (separate approval):** controlled manual-only installer/rollback integration after authenticated archive retention, snapshots, C4 backup gate and no-write semantics are confirmed. Remain source-only / local review before PR.

**B3-C (independent verification):** isolated VM/container topology matching the actual volume/mounts, permission tests, repeated fault injection, clean restore and manual reconciliation; no production deployment without a distinct approval.

**Open decisions for the user:** choose (A) checkout retention or (B) root-owned stable launcher; approve/reject proposed `/var/lib/sanq/runtime` state root and launcher path; confirm archive retention and manual recovery evidence/authorizer; establish production C4 activation evidence when relevant. Until those answers are recorded, mark **NOT READY FOR EXECUTOR / PRODUCTION CUTOVER BLOCKED**.