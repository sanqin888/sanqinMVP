# C5-B3B1 — Offline durable Journal and exclusive-lock fixture

**Status: LOCAL SOURCE / REVIEW PENDING / NO CI OR PRODUCTION VERIFICATION.**
Base: `origin/dev@31cbfab507a8cc83e1a10b7e52ebd9faebacbabc` (C5-B3A PR #2741).

## Boundary and ownership

This slice remains within Runtime/Ops. It does **not** change the deployed
`ops/release/deploy_release.py`, C5-B2B2 installer planner, published bundle
allowlist, Compose, root ownership, sudoers, backups, runtime paths or C4 gates.

`ops/runtime/offline_durable_journal.py` is a **test-only durability fixture**:
the class creates its *own fresh* private `tempfile.TemporaryDirectory` with
mode 0700. Callers **cannot supply a root or production path**. It has no CLI,
entry point, arbitrary file/command input, launcher, Docker calls, sudo, root
upgrade, archive deployment, runtime activation or rollback capability.
Importing it does not write files. Entering a fixture writes only its fresh
private temporary sandbox. It cannot function as a production journal store.

## Scoped transaction mechanics

- Per-sandbox exclusive `fcntl.flock(LOCK_EX | LOCK_NB)` on a mode-0600 lock
  file; no unlocked read/write methods.
- Fixed filenames: `fixture.lock`, `operation.pending`,
  `record-00000001.json` etc, `head.json`.
- A strict B3A v1 Journal is the sole payload. Every new generation is an
  append-only record; no record overwrite. `head.json` records generation,
  transaction ID, SHA256 of record bytes, modeled committed active/previous
  SHA and `requiresPhysicalReconciliation=true`.
- Record and pointer bytes are written to same-directory exclusive temporary
  files, then file fsync, rename and parent-directory fsync. Before writing
  each record, a durable `operation.pending` marker is installed; the marker
  is removed and parent fsynced **only after** successful head replacement.
  Presence of marker, orphan record, temp, corrupt JSON or stale generation
  blocks all further normal operations.
- `snapshot()` revalidates exact directory membership, strict B3A journal
  schema and full transition history, active/previous modeled pointers,
  transaction ID and the final record content hash. No implicit clean-state
  reconstruction, no auto-resume or auto-rollback.
- `begin()` permits exactly one fresh pending transaction per temporary
  sandbox. `advance()` requires the observed generation, models allowed
  phase edges, and rejects illegal transitions and unacknowledged conclusion.
  Completing a model transition still provides **zero proof** of physical
  installation or human identity: B3-B2 must obtain external evidence.

## Fault-injection tests

`ops/runtime/tests/test_offline_durable_journal.py` uses stdlib unittest
and ephemeral private paths only. It covers exclusive lock contention,
stale generations, invalid repeated transitions, malformed journal,
unexpected files, and forced exceptions at file fsync, record rename,
directory fsync, pending-head boundary and head rename. After any injected
interruption it asserts fail-closed and refuses silent retry. Tests are
intentionally not run in the default local stage; existing CI discovers them.

## Limits and next gate

This fixture does **not** solve production power-loss ordering, historical
retention, root ownership checks, symlink race across arbitrary privileged
paths, durable transaction ID uniqueness across releases, cross-transaction
committed-pointer anchoring, or independent proofs of installed bytes,
Docker IDs, physical DB volume, upload mounts and backup recovery evidence.
An fsynced JSON record is not an atomic multi-system deployment. A valid
offline checkpoint does not authorize filesystem or container mutations.

**B3-B2 / production path remains a separate approval gate.** Before any
executor or privileged persistent state implementation, review and authorize
fixed root-owned state directory and lockfile, independent signed/sealed
release provenance, retained archive bytes, unique transaction IDs,
committed-pointer continuity and recovery evidence, manual sign-off,
stable external launcher and privilege boundary. Then build an isolated
crash/restore harness (B3-C). A production C4 activation still needs
independent authorization; original Git checkout remains untouched.
