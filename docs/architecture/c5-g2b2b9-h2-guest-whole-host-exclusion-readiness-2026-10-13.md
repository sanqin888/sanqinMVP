# C5-G2-B2B9-H2 — Disposable guest whole-host exclusion acceptance readiness

**Date:** 2026-10-13 (America/Toronto)  
**Base:** `origin/dev@5b14e426c02917b71879839bc79d83a24a752036`, H-1 PR #2808 merged (CI #7209, 7/7).  
**Owner:** Runtime / Data / CI / Ops.  
**Status:** **LOCAL DOCUMENT / SOURCE-AND-PRIVILEGED-EXECUTION DESIGN REVIEW ONLY. H2 GUEST EXPERIMENTS NOT EXECUTED; ROOT COMMANDS NOT AUTHORIZED; C5-G2 PRODUCTION NO-GO; S2 DAILY BACKUP PAUSED.**

## 1. Why H2 and what cannot be inferred

B2B8 documented **operator-reported** successful real-systemd S1, S2, S11
and independent synthetic-unit disappearance after two executions; only
RERUN-01 has archived original `99-result.json`. The first original
receipt is missing and the prior VirtualBox freeze remains unexplained.
The actual B2B8 standalone v2 guest source was pinned **outside the Git
repository** at SHA-256
`ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569`;
**neither source nor first-run bytes are supplied by this H2 document**.

H-0 PR #2807 added a strictly untrusted **claimed negative-case schema**
for H-01..H-08; all production/root/whole-host authority flags are false.
H-1 PR #2808 added Linux-only same-UID, unprivileged orphan-holder
characterization; it is NOT real systemd S3. Previously merged B2B3/B2B4/
B2B5 separately covered advisory flock, one same-UID cwd/fd and one
inode/hardlink/mmap fixture. B2A's textual `/proc` process census
permanently refuses positive quiescence authority and leaves namespace
and admission coverage unverified.

**H2 is a guest-acceptance protocol preparation, not a claimed PASS, root
operator implementation, or permission to install anything.** Passing
individual isolated negative cases does not prove whole-host exclusion.

## 2. Narrow, reviewable experiments

| Case | Controlled disposable-guest setup | Independent observation and fail-closed result | Evidence limit |
| --- | --- | --- | --- |
| H-01 / S3 | A uniquely named **synthetic oneshot** parent exits after launching a fixture-only child, deliberately configured to survive the parent | Capture parent unit inactive, surviving child PID + kernel start ticks + UID/cgroup + live fixture cwd/fd; hypothetical handoff **BLOCKED** | Existing H-1 is not a systemd S3 PASS; guest script needs exact reviewed unit lifecycle |
| H-02 / S4 | Fixture-specific cooperating child holds exclusive kernel `flock`; independent operator tries the **same fixture lock** | Nonblocking lock attempt denied **before** any synthetic HostAdapter/handoff, then release demonstrated; still no install permission | Free lock is never noncooperator exclusion |
| H-03 / S5 | Distinct-UID *synthetic* root/ubuntu child holds fixture cwd/fd, does **not** request flock | Root-scoped observer positively detects a fixture holder or reports unknown and **BLOCKS**, despite demonstrably available flock | Ownership visibility must be verified; no cross-UID production process control |
| H-04 / S8 | Independently verified fixture-only PID birth-tick mismatch / unreadable process metadata / one deliberately truncated observation | Each uncertainty produces an explicit **unknown/BLOCKED** record, never an empty clear sample | Deterministic injected churn is not proof of live whole-host PID-race completeness |
| H-05 | Synthetic timer stopped while mock-helper descendant remains | Independent process and service-state observations show live descendant; BLOCK | Neither production backup nor installed rclone involved |
| H-06 | Old fixture file/tree is renamed while synthetic child retains inode | Block on retained dev/inode identity; path-only detector may miss it | Does not establish full bind/mount namespace coverage (B2B9-N) |
| H-07 | Lab actor ignores cooperative flock and attempts new fixture read | Existing channel is demonstrably **uncontrolled / BLOCKED**; no successful-maintenance claim | Actual prevention belongs exclusively to B2B9-A |
| H-08 | Missing actor, unreadable proc, unknown helper or exhausted scan budget | Explicit unknown and **BLOCKED**, even if known-holder count is zero | Cannot conclude all noncooperating consumers excluded |

**Execution order after separate approval:** initial gate, H-02, H-01,
H-03, H-04, then H-05/H-06/H-07/H-08. Each case is standalone with fresh
lab paths and separate pre/held/post receipts. A previous case's PASS must
not serve as another case's baseline.

Only H-01..H-04 are proposed for the **first** privileged guest batch.
H-05..H-08 stay as independent later batch because they expand fixture
types, inode identity and admission/observer failure scenarios.

## 3. Gate 0: host-controlled VM and snapshot provenance

Use only the pre-existing **disposable** `SanQ-Linux-Test` VirtualBox
guest, after *fresh* identity and isolation review. Historical operator
report: VirtualBox UUID
`0d46a6e8-abaf-4fa6-bd8d-987756143ee9`, snapshot name
`SanQ-2B2B-Verified` with UUID
`ba2d04f1-67de-4bc9-9f1b-d11b7841b47c`, guest Ubuntu 24.04.5,
systemd 255, ext4 root and /tmp, root UID 0 / ubuntu UID 1000.
**These values are historical expected identifiers, not live attestation.**

Require independently captured date-stamped **host** `VBoxManage
showvminfo` and snapshot inventory, machine and disk identity, verified
no production/shared mounts, private network, no reusable credentials,
no production containers or real `/opt/sanq/runtime`; preserve original
logs for prior unexplained freeze. Snapshot existence alone does **not**
verify rollback usability. An independent disposable rollback rehearsal
requires its own explicit snapshot-disruptive approval: do not silently
restore/revert/delete snapshots.

Any changed VM/hardware UUID, different snapshot, absence of isolation,
real SanQ data/credentials, failed filesystem boundary, degraded systemd,
stale lab process/unit or prior unresolved cleanup incident causes
**STOP before any privileged work**. Do not auto-delete preexisting units.

## 4. Gate 1: unprivileged guest inventory (read-only commands to review)

The following is an **illustrative, non-executed** inventory restricted to
the independently identified disposable guest. Commands must be reviewed
and executed only by the human operator in that guest; no VM shell,
Mac/VirtualBox access or sudo/root operations are performed via SanQ MCP.
Never run this checklist on production.

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
id -u
id -g
id -un
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
  echo 'guest Runtime path absent (claim requires independent corroboration)'
fi
```

Record **actual** output, exit codes, hostname and UTC, plus independent
host-side VM/snapshot readback. Do not print secrets, arbitrary process
environment, kernel cmdline, installed credentials, or source file
contents. No claim of Gate 0/1 completion is made by this document.

## 5. Gate 2: exact root/synthetic systemd source-and-command authorization

**HOLD; NOT AUTHORIZED.** Before any root guest command, prepare a
**separate review artifact** with:

1. Exact standalone guest runner source **bytes**, its SHA-256, reviewed
   provenance, expected VM/hardware UUID and DMI SMBIOS normalized
   identity comparison; no bypass on mismatch.
2. Fixed safe path under root-owned, non-user-writable ancestors mode
   `0700` outside any Runtime and script `0600` owned root; independently
   verify owner, ancestors, file type, symlink/hardlink absence, pinned
   digest and trusted root invocation. **Never sudo a checkout or write
   into the 17-member immutable Runtime Archive.**
3. Full literal commands for source transfer, safe pin/readback and
   exactly which synthetic units, process UIDs, `flock`, fixture paths,
   systemd settings and cleanup operations are allowed. No wildcard
   kill, systemctl operations on real SanQ unit names, `/opt/sanq/runtime`
   write, Docker, backup script, installed helper, production sudoers,
   remote Recovery Kit, network or release-state manipulation.
4. Dedicated pre-created *synthetic* unit name `sanq-g2b2b-lab-h2-*`,
   no collisions, and a complete independent list of intended artifacts.
   Root-vs-unprivileged split must be explicit; any UID/user creation,
   KillMode override or unsafe unit property requires individual review.
5. Operator-approved exact failure/abort and state restoration procedures,
   including what to do if a process, unit or original trigger cannot be
   restored. All unknowns block; never auto-terminate arbitrary PIDs.

No executable runner or privileged command sequence is part of this H2
readiness document. In particular, there is **no claim** that the old
B2B8 v2 runner supports H-01..H-04 or may be reused unchanged.

## 6. Gate 3: evidence quality, cleanup, and adjudication

For each case, require independent dated observations of:

- Guest/snapshot source identity, exact runner file digest and units
  involved; pre-state and fully restored post-state (unit load,
  enabled/disabled, active/inactive, next trigger and service descendants).
- Full synthetic actor identities: PID, `/proc/PID/stat` start ticks,
  process owner and parent/cgroup at **each** observation, lock inode,
  fixture (dev,ino), `cwd/fd` (and mmap if applicable), scan
  start/end time, unreadable/missing count, explicit observer budgets.
- Timed `pre`, `held`, `after` records; exact unambiguous
  `BLOCKED` reason and proof no hypothetical active Runtime write was
  attempted. Negative/unknown state must not be represented as quiescent.
- Cleanup of **only owned fixture** child processes, lab units and
  temporary paths, with independent `systemctl` absence/status checks
  and remaining lab PID audits. Record a nonzero failure state if cleanup
  is incomplete. Do not conflate the test's internal cleanup claim with
  independent post-test observation.
- Verbatim original JSON captured from the guest to an operator-controlled
  durable location, byte-level SHA-256 checked both sides, with separate
  documented copy provenance. Do not reconstruct missing raw receipts
  from terminal summaries or substitute a second run for the first.
- Explicit `false` for `rootLevelWholeHostExclusionVerified`,
  `mountNamespaceCoverageVerified`, `newConsumerAdmissionPrevented`,
  `crossProcessQuiescenceVerified`, `readyToInstall` and
  `authorizedToMutateProduction` in **every** receipt.

**Fail closed if:** guest boundary ambiguous; snapshot not independently
verified; pinned source mismatch; PID birth changes; foreign UID invisible;
child retained after cleanup; systemd original state differs; unknown
helper or reference persists; probe returns unreadable or exhausted;
incident output cannot be preserved. Continue no more cases until the
disposable guest is separately re-established from a reviewed baseline.
An unexplained VM freeze is **not** a deliberate power-loss S12 pass.

## 7. Architectural limits, alternatives, and next approval

A true production whole-host barrier still needs new **operator authority**
and enforced admission exclusion; existing Backup, Deploy, MCP, SSH and
other noncooperators do not honor the lab flock. Two choices remain:

- **A (preferred pending review):** operator-controlled maintenance
  window, first validated in disposable guest, then separately approved
  production choreography. Imposes planned downtime and precise
  stop/restore ownership checks. No existing service modifications in H2.
- **B (higher scope):** modify independent Backup/Deploy/MCP consumers to
  honor a shared maintenance lock/protocol. Requires separate architecture
  authorization and rollout; even then arbitrary SSH sessions are not
  covered by cooperation alone.

H2 does not choose or implement either, create a production installer,
modify service ownership or change the system's privileges. The remaining
namespace tests (B2B9-N), new-consumer admission (B2B9-A), independently
verified encrypted original Recovery Kit (G2-B3), clean reinstall
(G2-C), recovery matrix (G2-D) and exact production execution consent
(G2-E) remain separate gates.

**Next independently approvable task:** prepare the *exact source bytes,
SHA-256, literal root commands and synthetic unit definitions* for a
single H-01/H-02/H-03/H-04 disposable guest batch, review them with the
user, then seek explicit approval for that bounded experiment. **Do not
start that root/systemd experiment on the strength of this document.**

**Repository impact of H2 readiness:** documentation only. No changes
to CI, tests, `AGENTS.md`, production Runtime, B2A/H0/H1 contracts,
17-member bundle allowlist, Python dependencies, Prisma, Backup,
Deploy, MCP or systemd. Per `AGENTS.md`, no local tests/lint/build.
Remote PR delivery requires separate user review and authorization.
