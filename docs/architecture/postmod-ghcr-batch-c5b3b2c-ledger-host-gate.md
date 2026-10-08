# C5-B3B2C — Cross-transaction Ledger model and trusted-host read gate

**Status: LOCAL SOURCE / REVIEW PENDING / NOT PRODUCTION READY.** Based on latest `origin/dev` after B3B2B PR #2744, merge `e547f7aaac0658dcb0e674cb0648d4d2315ec2be`.

## Why this slice is model-only

Option B authorizes the *architecture boundary* of a stable independent root-owned Launcher. It does not install an executable, grant privilege forwarding, authorize root-owned production journal writes, or permit cutover. B3B2B's untrusted preview flags are not observations; B3B1's private TemporaryDirectory only proves an isolated single-transaction write sequence. Actual host trust requires inspection of root owner/modes, no-follow ancestor walks, inode/mount substitution, physical Compose storage, retained archive bytes, actual image IDs, backup restore evidence and C4 activation status by a separately approved and installed root-owned verifier.

A host reader run from a writable Git checkout, Python import path, caller-specified root or sudo helper would expand the privileged trust boundary without an approved installation bootstrap. **Do not implement or execute that probe yet.**

## Cross-transaction Ledger model

`ops/runtime/runtime_ledger_contract.py` adds a pure, no-IO, bounded model of chained committed checkpoints. Each record carries installation ID, monotonic generation, unique transaction ID, parent record SHA256, journal content SHA256, externally supplied physical-evidence hash, transaction-derived active/previous SHA and full validated version proofs (original Runtime archive digest and two application image digests). It checks full record canonical hashes and B3A journal validity, continuity of active SHA plus exact current-version proof, uniqueness and installation identity, and rejects missing/orphan/altered generations and unresolved transaction phases. The genesis record must explicitly chain to a zero hash; **this is not a legitimate production bootstrap**.

Every output explicitly says `requiresIndependentPhysicalVerification=true`, `authorizedToMutateProduction=false`. A forged list with self-consistent hashes is still untrusted: SHA256 hash chaining detects data inconsistencies but is not a signature, secure counter, authenticated attestations or evidence of durable disk fsync. Input JSON may be fully attacker controlled. The committed checkpoint format is therefore a *candidate schema*, not sufficient production recovery truth.

`ops/runtime/tests/test_runtime_ledger_contract.py` provides offline stdlib tests for consecutive transactions, stale/mismatched hashes, duplicate transaction IDs, drift in release provenance, unresolved phase and missing bootstrap. Existing GitHub CI discovers them in `ops/runtime/tests`.

## Required production host trust gates for B3-B2D

1. Freeze an immutable externally installed Launcher artifact SHA256 and fixed `/usr/local/libexec/sanq-runtime` owner/permissions, root-only installation bootstrap, and no execute-from-checked-out code. Do not extend backup sudoers.
2. Review root-owned state and lock root `/var/lib/sanq/runtime`, allowed files, committed-pointer monotonicity across crashes and independent append-only proof retention. An operator-controlled rollback must not erase later checkpoints.
3. Independently open each trusted ancestor with no-follow, fstat inode/type/mode/UID, mount boundaries, fixed root directories and sealed release archive content. Reject unexpected symlinks/hardlinks/devices/alias mounts. No untrusted path arguments.
4. Verify historical archive bytes and matching API/Web GHCR digest pair for current, previous and target release; never trust image tag alone.
5. Verify fixed Compose project `sanq-app`, physical DB volume `sanq-app_pgdata`, `/srv/sanq/uploads` identity, backup/restore evidence and paused writers, not just caller-supplied boolean. Preserve existing `ubuntu` backup and `.env` ownership.
6. Require a manual reconciliation event signed/approved outside the pure ledger module and independently checked against actual physical fingerprints; do not treat boolean `manually_reconciled` as a credential.
7. Run a standalone isolated B3-C environment for repeat crash, interrupted state, malicious directory and wrong Docker mount scenarios before permitting production install/rollback.

## Next boundary

B3-B2D should produce a separate **read-only host verifier design and isolated-root fixture first**, with no root VM writes or production-side deployment. Production Launcher installer/executor, privileged persistence store, backup timer changes, Docker cutover and deletion of Git checkout remain separate approvals. This contract does not alter C4 or the existing deployment controller.
