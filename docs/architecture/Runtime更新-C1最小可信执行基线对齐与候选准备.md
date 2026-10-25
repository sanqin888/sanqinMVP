# Runtime 更新 — C1 最小可信执行基线对齐与候选准备

**2026-10-25 PREP-12本地实施：**PREP-11已由PR #2946 / CI #7563十项全绿合并 `bdfb25af`。用户现授权 [Python3.12.15可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，新增固定来源/主指纹验签、安全解包、stage清单/关键库归属及归档材料工具、18个离线测试方法和仅dev手动触发的Jammy隔离构建工作流；源码验签/构建/测试均未执行，产物未生成、未推送。**IMPLEMENTED_LOCAL / BUILD_NOT_RUN / C1_OPEN**。现有9文件候选、全部guard、17 Bundle、owner/跨上下文边/scanner baseline、业务和数据库保持原样；构建与测试仅同Runtime/Ops owner关系。

**PR #2946远端验证续记：**19文件已完整提交，源码head `802a0ae8` 的 [CI #7562](https://github.com/sanqin888/sanqinMVP/actions/runs/40166026342) 已通过Runtime848、Release45及精确3.12.15回归203项。E2E因ECR Public镜像拉取Data limit exceeded在测试前阻断，CI服务镜像已最小改回Docker Official上游同标签，最终head仍须全绿再合并；最终Checks/merge以 [PR事件](https://github.com/sanqin888/sanqinMVP/pull/2946) 为准。下一任务为 [PREP-12可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，本批未启动，解释器来源/安装及C1继续OPEN。下方LOCAL/CI_NOT_RUN按实施审阅时点保留。

**PREP-11当前状态（2026-10-25，本地待审）：**用户已授权按审计实施，launch/bootstrap现固定 **CPython3.12.15 final / `/opt/sanq/python/3.12.15/bin/python3.12`**；process_check算法保持，6个测试文件同步，新增2个旧材料/混合绑定拒绝方法。原CI门禁保留，新增setup-python@v6的精确3.12.15回归步骤，未执行。见 [实施续记](Runtime更新-C1-PREP-11-Python31215变更审计.md) 和 [九源审阅快照](evidence/c1-prep11-python31215-source-review-2026-10-25.md)。**IMPLEMENTED_LOCAL / CI_NOT_RUN / INTERPRETER_PROVENANCE_OPEN / C1_OPEN**。代码路径已选定，实际构建产物/来源、安装与Jammy验收尚未完成；下方旧状态保留历史范围。

**当前下一步（C1-PREP-11，本地）：**PREP-10已由 [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) / 最终 [CI #7558](https://github.com/sanqin888/sanqinMVP/actions/runs/40151007839) SUCCESS合并 `17188367`，来源记录为Markdown审阅视图、包内原JSON/摘要不变。现已准备 [实际平台身份与包元数据5条只读查询](Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md)，下一动作是取得选定AWS主机的操作者输出，核对Ubuntu/架构、Python完整包revision/归属及路径metadata，再复用匹配的R1-A/S5证据；**OUTPUT PENDING / PLATFORM NOT VERIFIED / C1 OPEN**。本批未运行现场命令或目标Python、未推送，九源字节/3.12.3选择和真实交付/效果门禁不变。

**PREP-10远端续记：**[PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) 修复后 [CI #7557](https://github.com/sanqin888/sanqinMVP/actions/runs/40150848390) SUCCESS（纯Markdown文档检查；Runtime等重lane按原规则跳过）。仓库只保留来源JSON的Markdown审阅视图，包内原JSON/摘要未变；CI/selector未改，最终head/merge见PR事件。真实平台/交付及C1仍OPEN。

**最新进度（C1-PREP-10，本地待审）：**PREP-09已由 [PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) / 最终 [CI #7553](https://github.com/sanqin888/sanqinMVP/actions/runs/40149478415) SUCCESS（Runtime846 / Release45）合并 `b7b7f276`。本批 [候选源码固定与只读验收准备](Runtime更新-C1-PREP-10候选源码固定与只读验收准备.md) 固定9源码/78,274 bytes、逐文件Git blob/SHA256及源码包，9/9与已测head相同；[清单](evidence/c1-prep10-source-inventory-2026-10-24.md)为来源材料记录，未交付/运行任何真实入口。Python3.12.3已选定，实际平台/包revision/关键来源、root受控交付、真实批准输入与同平台必要验证仍OPEN，完整效果候选未冻结。本批未推送；以下各批LOCAL/NOT_RUN及CI待定语句按其历史时点保留。

**C1-PREP-09 交付续记：**[PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) 源码 head `97ac6fd3` 的 [CI #7552](https://github.com/sanqin888/sanqinMVP/actions/runs/40149348914) SUCCESS，Runtime 846（含新增32）/ Release 45，无需修复。用户已授权最终 head CI 全绿后合并 dev 并继续；本批先前 LOCAL/NOT_RUN/未推送为历史时点，最终 Checks/merge 以 PR 事件为准；真实来源/执行验收及 C1 仍 OPEN。

**2026-10-24（America/Toronto）｜C1 OPEN / BASELINE ALIGNED_LOCAL / CANDIDATE PREPARATION STARTED / FINAL CANDIDATE NOT FROZEN / NO PRODUCTION AUTHORITY。**

**最新进度（C1-PREP-09，本地待审）：**用户已确定 AWS VM 的 **Python 3.12.3** 为正常更新执行器版本；新增 [只读 Bootstrap 候选](Runtime更新-C1-PREP-09正式Python基线与只读Bootstrap候选.md)，接通固定受保护输入、双 pins、固定支持源码字节和现有候选装配器。32 项测试已编写，未运行/未 CI/未推送；真实效果入口仍未接线，实际平台/解释器关键来源和启动前信任未验收，C1 继续 OPEN。下列来源证据与各批历史状态按原范围保留；前批 PR #2941 已由最终 [CI #7548](https://github.com/sanqin888/sanqinMVP/actions/runs/40147153269) SUCCESS 合并 `814c1489`。

本包落实用户“先更新文档，将文档状态与现在进度对齐，之后启动 C1 最小可信执行基线对齐与候选准备，最终收口跟随正式执行候选完成”的要求。本批已经完成范围对齐、现有实现盘点、证据复用表、候选缺口与验收边界登记；没有把文档完成登记成 C1 验收通过。

## 1. 权威范围与核查基线

现行验收以 [R0 D1、C1 与 §4.1](Runtime更新-R0冻结设计.md)、[Runtime 交付与安装约束](Runtime交付与安装约束.md)、[G2 A–F](c5-g2-trusted-runtime-contract-2026-10-13.md) 为准。旧 R1-A/B/C、S6、C1-SYN 文档保留证据和实现历史；与 R0 最小必要取证规则冲突的全量闭包、第三方见证要求不再作为默认主线门禁。

本次 fetch 后核查的 `origin/dev` 为 **`08e5031cd9f8727e4bbe69cf18e86cf71367bedb`**。已读取 AGENTS、当前架构图、CI、R1/S1、正常更新核心与启动材料、固定 Bundle 清单、R2 Guard/安装清单/CAS 相关实现及记录。附件 2026-08-28 全站模块化审计只用于历史架构背景；当前 Runtime 状态由仓库现行文档与代码确定。

| 范围 | 当前适用规则 |
| --- | --- |
| C1 必做 | 目标原 Archive、17+Manifest 与发布 proof；实际正常执行器、解释器及影响安全/稳定的关键依赖和输入来源；实际执行位置、权限、完整性及必要的同候选验证 |
| 条件触发 | 发现未知可执行依赖、异常动态加载、来源缺项或路径替换风险时，针对受影响对象追加 FD/ELF/进程跟踪和必要隔离；不能用事后报警替代执行前拒绝 |
| 不再默认要求 | 全量 Python/ELF/dlopen 每次消费闭包、反复重采稳定依赖、所有 stdout/FD/namespace 原件、第三方人员/PDF/邮件/复算底稿 |
| 保留历史限定结论 | C0 为 CLOSED / LIMITED-ACCEPTED；R1-A、S5 等原件的 PASS_SCOPED 与旧失败回执按原对象、平台和范围保留 |
| C1 不替代 | R2/C4 持续维护禁入、R3/C5 AWS 快照、R4/C6 正式交接与恢复、R5/C7 端到端矩阵及 C8 精确生产授权 |

**取证范围精简不等于运行权限放宽。** 现有 `BLOCKED/DENY`、`launchAuthorized=false`、`readyToInstall=false` 等代码守卫保持原样。任何后续源码适配仍须按实际候选审阅，不得靠给旧回执填 true 获权。

## 2. 当前真实进度与证据复用

| 材料或实现 | 已达到的最高状态 | 可以复用 | 仍不能证明 |
| --- | --- | --- | --- |
| [R1-A 七包来源原件，S1 §9](C5-G2-R1-S1-独立Ubuntu签名验真采集程序.md) | 准确 Noble 七包签名/索引/包成员技术原件已复核；旧人工文档确认 LIMITED 保留 | 对相同发行、架构、版本、对象/成员和可信来源仍匹配的证据直接引用 | Jammy 或另一版本的解释器/库、最终执行器平台已认证；旧见证缺项不得重新列为必补 |
| [R1-B S5 §6–7](C5-G2-R1-B-只读GuestFD采集器与执行审批.md) | R1B-S5-CAPTURE-003 原件一致性 PASS_SCOPED；27 项 manifest、三个 FD 合计 8,297,330 bytes 已核对 | 归档 SHA256 `7d33106d340df9727276a969f12925852f6ab9ecc5542ff6ab88b9e8a3300ab9` 及相应来源/路径基线 | 正式执行器已经运行，或三个文件覆盖全部关键依赖；不默认重跑 S5 |
| `normal_runtime_update.py` / `normal_runtime_launch.py` | R1C-1 核心与启动材料已合并；[PR #2888](https://github.com/sanqin888/sanqinMVP/pull/2888) / CI #7417 SUCCESS | 一次性阶段顺序、能力缺失拒绝、失败保持维护等合成规则及已有测试 | 真实 bootstrap、effect adapters、Host/AWS/活跃路径执行；本次搜索的 NormalUpdateFlow 调用仅在测试内 |
| Maintenance Fence / Boot Guard / Unit 安装清单 | 离线合同及负例已进入 dev；VB-04D1 [PR #2927](https://github.com/sanqin888/sanqinMVP/pull/2927) 最终 head `9e39456a06792328c1c18a6541b26abf6c46f58d`、[CI #7504](https://github.com/sanqin888/sanqinMVP/actions/runs/40133068280) SUCCESS | 角色分类、绑定、事故状态、9 项路径意图与 service/socket 双入口约束 | 实装 Guard、真实 systemd 行为、持续禁入或 Docker 启动许可；相关判定仍 DENY |
| SQLite CAS 与认证 Wire | [P2-C3B](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md) 为 MAC PROCESS-LEVEL PASS_SCOPED；Wire [PR #2929](https://github.com/sanqin888/sanqinMVP/pull/2929) 最终 head `488377ef3a8739eebd9f25c0fe374a21d14aeebe`、[CI #7508](https://github.com/sanqin888/sanqinMVP/actions/runs/40134474536) SUCCESS | 固定源码、事务/重开/SIGKILL 的限定证据和离线身份/Wire 负例 | 实际 CAS mTLS 服务、正式受信 peer、独立 OFF_HOST/防回滚或 Guard 联动；TLS_ONLY 的后续限定实测见下行 |
| [LAB_ONLY TLS_ONLY 核心验收，PR #2938 / §2N](Runtime更新-R2-A2-3-P2-C3C3-IMPLEMENT-A本地Mac服务与证书交付门禁.md) | 非 CAS Mac↔Recovery Guest 临时端点的 TLS1.2 正例、缺client cert/错CA/错IP SAN 三负例及最终端口无可见监听，4/4 PASS_SCOPED / LAB_ONLY_MTLS_CORE_CLOSED；已合并 `dev@95d470ca` | 准确实验 CA/叶子身份、LibreSSL2.8.3↔OpenSSL3.0.2 的该组核心互通/拒绝结果；不重复已经完成的同范围实验 | 实际 CAS endpoint/enrollment/SQLite、正式 InstallationAnchor/Guard、完整负例矩阵或正式执行平台；实验身份不升级 OFF_HOST/生产权威 |
| [生产 H14–H18](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) | 已安装 17/17 + Manifest 内容/权限核对及部分当前状态 PASS_SCOPED | 原已安装对象的来源和位置基线 | 本次尚未选定的新目标包、外置执行器或其安装后状态 |
| C1-SYN A2-II-R/R2 | 只读取证 PASS_SCOPED；该 UID 对所查 cgroup 无直接写权，硬 8MiB quota/脱离子进程保障未证 | 原限定负证据和失败停止约束 | 不应将该专项的 BLOCKED 解释为 C1 主线必须先配置 quota/cgroup；真实 SYN 仍未获授权 |

上述 CI 是对应历史 PR 最终 head 的实际结果，已通过 GitHub PR/Checks 与 Git 历史核对；本批远端交付已获用户授权，首次完整文档 head 已通过 CI #7510；验证范围及最终 head 门禁见 §6 同批续记。

## 3. 首版候选清单：已启动的具体准备

清单标识为 **C1-MIN-PREP-20261024**，是待完成项底表，不是执行许可或已经冻结的正式候选。表中已有代码路径均为本次核查对象；“待实现/待选定”不填猜测文件名、版本或哈希。

| 项 | 组件/输入及当前定位 | 候选准备的实际缺口 |
| --- | --- | --- |
| I01 正常流程核心 | `ops/runtime/normal_runtime_update.py`：`NormalUpdateFlow.run`，`UpdateCapabilities` 仅定义能力接口 | 保留同一核心，登记最终接线组件和阶段；不能另造仅认证时使用的假执行器 |
| I02 启动入口 | PREP-03～09 已合并；只读bootstrap及32项测试已由最终CI #7553通过；PREP-10固定9文件源码清单/包，Git blob与最终已测head一致 | 操作器源码材料已固定；待初始bootstrap/批准pins的启动前可信来源、实际交付及同平台必要验证；完整执行与真实能力接线仍OPEN |
| I03 真实平台 | Jammy22.04.5/x86_64 metadata已收到；3.12.15 final及版本专属解释器路径已写入本地源码 | **PROFILE_IMPLEMENTED_LOCAL / CI_NOT_RUN / PROVENANCE_AND_INSTALL_OPEN**；精确版本CI步骤已编写，新九源为未提交审阅材料；实际解释器产物/来源、受保护安装、批准输入及Jammy同候选验收仍OPEN |
| I04 关键运行依赖 | 核心使用标准库；旧静态线索含 libm/libz/libexpat/libc；若实际选用 CAS/TLS，还涉及 sqlite3/SSL 及其真实后端 | 按最终组件识别会影响安全/稳定的执行依赖及来源；已有准确成员可复用，新增或变更对象补来源，风险对象才专项追踪；本表不是完整依赖认证 |
| I05 目标发布物 | `build_bundle.py` 的固定 17 成员 + 生成的 `runtime-release.json`；`runtime_trust.py` / release proof 规则已有 | 待选准确 main 发布 SHA、原 Archive digest/原字节、配对镜像 digest 和同 publish run proof；目标 Runtime、应用 SHA 与操作器源码版本分别登记 |
| I06 非活跃准备 | `prepare_runtime_update.py` / `stage_bundle.py` 可审阅复用；前者仍 `readyToInstall=false` | 逐项确认进入正式入口的准备实现、私有路径/权限及失败结果；不能把准备成功当成 activation |
| I07 维护与启动守卫 | `maintenance_fence{,_contract}.py`、`maintenance_boot_guard{,_contract}.py`、`maintenance_boot_guard_install_manifest.py` | R2 owner 提供最终接线候选、真实 Guard/Unit/锚点及安装来源；C1 登记这些执行材料，R2 负责持续屏障和竞态验证 |
| I08 离机 CAS/身份 | `maintenance_off_host_cas_{contract,sqlite}.py`、`maintenance_off_host_auth_wire.py` 仍为离线/合成模型 | 待实际服务、客户端、受信 transport/注册与证书来源/权限；若进入候选则补其版本和平台，私钥/凭据不进 Git |
| I09 快照能力 | `create_and_verify_snapshot` 目前是 Protocol，未有正常流程的真实 AWS adapter | R3 准备准确执行位置、最小权限与实现/输入清单；C1 审查执行来源，AWS 对象/恢复点真实性归 R3 |
| I10 正式交接 | `handoff` 无正常流程的真实接线；`offline_root_private_installer.py` 仍是受限合成 fixture | R4 准备真实安装/交接候选和路径/权限/持久化方式，保留实验 guard，禁止直接把 lab 限制移除当实现 |
| I11 复验与退出 | `verify_installed`、`restore_original_policies`、`verify_restored`、`release_business` 目前无真实能力实现 | 登记最终核验工具、原策略记录和最后业务放行边界；未知/中断保持维护，其效果验收随 R2/R4/R5 |
| I12 安装位置与输入保护 | PREP-09 将固定 sourceRoot 与 `/root/sanq-runtime-operator/normal-update-approvals/<txid>` 三文件的 FD/祖先/权限/集合/退出复检接入只读 bootstrap；VB-04D1 的 Guard 路径另属 R2 | 没有创建真实目录/控制文件或安装任何组件；外部批准 pins/源码的可信交付和实际 owner/mode/祖先、关键效果输入仍待同候选验收，读回自洽不认证来源 |

**外置对象也必须登记。** 固定 17 Bundle 不含正常更新操作器、Boot Guard 或离机 CAS；不能把它们算作未获批准的第 18 成员，也不能因其在 Bundle 外便省略来源、安装权限和完整性。是否最终选用某离线模块，由真实候选装配决定；不要求把全部实验文件打进生产。

## 4. 仍需在候选源码评审时对齐的旧合同

本批只更新文档，没有修改下列已存在的实现约束：

- `normal_runtime_launch.py` 的说明仍提完整 real dependency closure，输出仍固定 `dynamicDependencyClosureVerified=false`；其平台、路径、UID/GID 只是候选声明。R0 已取消全量闭包默认义务，正式入口须用明确且可核验的关键来源/权限规则落实该范围；不能填造旧字段 true 绕过守卫。
- `normal_runtime_update.py` 的 `UpdateRequest` 仍有 `current_archive_digest`，`UpdateCapabilities` 说明曾要求 both archives / closure。当前 R0 不把旧 Archive 取回作为 AWS 整机恢复的默认前置；最终 adapter 与输入合同须明确如何对齐，不因文档精简而擅改现有签名、取回旧包或放宽校验。
- `c1_syn001_guest_capture.run_scenario()` 仍固定抛 `A2_EXECUTION_NOT_AUTHORIZED`，`aggregateHardLimitEnforced/detachedDescendantsExcluded=false`。若后续针对具体异常选用该路线，先解决其资源/生命周期保障并取得准确执行授权；本轮不解锁，也不要求为了 C1 基线主动配置它。

这些是已经登记的源码衔接工作，不作为新增全量取证理由；在真实候选存在前也不能声称已经解决。

## 5. 工作顺序与最终收口

| 工作 | 本批状态 | 完成条件/依赖 |
| --- | --- | --- |
| 基线对齐与已有证据盘点 | COMPLETE_LOCAL | R0 和 R1/S1/SYN 的现行适用范围统一；本包完成现有代码与证据复用登记 |
| 正式候选准备 | READ_ONLY BOOTSTRAP SOURCE_CI_VERIFIED / SOURCE PACKAGE LOCAL / EFFECTS OPEN | PREP-03～09已交付；PREP-10九文件清单/包和验收顺序本地完成，实际可信交付与同平台验证仍待完成；完整效果接线随R2/R3/R4，不为未存在对象编造hash |
| 候选平台与来源绑定 | PYTHON3.12.15 PROFILE_IMPLEMENTED_LOCAL / PROVENANCE OPEN | 绝对路径已配置；须固定实际构建产物、关键来源/依赖和启动前保护，并完成CI与Jammy必要验证；匹配的旧证据按准确对象复用 |
| 同候选必要验证与 C1 裁定 | OPEN / NOT RUN | 正式候选可执行后，按精确授权进行受控验证和内部独立核对；不得转用无关演示、早期合成成功或不同平台局部结果 |

源码准备与 R2 主线可并行，**不要求 R1/C1 先 CLOSED 才允许准备 R2/R3/R4 源码**；执行维护、快照、安装仍分别遵循其精确门禁。C1 最终关闭跟随正式执行候选完成，避免“C1 等执行器、执行器等 C1”的循环。

最终 C1 审阅至少确认以下四件事，全部绑定同一组合候选：

1. **真实入口和组件。** 操作器/Guard/CAS 等实际入选源码版本、bootstrap、能力装配及子进程已固定；没有认证用与实际运行用两套路径。
2. **实际平台和关键来源。** 解释器、影响安全/稳定的必要依赖、执行位置/权限、关键输入已有可信依据；未知加载/路径风险已拒绝或获得定向解决。
3. **准确发布物和安装保护。** 目标原 Archive/17+Manifest/publish proof/镜像 digest 一致，外置组件单列版本和安装完整性；当前安装基线仅在仍适用范围复用。
4. **必要真实结果与限定裁定。** 覆盖已选入口的正常准入、错源码/解释器/依赖/关键输入或路径权限的拒绝、能力缺失及相关中断失败；记录准确对象、版本、结果和未决风险，由内部技术比对形成明确 C1 决定。

C1 的来源/执行验证可复用 R2/R4/R5 同候选的实际结果；跨重启维护、AWS 恢复和全部端到端场景仍由各自门禁负责，不重复建设第二套全量矩阵。后续若改变安全相关源码、平台、依赖、启动参数或输入边界，重新核验受影响部分，未受影响且仍匹配的证据继续复用。

## 6. 本批交付边界

本批仅修改文档，归 Runtime/Ops；无代码、依赖/锁、CI、Prisma/迁移、17 Bundle、模块 owner、跨上下文边、SCC/scanner baseline 或兼容合同变化。MCP-workspace 未开放 lint/build/test，未运行；文档差异和链接已核对，用户现已授权远端 PR→dev、最终 head CI 全绿后合并并开始下一步。因共享工作区仍被 TLS 审计占用，依据用户明确授权在独立本地缓存从最新 dev 重建本批七份文档，通过 GitHub 插件交付；不带入 TLS 未提交文档或改动共享工作区。PR/CI/合并状态以本包后续同批续记和 PR 事件为准。

**同批远端验证续记：**[PR #2930](https://github.com/sanqin888/sanqinMVP/pull/2930) → dev；首次完整文档 head `ea8c0cabc0fe36bd0d2974979f59f6e80c7e2eda` 的 [CI #7510](https://github.com/sanqin888/sanqinMVP/actions/runs/40135924881) SUCCESS，`ci-change-scope` 实际通过，Runtime/Release 等执行 lane 按 docs-only 正常跳过，不能称为新增运行时测试通过。随后最终文档 head `5dc25a8d14cb0ccc6af0fbeda198f631781a6c00` 的 [CI #7511](https://github.com/sanqin888/sanqinMVP/actions/runs/40136110790) SUCCESS，PR #2930 squash 合并 dev `67a88aae648b23266403b306b642d3d3a6526d2f`；此文档批已交付，不代表 C1 正式验收通过。

**总状态：C1 OPEN / CANDIDATE PREPARATION STARTED / R2-C4 OPEN / P0-01 NOT_RUN / S03-G06-S09 OPEN / C5-G2 NO-GO / S2 DAILY PAUSED。**

## 7. 2026-10-24 — C1-PREP-02 入口装配与关键来源绑定（本地）

用户已授权上一批合并后开始下一步。现基于 PR #2931 后最新 `dev@b7e8d882dbef75705ed63af911e265622fe59acc` 在独立缓存完成 [C1 候选入口装配与关键来源绑定方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)：四类候选身份、旧摘要与旧原 Archive bytes 的准确差异、启动前信任与实际加载顺序、11 个正常步骤及 abort 的接线责任、必要正反例。仅同步两处源码 docstring，不改 v1 字段/平台/guard 或运行行为。I01–I12 的装配准备已细化；平台/真实 bootstrap/关键来源和 live adapters 仍 OPEN，没有新模型、安装器或执行许可，本批发布基线为 `dev@a8898a90`、既有六文件 blob 未变；[PR #2933](https://github.com/sanqin888/sanqinMVP/pull/2933) → dev；完整源码 head `1a7809e0632c54f023aac4c11548c7845db64885` 的 [CI #7517](https://github.com/sanqin888/sanqinMVP/actions/runs/40137267379) SUCCESS，Runtime `649 tests / OK`、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。最终 head `185f962368b1d52d28c29dce05e54098f18b5bd5` 的 [CI #7518](https://github.com/sanqin888/sanqinMVP/actions/runs/40137391840) SUCCESS（Runtime 649 / Release 45），PR #2933 squash 合并 dev `51c7d01ba5928b5532d9e965b78797b8e372382b`；该批已交付，C1 正式验收仍 OPEN。

## 8. 2026-10-24 — C1-PREP-03 受保护源码快照（本地实现）

在 C1-PREP-02 已由 PR #2933 / 最终 CI #7518 合并后，本批围绕 I02 的真实源码材料读取实现 [C1-PREP-03 受保护源码快照与失败测试](Runtime更新-C1-PREP-03受保护源码快照与失败测试.md)。新增 reader 持有调用方借出目录的自有 FD，从完整允许集合读取并校验每个源文件，返回固定不可变 bytes，正常退出重验元数据/目录项，异常只关闭自有FD并保留调用方原因；27个聚焦测试已编写并经源码 CI #7522 验证，本地未运行。只解决源码字节固定这部分缺口，FD 与 sourceRoot/祖先/namespace、外部 pins 和实际平台来源仍未认证；不是可执行 bootstrap、C1 PASS 或任何维护/安装许可。现有正常更新与 17 Bundle/guard 不变，源码与效果准备可继续并行，最终 C1 仍随正式候选收口。本批已获远端交付授权，按最新 `dev@0fad2000` 保留 mTLS 并行进展，使用独立缓存/GitHub 插件，[PR #2935](https://github.com/sanqin888/sanqinMVP/pull/2935) → dev；完整源码 head `084a124c3342f2576a76f8da7b02817f042eedce` 的 [CI #7522](https://github.com/sanqin888/sanqinMVP/actions/runs/40139007584) SUCCESS，Runtime `690 tests / OK`（含本批27）、Release `45 tests / OK`、Runtime shell 语法检查通过，无需修复。最终 head `c6a1a15875b452be32d5d4e41835cdf9e1b909c3` 的 [CI #7523](https://github.com/sanqin888/sanqinMVP/actions/runs/40139311338) SUCCESS（Runtime 690 / Release 45），PR #2935 squash 合并 dev `a667b3a9209ed0124e475fa0b81d1bdf7e7594aa`；该批已交付，不代表来源/平台认证或 C1 最终验收。

## 9. 2026-10-24 — C1-PREP-04 源码目录锚点（本地实现）

在 PREP-03 已由 PR #2935 / 最终 CI #7523（Runtime 690 / Release 45）合并后，本批新增 [C1-PREP-04 源码目录锚点与失败测试](Runtime更新-C1-PREP-04源码目录锚点与失败测试.md)。以当前进程 `/` 为锚逐段绑定批准的 sourceRoot，持有所有祖先，组合 PREP-03 固定 bytes 并重验目录项；只检查批准路径的身份/权限，允许无关父级条目变化。25项虚拟根/真实 FD 测试已编写并由源码 CI #7525 覆盖，本地未运行。该机制不建立 Host/namespace、外部 pins/发布物或解释器/关键依赖信任，也未实现源码消费入口、真实 bootstrap 或效果适配器；未改变旧字段/平台/guard。I02 目录与字节准备继续推进，正式候选及 C1 仍 OPEN；用户现已授权本批远端交付，基于未漂移的 `dev@a667b3a9` 使用独立缓存/GitHub 插件创建 PR→dev，源码及最终 head CI 均已通过，现已合并并开始下一步。[PR #2936](https://github.com/sanqin888/sanqinMVP/pull/2936) → dev；完整源码 head `eafe0188a1fe218277d118d7134dd78737b19bf2` 的 [CI #7525](https://github.com/sanqin888/sanqinMVP/actions/runs/40140724214) SUCCESS，Runtime `715 tests / OK`（含本批25）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `78f67dad2b9221f0f383321b0b8eea7b37663345` 的 [CI #7527](https://github.com/sanqin888/sanqinMVP/actions/runs/40140803220) SUCCESS（Runtime 715 / Release 45），PR #2936 已 squash 合并 dev `3c4823bf95672b8930990892cd253aad705754b2`；该批代码已交付，C1 仍 OPEN。

## 10. 2026-10-24 — C1-PREP-05 固定启动输入（本地实现）

在 PREP-04 已由 PR #2936 / 最终 CI #7527（Runtime 715 / Release 45）合并后，本批新增 [C1-PREP-05 固定启动输入解析与失败测试](Runtime更新-C1-PREP-05固定启动输入解析与失败测试.md)。此前 launch/request 只有内存类型与规范输出；新增纯解析入口在 JSON 前核对两份原字节与外部固定 pin，严格拒重复键/非规范编码与数值、未知/缺项/常量漂移，重建现有类型并精确绑定 canonical bytes、launch digest 和 txid，保留旧摘要/目标差异/状态守卫及 false 字段。28项内存聚焦测试已编写并由源码 CI #7529 覆盖，本地未运行。不取旧 Archive 原 bytes、不认证 pin 来源/实际平台/解释器/已加载源码，不实现 loader/bootstrap/Flow/effect adapter 或任何实际执行权。I02/I12 输入读取桥接已准备，可信来源/关键输入保护与正式候选仍 OPEN；本批已获远端交付授权，基于未漂移的 `dev@3c4823bf` 使用独立缓存/GitHub 插件创建 PR→dev，源码及最终 head CI 均已通过，现已合并并开始下一步。[PR #2937](https://github.com/sanqin888/sanqinMVP/pull/2937) → dev；完整源码 head `be783b091bc5604283166d0d92621ddb1840fa53` 的 [CI #7529](https://github.com/sanqin888/sanqinMVP/actions/runs/40141511752) SUCCESS，Runtime `743 tests / OK`（含本批28）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `88a774a2e15daeb7cf171d8f4699bb7cf977a110` 的 [CI #7531](https://github.com/sanqin888/sanqinMVP/actions/runs/40141759436) SUCCESS（Runtime 743 / Release 45），PR #2937 已 squash 合并 dev `102eeeb5ac0c7e6ca658a4436928354925af8559`；该批代码已交付，C1 仍 OPEN。

## 11. 2026-10-24 — C1-PREP-06 固定源码字节加载（本地实现）

在 PREP-05 已由 PR #2937 / 最终 CI #7531（Runtime 743 / Release 45）合并后，本批新增 [C1-PREP-06 固定源码字节加载与失败测试](Runtime更新-C1-PREP-06固定源码字节加载与失败测试.md)。先验证两输入原件及完整SourceSnapshot，再从不可变bytes预编译并装配现有launch/update/inputs三模块；使用候选私有模块名和有限import映射，避免canonical cache/路径回退，并以刚加载parser返回同组UpdateRequest/LaunchMaterials/NormalUpdateFlow类型。30项真实源码/内存与临时FD测试已编写并由源码 CI #7535 覆盖，本地未运行，包含原核心显式供给inert能力后的11步结果仍BLOCKED/全部权威false。此库机制不调用run，不是sandbox/真实bootstrap，也不认证已加载的外层模块/解释器/关键来源或snapshot的FD上下文；不改变原v1/guard/17 Bundle或真实权限。I02固定bytes消费已具备本地实现，实际平台/先验可信入口、外部pins/关键输入保护、真实effects装配和C1同候选必要验证仍OPEN；完成时已对齐仅TLS文档/日志变化的 `dev@95d470ca`，保留PR #2938及其LAB_ONLY限定结果；本批已获远端交付授权，基于未漂移的 `dev@95d470ca` 使用独立缓存/GitHub 插件创建 PR→dev，源码及最终 head CI 均已通过，现已合并并开始下一步。[PR #2939](https://github.com/sanqin888/sanqinMVP/pull/2939) → dev；完整源码 head `42a5642d9b66f5d55910a9ff0e85847e50c79ad0` 的 [CI #7535](https://github.com/sanqin888/sanqinMVP/actions/runs/40143689266) SUCCESS，Runtime `773 tests / OK`（含本批30）、Release `45 tests / OK`，Runtime shell 语法检查通过，无需 CI 修复。最终 head `ca69f3d293f49d1d7f5b37724facd51ec3d32c7f` 的 [CI #7538](https://github.com/sanqin888/sanqinMVP/actions/runs/40143868669) SUCCESS（Runtime 773 / Release 45），PR #2939 已 squash 合并 dev `c808484c45096e29dd9760892fcf33f0baa497ea`；该批代码已交付，C1 仍 OPEN。

## 12. 2026-10-24 — C1-PREP-07 受保护候选装配（本地实现）

在PREP-06已由PR #2939 / 最终CI #7538（Runtime 773 / Release 45）合并后，本批新增 [C1-PREP-07 受保护候选装配与失败测试](Runtime更新-C1-PREP-07受保护候选装配与失败测试.md)。公共组合入口仅收两原件bytes和独立pin，先解析，再明确root:root捕获真实sourceRoot并加载固定bytes，源/祖先正常退出复检和FD关闭成功后才将同组核心/请求交给caller；模块context继续持有至caller退出。21项真实组件/虚拟根集成测试已编写并由修复后源码 CI #7541 覆盖，本地未运行，覆盖发布前漂移拒绝、错误阶段顺序、生命周期/异常及无隐式Flow/权威。它不认证外层启动源码/平台/解释器和pins，不提供动态输入保护、持续路径冻结或真实能力，不改原v1/guard/17 Bundle。I02组件已在组合入口接通，真实bootstrap/实际平台和关键来源、effect adapter及同候选必要验证仍OPEN；本批已获远端交付授权，基于未漂移的 `dev@c808484c` 使用独立缓存/GitHub 插件创建 PR→dev，源码及最终 head CI 均已通过，现已合并并开始下一步。[PR #2940](https://github.com/sanqin888/sanqinMVP/pull/2940) → dev；修复后源码 head `528088621f06ad7b445fd3cecf56cf3d5a6958c8` 的 [CI #7541](https://github.com/sanqin888/sanqinMVP/actions/runs/40145310353) SUCCESS，Runtime `794 tests / OK`（含本批21）、Release `45 tests / OK`，Runtime shell 语法检查通过。首次 CI #7540 的1项FD基线失败已仅在测试中修复：进入前gc.collect、保留退出时严格集合断言，并增加借入FD身份/存活及根FD关闭检查；未改实现或guard。最终 head `8638f522e04862ba30fb7c4b77ac9bf9b2bae87e` 的 [CI #7544](https://github.com/sanqin888/sanqinMVP/actions/runs/40145422597) SUCCESS（Runtime 794 / Release 45），PR #2940 已 squash 合并 dev `fe170ab1797a7135737d3bd411069ecfeee4fe55`；该批代码已交付，C1 仍 OPEN。

## 13. 2026-10-24 — C1-PREP-08 运行进程声明核对（本地实现）

在PREP-07已由PR #2940 / 最终CI #7544（Runtime 794 / Release 45）合并后，本批新增 [C1-PREP-08 运行进程声明核对与失败测试](Runtime更新-C1-PREP-08运行进程声明核对与失败测试.md)。按既有v1声明核对当前sys/os的OS/架构、Python3.12.3 final/解释器、real/effective身份、两层argv、准确五键环境/cwd及相关flags，在source capture前拒绝不符或读取失败；返回None，不清理/修复/重启、不输出观察或授权。新增18单元+2集成方法，既有21scope用例保留并使用明确模拟进程fixture，已由源码CI #7546覆盖，本地未运行。该后启动一致性检查不是OS/解释器/外层代码来源或原生env/namespace认证，也未选择正式部署平台；不能阻止错误解释器自己先运行。I03声明对应与I02入口顺序已在本地接通，正式bootstrap、启动前信任/关键来源和输入保护、真实effect及C1同候选验证仍OPEN；本批已获远端交付授权，基于未漂移的 `dev@fe170ab1` 以独立缓存/GitHub插件创建PR→dev，源码CI已通过，最终head全部必需Checks全绿后才合并。[PR #2941](https://github.com/sanqin888/sanqinMVP/pull/2941) → dev；完整源码 head `d40c370eb482e52dd61ae6443429834413331859` 的 [CI #7546](https://github.com/sanqin888/sanqinMVP/actions/runs/40146872548) SUCCESS，Runtime `814 tests / OK`（含本批新增20）、Release `45 tests / OK`，Runtime shell语法检查通过，无需CI修复。当前同批只补验证记录，最终 head 仍须实际 CI 全绿才合并；最终 Checks/merge 状态以 PR 事件为准。

## 14. 2026-10-24 — C1-PREP-09 正式 Python 基线与只读 Bootstrap（本地）

用户已明确采用 AWS VM 的 Python **3.12.3**，沿用既有 v1；本批在 `dev@9a20a026` 的独立 MCP-workspace 分支新增 [只读 Bootstrap 候选](Runtime更新-C1-PREP-09正式Python基线与只读Bootstrap候选.md)。固定 txid 审批目录中的三文件给出双 pins，支持源码全部核对/预编译后按私有模块集合加载，接通既有候选装配器；内外层 FD/路径退出复检及关闭先于核心交付。CLI 只读装配，不调用 Flow，报告继续 false/BLOCKED。32项测试已编写、未运行；首次审阅待用户批准，尚未提交远端。I03的 Python 版本选择已完成，实际 Ubuntu/包 revision/解释器/关键依赖、bootstrap与批准 pins 的启动前信任和真实交付、效果与同候选验证仍OPEN。前批PR #2941已由最终 [CI #7548](https://github.com/sanqin888/sanqinMVP/actions/runs/40147153269) SUCCESS合并 `814c1489`，上一节的“最终head待CI/merge”是历史时点；本批保留后续PR #2942的TLS限定进展。没有维护/AWS/安装/生产许可、17 Bundle或原v1/guard变更，C1最终随正式执行候选收口。
