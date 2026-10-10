# C5-U1 — Existing Runtime Update Contract (readiness)

**Status: LOCAL CONTRACT + OFFLINE TESTS / USER REVIEW PENDING / NO PRODUCTION INSTALL AUTHORITY.**

## Scope and evidence

C4 completed a separately authorized initial trusted installation of the real, root-owned `/opt/sanq/runtime` directory. C5 advanced the application images `a84b7200… → ff5be8d5…` and completed manual ACTIVE reconciliation after startup readiness raced API initialization. The startup gate fix PR #2774 was merged into `dev` with CI green; its changes to `ops/release/deploy_release.py` are included in the 17-file Runtime archive allowlist. Production has **not** installed that fixed Runtime controller. This update contract does not change that fact.

Reviewed baselines: `AGENTS.md`, `.github/workflows/ci.yml`, `ops/runtime/build_bundle.py`, `runtime_trust.py`, `stage_bundle.py`, `versioned_release_contract.py`, `plan_versioned_install.py`, `ops/release/deploy_release.py`, C4 P2-A installation and P2-D recovery runbooks. `stage_bundle.py` stages trusted but inert archives; `plan_versioned_install.py` is an inert model. Neither is an installed-Runtime updater.

## Frozen U1 contract

`ops/runtime/runtime_update_contract.py` is a **pure, non-executable** adapter for planning an already-installed Runtime update. It checks syntax and logical agreement of caller-provided old/new Runtime manifest inventories (exact 17 paths, SHA256, sizes, immutable main-source identity) and rejects unchanged Runtime files, same SHA, PENDING incidents, wrong project/DB volume/root, unavailable exclusive-lock declaration, or forged mutation authority. Its output inventories changed Runtime members and mandatory external gates, always with `readyToInstall = readyToDeploy = readyToRollback = authorizedToMutateProduction = false`.

This does **not** authenticate the supplied manifest/archive, verify Github statuses or installed bytes, check real Docker state, take backups, acquire a lock, or install anything. U2 must independently prove those conditions from original bytes and actual host state. The fixed contract preserves:
- Compose project `sanq-app` and DB named volume `sanq-app_pgdata`;
- `/opt/sanq/runtime` as a real root-owned path with fixed members, no uncontrolled symlinks;
- `.env`, `.sanq-release-state.json`, `.sanq-backup-layout-activated` as live *external* state, not bundle payload;
- `/srv/sanq/uploads`, `/srv/sanq/backups`, backups, credentials, and application data;
- a complete verified previous Runtime tree and both sets of archive/digest records.

**Crash consistency is unresolved by U1.** Renaming the old active directory and then renaming the new one is two operations, not an atomic exchange. U2 must demonstrate an exclusively locked and recoverable handoff while no other controller/backup/Compose process depends on missing paths. Do not use a symlink for the active Runtime. A failing handoff requires explicit manual recovery from a matched verified snapshot; never infer that an updated manifest makes partially copied source valid.

## U1 offline test matrix

`ops/runtime/tests/test_runtime_update_contract.py` covers correct changed-member inventory with immutable non-execution flags, rejection of same SHA/unchanged Runtime, missing/extra/malformed/oversized manifest members, PENDING state and identity drift, invalid digests, unauthorized activation, and manual recovery semantics. Existing API CI runs `python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`. Under `AGENTS.md`, do not run local tests before review; PR CI is the subsequent validation gate.

## U2 readiness gate — needs new authorization

Implementing a trusted installer expands authority to modify **live root-owned Runtime files**, so it requires a separate scoped approval. Review the U2 design against the current immutable installed Runtime and genuine production process consumers first, including backup timer, shell working directories, MCP and deployment controllers. An acceptable U2 design needs independently verified exact published archive bytes and GHCR pair proof, root-private immutable preparation, full previous tree preservation, exclusive operator lock and quiescence proof, explicit journaled failure/recovery states, preservation of dynamic file identity/modes, complete post-handoff verification, and no automatic rollback or hidden migration.

U1 creates **no** installer, CLI, sudo helper, Runtime allowlist addition, Compose action, migration, credentials, VM write, or production state mutation. Existing Runtime remains intact. Promote `dev → main` only via separate normal authorization; a changed Runtime member necessarily blocks image-only release on old installed Runtime. Legacy checkout deletion remains blocked by separate C5 gates.
