# C5-B2B0 — Deployment / historical rollback provenance readiness

**Status: LOCAL SOURCE-ONLY AUDIT IMPLEMENTATION / NOT AUTHORIZED TO CHANGE DEPLOYMENT AUTHORITY.**
Base: C5-B2A PR #2736 merged to dev as
`c687f04b5e51726e8c63cf11cef8e333d14f1d72`.
Branch: `feat/ops-release-provenance-readiness-c5b2b`.

## Owner boundaries and current evidence

Inspected `AGENTS.md`, `.github/workflows/ci.yml`,
`ops/release/deploy_release.py`, `ops/release/release_contract.py`,
`ops/runtime/runtime_trust.py`, `ops/runtime/stage_bundle.py`, and
their offline tests.

C4 controller still checks every installed Runtime file against a matching
production `main` Git checkout and compares `SOURCE_CHECKOUT` bytes.
This is a useful temporary trust gate but prevents retiring `.git`.

C5-B1 provides independent compressed-archive SHA256 publication evidence
bound to newest paired API/Web image digest seal and a successful
`publish-images` workflow run. B2A stages the exact archive under
`/opt/sanq/staging/<sha>/runtime-archive.tar.gz` and keeps all source
files alongside the manifest. It no longer depends on production Git.

**Rollback remains the major unresolved boundary:** The existing controller
`rollback --execute` switches the API/Web image SHA and records state,
but continues using the active Runtime Compose, controller and helpers.
It does not install/restore a matching older Runtime code release.
Historical releases may predate the independent archive seal, their
Actions archive may be expired after 90 days, and the C5-B1 verifier
currently discovers only the newest sealed release.

Neither having a previous image tag nor being able to list its local
Docker image is proof that both historical Runtime and API/Web digests
belong to the previously approved release.

## C5-B2B0 implementation

Add `ops/runtime/audit_release_provenance.py`, a read-only *handoff*
checker for a SHA-specific inert staging tree. It must NOT be wired
into live deploy/rollback before owner approval.

Its checks:

1. Fixed /opt/sanq/staging SHA directory, private ownership and
   permissions, no symlink paths, no additional unreviewed files.
2. Exact tar.gz read with bounded size and no-follow semantics.
3. Independent GitHub B1 evidence: correct main source SHA, API/Web
   digests, successful publishing workflow, and matching compressed
   archive SHA256.
4. Archived allowlist/manifest/layout parity against every staged
   source file and the stored `runtime-release.json`. No `.env`,
   uploads, backups or database content is read.
5. Always returns `readyToInstallRuntime=false`,
   `readyToDeploy=false`, `readyToRollback=false` and
   `authorizedToChangeProduction=false`, including when the staging
   tree is valid.

Sample read-only command, only after the archive has been staged:

    python3 ops/runtime/audit_release_provenance.py --source-sha <40-character-SHA>

No Docker, Git, root mutation, /opt activation, production network
deployment, source checkout removal or database migration is performed.
Offline fixtures under `ops/runtime/tests/test_release_handoff.py`
exercise missing/tampered source, missing external seal, unsafe directories
and no-write/no-authorization contract. CI will validate after PR.

## B2B implementation alternatives requiring review

**Alternative A — maintain Git checkout until production C4 cutover.**
Leave `deploy_release.py` unchanged; staged releases can be preflighted
independently, but source retirement goal remains incomplete.

**Alternative B — authenticated versioned Runtime activation (recommended).**
Create a manual-only, fail-closed Runtime installation operation that
verifies independently sealed archive and staged files, validates immutable
project / DB volume / backups / uploads contract, and persists evidence
of currently and previously installed Runtime source SHA plus their
external archived digests. Do not permit switching to any version lacking
independent proof. Deployment and rollback must atomically coordinate
Runtime source tree and image pair, preserve sensitive `.env` and release
state, and keep explicit pending/rollback failure gates. To avoid a source
swap during a running controller process, use a reviewed launcher outside
the tree or a carefully defined two-phase installer. Do **not** unilaterally
change the root/ubuntu ownership and helper privilege boundary.

Historical validation must resolve an **exact** archived main SHA's status
rather than only `discover_release` newest. It needs both matching image
digest seal and archive digest seal from the **same successful publishing
workflow**, a main-ancestry check, and immutable retained tar.gz bytes.
Releases without those artifacts/records must be marked
`HISTORICAL_ROLLBACK_BLOCKED`, not silently permitted.

**Alternative C — historical image-only rollback.**
Reuse current mutable Runtime code for all older image versions. This
cannot generally prove Runtime source compatibility across releases;
not recommended without a formal explicit compatibility manifest, a
narrow allowed version range and integration verification.

## Decision and production gates

The user has authorized the C5-B source sequence. **But implementation
of Alternative B changes the active deployment / rollback trust authority
and root-owned Runtime installation responsibilities**. Before that
boundary change, the user should approve the exact transactional
install/rollback contract and historical retention policy.

Production installation still requires a separate C4 gate: verified
off-VM backups, unchanged `sanq-app_pgdata` and Compose project,
uploads parity with paused writers, backup helper/systemd parity,
root-owned activation marker, and operator-maintained recovery snapshot.
No production source checkout or Git history may be deleted until C5-C
MCP decoupling and C5-D manual retirement verification.
