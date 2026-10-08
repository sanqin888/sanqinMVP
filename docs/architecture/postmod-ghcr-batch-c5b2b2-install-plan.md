# Batch C5-B2B2 — Inert Versioned Runtime Installation Planner

Status: **LOCAL SOURCE IMPLEMENTATION / NOT PRODUCTION AUTHORIZED**.

Baseline: C5-B2B1 PR #2738 merged to dev at
`48f67f2d343d1e7d7d46f8c2fdd0c73c12a8a81a`.
Branch: `feat/ops-versioned-runtime-plan-c5b2b2`.

## Scope

This phase establishes the **proposed transaction intent contract**, not an
installer. The prior C5-B2B1 exact-SHA historical proof remains the source
of release evidence; this new pure planner explicitly cannot authenticate
input dictionaries on its own. A future installer must freshly verify both
the active and requested release from independently sealed archive bytes
and ensure these reflect the physical Runtime installation before making
any change.

New module `ops/runtime/plan_versioned_install.py` accepts only a
B2B1-compatible transition object and a caller-provided proposed journal.
It checks both versions and archive digest formats, preserved Compose name
`sanq-app` and existing DB named volume `sanq-app_pgdata`, the previous
version binding for rollback, and blocks ambiguous `pending`/`failed`
journals until manual recovery.

It returns a **non-executable** proposed journal:
`schemaVersion=1`, `phase=pending`, action, active SHA, previous SHA,
target SHA, and external archive SHA256 values; records manual recovery
required and never grants install, deploy, rollback or mutation authority.
No journal is actually written by this module.

## Proposed paths (not activation contracts)

- Active Runtime: `/opt/sanq/runtime`, a real directory, not a symlink.
- Proposed retained versions: `/opt/sanq/releases/<sha>`, not yet provisioned.
- Shared uploads: `/srv/sanq/uploads`.
- Backup data: `/srv/sanq/backups`.
- DB volume: `sanq-app_pgdata` must remain the original volume.
- No paths may be chosen by callers during future activation.

## Future transaction/recovery gates

The operational design still requires explicit separate authorization for
any mutation of root-owned Runtime files or service startup. A future
launcher/installer must live outside the active changing code directory,
hold an exclusive transaction lock, authenticate archive and image pair
proofs for both versions, preserve owner/modes for secret `.env`,
record and fsync pending state before modifications, stage a verified
reversible active Runtime snapshot, and refuse to delete/reinitialize
PostgreSQL volumes.

If an interrupted install or uncertain mixed-version state is detected,
the only valid next step is **manual recovery**, not another deploy or
automatic rollback. Evidence must include independent encrypted recovery
verification and an archive retention policy beyond the current 90-day
GitHub Actions artifact horizon. The pre-C5 controller's image-only
rollback and Git-checkout dependency are unchanged.

## Delivery

Read `AGENTS.md` and actual API CI workflow before source changes.
The existing `ops/runtime/tests` discovery covers synthetic planner
tests for pending/failed state, wrong volume, forged authority and
recorded rollback target. Local lint/build/test was not run as prohibited
before review. No production VM, Docker, GitHub release publisher,
MCP authority, sudoers, backup service or database mutation is in scope.

Stop at local diff/status review; PR to dev only after user permission.
