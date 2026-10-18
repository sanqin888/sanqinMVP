# C5-G2 — Trusted Runtime independent acceptance and installation authority contract

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。

**当前基线：**本次文档从 `origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c` 审阅；R0 初始冻结与下文日期条目是各自历史状态。当前进度见 [R0 §3–4](Runtime更新-R0冻结设计.md)。2026-10-18 **C2 可丢弃 VirtualBox 隔离合成恢复前置项已基于 [B2B2 §9.6](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 有界 CLOSED / N-07 LIMITED-ACCEPTED**；该结论只解除重复合成恢复的 C2 证据问题，不能自动认证 Host 初始可信性、真实 AWS 快照、同平台持续维护冻结、C1 或 G2 生产权限。

## 1. 当前设计与所有权

[AWS 快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 是 RUNTIME-SNAPSHOT-01 / MAINT-RESTART-01 详细合同：正常更新执行器验证来源，在持续维护停写中先生成合格快照，更新失败 ABORT，保持冻结，人工确认从准确快照创建替代实例。禁止 replay 旧 journal；旧 Recovery Kit/故障机 Python 自举 clean reinstall 不再是本次更新前置。

- Runtime 发布来源：`build_bundle.py` / `runtime_trust.py`；准确 17 成员、Manifest `productionActivationAuthorized=false`、配对 GHCR digest 不变。
- `historical_runtime_publication.py` 是外置只读辅助 verifier；保留其准确 SHA/Archive/CI/publish/seal 验证行为，不因恢复路线改变而弱化；云快照恢复不强制先取回旧 tar.gz。
- 应用 deploy/rollback：现役 `deploy_release.py`；应用 SHA/current/previous 与 Runtime 版本分开。正常 Runtime 更新不触发 rollout、迁移或改业务数据。
- 日常备份：现役 ubuntu backup service、脚本、Nginx helper/sudoers 和独立 escrow；S2 新扩充继续后置，不放宽 root state 0600。
- 待实现协调器：受限 AWS API、准确快照及故障 VM 外清单；推荐在故障 VM 外运行，认证位置/最小 IAM 实现前独立审阅，不在本批布置凭据。
- 待实现生产执行器：一次性受信任 root-private 正常 installer，及准确清单内容器 restart policy/停服/任务/入口维护控制；不得扩为通用 Docker/DB writer、任意 MCP sudo、长期 Root Launcher 或第 18 Bundle 成员。不得修改已认证 Compose 来设置 no。
- **仅设计批准、无实际主机或云写授权。**既有组件 `readyToInstall=false` / `authorizedToMutateProduction=false` 的 guard 原样保留。

## 2. 目标发布与恢复点证明

| 对象 | 当前要求 |
| --- | --- |
| 正常目标发布 | 普通 latest published paired release 策略保持；准确原 Archive SHA256、main/CI/publish/seals/digests、17+Manifest 与实际执行来源均验证 |
| 指定历史 Archive（如另有用途） | 使用原历史 verifier 完整规则，不能换 SHA/repack/改 status 或用较弱 verifier 让失败 PASS |
| 当前安装与 AWS 恢复点 | 维护冻结前确认安装/应用/存储完整健康；准确账户/Region/fromInstanceArn、唯一手动快照、覆盖盘/txid、available、离机恢复清单与真实恢复验收共同成立 |

GitHub proof 是仓库/可信 workflow 边界下的来源证明，不是独立数字签名；AWS 快照 ARN 不是原 Archive hash。Artifact 90 天保留不保证长期旧字节可用，本次整机恢复不再把“双旧/新 Archive 的 crypt/Drive 取回”作为并列必做；目标新代码来源与每日独立备份仍分别保留。

## 3. 当前强制门禁（均未完成整体验收）

| 门禁 | 必须独立核对 | 失败 |
| --- | --- | --- |
| 执行来源 | 正常更新程序准确 source/hash、root-private 路径/权限、实际解释器与依赖/输入及独立来源 | BLOCKED |
| 目标版本 | 准确 main SHA、原 Archive/hash、CI/publish/seals、17+Manifest 与 paired digests | BLOCKED |
| 应用与存储 | env/state/current/previous/running images 一致、向后兼容、sanq-app/pgdata/uploads 与外部安装副本准确 | BLOCKED |
| 权限与动态状态 | root state 0600、ubuntu env 0600、原 C4 marker、正常安装 bytes/UID/GID/mode 和独立 inode 复制 | BLOCKED |
| 持续维护 | 先保存原状态并离机记录，准确容器 no/正常停止；禁入所有启动/写入入口与 namespace/持有者，快照首启跨重启仍维护 | BLOCKED |
| 本次快照 | 代码唯一创建→准确 API 对象 available→源/盘/txid 与一致性确认→离机清单；错误/冲突/超时/未知拒绝安装 | BLOCKED |
| 正常交接 | 私有候选/preimage、fsync/受支持同设备交接、完整复验、不覆盖旧槽；不自动续 journal | INCIDENT / STOP |
| 替代恢复 | 精确快照创建独立 AWS 实例，首启冻结、旧机防双写；数据/版本/身份/外部事件核对后人工确认切流 | BLOCKED |
| 退出 | 独立完整核对成功后按原 restart/task enabled-active 状态恢复并最后放行业务；失败继续维护 | NOT VERIFIED |

单独 flock、一次 stop 或两次空扫描不构成屏障；重建容器可能带回 always，必须禁止并复查。保护窗口从快照点到最终放行；发生新业务写入/外部未知态后不能盲目恢复旧整盘覆盖订单。API 超时先查准确操作/对象，不自动选 latest 或覆盖重试。不能把调用方 boolean、自报 hash 或路径作为唯一权限。

## 4. A–F 授权层级（按现行恢复路线解释）

- **A 架构：**两项设计已批准；源码评审/开发权限不等于实际 AWS 或 root 操作权限。
- **B 隔离验收：**既有可丢弃 VirtualBox C2 恢复准备已于 2026-10-18 有界关闭，N-07 有记录的历史证据限制接受；**这不是 G2-B 整体同平台 AWS 验收**。真实 AWS 控制面快照、新实例以及 `restart=no` 首启持续冻结必须按准确对象另行演练并独立签认；不以 C2 closeout 自动进入 G2-C/D/E 或 Guest/root 操作。
- **C 独立组合验收：**最终候选 CI 与 R0 A01–A18 / 快照方案 S01–S12，同平台正常更新、拒绝/中断、准确快照恢复、再次失败、原策略恢复和放行后事故边界；旧合成 PASS 不能代替。
- **D 生产就绪审阅：**当前主机/备份/消费者/外部副本/平台与准确目标；Runtime source 不等于 app SHA。兼容不明则停止成组发布审阅，不隐含上线 S2。
- **E 精确执行授权：**明确旧/目标主机、账户/Region/实例/盘、Runtime/Archive/执行器身份、快照创建/恢复对象与 API 权限、txid/离机清单、应用/原策略、停机窗口/执行人/停止规则。D 通过不授予 E；恢复新实例及切流按事故准确确认。
- **F 执行后独立复验：**准确 Runtime/应用/动态状态/DB/Uploads/C4、维护与单写者、外部事件对账、恢复原策略和最终放行；保留快照/旧资产/证据，未知不关闭。

## 历史分批原文与有限证据

以下 §5 及后续日期条目保留原实现/实验/当时待办。涉及旧 Kit、双 Archive 或故障主机 clean reinstall 的设计不再是当前路线；其 LOCAL/NOT RUN/下一批不覆盖上面现行合同，也不因本次改文档升级结果。

## 5. Small, independently reviewed G2 slices

**G2-A (merged):** standalone historical-main immutable Archive verifier and synthetic failure tests, PR #2791 / CI #7169 green. **NOT** a production installer.

**G2-B1 (merged):** bounded, negative-only normalized maintenance evidence contract and offline regression coverage, PR #2792 / CI #7171 green. It does not read the host, grant authority or create a true quiescence barrier.

**G2-B2A (merged, PR #2793):** read-only, root-required `/proc` textual-reference census with synthetic fixture tests; cannot establish a barrier or authority. See [G2-B2A process census](./c5-g2b2a-proc-reference-census-2026-10-13.md).

**G2-B2B through G2-B2B5 (merged, PRs #2794–#2798):** synthetic operator rehearsal, double idle-report negative check, second-process flock, same-user real Linux cwd/fd fixture, and isolated inode/hardlink/mmap fixture observation. All require explicit negative-only receipts; **none** prove cross-process quiescence, forbid new consumers, cover all namespaces, or grant root install authority.

**G2-B2B6 (merged, PR #2799):** independent disposable Linux VM root/systemd [B2B3/B2B6 guest acceptance protocol](./c5-g2b2b3-isolated-linux-acceptance-2026-10-13.md), originally published as a **not-yet-executed plan**; B2B8 below records only the later S1/S2/S11 execution, not the full matrix or production gate.

**G2-B2B7 (merged, PR #2801, CI #7190 7/7):** inert [claimed disposable guest Gate 0/1 review](./c5-g2b2b7-guest-gate01-review-2026-10-13.md), with no host access and all root/install authority flags false. The operator separately reported host/guest raw observations; the contract alone does not authenticate them.

**G2-B2B8 (operator-reported disposable guest real-systemd VERIFIED in bounded scope, no repository source/CI change):** [2026-10-13 S1/S2/S11 evidence and residual gates](./c5-g2b2b8-real-systemd-operator-acceptance-2026-10-13.md). Source v2 SHA-256 `ec8674bdbea237d8b780e03ba7e298bdc7d9429467a5ce48b3c2e4c31f6f4569`; synthetic enabled+active and disabled+inactive timer restoration, injected-exception restore, and separate unit-unloaded observation passed. Whole-host exclusion, mount namespace coverage and new-consumer prevention remain explicitly false. S3–S10/S12 and the earlier unexplained guest freeze remain open. **此为 B2B8 当时的下一步；H-01–H-08 已有后续有限负向证据。当前已批准 D2-A，下一步按 R0 的 R1/R2 补真实闭包与维护禁入；具体 privileged Guest 命令仍需单独批准。**

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

Daily S2 配置扩充/接线按已批准 D4 **on hold until v1/C5 is accepted**；首次更新前置是 mandatory preinstall Kit、现役日常备份健康和独立 DR 可用性，不等待新的 daily helper。此处不暂停现役 timer。No underlying
`sanq-backup.service`, sudoers, script or retention cutover in this slice.

## 2026-10-16 — B02-A source identity review (local / non-authorizing)

**LOCAL SOURCE + TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO INSTALL OR CI.** The new external, non-bundle Python module `ops/runtime/trusted_operator_source_review.py` validates only the **shape** of independently supplied disposable-guest source evidence: independently pinned SHA-256, claimed installed bytes, exact root-owned private ancestry, no symlinks, leaf single-link regular file, and stable leaf FD device/inode. Unknown or inconsistent claims BLOCK. The receipt explicitly reports `evidenceSourceAuthenticated=false`, `rootOperatorExecutionVerified=false`, `quiescenceVerified=false`, `externalKitVerified=false`, `readyToInstall=false` and `authorizedToMutateProduction=false`. It neither reads or installs an operator nor collects privileged host facts and is **not** admitted to the fixed 17-member Runtime Bundle. Existing `offline_root_private_installer.py` retains its /tmp-only guard. Even a clean caller-provided record is not independent source verification; a separately approved root-private delivery and an independent guest witness are required next. No path, privilege, maintenance, backup, database, Docker or production change.

## 2026-10-16 — B02-B one-shot operator admission SOURCE SKELETON (local review)

**LOCALLY AUTHORED / TESTS NOT RUN / NO PRIVILEGED EXECUTION / REVIEW PENDING.** New external `ops/runtime/trusted_root_operator_gate.py` defines a fixed-operation, fixed-runtime/root storage identity, SHA-pinned, fail-closed review of a *hypothetical* root operator's admission contract. Only `upgrade` and separately identified `fresh-clean-reinstall` operations are recognized; ordinary upgrade prohibits the same Runtime SHA. Every maintenance, external Recovery Kit, source provenance, current app, namespace, noncooperating holder and new-consumer-prevention gate is explicitly enumerated. All fields are **untrusted caller claims**, even if true; the return is always `BLOCKED`, `readyToInstall=false`, `authorizedToMutateProduction=false`, and no root/host action is invoked. This is NOT an implemented privileged operator or source delivery. Completing a real privileged operator requires separately reviewed FD-anchored live collection and trusted root-private installation delivery, full independent VM evidence, and distinct production approval; it must never trust boolean claims. Existing 17-member Runtime Bundle and lab-only installer unchanged.

## 2026-10-16 — B02-B2 root-private FD source inspection (LOCAL REVIEW)

**SOURCE + SYNTHETIC OFFLINE TESTS AUTHORED; NOT RUN; USER REVIEW PENDING; NO ROOT EXECUTION OR PRODUCTION WRITE.** New external `ops/runtime/root_private_source_fd.py` inspects a pre-opened, **separately trusted** root anchor FD and fixed proposed descendant `/root/sanq-runtime-operator/v1/operator.py` via no-follow directory-relative FDs. It enforces owner/group/mode, same-device private directories, regular 0600 single-link source, bounded read, before/after dev/inode/mtime/ctime/size, path-entry revalidation and an independently supplied SHA-256. An explicit synthetic owner fixture path enables non-root tests; **both fixture and real-root receipts permanently remain non-authorizing**. It does not open /root, authenticate anchor provenance, execute bytes, deliver/replace a root-owned source, or guarantee against future mutation after FD closure. The proposed delivery procedure must be independently reviewed: copy exact reviewed bytes into a root-owned private staging file, verify off-VM source pin, install to fresh non-overwriting versioned location, re-open and read back via root FD from an independently validated root anchor, and separately verify no writer/admission can alter those bytes between validation and future execution. **No instructions here authorize running those commands.** Real trusted root-private delivery and execution, isolated guest/root probes, external Kit and whole-host maintenance remain separately gated. No 17-member Runtime source allowlist change, no CI or production operation.

## 2026-10-16 — B02-B3 create-only source delivery (LOCAL REVIEW)

**LOCAL SOURCE/TESTS AUTHORED; NO TESTS RUN, NO ROOT OR PRODUCTION EXECUTION.** External `ops/runtime/root_private_source_delivery.py` provides a fixed-name `v1/operator.py` create-only write under a **caller-preopened, independently authenticated** private root anchor (not authenticated here). It requires pre-existing 0700 private directories, exact owner/group, same-device no-follow FD traversal, externally pinned SHA-256 for bounded immutable input bytes, `O_EXCL|O_NOFOLLOW` creation, fsync and separate FD-anchored reopening/readback through B02-B2. A partially written or occupied destination is **never repaired, removed, replayed or overwritten**. Synthetic tests use an unprivileged temporary anchor and fixture UID, with no root execution. All receipts explicitly deny anchor authentication, independent witness, operator execution, installation readiness and production authority. No generic destination, URL, exec, sudo, systemd, Runtime installation, 17-member bundle expansion or application/backup change. **The readback is not an independent third-party witness** and FD checks do not prevent post-verification changes by root or a future executor. Actual root-private directory provisioning, independently verified root source provenance, secure execution binding and maintenance-admission barriers remain deferred to separate authorization. C5-G2 NO-GO; S2 paused.

## 2026-10-16 — B02-B4A inert execution-material identity binding (LOCAL REVIEW)

**LOCAL SOURCE + SYNTHETIC UNIT TESTS AUTHORED / NOT RUN / NO ROOT OR PRODUCTION EXECUTION.** New external `ops/runtime/root_operator_execution_binding.py` implements a *pure, non-executing* byte-snapshot model for the gap between B02-B2/B3 readback and a hypothetical future consumer. It accepts bounded immutable source bytes, an independently supplied pinned SHA-256 and **caller-claimed** FD identity (device, inode, size, mtimeNs, ctimeNs); it re-hashes on handoff and rejects divergent claims, changed snapshots, equal-content copied buffers, path-reopen/import-based strategies, or a proposed consumer that is not the exact same Python bytes object. It has **no OS/open/exec/importlib/subprocess/callback/file-write entrypoint** and is intentionally outside the frozen 17-member Runtime Bundle. Even a structurally consistent same-object model returns `decision=BLOCKED`, `readyToInstall=false`, `authorizedToMutateProduction=false`. The caller-claimed FD tuple is *not* authenticated by this model. Same Python object identity is only synthetic evidence of an in-process byte-channel discipline, **not evidence that a privileged interpreter consumed those bytes**. The actual FD lifetime, root anchor provenance, interpreter/loader/dependency import closure, TOCTOU-resistant consumption, independent witness, host quiescence, Recovery Kit and production approval remain unimplemented / separately gated. B02-B2 and B02-B3 interfaces are unchanged; no real Runtime or `/root` access. C5-G2 NO-GO; S2 backup paused.

## 2026-10-16 — B02-B4B-1 non-executing trusted Bootstrap prototype (LOCAL REVIEW)

**SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO ROOT EXECUTION.** New external `ops/runtime/trusted_root_bootstrap_blueprint.py` composes existing B4A immutable source-object binding with a narrowly fixed **claimed** Bootstrap identity (`/root/sanq-runtime-operator/bootstrap-v1/bootstrap.py`, `0600`), pinned **claimed** regular interpreter (`/usr/bin/python3.12`, `0755`, proposed flags `-I -S -B`) and a synthetic *direct-file-import-only* stdlib inventory. Each imported top-level single-file module must be explicitly present in both a separately proposed SHA-256 pin map and a claimed root-owned `/usr/lib/python3.12/<name>.py` file record. AST parsing **does not execute** candidate bytes; it rejects nested/relative/wildcard imports and obvious dynamic module/code loader calls. It **cannot establish transitive import closure**, absence of indirect dynamic imports, interpreter executable/loader authenticity, or actual byte consumption. Runtime imported modules may include packages/builtins/extensions; these are intentionally **unsupported** by this initial narrow model and require separately reviewed closure design. The file stat metadata, hashes and isolated flags are **caller claims**, not independent FD or host evidence. Even a fully consistent synthetic blueprint returns `decision=BLOCKED`, `rootExecutionAttempted=false`, `readyToInstall=false`, `authorizedToMutateProduction=false`, and all real provenance/closure/maintenance/Recovery Kit verifications false. No CLI, `exec`, `eval`, `subprocess`, privileged execution capability, Runtime/archive mutation, 17-file Bundle expansion, deployment, sudoers/systemd or production change.

**Before any B4B-2 privilege:** independently authenticate both Bootstrap and operator bytes with an external trust root; identify exactly who opens/holds and consumes FD-backed bytes without reopening a path; independently pin the actual interpreter binary, dynamic loader/native libraries, startup flags, environment and complete transitive import closure; demonstrate fail-closed behavior against TOCTOU, forged claims, fake Python path/import substitution, incomplete source delivery and unknown system state on a separately authorized disposable Linux VM. B4B-1 CI, if green later, is *not* privileged verification. C5-G2 stays NO-GO and S2 remains PAUSED.

## 2026-10-17 — B02-B4B-2 synthetic guest byte-consumer source / NOT EXECUTED

**LOCAL SOURCE + SYNTHETIC TESTS / USER REVIEW PENDING / NO ROOT/VM TEST.** Added external `ops/runtime/g2b4b2_disposable_guest_byte_consumer.py` and unprivileged tests for Linux-only, fixed bytes `RESULT = 40 + 2\n` consumed through a bounded verified synthetic /tmp fixture with FD identity checks. This is a **real compile/exec of one fixed harmless expression** but **not** the trusted Bootstrap/Operator and cannot load caller-supplied code or access production Runtime. It always denies production authority. The current MCP has no guest command access, and local ChatGPT compute lacks QEMU/KVM: `B4B-2 GUEST REAL-ROOT VERIFICATION = NOT RUN`. See [B02-B4B-2 disposable guest acceptance](./c5-g2b4b2-disposable-guest-byte-consumption-acceptance-2026-10-17.md) for explicit Gate 0/1, source-hash review, exact command approval and independent evidence requirements. No existing Runtime 17 member, maintenance/backup owner, root privileges or production services changed; S2 stays paused and G2 NO-GO.

## 2026-10-17 — B02-B4B-2 operator-reported **Guest synthetic root experiment** (later evidence)

**EXPERIMENTAL MECHANISM 8/8 OBSERVED / NOT AN INDEPENDENT ROOT TRUST OR INSTALL GATE.** A human operator later reported MacBook VirtualBox Host-only Guest `SanQ-H05-Restore-Check-20261015`, VM UUID `4b1bd5e7-54c5-45c4-9cc3-dba2ed48a033`, with a pinned external synthetic consumer SHA-256 `0e724d1fbd8fe01852c6e7550e81f5e192da4ba155c34e8ba72297e1cdb7e537`. Root fixed-byte case `b4b20001` exited 0 with `fixedSyntheticCodeConsumed=true`/`decision=BLOCKED`; six scoped negative cases `b4b20002..07` exited 2 and rejected; separately imported pinned runner functions in a one-off root path-swap case `b4b20008` consumed previously captured bytes and blocked recapture. The operator skipped snapshot **restore** validation by explicit choice: this does **not** waive the existing formal Gate 0/1 rollback requirement, establish independent execution witnessing, authenticate interpreter/stdlib/dynamic transitive closure, prove host-wide/admission exclusion or authorize a production Bootstrap. §B4B-2 above preserves the historical *pre-execution* state. Full case/evidence/provenance record: [disposable Guest acceptance §6](./c5-g2b4b2-disposable-guest-byte-consumption-acceptance-2026-10-17.md). **C5-G2 NO-GO; S2 BACKUP PAUSED; `readyToInstall=false`; `authorizedToMutateProduction=false`.**

## 2026-10-17 — B02-B4B-3A 独立 Python/ELF 依赖闭包清单契约（已合并，CI 通过）

**MERGED / SYNTHETIC CI GREEN：PR #2848，merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`，CI #7315 / run `39077195858`。** 按用户授权新增独立 `ops/runtime/root_python_dependency_manifest.py`，对 Python 3.12.3、固定 `-I -S -B`、stdlib .py/package、native extension、ELF loader、native shared objects、builtin/frozen/vDSO 构建**仅基于调用方声明**的有限依赖图与 SHA-256 清单结构检查。要求规范绝对路径、文件 pin 一一对应、manifest digest 声明一致、缺失/额外/未知边拒绝以及无游离节点的有界图遍历；循环允许，不能把静态图视为真实完整 Runtime 闭包。对应合成测试已随该 PR 的 GitHub CI 通过；没有 Guest/root 执行或真实文件清单采集。旧 B4B-1 direct-only 原型与 B4B-2 固定字节消费者保持不变，不增加根启动器、真实验证器、执行能力、Bundle 17 成员或生产权限。所有结构符合也仍返回 `decision=BLOCKED`、`pythonRuntimeDependencyClosureVerified=false`、`readyToInstall=false`、`authorizedToMutateProduction=false`。架构文档：[B4B-3A Python 依赖闭包清单](./C5-G2-B4B3A-Python依赖闭包清单.md)。后续 B4B-3B 需独立可信的文件/传递导入与 ELF 来源采集；B4B-3C 须另行授权隔离 Guest 命令、独立见证与证据链。**C5-G2 NO-GO；S2 BACKUP PAUSED。**

## 2026-10-17 — R1 B4B-3B-1 FD 候选证据与离机校验第一批（LOCAL / NOT RUN）

**LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / USER REVIEW PENDING / CI NOT RUN / NO ROOT OR GUEST TEST.** 根据 R0 冻结 D1，在既有 B4B-3A 声明清单外增加两个独立非授权组件：`root_python_dependency_fd_observer.py` 只读取受外部调用方预先打开的有界、只读普通 FD，记录真实读到的字节 digest 和 fstat 元数据；`root_python_dependency_offline_review.py` 用独立参数传入的 manifest、文件哈希、观察记录 canonical hash 进行严格离机候选比对。**输入 pin/receipt 的外部保管/可信来源和 FD→真实路径开链均未被该代码认证；Python import/ELF DT_NEEDED/dlopen 真实依赖自动发现亦未完成**，不能从两个同源参数得到独立信任。成功时仍 `decision=BLOCKED`、所有独立来源/完整闭包/安装权威字段为 false；旧 B4B-1/B4B-2/B4B-3A、冻结 Bundle 17 不改，无生产或 Guest 命令。测试覆盖负向污染、缺失/额外 FD、metadata 和 pins 漂移、伪造权限和 off-Guest 记录异常。详情见 [B4B-3B-1 文档](./C5-G2-B4B3B1-只读FD证据与离机比对.md)。后续 B4B-3B-2 独立审阅路径可信打开与完整导入发现，B4B-3C 先按 R0 C2 满足 Guest 恢复证据再另行申请实际 root 操作。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — R1 B4B-3B-2A 有界 Python/ELF 静态线索解析（LOCAL / NOT RUN）

B4B-3B-1 的 FD 候选观察与离机比对已通过 PR #2854 / CI #7336 / merge `2bab5fe6` 进入 dev，但它不证明路径来源或完整依赖。下一本地切片 B4B-3B-2A 新建外置 `ops/runtime/root_python_elf_static_hints.py`，只对调用方传入的不可变字节执行 AST 解析和 ELF64 x86-64 小端 PT_DYNAMIC / DT_NEEDED 静态提取，记录不明确的 from/relative/dynamic import、RPATH/RUNPATH、ELF interpreter/未知标签。该线索**不是实际运行进程加载闭包或独立可信哈希**，不打开路径、不调用真实 root、ld.so/动态加载器，也不执行任何代码；测试仅为非 root 人工字节 fixture，尚未运行。所有 receipt 永远 `decision=BLOCKED`、`transitiveDependencyClosureVerified=false`、`readyToInstall=false`、`authorizedToMutateProduction=false`。已有 3A/3B-1 不修改；R0 D1/C1/C2、17 文件 Bundle 与 S2 gate 不变。详见 [B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。实际可信文件安全开链、真实动态 import/ELF 来源与独立见证留待 3B-2B/3C 单独审阅。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — R1 B4B-3B-2B1 受控目录 FD 候选路径开启（已合并，合成 CI 全绿）

PR #2855 的 B4B-3B-2A 已经在 dev 合并为 `2db85d32`。本批独立新建 `ops/runtime/root_python_dependency_path_fds.py`，基于**调用方先前打开但尚未独立认证来源**的根目录 FD，对 B4B-3A manifest 中的候选文件逐级使用 `dir_fd` + `O_NOFOLLOW` + 目录项/FD 元数据一致性检查，借出只读 FD 给已合并的 B4B-3B-1；上下文结束后复核并关闭 FD。只使用 CI 临时树合成测试，不执行任何真实 Python/ELF 或 Guest/root 命令；并不替代独立 `/` root anchor、软件包来源、usrmerge symlink 别名、动态 import/ELF/dlopen 传递闭包或独立执行见证。为避免静默降低安全语义，Ubuntu `/lib64` 等 symlink 路径目前**有意 fail-closed**，后续必须另审可信别名策略与真正运行态证据。旧 B4B-1/2/3A/3B-1/3B-2A 和 17 文件 Bundle 均不修改；当前 `C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED`。详见 [B4B-3B-2B1](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。本批已通过 PR #2857 的 CI #7344（Runtime/Release 合成检查及相关汇总检查成功），dev merge `1a82caff22b49881aad2893ae1c9374c03c97ffb`；仍未做 Guest/root 实测。下一阶段先见 [B4B-3B-2B2 只读设计评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)，未经专项批准不得变更严格 no-follow。

## 2026-10-18 — R1 B4B-3B-2B2-D 合并与 2B2-A 纯内存合成别名模型（本地待审）

B4B-3B-2B2 设计评审已通过 PR #2858、CI #7346 合并 dev 为 `c9db47b7`。当前 B2B2-A 在独立本地分支新增只检查**调用方自报** `/lib` / `/lib64` 前缀合成关系的独立外置 Python 模块和纯内存测试；没有 `readlink` / `realpath`、Guest FD、真实平台扫描或 loader 执行，不能使自报的映射等同实际解析，也不修改 2B1 严格 no-follow 打开器和 17 文件 Bundle。源码与测试尚未经过 GitHub CI，用户审阅前不推送新分支。任何接入实际文件开启/别名安全策略的 2B2-B 仍需独立架构评审和授权；C2 恢复门禁仍先于任何新 privileged Guest 试验。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。**详情：[2B2 评审与进度](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。

## 6. Validation and exit

G2-A tests under existing CI `api-checks`:
`python3 -m unittest discover -s ops/runtime/tests -p 'test_*.py'`.
Offline cases cover: historical main ancestry, correct CI/publish workflow
identity and exact source SHA, failed/spoofed/missing newest seals,
paired-image mismatch, repacked original Archive, no production capabilities.
The previous newest-release verifier, `stage_bundle.py` consumer, 17-file
source allowlist, app deploy and legacy lab installer are unchanged.

G2-A through G2-B2B7 PR CI have passed independently (G2-B2B7 PR #2801 / CI #7190, 7/7). B2B8 real-systemd evidence came from a separately pinned, out-of-repository guest script and operator-provided terminal/JSON output, **not** GitHub CI or independently sealed off-VM evidence. It verifies only synthetic S1/S2/S11 behavior and observed cleanup; it does not satisfy process-wide barrier, new admission prevention, Recovery Kit, install/clean reinstall, or full disposable acceptance. Production remains `C5-G2 NO-GO` pending real G2-B maintenance/Kit gates, G2-C..E and distinct operator authority. S2 remains paused.
