# C5-U2D-1 — Offline Handoff Evidence Reviewer

**Status: LOCAL IMPLEMENTATION FOR REVIEW / NO PRODUCTION AUTHORITY.**

## Baseline and ownership

U2C live evidence and U2D design PR #2779 was CI green (#7136), merged into dev at SHA 8cea63289262f6fee1f631159e8f1e6fcba56c21. This slice implements only the previously scoped U2D-1 pure-data contract. It adds a source module and standard-library unittest cases under ops/runtime; no existing controller, Docker, CI workflow, dependency, schema, systemd unit or Runtime 17-member allowlist is changed.

## Two pure functions

**review_handoff_intent(intent)** accepts strict schema version 1, fixed 17-member old/new Runtime manifests and source SHA/archive digest syntax, fixed SanQ Runtime/project/DB volume identities, distinct source SHAs with at least one changed Runtime member, and ACTIVE application current/previous/env/running image SHA agreement. Application SHA is intentionally **not** required to equal either Runtime source SHA. It rejects forged activation authority, invalid keys or version/membership drift.

**inspect_handoff_incident(intent, journal, observed)** adds a strict transaction ID, old/new Runtime identity, immutable application SHA, phase, and manually recoverable journal contract. It classifies only these *claimed* disk states:

| Observed tree arrangement | Classification |
| --- | --- |
| Active = old, candidate = new | before_exchange |
| Active = new, candidate = old | after_exchange |
| Active = new, previous = old | previous_retained |

The only accepted journal phases are PENDING_EXCHANGE, EXCHANGED_UNCONFIRMED, PREVIOUS_RETAINED, VERIFIED_RETAINED. Journal may lag the actual exchange, but cannot claim an advanced phase when the observed disk state is earlier; unexpected phase or slot mapping rejects. The candidate and active trees must be on the same claimed device, have distinct inodes, and contain three dynamic file metadata entries with equal SHA256/owner/mode/device and **distinct inodes**. Environment must be ubuntu-owned 0600, state root-owned 0600, C4 marker root-owned 0644. It also requires a separate complete, retained old-version snapshot claim, no active writer/path-reference claims, and unchanged app state.

These checks only establish **internal consistency of caller-provided assertions**. This module performs **no filesystem access, network access, GitHub provenance authentication, Docker/host inspection or root work**. Thus even a successful review returns explicit false for readyToInstall, readyToDeploy, readyToRollback, authorizedToMutateProduction, automaticRecovery, externalProvenanceVerified, and quiescenceVerified. Every incident remains manual-incident-review-only; no automatic recovery or production write interface exists. Evidence about snapshots, filesystem inodes and old/new manifests is untrusted until independently verified by a separately approved future operator workflow.

## Offline testing and handoff

New tests cover distinct Runtime/app release identities; source change and exact member count; false authorization gates; forged/invalid journal and manifest; all three directory arrangements; journal lag versus impossible ahead-of-disk phase; snapshot absence and alias; dynamic metadata owner, mode, inode, digest and device drift; app SHA and release-state drift; active path refs/writers; and absence of privileged/process interfaces.

The existing GitHub Actions api-checks job runs the standard offline Python unittest discovery for ops/runtime/tests. Following AGENTS.md, no tests/lint/build are run locally in this review phase. Subsequent PR submission requires user approval, then all required CI green before merging.

**Exit state: U2D-1 LOCAL REVIEW / U2D-2 ROOT INSTALLER NOT APPROVED / PRODUCTION INSTALL NO-GO.**
