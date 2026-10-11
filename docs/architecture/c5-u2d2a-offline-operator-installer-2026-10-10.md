# C5-U2D-2A — One-shot Root-private Operator Handoff Kernel (offline only)

**Status: LOCAL IMPLEMENTATION / REVIEW REQUIRED / NO PRODUCTION INSTALL AUTHORITY**  
**Date: 2026-10-10 (America/Toronto)**  
**Base:** `origin/dev` at `7fe23fbb0b065dee467852582a6a044c782ec07a` (U2D-1 PR #2780, CI #7141 green). Worktree `audit/c5-u2d2-installer-readiness`, including the earlier untracked U2D-2 architecture audit.

## 1. Explicit approval and boundary choice

The user explicitly authorized **U2D-2A one-shot root-private installer development responsibilities** (option A) and the path-semantic dynamic file policy: preserve `.env`, application release-state and C4 marker **bytes, uid/gid and mode**, while a genuine directory exchange may change their active-path inode identities. This is a **development** authorization, NOT a grant to run privileged installation, change active `/opt/sanq/runtime`, stop the backup timer/MCP, change Docker/data or deliver remote PR without review.

Existing C4/P2-A disallowed a persistent Root Launcher and symlinked active Runtime; U2D does **not** restore either. The 17 member allowlist remains untouched, and no code is added to the published Runtime Archive. Runtime update and app image deployment remain separate owners.

## 2. Implementation delivered in this local slice

`ops/runtime/offline_root_private_installer.py` is a **real Linux filesystem-transaction kernel constrained to an explicit disposable laboratory root**. It does not expose a CLI, public production installer, sudo, network or service-control interface. Its guard requires a non-symlink, caller-owned mode-0700 **direct child of /tmp** with prefix `sanq-u2d2a-lab-`, exact root-owned or current-operator-owned marker `.sanq-u2d2a-lab-only`, and five 0700 fixture directories: `live`, `stage`, `retained`, `recovery`, `proof`. The live target in the lab is `live/runtime`; **`/opt/sanq/runtime` is refused even if the process happens to be root**.

The independent original compressed Archive is read from `proof/target.tar.gz` and its exact bytes are SHA256 bound to a separately provided `archive_verifier` callback. The callback is **test-injected and deliberately untrusted in this offline slice**; a future production-grade component must bind this port ONLY to the trusted, independently audited GitHub publication/provenance implementation after root-private copy and fresh verification, not to an operator-provided boolean. Existing `validated_archive_files()` checks actual tar.gz members against source SHA, frozen 17 files, paired image digest and manifest content; the kernel builds a **fresh candidate tree from the archive**, not from previously writable staging output.

Transaction ordering:

1. Deny non-lab roots, symlink/special/hardlink/untrusted owner and mode, stale journal/occupied slots, non-matching source SHA or unchanged 17-member source; exclusive nonblocking `flock` and recheck.
2. Validate the installed lab `live/runtime` 17-file manifest, source bytes/mode/owner and three dynamic file values. In real root fixture mode, `.env` must be ubuntu-owned 0600, root-owned app state 0600 and root-owned C4 marker 0644. In GitHub's non-root CI fixture, both identities are represented by the same unprivileged test user; **this is not a substitute for an isolated root-mode verification**.
3. Strictly authenticate synthetic original Archive and build a fresh full `stage/candidate` tree, copying **independent** dynamic file bytes with original uid/gid/mode. Build a separate full `recovery/preimage` from installed old source. Preserve old source file modes; reject aliases/inode reuse across the three trees. Fsync created files and their directories.
4. Record new transactionId, old/new Runtime source SHA and application current SHA into a root-private-format **PENDING_EXCHANGE** Journal using exclusive next-file, fsync, replace and parent fsync; **no changes to app release-state**.
5. Reverify old+new trees, execute **one** `renameat2(RENAME_EXCHANGE)` with separate parent directory fds for `live/runtime` and `stage/candidate`; fsync both parents and reverify full old/new member inventories and dynamic file bytes/modes.
6. Durably move the retained old Runtime from `stage/candidate` to `retained/previous` using `renameat2(RENAME_NOREPLACE)` (not an overwrite-capable `os.rename`); write `EXCHANGED_UNCONFIRMED` and `PREVIOUS_RETAINED` Journal phases, syncing each boundary.
7. Return only `lab-only-manual-verification-required` with `readyToInstall=false`, `authorizedToMutateProduction=false`, `automaticRecovery=false`, `manualRecoveryRequired=true`. Any unexpected interruption retains candidate, previous, journal and recovery snapshot for **manual inspection**, with no self-resume/automatic rollback or automatic cleanup.

The read-only `inspect_offline_operator_incident()` compares persisted journal phase with actual lab trees and independent preimage; recognizes before_exchange, after_exchange and previous_retained. It denies an advanced journal phase with an earlier filesystem state, refuses ambiguous/missing retention or drifted dynamic bytes and offers **no repair**.

## 3. Test cases (written but not run locally)

`ops/runtime/tests/test_offline_root_private_installer.py` uses the standard-library unittest discovery already running under `.github/workflows/ci.yml`'s API Runtime offline gate.

- One successful **cross-parent-fd** exchange; active candidate, retained old inode, separately copied snapshot, unchanged `.env`/state/C4 bytes, inode independence and no automatic replay.
- Six exception-injection interruption windows around pending-journal, syscall, journal transition, prior retention and final durable state; incident read-only classification and repeat-run refusal.
- Synthetic provenance/release digest rejection, corrupt archive rejection, identical old/new source change rejection before candidate creation.
- Non-lab root, symlink, world-writable fixture, forged marker, preexisting recovery slot, concurrent `flock`, unexpected file owner/mode/state, source hardlink/symlink and Journal corruption rejection.
- No network, Docker, root privilege escalation or production file operations.

**Validation status:** No local tests/lint/build were run in the default MCP workspace, per `AGENTS.md`. GitHub Actions has not run on these uncommitted local changes; user review and explicit remote delivery authorization are required first.

## 4. Limitations and NOT-YET-IMPLEMENTED production gates

This kernel is **NOT a runnable production installer**, despite implementing one-shot filesystem transaction mechanics. It lacks a production operator entry, reviewed/external installer-source artifact provenance and root-private placement, true root-mode file/ownership validation, root-only pinned release publication verifier binding, independent old Archive attestation, application/backup helper compatibility proof, process-wide MCP/backup/Deploy quiescence barrier, fully fd-anchored TOCTOU-resistant traversal and stronger cross-process active-writer detection. It does **not** establish service restart correctness, recovery after forced SIGKILL/power failure, immutable off-VM old snapshots, or production rollback safety.

The `/tmp` guard is permanent for this slice; do **not** remove it or replace it with a caller-provided production path without a new reviewed implementation and separate approval. Future U2D-2B verifies SIGKILL/mount/root-mode behavior on an independent isolated host, adds stronger real-file directory-fd trust checks and inspect-first recovery; U2D-2C performs separate target-main SHA/provenance, maintenance/compatibility audit and production approval before any live handoff.

**Exit: `U2D-2A LOCAL INERT-TO-PRODUCTION / OFFLINE TRANSACTION CODE READY FOR REVIEW / PRODUCTION INSTALL BLOCKED`.**
