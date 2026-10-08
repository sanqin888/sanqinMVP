# C5-B3B2M — Offline Ed25519 signing ceremony and independent trust-policy freeze

**Status: LOCAL DESIGN / USER REVIEW PENDING / NO KEY MATERIAL OR INSTALLATION.** Baseline: latest `origin/dev` after C5-B3B2L PR #2753 merged SHA `749c87f707cc04981f15106a848e1e1727ebae3c`. User selected Option A: human-operated offline Ed25519 signing; this selection does **not** authorize actual private-key creation, key handling, root-owned bootstrap, workflow permissions or production cutover.

## Existing implementation and constraints

- `ops/runtime/inert_launcher_claim.py` and `inert_ed25519_envelope.py` check *untrusted* publication claim/envelope/policy structure, canonical JSON claim SHA256 prefixed with `sanq.root-launcher.publisher.v1\0`, base64 signature-byte length, key/epoch references and in-claim revocations. They **do not** cryptographically verify Ed25519, validate a trusted root, enforce current time or persist revocation history. A self-consistent claim/policy/signature-shaped fixture is not a trusted signature.
- `.github/workflows/ci.yml` is authoritative for code tests; `publish-images.yml` publishes the Runtime archive + API/Web GHCR image pair after green `main` CI. Runtime artifact retention remains 90 days. It is not a private-key custodian or trusted Launcher signer.
- Option B requires a stable root-owned Launcher outside replaceable Runtime, with a separate trusted verifier, fixed root-owned policy and rollback-safe Journal. The current image-only deploy owner and ubuntu backup helper/sudoers are unchanged.

## Proposed operator ceremony — explicit human-controlled stages

1. **Precondition / approval:** record named roles for initiating the package candidate, independent reviewers and final offline signing operator. Define two-person approval for signing a specific immutable source SHA and package hash, out-of-band approval channel, reason, change ticket, timestamp and retention ID. No person signs an unreviewed digest or mutable path.
2. **Dedicated offline signing environment (future, separately authorized):** a device disconnected from production VM, CI and live network, with verified toolchain and an independent secure storage procedure. Generate Ed25519 private/public key locally **only after explicit key-custody authorization**. Private key/seed never uploaded to VM, repository, GitHub Actions artifacts, logs, email, cloud connector or chat.
3. **Root-of-trust bootstrap:** independently hand-deliver the public verification key fingerprint and immutable signing policy to an authorized root operator by two independent channels, compare full fingerprint in person, install only into root-owned non-writable policy location with strict parent-chain/inode checks. The root trust anchor cannot be supplied inside the package being verified.
4. **Signing input transfer:** move reviewed exact package bytes and canonical v1 claim through a controlled medium; verify package inventory + entrypoint/import closure, source commit, approved workflow identity and SHA256 on both sides. Refuse corrupted, duplicated, unsigned or ambiguous input. Record byte size, digest, reviewer IDs and signer policy epoch.
5. **Offline signature issuance:** sign exactly the approved domain-separated canonical claim byte stream, never a package-provided public key or free-form shell command. Return detached signature and audit statement; retain private key offline. A valid signature does not set `bootstrapAuthorized` or `productionActivationAuthorized`.
6. **Independent verification:** verifier must use independently pinned public key and current root policy, check detached bytes, expiry/clock, policy monotonicity, key/package revocation, historical approval and external retained archive. Separately check the installed inode/hash and root ownership before any privileged Launcher invocation.
7. **Archive and recovery:** maintain at least two separately protected and test-restorable off-VM copies of verified package bytes, detached signature, approved claim, trust-policy snapshots, audit decisions, public-key fingerprint and revocation/rotation history beyond Actions expiry and the approved rollback horizon. Avoid copying the private signing seed into broadly accessible backups.
8. **Compromise / loss:** on suspected key exposure or signer loss, freeze all new Launcher upgrades and installs, retain evidence and replace the root trust policy via an approved out-of-band root ceremony. Existing signatures must be re-evaluated under current revocation rules; old policy snapshots are evidence, not a path to downgrade trust. No automatic emergency root code execution.

## Proposed trust policy and rollover

- **Pinned immutable identity:** a policy epoch and Ed25519 public-key fingerprint recorded by root-only authority, independent from untrusted envelope `keyId`. A plain SHA256 fingerprint helps compare identical bytes, but does not by itself authenticate provisioning.
- **Monotonicity:** every new policy/revocation checkpoint has increasing generation and out-of-band operator approval, durable atomic store and rollback detection. Missing, corrupted, conflicting or older-than-seen policy => `BLOCKED`.
- **Key rotation:** a new offline key needs dual approval, a documented overlap window, explicit previous-key supersession, and an independent verification/pinning ceremony. Never trust `replacesKeyId` in a claim alone. Define whether old packages are still permitted on a per-package basis.
- **Revocation:** independently approved list of key IDs and artifact SHA256, published as durable policy update with trusted freshness requirements. Fail closed when no reliable current revocation snapshot or trusted clock is available.
- **Dependency boundary:** actual Ed25519 cryptographic verification must use a reviewed, established crypto implementation; adding a dependency/lockfile or installing a system package requires explicit authorization under AGENTS.md. Do not hand-roll Ed25519 primitives.
- **Recovery/continuity:** restoring an old package must never silently restore an older trust-policy epoch or unsigned root binary. Damaged root state or missing archive bytes requires manual investigation, not auto-rollback.

## Decision inventory still requiring explicit approval

| Decision | Proposed baseline / reason | Status |
| --- | --- | --- |
| Signing architecture | Option A, offline operator Ed25519, private key never in CI/VM | **User selected** |
| Offline signer ownership/device | Separate offline device, at least 2-person approval | Proposed, not provisioned |
| Exact crypto implementation | Reviewed existing crypto library with deterministic tests; no handwritten crypto | Not selected |
| Key provisioning/backup custody | Independent root-key ceremony and protected recovery | Not authorized |
| Storage/retention | Content-addressed off-VM replicated retention beyond 90 days + rollback horizon | Provider/duration undecided |
| Policy freshness/revocation | Root-owned monotonic state, approved rotations and revocations | Not implemented |
| Launcher package publication workflow | Separate unsigned candidate build is possible; no CI private signing key | Not authorized |
| Production installer/cutover | Root operator and C4 physical storage/backup gates | Not authorized |

## Exit / follow-on

This is a **contract and runbook proposal only**. No real key generation, signing, filesystem installation, credential access, Github workflow edits, Docker/migration actions or production operations have occurred.

Suggested **B3B2N** is a pure offline *ceremony checklist / policy transition model* with synthetic fixtures and explicit false authority outputs, staying in Runtime/Ops. A later real signer/verifier requires user approval for crypto dependency, key lifecycle/ownership and trusted-root provisioning; the real publisher/installer and production activation remain separate approval gates.