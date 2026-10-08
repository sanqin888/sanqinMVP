# C5-B3B2I — Launcher publisher proof contract design (v1 proposal)

**Status: LOCAL DESIGN / REVIEW PENDING / NOT IMPLEMENTED OR AUTHORIZED FOR PUBLICATION.** Baseline: `origin/dev` at B3B2G merge `d1bb76fbba6e345aa8f6cc775b03be72691ccbee`. Scope is Runtime/Ops documentation only, with no executable root Launcher, signing key, CI workflow, production installation, network credentials, or production VM state.

## 1. Source-derived evidence and the gap

- `.github/workflows/publish-images.yml` currently gates on successful `main` push CI, publishes SHA-tagged API/Web images, seals paired image digests, uploads the matched Runtime tarball and stores an independent Runtime archive digest in GitHub commit status. The proof and archive Actions artifacts both retain for **90 days** (lines 121–168).
- `ops/runtime/versioned_release_contract.py:verify_historical_release` verifies matching source-SHA, archived Runtime member inventory, two image-digest seals, GitHub status actor/context/run URL and successful `publish-images` workflow. This is a Runtime + image release authority, not a root Launcher package publisher.
- `ops/runtime/inert_launcher_bootstrap.py` currently validates only exact candidate bytes SHA256, a fixed path `/usr/local/libexec/sanq-runtime/sanq-runtime-launcher`, root:root and candidate mode 0500. It intentionally returns `authenticPublisherVerified=false`.
- No dedicated independently signed Launcher bundle, trusted verifier key reference, publisher identity policy, append-only detached attestation, long-lived retention contract or revocation/rotation mechanism was established in the inspected code.

**Conclusion:** dedicated root Launcher publisher provenance is **not ready**. Do not reuse the Runtime archive digest status, a GitHub Actions badge, a self-provided JSON document, a SHA-tag or a caller-provided fetch result as privileged trust authority.

## 2. Proposed fixed trust and ownership contract

| Role | Allowed responsibility | Trust exclusion |
| --- | --- | --- |
| Launcher publisher workflow (new, separately approved) | Reproducibly create and seal exact Launcher package bytes for an approved main source SHA | Cannot authorize root installation, C4 activation or execute deployment |
| Independent trusted verifier | Verify artifact bytes against detached signature/attestation and an independently provisioned root-of-trust key; check revocation and identity/policy | Never accept public key or policy only from the untrusted bundle |
| Human root operator | Verify immutable package and trust policy, then separately approve manual offline install/upgrade after C4 gates | No arbitrary caller path/command, no trusting checkout imports |
| Fixed external root Launcher | At a separately approved stage, use fixed verbs, root-only state and durable transaction journal | Not implemented in this Slice; never execute from replaceable Runtime |
| Existing publish-images owner | Continue paired GHCR image + Runtime archival authority | Is **not** implicitly a Launcher signing authority |

**Default recommendation:** a separate Launcher package publication domain and *dedicated pinned verifier trust root* installed out of band by a root operator. This avoids silently promoting the existing application publication status into privileged code authorization. The actual signature mechanism, key location, custody, rotation/revocation policy and GitHub Actions permissions are **unresolved decisions requiring authorization**, not implementation details this design may assume.

## 3. Proposed v1 detached publisher claim

The following is a **schematic contract**, not a real signed payload. Any future validator must reject unknown fields, missing evidence and non-canonical representations. The detached signature covers a versioned canonical byte serialization with domain separation `sanq.root-launcher.publisher.v1`; neither a nested `verified:true` field nor a bare hash is acceptable.

| Field | Contract requirement |
| --- | --- |
| `schemaVersion`, `kind` | Exact integer 1 and `sanq-root-launcher-publication-v1` |
| `sourceRepository`, `sourceSha` | Exact `sanqin888/sanqinMVP`, immutable lowercase 40-char main commit |
| `packageKind`, `packageFormat` | Exact root Launcher (not Runtime or Docker), fixed versioned format |
| `artifactSha256`, `artifactLength` | SHA256 of retained full binary package bytes and bounded exact byte length |
| `entrypointSha256`, `inventorySha256` | Full installed executable bytes and canonical package member inventory, including interpreter/import closure |
| `buildWorkflowIdentity`, `buildRunId`, `ciRunId` | Pinned workflow identity, successful authorized run, source/trigger chain; IDs are evidence references, **not** signatures |
| `publisherIdentity`, `keyId`, `policyVersion` | Allowlisted signing identity, independently provisioned root key and policy epoch |
| `validFrom`, `expiresAt`, `replacesKeyId` | Canonical UTC seconds, bounded validity window and rotation linkage |
| `installPath`, `ownerUid`, `ownerGid`, `mode` | Exact `/usr/local/libexec/sanq-runtime/sanq-runtime-launcher`, 0, 0, `0500` |
| `requiresManualApproval`, `productionActivationAuthorized` | Strictly true and false respectively; signing never grants deployment |
| Detached `signature` / attestations | Independent bytes, scheme identifier and verified signer identity, not supplied as an unverified boolean |

**Important distinction:** the field named `requiresManualApproval=true` means human approval is still necessary; it is not an approval record. The signed package proof must be domain-separated from API/Web image and Runtime bundle seals to prevent cross-protocol substitution.

## 4. Verification order and fail-closed cases

1. Start with a separately installed, pinned and root-controlled verification policy and trust key. Reject untrusted verifier code/key material, unknown algorithm, policy downgrade, revoked/expired key, unrecognized signer, unknown schema/field, and source-run mismatch.
2. Obtain immutable Launcher artifact bytes from an independently verified durable storage source. GitHub Actions `retention-days: 90` is not a long-term recovery guarantee. Fetch paths cannot be arbitrary paths passed to a privileged process.
3. Verify **detached cryptographic signature/attestation against the pinned key/policy**, publisher/run identity, approved main source SHA and approved workflow trigger before trusting claimed hashes. An injected/mock callback is not an independent trust source.
4. Hash the **actual** retained package bytes; validate exact length, entrypoint and every inventory member, disallow symlinks/hardlinks/path traversal and unlisted executable/import dependencies. Pin interpreter and permitted runtime/import environment.
5. Check package version against a separately retained monotonic trusted history, key rotation/revocation and authorized upgrade policy. Prevent rollback to revoked launcher packages even if their old signatures were once valid.
6. An approved root operator verifies the fixed root-owned destination parent chain and installed inode/hash, file modes and lack of mutable dependencies. Do not extend existing backup-helper sudoers or install under `/opt/sanq/runtime`.
7. A valid package attestation yields only `candidatePublisherProofVerified`. It **never** yields `readyToInstall`, `readyToDeploy`, `readyToRollback` or `authorizedToMutateProduction`. Separate C4 recovery/physical-volume/backup/stop-writers gates still apply.

**Failure matrix:** unverifiable detached signature, missing retained package bytes, modified package member, changed interpreter path, altered publisher identity, wrong source SHA, changed workflow event, expired/revoked signing key, missing prior trust epoch, untrusted operator or wrong root path => **BLOCK** and preserve evidence; no network-driven auto-update or auto-rollback.

## 5. Storage / upgrade / disaster recovery decision

Proposed independent retention: immutable content-addressed Launcher package bytes, detached signature and verify policy snapshots retained beyond both 90-day Actions artifacts and deployment rollback horizon; externally recoverable outside the VM. Root-owned on-host historical package inventory must include package hash, trusted policy epoch, source SHA, authorized human decision, installed inode fingerprint and supersession links. The backup restore procedure must verify both package and root-of-trust separately. Exact store/provider and retention period are not presently selected and must be approved before implementation.

A future real publisher workflow would extend GitHub Actions trust and credential custody. This requires **new explicit user authorization before workflow/secret/permission changes**, even though Option B's Launcher architecture boundary was approved. A future root installer/persistence writer requires its own approval, as does production C4 activation.

## 6. Follow-on tasks and gate

- **B3B2I (this Slice):** source-backed documentation-only contract design, no changes to `.github/workflows/**`, runtime binaries, root directories, trusted keys or production state.
- **B3B2J (possible, review first):** pure offline, source-only strict claim parser that *always returns unverified*, plus adversarial fixtures for domain separation, canonicalization, expiry/rotation and package inventory. No signature implementation can claim authenticity without an independently provisioned trust anchor.
- **Publisher implementation (requires separate approval):** select signing mechanism, root key custody, workflow publisher identity/permissions, immutable storage provider/retention and revocation process, then review a minimal independent publisher implementation and tests.
- **Bootstrap implementation (requires separate approval):** independent root operator/installer, exact installed code provenance, privilege/no-follow parent checks and isolated fault-injection verification. Do not deploy to production or remove original Git checkout without further authorization.

**Exit criterion for this stage:** design documented and reviewed. **Not** `publisher_verified`, **not** `launcher_install_ready`, **not** a production rollout.