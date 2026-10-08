# C5-B3B2J — Offline Launcher publication-claim parser

**Status: LOCAL SOURCE / USER REVIEW PENDING / CI NOT RUN / NO SIGNATURE AUTHORITY.** Based on B3B2I PR #2750 merged to `dev` at `4a1ce560ac95e286889537a133a2ea84f936fcd1`.

## Scope

Under the existing Runtime/Ops owner, `ops/runtime/inert_launcher_claim.py` introduces an **inert** strict v1 claim parser based on the B3B2I publication-proof design. This does not implement a launcher publisher, detached signer, trusted-key verification, workflow, network fetch, CLI, root installation, or privileged executable.

It rejects unknown/missing fields, wrong source repository and 40-character lowercase SHA syntax, wrong package identity and domain separation (`sanq.root-launcher.publisher.v1`), unsafe installation path, UID/GID/mode mismatch, contradictory approval flags, malformed SHA256 claims, missing/oversized package bytes, byte-length or artifact hash mismatch, bad workflow/key/policy identities, invalid validity chronology, or self-referencing key rotation.

A syntactically valid self-authored claim and matching bytes **are not independent trust**. The parser does not examine actual entrypoint bytes or inventory members and does not verify detached signatures, trust-root pinning, revocation, current wall-clock expiry, approved main ancestry, publication authenticity or durable storage. The shape-only `entrypointSha256` / `inventorySha256` fields do **not** substitute for an inventory verifier. Inputs can be forged.

Every result explicitly returns `detachedSignatureVerified=false`, `independentPublisherVerified=false`, `trustRootPinned=false`, `keyRevocationChecked=false`, `approvedMainSourceVerified=false`, `packageMemberInventoryVerified=false`, and all install/deploy/rollback/production-mutation authorizations `false`.

## Tests and governance

`ops/runtime/tests/test_inert_launcher_claim.py` uses stdlib unittest fixtures to check shape/byte consistency, domain substitution, unauthorized privilege flags, invalid SHA/length, timestamps, incorrect policy and key rotation, member hash ambiguity, missing and unexpected fields, and non-authoritative valid outputs. Existing `.github/workflows/ci.yml` discovers the test after remote submission; no local tests run per `AGENTS.md`.

**Remaining independent authorization gates:** select actual cryptographic mechanism and independent trust root, publisher CI/credential scope, key custody/revocation, immutable long-term artifact storage, signed canonical payload bytes, verified archive member inventory/interpreter closure, root-only bootstrap and physical host/volume recovery evidence. These change ownership and infrastructure and must be separately reviewed before modification. Do not install production Launcher, widen sudoers, change Docker, or retire Git checkout through this slice.
