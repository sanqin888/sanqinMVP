# C5-G2 B02-B4B-2 — Disposable guest synthetic byte consumption readiness

**Date:** 2026-10-17 America/Toronto. **State:** LOCAL SOURCE / TESTS AUTHORED; UNREVIEWED; NO GUEST EXECUTION OR ROOT COMMAND; C5-G2 NO-GO; S2 BACKUP PAUSED.

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
