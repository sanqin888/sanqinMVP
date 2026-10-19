# Runtime 更新 R0 冻结设计

**2026-10-19 R1 取证状态续记（本次仅本地文档待审）：**S1-W1 可信公钥取得限定独立审批，S1-R1 Hosted Runner 的准确 `noble` Release 签名原件和 S1-D1 加密归档/读回已核对；详见 [S1 §8](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。**仅关闭 R1 内部这组有限取证子项，Runtime R1 / C1 总体继续 OPEN**。R1-A/B/C 仍需推进；R2 MAINT-RESTART-01 依然是下一正式总批次、目前未实施。旧 §3/§5 的历史“未执行”记录不追溯修改；本次没有新源码/Guest/root/AWS/生产授权。

**2026-10-18 两项修订交付：**[PR #2864](https://github.com/sanqin888/sanqinMVP/pull/2864) → `dev`；CI/合并以此 PR 最终 head 的 Checks/事件为准，原 PR #2853 仅为初始 R0 历史交付。

**原 R0 交付记录（历史）：**[PR #2853](https://github.com/sanqin888/sanqinMVP/pull/2853) → `dev`；本批提交、最终 head 的 CI 与合并状态以该 PR 检查和事件为权威。

**原 R0 / C2 冻结记录（历史；本次修订见下文 §2）：D1–D5 APPROVED / R0 DESIGN FROZEN。C2-CHANGE-01 已将 C2 恢复模式唯一确定为「指定 Snapshot → 独立新实例」，并废止原机 `snapshot restore` 验收。2026-10-18 **C2-CHANGE-02 用户明确授权调整证据充分性规则**：现有 A/B Snapshot 来源、克隆操作与 rc、独立 VDI、Host/Guest 有限基线、合成服务及离机归档可被直接独立审查；Marker A/B **不再是强制前置**，而是仅在关键来源/时点证据不足且另获授权时才可能补充。不得把来源链等同整盘内容不变或全部快照后变化不存在。D1–D5 及 C1/C3–C8/G2 授权不变。** 用户明确要求“五项都按照推荐方案进行 R0 一次冻结设计”，本记录据此生效，不再等待重复架构批准。冻结日为 2026-10-17（America/Toronto）；源码核对基线为 `origin/dev@592c534896d18ca51082b708b8ab677402fabe4a`，文档分支为 `docs/runtime-r0-design-freeze-20261017`。

**本次补充状态（2026-10-18）：RUNTIME-SNAPSHOT-01 / MAINT-RESTART-01 APPROVED；DOCUMENTATION DELIVERY AUTHORIZED / IMPLEMENTATION NOT STARTED / AWS ACCEPTANCE NOT RUN / C5-G2 NO-GO。** 上面的 PR #2853 与原 R0 冻结日期是历史交付记录；本批从 `origin/dev@a76d526592b7a46e4659f485a3089d753e267b3c` 审阅，仅更新文档；本批已由用户明确授权提交远端，CI 和合并以本批 PR 最终 head 的 Checks/事件为准。用户已批准两项设计变更，未执行 AWS/IAM/Guest/root/生产操作。C2 的独立证据规则按其最新所属合同保留，本批不重置或补造任何实验结论。

## 1. 权威入口与有限边界

本文统一决策、进度和 C1–C8；[AWS 整机快照与维护冻结方案](Runtime更新-AWS快照与维护冻结方案.md) 是本次两项变更的详细操作/状态/恢复合同。[G2](c5-g2-trusted-runtime-contract-2026-10-13.md) 保留 A–F 精确授权层级；[交付与安装约束](Runtime交付与安装约束.md)、备份恢复手册和总队列按这两个现行入口解释。旧 Kit 合同、S1、历史工作日志保留实现/证据事实，旧恢复路线已明确退役为本次更新必做项。

首版目标是独立 Runtime 正常更新，以及维护窗口内失败后从准确 AWS 快照创建替代实例。固定 17 源文件加 Manifest 不变；应用发布/回退仍属 `ops/release/deploy_release.py`。正常更新不改应用 SHA、schema、DB/Uploads，整机恢复则会恢复快照中的磁盘数据，须遵守持续停写保护窗口，不能冒称业务数据永远不变。外部安装副本兼容、旧 checkout 退役仍分别审阅。

## 2. 五项冻结决策及已批准修订

原 R0 为 2026-10-17 D1–D5 冻结；2026-10-18 两项用户批准修订如下，避免继续执行被替代的恢复链。

| 决策 | 现行方案 | 固定边界与完成条件 |
| --- | --- | --- |
| D1 信任模型与平台 | 有限、独立认证的实际 Linux/Python/loader/native 平台及正常更新执行器，AWS 控制面/受控账户、内核和受控 root 管理是明示信任前提 | 目标原 Archive、准确发布 proof、完整执行依赖与输入来源仍验证，未知拒绝；不递归自证内核。仅为旧故障主机恢复自举而设的 Python/ELF 重建链不再作为 AWS 恢复前置，不放宽现有模型 guard。 |
| D2 有限维护（MAINT-RESTART-01） | 先确认管理通道，记录原状态；准确容器临时 `restart=no` 并正常停止，阻止 systemd/cron/Compose/MCP/deploy 重新启动，持续停写直到最终放行 | 停用状态进入快照、跨 Docker/VM 重启及新实例首启有效；验证 namespace/持有者/新消费者禁入；不能仅 stop、flock 或空扫描。不得改受 Manifest 校验的 Compose 文件。成功才按原状态恢复，事故保持冻结。 |
| D3 更新前恢复点（RUNTIME-SNAPSHOT-01） | 由受限代码创建唯一 Lightsail 手动整机快照，等待准确对象 `available`，核对源账户/Region/ARN/时间/盘和 txid，离机保存轻量清单 | 替代同次 mandatory crypt/Drive Kit、双旧/新 Archive 解密读回前置；不是人手点控制台。快照覆盖不足、错误、碰撞或未知结果均阻止安装。手动对象明确保留，不自动清理。 |
| D4 备份与实施顺序 | 现役日常备份健康/独立 DR、持续维护冻结、本次可用快照先于活跃安装；S2 daily 扩充在 v1/C5 后另批 | 日常 DB/Uploads/配置/TLS/roles/escrow 保留，S2 PAUSED 不表示停用现役 timer；本批没有部署新 helper、sudoers 或 AWS 凭据。 |
| D5 中断与恢复 | ABORT 旧更新事务、保持冻结并留证；人工确认本次准确快照→独立新 AWS 实例，验证后受控恢复策略与切流 | 不 replay journal、不依赖故障机自举 clean reinstall；源机必须防双写。仅在快照后到放行前持续停写窗口直接适用；放行后故障/未知外部付款订单转独立 DR/向前修复/权威对账。冷掉电仍 NOT VERIFIED。 |

快照 `available` 仅是控制面完成，不能代替应用/数据恢复验证。快照 ARN 不是 tar.gz SHA256，不虚构整盘 hash、签名或 WORM。准确认证/最小 IAM、执行位置和对象在实现时评审；本批不取得任何云/主机执行权。

## 3. 真实进度与尚未成立的结论

| 工作 | 可追溯现状 | 不能据此关闭 |
| --- | --- | --- |
| S1 protected snapshot | PR #2789，dev merge `7723262e`，PR CI #7164 / dev CI #7165 通过；独立库契约已合并 | 没有真实 crypt/远端适配、生产 helper 安装或 daily 接线 |
| G2-A 及 B 系列模型 | 历史来源检查、维护模型、FD 读取/交付、声明绑定等源码已在核对基线；保持各自非授权边界 | 不是已实现的可信 privileged installer；旧日期“本地待审”不再是总进度 |
| B4B-3A 依赖清单 | PR #2848 已合并；merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061`；final head `d4d5513f5dc734e0f9b9321e99e49582073cd263`；CI #7315 / run `39077195858` 通过 | 仅合成声明图校验；没有真实文件采集、独立来源认证或真实 Operator 执行 |
| B4B-2 Guest 实验 | 操作员报告固定合成字节机制 8/8；hash/原证据定位见对应验收文档 | 不是真实解释器完整闭包、独立见证或安装资格；过去未做的原机 restore 只是历史事实，不再属于新 C2 验收；该实验仍不能代替新实例恢复门禁 |
| B2B8 / H-01–H-08 | B2B8 仅 S1/S2/S11；H 系列为有限负向证据（H08 4/4） | 未形成可阻止新消费者的真实整机屏障，namespace/观察完整性仍需 R2 |
| C2-0 / C2-1A–D 生产式恢复模拟（2026-10-18） | 用户原始两份归档已被独立读取复算 SHA，Guest 22 项中 19 项稳定输出/rc 完全一致，3 项为 UTC、IP、临时 mountinfo 差异；完整来源见 [B2B2 §9](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) | 克隆、新 VDI、Ubuntu、合成 HTTP 接管及归档完整性有限 VERIFIED；原始 Host 独立真实性和部分外层 SSH rc 等限制经 [N-07 最终风险裁定](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) §9.6 接受，**C2 隔离合成恢复前置项已在限定范围 CLOSED**；真实 AWS/业务恢复不能据此关闭 |
| 正式更新与独立恢复 | 新 AWS 快照/维护冻结合同已批准，尚未实现；仍缺正常执行闭包、真实维护禁入、代码快照与正式安装/新实例恢复组合 | **C2 已作为可丢弃隔离实验恢复前置项有界 CLOSED（N-07 LIMITED-ACCEPTED）**；C1、C3–C7 仍 OPEN，C8 NOT REQUESTED；真实 AWS S01–S12、安装/维护冻结和生产交付未实现，NO-GO |

上述是源码/已有证据核对，不是重新检查任何生产主机、Guest、快照、凭据或远端对象当前存在。已安装 Runtime 的历史身份仍见[发布与 Runtime 状态](../runbooks/GHCR发布与Runtime状态.md)，不能用 dev SHA 替代 installed source 或 app image SHA。

## 4. 八个最终门禁与证据登记

| 门禁 | 关闭条件 | 当前状态及主要后续 |
| --- | --- | --- |
| C1 来源与可信执行 | 目标原 Archive/发布 proof、正常更新执行器外部 pins、实际解释器/loader/完整依赖及真实消费核验；当前安装健康/完整性绑定快照 | OPEN：R1；旧版恢复专用自举闭包和双 Archive 不再重复强制 |
| C2 生产模式可恢复的隔离环境 | 在无生产资产、隔离且独立核实身份的 Guest 上，从**已认证指定 Snapshot 创建独立新实例**，依 [C2-02 N-01–N-07（C2-CHANGE-02）](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 核验 A Snapshot 身份和来源、实际 clone rc、新 VM/VDI、选定 Guest 稳定基线及明确的运行时差异、合成服务、离机归档与独立审阅；**不要求原机 restore / Marker A/B / 新快照** | **CLOSED — ISOLATED SYNTHETIC RECOVERY ONLY / N-07 LIMITED-ACCEPTED（2026-10-18）**：两份已独立核对的归档 SHA/内部清单、22 项 Guest 比对（19 同值/3 预期差异）、准确 Snapshot `showvminfo` rc=0、独立 VM/base VDI `showmediuminfo` rc=0、Host-only 合成 HTTP 接管/停止共同证明该可丢弃隔离实验环境的指定恢复流程。**N-07 风险接受仅适用于这些准确合成资产**：原始 Mac Host 无独立签认、历史 SSH 外层 rc 缺失、本轮 Host 输出未另作离机封存，按 [B2B2 §9.6](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) 如实保留，不补造值。不能据此认证真实 AWS 平台、新代码可信来源、持续维护冻结、数据库/Uploads/供应商恢复或授权 Guest/root 操作；C1/C3–C8 仍独立，C5-G2 NO-GO |
| C3 应用与存储一致性 | 本次 current/previous/env/running image、17+Manifest、C4、project/DB/Uploads 及外部安装副本相容，无 pending/未明事故 | OPEN：R3/R4，生产前另做当前主机核对 |
| C4 维护排他与禁入 | 原策略离机记录→准确容器 no/正常停止→所有启动/写入入口持续禁入；跨 reboot/快照首启仍冻结，namespace/持有者覆盖完整，成功精确恢复 | OPEN：R2；按 MAINT-RESTART-01，不修改 Manifest Compose |
| C5 本次 AWS 恢复点 | 代码创建准确手动快照、等待 available、来源/盘/txid/离机清单验证、保留和真实同平台恢复可用；每日备份健康/escrow 保持 | OPEN：R3；旧 crypt/Drive mandatory Kit 适配退出本次关键路径，没有标 PASS |
| C6 正式安装与替代恢复 | 正常 root-private/FD-safe/持久化交接；失败 ABORT 保持冻结，经确认准确快照创建独立 AWS 实例、隔离验证与受控切流；不续 journal | OPEN：R4；普通同 SHA upgrade 仍拒绝，云恢复可返回原已知版本，不要求受损机 fresh reinstall |
| C7 同候选端到端矩阵 | 同一最终候选/平台完成正常更新、拒绝、中断、外部恢复、重复中断、原状态恢复及独立核对 | OPEN：R5，不能拼接不同版本局部 PASS |
| C8 精确生产交付 | C1–C7 后，准确主机/版本/快照/窗口/操作者/原策略和停止条件获 G2-E 许可；执行后 G2-F 独立复验 | NOT REQUESTED / NO-GO：本批仅文档，无生产/AWS 操作 |

每份新增证据须登记 candidate 完整 SHA/执行 hash、平台和 Guest 身份、操作/授权定位、UTC 与执行顺序、原始 stdout/stderr/JSON、进程/FD/对象身份、退出码、失败/清理/恢复状态、原始字节离机 hash 对照及独立 witness 来源。runner 自写报告的再次读取不是独立见证。不得仅凭报告勾选或 `authorized=true` 接纳权限。

## 5. R0–R5 执行队列与依赖

| 批次 | 固定工作包 | 当前进度与依赖 |
| --- | --- | --- |
| R0 | D1–D5、两项批准修订、C1–C8、矩阵及文档收口 | 本次文档审阅通过且远端交付已授权；不重复请求两项设计批准 |
| R1 | B4B-3B/3C：真实执行基线、完整依赖/来源采集和独立消费见证 | IN PROGRESS：B4B-3B-1 已合并 PR #2854 / CI #7336 / dev merge `2bab5fe6`，仅为候选 FD 哈希与离机比对；B4B-3B-2A 已合并 PR #2855（dev `2db85d32`），提供仅内存 AST/ELF 静态线索；B4B-3B-2B1 已合并 PR #2857 / CI #7344（run `39098295751`）/ dev `1a82caff`，仅实现严格 no-follow 的候选目录 FD 逐段开启与合成测试；B4B-3B-2B2 设计已由 PR #2858 / CI #7346 合并（dev `c9db47b7`），其 2B2-A 已由 PR #2859 合并（final head `d366d62a906fe5060f1dbfe85b6e930bfbe77dab`；CI #7348 / run `39101080529` 选中作业成功，Runtime 281 / Release 45 合成 tests OK；dev merge `d5a8ba0dfc45ed349aa65edba160b0ffa5ee4386`），仅纯内存 alias 声明、不放宽已有 `O_NOFOLLOW`；2B2-B 受限真实路径/FD 解析及 C2 可恢复隔离 Guest 就绪已形成[专项评审和操作清单](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md)，**B2B2-B1 独立受限 nofollow alias FD 候选解析器及合成测试已由 PR #2861 / CI #7352 (run `39103592288`) 合并 dev `5d69eb81`；B2B2-B2 真实可信 root-anchor / Guest FD、独立外部 pin 未实施；C2-0 实际 Host/Guest 只读观察与 C2-1A–D 新实例恢复合成演练由操作员报告已完成，但按已批准 C2-CHANGE-01，按 C2-CHANGE-02 N-02/N-03/N-05 的 A/B 证据规则不再强制 marker，现有归档与最终 Host 只读核对已证实可丢弃隔离新实例恢复，N-07 历史来源局限已获限定风险接受，C2 隔离实验前置项 CLOSED（但真实 AWS 同平台验收/维护冻结仍未做）**，真实可信 alias/root-anchor 仍另审，仍无真实 Guest / `/'` 锚点证明、系统 symlink/realpath 认证、完整动态 Python/ELF/dlopen 闭包、独立来源或消费见证。privileged Guest 试验须先满足 C2 和精确命令批准。详见 [B4B-3B-1](C5-G2-B4B3B1-只读FD证据与离机比对.md)、[B4B-3B-2B1](C5-G2-B4B3B2B1-受控路径FD候选开启.md) 与 [B4B-3B-2B2 设计评审](C5-G2-B4B3B2B2-Ubuntu别名与可信锚点评审.md) |
| R2 | MAINT-RESTART-01：原策略/任务持久化、no/正常停止、跨重启维护与禁入、精确恢复 | PLANNED；先真实生产清单/接口评审；真实操作另行授权，不重构全消费者协议 |
| R3 | RUNTIME-SNAPSHOT-01：受限 API 创建/等待/验证本次手动快照，离机轻量恢复清单、未知结果处理与保留 | PLANNED；准确 AWS 账户/Region/权限/盘先审，快照前必须 R2 持续冻结 |
| R4 | 正式 Runtime installer + 准确快照→独立新 AWS 实例，首启冻结/数据/身份核对、单写者与人工切流 | PLANNED；组合正常执行来源、R2/R3；不部署旧故障主机自举链，不隐藏改外部 helper |
| R5 | 同最终候选完整端到端、故障和恢复矩阵；再提交精确 C8 readiness/执行/复验 | PLANNED；前四批真实证据成立后进行；不自动取得生产授权 |

**2026-10-18 R1 S1 独立 Ubuntu Archive 真实签名采集 CLI（本地待审）：**继 S0 文档 PR #2872/CI #7375 success 合并 `dev@001d7c345bff43f8c29391fdf9da45286c57fb81` 后，在 Runtime/Ops 外置命令入口增加**仅供独立审阅机未来经精确执行授权使用**的官方 `Release/Release.gpg` 原始 HTTPS 收集、固定本地 Archive keyring SHA、gpgv 实签验证与不可越权 receipt，附 22 个纯 mock 负例和 S1 [审批合同](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)。无实际 Archive key、真实 GPG 结果、Guest/root/VM/生产接触；输出永久 BLOCKED，C1 OPEN / G2 NO-GO / S2 PAUSED，R2–R5 不变。本地未运行 tests/CI、未推送，等待审阅。

**2026-10-18 R1 S0 实际 Host 身份转贴审阅：**用户按批准五条 VBoxManage 命令回传 Mac Terminal 输出；指定 C2 VM/Snapshot/VDI、Host-only 网络配置与盘链在操作员所见范围内匹配，Source 快照原双向剪贴板及当前差分盘差异均如实留存。**S0 = IDENTITY MATCHED (OPERATOR-OBSERVED) / EVIDENCE LIMITED，非完整 VERIFIED**；缺每条真实 rc、独立原件/witness/UTC 和 Guest 内隔离证明，不改变原 C2 已限定 CLOSED 及 G2 C1 OPEN；S1 真实官方签名未验、G2 NO-GO/S2 PAUSED。见 [审批包 §9](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)。

**2026-10-18 R1 B2-1 真实来源/取证审批准备（本地文档；其后 S0/S1 获授权但环境阻塞）：**B2-1D 已经 PR #2871/CI #7373 success 合并 `dev@e5f2e64376251f9f03edb1ebf337f74fab820d90`，仍只是候选一致性合同。本批从最新 dev 只形成 [真实 Ubuntu Archive 签名、指定 Mac/Guest 只读回执与未来 root-held FD 的分阶段审批包](C5-G2-R1-B21-真实Ubuntu来源与GuestRoot取证审批包.md)，不下载发行对象、不验签、不执行 Host/Guest/root，也不开放 Runtime 安装。根 collector 尚无固定源码、hash 和准确命令；需要另审后才能单独授权。C2 有界 CLOSED，C1 OPEN、G2 NO-GO、S2 PAUSED，R2–R5 与 AWS 门禁不变。

**2026-10-18 R1 B2-1D 跨包 Manifest 归属审阅（首次本地状态，现 PR/CI 已合并）：**B2-1C 已由 PR #2870 / CI #7371 成功合并 dev `3c623b88`。本批外置、纯内存组合 B3A Manifest 的 file SHA 与多个 B2-1C 声明式包内成员 SHA/link text，拒绝缺失、重复或孤儿候选映射；详见 [B2-1D](C5-G2-R1-B2B2-B21D-跨包文件归属候选审阅.md)。无独立真实性、GPG、真实 Mac/Guest/root/FD、安装或 AWS 取证；正常输出永久 BLOCKED。本地 tests 未运行，C2 有界 CLOSED/C1 OPEN/G2 NO-GO/S2 PAUSED，R2–R5 不变。

**2026-10-18 R1 B2-1C 下一离线源码批（当时本地待审，现已 CI 合并）：**B2-1B 已通过 PR #2869/CI #7369 合并 dev e823bb16。本批在既有 Runtime/Ops owner 内增加 .deb ar/data.tar 有界纯内存成员 SHA 与 symlink link text 候选对照，不解包到磁盘、不验证官方 GPG、不操作 Guest/root/安装；详见 [B2-1C 合同](C5-G2-R1-B2B2-B21C-deb包内文件与链接候选合同.md)。候选结果 BLOCKED，测试仅编写未运行，保持 C2 有界 CLOSED/C1 OPEN/G2 NO-GO/S2 PAUSED。

**2026-10-18 R1 B2-1B 后续源码切片（本地、未执行）：**继 B2-1A PR #2868 / CI #7367 全绿、dev merge `5711aa12` 后，外置新增纯内存 Ubuntu Release → Packages[.xz] → 准确 .deb 的候选 SHA256/size/身份一致性校验与合成负例，详见 [B2-1B 原始字节合同](C5-G2-R1-B2B2-B21B-Ubuntu原始字节链合同.md)。未真实下载 Ubuntu 发行原件、不验证官方 GPG、不解包 .deb 成员、不执行 Guest/root/安装，无生产权威；B2-1B tests/CI 尚未执行。C1 OPEN、G2 NO-GO，C2 有界 CLOSED，R2–R5 不变。

**2026-10-18 R1 B2-1A 分批续记：**在 B2-0 PR #2867/CI #7365 合并 `dev@b95f09e1` 后，本地新增固定 C2 Host/Guest 精确只读 argv 的原始 stdout/stderr/rc/摘要离线审阅及纯合成负例，详见 [B2-1A 审批包](C5-G2-R1-B2B2-B21A-原始只读取证审批包.md)。未运行本地 tests/CI、真实 Host/Guest/root、软件包签名验证或安装。当前只是本地源码审阅；B2-1B 的实际 Guest/root 操作与 C1 认证仍待准确对象/命令/来源另批批准。C2 有界 CLOSED、C1 OPEN、G2 NO-GO。

**2026-10-18 R1 B2B2-B2 源码批续记（本地、未执行）：**在 C2 有界 CLOSED 后，B2-0 纯内存 Guest packet / 独立离机候选一致性审核及合成负例已编写，B2-1 外部 Ubuntu 包/Host/Guest 只读取证方案已成文，见 [B2-0/B2-1 合同](C5-G2-R1-B2B2-B2-取证合同与离机审核.md)。未执行本地测试/CI、真实 Guest/root、平台/发行来源验证或动态依赖消费；未推送 PR。**不得将结构一致升级为 C1 PASS；C1 仍 OPEN、C5-G2 NO-GO。** 本地源码不改变 R2–R5、AWS S01–S12 和 C2 有界关闭口径。

S2 新 daily 扩充/接线/sudoers 后置不变；现役日常备份和独立 DR/凭据可用性仍是更新前置。下一批先做真实生产清单、协调器/生产执行器接口、最小 IAM、原策略持久化与恢复清单评审，再按 R1–R5 实现和同平台验收。不继续套用旧 R3 crypt/Drive、旧 R4 clean reinstall 工作单。

实际账户/Region/实例和盘、OS/Python/loader、Operator/pin、旧安装/目标 main SHA、现场 app/state、容器/units/入口/namespace、准确快照/操作 ID、外部事件保留与管理通道目前仍待采集，不编造值。

## 6. 单次操作顺序与保留

完整状态合同见 [AWS 快照方案 §4–5](Runtime更新-AWS快照与维护冻结方案.md)：PREFLIGHT → MAINTENANCE → FROZEN（先记录原策略，再 no/正常停服/一致数据）→ SNAPSHOT_PENDING → SNAPSHOT_READY → UPDATING → VERIFYING → RELEASED。任一活跃写不明/验收失败进入 INCIDENT，维护继续；严禁 finally 无条件恢复写入。

目标发布来源、17+Manifest、正常候选/preimage/原子交接与持久化校验继续；不改 Compose 原字节实现 no。只有控制面准确快照 available、覆盖数据一致和离机清单均成立才进入活跃安装。API 超时先查准确对象，不盲重试、覆盖或选 latest。

保留准确手动快照、原策略与挂载清单、已安装/目标/应用版本、授权/操作 ID/独立验证及原始证据，故障 VM 外必须可取得。每日加密备份、凭据 escrow 继续；本次不新建强制 `gdrive_secure:runtime-recovery/<txid>` Kit，不自动 prune 旧集合、事故/快照或原始证据。GitHub Artifact 90 天与 daily config 30 天不能充当本次快照保留策略。

快照后持续停写至最后放行；外部在途付款/订单仍需事件保存、幂等回放与权威对账，UNKNOWN 不等于失败。失败后准确快照创建替代实例，首启仍维护，旧机防双写；验证来源/数据/身份/入口及外部状态后人工确认恢复策略与切流。已重新营业或发生不明写入，不能直接覆盖新订单，转独立 DR/向前修复。

## 7. 首版固定验收矩阵

下面 18 组是关闭要求，**均不是本批执行结果**。D5 已批准，旧三检查点冷取证退出首版默认范围；不删除原实验或将 NOT EXECUTED 改为 PASS。

| ID | 场景 | 必须观察的结果 / 主要门禁 |
| --- | --- | --- |
| A01 | Guest 身份/隔离/平台不符，恢复基线不可用 | root 实验前停止；C2 不关闭 |
| A02 | 正确来源与真实执行材料 | 外部 pins、FD/输入、实际消费及独立观察一致；固定表达式不足以代替；C1 |
| A03 | 错源码/解释器/依赖、路径替换、未知 import/动态库 | 在相关材料被执行前拒绝；不得只靠退出后告警；C1 |
| A04 | 错 main SHA、配对镜像/Archive、seal/run，伪造/重打包 | 无活跃写；历史指定版本不改选 latest；C1/C5 |
| A05 | pending、env/state/running image 不一致、错误 volume/bind/外部 helper | 无活跃写；不自动 normalize 或 repair；C3 |
| A06 | 已有备份服务/后代、deploy/Compose/MCP/SSH cwd/fd/mmap/别名引用 | 检测并等待经授权处置；无法确定就 BLOCKED；C4 |
| A07 | 持有者改名、PID churn、不可读/漏项/预算耗尽、bind/namespace | 不把零已知持有者当全覆盖；unsupported namespace 必须拒绝；C4 |
| A08 | 屏障建立后新消费者尝试进入 | 在批准威胁模型内确实阻止；仅观察到“进来了所以拒绝”不算正向屏障通过；C4 |
| A09 | 快照名/事务碰撞、并发、API 超时/不明成功 | 先查准确操作/对象，不覆盖/删旧对象或猜 latest；无合格快照无 Runtime 活跃写；C5 |
| A10 | 错源/Region/盘、失败/未 available/旧快照，离机清单不可用 | 拒绝安装；不虚构整盘 hash/恢复资格；C5 |
| A11 | 故障 VM 完全不可用，仅云控制面与离机清单可取 | 能准确定位已验证恢复点和保留资料，在真实 AWS 隔离环境完成替代恢复；无需故障机下载双 Archive/自举；C5 |
| A12 | 完整正常更新 | 同一候选真实操作，全量文件/动态 bytes/owner/mode/app/storage/健康前后对照；无隐藏 rollout；C3–C7 |
| A13 | prepare/策略/停服/快照阶段失败，原 enabled-active 或 disabled-inactive | 无 Runtime 活跃写，错误和原状态留证；仅满足安全取消条件才受控退出，不自动启一切；C4–C7 |
| A14 | 准备持久化、交接前后、保留旧树、收尾前等活跃窗口中断 | ABORT、留证、禁止旧事务重入和 journal replay；按本节 I1–I6 冻结检查点执行，并覆盖下述 S 场景映射；C6/C7 |
| A15 | 活跃树/主机不可用，完整云恢复 | 人工确认准确 AWS 快照→独立实例，首启 no/维护，数据/版本/身份/单写者/外部事件核对后切流；C5–C7 |
| A16 | 普通同 SHA upgrade、快照返回已知原版、旧 journal/candidate | 普通升级仍拒绝；独立云恢复允许原已知版本，不 replay 旧 journal、不覆盖旧事故对象；C6 |
| A17 | 恢复创建/核对/切流再次中断 | 新事故、准确新操作/授权；保持维护与单写者，旧恢复点/实例/证据保留；C6/C7 |
| A18 | 成功退出或恢复策略/任务失败；快照后意外写入/业务放行后故障 | 成功按原策略恢复且最后放行；失败冻结、不一律 enable/start；写入/外部未知转独立 DR/向前修复，不直接数据回退；C4/C8 |


**A14 活跃窗口检查点一次冻结为 I1–I6：**I1 候选/preimage 写入与 fsync 完成前；I2 准备持久化完成后、交接前；I3 交接调用前后（须观察结果或不明状态停止）；I4 新树已活跃、父目录持久化完成前；I5 持久化后、独立全量复验/事故收尾前；I6 快照替代实例的创建/隔离验证/受控切流中再次中断。具体 runner 可在这些边界内注入，不能把边界改成单一 prepare 阶段即宣称覆盖。实际交接必须按目标文件系统证明其支持的原子语义，不将 Python mock 或退出后检查代替。

原 S 场景映射：S1/S2 → A13/A18；S3–S7 → A06；S8/S9 → A07；S10 → A08；S11 → A13/A18；S12 的事务中断/禁止 replay 部分 → A14–A17，物理/虚拟掉电持久性部分按 D5 单独标 NOT VERIFIED。既有 S1/S2/S11 局部执行事实保留，不能冒充 R5 同候选整矩阵通过。

## 8. 交付与退出登记

本批两项设计变更已按用户批准写入；旧 R0/PR 交付和实验保留历史身份。本批文档已经用户审阅并明确授权远端交付；按本批 PR 最终 head 的 GitHub Checks 与合并事件登记结果，不提前宣称 CI 通过。未运行本地项目测试、Guest/root 或生产命令，没有创建快照/变更 IAM/重启策略，也无 schema/migration 变更。具体差异与交付记录在同批 worklog 更新，不沿用旧批授权。


后续按修订后的 R1–R5 补齐有限缺口，同一真实 AWS 演练可复用 C2 与快照恢复证据，不能为旧默认路线重复实测。G2 A–F 的精确 Guest/生产许可和安装后独立复验仍有效；此处不再次请求 D1–D5 决策批准，也不因 R0 完成自动开始任何生产操作。

## 9. 2026-10-19 — Runtime R1 最终剩余项审计与后续执行门禁（状态续记）

最新核查基线 GitHub `dev@58e317b79024a027644be7ec55e5eb7b9ad71143`。S1-R1 Runner [PR #2876](https://github.com/sanqin888/sanqinMVP/pull/2876) merge `c2e33af27bb15ad5ba209dd3831a2aae5a462d4a`，[Actions run 39285377503](https://github.com/sanqin888/sanqinMVP/actions/runs/39285377503) success。MacBook/Debian 公钥、见证审批及 Google Drive 归档读回为操作员独立保存/回传材料，准确原件和限制见 [S1 §8](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md)，不能把 GitHub CI 或操作员自报值单独当作完整 C1 独立消费证据。

| 门禁/任务 | 最新裁定 | 不能据此推论 |
| --- | --- | --- |
| S1-W1 可信 keyring + 见证审批 | LIMITED APPROVED；准确 SHA-256 `80a36b0a6de2f69f49d2df75ef473ccde121e9e190b9ea01d20a4f63778d5c31` | 目标 Guest 的具体 Python/loader/deb 已获来源认证 |
| S1-R1 GitHub Runner（**非 Runtime 总 R1**） | `noble` Archive Release 真实签名原件 LIMITED VERIFIED；原 decision=BLOCKED 保留 | 其他 pocket、Packages/deb、生产安装或执行材料已认证 |
| S1-D1 加密归档 | OPERATOR-REPORTED VERIFIED；对象 ID `1cOiq-V7wjef-F5kOivVsD5uC1Ct5QA-y`、读回包 SHA-256 `0f0683a2a9ae2c68c572d28864d66c6e9646cd7da9d287c9423e1574fd282600` | WORM、原子 create-only、U 盘副本已复核 |
| **Runtime R1 / C1** | **OPEN**，尚缺包级来源、真实 root-held FD、动态执行消费与独立见证 | S1-R1/D1 成功即可关闭整个 R1 |
| R2 / C4 | PLANNED / NOT EXECUTED，MAINT-RESTART-01 | 已允许真实生产冻结、快照或跳过 R1 |

**R1 剩余最小顺序：**R1-A（R1-S2：经签名 Release → Packages → 准确 deb/member 外部 pins，并补必要 S0/S3 Host/Guest 身份与原始 rc）；R1-B（S4 真正 root collector 与准确执行材料审阅，S5 隔离 Guest 可信根锚和 FD 实测）；R1-C（S6 / B4B-3C 正式正常更新执行器 CPython/ELF/dlopen 实际消费闭包 + C1 独立验收）。现有 B4B-3A/3B 合成声明、FD 观察、有限别名解析及 B2-1B/C/D 原件对照模块可复用，不为旧故障机自举 clean reinstall 的退役路线重新构建恢复闭包。

**R1 → R2** 是 R0 的总实施顺序；R2 的只读生产清单/接口 readiness 审计可以并行准备，不能据此将维护禁入或服务策略操作视为已实现、已实测或已获生产授权。D1–D5 冻结决策、17 成员、Docker/Compose、现役备份、权限与 G2 A–F 不变。R2–R5 继续按各自审批门禁执行；C2 仅隔离合成 CLOSED / N-07 LIMITED-ACCEPTED；C5-G2 NO-GO，S2 daily 扩充 PAUSED。本批文档尚未 push/PR，也未执行本地 lint/build/test、Guest/root、AWS 或生产操作。
