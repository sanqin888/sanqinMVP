# GHCR 发布与 Runtime 状态

**2026-10-27 当前进度：MIGRATION_EXECUTE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**同一task新增内部execute_registered_migration及锁内主体，原job/计划锁和维护目录FD贯穿批准/时效、唯一PENDING与旧.env、Manifest/运行合同/展开配置、DB/history/备份/准确来源/缓存API digest与SQL inventory重核。只从同一v3/MIGRATION_REGISTERED进入；先耐久STARTING_MIGRATION再start已保存ID并wait，阶段monotonic预算900s（含重核与等待，start至多30s）。wait返回0还须确认同一对象exited/ExitCode=0、无OOM/Dead/Error/重启，以及数据库历史准确增加本计划有序pending对应的applied行、保留原历史含rolled-back行与重复数量，无额外SQL或失败项。复核完成写MIGRATION_VERIFIED，仍保留PENDING/维护标记/原策略禁止重启；不是ACTIVE或恢复许可。

迁移只创建批已由[PR #2995](https://github.com/sanqin888/sanqinMVP/pull/2995) 最终head `b22b4ba0ad66d1eed2f798c02504048d5686e9a6` 经 [CI #7674](https://github.com/sanqin888/sanqinMVP/actions/runs/40512651573) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各315、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `49e1d65705119386b21c79c144bdf30d8c078ed8`。提交前修正Compose美元转义实现为两个美元符号，原回归用例随本head通过。其原LOCAL/未运行描述是原审阅时点，仍未安装/隔离验收。

本批未接submit/run的SQL批准参数或完整异步SQL主线；原CLI仍拒绝pending SQL。后续须在同一批准/维护证据下接迁移后的应用create/start/finalize（实际history已变化，不能伪造原计划或删除SQL拒绝条件），再补受控回退、统一安装/Mac入口、真实隔离中断/恢复与连续双发布验收。九helper件数不变，无新执行器/批准数据库/current权威；17+Manifest/250/300旧guard保持，原controller正式Bundle交付仍待完成。业务schema/迁移/依赖/生产目录和unit不变；三组研究暂停、不取消，未执行生产Docker/systemd/SQL/AWS。

**2026-10-27 当前进度：MIGRATION_CREATE_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原task新增内部prepare_migration_container，持原job/计划锁和维护目录FD贯穿重核、迁移意图、唯一PENDING、只创建、DB/history复核和准确ID登记。锁内重核准确SQL批准、计划时效/原配置/Manifest/运行合同、历史/备份/候选证明/缓存API digest及镜像SQL清单；配置只含一个迁移服务与已有external网络，DATABASE_URL通过原有界私有stdin传入并转义Compose美元符号，不转发JWT等API秘密。固定create --no-build --pull never、180s，不start/SQL/ACTIVE/改.env；未知保留意图/PENDING且禁止重跑。 迁移登记批已由[PR #2994](https://github.com/sanqin888/sanqinMVP/pull/2994) 最终head `531d95036dc55d735ae8a92598cabeaf8b88d1ab` 经 [CI #7672](https://github.com/sanqin888/sanqinMVP/actions/runs/40507815863) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各306、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `0224e0eb7bfba9b762d5098a0da673fa63d81eb2`。原本地未运行/未提交仅为原审阅时点；仍未安装/隔离验收。

**2026-10-27 当前进度：MIGRATION_REGISTRATION_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原guard新增内部begin_migration_creation/register_created_migration，无CLI或任务调用。原FROZEN计划/attempt及独立SQL批准匹配、原writer已停/门禁/备份状态核验后，先将同一维护标记升级v3/MIGRATION_CREATING，容器身份暂空；只允许登记created、restart=no、非auto-remove、无挂载/非privileged、固定网络/名称/命令、准确计划标签/API digest与实际image ID/revision的平台对象。登记后MIGRATION_REGISTERED，不start或执行SQL。事故收尾先处理登记迁移ID再处理原writer；空身份/缺失/额外对象保持FENCE_UNCONFIRMED，不猜ID、不重放或清标记。 SQL审阅批已由[PR #2993](https://github.com/sanqin888/sanqinMVP/pull/2993) 最终head `2d76d1da35ee98bee6183961816622e837a7ac6e` 经 [CI #7670](https://github.com/sanqin888/sanqinMVP/actions/runs/40504787295) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各297、Runtime1080、准确CPython3.12.15回归412），合并dev `afbd7c515e15603d5eff8b588c4f27561a98a578`。首次CI #7669因GitHub blob测试替身未接受token关键字导致CLI成功用例失败，仅补**kwargs后通过，生产逻辑/门禁不变。原LOCAL/未运行是原审阅时点，不等于已安装/隔离验收。

**2026-10-27 当前进度：SQL_REVIEW_BINDING_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**在原plan/collector补准确待执行SQL审阅与批准范围绑定，不新增helper、批准数据库或版本权威。plan.sql_review给出planId/目标/API digest/有序原始SQL元数据及域分离approvalSha256；assert_sql_approval只核独立传入的准确摘要，缺失/布尔/planId/错摘要拒绝，无pending只接受None。原prepare/show摘要新增sqlReview，show-sql按计划gitBlobSha读取固定SanQ GitHub blob，核size/base64/原字节SHA-256和Git blob SHA-1后展示UTF-8原文与准确commit来源；所有SQL核完且完整JSON不超过4MiB才输出。canExecute/sqlSafetyAssessed始终false，摘要不是授权凭证/安全判定，不写批准文件或执行SQL。 无迁移任务贯通已由[PR #2992](https://github.com/sanqin888/sanqinMVP/pull/2992) 最终head `1f9b424056db494930edfa73f7ed950ba70b4607` 经 [CI #7667](https://github.com/sanqin888/sanqinMVP/actions/runs/40501959449) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各284、Runtime1080、准确CPython3.12.15回归412），合并dev `73a8a162325e1dfcba10515541a00837ed8a9937`。首次CI #7666中SQL拒绝测试重复保存原fixture计划而报错，仅把该测试createdAt改成独立时间戳，同分支追加 `1f9b4240` 修复；生产逻辑/门禁未改。原本地未运行/未提交为审阅时点，不代表隔离或生产已通过。

**2026-10-27 当前进度：NO_SQL_TASK_CONNECTED_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**原release_task已接入同一无迁移计划的freeze→create/register→start/readiness→finalize；同一job锁/计划资源锁/维护目录FD贯穿阶段交接，四阶段主体提取为原入口与任务共同使用的内部函数，AST对照确认主体逻辑不变，不复制第二套发布器。执行/排队前拒绝pending SQL和目标等于当前版本；CLI提交确认改为--confirm-release，原--confirm-maintenance不再接受，unit前缀改为sanq-release-apply-，无已安装消费者。仅最终原finalize清标记已知完成返回ACTIVE；保留未知/事故语义。 连续更新修正已由[PR #2991](https://github.com/sanqin888/sanqinMVP/pull/2991) 最终head `f37426a7088be8ff7e189d0995617be5281012ce` 经 [CI #7664](https://github.com/sanqin888/sanqinMVP/actions/runs/40498211632) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各271、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `15fcbdcf1af0adbd32f48875e76073a918c89523`。此前本地未运行/未推送为原审阅时点；仍未安装/隔离验收。

**2026-10-27 当前进度：CONSECUTIVE_UPDATE_FIX_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**修正首次digest候选成功交接后，下一次维护仍只识别SHA标签的问题。原guard._inspect保留固定仓库/角色/完整ID及显式候选引用的精确检查；旧writer若声明digest，逐次以实际image ID核linux/amd64、RepoDigests和目标revision。入维护前再与准确已封存release的SHA标签或digest二选一对齐；后续停写/登记/启动/交接/事故收尾通过同一检查并核原保存image ID，无新marker字段、发布权威或恢复入口。新增7项离线测试方法未运行，其中一项从真实阶段代码完成第一次交接，再对同一digest容器进入下一计划的freeze与创建意图；Docker/采集/GitHub为替身，尚未完成真实连续两次发布验收。 联合状态批已由[PR #2990](https://github.com/sanqin888/sanqinMVP/pull/2990) 最终head `9737d0e338719cfbbb1017c2c3fc93615ddd6f87` 经 [CI #7662](https://github.com/sanqin888/sanqinMVP/actions/runs/40443398580) SUCCESS（4成功/6范围跳过，默认Python/CPython3.10下Release各264、Runtime1080、准确CPython3.12.15回归412），无修复，合并dev `efc0afebe595a760471f561012ae320e431da913`。其原LOCAL/未运行为审阅时点，仍未安装或现场验收。

**2026-10-26 当前进度：JOINT_STATUS_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**成功交接已由PR #2989 / CI #7660合并dev `3391cf495dd9bbb4d56d2ae46648d75c6e2f44b1`。本批在原release_task.status内增加联合只读观察：同一job/计划锁内读取原计划、唯一发布状态与维护记录；有维护记录即保留未完结语义，无marker且准确目标ACTIVE才核安装合同、环境/状态一致、实际三writer/image digest/健康/角色列表/bind及DB，并重读关键观察拒绝漂移。返回TARGET_RUNNING_OBSERVED也固定operationSuccessProven=false/canExecute=false；它不是clear耐久回执、原策略恢复证明、最新GitHub证明、SQL兼容证明或重试/恢复许可。无新helper、常驻服务、发布状态、包依赖/业务迁移或生产操作；三组研究继续暂停。

> **2026-10-26 当前源码进度：SUCCESS_HANDOFF_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批由[PR #2988](https://github.com/sanqin888/sanqinMVP/pull/2988) 最终head `6ca86a55d1aadef814f37d97d9f999212f55608f` 经 [CI #7658](https://github.com/sanqin888/sanqinMVP/actions/runs/40427556642) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各234、Runtime1080、准确CPython3.12.15回归412），合并dev `d87c98b50582fc2ff58165921926433d4710776b`，首次CI #7657测试夹具缺COMPOSE已最小修复。本地新增成功交接：目标.env/唯一ACTIVE/原策略逐项核验，最后HANDOFF_COMMITTED→clear；ACTIVE+维护记录仍是未完结交接/事故，末尾clear未知可能已营业，不能重跑或自动回退旧盘。新增21项离线测试未运行，八helper待统一验真安装；任务/CLI尚未贯通，SQL/回退/联合status/隔离/安装/真实发布仍OPEN，见[当前成功与未知边界](../architecture/Runtime最小更新执行器实现方案.md)。本批未推送/安装，无真实Docker/HTTP/SQL/AWS，固定17成员/现役文件不变。

> **2026-10-26 当前主线：**依用户决定先完成[最小更新执行器与暂停恢复计划](../architecture/Runtime最小更新执行器与暂停恢复计划.md)，以 MacBook/SSH 上“预检一次、确认执行一次”恢复正常代码更新。C1 来源/输入固定/受保护加载、自建 CPython 3.12.15 及完整依赖证明、R2 离机 CAS/CA/CRL/Enrollment/可信时间/跨克隆防护均 **PAUSED_NOT_CANCELLED**；待最小执行器完成且真实发布成功后复审继续。下文描述现役发布器与原高保证路线，不能据此把三项暂停工作重新设为最小执行器前置；现役校验未改，新执行器/工具过渡未完成，本批无部署或生产放行。

原高保证路线进度：已有源码/合成证据按各 PR 原范围保留；仍缺正常执行基线、持续维护、代码快照及真实 AWS 替代恢复组合，C5-G2 NO-GO。当前先完成顶部最小执行器计划，三组暂停工作保留 OPEN；其历史 R1–R5 未完成项不能被误记为最小执行器已经实现/部署。

> **2026-10-18 已批准更新方案：**[AWS 整机快照与维护冻结方案](../architecture/Runtime更新-AWS快照与维护冻结方案.md) 更新 R0 D2–D5：代码创建本次 Lightsail 手动实例快照；拍快照前记录原策略，将准确业务容器设为 `restart=no`、正常停止并禁止启动入口，快照及恢复首启均保持维护态。等快照 `available`、来源/覆盖盘与离机清单核对完成才可安装；成功后按记录恢复策略，故障保持冻结并人工确认快照→新实例。旧 mandatory crypt/Drive preinstall Kit、双 Archive 恢复自举不再重复强制。现役每日备份/escrow、目标包来源校验和真实 AWS 恢复验收保留。**仅设计批准 / 未实现未部署 / C5-G2 NO-GO / S2 扩充后置**；不授权本次生产/AWS 操作。

本文汇总截至 2026-10-17 已提交仓库中的发布合同和历史现场证据，不替代操作前对真实主机、已安装源码版本及备份状态的重新核实，也不构成生产变更授权。

## 已记录的现场事实与尚未完成的工作

| 项目 | 仓库已记录的事实 | 限制与后续门禁 |
| --- | --- | --- |
| Runtime / 数据路径 | C4-P2-C 已记录 `/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups` 的实际切换 | P2-D 区分有限范围验收与完整服务冷恢复，不能把路径切换等同完整灾备验收 |
| 已安装 Runtime | U1 记录已安装 root-owned Runtime source `a84b72007e6b4e82c981101e56c897355757c0ff`，当时应用镜像已前进到 `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | 这是历史现场证据，本文未重新读取主机；Runtime source SHA 与应用 image SHA 是不同身份，不能互换 |
| 应用发布 | 已记录 checkout-independent GHCR 发布与人工 `PENDING → ACTIVE` 对账 | 曾出现启动 readiness 竞态；其源码修复不等于已更新受保护的生产 Runtime |
| 惰性 staging | C5-B2A 使用外部发布的原始 Archive SHA256 验证及暂存，不要求本地 main 源码逐字节比较 | staging 不安装、不执行、不授权生产写入；其 newest-release 规则不能替代历史版本真实性验证 |
| Runtime 更新与恢复 | 已批准代码生成 AWS 手动快照 + 拍快照前容器 no/停服/持续禁入，失败由本次准确快照创建新实例 | 尚未实现/验收；成功按原策略恢复，事故保持冻结。旧 Kit 自举退出必做；设计/CI 不等于生产权限 |
| 旧生产 Git checkout | 目标是解除生产依赖后退役 `/home/ubuntu/sanq-app` | 未完成全部部署/回退、备份、MCP、进程及挂载依赖验证前不得删除；删除必须独立授权 |

事实来源：[C4 路径切换记录](./runtime-backup-cutover-c4-prep.zh-CN.md)、[P2-D 有限范围验收](./runtime-backup-cutover-c4p2d-acceptance.zh-CN.md)、[U2C 历史现场证据](../architecture/Runtime历史决策与证据索引.md#u2c-evidence)、[启动竞态与 Runtime 激活门禁](../architecture/c5-startup-readiness-race-2026-10-09.md)。

## 应用发布合同

- GitHub `main` push 的权威 CI 成功后，`publish-images` 才发布同一完整提交 SHA 的 API/Web 镜像；Uber worker 使用同一 API 镜像。成对发布证明必须包含两个实际 digest；不得用可变标签、单个镜像或未经证明的历史标签替代。
- 生产只拉取经过证明的应用镜像，不在 VM 构建，也不顺带刷新 DB 镜像或重建 PostgreSQL。Compose project 保持 `sanq-app`，DB volume 保持 `sanq-app_pgdata`，API/worker 共享 `/srv/sanq/uploads`，公共 sounds 路径保持不变。
- `.env` 中的 `SANQ_IMAGE_SHA` 是应用 SHA 的单一配置来源；发布状态另记在受保护的 `.sanq-release-state.json`。更新 SHA 不得重写其他配置、泄露凭据或改变 `.env` 的 UID/GID 与限制性权限。
- 应用镜像可以独立前进，仅限已安装 Runtime 的校验、GitHub 来源/祖先关系及 Runtime Bundle 成员无变化等既有条件通过。Runtime 文件变化或比较不完整时阻止发布，先完成独立审阅的 Runtime 安装；不得直接覆写控制器或修改 Manifest 掩盖不一致。
- 变更前核对已安装控制器版本、Runtime Manifest/文件、C4 marker、当前镜像 digest、真实 DB/uploads 挂载、readiness、维护窗口和备份。控制器的本地 DB 备份检查包含不超过 26 小时及 gzip 完整性；操作员仍须独立确认离机备份和恢复可用性，不能仅凭本地文件通过。
- 发布只重建 `api`、`ubereats-worker`、`web`，以 migration parity、容器健康、本地/公网 Web、BFF/API、worker readiness 和公共菜单 smoke 作为完成证据。容器启动不等于部署成功。
- 控制器不自动调 sudo。生产执行、停写、发布和迁移均须明确授权；不新增常驻部署服务、自动拉取、镜像清理、开放 sudo 或新生产目录写权限。

## Prisma 与失败恢复合同

- 候选镜像报告完整且可识别的 clean migration status 时跳过迁移。严格识别的 pending-only 集合默认阻止；只有独立审阅全部 SQL、备份、兼容/数据保留和维护方案后，才可明确授权既有 `--apply-migrations` 路径。未知输出、drift、失败迁移或历史不一致继续阻止。
- `--apply-migrations` 不负责判断 SQL 是否具有破坏性，不适用于 plan/rollback。授权 pending 路径先持久化 PENDING，再停止应用写入者（不停止 DB）、执行候选迁移、确认 parity 后推进应用状态；无 pending 时不为该标记额外停写或迁移。
- 发布或 readiness 失败保留 PENDING，先保存证据并人工处置；不自动回滚数据库、推断财务结果或把迟到成功改成失败。
- 手动 rollback 仍需明确批准、受信任且可用的 previous 本地镜像、备份及 previous-image migration parity。历史 digest/无 checkout 回退验收尚未完成时不得声称回退闭环；不自动拉取未知历史镜像或反向执行 schema 迁移。
- Runtime 更新使用 [AWS 快照与维护冻结方案](../architecture/Runtime更新-AWS快照与维护冻结方案.md)：拍快照前准确容器 no/停服/禁入，代码等本次准确快照 available 才安装；故障保持维护，人工确认快照→新实例。成功按原策略恢复；业务放行后的新写入/支付未知转独立 DR/向前修复。普通重启不是强制恢复触发条件。
- 不执行 `migrate reset`、`db push`，不删除数据卷、备份、Uploads、VM 快照或历史迁移。

## 当前详细入口

- [最小更新执行器实现方案（范围、流程、四批与完结条件）](../architecture/Runtime最小更新执行器实现方案.md)：基于 PR #2978 合并后 dev343fefc7 的本地方案；未实现/未部署。
- [当前优先级与三组研究暂停恢复规则](../architecture/Runtime最小更新执行器与暂停恢复计划.md)：暂停、不取消，正常代码更新恢复后复审继续。

- [Runtime 交付与安装约束](../architecture/Runtime交付与安装约束.md)
- [Runtime 历史决策与证据索引](../architecture/Runtime历史决策与证据索引.md)

- [应用发布与迁移状态解析、旧 Launcher 退役记录](../architecture/postmod-ghcr-deploy-simplification-2026-10-08.md)
- [惰性 Archive staging 约束](../architecture/Runtime交付与安装约束.md#staging)
- [固定布局与外部消费者约束](../architecture/Runtime交付与安装约束.md#layout)
- [G2 当前可信 Runtime 合同与未完成门禁](../architecture/c5-g2-trusted-runtime-contract-2026-10-13.md)
- [旧 Recovery Kit 的替代关系与历史证据](../architecture/c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md)
- [源码 checkout 退役依赖与独立删除门禁](../architecture/postmod-ghcr-source-retirement-phase2-2026-10-08.md)
- [备份恢复手册](./backup-recovery.zh-CN.md)

各日期化方案只证明其注明时点的设计或验收。冲突时，先区分源码能力、准确已安装版本、历史现场证据与待验收事项；不能直接把较新的源码描述当作生产已部署事实。
