# Runtime 更新 — C1-PREP-10 候选源码固定与只读验收准备

**2026-10-25 现场验收续记：PYTHON_INSTALLED_VERIFIED_SCOPED / READ_ONLY_BOOTSTRAP_PASS_SCOPED / C1_OPEN。** CPython3.12.15已在sanq-web准确prefix完成smoke及8368成员字节/权限验收；准确源码711197d2的九文件与三批准输入已root交付，事务c1-assembly-20261025-001得到CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY / flowInvoked=false / 全部权限false / BLOCKED / RC0。GitHub构建run40192632845工具18/产物回归203通过；现场证据为操作者粘贴回执，非签名采集或助手独立执行。无目标Runtime安装、Flow、停服/AWS/数据库效果。详见 [安装与只读验收记录](evidence/c1-prep12-install-bootstrap-acceptance-2026-10-25.md)。下方LOCAL/NOT_RUN属于原实施时点，当前最高状态以本续记为准；仍缺同候选完整负例、R2/R3/R4效果组合及C1最终裁定。

**PR #2946远端验证续记：**19文件已完整提交，源码head `802a0ae8` 的 [CI #7562](https://github.com/sanqin888/sanqinMVP/actions/runs/40166026342) 已通过Runtime848、Release45及精确3.12.15回归203项。E2E因ECR Public镜像拉取Data limit exceeded在测试前阻断，CI服务镜像已最小改回Docker Official上游同标签，最终head仍须全绿再合并；最终Checks/merge以 [PR事件](https://github.com/sanqin888/sanqinMVP/pull/2946) 为准。下一任务为 [PREP-12可信构建与交付](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)，本批未启动，解释器来源/安装及C1继续OPEN。下方LOCAL/CI_NOT_RUN按实施审阅时点保留。

**PREP-11实施续记（2026-10-25，本地待审）：**按用户授权，launch/bootstrap已固定CPython3.12.15 final及 `/opt/sanq/python/3.12.15/bin/python3.12`，6个测试文件同步并新增2个旧批准材料/混合绑定负例；新增确切版本CI回归步骤但尚未执行。[新九源审阅快照](evidence/c1-prep11-python31215-source-review-2026-10-25.md) 与 [审计/实施记录](Runtime更新-C1-PREP-11-Python31215变更审计.md) 已更新。旧PREP-10归档仍保持b7b7身份；新包为未提交工作树审阅材料，最终sourceCommit/CI及真实批准输入尚未固定。解释器产物来源/安装和Jammy同候选验收仍OPEN，无主机安装或真实效果。

> **最终交付与下一动作：**[PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) 最终head `35e2150f3d13db0746b31f67a91df2d9b29050a2` / [CI #7558](https://github.com/sanqin888/sanqinMVP/actions/runs/40151007839) SUCCESS，已合并 `17188367684a155b7217881d695c8c615589e940`。本批Markdown文档/材料记录已交付，Runtime等重lane按原规则跳过，包内原JSON/九源字节/归档摘要不变；首次缺两个新增文件已在同PR补齐，#7556的ECR拉取失败及展示格式修复见本包原续记。P10-B已由 [PREP-11](Runtime更新-C1-PREP-11实际平台身份与包元数据只读回执.md) 收到两份操作者回执并形成平台方案，用户已选择3.12.15并完成变更审计，等待具体来源/路径方案及源码适配；目标Python及root交付/效果仍未执行。下方首审LOCAL/未推送为历史时点；C1仍OPEN。

**2026-10-24（America/Toronto）｜NINE SOURCE FILES PINNED / SOURCE REVIEW PACKAGE PREPARED_LOCAL / PLATFORM AND DELIVERY NOT_RUN / C1 OPEN。**

本批接续用户“提交远端，合并后开始下一步”的授权，先将 PREP-09 已交付的只读候选落到准确源码和可核验物料，再准备同平台取证/交付/只读验收。此处冻结的是**九文件只读候选切片**；未来加入 R2/R3/R4 效果能力的完整正式候选仍未冻结。

## 1. 已完成的上批交付与本批范围

[PR #2943](https://github.com/sanqin888/sanqinMVP/pull/2943) 已 squash 合并 `dev@b7b7f27682700447d37bcdabd456f22087a54892`。最终 head `3efa09f8763dbe870073a2a78847c0a19ac53466` 的 [CI #7553](https://github.com/sanqin888/sanqinMVP/actions/runs/40149478415) SUCCESS：Runtime **846 项**（含 PREP-09 新增32）、Release **45 项**；无需 CI 修复。源码 CI #7552 的实际结果已记入原包。

本批在 `docs/runtime-c1-prep10-source-delivery-20261024` 基于该 dev 创建。AGENTS/CI 的 Git blob 与上批已读规则一致，无更深层 AGENTS；继续遵守 R0 D1/§4.1、Runtime 交付约束、G2 A–F 及现有 owner/guard。只新增候选来源记录和验收准备文档，不修改任何 Python、入口行为、权限、17 Bundle、依赖/锁、CI、数据库或业务合同。

## 2. 九文件源码身份

从 GitHub 插件按准确合并 SHA 取回源码；九个 Git blob 均与最终 CI head 的树一致。再按 Git blob 格式独立重算 SHA1，并对原始 bytes 计算 SHA256/大小。原JSON的Markdown视图见 [候选源码清单](evidence/c1-prep10-source-inventory-2026-10-24.md)，总计 **9 文件 / 78,274 bytes**。

| 源文件（均位于 `ops/runtime/`） | bytes | SHA256 |
| --- | ---: | --- |
| normal_runtime_bootstrap.py | 17426 | `2f0e16223ca1bd00a38239a4bb4a8a0d4fddbd9c4c8ec1ed3388fb4fe4163caa` |
| normal_runtime_candidate_scope.py | 2638 | `bc7d269e6e1aaccba66e0ed8fbf31068b282c538aa92e18ad3af40e3d992524a` |
| normal_runtime_inputs.py | 5383 | `423a20bf2dae9d1f8584002a59e0c30febd29eca008746e783c6b0535403d88c` |
| normal_runtime_launch.py | 6233 | `0f60df73e6e9ecd029f4d718cd922607dfff22dbed69e0c4ac0d04027a8ec4d2` |
| normal_runtime_process_check.py | 4149 | `2310bbc1c9e21e7b2bf30f5842d0ba3e553b1aaf91ffc7437a5604407e6031cc` |
| normal_runtime_source_anchor.py | 8847 | `48f9736d8bdac9ca030a162492ff1eb742245319f96a66b6b161b684cb6ebcac` |
| normal_runtime_source_loader.py | 8861 | `93a53fedaba61105a07d623ff61e92179cab1cac819ea4ab583058569b4a1ecd` |
| normal_runtime_source_snapshot.py | 10273 | `ee2e6d91a44635f78420cef6881f73126895eb3bf45315647e3573ccbd840fb4` |
| normal_runtime_update.py | 14464 | `29756e44c05e0d1a8ca976d75eae9932375d3f23798ed6c7c3ce99478848dacd` |

这是已审阅 GitHub 源码与 CI 对象的一致性记录。目标主机的解释器、stdlib/native 后端、初始 bootstrap 已执行字节、安装位置和批准 pins 的来源仍须独立建立；本表不证明它们已被交付或使用。

## 3. 已制备的源码审阅包

| 对象 | 准确身份 |
| --- | --- |
| 文件 | `SanQ-C1-PREP-10-source-b7b7f2768270.tar.gz` |
| 归档原字节 | **22,978 bytes** |
| 归档 SHA256 | `40d8d2d8fc7da7be7d15b06aff12c8ad413674e48853103c13476005a60b658c` |
| source-inventory.json | **3,819 bytes**；SHA256 `90567502fd560cec7c3efc3560200e615ed36971aad6315866fd59423c0a4f65` |
| 内容 | `sanq-c1-candidate-source/sources/` 下准确9源文件，外加 source-inventory.json、SHA256SUMS、README.zh-CN.md，共12个 regular成员；无链接/设备/可执行安装脚本 |
| 封装 | USTAR，固定排序、uid/gid 0、目录0700/文件0400、mtime 0；gzip filename空、mtime 0；同封装环境重建得到相同原字节 |

已重新打开归档，核对准确成员集合及全部12个文件的原 bytes，并复核9源码与上述清单一致。**没有执行或导入包中的任何源码**。归档摘要从本工作包等可信记录独立取得；包内 SHA256SUMS 仅用于内容核对，不自行建立来源权威。

源码目录与审阅元数据分开，按 PREP-09 的 source-only 合同保留 JSON/说明在外层。归档中没有 `launch.json`、`request.json` 或 `pins.json`；实际当前/目标 Runtime、可信旧原 Archive 摘要、目标发布证明、应用 SHA、preserved-state 和事务均尚未选定，不能为制作可运行输入而填造值。

该归档用于**外置操作器源码**。目标 Runtime 的原 Archive、17+Manifest、publish proof 和配对镜像仍在 I05 单独绑定；`targetArchiveDigest/currentArchiveDigest` 不得使用本源码包、Manifest 或重打包结果代填。交付到真实 root 路径之前，还须准确对象授权、来源核验及受控 create-only/回读流程。

## 4. 后续同平台取证与交付顺序（准备完成，现场未执行）

| 阶段 | 要完成的具体工作 | 当前状态 |
| --- | --- | --- |
| P10-A 源码物料 | 固定合并 SHA、最终 CI head、九文件 Git blob/SHA256/大小与归档原字节 | **COMPLETE_LOCAL / 9_OF_9 MATCH** |
| P10-B 实际平台 | 绑定操作者确认的准确 AWS 正常执行主机；只读确认 Ubuntu/架构/主机标识、Python 包 revision/成员归属/真实路径及关键对象字节和保护条件 | **METADATA RECEIVED / PYTHON3.12.15 PROFILE_LOCAL / PROVENANCE OPEN**；代码已配置，实际产物来源/保护及同平台验证未完成 |
| P10-C 启动前可信交付 | 用准确源码清单、匹配的平台来源证据和受信外部工具核对；经单独批准，在无覆盖的受控位置交付9源码，核对root:root/0700目录、0400或0600单链接文件、祖先及读回原字节 | **NOT_AUTHORIZED / NOT_RUN**；无 root 目录或文件已创建 |
| P10-D 输入批准 | 从已核实真实版本/状态构造同一事务的规范 launch/request，固定独立双摘要；经批准交付准确三文件，保持源码目录只含9份源码 | **INPUTS_NOT_SELECTED / APPROVAL_NOT_CREATED** |
| P10-E 只读入口 | 启动前信任成立后，在明确批准的同平台环境以原v1固定argv/env/cwd运行只读 bootstrap，核对退出码/完整报告/无效果；实际负例安排在经批准的可丢弃同平台环境 | **NOT_AUTHORIZED / NOT_RUN** |
| P10-F 完整候选 | 接入已完成验收的 R2/R3/R4 真实能力，再按受影响源码/输入重固版本和同候选验证 | **OPEN**，不拿本九文件切片替代完整候选 |

### P10-B 的最小只读范围

先核对平台和包/成员资料，**不先运行待认证的目标 Python**。以下为后续绑定准确目标后使用的最小查询范围，本批尚未执行：

- 主机绑定与基础事实：操作者确认准确目标；读取 `/etc/os-release`、`uname` 的系统/架构，必要时记录本次主机标识。主机/路径不符即停止，不通过改环境、安装软件或切换别名修复。
- 包身份：以 `dpkg-query` 读取 `python3.12-minimal`、`libpython3.12-minimal`、`libpython3.12-stdlib` 的实际完整 Version/Architecture/Status，并查询 `/usr/bin/python3.12` 的真实包归属。缺包、自编译或来源不明如实保留，不能按3.12.3前缀猜 revision。
- 文件对象：只读检查解释器实际文件/可能别名、owner/mode、大小/字节摘要及祖先保护；与准确发行/架构/revision的 Ubuntu 签名索引、deb/成员字节对照。已有 R1-A/S5 准确匹配对象直接复用，只补关键差异。
- 关键依赖：以该候选明确预载的 stdlib 集合及安全相关 native 后端为起点，区分内建/冻结模块和磁盘成员，核对实际入选对象的来源/位置。未知导入、别名或动态路径风险按 R0 §4.1 定向处理；不默认重新穷举系统库每次消费。
- 仅在启动前来源/完整性及现场执行对象获准后，再使用目标解释器做有界进程/模块观察及 P10-E。包数据库、版本字符串、事后自报和文件摘要各自保留证据等级，不能彼此替代。

旧 B02-B3 `deliver_fixed_source()` 只支持独立 `v1/operator.py`；它没有九文件 sourceRoot/三文件审批目录的交付合同。不得更改其固定名/guard 或把一次单文件回读当作本候选全部交付完成。受控交付实现/具体root命令须随准确对象评审，本批仅固定物料和验收步骤。

## 5. 首次只读实测的有限收口条件（原3.12.3方案；实际3.12.15续记见页首）

正例必须使用已记录的同一九源字节、准确 Python3.12.3 平台和受信批准输入，按 v1 的 `/usr/bin/python3.12 -I -S -B`、root IDs、固定五键环境/argv/cwd运行。预期仅为 `CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY / flowInvoked=false / decision=BLOCKED`，并核对来源记录、原始stdout/stderr/rc和未产生维护/AWS/安装效果。

负例覆盖错版本/解释器/flags、错或额外输入/源码、双 pins/事务错配、可写祖先/链接/替换和不可读/缺项；应在隔离的同平台材料上执行，保留同源码候选身份及准确变化范围，不改生产文件制造负例。错误解释器/源码须在其作为候选代码执行前被外层核验拒绝，不能用 bootstrap 事后报错冒充启动前拒绝。

此处的只读实测成功最高只形成 **READ_ONLY_BOOTSTRAP_PASS_SCOPED**。完整效果装配、持续维护、AWS恢复点、安装/复验及 C1 最终裁定仍按原门禁；更换实际源码/平台/依赖/输入时重验受影响部分，不重复无关稳定证据。

## 6. 本批验证与交付

**最高状态：SOURCE PACKAGE PREPARED_LOCAL / PLATFORM AND DELIVERY NOT_RUN / FIRST-REVIEW PENDING / C1 OPEN。** 本批没有新增运行逻辑、schema/持久化/公共合同、依赖/锁、CI或迁移，未运行仓库测试、bootstrap、目标Python、root/Guest/Host/AWS/生产操作。本地只进行了 Git blob/SHA256/大小比对、源码集合静态核对、归档重建/成员原字节回读及文档/JSON/差异/空白检查；这些是材料检查，不能称为新增Runtime测试通过。

同批同步 R0、C1 总包、入口装配方案、依赖图、原 PREP-09 最终交付事实和工作日志。本批尚未提交远端；按首次交付流程停在本地供用户审阅，之后才进入 PR→dev 与实际 CI 门禁。现场 root 交付/运行及生产操作仍按原有准确对象门禁处理。

**同批 CI 修复（#7556）：**完整8文件 head `69082af5` 的 Browser E2E 在 Initialize containers 阶段拉取 `public.ecr.aws/docker/library/postgres:15-alpine` 失败，注册表返回 `Data limit exceeded`，未进入测试。原独立 JSON 记录按现有 `change_scope.py` 的未知路径规则触发全量 lane；该记录无程序消费者，现将仓库展示改为 Markdown，保留包内原 JSON、原 SHA256 和来源材料。未改 CI/selector/测试或执行逻辑。完整文件已补齐到同一 [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944)，最终 head 仍须全部必需检查全绿；本地未运行项目测试，C1 仍 OPEN。

**同批修复后验证：**完整 Markdown 文档 head `712e99468a2f0f99eaad1fc2f7c31874ff38e577` 的 [CI #7557](https://github.com/sanqin888/sanqinMVP/actions/runs/40150848390) SUCCESS，`ci-change-scope` 实际通过，Runtime/Release/Browser等重lane按原选择器正常跳过；不作为本批新增运行测试通过。包内原 JSON及归档摘要不变，CI/selector未修改。用户已授权本批最终head必需检查全绿后合并dev并开始下一步；此前LOCAL/未推送为首次审阅状态，最终Checks/merge以 [PR #2944](https://github.com/sanqin888/sanqinMVP/pull/2944) 为准，C1仍OPEN。
