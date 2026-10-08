# C5-B3B2K — Launcher signing trust-root and publisher readiness audit

**Status: LOCAL READINESS AUDIT / REVIEW PENDING / NOT READY TO IMPLEMENT SIGNER OR BOOTSTRAP.** Baseline: latest `origin/dev` after B3B2J PR #2751, squash merge `4d847e8e21f66227f17d8b97013a6c3df2d071dc`. Work limited to Runtime/Ops architecture documentation; no production operations.

## Findings grounded in current source

- `.github/workflows/ci.yml` is the current authoritative test gate. Runtime stdlib offline tests run under `api-checks`, but CI passing does not authenticate root-executable packages.
- `.github/workflows/publish-images.yml` builds and seals the source-pinned Runtime bundle and API/Web GHCR image pair after a green main push CI. Its uploaded Runtime archive and paired release proof use 90-day Actions retention. The workflow does not produce an independently attested Launcher package.
- B3B2I defines domain-separated, detached Launcher publisher claims and independent root of trust. B3B2J `ops/runtime/inert_launcher_claim.py` parses untrusted claim shape and archive bytes, intentionally returns `detachedSignatureVerified=false`, `trustRootPinned=false`, `keyRevocationChecked=false` and `authorizedToMutateProduction=false`.
- B3B2G `ops/runtime/inert_launcher_bootstrap.py` checks only self-supplied hash/owner/path expectations, not a genuinely root-owned installed inode or trusted key. Current `ops/release/deploy_release.py` and C4 backup-helper ownership are separate, protected domains.

**Readiness verdict:** `CLAIM SCHEMA PRESENT / SIGNING AUTHORITY NOT SELECTED / KEY TRUST ROOT NOT INSTALLED / PRODUCTION BOOTSTRAP BLOCKED`.

## Selection table: possible signature/trust mechanisms

| Candidate | Benefits | Costs / boundary |
| --- | --- | --- |
| Offline root-operated Ed25519 signing with a pinned public verification key (recommended design candidate) | Narrow deterministic signature format and detached bytes, no online lookup needed to verify archived packages; publisher private key can stay outside VM/CI | Requires an operator signing ceremony, secure private-key custody, dual-control and audit; root-owned public-key provisioning independent of candidate package |
| CI signer backed by an externally managed KMS/HSM | Auditable automated signing and key access controls | Introduces cloud principal, secret-management permissions, OIDC/role bindings and publisher workflow; must explicitly authorize these new owners and test compromised-CI scenarios |
| CI keyless OIDC/Sigstore-style provenance | Avoids long-lived CI signing key and can bind repository/workflow identity | Trust shifts to OIDC issuer, transparency/checkpoint/identity validation and offline retention of verification material; must define expiry, Rekor/checkpoint availability and disaster recovery |
| Reuse Runtime GitHub commit statuses or plain SHA256 | No new infrastructure | **Rejected as sufficient authority:** caller-controlled or repository-authorized statuses and hashes do not independently authorize root package execution |

No mechanism is adopted automatically by this audit. Ed25519 is a *proposed* cryptographic primitive only, not a key-generation or package-publisher implementation decision.

## Proposed role partition (Option B preserved)

1. **Signer authority:** separately approved human offline signer or dedicated machine identity. The private key never resides in the mutable checkout or production Runtime; a dedicated CI signing workflow would require explicit approval, new scoped credentials and branch rules.
2. **Publisher:** builds deterministic package, records exact source SHA, workflow/CI run IDs and member/entrypoint hashes; outputs *unsigned bytes plus canonical claim*. Publisher may not self-declare the trust anchor or grant production installation.
3. **Root verifier/trust policy:** independently provisioned out-of-band root-controlled verifier and pinned public key(s), allowlisted publisher identity, minimum policy epoch, key revocation list and previous signed checkpoint. Never load its trusted code/key/policy from the incoming artifact.
4. **Root operator:** manually validates signatures, actual package/inventory/interpreter closure, real installed inode and C4 restore evidence; separately approves installation. No sudoers widening, no writable-import execution, no autonomous network upgrade or rollback.
5. **Original deployment owner:** current image-only deployment controller and backup roles remain unchanged until independently authorized transition.

## Detached envelope proposal (contract; not code)

- Signature domain bytes: `sanq.root-launcher.publisher.v1\0` followed by one approved canonical claim encoding. Reject alternate whitespace/duplicate keys, Unicode ambiguity, ambiguous timestamp or serialization, unknown fields and algorithms; do not sign an arbitrary caller-provided digest without verifying exact retained package bytes.
- Detached envelope: `schemaVersion=1`, `kind=sanq-root-launcher-signature-v1`, `algorithm` fixed by approved policy, `keyId` matching independently pinned policy, `claimSha256`, `signature` encoded with one canonical alphabet/length. No embedded public key can elevate trust.
- Independent policy: `policyVersion`, `minimumAcceptedVersion`, pinned signer key(s), allowed repo/main CI workflow and publisher workflow IDs, validity horizon, revoked keys/packages/claims, and authorized rotation predecessor. Policy must be protected from rollback and predate verification. Current time and offline expiry semantics must be decided, not guessed.
- Historical recovery must preserve detached envelope, package bytes, policy snapshots and revocation state off the VM beyond 90-day Actions artifacts. Restoring an old *package* is not permission to restore old *trust policy*.

## Adversarial acceptance matrix

| Threat | Fail-closed requirement |
| --- | --- |
| Forged self-signed JSON / injected public key | Reject; only independently pinned signer can establish publisher proof |
| Replayed valid old signature with revoked key | Reject using current monotonic revocation/policy authority |
| Signature from application Runtime publisher | Reject domain/identity cross-substitution |
| Correct signature, tampered package member or interpreter dependency | Reject; verify exact package bytes and full member/import closure |
| Wrong source SHA, fork/PR workflow or altered run identity | Reject unless matching approved main-push CI and dedicated publisher policy |
| Expired key, unknown clock, missing old trust epoch | Block; no permissive defaults or auto-repair |
| Rotated key with unapproved chain | Reject until human-authorized pinned trust update |
| Missing off-host archive or inability to restore verifier+policy | No root execution, even if a historical hash string survives |
| Valid signature but absent no-write window, DB volume or backup evidence | Installation/deployment remains blocked; signature alone never permits a cutover |

## Authorized vs gated follow-on

**B3B2K (this task):** design/readiness only. Does not generate a key, use signing libraries, change dependency/lockfile, edit GitHub Actions/workflow permissions, read VM credentials, install a root path, or modify production.

**Next candidate B3B2L:** offline signing-envelope syntax and trust-policy shape parser with synthetic fixtures, never authenticating a real signer. This can remain inside current Runtime/Ops boundary without signing infrastructure.

**Separately requires explicit approval:** the selected signing mode and owner, private-key custody, root trust-policy provisioning and update/revocation authority, durable off-VM artifact retention, publisher CI workflow/credentials, real signature verification dependency or library choice, root installer/launcher execution and production C4 activation.

**Approval decision to record before signing implementation:** choose (A) offline operator Ed25519, (B) managed KMS/HSM CI signer or (C) OIDC/keyless attestation; record bootstrap key provisioning, multi-person recovery, revocation/rotation, and archive retention. Until then status stays `NOT READY FOR TRUSTED PUBLISHER / NOT READY FOR ROOT INSTALL`.