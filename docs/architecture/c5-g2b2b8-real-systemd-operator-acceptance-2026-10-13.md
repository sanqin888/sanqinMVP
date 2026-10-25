# C5-G2-B2B8 — Disposable VirtualBox guest real-systemd acceptance evidence

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。本文带日期的设计/实现与有限实验记录保留当时范围；引用旧 Kit/clean reinstall 的段落不再作为本次更新前置。

**Date:** 2026-10-13 (America/Toronto)  
**Repository baseline:** latest `origin/dev` after G2-B2B7 PR #2801 (dev merge `668ddfbe476f58479bdead44b83656f1539f765f`).  
**Result:** **S1 / S2 / S11 OPERATOR-REPORTED PASS (3/3); SYNTHETIC UNIT CLEANUP PASS; REMAINING BARRIER GATES OPEN; PRODUCTION C5-G2 NO-GO; S2 DAILY BACKUP PAUSED.**

This is a record of terminal outputs supplied by the human operator from an independently operated disposable Mac/VirtualBox/Ubuntu guest. The assistant did **not** execute the guest commands or independently attest a guest or a snapshot through this repository. The exact standalone `g2b2b8_systemd_lab.py` source and the guest evidence JSON live **outside this repository**; neither the source nor its evidence was added to the fixed 17-member Runtime Archive. This document does not turn an operator transcript into an installation token.

## 1. Scope and identity observed

- VirtualBox VM: `SanQ-Linux-Test`, VM UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`; host readback showed `hardwareuuid` equal to that same value.
- Current VirtualBox snapshot reported: `SanQ-2B2B-Verified` (`ba2d04f1-67de-4bc9-9f1b-d11b7841b47c`). Snapshot *presence* was reported; snapshot restore/rollback integrity was **not** rehearsed in B2B8.
- Guest: hostname `sanq-linux-test`; Ubuntu 24.04.5 LTS, Linux 6.8.0-146-generic, Python 3.12.3; `systemd` v255, observed `running`; distinct `ubuntu` UID 1000 and root UID 0; root and `/tmp` reported on same ext4 device. Operator's Gate 0/1 observations reported no `/opt/sanq/runtime`, foreign production mounts, or preexisting synthetic units; this is **bounded guest evidence**, not production exclusion or independently authenticated isolation.
- Source installed **in the guest only** at `/root/sanq-g2b2b8-pin/v1/g2b2b8_systemd_lab.py`. Operator's final `sudo sha256sum` readback:
  `ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569` (v2).
- Operator's `sudo stat` readback: root-owned two ancestor directories `0700`; script root-owned regular file `0600`. No root executable was installed on the production VM. This **lab source pin** is not a production installer source pin.

### v1 fail-closed and v2 UUID representation correction

The v1 script (`02a8644833d886c73faf4813586712a0b84c581f4c350c9010b9932be2673bba`) returned `BLOCKED: VirtualBox guest hardware UUID mismatch; DO NOT override` before the systemd rehearsal. The Mac VirtualBox VM/hardware UUID was `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`; guest root-only `/sys/class/dmi/id/product_uuid` returned `e8a6460d-afab-a64f-bd8d-987756143ee9`. The first three UUID fields differed only by SMBIOS/DMI mixed byte order. The separately reviewed standalone v2 source normalized the DMI UUID by `UUID(bytes_le=UUID(raw_dmi).bytes)` and **retained** an exact pinned-identity check rather than bypassing it. Its SHA and root-private path were subsequently checked in the guest. v1's `BLOCKED` is not a failure of S1/S2/S11, which did not start in that attempt.

## 2. Real systemd test receipt (operator terminal output)

One successful v2 invocation was reported:

```sh
sudo /usr/bin/python3 -I -B /root/sanq-g2b2b8-pin/v1/g2b2b8_systemd_lab.py --run --expected-sha256 ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569
```

The guest reported `LAB=/tmp/sanq-g2b2b-lab-b2b8-qql870j5` and
`EVIDENCE=/tmp/sanq-g2b2b-lab-b2b8-qql870j5/99-result.json`.
These are **volatile guest-local paths**, not independently archived immutable evidence; no off-VM evidence readback was performed or claimed.

| Scenario | Operator-reported original / injection | Operator-reported restoration | Result |
| --- | --- | --- | --- |
| **S1** original timer enabled + active | `load=loaded`, `file=enabled-runtime`, `active=active`, `next=Thu 2099-01-01 00:00:00 UTC` | All four observed fields unchanged, including next trigger | **PASS** |
| **S2** original timer disabled + inactive | `load=loaded`, `file=disabled`, `active=inactive`, `next=""` | All four observed fields unchanged | **PASS** |
| **S11** synthetic exception during suspension | `S11_injected="synthetic exception recognized"` | `load=loaded`, `file=enabled-runtime`, `active=active`, `next=Thu 2099-01-01 00:00:00 UTC` | **PASS in this injected-failure case** |

Result JSON reported `PASS: true`, `failures: []`, `cleanupFailures: []`, and `syntheticServiceStateRestorationVerified: true`. After script completion, separate operator `systemctl` queries returned:

```text
sanq-g2b2b-lab-b2b8.timer: LoadState=not-found; ActiveState=inactive
sanq-g2b2b-lab-b2b8.service: LoadState=not-found
systemctl list-unit-files 'sanq-g2b2b-lab-b2b8.*': 0 unit files listed
```

This verifies the **observed synthetic unit lifecycle**; it is not a claim about all possible residual files, persistent host state, or real SanQ backup/production units.

## 3. Earlier guest freeze — separate unresolved incident

Before the successful run, the operator reported a VirtualBox guest freeze while pasting a command into SSH: the first SSH stopped responding, a second SSH connection timed out, and the VirtualBox console stopped responding. The host's VBox.log contained `VMMDevHeartbeatFlatlinedTimer: Guest seems to be unresponsive`; ACPI shutdown did not complete, and the operator subsequently powered off the **disposable** VM. After a fresh boot, `systemd` reported `running`, synthetic unit paths were absent, and the previous boot journal showed only install/hash/stat sudo activity matching the lab script, not a confirmed test invocation. Logs also included virtualization/clock/driver warnings, without establishing a root cause.

The operator explicitly declined an additional full frozen-state disk backup; an external copy of VBox.log was reported. **Freeze cause UNKNOWN / not attributed to the lab script; no kernel-level fault diagnosis or cold-recovery proof; successful later S1/S2/S11 does not resolve this incident.** Do not label this event a successful S12 power-loss experiment.

## 4. Negative-only limits and unverified gates

The v2 JSON deliberately retained these `false` fields:

- `rootLevelWholeHostExclusionVerified=false` — no proof that every noncooperating root/ubuntu, Backup, Deploy, MCP, SSH, service child or unknown consumer is excluded.
- `mountNamespaceCoverageVerified=false` — no complete cross-namespace bind/mount, inode, deleted-path and mmap coverage.
- `newConsumerAdmissionPrevented=false` — no durable mechanism blocking a new consumer between the observations and an active Runtime exchange.

The G2-B2B6 remaining acceptance cases **S3–S10 and S12** are not covered by this receipt. In particular, this is not a cold power-loss/reboot, production timer, Recovery Kit, archive-provenance or fresh clean-reinstall test. The source and observed synthetic systemd restoration are **not** a trusted production root operator, quiescence barrier, or production acceptance.

No changes were made to the production VM, `/opt/sanq/runtime`, `sanq-backup.service`, S2 scheduling, release/deploy owners, Docker, Prisma, sudoers, CI or the Runtime Archive from this document-only closure.

## 5. Disposition and next handoff

**Close only the bounded G2-B2B8 disposable real-systemd S1/S2/S11 rehearsal as operator-reported VERIFIED; do not close full G2-B, production C5-G2 or the S2 backup hold.**

Next: **G2-B2B9 read-only remaining-safety-coverage readiness audit**. Freeze a separately reviewable contract for whole-host noncooperating consumer exclusion, mount namespace/inode aliases and new-actor admission, plus the outstanding S3–S10/S12 failure/cold-recovery cases. If this requires changing Backup, Deploy, MCP, installed systemd ownership, production privileges or other module boundaries, first present the reason, operational impact and alternatives and obtain explicit authorization. Any additional disposable root/systemd experiment likewise requires its own reviewed exact commands/source hash and authorization. Production stays **NO-GO**; S2 daily backup stays **PAUSED**.

**Change scope of this closure:** architecture documentation only; no repository source/test/CI modification, no local lint/build/test, no commit/push/PR until explicit user review and authorization.

## 6. 2026-10-13 — Separate RERUN-01 original evidence acquisition (later local review)

The first run's volatile `/tmp/sanq-g2b2b-lab-b2b8-qql870j5/99-result.json` was later found missing; **that original raw artifact remains unavailable**. Do not retroactively attribute any rerun evidence to the first run or treat the earlier VirtualBox freeze as a validated S12 test.

The human operator separately re-executed the **same pinned v2 script** in the disposable Ubuntu guest:

- Command: `sudo /usr/bin/python3 -I -B /root/sanq-g2b2b8-pin/v1/g2b2b8_systemd_lab.py --run --expected-sha256 ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569`
- Second-run lab: `/tmp/sanq-g2b2b-lab-b2b8-ds_4vyqx` (different from the first run).
- Receipt's own UTC time: `2026-10-13T18:09:27.741175+00:00`; receipt's `gate=c5-g2b2b8-disposable-systemd-v1`, `stage=99-result`, unit `sanq-g2b2b-lab-b2b8.timer`, and claimed guest UUID `0d46a6e8-abaf-4fa6-bd8d-987756143ee9`.
- Guest `sudo stat`: original `99-result.json` root:root `0600`, **1,488 bytes**; `sudo sha256sum` matched the separately created `/home/ubuntu/g2b2b8-20261013-rerun-01-99-result.json` copy.
- The user then supplied the **actual rerun JSON file**; a local byte-level SHA-256 check of the uploaded 1,488-byte file matched the two guest command outputs exactly:
  `fe9452cf42decc800fdaedcc918953087045f7c61268ee800bc7c0a19ead65d9`.
- **Exact uploaded original content, not reconstructed from terminal output:** [RERUN-01 `99-result.json`](./evidence/c5-g2b2b8-rerun-01-99-result.json). Its JSON bytes must remain unchanged in the repository; metadata belongs in this Markdown document.

### Result and negative-only gates

In the raw rerun receipt, `observations.PASS=true`, `observations.failures=[]`, `observations.cleanupFailures=[]`, `observations.events.syntheticServiceStateRestorationVerified=true`. The S1 enabled+active, S2 disabled+inactive and S11 injected-failure restoration fields repeat the earlier successful behavior. The operator **separately** ran `systemctl` checks, reporting timer `LoadState=not-found` / `ActiveState=inactive`, service `LoadState=not-found`, and **0 unit files**; these independent terminal observations are **not fields within this JSON artifact**.

The receipt explicitly keeps `authorizedToMutateProduction=false`, `readyToInstall=false`, `crossProcessQuiescenceVerified=false`, `observations.mountNamespaceCoverageVerified=false`, `observations.rootLevelWholeHostExclusionVerified=false` and `observations.newConsumerAdmissionPrevented=false`. No S3–S10/S12 acceptance, true host-wide exclusion, namespace coverage, new admission prevention, independent guest attestation, Recovery Kit, source-to-release authorization or production cutover is established.

**Evidence provenance limitation:** identical file hashes corroborate the chain from the operator-reported Ubuntu original/copy to the user-uploaded file; they do **not** independently authenticate the guest, establish a trusted timestamp, prove the complete test harness, or turn the operator's report into production authority. MacBook persistence and backup durability outside this Git repository are independent operator responsibilities.

**RERUN-01 local change boundary:** this addition and the separate raw JSON are documentation/evidence only. No modified source/test/CI, no production or guest commands performed by MCP, no local CI runs, and no commit/push/PR until separate user review and approval. Production `C5-G2 NO-GO`; S2 scheduled daily backup remains `PAUSED`.
