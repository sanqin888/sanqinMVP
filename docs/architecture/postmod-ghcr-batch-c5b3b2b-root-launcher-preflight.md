# C5-B3B2B — Root-owned Launcher preflight, inert contract

**Status: LOCAL SOURCE / REVIEW PENDING / CI NOT RUN / NOT INSTALLED.** Baseline latest origin/dev after C5-B3B2A PR #2743, merge `a82952c540573eb7f16bab5f6ba883a7c718532b`. Option B architectural boundary approved on 2026-10-08: an independent root-owned, stable Launcher outside replaceable Runtime, without expanding sudoers. Approval **does not** include installation, execution, a production root persistence writer, recovery commands or production cutover.

## Scope
`ops/runtime/root_launcher_preflight.py` is a deliberately *pure candidate contract*, accepting an explicit untrusted observation dictionary and the existing B3A v1 Journal. Its static fixed path table proposes real active Runtime `/opt/sanq/runtime`, version root `/opt/sanq/releases`, state `/var/lib/sanq/runtime`, candidate Launcher `/usr/local/libexec/sanq-runtime`, external `/srv/sanq/uploads` and `/srv/sanq/backups`; existing Compose project `sanq-app` and physical DB volume identity `sanq-app_pgdata` never change.

Strict schema and exact-fields enforcement blocks arbitrary paths/commands and unexpected flags. The candidate must contain affirmative **self-reported** recovery, archive and image pair, no-write and physical reconciliation claims; its Launcher-installed/operator-approved/production-cutover flags must be false. Even a successfully parsed preview returns `readyToInstall=false`, `readyToDeploy=false`, `readyToRollback=false`, `authorizedToMutateProduction=false`, and expressly calls for independent host/provenance verification, cross-transaction Ledger and human approval. Unknown, corrupted, pending or failed B3A Journals fail closed. These fields are **not evidence** that backups, fingerprints, mode/owner, seals, Docker mounts or human authorizations actually exist.

## Controls and future owner's responsibilities
- A future authorized, separately installed immutable root-owned Launcher must independently acquire its real filesystem observations without using caller-attested JSON, including no-follow ancestor and inode/mount/owner/mode checks.
- The Launcher must not live in the replaceable active Runtime or writable Git checkout, and must not reuse the backup's narrow privileged helper. No root-writable IPC/CLI path exposed to `ubuntu`.
- Future ledger implementation must preserve immutable append-only generations and cross-transaction checkpoint continuity, unique transaction IDs, actual image digests and verified archive bytes, and durable fsync/lock semantics. B3B1's temporary fixture is **not** a production writer.
- Future activation must retain the real `/opt/sanq/runtime` directory, independently verify archived exact matching runtime + both GHCR image digests, freeze writers and backup timer as separately approved, preserve existing DB volume/uploads/backups and manually reconcile any partial state.
- No authority is inferred from passing a pure parser, JSON signature claim, manual-reconciled boolean, or a GitHub CI success.

## Validation / follow-on
`ops/runtime/tests/test_root_launcher_preflight.py` exercises strict schema, path/authority mismatches, unresolved/damaged journal blocking and fail-closed preview using stdlib unittest. Existing CI discovers the test within `ops/runtime/tests`; local AGENTS.md prohibits running tests before user review without explicit request.

**Status gate:** B3B2B is a *candidate preflight model*, not production preflight evidence. B3B2C should separately implement first an independently verified read-only host probe/ledger format only after root-installed owner/permissions and evidence acquisition path are reviewed. Manual installer/rollback execution, archive extraction, root fs writes, Docker or C4 production activation remain out of scope and need independent user authorization.
