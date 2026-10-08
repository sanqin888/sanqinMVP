# Batch C5-B1 — Runtime artifact independent publication digest

**Implementation status:** SOURCE-ONLY, LOCAL REVIEW. Branch:
`feat/ops-runtime-artifact-trust-c5b1`.
Baseline: C5-A PR #2734, dev merge
`2f10cbaaa24fbc55ce831f22b63709be8035009d`.

## Purpose and design decision

C5-A showed that the tar.gz includes a self-consistent file checksum
manifest, but nothing outside those same archive bytes authenticated the
archive itself. A consumer that checked only the internal manifest could
accept an entirely repacked malicious tarball. C5-B1 establishes an
**external SHA256 of the exact tar.gz bytes**, recorded in a separate
GitHub commit status from the successful *trusted publishing workflow*.

This follows the repo's existing commit-status release trust model,
rather than introducing a second unsigned JSON manifest. Alternative
future improvements include GitHub artifact attestations / Sigstore
verification and permanent immutable archive storage. These remain
separate decisions; a bot-owned GitHub status is **not a cryptographic
signature**, and security depends on tightly controlled repository
`statuses:write` permissions and trusted workflow governance.

## Producer contract

`.github/workflows/publish-images.yml`, within its existing
`seal-paired-release` job:

1. Validate successful main CI and the paired API/Web GHCR manifest digests.
2. Build the source-SHA-matched, fixed-allowlist Runtime tar.gz.
3. Verify its internal entries, checksums, schema and release manifest.
4. Upload `sanq-runtime-<source-SHA>` Actions artifact (90-day retention).
5. **Only after upload success**, run
   `python3 ops/runtime/runtime_trust.py seal --proof ... --bundle ...`.
   It verifies `GITHUB_ACTIONS`, repository, `GITHUB_WORKFLOW=publish-images`,
   event `workflow_run`, matching GitHub run ID and `GITHUB_TOKEN`.
   It re-verifies the tarball against source SHA, main branch, CI/publish
   run IDs, API/Web digest proof before posting the Runtime seal.
6. Write `sanq/runtime-archive-sha256` GitHub status on the same source
   commit, with `description=sha256:<64-lowercase-hex>`, target URL
   `https://github.com/sanqin888/sanqinMVP/actions/runs/<publishRunId>`.
7. **Last**, run the existing `sanq/paired-images-published` image-pair
   seal. Failure of Runtime publication/verification prevents that final
   release seal.

The Runtime seal is a separate `statuses:write` publication, never
embedded solely inside the archive. No private uploads, secrets, backup
files, `.env`, credentials, production volumes or checkout artifacts
are included. `runtime_trust.py` is added to the tarball source allowlist.

## Independent read-only verifier

The new `runtime_trust.py verify --bundle <path> --source-sha <sha>`
reads the archive and public GitHub metadata, without extraction or
filesystem writes. It requires:

- Archive member allowlist and internal checksums pass;
- `discover_release` finds the newest **completed paired-image seal** on
  `main` at the supplied exact SHA;
- The Runtime manifest's `publishRunId` matches that paired-image
  seal's GitHub Actions target URL;
- That workflow run exists, succeeded, is named `publish-images`, used
  `workflow_run`, and belongs to the fixed repository;
- Both Runtime manifest image refs/digests match the paired seal;
- The **latest** independent Runtime status at the same source SHA is
  successful, created by `github-actions[bot]`, has the exact publishing
  run URL, has a canonical SHA256 string, and matches SHA256 of the
  actual received compressed archive bytes.

A missing **provided archive**, replaced bytes, wrong status
author/run/workflow, bad digest, wrong image, failed newer status,
or invalid tar.gz fail closed. This verifier does NOT download from
GitHub Actions, prove the artifact still exists on GitHub, or check
Actions retention/expiry; B2 must separately verify exact run/artifact
identity, availability and retrieval before staging. Current discovery
also requires the *newest sealed main release* and is deliberately not
a general-purpose historical rollback resolver.

## What remains out of scope

This is **B1 producer and independent read-only verifier only**.
Neither `stage_bundle.py` nor `deploy_release.py` is switched to trust
this new evidence yet: B2 will replace their checkout-byte comparisons
**only after** a separately reviewed consumer contract with offline tests
for replay, expiration, failure recovery and rollback.

C5-C later relocates MCP source queries, Compose read-only runtime
operations and source-history semantics. **Do not remove**
`/home/ubuntu/sanq-app` or its `.git` during B1/B2 development.

The GitHub Actions artifact retention remains **90 days**. This B1
status authenticates the original artifact bytes but does not itself
guarantee durable storage; historical rollback and disaster recovery
outside retention require a separately reviewed immutable retention
strategy. Retaining a SHA256 digest is not retaining a recovery archive.

No direct changes to Docker, systemd, DB, mounts, backup, sudoers, Prisma,
API/Web business code, live VM or production deployment. No local tests
before review under `AGENTS.md`; the existing API CI tests
`ops/runtime/tests/test_runtime_trust.py` via unittest discovery.
