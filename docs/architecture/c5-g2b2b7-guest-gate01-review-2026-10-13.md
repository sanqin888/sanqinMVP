# C5-G2-B2B7 — Disposable-guest Gate 0/1 evidence review

**Date:** 2026-10-13 (America/Toronto)  
**Baseline:** latest `origin/dev` after B2B6 PR #2799 merge `10f17e654469211ed1b4adf3a1219d5843d35c9a`; an unrelated POS payments commit #2800 also landed and is untouched.  
**State:** isolated workspace code review only. No connection to disposable guest; no guest or production root/systemd operation; no production authorization.

## Why this slice is the next gate

B2B6 documented a host-side snapshot, guest identity, mount, systemd and runtime-path read-only inventory. That information has **not** been supplied for the current disposable Linux VM. The historical VirtualBox/Ubuntu 24.04.5 guest evidence from October 10 cannot substitute for current evidence.

`ops/runtime/disposable_guest_gate01_contract.py` adds an entirely **inert, caller-supplied** review contract to catch missing, inconsistent or unsafe Gate 0/1 claims **before considering any privileged guest commands**. It does not obtain, sign, verify provenance of, or independently authenticate a report. Even an internally consistent synthetic record is **not** an accepted guest, a completed Gate 1 or permission to run privileged commands.

It checks an exact v1 shape with:
- the *claimed* VirtualBox VM UUID (canonical lowercase UUID) and named existing snapshot;
- non-root `ubuntu` UID/GID and root UID 0, with strict integer types;
- `ext4` root and `/tmp` and claimed same-device status for disposable filesystem scenarios;
- individually asserted isolated guest, rollback, private network, production-mount/credential absence and no active Runtime path;
- healthy `systemd` and no prior units matching the fixed synthetic test prefix.

Missing fields, extra authority claims, bad types, unit collisions, claimed non-ext4 storage and `systemd degraded` **block this exact draft contract**. Symlink and pathname races are outside this pure schema review and require separate live evidence. A different guest configuration would require human review and a documented contract change; never silently weaken validation simply to get PASS.

All resulting receipts contain `claimedEvidenceStructurallyConsistent=true` only for internally consistent **claims**, while `guestIdentityIndependentlyAuthenticated`, `snapshotIndependentlyVerified`, `fileSystemIndependentlyVerified`, `productionIsolationIndependentlyVerified`, `eligibleForRootGuestActions`, `realHostQuiescenceVerified`, `readyToInstall` and `authorizedToMutateProduction` stay **false**.

This does not become a producer of trusted evidence for B1/B2B2, a live `/proc` scanner, systemd controller, root operator or installer.

## How the actual Gate 0/1 evidence must be gathered

**Outside this PR**, the human operator must first independently identify the exact guest and the VirtualBox snapshot on the physical host. Its UUID/snapshot provenance cannot be proved by arbitrary Python dictionary fields in this repo. Independently inspect that the guest has no access to SanQ production mounts or credentials; do not trust a hostname alone.

For the historical Mac/VirtualBox setup, first identify the guest on the **physical Mac**, using the installed VirtualBox CLI (replace the placeholder with the actual VM name, and redact host paths/network details before sharing):

```sh
VBoxManage list vms
VBoxManage snapshot "<EXACT_DISPOSABLE_VM_NAME>" list --details
VBoxManage showvminfo "<EXACT_DISPOSABLE_VM_NAME>" --machinereadable
```

These commands are read-only inventory, **not** permission to restore, create or delete a snapshot. Review the actual UUID, guest disk and network isolation before continuing.

After that, on **that exact disposable VM**, execute the **unprivileged read-only command block already reviewed** in:

`docs/architecture/c5-g2b2b3-isolated-linux-acceptance-2026-10-13.md` — G2-B2B6 Gate 1.

Capture the output with its date/time, guest identity, `findmnt`, `stat`, Ubuntu identity, systemd running state and synthetic-unit listings. Do not paste credentials, process environments or production file contents.

The v1 input fields are synthetic **normalization placeholders**. Never fabricate values (including source commit, snapshot UUID, production-mount absence) from this file or convert these strings into an independent host PASS. Gate 1 completion requires review of **raw current observations plus operator-side snapshot identity**, rather than the structurally consistent object alone.

## Tests, architecture and rollout

`ops/runtime/tests/test_disposable_guest_gate01_contract.py` is discovered by the existing CI `api-checks` Python unittest step. It tests malformed records, smuggled permissions, false security booleans, degraded systemd, root user, absent snapshot, non-ext4/foreign device, and permanently false privilege gates. No local tests/build/lint were run under `AGENTS.md`; user review precedes remote PR validation.

No changes to `AGENTS.md`, CI workflows, Prisma, dependency manifest, the fixed 17-member Runtime Archive, S2 daily backup, production VM, root privileges, MCP, systemd or sudoers.

**Next handoff:** user-supplied Gate 0/1 raw read-only evidence from a verified disposable VM. Then review the **exact** source pinning and guest-specific root/systemd command list, request separate root-command approval, and only then perform a controlled synthetic systemd acceptance test. G2-B3 external historical Archive/Recovery Kit, Runtime installer and real production changes remain **NO-GO**.
