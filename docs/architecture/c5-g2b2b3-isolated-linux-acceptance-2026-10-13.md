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
