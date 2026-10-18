# C5-G2-B2B9 — H-01/S3 through H-04/S8 disposable-guest negative-case closure

> **R0 现行口径（2026-10-17 Toronto）：**D1–D5 已获用户批准并冻结；当前决策、进度、C1–C8 门禁与 R0–R5 队列以 [Runtime 更新 R0 冻结设计](Runtime更新-R0冻结设计.md) 为准。本文其余内容保留发表/取证时的状态：`LOCAL`、待审、未运行及“下一批”均是当时记录，不能覆盖 R0 当前进度；原始 PASS / NOT EXECUTED 与适用边界不变。旧命令不获得重新执行授权。旧 S12/冷掉电要求按 D5 退出首版默认门禁，进程中断及独立重装仍为必验，掉电持久性仍 NOT VERIFIED。`S2 PAUSED` 指日常配置扩充/接线暂缓，不表示现役备份 timer 已停止。**R0 DESIGN FROZEN；C5-G2 NO-GO。**

**Date:** 2026-10-14 (America/Toronto).  
**Owner:** Runtime / Data / CI / Ops.  
**Base:** origin/dev@cfe7008e, after H-01/S3 RERUN-02 PR #2812 (merge 9834bd45db724badf785883b1c6221c479add0d5) and unrelated Clover PR #2813.  
**Change:** documentation and evidence only. No Runtime, Backup, Deploy, MCP, services, CI, data, migrations or public contracts.  
**Disposition:** H-01, H-02, H-03 and H-04 controlled **negative cases** operator-reported verified, with separate operator-executed guest cleanup checks. **No whole-host clearance. Production C5-G2 remains NO-GO; S2 Daily Backup remains PAUSED.**

## 1. Boundary and provenance

The governing contract is [H2 guest whole-host exclusion readiness](./c5-g2b2b9-h2-guest-whole-host-exclusion-readiness-2026-10-13.md). The H-01/S3 evidence and prior VirtualBox-freeze limitation are already in [H-3A execution evidence](./c5-g2b2b9-h3a-s3-execution-evidence-2026-10-13.md); this change does not duplicate or replace that committed receipt.

Experiments were executed by the operator only on the disposable VirtualBox Guest whose shell reported sanq-linux-test (never production sanq-web), under separate case-specific root/systemd authorization and isolated synthetic fixtures. The assistant did not operate VirtualBox or attest the actual VM hardware/disk identity, snapshot recovery, kernel state or full host census. Separate guest hostname, ps, systemctl show and sha256sum outputs were reported **after** script completion. These checks are independent of script self-cleanup, but do not prove guest authenticity, complete process enumeration, or positive safety clearance.

H-02 and H-03 JSONs are verbatim operator-uploaded original receipts from the earlier offline review bundle, without reformatting. For H-04 v1/v2, the operator provided **complete JSON as chat text**, not raw attachments. Their serialized UTF-8 bytes were restored and independently compared with the SHA-256 values reported by Guest; both byte digests match. This shows hash-identical content, **not direct independent retrieval of the Guest originals**. Keep the guest-side files. All guest experiment sources remain separately pinned off-repository and are not members of the production 17-file Runtime Archive.

## 2. Four-case acceptance summary

| Case | Observed negative behavior | Evidence and cleanup | Status |
| --- | --- | --- | --- |
| H-01/S3 | Oneshot parent inactive but detached child retained fixture cwd/fd, so handoff blocked | RERUN-02 original SHA 417a3766f3c13ac01aada6897bce305288ec208cacf90ec17066d9b683a06650 in PR #2812; PID and unit disappearance independently reported. First run's original JSON was lost after unexplained VM freeze | NEGATIVE VERIFIED |
| H-02/S4 | A cooperating holder kept exclusive flock; independent contender was contended before host adapter; release alone does not grant install authority | New JSON; PID 1050/1052/1054 absent, unit not-found/inactive/dead, SHA matches | NEGATIVE VERIFIED |
| H-03/S5 | Foreign UID 1000 actor retained cwd/fd despite free advisory flock acquired by root; handoff blocked | New JSON; PID 1354/1358 absent, unit not-found/inactive/dead/MainPID=0, SHA matches | NEGATIVE VERIFIED |
| H-04/S8 v1 Run 01 | Readiness failed before fault injection; no observations/faults recorded | New incident JSON; PID 1771 absent, unit not-found/inactive/dead/MainPID=0, SHA matches | INCONCLUSIVE, cleanup VERIFIED |
| H-04/S8 v2 Run 01 | Root-private ready handshake matched actual holder; 6/6 **injected** uncertain observer states classified UNKNOWN → BLOCKED, no adapter/handoff | New successful classification JSON; PID 1326 absent, unit not-found/inactive/dead/MainPID=0, SHA matches | NEGATIVE VERIFIED |

Each negative-case success is limited to the fixture it tested and does not imply actual Runtime mutation was attempted or that all future actors can be excluded.

## 3. H-02/S4 — independent flock contender

**Receipt:** [H-02/S4 original](./evidence/c5-g2b2b9-h3b-h02-s4-run01-99-result.json) — 2,299 bytes, SHA-256 **f87300c6210ab0640761c52be23ff594531796f6dc4e306e6efe5937299bf9e8**.  
**Pinned source SHA:** 98c408303310b95290668bf410e1adca84406e96c13cc0e61b96b2b9e41290f4.  
**Unit:** sanq-g2b2b-lab-h2-febc90f97cbc.service.  
**Guest file:** /home/ubuntu/h02-s4-run01-99-result.json.

At 2026-10-14 14:13:03–14:13:04 UTC, holder PID 1050 (UID 0, startTicks 18503) held lock dev/inode 2050/1048596. Independent PID 1052 against the same lock yielded CONTENDED, hostAdapterCalls=0, runtimeHandoffAttempted=false, hypotheticalRuntimeHandoff=BLOCKED. After release, independent PID 1054 acquired the lock, explicitly without implying maintenance authority. Script result PASS / reported exit 0 / failures=[].

**Independent cleanup:** operator ran hostname on sanq-linux-test; ps -p 1050,1052,1054 showed no rows; systemctl show returned LoadState=not-found, ActiveState=inactive, SubState=dead; saved JSON SHA matched.

## 4. H-03/S5 — foreign UID when flock is free

**Receipt:** [H-03/S5 original](./evidence/c5-g2b2b9-h3c-h03-s5-run01-99-result.json) — 2,320 bytes, SHA-256 **cf1413648f2a47536e393ef4b92819b55ba32f6ed619c5a67ecf6b3aaa176b84**.  
**Pinned source SHA:** 093c70e0dfb4ab1c918f6eb7174fc35039a0131f99a3b9c1f84732a136ccd3f7.  
**Unit:** sanq-g2b2b-lab-h3c-a74b7444ce1c.service.  
**Guest file:** /home/ubuntu/h03-s5-run01-99-result.json.

At 2026-10-14 14:32:51–14:32:52 UTC, PID 1354 (UID/GID 1000, startTicks 137297) retained cwd dev/inode 2050/1048604 and FD dev/inode 2050/1048606. Independent root probe PID 1358 successfully acquired a *different* synthetic lock 2050/1048607 (flockFree=true), but foreignUidHolderDetected=true and hypothetical handoff=BLOCKED; hostAdapterCalls=0 and no handoff attempted. reportedPass=true, failures=[]. An independent original shell exit code was not supplied.

**Independent cleanup:** on sanq-linux-test, ps -p 1354,1358 showed no rows; unit returned MainPID=0, not-found/inactive/dead; saved SHA matched.

## 5. H-04/S8 v1 — unsuccessful but preserved

**Incident receipt:** [H-04 v1 failed Run 01](./evidence/c5-g2b2b9-h3d-h04-s8-run01-inconclusive-99-result.json) — 1,182 bytes, SHA-256 **f644711f7d98649d519c81548d2b59996ed1ed2223d21081ae47983c1f412d75**.  
**Pinned source SHA:** f5d588f5365b0d80a98772b972aaa46fbbafae4b085476f0be08bcb8d37b3d80.  
**Unit:** sanq-g2b2b-lab-h3d-01b3e19ae101.service.  
**Guest file:** /home/ubuntu/h04-s8-run01-99-result.json.

At 2026-10-14 15:00:44 UTC, the script reported RESULT=BLOCKED-OR-INCONCLUSIVE / exit 2, reportedPass=false, failures=[“Blocked: holder does not retain fixture cwd”], faults=[], observations={}. PID 1771 did not have a recorded startTicks value. A source-level readiness race was identified as **plausible**, not conclusively established as the only cause. Do not rewrite this result as a successful negative test.

**Independent cleanup:** on sanq-linux-test, ps -p 1771 showed no rows; systemctl show returned MainPID=0 and not-found/inactive/dead; original and saved receipt SHA matched. Operator also listed no residual H3D units.

## 6. H-04/S8 v2 — six injected observer uncertainties

**Receipt:** [H-04 v2 successful Run 01](./evidence/c5-g2b2b9-h3d-v2-h04-s8-run01-99-result.json) — 7,822 bytes, SHA-256 **c6a0b21ad96015e88889e00cab0db519cee1de212734c85c3eb1a318ae5fad8f**.  
**Pinned source SHA:** b780be7df574041ff25b362962db96f32e6c75d0f5a02f85beb036ba5787cc82.  
**Unit:** sanq-g2b2b-lab-h3d-v2-775514415f86.service.  
**Guest file:** /home/ubuntu/h04-s8-v2-run01-99-result.json.

At 2026-10-14 19:32:02 UTC the v2 root-private holder readiness receipt independently matched live /proc PID 1326 (UID 0, PPID 1, startTicks 1029766, cwd 2050/1048598, FD 2050/1048600, expected unit cgroup). Identity stayed stable before and after the six fault classifications:

| Injected fault | UNKNOWN reason(s) | Hypothetical Runtime handoff |
| --- | --- | --- |
| pid-birth-mismatch | PID_IDENTITY_MISMATCH | BLOCKED |
| proc-stat-unreadable | PROCESS_STAT_UNKNOWN; PID_IDENTITY_MISMATCH | BLOCKED |
| proc-stat-disappeared | PROCESS_STAT_UNKNOWN; PID_IDENTITY_MISMATCH | BLOCKED |
| fd-metadata-unreadable | PROCESS_FD_UNKNOWN | BLOCKED |
| fd-entry-disappeared | PROCESS_FD_UNKNOWN | BLOCKED |
| scan-budget-exhausted | INCOMPLETE_OBSERVATION; SCAN_BUDGET_EXHAUSTED | BLOCKED |

Every frame has classification=UNKNOWN, hostAdapterCalls=0, runtimeHandoffAttempted=false, injectedNotRealKernelFailure=true, realHolderIdentityStableAcrossInjection=true. Overall reportedPass=true, failures=[]. The operator did **not** supply a separate v2 shell exit code; only the script receipt's reported result is available.

**Independent cleanup:** operator executed on sanq-linux-test: ps -p 1326 showed no rows; systemctl show returned MainPID=0 / not-found / inactive / dead; saved receipt SHA matched original. This verification is separate from the JSON's postCleanupHolder=self-reported GONE.

**Bounded conclusion:** these are synthetic frame injections following a real live holder observation, **not** induced real kernel PID reuse, /proc permission failures, or a real incomplete whole-host scan.

## 7. What remains blocked

Across all receipts, rootLevelWholeHostExclusionVerified=false, crossProcessQuiescenceVerified=false, mountNamespaceCoverageVerified=false, newConsumerAdmissionPrevented=false, readyToInstall=false and authorizedToMutateProduction=false. Neither the negative cases nor the cleanups authorize production Runtime installation.

Not verified: whole-host exclusion and real noncooperating process control; mount/bind namespace aliases (B2B9-N); new-consumer admission enforcement (B2B9-A); H-05..H-08; real Backup/Deploy/MCP/SSH cooperation; independently validated encrypted Recovery Kit (G2-B3), clean reinstall (G2-C), recovery matrix (G2-D), exact production execution approval (G2-E), or the earlier unexplained VirtualBox freeze/S12. The negative-only H-case work package must not be presented as full C5-G2 readiness.

## 8. Delivery control

This local change adds exactly this Markdown and four evidence JSONs. H-01 already exists on dev. No project source, CI or production files changed; unrelated Clover branch changes were not staged or altered. Per root AGENTS.md, stop after reviewing local diff, obtain separate user approval to push feature PR to dev, and merge only after all required CI checks are green. The guest execution permissions granted earlier do not authorize new runs or production actions.

**Frozen state:** C5-G2 NO-GO / S2 Daily Backup PAUSED.