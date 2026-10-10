# C5-U2 — Trusted Runtime Installer / U2A preparation

**Status: LOCAL U2A IMPLEMENTATION FOR REVIEW / NO INSTALL OR ACTIVATION / NO LOCAL TEST RUN.**

## Baseline

C5-U1 PR #2775 merged into `dev` (merge `df353fe870843004a43e620aec796170194a7b8e`), CI green. U1 freezes the 17-member Runtime inventory and the never-executable contract. The active production Runtime is still the earlier root-owned `/opt/sanq/runtime`; it remains ACTIVE at application SHA `ff5be8d5…` and has not received the fixed `ops/release/deploy_release.py`. No automatic installer exists in the current repository.

## U2A scope implemented

Added `ops/runtime/prepare_runtime_update.py` to consume original compressed Runtime bytes and exact `main` source SHA. Before **any** output creation it calls existing `stage_bundle.verify_independent_archive` to independently validate newest successful GitHub publication, source identity, runtime archive hash and paired image seal; then parses the original tar bytes using `validated_archive_files`, verifies immutable layout and checks all 17 file-byte hashes and manifest. It requires an absolute, caller-owned mode-0700 private preparation parent without symlinks, blocks preparing inside the active Runtime, and writes only a newly created uniquely named private tree with 17 source members, `runtime-release.json` and the intact original archive. No overwrites, shell commands, Docker, sudo or service operations are performed. After writing it rechecks the written byte content.

Outputs remain **inert**, and `readyToInstall=false`. Merely making a staged tree does not make it an installed/trusted root Runtime. On interrupted preparation, retain/quarantine the incomplete private directory for reviewed cleanup; do not silently delete potentially relevant evidence. The existing `stage_bundle.py` path remains unchanged.

Added offline cases in `ops/runtime/tests/test_prepare_runtime_update.py` for successful private preparation, invalid external attestation, bad external archive digest, modified member hash, unsafe private parent, and non-activation boundaries. Existing CI API job discovers these tests. No tests have been run locally under `AGENTS.md` default review workflow.

## Remaining U2B handoff: hard stop, not implicit authority

The actual Runtime replacement **is not implemented**. Installing an active Runtime requires a separately reviewed complete host-transaction design:
1. Independently assess actual backup timer, any long-lived controller working directory, nested processes, MCP and Compose consumer references to `/opt/sanq/runtime`; acquire an exclusive cross-process operator lock and prove quiescence.
2. Verify both current installed member bytes and fresh sealed replacement archive, including root-owned manifest and original owner/modes of `.env`, release-state, C4 marker; prove backup/recovery.
3. Protect a complete matching prior Runtime snapshot with immutable provenance and verify a recovery path *before* changing the active directory.
4. Resolve the **two-rename visibility gap** without assuming ordinary `rename()` is an atomic directory exchange. A proposed Linux `renameat2(RENAME_EXCHANGE)` alternative would need explicit kernel/filesystem proof, trust-boundary review, cross-process correctness and offline injected crash tests; do not install a symlink at active Runtime.
5. Define a durable journal and manual fail-closed recovery for a crash before/after exchange; prove no new controller executes while installed source/manifest mismatch and no backup/Compose process observes invalid contents.
6. Keep app rollout distinct: no Docker restart, image update, Prisma migration, .env edit or state transition as a side effect of Runtime preparation/installation.
7. After independent authorization and carefully scheduled production update, verify full installed Runtime integrity, unchanged project/DB/uploads/backups, fixed public health and old recovery materials. Production writes always require a separate approval.

The fact that U2A files are **not** in `build_bundle.SOURCE_FILES` is intentional: they are not a trusted Runtime executable. Future U2B must determine an approved trusted operator delivery path before any active installation. Never run a repo checkout or user-writable staged script via `sudo`.

## Delivery gate

Review U2A source, tests and this document locally first. PR to `dev` and GitHub Actions only after review authorization. The U2B active installer remains **NOT READY** and must not be represented as deployed or runnable.
