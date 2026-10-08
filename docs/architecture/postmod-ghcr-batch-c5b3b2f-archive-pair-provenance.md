# C5-B3B2F — Inert exact historical Runtime triplet provenance

**Status: LOCAL SOURCE / REVIEW PENDING / CI NOT RUN.** Base: B3B2E PR #2747 merged dev at `2ce2d92ccac4e461e4452d93c347d634ab43b46b`.

## Scope and ownership

This slice stays within Runtime/Ops and **reuses** B2B1 `verify_historical_release`, rather than duplicating archive manifest, per-member inventory, GitHub status, publishing run and pair-digest rules. `ops/runtime/inert_archive_pair_provenance.py` accepts a strict B3A Journal, a complete mapping of archived bytes for the distinct current / previous / target SHAs and a mandatory *injected* publication metadata fetch function. It requires the exact version-key set, independently invokes the existing historical verifier for every required SHA and checks each journal version's Runtime archive SHA256 plus the API and Web image digest pair against publication proof. Missing historical archive bytes, extra archive keys, changed member inventory, missing/mismatched image digest or publishing/status mismatch fail closed. Duplicate SHAs across roles reuse one archive but all three role proofs must match.

The historical verifier itself authenticates archives against metadata returned by `fetch`; **a caller-provided fake metadata callback cannot authenticate reality**. Offline tests inject a self-contained fixture: three bundles, successful synthetic GitHub responses and deliberately tampered bytes, image digests and status records. This is contract integration, not a claim of live GitHub provenance, production publication, artifact retention or VM installation.

`verify_inert_version_triplet` has no CLI, file write, Docker command, network access of its own or execution authority. Its returned fields always keep `authorizedToMutateProduction=false`, `readyToInstall=false`, `readyToDeploy=false` and `readyToRollback=false`. The currently deployed controller, B3B1 durable test fixture, B3B2B candidate preflight, B3B2C hash-chain model and B3B2D directory test fixture are unchanged.

## Remaining independent gates

Before production root-owned Launcher execution, an approved stable out-of-tree installer must independently obtain authenticated publication metadata rather than using caller-controlled `fetch`, retain verified original archive bytes beyond Actions expiration, validate real root filesystem, actual Docker image IDs and mounts, physical PostgreSQL volume and upload preservation, off-VM restore and durable cross-transaction state. Root-owner permissions, manual recovery signature and C4 production activation still require separate authorization.

CI discovers `ops/runtime/tests/test_inert_archive_pair_provenance.py` via the existing Runtime stdlib unittest step. No local tests have been run under `AGENTS.md`.
