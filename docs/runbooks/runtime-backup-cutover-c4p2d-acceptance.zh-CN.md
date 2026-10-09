# C4-P2-D — 新 Runtime 切换后独立恢复、业务实测与最终关闭门禁

**状态：READY FOR READ-ONLY / ISOLATED VERIFICATION；NOT STARTED / NOT PRODUCTION VERIFIED。**

基线：C4-P2-C 已由操作员于 **2026-10-09 UTC（2026-10-08 Toronto 夜间）**完成实际生产切换。业务应用、备份脚本和 Timer 已切到新布局，4/4 Compose 容器 Healthy；C4 **尚未 CLOSED**。本文件定义后续独立的 P2-D 验收，不授予新的生产写入、支付、销毁、清理、数据库 restore 或对外 provider 调用权限。

相关历史证据及回退合同：
- `docs/runbooks/runtime-backup-cutover-c4-prep.zh-CN.md`（Gate 0–6 实施结果）。
- `docs/runbooks/runtime-trusted-manual-install-c4p2a.zh-CN.md`（可信 Runtime/17 文件白名单、P2-A 原始安装合同）。
- `docs/runbooks/backup-recovery.zh-CN.md` 及 `docs/runbooks/backup-recovery.md`（已验证的隔离恢复流程、敏感凭据边界）。
- `AGENTS.md`、`.github/workflows/ci.yml`；本阶段默认为运维验证，不修改源代码、schema 或 migrations。

## 1. 已完成的 P2-C 事实（不重复执行）

| 类别 | P2-C 生产证据 |
| --- | --- |
| Runtime | `/opt/sanq/runtime`，root-owned trusted manifest 17/17；root:root 0644 C4 activation marker |
| Uploads | API/Worker 实际绑定 `/srv/sanq/uploads`；最终旧/新一致性：87 文件、8 目录、136,154,899 bytes；双向 SHA256 missing/extra/mismatch=0 |
| Backups | `/srv/sanq/backups`，ubuntu:ubuntu 0700；复制的 2026-10-08 DB 备份验证 SHA256/gzip，通过后成功执行新布局手动完整备份 |
| 应用与数据库 | Compose project `sanq-app`，原 volume `sanq-app_pgdata`、DB container ID 和应用镜像 SHA `a84b72007e6b4e82c981101e56c897355757c0ff` 未改变；4/4 Healthy；204 migrations up to date |
| 备份批次 | `20261009_033755`，2026-10-09 03:37:55–03:39:55 UTC，systemd `Result=success`、`ExecMainStatus=0` |
| 远端备份 | 每日/当月 PostgreSQL、`gdrive_secure:config`、`gdrive_secure:nginx` 本地与远端解密内容 SHA256 MATCH；TLS 五个成员及配置成员存在；`uploads-current` 87 matching / 0 differences |
| Timer | `active/enabled`；检查时 next `2026-10-09 07:30 UTC`（03:30 Toronto）；原 schedule 不变 |
| 附记 | 停旧 API 时超过 90s grace period，`ExitCode=137`、`OOMKilled=false`；当时无关键支付/待处理 Uber 任务；后续需核对重启后的异常趋势 |

**不得混淆**：2026-10-01/02 旧布局的 isolated recovery drill 已经验证过当时版本和 escrow，但**不能替代**用新布局首份 `20261009_033755` 数据在另一台机器的实际 clean restore。P2-C 的 `rclone cat | sha256sum` 是独立字节比对，不是数据库恢复演练。

## 2. P2-D 工作包与通过标准

### D0 — 生产只读证据冻结 / 运行稳定性

只读记录检查执行时间（UTC/Toronto）、当前镜像 SHA、root-owned Runtime Manifest 及 marker、Compose project、**实际** api/worker Uploads Mount.Source、DB Mount.Name `sanq-app_pgdata`、4 个容器 Healthy、可用磁盘内存、最近 bounded API/worker/Web/Nginx 错误日志。查有无重启循环、上传访问拒绝、旧目录写入、支付 UNKNOWN/RECONCILING、Uber webhook PENDING/PROCESSING。历史 DEAD/FAILED 不能当作本次新增故障。

- PASS：没有新的持久错误循环或存储挂载漂移；新进程可读写它们被授权访问的路径；DB/migrations 未变化。
- FAIL/BLOCKED：容器异常、原 DB 卷变化、活跃长事务或新金融/订单不一致。只保留日志摘要与必要计数，不导出客户/支付敏感内容。
- 如需真实写入探针，只能在另行审批的隔离数据、测试账号/资源下执行；不要把生产订单当作文件权限测试。

### D1 — **20261009_033755** 全套离机 clean restore（核心门禁）

在**独立非生产设备或隔离环境**执行；绝不把真实备份恢复至在线 `sanq-app_pgdata`，也不提前启动 provider/background worker。操作者使用离机 escrow 自行解锁 `gdrive_secure`，凭据和恢复出的 `.env`、私钥不得放进仓库、聊天或共享日志。

1. 用实际生产首次新布局批次 `20261009_033755` 分别取回 `database-daily`、`gdrive_secure:config`、`gdrive_secure:nginx`；`uploads-current` 和一份可核验的历史 `uploads-history` 取回隔离目录。对下载字节做 gzip/tar、体量、SHA256/清单验证，确认 TLS `cf-origin.key` 存在且不回显。
2. 在隔离的 PostgreSQL **15** 空实例中导入该 SQL dump，记录完整导入成功与 `_prisma_migrations` 状态；对照与快照同一时间点的关键业务行数/表的抽样或有效基线，不要求和之后继续写入的实时生产精确相等。
3. 验证 canonical Journal 借贷平衡，必要的 Orders/Payments/Accounting 关联一致；核验被数据库引用的 Accounting binary、Uber report artifact、菜单图片、homepage JSON 的文件存在性和大小/SHA256。不得把 `uploads-history` 直接覆盖到当前 Uploads。
4. 解包恢复出的 `.env`、Compose、Nginx/TLS 到隔离路径，验证生产目标路径合同、固定 Compose 项目与 DB volume 名称、加密恢复可用性；不得接管原生产 DNS、设备、Clover/Uber OAuth/Webhook 或发送真订单。
5. 只在与外部 provider 隔离的环境下按 `DB → API → Web → 最后 Worker` 顺序做有限健康验证。若运行 Worker 可能触发真实 provider 回调或 durable 重放，则**不启动**，以配置静态/数据库队列核验替代；记录该边界，不伪报 provider E2E。
6. 保留脱敏报告：恢复点、归档文件名、哈希对照结果、DB restore exit code、migration/Journals/数据引用检查结果、异常和明确未覆盖的项目。安全清理临时明文和凭据（仅在确认验证证据与备份仍可恢复后，按操作员审阅流程）。

- PASS：备份和加密配置从 VM 外独立取回、解密、**clean restore**、数据库/文件/财务控制校验全通过。
- BLOCKED：仅 `gzip -t`、远端对象存在或在原生产 VM 计算哈希，均不足以关闭 D1。
- 边界：本阶段不是从零搭建新 VM 并计时的端到端 RTO SLO，不宣称 RPO≤24h。

### D2 — 业务渠道和资产 Smoke（不制造真实资金/订单）

分两层记录，不把 GET 健康探针当作业务 E2E：

| 表面 / 合同 | 只读或无副作用验收 | 需要后续单独授权的实测 |
| --- | --- | --- |
| 顾客 Web/PWA | `/health`、公网 BFF/API readiness、公开菜单、首页中英图片/特色展示、购物车展示、登录页导航 | 真实支付下单、积分/余额扣减、退款 |
| Admin / Accounting | 角色授权/导航、既有历史订单、账单/费用列表、附件读取与下载、既有 journal 报表；检查 Uploads URL 无 404 | 上传新账单、录账/冲销、更正 posted 数据 |
| POS 与顾客屏 | 已授权账户下只读页面、设备连接状态、历史订单/打印设置可见性；无新的循环错误 | 真订单、Clover terminal 收款/退款、真实打印 |
| Uber/Fantuan | 现有门店配置、已入库订单/账单/本地 Uber CSV artifact 可读；worker `/ready` 和 backlog 状态 | 真实 webhook/order accept、状态/菜单发布、provider 联调 |
| 静态及文件链路 | menu image、homepage JSON、Accounting/Provider 文件从新 Uploads 实际可读，访问控制正常 | 新上传、覆盖或删除文件 |

- PASS：选定只读工作流可用、无新挂载相关 404/403、持久授权不变。无法在线验证的 provider/POS 正式生产动作必须标 **DEFERRED WITH OWNER**，不得记为 PASS。
- 任意带真实财务/店铺状态副作用的操作，需要独立的样本、金额/交易上限、时间窗口和回滚方案审批；C4-P2-C 授权**不自动覆盖**这些操作。

### D3 — 下一次无人值守定时备份（关键持续性门禁）

监测 P2-C 后首个计划触发：**2026-10-09 07:30 UTC / 03:30 America/Toronto**，以实际 `systemctl list-timers`、`journalctl -u sanq-backup.service` 和 `systemctl show` 时间戳为准。若未来已过该时刻，应只读检查最近结果，不主动二次触发以替代。

- `sanq-backup.timer` active/enabled；`sanq-backup.service` 最近计划批次 `Result=success` / exit 0。
- 新 `/srv/sanq/backups` 生成本地 DB/config/Nginx 文件，`gdrive_backup` / `gdrive_secure` 远端同批次可见、可解密；gzip/成员/哈希对照通过；`uploads-current` 与备份时点一致性核对通过。
- 注意与手动批次 `20261009_033755` **不是同一次**。不能只拿 Gate 5B 手动备份来关闭 D3。
- 失败时保留 timer/service 原始状态和 journal，分析根因；严禁为了伪造成功清除日志、跳过失败项或削弱 retention。

### D4 — 关闭判定与回退资产治理

关闭所需证据：D0 stable + D1 **异机 clean restore** + D2 范围内只读/已授权 smoke + D3 **首次 scheduled backup** 全部 PASS；保存运行时间、SHA、恢复点、哈希和差异报告，以及未验证 provider live E2E 的 deferred 说明。

- 状态流转：`P2-C COMPLETED → P2-D IN VERIFICATION → P2-D VERIFIED → C4 PRODUCTION VERIFIED / CLOSED`；任何缺少证据的步骤标 `PENDING` 或 `BLOCKED`，不可提前关闭。
- 保留原 `/home/ubuntu/sanq-app`（包含旧 Uploads/Backups/source）、root 0700 回退快照 `/opt/sanq/.c4-p2c-rollback.EnD7i3No`、旧 backup.log、可信 Runtime Archive/Manifest 外部证明，**直至 C5 独立清理审计及显式授权**。旧 Uploads 不是新目录的自动镜像，回退前先隔离新写入并核查新旧差量，严禁盲目恢复旧数据或旧 timer。
- 不修改 `SOURCE_FILES`、Prisma/schema/migrations、CI、发布控制器和现有 owner 边界；不因为 P2-D 重开已关闭的 Backup/Recovery §3.2，不将 Uber/Clover 正式 provider approval 混入 C4。
- P2-D 的可执行产物是**脱敏验收记录和例外清单**，不是提前编写会改变生产状态的自动化恢复脚本。

## 3. 建议执行顺序与下一工作会话交接

按 `D0 → D1 → D2 → D3 → D4` 收集证据；D2 的无副作用只读检查可与 D1 并行，D3 依赖真实 scheduled run。执行前先重新检查生产当前时点和运行状态，不使用本文件的历史时间戳冒充新鲜证据。

新会话任务标题建议：**“C4-P2-D — Post-cutover independent restore & business acceptance”**。先只读确认 C4 激活、Timer、4/4 健康、实际挂载及最近新布局备份；随后分批指导离机恢复和范围内业务验收。不要清理 C4-P2-C 回退资产，也不要自动开启任何需生产副作用的实测。
