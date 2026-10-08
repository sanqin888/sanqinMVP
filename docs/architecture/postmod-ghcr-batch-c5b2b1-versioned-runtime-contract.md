# Batch C5-B2B1 — Versioned Runtime & Historical Rollback Contracts

**Status: SOURCE IMPLEMENTATION / LOCAL REVIEW; NO ACTIVE INSTALL OR ROLLBACK CUTOVER.**

Baseline: C5-B2B0 PR #2737 merged into `dev` at
`5b4526fb1df5f45d6673945a74be7c720c02bd26`.
Feature branch: `feat/ops-versioned-runtime-contract-c5b2b1`.

## Authorized scope

The owner requested moving from B2B0 review into the implementation
phase for versioned Runtime installation and historically authentic
rollback. This first implementation establishes **exact-SHA historical
publication verification** and **pure version-transition contracts**.
It does not change `ops/release/deploy_release.py`, start a production
installer, alter existing trust status publishing, remove a production
checkout, or grant any root/sudo authority.

Previous source review included `AGENTS.md`, API CI workflow, C4-B
controller and tests, C5-B1/B2A archive/seal verification, and
C5-B2B0 handoff audit.

## Historical release v1

New module: `ops/runtime/versioned_release_contract.py`.

`verify_historical_release(payload, exact_sha, fetch)` verifies an
*explicit* historic source SHA, not just the newest main release:

1. Reject malformed source SHA and invalid/self-inconsistent tar.gz
   member allowlist, manifest checksum, source branch and activation flag.
2. Ask GitHub `compare/<exact_sha>...main`; require original SHA to be
   the merge base, with `ahead` or `identical` and `behind_by=0`.
   Diverged or removed main history fails closed.
3. Read the latest API/Web paired-image and Runtime archive commit
   statuses on the **exact same source SHA**, each successful and
   `github-actions[bot]`-created, both referencing the **same run**.
   An older success cannot override a newer failure/pending status.
4. Match the Runtime manifest's `publishRunId` to both status target URLs.
   Verify this named `publish-images` GitHub Actions run finished
   successfully in `sanqin888/sanqinMVP` from `workflow_run`.
5. Match the two sealed image digests and SHA-specific image references
   against the embedded manifest, and independently match the latest
   Runtime status SHA256 with **exact supplied compressed archive bytes**.
6. Return the read-only version proof (commit SHA, archive digest,
   published run, two immutable image digests) with
   `productionActivationAuthorized=false`.

The verifier does not recover a missing/expired archive. A commit status
is not a signature, and the proof inherits repository status-writing
permission assumptions documented in C5-B1. Its main-ancestry proof
describes GitHub's current main, not the provenance of any mutable local
VM file outside this input archive.

CLI (read-only; operator must already possess the archive bytes):

    python3 ops/runtime/versioned_release_contract.py \
      --bundle /path/to/reviewed-archive.tar.gz \
      --source-sha <exact-40-char-source-SHA>

## Version transition v1

`version_transition_contract(action, current_proof, target_proof, state)`
produces a **non-executable intent**, not a permission to install:

- Both proofs must have been produced from independently validated
  historical archives and must include the expected source SHA,
  publish run ID, archived digest and two image digests. This pure
  function checks proof shape, not signatures; future deployment code
  must invoke the verifier instead of accepting user-supplied dictionaries.
- `deploy` requires an `active` or `rolled-back` recorded state
  (never `pending`), matching currently authenticated SHA, and a
  strict GitHub main-descendant relation to target SHA.
- `rollback` can start from `active` or `pending`, but must use
  exactly the recorded `previous` SHA with its own historic external
  publication proof; cannot select an arbitrary unrecorded version.
- Refuse identical current/target SHA, unknown states, missing digests,
  malformed names, and diverged history.
- Return both archive SHA256 values and **both API/Web digest pairs**,
  plus fixed `sanq-app` / `sanq-app_pgdata` invariants.
- `readyToInstall`, `readyToDeploy`, `readyToRollback`,
  and `authorizedToMutateProduction` are always **false**.

Existing `ops/release/deploy_release.py` remains unchanged, including
its C4 checkout byte gate and current image-only historical rollback.
That controller must **not** be regarded as B2B1-compliant until later
manual-only source adaptation and complete root-owned Runtime installer
reviews.

## Later source implementation: install/rollback authority

The proposed implementation path is a fixed reviewed layout, subject
to an independent host ownership and recovery safety review:

- Keep `/opt/sanq/runtime` as the existing active physical directory
  (not a symlink); keep active `.env`, release state and the C4
  activation marker under the same existing ownership contracts.
- Preserve separately authenticated immutable Runtime versions outside
  the active tree; proposed `/opt/sanq/releases/<sha>` storage is a
  **design proposal**, not an activated path contract.
- An independent versioned installer/launcher (not a self-modifying
  script inside the active tree) must atomically journal pending
  activation and rollback provenance before touching active files,
  identify and lock the execution owner, preserve secret owners/modes,
  and refuse concurrent/partial mixed-runtime deployments.
- Replace current image-only rollback with a documented two-phase
  application+Runtime rollback, maintaining backups and unmodified
  `sanq-app_pgdata`; fail closed on missing historic archive, missing
  independent seal, incompatible manifest, unsatisfied retention or
  uncertain cutover. A failed health check must not silently auto-rollback.
- Archive retention remains **90 days**. Before root-owned activation,
  define trusted durable offsite retention and an independently tested
  rollback restoration procedure for the approved history window.
  GitHub status existence does not prove archive bytes remain available.

The next implementation slice can design/implement an **inert**
version-install planner and durable proposed state schema without
production mutation. An operational installer or controller source
cutover must be separately approved after review of the root/ubuntu
privilege boundary, active Runtime swap semantics, and rollback
transaction failures. Production C4 activation and C5-C MCP
decoupling/checkout removal remain independent authorization gates.

## Validation / delivery

The Runtime source archive allowlist now includes the new module.
The existing API CI automatically discovers its offline regression tests
under `ops/runtime/tests`. No local lint/build/tests were run, per
`AGENTS.md`. Source changes stop at the local diff/status gate and
require user approval before a PR into `dev`.

No Prisma migration, database, uploads, backups, Docker service,
Nginx privileged helper, systemd, sudoers, dependencies or live VM
files changed by this stage.
