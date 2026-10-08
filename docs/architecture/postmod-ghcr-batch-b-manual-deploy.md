# Batch B — Manual GHCR release promotion / rollback

**Historical Batch B design:** superseded for future source by C4-B's fixed
Runtime paths. The *production VM has not yet been migrated to C4-B*. Do not
apply this old-root command list to the updated controller. See
`docs/architecture/postmod-ghcr-batch-c4b-runtime-path-implementation.md`.
No unattended deployment is introduced.

## Ownership and compatibility

Batch A publishes a paired-image release seal. Batch B extends the same
Runtime/Ops owner with an operator-triggered controller and non-secret release
journal. No Compose, database/schema/migration, dependency/lockfile, GitHub
release topology, business code, backup mechanism or VM MCP boundary changes.

The initial proposal mentioned a separate release.env file. On the current
source-in-place VM, that would introduce two conflicting SHA authorities:
ordinary docker compose up would continue reading the stale value from .env.
To avoid accidental rollbacks, Batch B instead atomically updates only the
SANQ_IMAGE_SHA line in the existing .env, preserves all other bytes and the
existing file mode, and records previous/current SHA separately in
.sanq-release-state.json (gitignored). A separate runtime-owned env can be
considered in Batch C after the runtime directory migration is reviewed.

The existing Compose project is explicitly pinned to sanq-app. The code
requires the same pgdata and uploads mounts, and lists application services
explicitly; the database image and data volume are never updated by this tool.

## Preconditions for any production activation

- Batch A plus the digest-seal extension must have reached main, and a main
  CI and publish-images execution must have completed successfully.
- Current .env must have exactly one valid full SANQ_IMAGE_SHA; the running
  api/worker/web containers must all match it.
- Main commit comparison must show the new sealed release is a strict
  forward descendant of the current deployed SHA.
- Backup job and off-VM backup health must be manually reviewed. The script
  also enforces a local DB backup <=26h old with gzip stream integrity.
- Operator must separately verify Docker RepoDigests for GHCR multi-platform
  images on the real VM; any mismatch blocks cutover.
- A maintenance window and explicit operator authorization are required.
  Recreating API, worker and Web can interrupt live requests.

## Commands after approved installation

**Historical pre-C4 command context only:** the old controller ran
from /home/ubuntu/sanq-app with a main checkout. C4-B source now requires
the exact /opt/sanq/runtime root with matched release files and C4 marker;
executing mutating commands requires an explicitly authorized root operator.
The old commands below must not be run before C4 approval.

    python3 ops/release/deploy_release.py plan
    python3 ops/release/deploy_release.py deploy --execute

Plan never touches files/images/containers/data. Deploy requires --execute.

Candidate selection is limited to the newest successful main paired-image
seal with BOTH image manifest digests encoded as:

    a:<64 hex characters> w:<64 hex characters>

The seal is authored by github-actions[bot] after both image jobs and the
proof artifact upload succeed. There is no mutable latest/main fallback.

Deploy preflights current readiness and backup, pulls only the API/Web images,
checks Docker RepoDigests against the sealed digests, and runs Prisma
`migrate status` on the candidate image. Clean parity skips all migrations.
A known pending-only status blocks by default; drift, failed migrations,
unrecognized errors or migration-history mismatch always block.

After independently reviewing all committed pending SQL, database backup,
compatible rollout and maintenance window, a root operator may opt into:

    python3 ops/release/deploy_release.py deploy --execute --apply-migrations

This flag is never honored by plan or rollback. Only a pending-only candidate
stops the three application services (never DB), runs the candidate's Prisma
`migrate deploy`, verifies parity and then updates .env and promotes the
API/worker/Web images. Without pending SQL no migration or stop is performed,
even if the flag is present. A migration error retains PENDING, with no
automatic rollback. Destructive/contract migrations and schema compat are
still human review gates, not automatically classifiable by Prisma output.
Never use reset/db push.

Existing C4 source/Runtime manifest checks remain enforced: target images
must match the independently installed Runtime release manifest. This is a
separate pre-deployment preparation gate; this change does not yet provide
a complete new-version one-command upgrade.

On success it records pending state, atomically changes the SHA in .env,
runs Compose up targeting ONLY api, ubereats-worker and web (no deps/build),
reruns readiness and records active/previous SHA.

If readiness fails after cutover, status remains pending. It does not try
to make unsafe assumptions about runtime-written data or auto-rollback.

The operator may inspect and explicitly approve rollback:

    python3 ops/release/deploy_release.py rollback
    python3 ops/release/deploy_release.py rollback --execute

Rollback requires the previous local API/Web images, a recent backup and
read-only migration parity for the previous image. No registry pull of an
untrusted historical tag, data mutation, or automatic rollback is allowed.

## Deliberately deferred

Automatic schedule/watch/webhook deploy, any background pull, image pruning,
standalone runtime directory, source-checkout deletion, backup/MCP relocation,
provider behavior and production migrations remain outside Batch B.
Production installation and real VM execution require a separate review.
