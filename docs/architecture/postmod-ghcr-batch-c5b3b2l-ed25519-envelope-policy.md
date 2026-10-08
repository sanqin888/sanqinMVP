# C5-B3B2L — Scheme A inert Ed25519 envelope/policy model

**Status: LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN.** Based on B3B2K merge PR #2752, dev SHA `3b8a7e835d84f17a9173641b183db7585cb58140`. User chose **A — offline human-operated Ed25519 signing** as the future signing design. The separate trusted signer implementation, private-key custody, trusted root-key provisioning, revocation authority, real publication workflow and root installation remain **unauthorized and absent**.

## Implemented now

`ops/runtime/inert_ed25519_envelope.py` is pure Python/stdlib and accepts **untrusted** candidate claim, package bytes, detached envelope and policy fixture. It reuses B3B2J claim shape validation, checks exact `Ed25519` algorithm and `sanq.root-launcher.publisher.v1` domain, SHA256 of canonical JSON claim bytes prefixed by domain + NUL, canonical fixed-size base64 signature *encoding*, matching package claim, key ID and publisher/workflow fields, integer policy generations and syntactically valid pinned-key hex representation. It blocks locally declared revoked key/artifact IDs and refuses unrecognized fields, mismatched policy epochs, improper authority flags and malformed payloads.

**A syntactically valid base64 string is not an Ed25519 signature proof.** This module never signs, verifies a signature with a real cryptography backend, authenticates the supplied public key, checks offline policy monotonicity against trusted storage, authenticates revocation lists, reads current time, checks source ancestry, or validates full package member inventory. The policy fixture comes from the caller and can be forged. The parser intentionally outputs `signatureCryptographicallyVerified=false`, `independentTrustRootVerified=false`, `publisherAuthenticated=false`, `revocationAuthorityVerified=false`, and all install/deploy/rollback/production mutation booleans false. No production root helper, no key file, no CLI/network access and no GitHub workflow modification.

`ops/runtime/tests/test_inert_ed25519_envelope.py` uses synthetic detached 64-byte buffers (NOT valid signatures) to assert fail-closed syntax, domain separation, policy version, key mismatch, revocation claim shapes, and never-granted authority.

## Required gates before real signing

1. Define a human-controlled offline signer, independent trusted public-key provisioning ceremony, key storage/recovery, two-person approval, rotation and revocation; a new publisher workflow must not receive this private key implicitly.
2. Freeze canonical bytes/domain and cryptographic algorithm with reviewed implementation, end-to-end known-answer vectors and explicit dependency review (AGENTS.md dependency changes require separate authorization).
3. Define independent monotonic root-owned policy and revocation checkpoint; a claim's own key or caller policy cannot act as root-of-trust.
4. Retain signed archive bytes, policy history and complete import/inventory closure off-VM beyond 90-day GitHub Actions artifact expiry.
5. Separately approve root installer, real host inode/mount/ownership verification, durable pending Journal, C4 backup/restore and no-write window. Never let a signature alone authorize production installation or cutover.

**Next slice candidate:** B3B2M — offline operator ceremony and independent pinned trust-policy design/readiness, then explicit user authorization before implementing cryptographic signing/verification libraries or privilege owners.
