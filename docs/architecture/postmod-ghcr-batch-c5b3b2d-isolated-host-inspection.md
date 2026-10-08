# C5-B3B2D — Isolated host identity inspection fixture

**Status: LOCAL SOURCE / REVIEW PENDING / NO CI YET.** Baseline: B3B2C PR #2745 merged into dev as `9bf3e9eda6c3335321874c80bb20297f592ae54d`.

## Scope

Adds `ops/runtime/isolated_host_fixture.py`, a limited offline stdlib test facility. Each instance creates its **own fresh, private TemporaryDirectory**. The only accepted names are fixed child names `active`, `releases`, `state`, `launcher`, `uploads`, `backups`; callers cannot select or inspect a production path. Fixture construction creates these mock directories, and `inspect()` examines them read-only through directory file descriptors using `O_DIRECTORY | O_NOFOLLOW`, `fstat`, owner and mode checks and sandbox inode continuity. Reject missing/unexpected entries, non-directories, symlinks, group/world writable members and device/inode anomalies. The fixture is **not** a deployed read-only host probe, Linux mount-identity verifier, trust attestation, or root-owned Launcher. No Docker or other privileged actions are invoked.

Tests exercise valid mock layout, missing and unexpected files, bad permissions, link substitution and blocked caller-supplied paths. Existing CI discovers the new stdlib unittest. Local tests are not run at the review stage under AGENTS.md.

The result unconditionally identifies its origin as `productionHostExamined=false`, and keeps `authorizedToMutateProduction=false`, `readyToInstall=false`, `dockerAndVolumeVerified=false`, and `archiveAndDigestVerified=false`. Local-owner verification of an ephemeral sandbox **cannot establish root ownership on production**, image digests, durable cross-transaction state, physical DB volume, uploads or backup restore evidence.

## Deferred production gate

Before an executable root-owned Launcher or real host probe, freeze an independently installed artifact, no writable checkout imports, root-only state/lock locations and owner/mode contract, no-follow walk from trusted root and mount-boundary checks, exact historic archive bytes and image digests, backup/restore, manual recovery evidence, and C4 cutover approval. Production installs, root writes, state migration, Docker switches and removal of the Git checkout remain unauthorized and untouched. The next phase should combine sealed provenance and observed physical fingerprints only in a separately reviewed isolated integration harness.
