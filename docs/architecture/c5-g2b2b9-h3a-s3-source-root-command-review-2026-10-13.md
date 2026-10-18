# C5-G2-B2B9-H3A — S3/H-01 guest source and root-command review package

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**Date:** 2026-10-13 (America/Toronto).  
**Baseline:** `origin/dev@82ab16d573fac051f3a5e0b167e191f6ec0ae0db`, H2 PR #2809 merged after CI #7211 7/7.  
**Owner:** Runtime / Ops.  
**Status:** **LOCAL REVIEW CANDIDATE ONLY. SOURCE NOT EXECUTED / NOT IN THE REPO; ROOT/SYSTEMD/GUEST COMMANDS NOT AUTHORIZED; NO INDEPENDENT GUEST EVIDENCE; C5-G2 NO-GO; S2 PAUSED.**

## 1. Scope and source artifact

This is **H3A**, a narrow proposed disposable real-systemd **H-01/S3**
experiment: a synthetic `Type=oneshot` service may become inactive while
its deliberately spawned, synthetic child still holds a private fixture
directory as `cwd` and keeps one file open. The only acceptable live
observation is a **negative** maintenance decision: `BLOCKED`.
The experiment does not prove positive host quiescence, all-UID process
coverage, correct namespace handling or new-consumer admission prevention.

The reviewed off-repository candidate file is named
`g2b2b9_h3_s3_guest_lab.py`. It was **created in an off-VM review
package**, *not* transferred to or executed in the disposable guest.
Its review-candidate SHA-256 is:

```text
881b0577fc9e3d96c0f86de7ce3b43addc5668875b4c2ff55bb568916848e63e
```

The source file is **not a Git tracked source**, production installer,
SanQ Runtime Archive member, backup controller, systemd production unit
or trusted current-host evidence. The off-VM byte archive must accompany
this document at the next separate review. A hash noted in a document
does not establish transfer provenance: the human operator must compare
their obtained source bytes against this exact expected SHA-256 *before*
copying and *after* installation.

**Known lab source behavior for review:** the unexecuted candidate pins
the prior operator-reported VirtualBox guest UUID
`0d46a6e8-abaf-4fa6-bd8d-987756143ee9`; uses the previously
documented VirtualBox DMI mixed-endian normalization; demands UID 0,
root-owned `0700` source parent directories and single-link `0600`
source, rejects mismatched source SHA and an existing
`/opt/sanq/runtime` path; creates a fresh root-private
`/tmp/sanq-g2b2b-lab-h3-*` fixture and uniquely named
`sanq-g2b2b-lab-h3-*.service` transient unit. Its `systemd-run`
has lab-only `Type=oneshot`, `RemainAfterExit=no` and the
**deliberately hazardous `KillMode=process`**, intended to expose
a surviving child. The child has a bounded self-exit timer; the runner
requests marker-based release and attempts to stop/reset only its exact
synthetic unit. It creates `99-result.json` with root-private `0600`
permissions. All install, all-host and admission flags remain false.

**Important readiness warning:** the source has **not been run, compiled,
tested in GitHub CI or independently audited in a guest**. Success and
cleanup reporting are self-reported, not third-party attested.
`KillMode=process` may leave a child behind if the runner itself is
killed; timeout and cleanup behavior still need independent evidence.
Do not authorize execution from the current document alone.

## 2. Gate 0/1: hard prerequisites, before any guest root command

Recheck independently on the **Mac/VirtualBox host**: current VM UUID
and disk identity, the exact disposable snapshot identity and
**rollback usability**, private network, no shared production volume,
guest credentials or cross-mount. Historical B2B8 reports of
`SanQ-Linux-Test` and `SanQ-2B2B-Verified` are not current proof.
Do not restore/switch snapshots without a separate disruptive approval.

On the Ubuntu guest, capture the unprivileged read-only Gate 1
`date/id/uname/os-release/findmnt/stat/Python/systemctl` commands from
`c5-g2b2b3-isolated-linux-acceptance-2026-10-13.md` §Gate 1 and
the H2 checklist. Confirm ext4, systemd healthy, root UID distinct from
ubuntu UID, no Runtime or sensitive mounts/credentials, and no
preexisting `sanq-g2b2b-lab-h3-*` units or fixture paths. Any
anomaly means STOP, with no automatic cleanup of unknown objects.

The transfer channel from the off-VM candidate artifact into guest
`/home/ubuntu/g2b2b9_h3_s3_guest_lab.py` must be separately documented
with an **exact, reviewed transfer command and byte-level readback**;
the guest IP/SSH port is not known, so no `scp` destination or credential
is invented here. No `sudo` may consume an unpinned checkout directly.

## 3. Proposed root command set — **NOT AUTHORIZED TO RUN**

All commands below are **only a proposal** for the identified isolated
guest after Gate 0/1, independent source-byte review, snapshot and
literal command authorization. They must never be run on production,
on a shared VM, or through the SanQ production MCP. Do not paste them
as a single unreviewed batch.

Pre-transfer/readback observation (no root):

```sh
sha256sum -- /home/ubuntu/g2b2b9_h3_s3_guest_lab.py
```

The output must equal
`881b0577fc9e3d96c0f86de7ce3b43addc5668875b4c2ff55bb568916848e63e`.
Only then consider the following **privileged guest-only candidate**
commands:

```sh
sudo install -d -o root -g root -m 0700 /root/sanq-g2b2b-h3-pin
sudo install -d -o root -g root -m 0700 /root/sanq-g2b2b-h3-pin/v1
sudo install -o root -g root -m 0600 -- /home/ubuntu/g2b2b9_h3_s3_guest_lab.py /root/sanq-g2b2b-h3-pin/v1/g2b2b9_h3_s3_guest_lab.py
sudo sha256sum -- /root/sanq-g2b2b-h3-pin/v1/g2b2b9_h3_s3_guest_lab.py
sudo stat -c '%n uid=%u gid=%g mode=%a links=%h type=%F' /root /root/sanq-g2b2b-h3-pin /root/sanq-g2b2b-h3-pin/v1 /root/sanq-g2b2b-h3-pin/v1/g2b2b9_h3_s3_guest_lab.py
```

If the SHA or `stat` readback differs, STOP. The only proposed
systemd-mutating **one-shot** invocation is:

```sh
sudo /usr/bin/python3 -I -B /root/sanq-g2b2b-h3-pin/v1/g2b2b9_h3_s3_guest_lab.py --mode run --expected-sha256 881b0577fc9e3d96c0f86de7ce3b43addc5668875b4c2ff55bb568916848e63e
```

This invocation **may start a transient root-owned synthetic systemd
unit and an intentionally surviving child**. It is not a read-only
command and has **not** been authorized or executed. It is prohibited
until the user separately approves the exact script SHA, snapshot and
this root command set.

Post-experiment **read-only guest** observations, only after any future
authorized execution:

```sh
date -u '+%Y-%m-%dT%H:%M:%SZ'
systemctl list-units --all --no-pager 'sanq-g2b2b-lab-h3-*'
systemctl list-unit-files --no-pager 'sanq-g2b2b-lab-h3-*'
```

Record the actual receipt path printed as `EVIDENCE=...`; read its
root-owned file hash using its **exact observed path**, not a
wildcard. Report the raw JSON, checksum, guest post-state and
independent synthetic unit/child absence. Original JSON must be copied
verbatim into operator-controlled durable storage, with matching
source+destination SHA-256. A missing raw artifact cannot be replaced
with reconstructed terminal text.

## 4. Required S3 adjudication (no implied positive barrier)

The source's self-reported `reportedPass` is only a candidate
**negative case result**. A qualifying independently checked S3
observation must contain: verified root source digest; exact unit
identity; parent unit `ActiveState=inactive`; surviving lab child
PID plus kernel `startTicks`, uid, cgroup; verified
`cwd` and `fd` reference to fixture; explicit hypothetical
handoff decision `BLOCKED`; no Runtime write. Before/held/after
snapshots must be temporally bounded and separately observed.

If the real systemd unit kills the child, cannot unload, leaves
a zombie or fails cleanup, S3 is **INCONCLUSIVE or BLOCKED**, never
forcibly marked passed. Do not turn `KillMode=process` on a real SanQ
unit, or kill arbitrary processes to repair a test. An unresolved
artifact/child must remain a quarantined guest incident and prevent
further experiments. The earlier guest freeze is still unexplained
and is **not S12**.

The report must keep:
`rootLevelWholeHostExclusionVerified=false`,
`mountNamespaceCoverageVerified=false`,
`newConsumerAdmissionPrevented=false`,
`crossProcessQuiescenceVerified=false`,
`readyToInstall=false`,
`authorizedToMutateProduction=false`.

## 5. Remaining H test coverage and ownership gate

**H-01/S3 only** is in the candidate script; **H-02/S4** independent
flock, **H-03/S5** synthetic foreign UID, and **H-04/S8** PID identity/
unreadable process require additional separately reviewable source
and explicit root scope before first-batch execution. H-05..H-08
are deferred to a later batch. B2B9-N namespace aliases,
B2B9-A actual new-admission prevention and G2-B3/C/D/E are distinct.

There is no change to production Backup/Deploy/MCP/SSH consumers,
installed helper/service ownership, Runtime Archive's 17-member
source allowlist, root sudoers, operating backup, Docker, Prisma or
CI. No production authority or daily S2 enablement is conferred.

**H3A exit:** independent review of off-VM source bytes, digest,
transient unit semantics, cleanup limitations and exact commands.
Only then may the user give a separate, case-scoped root/disposable
guest authorization. H3A local document itself is **not** that
authorization. No local lint/build/test performed per `AGENTS.md`.
