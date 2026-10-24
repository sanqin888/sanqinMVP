# Runtime 更新 — C1 候选入口装配与关键来源绑定方案

**2026-10-24（America/Toronto）｜C1-PREP-02 / SOURCE COMMENTS ALIGNED_LOCAL / ASSEMBLY DESIGN COMPLETE_LOCAL / REAL BOOTSTRAP NOT IMPLEMENTED / C1 OPEN。**

[最小基线工作包](Runtime更新-C1最小可信执行基线对齐与候选准备.md) 已由 [PR #2930](https://github.com/sanqin888/sanqinMVP/pull/2930) 合并 dev；最终文档 head `5dc25a8d14cb0ccc6af0fbeda198f631781a6c00` 的 [CI #7511](https://github.com/sanqin888/sanqinMVP/actions/runs/40136110790) SUCCESS，merge `67a88aae648b23266403b306b642d3d3a6526d2f`。其 docs-only CI 没有运行 Runtime/Release 测试。

本批按“合并后开始下一步”推进 I01–I12 的实际装配分析。PR #2931 追加 TLS 文档后，采用最新 **`dev@b7e8d882dbef75705ed63af911e265622fe59acc`** 为独立本地缓存基线，保留其全部内容；AGENTS、正常更新核心/启动材料与相关 CI 未变。用户已明确允许工作区占用时使用本地缓存与 GitHub 插件；本批现已获用户远端交付授权；发布复核采用最新 `dev@a8898a90a4d71fec1d2bba871b63b70dbb86268c`（PR #2932 仅新增另一份 mTLS 设计文档），本批六个既有文件的基线 Git blob 均未变化；保留其他批次完整内容，仅通过独立功能分支 PR→dev 交付。

## 1. 本轮完成与开放项

已完成：两处源码合同注释与 R0 D1/§4.1 对齐；11 个正常步骤及 abort 的装配责任表；四种候选身份、旧 Archive 摘要语义、启动前信任与加载顺序、聚焦验证清单。

没有新增 bootstrap、Host/AWS/Docker/安装 adapter、加载器、schema、服务或权限。正常阶段顺序、函数签名、LaunchMaterials/UpdateRequest v1 字段、旧平台声明、`dynamicDependencyClosureVerified=false` 与所有 DENY/BLOCKED/授权字段保持原样。**真实可执行候选仍未冻结，C1 不能关闭。**

以下 Git blob 只是基线审计定位，不是未来正式候选的 SHA256 pin：

| 源码 | 基线 Git blob | 本轮结论 |
| --- | --- | --- |
| `normal_runtime_launch.py` | `b9f42f3a5e3c53ecc119d944697d78ea70c9ad29` | 只生成调用方 bytes 的启动提议；更正默认全量闭包注释 |
| `normal_runtime_update.py` | `02e5158a8c6f613858fc6d07d829573ecba8b744` | 纯核心 + Protocol；更正 closure/both archives 接口注释 |
| `prepare_runtime_update.py` | `43a1668d63eb1e244339cf90bccec139665405a1` | 实际独立验源/非活跃准备函数存在，尚未接正常流程 |
| `offline_root_private_installer.py` | `89cb36766509e42f6071db9671cd2bdf0b08e446` | 仅 `/tmp/sanq-u2d2a-lab-*` fixture，不得删除 lab guard 当正式安装器 |
| `tests/test_normal_runtime_update.py` | `040a341397ec6e4ee8d29c6da6467f045131f628` | 18 个合成测试方法；没有真实 adapter 接线 |

## 2. 四种身份分别绑定

“同一候选”指下列组合固定，不要求所有对象使用同一个 Git SHA：

| 身份 | 最小绑定 | 不能替代它的材料 |
| --- | --- | --- |
| 正常操作器 | 操作器 commit；bootstrap/core/入选 adapter 逐文件 SHA256/大小；受保护路径、权限、argv/env/cwd | 目标 Runtime source SHA、测试临时 bootstrap |
| 目标发布物 | 准确 main SHA、原 Archive digest/bytes、17+Manifest、同 publish run proof 与配对镜像 digest | 操作器 commit、重新压缩的包、latest 标签、Manifest 自报摘要 |
| 当前安装 | 已安装 source/Manifest/inventory、可信历史发布摘要或保留来源记录、应用 current/previous 和受保护动态状态 | 目标版本、应用镜像 SHA 或单独 healthy |
| 外置执行环境 | 实际 Ubuntu/架构、解释器/关键库来源、Guard/Unit/锚点、实际入选 CAS/TLS 客户端和服务的版本/身份 | Noble 七包对 Jammy 的外推、synthetic peer 或单机 SQLite 成功 |

旧 launch 的 Python 3.12.3 与 `/usr/bin/python3.12` 仍是旧候选声明；R2 Jammy Python 3.10.12 的能力回执不自动决定正式平台。先选定实际执行位置和支持平台，再处理确实受影响的声明/实现/测试；代码仍写 3.12.3 时不得宣称已认证 3.10 候选。

## 3. 双 Archive：保留摘要身份，不默认取回旧原字节

`UpdateRequest.document()` 只要求 `current_archive_digest` / `target_archive_digest` 均为 `sha256:<64hex>` 且不同；核心不下载、读取或验证 Archive。旧 both archives / closure 义务在 `UpdateCapabilities` 说明中，没有实际 adapter 已落实它。因此本批先校正注释，保持 v1 字段/校验行为，不立即制造新协议或兼容层。

| 对象 | 正常候选需要 | 缺失时 |
| --- | --- | --- |
| 目标 Archive | 原始压缩 bytes、准确独立发布 proof、digest、17+Manifest 完整性 | 任何准备输出或活跃写入前拒绝 |
| 当前 Archive digest | 与当前安装 source 相符、经可信历史 seal/proof/保留来源记录核实的摘要身份；不默认要求旧 Archive 原 bytes 仍可取回 | v1 必填摘要无可信依据仍拒绝；补准确元数据或另审安装基线合同，不填零值/目标摘要/猜测值 |
| 实际恢复保障 | AWS 快照、维护冻结、离机清单和真实恢复验收 | 按 R2/R3/R4 拒绝；旧 Archive 存在不能替代这些保障 |

**Manifest SHA、文件清单 SHA 与原 tar.gz digest 是不同对象。** 不得重打包现装文件后冒充原 Archive digest，也不假定 Manifest 自带压缩包摘要。本批没有实现或放宽历史 verifier；旧 Archive 若另有用途，仍按原规则验源。

## 4. 正式入口的最小顺序

受控 Ubuntu/内核/root 管理仍是 R0 的有限信任前提。bootstrap 运行后自报不能建立启动前信任；外部受控入口/操作员须事先固定其准确版本、解释器、受保护暂存位置及来源依据。建议后续按以下顺序实现并审阅，本批没有新增 loader 或运行入口：

1. **启动前核验。** 使用受信 GitHub/官方发行来源或适用的内部技术验收记录固定源码、关键平台和输入；操作器在 17 Bundle 外单列，不新增第 18 成员或长期 Root Launcher。
2. **保护实际对象。** 核对真实平台/解释器、root-private 源和输入路径/祖先权限、允许集合、逐文件 bytes/大小与来源；未知 alias/替换风险先拒绝，不能只相信同一输入自己给出的 expected SHA。
3. **固定实际使用材料。** 后续加载/使用的对象须与已核对对象一致；风险相关文件应稳定持有或有等效保护，不能只在退出后重开路径 hash。稳定系统关键依赖复用可信来源和保护条件，不默认完整 Python/ELF 消费闭包。
4. **装配同一核心。** 入选模块加载和能力构造不得产生维护/云/安装副作用；能力齐全、范围/身份一致后调用原 `NormalUpdateFlow.run`，不保留认证用假 adapter 与实际用真 adapter 两条路径。
5. **真实准入。** 首个 `admit_and_verify_source` 验证来源/平台、当前安装、目标发布和事务未消费等条件；每个效果 adapter 独立持有并核验自己的权限/对象。源码合法、typed completion 合法或回执相关联都不授予执行权。

旧 `-I -S -B` 不能被称作全部 import 已认证的证明。只有实际入选来源/加载/路径风险需要时，才对受影响对象增加专项观察，并遵守该路线的安全和精确执行授权。

## 5. 11 个正常步骤及 abort 的装配责任

这是实际缺口地图，不是已存在的 live adapter 清单；源码准备可与 R2/R3/R4 并行，实际效果仍服从各自门禁。

| 阶段 / 方法 | 可评估复用的规则或实现 | 尚缺 / owner |
| --- | --- | --- |
| VERIFY_SOURCE / `admit_and_verify_source` | 发布/安装合同；核心仅核对 completion 关联 | 真实来源/平台/输入、当前安装和跨进程一次性事务准入；C1/Runtime |
| PREPARE_PRIVATE / `prepare_private` | `prepare_authenticated_archive` 独立验源与新 inert tree | 正式受保护目的位置、来源及使用对象绑定；pathname/parent 检查不能直接当完整 FD-safe 正式入口 |
| RECORD_ORIGINAL / `record_original_state` | R2 原策略/registry 离线合同 | 真实清单读回、持久化与离机身份；R2 |
| FREEZE_MAINTENANCE / `freeze_maintenance` | Fence/Guard/Unit manifest 离线规则 | 持续禁入、新写者、ARMING、跨重启；R2 |
| SNAPSHOT_READY / `create_and_verify_snapshot` | AWS 设计；核心仅有 Protocol | 准确账户/Region/实例/盘/txid、创建/available/未知状态和离机记录；R3 |
| RECHECK_FROZEN / `recheck_frozen` | R2 连续观察模型 | 对应本次身份/epoch 的实际持续屏障；R2 |
| HANDOFF / `handoff` | lab installer 的交接不变量 | 正式 root-private/FD-safe/持久化和外部安装副本；R4，不删除 lab guard 冒充实现 |
| VERIFY_INSTALLED / `verify_installed` | 17+Manifest、安装状态与 readiness 的有界规则 | 同候选动态状态/外部副本/应用存储相容的独立复验；R4，仍维护 |
| RESTORE_POLICIES / `restore_original_policies` | R2 原策略记录 | 仅成功后精确恢复，未知即停；R2/R4 |
| VERIFY_RESTORED / `verify_restored` | 原状态/保留类合同 | 真实策略/任务和保留对象复核；R2/R4 |
| RELEASE_BUSINESS / `release_business` | 核心最后一步的顺序 | 全部前置后独立业务放行；R2/R4/R5 |
| 失败旁路 / `record_abort` | 先记录 attempted，再保存 abort 的规则 | 真实证据持久化/离机保管；不得 restore、cleanup、重试业务或 replay journal |

`NormalUpdateFlow` 的 Lock 只约束一个进程中的 driver；不证明跨进程/重启锁。`StepCompletion` 与报告中的 REPORTED_COMPLETE 仍是相关联声明；永久 BLOCKED/授权 false 不应改成真实效果的许可证。

## 6. 下一源码切片与聚焦验证

先围绕选定平台和实际入选源码/关键输入落实有用的准入与保护，再接同一核心；不为全量闭包制造长期平行模型。bootstrap/effect adapters 未存在时，不制造占位 PASS 执行器，也不以扩大旧 SYN 实验替代准确开放项。

| 场景 | 必须核对的结果 |
| --- | --- |
| 正常最小基线 | 来源/位置/权限成立，只形成有界来源结论，不授权维护/安装 |
| 错 bootstrap/core/adapter、缺项/未知源码 | 加载受影响代码前拒绝，import 成功不当来源证明 |
| 错解释器/平台 | 外部启动前拦截；bootstrap 内复检不冒充已阻止解释器自身启动 |
| 可写祖先/未审 alias/替换/输入变化 | 未保护对象不得用于后续加载或效果；定向解决风险 |
| 错目标 Archive/proof/重打包 | 准备输出/活跃写入前拒绝，不伪造 publish/seal |
| 旧原 Archive 不可取回，但可信旧摘要存在 | 不默认下载/重建旧 bytes；当前安装与摘要绑定仍成立 |
| 可信旧摘要缺失 | 现 v1 拒绝，不生成猜测值；另审适用合同 |
| 缺能力、错对象/版本/事务 | 效果前拒绝，保留原核心全量装配检查 |
| 超时/中断/未知/重复事务 | 保留尝试和未知结果，停止后续；不自动恢复/续 journal，实际 ledger/Guard 证明跨进程保障 |

现有 18 个核心测试不为注释改动重写。后续实际实现须有聚焦正反例和 `.github/workflows/ci.yml` 的 Runtime/Release CI；主机/Guest/root/AWS 实测须准确授权，不在本地缓存绕过 MCP 仓库测试执行规则。

## 7. 验证与交付状态

本批为两处源码 docstring 与五份文档同步，按内部原子、行为不变的注释/文档切片处理；没有可执行逻辑、字段/函数、导入、持久化/公共合同、权限、17 Bundle、依赖/锁、CI、Prisma/migration 或生产变更。12-context owner、依赖边/债务、SCC/scanner baseline、兼容和部署单元不变。

本地仅做文件摘要、差异/空白、去除 docstring 后 AST 静态对照；未执行 Runtime 模块、项目 lint/build/test 或 Guest/VM/生产命令；没有新增镜像注释的测试。最高状态为 **SOURCE COMMENTS ALIGNED_LOCAL / ASSEMBLY DESIGN COMPLETE_LOCAL / REAL BOOTSTRAP NOT IMPLEMENTED**，源码已通过实际 CI #7517；正式候选和 C1 保持 OPEN。

**同批远端验证：**[PR #2933](https://github.com/sanqin888/sanqinMVP/pull/2933) → dev；完整源码 head `1a7809e0632c54f023aac4c11548c7845db64885` 的 [CI #7517](https://github.com/sanqin888/sanqinMVP/actions/runs/40137267379) SUCCESS，Runtime `649 tests / OK`、Release `45 tests / OK`、Runtime shell 语法检查通过，无需 CI 修复。当前仅补同批验证记录，最终 head 仍须实际 CI 全绿，最终 Checks/merge 事件以 PR 为准。
