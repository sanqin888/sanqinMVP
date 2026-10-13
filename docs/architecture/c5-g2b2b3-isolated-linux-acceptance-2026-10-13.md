# C5-G2-B2B3 — Isolated Linux real-process acceptance readiness

**Date:** 2026-10-13 America/Toronto.  
**Baseline:** `origin/dev@bfe2c7a0d42b325a2445c2457c2c6109c1e7e769`, G2-B2B2 PR #2795 merged, CI #7178 all green.  
**State:** LOCAL SOURCE / TEST REVIEW; root VM acceptance NOT EXECUTED; production NO-GO.

## This change: first real cross-process kernel lock test

Extend `ops/runtime/tests/test_isolated_maintenance_operator.py` with a Linux-only, **separate Python child process** holding `flock(LOCK_EX)` over a fixed disposable `/tmp/sanq-g2b2b-lab-*` fixture lock. While the child holds the lock, the isolated operator attempt must reject before calling any fake HostAdapter; after child releases, the same fixture must pass the synthetic rehearsal and still return `authorizedToMutateProduction=false`.

The child uses no root, production Runtime, systemd, Docker, MCP, network, backup scripts, real service state or external Kit. This validates cross-process *kernel lock contention* in a CI Linux environment once run, **not** exclusion of any nonparticipating application.

This first increment is intentionally narrow. No production installer or operator entrypoint is added, and the pre-existing lab-only guard remains unmodified. Tests must run in GitHub `api-checks` after user PR approval; per AGENTS.md, no local test is executed during review.

## Required independent disposable ext4 Linux acceptance

The previously described MacBook/VirtualBox Ubuntu 24.04 guest and source-pinning method can be reused **only after** confirming it remains isolated, synthetic, snapshot-backed and free of any SanQ production mount/secrets. Prior operator-executed U2D results cannot be treated as this B2B3 acceptance.

| Gate | Required evidence in isolated VM | Disposition until demonstrated |
| --- | --- | --- |
| Independent source | Hash all reviewed source bytes in trusted root-owned 0700 copy outside Runtime, verify owner/ancestor and no user-writable parents | BLOCKED |
| Real root and ubuntu UIDs | Read-only `id`, `stat`, `findmnt` verify separate users, ext4, device/inode identity and hardlink/symlink restrictions | BLOCKED |
| Synthetic actual systemd | Disposable, uniquely named units outside SanQ systemd namespace, record original enabled/active state; stop/start only with operator-approved explicit commands | BLOCKED |
| Real competing process | Disposable child holding lab cwd/fd, real kernel flock and /proc fd reference; prove lock holder is rejected, nonparticipants do not honor flock | PARTIAL: new subprocess test covers flock only |
| Procfs aliases | Compare directory mount namespace, cwd/fdinfo/dev/inode, deleted old path, mount bind, process churn and mmap holders; unresolved must block | BLOCKED |
| Revalidate | Evidence before/after claimed quiescence must be independently authenticated and temporally bounded, with no new actor able to enter during handoff | BLOCKED |
| Recovery Kit | Original prior+target Archives, create-only encrypted off-VM transaction and complete independent decrypt/readback; escrow and retention | BLOCKED, separate B3 |
| Restore | Inject failure before/after suspensions and verify exact original enable/active/next-trigger state, including when preexisting timer was disabled | BLOCKED |
| Crash | SIGKILL, reboot/power-off and audit/incident preservation on disposable ext4; never replay old journal | BLOCKED |
| Production consent | Exact VM / SHA / Kit / downtime / operator approval after all independent gates | NOT REQUESTED |

## Execution policy

No root/systemd/VM activity is performed through MCP. Before an operator runs commands on a disposable Linux guest, review exact command set, source hashes, guest identity and snapshot and separately authorize root-level probes. Only synthetic units/processes are permitted; no SanQ production paths or endpoints and no persistent sudoers/MCP permission change.

**No production installation or S2 scheduled backup integration.** Once this CI increment is merged, prepare the audited disposable-VM execution script and exact command list for user approval rather than silently running privileged host commands.

---

## G2-B2B6 — Operator acceptance gate (proposed, not executed)

**Date:** 2026-10-13 (America/Toronto)  
**Baseline:** `origin/dev@ba27dc3d08c8202d77ed403b7c10409be228da43` (G2-B2B5 PR #2798, CI #7184 7/7).  
**Status:** LOCAL REVIEW. No guest access, root/systemd execution, production installation or S2 change. Production NO-GO.

## What earlier slices prove

G2-B2B3–B2B5 CI demonstrated: real cooperating `flock` exclusion; a single noncooperating process holding cwd/fd; and hardlink or mmap inode references missed by textual path checks. They do **not** prove an entire-host barrier or prevent new Backup/Deploy/MCP/SSH consumers. The earlier Ubuntu 24.04.5 / VirtualBox / ext4 guest results dated 2026-10-10 are historical operator evidence, **not** current B2B6 acceptance.

## Gate 0 — Confirm guest/snapshot before any changes

Use only a disposable isolated VM with an independently recorded guest/disk identifier, ext4-only throwaway filesystem, independently checked fresh rollback snapshot, nonpublic network, and no SanQ production mounts, Docker volumes, credentials or `/opt/sanq/runtime` tree. Verify root=0 and distinct unprivileged guest UID, current kernel and Python, existing synthetic units and path collisions. Previous guest identity/snapshot `SanQ-Clean-Baseline` must be reconfirmed, not assumed.

## Gate 1 — Proposed *unprivileged read-only* inventory (not executed)

Run **only** in the verified disposable guest, not through production MCP. No secrets/environment or source file contents are printed.

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
id -u
id -g
id -un
getent passwd ubuntu
uname -srmo
cat /etc/os-release
findmnt -n -o SOURCE,FSTYPE,OPTIONS /
findmnt -n -o SOURCE,FSTYPE,OPTIONS /tmp
stat -c '%n uid=%u gid=%g mode=%a dev=%d inode=%i type=%F' / /tmp
/usr/bin/python3 --version
systemctl --version | head -n 1
systemctl is-system-running --no-pager
systemctl list-unit-files --no-pager 'sanq-g2b2b-*'
systemctl list-units --all --no-pager 'sanq-g2b2b-*'
if test -e /opt/sanq/runtime || test -L /opt/sanq/runtime; then
  echo 'BLOCKED: Runtime path exists'
else
  echo 'disposable guest Runtime path absent'
fi
```

If systemd reports degraded, investigate; do not fake PASS. If any lab unit/path conflicts or `/opt/sanq/runtime` exists, STOP without cleanup or overwrite.

## Gate 2 — Root source delivery / systemd scope (separate approval)

Do not run any privileged guest command until Gate 1 evidence and exact source Git commit/digests have been reviewed. Later source copy must use independently validated root:root 0700 ancestor directories outside active Runtime and 0600 source files, pinned SHA-256 and independent descriptor-backed readback. **Never `sudo python` on ubuntu-writable checkout.** Existing lab-only installer remains restricted to `/tmp/sanq-u2d2a-lab-*`.

The future reviewed command list may create/start/stop/delete only *new* synthetic, uniquely named `sanq-g2b2b-lab-*` guest-local services/timers with inert test processes, and must capture original enabled/active/timer semantics. No production service, MCP, sudoers, Docker, Backup, remote Kit or permission changes. Root commands are **not** authorized by this doc.

## Gate 3 — Synthetic process/maintenance acceptance matrix

| Case | Experiment | Required result |
| --- | --- | --- |
| S1/S2 | Timer originally enabled+active or disabled+inactive | Restore exact original enable/active/next-trigger semantics |
| S3 | Child/helper survives parent systemd service exit | BLOCK despite inactive unit |
| S4 | Competing process holds `flock` | Cooperating operator BLOCKED; release is not install authority |
| S5 | Uncooperative cwd/fd remains | BLOCK even with free `flock` |
| S6 | External hardlink alias | Path-only misses it; inode scan detects and BLOCKS |
| S7 | Closed fd with active mmap | BLOCK via file device/inode |
| S8 | PID reuse, unreadable proc metadata | Unknown => BLOCK |
| S9 | Bind/namespace aliases | Verify dev/inode/mount namespace or BLOCK |
| S10 | New process appears between clean scans | Prevent entry; a second scan alone cannot PASS |
| S11 | Inject failure during synthetic suspension | ABORT and restore original state; retain sanitized incident |
| S12 | Power loss / interrupted directory exchange | Separate cold recovery gate, NO journal replay |

Every test must record pre/held/post service state, guest identity, source hash and sanitized dated evidence. B1 caller-supplied idle counters and CI-green lab probes are **not** independent process-wide evidence.

## Gate 4 — Mandatory negative-only receipt

```json
{
  "kind": "c5-g2b2b6-disposable-guest-acceptance-v1",
  "guestAndSnapshotVerified": false,
  "rootSourcePinned": false,
  "syntheticServiceRestorationVerified": false,
  "noncooperatingConsumersExcluded": false,
  "newActorAdmissionPrevented": false,
  "mountAndInodeAliasesResolved": false,
  "crossProcessQuiescenceVerified": false,
  "readyToInstall": false,
  "authorizedToMutateProduction": false
}
```

The final three flags **never become true in B2B6**, even if individual disposable cases eventually pass.

## Future ownership decision

**Option A:** separately authorized, one-shot root operator enforces a true offline maintenance window excluding noncooperating Backup/Deploy/MCP/SSH; creates downtime but minimizes existing owner changes.

**Option B:** independently reviewed cooperative maintenance contracts and synchronized rollout of Backup/Deploy/MCP owners; larger architectural changes, and unknown shells still need exclusion.

Neither grants a Runtime write. Original old+target Archives, off-VM create-only encrypted Recovery Kit with decrypt/readback, and fresh clean-reinstall after ABORT remain separate **G2-B3/C** gates; S2 stays paused.

**Next handoff:** review Gate 0 and obtain Gate 1 **read-only** guest results before requesting exact synthetic root/systemd commands and separate authorization.
