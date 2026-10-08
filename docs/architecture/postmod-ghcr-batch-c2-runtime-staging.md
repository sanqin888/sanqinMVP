# Batch C2 — Runtime layout contract and inert staging

**Historical C2 source baseline:** subsequently superseded for staging only
by C5-B2A, which verifies the externally published Runtime SHA256 instead
of checking a local Git `main` source tree. See
`docs/architecture/postmod-ghcr-batch-c5b2a-runtime-staging.md` for the
current staging contract. C5-B2B release controller still depends on the
source checkout. This does not authorize production installation, symlink
cutover, backup changes, Docker operations, database migrations or source
checkout removal.

## Baseline and ownership

C1 publishes an inert SHA-bound Runtime package alongside paired API/Web
images. C2 stays within the Runtime/Ops owner and adds:

- ops/runtime/runtime-layout.v1.json — proposed layout contract
- ops/runtime/stage_bundle.py — read-only plan or explicitly gated inert stage

Both are added to the Runtime bundle's exact source allowlist. Existing
Compose, .env, backup, sudoers, MCP, Nginx and app code remain unchanged.

## Proposed path contract (NOT ACTIVE)

| Kind | Location |
| --- | --- |
| Compose project | sanq-app |
| Legacy runtime checkout | /home/ubuntu/sanq-app |
| Future runtime | /opt/sanq/runtime |
| Inactive staging root | /opt/sanq/staging |
| Future uploads | /srv/sanq/uploads |
| Future backups | /srv/sanq/backups |
| Preserved PostgreSQL volume | sanq-app_pgdata |
| Preserved sounds | /home/ubuntu/sanq-assets/sounds |

The exact JSON layout sets all production activation, cutover and migration
authorization flags to false. C2 rejects alternate JSON values including
unexpected volume names or path redirections.

## Fail-closed staging checks

1. Verify complete C1 archive, exact SHA, fixed allowlist and file SHA256.
2. Check layout proposal against exact v1 constants.
3. Verify local Git worktree is main at the same SHA, checked-out Runtime
   files have no uncommitted changes, and *every* source file matches
   archived bytes. This interim provenance gate requires a Git checkout.
4. Check newest GitHub sealed main source SHA, publishing run ID and both
   API/Web digest+refs against the Runtime archive.
5. Require a pre-existing /opt/sanq/staging owned by the executing account,
   not group/world-writable and with no symlink path components.
6. Refuse overwrite of any version. Create only a private temporary
   directory under staging, write verified allowlisted bytes (never use
   tar.extractall), include the inert manifest and rename to the SHA.
7. Never execute Docker, write .env, copy uploads, change services/volumes,
   flip a runtime pointer, or remove the original production checkout.

After separate production approval, the proposed commands from the matching
main checkout would be:

    python3 ops/runtime/stage_bundle.py plan \
      --bundle /path/to/reviewed-runtime.tar.gz \
      --source-sha <validated-main-40-char-SHA>

    python3 ops/runtime/stage_bundle.py stage \
      --bundle /path/to/reviewed-runtime.tar.gz \
      --source-sha <validated-main-40-char-SHA> --execute

Plan never writes. Stage requires an explicit execute flag and creates only
the inert SHA directory; it does not deploy the application.

## Remaining authorization boundaries

C2 deliberately uses exact Git checkout bytes as its trusted Runtime artifact
content reference. The C1 embedded SHA256 manifest alone is not a signature;
the GitHub paired-image seal authenticates the images, not Runtime tar bytes.
Before C5 removes production Git, a separately reviewed GitHub artifact
attestation or trusted published Runtime digest mechanism must replace this
checkout requirement. No checkout-free installation is authorized today.

C3: separate backup/upload ownership review.
C4: controlled production cutover (DB and uploads preservation).
C5: MCP code-read ownership and production source checkout retirement.

Offline tests are discovered by the existing API CI for ops/runtime/tests.
No local lint/build/test runs have been executed before user review, per
AGENTS.md. The first actual VM staging remains a separate operator gate.
