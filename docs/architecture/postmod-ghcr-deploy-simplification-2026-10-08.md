# 2026-10-08 — GHCR → VM deployment simplification and abandoned C5-B3 cleanup

**Status: LOCAL SOURCE / USER REVIEW PENDING / NO LOCAL TESTS / NO REMOTE PR / NO PRODUCTION CHANGE.**

## User-approved scope

Retire the **uninstalled** C5-B3 independent root Launcher/Ed25519/ledger/journal experimental line, synchronize deletion of its unit tests and stage docs, and change the existing `ops/release/deploy_release.py` Migration boundary. The actual target is GHCR API/Web images → VM deployment, **not** a new root-installed Runtime system.

## What was removed

- B3A persistent-journal state simulation, B3B1 offline durable journal, B3B2B launcher preflight, B3B2C ledger model, B3B2D isolated host fixture, B3B2E evidence correlation, B3B2F archived-triplet correlation, B3B2G launcher bootstrap, B3B2J claim and B3B2L Ed25519 envelope syntax; their paired tests.
- 14 obsolete `docs/architecture/postmod-ghcr-batch-c5b3*` documents for B3A through B3B2M, including the signing/design-only slices. B3B2N had never entered `dev`; its uncommitted local code/docs were discarded. Kept historic Git PR records and replaced live graph/worklog references with retirement note.
- Removed B3-B2A and B3A references from the still-relevant B2B3 installation audit to avoid dead links.

**Preserved:** `ops/release/release_contract.py`, `ops/release/deploy_release.py`, existing image pair seal, `ops/runtime/build_bundle.py`, `runtime_trust.py`, `versioned_release_contract.py`, and B2 installation planning/staging dependencies that still appear in `build_bundle.SOURCE_FILES`. No Runtime Bundle allowlist, publishing workflow, CI workflow, data volume, backup helper or Prisma migration-file changes.

## Proposed conditional migration behavior in the existing controller

1. Existing proven main SHA, Runtime manifest, C4 backup and live-container checks stay before mutation. Pull and digest-verify images.
2. Run candidate `prisma migrate status` with the candidate SHA. **Success:** no migration/stop. **Recognized pending-only output:** require explicit `deploy --execute --apply-migrations`. **Failed/drift/unrecognized errors:** fail closed.
3. In the pending-only approved case, first persist PENDING, stop api/ubereats-worker/web writers (never db), run candidate `prisma migrate deploy`, verify clean parity, update one `SANQ_IMAGE_SHA` in .env, promote only application containers and check health.
4. If deploy fails, leave PENDING for manual recovery. No migration rollback, `migrate reset`, `db push`, automatic volume cleanup, secret printing or unattended behavior. Rollback explicitly blocks if the previous image reports pending migrations.
5. An opt-in flag is **not** a SQL safety classifier. Operator must review all SQL, expansion/contraction/data preservation, backup and compatibility manually before using it. Production execution remains separately permission-gated by AGENTS.md.

## Remaining blocker to a genuine one-command new-SHA deployment

The existing `verify_runtime_release(candidate)` compares the **target candidate SHA** to the current *installed* `/opt/sanq/runtime/runtime-release.json` source SHA and matching image-pair references; `runtime_manifest()` additionally requires exact matching `/home/ubuntu/sanq-app` main checkout and Runtime file byte identities. Thus simply receiving new GHCR images does **not** make the current manual controller a one-command newer-release installer. This intentional source-provenance/staging restriction was **not** removed in this slice; changing it requires a separate reviewed design that preserves deploy-script/config trust without resurrecting the root Launcher.

Additional gap: cannot reliably distinguish dangerous SQL from ordinary pending migrations solely via Prisma status. Human approval remains necessary for actual pending migrations; skip path is automatic only if none pending.

## Final production acceptance: retire the VM main source checkout

**Mandatory final target:** after the release pipeline is production-verified, remove the VM's Git source checkout `/home/ubuntu/sanq-app` (currently expected to be `main`). The production VM should run from immutable GHCR API/Web images and independently installed, reviewed Compose/release/backup configuration; production must not require `git fetch/pull`, a local `main` checkout, or on-host application image builds.

**Required gates before any deletion (NOT performed in this branch):**

1. Remove `runtime_manifest()` / `verify_runtime_release()` reliance on the checkout without discarding a trusted mechanism for verifying the actual installed deployment-controller, Compose, and config bytes. In particular, support image-only forward releases when the installed Runtime has not changed and implement a separately approved Runtime update path when it has.
2. Search and inspect production systemd, backup scripts, MCP tunnel/workspace, printer dependencies, deployment cron/jobs, logs, Compose bind mounts and any other process referencing `/home/ubuntu/sanq-app`; migrate their valid runtime/data dependencies before removal.
3. Prove a new GHCR release can be deployed and health-checked with the checkout *unavailable*, with zero pending migrations and with reviewed pending migrations in separate controlled scenarios. DB storage, uploads, credentials, backups and live backup/restore must remain intact.
4. Prove manual rollback and incident recovery with the checkout absent, including when a migration was already applied (which must not imply an automatic reverse schema migration). Retain verified image digests, release metadata, rollback evidence, and necessary Runtime configuration independently of Git.
5. Independently review the exact checkout deletion path, ownership, symlinks and mount boundaries. Take/verify recoverable backups. Obtain a **separate explicit production deletion authorization** before removing any VM files; this source PR does not authorize or attempt deletion.

**Exit gate:** an operator can invoke one controlled VM deployment command for routine version changes; no pending migration means `migrate deploy` is skipped; approved pending migrations follow their guarded path; post-deploy health and manual recovery succeed *without* the `main` checkout. Only then is checkout removal marked production-verified.

## First-batch checkout-free application deployment (local implementation)

The installed root-owned `/opt/sanq/runtime/runtime-release.json` and its full `build_bundle.SOURCE_FILES` hash inventory remain the local Runtime installation reference. `runtime_manifest()` no longer reads a production Git checkout. It rejects non-root-owned or group/world-writable manifest/member files, symlinks, oversized files and checksum mismatches. Initial provisioning and actual installed-file trust are **separate manual review gates**, not implicitly made trustworthy by an embedded SHA256.

Application image SHA is now independent of the installed Runtime source SHA. `verify_runtime_release()` verifies the installed Runtime manifest's historical API/Web image reference shape and uses an independent GitHub compare of installed Runtime source SHA to the sealed application SHA. Only a bounded forward main ancestry with complete, explicit changed-file metadata and **no changes anywhere in the Runtime Bundle's SOURCE_FILES** may reuse the installed Runtime. GitHub comparison that is missing/too large/truncated, any Runtime file change or divergent history blocks instead of guessing compatibility. Source-level equality of Runtime files is a conservative compatibility proxy, not proof that every API requires no new Compose/env contract. This gate must be independently reviewed during controlled production testing.

The existing `release_contract.discover_release()` and Docker RepoDigest checks still authenticate the candidate GHCR pair. Conditional migration logic from PR #2755 remains unchanged. This first batch does **not** install a new Runtime or remove the production MCP checkout. Existing Runtime's controller source remains older until separately authorized installed Runtime handoff; no production deployment is performed here.

## Review and validation gates

GitHub Actions is the authoritative test gate after user review and remote authorization. Existing `ops/release/tests/test_deploy_release.py` was extended for pending, no-pending, drift, explicit opt-in, PENDING on failure and rollback. No local test/lint/build was run, following `AGENTS.md`. After approval, open PR against dev and inspect all CI jobs. **Do not perform production deploy/migration/root operations as part of this branch.**
