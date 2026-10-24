# Runtime 更新 — C1 最小可信执行基线对齐与候选准备

**2026-10-24（America/Toronto）｜C1 OPEN / BASELINE ALIGNED_LOCAL / CANDIDATE PREPARATION STARTED / FINAL CANDIDATE NOT FROZEN / NO PRODUCTION AUTHORITY。**

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
| SQLite CAS 与认证 Wire | [P2-C3B](Runtime更新-R2-A2-3-P2-C3B-001Mac进程持久化实测复核.md) 为 MAC PROCESS-LEVEL PASS_SCOPED；Wire [PR #2929](https://github.com/sanqin888/sanqinMVP/pull/2929) 最终 head `488377ef3a8739eebd9f25c0fe374a21d14aeebe`、[CI #7508](https://github.com/sanqin888/sanqinMVP/actions/runs/40134474536) SUCCESS | 固定源码、事务/重开/SIGKILL 的限定证据和离线身份/Wire 负例 | 真实 mTLS、受信 peer、独立 OFF_HOST/防回滚或 Guard 联动；当前 TLS 就绪审计另批维护 |
| [生产 H14–H18](Runtime更新-R2-A1-HOST-READ-002启动入口与实装身份审计.md) | 已安装 17/17 + Manifest 内容/权限核对及部分当前状态 PASS_SCOPED | 原已安装对象的来源和位置基线 | 本次尚未选定的新目标包、外置执行器或其安装后状态 |
| C1-SYN A2-II-R/R2 | 只读取证 PASS_SCOPED；该 UID 对所查 cgroup 无直接写权，硬 8MiB quota/脱离子进程保障未证 | 原限定负证据和失败停止约束 | 不应将该专项的 BLOCKED 解释为 C1 主线必须先配置 quota/cgroup；真实 SYN 仍未获授权 |

上述 CI 是对应历史 PR 最终 head 的实际结果，已通过 GitHub PR/Checks 与 Git 历史核对；本批远端交付已获用户授权，首次完整文档 head 已通过 CI #7510；验证范围及最终 head 门禁见 §6 同批续记。

## 3. 首版候选清单：已启动的具体准备

清单标识为 **C1-MIN-PREP-20261024**，是待完成项底表，不是执行许可或已经冻结的正式候选。表中已有代码路径均为本次核查对象；“待实现/待选定”不填猜测文件名、版本或哈希。

| 项 | 组件/输入及当前定位 | 候选准备的实际缺口 |
| --- | --- | --- |
| I01 正常流程核心 | `ops/runtime/normal_runtime_update.py`：`NormalUpdateFlow.run`，`UpdateCapabilities` 仅定义能力接口 | 保留同一核心，登记最终接线组件和阶段；不能另造仅认证时使用的假执行器 |
| I02 启动入口 | `normal_runtime_launch.py` 要求独立 pinned bootstrap；目前只有调用方提供的字节/元数据 | 待真实 bootstrap 和受保护加载入口；需绑定操作器 commit、逐文件 SHA/大小、完整 argv/env/cwd、UID/GID、关键输入与子进程 |
| I03 真实平台 | 旧 launch 候选固定 Linux x86_64、`/usr/bin/python3.12` / 3.12.3、`-I -S -B`；R2 新实验机为 Ubuntu 22.04.5 / systemd 249 | 待正式执行位置、OS/解释器/包版本和受支持环境选定；新 Jammy 实验不自动修改旧 Python 合同，也不自动成为生产候选平台 |
| I04 关键运行依赖 | 核心使用标准库；旧静态线索含 libm/libz/libexpat/libc；若实际选用 CAS/TLS，还涉及 sqlite3/SSL 及其真实后端 | 按最终组件识别会影响安全/稳定的执行依赖及来源；已有准确成员可复用，新增或变更对象补来源，风险对象才专项追踪；本表不是完整依赖认证 |
| I05 目标发布物 | `build_bundle.py` 的固定 17 成员 + 生成的 `runtime-release.json`；`runtime_trust.py` / release proof 规则已有 | 待选准确 main 发布 SHA、原 Archive digest/原字节、配对镜像 digest 和同 publish run proof；目标 Runtime、应用 SHA 与操作器源码版本分别登记 |
| I06 非活跃准备 | `prepare_runtime_update.py` / `stage_bundle.py` 可审阅复用；前者仍 `readyToInstall=false` | 逐项确认进入正式入口的准备实现、私有路径/权限及失败结果；不能把准备成功当成 activation |
| I07 维护与启动守卫 | `maintenance_fence{,_contract}.py`、`maintenance_boot_guard{,_contract}.py`、`maintenance_boot_guard_install_manifest.py` | R2 owner 提供最终接线候选、真实 Guard/Unit/锚点及安装来源；C1 登记这些执行材料，R2 负责持续屏障和竞态验证 |
| I08 离机 CAS/身份 | `maintenance_off_host_cas_{contract,sqlite}.py`、`maintenance_off_host_auth_wire.py` 仍为离线/合成模型 | 待实际服务、客户端、受信 transport/注册与证书来源/权限；若进入候选则补其版本和平台，私钥/凭据不进 Git |
| I09 快照能力 | `create_and_verify_snapshot` 目前是 Protocol，未有正常流程的真实 AWS adapter | R3 准备准确执行位置、最小权限与实现/输入清单；C1 审查执行来源，AWS 对象/恢复点真实性归 R3 |
| I10 正式交接 | `handoff` 无正常流程的真实接线；`offline_root_private_installer.py` 仍是受限合成 fixture | R4 准备真实安装/交接候选和路径/权限/持久化方式，保留实验 guard，禁止直接把 lab 限制移除当实现 |
| I11 复验与退出 | `verify_installed`、`restore_original_policies`、`verify_restored`、`release_business` 目前无真实能力实现 | 登记最终核验工具、原策略记录和最后业务放行边界；未知/中断保持维护，其效果验收随 R2/R4/R5 |
| I12 安装位置与输入保护 | 旧 launch 提议 `/root/sanq-runtime-operator/normal-update-v1`；VB-04D1 声明 `/usr/local/libexec/sanq-maintenance`、`/etc/sanq-maintenance`、`/var/lib/sanq-maintenance` 等 root 路径 | 这些仅是提议/意图，待最终安装对象的真实 owner/mode、父目录和来源完整性、输入允许范围及替换风险验证；不在本批建立目录或安装 |

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
| 正式候选准备 | STARTED / INVENTORY COMPLETE_LOCAL / EXECUTABLE CANDIDATE OPEN | I01–I12 已建立底表；下一步随 R2/R3/R4 源码准备补齐真实入口、接线与关键依赖，不为未存在对象编造 hash |
| 候选平台与来源绑定 | OPEN | 实际平台/组件确定后固定准确来源和位置/权限；仅补差异或关键缺项，稳定且匹配的证据直接复用 |
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

用户已授权上一批合并后开始下一步。现基于 PR #2931 后最新 `dev@b7e8d882dbef75705ed63af911e265622fe59acc` 在独立缓存完成 [C1 候选入口装配与关键来源绑定方案](Runtime更新-C1候选入口装配与关键来源绑定方案.md)：四类候选身份、旧摘要与旧原 Archive bytes 的准确差异、启动前信任与实际加载顺序、11 个正常步骤及 abort 的接线责任、必要正反例。仅同步两处源码 docstring，不改 v1 字段/平台/guard 或运行行为。I01–I12 的装配准备已细化；平台/真实 bootstrap/关键来源和 live adapters 仍 OPEN，没有新模型、安装器或执行许可，用户现已授权本批提交远端，发布基线复核为 `dev@a8898a90`、既有六文件 blob 未变；最终 head CI 待核。
