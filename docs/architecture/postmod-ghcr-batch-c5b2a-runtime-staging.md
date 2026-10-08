# C5-B2A — checkout-free, externally authenticated Runtime staging

**Status: local source implementation / review pending.**

Baseline: C5-B1 PR #2735, squash merge
`9244920ac74ffd210dc647f346df73b07accb6e0`.

## Scope and ownership

C5-B2 is deliberately divided into **B2A staging consumer** and **B2B
deployment/rollback consumer**. B2A changes only the inert staging route,
its reviewed layout contract and offline tests. B2B remains a separate
reviewed implementation because the currently deployed controller still
compares against the Git checkout, and historical release rollback cannot
be made safe by accepting only the newest published SHA.

C5-B1 already added the independent external compressed-archive digest
GitHub status `sanq/runtime-archive-sha256`. This B2A replaces
staging's production Git-source byte comparison with verification against
that independent GitHub proof. It does **not** change the artifact's source
list, API/Web image digests, Compose/data paths or privilege owner.

## Staging path contract

Read-only command:

    python3 ops/runtime/stage_bundle.py plan --bundle /trusted/input.tar.gz --source-sha <40-hex-main-SHA>

Manually authorized inert staging command:

    python3 ops/runtime/stage_bundle.py stage --bundle /trusted/input.tar.gz --source-sha <40-hex-main-SHA> --execute

Both commands:

1. Read exact tar.gz bytes with a bounded, regular-file/no-follow read.
2. Validate GitHub's newest paired-image main publication and same
   successful `publish-images` workflow run.
3. Require latest `sanq/runtime-archive-sha256` created by the GitHub
   Actions bot to match SHA256 of these exact archive bytes.
4. Verify fixed Runtime member allowlist, file checksums, source SHA and
   both application image digests.
5. Enforce the inert C2 layout proposal, with
   `sourceCheckoutRequiredForStaging=false` and all production
   activation/DB migration flags false.
6. Do not call Git, inspect the VM source checkout or read `.env`,
   backups, uploads, rclone, TLS keys, Docker or database.

`plan` performs no host writes. `stage --execute` additionally requires
a private pre-created staging parent. It creates a new SHA-scoped inert
directory (never overwrites existing), writes only the validated Runtime
files and manifest, and retains **exactly the externally authenticated
tar.gz** as `runtime-archive.tar.gz` (0600). This allows B2B to later
validate installed runtime file bytes against the exact proven archive
without a Git checkout.

A newly repacked archive with valid internal SHA256 values still fails
the external publication digest comparison. A modified staged source
file fails comparison to the authenticated archive when staging.

## Security limitations / future requirements

- An Actions commit status is an independent repository permission
  boundary, not a Sigstore or GPG signature. Status and workflow
  permissions must remain reviewed and restricted.
- This B2A verifier currently requires the **newest** completed
  main release. Older tarballs, even if authentic, cannot be staged
  through this path. B2B requires an independently reviewed historical
  authentication strategy and rollback behavior.
- GitHub Actions artifact retention is 90 days. B2A does not solve
  offsite immutable long-term storage or retrieve artifacts; the operator
  supplies the archive, and it must match the published SHA256.
- The archive is retained only under inert staging. B2B must separately
  specify how an authenticated archive is installed to
  `/opt/sanq/runtime` with root ownership and a manual C4 activation
  gate. Do not manually copy or run this staged tree in production.
- The existing `ops/release/deploy_release.py` still requires matching
  Git `main` source bytes. **Production checkout cannot be deleted**.
- C5-C MCP producer/consumer decoupling and C5-D checkout deletion
  remain separately authorized and unimplemented.

## Testing and rollout

The existing GitHub API CI autodiscovers
`ops/runtime/tests/test_stage_bundle.py` and verifies no-write plans,
tampered files/archives, matching external proof, wrong proof, private
staging parent and no activation. No local tests were executed before
review per `AGENTS.md`.

No production VM, Docker, backup, uploads, Prisma, GHCR deployment,
release status or .git tree is changed by this source-only slice.
