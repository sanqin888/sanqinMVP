# C5-G2 B02-B4B-2 — Disposable guest synthetic byte consumption readiness

**Date:** 2026-10-17 America/Toronto. **Original readiness state:** LOCAL SOURCE / TESTS AUTHORED; UNREVIEWED; NO GUEST EXECUTION OR ROOT COMMAND. **Later operator-reported update (same date):** disposable VirtualBox Guest experimental root mechanism 8/8 observed cases matched expectations; see §6 below. This does **not** close the original Gate 0/1 prerequisites or constitute independently witnessed root acceptance. **C5-G2 NO-GO; S2 BACKUP PAUSED.** Sections 1–5 preserve the pre-execution readiness protocol and its historical statements.

## 1. Trust scope and isolation

This is a narrow **execution-mechanism experiment**, **not** a trusted root Runtime Operator or production installation. The new source `ops/runtime/g2b4b2_disposable_guest_byte_consumer.py` has a real `compile/exec` ONLY for the literal reviewed synthetic bytes `RESULT = 40 + 2\n`; it cannot accept arbitrary Python bytes, a path, a command, a URL or a callback. The experiment intentionally reports `fixedSyntheticCodeConsumed=true` but always `operatorCodeExecuted=false`, `rootGuestExecutionIndependentlyWitnessed=false`, `readyToInstall=false` and `authorizedToMutateProduction=false`. **Even an observed 42 does not authenticate the interpreter or prove a safe production loader.**

The runner only reads a `/tmp/sanq-g2b4b2-lab-<eight lowercase hex>` synthetic private fixture with exact owner/group/mode, fixed marker/source filenames and exact source/marker bytes; all path descent uses no-follow FDs and matches entries against opened inode identities. The fixture must be precreated under a separately authorized operator procedure; the runner never creates, edits, removes or repairs guest files. A simulated rename after FD read demonstrates that consuming saved bytes avoids a subsequent path reopen, but it does not prove the arbitrary future Python Operator has a complete safe dependency closure.

## 2. Verified connection limitation — STOP

Current SanQ MCP offers read-only **production** host access and a writable source workspace under `/home/ubuntu/sanq-mcp-workspace`, not a disposable guest executor. Neither service is authorized for a guest root test. The ChatGPT-local Linux scratch runtime is Linux x86_64 with about 5.8 GiB RAM and 30 GiB free storage, but **no KVM device or installed QEMU/VirtualBox**; that environment can run unprivileged behavioral characterization but is **not the independent snapshot-backed Linux VM** required by G2.

The historical operator-reported `SanQ-Linux-Test` / VirtualBox identity and snapshot remain historical only. Do **not** infer that the old guest is currently available or isolated. **No root commands were executed on the guest or the production host; actual B4B-2 guest acceptance has not happened.**

## 2A. Separate ChatGPT-local Linux scratch smoke test (non-guest only)

On 2026-10-17, a **different, independently authored minimal script** ran in the ChatGPT-local Linux scratch environment after dropping to UID/GID 65534. It exercised sha256 of literal `RESULT = 40 + 2\n`, a temporary 0700 directory and 0600 source, no-follow directory-relative FD reading and inode stability, then renamed the source path and verified the **captured bytes** still produced `42` despite replacement file bytes producing a different value. Result: **PASS for this small smoke test only**. This does **not** execute the repository B4B-2 test module, validate its full test suite, provide a VM/snapshot/host root proof, or meet CI/G2 gates. The scratch file was deleted after the run. No privileged Guest command was issued.

## 3. Gate 0/1 before any guest commands

Independently verify host-side VirtualBox VM hardware UUID, disk and snapshot, isolated network, absence of production mounts/volumes/secrets, guest DMI identity, ext4 mount, correct systemd state, exact Ubuntu/Python version and guest root/ordinary UID. Use only fresh operator-provided read-only evidence and original logs, according to `c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md`. Any unknown identity, path collision, stale fixture, process/service contamination or failed snapshot verification **BLOCKS**. Never perform guest reset/snapshot restoration silently.

## 4. Gate 2 — source, interpreter and exact command review (NOT AUTHORIZED YET)

Before separate guest root test authorization, submit for user review:

- Complete independently hashed **source bytes and SHA-256** of this standalone runner, fixed manifest of its dependencies (Python stdlib imports), exact synthetic source digest, interpreter binary version/hash and dynamic dependency origins, and both host/guest independently checked source SHA. A Git checkout itself is not a privileged execution trust root.
- Source delivery to a new root-private `0700` versioned directory outside any Runtime tree, regular `0600` runner, no symlink/hardlink and no writable parent; exact non-overwriting transfer and cleanup rules. **Do not execute from workspace or user-writable checkout as root.**
- Independently approved, literal `--case-id` value and exact guest runner command with no additional args, plus a root-private fixed fixture preparation method, ownership/mode and source digest readback, and a separate independent observer.
- Before/after evidence showing exact dev/ino/byte hash of the pre-opened source, executable/interpreter and process identity; captured original stdout/stderr/exit codes and all output hashes in an operator-controlled off-repository location.
- Fault cases for missing/modified marker, source mutation, symlink, hardlink, wrong UID/mode and replaced path; each must be independently witnessed as **BLOCKED**. Avoid running any injected payload code, arbitrary user-supplied code or production-like installer during these tests.
- Cleanup only uniquely named, independently verified synthetic test artifacts after separate review. An incomplete cleanup or missing original evidence is an incident, not a success.

No root/guest commands are given or approved in this source slice. This document is **readiness and review preparation**, not permission to execute them. A new explicit command- and hash-bound approval is mandatory before any root invocation.

## 5. Distinguish available tests from mandatory next evidence

- GitHub Actions (after reviewed PR and user push authorization) may run `ops/runtime/tests/test_g2b4b2_disposable_guest_byte_consumer.py` as a **nonroot synthetic test** only, using the existing `api-checks` Runtime unittest discover step. This can validate the tiny fixed byte consumer and failure classification, not root integrity or guest isolation.
- Local ephemeral Linux container/sandbox can replay synthetic FD semantics, but cannot supply KVM-level isolation, VM host/snapshot attestation or real production Python loader verification.
- Disposable-guest root execution, interpreter/dynamic loader and full transitive import closure, independent trusted Bootstrap identity, controlled source-to-execution binding, noncooperating actor admission barrier and independent external Recovery Kit all remain **OPEN**.

**G2 cannot proceed to installation from these experiments. S2 backup remains PAUSED.**

## 6. 2026-10-17 operator-reported disposable Guest root experiment — **MECHANISM OBSERVED / G2 NO-GO**

**Evidence class:** human operator pasted actual MacBook/Ubuntu terminal output in the project conversation; the assistant reviewed the reported transcript and relevant `origin/dev` source, but did **not** connect to the Guest, witness root independently, retrieve original Guest evidence bytes, or independently certify host/Guest isolation. This later experiment **does not retroactively satisfy** the strict pre-execution Gate 0/1 readiness/independent-rollback gates above. The user explicitly authorized a bounded **`EXPERIMENTAL ROOT ONLY / G2 NO-GO`** exception and declined the snapshot *restore rehearsal*, not the production safety gates. No production Runtime command or install was authorized.

### 6.1 Operator-reported target / isolation / source identity

| Evidence | Observed operator output / boundary |
| --- | --- |
| MacBook VirtualBox target | `SanQ-H05-Restore-Check-20261015`; hardware UUID `4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033` |
| Ubuntu DMI identity | `e7d51b4b-c554-c445-9cc3-dba2ed48a033` (the expected SMBIOS byte-order representation) |
| Network | `nic1=hostonlynetwork`, `nic2..8=none`; Guest `enp0s3` MAC `08:00:27:97:c9:ea`, IPv4 `192.168.56.2/24`; no IPv4/IPv6 default route observed; macOS IPv4/IPv6 forwarding each reported `0`. These are **limited configuration observations**, not independent assurance of every network/proxy/host escape path |
| Storage / mount observation | Ubuntu 24.04.5, Python 3.12.3, ext4 `/dev/sda2` for `/` and `/tmp`; `/tmp` `root:root 1777`; no `/opt/sanq/runtime` found and no SanQ systemd unit or vboxsf/nfs/cifs mount in scoped queries; **absence of all credentials/volumes not independently certified** |
| Snapshot | `SanQ-Runtime-B4B2-Clean-Baseline-20261017`, UUID `028a681b-18b9-4dc7-a67f-69257e7cf85b`, listed and read back. **Actual restoration never attempted / unverified**, by explicit user choice |
| Runner source | Mac `origin/dev@22f422111ebd6cff93d11cb292613815acba44fb` and independently fetched GitHub `dev` source (when observed) yielded SHA-256 `0e724d1fbd8fe01852c6e7550e81f5e192da4ba155c34e8ba72297e1cdb7e537` (`8922` bytes); Guest staging readback reported the same digest |
| Stage and root pin | Unprivileged `/home/ubuntu/.sanq-b4b2-stage.P3Zacrlx/g2b4b2_disposable_guest_byte_consumer.py` (`1000:1000 0600`, private directory `0700`); root-owned `/root/sanq-b4b2-20261017-b4b20001/runner.py` (`0:0 0600`, link count 1, dev `2050`, inode `1444295`); root directory `0700` |
| Interpreter | `/usr/bin/python3.12`, SHA-256 `e50d468e8b0adfb05733f5b87b3cff34829c4a8c1aea50c865aa8bdfe4bb150f`, executed with `-I -S -B`; the operator also inventoried dynamic loader, `libc`, `libm`, `libz`, `libexpat`, `_hashlib`, and `libcrypto.so.3`. `libcrypto` SHA-256 `6866ed711dab8927e1bf82bf1cd30e828bdfc34f3cc1e83b1c9eb01ce6c37d9a`. **Transitive Python stdlib/import/native closure and independent trust origin remain OPEN** |

The source is a **fixed synthetic consumer** outside the frozen 17-member Runtime Bundle. Successful execution is not proof that a trusted Bootstrap, Operator, or production code could safely consume arbitrary executable material.

### 6.2 Observed root case matrix: 1 normal + 6 negative + 1 deterministic path replacement

Following the user's separate, narrow Guest-root approval, the operator reported a root-only preflight checking Guest DMI/MAC, no default routes, absent real Runtime path, exact pinned runner/interpreter SHA-256, new artifact collisions, root owners and modes. The root-private test fixtures use `/tmp/sanq-g2b4b2-lab-<case>` (`0700`), fixed `.sanq-g2b4b2-synthetic-only` and `synthetic.py` (`0600` unless intentionally invalid), with no arbitrary executable input. Fixed synthetic source: `RESULT = 40 + 2\n`, SHA-256 `d06a312be9e44e6885f40ce1d07653101be2c6eb864955009490097a18404a8f`.

| Case | Real root synthetic action | Operator-reported observed result | Classification |
| --- | --- | --- | --- |
| `b4b20001` | Root CLI consumed verified fixed bytes in root-owned fixture (source dev `2050` / inode `1048600`) | `ROOT_PREPARATION=PASS`, `ROOT_RUN_EXIT=0`, `fixedSyntheticCodeConsumed=true`, `decision=BLOCKED`, `operatorCodeExecuted=false` | **Observed happy-path PASS**; not production approval |
| `b4b20002` | Required Marker absent | Exit `2`, stdout empty, stderr `BLOCKED: ... FileNotFoundError` | **Observed negative PASS** |
| `b4b20003` | Synthetic source changed to `RESULT = 40 + 3\n` | Exit `2`, stdout empty, stderr `BLOCKED: ... GuestBoundaryBlocked` | **Observed negative PASS** |
| `b4b20004` | Source mode `0644` rather than `0600` | Exit `2`, stdout empty, `GuestBoundaryBlocked` | **Observed negative PASS** |
| `b4b20005` | Marker content tampered | Exit `2`, stdout empty, `GuestBoundaryBlocked` | **Observed negative PASS** |
| `b4b20006` | Source entry a symbolic link | Exit `2`, stdout empty, `OSError` | **Observed negative PASS** |
| `b4b20007` | Source with hard-link count `2` | Exit `2`, stdout empty, `GuestBoundaryBlocked` | **Observed negative PASS** |
| `b4b20008` | **Separate** root Python one-off imports the pinned runner, calls `snapshot_verified_synthetic_bytes`, renames original path, creates replacement `RESULT = 40 + 3\n`, then calls `consume_synthetic_snapshot` and attempts a fresh recapture | Exit `0`; captured inode `1048621`, replacement inode `1048622`; `snapshotConsumedAfterSwap=true`, `postSwapRecaptureBlocked=true`, `fixedSyntheticCodeConsumed=true`; no stderr | **Observed deterministic saved-byte/pass + recapture-block PASS**; not the runner CLI itself and not general concurrency proof |

**Observed tally: 8/8 narrow experiment cases matched expectations.** The six static negative fixtures reported empty stdout and `BLOCKED:` stderr, with per-case `.stdout`, `.stderr`, `.rc` files inside the Guest root-private test directory. Case `b4b20008` reported stdout SHA-256 `c7d2d7c6f5b806ab6ee6a3d8b8c974b06265d141ea99fa92080caec33f85a35b`, empty stderr SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, exit-record SHA-256 `9a271f2a916b0b6ee6cecb2426f0b3206ef074578be55d9bc94f6f3ab86aa`. These are *reported digests*, **not verified access to original evidence bytes**. No confirmation was provided that a complete host-off-Guest immutable log/receipt bundle was preserved; the happy-path receipt was pasted directly in terminal output.

The runner's own response continues to say `rootGuestExecutionIndependentlyWitnessed=false` and `independentGuestIdentityAuthenticated=false`. These are **static non-authorizing fields**; operator-reported successful root invocation does not flip them or substitute for an independent observer.

### 6.3 Closeout and evidence still blocking production

**Disposition:** `B02-B4B-2 EXPERIMENTAL ROOT SYNTHETIC MECHANISM OBSERVED (8/8)` **only**. Preserve the case-specific root Guest files and operator terminal evidence; no automatic cleanup, snapshot restore, repository execution, production installation, service/Backup/Docker alteration or GitHub push is part of this documentation closeout.

**Unclosed formal gates (explicit, not waived):**
- Snapshot **restorability** untested by operator choice; a named/listed snapshot is not a successful restore. Original §3/H2 protocol remains **NOT SATISFIED** for unconditional privileged acceptance.
- Whole-host network/host routing/proxies/shared-file and credential/volume isolation not independently certified by the observed Host-only, route, forwarding and scoped mount checks.
- Runner/interpreter/loader/library hashes and selected stdlib import origins recorded, but full transitive dependency provenance, independently trusted executable root, safe future Bootstrap/Operator execution binding and adversarial TOCTOU/concurrency coverage **not proven**.
- The path-swap case is a deterministic *post-capture* replacement, not a real scheduler-driven race or generalized no-new-consumer admission barrier. Existing B2B9-H07/noncooperator whole-host exclusion remains OPEN.
- Independent execution witnessing, complete original stdout/stderr/exit receipts with off-Guest custody, independently verified Recovery Kit, production maintenance/backup owner isolation and G2-C/D/E rollout remain OPEN.

**Final production decision: `C5-G2 NO-GO`; `S2 BACKUP PAUSED`; `readyToInstall=false`; `authorizedToMutateProduction=false`.** No source code, schema, migration, dependencies, Runtime 17-file Bundle membership, module owner, CI workflow or production Runtime behavior was changed by this operator-reported experiment or its documentation.

