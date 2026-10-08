# Post-modularization Runtime / GHCR worklog supplement

Primary `modularization-worklog.md` exceeds the MCP workspace patch-size limit. This owner supplement records the C5 batch without truncating/replacing the original timeline.

## 2026-10-08 — C5-B3B2K signing trust-root readiness

**LOCAL READINESS AUDIT / USER REVIEW PENDING; NO CODE OR CI CHANGES.** B3B2J PR #2751 merged dev `4d847e8e` with 7 green CI jobs. Compared proposed offline Ed25519, externally managed KMS/HSM and CI keyless provenance; formalized independent pinned trust root, policy rollback prevention, key rotation/revocation, package retention and manual root operator gate. No crypto/signing infra or privilege implemented. See `docs/architecture/postmod-ghcr-batch-c5b3b2k-signing-trust-readiness.md`.

## 2026-10-08 — C5-B3B2J inert Launcher claim validator

**LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN.** B3B2I PR #2750 merged dev `4a1ce560` with all seven CI jobs green. Added pure untrusted publication claim shape, domain/bytes/checksum, policy/expiry-syntax and key rotation syntax validation with offline stdlib tests. Explicitly never verifies detached signature or publisher trust and never authorizes root installation, deploy or rollback. No privileged production side effects. See `docs/architecture/postmod-ghcr-batch-c5b3b2j-inert-launcher-claim.md`.

## 2026-10-08 — C5-B3B2I Launcher publication proof contract

**LOCAL DESIGN / USER REVIEW PENDING / NO CI OR PRODUCTION CLAIM.** Based on B3B2G dev merge `d1bb76fb`; separated earlier B3B2H unmerged local documentation from this branch. Source-backed v1 Launcher publisher proof design: domain-separated detached signature, independently provisioned trust root, package/entrypoint/inventory hashes, allowed main source + workflow identity, key rotation/revocation, retention and manual root-operator bootstrap gates. Existing `publish-images` protects Runtime/image proof only; 90-day Actions retention cannot be the sole root Launcher recovery storage. No executable code, CI/workflow, dependencies or privileged host changes. See `docs/architecture/postmod-ghcr-batch-c5b3b2i-launcher-publication-proof-contract.md`.

## 2026-10-08 — C5-B3B2G independent Launcher bootstrap trust

**LOCAL SOURCE / USER REVIEW PENDING.** B3B2F PR #2748 merged dev `7b33ad9f`, CI #37770887675 all seven green. Added only pure fixed-path root-owned candidate Launcher manifest/byte digest consistency validation with stdlib tests; no trusted publisher, root-owned install, production executable or VM mutation. Detail: `docs/architecture/postmod-ghcr-batch-c5b3b2g-launcher-bootstrap-trust.md`.

## 2026-10-08 — C5-B3B2F historical Runtime triplet provenance

**LOCAL SOURCE / REVIEW PENDING.** B3B2E PR #2747 merged dev as `2ce2d92c` with all seven CI jobs green. Reuses B2B1 authenticated archive member validation and GitHub status/pair proof via injected offline fetch; requires archived exact current/previous/target bytes and two image digests. No real network or production authority, Docker, installer, migration or module-boundary change. Details: `docs/architecture/postmod-ghcr-batch-c5b3b2f-archive-pair-provenance.md`.

## 2026-10-08 — C5-B3B2E isolated evidence correlation

**LOCAL SOURCE / REVIEW PENDING / CI NOT RUN.** B3B2D PR #2746 merged dev at `c747f78e` after CI success. Pure mock-host/Ledger/archive-byte matching contract and offline tests; no production host probes, privileged installer, API/Web context imports, Docker or migration. See `docs/architecture/postmod-ghcr-batch-c5b3b2e-isolated-evidence-correlation.md`.

## 2026-10-08 — C5-B3B2D isolated host identity fixture

**LOCAL SOURCE / REVIEW PENDING / CI NOT RUN.** B3B2C merged via PR #2745 at `9bf3e9ed` after full CI. Isolated TemporaryDirectory-only directory identity/no-follow/owner-mode fixture and tests, no production host reader, root Launcher installation, Docker, DB or migration changes. See `docs/architecture/postmod-ghcr-batch-c5b3b2d-isolated-host-inspection.md`.

## 2026-10-08 — C5-B3B2C cross-transaction Ledger / host gate

**Status: LOCAL SOURCE / REVIEW PENDING.** B3B2B PR #2744 merged to dev `e547f7aa` after CI #7053 all green. Pure hash-chained multi-transaction ledger model and offline tests added; no filesystem, root privilege, Docker, installer or migration change. Real trusted host probe remains blocked on independently reviewed installed owner/bootstrap. See `docs/architecture/postmod-ghcr-batch-c5b3b2c-ledger-host-gate.md`.

## 2026-10-08 — C5-B3B2B inert root Launcher preflight

**Status: LOCAL SOURCE / USER REVIEW PENDING / NO CI OR PRODUCTION DEPLOYMENT.** After B3B2A PR #2743 merged as `a82952c5`, user approved Option B's independent root-owned Launcher boundary. Added a pure candidate preflight contract and offline stdlib tests; strict fixed path/project/volume and fail-closed B3A journal parsing, always execution-authority false. No real owner/host checks, installer, persistence writer, root privilege, Docker or C4 cutover. See `docs/architecture/postmod-ghcr-batch-c5b3b2b-root-launcher-preflight.md`.

## 2026-10-08 — C5-B3B2A authority and recovery design freeze

**Status: LOCAL DESIGN / REVIEW PENDING; NO INSTALLER, NO PROD / CI NOT RUN.** Latest dev baseline C5-B3B1 merge `454c7c33` (PR #2742). Reviewed AGENTS.md, CI, C4 runbook, current deploy/backup ownership, B2B3/B3A/B3B1 and proposed versioned Runtime contracts. Freeze specifies launcher and journal authority separation, proposed fixed root-owned state/layout, cross-transaction continuity, historic archive+two-image-digest rollback and fail-closed recovery. Explicit architectural approval required before production writer/launcher implementation: `docs/architecture/postmod-ghcr-batch-c5b3b2a-authority-recovery-freeze.md`.

## 2026-10-08 — C5-B3B1 offline durable Journal and locking fixture

**Status: LOCAL SOURCE / REVIEW PENDING.** Branch `feat/ops-runtime-durable-journal-offline-c5b3b1`, based on C5-B3A dev merge `31cbfab5`; no PR/CI/deployment. Adds test-only auto-created private temporary sandbox, fsync/rename/directory-fsync sequence, exclusive flock, append-only journal generations, conservative interruption markers, strict replay and fault fixtures. Does not implement production journal I/O, installer, privilege changes, runtime files or Docker operations. No context/graph/baseline, dependencies or migration change. Details: `docs/architecture/postmod-ghcr-batch-c5b3b1-offline-durable-journal.md`.

## 2026-10-08 — C5-B3A versioned Runtime persistence and recovery

**Status: MERGED DEV / PR #2741 / DEV `31cbfab5` / CI #37737346064 GREEN / NO PRODUCTION DEPLOYMENT.** Branch `feat/ops-runtime-persistence-contracts-c5b3a`.

Adds pure Python v1 journal validation and modeled transaction transitions, fixed version directory contract, offline tests and durable persistence/recovery design. Does **not** write journal, run installer, change current controller responsibilities, alter publication allowlist, run Docker, or grant privileges. No dependency graph/scanner baseline change, migration or lockfile change.

Detailed authority and outstanding B3-B/B3-C gates: `docs/architecture/postmod-ghcr-batch-c5b3a-persistence-recovery.md`.
