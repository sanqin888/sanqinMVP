# C5-B3A — Versioned Runtime persistence and recovery contract

**Status: SOURCE-ONLY / NOT INSTALLED / NOT VALIDATED BY CI.** Baseline: `origin/dev` at C5-B2B3 PR #2740 (`c4b94acfc4e4ab56d63f112426ca333daee495a2`).

## Scope and owner

`ops/runtime/versioned_persistence_contract.py` defines an **inert** v1 transaction-journal decoder, strict immutable provenance bindings, deterministic path proposal, and pure state transitions. It neither reads nor writes a production journal, and does not replace `ops/release/deploy_release.py`. The C5-B2B2 planner still accepts its own v1 *planning input*, not this v1 *persistent record*. Identical schema-version numbers across those independent document kinds **do not imply interchangeability**. The old `.sanq-release-state.json` is not migrated or edited.

## Directory and retained version layout (proposed)

- `/opt/sanq/runtime`: existing **real**, root-owned directory (never a symlink). Do not replace it with a release directory symlink.
- `/opt/sanq/releases/<40 lowercase hex source-sha>`: a real directory, with fixed descendant path (never caller-chosen). Root-owned, root group; base directory mode 0755; verified release subtree directories 0555 and regular executable/non-executable files 0555/0444 as applicable. These are **policy targets**, not current file permission assertions. No mutating or chmod of production files in B3A.
- A sealed release must retain source SHA, *archive bytes*, archive `sha256:<64 lowercase hex>`, verified `sanq-api` and `sanq-web` GHCR references pinned to the same SHA and their independent `sha256:<64 lowercase hex>` digests. Verify using B2B1 external publication proofs AND original archive bytes, with inventory, type, link, traversal and content checks before trusting any installed version. Do not treat an unsigned local JSON as an attestation.
- Installed versions must be immutable after seal: recompute stored archive digest from the independently retained bytes and compare installed content against the authenticated archive manifest before every switch/recovery. Reject symlinks, hardlink aliasing to writable trees, devices, unexpected files, mount substitutions and path traversal. Preserve archive retention independent of expiring GitHub Actions artifacts.
- Keep fixed Compose project `sanq-app`, physical DB named volume `sanq-app_pgdata`, uploads `/srv/sanq/uploads`, backups `/srv/sanq/backups`. Never copy/replace DB data or uploads as part of Runtime restoration.
- The version journal should live **outside the replaceable active Runtime tree**, at a later approved root-owned, dedicated state path; propose `/var/lib/sanq/runtime/transaction.v1.json` with containing directory root:root 0700 and file 0600. This is a *new proposed contract path*, not an instruction to create it in B3A.

## Journal v1

Strict record kind `sanq-versioned-runtime-transaction`, `schemaVersion: 1`; unknown keys, missing keys, version numbers, malformed data, mixed-case SHA/digest, and unknown state fail closed.

- `phase`: `active`, `pending`, `failed`, `rolled-back`.
- `action`: `deploy` or `rollback`; `transactionId`: 32 lowercase hex digits, unique across an installation history.
- `currentSha` (at transaction start), `previousSha` (retained historical rollback candidate), `targetSha` (requested destination). Three records `currentVersion`, `previousVersion`, `targetVersion` bind each source SHA to `runtimeArchiveSha256` and exact `sanq-api`/`sanq-web` digest pair. These version records may not be omitted or guessed.
- `createdAt` and `updatedAt`: strictly canonical UTC seconds, monotonic on transition; `manualRecoveryRequired` must match unresolved state; `authorizedToMutateProduction` must remain false.
- `currentSha` means **transaction-entry current**, not a post-commit live pointer. A B3-B ledger/checkpoint format must separately define committed active/previous pointers with continuity evidence before it can run successive transactions. A `phase=active` value alone is not proof of current physical Runtime files or Docker state.
- The module validates record consistency; it cannot establish that a SHA and digest are genuinely published, archive bytes retained, Docker identity correct, timestamps authentic, transaction ID unique, or previous SHA corresponds to real verified storage. A later executor must perform those independent checks. Neither a valid record nor a pure state transition confers execution permission.
- No automatic schema migration. Unsupported versions are blocked. A future version conversion requires separate reviewed forward-only decoder, audit history and atomic upgrade protocol, not reinterpretation of old records. Never rewrite archived journal evidence.

## Allowed *model* transitions

| From | To | Condition |
| --- | --- | --- |
| pending | failed | Explicit failure recorded; still blocked |
| pending | active | Manual reconciliation evidence and independently verified successful switch required by future executor |
| pending | rolled-back | Manual reconciliation and verified exact historical recovery |
| failed | rolled-back | Manual reconciliation and verified exact historical recovery |
| active / rolled-back | any other state | Not part of this transaction; a separate new transaction is required |
| unknown, corrupted, unsupported | any | Blocked |

`pending` and `failed` refuse new normal deployment. Closing a transaction requires human sign-off and evidence **outside** the pure function; a supplied boolean is only a modeled prerequisite, not a verified signature. No automatic rollback, roll-forward, or health-dependent self-retry.

## Crash-durable write protocol for a *future separately authorized* B3-B

1. Stable external launcher, fixed compiled/allowlisted operations and root operator; refuse privilege forwarding via user-supplied file paths/commands. The `ubuntu` identity retains only existing .env and backup-file ownership where required; no sudoers widening, no new root-writable bridge owned by `ubuntu`.
2. Acquire an **exclusive, OS-held lock** on a root-owned stable lockfile outside active Runtime. Reject concurrent attempt, stale lock-path substitution and unauthorized owner. After process death, lock release is not permission to resume an unresolved journal.
3. Read exact journal bytes using no-follow/openat style traversal with inode/type, owner/mode, bounded size, schema and record validation. Check continuity against an independent monotonically recorded committed pointer and actual deployment fingerprints. Unknown/corrupt/missing journal after initial bootstrap: hard stop; no implicit blank initialization.
4. Independently verify **both** archived version proofs, persisted archive bytes, image digests, installed file inventories, C4 backup/restore evidence, stopped writers, exact DB volume identity and upload preservation. For an install, build a sealed recovery snapshot before any active change.
5. Under the lock, persist unique **pending** intent before any changes: create temp file in same parent directory with mode 0600 and root ownership, write all bytes, `fsync(temp_fd)`, `os.replace(temp, journal)`, then `fsync(parent_dir_fd)`. Keep previous committed evidence separately so crash recovery can prove which generation was durable. No cross-filesystem rename.
6. Only after durable pending may the future authorized operator begin controlled active-file switch, then container image switching and health verification. Because this spans multiple files and Docker operations, **do not call it atomic**. Record externally observable checkpoint/fingerprint before and after each operation; every interruption stays pending/failed.
7. After explicit operator reconciliation, durably commit final state using the same file and directory fsync protocol. The old live controller must not interpret a new state. Do not delete previous version/archive on commit.
8. Failure while writing temp/renaming/fsyncing, inconsistent checkpoint or lock loss: refuse execution. Following restart, require manual inspection against actual Runtime tree, container image IDs/digests, DB volume and retained archive proofs. No guessed success based on a partial JSON.

A single JSON record and `os.replace` cannot atomically commit Runtime, containers and journal. Power-loss after rename but before parent fsync is **uncertain**, even if file appears readable after reboot; require independently durable generation/commit evidence in B3-B.

## Offline fault-injection matrix

| Failure | Required response/test evidence |
| --- | --- |
| Invalid field, version, SHA, digest, image ref, timestamp | Decoder blocks; no fallback |
| Unknown/duplicate transition, backwards audit time | Transition blocks |
| Concurrent lock attempt / terminated holder | Future B3-B filesystem/lock fixture: one writer, no automatic resumption |
| Partial temp write, torn JSON, truncated journal | Block and retain raw evidence |
| Crash pre-pending fsync | No active mutation; record as aborted/uncertain |
| Crash after pending fsync, before file changes | Keep blocked; manual recovery |
| Crash after some Runtime files replaced | Keep pending/failed; inspect exact retained version |
| Crash during Docker switch or failed health check | Keep blocked; no auto rollback |
| Crash after health, before commit directory fsync | Ambiguous; no inferred active state |
| Missing historic archive, wrong archive SHA, expired evidence | Historical rollback blocked |
| Wrong DB volume, uploads, root/ubuntu owner, symlink/mount alias | Preflight hard stop |
| Duplicate transaction ID / stale committed pointer | Reject rather than overwrite |

Pure tests in `ops/runtime/tests/test_versioned_persistence_contract.py` cover journal corruption, SHA/image linkage, invalid transitions and post-failure blocked state. Real lock concurrency, fsync crash simulation, no-follow traversal, archived byte replay, container reconciliation and malicious filesystem layout are **not implemented in B3A**; require separate deterministic offline B3-B harness. CI already discovers `ops/runtime/tests/test_*.py` using Python stdlib unittest; local tests deliberately deferred.

## Follow-on

**B3-B requires separate design approval** for stable launcher owner, directory and journal locations, committed-pointer protocol, manual sign-off evidence, lock and fsync implementation, archive retention and recovery snapshot format. Keep the current controller operational until a fully separate controlled migration has been authorized and verified. **B3-C** tests crash/recovery end-to-end in an isolated environment. Production C4 cutover, backup restoration and removal of Git worktree remain separate approvals.
