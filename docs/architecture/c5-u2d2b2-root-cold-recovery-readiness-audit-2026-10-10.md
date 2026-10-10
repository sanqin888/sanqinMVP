# C5-U2D-2B2 — Root isolation, TOCTOU and cold-recovery readiness audit

**State: READ-ONLY SOURCE AUDIT COMPLETE / NEXT IMPLEMENTATION BOUNDARIES IDENTIFIED / PRODUCTION NO-GO**  
**Baseline:** `origin/dev` merge `d07ca95b22d65191c724dfddf412b848ca41d9f3` (PR #2782, CI run 38026488259, 7/7 green). Branch `audit/c5-u2d2b-root-cold-recovery-readiness`.  
**Scope:** Review only; no fixture execution, root command, VM reboot, production mutation, or existing-controller contract change.

## Accepted evidence versus open gates

- U2D-2A `offline_root_private_installer.py` implements real cross-parent `renameat2(RENAME_EXCHANGE)`, durable journal milestones, recovery snapshot, dynamic file copy, and retain-old `RENAME_NOREPLACE` only under guarded `/tmp/sanq-u2d2a-lab-*` fixtures. The GitHub runner is not proof of a root-private production install.
- U2D-2B1 `test_offline_operator_sigkill.py` has eight real child-only SIGKILL windows, including pre-parent-fsync journal/rename windows, with clean CI; it proves **process-kill** inspection and fail-closed rerun behavior on CI's Linux filesystem, not abrupt power loss.
- U2C production ext4 root mount and same-device atomic scratch test passed at one instant (device 66305), but no production Root installer is approved and no maintenance quiescence has been established.

## Source audit: issues to close before any real privileged installer

1. **Path traversal and race window:** `_source_tree()` enumerates with `Path.rglob()` and then separately `lstat()/open()`. While `_read()` uses `O_NOFOLLOW`, it does not protect intermediate ancestor directories or bind a snapshot of the whole source tree; it can read a different file after a path swap. `_build_tree()` uses path-based mkdir and writes; `_guard()` reuses path checks. **Recommended:** dirfd-walk each allowlisted component from a securely opened ancestor using `O_NOFOLLOW|O_DIRECTORY`; `fstat` identity/owner/mode/device at every step; `open(...,dir_fd=...)`; revalidate exchange slot inodes against open FDs directly before swap; deny symlinks, mount crossings and unexpected children.
2. **Root UID/GID:** `_expected_owners()` maps nonroot test fixtures to the current user; actual `.env` requires ubuntu uid/gid while release-state and marker are root:root. Need a disposable Linux VM or disposable container with distinct UIDs, an independently hash-verified operator-owned test script and all files on a throwaway virtual filesystem. **Do not** sudo execute a writable checkout or staging directory. Account for umask, ACL/xattr and old executable source modes.
3. **Incomplete provenance binding:** `archive_verifier` callback currently accepts fixture-provided `verified:true`; it is intentionally only a test seam. Production must independently pin main publish CI run, paired image digest and exact original archive hash, then copy archive to root-private storage and authenticate actual bytes again. Never treat this callback result alone as real trust.
4. **Journal/transaction durability:** U2D-2A writes journal via fsync + replace + directory sync and uses atomic directory exchange and no-clobber old retention. The SIGKILL scenarios check visible host state while kernel/page-cache stay alive; the pre-fsync cases explicitly cannot prove after-power-failure recovery. Need isolated VM block device snapshot, controlled power loss/remount, restart-time inspection from trusted media, and independent recovery from a separate durable copy.
5. **Disaster response:** `inspect_offline_operator_incident()` is a *read-only lab classifier* and cannot itself restore a version or reconcile changes to app state. An approved manual root-private restoration procedure must independently inspect original directory inode, manifest/17 member SHA, `.env` identity and running image; refuse stale old dynamic files, unknown slots and incomplete preimage; never call app deploy/rollback or DB recovery by default.
6. **Concurrency:** the exclusive `flock` only coordinates willing lab clients. The production backup timer/service/helper, deploy controller, MCP process/subprocess and operator SSH shells do not participate. A maintenance authorization and exclusion design is required; include exact pre/post control snapshots and ability to restore service/timer *original* state. This audit does not authorize stopping any service.
7. **Scope contradiction to avoid:** C4 prohibits a permanent Root Launcher and active symlink; approved Option A is an *operator-controlled one-shot design*, not a blanket permission to put code in the 17-member Runtime allowlist or expose a root execution API.

## Recommended next slices

### 2B2-A — descriptor-safe source inventory and contention tests (recommended first)

Implement a **separate offline-only** descriptor-anchored inventory helper under `ops/runtime` with exact allowlist, current `/tmp` guard, explicit ownership and inode/device metadata. Unit tests include symlinked intermediate directory, switched leaf, file hardlinks, directory inode swap, cross-device bind-like behavior (where sandbox permits), untrusted group/world-writable file, duplicate/extra files, process writer holding cwd/FD, and Journal/actual-disk mismatch. No production path input allowed.

Do not directly replace the already CI-green 2A kernel until compatible cases and behavioral equivalence are established. Reuse existing `SOURCE_FILES` and `PRESERVED` without adding a 18th file.

### 2B2-B — true root-isolated, root private operator proof

After separate test-environment approval, use throwaway Linux VM with root-only immutable fixture and true Ubuntu UID/GID, no networking/service access, verified source digest, a private scratch mount. Verify candidate/preimage exact file content, inode differences, permissions and atomic dirfd rename. Run failure injection from a disposable non-production operator path, never production VM.

### 2B2-C — cold restart/durable recovery evidence

After separate isolated power-loss test approval, use throwaway virtual disk/VM snapshots at journal-write, dir swap, old-retention boundaries, force halted guest (not production), restart read-only or clone inspect, and exercise manual old-version restoration from independently preserved snapshot. Never mark power-loss VERIFIED from SIGKILL alone.

## Decision / stop gate

**`2B2 READINESS AUDIT COMPLETE / OFFLINE FD-HARDENING NEXT / ROOT TEST HOST & COLD-RECOVERY NOT VERIFIED / PRODUCTION INSTALL NO-GO`.**

User delivery rule: local audit document only, stop for review, no remote push/PR until separately authorized. For actual production Runtime handoff, target main SHA and paired archives/digests, backward compatibility, backup/MCP maintenance exclusion, operator root source provenance and external recovery remain independent blocking gates.
