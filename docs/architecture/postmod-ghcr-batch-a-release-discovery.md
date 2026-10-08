# Batch A — GHCR paired-image release contract and candidate discovery

**Status:** workspace implementation for operator review; not yet pushed, merged, deployed,
or production-verified. This is an additive publishing/read-only discovery change.
It does **not** introduce auto-pull, recreation, a background service, or .env edits.

## Authority and invariant

The already-existing main CI push workflow is the test authority. The existing
publish-images workflow starts only after successful main push CI. It has a matrix
publishing sanq-api and sanq-web under the **triggering CI run's head SHA**; the
API artifact is also the Uber worker artifact.

A workflow_run job's own GITHUB_SHA is not the triggering CI source SHA. Do not
select releases from that value or from the latest Git commit alone.

The additional seal-paired-release job:

1. Runs **after both matrix image publishing jobs** succeed.
2. Re-reads each matching SHA-tagged image from GHCR using Docker Buildx registry
   inspect, checks manifest digests and linux/amd64 availability, and rejects
   unexpected revision labels whenever image config labels are exposed.
3. Writes an audit artifact named sanq-release-proof with a schema-versioned
   JSON file containing sourceSha, CI/publish run IDs, both image references,
   both observed manifest digests, and timestamp. Artifact retention: 90 days.
4. Only after the proof artifact upload succeeds, posts a GitHub commit
   status on the **validated source SHA**:
   - context: sanq/paired-images-published
   - state: success
   - target_url: the publishing workflow run URL
   - creator: github-actions[bot]
   - requires only job-level statuses:write permission.

A missing/failed matrix job, unavailable image/manifest, wrong platform, bad
proof or artifact-upload failure prevents the success seal. The existing image
publishing jobs remain independent and still publish without deploying.

The success status is publication evidence, **not** a production deployment
approval, Prisma migration approval, an immutable-registry enforcement policy
or proof that registry bytes can never change later. GHCR SHA tags must be
rechecked against stored digests at actual deployment time (Batch B).

## Read-only candidate discovery

The standard-library-only script scans up to 20 recent commits reachable from
current main, in newest-first order, and finds the first with a successful
sanq/paired-images-published status attributed to github-actions[bot] and linked
to a publishing workflow run for this repository. It treats the **latest**
status in the same context as authoritative, so later failed/pending statuses
override old success.

From the repository root, a human or future VM caller can run:

    python3 ops/release/release_contract.py discover --pretty

It prints JSON with sourceSha, sourceBranch, the seal's workflow URL/time and
the paired API/Web GHCR SHA-tagged image references. It never executes docker,
modifies deployment environment, moves branches, runs migrations, or restarts
services. For higher API rate limits a read-only GitHub token may optionally
be supplied as GITHUB_TOKEN; public repository reads work without one.

Failure to find a sealed release in the bounded main history, GitHub API
errors, malformed statuses or an unauthorized seal results in a nonzero exit.
The script does **not** silently fall back to a mutable latest/main tag.

Releases published before this contract lands on main do not have seal
statuses. The first normal post-merge main CI + publish run will produce the
first discoverable candidate. Batch B must maintain explicit previous-version
records for rollback and must prevent downgrades on production.

## Scope and validation

- Publishing job validates only the GHCR artifact pair. Existing production
  Compose, SANQ_IMAGE_SHA, Postgres, API and Web runtime topology are unchanged.
- API CI executes offline unittest fixtures for complete/incomplete pairs,
  platform/digest/revision mismatches, tampered proof, forged/wrong status
  actor and target, superseding failure, discover ordering and seal-token
  requirements. The tests do not access GitHub, GHCR or the production VM.
- Existing image-build-checks workflow covers publish-images.yml changes;
  it remains a pull-request build smoke test, not a production deployment.
- The GitHub Actions publishing/seal run remains unverified until the reviewed
  change reaches main through dev and its own workflows execute successfully.

## Deliberately deferred to Batch B

Fetching/pulling any candidate image, changing Compose release selection,
recreating containers, handling migration/backup/readiness gates, rollback and
Docker image pruning require separate implementation and production authorization.
Do not remove the production main checkout as part of Batch A.
