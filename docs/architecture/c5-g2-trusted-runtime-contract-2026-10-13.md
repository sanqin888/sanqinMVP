# C5-G2 — Trusted Runtime independent acceptance and installation authority contract

**Date:** 2026-10-13 America/Toronto  
**Baseline:** `origin/dev@3b9178f68c56888d88da43e34af3d0b248f7f962`  
**State (2026-10-13, post-merge operator-evidence update):** G2-A PR #2791, G2-B1 PR #2792, G2-B2A–B2B5 PRs #2793–#2798, G2-B2B6 PR #2799, and G2-B2B7 PR #2801 **MERGED** (B2B7 CI #7190 7/7 green). G2-B2B8 separate disposable VirtualBox guest real-systemd **S1/S2/S11 3/3 operator-reported PASS** with independently queried synthetic unit cleanup. This does **not** prove host-wide quiescence, namespace coverage or new-consumer prevention; preceding VirtualBox freeze root cause remains unknown. All lab receipts non-authorizing; **NO ROOT PRODUCTION INSTALL; C5-G2 NO-GO; S2 DAILY BACKUP PAUSED.**

## 1. Frozen design and ownership

Primary recovery remains **ABORT the interrupted transaction → isolate incident →
download/decrypt an externally retained original Runtime Recovery Kit → start a
brand-new, separately authorized clean reinstall**. A crashed Runtime install
must **never** replay its old journal or infer authority from the old active tree.

- Runtime trust/publication owner: `ops/runtime/build_bundle.py` and existing
  `runtime_trust.py`; 17 exact source members, artifact-side
  `productionActivationAuthorized=false`, paired GHCR api/web digests.
- New **external offline verifier**:
  `ops/runtime/historical_runtime_publication.py`, deliberately **not** one
  of the 17 Runtime source members. It verifies a caller-pinned original
  archive against historical GitHub main ancestry, matching successful main
  push CI/publish run identities, both most-recent matching GitHub seals and
  exact archive byte SHA-256. This is not a Runtime production component.
- App deploy/rollback owner: existing installed
  `ops/release/deploy_release.py` and independent per-app
  `SANQ_IMAGE_SHA` / root `.sanq-release-state.json`. G2 shall not
  rewrite app state, launch an app rollout, or skip its fixed compatibility
  validation to make a Runtime upgrade seem possible.
- Backup owner: `/home/ubuntu/backup-db.sh`, existing
  `sanq-backup.service` (ubuntu), installed Nginx protected helper and
  sudoers. **S2 still paused**; G2 shall not install a new daily backup helper,
  change current backup retention, or make root-only state readable to ubuntu.
- Root Runtime one-shot operator: **not yet implemented**. Later source must be
  independently reviewed and copied to a root-only location outside
  `/opt/sanq/runtime`, with no permanent Root Launcher, MCP sudo tool,
  arbitrary arguments/paths, symlink Runtime, expanded 17-member allowlist,
  Docker/DB writer, or unstated production authority.
- Production VM: **NO WRITE AUTHORITY** from any of the above source contracts.
  All verified receipts explicitly return
  `readyToInstall=false` and `authorizedToMutateProduction=false`.

## 2. Two different GitHub publication checks (do not conflate)

| Purpose | Verifier | Contract |
| --- | --- | --- |
| Ordinary current release | `runtime_trust.verify_runtime_publication()` | Existing **latest successful published paired release** policy unchanged; current `stage_bundle.py` consumer unchanged |
| C5 recovery old/current original bytes | `historical_runtime_publication.verify_historical_runtime_publication()` | Exact user/operator-approved source SHA, original Archive bytes, `main` ancestry, successful exact CI/publish runs, matching trusted paired-image and runtime SHA256 commit statuses; NEVER auto-select another release |

Offline invocation for a separately obtained original archive (read-only **example**, not an
installation command):

```sh
python3 ops/runtime/historical_runtime_publication.py \
  --archive /trusted/offline/private/original-runtime.tar.gz \
  --source-sha <exact-approved-40-hex-main-sha>
```

Use only reviewed code and an operator-protected archive in a trusted verification
environment; do not elevate or run a user-writable checkout with `sudo`. The
status creator identity `github-actions[bot]` and successful workflow are a
**GitHub repository-scoped proof**, not an independent cryptographic signature.
Do not make a failed historical verifier PASS by falling back to
`verify_runtime_publication()`, changing SHA, repacking, or rewriting a status.

`publish-images.yml` retains Runtime and release-proof artifacts for **90 days**.
This slice does **not** solve long-term Archive availability or remote create-only
integrity. The C5 preinstall gate must separately prove BOTH original versions
are independently retrievable, have matching off-VM bytes and provenance, and
can be decrypted/read back even after GitHub Artifact expiry. An external receipt
cannot rely only on a Google Drive object name or self-declared Manifest hash.

## 3. Mandatory G2 production-relevant gates (not yet implemented)

| Gate | Required independently checked evidence | Failure |
| --- | --- | --- |
| Operator source | reviewed installer source SHA-256 and root-only installed path + uid/gid/mode + trusted ancestor FDs | BLOCKED |
| Intended release | old/new complete main SHA, original Archives, independent external SHA256/CI/publish seals, 17/17 manifest and file checks | BLOCKED |
| Current running app | `.env` / state settled, exact current/previous app SHA, actual api/web/worker image tags and digests, approved target Runtime/app backward compatibility | BLOCKED |
| Storage | actual Compose project `sanq-app`, named DB volume `sanq-app_pgdata`, bind `/srv/sanq/uploads`, no DB/Uploads mutation | BLOCKED |
| Privileged state | root `0600` Release State, ubuntu `0600` env, root C4 marker and original bytes/UID/GID/mode; inode may change but not hardlinked | BLOCKED |
| External Kit | **before any active Runtime mutation**, unique txid, create-only encrypted off-VM Archive + live config and provenance, full independent remote decrypt/readback/hash, proven crypt-key escrow and retention | BLOCKED |
| Quiescence | externally controlled operator maintenance window, root-owned lock outside active Runtime, stopped backup timer + idle service/helper/rclone, no concurrent deploy, no MCP production subprocess, no shell cwd/fd holders; double check | BLOCKED |
| Handoff | private candidate and separate prior-tree evidence, fsync/atomic directory operation, non-overwrite journal, all resulting dirs verified; no automatic journal resume | INCIDENT / STOP |
| Clean reinstall | source and executable independent of damaged Runtime, separately verified Kit and fresh txid, **same-version reinstall allowed only via a distinct recovery entry**, never changing normal upgrade same-SHA rejection | BLOCKED |
| Exit | active Runtime file inventory and dynamic bytes rechecked, storage/container health, backup/MCP timer restored to **original** state, incident sealed, independent operator acceptance | NOT VERIFIED |

**No root executable is permitted to accept a generic path, URL, shell fragment,
raw archive from a caller-writable location, or boolean `authorized=true` as its
sole permission.** A standalone flock is not quiescence: existing backup,
`deploy_release.py`, MCP and SSH sessions do not automatically honor it.

## 4. Approval tiers and freeze

- **A — Architecture:** choose one-shot operator-owned installer and dynamic
  logical path identity. Previously authorized for source/offline development;
  not a production shell/VM privilege grant.
- **B — Isolated acceptance:** independent disposable Linux ext4 VM, synthetic
  credentials, actual root/ubuntu UID/GID and source pin, no production network
  mounts/secrets. The 2026-10-10 2B2-B root lab and SIGKILL results are
  evidence **for the old lab implementation only**.
- **C — G2 independent acceptance:** CI green plus independently executed
  complete fresh install and repeated-abort clean reinstall using only original
  remote bytes/proof and disposable synthetic data, including readback failures,
  stale state, occupied old journal, injected faults, mount/cwd contention.
- **D — Production readiness review:** fresh dated host/consumer/backup
  evidence and exact target. Explicitly distinguish Runtime source SHA
  from App image SHA; if required external backup script/service/helper or app
  controller compatibility is not demonstrated, stop for **grouped-release
  architecture review**, not hidden S2 implementation.
- **E — Production execution authorization:** a **new specific operator
  approval** identifies VM, old/target Runtime full SHAs, original Archive hashes,
  installed installer source hash, Kit txid/readback proof, current app and
  previous app SHA, downtime window, initial systemd state, operator, abort rule.
  D passing does not grant E.
- **F — Post-install independent verification:** verify original storage
  and active services, C4 marker/layout revalidation, no hidden app rollout,
  retain prior slot/archives, close journal/incident only after evidence.

## 5. Small, independently reviewed G2 slices

**G2-A (merged):** standalone historical-main immutable Archive verifier and synthetic failure tests, PR #2791 / CI #7169 green. **NOT** a production installer.

**G2-B1 (merged):** bounded, negative-only normalized maintenance evidence contract and offline regression coverage, PR #2792 / CI #7171 green. It does not read the host, grant authority or create a true quiescence barrier.

**G2-B2A (merged, PR #2793):** read-only, root-required `/proc` textual-reference census with synthetic fixture tests; cannot establish a barrier or authority. See [G2-B2A process census](./c5-g2b2a-proc-reference-census-2026-10-13.md).

**G2-B2B through G2-B2B5 (merged, PRs #2794–#2798):** synthetic operator rehearsal, double idle-report negative check, second-process flock, same-user real Linux cwd/fd fixture, and isolated inode/hardlink/mmap fixture observation. All require explicit negative-only receipts; **none** prove cross-process quiescence, forbid new consumers, cover all namespaces, or grant root install authority.

**G2-B2B6 (merged, PR #2799):** independent disposable Linux VM root/systemd [B2B3/B2B6 guest acceptance protocol](./c5-g2b2b3-isolated-linux-acceptance-2026-10-13.md), originally published as a **not-yet-executed plan**; B2B8 below records only the later S1/S2/S11 execution, not the full matrix or production gate.

**G2-B2B7 (merged, PR #2801, CI #7190 7/7):** inert [claimed disposable guest Gate 0/1 review](./c5-g2b2b7-guest-gate01-review-2026-10-13.md), with no host access and all root/install authority flags false. The operator separately reported host/guest raw observations; the contract alone does not authenticate them.

**G2-B2B8 (operator-reported disposable guest real-systemd VERIFIED in bounded scope, no repository source/CI change):** [2026-10-13 S1/S2/S11 evidence and residual gates](./c5-g2b2b8-real-systemd-operator-acceptance-2026-10-13.md). Source v2 SHA-256 `ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569`; synthetic enabled+active and disabled+inactive timer restoration, injected-exception restore, and separate unit-unloaded observation passed. Whole-host exclusion, mount namespace coverage and new-consumer prevention remain explicitly false. S3–S10/S12 and the earlier unexplained guest freeze remain open. **Next proposed B2B9 is readiness audit only, requiring separate scope approval for any new privileged test or architecture change.**

**G2-B2B8 RERUN-01 (later evidence, local review only):** the first run's raw `99-result.json` is unavailable. A separately executed second disposable-guest S1/S2/S11 rehearsal supplied a **1,488-byte original JSON receipt** with SHA-256 `fe9452cf42decc800fdaedcc918953087045f7c61268ee800bc7c0a19ead65d9`, stored without content changes at [B2B8 RERUN-01 raw JSON](./evidence/c5-g2b2b8-rerun-01-99-result.json). The uploaded file hash was independently checked against operator-reported Ubuntu original and persistent-copy digests. This is **not** first-run raw evidence, third-party guest attestation, host-wide exclusion or production authority; see [B2B8 §6](./c5-g2b2b8-real-systemd-operator-acceptance-2026-10-13.md).

**G2-B:** trusted operator delivery, mandatory maintenance gate/read-only
Live State detector, direct production path execution contract still disabled,
separate external Kit create-only crypt adapter and long-term original Archive
retention policy (without integrating the daily scheduled job).

**G2-C:** one-shot root-private install and *separate* fresh same-version
clean-reinstall kernel; build upon FD-safe patterns but preserve lab-only
`/tmp` guard in the old module. Every fault leaves a unique incident record;
never resume/replay/overwrite.

**G2-D:** independent disposable ext4 VM acceptance matrix; source proof,
malicious entries, races, SIGKILL, fresh remote restore, stale secrets/state,
repeat interruptions, preservation of DB/Uploads and original timer state.

**G2-E:** exact current-vs-target production compatibility audit and one-time
**separate** execution approval; never infer production authority from CI,
the source code being merged, a GitHub artifact's flag, or S1's simulated
round-trip receipt.

Daily S2 remains **on hold until C5 is accepted**. No underlying
`sanq-backup.service`, sudoers, script or retention cutover in this slice.

## 2026-10-16 — B02-A source identity review (local / non-authorizing)

**LOCAL SOURCE + TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO INSTALL OR CI.** The new external, non-bundle Python module `ops/runtime/trusted_operator_source_review.py` validates only the **shape** of independently supplied disposable-guest source evidence: independently pinned SHA-256, claimed installed bytes, exact root-owned private ancestry, no symlinks, leaf single-link regular file, and stable leaf FD device/inode. Unknown or inconsistent claims BLOCK. The receipt explicitly reports `evidenceSourceAuthenticated=false`, `rootOperatorExecutionVerified=false`, `quiescenceVerified=false`, `externalKitVerified=false`, `readyToInstall=false` and `authorizedToMutateProduction=false`. It neither reads or installs an operator nor collects privileged host facts and is **not** admitted to the fixed 17-member Runtime Bundle. Existing `offline_root_private_installer.py` retains its /tmp-only guard. Even a clean caller-provided record is not independent source verification; a separately approved root-private delivery and an independent guest witness are required next. No path, privilege, maintenance, backup, database, Docker or production change.

## 2026-10-16 — B02-B one-shot operator admission SOURCE SKELETON (local review)

**LOCALLY AUTHORED / TESTS NOT RUN / NO PRIVILEGED EXECUTION / REVIEW PENDING.** New external `ops/runtime/trusted_root_operator_gate.py` defines a fixed-operation, fixed-runtime/root storage identity, SHA-pinned, fail-closed review of a *hypothetical* root operator's admission contract. Only `upgrade` and separately identified `fresh-clean-reinstall` operations are recognized; ordinary upgrade prohibits the same Runtime SHA. Every maintenance, external Recovery Kit, source provenance, current app, namespace, noncooperating holder and new-consumer-prevention gate is explicitly enumerated. All fields are **untrusted caller claims**, even if true; the return is always `BLOCKED`, `readyToInstall=false`, `authorizedToMutateProduction=false`, and no root/host action is invoked. This is NOT an implemented privileged operator or source delivery. Completing a real privileged operator requires separately reviewed FD-anchored live collection and trusted root-private installation delivery, full independent VM evidence, and distinct production approval; it must never trust boolean claims. Existing 17-member Runtime Bundle and lab-only installer unchanged.

## 2026-10-16 — B02-B2 root-private FD source inspection (LOCAL REVIEW)

**SOURCE + SYNTHETIC OFFLINE TESTS AUTHORED; NOT RUN; USER REVIEW PENDING; NO ROOT EXECUTION OR PRODUCTION WRITE.** New external `ops/runtime/root_private_source_fd.py` inspects a pre-opened, **separately trusted** root anchor FD and fixed proposed descendant `/root/sanq-runtime-operator/v1/operator.py` via no-follow directory-relative FDs. It enforces owner/group/mode, same-device private directories, regular 0600 single-link source, bounded read, before/after dev/inode/mtime/ctime/size, path-entry revalidation and an independently supplied SHA-256. An explicit synthetic owner fixture path enables non-root tests; **both fixture and real-root receipts permanently remain non-authorizing**. It does not open /root, authenticate anchor provenance, execute bytes, deliver/replace a root-owned source, or guarantee against future mutation after FD closure. The proposed delivery procedure must be independently reviewed: copy exact reviewed bytes into a root-owned private staging file, verify off-VM source pin, install to fresh non-overwriting versioned location, re-open and read back via root FD from an independently validated root anchor, and separately verify no writer/admission can alter those bytes between validation and future execution. **No instructions here authorize running those commands.** Real trusted root-private delivery and execution, isolated guest/root probes, external Kit and whole-host maintenance remain separately gated. No 17-member Runtime source allowlist change, no CI or production operation.

## 2026-10-16 — B02-B3 create-only source delivery (LOCAL REVIEW)

**LOCAL SOURCE/TESTS AUTHORED; NO TESTS RUN, NO ROOT OR PRODUCTION EXECUTION.** External `ops/runtime/root_private_source_delivery.py` provides a fixed-name `v1/operator.py` create-only write under a **caller-preopened, independently authenticated** private root anchor (not authenticated here). It requires pre-existing 0700 private directories, exact owner/group, same-device no-follow FD traversal, externally pinned SHA-256 for bounded immutable input bytes, `O_EXCL|O_NOFOLLOW` creation, fsync and separate FD-anchored reopening/readback through B02-B2. A partially written or occupied destination is **never repaired, removed, replayed or overwritten**. Synthetic tests use an unprivileged temporary anchor and fixture UID, with no root execution. All receipts explicitly deny anchor authentication, independent witness, operator execution, installation readiness and production authority. No generic destination, URL, exec, sudo, systemd, Runtime installation, 17-member bundle expansion or application/backup change. **The readback is not an independent third-party witness** and FD checks do not prevent post-verification changes by root or a future executor. Actual root-private directory provisioning, independently verified root source provenance, secure execution binding and maintenance-admission barriers remain deferred to separate authorization. C5-G2 NO-GO; S2 paused.

## 6. Validation and exit

G2-A tests under existing CI `api-checks`:
`python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`.
Offline cases cover: historical main ancestry, correct CI/publish workflow
identity and exact source SHA, failed/spoofed/missing newest seals,
paired-image mismatch, repacked original Archive, no production capabilities.
The previous newest-release verifier, `stage_bundle.py` consumer, 17-file
source allowlist, app deploy and legacy lab installer are unchanged.

G2-A through G2-B2B7 PR CI have passed independently (G2-B2B7 PR #2801 / CI #7190, 7/7). B2B8 real-systemd evidence came from a separately pinned, out-of-repository guest script and operator-provided terminal/JSON output, **not** GitHub CI or independently sealed off-VM evidence. It verifies only synthetic S1/S2/S11 behavior and observed cleanup; it does not satisfy process-wide barrier, new admission prevention, Recovery Kit, install/clean reinstall, or full disposable acceptance. Production remains `C5-G2 NO-GO` pending real G2-B maintenance/Kit gates, G2-C..E and distinct operator authority. S2 remains paused.
