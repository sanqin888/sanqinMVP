# Runtime更新 — C1同候选隔离负例缺口审计

**2026-10-25（America/Toronto）｜AUDIT_COMPLETE_LOCAL / LAB_NOT_RUN / C1_OPEN。**

用户授权PR #2950合并后开始下一步。本批基于 `dev@3b0d6cf5f8986a2cc9504937bf32a7546b76d9af`，只审计现有覆盖与下一批最小隔离验收范围，不修改候选源码、平台、guard或生产材料，不新增执行许可。前批完整7文件最终head `205d55d5d98e249cad8efe47976940a3bc489997`，[CI #7575](https://github.com/sanqin888/sanqinMVP/actions/runs/40200523700) SUCCESS：ci-change-scope通过，9个重lane按docs-only正常跳过；补齐的新证据文件在同PR由GitHub contents API交付并按最终head回读一致。MCP暂存接口对该新增文件未生效，不用临时命令绕过工具限制。详见 [PR #2950](https://github.com/sanqin888/sanqinMVP/pull/2950)。

## 1. 固定复用的候选与已取得结果

- 候选九源码：`711197d2f31d1d6198d37f662e072e647f541efb`；后续文档提交不改变这9个源码字节。真实平台CPython3.12.15 final / Ubuntu22.04 Jammy / x86_64，解释器 `/opt/sanq/python/3.12.15/bin/python3.12`。
- sourceRoot=/root/sanq-runtime-operator/normal-update-v1；approvals=/root/sanq-runtime-operator/normal-update-approvals/c1-assembly-20261025-001，仍仅9源码/3输入；root目录0700、源码/输入0400。
- launch SHA256 `1bcfe5482876c79239c9137750cd4b744c82c8604e46b293418c7b0bcae6b395`；request SHA256 `54ee69fd11f188a0ff17b636c77c4213a2cf9bea83a3fa8b361a4de2db954cc6`；pins SHA256 `850a3b5745312540eec7b58b6552518c80522ba943049af5ef8e92de684b542f`。
- GitHub构建run40192632845：工具18测试、实际构建产物C1回归203测试成功。AWS已完成解释器8368成员/关键7动态库/真实prefix smoke、九源/三批准交付和唯一正例；完整回执见 [安装与只读验收记录](evidence/c1-prep12-install-bootstrap-acceptance-2026-10-25.md)。
- 该正例是CANDIDATE_ASSEMBLED / ASSEMBLY_ONLY / flowInvoked=false / false权限 / BLOCKED / RC0。不重复生产安装或正例，不把旧3.12.3/Noble实验当本候选同平台负例。
- 生产保留状态观察仅为当时root元数据和操作者回执；使用root-owned文件与匹配摘要不独自证明所有来源或持续维护。注册表发布身份、原归档与ZIP/源码/Python包身份继续分开。

## 2. 现有203测试能复用什么

逐项静态读取准确提交的8份test_normal_runtime_*.py，计数与构建日志203一致。没有在MCP/scratch重跑项目测试。

| 测试文件（ops/runtime/tests/） | 方法数 | 可复用的限定覆盖 |
| --- | ---: | --- |
| test_normal_runtime_update.py | 18 | launch数据冻结、请求守卫、能力缺失/阶段失败/中断/不重试、单用与并发；效果均由inert能力供给 |
| test_normal_runtime_inputs.py | 30 | 独立双摘要、重复键/非规范/旧版本及混合绑定拒绝 |
| test_normal_runtime_source_snapshot.py | 27 | 有界FD读、成员/字节、短读/漂移/清理；不认证外层解释器 |
| test_normal_runtime_source_anchor.py | 25 | 祖先/叶权限、链接/替换、FD持有及退出复核；有虚拟根/owner桥接 |
| test_normal_runtime_source_loader.py | 30 | 先核对/预编译再加载、私有模块身份/导入边界与失败清理 |
| test_normal_runtime_candidate_scope.py | 23 | 组合顺序、发布前FD关闭/清理、进程/源码拒绝；进程有明确fixture |
| test_normal_runtime_process_check.py | 18 | 版本/路径/real-effective身份、argv/env/cwd/flags及不修复 |
| test_normal_runtime_bootstrap.py | 32 | CLI、批准三文件及九源的完整集合、篡改、目录/链接/owner/设备/大小、退出清理和无Flow |

bootstrap测试setUp明确patch _observe_process、_open_namespace_root、_owners，内部process/anchor还使用fixture桥接；“real fixed-byte assembly”指使用真实组件/字节和FD，不等于实际root路径及未patch进程条件。不能把这些成功计为真实Jammy负例已完成。源码CI已覆盖的细粒度组合、模拟异常、私有namespace/FD失败规则直接复用，不另造全量重复矩阵。

## 3. 核心缺口及最小新增验收范围

缺口是**受信外层预启动拒绝与未patch的真实CLI/路径拒绝**，不是缺少另一套流程模型。以下是下一批验收家族，不是已执行case数；实现时按独立触发点拆case并固定每一项预期。负例只允许在无生产挂载、无生产Docker socket/业务凭据的可丢弃Jammy/x86_64环境。

| 家族 | 只改变的条件 | 拒绝位置/证据要求 |
| --- | --- | --- |
| 基线 | 准确九源/3输入/同解释器与真实root路径 | 在隔离环境重建一次CLI正例，证明本lab配置可用；不是重复AWS正例 |
| 外层启动信任 | 错bootstrap字节、错解释器对象/路径或未绑定材料 | 外层受信核验失败，候选启动次数为0；不能先运行错代码再把其报错算拒绝 |
| 实际进程 | 额外env、错cwd、偏离flags/argv | 只运行已认证bootstrap，真实观察拒绝，RC2/受控stderr，无成功stdout；不patch观察器 |
| 批准输入 | pins/launch/request字节不匹配、事务绑定错配 | 在项目支持模块装配前拒绝，保持独立外部pin，不从被改文件重算批准 |
| 支持源码 | 一个支持模块字节变化而launch固定 | 支持模块初始化前拒绝；篡改bootstrap本体属于外层，不能混算 |
| 目录成员 | 源码或批准目录缺项/额外文件 | 真实根路径中拒绝完整集合不符，不把审阅metadata塞入源码或批准目录 |
| 真实权限 | 可写祖先/非私有输入或源码叶；错误owner | 对lab副本修改，拒绝且无自动修复；非root打不开/root脚本属于OS拒绝，不能误报为进程检查通过 |
| 链接/对象类型 | symlink叶/祖先、hardlink叶、非regular对象 | 拒绝且有界返回；FIFO等必须设timeout及进程组清理，不允许测试挂死 |

正常CLI负例应同时检查非零退出、受控BLOCKED、无成功stdout，全部执行权限false、flow未调用和fixture变更范围；外层拒绝单独记录phase=PREEXEC和未启动，不伪造bootstrap报告/RC。所有stdout/stderr/exit码、源码/平台/输入摘要、case变更与执行后路径清单原件归档。

## 4. 隔离环境与实现方案

推荐一次性GitHub托管ubuntu-22.04作为最小落点，执行器可sudo但只允许写该runner自己的/root与/opt测试prefix；通过固定run/artifact/ZIP与内部原tar摘要复用已验真解释器材料，不重新编译或改源码。单独验收harness/工作流不进入9文件候选，也不扩张固定17 Bundle；必要的Actions只读权限应在实现中精确限定。

- checkout/下载固定候选提交和输入原件，按外部固定摘要验证；复制生产观察记录只作为输入重放材料，不能声称lab有相同业务容器/挂载或生产状态。
- 未patch运行准确CLI，保持源码SHA、版本、绝对路径、flags及源/输入规范字节；生产同名路径只在一次性runner重建。不得为方便测例给正式bootstrap新增alternate-root、execute或绕过owner开关。
- 每case独立重建lab fixture，只有该case有意变化处不同；基线坏了即停止，不把全失败当安全成功。外层与bootstrap各自使用可核对断言。
- 清理只针对本run创建的准确lab目录、子进程和临时材料，失败保留可上传日志；不得把生产维护/恢复逻辑用于lab清理。无Flow适配器、AWS凭据、业务调用或目标Runtime安装。
- 不为本轮强制cgroup/quota、全动态依赖闭包、全量跨重启/竞态矩阵或重跑S5；源码中已覆盖且仍匹配的FD/race/中断证据复用。若出现具体新风险，再限定新增实验。
- 实施后必须通过PR常规CI，再手动运行该隔离工作流；当前未编写harness/工作流，也未执行任何lab负例。此次审计不声称托管runner可用性或用例成功。

## 5. 完成条件及与后续工作的关系

本负例切片完成需：准确候选复用、外层拒绝与真实CLI/根路径的必要负例实际通过、原始结果完整、失败无权限扩大及无生产效果，再做限定技术裁定。若固定候选源码本身需修改，必须新固源码/输入/受影响测试，不能继续冒用711197d2和本次launch/request摘要。

R2持续维护/Guard/CAS、R3真实AWS快照、R4安装/复验/策略恢复与最后放行仍是另一个完整效果候选，未因本审计或只读正例完成。源码准备可并行，不要求等C1先关闭；最终C1跟随实际选定的组合候选裁定。下一批建议先实现上述**隔离负例harness与手动工作流**，不让用户在生产改权限或篡改源码。

本批最高状态AUDIT_COMPLETE_LOCAL / LAB_NOT_RUN；仅文档及依赖图“无变化”登记，无代码/依赖/迁移或生产操作。本批尚未提交远端。
