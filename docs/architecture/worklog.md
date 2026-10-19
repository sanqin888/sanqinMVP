# SanQ 项目持续工作日志

## 2026-10-18 — R1 S1-M0 MacBook 公钥候选脚本独立交付与仓库文档记录

**状态：MAC SCRIPT EXTERNALLY DELIVERED / REPO DOC-ONLY PR AUTHORIZED / MAC NOT RUN / NO REAL UBUNTU SIGNATURE VERIFIED。** 用户选择方案 B（现有 Google Drive + Mac 完整离机证据），授权分批执行 Mac T1 → GitHub Runner 真实 S1 验签 → 后续 Drive 归档 → 生产只读验证。按用户后续明确决定，Mac 专用 Canonical 公钥候选采集脚本及其 12 项本地模拟测试**仅通过聊天独立交付，不进入远端仓库/CI**；本批只提交分阶段设计与状态说明。Mac 的 /usr/bin/python3 已存在，尚缺 gpg；操作者可审阅安装 Homebrew gnupg。采集公钥不能自证信任；须由独立可信 Debian/Ubuntu 软件包签名链见证并人工批准准确 keyring SHA，才可另批建立 Runner workflow。Drive/生产 Runtime 接线尚未实施、不得越过独立权限审阅，原 17 Bundle、备份 OAuth、现役 daily/CI、AWS、Guest 和生产均未更改。详见 [S1 设计追加 §6](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — Runtime 旧隔离维护实验：失败/中断不自动恢复

**状态：SOURCE CI GREEN / FINAL DOCUMENTATION CHECKS PENDING / 未部署。** PR [#2874](https://github.com/sanqin888/sanqinMVP/pull/2874) 的源码提交 `201ea1b396a38d3df566a94588646a5f372e1f9a` 已通过 [CI #7379](https://github.com/sanqin888/sanqinMVP/actions/runs/39192838473)：4 个选中作业成功，Runtime 415 / Release 45 tests OK；其余无关作业按范围跳过。此处只追加实际证据，不改源码；最终文档 head 的 Checks 与合并事件仍为交付权威。本地测试未运行，未部署/未做真实主机验收，C5-G2 NO-GO。 用户明确指出历史合成维护实验的 `finally` 会在失败后恢复原服务。本批按 A 类内部原子修复移出无条件恢复：停止/观察/排他失败与可捕获中断保留 cause、不请求 restore，仅成功实验核对原状态恢复。更新忙消费者/非法声明断言，补第二次核验、部分停止与两次观察异常/中断回归；原成功恢复及恢复失败/来源/锁/Bundle 护栏保留。[所属文档](c5-g2b2b-isolated-operator-rehearsal-2026-10-13.md) 明确历史与当前源码、新更新流程不得直接复用本实验；同步依赖图无变化。Runtime/Ops 既有边界内修复，不是已部署生产问题，不增加真实维护/更新入口、特权或 AWS 动作。无 schema/依赖/CI/Bundle 变更；不需要迁移。MCP-workspace 无 lint/build/test 权限；用户已授权本补丁远端交付，分支 `fix/runtime-isolated-maintenance-failure-freeze-20261018` 从 `origin/dev@08937ee5` 创建，以最终 head 的 GitHub Actions 结果为准。


## 2026-10-18 — R1 S1 Ubuntu Archive 独立签名采集 CLI（本地、未执行）

**基线：**S0 审批与 Mac 回执文档 PR #2872 / GitHub Actions #7375 success / dev merge `001d7c345bff43f8c29391fdf9da45286c57fb81`。**本次状态：LOCAL SOURCE/TESTS/DOC ONLY / NOT RUN / NOT PUSHED / USER REVIEW PENDING。** 由于当前隔离 Debian 13 容器缺 Ubuntu 可信 Archive keyring、官方 archive URL DNS 返回 rc=6，没有伪造 gpgv 真实签名结果；而是在 `docs/c5-g2-r1-s1-real-ubuntu-signature-evidence-20261018` 构建独立于 Guest/生产的官方 `Release + Release.gpg` HTTPS 限域下载及预先固定 SHA 的 Archive keyring 对照、gpgv 主键指纹/摘要算法/发行时效校验、私有只读证据回执脚本，并编写 22 项虚构原件/模拟网络/gpgv 的合成负例。严格 `decision=BLOCKED`、不自动授信、不进入 Runtime 17 Bundle 或安装路径；详见 [S1 可审阅采集合同](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。Mac/Guest/root、系统安装、Archive 原件下载和真实 gpgv 都未在本批执行；S0 有界身份匹配、S1 仍未实际验签，C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — S0 Mac Host 五项只读身份预核对（操作员回传）

**S0：IDENTITY MATCHED (OPERATOR-OBSERVED) / EVIDENCE LIMITED / NOT FULLY VERIFIED。** 已审阅操作员上传的五条准确 VBoxManage snapshot list、snapshot showvminfo、Source/Recovered showvminfo、recovered VDI showmediuminfo 终端转贴。精确 Source/Snapshot/Recovered/VDI UUID 与冻结 C2 登记一致；Snapshot base VDI、Recovered base VDI、Host-only NIC、VM 电源状态、当前 clipboard/dragdrop 显示符合预期。特别保留 Source Snapshot 的双向剪贴板、Source 当前差分盘 UUID 与 Snapshot base 不同、Recovered VDI 在 running 状态下 locked write 等真实观察，不伪称矛盾或静默改配置。**欠缺每条真实 shell rc、原始 stdout/stderr 独立保管、采集 UTC、Mac Host witness、当前 Guest 内路由/共享文件夹完整闭包**，故未签认整机隔离/原件真实性。仅本地文档更新，不运行 Host/Guest/root。S1 真实独立 Ubuntu 官方 Release GPG 仍未验证，S2–S6 不启动；C1 OPEN / G2 NO-GO / S2 PAUSED。参见 [审批包 §9](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)。

## 2026-10-18 — R1 B2-1 真实 Ubuntu 来源与 C2 Host/Guest/root 取证审批准备

**首次文档状态：LOCAL DOCUMENT-ONLY / SOURCE NOT CAPTURED / NO ROOT OR GUEST EXECUTION / NOT PUSHED；2026-10-18 用户随后明确批准 S0 Host 身份预核对与 S1 Ubuntu 独立来源验签范围。已作真实工具可达性核查：MCP 不具备 Mac/VirtualBox Host 直连能力，S0 无新实测；独立 Debian 13 执行环境具备 gpgv 但无独立可信 Ubuntu keyring 且 archive.ubuntu.com DNS 失败（curl rc=6，下载接口亦失败），S1 未下载成功任何签名原件、未运行 gpgv。** 在用户明确授权开展**审批准备**后，基于 B2-1D PR #2871 / CI #7373 success / dev merge `e5f2e64376251f9f03edb1ebf337f74fab820d90`，在 `docs/c5-g2-r1-b21-real-provenance-root-approval-20261018` 整理 [真实来源验真与 Host/Guest/root 分组命令审批包](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)：历史准确 C2 资产身份、B2-1A Host5/Guest9 只读命令、Canonical Ubuntu Archive key/签名 Release→Packages→deb/member→manifest 独立证据闭包、离机 stdout/stderr/rc/actor/witness、root collector 需先源码 CI/SHA 冻结才能执行。尚未下载 Ubuntu 原件/执行签名验真、Mac/VM/Guest、sudo/root 或 AWS/生产操作。B2-1D 只实现合成 CI 绿，不提高独立来源认证；无代码、业务所有权、依赖边/SCC/scanner、17 Bundle、HTTP/Prisma、CI/锁文件或生产变更；C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1D 跨包归属与 Manifest 候选覆盖

**首次本地审阅：SOURCE/TESTS AUTHORED / NOT RUN。后续远端交付 PR #2871 / CI #7373 success / merge commit `e5f2e64376251f9f03edb1ebf337f74fab820d90` 已进入 dev；仅合成 CI GREEN，未验 Ubuntu 原件、真实 Host/Guest/root。** 基于 B2-1C PR #2870 / CI #7371 success / dev merge `3c623b88a20962a820d6269ab330e6b6c48552f3`，从独立分支 `feat/c5-g2-r1-b2b2b2-b21d-manifest-provenance-offline-20261018` 新增外置 Runtime/Ops `root_python_b21_multi_package_manifest.py` 与纯内存合成测试。复用 B3A manifest validator 并严格核对 N 包候选 B2-1C receipt 的 regular SHA/声明式 symlink 原文、logical→member 唯一映射、无漏/多/孤儿/重复，全部结果 BLOCKED。详见 [B2-1D 审阅](C5-G2-R1-B2B2-B21D-跨包文件归属候选审阅.md)。不证明 GPG/真实发行源、Guest/Host/root FD 或动态消费；无业务 owner/import、依赖图/SCC/scanner、Runtime 17 Bundle、CI/依赖锁文件、Prisma/API/生产/AWS 变化。C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1C Debian 包内 member 字节与 symlink 候选合同

**首次本地审阅：SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN。后续用户授权提交：PR #2870 / CI #7371 success / merge commit `3c623b88a20962a820d6269ab330e6b6c48552f3` 已进入 dev；仅合成 CI GREEN，不认证真实 Ubuntu 包或 Guest/root。** 基于 B2-1B PR #2869 / CI #7369 success / dev merge e823bb165c1cf0460cf1279cda8d44f0b6884366，在 feat/c5-g2-r1-b2b2b2-b21c-deb-members-offline-20261018 外置新增 ops/runtime/root_python_b21_deb_members.py 和纯虚构 .deb ar/data.tar 测试。仅对 caller 提供的候选 deb bytes/整体 SHA、明确选定包内 regular 文件 digest、symlink 原始 link text 进行有界纯内存核对；不跟随链接、绝不认证 Ubuntu GPG/官方包来源或 Guest FD，也不运行 VM/root/安装。详见 [B2-1C 合同](C5-G2-R1-B2B2-B21C-deb包内文件与链接候选合同.md)。不改业务 owner/导入、依赖边、SCC/scanner baseline、17 Bundle、B1/B3B1/B2-0/B2-1A/B2-1B 原合同、HTTP/Prisma、CI/锁文件、AWS/生产。C2 LIMITED CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。


## 2026-10-18 — R1 B2B2-B2 B2-1B Ubuntu 来源 Release→Packages→deb 原始字节链

**首次本地审阅：SOURCE + TESTS AUTHORED / NOT RUN；后续用户授权远端交付：PR #2869 / CI #7369 SUCCESS / merge commit e823bb165c1cf0460cf1279cda8d44f0b6884366 已进入 dev；仅合成 CI GREEN，不认证外部源。** 基于 B2-1A PR #2868 / GitHub CI #7367 success / dev merge `5711aa1267cd7f5cbc9b011747edf5b99cd9f9a9` 创建 `feat/c5-g2-r1-b2b2b2-b21b-ubuntu-byte-chain-20261018`。在 `ops/runtime` 新增纯内存 Ubuntu Release/Release.gpg/Packages[.xz]/.deb 原始候选 bytes/size/SHA256/架构/版本/路径一致性审阅模块和虚构原件/XZ 合成负例，详见 [B2-1B 设计和状态](C5-G2-R1-B2B2-B21B-Ubuntu原始字节链合同.md)。不执行 GPG 验签、不提权、不触碰真实 Guest、VM、AWS/生产、不认证 deb 内成员与官方来源、不授予执行权限；保持 C2 有界 CLOSED / C1 OPEN / G2 NO-GO / S2 PAUSED。没有业务 owner、依赖边、SCC/scanner baseline、17 Bundle、CI/依赖锁文件/Prisma/HTTP/现役 Runtime 变化。

## 2026-10-18 — R1 B2B2-B2 B2-1A 原始 Host/Guest 只读取证合同

**初始审阅状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN。后续远端交付：PR #2868 / CI #7367 SUCCESS / merge commit `5711aa1267cd7f5cbc9b011747edf5b99cd9f9a9` 已进入 dev；仅合成 CI GREEN，不认证真实 Host/Guest/root。** 上一批 B2-0 PR #2867 已合并（CI #7365 success；merge commit `b95f09e1984a8ba134289775ae30aeddaff81c5c`）。本批基于最新 dev，分支 `docs/c5-g2-r1-b2b2b2-b21-readonly-evidence-approval-20261018`。外置 Runtime/Ops 新增 `root_python_b21_raw_transcripts.py` 和对应纯合成测试，仅对特定 C2 Source/Snapshot/Recovered VM/VDI 的五项 Host 和九项 Guest **已提供的原始 byte**、严格白名单 argv、内/外 rc、各材料 SHA、大小/顺序/补缺进行负向优先审阅；正常结构一致也永久 `BLOCKED`。同步 [B2-1A 精确审批包](C5-G2-R1-B2B2-B21A-原始只读取证审批包.md)，说明真实 Host、Ubuntu 包签名与未来 Guest root 必须另行授权。没有代码执行、Mac/Guest/SSH/root/VM/AWS/生产操作或真实平台证据；无业务模块/依赖方向/SCC、17 Bundle、Prisma、CI、锁文件、数据或生产行为变化。C2 有界 CLOSED、C1 OPEN、G2 NO-GO、S2 PAUSED。

## 2026-10-18 — R1 B4B-3B-2B2-B2 第一批 B2-0 源码及 B2-1 只读取证设计

**状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO REMOTE PR。** 基于 `origin/dev@eec9668c5c90df38ed7be08cf7f1b2f0607516bc` 创建 `feat/c5-g2-r1-b2b2b2-evidence-contract-20261018`。在 Runtime/Ops 外置 `ops/runtime` 中增加 B1+B3B1 候选 Guest packet（严格结构/FD/alias/阻断状态）与独立 Host/Guest/Ubuntu .deb 来源 pin/custody **声明**比对模块以及纯虚构不执行的合成测试；[B2-1 合同](C5-G2-R1-B2B2-B2-取证合同与离机审核.md) 指定独立 Host/发行包/Guest 证据顺序与未来单独 root 审批。结果强制 BLOCKED/全部授权 false；不改变 B1/B3A/B3B1、17 Bundle、owner/依赖/SCC/scanner、CI/依赖/Prisma/HTTP/业务或生产。**首次审阅时**没有本地测试执行、CI、Guest/root、真实平台/包签名验证、AWS/生产操作。C2 维持有界 CLOSED、C1/C3–C7 OPEN、C8 NOT REQUESTED、C5-G2 NO-GO、S2 PAUSED。**同一批后续交付：**用户授权远端后提交源码 `8f8ed7538177500d30b99b824f5ce9badf959476`，PR #2867，GitHub Actions #7365 `success`（Runtime ops-checks 通过），merge commit `b95f09e1984a8ba134289775ae30aeddaff81c5c` 已进入 dev；这一状态仅表示合成 CI GREEN，不升级 Guest/root/软件包来源/C1 真实性。

## 2026-10-18 — C2 N-07 最终风险裁定与隔离恢复有界 Closeout

**状态：LOCAL DOCUMENTATION / C2 CLOSED — ISOLATED SYNTHETIC RECOVERY VERIFIED / N-07 LIMITED-ACCEPTED / C5-G2 NO-GO；首次远端交付待用户审阅。** 基于最新 `origin/dev@b22f90469963c73281bdaa4ae4861e1eb5b53d82`（PR #2865 / CI #7361 及先前 AWS 设计 PR #2864 已合并）重审 AGENTS、R0 C1–C8、C2-CHANGE-01/02、B2B2 §7/§9、G2、[AWS 快照新方案](Runtime更新-AWS快照与维护冻结方案.md)、恢复手册及既有 C2-0/C2-1 离机原件复核登记。依据用户「如果没什么大问题就 closeout C2」授权，**只针对已经验证的指定可丢弃 Test-02 → 独立新实例恢复流程**接受 N-07 的低影响残余风险（历史 Mac Host 无独立签名见证、部分外层 SSH rc 缺失、本轮 Host 实时输出未另行封存）；保留这三项真实性/取证边界，不把一致的归档 SHA、Guest 19/22 稳定观测、合成 HTTP 200 或独立 base VDI 夸大为整盘 hash / 真实 AWS 恢复。N-01/02/04/06 有界 VERIFIED、N-03/05 VERIFIED with limits、N-07 LIMITED-ACCEPTED。R0 **C2 有界 CLOSED**，C1/C3–C7 OPEN、C8 NOT REQUESTED，G2 不因此晋级；C1/root/FD/外部发行来源及 B2B2-B2 具体 Guest 操作须另批。**AWS RUNTIME-SNAPSHOT-01、MAINT-RESTART-01 只是设计批准，真实同平台 S01–S12 未验证、NO-GO；保留每日现役备份、S2 PAUSED。** 同步 B2B2 §9.6、R0、G2、AWS 设计、恢复手册和依赖图；未执行任何 VM/Guest/云/生产操作，无源码、owner、Prisma、CI、锁文件、Bundle 17、敏感原始证据提交。MCP workspace 不具备 lint/build/test 执行权限，本地仅差异/文档审阅；经用户审阅后另授权远端 PR→dev/CI→合并。

## 2026-10-18 — C2 最终 A/B Host 配置只读复核（基于 PR #2864 后的 dev）

**状态：C2-02 VIRTUALBOX SYNTHETIC RECOVERY VERIFIED（有限范围） / N-07 LIMITED / C2 OPEN / C5-G2 NO-GO。** 在 `origin/dev@4f34c6f86bfc0650d900da9696497c0cc9508188`（#2864 已合并、AWS 快照与维护冻结为现行设计）上只补录本次操作员提供的最终 A/B 核验：Mac 原件审阅脚本确认 C2-0（237 files、6 manifests、231 hashes，SHA `5503b6f9…`）及 C2-1（60 files、3 manifests、50 hashes，SHA `29257b27…`）完整，Guest 22 项中 19 同值、3 项 time/IP/mountinfo 预期不同，既有 clone rc=0 与合成 HTTP 切换/停止通过。**新 Host 只读核对**：源 Test-02 `4b1bd5e7-…` 的 Snapshot `028a681b-…` 指向原 base VDI `66ad835f-…`，`snapshot showvminfo` rc=0；Snapshot Host-only、剪贴板 **Bidirectional**。恢复 VM `162701f1-…` running，独立 MAC `08002703FDC2`、Host-only、clipboard disabled；VDI `39381cc9-…`、`Parent UUID: base`，normal/base 25600 MB、占用 4345 MB，`showmediuminfo` rc=0。**限制**：Host 查询这轮仅对话终端原文，未附新的离机 stdout/stderr/hash；管道 `grep` 的 VBoxManage 上游 rc 未单独记录；归档不能独立见证最初 Mac Host 身份，部分历史 SSH 外层 rc 缺失。将精确对象与 N-01–N-07 限定验收登记于 [B2B2 §9.5](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)，不宣称整盘快照逐字节证明、不重测 Marker A/B、不关闭 C2。**范围严格仅 docs；PR #2864 的 AWS RUNTIME-SNAPSHOT-01、MAINT-RESTART-01 仍仅批准设计、没有真实同平台 AWS S01–S12 验收；无 VM/Guest/root/生产操作**。该批由独立最新 dev 分支审阅，不再次提交已被 #2864 纳入的 C2-CHANGE-02 合同。

## 2026-10-18 — Runtime AWS 整机快照与维护冻结方案（同批持续更新）

- **批准与基线：**用户明确采用“AWS 整机快照 + 更新前容器不自动重启再生成快照”；从 `origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c` 审阅。只做文档；用户在审阅 47 份文档报告后已明确授权本批远端交付，包含保留的 C2-CHANGE-02 文档规则/有限复核登记；没有云/生产操作授权。
- **远端交付：**[PR #2864](https://github.com/sanqin888/sanqinMVP/pull/2864) → `dev`，功能分支 `docs/runtime-aws-snapshot-recovery-20261018`。47 份文件均已显式暂存，包括新主方案；远端 PR 文件清单/最终 head 的 GitHub Checks 与合并事件为权威，不预先声明通过。未执行本地项目测试或生产操作。
- **并行记录保留：**保留共享工作区另一 C2 文档任务已提交的 `4eabfa2b16d0306e6c43bfc4e8ca0f586fb0b44b` 中的 C2-CHANGE-02 规则、原件复核和有限范围登记；其分支/提交原样保留，未 reset/覆盖未提交工作，不将其验收当本批执行。
- **合同：**新增 [AWS 快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md)，修订 R0 D2–D5/C4–C7/R2–R5、G2 A–F、安装约束、备份/恢复、索引与总队列。代码创建唯一 Lightsail 手动快照→核对 available/源/盘/txid；先记录原策略并离机保存，再准确容器 no/正常停服与启动入口禁入；快照和新实例首启保持维护，成功验证后按原状态恢复，故障不自动放行。
- **替代与保留：**旧 mandatory crypt/Drive preinstall Kit、双 Archive 解密取回与故障机自举 clean reinstall 退出本次强制范围；每日独立备份/escrow、正常更新执行器和目标来源保持。C2 既有证据规则与独立复核不覆盖，本批不伪造 PASS、不默认重建历史 VM/marker。放行后/外部 UNKNOWN 转独立 DR/向前修复及权威对账。
- **验证与状态：**47 份 Markdown（新增主方案 1 份、修改现有 46 份）逐份回读一致；91 个新增相对链接目标有效；历史正文/17 成员发布清单保留，新增 diff 无尾部空白或冲突标记。只做源文本/引用/历史边界和 diff/readback 审阅；本批无本地项目测试、Guest/root、实际快照、Docker policy/Compose、IAM/凭据、17 Bundle、依赖或 Prisma 变更。DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。本批提交/推送/dev PR/CI/合并已获用户授权；最终 head 的 Checks 和合并事件为交付权威，不提前宣称通过；后续状态更新本条，不另起同批日志。

## 2026-10-18 — Runtime C2-CHANGE-02：归档原件复核与 A/B 充分性合同

**状态：用户已明确授权修改恢复验收证据方法；LOCAL DOCS COMMIT / REMOTE PR NOT YET AUTHORIZED。** 基线 `origin/dev@a76d5265`（C2-CHANGE-01 PR #2863 / CI #7356 已通过并合并），分支 `docs/runtime-c2-ab-evidence-reuse-contract-20261018`。本次首次**直接读取**用户上传 C2-0/C2-1 两份原始 `.tar.gz`，复算 C2-0 SHA-256 `5503b6f9942613e66e886ddd945aad4544c4f4d56835539db97cd8bc0683eaea` 与 C2-1 `29257b278195725002754d8925edec5b7328526df5afe8da7f6d2872fe43f3cd`；可解析的 archive 内部 manifest 全部匹配；两轮 `guest.stdout` 各 22 命令，19 个输出/rc 完全一致，其余为 UTC、IP `.2`→`.3`、mountinfo 运行时 `pipe_ino` 的预期差异；clone 原始 rc=0、目标 VDI `Parent UUID: base`、HTTP 合成切流/停止结果均在原始文件中可复核。**来源界限：**clone stdout 仅报告成功，未包含完整 clone 命令；归档本身无法独立认证原始 Mac Host 在采集时的真实性，且 Guest A 不是创建 snapshot 瞬间的逐字节映像；外层 SSH rc 缺失及首次停止 404 保留。用户本轮明确取消强制 Marker A/B 与默认重新创建 VM/snapshot，N-02/N-03/N-05 改为从 Snapshot/source/medium → clone → 独立 VM/VDI → 已有 Guest 选定状态的只读 A/B 充分性核查。明确区分 VERIFIED/LIMITED/BLOCKED；只有关键不可替代的证据缺口才单独提补证方案和审批。同步 [R0](Runtime更新-R0冻结设计.md)、[B2B2 §7/§9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[依赖图](current-dependency-graph.md) 和 [备份恢复手册附录 A](../runbooks/backup-recovery.zh-CN.md)。**C1/C2 OPEN、C5-G2 NO-GO、S2 DAILY CONFIG EXPANSION PAUSED**；无任何 Guest/VM/snapshot/生产操作，无 Runtime 源码、CI、业务 owner、模块依赖、schema/依赖/17 项 Bundle 变更；MCP-workspace 无本地 lint/build/test 权限，待本地审阅后再远端授权。

## 2026-10-18 — Runtime C2-CHANGE-01：生产模式新实例恢复验收合同直接替换

**状态：用户明确批准 C2 验收合同调整 / MCP-WORKSPACE LOCAL DOCUMENTATION / USER REVIEW PENDING / NO REMOTE PR。** 工作分支 `docs/runtime-c2-production-style-recovery-contract-20261018`，基于 `origin/dev@b18fb0e3`（前批 C2 文档 PR #2862 / CI #7354 已合并）。按用户本轮授权**直接替换**旧 C2-02 强制 VirtualBox 原机 `snapshot restore` 验收，不保留原 C2-02I 备选或另一个需审核的合同方向；唯一当前 C2-02 N-01–N-07 为受控 disposable source 的 Snapshot → 独立新实例、快照前基线 marker / 快照后差异 marker / 恢复目标的正负读回、Host/Guest/介质/隔离身份、合成端点接管、完整 rc、离机跨主体见证。旧 C2-0/C2-1 实测只在已记录范围内复用，不能因合同修改追认 PASS；新一轮 marker、退出码、独立 witness 未补齐，**C2 OPEN / C1 OPEN / C5-G2 NO-GO / S2 PAUSED**。同步 [R0](Runtime更新-R0冻结设计.md)、[B2B2 §7.3/§7.4/§9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[备份恢复手册附录 A](../runbooks/backup-recovery.zh-CN.md) 与 [依赖图](current-dependency-graph.md)；不改变 D1–D5、C1/C3–C8/G2、业务 owner、依赖/SCC/scanner、Bundle 17、Prisma/CI/依赖、Guest/root/生产。未运行本地 lint/build/test；远端交付须经审阅授权。

## 2026-10-18 — Runtime C2-0 / C2-1A–D 生产式恢复实测记录与文档收口

**现行交付续记：PR #2862 / CI #7354（docs-only 选中作业 success）已 squash merge 至 dev `b18fb0e3`；以下 LOCAL/NO PR 代表首次撰写时历史状态，C2 未关闭。** **历史状态：OPERATOR-REPORTED C2-0 OBSERVATION + C2-1A–D SYNTHETIC NEW-INSTANCE RECOVERY / LOCAL DOCS REVIEW / NO PR / C2 STILL OPEN。** 基于最新 `origin/dev@5d69eb81` 新建 `docs/runtime-c2-recovery-evidence-closeout-20261018`，审阅 AGENTS/CI/R0/G2/B2B2/现行备份恢复手册；将用户在 Mac VirtualBox 的 C2-0 Host/Guest 普通用户观察、源磁盘/快照/隔离、C2-1 指定 snapshot → 独立 VM、新磁盘与 MAC、Ubuntu/loader baseline `diff=0`、Host-only 合成 HTTP 200/停止后 curl 7、C2-0/C2-1 证据包本机与 Google Drive 下载 SHA 校验 `OK` 的实际范围写入 [B2B2 §9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)；同步 [R0](Runtime更新-R0冻结设计.md)、[G2](c5-g2-trusted-runtime-contract-2026-10-13.md)、[依赖图](current-dependency-graph.md)、[Lightsail DR 草案（备份恢复手册附录 A）](../runbooks/backup-recovery.zh-CN.md)，并校正 B2B2-B1 PR #2861 / CI #7352 / dev `5d69eb81` 已合并事实。**限制：**C2-0 与恢复后 Guest SSH、HTTP 服务外层 SSH rc 未捕获，首次停止 404 已保留；C2-1 archive 完整 SHA 值未在对话提供、离机原件未被 MCP 独立重读。C2-1 为 `clonevm --snapshot --mode=machine` 而非真正 `snapshot restore`，故原 C2-02 与独立见证门禁仍 OPEN；没有真实 Web/API/DB/Static IP/Cloudflare/供应商或 root 测试，**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。文档-only，无 owner/依赖/SCC/Bundle/CI/Prisma/业务或生产写入。MCP-workspace 不运行 lint/build/test；首次远端交付待用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-B1：受限 symlink FD 合成候选解析器

**现行续记：PR #2861 / CI #7352 (run `39103592288`) 已成功合并 dev `5d69eb81`；仅合成检查，不是 Guest/C1/C2/生产验证。以下 LOCAL/NOT RUN 为首次写入时的历史状态。** **历史状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / NO PR / USER REVIEW PENDING。** 最新源 `origin/dev@c9bfa566`（#2860 设计评审/CI #7350 已合并），工作分支 `feat/c5-g2-b4b3b2b2b1-controlled-alias-fds-20261018`。新增 `root_python_dependency_alias_fds.py` 与 `test_root_python_dependency_alias_fds.py`，精确声明的目录/leaf 链接由 Linux `O_PATH | O_NOFOLLOW` 持有并从链接 FD 读取 link text，限定相对/绝对目标归一、owner/权限/inode、mount ID/namespace、预算与前后验证；对原 B2B1 旧 no-follow 行为作独立回归，合成借出 FD 可送已有 observer 但任何结果仍为 `BLOCKED`，绝不升级权限。无业务 owner、跨模块导入依赖边、SCC/baseline、Runtime 17、HTTP、schema/迁移、CI、依赖、权限/生产写入变化。本地 MCP-workspace 不执行 test/lint/build；真实 Guest、C2 restore、root-anchor/外部 pin/动态消费证据未执行。详见 [B2B2 §8](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。仅获源码和合成测试授权，首次远端推送需另审。**C1/C2 OPEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — R1 / B4B-3B-2B2-B 受控解析专项评审与 C2 Guest 就绪准备

**状态：MCP-WORKSPACE LOCAL DESIGN/READINESS / USER REVIEW PENDING / NO PR / NO GUEST OR ROOT EXECUTION。** 基于 `origin/dev@d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386` 独立分支 `docs/runtime-b2b2b-c2-readiness-20261018`，审阅 AGENTS/CI、R0/G2、B2B2-D/2B1、实际 manifest/alias/path-FD/observer/offline 实现；更新**原有** #2859 同批记录为 MERGED / SYNTHETIC CI GREEN，不重复开发纯声明模型。新增 [受控解析/C2 就绪评审与准确操作清单](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)：根锚/别名/loader/FD/独立 pins 与重复 inode、mount/竞态 fail-closed 语义，C2 只读取证、经新授权才可执行的快照恢复演练、矩阵及分批审批。未实施 B2B2-B 源码、未运行 Guest/快照/云操作或 MCP-workspace 测试；未改 Runtime 17 项、B2B1 no-follow、CI/依赖/Prisma、业务 owner 或依赖边/架构基线/生产状态；R0 D1–D5 不重开，C1/C2 和 C5-G2 仍 NO-GO，S2 daily 扩充继续暂停（现役 timer 不变）。首次远端交付另需用户审阅授权。

## 2026-10-18 — R1 / B4B-3B-2B2-A：有限纯内存 usrmerge 别名声明模型

**状态：MERGED / SYNTHETIC CI GREEN：PR #2859，final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`，CI #7348 / run `39101080529` 成功（选中 `ci-change-scope`、`ops-checks`、`api-checks`、`build-test (api)`；Runtime 281 tests OK、Release 45 tests OK；其余按范围跳过），dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`。** 已合并的设计评审 PR #2858、CI #7346、dev `c9db47b7` 是本批源代码基线；实施分支 `feat/c5-g2-b4b3b2b2a-inert-alias-contract-20261018`。新增 `ops/runtime/root_python_usrmerge_alias_claims.py` 和 `ops/runtime/tests/test_root_python_usrmerge_alias_claims.py`，仅使用调用方提出的 B4B-3A manifest/pins 和固定两类**合成** `/lib`、`/lib64` 前缀关系，在内存中严格拒绝额外/错误/冗余路径与超预算；所有模型输出仍是 `decision=BLOCKED`。不会验证真实 Ubuntu 布局、根锚、FD→路径、外部独立来源或 Python/ELF/dlopen 动态闭包，不允许接入现有 B2B1 严格 no-follow 开启器或执行候选代码。无业务 owner / 依赖图基线 / Runtime 17 / 新依赖 / CI / Prisma / 权限 / Guest/root/生产写入变化。MCP-workspace 未运行测试；#2859 的 GitHub Actions `ops-checks` 已有权威**合成**结果，并非全站 E2E、真实 Guest、路径/FD 来源或 C1/C2 通过；B2B2-B 实际可信别名证据链仍单独评审。详细见 [B2B2 评审/实施记录](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)。C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。

## 2026-10-18 — R1 / B4B-3B-2B2-D：Ubuntu usrmerge 别名与可信根锚设计评审

**状态：LOCAL DESIGN REVIEW / USER REVIEW PENDING / NO PR / NO IMPLEMENTATION。** 以 `origin/dev@1a82caff` 和已合并 PR #2857 / CI #7344 为基线，审阅 B4B-3B-2B1 的严格 `O_NOFOLLOW` FD 开启、B4B-3A 固定 `/lib64` loader 路径与 Ubuntu usrmerge symlink 的不兼容处。对比保持严格 no-follow、另建经外部认证的有限 alias 策略、以及不安全的 `realpath`/任意 symlink 直开三种方案；推荐独立审核 B 方案，**未经用户专项批准不得放宽现有代码的 fail-closed 路径规则**。本批仅新增 [B4B-3B-2B2 评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 并按真实 PR/CI 更新 B2B1、R0、G2 和依赖图，不修改业务 owner、依赖图边、Runtime 17 文件 Bundle、接口/CI/依赖/Prisma、Guest/root/生产状态；未运行本地测试。C1/C2 和 C5-G2 NO-GO 未关闭；S2 DAILY CONFIG EXPANSION PAUSED，现役备份 timer 不变。

## 2026-10-18 — R1 / B4B-3B-2B1：受控路径 FD 候选开启

**状态：MERGED / SYNTHETIC CI GREEN：PR #2857，head `9ad184a350189d58b557419434d50efd062c3361`，CI #7344（run `39098295751`；选中检查均通过），dev merge `1a82caff22b49881aad2893ae1c9374c03c97ffb`。** 基于最新 `origin/dev@b309c1bb` 的独立分支 `feat/c5-g2-b4b3b2b1-fd-anchored-paths-20261018`。承接 PR #2855 已合并 `dev@2db85d32` 的 Python AST / ELF 静态线索，按照 R0 D1 最小增量新增 `root_python_dependency_path_fds.py` 与纯临时文件合成测试：由调用方传入不自证的 root-anchor FD，基于 B4B-3A 的候选白名单逐段只读、nofollow 开启，保留入口/FD/owner/device/inode/permissions 身份、预借出/结束后复核，供 B4B-3B-1 候选摘要读取。会严格拒绝真实 Ubuntu `/lib64` 等 usrmerge symlink（不能擅自放宽），不证明 `/` 根锚与外部来源，也不执行真实系统/Guest/root。未改旧组件公共合同、17 文件 Runtime Bundle、模块归属/架构基线、CI/依赖/数据库/生产状态。根据最新 CI 范围选择机制，Runtime 测试已在 PR #2857 的 `ops-checks` 运行并通过；MCP-workspace 本地未运行；此 CI 仅证明合成测试。见 [B4B-3B-2B1 文档](C5-G2-B4B3B2B1-受控路径FD候选开启.md)。下一步需独立评审真实 usrmerge 路径解析、可信锚点与离机来源、Python/ELF 动态闭包及 B4B-3C C2 真实恢复演练；**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-18 — CI：全部作业按变更范围启动（同批扩展）

**最高状态：REMOTE DELIVERY / [PR #2856](https://github.com/sanqin888/sanqinMVP/pull/2856) / CI+MERGE: SEE PR FINAL HEAD。** 交付分支 `ci/dependency-aware-check-scope-20261018` ，源码审阅基线 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。按用户补充要求，将本批 E2E-only 选择器原子替换为通用 CI 范围与汇总合同；Ops 安全/API 静态/Jest/Web/E2E/printer/Windows 与两镜像仅在有关时启动。保留 API Jest 对 Web 源码的真实架构依赖、Runtime/Release 相互导入、workspace manifests 对两端的影响；原检查名、汇总失败语义、main 完整验收、成对发布/证明不变。不新增依赖/Action/权限，不改业务代码、owner/依赖图/架构基线、schema/migration、17 文件 Bundle 或生产。已编写合成 Git/汇总边界测试，但未在本地或远端执行；用户已授权远端交付；交付基线为最新 `origin/dev@2db85d32541f05e7e3268e7f5a2013812d59690e`，CI/合并以 PR 最终 head Checks 与事件为权威。详见 [CI 范围合同](CI按变更范围执行.md) 与 [CI 工作包](postmod-ci-performance.md)。本条替换同批原 E2E-only 记录，不重复登记批次。

## 2026-10-17 — R1 / B4B-3B-2A 静态 Python / ELF 依赖线索（本地）

**最高状态：PR #2855 OPEN / FIRST CI #7338 FAILED (synthetic fixture overlap) / LOCAL FIX AUTHORED / RERUN PENDING**，本地分支 `feat/c5-g2-b4b3b2a-static-dependency-evidence-20261017` 基于 PR #2854 合并后的 `origin/dev@2bab5fe653babb89092f5c102a159d23edc81988`。B4B-3B-1 已合并：PR #2854，CI #7336 全绿，merge SHA `2bab5fe6`。本批新建独立外置 `ops/runtime/root_python_elf_static_hints.py` 和只用内存源代码/ELF64 人工字节的合成负向测试，提取 Python AST import、ELF PT_DYNAMIC / DT_NEEDED 有限静态依赖线索，记录相对/from/动态导入、ELF 搜索/loader/标签歧义。不是 FD→真实路径认证、完整运行时 import/ELF/dlopen 闭包或来源可信认证；永久拒绝生产 authority。未改 B4B-1/2/3A/3B-1、Runtime 17、业务模块 owner/dependency、CI/依赖/Prisma/部署。文档：[B4B-3B-2A](C5-G2-B4B3B2A-Python与ELF静态依赖线索.md)。首次 PR #2855 / CI #7338 的 `api-checks` 因合成 ELF fixture 中 PT_DYNAMIC（含 RUNPATH）覆盖 PT_INTERP 导致 1 个测试报错；本批在同一 PR 内将 fixture 的 PT_INTERP 调整至不重叠偏移，保留解析器严格拒绝畸形 PT_INTERP 的行为；修复后的 CI 仍需重新运行并全部成功，不预先宣称通过。MCP-workspace 未运行 lint/build/test。后续 3B-2B 真实开链/依赖发现及 3C C2 后实测，均须独立审阅。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — R1 / B4B-3B-1：只读 FD 依赖证据及离机比对

**最高状态：LOCAL SOURCE + SYNTHETIC TESTS AUTHORED / NOT RUN / USER REVIEW PENDING / NO PR。** 基于最新 `origin/dev@1bc1381c` 在 `feat/c5-g2-b4b3b1-readonly-dependency-evidence-20261017` 开展。Runtime 在 B4B-3A 有界声明清单外新增两个非授权外置模块（预打开只读 FD 摘要/metadata 收集、离机 manifest/pins/原始记录摘要一致性比对）及合成负向测试，实际 FD→路径独立真实性、外部 pin 保管链、Python/ELF/dlopen 传递依赖发现均保持未认证，不引入 Host/Guest/root 调用或生产入口。D1–D5 R0 冻结设计及原 B4B-1/B4B-2/B4B-3A 不改；17 文件 Runtime Bundle、CI、所有者/依赖边、schema/迁移/依赖锁与运行状态不变。本地工作区未运行 lint/build/test，待用户授权远端后通过 GitHub Actions 检验。详见 [B4B-3B-1 合同](C5-G2-B4B3B1-只读FD证据与离机比对.md)。下一步 B4B-3B-2 真实路径/独立来源与模块发现须单独审阅，B4B-3C 先满足 C2 并另授实际 Guest 命令。**C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。

## 2026-10-17 — Runtime R0：D1–D5 一次冻结与全仓文档对齐

**最高状态：D1–D5 APPROVED / R0 DESIGN FROZEN / DOCUMENTATION COMPLETE / REMOTE DELIVERY / PR #2853 / CI+MERGE: SEE PR FINAL HEAD；C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED。** 基线 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，分支 `docs/runtime-r0-design-freeze-20261017`。

按用户明确批准冻结 D1 有限独立平台与执行闭包、D2-A 有限维护窗口、D3 crypt/Drive create-only 真适配优先、D4 preinstall 先于 S2 扩充、D5 Abort & Clean Reinstall。新增 [R0 冻结设计](./Runtime更新-R0冻结设计.md)，统一 C1–C8、R0–R5、18 组验收与 I1–I6 中断点；同步 G2、Kit、S1、安装约束、状态/runbook、总队列/索引与依赖图。全仓 96 份 Markdown 纳入核对；旧实验/归档/原始证据保持其事实和原状态，仅在适用旧篇加当前入口。B4B-3A 更正为 PR #2848 / CI #7315 已通过，不提升实际采集或安装资格。

仅文档；无代码、17 文件 Bundle、依赖、owner/graph/baseline、CI、权限、云/VM、生产、Prisma/schema/migration 变更；不清除 PEM 等其他批次已有迁移要求。未运行本地 lint/build/test 或 Guest/root/Kit 实验。检查文档引用、字节/readback、历史保真及 diff/status；真实验收与 GitHub CI 不宣称通过。用户已审阅并明确授权本批远端交付，现通过 [PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) 交付至 dev；CI/合并以该 PR 最终 head 的 Checks 与事件为权威，本文不预先声明 CI 通过。后续从 R1 继续，不重复请求批准 D1–D5。


本文件遵循仓库 `AGENTS.md` 第 19 节，按批次记录项目后续开发、维护和验收。文件超过 1,000,000 UTF-8 字节前，应续写同目录的 `worklog2.md`，依次递增；旧的 `modularization-worklog*.md` 仍保留为历史资料。

## 2026-10-17 — PEM：付款异常通用案件、STAFF 申请和 ADMIN 审批

**最高状态：MCP-workspace LOCAL SOURCE + TESTS AUTHORED / NOT RUN / MIGRATION REQUIRED / NO PR。** 基线 origin/dev@9621e6af，分支 feat/pem-payment-exception-cases-approval-recovery-20261017。Payments 新增 Case/Evidence/Approval/Execution 与窄公共能力；编排复用既有原付款、Checkout/Benefits RELEASE、Terminal Fence 机制；POS Sandbox 操作员免角色审批但保留隔离环境与完整资金/设备安全检查，Production STAFF 申请、ADMIN+MFA 审批，仅已证实最终失败的资金可受控释放，未决只能调查。AGENTS 第14节经用户专项授权扩展隔离 Sandbox ALL_ATTEMPTS_FAILED 的 PEM 例外，旧 504/NOT_FOUND flag 逻辑保留，避免误将人工未收款记为 Clover 取消。四张 Prisma additive-only 模型需用户本地生成迁移；无依赖/CI/生产 Web Ecommerce 改动，不变更直接跨上下文导入规则或架构基线；差异/CI scanner 待审。详细：docs/payments/支付异常管理-PEM.md；本地未提交/推远端，未进行任何 Sandbox 数据/设备写操作。

## 2026-10-17 — C5-G2 / B02-B4B-3A：Python 依赖闭包清单第一批

**状态：MERGED / SYNTHETIC CI GREEN；PR #2848，merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`，CI #7315。** 分支 `feat/c5-g2-b4b3a-dependency-closure-manifest-20261017`（基于任务开始时最新 `origin/dev@1cd89d9e`）。新增独立 `ops/runtime/root_python_dependency_manifest.py`：纯内存结构审查含 stdlib .py、package、CPython native extension、ELF loader、shared libraries、builtin/frozen 和 Linux vDSO 的**声明式**哈希与依赖图；异常缺失与不匹配 fail-closed，声称的清单结构闭合仍永久拒绝认证和生产安装。配套合成测试 `ops/runtime/tests/test_root_python_dependency_manifest.py`；不改 B4B-1/B4B-2、17 文件 Runtime Bundle、现有业务所有者/依赖边/架构基线、CI、依赖锁文件、数据库迁移和生产状态。真正 Guest 哈希清单、完整传递导入/ELF 依赖动态可信采集和独立见证仍为 B4B-3B/C 的单独门禁。详见 [B4B-3A 清单合同](./C5-G2-B4B3A-Python依赖闭包清单.md) 及 [C5-G2 可信 Runtime 契约](./c5-g2-trusted-runtime-contract-2026-10-13.md)。最高状态 MERGED / SYNTHETIC CI GREEN，`C5-G2 NO-GO` / `S2 PAUSED`。


**R0 进度校正：**该批已通过 PR #2848 合并，final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`，CI #7315 / run `39077195858` 成功。没有执行本地 lint/build/test；仅合成声明图，不代表真实文件/依赖采集、Guest/root 或生产验收。后续 B4B-3B/3C 进入 R0 队列 R1。

## 2026-10-17 — 文档清理第一批：过期入口与引用收口

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2849](https://github.com/sanqin888/sanqinMVP/pull/2849) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 交付分支 `docs/cleanup-obsolete-entrypoints-batch1-delivery-20261017`，已对齐 `origin/dev@dda7698e`；原本地审阅基线为 `1cd89d9e`。第一批移除 Web 通用模板、旧 Uber state 迁移建议及已被替代的 GHCR Batch B/C2/C4-A 文档；在中文文档索引中保留现行 schema/历史 migration/Phase 8 的证据去向，在新的 GHCR 状态入口承接既有发布、迁移、备份、PENDING/回退和 Runtime 安装门禁；同步更新根 README、C0 历史说明和 R5 runbook 引用。属于文档内部原子清理：业务代码、所有权、公共/持久化合同、依赖图/架构基线、CI、Prisma schema/migration、生产主机及历史日志均无变更。另一个 Runtime 任务经 PR #2848 合入后，在最新 origin/dev 上准备独立交付，仅追加本条日志，保留其原记录；本批不包含该任务的源码/测试。后续交付状态更新本条记录。详见 [项目文档索引](../文档索引.md) 和 [GHCR 发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)。

## 2026-10-17 — 文档清理第二批：Runtime 旧方案整合

**状态：本地改动已审阅并获远端交付授权，现通过 [PR #2850](https://github.com/sanqin888/sanqinMVP/pull/2850) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/runtime-history-consolidation-batch2-20261017`，基线 `origin/dev@94bc7be6`。逐篇承接并删除 27 份旧 GHCR/Runtime 方案，新增中文 [交付与安装约束](./Runtime交付与安装约束.md) 与 [历史决策/证据索引](./Runtime历史决策与证据索引.md)；保留 exact Bundle、发布/历史来源、staging、动态状态、备份/消费者、维护屏障和新独立重装约束，并索引原文/blob身份、U2C/2B2-B有限范围PASS、SIGKILL边界与退役冷断电NOT EXECUTED/归档哈希。同步 GHCR 状态入口、R5、项目索引、G2/Recovery Kit/S1 导航，不重写历史日志或原始JSON，不修改代码/测试、17项Bundle、owner/依赖图/架构基线、权限/CI、Prisma/schema/migration、生产主机和VM/离机资产。G2 NO-GO、S2扩充接线暂停及各阶段授权门禁保持原意；本批不构成新实验或生产验收。后续CI/交付更新本条，不重复登记批次。

## 2026-10-17 — 文档清理第三批：已完结工作包全文归档

**状态：本地文档改动已审阅并获远端交付授权，现通过 [PR #2851](https://github.com/sanqin888/sanqinMVP/pull/2851) 交付。CI 与合并的权威证据以该 PR 最终 head 的 Checks 和合并记录为准；本文不预先声明 CI 通过。未执行本地 lint/build/test。** 分支 `docs/archive-completed-work-batch3-20261017`，基线 `origin/dev@b3179ff4`（第二批 PR #2850 已合并，最终 PR CI #7321 七项成功）。将 17 份已完结记录迁入 `docs/archive/`，保留全部原文字节/Git blob 身份及旧路径映射；新增 [归档索引](../archive/README.md)、[长期约束](./已完结工作长期约束.md) 和 [浏览器 E2E 说明](../../apps/web/e2e/README.md)，将 A4 真实运行观察承接到现行工作站手册。同步项目入口、Backlog/Roadmap、依赖图中的文档引用与兼容登记证据路径；只有定位改变，compat_id/状态/owner/退出条件、依赖边/计数/架构基线均不变。Phase 7 保持源码/架构关闭的限定范围，Phase 9/Payroll/provider 及设备的递延证据仍显式保留，不宣称重新完成生产验证。历史 modularization 日志、原始 JSON 收据、Phase 6/8、Payroll、现役 Runtime、代码/测试、schema/migration、依赖/CI 和生产/VM/离机资产不变。详见归档索引；后续交付状态更新本条，不重复登记批次。
