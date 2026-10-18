# GHCR 发布与 Runtime 状态

R0 进度补充：B4B-3A PR #2848 / merge `dda7698e00effc37e1e8a76aba7c43e50f8f4061` / CI #7315 已通过，仅合成依赖声明图。真实闭包、有限维护禁入、真实 crypt/Drive Kit、安装/独立重装、同候选矩阵仍在 R1–R5；没有新的 installed/production 事实。

> **R0 现行口径（2026-10-17 Toronto）：**用户已批准 D1–D5 推荐方案；[Runtime 更新 R0 冻结设计](../architecture/Runtime更新-R0冻结设计.md) 统一当前决策、门禁与执行顺序。**R0 DESIGN FROZEN / C5-G2 NO-GO / S2 DAILY CONFIG EXPANSION PAUSED**。设计批准不等于真实安装、恢复验收或生产命令授权；S2 暂缓不表示现役备份 timer 已停。

本文汇总截至 2026-10-17 已提交仓库中的发布合同和历史现场证据，不替代操作前对真实主机、已安装源码版本及备份状态的重新核实，也不构成生产变更授权。

## 已记录的现场事实与尚未完成的工作

| 项目 | 仓库已记录的事实 | 限制与后续门禁 |
| --- | --- | --- |
| Runtime / 数据路径 | C4-P2-C 已记录 `/opt/sanq/runtime`、`/srv/sanq/uploads`、`/srv/sanq/backups` 的实际切换 | P2-D 区分有限范围验收与完整服务冷恢复，不能把路径切换等同完整灾备验收 |
| 已安装 Runtime | U1 记录已安装 root-owned Runtime source `a84b72007e6b4e82c981101e56c897355757c0ff`，当时应用镜像已前进到 `ff5be8d5f3fefe2b30861fe59c1b859e110ce3b8` | 这是历史现场证据，本文未重新读取主机；Runtime source SHA 与应用 image SHA 是不同身份，不能互换 |
| 应用发布 | 已记录 checkout-independent GHCR 发布与人工 `PENDING → ACTIVE` 对账 | 曾出现启动 readiness 竞态；其源码修复不等于已更新受保护的生产 Runtime |
| 惰性 staging | C5-B2A 使用外部发布的原始 Archive SHA256 验证及暂存，不要求本地 main 源码逐字节比较 | staging 不安装、不执行、不授权生产写入；其 newest-release 规则不能替代历史版本真实性验证 |
| Runtime 更新与恢复 | 当前方向为独立可信安装及 Abort & Clean Reinstall / Recovery Kit | G2 生产安装仍为 NO-GO；实验通过、声明式清单或 CI 通过都不等于取得安装权限 |
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
- Runtime 安装中断适用独立的 Abort & Clean Reinstall / Recovery Kit 方向，不得借用应用 rollback 作为 Runtime 原事务续跑。普通重启不是强制重装触发条件。
- 不执行 `migrate reset`、`db push`，不删除数据卷、备份、Uploads、VM 快照或历史迁移。

## 当前详细入口

- [Runtime 交付与安装约束](../architecture/Runtime交付与安装约束.md)
- [Runtime 历史决策与证据索引](../architecture/Runtime历史决策与证据索引.md)

- [应用发布与迁移状态解析、旧 Launcher 退役记录](../architecture/postmod-ghcr-deploy-simplification-2026-10-08.md)
- [惰性 Archive staging 约束](../architecture/Runtime交付与安装约束.md#staging)
- [固定布局与外部消费者约束](../architecture/Runtime交付与安装约束.md#layout)
- [G2 当前可信 Runtime 合同与未完成门禁](../architecture/c5-g2-trusted-runtime-contract-2026-10-13.md)
- [Recovery Kit 与中断后的独立重装方向](../architecture/c5-u2d-abort-clean-reinstall-recovery-kit-2026-10-11.md)
- [源码 checkout 退役依赖与独立删除门禁](../architecture/postmod-ghcr-source-retirement-phase2-2026-10-08.md)
- [备份恢复手册](./backup-recovery.zh-CN.md)

各日期化方案只证明其注明时点的设计或验收。冲突时，先区分源码能力、准确已安装版本、历史现场证据与待验收事项；不能直接把较新的源码描述当作生产已部署事实。
