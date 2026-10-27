# GHCR 发布与 Runtime 状态

> **2026-10-26 当前源码进度：START_READINESS_LOCAL / TESTS_NOT_RUN / NOT_INSTALLED。**前批由[PR #2987](https://github.com/sanqin888/sanqinMVP/pull/2987) 最终head `fb9949e54db8de90f7464fc43585187d1bd8b52e` 经 [CI #7655](https://github.com/sanqin888/sanqinMVP/actions/runs/40419873594) SUCCESS（4成功/6范围跳过，默认Python及CPython3.10.22下Release各217、Runtime1080、准确CPython3.12.15回归412），无CI修复，合并dev `067521149fd9104303f09d4c057b4277a489a2cd`。当前本地新增准确ID启动/健康/现有readiness模块，17项离线方法未运行；失败复用同一事故收尾，未知保持PENDING/维护，不清标记或开业务。平台helper共七件待统一验真安装；任务/CLI尚未接入，最终ACTIVE/.env/策略交接、准确SQL和隔离/真实发布均OPEN。READY只是阶段观察，最终同步未知时可能已停候选；启动本身可写业务，不能据维护标记假定零写入或回滚旧盘。见[启动阶段与缺口](../architecture/Runtime最小更新执行器实现方案.md)。未推送/安装或执行真实Docker/HTTP/SQL/AWS，本批17成员/现役文件不变，前批控制器仍须新Bundle正式验真交付。

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
