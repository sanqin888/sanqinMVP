# Runtime 最小更新执行器与暂停恢复计划

**2026-10-27 当前进度：SQL_REVIEW_BINDING_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原plan/collector补准确待执行SQL审阅与批准范围绑定，不新增helper、批准数据库或版本权威。plan.sql_review给出planId/目标/API digest/有序原始SQL元数据及域分离approvalSha256；assert_sql_approval只核独立传入的准确摘要，缺失/布尔/planId/错摘要拒绝，无pending只接受None。原prepare/show摘要新增sqlReview，show-sql按计划gitBlobSha读取固定SanQ GitHub blob，核size/base64/原字节SHA-256和Git blob SHA-1后展示UTF-8原文与准确commit来源；所有SQL核完且完整JSON不超过4MiB才输出。canExecute/sqlSafetyAssessed始终false，摘要不是授权凭证/安全判定，不写批准文件或执行SQL。 无迁移任务贯通已由[PR #2992](https://github.com/sanqin888/sanqinMVP/pull/2992) 最终head `1f9b424056db494930edfa73f7ed950ba70b4607` 经 [CI #7667](https://github.com/sanqin888/sanqinMVP/actions/runs/40501959449) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各284、Runtime1080、准确CPython3.12.15回归412），合并dev `73a8a162325e1dfcba10515541a00837ed8a9937`。首次CI #7666中SQL拒绝测试重复保存原fixture计划而报错，仅把该测试createdAt改成独立时间戳，同分支追加 `1f9b4240` 修复；生产逻辑/门禁未改。原本地未运行/未提交为审阅时点，不代表隔离或生产已通过。

**2026-10-27 当前进度：NO_SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原release_task已接入同一无迁移计划的freeze→create/register→start/readiness→finalize；同一job锁/计划资源锁/维护目录FD贯穿阶段交接，四阶段主体提取为原入口与任务共同使用的内部函数，AST对照确认主体逻辑不变，不复制第二套发布器。执行/排队前拒绝pending SQL和目标等于当前版本；CLI提交确认改为--confirm-release，原--confirm-maintenance不再接受，unit前缀改为sanq-release-apply-，无已安装消费者。仅最终原finalize清标记已知完成返回ACTIVE；保留未知/事故语义。 连续更新修正已由[PR #2991](https://github.com/sanqin888/sanqinMVP/pull/2991) 最终head `f37426a7088be8ff7e189d0995617be5281012ce` 经 [CI #7664](https://github.com/sanqin888/sanqinMVP/actions/runs/40498211632) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各271、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `15fcbdcf1af0adbd32f48875e76073a918c89523`。此前本地未运行/未推送为原审阅时点；仍未安装/隔离验收。

**2026-10-27 当前进度：CONSECUTIVE_UPDATE_FIX_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**修正首次digest候选成功交接后，下一次维护仍只识别SHA标签的问题。原guard._inspect保留固定仓库/角色/完整ID及显式候选引用的精确检查；旧writer若声明digest，逐次以实际image ID核linux/amd64、RepoDigests和目标revision。入维护前再与准确已封存release的SHA标签或digest二选一对齐；后续停写/登记/启动/交接/事故收尾通过同一检查并核原保存image ID，无新marker字段、发布权威或恢复入口。新增7项离线测试方法未运行，其中一项从真实阶段代码完成第一次交接，再对同一digest容器进入下一计划的freeze与创建意图；Docker/采集/GitHub为替身，尚未完成真实连续两次发布验收。 联合状态批已由[PR #2990](https://github.com/sanqin888/sanqinMVP/pull/2990) 最终head `9737d0e338719cfbbb1017c2c3fc93615ddd6f87` 经 [CI #7662](https://github.com/sanqin888/sanqinMVP/actions/runs/40443398580) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各264、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `efc0afebe595a760471f561012ae320e431da913`。其原LOCAL/未运行为审阅时点，仍未安装或现场验收。

**2026-10-26 当前进度：JOINT_STATUS_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**成功交接已由PR #2989 / CI #7660合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。本批在原release_task.status内增加联合只读观察：同一job/计划锁内读取原计划、唯一发布状态与维护记录；有维护记录即保留未完结语义，无marker且准确目标ACTIVE才核安装合同、环境/状态一致、实际三writer/image digest/健康/角色列表/bind及DB，并重读关键观察拒绝漂移。返回TARGET_RUNNING_OBSERVED也固定operationSuccessProven=false/canExecute=false；它不是clear耐久回执、原策略恢复证明、最新GitHub证明、SQL兼容证明或重试/恢复许可。无新helper、常驻服务、发布状态、包依赖/业务迁移或生产操作；三组研究继续暂停。

> **2026-10-26（America/Toronto）｜优先级文档已由 PR #2978 / CI #7633 合并；MERGED_DEV / MINIMAL_EXECUTOR_SUCCESS_HANDOFF_LOCAL / PRODUCTION_NOT_AUTHORIZED。** 基线 `origin/dev@29004f5b277803b7b4ff597b4456d4b748e4f6f4`（已包含 C1 F4-B13 / PR #2977）。本文件是当前实施顺序、暂停范围与恢复条件的权威入口；不把文档批准等同源码实施、生产安装、数据库或 AWS 操作授权。

## 1. 当前目标与适用范围

**2026-10-26 当前实现：SUCCESS_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`；CI #7657只补缺COMPOSE测试路径后通过。本批新增READY成功交接内部阶段：锁内重核、先持久FINALIZING、只改.env SHA并保留原字节/owner/mode、目标就绪、唯一ACTIVE耐久读回、恢复准确原策略并核验、HANDOFF_COMMITTED后最后清marker。中途失败保留实际版本及INCIDENT；末尾clear未知不伪造冻结或重跑。新增21项离线方法未运行，八helper待统一验真安装，见[顺序/终结未知与缺口](Runtime最小更新执行器实现方案.md)。异步贯通/联合status、准确SQL、隔离/安装与真实发布仍OPEN；本地待审未推送，无生产操作，三组研究暂停保留。

**交付与当前下一步：**[PR #2978](https://github.com/sanqin888/sanqinMVP/pull/2978) 最终 head `d2a739ecf36610fddf80564a26d52d25c053579c` 经 [CI #7633](https://github.com/sanqin888/sanqinMVP/actions/runs/40360253396) SUCCESS（1 成功/9 按文档范围跳过，无修复），合并 dev `343fefc7dce5849ca3401981ee6174f4f9d2ec59`。用户已授权合并后制作方案，现已形成本地[最小更新执行器实现方案](Runtime最小更新执行器实现方案.md)，列出范围、单一控制器/薄 SSH 入口、固定计划流程、四批实现与完结矩阵；待本地审阅，不代表代码已实现或生产已可更新。以下原批“本地/未推送”保留历史时点。

先完成一个适合单人运维的最小更新执行器：GitHub Actions 构建镜像，操作者在一台 MacBook 上通过 SSH 管理现有 Lightsail VM，日常发布以“预检计划一次、确认执行一次”为目标。应用镜像发布与低频平台工具维护分离；不为普通业务更新强制完成整套原 C1→R2→R3→R4→R5 高保证路线。

本次基于 2026-10-26 Runtime 重新评估报告更新文档。用户明确修订三项工作的安排为“先暂停（不取消），等最小更新执行器完成，可以正常进行代码更新后再回来继续进行”。这是实施顺序调整，不是删除长期安全目标或把未完成事项标为通过。

原 R0/G2、C1、R2 文档保留原始证据与适用边界。发生实施顺序/前置依赖冲突时，以本文件为准；已安装控制器、17+Manifest、现有代码 guard 与现场授权仍有效，不能根据本文件绕过。最小执行器采用独立、明确的验收范围，不能宣称原 C1/R2/G2 已关闭。

## 2. 三组暂停项与保留对象

| 工作 | 当前安排 | 保留内容与恢复入口 |
| --- | --- | --- |
| C1 的来源、输入固定、受保护加载研究（含后续装配/持有期接线） | **PAUSED_NOT_CANCELLED / C1_OPEN**；暂停后续研究、接线与专项验收，暂不作为最小执行器的前置条件 | 保留全部代码、测试、来源/批准输入、原始回执及已合并成果；从 [C1 基线](Runtime更新-C1最小可信执行基线对齐与候选准备.md)、[P10-F](Runtime更新-C1-P10-F完整候选装配就绪审计.md)及已合并 F4-B13 处复审继续 |
| 自建 CPython 3.12.15 及完整依赖证明 | **PAUSED_NOT_CANCELLED**；暂停进一步自建解释器、依赖闭包研究和专项证明 | 保留现有 prefix、构建/交付产物、源码、来源与限域验收；不卸载、不清理、不回退已有安装；恢复从 [PREP-12](Runtime更新-C1-PREP-12-Python31215可信构建与交付.md)及证据开始 |
| R2 离机 CAS、CA/CRL、Enrollment、可信时间/跨克隆防护 | **PAUSED_NOT_CANCELLED / R2-C4_OPEN**；暂停新身份/证书/离机权威的后续设计、实现及现场实验 | 保留 Option B/B1、Wire/SQLite/Guard 候选、证书/实验记录与未完成矩阵；恢复从 [R2 阶段计划](Runtime更新-R2阶段审计与B1实施路线-20261026.md)、[B1 审计](Runtime更新-R2-B1可信身份与双层撤销实施前置审计-20261026.md)复审 |

暂停不代表取消、退役、删除、失败或通过。已有 CI 测试和工作流不禁用；已有生产保护、日常备份、未知状态阻断和证据保留继续。原 C1/R2 `OPEN` 与其原路线 `NO-GO/DENY` 保持；这里改变的是它们对当前最小执行器交付的前置地位。

本地发布互斥、准确原策略记录、必要停写与常见重启后的维护门禁仍属最小执行器的数据保护范围；这不等于恢复离机 CAS/PKI 研究，也不得把本机锁或一次 stop 描述为已证明跨重启/跨克隆安全。

## 3. 最小执行器的信任与职责

- 信任操作者、经核验的 SSH 主机身份、受维护的 Ubuntu/root、GitHub 发布链及 AWS 账户。保护重点为误操作、混合版本、并发发布、下载损坏、迁移错误、SSH 中断和常见进程/VM 故障。
- 暂不要求自建恶意 root 对抗、离机身份发行/撤销、可信时间或跨快照/克隆抗回放控制面；本机状态不能提供这些保证，不能改口宣称已覆盖。
- 继续当前部署拓扑：Web、API、共用 API 镜像的 Uber worker、PostgreSQL，以及既有打印和管理设施。不引入微服务、多节点或新的常驻控制服务器。
- 复用已合并的 release_contract、备份/存储核验、readiness、迁移状态解析、启动健康等待与回退镜像认证。没有实际运行合同变化的应用发布，不应仅因打包/审计工具源码变更而强制维护整个平台。
- 解释器候选优先评估现有受支持系统环境并验证真实版本兼容性；暂停自建 3.12.15 证明不等于已经选定或安装替代 Python，也不能擅自修改旧候选的版本 pin。

## 4. 正常更新流程

以下是目标行为，接口尚未实现；不是可直接运行的命令。

1. **预检并固定计划：**选择已完成 main CI 和成对镜像发布的准确 SHA/digest，读取真实已安装工具、当前镜像/发布状态、project/volume/Uploads、环境要求、备份与准确迁移集合。显示实际变化、维护需要、停止条件和计划身份。
2. **操作员确认并执行：**执行前重核当前状态与计划身份；目标、运行配置、迁移集合或关键条件变化则停止，不悄悄改选 latest。获取本机互斥并保存持久进度/日志，拉取并验真镜像。
3. **按本次范围更新：**无迁移不执行 SQL；有迁移只执行明确批准的准确集合，按需要先停写。仅更新 api、ubereats-worker、web，不在 VM 编译镜像、不顺带更新 PostgreSQL 镜像或重建数据卷。
4. **等待并核验：**检查实际容器与存储身份、应用健康、本地/公网 Web、BFF/API、worker 及菜单 smoke；成功后记 ACTIVE。失败/未知记录 PENDING/INCIDENT，停止后续自动发布；已进入停写维护时保持维护，不在 finally 无条件恢复业务。
5. **断线与恢复：**任务应独立于交互 SSH 生命周期并可查询；SSH 断开不能当成取消、失败或重跑许可。进程中断/未明状态先审证据，不盲目续 journal。应用回退需另核镜像、当前数据库/数据语义兼容与操作授权，不自动反向迁移数据库。

main 晋级、生产执行与迁移授权继续由用户分别控制。两次操作的目标适用于普通发布，不把破坏性数据库变更、事故恢复或首次安装伪装成无需审阅的一键操作。

## 5. 平台维护、备份与一次性过渡

应用与平台工具分别登记准确版本及实际运行合同：端口/进程、Compose project、volume/mount、环境键、worker 启动与所需部署器能力。兼容判断核对受信、完整的具体对象，不依赖全仓 compare 是否达到 300 个文件或仅凭一个任意版本号。

当前已安装发布器仍受原 Manifest/来源/祖先/成员校验约束。未来必须以一次受审阅的工具安装完成过渡；不得先手工覆盖两份文件、伪改 Manifest、放宽权限或忽略截断比较来“恢复发布”。具体安装/原子交接方案、准确执行环境和受限任务权限在实现前明确审阅，本批不冻结新的 installer/长期 root launcher。

日常离机备份保持，必要的更新前数据备份与平台重大维护前准确 Lightsail 快照保留；普通镜像更新不重复整套整机灾备验收。AWS 快照/API 未知时按准确对象核对，不选 latest；如需云控制，可评估 Mac 侧受限协调，不默认新增 VM 长期云凭据或网络服务。账户/Region/盘覆盖及真实恢复仍须验证。

涉及原 AWS 快照维护方案的操作，继续保留准确原策略、正常停写、一致恢复点、跨常见重启的维护保护、失败冻结、旧机隔离与人工切流；离机 CAS/CA/CRL 不再是当前交付前置。恢复旧快照不能自动重开业务；移走公网 IP 不足以阻止 worker 外部副作用；营业后新订单/支付不能被旧整盘覆盖。

## 6. 实施顺序、验收与完成条件

当前顺序固定为：**最小执行器设计/实现 → CI 与隔离验收 → 受审阅的一次性工具过渡 → 明确授权的真实应用发布 → 确认可正常更新 → 返回暂停项复审继续**。不再把原 B1-0/B1-1 或 C1 下一研究切片默认为当前下一步。

最小执行器必需覆盖：

- 无迁移发布与准确批准的兼容增量迁移；未知/失败迁移、SQL 不完整时拒绝。
- 镜像/发布证明错误，环境、挂载、备份或计划身份不符时拒绝。
- 并发发布、SSH 断线、执行进程退出、健康失败及停写后的重启门禁；不得从模拟结果推断真实故障已验收。
- 与当前数据库语义兼容的受控镜像回退；一次性工具安装的失败处置。
- 与其实际恢复方式对应的一次可复用恢复验证；未执行真实 AWS 恢复时明确列未验证，不伪装已完成。

最小执行器完成且“可以正常进行代码更新”需要同时满足：源码经 CI/隔离验证；一次性过渡已获批完成；至少一次准确 main 镜像的真实发布与就绪检查成功；操作者可重复预检/执行/查询，有一页失败处置手册，且无未处置 PENDING。尚未执行的现场项保持未完成。

恢复暂停项前，先在最新 dev 上重新核对源码、安装/平台与原证据适用性，记录下一未完成步骤，再继续 C1/CPython/R2 的原目标；不从旧事务、旧证书或旧候选直接执行，不默认过期授权仍有效。本次用户决定确定了返回顺序，**无需再次询问是否永久保留这些项目**；实际源码/依赖/权限变化、远端交付及生产动作仍按各自既有审阅规则办理。完成条件不是定时提醒或自动启动后台任务。

## 7. 本批边界与历史记录

本批仅更新计划、根开发指引、现行 owner 文档、依赖图说明与单条工作日志；没有执行器实现、代码/CI/依赖/锁文件/schema/migration、17 Bundle/Manifest、Guard/CAS/Wire/证书、Docker/systemd/SSH/AWS/数据库变化。MCP-workspace 不执行 lint/build/test，当前无本批新 CI 或现场验证。

所有原 PR、SHA、限域验收和原始证据按原对象保留；不把 F4-B13 合并事实改回未完成，也不把旧正文的历史“下一步/未推送”当当前队列。本地文档完成后停在用户审阅，不自动推送、创建 PR、合并或开始执行器代码实现。
