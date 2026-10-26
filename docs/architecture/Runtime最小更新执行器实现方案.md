# Runtime 最小更新执行器实现方案

> **2026-10-26（America/Toronto）｜PLAN_DOCUMENTED_LOCAL / EXECUTOR_NOT_IMPLEMENTED / PRODUCTION_NOT_AUTHORIZED。**以 `dev@343fefc7dce5849ca3401981ee6174f4f9d2ec59` 为准确基线。前置文档 [PR #2978](https://github.com/sanqin888/sanqinMVP/pull/2978) 的最终 head `d2a739ecf36610fddf80564a26d52d25c053579c` 经 [CI #7633](https://github.com/sanqin888/sanqinMVP/actions/runs/40360253396) SUCCESS（1 成功、9 按文档范围跳过，无修复），已合并。本方案落实[当前优先级与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)，仅制作实现方案，不开始执行器代码或生产操作。

## 1. 范围与交付目标

在现有一台 Lightsail VM、Docker Compose 和 GitHub Actions/GHCR 基础上，交付单人可维护的更新入口。操作者用同一台 MacBook，经核验的 SSH 连接完成“准备计划一次、确认执行一次”；发布任务脱离交互连接运行，可重连查询。接受短暂维护窗口，不以零停机作为首版目标。

首版支持：同一运行配置合同内的应用镜像更新、经过审阅的兼容增量迁移、失败查询与经确认的兼容镜像回退；另完成一次从现役工具到新工具的受审阅过渡。真正的主机 OS/Docker/PostgreSQL 大版本升级、任意 Compose/端口/卷变更、破坏性迁移仍走独立维护方案。

**C1 来源/输入固定/受保护加载、自建 CPython 3.12.15 及完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护继续暂停、不取消。**不删除成果、修改旧候选 pin、禁用已有 CI，或把其 OPEN/NO-GO 改为已通过。最小执行器可复用适合的普通校验，不接回暂停的全量研究链。

## 2. 当前可复用实现与准确缺口

| 现有位置 | 保留复用 | 本项目必须补齐 |
| --- | --- | --- |
| `ops/release/release_contract.py` | main 发布发现、成对 seal、准确 SHA/digest、历史回退证明 | 验证计划指定的 exact SHA，不在执行时重新发现另一个 latest；完整处理证据缺失/失败状态 |
| `ops/release/deploy_release.py` | 固定根路径/owner、Manifest 完整性、C4 marker、真实挂载、备份、迁移解析、健康等待、受控回退 | 真正的预检计划、计划身份与 SQL 清单、进程间互斥、任务状态、受限执行入口及错误清理 |
| `verify_runtime_release` | 已安装 17 文件与原 Manifest 的准确完整性检查 | 取消以全仓 250 commits/300 files 限制代替运行兼容判断；改成指定对象与实际运行合同检查 |
| `plan/deploy` 当前路径 | 使用现有单一发布控制器 | plan 现在在完整 preflight/迁移检查之前返回；deploy 又调用 latest_candidate。必须形成“审阅哪个计划就执行哪个计划” |
| Prisma 状态检查 | 保留严格识别的 clean/pending/未知拒绝，不宽松匹配错误字符串 | 当前只有 bool，需取得准确名称/顺序/SQL 摘要及迁移历史；一个永久 `--apply-migrations` 不代表批准未来任意 SQL |
| `atomic_write`、release-state | 保留 `.env` owner/mode 和 current/previous 语义 | 复核文件与父目录同步、崩溃间隙和未明状态；已有文件 fsync/replace 不是整个发布事务持久性证明 |
| readiness 脚本、Compose | api/worker/web 健康、BFF/API、菜单 smoke；项目/DB/Uploads 身份 | 现场验证依赖、超时与启动先后，不能把容器 starting 当失败或仅凭 healthy 宣布业务正确 |
| CI 的 `ops-checks` | Release/Runtime 单元测试、shell 语法、准确 3.12.15 的已有回归 | 为入选系统执行环境增加聚焦验证；暂停研究不跳过原 CI，不为文档批跑无关 E2E |

以上均来自准确基线源码静态审阅，不代表本次运行或生产已安装。

## 3. 实现归属与最小文件边界

沿用 Runtime/Ops owner 和现有部署拓扑。**只保留一个应用发布控制器**，不复制 NormalUpdateFlow、旧离线实验或再建一份 current/previous 权威。

| 位置（新增名称为方案拟定） | 单一职责 |
| --- | --- |
| 现有 `ops/release/deploy_release.py` | 预检计划、准确候选部署、迁移、应用切换/验证及受控回退 |
| 现有 `ops/release/release_contract.py` | 发布来源、准确 SHA/digest、指定运行文件/声明与兼容判定 |
| 拟新增 `ops/release/release_job.py` | 固定参数的机内一次性任务、锁、计划/阶段记录、维护门禁查询和失败收尾；不拥有另一套业务发布状态 |
| 拟新增 `ops/release/sanq-deploy.sh` | Mac 薄入口，仅固定 SSH 目标/主机校验与 plan/apply/status/logs/rollback 参数；不接受任意 shell/URL/路径 |
| 拟新增 `ops/release/install_minimal_executor.py` | 离线验真准备和一次性平台工具安装/读回/失败处置，独立于普通应用发布，不变成通用 root launcher |
| 对应 `ops/release/tests/**`、现有 CI/必要 unit 模板 | 验证上述真实边界，避免只复制实现的形式测试 |

新增任务辅助程序或 unit 属平台工具独立交付件；**不直接塞入固定 17 文件 Bundle，也不把 installer 变成第 18 项**。首批实施先确定固定交付清单和安装前后兼容，再编码；若确需修改 Bundle/schema/权限，须先提交具体差异，不能作为“顺手接线”。

首选评估生产已维护的 `/usr/bin/python3`（历史 Jammy 回执为 3.10 系列），以真实版本和 Release 回归为准；不是假定 3.10 已兼容。无需重做自建 3.12.15 证明。已有 Python 标准库和系统能力优先，依赖变更另审。

## 4. 固定发布计划与兼容规则

### 4.1 操作入口与计划内容

以下为拟定接口，不是当前可执行命令：

- `sanq-deploy plan`：准备并展示计划，可等待任务完成后返回一个 plan-id。
- `sanq-deploy apply <plan-id>`：确认同一计划并开始执行；有 pending SQL 时，确认须绑定本次准确 SQL 清单。
- `sanq-deploy status <plan-id>` / `logs <plan-id>`：只读查询，断线后使用同一 id。
- `sanq-deploy rollback <plan-id>`：另行形成并审阅 previous 目标回退计划，不等同自动撤销。

计划至少固定：当前发布/工具版本、目标 main SHA、两个 digest 与发布 run/seal、Compose/关键运行合同摘要、当前发布状态、部署所需环境键检查结果（不存 secret）、迁移名称/顺序/原 SQL 摘要、当前数据库迁移历史摘要、备份对象及检查结果、维护范围/停止条件、计划 schema/id/摘要和生成时间。记录存放在 root 私有机内目录，用户输出不包含密钥或原始环境内容。

plan 允许创建受限计划记录、下载候选镜像以及运行一次性 Prisma 只读检查容器；不写业务数据、执行迁移、改变现役 `.env` 或重建业务容器。不能把“无业务变更”描述为整个主机零写入。候选探测只运行固定 Prisma/文件清单命令，不启动应用服务器或 worker。

apply 在锁内再次核对计划原件与摘要、当前版本/状态、运行配置、数据库历史和候选证明；备份时效、资源与可用性重新检查。关键条件变化停止并重新 plan；新发布出现也不擅自替换目标。digest 验证后不再次信任可变 SHA 标签，实际启动前后应核对最终 image ID/digest 与计划一致。切换阶段显式禁止隐式 pull/build，只使用已核验的本地镜像，避免标签变化触发再次取包。预检核对磁盘/镜像与备份空间、可用内存和当前任务；不并行运行两套完整应用，不自动 prune 镜像、数据卷或备份来腾空间，previous 恢复所需镜像保留。

### 4.2 首版兼容范围

1. **已安装工具完整性**继续验全部 17+Manifest，不能改 hash、跳过校验或把新文件冒充旧版本。
2. **应用是否需要平台维护**按运行合同判断。首版只自动接受当前 Compose、project/volume/mount、服务/端口/启动方式与既定 readiness 合同匹配的候选；变化明确显示 NEEDS_PLATFORM_UPDATE，转独立维护，不自动覆盖生产 Compose。
3. 不要求候选的打包器、审计工具、staging 或新部署器源文件与现役逐字相同；这些源码变化本身不要求应用暂停发布。
4. 对受信 exact SHA 逐路径取完整目标对象并比对；Git 祖先关系与文件完整性分别验证。不使用可能截断的全仓 files 列表证明兼容，不简单调大 250/300 阈值，也不把任意版本号当通行证。
5. 环境预检覆盖已声明的必需键、Compose 展开和候选发布审阅中的新增要求；不得声称能从任意应用代码自动识别全部动态环境依赖。未说明的新配置/外部安装需求不进入自动路径。
6. 继续用户控制 dev→main；只部署已完成 main CI/成对发布的准确版本。CI 合格不表示迁移、外部供应商开关或生产配置已获批准。

## 5. 执行流程与失败语义

| 阶段 | 必须完成后才能继续 | 失败处理 |
| --- | --- | --- |
| PREPARE_PLAN | 验源、候选下载/只读探测、运行合同/配置/存储/备份检查和可审阅计划 | BLOCKED；业务不切换 |
| REVALIDATE | 本机独占锁、同一 plan-id、当前基线与准确目标复核 | 拒绝；不改选目标，不争抢另一任务 |
| ARM_MAINTENANCE | 原策略/任务状态先持久化，跨重启门禁生效；与备份任务协调，确认没有未明任务 | 保留记录；未证实停写不能报告 FROZEN |
| STOP_AND_APPLY | 先记录 PENDING；短窗口停应用写入者；有准确授权才执行迁移；DB/卷身份不变 | 保持事故状态，停止继续变更；不反向迁移/恢复旧盘 |
| START_AND_VERIFY | 按计划只更新三应用容器，等待 health、核对 digest/挂载、HTTP/BFF/worker/menu | 按实际阶段停止候选写入者并保留日志；无法确认停止就报告 FENCE_UNCONFIRMED，不能自报维护成功 |
| COMMIT_ACTIVE | 验证结果与原策略读回，完成发布状态和维护标记交接 | 任一持久结果未知保留 PENDING/INCIDENT；不重放旧计划 |
| QUERY_OR_RECOVER | 读取持久状态/真实服务/证据，形成准确恢复或兼容回退计划 | 不自动清标记、重开业务或把 SSH 断开判失败 |

首版对普通应用更新也采用短维护窗口，避免为零停机增加蓝绿/多实例调度。PostgreSQL 不随普通镜像更新重建或升级。无迁移不运行 SQL；兼容新增迁移与无迁移使用同一执行主线，不另建迁移控制器。

`.sanq-release-state.json` 继续是发布 current/previous/phase 的唯一权威；辅助 job 记录仅保存 plan-id、尝试/阶段、进程/服务关联及错误。两个对象任何不一致都阻断，不根据其中一份猜成功。新增记录的 schema/目录/权限、锁与崩溃间隙测试属于第二批实现，不预先承诺无损续跑。

**启动候选就可能发生业务写入。** API 后台任务或 Uber worker 可以在 ACTIVE 之前产生副作用；因此“VERIFYING/尚未放行”不自动等于数据库仍是快照时点。失败时尽快停写并据实对账，不能保证追回已发生动作，不能无条件回滚整机；自动停写失败必须明确报告。

所有资源修改前先持久化意图；重试只允许明确无业务效果的读取或下载。数据库/容器/状态写入结果未知时先核对准确对象，不自动重试整个事务。成功路径也必须测试在写 ACTIVE、恢复原策略、清维护标记之间中断，避免形成假成功或启动窗口。

## 6. SSH 断线、常见重启与权限

选择系统级 transient service 承载已确认的一次性任务，固定服务名前缀/参数，`Restart=no`；不使用绑定 SSH 的 scope/pty/pipe 执行长任务。日志和结果留在 VM，进程退出/重启不会自动重放计划。Mac 不运行常驻 CA/CAS，不新增控制服务器。

常见故障保护采用**本机持久维护标记 + systemd/Docker 启动门禁 + 任务失败收尾**，不借离机权威保证本机标记不可能回退：

- 门禁部署并自检必须先于第一次策略/业务变更。至少验证 Docker service/socket 自动启动、任务被 SIGKILL、VM 重启和 socket 激活入口。
- 一次性任务异常结束采用受限收尾（如 ExecStopPost）尝试停止准确应用写入者；SIGKILL 不依赖 Python finally。OS/管理器失效时，由下一次启动门禁保持拒绝，不能靠 transient unit 自身跨 reboot 留存。
- 真实 Docker live-restore、daemon/containerd/shim 行为先核对；不把停止 daemon 等同停完容器。若与所选门禁不兼容，先报告并在隔离环境验证最小调整，不直接改生产 daemon。
- 原策略含容器 restart、相关任务 enabled/active；逐项记录/读回，不能一律 enable/start。重建容器可能带回 always，必须验证真实新对象与各中断点。
- 必要时事故重启阻断整个 Docker，会暂时影响 Clover 开发隧道；沿用既有安全优先决定，正常维护不主动停止无关开发设施。
- 信任 root/操作者，不自建对直接 root 绕过、克隆旧盘、恶意替换本机状态的防护；手工 Docker/Compose/部署须遵守维护指示。未确认的旁路不能假报已被硬性拦截。

复用现有 SSH 身份和交互 sudo/root 审阅方式；不默认增加 NOPASSWD、放宽 .env/state 权限或开放 MCP sudo。固定子命令的 root 执行、持久目录和 systemd drop-in 是具体新增权限面，在实施批次单独列出读写目标、安装/撤回方式与验证后取得对应授权；当前方案不代替现场授权。

## 7. 一次性工具过渡与恢复

普通应用发布不能更新正在执行的部署工具。第三批交付一个独立、有限、可审阅的 installer，用于首次安装及以后低频平台维护；不接 NormalUpdateFlow 的暂停研究、不在现场拉源码编译。

安装顺序：核对真实主机/系统 Python/已安装 17+Manifest、当前发布和挂载；验证目标准确 main/发布来源与原 Archive；对外置任务/helper/unit 另给固定文件清单和 exact source/digest 证明；在 root 私有位置重新验真（不把用户可写 staging 直接提权执行）；保存当前完整工具/动态状态与恢复记录；建立维护及恢复点；安装非活跃辅助件、执行受审阅的目录交接；完整读回与受控验证后结束维护。不能假称两个目录或全部外部 unit 能一次原子完成，其顺序与各中断点必须测试。

保持 /opt/sanq/runtime 固定真实 root 目录、.env 原 owner/mode、原 current/previous/C4 marker 和 sanq-app_pgdata、/srv/sanq/uploads；不自动删除旧安装、备份、快照、原源码 checkout 或暂停项目材料。恢复点按准确快照/备份对象保存，缺原始可恢复材料不能仅凭一个 hash 宣称恢复就绪。

平台重大维护延用已批准的停写→准确 Lightsail 手动快照→available 核对路线。Mac 侧受限 AWS 协调可减少生产 VM 长期云凭据；不把实现完整 AWS SDK/新 CA 服务作为普通发布前置。首次过渡可由用户与有限 installer 按准确清单完成受控操作，自动化只覆盖已审阅范围，不自动执行恢复/切流。

如安装失败，保持维护并人工选择经核验的工具恢复或准确快照新实例；旧机必须确认停止写入，新机默认不营业、不运行后台外部写入者。存在新订单/付款或 UNKNOWN 时先对账/向前修复，不直接恢复旧整盘。一次可复用的真实恢复验证是第三/四批交付的一部分，不重演无关旧实验。

## 8. 四个实施批次

| 批次 | 范围与交付 | 退出条件 |
| --- | --- | --- |
| **第一批：准确计划与兼容检查** | 复用两个 release 文件，实现 exact 目标、计划字段/SQL 清单、受信逐对象运行合同检查；明确系统 Python、平台辅助件固定清单和最小持久 schema。不创建生产目录或安装 unit | Release/Runtime 对最终 head 的实际 CI 通过；计划能显示准确版本、变化与拒绝原因，300+ 无关文件不再导致误判；错 digest/配置/SQL/状态拒绝；单独通过所选系统 Python 的聚焦回归。此时仍不能生产部署 |
| **第二批：受控执行与失败保护** | 单一控制器接计划；release_job、本机锁/持久阶段、SQL 授权绑定、短停写/镜像切换/验证、状态查询、失败收尾与本机重启门禁 | 模拟 + 隔离 VM 覆盖并发、SIGKILL、SSH 断线、socket/daemon/VM 重启、健康失败、迁移前后未知与 ACTIVE 交接中断；没有 finally 重开业务；外置守卫未部署生产。不能只以单元测试冒充现场保证 |
| **第三批：安装、Mac 入口与一次性过渡准备** | installer、薄 SSH 入口、辅助件交付清单、权限/目录/units 的精确安装与撤回计划、一页 runbook；验证工具与现有应用向后兼容 | 隔离环境真实完成旧→新工具安装、成功发布和中断/恢复；Mac 可在两次操作内完成普通发布并重连查询；准确快照/备份恢复验证及所需生产安装材料可审阅。生产执行仍另批授权 |
| **第四批：现场过渡与最终验收** | 经批准核对真实 VM、完成一次性工具过渡；核对积压变更/环境/迁移及用户控制的 main 晋级，执行准确候选的真实应用发布 | 满足下文全部完结条件；保留准确操作/版本/结果；只在实际通过后标最小执行器完成，再返回三组暂停研究复审 |

每批只建自己的实现/测试和必要 owner 文档；不为“以后可能需要”扩新身份系统或通用框架。固定四批是交付边界，遇实证缺陷在原批次修复，不无限添加小编号或新的完结目标。第一批优先把合同和可运行校验做实，不先重新开启 C1/R2。

每批沿用“本地修改→用户审阅→授权远端→PR 到 dev→最终 head 必需 CI 全绿→合并”。第四批的生产/root/systemd/AWS/数据库授权独立核对。schema 改动如有需要，仍按 AGENTS 由用户生成 Prisma 迁移；本项目不预设业务 schema 改动。

## 9. 固定验收矩阵与完结条件

| 验收项 | 最低证据 |
| --- | --- |
| 正常发布 | 隔离环境无迁移/准确增量迁移两条成功链；生产至少一次准确 main SHA/digest 发布后 ACTIVE 与完整 readiness |
| 准确计划 | 目标不漂移；current/config/SQL/history 变更拒绝；坏 seal/digest/缺文件拒绝；未运行 SQL 不宣称迁移完成 |
| 资源不变量 | DB volume/project/Uploads 不变；只更新三应用容器；API/worker 同镜像，.env 权限和秘密不泄露 |
| 断线与并发 | Mac 断开后原任务可查询且不重复执行；第二个发布被拒绝；锁释放不等于清除未明状态 |
| 故障与维护 | SIGKILL、daemon/VM 重启、socket 激活、health/迁移失败、状态写入中断均有真实隔离结果；不自报未证实停写 |
| 回退与恢复 | 真实验证过的兼容镜像回退；一次性工具中断恢复；与所选快照/备份路线相符的可复用恢复证据 |
| 单人操作 | Mac 普通发布 1–2 次操作，命令不会悄悄换版本；status/logs 和一页事故手册可用；现场无未处置 PENDING/INCIDENT |

**以上全部达到才能标 MINIMAL_EXECUTOR_COMPLETE。**代码合并或 CI 全绿只能标 SOURCE/CI_VERIFIED；隔离试验、生产安装、真实应用更新分别记录。两步发布不包含首次安装、破坏性迁移或事故处置，也不承诺免费/零停机/自动云灾备。

完成后即进入原定的暂停项目复审：重核最新 dev、平台、安装与证据，从原 C1/CPython/R2 的未完成点继续。它们不是最小执行器完结条件；不要求再有另一台控制服务器、独立 CA、可信时间或跨克隆证明才允许结束本项目。

## 10. 本批状态与参考

本批只制作方案并同步已有 owner 入口、依赖图说明及工作日志；没有新执行器、installer、unit、依赖、权限、持久目录、CI、Prisma/迁移、Docker/AWS 或生产变更。本地只做文档差异/相对链接/范围静态审阅，未运行项目测试。分支 `docs/runtime-minimal-executor-implementation-plan-20261026`，未提交/推送本批。

- [当前优先级与暂停恢复计划](Runtime最小更新执行器与暂停恢复计划.md)、[发布手册](../runbooks/GHCR发布与Runtime状态.md)、[安装约束](Runtime交付与安装约束.md)、[AWS 快照/维护合同](Runtime更新-AWS快照与维护冻结方案.md)。
- [现有发布器](../../ops/release/deploy_release.py)、[发布合同](../../ops/release/release_contract.py)、[readiness](../../ops/verify-runtime-readiness.sh)、[CI](../../.github/workflows/ci.yml)。上面新增文件仅为拟定范围，本批未创建这些源码。
- [systemd-run 官方说明](https://www.freedesktop.org/software/systemd/man/latest/systemd-run.html)：transient service 可由服务管理器异步运行；目标 Ubuntu/systemd 实际版本的参数和失败收尾行为须在第二批实测，不能用最新 man page 冒充现场兼容。
- [Docker live restore 官方说明](https://docs.docker.com/engine/daemon/live-restore/)：daemon 不可用时可配置容器继续运行，因此停止 daemon 不能单独证明业务停写。
