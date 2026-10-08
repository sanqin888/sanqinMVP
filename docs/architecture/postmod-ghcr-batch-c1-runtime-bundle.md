# Batch C1 — source-locked Runtime release artifact

**Status:** C1 was merged into dev via PR #2729 (merge `93f3ad97`).
Main publication and production verification remain pending. This change
extends `publish-images` only; it does not install, move, run or delete
production VM files or alter Compose, backups, Docker volumes or MCP.

## Current contract and ownership

GitHub CI is the authority for the `main` source SHA. The publish workflow
already builds SHA-tagged API/Web GHCR images, checks both manifests and emits
`sanq-release-proof`. C1 stays within the existing Runtime/Ops publishing owner.

After the two images and paired-image proof have been verified, the
`seal-paired-release` job packages a reviewed **fixed allowlist** of runtime
source files from the **same validated checkout SHA**:

- `docker-compose.yml`
- `ops/backup/backup-db.sh` (C3-B allowlist extension)
- `ops/backup/sanq-backup-protected-nginx` (C3-B allowlist extension)
- `ops/backup/sanq-backup.service` (C3-B allowlist extension)
- `ops/backup/sanq-backup.sudoers` (C3-B allowlist extension)
- `ops/release/deploy_release.py`
- `ops/release/release_contract.py`
- `ops/runtime/build_bundle.py`
- `ops/runtime/audit_compose_cutover.py` (C4-A read-only audit extension)
- `ops/runtime/inspect_layout.py`
- `ops/runtime/stage_bundle.py` (C2 allowlist extension)
- `ops/runtime/runtime_trust.py` (C5-B1 independent digest status)
- `ops/runtime/runtime-layout.v1.json` (C2 allowlist extension)
- `ops/verify-runtime-readiness.sh`

The archive embeds `sanq-runtime/runtime-release.json`, containing the source
SHA, main branch, CI/publish run IDs, paired API/Web image refs and digests,
and SHA256/size for each included file. The field
`productionActivationAuthorized=false` is required and checked on verification.

**Nothing else is packaged.** In particular, no production `.env`, user
uploads, backups, Git metadata, Node dependencies, TLS secrets, host
configuration, database files or rclone credentials are read or published.

## GitHub artifact and fail-closed ordering

The trusted `publish-images` seal job:

1. Checks out the source commit identified by the successful `main` CI run.
2. Waits for both immutable image publishes, checks registry manifests and
   uploads `sanq-release-proof`.
3. Requires that the bundle builder's local `git rev-parse HEAD` equals the
   proof's exact 40-digit `sourceSha`. Any mismatch blocks packaging.
4. Builds a deterministic tar.gz using an explicit allowlist, bounded sizes,
   no symlinks, normalized archive metadata, and an embedded integrity manifest.
5. Re-reads and verifies the complete tar.gz *without extracting it*.
6. Uploads the artifact with name `sanq-runtime-<full-source-SHA>`, retained
   for 90 days.
7. After upload success, C5-B1 also independently seals SHA256 of the
   *compressed archive bytes* to a separate `sanq/runtime-archive-sha256`
   commit status, tied to that same successful publishing run.
8. Only **after all uploads and seals succeed**, writes
   `sanq/paired-images-published` on the source commit.

An incomplete or invalid Runtime bundle prevents new releases from being
sealed. Existing images remain published; neither artifact nor status
constitutes authorization to deploy.

Example future command inside the publishing checkout:

```bash
python3 ops/runtime/build_bundle.py create \
  --source-sha "$SOURCE_SHA" \
  --proof "$RUNNER_TEMP/sanq-release.json" \
  --output "$RUNNER_TEMP/sanq-runtime-$SOURCE_SHA.tar.gz"
python3 ops/runtime/build_bundle.py verify \
  --source-sha "$SOURCE_SHA" \
  --bundle "$RUNNER_TEMP/sanq-runtime-$SOURCE_SHA.tar.gz"
```

## Security limits and Batch C2 follow-up

The embedded SHA256 file digests detect archive tampering when the manifest
has been obtained from a trusted publish channel, but are not a digital
signature. Later installation must independently verify the expected `main`
SHA from the trusted release seal and expected image digests, retrieve the
corresponding artifact from the actual successful publishing run, validate its
membership/checksums and bind its SHA to those images **before staging**.

The tar.gz contains the **current source-in-place Compose file** with
`./uploads` and the existing deployment controller's current checkout
assumptions. It is an **inert delivery artifact**, not yet independently
installable under `/opt/sanq`. C2 owns separate runtime path/config
contracts and *staging without production activation*.

This slice has no Prisma/schema changes, Docker actions, runtime directory
changes, secrets, privileged operations or automatic deploys. The production
checkout and services remain unchanged. CI adds offline tests for deterministic
content, allowlist exclusion, SHA mismatch, symlink refusal and checksum
rejection; no local tests are run before user review, per AGENTS.md.
